/* ======================================================
   STERNENSCHLACHT: MUSIK UND KLANG
   ---------------------------------------------------
   Musik
     - Hat der Admin im Panel (Live-Event -> Storys -> "Musik je
       Story", Eintrag "Sternenschlacht") eine Datei hochgeladen,
       laeuft sie in Schleife: Bucket "live-musik", Datei "schlacht",
       Version in live_event.musik_versionen.schlacht (Migration 34).
     - Sonst erzeugt der Browser einen Synth-Kampftrack per Web Audio:
       Kick, Snare, Hi-Hats, treibender Saegezahn-Bass, Flaechen und
       ein Arpeggio in a-Moll (Am - F - C - G), 124 BPM.
   Spannung (0..1, von schlacht.js): Faellt eine Seite unter 25 %,
   oeffnet der Bassfilter, die Hi-Hats laufen doppelt so schnell und
   das Arpeggio tritt hervor; eine hochgeladene Datei wird lauter.
   Akzente bei Rundensieg, Spezialangriff und Schlachtende.
   Soundeffekte je Waffe (wie schlacht-fx.js), gedrosselt, damit
   Dauerfeuer nicht zum Rauschen wird.

   Startet beim Oeffnen der Schlachtseite (der Klick dorthin erlaubt
   dem Browser den Ton), stoppt beim Verlassen. Ein/Aus wird im
   Browser gemerkt (localStorage "fhSchlachtTon").

   API (window.fhSchlachtKlang):
     start(), stop(), setzeAn(bool), istAn(), spannung(0..1),
     akzent("runde" | "spezial" | "sieg"), sfx(art, laut)
====================================================== */

