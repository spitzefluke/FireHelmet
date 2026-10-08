/* ======================================================
   PRUEFUNG ZU 37-turnier-ausschluss.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 37 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Baut in einem inneren Block ein Probe-Turnier (4er-Baum) und rollt
   es am Ende per Ausnahme zurueck - es bleibt nichts liegen, auch
   keine Cap. Das Probe-Turnier steht auf 'finished', damit es nicht
   mit einem echten offenen Turnier kollidiert (nur eines darf offen
   sein); der Trigger fragt den Turnierstatus nicht ab.
   Erwartet: fuenf Zeilen, alle "PASS".
====================================================== */
do $$
declare
  a constant text := '37aa0000-0000-0000-0000-00000000000a';
  b constant text := '37aa0000-0000-0000-0000-00000000000b';
  c constant text := '37aa0000-0000-0000-0000-00000000000c';
  d constant text := '37aa0000-0000-0000-0000-00000000000d';
  ausgabe text := E'\n';
  ok      boolean;
  ok2     boolean;
  ok3     boolean;
  m0 bigint; m1 bigint; f bigint;
  m  public.tournament_matches;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Spalte da, Standard "nicht ausgeschlossen", Trigger da. */
  ok := exists (select 1 from information_schema.columns
                 where table_name = 'tournament_participants' and column_name = 'ausgeschlossen'
                   and column_default = 'false')
        and exists (select 1 from pg_trigger where tgname = 'tournament_matches_ausschluss' and not tgisinternal);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Spalte ausgeschlossen und Trigger vorhanden' || E'\n';

  /* T2-T4 an einem Probe-Turnier, am Ende zurueckgerollt. */
  ok := false; ok2 := false; ok3 := false;
  begin
    insert into public.tournaments (id, status, bracket_size) values ('37test', 'finished', 4);
    insert into public.tournament_participants (tournament_id, firebase_uid, nickname, ausgeschlossen) values
      ('37test', a, 'A', false), ('37test', b, 'B', true), ('37test', c, 'C', false), ('37test', d, 'D', false);
    insert into public.tournament_matches (tournament_id, round, match_index, player_1_uid, player_1_nickname, player_2_uid, player_2_nickname, status)
      values ('37test', 1, 0, a, 'A', b, 'B', 'pending') returning id into m0;
    insert into public.tournament_matches (tournament_id, round, match_index, player_1_uid, player_1_nickname, player_2_uid, player_2_nickname, status)
      values ('37test', 1, 1, c, 'C', d, 'D', 'pending') returning id into m1;
    insert into public.tournament_matches (tournament_id, round, match_index, status)
      values ('37test', 2, 0, 'pending') returning id into f;

    /* T2: Match wird offen, B ist ausgeschlossen -> A gewinnt sofort,
       B scheidet aus, A steht im Finale. */
    update public.tournament_matches set status = 'open' where id = m0;
    select * into m from public.tournament_matches where id = m0;
    ok := m.status = 'complete' and m.winner_uid = a
          and (select eliminated from public.tournament_participants where tournament_id = '37test' and firebase_uid = b) = true
          and (select player_1_uid from public.tournament_matches where id = f) = a;

    /* T3: niemand ausgeschlossen -> bleibt offen; D nachtraeglich
       ausgeschlossen -> C gewinnt, Finale A gegen C wird offen und
       bleibt offen (beide zugelassen). */
    update public.tournament_matches set status = 'open' where id = m1;
    ok2 := (select status from public.tournament_matches where id = m1) = 'open';
    update public.tournament_participants set ausgeschlossen = true where tournament_id = '37test' and firebase_uid = d;
    ok2 := ok2 and app.turnier_ausschluss_pruefen(m1) = true;
    select * into m from public.tournament_matches where id = f;
    ok2 := ok2 and (select winner_uid from public.tournament_matches where id = m1) = c
           and m.player_2_uid = c and m.status = 'open';

    /* T4: beide ausgeschlossen -> offen lassen; nur A ausgeschlossen
       -> C gewinnt das Finale und das Turnier. */
    update public.tournament_participants set ausgeschlossen = true where tournament_id = '37test' and firebase_uid in (a, c);
    ok3 := app.turnier_ausschluss_pruefen(f) = false
           and (select status from public.tournament_matches where id = f) = 'open';
    update public.tournament_participants set ausgeschlossen = false where tournament_id = '37test' and firebase_uid = c;
    /* Eigene Anweisung: eine Abfrage im SELBEN Ausdruck saehe den
       Stand von vor dem Aufruf (ein Schnappschuss je Anweisung). */
    ok3 := ok3 and app.turnier_ausschluss_pruefen(f) = true;
    ok3 := ok3 and (select winner_uid from public.tournaments where id = '37test') = c;

    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ok2 := false; ok3 := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 offenes Match mit Ausgeschlossenem geht an den Gegner' || E'\n';
  ausgabe := ausgabe || case when ok2 = true then 'PASS' else 'FAIL' end
          || '  T3 nachtraeglicher Ausschluss entscheidet, Zugelassene spielen' || E'\n';
  ausgabe := ausgabe || case when ok3 = true then 'PASS' else 'FAIL' end
          || '  T4 beide ausgeschlossen: offen; sonst bis zum Turniersieg' || E'\n';

  /* T5: Nicht-Admin schliesst niemanden aus, anon darf gar nicht. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || a || '","role":"authenticated","is_anonymous":true}', true);
  ok := false;
  begin
    perform app.admin_teilnehmer_ausschliessen('37test', b, true);
  exception when others then ok := sqlerrm like '%nur-admin%'; end;
  perform set_config('request.jwt.claims', '', true);
  ok := ok
        and has_function_privilege('anon', 'public.admin_teilnehmer_ausschliessen(text, text, boolean)', 'execute') = false
        and has_function_privilege('authenticated', 'public.admin_teilnehmer_ausschliessen(text, text, boolean)', 'execute') = true
        and has_function_privilege('authenticated', 'app.turnier_ausschluss_pruefen(bigint)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 nur der Admin schliesst aus' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
