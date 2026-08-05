/* ======================================
   STREAMRÄTSEL - EINSTELLUNGEN
   Hier legst du fest, wann sich das Rätsel
   freischaltet und was danach angezeigt wird.
====================================== */

const streamRaetselConfig = {
  // Freischalt-Datum (Format: "JJJJ-MM-TTTHH:MM:SS")
  unlockDate: "2026-08-10T00:00:00",

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
  redLockCombination: "123",
  blackLockCombination: "456",

  // Text, der erscheint, wenn beide Schlösser offen sind
  finaleText: "Danke für alles Dave und Chat ihr seid die besten!",

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
