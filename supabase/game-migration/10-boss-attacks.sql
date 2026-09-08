/* ======================================================
   BOSS: ANGRIFFSARTEN UND SPEZIALANGRIFFE
   ---------------------------------------------------
   Bis hierher galt: der Client wuerfelt den Schaden und schickt ihn,
   der Server deckelt bei 45. Das hat zwei Loecher, die mit
   Spezialangriffen unhaltbar werden:

   1. Die TAGESSPERRE stand nur im localStorage des Browsers
      (hasAttackedToday() in community-boss.js). Wer ihn leert, greift
      beliebig oft an - jedes Mal bis zu 45 Schaden.
   2. Der SCHADEN kam vom Client. Solange alle Angriffe denselben
      Deckel haben, kostet das nur Genauigkeit. Sobald ein
      Spezialangriff 400 machen darf, muesste der Deckel auf 400 -
      und dann darf ihn jeder jederzeit ausschoepfen.

   Beides loest dieselbe Umkehrung: der Client sagt nur noch, WELCHEN
   Angriff er fuehrt. Alles andere - Berechtigung, Sperren, Wuerfeln,
   Verrechnen - macht der Server in public.boss_attack().

   WAS HIER NEU DAZUKOMMT
   - boss_attack_defs      Der Katalog. Die einzige Stelle mit Zahlen.
   - boss_attack_state     Je Spieler: Freischaltungen und Sperren.
   - boss_community_buff   Schlachtruf und Seemannslied wirken fuer
                           alle - deshalb nicht beim Spieler.
   - boss_special_codes    Die Geheimcodes, nur als SHA-256. Der
                           Klartext steht NIRGENDS im Browser.
   - public.boss_attack()          fuehrt einen Angriff aus
   - public.boss_unlock_special()  loest einen Geheimcode ein
   - public.boss_attack_status()   was darf ich gerade, und wann wieder

   REIHENFOLGE: nach 03-race-boss.sql einspielen (setzt
   community_boss und community_boss_damage voraus).

   RUECKWAERTSKOMPATIBEL: der alte Aufruf attack_community_boss()
   bleibt unveraendert bestehen. Der Client benutzt ihn weiter, solange
   diese Migration nicht eingespielt ist - die Seite laeuft also
   sofort, und der neue Weg schaltet sich von selbst frei, sobald die
   Funktionen da sind.
====================================================== */


/* ======================================================
   1. DER KATALOG
   ---------------------------------------------------
   Alle Zahlen an EINER Stelle, und zwar auf dem Server. Der Browser
   liest sie ueber die Ansicht weiter unten, damit die Anzeige nicht
   von einer zweiten, irgendwann abweichenden Liste in JavaScript
   lebt.

   art:      'grund'   taeglich, frei waehlbar
             'spezial' nur nach Codeeinloesung
   min/max:  Schadensspanne. Gleich = fester Wert.
   sperre_h: Stunden bis zur naechsten Nutzung DIESES Angriffs.
   ruhe_h:   Stunden, in denen danach GAR NICHT angegriffen werden
             darf (Pulverfass, Fass).
====================================================== */
create table if not exists public.boss_attack_defs (
  schluessel   text primary key,
  art          text not null check (art in ('grund','spezial')),
  min_schaden  integer not null check (min_schaden >= 0),
  max_schaden  integer not null check (max_schaden >= 0),
  sperre_h     integer not null default 0 check (sperre_h >= 0),
  ruhe_h       integer not null default 0 check (ruhe_h >= 0),
  sortierung   integer not null default 0,

  constraint boss_attack_defs_spanne check (max_schaden >= min_schaden),
  -- Der Deckel der Policy weiter unten. Nichts im Katalog darf
  -- darueber liegen, sonst schlaegt der Angriff spaeter fehl.
  constraint boss_attack_defs_deckel check (max_schaden <= 400)
);

