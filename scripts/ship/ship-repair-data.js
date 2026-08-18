/* ======================================================
   "REPARIERE DAS SCHIFF" - EVENT-DATEN
   ---------------------------------------------------
   Reine Konfiguration, keine Logik (die lebt in
   scripts/ship/ship-repair.js). Der Freischalt-Zeitpunkt
   selbst steht zentral in FIRE_HELMET_CONFIG.shipEventUnlockDate
   (scripts/core/fire-helmet-config.js).
====================================================== */

/* ------------------------------------------------------
   WERKZEUGE (20 Stück, je eins pro Reparatur-Etappe UND
   je eins pro Tagesquest - siehe DAILY_QUESTS unten)
   "id" wird 1:1 als Firestore-Feldname (players/{uid}.shipTools.<id>)
   UND als Wert von codes-data.js "toolUnlock" verwendet - nicht
   mehr ändern, sobald Codes/Spielstände damit verlinkt sind.
   hammer/saw/brush sind die URSPRÜNGLICHEN 3 Werkzeuge (weiterhin
   auch über die bestehenden Kapitäns-Rätsel/Codes erhältlich, siehe
   SHIP_PUZZLES unten) - die anderen 17 kommen NUR über die neuen
   Tagesquests (siehe DAILY_QUESTS).
------------------------------------------------------ */
const SHIP_TOOLS = {
  spyglass: { id: "spyglass", emoji: "🔭", label: { de: "Fernrohr", en: "Spyglass" } },
  toolbox: { id: "toolbox", emoji: "🧰", label: { de: "Werkzeugkasten", en: "Toolbox" } },
  hammer: { id: "hammer", emoji: "🔨", label: { de: "Hammer", en: "Hammer" } },
  sealant: { id: "sealant", emoji: "🧴", label: { de: "Dichtmittel", en: "Sealant" } },
  saw: { id: "saw", emoji: "🪚", label: { de: "Säge", en: "Saw" } },
  cableSet: { id: "cableSet", emoji: "🔌", label: { de: "Kabelsatz", en: "Cable set" } },
  fuse: { id: "fuse", emoji: "🧯", label: { de: "Ersatzsicherung", en: "Spare fuse" } },
  multimeter: { id: "multimeter", emoji: "📟", label: { de: "Multimeter", en: "Multimeter" } },
  oilCan: { id: "oilCan", emoji: "🛢️", label: { de: "Ölkanne", en: "Oil can" } },
  screwdriver: { id: "screwdriver", emoji: "🪛", label: { de: "Schraubendreher", en: "Screwdriver" } },
  coolant: { id: "coolant", emoji: "❄️", label: { de: "Kühlmittel", en: "Coolant" } },
  fuelFilter: { id: "fuelFilter", emoji: "⛽", label: { de: "Kraftstofffilter", en: "Fuel filter" } },
  wrench: { id: "wrench", emoji: "🔧", label: { de: "Schraubenschlüssel", en: "Wrench" } },
  antenna: { id: "antenna", emoji: "📡", label: { de: "Antenne", en: "Antenna" } },
  compass: { id: "compass", emoji: "🧭", label: { de: "Kompass", en: "Compass" } },
  circuitChip: { id: "circuitChip", emoji: "💾", label: { de: "Prozessorchip", en: "Circuit chip" } },
  brush: { id: "brush", emoji: "🖌️", label: { de: "Pinsel", en: "Brush" } },
  safetyKit: { id: "safetyKit", emoji: "🦺", label: { de: "Sicherheitsausrüstung", en: "Safety kit" } },
  testKit: { id: "testKit", emoji: "📋", label: { de: "Test-Protokoll", en: "Test kit" } },
  captainsSeal: { id: "captainsSeal", emoji: "🏅", label: { de: "Kapitänssiegel", en: "Captain's seal" } },
};

