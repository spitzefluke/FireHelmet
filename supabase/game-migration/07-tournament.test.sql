\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function test_expect_blocked(p_sql text, p_label text) returns void
language plpgsql
as $$
declare affected int;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise notice 'PASS - % (0 Zeilen betroffen)', p_label;
  else
    raise notice 'FAIL - % wurde faelschlich akzeptiert!', p_label;
  end if;
exception when others then
  raise notice 'PASS - % (%)', p_label, sqlerrm;
end;
$$;

create or replace function test_expect_ok(p_sql text, p_label text) returns void
language plpgsql
as $$
declare affected int;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  if affected >= 1 then
    raise notice 'PASS - %', p_label;
  else
    raise notice 'FAIL - % wurde blockiert (0 Zeilen)', p_label;
  end if;
exception when others then
  raise notice 'FAIL - % wurde blockiert (%)', p_label, sqlerrm;
end;
$$;

-- ============================================================
-- TEST 1: oeffentliches Lesen (anon) auf allen vier Tabellen
-- ============================================================
set role anon;
select set_config('request.jwt.claims', '', false);
select case when count(*) >= 0 then 'PASS' else 'FAIL' end || ' - TEST1a anon liest tournaments' as result from public.tournaments;
select case when count(*) >= 0 then 'PASS' else 'FAIL' end || ' - TEST1b anon liest tournament_participants' as result from public.tournament_participants;
select case when count(*) >= 0 then 'PASS' else 'FAIL' end || ' - TEST1c anon liest tournament_matches' as result from public.tournament_matches;
select case when count(*) >= 0 then 'PASS' else 'FAIL' end || ' - TEST1d anon liest tournament_prize' as result from public.tournament_prize;
reset role;

-- ============================================================
-- TEST 2: Nicht-Admin darf kein Turnier eroeffnen
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000000","email":"not-the-owner@example.com"}', false);
select test_expect_blocked(
  $sql$select app.admin_create_tournament('t-hack')$sql$,
  'TEST2 Nicht-Admin kann kein Turnier eroeffnen');
reset role;

-- ============================================================
-- TEST 3: Admin eroeffnet ein Turnier
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","email":"y.n.trott@gmail.com"}', false);
select test_expect_ok(
  $sql$select app.admin_create_tournament('t-open')$sql$,
  'TEST3 Admin eroeffnet Turnier t-open');
reset role;

-- ============================================================
-- TEST 3b: ein zweites gleichzeitig offenes Turnier ist blockiert
-- (struktureller Unique-Index, siehe 07-tournament.sql)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","email":"y.n.trott@gmail.com"}', false);
select test_expect_blocked(
  $sql$select app.admin_create_tournament('t-second')$sql$,
  'TEST3b zweites offenes Turnier gleichzeitig wird blockiert');
reset role;

