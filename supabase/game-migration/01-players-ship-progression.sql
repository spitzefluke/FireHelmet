/* ======================================================
   FIRESTORE -> SUPABASE MIGRATION, PHASE 1
   players / ship_repair / player_progression
   ---------------------------------------------------
   1:1-Uebersetzung der Sicherheitslogik aus firestore.rules nach
   Postgres Row Level Security.

   AUTH-UMSTELLUNG (Nachtrag): urspruenglich lief die Anmeldung ueber
   Firebase Authentication + Supabase "Third-Party Auth" als Bruecke
   (auth.jwt() ->> 'sub' sollte die per Third-Party Auth gepruefte
   Firebase-UID liefern). Live gegen das echte Projekt hat sich diese
   Bruecke als nicht zuverlaessig erwiesen (lokal reproduziert: Schema/
   RLS-Logik korrekt, aber die Identitaet kam nicht zuverlaessig bei
   der tatsaechlichen RLS-Auswertung an - separates, Supabase-seitiges
   Problem, siehe Git-Historie). Ersetzt durch Supabase-natives Auth
   (auth.uid(), signInAnonymously()/signInWithOAuth()) - dieselbe
   Spalte/Funktion (app.firebase_uid(), Spaltenname "firebase_uid")
   bleibt bewusst gleich benannt, um den Client-Code unveraendert zu
   lassen (nur die Werte darin sind jetzt Supabase-eigene UUIDs statt
   Firebase-UIDs - "bei Null anfangen" war ohnehin die Praemisse).

   WICHTIGER UNTERSCHIED ZU FIRESTORE:
   In Firestore macht set(...,{merge:true}) das GESAMTE Dokument nach
   dem Merge zu "newData" - deshalb brauchen die meisten Firestore-
   Regeln explizite "!('feld' in newData) || ..."-Ausnahmen fuer
   unveraenderte Felder. Ein Postgres UPDATE mit einer SET-Klausel,
   die eine Spalte gar nicht erwaehnt, behaelt automatisch deren alten
   Wert - der "Feld unveraendert"-Fall ergibt sich hier von selbst,
   ohne eigene Ausnahme-Pruefung. Die Funktionen unten pruefen deshalb
   direkt den (neuen) Spaltenwert der Zeile; ist er unveraendert,
   greift jeweils zuerst ein billiger Gleichheits-Fast-Path.

   TECHNISCHE GRUNDLAGE (echt gegen lokales Postgres verifiziert,
   siehe Testprotokoll): Ein "alter Wert vs. neuer Wert"-Vergleich
   in EINER WITH CHECK-Klausel funktioniert ueber eine Self-Subquery
   (app.old_player()) - das setzt zwingend eine passende SELECT-
   Policy fuer dieselbe Rolle voraus, sonst liefert die Subquery still
   NULL und die Pruefung schlaegt (ohne Fehlermeldung!) fehl.
====================================================== */

create schema if not exists app;

/* ------------------------------------------------------
   GRUNDFUNKTIONEN (Firestore: isSignedIn()/isAdmin())
------------------------------------------------------ */
-- auth.uid() ist Supabase-natives Auth (signInAnonymously()/
-- signInWithOAuth() ueber supabaseClient.auth) - kein Third-Party-
-- JWT-Umweg mehr, dieselbe UUID wie supabaseClient.auth.getUser().
create or replace function app.firebase_uid() returns text
language sql stable
as $$ select auth.uid()::text $$;

create or replace function app.is_signed_in() returns boolean
language sql stable
as $$ select app.firebase_uid() is not null $$;

-- Einzig autorisierter Admin-Account - Anmeldung ueber Supabase-
-- natives Google-OAuth (siehe admin-gateway.js), auth.jwt() ->> 'email'
-- kommt direkt von Supabases eigenem, verifiziertem Google-Provider
-- (kein Firebase/Third-Party-Umweg mehr). Muss exakt FIRE_HELMET_CONFIG.
-- ownerEmail entsprechen (scripts/core/fire-helmet-config.js).
create or replace function app.is_admin() returns boolean
language sql stable
as $$
  select app.is_signed_in() and (auth.jwt() ->> 'email') = 'y.n.trott@gmail.com'
