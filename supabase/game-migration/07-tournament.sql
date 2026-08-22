/* ======================================================
   THE CHALLENGE - K.O.-TURNIER MIT ECHTEM PREIS (limitierte Cap)
   ---------------------------------------------------
   Baut auf 01-players-ship-progression.sql auf (app.firebase_uid()/
   app.is_admin() muessen bereits existieren).

   GRUNDIDEE: vier Tabellen (tournaments/tournament_participants/
   tournament_matches/tournament_prize), alle Zustandsuebergaenge
   (Turnier starten, Match-Ergebnis eintragen, Gewinner in die
   naechste Runde vorruecken, Preis vergeben) laufen ausschliesslich
   ueber SECURITY DEFINER-Funktionen statt ueber direkte RLS-
   UPDATE-Policies fuer "authenticated" - anders als bei
   attack_community_boss() (SECURITY INVOKER + Policy), weil hier
   eine einzelne Aktion oft ZEILEN VERAENDERT, die dem aufrufenden
   Spieler gar nicht "gehoeren" (den Verlierer als eliminiert
   markieren, den Sieger in ein fremdes Match der naechsten Runde
   eintragen). Eine RLS-Policy kann das nicht sauber ausdruecken,
   ohne im Ergebnis JEDEM authentifizierten Nutzer Schreibrechte auf
   fremde Zeilen zu geben. Die Tabellen selbst haben deshalb bewusst
   KEINE Insert-/Update-Policy fuer normale Nutzer bei matches/
   tournaments/prize - der einzige Schreibweg ist die jeweilige
   Funktion, die die komplette Pruefung selbst uebernimmt.

   SICHERHEIT VON SECURITY DEFINER: laeuft mit den Rechten des
   Funktions-EIGENTUEMERS (hier: der Migrations-Rolle, die volle
   Tabellenrechte hat), nicht des Aufrufers - deshalb JEDE Pruefung
   (Identitaet, Zustand, Grenzen) explizit IN der Funktion selbst,
   nichts wird "nebenbei" durch eine aeussere Policy abgefangen.
   "set search_path" fest auf public/app gesetzt (Postgres-Empfehlung
   fuer SECURITY DEFINER, verhindert Search-Path-Hijacking - bei den
   bisherigen SECURITY INVOKER-Funktionen dieses Projekts nicht
   noetig, hier zum ersten Mal relevant).

   PREISVERGABE: exakt das giveaway_winners-Prinzip (siehe
   05-site-data.sql) - tournament_prize hat eine feste Primary-Key-
   Zeile ('cap'). Ein zweiter INSERT-Versuch fuer dieselbe ID
   scheitert schon an der Datenbank selbst (Unique-Verletzung), ganz
   ohne eigene Sperr-Logik. Kein Client kann diese Zeile ueberhaupt
   direkt beschreiben (keine Insert-/Update-Policy fuer normale
   Nutzer) - der einzige Weg ist die interne Match-Aufloesung beim
   Finale, siehe app.tournament_resolve_match().

   UNGLEICHE TEILNEHMERZAHL ("nicht immer exakt 16 Spieler"): beim
   Turnierstart waehlt app.admin_start_tournament() die kleinste
   Zweierpotenz aus {4,8,16}, die mindestens so gross ist wie die
   Anmeldezahl (mind. 4 Teilnehmer noetig) - ueberzaehlige Plaetze
   werden mit Freilosen ('BYE'-Sentinel-Wert statt einer echten UUID
   in player_1_uid/player_2_uid) aufgefuellt. Ein Freilos-Match wird
   SOFORT aufgeloest (kein "Spiel gegen niemanden"), der Sieger rueckt
   direkt vor - das kann kaskadieren, deckt aber auch Runden > 1 ab.
====================================================== */

/* ======================================================
   TABELLE: tournaments
====================================================== */
create table public.tournaments (
  id text primary key,
  status text not null default 'registration',
  bracket_size integer,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  winner_uid text,
  winner_nickname text,

  constraint tournaments_status_valid check (status in ('registration', 'active', 'finished')),
  constraint tournaments_bracket_size_valid check (bracket_size is null or bracket_size in (4, 8, 16)),
  constraint tournaments_winner_nickname_len check (winner_nickname is null or char_length(winner_nickname) between 1 and 30)
);

alter table public.tournaments enable row level security;
alter table public.tournaments force row level security;