insert into public.boss_attack_defs
  (schluessel, art, min_schaden, max_schaden, sperre_h, ruhe_h, sortierung) values
  -- --- Grundangriffe: gleicher Erwartungswert, andere Handschrift ---
  ('saebel',        'grund',   28,  32,   0,   0,  10),
  ('kanone',        'grund',   10,  50,   0,   0,  20),
  ('enterhaken',    'grund',   20,  26,   0,   0,  30),
  -- --- Spezialangriffe ---
  ('salve',         'spezial', 90,  90, 168,   0, 110),
  ('brandpfeil',    'spezial', 30,  30, 168,   0, 120),
  ('enterkommando', 'spezial', 20, 120, 168,   0, 130),
  ('pulverfass',    'spezial',140, 140, 168,  24, 140),
  ('schlachtruf',   'spezial',  0,   0, 168,   0, 150),
  ('fass',          'spezial',400, 400, 720, 168, 160),
  ('slot',          'spezial',  0, 250, 168,   0, 170),
  ('moewen',        'spezial', 60, 140, 168,   0, 180),
  ('katapult',      'spezial', 70,  95, 168,   0, 190),
  ('seemannslied',  'spezial',  0,   0, 168,   0, 200),
  ('rechnung',      'spezial',  0, 150, 168,   0, 210)
on conflict (schluessel) do update set
  art = excluded.art,
  min_schaden = excluded.min_schaden,
  max_schaden = excluded.max_schaden,
  sperre_h = excluded.sperre_h,
  ruhe_h = excluded.ruhe_h,
  sortierung = excluded.sortierung;

alter table public.boss_attack_defs enable row level security;
alter table public.boss_attack_defs force row level security;

-- Der Katalog ist keine Geheimnis: wer die Seite oeffnet, soll sehen,
-- was es gibt - auch was er noch nicht hat.
drop policy if exists "boss_attack_defs_lesen" on public.boss_attack_defs;
create policy "boss_attack_defs_lesen" on public.boss_attack_defs
  for select to anon, authenticated using (true);
-- Kein insert/update/delete fuer Spieler.


/* ======================================================
   2. ZUSTAND JE SPIELER
   ---------------------------------------------------
   Bewusst NICHT vom Spieler beschreibbar - es gibt gar keine
   Schreib-Policy. Alle Aenderungen laufen ausschliesslich ueber die
   Funktionen weiter unten. Wuerde der Spieler hier selbst schreiben
   duerfen, koennte er sich jeden Spezialangriff eintragen.
====================================================== */
create table if not exists public.boss_attack_state (
  firebase_uid       text primary key,
  frei               text[] not null default '{}',   -- freigeschaltete Spezialangriffe
  letzter_angriff    timestamptz,                    -- Tagessperre
  zusatz_angriff     integer not null default 0,     -- Enterhaken: gutgeschriebener zweiter Angriff
  enterhaken_zaehler integer not null default 0,     -- jeder dritte gibt den Zusatz
  spezial_zuletzt    jsonb not null default '{}'::jsonb,  -- {schluessel: zeitpunkt}
  ruhe_bis           timestamptz,                    -- Pulverfass / Fass
  brand_bis          timestamptz,                    -- Brandpfeil laeuft noch
  brand_monat        text,
  brand_pro_tag      integer not null default 0,
  brand_letzter_tag  date,
  aktualisiert       timestamptz not null default now()
);

alter table public.boss_attack_state enable row level security;
alter table public.boss_attack_state force row level security;

-- Nur der eigene Stand, und nur lesend.
drop policy if exists "boss_attack_state_eigener" on public.boss_attack_state;
create policy "boss_attack_state_eigener" on public.boss_attack_state
  for select to authenticated
  using (firebase_uid = app.firebase_uid());


/* ======================================================
   3. GEMEINSAME VERSTAERKUNG
   ---------------------------------------------------
   Schlachtruf und Seemannslied wirken fuer ALLE. Sie gehoeren
   deshalb nicht zum Spieler, sondern zum Monat.

   faktor gilt bis "bis". Laufen zwei gleichzeitig, gewinnt der
   groessere - sie multiplizieren sich NICHT. Sonst waere ein
   abgesprochenes Doppel im Stream ein Vielfaches statt einer
   Verstaerkung.
====================================================== */
create table if not exists public.boss_community_buff (
  id           bigint generated always as identity primary key,
  month_id     text not null check (month_id ~ '^\d{4}-\d{2}$'),
  art          text not null,
  faktor       numeric(4,2) not null check (faktor >= 1 and faktor <= 3),
  bis          timestamptz not null,
  von_uid      text,
  von_nickname text,
  erstellt     timestamptz not null default now()
);

create index if not exists boss_community_buff_aktiv_idx
  on public.boss_community_buff (month_id, bis desc);

alter table public.boss_community_buff enable row level security;
alter table public.boss_community_buff force row level security;

-- Oeffentlich lesbar: die Seite zeigt an, dass gerade ein Schlachtruf
-- laeuft und von wem.
drop policy if exists "boss_community_buff_lesen" on public.boss_community_buff;
create policy "boss_community_buff_lesen" on public.boss_community_buff
  for select to anon, authenticated using (true);