/* ------------------------------------------------------
   REPARATUR-ETAPPEN (20 Stück)
   Werden IN DIESER REIHENFOLGE freigeschaltet - Etappe n+1 kann
   erst begonnen werden, wenn Etappe n abgeschlossen ist.

   Die IDs "hull"/"mast"/"sails"/"rudder" sind an genau 4 Etappen
   (4, 10, 16, 20) vergeben, weil DARÜBER die vorhandene Schiffs-
   Grafik gesteuert wird (.fh-phase-<id>-done in style.css, siehe
   buildShipRepairSvg()) - das bestehende Schiffs-SVG hat nur diese
   4 sichtbaren Bauteile, wird hier also unveraendert weiterverwendet
   und zeigt den Fortschritt an 4 sinnvollen Meilensteinen statt bei
   jeder einzelnen von 20 Etappen. Alle anderen 16 Etappen-IDs sind
   neu und lösen keine Grafik-Änderung aus (rein Fortschritt/Text).
------------------------------------------------------ */
const SHIP_REPAIR_PHASES = [
  {
    id: "analyze", stageNumber: 1, tool: "spyglass",
    label: { de: "Schaden analysieren", en: "Analyze the damage" },
    description: {
      de: "Bevor auch nur ein Nagel eingeschlagen wird, muss die Crew wissen, wie schlimm es wirklich steht.",
      en: "Before a single nail is driven, the crew needs to know just how bad the damage really is.",
    },
    doneLabel: { de: "⚒ Der Schaden ist begutachtet!", en: "⚒ Damage assessed!" },
  },
  {
    id: "prepareKit", stageNumber: 2, tool: "toolbox",
    label: { de: "Werkzeugkasten vorbereiten", en: "Prepare the toolbox" },
    description: {
      de: "Ohne griffbereites Werkzeug kommt keine Reparatur voran - alles wird sortiert und bereitgelegt.",
      en: "No repair gets anywhere without tools close at hand - everything gets sorted and laid out.",
    },
    doneLabel: { de: "⚒ Werkzeugkasten einsatzbereit!", en: "⚒ Toolbox ready to go!" },
  },
  {
    id: "secureHull", stageNumber: 3, tool: "hammer",
    label: { de: "Außenhülle sichern", en: "Secure the outer hull" },
    description: {
      de: "Lose Planken werden festgenagelt, bevor sich der Schaden bei der nächsten Welle noch vergrößert.",
      en: "Loose planks get nailed down before the next wave makes the damage even worse.",
    },
    doneLabel: { de: "⚒ Außenhülle gesichert!", en: "⚒ Outer hull secured!" },
  },
  {
    id: "hull", stageNumber: 4, tool: "sealant",
    label: { de: "Rumpf abdichten", en: "Seal the hull" },
    description: {
      de: "Löcher im Rumpf klaffen unter der Wasserlinie - ohne Dichtmittel sinkt die Flitzpiepen beim ersten Schwell.",
      en: "Gaping holes below the waterline - without sealant the Flitzpiepen sinks at the first swell.",
    },
    doneLabel: { de: "⚒ Der Rumpf hält wieder dicht!", en: "⚒ The hull is watertight again!" },
  },
  {
    id: "patchLeaks", stageNumber: 5, tool: "saw",
    label: { de: "Erste Lecks schließen", en: "Patch the first leaks" },
    description: {
      de: "Beschädigtes Holz wird herausgesägt und durch frische Planken ersetzt.",
      en: "Damaged wood gets sawn out and replaced with fresh planks.",
    },
    doneLabel: { de: "⚒ Erste Lecks geschlossen!", en: "⚒ First leaks patched!" },
  },
  {
    id: "wiring", stageNumber: 6, tool: "cableSet",
    label: { de: "Beschädigte Leitungen reparieren", en: "Repair damaged wiring" },
    description: {
      de: "Durchgescheuerte Leitungen werden aufgespürt und durch einen frischen Kabelsatz ersetzt.",
      en: "Frayed wiring gets tracked down and replaced with a fresh cable set.",
    },
    doneLabel: { de: "⚒ Leitungen repariert!", en: "⚒ Wiring repaired!" },
  },
  {
    id: "power", stageNumber: 7, tool: "fuse",
    label: { de: "Energieversorgung reparieren", en: "Repair the power supply" },
    description: {
      de: "Ohne Energie bleibt jedes Bordsystem dunkel - die Hauptversorgung muss wieder unter Strom.",
      en: "Without power, every onboard system stays dark - the main supply needs to be live again.",
    },
    doneLabel: { de: "⚒ Energieversorgung läuft wieder!", en: "⚒ Power supply back online!" },
  },
  {
    id: "fuses", stageNumber: 8, tool: "multimeter",
    label: { de: "Sicherungen ersetzen", en: "Replace the fuses" },
    description: {
      de: "Durchgebrannte Sicherungen werden mit dem Multimeter aufgespürt und ausgetauscht.",
      en: "Blown fuses get tracked down with the multimeter and swapped out.",
    },
    doneLabel: { de: "⚒ Sicherungen ersetzt!", en: "⚒ Fuses replaced!" },
  },
  {
    id: "propulsionInspect", stageNumber: 9, tool: "oilCan",
    label: { de: "Antrieb untersuchen", en: "Inspect the propulsion" },
    description: {
      de: "Bevor der Antrieb wieder anläuft, müssen alle beweglichen Teile geölt und geprüft werden.",
      en: "Before the propulsion runs again, every moving part needs to be oiled and checked.",
    },
    doneLabel: { de: "⚒ Antrieb untersucht!", en: "⚒ Propulsion inspected!" },
  },
  {
    id: "mast", stageNumber: 10, tool: "screwdriver",
    label: { de: "Antrieb reparieren", en: "Repair the propulsion" },
    description: {
      de: "Der Hauptmast ist mittendurch gebrochen. Ohne ihn kann kein Segel mehr Wind fangen und das Schiff kommt nicht vom Fleck.",
      en: "The main mast is snapped in half. Without it, no sail can catch the wind and the ship goes nowhere.",
    },
    doneLabel: { de: "⚒ Der Antrieb funktioniert wieder!", en: "⚒ The propulsion works again!" },
  },
  {
    id: "cooling", stageNumber: 11, tool: "coolant",
    label: { de: "Kühlung reparieren", en: "Repair the cooling" },
    description: {
      de: "Ohne Kühlung überhitzt der Antrieb schon nach wenigen Minuten - Kühlmittel muss nachgefüllt werden.",
      en: "Without cooling, the propulsion overheats within minutes - coolant needs to be topped up.",
    },
    doneLabel: { de: "⚒ Kühlung läuft wieder!", en: "⚒ Cooling back online!" },
  },
  {
    id: "fuelSystem", stageNumber: 12, tool: "fuelFilter",
    label: { de: "Treibstoffsystem reparieren", en: "Repair the fuel system" },
    description: {
      de: "Ein verstopfter Filter bremst den Antrieb aus - Zeit für einen frischen Kraftstofffilter.",
      en: "A clogged filter is choking the propulsion - time for a fresh fuel filter.",
    },
    doneLabel: { de: "⚒ Treibstoffsystem repariert!", en: "⚒ Fuel system repaired!" },
  },
  {
    id: "steering", stageNumber: 13, tool: "wrench",
    label: { de: "Steuerung reparieren", en: "Repair the steering" },
    description: {
      de: "Lockere Verbindungen in der Steuerung werden mit dem Schraubenschlüssel wieder festgezogen.",
      en: "Loose connections in the steering get tightened back down with the wrench.",
    },
    doneLabel: { de: "⚒ Steuerung repariert!", en: "⚒ Steering repaired!" },
  },
  {
    id: "comms", stageNumber: 14, tool: "antenna",
    label: { de: "Kommunikation reparieren", en: "Repair communications" },
    description: {
      de: "Ohne Antenne hört die Crew niemanden mehr - und niemand hört die Crew.",
      en: "Without an antenna, the crew can't hear anyone - and no one can hear the crew.",
    },
    doneLabel: { de: "⚒ Kommunikation wiederhergestellt!", en: "⚒ Communications restored!" },
  },
  {
    id: "navigation", stageNumber: 15, tool: "compass",
    label: { de: "Navigation reparieren", en: "Repair navigation" },
    description: {
      de: "Ein neuer Kompass sorgt dafür, dass die Flitzpiepen nicht mehr im Kreis fährt.",
      en: "A new compass makes sure the Flitzpiepen stops sailing in circles.",
    },
    doneLabel: { de: "⚒ Navigation repariert!", en: "⚒ Navigation repaired!" },
  },
  {
    id: "sails", stageNumber: 16, tool: "circuitChip",
    label: { de: "Bordcomputer reparieren", en: "Repair the ship's computer" },
    description: {
      de: "Segel, Takelage und die restlichen Bordsysteme hängen an einem einzigen durchgebrannten Chip.",
      en: "Sails, rigging and the rest of the ship's systems all hang on one burnt-out chip.",
    },
    doneLabel: { de: "⚒ Bordcomputer läuft wieder rund!", en: "⚒ Ship's computer running smoothly again!" },
  },
  {
    id: "interior", stageNumber: 17, tool: "brush",
    label: { de: "Innenraum stabilisieren", en: "Stabilize the interior" },
    description: {
      de: "Risse in den Innenwänden werden verspachtelt und gestrichen, damit unter Deck wieder alles hält.",
      en: "Cracks in the interior walls get filled and painted so everything below deck holds again.",
    },
    doneLabel: { de: "⚒ Innenraum stabilisiert!", en: "⚒ Interior stabilized!" },
  },
  {
    id: "safety", stageNumber: 18, tool: "safetyKit",
    label: { de: "Sicherheitssysteme prüfen", en: "Check safety systems" },
    description: {
      de: "Rettungsringe, Notfallausrüstung und Feuerlöscher werden ein letztes Mal durchgecheckt.",
      en: "Life rings, emergency gear and fire extinguishers get one final check.",
    },
    doneLabel: { de: "⚒ Sicherheitssysteme geprüft!", en: "⚒ Safety systems checked!" },
  },
  {
    id: "systemTest", stageNumber: 19, tool: "testKit",
    label: { de: "Gesamtsystem testen", en: "Test the whole system" },
    description: {
      de: "Jedes einzelne reparierte System wird noch einmal gemeinsam getestet, bevor es aufs Meer geht.",
      en: "Every single repaired system gets tested together one more time before heading out to sea.",
    },
    doneLabel: { de: "⚒ Gesamtsystem getestet!", en: "⚒ Whole system tested!" },
  },
  {
    id: "rudder", stageNumber: 20, tool: "captainsSeal",
    label: { de: "Abschlusstest und Freigabe", en: "Final check and release" },
    description: {
      de: "Das Ruder wird geprüft, die ganze Flitzpiepen ein letztes Mal kontrolliert - dann gibt der Kapitän sie frei.",
      en: "The rudder gets checked, the whole Flitzpiepen is inspected one last time - then the captain releases her.",
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
   TÄGLICHE QUESTS (20 Stück, je eine schaltet pro Kalendertag frei)
   ---------------------------------------------------
   "day" 1-20 muss der Reihe nach abgeschlossen werden (siehe
   claimDailyQuest() in ship-repair.js). "metric" ist ein bereits
   vorhandenes, langfristig gezähltes Spielerfeld (players/{uid}.*):
   - gamesPlayed / gamesWon: siehe addCurrency()-Aufrufe/Transaktion
     in scripts/spielothek/spielothek.js (neu: wird dort mitgezählt)
   - totalCurrencyEarned: wird in addCurrency() (wheel.js) UND in der
     Spielothek-Transaktion mitgezählt, JEDES Mal wenn Dublonen
     gutgeschrieben werden (Codes, Spielothek-Gewinne, Wochenrennen-/
     Community-Boss-Platzierungen)
   - codesCracked: existiert schon lange (Rangliste), zählt geknackte
     Codes
   - streak: existiert schon lange (tägliches Schatzrad-Drehen)
   "toolId" muss einer SHIP_TOOLS-ID entsprechen UND ist absichtlich
   1:1 dieselbe Reihenfolge wie SHIP_REPAIR_PHASES[*].tool - Tag N
   schaltet exakt das Werkzeug frei, das Etappe N braucht.
------------------------------------------------------ */
const DAILY_QUESTS = [
  { day: 1, metric: "gamesPlayed", threshold: 3, toolId: "spyglass" },
  { day: 2, metric: "gamesWon", threshold: 2, toolId: "toolbox" },
  { day: 3, metric: "totalCurrencyEarned", threshold: 100, toolId: "hammer" },
  { day: 4, metric: "codesCracked", threshold: 1, toolId: "sealant" },
  { day: 5, metric: "gamesPlayed", threshold: 6, toolId: "saw" },
  { day: 6, metric: "gamesWon", threshold: 4, toolId: "cableSet" },
  { day: 7, metric: "totalCurrencyEarned", threshold: 250, toolId: "fuse" },
  { day: 8, metric: "codesCracked", threshold: 2, toolId: "multimeter" },
  { day: 9, metric: "gamesPlayed", threshold: 10, toolId: "oilCan" },
  { day: 10, metric: "gamesWon", threshold: 6, toolId: "screwdriver" },
  { day: 11, metric: "totalCurrencyEarned", threshold: 450, toolId: "coolant" },
  { day: 12, metric: "codesCracked", threshold: 3, toolId: "fuelFilter" },
  { day: 13, metric: "gamesPlayed", threshold: 15, toolId: "wrench" },
  { day: 14, metric: "gamesWon", threshold: 8, toolId: "antenna" },
  { day: 15, metric: "totalCurrencyEarned", threshold: 700, toolId: "compass" },
  { day: 16, metric: "codesCracked", threshold: 4, toolId: "circuitChip" },
  { day: 17, metric: "gamesPlayed", threshold: 20, toolId: "brush" },
  { day: 18, metric: "gamesWon", threshold: 10, toolId: "safetyKit" },
  { day: 19, metric: "totalCurrencyEarned", threshold: 1000, toolId: "testKit" },
  { day: 20, metric: "streak", threshold: 5, toolId: "captainsSeal" },
];

/* Anzeige-Text je Metrik-Typ - siehe buildDailyQuestDescription()
   in ship-repair.js. Reine Vorlage, keine 20 einzelnen Sätze. */
const DAILY_QUEST_METRIC_TEXT = {
  gamesPlayed: {
    de: (n) => `Spiele insgesamt ${n} Runden in der Spielothek.`,
    en: (n) => `Play a total of ${n} rounds in the Spielothek.`,
  },
  gamesWon: {
    de: (n) => `Gewinne insgesamt ${n} Runden in der Spielothek.`,
    en: (n) => `Win a total of ${n} rounds in the Spielothek.`,
  },
  totalCurrencyEarned: {
    de: (n) => `Verdiene insgesamt ${n} Dublonen.`,
    en: (n) => `Earn a total of ${n} doubloons.`,
  },
  codesCracked: {
    de: (n) => `Löse insgesamt ${n} Code${n === 1 ? "" : "s"} ein.`,
    en: (n) => `Redeem a total of ${n} code${n === 1 ? "" : "s"}.`,
  },
  streak: {
    de: (n) => `Erreiche einen Anmelde-Streak von ${n} Tagen.`,
    en: (n) => `Reach a login streak of ${n} days.`,
  },
};

/* ------------------------------------------------------
   RÄTSEL-BANK
   "reward" muss einer SHIP_TOOLS-ID entsprechen. "rewardCode"
   ist der Code, der nach richtiger Antwort angezeigt wird UND
   in scripts/codes/codes-data.js als eigener Eintrag mit
   passendem "toolUnlock" registriert sein muss (siehe dort) -
   das Rätsel-System selbst schaltet NICHTS frei, es zeigt nur
   den Code an, den man danach ganz normal auf der Codes-Seite
   eingibt. Antworten werden klein geschrieben/getrimmt verglichen.
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
