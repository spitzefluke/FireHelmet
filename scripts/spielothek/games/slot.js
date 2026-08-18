/* ======================================================
   SPIELOTHEK - SPIEL: EINARMIGER BANDIT
   ---------------------------------------------------
   Reine, unabhängige Spiellogik - weiß nichts von Firestore,
   Dublonen oder DOM. spielothek.js ruft ausschließlich
   SPIELOTHEK_GAME_HANDLERS.slot.play(einsatz) auf (innerhalb
   einer Firestore-Transaktion) und zeigt danach GENAU das an,
   was diese Funktion zurückgegeben hat - der Client erfindet
   also nie ein abweichendes Ergebnis (Punkt 14: keine
   manipulierte Darstellung).

   REGELN (auch so im Spiel angezeigt, siehe getRules()):
   - 💀 Totenkopf irgendwo dabei -> immer Verlust, egal was
     sonst passt ("die Bank gewinnt immer")
   - 3 gleiche Symbole (ohne Totenkopf) -> großer Gewinn
   - 2 gleiche Symbole (ohne Totenkopf) -> kleiner Gewinn
   - sonst -> Verlust
====================================================== */

const SLOT_SYMBOLS = [
  { id: "cherry", emoji: "🍒", weight: 35 },
  { id: "lemon", emoji: "🍋", weight: 25 },
  { id: "bell", emoji: "🔔", weight: 15 },
  { id: "seven", emoji: "7", weight: 8 },
  { id: "skull", emoji: "💀", weight: 17 },
];

const SLOT_BET_COST = 20;

// Vielfaches des Einsatzes bei drei gleichen Symbolen
const SLOT_TRIPLE_MULTIPLIERS = {
  seven: 10,
  bell: 6,
  lemon: 4,
  cherry: 3,
};

// Vielfaches des Einsatzes bei zwei gleichen Symbolen (egal welches)
const SLOT_PAIR_MULTIPLIER = 1.5;

function pickWeightedSlotSymbol() {
  const total = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const symbol of SLOT_SYMBOLS) {
    if (roll < symbol.weight) return symbol;
    roll -= symbol.weight;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1];
}

/* Wird von spielothek.js innerhalb der Firestore-Transaktion
   aufgerufen - das zurückgegebene "payout" ist exakt der Wert,
   der dem Spieler gutgeschrieben wird UND später angezeigt wird. */
function spinSlot() {
  const reels = [pickWeightedSlotSymbol(), pickWeightedSlotSymbol(), pickWeightedSlotSymbol()];
  const hasSkull = reels.some((s) => s.id === "skull");

  let multiplier = 0;
  if (!hasSkull) {
    if (reels[0].id === reels[1].id && reels[1].id === reels[2].id) {
      multiplier = SLOT_TRIPLE_MULTIPLIERS[reels[0].id] || 0;
    } else if (reels[0].id === reels[1].id || reels[1].id === reels[2].id || reels[0].id === reels[2].id) {
      multiplier = SLOT_PAIR_MULTIPLIER;
    }
  }

  const payout = Math.round(SLOT_BET_COST * multiplier);
  return { reels, win: payout > 0, payout };
}

/* Rein kosmetische Fuellsymbole fuer die Dreh-Optik VOR dem echten
   Ergebnis (siehe .spielothek-slot-spin/-strip in style.css) - das
   tatsaechliche Ergebnis (result.reels) steht bereits fest und ist
   immer das LETZTE Symbol im Streifen, auf dem die CSS-Animation
   landet. Die Fuellsymbole selbst haben keinerlei Einfluss auf das
   Ergebnis, rein visuell. */
const SLOT_SPIN_FILLER_COUNT = 6;

function buildSlotReelStripHtml(finalSymbol) {
  const fillers = Array.from({ length: SLOT_SPIN_FILLER_COUNT }, () => pickWeightedSlotSymbol());
  return [...fillers, finalSymbol].map((s) => `<span>${s.emoji}</span>`).join("");
}

function buildSlotResultHtml(result) {
  const reels = result.reels
    .map((symbol, i) => `
      <span class="spielothek-slot-symbol spielothek-slot-spin">
        <span class="spielothek-slot-strip" style="animation-delay:${i * 140}ms">${buildSlotReelStripHtml(symbol)}</span>
      </span>
    `)
    .join("");
  return `<div class="spielothek-slot-reels">${reels}</div>`;
}

function getSlotRulesHtml(lang) {
  const isEn = lang === "en";
  return isEn
    ? `<ul>
        <li>💀 Skull anywhere → always a loss, no matter what else matches ("the house always wins")</li>
        <li>Three matching symbols → big win</li>
        <li>Two matching symbols → small win</li>
        <li>Otherwise → loss</li>
      </ul>`
    : `<ul>
        <li>💀 Totenkopf irgendwo dabei → immer Verlust, egal was sonst passt ("die Bank gewinnt immer")</li>
        <li>Drei gleiche Symbole → großer Gewinn</li>
        <li>Zwei gleiche Symbole → kleiner Gewinn</li>
        <li>Sonst → Verlust</li>
      </ul>`;
}

window.SPIELOTHEK_GAME_HANDLERS = window.SPIELOTHEK_GAME_HANDLERS || {};
window.SPIELOTHEK_GAME_HANDLERS.slot = {
  betCost: SLOT_BET_COST,
  play: spinSlot,
  buildResultHtml: buildSlotResultHtml,
  getRulesHtml: getSlotRulesHtml,
  // Muss mindestens so lange sein, wie die laengste Walzen-Dreh-
  // Animation braucht (letzte Walze: 2 x 140ms Versatz + 900ms Dauer,
  // siehe .spielothek-slot-spin in style.css), plus ein kurzer Beat -
  // sonst wuerde der Gewinn/Verlust-Text erscheinen, waehrend die
  // Walzen sichtbar noch drehen.
  resultRevealDelayMs: 1300,
};
