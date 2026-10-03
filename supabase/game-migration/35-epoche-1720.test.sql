/* ======================================================
   PRUEFUNG ZU 35-epoche-1720.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 35 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Prueft den Trigger an einer Kopie der Zeile in einer temporaeren
   Tabelle - live_event selbst bleibt unberuehrt (jede Aenderung dort
   ginge per Realtime an alle Besucher).
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '35aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  ab      timestamptz;
begin
  perform set_config('role', 'postgres', true);

  /* Spielwiese: gleiche Spalten wie live_event, gleicher Trigger. */
  create temp table epoche_probe (like public.live_event including defaults) on commit drop;
  create trigger epoche_probe_t before update on epoche_probe
    for each row execute function app.live_event_epoche();
  insert into epoche_probe (id) values (1);

  /* T1: Riss startet -> 1720 genau 300 s nach dem Start. */
  update epoche_probe set story = 'riss', story_id = 'a', story_at = now() where id = 1;
  select jahr_1720_ab into ab from epoche_probe;
  ok := ab = now() + interval '300 seconds';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Riss setzt 1720 auf Start + 300 s' || E'\n';

  /* T2: abgebrochen, bevor der Film zu Ende ist -> kein 1720. */
  update epoche_probe set story = null, story_id = null, story_at = null where id = 1;
  select jahr_1720_ab into ab from epoche_probe;
  ok := ab is null;
  update epoche_probe set story = 'riss', story_id = 'b', story_at = now() where id = 1;
  update epoche_probe set story = 'sturm', story_id = 'c', story_at = now() where id = 1;
  select jahr_1720_ab into ab from epoche_probe;
  ok := ok and ab is null;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Abbruch oder andere Story vor Filmende: kein 1720' || E'\n';

  /* T3: schon erreichtes 1720 bleibt, auch bei spaeteren Storys. */
  update epoche_probe set jahr_1720_ab = now() - interval '1 minute' where id = 1;
  update epoche_probe set story = 'disco', story_id = 'd', story_at = now() where id = 1;
  update epoche_probe set story = null, story_id = null, story_at = null where id = 1;
  select jahr_1720_ab into ab from epoche_probe;
  ok := ab = now() - interval '1 minute';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 erreichtes 1720 bleibt bei spaeteren Storys' || E'\n';

  /* T4: Nicht-Admin schaltet nicht um, anon darf gar nicht. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  ok := false;
  begin
    perform app.admin_epoche('1720');
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  perform set_config('request.jwt.claims', '', true);
  ok := ok
        and has_function_privilege('anon', 'public.admin_epoche(text)', 'execute') = false
        and has_function_privilege('anon', 'app.admin_epoche(text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_epoche(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 nur der Admin schaltet die Epoche um' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
