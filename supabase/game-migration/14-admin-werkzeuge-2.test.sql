/* ======================================================
   TESTS zu 14-admin-werkzeuge-2.sql
   Erwartet: 26 x PASS, 0 x FAIL.

   Schwerpunkt sind die acht Dublonen-Codes: sie sind aus einem CASE
   mitten in der RLS-Funktion in eine Tabelle gewandert. Betrag fuer
   Betrag gegengeprueft, dazu ein echter Einloesevorgang durch die
   RLS hindurch - eine Verwechslung dort wuerde bestehende Codes
   still unbrauchbar machen.
====================================================== */
\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function a2_pruef(p_sql text, p_label text, p_soll text) returns void
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
delete from public.race_progress          where week = '2099-W50';
delete from public.tournament_matches      where tournament_id = 't-test-r2';
delete from public.tournament_participants where tournament_id = 't-test-r2';
delete from public.tournaments             where id = 't-test-r2';
-- Ein Unique-Index laesst nur EIN offenes Turnier zu. Andere Testreihen
-- lassen eines stehen - hier stillgelegt statt geloescht, damit deren
-- Daten fuer eine spaetere Fehlersuche erhalten bleiben.
update public.tournaments set status = 'finished'
 where status in ('registration','active') and id <> 't-test-r2';
delete from public.community_boss_damage   where month_id = '2099-11';
delete from public.community_boss          where month_id = '2099-11';
delete from public.player_progression where firebase_uid like 'eeeeeeee-%';
delete from public.players            where firebase_uid like 'eeeeeeee-%';
delete from public.boss_attack_state  where firebase_uid like 'eeeeeeee-%';

insert into public.players (firebase_uid, nickname, currency) values
  ('eeeeeeee-0000-0000-0000-000000000001','Kanonier', 0),
  ('eeeeeeee-0000-0000-0000-000000000002','Maat', 0);
insert into public.community_boss (month_id, hp, max_hp) values ('2099-11', 2000, 5000);
insert into public.community_boss_damage (month_id, firebase_uid, nickname, total_damage)
  values ('2099-11','eeeeeeee-0000-0000-0000-000000000001','Kanonier', 120);
insert into public.race_progress (week, firebase_uid, nickname, progress) values
  ('2099-W50','eeeeeeee-0000-0000-0000-000000000001','Kanonier', 60),
  ('2099-W50','eeeeeeee-0000-0000-0000-000000000002','Maat', 30);
insert into public.tournaments (id, status, bracket_size, started_at) values ('t-test-r2','active',4, now());
insert into public.tournament_participants (tournament_id, firebase_uid, nickname) values
  ('t-test-r2','eeeeeeee-0000-0000-0000-000000000001','Kanonier'),
  ('t-test-r2','eeeeeeee-0000-0000-0000-000000000002','Maat');
insert into public.tournament_matches (tournament_id, round, match_index, status,
        player_1_uid, player_1_nickname, player_2_uid, player_2_nickname)
  values ('t-test-r2', 1, 0, 'open',
          'eeeeeeee-0000-0000-0000-000000000001','Kanonier',
          'eeeeeeee-0000-0000-0000-000000000002','Maat');
insert into public.tournament_matches (tournament_id, round, match_index, status)
  values ('t-test-r2', 1, 1, 'pending'), ('t-test-r2', 2, 0, 'pending');

-- ============================================================
-- TEST 1-4: Ohne Admin geht nichts
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated","email":"fremd@example.com"}', false);
select a2_pruef($$select app.admin_boss_setzen('2099-11', 10)::text$$,        'TEST1 Boss setzen ohne Admin',    'WIRFT:not-admin');
select a2_pruef($$select app.admin_code_setzen('HACK', 5000)::text$$,         'TEST2 Code anlegen ohne Admin',   'WIRFT:not-admin');
select a2_pruef($$select app.admin_codes()::text$$,                           'TEST3 Codeliste ohne Admin',      'WIRFT:not-admin');
select a2_pruef($$select app.admin_rennen_woche_leeren('2099-W50')::text$$,   'TEST4 Rennwoche leeren ohne Admin','WIRFT:not-admin');

