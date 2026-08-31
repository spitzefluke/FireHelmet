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

/* Frei waehlbarer Einsatz statt eines festen Betrags (Auftrag: "man
   soll selbst definieren wie viel man einsetzt, je mehr desto mehr
   gewinnt man") - alle Auszahlungen unten sind deshalb VIELFACHE des
   Einsatzes statt fester Betraege, siehe SLOT_TRIPLE_REWARDS/
   SLOT_QUAD_REWARDS/SLOT_FIVE_REWARDS/SLOT_SIX_REWARDS/getSlotPairMultiplier(). */
const SLOT_MIN_BET = 10;
const SLOT_MAX_BET = 100;
const SLOT_BET_STEP = 10;
const SLOT_DEFAULT_BET = 20;

/* Auftrag: "je mehr man einsetzt desto mehr kaesten sollen auch
   gedreht werden: 10 einsatz = 2 rollen, 50 = 4 rollen, max an rollen
   sollen 6 sein" - alle 20 Dublonen mehr Einsatz gibt eine Walze
   dazu, gedeckelt bei 6. Ergibt genau: 10/20=2, 30/40=3, 50/60=4,
   70/80=5, 90/100=6 Walzen. */
const SLOT_REEL_COUNT_MIN = 2;
const SLOT_REEL_COUNT_MAX = 6;
const SLOT_REEL_COUNT_BET_STEP = 20;

function getSlotReelCountForBet(bet) {
  const steps = Math.floor((bet - SLOT_MIN_BET) / SLOT_REEL_COUNT_BET_STEP);
  return Math.min(SLOT_REEL_COUNT_MAX, SLOT_REEL_COUNT_MIN + steps);
}

/* Vielfaches des Einsatzes bei genau DREI gleichen Symbolen. */
const SLOT_TRIPLE_REWARDS = Object.freeze({
  cherry:  { multiplier: 2.5,  tier: "small" },
  lemon:   { multiplier: 4.5,  tier: "small" },
  bell:    { multiplier: 8.5,  tier: "medium" },
  diamond: { multiplier: 22.5, tier: "big" },
  seven:   { multiplier: 60,   tier: "veryBig" },
  fire:    { multiplier: 150,  tier: "jackpot" },
});

/* Vielfaches bei VIER gleichen Symbolen. */
const SLOT_QUAD_REWARDS = Object.freeze({
  cherry:  { multiplier: 6,   tier: "small" },
  lemon:   { multiplier: 10,  tier: "small" },
  bell:    { multiplier: 20,  tier: "medium" },
  diamond: { multiplier: 50,  tier: "big" },
  seven:   { multiplier: 130, tier: "veryBig" },
  fire:    { multiplier: 300, tier: "jackpot" },
});

/* NEU: Vielfache bei FUENF bzw. SECHS gleichen Symbolen (nur ab
   entsprechend hohem Einsatz ueberhaupt erreichbar, siehe
   getSlotReelCountForBet). Nutzen bewusst dieselben Tier-Namen wie
   oben, damit die bestehende Konfetti-/Ändii-Zitat-Logik (siehe
   spielothek.js) ohne Aenderung weiterfunktioniert. */
const SLOT_FIVE_REWARDS = Object.freeze({
  cherry:  { multiplier: 9,   tier: "small" },
  lemon:   { multiplier: 15,  tier: "small" },
  bell:    { multiplier: 30,  tier: "medium" },
  diamond: { multiplier: 75,  tier: "big" },
  seven:   { multiplier: 170, tier: "veryBig" },
  fire:    { multiplier: 375, tier: "jackpot" },
});

const SLOT_SIX_REWARDS = Object.freeze({
  cherry:  { multiplier: 13,  tier: "small" },
  lemon:   { multiplier: 21,  tier: "small" },
  bell:    { multiplier: 42,  tier: "medium" },
  diamond: { multiplier: 100, tier: "big" },
  seven:   { multiplier: 220, tier: "veryBig" },
  fire:    { multiplier: 480, tier: "jackpot" },
});

const SLOT_REWARD_TABLES_BY_COUNT = Object.freeze({
  3: SLOT_TRIPLE_REWARDS,
  4: SLOT_QUAD_REWARDS,
  5: SLOT_FIVE_REWARDS,
  6: SLOT_SIX_REWARDS,
});

/* Auftrag: "wenn man gewinnt soll man jeweils das doppelte oder bei
   groesserem einsatz noch mehr erhalten" - der Basis-Gewinn (zwei
   gleiche Symbole) zahlt jetzt mindestens den doppelten Einsatz aus,
   und pro zusaetzlicher Walze (= hoeherer Einsatz, siehe
   getSlotReelCountForBet) noch etwas mehr obendrauf. Die groesseren
   Gewinnstufen (SLOT_TRIPLE/QUAD/FIVE/SIX_REWARDS) liegen ohnehin
   schon alle ueber dem doppelten Einsatz und muessen dafuer nicht
   angepasst werden. */
