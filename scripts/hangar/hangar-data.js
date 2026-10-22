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

   AUSRUESTUNG (Migration 58): Sonderwaffen, Module und Schiffs-Rang
   unten (HANGAR_TEILE, SCHIFF_RAENGE).

   PARTEIEN (Migration 57): Mit der Freigabe "schlachtParteien"
   kommen vier Parteien mit je vier Typen dazu. Ihre Zahlen stehen in
   public.schlacht_parteien und public.schlacht_typen - hier dieselben.
   "seite" eines Typs ist seine Partei; "anzahl" 2 fliegt doppelt.
   Die Hangar-Stufen gelten fuer jeden Typ jeder Partei.

   DESIGN V2 (Migration 63): je Partei ein fuenfter, schwerer Typ
   (schlachtschiff, koenigin, rammer, titan, kathedrale, leviathan).
====================================================== */

const HANGAR_PREISE = [1000, 3000, 8000, 20000, 50000];
const HANGAR_MAX_STUFE = 5;
/* Glücksmine (Migration 61): Stufen 6 bis 10 nur mit Erz, wie
   app.hangar_erz_preis; Schiffssysteme je 0..5, 1 500 x 2^Stufe Erz. */
const HANGAR_ERZ_PREISE = [2000, 4000, 8000, 15000, 25000];
const HANGAR_ERZ_MAX = 10;
const SCHIFF_SYSTEME = ["panzer", "geschuetz"];
/* Raumerz (Migration 64): mit Freigabe der Glücksmine kosten ALLE
   Stufen 1..15 Raumerz, wie app.hangar_raumerz_preis. */
const HANGAR_RAUMERZ_PREISE = [1, 2, 3, 4, 5, 7, 9, 11, 14, 17, 20, 24, 28, 33, 40];
const HANGAR_RAUMERZ_MAX = 15;

const HANGAR_SEITEN_MOD = {
  menschen: { leben: 1.25, schaden: 0.85 },
  aliens: { leben: 0.80, schaden: 1.30 },
  piraten: { leben: 1.00, schaden: 1.10 },
  maschinen: { leben: 1.20, schaden: 0.95 },
  kristall: { leben: 0.95, schaden: 1.15 },
  geister: { leben: 0.85, schaden: 1.25 },
};

/* Die sechs Parteien der Sternenschlacht (Migration 57).
   laden: Sekunden bis zum Spezialangriff je Runde.
   farbe: Akzent aus den Design-Tokens.
   Texte: i18n.js schlacht.partei.<id>.* (Menschen und Aliens:
   seiten.<id>.*). */
const SCHLACHT_PARTEIEN = {
  menschen: { name: "Die Erdflotte", volk: "Menschen", farbe: "--fh-cold", laden: 60, text: "Viel Leben, regenerieren, kämpfen in Formation." },
  aliens: { name: "Der Schwarm", volk: "Aliens", farbe: "--fh-violett", laden: 30, text: "Wenig Leben, viel Schaden, schneller Spezialangriff." },
  piraten: { name: "Die Piraten-Armada", volk: "Piraten", farbe: "--fh-fire", laden: 45, text: "Ausgewogen, harte Breitseiten." },
  maschinen: { name: "Das Maschinen-Kollektiv", volk: "Maschinen", farbe: "--fh-danger", laden: 50, text: "Sehr zäh, schwere Kanonen, langsam geladen." },
  kristall: { name: "Die Kristall-Konklave", volk: "Kristalle", farbe: "--fh-kristall", laden: 40, text: "Scharf und zerbrechlich, schwächt den Gegner." },
  geister: { name: "Die Geisterflotte", volk: "Geister", farbe: "--fh-geist", laden: 35, text: "Wenig Leben, sehr viel Schaden." },
};
const SCHLACHT_PARTEI_REIHE = ["menschen", "aliens", "piraten", "maschinen", "kristall", "geister"];
/* Boss-Schlacht (Migration 59): alle Spieler als Allianz gegen das Mutterschiff. */
SCHLACHT_PARTEIEN.allianz = { name: "Die Allianz", volk: "Allianz", farbe: "--fh-gold-bright", laden: 45, text: "Alle Parteien gemeinsam gegen das Mutterschiff." };
SCHLACHT_PARTEIEN.boss = { name: "Das Mutterschiff", volk: "Mutterschiff", farbe: "--fh-danger", laden: 60, text: "Ein Koloss mit drei Phasen, Salven und Schild." };

