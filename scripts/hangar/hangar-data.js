/* ======================================================
   HANGAR-DATEN (Migration 48)
   ---------------------------------------------------
   Die acht Einheitentypen - vier je Seite - mit Grundwerten,
   Spezialangriff und Umriss. Die Sternenschlacht (Etappe 4) rechnet
   in der Datenbank mit denselben Zahlen; wer hier etwas aendert,
   aendert es dort mit.

   Grundwerte: leben (Lebenspunkte), schaden (je Sekunde Dauerfeuer).
   Je Ausbaustufe (0..5): leben und schaden +20 %, der Spezialangriff
   +25 % Staerke. In der Epoche 2100 kommt die Seite dazu:
     Menschen  leben x1,25  schaden x0,85
     Aliens    leben x0,80  schaden x1,30  (Drohnen fliegen doppelt)

   Preise der naechsten Stufe: wie app.hangar_preis() in 48.
   Texte: i18n.js hangar.typ.<id>.*
====================================================== */

const HANGAR_PREISE = [1000, 3000, 8000, 20000, 50000];
const HANGAR_MAX_STUFE = 5;

const HANGAR_SEITEN_MOD = {
  menschen: { leben: 1.25, schaden: 0.85 },
  aliens: { leben: 0.80, schaden: 1.30 },
};

/* Umrisse im Stil der Schiffe aus dem Film "Zeitmaschine 2100"
   (viewBox -130 -80 260 160). Keine Symbole, sondern Bilder der
   Schiffe - darum kein lucide. */
const HANGAR_TYPEN = {
  jaeger: {
    seite: "menschen", leben: 80, schaden: 14,
    name: "Jäger", rolle: "Schnell, wenig Leben",
    spezial: "Raketensalve", spezialText: "Sofort 300 Schaden am Ziel",
    form: '<path d="M70 0 L-40 -34 L-20 0 L-40 34Z" class="hg-rumpf"/><circle cx="-48" cy="0" r="10" class="hg-antrieb"/>',
  },
  fregatte: {
    seite: "menschen", leben: 120, schaden: 10,
    name: "Fregatte", rolle: "Ausgewogen",
    spezial: "Störsender", spezialText: "Gegner 15 s lang −30 % Schaden",
    form: '<ellipse cx="-112" cy="0" rx="22" ry="11" class="hg-antrieb"/><path d="M115 0 L45 -22 L-55 -32 L-100 -19 L-100 19 L-55 32 L45 22 Z" class="hg-rumpf"/><path d="M62 -7 L-48 -14 L-48 14 L62 7 Z" class="hg-deck"/>',
  },
  kreuzer: {
    seite: "menschen", leben: 200, schaden: 7,
    name: "Kreuzer", rolle: "Zäh und langsam",
    spezial: "Schildwall", spezialText: "Eigene Seite 20 s lang −50 % Schaden",
    form: '<ellipse cx="-118" cy="-14" rx="16" ry="9" class="hg-antrieb"/><ellipse cx="-118" cy="14" rx="16" ry="9" class="hg-antrieb"/><path d="M120 0 L60 -34 L-60 -44 L-108 -28 L-108 28 L-60 44 L60 34 Z" class="hg-rumpf"/><rect x="-36" y="-62" width="58" height="20" rx="4" class="hg-deck"/><path d="M80 -6 L-70 -14 L-70 14 L80 6 Z" class="hg-deck"/>',
  },
  traeger: {
    seite: "menschen", leben: 100, schaden: 5,
    name: "Träger", rolle: "Selbst schwach, heilt Nachbarn",
    spezial: "Reparaturdrohnen", spezialText: "Heilt die eigene Seite um 400 Leben",
    form: '<path d="M112 -12 L70 -42 L-100 -42 L-114 -20 L-114 20 L-100 42 L70 42 L112 12Z" class="hg-rumpf"/><path d="M-80 -14 H60 M-80 0 H60 M-80 14 H60" class="hg-linie"/><circle cx="84" cy="0" r="9" class="hg-antrieb"/>',
  },
  drohne: {
    seite: "aliens", leben: 50, schaden: 9,
    name: "Drohne", rolle: "Schwach, aber doppelt",
    spezial: "Schwarmangriff", spezialText: "Sofort 250 Schaden am Ziel",
    form: '<path d="M60 0 L0 -40 L-54 0 L0 40Z" class="hg-rumpf"/><circle cx="0" cy="0" r="10" class="hg-kern"/>',
  },
  stachel: {
    seite: "aliens", leben: 70, schaden: 18,
    name: "Stachel", rolle: "Bomber mit viel Schaden",
    spezial: "Säurebombe", spezialText: "Sofort 450 Schaden am Ziel",
    form: '<path d="M-95 0 C-60 -66 40 -76 95 -32 C55 -22 34 -10 22 0 C34 10 55 22 95 32 C40 76 -60 66 -95 0Z" class="hg-rumpf"/><circle cx="-42" cy="0" r="11" class="hg-kern"/>',
  },
  weber: {
    seite: "aliens", leben: 110, schaden: 8,
    name: "Weber", rolle: "Bremst Gegner",
    spezial: "Netz", spezialText: "Gegner 20 s lang −40 % Schaden",
    form: '<path d="M-60 -20 L-100 -60 M-46 -30 L-62 -76 M-60 20 L-100 60 M-46 30 L-62 76 M10 -30 L40 -70 M10 30 L40 70" class="hg-linie"/><path d="M-95 0 C-60 -56 40 -60 90 -20 C60 -8 60 8 90 20 C40 60 -60 56 -95 0Z" class="hg-rumpf"/><circle cx="-30" cy="0" r="10" class="hg-kern"/>',
  },
  brutschiff: {
    seite: "aliens", leben: 140, schaden: 6,
    name: "Brutschiff", rolle: "Erzeugt Drohnen",
    spezial: "Brut", spezialText: "30 s lang zusätzliches Dauerfeuer",
    form: '<ellipse cx="0" cy="8" rx="118" ry="38" class="hg-rumpf"/><ellipse cx="0" cy="-22" rx="46" ry="24" class="hg-deck"/><circle cx="-60" cy="22" r="6" class="hg-kern"/><circle cx="0" cy="30" r="6" class="hg-kern"/><circle cx="60" cy="22" r="6" class="hg-kern"/>',
  },
};

const HANGAR_REIHENFOLGE = {
  menschen: ["jaeger", "fregatte", "kreuzer", "traeger"],
  aliens: ["drohne", "stachel", "weber", "brutschiff"],
};

/* Kampfwerte einer Einheit: { leben, schaden, spezial (Faktor), anzahl }. */
function hangarWerte(typId, stufen, seite) {
  const typ = HANGAR_TYPEN[typId];
  if (!typ) return null;
  const s = stufen || {};
  const mod = HANGAR_SEITEN_MOD[seite || typ.seite] || { leben: 1, schaden: 1 };
  return {
    leben: Math.round(typ.leben * (1 + 0.2 * (s.leben || 0)) * mod.leben),
    schaden: Math.round(typ.schaden * (1 + 0.2 * (s.schaden || 0)) * mod.schaden * 10) / 10,
    spezial: 1 + 0.25 * (s.spezial || 0),
    anzahl: typId === "drohne" ? 2 : 1,
  };
}
