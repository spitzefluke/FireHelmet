\set ON_ERROR_STOP off
set client_min_messages to notice;

-- ============================================================
-- Vorbereitung
-- ============================================================
set role service_role;
insert into public.players (firebase_uid, nickname, currency, ship_tools, daily_quests_started_at, daily_quests_claimed_days)
values ('uid-A', 'Anna', 1000, '{"spyglass": 2}'::jsonb, now() - interval '2 days', '{}');
insert into public.players (firebase_uid, nickname, currency)
values ('uid-B', 'Bert', 500);
insert into public.players (firebase_uid, nickname, currency)
values ('uid-C', 'Carla', 500);
insert into public.ship_repair (firebase_uid) values ('uid-A');
reset role;

-- ============================================================
-- Hilfsfunktion fuer die Tests: versucht ein UPDATE und meldet PASS,
-- wenn es entweder mit einer RLS-Exception fehlschlaegt ODER 0 Zeilen
-- betrifft (beides bedeutet "abgelehnt") - FAIL, wenn es durchgeht.
-- ============================================================
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
-- TEST 1/2: Basis-Lesezugriffe
-- ============================================================
set role anon;
select set_config('request.jwt.claims', '', false);
select case when count(*) = 3 then 'PASS' else 'FAIL' end || ' - TEST1 anon liest players oeffentlich' as result from public.players;
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select case when count(*) = 1 and bool_and(firebase_uid = 'uid-A') then 'PASS' else 'FAIL' end
  || ' - TEST2 uid-A sieht nur eigenes ship_repair' as result from public.ship_repair;
reset role;

-- ============================================================
-- TEST 3: legitimer Spielothek-Write
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.players set currency = 950, games_played = 1, last_spielothek_play_at = now() where firebase_uid = 'uid-A'$sql$,
  'TEST3 legitimer Spielothek-Write gelingt');
reset role;

-- ============================================================
-- TEST 4: Manipulation von currency
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set currency = 999999 where firebase_uid = 'uid-A'$sql$,
  'TEST4 currency=999999 wird blockiert');
reset role;

-- ============================================================
-- TEST 5: Manipulation von gamesPlayed
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set games_played = 999 where firebase_uid = 'uid-A'$sql$,
  'TEST5 gamesPlayed=999 wird blockiert');
reset role;

-- ============================================================
-- TEST 6: Manipulation von shipTools (Mehrfachaenderung) / 6b legitim
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set ship_tools = '{"spyglass": 40, "hammer": 40, "saw": 40}'::jsonb where firebase_uid = 'uid-A'$sql$,
  'TEST6 shipTools-Mehrfachaenderung wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.players set ship_tools = '{"spyglass": 3}'::jsonb where firebase_uid = 'uid-A'$sql$,
  'TEST6b legitime Einzel-Werkzeug-Aenderung gelingt');
reset role;

-- ============================================================
-- TEST 7: erfundener Code-Hash / 7b legitimes sorry500 / 7c doppelt
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set currency = 1500, redeemed_currency_codes = jsonb_build_object('erfundenerHash', 500) where firebase_uid = 'uid-A'$sql$,
  'TEST7 erfundener Code-Hash wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  format($sql$update public.players set currency = currency + 500, redeemed_currency_codes = redeemed_currency_codes || jsonb_build_object('80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c', 500) where firebase_uid = 'uid-A'$sql$),
  'TEST7b legitimes sorry500-Einloesen gelingt');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set currency = currency + 500 where firebase_uid = 'uid-A'$sql$,
  'TEST7c doppeltes sorry500-Einloesen (ohne neuen Map-Eintrag) wird blockiert');
reset role;

-- ============================================================
-- TEST 8: Spielothek-Cooldown (4s) - zwei GETRENNTE Transaktionen,
-- eigener frischer Spieler (uid-C), damit kein vorheriger Test
-- bereits denselben Cooldown ausgeloest hat.
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-C"}', false);
select test_expect_ok(
  $sql$update public.players set last_spielothek_play_at = now() where firebase_uid = 'uid-C'$sql$,
  'TEST8a Spielothek-Runde spielen gelingt');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-C"}', false);
