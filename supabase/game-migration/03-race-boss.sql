/* ======================================================
   FIRESTORE -> SUPABASE MIGRATION, PHASE 2
   raceProgress / community_boss / community_boss_damage
   ---------------------------------------------------
   Baut auf 01-players-ship-progression.sql auf (app.firebase_uid()
   etc. muessen bereits existieren).

   WICHTIGER UNTERSCHIED ZU FIRESTORE: In Firestore ist die
   Dokument-ID "<week>_<uid>" bzw. "<month>_<uid>" - die Regeln
   pruefen "docId == (data.week + '_' + auth.uid)" als billigen
   Ownership-Trick. In Postgres gibt es dafuer keinen Grund: ein
   ECHTER zusammengesetzter Primary Key (week, firebase_uid) bzw.
   (month_id, firebase_uid) ist die natuerliche, einfachere
   Entsprechung - kein String-Verkettungs-Vergleich noetig.
====================================================== */

/* ======================================================
   TABELLE: race_progress (Firestore: raceProgress/{week_uid})
====================================================== */
create table public.race_progress (
  week text not null,
  firebase_uid text not null,
  nickname text not null,
  progress integer not null default 0,
  -- Denormalisierte Momentaufnahme fuers Rangliste-Rendering (Rahmen um
  -- den Namen, siehe race.js loadRaceLeaderboard()) - genau wie im
  -- Firestore-Original (raceProgress/{week_uid}.equippedFrame) OHNE
  -- eigene Validierung: firestore.rules prueft dieses Feld ebenfalls
  -- nicht extra (nur week/progress/nickname), siehe Kommentar dort.
  equipped_frame text,
  updated_at timestamptz not null default now(),
  primary key (week, firebase_uid),

  constraint race_progress_nickname_len check (char_length(nickname) between 1 and 30),
  constraint race_progress_progress_nonneg check (progress >= 0),
  constraint race_progress_frame_len check (equipped_frame is null or char_length(equipped_frame) <= 50)
);

alter table public.race_progress enable row level security;
alter table public.race_progress force row level security;

create or replace function app.old_race_progress(p_week text, p_uid text) returns public.race_progress
language sql stable
as $$ select * from public.race_progress where week = p_week and firebase_uid = p_uid $$;

create policy "race_progress_select_public" on public.race_progress
  for select to anon, authenticated using (true);

create policy "race_progress_insert_own" on public.race_progress
  for insert to authenticated
  with check (firebase_uid = app.firebase_uid() and progress <= 15);

create policy "race_progress_update_own" on public.race_progress
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (
    firebase_uid = app.firebase_uid()
    and progress <= coalesce((app.old_race_progress(week, firebase_uid)).progress, 0) + 15
  );

-- kein delete-Policy -> Firestore "allow delete: if false"


/* ======================================================
   TABELLE: community_boss (Firestore: community_boss/{monthId})
====================================================== */
create table public.community_boss (
  month_id text primary key,
  hp integer not null,
  max_hp integer not null,
  defeated boolean not null default false,
  updated_at timestamptz not null default now(),

  constraint community_boss_hp_nonneg check (hp >= 0)
);

alter table public.community_boss enable row level security;
alter table public.community_boss force row level security;

create or replace function app.old_community_boss(p_month_id text) returns public.community_boss
language sql stable
as $$ select * from public.community_boss where month_id = p_month_id $$;

create policy "community_boss_select_public" on public.community_boss
  for select to anon, authenticated using (true);

create policy "community_boss_insert" on public.community_boss
  for insert to authenticated
  with check (hp = max_hp);

-- Kein Eigentuemer-Konzept (EIN gemeinsames Dokument pro Monat) -
-- genau wie in firestore.rules: jeder Angemeldete darf HP verringern,
-- aber nur innerhalb des Hoechstbetrags pro Schreibvorgang. "defeated"
-- ist bewusst NICHT zusaetzlich eingeschraenkt (Firestore validiert
-- dieses Feld ebenfalls nicht extra) - unveraendertes Verhalten.
create policy "community_boss_update" on public.community_boss
  for update to authenticated
  using (true)
  with check (
    hp >= 0
    and hp >= coalesce((app.old_community_boss(month_id)).hp, 0) - 45
  );

-- kein delete-Policy

