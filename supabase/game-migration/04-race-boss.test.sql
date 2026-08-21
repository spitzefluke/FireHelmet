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
-- Vorbereitung
-- ============================================================
set role service_role;
insert into public.race_progress (week, firebase_uid, nickname, progress) values ('2026-W33', 'uid-A', 'Anna', 5);
insert into public.community_boss (month_id, hp, max_hp) values ('2026-08', 4500, 5000);
insert into public.community_boss_damage (month_id, firebase_uid, nickname, total_damage) values ('2026-08', 'uid-A', 'Anna', 30);
reset role;

-- ============================================================
-- TEST 1: nicht eingeloggt liest alle drei Tabellen (oeffentlich)
-- ============================================================
set role anon;
select set_config('request.jwt.claims', '', false);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ' - TEST1a anon liest race_progress' as result from public.race_progress;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ' - TEST1b anon liest community_boss' as result from public.community_boss;
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ' - TEST1c anon liest community_boss_damage' as result from public.community_boss_damage;
reset role;

-- ============================================================
-- TEST 2: legitimer Rennfortschritt (+15 pro Schreibvorgang)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.race_progress set progress = 20 where week = '2026-W33' and firebase_uid = 'uid-A'$sql$,
  'TEST2 legitimer Rennfortschritt (+15) gelingt');
reset role;

-- ============================================================
-- TEST 3: Manipulation von Rennfortschritt (Sprung > +15)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.race_progress set progress = 999 where week = '2026-W33' and firebase_uid = 'uid-A'$sql$,
  'TEST3 Rennfortschritt-Sprung wird blockiert');
reset role;

-- ============================================================
-- TEST 4: Benutzer A schreibt Rennfortschritt fuer Benutzer B
-- ============================================================
set role service_role;
insert into public.race_progress (week, firebase_uid, nickname, progress) values ('2026-W33', 'uid-B', 'Bert', 3);
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.race_progress set progress = 0 where week = '2026-W33' and firebase_uid = 'uid-B'$sql$,
  'TEST4 uid-A kann NICHT uid-Bs Rennfortschritt schreiben');
reset role;

-- ============================================================
-- TEST 5: legitimer Boss-Angriff (Schaden <= 45 pro Schreibvorgang)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.community_boss set hp = 4460 where month_id = '2026-08'$sql$,
  'TEST5 legitimer Boss-Angriff (-40 HP) gelingt');
reset role;

-- ============================================================
-- TEST 6: Manipulation der Boss-HP (auf einen Schlag besiegen)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.community_boss set hp = 0 where month_id = '2026-08'$sql$,
  'TEST6 Boss-HP-Sprung auf 0 wird blockiert');
reset role;

-- ============================================================
-- TEST 7: legitimer Schaden-Log-Zuwachs (<=45)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$update public.community_boss_damage set total_damage = 70 where month_id = '2026-08' and firebase_uid = 'uid-A'$sql$,
  'TEST7 legitimer Schaden-Zuwachs (+40) gelingt');
reset role;

-- ============================================================
-- TEST 8: Manipulation von Schaden-Rangliste (Sprung > +45)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$update public.community_boss_damage set total_damage = 99999 where month_id = '2026-08' and firebase_uid = 'uid-A'$sql$,
  'TEST8 Schaden-Sprung wird blockiert');
reset role;

-- ============================================================
-- TEST 9: neue Runde/neuer Boss-Angriff per INSERT ueber der
-- Obergrenze (>15 bzw. >45 direkt bei Neuanlage)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_blocked(
  $sql$insert into public.race_progress (week, firebase_uid, nickname, progress) values ('2026-W34', 'uid-A', 'Anna', 999)$sql$,
  'TEST9 Neuanlage race_progress mit progress=999 wird blockiert');
reset role;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"uid-A"}', false);
select test_expect_ok(
  $sql$insert into public.race_progress (week, firebase_uid, nickname, progress) values ('2026-W34', 'uid-A', 'Anna', 10)$sql$,
  'TEST9b legitime Neuanlage race_progress gelingt');
reset role;

drop function test_expect_blocked(text, text);
drop function test_expect_ok(text, text);
