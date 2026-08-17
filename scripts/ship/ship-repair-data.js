/* ======================================================
   "REPARIERE DAS SCHIFF" - EVENT-DATEN
   ---------------------------------------------------
   Reine Konfiguration, keine Logik (die lebt in
   scripts/ship/ship-repair.js). Der Freischalt-Zeitpunkt
   selbst steht zentral in FIRE_HELMET_CONFIG.shipEventUnlockDate
   (scripts/core/fire-helmet-config.js).
====================================================== */

/* ------------------------------------------------------
   WERKZEUGE
   "id" wird 1:1 als Firestore-Feldname (players/{uid}.shipTools.<id>)
   UND als Wert von codes-data.js "toolUnlock" verwendet - nicht
   mehr ändern, sobald Codes/Spielstände damit verlinkt sind.
------------------------------------------------------ */
const SHIP_TOOLS = {
  hammer: { id: "hammer", emoji: "🔨", label: { de: "Hammer", en: "Hammer" } },
  saw: { id: "saw", emoji: "🪚", label: { de: "Säge", en: "Saw" } },
  brush: { id: "brush", emoji: "🖌️", label: { de: "Pinsel", en: "Brush" } },
};

/* ------------------------------------------------------
   REPARATURPHASEN
   Werden IN DIESER REIHENFOLGE freigeschaltet - Phase n+1 kann
   erst begonnen werden, wenn Phase n abgeschlossen ist. Jede
   Phase erzeugt eine eigene sichtbare Veränderung am Schiff
   (siehe .fh-ship-repair-hull/-mast/-sails/-rudder/-details in
   style.css, gesteuert über completedPhases).
------------------------------------------------------ */
const SHIP_REPAIR_PHASES = [
  {
    id: "hull",
    tool: "saw",
    label: { de: "Rumpf reparieren", en: "Repair the hull" },
    description: {
      de: "Löcher im Rumpf klaffen unter der Wasserlinie - ohne neue Planken sinkt die Flitzpiepen beim ersten Schwell.",
      en: "Gaping holes below the waterline - without new planks the Flitzpiepen sinks at the first swell.",
    },
    doneLabel: { de: "⚒ Der Rumpf hält wieder dicht!", en: "⚒ The hull is watertight again!" },
  },
  {
    id: "mast",
    tool: "hammer",
    label: { de: "Mast reparieren", en: "Repair the mast" },
    description: {
      de: "Der Hauptmast ist mittendurch gebrochen. Ohne ihn kann kein Segel mehr Wind fangen.",
      en: "The main mast is snapped in half. Without it, no sail can catch the wind.",
    },
    doneLabel: { de: "⚒ Der Mast steht wieder!", en: "⚒ The mast stands tall again!" },
  },
  {
    id: "sails",
    tool: "brush",
    label: { de: "Segel reparieren", en: "Repair the sails" },
    description: {
      de: "Die Segel hängen in Fetzen von den Rahen. Zeit, die Risse zu flicken.",
      en: "The sails hang in tatters from the yards. Time to patch the tears.",
    },
    doneLabel: { de: "⚒ Die Segel füllen sich mit Wind!", en: "⚒ The sails are filling with wind!" },
  },
  {
    id: "rudder",
    tool: "saw",
    label: { de: "Ruder reparieren", en: "Repair the rudder" },
    description: {
      de: "Das Ruder hängt nur noch an einer Angel - ohne es treibt das Schiff steuerlos.",
      en: "The rudder hangs on by a single hinge - without it the ship drifts, unsteerable.",
    },
    doneLabel: { de: "⚒ Das Ruder gehorcht wieder!", en: "⚒ The rudder answers the helm again!" },
  },
  {
    id: "details",
    tool: "brush",
    label: { de: "Details & Anstrich", en: "Details & paint" },
    description: {
      de: "Schrammen, verblasste Farbe, ein zerzaustes Flaggentuch - die Flitzpiepen braucht ihren Glanz zurück.",
      en: "Scratches, faded paint, a tattered flag - the Flitzpiepen needs her shine back.",
    },
    doneLabel: { de: "⚒ Frischer Anstrich, neuer Glanz!", en: "⚒ Fresh paint, new shine!" },
  },
  {
    id: "final",
    tool: "hammer",
    label: { de: "Letzte Reparatur", en: "Final repair" },
    description: {
      de: "Die letzten Nägel, die letzten Handgriffe - dann ist die Flitzpiepen wieder seetüchtig.",
      en: "The last nails, the last touches - then the Flitzpiepen is seaworthy again.",
    },
    doneLabel: { de: "⚓ DIE FLITZPIEPEN IST WIEDER SEETÜCHTIG!", en: "⚓ THE FLITZPIEPEN IS SEAWORTHY AGAIN!" },
  },
];