-- ============================================================
-- TEST 5-13: Die acht alten Dublonen-Codes, Betrag fuer Betrag
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000009","role":"authenticated","email":"y.n.trott@gmail.com"}', false);

select case when app.code_betrag('516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769') = 100 then 'PASS' else 'FAIL' end || ' - TEST5 Code 1 unveraendert 100' as result;
select case when app.code_betrag('a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4') = 25  then 'PASS' else 'FAIL' end || ' - TEST6 Code 2 unveraendert 25' as result;
select case when app.code_betrag('8bfe3282c066093f84dc23ea2215dff3eae0c7bb2a0d7a11585800adc3d7efb1') = 25  then 'PASS' else 'FAIL' end || ' - TEST7 Code 3 unveraendert 25' as result;
select case when app.code_betrag('8f42ea772af5c16d5b27feb56aae75e6407d8b85e9174e79e468320b9ed88dba') = 300 then 'PASS' else 'FAIL' end || ' - TEST8 Code 4 unveraendert 300' as result;
select case when app.code_betrag('d422fd99131807e57e4c5b71defeeab9544b77d9d9201cf36a922f14bf5f226d') = 300 then 'PASS' else 'FAIL' end || ' - TEST9 Code 5 unveraendert 300' as result;
select case when app.code_betrag('80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c') = 500 then 'PASS' else 'FAIL' end || ' - TEST10 Code 6 unveraendert 500' as result;
select case when app.code_betrag('484aab2f2cd0f77b3c30f91521ba9a76c8c501112a53e100154a098c274f03d3') = 300 then 'PASS' else 'FAIL' end || ' - TEST11 Code 7 unveraendert 300' as result;
select case when app.code_betrag('5836a4ee100cdabe7e2cf26b1a73d9dba43e43b17e27a4d159de60ebc6b41d22') = 400 then 'PASS' else 'FAIL' end || ' - TEST12 Detektiv-Code unveraendert 400' as result;
select case when app.code_betrag('0000000000000000000000000000000000000000000000000000000000000000') is null then 'PASS' else 'FAIL' end || ' - TEST13 unbekannter Hash bleibt ohne Betrag' as result;

-- ============================================================
-- TEST 14-16: Einloesen durch die RLS hindurch
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;

-- richtiger Betrag (100 fuer Code 1)
select a2_pruef($$update public.players
                     set currency = 100,
                         redeemed_currency_codes = '{"516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769": true}'::jsonb
                   where firebase_uid = 'eeeeeeee-0000-0000-0000-000000000001'
                   returning currency::text$$,
                'TEST14 richtiger Betrag wird eingeloest', '100');

-- falscher Betrag (500 statt 25 fuer Code 2)
select a2_pruef($$update public.players
                     set currency = 600,
                         redeemed_currency_codes = redeemed_currency_codes || '{"a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4": true}'::jsonb
                   where firebase_uid = 'eeeeeeee-0000-0000-0000-000000000001'
                   returning currency::text$$,
                'TEST15 falscher Betrag wird abgelehnt',
                'WIRFT:new row violates row-level security policy for table "players"');

-- erfundener Hash
select a2_pruef($$update public.players
                     set currency = 5100,
                         redeemed_currency_codes = redeemed_currency_codes || '{"1111111111111111111111111111111111111111111111111111111111111111": true}'::jsonb
                   where firebase_uid = 'eeeeeeee-0000-0000-0000-000000000001'
                   returning currency::text$$,
                'TEST16 erfundener Code wird abgelehnt',
                'WIRFT:new row violates row-level security policy for table "players"');
reset role;

