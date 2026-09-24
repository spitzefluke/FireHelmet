/* ======================================================
   SKILL-BAUM, ETAPPE 2: BOSS, RENNEN, SCHWARZMARKT
   ---------------------------------------------------
   Drei neue Zweige, je Stufe I (1 Punkt, +5 %), II und III (je
   2 Punkte, +10 %) - zusammen +25 % je Zweig:
     Enterhauer (bossschaden)  mehr Schaden am Community-Boss
     Rueckenwind (rennen)      mehr Fortschritt im Wochenrennen
     Feilscher (shoprabatt)    Rabatt im Schwarzmarkt
   Die Legende verlangt danach alle sechs Stufen III. Wer sie schon
   hat, behaelt sie. Der ganze Baum kostet 37 Punkte.

   WO DIE BONI GREIFEN
   - Boss: HIER auf dem Server. Den Schaden wuerfelt
     app.boss_attack() (Migration 10) - ein Bonus im Browser kaeme
     gar nicht an. Die Funktion wird unten neu gesetzt: WORTGLEICH
     aus 10 uebernommen (per Skript ausgeschnitten), nur mit der
     Variable "skill" und dem Block "Skill-Baum (NEU in 25)". Der
     Deckel von 400 je Angriff bleibt.
   - Rennen: im Browser (race.js), auf den Policy-Deckel von +15 je
     Schritt geklemmt (race_progress_update_own, 03-race-boss.sql).
   - Schwarzmarkt: im Browser (shop.js) - Preise prueft der Server
     ohnehin nicht (bewusste Vereinfachung, siehe CLAUDE.md).

   WARUM DIE ART-REGEL NEU GESETZT WIRD
   skill_nodes_art_bekannt ist eine Positivliste (aus 22); eine
   zweite Bedingung koennte sie nur einschraenken. Also wird genau
   diese eine Regel ersetzt - wie live_grants_art_bekannt in 24.

   REIHENFOLGE: nach 24 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. KNOTEN-ARTEN UND KNOTEN
====================================================== */
alter table public.skill_nodes drop constraint if exists skill_nodes_art_bekannt;
alter table public.skill_nodes add constraint skill_nodes_art_bekannt check (art in
  ('raddublonen', 'slotdublonen', 'xpbonus', 'titel', 'abzeichen',
   'bossschaden', 'rennen', 'shoprabatt'));

insert into public.skill_nodes (node_id, kosten, benoetigt, art, wert, bezeichnung) values
  ('boss1',   1, '{}',        'bossschaden',  5, 'Enterhauer I - +5% Boss-Schaden'),
  ('boss2',   2, '{boss1}',   'bossschaden', 10, 'Enterhauer II - +10% Boss-Schaden'),
  ('boss3',   2, '{boss2}',   'bossschaden', 10, 'Enterhauer III - +10% Boss-Schaden'),
  ('rennen1', 1, '{}',        'rennen',       5, 'Rueckenwind I - +5% Rennfortschritt'),
  ('rennen2', 2, '{rennen1}', 'rennen',      10, 'Rueckenwind II - +10% Rennfortschritt'),
  ('rennen3', 2, '{rennen2}', 'rennen',      10, 'Rueckenwind III - +10% Rennfortschritt'),
  ('markt1',  1, '{}',        'shoprabatt',   5, 'Feilscher I - 5% Rabatt im Schwarzmarkt'),
  ('markt2',  2, '{markt1}',  'shoprabatt',  10, 'Feilscher II - 10% Rabatt im Schwarzmarkt'),
  ('markt3',  2, '{markt2}',  'shoprabatt',  10, 'Feilscher III - 10% Rabatt im Schwarzmarkt'),
  ('legende', 3, '{rad3,slot3,xp3,boss3,rennen3,markt3}', 'titel', 0, 'Legende der sieben Meere')
on conflict (node_id) do update
  set kosten = excluded.kosten, benoetigt = excluded.benoetigt,
      art = excluded.art, wert = excluded.wert, bezeichnung = excluded.bezeichnung;