-- Strukturelle Garantie "immer nur EIN offenes Turnier gleichzeitig":
-- ein Unique-Index auf einem konstanten Ausdruck, gefiltert auf die
-- "offenen" Stati - eine zweite Zeile mit status in (...) verletzt
-- automatisch die Eindeutigkeit, unabhaengig von ihrer id. Erspart
-- eine eigene "gibt es schon ein offenes Turnier?"-Pruefung in
-- app.admin_create_tournament().
create unique index tournaments_one_open_idx on public.tournaments ((true))
  where status in ('registration', 'active');

create policy "tournaments_select_public" on public.tournaments
  for select to anon, authenticated using (true);

-- Bewusst KEINE insert-/update-/delete-Policy fuer anon/authenticated:
-- jede Zustandsaenderung laeuft ausschliesslich ueber die admin_*-
-- Funktionen unten (SECURITY DEFINER, pruefen app.is_admin() selbst)
-- bzw. ueber app.tournament_resolve_match() beim Finale.


/* ======================================================
   TABELLE: tournament_participants
====================================================== */
create table public.tournament_participants (
  tournament_id text not null references public.tournaments(id),
  firebase_uid text not null,
  nickname text not null,
  eliminated boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (tournament_id, firebase_uid),

  constraint tournament_participants_nickname_len check (char_length(nickname) between 1 and 30)
);

alter table public.tournament_participants enable row level security;
alter table public.tournament_participants force row level security;

create policy "tournament_participants_select_public" on public.tournament_participants
  for select to anon, authenticated using (true);

-- Beitreten ist die EINZIGE direkte Schreiboperation, die ein
-- normaler Nutzer auf dieser Tabelle hat - nur waehrend das Turnier
-- noch in der Anmeldephase ist, nur fuer sich selbst. Der zusammen-
-- gesetzte Primary Key verhindert doppelte Anmeldung automatisch
-- (zweiter INSERT-Versuch scheitert an der Unique-Verletzung).
create policy "tournament_participants_insert_own" on public.tournament_participants
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and char_length(nickname) between 1 and 30
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_participants.tournament_id and t.status = 'registration'
    )
  );

-- Kein update-/delete-Policy fuer anon/authenticated: "eliminated"
-- wird ausschliesslich durch app.tournament_resolve_match() gesetzt,
-- niemand darf sich selbst nachtraeglich wieder "un-eliminieren" oder
-- austragen.


/* ======================================================
   TABELLE: tournament_matches
   ---------------------------------------------------
   status: 'pending' (mind. ein Spieler-Slot noch nicht bekannt) ->
   'open' (beide Slots echte Spieler, noch kein Ergebnis) ->
   'complete' (Sieger steht fest). player_1_uid/player_2_uid sind
   bewusst "text" statt "uuid" (wie firebase_uid ueberall im Projekt)
   - genau deshalb kann hier zusaetzlich der Sentinel-Wert 'BYE'
   (Freilos, kein echter Spieler) hineingeschrieben werden, ohne den
   Spaltentyp aufzuweichen.
====================================================== */
create table public.tournament_matches (
  id bigint generated always as identity primary key,
  tournament_id text not null references public.tournaments(id),
  round integer not null,
  match_index integer not null,
  player_1_uid text,
  player_2_uid text,
  player_1_nickname text,
  player_2_nickname text,
  player_1_score integer,
  player_2_score integer,
  player_1_played_at timestamptz,
  player_2_played_at timestamptz,
  winner_uid text,
  status text not null default 'pending',
  updated_at timestamptz not null default now(),

  unique (tournament_id, round, match_index),
  constraint tournament_matches_status_valid check (status in ('pending', 'open', 'complete')),
  constraint tournament_matches_round_positive check (round >= 1),
  constraint tournament_matches_score_range check (
    (player_1_score is null or player_1_score between 0 and 20000)
    and (player_2_score is null or player_2_score between 0 and 20000)
  )
);

alter table public.tournament_matches enable row level security;
alter table public.tournament_matches force row level security;

create policy "tournament_matches_select_public" on public.tournament_matches
  for select to anon, authenticated using (true);

-- Bewusst KEINE insert-/update-/delete-Policy fuer anon/authenticated:
-- Matches werden ausschliesslich von den Funktionen unten angelegt/
-- veraendert (Bracket-Aufbau, Score-Abgabe, Sieger-Vorruecken).


