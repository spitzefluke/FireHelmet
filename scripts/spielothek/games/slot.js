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

/* Piratenthema statt Fruechten - die alten Kirschen und Zitronen
   waren ein Fremdkoerper in einer Piratensaga. Die Gewichte
   bestimmen, wie haeufig ein Symbol faellt.

   FARBE STATT EMOJI (September 2026)
   Vorher standen hier Emoji. Die sehen auf jedem Geraet anders aus -
   auf Windows flach, auf Apple plastisch, auf Android wieder anders -
   und waren damit der Punkt, der am ehesten billig wirkte. Jetzt sind
   es Strichzeichnungen (siehe SLOT_ICONS), ueberall gleich.

   Emoji trugen allerdings ihre Farbe mit: die goldene Muenze, der
   blaue Edelstein. Einfarbige Striche verlieren diese Staffelung,
   und auf einer laufenden Walze waeren Muenze, Stein und Kiste kaum
   auseinanderzuhalten. Deshalb bekommt jedes Symbol eine feste Farbe,
   die mit der Seltenheit waermer wird - vom stumpfen Zinn der
   haeufigen Dublone bis zum hellen Messing des Feuerhelms. Man sieht
   am Farbton, wie gut ein Treffer ist, ohne die Tabelle zu lesen. */
const SLOT_BASIS_SYMBOLS = [
  { id: "dublone",   weight: 300, farbe: "#9aa3a8" },   // Zinn - das haeufigste Symbol, bewusst das stumpfste
  { id: "papagei",   weight: 230, farbe: "#8f9f88" },   // gedaempftes Gruen
  { id: "kompass",   weight: 160, farbe: "#8b9cb4" },   // Messingblau
  { id: "saebel",    weight: 110, farbe: "#b8a888" },   // helles Holz
  { id: "edelstein", weight:  60, farbe: "#79a8b8" },   // Tuerkis
  { id: "truhe",     weight:  28, farbe: "#c9a04a" },   // Messing
  { id: "helm",      weight:  12, farbe: "#e0a152" },   // warmes Messing - das seltenste, das hellste
];

/* Der Totenkopf ist kein Basissymbol - er kommt mit eigenem Gewicht
   je Walzenzahl dazu (siehe getSlotSymbols). */
const SLOT_TOTENKOPF_FARBE = "#a8564a";

/* ------------------------------------------------------------
   DIE SYMBOLE ALS STRICHZEICHNUNG
   ------------------------------------------------------------
   Aus lucide (https://lucide.dev), ISC-Lizenz, Fassung 1.43.0.
   Uebernommen wurden die Pfade von coins, bird, compass, swords,
   gem, package, flame und skull - zusammen rund 1,6 KB.

   BEWUSST EINGEBETTET STATT PER CDN: die Laufzeit-Bibliothek von
   lucide ersetzt <i data-lucide>-Elemente nachtraeglich im DOM. Eine
   Walze zeichnet bei jeder Drehung fuenfzehn Symbole neu, mal sechs
   Walzen - das waeren neunzig Ersetzungen je Dreh, sichtbar als
   Flackern. Bei 1,6 KB Pfaddaten ist die externe Abhaengigkeit den
   Preis ohnehin nicht wert, samt ihres Ausfallrisikos.
------------------------------------------------------------ */
const SLOT_ICONS = Object.freeze({
  dublone: '<path d="M13.744 17.736a6 6 0 1 1-7.48-7.48" /> <path d="M15 6h1v4" /> <path d="m6.134 14.768.866-.5 2 3.464" /> <circle cx="16" cy="8" r="6" />',
  // lucide/coins
  papagei: '<path d="M16 7h.01" /> <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" /> <path d="m20 7 2 .5-2 .5" /> <path d="M10 18v3" /> <path d="M14 17.75V21" /> <path d="M7 18a6 6 0 0 0 3.84-10.61" />',
  // lucide/bird
  kompass: '<circle cx="12" cy="12" r="10" /> <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />',
  // lucide/compass
  saebel: '<path d="m13 19 6-6" /> <path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5" /> <path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586" /> <path d="m16 16 4 4" /> <path d="m19 21 2-2" /> <path d="m5 14 4 4" /> <path d="m5 21-2-2" /> <path d="M7.5 16.5 4 20" />',
  // lucide/swords
  edelstein: '<path d="M10.5 3 8 9l4 13 4-13-2.5-6" /> <path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" /> <path d="M2 9h20" />',
  // lucide/gem
  truhe: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /> <path d="M12 22V12" /> <polyline points="3.29 7 12 12 20.71 7" /> <path d="m7.5 4.27 9 5.15" />',
  // lucide/package
  helm: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />',
  // lucide/flame
  totenkopf: '<path d="m12.5 17-.5-1-.5 1h1z" /> <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" /> <circle cx="15" cy="12" r="1" /> <circle cx="9" cy="12" r="1" />',
  // lucide/skull
});