/* ------------------------------------------------------
   ZUFÄLLIGE REPARATURDAUER (Millisekunden)
   Siehe getRandomRepairDurationMs() in ship-repair.js.
------------------------------------------------------ */
const SHIP_REPAIR_DURATION_MIN_MS = 30 * 60 * 1000;   // 30 Minuten
const SHIP_REPAIR_DURATION_MAX_MS = 6 * 60 * 60 * 1000; // 6 Stunden

/* ------------------------------------------------------
   RÄTSEL-BANK
   "reward" muss einer SHIP_TOOLS-ID entsprechen. "rewardCode"
   ist der Code, der nach richtiger Antwort angezeigt wird UND
   in scripts/codes/codes-data.js als eigener Eintrag mit
   passendem "toolUnlock" registriert sein muss (siehe dort) -
   das Rätsel-System selbst schaltet NICHTS frei, es zeigt nur
   den Code an, den man danach ganz normal auf der Codes-Seite
   eingibt (Punkt 13: bestehendes Codes-System weiterverwenden).
   Antworten werden klein geschrieben/getrimmt verglichen.
   Beliebig erweiterbar - siehe Punkt 11 des Auftrags.
------------------------------------------------------ */
const SHIP_PUZZLES = [
  {
    id: "captains-riddle-voice",
    question: {
      de: "Ich habe keine Stimme, doch ich erzähle Geschichten. Ich habe keine Beine, doch ich reise um die Welt. Was bin ich?",
      en: "I have no voice, yet I tell stories. I have no legs, yet I travel the world. What am I?",
    },
    answers: { de: ["buch", "ein buch"], en: ["book", "a book"] },
    reward: "hammer",
    rewardCode: "HAMMER-7K4X",
  },
  {
    id: "captains-riddle-candle",
    question: {
      de: "Je öfter du mich benutzt, desto kleiner werde ich. Manchmal spende ich Licht in dunkler Nacht. Was bin ich?",
      en: "The more you use me, the smaller I get. Sometimes I bring light on a dark night. What am I?",
    },
    answers: { de: ["kerze", "eine kerze"], en: ["candle", "a candle"] },
    reward: "hammer",
    rewardCode: "HAMMER-9D2L",
  },
  {
    id: "captains-riddle-hole",
    question: {
      de: "Je mehr du von mir nimmst, desto größer werde ich. Was bin ich?",
      en: "The more you take from me, the bigger I get. What am I?",
    },
    answers: { de: ["loch", "ein loch", "grube"], en: ["hole", "a hole", "pit"] },
    reward: "saw",
    rewardCode: "SAEGE-3Q9P",
  },
  {
    id: "captains-riddle-rooster",
    question: {
      de: "Ich habe einen Kamm, doch kein einziges Haar, und krähe jeden Morgen, das ist wahr. Was bin ich?",
      en: "I have a comb but not a single hair, and I crow each morning, I do declare. What am I?",
    },
    answers: { de: ["hahn", "ein hahn"], en: ["rooster", "a rooster", "cock"] },
    reward: "saw",
    rewardCode: "SAEGE-6T1V",
  },
  {
    id: "captains-riddle-towel",
    question: {
      de: "Ich werde nass, während ich trockne. Was bin ich?",
      en: "I get wet while drying. What am I?",
    },
    answers: { de: ["handtuch", "ein handtuch"], en: ["towel", "a towel"] },
    reward: "brush",
    rewardCode: "PINSEL-5R2M",
  },
  {
    id: "captains-riddle-stairs",
    question: {
      de: "Ich falle nie, doch ich habe viele Stufen. Was bin ich?",
      en: "I never fall, yet I have many steps. What am I?",
    },
    answers: { de: ["treppe", "eine treppe"], en: ["staircase", "a staircase", "stairs"] },
    reward: "brush",
    rewardCode: "PINSEL-8W4N",
  },
];
