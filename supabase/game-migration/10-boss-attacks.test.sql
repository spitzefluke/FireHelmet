\set ON_ERROR_STOP off
set client_min_messages to notice;

/* ======================================================
   TESTS ZU 10-boss-attacks.sql
   ---------------------------------------------------
   Ausfuehren gegen eine Datenbank, in die 00, 01, 03 und 10
   eingespielt sind. Jede Zeile meldet PASS oder FAIL.

   Geprueft wird vor allem das, was frueher NICHT abgesichert war:
   dass niemand den Schaden selbst bestimmt, dass die Tagessperre auf
   dem Server sitzt, und dass ein nicht freigeschalteter
   Spezialangriff nicht durchgeht.
====================================================== */

create or replace function pruef(p_bedingung boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_bedingung then raise notice 'PASS - %', p_label;
  else raise notice 'FAIL - %', p_label; end if;
end; $$;

/* WICHTIG fuer alle Aufrufe von boss_attack() hier:
   NIE "boss_attack(...) between x and y" schreiben. Postgres schreibt
   BETWEEN zu "a >= x and a <= y" um und setzt den Ausdruck dabei
   ZWEIMAL ein. boss_attack() ist volatile, wird also auch zweimal
   ausgefuehrt - der zweite Aufruf laeuft dann in die Tagessperre und
   der ganze Test scheitert an seinem eigenen Aufbau. Deshalb steht
   der Aufruf immer in einem WITH und wird nur ueber die Spalte
   angefasst. */
create or replace function pruef_wirft(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice 'FAIL - % wurde faelschlich akzeptiert', p_label;
exception when others then
  raise notice 'PASS - % (%)', p_label, sqlerrm;
end; $$;

-- ============================================================
-- Vorbereitung
-- ============================================================
set role postgres;
delete from public.boss_community_buff;
delete from public.boss_attack_state;
delete from public.boss_special_codes;
delete from public.community_boss_damage;
delete from public.community_boss;

insert into public.community_boss (month_id, hp, max_hp) values ('2026-09', 5000, 5000);
insert into public.community_boss_damage (month_id, firebase_uid, nickname, total_damage)
  values ('2026-09', 'a0000000-0000-0000-0000-000000000001', 'Anna', 0);

-- Ein Geheimcode fuer die Kanonensalve: SHA-256 von 'TESTSALVE'
insert into public.boss_special_codes (code_sha256, schluessel)
  values (encode(extensions.digest('TESTSALVE','sha256'),'hex'), 'salve');
reset role;

\set anna '\'{"sub":"a0000000-0000-0000-0000-000000000001"}\''
\set bert '\'{"sub":"b0000000-0000-0000-0000-000000000002"}\''

-- ============================================================
-- TEST 1: Katalog ist oeffentlich lesbar, Codes sind es nicht
-- ============================================================
set role anon;
select set_config('request.jwt.claims','',false);
select pruef((select count(*) from public.boss_attack_defs) = 14, 'TEST1a anon liest den Katalog');
select pruef_wirft($$select count(*) from public.boss_special_codes$$,
             'TEST1b anon kommt an die Geheimcodes gar nicht heran');
reset role;

set role authenticated;
select set_config('request.jwt.claims', :anna, false);
select pruef_wirft($$select count(*) from public.boss_special_codes$$,
             'TEST1c auch angemeldet nicht');
reset role;

-- ============================================================
-- TEST 2: Grundangriff geht, zweiter am selben Tag nicht
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :anna, false);
with r as (select public.boss_attack('2026-09','saebel') as j)
select pruef((r.j ->> 'schaden')::int between 28 and 32, 'TEST2a Saebel macht 28-32 Schaden') from r;
select pruef_wirft($$select public.boss_attack('2026-09','saebel')$$,
             'TEST2b zweiter Angriff am selben Tag');
reset role;

-- ============================================================
-- TEST 3: Die Tagessperre steht auf dem SERVER
--         (frueher nur im localStorage des Browsers)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :anna, false);
select pruef_wirft($$select public.boss_attack('2026-09','kanone')$$,
             'TEST3 auch ein ANDERER Grundangriff ist heute gesperrt');
