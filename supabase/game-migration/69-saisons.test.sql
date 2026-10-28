/* ======================================================
   PRUEFUNG ZU 69-saisons.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 69 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck,
   auch die Einstellungen und das Testdatum.

   Das Datum: app.saison_heute() wird im inneren Block durch eine
   Fassung mit festem Tag ersetzt (DDL laeuft in der Transaktion
   und wird mit zurueckgerollt). So laesst sich der 24. Dezember
   pruefen, egal wann der Test laeuft.

   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '69aa0000-0000-0000-0000-0000000000ff';
  p1      constant text := '69aa0000-0000-0000-0000-0000000000a1';
  p2      constant text := '69aa0000-0000-0000-0000-0000000000a2';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  c       jsonb;
  boese   jsonb;
  i       integer;
  geld    integer;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Die Vorgabe ist gueltig, kaputte Formen nicht. */
  c := (select daten from public.saison_config where id = 1);
  ok := app.saison_config_ok(c) = true;
  for boese in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_set(c, '{erzwungen}', '"sommer"'),
      jsonb_set(c, '{fenster,halloween,von}', '"31.10."'),
      jsonb_set(c, '{fenster,ostern,bis}', '"03-29"'),
      jsonb_set(c, '{fenster,ostern,von}', '"2027-04-30"'),
      jsonb_set(c, '{suche,halloween,belohnung}', '5000'),
      jsonb_set(c, '{suche,ostern,titel}', '"Ein viel zu langer Titel fuer die Eiersuche"'),
      jsonb_set(c, '{suche,halloween,seiten}', '["stand"]'),
      jsonb_set(c, '{suche,halloween,seiten,0}', '"gateway"'),
      jsonb_set(c, '{advent,0}', '{"art":"dublonen","wert":999999}'),
      jsonb_set(c, '{advent,1}', '{"art":"spind","wert":"gibtsnicht"}'),
      jsonb_set(c, '{advent,2}', '{"art":"code","wert":"mit leerzeichen"}'),
      jsonb_set(c, '{advent,3}', '{"art":"gold","wert":1}'),
      c - 'advent',
      jsonb_set(c, '{neujahr,geschenk}', '"100"'))) loop
    ok := ok and app.saison_config_ok(boese) = false;
  end loop;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Vorgabe gueltig, falsche Formen abgelehnt' || E'\n';

  begin
    insert into public.players (firebase_uid, nickname, currency) values (ad, 'SaisonAdmin', 0), (p1, 'Kuerbisjaegerin', 0), (p2, 'Wichtel', 0);

    /* T2: Welche Saison gilt - nach Datum, ueber den Jahreswechsel, erzwungen. */
    ok := true;
    for boese in select value from jsonb_array_elements('[
        ["2026-10-20","halloween"],["2026-11-01","halloween"],["2026-11-02","original"],
        ["2026-12-10","weihnachten"],["2026-12-30","neujahr"],["2027-01-03","neujahr"],
        ["2027-01-07","original"],["2027-03-25","ostern"],["2028-03-25","original"]]'::jsonb) loop
      execute format('create or replace function app.saison_heute() returns date language sql stable as $f$ select %L::date $f$', boese ->> 0);
      ok := ok and app.saison_jetzt() = boese ->> 1;
    end loop;
    update public.saison_config set daten = jsonb_set(daten, '{erzwungen}', '"ostern"') where id = 1;
    ok := ok and app.saison_jetzt() = 'ostern';
    update public.saison_config set daten = jsonb_set(daten, '{erzwungen}', 'null') where id = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Saison nach Datum, Jahreswechsel, erzwungen' || E'\n';

    /* T3: Kuerbisjagd - 17 Funde, je 25, beim 17. Bonus und Titel. */
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-10-25' $f$;
    perform set_config('request.jwt.claims', '{"sub":"' || p1 || '","role":"authenticated"}', true);
    for i in 1..16 loop erg := app.saison_fund(i); end loop;
    ok := (erg ->> 'gefunden')::int = 16 and (erg ->> 'bonus')::int = 0 and erg ->> 'titel' is null;
    erg := app.saison_fund(17);
    ok := ok and (erg ->> 'gefunden')::int = 17 and (erg ->> 'bonus')::int = 300 and erg ->> 'titel' = 'Kürbiskönig'
      and exists (select 1 from public.spieler_event_titel where firebase_uid = p1 and titel_id = 'saison-halloween');
    /* Nacheinander pruefen: in EINEM Ausdruck legt Postgres die
       Reihenfolge der and-Teile nicht fest. */
    ok := ok and app.saison_fund(17) ->> 'grund' = 'schon';
    ok := ok and app.saison_fund(18) ->> 'grund' = 'unbekannt';
    ok := ok and (select currency from public.players where firebase_uid = p1) = 17 * 25 + 300;
    erg := app.saison_stand();
    ok := ok and erg ->> 'saison' = 'halloween' and jsonb_array_length(erg -> 'suche' -> 'gefunden') = 17
      and jsonb_array_length(erg -> 'suche' -> 'seiten') = 17;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Kuerbisjagd: 17 Funde, Bonus und Titel genau einmal' || E'\n';

    /* T4: Adventskalender - nur heute, verpasst bleibt zu, Inhalt erst nach dem Oeffnen. */
    perform set_config('request.jwt.claims', '{"sub":"' || p2 || '","role":"authenticated"}', true);
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-12-03' $f$;
    erg := app.advent_oeffnen(3);
    ok := erg ->> 'art' = 'spind' and exists (select 1 from public.spind_besitz where firebase_uid = p2 and teil_id = erg ->> 'wert');
    ok := ok and app.advent_oeffnen(4) ->> 'grund' = 'nicht-heute';
    ok := ok and app.advent_oeffnen(3) ->> 'grund' = 'schon';
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-12-05' $f$;
    ok := ok and app.advent_oeffnen(4) ->> 'grund' = 'nicht-heute';   -- verpasst
    erg := app.advent_oeffnen(5);
    ok := ok and erg ->> 'art' = 'code' and erg ->> 'wert' = 'EISBART';
    erg := app.saison_stand();
    ok := ok and (erg -> 'advent' ->> 'tag')::int = 5 and jsonb_array_length(erg -> 'advent' -> 'geoeffnet') = 2
      and erg -> 'advent' -> 'geoeffnet' -> 1 ->> 'wert' = 'EISBART'
      and erg::text not like '%LEBKUCHEN%';                            -- Tuerchen 11 bleibt verborgen
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-12-24' $f$;
    geld := (select currency from public.players where firebase_uid = p2);
    erg := app.advent_oeffnen(24);
    ok := ok and erg ->> 'art' = 'eigen' and (select currency from public.players where firebase_uid = p2) = geld + 500;
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-12-25' $f$;
    erg := app.saison_stand();
    ok := ok and erg ->> 'saison' = 'weihnachten' and erg -> 'advent' ->> 'tag' is null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Advent: nur am eigenen Tag, Inhalt erst nach dem Oeffnen' || E'\n';

    /* T5: Neujahr - Geschenk erst ab dem 1. Januar, genau einmal. */
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-12-30' $f$;
    ok := app.neujahr_geschenk() ->> 'grund' = 'noch-nicht';
    erg := app.saison_stand();
    ok := ok and (erg -> 'neujahr' ->> 'ziel')::timestamptz = timestamptz '2027-01-01 00:00:00 Europe/Berlin'
      and (erg -> 'neujahr' ->> 'abgeholt')::boolean = false;
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2027-01-01' $f$;
    geld := (select currency from public.players where firebase_uid = p2);
    ok := ok and (app.neujahr_geschenk() ->> 'dublonen')::int = 100;
    ok := ok and app.neujahr_geschenk() ->> 'grund' = 'schon';
    ok := ok and (select currency from public.players where firebase_uid = p2) = geld + 100;
    ok := ok and (app.saison_stand() -> 'neujahr' ->> 'abgeholt')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Neujahrsgeschenk ab 0 Uhr, genau einmal' || E'\n';

    /* T6: Admin liest und speichert, Spieler nicht; Titeltext folgt. */
    ok := true;
    begin perform app.admin_saison_lesen(); ok := false; exception when others then ok := ok and sqlerrm = 'nur-admin'; end;
    begin perform app.admin_saison_speichern(c); ok := false; exception when others then ok := ok and sqlerrm = 'nur-admin'; end;
    perform set_config('request.jwt.claims', '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    ok := ok and (app.admin_saison_lesen() -> 'daten') = (select daten from public.saison_config where id = 1);
    ok := ok and app.admin_saison_speichern(jsonb_set(c, '{advent,0}', '{"art":"dublonen","wert":0}')) ->> 'grund' = 'form';
    erg := app.admin_saison_speichern(jsonb_set(c, '{suche,halloween,titel}', '"Kürbiskaiser"'));
    ok := ok and (erg ->> 'ok')::boolean = true
      and (select text from public.event_titel where titel_id = 'saison-halloween') = 'Kürbiskaiser';
    /* Ohne Anmeldung: Aussehen ja, Persoenliches nein. */
    perform set_config('request.jwt.claims', '', true);
    create or replace function app.saison_heute() returns date language sql stable as $f$ select date '2026-10-25' $f$;
    erg := app.saison_stand();
    ok := ok and erg ->> 'saison' = 'halloween' and (erg ->> 'angemeldet')::boolean = false
      and jsonb_array_length(erg -> 'suche' -> 'gefunden') = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Admin-Rechte, Titeltext, Stand ohne Anmeldung' || E'\n';

    /* T7: Konto loeschen raeumt Funde, Tuerchen und Geschenke mit ab. */
    delete from public.players where firebase_uid in (p1, p2);
    ok := not exists (select 1 from public.saison_funde where firebase_uid in (p1, p2))
      and not exists (select 1 from public.advent_oeffnungen where firebase_uid in (p1, p2))
      and not exists (select 1 from public.neujahr_geschenke where firebase_uid in (p1, p2));
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Konto loeschen raeumt die Saison-Daten ab' || E'\n';

    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || E'\nABBRUCH: ' || sqlerrm;
    end if;
  end;

  raise notice '%', ausgabe;
end $$;
