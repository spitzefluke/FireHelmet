/* ======================================================
   TESTS zu 15-admin-werkzeuge-3.sql
   Erwartet: 20 x PASS, 0 x FAIL.
====================================================== */
\set ON_ERROR_STOP off
set client_min_messages to notice;

create or replace function a3_pruef(p_sql text, p_label text, p_soll text) returns void
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
delete from public.giveaway_winners where round_id = 'los-2099';
delete from public.giveaway_entries where giveaway_id = 'los-2099';
delete from public.support_reports  where message like 'Testmeldung%';
delete from public.pass_cap_grants;
update public.pass_cap_state set granted = 0 where id = 'cap';

insert into public.giveaway_entries (giveaway_id, firebase_uid, nickname) values
  ('los-2099','11111111-0000-0000-0000-000000000001','Los1'),
  ('los-2099','11111111-0000-0000-0000-000000000002','Los2'),
  ('los-2099','11111111-0000-0000-0000-000000000003','Los3');
insert into public.support_reports (message, nickname, page) values
  ('Testmeldung A', 'Anna', 'shop'),
  ('Testmeldung B', 'Bert', 'race');

-- ============================================================
-- TEST 1-4: Ohne Admin geht nichts
-- ============================================================
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated","email":"fremd@example.com"}', false);
select a3_pruef($$select app.admin_caps()::text$$,                              'TEST1 Cap-Liste ohne Admin',      'WIRFT:not-admin');
select a3_pruef($$select app.admin_cap_vergeben('x','Y')::text$$,               'TEST2 Cap vergeben ohne Admin',   'WIRFT:not-admin');
select a3_pruef($$select app.admin_support_liste()::text$$,                     'TEST3 Support-Liste ohne Admin',  'WIRFT:not-admin');
select a3_pruef($$select app.admin_verlosung_ziehen('los-2099', 1)::text$$,     'TEST4 Verlosung ohne Admin',      'WIRFT:not-admin');

-- Support-Meldungen bleiben auch direkt unsichtbar
set role authenticated;
select case when (select count(*) from public.support_reports) = 0 then 'PASS' else 'FAIL' end
    || ' - TEST5 Support-Meldungen bleiben fuer Spieler unsichtbar' as result;
reset role;

-- Ab hier als Admin
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000009","role":"authenticated","email":"y.n.trott@gmail.com"}', false);

-- ============================================================
-- TEST 6-11: Cap-Zusagen
-- ============================================================
select case when (app.admin_caps() ->> 'vergeben')::int = 0 then 'PASS' else 'FAIL' end
    || ' - TEST6 zu Beginn ist keine Cap vergeben' as result;

select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000001', 'Los1');
select case when (select granted from public.pass_cap_state where id='cap') = 1
             and (select count(*) from public.pass_cap_grants) = 1
            then 'PASS' else 'FAIL' end || ' - TEST7 Zusage und Zaehler wandern gemeinsam' as result;

select a3_pruef($$select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000001','Los1')::text$$,
                'TEST8 zweimal an dieselbe Person geht nicht', 'WIRFT:hat-schon-eine-cap');

select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000002', 'Los2');
select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000003', 'Los3');
select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000004', 'Los4');
select a3_pruef($$select app.admin_cap_vergeben('11111111-0000-0000-0000-000000000005','Los5')::text$$,
                'TEST9 die fuenfte Cap wird abgelehnt', 'WIRFT:alle-vier-schon-vergeben');

select app.admin_cap_zuruecknehmen('11111111-0000-0000-0000-000000000004', 'Fehleintrag');
select case when (select granted from public.pass_cap_state where id='cap') = 3
             and (select count(*) from public.pass_cap_grants) = 3
            then 'PASS' else 'FAIL' end || ' - TEST10 Zuruecknehmen senkt auch den Zaehler' as result;

select a3_pruef($$select app.admin_cap_zuruecknehmen('11111111-0000-0000-0000-000000000009')::text$$,
                'TEST11 Zuruecknehmen ohne Zusage wirft', 'WIRFT:keine-zusage-vorhanden');

-- ============================================================
-- TEST 12-15: Support-Meldungen
-- ============================================================
-- Nur die eigenen Meldungen zaehlen: andere Testreihen legen
-- ebenfalls Support-Meldungen an, die hier mit auftauchen wuerden.
select case when (select count(*) from app.admin_support_liste(true) l where l.nachricht like 'Testmeldung%') = 2
            then 'PASS' else 'FAIL' end || ' - TEST12 Admin sieht beide offenen Meldungen' as result;

select app.admin_support_erledigt((select min(id) from public.support_reports where message like 'Testmeldung%'), true);
select case when (select count(*) from app.admin_support_liste(true) l where l.nachricht like 'Testmeldung%') = 1
            then 'PASS' else 'FAIL' end || ' - TEST13 erledigte Meldung faellt aus der offenen Liste' as result;
select case when (select count(*) from app.admin_support_liste(false) l where l.nachricht like 'Testmeldung%') = 2
            then 'PASS' else 'FAIL' end || ' - TEST14 mit p_nur_offene=false sind wieder beide da' as result;

select app.admin_support_loeschen((select min(id) from public.support_reports where message like 'Testmeldung%'));
select case when (select count(*) from public.support_reports where message like 'Testmeldung%') = 1
            then 'PASS' else 'FAIL' end || ' - TEST15 Loeschen wirkt' as result;

-- ============================================================
-- TEST 16-20: Verlosung
-- ============================================================
-- Gezielt die eigene Runde heraussuchen statt auf die Reihenfolge zu
-- setzen: andere Testreihen legen weitere Verlosungsrunden an.
select case when (select (r ->> 'lose')::int
                    from jsonb_array_elements(app.admin_verlosung_uebersicht() -> 'runden') r
                   where r ->> 'runde' = 'los-2099') = 3
            then 'PASS' else 'FAIL' end || ' - TEST16 Uebersicht zaehlt die Lose' as result;
select case when (select count(*) from app.admin_verlosung_lose('los-2099')) = 3
            then 'PASS' else 'FAIL' end || ' - TEST17 Losliste hat drei Eintraege' as result;

select case when jsonb_array_length(app.admin_verlosung_ziehen('los-2099', 2)) = 2
            then 'PASS' else 'FAIL' end || ' - TEST18 zwei Gewinner gezogen' as result;
select case when (select jsonb_array_length(winners) from public.giveaway_winners where round_id='los-2099') = 2
            then 'PASS' else 'FAIL' end || ' - TEST19 Ergebnis ist gespeichert' as result;

select app.admin_verlosung_los_entfernen('los-2099', '11111111-0000-0000-0000-000000000003');
select case when (select count(*) from public.giveaway_entries where giveaway_id='los-2099') = 2
            then 'PASS' else 'FAIL' end || ' - TEST20 Los entfernt' as result;

drop function a3_pruef(text, text, text);