/* ======================================================
   4. DIE GEHEIMCODES
   ---------------------------------------------------
   Nur als SHA-256. Der Klartext steht weder in dieser Datei noch im
   Browser - anders als bei den Dublonen-Codes, wo die Hashes im
   Client liegen und jemand mit Ausdauer eine Wortliste durchhashen
   kann. Hier kommt der Code gar nicht erst beim Client vorbei: er
   wird eingetippt, an den Server geschickt, dort gehasht und
   verglichen.

   Die Zeilen legt der Betreiber selbst an (siehe README am Ende
   dieser Datei) - so steht auch im Repository kein Hash, aus dem
   sich mit einer Wortliste etwas gewinnen liesse.
====================================================== */
create table if not exists public.boss_special_codes (
  code_sha256 text primary key check (code_sha256 ~ '^[0-9a-f]{64}$'),
  schluessel  text not null references public.boss_attack_defs(schluessel),
  bemerkung   text,
  erstellt    timestamptz not null default now()
);

alter table public.boss_special_codes enable row level security;
alter table public.boss_special_codes force row level security;
-- KEINE select-Policy: niemand ausser den Funktionen unten (die als
-- SECURITY DEFINER laufen) bekommt diese Tabelle je zu sehen.


/* ======================================================
   5. HOEHERER DECKEL - ABER NUR AUF DEM SERVERWEG
   ---------------------------------------------------
   Die bisherige Policy erlaubt hoechstens 45 HP Abzug pro Schreib-
   vorgang. Das war der einzige Schutz und muss es fuer den DIREKTEN
   Weg auch bleiben.

   public.boss_attack() setzt vor dem Update eine Sitzungsmarke, die
   nur INNERHALB der laufenden Transaktion gilt (set_config mit
   is_local = true). PostgREST fuehrt jede Anfrage in genau einer
   Transaktion aus - die Marke kann also nicht von einer Anfrage in
   die naechste ueberdauern, und es gibt keine oeffentliche Funktion,
   die sie setzen wuerde ausser dieser einen.

   Ergebnis: direkt geschrieben gilt weiter der 45er-Deckel,
   ueber boss_attack() der Katalogdeckel von 400.
====================================================== */
create or replace function app.boss_rpc_aktiv() returns boolean
language sql stable
as $$ select coalesce(current_setting('app.boss_rpc', true), '') = 'ja' $$;

drop policy if exists "community_boss_update" on public.community_boss;
create policy "community_boss_update" on public.community_boss
  for update to authenticated
  using (true)
  with check (
    hp >= 0
    and (
      hp >= coalesce((app.old_community_boss(month_id)).hp, 0) - 45
      or (app.boss_rpc_aktiv()
          and hp >= coalesce((app.old_community_boss(month_id)).hp, 0) - 400)
    )
  );

/* ACHTUNG - KEIN UPSERT AUF DIESE TABELLE.
   "insert ... on conflict do update" (das, was supabase-js aus
   .upsert() macht) prueft in Postgres BEIDE Regelsaetze am neuen
   Datensatz: die update-Regel UND die insert-Regel. Die insert-Regel
   begrenzt hier aber den ABSOLUTEN Wert, die update-Regel nur den
   SCHRITT. Sobald der Zaehler ueber dem Startwert steht, wird deshalb
   jedes Upsert abgelehnt (PostgREST: 403), obwohl der Schritt selbst
   erlaubt ist. Der Client schickt darum bewusst getrenntes
   insert()/update(), siehe supabaseZaehlerSchreiben() in
   scripts/supabase/supabase-client.js. */

drop policy if exists "boss_damage_insert_own" on public.community_boss_damage;
create policy "boss_damage_insert_own" on public.community_boss_damage
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and (total_damage <= 45 or (app.boss_rpc_aktiv() and total_damage <= 400))
  );

drop policy if exists "boss_damage_update_own" on public.community_boss_damage;
create policy "boss_damage_update_own" on public.community_boss_damage
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (
    firebase_uid = app.firebase_uid()
    and (
      total_damage <= coalesce((app.old_boss_damage(month_id, firebase_uid)).total_damage, 0) + 45
      or (app.boss_rpc_aktiv()
          and total_damage <= coalesce((app.old_boss_damage(month_id, firebase_uid)).total_damage, 0) + 400)
    )
  );


