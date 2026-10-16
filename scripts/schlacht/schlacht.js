/* ======================================================
   LIVE-STERNENSCHLACHT (Migration 49)
   ---------------------------------------------------
   Seite #sternenschlacht, nur im Jahr 2100 in der Navigation.
   Der Admin startet die Schlacht; die Datenbank haelt fest, wer
   mitkaempft, und rechnet den Stand (schlacht_stand). Der Browser
   zeigt nur:

   - das Schlachtfeld (Canvas): Menschenschiffe links, Alienschiffe
     rechts, Laserfeuer, Explosionen, die eigene Einheit markiert.
     Es zeigt hoechstens 60 Einheiten je Seite einzeln; der Rest
     fliegt als Pulk mit. Mit sinkendem Leben einer Seite
     verschwinden ihre Schiffe nach und nach.
   - Ziel antippen: Gegner anklicken -> schlacht_ziel (alle 5 s).
   - Spezialangriff: einmal je Schlacht -> schlacht_spezial.
   - das Prozentbanner unten: Anteil am verbliebenen Leben.
   - am Ende das Siegerbanner und die Ruhmeshalle.

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
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const ZEIGEN_JE_SEITE = 60;
  const TAKT_MS = 3000;
  const HUELLE_M = new Path2D("M115 0 L45 -22 L-55 -32 L-100 -19 L-100 19 L-55 32 L45 22 Z");
  const HUELLE_A = new Path2D("M-95 0 C-60 -66 40 -76 95 -32 C55 -22 34 -10 22 0 C34 10 55 22 95 32 C40 76 -60 66 -95 0Z");

  let schlacht = null;       // Zeile aus sternenschlacht
  let einheiten = [];        // Zeilen aus sternenschlacht_einheiten
  let einheitenFuer = null;  // ID der Schlacht, zu der einheiten gehoeren
  let stand = null;          // Antwort von schlacht_stand
  let meineUid = null;
  let letzteAktion = 0;      // hoechste gesehene Aktions-ID
  let effekte = [];          // { art, von, nach, t0, farbe }
  let ziel = null;           // uid des gewaehlten Gegners
  let zielBereit = 0;        // ms-Zeitpunkt, ab dem wieder geschossen werden darf
  let spezialGenutzt = false;
  let takt = null, bild = 0, hinweisUhr = null;
  let canvas = null, ctx = null, layout = [];
  let ruhm = [];

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

  async function laden() {
    if (!dbDa()) return;
    try {
      if (typeof wheelAuthReady !== "undefined") meineUid = await wheelAuthReady;
      const s = await letzteSchlacht();
      schlacht = s || null;
      /* Einheiten je Schlacht einmal laden - nicht an schlacht haengen,
         das setzt auch die Hinweis-Pruefung (hinweisPruefen). */
      if (schlacht && einheitenFuer !== schlacht.id) {
        const id = schlacht.id;
        einheiten = await q(function () {
          return supabaseClient.from("sternenschlacht_einheiten")
            .select("firebase_uid, nickname, seite, typ, leben, schaden, spezial_at").eq("schlacht_id", id);
        }) || [];
        einheitenFuer = id;   // erst nach dem Erfolg - sonst beim naechsten Takt neu versuchen
        letzteAktion = 0;
        effekte = [];
        ziel = null;
        const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
        spezialGenutzt = !!(ich && ich.spezial_at);
        layoutBauen();
      }
      if (schlacht) stand = await q(function () { return supabaseClient.rpc("schlacht_stand", { p_id: schlacht.id }); });
      if (stand && stand.status === "vorbei" && schlacht.status === "laeuft") schlacht.status = "vorbei";
      if (!schlacht || schlacht.status !== "laeuft" || !ruhm.length) ruhm = await q(function () {
        return supabaseClient.from("sternenschlacht").select("id, start_at, sieger, endstand_menschen, ruhm")
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
        if (!erstesMal) effektFuer(a);
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
    ["menschen", "aliens"].forEach(function (seite) {
      let liste = einheiten.filter(function (e) { return e.seite === seite; })
        .sort(function (a, b) { return b.leben - a.leben || (a.firebase_uid < b.firebase_uid ? -1 : 1); });
      const ich = liste.find(function (e) { return e.firebase_uid === meineUid; });
      liste = liste.slice(0, ZEIGEN_JE_SEITE);
      if (ich && liste.indexOf(ich) === -1) liste[liste.length - 1] = ich;
      const max = Math.max.apply(null, liste.map(function (e) { return e.leben; }).concat([1]));
      liste.forEach(function (e, i) {
        const h1 = hash(e.firebase_uid), h2 = hash(e.firebase_uid + "y");
        layout.push({
          e: e, seite: seite, i: i, anzahl: liste.length,
          x: seite === "menschen" ? 0.06 + h1 * 0.34 : 0.60 + h1 * 0.34,
          y: 0.12 + h2 * 0.76,
          g: 0.55 + 0.6 * Math.sqrt(e.leben / max),
          phase: h1 * 6.28,
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

  function pos(p, w, h, zeit) {
    const ruhig = RUHIG.matches ? 0 : 1;
    return {
      x: p.x * w + Math.sin(zeit * 0.0004 + p.phase) * 10 * ruhig,
      y: p.y * h + Math.cos(zeit * 0.0003 + p.phase * 1.3) * 7 * ruhig,
    };
  }

  function findeUid(uid) { return layout.find(function (p) { return p.e.firebase_uid === uid; }); }

  function effektFuer(a) {
    const von = findeUid(a.firebase_uid);
    const nach = a.ziel_uid ? findeUid(a.ziel_uid) : null;
    const farbe = a.seite === "menschen" ? "#6fd3ff" : "#9dff6a";
    if (a.art === "ziel" && von && nach) effekte.push({ art: "laser", von: von, nach: nach, t0: performance.now(), farbe: farbe, dick: 4 });
    if (a.art === "spezial") effekte.push({ art: "welle", seite: a.betroffen, wirkung: a.wirkung, t0: performance.now(), farbe: farbe });
  }

  function zeichnen(jetzt) {
    if (!ctx || !canvas) return;
    const w = canvas.width / (window.devicePixelRatio || 1), h = canvas.height / (window.devicePixelRatio || 1);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* Sterne */
    for (let i = 0; i < 90; i++) {
      const sx = hash("s" + i) * w, sy = hash("t" + i) * h;
      ctx.fillStyle = "rgba(220,230,255," + (0.25 + 0.5 * hash("a" + i)) + ")";
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    const laeuft = schlacht && schlacht.status === "laeuft";
    const lebende = layout.filter(lebendig);

    /* Dauerfeuer: je Bild ein paar Laser zwischen zufaelligen Paaren. */
    if (laeuft && !RUHIG.matches) {
      const m = lebende.filter(function (p) { return p.seite === "menschen"; });
      const a = lebende.filter(function (p) { return p.seite === "aliens"; });
      const slot = Math.floor(jetzt / 140);
      for (let k = 0; k < Math.min(8, m.length + a.length); k++) {
        const vonM = hash(slot + "-" + k) < 0.5;
        const q1 = vonM ? m : a, q2 = vonM ? a : m;
        if (!q1.length || !q2.length) continue;
        const p1 = q1[Math.floor(hash("v" + slot + k) * q1.length)], p2 = q2[Math.floor(hash("n" + slot + k) * q2.length)];
        const A = pos(p1, w, h, jetzt), B = pos(p2, w, h, jetzt);
        const f = (jetzt % 140) / 140;
        ctx.strokeStyle = vonM ? "rgba(111,211,255,.55)" : "rgba(157,255,106,.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(A.x + (B.x - A.x) * f * 0.8, A.y + (B.y - A.y) * f * 0.8);
        ctx.lineTo(A.x + (B.x - A.x) * Math.min(1, f * 0.8 + 0.15), A.y + (B.y - A.y) * Math.min(1, f * 0.8 + 0.15));
        ctx.stroke();
      }
    }

    /* Schiffe */
    lebende.forEach(function (p) {
      const P = pos(p, w, h, jetzt);
      const s = p.g * Math.min(w / 1400, 0.32) * 0.9 + 0.08;
      ctx.save();
      ctx.translate(P.x, P.y);
      ctx.scale(p.seite === "menschen" ? s : -s, s);
      ctx.fillStyle = p.seite === "menschen" ? "#8996a6" : "#3a2462";
      ctx.strokeStyle = p.seite === "menschen" ? "#e6eef6" : "#b06cff";
      ctx.lineWidth = 2 / s;
      ctx.fill(p.seite === "menschen" ? HUELLE_M : HUELLE_A);
      ctx.stroke(p.seite === "menschen" ? HUELLE_M : HUELLE_A);
      ctx.fillStyle = p.seite === "menschen" ? "#7fd8ff" : "#8dff8a";
      ctx.beginPath();
      ctx.arc(p.seite === "menschen" ? -108 : -42, 0, 10, 0, 6.283);
      ctx.fill();
      ctx.restore();
      const ich = p.e.firebase_uid === meineUid, gezielt = p.e.firebase_uid === ziel;
      if (ich || gezielt) {
        ctx.strokeStyle = ich ? "#f0c96a" : "#ff6a6a";
        ctx.lineWidth = 2;
        ctx.setLineDash(gezielt ? [5, 4] : []);
        ctx.beginPath();
        ctx.arc(P.x, P.y, 26 * p.g + 8, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ich ? "#f0c96a" : "#ff9a9a";
        ctx.font = "600 12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ich ? t("schlacht.du", "Du") : (p.e.nickname || "?"), P.x, P.y - 26 * p.g - 14);
      }
    });

    /* Effekte aus Aktionen */
    effekte = effekte.filter(function (fx) { return jetzt - fx.t0 < 900; });
    effekte.forEach(function (fx) {
      const f = (jetzt - fx.t0) / 900;
      if (fx.art === "laser") {
        const A = pos(fx.von, w, h, jetzt), B = pos(fx.nach, w, h, jetzt);
        ctx.strokeStyle = fx.farbe;
        ctx.globalAlpha = 1 - f;
        ctx.lineWidth = fx.dick;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        ctx.fillStyle = "#ffd9a0";
        ctx.beginPath(); ctx.arc(B.x, B.y, 6 + 30 * f, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (fx.art === "welle") {
        const cx = fx.seite === "menschen" ? w * 0.25 : w * 0.75;
        ctx.strokeStyle = fx.wirkung === "heilung" ? "#55c878" : fx.farbe;
        ctx.globalAlpha = 1 - f;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx, h / 2, 40 + f * w * 0.3, 0, 6.283); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }

  function schleife(jetzt) {
    if (!seiteOffen()) { bild = 0; return; }
    bild = requestAnimationFrame(schleife);
    zeichnen(jetzt);
    knoepfeAuffrischen();
  }

  function canvasEinpassen() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d);
    canvas.height = Math.round(r.height * d);
  }

  function klickAufFeld(ev) {
    if (!schlacht || schlacht.status !== "laeuft") return;
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    const jetzt = performance.now();
    let best = null, bestD = 60;
    layout.filter(lebendig).forEach(function (p) {
      if (ich && p.seite === ich.seite) return;
      const P = pos(p, r.width, r.height, jetzt);
      const d = Math.hypot(P.x - mx, P.y - my);
      if (d < bestD) { bestD = d; best = p; }
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
    "nicht-dabei": ["schlacht.fehler.dabei", "Du kämpfst diesmal nicht mit – wähle eine Seite für die nächste Schlacht."],
    "zu-schnell": ["schlacht.fehler.schnell", "Deine Waffen laden noch."],
    "falsches-ziel": ["schlacht.fehler.ziel", "Wähle ein gegnerisches Schiff."],
    "schon": ["schlacht.fehler.schon", "Dein Spezialangriff ist schon verbraucht."],
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
        const ich = findeUid(meineUid), z = findeUid(ziel);
        if (ich && z) effekte.push({ art: "laser", von: ich, nach: z, t0: performance.now(), farbe: "#f0c96a", dick: 5 });
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
  }

  function knoepfeAuffrischen() {
    const uhr = document.getElementById("schlacht-uhr");
    if (uhr && schlacht && schlacht.status === "laeuft") uhr.textContent = restZeit();
    const k = document.getElementById("schlacht-spezial");
    if (!k) return;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    if (!ich) { k.hidden = true; return; }
    k.hidden = false;
    const warten = ich.seite === "menschen" ? 60000 : 30000;
    const ab = Date.parse(schlacht.start_at) + warten;
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
        el("span", "sl-ruhm-stand", standText(r.endstand_menschen)));
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

  function aufbauen() {
    const ziel2 = document.getElementById("schlacht-inhalt");
    if (!ziel2) return;
    ziel2.replaceChildren();
    canvas = ctx = null;

    if (!ist2100()) {
      ziel2.appendChild(hinweisBox(t("schlacht.zu.titel", "Keine Schlacht in Sicht"), t("schlacht.zu.text", "Die Sternenschlacht gibt es nur im Jahr 2100.")));
      return;
    }
    if (!schlacht || schlacht.status !== "laeuft") {
      if (schlacht && schlacht.status === "vorbei" && stand && stand.ok && Date.now() - Date.parse(schlacht.ende_at) < 10 * 60000) {
        ziel2.appendChild(siegerBanner());
      } else {
        ziel2.appendChild(hinweisBox(t("schlacht.ruhig.titel", "Ruhe im All"), t("schlacht.ruhig.text", "Gerade läuft keine Sternenschlacht. Ändii startet sie live – rüste bis dahin im Hangar auf.")));
      }
      ruhmZeigen(ziel2);
      return;
    }

    const kopf = el("div", "sl-kopf");
    const uhr = el("span", "sl-uhr");
    uhr.id = "schlacht-uhr";
    uhr.textContent = restZeit();
    kopf.append(el("span", "sl-live", t("schlacht.live", "Live")), uhr);
    const feld = el("div", "sl-feld");
    canvas = el("canvas", "sl-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("schlacht.feldAria", "Schlachtfeld: Menschen links, Aliens rechts"));
    canvas.addEventListener("click", klickAufFeld);
    feld.appendChild(canvas);

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
      st.textContent = angemeldet() ? t("schlacht.fehler.dabei", "Du kämpfst diesmal nicht mit – wähle eine Seite für die nächste Schlacht.") : t("schlacht.anmelden", "Melde dich an, um mitzukämpfen.");
    }

    ziel2.append(kopf, feld, banner, steuer, st);
    ctx = canvas.getContext("2d");
    canvasEinpassen();
    bannerAuffrischen();
    knoepfeAuffrischen();
    cancelAnimationFrame(bild);
    bild = requestAnimationFrame(schleife);
  }

  /* "58 % : 42 %" - ganze Prozent, die zusammen 100 ergeben. */
  function standText(prozentMenschen) {
    const m = Math.round(Number(prozentMenschen) || 0);
    return m + " % : " + (100 - m) + " %";
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
      el("p", "sl-sieger-stand", standText(stand.prozent_menschen))
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

  window.updateSternenschlachtPage = function (pageID) {
    if (pageID !== "sternenschlacht") return;
    aufbauen();
    tick().then(function () { if (seiteOffen()) aufbauen(); });
    taktStarten();
    hinweisAuffrischen();
  };

  /* Hinweis auf allen anderen Seiten: nur in 2100, nur wenn eine
     Schlacht laeuft. Alle 30 s ein leichter Blick in die Tabelle. */
  function hinweisAuffrischen() {
    let h = document.getElementById("fh-schlacht-hinweis");
    const zeigen = ist2100() && schlacht && schlacht.status === "laeuft" && Date.parse(schlacht.ende_at) > Date.now() && !seiteOffen();
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
  hinweisUhr = setInterval(hinweisPruefen, 30000);
  navAnpassen();
})();
