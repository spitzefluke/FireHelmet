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

   "vehicle" bestimmt, welches Fahrzeug gezeichnet
   wird: "car" (Kart), "boat" (Segelboot) oder
   "plane" (Flugzeug).
====================================== */
const raceTracks = [
  {
    name: "Ozean-Oval",
    emoji: "🏎️",
    vehicle: "car",
    grass: "#173a1e",
    roadOuter: "#2b2b2b",
    roadInner: "#3f3f3f",
    curb: "#4da3ff",
    accent: "#4da3ff",
    path: "M100,50 L500,50 A100,100 0 0 1 500,250 L100,250 A100,100 0 0 1 100,50 Z",
  },
  {
    name: "Wüsten-Circuit",
    emoji: "🏎️",
    vehicle: "car",
    grass: "#5a4426",
    roadOuter: "#3a2c1a",
    roadInner: "#54402a",
    curb: "#ffd76b",
    accent: "#ffd76b",
    path: "M130,40 L470,40 A110,110 0 0 1 470,260 L130,260 A110,110 0 0 1 130,40 Z",
  },
  {
    name: "Dschungel-Loop",
    emoji: "🏎️",
    vehicle: "car",
    grass: "#0f2e1a",
    roadOuter: "#2b2b2b",
    roadInner: "#3f3f3f",
    curb: "#4ade80",
    accent: "#4ade80",
    path: "M60,80 L540,80 A70,70 0 0 1 540,220 L60,220 A70,70 0 0 1 60,80 Z",
  },
  {
    name: "Nacht-Neon",
    emoji: "🏎️",
    vehicle: "car",
    grass: "#0a0a1a",
    roadOuter: "#1a1a2e",
    roadInner: "#2a2a4a",
    curb: "#a855f7",
    accent: "#a855f7",
    path: "M160,50 L440,50 A60,60 0 0 1 500,110 L500,190 A60,60 0 0 1 440,250 L160,250 A60,60 0 0 1 100,190 L100,110 A60,60 0 0 1 160,50 Z",
  },
  {
    // Großer, offener Ring statt einer engen Rundstrecke - passt zum
    // "Hochsee"-Thema (weites offenes Wasser) und ist bewusst eine
    // andere Form als der Ozean-Oval (Punkt 36: nicht nur Farbe ändern).
    name: "Hochsee-Regatta",
    emoji: "⛵",
    vehicle: "boat",
    grass: "#0a2740",
    roadOuter: "#123a5c",
    roadInner: "#1c5a8c",
    curb: "#e6f4ff",
    accent: "#7dd3fc",
    path: "M60,60 L540,60 A80,80 0 0 1 540,240 L60,240 A80,80 0 0 1 60,60 Z",
  },
  {
    name: "Wolken-Rennen",
    emoji: "✈️",
    vehicle: "plane",
    grass: "#a8d4f0",
    roadOuter: "#7fb8dd",
    roadInner: "#9ecdec",
    curb: "#ffffff",
    accent: "#ffffff",
    path: "M130,40 L470,40 A110,110 0 0 1 470,260 L130,260 A110,110 0 0 1 130,40 Z",
  },
  {
    // Enge Schlangenlinie durchs Riff - Boot muss um die Felsen herum
    // weichen (Punkt 33: "enge Schlangenlinie")
    name: "Riff-Zickzack",
    emoji: "🪨",
    vehicle: "boat",
    grass: "#2a1a0f",
    roadOuter: "#3a2a1a",
    roadInner: "#4a3624",
    curb: "#ff9f4d",
    accent: "#ff9f4d",
    path: "M100,70 L180,110 L260,70 L340,110 L420,70 L500,110 L520,160 L500,210 L420,170 L340,210 L260,170 L180,210 L100,170 L80,120 Z",
  },
  {
    // Wellige Doppel-S-Form durch dichten Nebel (Punkt 33: "große S-Kurve")
    name: "Nebelschlange",
    emoji: "🌫️",
    vehicle: "boat",
    grass: "#1a2530",
    roadOuter: "#2a3a48",
    roadInner: "#3a4e5e",
    curb: "#cfe3ee",
    accent: "#8fb4c4",
    path: "M90,150 C90,90 150,70 220,80 C290,90 310,90 380,80 C450,70 510,90 510,150 C510,210 450,230 380,220 C310,210 290,210 220,220 C150,230 90,210 90,150 Z",
  },
  {
    // Vielecke Wendungen für eine "komplexe technische Strecke"
    // (Punkt 33) - als Flug-Route durch ein Gewitter inszeniert.
    name: "Sturmkurs",
    emoji: "⛈️",
    vehicle: "plane",
    grass: "#14141f",
    roadOuter: "#232338",
    roadInner: "#333350",
    curb: "#a855f7",
    accent: "#c084fc",
    path: "M300,69.4 L350,107.4 L423.6,125.1 L380.8,166.3 L376.4,215.2 L300,202.7 L223.6,215.2 L219.2,166.3 L176.4,125.1 L250,107.4 Z",
  },
];
