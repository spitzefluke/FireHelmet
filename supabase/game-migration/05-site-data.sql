/* ======================================================
   FIRESTORE -> SUPABASE MIGRATION, PHASE 3
   site_config / site_meta / giveawayEntries / giveawayWinners /
   supportReports / site_ratings
   ---------------------------------------------------
   Baut auf 01-players-ship-progression.sql auf (app.firebase_uid()/
   app.is_admin() muessen bereits existieren).
====================================================== */

/* ======================================================
   TABELLE: site_config (Firestore: site_config/{docId}, meist "main")
   ---------------------------------------------------
   Firestore validiert hier ABSICHTLICH kein einzelnes Feld (nur
   isAdmin()) - Admin-Gateway darf beliebige Konfigurationswerte
   setzen (Countdown-Termine, gesperrte Kapitel, deaktivierte Spiele,
   ...). Ein JSONB-Blob ist die treueste Entsprechung dieser bewusst
   unvalidierten Struktur, statt Spalten zu erfinden, die im Original
   gar nicht geprueft werden.
====================================================== */
create table public.site_config (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_config enable row level security;
alter table public.site_config force row level security;

create policy "site_config_select_public" on public.site_config
  for select to anon, authenticated using (true);

create policy "site_config_write_admin" on public.site_config
  for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- kein delete-Policy noetig (die "all"-Policy oben deckt bereits
-- insert/update/delete fuer den Admin ab - Firestore hat ebenfalls
-- kein explizites delete:false hier, "allow write" deckt alles ab)


/* ======================================================
   TABELLE: site_meta (Firestore: site_meta/{docId}, z.B. "update_notice")
====================================================== */
create table public.site_meta (
  id text primary key,
  last_sent_hash text not null,
  sent_at timestamptz,

  constraint site_meta_hash_len check (char_length(last_sent_hash) <= 50)
);

alter table public.site_meta enable row level security;
alter table public.site_meta force row level security;

create policy "site_meta_select_public" on public.site_meta
  for select to anon, authenticated using (true);

create policy "site_meta_write_signed_in" on public.site_meta
  for insert to authenticated
  with check (char_length(last_sent_hash) <= 50);

create policy "site_meta_update_signed_in" on public.site_meta
  for update to authenticated
  using (true)
  with check (char_length(last_sent_hash) <= 50);

-- kein delete-Policy -> Firestore "allow delete: if false"


/* ======================================================
   TABELLE: giveaway_entries (Firestore: giveawayEntries/{giveawayId_uid})
   ---------------------------------------------------
   Echter zusammengesetzter Primary Key statt Firestores
   "Dokument-ID = giveawayId_uid"-Konstruktion.
====================================================== */
create table public.giveaway_entries (
  giveaway_id text not null,
  firebase_uid text not null,
  nickname text not null,
  joined_at timestamptz not null default now(),
  primary key (giveaway_id, firebase_uid),

  constraint giveaway_entries_nickname_len check (char_length(nickname) between 1 and 30)
);

alter table public.giveaway_entries enable row level security;
alter table public.giveaway_entries force row level security;

create policy "giveaway_entries_select_public" on public.giveaway_entries
  for select to anon, authenticated using (true);

create policy "giveaway_entries_insert_own" on public.giveaway_entries
  for insert to authenticated
  with check (firebase_uid = app.firebase_uid());

-- kein update-/delete-Policy -> Firestore "allow update/delete: if false"
-- (niemand darf sich wieder austragen oder fuer andere teilnehmen)


/* ======================================================
   TABELLE: giveaway_winners (Firestore: giveawayWinners/{roundId})
   ---------------------------------------------------
   round_id als Primary Key sorgt bereits strukturell dafuer, dass
   ein zweiter Zug fuer dieselbe Runde an einer Unique-Verletzung
   scheitert - zusaetzlich zur fehlenden update-Policy.
====================================================== */
create table public.giveaway_winners (
  round_id text primary key,
  winners jsonb not null,
  created_at timestamptz not null default now(),

  constraint giveaway_winners_is_array check (jsonb_typeof(winners) = 'array'),
  constraint giveaway_winners_size check (jsonb_array_length(winners) <= 10)
);

alter table public.giveaway_winners enable row level security;
alter table public.giveaway_winners force row level security;

create policy "giveaway_winners_select_public" on public.giveaway_winners
  for select to anon, authenticated using (true);

create policy "giveaway_winners_insert_signed_in" on public.giveaway_winners
  for insert to authenticated
  with check (jsonb_typeof(winners) = 'array' and jsonb_array_length(winners) <= 10);

-- kein update-/delete-Policy -> Firestore "allow update/delete: if false"


/* ======================================================
   TABELLE: support_reports (Firestore: supportReports/{reportId})
   ---------------------------------------------------
   Firestore: "allow read: if false" - NIEMAND (auch kein normaler
   authenticated-Nutzer) darf lesen, nur der Projekt-Owner ueber die
   Konsole (die RLS umgeht). Entsprechung hier: bewusst KEINE
   select-Policy fuer anon/authenticated - nur service_role (per
   Supabase-Dashboard/Table-Editor mit eigenem Login) kann lesen.
====================================================== */
create table public.support_reports (
  id bigint generated always as identity primary key,
  message text not null,
  created_at timestamptz not null default now(),

  constraint support_reports_msg_len check (char_length(message) between 1 and 2000)
);

alter table public.support_reports enable row level security;
alter table public.support_reports force row level security;

create policy "support_reports_insert_signed_in" on public.support_reports
  for insert to authenticated
  with check (char_length(message) between 1 and 2000);

-- bewusst KEINE select-Policy, KEINE update-/delete-Policy


/* ======================================================
   TABELLE: site_ratings (Firestore: site_ratings/{ratingId})
====================================================== */
create table public.site_ratings (
  id bigint generated always as identity primary key,
  value integer not null,
  nickname text not null,
  comment text,
  created_at timestamptz not null default now(),

  constraint site_ratings_value_range check (value >= 1 and value <= 5),
  constraint site_ratings_nickname_len check (char_length(nickname) <= 30),
  constraint site_ratings_comment_len check (comment is null or char_length(comment) <= 500)
);

alter table public.site_ratings enable row level security;
alter table public.site_ratings force row level security;

create policy "site_ratings_select_public" on public.site_ratings
  for select to anon, authenticated using (true);

create policy "site_ratings_insert_signed_in" on public.site_ratings
  for insert to authenticated
  with check (
    value >= 1 and value <= 5
    and char_length(nickname) <= 30
    and (comment is null or char_length(comment) <= 500)
  );

-- kein update-/delete-Policy -> Firestore "allow update/delete: if false"
