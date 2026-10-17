/* ======================================================
   STERNENSCHLACHT: BEWEGEN, HUELLE, BOSS (Migration 59)
   ---------------------------------------------------
   Hilfen fuer schlacht.js - Rechnung und Optik, kein eigener Zustand
   ausser den Laufpositionen an den Layout-Objekten. Die Datenbank
   bleibt massgeblich; hier stehen dieselben Regeln, damit das Bild zu
   ihr passt:

   POSITION: px 0 = hinten .. 1 = vorn (Richtung Gegner), py quer.
     Quer: Menschen-Slot links (x 0,04..0,46), Aliens-Slot rechts
     (x 0,96..0,54). Hochkant: Menschen unten, Aliens oben.
     Tempo 0,5 je Sekunde, mit Nachbrenner 0,75 (wie schlacht_bewegen).

   HUELLE: 4 x Leben x Rest der Seite - eigene Treffer (wie
     app.schlacht_huelle). Zerstoert 45 s ab zerstoert_at.

   BOSS: Salve alle 30/25/20 s je Phase; Schild ab Phase 2 in jedem
     40-s-Takt die letzten 12 s (wie app.schlacht_leben).

   API (window.fhSchlachtKampf):
     feldPunkt(seite, px, py, b, h, hoch) -> { x, y }
     posAus(seite, x, y, b, h, hoch, klemmen) -> { px, py } oder null
       (klemmen: ausserhalb der eigenen Haelfte an den Rand statt null)
     startPos(p)                          -> { px, py } (ohne Server-Position)
     schritt(p, dt, tempo)                - p.px/py Richtung p.zx/zy
     huelle(e, stand)                     -> 0..1 oder null
     zerstoert(e, serverJetzt)            -> true/false
     huelleZeichnen(ctx, x, y, breite, anteil, ich)
     rangZeichnen(ctx, x, y, rang, farbe)
     bossTakt(phase), bossSchild(phase, sek)
     schildZeichnen(ctx, x, y, breite, jetzt)
====================================================== */

