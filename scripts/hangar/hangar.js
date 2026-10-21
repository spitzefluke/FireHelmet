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

   PARTEIEN (Migration 57): Mit der Freigabe "schlachtParteien" zeigt
   der Hangar unter der eigenen Einheit die Schiffe der vier neuen
   Parteien - mit den eigenen Ausbaustufen, denn die gelten fuer jeden
   Typ. Gewaehlt wird ein solches Schiff erst in der Sammelphase einer
   Schlacht (schlacht.js), nicht hier.

   AUSRUESTUNG (Migration 58): Mit der Freigabe "hangarAusruestung"
   kommen unter die Einheit der Schiffs-Rang (Erfahrung aus
   Schlachten), eine Sonderwaffe und zwei Modulplaetze. Kaufen
   (hangar_teil_kaufen, zweiter Klick bestaetigt) und Anlegen
   (hangar_teil_anlegen) nur ueber die Datenbank. Waffe und Module
   sieht man am Schiff (schiffe.js).

   ERZ (Migration 61): Mit der Freigabe "gluecksmine" geht jeder Wert
   nach Stufe 5 mit Erz aus der Glücksmine weiter bis Stufe 10
   (hangar_ausbauen_erz), dazu die Schiffssysteme Panzerung und
   Geschuetze (schiff_system_ausbauen, je +4 % in der Schlacht).
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
  let ausruestung = null;    // Antwort von hangar_ausruestung (58) oder null
  let erz = null;            // Erz aus der Glücksmine (61) oder null
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
  function mineFrei() {
    return typeof window.fhFeatureSichtbar === "function" && window.fhFeatureSichtbar("gluecksmine");
  }
  function ausruestungFrei() {
    return typeof window.fhFeatureSichtbar === "function" && window.fhFeatureSichtbar("hangarAusruestung");
  }
  /* Angelegte Waffe und Module fuer das Schiffsbild. */
  function aussehen() {
    if (!ausruestung || !ausruestungFrei()) return null;
    return { waffe: ausruestung.waffe, module: [ausruestung.modul1, ausruestung.modul2].filter(Boolean) };
  }

  function schiff(id, klasse, st, aus) {
    const s = el("span", "hg-schiff " + (klasse || "") + " ist-" + HANGAR_TYPEN[id].seite);
    if (window.fhSchiffe) {
      s.appendChild(window.fhSchiffe.bild(id, HANGAR_TYPEN[id].seite, st || {}, klasse === "ist-gross" ? 420 : 132, aus || null));
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
          .select("*").eq("firebase_uid", uid).maybeSingle();
      });
      if (error) throw error;
      einheit = data || null;
      geladen = true;
      if (ausruestungFrei()) {
        const a = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc("hangar_ausruestung"); });
        ausruestung = a.error ? null : a.data;   // ohne Migration 58: nichts zeigen
      }
      if (mineFrei()) {
        const m = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc("mine_stand_holen"); });
        erz = !m.error && m.data && m.data.ok ? Number(m.data.erz) || 0 : null;   // ohne Migration 61: kein Erz
      }
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
      b.append(schiff(id, "", st, aussehen()), el("span", "hg-typ-name", typText(id, "name")), el("span", "hg-typ-rolle", typText(id, "rolle")));
      b.addEventListener("click", function () { if (id !== typId) typWaehlen(id); });
      typen.appendChild(b);
    });

    /* Einheit im Detail */
    const w = hangarWerte(typId, st, seite);
    const detail = el("div", "hg-detail ist-" + seite);
    const buehne = el("div", "hg-buehne");
    buehne.appendChild(schiff(typId, "ist-gross", st, aussehen()));
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
    if (erz != null) ziel.appendChild(systemeBox());
    if (ausruestung && ausruestungFrei()) ziel.appendChild(ausruestungBox());
    if (typeof window.fhFeatureSichtbar === "function" && window.fhFeatureSichtbar("schlachtParteien")) ziel.appendChild(parteienBox(st));
  }

  /* ------------------------------------------------------
     ERZ: SCHIFFSSYSTEME UND STUFEN 6-10 (Migration 61)
  ------------------------------------------------------ */
  function systemeBox() {
    const box = el("section", "hg-systeme");
    const kopf = el("div", "hg-systeme-kopf");
    kopf.append(el("h2", "hg-aus-titel", t("hangar.sys.titel", "Schiffssysteme")),
      el("span", "hg-erz", t("hangar.sys.erz", "{n} Erz").replace("{n}", zahl(erz))));
    box.append(kopf, el("p", "hg-aus-gruppe-text", t("hangar.sys.text", "Mit Erz aus der Glücksmine – je Stufe +4 % in jeder Sternenschlacht.")));
    const liste = el("div", "hg-systeme-liste");
    SCHIFF_SYSTEME.forEach(function (id) {
      const stufe = einheit ? Number(einheit["sys_" + id]) || 0 : 0;
      const k = el("article", "hg-system");
      k.dataset.system = id;
      k.append(el("h3", "hg-teil-name", t("hangar.sys." + id, id === "panzer" ? "Panzerung" : "Geschütze")),
        el("p", "hg-teil-text", t("hangar.sys." + id + "Text", id === "panzer" ? "+4 % Leben je Stufe" : "+4 % Schaden je Stufe")));
      const punkte = el("div", "hg-punkte ist-erz");
      for (let i = 0; i < 5; i++) punkte.appendChild(el("span", "hg-punkt ist-erz" + (i < stufe ? " ist-an" : "")));
      punkte.setAttribute("aria-label", t("hangar.stufe", "Stufe") + " " + stufe + "/5");
      const b = el("button", "hg-ausbau ist-erz");
      b.type = "button";
      if (stufe >= 5) { b.disabled = true; b.textContent = t("hangar.max", "Maximal"); }
      else {
        const preis = 1500 * Math.pow(2, stufe);
        const frage = bestaetigen && bestaetigen.wert === "sys:" + id && bestaetigen.bis > Date.now();
        b.textContent = (frage ? t("hangar.wirklich", "Wirklich kaufen?") + " " : t("hangar.ausbauen", "Ausbauen") + " · ") + zahl(preis) + " " + t("mine.erz", "Erz");
        b.classList.toggle("ist-frage", !!frage);
        b.addEventListener("click", function () { erzAusbauen("sys:" + id, "schiff_system_ausbauen", { p_system: id }); });
      }
      k.append(punkte, b);
      liste.appendChild(k);
    });
    box.appendChild(liste);
    return box;
  }

  async function erzAusbauen(schluessel, name, args) {
    if (beschaeftigt || !dbDa()) return;
    if (!bestaetigen || bestaetigen.wert !== schluessel || bestaetigen.bis < Date.now()) {
      bestaetigen = { wert: schluessel, bis: Date.now() + 5000 };
      clearTimeout(bestaetigenUhr);
      bestaetigenUhr = setTimeout(function () { bestaetigen = null; zeichnen(); }, 5100);
      zeichnen();
      return;
    }
    bestaetigen = null;
    clearTimeout(bestaetigenUhr);
    beschaeftigt = true;
    try {
      const data = await rpc(name, args);
      if (data && data.ok) {
        einheit = Object.assign({}, einheit, data.einheit);
        erz = Number(data.erz) || 0;
        if (window.fhMine) window.fhMine.setzen(erz);
        zeichnen();
        status(t("hangar.fertig", "✓ Ausgebaut!"), false);
        return;
      }
      zeichnen();
      status(fehlerText(data && data.grund), true);
    } catch (err) {
      console.warn("Hangar: Erz-Ausbau fehlgeschlagen:", err);
      zeichnen();
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  /* ------------------------------------------------------
     AUSRUESTUNG (Migration 58)
  ------------------------------------------------------ */
  function teilText(id, feld) { return t("hangar.teil." + id + "." + feld, HANGAR_TEILE[id][feld]); }
  function rangName(r) { return t("hangar.rang." + r, SCHIFF_RAENGE[r].name); }

  /* Rangabzeichen: je Rang ein Winkel, Rekrut ein Ring (lucide-Stil). */
  function rangAbzeichen(r) {
    let pfade = "";
    if (!r) pfade = '<circle cx="12" cy="12" r="5"/>';
    for (let i = 0; i < r; i++) {
      const y = 19 - i * 3.6;
      pfade += '<path d="M5 ' + y + ' l7 -4.5 l7 4.5"/>';
    }
    const s = el("span", "hg-rang-abzeichen");
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";   // feste Zahl, keine Nutzerdaten
    return s;
  }

  function ausruestungBox() {
    const a = ausruestung;
    const box = el("section", "hg-aus");
    box.setAttribute("aria-labelledby", "hg-aus-titel");
    const titel = el("h2", "hg-aus-titel", t("hangar.aus.titel", "Ausrüstung"));
    titel.id = "hg-aus-titel";
    box.appendChild(titel);

    /* Rang */
    const r = a.rang || 0;
    const naechste = SCHIFF_RAENGE[r + 1];
    const rang = el("div", "hg-rang");
    rang.dataset.rang = r;
    const kopf = el("div", "hg-rang-kopf");
    kopf.append(rangAbzeichen(r), el("div", "hg-rang-text"));
    kopf.lastChild.append(
      el("p", "hg-rang-name", rangName(r)),
      el("p", "hg-rang-bonus", r ? t("hangar.rang.bonus", "+{p} % Leben und Schaden in der Schlacht").replace("{p}", r * 2) : t("hangar.rang.start", "Sammle Erfahrung in Sternenschlachten."))
    );
    const balken = el("div", "hg-rang-balken");
    balken.setAttribute("role", "progressbar");
    balken.setAttribute("aria-valuemin", "0");
    const von = SCHIFF_RAENGE[r].xp, bis = naechste ? naechste.xp : SCHIFF_RAENGE[r].xp;
    balken.setAttribute("aria-valuemax", String(bis));
    balken.setAttribute("aria-valuenow", String(a.xp || 0));
    const fuell = el("span", "hg-rang-fuellung");
    fuell.style.width = (naechste ? Math.max(0, Math.min(100, ((a.xp || 0) - von) / (bis - von) * 100)) : 100) + "%";
    balken.appendChild(fuell);
    const zahlen = el("p", "hg-rang-zahlen",
      zahl(a.xp || 0) + " XP" + (naechste ? " · " + t("hangar.rang.naechster", "{rang} ab {xp} XP").replace("{rang}", rangName(r + 1)).replace("{xp}", zahl(naechste.xp)) : "")
      + " · " + t("hangar.rang.schlachten", "{n} Schlachten, {s} Siege").replace("{n}", a.schlachten || 0).replace("{s}", a.siege || 0));
    rang.append(kopf, balken, zahlen);
    box.appendChild(rang);

    /* Sonderwaffe und Module */
    const besitz = a.besitz || [];
    function gruppe(art, ueber, text) {
      const g = el("div", "hg-aus-gruppe");
      g.append(el("h3", "hg-aus-gruppe-titel", ueber), el("p", "hg-aus-gruppe-text", text));
      const liste = el("div", "hg-aus-liste");
      HANGAR_TEIL_REIHE[art].forEach(function (id) { liste.appendChild(teilKarte(id, besitz.indexOf(id) >= 0)); });
      g.appendChild(liste);
      return g;
    }
    box.append(
      gruppe("waffe", t("hangar.aus.waffe", "Sonderwaffe"), t("hangar.aus.waffeText", "Eine Waffe je Schiff – sichtbar am Rumpf, wirkt auf deinen Zielschuss.")),
      gruppe("modul", t("hangar.aus.module", "Module"), t("hangar.aus.moduleText", "Zwei Plätze. Gilt ab der nächsten Aufstellung einer Schlacht."))
    );
    return box;
  }

  function teilKarte(id, gekauft) {
    const T = HANGAR_TEILE[id];
    const a = ausruestung;
    const k = el("article", "hg-teil" + (gekauft ? " ist-gekauft" : ""));
    k.dataset.teil = id;
    const platz = T.art === "waffe" ? (a.waffe === id ? "waffe" : null) : a.modul1 === id ? "modul1" : a.modul2 === id ? "modul2" : null;
    if (platz) k.classList.add("ist-angelegt");
    k.append(el("h4", "hg-teil-name", teilText(id, "name")), el("p", "hg-teil-text", teilText(id, "text")));
    const knoepfe = el("div", "hg-teil-knoepfe");
    function knopf(text, fn, extra) {
      const b = el("button", "hg-teil-knopf" + (extra ? " " + extra : ""), text);
      b.type = "button";
      b.addEventListener("click", fn);
      knoepfe.appendChild(b);
      return b;
    }
    if (!gekauft) {
      const frage = bestaetigen && bestaetigen.wert === "teil:" + id && bestaetigen.bis > Date.now();
      knopf((frage ? t("hangar.wirklich", "Wirklich kaufen?") + " " : t("hangar.aus.kaufen", "Kaufen") + " · ") + zahl(T.preis),
        function () { teilKaufen(id); }, frage ? "ist-frage" : "");
    } else if (platz) {
      k.appendChild(el("p", "hg-teil-platz", platz === "waffe" ? t("hangar.aus.angelegt", "Angelegt")
        : t("hangar.aus.inPlatz", "In Platz {n}").replace("{n}", platz === "modul1" ? "1" : "2")));
      knopf(t("hangar.aus.ablegen", "Ablegen"), function () { teilAnlegen(platz, null); });
    } else if (T.art === "waffe") {
      knopf(t("hangar.aus.anlegen", "Anlegen"), function () { teilAnlegen("waffe", id); });
    } else {
      knopf(t("hangar.aus.platz", "Platz {n}").replace("{n}", "1"), function () { teilAnlegen("modul1", id); });
      knopf(t("hangar.aus.platz", "Platz {n}").replace("{n}", "2"), function () { teilAnlegen("modul2", id); });
    }
    k.appendChild(knoepfe);
    return k;
  }

  async function teilKaufen(id) {
    if (beschaeftigt || !dbDa()) return;
    const w = "teil:" + id;
    if (!bestaetigen || bestaetigen.wert !== w || bestaetigen.bis < Date.now()) {
      bestaetigen = { wert: w, bis: Date.now() + 5000 };
      clearTimeout(bestaetigenUhr);
      bestaetigenUhr = setTimeout(function () { bestaetigen = null; zeichnen(); }, 5100);
      zeichnen();
      return;
    }
    bestaetigen = null;
    clearTimeout(bestaetigenUhr);
    beschaeftigt = true;
    try {
      const data = await rpc("hangar_teil_kaufen", { p_teil: id });
      if (data && data.ok) {
        ausruestung = Object.assign({}, ausruestung, data.ausruestung);
        zeichnen();
        status(t("hangar.aus.gekauft", "✓ Gekauft: {teil}").replace("{teil}", teilText(id, "name")), false);
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
        return;
      }
      zeichnen();
      status(fehlerText(data && data.grund), true);
    } catch (err) {
      console.warn("Hangar: Kauf fehlgeschlagen:", err);
      zeichnen();
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  async function teilAnlegen(platz, id) {
    if (beschaeftigt || !dbDa()) return;
    beschaeftigt = true;
    try {
      const data = await rpc("hangar_teil_anlegen", { p_platz: platz, p_teil: id });
      if (data && data.ok) {
        ausruestung = Object.assign({}, ausruestung, data.ausruestung);
        zeichnen();
        status(id ? t("hangar.aus.angelegtOk", "✓ Angelegt – gilt ab der nächsten Aufstellung.") : t("hangar.aus.abgelegt", "Abgelegt."), false);
        return;
      }
      zeichnen();
      status(fehlerText(data && data.grund), true);
    } catch (err) {
      console.warn("Hangar: Anlegen fehlgeschlagen:", err);
      zeichnen();
      status(fehlerText(null), true);
    } finally {
      beschaeftigt = false;
    }
  }

  function parteienBox(st) {
    const box = el("section", "hg-parteien");
    box.append(
      el("h2", "hg-parteien-titel", t("hangar.parteien.titel", "Weitere Parteien")),
      el("p", "hg-parteien-text", t("hangar.parteien.text", "In einer Sternenschlacht mit Parteiwahl fliegst du auch für sie – deine Ausbauten gelten für jedes Schiff."))
    );
    const liste = el("div", "hg-parteien-liste");
    ["piraten", "maschinen", "kristall", "geister"].forEach(function (p) {
      const karte = el("article", "hg-partei");
      karte.dataset.partei = p;
      karte.append(el("h3", "hg-partei-name", schlachtParteiText(p, "name")), el("p", "hg-partei-text", schlachtParteiText(p, "text")));
      const typen = el("div", "hg-partei-typen");
      HANGAR_REIHENFOLGE[p].forEach(function (id) {
        const w = hangarWerte(id, st, p);
        const z = el("div", "hg-partei-typ");
        z.title = typText(id, "spezial") + ": " + typText(id, "spezialText");
        z.append(schiff(id, "", st), el("span", "hg-partei-typ-name", typText(id, "name") + (w.anzahl > 1 ? " ×" + w.anzahl : "")),
          el("span", "hg-partei-typ-werte", zahl(w.leben * w.anzahl) + " · " + zahl(Math.round(w.schaden * w.anzahl * 10) / 10)));
        typen.appendChild(z);
      });
      karte.appendChild(typen);
      liste.appendChild(karte);
    });
    box.appendChild(liste);
    return box;
  }

  function wertZeile(wert, name, anzeige, stufe) {
    const z = el("div", "hg-wert");
    const kopf = el("div", "hg-wert-kopf");
    kopf.append(el("span", "hg-wert-name", name), el("span", "hg-wert-zahl", anzeige));
    const mitErz = erz != null || stufe > HANGAR_MAX_STUFE;
    const max = mitErz ? HANGAR_ERZ_MAX : HANGAR_MAX_STUFE;
    const punkte = el("div", "hg-punkte" + (mitErz ? " ist-erz" : ""));
    punkte.setAttribute("aria-label", t("hangar.stufe", "Stufe") + " " + stufe + "/" + max);
    for (let i = 0; i < max; i++) punkte.appendChild(el("span", "hg-punkt" + (i < stufe ? " ist-an" : "") + (i >= HANGAR_MAX_STUFE ? " ist-erz" : "")));
    const knopf = el("button", "hg-ausbau");
    knopf.type = "button";
    if (stufe >= HANGAR_MAX_STUFE && erz != null && stufe < HANGAR_ERZ_MAX) {
      /* 61: weiter mit Erz */
      const preis = HANGAR_ERZ_PREISE[stufe - HANGAR_MAX_STUFE];
      const frage = bestaetigen && bestaetigen.wert === "erz:" + wert && bestaetigen.bis > Date.now();
      knopf.classList.add("ist-erz");
      knopf.textContent = (frage ? t("hangar.wirklich", "Wirklich kaufen?") + " " : t("hangar.ausbauen", "Ausbauen") + " · ") + zahl(preis) + " " + t("mine.erz", "Erz");
      knopf.classList.toggle("ist-frage", !!frage);
      knopf.addEventListener("click", function () { erzAusbauen("erz:" + wert, "hangar_ausbauen_erz", { p_wert: wert }); });
    } else if (stufe >= HANGAR_MAX_STUFE) {
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
    "nicht-frei": ["hangar.fehler.nichtFrei", "Die Ausrüstung ist noch nicht freigegeben."],
    "schon": ["hangar.fehler.schon", "Das hast du schon."],
    "nicht-gekauft": ["hangar.fehler.nichtGekauft", "Kauf das Teil zuerst."],
    "doppelt": ["hangar.fehler.doppelt", "Dieses Modul steckt schon im anderen Platz."],
    "falscher-platz": ["hangar.fehler.platz", "Das passt nicht in diesen Platz."],
    "zu-wenig-erz": ["hangar.fehler.erz", "Dafür reicht dein Erz nicht – ab in die Glücksmine!"],
    "erst-dublonen": ["hangar.fehler.erstDublonen", "Erst bis Stufe 5 mit Dublonen ausbauen."],
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
  window.addEventListener("fhFlagsUpdated", function () { if (seiteOffen()) laden().then(function () { if (seiteOffen()) zeichnen(); }); });
  navAnpassen();
})();
