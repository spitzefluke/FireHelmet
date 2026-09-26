/* ======================================================
   PRUEFUNG ZU 33-ablaufplaene.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 33 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Aendert live_event nicht. Testzeilen (Name beginnt mit
   "33TEST") werden am Ende geloescht; ein schon gewaehlter echter
   Plan wird fuer den Test abgewaehlt und danach wieder gewaehlt.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '33aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  n       integer;
  echt    text;
begin
  perform set_config('role', 'postgres', true);
  delete from public.event_ablaufplaene where name like '33TEST%';
  select plan_id into echt from public.event_ablaufplaene where aktiv;
  update public.event_ablaufplaene set aktiv = false where aktiv;

  /* T1: Form der Storys, Anzahl, Name. */
  insert into public.event_ablaufplaene (name, storys) values ('33TEST gut', array['sturm', 'riss', 'gegenhack_niederlage']);
  insert into public.event_ablaufplaene (name) values ('33TEST leer');
  ok := true;
  begin
    insert into public.event_ablaufplaene (name, storys) values ('33TEST boese', array['sturm', 'x'' or 1=1']);
    ok := false;
  exception when check_violation then null; end;
  begin
    insert into public.event_ablaufplaene (name, storys) values ('33TEST lang', array_fill('sturm'::text, array[31]));
    ok := false;
  exception when check_violation then null; end;
  begin
    insert into public.event_ablaufplaene (name) values ('   ');
    ok := false;
  exception when check_violation then null; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 nur Story-Kennungen, hoechstens 30, Name nicht leer' || E'\n';

  /* T2: hoechstens ein gewaehlter Plan. */
  update public.event_ablaufplaene set aktiv = true where name = '33TEST gut';
  ok := false;
  begin
    update public.event_ablaufplaene set aktiv = true where name = '33TEST leer';
  exception when unique_violation then ok := true; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 hoechstens ein gewaehlter Plan' || E'\n';

  /* T3: ein Nicht-Admin sieht nichts und schreibt nichts. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.event_ablaufplaene;
  ok := n = 0;
  begin
    insert into public.event_ablaufplaene (name) values ('33TEST frech');
    ok := false;
  exception when insufficient_privilege then null; end;
  update public.event_ablaufplaene set name = '33TEST gekapert';
  get diagnostics n = row_count;
  ok := ok and n = 0;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 Nicht-Admin liest und schreibt keine Plaene' || E'\n';

  /* T4: anon hat gar keine Rechte. */
  ok := has_table_privilege('anon', 'public.event_ablaufplaene', 'select') = false
        and has_table_privilege('anon', 'public.event_ablaufplaene', 'insert') = false
        and has_table_privilege('authenticated', 'public.event_ablaufplaene', 'select') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 anon ohne Rechte, authenticated nur ueber RLS' || E'\n';

  delete from public.event_ablaufplaene where name like '33TEST%';
  if echt is not null then update public.event_ablaufplaene set aktiv = true where plan_id = echt; end if;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.event_ablaufplaene where name like '33TEST%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
