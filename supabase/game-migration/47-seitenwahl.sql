/* ======================================================
   ZEITMASCHINE 2100, ETAPPE 2: SEITENWAHL
   ---------------------------------------------------
   In der Epoche 2100 (Migration 46) waehlt jeder angemeldete Spieler
   EINMAL und endgueltig eine Seite: 'menschen' oder 'aliens'. Die
   Seite bringt Vor- und Nachteile - nur solange 2100 gilt.

   1. EPOCHE JETZT
      app.epoche_jetzt() liefert '2026', '1720' oder '2100' nach
      derselben Regel wie der Browser (live-storys.js): es gilt die
      zuletzt ERREICHTE Zeitmarke aus live_event.

   2. SPALTE players.seite
      null = noch nicht gewaehlt. Gesetzt wird sie nur ueber
      seite_waehlen() (SECURITY DEFINER, umgeht RLS) oder vom Admin
      (admin_seite_setzen). Eine zweite, RESTRICTIVE Policy friert sie
      fuer jedes normale UPDATE ein und haelt sie bei einem INSERT leer
      - wie die Kosmetik-Regel in 45, valid_players_write() bleibt
      unberuehrt.

   3. WOCHENRENNEN RUHT IN 2100
      Zusaetzliche RESTRICTIVE Policies auf race_progress: solange
      2100 gilt, nimmt die Datenbank keinen Renn-Fortschritt an. Die
      Regeln aus 03 bleiben, wie sie sind.

   4. BOSS
      Den Boss-Schaden wuerfelt der Server (app.boss_attack). Neue
      Fassung WORTGLEICH aus 25, nur mit der Variable "seite_f" und
      dem Block "Seite in 2100 (NEU in 47)": Aliens +15 % und
      Kampf-Skills 1,5-fach, Menschen -10 %. Der Deckel von 400 je
      Angriff bleibt.

   Alle anderen Boni (Rad, Shop, Spielothek, XP) rechnet der Browser
   (scripts/seiten/seiten.js) - die Dublonen-Deckel aus
   valid_players_write() gelten unveraendert.

   REIHENFOLGE: nach 46 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. EPOCHE JETZT
====================================================== */
create or replace function app.epoche_jetzt() returns text
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select case
    when e.jahr_2100_ab is not null and e.jahr_2100_ab <= now()
         and (e.jahr_1720_ab is null or e.jahr_1720_ab > now() or e.jahr_1720_ab <= e.jahr_2100_ab) then '2100'
    when e.jahr_1720_ab is not null and e.jahr_1720_ab <= now() then '1720'
    else '2026'
  end
  from (select (select jahr_1720_ab from public.live_event where id = 1) as jahr_1720_ab,
               (select jahr_2100_ab from public.live_event where id = 1) as jahr_2100_ab) e
$$;
revoke execute on function app.epoche_jetzt() from public, anon;
grant  execute on function app.epoche_jetzt() to authenticated;


/* ======================================================
   2. SEITE
====================================================== */
alter table public.players add column if not exists seite text;
alter table public.players drop constraint if exists players_seite_bekannt;
alter table public.players add constraint players_seite_bekannt
  check (seite is null or seite in ('menschen', 'aliens'));

/* Normales UPDATE: Seite unveraendert. INSERT: noch keine Seite. */
create or replace function app.valid_players_seite(p_uid text, new_row public.players) returns boolean
language plpgsql stable
set search_path = public, app, pg_temp
as $$
begin
  return new_row.seite is not distinct from (app.old_player(p_uid)).seite;
end;
$$;
revoke all on function app.valid_players_seite(text, public.players) from public, anon;
grant  execute on function app.valid_players_seite(text, public.players) to authenticated;

drop policy if exists players_seite_update on public.players;
create policy players_seite_update on public.players
  as restrictive for update to authenticated
  using (true)
  with check (app.valid_players_seite(firebase_uid, players.*));

drop policy if exists players_seite_insert on public.players;
create policy players_seite_insert on public.players
  as restrictive for insert to authenticated
  with check (seite is null);

