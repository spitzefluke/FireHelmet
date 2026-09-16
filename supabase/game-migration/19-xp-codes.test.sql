/* ======================================================
   PRUEFUNG ZU 19-xp-codes.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 19 eingespielt wurde.
   Einfach komplett markieren und laufen lassen.

   WARUM DAS HIER EIN EINZIGER DO-BLOCK IST
   Die erste Fassung sammelte die Ergebnisse in einer temporaeren
   Tabelle. Das laeuft gegen eine direkte psql-Verbindung, im
   Supabase-SQL-Editor aber nicht: dort landen die einzelnen
   Anweisungen nicht zwingend in derselben Sitzung, und dann ist
   die Tabelle aus Zeile 1 in Zeile 2 schon wieder weg
   ("relation ergebnis does not exist").

   Als EIN Block kann das nicht passieren. Der Preis: die
   Ergebnisse kommen als Hinweistext (Notice) statt als Tabelle -
   im SQL-Editor unter "Results" bzw. in der Meldungsspalte.

   Aufgeraeumt wird ausdruecklich am Ende, auch im Fehlerfall -
   es bleibt nichts stehen. Ein "begin/rollback" waere hier
   nutzlos, weil ein DO-Block fuer sich abschliesst.

   Erwartet: zehn Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid      constant text := '20000000-0000-0000-0000-00000000000a';
  ausgabe  text := E'\n';
  n        integer;
  stand    integer;
  darf     boolean;
begin
  /* Die Funktion liest die UID aus dem Token, nicht aus einem
     Argument - ohne gesetzte Ansprueche haelt sie den Aufrufer
     fuer nicht angemeldet. Die Rolle bleibt postgres: die
     Funktion ist SECURITY DEFINER, ihr ist die Rolle egal, sie
     braucht nur die Claim. Nur T10 wechselt spaeter bewusst auf
     authenticated. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* --- Aufraeumen VOR dem Lauf, falls ein frueherer Versuch
         abgebrochen ist ------------------------------------- */
  delete from public.xp_code_einloesungen where firebase_uid = uid;
  delete from public.player_progression   where firebase_uid = uid;

  /* ================================================
     T1-T4: die Betraege kommen aus der Datenbank
  ================================================ */
  n := public.xp_code_einloesen('kompass', 'season1');
  ausgabe := ausgabe || case when n = 50 then 'PASS' else 'FAIL' end
          || '  T1 kompass gibt genau 50 (war: ' || n || ')' || E'\n';

  select coalesce(pass_xp, 0) into stand
    from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when stand = 50 then 'PASS' else 'FAIL' end
          || '  T2 pass_xp steht danach auf 50 (war: ' || coalesce(stand, -1) || ')' || E'\n';

  n := public.xp_code_einloesen('goldrausch', 'season1');
  ausgabe := ausgabe || case when n = 500 then 'PASS' else 'FAIL' end
          || '  T3 goldrausch gibt genau 500 (war: ' || n || ')' || E'\n';

  select coalesce(pass_xp, 0) into stand
    from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when stand = 550 then 'PASS' else 'FAIL' end
          || '  T4 pass_xp ist 550 (addiert, nicht ersetzt; war: ' || coalesce(stand, -1) || ')' || E'\n';

  /* ================================================
     T5-T6: DIE SPERRE - der wichtigste Teil
  ================================================ */
  n := public.xp_code_einloesen('kompass', 'season1');
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T5 kompass ein zweites Mal gibt 0 (war: ' || n || ')' || E'\n';

  select coalesce(pass_xp, 0) into stand
    from public.player_progression where firebase_uid = uid;
  ausgabe := ausgabe || case when stand = 550 then 'PASS' else 'FAIL' end
          || '  T6 und schreibt nichts gut, immer noch 550 (war: ' || coalesce(stand, -1) || ')' || E'\n';

  /* ================================================
     T7-T8: Schreibweise und unbekannte Codes
     ---------------------------------------------
     Der Browser schickt trim().toLowerCase(); die Funktion muss
     dieselbe Normalisierung machen. Gross geschrieben und mit
     Leerzeichen drumherum muss deshalb denselben Code treffen -
     und weil kompass schon eingeloest ist, ist die Antwort 0 und
     nicht -1. Genau dieser Unterschied zeigt, dass der Hash
     getroffen wurde.
  ================================================ */
  n := public.xp_code_einloesen('  KOMPASS  ', 'season1');
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T7 "  KOMPASS  " trifft denselben Code, 0 statt -1 (war: ' || n || ')' || E'\n';

  n := public.xp_code_einloesen('gibtesnicht', 'season1');
  ausgabe := ausgabe || case when n = -1 then 'PASS' else 'FAIL' end
          || '  T8 erfundener Code gibt -1 (war: ' || n || ')' || E'\n';

  /* ================================================
     T9: der Aufrufer kann sich den Betrag NICHT aussuchen
     ---------------------------------------------
     Die Funktion nimmt gar kein Betrags-Argument. Der Nachweis:
     es gibt keine Fassung mit einer anderen Parameterzahl.
  ================================================ */
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'xp_code_einloesen'
     and p.pronargs <> 2;
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T9 kein Betrags-Argument vorhanden (Abweichler: ' || n || ')' || E'\n';

  /* ================================================
     T10: die Hash-Tabelle ist fuer Spieler nicht lesbar
     ---------------------------------------------
     Sonst koennte man sich die Liste holen und offline
     durchprobieren. Geprueft wird als authenticated MIT einer
     Spieler-UID im Token - genau die Lage eines echten Besuchers.

     Bewusst gegen "= false" und nicht gegen "is not true":
     Letzteres bestuende auch bei NULL.
  ================================================ */
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    begin
      select count(*) > 0 into darf from public.xp_codes;
    exception when others then
      darf := false;   -- abgelehnt ist genau das gewuenschte Ergebnis
    end;
    perform set_config('role', 'postgres', true);
  exception when others then
    perform set_config('role', 'postgres', true);
    darf := false;
  end;
  ausgabe := ausgabe || case when darf = false then 'PASS' else 'FAIL' end
          || '  T10 Spieler sieht die Hash-Tabelle nicht' || E'\n';

  /* --- Aufraeumen ------------------------------------------- */
  delete from public.xp_code_einloesungen where firebase_uid = uid;
  delete from public.player_progression   where firebase_uid = uid;

  raise notice '%', ausgabe;

exception when others then
  /* Auch bei einem unerwarteten Fehler nichts stehen lassen. */
  perform set_config('role', 'postgres', true);
  delete from public.xp_code_einloesungen where firebase_uid = uid;
  delete from public.player_progression   where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
