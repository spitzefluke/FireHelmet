/* ======================================================
   SEITENWAHL IN DER EPOCHE 2100 (Migration 47)
   ---------------------------------------------------
   Nach der Zeitmaschine (Migration 46) waehlt jeder angemeldete
   Spieler EINMAL und endgueltig eine Seite:

     Menschen - "Die Erdflotte": zaeh, gemeinsam stark, tagsueber
     Aliens   - "Der Schwarm":   aggressiv, riskant, nachts

   Gewaehlt wird ueber seite_waehlen() in der Datenbank (nur in 2100,
   nur einmal); die Spalte players.seite ist fuer jedes normale UPDATE
   eingefroren.

   BONI - nur solange 2100 gilt
   Diese Datei huellt window.fhSkillBonus(art) aus skilltree.js ein,
   das Rad, Shop, Spielothek und XP schon fragen. Dazu kommt der
   Seitenbonus; manche Skill-Zweige wirken 1,5-fach:

     Art           Menschen                   Aliens
     raddublonen   +12 %                      -10 %
     shoprabatt    -8 % Preis, Feilscher x1,5 +10 % Preis
     slotdublonen  -10 %                      +15 %
     xpbonus       6-18 Uhr +10 %             6-18 Uhr -10 %
                   22-6 Uhr -10 %             22-6 Uhr +20 %
     Boss          -10 % (Server, 47)         +15 %, Kampf-Skills x1,5 (Server)

   Die Tageszeit ist die des Browsers. Die Dublonen-Deckel der
   Datenbank (valid_players_write) gelten unveraendert.

   Kampfwerte (Leben, Schaden, Schilde) kommen mit Hangar und
   Sternenschlacht (Etappe 3 und 4).

   window.fhSeite = { meine(), aktiv(), bonus(art), wahlZeigen(), DATEN }
====================================================== */