(function () {
  "use strict";

  const SPEICHER = "fhSchlachtTon";
  const BPM = 124;
  const SECHZEHNTEL = 60 / BPM / 4;
  const VORLAUF = 0.12;
  /* Am - F - C - G: Bass-Grundton und Akkordtoene (MIDI) */
  const TAKTE = [
    { bass: 33, akkord: [57, 60, 64] },
    { bass: 29, akkord: [53, 57, 60] },
    { bass: 36, akkord: [55, 60, 64] },
    { bass: 31, akkord: [55, 59, 62] },
  ];

  let ctx = null, master = null, musikBus = null, sfxBus = null, rauschen = null;
  let an = (function () { try { return localStorage.getItem(SPEICHER) !== "aus"; } catch (e) { return true; } })();
  let laeuft = false;
  let planer = null, naechste = 0, schritt = 0;
  let spannungZiel = 0, spannungJetzt = 0;
  let mp3 = null, mp3Url = null, mp3Gesucht = false, mp3Uhr = null;
  const zuletzt = {};
  let sfxFenster = [];

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* ------------------------------------------------------
     GRUNDGERUEST
  ------------------------------------------------------ */
  function kontext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const kompressor = ctx.createDynamicsCompressor();
    kompressor.threshold.value = -16; kompressor.ratio.value = 4;
    master.connect(kompressor); kompressor.connect(ctx.destination);
    musikBus = ctx.createGain(); musikBus.gain.value = 0.5; musikBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    /* Eine Sekunde weisses Rauschen fuer Drums und Effekte. */
    rauschen = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = rauschen.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function huelle(g, t, spitze, an_, ab) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, spitze), t + an_);
    g.gain.exponentialRampToValueAtTime(0.0001, t + an_ + ab);
  }

  function ton(art, freq, t, dauer, laut, ziel, filter) {
    const o = ctx.createOscillator();
    o.type = art;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    huelle(g, t, laut, 0.005, dauer);
    let kette = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.typ || "lowpass";
      f.frequency.setValueAtTime(filter.hz, t);
      if (filter.bis) f.frequency.exponentialRampToValueAtTime(filter.bis, t + dauer);
      f.Q.value = filter.q || 1;
      o.connect(f); kette = f;
    }
    kette.connect(g); g.connect(ziel);
    o.start(t); o.stop(t + dauer + 0.05);
    return o;
  }

  function geraeusch(t, dauer, laut, ziel, typ, hz_, bis, q) {
    const s = ctx.createBufferSource();
    s.buffer = rauschen;
    const f = ctx.createBiquadFilter();
    f.type = typ; f.frequency.setValueAtTime(hz_, t);
    if (bis) f.frequency.exponentialRampToValueAtTime(bis, t + dauer);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    huelle(g, t, laut, 0.003, dauer);
    s.connect(f); f.connect(g); g.connect(ziel);
    s.start(t, Math.random() * 0.5); s.stop(t + dauer + 0.05);
  }

  /* ------------------------------------------------------
     SYNTH-TRACK
  ------------------------------------------------------ */
  function spiele(s, t) {
    const i = s % 16;
    const takt = TAKTE[Math.floor(s / 16) % TAKTE.length];
    const sp = spannungJetzt;

    /* Kick auf jede Viertel */
    if (i % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      huelle(g, t, 0.9, 0.002, 0.28);
      o.connect(g); g.connect(musikBus); o.start(t); o.stop(t + 0.32);
    }
    /* Snare auf 2 und 4 */
    if (i === 4 || i === 12) geraeusch(t, 0.16, 0.32, musikBus, "bandpass", 1900, null, 0.8);
    /* Hi-Hats: Achtel, unter Spannung Sechzehntel */
    if (i % 2 === 1 || sp > 0.45) geraeusch(t, 0.035, i % 2 === 1 ? 0.12 : 0.07, musikBus, "highpass", 7500);
    /* Bass: Achtel mit Oktavsprung */
    if (i % 2 === 0) {
      const oktave = (i === 6 || i === 14) ? 12 : 0;
      ton("sawtooth", hz(takt.bass + oktave), t, SECHZEHNTEL * 1.7, 0.26, musikBus,
        { hz: 260 + 1500 * sp, bis: 180 + 600 * sp, q: 6 });
    }
    /* Flaeche zum Taktbeginn */
    if (i === 0) {
      takt.akkord.forEach(function (n) {
        [-6, 6].forEach(function (cent) {
          const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = cent;
          f.type = "lowpass"; f.frequency.value = 700 + 900 * sp;
          const lang = SECHZEHNTEL * 16;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.022, t + 0.35);
          g.gain.setValueAtTime(0.022, t + lang - 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + lang);
          o.connect(f); f.connect(g); g.connect(musikBus);
          o.start(t); o.stop(t + lang + 0.05);
        });
      });
    }
    /* Arpeggio: leise immer, unter Spannung deutlich */
    const n = takt.akkord[i % 3] + 12 + (i % 6 === 5 ? 12 : 0);
    ton("square", hz(n), t, SECHZEHNTEL * 0.9, 0.025 + 0.07 * sp, musikBus, { hz: 1400 + 2600 * sp, q: 2 });
  }

  function planen() {
    spannungJetzt += (spannungZiel - spannungJetzt) * 0.08;
    while (naechste < ctx.currentTime + VORLAUF) {
      spiele(schritt, naechste);
      naechste += SECHZEHNTEL;
      schritt++;
    }
  }

  function synthStart() {
    if (planer) return;
    naechste = ctx.currentTime + 0.08;
    schritt = 0;
    planer = setInterval(planen, 25);
  }
  function synthStop() { clearInterval(planer); planer = null; }

  /* ------------------------------------------------------
     HOCHGELADENE DATEI (Admin-Panel, Migration 34)
  ------------------------------------------------------ */
  async function mp3Suchen() {
    if (mp3Gesucht) return mp3Url;
    if (typeof supabaseClient === "undefined" || !supabaseClient || !supabaseClient.storage) return null;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("live_event").select("musik_versionen").eq("id", 1).maybeSingle();
      });
      if (error) throw error;
      const v = data && data.musik_versionen && data.musik_versionen.schlacht;
      if (v) {
        const d = supabaseClient.storage.from("live-musik").getPublicUrl("schlacht").data;
        mp3Url = d && d.publicUrl ? d.publicUrl + "?v=" + encodeURIComponent(v) : null;
      }
      mp3Gesucht = true;
    } catch (e) {
      /* dann eben Synth - beim naechsten Oeffnen neu fragen */
    }
    return mp3Url;
  }

  function mp3Lautstaerke() { return Math.min(1, 0.5 + 0.3 * spannungZiel); }

  function mp3Blenden(ziel, ms, danach) {
    clearInterval(mp3Uhr);
    if (!mp3) return;
    const von = mp3.volume, t0 = performance.now();
    mp3Uhr = setInterval(function () {
      const f = Math.min(1, (performance.now() - t0) / ms);
      mp3.volume = Math.max(0, Math.min(1, von + (ziel - von) * f));
      if (f >= 1) { clearInterval(mp3Uhr); if (danach) danach(); }
    }, 40);
  }

  async function musikStarten() {
    const url = await mp3Suchen();
    if (!laeuft || !an) return;
    if (url) {
      if (!mp3) { mp3 = new Audio(); mp3.loop = true; }
      if (mp3.getAttribute("src") !== url) mp3.src = url;
      mp3.volume = 0;
      try {
        await mp3.play();
        synthStop();
        mp3Blenden(mp3Lautstaerke(), 1200);
        return;
      } catch (e) {
        /* Datei nicht abspielbar -> Synth */
      }
    }
    synthStart();
  }

  function musikStoppen() {
    synthStop();
    if (mp3 && !mp3.paused) mp3Blenden(0, 500, function () { if (mp3) mp3.pause(); });
  }

  /* ------------------------------------------------------
     STEUERUNG
  ------------------------------------------------------ */
  function masterAuf(ziel, sek) {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(ziel, t + sek);
  }

  function entsperren() {
    if (ctx && ctx.state === "suspended" && laeuft && an) ctx.resume();
  }

  function start() {
    laeuft = true;
    if (!an) return;
    if (!kontext()) return;
    if (ctx.state === "suspended") ctx.resume().catch(function () { /* wartet auf Klick */ });
    /* Ohne frischen Klick bleibt der Kontext stumm - der erste Tipp
       auf der Seite schaltet ihn frei. */
    document.addEventListener("pointerdown", entsperren, { once: true });
    masterAuf(0.5, 1.2);
    musikStarten();
  }

  function stop() {
    laeuft = false;
    musikStoppen();
    if (ctx) {
      masterAuf(0, 0.5);
      setTimeout(function () { if (!laeuft && ctx) ctx.suspend(); }, 600);
    }
  }

  function setzeAn(wert) {
    an = !!wert;
    try { localStorage.setItem(SPEICHER, an ? "an" : "aus"); } catch (e) { /* egal */ }
    if (!an) { musikStoppen(); masterAuf(0, 0.3); }
    else if (laeuft) start();
  }

  function spannung(wert) {
    spannungZiel = Math.max(0, Math.min(1, Number(wert) || 0));
    if (mp3 && !mp3.paused) mp3.volume = mp3Lautstaerke();
  }

  function bereit() { return an && laeuft && ctx && ctx.state === "running"; }

  function akzent(art) {
    if (!bereit()) return;
    const t = ctx.currentTime + 0.02;
    if (art === "runde") {
      [57, 60, 64, 69, 72].forEach(function (n, k) { ton("square", hz(n + 12), t + k * 0.07, 0.18, 0.08, sfxBus, { hz: 4000 }); });
      geraeusch(t, 0.9, 0.18, sfxBus, "highpass", 3000);
    } else if (art === "spezial") {
      geraeusch(t, 0.6, 0.22, sfxBus, "bandpass", 400, 4200, 3);
      ton("sine", 90, t, 0.5, 0.35, sfxBus, { hz: 400 });
    } else if (art === "sieg") {
      [[57, 64, 69], [60, 67, 72]].forEach(function (ak, k) {
        ak.forEach(function (n) { ton("sawtooth", hz(n), t + k * 0.35, 0.9, 0.06, sfxBus, { hz: 2600 }); });
      });
    }
  }

  /* Soundeffekte - gedrosselt je Art und insgesamt. */
  function sfx(art, laut) {
    if (!bereit()) return;
    const jetzt = performance.now();
    if (zuletzt[art] && jetzt - zuletzt[art] < 70) return;
    sfxFenster = sfxFenster.filter(function (z) { return jetzt - z < 1000; });
    if (sfxFenster.length > 12 && !laut) return;
    zuletzt[art] = jetzt;
    sfxFenster.push(jetzt);
    const t = ctx.currentTime + 0.01;
    const L = laut ? 1.8 : 1;
    switch (art) {
      case "laser": { const o = ton("square", 1800, t, 0.09, 0.05 * L, sfxBus, { hz: 3000 }); o.frequency.exponentialRampToValueAtTime(380, t + 0.09); break; }
      case "doppel": sfx2("laser", t, L); sfx2("laser", t + 0.045, L); break;
      case "strahl": ton("sawtooth", 210, t, 0.32, 0.05 * L, sfxBus, { hz: 2400, bis: 300, q: 4 }); break;
      case "reparatur": { const o = ton("sine", 620, t, 0.26, 0.05 * L, sfxBus); o.frequency.exponentialRampToValueAtTime(990, t + 0.24); break; }
      case "puls": ton("sine", 920, t, 0.05, 0.06 * L, sfxBus); break;
      case "plasma": geraeusch(t, 0.3, 0.08 * L, sfxBus, "lowpass", 900, 200); ton("sine", 130, t, 0.3, 0.12 * L, sfxBus); break;
      case "netz": {
        const o = ton("triangle", 480, t, 0.3, 0.05 * L, sfxBus);
        const lfo = ctx.createOscillator(), tief = ctx.createGain();
        lfo.frequency.value = 22; tief.gain.value = 60;
        lfo.connect(tief); tief.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.35);
        break;
      }
      case "brut": [1200, 1420, 1650].forEach(function (f, k) { ton("sine", f, t + k * 0.05, 0.05, 0.04 * L, sfxBus); }); break;
      case "explosion":
        geraeusch(t, 0.7, 0.22 * L, sfxBus, "lowpass", 1400, 160);
        { const o = ton("sine", 75, t, 0.4, 0.3 * L, sfxBus); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); }
        break;
      case "treffer": geraeusch(t, 0.035, 0.05 * L, sfxBus, "highpass", 4000); break;
    }
  }
  function sfx2(art, t, L) {
    const o = ton("square", 1800, t, 0.08, 0.045 * L, sfxBus, { hz: 3000 });
    o.frequency.exponentialRampToValueAtTime(400, t + 0.08);
  }

  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) {
      ctx.suspend();
      if (mp3 && !mp3.paused) mp3.pause();
    } else if (laeuft && an) {
      ctx.resume();
      if (mp3 && mp3.paused && mp3Url && !planer) mp3.play().catch(function () { synthStart(); });
    }
  });

  /* Neue Datei im Admin hochgeladen: beim naechsten Oeffnen neu fragen. */
  window.addEventListener("fhSchlachtMusikNeu", function () { mp3Gesucht = false; mp3Url = null; });

  window.fhSchlachtKlang = {
    start: start, stop: stop, setzeAn: setzeAn, istAn: function () { return an; },
    spannung: spannung, akzent: akzent, sfx: sfx,
  };
})();