$$;

/* ======================================================
   TABELLE: players (Firestore: players/{uid})
====================================================== */
create table public.players (
  firebase_uid text primary key,
  nickname text,
  currency integer not null default 0,
  games_played integer not null default 0,
  games_won integer not null default 0,
  total_currency_earned integer not null default 0,
  codes_cracked integer not null default 0,
  streak integer not null default 0,
  ship_tools jsonb not null default '{}'::jsonb,
  owned_shop_items text[] not null default '{}',
  equipped_frame text,
  avatar text,
  rewards text[] not null default '{}',
  daily_quests_started_at timestamptz,
  daily_quests_claimed_days integer[] not null default '{}',
  redeemed_currency_codes jsonb not null default '{}'::jsonb,
  last_wheel_spin_at timestamptz,
  last_spielothek_play_at timestamptz,
  temp_avatar_expires_at bigint,
  temp_avatar_id text,
  updated_at timestamptz not null default now(),

  constraint players_nickname_len check (nickname is null or char_length(nickname) between 1 and 30),
  constraint players_avatar_len check (avatar is null or char_length(avatar) <= 300),
  constraint players_frame_len check (equipped_frame is null or char_length(equipped_frame) <= 50),
  constraint players_owned_items_len check (coalesce(array_length(owned_shop_items,1),0) <= 40),
  constraint players_rewards_len check (coalesce(array_length(rewards,1),0) <= 50),
  constraint players_daily_quests_len check (coalesce(array_length(daily_quests_claimed_days,1),0) <= 20),
  constraint players_currency_nonneg check (currency >= 0),
  constraint players_games_played_nonneg check (games_played >= 0),
  constraint players_games_won_nonneg check (games_won >= 0),
  constraint players_total_earned_nonneg check (total_currency_earned >= 0),
  constraint players_streak_range check (streak >= 0),
  constraint players_codes_cracked_range check (codes_cracked >= 0)
);

alter table public.players enable row level security;
alter table public.players force row level security;

create or replace function app.old_player(p_uid text) returns public.players
language sql stable
as $$ select * from public.players where firebase_uid = p_uid $$;

-- SELECT-Policy MUSS vor allen WITH CHECK-Self-Subqueries existieren
-- (siehe Kommentar oben) - Firestore: "allow read: if true"
create policy "players_select_public" on public.players
  for select to anon, authenticated using (true);

/* ------------------------------------------------------
   shipTools - siehe validShipTools() in firestore.rules
------------------------------------------------------ */
create or replace function app.valid_ship_tools(p_uid text, new_tools jsonb) returns boolean
language plpgsql stable
as $$
declare
  old_tools jsonb := coalesce((app.old_player(p_uid)).ship_tools, '{}'::jsonb);
  known_ids text[] := array['spyglass','toolbox','hammer','sealant','saw','cableSet',
    'fuse','multimeter','oilCan','screwdriver','coolant','fuelFilter','wrench',
    'antenna','compass','circuitChip','brush','safetyKit','testKit','captainsSeal'];
  k text;
  changed_count int := 0;
begin
  if new_tools = old_tools then
    return true; -- Fast-Path: unveraendert (Standardfall bei fast jedem Schreibvorgang)
  end if;
  if jsonb_typeof(new_tools) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(new_tools)) > 20 then
    return false;
  end if;
  for k in select jsonb_object_keys(new_tools) loop
    if not (k = any(known_ids)) then
      return false;
    end if;
    if (new_tools ->> k)::numeric > 40 then
      return false;
    end if;
  end loop;
  for k in select jsonb_object_keys(new_tools) union select jsonb_object_keys(old_tools) loop
    if (new_tools -> k) is distinct from (old_tools -> k) then
      changed_count := changed_count + 1;
      if changed_count > 1 then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

