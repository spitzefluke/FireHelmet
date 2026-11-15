/* ======================================================
   AUSBRUCH AUS DER VERWAHRUNG (Escape Room, Migration 72)
   ---------------------------------------------------
   Gibt es nur, solange die Seite nach einer verlorenen Sternenreise
   die Verwahrung zeigt (html.fh-verwahrung, sternenreise.js). Man
   öffnet es über „Zelle verlassen“ auf der Akte oder „Ausbruch
   versuchen“ in der Statusleiste.

   VIER RÄUME (scripts/liveevent/zelle-raeume.js, nachgeladen als
   „zelleRaeume“): Zelle C-17 → Lüftungsschacht → Wachraum →
   Asservatenkammer. Jeder Raum endet mit einer Antwort, die die
   Datenbank prüft (zelle_loesen); erst dann kommen die Hinweise für
   den nächsten. Die Rätsel würfelt die Datenbank je Lauf neu.

   DIESE DATEI ist der Rahmen um die Räume:
   - Lauf holen (zelle_start), Antworten prüfen (zelle_loesen),
     Strafen melden (zelle_strafe); Zeit = Serverzeit + Strafen.
   - Kopf mit Uhr, Strafzeit, Ton, Tipp, Schließen; Raumleiste;
     Inventar zum Kombinieren; Notizbuch mit allem, was man gefunden
     hat; Meldungszeile.
   - Kontrollen: alle 60–90 s kommen Schritte. Drei Sekunden, um sich
     zu verstecken, sonst +60 s.
   - Tipps: drei Stufen je Raum, jeder +60 s.
   - Dunkelheit: ein Lichtkegel, der dem Zeiger (oder dem Fokus) folgt.
   - Klang aus WebAudio (abschaltbar, „fhZelleTon“).
   - Endbildschirm mit Zeit, Belohnung, Titel und Bestenliste.

   Was man in einem Raum schon getan hat, liegt je Lauf im
   localStorage („fhZelle2:<lauf>“) - Neuladen beginnt nicht von vorn,
   die Uhr läuft auf dem Server weiter.

   Alle Texte per textContent und t() (i18n.js: zelle.*).
     fhZelle.start({ schluessel, beimEntkommen })   schluessel "vorschau" = Admin
     fhZelle.weg()
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const NS = "http://www.w3.org/2000/svg";
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function tf(key, fallback, werte) {
    let s = t(key, fallback);
    Object.keys(werte || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(werte[k])); });
    return s;
  }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attr, eltern) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attr || {}).forEach(function (k) { e.setAttribute(k, attr[k]); });
    if (eltern) eltern.appendChild(e);
    return e;
  }
  /* Symbole: lucide (ISC), stroke-width 1.6 - feste Zeichenketten. */
  const SYMBOL = {
    loeffel: '<path d="M15 4a3 3 0 0 1 4 4l-2 2a3 3 0 0 1-4-4z"/><path d="m14 10-9 9a1.5 1.5 0 0 1-2-2l9-9"/>',
    draht: '<path d="M4 18c3-6 6 2 9-4s5 0 7-6"/>',
    haken: '<path d="M18 3v9a5 5 0 0 1-10 0v-1"/><path d="m5 13 3-3 3 3"/>',
    blech: '<rect width="16" height="6" x="4" y="9" rx="1"/><path d="M8 9v6M12 9v6M16 9v6"/>',
    notiz: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/><path d="M8 13h8M8 17h5"/>',
    sicherung: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 3v18M14 3v18M7 8h10M7 16h10"/>',
    karte: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    buch: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    tipp: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    tuer: '<path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/>',
    ton: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/>',
    tonAus: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="m22 9-6 6M16 9l6 6"/>',
    pokal: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  };
  function symbol(name) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = SYMBOL[name] || "";
    return s;
  }
  function knopf(text, klasse, klick, sym) {
    const k = el("button", "rs-knopf" + (klasse ? " " + klasse : ""));
    k.type = "button";
    if (sym) k.appendChild(symbol(sym));
    if (text) k.appendChild(document.createTextNode(text));
    if (klick) k.addEventListener("click", klick);
    return k;
  }
  function gemerkt(schl) { try { return localStorage.getItem(schl); } catch (e) { return null; } }
  function merken(schl, wert) { try { localStorage.setItem(schl, wert); } catch (e) { /* Privatmodus */ } }

  const STRAFE = { tipp: 60, erwischt: 60, sensor: 15 };
  const KONTROLLE_VON = 60000, KONTROLLE_BIS = 90000, VERSTECK_ZEIT = 3000, LICHT_ZEIT = 3200;
  const DINGE = ["loeffel", "draht", "haken", "blech", "notiz", "sicherung", "karte"];
  const REZEPTE = [["loeffel", "draht", "haken"]];   // a + b -> c (a bleibt, b geht auf)

  let lauf = null;

  /* ------------------------------------------------------
     SERVER
  ------------------------------------------------------ */
  async function rpc(name, args) {
    if (typeof supabaseClient === "undefined" || !supabaseClient) throw new Error("keine-datenbank");
    if (typeof wheelAuthReady !== "undefined" && wheelAuthReady) { try { await wheelAuthReady; } catch (e) { /* trotzdem versuchen */ } }
    const aufruf = function () { return supabaseClient.rpc(name, args || {}); };
    const erg = typeof withSupabaseRlsColdStartRetry === "function" ? await withSupabaseRlsColdStartRetry(aufruf) : await aufruf();
    if (erg.error) throw erg.error;
    return erg.data;
  }

  /* ------------------------------------------------------
     KLANG (WebAudio, nur nach einem Klick)
  ------------------------------------------------------ */
  const klang = {
    ctx: null,
    an: function () { return gemerkt("fhZelleTon") !== "aus"; },
    bereit: function () {
      if (!this.an()) return null;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!this.ctx) { try { this.ctx = new C(); } catch (e) { return null; } }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(function () { /* still */ });
      return this.ctx;
    },
    ton: function (frq, dauer, art, laut, nach) {
      const c = this.bereit();
      if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + (nach || 0);
      o.type = art || "sine";
      o.frequency.setValueAtTime(frq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(laut || 0.12, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dauer + 0.02);
    },
    rauschen: function (dauer, laut, frq, nach) {
      const c = this.bereit();
      if (!c) return;
      const n = Math.floor(c.sampleRate * dauer), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      let s = 7;
      for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      const q = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + (nach || 0);
      q.buffer = b; f.type = "bandpass"; f.frequency.value = frq || 900; f.Q.value = 1.2;
      g.gain.setValueAtTime(laut || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
      q.connect(f).connect(g).connect(c.destination);
      q.start(t0);
    },
    spiel: function (name) {
      if (!this.an()) return;
      switch (name) {
        case "klick": this.ton(900, 0.05, "square", 0.04); break;
        case "fund": this.ton(660, 0.12, "triangle", 0.1); this.ton(990, 0.18, "triangle", 0.1, 0.1); break;
        case "fehler": this.ton(180, 0.25, "sawtooth", 0.07); break;
        case "schloss": this.rauschen(0.08, 0.25, 2400); this.ton(140, 0.2, "square", 0.08, 0.06); break;
        case "tropfen": this.ton(1400, 0.08, "sine", 0.05); this.ton(700, 0.12, "sine", 0.03, 0.03); break;
        case "schritte": for (let i = 0; i < 4; i++) this.rauschen(0.09, 0.18, 220, i * 0.45); break;
        case "alarm": for (let i = 0; i < 3; i++) this.ton(i % 2 ? 620 : 880, 0.22, "square", 0.06, i * 0.24); break;
        case "geschafft": [523, 659, 784, 1047].forEach(function (f, i) { klang.ton(f, 0.3, "triangle", 0.09, i * 0.12); }); break;
        case "rauschen": this.rauschen(0.4, 0.05, 1600); break;
        case "summen": this.ton(110, 0.6, "sawtooth", 0.03); break;
        default: break;
      }
    },
  };

  /* ------------------------------------------------------
     STAND JE LAUF (nur im Browser)
  ------------------------------------------------------ */
  function lokalLaden(id) {
    try {
      const s = JSON.parse(gemerkt("fhZelle2:" + id) || "null");
      if (s && typeof s === "object") return s;
    } catch (e) { /* neu */ }
    return { dinge: [], notizen: [], raeume: {}, tipps: {}, raum: 1 };
  }
  function lokalMerken() { if (lauf && lauf.id) merken("fhZelle2:" + lauf.id, JSON.stringify(lauf.lokal)); }

  function hat(d) { return lauf.lokal.dinge.indexOf(d) >= 0; }
  function nimm(d) {
    if (hat(d)) return;
    lauf.lokal.dinge.push(d);
    lokalMerken(); inventar();
    const neu = lauf.ref.inventar.querySelector('[data-ding="' + d + '"]');
    if (neu && !RUHIG.matches) neu.classList.add("ist-neu");
  }
  function gib(d) {
    lauf.lokal.dinge = lauf.lokal.dinge.filter(function (x) { return x !== d; });
    if (lauf.wahl === d) lauf.wahl = null;
    lokalMerken(); inventar();
  }

  /* Notizbuch: was man gefunden hat, mit festem Schlüssel (keine Doppelten). */
  function notiz(schl, text) {
    const n = lauf.lokal.notizen;
    const alt = n.find(function (x) { return x.k === schl; });
    if (alt) { if (alt.t === text) return; alt.t = text; } else n.push({ k: schl, t: text });
    lokalMerken();
    lauf.ref.buchZahl.textContent = String(n.length);
    lauf.ref.buchKnopf.classList.add("ist-neu");
  }

  function meldung(text, art) {
    const m = lauf && lauf.ref.meldung;
    if (!m) return;
    m.textContent = text;
    m.className = "zl-meldung" + (art ? " ist-" + art : "");
  }

  /* ------------------------------------------------------
     INVENTAR (anklicken = auswählen, zwei Dinge = kombinieren)
  ------------------------------------------------------ */
  function dingName(d) {
    return t("zelle.ding." + d, { loeffel: "Löffel", draht: "Drahtstück", haken: "Drahthaken", blech: "Blechstück", notiz: "Notiz", sicherung: "Sicherung", karte: "Schlüsselkarte" }[d] || d);
  }
  function waehlen(d) {
    if (lauf.wahl && lauf.wahl !== d) {
      const a = lauf.wahl, b = d;
      const r = REZEPTE.find(function (x) { return (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a); });
      lauf.wahl = null;
      if (r) {
        gib(r[1]); nimm(r[2]);
        klang.spiel("fund");
        meldung(tf("zelle.kombi.ok", "Du biegst {b} um {a}: {c}.", { a: dingName(r[0]), b: dingName(r[1]), c: dingName(r[2]) }), "gut");
      } else {
        klang.spiel("fehler");
        meldung(t("zelle.kombi.nein", "Das passt nicht zusammen."));
      }
      inventar();
      return;
    }
    lauf.wahl = lauf.wahl === d ? null : d;
    klang.spiel("klick");
    if (d === "notiz" && lauf.wahl) { lauf.wahl = null; buchZeigen(); }
    else if (lauf.wahl) meldung(tf("zelle.kombi.gewaehlt", "{d} in der Hand. Klick ein zweites Ding zum Kombinieren – oder benutze es im Raum.", { d: dingName(d) }));
    inventar();
  }
  function inventar() {
    const inv = lauf.ref.inventar;
    inv.replaceChildren();
    if (!lauf.lokal.dinge.length) { inv.appendChild(el("span", "rs-leise", t("zelle.taschenLeer", "Deine Taschen sind leer."))); return; }
    lauf.lokal.dinge.forEach(function (d) {
      const b = el("button", "zl-ding" + (lauf.wahl === d ? " ist-gewaehlt" : ""));
      b.type = "button";
      b.setAttribute("data-ding", d);
      b.setAttribute("aria-pressed", lauf.wahl === d ? "true" : "false");
      b.appendChild(symbol(DINGE.indexOf(d) >= 0 ? d : "notiz"));
      b.appendChild(document.createTextNode(dingName(d)));
      b.addEventListener("click", function () { waehlen(d); });
      inv.appendChild(b);
    });
  }

  /* ------------------------------------------------------
     NOTIZBUCH UND ZETTEL
  ------------------------------------------------------ */
  function zettel(titel, inhalt) {
    const z = lauf.ref.zettel;
    z.replaceChildren();
    z.appendChild(el("div", "rs-kicker ist-rot", titel));
    (Array.isArray(inhalt) ? inhalt : [inhalt]).forEach(function (x) { z.appendChild(typeof x === "string" ? el("p", null, x) : x); });
    z.appendChild(knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { z.hidden = true; }));
    z.hidden = false;
    z.lastChild.focus();
  }
  function buchZeigen() {
    lauf.ref.buchKnopf.classList.remove("ist-neu");
    const n = lauf.lokal.notizen;
    zettel(t("zelle.buch.titel", "Notizbuch"), n.length ? n.map(function (x) { return x.t; }) : [t("zelle.buch.leer", "Noch nichts notiert.")]);
  }

  /* ------------------------------------------------------
     UHR
  ------------------------------------------------------ */
  function zeitText(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function laufzeit() {
    if (!lauf || !lauf.server) return 0;
    return Date.now() - lauf.versatz - lauf.server.start + lauf.server.strafe * 1000;
  }
  function uhr() {
    if (!lauf || lauf.fertig) return;
    lauf.ref.zeit.textContent = zeitText(laufzeit());
    lauf.ref.strafe.textContent = lauf.server && lauf.server.strafe ? tf("zelle.strafe", "davon {s} s Strafe", { s: lauf.server.strafe }) : "";
  }
  async function strafe(art) {
    if (!lauf || !lauf.id) return;
    lauf.server.strafe += STRAFE[art] || 0;
    uhr();
    try {
      const d = await rpc("zelle_strafe", { p_lauf: lauf.id, p_art: art });
      if (lauf && d && d.ok) { lauf.server.strafe = d.strafe_sek; uhr(); }
    } catch (e) { console.warn("Ausbruch: Strafe nicht gemeldet", e); }
  }

  /* ------------------------------------------------------
     DUNKELHEIT: Lichtkegel, der dem Zeiger folgt
     ohneZeiger: das Licht setzt der Raum selbst (hin), z. B. im Schacht.
  ------------------------------------------------------ */
  function dunkel(svg, radius, rest, ohneZeiger) {
    const id = "zl-licht-" + Math.random().toString(36).slice(2, 8);
    const defs = sv("defs", {}, svg);
    const grad = sv("radialGradient", { id: id + "-g" }, defs);
    sv("stop", { offset: "0", "stop-color": "#000", "stop-opacity": "1" }, grad);
    sv("stop", { offset: "0.55", "stop-color": "#000", "stop-opacity": "0.85" }, grad);
    sv("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0" }, grad);
    const maske = sv("mask", { id: id }, defs);
    sv("rect", { x: 0, y: 0, width: 1280, height: 720, fill: "#fff" }, maske);
    const kegel = sv("circle", { cx: 640, cy: 360, r: radius, fill: "url(#" + id + "-g)" }, maske);
    const decke = sv("rect", { x: 0, y: 0, width: 1280, height: 720, fill: "#04040a", opacity: String(1 - (rest || 0.08)), mask: "url(#" + id + ")", "pointer-events": "none", class: "zl-decke" }, svg);
    function hin(x, y) { kegel.setAttribute("cx", x.toFixed(0)); kegel.setAttribute("cy", y.toFixed(0)); }
    if (!ohneZeiger) svg.addEventListener("pointermove", function (e) {
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      hin(p.x, p.y);
    });
    if (!ohneZeiger) svg.addEventListener("focusin", function (e) {
      if (!e.target.getBBox) return;
      try { const b = e.target.getBBox(); hin(b.x + b.width / 2, b.y + b.height / 2); } catch (x) { /* ohne Box */ }
    });
    return { decke: decke, hin: hin, radius: function (r) { kegel.setAttribute("r", r); } };
  }

  /* Ein klickbares Teil der Szene (SVG-Gruppe), per Tastatur erreichbar. */
  function klickbar(g, label, fn) {
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", label);
    g.classList.add("zl-teil");
    const t0 = sv("title", {}); t0.textContent = label; g.insertBefore(t0, g.firstChild);
    const los = function (e) {
      e.preventDefault();
      if (lauf && lauf.kontrolle) { meldung(t("zelle.kontrolleStill", "Kontrolle! Halt still, bis das Licht weg ist."), "rot"); return; }
      klang.bereit();
      fn(e);
    };
    g.addEventListener("click", los);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") los(e); });
    return g;
  }

  /* ------------------------------------------------------
     DAS AUGE (Raum 1, 3, 4): Klick = zurückschauen, zu für 6 s.
     aus(ms): abgeschaltet (Sicherungskasten im Wachraum).
     starr: false = lässt sich nicht wegstarren (Kamera im Wachraum).
  ------------------------------------------------------ */
  function auge(eltern, x, y, r, starr) {
    const g = sv("g", { class: "zl-auge", transform: "translate(" + x + " " + y + ")" }, eltern);
    sv("ellipse", { rx: r * 1.5, ry: r, class: "zl-auge-weiss" }, g);
    const iris = sv("circle", { r: r * 0.62, class: "zl-auge-iris" }, g);
    sv("circle", { r: r * 0.26, class: "zl-auge-pupille" }, g);
    const lid = sv("ellipse", { rx: r * 1.55, ry: r * 1.05, class: "zl-auge-lid" }, g);
    const zustand = { zuBis: 0, ausBis: 0, uhr: 0 };
    function malen() {
      const zu = Date.now() < Math.max(zustand.zuBis, zustand.ausBis);
      g.classList.toggle("ist-zu", zu);
      g.classList.toggle("ist-aus", Date.now() < zustand.ausBis);
      lid.setAttribute("opacity", zu ? "1" : "0");
    }
    const api = {
      g: g,
      zu: function () { return Date.now() < Math.max(zustand.zuBis, zustand.ausBis); },
      schliessen: function (ms) { zustand.zuBis = Date.now() + ms; malen(); clearTimeout(zustand.uhr); zustand.uhr = setTimeout(malen, Math.max(ms, zustand.ausBis - Date.now()) + 30); },
      aus: function (ms) { zustand.ausBis = Date.now() + ms; malen(); clearTimeout(zustand.uhr); zustand.uhr = setTimeout(malen, ms + 30); },
      wach: function () { g.classList.add("ist-wach"); setTimeout(function () { g.classList.remove("ist-wach"); }, 900); },
      blick: function (px, py) {
        const dx = px - x, dy = py - y, d = Math.max(1, Math.hypot(dx, dy)), k = Math.min(r * 0.45, d / 20);
        iris.setAttribute("transform", "translate(" + (dx / d * k).toFixed(1) + " " + (dy / d * k * 0.7).toFixed(1) + ")");
      },
    };
    klickbar(g, t("zelle.auge.name", "Das Auge – zurückschauen"), function () {
      if (api.zu()) return;
      if (starr === false) { api.wach(); klang.spiel("fehler"); meldung(t("zelle.auge.starr", "Das ist eine Kamera mit Auge. Anstarren nützt hier nichts – irgendwo muss sie Strom bekommen."), "rot"); return; }
      api.schliessen(6000);
      klang.spiel("summen");
      meldung(t("zelle.auge.zu", "Du starrst zurück. Das Auge schließt sich – für ein paar Sekunden."), "gut");
    });
    malen();
    return api;
  }

  /* ------------------------------------------------------
     KONTROLLE: Schritte, drei Sekunden zum Verstecken
  ------------------------------------------------------ */
  function kontrolleplanen() {
    clearTimeout(lauf.kontrollUhr);
    const ms = KONTROLLE_VON + Math.random() * (KONTROLLE_BIS - KONTROLLE_VON);
    lauf.kontrollUhr = setTimeout(kontrolle, ms);
  }
  function kontrolle() {
    if (!lauf || lauf.fertig) return;
    /* Wer gerade einen Zettel liest, wird einmal verschont - beim nächsten Mal nicht. */
    if (!lauf.ref.zettel.hidden && !lauf.kontrolleVerschoben) { lauf.kontrolleVerschoben = true; lauf.kontrollUhr = setTimeout(kontrolle, 8000); return; }
    lauf.kontrolleVerschoben = false;
    lauf.kontrolle = "warnung";
    lauf.versteckt = false;
    lauf.ref.wurzel.classList.add("ist-kontrolle");
    klang.spiel("schritte");
    meldung(t("zelle.kontrolle", "Schritte im Gang – Kontrolle! Versteck dich, schnell."), "rot");
    lauf.ref.versteckKnopf.hidden = false;
    lauf.ref.versteckKnopf.focus();
    lauf.kontrollUhr = setTimeout(function () {
      if (!lauf) return;
      lauf.kontrolle = "licht";
      lauf.ref.wurzel.classList.add("ist-licht");
      lauf.ref.versteckKnopf.hidden = true;
      if (!lauf.versteckt) {
        klang.spiel("alarm");
        strafe("erwischt");
        meldung(tf("zelle.erwischt", "Der Lichtkegel trifft dich. Der Wärter notiert dich – +{s} s.", { s: STRAFE.erwischt }), "rot");
      }
      lauf.kontrollUhr = setTimeout(function () {
        if (!lauf) return;
        lauf.kontrolle = null;
        lauf.ref.wurzel.classList.remove("ist-kontrolle", "ist-licht", "ist-versteckt");
        if (lauf.versteckt) meldung(t("zelle.kontrolleVorbei", "Die Schritte entfernen sich. Niemand hat dich gesehen."), "gut");
        kontrolleplanen();
      }, LICHT_ZEIT);
    }, VERSTECK_ZEIT);
  }
  function verstecken() {
    if (!lauf || lauf.kontrolle !== "warnung" || lauf.versteckt) return;
    lauf.versteckt = true;
    lauf.ref.wurzel.classList.add("ist-versteckt");
    lauf.ref.versteckKnopf.hidden = true;
    meldung(t("zelle.versteckt", "Du drückst dich ins Dunkel und hältst den Atem an."), "gut");
  }

  /* ------------------------------------------------------
     TIPPS: drei Stufen je Raum, jeder kostet 60 s
  ------------------------------------------------------ */
  function tipp() {
    const r = lauf.lokal.raum, n = lauf.lokal.tipps[r] || 0;
    if (n >= 3) { meldung(t("zelle.tipp.keine", "Mehr Tipps gibt es für diesen Raum nicht."), "tipp"); return; }
    if (!lauf.tippFrage) {
      lauf.tippFrage = true;
      meldung(tf("zelle.tipp.frage", "Ein Tipp kostet {s} s. Nochmal auf „Tipp“ drücken, um ihn zu nehmen.", { s: STRAFE.tipp }), "tipp");
      setTimeout(function () { if (lauf) lauf.tippFrage = false; }, 6000);
      return;
    }
    lauf.tippFrage = false;
    lauf.lokal.tipps[r] = n + 1;
    lokalMerken();
    strafe("tipp");
    const text = t("zelle.tipp.r" + r + "." + (n + 1), "");
    notiz("tipp-" + r + "-" + (n + 1), tf("zelle.buch.tipp", "Tipp {n} (Raum {r}): {text}", { n: n + 1, r: r, text: text }));
    meldung(text, "tipp");
  }

  /* ------------------------------------------------------
     RÄUME
  ------------------------------------------------------ */
  const RAUM_ERSATZ = ["", "Zelle C-17", "Lüftungsschacht", "Wachraum", "Asservatenkammer"];

  function raumLeiste() {
    const l = lauf.ref.leiste;
    l.replaceChildren();
    for (let r = 1; r <= 4; r++) {
      const b = el("button", "zl-raumknopf" + (r === lauf.lokal.raum ? " ist-hier" : ""), r + " · " + t("zelle.raum." + r, RAUM_ERSATZ[r]));
      b.type = "button";
      b.disabled = r > lauf.offenBis;
      if (r === lauf.lokal.raum) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { raumZeigen(r); });
      l.appendChild(b);
    }
  }

  /* Raum r darf man betreten, wenn der vorige gelöst und (im Browser)
     verlassen ist - lauf.offenBis. */
  function raumZeigen(r) {
    if (!lauf || r > lauf.offenBis || !window.fhZelleRaeume) return;
    if (lauf.raumAbbau) lauf.raumAbbau();
    lauf.raumAbbau = null;
    lauf.lokal.raum = r;
    lokalMerken();
    raumLeiste();
    const buehne = lauf.ref.buehne;
    buehne.replaceChildren();
    buehne.setAttribute("data-raum", String(r));
    if (!RUHIG.matches) { buehne.classList.remove("ist-rein"); void buehne.offsetWidth; buehne.classList.add("ist-rein"); }
    const zustand = lauf.lokal.raeume[r] = lauf.lokal.raeume[r] || {};
    const raumApi = {
      t: t, tf: tf, el: el, sv: sv, symbol: symbol, knopf: knopf, klickbar: klickbar, auge: auge, dunkel: dunkel,
      ruhig: RUHIG.matches,
      daten: function (n) { return lauf.server.raeume[String(n || r)] || null; },
      zustand: zustand,
      merken: lokalMerken,
      meldung: meldung,
      zettel: zettel,
      notiz: notiz,
      hat: hat, nimm: nimm, gib: gib,
      gewaehlt: function () { return lauf.wahl; },
      ton: function (n) { klang.spiel(n); },
      strafe: strafe,
      gesperrt: function () { return !!lauf.kontrolle; },
      geloest: function () { return lauf.server.stufe > r; },
      loesen: function (antwort) { return loesen(r, antwort); },
      weiter: function () {
        if (!lauf || lauf.server.stufe <= r) return;
        lauf.offenBis = Math.max(lauf.offenBis, r + 1);
        lauf.lokal.offenBis = lauf.offenBis;
        lokalMerken();
        raumZeigen(r + 1);
      },
      abbau: function (fn) { lauf.raumAbbau = fn; },
    };
    window.fhZelleRaeume[r](buehne, raumApi);
    meldung(t("zelle.raum.ankunft" + r, ""));
  }

  /* Antwort eines Raums prüfen. Ergebnis: true = gelöst. */
  async function loesen(r, antwort) {
    if (!lauf || lauf.prueft) return false;
    if (lauf.server.stufe > r) return true;
    lauf.prueft = true;
    try {
      const d = await rpc("zelle_loesen", { p_lauf: lauf.id, p_stufe: r, p_antwort: String(antwort) });
      if (!lauf) return false;
      if (d && d.ok && d.fertig) { klang.spiel("geschafft"); ende(d); return true; }
      if (d && d.ok) {
        lauf.server.stufe = d.stufe;
        lauf.server.raeume = d.raeume || lauf.server.raeume;
        lauf.server.strafe = d.strafe_sek;
        klang.spiel("schloss");
        uhr();
        return true;
      }
      const grund = d && d.grund;
      if (grund === "falsch") {
        lauf.server.strafe += d.strafe || 30;
        klang.spiel("fehler");
        meldung(tf("zelle.falsch", "Falsch. Irgendwo piept es – +{s} s.", { s: d.strafe || 30 }), "rot");
        uhr();
      } else if (grund === "zu-oft") {
        meldung(t("zelle.zuOft", "Langsam – das Schloss braucht einen Moment."), "rot");
      } else if (grund === "zu-schnell") {
        /* Richtig, aber schneller als die Mindestzeit: warten, dann von selbst nochmal. */
        let rest = d.warte || 5;
        meldung(tf("zelle.zuSchnell", "Richtig – aber die Mechanik braucht noch {s} s.", { s: rest }), "tipp");
        lauf.prueft = false;
        return await new Promise(function (fertig) {
          const u = setInterval(function () {
            if (!lauf) { clearInterval(u); fertig(false); return; }
            rest--;
            if (rest > 0) { meldung(tf("zelle.zuSchnell", "Richtig – aber die Mechanik braucht noch {s} s.", { s: rest }), "tipp"); return; }
            clearInterval(u);
            loesen(r, antwort).then(fertig);
          }, 1000);
        });
      } else if (grund === "stufe" && d.stufe) {
        lauf.server.stufe = d.stufe; lauf.server.raeume = d.raeume || lauf.server.raeume;
        return lauf.server.stufe > r;
      } else {
        meldung(t("zelle.fehler", "Keine Verbindung zur Anlage. Versuch es gleich nochmal."), "rot");
      }
      return false;
    } catch (e) {
      console.warn("Ausbruch: Prüfen fehlgeschlagen", e);
      meldung(t("zelle.fehler", "Keine Verbindung zur Anlage. Versuch es gleich nochmal."), "rot");
      return false;
    } finally {
      if (lauf) lauf.prueft = false;
    }
  }

  /* ------------------------------------------------------
     ENDE: Zeit, Belohnung, Titel, Bestenliste
  ------------------------------------------------------ */
  function ende(d) {
    lauf.fertig = true;
    clearInterval(lauf.uhrId); clearTimeout(lauf.kontrollUhr);
    lauf.ref.wurzel.classList.remove("ist-kontrolle", "ist-licht", "ist-versteckt");
    lauf.ref.versteckKnopf.hidden = true;
    merken("fhZelleEntkommen", lauf.opt.schluessel);
    try { localStorage.removeItem("fhZelle2:" + lauf.id); } catch (e) { /* egal */ }
    lauf.ref.zeit.textContent = zeitText(d.zeit_sek * 1000);
    const k = el("div", "zl-ende");
    k.setAttribute("role", "dialog");
    k.setAttribute("aria-label", t("zelle.ende.titel", "Ausgebrochen."));
    const links = el("div", "zl-ende-text");
    links.appendChild(el("div", "rs-kicker", t("zelle.ende.kicker", "Notruf gesendet · Verwahranlage Terra Nova")));
    links.appendChild(el("div", "rs-gross", t("zelle.ende.titel", "Ausgebrochen.")));
    links.appendChild(el("p", "rs-text", tf("zelle.ende.text", "Zeit: {zeit} (davon {strafe} s Strafe). Irgendwo hinter dir öffnet sich ein Auge.", { zeit: zeitText(d.zeit_sek * 1000), strafe: d.strafe_sek || 0 })));
    if (d.belohnung > 0) links.appendChild(el("p", "zl-belohnung", tf("zelle.ende.belohnung", "+{n} Dublonen für den Ausbruch", { n: d.belohnung.toLocaleString("de-DE") })));
    else if (d.vorschau) links.appendChild(el("p", "rs-leise", t("zelle.ende.vorschau", "Vorschau – ohne Belohnung und Bestenliste.")));
    else if (d.hinweis) links.appendChild(el("p", "rs-leise", t("zelle.ende.deckel", "Heute gibt es keine Dublonen mehr (Tagesdeckel) – der Lauf zählt trotzdem.")));
    else links.appendChild(el("p", "rs-leise", t("zelle.ende.schon", "Die Belohnung gab es in dieser Verwahrung schon – die Zeit zählt für die Bestenliste.")));
    if (d.titel) links.appendChild(el("p", "zl-titel-neu", tf("zelle.ende.titelNeu", "Titel: „{t}“", { t: d.titel })));
    links.appendChild(knopf(t("zelle.ende.weiter", "Auf die Flucht"), "ist-haupt", function () {
      const fertig = lauf && lauf.opt.beimEntkommen;
      weg();
      if (typeof fertig === "function") fertig();
    }, "tuer"));
    k.appendChild(links);
    k.appendChild(bestenliste(d.bestenliste));
    lauf.ref.buehne.appendChild(k);
    links.lastChild.focus();
  }

  function bestenliste(b) {
    const box = el("div", "zl-liste");
    const kopf = el("div", "zl-liste-kopf");
    kopf.appendChild(symbol("pokal"));
    kopf.appendChild(el("span", null, t("zelle.liste.titel", "Schnellste Ausbrüche")));
    box.appendChild(kopf);
    const liste = (b && b.liste) || [];
    if (!liste.length) box.appendChild(el("p", "rs-leise", t("zelle.liste.leer", "Noch niemand ist entkommen.")));
    const ol = el("ol", "zl-liste-ol");
    liste.forEach(function (z) {
      const li = el("li", z.ich ? "ist-ich" : "");
      li.appendChild(el("span", "zl-liste-name", z.name));
      li.appendChild(el("span", "rs-ziffern", zeitText(z.zeit * 1000)));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (b && b.platz) box.appendChild(el("p", "rs-leise", tf("zelle.liste.platz", "Dein bester Ausbruch: {zeit} · Platz {p}", { zeit: zeitText(b.mein * 1000), p: b.platz })));
    return box;
  }

  /* ------------------------------------------------------
     AUFBAU
  ------------------------------------------------------ */
  function bauen() {
    const R = lauf.ref = {};
    const w = R.wurzel = el("div", "zl" + (RUHIG.matches ? " ist-ruhig" : ""));
    w.id = "fh-zelle";
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-label", t("zelle.name", "Ausbruch aus der Verwahrung"));
    const kopf = el("div", "zl-kopf");
    const titel = el("div", "zl-titel");
    titel.appendChild(el("div", "rs-kicker ist-rot", t("zelle.kicker", "Verwahranlage Terra Nova · Zelle C-17")));
    titel.appendChild(el("div", "rs-titel", t("zelle.name", "Ausbruch aus der Verwahrung")));
    kopf.appendChild(titel);
    const rechts = el("div", "zl-kopf-rechts");
    const uhrBox = el("div", "zl-uhr");
    R.zeit = uhrBox.appendChild(el("span", "rs-ziffern zl-zeit", "00:00"));
    R.strafe = uhrBox.appendChild(el("span", "rs-leise rs-ziffern"));
    rechts.appendChild(uhrBox);
    const ton = knopf("", "ist-leise zl-ton", function () {
      merken("fhZelleTon", klang.an() ? "aus" : "an");
      ton.replaceChildren(symbol(klang.an() ? "ton" : "tonAus"));
      ton.setAttribute("aria-label", klang.an() ? t("zelle.tonAus", "Ton aus") : t("zelle.tonAn", "Ton an"));
    }, klang.an() ? "ton" : "tonAus");
    ton.setAttribute("aria-label", klang.an() ? t("zelle.tonAus", "Ton aus") : t("zelle.tonAn", "Ton an"));
    rechts.appendChild(ton);
    rechts.appendChild(knopf(t("zelle.tipp", "Tipp"), "ist-leise", tipp, "tipp"));
    rechts.appendChild(knopf(t("zelle.schliessen", "Schließen"), "ist-leise", weg, "x"));
    kopf.appendChild(rechts);
    w.appendChild(kopf);
    R.leiste = w.appendChild(el("nav", "zl-leiste"));
    R.leiste.setAttribute("aria-label", t("zelle.raeume", "Räume"));
    R.buehne = w.appendChild(el("div", "zl-buehne"));
    R.versteckKnopf = knopf(t("zelle.versteck", "Verstecken"), "ist-haupt ist-rot zl-versteck-knopf", verstecken);
    R.versteckKnopf.hidden = true;
    w.appendChild(R.versteckKnopf);
    const fuss = el("div", "zl-fuss");
    R.inventar = fuss.appendChild(el("div", "zl-inventar"));
    R.buchKnopf = knopf("", "ist-leise zl-buch", buchZeigen, "buch");
    R.buchKnopf.appendChild(document.createTextNode(t("zelle.buch.titel", "Notizbuch") + " "));
    R.buchZahl = R.buchKnopf.appendChild(el("span", "rs-ziffern", "0"));
    fuss.appendChild(R.buchKnopf);
    w.appendChild(fuss);
    R.meldung = w.appendChild(el("p", "zl-meldung"));
    R.meldung.setAttribute("role", "status");
    R.meldung.setAttribute("aria-live", "polite");
    R.zettel = w.appendChild(el("div", "zl-zettel"));
    R.zettel.hidden = true;
    document.body.appendChild(w);
  }

  function fehlerZeigen(text) {
    const k = el("div", "zl-ende");
    const links = el("div", "zl-ende-text");
    links.appendChild(el("div", "rs-kicker ist-rot", t("zelle.kicker", "Verwahranlage Terra Nova · Zelle C-17")));
    links.appendChild(el("div", "rs-titel", text));
    links.appendChild(knopf(t("zelle.schliessen", "Schließen"), "ist-haupt", weg, "x"));
    k.appendChild(links);
    lauf.ref.buehne.replaceChildren(k);
  }

  function weg() {
    if (!lauf) return;
    clearInterval(lauf.uhrId); clearTimeout(lauf.kontrollUhr); clearInterval(lauf.tropfUhr);
    if (lauf.raumAbbau) lauf.raumAbbau();
    document.removeEventListener("keydown", lauf.esc);
    lauf.ref.wurzel.remove();
    lauf = null;
  }

  async function start(opt) {
    weg();
    opt = opt || {};
    lauf = { opt: opt, id: null, server: null, lokal: null, offenBis: 1, wahl: null, kontrolle: null, fertig: false };
    bauen();
    lauf.esc = function (e) {
      if (e.key !== "Escape") return;
      if (lauf && !lauf.ref.zettel.hidden) lauf.ref.zettel.hidden = true; else weg();
    };
    document.addEventListener("keydown", lauf.esc);
    meldung(t("zelle.laden", "Die Zellentür rastet ein …"));
    const meinLauf = lauf;
    let d;
    try {
      const vorschau = opt.schluessel === "vorschau";
      [d] = await Promise.all([rpc("zelle_start", { p_vorschau: vorschau }), window.fhZelleRaeume ? null : window.fhNachladen("zelleRaeume")]);
    } catch (e) {
      console.warn("Ausbruch: Start fehlgeschlagen", e);
      if (lauf === meinLauf) fehlerZeigen(t("zelle.startFehler", "Die Anlage antwortet nicht. Später nochmal versuchen."));
      return;
    }
    if (lauf !== meinLauf) return;
    if (!d || !d.ok) { fehlerZeigen(t("zelle.keineVerwahrung", "Hier ist gerade keine Verwahrung – nichts, woraus man ausbrechen könnte.")); return; }
    lauf.id = d.lauf;
    lauf.versatz = Date.now() - new Date(d.jetzt).getTime();
    lauf.server = { start: new Date(d.gestartet_am).getTime(), strafe: d.strafe_sek || 0, stufe: d.stufe, raeume: d.raeume || {} };
    lauf.lokal = lokalLaden(lauf.id);
    lauf.offenBis = Math.min(4, Math.max(1, lauf.lokal.offenBis || 1));
    lauf.ref.buchZahl.textContent = String(lauf.lokal.notizen.length);
    inventar();
    uhr();
    lauf.uhrId = setInterval(uhr, 500);
    if (!RUHIG.matches) lauf.tropfUhr = setInterval(function () { if (lauf && !lauf.fertig && Math.random() < 0.35) klang.spiel("tropfen"); }, 4000);
    kontrolleplanen();
    raumZeigen(Math.min(lauf.lokal.raum || 1, lauf.offenBis));
  }

  window.fhZelle = { start: start, weg: weg };
})();
