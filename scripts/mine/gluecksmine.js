/* ======================================================
   GLUECKSMINE (Migration 61)
   ---------------------------------------------------
   Seite #gluecksmine (Freigabe "gluecksmine"): Mit der Spitzhacke Erz
   aus dem Fels schlagen, mit Glueck eine Goldader (x10) oder einen
   Edelstein. Der Bohrer foerdert von selbst - auch, wenn man weg ist -
   bis die Lore voll ist; "Lore leeren" holt das Erz ab.

   ERZ ist eine eigene Waehrung (mine_stand.erz). Damit verbessert man
   die Geraete hier, den Hangar ueber Stufe 5 und die Schiffssysteme
   (hangar.js).

   DIE DATENBANK WUERFELT: Ein Klick zeigt sofort einen Schlag (Funken,
   Klang), gezaehlt wird er aber erst, wenn ihn die Datenbank verbucht.
   Die Schlaege gehen gebuendelt alle 600 ms hinaus (mine_hacken,
   hoechstens 20 je Aufruf; die Datenbank drosselt zusaetzlich auf 8 je
   Sekunde). Erst ihre Antwort bestimmt Erz, Goldadern und Edelsteine.

   Der Fels ist ein Canvas mit Funken und Brocken - reine Optik.
   Bei "Bewegung reduzieren" ohne Brocken und Wackeln.
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }
  function zahl(n) { return Number(n || 0).toLocaleString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"); }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* lucide (ISC): pickaxe, drill, container (Lore), flashlight */
  const SVG = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  const SYM = {
    hacke: SVG('<path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>'),
    bohrer: SVG('<path d="M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z"/><path d="M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1"/><path d="M14 4h4.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H14"/><path d="M19 6h3"/><path d="M5 10v8"/>'),
    lore: SVG('<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>'),
    lampe: SVG('<path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" x2="18" y1="6" y2="6"/><line x1="12" x2="12" y1="12" y2="12"/>'),
  };

  let stand = null;            // Antwort der Datenbank
  let wartend = 0;             // geklickte, noch nicht gesendete Schlaege
  let sendeUhr = null, bohrUhr = null;
  let unterwegs = false;
  let beschaeftigt = false;
  let canvas = null, ctx = null, raf = 0, B = 1, H = 1, D = 1;
  let teilchen = [], wackeln = 0, risse = [];
  let zeitVersatz = 0;

  function seiteOffen() {
    const s = document.getElementById("gluecksmine");
    return !!(s && s.classList.contains("active-page"));
  }

  async function rpc(name, args) {
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args || {}); });
    if (error) throw error;
    return data;
  }

  function uebernehmen(d) {
    if (!d) return;
    stand = Object.assign({}, stand || {}, d);
    if (d.jetzt) zeitVersatz = Date.parse(d.jetzt) - Date.now();
  }

  /* ------------------------------------------------------
     LADEN UND HACKEN
  ------------------------------------------------------ */
  async function laden() {
    if (!dbDa() || typeof wheelAuthReady === "undefined") return;
    try {
      await wheelAuthReady;
      const d = await rpc("mine_stand_holen");
      if (d && d.ok) uebernehmen(d);
      else stand = { gesperrt: d ? d.grund : "fehler" };
    } catch (err) {
      console.warn("Gluecksmine: Laden fehlgeschlagen:", err);
      stand = { gesperrt: typeof fhMigrationFehlt === "function" && fhMigrationFehlt(err) ? "fehlt" : "fehler" };
    }
  }

  function hacken(x, y) {
    if (!stand || stand.gesperrt) return;
    wartend++;
    funken(x, y, 10, "#ffd9a0");
    if (window.fhSchlachtKlang && window.fhSchlachtKlang.sfx) window.fhSchlachtKlang.sfx("treffer", true);
    if (!RUHIG.matches) { wackeln = 6; risse.push({ x: x, y: y, t0: performance.now(), w: Math.random() * 6.283 }); if (risse.length > 12) risse.shift(); }
    if (!sendeUhr) sendeUhr = setTimeout(senden, 600);
  }

  async function senden() {
    sendeUhr = null;
    if (unterwegs || !wartend) return;
    const n = Math.min(20, wartend);
    wartend -= n;
    unterwegs = true;
    try {
      const d = await rpc("mine_hacken", { p_anzahl: n });
      if (d && d.ok) {
        uebernehmen(d);
        fund(d);
        anzeigen();
      } else if (d) {
        status(fehlerText(d.grund), true);
      }
    } catch (err) {
      console.warn("Gluecksmine: Hacken fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      unterwegs = false;
      if (wartend) sendeUhr = setTimeout(senden, 600);
    }
  }

  /* Was die Datenbank gewuerfelt hat, gross zeigen. */
  function fund(d) {
    const mx = B / 2, my = H * 0.45;
    if (d.edelsteine > 0) {
      funken(mx, my, 60, "#7affea");
      status(t("mine.edelstein", "Ein Edelstein! +{n} Erz").replace("{n}", zahl(500 * d.hacke * d.edelsteine)), false, "ist-edelstein");
      if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("sieg");
    } else if (d.goldadern > 0) {
      funken(mx, my, 32, "#f0c96a");
      status(t("mine.goldader", "Goldader! +{n} Erz").replace("{n}", zahl(20 * d.hacke * d.goldadern)), false, "ist-gold");
      if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("ort");
    } else {
      status("+" + zahl(d.ertrag) + " " + t("mine.erz", "Erz"), false);
    }
  }

  async function abholen() {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const d = await rpc("mine_abholen");
      if (d && d.ok) {
        uebernehmen(d);
        anzeigen();
        status(t("mine.abgeholt", "Lore geleert: +{n} Erz").replace("{n}", zahl(d.abgeholt)), false);
        if (d.abgeholt > 0) funken(B * 0.82, H * 0.78, 24, "#f0c96a");
      } else status(fehlerText(d && d.grund), true);
    } catch (err) {
      console.warn("Gluecksmine: Abholen fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  async function verbessern(geraet) {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const d = await rpc("mine_verbessern", { p_geraet: geraet });
      if (d && d.ok) {
        uebernehmen(d);
        anzeigen();
        status(t("mine.verbessert", "✓ Verbessert: {g}").replace("{g}", t("mine.geraet." + geraet, geraet)), false);
        if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("zaehlen");
      } else status(fehlerText(d && d.grund), true);
    } catch (err) {
      console.warn("Gluecksmine: Verbessern fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  const GRUENDE = {
    "nicht-frei": ["mine.fehler.nichtFrei", "Die Glücksmine ist noch nicht freigegeben."],
    "gesperrt": ["mine.fehler.gesperrt", "Dein Konto ist gesperrt."],
    "zu-wenig": ["mine.fehler.wenig", "Dafür reicht dein Erz nicht."],
    "max": ["mine.fehler.max", "Schon ganz ausgebaut."],
  };
  function fehlerText(grund) {
    if (grund === "fehlt") return fhMigrationFehltText(t("mine.fehler.fehlt", "Die Glücksmine ist noch nicht eingerichtet."), 61);
    const g = GRUENDE[grund];
    return g ? t(g[0], g[1]) : t("mine.fehler.allgemein", "Das hat nicht geklappt.");
  }
  function status(text, fehler, extra) {
    const s = document.getElementById("mine-status");
    if (!s) return;
    s.textContent = text || "";
    s.className = "mn-status" + (fehler ? " ist-fehler" : "") + (extra ? " " + extra : "");
  }

  /* ------------------------------------------------------
     ANZEIGE
  ------------------------------------------------------ */
  /* Erz im Bohrer jetzt (wie app.mine_im_bohrer), fuer den Zaehler. */
  function imBohrer() {
    if (!stand || !stand.gesammelt_bis) return 0;
    const std = Math.min((Date.now() + zeitVersatz - Date.parse(stand.gesammelt_bis)) / 3600000, stand.lore_stunden || 2);
    return Math.max(0, Math.floor((stand.bohrer || 0) * 60 * std));
  }

  function aufbauen() {
    const ziel = document.getElementById("mine-inhalt");
    if (!ziel) return;
    ziel.replaceChildren();
    cancelAnimationFrame(raf); raf = 0; canvas = ctx = null;
    clearInterval(bohrUhr); bohrUhr = null;
    if (!angemeldet()) { ziel.appendChild(el("p", "mn-hinweis", t("mine.anmelden", "Melde dich an, dann kannst du in der Mine schürfen."))); return; }
    if (!stand) { ziel.appendChild(el("p", "mn-hinweis", t("mine.laedt", "Die Mine öffnet …"))); return; }
    if (stand.gesperrt) { ziel.appendChild(el("p", "mn-hinweis", fehlerText(stand.gesperrt))); return; }

    const kopf = el("div", "mn-kopf");
    const konto = el("div", "mn-konto");
    konto.append(el("span", "mn-konto-zahl"), el("span", "mn-konto-name", t("mine.erz", "Erz")));
    konto.firstChild.id = "mine-erz";
    const werte = el("p", "mn-werte");
    werte.id = "mine-werte";
    kopf.append(konto, werte);

    const fels = el("div", "mn-fels");
    canvas = el("canvas", "mn-canvas");
    canvas.id = "mine-canvas";
    canvas.setAttribute("role", "button");
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", t("mine.hackenAria", "Fels – tippen oder Leertaste zum Hacken"));
    canvas.addEventListener("pointerdown", function (ev) {
      const r = canvas.getBoundingClientRect();
      hacken(ev.clientX - r.left, ev.clientY - r.top);
    });
    canvas.addEventListener("keydown", function (ev) {
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); hacken(B / 2 + (Math.random() - 0.5) * B * 0.3, H * 0.45 + (Math.random() - 0.5) * H * 0.2); }
    });
    fels.appendChild(canvas);
    const st = el("p", "mn-status");
    st.id = "mine-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    fels.appendChild(st);

    const bohr = el("div", "mn-bohrer");
    const bohrText = el("p", "mn-bohrer-text");
    bohrText.id = "mine-bohrer";
    const leeren = el("button", "mn-knopf", t("mine.leeren", "Lore leeren"));
    leeren.type = "button";
    leeren.id = "mine-leeren";
    leeren.addEventListener("click", abholen);
    const balken = el("div", "mn-lore-balken");
    const fuell = el("span", "mn-lore-fuellung");
    fuell.id = "mine-lore";
    balken.appendChild(fuell);
    bohr.append(bohrText, balken, leeren);

    const geraete = el("div", "mn-geraete");
    geraete.id = "mine-geraete";

    const liste = el("section", "mn-bestenliste");
    liste.append(el("h2", "mn-titel", t("mine.bestenliste", "Die fleißigsten Bergleute")));
    const ol = el("ol", "mn-rangliste");
    ol.id = "mine-rangliste";
    liste.appendChild(ol);

    ziel.append(kopf, fels, bohr, geraete, liste);
    einpassen();
    anzeigen();
    bestenliste();
    raf = requestAnimationFrame(bild);
    bohrUhr = setInterval(bohrerAnzeigen, 1000);
  }

  function anzeigen() {
    if (!stand || stand.gesperrt) return;
    const erz = document.getElementById("mine-erz");
    if (erz) erz.textContent = zahl(stand.erz);
    const w = document.getElementById("mine-werte");
    if (w) w.textContent = t("mine.werte", "{g} Goldadern · {e} Edelsteine · {s} Schläge")
      .replace("{g}", zahl(stand.goldadern_gesamt)).replace("{e}", zahl(stand.edelsteine_gesamt)).replace("{s}", zahl(stand.schlaege_gesamt));
    bohrerAnzeigen();
    const g = document.getElementById("mine-geraete");
    if (!g) return;
    g.replaceChildren();
    [
      ["hacke", stand.hacke, 10, t("mine.text.hacke", "{n} Erz je Schlag").replace("{n}", zahl(2 * stand.hacke))],
      ["bohrer", stand.bohrer, 10, t("mine.text.bohrer", "{n} Erz je Stunde").replace("{n}", zahl(60 * stand.bohrer))],
      ["lore", stand.lore, 10, t("mine.text.lore", "fasst {n} Stunden").replace("{n}", 2 + 2 * stand.lore)],
      ["lampe", stand.lampe, 10, t("mine.text.lampe", "Goldader {g} % · Edelstein {e} %")
        .replace("{g}", (2 + 1.1 * stand.lampe).toFixed(1).replace(".0", "")).replace("{e}", (0.2 + 0.1 * stand.lampe).toFixed(1))],
    ].forEach(function (z) {
      const id = z[0], stufe = z[1], preis = stand.preise ? stand.preise[id] : null;
      const k = el("article", "mn-geraet");
      k.dataset.geraet = id;
      const sym = el("span", "mn-geraet-sym");
      sym.innerHTML = SYM[id];   // festes SVG
      const text = el("div", "mn-geraet-text");
      text.append(el("h3", "mn-geraet-name", t("mine.geraet." + id, id) + " · " + t("mine.stufe", "Stufe") + " " + stufe), el("p", "mn-geraet-wirkung", z[3]));
      const b = el("button", "mn-knopf");
      b.type = "button";
      if (preis == null) { b.disabled = true; b.textContent = t("mine.voll", "Ganz ausgebaut"); }
      else {
        b.textContent = t("mine.verbessern", "Verbessern") + " · " + zahl(preis) + " " + t("mine.erz", "Erz");
        b.disabled = stand.erz < preis;
        b.addEventListener("click", function () { verbessern(id); });
      }
      k.append(sym, text, b);
      g.appendChild(k);
    });
  }

  function bohrerAnzeigen() {
    if (!stand || !seiteOffen()) return;
    const bt = document.getElementById("mine-bohrer");
    const lo = document.getElementById("mine-lore");
    const n = imBohrer(), max = (stand.bohrer || 0) * 60 * (stand.lore_stunden || 2);
    if (bt) bt.textContent = stand.bohrer > 0
      ? t("mine.inLore", "In der Lore: {n} von {m} Erz").replace("{n}", zahl(n)).replace("{m}", zahl(max))
      : t("mine.keinBohrer", "Kauf einen Bohrer – er fördert auch, wenn du weg bist.");
    if (lo) lo.style.width = (max > 0 ? Math.min(100, n / max * 100) : 0) + "%";
  }

  async function bestenliste() {
    const ol = document.getElementById("mine-rangliste");
    if (!ol || !dbDa()) return;
    try {
      const d = await rpc("mine_bestenliste");
      ol.replaceChildren();
      (d || []).forEach(function (z) {
        const li = el("li", "mn-rang");
        const name = el("button", "mn-rang-name", z.nickname || "?");
        name.type = "button";
        const k = window.fhProfil ? window.fhProfil.namensKlasse(z.firebase_uid) : "";
        if (k) name.className += " " + k;
        name.addEventListener("click", function () { if (window.fhProfil) window.fhProfil.zeigen(z.firebase_uid); });
        li.append(name, el("span", "mn-rang-erz", zahl(z.erz_gesamt) + " " + t("mine.erz", "Erz")));
        ol.appendChild(li);
      });
      if (!ol.childNodes.length) ol.appendChild(el("li", "mn-leer", t("mine.leer", "Noch hat niemand geschürft.")));
    } catch (err) { /* ohne Bestenliste weiter */ }
  }

  /* ------------------------------------------------------
     FELS (Canvas)
  ------------------------------------------------------ */
  function einpassen() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    D = Math.min(2, window.devicePixelRatio || 1);
    B = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(B * D); canvas.height = Math.round(H * D);
  }

  function funken(x, y, n, farbe) {
    if (RUHIG.matches) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 6.283, v = 60 + Math.random() * 220;
      teilchen.push({ x: x, y: y, vx: Math.cos(w) * v, vy: Math.sin(w) * v - 80, t0: performance.now(), farbe: farbe, r: 1 + Math.random() * 2.4, brocken: !RUHIG.matches && Math.random() < 0.3 });
    }
    if (teilchen.length > 300) teilchen.splice(0, teilchen.length - 300);
  }

  function hash(i) { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

  function bild(jetzt) {
    if (!seiteOffen() || !canvas) { raf = 0; return; }
    raf = requestAnimationFrame(bild);
    if (!ctx) ctx = canvas.getContext("2d");
    ctx.setTransform(D, 0, 0, D, 0, 0);
    ctx.clearRect(0, 0, B, H);
    const wx = wackeln ? (Math.random() - 0.5) * wackeln : 0;
    wackeln = Math.max(0, wackeln - 0.6);
    ctx.save();
    ctx.translate(wx, 0);
    /* Stollen */
    const g = ctx.createRadialGradient(B / 2, H * 0.42, 10, B / 2, H * 0.5, Math.max(B, H) * 0.7);
    g.addColorStop(0, "#5a4632"); g.addColorStop(0.55, "#2a1e14"); g.addColorStop(1, "#0b0705");
    ctx.fillStyle = g; ctx.fillRect(-10, 0, B + 20, H);
    /* Felsbrocken und Erzadern */
    for (let i = 0; i < 26; i++) {
      const x = hash(i) * B, y = hash(i + 50) * H * 0.9, r = 12 + hash(i + 99) * 36;
      ctx.fillStyle = "rgba(0,0,0," + (0.18 + hash(i + 7) * 0.2) + ")";
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, hash(i + 3) * 3, 0, 6.283); ctx.fill();
    }
    const lampe = stand ? stand.lampe || 0 : 0;
    for (let i = 0; i < 14 + lampe * 2; i++) {
      const x = hash(i + 200) * B, y = hash(i + 300) * H * 0.85, glanz = 0.4 + 0.6 * Math.abs(Math.sin(jetzt * 0.002 + i));
      ctx.fillStyle = i % 5 === 0 ? "rgba(122,255,234," + (0.5 * glanz) + ")" : "rgba(240,201,106," + (0.55 * glanz) + ")";
      ctx.beginPath(); ctx.arc(x, y, 1.6 + hash(i + 400) * 2.2, 0, 6.283); ctx.fill();
    }
    /* Risse vom Hacken */
    risse = risse.filter(function (r) { return jetzt - r.t0 < 2500; });
    risse.forEach(function (r) {
      const a = 1 - (jetzt - r.t0) / 2500;
      ctx.strokeStyle = "rgba(255,220,170," + (0.5 * a) + ")"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const w = r.w + k * 1.57;
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + Math.cos(w) * 18, r.y + Math.sin(w) * 18);
        ctx.lineTo(r.x + Math.cos(w + 0.3) * 30, r.y + Math.sin(w + 0.3) * 30);
      }
      ctx.stroke();
    });
    /* Lichtkegel der Grubenlampe */
    const licht = ctx.createRadialGradient(B / 2, H * 0.4, 0, B / 2, H * 0.4, Math.max(B, H) * (0.35 + 0.03 * lampe));
    licht.addColorStop(0, "rgba(255,230,180," + (0.16 + 0.015 * lampe) + ")"); licht.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = licht; ctx.fillRect(-10, 0, B + 20, H);
    /* Funken und Brocken */
    const dt = 1 / 60;
    teilchen = teilchen.filter(function (p) { return jetzt - p.t0 < 900; });
    teilchen.forEach(function (p) {
      p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - (jetzt - p.t0) / 900;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.brocken ? "#6b5640" : p.farbe;
      if (p.brocken) ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2.2, p.r * 2);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    /* Hinweis */
    if (stand && !stand.gesperrt && (stand.schlaege_gesamt || 0) < 3 && !teilchen.length) {
      ctx.fillStyle = "rgba(255,240,210,.8)";
      ctx.font = "600 15px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("mine.tipp", "Tippe auf den Fels!"), B / 2, H * 0.9);
    }
  }

  window.updateGluecksminePage = function (pageID) {
    if (pageID !== "gluecksmine") {
      cancelAnimationFrame(raf); raf = 0;
      clearInterval(bohrUhr); bohrUhr = null;
      if (wartend) senden();
      return;
    }
    aufbauen();
    laden().then(function () { if (seiteOffen()) aufbauen(); });
  };

  window.addEventListener("resize", function () { if (seiteOffen()) einpassen(); });
  window.addEventListener("fhFlagsUpdated", function () { if (seiteOffen()) window.updateGluecksminePage("gluecksmine"); });
  /* Vor dem Schliessen noch die letzten Schlaege senden. */
  window.addEventListener("pagehide", function () { if (wartend) senden(); });

  /* Erz-Stand fuer andere Seiten (Hangar). */
  window.fhMine = {
    erz: function () { return stand && !stand.gesperrt ? Number(stand.erz) || 0 : null; },
    setzen: function (erz) { if (stand && !stand.gesperrt) stand.erz = erz; },
  };
})();
