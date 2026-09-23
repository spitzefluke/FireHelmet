/* ======================================================
   SKILL-BAUM: LAYOUT UND WIRKUNG (Client-Seite)
   ---------------------------------------------------
   Die WAHRHEIT ueber Kosten, Voraussetzungen und Punkte liegt auf
   dem Server (Tabelle public.skill_nodes + app.skill_freischalten,
   siehe supabase/game-migration/22-skilltree.sql). Hier steht nur,
   was der Server nicht wissen muss: WO ein Knoten im Baum sitzt,
   welches Symbol er traegt und in welcher Sprache er heisst.

   Die node_id MUSS mit der in Migration 22 uebereinstimmen - sonst
   zeigt der Baum einen Knoten, den der Server nicht kennt (oder
   umgekehrt).

   WIRKUNG DER BONI
   Die Wirkstaerke (wert) kommt ebenfalls aus der DB. "art"
   entscheidet, WO der Bonus greift:
     raddublonen   -> + % auf Rad-Gewinne
     slotdublonen  -> + % auf Spielothek-Gewinne
     xpbonus       -> + % auf gewonnene XP
     titel/abzeichen -> rein kosmetisch, kein Zahlenwert
   Angewandt werden sie im Browser (fhSkillBonus() in
   skilltree.js); die Datenbank deckelt den Kontostand-Sprung wie
   gehabt - die Prozente sind klein genug, dass kein Deckel
   angefasst werden muss.
====================================================== */

/* Spalten (x in %) und Reihen (y in %) fuer die Platzierung. */
const SKILL_LAYOUT = {
  rad1:       { x: 20, y: 24, icon: "🎡" },
  rad2:       { x: 20, y: 52, icon: "🎡" },
  slot1:      { x: 50, y: 24, icon: "🎰" },
  slot2:      { x: 50, y: 52, icon: "🎰" },
  xp1:        { x: 80, y: 24, icon: "⭐" },
  xp2:        { x: 80, y: 52, icon: "⭐" },
  titel1:     { x: 35, y: 82, icon: "🏅" },
  abzeichen1: { x: 80, y: 82, icon: "🎖️" },
};

/* Verbindungslinien (von -> nach) fuer die Baum-Optik. Muss zu den
   "benoetigt"-Angaben in Migration 22 passen. */
const SKILL_KANTEN = [
  ["rad1", "rad2"],
  ["slot1", "slot2"],
  ["xp1", "xp2"],
  ["rad2", "titel1"],
  ["slot2", "titel1"],
  ["xp2", "abzeichen1"],
];
