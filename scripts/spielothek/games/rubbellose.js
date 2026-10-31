/* ============================================================
   SPIELOTHEK - RUBBELLOSE (Redesign v2 aus Claude Design)
   ------------------------------------------------------------
   Vier Lose zum Selbst-Aufrubbeln: 3 x 3 Felder mit Betraegen,
   wer DREIMAL denselben Betrag findet, gewinnt genau diesen.

     Flaschenpost        25 Dublonen   bis    2.500
     Schatzkiste        100 Dublonen   bis   10.000
     Krakenschlund      250 Dublonen   bis   15.000
     Goldene Galeone  1.000 Dublonen   bis   20.000

   AUSSEHEN: Entwurf "Rubbellose Redesign v2" (Nocturne). Links Loswahl,
   Gewinnplan mit Chancen und Ändii, rechts das Los mit Perforation und
   Seriennummer; man rubbelt mit einer Muenze (eigener Cursor), die
   Folie bekommt Glanz unter der Maus, Kruemel fallen mit Schwerkraft
   auf die Unterkante, ein Paar leuchtet mit "2x" und pulsiert, am Ende
   Kreise um die Treffer, Stempel "Gewonnen"/"Niete", Muenzregen, dazu
   ein synthetischer Klang (abschaltbar) und der Verlauf der Sitzung.
   Die Logik des Entwurfs (Klasse Component) steht hier fast woertlich
   als einfaches JavaScript ohne React.

   FREIGABE: "rubbellose" (Gateway -> Live-Event -> Freigaben).
   Ist sie an, zeigt die Spielothek die Lose statt des Einarmigen
   Banditen (spielothek.js fragt fhRubbellose.aktiv()). Vorher sieht
   nur der Admin sie als Vorschau und kann zum Banditen wechseln.

   ABRECHNUNG wie beim Banditen (siehe spielothek.js und
   games/slot.js): Der Browser zieht das Los, EIN Update auf
   "players" bucht Einsatz und Gewinn zugleich, die Datenbank prueft
   Deckel (valid_players_write, Tagesdeckel aus Migration 41) und die
   4-s-Sperre (last_spielothek_play_at). Keine eigene Migration.
   Gebucht wird beim KAUF - das Rubbeln deckt nur auf, was schon
   feststeht. Damit das Guthaben die Ueberraschung nicht verraet,
   zeigt die Anzeige bis zum Aufdecken den Stand nach dem Einsatz.

   BALANCE: je Los rund 95 % Auszahlung, Gewinn in knapp 4 von 10
   Losen (der kleinste Gewinn ist der Einsatz zurueck). Die Zahlen
   stehen in RUBBELLOSE unten; wer sie aendert, rechnet die Quote
   neu: Summe(Betrag / Preis * Chance) ueber alle Gewinne.
   Hoechster Gewinn 20.000, mit Skill-Bonus bis 25.000 - unter dem
   30.000-Deckel je Schreibvorgang.
============================================================ */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function sprache() { return typeof getCurrentLang === "function" ? getCurrentLang() : "de"; }
  function zahl(n) { return Number(n).toLocaleString(sprache() === "en" ? "en-US" : "de-DE"); }
  function ruhig() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* Vibration ist nur Beiwerk */ } }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* Zeichen aus lucide (ISC): scroll, package (Truhe), waves, sailboat. */
  const ICONS = {
    flaschenpost: ["M19 17V5a2 2 0 0 0-2-2H4", "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"],
    schatzkiste: ["M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z", "M12 22V12", "M3.29 7 12 12 20.71 7", "m7.5 4.27 9 5.15"],
    kraken: ["M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1", "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1", "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"],
    galeone: ["M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z", "M21 14 10 2 3 14h18Z", "M10 2v16"],
  };
  function svg(id, klasse) {
    return '<svg class="' + klasse + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + ICONS[id].map(function (d) { return '<path d="' + d + '"/>'; }).join("") + "</svg>";
  }
  const MUENZE_SVG = '<svg class="rubbel-feld-muenze" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3"/></svg>';

  /* Gewinne je Los: Betrag und Chance je Los (Rest = Niete). */
  const RUBBELLOSE = [
    { id: "flaschenpost", preis: 25, gewinne: [[25, 0.22], [50, 0.09], [100, 0.055], [250, 0.016], [500, 0.005], [2500, 0.0007]] },
    { id: "schatzkiste", preis: 100, gewinne: [[100, 0.225], [200, 0.10], [500, 0.045], [1000, 0.015], [2500, 0.004], [10000, 0.0005]] },
    { id: "kraken", preis: 250, gewinne: [[250, 0.21], [500, 0.10], [1000, 0.05], [2500, 0.016], [5000, 0.006], [15000, 0.001]] },
    { id: "galeone", preis: 1000, gewinne: [[1000, 0.22], [2000, 0.10], [3000, 0.06], [5000, 0.03], [10000, 0.012], [20000, 0.004]] },
  ];
  const NAMEN = {
    flaschenpost: ["rubbel.los.flaschenpost", "Flaschenpost"],
    schatzkiste: ["rubbel.los.schatzkiste", "Schatzkiste"],
    kraken: ["rubbel.los.kraken", "Krakenschlund"],
    galeone: ["rubbel.los.galeone", "Goldene Galeone"],
  };
  function losName(id) { return t(NAMEN[id][0], NAMEN[id][1]); }
  function losVon(id) { return RUBBELLOSE.find(function (l) { return l.id === id; }) || RUBBELLOSE[1]; }
  function hauptgewinn(los) { return los.gewinne[los.gewinne.length - 1][0]; }

  /* Ändiis Sprueche je Lage (i18n: rubbel.spruch.<art><n>). */
  const SPRUCH_ANZAHL = { idle: 5, paar: 3, win: 3, lose: 5 };
  function spruch(art) {
    const n = 1 + Math.floor(Math.random() * SPRUCH_ANZAHL[art]);
    const ersatz = { idle: "Ich hab doch gesagt, lass es!", paar: "Zwei gleiche. Das heißt gar nichts.", win: "Pah. Anfängerglück.", lose: "ICH HABE DICH GEWARNT!" };
    return t("rubbel.spruch." + art + n, ersatz[art]);
  }

  /* Farben aus den Tokens - der Canvas braucht echte Werte. */
  function farbe(name, ersatz) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || ersatz;
  }
  function tonVon(id) {
    return farbe("--fh-rubbel-" + id, { flaschenpost: "#2f8f8a", schatzkiste: "#c9893a", kraken: "#7a4fc0", galeone: "#f0c96a" }[id]);
  }

  /* ------------------------------------------------------
     DAS LOS ZIEHEN
     ---------------------------------------------------
     Gewinn: der Betrag steht genau dreimal, jeder andere hoechstens
     zweimal. Niete: kein Betrag dreimal - gern aber ein Paar des
     Hauptgewinns, das macht das Rubbeln spannend.
  ------------------------------------------------------ */
  function mischen(liste) {
    for (let i = liste.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const x = liste[i]; liste[i] = liste[j]; liste[j] = x;
    }
    return liste;
  }

  function ziehen(los) {
    let r = Math.random(), gewinn = 0;
    for (let i = 0; i < los.gewinne.length; i++) {
      r -= los.gewinne[i][1];
      if (r < 0) { gewinn = los.gewinne[i][0]; break; }
    }
    const betraege = los.gewinne.map(function (g) { return g[0]; });
    const felder = gewinn ? [gewinn, gewinn, gewinn] : [];
    const vorrat = [];
    betraege.forEach(function (b) { if (b !== gewinn) vorrat.push(b, b); });
    mischen(vorrat);
    const haupt = betraege[betraege.length - 1];
    if (!gewinn && Math.random() < 0.55) {
      felder.push(haupt, haupt);
      vorrat.splice(vorrat.indexOf(haupt), 1);
      vorrat.splice(vorrat.indexOf(haupt), 1);
    }
    while (felder.length < 9) felder.push(vorrat.pop());
    mischen(felder);
    const treffer = [];
    if (gewinn) felder.forEach(function (b, i) { if (b === gewinn) treffer.push(i); });
    return { gewinn: gewinn, felder: felder, treffer: treffer };
  }

  /* ------------------------------------------------------
     KLANG: Rauschen beim Rubbeln, Ticks, Paar, Stempel, Gewinn.
     Erst auf eine Geste hin angelegt (Browser-Regel).
  ------------------------------------------------------ */
  function Klang() {}
  Klang.prototype.ensure = function () {
    if (this.ac) { if (this.ac.state === "suspended") this.ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      const ac = this.ac = new AC();
      const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.7;
      this.g = ac.createGain(); this.g.gain.value = 0;
      src.connect(bp).connect(this.g).connect(ac.destination); src.start();
      this.bp = bp;
      return true;
    } catch (e) {
      this.ac = null;
      return false;
    }
  };
  Klang.prototype.rubbeln = function (v) { if (!this.ac) return; const z = this.ac.currentTime; this.g.gain.setTargetAtTime(Math.min(0.09, v * 0.0025), z, 0.02); this.bp.frequency.setTargetAtTime(2400 + Math.min(2400, v * 40), z, 0.05); };
  Klang.prototype.still = function () { if (this.ac) this.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.04); };
  Klang.prototype.kruemel = function () { if (!this.ac) return; const z = this.ac.currentTime; this.bp.frequency.setTargetAtTime(4200, z, 0.01); this.g.gain.setTargetAtTime(0.05, z, 0.004); this.g.gain.setTargetAtTime(0, z + 0.05, 0.03); };
  Klang.prototype.ton = function (f, dauer, typ, vol, wann) {
    if (!this.ac) return;
    const ac = this.ac, z = ac.currentTime + (wann || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = typ || "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0, z); g.gain.linearRampToValueAtTime(vol || 0.08, z + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, z + dauer);
    o.connect(g).connect(ac.destination); o.start(z); o.stop(z + dauer + 0.02);
  };
  Klang.prototype.tick = function (n) { this.ton(520 * Math.pow(1.06, n), 0.12, "triangle", 0.06); };
  Klang.prototype.paar = function () { this.ton(660, 0.14, "sine", 0.07); this.ton(880, 0.18, "sine", 0.06, 0.07); this.ton(72, 0.2, "sine", 0.14, 0.25); this.ton(64, 0.24, "sine", 0.12, 0.42); };
  Klang.prototype.stempel = function () { this.ton(110, 0.12, "square", 0.04); this.ton(70, 0.2, "sine", 0.12); };
  Klang.prototype.gewinn = function () { const k = this; [523, 659, 784, 1047].forEach(function (f, i) { k.ton(f, 0.35, "triangle", 0.08, 0.1 + i * 0.09); }); };
  Klang.prototype.niete = function () { this.ton(220, 0.3, "sine", 0.06, 0.1); this.ton(185, 0.4, "sine", 0.05, 0.22); };

  /* ------------------------------------------------------
     ZUSTAND (bleibt ueber Seitenwechsel erhalten)
  ------------------------------------------------------ */
  const OPT = { flocken: true, pinsel: 30, schwelle: 0.5, paare: true, neigen: true };
  const TON_SCHLUESSEL = "fhRubbelTon";
  const VORSCHAU_SCHLUESSEL = "fhRubbelVorschauAus";
  const klang = new Klang();
  const S = {
    sel: "schatzkiste", runde: null, fertigId: null, letzte: null, anzBal: null,
    status: "", spruch: "", verlauf: [], netto: 0, beschaeftigt: false, sperreBis: 0,
  };
  let E = null;          // Elemente der aktuellen Ansicht
  let fx = null;         // Zeichen-Zustand (Canvas, Partikel, Kreise ...)
  let sperreUhr = null;

  function tonAn() {
    try { return localStorage.getItem(TON_SCHLUESSEL) !== "aus"; } catch (e) { return true; }
  }
  function tonSetzen(an) {
    try { localStorage.setItem(TON_SCHLUESSEL, an ? "an" : "aus"); } catch (e) { /* gilt dann nur bis zum Neuladen */ }
  }

  function vorschauAus() {
    try { return sessionStorage.getItem(VORSCHAU_SCHLUESSEL) === "1"; } catch (e) { return false; }
  }

  function aktiv() {
    if (typeof window.fhFeatureSichtbar !== "function" || !window.fhFeatureSichtbar("rubbellose")) return false;
    return !(window.fhFeatureNurVorschau("rubbellose") && vorschauAus());
  }

  /* Nur fuer den Admin in der Vorschau: zwischen Losen und Banditen wechseln. */
  function vorschauUmschalten(aus) {
    try {
      if (aus) sessionStorage.setItem(VORSCHAU_SCHLUESSEL, "1");
      else sessionStorage.removeItem(VORSCHAU_SCHLUESSEL);
    } catch (e) { /* ohne Speicher gilt die Wahl nur bis zum naechsten Neuaufbau */ }
    if (S.runde && S.runde.fertig) S.runde = null;
    if (typeof renderSpielothekPage === "function") renderSpielothekPage();
  }

  /* ------------------------------------------------------
     AUFBAU
  ------------------------------------------------------ */
  function zeigen(container) {
    abbauen();
    if (S.runde && S.runde.fertig) { S.runde = null; S.fertigId = null; }
    if (!S.spruch) S.spruch = spruch("idle");
    if (!S.status) S.status = t("rubbel.statusStart", "Wähl ein Los und kauf es.");
    const seite = document.getElementById("spielothek");
    if (seite) seite.classList.add("ist-rubbellose");
    const vorschau = window.fhFeatureNurVorschau && window.fhFeatureNurVorschau("rubbellose");
    const andi = typeof CHARACTER_DATABASE !== "undefined" && CHARACTER_DATABASE.andi ? CHARACTER_DATABASE.andi.image : "scripts/avatare/ändii.webp";

    container.innerHTML = ''
      + (vorschau ? '<p class="rubbel-vorschau">' + esc(t("rubbel.vorschau", "Vorschau – die Rubbellose sind noch nicht freigegeben und nur für dich sichtbar."))
        + ' <button type="button" class="rubbel-link" data-aktion="bandit">' + esc(t("rubbel.zumBandit", "Zum Einarmigen Banditen")) + "</button></p>" : "")
      + '<div class="rubbel" id="rubbel-buehne">'
      + '<header class="rubbel-kopf">'
      + '  <div class="rubbel-kopf-text">'
      + '    <h6 class="rubbel-h6">' + esc(t("rubbel.kicker", "Ändiis Spielothek")) + "</h6>"
      + '    <h1 class="rubbel-h1">' + esc(t("rubbel.titel", "Rubbellose")) + "</h1>"
      + '    <p class="rubbel-unter">' + esc(t("rubbel.unter", "Drei gleiche Beträge gewinnen genau diesen Betrag.")) + "</p>"
      + "  </div>"
      + '  <div class="rubbel-kopf-rechts">'
      + '    <div class="rubbel-anzeigen">'
      + '      <div class="rubbel-anzeige ist-breit"><span class="rubbel-anzeige-titel">' + esc(t("spielothek.anzeigeGuthaben", "Guthaben")) + '</span><span class="rubbel-anzeige-wert" id="rubbel-guthaben">–––</span></div>'
      + '      <div class="rubbel-anzeige-trenner"></div>'
      + '      <div class="rubbel-anzeige"><span class="rubbel-anzeige-titel">' + esc(t("spielothek.anzeigeEinsatz", "Einsatz")) + '</span><span class="rubbel-anzeige-wert" id="rubbel-einsatz">–</span></div>'
      + '      <div class="rubbel-anzeige-trenner"></div>'
      + '      <div class="rubbel-anzeige ist-breit"><span class="rubbel-anzeige-titel">' + esc(t("spielothek.anzeigeLetzte", "Letzte Runde")) + '</span><span class="rubbel-anzeige-wert" id="rubbel-letzte">—</span></div>'
      + "    </div>"
      + '    <button type="button" class="rubbel-laut" id="rubbel-laut"></button>'
      + "  </div>"
      + "</header>"
      + '<div class="rubbel-spalten">'
      + '  <aside class="rubbel-seite">'
      + '    <div class="rubbel-gruppe"><h6 class="rubbel-h6">' + esc(t("rubbel.wahlAria", "Los wählen")) + '</h6><div class="rubbel-wahlen" id="rubbel-wahlen"></div></div>'
      + '    <div class="rubbel-gruppe"><div class="rubbel-plan-kopf"><h6 class="rubbel-h6">' + esc(t("rubbel.plan", "Gewinnplan")) + '</h6><span class="rubbel-klein" id="rubbel-chance"></span></div><div id="rubbel-plan"></div></div>'
      + '    <div class="rubbel-andi"><img src="' + esc(andi) + '" alt="Ändii" id="rubbel-andi-bild"><p id="rubbel-spruch"></p></div>'
      + "  </aside>"
      + '  <main class="rubbel-haupt">'
      + '    <div class="rubbel-wrap" id="rubbel-wrap">'
      + '      <div class="rubbel-stapel ist-hinten" aria-hidden="true"></div><div class="rubbel-stapel" aria-hidden="true"></div>'
      + '      <div class="rubbel-kipp" id="rubbel-kipp"><div class="rubbel-los" id="rubbel-los"></div></div>'
      + '      <canvas class="rubbel-fx" id="rubbel-fx" aria-hidden="true"></canvas>'
      + "    </div>"
      + '    <div class="rubbel-aktion"><button type="button" class="rubbel-knopf" id="rubbel-kaufen"></button><p class="rubbel-status" id="rubbel-status" role="status" aria-live="polite"></p></div>'
      + '    <div class="rubbel-verlauf" id="rubbel-verlauf" hidden></div>'
      + '    <p class="rubbel-hinweis">' + esc(t("rubbel.hinweisV2", "Mit Maus, Stift oder Finger rubbeln – langsam rubbelt breiter. Per Tastatur: Pfeiltasten wählen ein Feld, Enter deckt es auf. Abgerechnet wird beim Kauf.")) + "</p>"
      + "  </main>"
      + "</div></div>";

    E = {
      root: container.querySelector(".rubbel"), wrap: container.querySelector("#rubbel-wrap"), kipp: container.querySelector("#rubbel-kipp"),
      los: container.querySelector("#rubbel-los"), fx: container.querySelector("#rubbel-fx"), kaufen: container.querySelector("#rubbel-kaufen"),
      status: container.querySelector("#rubbel-status"), verlauf: container.querySelector("#rubbel-verlauf"), spruch: container.querySelector("#rubbel-spruch"),
      andi: container.querySelector("#rubbel-andi-bild"), wahlen: container.querySelector("#rubbel-wahlen"), plan: container.querySelector("#rubbel-plan"),
      chance: container.querySelector("#rubbel-chance"), guthaben: container.querySelector("#rubbel-guthaben"), einsatz: container.querySelector("#rubbel-einsatz"),
      letzte: container.querySelector("#rubbel-letzte"), laut: container.querySelector("#rubbel-laut"),
    };
    const zumBandit = container.querySelector('[data-aktion="bandit"]');
    if (zumBandit) zumBandit.addEventListener("click", function () { vorschauUmschalten(true); });
    E.kaufen.addEventListener("click", kaufen);
    E.laut.addEventListener("click", function () {
      const an = !tonAn();
      tonSetzen(an);
      if (!an) klang.still(); else klang.ensure();
      lautZeichnen();
    });
    E.wrap.addEventListener("pointermove", neigen);
    E.wrap.addEventListener("pointerleave", flach);

    fx = { partikel: [], fading: [], raf: 0, maus: null, sweep: -1, cursor: null, kreise: null, spannung: false, fokus: -1, zieht: false, dirty: true, tot: false };
    fx.ro = typeof ResizeObserver === "function" ? new ResizeObserver(function () { fx.schluessel = null; setupPruefen(); }) : null;

    lautZeichnen();
    seiteZeichnen();
    losZeichnen();
    spruchZeichnen(false);
    kopfZeichnen();
    knopfZeichnen();
    verlaufZeichnen();
    if (S.anzBal == null || !S.runde) guthabenLaden();
    else zahlZeigen(S.anzBal);
    sperreLaden();
  }

  /* Alles Laufende anhalten, wenn die Ansicht neu gebaut wird. */
  function abbauen() {
    if (fx) {
      fx.tot = true;
      cancelAnimationFrame(fx.raf);
      clearTimeout(fx.retry);
      if (fx.ro) fx.ro.disconnect();
    }
    klang.still();
    fx = null;
    E = null;
  }

  function lebt() { return !!(E && E.root && E.root.isConnected && fx && !fx.tot); }

  function lautZeichnen() {
    const an = tonAn();
    const label = an ? t("rubbel.tonAus", "Ton aus") : t("rubbel.tonAn", "Ton an");
    E.laut.setAttribute("aria-label", label);
    E.laut.title = label;
    E.laut.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>'
      + (an ? '<path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/>' : '<path d="M16 9l5 6"/><path d="M21 9l-5 6"/>') + "</svg>";
  }

  /* Linke Spalte: Loswahl und Gewinnplan. */
  function seiteZeichnen() {
    const r = S.runde, offen = !!(r && !r.fertig);
    E.wahlen.innerHTML = RUBBELLOSE.map(function (l) {
      const an = l.id === S.sel, gesperrt = offen && !an;
      return '<button type="button" class="rubbel-wahl' + (an ? " ist-an" : "") + '" data-los="' + l.id + '" aria-pressed="' + an + '"' + (gesperrt ? " disabled" : "")
        + ' style="--rb-ton: ' + tonVon(l.id) + '">'
        + '<span class="rubbel-wahl-marke"></span>' + svg(l.id, "rubbel-wahl-zeichen")
        + '<span class="rubbel-wahl-text"><span class="rubbel-wahl-name">' + esc(losName(l.id)) + '</span><span class="rubbel-wahl-top">' + esc(t("rubbel.bis", "Gewinne bis")) + " " + zahl(hauptgewinn(l)) + "</span></span>"
        + '<span class="rubbel-wahl-preis">' + zahl(l.preis) + "</span></button>";
    }).join("");
    E.wahlen.querySelectorAll(".rubbel-wahl").forEach(function (b) {
      b.addEventListener("click", function () { waehlen(b.getAttribute("data-los")); });
    });
    planZeichnen();
  }

  function planZeichnen() {
    const r = S.runde, los = r ? r.los : losVon(S.sel), ton = tonVon(los.id);
    const abgeschlossen = !!(r && r.fertig && S.fertigId === r.id);
    const summe = los.gewinne.reduce(function (a, g) { return a + g[1]; }, 0);
    E.chance.textContent = t("rubbel.gewinnchance", "Gewinnchance") + " 1 : " + Number((1 / summe).toFixed(1)).toLocaleString(sprache() === "en" ? "en-US" : "de-DE");
    E.plan.innerHTML = los.gewinne.slice().reverse().map(function (g) {
      const hit = abgeschlossen && r.z.gewinn === g[0];
      return '<div class="rubbel-plan-zeile' + (hit ? " ist-treffer" : "") + '" style="--rb-ton: ' + ton + '"><span>3 × ' + zahl(g[0]) + '</span><span class="rubbel-klein">1 : ' + zahl(Math.round(1 / g[1])) + "</span></div>";
    }).join("");
  }

  function spruchZeichnen(animiert) {
    E.spruch.textContent = S.spruch;
    if (!animiert || ruhig()) return;
    E.spruch.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    E.andi.animate([{ transform: "none" }, { transform: "translateY(-4px) rotate(-5deg)" }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  function spruchSetzen(text) { S.spruch = text; if (E) spruchZeichnen(true); }

  function kopfZeichnen() {
    const r = S.runde, los = r ? r.los : losVon(S.sel);
    E.einsatz.textContent = zahl(los.preis);
    E.letzte.textContent = S.letzte == null ? "—" : (S.letzte > 0 ? "+" : "") + zahl(S.letzte);
    E.letzte.classList.toggle("ist-plus", S.letzte != null && S.letzte > 0);
    E.letzte.classList.toggle("ist-leer", S.letzte == null);
  }

  function zahlZeigen(n) {
    if (!E) return;
    E.guthaben.textContent = zahl(n);
    E.guthaben.classList.remove("ist-ladend");
  }

  function statusSetzen(text) { S.status = text || ""; if (E) E.status.textContent = S.status; }

  function knopfZeichnen() {
    if (!E) return;
    const r = S.runde, offen = !!(r && !r.fertig), fertig = !!(r && r.fertig);
    const rest = S.sperreBis - Date.now();
    E.kaufen.disabled = offen || S.beschaeftigt || rest > 0;
    E.kaufen.textContent = offen ? t("rubbel.erstRubbeln", "Erst aufrubbeln")
      : rest > 0 ? t("spielothek.cooldownWaitButton", "WARTEN ...") + " (" + Math.ceil(rest / 1000) + ")"
      : (fertig ? t("rubbel.naechstes", "Nächstes Los") : t("rubbel.kaufen", "Los kaufen")) + " · " + zahl(losVon(S.sel).preis);
    E.status.textContent = S.status;
  }

  function verlaufZeichnen() {
    if (!E) return;
    if (!S.verlauf.length) { E.verlauf.hidden = true; return; }
    E.verlauf.hidden = false;
    const runden = S.verlauf.length === 1 ? t("rubbel.eineRunde", "1 Runde") : t("rubbel.runden", "{n} Runden").replace("{n}", S.verlauf.length);
    const netto = (S.netto > 0 ? "+" : S.netto < 0 ? "−" : "") + zahl(Math.abs(S.netto));
    E.verlauf.innerHTML = '<div class="rubbel-verlauf-kopf"><h6 class="rubbel-h6">' + esc(t("rubbel.letzteLose", "Letzte Lose")) + '</h6><span class="rubbel-klein">'
      + esc(runden) + " · " + esc(t("rubbel.sitzung", "Sitzung")) + ' <span class="' + (S.netto > 0 ? "ist-plus" : "") + '">' + netto + "</span></span></div>"
      + '<div class="rubbel-verlauf-liste">' + S.verlauf.map(function (v) {
        const titel = losName(v.los) + " · " + (v.gew ? t("rubbel.gewinnWort", "Gewinn") + " " + zahl(v.gew) : t("rubbel.nieteWort", "Niete"));
        return '<span class="rubbel-chip' + (v.gew ? " ist-gewinn" : "") + '" style="--rb-ton: ' + tonVon(v.los) + '" title="' + esc(titel) + '">' + (v.gew ? "+" + zahl(v.gew) : "−" + zahl(v.preis)) + "</span>";
      }).join("") + "</div>";
  }

  /* Das Los: Kopf mit Seriennummer, Perforation, Felder, Fusszeile. */
  function losZeichnen() {
    const r = S.runde, los = r ? r.los : losVon(S.sel), ton = tonVon(los.id);
    E.los.style.setProperty("--rb-ton", ton);
    const felder = [];
    for (let i = 0; i < 9; i++) {
      felder.push('<button type="button" class="rubbel-feld" data-i="' + i + '"><span class="rubbel-zahl" data-zahl="1"></span><span class="rubbel-paar" hidden>2×</span></button>');
    }
    E.los.innerHTML = '<div class="rubbel-zacken" aria-hidden="true"></div>'
      + '<div class="rubbel-los-kopf">' + svg(los.id, "rubbel-los-zeichen")
      + '<div class="rubbel-los-titel"><span class="rubbel-los-name">' + esc(losName(los.id)) + '</span><span class="rubbel-los-regel">'
      + esc(t("rubbel.dreiGleiche", "3 gleiche Beträge gewinnen")) + " · " + esc(t("rubbel.bisKurz", "bis")) + " " + zahl(hauptgewinn(los)) + "</span></div>"
      + '<div class="rubbel-los-nr"><span class="rubbel-anzeige-titel">' + esc(t("rubbel.nr", "Nr.")) + '</span><span>' + (r ? r.nr : "—") + "</span></div></div>"
      + '<div class="rubbel-perfo" aria-hidden="true"><span></span><span></span></div>'
      + '<div class="rubbel-felder-rahmen"><div class="rubbel-felder-pos">'
      + '<div class="rubbel-felder" id="rubbel-felder" role="grid" aria-label="' + esc(t("rubbel.felderAria", "Rubbelfelder")) + '">' + felder.join("") + "</div>"
      + '<canvas class="rubbel-folie" id="rubbel-folie" aria-hidden="true"></canvas>'
      + '<div class="rubbel-stempel" id="rubbel-stempel" aria-hidden="true" hidden></div>'
      + "</div></div>"
      + '<div class="rubbel-los-fuss" id="rubbel-los-fuss"></div>';
    E.felder = E.los.querySelector("#rubbel-felder");
    E.folie = E.los.querySelector("#rubbel-folie");
    E.stempel = E.los.querySelector("#rubbel-stempel");
    E.fuss = E.los.querySelector("#rubbel-los-fuss");
    E.felder.addEventListener("keydown", gridTaste);
    E.felder.querySelectorAll(".rubbel-feld").forEach(function (b) {
      const i = Number(b.getAttribute("data-i"));
      b.addEventListener("click", function () { if (S.runde && !S.runde.fertig) aufdecken([i]); });
      b.addEventListener("focus", function () { if (fx) { fx.fokus = i; fx.dirty = true; kick(); } });
      b.addEventListener("blur", function () { if (fx && fx.fokus === i) { fx.fokus = -1; fx.dirty = true; kick(); } });
    });
    if (fx && fx.ro) fx.ro.observe(E.felder);
    felderAktualisieren();
    fussZeichnen();
    if (fx) { fx.schluessel = null; setupPruefen(); }
  }

  /* Felder und Fusszeile nach dem Zustand (ohne Neuaufbau). */
  function felderAktualisieren() {
    const r = S.runde, offen = !!(r && !r.fertig), fertig = !!(r && r.fertig);
    const abgeschlossen = fertig && S.fertigId === r.id;
    const los = r ? r.los : losVon(S.sel), haupt = hauptgewinn(los);
    const zaehl = {};
    if (r) r.z.felder.forEach(function (x, i) { if (r.offen[i]) zaehl[x] = (zaehl[x] || 0) + 1; });
    const gewMitte = r && r.z.gewinn && zaehl[r.z.gewinn] === 3;
    const nahe = fertig && !r.z.gewinn && r.z.felder.filter(function (x) { return x === haupt; }).length === 2;
    E.felder.querySelectorAll(".rubbel-feld").forEach(function (b) {
      const i = Number(b.getAttribute("data-i")), auf = r && r.offen[i], wert = r ? r.z.felder[i] : null;
      const tr = !!(r && r.z.gewinn && gewMitte && wert === r.z.gewinn && auf);
      const paar = !!(OPT.paare && offen && auf && zaehl[wert] === 2);
      const dim = abgeschlossen && !tr && !(nahe && wert === haupt);
      b.querySelector(".rubbel-zahl").innerHTML = r ? MUENZE_SVG + zahl(wert) : "?";
      b.querySelector(".rubbel-paar").hidden = !paar;
      b.classList.toggle("ist-muster", !r);
      b.classList.toggle("ist-treffer", tr);
      b.classList.toggle("ist-paar", paar);
      b.classList.toggle("ist-dim", dim);
      b.classList.toggle("ist-spielbar", offen);
      b.setAttribute("aria-label", auf ? zahl(wert) : t("rubbel.feldZu", "Feld") + " " + (i + 1) + " – " + t("rubbel.feldAufdecken", "aufdecken"));
      b.tabIndex = offen && !auf ? 0 : -1;
    });
    E.folie.style.display = fertig ? "none" : "block";
    E.folie.classList.toggle("ist-spielbar", offen);
  }

  function fussZeichnen() {
    const r = S.runde, offen = !!(r && !r.fertig), fertig = !!(r && r.fertig);
    const abgeschlossen = fertig && S.fertigId === r.id;
    if (offen) {
      const n = r.offen.filter(Boolean).length;
      E.fuss.innerHTML = '<div class="rubbel-fortschritt"><div class="rubbel-balken"><div style="width:' + (n / 9 * 100) + '%"></div></div><span class="rubbel-klein">'
        + esc(t("rubbel.frei", "{n} / 9 frei").replace("{n}", n)) + '</span></div><button type="button" class="rubbel-link" id="rubbel-alles">' + esc(t("rubbel.allesAufdecken", "Alles aufdecken")) + "</button>";
      E.fuss.querySelector("#rubbel-alles").addEventListener("click", function () { if (S.runde && !S.runde.fertig) aufdecken([0, 1, 2, 3, 4, 5, 6, 7, 8], 70); });
    } else if (abgeschlossen) {
      const haupt = hauptgewinn(r.los);
      const nahe = !r.z.gewinn && r.z.felder.filter(function (x) { return x === haupt; }).length === 2;
      const text = r.z.gewinn ? "+" + zahl(r.auszahlung) : "−" + zahl(r.los.preis);
      const notiz = r.z.gewinn ? t("rubbel.notizNetto", "Dublonen · netto {x}").replace("{x}", (r.delta > 0 ? "+" : "") + zahl(r.delta))
        : nahe ? t("rubbel.notizKnapp", "2 × {x} – knapp").replace("{x}", zahl(haupt)) : t("rubbel.notizKeinDreier", "kein Dreier");
      E.fuss.innerHTML = '<div class="rubbel-ergebnis" id="rubbel-ergebnis"><span class="rubbel-ergebnis-wert' + (r.z.gewinn ? " ist-gewinn" : "") + '">' + text + '</span><span class="rubbel-klein">' + esc(notiz) + "</span></div>";
    } else {
      E.fuss.innerHTML = '<span class="rubbel-klein">' + esc(t("rubbel.muster", "Muster – kauf das Los, dann mit der Münze rubbeln.")) + "</span>";
    }
    if (abgeschlossen) {
      E.stempel.hidden = false;
      E.stempel.textContent = r.z.gewinn ? t("rubbel.stempelGewonnen", "Gewonnen") : t("rubbel.stempelNiete", "Niete");
      E.stempel.classList.toggle("ist-gewinn", !!r.z.gewinn);
    } else E.stempel.hidden = true;
  }

  function waehlen(id) {
    const r = S.runde;
    if (r && !r.fertig) return;
    if (fx && fx.wechselt) return;
    S.sel = id;
    S.runde = null;
    S.fertigId = null;
    if (fx) fx.kreise = null;
    seiteZeichnen();
    losZeichnen();
    kopfZeichnen();
    knopfZeichnen();
  }

  /* ------------------------------------------------------
     FOLIE, MASKE UND EFFEKTE (Canvas)
  ------------------------------------------------------ */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function setupPruefen() {
    if (!lebt()) return;
    const r = S.runde, k = r ? "r" + r.id : "m" + S.sel;
    if (k === fx.schluessel) return;
    if (r && r.fertig) { fx.schluessel = k; return; }
    if (setup(!!r)) { fx.schluessel = k; clearTimeout(fx.retry); }
    else { clearTimeout(fx.retry); fx.retry = setTimeout(setupPruefen, 60); }
  }

  function setup(spielbar) {
    const c = E.folie, g = E.felder, fxc = E.fx;
    if (!c || !g || !fxc) return false;
    const box = g.getBoundingClientRect();
    if (!box.width || !box.height || !fxc.clientWidth) return false;
    const btns = Array.prototype.filter.call(g.children, function (b) { return b.tagName === "BUTTON"; });
    if (btns.length < 9) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = g.offsetWidth, H = g.offsetHeight;
    function mk() { const e = document.createElement("canvas"); e.width = Math.round(W * dpr); e.height = Math.round(H * dpr); return e; }
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const tex = mk(), mask = mk(), tctx = tex.getContext("2d"), mctx = mask.getContext("2d", { willReadFrequently: true });
    tctx.scale(dpr, dpr); mctx.scale(dpr, dpr);
    const zellen = btns.map(function (b) { return { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }; });
    const r = S.runde, losId = r ? r.los.id : S.sel;
    folieMalen(tctx, zellen, losId);
    mctx.fillStyle = "#000";
    zellen.forEach(function (z, i) { if (r && r.offen[i]) return; rr(mctx, z.x, z.y, z.w, z.h, 8); mctx.fill(); });
    fxc.width = Math.round(fxc.clientWidth * dpr); fxc.height = Math.round(fxc.clientHeight * dpr);
    const fctx = fxc.getContext("2d"); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(fx, { cv: c, ctx: c.getContext("2d"), tex: tex, mask: mask, mctx: mctx, fctx: fctx, dpr: dpr, W: W, H: H, zellen: zellen, spielbar: spielbar, dirty: true, tonFarbe: tonVon(losId) });
    if (!r) { fx.spannung = false; fx.kreise = null; }
    zeigerBinden(c, spielbar);
    kick();
    return true;
  }

  /* Silberfolie mit Rillen, Koernung, Los-Zeichen im Muster und "RUBBELN". */
  function folieMalen(ctx, zellen, losId) {
    const ic = ICONS[losId].map(function (p) { return new Path2D(p); });
    const text = t("rubbel.rubbeln", "RUBBELN");
    const hell = farbe("--fh-rubbel-silber-hell", "#d9dee5"), mitte = farbe("--fh-rubbel-silber", "#9aa4b1"), tief = farbe("--fh-rubbel-silber-tief", "#5c6673");
    zellen.forEach(function (z) {
      ctx.save(); rr(ctx, z.x, z.y, z.w, z.h, 8); ctx.clip();
      const g = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
      g.addColorStop(0, hell); g.addColorStop(0.35, mitte); g.addColorStop(0.55, "#c4cad3"); g.addColorStop(1, "#8a94a1");
      ctx.fillStyle = g; ctx.fillRect(z.x, z.y, z.w, z.h);
      for (let y = z.y; y < z.y + z.h; y += 1.5) { ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255," + Math.random() * 0.07 + ")" : "rgba(40,46,56," + Math.random() * 0.06 + ")"; ctx.fillRect(z.x, y, z.w, 1); }
      for (let k = 0; k < z.w * z.h * 0.05; k++) { ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.18)" : "rgba(40,46,56,.14)"; ctx.fillRect(z.x + Math.random() * z.w, z.y + Math.random() * z.h, 1, 1); }
      const s = 0.55, schritt = 22;
      ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let yy = z.y - 8, reihe = 0; yy < z.y + z.h; yy += schritt, reihe++) {
        for (let xx = z.x - 8 + (reihe % 2) * schritt / 2; xx < z.x + z.w; xx += schritt) {
          ctx.save(); ctx.translate(xx + 0.7, yy + 0.7); ctx.scale(s, s); ctx.strokeStyle = "rgba(255,255,255,.22)"; ic.forEach(function (p) { ctx.stroke(p); }); ctx.restore();
          ctx.save(); ctx.translate(xx, yy); ctx.scale(s, s); ctx.strokeStyle = "rgba(70,78,90,.18)"; ic.forEach(function (p) { ctx.stroke(p); }); ctx.restore();
        }
      }
      const fs = Math.max(10, Math.round(z.h * 0.14));
      ctx.font = "600 " + fs + "px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if ("letterSpacing" in ctx) ctx.letterSpacing = ".18em";
      const pw = ctx.measureText(text).width + fs * 1.4, ph = fs * 2;
      ctx.fillStyle = "rgba(200,206,215,.85)"; rr(ctx, z.x + z.w / 2 - pw / 2, z.y + z.h / 2 - ph / 2, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillText(text, z.x + z.w / 2 + 1, z.y + z.h / 2 + 1);
      ctx.fillStyle = tief; ctx.fillText(text, z.x + z.w / 2, z.y + z.h / 2);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.restore();
      ctx.save(); rr(ctx, z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1, 8);
      const e = ctx.createLinearGradient(0, z.y, 0, z.y + z.h); e.addColorStop(0, "rgba(255,255,255,.55)"); e.addColorStop(1, "rgba(30,34,42,.45)");
      ctx.strokeStyle = e; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    });
  }

  function malen(now) {
    const ctx = fx.ctx, W = fx.W, H = fx.H, dpr = fx.dpr;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H); ctx.drawImage(fx.tex, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-atop";
    if (fx.maus) {
      const g = ctx.createRadialGradient(fx.maus.x, fx.maus.y, 0, fx.maus.x, fx.maus.y, 140);
      g.addColorStop(0, "rgba(255,255,255,.38)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const hx = Math.max(0, Math.min(1, fx.maus.x / W)), h = ctx.createLinearGradient(0, 0, W, H);
      [195, 255, 320, 30, 195].forEach(function (hu, k) { h.addColorStop(k / 4 * 0.6 + hx * 0.4, "hsla(" + hu + ",60%,72%,.11)"); });
      ctx.fillStyle = h; ctx.fillRect(0, 0, W, H);
    }
    if (fx.sweep >= 0) {
      const x = -W * 0.4 + fx.sweep * W * 1.8, g = ctx.createLinearGradient(x - 60, 0, x + 60, H * 0.4);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (fx.spannung) {
      const p = 0.5 + 0.5 * Math.sin(now / 240);
      ctx.globalAlpha = 0.06 + p * 0.14; ctx.fillStyle = fx.tonFarbe; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(fx.mask, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    const z = fx.zellen[fx.fokus];
    if (z && fx.spielbar) { ctx.strokeStyle = farbe("--fh-nocturne", "#9184d9"); ctx.lineWidth = 2; rr(ctx, z.x + 1, z.y + 1, z.w - 2, z.h - 2, 8); ctx.stroke(); }
  }

  function kick() { if (fx && !fx.raf && !fx.tot) { fx.last = performance.now(); fx.raf = requestAnimationFrame(tick); } }
  function versatz() { const w = E.fx.getBoundingClientRect(), g = E.felder.getBoundingClientRect(); return { x: g.left - w.left, y: g.top - w.top }; }
  function boden() { const w = E.fx.getBoundingClientRect(), b = E.los.getBoundingClientRect(); return b.bottom - w.top - 5; }

  function tick(now) {
    if (!lebt()) return;
    fx.raf = 0;
    const dt = Math.min(0.05, (now - fx.last) / 1000);
    fx.last = now;
    let busy = false;
    if (fx.fading.length && fx.mctx) {
      busy = true; fx.dirty = true;
      fx.fading = fx.fading.filter(function (f) {
        const z = fx.zellen[f.i], p = (now - f.t0) / 260;
        if (!z) return false;
        if (p < 0) return true;
        if (!f.k) { f.k = true; kruemel(f.i); }
        fx.mctx.globalCompositeOperation = "destination-out";
        if (p >= 1) { fx.mctx.clearRect(z.x - 1, z.y - 1, z.w + 2, z.h + 2); fx.mctx.globalCompositeOperation = "source-over"; return false; }
        fx.mctx.fillStyle = "rgba(0,0,0,.24)"; fx.mctx.fillRect(z.x - 1, z.y - 1, z.w + 2, z.h + 2);
        fx.mctx.globalCompositeOperation = "source-over";
        return true;
      });
    }
    if (fx.sweep >= 0) { fx.sweep += dt / 0.9; fx.dirty = true; busy = true; if (fx.sweep > 1) fx.sweep = -1; }
    if (fx.spannung) { busy = true; fx.dirty = true; }
    if (fx.dirty && fx.ctx && E.folie.style.display !== "none") { malen(now); fx.dirty = false; }
    const f = fx.fctx;
    if (f) {
      f.save(); f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, f.canvas.width, f.canvas.height); f.restore();
      if (fx.kreise && fx.zellen) {
        const k = fx.kreise, of = versatz();
        k.idx.forEach(function (i, n) {
          const z = fx.zellen[i];
          if (!z) return;
          const tt = Math.min(1, Math.max(0, (now - k.t0 - n * 200) / 460));
          if (tt < 1) busy = true;
          if (tt <= 0) return;
          const e = 1 - Math.pow(1 - tt, 3), cx = z.x + z.w / 2 + of.x, cy = z.y + z.h / 2 + of.y, rx = z.w * 0.56, ry = z.h * 0.6;
          const a0 = -2.3 + n * 0.8, span = Math.PI * 2.12 * e;
          f.save(); f.translate(cx, cy); f.rotate(-0.07 + n * 0.05);
          f.strokeStyle = k.ton; f.lineWidth = 2.2; f.lineCap = "round"; f.globalAlpha = k.alpha; f.shadowColor = k.ton; f.shadowBlur = k.glow;
          if (k.strich) f.setLineDash([5, 6]);
          f.beginPath();
          for (let s = 0; s <= 48; s++) {
            const a = a0 + span * s / 48, w = 1 + Math.sin(a * 3 + n * 2) * 0.035 + s / 48 * 0.05, x = Math.cos(a) * rx * w, y = Math.sin(a) * ry * w;
            if (s) f.lineTo(x, y); else f.moveTo(x, y);
          }
          f.stroke(); f.restore();
        });
      }
      if (fx.partikel.length) {
        busy = true;
        fx.partikel = fx.partikel.filter(function (p) {
          p.life += dt;
          if (p.life > p.max) return false;
          if (!p.ruht) {
            p.vy += (p.coin ? 1100 : 900) * dt; p.vx *= p.coin ? 0.995 : 0.97; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            if (p.boden != null && p.y > p.boden && p.vy > 0) {
              p.y = p.boden; p.vy *= -0.28; p.vx *= 0.45; p.vr *= 0.35;
              if (Math.abs(p.vy) < 45) { p.ruht = true; p.max = p.life + 1 + Math.random() * 0.9; }
            }
          }
          const a = 1 - Math.pow(p.life / p.max, 3);
          f.save(); f.globalAlpha = a; f.translate(p.x, p.y);
          if (p.coin) {
            f.scale(Math.max(0.15, Math.abs(Math.cos(p.rot))), 1);
            f.fillStyle = p.col; f.beginPath(); f.arc(0, 0, p.s, 0, 7); f.fill();
            f.strokeStyle = "rgba(255,255,255,.55)"; f.lineWidth = 1.2; f.beginPath(); f.arc(0, 0, p.s * 0.62, 0, 7); f.stroke();
          } else {
            f.rotate(p.rot);
            if (!p.ruht) f.scale(1, Math.cos(p.rot * 1.7)); else f.scale(1, 0.55);
            f.fillStyle = p.col; f.fillRect(-p.s / 2, -p.s * 0.35, p.s, p.s * 0.7);
          }
          f.restore();
          return true;
        });
      }
      if (fx.cursor && fx.spielbar && S.runde && !S.runde.fertig) muenzeMalen(f, fx.cursor);
    }
    if (busy || fx.dirty) kick();
  }

  /* Die Rubbelmuenze als Cursor - hochkant, solange gerubbelt wird. */
  function muenzeMalen(f, c) {
    const r = 12, gold = farbe("--fh-gold-bright", "#f0c96a"), messing = farbe("--spielo-messing", "#be9654");
    f.save(); f.translate(c.x, c.y);
    f.fillStyle = "rgba(0,0,0,.35)"; f.beginPath(); f.ellipse(3, 6, r, c.an ? r * 0.6 : r, 0, 0, 7); f.fill();
    f.rotate(c.ang); f.scale(c.an ? 0.6 : 1, 1);
    const g = f.createRadialGradient(-4, -4, 1, 0, 0, r); g.addColorStop(0, gold); g.addColorStop(1, messing);
    f.fillStyle = g; f.beginPath(); f.arc(0, 0, r, 0, 7); f.fill();
    f.strokeStyle = "rgba(60,40,10,.55)"; f.lineWidth = 1.2; f.stroke();
    f.strokeStyle = "rgba(255,255,255,.5)"; f.lineWidth = 1; f.beginPath(); f.arc(0, 0, r * 0.68, 0, 7); f.stroke();
    f.restore();
  }

  function cursorSetzen(p, an) {
    const of = versatz(), x = p.x + of.x, y = p.y + of.y, alt = fx.cursor;
    let ang = alt ? alt.ang : 0;
    if (alt && Math.hypot(x - alt.x, y - alt.y) > 1.5) ang = Math.atan2(y - alt.y, x - alt.x);
    fx.cursor = { x: x, y: y, ang: ang, an: an };
  }

  /* Ein Feld zerfaellt beim Aufdecken in Kruemel. */
  function kruemel(i) {
    const z = fx.zellen[i];
    if (!z || !fx.mctx) return;
    if (tonAn()) klang.kruemel();
    if (!OPT.flocken || ruhig()) return;
    const dpr = fx.dpr, X = Math.round(z.x * dpr), Y = Math.round(z.y * dpr), Wc = Math.max(1, Math.round(z.w * dpr)), Hc = Math.max(1, Math.round(z.h * dpr));
    const d = fx.mctx.getImageData(X, Y, Wc, Hc).data, st = Math.max(1, Math.round(6 * dpr)), pts = [];
    for (let y = 0; y < Hc; y += st) for (let x = 0; x < Wc; x += st) if (d[(y * Wc + x) * 4 + 3] > 128) pts.push([x / dpr, y / dpr]);
    mischen(pts);
    const of = versatz(), bd = boden();
    pts.slice(0, 34).forEach(function (pt) {
      const sh = 150 + Math.random() * 70 | 0;
      fx.partikel.push({ x: z.x + pt[0] + of.x, y: z.y + pt[1] + of.y, vx: (pt[0] / z.w - 0.5) * 260 + (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 200, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, s: 2.5 + Math.random() * 4, life: 0, max: 0.9 + Math.random() * 0.5, col: "rgb(" + sh + "," + (sh + 6) + "," + (sh + 14) + ")", boden: bd });
    });
  }

  function zeigerBinden(c, spielbar) {
    let letzter = null, uhr = 0, lt = 0;
    /* Ist die Folie ausgeblendet (Los fertig), hat sie keine Breite – dann gibt es keinen Punkt.
       Ohne diese Pruefung wurden die Koordinaten unendlich und die Pinselschleife endlos. */
    function punkt(e) {
      const r = c.getBoundingClientRect();
      if (!(r.width > 0) || !(r.height > 0)) return null;
      return { x: (e.clientX - r.left) * fx.W / r.width, y: (e.clientY - r.top) * fx.H / r.height };
    }
    function darfRubbeln() { return spielbar && S.runde && !S.runde.fertig && fx.mctx; }
    function wischen(p, e) {
      if (!p || !darfRubbeln()) return;
      const now = performance.now(), a = letzter || p, dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      const v = d / Math.max(1, now - lt) * 16;
      lt = now;
      const druck = e && e.pointerType === "pen" && e.pressure ? 0.6 + e.pressure * 0.8 : 1;
      const r = OPT.pinsel / 2 * Math.min(1.15, Math.max(0.75, 1.15 - v * 0.012)) * druck, n = Math.min(200, Math.max(1, Math.ceil(d / 3)));
      const m = fx.mctx;
      m.globalCompositeOperation = "destination-out"; m.fillStyle = "#000";
      for (let k = 0; k <= n; k++) {
        const tt = k / n, x = a.x + dx * tt + (Math.random() - 0.5) * r * 0.35, y = a.y + dy * tt + (Math.random() - 0.5) * r * 0.35;
        m.beginPath(); m.arc(x, y, r * (0.75 + Math.random() * 0.3), 0, 7); m.fill();
        if (Math.random() < 0.5) { m.beginPath(); m.arc(x + (Math.random() - 0.5) * r * 2.2, y + (Math.random() - 0.5) * r * 2.2, Math.random() * 2.2 + 0.6, 0, 7); m.fill(); }
      }
      m.globalCompositeOperation = "source-over";
      if (tonAn()) klang.rubbeln(v);
      if (OPT.flocken && !ruhig() && d > 1) {
        const of = versatz(), bd = boden(), cnt = Math.min(5, Math.ceil(d / 7)), ux = dx / d, uy = dy / d;
        for (let k = 0; k < cnt; k++) {
          const sh = 155 + Math.random() * 60 | 0;
          fx.partikel.push({ x: p.x + of.x + (Math.random() - 0.5) * r, y: p.y + of.y + (Math.random() - 0.5) * r, vx: ux * 140 + (Math.random() - 0.5) * 220, vy: uy * 80 - 60 - Math.random() * 180, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 24, s: 2 + Math.random() * 3.5, life: 0, max: 0.7 + Math.random() * 0.5, col: "rgb(" + sh + "," + (sh + 6) + "," + (sh + 14) + ")", boden: bd });
        }
      }
      letzter = p; fx.dirty = true; kick();
      if (!uhr) uhr = setTimeout(function () { uhr = 0; pruefen(); }, 90);
    }
    c.onpointerenter = c.onpointermove = function (e) {
      if (!lebt()) return;
      const p = punkt(e);
      if (!p) { fx.maus = null; fx.cursor = null; fx.dirty = true; kick(); return; }
      fx.maus = p; fx.dirty = true;
      if (spielbar) cursorSetzen(p, fx.zieht);
      if (fx.zieht && darfRubbeln()) wischen(p, e); else kick();
    };
    c.onpointerleave = function () { if (!lebt()) return; fx.maus = null; fx.cursor = null; fx.dirty = true; kick(); };
    c.onpointerdown = function (e) {
      if (!lebt() || !darfRubbeln()) return;
      const p = punkt(e);
      if (!p) return;
      if (tonAn()) klang.ensure();
      fx.zieht = true; letzter = null; lt = performance.now(); flach();
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* aeltere Browser */ }
      cursorSetzen(p, true); wischen(p, e); e.preventDefault();
    };
    c.onpointerup = c.onpointercancel = function () {
      if (!lebt()) return;
      fx.zieht = false; letzter = null;
      if (fx.cursor) fx.cursor.an = false;
      klang.still(); pruefen(); kick();
    };
  }

  /* Das Los neigt sich leicht zur Maus. */
  function neigen(e) {
    if (!E || ruhig() || (fx && fx.zieht) || !OPT.neigen) return;
    const r = E.wrap.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
    E.kipp.style.transform = "rotateX(" + (-ny * 5).toFixed(2) + "deg) rotateY(" + (nx * 6).toFixed(2) + "deg)";
  }
  function flach() { if (E && E.kipp) E.kipp.style.transform = ""; }

  function gridTaste(e) {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (!d) return;
    const kids = Array.prototype.filter.call(E.felder.children, function (b) { return b.tagName === "BUTTON"; }), i = kids.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = i + d;
    if (j >= 0 && j < 9) kids[j].focus();
  }

  /* Wie viel der Folie ueber einem Feld ist schon weg? */
  function pruefen() {
    const r = S.runde;
    if (!r || r.fertig || !lebt() || !fx.mctx) return;
    const dpr = fx.dpr, auf = [];
    fx.zellen.forEach(function (z, i) {
      if (r.offen[i]) return;
      const d = fx.mctx.getImageData(Math.round(z.x * dpr), Math.round(z.y * dpr), Math.max(1, Math.round(z.w * dpr)), Math.max(1, Math.round(z.h * dpr))).data;
      let frei = 0, n = 0;
      for (let k = 3; k < d.length; k += 24) { n++; if (d[k] < 40) frei++; }
      if (n && frei / n > OPT.schwelle) auf.push(i);
    });
    if (auf.length) aufdecken(auf);
  }

  function aufdecken(liste, stagger) {
    const r = S.runde;
    if (!r || r.fertig) return;
    liste = liste.filter(function (i) { return !r.offen[i]; });
    if (!liste.length) return;
    const now = performance.now(), st = stagger || 0, vorher = r.offen.filter(Boolean).length;
    liste.forEach(function (i, k) { r.offen[i] = true; if (fx) fx.fading.push({ i: i, t0: now + k * st }); });
    kick();
    const fertig = r.offen.every(Boolean);
    const m = {};
    r.z.felder.forEach(function (x, i) { if (r.offen[i]) m[x] = (m[x] || 0) + 1; });
    const neuesPaar = !fertig && liste.some(function (i) { return m[r.z.felder[i]] === 2; });
    if (fx) fx.spannung = !fertig && OPT.paare && !ruhig() && Object.keys(m).some(function (k) { return m[k] === 2; });
    vib(8);
    if (tonAn()) {
      klang.ensure();
      liste.forEach(function (_, k) { setTimeout(function () { klang.tick(vorher + k); }, k * st); });
      if (neuesPaar && OPT.paare) setTimeout(function () { klang.paar(); }, 120);
    }
    if (neuesPaar && OPT.paare) vib([10, 50, 10]);
    if (neuesPaar && OPT.paare && Math.random() < 0.7) spruchSetzen(spruch("paar"));
    if (E) {
      felderAktualisieren();
      fussZeichnen();
      if (!ruhig()) {
        liste.forEach(function (i, k) {
          const b = E.felder.children[i], s = b && b.querySelector("[data-zahl]");
          if (s) s.animate([{ transform: "scale(.7)", opacity: 0, filter: "blur(4px)" }, { transform: "scale(1.08)", opacity: 1, filter: "blur(0)", offset: 0.6 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, delay: 60 + k * st, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        });
      }
    }
    if (fertig) {
      r.fertig = true;
      /* Laufendes Rubbeln beenden – die Folie verschwindet gleich. */
      if (fx) { fx.spannung = false; fx.zieht = false; fx.cursor = null; }
      klang.still();
      setTimeout(function () { abschluss(r); }, 340 + liste.length * st);
    }
  }

  /* Ergebnis: Stempel, Kreise, Muenzregen, Guthaben zaehlt hoch. */
  function abschluss(r) {
    if (S.runde !== r || S.fertigId === r.id) return;
    const gew = r.z.gewinn, ton = tonVon(r.los.id), haupt = hauptgewinn(r.los);
    const hauptIdx = [];
    r.z.felder.forEach(function (x, i) { if (x === haupt) hauptIdx.push(i); });
    const nahe = !gew && hauptIdx.length === 2;
    S.fertigId = r.id;
    S.letzte = r.delta;
    S.netto += r.delta;
    S.verlauf = [{ id: r.id, los: r.los.id, gew: r.auszahlung, preis: r.los.preis }].concat(S.verlauf).slice(0, 12);
    statusSetzen(gew ? t("rubbel.gewonnen", "Dreimal {betrag} – gewonnen!").replace("{betrag}", zahl(gew))
      : nahe ? t("rubbel.knapp", "Zweimal {betrag} – knapp daneben.").replace("{betrag}", zahl(haupt))
      : t("rubbel.niete", "Leider kein Dreier – Niete."));
    spruchSetzen(spruch(gew ? "win" : "lose"));
    if (tonAn()) { setTimeout(function () { klang.stempel(); }, 250); if (gew) klang.gewinn(); else klang.niete(); }
    vib(gew ? [20, 60, 20, 60, 40] : 15);
    if (!lebt()) { S.anzBal = r.guthabenNachher; return; }
    seiteZeichnen();
    kopfZeichnen();
    knopfZeichnen();
    verlaufZeichnen();
    felderAktualisieren();
    fussZeichnen();
    zaehlen(S.anzBal == null ? r.guthabenNachher : S.anzBal, r.guthabenNachher);
    if (gew) fx.kreise = { idx: r.z.treffer, t0: performance.now() + 120, ton: ton, alpha: 0.95, glow: 12 };
    else if (nahe) fx.kreise = { idx: hauptIdx, t0: performance.now() + 120, ton: "rgba(233,233,237,.55)", alpha: 1, glow: 0, strich: true };
    else fx.kreise = null;
    kick();
    if (ruhig()) return;
    const erg = E.los.querySelector("#rubbel-ergebnis");
    E.stempel.animate([{ transform: "rotate(-8deg) scale(2.2)", opacity: 0 }, { transform: "rotate(-8deg) scale(.94)", opacity: 1, offset: 0.7 }, { transform: "rotate(-8deg) scale(1)", opacity: 1 }], { duration: 360, easing: "cubic-bezier(.3,.7,.3,1)" });
    E.los.animate([{ transform: "none" }, { transform: "translateY(2px) scale(.996)" }, { transform: "none" }], { duration: 200, delay: 250, easing: "ease-out" });
    if (erg) erg.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 120, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    if (!gew) return;
    const wr = E.fx.getBoundingClientRect();
    r.z.treffer.forEach(function (i, k) {
      const b = E.felder.children[i];
      if (!b) return;
      b.animate([{ transform: "scale(1)" }, { transform: "scale(1.1)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 700, delay: k * 140, easing: "cubic-bezier(.2,.8,.2,1)" });
      setTimeout(function () {
        if (!OPT.flocken || !lebt()) return;
        const br = b.getBoundingClientRect(), cx = br.left + br.width / 2 - wr.left, cy = br.top + br.height / 2 - wr.top, n = gew >= haupt ? 26 : 14;
        for (let q = 0; q < n; q++) {
          const a = Math.random() * Math.PI * 2, sp = 180 + Math.random() * 320;
          fx.partikel.push({ coin: true, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, rot: Math.random() * 6, vr: 8 + Math.random() * 14, s: 3.5 + Math.random() * 3, life: 0, max: 0.9 + Math.random() * 0.6, col: ton });
        }
        kick();
      }, k * 140);
    });
    E.los.animate([{ boxShadow: "0 0 0 1px " + ton + ", 0 6px 18px rgba(0,0,0,.55)" }, { boxShadow: "0 0 0 1px " + ton + ", 0 0 48px color-mix(in srgb, " + ton + " 55%, transparent)", offset: 0.35 }, { boxShadow: "var(--rb-schatten-md)" }], { duration: 1600, easing: "ease-out" });
  }

  function zaehlen(von, bis) {
    S.anzBal = bis;
    if (ruhig() || von === bis) { zahlZeigen(bis); return; }
    const t0 = performance.now(), dauer = 900;
    E.guthaben.animate([{ color: "var(--rb-text)" }, { color: "var(--rb-akzent-300)", offset: 0.2 }, { color: "var(--rb-text)" }], { duration: 1200 });
    function schritt(now) {
      if (!lebt()) return;
      const p = Math.min(1, (now - t0) / dauer), e = 1 - Math.pow(1 - p, 3);
      zahlZeigen(Math.round(von + (bis - von) * e));
      if (p < 1) requestAnimationFrame(schritt);
    }
    requestAnimationFrame(schritt);
  }

  /* ------------------------------------------------------
     SERVER: Guthaben, Sperre, Kauf
  ------------------------------------------------------ */
  async function uid() {
    if (typeof supabaseClient === "undefined" || !supabaseClient || typeof wheelAuthReady === "undefined") return null;
    return await wheelAuthReady;
  }

  async function guthabenLaden() {
    try {
      const id = await uid();
      if (!id || !E) return;
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").select("currency").eq("firebase_uid", id).maybeSingle();
      });
      /* Laeuft gerade ein ungeoeffnetes Los, bleibt die Anzeige beim Stand nach dem Einsatz. */
      if (S.runde && !S.runde.fertig) return;
      S.anzBal = data ? data.currency || 0 : 0;
      zahlZeigen(S.anzBal);
    } catch (e) {
      console.warn("Rubbellose: Guthaben nicht geladen", e);
    }
  }

  function sperreSetzen(bis) {
    S.sperreBis = bis;
    clearInterval(sperreUhr);
    sperreUhr = setInterval(function () {
      knopfZeichnen();
      if (Date.now() >= S.sperreBis || !E) clearInterval(sperreUhr);
    }, 250);
    knopfZeichnen();
  }

  async function sperreLaden() {
    try {
      const id = await uid();
      if (!id) { knopfZeichnen(); return; }
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").select("last_spielothek_play_at").eq("firebase_uid", id).maybeSingle();
      });
      const zuletzt = data && data.last_spielothek_play_at ? new Date(data.last_spielothek_play_at).getTime() : 0;
      const ms = typeof SPIELOTHEK_COOLDOWN_MS === "number" ? SPIELOTHEK_COOLDOWN_MS : 4000;
      sperreSetzen(zuletzt ? zuletzt + ms : 0);
    } catch (e) {
      console.warn("Rubbellose: Sperre nicht geladen", e);
      knopfZeichnen();
    }
  }

  /* EIN serverseitig gepruefter Schreibvorgang: Einsatz und Gewinn zugleich. */
  async function buchen(los) {
    const nickname = localStorage.getItem("wheelNickname") || "";
    if (!nickname || typeof supabaseClient === "undefined" || !supabaseClient) throw new Error("login");
    const id = await uid();
    if (!id) throw new Error("login");
    await ensureSupabasePlayerRow(id, nickname);
    const { data: alt, error: lesefehler } = await withSupabaseRlsColdStartRetry(function () {
      return supabaseClient.from("players")
        .select("currency, games_played, games_won, total_currency_earned, last_spielothek_play_at")
        .eq("firebase_uid", id).maybeSingle();
    });
    if (lesefehler) throw lesefehler;
    const d = alt || {};
    const guthaben = d.currency || 0;
    const ms = typeof SPIELOTHEK_COOLDOWN_MS === "number" ? SPIELOTHEK_COOLDOWN_MS : 4000;
    const zuletzt = d.last_spielothek_play_at ? new Date(d.last_spielothek_play_at).getTime() : 0;
    if (zuletzt && Date.now() - zuletzt < ms) throw new Error("cooldown");
    if (guthaben < los.preis) throw new Error("not-enough-currency");

    const z = ziehen(los);
    /* Skill-Bonus wie beim Banditen nur auf den Gewinn, geklemmt auf den Deckel. */
    const bonus = typeof fhSkillBonus === "function" ? fhSkillBonus("slotdublonen") : 0;
    const deckel = typeof SPIELOTHEK_GEWINN_DECKEL === "number" ? SPIELOTHEK_GEWINN_DECKEL : 30000;
    const auszahlung = z.gewinn > 0 ? Math.min(Math.round(z.gewinn * (1 + bonus)), deckel) : 0;
    const neu = Math.max(0, guthaben - los.preis + auszahlung);
    const { data: gebucht, error: schreibfehler } = await withSupabaseRlsColdStartRetry(function () {
      return supabaseClient.from("players").update({
        currency: neu,
        games_played: (d.games_played || 0) + 1,
        games_won: z.gewinn ? (d.games_won || 0) + 1 : d.games_won || 0,
        total_currency_earned: auszahlung > 0 ? (d.total_currency_earned || 0) + auszahlung : d.total_currency_earned || 0,
        last_spielothek_play_at: new Date().toISOString(),
      }).eq("firebase_uid", id).select().maybeSingle();
    });
    if (schreibfehler) throw schreibfehler;
    if (!gebucht) throw new Error("cooldown");
    if (typeof logSpielothekRoundToSupabase === "function") logSpielothekRoundToSupabase("rubbel-" + los.id, los.preis, auszahlung, z.gewinn > 0);
    return { z: z, auszahlung: auszahlung, vorher: guthaben, neu: neu, ms: ms };
  }

  function seriennummer() {
    return String(Math.floor(Math.random() * 9000 + 1000)) + "-" + String(Math.floor(Math.random() * 9000 + 1000));
  }

  async function kaufen() {
    const r0 = S.runde;
    /* Auch waehrend der kurzen Auswertung nach dem letzten Feld nicht kaufen. */
    if ((r0 && (!r0.fertig || S.fertigId !== r0.id)) || S.beschaeftigt || Date.now() < S.sperreBis || !E || (fx && fx.wechselt)) return;
    const los = losVon(S.sel);
    if (S.anzBal != null && S.anzBal < los.preis) { statusSetzen(t("spielothek.notEnoughCurrency", "Nicht genug Dublonen dafür.")); return; }
    if (tonAn()) klang.ensure();
    S.beschaeftigt = true;
    knopfZeichnen();
    /* Das alte Los fliegt schon weg, waehrend gebucht wird. */
    let raus = null;
    if (r0 && r0.fertig && !ruhig()) {
      fx.wechselt = true;
      raus = E.los.animate([{ transform: "none", opacity: 1 }, { transform: "translate(-36px,-8px) rotate(-5deg)", opacity: 0 }], { duration: 240, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    }
    try {
      const b = await buchen(los);
      if (raus) { try { await raus.finished; } catch (e) { /* abgebrochen: egal, es geht weiter */ } }
      S.runde = { id: Date.now(), los: los, z: b.z, offen: [false, false, false, false, false, false, false, false, false], fertig: false, nr: seriennummer(),
        auszahlung: b.auszahlung, delta: b.neu - b.vorher, guthabenNachher: b.neu };
      S.fertigId = null;
      S.anzBal = b.vorher - Math.min(los.preis, b.vorher);
      statusSetzen(t("rubbel.losGekauft", "Rubbel die Felder frei!"));
      S.spruch = spruch("idle");
      sperreSetzen(Date.now() + b.ms);
      if (!lebt()) return;
      fx.kreise = null; fx.spannung = false; fx.fokus = -1;
      if (raus) raus.cancel();
      seiteZeichnen();
      losZeichnen();
      kopfZeichnen();
      spruchZeichnen(true);
      zahlZeigen(S.anzBal);
      if (!ruhig()) {
        E.los.animate([{ transform: "translateY(16px) scale(.96)", opacity: 0.5 }, { transform: "none", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
        setTimeout(function () { if (lebt()) { fx.sweep = 0; kick(); } }, 240);
      }
    } catch (err) {
      if (raus) raus.cancel();
      const m = String((err && err.message) || err);
      if (m === "login") statusSetzen(t("spielothek.needLogin", "Melde dich zuerst an, um zu spielen!"));
      else if (m === "not-enough-currency") statusSetzen(t("spielothek.notEnoughCurrency", "Nicht genug Dublonen dafür."));
      else if (m === "cooldown") await sperreLaden();
      else if (/dublonen-tageslimit/.test(m)) statusSetzen(t("pass2.grund.tageslimit", "Für heute ist dein Dublonen-Tagesdeckel voll. Der Rest wartet bis morgen."));
      else {
        console.warn("Rubbellos konnte nicht gekauft werden:", err);
        statusSetzen(t("spielothek.saveFailed", "Die Spielrunde konnte gerade nicht gespeichert werden. Deine Daten wurden nicht verändert. Bitte versuch's nochmal."));
      }
    } finally {
      S.beschaeftigt = false;
      if (fx) fx.wechselt = false;
      knopfZeichnen();
    }
  }

  window.fhRubbellose = {
    aktiv: aktiv,
    zeigen: zeigen,
    abbauen: abbauen,
    vorschauUmschalten: vorschauUmschalten,
    /* Fuer Tests und das Nachrechnen der Quote. */
    LOSE: RUBBELLOSE,
    ziehen: function (id) { return ziehen(losVon(id)); },
  };
})();
