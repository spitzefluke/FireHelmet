/* ======================================================
   PRUEFUNG ZU 47-seitenwahl.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 47 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (auch die Epoche in
   live_event) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck, Realtime sieht davon nichts.
   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '47aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  alt     public.players;
  nr      public.players;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.players (firebase_uid, nickname) values (uid, 'SeitenTest');

    /* T1: Epoche nach der zuletzt erreichten Marke. */
    update public.live_event set jahr_1720_ab = null, jahr_2100_ab = null where id = 1;
    ok := app.epoche_jetzt() = '2026';
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    ok := ok and app.epoche_jetzt() = '2100';
    update public.live_event set jahr_1720_ab = now() - interval '1 hour', jahr_2100_ab = now() - interval '2 hours' where id = 1;
    ok := ok and app.epoche_jetzt() = '1720';
    update public.live_event set jahr_1720_ab = null, jahr_2100_ab = now() + interval '1 minute' where id = 1;
    ok := ok and app.epoche_jetzt() = '2026';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 epoche_jetzt: zuletzt erreichte Marke' || E'\n';

    /* T2: Waehlen nur in 2100, nur einmal, nur bekannte Seiten. */
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    erg := app.seite_waehlen('aliens');
    ok := erg ->> 'grund' = 'nicht-2100';
    update public.live_event set jahr_1720_ab = null, jahr_2100_ab = now() - interval '1 minute' where id = 1;
    erg := app.seite_waehlen('piraten');
    ok := ok and erg ->> 'grund' = 'unbekannt';
    erg := app.seite_waehlen('aliens');
    ok := ok and (erg ->> 'ok')::boolean = true;
    erg := app.seite_waehlen('menschen');
    ok := ok and erg ->> 'grund' = 'schon' and erg ->> 'seite' = 'aliens';
    ok := ok and (select seite from public.players where firebase_uid = uid) = 'aliens';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Wahl nur in 2100, einmal, endgueltig' || E'\n';

    /* T3: per normalem UPDATE eingefroren. */
    alt := app.old_player(uid);
    nr := alt; nr.avatar := 'https://example/neu.png';
    ok := app.valid_players_seite(uid, nr) = true;
    nr := alt; nr.seite := 'menschen';
    ok := ok and app.valid_players_seite(uid, nr) = false;
    nr := alt; nr.seite := null;
    ok := ok and app.valid_players_seite(uid, nr) = false;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Seite per UPDATE eingefroren' || E'\n';

    /* T4: Boss-Faktor nur in 2100. */
    ok := app.seite_boss_faktor(uid) = 1.15;
    update public.live_event set jahr_2100_ab = null where id = 1;
    ok := ok and app.seite_boss_faktor(uid) = 1;
    update public.live_event set jahr_2100_ab = now() - interval '1 minute' where id = 1;
    update public.players set seite = 'menschen' where firebase_uid = uid;
    ok := ok and app.seite_boss_faktor(uid) = 0.90;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Boss-Faktor Aliens 1,15 / Menschen 0,90, nur in 2100' || E'\n';

    /* T5: Nicht-Admin setzt keine Seite. */
    ok := false;
    begin
      perform app.admin_seite_setzen(uid, 'aliens');
    exception when others then ok := sqlerrm like '%nur-admin%'; end;
    perform set_config('request.jwt.claims', '', true);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 nur der Admin setzt Seiten' || E'\n';

    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Policies verdrahtet (restrictive). */
  ok := exists (select 1 from pg_policies where tablename = 'players' and policyname = 'players_seite_update' and permissive = 'RESTRICTIVE')
    and exists (select 1 from pg_policies where tablename = 'players' and policyname = 'players_seite_insert' and permissive = 'RESTRICTIVE')
    and exists (select 1 from pg_policies where tablename = 'race_progress' and policyname = 'race_progress_ruht_2100_insert' and permissive = 'RESTRICTIVE')
    and exists (select 1 from pg_policies where tablename = 'race_progress' and policyname = 'race_progress_ruht_2100_update' and permissive = 'RESTRICTIVE');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Policies Seite und Rennsperre (restrictive)' || E'\n';

  /* T7: Rechte. */
  ok := has_function_privilege('anon', 'public.seite_waehlen(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.seite_waehlen(text)', 'execute') = true
    and has_function_privilege('anon', 'public.admin_seite_setzen(text, text)', 'execute') = false
    and has_function_privilege('authenticated', 'app.seite_boss_faktor(text)', 'execute') = false
    and position('seite_boss_faktor' in pg_get_functiondef('app.boss_attack(text, text, text)'::regprocedure)) > 0;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Rechte, boss_attack nutzt den Seiten-Faktor' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
