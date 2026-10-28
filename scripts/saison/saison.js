/* ======================================================
   SAISONS (Migration 69, Entwurf "FireHelmet Saisons")
   ---------------------------------------------------
   Halloween, Weihnachten, Neujahr und Ostern. Welche Saison gilt,
   sagt saison_stand() - nach Datum in deutscher Zeit oder vom Admin
   erzwungen. Die Seite traegt sie als html[data-fh-saison]; Farben,
   Atmosphaere und das Rail-Logo kommen dann aus css/98-saisons.css.

   Dazu je Saison:
     - Halloween / Ostern: 17 Kuerbisse bzw. Eier liegen auf den
       Seiten, die der Admin festlegt. Ein Klick meldet den Fund
       (saison_fund), die Datenbank zahlt und vergibt den Titel.
     - Weihnachten: Seite "Adventskalender" (#advent), ein Tuerchen
       je Tag (advent_oeffnen). Der Inhalt kommt erst beim Oeffnen.
     - Neujahr: Countdown bis 0 Uhr (Serverzeit), dann Feuerwerk und
       das Geschenk (neujahr_geschenk).

   Der Browser rechnet nichts davon - er zeigt an und meldet Klicks.
   Die Vorschau im Gateway (fhSaison.vorschau) gilt nur im eigenen
   Browser und nur fuer das Aussehen.

   Symbole: lucide (ISC), eingebettet, stroke-width 1.6. Der Kuerbis
   ist im selben Stil selbst gezeichnet - lucide hat keinen.
====================================================== */

