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

  // Mysteriöse Hintergrundmusik für diese Seite - genau wie bei
  // der Home-Playlist: beliebig viele Songs eintragen, sie werden
  // in zufälliger Reihenfolge gespielt (kein Song doppelt, bis
  // alle einmal dran waren), dann mischt sich die nächste Runde
  // neu. Pfade relativ zur index.html.
  musicPlaylist: [
    "scripts/streamraetsel/musik/Nebel_über_Kiel.mp3",
    "scripts/streamraetsel/musik/Nachtkasse.mp3",
    "scripts/streamraetsel/musik/Unter_dem_Siegel.mp3",
  ],
};