/* ------------------------------------------------------
   Tagesquests - siehe validDailyQuestsWrite()/-Detail()/
   dailyQuestDayIsUnlocked()/toolForQuestDay()/metricForQuestDay()/
   thresholdForQuestDay() in firestore.rules
------------------------------------------------------ */
create or replace function app.day_tool(p_day int) returns text
language sql immutable
as $$
  select (array['spyglass','toolbox','hammer','sealant','saw','cableSet','fuse',
    'multimeter','oilCan','screwdriver','coolant','fuelFilter','wrench','antenna',
    'compass','circuitChip','brush','safetyKit','testKit','captainsSeal'])[p_day]
$$;

create or replace function app.day_threshold(p_day int) returns int
language sql immutable
as $$ select (array[3,2,100,1,6,4,250,2,10,6,450,3,15,8,700,4,20,10,1000,5])[p_day] $$;

-- "metric" pro Tag ist direkt ueber Spaltennamen abgebildet (siehe
-- day_metric_value() unten), nicht als Text-Array wie in Firestore,
-- weil Postgres keine "Spaltenname aus Variable" direkt in SQL kann.
create or replace function app.day_metric_value(p_day int, p_row public.players) returns numeric
language plpgsql immutable
as $$
declare
  metrics text[] := array['games_played','games_won','total_currency_earned','codes_cracked','games_played',
    'games_won','total_currency_earned','codes_cracked','games_played','games_won',
    'total_currency_earned','codes_cracked','games_played','games_won','total_currency_earned',
    'codes_cracked','games_played','games_won','total_currency_earned','streak'];
begin
  return case metrics[p_day]
    when 'games_played' then p_row.games_played
    when 'games_won' then p_row.games_won
    when 'total_currency_earned' then p_row.total_currency_earned
    when 'codes_cracked' then p_row.codes_cracked
    when 'streak' then p_row.streak
  end;
end;
$$;

create or replace function app.valid_daily_quests_write(
  p_uid text,
  new_started_at timestamptz,
  new_claimed_days integer[],
  new_ship_tools jsonb
) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
  old_started_at timestamptz := old_row.daily_quests_started_at;
  old_claimed_days integer[] := coalesce(old_row.daily_quests_claimed_days, '{}');
  new_day int;
  needed_tool text;
  needed_threshold int;
  old_metric_value numeric;
  old_tool_count numeric;
  new_tool_count numeric;
begin
  if new_started_at is not distinct from old_started_at
     and coalesce(new_claimed_days,'{}') = old_claimed_days then
    return true; -- Fast-Path: unveraendert
  end if;

  if coalesce(array_length(new_claimed_days,1),0) > 20 then
    return false;
  end if;

  if old_started_at is null then
    -- Fall A: Erststart - MUSS nah an der aktuellen Serverzeit liegen.
    -- URSPRUENGLICH als exaktes "= now()" geplant (analog zu Firestores
    -- request.time-Sentinel bei serverTimestamp()) - das setzt aber
    -- voraus, dass now() selbst Teil des SCHREIBBEFEHLS ist (funktioniert
    -- nur bei direktem SQL, z.B. in den Tests hier). Ein normaler
    -- Supabase-Client (PostgREST/supabase-js) kann keine rohe SQL-
    -- Funktion im Request-Body senden, nur einen fertigen Literalwert -
    -- der landet nie exakt auf dem now() der Datenbank (Netzwerk-
    -- Laufzeit, Uhren-Differenz). Ein enges Toleranzfenster (2 Minuten,
    -- weit unter der 24h-Tagesschwelle) ersetzt daher die exakte
    -- Gleichheit: reicht fuer normale Netzwerk-Latenz, verhindert aber
    -- ein nennenswertes Zurückdatieren zum Freischalten spaeterer Tage.
    return new_started_at between now() - interval '2 minutes' and now() + interval '2 minutes'
       and coalesce(array_length(new_claimed_days,1),0) = 0;
  end if;

  -- Fall B: startedAt MUSS exakt gleich bleiben
  if new_started_at is distinct from old_started_at then
    return false;
  end if;

  if coalesce(array_length(new_claimed_days,1),0) <> coalesce(array_length(old_claimed_days,1),0) + 1 then
    return false;
  end if;

  new_day := coalesce(array_length(old_claimed_days,1),0) + 1;
  needed_tool := app.day_tool(new_day);
  needed_threshold := app.day_threshold(new_day);

  if now() < old_started_at + ((new_day - 1) * interval '1 day') then
    return false; -- Tag laut Server-Uhrzeit noch nicht freigeschaltet
  end if;

  old_metric_value := app.day_metric_value(new_day, old_row);
  if old_metric_value < needed_threshold then
    return false;
  end if;

  old_tool_count := coalesce((old_row.ship_tools ->> needed_tool)::numeric, 0);
  new_tool_count := coalesce((new_ship_tools ->> needed_tool)::numeric, 0);
  if new_tool_count <> old_tool_count + 1 then
    return false;
  end if;

  return true;