/* Hangar-Ausruestung (Migration 58) - dieselben Zahlen wie
   public.hangar_teile. Texte: i18n.js hangar.teil.<id>.* */
const HANGAR_TEILE = {
  plasma: { art: "waffe", preis: 15000, name: "Plasmakanone", text: "Zielschuss +15 %" },
  raketen: { art: "waffe", preis: 20000, name: "Raketenwerfer", text: "Zielschuss +10 %, Fokusfeuer bis +80 %" },
  tesla: { art: "waffe", preis: 30000, name: "Tesla-Spule", text: "Zielschuss springt mit 50 % auf ein zweites Ziel über" },
  lanze: { art: "waffe", preis: 30000, name: "Lichtlanze", text: "Zielschuss +35 %, lädt aber 8 statt 5 s" },
  panzer: { art: "modul", preis: 12000, name: "Verbundpanzer", text: "Leben +15 %" },
  schild: { art: "modul", preis: 12000, name: "Deflektorschild", text: "Erhaltener Zielschuss −20 %" },
  nachbrenner: { art: "modul", preis: 10000, name: "Nachbrenner", text: "Schneller bewegen, Ausweichen −40 % statt −25 %" },
  zielcomputer: { art: "modul", preis: 15000, name: "Zielcomputer", text: "Zielschuss 1 s schneller" },
  reaktor: { art: "modul", preis: 18000, name: "Überladereaktor", text: "Spezialangriff lädt 25 % schneller" },
};
const HANGAR_TEIL_REIHE = {
  waffe: ["plasma", "raketen", "tesla", "lanze"],
  modul: ["panzer", "schild", "nachbrenner", "zielcomputer", "reaktor"],
};
/* Schiffs-Rang (58): ab xp, je Stufe +2 % Leben und Schaden. */
const SCHIFF_RAENGE = [
  { xp: 0, name: "Rekrut" }, { xp: 100, name: "Kadett" }, { xp: 300, name: "Leutnant" },
  { xp: 700, name: "Kommandant" }, { xp: 1500, name: "Kapitän" }, { xp: 3000, name: "Admiral" },
];
function schiffRang(xp) {
  let r = 0;
  SCHIFF_RAENGE.forEach(function (x, i) { if ((xp || 0) >= x.xp) r = i; });
  return r;
}

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
    seite: "aliens", leben: 50, schaden: 9, anzahl: 2,
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
  /* ---- Piraten-Armada (57) ---- */
  kaper: {
    seite: "piraten", leben: 75, schaden: 15,
    name: "Kaperschiff", rolle: "Schnell, entert",
    spezial: "Enterhaken", spezialText: "Sofort 320 Schaden am Ziel",
    form: '<path d="M78 0 L40 -14 L-30 -20 L-52 -10 L-52 10 L-30 20 L40 14Z" class="hg-rumpf"/><path d="M-10 -20 L10 -58 L-40 -24Z" class="hg-deck"/>',
  },
  brigant: {
    seite: "piraten", leben: 115, schaden: 11,
    name: "Brigant", rolle: "Ausgewogen",
    spezial: "Rauchwand", spezialText: "Gegner 15 s lang −35 % Schaden",
    form: '<path d="M100 0 L60 -20 L-60 -26 L-96 -12 L-96 12 L-60 26 L60 20Z" class="hg-rumpf"/><path d="M20 -24 L30 -66 L-10 -26Z M-40 -26 L-30 -62 L-70 -24Z" class="hg-deck"/>',
  },
  galeone: {
    seite: "piraten", leben: 190, schaden: 8,
    name: "Galeone", rolle: "Schwer bewaffnet, zäh",
    spezial: "Breitseite", spezialText: "Sofort 480 Schaden am Ziel",
    form: '<path d="M118 0 L80 -30 L-80 -40 L-118 -30 L-118 30 L-80 40 L80 30Z" class="hg-rumpf"/><rect x="-116" y="-24" width="34" height="48" rx="4" class="hg-deck"/><path d="M-60 -34 H70 M-60 34 H70" class="hg-linie"/>',
  },
  schmuggler: {
    seite: "piraten", leben: 105, schaden: 6,
    name: "Schmuggler", rolle: "Schwach, bringt Nachschub",
    spezial: "Beuteladung", spezialText: "Heilt die eigene Seite um 380 Leben",
    form: '<path d="M100 -10 L70 -40 L-96 -40 L-110 -24 L-110 24 L-96 40 L70 40 L100 10Z" class="hg-rumpf"/><rect x="-80" y="-28" width="40" height="24" class="hg-deck"/><rect x="-30" y="4" width="40" height="24" class="hg-deck"/>',
  },
  /* ---- Maschinen-Kollektiv (57) ---- */
  sonde: {
    seite: "maschinen", leben: 45, schaden: 10, anzahl: 2,
    name: "Sonde", rolle: "Schwach, aber doppelt",
    spezial: "Überladung", spezialText: "Sofort 220 Schaden am Ziel",
    form: '<path d="M40 0 L20 -34 L-20 -34 L-40 0 L-20 34 L20 34Z" class="hg-rumpf"/><circle cx="0" cy="0" r="10" class="hg-kern"/>',
  },
  waechter: {
    seite: "maschinen", leben: 150, schaden: 8,
    name: "Wächter", rolle: "Schildgenerator",
    spezial: "Energieschild", spezialText: "Gegner 20 s lang −45 % Schaden",
    form: '<path d="M70 -30 L30 -70 L-30 -70 L-70 -30 L-70 30 L-30 70 L30 70 L70 30Z" class="hg-rumpf"/><circle cx="0" cy="0" r="26" class="hg-deck"/>',
  },
  zerstoerer: {
    seite: "maschinen", leben: 170, schaden: 10,
    name: "Zerstörer", rolle: "Langsam, gewaltige Kanone",
    spezial: "Railgun", spezialText: "Sofort 500 Schaden am Ziel",
    form: '<path d="M124 -6 L124 6 L40 34 L-100 40 L-120 20 L-120 -20 L-100 -40 L40 -34Z" class="hg-rumpf"/><rect x="-60" y="-6" width="180" height="12" class="hg-deck"/>',
  },
  fabrik: {
    seite: "maschinen", leben: 120, schaden: 5,
    name: "Fabrik", rolle: "Repariert die Flotte",
    spezial: "Nanoschwarm", spezialText: "Heilt die eigene Seite um 420 Leben",
    form: '<rect x="-100" y="-46" width="190" height="92" rx="6" class="hg-rumpf"/><rect x="-70" y="-30" width="50" height="60" class="hg-deck"/><rect x="0" y="-30" width="50" height="60" class="hg-deck"/>',
  },
  /* ---- Kristall-Konklave (57) ---- */
  splitter: {
    seite: "kristall", leben: 65, schaden: 17,
    name: "Splitter", rolle: "Zerbrechlich, scharf",
    spezial: "Kristallregen", spezialText: "Sofort 420 Schaden am Ziel",
    form: '<path d="M96 0 L10 -20 L-64 -10 L-44 0 L-64 10 L10 20Z" class="hg-rumpf"/><path d="M96 0 L-44 0" class="hg-linie"/>',
  },
  prisma: {
    seite: "kristall", leben: 110, schaden: 9,
    name: "Prisma", rolle: "Bricht feindliches Feuer",
    spezial: "Lichtbrechung", spezialText: "Gegner 20 s lang −40 % Schaden",
    form: '<path d="M90 0 L0 -56 L-80 0 L0 56Z" class="hg-rumpf"/><path d="M90 0 L0 -20 L-80 0 L0 20Z" class="hg-deck"/>',
  },
  resonator: {
    seite: "kristall", leben: 120, schaden: 8,
    name: "Resonator", rolle: "Schwächt Gegner",
    spezial: "Resonanz", spezialText: "Gegner nehmen 25 s lang +30 % Schaden",
    form: '<path d="M44 0 L22 -38 L-22 -38 L-44 0 L-22 38 L22 38Z" class="hg-rumpf"/><circle cx="0" cy="0" r="64" class="hg-linie" fill="none"/>',
  },
  monolith: {
    seite: "kristall", leben: 160, schaden: 6,
    name: "Monolith", rolle: "Massiv, heilt",
    spezial: "Kristallquelle", spezialText: "Heilt die eigene Seite um 360 Leben",
    form: '<path d="M116 0 L90 -30 L-90 -30 L-116 0 L-90 30 L90 30Z" class="hg-rumpf"/><path d="M-90 0 H90" class="hg-linie"/>',
  },
  /* ---- Geisterflotte (57) ---- */
  irrlicht: {
    seite: "geister", leben: 55, schaden: 14,
    name: "Irrlicht", rolle: "Flink und flüchtig",
    spezial: "Seelenfeuer", spezialText: "Sofort 280 Schaden am Ziel",
    form: '<path d="M60 0 C60 -30 20 -34 0 -24 C-30 -10 -80 -6 -110 0 C-80 6 -30 10 0 24 C20 34 60 30 60 0Z" class="hg-rumpf"/><circle cx="30" cy="0" r="12" class="hg-kern"/>',
  },
  phantom: {
    seite: "geister", leben: 100, schaden: 12,
    name: "Phantom", rolle: "Kaum zu treffen",
    spezial: "Nebelschleier", spezialText: "Gegner 15 s lang −50 % Schaden",
    form: '<path d="M100 0 L30 -30 L-60 -44 L-80 -24 L-100 -30 L-90 0 L-100 30 L-80 24 L-60 44 L30 30Z" class="hg-rumpf"/>',
  },
  banshee: {
    seite: "geister", leben: 105, schaden: 9,
    name: "Banshee", rolle: "Lähmt mit ihrem Schrei",
    spezial: "Totenschrei", spezialText: "Gegner nehmen 25 s lang +35 % Schaden",
    form: '<path d="M60 0 C20 -70 -80 -70 -100 -40 C-60 -30 -40 -14 -40 0 C-40 14 -60 30 -100 40 C-80 70 20 70 60 0Z" class="hg-rumpf"/><circle cx="10" cy="0" r="12" class="hg-kern"/>',
  },
  totenschiff: {
    seite: "geister", leben: 180, schaden: 9,
    name: "Totenschiff", rolle: "Verflucht und schwer",
    spezial: "Fluch der Tiefe", spezialText: "Sofort 520 Schaden am Ziel",
    form: '<path d="M118 0 L80 -30 L-80 -40 L-118 -30 L-118 30 L-80 40 L80 30Z" class="hg-rumpf"/><path d="M-60 -36 V36 M-20 -38 V38 M20 -36 V36 M60 -32 V32" class="hg-linie"/>',
  },
  /* ---- Fuenfter Typ je Partei (Design V2, Migration 63) ----
     Schwere Grossschiffe: viel Leben, wenig Dauerfeuer, starker
     Spezialangriff. Die Form hier ist nur der Ersatz ohne schiffe.js. */
  schlachtschiff: {
    seite: "menschen", leben: 250, schaden: 8,
    name: "Schlachtschiff", rolle: "Schwer gepanzert, Hauptgeschütz",
    spezial: "Hauptbatterie", spezialText: "Sofort 550 Schaden am Ziel",
    form: '<path d="M124 0 L90 -24 L-70 -40 L-120 -24 L-120 24 L-70 40 L90 24Z" class="hg-rumpf"/><path d="M-60 0 H80" class="hg-linie"/><circle cx="30" cy="0" r="10" class="hg-kern"/>',
  },
  koenigin: {
    seite: "aliens", leben: 200, schaden: 7,
    name: "Königin", rolle: "Herz des Schwarms",
    spezial: "Brutpflege", spezialText: "Heilt die eigene Seite um 450 Leben",
    form: '<path d="M90 0 C70 -60 -40 -70 -110 -30 C-80 -10 -80 10 -110 30 C-40 70 70 60 90 0Z" class="hg-rumpf"/><circle cx="10" cy="0" r="16" class="hg-kern"/>',
  },
  rammer: {
    seite: "piraten", leben: 165, schaden: 12,
    name: "Rammer", rolle: "Bricht durch jede Linie",
    spezial: "Rammstoß", spezialText: "Sofort 560 Schaden am Ziel",
    form: '<path d="M124 0 L70 -26 L-90 -34 L-118 0 L-90 34 L70 26Z" class="hg-rumpf"/><path d="M124 0 L92 -14 L92 14Z" class="hg-deck"/>',
  },
  titan: {
    seite: "maschinen", leben: 260, schaden: 7,
    name: "Titan", rolle: "Wandelnde Festung",
    spezial: "Bollwerkfeld", spezialText: "Gegner 25 s lang −45 % Schaden",
    form: '<path d="M110 -20 L110 20 L60 50 L-80 50 L-120 20 L-120 -20 L-80 -50 L60 -50Z" class="hg-rumpf"/><path d="M-80 -24 H80 M-80 24 H80" class="hg-linie"/>',
  },
  kathedrale: {
    seite: "kristall", leben: 210, schaden: 7,
    name: "Kathedrale", rolle: "Lichtchor im Kristall",
    spezial: "Lichtchor", spezialText: "Heilt die eigene Seite um 480 Leben",
    form: '<path d="M120 0 L40 -60 L-60 -44 L-120 0 L-60 44 L40 60Z" class="hg-rumpf"/><path d="M120 0 L-120 0 M40 -60 L-60 44 M40 60 L-60 -44" class="hg-linie"/>',
  },
  leviathan: {
    seite: "geister", leben: 230, schaden: 10,
    name: "Leviathan", rolle: "Uralt und gewaltig",
    spezial: "Seelensog", spezialText: "Gegner nehmen 25 s lang +40 % Schaden",
    form: '<path d="M120 0 C90 -50 -20 -60 -120 -36 C-90 -12 -90 12 -120 36 C-20 60 90 50 120 0Z" class="hg-rumpf"/><circle cx="60" cy="0" r="12" class="hg-kern"/>',
  },
};

