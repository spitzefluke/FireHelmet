/* ======================================================
   LIVE-STERNENSCHLACHT (Migrationen 49 und 50)
   ---------------------------------------------------
   Seite #sternenschlacht, nur im Jahr 2100 in der Navigation.
   Der Admin startet die Schlacht; die Datenbank haelt fest, wer
   mitkaempft, und rechnet den Stand (schlacht_stand). Seit 50 laeuft
   sie endlos in Runden, bis der Admin sie beendet: Faellt eine Seite
   auf 0, gibt es einen Rundensieg, und die Datenbank stellt beide
   Flotten neu auf (neue Spieler, Hangar-Ausbauten, Spezial wieder
   frei). Eine leere Seite fuellt eine Uebungsflotte ("ki-...").

   VOLLBILD: Die Schlacht fuellt immer das ganze Fenster
   (#fh-schlacht-buehne, haengt an body und steht in den :not-Listen
   von 95 und 96 - kein Farbfilter, kein Rand von #fh-main). X oder
   Esc fuehren zur vorigen Seite zurueck. Kopf (Runde, Rundensiege,
   Ton, Schliessen) oben, Schlachtfeld in der Mitte, Banner und
   Steuerung unten. Auf hohen Bildschirmen (Handy hochkant) stehen
   die Menschen unten und die Aliens oben.

   Der Browser zeigt nur:
   - das Schlachtfeld (Canvas): jede Einheit mit eigener Form und
     sichtbarem Ausbau (scripts/hangar/schiffe.js), jeder Typ mit
     eigener Waffe, Explosionen beim Ausfall (schlacht-fx.js).
     Hoechstens 60 Einheiten je Seite einzeln; mit sinkendem Leben
     einer Seite fallen ihre Schiffe nach und nach aus.
   - Ziel antippen: Gegner anklicken -> schlacht_ziel (alle 5 s).
   - Spezialangriff: einmal je Runde -> schlacht_spezial.
   - das Prozentbanner unten: Anteil am verbliebenen Leben der
     laufenden Runde; oben Rundennummer und Rundensiege.
   - am Ende das Siegerbanner und die Ruhmeshalle.
   Musik und Klang: schlacht-klang.js (startet beim Oeffnen).

   Alle 3 s holt der Browser den Stand und die neuen Aktionen (fuer
   die Treffer-Effekte); die Datenbank bleibt massgeblich.

   Auf allen anderen Seiten erscheint im Jahr 2100 ein Hinweis, wenn
   eine Schlacht laeuft (#fh-schlacht-hinweis, haengt an body und
   steht in den :not-Listen von 95 und 96).

   Namen von Spielern landen nur per textContent im DOM bzw. per
   fillText im Canvas.
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function ist2100() { return !!(window.fhEpoche && window.fhEpoche.jahr() === 2100); }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }
  function klang() { return window.fhSchlachtKlang || null; }
  function fx() { return window.fhSchlachtFx || null; }
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const ZEIGEN_JE_SEITE = 60;
  const TAKT_MS = 3000;
  const SVG = function (pfade) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";
  };
  /* lucide (ISC): x, volume-2, volume-x */
  const SYM_ZU = SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const SYM_TON_AN = SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>');
  const SYM_TON_AUS = SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>');

  let schlacht = null;       // Zeile aus sternenschlacht
  let einheiten = [];        // Zeilen aus sternenschlacht_einheiten
  let einheitenFuer = null;  // "ID:Runde", zu der einheiten gehoeren
  let stand = null;          // Antwort von schlacht_stand
  let meineUid = null;
  let letzteAktion = 0;      // hoechste gesehene Aktions-ID
  let wellen = [];           // Spezial-Wellen { seite, wirkung, t0, farbe }
  let ziel = null;           // uid des gewaehlten Gegners
  let zielBereit = 0;        // ms-Zeitpunkt, ab dem wieder geschossen werden darf
  let spezialGenutzt = false;
  let takt = null, bild = 0;
  let canvas = null, ctx = null, layout = [];
  let feldB = 0, feldH = 0, dpr = 1;
  let ruhm = [];
  let lebendVorher = null;   // Set der UIDs, die im letzten Bild noch flogen
  let schussKonto = 0, letztesBild = 0;
  let vorherigeSeite = "home";
  let siegGespielt = null;

  /* ------------------------------------------------------
     DATEN
  ------------------------------------------------------ */
  async function q(fn) {
    const { data, error } = await withSupabaseRlsColdStartRetry(fn);
    if (error) throw error;
    return data;
  }

  async function letzteSchlacht() {
    return q(function () {
      return supabaseClient.from("sternenschlacht").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
    });
  }

  function istKi(uid) { return String(uid || "").indexOf("ki-") === 0; }

  /* Beginn der laufenden Runde (Schlachten aus 49: der Start). */
  function rundeStart() {
    return (schlacht && (schlacht.runde_at || schlacht.start_at)) || new Date().toISOString();
  }

  function seitenName(seite) {
    return seite === "menschen" ? t("seiten.menschen.name", "Die Erdflotte") : t("seiten.aliens.name", "Der Schwarm");
  }

  /* Neue Runde: wer hat die letzte gewonnen? */
  function rundeGemeldet() {
    const lr = stand && stand.letzte_runde;
    if (!lr || !seiteOffen()) return;
    const text = lr.sieger === "unentschieden"
      ? t("schlacht.rundeRemis", "Runde {n}: unentschieden.").replace("{n}", lr.nr)
      : t("schlacht.rundeSieg", "Runde {n} geht an {seite}!").replace("{n}", lr.nr).replace("{seite}", seitenName(lr.sieger).replace(/^(Die|Der|The) /, function (m) { return m.toLowerCase(); }));
    status(text + " " + t("schlacht.rundeNeu", "Die Flotten formieren sich neu."), false);
    ["menschen", "aliens"].forEach(function (s2) {
      wellen.push({ seite: s2, wirkung: "heilung", t0: performance.now(), farbe: "#55c878" });
    });
    if (klang()) klang().akzent("runde");
  }

  async function laden() {
    if (!dbDa()) return;
    try {
      if (typeof wheelAuthReady !== "undefined") meineUid = await wheelAuthReady;
      const s = await letzteSchlacht();
      schlacht = s || null;
      /* Erst der Stand: schlacht_stand wechselt die Runde, wenn eine
         Seite bei 0 ist - danach gelten Runde und Aufstellung neu. */
      if (schlacht) stand = await q(function () { return supabaseClient.rpc("schlacht_stand", { p_id: schlacht.id }); });
      if (stand && stand.ok && schlacht && stand.id === schlacht.id) {
        if (stand.status === "vorbei" && schlacht.status === "laeuft") schlacht.status = "vorbei";
        if (stand.ende_at) schlacht.ende_at = stand.ende_at;
        if (stand.runde) { schlacht.runde = stand.runde; schlacht.runde_at = stand.runde_at; }
      }
      /* Einheiten je Schlacht und Runde einmal laden - nicht an
         schlacht haengen, das setzt auch die Hinweis-Pruefung
         (hinweisPruefen). */
      const schluessel = schlacht ? schlacht.id + ":" + (schlacht.runde || 1) : null;
      if (schlacht && einheitenFuer !== schluessel) {
        const id = schlacht.id;
        const neueRunde = einheitenFuer && einheitenFuer.split(":")[0] === String(id);
        einheiten = (await q(function () {
          return supabaseClient.from("sternenschlacht_einheiten")
            .select("firebase_uid, nickname, seite, typ, leben, schaden, spezial, spezial_at").eq("schlacht_id", id);
        }) || []).map(function (e) {
          return istKi(e.firebase_uid) ? Object.assign({}, e, { nickname: t("schlacht.ki", "Übungsflotte") }) : e;
        });
        einheitenFuer = schluessel;   // erst nach dem Erfolg - sonst beim naechsten Takt neu versuchen
        if (!neueRunde) letzteAktion = 0;
        wellen = [];
        if (fx()) fx().leeren();
        ziel = null;
        const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
        spezialGenutzt = !!(ich && ich.spezial_at && Date.parse(ich.spezial_at) >= Date.parse(rundeStart()));
        layoutBauen();
        if (neueRunde) rundeGemeldet();
      }
      if (!schlacht || schlacht.status !== "laeuft" || !ruhm.length) ruhm = await q(function () {
        return supabaseClient.from("sternenschlacht").select("id, start_at, sieger, endstand_menschen, ruhm, endlos, punkte_menschen, punkte_aliens")
          .eq("status", "vorbei").order("id", { ascending: false }).limit(12);
      }) || [];
    } catch (err) {
      console.warn("Sternenschlacht: Laden fehlgeschlagen:", err);
    }
  }

  async function aktionenHolen() {
    if (!schlacht || !dbDa()) return;
    try {
      const neu = await q(function () {
        return supabaseClient.from("sternenschlacht_aktionen")
          .select("id, firebase_uid, seite, art, typ, ziel_uid, wirkung, betroffen, wert")
          .eq("schlacht_id", schlacht.id).gt("id", letzteAktion).order("id").limit(200);
      }) || [];
      const erstesMal = letzteAktion === 0;
      neu.forEach(function (a) {
        letzteAktion = Math.max(letzteAktion, a.id);
        if (!erstesMal && a.firebase_uid !== meineUid) effektFuer(a);
      });
    } catch (err) {
      console.warn("Sternenschlacht: Aktionen fehlgeschlagen:", err);
    }
  }

  /* ------------------------------------------------------
     SCHLACHTFELD
  ------------------------------------------------------ */
  /* FNV-1a mit Schluss-Durchmischung (murmur3 fmix32): aehnliche IDs
     wie "m1", "m2" landen sonst fast an derselben Stelle. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function layoutBauen() {
    layout = [];
    lebendVorher = null;
    ["menschen", "aliens"].forEach(function (seite) {
      let liste = einheiten.filter(function (e) { return e.seite === seite; })
        .sort(function (a, b) { return b.leben - a.leben || (a.firebase_uid < b.firebase_uid ? -1 : 1); });
      const ich = liste.find(function (e) { return e.firebase_uid === meineUid; });
      liste = liste.slice(0, ZEIGEN_JE_SEITE);
      if (ich && liste.indexOf(ich) === -1) liste[liste.length - 1] = ich;
      const max = Math.max.apply(null, liste.map(function (e) { return e.leben; }).concat([1]));
      liste.forEach(function (e, i) {
        const h1 = hash(e.firebase_uid), h2 = hash(e.firebase_uid + "y");
        const stufen = istKi(e.firebase_uid) || !window.fhSchiffe ? { leben: 0, schaden: 0, spezial: 0 } : window.fhSchiffe.stufenAus(e);
        layout.push({
          e: e, seite: seite, i: i, anzahl: liste.length,
          tiefe: h1, quer: h2,
          g: 0.8 + 0.4 * Math.sqrt(e.leben / max),
          phase: h1 * 6.28,
          stufen: stufen,
          trefferT: 0,
        });
      });
    });
  }

  function lebendig(p) {
    if (!stand) return true;
    const rest = stand[p.seite] ? Number(stand[p.seite].rest) : 1;
    /* Die Schiffe mit dem kleinsten Index halten am laengsten durch;
       die eigene Einheit bleibt bis zum Schluss sichtbar. */
    if (p.e.firebase_uid === meineUid) return rest > 0;
    return p.i < Math.ceil(rest * p.anzahl);
  }

  function hochkant() { return feldH > feldB * 1.1; }

  /* Groesse eines Schiffs (Breite der 260er-Box) in CSS-Pixeln. */
  function schiffBreite(p) {
    const n = Math.max(1, p.anzahl);
    const flaeche = feldB * feldH * 0.3;
    const basis = Math.sqrt(flaeche / n) * 1.25;
    const b = Math.max(30, Math.min(170, basis)) * p.g;
    return p.e.firebase_uid === meineUid ? Math.max(b, 54) : b;
  }

  function pos(p, jetzt) {
    if (!p || p.x != null) return p;    // fester Punkt
    const ruhig = RUHIG.matches ? 0 : 1;
    const w = feldB, h = feldH;
    let x, y, winkel;
    const wobX = Math.sin(jetzt * 0.0004 + p.phase) * 10 * ruhig;
    const wobY = Math.cos(jetzt * 0.0003 + p.phase * 1.3) * 7 * ruhig;
    const neigung = -Math.sin(jetzt * 0.0003 + p.phase * 1.3) * 0.08 * ruhig;
    if (!hochkant()) {
      x = (p.seite === "menschen" ? 0.06 + p.tiefe * 0.34 : 0.94 - p.tiefe * 0.34) * w + wobX;
      y = (0.1 + p.quer * 0.8) * h + wobY;
      winkel = (p.seite === "menschen" ? 0 : Math.PI) + neigung;
    } else {
      x = (0.08 + p.quer * 0.84) * w + wobY;
      y = (p.seite === "menschen" ? 0.92 - p.tiefe * 0.34 : 0.08 + p.tiefe * 0.34) * h + wobX;
      winkel = (p.seite === "menschen" ? -Math.PI / 2 : Math.PI / 2) + neigung;
    }
    return { x: x, y: y, winkel: winkel };
  }

  function findeUid(uid) { return layout.find(function (p) { return p.e.firebase_uid === uid; }); }

  function beimTreffer(nach, art) {
    if (art !== "reparatur" && nach && nach.e) nach.trefferT = performance.now();
    if (klang() && Math.random() < 0.25) klang().sfx("treffer");
  }

  function schussVon(von, nach, stark) {
    if (!fx() || !von || !nach) return;
    fx().schuss(von, nach, { typ: von.e.typ, seite: von.seite, stark: stark, beimTreffer: beimTreffer });
    if (klang() && (stark || Math.random() < 0.3)) klang().sfx(fx().WAFFEN[von.e.typ] || "laser", stark);
  }

  function effektFuer(a) {
    const von = findeUid(a.firebase_uid);
    const nach = a.ziel_uid ? findeUid(a.ziel_uid) : null;
    if (a.art === "ziel" && von && nach) schussVon(von, nach, true);
    if (a.art === "spezial") {
      wellen.push({ seite: a.betroffen, wirkung: a.wirkung, t0: performance.now(), farbe: a.seite === "menschen" ? "#6fd3ff" : "#9dff6a" });
      if (klang()) klang().akzent("spezial");
    }
  }

  /* Dauerfeuer: je Sekunde ein paar Schuesse zwischen lebenden
     Schiffen, jeder mit der Waffe seines Typs. Traeger heilen. */
  function dauerfeuer(lebende, dt) {
    if (RUHIG.matches || !lebende.length) return;
    const rate = Math.min(9, 1.5 + lebende.length / 10);
    schussKonto += dt / 1000 * rate;
    let n = 0;
    while (schussKonto >= 1 && n < 4) {
      schussKonto -= 1; n++;
      const von = lebende[Math.floor(Math.random() * lebende.length)];
      const eigene = lebende.filter(function (p) { return p.seite === von.seite && p !== von; });
      const gegner = lebende.filter(function (p) { return p.seite !== von.seite; });
      const pool = von.e.typ === "traeger" && eigene.length ? eigene : gegner;
      if (!pool.length) continue;
      schussVon(von, pool[Math.floor(Math.random() * pool.length)], false);
    }
    if (schussKonto > 3) schussKonto = 0;
  }

  function sterne(jetzt) {
    for (let i = 0; i < 120; i++) {
      const sx = hash("s" + i) * feldB, sy = hash("t" + i) * feldH;
      const funkel = RUHIG.matches ? 0.5 : 0.5 + 0.5 * Math.sin(jetzt * 0.001 + i);
      ctx.fillStyle = "rgba(220,230,255," + (0.15 + 0.45 * hash("a" + i) * funkel) + ")";
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1.3, i % 9 === 0 ? 2 : 1.3);
    }
  }

  function zeichnen(jetzt) {
    if (!ctx || !canvas) return;
    const dt = letztesBild ? Math.min(100, jetzt - letztesBild) : 16;
    letztesBild = jetzt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, feldB, feldH);
    sterne(jetzt);

    const laeuft = schlacht && schlacht.status === "laeuft";
    const lebende = layout.filter(lebendig);

    /* Ausgefallene Schiffe explodieren. */
    const jetztLebend = new Set(lebende.map(function (p) { return p.e.firebase_uid; }));
    if (lebendVorher && laeuft) {
      layout.forEach(function (p) {
        if (lebendVorher.has(p.e.firebase_uid) && !jetztLebend.has(p.e.firebase_uid)) {
          const P = pos(p, jetzt);
          if (fx()) fx().explosion(P.x, P.y, p.seite, schiffBreite(p) * 0.35);
          if (klang()) klang().sfx("explosion");
        }
      });
    }
    lebendVorher = jetztLebend;

    if (laeuft) dauerfeuer(lebende, dt);

    /* Schiffe */
    lebende.forEach(function (p) {
      const P = pos(p, jetzt);
      const breite = schiffBreite(p);
      const treffer = p.trefferT ? Math.max(0, 1 - (jetzt - p.trefferT) / 380) : 0;
      if (window.fhSchiffe) {
        window.fhSchiffe.zeichnen(ctx, {
          typ: p.e.typ, seite: p.seite, stufen: p.stufen, x: P.x, y: P.y, winkel: P.winkel,
          breite: breite, dpr: dpr, zeit: jetzt, phase: p.phase, treffer: treffer, ruhig: RUHIG.matches,
        });
      }
      const ich = p.e.firebase_uid === meineUid, gezielt = p.e.firebase_uid === ziel;
      if (ich || gezielt) {
        const r = breite * 0.46 + 6;
        ctx.strokeStyle = ich ? "#f0c96a" : "#ff6a6a";
        ctx.lineWidth = 2;
        ctx.setLineDash(gezielt ? [5, 4] : []);
        ctx.beginPath();
        ctx.arc(P.x, P.y, r, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ich ? "#f0c96a" : "#ff9a9a";
        ctx.font = "600 12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ich ? t("schlacht.du", "Du") : (p.e.nickname || "?"), P.x, P.y - r - 6);
      }
    });

    if (fx()) fx().zeichnen(ctx, pos, jetzt);

    /* Spezial-Wellen */
    wellen = wellen.filter(function (fw) { return jetzt - fw.t0 < 900; });
    wellen.forEach(function (fw) {
      const f = (jetzt - fw.t0) / 900;
      let cx = fw.seite === "menschen" ? feldB * 0.25 : feldB * 0.75, cy = feldH / 2;
      if (hochkant()) { cx = feldB / 2; cy = fw.seite === "menschen" ? feldH * 0.75 : feldH * 0.25; }
      ctx.strokeStyle = fw.wirkung === "heilung" ? "#55c878" : fw.farbe;
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 40 + f * Math.max(feldB, feldH) * 0.3, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  function schleife(jetzt) {
    if (!seiteOffen() || !canvas) { bild = 0; return; }
    bild = requestAnimationFrame(schleife);
    zeichnen(jetzt);
    knoepfeAuffrischen();
  }

  function canvasEinpassen() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    feldB = Math.max(1, r.width);
    feldH = Math.max(1, r.height);
    canvas.width = Math.round(feldB * dpr);
    canvas.height = Math.round(feldH * dpr);
  }

  function klickAufFeld(ev) {
    if (!schlacht || schlacht.status !== "laeuft") return;
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    const jetzt = performance.now();
    let best = null, bestD = Infinity;
    layout.filter(lebendig).forEach(function (p) {
      if (ich && p.seite === ich.seite) return;
      const P = pos(p, jetzt);
      const d = Math.hypot(P.x - mx, P.y - my);
      if (d < Math.max(44, schiffBreite(p) * 0.6) && d < bestD) { bestD = d; best = p; }
    });
    if (!best) return;
    ziel = best.e.firebase_uid;
    schiessen();
  }

  /* ------------------------------------------------------
     AKTIONEN
  ------------------------------------------------------ */
  const GRUENDE = {
    "keine-schlacht": ["schlacht.fehler.keine", "Gerade läuft keine Schlacht."],
    "vorbei": ["schlacht.fehler.vorbei", "Die Schlacht ist vorbei."],
    "nicht-dabei": ["schlacht.fehler.dabei", "Du kämpfst noch nicht mit – wähle eine Seite, dann bist du ab der nächsten Runde dabei."],
    "naechste-runde": ["schlacht.fehler.runde", "Du steigst in der nächsten Runde ein."],
    "zu-schnell": ["schlacht.fehler.schnell", "Deine Waffen laden noch."],
    "falsches-ziel": ["schlacht.fehler.ziel", "Wähle ein gegnerisches Schiff."],
    "schon": ["schlacht.fehler.schon", "Dein Spezialangriff ist in dieser Runde schon verbraucht."],
    "laedt": ["schlacht.fehler.laedt", "Dein Spezialangriff lädt noch."],
    "gesperrt": ["schlacht.fehler.gesperrt", "Dein Konto ist gesperrt."],
  };
  function status(text, istFehler) {
    const s = document.getElementById("schlacht-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }
  function fehler(grund) {
    const g = GRUENDE[grund];
    status(g ? t(g[0], g[1]) : t("schlacht.fehler.allgemein", "⚠️ Das hat nicht geklappt."), true);
  }

  async function rpc(name, args) {
    if (!angemeldet()) { status(t("schlacht.anmelden", "Melde dich an, um mitzukämpfen."), true); return null; }
    return q(function () { return supabaseClient.rpc(name, args); });
  }

  async function schiessen() {
    if (!ziel || performance.now() < zielBereit) return;
    zielBereit = performance.now() + 5000;
    try {
      const erg = await rpc("schlacht_ziel", { p_ziel_uid: ziel });
      if (!erg) return;
      if (erg.ok) {
        schussVon(findeUid(meineUid), findeUid(ziel), true);
        status(t("schlacht.treffer", "Treffer!") + " −" + Math.round(erg.wert) + (erg.fokus ? " · " + t("schlacht.fokus", "Fokusfeuer") + " +" + Math.min(50, erg.fokus * 10) + " %" : ""), false);
      } else {
        if (erg.grund !== "zu-schnell") zielBereit = 0;
        fehler(erg.grund);
      }
    } catch (err) {
      zielBereit = 0;
      console.warn("Sternenschlacht: Ziel fehlgeschlagen:", err);
      fehler(null);
    }
  }

  async function spezial() {
    try {
      const erg = await rpc("schlacht_spezial", { p_ziel_uid: ziel });
      if (!erg) return;
      if (erg.ok) {
        spezialGenutzt = true;
        const ich = findeUid(meineUid);
        if (ich) {
          const gegner = ich.seite === "menschen" ? "aliens" : "menschen";
          const trifft = erg.wirkung === "schaden" || Number(erg.faktor) > 1;
          wellen.push({ seite: trifft ? gegner : ich.seite, wirkung: erg.wirkung, t0: performance.now(), farbe: "#f0c96a" });
        }
        if (klang()) klang().akzent("spezial");
        status(t("schlacht.spezialLos", "Spezialangriff ausgelöst!"), false);
      } else {
        if (erg.grund === "schon") spezialGenutzt = true;
        fehler(erg.grund);
      }
    } catch (err) {
      console.warn("Sternenschlacht: Spezial fehlgeschlagen:", err);
      fehler(null);
    }
  }

  /* ------------------------------------------------------
     ANZEIGE
  ------------------------------------------------------ */
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  function seiteOffen() {
    const s = document.getElementById("sternenschlacht");
    return !!(s && s.classList.contains("active-page"));
  }

  function restZeit() {
    if (!schlacht) return "";
    if (!schlacht.ende_at) return t("schlacht.runde", "Runde") + " " + (schlacht.runde || 1);
    const ms = Math.max(0, Date.parse(schlacht.ende_at) - Date.now());
    return String(Math.floor(ms / 60000)).padStart(2, "0") + ":" + String(Math.floor(ms % 60000 / 1000)).padStart(2, "0");
  }

  function bannerAuffrischen() {
    const b = document.getElementById("schlacht-banner");
    if (!b || !stand || !stand.ok) return;
    const pm = Math.max(0, Math.min(100, Number(stand.prozent_menschen)));
    b.querySelector(".sl-banner-m").style.width = pm + "%";
    b.querySelector(".sl-banner-a").style.width = (100 - pm) + "%";
    const gm = Math.round(pm);   // ganze Prozent, die zusammen 100 ergeben
    b.querySelector(".sl-banner-zahl-m").textContent = gm + " %";
    b.querySelector(".sl-banner-zahl-a").textContent = (100 - gm) + " %";
    b.setAttribute("aria-label", t("seiten.menschen.volk", "Menschen") + " " + gm + " %, " + t("seiten.aliens.volk", "Aliens") + " " + (100 - gm) + " %");
    /* Musik: Spannung, sobald eine Seite unter 25 % ihres Lebens faellt. */
    const rm = stand.menschen ? Number(stand.menschen.rest) : 1, ra = stand.aliens ? Number(stand.aliens.rest) : 1;
    const knapp = Math.min(rm, ra);
    if (klang()) klang().spannung(knapp < 0.25 ? 0.5 + 2 * (0.25 - knapp) : 0.1);
  }

  function knoepfeAuffrischen() {
    const uhr = document.getElementById("schlacht-uhr");
    if (uhr && schlacht && schlacht.status === "laeuft") uhr.textContent = restZeit();
    const punkte = document.getElementById("schlacht-punkte");
    if (punkte && stand && stand.ok && stand.endlos) {
      const pm = stand.punkte_menschen || 0, pa = stand.punkte_aliens || 0;
      punkte.textContent = pm + " : " + pa;
      punkte.setAttribute("aria-label", t("schlacht.rundensiege", "Rundensiege") + ": " + t("seiten.menschen.volk", "Menschen") + " " + pm + ", " + t("seiten.aliens.volk", "Aliens") + " " + pa);
    }
    const k = document.getElementById("schlacht-spezial");
    if (!k) return;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    if (!ich) { k.hidden = true; return; }
    k.hidden = false;
    const warten = ich.seite === "menschen" ? 60000 : 30000;
    const ab = Date.parse(rundeStart()) + warten;
    const name = t("hangar.typ." + ich.typ + ".spezial", (HANGAR_TYPEN[ich.typ] || {}).spezial || "Spezial");
    if (spezialGenutzt) { k.disabled = true; k.textContent = name + " · " + t("schlacht.verbraucht", "verbraucht"); }
    else if (Date.now() < ab) { k.disabled = true; k.textContent = name + " · " + Math.ceil((ab - Date.now()) / 1000) + " s"; }
    else { k.disabled = false; k.textContent = name + " · " + t("schlacht.bereit", "bereit!"); }
    const z = document.getElementById("schlacht-ziel-info");
    if (z) {
      const cd = Math.ceil((zielBereit - performance.now()) / 1000);
      z.textContent = cd > 0 ? t("schlacht.laedt", "Waffen laden") + " … " + cd + " s" : t("schlacht.tipp", "Tippe ein gegnerisches Schiff an, um es zu beschießen.");
    }
  }

  function ruhmZeigen(ziel2) {
    const box = el("section", "sl-ruhm");
    box.appendChild(el("h2", "sl-ruhm-titel", t("schlacht.ruhm", "Ruhmeshalle")));
    if (!ruhm.length) { box.appendChild(el("p", "sl-leer", t("schlacht.ruhmLeer", "Noch keine Schlacht geschlagen."))); ziel2.appendChild(box); return; }
    const liste = el("ol", "sl-ruhm-liste");
    ruhm.forEach(function (r) {
      const li = el("li", "sl-ruhm-eintrag ist-" + (r.sieger || "unentschieden"));
      const datum = new Date(r.start_at).toLocaleDateString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      const sieger = r.sieger === "menschen" ? t("seiten.menschen.name", "Die Erdflotte") : r.sieger === "aliens" ? t("seiten.aliens.name", "Der Schwarm") : t("schlacht.unentschieden", "Unentschieden");
      const kopf = el("div", "sl-ruhm-kopf");
      kopf.append(el("span", "sl-ruhm-datum", datum), el("strong", "sl-ruhm-sieger", sieger),
        el("span", "sl-ruhm-stand", r.endlos ? rundenText(r.punkte_menschen, r.punkte_aliens) : standText(r.endstand_menschen)));
      li.appendChild(kopf);
      const helden = el("p", "sl-ruhm-helden");
      ["menschen", "aliens"].forEach(function (s) {
        ((r.ruhm && r.ruhm[s]) || []).forEach(function (hd) {
          const span = el("span", "sl-held ist-" + s);
          span.textContent = (hd.nickname || "?") + " · " + Math.round(hd.schaden);
          helden.appendChild(span);
        });
      });
      if (helden.childNodes.length) li.appendChild(helden);
      liste.appendChild(li);
    });
    box.appendChild(liste);
    ziel2.appendChild(box);
  }

  /* ------------------------------------------------------
     VOLLBILD-BUEHNE
  ------------------------------------------------------ */
  function buehne() {
    let b = document.getElementById("fh-schlacht-buehne");
    if (b) return b;
    b = el("div", "sl-buehne");
    b.id = "fh-schlacht-buehne";
    b.hidden = true;
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-modal", "true");
    b.setAttribute("aria-labelledby", "sl-buehne-titel");

    const kopf = el("div", "sl-buehne-kopf");
    const titel = el("div", "sl-buehne-titel");
    const h = el("h2", null, t("schlacht.titel", "Sternenschlacht"));
    h.id = "sl-buehne-titel";
    titel.append(el("span", "sl-buehne-kicker", t("hangar.kicker", "Jahr 2100")), h);
    const lage = el("div", "sl-buehne-lage");
    lage.id = "schlacht-lage";
    const ton = el("button", "sl-rund-knopf sl-ton");
    ton.type = "button";
    ton.id = "schlacht-ton";
    ton.addEventListener("click", function () {
      const k = klang();
      if (!k) return;
      k.setzeAn(!k.istAn());
      tonKnopf();
    });
    const zu = el("button", "sl-rund-knopf sl-zu");
    zu.type = "button";
    zu.setAttribute("aria-label", t("schlacht.schliessen", "Schlacht verlassen"));
    zu.title = t("schlacht.schliessen", "Schlacht verlassen");
    zu.innerHTML = SYM_ZU;   // festes SVG, keine Nutzerdaten
    zu.addEventListener("click", verlassen);
    kopf.append(titel, lage, ton, zu);

    const inhalt = el("div", "sl-buehne-inhalt");
    inhalt.id = "schlacht-inhalt";
    b.append(kopf, inhalt);
    document.body.appendChild(b);
    tonKnopf();
    return b;
  }

  /* Texte im Kopf - auch nach einem Sprachwechsel (i18n.js baut die
     offene Schlachtseite dann neu auf). */
  function kopfTexte() {
    const h = document.getElementById("sl-buehne-titel");
    if (h) h.textContent = t("schlacht.titel", "Sternenschlacht");
    const k = document.querySelector("#fh-schlacht-buehne .sl-buehne-kicker");
    if (k) k.textContent = t("hangar.kicker", "Jahr 2100");
    const zu = document.querySelector("#fh-schlacht-buehne .sl-zu");
    if (zu) { zu.setAttribute("aria-label", t("schlacht.schliessen", "Schlacht verlassen")); zu.title = zu.getAttribute("aria-label"); }
    tonKnopf();
  }

  function tonKnopf() {
    const k = document.getElementById("schlacht-ton");
    if (!k) return;
    const an = !!(klang() && klang().istAn());
    k.innerHTML = an ? SYM_TON_AN : SYM_TON_AUS;   // festes SVG
    k.setAttribute("aria-pressed", an ? "true" : "false");
    k.setAttribute("aria-label", an ? t("schlacht.tonAus", "Ton ausschalten") : t("schlacht.tonAn", "Ton einschalten"));
    k.title = k.getAttribute("aria-label");
  }

  function buehneOeffnen() {
    const b = buehne();
    if (!b.hidden) return;
    b.hidden = false;
    document.documentElement.classList.add("fh-schlacht-offen");
    document.addEventListener("keydown", tasten);
    const zu = b.querySelector(".sl-zu");
    if (zu) zu.focus({ preventScroll: true });
    if (klang()) klang().start();
    tonKnopf();
  }

  function buehneSchliessen() {
    const b = document.getElementById("fh-schlacht-buehne");
    if (!b || b.hidden) return;
    b.hidden = true;
    document.documentElement.classList.remove("fh-schlacht-offen");
    document.removeEventListener("keydown", tasten);
    cancelAnimationFrame(bild); bild = 0;
    if (klang()) klang().stop();
  }

  function tasten(ev) { if (ev.key === "Escape") verlassen(); }

  function verlassen() {
    const ziel2 = vorherigeSeite && vorherigeSeite !== "sternenschlacht" ? vorherigeSeite : "home";
    if (typeof changePage === "function") changePage(ziel2);
    else buehneSchliessen();
  }

  function lageZeigen(laeuft) {
    const lage = document.getElementById("schlacht-lage");
    if (!lage) return;
    lage.replaceChildren();
    if (!laeuft) return;
    const punkte = el("span", "sl-punkte");
    punkte.id = "schlacht-punkte";
    punkte.title = t("schlacht.rundensiege", "Rundensiege");
    const uhr = el("span", "sl-uhr");
    uhr.id = "schlacht-uhr";
    uhr.textContent = restZeit();
    lage.append(el("span", "sl-live", t("schlacht.live", "Live")), punkte, uhr);
  }

  function aufbauen() {
    buehne();
    kopfTexte();
    const ziel2 = document.getElementById("schlacht-inhalt");
    if (!ziel2) return;
    ziel2.replaceChildren();
    ziel2.classList.remove("ist-feld");
    canvas = ctx = null;
    cancelAnimationFrame(bild); bild = 0;

    if (!ist2100()) {
      lageZeigen(false);
      ziel2.appendChild(hinweisBox(t("schlacht.zu.titel", "Keine Schlacht in Sicht"), t("schlacht.zu.text", "Die Sternenschlacht gibt es nur im Jahr 2100.")));
      return;
    }
    if (!schlacht || schlacht.status !== "laeuft") {
      lageZeigen(false);
      if (schlacht && schlacht.status === "vorbei" && stand && stand.ok && Date.now() - Date.parse(schlacht.ende_at) < 10 * 60000) {
        ziel2.appendChild(siegerBanner());
        if (siegGespielt !== schlacht.id && klang()) { siegGespielt = schlacht.id; klang().akzent("sieg"); }
      } else {
        ziel2.appendChild(hinweisBox(t("schlacht.ruhig.titel", "Ruhe im All"), t("schlacht.ruhig.text", "Gerade läuft keine Sternenschlacht. Ändii startet sie live – rüste bis dahin im Hangar auf.")));
      }
      ruhmZeigen(ziel2);
      return;
    }

    lageZeigen(true);
    ziel2.classList.add("ist-feld");
    const feld = el("div", "sl-feld");
    canvas = el("canvas", "sl-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("schlacht.feldAria", "Schlachtfeld: Menschen links, Aliens rechts"));
    canvas.addEventListener("click", klickAufFeld);
    feld.appendChild(canvas);

    const fuss = el("div", "sl-fuss");
    const banner = el("div", "sl-banner");
    banner.id = "schlacht-banner";
    banner.setAttribute("role", "img");
    const m = el("div", "sl-banner-m"), a = el("div", "sl-banner-a");
    m.append(el("span", "sl-banner-name", t("seiten.menschen.volk", "Menschen")), el("span", "sl-banner-zahl-m"));
    a.append(el("span", "sl-banner-zahl-a"), el("span", "sl-banner-name", t("seiten.aliens.volk", "Aliens")));
    banner.append(m, a);

    const steuer = el("div", "sl-steuer");
    const info = el("p", "sl-ziel-info");
    info.id = "schlacht-ziel-info";
    const sp = el("button", "sl-spezial");
    sp.type = "button";
    sp.id = "schlacht-spezial";
    sp.hidden = true;
    sp.addEventListener("click", spezial);
    steuer.append(info, sp);
    const st = el("p", "sl-status");
    st.id = "schlacht-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");

    if (!einheiten.some(function (e) { return e.firebase_uid === meineUid; })) {
      st.textContent = angemeldet() ? t("schlacht.fehler.dabei", "Du kämpfst noch nicht mit – wähle eine Seite, dann bist du ab der nächsten Runde dabei.") : t("schlacht.anmelden", "Melde dich an, um mitzukämpfen.");
    }

    fuss.append(banner, steuer, st);
    ziel2.append(feld, fuss);
    ctx = canvas.getContext("2d");
    canvasEinpassen();
    bannerAuffrischen();
    knoepfeAuffrischen();
    letztesBild = 0;
    bild = requestAnimationFrame(schleife);
  }

  /* "58 % : 42 %" - ganze Prozent, die zusammen 100 ergeben. */
  function standText(prozentMenschen) {
    const m = Math.round(Number(prozentMenschen) || 0);
    return m + " % : " + (100 - m) + " %";
  }

  /* "2 : 1 Runden" - Rundensiege einer endlosen Schlacht. */
  function rundenText(pm, pa) {
    return (pm || 0) + " : " + (pa || 0) + " " + t("schlacht.runden", "Runden");
  }

  function hinweisBox(titel, text) {
    const b = el("div", "sl-hinweis");
    b.append(el("h2", "sl-hinweis-titel", titel), el("p", "sl-hinweis-text", text));
    return b;
  }

  function siegerBanner() {
    const s = stand.sieger;
    const b = el("div", "sl-sieger ist-" + (s || "unentschieden"));
    const name = s === "menschen" ? t("seiten.menschen.name", "Die Erdflotte") : s === "aliens" ? t("seiten.aliens.name", "Der Schwarm") : null;
    b.append(
      el("p", "sl-sieger-kicker", t("schlacht.ende", "Die Schlacht ist geschlagen")),
      el("h2", "sl-sieger-titel", name ? name + " " + t("schlacht.siegt", "siegt!") : t("schlacht.unentschieden", "Unentschieden")),
      el("p", "sl-sieger-stand", stand.endlos ? rundenText(stand.punkte_menschen, stand.punkte_aliens) : standText(stand.prozent_menschen))
    );
    if (!RUHIG.matches) {
      const funken = el("div", "sl-funken");
      funken.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 24; i++) {
        const f = el("span");
        f.style.setProperty("--x", (hash("fx" + i) * 100) + "%");
        f.style.setProperty("--d", (hash("fd" + i) * 1.8).toFixed(2) + "s");
        funken.appendChild(f);
      }
      b.appendChild(funken);
    }
    return b;
  }

  /* ------------------------------------------------------
     TAKT, SEITE, HINWEIS
  ------------------------------------------------------ */
  async function tick() {
    const vorher = schlacht ? schlacht.status : null, vorherId = schlacht ? schlacht.id : null;
    await laden();
    await aktionenHolen();
    const wechsel = !schlacht || schlacht.status !== vorher || schlacht.id !== vorherId;
    if (seiteOffen()) {
      if (wechsel || !canvas) aufbauen();
      else bannerAuffrischen();
    }
    hinweisAuffrischen();
  }

  function taktStarten() {
    clearInterval(takt);
    takt = setInterval(function () {
      if (!seiteOffen()) { clearInterval(takt); takt = null; return; }
      tick();
    }, TAKT_MS);
  }

  /* main.js ruft das bei JEDEM Seitenwechsel mit der neuen Seite auf -
     so merkt sich die Buehne, wohin X zurueckfuehrt, und schliesst
     sich, sobald eine andere Seite offen ist. */
  window.updateSternenschlachtPage = function (pageID) {
    if (pageID !== "sternenschlacht") {
      vorherigeSeite = pageID;
      buehneSchliessen();
      return;
    }
    buehneOeffnen();
    aufbauen();
    tick().then(function () { if (seiteOffen()) aufbauen(); });
    taktStarten();
    hinweisAuffrischen();
  };

  /* Hinweis auf allen anderen Seiten: nur in 2100, nur wenn eine
     Schlacht laeuft. Alle 30 s ein leichter Blick in die Tabelle. */
  function hinweisAuffrischen() {
    let h = document.getElementById("fh-schlacht-hinweis");
    const zeigen = ist2100() && schlacht && schlacht.status === "laeuft"
      && (!schlacht.ende_at || Date.parse(schlacht.ende_at) > Date.now()) && !seiteOffen();
    if (!zeigen) { if (h) h.remove(); return; }
    if (h) return;
    h = el("div", "fh-schlacht-hinweis");
    h.id = "fh-schlacht-hinweis";
    h.setAttribute("role", "status");
    const k = el("button", "fh-schlacht-hinweis-knopf", t("schlacht.hinweisKnopf", "Jetzt mitkämpfen"));
    k.type = "button";
    k.addEventListener("click", function () { if (typeof changePage === "function") changePage("sternenschlacht"); });
    h.append(el("span", "fh-schlacht-hinweis-punkt"), el("span", "fh-schlacht-hinweis-text", t("schlacht.hinweis", "Sternenschlacht läuft!")), k);
    document.body.appendChild(h);
  }

  async function hinweisPruefen() {
    if (!ist2100() || !dbDa() || seiteOffen()) { hinweisAuffrischen(); return; }
    try {
      const s = await letzteSchlacht();
      if (!schlacht || !s || s.id !== schlacht.id || s.status !== schlacht.status) schlacht = s || null;
    } catch (e) { /* naechstes Mal */ }
    hinweisAuffrischen();
  }

  function navAnpassen() {
    document.querySelectorAll('[data-page="sternenschlacht"]').forEach(function (a) {
      if (a.closest("#sternenschlacht")) return;
      a.classList.toggle("fh-flag-aus", !ist2100());
    });
  }

  document.addEventListener("fh:epoche", function () { navAnpassen(); hinweisPruefen(); if (seiteOffen()) aufbauen(); });
  window.addEventListener("resize", function () { if (seiteOffen()) canvasEinpassen(); });
  window.addEventListener("load", function () { setTimeout(hinweisPruefen, 3000); });
  setInterval(hinweisPruefen, 30000);
  navAnpassen();
})();