end;
$$;

/* ------------------------------------------------------
   Dublonen-Codes - siehe validCodeRedemption()/-Detail() in
   firestore.rules. MUSS mit scripts/codes/codes-data.js synchron
   bleiben (fire100/beutel25/kleinerbeutel/fire300/coins300/sorry500/sorry).

   Signatur um zwei Parameter erweitert (Nachtrag) - "drop" noetig,
   weil sich die Parameterliste geaendert hat ("create or replace"
   allein reicht bei Supabase/Postgres nicht, wenn sich Anzahl/Typ der
   Parameter aendert; die alte 3-Parameter-Version bleibt sonst als
   separate, ueberladene Funktion bestehen).
------------------------------------------------------ */
drop function if exists app.valid_code_redemption(text, jsonb, integer);

create or replace function app.valid_code_redemption(
  p_uid text,
  new_codes jsonb,
  new_currency integer,
  new_last_wheel_spin timestamptz,
  new_last_spielothek_play timestamptz
) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
  old_codes jsonb := coalesce(old_row.redeemed_currency_codes, '{}'::jsonb);
  old_currency integer := coalesce(old_row.currency, 0);
  delta integer := new_currency - old_currency;
  new_hash text;
begin
  if new_codes = old_codes then
    -- Unveraendert mitgesendet: an sich darf eine Waehrungsgutschrift
    -- HIER nicht "einfach so" durchgehen (das waere ein Wiederholungs-
    -- Einloesen desselben, bereits in der Map stehenden Codes ohne
    -- neuen Eintrag - siehe TEST7c/7e in 02-players-ship-progression.
    -- test.sql). ABER: Schatzrad-Preise und Spielothek-Gewinne setzen
    -- IMMER last_wheel_spin_at bzw. last_spielothek_play_at im selben
    -- Schreibvorgang - deren Aenderung wird bereits eigenstaendig von
    -- app.valid_wheel_fields()/app.valid_spielothek_cooldown() geprueft
    -- (Cooldown-Einhaltung), eine zusaetzliche Waehrungssperre hier waere
    -- fuer genau diese beiden Faelle unnoetig und blockierte sie bisher
    -- faelschlich komplett (siehe Testprotokoll/Fehlerbericht). Fuer
    -- Wochenrennen/Community-Boss/generische Belohnungen (Story-/
    -- Levelpfad-Meilensteine) gilt weiterhin "delta <= 0" - die laufen
    -- inzwischen ueber eine eigene, atomare RPC (siehe app.
    -- claim_generic_reward() in 09-generic-reward.sql), nicht mehr ueber
    -- dieses rohe UPDATE.
    if new_last_wheel_spin is distinct from old_row.last_wheel_spin_at
       or new_last_spielothek_play is distinct from old_row.last_spielothek_play_at then
      return true;
    end if;
    return delta <= 0;
  end if;
  if jsonb_typeof(new_codes) <> 'object' or (select count(*) from jsonb_object_keys(new_codes)) > 50 then
    return false;
  end if;
  -- genau EIN neuer Eintrag
  if (select count(*) from jsonb_object_keys(new_codes) k where not old_codes ? k) <> 1
     or (select count(*) from jsonb_object_keys(new_codes)) <> (select count(*) from jsonb_object_keys(old_codes)) + 1 then
    return false;
  end if;

  select k into new_hash from jsonb_object_keys(new_codes) k where not old_codes ? k;

  return case new_hash
    when '516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769' then delta = 100
    when 'a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4' then delta = 25
    when '8bfe3282c066093f84dc23ea2215dff3eae0c7bb2a0d7a11585800adc3d7efb1' then delta = 25
    when '8f42ea772af5c16d5b27feb56aae75e6407d8b85e9174e79e468320b9ed88dba' then delta = 300
    when 'd422fd99131807e57e4c5b71defeeab9544b77d9d9201cf36a922f14bf5f226d' then delta = 300
    when '80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c' then delta = 500
    when '484aab2f2cd0f77b3c30f91521ba9a76c8c501112a53e100154a098c274f03d3' then delta = 300
    else false
  end;
