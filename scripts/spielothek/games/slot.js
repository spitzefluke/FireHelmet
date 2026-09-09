/* ============================================================
   SPIELOTHEK - EINARMIGER BANDIT
   ------------------------------------------------------------
   WICHTIG:
   - Diese Datei ist NICHT die Vertrauensgrenze.
   - Der Client BERECHNET das Ergebnis (Zufall lokal im Browser) -
     die Datenbank prueft NICHT die einzelnen Walzen nach, sondern
     nur, dass der resultierende Kontostand-Sprung einen festen
     Deckel nicht uebersteigt (app.valid_players_write() in
     supabase/game-migration/01-players-ship-progression.sql).
     Bewusste, bestehende Vereinfachung - rein virtuelle Waehrung,
     kein echtes Geld (siehe Kopfkommentar in spielothek.js).

   BALANCE (September 2026 neu gerechnet)
   ------------------------------------------------------------
   Vorher war die Auszahlung kaputt, und zwar in beide Richtungen:
   bei zwei Walzen (kleiner Einsatz) kamen nur 36 % des Einsatzes
   zurueck, bei sechs Walzen 363 %. Kleine Eintraege waren eine
   Falle, grosse eine Gelddruckmaschine. Ursache war die
   Paar-Auszahlung: sie zahlte mindestens den doppelten Einsatz,
   trat bei sechs Walzen aber in fast vier von fuenf Drehungen ein.

   Jetzt liegt der Rueckfluss bei JEDEM Einsatz bei rund 132 % -
   exakt ausgerechnet ueber alle Kombinationen, nicht geschaetzt.
   Die Zahlen unten sind das Ergebnis dieser Rechnung; wer sie
   aendert, muss sie neu rechnen (scratchpad-Skript im Commit,
   Verfahren im Kommentar bei SLOT_AUSZAHLUNG beschrieben).

   Bewusst NICHT erreicht: "mehr Walzen = seltener gewinnen".
   Bei fester Mindestgruppe steigt die Trefferquote mit jeder
   Walze, ein Sprung in der Mindestgruppe laesst sie einbrechen -
   eine glatt fallende Kurve braeuchte eine Regel wie "Vorsprung
   vor den Totenkoepfen: 1 bei 3 Walzen, 2 bei 4, 1 bei 5, 3 bei
   6". Das versteht niemand mehr. Stattdessen kommt der Reiz des
   hohen Einsatzes aus der Auszahlungshoehe (Feuerhelm: 135-fach
   bei drei Walzen, 1175-fach bei sechs).
============================================================ */

/* Piratenthema statt Fruechten - die alten Kirschen und Zitronen
   waren ein Fremdkoerper in einer Piratensaga. Die Gewichte
   bestimmen, wie haeufig ein Symbol faellt (Summe hier 1200). */
const SLOT_SYMBOLS = [
  { id: "dublone",   emoji: "🪙",  weight: 300 },
  { id: "papagei",   emoji: "🦜",  weight: 230 },
  { id: "kompass",   emoji: "🧭",  weight: 160 },
  { id: "saebel",    emoji: "⚔️",  weight: 110 },
  { id: "edelstein", emoji: "💎",  weight: 60 },
  { id: "truhe",     emoji: "📦",  weight: 28 },
  { id: "helm",      emoji: "🔥",  weight: 12 },
  { id: "totenkopf", emoji: "☠️",  weight: 300 },
];

const SLOT_MIN_BET = 10;
const SLOT_MAX_BET = 100;
const SLOT_BET_STEP = 10;
const SLOT_DEFAULT_BET = 20;

/* Zwei Walzen gibt es nicht mehr: dort lagen strukturell hoechstens
   18 % Trefferquote drin (beide Walzen muessen exakt gleich sein),
   das war der unangenehmste Teil des alten Spiels. Der kleinste
   Einsatz startet deshalb bei drei Walzen. */
const SLOT_REEL_COUNT_MIN = 3;
const SLOT_REEL_COUNT_MAX = 6;

function getSlotReelCountForBet(bet) {
  if (bet <= 30) return 3;
  if (bet <= 50) return 4;
  if (bet <= 80) return 5;
  return 6;
}

/* Die Gewinnregel in einem Satz: mindestens die Haelfte der Walzen
   zeigt dasselbe Symbol, und es sind mehr als Totenkoepfe. */
