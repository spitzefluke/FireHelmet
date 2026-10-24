/* ======================================================
   PRUEFUNG ZU 67-sternenreise.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 67 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Story, Laeufe, Kanonen,
   Testspieler, Seite) steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck. Eine laufende Story
   wird dafuer nur innerhalb dieses Blocks ersetzt.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt; drei Testspieler besetzen Kanonen. Die Zeit laeuft
   nicht im Test - stattdessen wird gestartet_am zurueckgesetzt.
   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '67aa0000-0000-0000-0000-0000000000ff';
  p1      constant text := '67aa0000-0000-0000-0000-0000000000a1';
  p2      constant text := '67aa0000-0000-0000-0000-0000000000a2';
  p3      constant text := '67aa0000-0000-0000-0000-0000000000a3';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     text;
  le      public.live_event;
  k       public.reise_kanonen;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Die Story 'reise' ist ueberall bekannt. */
  ok := exists (select 1 from pg_constraint where conname = 'live_event_story_bekannt' and pg_get_constraintdef(oid) like '%''reise''%')
    and exists (select 1 from pg_constraint where conname = 'live_storys_story_bekannt' and pg_get_constraintdef(oid) like '%''reise''%')
    and exists (select 1 from pg_constraint where conname = 'live_story_preise_bekannt' and pg_get_constraintdef(oid) like '%''reise''%')
    and exists (select 1 from public.live_story_preise where schluessel = 'reise')
    and pg_get_functiondef('app.live_story_belohnung(text,text,integer)'::regprocedure) like '%when ''reise'' then 400%'
    and pg_get_functiondef('app.admin_live_story(text)'::regprocedure) like '%''nukes'', ''reise''%';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Story reise in Listen, Preisen und Belohnung' || E'\n';

  begin
    insert into public.players (firebase_uid, nickname) values (ad, 'ReiseAdmin'), (p1, 'Pilotin'), (p2, 'Kanonier'), (p3, 'Spaetling');
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);

    /* T2: Der Start legt den Lauf an; vor der Reise zaehlt keine Meldung. */
    sid := app.admin_live_story('reise');
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := app.reise_melden(sid, 3, 10, 'Sternfalke', '#ff9d3d');
    ok := exists (select 1 from public.reise_laeufe where story_id = sid and huelle = 100 and ergebnis is null)
      and (select story from public.live_event where id = 1) = 'reise'
      and (erg ->> 'kanonen')::int = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Start legt Lauf an, vor der Reise keine Kanonen' || E'\n';

    /* T3: Gemeinsame Huelle = 100 - 9 x Durchschnitt; sie sinkt nur.
       now() steht im Test still - die zweite Meldung von p1 kommt also
       "in derselben Sekunde": Treffer duerfen da nicht steigen (5 bleibt 5). */
    update public.reise_laeufe set gestartet_am = now() - interval '100 seconds' where story_id = sid;
    erg := app.reise_melden(sid, 2, 5, 'Sternfalke', '#ff9d3d');
    ok := (erg ->> 'huelle')::numeric = 82;
    perform set_config('request.jwt.claims', '{"sub":"' || p2 || '","role":"authenticated"}', true);
    erg := app.reise_melden(sid, 4, 3, 'Bordkatze', '#a6ff6e');
    ok := ok and (erg ->> 'huelle')::numeric = 73;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := app.reise_melden(sid, 1, 6, 'Sternfalke', '#ff9d3d');
    ok := ok and (erg ->> 'huelle')::numeric = 73
      and (select schaden from public.reise_kanonen where story_id = sid and firebase_uid = p1) = 2
      and erg -> 'crew' -> 0 ->> 'name' = 'Sternfalke' and (erg -> 'crew' -> 0 ->> 'ich')::boolean = true
      and (erg ->> 'treffer_gesamt')::int = 8 and (erg ->> 'kanonen')::int = 2;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 gemeinsame Huelle, Schaden steigt nur, Crew-Liste' || E'\n';

    /* T4: Grenzen - Schaden hoechstens 25, Treffer hoechstens 8 je
       Sekunde, falsche Farbe und Steuerzeichen im Namen fallen weg. */
    perform set_config('request.jwt.claims', '{"sub":"' || p3 || '","role":"authenticated"}', true);
    erg := app.reise_melden(sid, 999, 99999, E'Bo\u0007se', 'red');
    select * into k from public.reise_kanonen where story_id = sid and firebase_uid = p3;
    ok := k.schaden = 25 and k.treffer = (8 * 21.5)::int and k.farbe = '#b5abfc' and k.name is null
      and exists (select 1 from jsonb_array_elements(erg -> 'crew') c where c ->> 'name' = 'Spaetling');
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Grenzen fuer Schaden, Treffer, Farbe und Name' || E'\n';

    /* T5: Huelle 0 - die Arche ist sofort fuer alle verloren. */
    update public.reise_kanonen set schaden = 25 where story_id = sid;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := app.reise_melden(sid, 25, 7, 'Sternfalke', '#ff9d3d');
    select * into le from public.live_event where id = 1;
    ok := (erg ->> 'huelle')::numeric = 0 and erg ->> 'ergebnis' = 'verloren'
      and le.reise_welt = 'verwahrung' and le.reise_lauf = sid
      and le.reise_welt_ab between now() + interval '6 seconds' and now() + interval '8 seconds';
    update public.reise_kanonen set gemeldet_at = now() - interval '5 seconds' where story_id = sid;
    erg := app.reise_melden(sid, 25, 50, 'Sternfalke', '#ff9d3d');
    ok := ok and (select treffer from public.reise_kanonen where story_id = sid and firebase_uid = p1) = 5;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Huelle 0: verloren, Verwahrung fuer alle' || E'\n';

    /* T6: Landung - erst nach 378,5 s, dann Terra Nova. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    sid := app.admin_live_story('reise');
    perform set_config('request.jwt.claims', '{"sub":"' || p2 || '","role":"authenticated"}', true);
    update public.reise_laeufe set gestartet_am = now() - interval '200 seconds' where story_id = sid;
    erg := app.reise_abschluss(sid);
    ok := erg ->> 'ergebnis' is null;
    update public.reise_laeufe set gestartet_am = now() - interval '380 seconds' where story_id = sid;
    erg := app.reise_abschluss(sid);
    select * into le from public.live_event where id = 1;
    ok := ok and erg ->> 'ergebnis' = 'gelandet' and le.reise_welt = 'terra' and le.reise_lauf = sid
      and le.reise_welt_ab between now() + interval '21 seconds' and now() + interval '23 seconds';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Landung erst am Ende, dann Terra Nova' || E'\n';

    /* T7: Admin schaltet die Seite um; andere duerfen das nicht. */
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    perform app.admin_reise_welt(null);
    ok := (select reise_welt is null and reise_welt_ab is null from public.live_event where id = 1);
    perform app.admin_reise_welt('verwahrung');
    ok := ok and (select reise_welt = 'verwahrung' and reise_welt_ab = now() and reise_lauf is null from public.live_event where id = 1);
    begin perform app.admin_reise_welt('mars'); ok := false; exception when others then ok := ok and sqlerrm = 'unbekannte-welt'; end;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    begin perform app.admin_reise_welt(null); ok := false; exception when others then ok := ok and sqlerrm = 'nur-admin'; end;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Admin schaltet Terra Nova/Verwahrung' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T8: Rechte. */
  ok := has_function_privilege('anon', 'public.reise_melden(text, numeric, integer, text, text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.reise_melden(text, numeric, integer, text, text)', 'execute') = true
    and has_function_privilege('authenticated', 'public.reise_stand(text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.reise_ergebnis_setzen(text, text)', 'execute') = false
    and has_table_privilege('authenticated', 'public.reise_kanonen', 'select') = false
    and has_table_privilege('authenticated', 'public.reise_laeufe', 'update') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