reset role;

-- ============================================================
-- TEST 4: Spezialangriff ohne Freischaltung geht nicht
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :bert, false);
select pruef_wirft($$select public.boss_attack('2026-09','salve')$$,
             'TEST4 Kanonensalve ohne Code');
reset role;

-- ============================================================
-- TEST 5: Freischalten per Code, danach geht sie
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :bert, false);
select pruef(public.boss_unlock_special('falschercode') is null, 'TEST5a falscher Code gibt NULL');
select pruef(public.boss_unlock_special('testsalve') = 'salve',   'TEST5b richtiger Code, Gross/Klein egal');
with r as (select public.boss_attack('2026-09','salve') as j)
select pruef((r.j ->> 'schaden')::int = 90, 'TEST5c Kanonensalve macht jetzt 90') from r;
select pruef_wirft($$select public.boss_attack('2026-09','salve')$$,
             'TEST5d zweite Salve innerhalb der Wochensperre');
with r as (select public.boss_attack('2026-09','saebel') as j)
select pruef((r.j ->> 'schaden')::int between 28 and 32,
             'TEST5e der taegliche Grundangriff ist davon unberuehrt') from r;
reset role;

-- ============================================================
-- TEST 6: Der Spieler kann seinen Zustand NICHT selbst schreiben
--         (sonst traegt er sich jeden Spezialangriff ein)
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :bert, false);
select pruef_wirft($$update public.boss_attack_state
                       set frei = array['fass','pulverfass']
                     where firebase_uid = 'b0000000-0000-0000-0000-000000000002'$$,
             'TEST6a eigenen Zustand ueberschreiben');
select pruef_wirft($$insert into public.boss_attack_state (firebase_uid, frei)
                     values ('c0000000-0000-0000-0000-000000000003', array['fass'])$$,
             'TEST6b Zustandszeile selbst anlegen');
reset role;

-- ============================================================
-- TEST 7: Der DIREKTE Weg bleibt bei 45 gedeckelt
--         Ohne die Sitzungsmarke aus boss_attack() darf niemand
--         mehr als 45 HP auf einmal abziehen.
-- ============================================================
set role postgres;
update public.community_boss set hp = 4000 where month_id = '2026-09';
reset role;

set role authenticated;
select set_config('request.jwt.claims', :anna, false);
select pruef_wirft($$update public.community_boss set hp = 3000 where month_id = '2026-09'$$,
             'TEST7a direkter Abzug von 1000 HP');
select pruef((select hp from public.community_boss where month_id='2026-09') = 4000,
             'TEST7b HP steht unveraendert bei 4000');
reset role;

-- ============================================================
-- TEST 8: Der alte Aufruf funktioniert weiter
--         Solange der Browser noch die alte Fassung benutzt.
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims', :anna, false);
select pruef((select hp from public.attack_community_boss('2026-09', 40)) = 3960,
             'TEST8a attack_community_boss(40) geht weiter');
select pruef_wirft($$select public.attack_community_boss('2026-09', 300)$$,
             'TEST8b attack_community_boss(300) bleibt gesperrt');
reset role;

-- ============================================================
-- TEST 9: Der Schlachtruf verstaerkt alle
-- ============================================================
set role postgres;
delete from public.boss_attack_state;
insert into public.boss_community_buff (month_id, art, faktor, bis)
  values ('2026-09', 'schlachtruf', 1.5, now() + interval '1 hour');
reset role;

set role authenticated;
select set_config('request.jwt.claims', :anna, false);
with r as (select public.boss_attack('2026-09','saebel') as j)
select pruef((r.j ->> 'schaden')::int between 42 and 48,
             'TEST9 Saebel unter Schlachtruf: 28-32 mal 1,5') from r;
