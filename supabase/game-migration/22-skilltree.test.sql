/* ======================================================
   PRUEFUNG ZU 22-skilltree.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 22 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Geprueft wird: die Stufenformel, alle vier Rueckgabefaelle des
   Freischaltens, die Punkte-Deckelung, und dass der Browser
   unlocked_skills NICHT direkt setzen kann. Gegen "= wert"/
   "= false" geprueft, nicht gegen "is not true".

   Erwartet: elf Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '22aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  zeile   public.player_progression;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  delete from public.player_progression where firebase_uid = uid;
  insert into public.player_progression (firebase_uid, pass_xp) values (uid, 300); -- Stufe 2

  /* --- Stufenformel --- */
  ausgabe := ausgabe || case when app.skill_level(300) = 2 then 'PASS' else 'FAIL' end
          || '  T1 Stufe(300)=2 (2*3*50=300)  war: ' || app.skill_level(300) || E'\n';
  ausgabe := ausgabe || case when app.skill_level(299) = 1 and app.skill_level(99) = 0 then 'PASS' else 'FAIL' end
          || '  T2 Stufe(299)=1 und Stufe(99)=0' || E'\n';

  /* --- Freischalten: Grundfall --- */
  n := public.skill_freischalten('rad1');
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T3 rad1 kostet 1 und wird freigeschaltet (war: ' || n || ')' || E'\n';

  select unlocked_skills into zeile.unlocked_skills from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when 'rad1' = any(zeile.unlocked_skills) then 'PASS' else 'FAIL' end
          || '  T4 rad1 steht jetzt in unlocked_skills' || E'\n';

  /* --- zweites Mal derselbe Knoten --- */
  n := public.skill_freischalten('rad1');
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T5 rad1 ein zweites Mal gibt 0 (war: ' || n || ')' || E'\n';

  /* --- unbekannter Knoten --- */
  n := public.skill_freischalten('gibtsnicht');
  ausgabe := ausgabe || case when n = -1 then 'PASS' else 'FAIL' end
          || '  T6 unbekannter Knoten gibt -1 (war: ' || n || ')' || E'\n';

  /* --- Voraussetzung fehlt (slot2 braucht slot1) --- */
  n := public.skill_freischalten('slot2');
  ausgabe := ausgabe || case when n = -2 then 'PASS' else 'FAIL' end
          || '  T7 slot2 ohne slot1 gibt -2 (war: ' || n || ')' || E'\n';

  /* --- nicht genug Punkte: Stufe 2, rad1(1) schon weg, rad2 kostet 2
         -> verfuegbar 2-1=1 < 2 --- */
  n := public.skill_freischalten('rad2');
  ausgabe := ausgabe || case when n = -3 then 'PASS' else 'FAIL' end
          || '  T8 rad2 ohne genug Punkte gibt -3 (war: ' || n || ')' || E'\n';

  /* --- mehr Passstufe -> rad2 geht --- */
  update public.player_progression set pass_xp = 900 where firebase_uid = uid; -- Stufe 3
  n := public.skill_freischalten('rad2');
  ausgabe := ausgabe || case when n = 2 then 'PASS' else 'FAIL' end
          || '  T9 mit Stufe 3 kostet rad2 genau 2 (war: ' || n || ')' || E'\n';

  /* --- der Waechter: Client darf unlocked_skills nicht aendern --- */
  select * into zeile from public.player_progression where firebase_uid = uid;
  zeile.unlocked_skills := array_append(zeile.unlocked_skills, 'xp1'); -- gefaelscht
  ok := app.valid_progression_write(uid, zeile);
  ausgabe := ausgabe || case when ok = false then 'PASS' else 'FAIL' end
          || '  T10 direkter Client-Write auf unlocked_skills wird abgelehnt' || E'\n';

  /* --- und ein ehrlicher Write (nur xp hoch) geht durch --- */
  select * into zeile from public.player_progression where firebase_uid = uid;
  zeile.xp := coalesce(zeile.xp,0) + 100;
  ok := app.valid_progression_write(uid, zeile);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T11 ehrlicher Write (nur xp +100) geht durch' || E'\n';

  delete from public.player_progression where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.player_progression where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
