/* ======================================
   ??? - EINSTELLUNGEN
   Hier legst du fest, wann sich die Seite freischaltet,
   was danach angezeigt wird, und welche mysteriöse Musik
   im Hintergrund läuft.
====================================== */

const streamRaetselConfig = {
  // Freischalt-Datum (Format: "JJJJ-MM-TTTHH:MM:SS")
  unlockDate: "2026-08-25T00:00:00",

  // Wird erst NACH dem Freischalten angezeigt
  title: "Das Geheimnis",
  description:
    "Willkommen! Trage hier den eigentlichen Text, Hinweise oder Bilder ein, " +
    "sobald es losgeht.",

  // Optional: Bild anzeigen (Pfad relativ zur index.html), sonst leer lassen
  image: "",

  // Mysteriöse Hintergrundmusik für diese Seite (Pfad relativ zur
  // index.html), z.B. "scripts/streamraetsel/mystery-musik.mp3".
  // Leer lassen = keine Musik.
  musicSrc: "",
};
