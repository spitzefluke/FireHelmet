/* ======================================================
   PRUEFUNG ZU 24-skilltree-etappe1.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 24 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Wie in 23 wird der Grant zum Testen direkt angelegt (nicht ueber
   die Admin-RPC), damit die Pruefung auch im SQL-Editor laeuft, wo
   app.is_admin() falsch ist.

   Erwartet: dreizehn Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '24aa0000-0000-0000-0000-00000000000a';
  gid     text := '24testgrant0001';
  gid2    text := '24testgrant0002';
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  stand   integer;
  zeile   public.player_progression;
  ben     text[];
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.player_progression where firebase_uid = uid;

  /* --- Der Baum --- */

  /* T1: Stufe III je Zweig, 2 Punkte, +10 %, haengt an Stufe II. */
  select count(*) into n from public.skill_nodes
   where (node_id, benoetigt) in (('rad3', '{rad2}'::text[]), ('slot3', '{slot2}'::text[]), ('xp3', '{xp2}'::text[]))
     and kosten = 2 and wert = 10;
  ausgabe := ausgabe || case when n = 3 then 'PASS' else 'FAIL' end
          || '  T1 rad3/slot3/xp3 da (2 Punkte, +10%, nach Stufe II) (war: ' || n || ')' || E'\n';

  /* T2: Titel und Abzeichen kosten jetzt 2 statt 3. */
  select count(*) into n from public.skill_nodes
   where node_id in ('titel1', 'abzeichen1') and kosten = 2;
  ausgabe := ausgabe || case when n = 2 then 'PASS' else 'FAIL' end
          || '  T2 titel1 und abzeichen1 kosten 2 (war: ' || n || ')' || E'\n';

  /* T3: der Endknoten. */
  select kosten, benoetigt into n, ben from public.skill_nodes where node_id = 'legende';
  ausgabe := ausgabe || case when n = 3 and ben @> '{rad3,slot3,xp3}' and ben <@ '{rad3,slot3,xp3}' then 'PASS' else 'FAIL' end
          || '  T3 legende kostet 3 und braucht alle drei Stufen III (war: ' || coalesce(n, -1) || ')' || E'\n';

  /* T4: der ganze Baum kostet 22 Punkte. */
  select sum(kosten) into n from public.skill_nodes;
  ausgabe := ausgabe || case when n = 22 then 'PASS' else 'FAIL' end
          || '  T4 ganzer Baum kostet 22 Punkte (war: ' || coalesce(n, -1) || ')' || E'\n';

  /* --- Skillpunkte als Geschenk --- */
  insert into public.player_progression (firebase_uid, pass_xp) values (uid, 0); -- Stufe 0
  insert into public.live_grants (grant_id, art, wert) values (gid, 'skillpunkte', 5);

  /* T5: Einloesen gibt 5 und schreibt 5 Bonuspunkte gut. */
  n := public.live_grant_einloesen(gid);
  select bonus_skill_points into stand from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when n = 5 and stand = 5 then 'PASS' else 'FAIL' end
          || '  T5 Skillpunkte-Grant gibt 5 und schreibt 5 gut (war: ' || n || ' / ' || coalesce(stand, -1) || ')' || E'\n';

  /* T6: zweites Einloesen gibt 0, Stand bleibt. */
  n := public.live_grant_einloesen(gid);
  select bonus_skill_points into stand from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when n = 0 and stand = 5 then 'PASS' else 'FAIL' end
          || '  T6 zweites Einloesen gibt 0, Stand bleibt 5 (war: ' || n || ' / ' || coalesce(stand, -1) || ')' || E'\n';

  /* T7: mehr als 10 Skillpunkte auf einmal lehnt die Tabelle ab. */
  begin
    insert into public.live_grants (grant_id, art, wert) values ('24zuviel', 'skillpunkte', 11);
    ok := false;
  exception when check_violation then ok := true; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 Skillpunkte-Grant ueber 10 wird abgelehnt' || E'\n';

  /* T8: eine unbekannte Art ist weiterhin verboten. */
  begin
    insert into public.live_grants (grant_id, art, wert) values ('24quatsch', 'quatsch', 1);
    ok := false;
  exception when check_violation then ok := true; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T8 unbekannte Grant-Art wird weiterhin abgelehnt' || E'\n';

  /* T9: mit 5 Bonuspunkten (Stufe 0) geht rad1+rad2+rad3 = 5,
     danach ist nichts mehr uebrig. */
  n := public.skill_freischalten('rad1') + public.skill_freischalten('rad2') + public.skill_freischalten('rad3');
  stand := public.skill_freischalten('slot1');
  ausgabe := ausgabe || case when n = 5 and stand = -3 then 'PASS' else 'FAIL' end
          || '  T9 Bonuspunkte tragen rad1-rad3, danach -3 (war: ' || n || ' / ' || stand || ')' || E'\n';

  /* T10: legende ohne die anderen Stufen III gibt -2. */
  n := public.skill_freischalten('legende');
  ausgabe := ausgabe || case when n = -2 then 'PASS' else 'FAIL' end
          || '  T10 legende ohne alle Stufen III gibt -2 (war: ' || n || ')' || E'\n';

  /* T11: der Bonus-Deckel von 500 haelt. */
  update public.player_progression set bonus_skill_points = 498 where firebase_uid = uid;
  insert into public.live_grants (grant_id, art, wert) values (gid2, 'skillpunkte', 5);
  n := public.live_grant_einloesen(gid2);
  select bonus_skill_points into stand from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when stand = 500 then 'PASS' else 'FAIL' end
          || '  T11 Bonuspunkte bleiben bei 500 gedeckelt (war: ' || coalesce(stand, -1) || ')' || E'\n';

  /* T12: ein Spieler kann sich Bonuspunkte nicht selbst schreiben. */
  select * into zeile from public.player_progression where firebase_uid = uid;
  zeile.bonus_skill_points := zeile.bonus_skill_points - 10 + 10; -- unveraendert: muss gehen
  ok := app.valid_progression_write(uid, zeile);
  zeile.bonus_skill_points := zeile.bonus_skill_points - 1;       -- veraendert: muss scheitern
  ausgabe := ausgabe || case when ok = true and app.valid_progression_write(uid, zeile) = false then 'PASS' else 'FAIL' end
          || '  T12 direkter Client-Write auf bonus_skill_points wird abgelehnt' || E'\n';

  /* T13: ein Nicht-Admin kann keine Skillpunkte ausloesen. */
  begin
    perform app.live_grant_ausloesen('skillpunkte', 5, null);
    ok := false;
  exception when others then
    ok := (sqlerrm like '%nur-admin%');
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T13 Nicht-Admin kann keine Skillpunkte ausloesen' || E'\n';

  /* Aufraeumen */
  perform set_config('request.jwt.claims', '', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.player_progression where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.player_progression where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
