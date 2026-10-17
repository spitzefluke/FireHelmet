/* ======================================================
   SCHIFFE: GEMEINSAME GRAFIK FUER HANGAR UND STERNENSCHLACHT
   ---------------------------------------------------
   Reine Optik ohne Zustand. Jeder Einheitentyp hat eine eigene
   Silhouette im Neon-Vektor-Stil der Zeitmaschine 2100. Vier Stile:
     metall     Menschen (kuehl), Piraten (Bronze, rote Sonnensegel),
                Maschinen (Stahl, rote Sensoraugen)
     organisch  Aliens (violett, leuchtender Kern, Adern)
     kristall   Kristall-Konklave (Eis und Rosa, Facetten)
     geist      Geisterflotte (durchscheinend, Irrlichter)
   "seite" ist ueberall die PARTEI (Migration 57) - fuer Menschen und
   Aliens wie bisher. Dazu das Mutterschiff (Partei "boss", 59).

   AUSRUESTUNG (Migration 58), o.ausruestung = { waffe, module: [] }:
     Sonderwaffe sichtbar auf dem Rumpf (Plasmakanone, Raketenkapseln,
     Tesla-Spule, Lichtlanze), Verbundpanzer als Plattenkante,
     Zielcomputer als Radarschuessel, Reaktor als Glutring - alles im
     Sprite. Deflektorschild (Schimmer) und Nachbrenner (lange
     Flammen) kommen je Bild dazu.

   AUSBAU SICHTBAR (Stufen 0..5 wie im Hangar)
     leben   -> Platten / Chitinschuppen / Kristalle / Runen
     schaden -> Geschuetze / Dornen / Kristallspitzen / Seelenkugeln
     spezial -> pulsierende Aura (dynamisch, nicht im Sprite)

   LEISTUNG: Rumpf, Details und Ausbau werden je Typ/Stufe/Groesse
   EINMAL in ein Offscreen-Canvas gezeichnet (Sprite) und danach nur
   noch kopiert. Pro Bild kommen nur Triebwerksflammen, Aura und
   Schild-Aufblitzen dazu - so bleiben auch 120 Schiffe auf dem Handy
   fluessig.

   Koordinaten: Bug zeigt nach +x, Schiff liegt etwa in
   x -130..130, y -80..80 (wie die viewBox in hangar-data.js).

   API (window.fhSchiffe):
     zeichnen(ctx, o)   o = { typ, seite, stufen, x, y, winkel, breite,
                              dpr, zeit, phase, treffer (0..1), ruhig,
                              alpha (Grund-Deckkraft, Standard 1) }
     bild(typ, seite, stufen, breiteCss, ausruestung?)  -> <canvas> (Hangar)
     stufenAus(einheit) -> { leben, schaden, spezial } aus Kampfwerten
     motorPunkte(typ)   -> Triebwerke (fuer Effekte)
     farbe(seite)       -> Palette der Partei (hell, akzent, licht, ...)
     stil(seite)        -> "metall" | "organisch" | "kristall" | "geist"
====================================================== */

