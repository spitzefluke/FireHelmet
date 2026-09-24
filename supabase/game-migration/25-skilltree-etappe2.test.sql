/* ======================================================
   PRUEFUNG ZU 25-skilltree-etappe2.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 25 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Der Boss-Teil nutzt einen eigenen Test-Monat (2099-01), damit
   der echte Boss und die echte Rangliste unberuehrt bleiben. Alles
   wird am Ende wieder geloescht.

   Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '25aa0000-0000-0000-0000-00000000000a';
  uid2    constant text := '25bb0000-0000-0000-0000-00000000000b';
  monat   constant text := '2099-01';
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  f       numeric;
  j       jsonb;
  ben     text[];
begin
  perform set_config('role', 'postgres', true);

  delete from public.community_boss_damage where month_id = monat;
  delete from public.community_boss where month_id = monat;
  delete from public.boss_attack_state where firebase_uid in (uid, uid2);
  delete from public.player_progression where firebase_uid in (uid, uid2);

  /* --- Der Baum --- */

  /* T1: drei neue Zweige mit je drei Stufen (1/2/2 Punkte, 5/10/10 %). */
  select count(*) into n from public.skill_nodes s
    join (values
      ('boss1',   1, '{}'::text[],   'bossschaden', 5),
      ('boss2',   2, '{boss1}',      'bossschaden', 10),
      ('boss3',   2, '{boss2}',      'bossschaden', 10),
      ('rennen1', 1, '{}'::text[],   'rennen',      5),
      ('rennen2', 2, '{rennen1}',    'rennen',      10),
      ('rennen3', 2, '{rennen2}',    'rennen',      10),
      ('markt1',  1, '{}'::text[],   'shoprabatt',  5),
      ('markt2',  2, '{markt1}',     'shoprabatt',  10),
      ('markt3',  2, '{markt2}',     'shoprabatt',  10)
    ) as e(id, kosten, ben, art, wert)
      on s.node_id = e.id and s.kosten = e.kosten and s.benoetigt = e.ben
     and s.art = e.art and s.wert = e.wert;
  ausgabe := ausgabe || case when n = 9 then 'PASS' else 'FAIL' end
          || '  T1 Boss/Rennen/Markt je Stufe I-III richtig angelegt (war: ' || n || ')' || E'\n';

  /* T2: die Legende braucht jetzt alle sechs Stufen III. */
  select benoetigt into ben from public.skill_nodes where node_id = 'legende';
  ok := ben @> '{rad3,slot3,xp3,boss3,rennen3,markt3}' and ben <@ '{rad3,slot3,xp3,boss3,rennen3,markt3}';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 legende braucht alle sechs Stufen III' || E'\n';

  /* T3: der ganze Baum kostet 37 Punkte. */
  select sum(kosten) into n from public.skill_nodes;
  ausgabe := ausgabe || case when n = 37 then 'PASS' else 'FAIL' end
          || '  T3 ganzer Baum kostet 37 Punkte (war: ' || coalesce(n, -1) || ')' || E'\n';

  /* T4: eine unbekannte Art bleibt verboten. */
  begin
    insert into public.skill_nodes (node_id, kosten, art, wert) values ('25quatsch', 1, 'quatsch', 0);
    ok := false;
  exception when check_violation then ok := true; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 unbekannte Knoten-Art wird weiterhin abgelehnt' || E'\n';

  /* T5: der Faktor ist 1 ohne Sterne und 1.25 mit boss1-boss3. */
  insert into public.player_progression (firebase_uid) values (uid), (uid2);
  f := app.skill_bonus_faktor(uid, 'bossschaden');
  update public.player_progression set unlocked_skills = '{boss1,boss2,boss3,rad1}' where firebase_uid = uid;
  ausgabe := ausgabe || case when f = 1 and app.skill_bonus_faktor(uid, 'bossschaden') = 1.25 then 'PASS' else 'FAIL' end
          || '  T5 Boss-Faktor 1 ohne und 1.25 mit allen drei Stufen (war: ' || f || ' / ' || app.skill_bonus_faktor(uid, 'bossschaden') || ')' || E'\n';

  /* --- Der Boss (eigener Test-Monat) --- */
  insert into public.community_boss (month_id, hp, max_hp) values (monat, 10000, 10000);
  insert into public.boss_attack_state (firebase_uid, frei) values (uid, '{salve,fass}'), (uid2, '{salve}');

  /* T6: Salve (fest 90) mit +25 % -> 113. */
  perform set_config('request.jwt.claims', '{"sub":"' || uid || '","role":"authenticated"}', true);
  j := public.boss_attack(monat, 'salve', 'Tester');
  ausgabe := ausgabe || case when (j->>'schaden')::int = 113 and (j->'einzel'->>'skill')::numeric = 1.25 then 'PASS' else 'FAIL' end
          || '  T6 Salve mit +25 % macht 113 statt 90 (war: ' || coalesce(j->>'schaden', '?') || ')' || E'\n';

  /* T7: das Fass (fest 400) bleibt beim Deckel 400. */
  j := public.boss_attack(monat, 'fass', 'Tester');
  ausgabe := ausgabe || case when (j->>'schaden')::int = 400 then 'PASS' else 'FAIL' end
          || '  T7 Fass bleibt trotz Bonus beim Deckel 400 (war: ' || coalesce(j->>'schaden', '?') || ')' || E'\n';

  /* T8: ein Spieler ohne Sterne bekommt keinen Bonus. */
  perform set_config('request.jwt.claims', '{"sub":"' || uid2 || '","role":"authenticated"}', true);
  j := public.boss_attack(monat, 'salve', 'Ohne');
  ausgabe := ausgabe || case when (j->>'schaden')::int = 90 and (j->'einzel' ? 'skill') = false then 'PASS' else 'FAIL' end
          || '  T8 ohne Sterne bleibt die Salve bei 90 (war: ' || coalesce(j->>'schaden', '?') || ')' || E'\n';

  /* T9: Rangliste und Boss-HP stimmen mit dem verbuchten Schaden. */
  select total_damage into n from public.community_boss_damage where month_id = monat and firebase_uid = uid;
  ok := n = 513 and (select hp from public.community_boss where month_id = monat) = 10000 - 513 - 90;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T9 Rangliste 513 und Boss-HP passen dazu (war: ' || coalesce(n, -1) || ')' || E'\n';

  /* Aufraeumen */
  perform set_config('request.jwt.claims', '', true);
  delete from public.community_boss_damage where month_id = monat;
  delete from public.community_boss where month_id = monat;
  delete from public.boss_attack_state where firebase_uid in (uid, uid2);
  delete from public.player_progression where firebase_uid in (uid, uid2);
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.community_boss_damage where month_id = monat;
  delete from public.community_boss where month_id = monat;
  delete from public.boss_attack_state where firebase_uid in (uid, uid2);
  delete from public.player_progression where firebase_uid in (uid, uid2);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
