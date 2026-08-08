/* ======================================
   STREAMRÄTSEL - EINSTELLUNGEN
   Hier legst du fest, wann sich das Rätsel
   freischaltet und was danach angezeigt wird.
====================================== */

const streamRaetselConfig = {
  // Freischalt-Datum (Format: "JJJJ-MM-TTTHH:MM:SS")
  unlockDate: "2026-08-08T20:30:00",

  // Wird erst NACH dem Freischalten angezeigt (bzw. für dich
  // im Vorschau-Modus, siehe unten)
  title: "Das Streamrätsel",
  description:
    "Willkommen beim Streamrätsel! Trage hier den eigentlichen Rätseltext, " +
    "Hinweise oder Bilder ein, sobald es losgeht.",

  // Optional: Bild anzeigen (Pfad relativ zur index.html), sonst leer lassen
  image: "",

  /* ------------------------------------------------------
     ZAHLENSCHLÖSSER (rot + schwarz)
     Jeweils 3-stellige Kombination (als Text, mit führenden
     Nullen falls nötig, z.B. "007"). Besucher drehen die
     Zahlenräder - stimmt die Kombi, springt genau DIESES
     Schloss auf. Sind BEIDE offen, erscheint die Dankes-
     Animation mit deinem Text.
  ------------------------------------------------------ */
  redLockCombination: "736",
  blackLockCombination: "925",

  // Text, der erscheint, wenn beide Schlösser offen sind
  finaleText: "Danke für alles Dave und Chat ihr seid die besten! Gönn dir deinen Pokal!!",

  /* ------------------------------------------------------
     NACHRICHTEN PRO ZIFFER
     Genau 3 Einträge je Schloss (für Ziffer 1, 2 und 3 in
     dieser Reihenfolge). Erscheint, sobald die jeweilige
     Ziffer über den "Prüfen"-Button bestätigt wurde.

     Optional: "audio" hinzufügen (Pfad relativ zur index.html),
     damit bei dieser Ziffer zusätzlich ein Abspiel-Button
     erscheint. Kann danach nur 3x abgespielt werden.
  ------------------------------------------------------ */
  redLockMessages: [
    { message: "Erste Ziffer richtig. Zugfahrer_Dave besitzt 18 Sprites. Er verschenkt die Hälfte seiner Sprites an Spieler. Von den übrigen Sprites verschenkt er anschließend noch 4 weitere an andere Spieler. Danach erhält er 2 neue Sprites. Kurz darauf verdoppelt sich die Anzahl seiner Sprites durch einen besonderen Bonus. Zum Schluss verschenkt Zugfahrer_Dave noch 10 Sprites an Spieler. Frage: Wie viele Sprites hat Zugfahrer_Dave am Ende noch?" },
    { message: "Zweite Ziffer von Rot richtig! Die nächste Aufgabe erklärt dein Mod" },
    { message: "Rotes Schloss geknackt! Weiter geht's mit Schwarz. Hier wird es einfach, die richtige Zahl weiß jemand aus deiner Community. Ruf einfach mal durch... - Hier der Insta: Jst0xn" },
  ],
  blackLockMessages: [
    { message: "Erste Ziffer von Schwarz richtig!", audio: "audio/Mein_Audio.mp3" }, 
    { message: "Zweite Ziffer von Schwarz richtig! Nun für die Letzte gibt es ein Youtube video wo du zeichen musst." },
    { message: "Schwarzes Schloss geknackt! Glückwunsch alle sind offen" },
  ],

  /* ------------------------------------------------------
     NUR FÜR DICH ALS ERSTELLER:
     Öffne deine Seite einmal mit folgendem Link (Schlüssel
     gerne unten ändern, dann muss der Link auch angepasst
     werden):

     https://deine-seite/index.html?admin=DEIN-GEHEIMSCHLUESSEL

     Danach siehst du IN DEINEM BROWSER dauerhaft schon den
     "freigeschalteten" Inhalt oben (title/description/image),
     auch vor dem eigentlichen Datum - so kannst du in Ruhe
     testen und vorbereiten, was später erscheinen soll.
     Alle ANDEREN Besucher sehen weiterhin ganz normal den
     Countdown, bis die echte Zeit erreicht ist.
  ------------------------------------------------------ */
  previewKey: "dave-crew-2026",
};
