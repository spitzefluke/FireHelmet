/* ======================================================
   WETTER-STORYS: GEISTERSCHIFF, STURM, STURMFLUT, NORDLICHT
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Live-Storys Labor": unter
   jeder der vier Storys liegt jetzt eine echte Wetter-Simulation auf
   einer Leinwand (Canvas) statt fester CSS-Ebenen.

   - Geisterschiff: Nebel mit Tiefe, Irrlichter mit Schweif, der Name
     formt sich aus Nebelpartikeln, Glockenschlaege, Morgenrot.
   - Sturm: Regen in drei Tiefen mit Boeen und Spritzern,
     Wetterleuchten in den Wolken, echter Blitzeinschlag.
   - Sturmflut: das Meer weicht zurueck und kommt als Welle mit
     Gischt; unter Wasser Lichtstrahlen und Blasen, am Ende ein
     Strudel. Die Treibgut-Karte schwimmt auf der Welle.
   - Nordlicht: Sternenhimmel, Polarlicht-Vorhaenge, Sternschnuppen
     mit Funken, ein Wunschstern, der zerspringt.

   live-storys.js bleibt der Taktgeber (Szenen, Belohnungen,
   Banderolen, Farbfilter und Bewegung der Seite) und ruft hier:
     fhStoryWetter.start(story, szene, msInSzene)
     fhStoryWetter.szene(n)     - beim Betreten jeder Szene
     fhStoryWetter.ende()       - Story vorbei: ausblenden
     fhStoryWetter.weg()        - abgebrochen: sofort weg

   Alle Texte kommen aus i18n.js (story.*) und gehen per textContent
   ins DOM. Bei reduzierter Bewegung laeuft alles langsamer, mit
   halber Dichte und ohne Wackeln.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function T(key, de) { return t("story." + key, de); }

  const STORYS = ["nebel", "sturm", "flut", "nordlicht"];

  /* Symbole: lucide (ISC), stroke-width 1.6 */
  const IC = {
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    skull: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
  };
  function svg(p, s) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:' + s + ';height:' + s + ';display:block;">' + p + '</svg>'; }

  /* ------------------------------------------------------
     ZUSTAND
  ------------------------------------------------------ */
  let run = null;   // { name, n, t0, tn, tmp[], ctx, c, w, h, raf, halter, fx, timer[] }

  function calm() { return RUHIG.matches; }
  /* Dichte: Handys bekommen weniger Teilchen. */
  function dens() { const klein = window.innerWidth < 700 ? 0.6 : 1; return klein * (calm() ? 0.5 : 1); }
  function ease(x) { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); }
  function inout(x) { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function el(tag, css, parent, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
  function later(fn, ms) { if (!run) return; const r = run; r.timer.push(setTimeout(function () { if (run === r) fn(); }, ms)); }

  /* Eine Ebene ueber der Seite, faellt beim naechsten Szenenwechsel weg. */
  function layer(css, z) { return el("div", "position:fixed;inset:0;pointer-events:none;z-index:" + (z || 10000) + ";" + (css || ""), run.halter); }
  function tmp(e) { run.tmp.push(e); return e; }

  /* Seite kurz wackeln lassen (#fh-main, additiv). */
  function shake(px, ms) {
    if (calm()) return;
    const m = document.getElementById("fh-main");
    if (!m || !m.animate) return;
    m.animate([{ transform: "none" }, { transform: "translate(" + -px + "px," + px * 0.5 + "px)" }, { transform: "translate(" + px * 0.8 + "px," + -px * 0.6 + "px)" }, { transform: "translate(" + -px * 0.5 + "px," + -px * 0.3 + "px)" }, { transform: "translate(" + px * 0.3 + "px," + px * 0.2 + "px)" }, { transform: "none" }], { duration: ms || 450, easing: "cubic-bezier(.22,.9,.32,1)", composite: "add" });
  }

  /* ------------------------------------------------------
     BAUSTEINE: Textzeile (Buchstabe fuer Buchstabe), Karte
  ------------------------------------------------------ */
  function zeile(text, top, size, color, glow, opts) {
    opts = opts || {};
    const L = tmp(layer("", 10000));
    const p = el("p", "position:absolute;left:24px;right:24px;top:" + top + ";margin:0;text-align:center;font-family:" + (opts.font || "var(--fh-font-display)") + ";font-size:" + size + ";font-weight:500;letter-spacing:" + (opts.ls || ".08em") + ";line-height:1.05;color:" + color + ";" + (glow ? "text-shadow:" + glow + ";" : ""), L);
    /* Buchstaben je Wort zusammenhalten - sonst bricht die Zeile auf
       schmalen Handys mitten im Wort ("EINSCHL / AG"). */
    const letters = [];
    String(text).split(" ").forEach(function (wort, wi) {
      if (wi) p.appendChild(document.createTextNode(" "));
      const w = el("span", "display:inline-block;white-space:nowrap;", p);
      Array.from(wort).forEach(function (ch) { letters.push(el("span", "display:inline-block;", w, ch)); });
    });
    const d0 = opts.delay || 0, st = opts.stagger == null ? 35 : opts.stagger;
    const kf = opts.kf || [{ opacity: 0, transform: "translateY(14px)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }];
    letters.forEach(function (l, i) {
      if (l.animate) l.animate(kf, { duration: calm() ? 400 : (opts.dur || 700), delay: d0 + i * (calm() ? 0 : st), easing: "cubic-bezier(.22,.9,.32,1)", fill: "both" });
    });
    return { L: L, p: p, letters: letters };
  }

  function karte(o) {
    const L = tmp(layer("display:flex;justify-content:center;padding:0 16px;top:" + (o.top || "14%") + ";bottom:auto;", 10000));
    const box = el("div", "position:relative;display:flex;align-items:center;gap:14px;padding:14px 18px;border:1px solid " + o.rand + ";border-radius:var(--fh-radius, 16px);background:rgba(8,14,24,.92);box-shadow:0 0 40px " + o.glow + ",0 20px 50px rgba(0,0,0,.5);overflow:hidden;height:max-content;max-width:520px;", L);
    const sheen = el("span", "position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%," + o.glow + " 50%,transparent 65%);background-size:260% 100%;", box);
    const ic = el("span", "position:relative;display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:50%;border:1.5px " + (o.iconStyle || "solid") + " " + o.iconColor + ";color:" + o.iconColor + ";", box);
    ic.innerHTML = svg(o.icon, "16px");
    const ring = el("span", "position:absolute;inset:-1.5px;border-radius:50%;border:1.5px solid " + o.iconColor + ";", ic);
    const tx = el("div", "position:relative;", box);
    el("p", "margin:0 0 2px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:" + o.labelColor + ";", tx, o.label);
    el("p", "margin:0;font-size:15px;color:var(--fh-fg);", tx, o.text);
    if (box.animate) {
      box.animate([{ opacity: 0, transform: "scale(.88) translateY(10px)", filter: "blur(8px)" }, { opacity: 1, transform: "scale(1.02)", filter: "blur(0)", offset: 0.7 }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 520, easing: "cubic-bezier(.22,.9,.32,1)", fill: "both" });
      sheen.animate([{ backgroundPosition: "130% 0" }, { backgroundPosition: "-60% 0" }], { duration: 1100, delay: 300, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" });
      if (!calm()) ring.animate([{ transform: "scale(1)", opacity: 0.8 }, { transform: "scale(1.9)", opacity: 0 }], { duration: 1500, iterations: Infinity, easing: "cubic-bezier(.2,.7,.3,1)" });
    }
    return { L: L, box: box, ic: ic };
  }

  /* Blitz als Mittelpunkt-Verschiebung mit Seitenaesten. */
  function bolt(x0, y0, x1, y1, spread, depth, out, width) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) {
      const n = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        n.push([(a[0] + b[0]) / 2 + (Math.random() - 0.5) * spread, (a[1] + b[1]) / 2 + (Math.random() - 0.5) * spread * 0.3], [b[0], b[1]]);
      }
      pts = n; spread *= 0.55;
    }
    out.push({ pts: pts, width: width });
    if (width > 0.5) pts.forEach(function (p, i) {
      if (i > 2 && i < pts.length - 4 && Math.random() < 0.045) {
        const len = 40 + Math.random() * 120, a = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        bolt(p[0], p[1], p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len, len * 0.5, 4, out, width * 0.45);
      }
    });
    return out;
  }
  function drawBolt(ctx, paths, alpha, reveal) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    [[26, 9, "66,184,255", 0.35], [10, 4, "170,220,255", 0.7], [0, 1.6, "255,255,255", 1]].forEach(function (s) {
      ctx.shadowBlur = s[0]; ctx.shadowColor = "#42b8ff";
      paths.forEach(function (p) {
        const n = Math.max(2, Math.floor(p.pts.length * reveal));
        ctx.strokeStyle = "rgba(" + s[2] + "," + s[3] * alpha + ")"; ctx.lineWidth = s[1] * p.width / 3 + 0.4; ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const q = p.pts[i]; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  /* Punkte, aus denen sich ein Wort zusammensetzt. */
  function textTargets(text, w, h, cy, maxPx, ls) {
    const oc = document.createElement("canvas"); oc.width = Math.ceil(w); oc.height = Math.ceil(h);
    const o = oc.getContext("2d");
    let px = maxPx;
    const setF = function () { o.font = "500 " + px + "px Oswald, sans-serif"; if ("letterSpacing" in o) o.letterSpacing = (px * ls) + "px"; };
    setF(); while (o.measureText(text).width > w * 0.88 && px > 10) { px -= 2; setF(); }
    o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "middle"; o.fillText(text, w / 2, cy);
    const d = o.getImageData(0, 0, oc.width, oc.height).data, pts = [], step = Math.max(2, Math.round(px / 26));
    for (let y = 0; y < oc.height; y += step) for (let x = 0; x < oc.width; x += step) if (d[(y * oc.width + x) * 4 + 3] > 120) pts.push([x, y]);
    return { pts: pts, px: px };
  }

  /* ======================================================
     GEISTERSCHIFF
  ====================================================== */
  const NEBEL = {
    init: function (w, h) {
      const R = Math.random, F = run.fx;
      F.blobs = Array.from({ length: Math.round(18 * Math.max(0.6, dens())) }, function (_, i) { return { x: R() * w * 1.4 - w * 0.2, y: h * (0.25 + R() * 0.8), r: w * (0.18 + R() * 0.3), v: (0.15 + R() * 0.45) * (i % 2 ? 1 : -1), a: 0.05 + R() * 0.09, f: 0.2 + R() * 0.4, p: R() * 6.28, warm: R() < 0.3 }; });
      F.wisps = Array.from({ length: 7 }, function (_, i) { return { cx: 0.1 + i * 0.13, cy: 0.35 + ((i * 23) % 40) / 100, fx: 0.35 + R() * 0.4, fy: 0.5 + R() * 0.5, p: R() * 6.28, trail: [], s: 5 + (i % 3) * 3 }; });
      F.rings = [];
    },
    szene: function (n) {
      const F = run.fx;
      if (n === 2) zeile(T("fog.t2", "Da draußen ist etwas …"), "20%", "clamp(18px,3vw,34px)", "var(--fh-paper, #e8d5a8)", "0 0 30px rgba(232,213,168,.45)", { stagger: 45, dur: 1000 });
      if (n === 3) {
        const w = run.w, h = run.h, cy = h * 0.44;
        const tt = textTargets(T("fog.ship", "GEISTERSCHIFF"), w, h, cy, Math.min(h * 0.16, 92), 0.24);
        const R = Math.random, max = Math.round(1600 * dens());
        const pts = tt.pts.length > max ? tt.pts.filter(function () { return R() < max / tt.pts.length; }) : tt.pts;
        F.txt = { cy: cy, px: tt.px, parts: pts.map(function (q) { return { tx: q[0], ty: q[1], sx: R() * w, sy: h * (0.3 + R() * 0.6), d: R() * 0.6 + Math.abs(q[0] - w / 2) / w * 0.6, j: R() * 6.28, up: 0.4 + R() }; }) };
      }
      if (n === 4) {
        const worte = [T("fog.w1", "kehrt um …"), T("fog.w2", "zu spät"), T("fog.w3", "ihr gehört uns"), T("fog.w4", "hört ihr die glocke?"), T("fog.w5", "niemand entkommt"), T("fog.w6", "tiefer …")];
        const links = [12, 64, 26, 70, 14, 50], oben = [30, 36, 64, 72, 52, 84];
        const L = tmp(layer("", 9999));
        worte.forEach(function (wt, i) {
          const s = el("span", "position:absolute;left:" + links[i] + "%;top:" + oben[i] + "%;font-family:var(--fh-font-display);font-size:" + (15 + (i % 3) * 5) + "px;letter-spacing:.2em;color:#e8d5a8;text-shadow:0 0 18px rgba(232,213,168,.7);white-space:nowrap;opacity:0;", L, wt);
          if (s.animate) s.animate([{ opacity: 0, transform: "translate(-10px,10px)", filter: "blur(10px)", letterSpacing: ".5em" }, { opacity: 0.85, transform: "none", filter: "blur(.5px)", letterSpacing: ".2em", offset: 0.4 }, { opacity: 0, transform: "translate(14px,-12px)", filter: "blur(8px)", letterSpacing: ".3em" }], { duration: 2300, delay: i * 420, easing: "cubic-bezier(.45,0,.2,1)", fill: "both" });
        });
        const k = karte({ top: "12%", rand: "rgba(232,213,168,.45)", glow: "rgba(232,213,168,.18)", icon: IC.skull, iconColor: "#e8d5a8", iconStyle: "dashed", labelColor: "#e8d5a8", label: T("fog.cursed", "Verflucht"), text: T("fog.card", "Ein Fluch liegt über dem Deck – halt dich fest.") });
        if (!calm() && k.ic.animate) k.ic.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 1000, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
        [0, 1100, 2200].forEach(function (ms) { later(function () { run.fx.rings.push({ t: performance.now() }); }, ms); });
      }
      if (n === 5) {
        const g = tmp(layer("background:radial-gradient(90% 60% at 50% 110%,rgba(240,201,106,.32),rgba(255,106,42,.1) 50%,transparent 75%);", 9996));
        if (g.animate) g.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 3200, fill: "both" });
        const rays = tmp(el("div", "position:fixed;left:50%;bottom:-60vmax;width:170vmax;height:170vmax;margin-left:-85vmax;pointer-events:none;z-index:9996;mix-blend-mode:screen;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(240,201,106,.16) 0deg 4deg,transparent 4deg 16deg);-webkit-mask-image:radial-gradient(circle,#000 8%,transparent 52%);mask-image:radial-gradient(circle,#000 8%,transparent 52%);", run.halter));
        if (rays.animate) rays.animate([{ opacity: 0, transform: "rotate(-12deg) scale(.8)" }, { opacity: 1, transform: "rotate(4deg) scale(1)", offset: 0.6 }, { opacity: 0, transform: "rotate(10deg) scale(1.05)" }], { duration: 3200, easing: "cubic-bezier(.45,0,.2,1)", fill: "both" });
      }
    },
    draw: function (ctx, w, h, t, n, u) {
      const F = run.fx, ruhig = calm(), sp = ruhig ? 0.2 : 1;
      const fog = n === 1 ? inout(u / 2.2) : n === 5 ? 1 - inout(u / 2.8) : n === 0 ? 0 : 1;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(5,7,11," + 0.35 * fog + ")"); bg.addColorStop(1, "rgba(20,26,34," + 0.45 * fog + ")");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      F.blobs.forEach(function (b) {
        b.x += b.v * sp * (n === 5 ? 1 + u * 3 : 1);
        if (b.x - b.r > w * 1.2) b.x = -b.r; if (b.x + b.r < -w * 0.2) b.x = w + b.r;
        const y = b.y + Math.sin(t * b.f + b.p) * 18;
        const g = ctx.createRadialGradient(b.x, y, 0, b.x, y, b.r);
        const c = b.warm ? "232,213,168" : "220,228,238";
        g.addColorStop(0, "rgba(" + c + "," + b.a * fog + ")"); g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g; ctx.fillRect(b.x - b.r, y - b.r, b.r * 2, b.r * 2);
      });
      const gf = ctx.createLinearGradient(0, h * 0.7, 0, h);
      gf.addColorStop(0, "rgba(220,228,238,0)"); gf.addColorStop(1, "rgba(220,228,238," + 0.22 * fog + ")");
      ctx.fillStyle = gf; ctx.fillRect(0, h * 0.7, w, h * 0.3);
      const wisp = n >= 2 && n <= 4 ? (n === 2 ? ease(u / 1.2) : n === 4 ? 1 - ease((u - 2.2) / 0.8) : 1) : 0;
      if (wisp > 0) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        F.wisps.forEach(function (o) {
          const x = w * (o.cx + 0.1 * Math.sin(t * o.fx * sp + o.p)), y = h * (o.cy + 0.07 * Math.sin(t * o.fy * sp + o.p * 2));
          o.trail.push([x, y]); if (o.trail.length > 16) o.trail.shift();
          const fl = (0.65 + 0.35 * Math.sin(t * 9 + o.p) * Math.sin(t * 3.1 + o.p)) * wisp;
          o.trail.forEach(function (q, i) { const k = i / o.trail.length; ctx.fillStyle = "rgba(200,255,220," + 0.09 * k * fl + ")"; ctx.beginPath(); ctx.arc(q[0], q[1], o.s * 0.6 * k, 0, 7); ctx.fill(); });
          const g = ctx.createRadialGradient(x, y, 0, x, y, o.s * 5);
          g.addColorStop(0, "rgba(255,250,240," + 0.95 * fl + ")"); g.addColorStop(0.18, "rgba(210,255,225," + 0.5 * fl + ")"); g.addColorStop(1, "rgba(160,230,190,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, o.s * 5, 0, 7); ctx.fill();
        });
        ctx.restore();
      }
      if (n === 3 && F.txt) {
        const TX = F.txt, beamX = -w * 0.3 + (u / 3.2) * w * 1.6;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const bm = ctx.createRadialGradient(beamX, TX.cy, 0, beamX, TX.cy, w * 0.28);
        bm.addColorStop(0, "rgba(232,213,168,.28)"); bm.addColorStop(1, "rgba(232,213,168,0)");
        ctx.fillStyle = bm; ctx.fillRect(beamX - w * 0.3, TX.cy - w * 0.3, w * 0.6, w * 0.6);
        const halo = ctx.createRadialGradient(w / 2, TX.cy, 0, w / 2, TX.cy, w * 0.45);
        halo.addColorStop(0, "rgba(232,213,168," + 0.12 * ease(u / 1.5) + ")"); halo.addColorStop(1, "rgba(232,213,168,0)");
        ctx.fillStyle = halo; ctx.fillRect(0, TX.cy - w * 0.45, w, w * 0.9);
        const refl = TX.cy + TX.px * 0.55;
        TX.parts.forEach(function (p) {
          const k = ruhig ? 1 : inout((u - p.d) / 1.3);
          let x = p.sx + (p.tx - p.sx) * k + Math.sin(t * 2 + p.j) * (1 - k) * 30 + Math.sin(t * 3 + p.j) * 0.6;
          let y = p.sy + (p.ty - p.sy) * k + Math.cos(t * 1.7 + p.j) * 0.6;
          let a = 0.25 + 0.65 * k;
          if (u > 2.4) { const q = (u - 2.4) / 0.8; y -= q * q * 40 * p.up; x += Math.sin(p.j + q * 3) * q * 10; a *= Math.max(0, 1 - q); }
          const boost = Math.exp(-Math.pow((x - beamX) / (w * 0.12), 2));
          a = Math.min(1, a * (1 + boost * 1.4));
          ctx.fillStyle = "rgba(" + (232 + 23 * boost | 0) + "," + (213 + 30 * boost | 0) + ",168," + a + ")";
          ctx.fillRect(x, y, 1.8, 1.8);
          const ry = refl + (refl - y) * 0.9 + 8, rx = x + Math.sin(ry * 0.08 + t * 3) * 3;
          ctx.fillStyle = "rgba(232,213,168," + a * 0.16 * Math.max(0, 1 - (ry - refl) / (TX.px * 0.9)) + ")";
          ctx.fillRect(rx, ry, 1.8, 1.2);
        });
        ctx.restore();
      }
      if (F.rings.length) {
        const now = performance.now();
        F.rings = F.rings.filter(function (r) { return now - r.t < 2400; });
        F.rings.forEach(function (r) {
          const q = (now - r.t) / 2400;
          [0, 0.12, 0.24].forEach(function (o) { const qq = q - o; if (qq <= 0) return; ctx.strokeStyle = "rgba(232,213,168," + 0.45 * (1 - qq) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(w * 0.8, h * 0.3, qq * w * 0.35, qq * w * 0.12, 0, 0, 7); ctx.stroke(); });
        });
      }
      const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.75);
      vg.addColorStop(0, "rgba(5,7,11,0)"); vg.addColorStop(1, "rgba(5,7,11," + 0.7 * fog + ")");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    },
  };

  /* ======================================================
     STURM
  ====================================================== */
  const STURM = {
    init: function (w, h) {
      const R = Math.random, F = run.fx;
      F.drops = Array.from({ length: Math.round(420 * dens()) }, function () { return { x: R() * w * 1.4, y: R() * h, z: R() }; });
      F.splash = []; F.L = 0; F.lx = w * 0.72; F.bolts = null; F.sparks = []; F.done = {};
      F.clouds = Array.from({ length: 12 }, function () { return { x: R() * w, y: R() * h * 0.28, r: w * (0.12 + R() * 0.2), v: 0.2 + R() * 0.5 }; });
    },
    szene: function (n) {
      const F = run.fx, w = run.w, h = run.h;
      if (n === 1) zeile(T("storm.t1", "Ein Sturm zieht auf …"), "20%", "clamp(18px,3vw,34px)", "var(--fh-fg)", "0 0 30px rgba(66,184,255,.5)", { delay: 300 });
      if (n === 2) zeile(T("storm.t2", "Hörst du das Grollen?"), "20%", "clamp(18px,3vw,34px)", "var(--fh-muted-fg)", "", { stagger: 30 });
      if (n === 3) {
        F.bx0 = w * (0.45 + Math.random() * 0.1); F.bx1 = F.bx0 + (Math.random() - 0.5) * w * 0.15; F.by = h * 0.86;
        F.bolts = bolt(F.bx0, -10, F.bx1, F.by, w * 0.2, 7, [], 3.4); F.bt = performance.now(); F.restruck = false;
        later(function () { F.L = 1; F.lx = F.bx0; shake(9, 520); for (let i = 0; i < 40 * dens(); i++) F.sparks.push({ x: F.bx1, y: F.by, vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 8, l: 0 }); }, 110);
        const z = zeile(T("storm.impact", "EINSCHLAG"), "calc(70% - 40px)", "clamp(30px,8vw,96px)", "var(--fh-fg)", "0 0 40px #42b8ff,0 0 80px rgba(66,184,255,.5)", { delay: 160, stagger: 22, dur: 380, ls: ".2em", kf: [{ opacity: 0, transform: "scale(1.8)", filter: "blur(10px) brightness(3)" }, { opacity: 1, transform: "none", filter: "blur(0) brightness(1)" }] });
        if (!calm() && z.p.animate) z.p.animate([{ textShadow: "-3px 0 rgba(229,57,53,.7),3px 0 rgba(66,184,255,.9),0 0 40px #42b8ff" }, { textShadow: "0 0 40px #42b8ff,0 0 80px rgba(66,184,255,.5)" }, { textShadow: "2px 0 rgba(229,57,53,.6),-2px 0 rgba(66,184,255,.9),0 0 60px #42b8ff" }, { textShadow: "0 0 40px #42b8ff,0 0 80px rgba(66,184,255,.5)" }], { duration: 400, delay: 500, iterations: 4, easing: "steps(1,end)" });
      }
      if (n === 4) {
        const k = karte({ top: "14%", rand: "#42b8ff", glow: "rgba(66,184,255,.3)", icon: IC.zap, iconColor: "#42b8ff", labelColor: "#42b8ff", label: T("storm.charged", "Aufgeladen"), text: T("storm.card", "Der Blitz hat die Schatzkiste aufgesprengt – +150 Dublonen.") });
        F.card = k.box;
        if (!calm() && k.ic.animate) k.ic.animate([{ opacity: 1 }, { opacity: 1, offset: 0.49 }, { opacity: 0.35, offset: 0.5 }, { opacity: 0.35 }], { duration: 300, iterations: Infinity });
      }
      if (n === 5) F.card = null;
    },
    draw: function (ctx, w, h, t, n, u) {
      const F = run.fx, ruhig = calm(), R = Math.random;
      const rain = n === 1 ? ease(u / 1.6) : n === 5 ? 1 - inout(u / 2.8) : n === 0 ? 0 : 1;
      if (n === 2 && !ruhig) [[0.35, 0.55], [0.52, 0.3], [1.6, 0.7], [1.78, 0.35]].forEach(function (f, i) {
        if (u > f[0] && !F.done["f" + i]) { F.done["f" + i] = 1; F.L = Math.max(F.L, f[1]); F.lx = w * (0.65 + R() * 0.25); if (i === 2) later(function () { shake(2.5, 900); }, 700); }
      });
      if (n === 4 && !ruhig && R() < 0.012) { F.L = Math.max(F.L, 0.25); F.lx = R() * w; }
      F.L *= 0.88;
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "rgba(10,18,30," + 0.7 * rain + ")"); sky.addColorStop(0.5, "rgba(5,7,11," + 0.3 * rain + ")"); sky.addColorStop(1, "rgba(5,7,11," + 0.15 * rain + ")");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      F.clouds.forEach(function (c) {
        c.x += c.v * (ruhig ? 0.2 : 1); if (c.x - c.r > w) c.x = -c.r;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
        const lit = F.L * Math.exp(-Math.pow((c.x - F.lx) / (w * 0.35), 2));
        const col = [20 + 170 * lit | 0, 28 + 190 * lit | 0, 42 + 210 * lit | 0];
        g.addColorStop(0, "rgba(" + col + "," + (0.55 + 0.4 * lit) * rain + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
        ctx.fillStyle = g; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      });
      if (F.L > 0.02) { const g = ctx.createRadialGradient(F.lx, 0, 0, F.lx, 0, h * 1.1); g.addColorStop(0, "rgba(190,225,255," + F.L * 0.55 + ")"); g.addColorStop(1, "rgba(66,184,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      const wind = -0.28 + 0.14 * Math.sin(t * 0.7) + 0.1 * Math.sin(t * 2.3);
      ctx.lineCap = "round";
      F.drops.forEach(function (d) {
        const v = (ruhig ? 4 : 9) + d.z * 14, len = 6 + d.z * 20;
        d.x += wind * v; d.y += v;
        if (d.y > h - 4 * (1 - d.z)) {
          if (d.z > 0.55 && R() < 0.5 && rain > 0.3) for (let k = 0; k < 2; k++) F.splash.push({ x: d.x, y: h - 3, vx: (R() - 0.5) * 3 + wind * 2, vy: -1.5 - R() * 2.2, l: 0 });
          d.y = -len - R() * 60; d.x = R() * w * 1.4;
        }
        if (d.x < -40) d.x += w * 1.4;
        ctx.strokeStyle = "rgba(200,222,245," + (0.12 + d.z * 0.38) * rain * (1 + F.L) + ")"; ctx.lineWidth = 0.5 + d.z * 0.9;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - wind * len, d.y - len); ctx.stroke();
      });
      ctx.fillStyle = "rgba(200,222,245,.6)";
      F.splash = F.splash.filter(function (s) { s.l++; s.vy += 0.25; s.x += s.vx; s.y += s.vy; if (s.l > 22) return false; ctx.globalAlpha = (1 - s.l / 22) * rain; ctx.fillRect(s.x, s.y, 1.6, 1.6); return true; });
      ctx.globalAlpha = 1;
      if (n === 3 && F.bolts) {
        const bt = performance.now() - F.bt;
        if (bt > 300 && !F.restruck) { F.restruck = true; F.bolts = bolt(F.bx0, -10, F.bx1, F.by, w * 0.07, 6, [], 3.4); F.L = 0.9; }
        const a = bt < 110 ? 0.6 : bt < 220 ? 1 : bt < 300 ? 0.25 : bt < 420 ? 1 : Math.max(0, 1 - (bt - 420) / 900);
        if (a > 0) {
          drawBolt(ctx, F.bolts, a, bt < 110 ? bt / 110 : 1);
          if (bt > 110) { const g = ctx.createRadialGradient(F.bx1, F.by, 0, F.bx1, F.by, 150); g.addColorStop(0, "rgba(255,255,255," + 0.85 * a + ")"); g.addColorStop(0.3, "rgba(120,200,255," + 0.45 * a + ")"); g.addColorStop(1, "rgba(66,184,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(F.bx1, F.by, 150, 44, 0, 0, 7); ctx.fill(); }
        }
      }
      if (F.sparks.length) {
        ctx.fillStyle = "#cfeaff";
        F.sparks = F.sparks.filter(function (s) { s.l++; s.vy += 0.35; s.x += s.vx; s.y += s.vy; if (s.l > 45) return false; ctx.globalAlpha = 1 - s.l / 45; ctx.fillRect(s.x, s.y, 2, 2); return true; });
        ctx.globalAlpha = 1;
      }
      /* Kleine Entladungen an der Karte. */
      if (n === 4 && F.card && !ruhig && R() < 0.18) {
        const b = F.card.getBoundingClientRect();
        const side = R() < 0.5, x0 = side ? b.left : b.right, y0 = b.top + R() * b.height;
        const x1 = x0 + (side ? -1 : 1) * (20 + R() * 50), y1 = y0 + (R() - 0.5) * 50;
        drawBolt(ctx, bolt(x0, y0, x1, y1, 22, 4, [], 0.6), 0.9, 1);
      }
    },
  };

  /* ======================================================
     STURMFLUT
  ====================================================== */
  function surf(x, t, w, h) { const F = run.fx, A = F.amp; return h * (1 - F.level) + Math.sin(x * 0.012 + t * 1.6) * A + Math.sin(x * 0.027 - t * 2.3) * A * 0.5 + Math.sin(x * 0.005 + t * 0.7) * A * 0.8; }
  const FLUT = {
    init: function () { const F = run.fx; F.level = 0.07; F.amp = 7; F.spray = []; F.bubbles = []; F.card = null; },
    szene: function (n) {
      const F = run.fx;
      if (n === 1) zeile(T("flood.t1", "Das Wasser zieht sich zurück …"), "20%", "clamp(18px,3vw,34px)", "var(--fh-fg)", "0 0 30px rgba(90,160,224,.55)", { delay: 200 });
      if (n === 2) later(function () { shake(5, 700); }, 900);
      if (n === 3) {
        const z = zeile(T("flood.land", "LAND UNTER"), "14%", "clamp(40px,9vw,110px)", "var(--fh-fg)", "0 0 40px rgba(90,160,224,.75)", { stagger: 60, dur: 900, ls: ".14em", kf: [{ opacity: 0, transform: "translateY(60px) skewX(8deg)", filter: "blur(10px)" }, { opacity: 1, transform: "translateY(-6px)", filter: "blur(0)", offset: 0.7 }, { opacity: 1, transform: "none", filter: "blur(0)" }] });
        if (!calm()) z.letters.forEach(function (l, i) { if (l.animate) l.animate([{ translate: "0 0" }, { translate: "0 -6px" }, { translate: "0 0" }], { duration: 2400, delay: 900 + i * 90, iterations: Infinity, easing: "ease-in-out" }); });
      }
      if (n === 4) {
        const k = karte({ top: "0px", rand: "rgba(90,160,224,.6)", glow: "rgba(90,160,224,.25)", icon: IC.gift, iconColor: "#55c878", labelColor: "#5aa0e0", label: T("flood.drift", "Treibgut"), text: T("flood.card", "Eine Kiste treibt an Deck – +150 Dublonen.") });
        F.card = k.box;
      }
      if (n === 5) F.card = null;
    },
    draw: function (ctx, w, h, t, n, u) {
      const F = run.fx, R = Math.random, ruhig = calm();
      let amp = 7;
      if (n === 1) { F.level = 0.07 - 0.055 * inout(u / 1.8); amp = 4; }
      else if (n === 2) { const q = ease(u / 2.2); F.level = 0.015 + 0.33 * q + Math.sin(Math.min(1, u / 2.2) * Math.PI) * 0.06; amp = 16; }
      else if (n === 3) { F.level = 0.34 + 0.26 * inout(u / 2.6); amp = 10; }
      else if (n === 4) { F.level = 0.6 + Math.sin(t * 0.9) * 0.01; amp = 8; }
      else if (n === 5) { F.level = 0.6 * (1 - inout(u / 2.8)); amp = 6 * Math.max(0, 1 - u / 3); }
      F.amp = ruhig ? amp * 0.4 : amp;
      const lagen = [[0.3, "rgba(90,160,224,.35)", "rgba(42,74,114,.4)", -14], [1.1, "rgba(42,74,114,.62)", "rgba(11,24,36,.85)", -4], [2.1, "rgba(60,110,160,.55)", "rgba(11,24,36,.9)", 6]];
      lagen.forEach(function (L, li) {
        const ph = L[0], off = L[3];
        const g = ctx.createLinearGradient(0, h * (1 - F.level) - 20, 0, h);
        g.addColorStop(0, L[1]); g.addColorStop(1, L[2]);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, surf(x + ph * 200, t * (1 + li * 0.15) + ph, w, h) + off);
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        if (li === 2) {
          ctx.strokeStyle = "rgba(220,238,250,.45)"; ctx.lineWidth = 1.4; ctx.beginPath();
          for (let x = 0; x <= w + 8; x += 8) { const y = surf(x + ph * 200, t * 1.3 + ph, w, h) + off; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
        }
      });
      const top = h * (1 - F.level);
      if (F.level > 0.05) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 5; k++) {
          const x = w * (0.1 + k * 0.2) + Math.sin(t * 0.4 + k) * 30, sw = 40 + (k % 2) * 30;
          const g = ctx.createLinearGradient(0, top, 0, h); g.addColorStop(0, "rgba(200,230,255," + (0.08 + 0.04 * Math.sin(t * 2 + k)) + ")"); g.addColorStop(1, "rgba(200,230,255,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + sw, top); ctx.lineTo(x + sw + 120, h); ctx.lineTo(x + 60, h); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = "rgba(200,222,245,.07)"; ctx.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          const yb = top + 30 + k * 36; if (yb > h) break;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 10) { const y = yb + Math.sin(x * 0.03 + t * 2.2 + k * 1.7) * 6 + Math.sin(x * 0.011 - t * 1.3) * 5; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.restore();
      }
      if (n === 2 && u > 0.4 && u < 2.4 && !ruhig) for (let i = 0; i < 6 * dens(); i++) { const x = R() * w; F.spray.push({ x: x, y: surf(x + 420, t * 1.3 + 2.1, w, h), vx: (R() - 0.3) * 3, vy: -3 - R() * 6, l: 0, s: 1 + R() * 2.5 }); }
      ctx.fillStyle = "rgba(220,238,250,.8)";
      F.spray = F.spray.filter(function (s) { s.l++; s.vy += 0.22; s.x += s.vx; s.y += s.vy; if (s.l > 50) return false; ctx.globalAlpha = 1 - s.l / 50; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 7); ctx.fill(); return true; });
      ctx.globalAlpha = 1;
      if ((n === 3 || n === 4) && R() < 0.35 * dens()) F.bubbles.push({ x: R() * w, y: h + 10, r: 1.5 + R() * 5, v: 0.6 + R() * 1.4, p: R() * 6.28 });
      F.bubbles = F.bubbles.filter(function (b) {
        b.y -= b.v; b.p += 0.08;
        const x = b.x + Math.sin(b.p) * 3, sy = surf(x + 420, t * 1.3 + 2.1, w, h) + 6;
        if (b.y < sy) return false;
        ctx.strokeStyle = "rgba(200,222,245,.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 7); ctx.stroke();
        ctx.fillStyle = "rgba(232,237,244,.35)"; ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, 7); ctx.fill();
        return true;
      });
      /* Die Treibgut-Karte schwimmt auf der Welle. */
      if (n === 4 && F.card && F.card.parentNode) {
        const bh = F.card.offsetHeight, y = surf(w / 2 + 420, t * 1.3 + 2.1, w, h) + 6 - bh * 0.7;
        const sl = (surf(w / 2 + 460, t * 1.3 + 2.1, w, h) - surf(w / 2 + 380, t * 1.3 + 2.1, w, h)) / 80;
        F.card.parentNode.style.transform = "translateY(" + y.toFixed(1) + "px) rotate(" + (Math.atan(sl) * 57).toFixed(2) + "deg)";
      }
      if (n === 5) {
        const cx = w / 2, cy = h * 0.92, Rr = w * 0.32 * (1 - ease(u / 3)) + 10, a = 1 - ease((u - 2) / 1);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (let arm = 0; arm < 6; arm++) {
          ctx.strokeStyle = "rgba(120,180,235," + 0.35 * a + ")"; ctx.lineWidth = 2; ctx.beginPath();
          for (let r = 6; r < Rr; r += 4) { const ang = arm * 1.047 + r * 0.045 - t * 5; const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.32; if (r === 6) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rr * 0.4); g.addColorStop(0, "rgba(5,7,11," + 0.8 * a + ")"); g.addColorStop(1, "rgba(5,7,11,0)");
        ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, Rr * 0.4, Rr * 0.14, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
    },
  };

  /* ======================================================
     NORDLICHT
  ====================================================== */
  const NORDLICHT = {
    init: function (w, h) {
      const R = Math.random, F = run.fx;
      F.stars = Array.from({ length: Math.round(180 * dens()) }, function () { return { x: R() * w, y: R() * h * 0.75, b: 0.3 + R() * 0.7, f: 1 + R() * 3, p: R() * 6.28, s: R() < 0.1 ? 1.6 : 1 }; });
      F.rib = [{ y: 0.1, hh: 0.34, s: 0.35, p: 0 }, { y: 0.2, hh: 0.28, s: 0.5, p: 2.1 }, { y: 0.05, hh: 0.22, s: 0.28, p: 4.2 }];
      const mk = function (c) { const g = run.ctx.createLinearGradient(0, 0, 0, 1); g.addColorStop(0, "rgba(" + c + ",0)"); g.addColorStop(0.18, "rgba(" + c + ",.9)"); g.addColorStop(0.45, "rgba(" + c + ",.35)"); g.addColorStop(1, "rgba(" + c + ",0)"); return g; };
      F.grads = [mk("85,200,120"), mk("66,184,255"), mk("166,107,255")];
      F.shoot = []; F.sparks = []; F.wish = null;
    },
    szene: function (n) {
      const F = run.fx, w = run.w, h = run.h;
      if (n === 1) zeile(T("aurora.t1", "Der Himmel wird still …"), "22%", "clamp(18px,3vw,34px)", "var(--fh-fg)", "", { delay: 400, stagger: 55, dur: 1400, ls: ".1em" });
      if (n === 2) {
        const z = zeile(T("aurora.title", "NORDLICHT"), "calc(40% - 20px)", "clamp(40px,8vw,100px)", "var(--fh-fg)", "0 0 50px rgba(166,107,255,.6),0 0 90px rgba(85,200,120,.35)", { stagger: 90, dur: 1600, kf: [{ opacity: 0, filter: "blur(14px)", transform: "translateY(18px) scale(1.1)" }, { opacity: 1, filter: "blur(0)", transform: "none" }] });
        if (!calm() && z.p.animate) z.p.animate([{ textShadow: "0 0 50px rgba(166,107,255,.7),0 0 90px rgba(85,200,120,.35)" }, { textShadow: "0 0 50px rgba(85,200,120,.75),0 0 90px rgba(66,184,255,.4)" }, { textShadow: "0 0 50px rgba(166,107,255,.7),0 0 90px rgba(85,200,120,.35)" }], { duration: 3000, iterations: Infinity, easing: "ease-in-out" });
      }
      if (n === 3) for (let i = 0; i < 16; i++) later(function () { const R = Math.random; run.fx.shoot.push({ x: w * (0.4 + R() * 0.7), y: h * R() * 0.35, vx: -(7 + R() * 5), vy: 3.2 + R() * 2.5, l: 0, max: 50 + R() * 30, tr: [] }); }, i * 210);
      if (n === 4) {
        F.wish = { t0: performance.now(), x0: w * 0.82, y0: -10, x1: w / 2, y1: h * 0.42, burst: false };
        zeile(T("aurora.wish", "Wünsch dir was"), "calc(42% - 30px)", "clamp(26px,7vw,84px)", "var(--fh-fg)", "0 0 50px rgba(166,107,255,.65)", { delay: 1100, stagger: 45, dur: 1200, ls: ".06em", kf: [{ opacity: 0, filter: "blur(14px)", transform: "translateY(20px)" }, { opacity: 1, filter: "blur(0)", transform: "none" }] });
        zeile(T("aurora.granted", "Ein Wunsch geht in Erfüllung – +150 Dublonen"), "calc(42% + 50px)", "16px", "var(--fh-fg)", "", { font: "var(--fh-font-sans, Inter), sans-serif", ls: ".01em", delay: 1900, stagger: 12, dur: 600 });
      }
    },
    draw: function (ctx, w, h, t, n, u) {
      const F = run.fx, ruhig = calm(), R = Math.random, sp = ruhig ? 0.25 : 1;
      const A = n === 1 ? 0.55 * inout(u / 2.4) : n === 5 ? 1 - inout(u / 2.8) : n === 2 ? 0.55 + 0.45 * ease(u / 2) : 1;
      const starA = n === 1 ? ease(u / 2) : n === 5 ? 1 - inout(u / 2.8) : 1;
      const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "rgba(3,8,20," + 0.5 * starA + ")"); sky.addColorStop(1, "rgba(3,8,20,0)");
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      F.stars.forEach(function (s) {
        const a = s.b * (0.55 + 0.45 * Math.sin(t * s.f + s.p)) * starA;
        ctx.fillStyle = "rgba(232,237,244," + a + ")"; ctx.fillRect(s.x, s.y, s.s, s.s);
        if (s.s > 1) { ctx.fillStyle = "rgba(232,237,244," + a * 0.3 + ")"; ctx.fillRect(s.x - 2, s.y + 0.3, 5.6, 1); ctx.fillRect(s.x + 0.3, s.y - 2, 1, 5.6); }
      });
      const step = w < 700 ? 7 : 5, tt = t * sp;
      F.rib.forEach(function (r, ri) {
        for (let x = -10; x < w + 10; x += step) {
          const top = h * (r.y + 0.06 * Math.sin(x * 0.003 + tt * r.s + r.p) + 0.025 * Math.sin(x * 0.011 - tt * r.s * 1.7));
          const hh = h * r.hh * (0.65 + 0.35 * Math.sin(x * 0.007 + tt * 0.9 + r.p));
          const I = A * Math.pow(0.5 + 0.5 * Math.sin(x * 0.013 + tt * 1.3 + r.p), 2) * (0.75 + 0.25 * Math.sin(x * 0.09 + tt * 6));
          if (I < 0.02) continue;
          const cpos = (x / w + tt * 0.05 + ri * 0.3) % 1, ci = Math.floor(cpos * 3) % 3, cf = (cpos * 3) % 1;
          ctx.save(); ctx.translate(x, top); ctx.scale(1, hh);
          ctx.globalAlpha = I * 0.42 * (1 - cf); ctx.fillStyle = F.grads[ci]; ctx.fillRect(0, 0, step + 1, 1);
          ctx.globalAlpha = I * 0.42 * cf; ctx.fillStyle = F.grads[(ci + 1) % 3]; ctx.fillRect(0, 0, step + 1, 1);
          ctx.restore();
        }
      });
      ctx.globalAlpha = 1;
      F.shoot = F.shoot.filter(function (s) {
        s.l++; s.x += s.vx; s.y += s.vy; s.tr.push([s.x, s.y]); if (s.tr.length > 18) s.tr.shift();
        if (s.l > s.max) return false;
        const k = Math.sin(s.l / s.max * Math.PI), tx = s.tr[0][0], ty = s.tr[0][1];
        const g = ctx.createLinearGradient(tx, ty, s.x, s.y); g.addColorStop(0, "rgba(232,237,244,0)"); g.addColorStop(1, "rgba(232,237,244," + k + ")");
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
        const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 8); hg.addColorStop(0, "rgba(255,255,255," + k + ")"); hg.addColorStop(1, "rgba(200,230,255,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, 7); ctx.fill();
        if (R() < 0.5) F.sparks.push({ x: s.x, y: s.y, vx: (R() - 0.5) * 1.2, vy: R() * 1.2, l: 0, c: ["200,255,220", "220,200,255", "255,240,200"][R() * 3 | 0] });
        return true;
      });
      if (F.wish) {
        const W = F.wish, q = (performance.now() - W.t0) / 1100;
        if (q < 1) {
          const e = inout(q), x = W.x0 + (W.x1 - W.x0) * e, y = W.y0 + (W.y1 - W.y0) * e;
          const hg = ctx.createRadialGradient(x, y, 0, x, y, 22); hg.addColorStop(0, "rgba(255,255,255,1)"); hg.addColorStop(0.3, "rgba(240,201,106,.7)"); hg.addColorStop(1, "rgba(240,201,106,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill();
          F.sparks.push({ x: x, y: y, vx: (R() - 0.5) * 1.5, vy: R() * 1.5, l: 0, c: "255,230,170" });
        } else if (!W.burst) {
          W.burst = true;
          for (let i = 0; i < 70 * dens(); i++) { const a = R() * 6.28, v = 1 + R() * 5; F.sparks.push({ x: W.x1, y: W.y1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 0, c: ["200,255,220", "220,200,255", "255,230,170"][i % 3], big: 1 }); }
          W.flash = performance.now();
        }
        if (W.flash) { const fq = (performance.now() - W.flash) / 700; if (fq < 1) { const g = ctx.createRadialGradient(W.x1, W.y1, 0, W.x1, W.y1, w * 0.4 * fq + 20); g.addColorStop(0, "rgba(255,245,220," + (1 - fq) * 0.7 + ")"); g.addColorStop(1, "rgba(166,107,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); } }
      }
      F.sparks = F.sparks.filter(function (s) {
        s.l++; s.vx *= 0.96; s.vy = s.vy * 0.96 + 0.04; s.x += s.vx; s.y += s.vy;
        const m = s.big ? 70 : 40; if (s.l > m) return false;
        const k = 1 - s.l / m, z = s.big ? 2.2 : 1.4;
        ctx.fillStyle = "rgba(" + s.c + "," + k + ")"; ctx.fillRect(s.x - z / 2, s.y - z / 2, z, z);
        return true;
      });
      ctx.globalCompositeOperation = "source-over";
    },
  };

  const WELT = { nebel: NEBEL, sturm: STURM, flut: FLUT, nordlicht: NORDLICHT };

  /* ------------------------------------------------------
     LEINWAND UND ABLAUF
  ------------------------------------------------------ */
  function groesse() {
    if (!run) return;
    /* Die Effekte sind weich - auf grossen Bildschirmen reicht einfache
       Aufloesung, das spart viel Rechenzeit. */
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(w * h > 1200000 ? 1 : 1.5, window.devicePixelRatio || 1);
    run.c.width = Math.round(w * dpr); run.c.height = Math.round(h * dpr);
    run.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    run.w = w; run.h = h;
  }

  function bild(now) {
    if (!run) return;
    const r = run;
    r.raf = requestAnimationFrame(bild);
    const t = (now - r.t0) / 1000, u = (now - r.tn) / 1000;
    r.ctx.clearRect(0, 0, r.w, r.h);
    try { WELT[r.name].draw(r.ctx, r.w, r.h, t, r.n, u); } catch (e) { console.warn("Wetter-Story:", e); weg(); }
  }

  function start(name, n, msInSzene) {
    weg();
    if (!WELT[name]) return;
    const halter = document.createElement("div");
    halter.id = "fh-wetter";
    halter.setAttribute("aria-hidden", "true");
    halter.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9996;";
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9996;" + (name === "nordlicht" ? "mix-blend-mode:screen;" : "");
    halter.appendChild(c);
    document.body.appendChild(halter);
    const now = performance.now();
    run = { name: name, n: 0, t0: now, tn: now, tmp: [], c: c, ctx: c.getContext("2d"), w: 0, h: 0, raf: 0, halter: halter, fx: {}, timer: [] };
    groesse();
    WELT[name].init(run.w, run.h);
    window.addEventListener("resize", groesse);
    run.raf = requestAnimationFrame(bild);
    szene(n || 1, msInSzene || 0);
  }

  /* Neue Szene: die Ebenen der alten blenden aus, die neuen kommen. */
  function szene(n, msInSzene) {
    if (!run || run.n === n) return;
    run.tmp.forEach(function (e) {
      if (!e.animate) { e.remove(); return; }
      const a = e.animate([{ opacity: getComputedStyle(e).opacity }, { opacity: 0 }], { duration: 380, fill: "forwards", easing: "cubic-bezier(.4,0,.7,.2)" });
      a.onfinish = function () { e.remove(); };
    });
    run.tmp = [];
    run.n = n;
    run.tn = performance.now() - (msInSzene || 0);
    WELT[run.name].szene(n);
  }

  function ende() {
    if (!run) return;
    const r = run;
    if (r.halter.animate) {
      const a = r.halter.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
      a.onfinish = function () { if (run === r) weg(); };
    } else weg();
  }

  function weg() {
    if (!run) return;
    cancelAnimationFrame(run.raf);
    run.timer.forEach(clearTimeout);
    window.removeEventListener("resize", groesse);
    run.halter.remove();
    run = null;
  }

  window.fhStoryWetter = {
    STORYS: STORYS,
    start: start,
    szene: szene,
    ende: ende,
    weg: weg,
    laeuft: function () { return run ? run.name : null; },
  };
})();