/* Waehlen: nur in 2100, nur einmal. Antwort {ok, seite} oder {ok:false, grund}. */
create or replace function app.seite_waehlen(p_seite text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  alt text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_seite is null or p_seite not in ('menschen', 'aliens') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if app.epoche_jetzt() <> '2100' then
    return jsonb_build_object('ok', false, 'grund', 'nicht-2100');
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;

  insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
  select seite into alt from public.players where firebase_uid = uid for update;
  if alt is not null then
    return jsonb_build_object('ok', false, 'grund', 'schon', 'seite', alt);
  end if;
  update public.players set seite = p_seite where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'seite', p_seite);
end
$$;

create or replace function public.seite_waehlen(p_seite text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.seite_waehlen(p_seite) $$;

/* Admin: Seite eines Spielers setzen oder zuruecksetzen (null). */
create or replace function app.admin_seite_setzen(p_uid text, p_seite text) returns text
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_seite is not null and p_seite not in ('menschen', 'aliens') then
    raise exception 'unbekannte-seite';
  end if;
  update public.players set seite = p_seite where firebase_uid = p_uid;
  if not found then
    raise exception 'spieler-unbekannt';
  end if;
  return p_seite;
end
$$;

create or replace function public.admin_seite_setzen(p_uid text, p_seite text) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_seite_setzen(p_uid, p_seite) $$;

/* Boss-Faktor der Seite (nur fuer boss_attack): ausserhalb 2100 immer 1. */
create or replace function app.seite_boss_faktor(p_uid text) returns numeric
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select case
    when app.epoche_jetzt() <> '2100' then 1
    when p.seite = 'aliens' then 1.15
    when p.seite = 'menschen' then 0.90
    else 1
  end
  from (select (select seite from public.players where firebase_uid = p_uid) as seite) p
$$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.seite_waehlen(text)               from public, anon;
revoke execute on function public.seite_waehlen(text)            from public, anon;
revoke execute on function app.admin_seite_setzen(text, text)    from public, anon;
revoke execute on function public.admin_seite_setzen(text, text) from public, anon;
revoke execute on function app.seite_boss_faktor(text)           from public, anon, authenticated;
grant  execute on function app.seite_waehlen(text)               to authenticated;
grant  execute on function public.seite_waehlen(text)            to authenticated;
grant  execute on function app.admin_seite_setzen(text, text)    to authenticated;
grant  execute on function public.admin_seite_setzen(text, text) to authenticated;


/* ======================================================
   3. WOCHENRENNEN RUHT IN 2100
====================================================== */
drop policy if exists race_progress_ruht_2100_insert on public.race_progress;
create policy race_progress_ruht_2100_insert on public.race_progress
  as restrictive for insert to authenticated
  with check (app.epoche_jetzt() <> '2100');

drop policy if exists race_progress_ruht_2100_update on public.race_progress;
create policy race_progress_ruht_2100_update on public.race_progress
  as restrictive for update to authenticated
  using (true)
  with check (app.epoche_jetzt() <> '2100');


/* ======================================================
   4. BOSS-ANGRIFF MIT SEITE
   ---------------------------------------------------
   Wortgleich aus 25-skilltree-etappe2.sql, ergaenzt um die Variable
   "seite_f" und den Block "Seite in 2100 (NEU in 47)". Rechte und
   der oeffentliche Wrapper aus 10 bleiben unveraendert bestehen.
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
  seite_f   numeric := 1;          -- 47: Seite in der Epoche 2100
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
    /* ---------- Seite in 2100 (NEU in 47) ----------
       Aliens: Kampf-Skills wirken 1,5-fach, dazu +15 %. Menschen: -10 %.
       Ausserhalb der Epoche 2100 ist der Faktor 1. */
    seite_f := app.seite_boss_faktor(uid);
    if seite_f > 1 then
      skill := 1 + (skill - 1) * 1.5;
    end if;
    if skill * seite_f <> 1 then
      schaden := least(400, round(schaden * skill * seite_f)::int);
      if skill > 1 then einzel := einzel || jsonb_build_object('skill', skill); end if;
      if seite_f <> 1 then einzel := einzel || jsonb_build_object('seite', seite_f); end if;
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
