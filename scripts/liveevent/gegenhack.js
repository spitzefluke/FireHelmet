/* ======================================================
   COMMUNITY-QUEST "GEGENHACK" (Migration 31)
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Live-Event Zuschauer",
   Etappe 2:

   - Eigene Seite (#gegenhack) im Menue, nur solange eine Quest
     laeuft (live_event.quest_id), dazu ein Hinweis auf der
     Startseite.
   - Das Panel ist das "Bordnetz der Crew": solange die Quest
     schwach steht, ist es von ??? gekapert (gruen, flackernd,
     zerbrochene Buchstaben); mit jedem Prozent wird es sauberer.
   - Drei Aufgaben, je Spieler einmal: Datenfragmente sichern,
     Gegensignal abstimmen, Zugangscode knacken.
   - Crew-Feed aus der Datenbank, Prognose bis zum Termin,
     "Erinnern" legt einen Kalendereintrag (.ics) an.
   - Das Finale (Sieg/Niederlage) spielt live-storys.js ab; der
     Sieg-Bildschirm kommt von hier (siegZeigen).

   live-event.js reicht jede Zustandszeile an zustand() weiter.
   Alles aus der Datenbank (Titel, Namen) geht per textContent ins DOM.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function T(key, de) { return esc(t("gegenhack." + key, de)); }
  function en() { return typeof getCurrentLang === "function" && getCurrentLang() === "en"; }
  function zahl(n) { return Number(n || 0).toLocaleString(en() ? "en-US" : "de-DE"); }
  function prozent(v) { return (Math.floor(v * 10) / 10).toLocaleString(en() ? "en-US" : "de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %"; }
  function el(tag, klasse, text) { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; }
  function aus(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  /* Symbole: lucide (ISC), stroke-width 1.6 */
  function svg(pfade, klasse) {
    return '<svg class="' + (klasse || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + '</svg>';
  }
  const IC = {
    funk: '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
    raster: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    welle: '<path d="M2 12c.6 0 1.2-.5 1.6-1.6C4.4 8.3 5.2 5 6.5 5s2.1 3.3 2.9 5.4c.8 2.1 1.6 5.6 2.9 5.6s2.1-3.5 2.9-5.6C16 8.3 16.8 5 18.1 5c1.3 0 2.1 3.3 2.9 5.4.4 1.1 1 1.6 1.6 1.6"/>',
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
    hakenKreis: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    warnung: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    schild: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    glocke: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    kalender: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/>',
    fahne: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    uhr: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    medaille: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
    muenzen: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    funkeln: '<path d="M9.94 14.06 4 20"/><path d="m14 4 1.5 3.5L19 9l-3.5 1.5L14 14l-1.5-3.5L9 9l3.5-1.5z"/><path d="M5 3v4"/><path d="M3 5h4"/>',
  };

  /* Die drei Aufgaben. Reihenfolge = Reihenfolge im Panel. */
  const AUFGABEN = [
    { id: "frag", icon: IC.raster, titel: ["missionFrag", "Datenfragmente sichern"], text: ["missionFragText", "Fragmente fliegen über die Seite. Schnapp dir 8, bevor sie zerfallen."], tat: ["feedFrag", "hat 8 Datenfragmente gesichert"] },
    { id: "freq", icon: IC.welle, titel: ["missionFreq", "Gegensignal abstimmen"], text: ["missionFreqText", "Stimm Frequenz und Stärke auf das Signal von ??? ab."], tat: ["feedFreq", "hat das Gegensignal gefunden"] },
    { id: "code", icon: IC.schloss, titel: ["missionCode", "Zugangscode knacken"], text: ["missionCodeText", "Merk dir die Reihenfolge der Blöcke und gib sie zurück."], tat: ["feedCode", "hat einen Zugangscode geknackt"] },
  ];
  const CODES = ["3F", "A7", "0C", "E1", "5B", "92", "D4", "68", "BF"];

  /* ------------------------------------------------------
     ZUSTAND
  ------------------------------------------------------ */
  let questId = null;        // laufende Quest (aus live_event)
  let seitenQuest = null;    // Quest, die die Seite gerade zeigt (auch nach dem Ende)
  let stand = null;          // Ergebnis von gegenhack_stand()
  let feed = [];
  let seiteOffen = false;
  let uhr = null, kaputtUhr = null;
  let puls = 0;              // zaehlt hoch, wenn der eigene Beitrag die Zahl springen laesst

  function istAktiv() { return !!questId; }

  /* Stand der Quest in Prozent des Ziels (0-100). */
  function prozentStand() {
    if (!stand || !stand.ok || !stand.ziel) return 0;
    return Math.min(100, stand.geloest / stand.ziel * 100);
  }

  /* Hack-Grad: 1 = voll gekapert, 0 = sauber. Wie im Entwurf:
     ab 20 % wird es besser, ab 92 % ist nichts mehr zu sehen. */
  function hackGrad() {
    if (stand && stand.beendet && stand.ergebnis === "sieg") return 0;
    return Math.max(0, Math.min(1, 1 - (prozentStand() - 20) / 72));
  }

  /* ------------------------------------------------------
     DATEN
  ------------------------------------------------------ */
  async function standLaden() {
    const id = questId || seitenQuest;
    if (!id || !dbDa()) return;
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("gegenhack_stand", { p_quest: id });
      });
      if (error) throw error;
      if (data && data.ok && (questId || seitenQuest) === id) {
        stand = data;
        stand.meine = Array.isArray(stand.meine) ? stand.meine : [];
      }
    } catch (e) { /* naechster Takt */ }
    zeichnen();
  }

  async function feedLaden() {
    const id = questId || seitenQuest;
    if (!id || !dbDa()) return;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("gegenhack_feed", { p_quest: id });
      });
      if (error) throw error;
      feed = Array.isArray(data) ? data : [];
    } catch (e) { /* ohne Feed eben ohne */ }
    feedZeichnen();
  }

  /* ------------------------------------------------------
     MENUE UND HINWEIS AUF DER STARTSEITE
  ------------------------------------------------------ */
  function menueUmschalten() {
    document.querySelectorAll('[data-page="gegenhack"]').forEach(function (a) {
      a.classList.toggle("fh-flag-aus", !istAktiv());
    });
  }

  function hinweisWeg(id) { try { return localStorage.getItem("fhGegenhackHinweisZu") === id; } catch (e) { return false; } }

  function hinweisZeichnen() {
    let karte = document.getElementById("fh-gegenhack-hinweis");
    const aufHome = !!document.querySelector("#home.active-page");
    const zeigen = istAktiv() && aufHome && !hinweisWeg(questId) && !!stand;
    if (!zeigen) { if (karte) karte.remove(); return; }
    if (!karte) {
      karte = aus('<aside id="fh-gegenhack-hinweis" class="fh-gh-hinweis" aria-labelledby="fh-gh-hinweis-titel">' +
        '<button type="button" class="fh-gh-hinweis-zu" aria-label="' + T("close", "Schließen") + '">' + svg(IC.x, "") + '</button>' +
        '<p class="fh-gh-kicker">' + svg(IC.funk, "") + '<span>' + T("teaserKicker", "Community-Quest") + '</span></p>' +
        '<p id="fh-gh-hinweis-titel" class="fh-gh-hinweis-titel"></p>' +
        '<p class="fh-gh-hinweis-text">' + T("teaserText", "??? hält das Schiff. Jede gelöste Aufgabe schwächt die Übernahme.") + '</p>' +
        '<div class="fh-gh-balken"><span class="fh-gh-balken-fuellung"></span></div>' +
        '<div class="fh-gh-hinweis-fuss"><span class="fh-gh-hinweis-prozent"></span>' +
        '<button type="button" class="fh-gh-knopf ist-voll">' + T("teaserGo", "Mithelfen") + '</button></div>' +
      '</aside>');
      karte.querySelector(".fh-gh-hinweis-zu").addEventListener("click", function () {
        try { localStorage.setItem("fhGegenhackHinweisZu", questId); } catch (e) { /* egal */ }
        karte.remove();
      });
      karte.querySelector(".fh-gh-knopf").addEventListener("click", function () { if (typeof changePage === "function") changePage("gegenhack"); });
      document.body.appendChild(karte);
    }
    const p = prozentStand();
    karte.style.setProperty("--gh-hk", hackGrad().toFixed(2));
    karte.querySelector(".fh-gh-hinweis-titel").textContent = stand.titel || "";
    karte.querySelector(".fh-gh-balken-fuellung").style.width = p.toFixed(1) + "%";
    karte.querySelector(".fh-gh-hinweis-prozent").textContent = prozent(p);
  }

  /* ------------------------------------------------------
     DIE SEITE
  ------------------------------------------------------ */
  function ziel() { return document.getElementById("gegenhack-inhalt"); }

  /* Buchstaben durch Glyphen ersetzen - je staerker gehackt, desto
     mehr. Laeuft auf allen [data-gh-kaputt] alle 420 ms. */
  const GLYPHEN = "█▓▒░#$%&@01<>/\\";
  function kaputt(text, k, hk, takt) {
    if (!hk) return text;
    let o = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const r = Math.abs(Math.sin((i + k * 31) * 12.9898 + takt * 78.233) * 43758.5453) % 1;
      o += ch !== " " && r < hk * 0.32 ? GLYPHEN[Math.floor(r * 1000) % GLYPHEN.length] : ch;
    }
    return o;
  }
  function kaputtAnwenden() {
    const wurzel = ziel();
    if (!wurzel) return;
    const hk = RUHIG.matches ? 0 : hackGrad();
    const takt = Math.floor(Date.now() / 420);
    wurzel.querySelectorAll("[data-gh-text]").forEach(function (e, i) {
      const soll = kaputt(e.dataset.ghText, i + 3, hk, takt);
      if (e.textContent !== soll) e.textContent = soll;
    });
  }
  function kaputtText(e, text) { e.dataset.ghText = text; e.textContent = text; e.setAttribute("aria-label", text); }

  function geruestBauen() {
    const w = ziel();
    if (!w || w.querySelector(".fh-gh-panel")) return;
    w.replaceChildren(aus('<div class="fh-gh-panel">' +
      '<div class="fh-gh-scan" aria-hidden="true"></div>' +
      '<div class="fh-gh-glitch" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<p class="fh-gh-warnung" aria-hidden="true"><span class="fh-gh-punkt"></span><span class="fh-gh-warnung-text"></span></p>' +
      '<span class="fh-gh-kante" aria-hidden="true"></span>' +
      '<header class="fh-gh-kopf">' +
        '<p class="fh-gh-kicker">' + svg(IC.funk, "") + '<span class="fh-gh-kicker-text"></span></p>' +
        '<h1 class="fh-gh-titel"></h1>' +
        '<p class="fh-gh-intro"></p>' +
      '</header>' +
      '<section class="fh-gh-stand">' +
        '<div class="fh-gh-stand-zeile"><span class="fh-gh-prozent"></span>' +
          '<div class="fh-gh-zahlen"><p><span class="fh-gh-helfer"></span></p><p class="fh-gh-aktiv"><span class="fh-gh-punkt"></span><span class="fh-gh-aktiv-text"></span></p></div></div>' +
        '<div class="fh-gh-balken ist-gross"><span class="fh-gh-balken-fuellung"></span><span class="fh-gh-marke" style="left:33.3%"></span><span class="fh-gh-marke" style="left:66.6%"></span></div>' +
        '<div class="fh-gh-meilensteine"></div>' +
      '</section>' +
      '<div class="fh-gh-prognose"><span class="fh-gh-prognose-icon"></span><div><p class="fh-gh-prognose-titel"></p><p class="fh-gh-prognose-text"></p></div></div>' +
      '<section class="fh-gh-aufgaben"><div class="fh-gh-abschnitt"><h2 class="fh-gh-label" data-gh-text=""></h2><span class="fh-gh-beitrag"></span></div><div class="fh-gh-liste"></div></section>' +
      '<section class="fh-gh-crew"><h2 class="fh-gh-label" data-gh-text=""></h2><div class="fh-gh-feed" aria-live="polite"></div></section>' +
      '<footer class="fh-gh-fuss"><div><p class="fh-gh-termin"></p><p class="fh-gh-rest"></p></div><button type="button" class="fh-gh-knopf fh-gh-erinnern"></button></footer>' +
    '</div>'));
    const labels = w.querySelectorAll(".fh-gh-label");
    kaputtText(labels[0], t("gegenhack.tasks", "Deine Aufgaben"));
    kaputtText(labels[1], t("gegenhack.feed", "Live aus der Crew"));
    w.querySelector(".fh-gh-erinnern").addEventListener("click", erinnern);
  }

  function leerZeichnen() {
    const w = ziel();
    if (!w) return;
    w.replaceChildren(aus('<div class="fh-gh-leer"><p class="fh-gh-kicker">' + svg(IC.funk, "") + '<span>' + T("teaserKicker", "Community-Quest") + '</span></p>' +
      '<p class="fh-gh-leer-text">' + T("none", "Gerade läuft keine Quest. Die nächste kündigt Ändii im Stream an.") + '</p>' +
      '<button type="button" class="fh-gh-knopf" onclick="changePage(\'home\')">' + T("toHome", "Zur Startseite") + '</button></div>'));
  }

  function zeichnen() {
    menueUmschalten();
    hinweisZeichnen();
    if (!seiteOffen) return;
    if (!stand || !stand.ok) { if (!questId && !seitenQuest) leerZeichnen(); return; }
    geruestBauen();
    const w = ziel();
    const panel = w.querySelector(".fh-gh-panel");
    const p = prozentStand(), hk = hackGrad();
    const stufe = p >= 66.6 ? 2 : p >= 33.3 ? 1 : 0;
    const vorbei = !!stand.beendet;
    panel.style.setProperty("--gh-hk", hk.toFixed(3));
    panel.classList.toggle("ist-gekapert", hk > 0.15 && !RUHIG.matches);
    panel.classList.toggle("ist-konsole", hk > 0.55);
    panel.classList.toggle("ist-glitch", hk > 0.35 && !RUHIG.matches);
    panel.classList.toggle("ist-vorbei", vorbei);

    panel.querySelector(".fh-gh-warnung").hidden = !(hk > 0.15) || vorbei;
    panel.querySelector(".fh-gh-warnung-text").textContent = hk > 0.6 ? t("gegenhack.warnAccess", "Zugriff durch ???") : t("gegenhack.warnSignal", "Signal instabil");
    kaputtText(panel.querySelector(".fh-gh-kicker-text"),
      vorbei ? t("gegenhack.kickerDone", "Community-Quest · beendet")
      : hk > 0.6 ? t("gegenhack.kicker2", "Notfunk · Bordnetz gestört")
      : hk > 0.15 ? t("gegenhack.kicker1", "Bordnetz der Crew · teils wiederhergestellt")
      : t("gegenhack.kicker0", "Community-Quest · Bordnetz der Crew"));
    kaputtText(panel.querySelector(".fh-gh-titel"), stand.titel || "");
    kaputtText(panel.querySelector(".fh-gh-intro"),
      vorbei ? (stand.ergebnis === "sieg" ? t("gegenhack.introWon", "Geschafft: Die Crew hat sich das Schiff zurückgeholt.")
               : stand.ergebnis === "niederlage" ? t("gegenhack.introLost", "??? hat den Gegenhack abgewehrt. Vorerst.")
               : t("gegenhack.introStopped", "Diese Quest wurde abgebrochen."))
      : stufe === 2 ? t("gegenhack.intro2", "??? verliert die Kontrolle. Noch ein Stück, dann ist der Gegenhack bereit.")
      : stufe === 1 ? t("gegenhack.intro1", "Die Firewall hat einen Riss. Jede gelöste Aufgabe schwächt die Übernahme weiter.")
      : t("gegenhack.intro0", "??? hält das Schiff. Jede gelöste Aufgabe schwächt die Übernahme – beim nächsten Event schlagen wir zurück."));

    const pr = panel.querySelector(".fh-gh-prozent");
    if (pr.textContent !== prozent(p)) {
      pr.textContent = prozent(p);
      if (pr.dataset.puls !== String(puls)) { pr.dataset.puls = String(puls); pr.classList.remove("ist-puls"); void pr.offsetWidth; pr.classList.add("ist-puls"); }
    }
    panel.querySelector(".fh-gh-helfer").textContent = zahl(stand.helfer) + " " + t("gegenhack.helping", "helfen mit");
    panel.querySelector(".fh-gh-aktiv-text").textContent = zahl(stand.aktiv) + " " + t("gegenhack.activeHour", "in der letzten Stunde");
    panel.querySelector(".fh-gh-balken-fuellung").style.width = p.toFixed(2) + "%";

    const ms = [
      [33.3, t("gegenhack.ms1", "Firewall-Riss"), t("gegenhack.ms1Text", "Übernahme wird schwächer")],
      [66.6, t("gegenhack.ms2", "Gegensignal"), t("gegenhack.ms2Text", "Laufband gestört")],
      [100, t("gegenhack.ms3", "Gegenhack bereit"), t("gegenhack.ms3Text", "Die Crew schlägt beim Event zurück")],
    ];
    const msZiel = panel.querySelector(".fh-gh-meilensteine");
    if (msZiel.childElementCount !== 3) msZiel.replaceChildren.apply(msZiel, ms.map(function () { return aus('<div class="fh-gh-meilenstein"><span class="fh-gh-meilenstein-titel"></span><span class="fh-gh-meilenstein-text"></span></div>'); }));
    ms.forEach(function (m, i) {
      const k = msZiel.children[i], ok = p >= m[0];
      k.classList.toggle("ist-erreicht", ok);
      k.querySelector(".fh-gh-meilenstein-titel").innerHTML = svg(ok ? IC.hakenKreis : IC.schloss, "") + esc(m[1]);
      k.querySelector(".fh-gh-meilenstein-text").textContent = m[2];
    });

    prognoseZeichnen(panel, p, vorbei);
    aufgabenZeichnen(panel, vorbei);
    fussZeichnen(panel, vorbei);
    feedZeichnen();
    kaputtAnwenden();
  }

  function prognoseZeichnen(panel, p, vorbei) {
    const box = panel.querySelector(".fh-gh-prognose");
    const termin = stand.termin ? Date.parse(stand.termin) : null;
    const fertig = p >= 100;
    let reicht = fertig, titel, text;
    if (vorbei) { box.hidden = true; return; }
    if (fertig) {
      titel = t("gegenhack.progDone", "Geschafft: 100 % – der Gegenhack steht");
      text = t("gegenhack.progDoneText", "Beim nächsten Event holt sich die Crew das Schiff zurück.");
    } else if (termin && termin > Date.now()) {
      /* Tempo seit dem Start, hochgerechnet bis zum Termin. */
      const seit = Math.max(3600000, Date.now() - Date.parse(stand.gestartet_am));
      const prognose = (stand.geloest + stand.geloest / seit * (termin - Date.now())) / stand.ziel * 100;
      reicht = prognose >= 100;
      titel = t("gegenhack.progTitle", "Prognose bis zum Gegenhack:") + " " + Math.min(100, Math.floor(prognose)) + " %" + (reicht ? t("gegenhack.progEnough", " – reicht") : t("gegenhack.progNotEnough", " – reicht nicht"));
      text = reicht ? t("gegenhack.progEnoughText", "Wenn das Tempo hält, holt sich die Crew beim Event das Schiff zurück.")
        : t("gegenhack.progNotEnoughText", "Unter 100 % geht das Event anders aus. Was ??? dann tut, weiß niemand.");
    } else {
      titel = t("gegenhack.progOpen", "Noch") + " " + zahl(Math.max(0, stand.ziel - stand.geloest)) + " " + t("gegenhack.progOpenTasks", "Aufgaben bis zum Gegenhack");
      text = t("gegenhack.progNotEnoughText", "Unter 100 % geht das Event anders aus. Was ??? dann tut, weiß niemand.");
    }
    box.hidden = false;
    box.classList.toggle("ist-gut", reicht);
    box.querySelector(".fh-gh-prognose-icon").innerHTML = svg(fertig ? IC.schild : reicht ? IC.trend : IC.warnung, "");
    box.querySelector(".fh-gh-prognose-titel").textContent = titel;
    box.querySelector(".fh-gh-prognose-text").textContent = text;
  }

  function aufgabenZeichnen(panel, vorbei) {
    const liste = panel.querySelector(".fh-gh-liste");
    if (liste.childElementCount !== AUFGABEN.length) {
      liste.replaceChildren.apply(liste, AUFGABEN.map(function (a) {
        const z = aus('<div class="fh-gh-aufgabe" data-aufgabe="' + a.id + '">' +
          '<span class="fh-gh-aufgabe-icon">' + svg(a.icon, "") + '</span>' +
          '<div class="fh-gh-aufgabe-text"><p class="fh-gh-aufgabe-titel"></p><p class="fh-gh-aufgabe-sub"></p></div>' +
          '<button type="button" class="fh-gh-knopf fh-gh-start">' + T("start", "Starten") + '</button>' +
          '<span class="fh-gh-fertig">' + svg(IC.haken, "") + '<span></span></span>' +
        '</div>');
        kaputtText(z.querySelector(".fh-gh-aufgabe-titel"), t("gegenhack." + a.titel[0], a.titel[1]));
        kaputtText(z.querySelector(".fh-gh-aufgabe-sub"), t("gegenhack." + a.text[0], a.text[1]));
        z.querySelector(".fh-gh-start").addEventListener("click", function () { spielStarten(a.id); });
        return z;
      }));
    }
    const schritt = 100 / Math.max(1, stand.ziel);
    const gewinn = "+" + prozent(schritt);
    AUFGABEN.forEach(function (a, i) {
      const z = liste.children[i];
      const erledigt = stand.meine.indexOf(a.id) >= 0;
      z.classList.toggle("ist-erledigt", erledigt);
      z.classList.toggle("ist-gedimmt", !!spiel && spiel.id !== a.id);
      z.querySelector(".fh-gh-start").hidden = erledigt || vorbei;
      z.querySelector(".fh-gh-start").disabled = !!spiel;
      z.querySelector(".fh-gh-fertig").hidden = !erledigt;
      z.querySelector(".fh-gh-fertig span").textContent = gewinn;
    });
    const n = stand.meine.length;
    panel.querySelector(".fh-gh-beitrag").textContent = n
      ? t("gegenhack.yourShare", "Dein Beitrag:") + " +" + prozent(n * schritt)
      : n + " / 3 " + t("gegenhack.done", "erledigt");
  }

  function terminText(ms) {
    const d = new Date(ms);
    const wt = d.toLocaleDateString(en() ? "en-GB" : "de-DE", { weekday: "short" }).replace(".", "");
    const datum = d.toLocaleDateString(en() ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit" });
    const zeit = d.toLocaleTimeString(en() ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" });
    return wt + " " + datum + (en() ? ", " : "., ") + zeit;
  }
  function restText(ms) {
    const s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    const zeit = (d ? d + " " + t("gegenhack.days", "T") + " " : "") + h + " " + t("gegenhack.hours", "Std") + " " + m + " " + t("gegenhack.minutes", "Min");
    return t("gegenhack.leftPattern", "noch {zeit}").replace("{zeit}", zeit);
  }

  function erinnert() { try { return localStorage.getItem("fhGegenhackErinnert") === (questId || ""); } catch (e) { return false; } }

  function fussZeichnen(panel, vorbei) {
    const fuss = panel.querySelector(".fh-gh-fuss");
    const termin = stand.termin ? Date.parse(stand.termin) : null;
    fuss.hidden = vorbei;
    if (vorbei) return;
    kaputtText(panel.querySelector(".fh-gh-termin"), t("gegenhack.footer", "Gegenhack") + (termin ? " · " + terminText(termin) : " · " + t("gegenhack.nextEvent", "beim nächsten Live-Event")));
    panel.querySelector(".fh-gh-rest").textContent = termin && termin > Date.now() ? restText(termin) : "";
    const knopf = panel.querySelector(".fh-gh-erinnern");
    knopf.hidden = !termin || termin <= Date.now();
    const schon = erinnert();
    knopf.classList.toggle("ist-an", schon);
    knopf.innerHTML = svg(schon ? IC.kalender : IC.glocke, "") + esc(schon ? t("gegenhack.reminded", "Im Kalender") : t("gegenhack.remind", "Erinnern"));
  }

  function relativ(ms) {
    const d = Math.floor((Date.now() - ms) / 1000);
    if (d < 10) return t("gegenhack.now", "jetzt");
    if (d < 60) return (en() ? "" : "vor ") + d + " s" + (en() ? " ago" : "");
    if (d < 3600) return (en() ? "" : "vor ") + Math.floor(d / 60) + " min" + (en() ? " ago" : "");
    return (en() ? "" : "vor ") + Math.floor(d / 3600) + " " + t("gegenhack.hours", "Std") + (en() ? " ago" : "");
  }

  function feedZeichnen() {
    const w = ziel();
    const box = w && w.querySelector(".fh-gh-feed");
    if (!box) return;
    box.replaceChildren();
    if (!feed.length) { box.appendChild(el("p", "fh-gh-feed-leer", t("gegenhack.feedEmpty", "Noch hat niemand etwas gelöst. Sei die oder der Erste."))); return; }
    feed.forEach(function (z) {
      const a = AUFGABEN.find(function (x) { return x.id === z.aufgabe; });
      const zeile = el("div", "fh-gh-feed-zeile");
      if (z.avatar && /^scripts\/avatare\/[\w.%-]+$/.test(z.avatar)) {
        const img = el("img"); img.src = z.avatar; img.alt = ""; img.width = 22; img.height = 22; img.loading = "lazy";
        zeile.appendChild(img);
      } else {
        zeile.appendChild(el("span", "fh-gh-feed-bild", z.avatar && z.avatar.length <= 4 ? z.avatar : "☠"));
      }
      const text = el("span", "fh-gh-feed-text");
      text.appendChild(el("strong", z.ich ? "ist-ich" : null, z.ich ? t("gegenhack.you", "Du") : (z.name || t("gegenhack.pirate", "Ein Pirat"))));
      text.appendChild(document.createTextNode(" " + (a ? t("gegenhack." + a.tat[0], a.tat[1]) : "")));
      zeile.appendChild(text);
      zeile.appendChild(el("span", "fh-gh-feed-zeit", relativ(Date.parse(z.am))));
      box.appendChild(zeile);
    });
  }

  /* Kalendereintrag zum Termin - eine Stunde, mit Erinnerung
     15 Minuten vorher. Kein Server, keine Anmeldung. */
  function erinnern() {
    const termin = stand && stand.termin ? Date.parse(stand.termin) : null;
    if (!termin) return;
    const f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    const text = function (s) { return String(s).replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FireHelmet//Gegenhack//DE", "BEGIN:VEVENT",
      "UID:gegenhack-" + questId + "@firehelmet", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(termin), "DTEND:" + f(termin + 3600000),
      "SUMMARY:" + text("FireHelmet: " + (stand.titel || "Gegenhack")),
      "DESCRIPTION:" + text(t("gegenhack.icsText", "Live-Event bei Ändii – der Gegenhack gegen ???.")),
      "URL:https://spitzefluke.github.io/FireHelmet/",
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:" + text(stand.titel || "Gegenhack"), "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url; a.download = "gegenhack.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    try { localStorage.setItem("fhGegenhackErinnert", questId || ""); } catch (e) { /* egal */ }
    zeichnen();
  }

  /* ------------------------------------------------------
     TOAST
  ------------------------------------------------------ */
  let toastUhr = null;
  function toast(titel, text, icon) {
    let box = document.getElementById("fh-gh-toast");
    if (box) box.remove();
    box = aus('<div id="fh-gh-toast" class="fh-gh-toast" role="status"><span class="fh-gh-toast-icon">' + svg(icon || IC.haken, "") + '</span><div><p class="fh-gh-toast-titel"></p><p class="fh-gh-toast-text"></p></div></div>');
    box.querySelector(".fh-gh-toast-titel").textContent = titel;
    box.querySelector(".fh-gh-toast-text").textContent = text;
    document.body.appendChild(box);
    clearTimeout(toastUhr);
    toastUhr = setTimeout(function () { box.remove(); }, 3800);
  }

  /* ------------------------------------------------------
     DIE DREI MINISPIELE
  ------------------------------------------------------ */
  let spiel = null;          // { id, ... }
  let spielUhr = null;

  function spielStarten(id) {
    if (spiel || !stand || stand.beendet || stand.meine.indexOf(id) >= 0) return;
    const jetzt = Date.now();
    if (id === "frag") spiel = { id: id, liste: [], gefangen: 0, t0: jetzt, naechstes: jetzt + 300, nid: 0 };
    if (id === "freq") spiel = { id: id, f: 2, a: 18, zf: 4 + Math.round(Math.random() * 30) / 10, za: 30 + Math.round(Math.random() * 20), halten: 0 };
    if (id === "code") spiel = { id: id };
    if (!spiel) return;
    spielBuehne();
    if (id === "code") codeRunde(0, false);
    clearInterval(spielUhr);
    spielUhr = setInterval(spielTakt, 40);
    document.addEventListener("keydown", spielTaste);
    zeichnen();
  }

  function spielTaste(e) { if (e.key === "Escape") spielAbbrechen(); }

  function spielAbbrechen() {
    clearInterval(spielUhr); spielUhr = null;
    document.removeEventListener("keydown", spielTaste);
    const b = document.getElementById("fh-gh-spiel");
    if (b) b.remove();
    spiel = null;
    zeichnen();
  }

  function abbrechenKnopf(klasse) {
    return '<button type="button" class="' + klasse + '" aria-label="' + T("cancel", "Abbrechen") + '">' + svg(IC.x, "") + '</button>';
  }

  function spielBuehne() {
    const alt = document.getElementById("fh-gh-spiel");
    if (alt) alt.remove();
    let b;
    if (spiel.id === "frag") {
      b = aus('<div id="fh-gh-spiel" class="fh-gh-spiel ist-frag">' +
        '<div class="fh-gh-frag-hud" role="status">' + svg(IC.raster, "") + '<span>' + T("missionFrag", "Datenfragmente sichern") + '</span>' +
        '<span class="fh-gh-frag-zahl"></span><span class="fh-gh-frag-zeit"></span>' + abbrechenKnopf("fh-gh-rund-zu") + '</div>' +
        '<div class="fh-gh-frag-feld"></div></div>');
    } else if (spiel.id === "freq") {
      b = aus('<div id="fh-gh-spiel" class="fh-gh-spiel ist-modal" role="dialog" aria-modal="true" aria-labelledby="fh-gh-spiel-titel"><div class="fh-gh-modal">' +
        '<div class="fh-gh-modal-kopf"><div><p class="fh-gh-modal-kicker">' + T("freqKicker", "Aufgabe 2 · Funkraum") + '</p>' +
        '<h2 id="fh-gh-spiel-titel" class="fh-gh-modal-titel">' + T("missionFreq", "Gegensignal abstimmen") + '</h2>' +
        '<p class="fh-gh-modal-text">' + T("freqText", "Bring deine Welle über das Signal von ??? und halte sie kurz.") + '</p></div>' + abbrechenKnopf("fh-gh-eckig-zu") + '</div>' +
        '<div class="fh-gh-welle"><svg viewBox="0 0 496 150" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="75" x2="496" y2="75"/><path class="ist-ziel"/><path class="ist-dein"/></svg></div>' +
        '<div class="fh-gh-regler">' +
          '<label for="fh-gh-f">' + T("frequency", "Frequenz") + '</label><input id="fh-gh-f" type="range" min="1" max="8" step="0.1"><span class="fh-gh-f-wert"></span>' +
          '<label for="fh-gh-a">' + T("strength", "Stärke") + '</label><input id="fh-gh-a" type="range" min="10" max="60" step="1"><span class="fh-gh-a-wert"></span>' +
        '</div>' +
        '<div class="fh-gh-deckung"><span>' + T("match", "Deckung") + '</span><div class="fh-gh-deckung-balken"><span class="fh-gh-deckung-fuellung"></span><span class="fh-gh-deckung-marke"></span></div><span class="fh-gh-deckung-text" aria-live="polite"></span></div>' +
      '</div></div>');
      const f = b.querySelector("#fh-gh-f"), a = b.querySelector("#fh-gh-a");
      f.value = spiel.f; a.value = spiel.a;
      f.addEventListener("input", function () { if (spiel) spiel.f = parseFloat(f.value); });
      a.addEventListener("input", function () { if (spiel) spiel.a = parseFloat(a.value); });
    } else {
      b = aus('<div id="fh-gh-spiel" class="fh-gh-spiel ist-modal" role="dialog" aria-modal="true" aria-labelledby="fh-gh-spiel-titel"><div class="fh-gh-modal ist-schmal">' +
        '<div class="fh-gh-modal-kopf"><div><p class="fh-gh-modal-kicker"></p>' +
        '<h2 id="fh-gh-spiel-titel" class="fh-gh-modal-titel">' + T("missionCode", "Zugangscode knacken") + '</h2></div>' + abbrechenKnopf("fh-gh-eckig-zu") + '</div>' +
        '<p class="fh-gh-code-hinweis" aria-live="polite"></p>' +
        '<div class="fh-gh-code-feld">' + CODES.map(function (c, i) { return '<button type="button" data-i="' + i + '" disabled>' + c + '</button>'; }).join("") + '</div>' +
        '<div class="fh-gh-code-punkte"></div>' +
      '</div></div>');
      b.querySelectorAll(".fh-gh-code-feld button").forEach(function (k) {
        k.addEventListener("click", function () { codeTippen(parseInt(k.dataset.i, 10)); });
      });
    }
    b.querySelectorAll(".fh-gh-rund-zu, .fh-gh-eckig-zu").forEach(function (k) { k.addEventListener("click", spielAbbrechen); });
    document.body.appendChild(b);
    const erstes = b.querySelector("input, .fh-gh-eckig-zu, .fh-gh-rund-zu");
    if (erstes) erstes.focus();
  }

  function deckung(q) { return Math.max(0, Math.round(100 - Math.abs(q.f - q.zf) * 30 - Math.abs(q.a - q.za) * 1.6)); }
  function welle(f, a, ph) {
    let d = "";
    for (let x = 0; x <= 496; x += 6) d += (x ? "L" : "M") + x + " " + (75 + a * Math.sin(2 * Math.PI * f * x / 496 + ph)).toFixed(1);
    return d;
  }

  function spielTakt() {
    if (!spiel) return;
    const b = document.getElementById("fh-gh-spiel");
    if (!b) { spielAbbrechen(); return; }
    const jetzt = Date.now();

    if (spiel.id === "frag") {
      const feld = b.querySelector(".fh-gh-frag-feld");
      /* Zerfallene Fragmente weg */
      spiel.liste = spiel.liste.filter(function (x) {
        const alter = jetzt - x.geboren;
        if (alter >= 2300) { if (x.el) x.el.remove(); return false; }
        if (alter > 1700 && x.el) x.el.classList.add("ist-zerfall");
        return true;
      });
      if (jetzt >= spiel.naechstes && spiel.liste.length < 4) {
        const x = { id: spiel.nid++, geboren: jetzt };
        const breit = window.innerWidth, hoch = window.innerHeight;
        const k = aus('<button type="button" class="fh-gh-fragment" aria-label="' + T("fragCatch", "Fragment sichern") + '"><span>' + CODES[Math.floor(Math.random() * 9)] + '</span></button>');
        k.style.left = Math.round(16 + Math.random() * Math.max(40, breit - 90)) + "px";
        k.style.top = Math.round(90 + Math.random() * Math.max(40, hoch - 200)) + "px";
        k.addEventListener("click", function () {
          if (!spiel || spiel.id !== "frag") return;
          k.remove();
          spiel.liste = spiel.liste.filter(function (y) { return y.id !== x.id; });
          spiel.gefangen++;
          if (spiel.gefangen >= 8) geschafft("frag");
        });
        x.el = k;
        feld.appendChild(k);
        spiel.liste.push(x);
        spiel.naechstes = jetzt + 450 + Math.random() * 450;
      }
      if (!spiel) return;
      const rest = Math.max(0, 20 - (jetzt - spiel.t0) / 1000);
      b.querySelector(".fh-gh-frag-zahl").textContent = spiel.gefangen + " / 8";
      const zeit = b.querySelector(".fh-gh-frag-zeit");
      zeit.textContent = Math.ceil(rest) + " s";
      zeit.classList.toggle("ist-knapp", rest < 6);
      if (rest <= 0) {
        const n = spiel.gefangen;
        spielAbbrechen();
        toast(t("gegenhack.timeUp", "Zeit abgelaufen"), n + " " + t("gegenhack.timeUpText", "von 8 Fragmenten gesichert. Versuch es noch mal."), IC.uhr);
      }
      return;
    }

    if (spiel.id === "freq") {
      const ph = RUHIG.matches ? 0 : jetzt / 380;
      b.querySelector(".ist-ziel").setAttribute("d", welle(spiel.zf, spiel.za, ph));
      b.querySelector(".ist-dein").setAttribute("d", welle(spiel.f, spiel.a, ph));
      b.querySelector(".fh-gh-f-wert").textContent = spiel.f.toFixed(1).replace(".", en() ? "." : ",");
      b.querySelector(".fh-gh-a-wert").textContent = String(Math.round(spiel.a));
      const dk = deckung(spiel);
      const ok = dk >= 92;
      if (ok && !spiel.halten) spiel.halten = jetzt;
      if (!ok) spiel.halten = 0;
      const fuell = b.querySelector(".fh-gh-deckung-fuellung");
      fuell.style.width = dk + "%";
      b.querySelector(".fh-gh-deckung").classList.toggle("ist-ok", ok);
      b.querySelector(".fh-gh-deckung-text").textContent = spiel.halten
        ? t("gegenhack.hold", "Halten …") + " " + (Math.max(0, 1200 - (jetzt - spiel.halten)) / 1000).toFixed(1).replace(".", en() ? "." : ",") + " s"
        : dk + " %";
      if (spiel.halten && jetzt - spiel.halten > 1200) geschafft("freq");
      return;
    }

    if (spiel.id === "code" && spiel.seq) {
      const c = spiel;
      if (c.phase === "zeigen" && jetzt - c.t0 > c.seq.length * 650 + 150) c.phase = "eingabe";
      let an = -1;
      if (c.phase === "zeigen") { const e = jetzt - c.t0; const i = Math.floor(e / 650); if (e >= 0 && i < c.seq.length && e % 650 < 430) an = c.seq[i]; }
      const tipp = c.tipp && jetzt - c.tipp.am < 220 ? c.tipp.i : -1;
      b.querySelectorAll(".fh-gh-code-feld button").forEach(function (k, i) {
        k.classList.toggle("ist-an", i === an || i === tipp);
        k.disabled = c.phase !== "eingabe";
      });
      const falsch = c.fehler && jetzt - c.fehler < 900;
      const hinweis = b.querySelector(".fh-gh-code-hinweis");
      hinweis.classList.toggle("ist-falsch", !!falsch);
      hinweis.textContent = falsch ? t("gegenhack.codeWrong", "Falsch – die Reihenfolge wird noch mal gezeigt.")
        : c.phase === "zeigen" ? t("gegenhack.codeWatch", "Merk dir die Reihenfolge …")
        : c.phase === "ok" ? t("gegenhack.codeRight", "Richtig!")
        : t("gegenhack.codeYou", "Jetzt du:") + " " + c.eingabe.length + " / " + c.seq.length;
      b.querySelector(".fh-gh-code-feld").classList.toggle("ist-falsch", !!falsch && !RUHIG.matches);
      b.querySelector(".fh-gh-modal-kicker").textContent = t("gegenhack.codeKicker", "Aufgabe 3 · Runde") + " " + (c.r + 1) + " / 2";
      const punkte = b.querySelector(".fh-gh-code-punkte");
      if (punkte.childElementCount !== c.seq.length) punkte.replaceChildren.apply(punkte, c.seq.map(function () { return el("span"); }));
      Array.prototype.forEach.call(punkte.children, function (p, i) { p.classList.toggle("ist-an", i < c.eingabe.length); });
    }
  }

  function codeRunde(r, wieder) {
    if (!spiel) return;
    const laenge = [4, 5][r];
    const seq = wieder && spiel.seq ? spiel.seq : Array.from({ length: laenge }, function () { return Math.floor(Math.random() * 9); });
    Object.assign(spiel, { r: r, seq: seq, eingabe: [], phase: "zeigen", t0: Date.now() + 500, tipp: null, fehler: wieder ? Date.now() : 0 });
  }

  function codeTippen(i) {
    const c = spiel;
    if (!c || c.id !== "code" || c.phase !== "eingabe") return;
    const jetzt = Date.now();
    c.tipp = { i: i, am: jetzt };
    if (c.seq[c.eingabe.length] !== i) { c.phase = "falsch"; setTimeout(function () { if (spiel === c) codeRunde(c.r, true); }, 350); return; }
    c.eingabe.push(i);
    if (c.eingabe.length === c.seq.length) {
      c.phase = "ok";
      setTimeout(function () { if (spiel !== c) return; if (c.r === 0) codeRunde(1, false); else geschafft("code"); }, 600);
    }
  }

  async function geschafft(id) {
    const vorher = prozentStand();
    const quest = questId;
    spielAbbrechen();
    if (!quest || !dbDa()) return;
    let erg = -1;
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("gegenhack_beitragen", { p_quest: quest, p_aufgabe: id });
      });
      if (error) throw error;
      erg = data;
    } catch (e) {
      toast(t("gegenhack.errTitle", "Nicht angekommen"), t("gegenhack.errText", "Keine Verbindung zum Bordnetz. Versuch es gleich noch mal."), IC.warnung);
      return;
    }
    if (erg === -1) { toast(t("gegenhack.overTitle", "Quest vorbei"), t("gegenhack.overText", "Diese Quest nimmt keine Beiträge mehr an."), IC.warnung); standLaden(); return; }
    if (erg === 0) { toast(t("gegenhack.alreadyTitle", "Schon erledigt"), t("gegenhack.alreadyText", "Jede Aufgabe zählt einmal pro Pirat."), IC.haken); return; }
    puls++;
    await standLaden();
    feedLaden();
    const nachher = prozentStand();
    const meilenstein = [33.3, 66.6, 100].find(function (g) { return vorher < g && nachher >= g; });
    if (meilenstein) {
      toast(meilenstein === 100 ? t("gegenhack.ms3", "Gegenhack bereit") + "!" : t("gegenhack.milestone", "Meilenstein:") + " " + (meilenstein < 50 ? t("gegenhack.ms1", "Firewall-Riss") : t("gegenhack.ms2Toast", "Gegensignal steht")),
        t("gegenhack.milestoneText", "Deine Aufgabe hat den Ausschlag gegeben."), IC.fahne);
    } else {
      toast("+" + prozent(100 / Math.max(1, stand ? stand.ziel : 1)) + " " + t("gegenhack.forCrew", "für die Crew"), t("gegenhack.weaker", "Die Übernahme wird schwächer."), IC.haken);
    }
  }

  /* ------------------------------------------------------
     SIEG-BILDSCHIRM (live-storys.js ruft ihn im Finale auf)
  ------------------------------------------------------ */
  async function finaleDaten(storyId) {
    if (!storyId || !dbDa()) return null;
    try {
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("gegenhack_quests").select("quest_id, titel, ziel, ergebnis, stand_geloest, stand_helfer").eq("finale_story_id", storyId).maybeSingle();
      });
      return data || null;
    } catch (e) { return null; }
  }

  async function siegZeigen(storyId, vorschau) {
    const alt = document.getElementById("fh-gh-sieg");
    if (alt) alt.remove();
    let q = vorschau ? { titel: "Gegenhack vorbereiten", stand_helfer: 1284, stand_geloest: 3000, ziel: 3000 } : await finaleDaten(storyId);
    let meineDub = vorschau ? 1500 : null;
    if (!vorschau && q && q.quest_id && dbDa()) {
      try {
        const { data } = await supabaseClient.rpc("gegenhack_stand", { p_quest: q.quest_id });
        if (data && data.ok) meineDub = data.meine_dublonen || 0;
      } catch (e) { /* dann ohne eigene Zahl */ }
      if (typeof refreshPlayerCard === "function") refreshPlayerCard();
      if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
    }
    const helfer = q ? q.stand_helfer : null;
    const box = aus('<div id="fh-gh-sieg" class="fh-gh-sieg" role="dialog" aria-modal="true" aria-labelledby="fh-gh-sieg-titel"><div class="fh-gh-sieg-inhalt">' +
      '<p class="fh-gh-kicker">' + svg(IC.schild, "") + '<span>' + T("winKicker", "Live-Event · Gegenhack") + '</span></p>' +
      '<h1 id="fh-gh-sieg-titel" class="fh-gh-sieg-titel">' + T("winTitle", "Das Schiff gehört wieder der Crew.") + '</h1>' +
      '<p class="fh-gh-sieg-text"></p>' +
      '<div class="fh-gh-sieg-folgen"></div>' +
      '<button type="button" class="fh-gh-knopf ist-voll">' + T("winBack", "Zurück an Bord") + '</button>' +
    '</div></div>');
    box.querySelector(".fh-gh-sieg-text").textContent = (helfer ? zahl(helfer) + " " + t("gegenhack.winTextA", "Piraten haben die Übernahme Stück für Stück geschwächt.") + " " : "") +
      t("gegenhack.winTextB", "Heute Abend hat das Gegensignal ??? aus dem Bordnetz geworfen.");
    const folgen = [
      [IC.medaille, t("gegenhack.winBadge", "Abzeichen „Gegenhacker“ für alle, die mitgeholfen haben")],
      [IC.muenzen, meineDub ? t("gegenhack.winCoinsYou", "Für dich:") + " +" + zahl(meineDub) + " " + t("gegenhack.coins", "Dublonen") : t("gegenhack.winCoins", "+500 Dublonen für jede gelöste Aufgabe")],
      [IC.funkeln, t("gegenhack.winClean", "Die Seite ist wieder sauber")],
    ];
    const fz = box.querySelector(".fh-gh-sieg-folgen");
    folgen.forEach(function (f) { const z = aus('<div class="fh-gh-sieg-folge"><span>' + svg(f[0], "") + '</span><p></p></div>'); z.querySelector("p").textContent = f[1]; fz.appendChild(z); });
    const zu = function () {
      box.remove();
      const e = window.fhLiveVorschau || {};
      if (e.banderole) e.banderole(t("gegenhack.winBanner", "Gegenhack gelungen – das Schiff ist zurück!"), "#9184d9", t("gegenhack.crew", "Die Crew"));
      if (window.fhLiveZuschauer && window.fhLiveZuschauer.sammlungNeu) window.fhLiveZuschauer.sammlungNeu();
    };
    box.querySelector(".fh-gh-knopf").addEventListener("click", zu);
    document.body.appendChild(box);
    box.querySelector(".fh-gh-knopf").focus();
    return zu;
  }

  function siegWeg() { const b = document.getElementById("fh-gh-sieg"); if (b) b.remove(); }

  /* Fuer die Niederlage: "Die Crew kam nur auf 41 %." */
  async function niederlageText(storyId, vorschau) {
    const q = vorschau ? { stand_geloest: 1230, ziel: 3000 } : await finaleDaten(storyId);
    const p = q && q.ziel ? Math.floor(Math.min(100, q.stand_geloest / q.ziel * 100)) : null;
    return (p != null ? t("gegenhack.lostA", "Die Crew kam nur auf") + " " + p + " %. " : "") +
      t("gegenhack.lostB", "??? hat den Gegenhack abgewehrt. Was als Nächstes passiert, weiß niemand – außer ???.");
  }

  /* ------------------------------------------------------
     TAKT, SEITENWECHSEL, ZUSTAND
  ------------------------------------------------------ */
  function taktStarten() {
    if (!uhr) {
      uhr = setInterval(function () {
        if (!questId && !seiteOffen) { clearInterval(uhr); uhr = null; return; }
        standLaden();
        if (seiteOffen) feedLaden();
      }, 15000);
    }
    if (!kaputtUhr) {
      kaputtUhr = setInterval(function () {
        if (!seiteOffen) return;
        kaputtAnwenden();
        const termin = stand && stand.termin ? Date.parse(stand.termin) : null;
        const rest = document.querySelector("#gegenhack .fh-gh-rest");
        if (rest && termin && termin > Date.now()) rest.textContent = restText(termin);
      }, 420);
    }
  }

  window.updateGegenhackPage = function (pageID) {
    seiteOffen = pageID === "gegenhack";
    if (seiteOffen) {
      seitenQuest = questId || seitenQuest;
      if (!seitenQuest) { leerZeichnen(); return; }
      standLaden();
      feedLaden();
      taktStarten();
    }
    hinweisZeichnen();
  };

  function zustand(z) {
    if (!z) return;
    const id = z.quest_id || null;
    if (id === questId) return;
    questId = id;
    if (id) {
      seitenQuest = id;
      stand = null;
      feed = [];
      const w = ziel();
      if (w) w.replaceChildren();
      standLaden();
      if (seiteOffen) feedLaden();
      taktStarten();
    } else {
      if (spiel) spielAbbrechen();
      /* Die Seite zeigt das Ende der Quest, das Menue versteckt sie. */
      standLaden();
    }
    zeichnen();
  }

  if (RUHIG.addEventListener) RUHIG.addEventListener("change", zeichnen);

  window.fhGegenhack = {
    zustand: zustand,
    siegZeigen: siegZeigen,
    siegWeg: siegWeg,
    niederlageText: niederlageText,
  };
})();
