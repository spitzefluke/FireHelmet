/* ======================================================
   PRUEFUNG ZU 32-riss.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 32 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Aendert live_event NICHT (jede Aenderung dort ginge per Realtime
   an alle Besucher). Story-Starts werden direkt in live_storys
   geschrieben; admin_live_story wird nur als Nicht-Admin geprueft.
   Testzeilen (Kennung "32test") werden am Ende geloescht.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '32aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
begin
  perform set_config('role', 'postgres', true);
  delete from public.live_story_belohnungen where story_id like '32test%';
  delete from public.live_storys where story_id like '32test%';

  /* T1: 'riss' ist eine bekannte Story, Unsinn nicht. */
  insert into public.live_storys (story_id, story, gestartet_am) values ('32test-riss', 'riss', now() - interval '60 seconds');
  ok := true;
  begin
    insert into public.live_storys (story_id, story) values ('32test-quatsch', 'quatsch');
    ok := false;
  exception when check_violation then null; end;
  ok := ok and exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt'
                        and pg_get_constraintdef(oid) like '%riss%');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 riss in live_storys und live_event erlaubt, Unsinn nicht' || E'\n';

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T2: ein Nicht-Admin startet den Riss nicht. */
  ok := false;
  begin
    perform app.admin_live_story('riss');
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Nicht-Admin kann den Riss nicht starten' || E'\n';

  /* T3: der Riss zahlt nichts aus. */
  ok := (app.live_story_belohnung('32test-riss', 'wetter', 0)->>'grund') = 'falsche-art'
        and (app.live_story_belohnung('32test-riss', 'werbung', 6)->>'grund') = 'falsche-art'
        and not exists (select 1 from public.live_story_belohnungen where story_id = '32test-riss');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 keine Belohnung fuer den Riss' || E'\n';

  /* T4: Rechte unveraendert - anon startet nichts. */
  ok := has_function_privilege('anon', 'public.admin_live_story(text)', 'execute') = false
        and has_function_privilege('anon', 'app.admin_live_story(text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_live_story(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 anon darf admin_live_story nicht aufrufen' || E'\n';

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.live_story_belohnungen where story_id like '32test%';
  delete from public.live_storys where story_id like '32test%';
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.live_story_belohnungen where story_id like '32test%';
  delete from public.live_storys where story_id like '32test%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
