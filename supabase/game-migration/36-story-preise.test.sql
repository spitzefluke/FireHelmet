/* ======================================================
   PRUEFUNG ZU 36-story-preise.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 36 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Alles, was schreibt, steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn dann zurueck. Es bleibt also
   nichts liegen: keine Testspieler, keine geaenderten Preise, kein
   geaendertes live_event (jede Aenderung dort ginge per Realtime an
   alle Besucher).
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '36aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  r       jsonb;
  j       jsonb;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Startwerte = die bisherigen festen Werte, und live_event
     traegt sie mit Titeltext. */
  j := (select story_preise from public.live_event where id = 1);
  ok := (select count(*) from public.live_story_preise) = 11
        and (j->'sturm'->>'dublonen')::int = 150
        and (j->'flut'->>'dublonen')::int = 150
        and (j->'hacked'->>'skillpunkte')::int = 1
        and j->'hacked'->'titel'->>'text' = 'Firewall-Pirat'
        and (j->'hintertueren'->>'skillpunkte')::int = 1
        and (j->'schatz'->>'dublonen')::int = 10 and (j->'schatz'->>'deckel')::int = 60
        and (j->'schatz'->>'extra_ab')::int = 25 and (j->'schatz'->>'skillpunkte')::int = 1
        and (j->'werbung'->>'dublonen')::int = 25 and (j->'werbung'->>'deckel')::int = 6
        and (j->'disco'->>'dublonen')::int = 0 and j->'disco'->'titel' = 'null'::jsonb;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Startwerte wie bisher, Kopie in live_event' || E'\n';

  /* T2: Grenzen der Tabelle. Jeder Versuch in eigenem Block. */
  ok := true;
  begin update public.live_story_preise set deckel = 7 where schluessel = 'werbung'; ok := false;
  exception when check_violation then null; end;
  begin update public.live_story_preise set deckel = 5 where schluessel = 'sturm'; ok := false;
  exception when check_violation then null; end;
  begin update public.live_story_preise set dublonen = 30001 where schluessel = 'disco'; ok := false;
  exception when check_violation then null; end;
  begin update public.live_story_preise set dublonen = 1000 where schluessel = 'schatz'; ok := false;   -- 1000 x 60 > 30000
  exception when check_violation then null; end;
  begin update public.live_story_preise set skillpunkte = 11 where schluessel = 'riss'; ok := false;
  exception when check_violation then null; end;
  begin update public.live_story_preise set deckel = null where schluessel = 'schatz'; ok := false;
  exception when check_violation then null; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Deckel, Hoechstwerte und Stueck-Felder geprueft' || E'\n';

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T3: Auszahlung nach den Preisen - Schatz je Stueck mit Deckel
     und Extra ab 25, Wetter pauschal, Hacked mit Titel. */
  ok := false;
  begin
    insert into public.live_storys (story_id, story, gestartet_am) values
      ('36test-schatz', 'schatz', now() - interval '60 seconds'),
      ('36test-schatz2', 'schatz', now() - interval '60 seconds'),
      ('36test-sturm', 'sturm', now() - interval '60 seconds'),
      ('36test-hack', 'hacked', now() - interval '60 seconds');
    r := app.live_story_belohnung('36test-schatz', 'schatz', 100);
    ok := (r->>'ok')::boolean = true and (r->>'dublonen')::int = 600 and (r->>'skillpunkte')::int = 1;
    r := app.live_story_belohnung('36test-schatz2', 'schatz', 24);
    ok := ok and (r->>'dublonen')::int = 240 and (r->>'skillpunkte')::int = 0;
    r := app.live_story_belohnung('36test-sturm', 'wetter', 0);
    ok := ok and (r->>'dublonen')::int = 150;
    r := app.live_story_belohnung('36test-hack', 'hacked', 0);
    ok := ok and (r->>'skillpunkte')::int = 1 and r->>'titel' = 'Firewall-Pirat'
             and exists (select 1 from public.spieler_event_titel where firebase_uid = uid and titel_id = 'firewall-pirat');
    ok := ok and (app.live_story_belohnung('36test-sturm', 'wetter', 0)->>'grund') = 'schon';
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 Auszahlung nach den eingestellten Preisen' || E'\n';

  /* T4: Disco, Riss, Systemausfall - erst "keine", nach dem
     Einstellen zahlen sie am Ende; nicht vor der Zeit. */
  ok := false;
  begin
    insert into public.live_storys (story_id, story, gestartet_am) values
      ('36test-disco', 'disco', now() - interval '60 seconds'),
      ('36test-riss', 'riss', now() - interval '60 seconds'),
      ('36test-ende', 'ende', now() - interval '60 seconds');
    ok := (app.live_story_belohnung('36test-disco', 'abschluss', 0)->>'grund') = 'keine';
    update public.live_story_preise set dublonen = 77, skillpunkte = 2 where schluessel in ('disco', 'riss', 'ende');
    r := app.live_story_belohnung('36test-disco', 'abschluss', 0);
    ok := ok and (r->>'dublonen')::int = 77 and (r->>'skillpunkte')::int = 2;
    ok := ok and (app.live_story_belohnung('36test-riss', 'abschluss', 0)->>'grund') = 'zu-frueh'   -- 290 s
             and (app.live_story_belohnung('36test-ende', 'abschluss', 0)->>'dublonen')::int = 77
             and (app.live_story_belohnung('36test-ende', 'wetter', 0)->>'grund') = 'falsche-art';
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Disco/Riss/Systemausfall zahlen erst, wenn eingestellt' || E'\n';

  /* T5: ein Nicht-Admin setzt keine Preise. */
  ok := false;
  begin
    perform app.admin_story_preis('sturm', 99999, 0, null, null, null, null);
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  ok := ok and (select dublonen from public.live_story_preise where schluessel = 'sturm') = 150;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 Nicht-Admin kann keine Belohnung setzen' || E'\n';

  /* T6: Rechte - anon ruft nichts auf, liest die Tabelle nicht. */
  perform set_config('request.jwt.claims', '', true);
  ok := has_function_privilege('anon', 'public.admin_story_preis(text, integer, integer, integer, integer, text, text)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_story_preis(text, integer, integer, integer, integer, text, text)', 'execute') = true
        and has_function_privilege('authenticated', 'app.story_preise_auffrischen()', 'execute') = false
        and has_table_privilege('anon', 'public.live_story_preise', 'select') = false
        and has_table_privilege('authenticated', 'public.live_story_preise', 'update') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 Rechte: nur der Admin aendert Preise' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
