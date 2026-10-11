/* ======================================================
   PRUEFUNG ZU 38-herz-film.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 38 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Alles, was schreibt, steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck. live_event bleibt
   unberuehrt (jede Aenderung dort ginge per Realtime an alle).
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '38aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  r       jsonb;
begin
  perform set_config('role', 'postgres', true);

  /* T1: 'herz' ist eine bekannte Story, Unsinn nicht. */
  ok := false;
  begin
    insert into public.live_storys (story_id, story) values ('38test-herz', 'herz');
    ok := true;
    begin
      insert into public.live_storys (story_id, story) values ('38test-quatsch', 'quatsch');
      ok := false;
    exception when check_violation then null; end;
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ok := ok and exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt'
                        and pg_get_constraintdef(oid) like '%herz%');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 herz in live_storys und live_event erlaubt, Unsinn nicht' || E'\n';

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T2: ein Nicht-Admin startet den Film nicht. */
  ok := false;
  begin
    perform app.admin_live_story('herz');
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Nicht-Admin kann den Film nicht starten' || E'\n';

  /* T3: Belohnung am Ende - erst "keine", nach dem Einstellen
     ausgezahlt, aber nicht vor 600 s. */
  ok := false;
  begin
    insert into public.live_storys (story_id, story, gestartet_am) values
      ('38test-ende', 'herz', now() - interval '610 seconds'),
      ('38test-frueh', 'herz', now() - interval '60 seconds');
    ok := (app.live_story_belohnung('38test-ende', 'abschluss', 0)->>'grund') = 'keine';
    update public.live_story_preise set dublonen = 50, skillpunkte = 1 where schluessel = 'herz';
    ok := ok and (app.live_story_belohnung('38test-frueh', 'abschluss', 0)->>'grund') = 'zu-frueh';
    r := app.live_story_belohnung('38test-ende', 'abschluss', 0);
    ok := ok and (r->>'dublonen')::int = 50 and (r->>'skillpunkte')::int = 1
             and (app.live_story_belohnung('38test-ende', 'wetter', 0)->>'grund') = 'falsche-art';
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 Belohnung am Filmende nach den Preisen, nicht vor 600 s' || E'\n';

  /* T4: Preis-Schluessel da (Start 0), in der Kopie fuer die Browser;
     Rechte unveraendert. */
  perform set_config('request.jwt.claims', '', true);
  ok := (select dublonen from public.live_story_preise where schluessel = 'herz') = 0
        and (select story_preise ? 'herz' from public.live_event where id = 1) = true
        and has_function_privilege('anon', 'public.admin_live_story(text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_live_story(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Preis-Schluessel herz da, Rechte unveraendert' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