function getSlotMinGroup(reelCount) {
  return Math.ceil(reelCount / 2);
}

/* Vielfaches des Einsatzes, nach Walzenzahl und Gruppengroesse.
   ------------------------------------------------------------
   Hergeleitet, nicht geraten: Grundwert (Gesamtgewicht /
   Symbolgewicht) hoch 0,9, mal 3 je Treffer ueber dem Minimum,
   danach je Walzenzahl so skaliert, dass der Rueckfluss bei 132 %
   landet. Nach dem Runden auf glatte Werte bleiben 131-132 %.

   Von urspruenglich 110 % auf 132 % angehoben (Auftrag: "erhoehe den
   gewinn", rund 20 % mehr). Zusammen mit dem Prozentabzug bei Nieten
   ergibt das je nach Guthaben immer noch ein Minus fuer grosse
   Konten - siehe spielothekVerlustAbzug() in spielothek.js. */
const SLOT_AUSZAHLUNG = Object.freeze({
  3: {
    dublone: { 2: 2.5, 3: 7.5 },
    papagei: { 2: 3,   3: 9.5 },
    kompass: { 2: 4.5, 3: 13 },
    saebel:  { 2: 6,   3: 18 },
    edelstein: { 2: 11, 3: 32 },
    truhe:   { 2: 21,  3: 63 },
    helm:    { 2: 45,  3: 135 },
  },
  4: {
    dublone: { 2: 1.5, 3: 4,  4: 12 },
    papagei: { 2: 1.5, 3: 5,  4: 16 },
    kompass: { 2: 2.5, 3: 7,  4: 22 },
    saebel:  { 2: 3.5, 3: 10, 4: 30 },
    edelstein: { 2: 6, 3: 17, 4: 52 },
    truhe:   { 2: 11,  3: 34, 4: 105 },
    helm:    { 2: 25,  3: 74, 4: 220 },
  },
  5: {
    dublone: { 3: 4.5, 4: 14,  5: 41 },
    papagei: { 3: 6,   4: 18,  5: 53 },
    kompass: { 3: 8,   4: 24,  5: 73 },
    saebel:  { 3: 11,  4: 34,  5: 100 },
    edelstein: { 3: 20, 4: 59, 5: 175 },
    truhe:   { 3: 39,  4: 115, 5: 350 },
    helm:    { 3: 83,  4: 250, 5: 750 },
  },
  6: {
    dublone: { 3: 2.5, 4: 7,   5: 22,  6: 65 },
    papagei: { 3: 3,   4: 9,   5: 28,  6: 83 },
    kompass: { 3: 4,   4: 13,  5: 38,  6: 115 },
    saebel:  { 3: 6,   4: 18,  5: 53,  6: 160 },
    edelstein: { 3: 10, 4: 31, 5: 92,  6: 275 },
    truhe:   { 3: 20,  4: 61,  5: 185, 6: 550 },
    helm:    { 3: 44,  4: 130, 5: 390, 6: 1175 },
  },
});

/* Grobe Einstufung fuer Konfetti und Aendii-Zitate (spielothek.js
   wertet nur diese Namen aus, die Zahlen dahinter sind egal). */
function getSlotTier(multiplier) {
  // Grenzen um denselben Faktor mitgezogen wie die Tabelle selbst,
  // damit dieselben Ergebnisse weiterhin dieselbe Stufe (und damit
  // dasselbe Konfetti) ausloesen wie vorher.
  if (multiplier >= 240) return "jackpot";
  if (multiplier >= 60) return "veryBig";
  if (multiplier >= 18) return "big";
  if (multiplier >= 6) return "medium";
  return "small";
}

/* Sicherheits-Deckel unterhalb des serverseitig erzwungenen Limits
   (currency darf pro Schreibvorgang um hoechstens 30000 steigen,
   siehe app.valid_players_write()). Sechs Feuerhelme auf vollem
   Einsatz waeren 100 x 980 = 98000, dazu koennen Freidrehs kommen -
   ohne Deckel wuerde die Datenbank den Schreibvorgang ablehnen,
   obwohl die Walzen den Gewinn bereits angezeigt haben. */
const SLOT_MAX_SAFE_PAYOUT = 25000;