(function () {
  "use strict";

  const SAISONS = ["original", "halloween", "weihnachten", "neujahr", "ostern"];
  /* Die Tuerchen stehen gemischt, nicht 1 bis 24 - wie im Entwurf. */
  const REIHENFOLGE = [7, 15, 2, 21, 11, 18, 4, 23, 9, 13, 1, 16, 20, 6, 24, 3, 12, 8, 14, 19, 5, 10, 22, 17];
  const NEU_LADEN_MS = 5 * 60 * 1000;
  const VORSCHAU_SCHLUESSEL = "fhSaisonVorschau";

  const IC = {
    geist: '<path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/>',
    tanne: '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
    funkeln: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    ei: '<path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z"/>',
    kuerbis: '<path d="M12 6c-.6-1.8.2-3.3 1.8-4"/><path d="M12 6c-3.8-1-8 1.3-8 7 0 5.2 3.6 8.8 8 8 4.4.8 8-2.8 8-8 0-5.7-4.2-8-8-7z"/><path d="M12 6c-1.9 2.1-2.6 5-2.6 7.5S10.1 19 12 21"/><path d="M12 6c1.9 2.1 2.6 5 2.6 7.5S13.9 19 12 21"/>',
    geschenk: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    flocke: '<path d="M2 12h20"/><path d="M12 2v20"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
    stern: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    bluete: '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/>',
    muenzen: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    fahne: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    schluessel: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    verfallen: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    hand: '<path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    konfetti: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
    uhr: '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
  };

  /* Je Saison: Rail-Logo, Wasserzeichen, Fund-Symbol. */
  const ART = {
    original:    { logo: null,       zeichen: null },
    halloween:   { logo: "geist",    zeichen: "geist",   fund: "kuerbis" },
    weihnachten: { logo: "tanne",    zeichen: "flocke" },
    neujahr:     { logo: "funkeln",  zeichen: "stern" },
    ostern:      { logo: "ei",       zeichen: "bluete",  fund: "ei" },
  };

  function svg(name, cls) {
    return '<svg class="' + (cls || "fh-sa-ic") + '" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || "") + "</svg>";
  }
  function T(k, fb) { return typeof window.t === "function" ? window.t("saison." + k, fb) : fb; }
  function F(k, fb, p) {
    let s = T(k, fb);
    Object.keys(p || {}).forEach(function (n) { s = s.split("{" + n + "}").join(p[n]); });
    return s;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function istEn() { return typeof getCurrentLang === "function" && getCurrentLang() === "en"; }
  function zahl(n) { return Number(n || 0).toLocaleString(istEn() ? "en-US" : "de-DE"); }
  function reduziert() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function jetzt() { return Date.now() + zeitVersatz; }

  let stand = null;        // Antwort von saison_stand()
  let vorschau = null;     // Admin-Vorschau, nur dieser Browser
  let zeitVersatz = 0;     // Serverzeit minus Geraetezeit in ms
  let seite = null;        // offene Seite
  let uhr = null;
  let neuLadenUhr = null;

  try { const v = sessionStorage.getItem(VORSCHAU_SCHLUESSEL); if (SAISONS.indexOf(v) !== -1) vorschau = v; } catch (e) { /* egal */ }

  function saison() { return vorschau || (stand && stand.saison) || "original"; }
  function echt() { return !vorschau || (stand && stand.saison === vorschau); }

  /* ---------- Daten ---------- */

  async function rpc(name, args) {
    if (typeof wheelAuthReady !== "undefined" && wheelAuthReady && wheelAuthReady.then) {
      try { await wheelAuthReady; } catch (e) { /* ohne Anmeldung weiter */ }
    }
    if (typeof supabaseClient === "undefined" || !supabaseClient) throw new Error("keine-verbindung");
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args || {}); });
    if (error) throw error;
    return data;
  }

  async function laden() {
    try {
      const d = await rpc("saison_stand");
      if (!d || !d.saison) return;
      stand = d;
      if (d.jetzt) zeitVersatz = new Date(d.jetzt).getTime() - Date.now();
    } catch (err) {
      console.warn("Saison konnte nicht geladen werden:", err);
    }
    anwenden();
  }

  /* ---------- Anwenden ---------- */

  let logoVorher = null;

  function anwenden() {
    const s = saison();
    const html = document.documentElement;
    if (s === "original") html.removeAttribute("data-fh-saison");
    else html.setAttribute("data-fh-saison", s);

    const flamme = document.querySelector(".fh-sidebar-flame");
    if (flamme) {
      if (logoVorher === null) logoVorher = flamme.innerHTML;
      flamme.innerHTML = ART[s].logo ? svg(ART[s].logo, "fh-sa-logo") : logoVorher;
    }

    document.querySelectorAll('[data-page="advent"]').forEach(function (a) { a.hidden = s !== "weihnachten"; });
    if (s !== "weihnachten" && seite === "advent" && typeof changePage === "function") changePage("stand");

    kickerSetzen();
    leisteZeichnen();
    chipsZeichnen();
    fxStarten();
    fundeVerteilen();
    if (seite === "advent") adventZeichnen();
    uhrStellen();
  }

  function kickerSetzen() {
    const k = document.querySelector('#stand [data-i18n="stand.kicker"]');
    if (!k) return;
    const s = saison();
    k.textContent = s === "original"
      ? (typeof window.t === "function" ? window.t("stand.kicker", "Logbuch") : "Logbuch")
      : T("kicker." + s, "Logbuch");
  }

  /* ---------- Saison-Leiste auf "Dein Stand" ---------- */

  function suche() { return echt() && stand && stand.suche ? stand.suche : null; }
  function gefunden() { const su = suche(); return su ? su.gefunden.length : 0; }

  function leisteZeichnen() {
    const s = saison();
    const kopf = document.querySelector("#stand .fh-page-head");
    let el = document.getElementById("fh-saison-leiste");
    if (s === "original" || !kopf) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("article");
      el.id = "fh-saison-leiste";
      el.className = "fh-sa-leiste";
      kopf.insertAdjacentElement("afterend", el);
    }

    const symbol = { halloween: "geist", weihnachten: "geschenk", neujahr: "konfetti", ostern: "ei" }[s];
    let rechts = "";
    let titel = T("leiste." + s + ".titel", "");
    if (s === "halloween" || s === "ostern") {
      const su = suche();
      const n = gefunden();
      const auf = su ? su.seiten.filter(function (p, i) { return p === "stand" && su.gefunden.indexOf(i + 1) === -1; }).length : 0;
      rechts = '<div class="fh-sa-fortschritt">'
        + '<div class="fh-sa-zahl"><span>' + n + '</span><small>' + esc(T("vonGefunden", "von 17 gefunden")) + '</small></div>'
        + '<div class="fh-sa-balken"><div style="width:' + Math.round(n / 17 * 100) + '%"></div></div>'
        + '<p>' + esc(su ? (auf === 0 ? T("hierNichts", "Auf dieser Seite ist nichts mehr versteckt.") : auf === 1 ? T("hierEins", "Einer liegt noch auf dieser Seite.") : F("hierMehr", "{n} davon liegen auf dieser Seite.", { n: auf })) : T("nurVorschau", "Vorschau – Funde zählen erst, wenn die Saison läuft.")) + '</p>'
        + '</div>';
    } else if (s === "weihnachten") {
      const tag = echt() && stand && stand.advent ? stand.advent.tag : null;
      titel = tag ? F("leiste.weihnachten.titel", "Türchen {n} wartet auf dich", { n: tag }) : T("leiste.weihnachten.titelZu", "Der Kalender öffnet am 1. Dezember");
      rechts = '<button type="button" class="fh-cta" onclick="changePage(\'advent\')">' + svg("geschenk") + '<span>' + esc(T("zumKalender", "Zum Kalender")) + '</span></button>';
    } else if (s === "neujahr") {
      rechts = '<div class="fh-sa-neujahr"><div class="fh-sa-boxen" id="fh-sa-boxen"></div>'
        + '<button type="button" class="fh-cta" onclick="fhSaison.mitternacht()">' + svg("konfetti") + '<span>' + esc(T("moment", "0-Uhr-Moment ansehen")) + '</span></button></div>';
      titel = F("leiste.neujahr.titel", "Noch so lange bis {jahr}", { jahr: neujahrJahr() });
    }

    const notiz = s === "halloween" || s === "ostern"
      ? F("leiste." + s + ".notiz", "", { n: suche() ? suche().belohnung : 25, titel: suche() ? suche().titel : "" })
      : T("leiste." + s + ".notiz", "");
    el.innerHTML = '<span class="fh-sa-kante" aria-hidden="true"></span>'
      + '<div class="fh-sa-flamme">' + svg(symbol) + '</div>'
      + '<div class="fh-sa-text"><p class="fh-sa-kicker">' + esc(T("leiste." + s + ".kicker", "")) + '</p>'
      + '<h3>' + esc(titel) + '</h3><p class="fh-sa-notiz">' + esc(notiz) + '</p></div>' + rechts;
    if (s === "neujahr") uhrTick();
  }

  /* ---------- Chips in der Topbar ---------- */

  function chipsZeichnen() {
    const rechts = document.querySelector(".fh-topbar-right");
    if (!rechts) return;
    let box = document.getElementById("fh-sa-chips");
    if (!box) {
      box = document.createElement("div");
      box.id = "fh-sa-chips";
      box.className = "fh-sa-chips";
      rechts.insertBefore(box, rechts.firstChild);
    }
    const s = saison();
    let html = "";
    if ((s === "halloween" || s === "ostern") && suche()) {
      html += '<span class="fh-sa-chip ist-alt" title="' + esc(T("suche." + s, "")) + '">' + svg(ART[s].fund) + '<span>' + gefunden() + ' / 17</span></span>';
    }
    if (s === "weihnachten") {
      const tag = echt() && stand && stand.advent ? stand.advent.tag : null;
      html += '<button type="button" class="fh-sa-chip ist-alt" onclick="changePage(\'advent\')">' + svg("geschenk") + '<span>' + esc(tag ? F("chipTuer", "Türchen {n}", { n: tag }) : T("chipAdvent", "Advent")) + '</span></button>';
    }
    if (s === "neujahr") {
      html += '<span class="fh-sa-chip ist-alt">' + svg("uhr") + '<span id="fh-sa-chip-uhr"></span></span>';
    }
    box.innerHTML = html;
    box.hidden = !html;
  }

  /* ---------- Neujahr: Countdown und 0-Uhr-Moment ---------- */

  function neujahrZiel() {
    if (echt() && stand && stand.neujahr && stand.neujahr.ziel) return new Date(stand.neujahr.ziel).getTime();
    const d = new Date(jetzt());
    return new Date(d.getMonth() === 0 ? d.getFullYear() : d.getFullYear() + 1, 0, 1).getTime();
  }

  /* Das Jahr, das um 0 Uhr beginnt. Mittags am Zieltag in UTC
     gerechnet - in der Ortszeit eines Geraets westlich von Berlin
     waere 0 Uhr deutscher Zeit noch der 31. Dezember. */
  function neujahrJahr() { return new Date(neujahrZiel() + 12 * 36e5).getUTCFullYear(); }

  let mitternachtGelaufen = false;

  function uhrStellen() {
    clearInterval(uhr);
    uhr = null;
    if (saison() !== "neujahr") return;
    uhr = setInterval(uhrTick, 1000);
    uhrTick();
  }

  function uhrTick() {
    if (saison() !== "neujahr") return;
    const rest = Math.max(0, neujahrZiel() - jetzt());
    const p2 = function (v) { return String(v).padStart(2, "0"); };
    const d = Math.floor(rest / 864e5), h = Math.floor(rest / 36e5) % 24, m = Math.floor(rest / 6e4) % 60, s = Math.floor(rest / 1e3) % 60;
    const chip = document.getElementById("fh-sa-chip-uhr");
    if (chip) chip.textContent = d + " " + T("tageKurz", "T") + " " + p2(h) + ":" + p2(m) + ":" + p2(s);
    const boxen = document.getElementById("fh-sa-boxen");
    if (boxen) {
      boxen.innerHTML = [[d, "tage", "Tage"], [h, "stunden", "Stunden"], [m, "minuten", "Minuten"], [s, "sekunden", "Sekunden"]].map(function (b) {
        return '<div class="fh-sa-box"><span>' + p2(b[0]) + '</span><small>' + esc(T(b[1], b[2])) + '</small></div>';
      }).join("");
    }
    /* Die Null erreicht, waehrend die Seite offen ist: fuer alle
       gleichzeitig, weil alle nach der Serverzeit zaehlen. */
    if (rest === 0 && !mitternachtGelaufen && echt() && stand && stand.neujahr && !stand.neujahr.abgeholt
        && jetzt() - neujahrZiel() < 60000) {
      mitternachtGelaufen = true;
      mitternacht();
    }
  }

  let mittTimer = [];
  function mittAufraeumen() { mittTimer.forEach(clearTimeout); mittTimer = []; }

  function mitternacht() {
    mittAufraeumen();
    let el = document.getElementById("fh-saison-mitternacht");
    if (!el) {
      el = document.createElement("div");
      el.id = "fh-saison-mitternacht";
      el.className = "fh-sa-mitternacht";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-live", "polite");
      el.addEventListener("click", mittEnde);
      document.body.appendChild(el);
    }
    el.title = T("schliessenKlick", "Klicken zum Schließen");
    const spaeter = function (fn, ms) { mittTimer.push(setTimeout(fn, ms)); };
    if (reduziert()) { mittBoom(el); spaeter(mittEnde, 6000); return; }
    const zeigeZahl = function (n) {
      el.className = "fh-sa-mitternacht ist-zaehlen";
      el.innerHTML = '<div class="fh-sa-schleier"></div><div class="fh-sa-buehne">'
        + '<p class="fh-sa-mk">' + esc(T("mitternachtVor", "31. Dezember · 23:59")) + '</p>'
        + '<div class="fh-sa-mz">' + n + '</div>'
        + '<div class="fh-sa-mbalken"><div style="width:' + ((6 - n) / 5 * 100) + '%"></div></div></div>';
    };
    zeigeZahl(5);
    [4, 3, 2, 1].forEach(function (n, i) { spaeter(function () { zeigeZahl(n); }, (i + 1) * 1000); });
    spaeter(function () { mittBoom(el); if (fx.finale) fx.finale(); }, 5000);
    spaeter(function () { el.classList.add("ist-aus"); }, 13000);
    spaeter(mittEnde, 13800);
  }

  function mittBoom(el) {
    const wort = T("frohesNeues", "Frohes neues Jahr");
    const jahr = String(neujahrJahr());
    const geschenk = stand && stand.neujahr ? stand.neujahr.geschenk : 100;
    el.className = "fh-sa-mitternacht ist-boom";
    el.innerHTML = '<div class="fh-sa-schleier"></div><div class="fh-sa-blitz"></div><div class="fh-sa-buehne">'
      + '<p class="fh-sa-mk fh-sa-steigt" style="animation-delay:.15s">' + esc(T("mitternachtNach", "00:00:00 · 1. Januar")) + '</p>'
      + '<h2 class="fh-sa-wunsch" aria-label="' + esc(wort) + '">' + wort.split("").map(function (c, i) {
        return '<span aria-hidden="true" style="animation-delay:' + (0.3 + i * 0.035).toFixed(3) + 's">' + esc(c) + '</span>';
      }).join("") + '</h2>'
      + '<div class="fh-sa-jahr">' + jahr.split("").map(function (c, i) {
        return '<span style="animation-delay:' + (1.1 + i * 0.12).toFixed(2) + 's">' + c + '</span>';
      }).join("") + '</div>'
      + (geschenk > 0 ? '<span class="fh-sa-chip fh-sa-steigt" style="animation-delay:2.2s">' + svg("geschenk") + esc(F("geschenkChip", "+{n} Dublonen · Neujahrsgeschenk", { n: zahl(geschenk) })) + '</span>' : "")
      + '</div>';
  }

  async function mittEnde() {
    mittAufraeumen();
    const el = document.getElementById("fh-saison-mitternacht");
    if (el) el.remove();
    if (!echt() || !stand || !stand.neujahr || stand.neujahr.abgeholt) return;
    try {
      const r = await rpc("neujahr_geschenk");
      if (r && r.ok) {
        stand.neujahr.abgeholt = true;
        geldNachziehen();
        hinweis("konfetti", F("geschenkToast", "Neujahrsgeschenk: +{n} Dublonen", { n: zahl(r.dublonen) }));
      }
    } catch (err) {
      console.warn("Neujahrsgeschenk:", err);
    }
  }

  /* ---------- Hinweis (oben rechts) ---------- */

  let hinweisUhr = null;
  function hinweis(symbol, text) {
    let el = document.getElementById("fh-saison-hinweis");
    if (!el) {
      el = document.createElement("div");
      el.id = "fh-saison-hinweis";
      el.className = "fh-sa-hinweis";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.innerHTML = svg(symbol) + "<span>" + esc(text) + "</span>";
    el.classList.add("ist-da");
    clearTimeout(hinweisUhr);
    hinweisUhr = setTimeout(function () { el.classList.remove("ist-da"); }, 3200);
  }

  function geldNachziehen() {
    if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
  }

  /* ---------- Suchspiel: Funde auf den Seiten ---------- */

  /* Fester Platz je Fund und Jahr - bei allen Besuchern gleich, damit
     man sich Tipps geben kann, und nicht bei jedem Seitenwechsel neu. */
  function platz(nr) {
    let h = 2166136261 ^ (nr * 7919 + Number((stand && stand.heute || "2026").slice(0, 4)));
    const zufall = function () { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    return { x: 4 + zufall() * 88, y: zufall(), dreh: Math.round(zufall() * 40 - 20) };
  }

  function fundeVerteilen() {
    document.querySelectorAll(".fh-sa-fund").forEach(function (b) { b.remove(); });
    const su = suche();
    const s = saison();
    if (!su || !seite || (s !== "halloween" && s !== "ostern")) return;
    const sek = document.getElementById(seite);
    const flaeche = sek && (sek.querySelector(".page-content") || sek);
    if (!flaeche) return;
    if (getComputedStyle(flaeche).position === "static") flaeche.style.position = "relative";
    const hoehe = Math.max(420, flaeche.scrollHeight - 80);

    su.seiten.forEach(function (p, i) {
      const nr = i + 1;
      if (p !== seite || su.gefunden.indexOf(nr) !== -1) return;
      const pl = platz(nr);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fh-sa-fund";
      b.setAttribute("aria-label", T("fund." + s, s === "ostern" ? "Ein Osterei!" : "Ein Kürbis!"));
      b.title = b.getAttribute("aria-label");
      b.style.left = pl.x.toFixed(1) + "%";
      b.style.top = Math.round(110 + pl.y * (hoehe - 170)) + "px";
      b.style.setProperty("--fh-sa-dreh", pl.dreh + "deg");
      b.innerHTML = svg(ART[s].fund);
      b.addEventListener("click", function () { finden(nr, b); });
      flaeche.appendChild(b);
    });
  }

  async function finden(nr, knopf) {
    if (knopf.disabled) return;
    knopf.disabled = true;
    const s = saison();
    try {
      const r = await rpc("saison_fund", { p_nr: nr });
      if (r && r.ok) {
        knopf.classList.add("ist-weg");
        setTimeout(function () { knopf.remove(); }, 420);
        if (stand && stand.suche && stand.suche.gefunden.indexOf(nr) === -1) stand.suche.gefunden.push(nr);
        geldNachziehen();
        hinweis(ART[s].fund, F("gefundenToast." + s, "{n} / 17 gefunden · +{d} Dublonen", { n: r.gefunden, d: zahl(r.dublonen) }));
        if (r.titel) {
          setTimeout(function () {
            hinweis("stern", F("fertigToast", "Alle 17! Titel »{titel}« · +{d} Dublonen", { titel: r.titel, d: zahl(r.bonus) }));
          }, 3400);
        }
        leisteZeichnen();
        chipsZeichnen();
        return;
      }
      knopf.disabled = false;
      const grund = r && r.grund;
      if (grund === "schon") { knopf.remove(); return; }
      hinweis(ART[s].fund, grund === "gesperrt" ? T("gesperrt", "Dein Konto ist gesperrt.") : T("zaehltNicht", "Dieser Fund zählt gerade nicht."));
    } catch (err) {
      knopf.disabled = false;
      console.warn("Fund konnte nicht gemeldet werden:", err);
      hinweis(ART[s].fund, T("fehler", "Das hat nicht geklappt. Versuch es gleich noch einmal."));
    }
  }

  /* ---------- Adventskalender ---------- */

  const TUER_SYMBOL = { dublonen: "muenzen", spind: "fahne", code: "schluessel", eigen: "geschenk" };

  function tuerText(t) {
    if (!t) return "";
    if (t.art === "dublonen") return F("tuer.dublonen", "{n} Dublonen", { n: zahl(t.wert) });
    if (t.art === "spind") {
      const sp = spindTeil(t.wert);
      return sp.art === "banner" ? F("tuer.banner", "Banner »{n}«", { n: sp.name }) : F("tuer.farbe", "Namensfarbe »{n}«", { n: sp.name });
    }
    if (t.art === "eigen" && Number(t.dublonen) > 0) return t.wert + " · " + F("tuer.dublonen", "{n} Dublonen", { n: zahl(t.dublonen) });
    return String(t.wert);
  }

  /* Die Spind-Teile heissen in i18n.js spind.farbe.* bzw. spind.banner.* -
     daran ist auch zu erkennen, welche Art von Teil es ist. */
  function spindTeil(id) {
    if (typeof window.t !== "function") return { art: "farbe", name: id };
    const farbe = window.t("spind.farbe." + id, "");
    if (farbe && farbe !== "spind.farbe." + id) return { art: "farbe", name: farbe };
    const banner = window.t("spind.banner." + id, "");
    return { art: "banner", name: banner && banner !== "spind.banner." + id ? banner : id };
  }

  function adventZeichnen() {
    const ziel = document.getElementById("fh-advent-tueren");
    if (!ziel) return;
    const a = echt() && stand && stand.advent ? stand.advent : { tag: null, geoeffnet: [] };
    const heute = a.tag;
    const auf = {};
    (a.geoeffnet || []).forEach(function (t) { auf[t.tag] = t; });
    /* Ausserhalb des Dezembers (Vorschau, erzwungene Saison) gilt
       nichts als verpasst: dann ist einfach alles noch zu. */
    const imDezember = heute !== null && heute !== undefined;
    let nAuf = 0, nVerfallen = 0;

    ziel.innerHTML = REIHENFOLGE.map(function (n, i) {
      const t = auf[n];
      const farbe = ["ist-a", "ist-b", "ist-c"][i % 3];
      if (t) {
        nAuf++;
        return '<div class="fh-sa-tuer ist-offen' + (n === heute ? " ist-heute" : "") + '"><span class="fh-sa-kante" aria-hidden="true"></span>'
          + '<div class="fh-sa-tuer-kopf"><span class="fh-sa-tuer-nr">' + n + '</span>' + svg(TUER_SYMBOL[t.art] || "geschenk") + '</div>'
          + '<div class="fh-sa-tuer-fuss"><span class="fh-sa-tuer-meta">' + esc((n === heute ? T("heute", "Heute") + " · " : "") + T("art." + t.art, t.art)) + '</span>'
          + '<span class="fh-sa-tuer-text">' + esc(tuerText(t)) + '</span></div></div>';
      }
      if (imDezember && n < heute) {
        nVerfallen++;
        return '<div class="fh-sa-tuer ist-verfallen" title="' + esc(T("verfallen", "Verfallen")) + '">'
          + '<div class="fh-sa-tuer-kopf"><span class="fh-sa-tuer-nr">' + n + '</span>' + svg("verfallen") + '</div>'
          + '<div class="fh-sa-tuer-fuss"><span class="fh-sa-tuer-meta">' + esc(T("verfallen", "Verfallen")) + '</span>'
          + '<span class="fh-sa-tuer-text">' + esc(T("verpasst", "Nicht rechtzeitig geöffnet")) + '</span></div></div>';
      }
      if (n === heute) {
        return '<button type="button" class="fh-sa-tuer ist-jetzt" data-tag="' + n + '"><span class="fh-sa-kante" aria-hidden="true"></span>'
          + '<div class="fh-sa-tuer-kopf"><span class="fh-sa-tuer-nr">' + n + '</span>' + svg("hand") + '</div>'
          + '<div class="fh-sa-tuer-fuss"><span class="fh-sa-tuer-meta">' + esc(T("heute", "Heute")) + '</span>'
          + '<span class="fh-sa-tuer-text">' + esc(T("antippen", "Antippen zum Öffnen")) + '</span></div></button>';
      }
      return '<div class="fh-sa-tuer ist-zu ' + farbe + (n === 24 ? " ist-24" : "") + '" title="' + esc(T("verschlossen", "Noch verschlossen")) + '"><span class="fh-sa-kante" aria-hidden="true"></span>'
        + '<div class="fh-sa-tuer-kopf"><span class="fh-sa-tuer-nr">' + n + '</span>' + svg(n === 24 ? "stern" : "schloss") + '</div>'
        + '<div class="fh-sa-tuer-fuss"><span class="fh-sa-tuer-meta">' + esc(F("datum", "{n}. Dez", { n: n })) + '</span>'
        + '<span class="fh-sa-tuer-text">' + (n === 24 ? esc(T("heiligabend", "Heiligabend")) : "") + '</span></div></div>';
    }).join("");

    const knopf = ziel.querySelector(".ist-jetzt");
    if (knopf) knopf.addEventListener("click", function () { oeffnen(Number(knopf.dataset.tag), knopf); });

    const setze = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    setze("fh-advent-heute", imDezember ? F("heuteDatum", "{n}. Dezember", { n: heute }) : "–");
    setze("fh-advent-offen", String(nAuf));
    setze("fh-advent-verfallen", String(nVerfallen));
  }

  async function oeffnen(tag, knopf) {
    knopf.disabled = true;
    try {
      const r = await rpc("advent_oeffnen", { p_tag: tag });
      if (r && r.ok) {
        if (stand && stand.advent) stand.advent.geoeffnet = (stand.advent.geoeffnet || []).concat([r]);
        geldNachziehen();
        fensterZeigen(r);
        adventZeichnen();
        chipsZeichnen();
        return;
      }
      knopf.disabled = false;
      if (r && r.grund === "schon") { laden(); return; }
      hinweis("geschenk", r && r.grund === "gesperrt" ? T("gesperrt", "Dein Konto ist gesperrt.") : T("nichtHeute", "Dieses Türchen lässt sich heute nicht öffnen."));
    } catch (err) {
      knopf.disabled = false;
      console.warn("Tuerchen:", err);
      hinweis("geschenk", T("fehler", "Das hat nicht geklappt. Versuch es gleich noch einmal."));
    }
  }

  function fensterZeigen(t) {
    let el = document.getElementById("fh-advent-fenster");
    if (!el) {
      el = document.createElement("div");
      el.id = "fh-advent-fenster";
      el.className = "fh-sa-fenster";
      el.addEventListener("click", function (ev) { if (ev.target === el || ev.target.closest("[data-zu]")) el.remove(); });
      document.body.appendChild(el);
    }
    const notiz = { dublonen: T("notiz.dublonen", "Landen sofort in deiner Kasse."), spind: T("notiz.spind", "Liegt ab jetzt in deinem Spind bereit."),
      code: T("notiz.code", "Löse ihn auf der Code-Seite ein, solange er gilt."), eigen: T("notiz.eigen", "Die Sonderbelohnung der Crew.") }[t.art];
    el.innerHTML = '<div class="fh-sa-fenster-karte" role="dialog" aria-modal="true" aria-labelledby="fh-advent-fenster-titel">'
      + '<span class="fh-sa-kante" aria-hidden="true"></span>'
      + '<p class="fh-sa-kicker">' + esc(F("tuerNr", "Türchen {n}", { n: t.tag })) + '</p>'
      + '<div class="fh-sa-flamme ist-gross">' + svg(TUER_SYMBOL[t.art] || "geschenk") + '</div>'
      + '<h3 id="fh-advent-fenster-titel">' + esc(tuerText(t)) + '</h3>'
      + '<p class="fh-sa-notiz">' + esc(notiz) + '</p>'
      + '<button type="button" class="fh-cta" data-zu>' + svg("haken") + '<span>' + esc(t.art === "code" ? T("codeMerken", "Code merken") : T("einsammeln", "Einsammeln")) + '</span></button></div>';
    const b = el.querySelector("[data-zu]");
    if (b) b.focus();
  }

  /* ---------- Effekte (Schnee, Glut, Blueten, Feuerwerk) ---------- */

  const fx = { finale: null };
  let fxLaeuft = false;

  function fxStarten() {
    let c = document.getElementById("fh-saison-fx");
    const s = saison();
    if (s === "original") { if (c) c.hidden = true; return; }
    if (!c) {
      c = document.createElement("canvas");
      c.id = "fh-saison-fx";
      c.className = "fh-sa-fx";
      c.setAttribute("aria-hidden", "true");
      document.body.appendChild(c);
    }
    c.hidden = false;
    if (fxLaeuft) return;
    fxLaeuft = true;

    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const groesse = function () { W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    groesse();
    window.addEventListener("resize", groesse);

    let teile = [], raketen = [], zuletzt = null, naechstesFw = 0;
    const FW = ["#f0d27a", "#9184d9", "#bdb3f2", "#ff7ad9", "#5ff3ff", "#f0c96a"];
    const R = function (a, b) { return a + Math.random() * (b - a); };
    const ARTEN = ["peony", "ring", "willow", "crackle"];

    const burst = function (x, y, n, art) {
      art = art || ARTEN[(Math.random() * ARTEN.length) | 0];
      const f1 = FW[(Math.random() * FW.length) | 0], f2 = FW[(Math.random() * FW.length) | 0];
      teile.push({ k: "blitz", x: x, y: y, life: 1, r: art === "willow" ? 90 : 60 });
      for (let i = 0; i < n; i++) {
        let a = Math.random() * Math.PI * 2, v;
        const sp = { k: "funke", x: x, y: y, life: 1, r: R(1, 2), drag: 0.975, g: 0.045, d: R(0.009, 0.016), col: i % 2 ? f1 : f2, fl: false, tail: 1 };
        if (art === "ring") { a = i / n * Math.PI * 2; v = R(3.1, 3.4); sp.g = 0.03; sp.d = 0.012; sp.col = f1; }
        else if (art === "willow") { v = R(0.6, 3.2); sp.drag = 0.955; sp.g = 0.022; sp.d = R(0.004, 0.007); sp.col = "#f0d27a"; sp.r = 1.3; sp.tail = 5; }
        else if (art === "crackle") { v = R(1, 3.6); sp.fl = true; sp.col = Math.random() < 0.5 ? "#fff" : f1; sp.d = 0.014; }
        else { v = R(1, 4.6); }
        sp.vx = Math.cos(a) * v; sp.vy = Math.sin(a) * v;
        teile.push(sp);
      }
    };
    const start = function (art) { raketen.push({ x: R(W * 0.12, W * 0.88), y: H + 10, vx: R(-0.6, 0.6), vy: R(-10, -13), ty: R(H * 0.1, H * 0.42), art: art }); };
    const konfetti = function (n) {
      const C = ["#f0d27a", "#c9a227", "#9184d9", "#bdb3f2", "#e8edf4"];
      for (let i = 0; i < n; i++) teile.push({ k: "konf", x: R(0, W), y: R(-H * 0.4, -10), vx: R(-0.7, 0.7), vy: R(1.2, 2.8), rot: R(0, 6), vr: R(-0.12, 0.12), w: R(5, 9), h: R(2.5, 4.5), col: C[(Math.random() * C.length) | 0] });
    };
    fx.finale = function () {
      if (reduziert()) return;
      burst(W * 0.5, H * 0.36, 160, "peony"); burst(W * 0.28, H * 0.3, 90, "ring"); burst(W * 0.72, H * 0.32, 90, "ring");
      konfetti(200);
      for (let i = 0; i < 14; i++) setTimeout(function () { start(ARTEN[i % 4]); }, 350 + i * 380);
      setTimeout(function () { burst(W * 0.2, H * 0.22, 110, "willow"); burst(W * 0.5, H * 0.16, 130, "willow"); burst(W * 0.8, H * 0.22, 110, "willow"); }, 5600);
    };

    const bild = function (zeit) {
      requestAnimationFrame(bild);
      if (document.hidden) return;
      const s = saison();
      if (s !== zuletzt) { teile = []; raketen = []; zuletzt = s; }
      ctx.clearRect(0, 0, W, H);
      if (s === "original") return;
      const mittLaeuft = !!document.querySelector(".fh-sa-mitternacht.ist-zaehlen");
      if (!reduziert()) {
        if (s === "weihnachten" && teile.length < 140) teile.push({ k: "schnee", x: R(0, W), y: -8, vy: R(0.35, 1.1), r: R(0.8, 2.6), ph: R(0, 6), a: R(0.35, 0.85) });
        if (s === "halloween" && teile.length < 60 && Math.random() < 0.25) teile.push({ k: "glut", x: R(0, W), y: H + 6, vy: R(-0.9, -0.3), r: R(0.8, 2), ph: R(0, 6), life: 1, col: Math.random() < 0.75 ? "255,157,61" : "166,107,255" });
        if (s === "ostern" && teile.length < 40 && Math.random() < 0.08) teile.push({ k: "bluete", x: R(-40, W * 0.6), y: -10, vx: R(0.3, 0.9), vy: R(0.3, 0.8), rot: R(0, 6), vr: R(-0.02, 0.02), col: ["255,154,168", "196,166,255", "143,217,138", "240,201,106"][(Math.random() * 4) | 0] });
        if (s === "neujahr" && zeit > naechstesFw && !mittLaeuft) { start(); naechstesFw = zeit + R(1800, 3400); }
      }
      raketen = raketen.filter(function (r) {
        r.x += r.vx; r.y += r.vy; r.vy *= 0.985;
        teile.push({ k: "spur", x: r.x + R(-1, 1), y: r.y + 4, life: 0.7, d: 0.035, r: R(0.8, 1.6) });
        ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,240,200,.95)"; ctx.beginPath(); ctx.arc(r.x, r.y, 2, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        if (r.y <= r.ty) { burst(r.x, r.y, r.art === "ring" ? 72 : 90, r.art); return false; }
        return true;
      });
      teile = teile.filter(function (p) {
        if (p.k === "schnee") { p.y += p.vy; p.x += Math.sin(zeit / 1200 + p.ph) * 0.35;
          ctx.fillStyle = "rgba(232,237,244," + p.a + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); return p.y < H + 10; }
        if (p.k === "glut") { p.y += p.vy; p.x += Math.sin(zeit / 900 + p.ph) * 0.4; p.life -= 0.0025;
          ctx.fillStyle = "rgba(" + p.col + "," + Math.max(0, p.life * 0.8) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); return p.life > 0 && p.y > -10; }
        if (p.k === "bluete") { p.x += p.vx + Math.sin(zeit / 1400 + p.rot); p.y += p.vy; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = "rgba(" + p.col + ",.45)"; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, 7); ctx.fill(); ctx.restore(); return p.y < H + 20 && p.x < W + 20; }
        if (p.k === "konf") { p.x += p.vx + Math.sin(zeit / 700 + p.rot) * 0.6; p.y += p.vy; p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2)); ctx.globalAlpha = 0.9; ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); ctx.globalAlpha = 1; return p.y < H + 20; }
        ctx.globalCompositeOperation = "lighter";
        if (p.k === "blitz") { p.life -= 0.07; const rr = p.r * (1.6 - p.life);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr); g.addColorStop(0, "rgba(255,244,214," + Math.max(0, p.life * 0.7) + ")"); g.addColorStop(1, "rgba(255,244,214,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill(); ctx.globalCompositeOperation = "source-over"; return p.life > 0; }
        if (p.k === "spur") { p.life -= p.d; p.y += 0.3;
          ctx.fillStyle = "rgba(240,210,122," + Math.max(0, p.life) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalCompositeOperation = "source-over"; return p.life > 0; }
        p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.life -= p.d;
        let al = Math.max(0, p.life); if (p.fl && p.life < 0.6) al *= Math.random() < 0.5 ? 1 : 0.15;
        ctx.globalAlpha = al; ctx.strokeStyle = p.col; ctx.lineWidth = p.r; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * 3 * p.tail, p.y - p.vy * 3 * p.tail); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        return p.life > 0;
      });
    };
    requestAnimationFrame(bild);
  }

  /* ---------- Seitenwechsel und Start ---------- */

  window.updateSaisonPage = function (pageID) {
    seite = pageID;
    if (pageID === "advent" && saison() !== "weihnachten") {
      if (typeof changePage === "function") setTimeout(function () { changePage("stand"); }, 0);
      return;
    }
    if (pageID === "advent") adventZeichnen();
    if (pageID === "stand") { kickerSetzen(); leisteZeichnen(); }
    /* Erst nach dem Aufbau der Seite verteilen - manche Seiten
       zeichnen ihren Inhalt asynchron und werden dabei hoeher. */
    setTimeout(fundeVerteilen, 400);
  };

  window.fhSaisonNeuZeichnen = function () { anwenden(); };

  window.fhSaison = {
    stand: function () { return stand; },
    saison: saison,
    vorschauAktiv: function () { return vorschau; },
    laden: laden,
    mitternacht: mitternacht,
    /* Admin-Vorschau: nur dieser Browser, nur das Aussehen. null = echt. */
    vorschau: function (s) {
      vorschau = SAISONS.indexOf(s) !== -1 ? s : null;
      try { if (vorschau) sessionStorage.setItem(VORSCHAU_SCHLUESSEL, vorschau); else sessionStorage.removeItem(VORSCHAU_SCHLUESSEL); } catch (e) { /* egal */ }
      anwenden();
      return saison();
    },
  };

  function los() {
    const offen = document.querySelector(".page.active-page");
    seite = offen ? offen.id : null;
    anwenden();
    laden();
    clearInterval(neuLadenUhr);
    neuLadenUhr = setInterval(function () { if (!document.hidden) laden(); }, NEU_LADEN_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) laden(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los);
  else los();
})();