select test_expect_blocked(
  $sql$update public.players set last_spielothek_play_at = now(), currency = currency - 10 where firebase_uid = 'uid-C'$sql$,
  'TEST8b sofortige zweite Runde wird durch 4s-Cooldown blockiert');
reset role;

-- ============================================================
-- TEST 9: 20h-Wheel-Cooldown - zwei GETRENNTE Transaktionen
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.players set last_wheel_spin_at = now() where firebase_uid = 'uid-A'$sql$,
  'TEST9a erster Dreh gelingt');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set last_wheel_spin_at = now() where firebase_uid = 'uid-A'$sql$,
  'TEST9b sofortiger zweiter Dreh wird durch 20h-Sperre blockiert');
reset role;

-- ============================================================
-- TEST 10: tempAvatarExpiresAt kuenstlich verlaengern
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set temp_avatar_expires_at = (extract(epoch from now())*1000)::bigint + 999999999999 where firebase_uid = 'uid-A'$sql$,
  'TEST10 verlaengertes tempAvatarExpiresAt wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.players set temp_avatar_expires_at = (extract(epoch from now())*1000)::bigint + 259200000, temp_avatar_id = 'sturmpirat' where firebase_uid = 'uid-A'$sql$,
  'TEST10b gueltiges tempAvatarExpiresAt (+3 Tage) gelingt');
reset role;

-- ============================================================
-- TEST 11: progression XP-Manipulation
-- ============================================================
set role service_role;
insert into public.player_progression (firebase_uid, xp) values ('uid-A', 100);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.player_progression set xp = 99999 where firebase_uid = 'uid-A'$sql$,
  'TEST11 XP-Sprung (+99899) wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.player_progression set xp = 400 where firebase_uid = 'uid-A'$sql$,
  'TEST11b legitimer XP-Zuwachs (+300) gelingt');
reset role;

-- ============================================================
-- TEST 12: ship_repair Etappen-Sprung / legitimer Ablauf
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.ship_repair set completed_phases = array['phase1','phase2','phase3'] where firebase_uid = 'uid-A'$sql$,
  'TEST12 ship_repair-Etappen-Sprung wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  format($sql$update public.ship_repair set active_repair = jsonb_build_object('phaseId','phase1','tool','hammer','endsAt',%s,'startedBy','Anna') where firebase_uid = 'uid-A'$sql$,
    (extract(epoch from now())*1000)::bigint + 60000),
  'TEST12b legitimer Etappen-Start gelingt');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.ship_repair set active_repair = null, completed_phases = array['phase1'] where firebase_uid = 'uid-A'$sql$,
  'TEST12c vorzeitiger Etappen-Abschluss (endsAt noch in Zukunft) wird blockiert');
reset role;

-- ============================================================
-- TEST 13: Benutzer A schreibt Daten von Benutzer B
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.players set currency = 0 where firebase_uid = 'uid-B'$sql$,
  'TEST13 uid-A kann NICHT uid-Bs Daten schreiben');
reset role;

-- ============================================================
-- TEST 14: SQL-Injection im nickname-Feld
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
do $$
begin
  update public.players set nickname = $str$Anna Injected$str$ where firebase_uid = 'uid-A';
  raise notice 'PASS - TEST14 SQL-Injection-Payload landet nur als harmloser String';
exception when others then
  raise notice 'FAIL - TEST14 unerwarteter Fehler (%)', sqlerrm;
end $$;
select case when to_regclass('public.players') is not null then 'PASS' else 'FAIL' end || ' - TEST14b Tabelle players existiert weiterhin' as result;
reset role;

-- ============================================================
-- TEST 15: Insert mit fremder UID
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$insert into public.players (firebase_uid, nickname) values ('uid-FREMD', 'Faker')$sql$,
  'TEST15 Insert mit fremder UID wird abgelehnt');
reset role;

drop function test_expect_blocked(text, text);
drop function test_expect_ok(text, text);
