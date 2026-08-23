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
    "🧢 NEU: THE CHALLENGE ist da! Ein K.-o.-Turnier für die ganze Crew - im neuen Menüpunkt 🧢 THE CHALLENGE beitreten, dann gegen andere Piraten antreten (Achtelfinale bis Finale). Ihr müsst dafür nicht gleichzeitig online sein: jeder spielt seine Runde, wann er Zeit hat, wer die bessere Zeit hat, gewinnt. Und der Hauptpreis ist echt: wer als Erster das komplette Turnier gewinnt, bekommt eine echte, limitierte Fire-Helmet-Cap! " +
    "Sorry Crew - heute gab's technische Probleme, dadurch konnten Schatzrad, Wochenrennen, Spielothek & Co. zeitweise nicht speichern. Als Entschuldigung gibt's den Code SORRY für +300 Dublonen! " +
    "Der Grund: die komplette Spieler-Datenbank läuft jetzt nicht mehr über Firebase, sondern komplett über Supabase - alle Spielstände wurden dafür bei Null neu gestartet, aber ab jetzt läuft wieder alles zuverlässig. " +
    "Update 4.0 ist da und damit auch viele funktionen und Upgrades." +
    "Shop ist endlich da und du kannst dir mit Dublonen etwas kaufen. Ein mysteriöser Countdown ist erschienen und irgendwas passiert auf der Seite... Update /Sh000IFF56547FAHRE kommt.... " +
    "Außerdem neu: 3 neue Songs auf der ???-Seite, das Spiel 'Andiis Schatzraub' ist jetzt bei Socials verlinkt, ein neuer Ladebalken ziert den ???-Countdown, und die Schiffs-Reise auf der Startseite läuft jetzt butterweich über GSAP.",

  // Optional: Bild anzeigen (Pfad relativ zur index.html), sonst leer lassen
  image: "",

  // Text auf dem Schließen-Button
  buttonText: "Alles klar!",
};