(function () {
  "use strict";

  const TEMPO = 0.5;
  const NOTSPRUNG_MS = 45000;

  function feldPunkt(seite, px, py, b, h, hoch) {
    const vor = 0.04 + Math.max(0, Math.min(1, px)) * 0.42;
    const quer = 0.08 + Math.max(0, Math.min(1, py)) * 0.84;
    if (!hoch) return { x: (seite === "menschen" ? vor : 1 - vor) * b, y: quer * h };
    return { x: quer * b, y: (seite === "menschen" ? 1 - vor : vor) * h };
  }

  /* Umkehrung; null, wenn der Punkt nicht in der eigenen Haelfte liegt. */
  function posAus(seite, x, y, b, h, hoch, klemmen) {
    let vor, quer;
    if (!hoch) {
      vor = seite === "menschen" ? x / b : 1 - x / b;
      quer = y / h;
    } else {
      vor = seite === "menschen" ? 1 - y / h : y / h;
      quer = x / b;
    }
    if (vor > 0.5 && !klemmen) return null;
    return {
      px: Math.max(0, Math.min(1, (vor - 0.04) / 0.42)),
      py: Math.max(0, Math.min(1, (quer - 0.08) / 0.84)),
    };
  }

  /* Wie die alte Aufstellung aus schlacht.js (tiefe/quer). */
  function startPos(p) {
    return {
      px: Math.max(0, Math.min(1, (0.02 + p.tiefe * 0.34) / 0.42)),
      py: Math.max(0, Math.min(1, (0.02 + p.quer * 0.8) / 0.84)),
    };
  }

  function schritt(p, dt, tempo) {
    if (p.zx == null) return false;
    const dx = p.zx - p.px, dy = p.zy - p.py, d = Math.hypot(dx, dy);
    if (d < 0.002) { p.px = p.zx; p.py = p.zy; return false; }
    const weg = (tempo || TEMPO) * dt / 1000;
    if (d > 0.9) { p.px = p.zx; p.py = p.zy; return false; }   // weit daneben: springen
    const f = Math.min(1, weg / d);
    p.px += dx * f; p.py += dy * f;
    p.vx = dx / d; p.vy = dy / d;
    return true;
  }

  function huelle(e, stand) {
    if (!e || !stand || !stand[e.seite]) return null;
    const max = 4 * Number(e.leben || 0);
    if (!(max > 0)) return null;
    const rest = Number(stand[e.seite].rest);
    return Math.max(0, Math.min(1, (max * rest - Number(e.treffer || 0)) / max));
  }

  function zerstoert(e, jetzt) {
    return !!(e && e.zerstoert_at && jetzt < Date.parse(e.zerstoert_at) + NOTSPRUNG_MS);
  }

  function huelleZeichnen(ctx, x, y, breite, anteil, ich) {
    const b = Math.max(26, breite * 0.6), h = ich ? 5 : 4;
    const x0 = x - b / 2, y0 = y + breite * 0.36 + 4;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(x0 - 1, y0 - 1, b + 2, h + 2);
    ctx.fillStyle = anteil > 0.5 ? "#55c878" : anteil > 0.25 ? "#f0c96a" : "#e53935";
    ctx.fillRect(x0, y0, b * anteil, h);
  }

  /* Rangabzeichen: je Rang ein Winkel neben dem Namen. */
  function rangZeichnen(ctx, x, y, rang, farbe) {
    if (!rang) return;
    ctx.save();
    ctx.strokeStyle = farbe; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 0; i < rang; i++) {
      const yy = y - i * 3.2;
      ctx.beginPath(); ctx.moveTo(x - 5, yy); ctx.lineTo(x, yy - 3.4); ctx.lineTo(x + 5, yy); ctx.stroke();
    }
    ctx.restore();
  }

  function bossTakt(phase) { return phase >= 3 ? 20 : phase === 2 ? 25 : 30; }
  function bossSchild(phase, sek) { return phase >= 2 && sek - Math.floor(sek / 40) * 40 >= 28; }

  /* Schildkuppel um das Mutterschiff: Sechseckgitter, pulsierend. */
  function schildZeichnen(ctx, x, y, breite, jetzt, ruhig) {
    const rx = breite * 0.56, ry = breite * 0.4;
    const puls = ruhig ? 0.5 : 0.5 + 0.5 * Math.sin(jetzt * 0.006);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.283);
    const g = ctx.createRadialGradient(0, 0, ry * 0.5, 0, 0, rx);
    g.addColorStop(0, "rgba(255,90,140,0)"); g.addColorStop(1, "rgba(255,90,140," + (0.18 + 0.12 * puls) + ")");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(255,150,180," + (0.55 + 0.3 * puls) + ")"; ctx.lineWidth = 2; ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,150,180,.18)"; ctx.lineWidth = 1;
    const s = Math.max(14, breite / 14);
    for (let gy = -ry; gy < ry; gy += s * 0.87) {
      for (let gx = -rx + ((Math.round(gy / (s * 0.87)) & 1) ? s / 2 : 0); gx < rx; gx += s) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const w = k * 1.047 + 0.52;
          const px = gx + Math.cos(w) * s * 0.5, py = gy + Math.sin(w) * s * 0.5;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
  }

  window.fhSchlachtKampf = {
    TEMPO: TEMPO, NOTSPRUNG_MS: NOTSPRUNG_MS,
    feldPunkt: feldPunkt, posAus: posAus, startPos: startPos, schritt: schritt,
    huelle: huelle, zerstoert: zerstoert, huelleZeichnen: huelleZeichnen, rangZeichnen: rangZeichnen,
    bossTakt: bossTakt, bossSchild: bossSchild, schildZeichnen: schildZeichnen,
  };
})();
