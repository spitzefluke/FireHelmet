/* ======================================================
   WERBUNGSFLUT (Migration 31)
   ---------------------------------------------------
   ??? flutet die Seite mit 32 Werbefenstern im Stil von 2003.
   Zu schliessen ueber das X; wer auf den Knopf im Fenster klickt,
   sieht, was dahinter steckt - sechs Fenster verraten ein Secret
   (+25 Dublonen je Secret, hoechstens 150, ueber
   live_story_belohnung(..., 'werbung', Zahl)). "Alle Fenster
   schliessen?" macht drei neue auf.

   live-storys.js startet die Flut in den Storys "werbung" und
   "gegenhack_niederlage" (dort nach dem Gesicht von ???):
     fhWerbungsflut.start({ dauer, belohnen(zahl) -> Promise,
                            ende: { kopf, titel, text | Promise }, gehackt })
     fhWerbungsflut.zeitUm()  - Story vorbei: Abschlussbild zeigen
     fhWerbungsflut.weg()     - abgebrochen: alles weg

   Die Texte stehen in i18n.js unter werbung.* (DE/EN).
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function W(key, de) { return t("werbung." + key, de); }
  function aus(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  /* Symbole: lucide (ISC), stroke-width 1.6 */
  function svg(pfade) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + '</svg>';
  }
  const IC = {
    pokal: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    warnung: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    herz: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    muenzen: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>',
    frage: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    brief: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    bild: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    megafon: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    uhr: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  const ANDII = "scripts/avatare/%C3%A4ndii.webp";
  const A = function (n) { return "scripts/avatare/" + n + ".png"; };

  /* Aufbau der Fenster. Index = Textnummer in i18n.js (werbung.sN.*).
     geheim: "secret" zaehlt als Secret, "text" ist nur ein Witz. */
  const SPAM = [
    { icon: "pokal", grund: "#ffe14d", farbe: "#d10000", tinte: "#111", ctaGrund: "#d10000", ctaTinte: "#fff", geheim: "text" },
    { icon: "warnung", grund: "#fff", farbe: "#c00", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "secret" },
    { icon: "herz", grund: "#ff3fb4", farbe: "#fff", tinte: "#fff", ctaGrund: "#fff", ctaTinte: "#ff3fb4", geheim: "text" },
    { icon: "muenzen", grund: "#00d26a", farbe: "#fff200", tinte: "#012", ctaGrund: "#fff200", ctaTinte: "#012", geheim: "secret" },
    { icon: "herz", grund: "#ff8a00", farbe: "#fff", tinte: "#1a0a00", ctaGrund: "#1a0a00", ctaTinte: "#ff8a00", geheim: "text" },
    { icon: "warnung", grund: "#d4d0c8", farbe: "#000", tinte: "#000", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "secret" },
    { icon: "frage", grund: "#fff", farbe: "#0a246a", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", hydra: true },
    { icon: "brief", grund: "#fffbe6", farbe: "#0a246a", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "text" },
    { icon: "chat", grund: "#e6f3ff", farbe: "#0a246a", tinte: "#222", ctaGrund: "#3a6ea5", ctaTinte: "#fff", geheim: "text" },
    { icon: "frage", grund: "#1b1b1b", farbe: "#ffe14d", tinte: "#eee", ctaGrund: "#ffe14d", ctaTinte: "#111", geheim: "text" },
    { icon: "bild", bild: ANDII, bildFilter: "sepia(1) contrast(1.3)", meme: true, stempel: true, grund: "#f1dcaa", farbe: "#5a3a12", tinte: "#3a260c", ctaGrund: "#5a3a12", ctaTinte: "#f1dcaa", geheim: "secret" },
    { icon: "bild", bild: A(1), bildFilter: "saturate(4) contrast(2.2) brightness(1.1)", bildTransform: "scale(1.35)", meme: true, grund: "#fff", farbe: "#000", tinte: "#222", ctaGrund: "#000", ctaTinte: "#fff", geheim: "text" },
    { icon: "bild", duo: true, bild: A(2), grund: "#ffe6f2", farbe: "#c0006a", tinte: "#222", ctaGrund: "#c0006a", ctaTinte: "#fff", geheim: "text" },
    { icon: "pokal", bild: ANDII, bildFilter: "hue-rotate(40deg) saturate(1.6)", bildKlasse: "ist-drehbild", meme: true, grund: "#fff200", farbe: "#0a246a", tinte: "#111", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "text" },
    { icon: "bild", bild: A(5), bildFilter: "grayscale(1) contrast(1.4)", stempel: true, grund: "#e6f3ff", farbe: "#0a246a", tinte: "#222", ctaGrund: "#3a6ea5", ctaTinte: "#fff", geheim: "text" },
    { icon: "schloss", captcha: [A(1), A(2), A(4), A(5), ANDII, A(6)], grund: "#f7f7f7", farbe: "#1a73e8", tinte: "#222", ctaGrund: "#1a73e8", ctaTinte: "#fff", geheim: "text" },
    { icon: "download", balken: true, grund: "#d4d0c8", farbe: "#000", tinte: "#000", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "text" },
    { icon: "warnung", flieht: true, grund: "#39ff14", farbe: "#000", tinte: "#012", ctaGrund: "#000", ctaTinte: "#39ff14", geheim: "text" },
    { icon: "brief", grund: "#fff", farbe: "#e00", tinte: "#222", ctaGrund: "#e00", ctaTinte: "#fff", geheim: "text" },
    { icon: "megafon", marquee: true, grund: "#c00", farbe: "#fff", tinte: "#fff", ctaGrund: "#fff", ctaTinte: "#c00", geheim: "text" },
    { icon: "pokal", rad: true, grund: "#6a00ff", farbe: "#fff200", tinte: "#fff", ctaGrund: "#fff200", ctaTinte: "#6a00ff", geheim: "text" },
    { icon: "monitor", dvd: true, grund: "#111", farbe: "#39ff14", tinte: "#ddd", ctaGrund: "#39ff14", ctaTinte: "#111", geheim: "secret" },
    { icon: "warnung", fensterKlasse: "ist-wackeln", grund: "#ffe14d", farbe: "#c00", tinte: "#111", ctaGrund: "#c00", ctaTinte: "#fff", geheim: "text" },
    { icon: "herz", tanz: true, bild: ANDII, fensterKlasse: "ist-regenbogen", grund: "#ff3fb4", farbe: "#fff", tinte: "#fff", ctaGrund: "#fff", ctaTinte: "#ff3fb4", geheim: "text" },
    { icon: "chat", tippt: true, grund: "#e6f3ff", farbe: "#0a246a", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "secret" },
    { icon: "uhr", countdown: true, grund: "#000", farbe: "#ff2d2d", tinte: "#fff", ctaGrund: "#ff2d2d", ctaTinte: "#fff", geheim: "text" },
    { icon: "warnung", fensterKlasse: "ist-pumpen", grund: "#00d26a", farbe: "#fff", tinte: "#012", ctaGrund: "#012", ctaTinte: "#00d26a", geheim: "text" },
    { icon: "chat", stimme: true, grund: "#fff", farbe: "#c00", tinte: "#222", ctaGrund: "#c00", ctaTinte: "#fff", geheim: "text" },
    { icon: "uhr", grund: "#fffbe6", farbe: "#0a246a", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "text" },
    { icon: "pokal", grund: "#fff200", farbe: "#000", tinte: "#111", ctaGrund: "#000", ctaTinte: "#fff200", geheim: "text" },
    { icon: "bild", bild: A(4), bildFilter: "contrast(1.5) saturate(2)", bildTransform: "scale(1.6) rotate(12deg)", meme: true, grund: "#e6f3ff", farbe: "#0a246a", tinte: "#222", ctaGrund: "#0a246a", ctaTinte: "#fff", geheim: "text" },
    { icon: "herz", grund: "#fff", farbe: "#5a3a12", tinte: "#222", ctaGrund: "#5a3a12", ctaTinte: "#fff", geheim: "text" },
    { icon: "monitor", bild: ANDII, bildFilter: "blur(2px) grayscale(.6)", meme: true, grund: "#1b1b1b", farbe: "#ff3fb4", tinte: "#eee", ctaGrund: "#ff3fb4", ctaTinte: "#fff", geheim: "text" },
    { icon: "herz", bild: A(6), bildFilter: "saturate(1.8) hue-rotate(-20deg)", bildTransform: "scale(1.2) rotate(-6deg)", meme: true, grund: "#ff3fb4", farbe: "#fff", tinte: "#fff", ctaGrund: "#fff", ctaTinte: "#ff3fb4", geheim: "text" },
  ];
  const SECRETS = SPAM.map(function (c, i) { return c.geheim === "secret" ? i : -1; }).filter(function (i) { return i >= 0; });
  const HYDRA = SPAM.findIndex(function (c) { return c.hydra; });
  const FENSTER_GESAMT = 32;

  /* ------------------------------------------------------
     ZUSTAND
  ------------------------------------------------------ */
  let lauf = null;   // { wurzel, reihe, gespawnt, nid, offen: Map, gefunden: [], ende, opts, uhr, bisMs }

  function textVon(i, feld) { return W("s" + i + "." + feld, ""); }

  /* Reihenfolge: alle sechs Secrets sicher unter den 32, das
     Hydra-Fenster an Platz 5, 16 und 27 wie im Entwurf. */
  function reihenfolge() {
    const mischen = function (a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
    const rest = mischen(SPAM.map(function (_, i) { return i; }).filter(function (i) { return i !== HYDRA && SECRETS.indexOf(i) < 0; }));
    const basis = mischen(SECRETS.concat(rest.slice(0, FENSTER_GESAMT - 3 - SECRETS.length)));
    basis.splice(4, 0, HYDRA); basis.splice(15, 0, HYDRA); basis.splice(26, 0, HYDRA);
    return basis;
  }

  function platz(breite) {
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      x: Math.round(8 + Math.random() * Math.max(0, vw - breite - 16)),
      y: Math.round(52 + Math.random() * Math.max(0, vh - 400)),
    };
  }

  function fensterHtml(k) {
    const c = SPAM[k];
    const T = function (f) { return esc(textVon(k, f)); };
    let mitte = "";
    if (c.bild && (c.meme || c.stempel) && !c.tanz) {
      mitte += '<div class="fh-wf-bild" style="border-color:' + c.farbe + '"><img src="' + c.bild + '" alt="" style="filter:' + (c.bildFilter || "none") + ';transform:' + (c.bildTransform || "none") + '"' + (c.bildKlasse ? ' class="' + c.bildKlasse + '"' : '') + '>' +
        (c.meme ? '<span class="fh-wf-meme ist-oben">' + T("oben") + '</span><span class="fh-wf-meme ist-unten">' + T("unten") + '</span>' : '') +
        (c.stempel ? '<span class="fh-wf-stempel">' + T("stempel") + '</span>' : '') + '</div>';
    }
    if (c.duo) {
      mitte += '<div class="fh-wf-duo"><div><img src="' + c.bild + '" alt=""><span>' + T("vorher") + '</span></div>' +
        '<div><img src="' + c.bild + '" alt="" class="ist-nachher"><span class="ist-rot">' + T("nachher") + '</span></div></div>';
    }
    mitte += '<p class="fh-wf-head" style="color:' + c.farbe + '">' + T("head") + '</p><p class="fh-wf-body"></p>';
    if (c.captcha) mitte += '<div class="fh-wf-captcha">' + c.captcha.map(function (b) { return '<img src="' + b + '" alt="">'; }).join("") + '</div>';
    if (c.marquee) mitte += '<div class="fh-wf-laufband"><div><span>' + T("marquee") + '</span><span>' + T("marquee") + '</span></div></div>';
    if (c.rad) mitte += '<div class="fh-wf-rad"><span class="fh-wf-rad-zeiger"></span><div class="fh-wf-rad-scheibe"></div><span class="fh-wf-rad-mitte"></span></div>';
    if (c.dvd) mitte += '<div class="fh-wf-dvd"><span>???</span></div>';
    if (c.tanz) mitte += '<div class="fh-wf-tanz"><img src="' + c.bild + '" alt=""></div>';
    if (c.tippt) mitte += '<div class="fh-wf-tippt"><span></span><span></span><span></span></div>';
    if (c.countdown) mitte += '<p class="fh-wf-countdown">00:00:03</p>';
    if (c.balken) mitte += '<div class="fh-wf-ladebalken"><div></div></div><p class="fh-wf-klein">' + T("balken") + '</p>';
    return '<div class="fh-wf-fenster' + (c.fensterKlasse ? " " + c.fensterKlasse : "") + '" role="dialog" aria-label="' + T("titel") + '">' +
      '<div class="fh-wf-leiste"><span class="fh-wf-leiste-titel">' + svg(IC[c.icon] || IC.warnung) + '<span>' + T("titel") + '</span></span>' +
      '<button type="button" class="fh-wf-zu" aria-label="' + esc(W("close", "Schließen")) + '">✕</button></div>' +
      '<div class="fh-wf-inhalt" style="background:' + c.grund + ';color:' + c.tinte + '">' + mitte +
      '<button type="button" class="fh-wf-cta" style="background:' + c.ctaGrund + ';color:' + c.ctaTinte + '">' + T("cta") + '</button></div>' +
    '</div>';
  }

  function stimmeText() {
    const z = window.fhLiveZuschauer && window.fhLiveZuschauer.letzteStimme ? window.fhLiveZuschauer.letzteStimme() : null;
    return z ? String(textVon(27, "bodyStimme")).replace("{wahl}", z) : textVon(27, "body");
  }

  function oeffnen(k) {
    if (!lauf || lauf.ende) return;
    const c = SPAM[k];
    const breite = Math.min(c.hydra ? 280 : 300, window.innerWidth - 16);
    const p = platz(breite);
    const f = aus(fensterHtml(k));
    const id = lauf.nid++;
    f.style.left = p.x + "px";
    f.style.top = p.y + "px";
    f.style.width = breite + "px";
    f.style.zIndex = String(10 + id);
    f.querySelector(".fh-wf-body").textContent = c.stimme ? stimmeText() : textVon(k, "body");
    const eintrag = { id: id, k: k, el: f, enthuellt: false, flucht: 0 };
    f.querySelector(".fh-wf-zu").addEventListener("click", function () { schliessen(eintrag, true); });
    f.querySelector(".fh-wf-cta").addEventListener("click", function () { klick(eintrag); });
    if (c.flieht) {
      const fliehen = function () {
        if (eintrag.enthuellt || eintrag.flucht >= 4 || !lauf) return;
        eintrag.flucht++;
        const q = platz(breite);
        f.style.left = q.x + "px"; f.style.top = q.y + "px";
      };
      f.querySelector(".fh-wf-zu").addEventListener("mouseenter", fliehen);
      f.querySelector(".fh-wf-zu").addEventListener("focus", fliehen);
    }
    /* Anklicken holt ein Fenster nach vorn. */
    f.addEventListener("pointerdown", function () { if (lauf) f.style.zIndex = String(10 + lauf.nid++); });
    lauf.offen.set(id, eintrag);
    lauf.flaeche.appendChild(f);
  }

  function schliessen(e, perX) {
    if (!lauf) return;
    e.el.remove();
    lauf.offen.delete(e.id);
    /* Das Hydra-Fenster ueber das X geschlossen: zwei neue. */
    if (perX && SPAM[e.k].hydra && !e.enthuellt && lauf.nid < 55) { oeffnen(HYDRA); oeffnen(HYDRA); }
    hud();
  }

  function klick(e) {
    if (!lauf || e.enthuellt) return;
    const c = SPAM[e.k];
    if (c.hydra) {
      e.el.remove();
      lauf.offen.delete(e.id);
      if (lauf.nid < 55) { for (let i = 0; i < 3; i++) oeffnen(lauf.reihe[Math.floor(Math.random() * lauf.reihe.length)]); }
      hud();
      return;
    }
    e.enthuellt = true;
    const istSecret = c.geheim === "secret";
    if (istSecret && lauf.gefunden.indexOf(e.k) < 0) lauf.gefunden.push(e.k);
    const inhalt = e.el.querySelector(".fh-wf-inhalt");
    const neu = aus('<div class="fh-wf-enthuellt"><p class="fh-wf-enthuellt-kopf' + (istSecret ? ' ist-secret' : '') + '">' + svg(istSecret ? IC.schloss : IC.chat) + '<span>' +
      esc(istSecret ? W("secretFound", "Secret gefunden") : W("fromUnknown", "Nachricht von ???")) + '</span></p><p class="fh-wf-enthuellt-text"></p></div>');
    neu.querySelector(".fh-wf-enthuellt-text").textContent = textVon(e.k, "geheim");
    inhalt.replaceWith(neu);
    e.el.classList.remove("ist-wackeln", "ist-pumpen", "ist-regenbogen");
    hud();
  }

  function hud() {
    if (!lauf || !lauf.hud) return;
    lauf.hud.querySelector(".fh-wf-hud-secrets").textContent = W("secrets", "Secrets") + " " + lauf.gefunden.length + " / " + SECRETS.length;
    lauf.hud.querySelector(".fh-wf-hud-fenster").textContent = lauf.offen.size + " " + W("windowsOpen", "Fenster offen");
    if (lauf.gespawnt >= FENSTER_GESAMT && lauf.offen.size === 0) abschluss();
  }

  function takt() {
    if (!lauf || lauf.ende) return;
    const jetzt = Date.now();
    if (lauf.gespawnt < FENSTER_GESAMT && jetzt - lauf.letztes > 200) {
      oeffnen(lauf.reihe[lauf.gespawnt]);
      lauf.gespawnt++;
      lauf.letztes = jetzt;
      hud();
    }
    /* Das Countdown-Fenster zaehlt ewig 3-2-1-0. */
    const cd = "00:00:0" + (3 - Math.floor(jetzt / 1000) % 4);
    lauf.flaeche.querySelectorAll(".fh-wf-countdown").forEach(function (p) { if (p.textContent !== cd) p.textContent = cd; });
    if (lauf.bisMs && jetzt >= lauf.bisMs) abschluss();
  }

  /* Abschlussbild: Secrets und Belohnung. */
  async function abschluss() {
    if (!lauf || lauf.ende) return;
    const l = lauf;
    l.ende = true;
    clearInterval(l.uhr);
    l.offen.forEach(function (e) { e.el.remove(); });
    l.offen.clear();
    if (l.hud) l.hud.remove();
    const o = l.opts.ende || {};
    const box = aus('<div class="fh-wf-ende' + (l.opts.gehackt ? ' ist-gehackt' : '') + '" role="dialog" aria-modal="true" aria-labelledby="fh-wf-ende-titel"><div class="fh-wf-ende-inhalt">' +
      '<p class="fh-wf-ende-kicker"><span class="fh-wf-punkt"></span><span></span></p>' +
      '<h1 id="fh-wf-ende-titel" class="fh-wf-ende-titel"></h1>' +
      '<p class="fh-wf-ende-text"></p>' +
      '<div class="fh-wf-ende-secrets"><p class="fh-wf-ende-label"></p><div class="fh-wf-ende-liste"></div></div>' +
      '<p class="fh-wf-ende-beute" aria-live="polite"></p>' +
      '<button type="button" class="fh-wf-weiter">' + esc(W("next", "Weiter")) + '</button>' +
    '</div></div>');
    box.querySelector(".fh-wf-ende-kicker span:last-child").textContent = o.kopf || W("endKicker", "Werbepause vorbei");
    box.querySelector(".fh-wf-ende-titel").textContent = o.titel || W("endTitle", "Alle Fenster zu.");
    const textZiel = box.querySelector(".fh-wf-ende-text");
    textZiel.textContent = "> " + (typeof o.text === "string" ? o.text : W("endText", "??? hat euer Schiff mit Werbung geflutet – und dabei mehr verraten, als gut war."));
    if (o.text && typeof o.text.then === "function") o.text.then(function (s) { if (s) textZiel.textContent = "> " + s; });
    box.querySelector(".fh-wf-ende-label").textContent = W("foundSecrets", "Gefundene Secrets") + " · " + l.gefunden.length + " / " + SECRETS.length;
    const liste = box.querySelector(".fh-wf-ende-liste");
    if (!l.gefunden.length) {
      const p = document.createElement("p"); p.className = "fh-wf-ende-leer"; p.textContent = W("noSecrets", "Keine. In den Werbefenstern steckte mehr, als man denkt.");
      liste.appendChild(p);
    }
    l.gefunden.forEach(function (k) {
      const p = aus('<p class="fh-wf-ende-secret"><span>›</span><span></span></p>');
      p.lastChild.textContent = textVon(k, "geheim");
      liste.appendChild(p);
    });
    box.querySelector(".fh-wf-weiter").addEventListener("click", weg);
    l.wurzel.appendChild(box);
    box.querySelector(".fh-wf-weiter").focus();
    if (l.gefunden.length && typeof l.opts.belohnen === "function") {
      try {
        const erg = await l.opts.belohnen(l.gefunden.length);
        if (erg && erg.ok && erg.dublonen > 0) {
          box.querySelector(".fh-wf-ende-beute").textContent = "+" + erg.dublonen + " " + W("coins", "Dublonen") + (erg.vorschau ? " (" + t("story.preview", "Vorschau") + ")" : "");
        }
      } catch (e) { /* ohne Beute-Zeile */ }
    }
  }

  function start(opts) {
    weg();
    const wurzel = aus('<div id="fh-werbungsflut" class="fh-wf' + (opts.gehackt ? ' ist-gehackt' : '') + '"><div class="fh-wf-flaeche"></div>' +
      '<div class="fh-wf-hud" role="status"><span class="fh-wf-hud-titel">' + esc(W("hud", "??? spamt dein Schiff")) + '</span>' +
      '<span class="fh-wf-hud-secrets"></span><span class="fh-wf-hud-fenster"></span>' +
      '<button type="button" class="fh-wf-hud-weiter">' + esc(W("skip", "Überspringen")) + '</button></div></div>');
    document.body.appendChild(wurzel);
    lauf = {
      wurzel: wurzel, flaeche: wurzel.querySelector(".fh-wf-flaeche"), hud: wurzel.querySelector(".fh-wf-hud"),
      reihe: reihenfolge(), gespawnt: 0, nid: 0, offen: new Map(), gefunden: [], ende: false, letztes: 0, opts: opts || {},
      bisMs: opts && opts.dauer ? Date.now() + opts.dauer : 0,
    };
    lauf.hud.querySelector(".fh-wf-hud-weiter").addEventListener("click", abschluss);
    hud();
    lauf.uhr = setInterval(takt, RUHIG.matches ? 400 : 100);
  }

  function zeitUm() { if (lauf && !lauf.ende) abschluss(); }

  function weg() {
    if (!lauf) return;
    clearInterval(lauf.uhr);
    lauf.wurzel.remove();
    lauf = null;
  }

  window.fhWerbungsflut = {
    start: start,
    zeitUm: zeitUm,
    weg: weg,
    laeuft: function () { return !!lauf && !lauf.ende; },
    SECRETS: SECRETS.length,
  };
})();