const SLOT_PAIR_MULTIPLIER_BASE = 2;
const SLOT_PAIR_MULTIPLIER_STEP_PER_REEL = 0.3;

function getSlotPairMultiplier(reelCount) {
  return SLOT_PAIR_MULTIPLIER_BASE +
    SLOT_PAIR_MULTIPLIER_STEP_PER_REEL * (reelCount - SLOT_REEL_COUNT_MIN);
}

/* Sicherheits-Deckel unterhalb des serverseitig erzwungenen Limits
   (currency/total_currency_earned duerfen pro Schreibvorgang um
   maximal 30000 steigen, siehe app.valid_players_write() in
   supabase/game-migration/01-players-ship-progression.sql). Bei
   sechs gleichen 🔥 auf maximalem Einsatz (100 x 480 = 48000) wuerde
   die Datenbank den Schreibvorgang sonst ablehnen, obwohl die
   Walzen bereits einen Gewinn angezeigt haben - das waere genau die
   irrefuehrende Situation, die Punkt 14/15 im Kopfkommentar von
   spielothek.js ausschliessen soll. Mit Sicherheitsabstand statt
   exakt am Deckel, falls die Tabellen oben spaeter nochmal angepasst
   werden. */
const SLOT_MAX_SAFE_PAYOUT = 25000;

const SLOT_SPIN_FILLER_COUNT = 14;


/* ------------------------------------------------------------
   PITY-SYSTEM (Auftrag: "wenn man 10 mal gedreht hat soll ein
   garantierter Gewinn bei der spielo kommen damit es nicht zu
   abzockmaessig rueberkommt")
   ------------------------------------------------------------
   Rein clientseitig (localStorage, wie z.B. wheelStreak/raceProgress
   an anderer Stelle im Projekt) - unkritisch fuer die Sicherheit, da
   das Ergebnis ohnehin komplett client-berechnet ist (siehe
   Kopfkommentar) und nur der resultierende Kontostand-Sprung
   serverseitig geprueft wird. Zaehlt Spins OHNE Gewinn; der 10. Spin
   in Folge ohne Gewinn wird garantiert zu einem Gewinn (mindestens
   ein Paar). Ein natuerlicher Gewinn auf dem Weg dahin setzt den
   Zaehler ganz normal zurueck.
------------------------------------------------------------ */
const SLOT_PITY_SPIN_THRESHOLD = 10;
const SLOT_PITY_STORAGE_KEY = "spielothekSlotSpinsSinceWin";

function getSlotSpinsSinceWin() {
  try {
    return parseInt(localStorage.getItem(SLOT_PITY_STORAGE_KEY) || "0", 10) || 0;
  } catch (err) {
    // z.B. Privatmodus/Speicher voll - Pity-Zaehler startet einfach
    // wieder bei 0, kein Blocker fuers eigentliche Spiel.
    return 0;
  }
}

function setSlotSpinsSinceWin(n) {
  try {
    localStorage.setItem(SLOT_PITY_STORAGE_KEY, String(n));
  } catch (err) {
    // s.o. - rein kosmetisch, kein Fehlerfall fuers Spiel selbst.
  }
}


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

function pickWeightedSlotSymbol(symbols, random = Math.random) {
  const total = symbols.reduce(
    (sum, symbol) => sum + symbol.weight,
    0
  );

  let roll = random() * total;

  for (const symbol of symbols) {
    if (roll < symbol.weight) {
      return symbol;
    }

    roll -= symbol.weight;
  }

  return symbols[symbols.length - 1];
}


function clampSlotBet(betAmount) {
  const n = Number(betAmount);
  if (!Number.isFinite(n)) return SLOT_DEFAULT_BET;

  const stepped = Math.round(n / SLOT_BET_STEP) * SLOT_BET_STEP;
  return Math.min(SLOT_MAX_BET, Math.max(SLOT_MIN_BET, stepped));
}


function buildSlotReelStopTimesMs(reelCount) {
  // Gleicher 600ms-Takt wie zuvor bei den fest verdrahteten vier
  // Walzen (900/1500/2100/2700), jetzt nur fuer eine beliebige Anzahl
  // Walzen fortgeschrieben.
  return Array.from({ length: reelCount }, (_, i) => 900 + i * 600);
}


function generateRandomSlotReels(reelCount, random = Math.random) {
  return Array.from(
    { length: reelCount },
    () => pickWeightedSlotSymbol(SLOT_SYMBOLS, random)
  );
}


