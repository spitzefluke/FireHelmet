/* ======================================================
   PRUEFUNG ZU 26-skill-auszeichnungen.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 26 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).
   Legt drei Test-Spieler an und loescht sie am Ende wieder.

   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  u_legende constant text := '26aa0000-0000-0000-0000-00000000000a';
  u_ritter  constant text := '26bb0000-0000-0000-0000-00000000000b';
  u_ohne    constant text := '26cc0000-0000-0000-0000-00000000000c';
  ausgabe   text := E'\n';
  n         integer;
  ok        boolean;
  zeile     record;
begin
  perform set_config('role', 'postgres', true);
  delete from public.player_progression where firebase_uid in (u_legende, u_ritter, u_ohne);

  insert into public.player_progression (firebase_uid, unlocked_skills) values
    (u_legende, '{rad1,titel1,abzeichen1,legende}'),
    (u_ritter,  '{rad1,rad2,titel1}'),
    (u_ohne,    '{rad1,slot1}');

  /* T1: die Legende schlaegt den Gluecksritter, Abzeichen kommt mit. */
  select * into zeile from public.skill_auszeichnungen() where firebase_uid = u_legende;
  ok := zeile.titel = 'legende' and zeile.abzeichen = '{abzeichen1}';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Legende: Titel legende, Abzeichen abzeichen1 (war: ' || coalesce(zeile.titel, 'null') || ')' || E'\n';

  /* T2: nur Gluecksritter, keine Abzeichen. */
  select * into zeile from public.skill_auszeichnungen() where firebase_uid = u_ritter;
  ok := zeile.titel = 'titel1' and zeile.abzeichen = '{}';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 nur Gluecksritter: Titel titel1, keine Abzeichen (war: ' || coalesce(zeile.titel, 'null') || ')' || E'\n';

  /* T3: wer nur Boni hat, taucht gar nicht auf. */
  select count(*) into n from public.skill_auszeichnungen() where firebase_uid = u_ohne;
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T3 Spieler nur mit Boni erscheint nicht (war: ' || n || ')' || E'\n';

  /* T4: die Funktion gibt genau drei Spalten heraus, sonst nichts. */
  select pg_get_function_result(p.oid) = 'TABLE(firebase_uid text, titel text, abzeichen text[])' into ok
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'skill_auszeichnungen';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 liefert nur firebase_uid, titel, abzeichen' || E'\n';

  /* T5: ein anonymer Besucher darf die Funktion aufrufen ... */
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.skill_auszeichnungen() where firebase_uid in (u_legende, u_ritter);
    ok := n = 2;
  exception when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 anon kann die Auszeichnungen lesen' || E'\n';

  /* T6: ... kommt an player_progression selbst aber weiterhin nicht. */
  begin
    select count(*) into n from public.player_progression where firebase_uid = u_legende;
    ok := n = 0;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  perform set_config('role', 'postgres', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 anon sieht player_progression weiterhin nicht' || E'\n';

  delete from public.player_progression where firebase_uid in (u_legende, u_ritter, u_ohne);
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.player_progression where firebase_uid in (u_legende, u_ritter, u_ohne);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
