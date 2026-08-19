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

   GEWINNSTUFEN (siehe SLOT_TRIPLE_MULTIPLIERS unten - zentral an
   EINER Stelle definiert, leicht anpassbar):
   - 💀 Totenkopf irgendwo dabei -> immer Verlust, egal was
     sonst passt ("die Bank gewinnt immer")
   - 3 gleiche Symbole (ohne Totenkopf) -> je nach Symbol
     kleiner/mittlerer/hoher/sehr hoher Gewinn bis zum Jackpot
   - 2 gleiche Symbole (ohne Totenkopf) -> kleiner Trostgewinn
   - sonst -> Verlust

   BALANCIERUNG (rechnerisch hergeleitet, siehe Kommentar bei
   SLOT_SYMBOLS - nicht blind Werte eingesetzt, siehe Auftrag
   Punkt 7/8): Hausvorteil ca. 35% (Einsatz 20, Erwartungswert der
   Auszahlung ca. 13), Jackpot-Wahrscheinlichkeit ca. 1:70.000 -
   selten, aber mit genug Spielrunden ueber die Zeit erreichbar.
   Die vergebenen Betraege bleiben dabei klar unter den echten
   Shop-Preisen (bis 28.000 Dublonen, siehe shop-data.js), sodass
   ein einzelner Jackpot nicht die gesamte Wirtschaft der Website
   aus den Fugen hebt.
====================================================== */

// Gewichte bestimmen, wie oft ein Symbol pro Walze erscheint (grösseres
// Gewicht = häufiger). Kein Prozent-Zwang - pickWeightedSlotSymbol()
// normalisiert automatisch über die Summe aller Gewichte.
const SLOT_SYMBOLS = [
  { id: "cherry", emoji: "🍒", weight: 310 },
  { id: "lemon", emoji: "🍋", weight: 228 },
  { id: "bell", emoji: "🔔", weight: 150 },
  { id: "diamond", emoji: "💎", weight: 84 },
  { id: "seven", emoji: "7️⃣", weight: 45 },
  { id: "fire", emoji: "🔥", weight: 24 },
  { id: "skull", emoji: "💀", weight: 160 },
];

const SLOT_BET_COST = 20;

// Auszahlung bei DREI gleichen Symbolen (absoluter Dublonen-Betrag,
// nicht als Vielfaches - so bleibt auf einen Blick klar, wieviel eine
// Stufe tatsächlich bringt). "tier" wird von spielothek.js benutzt, um
// die passende Ändii-Reaktion und Effektstärke auszuwählen.
const SLOT_TRIPLE_REWARDS = {
  cherry: { payout: 50, tier: "small" },
  lemon: { payout: 90, tier: "small" },
  bell: { payout: 170, tier: "medium" },
  diamond: { payout: 450, tier: "big" },
  seven: { payout: 1200, tier: "veryBig" },
  fire: { payout: 3000, tier: "jackpot" },
};

// Trostgewinn bei zwei gleichen Symbolen (egal welches, ausser Totenkopf)
const SLOT_PAIR_PAYOUT = Math.round(SLOT_BET_COST * 1.5);

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

  let payout = 0;
  let tier = null;

  if (!hasSkull) {
    if (reels[0].id === reels[1].id && reels[1].id === reels[2].id) {
      const reward = SLOT_TRIPLE_REWARDS[reels[0].id];
      if (reward) {
        payout = reward.payout;
        tier = reward.tier;
      }
    } else if (reels[0].id === reels[1].id || reels[1].id === reels[2].id || reels[0].id === reels[2].id) {
      payout = SLOT_PAIR_PAYOUT;
      tier = "pair";
    }
  }

  return { reels, win: payout > 0, payout, tier };
}

/* Rein kosmetische Fuellsymbole fuer die Dreh-Optik VOR dem echten
   Ergebnis (siehe .spielothek-slot-spin/-strip in style.css) - das
   tatsaechliche Ergebnis (result.reels) steht bereits fest und ist
   immer das LETZTE Symbol im Streifen, auf dem die CSS-Animation
   landet. Die Fuellsymbole selbst haben keinerlei Einfluss auf das
   Ergebnis, rein visuell. Jede Walze bekommt jetzt mehr Fuellsymbole
   als vorher (Punkt 4: "sichtbar schnell laufen" statt nur kurz
   durchrutschen).
------------------------------------------------------ */
const SLOT_SPIN_FILLER_COUNT = 14;

function buildSlotReelStripHtml(finalSymbol) {
  const fillers = Array.from({ length: SLOT_SPIN_FILLER_COUNT }, () => pickWeightedSlotSymbol());
  return [...fillers, finalSymbol].map((s) => `<span>${s.emoji}</span>`).join("");
}

