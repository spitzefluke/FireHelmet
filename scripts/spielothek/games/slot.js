/* ============================================================
   SPIELOTHEK - SLOT
   ------------------------------------------------------------
   Gemeinsame Spiellogik.
   WICHTIG:
   - Diese Datei ist NICHT die Vertrauensgrenze.
   - Der Client BERECHNET das Ergebnis (RNG lokal im Browser) -
     die Datenbank prueft NICHT die einzelnen Walzen-Werte nach,
     sondern nur, dass der resultierende Kontostand-Sprung einen
     festen Deckel nicht uebersteigt (app.valid_players_write() in
     supabase/game-migration/01-players-ship-progression.sql).
     Bewusste, bereits bestehende Vereinfachung (rein virtuelle
     Waehrung, kein echtes Geld, siehe Kopfkommentar in
     spielothek.js) - dieselbe Grenze gilt auch fuer die frei
     waehlbaren Einsaetze unten.
============================================================ */

const SLOT_SYMBOLS = [
  { id: "cherry",  emoji: "🍒", weight: 310 },
  { id: "lemon",   emoji: "🍋", weight: 228 },
  { id: "bell",    emoji: "🔔", weight: 150 },
  { id: "diamond", emoji: "💎", weight: 84 },
  { id: "seven",   emoji: "7️⃣", weight: 45 },
  { id: "fire",    emoji: "🔥", weight: 24 },
  { id: "skull",   emoji: "💀", weight: 160 },
];

const SLOT_REEL_COUNT = 4;

/* Frei waehlbarer Einsatz statt eines festen Betrags (Auftrag: "man
   soll selbst definieren wie viel man einsetzt, je mehr desto mehr
   gewinnt man") - alle Auszahlungen unten sind deshalb VIELFACHE des
   Einsatzes statt fester Betraege, siehe SLOT_TRIPLE_REWARDS/
   SLOT_QUAD_REWARDS/SLOT_PAIR_MULTIPLIER. */
const SLOT_MIN_BET = 10;
const SLOT_MAX_BET = 100;
const SLOT_BET_STEP = 10;
const SLOT_DEFAULT_BET = 20;

/* Vielfaches des Einsatzes bei genau DREI gleichen Symbolen (von 4
   Walzen) - unveraendertes Verhaeltnis zum fruehen, festen Einsatz
   von 20 (z.B. cherry: 50/20 = 2.5), nur jetzt auf einen beliebigen
   Einsatz uebertragen. */
const SLOT_TRIPLE_REWARDS = Object.freeze({
  cherry:  { multiplier: 2.5,  tier: "small" },
  lemon:   { multiplier: 4.5,  tier: "small" },
  bell:    { multiplier: 8.5,  tier: "medium" },
  diamond: { multiplier: 22.5, tier: "big" },
  seven:   { multiplier: 60,   tier: "veryBig" },
  fire:    { multiplier: 150,  tier: "jackpot" },
});

/* NEU (4. Walze): Vielfaches bei VIER gleichen Symbolen - deutlich
   seltener als drei gleiche, deshalb ein spuerbar hoeheres Vielfaches
   pro Symbol. Nutzt bewusst dieselben Tier-Namen wie die Drei-
   Symbole-Gewinne (small/medium/big/veryBig/jackpot), damit die
   bestehende Konfetti-/Ändii-Zitat-Logik (siehe spielothek.js) ohne
   Aenderung weiterfunktioniert - Vierfach-Feuer bleibt "jackpot",
   nur mit einem doppelt so hohen Vielfachen wie Dreifach-Feuer. */
const SLOT_QUAD_REWARDS = Object.freeze({
  cherry:  { multiplier: 6,   tier: "small" },
  lemon:   { multiplier: 10,  tier: "small" },
  bell:    { multiplier: 20,  tier: "medium" },
  diamond: { multiplier: 50,  tier: "big" },
  seven:   { multiplier: 130, tier: "veryBig" },
  fire:    { multiplier: 300, tier: "jackpot" },
});

const SLOT_PAIR_MULTIPLIER = 1.5;

const SLOT_REEL_STOP_TIMES_MS = Object.freeze([
  900,
  1500,
  2100,
  2700,
]);

const SLOT_SPIN_FILLER_COUNT = 14;


/* ------------------------------------------------------------
   SPIELBERECHNUNG
   ------------------------------------------------------------
   Diese Funktion ist absichtlich rein und unabhängig von
   Firestore/Supabase. Sie kann sowohl im Client als auch im Server-
   Bundle verwendet werden.

   Für die Sicherheit zählt aber ausschließlich das
   serverseitig geprüfte Kontostand-Delta (siehe Kommentar am
   Dateianfang).
------------------------------------------------------------ */