(function () {
  "use strict";

  /* Akzente aus den Design-Tokens; Rumpftoene sind Material, keine
     Markenfarben - sie stehen nur hier. */
  let farbenCache = null;
  function token(name, ersatz) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || ersatz;
    } catch (e) { return ersatz; }
  }
  function farben() {
    if (farbenCache) return farbenCache;
    const kalt = token("--fh-cold", "#6fd3ff");
    farbenCache = {
      menschen: {
        hell: "#c9d3df", mitte: "#7c899a", dunkel: "#29323e", kante: "#eaf4ff",
        akzent: kalt, licht: "#c8f4ff", panzer: "#4a5666", waffe: "#dfe8f2", tief: "#18202a",
        flamme: kalt, flammeKern: "#ffffff",
      },
      aliens: {
        hell: "#8a5ad6", mitte: "#4a2a85", dunkel: "#1a0d30", kante: "#c993ff",
        akzent: "#9dff6a", licht: "#e2ffc0", panzer: "#2c1850", waffe: "#b8ff8a", tief: "#12081f",
        flamme: "#7dff8a", flammeKern: "#eaffd8",
      },
      piraten: {
        hell: "#d9b77a", mitte: "#8a5a2b", dunkel: "#2e1a0c", kante: "#ffd98a",
        akzent: token("--fh-fire", "#ff6a2a"), licht: "#ffe3b0", panzer: "#5a3a1c", waffe: "#e8c88a", tief: "#1e1108",
        flamme: "#ff8a3d", flammeKern: "#fff1d0", segel: "#b8323a",
      },
      maschinen: {
        hell: "#a3acb4", mitte: "#4b535b", dunkel: "#15191d", kante: "#d0d8de",
        akzent: "#ff3b3b", licht: "#ffc2b8", panzer: "#2c3238", waffe: "#c4ccd2", tief: "#0c0f12",
        flamme: "#ff5a3a", flammeKern: "#ffe6dc",
      },
      kristall: {
        hell: "#e6f7ff", mitte: "#8fc8e8", dunkel: "#24406a", kante: "#ffffff",
        akzent: token("--fh-kristall", "#ff7ad9"), licht: "#ffe0f5", panzer: "#5d8fc4", waffe: "#ffd1f0", tief: "#162a4a",
        flamme: "#ff8ae0", flammeKern: "#ffffff",
      },
      geister: {
        hell: "#b8ffe8", mitte: "#3d8f7e", dunkel: "#0b2622", kante: "#d6fff4",
        akzent: token("--fh-geist", "#5dffc8"), licht: "#eafff8", panzer: "#1d4a42", waffe: "#a8ffe0", tief: "#061614",
        flamme: "#5dffc8", flammeKern: "#f0fff8", segel: "#7fbfae",
      },
      boss: {
        hell: "#6a2a3a", mitte: "#2e0f1a", dunkel: "#0b0306", kante: "#ff7a5a",
        akzent: "#ff3b6b", licht: "#ffd0c0", panzer: "#3e1622", waffe: "#ffb0a0", tief: "#060103",
        flamme: "#ff5a3a", flammeKern: "#ffe0d0",
      },
    };
    return farbenCache;
  }

  const STILE = { menschen: "metall", aliens: "organisch", piraten: "metall", maschinen: "metall", kristall: "kristall", geister: "geist", boss: "metall" };
  /* Farben der Sonderwaffen - bewusst unabhaengig von der Partei,
     damit man die Waffe auf jedem Schiff erkennt. */
  const WAFFEN_FARBE = { plasma: "#5ff3ff", raketen: "#ff9d3d", tesla: "#9fc8ff", lanze: "#fff07a" };
  function stil(seite) { return STILE[seite] || "metall"; }

  /* ------------------------------------------------------
     TYPEN: Rumpf, Details, Triebwerke, Ausbau-Punkte
     waffen: [x, y] fuer bis zu 5 Geschuetze/Dornen
     panzer: [x, y] fuer bis zu 5 Platten/Schuppen
  ------------------------------------------------------ */
  function pfad(ctx, punkte) {
    ctx.beginPath();
    ctx.moveTo(punkte[0], punkte[1]);
    for (let i = 2; i < punkte.length; i += 2) ctx.lineTo(punkte[i], punkte[i + 1]);
    ctx.closePath();
  }
  /* Punkte [x,y,...] an der Laengsachse spiegeln. */
  function spiegel(p) { return p.map(function (v, i) { return i % 2 ? -v : v; }); }
  /* Sonnensegel (Piraten) bzw. zerfetzte Segel (Geister), beidseitig. */
  function segel(c, F, p, alpha) {
    [p, spiegel(p)].forEach(function (q) {
      c.save();
      c.globalAlpha = alpha == null ? .9 : alpha;
      c.fillStyle = F.segel || F.mitte; pfad(c, q); c.fill();
      c.strokeStyle = F.kante; c.lineWidth = 1.2; c.globalAlpha *= .7; c.stroke();
      c.restore();
    });
  }
  function flaeche(c, farbe, p, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.fillStyle = farbe; pfad(c, p); c.fill(); c.restore();
  }
  function bogen(c, farbe, breite, x, y, r, a0, a1, alpha) {
    c.save(); c.strokeStyle = farbe; c.lineWidth = breite; c.globalAlpha = alpha == null ? 1 : alpha;
    c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); c.restore();
  }

  const TYPEN = {
    jaeger: {
      rumpf: function (c) { pfad(c, [78, 0, 30, -10, -6, -16, -40, -50, -58, -48, -40, -14, -52, -8, -52, 8, -40, 14, -58, 48, -40, 50, -6, 16, 30, 10]); },
      details: function (c, F) {
        linie(c, F.tief, 2, [[62, 0], [-46, 0]]);
        linie(c, F.akzent, 2.5, [[-14, -22], [-44, -44]], .9);
        linie(c, F.akzent, 2.5, [[-14, 22], [-44, 44]], .9);
        fenster(c, F, 34, 0, 15, 5);
        punktReihe(c, F.licht, [[-30, -40], [-30, 40]], 2.2);
      },
      motoren: [{ x: -54, y: 0, r: 8 }],
      waffen: [[-28, -42], [-28, 42], [18, -12], [18, 12], [52, 0]],
      panzer: [[-6, -10], [-6, 10], [-26, -28], [-26, 28], [14, 0]],
    },
    fregatte: {
      rumpf: function (c) { pfad(c, [115, 0, 45, -22, -55, -32, -100, -19, -100, 19, -55, 32, 45, 22]); },
      details: function (c, F) {
        c.fillStyle = F.tief; pfad(c, [62, -7, -48, -14, -48, 14, 62, 7]); c.fill();
        linie(c, F.akzent, 2, [[100, 0], [64, 0]], .9);
        c.fillStyle = F.panzer; rundRechteck(c, -24, -26, 30, 12, 3); c.fill();
        linie(c, F.akzent, 2, [[-20, -20], [2, -20]], .95);
        const fensterReihe = [];
        for (let x = -40; x <= 36; x += 12) fensterReihe.push([x, -19], [x, 19]);
        punktReihe(c, F.licht, fensterReihe, 1.8);
      },
      motoren: [{ x: -104, y: -10, r: 8 }, { x: -104, y: 10, r: 8 }],
      waffen: [[30, -19], [30, 19], [-12, -27], [-12, 27], [74, 0]],
      panzer: [[4, -24], [4, 24], [-40, -27], [-40, 27], [44, 0]],
    },
    kreuzer: {
      rumpf: function (c) { pfad(c, [122, 0, 64, -34, -60, -46, -110, -30, -110, 30, -60, 46, 64, 34]); },
      details: function (c, F) {
        linie(c, F.tief, 2, [[100, 0], [-100, 0]]);
        linie(c, F.tief, 1.5, [[60, -26], [-80, -34]]);
        linie(c, F.tief, 1.5, [[60, 26], [-80, 34]]);
        c.fillStyle = F.panzer; rundRechteck(c, -46, -20, 76, 40, 6); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.2; c.globalAlpha = .7; c.stroke(); c.globalAlpha = 1;
        c.fillStyle = F.tief; rundRechteck(c, -22, -12, 26, 24, 4); c.fill();
        linie(c, F.akzent, 2.4, [[-18, -6], [0, -6]], .95);
        linie(c, F.akzent, 2.4, [[-18, 6], [0, 6]], .95);
        const reihe = [];
        for (let x = -70; x <= 50; x += 12) reihe.push([x, -36], [x, 36]);
        punktReihe(c, F.licht, reihe, 1.7);
        linie(c, F.akzent, 2, [[112, 0], [84, 0]], .9);
      },
      motoren: [{ x: -114, y: -18, r: 10 }, { x: -114, y: 0, r: 8 }, { x: -114, y: 18, r: 10 }],
      waffen: [[40, -22], [40, 22], [-62, -30], [-62, 30], [82, 0]],
      panzer: [[18, -36], [18, 36], [-34, -42], [-34, 42], [92, 0]],
    },
    traeger: {
      rumpf: function (c) { pfad(c, [112, -12, 74, -42, -100, -42, -116, -22, -116, 22, -100, 42, 74, 42, 112, 12]); },
      details: function (c, F) {
        c.fillStyle = F.tief; rundRechteck(c, -92, -28, 156, 56, 4); c.fill();
        c.save();
        c.setLineDash([10, 8]);
        linie(c, F.akzent, 2, [[-84, 0], [56, 0]], .8);
        c.restore();
        linie(c, F.kante, 1.2, [[-84, -18], [56, -18]], .5);
        linie(c, F.kante, 1.2, [[-84, 18], [56, 18]], .5);
        /* Reparaturbucht mit gruenem Kreuz */
        c.fillStyle = "#55c878"; c.globalAlpha = .9;
        c.fillRect(-36, -4, 22, 8); c.fillRect(-29, -11, 8, 22);
        c.globalAlpha = 1;
        c.fillStyle = "#1f3b2a"; rundRechteck(c, 74, -10, 26, 20, 3); c.fill();
        c.fillStyle = "#7dffb0"; c.globalAlpha = .8; c.fillRect(78, -5, 18, 10); c.globalAlpha = 1;
      },
      motoren: [{ x: -120, y: -26, r: 8 }, { x: -120, y: 0, r: 8 }, { x: -120, y: 26, r: 8 }],
      waffen: [[58, -40], [58, 40], [-58, -40], [-58, 40], [0, -40]],
      panzer: [[28, -42], [28, 42], [-28, -42], [-28, 42], [100, 0]],
    },
    drohne: {
      /* Drohnen fliegen doppelt: zwei kleine Koerper im Sprite. */
      paar: [{ x: 14, y: -38, s: .64 }, { x: -14, y: 38, s: .64 }],
      rumpf: function (c) {
        c.beginPath();
        c.moveTo(62, 0);
        c.bezierCurveTo(30, -10, 22, -38, 0, -44);
        c.bezierCurveTo(-22, -38, -42, -20, -56, 0);
        c.bezierCurveTo(-42, 20, -22, 38, 0, 44);
        c.bezierCurveTo(22, 38, 30, 10, 62, 0);
        c.closePath();
      },
      details: function (c, F) {
        ader(c, F, [[0, 0], [24, -14], [48, -4]]);
        ader(c, F, [[0, 0], [24, 14], [48, 4]]);
        ader(c, F, [[0, 0], [-20, -22], [-40, -10]]);
        ader(c, F, [[0, 0], [-20, 22], [-40, 10]]);
        kern(c, F, 0, 0, 13);
      },
      motoren: [{ x: -58, y: 0, r: 7 }],
      waffen: [[22, -36], [22, 36], [42, -14], [42, 14], [64, 0]],
      panzer: [[-10, -26], [-10, 26], [-30, -14], [-30, 14], [16, 0]],
    },
    stachel: {
      rumpf: function (c) {
        c.beginPath();
        c.moveTo(-95, 0);
        c.bezierCurveTo(-60, -66, 40, -76, 95, -32);
        c.bezierCurveTo(55, -22, 34, -10, 22, 0);
        c.bezierCurveTo(34, 10, 55, 22, 95, 32);
        c.bezierCurveTo(40, 76, -60, 66, -95, 0);
        c.closePath();
      },
      details: function (c, F) {
        /* Stachel am Bug */
        c.fillStyle = F.akzent; c.globalAlpha = .9;
        pfad(c, [18, -6, 74, -3, 104, 0, 74, 3, 18, 6]); c.fill();
        c.globalAlpha = 1;
        ader(c, F, [[-42, 0], [0, -30], [60, -40]]);
        ader(c, F, [[-42, 0], [0, 30], [60, 40]]);
        ader(c, F, [[-42, 0], [-70, -26]]);
        ader(c, F, [[-42, 0], [-70, 26]]);
        kern(c, F, -42, 0, 14);
      },
      motoren: [{ x: -96, y: 0, r: 9 }],
      waffen: [[62, -44], [62, 44], [4, -54], [4, 54], [-52, -40]],
      panzer: [[-20, -42], [-20, 42], [30, -48], [30, 48], [-66, 0]],
    },
    weber: {
      rumpf: function (c) {
        c.beginPath();
        c.moveTo(-95, 0);
        c.bezierCurveTo(-60, -56, 40, -60, 90, -20);
        c.bezierCurveTo(60, -8, 60, 8, 90, 20);
        c.bezierCurveTo(40, 60, -60, 56, -95, 0);
        c.closePath();
      },
      vorher: function (c, F) {
        /* Beine und gespannte Faeden hinter dem Koerper */
        c.strokeStyle = F.mitte; c.lineWidth = 5; c.lineCap = "round";
        [[-60, -20, -104, -64], [-46, -30, -64, -80], [-60, 20, -104, 64], [-46, 30, -64, 80], [10, -30, 44, -74], [10, 30, 44, 74]]
          .forEach(function (b) { c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[2], b[3]); c.stroke(); });
        c.strokeStyle = F.akzent; c.lineWidth = 1; c.globalAlpha = .45;
        c.beginPath();
        c.moveTo(-104, -64); c.lineTo(-64, -80); c.lineTo(44, -74);
        c.moveTo(-104, 64); c.lineTo(-64, 80); c.lineTo(44, 74);
        c.stroke();
        c.globalAlpha = 1;
      },
      details: function (c, F) {
        ader(c, F, [[-30, 0], [20, -26], [70, -16]]);
        ader(c, F, [[-30, 0], [20, 26], [70, 16]]);
        ader(c, F, [[-30, 0], [-70, -18]]);
        ader(c, F, [[-30, 0], [-70, 18]]);
        c.strokeStyle = F.akzent; c.lineWidth = 1.2; c.globalAlpha = .55;
        c.beginPath(); c.arc(-30, 0, 24, 0, 6.283); c.stroke();
        c.beginPath(); c.arc(-30, 0, 34, -1, 1); c.stroke();
        c.globalAlpha = 1;
        kern(c, F, -30, 0, 11);
      },
      motoren: [{ x: -96, y: 0, r: 8 }],
      waffen: [[66, -26], [66, 26], [10, -46], [10, 46], [86, 0]],
      panzer: [[-6, -40], [-6, 40], [-50, -34], [-50, 34], [36, 0]],
    },
    brutschiff: {
      rumpf: function (c) {
        c.beginPath();
        c.ellipse(0, 8, 118, 38, 0, 0, 6.283);
        c.moveTo(118, 8);
        c.closePath();
      },
      vorher: function (c, F) {
        /* Ranken am Heck, Kiefer am Bug */
        c.strokeStyle = F.mitte; c.lineWidth = 4; c.lineCap = "round";
        [[-100, 20, -128, 46], [-104, 4, -132, 8], [-100, -6, -126, -26]].forEach(function (b) {
          c.beginPath(); c.moveTo(b[0], b[1]); c.quadraticCurveTo((b[0] + b[2]) / 2, b[3] + 10, b[2], b[3]); c.stroke();
        });
        c.fillStyle = F.mitte;
        pfad(c, [104, -10, 132, -4, 112, 4]); c.fill();
        pfad(c, [104, 26, 132, 20, 112, 12]); c.fill();
      },
      details: function (c, F) {
        c.fillStyle = F.panzer;
        c.beginPath(); c.ellipse(0, -22, 46, 24, 0, 0, 6.283); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.4; c.globalAlpha = .8; c.stroke(); c.globalAlpha = 1;
        c.fillStyle = F.akzent; c.globalAlpha = .25;
        c.beginPath(); c.ellipse(0, -26, 30, 12, 0, 0, 6.283); c.fill();
        c.globalAlpha = 1;
        ader(c, F, [[-90, 10], [-40, 26], [40, 26], [90, 10]]);
        kern(c, F, -60, 22, 8);
        kern(c, F, 0, 30, 8);
        kern(c, F, 60, 22, 8);
      },
      motoren: [{ x: -118, y: 8, r: 10 }],
      waffen: [[80, -16], [80, 34], [-30, -40], [30, -40], [100, 8]],
      panzer: [[-50, -10], [50, -10], [-80, 30], [80, 30], [0, 44]],
    },
    /* ===== PIRATEN-ARMADA ===== */
    kaper: {
      rumpf: function (c) { pfad(c, [80, 0, 44, -12, -24, -18, -50, -12, -56, 0, -50, 12, -24, 18, 44, 12]); },
      vorher: function (c, F) { segel(c, F, [-6, -16, 16, -52, -34, -46, -30, -16]); },
      details: function (c, F) {
        linie(c, F.tief, 2, [[60, 0], [-46, 0]]);
        /* Enterhaken am Bug */
        linie(c, F.waffe, 2.4, [[78, 0], [100, 0]]);
        bogen(c, F.waffe, 2.2, 100, 0, 7, -1.9, 1.9);
        fenster(c, F, 30, 0, 11, 4);
        punktReihe(c, F.akzent, [[-10, -11], [-10, 11], [8, -9], [8, 9]], 1.8);
      },
      motoren: [{ x: -58, y: 0, r: 7 }],
      waffen: [[-14, -30], [-14, 30], [20, -10], [20, 10], [56, 0]],
      panzer: [[0, -10], [0, 10], [-30, -12], [-30, 12], [30, 0]],
    },
    brigant: {
      rumpf: function (c) { pfad(c, [104, 0, 64, -20, -56, -26, -92, -16, -100, 0, -92, 16, -56, 26, 64, 20]); },
      vorher: function (c, F) {
        segel(c, F, [22, -20, 32, -54, 6, -52, 0, -22], .85);
        segel(c, F, [-40, -24, -32, -54, -58, -52, -64, -22], .85);
      },
      details: function (c, F) {
        c.fillStyle = F.tief; pfad(c, [70, -6, -70, -10, -70, 10, 70, 6]); c.fill();
        linie(c, F.akzent, 2, [[98, 0], [72, 0]], .9);
        const luken = [];
        for (let x = -50; x <= 40; x += 15) luken.push([x, -21], [x, 21]);
        punktReihe(c, F.akzent, luken, 1.8);
        fenster(c, F, 52, 0, 10, 4);
      },
      motoren: [{ x: -102, y: -8, r: 7 }, { x: -102, y: 8, r: 7 }],
      waffen: [[40, -21], [40, 21], [-20, -25], [-20, 25], [80, 0]],
      panzer: [[10, -23], [10, 23], [-46, -24], [-46, 24], [60, 0]],
    },
    galeone: {
      rumpf: function (c) { pfad(c, [120, 0, 84, -30, -80, -40, -116, -32, -122, 0, -116, 32, -80, 40, 84, 30]); },
      vorher: function (c, F) {
        [50, -10, -70].forEach(function (x) { segel(c, F, [x + 10, -34, x + 20, -62, x - 8, -60, x - 12, -36], .85); });
      },
      details: function (c, F) {
        c.fillStyle = F.tief; rundRechteck(c, -76, -12, 152, 24, 4); c.fill();
        /* Achterkastell mit Laterne */
        c.fillStyle = F.panzer; rundRechteck(c, -118, -26, 38, 52, 5); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.2; c.globalAlpha = .7; c.stroke(); c.globalAlpha = 1;
        fenster(c, F, -100, 0, 7, 7);
        /* Kanonenluken beidseitig - glimmen */
        const luken = [];
        for (let x = -70; x <= 70; x += 14) luken.push([x, -33], [x, 33]);
        punktReihe(c, F.akzent, luken, 2.3);
        linie(c, F.waffe, 2.4, [[118, 0], [138, 0]]);
        linie(c, F.kante, 1.2, [[-70, 0], [100, 0]], .5);
      },
      motoren: [{ x: -126, y: -18, r: 9 }, { x: -126, y: 0, r: 8 }, { x: -126, y: 18, r: 9 }],
      waffen: [[60, -31], [60, 31], [-40, -38], [-40, 38], [100, 0]],
      panzer: [[20, -36], [20, 36], [-60, -39], [-60, 39], [80, 0]],
    },
    schmuggler: {
      rumpf: function (c) { pfad(c, [104, -10, 72, -40, -96, -40, -112, -24, -112, 24, -96, 40, 72, 40, 104, 10]); },
      details: function (c, F) {
        [[-86, -32], [-44, -32], [-86, 6], [-44, 6]].forEach(function (p, i) {
          c.fillStyle = i % 3 ? F.panzer : F.mitte; rundRechteck(c, p[0], p[1], 36, 26, 3); c.fill();
          c.strokeStyle = F.kante; c.lineWidth = 1; c.globalAlpha = .6; c.stroke(); c.globalAlpha = 1;
          linie(c, F.tief, 1.4, [[p[0] + 12, p[1]], [p[0] + 12, p[1] + 26]]);
        });
        /* Beutekiste */
        c.fillStyle = token("--fh-gold", "#d6a84f"); rundRechteck(c, 4, -15, 34, 30, 3); c.fill();
        linie(c, F.tief, 2, [[4, -3], [38, -3]]);
        punktReihe(c, F.licht, [[21, 4]], 2.4);
        fenster(c, F, 80, 0, 9, 7);
      },
      motoren: [{ x: -116, y: -24, r: 7 }, { x: -116, y: 0, r: 7 }, { x: -116, y: 24, r: 7 }],
      waffen: [[60, -38], [60, 38], [-60, -40], [-60, 40], [100, 0]],
      panzer: [[30, -40], [30, 40], [-20, -40], [-20, 40], [96, 0]],
    },
    /* ===== MASCHINEN-KOLLEKTIV ===== */
    sonde: {
      /* Sonden fliegen doppelt. */
      paar: [{ x: 16, y: -38, s: .62 }, { x: -16, y: 38, s: .62 }],
      rumpf: function (c) { pfad(c, [46, 0, 24, -40, -24, -40, -46, 0, -24, 40, 24, 40]); },
      vorher: function (c, F) {
        linie(c, F.mitte, 3, [[0, -40], [0, -66]]);
        linie(c, F.mitte, 3, [[0, 40], [0, 66]]);
        punktReihe(c, F.akzent, [[0, -66], [0, 66]], 3);
      },
      details: function (c, F) {
        flaeche(c, F.tief, [30, 0, 15, -26, -15, -26, -30, 0, -15, 26, 15, 26]);
        linie(c, F.akzent, 1.6, [[-24, -14], [-6, -14]], .8);
        linie(c, F.akzent, 1.6, [[-24, 14], [-6, 14]], .8);
        kern(c, F, 10, 0, 13);
      },
      motoren: [{ x: -48, y: 0, r: 7 }],
      waffen: [[30, -30], [30, 30], [40, -10], [40, 10], [48, 0]],
      panzer: [[-10, -34], [-10, 34], [-30, -20], [-30, 20], [-36, 0]],
    },
    waechter: {
      rumpf: function (c) { pfad(c, [72, -28, 28, -70, -28, -70, -72, -28, -72, 28, -28, 70, 28, 70, 72, 28]); },
      details: function (c, F) {
        linie(c, F.tief, 2, [[-60, 0], [60, 0]]);
        linie(c, F.tief, 2, [[0, -60], [0, 60]]);
        c.fillStyle = F.tief; c.beginPath(); c.arc(0, 0, 32, 0, 6.283); c.fill();
        bogen(c, F.akzent, 3, 0, 0, 46, 0, 6.283, .8);
        const knoten = [];
        for (let k = 0; k < 8; k++) knoten.push([Math.cos(k * .785) * 46, Math.sin(k * .785) * 46]);
        punktReihe(c, F.licht, knoten, 2.6);
        kern(c, F, 0, 0, 18);
      },
      motoren: [{ x: -74, y: -16, r: 7 }, { x: -74, y: 16, r: 7 }],
      waffen: [[50, -50], [50, 50], [-50, -50], [-50, 50], [74, 0]],
      panzer: [[0, -60], [0, 60], [-60, 0], [40, -40], [40, 40]],
    },
    zerstoerer: {
      rumpf: function (c) { pfad(c, [126, -6, 126, 6, 40, 34, -100, 42, -122, 22, -122, -22, -100, -42, 40, -34]); },
      details: function (c, F) {
        /* Railgun der Laenge nach */
        c.fillStyle = F.tief; c.fillRect(-60, -8, 186, 16);
        linie(c, F.akzent, 1.6, [[-50, -3], [124, -3]], .9);
        linie(c, F.akzent, 1.6, [[-50, 3], [124, 3]], .9);
        c.fillStyle = F.panzer;
        for (let x = -40; x <= 100; x += 20) c.fillRect(x, -11, 8, 22);
        linie(c, F.tief, 1.5, [[30, -28], [-90, -36]]);
        linie(c, F.tief, 1.5, [[30, 28], [-90, 36]]);
        kern(c, F, -86, 0, 11);
        punktReihe(c, F.licht, [[-104, -30], [-104, 30], [-70, -36], [-70, 36]], 1.8);
      },
      motoren: [{ x: -124, y: -22, r: 9 }, { x: -124, y: 0, r: 9 }, { x: -124, y: 22, r: 9 }],
      waffen: [[20, -30], [20, 30], [-50, -38], [-50, 38], [70, -24]],
      panzer: [[0, -34], [0, 34], [-80, -34], [-80, 34], [-106, 0]],
    },
    fabrik: {
      rumpf: function (c) { pfad(c, [92, -40, 92, 40, -100, 46, -112, 30, -112, -30, -100, -46]); },
      vorher: function (c, F) {
        /* Greifarme am Bug */
        linie(c, F.mitte, 5, [[60, -40], [84, -70], [112, -60]]);
        linie(c, F.mitte, 5, [[60, 40], [84, 70], [112, 60]]);
        punktReihe(c, F.akzent, [[112, -60], [112, 60]], 3);
      },
      details: function (c, F) {
        [-82, -18].forEach(function (x) {
          c.fillStyle = F.tief; rundRechteck(c, x, -32, 52, 64, 4); c.fill();
          c.strokeStyle = F.akzent; c.lineWidth = 1; c.globalAlpha = .5; c.stroke(); c.globalAlpha = 1;
          punktReihe(c, F.akzent, [[x + 16, -12], [x + 36, 0], [x + 16, 12]], 2);
        });
        fenster(c, F, 72, 0, 7, 22);
        linie(c, F.kante, 1, [[-100, -38], [86, -36]], .45);
        linie(c, F.kante, 1, [[-100, 38], [86, 36]], .45);
      },
      motoren: [{ x: -114, y: -20, r: 8 }, { x: -114, y: 0, r: 8 }, { x: -114, y: 20, r: 8 }],
      waffen: [[60, -42], [60, 42], [-50, -44], [-50, 44], [94, 0]],
      panzer: [[20, -44], [20, 44], [-90, -40], [-90, 40], [50, 0]],
    },
    /* ===== KRISTALL-KONKLAVE ===== */
    splitter: {
      rumpf: function (c) { pfad(c, [100, 0, 14, -22, -66, -12, -46, 0, -66, 12, 14, 22]); },
      vorher: function (c, F) {
        flaeche(c, F.mitte, [-6, -20, -42, -56, -30, -18]);
        flaeche(c, F.mitte, spiegel([-6, -20, -42, -56, -30, -18]));
      },
      details: function (c, F) {
        flaeche(c, F.hell, [100, 0, 14, -22, 4, 0], .35);
        linie(c, F.licht, 1.2, [[100, 0], [-46, 0]], .6);
        linie(c, F.licht, 1.2, [[14, -22], [4, 0], [14, 22]], .5);
        kern(c, F, -18, 0, 9);
      },
      motoren: [{ x: -58, y: 0, r: 7 }],
      waffen: [[-26, -44], [-26, 44], [30, -14], [30, 14], [70, 0]],
      panzer: [[0, -12], [0, 12], [-36, -10], [-36, 10], [40, 0]],
    },
    prisma: {
      rumpf: function (c) { pfad(c, [92, 0, 0, -58, -82, 0, 0, 58]); },
      details: function (c, F) {
        flaeche(c, F.hell, [92, 0, 0, -58, 0, 0], .3);
        flaeche(c, F.tief, [60, 0, 0, -20, -54, 0, 0, 20], .5);
        linie(c, F.licht, 1.2, [[0, -58], [0, 58]], .5);
        linie(c, F.licht, 1.2, [[92, 0], [-82, 0]], .5);
        /* Lichtbrechung am Bug: drei Farbstrahlen */
        ["#ff7ad9", "#7affea", "#fff27a"].forEach(function (fa, i) { linie(c, fa, 1.6, [[92, 0], [118, (i - 1) * 9]], .8); });
        kern(c, F, 0, 0, 14);
      },
      motoren: [{ x: -84, y: -10, r: 6 }, { x: -84, y: 10, r: 6 }],
      waffen: [[46, -29], [46, 29], [-41, -29], [-41, 29], [92, 0]],
      panzer: [[20, -40], [20, 40], [-30, -40], [-30, 40], [60, 0]],
    },
    resonator: {
      rumpf: function (c) { pfad(c, [46, 0, 23, -40, -23, -40, -46, 0, -23, 40, 23, 40]); },
      vorher: function (c, F) {
        bogen(c, F.akzent, 1.4, 0, 0, 66, 0, 6.283, .5);
        for (let k = 0; k < 6; k++) {
          const w = k * 1.047 + .52, x = Math.cos(w) * 66, y = Math.sin(w) * 66;
          c.save(); c.translate(x, y); c.rotate(w);
          flaeche(c, F.hell, [12, 0, 0, -6, -12, 0, 0, 6], .9);
          c.restore();
        }
      },
      details: function (c, F) {
        for (let k = 0; k < 6; k++) linie(c, F.licht, 1, [[0, 0], [Math.cos(k * 1.047) * 44, Math.sin(k * 1.047) * 40]], .4);
        bogen(c, F.akzent, 1.4, 0, 0, 30, 0, 6.283, .6);
        kern(c, F, 0, 0, 18);
      },
      motoren: [{ x: -48, y: 0, r: 7 }],
      waffen: [[57, -33], [57, 33], [-57, -33], [-57, 33], [66, 0]],
      panzer: [[0, -30], [0, 30], [-30, 0], [30, -16], [30, 16]],
    },
    monolith: {
      rumpf: function (c) { pfad(c, [118, 0, 92, -32, -92, -32, -118, 0, -92, 32, 92, 32]); },
      vorher: function (c, F) {
        flaeche(c, F.hell, [-24, -30, -8, -58, 8, -30], .85);
        flaeche(c, F.hell, spiegel([-24, -30, -8, -58, 8, -30]), .85);
        flaeche(c, F.mitte, [30, -30, 40, -48, 50, -30], .85);
        flaeche(c, F.mitte, spiegel([30, -30, 40, -48, 50, -30]), .85);
      },
      details: function (c, F) {
        flaeche(c, F.hell, [118, 0, 92, -32, -92, -32, -118, 0], .22);
        linie(c, F.licht, 1.2, [[92, -32], [64, 0], [92, 32]], .5);
        linie(c, F.licht, 1.2, [[-92, -32], [-64, 0], [-92, 32]], .5);
        linie(c, F.akzent, 2, [[-80, 0], [80, 0]], .6);
        kern(c, F, -36, 0, 13);
        kern(c, F, 36, 0, 10);
      },
      motoren: [{ x: -120, y: -14, r: 8 }, { x: -120, y: 14, r: 8 }],
      waffen: [[60, -32], [60, 32], [-60, -32], [-60, 32], [118, 0]],
      panzer: [[20, -32], [20, 32], [-30, -32], [-30, 32], [100, 0]],
    },
    /* ===== GEISTERFLOTTE ===== */
    irrlicht: {
      rumpf: function (c) {
        c.beginPath();
        c.moveTo(62, 0);
        c.bezierCurveTo(62, -30, 22, -34, 0, -24);
        c.bezierCurveTo(-30, -10, -80, -6, -112, 0);
        c.bezierCurveTo(-80, 6, -30, 10, 0, 24);
        c.bezierCurveTo(22, 34, 62, 30, 62, 0);
        c.closePath();
      },
      details: function (c, F) {
        ader(c, F, [[30, 0], [-20, -8], [-86, -2]]);
        ader(c, F, [[30, 0], [-20, 8], [-86, 2]]);
        kern(c, F, 30, 0, 17);
      },
      motoren: [{ x: -100, y: 0, r: 6 }],
      waffen: [[40, -24], [40, 24], [10, -26], [10, 26], [62, 0]],
      panzer: [[20, -18], [20, 18], [-20, -12], [-20, 12], [-50, 0]],
    },
    phantom: {
      rumpf: function (c) { pfad(c, [104, 0, 34, -30, -56, -46, -70, -30, -86, -38, -94, -18, -108, -20, -96, 0, -108, 20, -94, 18, -86, 38, -70, 30, -56, 46, 34, 30]); },
      details: function (c, F) {
        flaeche(c, F.tief, [72, -6, 20, -14, 20, 14, 72, 6]);
        punktReihe(c, F.akzent, [[46, -5], [46, 5]], 2.4);
        ader(c, F, [[20, -14], [-30, -30], [-70, -30]]);
        ader(c, F, [[20, 14], [-30, 30], [-70, 30]]);
      },
      motoren: [{ x: -96, y: -10, r: 6 }, { x: -96, y: 10, r: 6 }],
      waffen: [[20, -28], [20, 28], [-40, -40], [-40, 40], [80, 0]],
      panzer: [[0, -22], [0, 22], [-60, -30], [-60, 30], [40, 0]],
    },
    banshee: {
      rumpf: function (c) {
        c.beginPath();
        c.moveTo(64, 0);
        c.bezierCurveTo(24, -74, -80, -74, -104, -42);
        c.bezierCurveTo(-64, -32, -44, -14, -44, 0);
        c.bezierCurveTo(-44, 14, -64, 32, -104, 42);
        c.bezierCurveTo(-80, 74, 24, 74, 64, 0);
        c.closePath();
      },
      details: function (c, F) {
        /* Schreiender Mund am Bug, davor Schallboegen */
        c.fillStyle = F.tief; c.beginPath(); c.ellipse(40, 0, 10, 16, 0, 0, 6.283); c.fill();
        bogen(c, F.akzent, 2, 56, 0, 18, -.8, .8, .7);
        bogen(c, F.akzent, 2, 56, 0, 30, -.7, .7, .45);
        ader(c, F, [[0, 0], [-40, -40], [-96, -42]]);
        ader(c, F, [[0, 0], [-40, 40], [-96, 42]]);
        kern(c, F, 0, 0, 12);
      },
      motoren: [{ x: -100, y: -36, r: 6 }, { x: -100, y: 36, r: 6 }],
      waffen: [[0, -58], [0, 58], [-60, -50], [-60, 50], [76, 0]],
      panzer: [[-20, -40], [-20, 40], [20, -50], [20, 50], [-30, 0]],
    },
    totenschiff: {
      rumpf: function (c) { pfad(c, [120, 0, 84, -30, -80, -40, -116, -32, -122, 0, -116, 32, -80, 40, 84, 30]); },
      vorher: function (c, F) {
        /* zerfetzte Segel */
        [50, -10, -70].forEach(function (x) {
          segel(c, F, [x + 14, -34, x + 28, -76, x + 12, -64, x + 2, -78, x - 8, -64, x - 18, -76, x - 18, -36], .5);
        });
      },
      details: function (c, F) {
        /* Gerippe */
        [-60, -30, 0, 30, 60].forEach(function (x) {
          c.save(); c.strokeStyle = F.kante; c.lineWidth = 2; c.globalAlpha = .45;
          c.beginPath(); c.moveTo(x - 6, -36); c.quadraticCurveTo(x + 8, 0, x - 6, 36); c.stroke(); c.restore();
        });
        linie(c, F.tief, 3, [[-100, 0], [110, 0]], .8);
        const laternen = [];
        for (let x = -70; x <= 70; x += 28) laternen.push([x, -34], [x, 34]);
        punktReihe(c, F.akzent, laternen, 2.2);
        kern(c, F, -104, 0, 11);
      },
      motoren: [{ x: -124, y: -18, r: 8 }, { x: -124, y: 18, r: 8 }],
      waffen: [[60, -31], [60, 31], [-40, -38], [-40, 38], [100, 0]],
      panzer: [[20, -36], [20, 36], [-60, -39], [-60, 39], [80, 0]],
    },
    /* ===== BOSS: MUTTERSCHIFF (59) ===== */
    mutterschiff: {
      rumpf: function (c) { pfad(c, [130, 0, 74, -32, 24, -70, -60, -78, -118, -52, -130, -22, -104, 0, -130, 22, -118, 52, -60, 78, 24, 70, 74, 32]); },
      vorher: function (c, F) {
        /* Hangar-Fluegel und Dornen */
        flaeche(c, F.mitte, [24, -70, 4, -94, -54, -98, -60, -78]);
        flaeche(c, F.mitte, spiegel([24, -70, 4, -94, -54, -98, -60, -78]));
        [[-20, -76, -6, -96], [-40, -78, -30, -100], [40, -56, 62, -74]].forEach(function (d) {
          linie(c, F.kante, 3, [[d[0], d[1]], [d[2], d[3]]], .7);
          linie(c, F.kante, 3, [[d[0], -d[1]], [d[2], -d[3]]], .7);
        });
      },
      details: function (c, F) {
        flaeche(c, F.tief, [112, 0, 60, -14, -96, -12, -96, 12, 60, 14]);
        c.fillStyle = F.panzer; rundRechteck(c, -46, -22, 70, 44, 6); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.4; c.globalAlpha = .7; c.stroke(); c.globalAlpha = 1;
        /* Hangarbuchten mit Glut */
        const buchten = [];
        for (let x = -90; x <= 50; x += 20) buchten.push([x, -46], [x, 46]);
        punktReihe(c, F.akzent, buchten, 2.6);
        linie(c, F.akzent, 2, [[-100, -30], [60, -24]], .5);
        linie(c, F.akzent, 2, [[-100, 30], [60, 24]], .5);
        kern(c, F, -74, 0, 24);
        kern(c, F, 100, 0, 11);
        kern(c, F, -10, 0, 9);
        /* Geschuetztuerme */
        [[44, -40], [44, 40], [-14, -58], [-14, 58], [74, -18], [74, 18]].forEach(function (p) {
          linie(c, F.waffe, 3.5, [[p[0], p[1]], [p[0] + 18, p[1]]]);
          c.fillStyle = F.panzer; c.beginPath(); c.arc(p[0], p[1], 7, 0, 6.283); c.fill();
          c.strokeStyle = F.kante; c.lineWidth = 1.2; c.stroke();
          punktReihe(c, F.akzent, [p], 2.2);
        });
      },
      motoren: [{ x: -124, y: -40, r: 12 }, { x: -108, y: 0, r: 14 }, { x: -124, y: 40, r: 12 }],
      waffen: [[60, -40], [60, 40], [-30, -60], [-30, 60], [110, 0]],
      panzer: [[0, -50], [0, 50], [-80, -50], [-80, 50], [40, 0]],
    },
  };

  /* ------------------------------------------------------
     KLEINE ZEICHENHELFER
  ------------------------------------------------------ */
  function linie(c, farbe, breite, punkte, alpha) {
    c.save();
    c.strokeStyle = farbe; c.lineWidth = breite; c.lineCap = "round";
    if (alpha != null) c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(punkte[0][0], punkte[0][1]);
    for (let i = 1; i < punkte.length; i++) c.lineTo(punkte[i][0], punkte[i][1]);
    c.stroke();
    c.restore();
  }
  function punktReihe(c, farbe, punkte, r) {
    c.save();
    c.fillStyle = farbe; c.shadowColor = farbe; c.shadowBlur = 4;
    punkte.forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], r, 0, 6.283); c.fill(); });
    c.restore();
  }
  function rundRechteck(c, x, y, b, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + b, y, x + b, y + h, r);
    c.arcTo(x + b, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + b, y, r);
    c.closePath();
  }
  function fenster(c, F, x, y, rx, ry) {
    c.save();
    const g = c.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
    g.addColorStop(0, F.licht); g.addColorStop(1, F.akzent);
    c.fillStyle = g; c.shadowColor = F.akzent; c.shadowBlur = 8;
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.283); c.fill();
    c.restore();
  }
  function ader(c, F, punkte) {
    c.save();
    c.strokeStyle = F.akzent; c.lineWidth = 1.6; c.globalAlpha = .45; c.lineCap = "round";
    c.beginPath();
    c.moveTo(punkte[0][0], punkte[0][1]);
    if (punkte.length === 3) c.quadraticCurveTo(punkte[1][0], punkte[1][1], punkte[2][0], punkte[2][1]);
    else for (let i = 1; i < punkte.length; i++) c.lineTo(punkte[i][0], punkte[i][1]);
    c.stroke();
    c.restore();
  }
  function kern(c, F, x, y, r) {
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, F.licht); g.addColorStop(.5, F.akzent); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.shadowColor = F.akzent; c.shadowBlur = 14;
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    c.restore();
  }

  /* Rumpf mit Verlauf und Neonkante. */
  function rumpfMalen(c, T, F, st, kantenBreite) {
    let g;
    if (st === "metall") {
      g = c.createLinearGradient(0, -50, 0, 50);
      g.addColorStop(0, F.hell); g.addColorStop(.45, F.mitte); g.addColorStop(1, F.dunkel);
    } else if (st === "kristall") {
      g = c.createLinearGradient(-60, -60, 60, 60);
      g.addColorStop(0, F.hell); g.addColorStop(.35, F.mitte); g.addColorStop(.7, F.dunkel); g.addColorStop(1, F.mitte);
    } else {
      g = c.createRadialGradient(-10, -14, 6, 0, 0, 120);
      g.addColorStop(0, F.hell); g.addColorStop(.55, F.mitte); g.addColorStop(1, F.dunkel);
    }
    T.rumpf(c);
    c.save();
    /* Geister sind durchscheinend. */
    if (st === "geist") c.globalAlpha = .72;
    c.fillStyle = g;
    c.fill();
    c.restore();
    c.save();
    c.shadowColor = st === "metall" || st === "geist" ? F.akzent : F.kante;
    c.shadowBlur = st === "geist" ? 18 : 10;
    c.strokeStyle = F.kante;
    c.lineWidth = kantenBreite;
    c.lineJoin = "round";
    T.rumpf(c);
    c.stroke();
    c.restore();
  }

  function panzerMalen(c, T, F, st, stufe) {
    for (let i = 0; i < Math.min(stufe, T.panzer.length); i++) {
      const p = T.panzer[i];
      c.save();
      if (st === "kristall") {
        /* Kristall: kleines Sechseck mit Lichtkante */
        const q = [];
        for (let k = 0; k < 6; k++) q.push(p[0] + Math.cos(k * 1.047) * 8, p[1] + Math.sin(k * 1.047) * 6);
        c.fillStyle = F.panzer; pfad(c, q); c.fill();
        c.strokeStyle = F.licht; c.lineWidth = 1.2; c.globalAlpha = .9; c.stroke();
      } else if (st === "geist") {
        /* Geist: Runenring */
        c.strokeStyle = F.akzent; c.lineWidth = 1.6; c.globalAlpha = .85; c.shadowColor = F.akzent; c.shadowBlur = 6;
        c.beginPath(); c.arc(p[0], p[1], 7, 0, 6.283); c.stroke();
        c.beginPath(); c.moveTo(p[0] - 4, p[1]); c.lineTo(p[0] + 4, p[1]); c.moveTo(p[0], p[1] - 4); c.lineTo(p[0], p[1] + 4); c.stroke();
      } else if (st === "metall") {
        c.fillStyle = F.panzer;
        rundRechteck(c, p[0] - 10, p[1] - 5, 20, 10, 2);
        c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.2; c.globalAlpha = .85; c.stroke();
        c.fillStyle = F.licht; c.globalAlpha = .9;
        c.fillRect(p[0] - 7, p[1] - 1, 2, 2); c.fillRect(p[0] + 5, p[1] - 1, 2, 2);
      } else {
        c.fillStyle = F.panzer;
        c.beginPath(); c.ellipse(p[0], p[1], 12, 7, Math.atan2(p[1], p[0] || 1), 0, 6.283); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.4; c.globalAlpha = .9; c.stroke();
        c.strokeStyle = F.akzent; c.globalAlpha = .4;
        c.beginPath(); c.ellipse(p[0], p[1], 7, 3.5, Math.atan2(p[1], p[0] || 1), 0, 6.283); c.stroke();
      }
      c.restore();
    }
  }

  function waffenMalen(c, T, F, st, stufe) {
    for (let i = 0; i < Math.min(stufe, T.waffen.length); i++) {
      const p = T.waffen[i];
      c.save();
      if (st === "kristall") {
        /* Kristallspitze, vom Koerper weg */
        c.translate(p[0], p[1]); c.rotate(Math.atan2(p[1], p[0] || 0.01));
        c.fillStyle = F.waffe; c.shadowColor = F.akzent; c.shadowBlur = 6;
        pfad(c, [18, 0, 0, -4, -6, 0, 0, 4]); c.fill();
      } else if (st === "geist") {
        /* Seelenkugel */
        kern(c, F, p[0], p[1], 7);
      } else if (st === "metall") {
        /* Geschuetzturm mit Rohr nach vorn */
        c.strokeStyle = F.waffe; c.lineWidth = 3; c.lineCap = "round";
        c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 16, p[1]); c.stroke();
        c.fillStyle = F.panzer; c.beginPath(); c.arc(p[0], p[1], 6, 0, 6.283); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = F.akzent; c.beginPath(); c.arc(p[0], p[1], 2, 0, 6.283); c.fill();
      } else {
        /* Dorn, vom Koerper weg gerichtet */
        const w = Math.atan2(p[1], p[0] || 0.01);
        c.translate(p[0], p[1]); c.rotate(w);
        c.fillStyle = F.waffe; c.shadowColor = F.akzent; c.shadowBlur = 6;
        c.beginPath(); c.moveTo(16, 0); c.lineTo(-4, -5); c.lineTo(-4, 5); c.closePath(); c.fill();
      }
      c.restore();
    }
  }

  /* Sonderwaffe und Module (58) auf den Rumpf - nach dem Ausbau. */
  function ausruestungMalen(c, T, F, aus) {
    if (!aus) return;
    const mod = aus.module || [];
    if (mod.indexOf("panzer") >= 0) {
      c.save();
      c.setLineDash([12, 7]); c.strokeStyle = F.panzer; c.lineWidth = 5; c.globalAlpha = .9;
      T.rumpf(c); c.stroke();
      c.setLineDash([]); c.strokeStyle = F.kante; c.lineWidth = 1; c.globalAlpha = .6;
      T.rumpf(c); c.stroke();
      c.restore();
    }
    if (mod.indexOf("reaktor") >= 0) {
      bogen(c, "#ffb347", 3, -14, 0, 11, 0, 6.283, .9);
      kern(c, { licht: "#fff2c0", akzent: "#ffb347" }, -14, 0, 9);
    }
    if (mod.indexOf("zielcomputer") >= 0) {
      c.save();
      c.fillStyle = F.waffe; c.strokeStyle = F.tief; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(-34, -14, 7, 4, -.5, 0, 6.283); c.fill(); c.stroke();
      linie(c, F.waffe, 1.4, [[-34, -14], [-26, -24]]);
      punktReihe(c, "#ff4040", [[-26, -24]], 1.8);
      c.restore();
    }
    const fa = WAFFEN_FARBE[aus.waffe];
    if (!fa) return;
    /* Gross genug, dass man die Waffe auf jedem Schiff erkennt. */
    const x = 0, y = 0;
    c.save();
    c.translate(10, 0);
    c.scale(1.7, 1.7);
    if (aus.waffe === "plasma") {
      c.fillStyle = F.panzer; rundRechteck(c, x - 18, y - 6, 40, 12, 4); c.fill();
      c.strokeStyle = fa; c.lineWidth = 1.4; c.stroke();
      linie(c, fa, 1.4, [[x - 10, y - 6], [x - 10, y + 6]], .8);
      linie(c, fa, 1.4, [[x, y - 6], [x, y + 6]], .8);
      kern(c, { licht: "#ffffff", akzent: fa }, x + 24, y, 9);
    } else if (aus.waffe === "raketen") {
      [-1, 1].forEach(function (sg) {
        c.fillStyle = F.panzer; rundRechteck(c, x - 14, y + sg * 14 - 5, 30, 10, 3); c.fill();
        c.strokeStyle = F.kante; c.lineWidth = 1; c.stroke();
        punktReihe(c, fa, [[x + 18, y + sg * 14 - 2.5], [x + 18, y + sg * 14 + 2.5]], 2.2);
      });
    } else if (aus.waffe === "tesla") {
      c.strokeStyle = fa; c.lineWidth = 2;
      [0, 7, 14].forEach(function (d) { c.beginPath(); c.ellipse(x - 6 + d, y, 3, 10 - d * 0.3, 0, 0, 6.283); c.stroke(); });
      kern(c, { licht: "#ffffff", akzent: fa }, x + 16, y, 8);
      linie(c, fa, 1.2, [[x + 16, y], [x + 24, y - 8], [x + 30, y - 2]], .9);
      linie(c, fa, 1.2, [[x + 16, y], [x + 26, y + 7]], .9);
    } else if (aus.waffe === "lanze") {
      c.shadowColor = fa; c.shadowBlur = 10;
      c.fillStyle = fa; pfad(c, [x - 16, y - 3, x + 52, y - 1.2, x + 62, y, x + 52, y + 1.2, x - 16, y + 3]); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = F.panzer; rundRechteck(c, x - 20, y - 7, 16, 14, 3); c.fill();
      c.strokeStyle = fa; c.lineWidth = 1.2; c.stroke();
    }
    c.restore();
  }

  function schiffMalen(c, typ, seite, stufen, aus) {
    const T = TYPEN[typ];
    if (!T) return;
    const F = farben()[seite] || farben().menschen;
    const sl = stil(seite);
    const st = stufen || {};
    const kante = 2.2 + 0.35 * (st.leben || 0);
    const einzeln = function () {
      if (T.vorher) T.vorher(c, F);
      rumpfMalen(c, T, F, sl, kante);
      T.details(c, F);
      panzerMalen(c, T, F, sl, st.leben || 0);
      waffenMalen(c, T, F, sl, st.schaden || 0);
      ausruestungMalen(c, T, F, aus);
    };
    if (T.paar) {
      T.paar.forEach(function (p) {
        c.save(); c.translate(p.x, p.y); c.scale(p.s, p.s); einzeln(); c.restore();
      });
    } else {
      einzeln();
    }
  }

  /* Triebwerke in Schiffskoordinaten (Drohnen: beide Koerper). */
  function motorPunkte(typ) {
    const T = TYPEN[typ];
    if (!T) return [];
    if (!T.paar) return T.motoren;
    const aus = [];
    T.paar.forEach(function (p) {
      T.motoren.forEach(function (m) { aus.push({ x: p.x + m.x * p.s, y: p.y + m.y * p.s, r: m.r * p.s }); });
    });
    return aus;
  }

  /* ------------------------------------------------------
     SPRITES
  ------------------------------------------------------ */
  const BOX_B = 300, BOX_H = 200;   // Rand fuer Leuchten um 260 x 160
  const sprites = new Map();
  const glimm = {};

  function sprite(typ, seite, stufen, pxBreite, aus) {
    const st = stufen || {};
    const px = Math.max(24, Math.round(pxBreite / 8) * 8);
    const key = typ + "|" + seite + "|" + (st.leben || 0) + "|" + (st.schaden || 0) + "|" + px
      + (aus ? "|" + (aus.waffe || "") + "|" + (aus.module || []).join(",") : "");
    let s = sprites.get(key);
    if (s) return s;
    const skala = px / 260;
    s = document.createElement("canvas");
    s.width = Math.ceil(BOX_B * skala);
    s.height = Math.ceil(BOX_H * skala);
    const c = s.getContext("2d");
    c.translate(s.width / 2, s.height / 2);
    c.scale(skala, skala);
    schiffMalen(c, typ, seite, st, aus);
    if (sprites.size > 400) sprites.clear();
    sprites.set(key, s);
    return s;
  }

  /* Weiches Leuchten (Flamme, Aura) - einmal je Farbe. */
  function glimmen(farbe, kernFarbe) {
    const key = farbe + "|" + kernFarbe;
    if (glimm[key]) return glimm[key];
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const c = s.getContext("2d");
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, kernFarbe); g.addColorStop(.25, farbe); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    glimm[key] = s;
    return s;
  }

  /* ------------------------------------------------------
     ZEICHNEN (je Bild)
  ------------------------------------------------------ */
  function zeichnen(ctx, o) {
    const T = TYPEN[o.typ];
    if (!T) return;
    const F = farben()[o.seite] || farben().menschen;
    const st = o.stufen || {};
    const dpr = o.dpr || 1;
    const skala = o.breite / 260;
    const aus = o.ausruestung || null;
    const mod = (aus && aus.module) || [];
    const sp = sprite(o.typ, o.seite, st, o.breite * dpr, aus);
    const zeit = o.zeit || 0, phase = o.phase || 0;
    const A = o.alpha == null ? 1 : o.alpha;   // Grund-Deckkraft (Grossschiffe im Hintergrund)

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.winkel || 0);

    /* Aura (Spezial-Stufe) */
    if (st.spezial > 0) {
      const puls = o.ruhig ? 0.5 : 0.5 + 0.5 * Math.sin(zeit * 0.003 + phase);
      const r = 120 * skala * (1 + 0.05 * st.spezial);
      ctx.globalAlpha = A * (Math.min(0.55, 0.12 + 0.07 * st.spezial) * (0.7 + 0.3 * puls));
      ctx.drawImage(glimmen(F.akzent, F.licht), -r, -r * 0.75, r * 2, r * 1.5);
      ctx.globalAlpha = A;
    }

    /* Triebwerksflammen hinter dem Rumpf */
    const flamme = glimmen(F.flamme, F.flammeKern);
    const nachbrenner = mod.indexOf("nachbrenner") >= 0 ? 1.7 : 1;   // Modul (58): lange Flammen
    motorPunkte(o.typ).forEach(function (m, i) {
      const flacker = o.ruhig ? 1 : 0.8 + 0.35 * Math.abs(Math.sin(zeit * 0.025 + phase * 3 + i * 1.7));
      const lang = m.r * 5 * flacker * skala * nachbrenner, hoch = m.r * 2.4 * skala;
      ctx.globalAlpha = A * (0.9);
      ctx.drawImage(flamme, m.x * skala - lang * 1.35, m.y * skala - hoch / 2, lang * 1.6, hoch);
    });
    ctx.globalAlpha = A;

    ctx.drawImage(sp, -sp.width / dpr / 2, -sp.height / dpr / 2, sp.width / dpr, sp.height / dpr);

    /* Deflektorschild (58): ein feiner Schimmer um das Schiff */
    if (mod.indexOf("schild") >= 0) {
      const puls = o.ruhig ? 0.5 : 0.5 + 0.5 * Math.sin(zeit * 0.004 + phase);
      ctx.globalAlpha = A * (0.25 + 0.2 * puls);
      ctx.strokeStyle = "#8fe3ff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 128 * skala, 86 * skala, 0, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = A;
    }

    /* Treffer: Schildblase (Metall), Facettenblitz (Kristall) bzw.
       Membran-Zucken (Aliens, Geister) */
    if (o.treffer > 0) {
      ctx.globalAlpha = A * (o.treffer);
      const sl = stil(o.seite);
      if (sl === "metall") {
        ctx.strokeStyle = F.akzent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 135 * skala, 92 * skala, 0, 0, 6.283); ctx.stroke();
        ctx.globalAlpha = A * (o.treffer * 0.18); ctx.fillStyle = F.akzent; ctx.fill();
      } else if (sl === "kristall") {
        ctx.strokeStyle = F.licht; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const px = Math.cos(k * 1.047) * 130 * skala, py = Math.sin(k * 1.047) * 90 * skala;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
        ctx.globalAlpha = A * (o.treffer * 0.2); ctx.fillStyle = F.akzent; ctx.fill();
      } else {
        ctx.drawImage(glimmen(F.akzent, "#ffffff"), -110 * skala, -80 * skala, 220 * skala, 160 * skala);
      }
      ctx.globalAlpha = A;
    }
    ctx.restore();
  }

  /* Standbild fuer den Hangar (Flamme und Aura ruhend). */
  function bild(typ, seite, stufen, breiteCss, ausruestung) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const b = breiteCss, h = Math.round(breiteCss * BOX_H / BOX_B);
    const c = document.createElement("canvas");
    c.width = Math.round(b * dpr);
    c.height = Math.round(h * dpr);
    c.setAttribute("aria-hidden", "true");
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    zeichnen(ctx, { typ: typ, seite: seite, stufen: stufen, x: b / 2, y: h / 2, winkel: 0, breite: b * 260 / BOX_B, dpr: dpr, zeit: 0, ruhig: true, ausruestung: ausruestung || null });
    return c;
  }

  /* Ausbaustufen aus den Kampfwerten einer Schlacht-Einheit
     (Umkehrung von hangarWerte() bzw. app.schlacht_werte). */
  function stufenAus(e) {
    const leer = { leben: 0, schaden: 0, spezial: 0 };
    if (!e || typeof HANGAR_TYPEN === "undefined" || !HANGAR_TYPEN[e.typ]) return leer;
    const T = HANGAR_TYPEN[e.typ];
    const mod = (typeof HANGAR_SEITEN_MOD !== "undefined" && HANGAR_SEITEN_MOD[e.partei || e.seite]) || { leben: 1, schaden: 1 };
    const anzahl = T.anzahl || 1;
    const klemm = function (n) { return Math.max(0, Math.min(5, Math.round(n) || 0)); };
    return {
      leben: klemm((Number(e.leben) / anzahl / (T.leben * mod.leben) - 1) / 0.2),
      schaden: klemm((Number(e.schaden) / anzahl / (T.schaden * mod.schaden) - 1) / 0.2),
      spezial: e.spezial != null ? klemm((Number(e.spezial) - 1) / 0.25) : 0,
    };
  }

  window.fhSchiffe = {
    zeichnen: zeichnen,
    bild: bild,
    stufenAus: stufenAus,
    motorPunkte: motorPunkte,
    farbe: function (seite) { return farben()[seite] || farben().menschen; },
    stil: stil,
    WAFFEN_FARBE: WAFFEN_FARBE,
    TYPEN: Object.keys(TYPEN),
  };
})();
