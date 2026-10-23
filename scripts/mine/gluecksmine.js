/* ======================================================
   GLUECKSMINE (Migration 61)
   ---------------------------------------------------
   Seite #gluecksmine (Freigabe "gluecksmine"): Mit der Spitzhacke Erz
   aus dem Fels schlagen, mit Glueck eine Goldader oder einen
   Edelstein. Der Bohrer foerdert von selbst - auch, wenn man weg ist -
   bis die Lore voll ist; offen geleert wird sie von allein.

   ERZ ist eine eigene Waehrung (mine_stand.erz). Damit verbessert man
   die Geraete hier und die Schiffssysteme (hangar.js).

   DIE DATENBANK WUERFELT: Ein Klick zeigt sofort einen Schlag (Funken,
   Klang), gezaehlt wird er aber erst, wenn ihn die Datenbank verbucht.
   Die Schlaege gehen gebuendelt alle 600 ms hinaus (mine_hacken,
   hoechstens 20 je Aufruf; die Datenbank drosselt zusaetzlich auf 8 je
   Sekunde). Erst ihre Antwort bestimmt Erz, Goldadern und Edelsteine.

   BLOECKE UND RAUMERZ (Migration 64): Statt eines endlosen Felsens
   liegt immer ein Block vor dir - Stein, Eisen, Goldader, Kristall
   oder (jeder 30.) Raumerz -, jeder mit eigenem Leben. Ein Hieb zieht
   so viel ab, wie die Spitzhacke Stufen hat. Die Anzeige zieht die
   geklickten, noch nicht verbuchten Hiebe schon ab; welcher Block
   danach kommt, sagt erst die Datenbank. Raumerz bezahlt im Hangar
   die Stufen 1..15.

   DESIGN (Claude Design, "Gluecksmine", Entwurf 1b "Nocturne"): Der
   Fels ist die Buehne, Ausruestung und Bestenliste stehen daneben.
   Ueber dem Fels liegen Block (Art und Leben) und Tiefe; alle 25
   Bloecke geht es eine TIEFE weiter (Obere Stollen, Eisenader,
   Kristallgrotte, Glutkammer, Sternenschacht - reine Optik aus
   bloecke_gesamt). Links arbeitet der Bohrturm. Die Lore leert sich,
   solange die Seite offen ist, alle 30 Sekunden von selbst.

   Der Canvas ist reine Optik. Bei "Bewegung reduzieren" ohne Brocken,
   Wackeln und Ueberblendungen.
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

  /* lucide (ISC): pickaxe, drill, container (Lore), flashlight, arrow-up */
  const SVG = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  const SYM = {
    hacke: SVG('<path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/><path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>'),
    bohrer: SVG('<path d="M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z"/><path d="M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1"/><path d="M14 4h4.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5H14"/><path d="M19 6h3"/><path d="M5 10v8"/>'),
    lore: SVG('<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>'),
    lampe: SVG('<path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" x2="18" y1="6" y2="6"/><line x1="12" x2="12" y1="12" y2="12"/>'),
    hoch: SVG('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
  };

  let stand = null;            // Antwort der Datenbank
  let wartend = 0;             // geklickte, noch nicht gesendete Schlaege
  let sendeUhr = null, bohrUhr = null, loreUhr = null;
  let unterwegs = false;
  let beschaeftigt = false;
  let canvas = null, ctx = null, raf = 0, B = 1, H = 1, D = 1;
  let teilchen = [], wackeln = 0, risse = [], schwebend = [];
  let zeitVersatz = 0;
  let unterwegsN = 0;          // gesendete, noch unbeantwortete Hiebe
  let blockSeit = 0;           // wann der aktuelle Block erschienen ist
  let hiebSeit = 0;            // fuer das kurze Stauchen beim Treffer
  let tiefeJetzt = -1, tiefeAlt = -1, tiefeSeit = 0;

  /* TIEFEN: alle 25 Bloecke eine weiter, dann wieder von vorn. */
  const TIEFE_BLOECKE = 25;
  const TIEFEN = [
    { name: "Obere Stollen", farben: ["#2c2f44", "#191b29", "#0c0d14"], fx: "balken" },
    { name: "Eisenader", farben: ["#283040", "#161b27", "#0a0c13"], fx: "schichten" },
    { name: "Kristallgrotte", farben: ["#213a44", "#13212a", "#090e14"], fx: "kristalle" },
    { name: "Glutkammer", farben: ["#3a2a32", "#1e161d", "#0e0a10"], fx: "glut" },
    { name: "Sternenschacht", farben: ["#2b2850", "#16152b", "#0a0a16"], fx: "sterne" },
  ];
  function tiefeVon(bloecke) { return Math.floor((bloecke || 0) / TIEFE_BLOECKE) % TIEFEN.length; }
  function tiefeName(i) { return t("mine.tiefe." + i, TIEFEN[i].name); }

  /* Farben des Canvas (Nocturne-Palette des Entwurfs). */
  const PAL = {
    gold: "226,197,138", gem: "159,227,224", riss: "210,206,253", licht: "181,171,252", lichtA: 0.09,
    brocken: "#3f424d", hieb: "#d2cefd", extra: "#b5abfc",
    holz: ["#34364a", "#1c1d28"], metall: ["#6a6e80", "#2c2e3a"], akzent: "#9184d9",
    fund: { raumerz: "#d2cefd", gem: "#9fe3e0", gold: "#e2c58a", bruch: "#b2b6ca" },
    block: {
      stein: { grund: "#2a2c34", hell: "#747888", ader: "#b2b6ca" },
      eisen: { grund: "#2a313d", hell: "#76859c", ader: "#dfe3f2" },
      gold: { grund: "#3a3020", hell: "#8f7a4d", ader: "#e2c58a" },
      kristall: { grund: "#172c33", hell: "#44808a", ader: "#9fe3e0" },
      raumerz: { grund: "#211e34", hell: "#5d5294", ader: "#d2cefd" },
    },
  };

  function rgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function mix(a, b, f) { const x = rgb(a), y = rgb(b); return "rgb(" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * f); }).join(",") + ")"; }
  function rgba(h, a) { return "rgba(" + rgb(h).join(",") + "," + a + ")"; }
  function hash(i) { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

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
    if (d.block && (!stand || !stand.block || (d.gebrochen && d.gebrochen.length))) blockSeit = performance.now();
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
    hiebSeit = performance.now();
    funken(x, y, 10, PAL.hieb);
    if (window.fhSchlachtKlang && window.fhSchlachtKlang.sfx) window.fhSchlachtKlang.sfx("treffer", true);
    if (!RUHIG.matches) { wackeln = 6; risse.push({ x: x, y: y, t0: performance.now(), w: Math.random() * 6.283 }); if (risse.length > 12) risse.shift(); }
    if (!sendeUhr) sendeUhr = setTimeout(senden, 600);
    blockAnzeigen();
  }

  async function senden() {
    sendeUhr = null;
    if (unterwegs || !wartend) return;
    const n = Math.min(20, wartend);
    wartend -= n;
    unterwegsN = n;
    unterwegs = true;
    try {
      const vorher = stand ? stand.bloecke_gesamt : null;
      const d = await rpc("mine_hacken", { p_anzahl: n });
      unterwegsN = 0;   // verbucht - nicht noch einmal vom Block abziehen
      if (d && d.ok) {
        uebernehmen(d);
        fund(d, vorher);
        anzeigen();
      } else if (d) {
        status(fehlerText(d.grund), true);
      }
    } catch (err) {
      console.warn("Gluecksmine: Hacken fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      unterwegs = false;
      unterwegsN = 0;
      if (wartend) sendeUhr = setTimeout(senden, 600);
    }
  }

  /* Was die Datenbank gewuerfelt hat, gross zeigen. Seit 64 zaehlen
     die zerbrochenen Bloecke ("gebrochen"); das Seltenste gewinnt.
     Ohne 64 (kein "block") gelten die Betraege aus 61. Eine neue Tiefe
     haengt sich an die Meldung an. */
  function fund(d, bloeckeVorher) {
    const mx = B / 2, my = H * 0.5;
    const g = d.gebrochen || [];
    const h = d.hacke || 1;
    let text, art = "";
    if (g.indexOf("raumerz") >= 0) {
      funken(mx, my, 80, PAL.fund.raumerz);
      funken(mx, my, 30, PAL.extra);
      text = t("mine.raumerzFund", "Raumerz! +{n} Raumerz").replace("{n}", zahl(d.raumerz_neu || 1)); art = "ist-raumerz";
      if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("sieg");
    } else if (d.edelsteine > 0) {
      funken(mx, my, 60, PAL.fund.gem);
      text = t("mine.edelstein", "Ein Edelstein! +{n} Erz").replace("{n}", zahl((d.block ? 400 : 500) * h * d.edelsteine)); art = "ist-edelstein";
      if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("sieg");
    } else if (d.goldadern > 0) {
      funken(mx, my, 32, PAL.fund.gold);
      text = t("mine.goldader", "Goldader! +{n} Erz").replace("{n}", zahl((d.block ? 100 : 20) * h * d.goldadern)); art = "ist-gold";
      if (window.fhSchlachtKlang) window.fhSchlachtKlang.akzent("ort");
    } else if (g.length) {
      funken(mx, my, 20, PAL.fund.bruch);
      text = t("mine.zerbrochen", "Block zerbrochen! +{n} Erz").replace("{n}", zahl(d.ertrag));
    } else {
      text = "+" + zahl(d.ertrag) + " " + t("mine.erz", "Erz");
    }
    if (bloeckeVorher != null && d.bloecke_gesamt != null
        && Math.floor(d.bloecke_gesamt / TIEFE_BLOECKE) > Math.floor(bloeckeVorher / TIEFE_BLOECKE)) {
      text += t("mine.neueTiefe", " · Neue Tiefe: {name}").replace("{name}", tiefeName(tiefeVon(d.bloecke_gesamt)));
      if (!art) art = "ist-tiefe";
    }
    status(text, false, art);
  }

  /* Lore leeren. still = von selbst (alle 30 s): kein Status, nur
     "+n Erz" am Bohrturm. */
  async function abholen(still) {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const d = await rpc("mine_abholen");
      if (d && d.ok) {
        uebernehmen(d);
        anzeigen();
        if (d.abgeholt > 0) {
          schwebend.push({ text: "+" + zahl(d.abgeholt) + " " + t("mine.erz", "Erz"), t0: performance.now() });
          if (schwebend.length > 6) schwebend.shift();
          funken(bohrX(), H * 0.86, 12, PAL.fund.gold);
        }
        if (!still) status(t("mine.abgeholt", "Lore geleert: +{n} Erz").replace("{n}", zahl(d.abgeholt)), false);
      } else if (!still) status(fehlerText(d && d.grund), true);
    } catch (err) {
      console.warn("Gluecksmine: Abholen fehlgeschlagen:", err);
      if (!still) status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }
  function loreLeerenWennVoll() {
    if (!seiteOffen() || !stand || stand.gesperrt || !(stand.bohrer > 0)) return;
    if (imBohrer() >= 1) abholen(true);
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
  /* Erz im Bohrer jetzt (wie app.mine_im_bohrer). */
  function imBohrer() {
    if (!stand || !stand.gesammelt_bis) return 0;
    const std = Math.min((Date.now() + zeitVersatz - Date.parse(stand.gesammelt_bis)) / 3600000, stand.lore_stunden || 2);
    return Math.max(0, Math.floor((stand.bohrer || 0) * 60 * std));
  }

  /* Erz und Raumerz stehen rechts neben der Seitenueberschrift. */
  function konten() {
    const seite = document.querySelector("#gluecksmine .mn-seite");
    const inhalt = document.getElementById("mine-inhalt");
    if (!seite || !inhalt) return null;
    let k = document.getElementById("mine-konten");
    if (!k) {
      k = el("div", "mn-konten");
      k.id = "mine-konten";
      [["mine-erz", "mine.erz", "Erz", ""], ["mine-raumerz", "mine.raumerz", "Raumerz", " ist-raumerz"]].forEach(function (z) {
        const box = el("div", "mn-konto" + z[3]);
        box.append(el("span", "mn-konto-name", t(z[1], z[2])), el("span", "mn-konto-zahl"));
        box.lastChild.id = z[0];
        k.appendChild(box);
      });
      seite.insertBefore(k, inhalt);
    }
    return k;
  }

  function hud(klasse) {
    const d = el("div", "mn-hud " + klasse);
    d.setAttribute("aria-hidden", "true");
    return d;
  }

  function aufbauen() {
    const ziel = document.getElementById("mine-inhalt");
    if (!ziel) return;
    ziel.replaceChildren();
    cancelAnimationFrame(raf); raf = 0; canvas = ctx = null;
    clearInterval(bohrUhr); bohrUhr = null;
    clearInterval(loreUhr); loreUhr = null;
    const k = konten();
    const bereit = angemeldet() && stand && !stand.gesperrt;
    if (k) k.hidden = !bereit;
    if (!angemeldet()) { ziel.appendChild(el("p", "mn-hinweis", t("mine.anmelden", "Melde dich an, dann kannst du in der Mine schürfen."))); return; }
    if (!stand) { ziel.appendChild(el("p", "mn-hinweis", t("mine.laedt", "Die Mine öffnet …"))); return; }
    if (stand.gesperrt) { ziel.appendChild(el("p", "mn-hinweis", fehlerText(stand.gesperrt))); return; }
    if (k) k.lastChild.hidden = stand.raumerz == null;   // ohne Migration 64

    /* Links: Buehne und Zahlen */
    const links = el("div", "mn-links");
    const fels = el("div", "mn-fels");
    canvas = el("canvas", "mn-canvas");
    canvas.id = "mine-canvas";
    canvas.setAttribute("role", "button");
    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", t("mine.hackenAria", "Block – tippen oder Leertaste zum Hacken"));
    canvas.addEventListener("pointerdown", function (ev) {
      const r = canvas.getBoundingClientRect();
      hacken((ev.clientX - r.left) * B / r.width, (ev.clientY - r.top) * H / r.height);
    });
    canvas.addEventListener("keydown", function (ev) {
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); hacken(B / 2 + (Math.random() - 0.5) * B * 0.3, H * 0.5 + (Math.random() - 0.5) * H * 0.2); }
    });
    fels.appendChild(canvas);

    if (stand.block) {
      const blockHud = hud("ist-block");
      const kopf = el("div", "mn-hud-zeile");
      const name = el("span", "mn-hud-name");
      const raute = el("span", "mn-raute");
      name.append(raute, el("span", null));
      name.id = "mine-block-name";
      kopf.append(name, el("span", "mn-hud-wert"));
      kopf.lastChild.id = "mine-block-leben";
      const leiste = el("div", "mn-leiste");
      const fuell = el("div", "mn-leiste-fuellung");
      fuell.id = "mine-block-balken";
      leiste.appendChild(fuell);
      blockHud.append(kopf, leiste);

      const tiefeHud = hud("ist-tiefe");
      const tName = el("span", "mn-hud-name");
      tName.id = "mine-tiefe";
      const tLeiste = el("div", "mn-leiste");
      const tFuell = el("div", "mn-leiste-fuellung ist-tiefe");
      tFuell.id = "mine-tiefe-balken";
      tLeiste.appendChild(tFuell);
      const tRest = el("span", "mn-hud-klein");
      tRest.id = "mine-tiefe-rest";
      tiefeHud.append(tName, tLeiste, tRest);
      fels.append(blockHud, tiefeHud);
    }
    const tipp = el("p", "mn-tipp");
    tipp.setAttribute("aria-hidden", "true");
    tipp.append(el("kbd", null, t("mine.taste", "Leertaste")), document.createTextNode(" " + t("mine.oderTippen", "oder tippen")));
    const st = el("p", "mn-status");
    st.id = "mine-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    fels.append(tipp, st);

    const zahlen = el("p", "mn-zahlen");
    zahlen.id = "mine-zahlen";
    links.append(fels, zahlen);

    /* Rechts: Ausruestung und Bestenliste */
    const spalte = el("aside", "mn-spalte");
    const aus = el("section", "mn-gruppe");
    aus.append(el("h2", "mn-gruppe-titel", t("mine.ausruestung", "Ausrüstung")));
    const geraete = el("div", "mn-geraete");
    geraete.id = "mine-geraete";
    aus.appendChild(geraete);
    const liste = el("section", "mn-gruppe");
    liste.append(el("h2", "mn-gruppe-titel", t("mine.bestenliste", "Die fleißigsten Bergleute")));
    const ol = el("ol", "mn-rangliste");
    ol.id = "mine-rangliste";
    liste.appendChild(ol);
    spalte.append(aus, liste);

    const raster = el("div", "mn-raster");
    raster.append(links, spalte);
    ziel.appendChild(raster);

    tiefeJetzt = -1;
    einpassen();
    anzeigen();
    bestenliste();
    raf = requestAnimationFrame(bild);
    bohrUhr = setInterval(bohrerAnzeigen, 1000);
    loreUhr = setInterval(loreLeerenWennVoll, 30000);
    loreLeerenWennVoll();
  }

  function zahlFeld(n, text) {
    const s = el("span", "mn-zahl");
    s.append(el("strong", null, zahl(n)), document.createTextNode(" " + text));
    return s;
  }

  function anzeigen() {
    if (!stand || stand.gesperrt) return;
    const erz = document.getElementById("mine-erz");
    if (erz) erz.textContent = zahl(stand.erz);
    const raum = document.getElementById("mine-raumerz");
    if (raum) raum.textContent = zahl(stand.raumerz);
    blockAnzeigen();
    tiefeAnzeigen();
    const z = document.getElementById("mine-zahlen");
    if (z) {
      z.replaceChildren(
        zahlFeld(stand.goldadern_gesamt, t("mine.zahl.gold", "Goldadern")),
        zahlFeld(stand.edelsteine_gesamt, t("mine.zahl.edel", "Edelsteine")),
        zahlFeld(stand.schlaege_gesamt, t("mine.zahl.schlaege", "Schläge")));
      if (stand.bloecke_gesamt != null) z.appendChild(zahlFeld(stand.bloecke_gesamt, t("mine.zahl.bloecke", "Blöcke")));
    }
    const g = document.getElementById("mine-geraete");
    if (!g) return;
    g.replaceChildren();
    [
      ["hacke", stand.block ? t("mine.text.hackeBlock", "{n} Erz und {d} Schaden je Hieb").replace("{d}", zahl(stand.hacke))
        : t("mine.text.hacke", "{n} Erz je Schlag"), 2 * stand.hacke],
      ["bohrer", t("mine.text.bohrerAuto", "fördert {n} Erz je Stunde, automatisch"), 60 * stand.bohrer],
      ["lore", t("mine.text.loreWeg", "fasst {n} Stunden, solange du weg bist"), 2 + 2 * stand.lore],
      /* Seit 64 je Block: Gold 4 % + 2 %, Kristall 0,6 % + 0,3 % je Stufe */
      ["lampe", t("mine.text.lampe", "Goldader {g} % · Edelstein {e} %")
        .replace("{g}", zahl(Math.round((stand.block ? 4 + 2 * stand.lampe : 2 + 1.1 * stand.lampe) * 10) / 10))
        .replace("{e}", zahl(Math.round((stand.block ? 0.6 + 0.3 * stand.lampe : 0.2 + 0.1 * stand.lampe) * 10) / 10)), null],
    ].forEach(function (z2) {
      const id = z2[0], stufe = Number(stand[id]) || 0, preis = stand.preise ? stand.preise[id] : null;
      const k = el("article", "mn-geraet");
      k.dataset.geraet = id;
      const sym = el("span", "mn-geraet-sym");
      sym.innerHTML = SYM[id];   // festes SVG
      const kopf = el("div", "mn-geraet-kopf");
      kopf.append(el("h3", "mn-geraet-name", t("mine.geraet." + id, id)),
        el("span", "mn-geraet-stufe", t("mine.stufeVon", "Stufe {n} / 10").replace("{n}", stufe)));
      const b = el("button", "mn-knopf");
      b.type = "button";
      if (preis == null) { b.disabled = true; b.textContent = t("mine.max", "Max"); }
      else {
        b.innerHTML = SYM.hoch;   // festes SVG
        b.appendChild(document.createTextNode(zahl(preis)));
        b.setAttribute("aria-label", t("mine.verbessern", "Verbessern") + " · " + zahl(preis) + " " + t("mine.erz", "Erz"));
        b.disabled = stand.erz < preis;
        b.addEventListener("click", function () { verbessern(id); });
      }
      const fuss = el("div", "mn-geraet-fuss");
      const punkte = el("div", "mn-punkte");
      punkte.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 10; i++) punkte.appendChild(el("span", i < stufe ? "ist-an" : null));
      fuss.append(punkte, el("p", "mn-geraet-wirkung", z2[2] == null ? z2[1] : z2[1].replace("{n}", zahl(z2[2]))));
      k.append(sym, kopf, b, fuss);
      g.appendChild(k);
    });
  }

  /* Leben des Blocks, wie es nach den geklickten Hieben aussieht. */
  function blockLeben() {
    if (!stand || !stand.block) return 0;
    return Math.max(0, stand.block.leben - (stand.hacke || 1) * (wartend + unterwegsN));
  }
  function blockAnzeigen() {
    if (!stand || !stand.block) return;
    const art = stand.block.art, farbe = (PAL.block[art] || PAL.block.stein).ader;
    const name = document.getElementById("mine-block-name");
    if (name) {
      name.firstChild.style.background = farbe;   // Farbe der Blockart (Daten, kein Token)
      name.firstChild.style.boxShadow = "0 0 10px " + farbe;
      name.lastChild.textContent = t("mine.block." + art, art);
    }
    const l = blockLeben();
    const wert = document.getElementById("mine-block-leben");
    if (wert) wert.textContent = t("mine.blockLeben", "{l} von {m} Leben").replace("{l}", zahl(l)).replace("{m}", zahl(stand.block.max));
    const bal = document.getElementById("mine-block-balken");
    if (bal) {
      bal.style.width = (stand.block.max > 0 ? l / stand.block.max * 100 : 0) + "%";
      bal.style.background = farbe;
    }
  }
  function tiefeAnzeigen() {
    if (!stand || stand.bloecke_gesamt == null) return;
    const n = Number(stand.bloecke_gesamt) || 0, i = tiefeVon(n), rest = TIEFE_BLOECKE - (n % TIEFE_BLOECKE);
    const name = document.getElementById("mine-tiefe");
    if (name) name.textContent = t("mine.tiefe", "Tiefe {n} · {name}").replace("{n}", Math.floor(n / TIEFE_BLOECKE) + 1).replace("{name}", tiefeName(i));
    const bal = document.getElementById("mine-tiefe-balken");
    if (bal) bal.style.width = ((n % TIEFE_BLOECKE) / TIEFE_BLOECKE * 100) + "%";
    const r = document.getElementById("mine-tiefe-rest");
    if (r) r.textContent = rest === 1 ? t("mine.tiefeRest1", "noch 1 Block") : t("mine.tiefeRest", "noch {n} Blöcke").replace("{n}", rest);
  }

  /* Die Lore im Bohrer-Kaertchen (laeuft jede Sekunde). */
  function bohrerAnzeigen() {
    if (!stand || !seiteOffen()) return;
    const k = document.querySelector('#mine-geraete [data-geraet="lore"] .mn-geraet-wirkung');
    if (!k || !(stand.bohrer > 0)) return;
    const n = imBohrer(), max = (stand.bohrer || 0) * 60 * (stand.lore_stunden || 2);
    k.textContent = t("mine.text.loreWeg", "fasst {n} Stunden, solange du weg bist").replace("{n}", zahl(2 + 2 * stand.lore))
      + " · " + t("mine.inLore", "In der Lore: {n} von {m} Erz").replace("{n}", zahl(n)).replace("{m}", zahl(max));
  }

  async function bestenliste() {
    const ol = document.getElementById("mine-rangliste");
    if (!ol || !dbDa()) return;
    try {
      const d = await rpc("mine_bestenliste");
      ol.replaceChildren();
      (d || []).forEach(function (z, i) {
        const li = el("li", "mn-rang" + (i === 0 ? " ist-erster" : ""));
        const name = el("button", "mn-rang-name", z.nickname || "?");
        name.type = "button";
        const k = window.fhProfil ? window.fhProfil.namensKlasse(z.firebase_uid) : "";
        if (k) name.className += " " + k;
        name.addEventListener("click", function () { if (window.fhProfil) window.fhProfil.zeigen(z.firebase_uid); });
        li.append(el("span", "mn-rang-platz", String(i + 1)), name, el("span", "mn-rang-erz", zahl(z.erz_gesamt) + " " + t("mine.erz", "Erz")));
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

  /* Bohrturm nur, wo Platz ist - auf dem Handy stuende er im Block. */
  function mitBohrturm() { return B >= 520; }
  function bohrX() { return mitBohrturm() ? B * 0.13 : B * 0.5; }

  function prisma(x, y, len, w, ang, c1, c2) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const tx = x + dx * len, ty = y + dy * len, sx = x + dx * len * 0.74, sy = y + dy * len * 0.74, mx = x + dx * len * 0.08, my = y + dy * len * 0.08;
    ctx.beginPath(); ctx.moveTo(x + nx * w, y + ny * w); ctx.lineTo(sx + nx * w, sy + ny * w); ctx.lineTo(tx, ty); ctx.lineTo(mx, my); ctx.closePath(); ctx.fillStyle = c1; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - nx * w, y - ny * w); ctx.lineTo(sx - nx * w, sy - ny * w); ctx.lineTo(tx, ty); ctx.lineTo(mx, my); ctx.closePath(); ctx.fillStyle = c2; ctx.fill();
  }
  function funkeln(x, y, r, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = "rgba(255,250,235,1)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); ctx.restore();
  }

  /* Hintergrund einer Tiefe: Stollen, Felsbrocken und ihr Merkmal. */
  function hintergrund(i, jetzt, alpha) {
    const S = TIEFEN[i], c = S.farben, ruhig = RUHIG.matches;
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(B / 2, H * 0.42, 10, B / 2, H * 0.5, Math.max(B, H) * 0.7);
    g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.fillRect(-10, 0, B + 20, H);
    for (let k = 0; k < 26; k++) {
      const x = hash(k) * B, y = hash(k + 50) * H * 0.9, r = 12 + hash(k + 99) * 36;
      ctx.fillStyle = "rgba(0,0,0," + (0.14 + hash(k + 7) * 0.18) + ")";
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, hash(k + 3) * 3, 0, 6.283); ctx.fill();
    }
    if (S.fx === "balken") {
      [B * 0.035, B * 0.965].forEach(function (x) {
        const hg = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
        hg.addColorStop(0, PAL.holz[1]); hg.addColorStop(0.5, PAL.holz[0]); hg.addColorStop(1, PAL.holz[1]);
        ctx.fillStyle = hg; ctx.fillRect(x - 12, 0, 24, H);
      });
      const qg = ctx.createLinearGradient(0, 0, 0, 26);
      qg.addColorStop(0, PAL.holz[0]); qg.addColorStop(1, PAL.holz[1]);
      ctx.fillStyle = qg; ctx.fillRect(0, 0, B, 24);
      ctx.strokeStyle = PAL.holz[1]; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(B * 0.035, 70); ctx.lineTo(B * 0.035 + 54, 22); ctx.moveTo(B * 0.965, 70); ctx.lineTo(B * 0.965 - 54, 22); ctx.stroke();
    } else if (S.fx === "schichten") {
      for (let k = 0; k < 7; k++) {
        const y = H * (0.1 + k * 0.14);
        ctx.strokeStyle = "rgba(190,205,225," + (0.05 + hash(k + 610) * 0.05) + ")"; ctx.lineWidth = 4 + hash(k + 620) * 8;
        ctx.beginPath(); ctx.moveTo(-10, y); ctx.bezierCurveTo(B * 0.3, y + (hash(k + 630) - 0.5) * 50, B * 0.7, y + (hash(k + 640) - 0.5) * 50, B + 10, y + (hash(k + 650) - 0.5) * 30); ctx.stroke();
      }
    } else if (S.fx === "kristalle") {
      for (let k = 0; k < 10; k++) {
        const x = hash(k + 500) * B, y = H * (0.12 + hash(k + 520) * 0.8);
        if (Math.abs(x - B / 2) < B * 0.2 && Math.abs(y - H / 2) < H * 0.3) continue;
        const puls = ruhig ? 0.7 : 0.55 + 0.35 * Math.sin(jetzt / 900 + k);
        ctx.save(); ctx.globalAlpha = alpha * puls; ctx.shadowColor = "rgb(" + PAL.gem + ")"; ctx.shadowBlur = 14;
        for (let j = 0; j < 3; j++) {
          prisma(x + (j - 1) * 6, y, 14 + hash(k * 3 + j) * 22, 3 + hash(k + j + 9) * 3, -Math.PI / 2 + (j - 1) * 0.45, "rgba(" + PAL.gem + ",.85)", "rgba(" + PAL.gem + ",.45)");
        }
        ctx.restore();
      }
    } else if (S.fx === "glut") {
      const bg = ctx.createLinearGradient(0, H * 0.55, 0, H);
      bg.addColorStop(0, "rgba(255,110,40,0)"); bg.addColorStop(1, "rgba(220,140,150,.14)");
      ctx.fillStyle = bg; ctx.fillRect(-10, 0, B + 20, H);
      for (let k = 0; k < 34; k++) {
        const sp = 0.02 + hash(k + 700) * 0.04, y = H - ((ruhig ? 0 : jetzt * sp) + hash(k + 710) * H) % H;
        const x = hash(k + 720) * B + (ruhig ? 0 : Math.sin(jetzt / 700 + k) * 10), fade = y / H;
        ctx.fillStyle = "rgba(240,180,170," + (0.7 * fade) + ")";
        ctx.beginPath(); ctx.arc(x, y, 1 + hash(k + 730) * 1.8, 0, 6.283); ctx.fill();
      }
    } else if (S.fx === "sterne") {
      const ng = ctx.createRadialGradient(B * 0.76, H * 0.26, 0, B * 0.76, H * 0.26, B * 0.35);
      ng.addColorStop(0, "rgba(150,120,255,.16)"); ng.addColorStop(1, "rgba(150,120,255,0)");
      ctx.fillStyle = ng; ctx.fillRect(-10, 0, B + 20, H);
      for (let k = 0; k < 70; k++) {
        const tw = ruhig ? 0.6 : 0.3 + 0.7 * Math.abs(Math.sin(jetzt / (600 + hash(k) * 900) + k));
        ctx.fillStyle = "rgba(225,220,255," + tw + ")";
        ctx.beginPath(); ctx.arc(hash(k + 800) * B, hash(k + 810) * H * 0.9, 0.6 + hash(k + 820) * 1.3, 0, 6.283); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Der Bohrturm links: Geruest, Rad, Motor mit Lampe, drehender
     Bohrkopf, Staub. Schneller mit hoeherer Bohrerstufe, still ohne
     Bohrer. */
  function bohrturm(jetzt) {
    const lv = stand.bohrer || 0, ruhig = RUHIG.matches || lv === 0;
    const x = bohrX(), oben = H * 0.1, boden = H * 0.88;
    const zt = ruhig ? 0 : jetzt;
    const wipp = Math.sin(zt * 0.03 * (1 + lv * 0.15)) * 1.4;
    ctx.save(); ctx.globalAlpha = lv === 0 ? 0.55 : 0.92;
    ctx.fillStyle = PAL.metall[1];
    ctx.fillRect(x - 34, oben, 5, boden - oben); ctx.fillRect(x + 29, oben, 5, boden - oben);
    ctx.strokeStyle = PAL.metall[1]; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = oben + 10; y < boden - 40; y += 44) { ctx.moveTo(x - 30, y); ctx.lineTo(x + 30, y); ctx.moveTo(x - 30, y); ctx.lineTo(x + 30, y + 44); }
    ctx.stroke();
    ctx.save(); ctx.translate(x, oben); ctx.rotate(zt * 0.004 * (1 + lv * 0.2));
    ctx.strokeStyle = PAL.metall[0]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 3; k++) { const w = k * 2.094; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(w) * 12, Math.sin(w) * 12); } ctx.stroke();
    ctx.restore();
    const my = H * 0.42 + wipp;
    ctx.strokeStyle = PAL.metall[0]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, oben + 12); ctx.lineTo(x, my - 26); ctx.stroke();
    const mg = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    mg.addColorStop(0, PAL.metall[1]); mg.addColorStop(0.4, PAL.metall[0]); mg.addColorStop(1, PAL.metall[1]);
    ctx.fillStyle = mg; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - 30, my - 26, 60, 52, 6); else ctx.rect(x - 30, my - 26, 60, 52);
    ctx.fill();
    ctx.fillStyle = PAL.akzent; ctx.fillRect(x - 30, my - 4, 60, 4);
    const an = lv > 0 && (RUHIG.matches || Math.floor(jetzt / 450) % 2 === 0);
    ctx.fillStyle = an ? PAL.akzent : PAL.metall[1]; ctx.shadowColor = PAL.akzent; ctx.shadowBlur = an ? 10 : 0;
    ctx.beginPath(); ctx.arc(x + 18, my - 15, 3, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = PAL.metall[1]; ctx.fillRect(x - 4, my + 26, 8, H * 0.12);
    const bt = my + 26 + H * 0.12, spitze = boden + 4;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x - 13, bt); ctx.lineTo(x + 13, bt); ctx.lineTo(x, spitze); ctx.closePath();
    const bg = ctx.createLinearGradient(x - 13, 0, x + 13, 0);
    bg.addColorStop(0, PAL.metall[1]); bg.addColorStop(0.45, mix(PAL.metall[0], "#ffffff", 0.25)); bg.addColorStop(1, PAL.metall[1]);
    ctx.fillStyle = bg; ctx.fill(); ctx.clip();
    const versatz = (zt * 0.02 * (1 + lv * 0.3)) % 12;
    ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 3; ctx.beginPath();
    for (let y = bt - 12 + versatz; y < spitze + 12; y += 12) { ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y + 8); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x, boden + 10, 52, 12, 0, 0, 6.283); ctx.fill();
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = k % 3 ? "rgba(" + PAL.gold + ",.75)" : PAL.brocken;
      ctx.beginPath(); ctx.arc(x - 40 + hash(k + 900) * 80, boden + 4 + hash(k + 910) * 10, 1.5 + hash(k + 920) * 2.5, 0, 6.283); ctx.fill();
    }
    if (!ruhig) for (let k = 0; k < 4; k++) {
      const ph = ((jetzt / 900) + k / 4) % 1;
      ctx.fillStyle = "rgba(200,190,175," + (0.18 * (1 - ph)) + ")";
      ctx.beginPath(); ctx.arc(x + (k % 2 ? 1 : -1) * (8 + ph * 26), boden - ph * 26, 5 + ph * 12, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  function bild(jetzt) {
    if (!seiteOffen() || !canvas) { raf = 0; return; }
    raf = requestAnimationFrame(bild);
    if (!ctx) ctx = canvas.getContext("2d");
    const ruhig = RUHIG.matches;
    const tiefe = tiefeVon(stand && stand.bloecke_gesamt);
    if (tiefeJetzt !== tiefe) {
      tiefeAlt = tiefeJetzt < 0 ? tiefe : tiefeJetzt;
      tiefeSeit = tiefeJetzt < 0 ? 0 : jetzt;
      tiefeJetzt = tiefe;
    }
    ctx.setTransform(D, 0, 0, D, 0, 0);
    ctx.clearRect(0, 0, B, H);
    const wx = wackeln ? (Math.random() - 0.5) * wackeln : 0;
    wackeln = Math.max(0, wackeln - 0.6);
    ctx.save();
    ctx.translate(wx, 0);
    /* Neue Tiefe blendet ueber */
    const ueber = ruhig ? 1 : Math.min(1, (jetzt - tiefeSeit) / 1400);
    if (ueber < 1) hintergrund(tiefeAlt, jetzt, 1);
    hintergrund(tiefeJetzt, jetzt, ueber);
    const lampe = stand ? stand.lampe || 0 : 0;
    for (let i = 0; i < 14 + lampe * 2; i++) {
      const x = hash(i + 200) * B, y = hash(i + 300) * H * 0.85, glanz = 0.4 + 0.6 * Math.abs(Math.sin(jetzt * 0.002 + i));
      ctx.fillStyle = i % 5 === 0 ? "rgba(" + PAL.gem + "," + (0.5 * glanz) + ")" : "rgba(" + PAL.gold + "," + (0.55 * glanz) + ")";
      ctx.beginPath(); ctx.arc(x, y, 1.4 + hash(i + 400) * 2, 0, 6.283); ctx.fill();
    }
    if (stand && mitBohrturm()) bohrturm(jetzt);
    /* Risse vom Hacken */
    risse = risse.filter(function (r) { return jetzt - r.t0 < 2500; });
    risse.forEach(function (r) {
      const a = 1 - (jetzt - r.t0) / 2500;
      ctx.strokeStyle = "rgba(" + PAL.riss + "," + (0.5 * a) + ")"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const w = r.w + k * 1.57;
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + Math.cos(w) * 18, r.y + Math.sin(w) * 18);
        ctx.lineTo(r.x + Math.cos(w + 0.3) * 30, r.y + Math.sin(w + 0.3) * 30);
      }
      ctx.stroke();
    });
    if (stand && stand.block) blockZeichnen(jetzt);
    /* Lichtkegel der Grubenlampe */
    const licht = ctx.createRadialGradient(B / 2, H * 0.4, 0, B / 2, H * 0.4, Math.max(B, H) * (0.35 + 0.03 * lampe));
    licht.addColorStop(0, "rgba(" + PAL.licht + "," + (PAL.lichtA + 0.015 * lampe) + ")"); licht.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = licht; ctx.fillRect(-10, 0, B + 20, H);
    /* "+n Erz" aus der Lore, ueber dem Bohrturm */
    schwebend = schwebend.filter(function (o) { return jetzt - o.t0 < 1300; });
    ctx.font = "600 13px Inter, sans-serif"; ctx.textAlign = "center";
    schwebend.forEach(function (o) {
      const f = (jetzt - o.t0) / 1300;
      ctx.globalAlpha = 1 - f; ctx.fillStyle = PAL.fund.gold;
      ctx.fillText(o.text, bohrX(), H * 0.34 - f * 36);
    });
    ctx.globalAlpha = 1;
    /* Funken und Brocken */
    const dt = 1 / 60;
    teilchen = teilchen.filter(function (p) { return jetzt - p.t0 < 900; });
    teilchen.forEach(function (p) {
      p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - (jetzt - p.t0) / 900);
      ctx.fillStyle = p.brocken ? PAL.brocken : p.farbe;
      if (p.brocken) ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2.2, p.r * 2);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    /* Hinweis fuer die ersten Hiebe */
    if (stand && !stand.gesperrt && (stand.schlaege_gesamt || 0) < 3 && !teilchen.length) {
      ctx.fillStyle = "rgba(233,233,237,.8)";
      ctx.font = "500 15px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("mine.tipp", "Hau auf den Block!"), B / 2, H * 0.92);
    }
  }

  /* Der Block in der Mitte: facettiert, von links oben beleuchtet, mit
     Merkmal seiner Art (Brocken, Glitzer, Nuggets, Leuchtkristalle) und
     Rissen je verlorenem Leben. Beim Hieb staucht er kurz. */
  function blockZeichnen(jetzt) {
    const b = stand.block, c = PAL.block[b.art] || PAL.block.stein, ruhig = RUHIG.matches;
    const anteil = b.max > 0 ? blockLeben() / b.max : 0;
    const auf = ruhig ? 1 : Math.min(1, (jetzt - blockSeit) / 260);
    const hieb = ruhig ? 0 : Math.max(0, 1 - (jetzt - hiebSeit) / 160);
    const gr = Math.min(B, H) * 0.32 * (0.6 + 0.4 * (1 - Math.pow(1 - auf, 3)));
    const glueh = b.art === "raumerz" || b.art === "kristall";
    const cx = B / 2, cy = H * 0.5 + (glueh && !ruhig ? Math.sin(jetzt / 600) * 3 : 0), saat = (stand.bloecke_gesamt || 0) * 7 + 3;
    ctx.save(); ctx.globalAlpha = auf;
    /* Schatten */
    const sg = ctx.createRadialGradient(cx, H * 0.5 + gr * 0.86, 0, cx, H * 0.5 + gr * 0.86, gr * 1.1);
    sg.addColorStop(0, "rgba(0,0,0,.6)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(cx, H * 0.5 + gr * 0.86, gr * 1.1, gr * 0.24, 0, 0, 6.283); ctx.fill();
    if (glueh) {
      const ag = ctx.createRadialGradient(cx, cy, gr * 0.3, cx, cy, gr * 1.7);
      ag.addColorStop(0, rgba(c.ader, 0.22 + (ruhig ? 0 : 0.08 * Math.sin(jetzt / 400)))); ag.addColorStop(1, rgba(c.ader, 0));
      ctx.fillStyle = ag; ctx.fillRect(cx - gr * 2, cy - gr * 2, gr * 4, gr * 4);
    }
    ctx.translate(cx, cy); ctx.scale(1 + hieb * 0.05, 1 - hieb * 0.07);
    const n = 10, pts = [];
    for (let i = 0; i < n; i++) {
      const w = i / n * 6.283 + hash(saat + i) * 0.35, r = gr * (0.8 + hash(saat + i + 40) * 0.24);
      pts.push([Math.cos(w) * r, Math.sin(w) * r * 0.84]);
    }
    const spitze = [-gr * 0.12, -gr * 0.18], lw = -2.3;
    function pfad() { ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
    /* Facetten */
    for (let i = 0; i < n; i++) {
      const a = pts[i], q = pts[(i + 1) % n];
      const m = Math.atan2((a[1] + q[1]) / 2, (a[0] + q[0]) / 2);
      const hell = 0.5 + 0.5 * Math.cos(m - lw);
      const col = mix(c.grund, c.hell, Math.min(1, hell * 0.85 + hash(saat + i + 200) * 0.12));
      ctx.beginPath(); ctx.moveTo(spitze[0], spitze[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; ctx.beginPath();
    pts.forEach(function (p) { ctx.moveTo(spitze[0], spitze[1]); ctx.lineTo(p[0], p[1]); }); ctx.stroke();
    ctx.save(); pfad(); ctx.clip();
    if (b.art === "stein") {
      for (let i = 0; i < 14; i++) {
        const x = (hash(saat + i + 60) - 0.5) * gr * 1.6, y = (hash(saat + i + 80) - 0.5) * gr * 1.4, r = 2 + hash(saat + i + 90) * 5;
        ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, hash(saat + i) * 3, 0, 6.283); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.4, 0, 0, 6.283); ctx.fill();
      }
    } else {
      ctx.strokeStyle = c.ader; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const y0 = (hash(saat + i * 3) - 0.5) * gr * 1.3;
        ctx.globalAlpha = 0.55; ctx.lineWidth = b.art === "gold" ? 4 : 2;
        ctx.beginPath(); ctx.moveTo(-gr, y0);
        ctx.quadraticCurveTo(0, y0 + (hash(saat + i + 9) - 0.5) * gr, gr, y0 + (hash(saat + i + 17) - 0.5) * gr * 0.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (b.art === "eisen") {
      for (let i = 0; i < 16; i++) {
        const x = (hash(saat + i + 60) - 0.5) * gr * 1.5, y = (hash(saat + i + 80) - 0.5) * gr * 1.3, r = 2 + hash(saat + i + 90) * 3.5;
        ctx.fillStyle = mix(c.hell, c.ader, 0.5);
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r * 0.8); ctx.lineTo(x + r, y + r * 0.2); ctx.lineTo(x - r * 0.2, y + r); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255," + (ruhig ? 0.5 : 0.3 + 0.5 * Math.abs(Math.sin(jetzt / 500 + i))) + ")";
        ctx.fillRect(x - r * 0.4, y - r * 0.4, 1.5, 1.5);
      }
    }
    if (b.art === "gold") {
      for (let i = 0; i < 8; i++) {
        const x = (hash(saat + i + 60) - 0.5) * gr * 1.4, y = (hash(saat + i + 80) - 0.5) * gr * 1.2, r = 4 + hash(saat + i + 90) * 6;
        const ng = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
        ng.addColorStop(0, "#fff4cc"); ng.addColorStop(0.45, c.ader); ng.addColorStop(1, mix(c.ader, "#000000", 0.55));
        ctx.fillStyle = ng; ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const w = k / 6 * 6.283, rr = r * (0.75 + hash(saat + i * 6 + k) * 0.35);
          if (k) ctx.lineTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr); else ctx.moveTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr);
        }
        ctx.closePath(); ctx.fill();
        if (i < 3) funkeln(x - r * 0.3, y - r * 0.3, r * 0.9, ruhig ? 0.6 : Math.max(0, Math.sin(jetzt / 350 + i * 2)));
      }
    }
    if (glueh) {
      const kg = ctx.createRadialGradient(0, 0, 0, 0, 0, gr * 0.9);
      kg.addColorStop(0, rgba(c.ader, 0.45)); kg.addColorStop(1, rgba(c.ader, 0));
      ctx.fillStyle = kg; ctx.fillRect(-gr, -gr, gr * 2, gr * 2);
      for (let i = 0; i < 12; i++) {
        const x = (hash(saat + i + 60) - 0.5) * gr * 1.4, y = (hash(saat + i + 80) - 0.5) * gr * 1.2;
        ctx.globalAlpha = ruhig ? 0.8 : 0.4 + 0.6 * Math.abs(Math.sin(jetzt / 400 + i));
        ctx.fillStyle = i % 3 ? c.ader : PAL.extra;
        ctx.beginPath(); ctx.arc(x, y, 1.4 + hash(saat + i) * 2.2, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    /* Risse je verlorenem Leben */
    const zahlRisse = Math.round((1 - anteil) * 9);
    for (let i = 0; i < zahlRisse; i++) {
      const w = hash(saat + i + 120) * 6.283, l = gr * (0.4 + hash(saat + i + 140) * 0.55);
      const p1 = [Math.cos(w) * l * 0.5, Math.sin(w) * l * 0.5], p2 = [Math.cos(w + 0.25) * l, Math.sin(w + 0.25) * l];
      ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(p1[0] + 1, p1[1] + 1); ctx.lineTo(p2[0] + 1, p2[1] + 1); ctx.stroke();
      ctx.strokeStyle = "rgba(8,5,3,.85)"; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    ctx.restore();
    pfad(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.stroke();
    pfad();
    const rl = ctx.createLinearGradient(-gr, -gr, gr * 0.3, gr * 0.3);
    rl.addColorStop(0, "rgba(255,255,255,.4)"); rl.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.strokeStyle = rl; ctx.lineWidth = 1.5; ctx.stroke();
    if (glueh) {
      const anz = b.art === "raumerz" ? 5 : 4;
      ctx.shadowColor = c.ader; ctx.shadowBlur = ruhig ? 14 : 14 + 6 * Math.sin(jetzt / 300);
      for (let i = 0; i < anz; i++) {
        const ang = -Math.PI / 2 + (hash(saat + i + 300) - 0.5) * 1.9;
        const bx = Math.cos(ang) * gr * 0.42, by = Math.sin(ang) * gr * 0.36;
        prisma(bx, by, gr * (0.3 + hash(saat + i + 310) * 0.35), gr * (0.06 + hash(saat + i + 320) * 0.04), ang, mix(c.ader, "#ffffff", 0.3), c.hell);
      }
      ctx.shadowBlur = 0;
      if (!ruhig) for (let i = 0; i < 2; i++) funkeln((hash(saat + i + 330) - 0.5) * gr, -gr * (0.5 + hash(saat + i + 340) * 0.3), 6, Math.max(0, Math.sin(jetzt / 420 + i * 3)));
    }
    ctx.restore();
  }

  window.updateGluecksminePage = function (pageID) {
    if (pageID !== "gluecksmine") {
      cancelAnimationFrame(raf); raf = 0;
      clearInterval(bohrUhr); bohrUhr = null;
      clearInterval(loreUhr); loreUhr = null;
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
    raumerzSetzen: function (n) { if (stand && !stand.gesperrt) stand.raumerz = n; },
  };
})();
