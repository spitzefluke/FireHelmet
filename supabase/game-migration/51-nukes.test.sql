/* ======================================================
   PRUEFUNG ZU 51-nukes.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 51 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck,
   auch den Probestart in live_event (Realtime sieht nichts davon).
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '51aa0000-0000-0000-0000-00000000000a';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     text;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Story 'nukes' ist in allen Listen bekannt, die alten bleiben. */
  ok := exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt'
                  and pg_get_constraintdef(oid) like '%''nukes''%' and pg_get_constraintdef(oid) like '%''zeit''%')
    and exists (select 1 from pg_constraint where conname = 'live_storys_story_bekannt'
                  and pg_get_constraintdef(oid) like '%''nukes''%')
    and exists (select 1 from pg_constraint where conname = 'live_story_preise_bekannt'
                  and pg_get_constraintdef(oid) like '%''nukes''%')
    and exists (select 1 from public.live_story_preise where schluessel = 'nukes');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Story nukes in Constraints und Preisliste' || E'\n';

  begin
    /* T2: nur der Admin startet sie; danach gibt es eine live_storys-Zeile. */
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    ok := false;
    begin perform app.admin_live_story('nukes'); exception when others then ok := sqlerrm like '%nur-admin%'; end;
    perform set_config('request.jwt.claims',
      '{"sub":"51aa0000-0000-0000-0000-0000000000ff","role":"authenticated","email":"' || admin || '"}', true);
    sid := app.admin_live_story('nukes');
    ok := ok and exists (select 1 from public.live_storys where story_id = sid and story = 'nukes')
      and (select story from public.live_event where id = 1) = 'nukes';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
            || '  T2 nur der Admin startet nukes' || E'\n';

    /* T3: Belohnung fuer 'nukes' erst nach 170 s (und nur mit Preis). */
    insert into public.live_storys (story_id, story, gestartet_am) values ('t51-frueh', 'nukes', now());
    insert into public.live_storys (story_id, story, gestartet_am) values ('t51-spaet', 'nukes', now() - interval '175 seconds');
    update public.live_story_preise set dublonen = 9 where schluessel = 'nukes';
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    erg := app.live_story_belohnung('t51-frueh', 'abschluss', 0);
    ok := erg ->> 'grund' = 'zu-frueh';
    erg := app.live_story_belohnung('t51-spaet', 'abschluss', 0);
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'dublonen')::int = 9;
    erg := app.live_story_belohnung('t51-spaet', 'abschluss', 0);
    ok := ok and erg ->> 'grund' = 'schon';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
            || '  T3 Belohnung nukes erst nach 170 s, nur einmal' || E'\n';

    /* T4: die alten Abschluss-Zeiten gelten weiter (zeit: 290 s). */
    insert into public.live_storys (story_id, story, gestartet_am) values ('t51-zeit', 'zeit', now() - interval '200 seconds');
    erg := app.live_story_belohnung('t51-zeit', 'abschluss', 0);
    ok := erg ->> 'grund' = 'zu-frueh';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
            || '  T4 zeit weiter erst nach 290 s' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