end;
$$;

/* ------------------------------------------------------
   Schatzrad - siehe validWheelFields() in firestore.rules
------------------------------------------------------ */
create or replace function app.valid_wheel_fields(
  p_uid text,
  new_last_spin timestamptz,
  new_temp_avatar_expires bigint
) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
begin
  if new_last_spin is not distinct from old_row.last_wheel_spin_at then
    -- unveraendert -> ok
    null;
  elsif old_row.last_wheel_spin_at is null then
    -- erster Dreh, kein Cooldown zu pruefen
    null;
  elsif extract(epoch from (now() - old_row.last_wheel_spin_at)) * 1000 < 72000000 then
    return false; -- 20h Mindestabstand
  end if;

  if new_temp_avatar_expires is not distinct from old_row.temp_avatar_expires_at then
    return true;
  end if;

  return new_temp_avatar_expires >= (extract(epoch from now()) * 1000)::bigint + 237600000
     and new_temp_avatar_expires <= (extract(epoch from now()) * 1000)::bigint + 280800000;
end;
$$;

/* ------------------------------------------------------
   Spielothek-Cooldown - siehe validSpielothekCooldown() in
   firestore.rules (4000ms Mindestabstand)
------------------------------------------------------ */
create or replace function app.valid_spielothek_cooldown(p_uid text, new_last_play timestamptz) returns boolean
language plpgsql stable
as $$
declare
  old_last timestamptz := (app.old_player(p_uid)).last_spielothek_play_at;
begin
  if new_last_play is not distinct from old_last then
    return true;
  end if;
  if old_last is null then
    return true;
  end if;
  return extract(epoch from (now() - old_last)) * 1000 >= 4000;
end;
$$;

