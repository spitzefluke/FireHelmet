/* ======================================================
   LIVE-STORY "LIEBESLIED" (Migration 70) - KLASSISCH (2D-Rueckfall)
   ---------------------------------------------------
   Lyric-Video zum Song "I Don't Know Love" im Look der Vorlage, die
   der Admin als Video geschickt hat (77-s-Vorschau). Der Film laeuft
   ueber das ganze Lied (5:23 min), damit Text und Musik zusammen-
   passen; die Vorschau war nur ein Zusammenschnitt daraus.

   Was man sieht, je Teil des Liedes:
     intro / outro  Daemmerblau mit feinen Strahlen und Sternenflug,
                    Versalien weit gesperrt, die aus der Tiefe
                    heranfliegen; Ringe, Lichtschein am Horizont.
     strophe        sattes Blau, grosse dunkle Flaechen mit feinen
                    Linien, ein weisser Orb; fette Schrift an
                    wechselnden Stellen, Buchstaben fliegen ein.
     refrain        Dunst mit Bokeh, Ringe um den Text, betonte Woerter
                    groesser.
     bruecke        wie der Refrain, die Schrift kursiv.
   Am Zeilenende kippt der Text als dicke 3D-Schrift aus dem Bild
   oder blendet weich weg; zwischen zwei Teilen ein kurzer Schnitt ins
   Dunkle.

   DER LIEDTEXT STEHT NICHT IM CODE
   Er kommt aus siteConfig.liedText, den der Admin im Gateway
   eintraegt (Live-Event -> "Liedtext: Liebeslied", dort auch aus der
   MP3 lesen und zur Musik mitklopfen). Eine Zeile je Liedzeile:

     # strophe              Stil ab hier: intro, strophe, refrain,
                            bruecke, outro
     15.0 | Text / zweite Zeile mit *Betonung* {ringe}
       ^ Sekunde ab Storybeginn ("1:02.5" geht auch)
       "/" bricht um, *Wort* wird groesser und leuchtet.
       {ringe} {horizont} {orb} {blitz} {kippen} {blende} {ohne}
       schalten Effekte dieser Zeile an (ohne = keine Effekte);
       sonst gilt, was zum Stil passt.

   Zeilen ohne Zeit oder ohne Text werden uebersprungen. Ohne Text
   laeuft nur das Bild (mit einer Note in der Mitte).

   WIE ES GEBAUT IST
   - Jedes Bild ist eine Funktion der Zeit T: Wer spaeter dazukommt,
     steigt mit "ab" an derselben Stelle ein und sieht dasselbe wie
     alle (Zufall nur mit festem Startwert).
   - Hintergrund auf einem Canvas (1280 x 720), Ringe und Text als DOM
     darueber - so bleiben Schrift und Ringe scharf und kippen per
     CSS-3D. Buehne 1920 x 1080 wie beim Riss, hoechstens 30 Bilder/s.
   - Bei "Bewegung reduzieren": kein Kippen, kein Heranfliegen, kein
     Sternenflug, kein Blitz - Woerter blenden nur.

   live-storys.js startet den Film in der Story "liebeslied":
     fhLiedFilm.start({ ab: ms, vorschau })
     fhLiedFilm.ende()   - Story vorbei: kurz ausblenden
     fhLiedFilm.weg()    - abgebrochen: sofort weg
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  /* Laenge des Songs (I_Dont_Know_Love.mp3: 323,06 s) - muss zu
     STORYS.liebeslied in live-storys.js passen. */
  const DAUER = 323.1;
  const STILE = ["intro", "strophe", "refrain", "bruecke", "outro"];
  const EFFEKTE = ["ringe", "horizont", "orb", "blitz", "kippen", "blende", "ohne"];
  const TEXT_MAX = 12000;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const mix = (a, b, k) => a + (b - a) * k;

  /* Zufall mit festem Startwert: jeder sieht dieselben Sterne. */
  function zufall(start) {
    let s = (start * 2654435761) >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ------------------------------------------------------
     LIEDTEXT LESEN
  ------------------------------------------------------ */
  function sekunden(s) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}(?:[.,]\d+)?)\s*$/.exec(s);
    if (!m) return null;
    const wert = (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(",", "."));
    return isFinite(wert) && wert >= 0 && wert < DAUER ? wert : null;
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
    let stil = "intro";
    String(roh || "").slice(0, TEXT_MAX).split(/\r?\n/).forEach(function (z) {
      const marke = /^\s*#\s*([a-zäöü]+)\s*$/i.exec(z);
      if (marke) {
        const name = marke[1].toLowerCase().replace("ü", "ue");
        if (STILE.indexOf(name) >= 0) stil = name;
        return;
      }
      const i = z.indexOf("|");
      if (i < 0) return;
      const ab = sekunden(z.slice(0, i));
      const tags = {};
      const text = z.slice(i + 1).replace(/\{([a-z]+)\}/gi, function (_, name) {
        name = name.toLowerCase();
        if (EFFEKTE.indexOf(name) >= 0) tags[name] = true;
        return " ";
      });
      const reihen = woerter(text);
      if (ab == null || !reihen.length) return;
      zeilen.push({ ab: ab, stil: stil, reihen: reihen, tags: tags });
    });
    zeilen.sort(function (a, b) { return a.ab - b.ab; });
    zeilen.forEach(function (z, n) {
      const naechste = zeilen[n + 1];
      z.nr = n;
      z.bis = naechste ? naechste.ab : DAUER;
      /* Eine Zeile steht nicht ewig: hoechstens 9 s, dann klingt sie aus. */
      z.ende = Math.min(z.bis, z.ab + 9);
      z.anzahl = z.reihen.reduce(function (s, r) { return s + r.length; }, 0);
      z.betont = z.reihen.some(function (r) { return r.some(function (w) { return w.betont; }); });
      z.schritt = Math.min(0.42, Math.max(0.1, ((z.ende - z.ab) * 0.5) / Math.max(1, z.anzahl)));
      z.teilWechsel = !!naechste && naechste.stil !== z.stil;
      z.teilBeginn = n > 0 && zeilen[n - 1].stil !== z.stil;
      const r = zufall(n + 7);
      /* Effekte: ausdruecklich gesetzt oder passend zum Stil. */
      const ohne = z.tags.ohne;
      const s = z.stil;
      z.ringe = !ohne && (z.tags.ringe || (!z.tags.horizont && z.betont && s !== "strophe"));
      z.horizont = !ohne && (z.tags.horizont || (!z.ringe && (s === "intro" || s === "outro" || s === "bruecke") && n % 2 === 0));
      z.orb = !ohne && (z.tags.orb || s === "strophe");
      z.blitz = !ohne && !!z.tags.blitz;
      z.kippen = z.tags.blende ? false : (z.tags.kippen || z.teilWechsel || n % 2 === 1);
      /* Strophe: Text an wechselnden Stellen, jede zweite Zeile mit
         einfliegenden Buchstaben; sonst mittig. */
      z.x = s === "strophe" ? (r() * 2 - 1) * 380 : 0;
      z.y = s === "strophe" ? (r() * 2 - 1) * 220 : (s === "intro" || s === "outro" ? -30 : -10);
      z.buchstaben = s === "strophe" && n % 3 === 1;
      z.heranfliegen = s === "intro" || s === "outro" || (s === "bruecke" && n % 2 === 0);
      z.orbVon = [0.2 + r() * 0.6, 0.25 + r() * 0.5];
      z.orbNach = [0.2 + r() * 0.6, 0.25 + r() * 0.5];
      z.flaeche = r();
    });
    return zeilen;
  }

  function aktiveZeile(zeilen, T) {
    for (let i = zeilen.length - 1; i >= 0; i--) if (T >= zeilen[i].ab) return i;
    return -1;
  }

  /* ------------------------------------------------------
     FARBEN (aus den Tokens --fh-lied-*)
  ------------------------------------------------------ */
  function hex(h, ersatz) {
    const m = /^#?([0-9a-f]{6})$/i.exec((h || "").trim());
    const n = parseInt(m ? m[1] : ersatz, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function farben() {
    const st = getComputedStyle(document.documentElement);
    const f = function (name, ersatz) { return hex(st.getPropertyValue(name), ersatz); };
    return {
      nacht: f("--fh-lied-nacht", "0b0a1c"),
      daemmer: f("--fh-lied-daemmer", "4b4893"),
      daemmerRand: f("--fh-lied-daemmer-rand", "1a1938"),
      blau: f("--fh-lied-blau", "3436b4"),
      blauRand: f("--fh-lied-blau-rand", "11113c"),
      dunst: f("--fh-lied-dunst", "47427e"),
      dunstRand: f("--fh-lied-dunst-rand", "1b1935"),
      flaeche: f("--fh-lied-flaeche", "27272f"),
      linie: f("--fh-lied-linie", "6d6ae0"),
      lila: f("--fh-lied-lila", "a99cf0"),
      licht: f("--fh-lied-licht", "f4f1ff"),
    };
  }

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
  function mischen(a, b, k) { return [Math.round(mix(a[0], b[0], k)), Math.round(mix(a[1], b[1], k)), Math.round(mix(a[2], b[2], k))]; }

  /* ------------------------------------------------------
     HINTERGRUND (Canvas 1280 x 720)
  ------------------------------------------------------ */
  const B = 1280, H = 720;

  function welt() {
    const r = zufall(70);
    const sterne = [];
    for (let i = 0; i < 150; i++) sterne.push({ x: r() * B, y: r() * H, g: 0.6 + r() * 1.4, p: r() * 6.28, v: 0.5 + r() * 1.5 });
    const flug = [];   // Sterne, die auf die Kamera zufliegen
    for (let i = 0; i < 26; i++) flug.push({ w: r() * Math.PI * 2, p: r(), v: 0.05 + r() * 0.08 });
    const bokeh = [];
    for (let i = 0; i < 26; i++) bokeh.push({ x: 0.5 + (r() - 0.5) * 0.7, y: 0.45 + (r() - 0.5) * 0.6, g: 30 + r() * 70, p: r() * 6.28, a: 0.25 + r() * 0.45 });
    const strahlen = [];
    for (let i = 0; i < 110; i++) strahlen.push({ w: (i / 110) * Math.PI * 2 + r() * 0.03, a: 0.03 + r() * 0.06 });
    return { sterne: sterne, flug: flug, bokeh: bokeh, strahlen: strahlen };
  }

  /* Weicher Lichtfleck als Vorlage - drawImage ist viel billiger als
     jedes Bild neu einen Verlauf mit Unschaerfe zu rechnen. */
  function fleckBauen(farbe) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, rgba(farbe, 1));
    g.addColorStop(0.45, rgba(farbe, 0.55));
    g.addColorStop(1, rgba(farbe, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return c;
  }

  /* Anteil eines Stils am Bild (weiche Ueberblendung ueber 0,6 s). */
  function anteile(l, T) {
    const z = l.zeilen;
    const n = aktiveZeile(z, T);
    const jetzt = n >= 0 ? z[n].stil : (z.length ? z[0].stil : "intro");
    const vorher = n > 0 ? z[n - 1].stil : jetzt;
    const k = n >= 0 ? clamp((T - z[n].ab) / 0.6, 0, 1) : 1;
    const a = { intro: 0, strophe: 0, refrain: 0, bruecke: 0, outro: 0 };
    a[jetzt] += k;
    a[vorher] += 1 - k;
    return a;
  }

  function malen(l, T) {
    const c = l.ctx, F = l.farben, ruhig = RUHIG.matches;
    const a = anteile(l, T);
    const daemmer = a.intro + a.outro, blau = a.strophe, dunst = a.refrain + a.bruecke;
    const n = aktiveZeile(l.zeilen, T);
    const z = n >= 0 ? l.zeilen[n] : null;

    /* 1. Grund: Verlauf, je Stil gemischt. */
    let mitte = mischen(mischen(F.daemmer, F.blau, blau), F.dunst, dunst);
    let rand = mischen(mischen(F.daemmerRand, F.blauRand, blau), F.dunstRand, dunst);
    const g = c.createRadialGradient(B * 0.5, H * 0.42, 40, B * 0.5, H * 0.5, B * 0.72);
    g.addColorStop(0, rgba(mitte, 1));
    g.addColorStop(0.55, rgba(mischen(mitte, rand, 0.45), 1));
    g.addColorStop(1, rgba(rand, 1));
    c.fillStyle = g;
    c.fillRect(0, 0, B, H);

    /* 2. Heller Schein oben. */
    c.globalAlpha = 0.28 * (1 - blau * 0.6);
    c.drawImage(l.fleckLicht, B * 0.15, -H * 0.55, B * 0.7, H * 1.0);
    c.globalAlpha = 1;

    /* 3. Feine Strahlen aus dem Fluchtpunkt (Bruecke: von unten). */
    const fx = B * 0.5, fy = mix(H * 0.5, H * 1.15, a.bruecke);
    const dreh = ruhig ? 0 : T * 0.01;
    c.lineWidth = 1;
    l.welt.strahlen.forEach(function (s) {
      const w = s.w + dreh;
      c.strokeStyle = rgba(F.licht, s.a * (1 - blau * 0.5));
      c.beginPath();
      c.moveTo(fx + Math.cos(w) * 60, fy + Math.sin(w) * 60);
      c.lineTo(fx + Math.cos(w) * B, fy + Math.sin(w) * B);
      c.stroke();
    });

    /* 4. Bokeh im Refrain und in der Bruecke. */
    if (dunst > 0.01) {
      l.welt.bokeh.forEach(function (k) {
        const x = (k.x + (ruhig ? 0 : Math.sin(T * 0.11 + k.p) * 0.03)) * B;
        const y = (k.y + (ruhig ? 0 : Math.cos(T * 0.09 + k.p) * 0.03)) * H;
        c.globalAlpha = k.a * dunst * 0.4;
        c.drawImage(l.fleckLila, x - k.g, y - k.g, k.g * 2, k.g * 2);
      });
      c.globalAlpha = 1;
    }

    /* 5. Strophe: grosse dunkle Flaechen, eine davon mit feinen Linien. */
    if (blau > 0.01 && z) flaechen(l, T, z, blau);

    /* 6. Sterne, dazu der Flug auf die Kamera zu. */
    l.welt.sterne.forEach(function (s) {
      const al = ruhig ? 0.5 : 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(T * s.v + s.p));
      c.fillStyle = rgba(F.licht, al * (0.6 + daemmer * 0.4));
      c.fillRect(s.x, s.y, s.g, s.g);
    });
    if (!ruhig) {
      l.welt.flug.forEach(function (s) {
        const p = (s.p + T * s.v) % 1;
        const d = easeIn(p) * B * 0.75;
        const x = B * 0.5 + Math.cos(s.w) * d, y = H * 0.5 + Math.sin(s.w) * d;
        const len = 2 + p * p * 40;
        c.strokeStyle = rgba(F.licht, 0.08 + p * 0.4);
        c.lineWidth = 0.6 + p * 1.6;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - Math.cos(s.w) * len, y - Math.sin(s.w) * len);
        c.stroke();
      });
    }

    /* 7. Orb (Strophe). */
    if (z && z.orb) {
      const p = clamp((T - z.ab) / Math.max(0.5, z.ende - z.ab), 0, 1);
      const sicht = clamp((T - z.ab) / 0.4, 0, 1) * clamp((z.ende - T) / 0.4, 0, 1);
      const ox = mix(z.orbVon[0], z.orbNach[0], easeInOut(p)) * B;
      const oy = mix(z.orbVon[1], z.orbNach[1], easeInOut(p)) * H;
      orb(l, ox, oy, sicht);
    }

    /* 8. Lichtschein am Horizont. */
    if (z && z.horizont) {
      const al = clamp((T - z.ab - 0.3) / 0.8, 0, 1) * clamp((z.ende - T) / 0.6, 0, 1);
      c.globalAlpha = 0.85 * al;
      c.drawImage(l.fleckLicht, B * 0.28, H * 0.86, B * 0.44, H * 0.3);
      c.globalAlpha = 0.5 * al;
      c.drawImage(l.fleckLila, B * 0.12, H * 0.8, B * 0.76, H * 0.42);
      c.globalAlpha = 1;
      c.strokeStyle = rgba(F.licht, 0.22 * al);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(B * 0.12, H * 0.865);
      c.lineTo(B * 0.88, H * 0.865);
      c.stroke();
    }

    /* 9. Vignette: die Ecken tief dunkel. */
    const v = c.createRadialGradient(B * 0.5, H * 0.48, H * 0.35, B * 0.5, H * 0.5, B * 0.68);
    v.addColorStop(0, rgba(F.nacht, 0));
    v.addColorStop(1, rgba(F.nacht, 0.78));
    c.fillStyle = v;
    c.fillRect(0, 0, B, H);

    /* 10. Blitz (nur mit {blitz}) und Schnitt zwischen zwei Teilen. */
    if (z && z.blitz && !ruhig) {
      const b = clamp(1 - (T - z.ab) / 0.5, 0, 1);
      if (b > 0) { c.fillStyle = rgba(F.lila, 0.8 * b); c.fillRect(0, 0, B, H); }
    }
    const schnitt = schnittStaerke(l, T);
    if (schnitt > 0) { c.fillStyle = rgba(F.nacht, schnitt); c.fillRect(0, 0, B, H); }
  }

  /* Kurz ins Dunkle, wo ein neuer Teil des Liedes beginnt. */
  function schnittStaerke(l, T) {
    let s = 0;
    l.zeilen.forEach(function (z) {
      if (!z.teilBeginn || T < z.ab - 0.3 || T > z.ab + 0.4) return;
      s = Math.max(s, T < z.ab ? (T - (z.ab - 0.3)) / 0.3 : 1 - (T - z.ab) / 0.4);
    });
    return clamp(s, 0, 1) * 0.85;
  }

  function flaechen(l, T, z, staerke) {
    const c = l.ctx, F = l.farben;
    const fahrt = RUHIG.matches ? 0 : (T - z.ab) * 26;
    const w = -1.05 + z.flaeche * 0.4;           // Neigung der Kante
    const dx = Math.cos(w), dy = Math.sin(w);
    const lage = [B * (0.25 + z.flaeche * 0.2) - fahrt, B * (0.62 + z.flaeche * 0.15) - fahrt * 0.6];
    function halbebene(x0, breite) {
      const nx = -dy, ny = dx;                   // Normale der Kante
      c.beginPath();
      c.moveTo(x0 - dx * 2000, H * 0.5 - dy * 2000);
      c.lineTo(x0 + dx * 2000, H * 0.5 + dy * 2000);
      c.lineTo(x0 + dx * 2000 - nx * breite, H * 0.5 + dy * 2000 - ny * breite);
      c.lineTo(x0 - dx * 2000 - nx * breite, H * 0.5 - dy * 2000 - ny * breite);
      c.closePath();
    }
    c.save();
    c.globalAlpha = 0.9 * staerke;
    c.fillStyle = rgba(F.flaeche, 1);
    halbebene(lage[0], 2200);
    c.fill();
    /* Feine Linien auf der vorderen Flaeche. */
    c.clip();
    c.strokeStyle = rgba(F.linie, 0.55);
    c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const x0 = lage[0] - i * 14 - 24;
      c.beginPath();
      c.moveTo(x0 - dx * 2000, H * 0.5 - dy * 2000);
      c.lineTo(x0 + dx * 2000, H * 0.5 + dy * 2000);
      c.stroke();
    }
    c.restore();
    /* Zweite, schmale Flaeche weiter hinten. */
    c.save();
    c.globalAlpha = 0.55 * staerke;
    c.fillStyle = rgba(F.flaeche, 1);
    halbebene(lage[1], 90);
    c.fill();
    c.restore();
  }

  function orb(l, x, y, sicht) {
    if (sicht <= 0) return;
    const c = l.ctx, F = l.farben;
    c.globalAlpha = 0.75 * sicht;
    c.drawImage(l.fleckLila, x - 170, y - 170, 340, 340);
    c.globalAlpha = sicht;
    c.drawImage(l.fleckLicht, x - 70, y - 70, 140, 140);
    /* Feine Strahlen um den Orb. */
    c.strokeStyle = rgba(F.licht, 0.16 * sicht);
    c.lineWidth = 1;
    for (let i = 0; i < 36; i++) {
      const w = (i / 36) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x + Math.cos(w) * 30, y + Math.sin(w) * 30);
      c.lineTo(x + Math.cos(w) * 240, y + Math.sin(w) * 240);
      c.stroke();
    }
    c.fillStyle = rgba(F.licht, sicht);
    c.beginPath();
    c.arc(x, y, 21, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  /* ------------------------------------------------------
     TEXT
  ------------------------------------------------------ */
  function zeileBauen(z) {
    const el = document.createElement("div");
    el.className = "fh-lied-zeile ist-" + z.stil;
    const teile = [];                       // animierte Einheiten: Woerter oder Buchstaben
    const r = zufall(z.nr + 101);
    z.reihen.forEach(function (reihe) {
      const zeile = document.createElement("div");
      zeile.className = "fh-lied-reihe";
      reihe.forEach(function (w) {
        const s = document.createElement("span");
        s.className = "fh-lied-wort" + (w.betont ? " ist-betont" : "");
        if (z.buchstaben && !RUHIG.matches) {
          s.style.opacity = "1";               // sichtbar; es blenden die Buchstaben
          Array.from(w.w).forEach(function (zeichen) {
            const b = document.createElement("span");
            b.className = "fh-lied-zeichen";
            b.textContent = zeichen;
            s.appendChild(b);
            teile.push({ el: b, betont: w.betont, dx: (r() * 2 - 1) * 700, dy: (r() * 2 - 1) * 420, dr: (r() * 2 - 1) * 160 });
          });
        } else {
          s.textContent = w.w;
          teile.push({ el: s, betont: w.betont });
        }
        zeile.appendChild(s);
      });
      el.appendChild(zeile);
    });
    return { el: el, teile: teile };
  }

  function ringeZeigen(l, z, T) {
    const an = z && z.ringe;
    const sicht = an ? clamp((T - z.ab) / 0.5, 0, 1) * clamp((z.ende - T) / 0.5, 0, 1) : 0;
    l.ringe.style.opacity = sicht.toFixed(3);
    if (!an || !sicht) return;
    const p = clamp((T - z.ab) / Math.max(1, z.ende - z.ab), 0, 1);
    l.ringe.style.transform = "translate(-50%, -50%) translate(" + z.x + "px," + z.y + "px) scale(" + (RUHIG.matches ? 1 : 0.86 + 0.2 * easeOut(p)).toFixed(4) + ")";
  }

  function textZeichnen(l, T) {
    const n = aktiveZeile(l.zeilen, T);
    if (n !== l.zeileNr) {
      if (l.zeileEl) l.zeileEl.el.remove();
      l.zeileEl = n >= 0 ? zeileBauen(l.zeilen[n]) : null;
      if (l.zeileEl) l.textEbene.appendChild(l.zeileEl.el);
      l.zeileNr = n;
      /* Fuer Screenreader die ganze Zeile auf einmal. */
      l.vorlesen.textContent = n >= 0 ? l.zeilen[n].reihen.map(function (r) { return r.map(function (w) { return w.w; }).join(" "); }).join(" ") : "";
    }
    l.note.style.opacity = l.zeilen.length ? "0" : String(0.35 + 0.25 * Math.sin(T * 1.6));
    const z = n >= 0 ? l.zeilen[n] : null;
    ringeZeigen(l, z, T);
    if (!l.zeileEl) return;

    const ruhig = RUHIG.matches;
    const dauer = Math.max(0.5, z.ende - z.ab);
    const rausDauer = Math.min(0.6, dauer * 0.3);
    const raus = z.ende >= DAUER ? 0 : clamp((T - (z.ende - rausDauer)) / rausDauer, 0, 1);
    const ein = clamp((T - z.ab) / (z.heranfliegen ? 1.3 : 0.6), 0, 1);
    const lauf = clamp((T - z.ab) / dauer, 0, 1);
    const st = l.zeileEl.el.style;
    const basis = "translate(-50%, -50%) translate(" + z.x + "px," + z.y + "px)";

    if (ruhig) {
      st.transform = basis;
      st.opacity = String(1 - raus);
    } else {
      /* Heranfliegen aus der Tiefe, dann langsam naeher; Strophe und
         Refrain schweben leicht schraeg im Raum. */
      const e = easeOut(ein);
      let tf = basis + " perspective(1400px)";
      if (z.heranfliegen) tf += " rotateX(" + ((1 - e) * 34).toFixed(2) + "deg) rotateZ(" + ((1 - e) * -7).toFixed(2) + "deg) scale(" + (0.32 + 0.68 * e + 0.12 * lauf).toFixed(4) + ")";
      else tf += " rotateY(" + (mix(7, -5, lauf)).toFixed(2) + "deg) rotateX(" + (mix(-3, 3, lauf)).toFixed(2) + "deg) scale(" + (0.94 + 0.06 * e + 0.05 * lauf).toFixed(4) + ")";
      if (raus > 0) {
        const k = easeIn(raus);
        if (z.kippen) tf += " translateZ(" + (k * 900).toFixed(1) + "px) rotateY(" + (k * -42).toFixed(2) + "deg) rotateX(" + (k * 24).toFixed(2) + "deg) rotateZ(" + (k * -10).toFixed(2) + "deg)";
        else tf += " scale(" + (1 + k * 0.08).toFixed(4) + ")";
      }
      st.transform = tf;
      st.opacity = String(z.kippen ? 1 - clamp((raus - 0.55) / 0.45, 0, 1) : 1 - raus);
      st.filter = !z.kippen && raus > 0.02 ? "blur(" + (raus * 8).toFixed(1) + "px)" : "";
    }
    l.zeileEl.el.classList.toggle("ist-tief", !ruhig && z.kippen && raus > 0);

    /* Woerter (oder Buchstaben) nacheinander. */
    const teile = l.zeileEl.teile;
    const schritt = z.buchstaben ? Math.min(0.06, (dauer * 0.45) / Math.max(1, teile.length)) : z.schritt;
    teile.forEach(function (tl, i) {
      const p = clamp((T - (z.ab + i * schritt)) / (z.buchstaben ? 0.7 : 0.45), 0, 1);
      const e = easeOut(p);
      const s = tl.el.style;
      if (ruhig) { s.opacity = String(e); s.transform = ""; s.filter = ""; tl.el.classList.toggle("ist-neu", false); return; }
      if (tl.dx != null) {
        s.opacity = String(clamp(p * 1.6, 0, 1));
        s.transform = "translate(" + ((1 - e) * tl.dx).toFixed(1) + "px," + ((1 - e) * tl.dy).toFixed(1) + "px) rotate(" + ((1 - e) * tl.dr).toFixed(1) + "deg) scale(" + (0.6 + 0.4 * e).toFixed(3) + ")";
      } else {
        s.opacity = String(e);
        s.transform = z.heranfliegen ? "" : "translateY(" + ((1 - e) * 26).toFixed(1) + "px)";
        s.filter = p < 1 ? "blur(" + ((1 - e) * 6).toFixed(1) + "px)" : "";
      }
      /* Neu erscheinende Woerter leuchten erst lila, dann weiss. */
      tl.el.classList.toggle("ist-neu", T - (z.ab + i * schritt) < 0.7);
    });
  }

  /* ------------------------------------------------------
     ABLAUF
  ------------------------------------------------------ */
  let lauf = null;

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

  function el(tag, klasse) {
    const e = document.createElement(tag);
    e.className = klasse;
    return e;
  }

  function start(opts) {
    weg();
    opts = opts || {};
    const wurzel = el("div", "fh-riss fh-lied");
    wurzel.id = "fh-lied";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("lied.aria", "Live-Story: Liebeslied"));
    const buehne = el("div", "fh-riss-buehne");
    buehne.setAttribute("aria-hidden", "true");
    const canvas = el("canvas", "fh-lied-grund");
    canvas.width = B;
    canvas.height = H;
    const ringe = el("div", "fh-lied-ringe");
    ringe.append(el("i", "fh-lied-ring"), el("i", "fh-lied-ring"), el("i", "fh-lied-ring"));
    const textEbene = el("div", "fh-lied-text");
    const note = noteBauen();
    buehne.append(canvas, ringe, textEbene, note);
    const vorlesen = el("p", "fh-lied-vorlesen");
    vorlesen.setAttribute("aria-live", "polite");
    const hinweis = el("p", "fh-riss-hinweis");
    hinweis.textContent = t("riss.rotate", "Tipp: Handy quer halten");
    const knopf = el("button", "fh-riss-weiter");
    knopf.type = "button";
    knopf.textContent = t("riss.skip", "Überspringen");
    knopf.addEventListener("click", weg);
    wurzel.append(buehne, vorlesen, hinweis, knopf);
    document.body.appendChild(wurzel);
    const F = farben();
    lauf = {
      wurzel: wurzel, buehne: buehne, ctx: canvas.getContext("2d"), ringe: ringe, textEbene: textEbene,
      note: note, vorlesen: vorlesen, farben: F, welt: welt(),
      fleckLicht: fleckBauen(F.licht), fleckLila: fleckBauen(F.lila),
      zeilen: lesen(opts.text != null ? opts.text : liedText()),
      t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), uhr: 0, letzt: 0,
      zeileNr: -2, zeileEl: null, T: 0,
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

  window.fhLiedFilmKlassisch = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    /* Fuer das Gateway (Pruefen vor dem Speichern) und fuer Tests. */
    lesen: lesen,
    zeit: function () { return lauf ? lauf.T : null; },
    DAUER: DAUER,
    STILE: STILE,
  };
})();
