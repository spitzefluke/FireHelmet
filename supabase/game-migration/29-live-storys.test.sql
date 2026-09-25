/* ======================================================
   PRUEFUNG ZU 29-live-storys.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 29 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   WICHTIG: Der Admin startet hier KEINE Story ueber
   admin_live_story() - das wuerde live_event aendern und die Story
   bei allen Besuchern abspielen. Die Starts werden direkt in
   live_storys angelegt; admin_live_story() wird nur als
   Nicht-Admin geprueft (muss abgewiesen werden).

   Alle Testzeilen (story_id beginnt mit "29test") werden am Ende
   wieder geloescht. Erwartet: zehn Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '29aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  r       jsonb;
  r2      jsonb;
  geld    integer;
  bonus   integer;
  zeile   record;
begin
  perform set_config('role', 'postgres', true);
  delete from public.live_storys where story_id like '29test%';
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.player_progression where firebase_uid = uid;
  delete from public.players where firebase_uid = uid;
  insert into public.players (firebase_uid, nickname, currency) values (uid, 'Testpirat29', 100);

  insert into public.live_storys (story_id, story, gestartet_am) values
    ('29test-sturm',  'sturm',  now() - interval '20 seconds'),
    ('29test-schatz', 'schatz', now()),
    ('29test-hacked', 'hacked', now() - interval '26 seconds'),
    ('29test-alt',    'flut',   now() - interval '3 hours');

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T1: ein Nicht-Admin kann keine Story starten oder beenden. */
  ok := true;
  begin
    perform app.admin_live_story('sturm');
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_live_story_beenden();
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Nicht-Admin kann keine Story starten oder beenden' || E'\n';

  /* T2: Wetter-Story gibt 150 Dublonen - genau einmal. */
  r  := app.live_story_belohnung('29test-sturm', 'wetter');
  r2 := app.live_story_belohnung('29test-sturm', 'wetter');
  select currency into geld from public.players where firebase_uid = uid;
  ausgabe := ausgabe || case when (r->>'dublonen')::int = 150 and r2->>'grund' = 'schon' and geld = 250 then 'PASS' else 'FAIL' end
          || '  T2 Sturm: +150 Dublonen, zweites Abholen "schon" (Stand: ' || geld || ')' || E'\n';

  /* T3: falsche Art zur Story gibt nichts. */
  r := app.live_story_belohnung('29test-sturm', 'hacked');
  ausgabe := ausgabe || case when r->>'grund' = 'falsche-art' then 'PASS' else 'FAIL' end
          || '  T3 Hacked-Belohnung auf eine Sturm-Story: "falsche-art"' || E'\n';

  /* T4: Schatzregen direkt nach dem Start: zu frueh. */
  r := app.live_story_belohnung('29test-schatz', 'schatz', 30);
  ausgabe := ausgabe || case when r->>'grund' = 'zu-frueh' then 'PASS' else 'FAIL' end
          || '  T4 Schatzregen sofort abholen: "zu-frueh"' || E'\n';

  /* T5: Schatzregen nach der Runde: Beute auf 60 gedeckelt = 600, ab 25 +1 Skillpunkt. */
  perform set_config('role', 'postgres', true);
  update public.live_storys set gestartet_am = now() - interval '25 seconds' where story_id = '29test-schatz';
  r := app.live_story_belohnung('29test-schatz', 'schatz', 999);
  select currency into geld from public.players where firebase_uid = uid;
  select coalesce(bonus_skill_points, 0) into bonus from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when (r->>'dublonen')::int = 600 and (r->>'skillpunkte')::int = 1 and geld = 850 and bonus = 1 then 'PASS' else 'FAIL' end
          || '  T5 Schatzregen 999 Beute: gedeckelt 600 Dublonen + 1 Skillpunkt (Stand: ' || geld || ', ' || bonus || ')' || E'\n';

  /* T6: Hacked: Titel Firewall-Pirat als neuester + 1 Skillpunkt. */
  r := app.live_story_belohnung('29test-hacked', 'hacked');
  select * into zeile from public.event_titel_je_spieler() where firebase_uid = uid;
  select coalesce(bonus_skill_points, 0) into bonus from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when r->>'titel' = 'Firewall-Pirat' and zeile.text = 'Firewall-Pirat' and zeile.stil = 'hacked' and bonus = 2 then 'PASS' else 'FAIL' end
          || '  T6 Hacked: Titel "Firewall-Pirat" (hacked) + 1 Skillpunkt' || E'\n';

  /* T7: Hintertueren erst ab 30 s, dann +1 Skillpunkt. */
  r := app.live_story_belohnung('29test-hacked', 'hintertueren');
  update public.live_storys set gestartet_am = now() - interval '5 minutes' where story_id = '29test-hacked';
  r2 := app.live_story_belohnung('29test-hacked', 'hintertueren');
  select coalesce(bonus_skill_points, 0) into bonus from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when r->>'grund' = 'zu-frueh' and (r2->>'skillpunkte')::int = 1 and bonus = 3 then 'PASS' else 'FAIL' end
          || '  T7 Hintertueren: erst "zu-frueh", nach 30 s +1 Skillpunkt' || E'\n';

  /* T8: alte oder unbekannte Starts geben nichts. */
  r  := app.live_story_belohnung('29test-alt', 'wetter');
  r2 := app.live_story_belohnung('29test-gibtsnicht', 'wetter');
  ausgabe := ausgabe || case when r->>'grund' = 'zu-spaet' and r2->>'grund' = 'unbekannt' then 'PASS' else 'FAIL' end
          || '  T8 Start aelter als 2 h: "zu-spaet", unbekannter Start: "unbekannt"' || E'\n';

  /* T9: niemand ausser den Funktionen kommt an die Tabellen oder die Belohnung. */
  ok := has_function_privilege('anon', 'public.live_story_belohnung(text,text,integer)', 'execute') = false
        and has_function_privilege('anon', 'public.admin_live_story(text)', 'execute') = false
        and has_table_privilege('authenticated', 'public.live_story_belohnungen', 'insert') = false
        and has_table_privilege('authenticated', 'public.live_storys', 'select') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T9 anon ohne Ausfuehrrecht, keine direkten Tabellenrechte' || E'\n';

  /* T10: Musik-Bucket oeffentlich, vier Admin-Policies. */
  select count(*) into geld from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'live_musik_admin_%';
  ok := geld = 4 and exists (select 1 from storage.buckets where id = 'live-musik' and public = true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T10 Bucket "live-musik" oeffentlich, vier Admin-Policies (' || geld || ')' || E'\n';

  /* Aufraeumen */
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.live_storys where story_id like '29test%';
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.player_progression where firebase_uid = uid;
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.live_storys where story_id like '29test%';
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.player_progression where firebase_uid = uid;
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