/* ------------------------------------------------------
   GESAMT-PRUEFUNG fuer players (Firestore: validShopFields() +
   validQuestCounters() + Grenzen aus "allow update")
   ---------------------------------------------------
   Deckel fuer currency/total_currency_earned von 3000 auf 30000
   angehoben (Spielothek-Update: 4. Slot-Walze + frei waehlbarer
   Einsatz 10-100 Dublonen, siehe games/slot.js). Wie schon vorher
   beim Schatzrad gilt: der Client BERECHNET das Ergebnis (RNG lokal
   im Browser, siehe Kommentar am Anfang von games/slot.js), die
   Datenbank prueft NICHT die Wuerfel/Walzen-Werte selbst nach,
   sondern nur, dass der Kontostand-Sprung diesen Deckel nicht
   uebersteigt - bewusste, bereits bestehende Vereinfachung (rein
   virtuelle Waehrung, kein echtes Geld). Der neue Vierfach-Feuer-
   Jackpot bei Maximaleinsatz (100 x 300 = 30000 brutto) haette den
   alten 3000er-Deckel gerissen, daher die Anhebung - betrifft
   dieselbe Obergrenze auch fuer Schatzrad-Preise/Code-Einloesungen,
   die aber je eigene, engere Pruefungen haben (valid_wheel_fields()
   prueft gar keinen Currency-Wert, valid_code_redemption() prueft
   den exakten Betrag pro Hash) und dadurch von der Anhebung selbst
   nicht zusaetzlich unsicherer werden.
------------------------------------------------------ */
create or replace function app.valid_players_write(p_uid text, new_row public.players) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
begin
  return new_row.currency <= coalesce(old_row.currency, 0) + 30000
    and new_row.games_played <= coalesce(old_row.games_played, 0) + 1
    and new_row.games_won <= coalesce(old_row.games_won, 0) + 1
    and new_row.total_currency_earned <= coalesce(old_row.total_currency_earned, 0) + 30000
    and new_row.streak <= coalesce(old_row.streak, 0) + 1
    and new_row.codes_cracked <= coalesce(old_row.codes_cracked, 0) + 1
    and app.valid_ship_tools(p_uid, new_row.ship_tools)
    and app.valid_daily_quests_write(p_uid, new_row.daily_quests_started_at, new_row.daily_quests_claimed_days, new_row.ship_tools)
    and app.valid_code_redemption(p_uid, new_row.redeemed_currency_codes, new_row.currency, new_row.last_wheel_spin_at, new_row.last_spielothek_play_at)
    and app.valid_wheel_fields(p_uid, new_row.last_wheel_spin_at, new_row.temp_avatar_expires_at)
    and app.valid_spielothek_cooldown(p_uid, new_row.last_spielothek_play_at);
end;
$$;

create policy "players_insert_own" on public.players
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and currency = 0
    and games_played = 0
    and games_won = 0
    and total_currency_earned = 0
    and streak <= 1
    and codes_cracked <= 1
    and last_wheel_spin_at is null
    and last_spielothek_play_at is null
  );

create policy "players_update_own" on public.players
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (
    firebase_uid = app.firebase_uid()
    and app.valid_players_write(firebase_uid, players.*)
  );

-- kein delete-Policy -> Firestore "allow delete: if false" (Default-Deny)

/* ======================================================
   TABELLE: ship_repair (Firestore: ship_repair/{uid})
====================================================== */
create table public.ship_repair (
  firebase_uid text primary key,
  completed_phases text[] not null default '{}',
  active_repair jsonb,
  ship_name text,
  named_by text,
  updated_at timestamptz not null default now()
);

alter table public.ship_repair enable row level security;
alter table public.ship_repair force row level security;

create or replace function app.old_ship_repair(p_uid text) returns public.ship_repair
language sql stable
as $$ select * from public.ship_repair where firebase_uid = p_uid $$;

create policy "ship_repair_select_own" on public.ship_repair
  for select to authenticated using (firebase_uid = app.firebase_uid());

create policy "ship_repair_insert_own" on public.ship_repair
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and coalesce(array_length(completed_phases,1),0) = 0
    and active_repair is null
    and ship_name is null
  );

-- siehe "allow update" Fall A/Fall B in firestore.rules
create or replace function app.valid_ship_repair_update(p_uid text, new_row public.ship_repair) returns boolean
language plpgsql stable
as $$
declare
  old_row public.ship_repair := app.old_ship_repair(p_uid);
  old_ends_at bigint;
  new_ends_at bigint;
  case_a boolean := false;
  case_b boolean := false;
