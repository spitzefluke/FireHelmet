/* ======================================================
   PRUEFUNG ZU 48-hangar.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 48 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (auch die Epoche in
   live_event) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '48aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  i       integer;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'HangarTest', 1000000);
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

    /* T1: ohne 2100 und ohne Seite geht nichts. */
    update public.live_event set jahr_1720_ab = null, jahr_2100_ab = null where id = 1;
    erg := app.hangar_typ_waehlen('jaeger');
    ok := erg ->> 'grund' = 'nicht-2100';
    update public.live_event set jahr_2100_ab = now() - interval '1 minute' where id = 1;
    erg := app.hangar_ausbauen('leben');
    ok := ok and erg ->> 'grund' = 'keine-seite';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 nur in 2100 und nur mit Seite' || E'\n';

    /* T2: nur Typen der eigenen Seite. */
    update public.players set seite = 'menschen' where firebase_uid = uid;
    erg := app.hangar_typ_waehlen('drohne');
    ok := erg ->> 'grund' = 'falscher-typ';
    erg := app.hangar_typ_waehlen('kreuzer');
    ok := ok and (erg ->> 'ok')::boolean = true and erg -> 'einheit' ->> 'typ' = 'kreuzer';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 nur Typen der eigenen Seite' || E'\n';

    /* T3: Ausbau zieht genau den Preis ab. */
    erg := app.hangar_ausbauen('schaden');
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'preis')::int = 1000
      and (erg -> 'einheit' ->> 'stufe_schaden')::int = 1
      and (select currency from public.players where firebase_uid = uid) = 999000;
    erg := app.hangar_ausbauen('schaden');
    ok := ok and (erg ->> 'preis')::int = 3000
      and (select currency from public.players where firebase_uid = uid) = 996000;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Ausbau zieht 1000 dann 3000 ab' || E'\n';

    /* T4: hoechstens Stufe 5; der Typwechsel behaelt die Ausbauten. */
    for i in 1..3 loop erg := app.hangar_ausbauen('schaden'); end loop;
    erg := app.hangar_ausbauen('schaden');
    ok := erg ->> 'grund' = 'max';
    erg := app.hangar_typ_waehlen('jaeger');
    ok := ok and (erg -> 'einheit' ->> 'stufe_schaden')::int = 5
      and (select currency from public.players where firebase_uid = uid) = 996000 - 8000 - 20000 - 50000;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Stufe 5 ist das Ende, Typwechsel behaelt Ausbauten' || E'\n';

    /* T5: zu wenig Dublonen - nichts passiert. (Zuletzt: Kontostand
       nur senken - Aufladen per UPDATE stiesse an den Tagesdeckel aus 41.) */
    update public.players set currency = 500 where firebase_uid = uid;
    erg := app.hangar_ausbauen('leben');
    ok := erg ->> 'grund' = 'zu-wenig'
      and (select currency from public.players where firebase_uid = uid) = 500
      and (select stufe_leben from public.hangar_einheiten where firebase_uid = uid) = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 zu wenig Dublonen: kein Abzug, keine Stufe' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Tabelle nur lesbar, Schreiben nur per RPC. */
  ok := has_table_privilege('anon', 'public.hangar_einheiten', 'select') = true
    and has_table_privilege('authenticated', 'public.hangar_einheiten', 'insert') = false
    and has_table_privilege('authenticated', 'public.hangar_einheiten', 'update') = false
    and has_function_privilege('anon', 'public.hangar_ausbauen(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.hangar_ausbauen(text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.hangar_vorab(text)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Rechte: lesen ja, schreiben nur per RPC' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