/* ======================================================
   6. HILFSMITTEL
====================================================== */
create extension if not exists pgcrypto with schema extensions;

-- Der Tag, an dem der Spieler sich befindet. Nicht UTC: die Seite ist
-- deutschsprachig, und "einmal taeglich" soll um Mitternacht in
-- Deutschland umspringen, nicht um 01:00 oder 02:00.
create or replace function app.boss_heute() returns date
language sql stable
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

-- Die staerkste gerade laufende Verstaerkung. Mehrere multiplizieren
-- sich bewusst NICHT (siehe Kommentar bei boss_community_buff).
create or replace function app.boss_buff_faktor(p_month_id text) returns numeric
language sql stable
as $$
  select coalesce(max(faktor), 1)
  from public.boss_community_buff
  where month_id = p_month_id and bis > now()
$$;

/* Der Brandpfeil laeuft ueber drei Tage weiter, auch wenn niemand
   zusieht. Postgres hat von sich aus keine Uhr, die etwas anstoesst -
   der Schaden wird deshalb nachgetragen, sobald der Spieler das
   naechste Mal etwas tut (angreifen oder die Seite oeffnen). Er geht
   nicht verloren, er kommt nur spaeter an. Ein echter Zeitplan waere
   pg_cron; das ist bewusst nicht Voraussetzung dieser Migration. */
create or replace function app.boss_brand_verrechnen(p_uid text, p_month_id text)
returns integer
language plpgsql security definer set search_path = public, app, extensions
as $$
declare
  z public.boss_attack_state;
  tage integer;
  summe integer := 0;
begin
  select * into z from public.boss_attack_state where firebase_uid = p_uid;
  if not found or z.brand_bis is null or z.brand_pro_tag <= 0 then
    return 0;
  end if;
  if z.brand_monat is distinct from p_month_id then
    -- Monatswechsel: ein Brand aus dem Vormonat trifft den neuen Boss
    -- nicht. Er wird geloescht, nicht uebertragen.
    update public.boss_attack_state
       set brand_bis = null, brand_pro_tag = 0, brand_monat = null, brand_letzter_tag = null
     where firebase_uid = p_uid;
    return 0;
  end if;

  tage := greatest(0, least(
    app.boss_heute() - coalesce(z.brand_letzter_tag, app.boss_heute()),
    (z.brand_bis at time zone 'Europe/Berlin')::date - coalesce(z.brand_letzter_tag, app.boss_heute())
  ));
  if tage <= 0 then
    return 0;
  end if;

  summe := tage * z.brand_pro_tag;

  perform set_config('app.boss_rpc', 'ja', true);
  update public.community_boss
     set hp = greatest(0, community_boss.hp - summe),
         defeated = community_boss.defeated or (community_boss.hp - summe <= 0)
   where month_id = p_month_id;

  update public.boss_attack_state
     set brand_letzter_tag = app.boss_heute(),
         brand_bis = case when now() >= brand_bis then null else brand_bis end,
         brand_pro_tag = case when now() >= brand_bis then 0 else brand_pro_tag end,
         aktualisiert = now()
   where firebase_uid = p_uid;

  return summe;
end;
$$;


/* ======================================================
   7. EINEN GEHEIMCODE EINLOESEN
   ---------------------------------------------------
   Der Klartext kommt herein, wird hier gehasht und verglichen. Er
   verlaesst die Funktion nicht, und die Codetabelle ist fuer niemanden
   sonst lesbar.

   Rueckgabe: der freigeschaltete Schluessel, oder NULL bei falschem
   Code. Bewusst kein Fehler - ein Fehler faerbt in PostgREST die
   ganze Antwort rot und laedt dazu ein, ueber die Fehlertexte zu
   raten, welche Codes es ueberhaupt gibt.
====================================================== */
create or replace function app.boss_unlock_special(p_code text)
returns text
language plpgsql security definer set search_path = public, app, extensions
as $$
declare
  uid text := app.firebase_uid();
  hash text;
  treffer text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_code is null or char_length(p_code) < 3 or char_length(p_code) > 64 then
    return null;
  end if;

  hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  select schluessel into treffer from public.boss_special_codes where code_sha256 = hash;
  if treffer is null then
    return null;
  end if;

  insert into public.boss_attack_state (firebase_uid, frei)
       values (uid, array[treffer])
  on conflict (firebase_uid) do update
     set frei = (select array(select distinct unnest(public.boss_attack_state.frei || array[treffer]))),
         aktualisiert = now();

  return treffer;