/* Ein Symbol als fertiges SVG. currentColor greift die Farbe vom
   umgebenden Element ab, die weiter unten je Symbol gesetzt wird. */
function slotSymbolSvg(symbolId) {
  const pfad = SLOT_ICONS[symbolId];
  if (!pfad) return "";
  return '<svg class="spielothek-slot-icon" viewBox="0 0 24 24" fill="none" '
       + 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
       + 'stroke-linejoin="round" aria-hidden="true">' + pfad + '</svg>';
}

function slotSymbolFarbe(symbol) {
  return symbol.id === "totenkopf" ? SLOT_TOTENKOPF_FARBE : symbol.farbe;
}

/* Ein Symbol samt Farbe, wie es auf der Walze steht. */
function slotSymbolHtml(symbol) {
  return '<span class="spielothek-slot-symbol-inner" style="color:'
       + slotSymbolFarbe(symbol) + '">' + slotSymbolSvg(symbol.id) + '</span>';
}

/* Der Totenkopf faellt je nach Walzenzahl unterschiedlich haeufig -
   und genau das macht das Spiel ueber alle Einsaetze hinweg fair.
   ------------------------------------------------------------
   Vorher war sein Gewicht fest bei 300, und die Mindestgruppe war
   ceil(Walzen/2). Damit sprang die Trefferquote wild: 33 % bei drei
   Walzen, 50 % bei vier, 18 % bei fuenf, 30 % bei sechs. Wer von
   50 auf 60 Dublonen erhoehte, drehte ploetzlich fast dreimal so
   oft ins Leere - ohne dass irgendwo stand, warum. Das war der
   eigentliche Missstand, nicht die Hoehe der Gewinne.

   Jetzt gilt ueberall dieselbe Regel (mindestens zwei gleiche), und
   das Totenkopf-Gewicht gleicht aus, was mehr Walzen an zusaetzlichen
   Paaren mitbringen. Die Werte sind nicht geschaetzt, sondern durch
   Bisektion ueber die vollstaendige Aufzaehlung aller Symbolkombi-
   nationen bestimmt: alle vier landen auf 33 %.

   Ueber sechs Walzen (nur per Freidreh erreichbar) gilt der Wert
   fuer sechs - dort ist die hoehere Quote ein Geschenk, kein Fehler. */
const SLOT_TOTENKOPF_GEWICHT = Object.freeze({ 3: 300, 4: 545, 5: 570, 6: 540 });

/* Die Quoten, die dabei herauskommen - exakt gerechnet, nicht
   simuliert (siehe Kommentar bei SLOT_AUSZAHLUNG). Sie stehen hier,
   weil die Regeln sie anzeigen: ein Spiel, das seine eigenen Chancen
   nennt, muss sie auch stimmen haben. Wer oben ein Gewicht aendert,
   muss diese Zahlen neu ausrechnen. */
const SLOT_TREFFERQUOTE = Object.freeze({ 3: 33.4, 4: 33.0, 5: 33.0, 6: 32.7 });

function getSlotTotenkopfGewicht(reelCount) {
  return SLOT_TOTENKOPF_GEWICHT[reelCount] || SLOT_TOTENKOPF_GEWICHT[SLOT_REEL_COUNT_MAX];
}

/* Der Satz Symbole fuer eine bestimmte Walzenzahl. */
function getSlotSymbols(reelCount) {
  return SLOT_BASIS_SYMBOLS.concat([
    { id: "totenkopf", weight: getSlotTotenkopfGewicht(reelCount), farbe: SLOT_TOTENKOPF_FARBE },
  ]);
}

/* Nur fuer die Anzeige (Emoji-Nachschlag in den Regeln) - die
   Gewichte darin sind fuer die Darstellung ohne Bedeutung. */
const SLOT_SYMBOLS = getSlotSymbols(SLOT_REEL_COUNT_MAX);

