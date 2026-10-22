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

   Parteien aus Migration 57:
     kaper laser, brigant doppel, galeone breitseite (drei Kugeln),
     schmuggler reparatur; sonde puls, waechter strahl, zerstoerer
     rail (Sofortstrahl), fabrik reparatur; splitter splitter (drei
     Kristallspitzen), prisma strahl, resonator schall (Schallboegen),
     monolith reparatur; irrlicht puls, phantom laser, banshee schall,
     totenschiff breitseite.
   Farben, Treffer und Explosionen richten sich nach der PARTEI des
   Schiffs (layout-Objekt: partei, sonst seite).

   SONDERWAFFEN (Migration 58): Der Zielschuss (stark) eines Schiffs
   mit Sonderwaffe sieht anders aus - Plasmakanone: grosse Plasmakugel,
   Raketenwerfer: drei Raketen mit Rauchspur, Tesla-Spule: Blitz,
   Lichtlanze: gleissender Strahl. o.art erzwingt eine Waffe (Boss-
   Salven, Tesla-Uebersprung).

   Ziele und Schuetzen sind Objekte aus dem Layout von schlacht.js;
   ihre Position liefert die Funktion pos(objekt, jetzt), die beim
   Zeichnen uebergeben wird - so folgen Schuesse den schwebenden
   Schiffen.

   GROSSSCHIFFE IM HINTERGRUND: Alle 18 bis 40 Sekunden zieht ein
   riesiges Schiff langsam und gedaempft hinter dem Gefecht vorbei -
   Schlachtkreuzer und Traeger der Erdflotte von links, Mutterschiffe
   des Schwarms von rechts (Formen aus scripts/hangar/schiffe.js, voll
   ausgebaut). Hoechstens zwei zugleich, mit Positionslichtern. Bei
   "Bewegung reduzieren" keine. Mit anderen Parteien (57) kommen ihre
   Grossschiffe - parteien(links, rechts) setzt sie.

   API (window.fhSchlachtFx):
     schuss(von, nach, { typ, seite, stark, beimTreffer, waffe?, art? })
     explosion(x, y, seite, groesse)
     zeichnen(ctx, pos, jetzt)
     hintergrund(ctx, breite, hoehe, jetzt, dpr, ruhig)
     leeren()
     parteien(links, rechts)
     WAFFEN
====================================================== */

