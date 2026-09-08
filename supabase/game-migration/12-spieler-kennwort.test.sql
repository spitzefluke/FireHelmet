/* ======================================================
   TESTS zu 12-spieler-kennwort.sql
   ---------------------------------------------------
   Gegen ein echtes Postgres laufen lassen, nachdem 00-01, 03, 05,
   07-09 und 12 eingespielt sind:

     psql -d <db> -f 12-spieler-kennwort.test.sql

   Erwartet: 18 x PASS, 0 x FAIL.

   Die UIDs sind bewusst echte UUIDs - app.firebase_uid() liest
   auth.uid(), und das ist eine uuid-Spalte. Ein sprechender String
   wie 'test-alt' scheitert dort schon an der Typumwandlung.
====================================================== */
\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function kw_pruef(p_sql text, p_label text, p_soll text) returns void
language plpgsql as $$
declare ist text;
begin
  execute p_sql into ist;
  if ist is not distinct from p_soll then raise notice 'PASS - % (%)', p_label, ist;
  else raise notice 'FAIL - %: erwartet %, bekommen %', p_label, p_soll, ist; end if;
exception when others then
  if p_soll = 'WIRFT:' || sqlerrm then raise notice 'PASS - % (%)', p_label, sqlerrm;
  else raise notice 'FAIL - %: erwartet %, geworfen %', p_label, p_soll, sqlerrm; end if;
end $$;

-- ============================================================
-- Vorbereitung: ALT bespielt, NEU frisch, FREMD bespielt
-- ============================================================
delete from public.player_identity_codes    where firebase_uid like 'aaaaaaaa-%' or firebase_uid like 'bbbbbbbb-%' or firebase_uid like 'cccccccc-%';
delete from public.player_identity_versuche where firebase_uid like 'aaaaaaaa-%' or firebase_uid like 'bbbbbbbb-%' or firebase_uid like 'cccccccc-%';
delete from public.race_progress            where firebase_uid like 'aaaaaaaa-%' or firebase_uid like 'bbbbbbbb-%' or firebase_uid like 'cccccccc-%';
delete from public.player_progression       where firebase_uid like 'aaaaaaaa-%' or firebase_uid like 'bbbbbbbb-%' or firebase_uid like 'cccccccc-%';
delete from public.players                  where firebase_uid like 'aaaaaaaa-%' or firebase_uid like 'bbbbbbbb-%' or firebase_uid like 'cccccccc-%';

insert into public.players (firebase_uid, nickname, currency, games_played, total_currency_earned) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Seebaer', 640, 12, 900),
  ('bbbbbbbb-0000-0000-0000-000000000002', null,       0,  0,   0),
  ('cccccccc-0000-0000-0000-000000000003','Anderer', 300,  5, 300);
insert into public.player_progression (firebase_uid, xp) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 4200),
  ('bbbbbbbb-0000-0000-0000-000000000002', 0),
  ('cccccccc-0000-0000-0000-000000000003', 800);
insert into public.race_progress (week, firebase_uid, nickname, progress) values
  ('2026-W37','aaaaaaaa-0000-0000-0000-000000000001','Seebaer',120);

-- ============================================================
-- TEST 1-3: Kennwort erzeugen
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);

select case when char_length(app.mein_kennwort()) = 8 then 'PASS' else 'FAIL' end
    || ' - TEST1 Kennwort hat acht Zeichen' as result;
select case when (select code from public.player_identity_codes
                   where firebase_uid = 'aaaaaaaa-0000-0000-0000-000000000001') = app.mein_kennwort()
            then 'PASS' else 'FAIL' end
    || ' - TEST2 zweiter Aufruf liefert dasselbe Kennwort' as result;
select case when app.mein_kennwort() ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then 'PASS' else 'FAIL' end
    || ' - TEST3 nur verwechslungsfreie Zeichen (kein O/0/I/1/L)' as result;

-- ============================================================
-- TEST 4-6: Einloesen auf einem frischen Konto
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);

