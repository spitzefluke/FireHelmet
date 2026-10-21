/* ======================================================
   PRUEFUNG ZU 62-schlacht-front.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 62 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigaben, Regler,
   Epoche, Testspieler, Probe-Schlachten) steht in einem inneren Block,
   der mit einer Ausnahme endet - Postgres rollt ihn zurueck.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt; zwei Testspieler kaempfen fuer die Aliens.
   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '62aa0000-0000-0000-0000-0000000000ff';
  a1      constant text := '62aa0000-0000-0000-0000-0000000000a1';
  a2      constant text := '62aa0000-0000-0000-0000-0000000000a2';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  s       public.sternenschlacht;
  ev      text;
  w       record;
  abgelehnt boolean;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'schlachtFront' - 'schlachtBewegung' - 'hangarAusruestung'
             - 'schlachtParteien' - 'schlachtOrte' - 'schlachtBoss') where id = 'main';
    update public.schlacht_regler set takt_sek = 10, staerke = 1, durchbruch = 0.05, ausgleich = true where id = 1;
    insert into public.players (firebase_uid, nickname, seite) values
      (ad, 'FrontAdmin', 'menschen'), (a1, 'Alien1', 'aliens'), (a2, 'Alien2', 'aliens');
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);

    /* T1: ohne Freigabe keine Front; mit Freigabe uebernimmt der Start
       die Regler; im Boss-Modus nie. */
    sid := app.admin_schlacht_starten(10);
    ok := (select mit_front from public.sternenschlacht where id = sid) = false
      and app.schlacht_haltung('angriff') ->> 'grund' = 'keine-front'
      and (app.schlacht_stand(sid) ? 'front') = false;
    perform app.admin_schlacht_beenden();
    update public.site_config set data = jsonb_set(data, '{featureFlags,schlachtFront}', 'true'::jsonb) where id = 'main';
    update public.schlacht_regler set takt_sek = 15, staerke = 2 where id = 1;
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.mit_front = true and s.front_takt_sek = 15 and s.front_staerke = 2 and s.front_wert = 0;
    perform app.admin_schlacht_beenden();
    update public.schlacht_regler set takt_sek = 10, staerke = 1 where id = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Freigabe und Regler beim Start' || E'\n';

    /* T2: Ausgleich - 1 gegen 2: links x 2^0,8 = 1,74 auf Leben und Schaden. */
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    select * into w from app.schlacht_werte('jaeger', 'menschen', 0, 0, 0);
    ok := s.ausgleich_links = 1.74 and s.ausgleich_rechts = 1
      and (select leben from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad) = round(w.leben * 1.74)
      and (app.schlacht_stand(sid) -> 'front' ->> 'ausgleich_links')::numeric = 1.74;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Ausgleich fuer die kleinere Seite' || E'\n';

    /* T3: Haltung waehlen - gueltig, gedrosselt. */
    erg := app.schlacht_haltung('angriff');
    ok := (erg ->> 'ok')::boolean = true
      and app.schlacht_haltung('verteidigung') ->> 'grund' = 'zu-schnell'
      and app.schlacht_haltung('rueckzug') ->> 'grund' = 'falsche-haltung'
      and (select haltung from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad) = 'angriff';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Haltung waehlen' || E'\n';

    /* T4: Durchbruch - die Menschen draengen hart, die Front steht schon
       an der Linie: ein Takt reicht. 5 % Leben fuer die Aliens, Front
       zurueck auf 0, Kampfpunkte (2 fuer den Gewinner des Takts). */
    update public.sternenschlacht_einheiten set schaden = 100, kp = 0 where schlacht_id = sid and firebase_uid = ad;
    update public.sternenschlacht_einheiten set schaden = 1, haltung = 'angriff', kp = 0 where schlacht_id = sid and firebase_uid in (a1, a2);
    update public.sternenschlacht set ausgleich_links = 1, front_wert = 100, front_takt = 0,
           runde_at = now() - interval '10.5 seconds' where id = sid;
    delete from public.sternenschlacht_aktionen where schlacht_id = sid;
    erg := app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ok := s.front_takt = 1 and s.front_wert = 0 and erg -> 'front' ->> 'ereignis' = app.front_ereignis(sid, s.runde, 1)
      and exists (select 1 from public.sternenschlacht_aktionen where schlacht_id = sid and art = 'front' and typ = 'durchbruch'
                    and betroffen = 'aliens' and wert = round(0.05 * s.leben0_aliens, 1))
      and (select kp from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad) = 2
      and (select kp from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = a1) = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Takt und Durchbruch' || E'\n';

    /* T5: Druck je Takt - die Front wandert Richtung Aliens (ausser bei
       Feuerpause), die zurueckgedraengte Seite verliert Leben; die
       Takte werden nachgerechnet, nicht doppelt. */
    update public.sternenschlacht set front_wert = 40, front_takt = 1, runde_at = now() - interval '20.5 seconds' where id = sid;
    delete from public.sternenschlacht_aktionen where schlacht_id = sid;
    perform app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    ev := app.front_ereignis(sid, s.runde, 2);
    ok := s.front_takt = 2
      and case when ev = 'feuerpause' then s.front_wert = 40 else s.front_wert > 40 end
      and exists (select 1 from public.sternenschlacht_aktionen where schlacht_id = sid and typ = 'druck' and betroffen = 'aliens'
                    and wert = round(s.front_wert / 100 * 0.01 * s.leben0_aliens, 1));
    perform app.schlacht_stand(sid);
    ok := ok and (select count(*) from public.sternenschlacht_aktionen where schlacht_id = sid and typ = 'druck') = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Druck je Takt, kein Takt doppelt' || E'\n';

    /* T6: Verbessern mit Kampfpunkten - Vorstoss 2 und 4 KP, dann zu
       wenig; Reparatur 3 KP heilt 1,5 %, dann 30 s Ladezeit. */
    update public.sternenschlacht_einheiten set kp = 9, vorstoss = 0 where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_front_verbessern('vorstoss');
    ok := (erg -> 'meine' ->> 'kp')::int = 7 and (erg -> 'meine' ->> 'vorstoss')::int = 1;
    erg := app.schlacht_front_verbessern('vorstoss');
    ok := ok and (erg -> 'meine' ->> 'kp')::int = 3 and (erg -> 'meine' ->> 'vorstoss')::int = 2
      and app.schlacht_front_verbessern('vorstoss') ->> 'grund' = 'zu-wenig-kp';
    erg := app.schlacht_front_verbessern('reparatur');
    ok := ok and (erg -> 'meine' ->> 'kp')::int = 0 and (erg ->> 'wert')::numeric = round(0.015 * s.leben0_menschen, 1)
      and exists (select 1 from public.sternenschlacht_aktionen where schlacht_id = sid and typ = 'reparatur' and wirkung = 'heilung');
    update public.sternenschlacht_einheiten set kp = 9 where schlacht_id = sid and firebase_uid = ad;
    ok := ok and app.schlacht_front_verbessern('reparatur') ->> 'grund' = 'laedt';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Verbessern mit Kampfpunkten' || E'\n';

    /* T7: Admin-Regler - gelten sofort fuer die laufende Schlacht, ohne
       Takte rueckwirkend nachzuholen; Unsinn wird abgelehnt. */
    update public.sternenschlacht set runde_at = now() - interval '40 seconds' where id = sid;
    erg := app.admin_front_einstellen(20, 1.5, 0.08, false);
    select * into s from public.sternenschlacht where id = sid;
    ok := (erg ->> 'takt_sek')::int = 20 and s.front_takt_sek = 20 and s.front_staerke = 1.5 and s.front_durchbruch = 0.08
      and s.mit_ausgleich = false and s.front_takt = 2;
    abgelehnt := false;
    begin
      perform app.admin_front_einstellen(2, 1, 0.05, true);
    exception when others then abgelehnt := sqlerrm = 'regler-ungueltig';
    end;
    ok := ok and abgelehnt;
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Admin-Regler' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T8: Rechte. */
  ok := has_function_privilege('authenticated', 'app.schlacht_front_takt(bigint)', 'execute') = false
    and has_function_privilege('anon', 'public.schlacht_haltung(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.schlacht_haltung(text)', 'execute') = true
    and has_function_privilege('anon', 'public.admin_front_einstellen(integer, numeric, numeric, boolean)', 'execute') = false
    and has_table_privilege('authenticated', 'public.schlacht_regler', 'update') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