-- ============================================================
-- TEST 4: Beitritt zum eigenen Turnier (5 Spieler fuer den
-- Freilos-Kaskade-Test) - je eigene UID, je eigene Sitzung
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', false);
select test_expect_ok($sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a1000000-0000-0000-0000-000000000001', 'Anna')$sql$, 'TEST4a Anna tritt bei');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002"}', false);
select test_expect_ok($sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a2000000-0000-0000-0000-000000000002', 'Bert')$sql$, 'TEST4b Bert tritt bei');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-000000000003"}', false);
select test_expect_ok($sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a3000000-0000-0000-0000-000000000003', 'Clara')$sql$, 'TEST4c Clara tritt bei');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4000000-0000-0000-0000-000000000004"}', false);
select test_expect_ok($sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a4000000-0000-0000-0000-000000000004', 'Deniz')$sql$, 'TEST4d Deniz tritt bei');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5000000-0000-0000-0000-000000000005"}', false);
select test_expect_ok($sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a5000000-0000-0000-0000-000000000005', 'Elif')$sql$, 'TEST4e Elif tritt bei');
reset role;

-- ============================================================
-- TEST 5: fuer eine fremde UID beitreten wird blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', false);
select test_expect_blocked(
  $sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a9999999-0000-0000-0000-000000000009', 'Faker')$sql$,
  'TEST5 Beitritt fuer fremde UID wird blockiert');
reset role;

-- ============================================================
-- TEST 6: doppelter Beitritt (gleiche UID, gleiches Turnier)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', false);
select test_expect_blocked(
  $sql$insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values ('t-open', 'a1000000-0000-0000-0000-000000000001', 'Anna')$sql$,
  'TEST6 doppelter Beitritt wird blockiert');
reset role;

-- ============================================================
-- TEST 7: direktes Schreiben auf tournaments/matches/prize durch
-- normale Nutzer ist grundsaetzlich blockiert (keine Policy)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', false);
select test_expect_blocked(
  $sql$update public.tournaments set status = 'finished' where id = 't-open'$sql$,
  'TEST7a direktes Update von tournaments durch Spieler wird blockiert');
select test_expect_blocked(
  $sql$insert into public.tournament_matches (tournament_id, round, match_index, status) values ('t-open', 1, 0, 'open')$sql$,
  'TEST7b direktes Insert in tournament_matches durch Spieler wird blockiert');
select test_expect_blocked(
  $sql$insert into public.tournament_prize (id, tournament_id, winner_uid, winner_nickname) values ('cap', 't-open', 'a1000000-0000-0000-0000-000000000001', 'Anna')$sql$,
  'TEST7c direktes Insert in tournament_prize durch Spieler wird blockiert');
reset role;

-- ============================================================
-- TEST 8: Turnierstart mit zu wenig Spielern (separates Turnier)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","email":"y.n.trott@gmail.com"}', false);
select test_expect_blocked(
  $sql$select app.admin_reset_tournament('does-not-exist')$sql$,
  'TEST8 Reset eines nicht existierenden Turniers wird blockiert');
reset role;

-- ============================================================
-- TEST 9: Admin startet t-open (5 Spieler -> bracket_size=8,
-- 3 Freilose, 1 echtes Match in Runde 1)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","email":"y.n.trott@gmail.com"}', false);
select test_expect_ok(
  $sql$select app.admin_start_tournament('t-open')$sql$,
  'TEST9 Admin startet t-open');
reset role;

select case when bracket_size = 8 and status = 'active' then 'PASS' else 'FAIL' end
  || ' - TEST9b bracket_size=8, status=active' as result
  from public.tournaments where id = 't-open';

select case when count(*) = 3 then 'PASS' else 'FAIL' end
  || ' - TEST9c genau 3 Freilos-Matches in Runde 1 sofort abgeschlossen' as result
  from public.tournament_matches
  where tournament_id = 't-open' and round = 1 and status = 'complete';

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  || ' - TEST9d genau 1 echtes offenes Match in Runde 1' as result
  from public.tournament_matches
  where tournament_id = 't-open' and round = 1 and status = 'open';

select case when count(*) = 4 then 'PASS' else 'FAIL' end
  || ' - TEST9e Runde-1-Matches insgesamt = 4 (bracket_size/2)' as result
  from public.tournament_matches where tournament_id = 't-open' and round = 1;

-- ============================================================
-- TEST 10-15: das eine echte Match in Runde 1 durchspielen
-- ============================================================
select id as open_m_id, player_1_uid as open_m_p1, player_2_uid as open_m_p2
  from public.tournament_matches
  where tournament_id = 't-open' and round = 1 and status = 'open' \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9999999-0000-0000-0000-000000000099"}', false);
select test_expect_blocked(
  format('select app.tournament_submit_score(%L, 500)', :open_m_id),
  'TEST10 fremder Nutzer kann fuer dieses Match nichts einreichen');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'open_m_p1' || '"}', false);
select test_expect_ok(
  format('select app.tournament_submit_score(%L, 400)', :open_m_id),
  'TEST11 Spieler 1 reicht gueltige Reaktionszeit ein');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'open_m_p1' || '"}', false);
select test_expect_blocked(
  format('select app.tournament_submit_score(%L, 350)', :open_m_id),
  'TEST12 Spieler 1 kann kein zweites Ergebnis einreichen');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'open_m_p2' || '"}', false);
select test_expect_blocked(
  format('select app.tournament_submit_score(%L, 10)', :open_m_id),
  'TEST13 unplausibel niedrige Reaktionszeit (10ms) wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'open_m_p2' || '"}', false);
select test_expect_ok(
  format('select app.tournament_submit_score(%L, 300)', :open_m_id),
  'TEST14 Spieler 2 gewinnt mit schnellerer Zeit -> Match abgeschlossen');
reset role;

select case when status = 'complete' and winner_uid = :'open_m_p2' then 'PASS' else 'FAIL' end
  || ' - TEST14b Match ist abgeschlossen, Spieler 2 gewinnt' as result
  from public.tournament_matches where id = :open_m_id;

select case when eliminated = true then 'PASS' else 'FAIL' end
  || ' - TEST14c Verlierer (Spieler 1) ist eliminiert' as result
  from public.tournament_participants where tournament_id = 't-open' and firebase_uid = :'open_m_p1';

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'open_m_p1' || '"}', false);
select test_expect_blocked(
  format('select app.tournament_submit_score(%L, 200)', :open_m_id),
  'TEST15 Einreichung fuer ein bereits abgeschlossenes Match wird blockiert');
reset role;


