/* ======================================================
   PRUEFUNG ZU 57-schlacht-parteien.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 57 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigaben, Testspieler,
   Probe-Schlachten) steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck. Eine laufende echte
   Schlacht wird dafuer nur innerhalb dieses Blocks beendet.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt. Der Admin kaempft im Test auch selbst mit. Jede
   Schlacht spielt ohne Ort (neutral, alle Faktoren 1).
   Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '57aa0000-0000-0000-0000-0000000000ff';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  s       public.sternenschlacht;
  e       public.sternenschlacht_einheiten;
  w       record;
  grund   text;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'schlachtParteien' - 'schlachtOrte') where id = 'main';
    insert into public.players (firebase_uid, nickname, seite) values (ad, 'ParteiAdmin', 'menschen');
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);

    /* T1: ohne Freigabe wie bisher - Menschen gegen Aliens, feste Seite,
       keine Wahl; andere Parteien abgelehnt. */
    begin
      perform app.admin_schlacht_starten(10, null, 'piraten', 'aliens');
      ok := false;
    exception when others then ok := sqlerrm = 'parteien-gesperrt';
    end;
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_partei_waehlen('menschen', 'jaeger');
    ok := ok and s.partei_links = 'menschen' and s.partei_rechts = 'aliens' and s.mit_wahl = false
      and s.aufgestellt = true and e.partei = 'menschen' and e.typ = 'jaeger'
      and erg ->> 'grund' = 'keine-wahl'
      and (app.schlacht_stand(sid) ->> 'phase') = 'kampf';
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe: Menschen gegen Aliens wie bisher' || E'\n';

    /* T2: Kampfwerte aus den Tabellen - alte Typen wie in 49, neue nach
       Parteifaktor (Sonde fliegt doppelt). */
    select * into w from app.schlacht_werte('kreuzer', 'menschen', 2, 0, 0);
    ok := w.leben = 350 and w.schaden = 6.0;
    select * into w from app.schlacht_werte('drohne', 'aliens', 0, 0, 0);
    ok := ok and w.leben = 80 and w.schaden = 23.4;
    select * into w from app.schlacht_werte('sonde', 'maschinen', 0, 0, 2);
    ok := ok and w.leben = 108 and w.schaden = 19.0 and w.spezial = 1.5;
    select * into w from app.schlacht_werte('totenschiff', 'geister', 1, 1, 0);
    ok := ok and w.leben = round(180 * 1.2 * 0.85) and w.schaden = round(9 * 1.2 * 1.25 * 10) / 10.0;
    ok := ok and (select count(*) from public.schlacht_typen where partei <> 'boss') >= 24   -- 59: + Mutterschiff, 63: + 6
      and (select count(*) from public.schlacht_typen group by partei order by 1 desc limit 1) >= 4
      and app.partei_grundtyp('kristall') = 'splitter';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Kampfwerte aus schlacht_typen' || E'\n';

    /* T3: mit Freigabe - Start mit zwei Parteien, Pruefungen, Aliens
       rutschen nach rechts, Sammelphase. */
    update public.site_config set data = jsonb_set(data, '{featureFlags,schlachtParteien}', 'true'::jsonb) where id = 'main';
    begin
      perform app.admin_schlacht_starten(10, null, 'kristall', 'kristall');
      ok := false;
    exception when others then ok := sqlerrm = 'parteien-gleich';
    end;
    begin
      perform app.admin_schlacht_starten(10, null, 'mars', 'aliens');
      ok := false;
    exception when others then ok := ok and sqlerrm = 'partei-unbekannt';
    end;
    sid := app.admin_schlacht_starten(10, null, 'aliens', 'piraten', 30);
    update public.sternenschlacht set ort = null where id = sid;
    select * into s from public.sternenschlacht where id = sid;
    erg := app.schlacht_stand(sid);
    ok := ok and s.partei_links = 'piraten' and s.partei_rechts = 'aliens' and s.mit_wahl = true
      and s.aufgestellt = false and abs(extract(epoch from (s.beginn_at - now())) - 30) < 2
      and erg ->> 'phase' = 'sammeln' and erg ->> 'partei_links' = 'piraten'
      and (select count(*) from public.sternenschlacht_einheiten where schlacht_id = sid) = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Start mit zwei Parteien und Sammelphase' || E'\n';

    /* T4: Wahl - nur die beiden Parteien, nur ihre Typen; danach wartet
       der Spieler auf den Start. */
    ok := app.schlacht_partei_waehlen('menschen', 'jaeger') ->> 'grund' = 'falsche-partei'
      and app.schlacht_partei_waehlen('piraten', 'drohne') ->> 'grund' = 'falscher-typ';
    erg := app.schlacht_partei_waehlen('piraten', 'galeone');
    select ich.grund into grund from app.schlacht_ich(ad) ich;
    ok := ok and (erg ->> 'ok')::boolean = true and erg ->> 'ab' = 'start' and grund = 'sammeln'
      and app.schlacht_spezial() ->> 'grund' = 'sammeln'
      and (app.schlacht_stand(sid) -> 'wahl' ->> 'links')::int = 1
      and app.schlacht_stand(sid) -> 'meine_wahl' ->> 'typ' = 'galeone';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Wahl von Partei und Schiffstyp' || E'\n';

    /* T5: Ende der Sammelphase - aufgestellt beim naechsten Stand-Abruf,
       Piraten links, Uebungsflotte der Aliens rechts; ohne Menschen
       weder Formation noch Regeneration. */
    update public.sternenschlacht set beginn_at = now() - interval '1 second', runde_at = now() - interval '1 second' where id = sid;
    erg := app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    ok := erg ->> 'phase' = 'kampf' and s.aufgestellt = true
      and e.seite = 'menschen' and e.partei = 'piraten' and e.typ = 'galeone'
      and e.leben = round(190 * 1.00) and e.schaden = round(8 * 1.10 * 10) / 10.0
      and s.formation_menschen = 1
      and not exists (select 1 from public.sternenschlacht_einheiten
                       where schlacht_id = sid and seite = 'aliens' and (partei <> 'aliens' or typ <> 'drohne'))
      and exists (select 1 from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = 'ki-aliens-1');
    /* Regeneration: ohne Dauerfeuer bleibt das Leben gleich. */
    update public.sternenschlacht set skala = 0, runde_at = now() - interval '100 seconds' where id = sid;
    ok := ok and app.schlacht_leben(sid, 'menschen', now()) = s.leben0_menschen;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Aufstellen nach der Sammelphase' || E'\n';

    /* T6: Spezial aus der Tabelle - Piraten laden 45 s, die Galeone
       feuert eine Breitseite mit 480 Schaden. */
    update public.sternenschlacht set runde_at = now() - interval '40 seconds' where id = sid;
    update public.sternenschlacht_einheiten set spezial_at = null where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_spezial();
    ok := erg ->> 'grund' = 'laedt';
    update public.sternenschlacht set runde_at = now() - interval '46 seconds' where id = sid;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'wirkung' = 'schaden' and (erg ->> 'wert')::numeric = 480;
    /* Der Kristall-Resonator verlangsamt den Gegner: Faktor 1,3 auf dessen Seite. */
    update public.sternenschlacht_einheiten set spezial_at = null, typ = 'resonator', partei = 'kristall'
     where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'wirkung' = 'fenster' and (erg ->> 'faktor')::numeric = 1.3 and (erg ->> 'sekunden')::int = 25
      and exists (select 1 from public.sternenschlacht_aktionen
                   where schlacht_id = sid and typ = 'resonator' and betroffen = 'aliens');
    update public.sternenschlacht_einheiten set typ = 'galeone', partei = 'piraten' where schlacht_id = sid and firebase_uid = ad;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Spezial und Ladezeit nach Partei' || E'\n';

    /* T7: wer gekaempft hat, bleibt bei seiner Partei; den Typ darf er
       wechseln (ab der naechsten Runde). Wendig gilt fuer den Kaper. */
    ok := app.schlacht_partei_waehlen('aliens', 'drohne') ->> 'grund' = 'partei-fest';
    erg := app.schlacht_partei_waehlen('piraten', 'kaper');
    ok := ok and erg ->> 'ab' = 'naechste-runde'
      and (select typ from public.schlacht_wahl where schlacht_id = sid and firebase_uid = ad) = 'kaper'
      and (select wendig from public.schlacht_typen where typ = 'kaper') = true
      and (select wendig from public.schlacht_typen where typ = 'galeone') = false;
    /* Rundenwechsel stellt neu auf - dann fliegt der Kaper. */
    update public.sternenschlacht set runde_at = now() - interval '1 hour', skala = 1000 where id = sid;
    perform app.schlacht_stand(sid);
    ok := ok and (select typ from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad) = 'kaper'
      and (select runde from public.sternenschlacht where id = sid) = 2;
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Partei fest, Typ frei, neue Runde' || E'\n';

    /* T8: niemand hat gewaehlt - beide Seiten als Uebungsflotte. */
    sid := app.admin_schlacht_starten(10, null, 'geister', 'maschinen', 30);
    update public.sternenschlacht set ort = null, beginn_at = now() - interval '1 second' where id = sid;
    perform app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ok := s.aufgestellt = true and s.anzahl_menschen = 6 and s.anzahl_aliens = 6
      and (select count(*) from public.sternenschlacht_einheiten
            where schlacht_id = sid and seite = 'menschen' and partei = 'geister' and typ = 'irrlicht') = 6
      and (select count(*) from public.sternenschlacht_einheiten
            where schlacht_id = sid and seite = 'aliens' and partei = 'maschinen' and typ = 'sonde') = 6
      and app.schlacht_partei_waehlen('maschinen', 'fabrik') ->> 'ab' = 'naechste-runde';
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Uebungsflotte auf beiden Seiten' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T9: Rechte - Tabellen lesbar, nicht schreibbar; Wahl nur die eigene;
     Hilfen nur intern. */
  ok := has_table_privilege('anon', 'public.schlacht_typen', 'select') = true
    and has_table_privilege('authenticated', 'public.schlacht_typen', 'update') = false
    and has_table_privilege('authenticated', 'public.schlacht_parteien', 'insert') = false
    and has_table_privilege('anon', 'public.schlacht_wahl', 'select') = false
    and has_table_privilege('authenticated', 'public.schlacht_wahl', 'insert') = false
    and has_function_privilege('authenticated', 'app.schlacht_parteien_frei()', 'execute') = false
    and has_function_privilege('authenticated', 'app.schlacht_sammeln_beenden(bigint)', 'execute') = false
    and has_function_privilege('authenticated', 'app.partei_grundtyp(text)', 'execute') = false
    and has_function_privilege('anon', 'public.schlacht_partei_waehlen(text, text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.schlacht_partei_waehlen(text, text)', 'execute') = true
    and has_function_privilege('anon', 'public.admin_schlacht_starten(integer, text, text, text, integer)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T9 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
