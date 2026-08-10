/* ======================================
   PROFILBILDER FÜR DIE ANONYME ANMELDUNG
   Wer sich nur mit einem Namen anmeldet (ohne Twitch/Discord),
   kann sich eines dieser Bilder als Profilbild aussuchen - es
   erscheint dann auch in der Rangliste.

   Zwei Arten von Einträgen sind möglich:
   - Ein Emoji als Text, z.B. "🏴‍☠️" - braucht keine Bilddatei
   - Ein Bildpfad relativ zur index.html - für eigene Bilder,
     die du selbst erstellt hast. Leg deine Bilder in den Ordner
     scripts/avatare/ und trag hier den Pfad ein, z.B.:
     "scripts/avatare/pirat-1.png"

   Trage hier beliebig viele Einträge ein, gerne mischen.
====================================== */

const wheelAvatarOptions = [
  "🏴‍☠️",
  "⚓",
  "🦜",
  "🗺️",
  "💰",
  "🔱",
  "🐙",
  "⛵",
  "💀",
  "🌊",
  "🦑",
  "🏝️",

  // Eigene Bilder - liegen in scripts/avatare/, hier den Pfad eintragen:
  // "scripts/avatare/pirat-1.png",
  // "scripts/avatare/pirat-2.png",
];
