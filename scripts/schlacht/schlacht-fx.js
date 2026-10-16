/* ======================================================
   STERNENSCHLACHT: WAFFEN UND EXPLOSIONEN
   ---------------------------------------------------
   Reine Optik ohne Spielzustand (schlacht.js entscheidet, wer auf
   wen schiesst; die Datenbank rechnet den Schaden). Jeder Typ hat
   seine eigene Waffe:

     jaeger     laser      zwei schnelle Lichtbolzen
     fregatte   doppel     zwei parallele Bolzen
     kreuzer    strahl     schwerer Dauerstrahl
     traeger    reparatur  gruener Heilstrahl auf ein EIGENES Schiff
     drohne     puls       kleine Energiekugeln
     stachel    plasma     Plasmabombe im Bogen, Detonation
     weber      netz       Netzfaden, am Ziel ein Netz
     brutschiff brut       drei Mini-Drohnen schwaermen aus

   Ziele und Schuetzen sind Objekte aus dem Layout von schlacht.js;
   ihre Position liefert die Funktion pos(objekt, jetzt), die beim
   Zeichnen uebergeben wird - so folgen Schuesse den schwebenden
   Schiffen.

   API (window.fhSchlachtFx):
     schuss(von, nach, { typ, seite, stark, beimTreffer })
     explosion(x, y, seite, groesse)
     zeichnen(ctx, pos, jetzt)
     leeren()
     WAFFEN
====================================================== */

