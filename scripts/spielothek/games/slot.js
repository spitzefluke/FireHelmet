/* ============================================================
   SPIELOTHEK - SLOT
   ------------------------------------------------------------
   Gemeinsame Spiellogik.
   WICHTIG:
   - Diese Datei ist NICHT die Vertrauensgrenze.
   - Die endgültige Runde wird serverseitig ausgeführt.
   - Der Client darf das Ergebnis nur darstellen.
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

const SLOT_BET_COST = 20;

const SLOT_TRIPLE_REWARDS = Object.freeze({
  cherry:  { payout: 50,   tier: "small" },
  lemon:   { payout: 90,   tier: "small" },
  bell:    { payout: 170,  tier: "medium" },
  diamond: { payout: 450,  tier: "big" },
  seven:   { payout: 1200, tier: "veryBig" },
  fire:    { payout: 3000, tier: "jackpot" },
});

const SLOT_PAIR_PAYOUT = 30;

const SLOT_REEL_STOP_TIMES_MS = Object.freeze([
  900,
  1500,
  2100,
]);

const SLOT_SPIN_FILLER_COUNT = 14;


/* ------------------------------------------------------------
   SPIELBERECHNUNG
   ------------------------------------------------------------
   Diese Funktion ist absichtlich rein und unabhängig von
   Firestore. Sie kann sowohl im Client als auch im Server-
   Bundle verwendet werden.

   Für die Sicherheit zählt aber ausschließlich das
   serverseitig erzeugte Ergebnis.
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


function calculateSlotResult(random = Math.random) {
  const reels = [
    pickWeightedSlotSymbol(random),
    pickWeightedSlotSymbol(random),
    pickWeightedSlotSymbol(random),
  ];

  const hasSkull = reels.some(
    symbol => symbol.id === "skull"
  );

  let payout = 0;
  let tier = null;

  if (!hasSkull) {
    const triple =
      reels[0].id === reels[1].id &&
      reels[1].id === reels[2].id;

    if (triple) {
      const reward =
        SLOT_TRIPLE_REWARDS[reels[0].id];

      if (reward) {
        payout = reward.payout;
        tier = reward.tier;
      }
    } else {
      const pair =
        reels[0].id === reels[1].id ||
        reels[1].id === reels[2].id ||
        reels[0].id === reels[2].id;

      if (pair) {
        payout = SLOT_PAIR_PAYOUT;
        tier = "pair";
      }
    }
  }

  return Object.freeze({
    reels,
    win: payout > 0,
    payout,
    tier,
  });
}


/* ------------------------------------------------------------
   CLIENT-API
   ------------------------------------------------------------
   play() startet KEINE eigene Auszahlung.
   Das tatsächliche Ergebnis kommt vom Server.
------------------------------------------------------------ */

window.SPIELOTHEK_GAME_HANDLERS =
  window.SPIELOTHEK_GAME_HANDLERS || {};

window.SPIELOTHEK_GAME_HANDLERS.slot = {
  betCost: SLOT_BET_COST,

  // Nur für Server-Code / Tests.
  calculateResult: calculateSlotResult,

  /*
   * Der Browser fordert eine Runde an. Keine Dublonenänderung
   * hier - das Ergebnis wird nur BERECHNET, die eigentliche
   * Gutschrift/Abbuchung passiert danach in spielothek.js ueber
   * einen server-geprueften Schreibvorgang (Firestore-Regeln bzw.
   * Supabase RLS), der den Kontostand-Sprung pro Runde begrenzt -
   * das ist die eigentliche Vertrauensgrenze, siehe Kommentar am
   * Dateianfang.
   */
  play: function requestSlotPlay() {
    return calculateSlotResult();
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

  const rows = [
    {
      symbols: "🍒🍒🍒 / 🍋🍋🍋",
      labelDe: "Kleiner Gewinn",
      labelEn: "Small win",
      value: `+${SLOT_TRIPLE_REWARDS.cherry.payout}–${SLOT_TRIPLE_REWARDS.lemon.payout}`,
    },
    {
      symbols: "🔔🔔🔔",
      labelDe: "Mittlerer Gewinn",
      labelEn: "Medium win",
      value: `+${SLOT_TRIPLE_REWARDS.bell.payout}`,
    },
    {
      symbols: "💎💎💎",
      labelDe: "Hoher Gewinn",
      labelEn: "Big win",
      value: `+${SLOT_TRIPLE_REWARDS.diamond.payout}`,
    },
    {
      symbols: "7️⃣7️⃣7️⃣",
      labelDe: "Sehr hoher Gewinn",
      labelEn: "Very big win",
      value: `+${SLOT_TRIPLE_REWARDS.seven.payout}`,
    },
    {
      symbols: "🔥🔥🔥",
      labelDe: "JACKPOT",
      labelEn: "JACKPOT",
      value: `+${SLOT_TRIPLE_REWARDS.fire.payout}`,
    },
  ];

  const tableRows = rows
    .map(row => `
      <li>
        <span class="spielothek-rules-symbols">
          ${row.symbols}
        </span>
        <strong>
          ${isEn ? row.labelEn : row.labelDe}
        </strong>
        → ${row.value} 🪙
      </li>
    `)
    .join("");

  return isEn
    ? `
      <ul class="spielothek-rules-tiers">
        ${tableRows}
      </ul>
      <ul>
        <li>💀 Skull anywhere → always a loss</li>
        <li>Two matching symbols → +${SLOT_PAIR_PAYOUT}</li>
        <li>Otherwise → loss</li>
      </ul>
    `
    : `
      <ul class="spielothek-rules-tiers">
        ${tableRows}
      </ul>
      <ul>
        <li>💀 Totenkopf irgendwo → immer Verlust</li>
        <li>Zwei gleiche Symbole → +${SLOT_PAIR_PAYOUT}</li>
        <li>Sonst → Verlust</li>
      </ul>
    `;
}
