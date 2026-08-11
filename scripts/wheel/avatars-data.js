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
  "scripts/avatare/5.png",
  "scripts/avatare/6.png",
  "scripts/avatare/1.png",
  "scripts/avatare/2.png",
  "scripts/avatare/3.png",
  "scripts/avatare/4.png",
  "scripts/avatare/7.png",
  "⛵",
  "💀",
  "🌊",
  "🦑",
  "🏝️",

  // Eigene Bilder - liegen in scripts/avatare/, hier den Pfad eintragen:
  // "scripts/avatare/pirat-1.png",
  // "scripts/avatare/pirat-2.png",
];

/* ======================================
   FREISCHALTBARE SPEZIAL-AVATARE
   Diese Avatare sind zu Beginn GESPERRT und erscheinen im
   Auswahl-Menü mit einem Schloss-Symbol. Erst wer den
   passenden Code einlöst, schaltet sie dauerhaft frei.

   So verknüpfst du einen Code damit:
   1. Trag hier einen Eintrag mit einer eigenen "id" ein
      (frei wählbar, aber einmalig, z.B. "gold-pirat")
   2. Geh in scripts/codes/codes-data.js zu dem Code, der den
      Avatar freischalten soll, und ergänze dort das Feld
      avatarUnlock: "gold-pirat"  (also genau dieselbe id)

   "avatar" kann wieder ein Emoji ODER ein Bildpfad
   (scripts/avatare/...) sein.
====================================== */

const wheelSpecialAvatars = [
  { id: "gold-pirat", avatar: "🏆", label: "Gold-Pirat" },
  { id: "kraken", avatar: "🐲", label: "Kraken-Bezwinger" },

  // Eigene Beispiele:
  // { id: "legendaer", avatar: "scripts/avatare/legendaer.png", label: "Legendärer Pirat" },
];