/* ======================================================
   2. FAKTOR EINES SPIELERS FUER EINE ART
   ---------------------------------------------------
   1 + Summe der Prozente aller freigeschalteten Sterne dieser Art.
   Ohne Zeile oder ohne Sterne: 1. Nur fuer andere SECURITY-
   DEFINER-Funktionen gedacht, deshalb nicht oeffentlich.
====================================================== */
create or replace function app.skill_bonus_faktor(p_uid text, p_art text) returns numeric
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select 1 + coalesce(sum(s.wert), 0) / 100.0
    from public.player_progression p
    join public.skill_nodes s on s.node_id = any(p.unlocked_skills) and s.art = p_art
   where p.firebase_uid = p_uid
$$;
revoke execute on function app.skill_bonus_faktor(text, text) from public;


/* ======================================================
   3. BOSS-ANGRIFF MIT SKILL-BONUS
   ---------------------------------------------------
   Wortgleich aus 10-boss-attacks.sql, ergaenzt um die Variable
   "skill" und den Block "Skill-Baum (NEU in 25)". Rechte und der
   oeffentliche Wrapper aus 10 bleiben unveraendert bestehen.
====================================================== */
create or replace function app.boss_attack(p_month_id text, p_attack text, p_nickname text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, extensions
as $$
declare
  uid       text := app.firebase_uid();
  d         public.boss_attack_defs;
  z         public.boss_attack_state;
  schaden   integer := 0;
  faktor    numeric := 1;
  einzel    jsonb := '{}'::jsonb;
  zuletzt   timestamptz;
  angreifer integer;
  verlust   integer;
  walzen    integer[];
  nach      record;
  nick      text;
  brand_nachgetragen integer := 0;
  skill     numeric := 1;          -- 25: Skill-Baum-Faktor
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into d from public.boss_attack_defs where schluessel = p_attack;
  if not found then
    raise exception 'unbekannter-angriff';
  end if;

  -- Zustandszeile anlegen, falls es die erste Handlung ueberhaupt ist,
  -- und danach sperren.
  insert into public.boss_attack_state (firebase_uid) values (uid)
  on conflict (firebase_uid) do nothing;
  select * into z from public.boss_attack_state where firebase_uid = uid for update;

  brand_nachgetragen := app.boss_brand_verrechnen(uid, p_month_id);
  select * into z from public.boss_attack_state where firebase_uid = uid;

  -- Zwangspause nach Pulverfass / Fass
  if z.ruhe_bis is not null and z.ruhe_bis > now() then
    raise exception 'ruhepause-bis-%', z.ruhe_bis;
  end if;

  if d.art = 'spezial' then
    if not (p_attack = any(z.frei)) then
      raise exception 'nicht-freigeschaltet';
    end if;
    zuletzt := (z.spezial_zuletzt ->> p_attack)::timestamptz;
    if zuletzt is not null and zuletzt + make_interval(hours => d.sperre_h) > now() then
      raise exception 'spezial-gesperrt-bis-%', zuletzt + make_interval(hours => d.sperre_h);
    end if;
  else
    -- Tagessperre. Der gutgeschriebene Zusatzangriff (Enterhaken)
    -- hebt sie genau einmal auf.
    if coalesce((z.letzter_angriff at time zone 'Europe/Berlin')::date, date '1970-01-01') = app.boss_heute() then
      if coalesce(z.zusatz_angriff, 0) <= 0 then
        raise exception 'heute-schon-angegriffen';
      end if;
      update public.boss_attack_state
         set zusatz_angriff = zusatz_angriff - 1 where firebase_uid = uid;
    end if;
  end if;

  /* ---------- Schaden bestimmen ---------- */
  if p_attack in ('saebel','kanone','katapult','moewen') then
    schaden := d.min_schaden + floor(random() * (d.max_schaden - d.min_schaden + 1))::int;
    if p_attack = 'moewen' then
      -- Zweihundert Moewen, jede fuer sich laecherlich. Die Zahl geht
      -- an die Anzeige, damit sie dort auch zweihundert zeichnen kann.
      einzel := jsonb_build_object('moewen', 200);
    end if;

  elsif p_attack = 'enterhaken' then
    schaden := d.min_schaden + floor(random() * (d.max_schaden - d.min_schaden + 1))::int;
    -- Jeder dritte Enterhaken schenkt einen zweiten Angriff. Damit
    -- kommt der Enterhaken ueber drei Tage auf denselben
    -- Erwartungswert wie Saebel und Kanone.
    update public.boss_attack_state
       set enterhaken_zaehler = (enterhaken_zaehler + 1) % 3,
           zusatz_angriff = zusatz_angriff + case when (enterhaken_zaehler + 1) % 3 = 0 then 1 else 0 end
     where firebase_uid = uid
     returning enterhaken_zaehler into angreifer;
    einzel := jsonb_build_object('zusatzAngriff', angreifer = 0);

  elsif p_attack in ('salve','pulverfass','fass') then
    schaden := d.max_schaden;

  elsif p_attack = 'brandpfeil' then
    schaden := d.max_schaden;
    update public.boss_attack_state
       set brand_bis = now() + interval '3 days',
           brand_pro_tag = 30,
           brand_monat = p_month_id,
           brand_letzter_tag = app.boss_heute()
     where firebase_uid = uid;
    einzel := jsonb_build_object('brandTage', 3, 'brandProTag', 30);

  elsif p_attack = 'enterkommando' then
    -- Wie viele haben heute schon zugeschlagen? Aus dem eigenen
    -- Schadensverlauf, nicht aus der Protokolltabelle - die ist
    -- optional und muss nicht eingespielt sein.
    select count(distinct firebase_uid) into angreifer
      from public.community_boss_damage
     where month_id = p_month_id
       and (updated_at at time zone 'Europe/Berlin')::date = app.boss_heute();
    schaden := least(d.max_schaden, d.min_schaden + coalesce(angreifer,0) * 6);
    einzel := jsonb_build_object('angreiferHeute', coalesce(angreifer,0));

  elsif p_attack = 'slot' then
    -- Drei Walzen mit je sechs Symbolen. Drei Totenschaedel (0) sind
    -- der Jackpot, drei gleiche sonst gut, zwei gleiche mager, sonst
    -- nichts. Gewuerfelt wird HIER - der Browser bekommt die Walzen
    -- nur zum Anzeigen zurueck.
    walzen := array[floor(random()*6)::int, floor(random()*6)::int, floor(random()*6)::int];
    if walzen[1] = 0 and walzen[2] = 0 and walzen[3] = 0 then
      schaden := 250;
    elsif walzen[1] = walzen[2] and walzen[2] = walzen[3] then
      schaden := 60;
    elsif walzen[1] = walzen[2] or walzen[2] = walzen[3] or walzen[1] = walzen[3] then
      schaden := 25;
    else
      schaden := 0;
    end if;
    einzel := jsonb_build_object('walzen', to_jsonb(walzen));

  elsif p_attack = 'rechnung' then
    -- Was heute in der Spielothek verloren ging. Die Tabelle gehoert
    -- zum rein zusaetzlichen Protokoll und muss nicht da sein.
    if to_regclass('public.spielothek_rounds') is not null then
      execute $q$
        select coalesce(sum(greatest(0, bet_amount - payout_amount)), 0)
          from public.spielothek_rounds
         where firebase_uid = $1
           and (played_at at time zone 'Europe/Berlin')::date = app.boss_heute()
      $q$ into verlust using uid;
    else
      verlust := 0;
    end if;
    schaden := least(d.max_schaden, coalesce(verlust, 0));
    einzel := jsonb_build_object('verlustHeute', coalesce(verlust,0));

  elsif p_attack = 'schlachtruf' then
    schaden := 0;
    select nickname into nick from public.community_boss_damage
      where month_id = p_month_id and firebase_uid = uid limit 1;
    insert into public.boss_community_buff (month_id, art, faktor, bis, von_uid, von_nickname)
         values (p_month_id, 'schlachtruf', 1.5, now() + interval '24 hours', uid, nick);
    einzel := jsonb_build_object('faktor', 1.5, 'stunden', 24);

  elsif p_attack = 'seemannslied' then
    schaden := 0;
    select nickname into nick from public.community_boss_damage
      where month_id = p_month_id and firebase_uid = uid limit 1;
    insert into public.boss_community_buff (month_id, art, faktor, bis, von_uid, von_nickname)
         values (p_month_id, 'seemannslied', 2.0, now() + interval '12 hours', uid, nick);
    einzel := jsonb_build_object('faktor', 2.0, 'stunden', 12);

  else
    raise exception 'unbehandelter-angriff-%', p_attack;
  end if;

  /* ---------- Skill-Baum (NEU in 25) ----------
     Der Server liest die freigeschalteten Sterne selbst - der
     Browser kann hier nichts behaupten. Danach greift wie bisher die
     gemeinsame Verstaerkung, und der Deckel von 400 gilt fuer beides. */
  if schaden > 0 then
    skill := app.skill_bonus_faktor(uid, 'bossschaden');
    if skill > 1 then
      schaden := least(400, round(schaden * skill)::int);
      einzel := einzel || jsonb_build_object('skill', skill);
    end if;
  end if;

  /* ---------- Gemeinsame Verstaerkung ---------- */
  if schaden > 0 then
    faktor := app.boss_buff_faktor(p_month_id);
    if faktor > 1 then
      schaden := least(400, round(schaden * faktor)::int);
      einzel := einzel || jsonb_build_object('verstaerkt', faktor);
    end if;
  end if;

  -- Sicherheitsnetz: der Katalogdeckel ist zugleich der Policy-Deckel.
  schaden := greatest(0, least(400, schaden));

  /* ---------- Verrechnen ---------- */
  perform set_config('app.boss_rpc', 'ja', true);

  if schaden > 0 then
    update public.community_boss
       set hp = greatest(0, community_boss.hp - schaden),
           defeated = community_boss.defeated or (community_boss.hp - schaden <= 0)
     where month_id = p_month_id
     returning community_boss.hp, community_boss.max_hp, community_boss.defeated into nach;
  else
    select community_boss.hp, community_boss.max_hp, community_boss.defeated into nach
      from public.community_boss where month_id = p_month_id;
  end if;

  if nach.hp is null then
    raise exception 'kein-boss-fuer-%', p_month_id;
  end if;

  /* Die persoenliche Schadenssumme gehoert MIT hier hinein, nicht in
     einen zweiten Aufruf vom Browser aus: die Policy laesst dort nur
     45 auf einmal zu, und die hoehere Grenze gilt ausschliesslich
     innerhalb dieser Transaktion (Sitzungsmarke oben). Ein
     Spezialangriff mit 400 Schaden waere sonst zwar beim Boss
     angekommen, in der Rangliste aber nicht.

     Der Anzeigename kommt vom Client - er steht nirgends sonst
     zuverlaessig. Fehlt er, bleibt der bisherige stehen. */
  if schaden > 0 then
    insert into public.community_boss_damage (month_id, firebase_uid, nickname, total_damage)
         values (p_month_id, uid, coalesce(nullif(btrim(p_nickname), ''), 'Pirat'), schaden)
    on conflict (month_id, firebase_uid) do update
       set total_damage = public.community_boss_damage.total_damage + schaden,
           nickname = coalesce(nullif(btrim(p_nickname), ''), public.community_boss_damage.nickname),
           updated_at = now();
  end if;

  /* ---------- Zustand fortschreiben ---------- */
  update public.boss_attack_state
     set letzter_angriff = case when d.art = 'grund' then now() else letzter_angriff end,
         spezial_zuletzt = case when d.art = 'spezial'
                                then spezial_zuletzt || jsonb_build_object(p_attack, now())
                                else spezial_zuletzt end,
         ruhe_bis = case when d.ruhe_h > 0 then now() + make_interval(hours => d.ruhe_h) else ruhe_bis end,
         aktualisiert = now()
   where firebase_uid = uid;

  return jsonb_build_object(
    'angriff', p_attack,
    'art', d.art,
    'schaden', schaden,
    'hp', nach.hp,
    'maxHp', nach.max_hp,
    'besiegt', nach.defeated,
    'brandNachgetragen', brand_nachgetragen,
    'einzel', einzel
  );
end;
$$;
