/* ======================================================
   LIVE-EVENT FUER ZUSCHAUER
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Live-Event Zuschauer"
   (Migration 30):

   - Countdown-Uebernahme: startet der Admin ein Event, sehen alle
     einen Vollbild-Countdown; danach Blitz und Banderole.
   - Live-Anzeige: solange ein Event laeuft, oben "Gleich live" bzw.
     "Live" mit der echten Zuschauerzahl (Supabase Realtime Presence,
     keine Tabelle). Klick: Event-Name und Logbuch.
   - Crew-Abstimmung: Frage und zwei Antworten vom Admin, eine
     Stimme je Spieler, Prozente laufen mit.
   - Abzeichen "War dabei": wer waehrend des Events da ist, holt es
     sich; nach dem Event ein Andenken-Fenster; die Sammlung oeffnet
     die Spielerkarte; die Rangliste zeigt einen Chip.

   live-event.js reicht jede Zustandszeile an zustand() weiter.
   Alles, was aus der Datenbank kommt (Event-Name, Frage, Antworten,
   Logbuch, Titel), geht nur per textContent ins DOM.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const BREIT = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : { matches: true };

  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function T(key, de) { return esc(t("zuschauer." + key, de)); }
  function zahl(n) { return Number(n || 0).toLocaleString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"); }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  function aus(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  /* Symbole: lucide (ISC), stroke-width 1.6 */
  function svg(pfade, klasse) {
    return '<svg class="' + (klasse || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + '</svg>';
  }
  const IC = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    kompass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
    haken: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    medaille: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    schaedel: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    schild: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  };
  const ANDII = "scripts/avatare/%C3%A4ndii.webp";
  const CREW = ["scripts/avatare/1.png", "scripts/avatare/2.png", "scripts/avatare/4.png", "scripts/avatare/5.png", "scripts/avatare/6.png"];

  function effekte() { return window.fhLiveVorschau || {}; }

  /* ------------------------------------------------------
     ZUSTAND
  ------------------------------------------------------ */
  let ev = null;             // { id, name, liveAb (ms), countdownAb (ms) }
  let zuschauer = null;      // Zahl aus Presence (oder null)
  let praesenz = null;       // Realtime-Kanal
  let abst = null;           // laufende Abstimmung
  let dabei = {};            // event_id -> Titel (Abzeichen geholt)
  let letzteStimme = null;   // { event, text, mehrheit }
  let uhr = null;            // Sekundentakt fuer Countdown/Abstimmung

  function jetzt() { return Date.now(); }

  /* ------------------------------------------------------
     PRESENCE: wer ist gerade da?
  ------------------------------------------------------ */
  async function praesenzStart() {
    if (praesenz || !dbDa() || typeof supabaseClient.channel !== "function") return;
    try {
      const uid = typeof wheelAuthReady !== "undefined" ? await wheelAuthReady : null;
      const kanal = supabaseClient.channel("live_zuschauer", { config: { presence: { key: uid || ("gast-" + Math.random().toString(36).slice(2)) } } });
      praesenz = kanal;
      kanal.on("presence", { event: "sync" }, function () {
        try { zuschauer = Object.keys(kanal.presenceState()).length; } catch (e) { zuschauer = null; }
        anzeigen();
      });
      kanal.subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          const avatar = localStorage.getItem("wheelAvatar") || "";
          kanal.track({ avatar: /^scripts\/avatare\/[\w.%-]+$/.test(avatar) ? avatar : "" }).catch(function () {});
        }
      });
    } catch (e) { praesenz = null; }
  }

  function praesenzStopp() {
    if (!praesenz) return;
    try { supabaseClient.removeChannel(praesenz); } catch (e) { /* egal */ }
    praesenz = null;
    zuschauer = null;
  }

  function crewBilder() {
    const bilder = [];
    if (praesenz) {
      try {
        const st = praesenz.presenceState();
        Object.keys(st).forEach(function (k) { (st[k] || []).forEach(function (m) { if (m && m.avatar && bilder.length < 5) bilder.push(m.avatar); }); });
      } catch (e) { /* egal */ }
    }
    for (let i = 0; bilder.length < 5; i++) bilder.push(CREW[i % CREW.length]);
    return bilder;
  }

  /* ------------------------------------------------------
     LIVE-ANZEIGE OBEN + FLYOUT
  ------------------------------------------------------ */
  let pill = null, flyout = null;

  function pillBauen() {
    if (pill) return pill;
    pill = aus('<button type="button" class="fh-live-pill" aria-haspopup="dialog" aria-expanded="false">' +
      '<span class="fh-live-pill-punkt" aria-hidden="true"></span>' +
      '<span class="fh-live-pill-text"></span>' +
      '<span class="fh-live-pill-trenner" aria-hidden="true"></span>' +
      svg(IC.users, "fh-live-pill-icon") +
      '<span class="fh-live-pill-zahl"></span>' +
    '</button>');
    pill.addEventListener("click", flyoutUmschalten);
    pillEinsetzen();
    return pill;
  }

  /* Breit: in die Topbar vor die Dublonen. Schmal: fest oben mittig. */
  function pillEinsetzen() {
    if (!pill) return;
    const leiste = document.querySelector(".fh-topbar-right");
    if (BREIT.matches && leiste) {
      pill.classList.remove("ist-schwebend");
      if (pill.parentNode !== leiste) leiste.insertBefore(pill, leiste.firstChild);
    } else {
      pill.classList.add("ist-schwebend");
      if (pill.parentNode !== document.body) document.body.appendChild(pill);
    }
  }
  if (BREIT.addEventListener) BREIT.addEventListener("change", pillEinsetzen);

  function pillAktualisieren() {
    if (!ev) {
      if (pill) { pill.remove(); pill = null; }
      flyoutZu();
      return;
    }
    const p = pillBauen();
    const live = jetzt() >= ev.liveAb;
    p.classList.toggle("ist-live", live);
    p.querySelector(".fh-live-pill-text").textContent = live ? t("zuschauer.live", "Live") : t("zuschauer.soon", "Gleich live");
    const zahlEl = p.querySelector(".fh-live-pill-zahl");
    zahlEl.textContent = zuschauer != null ? zahl(zuschauer) : "";
    p.querySelector(".fh-live-pill-icon").style.display = zuschauer != null ? "" : "none";
    p.querySelector(".fh-live-pill-trenner").style.display = zuschauer != null ? "" : "none";
    p.setAttribute("aria-label", (live ? t("zuschauer.live", "Live") : t("zuschauer.soon", "Gleich live")) + ": " + ev.name +
      (zuschauer != null ? " – " + zahl(zuschauer) + " " + t("zuschauer.aboard", "an Bord") : ""));
  }

  async function flyoutUmschalten() {
    if (flyout) { flyoutZu(); return; }
    if (!ev) return;
    flyout = aus('<div class="fh-live-flyout" role="dialog">' +
      '<div class="fh-live-flyout-kopf"><img src="' + ANDII + '" alt="" width="44" height="44">' +
      '<div><p class="fh-live-flyout-kicker">' + T("liveAt", "Live bei Ändii") + '</p><p class="fh-live-flyout-name"></p></div></div>' +
      '<div class="fh-live-flyout-log"></div></div>');
    flyout.querySelector(".fh-live-flyout-name").textContent = ev.name;
    flyout.setAttribute("aria-label", ev.name);
    document.body.appendChild(flyout);
    flyoutPlatzieren();
    if (pill) pill.setAttribute("aria-expanded", "true");
    logbuchLaden();
    setTimeout(function () { document.addEventListener("click", flyoutAussen, true); }, 0);
  }

  function flyoutAussen(e) {
    if (!flyout) return;
    if (flyout.contains(e.target) || (pill && pill.contains(e.target))) return;
    flyoutZu();
  }

  function flyoutZu() {
    if (flyout) flyout.remove();
    flyout = null;
    if (pill) pill.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", flyoutAussen, true);
  }

  function flyoutPlatzieren() {
    if (!flyout || !pill) return;
    const r = pill.getBoundingClientRect();
    const breite = Math.min(320, window.innerWidth - 24);
    flyout.style.top = Math.round(r.bottom + 8) + "px";
    flyout.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - breite - 12, r.left + r.width / 2 - breite / 2))) + "px";
    flyout.style.width = breite + "px";
  }
  window.addEventListener("resize", function () { pillEinsetzen(); flyoutPlatzieren(); });

  async function logbuchLaden() {
    if (!flyout || !ev || !dbDa()) return;
    const ziel = flyout.querySelector(".fh-live-flyout-log");
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("live_logbuch").select("text, am").eq("event_id", ev.id).order("am", { ascending: false }).limit(5);
      });
      if (error) throw error;
      if (!flyout) return;
      ziel.replaceChildren();
      (data || []).forEach(function (z) {
        const zeile = el("div", "fh-live-flyout-zeile");
        const min = Math.max(0, Math.floor((Date.parse(z.am) - ev.liveAb) / 60000));
        zeile.appendChild(el("span", "fh-live-flyout-zeit", "+" + min + " min"));
        zeile.appendChild(el("span", null, z.text));
        ziel.appendChild(zeile);
      });
      if (!data || !data.length) ziel.appendChild(el("p", "fh-live-flyout-leer", t("zuschauer.logEmpty", "Gleich geht es los.")));
    } catch (e) { /* ohne Logbuch eben ohne */ }
  }

  /* ------------------------------------------------------
     COUNTDOWN-UEBERNAHME
  ------------------------------------------------------ */
  let countdownEl = null, countdownGesehen = false;

  function countdownAktualisieren() {
    const rest = ev ? ev.liveAb - jetzt() : -1;
    if (!ev || rest <= 0) {
      if (countdownEl) {
        countdownEl.remove();
        countdownEl = null;
        if (countdownGesehen && ev) {
          const e = effekte();
          if (e.blitz) e.blitz();
          if (e.banderole) e.banderole(t("zuschauer.started", "Das Live-Event hat begonnen!"), "#f0c96a", "Ändii");
          if (e.konfetti) e.konfetti();
        }
        countdownGesehen = false;
      }
      return;
    }
    if (!countdownEl) {
      countdownEl = aus('<div class="fh-live-countdown" role="status" aria-live="polite">' +
        '<p class="fh-live-countdown-kicker"><span class="fh-live-pill-punkt" aria-hidden="true"></span>' + T("begins", "Live-Event beginnt") + '</p>' +
        '<p class="fh-live-countdown-name"></p>' +
        '<div class="fh-live-countdown-ring"><svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="110" class="ist-grund"/><circle cx="120" cy="120" r="110" class="ist-lauf"/></svg><span class="fh-live-countdown-zahl"></span></div>' +
        '<div class="fh-live-countdown-crew"><div class="fh-live-countdown-bilder"></div><p><strong class="fh-live-countdown-an"></strong> <span class="fh-live-countdown-an-text"></span></p></div>' +
        '<p class="fh-live-countdown-hinweis">' + T("stayTuned", "Gleich geht es los – bleib dran.") + '</p>' +
      '</div>');
      countdownEl.querySelector(".fh-live-countdown-name").textContent = ev.name;
      document.body.appendChild(countdownEl);
      countdownGesehen = true;
    }
    const gesamt = Math.max(1000, ev.liveAb - ev.countdownAb);
    const anteil = Math.max(0, Math.min(1, rest / gesamt));
    countdownEl.querySelector(".ist-lauf").style.strokeDashoffset = (691 * (1 - anteil)).toFixed(1);
    const sek = String(Math.ceil(rest / 1000));
    const zahlEl = countdownEl.querySelector(".fh-live-countdown-zahl");
    if (zahlEl.textContent !== sek) {
      zahlEl.textContent = sek;
      zahlEl.classList.remove("ist-neu"); void zahlEl.offsetWidth; zahlEl.classList.add("ist-neu");
    }
    const bilder = countdownEl.querySelector(".fh-live-countdown-bilder");
    if (!bilder.childElementCount || bilder.dataset.anzahl !== String(zuschauer)) {
      bilder.dataset.anzahl = String(zuschauer);
      bilder.replaceChildren.apply(bilder, crewBilder().map(function (src) { const i = el("img"); i.src = src; i.alt = ""; i.width = 34; i.height = 34; return i; }));
    }
    const an = countdownEl.querySelector(".fh-live-countdown-crew");
    an.hidden = zuschauer == null;
    countdownEl.querySelector(".fh-live-countdown-an").textContent = zahl(zuschauer);
    countdownEl.querySelector(".fh-live-countdown-an-text").textContent = zuschauer === 1 ? t("zuschauer.oneAboard", "Pirat ist an Bord") : t("zuschauer.manyAboard", "Piraten sind an Bord");
  }

  /* ------------------------------------------------------
     CREW-ABSTIMMUNG
  ------------------------------------------------------ */
  let abstEl = null, abstUhr = null, abstStand = { a: 0, b: 0, meine: null }, abstWegUhr = null;

  async function abstimmungLaden(id) {
    if (!dbDa()) return;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("live_abstimmungen").select("abst_id, event_id, frage, antwort_a, antwort_b, ab, bis").eq("abst_id", id).maybeSingle();
      });
      if (error) throw error;
      if (!data) return;
      const bis = Date.parse(data.bis);
      /* Laengst vorbei (Seite spaeter geoeffnet): nicht mehr zeigen. */
      if (jetzt() > bis + 8000) return;
      abst = { id: data.abst_id, event: data.event_id, frage: data.frage, a: data.antwort_a, b: data.antwort_b, ab: Date.parse(data.ab), bis: bis, dauer: bis - Date.parse(data.ab) };
      abstStand = { a: 0, b: 0, meine: null };
      abstimmungBauen();
      standHolen();
      clearInterval(abstUhr);
      abstUhr = setInterval(standHolen, 2000);
    } catch (e) { console.warn("Abstimmung nicht ladbar:", e); }
  }

  async function standHolen() {
    if (!abst || !dbDa()) return;
    try {
      const { data, error } = await supabaseClient.rpc("live_abstimmung_stand", { p_abst: abst.id });
      if (error) throw error;
      const z = Array.isArray(data) ? data[0] : data;
      if (z) abstStand = { a: z.a || 0, b: z.b || 0, meine: z.meine || abstStand.meine };
      abstimmungZeichnen();
      if (jetzt() > abst.bis + 1500) { clearInterval(abstUhr); abstUhr = null; }
    } catch (e) { /* naechster Takt */ }
  }

  function abstimmungBauen() {
    if (abstEl) abstEl.remove();
    clearTimeout(abstWegUhr);
    abstEl = aus('<section class="fh-live-abst" aria-live="polite">' +
      '<div class="fh-live-abst-karte">' +
        '<div class="fh-live-abst-kopf"><div><p class="fh-live-abst-kicker">' + svg(IC.kompass, "") + '<span></span></p><p class="fh-live-abst-frage"></p></div>' +
        '<div class="fh-live-abst-uhr"><p class="fh-live-abst-zeit"></p><p class="fh-live-abst-stimmen"></p></div></div>' +
        '<div class="fh-live-abst-optionen">' +
          '<button type="button" class="fh-live-abst-opt ist-a" data-wahl="a"><span class="fh-live-abst-fuellung"></span><span class="fh-live-abst-inhalt"><span class="fh-live-abst-buchst">A</span><span class="fh-live-abst-titel"></span><span class="fh-live-abst-prozent"></span></span><span class="fh-live-abst-meine">' + svg(IC.haken, "") + T("myVote", "Deine Stimme") + '</span></button>' +
          '<button type="button" class="fh-live-abst-opt ist-b" data-wahl="b"><span class="fh-live-abst-fuellung"></span><span class="fh-live-abst-inhalt"><span class="fh-live-abst-buchst">B</span><span class="fh-live-abst-titel"></span><span class="fh-live-abst-prozent"></span></span><span class="fh-live-abst-meine">' + svg(IC.haken, "") + T("myVote", "Deine Stimme") + '</span></button>' +
        '</div>' +
        '<p class="fh-live-abst-hinweis"></p>' +
        '<span class="fh-live-abst-balken"></span>' +
      '</div></section>');
    abstEl.querySelector(".ist-a .fh-live-abst-titel").textContent = abst.a;
    abstEl.querySelector(".ist-b .fh-live-abst-titel").textContent = abst.b;
    abstEl.querySelectorAll(".fh-live-abst-opt").forEach(function (k) {
      k.addEventListener("click", function () { abstimmen(k.dataset.wahl); });
    });
    document.body.appendChild(abstEl);
    abstimmungZeichnen();
  }

  async function abstimmen(wahl) {
    if (!abst || abstStand.meine || jetzt() > abst.bis || !dbDa()) return;
    abstStand.meine = wahl;
    abstStand[wahl]++;
    abstimmungZeichnen();
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await supabaseClient.rpc("live_abstimmen", { p_abst: abst.id, p_wahl: wahl });
      if (error) throw error;
      if (data === -1) { abstStand.meine = null; abstStand[wahl]--; }
      standHolen();
    } catch (e) {
      abstStand.meine = null; abstStand[wahl]--;
      abstimmungZeichnen();
    }
  }

  function abstimmungZeichnen() {
    if (!abstEl || !abst) return;
    const rest = Math.max(0, abst.bis - jetzt());
    const fertig = rest <= 0;
    const summe = abstStand.a + abstStand.b;
    const pa = summe ? Math.round(abstStand.a / summe * 100) : 50;
    const pb = 100 - pa;
    const sieger = fertig ? (abstStand.a >= abstStand.b ? "a" : "b") : null;
    const zeigeProzent = fertig || !!abstStand.meine;

    abstEl.classList.toggle("ist-fertig", fertig);
    abstEl.querySelector(".fh-live-abst-kicker span").textContent = fertig ? t("zuschauer.decided", "Die Crew hat entschieden") : t("zuschauer.vote", "Crew-Abstimmung");
    abstEl.querySelector(".fh-live-abst-frage").textContent = fertig ? (sieger === "a" ? abst.a : abst.b) : abst.frage;
    const sek = Math.ceil(rest / 1000);
    abstEl.querySelector(".fh-live-abst-zeit").textContent = fertig ? "0:00" : Math.floor(sek / 60) + ":" + String(sek % 60).padStart(2, "0");
    abstEl.querySelector(".fh-live-abst-zeit").classList.toggle("ist-knapp", !fertig && sek <= 10);
    abstEl.querySelector(".fh-live-abst-stimmen").textContent = zahl(summe) + " " + (summe === 1 ? t("zuschauer.voteOne", "Stimme") : t("zuschauer.voteMany", "Stimmen"));
    abstEl.querySelector(".fh-live-abst-balken").style.width = (fertig ? 0 : rest / abst.dauer * 100).toFixed(1) + "%";

    [["a", pa], ["b", pb]].forEach(function (paar) {
      const k = abstEl.querySelector(".ist-" + paar[0]);
      k.querySelector(".fh-live-abst-fuellung").style.width = zeigeProzent ? paar[1] + "%" : "0%";
      k.querySelector(".fh-live-abst-prozent").textContent = zeigeProzent ? paar[1] + " %" : "";
      k.classList.toggle("ist-meine", abstStand.meine === paar[0]);
      k.classList.toggle("ist-sieger", sieger === paar[0]);
      k.classList.toggle("ist-verlierer", !!sieger && sieger !== paar[0]);
      k.disabled = fertig || !!abstStand.meine;
    });
    abstEl.querySelector(".fh-live-abst-hinweis").textContent = fertig
      ? t("zuschauer.voteDone", "Gleich geht es weiter – die Crew hat den Kurs gesetzt.")
      : abstStand.meine ? t("zuschauer.voteCounted", "Deine Stimme zählt. Das Ergebnis läuft live mit.")
      : t("zuschauer.voteTip", "Tipp eine Antwort an. Die Mehrheit entscheidet.");

    if (fertig && abstStand.meine && abst.event) {
      letzteStimme = { event: abst.event, text: abstStand.meine === "a" ? abst.a : abst.b, mehrheit: abstStand.meine === sieger };
    }
    if (fertig && !abstWegUhr) {
      abstWegUhr = setTimeout(function () { if (abstEl) abstEl.remove(); abstEl = null; abst = null; abstWegUhr = null; }, 8000);
    }
  }

  /* ------------------------------------------------------
     ABZEICHEN "WAR DABEI"
  ------------------------------------------------------ */
  let sammlungCache = null;   // Ergebnis von meine_abzeichen()
  let neuesAbzeichen = false;

  async function dabeiHolen() {
    if (!ev || dabei[ev.id] || !dbDa() || jetzt() < ev.liveAb) return;
    const id = ev.id;
    dabei[id] = "…";
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("live_war_dabei", { p_event: id });
      });
      if (error) throw error;
      if (data && data.ok) {
        dabei[id] = data.titel;
        if (data.neu) { neuesAbzeichen = true; sammlungLaden().then(spielerkarteAuffrischen); }
      } else { delete dabei[id]; }
    } catch (e) { delete dabei[id]; }
  }

  function spielerkarteAuffrischen() { if (typeof refreshPlayerCard === "function") refreshPlayerCard(); }

  async function sammlungLaden() {
    if (!dbDa()) return [];
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc("meine_abzeichen"); });
      if (error) throw error;
      sammlungCache = data || [];
      return sammlungCache;
    } catch (e) { return sammlungCache || []; }
  }

  function datum(ms) {
    const d = new Date(ms);
    return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  }

  /* Nach dem Event: das Andenken. Gehackt (Systemausfall) in Gruen
     und "beschaedigt" wie im Entwurf, sonst in Gold. */
  async function andenkenZeigen(evAlt, titel) {
    const liste = await sammlungLaden();
    const eintrag = liste.find(function (a) { return a.titel === titel; }) || null;
    const gehackt = !!(window.fhLiveStorys && window.fhLiveStorys.istGehackt());
    const stimme = letzteStimme && letzteStimme.event === evAlt.id ? letzteStimme : null;
    const alt = document.getElementById("fh-andenken");
    if (alt) alt.remove();
    const box = aus('<div id="fh-andenken" class="fh-andenken' + (gehackt ? ' ist-gehackt' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="fh-andenken-karte">' +
        (gehackt ? '<p class="fh-andenken-exe">&gt; ' + T("badgeExe", "abzeichen.exe wird ausgeführt …") + '</p>' : '') +
        '<div class="fh-andenken-medaille"><span class="fh-andenken-glanz"></span><span class="fh-andenken-rund"></span><span class="fh-andenken-strich"></span>' + svg(gehackt ? IC.schaedel : IC.medaille, "fh-andenken-symbol") + '</div>' +
        '<p class="fh-andenken-kicker">' + (gehackt ? T("badgeDamaged", "Abzeichen erhalten · beschädigt") : T("badgeGot", "Abzeichen erhalten")) + '</p>' +
        '<p class="fh-andenken-titel"></p>' +
        '<p class="fh-andenken-text">' + (gehackt ? T("badgeTextHacked", "Du warst an Bord, als ??? das Event gekapert hat. Das Abzeichen liegt in deiner Sammlung und steht neben deinem Namen in der Rangliste.") : T("badgeText", "Du warst live an Bord. Das Abzeichen liegt in deiner Sammlung und steht neben deinem Namen in der Rangliste.")) + '</p>' +
        '<div class="fh-andenken-chips"></div>' +
        '<div class="fh-andenken-knoepfe"><button type="button" class="fh-andenken-spaeter">' + T("later", "Später") + '</button>' +
        '<button type="button" class="fh-andenken-sammlung">' + svg(IC.medaille, "") + T("toCollection", "Zur Sammlung") + '</button></div>' +
      '</div></div>');
    box.querySelector(".fh-andenken-titel").textContent = titel;
    const chips = box.querySelector(".fh-andenken-chips");
    chips.appendChild(el("span", null, datum(evAlt.liveAb)));
    if (eintrag) chips.appendChild(el("span", null, zahl(eintrag.anzahl) + " " + t("zuschauer.aboard", "an Bord")));
    if (stimme) chips.appendChild(el("span", "ist-stimme", t("zuschauer.yourVote", "Deine Stimme:") + " " + stimme.text + (stimme.mehrheit ? " ✓" : "")));
    box.querySelector(".fh-andenken-spaeter").addEventListener("click", function () { box.remove(); });
    box.querySelector(".fh-andenken-sammlung").addEventListener("click", function () { box.remove(); sammlungOeffnen(); });
    box.addEventListener("click", function (e) { if (e.target === box) box.remove(); });
    document.body.appendChild(box);
    box.querySelector(".fh-andenken-sammlung").focus();
  }

  async function sammlungOeffnen() {
    neuesAbzeichen = false;
    spielerkarteAuffrischen();
    const alt = document.getElementById("fh-sammlung");
    if (alt) alt.remove();
    const nickname = localStorage.getItem("wheelNickname") || "";
    const box = aus('<div id="fh-sammlung" class="fh-sammlung" role="dialog" aria-modal="true">' +
      '<div class="fh-sammlung-schleier"></div>' +
      '<aside class="fh-sammlung-leiste">' +
        '<div class="fh-sammlung-kopf"><div><p class="fh-sammlung-name"></p><p class="fh-sammlung-unter">' + T("collectionSub", "Deine Sammlung") + '</p></div>' +
        '<button type="button" class="fh-sammlung-zu" aria-label="' + T("close", "Schließen") + '">' + svg(IC.x, "") + '</button></div>' +
        '<div class="fh-sammlung-inhalt"><div class="fh-sammlung-zeile"><p>' + T("collection", "Event-Abzeichen") + '</p><p class="fh-sammlung-zahl"></p></div>' +
        '<div class="fh-sammlung-raster"><p class="fh-sammlung-leer">' + T("loading", "Lade …") + '</p></div>' +
        '<p class="fh-sammlung-fuss">' + T("liveOnly", "Abzeichen gibt es nur live. Wer beim Event an Bord ist, bekommt es – nachholen kann man es nicht.") + '</p></div>' +
      '</aside></div>');
    box.querySelector(".fh-sammlung-name").textContent = nickname || t("zuschauer.pirate", "Pirat");
    const zu = function () { box.remove(); document.removeEventListener("keydown", esc2); };
    const esc2 = function (e) { if (e.key === "Escape") zu(); };
    box.querySelector(".fh-sammlung-zu").addEventListener("click", zu);
    box.querySelector(".fh-sammlung-schleier").addEventListener("click", zu);
    document.addEventListener("keydown", esc2);
    document.body.appendChild(box);
    box.querySelector(".fh-sammlung-zu").focus();

    const liste = await sammlungLaden();
    const raster = box.querySelector(".fh-sammlung-raster");
    raster.replaceChildren();
    const meine = liste.filter(function (a) { return a.habe; });
    box.querySelector(".fh-sammlung-zahl").textContent = meine.length + " / " + liste.length;
    if (!liste.length) raster.appendChild(el("p", "fh-sammlung-leer", t("zuschauer.noBadges", "Noch keine Event-Abzeichen. Das erste gibt es beim nächsten Live-Event.")));
    const neuestes = meine.slice().sort(function (x, y) { return Date.parse(y.erhalten_am) - Date.parse(x.erhalten_am); })[0];
    liste.forEach(function (a) {
      const k = aus('<div class="fh-sammlung-abzeichen ist-' + (a.art === "gegenhacker" ? "gegenhacker" : "dabei") + (a.habe ? " ist-da" : "") + '">' +
        '<span class="fh-sammlung-medaille">' + svg(a.art === "gegenhacker" ? IC.schild : IC.medaille, "") + '</span>' +
        '<span class="fh-sammlung-titel"></span><span class="fh-sammlung-datum"></span></div>');
      k.querySelector(".fh-sammlung-titel").textContent = a.titel;
      k.querySelector(".fh-sammlung-datum").textContent = datum(Date.parse(a.am));
      if (neuestes && a.abzeichen_id === neuestes.abzeichen_id && Date.now() - Date.parse(a.erhalten_am) < 86400000) {
        k.appendChild(el("span", "fh-sammlung-neu", t("zuschauer.new", "NEU")));
      }
      raster.appendChild(k);
    });
  }

  /* Fuer die Spielerkarte (progression.js). */
  function kartenKnopfHtml() {
    const n = sammlungCache ? sammlungCache.filter(function (a) { return a.habe; }).length : 0;
    if (!n) return "";
    return '<button type="button" class="fh-player-card-abzeichen' + (neuesAbzeichen ? ' ist-neu' : '') + '" onclick="fhLiveZuschauer.sammlungOeffnen()" aria-label="' +
      T("collection", "Event-Abzeichen") + ': ' + n + '">' + svg(IC.medaille, "") + '<span>' + n + '</span></button>';
  }

  /* Fuer die Rangliste (wheel.js): uid -> { anzahl, titel, art }. */
  async function abzeichenJeSpieler() {
    const karte = new Map();
    if (!dbDa()) return karte;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc("abzeichen_je_spieler"); });
      if (error) throw error;
      (data || []).forEach(function (z) { karte.set(z.firebase_uid, { anzahl: z.anzahl, titel: z.titel, art: z.art }); });
    } catch (e) { /* Rangliste auch ohne Abzeichen */ }
    return karte;
  }

  function chipHtml(info) {
    if (!info) return "";
    const gegen = info.art === "gegenhacker";
    return '<span class="fh-abzeichen-chip' + (gegen ? ' ist-gegenhacker' : '') + '" title="' + esc(info.titel) + (info.anzahl > 1 ? ' (+' + (info.anzahl - 1) + ')' : '') + '">' +
      svg(gegen ? IC.schild : IC.terminal, "") + (gegen ? 'gegenhacker' : 'war_dabei') + '</span>';
  }

  /* ------------------------------------------------------
     TAKT UND ZUSTAND
  ------------------------------------------------------ */
  function anzeigen() {
    pillAktualisieren();
    countdownAktualisieren();
    if (ev && jetzt() >= ev.liveAb) dabeiHolen();
    abstimmungZeichnen();
  }

  function taktStarten() {
    if (uhr) return;
    uhr = setInterval(function () {
      anzeigen();
      if (!ev && !abst) { clearInterval(uhr); uhr = null; }
    }, 250);
  }

  async function eventDatenLaden(id) {
    if (!dbDa()) return null;
    try {
      const { data } = await supabaseClient.from("live_events").select("countdown_ab, live_ab").eq("event_id", id).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  }

  let letzteAbst = null;
  let ladeId = null;         // Event, dessen Daten gerade geladen werden

  async function zustand(z, erstesMal) {
    if (!z) return;
    const id = z.event_id || null;

    /* Realtime und Polling liefern dieselbe Zeile oft doppelt - ein
       Event, das schon geladen wird, nicht ein zweites Mal anfangen. */
    if (id !== (ev && ev.id) && !(id && id === ladeId)) {
      const vorher = ev;
      if (vorher && !id) {
        /* Event beendet: Andenken, falls ich das Abzeichen habe. */
        const titel = dabei[vorher.id];
        if (titel && titel !== "…") setTimeout(function () { andenkenZeigen(vorher, titel); }, 2400);
        praesenzStopp();
      }
      ev = null;
      ladeId = id;
      if (id) {
        /* Neues Event: ein Nachregen vom letzten Sturm ist vorbei. */
        if (!erstesMal && window.fhLiveStorys && window.fhLiveStorys.nachregenAus) window.fhLiveStorys.nachregenAus();
        const liveAb = Date.parse(z.event_live_ab);
        let countdownAb = liveAb - 10000;
        const daten = await eventDatenLaden(id);
        if (ladeId !== id) return;   // inzwischen beendet oder ersetzt
        ladeId = null;
        if (daten) countdownAb = Date.parse(daten.countdown_ab);
        if (!erstesMal) {
          /* Live angekommen: die Uhr des Zuschauers kann falsch gehen -
             dann von JETZT an so lange zaehlen, wie der Admin wollte. */
          const dauer = Math.max(0, liveAb - countdownAb);
          ev = { id: id, name: z.event_name || "", countdownAb: jetzt(), liveAb: jetzt() + dauer };
        } else {
          ev = { id: id, name: z.event_name || "", countdownAb: countdownAb, liveAb: liveAb };
        }
        praesenzStart();
        taktStarten();
      }
      anzeigen();
    } else if (ev && z.event_name && z.event_name !== ev.name) {
      ev.name = z.event_name;
      anzeigen();
    }

    if (z.abstimmung_id && z.abstimmung_id !== letzteAbst) {
      letzteAbst = z.abstimmung_id;
      await abstimmungLaden(z.abstimmung_id);
      taktStarten();
    } else if (!z.abstimmung_id) {
      letzteAbst = null;
    }
    if (flyout) logbuchLaden();
  }

  window.fhLiveZuschauer = {
    zustand: zustand,
    sammlungOeffnen: sammlungOeffnen,
    kartenKnopfHtml: kartenKnopfHtml,
    abzeichenJeSpieler: abzeichenJeSpieler,
    chipHtml: chipHtml,
  };

  /* Die Sammlung einmal frueh laden - fuer den Knopf auf der
     Spielerkarte. Der Client steht erst nach der Konfiguration. */
  function frueh() {
    if (!dbDa()) return;
    sammlungLaden().then(function (l) { if (l && l.some(function (a) { return a.habe; })) spielerkarteAuffrischen(); });
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof onSiteConfigReady === "function") onSiteConfigReady(frueh);
    else frueh();
  });
})();
