/* ======================================================
   PRUEFUNG ZU 50-endlose-schlacht.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 50 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Epoche, Seiten,
   Testspieler, die Probe-Schlacht) steht in einem inneren Block, der
   mit einer Ausnahme endet - Postgres rollt ihn zurueck, Realtime
   sieht nichts davon. Eine laufende echte Schlacht und gewaehlte
   Seiten werden dafuer nur innerhalb dieses Blocks zurueckgesetzt.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt (aus der Funktionsdefinition gelesen).
   Erwartet: neun Zeilen, alle "PASS".
   NACH Migration 55 kann T6 fehlschlagen: Der Start lost dann einen
   Kampfort aus, und der aendert Dauerfeuer und Ereignisse (z. B.
   Schwarzes Loch 1,25-fach). Die Ort-Regeln prueft 55-schlacht-orte.test.sql.
====================================================== */
do $$
declare
  ad      constant text := '50aa0000-0000-0000-0000-0000000000ff';
  m1      constant text := '50aa0000-0000-0000-0000-0000000000a1';
  a1      constant text := '50aa0000-0000-0000-0000-0000000000b1';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  s       public.sternenschlacht;
  e       public.sternenschlacht_einheiten;
  n       integer;
  l       numeric;
  feuer   numeric;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    update public.live_event set jahr_1720_ab = now() - interval '1 hour', jahr_2100_ab = null where id = 1;
    insert into public.players (firebase_uid, nickname) values (ad, 'TestAdmin'), (m1, 'EndlosM1'), (a1, 'EndlosA1');

    /* T1: ausserhalb von 2100 waehlt nur der Admin eine Seite und
       richtet seinen Hangar ein. */
    perform set_config('request.jwt.claims', '{"sub":"' || m1 || '","role":"authenticated"}', true);
    erg := app.seite_waehlen('menschen');
    ok := erg ->> 'grund' = 'nicht-2100';
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    erg := app.seite_waehlen('menschen');
    ok := ok and (erg ->> 'ok')::boolean = true;
    erg := app.hangar_typ_waehlen('kreuzer');
    ok := ok and (erg ->> 'ok')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Admin testet Seitenwahl und Hangar ausserhalb von 2100' || E'\n';

    /* T2: Start endlos; die leere Seite bekommt die Uebungsflotte mit
       den Gesamtwerten der Gegenseite. */
    sid := app.admin_schlacht_starten(10);
    select * into s from public.sternenschlacht where id = sid;
    select count(*) into n from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid like 'ki-aliens-%';
    ok := s.endlos = true and s.ende_at is null and s.runde = 1 and s.runde_at is not null and s.tempo_sek = 600
      and n = 3 and s.anzahl_menschen = 1 and s.anzahl_aliens = 3
      and abs(s.leben0_aliens - s.leben0_menschen) <= 3 and abs(s.dps_aliens - s.dps_menschen) <= 0.3;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Start endlos, Uebungsflotte mit gleichen Werten' || E'\n';

    /* T3: Wer erst nach dem Aufstellen eine Seite hat, steigt in der
       naechsten Runde ein; der Typwechsel im Hangar bleibt frei. */
    update public.players set seite = 'aliens' where firebase_uid = a1;
    perform set_config('request.jwt.claims', '{"sub":"' || a1 || '","role":"authenticated"}', true);
    erg := app.schlacht_ziel(ad);
    ok := erg ->> 'grund' = 'naechste-runde';
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    erg := app.hangar_typ_waehlen('fregatte');
    ok := ok and (erg ->> 'ok')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Einstieg ab naechster Runde, Typwechsel frei' || E'\n';

    /* T4: Ziel auf die Uebungsflotte geht; Ruhm zaehlt. */
    erg := app.schlacht_ziel('ki-aliens-1');
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'wert')::numeric > 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Ziel auf die Uebungsflotte' || E'\n';

    /* T5: Runde: Aliens auf 0 -> Punkt fuer die Menschen, neue Runde,
       neu aufgestellt (a1 statt Uebungsflotte, Admin jetzt Fregatte).
       now() steht in einer Transaktion still - deshalb liegt Runde 1
       fuenf Minuten zurueck, der Schuss aus T4 zwei, der Treffer eine. */
    update public.sternenschlacht set start_at = now() - interval '5 minutes', runde_at = now() - interval '5 minutes' where id = sid;
    update public.sternenschlacht_aktionen set at = now() - interval '2 minutes' where schlacht_id = sid;
    insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, ziel_uid, wirkung, betroffen, wert, at)
         values (sid, ad, 'menschen', 'ziel', 'ki-aliens-2', 'schaden', 'aliens', 1000000, now() - interval '1 minute');
    erg := app.schlacht_stand(sid);
    select * into s from public.sternenschlacht where id = sid;
    select count(*) into n from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid like 'ki-%';
    select * into e from public.sternenschlacht_einheiten where schlacht_id = sid and firebase_uid = ad;
    ok := erg ->> 'status' = 'laeuft' and (erg ->> 'runde')::int = 2
      and (erg ->> 'punkte_menschen')::int = 1 and (erg ->> 'punkte_aliens')::int = 0
      and erg -> 'letzte_runde' ->> 'sieger' = 'menschen'
      and (erg -> 'aliens' ->> 'rest')::numeric = 1
      and n = 0 and s.anzahl_aliens = 1 and e.typ = 'fregatte' and e.schaden_gesamt > 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Rundenwechsel: Punkt, volle Flotten, neu aufgestellt' || E'\n';

    /* T6: Stand ohne Sekundenschleife: Ein Fenster 0,5 ueber 20 s
       zaehlt wie 10 s Dauerfeuer. */
    insert into public.sternenschlacht_aktionen (schlacht_id, firebase_uid, seite, art, typ, wirkung, betroffen, faktor, at, bis)
         values (sid, ad, 'menschen', 'spezial', 'fregatte', 'fenster', 'aliens', 0.5,
                 s.runde_at + interval '10 seconds', s.runde_at + interval '30 seconds');
    feuer := s.dps_menschen * s.skala * s.formation_menschen;
    l := app.schlacht_leben(sid, 'aliens', s.runde_at + interval '60 seconds');
    ok := abs(l - (app.schlacht_leben(sid, 'aliens', s.runde_at) - feuer * 50)) < 0.01;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Wirkfenster ohne Sekundenschleife genau' || E'\n';

    /* T7: Spezial einmal je Runde, Ladezeit ab Rundenbeginn. */
    erg := app.schlacht_spezial();
    ok := erg ->> 'grund' = 'laedt';
    update public.sternenschlacht set runde_at = now() - interval '2 minutes' where id = sid;
    erg := app.schlacht_spezial();
    ok := ok and (erg ->> 'ok')::boolean = true;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'grund' = 'schon';
    /* Neue Runde: Spezial vor Rundenbeginn zaehlt nicht mehr. */
    update public.sternenschlacht set runde_at = now() - interval '1 second' where id = sid;
    update public.sternenschlacht_einheiten set spezial_at = now() - interval '1 minute' where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'grund' = 'laedt';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Spezial einmal je Runde' || E'\n';

    /* T8: Beenden: Sieger nach Rundensiegen, Ruhm ohne Uebungsflotte. */
    perform app.admin_schlacht_beenden();
    select * into s from public.sternenschlacht where id = sid;
    ok := s.status = 'vorbei' and s.sieger = 'menschen' and s.ende_at is not null
      and s.ruhm -> 'menschen' @> '[{"nickname": "TestAdmin"}]'::jsonb
      and position('ki-' in s.ruhm::text) = 0 and position('Übungsflotte' in s.ruhm::text) = 0;
    erg := app.schlacht_stand(sid);
    ok := ok and erg ->> 'status' = 'vorbei';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Ende: Sieger nach Runden, Ruhm ohne Uebungsflotte' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T9: Rechte - Aufstellen und Rundenwechsel nur intern. */
  ok := has_function_privilege('authenticated', 'app.schlacht_aufstellen(bigint)', 'execute') = false
    and has_function_privilege('anon', 'app.schlacht_runde_pruefen(bigint)', 'execute') = false
    and has_function_privilege('authenticated', 'app.schlacht_runde_pruefen(bigint)', 'execute') = false
    and has_function_privilege('anon', 'public.schlacht_stand(bigint)', 'execute') = true
    and has_function_privilege('authenticated', 'public.seite_waehlen(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T9 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