function generateForcedWinSlotReels(reelCount, random = Math.random) {
  const nonSkullSymbols = SLOT_SYMBOLS.filter(symbol => symbol.id !== "skull");
  const matchSymbol = pickWeightedSlotSymbol(nonSkullSymbols, random);

  // Zwei zufaellige Walzen-Positionen fuer das garantierte Paar -
  // alles andere bliebe sonst zu vorhersehbar (immer Walze 1+2).
  const pairPositions = new Set();
  while (pairPositions.size < Math.min(2, reelCount)) {
    pairPositions.add(Math.floor(random() * reelCount));
  }

  return Array.from({ length: reelCount }, (_, i) => {
    if (pairPositions.has(i)) return matchSymbol;
    // Uebrige Walzen: normale Gewichtung, aber OHNE Totenkopf - sonst
    // koennte die Anzahl der Totenkoepfe die des garantierten Paares
    // wieder einholen oder uebertreffen (Regel: bestCount > skullCount).
    return pickWeightedSlotSymbol(nonSkullSymbols, random);
  });
}


function scoreSlotReels(reels, bet) {
  const counts = {};
  let skullCount = 0;
  reels.forEach(symbol => {
    if (symbol.id === "skull") {
      skullCount++;
      return;
    }
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

  let payout = 0;
  let tier = null;

  // Gewinn, sobald die groesste gleiche Symbolgruppe (ohne Totenkoepfe)
  // die Anzahl der Totenkoepfe uebertrifft - statt frueher "Totenkopf
  // irgendwo -> immer Verlust".
  if (bestCount > skullCount) {
    const rewardTable = SLOT_REWARD_TABLES_BY_COUNT[bestCount];
    const reward = rewardTable ? rewardTable[bestId] : null;

    if (reward) {
      payout = Math.min(Math.round(bet * reward.multiplier), SLOT_MAX_SAFE_PAYOUT);
      tier = reward.tier;
    } else if (bestCount === 2) {
      payout = Math.round(bet * getSlotPairMultiplier(reels.length));
      tier = "pair";
    }
  }

  return { reels, bet, win: payout > 0, payout, tier };
}


function calculateSlotResult(betAmount, random = Math.random, forcePity = false) {
  const bet = clampSlotBet(betAmount);
  const reelCount = getSlotReelCountForBet(bet);

  let reels = generateRandomSlotReels(reelCount, random);
  let result = scoreSlotReels(reels, bet);

  // Pity nur eingreifen lassen, wenn der normale Dreh sonst ein
  // Verlust gewesen waere - ein natuerlicher (evtl. sogar groesserer)
  // Gewinn wird dadurch nie "heruntergestuft".
  if (!result.win && forcePity) {
    reels = generateForcedWinSlotReels(reelCount, random);
    result = scoreSlotReels(reels, bet);
  }

  const reelStopTimesMs = buildSlotReelStopTimesMs(reelCount);

  return Object.freeze({
    ...result,
    reelCount,
    reelStopTimesMs,
    resultRevealDelayMs: reelStopTimesMs[reelStopTimesMs.length - 1] + 250,
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
   *
   * Verwaltet zusaetzlich den Pity-Zaehler (siehe Abschnitt oben).
   */
  play: function requestSlotPlay(betAmount) {
    const spinsSinceWin = getSlotSpinsSinceWin();
    const forcePity = spinsSinceWin + 1 >= SLOT_PITY_SPIN_THRESHOLD;

    const result = calculateSlotResult(betAmount, Math.random, forcePity);

    setSlotSpinsSinceWin(result.win ? 0 : spinsSinceWin + 1);

    return result;
  },

  buildResultHtml: buildSlotResultHtml,

  getRulesHtml: getSlotRulesHtml,
};


/* ------------------------------------------------------------
   DARSTELLUNG
------------------------------------------------------------ */

function buildSlotReelStripHtml(finalSymbol) {
  const fillers = Array.from(
    { length: SLOT_SPIN_FILLER_COUNT },
    () => pickWeightedSlotSymbol(SLOT_SYMBOLS)
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
        style="--slot-reel-duration:${result.reelStopTimesMs[index]}ms"
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

  const fiveRows = [
    { symbols: "🍒🍒🍒🍒🍒 / 🍋🍋🍋🍋🍋", x: `${SLOT_FIVE_REWARDS.cherry.multiplier}–${SLOT_FIVE_REWARDS.lemon.multiplier}` },
    { symbols: "🔔🔔🔔🔔🔔", x: SLOT_FIVE_REWARDS.bell.multiplier },
    { symbols: "💎💎💎💎💎", x: SLOT_FIVE_REWARDS.diamond.multiplier },
    { symbols: "7️⃣7️⃣7️⃣7️⃣7️⃣", x: SLOT_FIVE_REWARDS.seven.multiplier },
    { symbols: "🔥🔥🔥🔥🔥", x: SLOT_FIVE_REWARDS.fire.multiplier, jackpot: true },
  ];

  const sixRows = [
    { symbols: "🍒×6 / 🍋×6", x: `${SLOT_SIX_REWARDS.cherry.multiplier}–${SLOT_SIX_REWARDS.lemon.multiplier}` },
    { symbols: "🔔×6", x: SLOT_SIX_REWARDS.bell.multiplier },
    { symbols: "💎×6", x: SLOT_SIX_REWARDS.diamond.multiplier },
    { symbols: "7️⃣×6", x: SLOT_SIX_REWARDS.seven.multiplier },
    { symbols: "🔥×6", x: SLOT_SIX_REWARDS.fire.multiplier, jackpot: true },
  ];

  const renderRows = (rows, bigLabelDe, bigLabelEn) => rows
    .map(row => `
      <li>
        <span class="spielothek-rules-symbols">${row.symbols}</span>
        <strong>${row.jackpot ? "JACKPOT" : (isEn ? bigLabelEn : bigLabelDe)}</strong>
        → ${row.x}× ${isEn ? "your bet" : "Einsatz"}
      </li>
    `)
    .join("");

  const betLine = isEn
    ? `Choose your own bet (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in steps of ${SLOT_BET_STEP}) - the higher the bet, the higher the payout AND the more reels spin (2 at ${SLOT_MIN_BET}, up to ${SLOT_REEL_COUNT_MAX} at ${SLOT_MAX_BET}).`
    : `Du wählst deinen Einsatz selbst (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in Schritten von ${SLOT_BET_STEP}) - je höher der Einsatz, desto höher der Gewinn UND desto mehr Walzen drehen sich mit (2 bei ${SLOT_MIN_BET}, bis zu ${SLOT_REEL_COUNT_MAX} bei ${SLOT_MAX_BET}).`;

  const pityLine = isEn
    ? `No win for ${SLOT_PITY_SPIN_THRESHOLD} spins in a row? Your next spin is guaranteed to win.`
    : `${SLOT_PITY_SPIN_THRESHOLD} Spins in Folge ohne Gewinn? Dein nächster Dreh gewinnt garantiert.`;

  return isEn
    ? `
      <p class="spielothek-rules-bet-hint">${betLine}</p>
      <p class="spielothek-rules-bet-hint">${pityLine}</p>
      <p><strong>6 matching symbols (rarest)</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(sixRows, "Win", "Win")}</ul>
      <p><strong>5 matching symbols</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(fiveRows, "Win", "Win")}</ul>
      <p><strong>4 matching symbols</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(quadRows, "Win", "Win")}</ul>
      <p><strong>3 matching symbols</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(tripleRows, "Win", "Win")}</ul>
      <ul>
        <li>💀 More matching symbols than skulls → still a win, skulls just don't count toward the match</li>
        <li>Two matching symbols → ${getSlotPairMultiplier(SLOT_REEL_COUNT_MIN)}×–${getSlotPairMultiplier(SLOT_REEL_COUNT_MAX)}× your bet (higher bet = higher multiplier)</li>
        <li>Otherwise → loss</li>
      </ul>
    `
    : `
      <p class="spielothek-rules-bet-hint">${betLine}</p>
      <p class="spielothek-rules-bet-hint">${pityLine}</p>
      <p><strong>6 gleiche Symbole (am seltensten)</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(sixRows, "Gewinn", "Gewinn")}</ul>
      <p><strong>5 gleiche Symbole</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(fiveRows, "Gewinn", "Gewinn")}</ul>
      <p><strong>4 gleiche Symbole</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(quadRows, "Gewinn", "Gewinn")}</ul>
      <p><strong>3 gleiche Symbole</strong></p>
      <ul class="spielothek-rules-tiers">${renderRows(tripleRows, "Gewinn", "Gewinn")}</ul>
      <ul>
        <li>💀 Mehr gleiche Symbole als Totenköpfe → trotzdem Gewinn, Totenköpfe zählen einfach nicht zum Match</li>
        <li>Zwei gleiche Symbole → ${getSlotPairMultiplier(SLOT_REEL_COUNT_MIN)}×–${getSlotPairMultiplier(SLOT_REEL_COUNT_MAX)}× Einsatz (höherer Einsatz = höherer Multiplikator)</li>
        <li>Sonst → Verlust</li>
      </ul>
    `;
}