/* Die Gewinnregel in einem Satz, und sie gilt bei jedem Einsatz
   gleich: mindestens ZWEI Walzen zeigen dasselbe Symbol, und es
   sind mehr als Totenkoepfe.

   Frueher stand hier ceil(Walzen/2). Das klang sauber, war aber der
   Grund fuer die springende Trefferquote (siehe Kommentar bei
   SLOT_TOTENKOPF_GEWICHT): der Sprung von "2 aus 4" auf "3 aus 5"
   liess die Quote von 50 % auf 18 % fallen. reelCount bleibt als
   Parameter stehen, damit die Aufrufstellen unveraendert lesen. */
function getSlotMinGroup(reelCount) {
  return 2;
}

/* Vielfaches des Einsatzes, nach Walzenzahl und Gruppengroesse.
   ------------------------------------------------------------
   AUSZAHLUNGSQUOTE RUND 94 % (September 2026)
   Das ist der Bereich, in dem ein echtes Geldspielgeraet arbeiten
   muss: gesetzlich zwischen 90 und 96 %. Vorher lag die Tabelle bei
   rund 132 %, dazu kam ein Anteil des Guthabens - der Automat war
   damit eine Gelddruckmaschine, und der tatsaechliche Rueckfluss
   war nicht mehr eine Zahl, sondern haing vom Kontostand ab.

   Jetzt gilt fuer alle dasselbe: Einsatz mal Vielfaches, sonst
   nichts. Kein Guthaben-Anteil, keine Garantie nach einer
   Pechstraehne, keine Prozentstaffel beim Verlust.

   WIE DIE ZAHLEN ENTSTANDEN SIND
   Exakt ausgezaehlt, nicht simuliert - ueber alle Aufteilungen der
   Walzen auf die acht Symbole (Multinomial ueber Anzahlvektoren,
   nicht ueber Positionen: das macht aus 8^10 Moeglichkeiten 19.448).
   Freidrehs sind eingerechnet, denn die zahlen obendrauf, und zwar
   ungleich - "alle Walzen gleich" ist bei drei Walzen viel
   haeufiger als bei sechs.

   Eine Stichprobe taugt hier NICHT: die seltenen Riesengewinne
   tragen den Schnitt, 200.000 Drehungen streuen um mehrere Punkte.
   Wer danach nachregelt, jagt Rauschen. (Genau das ist bei der
   vorigen Fassung passiert, bevor auf Aufzaehlung umgestellt wurde.)

   ERREICHT: 95,4 % bei drei Walzen, 94,1 / 94,5 / 93,9 % bei vier,
   fuenf und sechs. Die drei Walzen liegen 1,4 Punkte hoeher, weil
   ihre Tabelle nur zwei Spalten hat - eine Stufe im Rundungsraster
   ist dort rund anderthalb Punkte wert. Man koennte es mit Werten
   wie 4,7 genauer treffen; dann staende in den Regeln eine Tabelle,
   die niemand liest. Lesbare Zahlen sind hier mehr wert als die
   zweite Nachkommastelle, und die tatsaechlichen Quoten stehen
   ehrlich in SLOT_TREFFERQUOTE.

   Die Trefferquote ist unveraendert: rund jede dritte Drehung
   gewinnt, bei jedem Einsatz. Geaendert hat sich nur die HOEHE der
   Gewinne, nicht ihre Haeufigkeit.

   WER HIER ETWAS AENDERT, muss neu rechnen. Das Verfahren steht
   oben; ohne Nachrechnen stimmt die in den Regeln angezeigte Quote
   nicht mehr, und ein Spiel, das seine eigenen Chancen falsch
   angibt, ist schlimmer als eines, das sie verschweigt.

   Die Tabelle beginnt bei "2 gleiche", auch bei fuenf und sechs
   Walzen. Ein Zweier zahlt dort wenig - bei sechs Walzen teils nur
   den Einsatz zurueck -, aber er rettet die Runde. */
