/* ======================================================
   LIVE-STORY "ZEITMASCHINE 2100" (Migration 46)
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Zeitmaschine 2100"
   (zeitmaschine-2100.jsx): ein 5-Minuten-Film ohne Worte.

     Werkstatt 0 s · Aufladen 30 · Sprung 60 · Stille 80 · Erde 110 ·
     Spaltung 150 · Umsehen 185 · Krieg 210 · Neue Seite 260 · Ende 300

   Auf der Pergament-Seite von 1720 zeichnet sich mit Tinte eine
   Zeitmaschine auf. Sie laedt sich auf, die Seite zittert, das Papier
   zerspringt, und ein Lichttunnel zieht uns durch die Zeit. Im All
   bricht die Erde auseinander, Menschen und Aliens fuehren Krieg, und
   die Seite setzt sich im All-Look neu zusammen - zum Filmende gilt
   fuer alle die Epoche 2100 (css/96-epoche-2100.css).

   WIE ES GEBAUT IST (wie riss-film.js)
   - Der Entwurf ist React: jedes Bild eine reine Funktion der Zeit T.
     Der Bildteil (in baueFilm) ist einmalig mit esbuild von JSX in
     Aufrufe von _h() uebersetzt; _h() baut einen kleinen Baum,
     zeichnen() gleicht ihn mit dem DOM ab. Buehne 1920 x 1080,
     eingepasst, hoechstens 30 Bilder pro Sekunde.
   - Abweichungen vom Entwurf: die Szenenmarken stehen fest hier statt
     in useComposition(); bei "Bewegung reduzieren" wackeln Seite und
     Bild nicht. Bilder: scripts/avatare/1|3|5.png und
     scripts/image/logbuch2.webp.

   live-storys.js startet den Film in der Story "zeit":
     fhZeitFilm.start({ ab: ms, vorschau })
     fhZeitFilm.ende()   - Story vorbei: kurz ausblenden
     fhZeitFilm.weg()    - abgebrochen: sofort weg

   Der Film hat keine Texte; nur Knoepfe und Hinweise ausserhalb der
   Buehne (i18n.js: zeit.*, riss.skip, riss.rotate).
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  /* ------------------------------------------------------
     ZEIT-HELFER (aus animations-v3.jsx des Entwurfs)
  ------------------------------------------------------ */
  const Easing = {
    easeInCubic: (x) => x * x * x,
    easeOutCubic: (x) => (--x) * x * x + 1,
    easeInOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : (x - 1) * (2 * x - 2) * (2 * x - 2) + 1),
    easeInOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
    easeOutBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /* ------------------------------------------------------
     DER KLEINE BAUM: _h(tag, props, ...kinder)
     Komponenten (Funktionen) werden sofort aufgerufen, _Frag ist
     eine Liste. Ergebnis: { tag, p, k } oder Text.
  ------------------------------------------------------ */
  const _Frag = "#frag";
  function flach(liste, aus) {
    for (let i = 0; i < liste.length; i++) {
      const x = liste[i];
      if (x == null || x === false || x === true) continue;
      if (Array.isArray(x)) flach(x, aus);
      else if (x.tag === _Frag) flach(x.k, aus);
      else aus.push(typeof x === "object" ? x : String(x));
    }
    return aus;
  }
  function _h(tag, props) {
    const kinder = Array.prototype.slice.call(arguments, 2);
    if (typeof tag === "function") {
      const p = Object.assign({}, props);
      p.children = kinder.length === 1 ? kinder[0] : kinder;
      return tag(p);
    }
    return { tag: tag, p: props || {}, k: kinder };
  }

  const OHNE_EINHEIT = { opacity: 1, zIndex: 1, flex: 1, flexGrow: 1, flexShrink: 1, fontWeight: 1, lineHeight: 1, order: 1 };
  const kebabCache = {};
  function kebab(k) { return kebabCache[k] || (kebabCache[k] = k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); })); }
  function stilText(st) {
    let s = "";
    for (const k in st) {
      const v = st[k];
      if (v == null || v === "") continue;
      s += kebab(k) + ":" + (typeof v === "number" && !OHNE_EINHEIT[k] ? v + "px" : v) + ";";
    }
    return s;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_TAGS = { svg: 1, g: 1, path: 1, defs: 1, linearGradient: 1, radialGradient: 1, stop: 1, clipPath: 1,
    rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, image: 1 };
  const SVG_CAMEL = { viewBox: 1, pathLength: 1, preserveAspectRatio: 1 };

  function attrsSetzen(el, p, svg) {
    const alt = el.__p || {};
    for (const k in p) {
      if (k === "key" || k === "children" || k === "male") continue;
      const v = p[k];
      if (k === "style") {
        const s = stilText(v);
        if (el.__s !== s) { el.style.cssText = s; el.__s = s; }
        continue;
      }
      if (alt[k] === v) continue;
      const name = k === "className" ? "class" : svg && !SVG_CAMEL[k] ? kebab(k) : k;
      if (v == null || v === false) el.removeAttribute(name);
      else el.setAttribute(name, v);
    }
    el.__p = p;
    /* Canvas: "male" zeichnet nach jedem Abgleich hinein. */
    if (typeof p.male === "function") p.male(el);
  }

  function neu(v, svg) {
    if (typeof v === "string") return document.createTextNode(v);
    const istSvg = svg || !!SVG_TAGS[v.tag];
    const el = istSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    el.__tag = v.tag;
    if (v.tag === "img") { el.decoding = "async"; el.alt = ""; }
    attrsSetzen(el, v.p, istSvg);
    zeichnen(el, v.k, istSvg);
    return el;
  }

  /* Kinder von "el" auf die Liste "kinder" bringen - Stelle fuer Stelle. */
  function zeichnen(el, kinder, svg) {
    const liste = flach(kinder, []);
    const da = el.childNodes;
    for (let i = 0; i < liste.length; i++) {
      const v = liste[i], d = da[i];
      if (typeof v === "string") {
        if (d && d.nodeType === 3) { if (d.nodeValue !== v) d.nodeValue = v; }
        else if (d) el.replaceChild(document.createTextNode(v), d);
        else el.appendChild(document.createTextNode(v));
        continue;
      }
      const istSvg = svg || !!SVG_TAGS[v.tag];
      if (d && d.__tag === v.tag) {
        attrsSetzen(d, v.p, istSvg);
        zeichnen(d, v.k, istSvg);
      } else if (d) el.replaceChild(neu(v, svg), d);
      else el.appendChild(neu(v, svg));
    }
    while (da.length > liste.length) el.removeChild(el.lastChild);
  }

  /* ------------------------------------------------------
     DER FILM (aus zeitmaschine-2100.jsx, uebersetzt)
     Neun Szenen wie OM_SCENES im Entwurf; CUES sind ihre Anfaenge
     in Sekunden (der Entwurf holte sie aus useComposition()).
  ------------------------------------------------------ */
  const SZENEN = [["Werkstatt", 30], ["Aufladen", 30], ["Sprung", 20], ["Stille", 30], ["Erde", 40],
    ["Spaltung", 35], ["Umsehen", 25], ["Krieg", 50], ["Neue Seite", 40]];
  const CUES = {};
  let DAUER = 0;
  SZENEN.forEach(function (s) { CUES[s[0]] = DAUER; DAUER += s[1]; });   // 300 s

  function baueFilm() {
    const React = { Fragment: _Frag };
    const W = 1920, H = 1080;
    const Ez = Easing, cl = clamp;
    const sg = (T, a, b, e) => {
      const p = cl((T - a) / (b - a), 0, 1);
      return e ? e(p) : p;
    };
    const lp = (a, b, p) => a + (b - a) * p;
    const fr = (x) => x - Math.floor(x);
    const hs = (n) => fr(Math.sin(n * 127.1 + 311.7) * 43758.5453);
    function rng(s) {
      let a = s >>> 0;
      return () => {
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const dr = (p) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - cl(p, 0, 1) });
    const f1 = (n) => n.toFixed(1);
    function gearPath(r, n) {
      let d = "";
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, s = Math.PI * 2 / n;
        [[a0, r * 0.84], [a0 + s * 0.15, r], [a0 + s * 0.45, r], [a0 + s * 0.6, r * 0.84]].forEach(([a, rr], j) => {
          d += (i === 0 && j === 0 ? "M" : "L") + f1(Math.cos(a) * rr) + " " + f1(Math.sin(a) * rr);
        });
      }
      return d + "Z";
    }
    const INK = "#3a2414", SEP = "#6b4a2b";
    const MC = { x: 1025, y: 600 };
    const GEARS = [{ x: 760, y: 880, r: 85, n: 14, d: 1, t: 16 }, { x: 1290, y: 880, r: 70, n: 12, d: -1.2, t: 17.5 }, { x: 1300, y: 330, r: 50, n: 10, d: 1.7, t: 19 }].map((g) => ({ ...g, path: gearPath(g.r, g.n) }));
    const AV = ["scripts/avatare/1.png", "scripts/avatare/3.png", "scripts/avatare/5.png"];
    const LOG = "scripts/image/logbuch2.webp";
    function Paper({ t, A }) {
      const dt = Math.max(0, t - A);
      const ang = t * 3 + 3 * dt * dt;
      const a1 = t * 0.25 + 4e-3 * dt * dt * dt, a2 = t * 0.18 + 55e-4 * dt * dt * dt;
      const needle = -120 + 240 * sg(t, A + 4, A + 24, Ez.easeInOutCubic) + Math.sin(t * 23) * 6 * sg(t, A + 10, A + 30);
      const bar = (x, y, w, o) => _h("rect", { x, y, width: w, height: 10, rx: 5, fill: SEP, opacity: o || 0.3 });
      return _h("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", left: 0, top: 0 } }, _h("defs", null, _h("radialGradient", { id: "pp", cx: "50%", cy: "50%", r: "75%" }, _h("stop", { offset: "0", stopColor: "#f3e8cf" }), _h("stop", { offset: ".62", stopColor: "#e2cfa6" }), _h("stop", { offset: "1", stopColor: "#ad8d55" })), _h("clipPath", { id: "pav1" }, _h("circle", { cx: "230", cy: "215", r: "44" })), _h("clipPath", { id: "pav2" }, _h("circle", { cx: "1640", cy: "215", r: "44" })), _h("clipPath", { id: "pav3" }, _h("circle", { cx: "1640", cy: "665", r: "44" }))), _h("rect", { width: W, height: H, fill: "url(#pp)" }), _h("g", { stroke: SEP, strokeWidth: "2", fill: "rgba(120,80,40,.06)", opacity: ".8" }, _h("rect", { x: "30", y: "30", width: "100", height: "1020", rx: "6" }), [0, 1, 2, 3, 4].map((i) => _h("circle", { key: i, cx: "80", cy: 150 + i * 110, r: "22" })), _h("rect", { x: "160", y: "30", width: "1730", height: "80", rx: "6" }), _h("rect", { x: "160", y: "140", width: "320", height: "420", rx: "6" }), _h("rect", { x: "160", y: "590", width: "320", height: "460", rx: "6" }), _h("rect", { x: "1570", y: "140", width: "320", height: "420", rx: "6" }), _h("rect", { x: "1570", y: "590", width: "320", height: "460", rx: "6" })), _h("g", { stroke: "none" }, bar(200, 65, 140, 0.35), bar(370, 65, 100, 0.3), bar(500, 65, 120, 0.3), bar(1650, 65, 200, 0.25), [300, 330, 360, 400, 430].map((y, i) => bar(190, y + 40, 260 - i % 3 * 50)), [860, 890, 920, 950, 980].map((y, i) => bar(190, y, 250 - i % 2 * 70)), [300, 330, 360, 400, 430].map((y, i) => bar(1600, y + 40, 250 - i % 3 * 40)), [760, 790, 820, 860, 890, 920].map((y, i) => bar(1600, y, 260 - i % 3 * 60))), _h("g", { style: { filter: "sepia(1) contrast(.85) brightness(1.05)" }, opacity: ".85" }, _h("image", { href: AV[0], x: "186", y: "171", width: "88", height: "88", clipPath: "url(#pav1)", preserveAspectRatio: "xMidYMid slice" }), _h("image", { href: AV[1], x: "1596", y: "171", width: "88", height: "88", clipPath: "url(#pav2)", preserveAspectRatio: "xMidYMid slice" }), _h("image", { href: AV[2], x: "1596", y: "621", width: "88", height: "88", clipPath: "url(#pav3)", preserveAspectRatio: "xMidYMid slice" }), _h("image", { href: LOG, x: "185", y: "615", width: "270", height: "210", preserveAspectRatio: "xMidYMid slice" })), _h("g", { stroke: INK, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }, _h("ellipse", { cx: MC.x, cy: "930", rx: "320", ry: "52", strokeWidth: "3", ...dr(sg(t, 3, 7)) }), _h("ellipse", { cx: MC.x, cy: "948", rx: "262", ry: "34", strokeWidth: "2", ...dr(sg(t, 5, 8)) }), Array.from({ length: 16 }, (_, i) => {
        const x = MC.x - 280 + i * 37;
        return _h("line", { key: i, x1: x, y1: 952, x2: x - 18, y2: 975, strokeWidth: "1.5", ...dr(sg(t, 6 + i * 0.12, 7 + i * 0.12)) });
      }), _h("path", { d: `M${MC.x - 210} 925 L${MC.x - 150} 840 M${MC.x + 210} 925 L${MC.x + 150} 840 M${MC.x} 935 L${MC.x} 900`, strokeWidth: "4", ...dr(sg(t, 7, 10)) }), _h("circle", { cx: MC.x, cy: MC.y, r: "300", strokeWidth: "4", ...dr(sg(t, 5, 10)) }), _h("circle", { cx: MC.x, cy: MC.y, r: "286", strokeWidth: "1.2", ...dr(sg(t, 6, 11)) }), _h("ellipse", { cx: MC.x, cy: MC.y, rx: "300", ry: Math.max(2, Math.abs(Math.cos(a1)) * 300), strokeWidth: "3", ...dr(sg(t, 8, 13)) }), _h("ellipse", { cx: MC.x, cy: MC.y, rx: Math.max(2, Math.abs(Math.cos(a2)) * 268), ry: "268", strokeWidth: "2.5", ...dr(sg(t, 10, 15)) }), _h("ellipse", { cx: MC.x, cy: MC.y, rx: "285", ry: Math.max(2, Math.abs(Math.sin(a1 * 0.7)) * 285), strokeWidth: "2", transform: `rotate(60 ${MC.x} ${MC.y})`, ...dr(sg(t, 11, 16)) }), _h("g", { transform: `rotate(${ang / 3} ${MC.x} ${MC.y})` }, Array.from({ length: 8 }, (_, i) => {
        const a = i / 8 * Math.PI * 2;
        return _h("line", { key: i, x1: MC.x + Math.cos(a) * 74, y1: MC.y + Math.sin(a) * 74, x2: MC.x + Math.cos(a) * 150, y2: MC.y + Math.sin(a) * 150, strokeWidth: "2", ...dr(sg(t, 15 + i * 0.2, 16.5 + i * 0.2)) });
      })), _h("circle", { cx: MC.x, cy: MC.y, r: "72", strokeWidth: "4", ...dr(sg(t, 13, 16)) }), _h("circle", { cx: MC.x, cy: MC.y, r: "58", strokeWidth: "1.5", ...dr(sg(t, 14, 16.5)) }), Array.from({ length: 13 }, (_, i) => {
        const a = (-120 + i * 20 - 90) * Math.PI / 180;
        return _h("line", { key: i, x1: MC.x + Math.cos(a) * 46, y1: MC.y + Math.sin(a) * 46, x2: MC.x + Math.cos(a) * 56, y2: MC.y + Math.sin(a) * 56, strokeWidth: "2", ...dr(sg(t, 19 + i * 0.1, 19.6 + i * 0.1)) });
      }), _h("line", { x1: MC.x, y1: MC.y, x2: MC.x, y2: MC.y - 44, strokeWidth: "4", transform: `rotate(${needle} ${MC.x} ${MC.y})`, ...dr(sg(t, 20, 22)) }), GEARS.map((g, i) => _h("g", { key: i, transform: `translate(${g.x} ${g.y}) rotate(${ang * g.d * (85 / g.r)})` }, _h("path", { d: g.path, strokeWidth: "3", ...dr(sg(t, g.t, g.t + 4)) }), _h("circle", { r: g.r * 0.32, strokeWidth: "2", ...dr(sg(t, g.t + 1, g.t + 4)) }), _h("circle", { r: g.r * 0.1, strokeWidth: "2", ...dr(sg(t, g.t + 2, g.t + 4)) }))), _h("path", { d: "M1360 870 L1430 700", strokeWidth: "5", ...dr(sg(t, 21, 23)) }), _h("circle", { cx: "1430", cy: "690", r: "13", strokeWidth: "3", ...dr(sg(t, 22.5, 24)) }), _h("path", { d: `M760 795 C 690 650, 770 520, ${MC.x - 250} 470`, strokeWidth: "2.5", ...dr(sg(t, 22, 25)) }), _h("path", { d: `M1300 380 C 1330 450, 1290 520, ${MC.x + 285} 560`, strokeWidth: "2.5", ...dr(sg(t, 23, 26)) })), _h("g", { fill: INK, opacity: sg(t, 24, 27) }, Array.from({ length: 16 }, (_, i) => _h("circle", { key: i, cx: MC.x + Math.cos(i / 16 * 6.283) * 293, cy: MC.y + Math.sin(i / 16 * 6.283) * 293, r: "3.5" }))));
    }
    function ChargeFX({ T, A }) {
      const g = sg(T, A + 5, A + 28);
      if (g <= 0) return null;
      const dt = Math.max(0, T - A), t = T;
      const a1 = t * 0.25 + 4e-3 * dt * dt * dt, a2 = t * 0.18 + 55e-4 * dt * dt * dt;
      const sparks = [];
      for (let i = 0; i < 60; i++) {
        const per = 1.1 + hs(i) * 1.2, lt = fr(dt / per + hs(i + 50)), a = hs(i + 100) * 6.283;
        const d = 80 + lt * (160 + hs(i + 150) * 520) * (0.4 + g);
        const x = MC.x + Math.cos(a) * d, y = MC.y + Math.sin(a) * d + lt * lt * 90;
        sparks.push(_h("line", { key: i, x1: x, y1: y, x2: x - Math.cos(a) * 16, y2: y - Math.sin(a) * 16, stroke: hs(i + 7) > 0.5 ? "#bfeaff" : "#ffd9a0", strokeWidth: "2.5", strokeLinecap: "round", opacity: (1 - lt) * cl(g * 1.6 - 0.2, 0, 1) }));
      }
      return _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }, _h("defs", null, _h("radialGradient", { id: "cg" }, _h("stop", { offset: "0", stopColor: "#ffffff" }), _h("stop", { offset: ".25", stopColor: "#bfeaff" }), _h("stop", { offset: ".6", stopColor: "#4f7dff", stopOpacity: ".5" }), _h("stop", { offset: "1", stopColor: "#4f7dff", stopOpacity: "0" }))), _h("rect", { width: W, height: H, fill: "#16206e", opacity: g * 0.42, style: { mixBlendMode: "multiply" } }), _h("circle", { cx: MC.x, cy: MC.y, r: lp(60, 620, g * g), fill: "url(#cg)", opacity: g }), _h("g", { fill: "none", stroke: "#9fe2ff", strokeWidth: "4", opacity: g, style: { filter: "drop-shadow(0 0 10px #6fd0ff) drop-shadow(0 0 28px #3a6bff)" } }, _h("circle", { cx: MC.x, cy: MC.y, r: "300" }), _h("ellipse", { cx: MC.x, cy: MC.y, rx: "300", ry: Math.max(2, Math.abs(Math.cos(a1)) * 300) }), _h("ellipse", { cx: MC.x, cy: MC.y, rx: Math.max(2, Math.abs(Math.cos(a2)) * 268), ry: "268" }), _h("circle", { cx: MC.x, cy: MC.y, r: "72" })), sparks);
    }
    const GRID = (() => {
      const r = rng(11), cols = 6, rows = 4, P = [];
      for (let i = 0; i <= cols; i++) {
        P[i] = [];
        for (let j = 0; j <= rows; j++) {
          const x = i === 0 ? -40 : i === cols ? W + 40 : i * W / cols + (r() - 0.5) * 150;
          const y = j === 0 ? -40 : j === rows ? H + 40 : j * H / rows + (r() - 0.5) * 120;
          P[i][j] = [x, y];
        }
      }
      const cells = [];
      let d = "";
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const q = [P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]];
        const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
        const dx = cx - W / 2, dy = cy - H / 2, dd = Math.hypot(dx, dy) || 1;
        cells.push({ q, cx, cy, ux: dx / dd, uy: dy / dd, dn: dd / 1100, rot: (r() - 0.5) * 2 });
        d += "M" + q.map((p) => p[0].toFixed(0) + " " + p[1].toFixed(0)).join("L") + "Z";
      }
      return { cells, d };
    })();
    function Fragments({ T, S, A }) {
      const glow = sg(T, S + 0.3, S + 1.6) * (1 - sg(T, S + 2.5, S + 4.5));
      return _h(React.Fragment, null, GRID.cells.map((c, i) => {
        const st = S + 1.3 + c.dn * 2.4, p = sg(T, st, st + 4.5, Ez.easeInCubic);
        const o = 1 - sg(T, st + 2.4, st + 4.5);
        if (o <= 0) return null;
        return _h("div", { key: i, style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          clipPath: `polygon(${c.q.map((p2) => p2[0].toFixed(0) + "px " + p2[1].toFixed(0) + "px").join(",")})`,
          transformOrigin: `${c.cx}px ${c.cy}px`,
          opacity: o,
          transform: `translate(${c.ux * p * 1500}px,${c.uy * p * 1500}px) rotate(${c.rot * p * 120}deg) scale(${1 + p * 2})`,
          filter: `brightness(${lp(1.25, 0.6, p)}) hue-rotate(${p * 160}deg)`
        } }, _h(Paper, { t: S, A }));
      }), glow > 0 && _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }, _h("path", { d: GRID.d, fill: "none", stroke: "#d8f1ff", strokeWidth: "4", opacity: glow, style: { filter: "drop-shadow(0 0 8px #7fd0ff) drop-shadow(0 0 22px #6a5bff)" } })));
    }
    function Tunnel({ T, S }) {
      const lt = T - S, inten = sg(T, S + 1, S + 4) * (1 - sg(T, S + 15, S + 19));
      const streaks = [];
      for (let k = 0; k < 170; k++) {
        const th = hs(k) * 6.283, z = fr(lt * (0.3 + hs(k + 9) * 0.5) + hs(k + 3));
        const r1 = 30 + Math.pow(z, 2.6) * 1500, r2 = r1 * (1.08 + z * 0.6);
        const h = lp(195, 290, hs(k + 5));
        streaks.push(_h(
          "line",
          {
            key: k,
            x1: Math.cos(th) * r1,
            y1: Math.sin(th) * r1,
            x2: Math.cos(th) * r2,
            y2: Math.sin(th) * r2,
            stroke: `hsl(${h},95%,${62 + z * 28}%)`,
            strokeWidth: 0.6 + z * 3.4,
            strokeLinecap: "round",
            opacity: z * inten
          }
        ));
      }
      return _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0 } }, _h("defs", null, _h("radialGradient", { id: "tg" }, _h("stop", { offset: "0", stopColor: "#5a48d8" }), _h("stop", { offset: ".35", stopColor: "#1c1470" }), _h("stop", { offset: "1", stopColor: "#020210" })), _h("radialGradient", { id: "tc" }, _h("stop", { offset: "0", stopColor: "#fff" }), _h("stop", { offset: ".4", stopColor: "#bfe6ff", stopOpacity: ".7" }), _h("stop", { offset: "1", stopColor: "#7a6bff", stopOpacity: "0" }))), _h("rect", { width: W, height: H, fill: "url(#tg)", opacity: inten }), _h("g", { transform: `translate(${W / 2} ${H / 2}) rotate(${lt * 9})` }, streaks, _h("circle", { r: lp(40, 160, 0.5 + 0.5 * Math.sin(lt * 3)), fill: "url(#tc)", opacity: inten })));
    }
    const STARS = (() => {
      const r = rng(2100);
      return Array.from({ length: 420 }, () => ({ x: r() * 3400 - 750, y: r() * 1700 - 310, s: r() < 0.9 ? r() * 1.3 + 0.4 : r() * 2.2 + 1.4, a: r() * 0.6 + 0.4, t: r(), tw: r() * 6.28, c: r() < 0.15 ? "#cfd8ff" : r() < 0.1 ? "#ffe2c4" : "#ffffff" }));
    })();
    const CRACK = (() => {
      const r = rng(77), pts = [], a = [-170, -300], b = [190, 300], n = 16;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), px = -(b[1] - a[1]) / len, py = (b[0] - a[0]) / len;
      for (let i = 0; i <= n; i++) {
        const u = i / n, j = i === 0 || i === n ? 0 : (r() - 0.5) * 46;
        pts.push([lp(a[0], b[0], u) + px * j, lp(a[1], b[1], u) + py * j]);
      }
      const ext = [[-280, -500], ...pts, [310, 500]];
      const P = (p) => p.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L");
      return {
        pts,
        d: "M" + P(pts),
        dExt: "M" + P(ext),
        left: P(ext) + ` L-800 500 L-800 -500`,
        right: P(ext) + ` L800 500 L800 -500`
      };
    })();
    const TW = 1885;
    const LAND = (() => {
      const r = rng(5);
      return Array.from({ length: 9 }, (_, k) => {
        const cx = k * TW / 9 + r() * 120, cy = (r() - 0.5) * 380, rb = 60 + r() * 110, n = 13;
        let d = "";
        for (let i = 0; i < n; i++) {
          const a = i / n * 6.283, rr = rb * (0.55 + r() * 0.55);
          d += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr * 1.3) + " " + f1(cy + Math.sin(a) * rr);
        }
        return { d: d + "Z", light: r() > 0.5 };
      });
    })();
    const CLOUDS = (() => {
      const r = rng(9);
      return Array.from({ length: 14 }, () => ({ x: r() * TW, y: (r() - 0.5) * 480, rx: 50 + r() * 120, ry: 10 + r() * 22 }));
    })();
    const DEBRIS = (() => {
      const r = rng(31);
      return Array.from({ length: 120 }, () => {
        const u = r() * (CRACK.pts.length - 1), i = Math.floor(u), f = u - i, a = CRACK.pts[i], b = CRACK.pts[Math.min(i + 1, CRACK.pts.length - 1)];
        const side = r() < 0.5 ? -1 : 1, ang = Math.atan2(0.5, -0.866) + (side > 0 ? Math.PI : 0) + (r() - 0.5) * 1.9;
        const sz = 3 + Math.pow(r(), 2) * 22, n = 5 + Math.floor(r() * 3);
        let d = "";
        for (let k = 0; k < n; k++) {
          const aa = k / n * 6.283, rr = sz * (0.6 + r() * 0.5);
          d += (k ? "L" : "M") + f1(Math.cos(aa) * rr) + " " + f1(Math.sin(aa) * rr);
        }
        return { x: lp(a[0], b[0], f), y: lp(a[1], b[1], f), ang, v: 50 + r() * 330, t0: 1.4 + r() * 1.6, rs: (r() - 0.5) * 120, d: d + "Z" };
      });
    })();
    function EarthBody({ T, heat }) {
      const off = T * 22 % TW, coff = T * 30 % TW;
      return _h("g", null, _h("circle", { r: "300", fill: "url(#ocean)" }), _h("g", { clipPath: "url(#eclip)" }, [0, TW].map((o) => _h("g", { key: o, transform: `translate(${o - off - 940} 0)` }, LAND.map((l, i) => _h("path", { key: i, d: l.d, fill: l.light ? "#6f9a52" : "#3f7a46", stroke: "#2c5a34", strokeWidth: "1" })))), _h("ellipse", { cx: "0", cy: "-296", rx: "210", ry: "40", fill: "#eef6ff", opacity: ".85" }), _h("ellipse", { cx: "0", cy: "300", rx: "190", ry: "38", fill: "#eef6ff", opacity: ".8" }), [0, TW].map((o) => _h("g", { key: o, transform: `translate(${o - coff - 940} 0)` }, CLOUDS.map((c, i) => _h("ellipse", { key: i, cx: c.x, cy: c.y, rx: c.rx, ry: c.ry, fill: "#fff", opacity: ".38" }))))), _h("circle", { r: "300", fill: "url(#eshade)" }), _h("circle", { r: "300", fill: "#ff3a10", opacity: heat * 0.28 }));
    }
    function Boom({ x, y, p, R }) {
      if (p <= 0 || p >= 1) return null;
      const e = 1 - Math.pow(1 - p, 3);
      return _h("g", null, _h("circle", { cx: x, cy: y, r: R * e, fill: "url(#boom)", opacity: 1 - p }), _h("circle", { cx: x, cy: y, r: R * 1.35 * e, fill: "none", stroke: "#ffd8a8", strokeWidth: 3 * (1 - p) + 0.5, opacity: (1 - p) * 0.8 }), _h("circle", { cx: x, cy: y, r: R * 0.38 * (1 - p), fill: "#fff", opacity: 1 - p }));
    }
    function Earth({ T, C }) {
      const Ec = C.Erde, Sp = C.Spaltung;
      const p = sg(T, Ec, Ec + 18, Ez.easeOutCubic);
      const cx = lp(1650, 960, p), cy = lp(1360, 540, p), sc = lp(0.32, 1, p);
      const crackP = sg(T, Ec + 20, Ec + 32), heat = sg(T, Ec + 26, Ec + 40);
      const split = T >= Sp;
      const tr = heat * (split ? 0 : 1) * 4;
      const shx = Math.sin(T * 41) * tr, shy = Math.cos(T * 37) * tr;
      const sep = sg(T, Sp + 1.5, Sp + 30, Ez.easeOutCubic), drift = Math.max(0, T - Sp - 30) * 3;
      const D = sep * 390 + drift;
      const L = `translate(${-0.866 * D} ${0.5 * D}) rotate(${-16 * sep - drift * 0.02})`;
      const Rr = `translate(${0.866 * D} ${-0.5 * D}) rotate(${13 * sep + drift * 0.02})`;
      const cool = sg(T, Sp + 4, Sp + 40);
      const magma = _h(React.Fragment, null, _h("path", { d: CRACK.dExt, fill: "none", stroke: "#ff5a14", strokeWidth: lp(16, 6, cool), opacity: lp(1, 0.55, cool), style: { filter: "blur(4px)" } }), _h("path", { d: CRACK.dExt, fill: "none", stroke: cool > 0.7 ? "#c2401a" : "#ffd36b", strokeWidth: "3", opacity: lp(1, 0.6, cool) }));
      const coreR = 170 * sg(T, Sp + 1, Sp + 5, Ez.easeOutCubic);
      const sw = sg(T, Sp + 1.5, Sp + 14, Ez.easeOutCubic);
      return _h("g", { transform: `translate(${cx + shx} ${cy + shy}) scale(${sc})`, opacity: sg(T, Ec, Ec + 4) }, _h("circle", { r: "345", fill: "url(#atmo)", opacity: 1 - sg(T, Sp + 1, Sp + 4) }), !split && _h(React.Fragment, null, _h(EarthBody, { T, heat }), _h("path", { d: CRACK.d, fill: "none", stroke: "#ff6a1a", strokeWidth: 4 + heat * 10, ...dr(crackP), style: { filter: "blur(5px)" }, opacity: 0.5 + 0.5 * Math.sin(T * 6) * heat + 0.3 }), _h("path", { d: CRACK.d, fill: "none", stroke: "#ffe08a", strokeWidth: 1.5 + heat * 2.5, ...dr(crackP) }), Array.from({ length: 18 }, (_, i) => {
        const q = CRACK.pts[1 + i % 15], lt = fr(T * 0.6 + hs(i)), a = hs(i + 3) * 6.283;
        return _h("circle", { key: i, cx: q[0] + Math.cos(a) * lt * 40, cy: q[1] + Math.sin(a) * lt * 40, r: 2.5 * (1 - lt), fill: "#ffb347", opacity: heat * (1 - lt) });
      })), split && _h(React.Fragment, null, _h("circle", { r: coreR * 3.2, fill: "url(#core)", opacity: (1 - sg(T, Sp + 6, Sp + 34)) * 0.55 }), _h("circle", { r: coreR, fill: "url(#core)", opacity: 1 - 0.75 * sg(T, Sp + 8, Sp + 34) }), _h("g", { transform: L }, _h("g", { clipPath: "url(#hL)" }, _h(EarthBody, { T, heat: 1 - cool * 0.7 }), _h("g", { clipPath: "url(#eclip)" }, magma))), _h("g", { transform: Rr }, _h("g", { clipPath: "url(#hR)" }, _h(EarthBody, { T, heat: 1 - cool * 0.7 }), _h("g", { clipPath: "url(#eclip)" }, magma))), DEBRIS.map((d, i) => {
        const dt = T - Sp - d.t0;
        if (dt <= 0) return null;
        const dist = d.v * 5 * (1 - Math.exp(-dt / 5));
        return _h(
          "path",
          {
            key: i,
            d: d.d,
            transform: `translate(${d.x + Math.cos(d.ang) * dist} ${d.y + Math.sin(d.ang) * dist}) rotate(${d.rs * dt})`,
            fill: "#2b211d",
            stroke: "#ff8a3a",
            strokeOpacity: 1 - sg(dt, 2, 14),
            strokeWidth: "1.5"
          }
        );
      }), sw > 0 && sw < 1 && _h(React.Fragment, null, _h("circle", { r: lp(300, 2600, sw), fill: "none", stroke: "#ffd2a0", strokeWidth: 30 * (1 - sw) + 2, opacity: 1 - sw }), _h("ellipse", { rx: lp(300, 3e3, sw), ry: lp(60, 520, sw), transform: "rotate(-28)", fill: "none", stroke: "#ff9a4a", strokeWidth: 18 * (1 - sw) + 2, opacity: (1 - sw) * 0.9 }))));
    }
    const HS = [[330, 330, 1], [540, 620, 1.45], [260, 840, 0.9], [720, 400, 0.8], [660, 910, 0.7], [140, 560, 1.1]];
    const AS = [[1350, 390, 1.1], [1580, 660, 1.35], [1240, 830, 0.9], [1720, 320, 0.8], [1460, 960, 0.75], [1790, 890, 1], [1130, 560, 0.7]];
    const shipPos = (side, i, T) => {
      const a = side ? AS : HS, [x, y, s] = a[i];
      return [x + Math.sin(T * 0.3 + i * 1.7 + side) * 16, y + Math.cos(T * 0.23 + i * 2.1 + side) * 12, s];
    };
    const SHOTS = (() => {
      const r = rng(404), out = [];
      for (let tau = -2; tau < 122; tau += 0.055) {
        const side = r() < 0.5 ? 0 : 1;
        out.push({ tau, side, from: Math.floor(r() * (side ? AS.length : HS.length)), to: Math.floor(r() * (side ? HS.length : AS.length)), dur: 0.45 + r() * 0.35, ox: (r() - 0.5) * 70, oy: (r() - 0.5) * 36, q: r(), R: 18 + r() * 22 });
      }
      return out;
    })();
    const FIG = Array.from({ length: 30 }, (_, i) => ({ side: i % 2, A: 300 + hs(i) * 380, B: 170 + hs(i + 7) * 240, w: 0.35 + hs(i + 3) * 0.45, w2: 0.5 + hs(i + 11) * 0.5, p: hs(i + 5) * 6.28, p2: hs(i + 9) * 6.28, cx: 940 + (hs(i + 13) - 0.5) * 360, cy: 580 + (hs(i + 17) - 0.5) * 220 }));
    function HumanShip({ x, y, s, rot, fade }) {
      return _h("g", { transform: `translate(${x} ${y}) rotate(${rot || 0}) scale(${s})`, opacity: fade == null ? 1 : fade }, _h("ellipse", { cx: "-112", cy: "0", rx: "34", ry: "13", fill: "url(#eng)" }), _h("path", { d: "M115 0 L45 -22 L-55 -32 L-100 -19 L-100 19 L-55 32 L45 22 Z", fill: "url(#hull)", stroke: "#e6eef6", strokeWidth: "1" }), _h("path", { d: "M62 -7 L-48 -14 L-48 14 L62 7 Z", fill: "#3e4a58" }), _h("rect", { x: "-30", y: "-44", width: "44", height: "14", rx: "3", fill: "#8996a6", stroke: "#dfe7f0", strokeWidth: ".8" }), [-36, -12, 12, 36].map((px) => _h("circle", { key: px, cx: px, cy: "0", r: "2.2", fill: "#9fe6ff" })));
    }
    function AlienShip({ x, y, s, T, i, fade }) {
      return _h("g", { transform: `translate(${x} ${y}) scale(${s})`, opacity: fade == null ? 1 : fade }, _h("path", { d: "M-95 0 C-60 -66 40 -76 95 -32 C55 -22 34 -10 22 0 C34 10 55 22 95 32 C40 76 -60 66 -95 0Z", fill: "url(#alien)", stroke: "#b06cff", strokeWidth: "1.4" }), _h("path", { d: "M-60 -20 L-90 -50 M-50 -30 L-62 -70 M-60 20 L-90 50 M-50 30 L-62 70", stroke: "#6b3fa8", strokeWidth: "3", strokeLinecap: "round" }), _h("circle", { cx: "-42", cy: "0", r: 9 + Math.sin(T * 3 + i) * 2.5, fill: "#8dff8a", style: { filter: "drop-shadow(0 0 8px #6bff7a)" } }), _h("circle", { cx: "10", cy: "-26", r: "3", fill: "#8dff8a" }), _h("circle", { cx: "10", cy: "26", r: "3", fill: "#8dff8a" }));
    }
    function Broken({ children, dt }) {
      return _h(React.Fragment, null, _h("g", { transform: `translate(${-dt * 6} ${-dt * 12}) rotate(${-dt * 5})` }, _h("g", { clipPath: "url(#topHalf)" }, children)), _h("g", { transform: `translate(${dt * 8} ${dt * 10}) rotate(${dt * 4})` }, _h("g", { clipPath: "url(#botHalf)" }, children)));
    }
    function Battle({ T, C }) {
      const U = C.Umsehen, K = C.Krieg, N = C["Neue Seite"];
      const deadH = K + 29.8, deadA = K + 40.3;
      const inten = 0.55 + 0.45 * sg(T, K - 3, K + 3) - 0.6 * sg(T, N + 14, N + 30);
      const alive = (side, i) => !(side === 0 && i === 1 && T > deadH || side === 1 && i === 1 && T > deadA);
      const els = [];
      const mA = sg(T, K + 12, K + 18, Ez.easeOutCubic), charge = sg(T, K + 22, K + 27) * (1 - sg(T, K + 30, K + 31.5));
      const mx = 1480, my = 160 + Math.sin(T * 0.2) * 8;
      const warp = sg(T, K + 10, K + 12.5) * (1 - sg(T, K + 12.5, K + 14));
      if (warp > 0) els.push(_h("g", { key: "warp", opacity: warp }, Array.from({ length: 14 }, (_, i) => _h("line", { key: i, x1: mx - 900 * (1 - warp) - 200, y1: my - 90 + i * 14, x2: mx + 900 * (1 - warp) + 200, y2: my - 90 + i * 14, stroke: "#c9b4ff", strokeWidth: "2" }))));
      if (mA > 0) els.push(
        _h("g", { key: "mother", transform: `translate(${mx} ${my}) scale(${lp(0.82, 1, mA)})`, opacity: mA }, _h("ellipse", { rx: "580", ry: "115", fill: "url(#mgrad)", stroke: "#b48cff", strokeWidth: "2", style: { filter: "drop-shadow(0 0 18px rgba(150,100,255,.45))" } }), _h("ellipse", { cy: "-46", rx: "210", ry: "72", fill: "#22143e", stroke: "#9d7bff", strokeWidth: "1.5" }), _h("ellipse", { cy: "22", rx: "480", ry: "42", fill: "none", stroke: "#5a3a90", strokeWidth: "2" }), Array.from({ length: 15 }, (_, i) => {
          const u = i / 14 - 0.5;
          return _h("circle", { key: i, cx: u * 860, cy: 66 - u * u * 120, r: "5", fill: "#8dff8a", opacity: 0.4 + 0.6 * fr(T * 0.8 + i * 0.13) });
        }), _h("circle", { cy: "100", r: 20 + charge * 70, fill: "url(#mcharge)", opacity: charge + 0.15 }))
      );
      HS.forEach((_, i) => {
        const [x, y, s] = shipPos(0, i, T);
        if (i === 1 && T > deadH) {
          const dt = T - deadH;
          els.push(_h("g", { key: "h" + i, transform: `translate(${x} ${y})`, opacity: 1 - sg(dt, 8, 30) }, _h(Broken, { dt }, _h(HumanShip, { x: 0, y: 0, s }))));
        } else els.push(_h(HumanShip, { key: "h" + i, x, y, s }));
      });
      AS.forEach((_, i) => {
        const [x, y, s] = shipPos(1, i, T);
        if (i === 1 && T > deadA) {
          const dt = T - deadA;
          els.push(_h("g", { key: "a" + i, transform: `translate(${x} ${y})`, opacity: 1 - sg(dt, 8, 30) }, _h(Broken, { dt }, _h(AlienShip, { x: 0, y: 0, s, T, i }))));
        } else els.push(_h(AlienShip, { key: "a" + i, x, y, s, T, i }));
      });
      FIG.forEach((f, i) => {
        const a = f.w * T + f.p, b = f.w2 * T + f.p2;
        const x = f.cx + f.A * Math.sin(a), y = f.cy + f.B * Math.sin(b);
        const rot = Math.atan2(f.B * f.w2 * Math.cos(b), f.A * f.w * Math.cos(a)) * 180 / Math.PI;
        const fire = fr(T * 0.7 + f.p) < 0.1;
        els.push(_h("g", { key: "f" + i, transform: `translate(${x} ${y}) rotate(${rot})` }, f.side ? _h("path", { d: "M9 0 L0 -6 L-8 0 L0 6Z", fill: "#2b1a44", stroke: "#8dff8a", strokeWidth: "1.2" }) : _h(React.Fragment, null, _h("circle", { cx: "-8", cy: "0", r: "3", fill: "#7fd8ff" }), _h("path", { d: "M11 0 L-7 -6 L-4 0 L-7 6Z", fill: "#e8f2ff" })), fire && _h("line", { x1: "16", y1: "0", x2: "56", y2: "0", stroke: f.side ? "#9dff6a" : "#6fd3ff", strokeWidth: "2" })));
      });
      SHOTS.forEach((s, k) => {
        const t0 = U + s.tau, f = (T - t0) / s.dur;
        if (f < 0 || f > 1 + 0.7 / s.dur || s.q > inten || !alive(s.side, s.from) || !alive(1 - s.side, s.to) || t0 > T) return;
        if (T - t0 > 2) return;
        const [sx, sy] = shipPos(s.side, s.from, t0), [tx0, ty0] = shipPos(1 - s.side, s.to, T);
        const tx = tx0 + s.ox, ty = ty0 + s.oy, col = s.side ? "#9dff6a" : "#6fd3ff";
        if (f <= 1) {
          const hx = lp(sx, tx, f), hy = lp(sy, ty, f), bx = lp(sx, tx, Math.max(0, f - 0.16)), by = lp(sy, ty, Math.max(0, f - 0.16));
          els.push(_h("g", { key: "s" + k }, _h("line", { x1: bx, y1: by, x2: hx, y2: hy, stroke: col, strokeWidth: "8", opacity: ".25", strokeLinecap: "round" }), _h("line", { x1: bx, y1: by, x2: hx, y2: hy, stroke: "#fff", strokeWidth: "2.2", strokeLinecap: "round" })));
        } else els.push(_h(Boom, { key: "b" + k, x: tx, y: ty, p: (f - 1) * s.dur / 0.7, R: s.R }));
      });
      const beam = sg(T, K + 27, K + 27.4) * (1 - sg(T, K + 30, K + 30.6));
      if (beam > 0) {
        const [hx, hy] = shipPos(0, 1, T), fl = 0.8 + 0.2 * Math.sin(T * 60);
        els.push(_h("g", { key: "beam", opacity: beam * fl }, _h("line", { x1: mx, y1: my + 100, x2: hx, y2: hy, stroke: "#7dff8a", strokeWidth: "60", opacity: ".35", strokeLinecap: "round" }), _h("line", { x1: mx, y1: my + 100, x2: hx, y2: hy, stroke: "#d8ffd8", strokeWidth: "16", strokeLinecap: "round" })));
      }
      {
        const [hx, hy] = shipPos(0, 1, T);
        els.push(_h(Boom, { key: "bigH", x: hx, y: hy, p: sg(T, K + 29.5, K + 34), R: 300 }));
      }
      [0, 3, 5, 2, 0, 3, 5, 2, 0, 3, 5, 2].forEach((src, i) => {
        const t0 = K + 34 + i * 0.35, f = sg(T, t0, t0 + 5.6 - i * 0.35);
        if (T < t0 || f >= 1) return;
        const [sx, sy] = shipPos(0, src, t0), [tx, ty] = shipPos(1, 1, T);
        const cx = (sx + tx) / 2, cy = sy - 320 + hs(i) * 640;
        const P = (u) => [(1 - u) * (1 - u) * sx + 2 * u * (1 - u) * cx + u * u * tx, (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * cy + u * u * ty];
        const pts = [0, 0.03, 0.06, 0.09, 0.12].map((d) => P(Math.max(0, f - d)));
        els.push(_h("g", { key: "m" + i }, _h("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#ffd9a0", strokeWidth: "3", opacity: ".7" }), _h("circle", { cx: pts[0][0], cy: pts[0][1], r: "4", fill: "#fff" })));
      });
      {
        const [ax, ay] = shipPos(1, 1, T);
        els.push(_h(Boom, { key: "bigA", x: ax, y: ay, p: sg(T, K + 40, K + 44.5), R: 320 }));
      }
      const fb1 = sg(T, K + 7, K + 10.5, Ez.easeInOutSine), fb2 = sg(T, K + 18, K + 21.5, Ez.easeInOutSine);
      if (fb1 > 0 && fb1 < 1) els.push(_h("g", { key: "fb1", style: { filter: "blur(2.5px) brightness(.55)" } }, _h(HumanShip, { x: lp(-700, 2600, fb1), y: lp(1250, -250, fb1), s: 3.4, rot: -24 })));
      if (fb2 > 0 && fb2 < 1) els.push(_h("g", { key: "fb2", style: { filter: "blur(2.5px) brightness(.6)" } }, _h(AlienShip, { x: lp(2700, -800, fb2), y: lp(950, 150, fb2), s: 3, T, i: 9 })));
      return els;
    }
    const SHIP_DEFS = () => _h("defs", null, _h("linearGradient", { id: "hull", x1: "0", y1: "0", x2: "0", y2: "1" }, _h("stop", { offset: "0", stopColor: "#d6dee8" }), _h("stop", { offset: ".55", stopColor: "#97a3b2" }), _h("stop", { offset: "1", stopColor: "#5b6676" })), _h("radialGradient", { id: "eng" }, _h("stop", { offset: "0", stopColor: "#fff" }), _h("stop", { offset: ".4", stopColor: "#7fd8ff" }), _h("stop", { offset: "1", stopColor: "#2f6bff", stopOpacity: "0" })), _h("linearGradient", { id: "alien", x1: "0", y1: "0", x2: "1", y2: "1" }, _h("stop", { offset: "0", stopColor: "#4a2a78" }), _h("stop", { offset: "1", stopColor: "#170c28" })), _h("linearGradient", { id: "mgrad", x1: "0", y1: "0", x2: "0", y2: "1" }, _h("stop", { offset: "0", stopColor: "#3a2462" }), _h("stop", { offset: ".6", stopColor: "#1c1032" }), _h("stop", { offset: "1", stopColor: "#0c0718" })), _h("radialGradient", { id: "mcharge" }, _h("stop", { offset: "0", stopColor: "#fff" }), _h("stop", { offset: ".35", stopColor: "#9dff9a" }), _h("stop", { offset: "1", stopColor: "#3aff6a", stopOpacity: "0" })), _h("radialGradient", { id: "boom" }, _h("stop", { offset: "0", stopColor: "#fff" }), _h("stop", { offset: ".25", stopColor: "#ffe08a" }), _h("stop", { offset: ".6", stopColor: "#ff6a1a", stopOpacity: ".8" }), _h("stop", { offset: "1", stopColor: "#ff3a00", stopOpacity: "0" })), _h("clipPath", { id: "topHalf" }, _h("rect", { x: "-400", y: "-400", width: "800", height: "400" })), _h("clipPath", { id: "botHalf" }, _h("rect", { x: "-400", y: "0", width: "800", height: "400" })));
    const EARTH_DEFS = () => _h("defs", null, _h("radialGradient", { id: "ocean", cx: "40%", cy: "38%", r: "70%" }, _h("stop", { offset: "0", stopColor: "#3d8fd6" }), _h("stop", { offset: ".6", stopColor: "#144a8a" }), _h("stop", { offset: "1", stopColor: "#071a3a" })), _h("radialGradient", { id: "eshade", cx: "36%", cy: "34%", r: "72%" }, _h("stop", { offset: "0", stopColor: "#fff", stopOpacity: ".14" }), _h("stop", { offset: ".45", stopColor: "#000", stopOpacity: "0" }), _h("stop", { offset: ".8", stopColor: "#000014", stopOpacity: ".6" }), _h("stop", { offset: "1", stopColor: "#00000a", stopOpacity: ".94" })), _h("radialGradient", { id: "atmo" }, _h("stop", { offset: ".84", stopColor: "#6ab4ff", stopOpacity: "0" }), _h("stop", { offset: ".88", stopColor: "#7ec0ff", stopOpacity: ".55" }), _h("stop", { offset: "1", stopColor: "#3a7bff", stopOpacity: "0" })), _h("radialGradient", { id: "core" }, _h("stop", { offset: "0", stopColor: "#fff" }), _h("stop", { offset: ".3", stopColor: "#ffe28a" }), _h("stop", { offset: ".65", stopColor: "#ff6a1a", stopOpacity: ".75" }), _h("stop", { offset: "1", stopColor: "#ff3a00", stopOpacity: "0" })), _h("clipPath", { id: "eclip" }, _h("circle", { r: "300" })), _h("clipPath", { id: "hL" }, _h("path", { d: "M" + CRACK.left + "Z" })), _h("clipPath", { id: "hR" }, _h("path", { d: "M" + CRACK.right + "Z" })));
    function Space({ T, C }) {
      const St = C.Stille, U = C.Umsehen, N = C["Neue Seite"];
      const camX = -1700 * sg(T, U, U + 20, Ez.easeInOutCubic) + 450 * sg(T, N, N + 20, Ez.easeInOutCubic);
      const zoom = 1 - 0.4 * sg(T, N, N + 20, Ez.easeInOutCubic);
      const sz = 1 - (1 - zoom) * 0.25;
      const comet = sg(T, St + 17, St + 25);
      return _h(React.Fragment, null, _h("div", { style: {
        position: "absolute",
        left: -400,
        top: -200,
        width: W + 800,
        height: H + 400,
        opacity: sg(T, St + 8, St + 24) * 0.9,
        transform: `translateX(${camX * 0.08}px)`,
        background: "radial-gradient(40% 35% at 30% 40%, rgba(90,60,200,.35), transparent 70%), radial-gradient(35% 30% at 75% 60%, rgba(30,140,180,.25), transparent 70%), radial-gradient(30% 25% at 85% 20%, rgba(170,60,160,.2), transparent 70%)"
      } }), _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translate(${W / 2}px,${H / 2}px) scale(${sz}) translate(${-W / 2 + camX * 0.2}px,${-H / 2}px)` } }, STARS.map((s, i) => {
        const o = s.a * sg(T, St + 1 + s.t * 24, St + 3 + s.t * 24) * (0.75 + 0.25 * Math.sin(T * 1.3 + s.tw));
        return o > 0 ? _h("circle", { key: i, cx: s.x, cy: s.y, r: s.s, fill: s.c, opacity: o }) : null;
      }), comet > 0 && comet < 1 && _h("g", { opacity: Math.sin(comet * Math.PI) }, _h("line", { x1: lp(1750, 250, comet), y1: lp(140, 480, comet), x2: lp(1750, 250, comet) + 220, y2: lp(140, 480, comet) - 50, stroke: "url(#ctail)", strokeWidth: "3" }), _h("circle", { cx: lp(1750, 250, comet), cy: lp(140, 480, comet), r: "3.5", fill: "#fff" })), _h("defs", null, _h("linearGradient", { id: "ctail", x1: "0", y1: "0", x2: "1", y2: "0" }, _h("stop", { offset: "0", stopColor: "#dff3ff" }), _h("stop", { offset: "1", stopColor: "#dff3ff", stopOpacity: "0" })))), _h("div", { style: { position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "960px 540px", transform: `scale(${zoom})` } }, T > C.Erde && _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translateX(${camX}px)` } }, EARTH_DEFS(), _h(Earth, { T, C })), T > U - 1 && _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible", transform: `translateX(${camX + 1700}px)` } }, SHIP_DEFS(), Battle({ T, C }))));
    }
    const glass = { position: "absolute", background: "rgba(12,16,42,.62)", border: "1px solid rgba(150,190,255,.28)", borderRadius: 14, boxShadow: "0 0 0 1px rgba(120,90,255,.08), 0 0 40px rgba(80,120,255,.12), inset 0 1px 0 rgba(255,255,255,.06)", backdropFilter: "blur(10px)", overflow: "hidden", boxSizing: "border-box" };
    const tbar = (w, o) => _h("div", { style: { width: w, height: 10, borderRadius: 5, background: `rgba(180,205,255,${o || 0.32})` } });
    const avatar = (src, s) => _h("div", { style: { width: s, height: s, borderRadius: "50%", flex: "none", padding: 2, background: "linear-gradient(135deg,#7fe0ff,#a98bff)", boxShadow: "0 0 16px rgba(127,224,255,.45)" } }, _h("img", { src, style: { width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", display: "block", background: "#0b1030" } }));
    function UI({ T, N }) {
      const fl = (p) => p >= 1 ? 1 : p * (0.65 + 0.35 * Math.sin(T * 47));
      const sb = sg(T, N + 12, N + 17, Ez.easeOutCubic), tb = sg(T, N + 13.5, N + 18.5, Ez.easeOutCubic);
      const cs = [N + 16, N + 18, N + 20].map((t0) => sg(T, t0, t0 + 5, Ez.easeOutBack));
      const scan = sg(T, N + 22, N + 26.5, Ez.easeInOutSine);
      return _h(React.Fragment, null, _h("div", { style: { ...glass, left: 24, top: 24, bottom: 24, width: 96, transform: `translateX(${-160 * (1 - sb)}px)`, opacity: fl(sb), display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 0", gap: 26 } }, _h("div", { style: { position: "relative", width: 52, height: 52 } }, _h("div", { style: { position: "absolute", inset: 8, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#bfeaff,#3a6bff 60%,#1a1060)", boxShadow: "0 0 18px rgba(90,160,255,.7)" } }), _h("div", { style: { position: "absolute", left: -6, right: -6, top: 20, height: 12, borderRadius: "50%", border: "2px solid #a98bff", transform: `rotate(${-20 + Math.sin(T * 0.5) * 6}deg)` } })), [0, 1, 2, 3, 4].map((i) => _h("div", { key: i, style: { width: 44, height: 44, borderRadius: 12, border: `1px solid ${i === 0 ? "#7fe0ff" : "rgba(150,190,255,.3)"}`, background: i === 0 ? "rgba(127,224,255,.12)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } }, _h("div", { style: { width: 14, height: 14, borderRadius: i % 2 ? 4 : "50%", border: "2px solid rgba(190,215,255,.8)" } }))), _h("div", { style: { flex: 1 } }), avatar(AV[0], 52)), _h("div", { style: { ...glass, left: 144, right: 24, top: 24, height: 76, transform: `translateY(${-130 * (1 - tb)}px)`, opacity: fl(tb), display: "flex", alignItems: "center", padding: "0 28px", gap: 34 } }, tbar(120, 0.55), tbar(90), tbar(110), tbar(80), _h("div", { style: { flex: 1 } }), _h("div", { style: { width: 260, height: 38, borderRadius: 19, border: "1px solid rgba(150,190,255,.35)", background: "rgba(255,255,255,.03)", display: "flex", alignItems: "center", padding: "0 14px", gap: 10, boxSizing: "border-box" } }, _h("div", { style: { width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(190,215,255,.7)" } }), tbar(120, 0.2)), avatar(AV[1], 40)), _h("div", { style: { ...glass, right: 24, top: 124, width: 400, height: 300, transform: `translateX(${480 * (1 - cs[0])}px)`, opacity: fl(cl(cs[0], 0, 1)), padding: 26, display: "flex", flexDirection: "column", gap: 18 } }, _h("div", { style: { display: "flex", gap: 16, alignItems: "center" } }, avatar(AV[1], 64), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, tbar(160, 0.55), tbar(100, 0.25))), tbar(330), tbar(300), tbar(250), _h("div", { style: { display: "flex", gap: 10, marginTop: "auto" } }, _h("div", { style: { height: 34, width: 120, borderRadius: 17, background: "linear-gradient(90deg,#4f8dff,#a98bff)", boxShadow: "0 0 18px rgba(120,140,255,.5)" } }), _h("div", { style: { height: 34, width: 90, borderRadius: 17, border: "1px solid rgba(150,190,255,.4)" } }))), _h("div", { style: { ...glass, right: 24, top: 444, width: 400, height: 290, transform: `translateX(${480 * (1 - cs[1])}px)`, opacity: fl(cl(cs[1], 0, 1)), display: "flex", flexDirection: "column" } }, _h("div", { style: { height: 160, position: "relative", overflow: "hidden" } }, _h("img", { src: LOG, style: { width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) brightness(.75) contrast(1.15)" } }), _h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(135deg,rgba(60,90,255,.55),rgba(170,90,255,.35))", mixBlendMode: "color" } }), _h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 50%,rgba(12,16,42,.9))" } })), _h("div", { style: { padding: "18px 26px", display: "flex", flexDirection: "column", gap: 14 } }, tbar(200, 0.55), tbar(320), tbar(270))), _h("div", { style: { ...glass, right: 24, top: 754, width: 400, bottom: 24, transform: `translateX(${480 * (1 - cs[2])}px)`, opacity: fl(cl(cs[2], 0, 1)), padding: 26, display: "flex", flexDirection: "column", gap: 16 } }, _h("div", { style: { display: "flex", gap: 14, alignItems: "center" } }, avatar(AV[2], 52), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, tbar(140, 0.55), tbar(90, 0.25))), _h("div", { style: { height: 8, borderRadius: 4, background: "rgba(150,190,255,.15)", overflow: "hidden" } }, _h("div", { style: { height: "100%", width: `${40 + 40 * sg(T, N + 22, N + 34, Ez.easeOutCubic)}%`, background: "linear-gradient(90deg,#7fe0ff,#a98bff)", boxShadow: "0 0 12px #7fe0ff" } })), tbar(300), tbar(220)), scan > 0 && scan < 1 && _h("div", { style: { position: "absolute", left: 0, right: 0, top: scan * H, height: 2, background: "#9fe8ff", boxShadow: "0 0 18px 4px rgba(127,224,255,.55)", opacity: 0.7 * Math.sin(scan * Math.PI) } }));
    }
    function Piece({ T, ruhig }) {
      const C = CUES;
      const A = C.Aufladen, S = C.Sprung, Sp = C.Spaltung, N = C["Neue Seite"];
      const ruck = ruhig ? 0 : 1;
      const shk = Math.pow(sg(T, A + 10, A + 30), 2) * 14 * ruck;
      const sx = (Math.sin(T * 53) + Math.sin(T * 31.7)) * 0.5 * shk, sy = (Math.cos(T * 47) + Math.sin(T * 29.3)) * 0.5 * shk;
      const flash1 = sg(T, A + 25, A + 30, Ez.easeInCubic) * (1 - sg(T, S, S + 3));
      const flash2 = sg(T, S + 16.5, S + 18.5) * (1 - sg(T, S + 18.5, S + 21));
      const flash3 = sg(T, Sp + 0.8, Sp + 1.6) * (1 - sg(T, Sp + 1.6, Sp + 5.5));
      const quake = (Sp <= T ? Math.max(0, 1 - (T - Sp - 1.5) / 6) * 12 * (T > Sp + 1.5 ? 1 : 0) : 0) * ruck;
      const qx = Math.sin(T * 61) * quake, qy = Math.cos(T * 53) * quake;
      return _h("div", { style: { position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden", background: "#000" } }, _h("div", { style: { position: "absolute", inset: 0, transform: `translate(${qx}px,${qy}px)` } }, T > S + 14 && _h(Space, { T, C })), T >= S && T < S + 21 && _h(Tunnel, { T, S }), T < S && _h("div", { style: { position: "absolute", inset: 0, transform: `translate(${sx}px,${sy}px) rotate(${sx * 0.05}deg) scale(${1 + shk * 2e-3})` } }, _h(Paper, { t: T, A }), _h(ChargeFX, { T, A })), T >= S && T < S + 10 && _h(Fragments, { T, S, A }), T > N + 11 && _h(UI, { T, N }), _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55))", opacity: T > S ? 1 : 0.5 } }), flash1 + flash2 + flash3 > 0 && _h("div", { style: { position: "absolute", inset: 0, background: flash3 > 0 ? "#fff4e0" : "#f4fbff", opacity: Math.min(1, flash1 + flash2 + flash3) } }));
    }
    return Piece;
  }

  /* ------------------------------------------------------
     BUEHNE UND ABLAUF
  ------------------------------------------------------ */
  let lauf = null;              // { wurzel, buehne, film, t0, ab, uhr, letzt }

  function einpassen() {
    if (!lauf) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    lauf.buehne.style.transform = "translate(-50%, -50%) scale(" + s + ")";
    lauf.wurzel.classList.toggle("ist-hochkant", window.innerHeight > window.innerWidth * 1.1);
  }

  function bild(jetzt) {
    if (!lauf) return;
    lauf.uhr = requestAnimationFrame(bild);
    if (jetzt - lauf.letzt < 32) return;   // hoechstens ~30 Bilder/s
    lauf.letzt = jetzt;
    const T = Math.min(DAUER, (jetzt - lauf.t0) / 1000 + lauf.ab);
    zeichnen(lauf.buehne, [lauf.film({ T: T, ruhig: RUHIG.matches })], false);
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  /* Der Film deckt alles ab - die WebGL-Flaechen der Seite halten so
     lange an (wie beim Riss). */
  function vollbild(an) {
    window.fhVollbildAn = an;
    document.dispatchEvent(new CustomEvent("fh:vollbild", { detail: { an: an } }));
  }

  function start(opts) {
    weg();
    opts = opts || {};
    const wurzel = document.createElement("div");
    wurzel.id = "fh-zeit";
    wurzel.className = "fh-riss";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("zeit.aria", "Live-Story: Zeitmaschine 2100"));
    const buehne = document.createElement("div");
    buehne.className = "fh-riss-buehne";
    buehne.setAttribute("aria-hidden", "true");
    const hinweis = document.createElement("p");
    hinweis.className = "fh-riss-hinweis";
    hinweis.textContent = t("riss.rotate", "Tipp: Handy quer halten");
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "fh-riss-weiter";
    knopf.textContent = t("riss.skip", "Überspringen");
    knopf.addEventListener("click", weg);
    wurzel.append(buehne, hinweis, knopf);
    document.body.appendChild(wurzel);
    lauf = { wurzel: wurzel, buehne: buehne, film: baueFilm(), t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), uhr: 0, letzt: 0 };
    einpassen();
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    lauf.uhr = requestAnimationFrame(bild);
    vollbild(true);
  }

  /* Story vorbei: das letzte Bild blendet kurz aus. */
  function ende() {
    if (!lauf) return;
    const l = lauf;
    l.wurzel.classList.add("ist-aus");
    setTimeout(function () { if (lauf === l) weg(); }, 1200);
  }

  function weg() {
    if (!lauf) return;
    cancelAnimationFrame(lauf.uhr);
    window.removeEventListener("resize", einpassen);
    document.removeEventListener("keydown", taste);
    lauf.wurzel.remove();
    lauf = null;
    vollbild(false);
  }

  window.fhZeitFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    DAUER: DAUER,
  };
})();
