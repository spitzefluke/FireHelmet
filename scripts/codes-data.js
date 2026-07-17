/* ======================================
   CODE DATENBANK
   Hier kannst du beliebig viele Codes und
   die dazugehörige Nachricht eintragen.
   Groß-/Kleinschreibung ist egal.

   Optional: "image" hinzufügen, um bei
   diesem Code zusätzlich ein Bild anzuzeigen.
   Pfad ist relativ zur index.html, z.B.
   "scripts/images/hinweis1.png"
====================================== */

const codes = [
  {
    code: "Welcome",
    message: "Willkommen an Bord, Crewmitglied! 🏴‍☠️ Du hast den ersten Geheimcode geknackt.",
  },
  {
    code: "10123",
    message: "Du bist ein kluger Mensch hier dein nächster Vorteil: 11490, löse ihn auf der Fortnite Map ein.",
  },
  {
    code: "20891",
    message: "Ich bin zwar nicht groß doch bin immer zu sehen",
  },
  {
    code: "KEY",
    message: "PS: Schau auf Youtube",
    // Beispiel: image: "scripts/images/key-hinweis.png",
  },
  {
    code: "Dave",
    message: "Ah du bist also ein Mitglied der Flitzpiepen, dann bekommst du einen ersten Hinweis für einen Gewinn im Wert von 2500 VBucks !  Der Hinweis liegt im Twitch Account vom besten Mod vom Zugfahrer_Dave",
  },
];

// Nachricht, wenn der Code nicht gefunden wurde
const codeNotFoundMessage = "❌ Dieser Code ist ungültig. Versuch es nochmal!";
