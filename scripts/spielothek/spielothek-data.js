/* ======================================================
   ÄNDIIS SPIELOTHEK - KONFIGURATION
   ---------------------------------------------------
   Reine Konfiguration, keine Logik (die lebt in
   scripts/spielothek/spielothek.js und den einzelnen
   Spiel-Modulen unter scripts/spielothek/games/).

   NEUES SPIEL HINZUFÜGEN:
   1. Neue Datei scripts/spielothek/games/<name>.js anlegen,
      nach demselben Muster wie games/slot.js (eine reine
      "spiel(einsatz)"-Funktion, die { win, payout, resultView }
      zurückgibt - siehe Kommentar dort).
      <script>-Tag dafür in index.html ergänzen.
   2. Hier unten einen neuen Eintrag mit "implemented: true"
      ergänzen.
   Das war's - die monatliche Rotation bezieht automatisch jedes
   Spiel mit "implemented: true" mit ein, in derselben
   deterministischen Weise wie beim Schwarzmarkt/Community-Boss
   (Monatsindex % Anzahl Spiele).

   WICHTIG: "implemented: false" Einträge sind bewusst schon
   hier eingetragen (fürs Admin-Gateway und als Fahrplan), werden
   aber NIE Besuchern als "Spiel des Monats" angezeigt, solange
   sie nicht wirklich fertig sind - lieber ehrlich weniger Spiele
   zeigen als ein kaputtes.
====================================================== */

const SPIELOTHEK_GAMES = [
  {
    id: "slot",
    emoji: "🎰",
    name: { de: "Einarmiger Bandit", en: "One-Armed Bandit" },
    module: "slot",
    implemented: true,
  },
  {
    id: "dice",
    emoji: "🎲",
    name: { de: "Würfelspiel", en: "Dice Game" },
    module: "dice",
    implemented: false,
  },
  {
    id: "cards",
    emoji: "🃏",
    name: { de: "Karten-Minispiel", en: "Card Game" },
    module: "cards",
    implemented: false,
  },
  {
    id: "wheel",
    emoji: "🎡",
    name: { de: "Glücksrad-Variante", en: "Wheel Variant" },
    module: "wheel-variant",
    implemented: false,
  },
];

/* ------------------------------------------------------
   ÄNDII - WARN-ZITATE
   Werden zufällig VOR dem Spielen und dann passend zu
   Gewinn/Verlust NACH dem Spielen gezogen. Alle über das
   normale Sprachsystem übersetzbar, siehe scripts/core/i18n.js
   ("spielothek.andiIdleN" / "andiWinN" / "andiLoseN").
------------------------------------------------------ */
const ANDII_IDLE_QUOTE_COUNT = 7;
const ANDII_WIN_QUOTE_COUNT = 3;
const ANDII_WIN_BIG_QUOTE_COUNT = 3;
const ANDII_WIN_JACKPOT_QUOTE_COUNT = 3;
const ANDII_LOSE_QUOTE_COUNT = 20;
const ANDII_COOLDOWN_QUOTE_COUNT = 8;

/* ------------------------------------------------------
   COOLDOWN ZWISCHEN ZWEI SPIELRUNDEN (Auftrag Punkt 1-3)
   ---------------------------------------------------
   Rein die ANZEIGE-Dauer - die tatsaechliche, serverseitig
   erzwungene Sperre steht in firestore.rules (validSpielothekCooldown()),
   siehe ausfuehrlicher Kommentar dort. Beide MUESSEN uebereinstimmen,
   sonst wuerde entweder der Button zu frueh wieder aktiv (Server lehnt
   dann trotzdem ab) oder zu spaet (unnoetig lange Wartezeit). Zentrale,
   leicht anpassbare Stelle - siehe Auftrag Punkt 1: "soll spaeter
   leicht anpassbar sein".
------------------------------------------------------ */
const SPIELOTHEK_COOLDOWN_MS = 4000;
