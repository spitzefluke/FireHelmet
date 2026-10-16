/* ======================================================
   HANGAR (Migration 48)
   ---------------------------------------------------
   Seite #hangar, nur im Jahr 2100 in der Navigation. Wer eine Seite
   gewaehlt hat (seiten.js), sucht hier den Typ seiner Einheit aus und
   ruestet Leben, Schaden und Spezial mit Dublonen auf.

   Gekauft wird nur ueber die Datenbank (hangar_ausbauen): sie prueft
   Seite, Epoche, Stufe und Kontostand und zieht die Dublonen ab. Ein
   Ausbau braucht einen zweiten Klick - die Preise sind hoch.

   Die Zahlen (Grundwerte, Preise) stehen in hangar-data.js.
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function ist2100() { return !!(window.fhEpoche && window.fhEpoche.jahr() === 2100); }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }
  function meineSeite() { return window.fhSeite ? window.fhSeite.meine() : null; }
  function zahl(n) { return Number(n || 0).toLocaleString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"); }

  let einheit = null;        // { typ, stufe_leben, stufe_schaden, stufe_spezial } oder null
  let geladen = false;
  let beschaeftigt = false;
  let bestaetigen = null;    // { wert, bis }
  let bestaetigenUhr = null;

  function typText(id, feld) { return t("hangar.typ." + id + "." + feld, HANGAR_TYPEN[id][feld]); }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Bild des Schiffs mit sichtbarem Ausbau (scripts/hangar/schiffe.js:
     Panzerplatten, Geschuetze/Dornen, Aura). Ohne schiffe.js der
     einfache Umriss aus hangar-data.js. */
  function schiff(id, klasse, st) {
    const s = el("span", "hg-schiff " + (klasse || "") + " ist-" + HANGAR_TYPEN[id].seite);
    if (window.fhSchiffe) {
      s.appendChild(window.fhSchiffe.bild(id, HANGAR_TYPEN[id].seite, st || {}, klasse === "ist-gross" ? 420 : 132));
    } else {
      /* fester Text aus hangar-data.js, keine Nutzerdaten */
      s.innerHTML = '<svg viewBox="-130 -80 260 160" aria-hidden="true">' + HANGAR_TYPEN[id].form + "</svg>";
    }
    return s;
  }

  function stufen() {
    return {
      leben: einheit ? einheit.stufe_leben : 0,
      schaden: einheit ? einheit.stufe_schaden : 0,
      spezial: einheit ? einheit.stufe_spezial : 0,
    };
  }

  /* ------------------------------------------------------
     LADEN
  ------------------------------------------------------ */
  async function laden() {
    if (!dbDa() || typeof wheelAuthReady === "undefined") return;
    try {
      const uid = await wheelAuthReady;
      if (!uid) return;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("hangar_einheiten")
          .select("typ, stufe_leben, stufe_schaden, stufe_spezial").eq("firebase_uid", uid).maybeSingle();
      });
      if (error) throw error;
      einheit = data || null;
      geladen = true;
    } catch (err) {
      console.warn("Hangar: Laden fehlgeschlagen:", err);
    }
  }

  /* ------------------------------------------------------
     ANZEIGE
  ------------------------------------------------------ */
  function status(text, istFehler) {
    const s = document.getElementById("hangar-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }

  function hinweis(ziel, titel, text, knopf) {
    const box = el("div", "hg-hinweis");
    box.append(el("h2", "hg-hinweis-titel", titel), el("p", "hg-hinweis-text", text));
    if (knopf) box.appendChild(knopf);
    ziel.appendChild(box);
  }

  function zeichnen() {
    const ziel = document.getElementById("hangar-inhalt");
    if (!ziel) return;
    ziel.replaceChildren();

    if (!ist2100()) {
      hinweis(ziel, t("hangar.zu.titel", "Der Hangar ist geschlossen"), t("hangar.zu.text", "Er öffnet im Jahr 2100."));
      return;
    }
    if (!angemeldet()) {
      hinweis(ziel, t("hangar.anmelden.titel", "Erst anmelden"), t("hangar.anmelden.text", "Melde dich an und wähle eine Seite, dann bekommst du hier deine Einheit."));
      return;
    }
    const seite = meineSeite();
    if (!seite) {
      const k = el("button", "hg-knopf", t("hangar.seite.knopf", "Seite wählen"));
      k.type = "button";
      k.addEventListener("click", function () { if (window.fhSeite) window.fhSeite.wahlZeigen(); });
      hinweis(ziel, t("hangar.seite.titel", "Wähle zuerst deine Seite"), t("hangar.seite.text", "Menschen oder Aliens – erst dann bekommst du eine Einheit."), k);
      return;
    }

    const typId = einheit && HANGAR_TYPEN[einheit.typ] && HANGAR_TYPEN[einheit.typ].seite === seite
      ? einheit.typ : HANGAR_REIHENFOLGE[seite][0];

    /* Typen */
    const typen = el("div", "hg-typen");
    typen.setAttribute("role", "radiogroup");
    typen.setAttribute("aria-label", t("hangar.typen", "Einheitentyp"));
    const st = stufen();
    HANGAR_REIHENFOLGE[seite].forEach(function (id) {
      const b = el("button", "hg-typ" + (id === typId ? " ist-aktiv" : ""));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", id === typId ? "true" : "false");
      b.append(schiff(id, "", st), el("span", "hg-typ-name", typText(id, "name")), el("span", "hg-typ-rolle", typText(id, "rolle")));
      b.addEventListener("click", function () { if (id !== typId) typWaehlen(id); });
      typen.appendChild(b);
    });

    /* Einheit im Detail */
    const w = hangarWerte(typId, st, seite);
    const detail = el("div", "hg-detail ist-" + seite);
    const buehne = el("div", "hg-buehne");
    buehne.appendChild(schiff(typId, "ist-gross", st));
    if (w.anzahl > 1) buehne.appendChild(el("span", "hg-anzahl", "×" + w.anzahl));
    const info = el("div", "hg-info");
    info.append(
      el("p", "hg-kicker", seite === "aliens" ? t("seiten.aliens.name", "Der Schwarm") : t("seiten.menschen.name", "Die Erdflotte")),
      el("h2", "hg-name", typText(typId, "name")),
      el("p", "hg-rolle", typText(typId, "rolle"))
    );

    const werte = el("div", "hg-werte");
    [
      ["leben", t("hangar.wert.leben", "Leben"), zahl(w.leben)],
      ["schaden", t("hangar.wert.schaden", "Schaden je Sekunde"), zahl(w.schaden)],
      ["spezial", typText(typId, "spezial"), Math.round(w.spezial * 100) + " %"],
    ].forEach(function (z) { werte.appendChild(wertZeile(z[0], z[1], z[2], st[z[0]])); });

    const spezial = el("p", "hg-spezial");
    spezial.append(el("strong", null, typText(typId, "spezial") + ": "), document.createTextNode(typText(typId, "spezialText")));

    info.append(werte, spezial);
    detail.append(buehne, info);

    const st2 = el("p", "hg-status");
    st2.id = "hangar-status";
    st2.setAttribute("role", "status");
    st2.setAttribute("aria-live", "polite");

    ziel.append(typen, detail, st2);
  }

  function wertZeile(wert, name, anzeige, stufe) {
    const z = el("div", "hg-wert");
    const kopf = el("div", "hg-wert-kopf");
    kopf.append(el("span", "hg-wert-name", name), el("span", "hg-wert-zahl", anzeige));
    const punkte = el("div", "hg-punkte");
    punkte.setAttribute("aria-label", t("hangar.stufe", "Stufe") + " " + stufe + "/" + HANGAR_MAX_STUFE);
    for (let i = 0; i < HANGAR_MAX_STUFE; i++) punkte.appendChild(el("span", "hg-punkt" + (i < stufe ? " ist-an" : "")));
    const knopf = el("button", "hg-ausbau");
    knopf.type = "button";
    if (stufe >= HANGAR_MAX_STUFE) {
      knopf.disabled = true;
      knopf.textContent = t("hangar.max", "Maximal");
    } else {
      const preis = HANGAR_PREISE[stufe];
      const frage = bestaetigen && bestaetigen.wert === wert && bestaetigen.bis > Date.now();
      knopf.textContent = (frage ? t("hangar.wirklich", "Wirklich kaufen?") + " " : t("hangar.ausbauen", "Ausbauen") + " · ") + zahl(preis);
      knopf.classList.toggle("ist-frage", !!frage);
      knopf.addEventListener("click", function () { ausbauen(wert); });
    }
    z.append(kopf, punkte, knopf);
    return z;
  }

  /* ------------------------------------------------------
     AKTIONEN
  ------------------------------------------------------ */
  const GRUENDE = {
    "nicht-2100": ["hangar.fehler.nicht2100", "Der Hangar ist nur im Jahr 2100 offen."],
    "keine-seite": ["hangar.fehler.seite", "Wähle zuerst deine Seite."],
    "falscher-typ": ["hangar.fehler.typ", "Dieser Typ gehört nicht zu deiner Seite."],
    "zu-wenig": ["hangar.fehler.wenig", "Dafür reichen deine Dublonen nicht."],
    "max": ["hangar.fehler.max", "Dieser Wert ist schon ganz ausgebaut."],
    "gesperrt": ["hangar.fehler.gesperrt", "Dein Konto ist gesperrt."],
    "schlacht": ["hangar.fehler.schlacht", "Während der Sternenschlacht lässt sich der Typ nicht wechseln."],
  };
  function fehlerText(grund) {
    const g = GRUENDE[grund];
    return g ? t(g[0], g[1]) : t("hangar.fehler.allgemein", "⚠️ Das hat nicht geklappt, versuch's nochmal.");
  }

  async function rpc(name, args) {
    const uid = await wheelAuthReady;
    if (!uid) throw new Error("keine-anmeldung");
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args); });
    if (error) throw error;
    return data;
  }

  async function typWaehlen(id) {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const data = await rpc("hangar_typ_waehlen", { p_typ: id });
      if (data && data.ok) { einheit = data.einheit; zeichnen(); return; }
      zeichnen();
      status(fehlerText(data && data.grund), true);
    } catch (err) {
      console.warn("Hangar: Typ waehlen fehlgeschlagen:", err);
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  async function ausbauen(wert) {
    if (beschaeftigt || !dbDa()) return;
    /* Erster Klick fragt nach, der zweite (binnen 5 s) kauft. */
    if (!bestaetigen || bestaetigen.wert !== wert || bestaetigen.bis < Date.now()) {
      bestaetigen = { wert: wert, bis: Date.now() + 5000 };
      clearTimeout(bestaetigenUhr);
      bestaetigenUhr = setTimeout(function () { bestaetigen = null; zeichnen(); }, 5100);
      zeichnen();
      return;
    }
    bestaetigen = null;
    clearTimeout(bestaetigenUhr);
    beschaeftigt = true;
    status(t("hangar.laedt", "⏳ Wird ausgebaut …"), false);
    try {
      const data = await rpc("hangar_ausbauen", { p_wert: wert });
      if (data && data.ok) {
        einheit = data.einheit;
        zeichnen();
        status(t("hangar.fertig", "✓ Ausgebaut!"), false);
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
        return;
      }
      zeichnen();
      status(fehlerText(data && data.grund), true);
    } catch (err) {
      console.warn("Hangar: Ausbau fehlgeschlagen:", err);
      zeichnen();
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  /* ------------------------------------------------------
     SEITE UND NAVIGATION
  ------------------------------------------------------ */
  function navAnpassen() {
    document.querySelectorAll('[data-page="hangar"]').forEach(function (a) {
      if (a.closest("#hangar")) return;
      a.classList.toggle("fh-flag-aus", !ist2100());
    });
  }

  function seiteOffen() {
    const s = document.getElementById("hangar");
    return !!(s && s.classList.contains("active-page"));
  }

  /* Musik: die Schlachtmusik (schlacht-klang.js) laeuft auch im Hangar,
     ruhig (ohne Spannung). Ein/Aus gilt fuer Hangar und Schlacht. */
  const SVG_TON = function (pfade) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";
  };
  /* lucide (ISC): volume-2, volume-x */
  const LAUTSPRECHER = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
  const TON_AN = SVG_TON(LAUTSPRECHER + '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>');
  const TON_AUS = SVG_TON(LAUTSPRECHER + '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>');
  function klang() { return window.fhSchlachtKlang || null; }

  function tonKnopf() {
    const kopf = document.querySelector("#hangar .hg-kopf");
    if (!kopf || !klang()) return;
    let k = document.getElementById("hangar-ton");
    if (!k) {
      k = el("button", "hg-ton");
      k.type = "button";
      k.id = "hangar-ton";
      k.addEventListener("click", function () { klang().setzeAn(!klang().istAn()); tonKnopf(); });
      kopf.appendChild(k);
    }
    const an = klang().istAn();
    k.innerHTML = an ? TON_AN : TON_AUS;   // festes SVG
    k.setAttribute("aria-pressed", an ? "true" : "false");
    k.setAttribute("aria-label", an ? t("schlacht.tonAus", "Ton ausschalten") : t("schlacht.tonAn", "Ton einschalten"));
    k.title = k.getAttribute("aria-label");
  }

  window.updateHangarPage = function (pageID) {
    if (pageID !== "hangar") {
      if (klang()) klang().stop("hangar");
      return;
    }
    if (klang() && ist2100()) { klang().start("hangar"); klang().spannung(0); }
    tonKnopf();
    zeichnen();
    Promise.resolve(window.fhSeite ? window.fhSeite.laden() : null)
      .then(laden)
      .then(function () { if (seiteOffen()) zeichnen(); });
  };

  document.addEventListener("fh:epoche", function () { navAnpassen(); if (seiteOffen()) zeichnen(); });
  document.addEventListener("fh:seite", function () { if (seiteOffen()) window.updateHangarPage("hangar"); });
  navAnpassen();
})();