(function () {
  "use strict";

  const SPEICHER = "fhSeite";
  const SPAETER = "fhSeiteSpaeter";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function ist2100() { return !!(window.fhEpoche && window.fhEpoche.jahr() === 2100); }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }

  let meine = null;       // 'menschen' | 'aliens' | null
  let geladen = false;    // Stand aus der Datenbank da?
  let laedt = null;

  try {
    const g = localStorage.getItem(SPEICHER);
    if (g === "menschen" || g === "aliens") meine = g;
  } catch (e) { /* Privatmodus */ }

  /* ------------------------------------------------------
     BONI
  ------------------------------------------------------ */
  const BONI = {
    menschen: { raddublonen: 0.12, shoprabatt: 0.08, slotdublonen: -0.10 },
    aliens: { raddublonen: -0.10, shoprabatt: -0.10, slotdublonen: 0.15 },
  };
  /* Skill-Zweige, die auf einer Seite staerker wirken. */
  const SKILL_MAL = {
    menschen: { shoprabatt: 1.5 },
    aliens: { bossschaden: 1.5 },
  };

  function xpBonus(seite, stunde) {
    const tag = stunde >= 6 && stunde < 18;
    const nacht = stunde >= 22 || stunde < 6;
    if (seite === "menschen") return tag ? 0.10 : nacht ? -0.10 : 0;
    if (seite === "aliens") return tag ? -0.10 : nacht ? 0.20 : 0;
    return 0;
  }

  function aktiv() { return ist2100() && !!meine; }

  function seitenBonus(art) {
    if (!aktiv()) return 0;
    if (art === "xpbonus") return xpBonus(meine, new Date().getHours());
    return BONI[meine][art] || 0;
  }

  /* fhSkillBonus einhuellen: skilltree.js ist vorher geladen. */
  const skillBonus = window.fhSkillBonus;
  if (typeof skillBonus === "function") {
    window.fhSkillBonus = function (art) {
      const grund = skillBonus(art);
      if (!aktiv()) return grund;
      const mal = (SKILL_MAL[meine] || {})[art] || 1;
      return grund * mal + seitenBonus(art);
    };
  }

  /* ------------------------------------------------------
     STAND AUS DER DATENBANK
  ------------------------------------------------------ */
  function merken(seite) {
    meine = seite === "menschen" || seite === "aliens" ? seite : null;
    try {
      if (meine) localStorage.setItem(SPEICHER, meine);
      else localStorage.removeItem(SPEICHER);
    } catch (e) { /* egal */ }
    document.dispatchEvent(new CustomEvent("fh:seite", { detail: { seite: meine } }));
  }

  function laden() {
    if (laedt) return laedt;
    if (!dbDa() || typeof wheelAuthReady === "undefined") return Promise.resolve(meine);
    laedt = wheelAuthReady.then(function (uid) {
      if (!uid) return null;
      return withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("players").select("seite").eq("firebase_uid", uid).maybeSingle();
      }).then(function (antwort) {
        if (antwort.error) throw antwort.error;
        geladen = true;
        merken(antwort.data ? antwort.data.seite : null);
        return meine;
      });
    }).catch(function (err) {
      /* Ohne Migration 47 gibt es die Spalte nicht - dann bleibt alles wie bisher. */
      console.warn("Seite: Laden fehlgeschlagen:", err);
      return meine;
    }).finally(function () { laedt = null; });
    return laedt;
  }

  /* ------------------------------------------------------
     DATEN FUER DIE WAHL (Texte DE/EN in i18n.js: seiten.*)
  ------------------------------------------------------ */
  const SYMBOL = {
    /* lucide "shield" (ISC) */
    menschen: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    /* lucide "zap" (ISC) */
    aliens: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  };

  const DATEN = {
    menschen: {
      name: ["seiten.menschen.name", "Die Erdflotte"],
      volk: ["seiten.menschen.volk", "Menschen"],
      satz: ["seiten.menschen.satz", "Zäh, gemeinsam stark – und tagsüber im Vorteil."],
      vor: [
        ["seiten.menschen.vor1", "+12 % Dublonen am Glücksrad"],
        ["seiten.menschen.vor2", "Schwarzmarkt 8 % billiger, „Feilscher“ wirkt 1,5-fach"],
        ["seiten.menschen.vor3", "Tagsüber (6–18 Uhr) +10 % XP"],
        ["seiten.menschen.vor4", "In der Schlacht: mehr Leben, Schilde laden nach, Formation"],
      ],
      nach: [
        ["seiten.menschen.nach1", "−10 % Gewinn in der Spielothek"],
        ["seiten.menschen.nach2", "Nachts (22–6 Uhr) −10 % XP"],
        ["seiten.menschen.nach3", "−10 % Schaden am Boss"],
        ["seiten.menschen.nach4", "In der Schlacht: weniger Schaden, Spezialangriff lädt langsamer"],
      ],
      knopf: ["seiten.menschen.knopf", "Der Erdflotte beitreten"],
    },
    aliens: {
      name: ["seiten.aliens.name", "Der Schwarm"],
      volk: ["seiten.aliens.volk", "Aliens"],
      satz: ["seiten.aliens.satz", "Aggressiv, riskant – und nachts im Vorteil."],
      vor: [
        ["seiten.aliens.vor1", "+15 % Gewinn in der Spielothek"],
        ["seiten.aliens.vor2", "+15 % Schaden am Boss, Kampf-Skills wirken 1,5-fach"],
        ["seiten.aliens.vor3", "Nachts (22–6 Uhr) +20 % XP"],
        ["seiten.aliens.vor4", "In der Schlacht: viel mehr Schaden, Drohnen fliegen doppelt"],
      ],
      nach: [
        ["seiten.aliens.nach1", "−10 % Dublonen am Glücksrad"],
        ["seiten.aliens.nach2", "Schwarzmarkt 10 % teurer"],
        ["seiten.aliens.nach3", "Tagsüber (6–18 Uhr) −10 % XP"],
        ["seiten.aliens.nach4", "In der Schlacht: weniger Leben, Schilde laden nicht nach"],
      ],
      knopf: ["seiten.aliens.knopf", "Dem Schwarm beitreten"],
    },
  };
  function T(paar) { return t(paar[0], paar[1]); }

  /* ------------------------------------------------------
     WAHL-FENSTER
  ------------------------------------------------------ */
  let fenster = null;
  let waehltGerade = false;

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  function symbol(seite) {
    const s = el("span", "fh-seiten-symbol");
    /* fester Text aus dieser Datei, keine Nutzerdaten */
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SYMBOL[seite] + "</svg>";
    return s;
  }

  function liste(eintraege, klasse, zeichen) {
    const ul = el("ul", "fh-seiten-liste " + klasse);
    eintraege.forEach(function (paar) {
      const li = el("li");
      li.append(el("span", "fh-seiten-zeichen", zeichen), el("span", null, T(paar)));
      ul.appendChild(li);
    });
    return ul;
  }

  function status(text, istFehler) {
    const s = fenster && fenster.querySelector(".fh-seiten-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }

  function karte(seite) {
    const d = DATEN[seite];
    const k = el("article", "fh-seiten-karte ist-" + seite);
    k.setAttribute("aria-labelledby", "fh-seiten-" + seite + "-name");
    const kopf = el("div", "fh-seiten-kopf");
    const titel = el("div");
    titel.append(el("p", "fh-seiten-volk", T(d.volk)));
    const h = el("h3", "fh-seiten-name", T(d.name));
    h.id = "fh-seiten-" + seite + "-name";
    titel.appendChild(h);
    kopf.append(symbol(seite), titel);
    k.append(kopf, el("p", "fh-seiten-satz", T(d.satz)));
    k.append(el("p", "fh-seiten-ueber", t("seiten.vorteile", "Vorteile")), liste(d.vor, "ist-vor", "+"));
    k.append(el("p", "fh-seiten-ueber", t("seiten.nachteile", "Nachteile")), liste(d.nach, "ist-nach", "−"));

    const aktion = el("div", "fh-seiten-aktion");
    const knopf = el("button", "fh-seiten-knopf", T(d.knopf));
    knopf.type = "button";
    knopf.addEventListener("click", function () { bestaetigen(seite, aktion); });
    aktion.appendChild(knopf);
    k.appendChild(aktion);
    return k;
  }

  /* Zweiter Schritt: die Wahl ist endgueltig. */
  function bestaetigen(seite, aktion) {
    fenster.querySelectorAll(".fh-seiten-aktion").forEach(function (a) {
      if (a !== aktion) a.replaceChildren();
    });
    aktion.replaceChildren();
    const frage = el("p", "fh-seiten-frage", t("seiten.endgueltig", "Endgültig? Die Seite lässt sich danach nicht mehr wechseln."));
    const ja = el("button", "fh-seiten-knopf ist-ja", t("seiten.ja", "Ja, beitreten"));
    ja.type = "button";
    const zurueck = el("button", "fh-seiten-zurueck", t("seiten.zurueck", "Zurück"));
    zurueck.type = "button";
    ja.addEventListener("click", function () { waehlen(seite); });
    zurueck.addEventListener("click", function () { aufbauen(); });
    aktion.append(frage, ja, zurueck);
    ja.focus();
  }

  const GRUENDE = {
    "nicht-2100": ["seiten.fehler.nicht2100", "Die Wahl ist nur im Jahr 2100 möglich."],
    "schon": ["seiten.fehler.schon", "Du hast dich schon entschieden."],
    "gesperrt": ["seiten.fehler.gesperrt", "Dein Konto ist gesperrt."],
  };

  async function waehlen(seite) {
    if (waehltGerade) return;
    if (!dbDa()) { status(t("seiten.fehler.allgemein", "⚠️ Das hat nicht geklappt, versuch's nochmal."), true); return; }
    waehltGerade = true;
    status(t("seiten.laedt", "⏳ Einen Moment …"), false);
    try {
      const uid = await wheelAuthReady;
      if (!uid) throw new Error("keine-anmeldung");
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("seite_waehlen", { p_seite: seite });
      });
      if (error) throw error;
      if (data && data.ok) {
        merken(data.seite);
        schliessen();
        const text = t("seiten.willkommen." + data.seite, data.seite === "aliens" ? "Willkommen im Schwarm!" : "Willkommen in der Erdflotte!");
        if (typeof fhNotice === "function") fhNotice(text, "success");
        return;
      }
      if (data && data.grund === "schon" && data.seite) { merken(data.seite); schliessen(); return; }
      const g = data && GRUENDE[data.grund];
      status(g ? T(g) : t("seiten.fehler.allgemein", "⚠️ Das hat nicht geklappt, versuch's nochmal."), true);
    } catch (err) {
      console.warn("Seite: Wahl fehlgeschlagen:", err);
      status(t("seiten.fehler.allgemein", "⚠️ Das hat nicht geklappt, versuch's nochmal."), true);
    } finally {
      waehltGerade = false;
    }
  }

  function aufbauen() {
    if (!fenster) return;
    const innen = fenster.querySelector(".fh-seiten-innen");
    innen.replaceChildren();
    const kopf = el("header", "fh-seiten-titelblock");
    kopf.append(
      el("p", "fh-seiten-kicker", t("seiten.kicker", "Jahr 2100")),
      el("h2", "fh-seiten-titel", t("seiten.titel", "Wähle deine Seite")),
      el("p", "fh-seiten-lead", t("seiten.lead", "Die Erde ist zerbrochen. Menschen und Aliens kämpfen um das, was übrig ist. Deine Wahl gilt für immer – und verändert, was du im Spiel bekommst."))
    );
    kopf.querySelector("h2").id = "fh-seiten-titel";
    const karten = el("div", "fh-seiten-karten");
    karten.append(karte("menschen"), karte("aliens"));
    const fuss = el("footer", "fh-seiten-fuss");
    const st = el("p", "fh-seiten-status");
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    const spaeter = el("button", "fh-seiten-spaeter", t("seiten.spaeter", "Später entscheiden"));
    spaeter.type = "button";
    spaeter.addEventListener("click", function () {
      try { sessionStorage.setItem(SPAETER, "1"); } catch (e) { /* egal */ }
      schliessen();
    });
    fuss.append(st, spaeter);
    innen.append(kopf, karten, fuss);
  }

  function taste(e) { if (e.key === "Escape") { try { sessionStorage.setItem(SPAETER, "1"); } catch (x) { /* egal */ } schliessen(); } }

  function wahlZeigen() {
    if (fenster) return;
    fenster = el("div", "fh-seiten");
    fenster.id = "fh-seitenwahl";
    fenster.setAttribute("role", "dialog");
    fenster.setAttribute("aria-modal", "true");
    fenster.setAttribute("aria-labelledby", "fh-seiten-titel");
    fenster.appendChild(el("div", "fh-seiten-innen"));
    document.body.appendChild(fenster);
    aufbauen();
    document.addEventListener("keydown", taste);
    const erster = fenster.querySelector(".fh-seiten-knopf");
    if (erster) erster.focus();
  }

  function schliessen() {
    if (!fenster) return;
    document.removeEventListener("keydown", taste);
    fenster.remove();
    fenster = null;
  }

  /* Fenster zeigen, wenn alles passt: 2100, angemeldet, Stand aus der
     Datenbank da, noch keine Seite, nicht "spaeter" in dieser Sitzung,
     und kein Film laeuft gerade. */
  function pruefen() {
    if (!ist2100() || !angemeldet()) { if (!ist2100()) schliessen(); return; }
    if (window.fhVollbildAn) return;
    laden().then(function () {
      if (!geladen || meine || !ist2100()) return;
      try { if (sessionStorage.getItem(SPAETER) === "1") return; } catch (e) { /* egal */ }
      wahlZeigen();
    });
  }

  document.addEventListener("fh:epoche", pruefen);
  document.addEventListener("fh:vollbild", function (e) { if (e.detail && !e.detail.an) setTimeout(pruefen, 1500); });
  /* Erster Blick nach dem Laden der Seite (Anmeldung und Epoche brauchen
     einen Moment). */
  window.addEventListener("load", function () { setTimeout(pruefen, 2500); });

  window.fhSeite = {
    meine: function () { return meine; },
    aktiv: aktiv,
    bonus: seitenBonus,
    laden: laden,
    wahlZeigen: function () {
      try { sessionStorage.removeItem(SPAETER); } catch (e) { /* egal */ }
      if (ist2100() && !meine) wahlZeigen();
    },
    DATEN: DATEN,
  };
})();
