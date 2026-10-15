/* ======================================================
   PRUEFUNG ZU 46-zeitmaschine-2100.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 46 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Prueft die Trigger an einer Kopie der Zeile in einer temporaeren
   Tabelle - live_event selbst bleibt unberuehrt (jede Aenderung dort
   ginge per Realtime an alle Besucher). Alles andere steht in einem
   inneren Block, der mit einer Ausnahme endet - Postgres rollt ihn
   zurueck.
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '46aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  ab      timestamptz;
  ab1720  timestamptz;
  erg     jsonb;
begin
  perform set_config('role', 'postgres', true);

  /* Spielwiese: gleiche Spalten wie live_event, beide Trigger. */
  create temp table epoche_probe (like public.live_event including defaults) on commit drop;
  create trigger epoche_probe_t1 before update on epoche_probe
    for each row execute function app.live_event_epoche();
  create trigger epoche_probe_t2 before update on epoche_probe
    for each row execute function app.live_event_epoche_2100();
  insert into epoche_probe (id) values (1);

  /* T1: Zeitmaschine startet -> 2100 genau 300 s nach dem Start,
     1720 bleibt unberuehrt. */
  update epoche_probe set jahr_1720_ab = now() - interval '1 hour' where id = 1;
  update epoche_probe set story = 'zeit', story_id = 'a', story_at = now() where id = 1;
  select jahr_2100_ab, jahr_1720_ab into ab, ab1720 from epoche_probe;
  ok := ab = now() + interval '300 seconds' and ab1720 = now() - interval '1 hour';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Zeitmaschine setzt 2100 auf Start + 300 s, 1720 bleibt' || E'\n';

  /* T2: abgebrochen oder abgeloest, bevor der Film zu Ende ist -> kein 2100. */
  update epoche_probe set story = null, story_id = null, story_at = null where id = 1;
  select jahr_2100_ab into ab from epoche_probe;
  ok := ab is null;
  update epoche_probe set story = 'zeit', story_id = 'b', story_at = now() where id = 1;
  update epoche_probe set story = 'riss', story_id = 'c', story_at = now() where id = 1;
  select jahr_2100_ab, jahr_1720_ab into ab, ab1720 from epoche_probe;
  ok := ok and ab is null and ab1720 = now() + interval '300 seconds';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Abbruch oder Riss vor Filmende: kein 2100 (Riss setzt 1720)' || E'\n';

  /* T3: schon erreichtes 2100 bleibt bei spaeteren Storys. */
  update epoche_probe set jahr_2100_ab = now() - interval '1 minute' where id = 1;
  update epoche_probe set story = 'disco', story_id = 'd', story_at = now() where id = 1;
  update epoche_probe set story = null, story_id = null, story_at = null where id = 1;
  select jahr_2100_ab into ab from epoche_probe;
  ok := ab = now() - interval '1 minute';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 erreichtes 2100 bleibt bei spaeteren Storys' || E'\n';

  /* T4: Story 'zeit' ist in allen Listen bekannt. */
  ok := exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt'
                  and pg_get_constraintdef(oid) like '%''zeit''%')
    and exists (select 1 from pg_constraint where conname = 'live_storys_story_bekannt'
                  and pg_get_constraintdef(oid) like '%''zeit''%')
    and exists (select 1 from public.live_story_preise where schluessel = 'zeit');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Story zeit in Constraints und Preisliste' || E'\n';

  /* T5: Belohnung fuer 'zeit' erst nach 290 s (und nur mit Preis). */
  begin
    insert into public.live_storys (story_id, story, gestartet_am) values ('t46-frueh', 'zeit', now());
    insert into public.live_storys (story_id, story, gestartet_am) values ('t46-spaet', 'zeit', now() - interval '295 seconds');
    update public.live_story_preise set dublonen = 7 where schluessel = 'zeit';
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    erg := app.live_story_belohnung('t46-frueh', 'abschluss', 0);
    ok := erg ->> 'grund' = 'zu-frueh';
    erg := app.live_story_belohnung('t46-spaet', 'abschluss', 0);
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'dublonen')::int = 7;
    perform set_config('request.jwt.claims', '', true);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
            || '  T5 Belohnung zeit erst nach 290 s' || E'\n';
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  T5 (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Nicht-Admin schaltet nicht um, '2100' ist bekannt, anon darf gar nicht. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  ok := false;
  begin
    perform app.admin_epoche('2100');
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  perform set_config('request.jwt.claims', '', true);
  ok := ok
        and position('''2100''' in pg_get_functiondef('app.admin_epoche(text)'::regprocedure)) > 0
        and has_function_privilege('anon', 'public.admin_epoche(text)', 'execute') = false
        and has_function_privilege('anon', 'app.admin_epoche(text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_epoche(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 nur der Admin schaltet, 2100 ist bekannt' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