/* ------------------------------------------------------
   ANGRIFF: ATOMARER RPC-AUFRUF STATT READ-DANN-WRITE
   ---------------------------------------------------
   community_boss ist (anders als players/ship_repair/...) eine
   GEMEINSAME Zeile, die potenziell VIELE verschiedene Spieler
   gleichzeitig treffen - genau der Normalfall bei einem
   "Community"-Boss, nicht ein seltener Randfall. Firestores
   FieldValue.increment(-damage) ist ein ECHTES atomares Server-
   Increment; ein normaler Supabase-Client kann sowas nicht per
   PostgREST-JSON ausdruecken (nur fertige Literalwerte, siehe
   Kommentar bei valid_daily_quests_write() weiter oben). Ein simples
   "erst lesen, dann hp-damage zurueckschreiben" wuerde bei echtem
   gleichzeitigem Angreifen mehrerer Spieler regelmaessig Schaden
   verlieren (klassisches Lost-Update-Problem). app.attack_community_boss()
   fuehrt die relative Aenderung stattdessen in EINEM einzigen SQL-
   UPDATE aus - Postgres serialisiert konkurrierende UPDATEs auf
   dieselbe Zeile ganz von selbst (Zeilen-Lock), kein Schaden geht
   verloren. Laeuft als SECURITY INVOKER (Standard, keine erweiterten
   Rechte) - dieselbe community_boss_update-Policy von oben gilt
   unveraendert (inkl. des 45-HP-Deckels pro Aufruf).
------------------------------------------------------ */
create or replace function app.attack_community_boss(p_month_id text, p_damage integer)
returns table(hp integer, max_hp integer, defeated boolean)
language plpgsql
as $$
begin
  if p_damage is null or p_damage < 0 or p_damage > 45 then
    raise exception 'invalid-damage';
  end if;

  return query
  update public.community_boss
  set hp = greatest(0, community_boss.hp - p_damage),
      defeated = community_boss.defeated or (community_boss.hp - p_damage <= 0)
  where month_id = p_month_id
  returning community_boss.hp, community_boss.max_hp, community_boss.defeated;
end;
$$;

-- Duenner Wrapper im "public"-Schema: PostgREST exponiert per Standard-
-- Konfiguration NUR Funktionen aus dem "public"-Schema als RPC-Endpunkt
-- (supabaseClient.rpc(...)) - eine Funktion, die nur im "app"-Schema
-- existiert, ist ueber die REST-API schlicht nicht auffindbar (404 "not
-- found"), obwohl sie in der Datenbank selbst einwandfrei existiert und
-- funktioniert. Live entdeckt: der Client bekam beim Aufruf ueberraschend
-- 404 statt 200/403. Dieser Wrapper macht die eigentliche Logik ohne
-- Duplizierung erreichbar, unabhaengig davon, ob "app" zusaetzlich in den
-- "Exposed schemas" des Supabase-Dashboards eingetragen ist oder nicht.
create or replace function public.attack_community_boss(p_month_id text, p_damage integer)
returns table(hp integer, max_hp integer, defeated boolean)
language sql
as $$ select * from app.attack_community_boss(p_month_id, p_damage) $$;

-- Beide Grants noetig: der oeffentliche Wrapper laeuft NICHT als
-- SECURITY DEFINER (bewusst - keine erweiterten Rechte), die aufrufende
-- Rolle braucht deshalb Ausfuehrungsrechte auf BEIDE Funktionen, nicht
-- nur auf den Wrapper. Fehlte bisher fuer app.attack_community_boss()
-- komplett - ein zweiter, unabhaengiger Grund fuer den 404-Fehler.
grant execute on function app.attack_community_boss(text, integer) to authenticated;
grant execute on function public.attack_community_boss(text, integer) to authenticated;


/* ======================================================
   TABELLE: community_boss_damage
   (Firestore: community_boss_damage/{month_uid})
====================================================== */
create table public.community_boss_damage (
  month_id text not null,
  firebase_uid text not null,
  nickname text not null,
  total_damage integer not null default 0,
  avatar text,
  equipped_frame text,
  updated_at timestamptz not null default now(),
  primary key (month_id, firebase_uid),

  constraint boss_damage_nickname_len check (char_length(nickname) between 1 and 30),
  constraint boss_damage_nonneg check (total_damage >= 0)
);

alter table public.community_boss_damage enable row level security;
alter table public.community_boss_damage force row level security;

create or replace function app.old_boss_damage(p_month_id text, p_uid text) returns public.community_boss_damage
language sql stable
as $$ select * from public.community_boss_damage where month_id = p_month_id and firebase_uid = p_uid $$;

create policy "boss_damage_select_public" on public.community_boss_damage
  for select to anon, authenticated using (true);

create policy "boss_damage_insert_own" on public.community_boss_damage
  for insert to authenticated
  with check (firebase_uid = app.firebase_uid() and total_damage <= 45);

create policy "boss_damage_update_own" on public.community_boss_damage
  for update to authenticated
  using (firebase_uid = app.firebase_uid())
  with check (
    firebase_uid = app.firebase_uid()
    and total_damage <= coalesce((app.old_boss_damage(month_id, firebase_uid)).total_damage, 0) + 45
  );

-- kein delete-Policy