end;
$$;

create or replace function public.boss_unlock_special(p_code text)
returns text
language sql security definer set search_path = public, app, extensions
as $$ select app.boss_unlock_special(p_code) $$;


/* ======================================================
   8. WAS DARF ICH GERADE?
   ---------------------------------------------------
   Eine Abfrage fuer die ganze Anzeige: freigeschaltete Angriffe,
   wann welcher wieder geht, ob heute noch ein Angriff frei ist, und
   ob gerade eine gemeinsame Verstaerkung laeuft.
====================================================== */
create or replace function app.boss_attack_status(p_month_id text)
returns jsonb
language plpgsql security definer set search_path = public, app, extensions
as $$
declare
  uid text := app.firebase_uid();
  z public.boss_attack_state;
  buff record;
begin
  if uid is null then
    return jsonb_build_object('angemeldet', false);
  end if;

  perform app.boss_brand_verrechnen(uid, p_month_id);
  select * into z from public.boss_attack_state where firebase_uid = uid;

  select art, faktor, bis, von_nickname into buff
    from public.boss_community_buff
   where month_id = p_month_id and bis > now()
   order by faktor desc, bis desc limit 1;

  return jsonb_build_object(
    'angemeldet', true,
    'frei', coalesce(to_jsonb(z.frei), '[]'::jsonb),
    'spezialZuletzt', coalesce(z.spezial_zuletzt, '{}'::jsonb),
    'ruheBis', z.ruhe_bis,
    'zusatzAngriff', coalesce(z.zusatz_angriff, 0),
    'heuteSchonAngegriffen',
       coalesce((z.letzter_angriff at time zone 'Europe/Berlin')::date = app.boss_heute(), false),
    'brandBis', z.brand_bis,
    'verstaerkung', case when buff.art is null then null else jsonb_build_object(
        'art', buff.art, 'faktor', buff.faktor, 'bis', buff.bis, 'von', buff.von_nickname) end
  );
end;
$$;

create or replace function public.boss_attack_status(p_month_id text)
returns jsonb
language sql security definer set search_path = public, app, extensions
as $$ select app.boss_attack_status(p_month_id) $$;


/* ======================================================
   9. DER ANGRIFF
   ---------------------------------------------------
   Der Client sagt nur, WELCHEN Angriff er fuehrt. Alles andere
   entscheidet sich hier:

   - ist er ueberhaupt freigeschaltet?
   - ist die Sperre abgelaufen?
   - darf heute noch angegriffen werden?
   - wie viel Schaden macht er?
   - wirkt gerade eine gemeinsame Verstaerkung?

   SECURITY DEFINER, weil die Funktion boss_attack_state schreiben
   muss - eine Tabelle, fuer die es bewusst keine Schreib-Policy gibt.
   Duerfte der Spieler dort selbst hinein, koennte er sich jeden
   Spezialangriff eintragen.

   Die Zeile wird per "for update" gesperrt: zwei gleichzeitige
   Anfragen desselben Spielers (Doppelklick, zwei Reiter) laufen damit
   nacheinander, und die zweite sieht die Tagessperre der ersten.
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

create or replace function public.boss_attack(p_month_id text, p_attack text, p_nickname text default null)
returns jsonb
language sql security definer set search_path = public, app, extensions
as $$ select app.boss_attack(p_month_id, p_attack, p_nickname) $$;


/* ======================================================
   10. RECHTE
   ---------------------------------------------------
   Beide Ebenen, aus demselben Grund wie bei
   attack_community_boss() in 03-race-boss.sql: der oeffentliche
   Wrapper reicht nur durch, die aufrufende Rolle braucht das Recht
   auf beide Funktionen.
====================================================== */
grant execute on function app.boss_attack(text, text, text)    to authenticated;
grant execute on function public.boss_attack(text, text, text) to authenticated;
grant execute on function app.boss_unlock_special(text)        to authenticated;
grant execute on function public.boss_unlock_special(text)     to authenticated;
grant execute on function app.boss_attack_status(text)         to authenticated;
grant execute on function public.boss_attack_status(text)      to authenticated;
grant execute on function app.boss_brand_verrechnen(text,text) to authenticated;

