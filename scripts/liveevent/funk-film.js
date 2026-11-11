/* ======================================================
   LIVE-STORY "FUNKSPRUCH" (Migration 71) - RUNDE TONSPUR
   ---------------------------------------------------
   Eine Sprachaufnahme als Bild fuer alle, hochkant 1080 x 1920 wie
   eine Instagram-Story (alles Wichtige zwischen y 220 und 1540):

   - Mitte (540, 1130): ein rundes Feld (240 px) mit dem Funk-Symbol
     (lucide "radio", ISC). Sein Glow in der Akzentfarbe wird mit der
     Stimme staerker, das Feld atmet mit (Scale 1 + Pegel * 0,06).
   - Aussen: 120 radiale Balken ab Radius 250, links/rechts gespiegelt,
     oben die tiefen Frequenzen, nach unten die hohen. Laenge
     8 + Wert * 150 px; leise grau-blau, laut (Wert > 0,62) in der
     Akzentfarbe. Dahinter ein weicher Ring (Blur 10), dessen
     Deckkraft dem Pegel folgt.
   - Innen (Radius 206): die Huellkurve der GANZEN Aufnahme als 180
     feine Striche im Uhrzeigersinn ab 12 Uhr - gespielt hell, der
     Rest dunkelgrau, ein Punkt in der Akzentfarbe ist der
     Abspielkopf.
   - Der ganze Ring pulsiert mit der Musik (1 + Musikpegel * 0,04)
     und bekommt auf jedem starken Beat einen kurzen Extra-Impuls.
   - Oben (y ~ 430): die gesprochenen Woerter, jedes auf seinem
     Einsatz (Aufschlag 1,3 -> 1 mit Overshoot in 5 Bildern, Blur
     8 -> 0). Dazu der Chip "RUNDE TONSPUR".

   WOHER DIE DATEN KOMMEN
   - Die Aufnahme ist die Story-Musik "funkspruch" (Gateway -> Musik
     je Story). Liegt Musik unter der Stimme, kann der Admin die
     getrennten Spuren (z. B. aus Demucs) zusaetzlich als
     "funkspruch_stimme" und "funkspruch_musik" hochladen - die
     werden nur gelesen, nie abgespielt: das Spektrum folgt dann der
     Stimme, der Puls der Musik. Ohne Spuren gilt die Aufnahme fuer
     beides (Puls aus den Tiefen unter 160 Hz).
   - Jeder Browser liest die Datei selbst (fetch + decodeAudioData)
     und rechnet daraus 30 Spektren je Sekunde (FFT 2048, 64 Baender
     von 50 Hz bis 8 kHz), die Huellkurve und die Beats. Geglaettet
     wird schnell hoch, langsam runter (0,7 / 0,18). Danach ist jedes
     Bild eine Funktion der Zeit T - wer spaeter einsteigt, sieht
     dasselbe wie alle.
   - Die Woerter stehen in siteConfig.funkText (Gateway -> "Funkspruch:
     Woerter"), je Zeile "Sekunde | Wort". Mehrere Woerter auf einer
     Zeile folgen im Abstand von 0,28 s; eine Zeile mit "/" oder eine
     Leerzeile beginnt einen neuen Block. Sonst beginnt ein Block
     nach einem Satzende, nach einem Komma ab 4 Woertern, nach einer
     Pause ueber 1,6 s oder spaetestens nach 8 Woertern.

   "Bewegung reduzieren": kein Puls, kein Atmen, kein Aufschlag - die
   Woerter blenden nur. Die Balken zeigen weiter die Stimme.

   live-storys.js startet den Film in der Story "funkspruch":
     fhFunkFilm.start({ ab: ms, vorschau, dauer?, text?, quellen? })
     fhFunkFilm.ende()   - Story vorbei: kurz ausblenden
     fhFunkFilm.weg()    - abgebrochen: sofort weg
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  const B = 1080, H = 1920;               // Buehne
  const MX = 540, MY = 1130;              // Mittelpunkt des Rings
  const R0 = 250, R_INNEN = 206, R_FELD = 120;
  const BALKEN = 120, STRICHE = 180;
  const LAUT_AB = 0.62;
  const FPS = 30, BAENDER = 64, N = 2048;
  const F_MIN = 50, F_MAX = 8000, F_TIEF = 160;
  const AUFSCHLAG = 5 / FPS;              // 5 Bilder
  const WORT_ABSTAND = 0.28;              // mehrere Woerter auf einer Zeile
  const BLOCK_PAUSE = 1.6, BLOCK_MAX = 8, BLOCK_KOMMA = 4, BLOCK_STEHEN = 2.6;
  const TEXT_MAX = 12000;
  const SCHRIFT_URL = "assets/fonts/funk-fonts.css";
  const NS = "http://www.w3.org/2000/svg";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => a + (b - a) * k;
  /* Aufschlag mit Overshoot: laeuft ueber 1 hinaus und federt zurueck. */
  function easeOutBack(x) { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  /* Zufall mit festem Startwert (Filmkorn, Leerlauf). */
  function zufall(start) {
    let s = (start * 2654435761) >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ------------------------------------------------------
     WOERTER LESEN
  ------------------------------------------------------ */
  function sekunden(s) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,4}(?:[.,]\d+)?)\s*$/.exec(s);
    if (!m) return null;
    const wert = (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(",", "."));
    return isFinite(wert) && wert >= 0 && wert < 3600 ? wert : null;
  }

  function lesen(roh) {
    const woerter = [];
    let bruch = false;
    String(roh || "").slice(0, TEXT_MAX).split(/\r?\n/).forEach(function (z) {
      const zeile = z.trim();
      if (!zeile || zeile === "/") { bruch = true; return; }
      if (zeile.charAt(0) === "#") return;
      const i = zeile.indexOf("|");
      if (i < 0) return;
      const ab = sekunden(zeile.slice(0, i));
      const teile = zeile.slice(i + 1).trim().split(/\s+/).filter(Boolean);
      if (ab == null || !teile.length) return;
      teile.forEach(function (w, k) {
        woerter.push({ t: ab + k * WORT_ABSTAND, w: w, bruch: bruch && k === 0 });
      });
      bruch = false;
    });
    woerter.sort(function (a, b) { return a.t - b.t; });
    const bloecke = [];
    woerter.forEach(function (w, n) {
      const vorher = woerter[n - 1];
      const block = bloecke[bloecke.length - 1];
      const neu = !block || w.bruch || /[.!?…:]$/.test(vorher.w) || w.t - vorher.t > BLOCK_PAUSE || block.woerter.length >= BLOCK_MAX
        || (/[,;–-]$/.test(vorher.w) && block.woerter.length >= BLOCK_KOMMA);
      if (neu) bloecke.push({ von: w.t, bis: 0, woerter: [] });
      bloecke[bloecke.length - 1].woerter.push(n);
      w.block = bloecke.length - 1;
    });
    bloecke.forEach(function (b, n) {
      const letztes = woerter[b.woerter[b.woerter.length - 1]].t;
      const naechster = bloecke[n + 1];
      b.bis = Math.min(naechster ? naechster.von : Infinity, letztes + BLOCK_STEHEN);
    });
    return { woerter: woerter, bloecke: bloecke };
  }

  /* ------------------------------------------------------
     ANALYSE
  ------------------------------------------------------ */
  const FFT = (function () {
    const stufen = Math.log2(N);
    const umkehr = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < stufen; b++) r |= ((i >> b) & 1) << (stufen - 1 - b);
      umkehr[i] = r;
    }
    const cos = new Float32Array(N / 2), sin = new Float32Array(N / 2), fenster = new Float32Array(N);
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / N); sin[i] = Math.sin(-2 * Math.PI * i / N); }
    for (let i = 0; i < N; i++) fenster[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    return { umkehr: umkehr, cos: cos, sin: sin, fenster: fenster };
  })();

  /* Betraege der Frequenzen 0..N/2 eines Ausschnitts um die Mitte c. */
  function betraege(daten, c, re, im, aus) {
    const start = c - N / 2;
    for (let i = 0; i < N; i++) {
      const j = start + i;
      re[FFT.umkehr[i]] = (j >= 0 && j < daten.length ? daten[j] : 0) * FFT.fenster[i];
      im[i] = 0;
    }
    for (let groesse = 2; groesse <= N; groesse <<= 1) {
      const halb = groesse >> 1, schritt = N / groesse;
      for (let i = 0; i < N; i += groesse) {
        for (let k = 0; k < halb; k++) {
          const wr = FFT.cos[k * schritt], wi = FFT.sin[k * schritt];
          const a = i + k, b = a + halb;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= N / 2; k++) aus[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (N / 4);
  }

  function pause() { return new Promise(function (r) { setTimeout(r, 0); }); }

  async function dekodieren(url) {
    const antwort = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!antwort.ok) throw new Error("http-" + antwort.status);
    const puffer = await antwort.arrayBuffer();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) throw new Error("kein-webaudio");
    const ctx = new Ctx(1, 1, 44100);
    const ab = await new Promise(function (ok, nein) {
      const p = ctx.decodeAudioData(puffer, ok, nein);
      if (p && p.then) p.then(ok, nein);
    });
    const daten = new Float32Array(ab.length);
    for (let c = 0; c < ab.numberOfChannels; c++) {
      const kanal = ab.getChannelData(c);
      for (let i = 0; i < kanal.length; i++) daten[i] += kanal[i] / ab.numberOfChannels;
    }
    return { daten: daten, rate: ab.sampleRate, dauer: ab.duration };
  }

  /* 64 Baender in dB (roh) und die Energie unter 160 Hz je Bild. */
  async function spektrum(spur, lauf) {
    const bilder = Math.ceil(spur.dauer * FPS) + 1;
    const db = new Float32Array(bilder * BAENDER), tief = new Float32Array(bilder);
    const re = new Float32Array(N), im = new Float32Array(N), m = new Float32Array(N / 2 + 1);
    const hz = spur.rate / N, kanten = [];
    for (let b = 0; b <= BAENDER; b++) kanten.push(F_MIN * Math.pow(F_MAX / F_MIN, b / BAENDER) / hz);
    const kTief = Math.max(1, Math.round(F_TIEF / hz));
    for (let f = 0; f < bilder; f++) {
      if (f % 90 === 89) { await pause(); if (lauf.tot) return null; }
      betraege(spur.daten, Math.round(f / FPS * spur.rate), re, im, m);
      for (let b = 0; b < BAENDER; b++) {
        const k0 = Math.floor(kanten[b]), k1 = Math.max(k0 + 1, Math.floor(kanten[b + 1]));
        let s = 0;
        for (let k = k0; k < k1; k++) s += m[k];
        /* Leichte Anhebung nach oben: Stimmen haben oben weniger Energie. */
        db[f * BAENDER + b] = 20 * Math.log10(s / (k1 - k0) + 1e-7) + b * 0.3;
      }
      let e = 0;
      for (let k = 1; k <= kTief; k++) e += m[k] * m[k];
      tief[f] = e;
    }
    return { bilder: bilder, db: db, tief: tief };
  }

  function quantil(werte, q) {
    const kopie = Array.prototype.slice.call(werte).filter(isFinite).sort(function (a, b) { return a - b; });
    return kopie.length ? kopie[Math.min(kopie.length - 1, Math.floor(q * kopie.length))] : 0;
  }

  /* dB -> 0..1 (bezogen auf die lauteste Stelle der Aufnahme), dann
     schnell hoch, langsam runter. Pegel = Mittel der Baender. */
  function baenderGlaetten(sp) {
    const oben = quantil(sp.db, 0.995), unten = oben - 46;
    const v = new Float32Array(sp.db.length), pegel = new Float32Array(sp.bilder);
    const stand = new Float32Array(BAENDER);
    for (let f = 0; f < sp.bilder; f++) {
      let summe = 0;
      for (let b = 0; b < BAENDER; b++) {
        const neu = Math.pow(clamp((sp.db[f * BAENDER + b] - unten) / 46, 0, 1), 1.6);
        stand[b] += (neu - stand[b]) * (neu > stand[b] ? 0.7 : 0.18);
        v[f * BAENDER + b] = stand[b];
        summe += stand[b];
      }
      pegel[f] = summe / BAENDER;
    }
    /* Pegel auf 0..1 strecken, damit Glow und Atmen auch bei leiser
       Aufnahme sichtbar werden. */
    const max = Math.max(0.05, quantil(pegel, 0.98));
    for (let f = 0; f < sp.bilder; f++) pegel[f] = clamp(pegel[f] / max, 0, 1);
    return { v: v, pegel: pegel };
  }

  /* Musikpegel aus der Energie unter 160 Hz, geglaettet wie oben. */
  function tiefenPegel(sp) {
    const db = Array.prototype.map.call(sp.tief, function (e) { return 10 * Math.log10(e + 1e-12); });
    const oben = quantil(db, 0.99), aus = new Float32Array(sp.bilder);
    let stand = 0;
    for (let f = 0; f < sp.bilder; f++) {
      const neu = clamp((db[f] - (oben - 30)) / 30, 0, 1);
      stand += (neu - stand) * (neu > stand ? 0.7 : 0.18);
      aus[f] = stand;
    }
    return aus;
  }

  /* Starke Beats: Anstieg der tiefen Energie deutlich ueber dem
     Durchschnitt drumherum, ein lokales Maximum, mindestens 0,3 s
     Abstand. Rueckgabe: [Zeit, Staerke 0..1, ...]. */
  function beats(sp) {
    const e = sp.tief, n = sp.bilder, o = new Float32Array(n);
    for (let f = 1; f < n; f++) o[f] = Math.max(0, Math.sqrt(e[f]) - Math.sqrt(e[f - 1]));
    const maxO = Math.max(1e-9, quantil(o, 0.995)), boden = quantil(Array.prototype.map.call(e, Math.sqrt), 0.6);
    const liste = [];
    let letzter = -99;
    for (let f = 2; f < n - 2; f++) {
      let s = 0, k = 0;
      for (let j = Math.max(0, f - 20); j < Math.min(n, f + 21); j++) { s += o[j]; k++; }
      const schwelle = (s / k) * 1.8 + maxO * 0.08;
      const spitze = o[f] >= o[f - 1] && o[f] >= o[f + 1] && o[f] >= o[f - 2] && o[f] >= o[f + 2];
      const staerke = clamp(o[f] / (maxO * 0.7), 0, 1);
      if (o[f] > schwelle && spitze && Math.sqrt(e[f]) > boden && staerke >= 0.45 && f - letzter >= 9) {
        liste.push(f / FPS, staerke);
        letzter = f;
      }
    }
    return new Float32Array(liste);
  }

  function huellkurve(spur) {
    const aus = new Float32Array(STRICHE), d = spur.daten, len = d.length / STRICHE;
    let max = 1e-9;
    for (let k = 0; k < STRICHE; k++) {
      let s = 0, n = 0;
      for (let i = Math.floor(k * len); i < Math.floor((k + 1) * len); i += 4) { s += d[i] * d[i]; n++; }
      aus[k] = Math.sqrt(s / Math.max(1, n));
      max = Math.max(max, aus[k]);
    }
    for (let k = 0; k < STRICHE; k++) aus[k] = Math.pow(aus[k] / max, 0.75);
    return aus;
  }

  async function analysieren(quellen, lauf) {
    const haupt = await dekodieren(quellen.haupt);
    if (lauf.tot) return null;
    const stimme = quellen.stimme ? await dekodieren(quellen.stimme).catch(function () { return null; }) : null;
    const musik = quellen.musik ? await dekodieren(quellen.musik).catch(function () { return null; }) : null;
    if (lauf.tot) return null;
    const sprache = stimme || haupt;
    const spS = await spektrum(sprache, lauf);
    if (!spS) return null;
    const spM = musik ? await spektrum(musik, lauf) : spS;
    if (!spM) return null;
    const g = baenderGlaetten(spS);
    return {
      dauer: haupt.dauer, bilder: spS.bilder, v: g.v, pegel: g.pegel,
      musik: musik ? baenderGlaetten(spM).pegel : tiefenPegel(spM),
      musikBilder: spM.bilder, beats: beats(spM), huelle: huellkurve(sprache),
    };
  }

  /* ------------------------------------------------------
     WERTE ZUR ZEIT T (zwischen zwei Bildern gemischt)
  ------------------------------------------------------ */
  function reihe(arr, bilder, T) {
    const x = clamp(T * FPS, 0, bilder - 1), f = Math.floor(x), k = x - f;
    return mix(arr[f], arr[Math.min(bilder - 1, f + 1)], k);
  }
  function band(a, b, T) {
    const x = clamp(T * FPS, 0, a.bilder - 1), f = Math.floor(x), k = x - f, g = Math.min(a.bilder - 1, f + 1);
    return mix(a.v[f * BAENDER + b], a.v[g * BAENDER + b], k);
  }
  function beatImpuls(a, T) {
    let s = 0;
    for (let i = 0; i < a.beats.length; i += 2) {
      const d = T - a.beats[i];
      if (d < 0) break;
      if (d < 0.35) s = Math.max(s, a.beats[i + 1] * Math.exp(-d / 0.09));
    }
    return s;
  }

  /* ------------------------------------------------------
     FARBEN (Tokens --fh-funk-*)
  ------------------------------------------------------ */
  function farben() {
    const st = getComputedStyle(document.documentElement);
    const f = function (n, ersatz) { return (st.getPropertyValue(n) || "").trim() || ersatz; };
    return {
      akzent: f("--fh-funk-akzent", "#ff3b30"), leise: f("--fh-funk-leise", "#8a93a8"),
      text: f("--fh-funk-text", "#f2efea"), dunkel: f("--fh-funk-dunkel", "#2a2f3a"),
      flaeche: f("--fh-funk-flaeche", "#0e1016"),
    };
  }

  /* ------------------------------------------------------
     AUFBAU
  ------------------------------------------------------ */
  function el(tag, klasse) { const e = document.createElement(tag); if (klasse) e.className = klasse; return e; }
  function sv(tag, attr) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attr || {}).forEach(function (k) { e.setAttribute(k, attr[k]); });
    return e;
  }

  function schriftenLaden() {
    if (document.querySelector('link[data-fh-funk-schrift]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = SCHRIFT_URL;
    l.setAttribute("data-fh-funk-schrift", "");
    document.head.appendChild(l);
  }

  /* Filmkorn: eine Kachel mit festem Zufall, die je Bild springt. */
  function kornKachel() {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const x = c.getContext("2d"), bild = x.createImageData(160, 160), r = zufall(71);
    for (let i = 0; i < bild.data.length; i += 4) {
      const g = 110 + r() * 145 | 0;
      bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = g;
      bild.data[i + 3] = r() * 255 | 0;
    }
    x.putImageData(bild, 0, 0);
    try { return c.toDataURL("image/png"); } catch (e) { return ""; }
  }

  /* lucide "radio" (ISC) - das Funk-Symbol in der Mitte. */
  function funkSymbol(farbe) {
    const g = sv("g", { transform: "translate(-60 -60) scale(5)", fill: "none", stroke: farbe, "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" });
    ["M4.9 19.1C1 15.2 1 8.8 4.9 4.9", "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5", "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5", "M19.1 4.9C23 8.8 23 15.1 19.1 19"].forEach(function (d) { g.appendChild(sv("path", { d: d })); });
    g.appendChild(sv("circle", { cx: "12", cy: "12", r: "2" }));
    return g;
  }

  function ringBauen(l) {
    const F = l.farben;
    const svg = sv("svg", { class: "fh-funk-svg", viewBox: "0 0 " + B + " " + H, width: String(B), height: String(H), "aria-hidden": "true" });
    const defs = sv("defs");
    const weich = sv("filter", { id: "fh-funk-weich", x: "-50%", y: "-50%", width: "200%", height: "200%" });
    weich.appendChild(sv("feGaussianBlur", { stdDeviation: "10" }));
    const glow = sv("filter", { id: "fh-funk-glow", x: "-100%", y: "-100%", width: "300%", height: "300%" });
    glow.appendChild(sv("feGaussianBlur", { stdDeviation: "26" }));
    defs.append(weich, glow);
    svg.appendChild(defs);

    const ring = sv("g", { transform: "translate(" + MX + " " + MY + ")" });
    const weichRing = sv("circle", { r: String(R0 + 4), fill: "none", stroke: F.akzent, "stroke-width": "18", filter: "url(#fh-funk-weich)", opacity: "0" });
    ring.appendChild(weichRing);

    const balken = [];
    const gB = sv("g", { "stroke-width": "8", "stroke-linecap": "round" });
    for (let i = 0; i < BALKEN; i++) {
      /* 0..59 rechts von 12 nach 6 Uhr, 60..119 links gespiegelt. */
      const j = i % (BALKEN / 2), seite = i < BALKEN / 2 ? 1 : -1;
      const w = (j + 0.5) / (BALKEN / 2) * Math.PI;
      const linie = sv("line", { stroke: F.leise });
      gB.appendChild(linie);
      balken.push({ el: linie, sx: Math.sin(w) * seite, sy: -Math.cos(w), band: j / (BALKEN / 2 - 1) * (BAENDER - 1), laut: false });
    }
    ring.appendChild(gB);

    const striche = [];
    const gS = sv("g", { "stroke-width": "2.2", "stroke-linecap": "round" });
    for (let k = 0; k < STRICHE; k++) {
      const w = (k + 0.5) / STRICHE * Math.PI * 2;
      const linie = sv("line", { stroke: F.dunkel });
      gS.appendChild(linie);
      striche.push({ el: linie, sx: Math.sin(w), sy: -Math.cos(w), hell: false });
    }
    ring.appendChild(gS);
    const kopfGlow = sv("circle", { r: "16", fill: F.akzent, filter: "url(#fh-funk-weich)", opacity: ".7" });
    const kopf = sv("circle", { r: "8", fill: F.akzent });
    ring.append(kopfGlow, kopf);
    svg.appendChild(ring);

    const mitte = sv("g", { transform: "translate(" + MX + " " + MY + ")" });
    const mitteGlow = sv("circle", { r: String(R_FELD + 24), fill: F.akzent, filter: "url(#fh-funk-glow)", opacity: ".2" });
    const feld = sv("circle", { r: String(R_FELD), fill: F.flaeche, stroke: F.akzent, "stroke-opacity": ".45", "stroke-width": "2" });
    const symbol = funkSymbol(F.text);
    mitte.append(mitteGlow, feld, symbol);
    svg.appendChild(mitte);

    Object.assign(l, { svg: svg, ring: ring, weichRing: weichRing, balken: balken, striche: striche, kopf: kopf, kopfGlow: kopfGlow, mitte: mitte, mitteGlow: mitteGlow });
    return svg;
  }

  /* ------------------------------------------------------
     ZEICHNEN
  ------------------------------------------------------ */
  function leerlauf(l, b, T) {
    /* Ohne Analyse (noch nicht gelesen oder keine Datei): ein leises
       Atmen mit festem Zufall, damit der Ring nicht tot aussieht. */
    return 0.05 + 0.04 * Math.sin(T * 1.3 + b * 0.37) * Math.sin(T * 0.7 + b * 0.11);
  }

  function ringZeichnen(l, T) {
    const a = l.analyse, F = l.farben, ruhig = RUHIG.matches;
    const pegel = a ? reihe(a.pegel, a.bilder, T) : 0.05;
    const musik = a ? reihe(a.musik, a.musikBilder, T) : 0;
    const impuls = a && !ruhig ? beatImpuls(a, T) : 0;
    const s = ruhig ? 1 : 1 + musik * 0.04 + impuls * 0.035;
    l.ring.setAttribute("transform", "translate(" + MX + " " + MY + ") scale(" + s.toFixed(4) + ")");
    l.weichRing.setAttribute("opacity", clamp(0.1 + pegel * 0.85, 0, 1).toFixed(3));

    l.balken.forEach(function (bk) {
      let v;
      if (a) {
        const b0 = Math.floor(bk.band), k = bk.band - b0;
        v = mix(band(a, b0, T), band(a, Math.min(BAENDER - 1, b0 + 1), T), k);
      } else v = leerlauf(l, bk.band, T);
      const len = 8 + clamp(v, 0, 1) * 150;
      bk.el.setAttribute("x1", (bk.sx * R0).toFixed(1));
      bk.el.setAttribute("y1", (bk.sy * R0).toFixed(1));
      bk.el.setAttribute("x2", (bk.sx * (R0 + len)).toFixed(1));
      bk.el.setAttribute("y2", (bk.sy * (R0 + len)).toFixed(1));
      const laut = v > LAUT_AB;
      if (laut !== bk.laut) { bk.laut = laut; bk.el.setAttribute("stroke", laut ? F.akzent : F.leise); }
    });

    const dauer = l.dauer(), p = clamp(T / Math.max(0.1, dauer), 0, 1);
    l.striche.forEach(function (st, k) {
      const e = a ? a.huelle[k] : 0.08;
      const h = 3 + e * 32;
      if (!st.gesetzt || st.e !== e) {
        st.e = e; st.gesetzt = true;
        st.el.setAttribute("x1", (st.sx * (R_INNEN - h / 2)).toFixed(1));
        st.el.setAttribute("y1", (st.sy * (R_INNEN - h / 2)).toFixed(1));
        st.el.setAttribute("x2", (st.sx * (R_INNEN + h / 2)).toFixed(1));
        st.el.setAttribute("y2", (st.sy * (R_INNEN + h / 2)).toFixed(1));
      }
      const hell = (k + 0.5) / STRICHE <= p;
      if (hell !== st.hell) { st.hell = hell; st.el.setAttribute("stroke", hell ? F.text : F.dunkel); }
    });
    const w = p * Math.PI * 2, kx = (Math.sin(w) * R_INNEN).toFixed(1), ky = (-Math.cos(w) * R_INNEN).toFixed(1);
    l.kopf.setAttribute("cx", kx); l.kopf.setAttribute("cy", ky);
    l.kopfGlow.setAttribute("cx", kx); l.kopfGlow.setAttribute("cy", ky);

    const atmen = ruhig ? 1 : 1 + pegel * 0.06;
    l.mitte.setAttribute("transform", "translate(" + MX + " " + MY + ") scale(" + atmen.toFixed(4) + ")");
    l.mitteGlow.setAttribute("opacity", clamp(0.12 + pegel * 0.88, 0, 1).toFixed(3));
    l.chipPunkt.style.opacity = (0.35 + pegel * 0.65).toFixed(3);
  }

  function woerterZeichnen(l, T) {
    const w = l.text;
    let n = -1;
    for (let i = w.bloecke.length - 1; i >= 0; i--) if (T >= w.bloecke[i].von) { n = i; break; }
    const b = n >= 0 ? w.bloecke[n] : null;
    const sichtbar = b && T < b.bis + 0.35;
    if (n !== l.blockNr) {
      l.woerterEl.textContent = "";
      l.spans = [];
      if (b) {
        b.woerter.forEach(function (i) {
          const s = el("span", "fh-funk-wort");
          s.textContent = w.woerter[i].w;
          l.woerterEl.appendChild(s);
          l.spans.push({ el: s, t: w.woerter[i].t });
        });
        l.vorlesen.textContent = b.woerter.map(function (i) { return w.woerter[i].w; }).join(" ");
      }
      l.blockNr = n;
    }
    if (!b) return;
    const raus = sichtbar ? clamp((T - b.bis) / 0.35, 0, 1) : 1;
    l.woerterEl.style.opacity = (1 - raus).toFixed(3);
    const ruhig = RUHIG.matches;
    l.spans.forEach(function (s) {
      const p = (T - s.t) / AUFSCHLAG;
      const st = s.el.style;
      if (p < 0) { st.opacity = "0"; return; }
      if (ruhig) { st.opacity = clamp(p / 2, 0, 1).toFixed(3); st.transform = ""; st.filter = ""; return; }
      const k = clamp(p, 0, 1);
      st.opacity = clamp(p * 2.5, 0, 1).toFixed(3);
      st.transform = k < 1 ? "scale(" + (1.3 - 0.3 * easeOutBack(k)).toFixed(4) + ")" : "";
      st.filter = k < 1 ? "blur(" + (8 * (1 - k)).toFixed(2) + "px)" : "";
    });
  }

  function zeitText(s) {
    s = Math.max(0, Math.floor(s));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function bild(jetzt) {
    if (!lauf) return;
    lauf.uhr = requestAnimationFrame(bild);
    if (jetzt - lauf.letzt < 15) return;      // hoechstens ~60 Bilder/s
    lauf.letzt = jetzt;
    const T = Math.max(0, lauf.zeitQuelle ? lauf.zeitQuelle() : (jetzt - lauf.t0) / 1000 + lauf.ab);
    lauf.T = T;
    ringZeichnen(lauf, T);
    woerterZeichnen(lauf, T);
    lauf.zeitEl.textContent = zeitText(Math.min(T, lauf.dauer())) + " / " + zeitText(lauf.dauer());
    /* Filmkorn springt 15-mal je Sekunde an eine feste Stelle. */
    const k = Math.floor(T * 15);
    if (k !== lauf.kornK && !RUHIG.matches) {
      lauf.kornK = k;
      const r = zufall(k + 1);
      lauf.korn.style.backgroundPosition = (r() * 160 | 0) + "px " + (r() * 160 | 0) + "px";
    }
  }

  /* ------------------------------------------------------
     ABLAUF
  ------------------------------------------------------ */
  let lauf = null;

  function einpassen() {
    if (!lauf) return;
    const s = Math.min(window.innerWidth / B, window.innerHeight / H);
    lauf.buehne.style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  function vollbild(an) {
    window.fhVollbildAn = an;
    document.dispatchEvent(new CustomEvent("fh:vollbild", { detail: { an: an } }));
  }

  function konfig() { return typeof siteConfig !== "undefined" && siteConfig ? siteConfig : {}; }

  /* Story-Musik "funkspruch" und die beiden Analyse-Spuren. */
  function quellenAusStory() {
    const ls = window.fhLiveStorys;
    const url = function (id) { return ls && ls.musikUrl ? ls.musikUrl(id) : null; };
    return { haupt: url("funkspruch"), stimme: url("funkspruch_stimme"), musik: url("funkspruch_musik") };
  }

  function statusSetzen(l, text) { l.statusEl.textContent = text || ""; l.statusEl.hidden = !text; }

  function start(opts) {
    weg();
    opts = opts || {};
    schriftenLaden();
    const wurzel = el("div", "fh-riss fh-funk");
    wurzel.id = "fh-funk";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("funk.aria", "Live-Story: Funkspruch"));
    const raster = el("div", "fh-funk-raster"), vignette = el("div", "fh-funk-vignette"), korn = el("div", "fh-funk-korn");
    const kachel = kornKachel();
    if (kachel) korn.style.backgroundImage = "url(" + kachel + ")";
    const buehne = el("div", "fh-funk-buehne");
    buehne.setAttribute("aria-hidden", "true");
    const chip = el("div", "fh-funk-chip");
    const chipPunkt = el("i", "fh-funk-chip-punkt");
    const chipText = el("span");
    chipText.textContent = t("funk.chip", "Runde Tonspur");
    const zeitEl = el("span", "fh-funk-zeit");
    chip.append(chipPunkt, chipText, zeitEl);
    const woerterEl = el("div", "fh-funk-woerter");
    const statusEl = el("p", "fh-funk-status");
    const vorlesen = el("p", "fh-lied-vorlesen");
    vorlesen.setAttribute("aria-live", "polite");
    const knopf = el("button", "fh-riss-weiter");
    knopf.type = "button";
    knopf.textContent = t("riss.skip", "Überspringen");
    knopf.addEventListener("click", weg);

    const text = lesen(opts.text != null ? opts.text : konfig().funkText);
    lauf = {
      wurzel: wurzel, buehne: buehne, korn: korn, chipPunkt: chipPunkt, zeitEl: zeitEl, woerterEl: woerterEl,
      statusEl: statusEl, vorlesen: vorlesen, farben: farben(), text: text, analyse: null,
      t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), zeitQuelle: typeof opts.uhr === "function" ? opts.uhr : null,
      uhr: 0, letzt: 0, T: 0, blockNr: -2, spans: [], kornK: -1, tot: false,
    };
    const l = lauf;
    const dauerVorgabe = Number(opts.dauer) > 0 ? Number(opts.dauer) : Number(konfig().funkDauer) > 0 ? Number(konfig().funkDauer) : 0;
    l.dauer = function () { return l.analyse ? l.analyse.dauer : dauerVorgabe || 60; };
    buehne.append(ringBauen(l), chip, woerterEl, statusEl);
    wurzel.append(raster, vignette, buehne, korn, vorlesen, knopf);
    document.body.appendChild(wurzel);
    einpassen();
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    l.uhr = requestAnimationFrame(bild);
    vollbild(true);

    const quellen = opts.quellen || quellenAusStory();
    if (!quellen.haupt) {
      statusSetzen(l, opts.vorschau ? t("funk.keineDatei", "Keine Aufnahme hochgeladen – Gateway → Musik je Story → Funkspruch") : "");
      return;
    }
    statusSetzen(l, t("funk.laden", "Tonspur wird gelesen …"));
    analysieren(quellen, l).then(function (a) {
      if (l.tot || !a) return;
      l.analyse = a;
      l.striche.forEach(function (st) { st.gesetzt = false; });
      statusSetzen(l, "");
    }).catch(function (e) {
      if (l.tot) return;
      console.warn("Funkspruch: Aufnahme nicht lesbar", e);
      statusSetzen(l, opts.vorschau ? t("funk.fehler", "Aufnahme ließ sich nicht lesen") : "");
    });
  }

  /* Story vorbei: kurz ausblenden. */
  function ende() {
    if (!lauf) return;
    const l = lauf;
    l.wurzel.classList.add("ist-aus");
    setTimeout(function () { if (lauf === l) weg(); }, 1200);
  }

  function weg() {
    if (!lauf) return;
    lauf.tot = true;
    cancelAnimationFrame(lauf.uhr);
    window.removeEventListener("resize", einpassen);
    document.removeEventListener("keydown", taste);
    lauf.wurzel.remove();
    lauf = null;
    vollbild(false);
  }

  window.fhFunkFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    /* Fuer das Gateway (Pruefen vor dem Speichern) und fuer Tests. */
    lesen: lesen,
    zeit: function () { return lauf ? lauf.T : null; },
    analyse: function () { return lauf ? lauf.analyse : null; },
  };
})();