function pickWeightedSlotSymbol(random = Math.random) {
  const total = SLOT_SYMBOLS.reduce(
    (sum, symbol) => sum + symbol.weight,
    0
  );

  let roll = random() * total;

  for (const symbol of SLOT_SYMBOLS) {
    if (roll < symbol.weight) {
      return symbol;
    }

    roll -= symbol.weight;
  }

  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1];
}


function clampSlotBet(betAmount) {
  const n = Number(betAmount);
  if (!Number.isFinite(n)) return SLOT_DEFAULT_BET;

  const stepped = Math.round(n / SLOT_BET_STEP) * SLOT_BET_STEP;
  return Math.min(SLOT_MAX_BET, Math.max(SLOT_MIN_BET, stepped));
}


function calculateSlotResult(betAmount, random = Math.random) {
  const bet = clampSlotBet(betAmount);

  const reels = Array.from(
    { length: SLOT_REEL_COUNT },
    () => pickWeightedSlotSymbol(random)
  );

  const hasSkull = reels.some(
    symbol => symbol.id === "skull"
  );

  let payout = 0;
  let tier = null;

  if (!hasSkull) {
    const counts = {};
    reels.forEach(symbol => {
      counts[symbol.id] = (counts[symbol.id] || 0) + 1;
    });

    let bestId = null;
    let bestCount = 0;
    Object.keys(counts).forEach(id => {
      if (counts[id] > bestCount) {
        bestCount = counts[id];
        bestId = id;
      }
    });

    let reward = null;
    if (bestCount === SLOT_REEL_COUNT) {
      reward = SLOT_QUAD_REWARDS[bestId];
    } else if (bestCount === 3) {
      reward = SLOT_TRIPLE_REWARDS[bestId];
    }

    if (reward) {
      payout = Math.round(bet * reward.multiplier);
      tier = reward.tier;
    } else if (bestCount === 2) {
      payout = Math.round(bet * SLOT_PAIR_MULTIPLIER);
      tier = "pair";
    }
  }

  return Object.freeze({
    reels,
    bet,
    win: payout > 0,
    payout,
    tier,
  });
}


/* ------------------------------------------------------------
   CLIENT-API
   ------------------------------------------------------------
   play() startet KEINE eigene Auszahlung.
   Das tatsächliche Ergebnis kommt erst durch den serverseitig
   geprüften Schreibvorgang zustande, siehe spielothek.js.
------------------------------------------------------------ */

window.SPIELOTHEK_GAME_HANDLERS =
  window.SPIELOTHEK_GAME_HANDLERS || {};

window.SPIELOTHEK_GAME_HANDLERS.slot = {
  // Frei waehlbarer Einsatz statt eines festen betCost - spielothek.js
  // zeigt bei "variableBet: true" einen Einsatz-Regler statt des alten
  // statischen Hinweistexts, siehe renderSpielothekPage().
  variableBet: true,
  minBet: SLOT_MIN_BET,
  maxBet: SLOT_MAX_BET,
  betStep: SLOT_BET_STEP,
  defaultBet: SLOT_DEFAULT_BET,

  // Nur für Server-Code / Tests.
  calculateResult: calculateSlotResult,

  /*
   * Der Browser fordert eine Runde mit einem selbst gewaehlten
   * Einsatz an. Keine Dublonenänderung hier - das Ergebnis wird nur
   * BERECHNET, die eigentliche Gutschrift/Abbuchung passiert danach
   * in spielothek.js ueber einen server-geprueften Schreibvorgang
   * (Supabase RLS), der den Kontostand-Sprung pro Runde begrenzt -
   * das ist die eigentliche Vertrauensgrenze, siehe Kommentar am
   * Dateianfang.
   */
  play: function requestSlotPlay(betAmount) {
    return calculateSlotResult(betAmount);
  },

  buildResultHtml: buildSlotResultHtml,

  getRulesHtml: getSlotRulesHtml,

  reelStopTimesMs: SLOT_REEL_STOP_TIMES_MS,

  resultRevealDelayMs:
    SLOT_REEL_STOP_TIMES_MS[
      SLOT_REEL_STOP_TIMES_MS.length - 1
    ] + 250,
};


/* ------------------------------------------------------------
   DARSTELLUNG
------------------------------------------------------------ */