/* ------------------------------------------------------------
   FREIDREH
   ------------------------------------------------------------
   Zeigen ALLE Walzen dasselbe Symbol, gibt es einen kostenlosen
   Dreh mit vier Walzen mehr; der Gewinn kommt obendrauf. Das kann
   sich hoechstens dreimal wiederholen.

   Die Anzeige ist bei zehn Walzen gedeckelt: aus sechs Walzen
   wuerden sonst 10, 14 und 18 - auf einem Handy nicht mehr
   bedienbar. Ab sieben Walzen legt die Darstellung auf zwei Reihen
   um (siehe .spielothek-slot-reels-breit).
------------------------------------------------------------ */
const SLOT_FREIDREH_EXTRA_WALZEN = 4;
const SLOT_FREIDREH_MAX_KETTE = 3;
const SLOT_FREIDREH_MAX_WALZEN = 10;

function alleWalzenGleich(reels) {
  return reels.length > 0 && reels.every((s) => s.id === reels[0].id);
}

/* ------------------------------------------------------------
   PITY-SYSTEM
   ------------------------------------------------------------
   Rein clientseitig (localStorage), unkritisch fuer die Sicherheit,
   da das Ergebnis ohnehin komplett client-berechnet ist. Zaehlt
   Drehungen OHNE Gewinn; die zehnte in Folge gewinnt garantiert.

   NEU: der geschenkte Gewinn ist bewusst ein KLEINER - genau die
   Mindestgruppe mit einem haeufigen Symbol. Vorher konnte das Pity
   auch einen Riesengewinn erzwingen, was die Rechnung oben
   verzerrt haette.
------------------------------------------------------------ */
const SLOT_PITY_SPIN_THRESHOLD = 10;
const SLOT_PITY_STORAGE_KEY = "spielothekSlotSpinsSinceWin";

function getSlotSpinsSinceWin() {
  try {
    return parseInt(localStorage.getItem(SLOT_PITY_STORAGE_KEY) || "0", 10) || 0;
  } catch (err) {
    // z.B. Privatmodus - Zaehler startet wieder bei 0, kein Blocker.
    return 0;
  }
}

function setSlotSpinsSinceWin(n) {
  try {
    localStorage.setItem(SLOT_PITY_STORAGE_KEY, String(n));
  } catch (err) {
    /* s.o. - rein kosmetisch */
  }
}


/* ------------------------------------------------------------
   SPIELBERECHNUNG
------------------------------------------------------------ */

