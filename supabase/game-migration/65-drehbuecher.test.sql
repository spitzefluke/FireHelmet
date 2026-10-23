/* ======================================================
   PRUEFUNG ZU 65-drehbuecher.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 65 eingespielt wurde.
   Ein einziger DO-Block. Testzeilen (Name beginnt mit "65TEST")
   werden am Ende geloescht. Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '65aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  n       integer;
begin
  perform set_config('role', 'postgres', true);
  delete from public.event_drehbuecher where name like '65TEST%';

  /* T1: gueltige Schritte gehen durch. */
  insert into public.event_drehbuecher (name, schritte) values ('65TEST gut', '[
    {"art":"text","text":"Gleich geht es los","farbe":"#f0c96a","von":"Aendii","modus":"auto","sek":8},
    {"art":"story","story":"disco","modus":"hand"},
    {"art":"text","text":"Waehrend die Disco laeuft","modus":"auto","sek":10},
    {"art":"effekt","effekt":"konfetti","modus":"auto","sek":3},
    {"art":"pause","modus":"auto","sek":5},
    {"art":"story_ende","modus":"hand"}]'::jsonb);
  ausgabe := ausgabe || 'PASS  T1 gueltiges Drehbuch wird gespeichert' || E'\n';

  /* T2: Boeses wird abgelehnt. */
  ok := true;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST a', '[{"art":"hack"}]'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST b', '[{"art":"story","story":"x'' or 1=1"}]'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST c', '[{"art":"text","text":"x","farbe":"red"}]'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST d', '[{"art":"text","text":""}]'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST e', '[{"art":"pause","sek":99999}]'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST f', '{"art":"pause"}'::jsonb); ok := false;
  exception when check_violation then null; end;
  begin insert into public.event_drehbuecher (name, schritte) values ('65TEST g', (select jsonb_agg('{"art":"pause"}'::jsonb) from generate_series(1, 61))); ok := false;
  exception when check_violation then null; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 unbekannte Art, boese Story, Farbe, leerer Text, Dauer, Form, mehr als 60 Schritte' || E'\n';

  /* T3: ein Nicht-Admin sieht nichts und schreibt nichts. */
  perform set_config('request.jwt.claims', '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.event_drehbuecher;
  ok := n = 0;
  begin insert into public.event_drehbuecher (name) values ('65TEST frech'); ok := false;
  exception when insufficient_privilege then null; end;
  update public.event_drehbuecher set name = '65TEST gekapert';
  get diagnostics n = row_count;
  ok := ok and n = 0;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Nicht-Admin liest und schreibt keine Drehbuecher' || E'\n';

  /* T4: anon hat gar keine Rechte. */
  ok := has_table_privilege('anon', 'public.event_drehbuecher', 'select') = false
        and has_table_privilege('anon', 'public.event_drehbuecher', 'insert') = false
        and has_table_privilege('authenticated', 'public.event_drehbuecher', 'select') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 anon ohne Rechte, authenticated nur ueber RLS' || E'\n';

  delete from public.event_drehbuecher where name like '65TEST%';
  raise notice '%', ausgabe;
exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.event_drehbuecher where name like '65TEST%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
