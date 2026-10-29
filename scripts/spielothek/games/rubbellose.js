/* ============================================================
   SPIELOTHEK - RUBBELLOSE
   ------------------------------------------------------------
   Vier Lose zum Selbst-Aufrubbeln: 3 x 3 Felder mit Betraegen,
   wer DREIMAL denselben Betrag findet, gewinnt genau diesen.

     Flaschenpost        25 Dublonen   bis    2.500
     Schatzkiste        100 Dublonen   bis   10.000
     Krakenschlund      250 Dublonen   bis   15.000
     Goldene Galeone  1.000 Dublonen   bis   20.000

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
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* Zeichen aus lucide (ISC): scroll, waves, sailboat; die Truhe vom Banditen. */
  const ZEICHEN = {
    flaschenpost: '<path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    schatzkiste: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
    kraken: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    galeone: '<path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"/><path d="M21 14 10 2 3 14h18Z"/><path d="M10 2v16"/>',
    muenze: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3"/>',
  };
  function svg(name, klasse) {
    return '<svg class="' + klasse + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ZEICHEN[name] + "</svg>";
  }

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
  function losName(los) { return t(NAMEN[los.id][0], NAMEN[los.id][1]); }
  function zahl(n) { return Number(n).toLocaleString(sprache() === "en" ? "en-US" : "de-DE"); }

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
    const felder = [];
    if (gewinn) felder.push(gewinn, gewinn, gewinn);
    /* Uebrige Felder: jeder andere Betrag hoechstens zweimal. */
    const vorrat = [];
    betraege.forEach(function (b) { if (b !== gewinn) vorrat.push(b, b); });
    mischen(vorrat);
    /* Bei einer Niete in gut der Haelfte der Lose den Hauptgewinn als Paar. */
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
     ZUSTAND
  ------------------------------------------------------ */
  const VORSCHAU_SCHLUESSEL = "fhRubbelVorschauAus";
  let wurzel = null;
  let gewaehlt = "schatzkiste";
  let runde = null;        // { los, ziehung, offen: [bool x 9], fertig, gutschrift, guthabenNachher }
  let beschaeftigt = false;
  let sperreBis = 0;
  let sperreUhr = null;

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
    runde = null;
    if (typeof renderSpielothekPage === "function") renderSpielothekPage();
  }

  /* ------------------------------------------------------
     AUFBAU
  ------------------------------------------------------ */
  function losKarteHtml(los) {
    const top = los.gewinne[los.gewinne.length - 1][0];
    return '<button type="button" class="rubbel-wahl ist-' + los.id + (los.id === gewaehlt ? " ist-gewaehlt" : "") + '"'
      + ' data-los="' + los.id + '" aria-pressed="' + (los.id === gewaehlt) + '">'
      + svg(los.id, "rubbel-wahl-zeichen")
      + '<span class="rubbel-wahl-name">' + losName(los) + "</span>"
      + '<span class="rubbel-wahl-preis">' + zahl(los.preis) + " " + t("shop.currencyLabel", "Dublonen") + "</span>"
      + '<span class="rubbel-wahl-top">' + t("rubbel.bis", "Gewinne bis") + " " + zahl(top) + "</span>"
      + "</button>";
  }

  function zeigen(container) {
    wurzel = container;
    const vorschau = window.fhFeatureNurVorschau && window.fhFeatureNurVorschau("rubbellose");
    container.innerHTML = ''
      + (vorschau ? '<p class="rubbel-vorschau">' + t("rubbel.vorschau", "Vorschau – die Rubbellose sind noch nicht freigegeben und nur für dich sichtbar.")
        + ' <button type="button" class="rubbel-link" data-aktion="bandit">' + t("rubbel.zumBandit", "Zum Einarmigen Banditen") + "</button></p>" : "")
      + '<div class="spielothek-game-heading"><span class="spielothek-game-name">' + t("rubbel.titel", "Rubbellose") + "</span></div>"
      + '<div class="spielothek-anzeigen">'
      + '  <div class="spielothek-anzeige"><span class="spielothek-anzeige-titel">' + t("spielothek.anzeigeGuthaben", "Guthaben") + '</span><span class="spielothek-anzeige-wert ist-ladend" id="rubbel-guthaben">–––</span></div>'
      + '  <div class="spielothek-anzeige"><span class="spielothek-anzeige-titel">' + t("spielothek.anzeigeEinsatz", "Einsatz") + '</span><span class="spielothek-anzeige-wert" id="rubbel-einsatz">–</span></div>'
      + '  <div class="spielothek-anzeige"><span class="spielothek-anzeige-titel">' + t("spielothek.anzeigeLetzte", "Letzte Runde") + '</span><span class="spielothek-anzeige-wert" id="rubbel-letzte">—</span></div>'
      + "</div>"
      + '<div class="rubbel-wahlen" role="group" aria-label="' + t("rubbel.wahlAria", "Los wählen") + '">' + RUBBELLOSE.map(losKarteHtml).join("") + "</div>"
      + '<div class="spielothek-stage rubbel-buehne" id="rubbel-buehne">'
      + '  <p class="spielothek-schild">Ändiis Spielothek</p>'
      + '  <div class="spielothek-andi" id="rubbel-andi">'
      + (typeof buildSpielothekAndiHtml === "function" ? buildSpielothekAndiHtml() : "")
      + '    <p class="spielothek-andi-quote" id="rubbel-spruch">' + (typeof getRandomAndiIdleQuote === "function" ? getRandomAndiIdleQuote() : "") + "</p>"
      + "  </div>"
      + '  <div class="rubbel-tisch" id="rubbel-tisch"></div>'
      + '  <div class="spielothek-bedienung"><button type="button" class="code-button spielothek-ausloeser" id="rubbel-kaufen" disabled></button></div>'
      + '  <p class="wheel-status" id="rubbel-status" role="status" aria-live="polite"></p>'
      + "</div>"
      + '<details class="spielothek-rules"><summary>' + t("spielothek.rulesHeading", "Spielregeln") + "</summary>" + regelnHtml() + "</details>";

    container.querySelectorAll(".rubbel-wahl").forEach(function (b) {
      b.addEventListener("click", function () { waehlen(b.getAttribute("data-los")); });
    });
    const zumBandit = container.querySelector('[data-aktion="bandit"]');
    if (zumBandit) zumBandit.addEventListener("click", function () { vorschauUmschalten(true); });
    document.getElementById("rubbel-kaufen").addEventListener("click", kaufen);
    tischZeichnen();
    knopfAktualisieren();
    guthabenLaden();
    sperreLaden();
  }

  function regelnHtml() {
    const zeilen = RUBBELLOSE.map(function (los) {
      return "<li><strong>" + losName(los) + "</strong> (" + zahl(los.preis) + "): "
        + los.gewinne.map(function (g) { return zahl(g[0]); }).join(" · ") + "</li>";
    }).join("");
    return "<p>" + t("rubbel.regel1", "Kauf ein Los und rubbel die neun Felder frei – mit Maus oder Finger, oder Feld für Feld per Tastatur.") + "</p>"
      + "<p>" + t("rubbel.regel2", "Steht derselbe Betrag dreimal auf dem Los, gewinnst du genau diesen Betrag. Sonst ist es eine Niete. Ein Los hat höchstens einen Gewinn.") + "</p>"
      + "<ul>" + zeilen + "</ul>"
      + "<p>" + t("rubbel.regel3", "Abgerechnet wird beim Kauf, das Rubbeln deckt nur auf. Im Schnitt zahlen alle Lose rund 95 % zurück. Rein spielerisch, nur mit Dublonen.") + "</p>";
  }

  function waehlen(id) {
    if (runde && !runde.fertig) return;        // erst das laufende Los aufrubbeln
    gewaehlt = id;
    wurzel.querySelectorAll(".rubbel-wahl").forEach(function (b) {
      const an = b.getAttribute("data-los") === id;
      b.classList.toggle("ist-gewaehlt", an);
      b.setAttribute("aria-pressed", String(an));
    });
    if (!runde) tischZeichnen();
    knopfAktualisieren();
  }

  function losVon(id) { return RUBBELLOSE.find(function (l) { return l.id === id; }) || RUBBELLOSE[0]; }

  function knopfAktualisieren() {
    const k = document.getElementById("rubbel-kaufen");
    if (!k) return;
    const los = losVon(gewaehlt);
    const rest = sperreBis - Date.now();
    const offen = runde && !runde.fertig;
    k.disabled = beschaeftigt || offen || rest > 0;
    k.textContent = offen ? t("rubbel.erstRubbeln", "Erst aufrubbeln")
      : rest > 0 ? t("spielothek.cooldownWaitButton", "WARTEN ...") + " (" + Math.ceil(rest / 1000) + ")"
      : t("rubbel.kaufen", "Los kaufen") + " · " + zahl(los.preis);
    const einsatz = document.getElementById("rubbel-einsatz");
    if (einsatz) einsatz.textContent = zahl(runde ? runde.los.preis : los.preis);
  }

  function sperreSetzen(bis) {
    sperreBis = bis;
    clearInterval(sperreUhr);
    sperreUhr = setInterval(function () {
      if (!document.getElementById("rubbel-kaufen")) { clearInterval(sperreUhr); return; }
      knopfAktualisieren();
      if (Date.now() >= sperreBis) clearInterval(sperreUhr);
    }, 250);
    knopfAktualisieren();
  }

  async function uid() {
    if (typeof supabaseClient === "undefined" || !supabaseClient || typeof wheelAuthReady === "undefined") return null;
    return await wheelAuthReady;
  }

  async function guthabenLaden() {
    const el = document.getElementById("rubbel-guthaben");
    try {
      const id = await uid();
      if (!id || !el) return;
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").select("currency").eq("firebase_uid", id).maybeSingle();
      });
      /* Laeuft gerade ein ungeoeffnetes Los, bleibt die Anzeige beim Stand nach dem Einsatz. */
      if (runde && !runde.fertig) return;
      guthabenZeigen(data ? data.currency || 0 : 0);
    } catch (e) {
      console.warn("Rubbellose: Guthaben nicht geladen", e);
    }
  }

  function guthabenZeigen(n) {
    const el = document.getElementById("rubbel-guthaben");
    if (!el) return;
    el.textContent = zahl(n);
    el.classList.remove("ist-ladend");
  }

  async function sperreLaden() {
    try {
      const id = await uid();
      if (!id) { knopfAktualisieren(); return; }
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").select("last_spielothek_play_at").eq("firebase_uid", id).maybeSingle();
      });
      const zuletzt = data && data.last_spielothek_play_at ? new Date(data.last_spielothek_play_at).getTime() : 0;
      const ms = typeof SPIELOTHEK_COOLDOWN_MS === "number" ? SPIELOTHEK_COOLDOWN_MS : 4000;
      sperreSetzen(zuletzt ? zuletzt + ms : 0);
    } catch (e) {
      console.warn("Rubbellose: Sperre nicht geladen", e);
      knopfAktualisieren();
    }
  }

  function status(text) {
    const el = document.getElementById("rubbel-status");
    if (el) el.textContent = text || "";
  }

  /* ------------------------------------------------------
     KAUF (EIN serverseitig gepruefter Schreibvorgang)
  ------------------------------------------------------ */
  async function kaufen() {
    if (beschaeftigt || (runde && !runde.fertig) || Date.now() < sperreBis) return;
    const nickname = localStorage.getItem("wheelNickname") || "";
    const los = losVon(gewaehlt);
    if (!nickname || typeof supabaseClient === "undefined" || !supabaseClient) {
      status(t("spielothek.needLogin", "Melde dich zuerst an, um zu spielen!"));
      return;
    }
    beschaeftigt = true;
    knopfAktualisieren();
    status("");
    if (typeof spielothekKlick === "function") spielothekKlick();
    try {
      const id = await uid();
      if (!id) throw new Error("kein-konto");
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

      const ziehung = ziehen(los);
      /* Skill-Bonus wie beim Banditen nur auf den Gewinn, geklemmt auf den Deckel. */
      const bonus = typeof fhSkillBonus === "function" ? fhSkillBonus("slotdublonen") : 0;
      const deckel = typeof SPIELOTHEK_GEWINN_DECKEL === "number" ? SPIELOTHEK_GEWINN_DECKEL : 30000;
      const auszahlung = ziehung.gewinn > 0 ? Math.min(Math.round(ziehung.gewinn * (1 + bonus)), deckel) : 0;
      const neu = Math.max(0, guthaben - los.preis + auszahlung);

      const { data: gebucht, error: schreibfehler } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").update({
          currency: neu,
          games_played: (d.games_played || 0) + 1,
          games_won: ziehung.gewinn ? (d.games_won || 0) + 1 : d.games_won || 0,
          total_currency_earned: auszahlung > 0 ? (d.total_currency_earned || 0) + auszahlung : d.total_currency_earned || 0,
          last_spielothek_play_at: new Date().toISOString(),
        }).eq("firebase_uid", id).select().maybeSingle();
      });
      if (schreibfehler) throw schreibfehler;
      if (!gebucht) throw new Error("cooldown");

      if (typeof logSpielothekRoundToSupabase === "function") {
        logSpielothekRoundToSupabase("rubbel-" + los.id, los.preis, auszahlung, ziehung.gewinn > 0);
      }
      runde = { los: los, ziehung: ziehung, offen: [false, false, false, false, false, false, false, false, false], fertig: false,
        auszahlung: auszahlung, delta: neu - guthaben, guthabenNachher: neu };
      /* Bis zum Aufdecken: Stand nach dem Einsatz, damit nichts verraten wird. */
      guthabenZeigen(guthaben - Math.min(los.preis, guthaben));
      sperreSetzen(Date.now() + ms);
      tischZeichnen();
      status(t("rubbel.losGekauft", "Rubbel die Felder frei!"));
    } catch (err) {
      const m = String((err && err.message) || err);
      if (m === "not-enough-currency") status(t("spielothek.notEnoughCurrency", "Nicht genug Dublonen dafür."));
      else if (m === "cooldown") await sperreLaden();
      else if (/dublonen-tageslimit/.test(m)) status(t("pass2.grund.tageslimit", "Für heute ist dein Dublonen-Tagesdeckel voll. Der Rest wartet bis morgen."));
      else {
        console.warn("Rubbellos konnte nicht gekauft werden:", err);
        status(t("spielothek.saveFailed", "Die Spielrunde konnte gerade nicht gespeichert werden. Deine Daten wurden nicht verändert. Bitte versuch's nochmal."));
      }
    } finally {
      beschaeftigt = false;
      knopfAktualisieren();
    }
  }

  /* ------------------------------------------------------
     DER TISCH: das Los mit Rubbelschicht
  ------------------------------------------------------ */
  function tischZeichnen() {
    const tisch = document.getElementById("rubbel-tisch");
    if (!tisch) return;
    const los = runde ? runde.los : losVon(gewaehlt);
    const felder = runde ? runde.ziehung.felder : null;
    let html = '<div class="rubbel-los ist-' + los.id + (runde ? "" : " ist-muster") + '" id="rubbel-los">'
      + '<div class="rubbel-kopf">' + svg(los.id, "rubbel-kopf-zeichen")
      + '<span class="rubbel-kopf-name">' + losName(los) + "</span>"
      + '<span class="rubbel-kopf-regel">' + t("rubbel.dreiGleiche", "3 gleiche Beträge gewinnen") + "</span></div>"
      + '<div class="rubbel-feld-wrap"><div class="rubbel-felder" id="rubbel-felder">';
    for (let i = 0; i < 9; i++) {
      const offen = runde && runde.offen[i];
      html += '<button type="button" class="rubbel-feld' + (offen ? " ist-offen" : "") + '" data-i="' + i + '"'
        + (runde ? "" : " disabled tabindex=\"-1\"")
        + ' aria-label="' + (offen ? zahl(felder[i]) : t("rubbel.feldZu", "Feld") + " " + (i + 1) + " – " + t("rubbel.feldAufdecken", "aufdecken")) + '">'
        + '<span class="rubbel-betrag">' + (felder ? svg("muenze", "rubbel-muenze") + zahl(felder[i]) : "?") + "</span></button>";
    }
    html += "</div>" + (runde && !runde.fertig ? '<canvas class="rubbel-schicht" id="rubbel-schicht" aria-hidden="true"></canvas>' : "") + "</div>";
    html += '<div class="rubbel-fuss">' + (runde && !runde.fertig
      ? '<button type="button" class="rubbel-link" id="rubbel-alles">' + t("rubbel.allesAufdecken", "Alles aufdecken") + "</button>"
      : '<span>' + (runde ? "" : t("rubbel.hinweis", "Wähle ein Los und kauf es – dann rubbeln.")) + "</span>") + "</div>";
    html += "</div>";
    tisch.innerHTML = html;
    if (runde && !runde.fertig) schichtAnlegen();
    if (runde && runde.fertig) ergebnisMarkieren(false);
  }

  /* Die Rubbelschicht: ein Canvas ueber den Feldern. Wischen loescht
     sie (destination-out); ist ein Feld zu gut der Haelfte frei, gilt
     es als aufgedeckt und der Rest seiner Schicht verschwindet. */
  function schichtAnlegen() {
    const canvas = document.getElementById("rubbel-schicht");
    const felderEl = document.getElementById("rubbel-felder");
    if (!canvas || !felderEl) return;
    const box = felderEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const st = getComputedStyle(document.documentElement);
    const farbe = function (n, e) { return (st.getPropertyValue(n) || "").trim() || e; };
    /* Je Feld eine eigene silberne Kachel - so sieht man, wo die Felder liegen. */
    const zellen = zellenRechnen(felderEl);
    zellen.forEach(function (z) {
      const g = ctx.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
      g.addColorStop(0, farbe("--fh-rubbel-silber-hell", "#d9dee5"));
      g.addColorStop(0.5, farbe("--fh-rubbel-silber", "#9aa4b1"));
      g.addColorStop(1, farbe("--fh-rubbel-silber-hell", "#d9dee5"));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(z.x, z.y, z.w, z.h, 10) : ctx.rect(z.x, z.y, z.w, z.h);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(z.x, z.y, z.w, z.h);
      ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,.28)";
      ctx.lineWidth = 1;
      for (let s = -z.h; s < z.w; s += 7) {
        ctx.beginPath();
        ctx.moveTo(z.x + s, z.y + z.h);
        ctx.lineTo(z.x + s + z.h, z.y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = farbe("--fh-rubbel-silber-tief", "#5c6673");
      ctx.font = "600 " + Math.round(z.h * 0.16) + "px Oswald, 'Arial Narrow', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("rubbel.rubbeln", "RUBBELN"), z.x + z.w / 2, z.y + z.h / 2);
    });
    runde.zellen = zellen;
    runde.canvas = canvas;
    runde.ctx = ctx;
    runde.dpr = dpr;

    let zieht = false, letzter = null, pruefUhr = 0;
    function punkt(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (box.width / r.width), y: (e.clientY - r.top) * (box.height / r.height) };
    }
    function wischen(p) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(22, box.width * 0.075);
      ctx.beginPath();
      ctx.moveTo((letzter || p).x, (letzter || p).y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      letzter = p;
      if (!pruefUhr) pruefUhr = setTimeout(function () { pruefUhr = 0; freiPruefen(); }, 120);
    }
    canvas.addEventListener("pointerdown", function (e) {
      zieht = true; letzter = null;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* aeltere Browser */ }
      wischen(punkt(e));
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) { if (zieht) { wischen(punkt(e)); e.preventDefault(); } });
    const los = function () { zieht = false; letzter = null; freiPruefen(); };
    canvas.addEventListener("pointerup", los);
    canvas.addEventListener("pointercancel", los);
    canvas.addEventListener("pointerleave", function () { if (zieht) letzter = null; });

    /* Tastatur und Screenreader: jedes Feld ist ein Knopf und deckt sich selbst auf. */
    felderEl.querySelectorAll(".rubbel-feld").forEach(function (b) {
      b.addEventListener("click", function () { feldAufdecken(Number(b.getAttribute("data-i"))); });
    });
    const alles = document.getElementById("rubbel-alles");
    if (alles) alles.addEventListener("click", function () { for (let i = 0; i < 9; i++) feldAufdecken(i, true); fertigPruefen(); });
  }

  function zellenRechnen(felderEl) {
    const basis = felderEl.getBoundingClientRect();
    return Array.prototype.map.call(felderEl.querySelectorAll(".rubbel-feld"), function (b) {
      const r = b.getBoundingClientRect();
      return { x: r.left - basis.left, y: r.top - basis.top, w: r.width, h: r.height };
    });
  }

  /* Wie viel der Schicht ueber einem Feld ist schon weg? */
  function freiPruefen() {
    if (!runde || runde.fertig || !runde.ctx) return;
    const ctx = runde.ctx, dpr = runde.dpr;
    runde.zellen.forEach(function (z, i) {
      if (runde.offen[i]) return;
      const x = Math.round(z.x * dpr), y = Math.round(z.y * dpr), w = Math.max(1, Math.round(z.w * dpr)), h = Math.max(1, Math.round(z.h * dpr));
      const daten = ctx.getImageData(x, y, w, h).data;
      let frei = 0, n = 0;
      for (let k = 3; k < daten.length; k += 16) { n++; if (daten[k] < 40) frei++; }
      if (n && frei / n > 0.5) feldAufdecken(i, true);
    });
    fertigPruefen();
  }

  function feldAufdecken(i, still) {
    if (!runde || runde.fertig || runde.offen[i]) return;
    runde.offen[i] = true;
    const z = runde.zellen && runde.zellen[i];
    if (z && runde.ctx) runde.ctx.clearRect(z.x - 1, z.y - 1, z.w + 2, z.h + 2);
    const b = document.querySelector('.rubbel-feld[data-i="' + i + '"]');
    if (b) {
      b.classList.add("ist-offen");
      b.setAttribute("aria-label", zahl(runde.ziehung.felder[i]));
    }
    if (typeof spielothekWalzeRastet === "function") spielothekWalzeRastet(i % 6);
    if (!still) fertigPruefen();
  }

  function fertigPruefen() {
    if (!runde || runde.fertig || runde.offen.indexOf(false) >= 0) return;
    runde.fertig = true;
    if (runde.canvas) runde.canvas.remove();
    const fuss = document.querySelector("#rubbel-los .rubbel-fuss");
    if (fuss) fuss.innerHTML = "";
    ergebnisMarkieren(true);
    knopfAktualisieren();
  }

  /* Die drei Treffer leuchten, Guthaben und Ändii ziehen nach. */
  function ergebnisMarkieren(frisch) {
    const r = runde;
    if (!r) return;
    r.ziehung.treffer.forEach(function (i) {
      const b = document.querySelector('.rubbel-feld[data-i="' + i + '"]');
      if (b) b.classList.add("ist-treffer");
    });
    const losEl = document.getElementById("rubbel-los");
    if (losEl) losEl.classList.toggle("ist-niete", !r.ziehung.gewinn);
    if (!frisch) return;
    guthabenZeigen(r.guthabenNachher);
    const letzte = document.getElementById("rubbel-letzte");
    if (letzte) {
      letzte.textContent = (r.delta > 0 ? "+" : "") + zahl(r.delta);
      letzte.classList.toggle("ist-gewinn", r.delta > 0);
      letzte.classList.toggle("ist-verlust", r.delta < 0);
    }
    const spruch = document.getElementById("rubbel-spruch");
    const stufe = r.ziehung.gewinn >= r.los.gewinne[r.los.gewinne.length - 1][0] ? "jackpot"
      : r.ziehung.gewinn >= r.los.preis * 10 ? "big" : "normal";
    if (spruch && typeof getRandomAndiResultQuote === "function") spruch.textContent = getRandomAndiResultQuote(r.ziehung.gewinn > 0, stufe);
    status(r.ziehung.gewinn
      ? t("rubbel.gewonnen", "Dreimal {betrag} – gewonnen!").replace("{betrag}", zahl(r.auszahlung))
      : t("rubbel.niete", "Leider kein Dreier – Niete."));
    const buehne = document.getElementById("rubbel-buehne");
    if (buehne && !RUHIG.matches) {
      buehne.classList.remove("spielothek-stage-win", "spielothek-stage-lose");
      void buehne.offsetWidth;
      buehne.classList.add(r.ziehung.gewinn ? "spielothek-stage-win" : "spielothek-stage-lose");
    }
  }

  /* Beim Seitenwechsel vergessen wir ein fertiges Los; ein offenes
     bleibt liegen, bis es aufgerubbelt ist (gebucht ist es schon). */
  function neuAufbauen(container) {
    if (runde && runde.fertig) runde = null;
    zeigen(container);
  }

  window.fhRubbellose = {
    aktiv: aktiv,
    zeigen: neuAufbauen,
    vorschauUmschalten: vorschauUmschalten,
    /* Fuer Tests und das Nachrechnen der Quote. */
    LOSE: RUBBELLOSE,
    ziehen: function (id) { return ziehen(losVon(id)); },
  };
})();
