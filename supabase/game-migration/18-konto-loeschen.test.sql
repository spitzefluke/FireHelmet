/* ======================================================
   PRUEFUNG ZU 18-konto-loeschen.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 18 eingespielt wurde.
   Einfach komplett markieren und laufen lassen.

   WARUM DAS HIER EIN EINZIGER DO-BLOCK IST
   Die erste Fassung sammelte die Ergebnisse in einer temporaeren
   Tabelle und klammerte alles in begin/rollback. Das laeuft gegen
   eine direkte psql-Verbindung, im Supabase-SQL-Editor aber
   nicht: dort landen die einzelnen Anweisungen nicht zwingend in
   derselben Sitzung, und dann ist die Tabelle aus Zeile 1 in
   Zeile 2 schon wieder weg ("relation ergebnis does not exist").

   Als EIN Block kann das nicht passieren. Der Preis: die
   Ergebnisse kommen als Hinweistext (Notice) statt als Tabelle,
   und das Aufraeumen muss ausdruecklich passieren - ein
   "rollback" waere hier wirkungslos, weil ein DO-Block fuer sich
   abschliesst. Es wird deshalb VOR und NACH dem Lauf aufgeraeumt,
   auch im Fehlerfall.

   Die drei Testkonten tragen UIDs, die mit 18000000 beginnen -
   weit weg von allem, was echt sein koennte.

   Geprueft wird vor allem, was NICHT passieren darf: ein
   verifiziertes Konto loeschen, und ein fremdes Konto mitnehmen.

   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid_a    constant text := '18000000-0000-0000-0000-00000000000a';  -- anonym, loescht sich
  uid_b    constant text := '18000000-0000-0000-0000-00000000000b';  -- anonym, Nachbar
  uid_c    constant text := '18000000-0000-0000-0000-00000000000c';  -- verifiziert
  ausgabe  text := E'\n';
  ergebnis text;
  n        integer;
begin
  perform set_config('role', 'postgres', true);

  /* --- Aufraeumen VOR dem Lauf ----------------------------- */
  delete from public.site_ratings   where nickname = 'LoeschMich18';
  delete from public.ship_repair    where firebase_uid in (uid_a, uid_b, uid_c);
  delete from public.players        where firebase_uid in (uid_a, uid_b, uid_c);
  delete from auth.users            where id::text   in (uid_a, uid_b, uid_c);

  /* --- Testdaten ------------------------------------------- */
  insert into auth.users (id) values (uid_a::uuid), (uid_b::uuid), (uid_c::uuid);

  insert into public.players (firebase_uid, nickname, currency) values
    (uid_a, 'LoeschMich18', 100),
    (uid_b, 'BleibDa18',    100),
    (uid_c, 'Verifiziert18',100);

  insert into public.ship_repair (firebase_uid) values (uid_a);
  insert into public.site_ratings (firebase_uid, value, nickname)
       values (uid_a, 5, 'LoeschMich18');

  /* ================================================
     T1-T4: das anonyme Konto A loescht sich selbst
  ================================================ */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid_a || '","role":"authenticated","is_anonymous":true}', true);
  begin
    n := public.mein_konto_loeschen();
    ergebnis := 'GELOESCHT:' || n;
  exception when others then
    ergebnis := 'ABGELEHNT:' || sqlerrm;
  end;
  ausgabe := ausgabe || case when ergebnis like 'GELOESCHT:%' then 'PASS' else 'FAIL' end
          || '  T1 anonymes Konto darf sich loeschen (' || ergebnis || ')' || E'\n';

  select count(*) into n from public.players where firebase_uid = uid_a;
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T2 players-Zeile ist weg' || E'\n';

  select count(*) into n from public.ship_repair where firebase_uid = uid_a;
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T3 ship_repair-Zeile ist weg' || E'\n';

  select count(*) into n from auth.users where id::text = uid_a;
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T4 auth.users-Zeile ist weg' || E'\n';

  /* T5: die Bewertung bleibt stehen, nur ohne Bezug zur Person.
     Zwei Bedingungen: der Inhalt ist noch da UND die UID ist weg.
     Nur die zweite zu pruefen bestuende auch, wenn die ganze
     Zeile geloescht worden waere - und das waere falsch. */
  select count(*) into n from public.site_ratings
   where nickname = 'LoeschMich18' and firebase_uid is null;
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T5 Bewertung bleibt, aber ohne UID' || E'\n';

  /* T6: das NACHBARKONTO darf nicht mitgegangen sein. */
  select count(*) into n from public.players where firebase_uid = uid_b;
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T6 fremdes Konto B unangetastet' || E'\n';

  /* ================================================
     T7-T8: ein VERIFIZIERTES Konto darf sich NICHT loeschen
     ---------------------------------------------
     Das ist die wichtigste Stelle dieser Datei. Ginge sie durch,
     wuerde ein Abmelden ein echtes Konto vernichten.
  ================================================ */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid_c || '","role":"authenticated",'
    '"app_metadata":{"provider":"twitch"}}', true);
  begin
    n := public.mein_konto_loeschen();
    ergebnis := 'GELOESCHT:' || n;
  exception when others then
    ergebnis := 'ABGELEHNT:' || sqlerrm;
  end;
  ausgabe := ausgabe || case when ergebnis = 'ABGELEHNT:nur-anonyme-konten' then 'PASS' else 'FAIL' end
          || '  T7 verifiziertes Konto wird abgelehnt (' || ergebnis || ')' || E'\n';

  select count(*) into n from public.players where firebase_uid = uid_c;
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T8 verifizierte players-Zeile steht noch' || E'\n';

  /* --- Aufraeumen NACH dem Lauf ---------------------------- */
  perform set_config('request.jwt.claims', '', true);
  delete from public.site_ratings   where nickname = 'LoeschMich18';
  delete from public.ship_repair    where firebase_uid in (uid_a, uid_b, uid_c);
  delete from public.players        where firebase_uid in (uid_a, uid_b, uid_c);
  delete from auth.users            where id::text   in (uid_a, uid_b, uid_c);

  raise notice '%', ausgabe;

exception when others then
  /* Auch bei einem unerwarteten Fehler nichts stehen lassen. */
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.site_ratings   where nickname = 'LoeschMich18';
  delete from public.ship_repair    where firebase_uid in (uid_a, uid_b, uid_c);
  delete from public.players        where firebase_uid in (uid_a, uid_b, uid_c);
  delete from auth.users            where id::text   in (uid_a, uid_b, uid_c);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
