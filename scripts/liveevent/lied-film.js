/* ======================================================
   LIVE-STORY "LIEBESLIED" (Migration 70)
   ---------------------------------------------------
   Ein Lyric-Video als Story fuer alle, nach dem Vorbild, das der
   Admin als Video geschickt hat: Weltraum in tiefem Indigo, langsam
   drehende Lichtstrahlen, Sterne und Bokeh, duenne Ringe, ein
   leuchtender Orb, ein Lichtschein am Horizont - und der Liedtext,
   der sich Wort fuer Wort aufbaut und am Zeilenende in 3D wegkippt.
   77,4 s, fuenf Teile:

     Intro 0 s · Strophe 15 · Refrain 26,5 · Bruecke 49 · Outro 59,5

   DER LIEDTEXT STEHT NICHT IM CODE
   Er kommt aus siteConfig.liedText, den der Admin im Gateway
   eintraegt (Live-Event -> Story-Texte). Eine Zeile je Liedzeile:

     # strophe              Stil ab hier: intro, strophe, refrain,
                            bruecke, outro
     15.0 | Text / zweite Zeile mit *Betonung*
       ^ Sekunde ab Storybeginn ("1:02.5" geht auch)
       "/" bricht um, *Wort* wird groesser und leuchtet.

   Leere Texte und alles andere werden uebersprungen. Ohne Text
   laeuft nur das Bild (mit einer Note in der Mitte).

   WIE ES GEBAUT IST
   - Jedes Bild ist eine Funktion der Zeit T (wer spaeter dazukommt,
     steigt mit "ab" an der richtigen Stelle ein). Hintergrund auf
     einem Canvas in halber Aufloesung, der Text als DOM darueber -
     so bleibt die Schrift scharf und kippt per CSS-3D.
   - Buehne 1920 x 1080 wie beim Riss (.fh-riss), eingepasst,
     hoechstens 30 Bilder pro Sekunde.
   - Bei "Bewegung reduzieren": keine Strahlen-Drehung, kein Kippen,
     kein Vollbild-Blitz (Lichtempfindlichkeit), Woerter blenden nur.

   live-storys.js startet den Film in der Story "liebeslied":
     fhLiedFilm.start({ ab: ms, vorschau })
     fhLiedFilm.ende()   - Story vorbei: kurz ausblenden
     fhLiedFilm.weg()    - abgebrochen: sofort weg
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  const DAUER = 77.4;
  const STILE = ["intro", "strophe", "refrain", "bruecke", "outro"];
  /* Ohne "#"-Marke gilt der Teil des Liedes, in dem die Zeile beginnt. */
  const TEILE = [[0, "intro"], [15, "strophe"], [26.5, "refrain"], [49, "bruecke"], [59.5, "outro"]];
  const TEXT_MAX = 8000;

  /* Feste Momente im Bild (Sekunden), dem Vorbild abgeschaut. */
  const RINGE = [8.5, 17, 26.5, 31, 33, 41.6, 49, 53.5, 61.5, 66];
  const ORBS = [16.5, 21, 26, 59.6, 70.5];
  const HORIZONT = [10, 56, 63.5, 70.5];
  const BLITZ = 41.2;
  const SCHNITTE = [[14.4, 15.0], [26.38, 26.6], [59.3, 59.7]];

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  /* ------------------------------------------------------
     LIEDTEXT LESEN
  ------------------------------------------------------ */
  function sekunden(s) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}(?:[.,]\d+)?)\s*$/.exec(s);
    if (!m) return null;
    const wert = (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(",", "."));
    return isFinite(wert) && wert >= 0 && wert < DAUER ? wert : null;
  }

  function teilBei(sek) {
    let stil = TEILE[0][1];
    TEILE.forEach(function (x) { if (sek >= x[0]) stil = x[1]; });
    return stil;
  }

  /* "Text / weiter mit *Betonung*" -> [[{w, betont}], [...]] je Bildschirmzeile. */
  function woerter(text) {
    return text.split("/").map(function (teil) {
      return teil.trim().split(/\s+/).filter(Boolean).map(function (w) {
        const betont = /^\*.+\*$/.test(w) || /^\*[^*]+\*[,.!?…]+$/.test(w);
        return { w: w.replace(/\*/g, ""), betont: betont };
      }).filter(function (x) { return x.w; });
    }).filter(function (z) { return z.length; });
  }

  function lesen(roh) {
    const zeilen = [];
    let stil = null;
    String(roh || "").slice(0, TEXT_MAX).split(/\r?\n/).forEach(function (z) {
      const marke = /^\s*#\s*([a-zäöü]+)\s*$/i.exec(z);
      if (marke) {
        const name = marke[1].toLowerCase().replace("ü", "ue");
        stil = STILE.indexOf(name) >= 0 ? name : null;
        return;
      }
      const i = z.indexOf("|");
      if (i < 0) return;
      const ab = sekunden(z.slice(0, i));
      const rest = woerter(z.slice(i + 1));
      if (ab == null || !rest.length) return;
      zeilen.push({ ab: ab, stil: stil || teilBei(ab), reihen: rest });
    });
    zeilen.sort(function (a, b) { return a.ab - b.ab; });
    zeilen.forEach(function (z, n) {
      z.bis = n + 1 < zeilen.length ? zeilen[n + 1].ab : DAUER;
      z.anzahl = z.reihen.reduce(function (s, r) { return s + r.length; }, 0);
      /* Wort fuer Wort: in gut der Haelfte der Zeit steht alles da. */
      z.schritt = Math.min(0.42, Math.max(0.12, ((z.bis - z.ab) * 0.55) / Math.max(1, z.anzahl)));
    });
    return zeilen;
  }

  /* ------------------------------------------------------
     ZUFALL MIT FESTEM STARTWERT (jeder sieht dieselben Sterne)
  ------------------------------------------------------ */
  function zufall(start) {
    let s = start >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function farben() {
    const st = getComputedStyle(document.documentElement);
    const f = function (name, ersatz) { return (st.getPropertyValue(name) || "").trim() || ersatz; };
    return {
      nacht: f("--fh-lied-nacht", "#08061f"),
      indigo: f("--fh-lied-indigo", "#1d1658"),
      lila: f("--fh-lied-lila", "#a99cf0"),
      tief: f("--fh-lied-lila-tief", "#5d50b8"),
      licht: f("--fh-lied-licht", "#f4f1ff"),
    };
  }

  /* "#a99cf0" + Deckkraft -> rgba() fuer den Canvas. */
  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return "rgba(255,255,255," + a + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ------------------------------------------------------
     HINTERGRUND (Canvas 960 x 540, auf 1920 x 1080 gestreckt)
  ------------------------------------------------------ */
  const B = 960, H = 540;

  function welt() {
    const r = zufall(70);
    const sterne = [];
    for (let i = 0; i < 170; i++) sterne.push({ x: r() * B, y: r() * H, g: 0.4 + r() * 1.3, p: r() * 6.28, v: 0.6 + r() * 1.6 });
    const bokeh = [];
    for (let i = 0; i < 26; i++) bokeh.push({ x: r() * B, y: r() * H, g: 10 + r() * 46, p: r() * 6.28, v: 4 + r() * 12, a: 0.04 + r() * 0.1 });
    return { sterne: sterne, bokeh: bokeh };
  }

  /* 0..1..0 um einen Zeitpunkt herum: kurz rein, laenger raus. */
  function puls(T, bei, rein, raus) {
    if (T < bei - rein || T > bei + raus) return 0;
    return T < bei ? easeOut((T - (bei - rein)) / rein) : 1 - easeInOut((T - bei) / raus);
  }

  function malen(l, T) {
    const c = l.ctx, F = l.farben, ruhig = RUHIG.matches;
    const stil = l.stilJetzt;

    /* Grund: Indigo, in der Mitte heller. */
    const g = c.createRadialGradient(B / 2, H * 0.52, 20, B / 2, H / 2, B * 0.7);
    g.addColorStop(0, F.indigo);
    g.addColorStop(1, F.nacht);
    c.fillStyle = g;
    c.fillRect(0, 0, B, H);

    /* Lichtstrahlen aus der Mitte, langsam drehend. */
    const dreh = ruhig ? 0 : T * 0.035;
    const staerke = stil === "refrain" ? 0.07 : stil === "strophe" ? 0.035 : 0.05;
    c.save();
    c.translate(B / 2, H / 2);
    for (let i = 0; i < 14; i++) {
      const w = dreh + (i / 14) * Math.PI * 2;
      c.fillStyle = rgba(F.lila, staerke * (0.5 + 0.5 * Math.sin(i * 1.7 + T * 0.3)));
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, B, w, w + 0.07);
      c.closePath();
      c.fill();
    }
    c.restore();

    /* Sterne. */
    l.welt.sterne.forEach(function (s) {
      const a = ruhig ? 0.55 : 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(T * s.v + s.p));
      c.fillStyle = rgba(F.licht, a);
      c.fillRect(s.x, s.y, s.g, s.g);
    });

    /* Bokeh, im Refrain kraeftiger. */
    const bf = stil === "refrain" ? 1.8 : stil === "bruecke" ? 1.2 : 1;
    l.welt.bokeh.forEach(function (k) {
      const y = ruhig ? k.y : (k.y - T * k.v + H * 4) % (H + 120) - 60;
      const x = k.x + (ruhig ? 0 : Math.sin(T * 0.2 + k.p) * 14);
      c.fillStyle = rgba(F.lila, k.a * bf);
      c.beginPath();
      c.arc(x, y, k.g, 0, Math.PI * 2);
      c.fill();
    });

    /* Strophe: dunkle, schraege Streifen hinter dem Text. */
    if (stil === "strophe") {
      const a = clamp((T - 15) / 0.6, 0, 1) * clamp((26.5 - T) / 0.4, 0, 1);
      c.save();
      c.globalAlpha = 0.55 * a;
      c.fillStyle = F.nacht;
      for (let i = -2; i < 9; i++) {
        const x = i * 150 + (ruhig ? 0 : (T * 12) % 150);
        c.beginPath();
        c.moveTo(x, 0); c.lineTo(x + 70, 0); c.lineTo(x - 90, H); c.lineTo(x - 160, H);
        c.closePath();
        c.fill();
      }
      c.restore();
    }

    /* Lichtschein am Horizont. */
    HORIZONT.forEach(function (bei) {
      const a = puls(T, bei, 0.8, 2.2);
      if (!a) return;
      const h = c.createLinearGradient(0, H, 0, H * 0.45);
      h.addColorStop(0, rgba(F.lila, 0.55 * a));
      h.addColorStop(1, rgba(F.lila, 0));
      c.fillStyle = h;
      c.fillRect(0, H * 0.45, B, H * 0.55);
    });

    /* Ringe: wachsen aus der Mitte und verblassen. */
    RINGE.forEach(function (bei) {
      if (T < bei || T > bei + 3) return;
      const p = (T - bei) / 3;
      c.strokeStyle = rgba(F.licht, 0.4 * (1 - p));
      c.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(B / 2, H / 2, 40 + easeOut(p) * (220 + k * 70), 0, Math.PI * 2);
        c.stroke();
      }
    });

    /* Der Orb. */
    ORBS.forEach(function (bei) {
      const a = puls(T, bei, 0.5, 1.4);
      if (!a) return;
      const r = 26 + 34 * a;
      const o = c.createRadialGradient(B / 2, H / 2, 0, B / 2, H / 2, r * 3);
      o.addColorStop(0, rgba(F.licht, 0.95 * a));
      o.addColorStop(0.25, rgba(F.licht, 0.6 * a));
      o.addColorStop(1, rgba(F.lila, 0));
      c.fillStyle = o;
      c.beginPath();
      c.arc(B / 2, H / 2, r * 3, 0, Math.PI * 2);
      c.fill();
    });

    /* Blitz in Lila (bei "Bewegung reduzieren" kaum spuerbar). */
    const blitz = puls(T, BLITZ, 0.08, 0.5) * (ruhig ? 0.15 : 0.85);
    if (blitz) { c.fillStyle = rgba(F.lila, blitz); c.fillRect(0, 0, B, H); }

    /* Harte Schnitte ins Dunkle. */
    SCHNITTE.forEach(function (s) {
      if (T < s[0] || T > s[1]) return;
      const m = (s[0] + s[1]) / 2;
      c.fillStyle = rgba(F.nacht, T < m ? (T - s[0]) / (m - s[0]) : 1 - (T - m) / (s[1] - m));
      c.fillRect(0, 0, B, H);
    });
  }

  /* ------------------------------------------------------
     TEXT
  ------------------------------------------------------ */
  function zeileBauen(z) {
    const el = document.createElement("div");
    el.className = "fh-lied-zeile ist-" + z.stil;
    const ws = [];
    z.reihen.forEach(function (reihe) {
      const r = document.createElement("div");
      r.className = "fh-lied-reihe";
      reihe.forEach(function (w) {
        const s = document.createElement("span");
        s.className = "fh-lied-wort" + (w.betont ? " ist-betont" : "");
        s.textContent = w.w;
        r.appendChild(s);
        ws.push(s);
      });
      el.appendChild(r);
    });
    return { el: el, woerter: ws };
  }

  function aktiveZeile(zeilen, T) {
    for (let i = zeilen.length - 1; i >= 0; i--) if (T >= zeilen[i].ab) return i;
    return -1;
  }

  function textZeichnen(l, T) {
    const n = aktiveZeile(l.zeilen, T);
    if (n !== l.zeileNr) {
      if (l.zeileEl) l.zeileEl.el.remove();
      l.zeileEl = n >= 0 ? zeileBauen(l.zeilen[n]) : null;
      if (l.zeileEl) l.textEbene.appendChild(l.zeileEl.el);
      l.zeileNr = n;
    }
    l.note.style.opacity = l.zeilen.length ? "0" : String(0.35 + 0.25 * Math.sin(T * 1.6));
    if (!l.zeileEl) return;

    const z = l.zeilen[n], ruhig = RUHIG.matches;
    const raus = z.bis >= DAUER ? 0 : clamp((T - (z.bis - 0.45)) / 0.45, 0, 1);
    const ein = clamp((T - z.ab) / 0.5, 0, 1);
    /* Das Ganze waechst langsam (Intro/Outro), am Ende kippt es weg. */
    const wachsen = z.stil === "intro" || z.stil === "outro" ? 0.9 + 0.1 * clamp((T - z.ab) / (z.bis - z.ab), 0, 1) : 1;
    if (ruhig) {
      l.zeileEl.el.style.transform = "translate(-50%, -50%)";
      l.zeileEl.el.style.opacity = String(1 - raus);
    } else {
      const k = easeInOut(raus);
      l.zeileEl.el.style.transform = "translate(-50%, -50%) perspective(1200px) translateZ(" + (k * 320) + "px) rotateX(" + (k * 58) + "deg) rotateY(" + (k * -18) + "deg) scale(" + (wachsen * (0.96 + 0.04 * easeOut(ein))) + ")";
      l.zeileEl.el.style.opacity = String(1 - k);
      l.zeileEl.el.style.filter = k > 0.02 ? "blur(" + (k * 6).toFixed(1) + "px)" : "";
    }
    l.zeileEl.woerter.forEach(function (s, i) {
      const p = clamp((T - (z.ab + i * z.schritt)) / 0.38, 0, 1);
      const e = easeOut(p);
      s.style.opacity = String(e);
      if (ruhig) { s.style.transform = ""; s.style.filter = ""; return; }
      s.style.transform = z.stil === "intro" || z.stil === "outro"
        ? "scale(" + (0.55 + 0.45 * e) + ")"
        : "translateY(" + ((1 - e) * 34) + "px) rotateX(" + ((1 - e) * -50) + "deg)";
      s.style.filter = p < 1 ? "blur(" + ((1 - e) * 8).toFixed(1) + "px)" : "";
    });
  }

  /* ------------------------------------------------------
     ABLAUF
  ------------------------------------------------------ */
  let lauf = null;   // { wurzel, buehne, canvas, ctx, textEbene, note, zeilen, welt, farben, t0, ab, uhr, letzt, ... }

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
    lauf.T = T;
    const n = aktiveZeile(lauf.zeilen, T);
    lauf.stilJetzt = n >= 0 && T < lauf.zeilen[n].bis ? lauf.zeilen[n].stil : teilBei(T);
    malen(lauf, T);
    textZeichnen(lauf, T);
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  /* Der Film deckt alles ab - die WebGL-Flaechen der Seite halten so
     lange an (wie beim Riss). */
  function vollbild(an) {
    window.fhVollbildAn = an;
    document.dispatchEvent(new CustomEvent("fh:vollbild", { detail: { an: an } }));
  }

  function liedText() {
    return typeof siteConfig !== "undefined" && siteConfig && typeof siteConfig.liedText === "string" ? siteConfig.liedText : "";
  }

  /* Lucide "music" (ISC) - steht in der Mitte, solange kein Text da ist. */
  function noteBauen() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "fh-lied-note");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    [["path", { d: "M9 18V5l12-2v13" }], ["circle", { cx: "6", cy: "18", r: "3" }], ["circle", { cx: "18", cy: "16", r: "3" }]].forEach(function (x) {
      const e = document.createElementNS(ns, x[0]);
      Object.keys(x[1]).forEach(function (k) { e.setAttribute(k, x[1][k]); });
      svg.appendChild(e);
    });
    return svg;
  }

  function start(opts) {
    weg();
    opts = opts || {};
    const wurzel = document.createElement("div");
    wurzel.id = "fh-lied";
    wurzel.className = "fh-riss fh-lied";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("lied.aria", "Live-Story: Liebeslied"));
    const buehne = document.createElement("div");
    buehne.className = "fh-riss-buehne";
    buehne.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("canvas");
    canvas.className = "fh-lied-grund";
    canvas.width = B;
    canvas.height = H;
    const textEbene = document.createElement("div");
    textEbene.className = "fh-lied-text";
    const note = noteBauen();
    buehne.append(canvas, textEbene, note);
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
    lauf = {
      wurzel: wurzel, buehne: buehne, ctx: canvas.getContext("2d"), textEbene: textEbene, note: note,
      zeilen: lesen(opts.text != null ? opts.text : liedText()), welt: welt(), farben: farben(),
      t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), uhr: 0, letzt: 0,
      zeileNr: -2, zeileEl: null, stilJetzt: "intro", T: 0,
    };
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

  window.fhLiedFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    /* Fuer das Gateway (Pruefen vor dem Speichern) und fuer Tests. */
    lesen: lesen,
    zeit: function () { return lauf ? lauf.T : null; },
    DAUER: DAUER,
  };
})();