-- ============================================================
-- TEST 17-18: Neuen Code anlegen und wieder loeschen
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000009","role":"authenticated","email":"y.n.trott@gmail.com"}', false);
select app.admin_code_setzen('TESTCODE2099', 250, 'Testreihe');
select case when app.code_betrag(encode(extensions.digest('TESTCODE2099','sha256'),'hex')) = 250
            then 'PASS' else 'FAIL' end || ' - TEST17 neuer Code gilt sofort' as result;
-- Zwei getrennte Anweisungen, und das mit Absicht: stuende der
-- Loeschaufruf mit der Nachpruefung in EINER Anweisung, laese die
-- stabile Funktion app.code_betrag() noch den Schnappschuss von vor
-- dem Loeschen - der Test wuerde grundlos scheitern.
select app.admin_code_loeschen('testcode2099') as geloescht;
select case when app.code_betrag(encode(extensions.digest('TESTCODE2099','sha256'),'hex')) is null
            then 'PASS' else 'FAIL' end || ' - TEST18 Loeschen wirkt, Kleinschreibung egal' as result;

-- ============================================================
-- TEST 19-22: Boss
-- ============================================================
select app.admin_boss_setzen('2099-11', 500);
select case when (select hp from public.community_boss where month_id='2099-11') = 500
            then 'PASS' else 'FAIL' end || ' - TEST19 Boss-HP gesetzt' as result;

select app.admin_boss_setzen('2099-11', 9999, 8000);
select case when (select hp from public.community_boss where month_id='2099-11') = 8000
            then 'PASS' else 'FAIL' end || ' - TEST20 HP wird auf die neue Obergrenze gedeckelt' as result;

select app.admin_boss_zuruecksetzen('2099-11');
select case when (select hp = max_hp and not defeated from public.community_boss where month_id='2099-11')
             and (select count(*) from public.community_boss_damage where month_id='2099-11') = 1
            then 'PASS' else 'FAIL' end || ' - TEST21 Zuruecksetzen laesst die Rangliste stehen' as result;

select app.admin_spezial_freischalten('eeeeeeee-0000-0000-0000-000000000001', 'fass');
select case when (select 'fass' = any(frei) from public.boss_attack_state
                   where firebase_uid='eeeeeeee-0000-0000-0000-000000000001')
            then 'PASS' else 'FAIL' end || ' - TEST22 Spezialangriff freigeschaltet' as result;

-- ============================================================
-- TEST 23-24: Turnier-Feinsteuerung
-- ============================================================
select app.admin_match_entscheiden(
  (select id from public.tournament_matches where tournament_id='t-test-r2' and round=1 and match_index=0),
  'eeeeeeee-0000-0000-0000-000000000001');

select case when (select status from public.tournament_matches
                   where tournament_id='t-test-r2' and round=1 and match_index=0) = 'complete'
            then 'PASS' else 'FAIL' end || ' - TEST23 Match ist entschieden' as result;
select case when (select eliminated from public.tournament_participants
                   where tournament_id='t-test-r2' and firebase_uid='eeeeeeee-0000-0000-0000-000000000002')
            then 'PASS' else 'FAIL' end || ' - TEST24 der Verlierer ist ausgeschieden' as result;

-- ============================================================
-- TEST 25-26: Wochenrennen
-- ============================================================
select app.admin_rennen_setzen('2099-W50', 'eeeeeeee-0000-0000-0000-000000000002', 999);
select case when (select progress from public.race_progress
                   where week='2099-W50' and firebase_uid='eeeeeeee-0000-0000-0000-000000000002') = 999
            then 'PASS' else 'FAIL' end || ' - TEST25 Rennpunkte gesetzt' as result;

-- Ebenfalls getrennt, siehe TEST18.
select app.admin_rennen_woche_leeren('2099-W50') as geloescht \gset
select case when :geloescht = 2
             and (select count(*) from public.race_progress where week='2099-W50') = 0
            then 'PASS' else 'FAIL' end || ' - TEST26 Rennwoche geleert' as result;

drop function a2_pruef(text, text, text);
