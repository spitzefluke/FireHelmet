/* ======================================================
   TESTS zu 13-admin-werkzeuge.sql
   Erwartet: 20 x PASS, 0 x FAIL.
====================================================== */
\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function aw_pruef(p_sql text, p_label text, p_soll text) returns void
language plpgsql as $$
declare ist text;
begin
  execute p_sql into ist;
  if ist is not distinct from p_soll then raise notice 'PASS - % (%)', p_label, coalesce(ist,'null');
  else raise notice 'FAIL - %: erwartet %, bekommen %', p_label, p_soll, coalesce(ist,'null'); end if;
exception when others then
  if p_soll = 'WIRFT:' || sqlerrm then raise notice 'PASS - % (%)', p_label, sqlerrm;
  else raise notice 'FAIL - %: erwartet %, geworfen %', p_label, p_soll, sqlerrm; end if;
end $$;

-- ============================================================
-- Vorbereitung
-- ============================================================
delete from public.tournament_matches      where tournament_id = 't-test-admin';
delete from public.tournament_participants where tournament_id = 't-test-admin';
delete from public.tournaments             where id = 't-test-admin';
delete from public.player_progression where firebase_uid like 'dddddddd-%';
delete from public.players            where firebase_uid like 'dddddddd-%';
delete from public.gesperrte_namen    where name_klein in ('boesername', 'seebaer2');

insert into public.players (firebase_uid, nickname, currency, games_played) values
  ('dddddddd-0000-0000-0000-000000000001','Seebaer2', 100, 3),
  ('dddddddd-0000-0000-0000-000000000002','BoeserName', 50, 1);
insert into public.player_progression (firebase_uid, xp) values
  ('dddddddd-0000-0000-0000-000000000001', 500);

insert into public.tournaments (id, status, bracket_size, started_at)
  values ('t-test-admin', 'active', 4, now());
insert into public.tournament_participants (tournament_id, firebase_uid, nickname, eliminated) values
  ('t-test-admin','dddddddd-0000-0000-0000-000000000001','Seebaer2', true),
  ('t-test-admin','dddddddd-0000-0000-0000-000000000002','BoeserName', false);
insert into public.tournament_matches (tournament_id, round, match_index, status) values
  ('t-test-admin', 1, 0, 'complete'), ('t-test-admin', 1, 1, 'open'), ('t-test-admin', 2, 0, 'pending');

-- ============================================================
-- TEST 1-4: Ohne Admin geht gar nichts
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated","email":"fremd@example.com"}', false);
select aw_pruef($$select app.admin_statusbrett()::text$$,                                'TEST1 Statusbrett ohne Admin',      'WIRFT:not-admin');
select aw_pruef($$select app.admin_spieler_suchen('Seebaer2')::text$$,                   'TEST2 Spielersuche ohne Admin',     'WIRFT:not-admin');
select aw_pruef($$select app.admin_spieler_setzen('dddddddd-0000-0000-0000-000000000001', 9999)::text$$, 'TEST3 Spieler setzen ohne Admin', 'WIRFT:not-admin');
select aw_pruef($$select app.admin_turnier_fortschritt_zuruecksetzen('t-test-admin')::text$$, 'TEST4 Turnier-Reset ohne Admin', 'WIRFT:not-admin');

-- Ab hier als Admin
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000009","role":"authenticated","email":"y.n.trott@gmail.com"}', false);

-- ============================================================
-- TEST 5-9: Turnier-Fortschritt zuruecksetzen
-- ============================================================
select app.admin_turnier_fortschritt_zuruecksetzen('t-test-admin');

select case when (select status from public.tournaments where id='t-test-admin') = 'registration'
            then 'PASS' else 'FAIL' end || ' - TEST5 Turnier steht wieder auf Anmeldung' as result;
select case when (select count(*) from public.tournament_matches where tournament_id='t-test-admin') = 0
            then 'PASS' else 'FAIL' end || ' - TEST6 alle Matches geloescht' as result;