reset role;

-- ============================================================
-- TEST 10: Nichts im Katalog sprengt den Policy-Deckel
-- ============================================================
select pruef((select max(max_schaden) from public.boss_attack_defs) <= 400,
             'TEST10 hoechster Katalogwert bleibt unter 400');

-- ============================================================
-- TEST 11: JEDER Spezialangriff einmal ausfuehren
--          Elf Zweige, elf Gelegenheiten fuer einen Fehler. Jeder
--          bekommt seine eigene Wochensperre, sie stehen sich also
--          nicht gegenseitig im Weg. Pulverfass und Fass verhaengen
--          danach eine Zwangspause - die kommen deshalb zum Schluss.
-- ============================================================
set role postgres;
delete from public.boss_community_buff;
delete from public.boss_attack_state;
update public.community_boss set hp = 5000, defeated = false where month_id = '2026-09';
insert into public.boss_attack_state (firebase_uid, frei) values
  ('a0000000-0000-0000-0000-000000000001',
   array['salve','brandpfeil','enterkommando','pulverfass','schlachtruf',
         'fass','slot','moewen','katapult','seemannslied','rechnung']);
reset role;

set role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001"}',false);

do $$
declare
  a text;
  r jsonb;
  d public.boss_attack_defs;
begin
  foreach a in array array['salve','brandpfeil','enterkommando','schlachtruf',
                           'slot','moewen','katapult','seemannslied','rechnung']
  loop
    begin
      r := public.boss_attack('2026-09', a);
      select * into d from public.boss_attack_defs where schluessel = a;
      -- Der Schlachtruf verstaerkt alles danach; die Obergrenze
      -- deshalb grosszuegig gegen den Katalogwert mal zwei pruefen.
      if (r ->> 'schaden')::int between d.min_schaden and greatest(d.max_schaden * 2, 1) then
        raise notice 'PASS - TEST11 % macht % Schaden', a, r ->> 'schaden';
      else
        raise notice 'FAIL - TEST11 % macht % Schaden, Katalog sagt %-%',
          a, r ->> 'schaden', d.min_schaden, d.max_schaden;
      end if;
    exception when others then
      raise notice 'FAIL - TEST11 % wirft: %', a, sqlerrm;
    end;
  end loop;
end $$;

-- Pulverfass: hoher Schaden, danach 24 Stunden gar nichts mehr
do $$
declare r jsonb;
begin
  r := public.boss_attack('2026-09','pulverfass');
  raise notice 'PASS - TEST11 pulverfass macht % Schaden', r ->> 'schaden';
exception when others then raise notice 'FAIL - TEST11 pulverfass wirft: %', sqlerrm;
end $$;
select pruef_wirft($$select public.boss_attack('2026-09','slot')$$,
             'TEST11z Zwangspause nach dem Pulverfass sperrt alles');
reset role;

set role postgres;
update public.boss_attack_state set ruhe_bis = null
 where firebase_uid = 'a0000000-0000-0000-0000-000000000001';
reset role;

set role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001"}',false);
do $$
declare r jsonb;
begin
  r := public.boss_attack('2026-09','fass');
  raise notice 'PASS - TEST11 fass macht % Schaden', r ->> 'schaden';
exception when others then raise notice 'FAIL - TEST11 fass wirft: %', sqlerrm;
end $$;
reset role;

-- ============================================================
-- TEST 12: Die Statusabfrage antwortet vollstaendig
-- ============================================================
set role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001"}',false);
with s as (select public.boss_attack_status('2026-09') as j)
select pruef(
  (s.j ->> 'angemeldet')::boolean
  and jsonb_array_length(s.j -> 'frei') = 11
  and (s.j ? 'ruheBis') and (s.j ? 'heuteSchonAngegriffen'),
  'TEST12 boss_attack_status liefert Freischaltungen und Sperren') from s;
reset role;

drop function if exists pruef(boolean, text);
drop function if exists pruef_wirft(text, text);
