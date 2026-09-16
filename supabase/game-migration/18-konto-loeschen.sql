/* ======================================================
   EIN ANONYMES KONTO LOESCHEN KOENNEN
   ---------------------------------------------------
   WOZU
   Auf der Anmeldeseite gibt es jetzt einen Abmelden-Knopf. Wer
   anonym spielt, hat seinen ganzen Fortschritt an einer anonymen
   Supabase-UID haengen, die nur in DIESEM Browser gespeichert ist.
   Meldet er sich ab, kommt er nie wieder an diese UID heran - die
   Zeilen blieben als Karteileichen liegen, die niemand mehr
   erreicht und niemand mehr aufraeumt.

   Deshalb wird das Konto beim Abmelden auf Wunsch gleich mit
   geloescht. Der Browser darf das nicht selbst tun: dafuer
   braeuchte er den Dienstschluessel, und der gehoert niemals in
   eine Webseite. Also macht es der Server - aber nur fuer den
   Aufrufer selbst.

   DREI GRENZEN, DIE HIER GEZOGEN WERDEN
   1. Es wird ausschliesslich die EIGENE UID geloescht. Ein
      Argument, das sagt "welches Konto", gibt es bewusst nicht -
      die UID kommt aus dem signierten Token.
   2. Es werden ausschliesslich ANONYME Konten geloescht. Ein
      verifiziertes Konto (Twitch, Discord, Google, E-Mail) kann
      man wiederfinden; ein Abmelden darf es niemals vernichten.
      Diese Pruefung steht HIER, nicht nur im Browser - eine
      Pruefung, die nur im Browser steht, ist keine.
   3. Meldungen und Bewertungen werden NICHT geloescht, sondern
      von der UID geloest (auf NULL gesetzt). Sonst koennte man
      eine Missbrauchsmeldung dadurch aus der Welt schaffen, dass
      man sein Wegwerf-Konto loescht.

   REIHENFOLGE: nach 17-boss-code-schutz.sql einspielen.

   HINWEIS FUER DAS EINSPIELEN: im SQL-Editor ausfuehren, damit
   die Funktion postgres gehoert - nur dann darf SECURITY DEFINER
   auch die Zeile in auth.users entfernen.
====================================================== */


/* ======================================================
   1. DIE LOESCHFUNKTION
   ---------------------------------------------------
   Rueckgabe ist die Anzahl der geloeschten Zeilen ueber alle
   Tabellen. Nicht, weil die Zahl jemand braeuchte, sondern damit
   der Aufrufer UEBERHAUPT eine Bestaetigung bekommt: eine
   Funktion, die void zurueckgibt, sieht bei einem stillen
   Fehlschlag genauso aus wie bei einem Erfolg.
====================================================== */
create or replace function app.mein_konto_loeschen() returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  art     text := app.meine_anmeldeart();
  geloescht integer := 0;
  n       integer;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  /* Die Grenze aus Punkt 2. app.meine_anmeldeart() liest
     is_anonymous aus dem Token - der Browser kann den Wert nicht
     setzen. */
  if art is distinct from 'anon' then
    raise exception 'nur-anonyme-konten';
  end if;

  /* --- Spielstand: weg ---------------------------------- */
  delete from public.ship_repair             where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.player_progression      where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.race_progress           where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.tournament_participants where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.pass_cap_grants         where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.boss_attack_state       where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.giveaway_entries        where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;

  /* Der Schaden am Monatsboss ist eine reine Bestenliste. Die HP
     des Bosses stehen als eigener Zaehler in community_boss und
     werden hier NICHT angefasst - der Boss heilt also nicht,
     wenn jemand geht. */
  delete from public.community_boss_damage   where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;

  /* Wiederherstellungs-Kennwort und seine Fehlversuche. */
  delete from public.player_identity_codes    where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;
  delete from public.player_identity_versuche where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;

  /* --- Meldungen und Bewertungen: nur loesen -------------
     Siehe Punkt 3 oben. Der Inhalt bleibt, der Bezug zur Person
     faellt weg. */
  update public.support_reports set firebase_uid = null where firebase_uid = uid;
  update public.site_ratings    set firebase_uid = null where firebase_uid = uid;

  /* --- Die Spielerzeile selbst --------------------------- */
  delete from public.players where firebase_uid = uid; get diagnostics n = row_count; geloescht := geloescht + n;

  /* --- Das Konto ----------------------------------------
     Zum Schluss, damit bei einem Fehler weiter oben die ganze
     Transaktion zurueckrollt und das Konto NICHT verwaist
     zurueckbleibt. Es gibt keinen Fremdschluessel von den
     Spieltabellen auf auth.users - die Zeilen oben muessen
     deshalb einzeln weg, ein cascade gibt es nicht. */
  delete from auth.users where id::text = uid;

  return geloescht;
end
$$;

/* Der Wrapper ist BEWUSST ebenfalls security definer - anders als
   die Wrapper in 12 und 16.

   Der Grund: das Schema app hat kein USAGE-Recht fuer
   authenticated. Ein Wrapper, der als Aufrufer laeuft
   (SECURITY INVOKER, der Standard), scheitert deshalb schon
   beim Betreten des Schemas - "permission denied for schema app",
   noch bevor die eigentliche Funktion ueberhaupt anlaeuft. Auf
   einer frisch aufgesetzten Datenbank gaelte das fuer
   public.mein_kennwort() genauso; dass es live funktioniert,
   haengt an einem Recht, das dort irgendwann von Hand gesetzt
   wurde und in keiner Migration steht.

   Diese Funktion soll ohne dieses stille Zusatzrecht laufen. Sie
   gibt damit nichts preis: sie nimmt kein Argument, und WELCHES
   Konto sie anfasst, entscheidet allein die UID aus dem
   signierten Token - nicht die Rolle, unter der sie laeuft. */
create or replace function public.mein_konto_loeschen() returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mein_konto_loeschen() $$;

/* Nur authenticated: anon hat keine Sitzung und damit keine
   eigene UID zum Loeschen. */
grant execute on function public.mein_konto_loeschen() to authenticated;

comment on function public.mein_konto_loeschen() is
  'Loescht das EIGENE anonyme Konto samt Spielstand. Verweigert '
  'die Arbeit bei verifizierten Konten. Nimmt bewusst kein '
  'Argument - die UID kommt aus dem Token.';
