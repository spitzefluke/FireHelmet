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

set role service_role;
insert into public.site_config (id, data) values ('main', '{"lockedChapterIds": []}'::jsonb);
reset role;

-- ============================================================
-- TEST 1: Site-Config-Schreiben durch normalen Benutzer -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-normal","email":"normal@example.com"}', false);
select test_expect_blocked(
  $sql$update public.site_config set data = '{"lockedChapterIds": ["hacked"]}'::jsonb where id = 'main'$sql$,
  'TEST1 Site-Config-Schreiben durch normalen Benutzer wird blockiert');
reset role;

-- ============================================================
-- TEST 2: Site-Config-Schreiben durch Admin -> gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-admin","email":"spitzefluke@gmail.com"}', false);
select test_expect_ok(
  $sql$update public.site_config set data = '{"lockedChapterIds": ["kapitel3"]}'::jsonb where id = 'main'$sql$,
  'TEST2 Site-Config-Schreiben durch Admin gelingt');
reset role;

-- ============================================================
-- TEST 3: Site-Config oeffentlich lesbar (auch ohne Login)
-- ============================================================
set role anon;
select set_config('request.jwt.claims', '', false);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ' - TEST3 anon liest site_config oeffentlich' as result from public.site_config;
reset role;

-- ============================================================
-- TEST 4: site_meta - gueltiger Hash gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-normal"}', false);
select test_expect_ok(
  $sql$insert into public.site_meta (id, last_sent_hash, sent_at) values ('update_notice', 'abc123', now())$sql$,
  'TEST4 site_meta gueltiger Hash gelingt');
reset role;

-- ============================================================
-- TEST 5: site_meta - zu langer Hash wird blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-normal"}', false);
select test_expect_blocked(
  $sql$insert into public.site_meta (id, last_sent_hash) values ('other', repeat('x', 51))$sql$,
  'TEST5 site_meta zu langer Hash (>50) wird blockiert');
reset role;

-- ============================================================
-- TEST 6: giveawayEntries - eigene Teilnahme gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$insert into public.giveaway_entries (giveaway_id, firebase_uid, nickname) values ('summer2026', 'uid-A', 'Anna')$sql$,
  'TEST6 eigene Gewinnspiel-Teilnahme gelingt');
reset role;

-- ============================================================
-- TEST 7: giveawayEntries - fuer FREMDE UID teilnehmen -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$insert into public.giveaway_entries (giveaway_id, firebase_uid, nickname) values ('summer2026', 'uid-FREMD', 'Faker')$sql$,
  'TEST7 Teilnahme fuer fremde UID wird blockiert');
reset role;

-- ============================================================
-- TEST 8: giveawayEntries - sich wieder austragen (UPDATE) -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.giveaway_entries set nickname = 'Geaendert' where giveaway_id = 'summer2026' and firebase_uid = 'uid-A'$sql$,
  'TEST8 Aendern der eigenen Teilnahme wird blockiert (Firestore: update:false)');
reset role;

-- ============================================================
-- TEST 9: giveawayWinners - gueltige Ziehung gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$insert into public.giveaway_winners (round_id, winners) values ('summer2026', '["uid-A","uid-B"]'::jsonb)$sql$,
  'TEST9 gueltige Gewinnspiel-Ziehung gelingt');
reset role;

-- ============================================================
-- TEST 10: giveawayWinners - zu viele Gewinner (>10) -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$insert into public.giveaway_winners (round_id, winners) values ('winter2026', '["u1","u2","u3","u4","u5","u6","u7","u8","u9","u10","u11"]'::jsonb)$sql$,
  'TEST10 Gewinnspiel-Ziehung mit 11 Gewinnern wird blockiert');
reset role;

-- ============================================================
-- TEST 11: giveawayWinners - Ergebnis nachtraeglich manipulieren -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.giveaway_winners set winners = '["uid-FREMD"]'::jsonb where round_id = 'summer2026'$sql$,
  'TEST11 nachtraegliche Ziehungs-Manipulation wird blockiert');
reset role;

-- ============================================================
-- TEST 12: supportReports - Meldung abschicken gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$insert into public.support_reports (message) values ('Die Spielothek geht nicht.')$sql$,
  'TEST12 Support-Meldung abschicken gelingt');
reset role;

-- ============================================================
-- TEST 13: Support-Report-Lesen - NIEMAND darf lesen (auch nicht
-- der Absender selbst!) - exakt wie Firestore "allow read: if false"
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' - TEST13a authenticated kann supportReports NICHT lesen' as result from public.support_reports;
reset role;

set role anon;
select set_config('request.jwt.claims', '', false);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ' - TEST13b anon kann supportReports NICHT lesen' as result from public.support_reports;
reset role;

-- ============================================================
-- TEST 14: supportReports - zu lange Nachricht (>2000) -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  format($sql$insert into public.support_reports (message) values ('%s')$sql$, repeat('x', 2001)),
  'TEST14 zu lange Support-Meldung (>2000) wird blockiert');
reset role;

-- ============================================================
-- TEST 15: site_ratings - gueltige Bewertung gelingt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$insert into public.site_ratings (value, nickname, comment) values (5, 'Anna', 'Tolle Seite!')$sql$,
  'TEST15 gueltige Bewertung gelingt');
reset role;

-- ============================================================
-- TEST 16: site_ratings - Wert ausserhalb 1-5 -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$insert into public.site_ratings (value, nickname) values (99, 'Faker')$sql$,
  'TEST16 Bewertungswert 99 wird blockiert');
reset role;

-- ============================================================
-- TEST 17: site_ratings - Bewertung nachtraeglich aendern -> blockiert
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.site_ratings set value = 1 where nickname = 'Anna'$sql$,
  'TEST17 nachtraegliches Aendern einer Bewertung wird blockiert');
reset role;

-- ============================================================
-- TEST 18: SQL-Injection im Bewertungs-Kommentar
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
do $$
begin
  insert into public.site_ratings (value, nickname, comment) values (4, 'Bert', $str$'; DROP TABLE public.site_ratings; --$str$);
  raise notice 'PASS - TEST18 SQL-Injection-Payload landet nur als harmloser String';
exception when others then
  raise notice 'FAIL - TEST18 unerwarteter Fehler (%)', sqlerrm;
end $$;
select case when to_regclass('public.site_ratings') is not null then 'PASS' else 'FAIL' end || ' - TEST18b Tabelle site_ratings existiert weiterhin' as result;
reset role;

drop function test_expect_blocked(text, text);
drop function test_expect_ok(text, text);
