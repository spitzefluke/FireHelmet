/* ======================================================
   PRUEFUNG ZU 70-liebeslied.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 70 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Story, Preis,
   Testspieler) steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck. Eine laufende Story
   wird dafuer nur innerhalb dieses Blocks ersetzt.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt. Die Zeit laeuft nicht im Test - stattdessen wird
   gestartet_am zurueckgesetzt.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '70aa0000-0000-0000-0000-0000000000ff';
  p1      constant text := '70aa0000-0000-0000-0000-0000000000a1';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     text;
  vorher  integer;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Die Story 'liebeslied' ist ueberall bekannt - und 'reise' noch da. */
  ok := exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt' and pg_get_constraintdef(oid) like '%''liebeslied''%')
    and exists (select 1 from pg_constraint where conname = 'live_storys_story_bekannt' and pg_get_constraintdef(oid) like '%''liebeslied''%')
    and exists (select 1 from pg_constraint where conname = 'live_story_preise_bekannt' and pg_get_constraintdef(oid) like '%''liebeslied''%')
    and exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt' and pg_get_constraintdef(oid) like '%''reise''%')
    and exists (select 1 from public.live_story_preise where schluessel = 'liebeslied')
    and pg_get_functiondef('app.live_story_belohnung(text,text,integer)'::regprocedure) like '%when ''liebeslied'' then 70%'
    and pg_get_functiondef('app.admin_live_story(text)'::regprocedure) like '%''reise'', ''liebeslied''%'
    and pg_get_functiondef('app.admin_live_story(text)'::regprocedure) like '%insert into public.reise_laeufe%';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Story liebeslied in Listen, Preisen und Belohnung' || E'\n';

  begin
    /* T2: Der Admin startet die Story; ein anderer darf das nicht. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    sid := app.admin_live_story('liebeslied');
    ok := (select story = 'liebeslied' and story_id = sid from public.live_event where id = 1)
      and exists (select 1 from public.live_storys where story_id = sid and story = 'liebeslied');
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    begin perform app.admin_live_story('liebeslied'); ok := false; exception when others then ok := ok and sqlerrm = 'nur-admin'; end;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Admin startet liebeslied, sonst niemand' || E'\n';

    /* T3: Abschluss erst ab 70 s, nur mit Preis, nur einmal. */
    update public.live_story_preise set dublonen = 40, skillpunkte = 0 where schluessel = 'liebeslied';
    erg := app.live_story_belohnung(sid, 'abschluss', 0);
    ok := (erg ->> 'ok')::boolean = false and erg ->> 'grund' = 'zu-frueh';
    update public.live_storys set gestartet_am = now() - interval '71 seconds' where story_id = sid;
    insert into public.players (firebase_uid) values (p1) on conflict (firebase_uid) do nothing;
    vorher := (select currency from public.players where firebase_uid = p1);
    erg := app.live_story_belohnung(sid, 'abschluss', 0);
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'dublonen')::integer = 40
      and (select currency from public.players where firebase_uid = p1) = vorher + 40;
    erg := app.live_story_belohnung(sid, 'abschluss', 0);
    ok := ok and (erg ->> 'ok')::boolean = false and erg ->> 'grund' = 'schon';
    erg := app.live_story_belohnung(sid, 'wetter', 0);
    ok := ok and (erg ->> 'ok')::boolean = false and erg ->> 'grund' = 'falsche-art';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Abschluss ab 70 s, einmal' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T4: Unbekannte Storys bleiben verboten, Rechte wie zuvor. */
  ok := has_function_privilege('anon', 'app.admin_live_story(text)', 'execute') = false
    and has_function_privilege('anon', 'app.live_story_belohnung(text, text, integer)', 'execute') = false
    and has_function_privilege('authenticated', 'app.live_story_belohnung(text, text, integer)', 'execute') = true;
  begin
    insert into public.live_storys (story_id, story) values ('70-test', 'karaoke');
    ok := false;
  exception when check_violation then
    null;  -- erwartet: Constraint lehnt ab
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Unbekannte Story abgelehnt, Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
