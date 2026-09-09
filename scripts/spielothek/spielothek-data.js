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
    icon: "walzen",
    name: { de: "Einarmiger Bandit", en: "One-Armed Bandit" },
    module: "slot",
    implemented: true,
  },
  {
    id: "dice",
    icon: "dice",
    name: { de: "Würfelspiel", en: "Dice Game" },
    module: "dice",
    implemented: false,
  },
  {
    id: "cards",
    icon: "cards",
    name: { de: "Karten-Minispiel", en: "Card Game" },
    module: "cards",
    implemented: false,
  },
  {
    id: "wheel",
    icon: "wheel",
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
/* Von 20 auf 40 verdoppelt: bei zwei Dritteln Nieten sieht man die
   Sprueche sonst staendig zweimal am Abend. */
const ANDII_LOSE_QUOTE_COUNT = 40;
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


/* ======================================================
   ZEICHEN DER SPIELE UND DAS LOGO
   ---------------------------------------------------
   Frueher standen hier Emoji (🎰🎲🃏🎡). Die sehen auf jedem
   Geraet anders aus - derselbe Grund, aus dem sie auch von den
   Walzen verschwunden sind (siehe games/slot.js).

   "walzen" ist zugleich das Logo der Spielothek: ein
   Automatenfenster mit Messingrahmen, zwei Trennstegen und drei
   gleichen Symbolen auf der Mittellinie - also genau das Bild, auf
   das man spielt. Es steht gross und allein ueber der Seite und
   klein neben dem Spielnamen. Dass eine Marke zugleich das Zeichen
   ihres Erzeugnisses ist, ist der Normalfall, kein Versehen.

   Die uebrigen drei stammen aus lucide (ISC, Fassung 1.43.0):
   dices, spade und disc-3. Sie liegen schon hier, obwohl die Spiele
   noch nicht gebaut sind - so faellt spaeter nur die Logik an.
====================================================== */
const SPIELOTHEK_ICONS = Object.freeze({
  /* Das Logo. Bewusst mit eigenen Werten statt aus lucide: dort gibt
     es nur columns-3 (Rahmen plus zwei Stege), und ohne die drei
     Symbole auf der Mittellinie fehlt genau die Aussage. */
  walzen: '<rect x="3" y="4" width="42" height="24" rx="3.5"/><path d="M17 4.8v22.4M31 4.8v22.4"/><circle cx="10" cy="16" r="2.6"/><circle cx="24" cy="16" r="2.6"/><circle cx="38" cy="16" r="2.6"/>',
  /* Eigener Ausschnitt, weil das Logo breiter ist als hoch. */
  walzenViewBox: "0 0 48 32",
  dice: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2" /> <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /> <path d="M6 18h.01" /> <path d="M10 14h.01" /> <path d="M15 6h.01" /> <path d="M18 9h.01" />',   // lucide/dices
  cards: '<path d="M12 18v4" /> <path d="M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5" />',   // lucide/spade
  wheel: '<circle cx="12" cy="12" r="10" /> <path d="M6 12c0-1.7.7-3.2 1.8-4.2" /> <circle cx="12" cy="12" r="2" /> <path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />',   // lucide/disc-3
});

/* Ein Spiel-Zeichen als fertiges SVG, in derselben Strichfuehrung
   wie die Walzensymbole (1,6). */
function spielothekIconSvg(id, klasse) {
  const pfad = SPIELOTHEK_ICONS[id];
  if (!pfad) return "";
  const box = id === "walzen" ? SPIELOTHEK_ICONS.walzenViewBox : "0 0 24 24";
  return '<svg class="' + (klasse || "spielothek-spiel-icon") + '" viewBox="' + box
       + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"'
       + ' stroke-linejoin="round" aria-hidden="true">' + pfad + '</svg>';
}