/* ======================================================
   TABELLE: tournament_prize ("Die limitierte Cap")
   ---------------------------------------------------
   Feste Primary-Key-Zeile ('cap') statt einer generischen ID -
   genau das giveaway_winners-Prinzip aus 05-site-data.sql. Ein
   zweiter INSERT fuer dieselbe ID scheitert strukturell an der
   Datenbank selbst, unabhaengig von jeder Anwendungslogik.
====================================================== */
create table public.tournament_prize (
  id text primary key default 'cap',
  tournament_id text not null references public.tournaments(id),
  winner_uid text not null,
  winner_nickname text not null,
  claimed_at timestamptz not null default now(),
  fulfilled boolean not null default false,
  fulfilled_at timestamptz,

  constraint tournament_prize_id_fixed check (id = 'cap'),
  constraint tournament_prize_nickname_len check (char_length(winner_nickname) between 1 and 30)
);

alter table public.tournament_prize enable row level security;
alter table public.tournament_prize force row level security;

create policy "tournament_prize_select_public" on public.tournament_prize
  for select to anon, authenticated using (true);

-- Einzige erlaubte direkte Schreiboperation fuer "authenticated":
-- der Admin darf nachtraeglich "fulfilled" (Cap tatsaechlich
-- verschickt/uebergeben) markieren - alles andere an dieser Zeile
-- (wer gewonnen hat, wann) ist bereits unveraenderlich per Turnier-
-- Abschluss gesetzt.
create policy "tournament_prize_update_admin" on public.tournament_prize
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin() and id = 'cap');

-- Kein insert-/delete-Policy fuer anon/authenticated: die einzige
-- Zeile entsteht ausschliesslich in app.tournament_resolve_match()
-- beim entschiedenen Finale.


/* ======================================================
   INTERNE FUNKTIONEN (nicht direkt vom Client aufgerufen, daher
   kein public.*-Wrapper und kein Grant an "authenticated" noetig -
   werden ausschliesslich aus anderen app.*-Funktionen heraus
   aufgerufen, siehe unten).
====================================================== */

