/* ======================================
   STREAMRÄTSEL - EINSTELLUNGEN
   Hier legst du fest, wann sich das Rätsel
   freischaltet und was danach angezeigt wird.
====================================== */

const streamRaetselConfig = {
  // Freischalt-Datum (Format: "JJJJ-MM-TTTHH:MM:SS")
  unlockDate: "2026-08-10T00:00:00",

  // Wird erst NACH dem Freischalten angezeigt
  title: "Das Streamrätsel",
  description:
    "Willkommen beim Streamrätsel! Trage hier den eigentlichen Rätseltext, " +
    "Hinweise oder Bilder ein, sobald es losgeht.",

  // Optional: Bild anzeigen (Pfad relativ zur index.html), sonst leer lassen
  image: "",
};
