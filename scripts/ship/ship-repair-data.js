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
   REPARATUR-ETAPPEN
   Werden IN DIESER REIHENFOLGE freigeschaltet - Etappe n+1 kann
   erst begonnen werden, wenn Etappe n abgeschlossen ist. "id"
   bleibt aus Kompatibilitätsgründen bei den ursprünglichen
   Werten (hull/mast/sails/rudder), da darüber sowohl die
   sichtbaren Schiffsteile in style.css (.fh-phase-<id>-done)
   als auch die Werkzeugzuordnung verlinkt sind - nur "label"/
   "description"/"stageNumber" wurden an die 5 neuen Etappen-
   Namen angepasst. "inspect" ist eine reine Fortschritts-Etappe
   ohne eigenes Schiffsteil (Schadensanalyse). Die letzte Etappe
   ("rudder"/Abschlusstest) löst zusätzlich die Flaggen- und
   Glanz-Effekte aus (siehe .fh-phase-rudder-done in style.css).
------------------------------------------------------ */
const SHIP_REPAIR_PHASES = [
  {
    id: "inspect",
    stageNumber: 1,
    tool: "hammer",
    label: { de: "Schaden untersuchen", en: "Inspect the damage" },
    description: {
      de: "Bevor auch nur ein Nagel eingeschlagen wird, muss die Crew wissen, wie schlimm es wirklich steht.",
      en: "Before a single nail is driven, the crew needs to know just how bad the damage really is.",
    },
    doneLabel: { de: "⚒ Der Schaden ist begutachtet - los geht's!", en: "⚒ Damage assessed - let's get to work!" },
  },
  {
    id: "hull",
    stageNumber: 2,
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
    stageNumber: 3,
    tool: "hammer",
    label: { de: "Antrieb reparieren", en: "Repair the propulsion" },
    description: {
      de: "Der Hauptmast ist mittendurch gebrochen. Ohne ihn kann kein Segel mehr Wind fangen und das Schiff kommt nicht vom Fleck.",
      en: "The main mast is snapped in half. Without it, no sail can catch the wind and the ship goes nowhere.",
    },
    doneLabel: { de: "⚒ Der Antrieb funktioniert wieder!", en: "⚒ The propulsion works again!" },
  },
  {
    id: "sails",
    stageNumber: 4,
    tool: "brush",
    label: { de: "Systeme reparieren", en: "Repair the systems" },
    description: {
      de: "Segel, Takelage und die restlichen Bordsysteme hängen in Fetzen. Zeit, alles wieder instand zu setzen.",
      en: "Sails, rigging and the rest of the ship's systems are in tatters. Time to patch it all up.",
    },
    doneLabel: { de: "⚒ Die Systeme laufen wieder rund!", en: "⚒ The systems are running smoothly again!" },
  },
  {
    id: "rudder",
    stageNumber: 5,
    tool: "saw",
    label: { de: "Abschlusstest", en: "Final check" },
    description: {
      de: "Das Ruder wird geprüft und die ganze Flitzpiepen ein letztes Mal von Bug bis Heck kontrolliert.",
      en: "The rudder gets checked and the whole Flitzpiepen is inspected one last time, bow to stern.",
    },
    doneLabel: { de: "⚓ SCHIFF VOLLSTÄNDIG REPARIERT!", en: "⚓ SHIP FULLY REPAIRED!" },
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
