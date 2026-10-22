/* ======================================================
   STERNENSCHLACHT: MUSIK UND KLANG
   ---------------------------------------------------
   Musik - JE KAMPFORT EINE EIGENE (ort(id), seit Design V2):
     - Hat der Admin im Panel (Live-Event -> Storys -> "Musik je
       Story") fuer den Ort eine Datei hochgeladen, laeuft sie in
       Schleife: Bucket "live-musik", Datei "schlacht_<ort>", Version
       in live_event.musik_versionen.schlacht_<ort> (Migration 34).
       Ohne Ort (Kampforte nicht freigegeben) gilt wie bisher die
       Datei "schlacht".
     - Sonst erzeugt der Browser den Synth-Track des Orts per Web
       Audio (STUECKE): eigenes Tempo, eigene Akkordfolge, eigener
       Rhythmus und Klang, dazu ein Erkennungszeichen - Geroell im
       Asteroidenguertel, Sog am Schwarzen Loch, Metall in der
       Station, Funken im Nebel, Fanfaren an der Sonne, Glocken im
       Eisring, ein Sog-Rauschen im Wurmloch, das Piepen des Pulsars,
       die Totenglocke auf dem Schiffsfriedhof, Schimmer im Mondring.
       Ohne Ort laeuft der bisherige Track (Am - F - C - G, 124 BPM).
     - Ein Ortswechsel blendet um: der Synth zum naechsten Taktanfang,
       eine Datei per Ueberblendung.
     - Der Hangar spielt die Musik des Orts der laufenden bzw. letzten
       Schlacht oder den Ort, den man dort auswaehlt (hangar.js).
   Spannung (0..1, von schlacht.js): Faellt eine Seite unter 25 %,
   oeffnet der Bassfilter, die Hi-Hats laufen doppelt so schnell und
   das Arpeggio tritt hervor; eine hochgeladene Datei wird lauter.
   Akzente bei Rundensieg, Spezialangriff und Schlachtende.
   Soundeffekte je Waffe (wie schlacht-fx.js), gedrosselt, damit
   Dauerfeuer nicht zum Rauschen wird.

   Laeuft auf der Schlachtseite UND im Hangar: Jede Seite meldet sich
   mit start(wer) an und mit stop(wer) ab; die Musik spielt, solange
   eine angemeldet ist - beim Wechsel Hangar <-> Schlacht laeuft sie
   ohne Neustart weiter. Der Klick auf die Seite erlaubt dem Browser
   den Ton. Ein/Aus wird im Browser gemerkt (localStorage
   "fhSchlachtTon") und gilt fuer beide Seiten.

   API (window.fhSchlachtKlang):
     start(wer), stop(wer), setzeAn(bool), istAn(), spannung(0..1),
     ort(ortId | null), ortJetzt(), ORTE (Orte mit eigenem Stueck),
     akzent("runde" | "spezial" | "sieg" | "sprung" | "ort" | "zaehlen"
            | "feuer" | "ereignis"), sfx(art, laut)
     (sprung bis feuer: Start-Animation in schlacht-orte.js;
      ereignis: Ereignis eines Kampforts)
====================================================== */

