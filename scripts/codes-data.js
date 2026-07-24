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
    code: "13123",
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
  {
    code: "010123",
    message: "Den ersten Hinweis hast du also geknackt. Mal sehen wie alt du bist: XHMNKKKFMWJW",
  },
  {
    code: "Schifffahrer",
    message: "Du bist auf einem guten Weg, am 20.07. gehts weiter.",
  },
  {
    code: "Sturmflut",
    message: "Glückwunsch, zu deinem Glücksradgewinn, merke dir diese 4 Ziffern für ein Game in Roblox: 9562",
  },
  {
    code: "01864",
    message: "Glückwunsch Seemann nun etwas schwerer löse dieses Rätsel:", 
    image: "scripts/image/raetsel1.png",
  },
  {
    code: "Roma",
    message: "Wo liege ich genau, finde mich doch und trau dich mich zu suchen",
  },
  {
    code: "4112",
    message: "Du hast das nächste Tägliche geschafft, Glückwunsch",
  },
  {
    code: "00357",
    message: "von oben...", 
    image: "scripts/image/raetsel2.png",
  },
  {
    code: "6119P",
    message: "Du hast dich für das erste Gewinnspiel registriert, Glückwunsch",
  },
];

// Nachricht, wenn der Code nicht gefunden wurde
const codeNotFoundMessage = "❌ Dieser Code ist ungültig. Versuch es nochmal!";