-- Traegt den Sieger eines abgeschlossenen Matches in den passenden
-- Slot der naechsten Runde ein. match_index-Paritaet bestimmt den
-- Slot deterministisch (gerade -> Spieler 1, ungerade -> Spieler 2)
-- - kein "freien Slot suchen" noetig, dadurch auch keine Race
-- Condition zwischen den beiden Feeder-Matches moeglich (jedes
-- schreibt in seine eigene, feste Spalte). Ist die Folge-Runde
-- bereits vollstaendig befuellt UND einer der beiden Slots ist ein
-- Freilos, wird das Folge-Match sofort mit-aufgeloest (Kaskade).
create or replace function app.tournament_place_in_next_match(
  p_tournament_id text,
  p_round integer,
  p_match_index integer,
  p_winner_uid text,
  p_winner_nickname text
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  next_round integer := p_round + 1;
  next_match_index integer := p_match_index / 2;
  is_slot_1 boolean := (p_match_index % 2 = 0);
  nm public.tournament_matches;
begin
  if not exists (
    select 1 from public.tournament_matches
    where tournament_id = p_tournament_id and round = next_round and match_index = next_match_index
  ) then
    return; -- p_round war bereits das Finale -> nichts mehr vorzurruecken
  end if;

  if is_slot_1 then
    update public.tournament_matches
      set player_1_uid = p_winner_uid, player_1_nickname = p_winner_nickname, updated_at = now()
      where tournament_id = p_tournament_id and round = next_round and match_index = next_match_index
      returning * into nm;
  else
    update public.tournament_matches
      set player_2_uid = p_winner_uid, player_2_nickname = p_winner_nickname, updated_at = now()
      where tournament_id = p_tournament_id and round = next_round and match_index = next_match_index
      returning * into nm;
  end if;

  if nm.player_1_uid is not null and nm.player_2_uid is not null then
    if nm.player_1_uid = 'BYE' then
      perform app.tournament_resolve_match(nm.id, nm.player_2_uid, true);
    elsif nm.player_2_uid = 'BYE' then
      perform app.tournament_resolve_match(nm.id, nm.player_1_uid, true);
    else
      update public.tournament_matches set status = 'open', updated_at = now() where id = nm.id;
    end if;
  end if;
end;
$$;

-- Schliesst ein Match ab: setzt den Sieger, markiert den Verlierer
-- als eliminiert (ausser bei einem Freilos - da gibt es keinen
-- echten Verlierer), und rueckt entweder in die naechste Runde vor
-- oder - falls dies das Finale war - schliesst das gesamte Turnier
-- ab und versucht GENAU EINMAL den Preis-Claim (siehe Tabellen-
-- Kommentar oben zu tournament_prize).
create or replace function app.tournament_resolve_match(
  p_match_id bigint,
  p_winner_uid text,
  p_via_bye boolean
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  m public.tournament_matches;
  t public.tournaments;
  final_round integer;
  loser_uid text;
  winner_nick text;
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  select * into t from public.tournaments where id = m.tournament_id for update;

  update public.tournament_matches
    set winner_uid = p_winner_uid, status = 'complete', updated_at = now()
    where id = p_match_id;

  if not p_via_bye then
    loser_uid := case when m.player_1_uid = p_winner_uid then m.player_2_uid else m.player_1_uid end;
    if loser_uid is not null and loser_uid <> 'BYE' then
      update public.tournament_participants
        set eliminated = true
        where tournament_id = m.tournament_id and firebase_uid = loser_uid;
    end if;
  end if;

  winner_nick := case when m.player_1_uid = p_winner_uid then m.player_1_nickname else m.player_2_nickname end;
  final_round := case t.bracket_size when 4 then 2 when 8 then 3 when 16 then 4 end;

  if m.round >= final_round then
    update public.tournaments
      set status = 'finished', finished_at = now(), winner_uid = p_winner_uid, winner_nickname = winner_nick
      where id = t.id;

    insert into public.tournament_prize (id, tournament_id, winner_uid, winner_nickname)
      values ('cap', t.id, p_winner_uid, winner_nick)
      on conflict (id) do nothing;
  else
    perform app.tournament_place_in_next_match(m.tournament_id, m.round, m.match_index, p_winner_uid, winner_nick);
  end if;
end;
$$;


/* ======================================================
   OEFFENTLICHE FUNKTIONEN (per supabaseClient.rpc(...) aufrufbar)
====================================================== */

-- Admin: neues Turnier in der Anmeldephase eroeffnen. p_id wird vom
-- Admin-Panel vorgegeben (z.B. "t-2026-1"), nicht automatisch
-- generiert - haelt die ID lesbar/planbar. Der Unique-Index oben
-- verhindert ein zweites gleichzeitig offenes Turnier von selbst.
create or replace function app.admin_create_tournament(p_id text) returns public.tournaments
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare row_out public.tournaments;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_id is null or char_length(p_id) < 1 or char_length(p_id) > 40 then
    raise exception 'invalid-id';
  end if;
  insert into public.tournaments (id, status) values (p_id, 'registration') returning * into row_out;
  return row_out;
end;
$$;

create or replace function public.admin_create_tournament(p_id text) returns public.tournaments
language sql
as $$ select * from app.admin_create_tournament(p_id) $$;

grant execute on function app.admin_create_tournament(text) to authenticated;
grant execute on function public.admin_create_tournament(text) to authenticated;


-- Admin: Turnier abbrechen, SOLANGE es noch in der Anmeldephase ist
-- (bewusst kein Reset eines bereits laufenden Turniers - das wuerde
-- echte, bereits gespielte Matches zerstoeren; ein haengengebliebenes
-- aktives Turnier bleibt einsehbar und kann manuell zu Ende gefuehrt
-- werden statt destruktiv zurueckgesetzt zu werden).
create or replace function app.admin_reset_tournament(p_tournament_id text) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare t public.tournaments;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament-not-found';
  end if;
  if t.status <> 'registration' then
    raise exception 'can-only-reset-before-start';
  end if;
  delete from public.tournament_participants where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;

create or replace function public.admin_reset_tournament(p_tournament_id text) returns void
language sql
as $$ select app.admin_reset_tournament(p_tournament_id) $$;

grant execute on function app.admin_reset_tournament(text) to authenticated;
grant execute on function public.admin_reset_tournament(text) to authenticated;


-- Admin: Turnier pausieren/fortsetzen (app.tournament_submit_score
-- lehnt Einreichungen ab, solange paused = true).
create or replace function app.admin_set_tournament_paused(p_tournament_id text, p_paused boolean) returns public.tournaments
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare row_out public.tournaments;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  update public.tournaments set paused = p_paused where id = p_tournament_id returning * into row_out;
  if not found then
    raise exception 'tournament-not-found';
  end if;
  return row_out;
end;
$$;

create or replace function public.admin_set_tournament_paused(p_tournament_id text, p_paused boolean) returns public.tournaments
language sql
as $$ select * from app.admin_set_tournament_paused(p_tournament_id, p_paused) $$;

grant execute on function app.admin_set_tournament_paused(text, boolean) to authenticated;
grant execute on function public.admin_set_tournament_paused(text, boolean) to authenticated;


-- Admin: Turnier aus der Anmeldephase heraus starten - baut den
-- kompletten Bracket auf einmal auf (siehe Kommentar am Dateianfang
-- zur Freilos-Verteilung).
create or replace function app.admin_start_tournament(p_tournament_id text) returns public.tournaments
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  t public.tournaments;
  n integer;
  bsize integer;
  total_rounds integer;
  matches_r1 integer;
  byes integer;
  real_uids text[] := '{}';
  real_nicks text[] := '{}';
  idx integer := 1;
  r integer;
  matches_in_round integer;
  i integer;
  p1 text; p2 text; n1 text; n2 text;
  new_match_id bigint;
  rec record;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament-not-found';
  end if;
  if t.status <> 'registration' then
    raise exception 'tournament-already-started';
  end if;

  select count(*) into n from public.tournament_participants where tournament_id = p_tournament_id;
  if n < 4 then
    raise exception 'not-enough-players';
  end if;

  bsize := case when n <= 4 then 4 when n <= 8 then 8 else 16 end;
  total_rounds := case bsize when 4 then 2 when 8 then 3 when 16 then 4 end;
  matches_r1 := bsize / 2;

  -- Zufaellig gemischte Teilnehmerliste. Bei mehr als 16 Anmeldungen
  -- zaehlen nur die ersten 16 in Beitrittsreihenfolge (einfachste,
  -- faire Kappung statt einer komplexen Warteschlange fuer spaetere
  -- Turniere).
  for rec in
    select firebase_uid, nickname from public.tournament_participants
    where tournament_id = p_tournament_id
    order by joined_at asc
    limit 16
  loop
    real_uids := array_append(real_uids, rec.firebase_uid);
    real_nicks := array_append(real_nicks, rec.nickname);
  end loop;
  -- Innerhalb der (ggf. auf 16 gekappten) Teilnehmerliste zusaetzlich
  -- zufaellig mischen, damit "wer zuerst kommt" nicht zugleich "wer
  -- gegen wen spielt" bestimmt. Muss ueber EINE gemeinsame Zufalls-
  -- reihenfolge laufen (nicht zwei separate random()-Sortierungen je
  -- Array), sonst reissen Name und UID auseinander.
  select array_agg(x), array_agg(y)
    into real_uids, real_nicks
    from (
      select x, y from unnest(real_uids, real_nicks) as shuffle_pairs(x, y) order by random()
    ) shuffled;

  byes := bsize - n;
  -- byes < matches_r1 ist durch die bsize-Wahl (kleinste Zweierpotenz
  -- >= n) immer garantiert, siehe Dateikopf-Kommentar - jedes
  -- Freilos landet dadurch strukturell in einem eigenen Match, nie
  -- zwei Freilose im selben Match gegeneinander.

  update public.tournaments
    set status = 'active', bracket_size = bsize, started_at = now()
    where id = p_tournament_id;

  -- Alle Runden als leere Platzhalter anlegen, damit der komplette
  -- Turnierbaum von Anfang an existiert (spaetere Runden werden erst
  -- durch app.tournament_place_in_next_match() befuellt).
  for r in 1..total_rounds loop
    matches_in_round := bsize / (2 ^ r)::integer;
    for i in 0..(matches_in_round - 1) loop
      insert into public.tournament_matches (tournament_id, round, match_index, status)
        values (p_tournament_id, r, i, 'pending');
    end loop;
  end loop;

  -- Runde 1 mit den gemischten Spielern befuellen; die ersten "byes"
  -- Matches bekommen ein Freilos in Slot 2, der Rest zwei echte
  -- Spieler.
  for i in 0..(matches_r1 - 1) loop
    p1 := real_uids[idx]; n1 := real_nicks[idx]; idx := idx + 1;
    if i < byes then
      p2 := 'BYE'; n2 := null;
    else
      p2 := real_uids[idx]; n2 := real_nicks[idx]; idx := idx + 1;
    end if;

    update public.tournament_matches
      set player_1_uid = p1, player_1_nickname = n1,
          player_2_uid = p2, player_2_nickname = n2,
          status = case when p2 = 'BYE' then 'pending' else 'open' end,
          updated_at = now()
      where tournament_id = p_tournament_id and round = 1 and match_index = i
      returning id into new_match_id;

    if p2 = 'BYE' then
      perform app.tournament_resolve_match(new_match_id, p1, true);
    end if;
  end loop;

  select * into t from public.tournaments where id = p_tournament_id;
  return t;
end;
$$;

create or replace function public.admin_start_tournament(p_tournament_id text) returns public.tournaments
language sql
as $$ select * from app.admin_start_tournament(p_tournament_id) $$;

grant execute on function app.admin_start_tournament(text) to authenticated;
grant execute on function public.admin_start_tournament(text) to authenticated;


-- Spieler: Ergebnis der eigenen Mini-Game-Challenge fuer ein Match
-- einreichen. p_score_ms ist eine niedriger-ist-besser-Kennzahl
-- (siehe ReactionGame: Reaktionszeit in Millisekunden) - bewusst nur
-- EINE Zahl, damit spaeter andere Mini-Games (ClickSpeedGame,
-- MemoryGame, ...) denselben Aufruf mit ihrer eigenen Metrik
-- wiederverwenden koennen, solange "niedriger gewinnt" gilt.
-- Serverseitige Plausibilitaetsgrenze (50-10000ms) verhindert
-- offensichtliche Manipulation (0/negative/absurd hohe Werte) - siehe
-- Konzept-Notiz zu den Grenzen echter Anti-Cheat-Moeglichkeiten bei
-- einem rein clientseitig gemessenen Mini-Game.
create or replace function app.tournament_submit_score(p_match_id bigint, p_score_ms integer)
returns table(match_status text, winner_uid text)
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  caller_uid text := auth.uid()::text;
  m public.tournament_matches;
  t public.tournaments;
  is_p1 boolean;
  computed_winner text;
begin
  if caller_uid is null then
    raise exception 'not-signed-in';
  end if;
  if p_score_ms is null or p_score_ms < 50 or p_score_ms > 10000 then
    raise exception 'invalid-score';
  end if;

  select * into m from public.tournament_matches where id = p_match_id for update;
  if not found then
    raise exception 'match-not-found';
  end if;

  select * into t from public.tournaments where id = m.tournament_id;
  if t.status <> 'active' then
    raise exception 'tournament-not-active';
  end if;
  if t.paused then
    raise exception 'tournament-paused';
  end if;

  if m.status = 'complete' then
    raise exception 'match-already-complete';
  end if;
  if m.status <> 'open' then
    raise exception 'match-not-ready';
  end if;

  if m.player_1_uid = caller_uid then
    is_p1 := true;
  elsif m.player_2_uid = caller_uid then
    is_p1 := false;
  else
    raise exception 'not-your-match';
  end if;

  if is_p1 and m.player_1_score is not null then
    raise exception 'already-played';
  end if;
  if not is_p1 and m.player_2_score is not null then
    raise exception 'already-played';
  end if;

  if is_p1 then
    update public.tournament_matches
      set player_1_score = p_score_ms, player_1_played_at = now(), updated_at = now()
      where id = p_match_id
      returning * into m;
  else
    update public.tournament_matches
      set player_2_score = p_score_ms, player_2_played_at = now(), updated_at = now()
      where id = p_match_id
      returning * into m;
  end if;

  if m.player_1_score is not null and m.player_2_score is not null then
    if m.player_1_score < m.player_2_score then
      computed_winner := m.player_1_uid;
    elsif m.player_2_score < m.player_1_score then
      computed_winner := m.player_2_uid;
    elsif m.player_1_played_at <= m.player_2_played_at then
      computed_winner := m.player_1_uid; -- exaktes Gleichstand: wer zuerst abgegeben hat
    else
      computed_winner := m.player_2_uid;
    end if;

    perform app.tournament_resolve_match(m.id, computed_winner, false);
    return query select 'complete'::text, computed_winner;
  else
    return query select 'waiting-for-opponent'::text, null::text;
  end if;
end;
$$;

create or replace function public.tournament_submit_score(p_match_id bigint, p_score_ms integer)
returns table(match_status text, winner_uid text)
language sql
as $$ select * from app.tournament_submit_score(p_match_id, p_score_ms) $$;

grant execute on function app.tournament_submit_score(bigint, integer) to authenticated;
grant execute on function public.tournament_submit_score(bigint, integer) to authenticated;