(function () {
  "use strict";

  const SPEICHER = "fhSchlachtTon";
  const VORLAUF = 0.12;

  /* Ein Takt: Bass-Grundton und Akkordtoene (MIDI). */
  function T(bass, a, b, c) { return { bass: bass, akkord: [a, b, c] }; }

  /* STUECKE - je Kampfort ein Track. Muster mit 16 Zeichen je Takt:
       kick, snare, hats  "x" = Schlag
       bass               "x" = Grundton, "o" = eine Oktave hoeher
       arp                "0".."2" = Akkordton, "3".."5" = eine Oktave hoeher
     Dazu Wellenform, Laenge (in Sechzehnteln) und Lautstaerke je
     Stimme und ein "extra" (EXTRA unten), das den Ort erkennbar macht. */
  const STUECKE = {
    standard: { bpm: 124, takte: [T(33, 57, 60, 64), T(29, 53, 57, 60), T(36, 55, 60, 64), T(31, 55, 59, 62)],
      kick: "x...x...x...x...", snare: "....x.......x...", hats: ".x.x.x.x.x.x.x.x",
      bass: "x.x.x.o.x.x.x.o.", bassWelle: "sawtooth", arp: "0120150120150120", arpWelle: "square" },
    asteroiden: { bpm: 132, takte: [T(38, 57, 62, 65), T(34, 58, 62, 65), T(29, 57, 60, 65), T(36, 55, 60, 64)],
      kick: "x..x..x.x..x..x.", snare: "....x.......x...", hats: ".x.x.x.x.x.x.x.x",
      bass: "xx.xx.x.xx.xx.o.", bassWelle: "sawtooth", arp: "0.1.2.1.0.1.5.1.", arpWelle: "square", extra: "geroell" },
    schwarzes_loch: { bpm: 96, takte: [T(36, 55, 60, 63), T(32, 56, 60, 63), T(29, 56, 60, 65), T(31, 55, 59, 62)],
      kick: "x.......x..x....", snare: "........x.......", hats: "..x...x...x...x.",
      bass: "x.......x.......", bassWelle: "sine", bassLang: 7, bassLaut: 0.4,
      arp: "0...1...2...1...", arpWelle: "triangle", arpLang: 3, flaecheHz: 380, extra: "sog" },
    station: { bpm: 118, takte: [T(28, 55, 59, 64), T(36, 55, 60, 64), T(38, 57, 62, 66), T(35, 54, 59, 62)],
      kick: "x...x...x...x...", snare: "....x.......x..x", hats: "x.x.x.x.x.x.x.x.",
      bass: "x..x..x.x..x..x.", bassWelle: "square", bassLaut: 0.2, arp: "0.0.1.0.2.0.1.0.", arpWelle: "square", extra: "metall" },
    nebel: { bpm: 110, takte: [T(30, 57, 61, 66), T(38, 57, 62, 66), T(33, 57, 61, 64), T(28, 56, 59, 64)],
      kick: "x.....x...x.....", snare: "............x...", hats: "..x..x..x..x..x.",
      bass: "x...x...x...x...", bassWelle: "triangle", bassLaut: 0.3,
      arp: "0..1..2..5..1..2", arpWelle: "sine", arpLang: 2.5, arpLaut: 0.035, flaecheHz: 500, extra: "knistern" },
    sonne: { bpm: 140, takte: [T(28, 59, 64, 67), T(36, 60, 64, 67), T(31, 59, 62, 67), T(38, 57, 62, 66)],
      kick: "x...x...x...x...", snare: "....x.......x.x.", hats: "xxxxxxxxxxxxxxxx",
      bass: "xoxoxoxoxoxoxoxo", bassWelle: "sawtooth", bassLaut: 0.22, bassLang: 0.9,
      arp: "0120120120120125", arpWelle: "sawtooth", arpLaut: 0.02, extra: "fanfare" },
    eisring: { bpm: 100, takte: [T(35, 54, 59, 62), T(31, 55, 59, 62), T(38, 54, 57, 62), T(33, 52, 57, 61)],
      kick: "x.......x.......", snare: "....x.......x...", hats: ".x.x.x.x.x.x.x.x",
      bass: "x.....x...x.....", bassWelle: "sine", bassLaut: 0.35, bassLang: 4,
      arp: "5.2.1.0.5.2.1.0.", arpWelle: "sine", arpLaut: 0.04, arpLang: 2, flaecheWelle: "triangle", extra: "glocken" },
    wurmloch: { bpm: 128, takte: [T(31, 55, 58, 62), T(39, 55, 58, 63), T(34, 53, 58, 62), T(29, 53, 57, 60)],
      kick: "x...x...x...x...", snare: "....x.......x...", hats: ".x.x.x.x.x.x.x.x",
      bass: "x.xxx.xxx.xxx.xo", bassWelle: "sawtooth", bassQ: 10, arp: "0.1.2.5.2.1.0.1.", arpWelle: "square", extra: "wirbel" },
    pulsar: { bpm: 120, takte: [T(33, 57, 60, 64), T(38, 57, 62, 65), T(28, 55, 59, 64), T(33, 57, 60, 64)],
      kick: "x...x...x...x...", snare: "....x.......x...", hats: "x.x.x.x.x.x.x.x.",
      bass: "x.x.x.x.x.x.x.x.", bassWelle: "square", bassLaut: 0.2, arp: "0120120120120120", arpWelle: "square", extra: "ping" },
    friedhof: { bpm: 84, takte: [T(38, 57, 62, 65), T(31, 55, 58, 62), T(33, 57, 61, 64), T(38, 57, 62, 65)],
      kick: "x.......x.......", snare: "............x...", hats: "................",
      bass: "x.......x.......", bassWelle: "triangle", bassLang: 6, bassLaut: 0.32,
      arp: "0...1...2...5...", arpWelle: "sine", arpLang: 3, arpLaut: 0.04,
      flaecheWelle: "triangle", flaecheHz: 600, flaecheLaut: 0.03, extra: "totenglocke" },
    mondring: { bpm: 108, takte: [T(39, 55, 58, 63), T(36, 55, 60, 63), T(32, 56, 60, 63), T(34, 53, 58, 62)],
      kick: "x.....x...x.....", snare: "....x.......x...", hats: ".x.x.x.x.x.x.x.x",
      bass: "x...x.x.x...x.o.", bassWelle: "sine", bassLaut: 0.32, bassLang: 2.5,
      arp: "0.2.1.5.0.2.1.5.", arpWelle: "triangle", arpLaut: 0.035, arpLang: 1.6, extra: "schimmer" },
  };

  let ctx = null, master = null, musikBus = null, sfxBus = null, rauschen = null;
  let an = (function () { try { return localStorage.getItem(SPEICHER) !== "aus"; } catch (e) { return true; } })();
  let laeuft = false;
  const besitzer = new Set();   // Seiten, die gerade Musik wollen ("schlacht", "hangar")
  let planer = null, naechste = 0, schritt = 0;
  let stueck = STUECKE.standard, wechselZu = null;   // wechselZu: ab dem naechsten Takt
  let ortJetzt = null;                               // Kampfort, dessen Musik laufen soll
  let spannungZiel = 0, spannungJetzt = 0;
  let mp3 = null, versionen = null, mp3Uhr = null;
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
     SYNTH-TRACKS (STUECKE)
  ------------------------------------------------------ */
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    huelle(g, t, 0.9, 0.002, 0.28);
    o.connect(g); g.connect(musikBus); o.start(t); o.stop(t + 0.32);
  }

  /* Glocke: Grundton und ein unharmonischer Oberton, langer Nachklang. */
  function glocke(freq, t, dauer, laut) {
    ton("sine", freq, t, dauer, laut, musikBus);
    ton("sine", freq * 2.76, t, dauer * 0.5, laut * 0.35, musikBus);
  }

  function flaeche(takt, t, st, S, sp) {
    const lang = st * 16, laut = S.flaecheLaut || 0.022;
    takt.akkord.forEach(function (n) {
      [-6, 6].forEach(function (cent) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = S.flaecheWelle || "sawtooth"; o.frequency.value = hz(n); o.detune.value = cent;
        f.type = "lowpass"; f.frequency.value = (S.flaecheHz || 700) + 900 * sp;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(laut, t + 0.35);
        g.gain.setValueAtTime(laut, t + lang - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + lang);
        o.connect(f); f.connect(g); g.connect(musikBus);
        o.start(t); o.stop(t + lang + 0.05);
      });
    });
  }

  /* Das Erkennungszeichen je Ort. s = Schritt seit Stueckbeginn, i = Schritt im Takt. */
  const EXTRA = {
    geroell: function (s, i, t) {
      if (i === 10 && s % 32 >= 16) { geraeusch(t, 0.35, 0.22, musikBus, "lowpass", 380, 90); ton("sine", 55, t, 0.3, 0.25, musikBus); }
    },
    sog: function (s, i, t, st) {
      if (i === 0 && Math.floor(s / 16) % 2 === 0) {
        const o = ton("sine", 110, t, st * 30, 0.09, musikBus);
        o.frequency.exponentialRampToValueAtTime(30, t + st * 30);
      }
    },
    metall: function (s, i, t) {
      if (i === 2 || i === 10) geraeusch(t, 0.08, 0.12, musikBus, "bandpass", 3200, null, 12);
      if (i === 14 && s % 32 >= 16) geraeusch(t, 0.12, 0.1, musikBus, "bandpass", 1700, 900, 14);
    },
    knistern: function (s, i, t) {
      if (Math.random() < 0.25) geraeusch(t + Math.random() * 0.05, 0.012, 0.06, musikBus, "highpass", 6000);
    },
    fanfare: function (s, i, t, st, takt) {
      if (i === 0 || i === 10) takt.akkord.forEach(function (n) { ton("sawtooth", hz(n + 12), t, st * 2.4, 0.045, musikBus, { hz: 2600, q: 1 }); });
    },
    glocken: function (s, i, t, st, takt) {
      if (i === 0 || i === 8) glocke(hz(takt.akkord[i === 0 ? 2 : 1] + 24), t, st * 10, 0.045);
    },
    wirbel: function (s, i, t, st) {
      if (i === 0) {
        const o = ton("sine", 200, t, st * 15, 0.03, musikBus);
        o.frequency.exponentialRampToValueAtTime(1300, t + st * 15);
        geraeusch(t, st * 15, 0.05, musikBus, "bandpass", 300, 3600, 4);
      }
    },
    ping: function (s, i, t) {
      if (i % 4 === 2) ton("sine", 1760, t, 0.06, 0.06, musikBus);
      if (i === 0) ton("sine", 2637, t, 0.12, 0.05, musikBus);
    },
    totenglocke: function (s, i, t, st, takt) {
      if (i === 0 && Math.floor(s / 16) % 2 === 0) glocke(hz(takt.bass + 24), t, st * 24, 0.09);
    },
    schimmer: function (s, i, t, st, takt) {
      if (i % 2 === 1 && Math.random() < 0.3) ton("sine", hz(takt.akkord[Math.floor(Math.random() * 3)] + 36), t, 0.4, 0.02, musikBus);
    },
  };

  function spiele(s, t) {
    const S = stueck, i = s % 16;
    const takt = S.takte[Math.floor(s / 16) % S.takte.length];
    const sp = spannungJetzt;
    const st = 60 / S.bpm / 4;

    if (S.kick[i] === "x") kick(t);
    if (S.snare[i] === "x") geraeusch(t, 0.16, 0.32, musikBus, "bandpass", 1900, null, 0.8);
    /* Hi-Hats nach Muster, unter Spannung jede Sechzehntel */
    if (S.hats[i] === "x" || sp > 0.45) geraeusch(t, 0.035, S.hats[i] === "x" ? 0.12 : 0.07, musikBus, "highpass", 7500);
    const b = S.bass[i];
    if (b !== ".") {
      ton(S.bassWelle, hz(takt.bass + (b === "o" ? 12 : 0)), t, st * (S.bassLang || 1.7), S.bassLaut || 0.26, musikBus,
        { hz: 260 + 1500 * sp, bis: 180 + 600 * sp, q: S.bassQ || 6 });
    }
    if (i === 0) flaeche(takt, t, st, S, sp);
    const a = S.arp[i];
    if (a !== ".") {
      const k = Number(a);
      const n = takt.akkord[k % 3] + 12 + (k >= 3 ? 12 : 0);
      ton(S.arpWelle, hz(n), t, st * (S.arpLang || 0.9), (S.arpLaut || 0.025) + 0.07 * sp, musikBus, { hz: 1400 + 2600 * sp, q: 2 });
    }
    if (S.extra && EXTRA[S.extra]) EXTRA[S.extra](s, i, t, st, takt, sp);
  }

  function planen() {
    spannungJetzt += (spannungZiel - spannungJetzt) * 0.08;
    while (naechste < ctx.currentTime + VORLAUF) {
      /* Ortswechsel: zum naechsten Taktanfang umschalten. */
      if (wechselZu && schritt % 16 === 0) { stueck = wechselZu; wechselZu = null; schritt = 0; }
      spiele(schritt, naechste);
      naechste += 60 / stueck.bpm / 4;
      schritt++;
    }
  }

  function stueckSetzen(id) {
    const neu = STUECKE[id] || STUECKE.standard;
    if (!planer) { stueck = neu; wechselZu = null; return; }
    wechselZu = neu === stueck ? null : neu;
  }

  function synthStart() {
    if (planer) return;
    naechste = ctx.currentTime + 0.08;
    schritt = 0;
    planer = setInterval(planen, 25);
  }
  function synthStop() { clearInterval(planer); planer = null; }

  /* ------------------------------------------------------
     HOCHGELADENE DATEIEN (Admin-Panel, Migration 34)
     Je Ort "schlacht_<ort>", ohne Ort "schlacht".
  ------------------------------------------------------ */
  async function versionenLaden() {
    if (versionen) return versionen;
    if (typeof supabaseClient === "undefined" || !supabaseClient || !supabaseClient.storage) return null;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("live_event").select("musik_versionen").eq("id", 1).maybeSingle();
      });
      if (error) throw error;
      versionen = (data && data.musik_versionen) || {};
    } catch (e) {
      /* dann eben Synth - beim naechsten Oeffnen neu fragen */
    }
    return versionen;
  }

  function dateiFuer(ortId) {
    const name = ortId ? "schlacht_" + ortId : "schlacht";
    const v = versionen && versionen[name];
    if (!v) return null;
    const d = supabaseClient.storage.from("live-musik").getPublicUrl(name).data;
    return d && d.publicUrl ? d.publicUrl + "?v=" + encodeURIComponent(v) : null;
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
  function mp3BlendenBis(ziel, ms) { return new Promise(function (fertig) { mp3Blenden(ziel, ms, fertig); }); }

  /* Bringt die Musik in den Zustand, der zu ortJetzt passt - beim
     Start und bei jedem Ortswechsel. */
  let musikLauf = 0;
  async function musikStarten() {
    const lauf = ++musikLauf;
    await versionenLaden();
    if (lauf !== musikLauf || !laeuft || !an) return;
    const url = dateiFuer(ortJetzt);
    if (url) {
      if (!mp3) { mp3 = new Audio(); mp3.loop = true; }
      if (mp3.getAttribute("src") !== url) {
        if (!mp3.paused) await mp3BlendenBis(0, 450);
        if (lauf !== musikLauf) return;
        mp3.src = url;
        mp3.volume = 0;
      }
      try {
        if (mp3.paused) await mp3.play();
        if (lauf !== musikLauf) return;
        synthStop();
        mp3Blenden(mp3Lautstaerke(), 1200);
        return;
      } catch (e) {
        /* Datei nicht abspielbar -> Synth */
      }
    }
    if (mp3 && !mp3.paused) mp3Blenden(0, 600, function () { if (mp3) mp3.pause(); });
    stueckSetzen(ortJetzt);
    synthStart();
  }

  function musikStoppen() {
    musikLauf++;   // ein noch laufendes musikStarten nicht mehr zu Ende fuehren
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

  function start(wer) {
    besitzer.add(wer || "schlacht");
    const schonDa = laeuft && (planer || (mp3 && !mp3.paused));
    laeuft = true;
    if (!an) return;
    if (schonDa) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    if (!kontext()) return;
    if (ctx.state === "suspended") ctx.resume().catch(function () { /* wartet auf Klick */ });
    /* Ohne frischen Klick bleibt der Kontext stumm - der erste Tipp
       auf der Seite schaltet ihn frei. */
    document.addEventListener("pointerdown", entsperren, { once: true });
    masterAuf(0.5, 1.2);
    musikStarten();
  }

  /* Erst einen Augenblick spaeter wirklich stoppen: beim Seitenwechsel
     meldet sich die alte Seite ab, bevor die neue sich anmeldet
     (Hangar -> Schlacht) - die Musik soll dann durchlaufen. */
  function stop(wer) {
    besitzer.delete(wer || "schlacht");
    setTimeout(function () { if (!besitzer.size && laeuft) aus(); }, 0);
  }

  function aus() {
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
    else if (laeuft) { laeuft = false; start(besitzer.values().next().value); }
  }

  /* Kampfort, dessen Musik laufen soll (null = ohne Ort). */
  function ort(id) {
    const neu = id && STUECKE[id] ? id : null;
    if (neu === ortJetzt) return;
    ortJetzt = neu;
    if (laeuft && an && ctx) musikStarten();
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
    } else if (art === "sprung") {
      /* Hyperraumsprung (schlacht-orte.js): ansteigendes Rauschen und Heulen. */
      geraeusch(t, 1.6, 0.16, sfxBus, "bandpass", 300, 3800, 2);
      const o = ton("sawtooth", 55, t, 1.6, 0.07, sfxBus, { hz: 900, bis: 4000 });
      o.frequency.exponentialRampToValueAtTime(440, t + 1.5);
    } else if (art === "ort") {
      geraeusch(t, 1.4, 0.22, sfxBus, "lowpass", 1800, 120);
      ton("sine", 48, t, 1.4, 0.3, sfxBus, { hz: 300 });
      [45, 52, 57].forEach(function (n) { ton("sawtooth", hz(n), t + 0.05, 1.3, 0.035, sfxBus, { hz: 1400 }); });
    } else if (art === "zaehlen") {
      ton("square", hz(81), t, 0.12, 0.06, sfxBus, { hz: 3000 });
      ton("sine", 70, t, 0.25, 0.18, sfxBus);
    } else if (art === "feuer") {
      geraeusch(t, 1.1, 0.25, sfxBus, "lowpass", 2400, 140);
      ton("sine", 60, t, 0.8, 0.35, sfxBus, { hz: 500 });
      [57, 64, 69, 76].forEach(function (n, k) { ton("sawtooth", hz(n), t + k * 0.03, 0.6, 0.045, sfxBus, { hz: 3200 }); });
    } else if (art === "ereignis") {
      geraeusch(t, 0.9, 0.2, sfxBus, "lowpass", 900, 90);
      { const o = ton("sine", 90, t, 0.7, 0.3, sfxBus); o.frequency.exponentialRampToValueAtTime(28, t + 0.7); }
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
      /* Parteien (57) */
      case "breitseite": [0, 0.08, 0.16].forEach(function (d) { geraeusch(t + d, 0.18, 0.07 * L, sfxBus, "lowpass", 700, 120); ton("sine", 90, t + d, 0.16, 0.08 * L, sfxBus); }); break;
      case "rail": { const o = ton("sawtooth", 2600, t, 0.12, 0.04 * L, sfxBus, { hz: 5000 }); o.frequency.exponentialRampToValueAtTime(200, t + 0.12); ton("sine", 60, t, 0.2, 0.1 * L, sfxBus); break; }
      case "splitter": [2400, 3100, 2750].forEach(function (f, k) { ton("triangle", f, t + k * 0.03, 0.06, 0.03 * L, sfxBus); }); break;
      case "schall": {
        const o = ton("sine", 320, t, 0.4, 0.05 * L, sfxBus);
        o.frequency.exponentialRampToValueAtTime(760, t + 0.36);
        const lfo = ctx.createOscillator(), tief = ctx.createGain();
        lfo.frequency.value = 9; tief.gain.value = 40;
        lfo.connect(tief); tief.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.42);
        break;
      }
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
      if (mp3 && mp3.paused && mp3.getAttribute("src") && !planer) mp3.play().catch(function () { synthStart(); });
    }
  });

  /* Neue Datei im Admin hochgeladen: beim naechsten Oeffnen neu fragen. */
  window.addEventListener("fhSchlachtMusikNeu", function () { versionen = null; });

  window.fhSchlachtKlang = {
    start: start, stop: stop, setzeAn: setzeAn, istAn: function () { return an; },
    spannung: spannung, akzent: akzent, sfx: sfx,
    ort: ort, ortJetzt: function () { return ortJetzt; },
    ORTE: Object.keys(STUECKE).filter(function (k) { return k !== "standard"; }),
  };
})();
