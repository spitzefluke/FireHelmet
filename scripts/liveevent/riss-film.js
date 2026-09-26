/* ======================================================
   LIVE-STORY "DER RISS" (Migration 32)
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Der Riss" (riss-film.jsx):
   ein 5-Minuten-Film, der das naechste Event vorbereitet.

     Gekapert 0 s · Notfall 18 · Wiederherstellung 40 · Fehler 75 ·
     Rueckschlag 100 · Ausfall 125 · Stille 150 · Riss 168 · Sog 195 ·
     Raum 215 · Zeit 250 · Ankunft 282 · Ende 300

   Dave holt sich das Schiff mit Romnas Backup zurueck, bei 87 %
   bricht das Kern-System ab, ??? uebernimmt wieder, alles faellt
   aus - dann reisst ein Lichtpunkt die Seite auf, und die Crew
   fliegt durch Raum und Zeit bis ins Jahr 1720.

   WIE ES GEBAUT IST
   Der Entwurf ist React: eine reine Funktion der Zeit T, die jedes
   Bild neu beschreibt. Die Seite hat kein React und keinen Build.
   Darum:
   - Der Filmteil unten (in baueFilm) ist der Entwurf, einmalig mit
     esbuild von JSX in Aufrufe von _h() uebersetzt; die Texte laufen
     ueber L()/t() (i18n.js: riss.*, fuer die Kapitel home.kap*).
   - _h() baut einen kleinen Baum, zeichnen() gleicht ihn Knoten fuer
     Knoten mit dem DOM ab und setzt nur, was sich geaendert hat.
   - Die Buehne ist 1920 x 1080 und wird eingepasst (schwarzer Rand).
     Hoechstens 30 Bilder pro Sekunde.

   live-storys.js startet den Film in der Story "riss" und reicht
   die Stelle mit, an der ein Zuschauer einsteigt:
     fhRissFilm.start({ ab: ms, vorschau })
     fhRissFilm.ende()   - Story vorbei: kurz ausblenden
     fhRissFilm.weg()    - abgebrochen: sofort weg

   Alle Texte sind fest (keine Daten aus der Datenbank), der Baum
   setzt sie trotzdem nur als Textknoten.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function L(key, de) { return t("riss." + key, de); }
  function istEn() { return typeof getCurrentLang === "function" && getCurrentLang() === "en"; }

  /* ------------------------------------------------------
     ZEIT-HELFER (aus animations-v3.jsx des Entwurfs)
  ------------------------------------------------------ */
  const Easing = {
    linear: (x) => x,
    easeInQuad: (x) => x * x,
    easeInCubic: (x) => x * x * x,
    easeOutCubic: (x) => (--x) * x * x + 1,
    easeInOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : (x - 1) * (2 * x - 2) * (2 * x - 2) + 1),
    easeInExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * (x - 1))),
    easeOutExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    easeOutBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function interpolate(input, output, ease) {
    ease = ease || Easing.linear;
    return function (x) {
      if (x <= input[0]) return output[0];
      if (x >= input[input.length - 1]) return output[output.length - 1];
      for (let i = 0; i < input.length - 1; i++) {
        if (x >= input[i] && x <= input[i + 1]) {
          const span = input[i + 1] - input[i];
          const local = span === 0 ? 0 : (x - input[i]) / span;
          return output[i] + (output[i + 1] - output[i]) * ease(local);
        }
      }
      return output[output.length - 1];
    };
  }
  function animate(o) {
    const from = o.from, to = o.to, start = o.start, end = o.end, ease = o.ease || Easing.easeInOutCubic;
    return function (x) {
      if (x <= start) return from;
      if (x >= end) return to;
      return from + (to - from) * ease((x - start) / (end - start));
    };
  }

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
  const SVG_TAGS = { svg: 1, g: 1, path: 1, defs: 1, linearGradient: 1, stop: 1, filter: 1, feGaussianBlur: 1 };
  const SVG_CAMEL = { viewBox: 1, stdDeviation: 1, pathLength: 1 };

  function attrsSetzen(el, p, svg) {
    const alt = el.__p || {};
    for (const k in p) {
      if (k === "key" || k === "children") continue;
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
     DER FILM (aus riss-film.jsx, uebersetzt)
     In einer Funktion, damit die Texte in der Sprache stehen, die
     beim Start gilt.
  ------------------------------------------------------ */
  function baueFilm() {
    const EN = istEn();
    const SPRACHE = EN ? "EN" : "DE";

    const C = {
      bg: "#05070b",
      page: "#02030a",
      fg: "#e8edf4",
      surface: "#0d1520",
      surface2: "#111a26",
      border: "#1c2a3a",
      borderStrong: "#2c3f56",
      muted: "#162231",
      mutedFg: "#8296ad",
      gold: "#d6a84f",
      goldBright: "#f0c96a",
      fire: "#ff6a2a",
      fireDeep: "#d9431e",
      danger: "#e53935",
      success: "#55c878",
      cold: "#42b8ff",
      neon: "#39ff14",
      surfaceLight: "#14202f",
      blue: "#2a4a72",
      lead: "#a6b6c9"
    };
    const F_DISPLAY = "'Oswald', 'Arial Narrow', sans-serif";
    const F_SANS = "'Inter', ui-sans-serif, system-ui, sans-serif";
    const F_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    const SITE_W = 1440, SITE_H = 810, BASE = 1920 / SITE_W;
    const MOTION = { enter: Easing.easeOutCubic, draw: Easing.easeInOutCubic, pop: Easing.easeOutBack };
    const tw = (T, a, b, from, to, ease) => animate({ from, to, start: a, end: b, ease: ease || MOTION.draw })(T);
    const rnd = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const flick = (T, rate, seed, p) => rnd(Math.floor(T * rate) + seed * 977) < p;
    const typed = (T, text, start, cps) => text.slice(0, Math.max(0, Math.floor((T - start) * (cps || 26))));
    const win = (T, a, b, f) => {
      f = f || 0.4;
      return Math.max(0, Math.min(tw(T, a, a + f, 0, 1, MOTION.enter), tw(T, b - f, b, 1, 0, MOTION.draw)));
    };
    const popS = (T, a) => tw(T, a, a + 0.45, 0.9, 1, MOTION.pop);
    const GLYPHS = "ABCDEF0123456789#$%&@XYZ<>/";
    const glyph = (n) => GLYPHS[Math.floor(rnd(n) * GLYPHS.length)];
    const N = {
      // Nocturne-Töne für die Welt hinter dem Riss (styles.css-Rampe)
      a100: "#f5f4ff",
      a200: "#e7e5fe",
      a300: "#d2cefd",
      a400: "#b5abfc",
      a500: "#968ae0",
      a600: "#796cbf",
      a700: "#5d5294",
      a800: "#423a6a",
      a900: "#2b2741",
      bg: "#161826",
      section: "#262a60",
      glow: "#353b80",
      ghost: "#4c5397",
      text: "#e9e9ed"
    };
    const deadStyle = (a) => a ? {} : { filter: "grayscale(1) brightness(.45)", opacity: 0.55 };
    const OFF = { topbar: 126, sidebar: 127.5, head: 133.2, bg: 134.5 };
    const SURGE = [142, 142.35];
    function power(T, off) {
      if (T >= SURGE[0] && T < SURGE[1] && off < SURGE[0]) return flick(T, 30, 3, 0.6) ? 1 : 0.5;
      if (T < off - 0.7) return 1;
      if (T < off) return flick(T, 18, off, 0.5) ? 0.2 : 1;
      return 0;
    }
    function okState(T, r, h) {
      if (T >= r - 0.5 && T < r || T >= h - 0.5 && T < h) return flick(T, 20, r + h, 0.5);
      return T >= r && T < h;
    }
    function jitter(T, seed) {
      let p = 0;
      if (T > 78 && T < 80) p = 0.3;
      if (T > 100 && T < 125) p = 0.12 + (T - 100) / 25 * 0.35;
      if (!p) return 0;
      return flick(T, 12, seed, p) ? (rnd(Math.floor(T * 12) + seed) - 0.5) * 18 : 0;
    }
    const STARS = Array.from({ length: 120 }, (_, i) => ({ x: rnd(i * 3.1) * SITE_W, y: rnd(i * 7.7 + 2) * SITE_H, r: 0.6 + rnd(i * 1.3) * 1.4, p: rnd(i * 9.1) * 6.28 }));
    function Background({ T }) {
      const pw = power(T, OFF.bg);
      return _h("div", { style: { position: "absolute", inset: 0, background: C.page } }, _h("div", { style: { position: "absolute", inset: 0, opacity: pw, background: "radial-gradient(60% 50% at 78% 18%, rgba(240,201,106,.07), transparent 70%), radial-gradient(70% 60% at 20% 90%, rgba(42,74,114,.22), transparent 70%), radial-gradient(50% 40% at 10% 40%, rgba(217,67,30,.06), transparent 70%)" } }), _h("div", { style: { position: "absolute", inset: 0, opacity: pw } }, STARS.map((s, i) => _h("span", { key: i, style: { position: "absolute", left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: "50%", background: "#dfe6f0", opacity: 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(T * 0.9 + s.p)) } }))));
    }
    const NAV = [
      ["ph-sign-in", "login"],
      "|",
      ["ph-house", "home"],
      ["ph-chart-line-up", "stand"],
      ["ph-book-open-text", "story"],
      ["ph-users-three", "characters"],
      ["ph-globe-hemisphere-west", "socials"],
      "|",
      ["ph-shopping-cart-simple", "shop"],
      ["ph-key", "code"],
      ["ph-compass", "wheel"],
      ["ph-dice-five", L("rArcade", "spielothek")],
      ["ph-trophy", "leaderboard"],
      ["ph-crown-simple", "tournament"],
      ["ph-flag-checkered", "race"],
      ["ph-skull", "community-boss"],
      ["ph-question", "streamraetsel"],
      ["ph-tree-structure", "skill-tree"],
      "|",
      ["ph-lifebuoy", "support"],
      ["ph-star", "rating"],
      ["ph-medal", "dave"]
    ];
    function Sidebar({ T, hack }) {
      let sep = 0;
      return _h("div", { style: { position: "absolute", left: 0, top: 0, width: 76, height: SITE_H, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0 10px", background: "rgba(11,18,28,.86)", borderRight: `1px solid ${C.border}`, opacity: power(T, OFF.sidebar), boxSizing: "border-box" } }, _h("div", { style: { display: "flex", justifyContent: "center", padding: "0 0 4px" } }, _h("div", { style: { width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: C.fg, background: hack > 0.5 ? "linear-gradient(135deg, #1a5c12, #0c2410)" : `linear-gradient(135deg, ${C.fire}, ${C.fireDeep})`, boxShadow: hack > 0.5 ? "0 0 22px -6px rgba(57,255,20,.85)" : "0 0 22px -6px rgba(255,106,42,.85)" } }, _h("i", { className: hack > 0.5 ? "ph ph-skull" : "ph ph-fire" }))), _h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", marginTop: 14, gap: 6, padding: "2px 0", flex: 1, minHeight: 0, overflow: "hidden", WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)", maskImage: "linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)" } }, NAV.map((n, i) => {
        if (n === "|") {
          sep++;
          return _h("div", { key: i, style: { flex: "0 0 auto", width: 34, height: 1, margin: sep === 1 ? "4px 0 8px" : "10px 0 8px", background: `linear-gradient(90deg, transparent, ${C.borderStrong}, transparent)` } });
        }
        const active = n[1] === "stand";
        const a = navOk(T, n[1]);
        const green = !a;
        return _h("div", { key: i, style: { position: "relative", flex: "0 0 auto", width: 44, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: green ? "rgba(57,255,20,.35)" : active ? C.goldBright : C.mutedFg, background: active && a ? "rgba(214,168,79,.14)" : "transparent" } }, active && a ? _h("span", { style: { position: "absolute", left: -16, top: "50%", transform: "translateY(-50%)", width: 3, height: 22, borderRadius: "0 3px 3px 0", background: C.gold, boxShadow: "0 0 12px rgba(240,201,106,.9)" } }) : null, _h("i", { className: "ph " + (green ? "ph-lock-simple" : n[0]) }));
      })), _h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0 0" } }, _h("img", { src: "scripts/avatare/1.png", style: { width: 34, height: 34, borderRadius: "50%", border: `2px solid ${C.borderStrong}`, objectFit: "cover" } }), _h("span", { style: { fontSize: 14, color: C.mutedFg } }, "⚙")));
    }
    const COL = [202, 578, 954], CW = 360, R1 = 290, R1H = 190, R2 = 496, R2H = 214;
    const cardBase = { position: "absolute", display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: 14, border: `1px solid ${C.border}`, background: `linear-gradient(160deg, ${C.surfaceLight}, #0b111a)`, boxSizing: "border-box" };
    const kicker = { margin: 0, fontFamily: F_DISPLAY, fontSize: 10, fontWeight: 500, letterSpacing: ".28em", textTransform: "uppercase", color: C.mutedFg };
    const ctitle = { margin: 0, fontFamily: F_DISPLAY, fontSize: 24, fontWeight: 500, letterSpacing: ".02em", color: C.fg };
    const note = { margin: 0, fontSize: 13, color: C.mutedFg, fontFamily: F_SANS };
    const noteSm = { ...note, fontSize: 12, fontVariantNumeric: "tabular-nums" };
    const figVal = { fontFamily: F_DISPLAY, fontSize: 34, fontWeight: 600, lineHeight: 1, color: C.fg, fontVariantNumeric: "tabular-nums" };
    function Head({ k, icon, color }) {
      return _h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } }, _h("p", { style: kicker }, k), _h("i", { className: "ph " + icon, style: { fontSize: 20, lineHeight: 1, color } }));
    }
    function Bar({ p, bg }) {
      return _h("div", { style: { height: 6, borderRadius: 99, background: "rgba(255,255,255,.07)", overflow: "hidden" } }, _h("div", { style: { height: "100%", width: p + "%", borderRadius: "inherit", background: bg } }));
    }
    function Cta({ label, icon, hover }) {
      return _h("span", { style: { display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 9, border: `1px solid ${hover ? C.goldBright : "rgba(214,168,79,.55)"}`, background: hover ? "rgba(214,168,79,.12)" : "none", color: C.goldBright, fontFamily: F_DISPLAY, fontSize: 13, fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase" } }, _h("i", { className: "ph " + icon, style: { fontSize: 16 } }), _h("span", null, label));
    }
    const spacer = _h("div", { style: { flex: 1, minHeight: 4 } });
    function Page({ T }) {
      const cards = CARDS;
      const hover = false;
      const body = {
        read: () => _h(_Frag, null, _h("img", { src: "scripts/image/logbuch2.webp", style: { flex: "0 0 auto", width: 108, height: 148, borderRadius: 10, border: `1px solid ${C.borderStrong}`, objectFit: "cover" } }), _h("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 } }, _h(Head, { k: L("read", "Weiterlesen"), icon: "ph-book-open-text", color: C.goldBright }), _h("h3", { style: ctitle }, t("home.kap2Titel", "Fünf Schlösser, kein Schlüssel")), _h("p", { style: note }, L("logbook2", "Logbuch II")), _h(Bar, { p: 50, bg: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})` }), _h("p", { style: noteSm }, L("chaptersRead", "4 / 8 Kapitel gelesen")), spacer, _h(Cta, { label: L("openChapter", "Kapitel öffnen"), icon: "ph-book-open-text" }))),
        wheel: () => _h(_Frag, null, _h(Head, { k: L("wheel", "Schatzrad"), icon: "ph-compass", color: C.goldBright }), _h("h3", { style: ctitle }, L("spinFree", "Dreh frei")), _h("p", { style: note }, L("days3", "3 Tage in Folge")), spacer, _h(Cta, { label: L("toWheel", "Zum Schatzrad"), icon: "ph-arrows-clockwise", hover })),
        race: () => _h(_Frag, null, _h(Head, { k: L("race", "Wochenrennen"), icon: "ph-flag-checkered", color: C.cold }), _h("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } }, _h("span", { style: figVal }, "86"), _h("span", { style: note }, L("of150", "von 150"))), _h("p", { style: note }, L("course", "Strecke: Kielwasser")), _h(Bar, { p: 57, bg: `linear-gradient(90deg, ${C.blue}, ${C.cold})` }), _h("p", { style: noteSm }, L("raceRule", "+2 pro Drehung · +5 pro Code")), spacer, _h(Cta, { label: L("toRace", "Zum Rennen"), icon: "ph-flag-checkered" })),
        code: () => _h(_Frag, null, _h(Head, { k: L("code", "Geheimcode"), icon: "ph-key", color: C.goldBright }), _h("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } }, _h("span", { style: figVal }, "7"), _h("span", { style: note }, L("of12", "von 12"))), _h(Bar, { p: 58, bg: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})` }), _h("p", { style: noteSm }, L("codesLeft", "5 noch nicht geknackt")), spacer, _h(Cta, { label: L("enterCode", "Code eingeben"), icon: "ph-arrow-right" })),
        board: () => _h(_Frag, null, _h(Head, { k: L("board", "Rangliste"), icon: "ph-trophy", color: C.goldBright }), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, [["1", "scripts/avatare/3.png", "Zugfahrer_Dave", "4.820"], ["2", "scripts/avatare/5.png", "Flitzpiepe", "3.910"], ["3", "scripts/avatare/1.png", L("you", "Du"), "2.140"]].map((r) => _h("div", { key: r[0], style: { display: "flex", alignItems: "center", gap: 10 } }, _h("span", { style: { width: 18, fontFamily: F_DISPLAY, fontSize: 15, color: C.mutedFg } }, r[0]), _h("img", { src: r[1], style: { width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.borderStrong}`, objectFit: "cover" } }), _h("span", { style: { flex: 1, minWidth: 0, fontSize: 14, color: C.fg, fontFamily: F_SANS } }, r[2]), _h("span", { style: { fontSize: 13, color: C.mutedFg, fontVariantNumeric: "tabular-nums", fontFamily: F_SANS } }, r[3])))))
      };
      const headPw = power(T, OFF.head);
      return _h(_Frag, null, _h("div", { style: { position: "absolute", left: 202, width: 1112, top: 104, textAlign: "center", opacity: headPw, transform: `translateX(${jitter(T, 9)}px)` } }, _h("p", { style: { margin: "0 0 10px", fontFamily: F_DISPLAY, fontSize: 11, fontWeight: 500, letterSpacing: ".42em", textTransform: "uppercase", color: C.goldBright } }, L("logbook", "Logbuch")), _h("h1", { style: { margin: 0, fontFamily: F_DISPLAY, fontSize: 56, fontWeight: 500, lineHeight: 1, letterSpacing: ".03em", color: C.fg, textShadow: "0 0 50px rgba(240,201,106,.3)" } }, L("standTitle", "Dein Stand")), _h("p", { style: { margin: "14px auto 0", maxWidth: "62ch", fontSize: 16, lineHeight: 1.55, color: C.lead, fontFamily: F_SANS } }, L("standLead", "Wo du überall stehengeblieben bist – auf einen Blick."))), cards.map((c, i) => {
        const a = okState(T, c.restore, c.rehack);
        const glow = win(T, c.restore, c.restore + 1.6, 0.15);
        const gold = c.id === "wheel";
        return _h("div", { key: c.id, style: { ...cardBase, left: c.x, top: c.y, width: c.w, height: c.h, flexDirection: c.id === "read" ? "row" : "column", gap: c.id === "read" ? 16 : 12, borderColor: !a ? "rgba(57,255,20,.25)" : gold ? "rgba(214,168,79,.32)" : C.border, background: gold ? "linear-gradient(160deg, rgba(32,26,14,.9), #0b111a)" : cardBase.background, opacity: power(T, c.off), transform: `translateX(${jitter(T, i + 2)}px)`, boxShadow: glow > 0 ? `0 0 ${40 * glow}px rgba(240,201,106,${0.5 * glow})` : "none" } }, _h("div", { style: { display: "flex", flexDirection: c.id === "read" ? "row" : "column", gap: c.id === "read" ? 16 : 12, flex: 1, minHeight: 0, ...deadStyle(a) } }, body[c.id]()), !a ? _h("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "rgba(3,10,5,.55)", fontFamily: F_MONO, fontSize: 13, letterSpacing: ".2em", textTransform: "uppercase", color: C.neon, textShadow: "0 0 8px rgba(57,255,20,.6)" } }, L("takenOver", "übernommen")) : null);
      }));
    }
    const CARDS = [
      { id: "read", x: COL[0], y: R1, w: CW * 2 + 16, h: R1H, restore: 56, rehack: 103, off: 129 },
      { id: "wheel", x: COL[2], y: R1, w: CW, h: R1H, restore: 44, rehack: 101, off: 129.8 },
      { id: "race", x: COL[0], y: R2, w: CW, h: R2H, restore: 52, rehack: 102.4, off: 130.6 },
      { id: "code", x: COL[1], y: R2, w: CW, h: R2H, restore: 48, rehack: 101.7, off: 131.4 },
      { id: "board", x: COL[2], y: R2, w: CW, h: R2H, restore: 60, rehack: 104, off: 132.2 }
    ];
    const NAV_IDX = {};
    NAV.filter((n) => n !== "|").forEach((n, j) => {
      NAV_IDX[n[1]] = j;
    });
    const navOk = (T, id) => {
      const j = NAV_IDX[id];
      return okState(T, 42 + j * 1.6, 100.5 + j * 0.35);
    };
    const CAM = [
      [0, 1.28, 758, 420],
      [7, 1, 720, 405],
      [18, 1, 720, 405],
      [21, 1.36, 758, 330],
      [36, 1.38, 758, 450],
      [40, 1, 720, 405],
      [43, 1.12, 1134, 385],
      [47, 1.12, 750, 600],
      [51, 1.12, 400, 600],
      [55, 1.12, 560, 385],
      [59, 1.12, 1134, 600],
      [63, 1.45, 1260, 70],
      [67, 1.05, 720, 420],
      [73, 1.18, 758, 700],
      [76, 1.3, 758, 380],
      [97, 1.34, 758, 440],
      [100, 1, 720, 405],
      [110, 1.14, 758, 405],
      [124, 1.34, 758, 405],
      [126, 1, 720, 405],
      [150, 1, 720, 405]
    ];
    const camT = CAM.map((k) => k[0]);
    const camZ = interpolate(camT, CAM.map((k) => k[1]), MOTION.draw);
    const camX = interpolate(camT, CAM.map((k) => k[2]), MOTION.draw);
    const camY = interpolate(camT, CAM.map((k) => k[3]), MOTION.draw);
    function shakeAmt(T) {
      let a = 0;
      if (T > 78 && T < 80.5) a += tw(T, 78, 80.2, 12, 0, MOTION.enter);
      if (T > 100 && T < 125) a += 2 + (T - 100) * 0.34;
      if (T > 125 && T < 146) a += flick(T, 8, 5, 0.3) ? 6 : 0;
      if (T > 170 && T < 195) a += 1.5 + Math.abs(Math.sin(T * 5.3)) * 2;
      if (T > 195 && T < 215) a += tw(T, 195, 214.5, 3, 14, Easing.easeInCubic);
      if (T > 222 && T < 280) a += 1.2;
      return a;
    }
    function coinsState(T) {
      if (T < 64) return { txt: "???", red: true, mono: true };
      if (T < 66) return { txt: Math.round(tw(T, 64, 66, 0, 1250, MOTION.enter)).toLocaleString(EN ? "en-US" : "de-DE"), red: false };
      if (T < 102) return { txt: L("coins", "1.250"), red: false };
      if (T < 102.6) return flick(T, 20, 7, 0.5) ? { txt: "???", red: true, mono: true } : { txt: L("coins", "1.250"), red: false };
      return { txt: "???", red: true, mono: true };
    }
    function Topbar({ T }) {
      const c = coinsState(T);
      const pill = { display: "inline-flex", alignItems: "center", justifyContent: "center", height: 34, borderRadius: 999, border: "1px solid " + C.border, background: "rgba(13,21,32,.8)", color: C.mutedFg, boxSizing: "border-box" };
      const glow = win(T, 64, 66.5, 0.2);
      return _h("div", { style: { position: "absolute", left: 76, right: 0, top: 0, height: 60, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "linear-gradient(180deg, rgba(5,7,11,.78), rgba(5,7,11,0))", opacity: power(T, OFF.topbar), boxSizing: "border-box" } }, _h("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 240, padding: "8px 12px", borderRadius: 999, border: "1px solid " + C.border, background: "rgba(13,21,32,.8)", color: C.mutedFg, fontFamily: F_SANS, fontSize: 13, boxSizing: "border-box" } }, _h("i", { className: "ph ph-magnifying-glass", style: { fontSize: 16 } }), _h("span", { style: { flex: "1 1 auto" } }, L("search", "Seite suchen")), _h("span", { style: { padding: "2px 6px", borderRadius: 5, border: "1px solid " + C.borderStrong, background: C.surface, fontSize: 11 } }, L("searchKey", "Strg K"))), _h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, _h("span", { style: { display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 999, border: c.red ? "1px solid rgba(229,57,53,.55)" : "1px solid rgba(214,168,79,.35)", background: c.red ? "rgba(229,57,53,.08)" : "rgba(214,168,79,.08)", color: c.red ? C.danger : C.goldBright, fontFamily: c.mono ? F_MONO : F_DISPLAY, fontSize: 14, letterSpacing: ".04em", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", boxShadow: glow > 0 ? "0 0 " + 24 * glow + "px rgba(240,201,106," + 0.6 * glow + ")" : "none" } }, _h("i", { className: "ph ph-coins", style: { fontSize: 16 } }), _h("span", null, c.txt)), _h("span", { style: { ...pill, minWidth: 46, padding: "0 12px", fontFamily: F_DISPLAY, fontSize: 12, letterSpacing: ".12em" } }, SPRACHE), _h("span", { style: { ...pill, width: 36, height: 36, borderRadius: 10, fontSize: 18 } }, _h("i", { className: "ph ph-share-network" }))));
    }
    function hackLevel(T) {
      let v;
      if (T < 40) v = 1;
      else if (T < 74) v = tw(T, 40, 74, 1, 0.18, Easing.linear);
      else if (T < 82) v = 0.18;
      else if (T < 100) v = tw(T, 82, 100, 0.18, 0.6, Easing.linear);
      else v = tw(T, 100, 102, 0.6, 1, MOTION.enter);
      return v * power(T, OFF.bg);
    }
    function Scan({ T, level }) {
      if (level <= 0) return null;
      const off = T * 40 % 4;
      return _h("div", { style: { position: "absolute", inset: 0, opacity: level, pointerEvents: "none" } }, _h("div", { style: { position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, rgba(57,255,20,.07) 0 1px, transparent 1px 4px)", backgroundPosition: "0 " + off + "px" } }), _h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(90% 70% at 50% 50%, rgba(57,255,20,.10), rgba(0,0,0,.45))" } }));
    }
    function GlitchBars({ T }) {
      let p = 0;
      if (T < 18) p = 0.12;
      if (T > 78 && T < 81) p = 0.5;
      if (T > 100 && T < 125) p = 0.2 + (T - 100) / 25 * 0.5;
      if (T > 125 && T < 144) p = 0.3;
      if (!p) return null;
      const bars = [[0.18, 3, "rgba(57,255,20,.6)"], [0.41, 16, "rgba(229,57,53,.4)"], [0.63, 6, "rgba(66,184,255,.45)"], [0.8, 26, "rgba(57,255,20,.22)"]];
      return _h("div", { style: { position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" } }, bars.map((b, i) => flick(T, 11, i + 20, p) ? _h("div", { key: i, style: { position: "absolute", left: 0, right: 0, top: (b[0] + (rnd(Math.floor(T * 11) + i) - 0.5) * 0.1) * SITE_H, height: b[1], background: b[2] } }) : null));
    }
    function CodeRain({ T, from, to, max }) {
      const o = win(T, from, to, 0.8) * (max || 1);
      if (o <= 0) return null;
      return _h("div", { style: { position: "absolute", left: 76, right: 0, top: 0, bottom: 0, overflow: "hidden", opacity: o, pointerEvents: "none" } }, Array.from({ length: 22 }, (_, i) => {
        const sp = 90 + i % 5 * 40;
        const y = (T * sp + i * 137) % (SITE_H + 600) - 600;
        return _h("div", { key: i, style: { position: "absolute", left: i * 4.6 + 1 + "%", top: y, display: "flex", flexDirection: "column", fontFamily: F_MONO, fontSize: 14, lineHeight: 1.25, color: C.neon, opacity: 0.18 + i % 4 * 0.08, textShadow: "0 0 6px rgba(57,255,20,.6)" } }, Array.from({ length: 26 }, (_2, j) => _h("span", { key: j }, glyph(i * 91 + j * 7 + Math.floor(T * 7 + j * 0.3)))));
      }));
    }
    function Ticker({ T }) {
      const o = win(T, -1, 40.4, 0.5);
      if (o <= 0) return null;
      const txt = L("ticker", "System kompromittiert · live-event beendet von ??? · alle stationen offline · widerstand ist zwecklos · ");
      const w = txt.length * 7.8;
      const x = -(T * 70 % w);
      return _h("div", { style: { position: "absolute", left: 76, right: 0, top: 742, height: 34, overflow: "hidden", opacity: o, borderTop: "1px solid rgba(57,255,20,.3)", borderBottom: "1px solid rgba(57,255,20,.3)", background: "rgba(3,10,5,.85)" } }, _h("div", { style: { position: "absolute", left: x, top: 8, whiteSpace: "nowrap", fontFamily: F_MONO, fontSize: 13, letterSpacing: ".02em", textTransform: "uppercase", color: C.neon, textShadow: "0 0 6px rgba(57,255,20,.6)" } }, txt + txt + txt + txt));
    }
    const neonBox = { border: "1px solid rgba(57,255,20,.4)", borderRadius: 10, background: "rgba(3,10,5,.92)", boxShadow: "0 0 0 1px rgba(0,0,0,.6), 0 0 60px rgba(57,255,20,.18), 0 18px 40px rgba(0,0,0,.45)", fontFamily: F_MONO, color: C.neon };
    const goldBox = { border: "1px solid rgba(214,168,79,.6)", borderRadius: 10, background: "rgba(8,10,16,.94)", boxShadow: "0 0 30px rgba(240,201,106,.35), 0 18px 40px rgba(0,0,0,.45)", fontFamily: F_MONO, color: C.goldBright };
    const termHead = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(57,255,20,.2)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(57,255,20,.65)" };
    const caret = (T) => _h("span", { style: { opacity: Math.floor(T * 2) % 2 ? 0 : 1 } }, "_");
    const okTag = _h("span", { style: { color: C.success } }, "ok");
    function Line({ T, text, start, prompt, after, afterAt, cps, color }) {
      if (T < start - 0.2) return _h("div", { style: { height: 20 } });
      const s = typed(T, text, start, cps);
      const done = s.length >= text.length;
      return _h("div", { style: { display: "flex", gap: 10, alignItems: "baseline", minHeight: 20, color } }, _h("span", { style: { color: prompt || "rgba(57,255,20,.5)" } }, ">"), _h("span", { style: { whiteSpace: "nowrap" } }, s, !done ? caret(T) : null), after && T >= afterAt ? after : null);
    }
    function MiniBar({ p, color, glow }) {
      return _h("span", { style: { flex: 1, height: 8, border: "1px solid " + color, borderRadius: 2, overflow: "hidden", display: "block" } }, _h("span", { style: { display: "block", height: "100%", width: p * 100 + "%", background: glow, boxShadow: "0 0 10px " + glow } }));
    }
    function Notfall({ T }) {
      const o = win(T, 18.6, 39.6, 0.4);
      if (o <= 0) return null;
      const g = C.gold;
      const fill = T < 27.8 ? 0 : Math.min(1, Math.floor((T - 27.8) / 5.4 * 12) / 12);
      return _h("div", { style: { position: "absolute", left: 758 - 310, top: 240, width: 620, opacity: o, transform: "scale(" + popS(T, 18.6) + ")", ...goldBox } }, _h("div", { style: { ...termHead, borderBottom: "1px solid rgba(214,168,79,.25)", color: C.gold } }, _h("i", { className: "ph ph-shield-check", style: { fontSize: 16 } }), _h("span", null, L("bridgeEmergency", "kapitänsbrücke · notfall-protokoll"))), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "16px 16px 18px", fontSize: 14, lineHeight: 1.4 } }, _h(Line, { T, prompt: g, text: L("daveLine", "schifffahrer dave: holen wir uns das schiff zurück."), start: 19.6, cps: 22 }), _h(Line, { T, prompt: g, text: L("startProtocol", "starte notfall-protokoll …"), start: 23.2, after: okTag, afterAt: 25 }), _h(Line, { T, prompt: g, text: L("loadBackup", "lade backup von romna"), start: 26, after: _h(MiniBar, { p: fill, color: "rgba(214,168,79,.45)", glow: C.goldBright }), afterAt: 27.6 }), _h(Line, { T, prompt: g, text: L("checkBackup", "prüfe backup …"), start: 33.8, after: okTag, afterAt: 35.2 }), _h(Line, { T, prompt: g, text: L("restoreSystems", "stelle systeme wieder her"), start: 36.4, after: caret(T), afterAt: 37.4 })));
    }
    const RESTORE = [[L("rWheel", "schatzrad"), 44], [L("rCodes", "geheimcodes"), 48], [L("rRace", "wochenrennen"), 52], [L("rLogbooks", "logbücher"), 56], [L("rBoard", "rangliste"), 60], [L("rMarket", "schwarzmarkt"), 64], [L("rArcade", "spielothek"), 67], [L("rSkills", "skill-baum"), 70], [L("rCore", "kern-system"), 73.5]];
    const progAt = interpolate([40, 44, 48, 52, 56, 60, 64, 67, 70, 74, 84, 96, 100], [0, 0.1, 0.2, 0.31, 0.42, 0.52, 0.62, 0.7, 0.78, 0.87, 0.87, 0.04, 0], Easing.linear);
    const prog = (T) => Math.floor(progAt(T) * 100) / 100;
    function Dock({ T }) {
      const o = win(T, 40.2, 76.2, 0.4);
      if (o <= 0) return null;
      let cur = null;
      for (const r of RESTORE) if (T >= r[1] - 2.4) cur = r;
      const done = cur && T >= cur[1] && cur !== RESTORE[RESTORE.length - 1];
      const p = prog(T);
      return _h("div", { style: { position: "absolute", left: 758 - 320, top: 728, width: 640, padding: "10px 14px 12px", opacity: o, transform: "translateY(" + (1 - tw(T, 40.2, 40.8, 0, 1, MOTION.enter)) * 20 + "px)", ...goldBox, fontSize: 13 } }, _h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, _h("i", { className: "ph ph-arrows-clockwise", style: { fontSize: 15, color: C.gold, transform: "rotate(" + T * 180 + "deg)" } }), _h("span", { style: { letterSpacing: ".12em", textTransform: "uppercase", fontSize: 11, color: C.gold } }, L("restoring", "wiederherstellung")), _h("span", { style: { color: C.fg } }, cur ? cur[0] + (done ? "" : " …") : L("connecting", "verbinde …")), done ? okTag : null, _h("span", { style: { marginLeft: "auto", fontVariantNumeric: "tabular-nums" } }, Math.round(p * 100), " %")), _h("div", { style: { height: 6, marginTop: 9, border: "1px solid rgba(214,168,79,.45)", borderRadius: 3, overflow: "hidden" } }, _h("div", { style: { height: "100%", width: p * 100 + "%", background: "linear-gradient(90deg, " + C.gold + ", " + C.goldBright + ")", boxShadow: "0 0 10px rgba(240,201,106,.7)" } })));
    }
    function Bubble({ T, at, who, text }) {
      if (T < at - 1) return null;
      const e = tw(T, at - 1, at - 0.65, 0, 1, MOTION.enter);
      const fremd = who === "?";
      const shown = T >= at;
      return _h("div", { style: { display: "flex", flexDirection: fremd ? "row" : "row-reverse", gap: 10, alignItems: "flex-end", opacity: e, transform: "translateY(" + (1 - e) * 10 + "px)" } }, fremd ? _h("span", { style: { display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0, borderRadius: "50%", border: "1px solid " + C.neon, background: "#0c2410", fontFamily: F_MONO, fontSize: 13, color: C.neon } }, "?") : _h("span", { style: { display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0, borderRadius: "50%", border: "1px solid " + C.gold, background: C.surfaceLight, fontFamily: F_DISPLAY, fontSize: 13, color: C.goldBright } }, "D"), shown ? fremd ? _h("span", { style: { padding: "8px 12px", borderRadius: "12px 12px 12px 4px", border: "1px solid rgba(57,255,20,.35)", background: "rgba(57,255,20,.08)" } }, _h("span", { style: { display: "block", fontFamily: F_MONO, fontSize: 11, color: C.neon } }, L("unknown", "unbekannt")), _h("span", { style: { fontFamily: F_MONO, fontSize: 15, color: C.fg } }, text)) : _h("span", { style: { padding: "8px 12px", borderRadius: "12px 12px 4px 12px", border: "1px solid rgba(214,168,79,.45)", background: "rgba(240,201,106,.08)", textAlign: "right" } }, _h("span", { style: { display: "block", fontSize: 11, fontWeight: 600, color: C.goldBright, fontFamily: F_SANS } }, L("dave", "Schifffahrer Dave")), _h("span", { style: { fontSize: 15, color: C.fg, fontFamily: F_SANS } }, text)) : _h("span", { style: { display: "flex", gap: 4, padding: "10px 12px", borderRadius: 12, background: fremd ? "rgba(57,255,20,.1)" : "rgba(240,201,106,.1)" } }, [0, 1, 2].map((k) => _h("i", { key: k, style: { width: 6, height: 6, borderRadius: "50%", background: fremd ? C.neon : C.goldBright, opacity: 0.3 + 0.7 * Math.max(0, Math.sin(T * 6 - k * 0.9)) } }))));
    }
    function Fehler({ T }) {
      const o = win(T, 75.8, 99.6, 0.4);
      if (o <= 0) return null;
      const red = tw(T, 78, 78.6, 0, 1, MOTION.enter);
      const p = prog(T);
      const barCol = red > 0.5 ? C.danger : C.goldBright;
      const border = "rgba(" + Math.round(214 + (229 - 214) * red) + "," + Math.round(168 - 111 * red) + "," + Math.round(79 - 26 * red) + ",.65)";
      return _h("div", { style: { position: "absolute", left: 758 - 310, top: 190, width: 620, opacity: o, transform: "scale(" + popS(T, 75.8) + ")", ...goldBox, border: "1px solid " + border, boxShadow: "0 0 40px rgba(" + (red > 0.5 ? "229,57,53" : "240,201,106") + ",.35), 0 18px 40px rgba(0,0,0,.45)" } }, _h("div", { style: { ...termHead, borderBottom: "1px solid rgba(214,168,79,.25)", color: red > 0.5 ? C.danger : C.gold } }, _h("i", { className: red > 0.5 ? "ph ph-warning" : "ph ph-shield-check", style: { fontSize: 16 } }), _h("span", null, L("bridgeRestore", "kapitänsbrücke · wiederherstellung"))), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "16px 16px 18px", fontSize: 14, lineHeight: 1.4 } }, _h(Line, { T, prompt: C.gold, text: L("restoreCore", "stelle kern-system her"), start: 76.2, after: _h(MiniBar, { p, color: red > 0.5 ? "rgba(229,57,53,.5)" : "rgba(214,168,79,.45)", glow: barCol }), afterAt: 77 }), T >= 78 ? _h("div", { style: { color: C.danger, fontWeight: 700, opacity: flick(T, 6, 2, 0.2) ? 0.4 : 1 } }, L("error", "FEHLER 0x0F1R3 · backup beschädigt")) : _h("div", { style: { height: 20 } }), _h(Line, { T, prompt: C.gold, text: L("retry", "versuche erneut …"), start: 80.4, after: _h("span", { style: { color: C.danger } }, L("failed", "fehlgeschlagen")), afterAt: 82.4 }), _h(Line, { T, prompt: C.danger, color: C.danger, text: L("rollback", "rollback läuft · ") + Math.round(p * 100) + " %", start: 84, cps: 60 }), _h("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 } }, _h(Bubble, { T, at: 87, who: "?", text: L("q1", "falsches backup, dave.") }), _h(Bubble, { T, at: 90.8, who: "?", text: L("q2", "ihr habt mir gerade alle türen geöffnet.") }), _h(Bubble, { T, at: 95, who: "D", text: L("daveNo", "Nein … nein, nein, nein!") }))));
    }
    function Ueberlast({ T }) {
      const o = win(T, 106.4, 124.8, 0.4);
      if (o <= 0) return null;
      const pulse = 0.5 + 0.5 * Math.sin((T - 106.4) * (7 + (T - 106) * 0.3));
      const last = Math.round(tw(T, 108, 124, 104, 186, Easing.easeInQuad));
      const blink = Math.floor(T * 3) % 2 === 1;
      return _h(_Frag, null, _h("div", { style: { position: "absolute", inset: 0, opacity: o * (0.55 + 0.45 * pulse), background: "radial-gradient(70% 60% at 50% 50%, transparent 30%, rgba(229,57,53,.6))", pointerEvents: "none" } }), _h("div", { style: { position: "absolute", left: 76, right: 0, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", opacity: o, background: "radial-gradient(50% 45% at 50% 50%, rgba(10,4,6,.85), rgba(10,4,6,.3))" } }, _h("p", { style: { margin: 0, fontFamily: F_MONO, fontSize: 78, fontWeight: 700, letterSpacing: ".14em", color: C.danger, textShadow: "0 0 30px rgba(229,57,53,.7)", opacity: blink ? 0.6 : 1, transform: "scale(" + popS(T, 106.4) + ")" } }, L("overload", "KERNÜBERLASTUNG")), _h("p", { style: { margin: "14px 0 0", fontFamily: F_MONO, fontSize: 17, color: C.fg, opacity: tw(T, 107.4, 108, 0, 1, MOTION.enter) } }, L("load", "Bordnetz instabil · Last "), _h("span", { style: { color: C.danger, fontVariantNumeric: "tabular-nums" } }, last, " %")), _h("p", { style: { margin: "34px 0 0", minHeight: 24, fontFamily: F_MONO, fontSize: 18, color: C.neon, textShadow: "0 0 8px rgba(57,255,20,.6)" } }, T > 114.6 ? "???: " : "", typed(T, L("q3", "moment … das war ich nicht."), 115.2, 14), T > 114.6 ? caret(T) : null)));
    }
    function Notstrom({ T }) {
      const o = win(T, 135.2, 141.6, 0.4);
      if (o <= 0) return null;
      const v = Math.max(0, Math.round(tw(T, 135.5, 140.5, 12, 0, Easing.linear)));
      return _h("p", { style: { position: "absolute", left: 72, bottom: 64, margin: 0, fontFamily: F_MONO, fontSize: 22, letterSpacing: ".2em", textTransform: "uppercase", color: C.danger, opacity: o * (flick(T, 7, 9, 0.3) ? 0.3 : 1), textShadow: "0 0 12px rgba(229,57,53,.6)" } }, L("backupPower", "notstrom "), v, " %");
    }
    function Crt({ T }) {
      if (T < 144.4 || T > 146) return null;
      const sy = tw(T, 144.4, 144.85, 0.25, 4e-3, Easing.easeInExpo);
      const sx = tw(T, 144.9, 145.5, 1, 2e-3, Easing.easeInExpo);
      const o = tw(T, 145.5, 145.9, 1, 0, MOTION.draw);
      return _h("div", { style: { position: "absolute", left: 0, top: 0, width: 1920, height: 1080, background: "#dfe9e0", transform: "scale(" + sx + ", " + sy + ")", opacity: o, boxShadow: "0 0 80px 20px rgba(223,233,224,.5)" } });
    }
    function Dunkel({ T }) {
      if (T < 144.8 || T > 216) return null;
      const noise = win(T, 145.6, 172, 1.5) * 0.8;
      const endText = win(T, 146, 149.6, 0.3);
      const gx = flick(T, 10, 12, 0.35) ? (rnd(Math.floor(T * 10)) - 0.5) * 24 : 0;
      const signal = win(T, 152, 159.6, 0.6) * (flick(T, 5, 13, 0.25) ? 0.3 : 1);
      return _h("div", { style: { position: "absolute", inset: 0, background: C.page } }, _h("div", { style: { position: "absolute", inset: 0, opacity: noise * 0.6, backgroundImage: "repeating-linear-gradient(0deg, rgba(232,237,244,.05) 0 1px, transparent 1px 2px), repeating-linear-gradient(90deg, rgba(232,237,244,.035) 0 1px, transparent 1px 3px)", backgroundPosition: Math.floor(T * 24) % 3 + "px " + Math.floor(T * 24) % 2 + "px" } }), _h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" } }, endText > 0 ? _h("p", { style: { position: "absolute", margin: 0, fontFamily: F_MONO, fontSize: 104, fontWeight: 700, letterSpacing: ".14em", color: C.danger, opacity: endText, transform: "translateX(" + gx + "px)", textShadow: gx ? -gx / 3 + "px 0 rgba(57,255,20,.6), " + gx / 3 + "px 0 rgba(66,184,255,.6)" : "0 0 30px rgba(229,57,53,.5)" } }, L("failure", "SYSTEMAUSFALL")) : null, signal > 0 ? _h("p", { style: { margin: 0, fontFamily: F_MONO, fontSize: 24, letterSpacing: ".3em", textTransform: "uppercase", color: C.lead, opacity: signal } }, L("signalLost", "Signal verloren")) : null));
    }
    function riftSize(T) {
      const h = tw(T, 167.6, 172.2, 0, 780, Easing.easeOutExpo);
      let w = tw(T, 172, 178, 0, 36, MOTION.draw) + tw(T, 178, 186, 0, 90, MOTION.draw) + tw(T, 186, 195, 0, 40, MOTION.draw);
      w *= 1 + 0.07 * Math.sin(T * 3.1) + 0.04 * Math.sin(T * 7.7);
      const blow = tw(T, 204, 214.6, 0, 1, Easing.easeInExpo);
      return { w: w + blow * 3200, h: h + blow * 2600, blow };
    }
    function riftPath(w, h, cx, cy) {
      const n = 44, L = [], R = [];
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const y = cy - h / 2 + u * h;
        const off = ((rnd(k * 3.3) - 0.5) * 50 + Math.sin(u * 9 + 1) * 20) * Math.sin(Math.PI * u);
        const prof = Math.pow(Math.sin(Math.PI * u), 0.8) * (0.7 + 0.6 * rnd(k * 5.1));
        L.push((cx + off - w / 2 * prof).toFixed(1) + "," + y.toFixed(1));
        R.unshift((cx + off + w / 2 * prof).toFixed(1) + "," + y.toFixed(1));
      }
      return "M" + L.join(" L") + " L" + R.join(" L") + " Z";
    }
    const CRACKS = Array.from({ length: 8 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      const y0 = 540 + (rnd(i * 2.2) - 0.5) * 520;
      let x = 960 + side * 8, y = y0;
      const pts = [[x, y]];
      for (let s = 0; s < 6; s++) {
        x += side * (40 + rnd(i * 9 + s) * 70);
        y += (rnd(i * 13 + s) - 0.5) * 90;
        pts.push([x, y]);
      }
      return { d: "M" + pts.map((p) => p[0].toFixed(0) + "," + p[1].toFixed(0)).join(" L"), t0: 173 + i * 1.3 };
    });
    const SPARKS = Array.from({ length: 70 }, (_, i) => ({ ang: rnd(i * 1.9) * Math.PI * 2, sp: 30 + rnd(i * 3.7) * 120, ph: rnd(i * 5.3) * 6, y: (rnd(i * 7.1) - 0.5) * 600, s: 1 + rnd(i * 2.3) * 2.5 }));
    function Riss({ T }) {
      if (T < 163.8 || T > 215.8) return null;
      const pt = win(T, 164.4, 172.6, 1.2);
      const { w, h, blow } = riftSize(T);
      const open = clamp(w / 160, 0, 1);
      const cx = 960, cy = 540;
      return _h("div", { style: { position: "absolute", inset: 0 } }, _h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(" + (30 + open * 30) + "% " + (40 + open * 30) + "% at 50% 50%, rgba(53,59,128," + 0.5 * open + "), transparent 70%)" } }), _h("div", { style: { position: "absolute", left: cx - 5, top: cy - 5, width: 10, height: 10, borderRadius: "50%", background: N.a100, opacity: pt * (T < 168 ? 0.6 + 0.4 * Math.sin(T * 4) : 1), boxShadow: "0 0 " + (20 + pt * 30) + "px " + (6 + pt * 10) + "px rgba(181,171,252,.7)" } }), _h("svg", { width: "1920", height: "1080", viewBox: "0 0 1920 1080", style: { position: "absolute", inset: 0, overflow: "visible" } }, _h("defs", null, _h("linearGradient", { id: "rg", x1: "0", x2: "1", y1: "0", y2: "0" }, _h("stop", { offset: "0", stopColor: N.a600 }), _h("stop", { offset: ".32", stopColor: N.a300 }), _h("stop", { offset: ".5", stopColor: N.a100 }), _h("stop", { offset: ".68", stopColor: N.a300 }), _h("stop", { offset: "1", stopColor: N.a600 })), _h("filter", { id: "b1", x: "-50%", y: "-50%", width: "200%", height: "200%" }, _h("feGaussianBlur", { stdDeviation: "16" })), _h("filter", { id: "b2", x: "-100%", y: "-50%", width: "300%", height: "200%" }, _h("feGaussianBlur", { stdDeviation: "60" }))), h > 2 ? _h("g", null, _h("path", { d: riftPath(w + 120, h + 80, cx, cy), fill: N.glow, opacity: 0.9, filter: "url(#b2)" }), _h("path", { d: riftPath(w + 30, h + 20, cx, cy), fill: N.a500, opacity: 0.85, filter: "url(#b1)" }), _h("path", { d: riftPath(Math.max(2, w), h, cx, cy), fill: "url(#rg)" })) : null, CRACKS.map((c, i) => {
        const p = tw(T, c.t0, c.t0 + 2.2, 0, 1, MOTION.enter);
        if (p <= 0) return null;
        return _h("path", { key: i, d: c.d, pathLength: "1", fill: "none", stroke: N.a300, strokeWidth: "1.6", strokeDasharray: "1", strokeDashoffset: 1 - p, opacity: (0.5 + 0.5 * Math.sin(T * 5 + i)) * (1 - blow) });
      })), T > 176 ? SPARKS.map((s, i) => {
        const age = ((T - 176) * 0.5 + s.ph) % 6;
        const d = age * s.sp;
        const x = cx + Math.cos(s.ang) * d * 1.3;
        const y = cy + s.y * 0.8 + Math.sin(s.ang) * d * 0.5 - age * 12;
        const o = Math.min(1, age) * (1 - age / 6) * open * (1 - blow);
        return _h("span", { key: i, style: { position: "absolute", left: x, top: y, width: s.s, height: s.s, borderRadius: "50%", background: i % 5 ? N.a200 : C.goldBright, opacity: o, boxShadow: "0 0 6px rgba(181,171,252,.9)" } });
      }) : null);
    }
    const FRAGS = [
      { k: "card", a: L("wheel", "Schatzrad"), b: L("spinFree", "Dreh frei"), x: 300, y: 220, r: -9 },
      { k: "card", a: L("code", "Geheimcode"), b: L("codes7", "7 von 12"), x: 1620, y: 250, r: 7 },
      { k: "card", a: L("race", "Wochenrennen"), b: L("race86", "86 von 150"), x: 320, y: 850, r: 6 },
      { k: "card", a: L("board", "Rangliste"), b: "Zugfahrer_Dave", x: 1600, y: 860, r: -6 },
      { k: "title", a: L("standTitle", "Dein Stand"), x: 960, y: 130, r: -3 },
      { k: "pill", a: L("coins", "1.250"), x: 1400, y: 110, r: 12 },
      { k: "icon", a: "ph-compass", x: 150, y: 540, r: 0 },
      { k: "icon", a: "ph-key", x: 1780, y: 560, r: 0 },
      { k: "icon", a: "ph-trophy", x: 640, y: 990, r: 0 },
      { k: "icon", a: "ph-skull", x: 1290, y: 990, r: 0 },
      { k: "icon", a: "ph-fire", x: 620, y: 90, r: 0 },
      { k: "icon", a: "ph-book-open-text", x: 1760, y: 110, r: 0 }
    ];
    function Sog({ T }) {
      if (T < 188 || T > 214) return null;
      return _h("div", { style: { position: "absolute", inset: 0 } }, FRAGS.map((f, i) => {
        const fade = tw(T, 188 + i * 0.4, 192 + i * 0.4, 0, 1, MOTION.enter);
        const p = tw(T, 195.5 + i * 0.8, 212.8, 0, 1, Easing.easeInCubic);
        const dx = f.x - 960, dy = f.y - 540;
        const r0 = Math.hypot(dx, dy) * (1 - 0.06 * tw(T, 188, 195.5, 0, 1, Easing.linear));
        const a = Math.atan2(dy, dx) + p * p * 2.6;
        const r = r0 * (1 - p);
        const x = 960 + Math.cos(a) * r, y = 540 + Math.sin(a) * r;
        const s = 1 - 0.94 * p;
        const rot = f.r + p * p * 300 + Math.sin(T * 0.8 + i) * 3;
        const lit = 0.35 + 0.65 * p;
        const o = fade * (1 - tw(T, 211.8, 212.8, 0, 1, Easing.linear)) * (p > 0.9 ? (1 - p) * 10 : 1);
        let el;
        if (f.k === "card") el = _h("div", { style: { width: 300, padding: 18, borderRadius: 14, border: "1px solid " + C.border, background: "linear-gradient(160deg, " + C.surfaceLight + ", #0b111a)", display: "flex", flexDirection: "column", gap: 10 } }, _h("p", { style: kicker }, f.a), _h("p", { style: ctitle }, f.b));
        else if (f.k === "title") el = _h("p", { style: { margin: 0, fontFamily: F_DISPLAY, fontSize: 56, fontWeight: 500, color: C.fg, whiteSpace: "nowrap" } }, f.a);
        else if (f.k === "pill") el = _h("span", { style: { display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(214,168,79,.35)", background: "rgba(214,168,79,.08)", color: C.goldBright, fontFamily: F_DISPLAY, fontSize: 14 } }, _h("i", { className: "ph ph-coins" }), f.a);
        else el = _h("i", { className: "ph " + f.a, style: { fontSize: 34, color: C.mutedFg } });
        return _h("div", { key: i, style: { position: "absolute", left: x, top: y, transform: "translate(-50%, -50%) rotate(" + rot + "deg) scale(" + s + ")", opacity: o, filter: "brightness(" + lit + ") drop-shadow(0 0 " + p * 20 + "px rgba(181,171,252,.8))" } }, el);
      }));
    }
    const Dist = interpolate([213, 218, 226, 238, 250, 262, 272, 279, 283], [0, 0.35, 2.4, 7.2, 13.2, 19.6, 25.4, 28.8, 29.5], Easing.linear);
    const WSTARS = Array.from({ length: 420 }, (_, i) => {
      let x = (rnd(i * 1.7) - 0.5) * 2.4, y = (rnd(i * 2.9 + 1) - 0.5) * 1.5;
      if (Math.abs(x) < 0.08 && Math.abs(y) < 0.08) {
        x += 0.15 * Math.sign(x || 1);
      }
      return { x, y, ph: rnd(i * 4.3), c: i % 11 === 0 ? C.goldBright : i % 3 === 0 ? N.a400 : N.a200 };
    });
    const NEBULAE = [[216, N.a700], [220, N.glow], [224, "#6b2f5e"], [228, N.a700], [231, N.section], [235, "#1f5a6e"], [238, N.glow], [242, "#7a3a2a"], [245, N.a800], [249, N.ghost], [253, "#6b4a1f"], [257, N.glow], [261, "#7a3a2a"], [265, N.a700], [269, "#6b4a1f"], [273, N.ghost], [277, "#8a5a2a"]];
    const FLY_ICONS_RAUM = ["ph-anchor", "ph-compass", "ph-coins", "ph-skull", "ph-key", "ph-sword", "ph-boat", "ph-lighthouse", "ph-treasure-chest", "ph-flag-pennant", "ph-map-trifold", "ph-crown-simple"];
    const FLY_ICONS_ZEIT = ["ph-hourglass", "ph-clock", "ph-hourglass-medium", "ph-scroll", "ph-feather", "ph-compass", "ph-anchor", "ph-sun-horizon", "ph-moon-stars", "ph-book-open"];
    const FLY = [];
    (function() {
      let t = 215.5, i = 0;
      while (t < 280) {
        const r = rnd(i * 4.7 + 11);
        const zeit = t > 250;
        const kind = r < 0.16 ? "planet" : r < 0.42 ? "rock" : r < 0.78 ? "icon" : r < 0.9 ? "card" : "ship";
        const ang = rnd(i * 2.3 + 5) * Math.PI * 2;
        const rad = 0.28 + rnd(i * 3.1 + 7) * 0.9;
        const icons = zeit ? FLY_ICONS_ZEIT : FLY_ICONS_RAUM;
        FLY.push({ t0: t, dur: kind === "planet" ? 6.5 : 3.2 + rnd(i * 1.1) * 2, kind, x: Math.cos(ang) * rad * 1.5, y: Math.sin(ang) * rad, spin: (rnd(i * 6.6) - 0.5) * 420, icon: icons[Math.floor(rnd(i * 8.8) * icons.length)], hue: Math.floor(rnd(i * 9.9) * 4), size: 0.7 + rnd(i * 5.5) * 0.8, seed: i });
        t += kind === "planet" ? 1.6 : 0.34 + rnd(i * 7.3) * 0.5;
        i++;
      }
    })();
    const PLANET = [
      ["#f0c96a", "#9a5a1e", "rgba(240,201,106,.5)"],
      ["#b5abfc", "#2b2741", "rgba(150,138,224,.6)"],
      ["#8fd1e6", "#1f3f5e", "rgba(66,184,255,.45)"],
      ["#e0826a", "#5a1f18", "rgba(229,90,60,.5)"]
    ];
    const FCARDS = [[L("wheel", "Schatzrad"), L("spinFree", "Dreh frei")], [L("code", "Geheimcode"), L("codes7", "7 von 12")], [L("logbook2", "Logbuch II"), L("chapter4", "Kapitel 4")], [L("board", "Rangliste"), L("rank3", "Platz 3")], [L("race", "Wochenrennen"), L("race86", "86 von 150")]];
    function Flyers({ T }) {
      return _h(_Frag, null, FLY.map((f, i) => {
        const p = (T - f.t0) / f.dur;
        if (p <= 0 || p >= 1) return null;
        const z = 1.15 - 1.07 * Math.pow(p, 1.25);
        const X = 960 + f.x * 560 / z, Y = 540 + f.y * 560 / z;
        if (X < -900 || X > 2820 || Y < -900 || Y > 1980) return null;
        const sc = 0.22 / z * f.size;
        const o = Math.min(1, p * 5) * Math.min(1, (z - 0.08) * 6);
        const rot = f.spin * p;
        const blur = z < 0.25 ? (0.25 - z) * 14 : 0;
        let el;
        if (f.kind === "planet") {
          const c = PLANET[f.hue];
          el = _h("div", { style: { position: "relative", width: 420, height: 420 } }, _h("div", { style: { position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 34% 30%, " + c[0] + ", " + c[1] + " 72%, #05070b)", boxShadow: "0 0 120px 30px " + c[2] + ", inset -40px -30px 80px rgba(0,0,0,.6)" } }), f.seed % 2 ? _h("div", { style: { position: "absolute", left: -150, top: 170, width: 720, height: 80, borderRadius: "50%", border: "10px solid " + c[0], opacity: 0.55, transform: "rotate(-14deg)" } }) : null);
        } else if (f.kind === "rock") {
          const br = [40, 60, 55, 45].map((v, k) => v + Math.round(rnd(f.seed * 3 + k) * 25) + "%").join(" ");
          el = _h("div", { style: { width: 170, height: 130, borderRadius: br, background: "radial-gradient(circle at 30% 28%, #6a6480, #2a2536 60%, #0c0b12)", boxShadow: "inset -14px -10px 22px rgba(0,0,0,.6), 0 0 30px rgba(181,171,252,.25)" } });
        } else if (f.kind === "icon") {
          el = _h("i", { className: "ph " + f.icon, style: { display: "block", fontSize: 200, color: f.hue % 2 ? C.goldBright : N.a200, filter: "drop-shadow(0 0 22px " + (f.hue % 2 ? "rgba(240,201,106,.7)" : "rgba(181,171,252,.8)") + ")" } });
        } else if (f.kind === "card") {
          const c = FCARDS[f.seed % FCARDS.length];
          el = _h("div", { style: { width: 420, padding: 26, borderRadius: 18, border: "1px solid " + C.borderStrong, background: "linear-gradient(160deg, " + C.surfaceLight + ", #0b111a)", boxShadow: "0 0 60px rgba(181,171,252,.35)", display: "flex", flexDirection: "column", gap: 12 } }, _h("p", { style: { ...kicker, fontSize: 16 } }, c[0]), _h("p", { style: { ...ctitle, fontSize: 40 } }, c[1]));
        } else {
          el = _h("div", { style: { position: "relative", width: 360, height: 300 } }, _h("i", { className: "ph ph-sailboat", style: { position: "absolute", inset: 0, fontSize: 300, color: "#c2412c", filter: "drop-shadow(0 0 30px rgba(229,90,60,.7))" } }));
        }
        return _h("div", { key: i, style: { position: "absolute", left: X, top: Y, transform: "translate(-50%, -50%) scale(" + sc.toFixed(4) + ") rotate(" + rot.toFixed(1) + "deg)", opacity: o, filter: blur ? "blur(" + blur.toFixed(1) + "px)" : "none", zIndex: Math.round((1.2 - z) * 100) } }, el);
      }));
    }
    function Kosmos({ T }) {
      const o = win(T, 213.5, 282.4, 2);
      if (o <= 0) return null;
      const rot = T * 4;
      return _h(_Frag, null, _h("div", { style: { position: "absolute", left: 960 - 1400, top: 540 - 1400, width: 2800, height: 2800, borderRadius: "50%", opacity: o * 0.55, transform: "rotate(" + rot + "deg) scaleY(.55)", background: "conic-gradient(from 0deg, transparent, rgba(150,138,224,.35), transparent 18%, rgba(240,201,106,.18), transparent 40%, rgba(66,184,255,.2), transparent 62%, rgba(150,138,224,.3), transparent 82%, rgba(229,90,60,.15), transparent)", WebkitMaskImage: "radial-gradient(circle, #000 8%, transparent 62%)", maskImage: "radial-gradient(circle, #000 8%, transparent 62%)" } }), _h("div", { style: { position: "absolute", left: 960 - 1500, top: 540 - 1500, width: 3e3, height: 3e3, opacity: o * (0.25 + 0.1 * Math.sin(T * 1.7)), transform: "rotate(" + -rot * 1.8 + "deg)", background: "repeating-conic-gradient(from 0deg, rgba(245,244,255,.22) 0deg 1.2deg, transparent 1.2deg 9deg)", WebkitMaskImage: "radial-gradient(circle, transparent 4%, #000 12%, transparent 55%)", maskImage: "radial-gradient(circle, transparent 4%, #000 12%, transparent 55%)" } }), _h("div", { style: { position: "absolute", left: 960 - 90, top: 540 - 90, width: 180, height: 180, borderRadius: "50%", opacity: o, background: "radial-gradient(circle, #fff, rgba(210,206,253,.9) 20%, rgba(150,138,224,.4) 50%, transparent 70%)", transform: "scale(" + (1 + 0.15 * Math.sin(T * 2.3)) + ")" } }));
    }
    const CHAPTERS = [
      [t("home.kap1Nr", "Kapitel I — Auslaufen"), t("home.kap1Titel", "Romna liegt hinter uns")],
      [t("home.kap2Nr", "Kapitel II — Die Fracht"), t("home.kap2Titel", "Fünf Schlösser, kein Schlüssel")],
      [t("home.kap3Nr", "Kapitel III — Volle Fahrt"), t("home.kap3Titel", "Sie hält direkt auf uns zu")],
      [t("home.kap4Nr", "Kapitel IV — Vorbei"), t("home.kap4Titel", "Dreh bei. Wir folgen ihr.")],
      [t("home.kap5Nr", "Kapitel V — Im Kielwasser"), t("home.kap5Titel", "Kurs nach Südwest")],
      [t("home.kap6Nr", "Kapitel VI — Land in Sicht"), t("home.kap6Titel", "Klippen, Dschungel, ein Licht")],
      [L("ch7Nr", "Kapitel VII"), L("ch7Title", "Die Schatzinsel")]
    ];
    function Warp({ T }) {
      if (T < 212.5 || T > 283.2) return null;
      const vis = win(T, 212.6, 283.2, 0.8);
      const D = Dist(T);
      const v = (Dist(T + 0.05) - D) / 0.05;
      const tunnelWob = (z) => ({ x: Math.sin(T * 0.37) * 60 * (1 - z), y: Math.cos(T * 0.29) * 40 * (1 - z) });
      const rings = win(T, 223, 282.6, 2);
      const ticks = tw(T, 250, 254, 0, 1, MOTION.enter);
      return _h("div", { style: { position: "absolute", inset: 0, opacity: vis, background: "radial-gradient(60% 60% at 50% 50%, " + N.a900 + ", " + C.page + " 70%)", filter: "sepia(" + (ageAt(T) * 0.9).toFixed(3) + ") saturate(" + (1 - ageAt(T) * 0.3).toFixed(3) + ")" } }, NEBULAE.map((n, i) => {
        const p = (T - n[0]) / 7;
        if (p <= 0 || p >= 1) return null;
        const size = 400 + p * p * 4200;
        const ox = Math.cos(i * 2.1) * p * 500, oy = Math.sin(i * 2.1) * p * 300;
        return _h("div", { key: i, style: { position: "absolute", left: 960 + ox - size / 2, top: 540 + oy - size / 2, width: size, height: size, borderRadius: "50%", background: "radial-gradient(circle, " + n[1] + ", transparent 65%)", opacity: Math.sin(Math.PI * p) * 0.85 } });
      }), _h(Kosmos, { T }), rings > 0 ? Array.from({ length: 9 }, (_, i) => {
        const z = 1.02 - (i / 9 + D * 0.11) % 1;
        const rad = Math.min(3200, 300 / z);
        const wb = tunnelWob(z);
        const o = rings * Math.min(1, (1.02 - z) * 2.2) * Math.min(1, z * 5) * 0.55;
        return _h("div", { key: i, style: { position: "absolute", left: 960 + wb.x - rad, top: 540 + wb.y - rad, width: rad * 2, height: rad * 2, borderRadius: "50%", border: 1 + (1 - z) * 2.5 + "px solid " + (ticks > 0.5 ? C.gold : N.a500), opacity: o, boxSizing: "border-box" } }, ticks > 0 ? Array.from({ length: 12 }, (_2, k) => _h("span", { key: k, style: { position: "absolute", left: "50%", top: "50%", width: 2 + (1 - z) * 2, height: 10 + 40 * (1 - z), marginLeft: -1, background: C.goldBright, opacity: ticks, transform: "rotate(" + (k * 30 + T * (i % 2 ? 12 : -12)) + "deg) translateY(" + (-rad + 2) + "px)", transformOrigin: "50% 0" } })) : null);
      }) : null, WSTARS.map((s, i) => {
        const z = 1.02 - (s.ph + D * 0.34) % 1;
        const z2 = Math.min(1.02, z + v * 0.34 * 0.07);
        const hx = 960 + s.x * 560 / z, hy = 540 + s.y * 560 / z;
        const tx = 960 + s.x * 560 / z2, ty = 540 + s.y * 560 / z2;
        if (hx < -200 || hx > 2120 || hy < -200 || hy > 1280) return null;
        const len = Math.max(2, Math.hypot(hx - tx, hy - ty));
        const ang = Math.atan2(hy - ty, hx - tx) * 180 / Math.PI;
        const o = Math.min(1, (1.02 - z) * 1.6);
        const wd = 1.2 + (1 - z) * 2.4;
        return _h("span", { key: i, style: { position: "absolute", left: tx, top: ty - wd / 2, width: len, height: wd, borderRadius: wd, background: "linear-gradient(90deg, transparent, " + s.c + ")", opacity: o, transform: "rotate(" + ang + "deg)", transformOrigin: "0 50%" } });
      }), _h(Flyers, { T }), _h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(10% 10% at 50% 50%, rgba(245,244,255," + clamp(v / 3, 0, 0.35) + "), transparent)" } }), _h("div", { style: { position: "absolute", inset: 0, opacity: ageAt(T) * 0.45, background: "radial-gradient(120% 100% at 50% 50%, transparent 35%, rgba(143,109,62,.8))", backgroundImage: "repeating-linear-gradient(0deg, rgba(232,218,185,.06) 0 1px, transparent 1px 3px)" } }));
    }
    function yearAt(T) {
      return 2026 - 306 * Easing.easeInOutCubic(clamp((T - 252) / 27, 0, 1));
    }
    function Zeit({ T }) {
      const o = win(T, 251, 281.6, 0.8);
      if (o <= 0) return null;
      const y = yearAt(T);
      const rate = Math.abs(yearAt(T + 0.1) - y) * 10;
      const age = ageAt(T);
      const era = y > 1900 ? 0 : y > 1800 ? 1 : 2;
      const yFont = [F_SANS, "Georgia, 'Times New Roman', serif", FELL][era];
      const yCol = ["#f5f4ff", "#f1e2c2", "#e8dab9"][era];
      const chFont = age > 0.55 ? FELL : F_DISPLAY;
      let s = String(Math.round(y));
      if (rate > 25) s = s.slice(0, 2) + glyphD(T, 1) + glyphD(T, 2);
      else if (rate > 6) s = s.slice(0, 3) + glyphD(T, 3);
      return _h(_Frag, null, CHAPTERS.map((c, i) => {
        const t0 = 253 + i * 3.6;
        const p = (T - t0) / 4.4;
        if (p <= 0 || p >= 1) return null;
        const z = 1 - p * 0.9;
        const sc = 0.32 / z;
        const side = i % 2 ? 1 : -1;
        const x = 960 + side * 120 / z, yy = 540 + side * 360 / z;
        const op = Math.min(1, p * 5) * Math.min(1, (1 - p) * 3.5);
        return _h("div", { key: i, style: { position: "absolute", left: x, top: yy, transform: "translate(-50%, -50%) scale(" + sc + ")", opacity: op, textAlign: "center", whiteSpace: "nowrap" } }, _h("p", { style: { margin: 0, fontFamily: chFont, fontSize: 30, letterSpacing: ".3em", textTransform: "uppercase", color: C.goldBright } }, c[0]), _h("p", { style: { margin: "12px 0 0", fontFamily: chFont, fontSize: 92, fontWeight: age > 0.55 ? 400 : 500, color: C.fg, textShadow: "0 0 50px rgba(240,201,106,.3)" } }, c[1]));
      }), _h("div", { style: { position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", opacity: o } }, _h("p", { style: { margin: 0, fontFamily: era === 2 ? FELL_SC : F_SANS, fontSize: 22, fontWeight: 500, letterSpacing: ".4em", textTransform: "uppercase", color: era ? "#d8c08e" : N.a300 } }, era === 2 ? "Anno Domini" : L("year", "Jahr")), _h("p", { style: { margin: "8px 0 0", fontFamily: yFont, fontSize: 220, fontWeight: era === 0 ? 500 : 400, lineHeight: 1, color: yCol, fontVariantNumeric: "tabular-nums", textShadow: era ? "0 0 60px rgba(214,168,79,.55)" : "0 0 60px rgba(150,138,224,.8)" } }, s)));
    }
    function glyphD(T, k) {
      return String(Math.floor(rnd(Math.floor(T * 20) * 7 + k) * 10));
    }
    const FELL = "'IM Fell English', 'Georgia', serif";
    const FELL_SC = "'IM Fell English SC', 'Georgia', serif";
    const P = { paper: "#e8dab9", paperDark: "#c9b183", edge: "#8f6d3e", ink: "#35251a", inkSoft: "#5e4630", rust: "#7c2f1c", wax: "#8e2418", gold: "#9a742c", leather: "#4a2e1b", leatherHi: "#6b4527", thread: "#d9c296" };
    const ageAt = (T) => clamp((2026 - yearAt(T)) / 306, 0, 1);
    const ink = (T, t0) => {
      const e = tw(T, t0, t0 + 1.4, 0, 1, MOTION.enter);
      return { opacity: e, filter: "blur(" + (1 - e) * 3 + "px)" };
    };
    const OLD_NAV = ["ph-anchor", "ph-house-line", "ph-scroll", "ph-book-open", "ph-users", "ph-globe-hemisphere-west", "ph-coins", "ph-key", "ph-compass-rose", "ph-dice-five", "ph-trophy", "ph-crown", "ph-flag", "ph-skull", "ph-feather"];
    const pKick = { margin: 0, fontFamily: FELL_SC, fontSize: 18, letterSpacing: ".22em", color: P.rust };
    const pTitle = { margin: 0, fontFamily: FELL, fontSize: 36, lineHeight: 1.05, color: P.ink };
    const pNote = { margin: 0, fontFamily: FELL, fontStyle: "italic", fontSize: 20, color: P.inkSoft };
    function InkBar({ p }) {
      return _h("div", { style: { height: 12, border: "1.5px solid " + P.ink, borderRadius: 2, overflow: "hidden" } }, _h("div", { style: { height: "100%", width: p + "%", backgroundImage: "repeating-linear-gradient(135deg, " + P.ink + " 0 2px, transparent 2px 6px)" } }));
    }
    function Ledger({ x, y, w, h, t0, T, children, row }) {
      return _h("div", { style: { position: "absolute", left: x, top: y, width: w, height: h, padding: 26, display: "flex", flexDirection: row ? "row" : "column", gap: row ? 24 : 12, border: "3px double " + P.inkSoft, background: "rgba(143,109,62,.08)", boxSizing: "border-box", ...ink(T, t0) } }, children);
    }
    function Ankunft({ T }) {
      if (T < 282) return null;
      const push = 1 + (T - 282) * 18e-4;
      const candle = 0.85 + 0.1 * Math.sin(T * 7.3) + 0.05 * Math.sin(T * 13.1);
      const stamp = tw(T, 293.2, 293.7, 0, 1, Easing.easeOutBack);
      const stampIn = T >= 293.2;
      const cx = [236, 736, 1236], cw = 484;
      return _h("div", { style: { position: "absolute", inset: 0, overflow: "hidden", background: P.edge } }, _h("div", { style: { position: "absolute", inset: 0, transform: "scale(" + push + ")", transformOrigin: "55% 45%" } }, _h("div", { style: { position: "absolute", inset: 0, background: "radial-gradient(120% 100% at 50% 45%, " + P.paper + " 0%, #dfcda6 55%, " + P.paperDark + " 85%, " + P.edge + " 100%)" } }), _h("div", { style: { position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "repeating-linear-gradient(0deg, rgba(94,70,48,.05) 0 1px, transparent 1px 3px), radial-gradient(40% 30% at 22% 70%, rgba(143,109,62,.25), transparent 70%), radial-gradient(25% 20% at 80% 20%, rgba(143,109,62,.2), transparent 70%)" } }), _h("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 132, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "26px 0", background: "linear-gradient(90deg, " + P.leather + ", " + P.leatherHi + ")", boxShadow: "6px 0 18px rgba(53,37,26,.45)", boxSizing: "border-box", ...ink(T, 283.4) } }, _h("div", { style: { position: "absolute", top: 10, bottom: 10, right: 10, borderRight: "2px dashed " + P.thread, opacity: 0.55 } }), _h("div", { style: { width: 62, height: 62, borderRadius: "50%", display: "grid", placeItems: "center", background: "radial-gradient(circle at 40% 35%, #b43a26, " + P.wax + ")", boxShadow: "inset 0 -3px 6px rgba(0,0,0,.35), 0 3px 6px rgba(0,0,0,.35)", color: "#f0d6b0", fontSize: 30 } }, _h("i", { className: "ph ph-fire" })), _h("div", { style: { width: 60, height: 1, background: P.thread, opacity: 0.5 } }), OLD_NAV.map((ic, i) => _h("i", { key: i, className: "ph " + ic, style: { fontSize: 28, color: i === 2 ? "#f0d6b0" : P.thread, opacity: i === 2 ? 1 : 0.7 } }))), _h("div", { style: { position: "absolute", left: 162, right: 30, top: 26, display: "flex", alignItems: "center", justifyContent: "space-between", ...ink(T, 284) } }, _h("span", { style: { display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", borderBottom: "1.5px solid " + P.inkSoft, fontFamily: FELL, fontStyle: "italic", fontSize: 22, color: P.inkSoft } }, _h("i", { className: "ph ph-magnifying-glass", style: { fontSize: 22 } }), L("oldSearch", "Seite aufschlagen …")), _h("div", { style: { display: "flex", alignItems: "center", gap: 16 } }, _h("span", { style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", border: "1.5px solid " + P.gold, borderRadius: 4, fontFamily: FELL_SC, fontSize: 22, color: P.ink } }, _h("i", { className: "ph ph-coins", style: { fontSize: 22, color: P.gold } }), L("oldCoins", "1.250 Dublonen")), _h("span", { style: { padding: "8px 14px", border: "1.5px solid " + P.inkSoft, borderRadius: 4, fontFamily: FELL_SC, fontSize: 18, letterSpacing: ".12em", color: P.inkSoft } }, SPRACHE))), _h("div", { style: { position: "absolute", left: 236, width: 1484, top: 128, textAlign: "center" } }, _h("p", { style: { margin: 0, fontFamily: FELL_SC, fontSize: 22, letterSpacing: ".36em", color: P.rust, ...ink(T, 284.6) } }, "Anno Domini MDCCXX"), _h("h1", { style: { margin: "10px 0 0", fontFamily: FELL, fontSize: 96, fontWeight: 400, lineHeight: 1, color: P.ink, ...ink(T, 285.1) } }, L("oldTitle", "Stand der Dinge")), _h("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "14px 0 0", ...ink(T, 285.6) } }, _h("span", { style: { width: 120, height: 1, background: P.inkSoft } }), _h("i", { className: "ph ph-compass-rose", style: { fontSize: 22, color: P.inkSoft } }), _h("span", { style: { width: 120, height: 1, background: P.inkSoft } })), _h("p", { style: { margin: "14px 0 0", ...pNote, fontSize: 24, ...ink(T, 286) } }, L("oldLead", "Wo du überall stehengeblieben bist – mit Tinte festgehalten."))), _h(Ledger, { T, t0: 286.6, x: cx[0], y: 400, w: cw * 2 + 16, h: 250, row: true }, _h("img", { src: "scripts/image/logbuch2.webp", style: { width: 140, height: 196, objectFit: "cover", border: "2px solid " + P.inkSoft, filter: "sepia(1) contrast(.9) brightness(.9)" } }), _h("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 10 } }, _h("p", { style: pKick }, L("read", "Weiterlesen")), _h("p", { style: pTitle }, t("home.kap2Titel", "Fünf Schlösser, kein Schlüssel")), _h("p", { style: pNote }, L("oldRead", "Logbuch II · Seite 4 von 8")), _h(InkBar, { p: 50 }))), _h(Ledger, { T, t0: 287.3, x: cx[2], y: 400, w: cw, h: 250 }, _h("p", { style: pKick }, L("oldWheel", "Kompassrose")), _h("p", { style: pTitle }, L("spinFree", "Dreh frei")), _h("p", { style: pNote }, L("oldDays", "Drei Tage in Folge")), _h("div", { style: { flex: 1 } }), _h("span", { style: { alignSelf: "flex-start", fontFamily: FELL_SC, fontSize: 20, letterSpacing: ".12em", color: P.rust, borderBottom: "1.5px solid " + P.rust } }, L("oldToWheel", "Zur Kompassrose ›"))), _h(Ledger, { T, t0: 288, x: cx[0], y: 676, w: cw, h: 290 }, _h("p", { style: pKick }, L("oldRace", "Seemeilen")), _h("p", { style: { ...pTitle, fontSize: 52 } }, "86 ", _h("span", { style: { ...pNote } }, L("of150", "von 150"))), _h("p", { style: pNote }, L("oldCourse", "Kurs: Kielwasser")), _h(InkBar, { p: 57 })), _h(Ledger, { T, t0: 288.7, x: cx[1], y: 676, w: cw, h: 290 }, _h("p", { style: pKick }, L("oldCode", "Chiffre")), _h("p", { style: { ...pTitle, fontSize: 52 } }, "VII ", _h("span", { style: { ...pNote } }, L("oldOf12", "von XII"))), _h("p", { style: pNote }, L("oldCodesLeft", "Fünf noch nicht entschlüsselt")), _h(InkBar, { p: 58 })), _h(Ledger, { T, t0: 289.4, x: cx[2], y: 676, w: cw, h: 290 }, _h("p", { style: pKick }, L("board", "Rangliste")), [["I.", "Zugfahrer Dave", "4.820"], ["II.", "Flitzpiepe", "3.910"], ["III.", L("you", "Du"), "2.140"]].map((r, i) => _h("div", { key: i, style: { display: "flex", alignItems: "baseline", gap: 12, borderBottom: "1px dotted " + P.inkSoft, paddingBottom: 6 } }, _h("span", { style: { width: 40, fontFamily: FELL_SC, fontSize: 20, color: P.rust } }, r[0]), _h("span", { style: { flex: 1, fontFamily: FELL, fontStyle: "italic", fontSize: 24, color: P.ink } }, r[1]), _h("span", { style: { fontFamily: FELL, fontSize: 20, color: P.inkSoft } }, r[2])))), stampIn ? _h("div", { style: { position: "absolute", right: 70, bottom: 40, padding: "10px 22px", border: "3px solid " + P.wax, borderRadius: 6, fontFamily: FELL_SC, fontSize: 24, letterSpacing: ".14em", color: P.wax, opacity: 0.85 * Math.min(1, stamp), transform: "rotate(-6deg) scale(" + (2.2 - 1.2 * stamp) + ")" } }, L("stamp", "Kapitel VIII · Jenseits des Risses")) : null), _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(70% 60% at 45% 40%, rgba(255,190,110," + 0.12 * candle + "), transparent 60%), radial-gradient(130% 110% at 50% 50%, transparent 55%, rgba(53,37,26,.55))" } }));
    }
    function Flash({ T }) {
      const o = T < 214 ? 0 : T < 217 ? interpolate([214, 214.8, 217], [0, 1, 0], MOTION.draw)(T) : T > 281 && T < 285 ? interpolate([281.2, 282.3, 284.6], [0, 1, 0], MOTION.draw)(T) : 0;
      if (o <= 0) return null;
      return _h("div", { style: { position: "absolute", inset: 0, background: T > 250 ? "#fbf1dc" : N.a100, opacity: o } });
    }
    function Film({ T, cam, shake }) {
      const z = cam ? camZ(T) : 1;
      const s = BASE * z;
      const hw = 960 / s, hh = 540 / s;
      const fx = clamp(cam ? camX(T) : 720, hw, SITE_W - hw), fy = clamp(cam ? camY(T) : 405, hh, SITE_H - hh);
      const a = shakeAmt(T) * shake;
      const sx = (rnd(Math.floor(T * 30)) - 0.5) * a, sy = (rnd(Math.floor(T * 30) + 3) - 0.5) * a;
      const tx = 960 - fx * s + sx, ty = 540 - fy * s + sy;
      const siteOn = T < 146.2;
      const logoHack = !(T >= 70 && T < 100.5);
      return _h("div", { style: { position: "absolute", inset: 0, overflow: "hidden", background: C.page } }, siteOn ? _h("div", { style: { position: "absolute", left: 0, top: 0, width: SITE_W, height: SITE_H, transformOrigin: "0 0", transform: "translate(" + tx + "px, " + ty + "px) scale(" + s + ")", fontFamily: F_SANS, color: C.fg } }, _h(Background, { T }), _h("div", { style: { position: "absolute", inset: 0 } }, _h(Page, { T })), _h(Sidebar, { T, hack: logoHack ? 1 : 0 }), _h(Topbar, { T }), _h(Scan, { T, level: hackLevel(T) }), _h(CodeRain, { T, from: -1, to: 18, max: 0.6 }), _h(CodeRain, { T, from: 101, to: 125, max: 0.8 }), _h(GlitchBars, { T }), _h(Ticker, { T }), _h(Notfall, { T }), _h(Dock, { T }), _h(Fehler, { T }), _h(Ueberlast, { T })) : null, siteOn ? _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 50%, transparent 60%, rgba(0,0,0,.35))" } }) : null, _h(Notstrom, { T }), _h(Crt, { T }), _h(Dunkel, { T }), _h("div", { style: { position: "absolute", inset: 0, transform: "translate(" + sx + "px, " + sy + "px)" } }, _h(Warp, { T }), _h(Riss, { T }), _h(Sog, { T }), _h(Zeit, { T })), _h(Ankunft, { T }), _h(Flash, { T }));
    }

    return Film;
  }

  /* ------------------------------------------------------
     BUEHNE UND ABLAUF
  ------------------------------------------------------ */
  const DAUER = 300;            // Sekunden, wie im Entwurf
  const SCHRIFT = "https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=swap";
  let lauf = null;              // { wurzel, buehne, film, t0, ab, uhr, letzt }

  function schriftLaden() {
    if (document.getElementById("fh-riss-schrift")) return;
    const l = document.createElement("link");
    l.id = "fh-riss-schrift"; l.rel = "stylesheet"; l.href = SCHRIFT;
    document.head.appendChild(l);
  }

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
    zeichnen(lauf.buehne, [lauf.film({ T: T, cam: true, shake: RUHIG.matches ? 0 : 1 })], false);
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  function start(opts) {
    weg();
    opts = opts || {};
    schriftLaden();
    const wurzel = document.createElement("div");
    wurzel.id = "fh-riss";
    wurzel.className = "fh-riss";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", L("aria", "Live-Story: Der Riss"));
    const buehne = document.createElement("div");
    buehne.className = "fh-riss-buehne";
    buehne.setAttribute("aria-hidden", "true");
    const hinweis = document.createElement("p");
    hinweis.className = "fh-riss-hinweis";
    hinweis.textContent = L("rotate", "Tipp: Handy quer halten");
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "fh-riss-weiter";
    knopf.textContent = L("skip", "Überspringen");
    knopf.addEventListener("click", weg);
    wurzel.append(buehne, hinweis, knopf);
    document.body.appendChild(wurzel);
    lauf = { wurzel: wurzel, buehne: buehne, film: baueFilm(), t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), uhr: 0, letzt: 0 };
    einpassen();
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    lauf.uhr = requestAnimationFrame(bild);
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
  }

  window.fhRissFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    DAUER: DAUER,
  };
})();
