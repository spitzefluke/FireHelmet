/* ======================================================
   PIRATENPASS #2: DIE SEEKARTE
   ---------------------------------------------------
   Darstellung nach dem Entwurf "Piratenpass.dc.html": Kopf mit
   Restlaufzeit und Dublonen, Stufen-Medaillon mit Rang und EP-Balken,
   Kapitaenspass-Karte, die Seekarte mit zwei Spuren (Matrose fuer
   alle, Kapitaen mit Kapitaenspass) und darunter das Logbuch der
   gewaehlten Stufe.

   Aufgerufen von renderPassPage() (piratenpass.js), sobald die
   laufende Saison "seekarte" traegt. Anders als Pass 1 kennt der
   Browser hier die Belohnungen NICHT selbst: pass_stand() liefert
   Belohnungen, Stand und Abgeholtes, pass_belohnung_holen() /
   pass_alle_holen() schreiben gut, pass_kapitaen_kaufen() bucht den
   Kapitaenspass ab (alles Migration 53). Der Browser rechnet nur
   noch, was er anzeigt.
====================================================== */
(function () {
  "use strict";

  const PASS_ID = "season2";
  const SPALTE = 132; // Breite einer Stufen-Spalte in px (CSS: .p2-stufe)

  /* lucide (ISC), stroke-width 1.6 - siehe CLAUDE.md "Emoji sind kein Symbolsatz". */
  const SVG = function (pfade) {
    return '<svg class="p2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";
  };
  const ICON = {
    schaedel: SVG('<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>'),
    muenzen: SVG('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'),
    ep: SVG('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'),
    skill: SVG('<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'),
    titel: SVG('<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>'),
    schloss: SVG('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    haken: SVG('<path d="M20 6 9 17l-5-5"/>'),
    krone: SVG('<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>'),
    anker: SVG('<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>'),
  };

  /* Meilensteine haben im Logbuch einen eigenen Namen. */
  const MEILENSTEINE = [10, 20, 30, 40, 50];
  /* Rang nach erreichter Stufe (ab Stufe ...). */
  const RAENGE = [[50, "koenig"], [40, "maat"], [30, "steuermann"], [20, "bootsmann"], [10, "matrose"], [5, "schiffsjunge"], [0, "landratte"]];

  let zustand = {
    stand: null,        // Antwort von pass_stand()
    fehler: false,
    laedt: false,
    wahl: null,         // gewaehlte Stufe im Logbuch
    beschaeftigt: false,
    kaufBereit: false,  // erster Klick auf "anheuern" scharf gemacht
    meldung: "",
    pass: null,
    aktiv: false,
    vorschau: false,
    ersterAufbau: true,
  };
  let vorschauAn = false;
  let kaufTimer = 0;
  let ladeToken = 0;

  function tx(key, fallback) { return typeof t === "function" ? t(key, fallback) : fallback; }
  function txf(key, fallback, werte) {
    let s = tx(key, fallback);
    Object.keys(werte || {}).forEach(function (k) { s = s.split("{" + k + "}").join(werte[k]); });
    return s;
  }
  function esc(s) {
    return typeof escapeHtml === "function" ? escapeHtml(String(s == null ? "" : s))
      : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function zahl(n) {
    const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
    return Number(n || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE");
  }
  function xpFuer(stufe) {
    return typeof passXpRequiredForTier === "function" ? passXpRequiredForTier(stufe) : (stufe * (stufe + 1) * 50);
  }
  function hatDb() { return typeof supabaseClient !== "undefined" && supabaseClient; }

  /* ---------- Daten ---------- */
  async function laden() {
    const meinToken = ++ladeToken;
    if (!hatDb()) { zustand.fehler = true; zeichnen(); return; }
    zustand.laedt = true;
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const antwort = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("pass_stand", { p_pass_id: PASS_ID });
      });
      if (antwort.error) throw antwort.error;
      if (meinToken !== ladeToken) return;
      zustand.stand = antwort.data || null;
      zustand.fehler = !zustand.stand;
      avatareWiederherstellen();
    } catch (err) {
      console.warn("Piratenpass 2 konnte nicht geladen werden:", err);
      if (meinToken !== ladeToken) return;
      zustand.fehler = true;
    }
    zustand.laedt = false;
    zeichnen();
  }

  /* Dauerhafte Avatare liegen lokal (unlockAvatar, wie bei Pass 1).
     Auf einem neuen Geraet holt diese Schleife sie aus dem
     Abgeholt-Verzeichnis des Servers zurueck. */
  function avatareWiederherstellen() {
    if (typeof unlockAvatar !== "function" || !zustand.stand) return;
    const geholt = new Set(zustand.stand.geholt || []);
    (zustand.stand.belohnungen || []).forEach(function (b) {
      if (b.avatar_id && !b.avatar_tage && geholt.has(b.stufe + ":" + b.spur)) unlockAvatar(b.avatar_id);
    });
  }

  function belohnung(stufe, spur) {
    const liste = (zustand.stand && zustand.stand.belohnungen) || [];
    for (let i = 0; i < liste.length; i++) if (liste[i].stufe === stufe && liste[i].spur === spur) return liste[i];
    return null;
  }

  function stufe() { return Math.min(50, Number((zustand.stand && zustand.stand.stufe) || 0)); }
  function istKapitaen() { return !!(zustand.stand && zustand.stand.kapitaen); }
  function offen() { return !!(zustand.stand && zustand.stand.offen) && zustand.aktiv; }
  function geholt(n, spur) { return ((zustand.stand && zustand.stand.geholt) || []).indexOf(n + ":" + spur) >= 0; }

  /* ---------- Texte zu einer Belohnung ---------- */
  function avatarName(id) {
    const key = "pass2.av." + id;
    const fallback = { "pass-s2-knochenflagge": "Flagge: Gekreuzte Knochen", "pass-s2-moewenschrei": "Schaluppe „Möwenschrei“",
      "pass-s2-geisterpapagei": "Geisterpapagei", "pass-s2-rote-lilie": "Brigg „Rote Lilie“", "pass-s2-schwarze-witwe": "Galeone „Schwarze Witwe“" }[id] || id;
    return tx(key, fallback);
  }
  function avatarBild(id) {
    const eintrag = typeof wheelSpecialAvatars !== "undefined" ? wheelSpecialAvatars.find(function (a) { return a.id === id; }) : null;
    return eintrag && /\//.test(eintrag.avatar) ? eintrag.avatar : null;
  }
  function teile(b) {
    const t = [];
    if (b.avatar_id) t.push(avatarName(b.avatar_id) + (b.avatar_tage ? " (" + txf("pass2.tage", "{n} Tage", { n: b.avatar_tage }) + ")" : ""));
    if (b.titel_text) t.push(txf("pass2.titel", "Titel: {t}", { t: b.titel_text }));
    if (b.dublonen) t.push(txf("pass2.dublonen", "{n} Dublonen", { n: zahl(b.dublonen) }));
    if (b.skillpunkte) t.push(b.skillpunkte === 1 ? tx("pass2.skillpunkt", "1 Skillpunkt") : txf("pass2.skillpunkte", "{n} Skillpunkte", { n: b.skillpunkte }));
    if (b.xp) t.push(txf("pass2.ep", "{n} EP", { n: zahl(b.xp) }));
    return t;
  }
  function symbol(b, gross) {
    if (!b) return ICON.anker;
    if (b.avatar_id) {
      const bild = avatarBild(b.avatar_id);
      if (bild) return '<img class="p2-avatar' + (gross ? " p2-avatar-gross" : "") + '" src="' + esc(bild) + '" alt="" loading="lazy" decoding="async">';
    }
    if (b.stufe === 50) return ICON.krone;
    if (b.titel_id) return ICON.titel;
    if (b.skillpunkte) return ICON.skill;
    if (b.xp) return ICON.ep;
    return ICON.muenzen;
  }

  /* Zustand einer Zelle: geholt / gesperrt / bereit. */
  function zelle(n, spur) {
    const b = belohnung(n, spur);
    const erreicht = n <= stufe();
    const istGeholt = geholt(n, spur);
    const ohnePass = spur === "kapitaen" && !istKapitaen();
    let art = "bereit", status = tx("pass2.einsammeln", "Einsammeln!");
    if (istGeholt) { art = "geholt"; status = tx("pass2.gepluendert", "Geplündert"); }
    else if (!erreicht) { art = "zu"; status = txf("pass2.stufeN", "Stufe {n}", { n: n }); }
    else if (ohnePass) { art = "zu"; status = tx("pass2.kapitaenspass", "Kapitänspass"); }
    else if (!offen()) { art = "zu"; status = zustand.vorschau ? tx("pass2.vorschau", "Vorschau") : tx("pass2.vorbei", "Vorbei"); }
    return { b: b, art: art, status: status, holbar: art === "bereit" && !!b };
  }

  /* ---------- Zeichnen ---------- */
  function rang(n) {
    for (let i = 0; i < RAENGE.length; i++) if (n >= RAENGE[i][0]) return tx("pass2.rang." + RAENGE[i][1], RAENGE[i][1]);
    return "";
  }

  function kopfHtml() {
    const d = zustand.pass && typeof resolvePassDates === "function" ? resolvePassDates(zustand.pass) : null;
    const tage = d ? Math.max(0, Math.ceil((d.end.getTime() - Date.now()) / 86400000)) : null;
    const rest = zustand.vorschau ? tx("pass2.vorschauKopf", "Vorschau – noch nicht freigeschaltet")
      : (!zustand.aktiv || tage === null) ? tx("pass2.vorbeiKopf", "Die Saison ist vorüber")
      : tage === 1 ? tx("pass2.restEins", "Die Flut kehrt morgen") : txf("pass2.rest", "Die Flut kehrt in {n} Tagen", { n: tage });
    const dub = zustand.stand ? zahl(zustand.stand.dublonen) : "–";
    return '<header class="p2-kopf">' +
      '<div class="p2-marke"><span class="p2-siegel">' + ICON.schaedel + "</span>" +
        '<div class="p2-marke-text"><span class="p2-name">' + esc(tx("pass2.name", "Piratenpass")) + "</span>" +
        '<span class="p2-saison">' + esc(tx("pass2.saison", "Saison II · Die Verfluchte See")) + "</span></div></div>" +
      '<div class="p2-kopf-rechts"><span class="p2-rest">' + esc(rest) + "</span>" +
        '<div class="p2-geld"><span class="p2-geld-punkt" aria-hidden="true"></span><span class="p2-geld-wert">' + esc(dub) +
        '</span><span class="p2-geld-name">' + esc(tx("pass2.dublonenWort", "Dublonen")) + "</span></div></div>" +
      "</header>";
  }

  function heldHtml(holbar) {
    const s = stufe();
    const pxp = Number((zustand.stand && zustand.stand.pass_xp) || 0);
    const basis = xpFuer(s), naechste = xpFuer(Math.min(50, s + 1));
    const drin = s >= 50 ? 1 : Math.max(0, pxp - basis), noetig = s >= 50 ? 1 : Math.max(1, naechste - basis);
    const prozent = Math.min(100, Math.round((drin / noetig) * 1000) / 10);
    const links = s >= 50 ? tx("pass2.hoechste", "Höchste Stufe erreicht") : txf("pass2.epStand", "{a} / {b} EP", { a: zahl(drin), b: zahl(noetig) });
    const rechts = s >= 50 ? tx("pass2.legende", "Ihr seid Legende") : txf("pass2.epNoch", "Noch {n} EP bis Stufe {s}", { n: zahl(noetig - drin), s: s + 1 });
    const alleAus = !holbar || zustand.beschaeftigt;
    return '<div class="p2-pergament p2-held">' +
      '<div class="p2-medaillon"><span class="p2-medaillon-wort">' + esc(tx("pass2.stufe", "Stufe")) + '</span><span class="p2-medaillon-zahl">' + s + "</span></div>" +
      '<div class="p2-held-rumpf">' +
        '<span class="p2-rang">' + esc(rang(s)) + "</span>" +
        '<div class="p2-balken" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + prozent + '" aria-label="' + esc(tx("pass2.fortschritt", "Fortschritt zur nächsten Stufe")) + '"><div class="p2-balken-fuell" style="width:' + prozent + '%"></div></div>' +
        '<div class="p2-held-zeile"><span class="p2-nowrap">' + esc(links) + '</span><span class="p2-kursiv">' + esc(rechts) + "</span></div>" +
        '<p class="p2-hinweis">' + esc(tx("pass2.epQuellen", "Pass-EP gibt es fürs Lesen, Codes, Tagesquests, die Schiffsreparatur und Boss-Angriffe.")) + "</p>" +
        '<div class="p2-held-knoepfe"><button type="button" class="p2-knopf p2-knopf-dunkel" data-p2-aktion="alle"' + (alleAus ? " disabled" : "") + ">" +
          esc(txf("pass2.alle", "Alles einsammeln ({n})", { n: holbar })) + "</button></div>" +
        '<p class="p2-meldung" role="status" aria-live="polite">' + esc(zustand.meldung) + "</p>" +
      "</div></div>";
  }

  function kapitaenHtml() {
    const preis = zahl((zustand.stand && zustand.stand.preis) || 950);
    if (istKapitaen()) {
      return '<div class="p2-kapitaen">' +
        '<span class="p2-kapitaen-ober">' + esc(tx("pass2.kapitaenspass", "Kapitänspass")) + "</span>" +
        '<span class="p2-kapitaen-titel">' + esc(tx("pass2.kapitaenJaTitel", "Ihr segelt unter goldener Flagge")) + "</span>" +
        '<span class="p2-kapitaen-text">' + esc(tx("pass2.kapitaenJaText", "Alle 50 Kapitänsbelohnungen sind freigeschaltet. Erreichte Stufen könnt Ihr sofort plündern.")) + "</span>" +
        "</div>";
    }
    const kaufbar = offen() && !zustand.beschaeftigt;
    const knopf = zustand.kaufBereit
      ? txf("pass2.kaufenSicher", "Wirklich? {p} Dublonen zahlen", { p: preis })
      : txf("pass2.kaufen", "Für {p} Dublonen anheuern", { p: preis });
    return '<div class="p2-kapitaen">' +
      '<span class="p2-kapitaen-ober">' + esc(tx("pass2.kapitaenspass", "Kapitänspass")) + "</span>" +
      '<span class="p2-kapitaen-titel">' + esc(tx("pass2.kapitaenNeinTitel", "Hisst die goldene Flagge")) + "</span>" +
      '<span class="p2-kapitaen-text">' + esc(tx("pass2.kapitaenNeinText", "50 zusätzliche Belohnungen, darunter die Galeone „Schwarze Witwe“ und der Titel „Schrecken der Meere“.")) + "</span>" +
      '<button type="button" class="p2-knopf p2-knopf-gold' + (zustand.kaufBereit ? " ist-scharf" : "") + '" data-p2-aktion="kaufen"' + (kaufbar ? "" : " disabled") + ">" + esc(knopf) + "</button>" +
      "</div>";
  }

  function zellenHtml(n, spur, z) {
    const name = z.b ? teile(z.b).join(" · ") : "–";
    const meilenstein = MEILENSTEINE.indexOf(n) >= 0;
    const statusIcon = z.art === "geholt" ? ICON.haken : z.art === "zu" ? ICON.schloss : "";
    return '<button type="button" class="p2-zelle p2-zelle-' + spur + " ist-" + z.art + (meilenstein ? " ist-meilenstein" : "") + '"' +
      ' data-p2-zelle="' + n + ":" + spur + '" aria-label="' + esc(txf("pass2.zelleAria", "Stufe {n}, {spur}: {name} – {status}", {
        n: n, spur: spur === "kapitaen" ? tx("pass2.kapitaen", "Kapitän") : tx("pass2.matrose", "Matrose"), name: name, status: z.status })) + '">' +
      '<span class="p2-zelle-symbol">' + symbol(z.b) + "</span>" +
      '<span class="p2-zelle-name" lang="' + (typeof getCurrentLang === "function" ? getCurrentLang() : "de") + '">' + esc(name) + "</span>" +
      '<span class="p2-zelle-status">' + statusIcon + "<span>" + esc(z.status) + "</span></span>" +
      "</button>";
  }

  function karteHtml(zellen) {
    const s = stufe();
    let spalten = "";
    for (let n = 1; n <= 50; n++) {
      const erreicht = n <= s, aktuell = n === s, gewaehlt = n === zustand.wahl;
      const meilenstein = MEILENSTEINE.indexOf(n) >= 0;
      spalten += '<div class="p2-stufe' + (aktuell ? " ist-aktuell" : "") + (gewaehlt ? " ist-gewaehlt" : "") + (erreicht ? " ist-erreicht" : "") + (meilenstein ? " ist-meilenstein" : "") + '">' +
        '<div class="p2-stufe-kopf"><span class="p2-linie" aria-hidden="true"></span>' +
          '<button type="button" class="p2-punkt" data-p2-wahl="' + n + '" aria-label="' + esc(txf("pass2.stufeN", "Stufe {n}", { n: n })) + '"' + (gewaehlt ? ' aria-pressed="true"' : "") + ">" + n + "</button></div>" +
        '<div class="p2-feld">' + zellenHtml(n, "matrose", zellen[n].matrose) + "</div>" +
        '<div class="p2-feld p2-feld-kapitaen">' + zellenHtml(n, "kapitaen", zellen[n].kapitaen) + "</div>" +
        "</div>";
    }
    return '<section class="p2-abschnitt" aria-labelledby="p2-karte-titel">' +
      '<div class="p2-abschnitt-kopf"><h2 id="p2-karte-titel" class="p2-ueberschrift">' + esc(tx("pass2.karte", "Die Seekarte · 50 Stufen")) + "</h2>" +
        '<div class="p2-sprung"><button type="button" class="p2-knopf-klein" data-p2-aktion="aktuell">' + esc(tx("pass2.zurAktuellen", "Zur aktuellen Stufe")) + "</button>" +
        '<button type="button" class="p2-knopf-klein" data-p2-aktion="schatz">' + esc(tx("pass2.zumSchatz", "Zum Schatz (50)")) + "</button></div></div>" +
      '<div class="p2-karte">' +
        '<div class="p2-spuren" aria-hidden="true"><div class="p2-spuren-kopf"></div>' +
          '<div class="p2-spur"><span class="p2-spur-name">' + esc(tx("pass2.matrose", "Matrose")) + '</span><span class="p2-spur-unter">' + esc(tx("pass2.gratis", "Gratis")) + "</span></div>" +
          '<div class="p2-spur p2-spur-kapitaen"><span class="p2-spur-name">' + esc(tx("pass2.kapitaen", "Kapitän")) + '</span><span class="p2-spur-unter">' +
            esc(istKapitaen() ? tx("pass2.freigeschaltet", "Freigeschaltet") : tx("pass2.gesperrt", "Gesperrt")) + "</span></div></div>" +
        '<div class="p2-spur-fahrt" tabindex="0" aria-label="' + esc(tx("pass2.karteAria", "Seekarte, seitlich scrollbar")) + '"><div class="p2-reihe">' + spalten + "</div></div>" +
      "</div></section>";
  }

  function logbuchHtml(zellen) {
    const s = stufe();
    const n = zustand.wahl || Math.max(1, s);
    const titel = MEILENSTEINE.indexOf(n) >= 0 ? tx("pass2.meilenstein." + n, "Stufe " + n)
      : n <= s ? tx("pass2.erreichteStufe", "Erreichte Stufe") : tx("pass2.unerforscht", "Unerforschte Gewässer");
    const pxp = Number((zustand.stand && zustand.stand.pass_xp) || 0);
    const bedarf = n <= s ? tx("pass2.schonErreicht", "Diese Stufe habt Ihr bereits erreicht.")
      : txf("pass2.benoetigt", "Benötigt {n} weitere EP.", { n: zahl(Math.max(0, xpFuer(n) - pxp)) });
    function eintrag(spur) {
      const z = zellen[n][spur];
      return '<div class="p2-log-eintrag p2-log-' + spur + '"><span class="p2-log-symbol">' + symbol(z.b, true) + "</span>" +
        '<div class="p2-log-text"><span class="p2-log-spur">' + esc(spur === "kapitaen" ? tx("pass2.kapitaen", "Kapitän") : tx("pass2.matrose", "Matrose")) + "</span>" +
        '<span class="p2-log-name">' + esc(z.b ? teile(z.b).join(" · ") : "–") + "</span>" +
        '<span class="p2-log-status">' + esc(z.status) + "</span></div></div>";
    }
    return '<section class="p2-abschnitt"><div class="p2-pergament p2-logbuch" aria-live="polite">' +
      '<div class="p2-log-kopf"><span class="p2-log-ober">' + esc(txf("pass2.logbuch", "Logbuch · Stufe {n}", { n: n })) + "</span>" +
        '<span class="p2-log-titel">' + esc(titel) + '</span><span class="p2-log-bedarf">' + esc(bedarf) + "</span></div>" +
      eintrag("matrose") + eintrag("kapitaen") +
      "</div></section>";
  }

  function zeichnen() {
    const container = document.getElementById("streamraetsel-content");
    if (!container || !zustand.pass) return;
    if (!container.__p2) {
      container.addEventListener("click", klick);
      container.__p2 = true;
    }
    if (zustand.laedt && !zustand.stand) {
      container.innerHTML = '<div class="p2-wrap"><p class="p2-laedt">' + esc(tx("pass2.laedt", "Die Seekarte wird entrollt …")) + "</p></div>";
      return;
    }
    if (zustand.fehler || !zustand.stand) {
      container.innerHTML = '<div class="p2-wrap"><div class="p2-pergament p2-fehler"><p>' +
        esc(tx("pass2.fehler", "Die Seekarte ließ sich gerade nicht laden.")) + '</p><button type="button" class="p2-knopf p2-knopf-dunkel" data-p2-aktion="neu">' +
        esc(tx("pass2.nochmal", "Nochmal versuchen")) + "</button></div></div>";
      return;
    }

    const zellen = {};
    let holbar = 0;
    for (let n = 1; n <= 50; n++) {
      zellen[n] = { matrose: zelle(n, "matrose"), kapitaen: zelle(n, "kapitaen") };
      if (zellen[n].matrose.holbar) holbar++;
      if (zellen[n].kapitaen.holbar) holbar++;
    }

    const altFahrt = container.querySelector(".p2-spur-fahrt");
    const altScroll = altFahrt ? altFahrt.scrollLeft : null;

    container.innerHTML = '<div class="p2-wrap">' +
      (zustand.vorschau ? '<p class="p2-vorschau-band">' + esc(tx("pass2.vorschauBand", "Admin-Vorschau: So sieht Pass 2 aus. Abholen und Kaufen gehen erst nach der Freigabe.")) + "</p>" : "") +
      kopfHtml() +
      '<section class="p2-oben">' + heldHtml(holbar) + kapitaenHtml() + "</section>" +
      karteHtml(zellen) +
      logbuchHtml(zellen) +
      "</div>";

    const fahrt = container.querySelector(".p2-spur-fahrt");
    if (fahrt) {
      if (altScroll !== null) fahrt.scrollLeft = altScroll;
      else if (zustand.ersterAufbau) { zustand.ersterAufbau = false; requestAnimationFrame(function () { springe(Math.max(1, stufe()), true); }); }
    }
  }

  function springe(n, sofort) {
    const fahrt = document.querySelector("#streamraetsel-content .p2-spur-fahrt");
    if (!fahrt) return;
    const ziel = Math.max(0, (n - 1) * SPALTE - fahrt.clientWidth / 2 + SPALTE / 2);
    const ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fahrt.scrollTo({ left: ziel, behavior: sofort || ruhig ? "auto" : "smooth" });
  }

  /* ---------- Handlungen ---------- */
  function meldungAus(e) {
    const t = [];
    if (e.dublonen) t.push(txf("pass2.dublonen", "{n} Dublonen", { n: zahl(e.dublonen) }));
    if (e.xp) t.push(txf("pass2.ep", "{n} EP", { n: zahl(e.xp) }));
    if (e.skillpunkte) t.push(e.skillpunkte === 1 ? tx("pass2.skillpunkt", "1 Skillpunkt") : txf("pass2.skillpunkte", "{n} Skillpunkte", { n: e.skillpunkte }));
    (e.avatare || (e.avatar_id ? [{ avatar_id: e.avatar_id, avatar_tage: e.avatar_tage }] : [])).forEach(function (a) { t.push(avatarName(a.avatar_id)); });
    (e.titel ? (Array.isArray(e.titel) ? e.titel : [e.titel]) : []).forEach(function (ti) { t.push(txf("pass2.titel", "Titel: {t}", { t: ti.text })); });
    return t.length ? txf("pass2.erbeutet", "Erbeutet: {was}", { was: t.join(", ") }) : "";
  }

  function grundText(grund) {
    const texte = {
      "tageslimit": tx("pass2.grund.tageslimit", "Für heute ist dein Dublonen-Tagesdeckel voll. Der Rest wartet bis morgen."),
      "keine-saison": tx("pass2.grund.keineSaison", "Die Saison läuft gerade nicht."),
      "zu-frueh": tx("pass2.grund.zuFrueh", "Diese Stufe hast du noch nicht erreicht."),
      "kein-kapitaen": tx("pass2.grund.keinKapitaen", "Dafür brauchst du den Kapitänspass."),
      "schon": tx("pass2.grund.schon", "Schon geplündert."),
      "zu-wenig": tx("pass2.grund.zuWenig", "Dafür reichen deine Dublonen nicht."),
      "gesperrt": tx("pass2.grund.gesperrt", "Dein Konto ist gesperrt."),
    };
    return texte[grund] || tx("pass2.grund.fehler", "Das hat nicht geklappt. Versuch es gleich noch einmal.");
  }

  /* Nach einer Gutschrift: alles, was ausserhalb dieser Seite davon
     abhaengt, auffrischen. */
  async function nachGutschrift(e) {
    (e.avatare || (e.avatar_id ? [{ avatar_id: e.avatar_id, avatar_tage: e.avatar_tage }] : [])).forEach(function (a) {
      if (!a.avatar_tage && typeof unlockAvatar === "function") unlockAvatar(a.avatar_id);
      if (a.avatar_tage) {
        try {
          localStorage.setItem("tempAvatarId", a.avatar_id);
          localStorage.setItem("tempAvatarExpiresAt", String(Date.now() + Number(a.avatar_tage) * 86400000));
        } catch (err) { /* privater Modus - der Server hat es trotzdem */ }
        if (typeof renderAvatarPicker === "function") renderAvatarPicker();
      }
    });
    if (e.dublonen && typeof showCurrencyToast === "function") showCurrencyToast(e.dublonen);
    if (e.titel && (Array.isArray(e.titel) ? e.titel.length : true) && window.fhEventTitel) window.fhEventTitel.laden();
    if (e.skillpunkte && typeof window.fhSkillNeuLaden === "function") window.fhSkillNeuLaden();
    if (e.xp && typeof handleXpGainSideEffects === "function" && hatDb()) {
      try {
        const uid = await wheelAuthReady;
        const a = await withSupabaseRlsColdStartRetry(function () {
          return supabaseClient.from("player_progression").select("xp").eq("firebase_uid", uid).maybeSingle();
        });
        const neu = (a.data && a.data.xp) || 0;
        handleXpGainSideEffects(Math.max(0, neu - e.xp), neu);
      } catch (err) { /* Spielerkarte frischt sich beim naechsten Mal auf */ }
    } else if (typeof refreshPlayerCard === "function") {
      refreshPlayerCard();
    }
  }

  async function rufe(name, args) {
    const a = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args); });
    if (a.error) throw a.error;
    return a.data || {};
  }

  async function holen(n, spur) {
    if (zustand.beschaeftigt || !hatDb()) return;
    zustand.beschaeftigt = true;
    zustand.wahl = n;
    zeichnen();
    try {
      const e = await rufe("pass_belohnung_holen", { p_pass_id: PASS_ID, p_stufe: n, p_spur: spur });
      zustand.meldung = e.ok ? meldungAus(e) : grundText(e.grund);
      if (e.ok) await nachGutschrift(e);
    } catch (err) {
      console.warn("Pass-2-Belohnung fehlgeschlagen:", err);
      zustand.meldung = grundText("fehler");
    }
    zustand.beschaeftigt = false;
    await laden();
  }

  async function alleHolen() {
    if (zustand.beschaeftigt || !hatDb()) return;
    zustand.beschaeftigt = true;
    zeichnen();
    try {
      const e = await rufe("pass_alle_holen", { p_pass_id: PASS_ID });
      const was = meldungAus(e);
      zustand.meldung = (was || tx("pass2.nichts", "Nichts mehr zu plündern.")) + (e.grund ? " " + grundText(e.grund) : "");
      if (e.anzahl) await nachGutschrift(e);
    } catch (err) {
      console.warn("Pass 2: Alles einsammeln fehlgeschlagen:", err);
      zustand.meldung = grundText("fehler");
    }
    zustand.beschaeftigt = false;
    await laden();
  }

  async function kaufen() {
    if (zustand.beschaeftigt || !hatDb()) return;
    if (!zustand.kaufBereit) {
      zustand.kaufBereit = true;
      clearTimeout(kaufTimer);
      kaufTimer = setTimeout(function () { zustand.kaufBereit = false; zeichnen(); }, 4000);
      zeichnen();
      return;
    }
    clearTimeout(kaufTimer);
    zustand.kaufBereit = false;
    zustand.beschaeftigt = true;
    zeichnen();
    try {
      const e = await rufe("pass_kapitaen_kaufen", { p_pass_id: PASS_ID });
      zustand.meldung = e.ok ? tx("pass2.gekauft", "Willkommen an Bord, Kapitän! Die goldene Spur ist offen.") : grundText(e.grund);
      if (e.ok && typeof refreshPlayerCard === "function") refreshPlayerCard();
    } catch (err) {
      console.warn("Kapitaenspass-Kauf fehlgeschlagen:", err);
      zustand.meldung = grundText("fehler");
    }
    zustand.beschaeftigt = false;
    await laden();
  }

  function klick(ev) {
    if (!zustand.pass) return;
    const ziel = ev.target.closest("[data-p2-zelle],[data-p2-wahl],[data-p2-aktion]");
    if (!ziel || !ev.currentTarget.contains(ziel)) return;
    if (ziel.dataset.p2Wahl) {
      zustand.wahl = Number(ziel.dataset.p2Wahl);
      zeichnen();
      return;
    }
    if (ziel.dataset.p2Zelle) {
      const teil = ziel.dataset.p2Zelle.split(":");
      const n = Number(teil[0]), spur = teil[1];
      const z = zelle(n, spur);
      if (z.holbar) holen(n, spur);
      else { zustand.wahl = n; zeichnen(); }
      return;
    }
    const aktion = ziel.dataset.p2Aktion;
    if (aktion === "alle") alleHolen();
    else if (aktion === "kaufen") kaufen();
    else if (aktion === "aktuell") springe(Math.max(1, stufe()));
    else if (aktion === "schatz") springe(50);
    else if (aktion === "neu") { zustand.fehler = false; laden(); }
  }

  window.fhPass2 = {
    /* Aufruf aus renderPassPage(). Laedt bei jedem Aufruf neu - der
       Seitenwechsel auf "???" ist genau der Moment, in dem neue EP
       aus anderen Bereichen sichtbar werden sollen. */
    zeigen: function (container, opt) {
      const wechsel = !zustand.pass || !container.querySelector(".p2-wrap");
      zustand.pass = opt.pass;
      zustand.aktiv = !!opt.aktiv;
      zustand.vorschau = !!opt.vorschau;
      if (wechsel) { zustand.ersterAufbau = true; zustand.meldung = ""; }
      zustand.laedt = true;
      zustand.fehler = false;
      zeichnen();
      laden();
    },
    /* Admin-Vorschau vor der Freigabe (Knopf im Admin-Panel). */
    vorschau: function (an) {
      vorschauAn = !!an;
      if (vorschauAn && typeof changePage === "function") changePage("streamraetsel");
      else if (typeof renderPassPage === "function") renderPassPage();
    },
    vorschauAktiv: function () { return vorschauAn; },
  };
})();