(function () {
  "use strict";

  const WAFFEN = {
    jaeger: "laser", fregatte: "doppel", kreuzer: "strahl", traeger: "reparatur",
    drohne: "puls", stachel: "plasma", weber: "netz", brutschiff: "brut",
  };
  const DAUER = { laser: 260, doppel: 320, strahl: 380, reparatur: 650, puls: 420, plasma: 760, netz: 700, brut: 950 };
  const FARBE = {
    menschen: { schuss: "#8fe3ff", kern: "#ffffff", glut: "rgba(111,211,255,.35)" },
    aliens: { schuss: "#a6ff6e", kern: "#f0ffe0", glut: "rgba(157,255,106,.35)" },
  };
  const HEIL = "#55e08a";
  const MAX_SCHUESSE = 160;

  let schuesse = [];
  let funken = [];      // kurze Treffer-Effekte an festen Punkten
  let explosionen = [];

  function schuss(von, nach, o) {
    if (!von || !nach) return;
    o = o || {};
    const art = WAFFEN[o.typ] || "laser";
    if (schuesse.length >= MAX_SCHUESSE) schuesse.shift();
    schuesse.push({
      art: art, von: von, nach: nach, seite: o.seite || "menschen", stark: !!o.stark,
      t0: performance.now(), dauer: DAUER[art] * (o.stark ? 1.15 : 1),
      beimTreffer: o.beimTreffer || null, getroffen: false,
      bogen: (Math.random() - 0.5) * 2, versatz: Math.random() * 6.283,
    });
  }

  function explosion(x, y, seite, groesse) {
    const teile = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const w = (i / n) * 6.283 + Math.random() * 0.4;
      const v = 40 + Math.random() * 90;
      teile.push({ vx: Math.cos(w) * v, vy: Math.sin(w) * v, r: 1 + Math.random() * 2.2 });
    }
    explosionen.push({ x: x, y: y, seite: seite, g: groesse || 30, t0: performance.now(), teile: teile });
    if (explosionen.length > 40) explosionen.shift();
  }

  function leeren() { schuesse = []; funken = []; explosionen = []; }

  /* ------------------------------------------------------
     ZEICHNEN
  ------------------------------------------------------ */
  function glueh(ctx, farbe, breite, f) {
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    f();
  }

  function bolzen(ctx, A, B, f, laenge, farbe, kern, quer) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const ox = -uy * (quer || 0), oy = ux * (quer || 0);
    const kx = A.x + dx * f + ox, ky = A.y + dy * f + oy;
    ctx.lineCap = "round";
    glueh(ctx, farbe, 5, function () {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(kx - ux * laenge, ky - uy * laenge); ctx.lineTo(kx, ky); ctx.stroke();
    });
    glueh(ctx, kern, 1.8, function () {
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(kx - ux * laenge, ky - uy * laenge); ctx.lineTo(kx, ky); ctx.stroke();
    });
  }

  function kugel(ctx, x, y, r, farbe, kern) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = farbe;
    ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = kern;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }

  function welle(ctx, A, B, f, farbe, amp, breite, versatz, jetzt) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const schritte = 24;
    ctx.strokeStyle = farbe; ctx.lineWidth = breite;
    ctx.beginPath();
    for (let i = 0; i <= schritte; i++) {
      const t = (i / schritte) * f;
      const s = Math.sin(t * 18 + versatz + jetzt * 0.02) * amp * Math.sin(Math.PI * Math.min(1, t / Math.max(f, 0.01)));
      const x = A.x + dx * t + nx * s, y = A.y + dy * t + ny * s;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function netzAm(ctx, x, y, r, farbe, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = farbe; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const w = i * 0.785;
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(w) * r, y + Math.sin(w) * r);
    }
    ctx.stroke();
    [0.45, 0.85].forEach(function (k) {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const w = i * 0.785;
        const px = x + Math.cos(w) * r * k, py = y + Math.sin(w) * r * k;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function miniDrohne(ctx, x, y, w, farbe) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(w);
    ctx.fillStyle = "#3b2468";
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(0, -4); ctx.lineTo(-5, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = farbe;
    ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function treffer(s, B) {
    s.getroffen = true;
    funken.push({ x: B.x, y: B.y, t0: performance.now(), art: s.art === "reparatur" ? "heil" : (s.nach.seite === "menschen" ? "schild" : "splash"), stark: s.stark });
    if (s.art === "plasma") explosion(B.x, B.y, s.seite, s.stark ? 26 : 18);
    if (funken.length > 80) funken.shift();
    if (typeof s.beimTreffer === "function") {
      try { s.beimTreffer(s.nach, s.art); } catch (e) { /* nur Optik */ }
    }
  }

  function schussZeichnen(ctx, s, A, B, f, jetzt) {
    const F = FARBE[s.seite] || FARBE.menschen;
    const dick = s.stark ? 1.6 : 1;
    switch (s.art) {
      case "laser":
        bolzen(ctx, A, B, f, 18 * dick, F.schuss, F.kern, 0);
        if (f > 0.2) bolzen(ctx, A, B, f - 0.2, 14 * dick, F.schuss, F.kern, 0);
        break;
      case "doppel":
        bolzen(ctx, A, B, f, 16 * dick, F.schuss, F.kern, 4);
        bolzen(ctx, A, B, f, 16 * dick, F.schuss, F.kern, -4);
        break;
      case "strahl": {
        const an = Math.min(1, f / 0.15), aus = 1 - Math.max(0, (f - 0.4) / 0.6);
        const ex = A.x + (B.x - A.x) * an, ey = A.y + (B.y - A.y) * an;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.3 * aus; ctx.strokeStyle = F.schuss; ctx.lineWidth = 9 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = aus; ctx.strokeStyle = F.kern; ctx.lineWidth = 2.4 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case "reparatur":
        ctx.globalAlpha = 1 - Math.max(0, (f - 0.6) / 0.4);
        welle(ctx, A, B, Math.min(1, f * 1.6), HEIL, 4, 2 * dick, s.versatz, jetzt);
        ctx.globalAlpha = 1;
        break;
      case "puls":
        kugel(ctx, A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f, 2.6 * dick, F.schuss, F.kern);
        break;
      case "plasma": {
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
        const hoch = Math.sin(Math.PI * f) * d * 0.18 * (s.bogen < 0 ? -1 : 1);
        const x = A.x + dx * f - dy / d * hoch, y = A.y + dy * f + dx / d * hoch;
        kugel(ctx, x, y, 4.5 * dick, F.schuss, F.kern);
        break;
      }
      case "netz":
        ctx.globalAlpha = 0.85;
        welle(ctx, A, B, Math.min(1, f * 1.4), F.schuss, 5, 1.2 * dick, s.versatz, jetzt);
        ctx.globalAlpha = 1;
        if (f > 0.7) netzAm(ctx, B.x, B.y, 16 * dick, F.schuss, Math.min(1, (f - 0.7) / 0.15) * (1 - Math.max(0, (f - 0.9) / 0.1)));
        break;
      case "brut":
        for (let k = 0; k < 3; k++) {
          const g = Math.max(0, Math.min(1, (f - k * 0.08) / 0.84));
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
          const kurve = Math.sin(Math.PI * g) * 26 * (k - 1 + s.bogen * 0.5);
          const x = A.x + dx * g - dy / d * kurve, y = A.y + dy * g + dx / d * kurve;
          miniDrohne(ctx, x, y, Math.atan2(dy, dx), F.schuss);
        }
        break;
    }
  }

  function funkenZeichnen(ctx, jetzt) {
    funken = funken.filter(function (k) { return jetzt - k.t0 < 420; });
    funken.forEach(function (k) {
      const f = (jetzt - k.t0) / 420;
      const r = (k.stark ? 22 : 14) * (0.4 + f);
      ctx.globalAlpha = 1 - f;
      if (k.art === "schild") {
        ctx.strokeStyle = "#8fe3ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(k.x, k.y, r, 0, 6.283); ctx.stroke();
      } else if (k.art === "heil") {
        ctx.fillStyle = HEIL;
        for (let i = 0; i < 3; i++) {
          const px = k.x + Math.sin(i * 2.1 + k.t0) * 10, py = k.y - f * 18 - i * 4;
          ctx.fillRect(px - 3, py - 1, 6, 2); ctx.fillRect(px - 1, py - 3, 2, 6);
        }
      } else {
        ctx.fillStyle = "#c8ff9a";
        for (let i = 0; i < 6; i++) {
          const w = i * 1.047 + k.t0;
          ctx.beginPath(); ctx.arc(k.x + Math.cos(w) * r, k.y + Math.sin(w) * r, 1.8, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  function explosionenZeichnen(ctx, jetzt) {
    explosionen = explosionen.filter(function (e) { return jetzt - e.t0 < 1000; });
    explosionen.forEach(function (e) {
      const f = (jetzt - e.t0) / 1000, s = f;
      const farbe = e.seite === "menschen" ? "255,190,120" : "190,255,140";
      /* Blitz */
      if (f < 0.25) {
        ctx.globalAlpha = 1 - f / 0.25;
        ctx.fillStyle = "rgba(255,250,235,1)";
        ctx.beginPath(); ctx.arc(e.x, e.y, e.g * (0.4 + f * 2), 0, 6.283); ctx.fill();
      }
      /* Druckwelle */
      ctx.globalAlpha = (1 - f) * 0.8;
      ctx.strokeStyle = "rgba(" + farbe + ",1)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.g * (0.5 + f * 2.2), 0, 6.283); ctx.stroke();
      /* Truemmer */
      ctx.fillStyle = "rgba(" + farbe + ",1)";
      e.teile.forEach(function (t) {
        ctx.globalAlpha = 1 - f;
        ctx.beginPath(); ctx.arc(e.x + t.vx * s, e.y + t.vy * s, t.r, 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
    });
  }

  function zeichnen(ctx, pos, jetzt) {
    ctx.save();
    schuesse = schuesse.filter(function (s) { return jetzt - s.t0 < s.dauer + 80; });
    schuesse.forEach(function (s) {
      const f = Math.min(1, (jetzt - s.t0) / s.dauer);
      const A = pos(s.von, jetzt), B = pos(s.nach, jetzt);
      if (!A || !B) return;
      schussZeichnen(ctx, s, A, B, f, jetzt);
      if (f >= 1 && !s.getroffen) treffer(s, B);
    });
    funkenZeichnen(ctx, jetzt);
    explosionenZeichnen(ctx, jetzt);
    ctx.restore();
  }

  window.fhSchlachtFx = { schuss: schuss, explosion: explosion, zeichnen: zeichnen, leeren: leeren, WAFFEN: WAFFEN };
})();
