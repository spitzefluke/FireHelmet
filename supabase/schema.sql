/* ======================================================
   SUPABASE SCHEMA - FireHelmet (ergaenzende, NICHT sicherheits-
   kritische Statistik-/Verlaufsdaten)
   ---------------------------------------------------
   WICHTIG - GENAU WIE firestore.rules WIRD DIESE DATEI NICHT
   AUTOMATISCH ANGEWENDET. Einspielen per:
     - Supabase Dashboard -> SQL Editor -> Inhalt einfuegen -> Run
     - ODER (falls die Supabase CLI lokal eingerichtet ist):
       supabase db push
       (siehe https://supabase.com/docs/guides/cli)

   ARCHITEKTUR-ENTSCHEIDUNG (siehe Abschlussbericht der Analyse):
   Alle drei Tabellen sind reine ANHAENGE-Logs / Snapshots, NIEMALS
   die Quelle der Wahrheit fuer Dublonen, Inventar oder sonstige
   sicherheitskritische Werte - die bleiben ausschliesslich in
   Firestore (players/{uid}, ship_repair/{uid}, player_progression/
   {uid}). Firebase Authentication bleibt das fuehrende Auth-System;
   die Firebase-UID wird hier nur als einfacher Text gespeichert.

   SCHREIBWEG (bewusste Entscheidung, siehe Bericht):
   KEINE Tabelle hier erlaubt INSERT/UPDATE/DELETE fuer die Rollen
   "anon" oder "authenticated" - ausschliesslich der Cloudflare
   Worker (supabase/worker/) schreibt, und zwar mit dem service_role
   Key (der RLS grundsaetzlich umgeht, siehe Supabase-Doku "The
   service_role key bypasses Row Level Security"). Der Worker
   verifiziert davor das echte Firebase-ID-Token serverseitig - ein
   manipulierter Client kann dadurch weder eine fremde Firebase-UID
   vortaeuschen noch ueberhaupt direkt in diese Tabellen schreiben.
   Das schliesst Statistik-Faelschung strukturell aus, nicht nur per
   Pruefung.
====================================================== */

-- ------------------------------------------------------
-- 1) SPIELOTHEK-RUNDENVERLAUF
-- Ein Eintrag pro abgeschlossener Spielothek-Runde (z.B. Slot).
-- Das eigentliche, sicherheitskritische Ergebnis (Dublonen-Aenderung)
-- ist zu diesem Zeitpunkt bereits erfolgreich UND server-geprueft
-- in Firestore geschrieben (siehe validSpielothekCooldown() /
-- currency <= oldCurrency + 3000 in firestore.rules) - dieser
-- Eintrag ist eine reine, nachtraegliche Kopie fuer Statistik/
-- Verlauf, niemals die Quelle der eigentlichen Gutschrift.
-- ------------------------------------------------------
create table if not exists public.spielothek_rounds (
  id            bigint generated always as identity primary key,
  firebase_uid  text not null check (char_length(firebase_uid) between 1 and 128),
  game_id       text not null check (char_length(game_id) between 1 and 50),
  bet_amount    integer not null check (bet_amount >= 0 and bet_amount <= 3000),
  payout_amount integer not null check (payout_amount >= 0 and payout_amount <= 3000),
  won           boolean not null,
  played_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists spielothek_rounds_uid_played_idx
  on public.spielothek_rounds (firebase_uid, played_at desc);

alter table public.spielothek_rounds enable row level security;
alter table public.spielothek_rounds force row level security;

-- Nur die eigenen Runden sind lesbar (kein oeffentlicher Feed noetig,
-- anders als beim Community-Boss weiter unten).
create policy "spielothek_rounds: eigene Runden lesen"
  on public.spielothek_rounds
  for select
  to authenticated
  using (firebase_uid = (auth.jwt() ->> 'sub'));

-- Bewusst KEINE insert/update/delete-Policy fuer anon/authenticated:
-- Standardverhalten von Postgres RLS ist "alles verboten, was nicht
-- explizit erlaubt ist" - nur service_role (Worker) darf schreiben.


-- ------------------------------------------------------
-- 2) COMMUNITY-BOSS ANGRIFFS-LOG
-- Ergaenzt community_boss_damage/{monthId_uid} in Firestore (das
-- dort gespeicherte Feld ist eine laufende SUMME pro Spieler/Monat,
-- kein Verlauf einzelner Angriffe). Ermoeglicht z.B. einen
-- "letzte Treffer"-Feed. Der autoritative HP-Wert des Bosses bleibt
-- ausschliesslich in Firestore (community_boss/{monthId}).
-- ------------------------------------------------------
create table if not exists public.community_boss_attacks (
  id           bigint generated always as identity primary key,
  firebase_uid text not null check (char_length(firebase_uid) between 1 and 128),
  nickname     text not null check (char_length(nickname) between 1 and 30),
  month_id     text not null check (month_id ~ '^\d{4}-\d{2}$'),
  damage       integer not null check (damage >= 0 and damage <= 45),
  created_at   timestamptz not null default now()
);

create index if not exists community_boss_attacks_month_idx
  on public.community_boss_attacks (month_id, created_at desc);

alter table public.community_boss_attacks enable row level security;
alter table public.community_boss_attacks force row level security;

-- Oeffentlich lesbar, genau wie community_boss_damage in Firestore
-- (allow read: if true) - ein oeffentlicher Angriffs-Feed ist keine
-- private Information.
create policy "community_boss_attacks: oeffentlich lesbar"
  on public.community_boss_attacks
  for select
  to anon, authenticated
  using (true);

-- Auch hier: kein insert/update/delete fuer anon/authenticated.


-- ------------------------------------------------------
-- 3) RANGLISTEN-SNAPSHOTS (historisch)
-- KEINE Live-Rangliste (die bleibt aus players/* in Firestore
-- direkt berechnet, siehe wheel.js) - reine periodische Momentauf-
-- nahmen (z.B. woechentlich/monatlich Top 10) fuer einen "Verlauf"/
-- Rueckblick. Wird durch einen geplanten Job (Cloudflare Cron
-- Trigger auf demselben Worker, siehe supabase/worker/README.md)
-- befuellt, NIEMALS durch eine einzelne Spieler-Aktion.
-- ------------------------------------------------------
create table if not exists public.leaderboard_snapshots (
  id           bigint generated always as identity primary key,
  period_type  text not null check (period_type in ('week', 'month')),
  period_key   text not null check (char_length(period_key) between 1 and 20),
  rank         integer not null check (rank >= 1 and rank <= 100),
  firebase_uid text not null check (char_length(firebase_uid) between 1 and 128),
  nickname     text not null check (char_length(nickname) between 1 and 30),
  score        integer not null check (score >= 0),
  captured_at  timestamptz not null default now()
);

create unique index if not exists leaderboard_snapshots_period_rank_idx
  on public.leaderboard_snapshots (period_type, period_key, rank);

alter table public.leaderboard_snapshots enable row level security;
alter table public.leaderboard_snapshots force row level security;

create policy "leaderboard_snapshots: oeffentlich lesbar"
  on public.leaderboard_snapshots
  for select
  to anon, authenticated
  using (true);

-- Auch hier: kein insert/update/delete fuer anon/authenticated.
