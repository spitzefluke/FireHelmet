/* ======================================================
   PRUEFUNG ZU 31-gegenhack.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 31 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   WICHTIG: Diese Pruefung aendert live_event NICHT. Jede Aenderung
   dort ginge per Realtime an alle Besucher (Story, Quest-Seite).
   Quest und Story-Starts werden direkt in die eigenen Tabellen
   geschrieben; die Admin-Funktionen werden nur als Nicht-Admin
   geprueft; der Niederlage-Trigger laeuft an einer temporaeren
   Kopie der Tabelle.

   Alle Testzeilen (Kennung beginnt mit "31test") werden am Ende
   wieder geloescht. Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '31aa0000-0000-0000-0000-00000000000a';
  uid2    constant text := '31bb0000-0000-0000-0000-00000000000b';
  ausgabe text := E'\n';
  ok      boolean;
  n       integer;
  r       jsonb;
  vorher  integer;
  nachher integer;
begin
  perform set_config('role', 'postgres', true);
  delete from public.live_story_belohnungen where story_id like '31test%';
  delete from public.live_storys where story_id like '31test%';
  delete from public.gegenhack_quests where quest_id like '31test%';

  insert into public.gegenhack_quests (quest_id, titel, ziel) values ('31test-q', '31TEST Gegenhack', 5);
  insert into public.gegenhack_quests (quest_id, titel, ziel, beendet_am, ergebnis)
       values ('31test-alt', '31TEST Alt', 5, now() - interval '1 day', 'abgebrochen');
  insert into public.live_storys (story_id, story, gestartet_am) values
    ('31test-werb', 'werbung', now() - interval '20 seconds'),
    ('31test-frueh', 'werbung', now() - interval '2 seconds'),
    ('31test-sturm', 'sturm', now() - interval '20 seconds');
  insert into public.players (firebase_uid, nickname) values (uid, '31TEST Pirat')
  on conflict (firebase_uid) do nothing;

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T1: ein Nicht-Admin startet, bricht ab und loest nichts aus. */
  ok := true;
  begin
    perform app.admin_gegenhack_starten('31TEST Frech', 3, null);
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_gegenhack_abbrechen();
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_gegenhack_finale();
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Nicht-Admin kann keine Quest starten, abbrechen oder auswerten' || E'\n';

  /* T2: jede Aufgabe zaehlt einmal. */
  ok := app.gegenhack_beitragen('31test-q', 'frag') = 1
        and app.gegenhack_beitragen('31test-q', 'frag') = 0
        and app.gegenhack_beitragen('31test-q', 'code') = 1;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 eine Aufgabe zaehlt je Spieler einmal' || E'\n';

  /* T3: unbekannte Aufgabe oder beendete Quest: -1. */
  ok := app.gegenhack_beitragen('31test-q', 'xyz') = -1
        and app.gegenhack_beitragen('31test-alt', 'frag') = -1
        and app.gegenhack_beitragen('31test-gibtsnicht', 'frag') = -1;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 unbekannte Aufgabe oder keine laufende Quest: -1' || E'\n';

  /* T4: Stand - Summen und die eigenen Aufgaben. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid2 || '","role":"authenticated","is_anonymous":true}', true);
  perform app.gegenhack_beitragen('31test-q', 'freq');
  r := app.gegenhack_stand('31test-q');
  ok := (r->>'geloest')::integer = 3 and (r->>'helfer')::integer = 2 and (r->>'ziel')::integer = 5
        and r->'meine' = '["freq"]'::jsonb and (r->>'beendet')::boolean = false
        and (app.gegenhack_stand('31test-gibtsnicht')->>'ok')::boolean = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Stand: 3 von 5, 2 Helfer, meine Aufgabe' || E'\n';

  /* T5: Feed - Name aus players, eigene Zeile markiert, keine uid. */
  select count(*) into n from app.gegenhack_feed('31test-q') f where f.name = '31TEST Pirat' and f.ich = false;
  ok := n = 2
        and exists (select 1 from app.gegenhack_feed('31test-q') f where f.ich = true and f.aufgabe = 'freq')
        and not exists (select 1 from information_schema.routines r2
                          join information_schema.parameters p on p.specific_name = r2.specific_name
                         where r2.routine_schema = 'public' and r2.routine_name = 'gegenhack_feed'
                           and p.parameter_mode = 'OUT' and p.parameter_name = 'firebase_uid');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 Feed: Namen der Crew, eigene Zeile markiert, keine uid' || E'\n';

  /* T6: Werbungsflut - 25 je Secret, hoechstens 6; zweites Mal nicht. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  select currency into vorher from public.players where firebase_uid = uid;
  r := app.live_story_belohnung('31test-werb', 'werbung', 9);
  select currency into nachher from public.players where firebase_uid = uid;
  ok := (r->>'ok')::boolean = true and (r->>'dublonen')::integer = 150 and nachher - vorher = 150
        and (app.live_story_belohnung('31test-werb', 'werbung', 3)->>'grund') = 'schon';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 Werbungsflut: 6 Secrets = 150 Dublonen, nur einmal' || E'\n';

  /* T7: zu frueh, oder die falsche Story. */
  ok := (app.live_story_belohnung('31test-frueh', 'werbung', 2)->>'grund') = 'zu-frueh'
        and (app.live_story_belohnung('31test-sturm', 'werbung', 2)->>'grund') = 'falsche-art'
        and (app.live_story_belohnung('31test-sturm', 'wetter', 0)->>'ok')::boolean = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 Werbung zu frueh oder bei falscher Story: nichts; Sturm wie bisher' || E'\n';

  /* T8: Rechte - nichts direkt, anon nur lesen. */
  ok := has_table_privilege('authenticated', 'public.gegenhack_beitraege', 'select') = false
        and has_table_privilege('authenticated', 'public.gegenhack_beitraege', 'insert') = false
        and has_table_privilege('authenticated', 'public.gegenhack_belohnungen', 'select') = false
        and has_table_privilege('authenticated', 'public.gegenhack_quests', 'insert') = false
        and has_table_privilege('anon', 'public.gegenhack_quests', 'select') = true
        and has_function_privilege('anon', 'public.gegenhack_beitragen(text,text)', 'execute') = false
        and has_function_privilege('anon', 'public.admin_gegenhack_finale()', 'execute') = false
        and has_function_privilege('anon', 'public.gegenhack_stand(text)', 'execute') = true
        and has_function_privilege('anon', 'public.gegenhack_feed(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T8 keine direkten Rechte, anon nur Stand und Feed' || E'\n';

  /* T9: Niederlage-Trigger an einer temporaeren Kopie von live_event. */
  create temp table t31_live (like public.live_event including defaults) on commit drop;
  create trigger t31_aufraeumen before update on t31_live
    for each row execute function app.live_event_niederlage_aufraeumen();
  insert into t31_live (id, event_id, story, story_id, story_at)
       values (1, 'e-alt', 'gegenhack_niederlage', 's1', now());
  update t31_live set disco = disco where id = 1;                 -- nichts am Event: bleibt
  ok := (select story from t31_live) = 'gegenhack_niederlage';
  update t31_live set event_id = null where id = 1;               -- Event endet: bleibt
  ok := ok and (select story from t31_live) = 'gegenhack_niederlage';
  update t31_live set event_id = 'e-neu' where id = 1;            -- neues Event: weg
  ok := ok and (select story is null and story_id is null from t31_live);
  update t31_live set story = 'ende', story_id = 's2' where id = 1;
  update t31_live set event_id = 'e-noch-neuer' where id = 1;     -- andere Storys: unberuehrt
  ok := ok and (select story from t31_live) = 'ende';
  drop table t31_live;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T9 Niederlage bleibt bis zum naechsten Event, andere Storys unberuehrt' || E'\n';

  /* Aufraeumen (die Testspieler samt Testdublonen verschwinden ganz). */
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.players where firebase_uid in (uid, uid2) and (nickname is null or nickname = '31TEST Pirat');
  delete from public.live_story_belohnungen where story_id like '31test%';
  delete from public.live_storys where story_id like '31test%';
  delete from public.gegenhack_quests where quest_id like '31test%';
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.players where firebase_uid in (uid, uid2) and (nickname is null or nickname = '31TEST Pirat');
  delete from public.live_story_belohnungen where story_id like '31test%';
  delete from public.live_storys where story_id like '31test%';
  delete from public.gegenhack_quests where quest_id like '31test%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