/* ------------------------------------------------------
   GESTAFFELTES STOPPEN (Punkt 4/5 des Auftrags)
   ---------------------------------------------------
   Jede Walze bekommt eine EIGENE Dreh-Dauer statt nur eines kleinen
   Start-Versatzes wie vorher - Walze 1 stoppt zuerst, dann folgt nach
   einer spuerbaren Pause Walze 2, dann Walze 3. Reine CSS-Animation
   (kein setInterval/requestAnimationFrame), siehe .spielothek-slot-
   strip / @keyframes spielothekReelSpin in style.css - die Dauer wird
   hier zentral festgelegt und per Inline-Style an die Animation
   durchgereicht, damit spielothek.js (resultRevealDelayMs) und die
   Optik hier garantiert synchron bleiben.
------------------------------------------------------ */
const SLOT_REEL_STOP_TIMES_MS = [900, 1500, 2100];

function buildSlotResultHtml(result) {
  const reels = result.reels
    .map((symbol, i) => `
      <span class="spielothek-slot-symbol spielothek-slot-spin" style="--slot-reel-duration:${SLOT_REEL_STOP_TIMES_MS[i]}ms">
        <span class="spielothek-slot-strip">${buildSlotReelStripHtml(symbol)}</span>
      </span>
    `)
    .join("");
  return `<div class="spielothek-slot-reels spielothek-slot-reels-tier-${result.tier || "none"}">${reels}</div>`;
}

function getSlotRulesHtml(lang) {
  const isEn = lang === "en";
  const rows = [
    { symbols: "🍒🍒🍒 / 🍋🍋🍋", labelDe: "Kleiner Gewinn", labelEn: "Small win", value: `+${SLOT_TRIPLE_REWARDS.cherry.payout}–${SLOT_TRIPLE_REWARDS.lemon.payout}` },
    { symbols: "🔔🔔🔔", labelDe: "Mittlerer Gewinn", labelEn: "Medium win", value: `+${SLOT_TRIPLE_REWARDS.bell.payout}` },
    { symbols: "💎💎💎", labelDe: "Hoher Gewinn", labelEn: "Big win", value: `+${SLOT_TRIPLE_REWARDS.diamond.payout}` },
    { symbols: "7️⃣7️⃣7️⃣", labelDe: "Sehr hoher Gewinn", labelEn: "Very big win", value: `+${SLOT_TRIPLE_REWARDS.seven.payout}` },
    { symbols: "🔥🔥🔥", labelDe: "JACKPOT", labelEn: "JACKPOT", value: `+${SLOT_TRIPLE_REWARDS.fire.payout}` },
  ];

  const tableRows = rows
    .map((r) => `<li><span class="spielothek-rules-symbols">${r.symbols}</span> <strong>${isEn ? r.labelEn : r.labelDe}</strong> → ${r.value} 🪙</li>`)
    .join("");

  return isEn
    ? `<ul class="spielothek-rules-tiers">${tableRows}</ul>
       <ul>
        <li>💀 Skull anywhere → always a loss, no matter what else matches ("the house always wins")</li>
        <li>Two matching symbols (no skull) → small consolation win (+${SLOT_PAIR_PAYOUT})</li>
        <li>Otherwise → loss</li>
      </ul>`
    : `<ul class="spielothek-rules-tiers">${tableRows}</ul>
       <ul>
        <li>💀 Totenkopf irgendwo dabei → immer Verlust, egal was sonst passt ("die Bank gewinnt immer")</li>
        <li>Zwei gleiche Symbole (kein Totenkopf) → kleiner Trostgewinn (+${SLOT_PAIR_PAYOUT})</li>
        <li>Sonst → Verlust</li>
      </ul>`;
}

window.SPIELOTHEK_GAME_HANDLERS = window.SPIELOTHEK_GAME_HANDLERS || {};
window.SPIELOTHEK_GAME_HANDLERS.slot = {
  betCost: SLOT_BET_COST,
  play: spinSlot,
  buildResultHtml: buildSlotResultHtml,
  getRulesHtml: getSlotRulesHtml,
  // Wird von renderSpielothekResult() (spielothek.js) genutzt, um genau
  // dann einen kurzen Glow-Effekt auf der jeweiligen Walze auszuloesen,
  // wenn sie tatsaechlich landet - spielothek.js kennt selbst keine
  // slot-spezifischen Zeiten, bekommt sie hier optional mitgeliefert.
  reelStopTimesMs: SLOT_REEL_STOP_TIMES_MS,
  // Muss mindestens so lange sein, wie die laengste Walzen-Dreh-
  // Animation braucht (letzte Walze stoppt bei SLOT_REEL_STOP_TIMES_MS[2]),
  // plus ein kurzer Beat - sonst wuerde der Gewinn/Verlust-Text
  // erscheinen, waehrend die Walzen sichtbar noch drehen.
  resultRevealDelayMs: SLOT_REEL_STOP_TIMES_MS[SLOT_REEL_STOP_TIMES_MS.length - 1] + 250,
};