function buildSlotReelStripHtml(finalSymbol) {
  const fillers = Array.from(
    { length: SLOT_SPIN_FILLER_COUNT },
    () => pickWeightedSlotSymbol()
  );

  return [
    ...fillers,
    finalSymbol
  ]
    .map(symbol => `<span>${symbol.emoji}</span>`)
    .join("");
}


function buildSlotResultHtml(result) {
  const reels = result.reels
    .map((symbol, index) => `
      <span
        class="spielothek-slot-symbol spielothek-slot-spin"
        style="--slot-reel-duration:${SLOT_REEL_STOP_TIMES_MS[index]}ms"
      >
        <span class="spielothek-slot-strip">
          ${buildSlotReelStripHtml(symbol)}
        </span>
      </span>
    `)
    .join("");

  return `
    <div class="spielothek-slot-reels spielothek-slot-reels-tier-${result.tier || "none"}">
      ${reels}
    </div>
  `;
}


function getSlotRulesHtml(lang) {
  const isEn = lang === "en";

  const tripleRows = [
    { symbols: "🍒🍒🍒 / 🍋🍋🍋", x: `${SLOT_TRIPLE_REWARDS.cherry.multiplier}–${SLOT_TRIPLE_REWARDS.lemon.multiplier}` },
    { symbols: "🔔🔔🔔", x: SLOT_TRIPLE_REWARDS.bell.multiplier },
    { symbols: "💎💎💎", x: SLOT_TRIPLE_REWARDS.diamond.multiplier },
    { symbols: "7️⃣7️⃣7️⃣", x: SLOT_TRIPLE_REWARDS.seven.multiplier },
    { symbols: "🔥🔥🔥", x: SLOT_TRIPLE_REWARDS.fire.multiplier, jackpot: true },
  ];

  const quadRows = [
    { symbols: "🍒🍒🍒🍒 / 🍋🍋🍋🍋", x: `${SLOT_QUAD_REWARDS.cherry.multiplier}–${SLOT_QUAD_REWARDS.lemon.multiplier}` },
    { symbols: "🔔🔔🔔🔔", x: SLOT_QUAD_REWARDS.bell.multiplier },
    { symbols: "💎💎💎💎", x: SLOT_QUAD_REWARDS.diamond.multiplier },
    { symbols: "7️⃣7️⃣7️⃣7️⃣", x: SLOT_QUAD_REWARDS.seven.multiplier },
    { symbols: "🔥🔥🔥🔥", x: SLOT_QUAD_REWARDS.fire.multiplier, jackpot: true },
  ];

  const renderRows = (rows, bigLabelDe, bigLabelEn) => rows
    .map(row => `
      <li>
        <span class="spielothek-rules-symbols">${row.symbols}</span>
        <strong>${row.jackpot ? (isEn ? "JACKPOT" : "JACKPOT") : (isEn ? bigLabelEn : bigLabelDe)}</strong>
        → ${row.x}× ${isEn ? "your bet" : "Einsatz"}
      </li>
    `)
    .join("");

  const betLine = isEn
    ? `Choose your own bet (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in steps of ${SLOT_BET_STEP}) - the higher the bet, the higher the payout.`
    : `Du wählst deinen Einsatz selbst (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in Schritten von ${SLOT_BET_STEP}) - je höher der Einsatz, desto höher der Gewinn.`;

  return isEn
    ? `
      <p class="spielothek-rules-bet-hint">${betLine}</p>
      <p><strong>4 matching symbols (rarest)</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(quadRows, "Win", "Win")}</ul>
      <p><strong>3 matching symbols</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(tripleRows, "Win", "Win")}</ul>
      <ul>
        <li>💀 Skull anywhere → always a loss</li>
        <li>Two matching symbols → ${SLOT_PAIR_MULTIPLIER}× your bet</li>
        <li>Otherwise → loss</li>
      </ul>
    `
    : `
      <p class="spielothek-rules-bet-hint">${betLine}</p>
      <p><strong>4 gleiche Symbole (am seltensten)</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(quadRows, "Gewinn", "Gewinn")}</ul>
      <p><strong>3 gleiche Symbole</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(tripleRows, "Gewinn", "Gewinn")}</ul>
      <ul>
        <li>💀 Totenkopf irgendwo → immer Verlust</li>
        <li>Zwei gleiche Symbole → ${SLOT_PAIR_MULTIPLIER}× Einsatz</li>
        <li>Sonst → Verlust</li>
      </ul>
    `;
}
