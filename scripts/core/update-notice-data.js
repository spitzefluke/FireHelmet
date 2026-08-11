/* ======================================
   UPDATE-MITTEILUNG
   Dieser Text erscheint als Popup, sobald jemand die Seite
   öffnet. Jeder Besucher sieht es nur EINMAL - danach merkt
   sich der Browser das (pro Gerät/Browser).

   WICHTIG: Das Popup erscheint automatisch ERNEUT für alle
   Besucher, sobald du hier unten am Text (title ODER message)
   etwas änderst - auch bei Besuchern, die es vorher schon
   gesehen hatten. Du musst NICHTS manuell zurücksetzen, das
   Skript erkennt Änderungen am Text von selbst.
====================================== */

const updateNoticeConfig = {
  title: "🆕 Neuigkeiten",
  message:
    "Willkommen auf meiner Webseite, Update 3.4 wurde in die Webseite gebaut. " +
    "In diesem Update wurde kleine Fehler gefixxt, neue Fehler erkannt und Avatarbilder hinzugefügt. Die Sicherheit bei den Namen wurde verbessert und der Support-Bot wird verbessert.",

  // Optional: Bild anzeigen (Pfad relativ zur index.html), sonst leer lassen
  image: "",

  // Text auf dem Schließen-Button
  buttonText: "Nice",
};