const SLOT_AUSZAHLUNG = Object.freeze({
  3: {
    dublone:   { 2: 2, 3: 5 },
    papagei:   { 2: 2, 3: 6 },
    kompass:   { 2: 3, 3: 8 },
    saebel:    { 2: 4, 3: 12 },
    edelstein: { 2: 7, 3: 20 },
    truhe:     { 2: 13, 3: 40 },
    helm:      { 2: 30, 3: 90 },
  },
  4: {
    dublone:   { 2: 1.5, 3: 4, 4: 14 },
    papagei:   { 2: 2, 3: 6, 4: 17 },
    kompass:   { 2: 3, 3: 8, 4: 25 },
    saebel:    { 2: 4, 3: 11, 4: 30 },
    edelstein: { 2: 6, 3: 19, 4: 55 },
    truhe:     { 2: 13, 3: 40, 4: 120 },
    helm:      { 2: 30, 3: 80, 4: 250 },
  },
  5: {
    dublone:   { 2: 1, 3: 4, 4: 11, 5: 35 },
    papagei:   { 2: 1.5, 3: 4, 4: 13, 5: 40 },
    kompass:   { 2: 2, 3: 7, 4: 19, 5: 55 },
    saebel:    { 2: 3, 3: 9, 4: 25, 5: 80 },
    edelstein: { 2: 5, 3: 15, 4: 45, 5: 130 },
    truhe:     { 2: 10, 3: 30, 4: 90, 5: 270 },
    helm:      { 2: 20, 3: 65, 4: 190, 5: 575 },
  },
  6: {
    dublone:   { 2: 1, 3: 2.5, 4: 7, 5: 25, 6: 70 },
    papagei:   { 2: 1, 3: 3, 4: 9, 5: 30, 6: 90 },
    kompass:   { 2: 1.5, 3: 4, 4: 13, 5: 40, 6: 120 },
    saebel:    { 2: 2, 3: 7, 4: 19, 5: 55, 6: 170 },
    edelstein: { 2: 4, 3: 11, 4: 35, 5: 100, 6: 290 },
    truhe:     { 2: 7, 3: 20, 4: 65, 5: 200, 6: 575 },
    helm:      { 2: 15, 3: 45, 4: 140, 5: 420, 6: 1250 },
  },
});

/* Grobe Einstufung fuer Konfetti und Aendii-Zitate (spielothek.js
   wertet nur diese Namen aus, die Zahlen dahinter sind egal). */
function getSlotTier(multiplier) {
  // Auf die neue Tabelle nachgezogen. Wichtig ist nur, dass die
  // Stufen ueber alle Walzenzahlen hinweg dasselbe bedeuten - ein
  // "veryBig" bei drei Walzen soll sich so anfuehlen wie eins bei
  // sechs, sonst wirkt das Konfetti willkuerlich.
  if (multiplier >= 250) return "jackpot";
  if (multiplier >= 60) return "veryBig";
  if (multiplier >= 18) return "big";
  if (multiplier >= 6) return "medium";
  return "small";
}

/* ------------------------------------------------------------
   FRUEHER STAND HIER: GUTHABEN-ANTEIL
   ------------------------------------------------------------
   Auf den Grundgewinn kam ein Anteil des Kontostands obendrauf,
   0,4 bis 12 Prozent je nach Symbol. Das war die Antwort auf eine
   damalige Schieflage: der Verlust hing am Guthaben, der Gewinn nur
   am Einsatz - bei einem grossen Konto fuehlte sich kein Treffer
   mehr nach etwas an.

   Beides ist jetzt weg. Der Verlust ist wieder schlicht der Einsatz
   (siehe spielothek.js), damit braucht auch der Gewinn keinen
   Ausgleich mehr. Was zaehlt, ist allein die Tabelle oben - und die
   gilt fuer jeden gleich, unabhaengig davon, wie viel er hat.
------------------------------------------------------------ */

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
   FRUEHER STAND HIER: PITY-SYSTEM
   ------------------------------------------------------------
   Nach zehn Nieten in Folge gewann die naechste Drehung garantiert.
   Gut gemeint, aber es machte die Wahrscheinlichkeit abhaengig von
   der eigenen Vorgeschichte - ein echtes Geldspielgeraet tut das
   nicht, und genau darum ging es beim Umbau. Jede Drehung ist jetzt
   von jeder anderen unabhaengig.
------------------------------------------------------------ */


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
  const symbole = getSlotSymbols(reelCount);
  return Array.from({ length: reelCount },
    () => pickWeightedSlotSymbol(symbole, random));
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

function calculateSlotResult(betAmount, random = Math.random) {
  const bet = clampSlotBet(betAmount);
  const startWalzen = getSlotReelCountForBet(bet);

  const reels = generateRandomSlotReels(startWalzen, random);
  const bewertung = scoreSlotReels(reels);

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

  /* Der zweite Parameter (Guthaben) wird nicht mehr gebraucht - er
     floss frueher in den Guthaben-Anteil. spielothek.js uebergibt
     ihn weiterhin, das schadet nicht. */
  play: function requestSlotPlay(betAmount) {
    return calculateSlotResult(betAmount, Math.random);
  },

  buildResultHtml: buildSlotResultHtml,
  getRulesHtml: getSlotRulesHtml,
};


