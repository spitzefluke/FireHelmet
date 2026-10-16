/* ======================================================
   LIVE-STORY "HUNDERT ATOMBOMBEN GEGEN EINE MUECKE" (Migration 51)
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Film 100 Nukes"
   (film-kit.jsx + film-nukes.jsx): ein 3-Minuten-Film in sechs
   Szenen zu je 30 s.

     Bsss 0 s · Versuche 30 · Knopf 60 · Zehn 90 · Hundert 120 · Stille 150

   03:12 Uhr, eine Muecke weckt Kapitaen Aendii in der Haengematte.
   Hand, Pfanne, Kanone - alles daneben, die Kajuete hat jetzt
   Meerblick. Dann der Notfallknopf: Atombombe 1 am Horizont, 2 bis
   37 ueber dem Meer (ein Wal beschwert sich), Bombe 100 aus dem All -
   die Erde bricht in zwei Teile. Endlich Ruhe. Bsss.

   WIE ES GEBAUT IST (wie zeit-film.js)
   - Der Entwurf ist React: jedes Bild eine reine Funktion der Zeit T.
     baueInhalt() ist einmalig mit esbuild von JSX in Aufrufe von
     _h() uebersetzt (aus film-kit.jsx nur die Teile, die der Film
     braucht); _h() baut einen kleinen Baum, zeichnen() gleicht ihn mit
     dem DOM ab. Buehne 1920 x 1080, eingepasst, hoechstens 30 Bilder
     pro Sekunde.
   - Abweichungen vom Entwurf: Szenenmarken stehen fest hier statt in
     useComposition()/CompositionStage. Alle Texte kommen aus i18n.js
     (nukes.*), Deutsch und Englisch. Bei "Bewegung reduzieren" ohne
     Rauch-Filter und mit stark gedaempften Vollbild-Blitzen
     (Lichtempfindlichkeit).

   live-storys.js startet den Film in der Story "nukes":
     fhNukesFilm.start({ ab: ms, vorschau })
     fhNukesFilm.ende()   - Story vorbei: kurz ausblenden
     fhNukesFilm.weg()    - abgebrochen: sofort weg
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
    rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1, image: 1,
    filter: 1, feTurbulence: 1, feDisplacementMap: 1, feGaussianBlur: 1 };
  /* Attribute, die in SVG camelCase bleiben muessen (sonst kebab). */
  const SVG_CAMEL = { viewBox: 1, pathLength: 1, preserveAspectRatio: 1, baseFrequency: 1, numOctaves: 1,
    stdDeviation: 1, xChannelSelector: 1, yChannelSelector: 1 };

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
     DER FILM (aus film-kit.jsx + film-nukes.jsx, uebersetzt)
     Sechs Szenen wie OM_SCENES im Entwurf; CUES sind ihre Anfaenge
     in Sekunden (der Entwurf holte sie aus useComposition()).
  ------------------------------------------------------ */
  const SZENEN = [["Bsss", 30], ["Versuche", 30], ["Knopf", 30], ["Zehn", 30], ["Hundert", 30], ["Stille", 30]];
  const CUES = {};
  let DAUER = 0;
  SZENEN.forEach(function (s) { CUES[s[0]] = DAUER; DAUER += s[1]; });   // 180 s

  /* Qualitaet: voll (Rauch-Filter, alle Wolken). Faellt die Bildrate
     ueber zwei Sekunden unter ~18 Bilder/s, schaltet bild() in die
     Sparstufe - ohne Rauch-Filter und Filmkoernung, ferne Pilze mit
     halb so vielen Wolken, Wolken und Lichtschein der Explosionen
     in einem Canvas statt als einzelne Elemente. Bei "Bewegung reduzieren" von Anfang an ohne Rauch und
     mit gedaempften Blitzen. */
  let optionen = null;
  function baueFilm() {
    const ruhig = RUHIG.matches;
    optionen = { rauch: !ruhig, sparsam: false, blitz: ruhig ? 0.2 : 1 };
    return baueInhalt(t, Easing, optionen);
  }

  function qualitaetPruefen(l, jetzt) {
    if (optionen.sparsam) return;
    if (!l.messBeginn) { l.messBeginn = jetzt; l.messBilder = 0; return; }
    l.messBilder++;
    if (jetzt - l.messBeginn < 2000) return;
    const bps = l.messBilder * 1000 / (jetzt - l.messBeginn);
    l.messBeginn = jetzt; l.messBilder = 0;
    if (bps < 18) { optionen.sparsam = true; optionen.rauch = false; }
  }

  /* eslint-disable */
  function baueInhalt(t, Easing, optionen) {
    const React = { Fragment: _Frag };
    const BLITZ = optionen.blitz == null ? 1 : optionen.blitz;
    const W = 1920, H = 1080;
    const E = Easing;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const C = {
      void: "#07080e",
      sil: "oklch(0.085 0.012 270)",
      sil2: "oklch(0.115 0.015 268)",
      floor: "oklch(0.09 0.012 268)",
      dust: "oklch(0.8 0.015 260)",
      text: "#e4e7f5",
      textSoft: "#cfd3e5",
      muted: "#b2b6ca",
      accent: "#9184d9",
      gold: "oklch(0.82 0.1 80)",
      goldA: (a) => "oklch(0.82 0.1 80 / " + a + ")",
      blueA: (a) => "oklch(0.7 0.06 245 / " + a + ")",
      fireA: (a) => "oklch(0.74 0.15 52 / " + a + ")"
    };
    const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";
    const TEXT_SHADOW = "0 2px 28px rgba(7,8,14,0.95), 0 0 2px rgba(7,8,14,0.8)";
    const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const rnd = (i, k) => {
      const x = Math.sin(i * 127.1 + (k || 0) * 311.7 + 1.3) * 43758.5453;
      return x - Math.floor(x);
    };
    const M = {
      env(T, a, b, fin, fout) {
        fin = fin == null ? 1.2 : fin;
        fout = fout == null ? 1.2 : fout;
        if (!(T > a && T < b)) return 0;
        return E.easeInOutSine(Math.max(0, Math.min(1, (T - a) / fin, (b - T) / fout)));
      },
      glide(T, a, b, from, to) {
        const p = clamp((T - a) / (b - a), 0, 1);
        return from + (to - from) * E.easeInOutSine(p);
      },
      rise(T, a, d) {
        return E.easeOutCubic(clamp((T - a) / (d == null ? 1.2 : d), 0, 1));
      },
      pop(T, a, d) {
        return E.easeOutBack(clamp((T - a) / (d == null ? 0.5 : d), 0, 1));
      }
    };
    const Box = ({ style, children }) => /* @__PURE__ */ _h("div", { style: Object.assign({ position: "absolute" }, style) }, children);
    function Glow({ x, y, w, h, color, o = 1 }) {
      if (o <= 5e-3) return null;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`, opacity: o, pointerEvents: "none" } });
    }
    function Vignette({ k = 0.88 }) {
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse at 50% 48%, transparent 52%, rgba(4,5,9,${k}) 100%)` } });
    }
    let GRAIN = null;
    function grainUrl() {
      if (GRAIN) return GRAIN;
      const c = document.createElement("canvas");
      c.width = c.height = 192;
      const g = c.getContext("2d");
      const img = g.createImageData(192, 192);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(rnd(i, 11) * 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 22;
      }
      g.putImageData(img, 0, 0);
      GRAIN = c.toDataURL();
      return GRAIN;
    }
    function Grain({ T }) {
      const f = Math.floor(T * 12), x = Math.floor(rnd(f, 1) * 192), y = Math.floor(rnd(f, 2) * 192);
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.55 } }, /* @__PURE__ */ _h("div", { style: { position: "absolute", left: -192, top: -192, width: W + 384, height: H + 384, backgroundImage: `url(${grainUrl()})`, transform: `translate(${x}px, ${y}px)` } }));
    }
    function Motes({ T, amount = 1, count = 30, color = C.dust, box, size = [1.5, 4], rise = 8, seed = 0, alpha = 0.55, drift = 24, fall = false }) {
      if (amount <= 0.01) return null;
      const b = box || { x: 0, y: 0, w: W, h: H };
      const out = [];
      for (let i = 0; i < count; i++) {
        const k = i + seed * 97, s = size[0] + rnd(k, 9) * (size[1] - size[0]);
        const dx = Math.sin(T * 0.13 + k) * drift;
        const yy = rnd(k, 6) * b.h + (fall ? 1 : -1) * T * rise * (0.5 + rnd(k, 7));
        const y = (yy % b.h + b.h) % b.h;
        const tw = 0.5 + 0.5 * Math.sin(T * (0.5 + rnd(k, 8)) + k * 3);
        out.push(/* @__PURE__ */ _h("div", { key: i, style: { position: "absolute", left: 0, top: 0, width: s, height: s, transform: `translate(${(b.x + rnd(k, 5) * b.w + dx).toFixed(1)}px, ${(b.y + y).toFixed(1)}px)`, borderRadius: "50%", background: color, boxShadow: `0 0 ${s * 4}px ${color}`, opacity: alpha * amount * tw } }));
      }
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } }, out);
    }
    const Floor = ({ top = 880, color = C.floor }) => /* @__PURE__ */ _h(Box, { style: { left: -200, right: -200, top, bottom: -200, background: `linear-gradient(180deg, ${color}, ${C.void} 70%)` } });
    function Figure({ x, ground, h, color = C.sil, opacity = 1, sit = false, tilt = 0, rim, T, walk = 0, wide = 1, hat, hatLift = 0, hatSpin = 0, hatColor, armL, armR, eyes, squash = 0, flip = false, children }) {
      if (opacity <= 5e-3) return null;
      const br = T == null ? 0 : Math.sin(T * 1.25 + x * 0.01);
      const bob = walk ? -Math.abs(Math.sin(walk / 38)) * h * 0.018 : 0;
      ground = ground + bob;
      tilt = tilt + (walk ? 1.2 : 0);
      const head = h * 0.17, bodyW = h * 0.34 * wide, bodyH = sit ? h * 0.5 : h * 0.66;
      const total = bodyH + head * 1.06, r = bodyW * 0.48;
      const rimSh = (w) => rim ? `inset -${w * 0.08}px 0 ${w * 0.14}px -${w * 0.04}px ${rim}` : "none";
      const armW = h * 0.055, armH = h * 0.3, sy = head * 1.06 + bodyH * 0.1;
      const arm = (ang, side) => ang == null ? null : /* @__PURE__ */ _h("div", { style: { position: "absolute", left: side < 0 ? -armW * 0.15 : bodyW - armW * 0.85, top: sy, width: armW, height: armH, borderRadius: armW / 2, background: color, transform: `rotate(${side < 0 ? ang : -ang}deg)`, transformOrigin: `50% ${armW / 2}px` } });
      let eyeEl = null;
      if (eyes != null) {
        const es = head * 0.11, ex = (typeof eyes === "number" ? eyes : 0) * head * 0.14;
        const closed = eyes === "closed";
        eyeEl = [-1, 1].map((s) => /* @__PURE__ */ _h("div", { key: s, style: { position: "absolute", left: (bodyW - head) / 2 + head / 2 + s * head * 0.18 + ex - es / 2, top: head * 0.42, width: es, height: closed ? es * 0.28 : es, borderRadius: closed ? 2 : "50%", background: C.text, opacity: 0.92 } }));
      }
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x - bodyW / 2, top: ground - total, width: bodyW, height: total, opacity, transform: `rotate(${tilt}deg) scale(${(flip ? -1 : 1) * (1 + squash * 0.5)}, ${(1 + br * 6e-3) * (1 - squash)})`, transformOrigin: "50% 100%" } }, arm(armL, -1), arm(armR, 1), /* @__PURE__ */ _h("div", { style: { position: "absolute", left: (bodyW - head) / 2, top: 0, width: head, height: head, borderRadius: "50%", background: color, boxShadow: rim ? `inset -${head * 0.12}px 0 ${head * 0.2}px -${head * 0.06}px ${rim}` : "none" } }), /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 0, top: head * 1.06, width: bodyW, height: bodyH, background: color, borderRadius: `${r}px ${r}px ${bodyW * 0.1}px ${bodyW * 0.1}px`, boxShadow: rimSh(bodyW) } }), eyeEl, hat ? /* @__PURE__ */ _h("div", { style: { position: "absolute", left: bodyW / 2 - head * 0.9, top: -head * 0.36 - hatLift, width: head * 1.8, height: head * 0.62, background: hatColor || color, clipPath: "polygon(0 72%, 18% 12%, 50% 0, 82% 12%, 100% 72%, 50% 100%)", transform: `rotate(${hatSpin}deg)`, boxShadow: rim ? `inset 0 -3px 0 ${rim}` : "none" } }) : null, children);
    }
    const SEA = ["oklch(0.22 0.03 255)", "oklch(0.155 0.025 258)", "oklch(0.105 0.02 262)"];
    const waveY = (x, T, y = 760, l = 0, amp = 10, speed = 1) => y + l * 60 + Math.sin(x * 6e-3 + T * speed * (0.8 + l * 0.3) + l * 2) * amp * (1 + l * 0.6) + Math.sin(x * 0.017 - T * speed * 1.3 + l) * amp * (1 + l * 0.6) * 0.4;
    function Sea({ T, y = 760, amp = 10, speed = 1, only = [0, 1, 2], colors = SEA, shine }) {
      return /* @__PURE__ */ _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible" } }, only.map((l) => {
        let d = `M -400 ${H + 300} `;
        for (let x = -400; x <= W + 400; x += 40) d += `L ${x} ${waveY(x, T, y, l, amp, speed).toFixed(1)} `;
        d += `L ${W + 400} ${H + 300} Z`;
        return /* @__PURE__ */ _h("g", { key: l }, /* @__PURE__ */ _h("path", { d, fill: colors[l] }), shine && l === 0 ? /* @__PURE__ */ _h("path", { d, fill: "none", stroke: shine, strokeWidth: "1.5" }) : null);
      }));
    }
    function Ship({ x, y, s = 1, tilt = 0, color = C.sil2, sail = "oklch(0.24 0.02 262)", flag, flagWave = 0, rim, children, sails = 1 }) {
      const mast = (mx, top, hgt) => /* @__PURE__ */ _h(Box, { style: { left: mx - 6, top, width: 12, height: hgt, background: color } });
      const sailEl = (mx, top, w, h, k) => /* @__PURE__ */ _h(Box, { style: { left: mx - w / 2, top, width: w, height: h * sails, background: sail, borderRadius: `8px 8px ${w * 0.5}px ${w * 0.5}px / 8px 8px 40px 40px`, boxShadow: rim ? `inset -10px 0 20px -8px ${rim}` : "none", transformOrigin: "50% 0", transform: `skewX(${Math.sin(flagWave + k) * 2}deg)` } });
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x, top: y, width: 0, height: 0, transform: `scale(${s}) rotate(${tilt}deg)`, transformOrigin: "0 0" } }, mast(-90, -600, 480), mast(120, -540, 420), sailEl(-90, -560, 280, 300, 0), sailEl(120, -500, 240, 260, 1.4), flag ? /* @__PURE__ */ _h(Box, { style: { left: -84, top: -620, width: 90, height: 50, background: flag, clipPath: `polygon(0 0, 100% ${20 + Math.sin(flagWave * 3) * 12}%, 100% ${80 + Math.sin(flagWave * 3) * 12}%, 0 100%)` } }) : null, /* @__PURE__ */ _h(Box, { style: { left: -340, top: -150, width: 680, height: 190, background: color, clipPath: "polygon(0 0, 22% 14%, 78% 14%, 100% 0, 90% 100%, 9% 100%)", boxShadow: rim ? `inset 0 3px 0 ${rim}` : "none" } }), /* @__PURE__ */ _h(Box, { style: { left: 190, top: -200, width: 130, height: 60, background: color } }), children);
    }
    function Cannon({ x, y, s = 1, angle = 0, recoil = 0, color = "oklch(0.2 0.015 265)", rim, wheel = 0 }) {
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x, top: y, width: 0, height: 0, transform: `translateX(${-recoil}px) scale(${s})` } }, /* @__PURE__ */ _h(Box, { style: { left: -150, top: -76, width: 300, height: 76, background: "oklch(0.15 0.02 60)", clipPath: "polygon(0 30%, 100% 50%, 100% 100%, 0 100%)" } }), /* @__PURE__ */ _h("div", { style: { position: "absolute", left: -170, top: -150, width: 360, height: 84, transformOrigin: "40px 42px", transform: `rotate(${angle}deg)` } }, /* @__PURE__ */ _h(Box, { style: { left: 0, top: 6, width: 340, height: 72, borderRadius: "36px 10px 10px 36px", background: `linear-gradient(180deg, oklch(0.3 0.015 265), ${color})`, boxShadow: rim ? `inset 0 3px 0 ${rim}` : "none" } }), /* @__PURE__ */ _h(Box, { style: { left: 320, top: 0, width: 30, height: 84, borderRadius: 8, background: color } }), /* @__PURE__ */ _h(Box, { style: { left: 120, top: 2, width: 18, height: 80, borderRadius: 6, background: color } })), [-100, 100].map((wx) => /* @__PURE__ */ _h("div", { key: wx, style: { position: "absolute", left: wx - 40, top: -40, width: 80, height: 80, borderRadius: "50%", background: "oklch(0.13 0.02 60)", border: "6px solid oklch(0.2 0.02 60)", boxSizing: "border-box", transform: `rotate(${wheel}deg)` } }, /* @__PURE__ */ _h(Box, { style: { left: 31, top: 0, width: 6, height: 68, background: "oklch(0.2 0.02 60)" } }))));
    }
    function Szene({ T, a, b, cam: cam2, bg, fade = 1.6, shake = 0, children }) {
      const op = fade < 0.01 ? T >= a && T < b ? 1 : 0 : M.env(T, a - fade / 2, b + fade / 2, fade, fade);
      if (op <= 0) return null;
      const c = cam2 || {};
      const ca = a + (c.a || 0), cb = a + (c.b != null ? c.b : b - a);
      const pick = (k0, k1, d) => M.glide(T, ca, cb, c[k0] != null ? c[k0] : d, c[k1] != null ? c[k1] : c[k0] != null ? c[k0] : d);
      const sc = pick("s0", "s1", 1);
      const f = Math.floor(T * 30);
      const dx = Math.sin(T * 0.11 + a) * 9 + Math.sin(T * 0.23) * 4 + (rnd(f, 3) - 0.5) * shake;
      const dy = Math.cos(T * 0.09 + a) * 6 + (rnd(f, 4) - 0.5) * shake;
      const x = pick("x0", "x1", 0) + dx, y = pick("y0", "y1", 0) + dy;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, opacity: op, background: bg || C.void, overflow: "hidden" } }, /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(4)})`, transformOrigin: c.o || "50% 50%" } }, children));
    }
    function Subs({ T, lines }) {
      let cur = null;
      for (const l of lines) if (T > l[0] && T < l[1]) {
        cur = l;
        break;
      }
      if (!cur) return null;
      const [at, until, text, who, place] = cur;
      const o = M.env(T, at, until, 0.35, 0.45);
      const center = place === "c";
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 160, right: 160, top: center ? 470 : "auto", bottom: center ? "auto" : 104, display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", gap: 10, opacity: o, transform: `translateY(${((1 - o) * 10).toFixed(1)}px)`, fontFamily: FONT, pointerEvents: "none" } }, who ? /* @__PURE__ */ _h("div", { style: { fontSize: 22, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold, textShadow: TEXT_SHADOW } }, who) : null, /* @__PURE__ */ _h("div", { style: { fontSize: center ? 64 : 46, fontWeight: center ? 500 : 400, lineHeight: 1.32, color: C.text, textShadow: TEXT_SHADOW, maxWidth: center ? 1400 : 1300, textAlign: center ? "center" : "left", textWrap: "balance" } }, text));
    }
    function ChapterCard({ T, at, n, title, dur = 4.5 }) {
      const o = M.env(T, at, at + dur, 0.8, 1);
      if (o <= 0) return null;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 160, top: 130, display: "flex", flexDirection: "column", gap: 14, opacity: o, transform: `translateX(${((1 - M.rise(T, at, 1.4)) * -16).toFixed(1)}px)`, fontFamily: FONT } }, /* @__PURE__ */ _h("div", { style: { fontSize: 22, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, textShadow: TEXT_SHADOW } }, t("nukes.kapitel", "Kapitel"), " ", ROMAN[n - 1]), /* @__PURE__ */ _h("div", { style: { fontSize: 60, fontWeight: 500, color: C.text, textShadow: TEXT_SHADOW, letterSpacing: "-0.01em" } }, title), /* @__PURE__ */ _h("div", { style: { width: 48 * M.rise(T, at + 0.4, 1), height: 2, background: C.accent } }));
    }
    function TitleCard({ T, a, b, kicker, title, sub }) {
      const o = M.env(T, a, b, 1.4, 1.4);
      if (o <= 0) return null;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 160, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, opacity: o, fontFamily: FONT } }, kicker ? /* @__PURE__ */ _h("div", { style: { fontSize: 24, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: C.muted, textShadow: TEXT_SHADOW } }, kicker) : null, /* @__PURE__ */ _h("div", { style: { fontSize: 120, fontWeight: 500, lineHeight: 1.02, color: C.text, letterSpacing: "-0.02em", textShadow: TEXT_SHADOW, maxWidth: 1500, transform: `translateY(${((1 - M.rise(T, a, 2.4)) * 18).toFixed(1)}px)` } }, title), /* @__PURE__ */ _h("div", { style: { width: 64 * M.rise(T, a + 0.8, 1.2), height: 2, background: C.accent } }), sub ? /* @__PURE__ */ _h("div", { style: { fontSize: 34, color: C.textSoft, textShadow: TEXT_SHADOW, maxWidth: 1200 } }, sub) : null);
    }
    function cam(T, keys) {
      let k0 = keys[0], k1 = keys[keys.length - 1];
      if (T <= k0[0]) k1 = k0;
      else if (T >= k1[0]) k0 = k1;
      else for (let i = 0; i < keys.length - 1; i++) if (T >= keys[i][0] && T < keys[i + 1][0]) {
        k0 = keys[i];
        k1 = keys[i + 1];
        break;
      }
      const g = (j) => k0 === k1 ? k0[j] : M.glide(T, k0[0], k1[0], k0[j], k1[j]);
      const s = g(1), fx = g(2), fy = g(3);
      return { position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${(960 - fx * s).toFixed(1)}px, ${(540 - fy * s).toFixed(1)}px) scale(${s.toFixed(4)})` };
    }
    const Black = ({ o }) => o > 5e-3 ? /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, background: C.void, opacity: o, pointerEvents: "none" } }) : null;
    function film(Piece2, Over2) {
      return function Film({ T, CUES }) {
        return /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, background: C.void, overflow: "hidden", fontFamily: FONT } }, /* @__PURE__ */ _h(Piece2, { T, CUES }), /* @__PURE__ */ _h(Vignette, null), optionen.sparsam ? null : /* @__PURE__ */ _h(Grain, { T }), Over2 ? /* @__PURE__ */ _h(Over2, { T, CUES }) : null);
      };
    }
    const NIGHT = "linear-gradient(180deg, oklch(0.11 0.02 264) 0%, oklch(0.18 0.03 256) 58%, oklch(0.25 0.035 250) 70%)";
    const RIM = C.goldA(0.35);
    const RED = "oklch(0.6 0.17 28)";
    const NUKES = [];
    NUKES.push({ t: 82, x: 1330, s: 0.7 });
    NUKES.push({ t: 92, x: 360, s: 0.62 });
    for (let i = 0; i < 8; i++) NUKES.push({ t: 99 + i * 0.55, x: -200 + rnd(i, 21) * 2300, s: 0.3 + rnd(i, 22) * 0.45 });
    for (let k = 0; k < 27; k++) NUKES.push({ t: 106 + 13 * Math.pow(k / 26, 0.7), x: -300 + rnd(k, 23) * 2500, s: 0.25 + rnd(k, 24) * 0.5 });
    for (let k = 0; k < 63; k++) {
      const a = rnd(k, 25) * Math.PI * 2, r = Math.sqrt(rnd(k, 26)) * 300;
      NUKES.push({ t: 121 + 19 * Math.pow(k / 62, 0.6), px: Math.cos(a) * r, py: Math.sin(a) * r, planet: true });
    }
    const countAt = (T) => {
      let n = 0;
      for (const d of NUKES) if (T >= d.t) n++;
      return n;
    };
    const lastAt = (T) => {
      let l = -99;
      for (const d of NUKES) if (T >= d.t) l = d.t;
      return l;
    };
    function Mosquito({ x, y, s = 1, T, o = 1 }) {
      if (o <= 0.01) return null;
      const f = Math.sin(T * 90);
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x, top: y, width: 0, height: 0, transform: `scale(${s})`, opacity: o } }, /* @__PURE__ */ _h(Glow, { x: 0, y: 0, w: 60, h: 60, color: C.blueA(0.35) }), [-1, 1].map((k) => /* @__PURE__ */ _h(Box, { key: k, style: { left: -2 + k * 2, top: -14, width: 14, height: 16, borderRadius: "50%", background: "oklch(0.85 0.02 250 / 0.45)", transformOrigin: "50% 100%", transform: `rotate(${k * (25 + f * 30)}deg)` } })), /* @__PURE__ */ _h(Box, { style: { left: -12, top: -3, width: 26, height: 7, borderRadius: 4, background: C.muted } }), /* @__PURE__ */ _h(Box, { style: { left: 12, top: -5, width: 7, height: 7, borderRadius: "50%", background: C.muted } }), /* @__PURE__ */ _h(Box, { style: { left: 18, top: -2, width: 12, height: 1.5, background: C.muted } }), [-6, 0, 6].map((lx) => /* @__PURE__ */ _h(Box, { key: lx, style: { left: lx, top: 3, width: 1.2, height: 10, background: C.muted, transform: "rotate(12deg)" } })));
    }
    const buzz = (T) => ({ x: 980 + Math.sin(T * 1.3) * 300 + Math.sin(T * 3.7) * 60, y: 380 + Math.sin(T * 1.9) * 110 + Math.cos(T * 4.3) * 30 });
    function Sleeper({ x, y, T, eyes = "closed", hatOn = false, lit = 0 }) {
      const br = Math.sin(T * 1.1) * 0.02;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x, top: y, width: 0, height: 0 } }, /* @__PURE__ */ _h(Box, { style: { left: -150, top: -50, width: 330, height: 96, borderRadius: 48, background: lit ? C.sil2 : C.sil, boxShadow: lit ? `inset 0 6px 14px -6px ${C.goldA(0.6)}, 0 0 0 1.5px ${C.goldA(0.4)}` : `inset 0 6px 14px -8px ${RIM}`, transform: `scaleY(${1 + br})` } }), /* @__PURE__ */ _h(Box, { style: { left: -238, top: -78, width: 96, height: 96, borderRadius: "50%", background: lit ? C.sil2 : C.sil, boxShadow: lit ? `inset 0 6px 14px -6px ${C.goldA(0.6)}, 0 0 0 1.5px ${C.goldA(0.4)}` : `inset 0 6px 14px -8px ${RIM}` } }), [-1, 1].map((k) => /* @__PURE__ */ _h(Box, { key: k, style: { left: -196 + k * 16, top: -40, width: 11, height: eyes === "closed" ? 3 : 11, borderRadius: eyes === "closed" ? 2 : "50%", background: C.text } })), hatOn ? /* @__PURE__ */ _h(Box, { style: { left: -262, top: -112, width: 150, height: 54, background: C.sil, clipPath: "polygon(0 72%, 18% 12%, 50% 0, 82% 12%, 100% 72%, 50% 100%)", transform: "rotate(-14deg)" } }) : null);
    }
    function Zs({ T, x, y, o }) {
      if (o <= 0.01) return null;
      return /* @__PURE__ */ _h(_Frag, null, [0, 1, 2].map((i) => {
        const p = (T * 0.35 + i / 3) % 1;
        return /* @__PURE__ */ _h("div", { key: i, style: { position: "absolute", left: x + p * 80, top: y - p * 140, fontSize: 26 + p * 22, fontWeight: 500, color: C.textSoft, opacity: o * Math.sin(Math.PI * p) * 0.8 } }, "z");
      }));
    }
    function Hammock({ T, children, rope = 1 }) {
      const sw = Math.sin(T * 0.6) * 2;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 0, top: 0, width: W, height: H, transform: `rotate(${sw.toFixed(2)}deg)`, transformOrigin: "760px 380px" } }, /* @__PURE__ */ _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible" } }, rope ? /* @__PURE__ */ _h(_Frag, null, /* @__PURE__ */ _h("path", { d: "M 380 520 L 300 380", stroke: "oklch(0.3 0.03 60)", strokeWidth: "3" }), /* @__PURE__ */ _h("path", { d: "M 1140 520 L 1220 380", stroke: "oklch(0.3 0.03 60)", strokeWidth: "3" })) : null), children, /* @__PURE__ */ _h("svg", { width: W, height: H, style: { position: "absolute", left: 0, top: 0, overflow: "visible" } }, /* @__PURE__ */ _h("path", { d: "M 380 520 Q 760 800 1140 520 Q 760 690 380 520 Z", fill: "oklch(0.2 0.03 60)", stroke: "oklch(0.3 0.03 60)", strokeWidth: "2" })));
    }
    function Lantern({ T, x = 760, y = 120 }) {
      const sw = Math.sin(T * 0.8) * 5;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", left: x, top: y, width: 0, height: 0, transform: `rotate(${sw}deg)` } }, /* @__PURE__ */ _h(Box, { style: { left: -1, top: -120, width: 2, height: 120, background: C.sil2 } }), /* @__PURE__ */ _h(Glow, { x: 0, y: 30, w: 900, h: 700, color: C.goldA(0.16) }), /* @__PURE__ */ _h(Box, { style: { left: -22, top: 0, width: 44, height: 60, borderRadius: 8, background: C.goldA(0.75), border: `4px solid ${C.sil2}`, boxSizing: "border-box", boxShadow: `0 0 40px ${C.goldA(0.5)}` } }));
    }
    function Cabin({ T, hole, sleeping, porthole = 1, children }) {
      return /* @__PURE__ */ _h(_Frag, null, /* @__PURE__ */ _h(Box, { style: { left: -400, top: -400, width: W + 800, height: H + 800, background: "linear-gradient(180deg, oklch(0.16 0.025 55), oklch(0.11 0.02 50))" } }), /* @__PURE__ */ _h(Box, { style: { left: -400, top: -400, width: W + 800, height: H + 800, background: "repeating-linear-gradient(180deg, transparent 0 58px, rgba(4,5,9,0.45) 58px 61px)" } }), porthole ? /* @__PURE__ */ _h(Box, { style: { left: 1290, top: 270, width: 220, height: 220, borderRadius: "50%", overflow: "hidden", border: `10px solid ${C.goldA(0.35)}`, boxSizing: "border-box", background: NIGHT, opacity: 1 - hole } }, /* @__PURE__ */ _h(Box, { style: { left: 120, top: 30, width: 40, height: 40, borderRadius: "50%", background: "oklch(0.9 0.02 90)", boxShadow: "0 0 30px oklch(0.9 0.02 90 / 0.5)" } }), /* @__PURE__ */ _h(Box, { style: { left: 0, top: 130, width: 220, height: 90, background: "oklch(0.14 0.022 258)" } })) : null, hole > 0 ? /* @__PURE__ */ _h(Box, { style: { left: 1170, top: 150, width: 480, height: 420, clipPath: "polygon(8% 30%, 22% 8%, 40% 18%, 58% 0, 74% 14%, 96% 10%, 88% 38%, 100% 60%, 84% 78%, 90% 100%, 60% 88%, 40% 100%, 24% 84%, 0 76%, 12% 54%)", opacity: hole, background: NIGHT, overflow: "hidden" } }, /* @__PURE__ */ _h(Box, { style: { left: 280, top: 70, width: 60, height: 60, borderRadius: "50%", background: "oklch(0.9 0.02 90)", boxShadow: "0 0 40px oklch(0.9 0.02 90 / 0.5)" } }), /* @__PURE__ */ _h(Sea, { T, y: 290, amp: 5, only: [0, 1], shine: C.blueA(0.25) })) : null, /* @__PURE__ */ _h(Lantern, { T }), /* @__PURE__ */ _h(Box, { style: { left: 290, top: 370, width: 20, height: 20, borderRadius: "50%", background: C.sil2 } }), /* @__PURE__ */ _h(Box, { style: { left: 1210, top: 370, width: 20, height: 20, borderRadius: "50%", background: C.sil2 } }), /* @__PURE__ */ _h(Floor, { top: 860, color: "oklch(0.15 0.025 55)" }), /* @__PURE__ */ _h(Box, { style: { left: -400, top: 860, width: W + 800, height: 400, background: "repeating-linear-gradient(90deg, transparent 0 138px, rgba(4,5,9,0.45) 138px 141px)" } }), children);
    }
    const mixC = (h, hot, mid, cold) => h > 0.5 ? hot : h > 0.2 ? mid : cold;
    const PUFFS = [], GLUT = [];
    const LW = { x: -800, y: -900, w: W + 1600, h: H + 1100, k: 0.33 };
    function puffsMalen(el) {
      const b = Math.round(LW.w * LW.k), h = Math.round(LW.h * LW.k);
      if (el.width !== b) el.width = b;
      if (el.height !== h) el.height = h;
      const c = el.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, b, h);
      c.setTransform(LW.k, 0, 0, LW.k, -LW.x * LW.k, -LW.y * LW.k);
      for (let i = 0; i < GLUT.length; i++) {
        const q = GLUT[i], rx = q[2] / 2 * Math.SQRT2, ry = q[3] / 2 * Math.SQRT2;
        try {
          c.save();
          c.translate(q[0], q[1]);
          c.scale(1, ry / rx);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
          g.addColorStop(0, q[4]);
          g.addColorStop(0.7, "rgba(0,0,0,0)");
          c.globalAlpha = Math.min(1, q[5]);
          c.fillStyle = g;
          c.fillRect(-q[2] / 2, -q[3] / 2 * rx / ry, q[2], q[3] * rx / ry);
          c.restore();
        } catch (e) {
          c.restore();
        }
      }
      for (let i = 0; i < PUFFS.length; i++) {
        const p = PUFFS[i], cx = p[0], cy = p[1], r = p[2];
        try {
          const g = c.createRadialGradient(cx, cy - 0.28 * r, 0, cx, cy - 0.28 * r, 1.62 * r);
          g.addColorStop(0, p[4]);
          g.addColorStop(0.38, p[3]);
          g.addColorStop(0.6, p[5]);
          g.addColorStop(0.72, "rgba(0,0,0,0)");
          c.globalAlpha = Math.min(1, p[6]);
          c.fillStyle = g;
          c.beginPath();
          c.arc(cx, cy, r, 0, 6.2832);
          c.fill();
        } catch (e) {
        }
      }
      c.globalAlpha = 1;
    }
    function puff(key, cx, cy, r, base, light, dark, o) {
      if (o <= 0.01 || r < 1) return null;
      if (optionen.sparsam) {
        PUFFS.push([cx, cy, r, base, light, dark, o]);
        return null;
      }
      return /* @__PURE__ */ _h("div", { key, style: { position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", opacity: o, background: `radial-gradient(circle at 50% 36%, ${light} 0%, ${base} 38%, ${dark} 60%, transparent 72%)` } });
    }
    function glut(key, x, y, w, h, color, o) {
      if (o <= 5e-3) return null;
      if (optionen.sparsam) {
        GLUT.push([x, y, w, h, color, o]);
        return null;
      }
      return /* @__PURE__ */ _h(Glow, { key, x, y, w, h, color, o });
    }
    function Nuke({ T, t0, x, y, s = 1 }) {
      const d = T - t0;
      if (d < 0 || d > 22) return null;
      const hz = 0.55 + 0.45 * Math.min(1, s / 0.75);
      const heat = Math.max(0, 1 - d / 6.5);
      const fade = 1 - M.glide(T, t0 + 12, t0 + 22, 0, 1);
      const grow = M.rise(T, t0, 7);
      const capY = y - (70 + 430 * M.rise(T, t0 + 0.3, 9)) * s;
      const spread = M.glide(T, t0 + 7, t0 + 22, 0, 1);
      const capW = (60 + 230 * grow + d * 6 + spread * 160) * s, capH = capW * (0.42 - spread * 0.1);
      const wind = (h) => Math.max(0, d - 5) * 9 * s * h;
      const lod = optionen.sparsam && s < 0.6 ? 2 : 1;
      const out = [];
      const surge = M.rise(T, t0 + 0.4, 6);
      for (let i = 0; i < 14; i += lod) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
        const px = x + side * (20 + k * 60 * surge + rnd(i, 1) * 30) * s * (0.4 + surge);
        const r = (28 + rnd(i, 2) * 26) * s * (0.5 + surge * 0.8);
        out.push(puff("b" + i, px, y - r * 0.35, r, "oklch(0.42 0.03 50)", "oklch(0.55 0.04 55)", "oklch(0.3 0.02 45)", 0.85 * surge * fade * hz));
      }
      const stemTop = capY + capH * 0.3, stemLen = Math.max(0, y - stemTop);
      const nStem = lod > 1 ? 7 : 12;
      for (let i = 0; i < nStem; i++) {
        const p = i / (nStem - 1), py = y - p * stemLen;
        const w = (26 + (1 - p) * 34 + Math.sin(i * 1.7 + d * 0.8) * 5) * s * (0.5 + grow * 0.5);
        const hot = heat * (0.35 + p * 0.65);
        out.push(puff(
          "s" + i,
          x + Math.sin(i * 2.3 + d * 0.5) * 6 * s + wind(p * 0.8),
          py,
          w * (1 - spread * 0.35),
          mixC(hot, "oklch(0.72 0.15 55)", "oklch(0.5 0.1 45)", "oklch(0.38 0.025 45)"),
          mixC(hot, "oklch(0.88 0.12 80)", "oklch(0.62 0.1 55)", "oklch(0.48 0.025 50)"),
          "oklch(0.26 0.02 40)",
          0.95 * fade * hz * M.rise(T, t0 + p * 1.4, 0.8) * (1 - spread * 0.55 * (1 - p))
        ));
      }
      const cr = M.env(T, t0 + 1.6, t0 + 9, 1, 3);
      if (cr > 0.01) {
        const ry = y - stemLen * 0.55, rw = (160 + 220 * M.rise(T, t0 + 1.6, 5)) * s;
        out.push(/* @__PURE__ */ _h("div", { key: "cr", style: { position: "absolute", left: x - rw, top: ry - rw * 0.11, width: rw * 2, height: rw * 0.22, borderRadius: "50%", background: "radial-gradient(ellipse at 50% 50%, transparent 52%, oklch(0.86 0.01 250 / 0.3) 64%, transparent 72%)", opacity: cr * fade * hz } }));
      }
      const ring = (front) => {
        for (let i = 0; i < 18; i += lod) {
          const ph = i / 18 * Math.PI * 2 + d * 0.35;
          const z = Math.sin(ph);
          if (z >= 0 !== front) continue;
          const roll = Math.sin(ph * 2 + d * 1.4) * 0.12;
          const px = x + Math.cos(ph) * capW * 0.78 + wind(1), py = capY + capH * (0.18 + z * 0.22 + roll);
          const r = capH * (0.62 + rnd(i, 7) * 0.25) * (0.85 + 0.15 * z);
          const h = heat * (0.75 + 0.25 * z);
          out.push(puff(
            (front ? "f" : "k") + i,
            px,
            py,
            r,
            mixC(h, "oklch(0.8 0.15 62)", "oklch(0.55 0.11 42)", "oklch(0.4 0.025 45)"),
            mixC(h, "oklch(0.95 0.08 90)", "oklch(0.7 0.12 60)", "oklch(0.55 0.02 60)"),
            mixC(h, "oklch(0.55 0.15 40)", "oklch(0.32 0.06 35)", "oklch(0.25 0.015 40)"),
            fade * hz * (front ? 1 : 0.9)
          ));
        }
      };
      ring(false);
      for (let i = 0; i < 9; i += lod) {
        const ang = -Math.PI * (0.12 + 0.76 * (i / 8));
        const px = x + Math.cos(ang) * capW * 0.55 + wind(1.15), py = capY - capH * 0.15 + Math.sin(ang) * capH * 0.9;
        const r = capH * (0.6 + rnd(i, 9) * 0.3);
        out.push(puff(
          "d" + i,
          px,
          py,
          r,
          mixC(heat, "oklch(0.84 0.14 68)", "oklch(0.56 0.1 45)", "oklch(0.44 0.025 50)"),
          mixC(heat, "oklch(0.97 0.06 95)", "oklch(0.72 0.1 65)", "oklch(0.6 0.02 70)"),
          mixC(heat, "oklch(0.6 0.15 45)", "oklch(0.35 0.06 38)", "oklch(0.28 0.015 40)"),
          fade * hz
        ));
      }
      ring(true);
      for (let i = 0; i < 10; i += lod) {
        const k = M.rise(T, t0 + 6 + i * 0.6, 8);
        if (k <= 0.01) continue;
        const px = x + capW * (0.3 + rnd(i, 31) * 0.6) + k * (180 + rnd(i, 32) * 220) * s + wind(1.2);
        const py = capY - capH * (0.3 + rnd(i, 33) * 0.5) - k * 30 * s;
        const rr = capH * (0.35 + rnd(i, 34) * 0.3) * (1 + k * 0.8);
        out.push(puff("w" + i, px, py, rr, "oklch(0.38 0.02 45)", "oklch(0.5 0.02 55)", "oklch(0.27 0.015 40)", 0.55 * k * fade * hz * (1 - k * 0.5)));
      }
      if (heat > 0.02) out.push(glut("ul", x, capY + capH * 0.45, capW * 2.2, capH * 1.6, C.fireA(0.55), heat * fade));
      const fb = Math.max(0, 1 - d / 2.4);
      const fbR = (40 + 150 * M.rise(T, t0, 0.9)) * s;
      const fbY = y - fbR * 0.6 - 60 * s * M.rise(T, t0, 2.4);
      return /* @__PURE__ */ _h(_Frag, null, glut("g1", x, y - 120 * s, 1800 * s, 1e3 * s, C.fireA(0.75), (Math.max(0, 1 - d / 1.2) + heat * 0.4) * fade), glut("g2", x, y + 40 * s, 1400 * s, 160 * s, C.fireA(0.6), heat * fade * hz), (() => {
        const sw = M.rise(T, t0, 4.5);
        return sw < 0.995 ? /* @__PURE__ */ _h(Box, { style: { left: x - 1100 * s * sw, top: y - 30 * s * sw, width: 2200 * s * sw, height: 60 * s * sw, borderRadius: "50%", border: `2px solid oklch(0.9 0.03 80 / ${(1 - sw) * 0.7})`, boxSizing: "border-box" } }) : null;
      })(), /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, filter: optionen.rauch ? s > 0.5 ? "url(#nkSmokeN)" : "url(#nkSmokeF)" : "none" } }, out), fb > 0.01 ? /* @__PURE__ */ _h(Box, { style: { left: x - fbR, top: fbY - fbR, width: fbR * 2, height: fbR * 2, borderRadius: "50%", background: "radial-gradient(circle at 50% 45%, oklch(0.98 0.03 95), oklch(0.9 0.12 85) 35%, oklch(0.75 0.16 55) 60%, transparent 71%)", opacity: fb } }) : null);
    }
    function Whale({ T, a }) {
      const p = clamp((T - a) / 5, 0, 1);
      if (p <= 0 || p >= 1) return null;
      const up = Math.sin(Math.PI * p);
      return /* @__PURE__ */ _h(Box, { style: { left: 1180, top: 760 - up * 120, width: 160, height: 120, background: C.sil2, clipPath: "polygon(50% 100%, 42% 40%, 0 0, 30% 10%, 50% 30%, 70% 10%, 100% 0, 58% 40%)", opacity: up } });
    }
    const SEAM = [[0, -380], [-24, -300], [14, -230], [-30, -150], [8, -80], [-18, -10], [22, 60], [-12, 130], [26, 200], [-20, 270], [10, 330], [0, 380]];
    const CRACKS = [];
    for (let i = 0; i < 26; i++) {
      const p = SEAM[1 + i % (SEAM.length - 2)];
      const side = i % 2 ? 1 : -1;
      let x = p[0], y = p[1], ang = (side > 0 ? 0 : Math.PI) + (rnd(i, 41) - 0.5) * 1.6;
      const pts = [[x, y]];
      const n = 3 + Math.floor(rnd(i, 42) * 4);
      for (let k = 0; k < n; k++) {
        const L = 30 + rnd(i * 7 + k, 43) * 60;
        ang += (rnd(i * 7 + k, 44) - 0.5) * 1.1;
        x += Math.cos(ang) * L;
        y += Math.sin(ang) * L;
        if (x * x + y * y > 350 * 350) break;
        pts.push([x, y]);
      }
      CRACKS.push({ side, pts: pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" "), at: rnd(i, 45) * 1.6, w: 2 + rnd(i, 46) * 3 });
    }
    const CHUNKS = [];
    for (let i = 0; i < 70; i++) {
      const sp = SEAM[Math.floor(rnd(i, 51) * SEAM.length)];
      const k = 4 + Math.floor(rnd(i, 52) * 3), size = 5 + Math.pow(rnd(i, 53), 2) * 22;
      const poly = [];
      for (let j = 0; j < k; j++) {
        const aa = j / k * Math.PI * 2, rr = size * (0.6 + rnd(i * 9 + j, 54) * 0.5);
        poly.push((Math.cos(aa) * rr).toFixed(1) + "," + (Math.sin(aa) * rr).toFixed(1));
      }
      CHUNKS.push({ x: sp[0], y: sp[1] + (rnd(i, 55) - 0.5) * 40, vx: (rnd(i, 56) - 0.5) * 2 * (60 + rnd(i, 57) * 260), vy: (rnd(i, 58) - 0.5) * 140, spin: (rnd(i, 59) - 0.5) * 220, poly: poly.join(" "), size });
    }
    function Planet({ T, ts }) {
      const R = 360;
      const dt = T - ts;
      const split = dt <= 0 ? 0 : Math.min(1, 1 - Math.exp(-dt / 3.2)) + Math.max(0, dt - 6) * 0.012;
      const crack = clamp((dt + 1.6) / 1.8, 0, 1);
      const molten = dt < 0 ? 0 : Math.exp(-Math.max(0, dt - 1) / 9);
      const flashes = [];
      for (let i = 0; i < NUKES.length; i++) {
        const d = NUKES[i];
        if (!d.planet || T < d.t) continue;
        const ft = T - d.t, fo = ft < 1.6 ? 1 - ft / 1.6 : 0;
        flashes.push(/* @__PURE__ */ _h(React.Fragment, { key: i }, /* @__PURE__ */ _h("circle", { cx: d.px, cy: d.py, r: 10 + Math.min(ft, 6) * 4, fill: "oklch(0.34 0.03 45)", opacity: 0.5 * Math.min(1, ft) }), /* @__PURE__ */ _h("circle", { cx: d.px, cy: d.py, r: 5 + Math.min(ft, 6) * 2, fill: "oklch(0.62 0.13 50)", opacity: Math.max(0, 0.8 - ft * 0.18) }), fo > 0 ? /* @__PURE__ */ _h("circle", { cx: d.px, cy: d.py, r: 20 + ft * 60, fill: "url(#nkG)", opacity: fo }) : null));
      }
      const seamPts = SEAM.map((p) => p.join(",")).join(" ");
      const seamRev = SEAM.slice().reverse().map((p) => p.join(",")).join(" ");
      const sep = split * 240, rot = split * 16;
      const hot = "oklch(0.9 0.12 80)", mid = "oklch(0.68 0.17 45)", cool = "oklch(0.32 0.06 30)";
      const body = (id, side) => /* @__PURE__ */ _h("g", { clipPath: `url(#${id})` }, /* @__PURE__ */ _h("circle", { cx: 0, cy: 0, r: R, fill: "url(#nkP)" }), /* @__PURE__ */ _h("path", { d: "M -250 -170 C -190 -230 -60 -210 -40 -140 C -20 -80 -110 -40 -170 -60 C -240 -80 -290 -120 -250 -170 Z", fill: "oklch(0.38 0.03 150)" }), /* @__PURE__ */ _h("path", { d: "M 70 -60 C 150 -110 250 -40 230 60 C 215 150 150 230 90 200 C 40 170 60 90 30 40 C 10 0 30 -40 70 -60 Z", fill: "oklch(0.38 0.03 150)" }), /* @__PURE__ */ _h("path", { d: "M -150 160 C -90 130 0 160 -10 210 C -20 250 -120 250 -160 220 C -190 200 -180 175 -150 160 Z", fill: "oklch(0.38 0.03 150)" }), flashes, crack > 0 ? CRACKS.filter((c) => c.side === side).map((c, i) => {
        const p = clamp((crack * 1.6 - c.at * 0.6) / 1, 0, 1);
        return p > 0 ? /* @__PURE__ */ _h("polyline", { key: i, points: c.pts, pathLength: "1", strokeDasharray: "1", strokeDashoffset: 1 - p, fill: "none", stroke: molten > 0.5 || dt < 0 ? hot : mid, strokeWidth: c.w, strokeLinecap: "round", opacity: 0.35 + 0.6 * (dt < 0 ? 1 : molten), filter: optionen.rauch ? "url(#nkRock)" : null }) : null;
      }) : null, /* @__PURE__ */ _h("circle", { cx: 0, cy: 0, r: R, fill: "url(#nkS)" }));
      const face = (side) => split > 0 ? /* @__PURE__ */ _h("g", { clipPath: "url(#nkC)" }, /* @__PURE__ */ _h("polyline", { points: seamPts, fill: "none", stroke: "url(#nkFace)", strokeWidth: 6 + split * 16, strokeLinejoin: "round", opacity: 0.5 + 0.5 * molten, transform: `translate(${side * (2 + split * 6)} 0)` }), /* @__PURE__ */ _h("polyline", { points: seamPts, fill: "none", stroke: "oklch(0.9 0.12 80)", strokeWidth: 2, opacity: molten * 0.9, filter: optionen.rauch ? "url(#nkRock)" : null })) : null;
      const ring = clamp(dt / 7, 0, 1);
      return /* @__PURE__ */ _h("svg", { width: W, height: H, viewBox: `${-W / 2} ${-H / 2} ${W} ${H}`, style: { position: "absolute", left: 0, top: 0, overflow: "visible" } }, /* @__PURE__ */ _h("defs", null, /* @__PURE__ */ _h("radialGradient", { id: "nkP", cx: "0.4", cy: "0.38" }, /* @__PURE__ */ _h("stop", { offset: "0", stopColor: "oklch(0.5 0.05 240)" }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: "oklch(0.2 0.04 252)" })), /* @__PURE__ */ _h("radialGradient", { id: "nkS", cx: "0.3", cy: "0.3", r: "0.9" }, /* @__PURE__ */ _h("stop", { offset: "0.55", stopColor: "#07080e", stopOpacity: "0" }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: "#07080e", stopOpacity: "0.85" })), /* @__PURE__ */ _h("radialGradient", { id: "nkG" }, /* @__PURE__ */ _h("stop", { offset: "0", stopColor: "oklch(0.95 0.06 85)" }), /* @__PURE__ */ _h("stop", { offset: "0.4", stopColor: "oklch(0.75 0.15 55)", stopOpacity: "0.6" }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: "oklch(0.75 0.15 55)", stopOpacity: "0" })), /* @__PURE__ */ _h("radialGradient", { id: "nkCore" }, /* @__PURE__ */ _h("stop", { offset: "0", stopColor: hot, stopOpacity: "0.95" }), /* @__PURE__ */ _h("stop", { offset: "0.35", stopColor: mid, stopOpacity: "0.6" }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: cool, stopOpacity: "0" })), /* @__PURE__ */ _h("linearGradient", { id: "nkFace", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ _h("stop", { offset: "0", stopColor: cool }), /* @__PURE__ */ _h("stop", { offset: "0.3", stopColor: molten > 0.4 ? mid : cool }), /* @__PURE__ */ _h("stop", { offset: "0.5", stopColor: molten > 0.6 ? hot : mid }), /* @__PURE__ */ _h("stop", { offset: "0.7", stopColor: molten > 0.4 ? mid : cool }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: cool })), /* @__PURE__ */ _h("radialGradient", { id: "nkAtm" }, /* @__PURE__ */ _h("stop", { offset: (R - 6) / (R + 40), stopColor: "oklch(0.7 0.06 245)", stopOpacity: "0" }), /* @__PURE__ */ _h("stop", { offset: (R + 4) / (R + 40), stopColor: "oklch(0.7 0.06 245)", stopOpacity: "0.45" }), /* @__PURE__ */ _h("stop", { offset: "1", stopColor: "oklch(0.7 0.06 245)", stopOpacity: "0" })), /* @__PURE__ */ _h("clipPath", { id: "nkC" }, /* @__PURE__ */ _h("circle", { cx: "0", cy: "0", r: R })), /* @__PURE__ */ _h("clipPath", { id: "nkL" }, /* @__PURE__ */ _h("polygon", { points: `-420,-420 0,-420 ${seamPts} 0,420 -420,420` })), /* @__PURE__ */ _h("clipPath", { id: "nkR" }, /* @__PURE__ */ _h("polygon", { points: `0,-420 420,-420 420,420 0,420 ${seamRev}` }))), /* @__PURE__ */ _h("circle", { cx: 0, cy: 0, r: R + 40, fill: "url(#nkAtm)", opacity: 1 - Math.min(1, split * 1.6) }), dt > 0 ? /* @__PURE__ */ _h("ellipse", { cx: 0, cy: 0, rx: 60 + split * 200, ry: R * (0.7 + split * 0.4), fill: "url(#nkCore)", opacity: molten }) : null, /* @__PURE__ */ _h("g", { transform: `translate(${-sep} ${split * 34}) rotate(${-rot})` }, body("nkL", -1), face(1)), /* @__PURE__ */ _h("g", { transform: `translate(${sep} ${-split * 34}) rotate(${rot})` }, body("nkR", 1), face(-1)), dt > 0 ? CHUNKS.map((c, i) => {
        const e = 1 - Math.exp(-dt / 2.5);
        const px = c.x + c.vx * (e * 2.5 + dt * 0.25), py = c.y + c.vy * (e * 2.5 + dt * 0.25);
        const glow = Math.exp(-dt / (2 + c.size * 0.15));
        return /* @__PURE__ */ _h("g", { key: i, transform: `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${(c.spin * dt).toFixed(1)})` }, /* @__PURE__ */ _h("polygon", { points: c.poly, fill: "oklch(0.22 0.02 40)", stroke: glow > 0.1 ? mid : "oklch(0.3 0.02 40)", strokeWidth: 1.5 }), glow > 0.05 ? /* @__PURE__ */ _h("polygon", { points: c.poly, fill: hot, opacity: glow * 0.8, transform: "scale(0.55)" }) : null);
      }) : null, dt > 0 && ring < 1 ? /* @__PURE__ */ _h("ellipse", { cx: 0, cy: 0, rx: R * (1 + ring * 2.6), ry: R * (1 + ring * 2.6) * 0.14, fill: "none", stroke: hot, strokeWidth: 14 * (1 - ring) + 2, opacity: (1 - ring) * 0.8 }) : null, dt > 0 && ring < 1 ? /* @__PURE__ */ _h("ellipse", { cx: 0, cy: 0, rx: R * (1 + ring * 2.6), ry: R * (1 + ring * 2.6) * 0.14, fill: "none", stroke: mid, strokeWidth: 60 * (1 - ring), opacity: (1 - ring) * 0.25 }) : null);
    }
    function CabinScenes({ T, K }) {
      const s1 = K.Bsss, s2 = K.Versuche, s3 = K.Knopf;
      const asleep = T < s2 + 0.8;
      const b = buzz(T);
      const dodge = [s2 + 2.2, s2 + 3.4, s2 + 8.5, s2 + 14.5].reduce((o, t2) => o + M.env(T, t2 - 0.1, t2 + 1.2, 0.15, 0.8), 0);
      const mz = { x: b.x + dodge * 180, y: b.y - dodge * 140 };
      const hole = M.rise(T, s2 + 14.6, 0.2);
      let ax = 640;
      if (T > s3) ax = M.glide(T, s3, s3 + 3, 640, 960);
      const pulse = (t2) => M.env(T, t2, t2 + 0.55, 0.12, 0.35);
      let armR = 25 + 140 * pulse(s2 + 2) + 140 * pulse(s2 + 3.2);
      if (T > s2 + 6.5 && T < s2 + 11.5) armR = T < s2 + 8.4 ? M.glide(T, s2 + 6.5, s2 + 8.3, 30, 170) : M.glide(T, s2 + 8.4, s2 + 8.7, 170, 55);
      const pan = T > s2 + 6.5 && T < s2 + 11.5;
      const armL = T > s3 + 3 ? T < s3 + 19.2 ? M.glide(T, s3 + 17, s3 + 18.6, 20, 75) : M.glide(T, s3 + 19.2, s3 + 19.5, 75, 38) : void 0;
      const fh = 440, head = fh * 0.17, bodyW = fh * 0.34, armW = fh * 0.055, armH = fh * 0.3, sy = head * 1.06 + fh * 0.66 * 0.1, total = fh * 0.66 + head * 1.06;
      const ang = armR / 57.3;
      const tipX = ax - bodyW / 2 + (bodyW - armW * 0.85 + armW / 2) + armH * Math.sin(ang), tipY = 860 - total + sy + armH * Math.cos(ang);
      let cx = M.glide(T, s2 + 12, s2 + 13.5, -500, 480);
      cx -= M.glide(T, s2 + 14.5, s2 + 15, 0, 160);
      cx -= M.glide(T, s2 + 19, s2 + 21, 0, 1200);
      const muzzle = M.env(T, s2 + 14.5, s2 + 15.6, 0.05, 0.9);
      const lid = M.glide(T, s3 + 3.4, s3 + 4.6, 0, 1);
      const press = M.env(T, s3 + 19.3, s3 + 20.6, 0.1, 0.4);
      const keys = [[s1, 1, 960, 560], [s1 + 8, 1.15, 820, 580], [s1 + 26, 1.25, 860, 520], [s2, 1, 960, 560], [s2 + 12, 1, 960, 560], [s2 + 14, 0.95, 1e3, 540], [s2 + 20, 1.05, 900, 560], [s2 + 22, 1.4, 700, 500], [s2 + 28, 1.4, 700, 500], [s3, 1, 960, 560], [s3 + 6, 1.05, 820, 560], [s3 + 8, 1.6, 700, 470], [s3 + 13.5, 1.6, 700, 470], [s3 + 15, 1.15, 860, 620], [s3 + 18.6, 1.5, 760, 740], [s3 + 20.4, 1.7, 720, 760]];
      return /* @__PURE__ */ _h(Szene, { T, a: s1, b: s3 + 20.5, fade: 1.6 }, /* @__PURE__ */ _h("div", { style: cam(T, keys) }, /* @__PURE__ */ _h(Cabin, { T, hole }, /* @__PURE__ */ _h(Box, { style: { left: 600, top: 728 + press * 10, width: 70, height: 36 - press * 10, borderRadius: "35px 35px 6px 6px", background: RED, boxShadow: `0 0 ${30 + press * 60}px oklch(0.6 0.17 28 / 0.6)`, opacity: lid } }), /* @__PURE__ */ _h(Box, { style: { left: 500, top: 760, width: 280, height: 100, background: "oklch(0.2 0.03 55)", borderRadius: 4, boxShadow: `inset 0 3px 0 ${RIM}` } }), /* @__PURE__ */ _h(Box, { style: { left: 500, top: 740, width: 280, height: 26, background: "oklch(0.22 0.03 55)", borderRadius: 4, transform: `rotate(${-lid * 75}deg)`, transformOrigin: "0 100%" } }), /* @__PURE__ */ _h(Box, { style: { left: 626, top: 790, width: 28, height: 28, borderRadius: 4, background: C.goldA(0.5) } }), /* @__PURE__ */ _h(Hammock, { T }, asleep ? /* @__PURE__ */ _h(Sleeper, { x: 800, y: 640, T }) : null, /* @__PURE__ */ _h(Zs, { T, x: 570, y: 560, o: asleep ? 1 - M.env(T, s1 + 13, s1 + 30, 0.4, 0.4) : 0 })), /* @__PURE__ */ _h(Box, { style: { left: 450, top: 250, width: 390, height: 130, background: "oklch(0.22 0.02 70)", borderRadius: 4, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: 6, padding: "0 24px", boxSizing: "border-box", opacity: M.rise(T, s3 + 2, 1), fontFamily: FONT } }, /* @__PURE__ */ _h("div", { style: { fontSize: 36, fontWeight: 500, color: "oklch(0.86 0.03 80)", letterSpacing: "0.04em" } }, t("nukes.schild1", "NICHT DR\xDCCKEN.")), /* @__PURE__ */ _h("div", { style: { fontSize: 20, color: "oklch(0.74 0.03 80)" } }, t("nukes.schild2", "Auch nicht wegen M\xFCcken."))), !asleep ? /* @__PURE__ */ _h(Figure, { T, x: ax, ground: 860, h: fh, hat: true, eyes: T > s2 + 20.5 && T < s2 + 27 ? 0 : mz.x > ax ? 1 : -1, rim: RIM, armR: T > s3 ? 25 : armR, armL, walk: T > s3 && T < s3 + 3 ? ax : 0, squash: press * 0.04 }) : null, pan ? /* @__PURE__ */ _h(_Frag, null, /* @__PURE__ */ _h(Box, { style: { left: tipX - 3, top: tipY - 60, width: 8, height: 60, background: C.sil2, transform: `rotate(${-armR + 180}deg)`, transformOrigin: "50% 100%" } }), /* @__PURE__ */ _h(Box, { style: { left: tipX - 46, top: tipY - 150, width: 92, height: 92, borderRadius: "50%", background: "oklch(0.18 0.01 265)", border: "4px solid oklch(0.3 0.01 265)", transform: `rotate(${-armR + 180}deg)`, transformOrigin: "50% 150px" } })) : null, /* @__PURE__ */ _h("div", { style: { position: "absolute", left: cx, top: 860, width: 0, height: 0, transform: "rotate(-22deg)" } }, /* @__PURE__ */ _h(Cannon, { x: 0, y: 0, s: 0.85, rim: RIM })), /* @__PURE__ */ _h(Glow, { x: 1390, y: 330, w: 700, h: 600, color: "oklch(0.9 0.06 80 / 0.8)", o: muzzle }), /* @__PURE__ */ _h(Mosquito, { x: mz.x, y: mz.y, T, s: 1.6 }))));
    }
    function SeaWide({ T, K }) {
      const a = K.Knopf + 20.5, b = K.Hundert + 0.8;
      const nukes = NUKES.filter((d) => !d.planet);
      const keys = [[a, 1.15, 800, 600], [K.Zehn, 1, 960, 560], [K.Zehn + 14, 0.9, 960, 560], [K.Hundert, 0.72, 960, 540]];
      const mq = M.env(T, K.Knopf + 25.5, K.Zehn + 0.5, 0.6, 1);
      PUFFS.length = 0;
      GLUT.length = 0;
      return /* @__PURE__ */ _h(Szene, { T, a, b, bg: C.void, fade: 1e-3 }, /* @__PURE__ */ _h("div", { style: cam(T, keys) }, /* @__PURE__ */ _h(Box, { style: { left: -800, top: -800, width: W + 1600, height: 1500, background: NIGHT } }), /* @__PURE__ */ _h(Motes, { T, count: 80, size: [1, 2.2], rise: 0, drift: 0, alpha: 0.5, box: { x: -400, y: -300, w: W + 800, h: 900 }, seed: 12 }), /* @__PURE__ */ _h(Box, { style: { left: 1120, top: 230, width: 70, height: 70, borderRadius: "50%", background: "oklch(0.9 0.02 90)", boxShadow: "0 0 50px oklch(0.9 0.02 90 / 0.5)" } }), nukes.map((d, i) => /* @__PURE__ */ _h(Nuke, { key: i, T, t0: d.t, x: d.x, y: 702, s: d.s })), optionen.sparsam ? /* @__PURE__ */ _h("canvas", { male: puffsMalen, style: { position: "absolute", left: LW.x, top: LW.y, width: LW.w, height: LW.h, pointerEvents: "none" } }) : null, /* @__PURE__ */ _h(Box, { style: { left: -800, top: 180, width: W + 1600, height: 540, background: "linear-gradient(180deg, transparent, oklch(0.3 0.025 45 / 0.85) 70%, oklch(0.36 0.04 50 / 0.9))", opacity: Math.min(0.85, countAt(T) / 30) } }), /* @__PURE__ */ _h(Sea, { T, y: 700, amp: 7, shine: C.blueA(0.2) }), /* @__PURE__ */ _h(Whale, { T, a: K.Zehn + 15.5 }), /* @__PURE__ */ _h(Ship, { x: 760, y: waveY(760, T, 700, 1, 7) + 30, s: 0.5, color: C.sil2, flag: C.gold, flagWave: T * 2, rim: RIM, sail: "oklch(0.22 0.025 60)" }, /* @__PURE__ */ _h(Figure, { T, x: -60, ground: -123, h: 130, hat: true, eyes: 1, rim: RIM })), /* @__PURE__ */ _h(Box, { style: { left: -800, top: 760, width: W + 1600, height: 900, background: "linear-gradient(180deg, transparent, oklch(0.07 0.012 266 / 0.6))" } })), /* @__PURE__ */ _h(Mosquito, { x: 1320 + Math.sin(T * 2.1) * 40, y: 420 + Math.sin(T * 3.3) * 30, T, s: 6, o: mq }));
    }
    function Space({ T, K }) {
      const a = K.Hundert, b = K.Stille + 31;
      const zoom = [[a, 0.9, 960, 540], [K.Hundert + 20, 1.05, 960, 540], [K.Hundert + 24, 1, 960, 540], [K.Stille, 0.8, 960, 540], [K.Stille + 30, 0.86, 960, 560]];
      const big = M.env(T, K.Hundert + 20, K.Hundert + 23, 0.05, 2.5);
      const hammockO = M.rise(T, K.Stille + 2, 4);
      const mqT = clamp((T - (K.Stille + 15)) / 4.5, 0, 1);
      const mqx = -100 + (906 - -100) * M.glide(T, K.Stille + 15, K.Stille + 19.5, 0, 1) + (mqT < 1 ? Math.sin(T * 3) * 40 : 0);
      const mqy = 420 + (452 - 420) * mqT + (mqT < 1 ? Math.sin(T * 4.4) * 30 : 0);
      const awake = T > K.Stille + 21.5;
      return /* @__PURE__ */ _h(Szene, { T, a, b, bg: C.void, fade: 1.4 }, /* @__PURE__ */ _h(Motes, { T, count: 120, size: [1, 2.4], rise: 0, drift: 0, alpha: 0.55, seed: 14 }), /* @__PURE__ */ _h("div", { style: cam(T, zoom) }, /* @__PURE__ */ _h(Planet, { T, ts: K.Hundert + 20 }), /* @__PURE__ */ _h(Glow, { x: 960, y: 540, w: 1400, h: 1400, color: "oklch(0.92 0.06 85 / 0.9)", o: big }), /* @__PURE__ */ _h(Motes, { T, amount: M.rise(T, K.Hundert + 23.5, 2), count: 50, size: [2, 6], rise: -14, drift: 80, color: C.fireA(0.9), alpha: 0.6, box: { x: 560, y: 160, w: 800, h: 760 }, seed: 15 })), /* @__PURE__ */ _h("div", { style: { position: "absolute", left: 0, top: 0, width: W, height: H, opacity: hammockO, transform: `translate(${(Math.sin(T * 0.2) * 30).toFixed(1)}px, ${(Math.sin(T * 0.3) * 20 - 40).toFixed(1)}px) rotate(${(Math.sin(T * 0.15) * 6).toFixed(2)}deg) scale(0.8)`, transformOrigin: "760px 640px" } }, /* @__PURE__ */ _h(Glow, { x: 780, y: 640, w: 1100, h: 600, color: C.goldA(0.16) }), /* @__PURE__ */ _h(Hammock, { T, rope: 0 }, /* @__PURE__ */ _h(Sleeper, { x: 800, y: 640, T, eyes: awake ? "open" : "closed", hatOn: true, lit: 1 }))), /* @__PURE__ */ _h(Mosquito, { x: mqx, y: mqy, T, s: 1.6, o: mqT > 0 ? 1 : 0 }));
    }
    const MUECKE = t("nukes.wer.muecke", "M\xFCcke"), KAPITAEN = t("nukes.wer.kapitaen", "Kapit\xE4n \xC4ndii");
    const LINES = [
      [8, 12, t("nukes.l1", "Es war 03:12 Uhr.")],
      [14, 17, t("nukes.bsss", "Bsss."), MUECKE],
      [19, 22.5, t("nukes.l3", "Nein."), KAPITAEN],
      [25, 29, t("nukes.bsss", "Bsss."), MUECKE],
      [31, 35, t("nukes.l5", "Versuch 1: Hand. Daneben.")],
      [37, 41, t("nukes.l6", "Versuch 2: Pfanne. Daneben.")],
      [43, 48.5, t("nukes.l7", "Versuch 3: Kanone. Daneben. Die Kaj\xFCte hat jetzt Meerblick.")],
      [51, 55.5, t("nukes.l8", "Gut. Dann eben anders."), KAPITAEN],
      [57, 59.5, t("nukes.bsss", "Bsss."), MUECKE],
      [61.5, 66, t("nukes.l10", "Jedes Schiff hat einen Knopf f\xFCr Notf\xE4lle.")],
      [68, 73, t("nukes.l11", "Dieser war f\xFCr echte Notf\xE4lle.")],
      [74.8, 78.4, t("nukes.l12", "Das ist ein echter Notfall."), KAPITAEN],
      [86, 89.5, t("nukes.bsss", "Bsss."), MUECKE],
      [92, 96, t("nukes.l14", "Atombombe 2. Daneben.")],
      [99, 103.5, t("nukes.l15", "Atombomben 3 bis 10. Auch daneben.")],
      [106, 110.5, t("nukes.l16", "Ein Wal hat sich beschwert.")],
      [113, 119, t("nukes.l17", "Die M\xFCcke hat sich nicht beschwert. Die M\xFCcke sagte: Bsss.")],
      [122, 127, t("nukes.l18", "Bei Atombombe 50 rief die Marine an.")],
      [129, 133, t("nukes.l19", "Bei 80 rief niemand mehr an.")],
      [135.5, 139, t("nukes.l20", "Bei 99 z\xF6gerte er kurz.")],
      [140.6, 143.4, "100.", null, "c"],
      [145, 149.5, t("nukes.l22", "Die Erde besteht jetzt aus zwei Teilen.")],
      [159, 163, t("nukes.l23", "Endlich Ruhe."), KAPITAEN],
      [170, 172.2, t("nukes.bsss", "Bsss."), MUECKE],
      [173, 176, t("nukes.l25", "\u2026 Wo ist der Knopf?"), KAPITAEN]
    ];
    function Counter({ T, a, b }) {
      const o = M.env(T, a, b, 0.4, 0.8);
      if (o <= 0) return null;
      const n = countAt(T);
      const pop = 1 + (1 - M.rise(T, lastAt(T), 0.35)) * 0.12;
      return /* @__PURE__ */ _h("div", { style: { position: "absolute", right: 140, top: 116, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, opacity: o, fontFamily: FONT, textShadow: TEXT_SHADOW } }, /* @__PURE__ */ _h("div", { style: { fontSize: 20, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted } }, t("nukes.zaehler", "Atombomben")), /* @__PURE__ */ _h("div", { style: { display: "flex", alignItems: "baseline", gap: 12 } }, /* @__PURE__ */ _h("div", { style: { fontSize: 88, fontWeight: 500, color: C.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", transform: `scale(${pop.toFixed(3)})`, transformOrigin: "0 80%" } }, String(n).padStart(3, "0")), /* @__PURE__ */ _h("div", { style: { fontSize: 36, color: C.muted, fontVariantNumeric: "tabular-nums" } }, "/ 100")), /* @__PURE__ */ _h("div", { style: { width: 220 * n / 100, height: 2, background: C.accent } }));
    }
    const SmokeDefs = () => /* @__PURE__ */ _h("svg", { width: "0", height: "0", style: { position: "absolute" } }, /* @__PURE__ */ _h("defs", null, /* @__PURE__ */ _h("filter", { id: "nkSmokeN", x: "-30%", y: "-30%", width: "160%", height: "160%" }, /* @__PURE__ */ _h("feTurbulence", { type: "fractalNoise", baseFrequency: "0.011 0.016", numOctaves: "4", seed: "7", result: "n" }), /* @__PURE__ */ _h("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "46", xChannelSelector: "R", yChannelSelector: "G", result: "d" }), /* @__PURE__ */ _h("feGaussianBlur", { in: "d", stdDeviation: "2.2" })), /* @__PURE__ */ _h("filter", { id: "nkSmokeF", x: "-30%", y: "-30%", width: "160%", height: "160%" }, /* @__PURE__ */ _h("feTurbulence", { type: "fractalNoise", baseFrequency: "0.02 0.028", numOctaves: "3", seed: "3", result: "n" }), /* @__PURE__ */ _h("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "22", xChannelSelector: "R", yChannelSelector: "G", result: "d" }), /* @__PURE__ */ _h("feGaussianBlur", { in: "d", stdDeviation: "1.4" })), /* @__PURE__ */ _h("filter", { id: "nkRock" }, /* @__PURE__ */ _h("feTurbulence", { type: "fractalNoise", baseFrequency: "0.05", numOctaves: "2", seed: "5", result: "n" }), /* @__PURE__ */ _h("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "6" }))));
    function Piece({ T, CUES }) {
      const K = CUES;
      let flash = 0;
      for (const d of NUKES) if (!d.planet && T >= d.t && T < d.t + 1) flash = Math.max(flash, (1 - (T - d.t)) * d.s * 0.7);
      return /* @__PURE__ */ _h(_Frag, null, /* @__PURE__ */ _h(SmokeDefs, null), /* @__PURE__ */ _h(CabinScenes, { T, K }), /* @__PURE__ */ _h(SeaWide, { T, K }), /* @__PURE__ */ _h(Space, { T, K }), flash > 0.01 ? /* @__PURE__ */ _h("div", { style: { position: "absolute", inset: 0, background: "oklch(0.95 0.04 85)", opacity: flash * BLITZ } }) : null);
    }
    function Over({ T, CUES }) {
      const K = CUES;
      return /* @__PURE__ */ _h(_Frag, null, /* @__PURE__ */ _h(Black, { o: M.glide(T, K.Stille + 25.8, K.Stille + 27, 0, 0.85) }), /* @__PURE__ */ _h(TitleCard, { T, a: K.Bsss + 0.4, b: K.Bsss + 7.4, kicker: t("nukes.kicker", "Eine v\xF6llig angemessene Reaktion"), title: t("nukes.titel", "Hundert Atombomben gegen eine M\xFCcke") }), /* @__PURE__ */ _h(ChapterCard, { T, at: K.Versuche + 0.3, n: 1, title: t("nukes.k1", "Konventionelle Mittel") }), /* @__PURE__ */ _h(ChapterCard, { T, at: K.Knopf + 0.3, n: 2, title: t("nukes.k2", "Der Knopf") }), /* @__PURE__ */ _h(ChapterCard, { T, at: K.Zehn + 0.3, n: 3, title: t("nukes.k3", "Zehn") }), /* @__PURE__ */ _h(ChapterCard, { T, at: K.Hundert + 0.6, n: 4, title: t("nukes.k4", "Hundert") }), /* @__PURE__ */ _h(ChapterCard, { T, at: K.Stille + 1, n: 5, title: t("nukes.k5", "Stille") }), /* @__PURE__ */ _h(Counter, { T, a: K.Knopf + 19.6, b: K.Stille + 26 }), /* @__PURE__ */ _h(Subs, { T, lines: LINES }), /* @__PURE__ */ _h(TitleCard, { T, a: K.Stille + 26.3, b: K.Stille + 30.2, kicker: t("nukes.bilanz", "Bilanz"), title: t("nukes.ende", "100 Atombomben. 0 M\xFCcken."), sub: t("nukes.gruss", "Die M\xFCcke l\xE4sst gr\xFC\xDFen.") }));
    }
    return film(Piece, Over);
  }
  /* eslint-enable */

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
    qualitaetPruefen(lauf, jetzt);
    const T = Math.min(DAUER, (jetzt - lauf.t0) / 1000 + lauf.ab);
    zeichnen(lauf.buehne, [lauf.film({ T: T, CUES: CUES })], false);
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
    wurzel.id = "fh-nukes";
    wurzel.className = "fh-riss";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("nukes.aria", "Live-Story: Hundert Atombomben gegen eine Mücke"));
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
    if (opts.sparsam) { optionen.sparsam = true; optionen.rauch = false; }   // fuer Tests
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

  window.fhNukesFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    /* Fuer Tests: aktuelle Qualitaetsstufe ({ rauch, sparsam, blitz }). */
    qualitaet: function () { return optionen ? Object.assign({}, optionen) : null; },
    DAUER: DAUER,
  };
})();