function pickWeightedSlotSymbol(symbols, random = Math.random) {
  const total = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = random() * total;

  for (const symbol of symbols) {
    if (roll < symbol.weight) return symbol;
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
  // Bei vielen Walzen wird der Takt kuerzer, sonst dauert ein
  // Zehn-Walzen-Freidreh ueber sieben Sekunden.
  const takt = reelCount > 6 ? 320 : 600;
  return Array.from({ length: reelCount }, (_, i) => 900 + i * takt);
}

function generateRandomSlotReels(reelCount, random = Math.random) {
  return Array.from({ length: reelCount },
    () => pickWeightedSlotSymbol(SLOT_SYMBOLS, random));
}

/* Erzwungener KLEINER Gewinn fuers Pity: genau die Mindestgruppe,
   und zwar mit einem der beiden haeufigsten (= billigsten)
   Symbole. Die uebrigen Walzen bekommen nie einen Totenkopf und
   nie dasselbe Symbol - sonst koennte daraus versehentlich ein
   grosser Gewinn oder gar ein Freidreh werden. */
function generateForcedWinSlotReels(reelCount, random = Math.random) {
  const gruppe = getSlotMinGroup(reelCount);
  const billig = SLOT_SYMBOLS.filter((s) => s.id === "dublone" || s.id === "papagei");
  const treffer = pickWeightedSlotSymbol(billig, random);
  const rest = SLOT_SYMBOLS.filter((s) => s.id !== "totenkopf" && s.id !== treffer.id);

  const plaetze = new Set();
  while (plaetze.size < gruppe) {
    plaetze.add(Math.floor(random() * reelCount));
  }

  return Array.from({ length: reelCount }, (_, i) =>
    plaetze.has(i) ? treffer : pickWeightedSlotSymbol(rest, random));
}

/* Bewertet EIN Walzenbild. Gibt Vielfaches und Einstufung zurueck,
   noch ohne Einsatz und ohne Freidreh. */
function scoreSlotReels(reels) {
  const counts = {};
  let skullCount = 0;

  reels.forEach((symbol) => {
    if (symbol.id === "totenkopf") { skullCount++; return; }
    counts[symbol.id] = (counts[symbol.id] || 0) + 1;
  });

  let bestId = null;
  let bestCount = 0;
  Object.keys(counts).forEach((id) => {
    if (counts[id] > bestCount) { bestCount = counts[id]; bestId = id; }
  });

  const mindestens = getSlotMinGroup(reels.length);
  if (bestCount < mindestens || bestCount <= skullCount) {
    return { multiplier: 0, tier: null, bestId: null, bestCount, skullCount, trefferIndex: [] };
  }

  /* Welche Walzen den Treffer gebracht haben - die Anzeige hebt genau
     diese hervor, statt dass jeder selbst suchen muss, warum das ein
     Gewinn war. */
  const trefferIndex = [];
  reels.forEach((symbol, i) => { if (symbol.id === bestId) trefferIndex.push(i); });

  // Bei einem Freidreh koennen mehr Walzen laufen, als in der
  // Tabelle stehen - dann gilt die Zeile fuer die hoechste bekannte
  // Walzenzahl, und eine groessere Gruppe zahlt je Treffer dreifach.
  const tabelle = SLOT_AUSZAHLUNG[reels.length] || SLOT_AUSZAHLUNG[SLOT_REEL_COUNT_MAX];
  const zeile = tabelle[bestId] || {};
  const bekannt = Object.keys(zeile).map(Number);
  const hoechste = bekannt.length ? Math.max(...bekannt) : 0;

  let multiplier = zeile[bestCount];
  if (multiplier === undefined && hoechste) {
    multiplier = zeile[hoechste] * Math.pow(3, bestCount - hoechste);
  }
  if (!multiplier) {
    return { multiplier: 0, tier: null, bestId: null, bestCount, skullCount, trefferIndex: [] };
  }

  return { multiplier, tier: getSlotTier(multiplier), bestId, bestCount, skullCount, trefferIndex };
}

function calculateSlotResult(betAmount, random = Math.random, forcePity = false) {
  const bet = clampSlotBet(betAmount);
  const startWalzen = getSlotReelCountForBet(bet);

  let reels = generateRandomSlotReels(startWalzen, random);
  let bewertung = scoreSlotReels(reels);

  // Pity greift nur ein, wenn der Dreh sonst eine Niete waere - ein
  // natuerlicher (evtl. groesserer) Gewinn wird nie heruntergestuft.
  if (bewertung.multiplier === 0 && forcePity) {
    reels = generateForcedWinSlotReels(startWalzen, random);
    bewertung = scoreSlotReels(reels);
  }

  const durchgaenge = [{ reels, ...bewertung, walzen: reels.length }];
  let payout = Math.round(bet * bewertung.multiplier);
  let besteStufe = bewertung.tier;

  // Freidrehs: alle Walzen gleich -> kostenloser Dreh mit vier
  // Walzen mehr, Gewinn kommt obendrauf.
  let letzte = reels;
  let kette = 0;
  while (kette < SLOT_FREIDREH_MAX_KETTE && alleWalzenGleich(letzte)) {
    const naechste = Math.min(SLOT_FREIDREH_MAX_WALZEN,
                              letzte.length + SLOT_FREIDREH_EXTRA_WALZEN);
    if (naechste <= letzte.length) break;   // Deckel erreicht

    const frei = generateRandomSlotReels(naechste, random);
    const bew = scoreSlotReels(frei);
    durchgaenge.push({ reels: frei, ...bew, walzen: frei.length, freidreh: true });
    payout += Math.round(bet * bew.multiplier);
    if (bew.tier && (!besteStufe || bew.multiplier > bewertung.multiplier)) besteStufe = bew.tier;
    letzte = frei;
    kette++;
  }

  payout = Math.min(payout, SLOT_MAX_SAFE_PAYOUT);

  const letzterDurchgang = durchgaenge[durchgaenge.length - 1];
  const reelStopTimesMs = buildSlotReelStopTimesMs(letzterDurchgang.reels.length);

  return Object.freeze({
    reels: letzterDurchgang.reels,
    durchgaenge,
    freidrehs: durchgaenge.length - 1,
    bet,
    win: payout > 0,
    payout,
    tier: besteStufe,
    reelCount: letzterDurchgang.reels.length,
    reelStopTimesMs,
    resultRevealDelayMs: reelStopTimesMs[reelStopTimesMs.length - 1] + 250,
  });
}


/* ------------------------------------------------------------
   CLIENT-API
   ------------------------------------------------------------
   play() zahlt nichts aus. Das tatsaechliche Ergebnis entsteht
   erst durch den serverseitig geprueften Schreibvorgang in
   spielothek.js.
------------------------------------------------------------ */

window.SPIELOTHEK_GAME_HANDLERS = window.SPIELOTHEK_GAME_HANDLERS || {};

window.SPIELOTHEK_GAME_HANDLERS.slot = {
  variableBet: true,
  minBet: SLOT_MIN_BET,
  maxBet: SLOT_MAX_BET,
  betStep: SLOT_BET_STEP,
  defaultBet: SLOT_DEFAULT_BET,

  // Nur fuer Tests und Server-Code.
  calculateResult: calculateSlotResult,

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
const SLOT_SPIN_FILLER_COUNT = 14;

function buildSlotReelStripHtml(finalSymbol) {
  const fillers = Array.from({ length: SLOT_SPIN_FILLER_COUNT },
    () => pickWeightedSlotSymbol(SLOT_SYMBOLS));

  return [...fillers, finalSymbol]
    .map((symbol) => `<span>${symbol.emoji}</span>`)
    .join("");
}

function buildSlotResultHtml(result) {
  // Jeder Durchgang bekommt eine eigene Reihe - so sieht man beim
  // Freidreh, woher der Gewinn kam, statt nur das letzte Bild.
  return (result.durchgaenge || [{ reels: result.reels }])
    .map((durchgang, nr) => {
      const stops = buildSlotReelStopTimesMs(durchgang.reels.length);
      const treffer = durchgang.trefferIndex || [];
      const reels = durchgang.reels
        .map((symbol, index) => {
          /* Zwei Markierungen fuer die Darstellung: die Walzen, die den
             Treffer gebracht haben (leuchten nach dem Landen auf), und
             die Totenkoepfe (lachen bei einer Niete). */
          const marken = [
            treffer.includes(index) ? " ist-treffer" : "",
            symbol.id === "totenkopf" ? " ist-totenkopf" : "",
          ].join("");
          return `
          <span
            class="spielothek-slot-symbol spielothek-slot-spin${marken}"
            style="--slot-reel-duration:${stops[index]}ms"
          >
            <span class="spielothek-slot-strip">
              ${buildSlotReelStripHtml(symbol)}
            </span>
          </span>
        `;
        })
        .join("");

      const breit = durchgang.reels.length > 6 ? " spielothek-slot-reels-breit" : "";
      const gewonnen = durchgang.multiplier > 0 ? " hat-treffer" : "";
      const kopf = durchgang.freidreh
        ? `<p class="spielothek-freidreh-kopf">🎁 Freidreh ${nr} — ${durchgang.reels.length} Walzen, geschenkt</p>`
        : "";

      return `
        ${kopf}
        <div class="spielothek-slot-reels spielothek-slot-reels-tier-${durchgang.tier || "none"}${breit}${gewonnen}">
          ${reels}
        </div>
      `;
    })
    .join("");
}


function getSlotRulesHtml(lang) {
  const isEn = lang === "en";

  const name = {
    dublone:   isEn ? "Doubloon"    : "Dublone",
    papagei:   isEn ? "Parrot"      : "Papagei",
    kompass:   isEn ? "Compass"     : "Kompass",
    saebel:    isEn ? "Sabre"       : "Säbel",
    edelstein: isEn ? "Gem"         : "Edelstein",
    truhe:     isEn ? "Chest"       : "Truhe",
    helm:      isEn ? "Fire helmet" : "Feuerhelm",
  };
  const emoji = {};
  SLOT_SYMBOLS.forEach((s) => { emoji[s.id] = s.emoji; });

  /* Eine Tabelle je Walzenzahl: was zahlt welche Gruppengroesse.
     Die Zahlen kommen direkt aus SLOT_AUSZAHLUNG - die Regeln
     koennen damit nie von der tatsaechlichen Auszahlung abweichen. */
  const tabelle = (n) => {
    const spalten = [];
    for (let k = getSlotMinGroup(n); k <= n; k++) spalten.push(k);

    const kopf = spalten
      .map((k) => `<th>${k}× ${isEn ? "same" : "gleich"}</th>`)
      .join("");

    const zeilen = ["dublone", "papagei", "kompass", "saebel", "edelstein", "truhe", "helm"]
      .map((id) => {
        const zellen = spalten
          .map((k) => `<td>${SLOT_AUSZAHLUNG[n][id][k]}×</td>`)
          .join("");
        return `<tr><th scope="row">${emoji[id]} ${name[id]}</th>${zellen}</tr>`;
      })
      .join("");

    return `
      <table class="spielothek-regeln-tabelle">
        <caption>${n} ${isEn ? "reels" : "Walzen"} — ${isEn ? "bet" : "Einsatz"} ${
          n === 3 ? "10–30" : n === 4 ? "40–50" : n === 5 ? "60–80" : "90–100"
        } 🪙</caption>
        <thead><tr><th>${isEn ? "Symbol" : "Symbol"}</th>${kopf}</tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
    `;
  };

  const regel = isEn
    ? `You win when <strong>at least half the reels</strong> show the same symbol — and there are more of them than skulls ${emoji.totenkopf}.`
    : `Du gewinnst, wenn <strong>mindestens die Hälfte der Walzen</strong> dasselbe Symbol zeigt — und es mehr sind als Totenköpfe ${emoji.totenkopf}.`;

  const einsatz = isEn
    ? `Your bet (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, steps of ${SLOT_BET_STEP}) decides how many reels spin: 3 up to 30, 4 up to 50, 5 up to 80, 6 above that. Every bet pays back about the same on average — a bigger bet buys bigger prizes, not better odds.`
    : `Dein Einsatz (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in Schritten von ${SLOT_BET_STEP}) bestimmt die Zahl der Walzen: 3 bis 30, 4 bis 50, 5 bis 80, 6 darüber. Im Schnitt zahlt jeder Einsatz gleich gut zurück — ein höherer Einsatz kauft größere Preise, keine besseren Chancen.`;

  /* Die Staffelung steht in spielothek.js (SPIELOTHEK_VERLUST_STUFEN).
     Hier bewusst als Text und nicht aus der Konstante gebaut: die
     Regeln sollen die Stufen in Worten erklaeren, nicht nur Zahlen
     auflisten. Wer dort etwas aendert, muss diesen Satz mitziehen. */
  const verlust = isEn
    ? `<strong>On a loss</strong> you don't lose your bet — instead a share of your balance goes overboard: 1 % below 500 doubloons, 3 % below 2000, 5 % below 10 000, 8 % below 25 000, 12 % above. Below 200 doubloons nothing is taken beyond the bet.`
    : `<strong>Bei einer Niete</strong> verlierst du nicht den Einsatz — stattdessen geht ein Teil deines Guthabens über Bord: 1 % unter 500 Dublonen, 3 % unter 2000, 5 % unter 10 000, 8 % unter 25 000, 12 % darüber. Unter 200 Dublonen wird nichts über den Einsatz hinaus genommen.`;

  const freidreh = isEn
    ? `<strong>All reels the same?</strong> You get a free spin with ${SLOT_FREIDREH_EXTRA_WALZEN} extra reels on top — winnings add up, up to ${SLOT_FREIDREH_MAX_KETTE} in a row.`
    : `<strong>Alle Walzen gleich?</strong> Dann gibt es einen Freidreh mit ${SLOT_FREIDREH_EXTRA_WALZEN} Walzen mehr obendrauf — die Gewinne addieren sich, höchstens ${SLOT_FREIDREH_MAX_KETTE} am Stück.`;

  const pity = isEn
    ? `No win for ${SLOT_PITY_SPIN_THRESHOLD} spins in a row? The next one wins for sure — a small one.`
    : `${SLOT_PITY_SPIN_THRESHOLD} Drehungen in Folge ohne Gewinn? Die nächste gewinnt garantiert — klein, aber sicher.`;

  return `
    <p class="spielothek-rules-bet-hint">${regel}</p>
    <p class="spielothek-rules-bet-hint">${einsatz}</p>
    <p class="spielothek-rules-bet-hint">${verlust}</p>
    <p class="spielothek-rules-bet-hint">${freidreh}</p>
    <p class="spielothek-rules-bet-hint">${pity}</p>
    ${tabelle(3)}
    ${tabelle(4)}
    ${tabelle(5)}
    ${tabelle(6)}
  `;
}