(function () {
  "use strict";

  const WAFFEN = {
    jaeger: "laser", fregatte: "doppel", kreuzer: "strahl", traeger: "reparatur",
    drohne: "puls", stachel: "plasma", weber: "netz", brutschiff: "brut",
    kaper: "laser", brigant: "doppel", galeone: "breitseite", schmuggler: "reparatur",
    sonde: "puls", waechter: "strahl", zerstoerer: "rail", fabrik: "reparatur",
    splitter: "splitter", prisma: "strahl", resonator: "schall", monolith: "reparatur",
    irrlicht: "puls", phantom: "laser", banshee: "schall", totenschiff: "breitseite",
    /* Design V2 (63): der fuenfte Typ je Partei */
    schlachtschiff: "rail", koenigin: "brut", rammer: "breitseite", titan: "strahl", kathedrale: "splitter", leviathan: "schall",
    mutterschiff: "strahl",
  };
  /* Zielschuss mit Sonderwaffe (58) */
  const SONDER = { plasma: "plasmaball", raketen: "raketen", tesla: "blitz", lanze: "lanze" };
  const SONDER_FARBE = { plasmaball: "#5ff3ff", raketen: "#ff9d3d", blitz: "#9fc8ff", lanze: "#fff07a" };
  const DAUER = {
    laser: 260, doppel: 320, strahl: 380, reparatur: 650, puls: 420, plasma: 760, netz: 700, brut: 950,
    breitseite: 620, rail: 300, splitter: 360, schall: 640,
    plasmaball: 420, raketen: 720, blitz: 260, lanze: 340,
  };
  const FARBE = {
    menschen: { schuss: "#8fe3ff", kern: "#ffffff", glut: "rgba(111,211,255,.35)" },
    aliens: { schuss: "#a6ff6e", kern: "#f0ffe0", glut: "rgba(157,255,106,.35)" },
    piraten: { schuss: "#ffb36a", kern: "#fff3dc", glut: "rgba(255,138,61,.35)" },
    maschinen: { schuss: "#ff6a5a", kern: "#ffe9e4", glut: "rgba(255,59,59,.35)" },
    kristall: { schuss: "#ff9ae4", kern: "#ffffff", glut: "rgba(255,122,217,.35)" },
    geister: { schuss: "#7dffd2", kern: "#f0fff8", glut: "rgba(93,255,200,.35)" },
    boss: { schuss: "#ff5a7a", kern: "#ffe0e6", glut: "rgba(255,59,107,.4)" },
  };
  /* Explosionsglut je Partei (r,g,b) */
  const GLUT = {
    menschen: "255,190,120", aliens: "190,255,140", piraten: "255,170,90",
    maschinen: "255,110,90", kristall: "255,170,235", geister: "150,255,215", boss: "255,90,120",
  };
  function partei(obj) { return (obj && (obj.partei || obj.seite)) || "menschen"; }
  function stilVon(p) { return window.fhSchiffe && window.fhSchiffe.stil ? window.fhSchiffe.stil(p) : (p === "aliens" ? "organisch" : "metall"); }
  const HEIL = "#55e08a";
  const MAX_SCHUESSE = 160;

  let schuesse = [];
  let funken = [];      // kurze Treffer-Effekte an festen Punkten
  let explosionen = [];

  function schuss(von, nach, o) {
    if (!von || !nach) return;
    o = o || {};
    const art = o.art || (o.stark && SONDER[o.waffe]) || WAFFEN[o.typ] || "laser";
    if (schuesse.length >= MAX_SCHUESSE) schuesse.shift();
    schuesse.push({
      art: art, von: von, nach: nach, seite: o.seite || partei(von), stark: !!o.stark,
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
    const zp = partei(s.nach), sl = stilVon(zp);
    funken.push({
      x: B.x, y: B.y, t0: performance.now(), stark: s.stark, farbe: (FARBE[zp] || FARBE.menschen).schuss,
      art: s.art === "reparatur" ? "heil" : sl === "metall" ? "schild" : sl === "kristall" ? "facette" : "splash",
    });
    if (s.art === "plasma" || s.art === "plasmaball" || s.art === "raketen" || (s.art === "breitseite" && s.stark)) explosion(B.x, B.y, s.seite, s.stark ? 26 : 18);
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
      case "breitseite":
        /* drei Kanonenkugeln kurz nacheinander, leicht gestreut */
        for (let k = 0; k < 3; k++) {
          const g = Math.max(0, Math.min(1, (f - k * 0.1) / 0.8));
          if (g <= 0 || g >= 1) continue;
          const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
          const quer = (k - 1) * 7 + Math.sin(Math.PI * g) * d * 0.05 * (s.bogen < 0 ? -1 : 1);
          kugel(ctx, A.x + dx * g - dy / d * quer, A.y + dy * g + dx / d * quer, 2.8 * dick, F.glut, F.schuss);
        }
        break;
      case "rail": {
        /* Sofortstrahl: blitzt ueber die ganze Strecke und verglueht */
        const aus = 1 - f;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.35 * aus; ctx.strokeStyle = F.schuss; ctx.lineWidth = 7 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        ctx.globalAlpha = aus; ctx.strokeStyle = F.kern; ctx.lineWidth = 1.6 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case "splitter": {
        /* drei Kristallspitzen, gefaechert, treffen zusammen */
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, w = Math.atan2(dy, dx);
        for (let k = -1; k <= 1; k++) {
          const quer = k * 14 * Math.sin(Math.PI * f);
          const x = A.x + dx * f - dy / d * quer, y = A.y + dy * f + dx / d * quer;
          ctx.save(); ctx.translate(x, y); ctx.rotate(w);
          ctx.fillStyle = F.schuss; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(7 * dick, 0); ctx.lineTo(0, -2.4 * dick); ctx.lineTo(-6 * dick, 0); ctx.lineTo(0, 2.4 * dick); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "plasmaball": {
        const fa = SONDER_FARBE.plasmaball;
        const x = A.x + (B.x - A.x) * f, y = A.y + (B.y - A.y) * f;
        for (let k = 1; k <= 4; k++) {
          const g = Math.max(0, f - k * 0.04);
          kugel(ctx, A.x + (B.x - A.x) * g, A.y + (B.y - A.y) * g, 4 - k * 0.7, fa, fa);
        }
        kugel(ctx, x, y, 6.5, fa, "#ffffff");
        break;
      }
      case "raketen": {
        const fa = SONDER_FARBE.raketen;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, w = Math.atan2(dy, dx);
        for (let k = 0; k < 3; k++) {
          const g = Math.max(0, Math.min(1, (f - k * 0.07) / 0.86));
          if (g <= 0) continue;
          const kurve = Math.sin(Math.PI * g) * 34 * (k - 1);
          const x = A.x + dx * g - dy / d * kurve, y = A.y + dy * g + dx / d * kurve;
          /* Rauchspur */
          ctx.fillStyle = "rgba(200,200,210,.35)";
          for (let r = 1; r <= 5; r++) {
            const gg = Math.max(0, g - r * 0.035), kk = Math.sin(Math.PI * gg) * 34 * (k - 1);
            ctx.beginPath(); ctx.arc(A.x + dx * gg - dy / d * kk, A.y + dy * gg + dx / d * kk, 1.4 + r * 0.5, 0, 6.283); ctx.fill();
          }
          ctx.save(); ctx.translate(x, y); ctx.rotate(w + Math.cos(Math.PI * g) * 0.4 * (k - 1));
          ctx.fillStyle = "#d8dde4"; ctx.fillRect(-6, -1.6, 10, 3.2);
          ctx.fillStyle = fa; ctx.beginPath(); ctx.arc(-7, 0, 2.2, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "blitz": {
        /* Zackiger Blitz, flackert, neu gewuerfelt je Bild */
        const fa = SONDER_FARBE.blitz;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
        ctx.globalAlpha = (1 - f) * (0.7 + 0.3 * Math.random());
        [[fa, 5, 0.35], ["#ffffff", 1.8, 1]].forEach(function (lage) {
          ctx.strokeStyle = lage[0]; ctx.lineWidth = lage[1] * dick; ctx.globalAlpha = (1 - f) * lage[2];
          ctx.beginPath(); ctx.moveTo(A.x, A.y);
          const n = 9;
          for (let i = 1; i < n; i++) {
            const g = i / n, z = (Math.sin(i * 12.9898 + s.versatz * 7 + Math.floor(jetzt / 50)) * 0.5) * 22;
            ctx.lineTo(A.x + dx * g - dy / d * z, A.y + dy * g + dx / d * z);
          }
          ctx.lineTo(B.x, B.y); ctx.stroke();
        });
        ctx.globalAlpha = 1;
        break;
      }
      case "lanze": {
        const fa = SONDER_FARBE.lanze;
        const an = Math.min(1, f / 0.12), aus = 1 - Math.max(0, (f - 0.35) / 0.65);
        const ex = A.x + (B.x - A.x) * an, ey = A.y + (B.y - A.y) * an;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.35 * aus; ctx.strokeStyle = fa; ctx.lineWidth = 14 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 0.8 * aus; ctx.lineWidth = 5 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = aus; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.8 * dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case "schall": {
        /* Schallboegen wandern zum Ziel und werden groesser */
        const dx = B.x - A.x, dy = B.y - A.y, w = Math.atan2(dy, dx);
        ctx.strokeStyle = F.schuss; ctx.lineWidth = 2 * dick;
        for (let k = 0; k < 3; k++) {
          const g = f - k * 0.12;
          if (g <= 0 || g >= 1) continue;
          ctx.globalAlpha = 0.85 * (1 - g * 0.6);
          ctx.beginPath(); ctx.arc(A.x + dx * g, A.y + dy * g, 6 + g * 14, w - 0.9, w + 0.9); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  function funkenZeichnen(ctx, jetzt) {
    funken = funken.filter(function (k) { return jetzt - k.t0 < 420; });
    funken.forEach(function (k) {
      const f = (jetzt - k.t0) / 420;
      const r = (k.stark ? 22 : 14) * (0.4 + f);
      ctx.globalAlpha = 1 - f;
      if (k.art === "schild") {
        ctx.strokeStyle = k.farbe || "#8fe3ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(k.x, k.y, r, 0, 6.283); ctx.stroke();
      } else if (k.art === "facette") {
        ctx.strokeStyle = k.farbe; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const w = i * 1.047;
          if (i === 0) ctx.moveTo(k.x + Math.cos(w) * r, k.y + Math.sin(w) * r); else ctx.lineTo(k.x + Math.cos(w) * r, k.y + Math.sin(w) * r);
        }
        ctx.stroke();
      } else if (k.art === "heil") {
        ctx.fillStyle = HEIL;
        for (let i = 0; i < 3; i++) {
          const px = k.x + Math.sin(i * 2.1 + k.t0) * 10, py = k.y - f * 18 - i * 4;
          ctx.fillRect(px - 3, py - 1, 6, 2); ctx.fillRect(px - 1, py - 3, 2, 6);
        }
      } else {
        ctx.fillStyle = k.farbe || "#c8ff9a";
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
      const farbe = GLUT[e.seite] || GLUT.menschen;
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

  /* ------------------------------------------------------
     GROSSSCHIFFE IM HINTERGRUND
  ------------------------------------------------------ */
  const GROSS_TYPEN = {
    menschen: ["schlachtschiff", "traeger", "kreuzer", "fregatte"], aliens: ["koenigin", "weber", "brutschiff", "stachel"],
    piraten: ["galeone", "brigant", "rammer", "schmuggler"], maschinen: ["titan", "fabrik", "waechter", "zerstoerer"],
    kristall: ["kathedrale", "prisma", "monolith", "resonator"], geister: ["leviathan", "phantom", "totenschiff", "banshee"],
  };
  /* Welche Partei links bzw. rechts kaempft (schlacht.js setzt das). */
  let grossLinks = "menschen", grossRechts = "aliens";
  function parteien(links, rechts) {
    grossLinks = GROSS_TYPEN[links] ? links : "menschen";
    grossRechts = GROSS_TYPEN[rechts] ? rechts : "aliens";
  }
  const GROSS_STUFEN = { leben: 5, schaden: 5, spezial: 0 };
  let grosse = [];
  let naechstesGross = 0;

  function grossesSchiff(b, h, jetzt) {
    const seite = Math.random() < 0.5 ? "menschen" : "aliens";   // Slot: links bzw. rechts
    const partei2 = seite === "menschen" ? grossLinks : grossRechts;
    const liste = GROSS_TYPEN[partei2];
    /* Breite auf 64er-Stufen: so bleiben die Sprites im Zwischenspeicher wenige. */
    const breite = Math.round(Math.max(240, Math.min(980, Math.min(b, h * 1.6) * (0.5 + Math.random() * 0.35))) / 64) * 64;
    return {
      seite: seite,
      partei: partei2,
      typ: liste[Math.floor(Math.random() * liste.length)],
      breite: breite,
      y: h * (0.18 + Math.random() * 0.64),
      t0: jetzt,
      dauer: 30000 + Math.random() * 18000,
      alpha: 0.22 + Math.random() * 0.14,
      phase: Math.random() * 6.283,
    };
  }

  function hintergrund(ctx, b, h, jetzt, dpr, ruhig) {
    if (ruhig || !window.fhSchiffe) { grosse = []; return; }
    if (!naechstesGross) naechstesGross = jetzt + 3000 + Math.random() * 5000;
    if (jetzt >= naechstesGross && grosse.length < 2) {
      grosse.push(grossesSchiff(b, h, jetzt));
      naechstesGross = jetzt + 18000 + Math.random() * 22000;
    }
    grosse = grosse.filter(function (g) { return jetzt - g.t0 < g.dauer; });
    grosse.forEach(function (g) {
      const f = (jetzt - g.t0) / g.dauer;
      const weg = b + g.breite * 1.2;
      const x = g.seite === "menschen" ? -g.breite * 0.6 + f * weg : b + g.breite * 0.6 - f * weg;
      const y = g.y + Math.sin(jetzt * 0.00025 + g.phase) * 10;
      const ein = Math.min(1, f / 0.08, (1 - f) / 0.08);
      ctx.save();
      window.fhSchiffe.zeichnen(ctx, {
        typ: g.typ, seite: g.partei, stufen: GROSS_STUFEN, x: x, y: y,
        winkel: g.seite === "menschen" ? 0 : Math.PI, breite: g.breite, dpr: dpr,
        zeit: jetzt, phase: g.phase, treffer: 0, ruhig: false, alpha: g.alpha * ein,
      });
      /* Positionslichter: rot/gruen blinkend an Bug und Heck. */
      const blink = Math.sin(jetzt * 0.004 + g.phase) > 0.6 ? 1 : 0.15;
      const r = Math.max(2, g.breite / 160);
      const vorn = g.seite === "menschen" ? 1 : -1;
      ctx.globalAlpha = Math.min(1, g.alpha * 2.4) * ein * blink;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.arc(x + vorn * g.breite * 0.44, y - g.breite * 0.05, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#7dff9a";
      ctx.beginPath(); ctx.arc(x - vorn * g.breite * 0.42, y + g.breite * 0.06, r, 0, 6.283); ctx.fill();
      ctx.restore();
    });
  }

  window.fhSchlachtFx = { schuss: schuss, explosion: explosion, zeichnen: zeichnen, hintergrund: hintergrund, leeren: leeren, parteien: parteien, WAFFEN: WAFFEN };
})();
