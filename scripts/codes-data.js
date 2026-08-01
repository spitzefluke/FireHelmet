/* ======================================
   CODE DATENBANK
   ---------------------------------------------------
   SICHERHEITSHINWEIS: Codes stehen hier absichtlich NICHT
   mehr im Klartext, sondern als SHA-256-Hash. So kann niemand
   einfach diese Datei öffnen (z.B. über GitHub oder die
   Browser-Konsole) und alle Lösungen direkt ablesen - man
   MUSS den echten Code kennen bzw. erraten.

   NEUEN CODE HINZUFÜGEN:
   Öffne die Konsole (F12) auf irgendeiner Seite und tippe:

     crypto.subtle.digest("SHA-256", new TextEncoder().encode("deincode"))
       .then(buf => console.log(
         [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("")
       ));

   ("deincode" durch deinen neuen Code ersetzen, klein geschrieben -
   Groß-/Kleinschreibung spielt beim Einlösen später keine Rolle)
   Den ausgegebenen Hash dann unten bei "hash" eintragen.
   ---------------------------------------------------

   Optional: "image" hinzufügen, um bei diesem Code zusätzlich
   ein Bild anzuzeigen. Pfad relativ zur index.html.

   Optional: "reward" hinzufügen, wenn dieser Code einen ECHTEN
   Gewinn auslöst - erscheint dann als Gewinn-Spalte in der
   Rangliste.

   Optional: "speak: true" hinzufügen, damit die Nachricht beim
   Einlösen laut vorgelesen wird (automatisch auf Deutsch oder
   Englisch, je nach eingestellter Sprache). Falls der Vorlese-
   text anders sein soll als der angezeigte Text, zusätzlich
   "speakText: "..."" angeben.
====================================== */

const codes = [
  {
    hash: "280d44ab1e9f79b5cce2dd4f58f5fe91f0fbacdac9f7447dffc318ceb79f2d02", // welcome
    message: "Willkommen an Bord, Crewmitglied! 🏴‍☠️ Du hast den ersten Geheimcode geknackt.",
    speak: true, // Beispiel: wird beim Einlösen laut vorgelesen
  },
  {
    hash: "c1d6e4fc7422656509d6988df576d75c439f2102297cc477633a02bb7d190c12", // 13123
    message: "Du bist ein kluger Mensch hier dein nächster Vorteil: 11490, löse ihn auf der Fortnite Map ein.",
  },
  {
    hash: "e0af15d9ad392edc65976d234fa29fb509394a1fd4e3533acd0b22b72349d26f", // 20891
    message: "Ich bin zwar nicht groß doch bin immer zu sehen",
  },
  {
    hash: "2c70e12b7a0646f92279f427c7b38e7334d8e5389cff167a1dc30e73f826b683", // key
    message: "PS: Schau auf Youtube",
    // Beispiel: image: "scripts/images/key-hinweis.png",
  },
  {
    hash: "61ea0803f8853523b777d414ace3130cd4d3f92de2cd7ff8695c337d79c2eeee", // dave
    message: "Ah du bist also ein Mitglied der Flitzpiepen, dann bekommst du einen ersten Hinweis für einen Gewinn im Wert von 2500 VBucks !  Der Hinweis liegt im Twitch Account vom besten Mod vom Zugfahrer_Dave",
    reward: "2500 VBucks-Hinweis",
  },
  {
    hash: "59a853d277efc60873b2b9691ffa0e652e3d76b7196844beef971105447ddc00", // 010123
    message: "Den ersten Hinweis hast du also geknackt. Mal sehen wie alt du bist: XHMNKKKFMWJW",
  },
  {
    hash: "b63814c6f67f93b490e15534af1e134421bfa76280d6546c38bedc018b1bd7a2", // schifffahrer
    message: "Du bist auf einem guten Weg, am 20.07. gehts weiter.",
  },
  {
    hash: "ec6820622d6388215f724a89365d214c25666a951f90b3322e730713bfbd1eec", // sturmflut
    message: "Glückwunsch, zu deinem Glücksradgewinn, merke dir diese 4 Ziffern für ein Game in Roblox: 9562",
    reward: "Roblox-Code",
  },
  {
    hash: "099ef95be2a4db34c612f6326988690bd92b53c4b08d9b53f447c892597c7b5a", // 01864
    message: "Glückwunsch Seemann nun etwas schwerer löse dieses Rätsel:",
    image: "scripts/image/raetsel1.png",
  },
  {
    hash: "b0c27fca74fa91934900c9ffcb3dcca5b807a3c059a3b516cdd0788807b5ff49", // roma
    message: "Wo liege ich genau, finde mich doch und trau dich mich zu suchen",
  },
  {
    hash: "059f5e543bd484b00e235edc5083558c59d45706bd99c14422bda8868c6c6f90", // 4112
    message: "Du hast das nächste Tägliche geschafft, Glückwunsch",
  },
  {
    hash: "174f91e07e02eda58bb2c14a4cfbd85efdc2de378f3ff7d09c57123758769080", // 00387
    message: "von oben...",
    image: "scripts/image/raetsel2.png",
  },
  {
    hash: "9d030edcde5e56001ba919be683b8f7ddacf7cd4a0f991448d7b792594a71daa", // 6119p
    message: "Du hast dich für das erste Gewinnspiel registriert, Glückwunsch. Schicke ein Bild an spitzefluke@gmail.com oder in den Discord Helme und Züge.",
    reward: "Gewinnspiel-Teilnahme",
  },
  {
    hash: "c478361e6869af25970682a2c53967adbc8a46e9429efdc64b96351cfd52e13f", // Story
    message: "Arr ich freue mich schon die Fracht abzuladen und fröhlich nach Hause zu fahren.",
    speak: true,
  },
];

// Nachricht, wenn der Code nicht gefunden wurde
const codeNotFoundMessage = "❌ Dieser Code ist ungültig. Versuch es nochmal!";
