/* ======================================================
   VERLOSUNG: RUNDEN-ID NUR AUS SICHEREN ZEICHEN
   ---------------------------------------------------
   giveaway_entries.giveaway_id schreibt der Browser selbst (die
   Insert-Policy prueft nur die eigene UID). Damit konnte jeder
   Besucher ein Los mit einer erfundenen Runden-ID anlegen - auch
   einer mit Anfuehrungszeichen und JavaScript darin. Das Admin-Panel
   (Community -> Verlosung) setzt die Runden-ID in onclick="..." ein;
   bis zur Korrektur im Browser (escapeJsArg in wheel.js) lief so
   eingeschleuster Code mit den Rechten des Admins.

   Der Browser ist inzwischen korrigiert. Diese Migration ist die
   zweite Schicht: Runden-IDs bestehen nur noch aus Buchstaben,
   Ziffern, Binde- und Unterstrich (1..40 Zeichen) - wie "runde-1"
   in scripts/giveaway/giveaway-data.js. Fuer giveaway_winners.round_id
   gilt dasselbe.

   Bestehende Zeilen: Die Pruefung ist NOT VALID angelegt, alte Zeilen
   bleiben also unangetastet; sie gilt fuer jedes neue Los und jeden
   neuen Zug. Nichts wird geloescht oder geaendert.

   REIHENFOLGE: nach 67 einspielen. Von Hand. Idempotent.
====================================================== */

alter table public.giveaway_entries drop constraint if exists giveaway_entries_runde_form;
alter table public.giveaway_entries add constraint giveaway_entries_runde_form
  check (giveaway_id ~ '^[A-Za-z0-9_-]{1,40}$') not valid;

alter table public.giveaway_winners drop constraint if exists giveaway_winners_runde_form;
alter table public.giveaway_winners add constraint giveaway_winners_runde_form
  check (round_id ~ '^[A-Za-z0-9_-]{1,40}$') not valid;
