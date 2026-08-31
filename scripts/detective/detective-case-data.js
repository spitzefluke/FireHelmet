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

const DETECTIVE_CASE_CLUES = [
  { id: "logbook", icon: "📖", key: "logbook" },
  { id: "lookout-statement", icon: "🔭", key: "lookoutStatement" },
  { id: "footprints", icon: "👣", key: "footprints" },
  { id: "kitchen-log", icon: "🍲", key: "kitchenLog" },
  { id: "bell", icon: "🔔", key: "bell" },
  { id: "red-coat", icon: "📕", key: "redCoat" },
];

// SHA-256("flitz") - siehe Sicherheitshinweis oben.
const DETECTIVE_CASE_SOLUTION_HASH = "472493c8fd66b9dff8e97e48c9161a61cb9bdd5237f24d021fd09c63c6a2a391";

// Wird NUR nach einer bestaetigt richtigen Beschuldigung angezeigt -
// derselbe Code wie in scripts/codes/codes-data.js (dort als Hash
// hinterlegt, siehe app.valid_code_redemption() in supabase/
// game-migration/01-players-ship-progression.sql fuer die tatsaechliche,
// serverseitige Absicherung der Gutschrift).
const DETECTIVE_CASE_SECRET_CODE = "FLAME-400-DETEKTIV";