/* ------------------------------------------------------------
   DARSTELLUNG
------------------------------------------------------------ */
const SLOT_SPIN_FILLER_COUNT = 14;

function buildSlotReelStripHtml(finalSymbol, reelCount) {
  const symbole = getSlotSymbols(reelCount || SLOT_REEL_COUNT_MAX);
  const fillers = Array.from({ length: SLOT_SPIN_FILLER_COUNT },
    () => pickWeightedSlotSymbol(symbole));

  return [...fillers, finalSymbol]
    .map((symbol) => `<span>${slotSymbolHtml(symbol)}</span>`)
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
              ${buildSlotReelStripHtml(symbol, durchgang.reels.length)}
            </span>
          </span>
        `;
        })
        .join("");

      const breit = durchgang.reels.length > 6 ? " spielothek-slot-reels-breit" : "";
      const gewonnen = durchgang.multiplier > 0 ? " hat-treffer" : "";

      /* Wie der Gewinn zustande kam, in Worten. Seit dem Wegfall
         des Guthaben-Anteils ist das eine einzige Rechnung, und
         die soll dastehen statt nur des Ergebnisses. */
      const aufschluesselung = durchgang.multiplier > 0
        ? `<p class="spielothek-gewinn-teile">
             <span>${durchgang.multiplier}\u00d7 Einsatz</span>
           </p>`
        : "";
      const kopf = durchgang.freidreh
        ? `<p class="spielothek-freidreh-kopf">Freidreh ${nr} — ${durchgang.reels.length} Walzen, geschenkt</p>`
        : "";

      return `
        ${kopf}
        <div class="spielothek-slot-reels spielothek-slot-reels-tier-${durchgang.tier || "none"}${breit}${gewonnen}">
          ${reels}
        </div>
        ${aufschluesselung}
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
  /* Symbol-Nachschlag fuer die Tabelle. Frueher waren das Emoji,
     jetzt dieselben Strichzeichnungen wie auf den Walzen - sonst
     muesste man beim Lesen der Tabelle uebersetzen. */
  const zeichen = {};
  SLOT_SYMBOLS.forEach((sym) => { zeichen[sym.id] = slotSymbolHtml(sym); });

  /* Eine Tabelle je Walzenzahl: was zahlt welche Gruppengroesse.
     Die Zahlen kommen direkt aus SLOT_AUSZAHLUNG - die Regeln
     koennen damit nie von der tatsaechlichen Auszahlung abweichen. */
  const tabelle = (n) => {
    const spalten = [];
    for (let k = getSlotMinGroup(n); k <= n; k++) spalten.push(k);

    /* Die kleinste Gruppe ist der Normalfall - fast jeder Treffer
       ist einer. Sie wird deshalb hervorgehoben, damit niemand die
       Tabelle nach den Traumzahlen ganz rechts liest und dann
       enttaeuscht ist. */
    const kopf = spalten
      .map((k, i) => `<th${i === 0 ? ' class="ist-normalfall"' : ""}>${k}× ${isEn ? "same" : "gleich"}</th>`)
      .join("");

    const zeilen = ["dublone", "papagei", "kompass", "saebel", "edelstein", "truhe", "helm"]
      .map((id) => {
        const zellen = spalten
          .map((k, i) => `<td${i === 0 ? ' class="ist-normalfall"' : ""}>${SLOT_AUSZAHLUNG[n][id][k]}×</td>`)
          .join("");
        return `<tr><th scope="row">${zeichen[id]} ${name[id]}</th>${zellen}</tr>`;
      })
      .join("");

    return `
      <table class="spielothek-regeln-tabelle">
        <caption>${n} ${isEn ? "reels" : "Walzen"} — ${isEn ? "bet" : "Einsatz"} ${
          n === 3 ? "10–30" : n === 4 ? "40–50" : n === 5 ? "60–80" : "90–100"
        } 🪙 <span class="spielothek-regeln-quote">${
          isEn ? "wins" : "gewinnt"
        } ${String(SLOT_TREFFERQUOTE[n]).replace(".", isEn ? "." : ",")} %</span></caption>
        <thead><tr><th>${isEn ? "Symbol" : "Symbol"}</th>${kopf}</tr></thead>
        <tbody>${zeilen}</tbody>
      </table>
    `;
  };

  const regel = isEn
    ? `You win when <strong>at least two reels</strong> show the same symbol — and there are more of them than skulls ${zeichen.totenkopf}. Same rule at every bet.`
    : `Du gewinnst, wenn <strong>mindestens zwei Walzen</strong> dasselbe Symbol zeigen — und es mehr sind als Totenköpfe ${zeichen.totenkopf}. Dieselbe Regel bei jedem Einsatz.`;

  const einsatz = isEn
    ? `Your bet (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, steps of ${SLOT_BET_STEP}) decides how many reels spin: 3 up to 30, 4 up to 50, 5 up to 80, 6 above that. <strong>Roughly one spin in three wins at every bet</strong>, and every bet pays back about the same — a bigger bet buys bigger prizes, not better odds. More reels means more skulls, which is what keeps the odds level.`
    : `Dein Einsatz (${SLOT_MIN_BET}–${SLOT_MAX_BET} 🪙, in Schritten von ${SLOT_BET_STEP}) bestimmt die Zahl der Walzen: 3 bis 30, 4 bis 50, 5 bis 80, 6 darüber. <strong>Bei jedem Einsatz gewinnt etwa jede dritte Drehung</strong>, und im Schnitt zahlt jeder Einsatz gleich gut zurück — ein höherer Einsatz kauft größere Preise, keine besseren Chancen. Mehr Walzen bringen mehr Totenköpfe mit, genau das hält die Chancen gleich.`;

  /* Der Verlust ist wieder schlicht der Einsatz. Frueher stand hier
     eine siebenstufige Prozentstaffel auf das Guthaben - sie ist mit
     dem Umbau auf 94 % entfallen, zusammen mit dem Guthaben-Anteil
     beim Gewinn. Beide haengten am Kontostand; ein Geraet, das je
     nach Spieler anders rechnet, war genau das, was weg sollte. */
  const verlust = isEn
    ? `<strong>On a loss</strong> you lose your bet — nothing more. No share of your balance, no matter how much you have.`
    : `<strong>Bei einer Niete</strong> verlierst du deinen Einsatz — mehr nicht. Kein Anteil deines Guthabens, egal wie viel du hast.`;

  /* Die Auszahlungsquote gehoert sichtbar auf die Seite. Sie ist die
     eine Zahl, die sagt, was das Geraet auf Dauer tut - wer sie
     verschweigt, laesst die Leute raten. */
  const quote = isEn
    ? `<strong>Payout rate about 94 %.</strong> Over many spins the machine pays back roughly 94 doubloons per 100 staked — like a real arcade machine, which is required to sit between 90 and 96 %. Every spin is independent: no streak counter, no guaranteed win after a run of losses, and your balance never changes the odds or the payout.`
    : `<strong>Auszahlungsquote rund 94 %.</strong> Über viele Drehungen zahlt der Automat etwa 94 von 100 eingesetzten Dublonen zurück — wie ein echtes Geldspielgerät, das zwischen 90 und 96 % liegen muss. Jede Drehung steht für sich: kein Zähler im Hintergrund, kein garantierter Gewinn nach einer Pechsträhne, und dein Guthaben ändert weder die Chancen noch die Auszahlung.`;

  const freidreh = isEn
    ? `<strong>All reels the same?</strong> You get a free spin with ${SLOT_FREIDREH_EXTRA_WALZEN} extra reels on top — winnings add up, up to ${SLOT_FREIDREH_MAX_KETTE} in a row.`
    : `<strong>Alle Walzen gleich?</strong> Dann gibt es einen Freidreh mit ${SLOT_FREIDREH_EXTRA_WALZEN} Walzen mehr obendrauf — die Gewinne addieren sich, höchstens ${SLOT_FREIDREH_MAX_KETTE} am Stück.`;

  return `
    <p class="spielothek-rules-bet-hint">${regel}</p>
    <p class="spielothek-rules-bet-hint">${einsatz}</p>
    <p class="spielothek-rules-bet-hint">${verlust}</p>
    <p class="spielothek-rules-bet-hint">${quote}</p>
    <p class="spielothek-rules-bet-hint">${freidreh}</p>
    ${tabelle(3)}
    ${tabelle(4)}
    ${tabelle(5)}
    ${tabelle(6)}
  `;
}