-- Der Protokolltabelle aus supabase/schema.sql den hoeheren Deckel
-- geben, falls sie eingespielt ist. Sie ist rein zusaetzlich; fehlt
-- sie, passiert hier nichts.
do $$
declare c text;
begin
  if to_regclass('public.community_boss_attacks') is null then return; end if;
  select conname into c from pg_constraint
   where conrelid = 'public.community_boss_attacks'::regclass
     and contype = 'c' and pg_get_constraintdef(oid) like '%damage%';
  if c is not null then
    execute format('alter table public.community_boss_attacks drop constraint %I', c);
  end if;
  alter table public.community_boss_attacks
    add constraint community_boss_attacks_damage_chk check (damage >= 0 and damage <= 400);
end;
$$;

/* Tabellenrechte ausdruecklich setzen. Supabase vergibt sie fuer neu
   angelegte Tabellen zwar ueber "default privileges" automatisch -
   aber nur, wenn diese Voreinstellung unveraendert ist. Explizit
   kostet nichts und macht die Datei unabhaengig davon (und lokal
   ueberhaupt erst testbar). Die eigentliche Absicherung sind ohnehin
   die Policies weiter oben, nicht die Grants.

   boss_special_codes bekommt bewusst KEIN select fuer Spieler. */
grant select on public.boss_attack_defs    to anon, authenticated;
grant select on public.boss_attack_state   to authenticated;
grant select on public.boss_community_buff to anon, authenticated;


/* ======================================================
   11. ANLEITUNG
   ======================================================

   EINSPIELEN
   Im Supabase-Dashboard unter SQL Editor den Inhalt dieser Datei
   ausfuehren. Voraussetzung ist 03-race-boss.sql (community_boss und
   community_boss_damage muessen existieren).

   Bis das geschehen ist, laeuft die Seite unveraendert weiter: der
   Browser prueft einmal, ob public.boss_attack_status() existiert,
   und bleibt sonst beim bisherigen Weg. Es geht also nichts kaputt,
   wenn du damit wartest.

   GEHEIMCODES ANLEGEN
   Die Codes stehen bewusst NICHT in dieser Datei - so gibt es auch
   im Repository nichts, was sich mit einer Wortliste durchprobieren
   liesse. Lege sie selbst an, einen je Spezialangriff:

     insert into public.boss_special_codes (code_sha256, schluessel, bemerkung)
     values (encode(extensions.digest(upper('DEIN-CODE-HIER'),'sha256'),'hex'),
             'salve', 'Stream vom 12.09.');

   Wichtig: upper(), weil boss_unlock_special() den eingetippten Code
   ebenfalls in Grossbuchstaben umwandelt - so ist es egal, wie der
   Spieler ihn schreibt.

   Die elf Schluessel:
     salve, brandpfeil, enterkommando, pulverfass, schlachtruf,
     fass, slot, moewen, katapult, seemannslied, rechnung

   Einen Code wieder zurueckziehen:
     delete from public.boss_special_codes
      where code_sha256 = encode(extensions.digest(upper('DEIN-CODE-HIER'),'sha256'),'hex');
   Bereits Freigeschaltete behalten ihren Angriff - das ist Absicht.

   ZAHLEN AENDERN
   Alles an einer Stelle, in boss_attack_defs. Zum Beispiel den
   Saebel etwas staerker machen:

     update public.boss_attack_defs
        set min_schaden = 30, max_schaden = 34
      where schluessel = 'saebel';

   Der Browser liest den Katalog von hier, es ist also nichts im Code
   nachzuziehen. Nur max_schaden darf 400 nicht ueberschreiten - das
   ist zugleich der Deckel der Policy.

   ZUM AUSGLEICH
   Der Boss hat aktuell 5000 Lebenspunkte (communityBossConfig.maxHp
   in scripts/community-boss/community-boss-data.js). Ein einzelnes
   Fass nimmt davon 400, also acht Prozent. Mit mehreren
   freigeschalteten Spielern ist ein Monatsboss damit deutlich
   schneller unten als bisher.

   Das ist bewusst NICHT mit dieser Migration geaendert: eine
   Erhoehung mitten im laufenden Monat wuerde den bereits erreichten
   Fortschritt entwerten. Wenn du die Spezialangriffe freigibst,
   erhoehe maxHp zum Monatswechsel - 12000 bis 15000 waere ein
   sinnvoller Anfang.

   TESTS
   10-boss-attacks.test.sql laeuft gegen dieselbe Datenbank und
   meldet je Zeile PASS oder FAIL. Er veraendert dabei Daten
   (loescht boss_attack_state, setzt HP) - also nur gegen eine
   Testdatenbank laufen lassen, nicht gegen die Live-Datenbank.
====================================================== */