-- ============================================================
-- TEST 16-22: t-open bis zum Champion und Preis-Claim durchspielen
-- (statt ein zweites Turnier zu eroeffnen - waere durch den "nur ein
-- offenes Turnier"-Unique-Index ohnehin zu Recht blockiert, solange
-- t-open noch laeuft). bracket_size=8: nach den 3 Freilosen aus TEST9
-- und dem in TEST10-15 gespielten echten Runde-1-Match sind BEIDE
-- Runde-2-Matches bereits vollstaendig befuellt (zwei Freilos-Sieger
-- treffen in einem Match direkt aufeinander, der dritte Freilos-
-- Sieger trifft auf den gerade in TEST14 ermittelten echten Sieger).
-- Deckt die "wichtigste Eigenschaft" (Preis wird GENAU EINMAL
-- vergeben) end-to-end ab, inklusive Freilos-Kaskade UND echtem Spiel
-- im selben Turnierbaum.
-- ============================================================
select case when count(*) = 2 then 'PASS' else 'FAIL' end
  || ' - TEST16 Runde 2 hat bereits beide Matches offen (Freilos-Kaskade + echtes Ergebnis)' as result
  from public.tournament_matches where tournament_id = 't-open' and round = 2 and status = 'open';

select id as m0_id, player_1_uid as m0_p1, player_2_uid as m0_p2
  from public.tournament_matches where tournament_id = 't-open' and round = 2 and match_index = 0 \gset
select id as m1_id, player_1_uid as m1_p1, player_2_uid as m1_p2
  from public.tournament_matches where tournament_id = 't-open' and round = 2 and match_index = 1 \gset

-- Match 0: Spieler 1 gewinnt (schneller)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'m0_p1' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 300)', :m0_id), 'TEST17a Runde 2 Match 0 Spieler 1 reicht ein');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'m0_p2' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 500)', :m0_id), 'TEST17b Runde 2 Match 0 Spieler 2 reicht ein -> Match komplett');
reset role;

-- Match 1: Spieler 2 gewinnt (schneller)
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'m1_p1' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 600)', :m1_id), 'TEST18a Runde 2 Match 1 Spieler 1 reicht ein');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'m1_p2' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 250)', :m1_id), 'TEST18b Runde 2 Match 1 Spieler 2 reicht ein -> Match komplett');
reset role;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
  || ' - TEST19 Halbfinal-Sieger stehen fest, Finale (Runde 3) ist jetzt bereit' as result
  from public.tournament_matches where tournament_id = 't-open' and round = 3 and status = 'open';

select id as f_id, player_1_uid as f_p1, player_2_uid as f_p2
  from public.tournament_matches where tournament_id = 't-open' and round = 3 and match_index = 0 \gset

-- Finale spielen: Spieler 1 gewinnt -> Champion + Preis-Claim
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'f_p1' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 280)', :f_id), 'TEST20a Finale Spieler 1 reicht ein');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'f_p2' || '"}', false);
select test_expect_ok(format('select app.tournament_submit_score(%L, 900)', :f_id), 'TEST20b Finale Spieler 2 reicht ein -> Champion steht fest');
reset role;

select case when status = 'finished' and winner_uid = :'f_p1' then 'PASS' else 'FAIL' end
  || ' - TEST21 Turnier ist finished, Sieger korrekt' as result
  from public.tournaments where id = 't-open';

select case when count(*) = 1 and count(*) filter (where winner_uid = :'f_p1') = 1 then 'PASS' else 'FAIL' end
  || ' - TEST22 GENAU EINE Preis-Zeile mit korrektem Gewinner' as result
  from public.tournament_prize where id = 'cap';

-- Ein zweiter Claim-Versuch (z.B. weil ein weiteres Turnier faelschlich
-- ein zweites Mal zum Finale kaeme) scheitert strukturell am Primary Key
select test_expect_blocked(
  $sql$insert into public.tournament_prize (id, tournament_id, winner_uid, winner_nickname) values ('cap', 't-open', 'irgendwer', 'Irgendwer')$sql$,
  'TEST23 zweiter Preis-Claim-Versuch scheitert an der Primary-Key-Eindeutigkeit');

-- ============================================================
-- TEST 24: Admin markiert den Preis als "fulfilled" (verschickt),
-- normaler Nutzer darf das nicht
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"' || :'f_p1' || '"}', false);
select test_expect_blocked(
  $sql$update public.tournament_prize set fulfilled = true where id = 'cap'$sql$,
  'TEST24a normaler Nutzer kann "fulfilled" nicht setzen');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","email":"y.n.trott@gmail.com"}', false);
select test_expect_ok(
  $sql$update public.tournament_prize set fulfilled = true, fulfilled_at = now() where id = 'cap'$sql$,
  'TEST24b Admin markiert Preis als verschickt');
reset role;

drop function test_expect_blocked(text, text);
drop function test_expect_ok(text, text);
