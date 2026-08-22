/* ======================================================
   THE CHALLENGE - RUNDEN-NAMEN + KLEINE ANZEIGE-HELFER
   ---------------------------------------------------
   Reine Konstanten/Umrechnungen, keine Datenbank-/DOM-Zugriffe -
   analog zu spielothek-data.js/shop-data.js: die Datenschicht
   (tournament-api.js) und die Anzeige (tournament-bracket.js,
   spaeter tournament.js) sollen beide unabhaengig von dieser Datei
   testbar bleiben.

   Rundennummern in tournament_matches sind bewusst NUR Zahlen (1 =
   erste Runde, letzte Runde = Finale) - welcher Name ("Achtelfinale"
   usw.) das ist, haengt von der Bracket-Groesse ab und wird hier
   zentral abgeleitet statt in der Datenbank festgeschrieben.
====================================================== */

// Rundenname von hinten gezaehlt (0 = Finale, 1 = Halbfinale, ...) -
// unabhaengig von der Bracket-Groesse, deckt automatisch auch
// zukuenftige groessere Brackets ab, ohne diese Liste erweitern zu
// muessen. i18n-Keys statt fest hinterlegter Strings, damit dieselbe
// Uebersetzungsquelle wie im Rest der Seite gilt (scripts/core/
// i18n.js) - "typeof t" Fallback haelt diese Datei trotzdem
// eigenstaendig testbar, falls i18n.js in einem Testkontext mal nicht
// geladen ist.
const TOURNAMENT_ROUND_NAME_KEYS_FROM_FINAL = [
  { key: "tournament.round.final", fallback: "Finale" },
  { key: "tournament.round.semifinal", fallback: "Halbfinale" },
  { key: "tournament.round.quarterfinal", fallback: "Viertelfinale" },
  { key: "tournament.round.round16", fallback: "Achtelfinale" },
];

function getTournamentTotalRounds(bracketSize) {
  return { 4: 2, 8: 3, 16: 4 }[bracketSize] || 0;
}

function getTournamentRoundName(round, bracketSize) {
  const totalRounds = getTournamentTotalRounds(bracketSize);
  const fromFinal = totalRounds - round;
  const entry = TOURNAMENT_ROUND_NAME_KEYS_FROM_FINAL[fromFinal];
  if (!entry) return `Runde ${round}`;
  return typeof t === "function" ? t(entry.key, entry.fallback) : entry.fallback;
}

// "BYE"-Sentinel aus 07-tournament.sql - kein echter Spieler, siehe
// Kommentar dort.
function isTournamentByeSlot(uid) {
  return uid === "BYE";
}

// Kleine, zentrale Statuseinstufung fuers Rendering - vermeidet
// verstreute String-Vergleiche in tournament-bracket.js/tournament.js.
function getTournamentMatchDisplayState(match) {
  if (!match) return "unknown";
  if (match.status === "complete") return "complete";
  if (match.status === "open") return "open";
  return "pending"; // mind. ein Spieler-Slot noch nicht bekannt
}

/* ------------------------------------------------------
   AKTIVES MINI-GAME (Phase 6)
   ---------------------------------------------------
   Einziger Ort, an dem festgelegt wird, welches Minispiel gerade
   gespielt wird - siehe scripts/tournament/games/reaction-game.js
   fuer den mount(container, onScore)/unmount()-Vertrag, den jedes
   Spiel erfuellen muss. Ein Wechsel auf z.B. ein spaeteres
   ClickSpeedGame/MemoryGame ist dadurch eine Ein-Zeilen-Aenderung
   hier plus das neue Spiel-Modul - Turnier/Bracket/API wissen nichts
   von der Kennung "reaction" und muessen dafuer nicht angefasst werden.
------------------------------------------------------ */
const TOURNAMENT_ACTIVE_GAME_ID = "reaction";

function getActiveTournamentGameHandler() {
  if (typeof window === "undefined" || !window.TOURNAMENT_GAME_HANDLERS) return null;
  return window.TOURNAMENT_GAME_HANDLERS[TOURNAMENT_ACTIVE_GAME_ID] || null;
}
