/* ======================================================
   PRUEFUNG ZU 49-sternenschlacht.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 49 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Epoche, Testspieler,
   die Probe-Schlacht) steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck, Realtime sieht
   nichts davon. Eine laufende echte Schlacht wird dafuer nur
   innerhalb dieses Blocks beendet.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt (aus der Funktionsdefinition gelesen).
   Erwartet: acht Zeilen, alle "PASS".

   NACH MIGRATION 50 (endlose Schlacht in Runden, Typwechsel frei)
   schlagen T4 bis T7 hier absichtlich fehl - sie pruefen das alte
   Verhalten von 49. Dann gilt 50-endlose-schlacht.test.sql.
====================================================== */
do $$
declare
  m1      constant text := '49aa0000-0000-0000-0000-0000000000a1';
  m2      constant text := '49aa0000-0000-0000-0000-0000000000a2';
  a1      constant text := '49aa0000-0000-0000-0000-0000000000b1';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  e       public.sternenschlacht_einheiten;
  s       public.sternenschlacht;
  l       numeric;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.live_event set jahr_1720_ab = null, jahr_2100_ab = now() - interval '1 minute' where id = 1;
    insert into public.players (firebase_uid, nickname, seite) values
      (m1, 'SchlachtM1', 'menschen'), (m2, 'SchlachtM2', 'menschen'), (a1, 'SchlachtA1', 'aliens');
    insert into public.hangar_einheiten (firebase_uid, typ, stufe_leben) values (m1, 'kreuzer', 2);

    /* T1: nur der Admin startet; Schnappschuss mit den Werten aus dem Hangar. */
    perform set_config('request.jwt.claims', '{"sub":"' || m1 || '","role":"authenticated"}', true);
    ok := false;
    begin perform app.admin_schlacht_starten(10); exception when others then ok := sqlerrm like '%nur-admin%'; end;
    perform set_config('request.jwt.claims',
      '{"sub":"49aa0000-0000-0000-0000-0000000000ff","role":"authenticated","email":"' || admin || '"}', true);
    sid := app.admin_schlacht_starten(10);
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = m1;
    ok := ok and e.typ = 'kreuzer' and e.leben = 350 and e.schaden = 6.0;
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = a1;
    ok := ok and e.typ = 'drohne' and e.leben = 80 and e.schaden = 23.4;
    select * into s from public.sternenschlacht where id = sid;
    ok := ok and s.status = 'laeuft' and s.skala > 0 and s.formation_menschen > 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Start nur Admin, Schnappschuss aus dem Hangar' || E'\n';

    /* T2: nur eine Schlacht zugleich. */
    ok := false;
    begin perform app.admin_schlacht_starten(10); exception when others then ok := sqlerrm like '%schlacht-laeuft%'; end;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 nur eine laufende Schlacht' || E'\n';

    /* T3: Ziel - Schaden x10, Taktung 5 s, kein Ziel auf der eigenen Seite. */
    perform set_config('request.jwt.claims', '{"sub":"' || m1 || '","role":"authenticated"}', true);
    erg := app.schlacht_ziel(a1);
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'wert')::numeric = 60;
    erg := app.schlacht_ziel(a1);
    ok := ok and erg ->> 'grund' = 'zu-schnell';
    perform set_config('request.jwt.claims', '{"sub":"' || m2 || '","role":"authenticated"}', true);
    erg := app.schlacht_ziel(m1);
    ok := ok and erg ->> 'grund' = 'falsches-ziel';
    erg := app.schlacht_ziel(a1);   -- Fokus: m1 hat in den letzten 5 s dasselbe Ziel
    ok := ok and (erg ->> 'fokus')::int = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Ziel: Schaden, Taktung, Fokus, eigene Seite tabu' || E'\n';

    /* T4: Typwechsel im Hangar waehrend der Schlacht gesperrt. */
    perform set_config('request.jwt.claims', '{"sub":"' || m1 || '","role":"authenticated"}', true);
    erg := app.hangar_typ_waehlen('jaeger');
    ok := erg ->> 'grund' = 'schlacht';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 kein Typwechsel in der Schlacht' || E'\n';

    /* T5: Spezial - Menschen erst nach 60 s, nur einmal; Schildwall
       halbiert den Sofortschaden der Aliens. */
    erg := app.schlacht_spezial();
    ok := erg ->> 'grund' = 'laedt';
    update public.sternenschlacht set start_at = now() - interval '2 minutes', ende_at = now() + interval '8 minutes' where id = sid;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'wirkung' = 'fenster' and (erg ->> 'faktor')::numeric = 0.5;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'grund' = 'schon';
    perform set_config('request.jwt.claims', '{"sub":"' || a1 || '","role":"authenticated"}', true);
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'wirkung' = 'schaden' and (erg ->> 'wert')::numeric = 125;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Spezial: Wartezeit, einmal, Schildwall halbiert' || E'\n';

    /* T6: Stand - beim Start volles Leben, jetzt weniger; Banner 0..100. */
    select * into s from public.sternenschlacht where id = sid;
    ok := app.schlacht_leben(sid, 'aliens', s.start_at) = s.leben0_aliens;
    l := app.schlacht_leben(sid, 'aliens', now());
    ok := ok and l < s.leben0_aliens;
    erg := app.schlacht_stand(sid);
    /* Hat eine Seite kein Leben mehr, endet die Schlacht hier schon
       (so gewollt) - mit wenigen Aliens in der Datenbank kann das
       passieren. */
    ok := ok and (erg ->> 'status' = 'laeuft'
                  or (erg ->> 'status' = 'vorbei' and (erg -> 'aliens' ->> 'leben')::numeric = 0))
      and (erg ->> 'prozent_menschen')::numeric between 0 and 100;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Stand: Leben sinkt, Banner zwischen 0 und 100' || E'\n';

    /* T7: Beenden - Sieger, Endstand, Ruhm mit den Schadenssummen. */
    perform set_config('request.jwt.claims',
      '{"sub":"49aa0000-0000-0000-0000-0000000000ff","role":"authenticated","email":"' || admin || '"}', true);
    perform app.admin_schlacht_beenden();
    select * into s from public.sternenschlacht where id = sid;
    ok := s.status = 'vorbei' and s.sieger is not null and s.endstand_menschen between 0 and 100
      and s.ruhm -> 'menschen' @> '[{"nickname": "SchlachtM1", "schaden": 60}]'::jsonb
      and s.ruhm -> 'aliens' @> '[{"nickname": "SchlachtA1", "schaden": 125}]'::jsonb;
    perform set_config('request.jwt.claims', '{"sub":"' || m1 || '","role":"authenticated"}', true);
    erg := app.schlacht_ziel(a1);
    ok := ok and erg ->> 'grund' = 'keine-schlacht';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Ende: Sieger, Endstand, Ruhm; danach keine Aktionen' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T8: Rechte - lesen alle, handeln nur angemeldet, rechnen nur intern. */
  ok := has_table_privilege('anon', 'public.sternenschlacht', 'select') = true
    and has_table_privilege('authenticated', 'public.sternenschlacht_aktionen', 'insert') = false
    and has_function_privilege('anon', 'public.schlacht_stand(bigint)', 'execute') = true
    and has_function_privilege('anon', 'public.schlacht_ziel(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.schlacht_ziel(text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.schlacht_abschliessen(bigint)', 'execute') = false
    and has_function_privilege('anon', 'public.admin_schlacht_starten(integer)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
