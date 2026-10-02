/* ======================================================
   PRUEFUNG ZU 34-story-musik.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 34 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Aendert live_event NICHT (jede Aenderung dort ginge per Realtime
   an alle Besucher). admin_story_musik wird nur als Nicht-Admin
   geprueft; die Form der Versionsliste direkt an der Pruefung.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '34aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Form der Versionsliste. */
  ok := app.musik_versionen_ok('{}'::jsonb) = true
        and app.musik_versionen_ok('{"riss":"mgx1k2","disco":"abc_-9"}'::jsonb) = true
        and app.musik_versionen_ok('[]'::jsonb) = false
        and app.musik_versionen_ok('{"Riss":"a"}'::jsonb) = false
        and app.musik_versionen_ok('{"riss":"a b"}'::jsonb) = false
        and app.musik_versionen_ok('{"riss":7}'::jsonb) = false
        and app.musik_versionen_ok('{"x'' or 1=1":"a"}'::jsonb) = false
        and app.musik_versionen_ok((select jsonb_object_agg('s' || g, 'v') from generate_series(1, 31) g)) = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 nur Story-Kennung -> Version, hoechstens 30' || E'\n';

  /* T2: Spalte, Pruefung und Uebernahme der Disco-Version. */
  ok := exists (select 1 from pg_constraint where conname = 'live_event_musik_versionen_form')
        and (select (musik_version is null or musik_versionen->>'disco' = musik_version)
               from public.live_event where id = 1) = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 musik_versionen geprueft, Disco-Version uebernommen' || E'\n';

  /* T3: ein Nicht-Admin setzt keine Musik. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  ok := false;
  begin
    perform app.admin_story_musik('riss', 'test34');
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  perform set_config('request.jwt.claims', '', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 Nicht-Admin kann keine Story-Musik setzen' || E'\n';

  /* T4: Rechte - anon ruft nichts auf. */
  ok := has_function_privilege('anon', 'public.admin_story_musik(text, text)', 'execute') = false
        and has_function_privilege('anon', 'app.admin_story_musik(text, text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_story_musik(text, text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 anon darf admin_story_musik nicht aufrufen' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
