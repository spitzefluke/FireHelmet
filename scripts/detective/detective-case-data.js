/* ======================================================
   "DER FALL DER VERSCHWUNDENEN DUBLONEN"
   ---------------------------------------------------
   Reines Datenmodul (Verdaechtige/Hinweise/Texte) - die eigentliche
   Logik (Rendern, Untersuchen, Beschuldigen) steckt in
   detective-case.js. Alle Texte laufen ueber das bestehende
   i18n-System (scripts/core/i18n.js, Schluessel "detectiveCase.*"),
   hier stehen nur die STRUKTUR und die i18n-Schluessel.

   SICHERHEIT/FAIRNESS: Der/die tatsaechliche Taeter/in steht bewusst
   NICHT als Klartext (z.B. "correctSuspect = 'flitz'") in dieser
   Datei - das waere fuer jeden per view-source/DevTools sofort
   sichtbar. Stattdessen liegt hier nur der SHA-256-Hash der Taeter-ID,
   exakt dieselbe bereits etablierte Technik wie bei den Codes in
   scripts/codes/codes-data.js (sha256Hex() aus scripts/core/main.js).
   Wie dort gilt: das erschwert einen schnellen Blick in die Datei,
   verhindert aber nicht, dass jemand technisch versiert alle 4
   Verdaechtigen-IDs selbst durchhasht und vergleicht - bei nur 4
   Kandidaten ist das kein kryptografisches Geheimnis, sondern (wie
   beim Code-System selbst) eine bewusste, ehrliche Grenze.
====================================================== */

const DETECTIVE_CASE_SUSPECTS = [
  {
    id: "flitz",
    emoji: "🦜",
    key: "flitz",
  },
  {
    id: "andii",
    emoji: "🐙",
    // Nutzt das bereits vorhandene Ändii-Bild aus dem Charaktersystem
    // (kein neues Bild noetig) - siehe renderDetectiveSuspects() in
    // detective-case.js.
    characterId: "andi",
    key: "andii",
  },
  {
    id: "bruno",
    emoji: "⚓",
    key: "bruno",
  },
  {
    id: "finn",
    emoji: "🔭",
    key: "finn",
  },
];

/* "betrifft" verbindet einen Hinweis mit den Verdaechtigen, um die
   es dabei geht. Daraus zieht die Ermittlungstafel ihre roten
   Faeden: waehlt man jemanden aus, leuchten genau die Zettel auf,
   die etwas ueber ihn sagen.

   "art" unterscheidet dabei, WAS der Hinweis sagt:
     entlastet    - spricht fuer den Verdaechtigen
     belastet     - spricht gegen ihn
     widerspruch  - steht im Widerspruch zu seiner eigenen Aussage
   Das ist der eigentliche Kern des Falls: nicht wer keine Zeugen
   hat, sondern wer sich selbst widerspricht. */
const DETECTIVE_CASE_CLUES = [
  { id: "logbook",           icon: "📖", key: "logbook",          betrifft: [],                art: null },
  { id: "lookout-statement", icon: "🔭", key: "lookoutStatement",  betrifft: ["finn"],          art: "entlastet" },
  { id: "footprints",        icon: "👣", key: "footprints",        betrifft: ["flitz"],         art: "widerspruch" },
  { id: "kitchen-log",       icon: "🍲", key: "kitchenLog",        betrifft: ["bruno"],         art: "entlastet" },
  { id: "bell",              icon: "🔔", key: "bell",              betrifft: [],                art: null },
  { id: "red-coat",          icon: "📕", key: "redCoat",           betrifft: ["flitz", "finn"], art: "widerspruch" },
];

/* ======================================================
   DER ZEITSTRAHL DER TATNACHT
   ---------------------------------------------------
   Der Widerspruch im Fall liegt in den UHRZEITEN - er stand aber
   nur in vier Textabsaetzen verteilt, die man im Kopf
   uebereinanderlegen musste. Nebeneinander auf einer Zeitachse
   sieht man ihn.

   Alle Zeiten in Minuten nach 22:00 Uhr. Die Achse laeuft von
   22:00 bis 00:00, also 0 bis 120.

   WICHTIG: jeder Eintrag haengt an einem Hinweis ("aus"). Er
   erscheint erst, wenn dieser Hinweis untersucht wurde. Der
   Zeitstrahl fuellt sich also mit der Ermittlung, statt die Loesung
   von Anfang an hinzulegen. Eintraege mit aus: "immer" stehen von
   Beginn an da - sie sind der Rahmen, nicht die Erkenntnis.
====================================== */
const DETECTIVE_ZEITSTRAHL_VON = 0;    // 22:00
const DETECTIVE_ZEITSTRAHL_BIS = 120;  // 00:00

const DETECTIVE_ZEITSTRAHL = [
  /* --- Balken: wo jemand nach eigener oder fremder Aussage war --- */
  { art: "balken", wer: "flitz", von: 0,  bis: 120, aus: "immer",
    key: "flitzKajuete", bestaetigt: false },
  { art: "balken", wer: "andii", von: 0,  bis: 120, aus: "immer",
    key: "andiiSpielothek", bestaetigt: true },
  { art: "balken", wer: "bruno", von: 0,  bis: 75,  aus: "kitchen-log",
    key: "brunoKombuese", bestaetigt: true },
  { art: "balken", wer: "finn",  von: 60, bis: 80,  aus: "lookout-statement",
    key: "finnAusguck", bestaetigt: false },

  /* --- Ereignisse: was zu einer bestimmten Minute geschah --- */
  { art: "punkt", zeit: 70, aus: "logbook",   key: "kammerOffen",  gewicht: "schwer" },
  { art: "punkt", zeit: 72, aus: "bell",      key: "gloeckchen",   gewicht: "leicht" },
  { art: "punkt", zeit: 73, aus: "red-coat",  key: "roterMantel",  gewicht: "schwer" },
  { art: "punkt", zeit: 70, aus: "footprints", key: "stiefel",     gewicht: "schwer" },
];

// SHA-256("flitz") - siehe Sicherheitshinweis oben.
const DETECTIVE_CASE_SOLUTION_HASH = "472493c8fd66b9dff8e97e48c9161a61cb9bdd5237f24d021fd09c63c6a2a391";

// Wird NUR nach einer bestaetigt richtigen Beschuldigung angezeigt -
// derselbe Code wie in scripts/codes/codes-data.js (dort als Hash
// hinterlegt, siehe app.valid_code_redemption() in supabase/
// game-migration/01-players-ship-progression.sql fuer die tatsaechliche,
// serverseitige Absicherung der Gutschrift).
const DETECTIVE_CASE_SECRET_CODE = "FLAME-400-DETEKTIV";
