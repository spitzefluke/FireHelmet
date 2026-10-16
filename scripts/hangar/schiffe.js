/* ======================================================
   SCHIFFE: GEMEINSAME GRAFIK FUER HANGAR UND STERNENSCHLACHT
   ---------------------------------------------------
   Reine Optik ohne Zustand. Jeder der acht Einheitentypen hat eine
   eigene Silhouette im Neon-Vektor-Stil der Zeitmaschine 2100:
   Menschen kuehl-metallisch mit Cockpit, Fenstern und Leuchtstreifen,
   Aliens organisch violett mit leuchtendem Kern und Adern.

   AUSBAU SICHTBAR (Stufen 0..5 wie im Hangar)
     leben   -> Panzerplatten (Menschen) bzw. Chitinschuppen (Aliens)
     schaden -> Geschuetztuerme bzw. Dornen
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
                              dpr, zeit, phase, treffer (0..1), ruhig }
     bild(typ, seite, stufen, breiteCss)  -> <canvas> (Hangar)
     stufenAus(einheit) -> { leben, schaden, spezial } aus Kampfwerten
     motorPunkte(typ)   -> Triebwerke (fuer Effekte)
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
    };
    return farbenCache;
  }

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
  function rumpfMalen(c, T, F, seite, kantenBreite) {
    let g;
    if (seite === "menschen") {
      g = c.createLinearGradient(0, -50, 0, 50);
      g.addColorStop(0, F.hell); g.addColorStop(.45, F.mitte); g.addColorStop(1, F.dunkel);
    } else {
      g = c.createRadialGradient(-10, -14, 6, 0, 0, 120);
      g.addColorStop(0, F.hell); g.addColorStop(.55, F.mitte); g.addColorStop(1, F.dunkel);
    }
    T.rumpf(c);
    c.fillStyle = g;
    c.fill();
    c.save();
    c.shadowColor = seite === "menschen" ? F.akzent : F.kante;
    c.shadowBlur = 10;
    c.strokeStyle = F.kante;
    c.lineWidth = kantenBreite;
    c.lineJoin = "round";
    T.rumpf(c);
    c.stroke();
    c.restore();
  }

  function panzerMalen(c, T, F, seite, stufe) {
    for (let i = 0; i < Math.min(stufe, T.panzer.length); i++) {
      const p = T.panzer[i];
      c.save();
      if (seite === "menschen") {
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

  function waffenMalen(c, T, F, seite, stufe) {
    for (let i = 0; i < Math.min(stufe, T.waffen.length); i++) {
      const p = T.waffen[i];
      c.save();
      if (seite === "menschen") {
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

  function schiffMalen(c, typ, seite, stufen) {
    const T = TYPEN[typ];
    if (!T) return;
    const F = farben()[seite] || farben().menschen;
    const st = stufen || {};
    const kante = 2.2 + 0.35 * (st.leben || 0);
    const einzeln = function () {
      if (T.vorher) T.vorher(c, F);
      rumpfMalen(c, T, F, seite, kante);
      T.details(c, F);
      panzerMalen(c, T, F, seite, st.leben || 0);
      waffenMalen(c, T, F, seite, st.schaden || 0);
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

  function sprite(typ, seite, stufen, pxBreite) {
    const st = stufen || {};
    const px = Math.max(24, Math.round(pxBreite / 8) * 8);
    const key = typ + "|" + seite + "|" + (st.leben || 0) + "|" + (st.schaden || 0) + "|" + px;
    let s = sprites.get(key);
    if (s) return s;
    const skala = px / 260;
    s = document.createElement("canvas");
    s.width = Math.ceil(BOX_B * skala);
    s.height = Math.ceil(BOX_H * skala);
    const c = s.getContext("2d");
    c.translate(s.width / 2, s.height / 2);
    c.scale(skala, skala);
    schiffMalen(c, typ, seite, st);
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
    const sp = sprite(o.typ, o.seite, st, o.breite * dpr);
    const zeit = o.zeit || 0, phase = o.phase || 0;

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.winkel || 0);

    /* Aura (Spezial-Stufe) */
    if (st.spezial > 0) {
      const puls = o.ruhig ? 0.5 : 0.5 + 0.5 * Math.sin(zeit * 0.003 + phase);
      const r = 120 * skala * (1 + 0.05 * st.spezial);
      ctx.globalAlpha = Math.min(0.55, 0.12 + 0.07 * st.spezial) * (0.7 + 0.3 * puls);
      ctx.drawImage(glimmen(F.akzent, F.licht), -r, -r * 0.75, r * 2, r * 1.5);
      ctx.globalAlpha = 1;
    }

    /* Triebwerksflammen hinter dem Rumpf */
    const flamme = glimmen(F.flamme, F.flammeKern);
    motorPunkte(o.typ).forEach(function (m, i) {
      const flacker = o.ruhig ? 1 : 0.8 + 0.35 * Math.abs(Math.sin(zeit * 0.025 + phase * 3 + i * 1.7));
      const lang = m.r * 5 * flacker * skala, hoch = m.r * 2.4 * skala;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(flamme, m.x * skala - lang * 1.35, m.y * skala - hoch / 2, lang * 1.6, hoch);
    });
    ctx.globalAlpha = 1;

    ctx.drawImage(sp, -sp.width / dpr / 2, -sp.height / dpr / 2, sp.width / dpr, sp.height / dpr);

    /* Treffer: Schildblase (Menschen) bzw. Membran-Zucken (Aliens) */
    if (o.treffer > 0) {
      ctx.globalAlpha = o.treffer;
      if (o.seite === "menschen") {
        ctx.strokeStyle = F.akzent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 135 * skala, 92 * skala, 0, 0, 6.283); ctx.stroke();
        ctx.globalAlpha = o.treffer * 0.18; ctx.fillStyle = F.akzent; ctx.fill();
      } else {
        ctx.drawImage(glimmen(F.akzent, "#ffffff"), -110 * skala, -80 * skala, 220 * skala, 160 * skala);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* Standbild fuer den Hangar (Flamme und Aura ruhend). */
  function bild(typ, seite, stufen, breiteCss) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const b = breiteCss, h = Math.round(breiteCss * BOX_H / BOX_B);
    const c = document.createElement("canvas");
    c.width = Math.round(b * dpr);
    c.height = Math.round(h * dpr);
    c.setAttribute("aria-hidden", "true");
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    zeichnen(ctx, { typ: typ, seite: seite, stufen: stufen, x: b / 2, y: h / 2, winkel: 0, breite: b * 260 / BOX_B, dpr: dpr, zeit: 0, ruhig: true });
    return c;
  }

  /* Ausbaustufen aus den Kampfwerten einer Schlacht-Einheit
     (Umkehrung von hangarWerte() bzw. app.schlacht_werte). */
  function stufenAus(e) {
    const leer = { leben: 0, schaden: 0, spezial: 0 };
    if (!e || typeof HANGAR_TYPEN === "undefined" || !HANGAR_TYPEN[e.typ]) return leer;
    const T = HANGAR_TYPEN[e.typ];
    const mod = (typeof HANGAR_SEITEN_MOD !== "undefined" && HANGAR_SEITEN_MOD[e.seite]) || { leben: 1, schaden: 1 };
    const anzahl = e.typ === "drohne" ? 2 : 1;
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
    TYPEN: Object.keys(TYPEN),
  };
})();
