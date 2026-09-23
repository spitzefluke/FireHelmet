/* ======================================================
   SKILL-BAUM: STERNBILD-LAYOUT UND SYMBOLE (Client-Seite)
   ---------------------------------------------------
   Die WAHRHEIT ueber Kosten, Voraussetzungen und Punkte liegt auf
   dem Server (Tabelle public.skill_nodes + app.skill_freischalten,
   siehe supabase/game-migration/22-skilltree.sql und 24-...). Hier
   steht nur, was der Server nicht wissen muss: WO ein Stern am
   Himmel sitzt und welches Symbol er traegt. Namen und Wirkungstexte
   stehen zweisprachig in scripts/core/i18n.js (skilltree.node.*).

   Die node_id MUSS mit der Migration uebereinstimmen. Ein Knoten,
   der nur hier ODER nur in der Datenbank steht, wird nicht
   gezeichnet (skilltree.js zeigt nur die Schnittmenge) - so bleibt
   der Himmel heil, falls eine Migration noch nicht eingespielt ist.

   ZWEI HIMMEL
   "weit": strahlenfoermig, die Legende in der Mitte, drei Zweige
   nach aussen (Rad oben, Spielothek rechts unten, XP links unten).
   "schmal" (Handy): drei Saeulen, die unten in der Legende
   zusammenlaufen. Koordinaten in Einheiten der jeweiligen viewBox.

   DECKEL der Boni: siehe Kopf von 24-skilltree-etappe1.sql.
====================================================== */

const SKILL_HIMMEL = {
  weit: {
    breite: 1000, hoehe: 680,
    punkte: {
      rad1:  { x: 500, y: 58 },  rad2:  { x: 500, y: 148 }, rad3:  { x: 500, y: 232 },
      slot1: { x: 745, y: 480 }, slot2: { x: 668, y: 436 }, slot3: { x: 596, y: 395 },
      xp1:   { x: 255, y: 480 }, xp2:   { x: 332, y: 436 }, xp3:   { x: 404, y: 395 },
      titel1:     { x: 690, y: 236 },
      abzeichen1: { x: 310, y: 236 },
      legende:    { x: 500, y: 345 },
    },
  },
  schmal: {
    breite: 400, hoehe: 560,
    punkte: {
      rad1:  { x: 70,  y: 50 },  rad2:  { x: 70,  y: 160 }, rad3:  { x: 70,  y: 290 },
      slot1: { x: 200, y: 50 },  slot2: { x: 200, y: 160 }, slot3: { x: 200, y: 290 },
      xp1:   { x: 330, y: 50 },  xp2:   { x: 330, y: 160 }, xp3:   { x: 330, y: 290 },
      titel1:     { x: 135, y: 225 },
      abzeichen1: { x: 265, y: 225 },
      legende:    { x: 200, y: 450 },
    },
  },
};

/* Verbindungslinien (von -> nach). Muessen zu den "benoetigt"-Angaben
   der Migrationen passen - die Linie zeigt, was wovon abhaengt. */
const SKILL_KANTEN = [
  ["rad1", "rad2"], ["rad2", "rad3"],
  ["slot1", "slot2"], ["slot2", "slot3"],
  ["xp1", "xp2"], ["xp2", "xp3"],
  ["rad2", "titel1"], ["slot2", "titel1"],
  ["xp2", "abzeichen1"],
  ["rad3", "legende"], ["slot3", "legende"], ["xp3", "legende"],
];

/* Symbole: lucide (ISC), stroke-width 1.6 - ship-wheel, dice-5,
   sparkles, swords, anchor, crown. */
const SKILL_SYMBOLE = {
  rad: '<circle cx="12" cy="12" r="8"/><path d="M12 2v7.5"/><path d="m19 5-5.23 5.23"/><path d="M22 12h-7.5"/><path d="m19 19-5.23-5.23"/><path d="M12 14.5V22"/><path d="M10.23 13.77 5 19"/><path d="M9.5 12H2"/><path d="M10.23 10.23 5 5"/><circle cx="12" cy="12" r="2.5"/>',
  slot: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
  xp: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  titel: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  abzeichen: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
  legende: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
};

/* Welches Symbol zu welchem Knoten gehoert. */
const SKILL_SYMBOL_JE_KNOTEN = {
  rad1: "rad", rad2: "rad", rad3: "rad",
  slot1: "slot", slot2: "slot", slot3: "slot",
  xp1: "xp", xp2: "xp", xp3: "xp",
  titel1: "titel", abzeichen1: "abzeichen", legende: "legende",
};

/* Auszeichnungen, die auf der Spielerkarte erscheinen. "stufe"
   ordnet: der hoechste freigeschaltete Titel wird gezeigt. */
const SKILL_AUSZEICHNUNGEN = {
  titel1:     { typ: "titel", stufe: 1 },
  legende:    { typ: "titel", stufe: 2 },
  abzeichen1: { typ: "abzeichen", stufe: 1 },
};