const HANGAR_REIHENFOLGE = {
  menschen: ["jaeger", "fregatte", "kreuzer", "traeger", "schlachtschiff"],
  aliens: ["drohne", "stachel", "weber", "brutschiff", "koenigin"],
  piraten: ["kaper", "brigant", "galeone", "schmuggler", "rammer"],
  maschinen: ["sonde", "waechter", "zerstoerer", "fabrik", "titan"],
  kristall: ["splitter", "prisma", "resonator", "monolith", "kathedrale"],
  geister: ["irrlicht", "phantom", "banshee", "totenschiff", "leviathan"],
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
    anzahl: typ.anzahl || 1,
  };
}

/* Name, Volk und Kurztext einer Partei in der aktuellen Sprache.
   Menschen und Aliens behalten ihre Texte aus seiten.<id>.* */
function schlachtParteiText(partei, feld) {
  const P = SCHLACHT_PARTEIEN[partei] || SCHLACHT_PARTEIEN.menschen;
  const alt = (partei === "menschen" || partei === "aliens") && feld !== "text";
  const key = (alt ? "seiten." : "schlacht.partei.") + (SCHLACHT_PARTEIEN[partei] ? partei : "menschen") + "." + feld;
  return typeof window.t === "function" ? window.t(key, P[feld]) : P[feld];
}
