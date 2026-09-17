/* ======================================================
   PRUEFUNG ZU 20-avatar-schutz.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 20 eingespielt wurde.
   Einfach komplett markieren und laufen lassen.

   EIN EINZIGER DO-BLOCK - warum, steht ausfuehrlich in
   18-konto-loeschen.test.sql: der Supabase-SQL-Editor legt die
   einzelnen Anweisungen nicht zwingend in dieselbe Sitzung, und
   dann geht ein Zwischenstand zwischen zwei Zeilen verloren. Als
   ein Block kann das nicht passieren. Ergebnis kommt als
   Hinweistext, aufgeraeumt wird vor und nach dem Lauf, auch im
   Fehlerfall.

   Geprueft wird die SPERRE: ein sauberer Avatar muss durch, ein
   Avatar mit < > " ' muss abgelehnt werden - auf allen drei
   Spalten. Gegen "= false"/Ausnahme geprueft, nicht gegen "is
   not true" (siehe CLAUDE.md).

   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid1    constant text := '20aa0000-0000-0000-0000-000000000001';
  uid2    constant text := '20aa0000-0000-0000-0000-000000000002';
  monat   constant text := '20aa-test';
  ausgabe text := E'\n';
  ok      boolean;
begin
  perform set_config('role', 'postgres', true);

  /* --- Aufraeumen VOR dem Lauf --------------------------- */
  delete from public.community_boss_damage where firebase_uid in (uid1, uid2);
  delete from public.players               where firebase_uid in (uid1, uid2);

  /* ================================================
     players.avatar
  ================================================ */
  /* T1: ein sauberer Pfad muss durchgehen. */
  begin
    insert into public.players (firebase_uid, avatar) values (uid1, 'scripts/avatare/5.png');
    ok := true;
  exception when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end
          || '  T1 sauberer Avatar-Pfad wird angenommen' || E'\n';

  /* T2: ein Tag muss abgelehnt werden. */
  begin
    update public.players set avatar = '<img src=x onerror=alert(1)>' where firebase_uid = uid1;
    ok := false;   -- kam durch = schlecht
  exception when check_violation then ok := true;
  when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Avatar mit <> wird abgelehnt' || E'\n';

  /* T3: ein Attribut-Ausbruch (Anfuehrungszeichen) muss
     abgelehnt werden - das ist der Bild-Zweig-Angriff. */
  begin
    update public.players set avatar = 'foo/" onerror="x' where firebase_uid = uid1;
    ok := false;
  exception when check_violation then ok := true;
  when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 Avatar mit " wird abgelehnt' || E'\n';

  /* T4: der urspruenglich gesetzte saubere Wert steht noch -
     die abgelehnten Updates haben nichts veraendert. */
  select avatar = 'scripts/avatare/5.png' into ok
    from public.players where firebase_uid = uid1;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 der saubere Wert steht unveraendert' || E'\n';

  /* ================================================
     players.temp_avatar_id
  ================================================ */
  begin
    update public.players set temp_avatar_id = '<script>' where firebase_uid = uid1;
    ok := false;
  exception when check_violation then ok := true;
  when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 temp_avatar_id mit <> wird abgelehnt' || E'\n';

  /* ================================================
     community_boss_damage.avatar
  ================================================ */
  /* T6: sauber muss durch. */
  begin
    insert into public.community_boss_damage (month_id, firebase_uid, nickname, avatar)
         values (monat, uid2, 'Testpirat', 'scripts/avatare/6.png');
    ok := true;
  exception when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end
          || '  T6 sauberer Boss-Avatar wird angenommen' || E'\n';

  /* T7: Tag muss abgelehnt werden. */
  begin
    update public.community_boss_damage set avatar = '"><svg onload=1>'
     where month_id = monat and firebase_uid = uid2;
    ok := false;
  exception when check_violation then ok := true;
  when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 Boss-Avatar mit <>" wird abgelehnt' || E'\n';

  /* T8: ein Emoji ist erlaubt - die Sperre trifft nur HTML-
     Zeichen, keine harmlosen Sonderzeichen. */
  begin
    update public.players set avatar = '🏴‍☠️' where firebase_uid = uid1;
    ok := true;
  exception when others then ok := false;
  end;
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end
          || '  T8 ein Emoji-Avatar bleibt erlaubt' || E'\n';

  /* --- Aufraeumen NACH dem Lauf -------------------------- */
  delete from public.community_boss_damage where firebase_uid in (uid1, uid2);
  delete from public.players               where firebase_uid in (uid1, uid2);

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.community_boss_damage where firebase_uid in (uid1, uid2);
  delete from public.players               where firebase_uid in (uid1, uid2);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
