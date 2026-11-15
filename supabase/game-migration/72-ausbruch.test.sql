/* ======================================================
   PRUEFUNG ZU 72-ausbruch.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 72 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Laeufe, Verwahrung,
   Testspieler) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck. Die Verwahrung wird dafuer nur
   innerhalb dieses Blocks gesetzt.

   Die Zeit laeuft nicht im Test - stattdessen werden stufe_seit,
   gestartet_am und letzter_versuch zurueckgesetzt.
   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '72aa0000-0000-0000-0000-0000000000ff';
  p1      constant text := '72aa0000-0000-0000-0000-0000000000a1';
  p2      constant text := '72aa0000-0000-0000-0000-0000000000a2';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  lauf    uuid;
  lauf2   uuid;
  vorher  integer;
  s       integer;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Tabelle dicht, Titel da, Rechte wie bei 67. */
  ok := (select relrowsecurity from pg_class where oid = 'public.zelle_laeufe'::regclass) = true
    and not exists (select 1 from pg_policies where tablename = 'zelle_laeufe')
    and has_table_privilege('authenticated', 'public.zelle_laeufe', 'select') = false
    and exists (select 1 from public.event_titel where titel_id = 'zelle-ausbrecher')
    and has_function_privilege('anon', 'public.zelle_start(boolean)', 'execute') = false
    and has_function_privilege('authenticated', 'public.zelle_start(boolean)', 'execute') = true
    and has_function_privilege('authenticated', 'public.zelle_loesen(uuid, integer, text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.zelle_loesen(uuid, integer, text)', 'execute') = false
    and has_function_privilege('authenticated', 'app.zelle_raetsel()', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Tabelle ohne Policies, Titel, Rechte' || E'\n';

  /* T7: Hinweise und Loesungen passen zusammen - 200 gewuerfelte Laeufe.
     Raum 1: Striche der Symbole in der Reihenfolge der Notiz;
     Raum 3: Notiz um "uhr" Buchstaben zurueckgeschoben;
     Raum 4: Kerbe aus dem Schacht + Log aus dem Terminal. */
  ok := not exists (
    select 1 from (select app.zelle_raetsel() r from generate_series(1, 200)) x
     where (select string_agg(k ->> 'n', '' order by array_position(array(select jsonb_array_elements_text(r -> 'daten' -> '1' -> 'folge')), k ->> 'sym'))
              from jsonb_array_elements(r -> 'daten' -> '1' -> 'kerben') k) is distinct from r -> 'loesungen' ->> '1'
        or (select string_agg(chr(65 + (ascii(c) - 65 - (r -> 'daten' -> '3' ->> 'uhr')::int + 26) % 26), '' order by i)
              from regexp_split_to_table(r -> 'daten' -> '3' ->> 'notiz', '') with ordinality t(c, i)) is distinct from r -> 'loesungen' ->> '3'
        or (r -> 'daten' -> '2' ->> 'kerbe') || (r -> 'daten' -> '4' ->> 'log') is distinct from r -> 'loesungen' ->> '4'
        or r -> 'daten' -> '2' ->> 'sicherung' is distinct from r -> 'loesungen' ->> '2'
        or (r -> 'loesungen' ->> '4') !~ '^1[1-8][0-9]\.[0-9]{2}$'
        or jsonb_array_length(r -> 'daten' -> '3' -> 'rundgang') <> 3
        or (r -> 'daten' -> '4' ->> 'muster') !~ '^[01]{8}$');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Hinweise passen zu den Loesungen (200 Laeufe)' || E'\n';

  begin
    insert into public.players (firebase_uid, nickname) values (p1, 'Testausbrecher') on conflict (firebase_uid) do nothing;
    insert into public.players (firebase_uid) values (p2) on conflict (firebase_uid) do nothing;

    /* T2: Ohne Verwahrung kein Lauf; mit Verwahrung einer, der beim
       zweiten Start fortgesetzt wird. Keine Loesungen in der Antwort. */
    update public.live_event set reise_welt = null, reise_welt_ab = null where id = 1;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := public.zelle_start(false);
    ok := (erg ->> 'ok')::boolean = false and erg ->> 'grund' = 'keine-verwahrung';
    update public.live_event set reise_welt = 'verwahrung', reise_welt_ab = now() - interval '5 minutes' where id = 1;
    erg := public.zelle_start(false);
    lauf := (erg ->> 'lauf')::uuid;
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'stufe')::int = 1
      and (erg -> 'raeume') ? '1' and not ((erg -> 'raeume') ? '2')
      and erg::text not like '%loesung%'
      and jsonb_array_length(erg -> 'raeume' -> '1' -> 'kerben') = 4
      and (public.zelle_start(false) ->> 'lauf')::uuid = lauf;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Start nur in der Verwahrung, fortsetzen, ohne Loesungen' || E'\n';

    /* T3: falsch kostet 30 s, Sperre 2 s, zu schnell wartet, richtig oeffnet Raum 2. */
    erg := public.zelle_loesen(lauf, 1, '0000');
    ok := (erg ->> 'ok')::boolean = false and erg ->> 'grund' = 'falsch'
      and (select strafe_sek from public.zelle_laeufe where lauf_id = lauf) = 30;
    erg := public.zelle_loesen(lauf, 1, '1111');
    ok := ok and erg ->> 'grund' = 'zu-oft';
    update public.zelle_laeufe set letzter_versuch = null where lauf_id = lauf;
    erg := public.zelle_loesen(lauf, 1, (select loesungen ->> '1' from public.zelle_laeufe where lauf_id = lauf));
    ok := ok and erg ->> 'grund' = 'zu-schnell' and (erg ->> 'warte')::int between 1 and 90;
    update public.zelle_laeufe set letzter_versuch = null, stufe_seit = now() - interval '91 seconds' where lauf_id = lauf;
    erg := public.zelle_loesen(lauf, 1, (select loesungen ->> '1' from public.zelle_laeufe where lauf_id = lauf));
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'stufe')::int = 2 and (erg -> 'raeume') ? '2' and not ((erg -> 'raeume') ? '3');
    /* Ein anderer Spieler kann den Lauf nicht loesen. */
    perform set_config('request.jwt.claims', '{"sub":"' || p2 || '","role":"authenticated"}', true);
    erg := public.zelle_loesen(lauf, 2, 'x');
    ok := ok and erg ->> 'grund' = 'unbekannt';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Falsch +30 s, Sperre, Mindestzeit, nur eigener Lauf' || E'\n';

    /* T4: Raeume 2-4, Strafen, Ausbruch nach 20 min = 1500 Dublonen + Titel. */
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    erg := public.zelle_strafe(lauf, 'tipp');
    ok := (erg ->> 'strafe_sek')::int = 90;
    erg := public.zelle_strafe(lauf, 'quatsch');
    ok := ok and erg ->> 'grund' = 'art';
    for s in 2..4 loop
      update public.zelle_laeufe set letzter_versuch = null, stufe_seit = now() - interval '2 minutes' where lauf_id = lauf;
      erg := public.zelle_loesen(lauf, s, ' ' || lower((select loesungen ->> s::text from public.zelle_laeufe where lauf_id = lauf)) || ' ');
    end loop;
    vorher := (select currency from public.players where firebase_uid = p1);
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'fertig')::boolean = true
      and (erg ->> 'belohnung')::int = 1500 and erg ->> 'titel' = 'Ausbrecher'
      and exists (select 1 from public.spieler_event_titel where firebase_uid = p1 and titel_id = 'zelle-ausbrecher')
      and (erg ->> 'zeit_sek')::int between 90 and 200;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Vier Raeume, Strafen, 1500 Dublonen und Titel' || E'\n';

    /* T5: zweiter Lauf in derselben Verwahrung: keine zweite Belohnung;
       Stufen 1000 und 500 nach Zeit; Bestenliste mit Platz. */
    erg := public.zelle_start(false);
    lauf2 := (erg ->> 'lauf')::uuid;
    ok := lauf2 <> lauf;
    update public.zelle_laeufe set gestartet_am = now() - interval '30 minutes' where lauf_id = lauf2;
    for s in 1..4 loop
      update public.zelle_laeufe set letzter_versuch = null, stufe_seit = now() - interval '2 minutes' where lauf_id = lauf2;
      erg := public.zelle_loesen(lauf2, s, (select loesungen ->> s::text from public.zelle_laeufe where lauf_id = lauf2));
    end loop;
    ok := ok and (erg ->> 'belohnung')::int = 0 and (select currency from public.players where firebase_uid = p1) = vorher
      and (erg -> 'bestenliste' ->> 'platz')::int = 1
      and erg -> 'bestenliste' -> 'liste' -> 0 ->> 'name' = 'Testausbrecher';
    /* Neue Verwahrung, 30 min: 1000 Dublonen. */
    update public.live_event set reise_welt_ab = now() - interval '1 minute' where id = 1;
    erg := public.zelle_start(false);
    lauf2 := (erg ->> 'lauf')::uuid;
    update public.zelle_laeufe set gestartet_am = now() - interval '30 minutes' where lauf_id = lauf2;
    for s in 1..4 loop
      update public.zelle_laeufe set letzter_versuch = null, stufe_seit = now() - interval '2 minutes' where lauf_id = lauf2;
      erg := public.zelle_loesen(lauf2, s, (select loesungen ->> s::text from public.zelle_laeufe where lauf_id = lauf2));
    end loop;
    ok := ok and (erg ->> 'belohnung')::int = 1000 and (select currency from public.players where firebase_uid = p1) = vorher + 1000;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Einmal je Verwahrung, Stufe nach Zeit, Bestenliste' || E'\n';

    /* T6: Vorschau nur fuer den Admin, ohne Verwahrung, ohne Belohnung. */
    update public.live_event set reise_welt = null, reise_welt_ab = null where id = 1;
    begin perform public.zelle_start(true); ok := false; exception when others then ok := sqlerrm = 'nur-admin'; end;
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    erg := public.zelle_start(true);
    lauf2 := (erg ->> 'lauf')::uuid;
    ok := ok and (erg ->> 'vorschau')::boolean = true;
    for s in 1..4 loop
      update public.zelle_laeufe set letzter_versuch = null, stufe_seit = now() - interval '2 minutes' where lauf_id = lauf2;
      erg := public.zelle_loesen(lauf2, s, (select loesungen ->> s::text from public.zelle_laeufe where lauf_id = lauf2));
    end loop;
    ok := ok and (erg ->> 'fertig')::boolean = true and (erg ->> 'belohnung')::int = 0
      and not exists (select 1 from jsonb_array_elements(erg -> 'bestenliste' -> 'liste') x where (x ->> 'ich')::boolean = true);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Vorschau nur Admin, ohne Belohnung und Bestenliste' || E'\n';

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
