/* ======================================================
   EXPLOSION - DIE SEITE EXPLODIERT, DANACH COUNTDOWN (Migration 73)
   ---------------------------------------------------
   Entwurf "Seite explodiert - Countdown" aus Claude Design, fast
   woertlich: Die Seite zittert und grollt, ein Feuerball zerreisst
   sie (Druckwelle, Funken, Splitter, Rauch, Glut), alle Teile fliegen
   davon. Danach steht nur noch der Countdown bis zum Ziel, das der
   Admin im Gateway eingetragen hat, mit Musik. Bei 0: "Jetzt".

   Nachgeladen als "explosion" von live-storys.js. Gesteuert wird
   allein ueber den Zustand aus live_event (explosion_ziel,
   explosion_scharf_am, explosion_weg_ab) - wer spaeter dazukommt,
   sieht sofort die Truemmer und den Countdown, ohne Explosion.

   Bei 0 fragt der Browser explosion_ausloesen(); OB geloescht wird,
   entscheidet die Datenbank nach ihrer Uhr. Danach baut sich die
   Seite ohne die geloeschten Features wieder auf (seiten-sperre.js).

   API (window.fhExplosion):
     zeigen({ ziel, scharfAm })   Countdown bis ziel (ms); Explosion nur
                                  in den ersten Sekunden nach scharfAm
     vorschau()                   nur hier: Explosion + 20 s, ohne Folgen
     ende()                       nach 0: Seite wieder aufbauen
     weg()                        sofort alles zuruecksetzen (Abbruch)
     vorschauStopp()              nur eine laufende Vorschau beenden
     laeuft()                     true, solange etwas zu sehen ist
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const MUSIK_ERSATZ = "music/countdown-4.mp3";
  const EXPLOSION_DAUER = 6500;  // so lange nach scharfAm gibt es noch die ganze Explosion
  /* Was davonfliegt: Teile der echten Seite (wie TEILE im Entwurf) und
     die obersten Bloecke der offenen Seite. */
  const TEILE = "#fh-sidebar, .fh-sidebar-logo, .fh-nav-item, .fh-nav-section-label, .fh-sidebar-footer-wrap, .fh-qs-trigger, " +
    ".fh-topbar-right > *, .fh-mobile-player-card, .fh-bottom-nav-item, .menu-button, .music-toggle, " +
    ".page.active-page .fh-page-kicker, .page.active-page .fh-page-title, .page.active-page .fh-page-lead, .page.active-page .fh-card, " +
    ".page.active-page .page-content > :not(.fh-page-head):not(.fh-dash-grid)";
  const ZITTERN = "#fh-sidebar, #fh-topbar, #fh-main, #fh-mobile-bottom-stack";

  function t(k, f) { return typeof window.t === "function" ? window.t(k, f) : f; }
  function tf(k, f, w) { return t(k, f).replace(/\{(\w+)\}/g, function (_, n) { return w[n] != null ? w[n] : ""; }); }
  function el(tag, klasse, text) { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; }

  let lauf = null;

  /* ------------------------------------------------------
     AUFBAU: eine feste Ebene an body (#fh-explosion, steht in
     allen :not-Listen der Epochen) mit Effekten und Countdown.
  ------------------------------------------------------ */
  function bauen() {
    const w = el("div", "fhx");
    w.id = "fh-explosion";
    const fx = w.appendChild(el("div", "fhx-fx"));
    fx.setAttribute("aria-hidden", "true");
    const R = { wurzel: w, fx: fx };
    R.glow = fx.appendChild(el("div", "fhx-glow"));
    R.ring1 = fx.appendChild(el("div", "fhx-ring1"));
    R.ring2 = fx.appendChild(el("div", "fhx-ring2"));
    R.rest = fx.appendChild(el("div", "fhx-rest"));
    R.blitz = fx.appendChild(el("div", "fhx-blitz"));

    const cd = R.cd = w.appendChild(el("div", "fhx-cd"));
    cd.setAttribute("role", "timer");
    cd.setAttribute("aria-live", "off");
    cd.setAttribute("aria-label", t("explosion.aria", "Live-Story: Explosion mit Countdown"));
    R.kicker = cd.appendChild(el("p", "fhx-kicker", t("explosion.gleich", "Gleich geht’s los")));
    R.ziffern = cd.appendChild(el("div", "fhx-ziffern"));
    R.teile = {};
    [["tage", "Tage"], ["stunden", "Stunden"], ["minuten", "Minuten"], ["sekunden", "Sekunden"]].forEach(function (x, i) {
      if (i > 0) { const d = el("span", "fhx-doppel", ":"); d.setAttribute("data-vor", x[0]); R.ziffern.appendChild(d); }
      const g = el("div", "fhx-gruppe");
      g.setAttribute("data-teil", x[0]);
      const z = g.appendChild(el("span", "fhx-zahl", "00"));
      g.appendChild(el("span", "fhx-einheit", t("explosion." + x[0], x[1])));
      R.ziffern.appendChild(g);
      R.teile[x[0]] = z;
    });
    cd.appendChild(el("div", "fhx-linie"));
    R.ziel = cd.appendChild(el("p", "fhx-ziel"));
    R.knoepfe = w.appendChild(el("div", "fhx-knoepfe"));
    document.body.appendChild(w);
    return R;
  }

  /* ------------------------------------------------------
     HILFEN (wie im Entwurf)
  ------------------------------------------------------ */
  function staerke() { return 1; }
  function spaeter(fn, ms) { if (lauf) lauf.timer.push(setTimeout(fn, ms)); }
  function anim(e, kf, opt) { if (!e || !lauf) return null; const a = e.animate(kf, opt); lauf.anims.push(a); return a; }
  function neu(css) {
    const e = document.createElement("span");
    e.setAttribute("data-funke", "");
    e.style.cssText = "position:absolute;" + css;
    lauf.R.fx.appendChild(e);
    return e;
  }
  function wurf(vx, vy, T, g, k, rot, extra) {
    const n = 10, fr = [];
    for (let i = 0; i <= n; i++) {
      const tt = (i / n) * T, f = (1 - Math.exp(-k * tt)) / k;
      const x = vx * f, y = (vy + g / k) * f - (g / k) * tt, p = i / n;
      fr.push({ transform: "translate(" + x + "px, " + y + "px) rotate(" + (rot * p) + "deg)" + (extra ? extra(p) : ""), opacity: p < 0.62 ? 1 : 1 - (p - 0.62) / 0.38 });
    }
    return fr;
  }
  function mitte() {
    const m = document.getElementById("fh-main");
    const r = m ? m.getBoundingClientRect() : { left: 0, width: innerWidth };
    return { x: r.left + r.width / 2, y: innerHeight * 0.45 };
  }
  function setzeMitte(c) {
    [lauf.R.glow, lauf.R.ring1, lauf.R.ring2, lauf.R.rest].forEach(function (e) { e.style.left = c.x + "px"; e.style.top = c.y + "px"; });
    lauf.R.blitz.style.background = "radial-gradient(circle at " + c.x + "px " + c.y + "px, var(--fh-explosion-blitz), var(--fh-explosion-blitz-mitte) 40%, var(--fh-explosion-blitz-rand) 75%)";
  }

  /* ------------------------------------------------------
     DIE EXPLOSION
  ------------------------------------------------------ */
  function zittern() {
    const c = lauf.c = mitte();
    setzeMitte(c);
    const A = 9 * staerke(), n = 56, frames = [], glow = [];
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const env = p < 0.3 ? 0.22 * Math.sin((p / 0.3) * Math.PI) : p < 0.45 ? 0.04 : Math.pow((p - 0.45) / 0.55, 1.6);
      const a = A * env;
      frames.push({ transform: "translate(" + ((Math.random() * 2 - 1) * a) + "px, " + ((Math.random() * 2 - 1) * a) + "px) rotate(" + ((Math.random() * 2 - 1) * a * 0.06) + "deg)" });
      glow.push({ opacity: Math.min(1, 0.08 + env * 0.85 + (Math.random() - 0.5) * 0.18 * env), transform: "scale(" + (0.12 + env * 0.36) + ")" });
    }
    frames[n] = { transform: "none" };
    document.querySelectorAll(ZITTERN).forEach(function (e) { anim(e, frames, { duration: 1900, easing: "linear" }); });
    anim(lauf.R.glow, glow, { duration: 1900, easing: "linear", fill: "forwards" });
    staubRieseln(1900);
    klang.grollen();
    spaeter(knall, 1900);
  }

  function staubRieseln(dauer) {
    const W = innerWidth;
    for (let i = 0; i < 26; i++) {
      const g = 1 + Math.random() * 2.2, x = Math.random() * W;
      const e = neu("left:" + x + "px;top:-6px;width:" + g + "px;height:" + g + "px;border-radius:50%;background:var(--fh-explosion-staub);");
      const fall = 120 + Math.random() * 380;
      anim(e, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { transform: "translate(" + ((Math.random() - 0.5) * 30) + "px, " + fall + "px)", opacity: 0 }],
        { duration: 900 + Math.random() * 900, delay: dauer * (0.45 + Math.random() * 0.5), easing: "cubic-bezier(.5,0,1,1)", fill: "forwards" });
    }
  }

  function knall() {
    if (!lauf) return;
    const c = lauf.c || mitte(), W = innerWidth, H = innerHeight, S = staerke();
    const R = Math.hypot(Math.max(c.x, W - c.x), Math.max(c.y, H - c.y)) * 1.1;
    const welle = 1300, vm = Math.max(W, H) / 100;

    anim(lauf.R.blitz, [{ opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0 }], { duration: 1100, easing: "ease-out" });
    anim(lauf.R.glow, [{ opacity: 1, transform: "scale(.48)" }, { opacity: 0, transform: "scale(2.8)" }], { duration: 1500, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" });

    const sh = [], n = 30;
    for (let i = 0; i <= n; i++) { const a = 20 * S * Math.pow(1 - i / n, 2.2); sh.push({ transform: "translate(" + ((Math.random() * 2 - 1) * a) + "px, " + ((Math.random() * 2 - 1) * a) + "px)" }); }
    anim(lauf.R.fx, sh, { duration: 1300, easing: "linear" });

    const ring = function (e, delay, dur, dicke) {
      e.style.borderWidth = dicke + "px";
      anim(e, [
        { opacity: 1, width: "0px", height: "0px", transform: "translate(-50%,-50%)" },
        { opacity: 0.85, offset: 0.45 },
        { opacity: 0, width: R * 2 + "px", height: R * 2 + "px", transform: "translate(-50%,-50%)" },
      ], { duration: dur, delay: delay, easing: "cubic-bezier(.15,.65,.35,1)", fill: "forwards" });
    };
    ring(lauf.R.ring1, 0, welle, 3);
    ring(lauf.R.ring2, 90, welle + 400, 22);
    const hitze = neu("left:" + c.x + "px;top:" + c.y + "px;width:" + (R * 2) + "px;height:" + (R * 2) + "px;border-radius:50%;backdrop-filter:blur(5px) saturate(1.3);-webkit-backdrop-filter:blur(5px) saturate(1.3);-webkit-mask:radial-gradient(circle,transparent 58%,#000 66%,transparent 74%);mask:radial-gradient(circle,transparent 58%,#000 66%,transparent 74%);");
    anim(hitze, [{ transform: "translate(-50%,-50%) scale(0)", opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], { duration: welle + 150, easing: "cubic-bezier(.15,.65,.35,1)", fill: "forwards" });

    feuerball(c, vm, S);
    rauch(c, vm, S);

    document.querySelectorAll("#fh-topbar, .fh-bottom-nav, .fh-mobile-bottom-stack").forEach(function (e) {
      anim(e, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 200, easing: "ease-out", fill: "forwards" });
    });

    document.querySelectorAll(TEILE).forEach(function (e) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(e).display === "none") return;
      if (r.bottom < -200 || r.top > H + 200) return;  // weit ausserhalb: verschwindet ohnehin mit
      const px = r.left + r.width / 2, py = r.top + r.height / 2;
      const dx = px - c.x, dy = py - c.y, dd = Math.hypot(dx, dy) || 1;
      const ux = dx / dd, uy = dy / dd, nah = 1 - Math.min(1, dd / R);
      const tHit = 1 - Math.cbrt(Math.max(0, 1 - Math.min(1, dd / R)));
      const gross = e.id === "fh-sidebar" || r.width > 300;
      const v = (700 + Math.random() * 900) * S * (0.55 + nah) * (gross ? 0.7 : 1);
      const vx = ux * v + (Math.random() - 0.5) * 160, vy = uy * v - (250 + Math.random() * 350) * S;
      const T = 1.9 + Math.random() * 0.9, rot = (Math.random() * 2 - 1) * (gross ? 40 : 220) * S;
      const fr = wurf(vx, vy, T, 1500, 1.1, rot, function (p) { return " scale(" + (1 - p * 0.25) + ")"; });
      fr.forEach(function (f, i) { const p = i / (fr.length - 1); f.filter = "blur(" + (p * 5) + "px) brightness(" + (1 + Math.max(0, 0.9 - p * 3)) + ")"; });
      fr[0].filter = "blur(0px) brightness(1)";
      anim(e, fr, { duration: T * 1000, delay: tHit * welle * 0.85, easing: "linear", fill: "forwards" });
      if (!gross && r.width > 60) splitter(px, py, ux, uy, S, tHit * welle * 0.85, Math.min(6, Math.round(r.width * r.height / 9000)));
    });

    document.querySelectorAll(".stars, .stars2").forEach(function (s) {
      anim(s, [{ transform: "scale(1)", opacity: getComputedStyle(s).opacity }, { transform: "scale(1.4)", opacity: 0.14 }], { duration: 3200, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" });
    });

    funken(c);
    glut(c, vm);
    klang.knall();
    /* Danach bleiben nur Truemmer: die Teile sind weg, auch wenn die
       Animationen einmal enden. */
    spaeter(function () { document.documentElement.classList.add("fh-explosion-truemmer"); }, 3600);
    spaeter(countdownZeigen, 2500);
  }

  function splitter(x, y, ux, uy, S, delay, anzahl) {
    for (let i = 0; i < anzahl; i++) {
      const w = 6 + Math.random() * 18, h = 4 + Math.random() * 12;
      const pts = [0, 1, 2].map(function () { return Math.round(Math.random() * 100) + "% " + Math.round(Math.random() * 100) + "%"; }).join(",");
      const e = neu("left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;background:linear-gradient(135deg,var(--fh-explosion-splitter),var(--fh-explosion-splitter-dunkel));clip-path:polygon(" + pts + ");opacity:0;");
      const v = (600 + Math.random() * 1100) * S, wk = Math.atan2(uy, ux) + (Math.random() - 0.5) * 1.6;
      const T = 1.6 + Math.random() * 1.2;
      anim(e, wurf(Math.cos(wk) * v, Math.sin(wk) * v - 300 * S, T, 1700, 0.9, (Math.random() - 0.5) * 900), { duration: T * 1000, delay: delay, easing: "linear", fill: "forwards" });
    }
  }

  function feuerball(c, vm, S) {
    const kern = neu("left:" + c.x + "px;top:" + c.y + "px;width:" + (34 * vm) + "px;height:" + (34 * vm) + "px;border-radius:50%;background:radial-gradient(circle,var(--fh-explosion-kern) 0%,var(--fh-explosion-kern-mitte) 22%,var(--fh-explosion-kern-rand) 48%,transparent 70%);mix-blend-mode:screen;");
    anim(kern, [{ transform: "translate(-50%,-50%) scale(.05)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(.9)", opacity: 1, offset: 0.25 }, { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }], { duration: 950, easing: "cubic-bezier(.1,.8,.3,1)", fill: "forwards" });
    const n = Math.round(11 * Math.min(1.5, S));
    for (let i = 0; i < n; i++) {
      const g = (12 + Math.random() * 14) * vm, w = (i / n) * Math.PI * 2 + Math.random() * 0.6, dist = (6 + Math.random() * 16) * vm * S;
      const e = neu("left:" + c.x + "px;top:" + c.y + "px;width:" + g + "px;height:" + g + "px;border-radius:50%;background:radial-gradient(circle,var(--fh-explosion-feuer-hell) 0%,var(--fh-explosion-feuer) 30%,var(--fh-explosion-feuer-tief) 55%,transparent 72%);mix-blend-mode:screen;filter:blur(" + (4 + Math.random() * 6) + "px);");
      const x = Math.cos(w) * dist, y = Math.sin(w) * dist - Math.random() * 4 * vm;
      anim(e, [
        { transform: "translate(-50%,-50%) translate(0,0) scale(.15)", opacity: 0, filter: "blur(4px) brightness(1.7)" },
        { opacity: 1, offset: 0.08 },
        { transform: "translate(-50%,-50%) translate(" + (x * 0.75) + "px," + (y * 0.75) + "px) scale(1.1)", opacity: 0.9, filter: "blur(8px) brightness(1.1)", offset: 0.4 },
        { transform: "translate(-50%,-50%) translate(" + x + "px," + (y - 3 * vm) + "px) scale(1.6)", opacity: 0, filter: "blur(16px) brightness(.5)" },
      ], { duration: 1500 + Math.random() * 900, delay: Math.random() * 120, easing: "cubic-bezier(.12,.75,.3,1)", fill: "forwards" });
    }
  }

  function rauch(c, vm, S) {
    const n = Math.round(22 * Math.min(1.4, S));
    for (let i = 0; i < n; i++) {
      const g = (14 + Math.random() * 18) * vm, w = Math.random() * Math.PI * 2, dist = (12 + Math.random() * 34) * vm * S;
      const e = neu("left:" + c.x + "px;top:" + c.y + "px;width:" + g + "px;height:" + g + "px;border-radius:50%;background:radial-gradient(circle,var(--fh-explosion-rauch) 0%,var(--fh-explosion-rauch-rand) 40%,transparent 70%);filter:blur(14px);opacity:0;");
      const x = Math.cos(w) * dist, y = Math.sin(w) * dist * 0.75, auf = 60 + Math.random() * 160;
      anim(e, [
        { transform: "translate(-50%,-50%) translate(0,0) scale(.3)", opacity: 0 },
        { transform: "translate(-50%,-50%) translate(" + (x * 0.55) + "px," + (y * 0.55) + "px) scale(1.1)", opacity: 0.85, offset: 0.18 },
        { transform: "translate(-50%,-50%) translate(" + (x * 0.85) + "px," + (y * 0.85 - auf * 0.5) + "px) scale(1.9)", opacity: 0.55, offset: 0.55 },
        { transform: "translate(-50%,-50%) translate(" + x + "px," + (y - auf) + "px) scale(2.6) rotate(" + ((Math.random() - 0.5) * 60) + "deg)", opacity: 0 },
      ], { duration: 4200 + Math.random() * 2200, delay: 120 + Math.random() * 380, easing: "cubic-bezier(.15,.7,.35,1)", fill: "forwards" });
    }
  }

  function funken(c) {
    const farben = ["var(--fh-gold-bright)", "var(--fh-fire)", "var(--fh-gold)", "var(--fh-fire-deep)", "var(--fh-explosion-blitz)"];
    const n = Math.round(110 * Math.min(1.6, staerke()));
    for (let i = 0; i < n; i++) {
      const col = farben[i % farben.length], lang = 6 + Math.random() * 18, dick = 1.5 + Math.random() * 2;
      const w = Math.random() * Math.PI * 2, v = (500 + Math.random() * 1500) * staerke();
      const e = neu("left:" + c.x + "px;top:" + c.y + "px;width:" + lang + "px;height:" + dick + "px;border-radius:" + dick + "px;background:" + col + ";box-shadow:0 0 " + (dick * 4) + "px " + col + ";");
      const T = 1.2 + Math.random() * 1.6, deg = (w * 180) / Math.PI;
      anim(e, wurf(Math.cos(w) * v, Math.sin(w) * v - 200, T, 900, 1.6, 0, function (p) { return " rotate(" + (deg + p * 50) + "deg) scaleX(" + (1 - p * 0.7) + ")"; }),
        { duration: T * 1000, delay: Math.random() * 90, easing: "linear", fill: "forwards" });
    }
  }

  function glut(c, vm) {
    for (let i = 0; i < 38; i++) {
      const g = 1.5 + Math.random() * 3, x = c.x + (Math.random() - 0.5) * 70 * vm, y = c.y + (Math.random() - 0.3) * 40 * vm;
      const col = Math.random() < 0.5 ? "var(--fh-fire)" : "var(--fh-gold-bright)";
      const e = neu("left:" + x + "px;top:" + y + "px;width:" + g + "px;height:" + g + "px;border-radius:50%;background:" + col + ";box-shadow:0 0 " + (g * 4) + "px " + col + ";opacity:0;");
      const steig = 120 + Math.random() * 280, drift = (Math.random() - 0.5) * 120;
      anim(e, [
        { transform: "translate(0,0)", opacity: 0 }, { opacity: 0.95, offset: 0.15 }, { opacity: 0.35, offset: 0.35 },
        { transform: "translate(" + (drift * 0.5) + "px," + (-steig * 0.5) + "px)", opacity: 0.9, offset: 0.55 }, { opacity: 0.3, offset: 0.75 },
        { transform: "translate(" + drift + "px," + (-steig) + "px)", opacity: 0 },
      ], { duration: 3000 + Math.random() * 2600, delay: 500 + Math.random() * 1400, easing: "ease-out", fill: "forwards" });
    }
  }

  function ruhigWeg() {
    document.documentElement.classList.add("fh-explosion-truemmer");
    countdownZeigen();
  }

  /* ------------------------------------------------------
     COUNTDOWN
  ------------------------------------------------------ */
  function countdownZeigen() {
    if (!lauf || lauf.cdAn) return;
    lauf.cdAn = true;
    const cd = lauf.R.cd;
    cd.classList.add("ist-an");
    anim(cd, RUHIG.matches
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: "scale(1.2)", filter: "blur(16px)" }, { opacity: 1, transform: "scale(1)", filter: "blur(0px)" }],
      { duration: 1100, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    anim(lauf.R.rest, [{ opacity: 0 }, { opacity: 1 }], { duration: 1600, fill: "forwards" });
    zielTextSetzen();
    tick();
    lauf.uhr = setInterval(tick, 200);
    musik.start();
  }

  function zielTextSetzen() {
    if (lauf.vorschau) { lauf.R.ziel.textContent = t("explosion.test", "Vorschau – 20 Sekunden, ohne Folgen"); return; }
    const d = new Date(lauf.ziel);
    const sprache = (document.documentElement.lang || "de").slice(0, 2) === "en" ? "en-GB" : "de-DE";
    const zeit = d.toLocaleTimeString(sprache, { hour: "2-digit", minute: "2-digit" });
    const heute = new Date().toDateString() === d.toDateString();
    lauf.R.ziel.textContent = heute
      ? tf("explosion.bis", "bis {zeit} Uhr", { zeit: zeit })
      : tf("explosion.bisDatum", "bis {datum}, {zeit} Uhr", { datum: d.toLocaleDateString(sprache, { weekday: "short", day: "numeric", month: "numeric" }), zeit: zeit });
  }

  function tick() {
    if (!lauf) return;
    const rest = Math.max(0, lauf.ziel - Date.now());
    const s = Math.ceil(rest / 1000);
    if (s !== lauf.letzteSek) {
      const vorher = lauf.letzteSek;
      lauf.letzteSek = s;
      const tage = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
      const p = function (n) { return String(n).padStart(2, "0"); };
      const R = lauf.R;
      R.teile.tage.textContent = String(tage);
      R.teile.stunden.textContent = p(h);
      R.teile.minuten.textContent = p(m);
      R.teile.sekunden.textContent = p(sek);
      R.ziffern.setAttribute("data-tage", tage > 0 ? "ja" : "nein");
      R.ziffern.setAttribute("data-stunden", tage > 0 || h > 0 ? "ja" : "nein");
      const knapp = s > 0 && s <= 10;
      R.cd.classList.toggle("ist-knapp", knapp || s === 0);
      if (vorher !== undefined && !RUHIG.matches) {
        R.teile.sekunden.animate([{ transform: "translateY(-.08em)", opacity: 0.5 }, { transform: "none", opacity: 1 }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" });
        if (knapp) R.ziffern.animate([{ transform: "scale(1.05)" }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    if (rest === 0 && !lauf.null) nullErreicht();
  }

  function nullErreicht() {
    lauf.null = true;
    clearInterval(lauf.uhr);
    const R = lauf.R;
    R.kicker.textContent = t("explosion.jetzt", "Jetzt");
    R.cd.classList.add("ist-null");
    if (!RUHIG.matches) R.ziffern.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 800, easing: "cubic-bezier(.2,.8,.2,1)" });
    musik.aus();
    if (lauf.vorschau) { spaeter(ende, 3500); return; }
    /* Die Datenbank entscheidet; live-storys.js schaltet danach die
       Seite um und ruft ende(). Spaetestens nach 8 s geht es weiter. */
    if (typeof lauf.beiNull === "function") lauf.beiNull();
    spaeter(ende, 8000);
  }

  /* Nach 0: Effekte und Countdown ausblenden, die Seite kommt zurueck -
     ohne die geloeschten Features (die blendet seiten-sperre.js aus). */
  function ende() {
    if (!lauf || lauf.endet) return;
    lauf.endet = true;
    const R = lauf.R;
    R.wurzel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: "ease-in", fill: "forwards" });
    setTimeout(function () {
      zuruecksetzen();
      if (RUHIG.matches) return;
      document.querySelectorAll("#fh-sidebar, #fh-topbar, #fh-main, #fh-mobile-bottom-stack").forEach(function (e, i) {
        e.animate([{ opacity: 0, transform: "scale(.96)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }],
          { duration: 900, delay: i * 120, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
      });
    }, 1250);
  }

  /* Alles zurueck: Animationen, Funken, Truemmer-Klasse, Ebene. */
  function zuruecksetzen() {
    if (!lauf) return;
    lauf.timer.forEach(clearTimeout);
    clearInterval(lauf.uhr);
    lauf.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* schon vorbei */ } });
    musik.aus(true);
    document.documentElement.classList.remove("fh-explosion-truemmer");
    lauf.R.wurzel.remove();
    lauf = null;
  }

  /* ------------------------------------------------------
     KLANG: Grollen und Knall (WebAudio, wie im Entwurf),
     Musik waehrend des Countdowns.
  ------------------------------------------------------ */
  const klang = {
    ctx: null,
    holen: function () {
      if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { this.ctx = new C(); } catch (e) { return null; } }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(function () { /* braucht einen Klick */ });
      return this.ctx;
    },
    rauschen: function (ctx, sek) {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sek), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; return s;
    },
    grollen: function () {
      const ctx = this.holen(); if (!ctx) return;
      const t0 = ctx.currentTime, n = this.rauschen(ctx, 2), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "lowpass"; f.frequency.setValueAtTime(90, t0); f.frequency.linearRampToValueAtTime(220, t0 + 1.9);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.45); g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.85);
      g.gain.exponentialRampToValueAtTime(0.75, t0 + 1.85); g.gain.linearRampToValueAtTime(0, t0 + 1.95);
      n.connect(f).connect(g).connect(ctx.destination); n.start(t0); n.stop(t0 + 2);
    },
    knall: function () {
      const ctx = this.holen(); if (!ctx) return;
      if (ctx.state === "suspended") tonKnopfZeigen();
      const t0 = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0.9;
      const echo = ctx.createDelay(1); echo.delayTime.value = 0.42; const fb = ctx.createGain(); fb.gain.value = 0.32;
      const eF = ctx.createBiquadFilter(); eF.type = "lowpass"; eF.frequency.value = 600;
      out.connect(ctx.destination); out.connect(echo); echo.connect(eF).connect(fb).connect(echo); fb.connect(ctx.destination);
      const n = this.rauschen(ctx, 5), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "lowpass"; f.frequency.setValueAtTime(4000, t0); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.6); f.frequency.exponentialRampToValueAtTime(50, t0 + 4.2);
      g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t0 + 4.8);
      n.connect(f).connect(g).connect(out); n.start(t0); n.stop(t0 + 5);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(22, t0 + 2);
      og.gain.setValueAtTime(1, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 2.3);
      o.connect(og).connect(out); o.start(t0); o.stop(t0 + 2.4);
      const k = this.rauschen(ctx, 3), kf = ctx.createBiquadFilter(), kg = ctx.createGain();
      kf.type = "bandpass"; kf.frequency.value = 2400; kf.Q.value = 0.8; kg.gain.setValueAtTime(0, t0);
      for (let i = 0; i < 60; i++) { const ti = t0 + 0.25 + Math.pow(Math.random(), 1.6) * 2.6; kg.gain.setValueAtTime(0.5 * Math.random() * (1 - (ti - t0) / 3), ti); kg.gain.setValueAtTime(0, ti + 0.012 + Math.random() * 0.02); }
      k.connect(kf).connect(kg).connect(out); k.start(t0); k.stop(t0 + 3);
    },
  };

  const musik = {
    audio: null, fade: 0,
    quelle: function () {
      const eigene = window.fhLiveStorys && typeof window.fhLiveStorys.musikUrl === "function" ? window.fhLiveStorys.musikUrl("explosion") : null;
      return eigene || MUSIK_ERSATZ;
    },
    start: function () {
      if (!lauf || lauf.null) return;
      try {
        if (!this.audio) this.audio = new Audio(this.quelle());
        this.audio.loop = true; this.audio.volume = 0.55; this.audio.currentTime = 0;
        this.audio.play().catch(tonKnopfZeigen);
      } catch (e) { console.warn("Explosion: Musik nicht abspielbar", e); }
    },
    aus: function (sofort) {
      const a = this.audio;
      cancelAnimationFrame(this.fade);
      if (!a || a.paused) return;
      if (sofort) { a.pause(); return; }
      const v0 = a.volume, t0 = performance.now(), self = this;
      const schritt = function () {
        const k = Math.min(1, (performance.now() - t0) / 2500);
        a.volume = v0 * (1 - k);
        if (k < 1) self.fade = requestAnimationFrame(schritt); else a.pause();
      };
      this.fade = requestAnimationFrame(schritt);
    },
  };

  function knopf(text, fn) {
    const b = el("button", "fh-cta fhx-knopf", text);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }
  function tonKnopfZeigen() {
    if (!lauf || lauf.R.tonKnopf) return;
    lauf.R.tonKnopf = lauf.R.knoepfe.appendChild(knopf(t("explosion.tonAn", "Ton an"), function () {
      const ctx = klang.holen();
      if (ctx) ctx.resume().catch(function () { /* still */ });
      if (lauf && lauf.cdAn && !lauf.null) musik.start();
      if (lauf && lauf.R.tonKnopf) { lauf.R.tonKnopf.remove(); lauf.R.tonKnopf = null; }
    }));
  }

  /* ------------------------------------------------------
     START
  ------------------------------------------------------ */
  function starten(opt) {
    zuruecksetzen();
    lauf = { R: bauen(), anims: [], timer: [], ziel: opt.ziel, vorschau: !!opt.vorschau, beiNull: opt.beiNull, null: false };
    /* Der Admin muss im Gateway abbrechen koennen: Er darf den Countdown
       fuer sich ausblenden (fuer alle anderen laeuft er weiter). */
    if (opt.vorschau || (typeof window.fhViewerIstAdmin === "function" && window.fhViewerIstAdmin())) {
      lauf.R.knoepfe.appendChild(knopf(opt.vorschau ? t("explosion.vorschauStopp", "Vorschau beenden") : t("explosion.adminWeg", "Für mich ausblenden"), function () {
        if (lauf) lauf.ausgeblendet = true;
        const war = lauf;
        zuruecksetzen();
        if (war && !war.vorschau) gemerkt = war.ziel;
      }));
    }
    const frisch = opt.vorschau || (opt.scharfAm && Date.now() - opt.scharfAm < EXPLOSION_DAUER);
    if (!frisch) { ruhigWeg(); return; }
    spaeter(function () { if (RUHIG.matches) ruhigWeg(); else zittern(); }, 600);
  }

  /* Hat der Admin den Countdown fuer sich ausgeblendet, kommt er fuer
     dasselbe Ziel nicht von selbst zurueck. */
  let gemerkt = null;

  window.fhExplosion = {
    zeigen: function (opt) {
      if (!opt || !opt.ziel) return;
      if (gemerkt === opt.ziel) return;
      if (lauf && !lauf.vorschau && lauf.ziel === opt.ziel) { lauf.beiNull = opt.beiNull; return; }
      starten({ ziel: opt.ziel, scharfAm: opt.scharfAm, beiNull: opt.beiNull });
    },
    vorschau: function () { gemerkt = null; starten({ ziel: Date.now() + 600 + 2500 + 1900 + 20000, vorschau: true }); },
    ende: function () { if (lauf && !lauf.vorschau) ende(); },
    weg: function () { if (lauf && !lauf.vorschau) zuruecksetzen(); },
    vorschauStopp: function () { if (lauf && lauf.vorschau) zuruecksetzen(); },
    laeuft: function () { return !!lauf; },
  };
})();