select kw_pruef($$select app.kennwort_einloesen('XXXXXXXX')$$, 'TEST4 unbekanntes Kennwort abgelehnt', 'code-unbekannt');
select kw_pruef($$select app.kennwort_einloesen('ABC')$$,      'TEST5 zu kurzes Kennwort abgelehnt',   'code-ungueltig');
select kw_pruef(
  format($$select app.kennwort_einloesen('%s-%s')$$,
         lower(substr((select code from public.player_identity_codes where firebase_uid='aaaaaaaa-0000-0000-0000-000000000001'),1,4)),
         lower(substr((select code from public.player_identity_codes where firebase_uid='aaaaaaaa-0000-0000-0000-000000000001'),5,4))),
  'TEST6 echtes Kennwort klein und mit Bindestrich wird angenommen', 'ok');

-- ============================================================
-- TEST 7-12: Was ist mitgewandert?
-- ============================================================
select case when (select currency from public.players where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002') = 640
            then 'PASS' else 'FAIL' end || ' - TEST7 Dublonen mitgewandert' as result;
select case when (select nickname from public.players where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002') = 'Seebaer'
            then 'PASS' else 'FAIL' end || ' - TEST8 Name mitgewandert' as result;
select case when (select count(*) from public.players where firebase_uid='aaaaaaaa-0000-0000-0000-000000000001') = 0
            then 'PASS' else 'FAIL' end || ' - TEST9 altes Konto aufgeloest' as result;
select case when (select xp from public.player_progression where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002') = 4200
            then 'PASS' else 'FAIL' end || ' - TEST10 Erfahrungspunkte mitgewandert' as result;
select case when (select progress from public.race_progress
                   where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002' and week='2026-W37') = 120
            then 'PASS' else 'FAIL' end || ' - TEST11 Rennfortschritt mitgewandert' as result;
select case when (select count(*) from public.player_identity_codes where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002') = 1
            then 'PASS' else 'FAIL' end || ' - TEST12 Kennwort gehoert jetzt dem neuen Konto' as result;

-- ============================================================
-- TEST 13-14: Ein bespieltes Konto darf nicht ueberschrieben werden
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', false);
select kw_pruef(
  format($$select app.kennwort_einloesen('%s')$$,
         (select code from public.player_identity_codes where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002')),
  'TEST13 bespieltes Zielkonto wird geschuetzt', 'ziel-nicht-leer');
select case when (select currency from public.players where firebase_uid='cccccccc-0000-0000-0000-000000000003') = 300
            then 'PASS' else 'FAIL' end || ' - TEST14 fremde Dublonen unveraendert' as result;

-- ============================================================
-- TEST 15: Das eigene Kennwort auf sich selbst
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);
select kw_pruef(
  format($$select app.kennwort_einloesen('%s')$$,
         (select code from public.player_identity_codes where firebase_uid='bbbbbbbb-0000-0000-0000-000000000002')),
  'TEST15 eigenes Kennwort meldet "schon-du"', 'schon-du');

-- ============================================================
-- TEST 16: Bremse gegen Durchprobieren
-- ---------------------------------------------------
-- Genau deshalb gibt kennwort_einloesen() einen Status zurueck,
-- statt zu werfen: ein "raise exception" wuerde die Erhoehung des
-- Fehlversuchszaehlers mit zurueckrollen und die Bremse waere wirkungslos.
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', false);
do $$ begin for i in 1..9 loop perform app.kennwort_einloesen('ZZZZZZZZ'); end loop; end $$;
select kw_pruef($$select app.kennwort_einloesen('ZZZZZZZZ')$$, 'TEST16 nach zehn Fehlversuchen gesperrt', 'zu-viele-versuche');

-- ============================================================
-- TEST 17-18: Ohne Anmeldung / Direktzugriff
-- ============================================================
select set_config('request.jwt.claims', '', false);
select kw_pruef($$select app.mein_kennwort()$$, 'TEST17 ohne Anmeldung kein Kennwort', 'WIRFT:nicht-angemeldet');

set role authenticated;
select kw_pruef($$select count(*)::text from public.player_identity_codes$$,
                'TEST18 Spieler kann fremde Kennwoerter nicht lesen',
                'WIRFT:permission denied for table player_identity_codes');
reset role;

drop function kw_pruef(text, text, text);