begin
  -- Fall A: neue Etappe wird gestartet
  if old_row.active_repair is null and new_row.active_repair is not null then
    new_ends_at := (new_row.active_repair ->> 'endsAt')::bigint;
    case_a := new_ends_at is not null
      and new_ends_at > (extract(epoch from now()) * 1000)::bigint
      and new_row.completed_phases = old_row.completed_phases
      and new_row.ship_name is not distinct from old_row.ship_name;
  end if;

  -- Fall B: laufende Etappe wird abgeschlossen
  if not case_a and old_row.active_repair is not null then
    old_ends_at := (old_row.active_repair ->> 'endsAt')::bigint;
    case_b := old_ends_at is not null
      and old_ends_at <= (extract(epoch from now()) * 1000)::bigint
      and new_row.active_repair is null
      and array_length(new_row.completed_phases,1) = coalesce(array_length(old_row.completed_phases,1),0) + 1
      and new_row.completed_phases[array_length(new_row.completed_phases,1)] = (old_row.active_repair ->> 'phaseId');
  end if;

  if not (case_a or case_b) then
    return false;
  end if;

  -- shipName: bleibt null bis alle 20 Etappen fertig, danach fest
  if old_row.ship_name is not null then
    return new_row.ship_name is not distinct from old_row.ship_name
      and (new_row.ship_name is null) = (new_row.named_by is null);
  end if;

  if coalesce(array_length(new_row.completed_phases,1),0) < 20 then
    return new_row.ship_name is null and (new_row.ship_name is null) = (new_row.named_by is null);
  end if;

  return new_row.ship_name is not null and (new_row.ship_name is null) = (new_row.named_by is null);
end;
$$;

create policy "ship_repair_update_own" on public.ship_repair
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (firebase_uid = app.firebase_uid() and app.valid_ship_repair_update(firebase_uid, ship_repair.*));

/* ======================================================
   TABELLE: player_progression (Firestore: player_progression/{uid})
====================================================== */
create table public.player_progression (
  firebase_uid text primary key,
  xp integer not null default 0,
  pass_id text,
  pass_xp integer not null default 0,
  claimed_reward_ids text[] not null default '{}',
  has_flitzpiepen_cap boolean not null default false,
  updated_at timestamptz not null default now(),

  constraint progression_xp_nonneg check (xp >= 0),
  constraint progression_pass_xp_nonneg check (pass_xp >= 0),
  constraint progression_claimed_len check (coalesce(array_length(claimed_reward_ids,1),0) <= 300),
  constraint progression_pass_id_valid check (pass_id is null or pass_id in ('season1'))
);

alter table public.player_progression enable row level security;
alter table public.player_progression force row level security;

create or replace function app.old_progression(p_uid text) returns public.player_progression
language sql stable
as $$ select * from public.player_progression where firebase_uid = p_uid $$;

create policy "progression_select_own" on public.player_progression
  for select to authenticated using (firebase_uid = app.firebase_uid());

create or replace function app.valid_progression_write(p_uid text, new_row public.player_progression) returns boolean
language plpgsql stable
as $$
declare
  old_row public.player_progression := app.old_progression(p_uid);
  old_xp integer := coalesce(old_row.xp, 0);
  old_pass_id text := old_row.pass_id;
  old_pass_xp integer := coalesce(old_row.pass_xp, 0);
  old_claimed_count integer := coalesce(array_length(old_row.claimed_reward_ids,1), 0);
  new_claimed_count integer := coalesce(array_length(new_row.claimed_reward_ids,1), 0);
begin
  return new_row.xp <= old_xp + 500
    and (new_row.pass_id != old_pass_id or new_row.pass_xp <= old_pass_xp + 500)
    and new_claimed_count >= old_claimed_count
    and new_claimed_count <= old_claimed_count + 1
    and (old_row.has_flitzpiepen_cap is not true or new_row.has_flitzpiepen_cap = true);
end;
$$;

create policy "progression_insert_own" on public.player_progression
  for insert to authenticated
  with check (firebase_uid = app.firebase_uid() and app.valid_progression_write(firebase_uid, player_progression.*));

create policy "progression_update_own" on public.player_progression
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (firebase_uid = app.firebase_uid() and app.valid_progression_write(firebase_uid, player_progression.*));
