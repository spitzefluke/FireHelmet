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
    code: "12035",
    message: "Du bist ein kluger Mensch hier dein nächster Vorteil: 11490",
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
];

// Nachricht, wenn der Code nicht gefunden wurde
const codeNotFoundMessage = "❌ Dieser Code ist ungültig. Versuch es nochmal!";