select case when (select count(*) from public.tournament_participants where tournament_id='t-test-admin') = 2
            then 'PASS' else 'FAIL' end || ' - TEST7 die Teilnehmer bleiben eingetragen' as result;
select case when (select count(*) from public.tournament_participants
                   where tournament_id='t-test-admin' and eliminated) = 0
            then 'PASS' else 'FAIL' end || ' - TEST8 niemand ist mehr ausgeschieden' as result;
select case when (select bracket_size is null and started_at is null and not paused
                    from public.tournaments where id='t-test-admin')
            then 'PASS' else 'FAIL' end || ' - TEST9 Bracket-Groesse und Startzeit geleert' as result;

-- ============================================================
-- TEST 10-12: Statusbrett
-- ============================================================
select case when (app.admin_statusbrett() ->> 'spieler_gesamt')::int >= 2
            then 'PASS' else 'FAIL' end || ' - TEST10 Statusbrett zaehlt Spieler' as result;
select case when (app.admin_statusbrett() -> 'turnier' ->> 'status') = 'registration'
            then 'PASS' else 'FAIL' end || ' - TEST11 Statusbrett kennt den Turnierstatus' as result;
select case when (app.admin_statusbrett() ->> 'caps_frei')::int between 0 and 4
            then 'PASS' else 'FAIL' end || ' - TEST12 Statusbrett rechnet die freien Caps' as result;

-- ============================================================
-- TEST 13-16: Spieler suchen und bearbeiten
-- ============================================================
-- Namensteil, aber eindeutig genug: eine andere Testreihe legt
-- ebenfalls einen "Seebaer" an, "eebaer2" trifft nur diesen hier.
select case when (select count(*) from app.admin_spieler_suchen('eebaer2')) = 1
            then 'PASS' else 'FAIL' end || ' - TEST13 Suche findet ueber Namensteil' as result;
select case when (select xp from app.admin_spieler_suchen('Seebaer2')) = 500
            then 'PASS' else 'FAIL' end || ' - TEST14 Suche liefert die Erfahrungspunkte mit' as result;

select app.admin_spieler_setzen('dddddddd-0000-0000-0000-000000000001', 4200, 7000, null);
select case when (select currency from public.players where firebase_uid='dddddddd-0000-0000-0000-000000000001') = 4200
             and (select xp from public.player_progression where firebase_uid='dddddddd-0000-0000-0000-000000000001') = 7000
            then 'PASS' else 'FAIL' end || ' - TEST15 Dublonen und XP gesetzt' as result;

select aw_pruef($$select app.admin_spieler_setzen('dddddddd-0000-0000-0000-000000000001', -5)::text$$,
                'TEST16 negative Dublonen abgelehnt', 'WIRFT:dublonen-negativ');

-- ============================================================
-- TEST 17-20: Namenssperre
-- ============================================================
select app.admin_name_sperren('dddddddd-0000-0000-0000-000000000002', 'unangemessen');

select case when (select nickname from public.players where firebase_uid='dddddddd-0000-0000-0000-000000000002') is null
            then 'PASS' else 'FAIL' end || ' - TEST17 Name wurde geleert' as result;
select case when not app.name_erlaubt('boesername') and not app.name_erlaubt('BOESERNAME')
            then 'PASS' else 'FAIL' end || ' - TEST18 Sperre gilt unabhaengig von Gross-/Kleinschreibung' as result;
select case when app.name_erlaubt('Seebaer2') then 'PASS' else 'FAIL' end
    || ' - TEST19 andere Namen bleiben erlaubt' as result;

-- Der Spieler selbst darf den gesperrten Namen nicht wieder eintragen
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}', false);
set role authenticated;
select aw_pruef($$update public.players set nickname = 'BoeserName'
                   where firebase_uid = 'dddddddd-0000-0000-0000-000000000002'
                   returning nickname$$,
                'TEST20 gesperrter Name laesst sich nicht wieder setzen',
                'WIRFT:new row violates row-level security policy for table "players"');
reset role;

drop function aw_pruef(text, text, text);
