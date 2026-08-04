/* ======================================================
   GEWINNSPIEL - EINSTELLUNGEN
   ---------------------------------------------------
   Du startest hier JEDE Runde selbst manuell:
   1. "active" auf true setzen
   2. "id" auf einen NEUEN, eindeutigen Namen setzen
      (z.B. "runde-2" statt "runde-1") - das ist wichtig,
      sonst denkt das System, es ist noch die alte Runde!
   3. "endDate" auf das gewünschte Enddatum setzen
   4. Titel/Beschreibung nach Belieben anpassen

   Ab dann können Besucher per Knopfdruck teilnehmen. Nach
   dem Enddatum wird automatisch 1 Gewinner gezogen und
   bleibt so lange stehen, bis du die NÄCHSTE Runde startest
   (neue "id" + active:true).

   Willst du das Gewinnspiel dazwischen pausieren, ohne eine
   neue Runde zu beginnen: "active" auf false setzen.
====================================================== */

const giveawayConfig = {
  // Eindeutige Kennung dieser Runde - bei jeder neuen Runde ändern!
  id: "runde-1",

  // true = Besucher können gerade teilnehmen / Countdown läuft
  // false = kein aktives Gewinnspiel (z.B. weil du es noch vorbereitest)
  active: true,

  // Wie viele Gewinner bei der Ziehung gezogen werden
  winnersCount: 1,

  // Enddatum der Runde (Format: "JJJJ-MM-TTTHH:MM:SS")
  // Danach wird automatisch ausgelost.
  endDate: "2026-08-20T20:00:00",

  // Wird auf der Gewinnspiel-Seite angezeigt
  title: "Gewinnspiel",
  prizeDescription: "Ein exklusiver Fan-Preis für die Flitzpiepen-Crew! 🏴‍☠️",
};
