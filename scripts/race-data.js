/* ======================================
   WOCHENRENNEN - EINSTELLUNGEN
   Hier kannst du anpassen, wie viel Fortschritt
   welche Aktion bringt, und wie viele Plätze in
   der Rennanzeige angezeigt werden.
====================================== */

const raceConfig = {
  progressPerSpin: 10,   // Fortschritt pro Schatzrad-Drehung
  progressPerCode: 15,   // Fortschritt pro NEU geknacktem Code
  dailyBonusProgress: 8, // Fortschritt für den täglichen Rennen-Bonus
  finishLine: 150,       // Fortschritt, bei dem die Strecke visuell "voll" ist
  topPlayersShown: 8,    // Wie viele Plätze im Rennen angezeigt werden
};

/* ======================================
   RENNSTRECKEN
   Jede Woche wird automatisch eine dieser
   Strecken ausgewählt (reihum, für alle
   Besucher gleich). Füge gerne weitere hinzu -
   die Reihenfolge wiederholt sich einfach.
====================================== */
const raceTracks = [
  {
    name: "Ozean-Oval",
    emoji: "🌊",
    grass: "#173a1e",
    roadOuter: "#2b2b2b",
    roadInner: "#3f3f3f",
    curb: "#4da3ff",
    accent: "#4da3ff",
    path: "M100,50 L500,50 A100,100 0 0 1 500,250 L100,250 A100,100 0 0 1 100,50 Z",
  },
  {
    name: "Wüsten-Circuit",
    emoji: "🏜️",
    grass: "#5a4426",
    roadOuter: "#3a2c1a",
    roadInner: "#54402a",
    curb: "#ffd76b",
    accent: "#ffd76b",
    path: "M130,40 L470,40 A110,110 0 0 1 470,260 L130,260 A110,110 0 0 1 130,40 Z",
  },
  {
    name: "Dschungel-Loop",
    emoji: "🌴",
    grass: "#0f2e1a",
    roadOuter: "#2b2b2b",
    roadInner: "#3f3f3f",
    curb: "#4ade80",
    accent: "#4ade80",
    path: "M60,80 L540,80 A70,70 0 0 1 540,220 L60,220 A70,70 0 0 1 60,80 Z",
  },
  {
    name: "Nacht-Neon",
    emoji: "🌙",
    grass: "#0a0a1a",
    roadOuter: "#1a1a2e",
    roadInner: "#2a2a4a",
    curb: "#a855f7",
    accent: "#a855f7",
    path: "M160,50 L440,50 A60,60 0 0 1 500,110 L500,190 A60,60 0 0 1 440,250 L160,250 A60,60 0 0 1 100,190 L100,110 A60,60 0 0 1 160,50 Z",
  },
];
