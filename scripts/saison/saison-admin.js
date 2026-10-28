/* ======================================================
   GATEWAY -> SEITE -> SAISONS (Migration 69)
   ---------------------------------------------------
   Nachgeladen ueber fhNachladen("saisonAdmin"), wenn das Gateway
   aufgebaut wird - normale Besucher laden diese Datei nie.

   Hier stellt der Admin ein:
     - welche Saison gilt (automatisch nach Datum oder erzwungen),
     - die vier Zeitfenster,
     - das Suchspiel je Saison (Seite jedes der 17 Funde, Belohnung,
       Titel und Bonus fuer alle 17),
     - den Inhalt der 24 Tuerchen,
     - das Neujahrsgeschenk.
   Gespeichert wird alles auf einmal ueber admin_saison_speichern();
   die Datenbank prueft die Form noch einmal (saison_config_ok).

   Die Vorschau-Knoepfe (fhSaison.vorschau) wirken nur in diesem
   Browser und nur auf das Aussehen.
====================================================== */

(function () {
  "use strict";

  const SAISONS = [
    ["original", "Original"], ["halloween", "Halloween"], ["weihnachten", "Weihnachten"],
    ["neujahr", "Neujahr"], ["ostern", "Ostern"],
  ];
  const FENSTER = [
    ["halloween", "Halloween", "Kürbisjagd läuft mit."],
    ["weihnachten", "Weihnachten", "Adventskalender 1.–24.12."],
    ["neujahr", "Neujahr", "Feuerwerk um 0 Uhr, Geschenk ab dem 1. Januar."],
    ["ostern", "Ostern", "Eiersuche. Ostern wandert – mit Jahr eintragen."],
  ];
  const ARTEN = [["dublonen", "Dublonen"], ["spind", "Spind-Teil"], ["code", "Geheimcode"], ["eigen", "Eigene Belohnung"]];
  /* Muss zu app.saison_seiten() in 69-saisons.sql passen. */
  const SEITEN = ["stand", "story", "characters", "socials", "shop", "code", "wheel", "spielothek", "leaderboard",
    "race", "streamraetsel", "tournament", "hangar", "sternenschlacht", "community-boss", "support", "skill-tree",
    "gluecksmine", "rating", "login"];

  let wurzel = null;
  let daten = null;      // Arbeitskopie der Einstellung
  let lage = null;       // { saison, heute } vom Server
  let teile = [];        // spind_teile
  let suchTab = "halloween";

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  async function rpc(name, args) {
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args || {}); });
    if (error) throw error;
    return data;
  }

  function seitenName(id) {
    const a = document.querySelector('.fh-sidebar-nav [data-page="' + id + '"] .fh-nav-label');
    return a ? a.textContent.trim() : id;
  }

  /* "MM-TT" -> "TT.MM.", "JJJJ-MM-TT" -> "TT.MM.JJJJ" und zurueck. */
  function anzeigeDatum(v) {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || "");
    if (m) return m[3] + "." + m[2] + "." + m[1];
    const k = /^(\d\d)-(\d\d)$/.exec(v || "");
    return k ? k[2] + "." + k[1] + "." : "";
  }
  function speicherDatum(v) {
    const s = String(v || "").trim();
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/.exec(s);
    if (!m) return null;
    const tt = m[1].padStart(2, "0"), mm = m[2].padStart(2, "0");
    if (+mm < 1 || +mm > 12 || +tt < 1 || +tt > 31) return null;
    return m[3] ? m[3] + "-" + mm + "-" + tt : mm + "-" + tt;
  }

  function status(text, fehler) {
    const s = wurzel && wurzel.querySelector("[data-sa-status]");
    if (!s) return;
    s.textContent = text;
    s.classList.toggle("ist-fehler", !!fehler);
  }

  /* ---------- Bausteine ---------- */

  function feld(label, eingabe) {
    const l = el("label", "gw-feld-label", label);
    l.appendChild(eingabe);
    return l;
  }
  function eingabe(wert, breit, aenderung) {
    const i = el("input", "gw-feld" + (breit ? " gw-feld-breit" : ""));
    i.type = "text";
    i.value = wert == null ? "" : String(wert);
    i.addEventListener("input", function () { aenderung(i.value); });
    return i;
  }
  function auswahl(optionen, wert, aenderung) {
    const s = el("select", "gw-feld");
    optionen.forEach(function (o) {
      const opt = el("option", null, o[1]);
      opt.value = o[0];
      s.appendChild(opt);
    });
    s.value = wert;
    s.addEventListener("change", function () { aenderung(s.value); });
    return s;
  }
  function knopf(text, klasse, klick) {
    const b = el("button", "gw-live-knopf" + (klasse ? " " + klasse : ""), text);
    b.type = "button";
    b.addEventListener("click", klick);
    return b;
  }
  function abschnitt(titel) {
    return el("p", "fh-sa-adm-titel", titel);
  }

  /* ---------- Zeichnen ---------- */

  function zeichnen() {
    if (!wurzel || !daten) return;
    wurzel.replaceChildren();
    const box = el("div", "fh-sa-adm");

    /* Lage und Saison */
    const kopf = el("div", "fh-sa-adm-kopf");
    const name = (SAISONS.find(function (s) { return s[0] === lage.saison; }) || ["", lage.saison])[1];
    kopf.appendChild(el("p", "gateway-status-sub", "Gerade aktiv: " + name + " · heute " + anzeigeDatum(lage.heute)));
    kopf.appendChild(feld("Saison", auswahl([["", "Automatisch nach Datum"]].concat(SAISONS), daten.erzwungen || "", function (v) {
      daten.erzwungen = v || null;
    })));
    box.appendChild(kopf);
    box.appendChild(el("p", "gateway-status-sub", "„Automatisch“ schaltet nach den Zeitfenstern unten um. Eine feste Wahl gilt sofort für alle – auch außerhalb des Fensters (Türchen öffnen sich trotzdem nur im Dezember am eigenen Tag)."));

    /* Vorschau */
    const vor = el("div", "fh-sa-adm-zeile");
    vor.appendChild(el("span", "gw-story-info", "Vorschau nur hier:"));
    const vorschau = window.fhSaison && window.fhSaison.vorschauAktiv ? window.fhSaison.vorschauAktiv() : null;
    SAISONS.forEach(function (s) {
      vor.appendChild(knopf(s[1], vorschau === s[0] ? "ist-aktiv" : "", function () {
        if (window.fhSaison) window.fhSaison.vorschau(s[0]);
        zeichnen();
      }));
    });
    vor.appendChild(knopf("Echt", vorschau ? "" : "ist-aktiv", function () {
      if (window.fhSaison) window.fhSaison.vorschau(null);
      zeichnen();
    }));
    box.appendChild(vor);

    /* Zeitfenster */
    box.appendChild(abschnitt("Zeitfenster"));
    box.appendChild(el("p", "gateway-status-sub", "TT.MM. wiederholt sich jedes Jahr (auch über Silvester), TT.MM.JJJJ gilt genau einmal."));
    const fenster = el("div", "fh-sa-adm-gitter");
    FENSTER.forEach(function (f) {
      const w = daten.fenster[f[0]];
      const karte = el("div", "fh-sa-adm-karte" + (lage.saison === f[0] ? " ist-aktiv" : ""));
      const k = el("div", "fh-sa-adm-zeile");
      k.appendChild(el("strong", null, f[1]));
      k.appendChild(el("span", "fh-sa-adm-marke", lage.saison === f[0] ? "Aktiv" : "Geplant"));
      karte.appendChild(k);
      const z = el("div", "fh-sa-adm-zeile");
      /* Getipptes, aber noch nicht Gespeichertes bleibt beim Neuzeichnen stehen. */
      z.appendChild(feld("Von", eingabe(w.vonText !== undefined ? w.vonText : anzeigeDatum(w.von), false, function (v) { w.vonText = v; })));
      z.appendChild(feld("Bis", eingabe(w.bisText !== undefined ? w.bisText : anzeigeDatum(w.bis), false, function (v) { w.bisText = v; })));
      karte.appendChild(z);
      karte.appendChild(el("p", "gw-story-info", f[2]));
      fenster.appendChild(karte);
    });
    box.appendChild(fenster);

    /* Suchspiel */
    const sk = el("div", "fh-sa-adm-zeile");
    sk.appendChild(abschnitt("Suchspiel"));
    [["halloween", "Kürbisse"], ["ostern", "Eier"]].forEach(function (t) {
      sk.appendChild(knopf(t[1], suchTab === t[0] ? "ist-aktiv" : "", function () { suchTab = t[0]; zeichnen(); }));
    });
    box.appendChild(sk);
    const su = daten.suche[suchTab];
    const sf = el("div", "fh-sa-adm-zeile");
    sf.appendChild(feld("Belohnung je Fund (Dublonen)", eingabe(su.belohnung, false, function (v) { su.belohnung = Number(v); })));
    sf.appendChild(feld("Titel für alle 17", eingabe(su.titel, false, function (v) { su.titel = v; })));
    sf.appendChild(feld("Bonus für alle 17 (Dublonen)", eingabe(su.bonus, false, function (v) { su.bonus = Number(v); })));
    box.appendChild(sf);
    box.appendChild(el("p", "gateway-status-sub", "Jeder Fund liegt auf der gewählten Seite an einer festen Stelle, die sich jedes Jahr ändert. Mehrere Funde auf einer Seite sind erlaubt."));
    const liste = el("div", "fh-sa-adm-liste");
    su.seiten.forEach(function (p, i) {
      const z = el("div", "fh-sa-adm-reihe");
      z.appendChild(el("span", "fh-sa-adm-nr", String(i + 1)));
      z.appendChild(auswahl(SEITEN.map(function (s) { return [s, seitenName(s)]; }), p, function (v) { su.seiten[i] = v; }));
      liste.appendChild(z);
    });
    box.appendChild(liste);

    /* Adventskalender */
    box.appendChild(abschnitt("Adventskalender"));
    box.appendChild(el("p", "gateway-status-sub", "Öffnen nur am jeweiligen Tag, verpasste Türchen verfallen. Einen Geheimcode hier zusätzlich unter Codes anlegen – das Türchen zeigt ihn nur an. Bei „Eigene Belohnung“ steht der Text so im Türchen; die Dublonen daneben gibt es dazu."));
    const adv = el("div", "fh-sa-adm-liste");
    daten.advent.forEach(function (t, i) {
      const z = el("div", "fh-sa-adm-reihe ist-advent");
      z.appendChild(el("span", "fh-sa-adm-nr", String(i + 1)));
      z.appendChild(auswahl(ARTEN, t.art, function (v) {
        daten.advent[i] = v === "spind" ? { art: v, wert: teile.length ? teile[0].teil_id : "" }
          : v === "dublonen" ? { art: v, wert: 50 } : { art: v, wert: v === "code" ? "" : "Sonderbelohnung" };
        zeichnen();
      }));
      if (t.art === "spind") {
        z.appendChild(auswahl(teile.map(function (s) {
          const schl = (s.art === "banner" ? "spind.banner." : "spind.farbe.") + s.teil_id;
          const name = typeof window.t === "function" ? window.t(schl, s.teil_id) : s.teil_id;
          return [s.teil_id, (s.art === "banner" ? "Banner " : "Namensfarbe ") + (name === schl ? s.teil_id : name)];
        }), t.wert, function (v) { t.wert = v; }));
      } else {
        z.appendChild(eingabe(t.wert, true, function (v) { t.wert = t.art === "dublonen" ? Number(v) : v; }));
      }
      if (t.art === "eigen") {
        const d = eingabe(t.dublonen || 0, false, function (v) { t.dublonen = Number(v); });
        d.classList.add("fh-sa-adm-zahl");
        d.title = "Dublonen dazu";
        z.appendChild(d);
      }
      adv.appendChild(z);
    });
    box.appendChild(adv);

    /* Neujahr */
    box.appendChild(abschnitt("Neujahr"));
    box.appendChild(feld("Neujahrsgeschenk (Dublonen)", eingabe(daten.neujahr.geschenk, false, function (v) { daten.neujahr.geschenk = Number(v); })));

    const fuss = el("div", "fh-sa-adm-zeile");
    fuss.appendChild(knopf("Speichern", "ist-alle", speichern));
    const st = el("p", "gw-live-status");
    st.setAttribute("data-sa-status", "");
    fuss.appendChild(st);
    box.appendChild(fuss);
    wurzel.appendChild(box);
  }

  /* ---------- Speichern ---------- */

  function bereinigt() {
    const d = JSON.parse(JSON.stringify(daten));
    for (const k of Object.keys(d.fenster)) {
      const w = d.fenster[k];
      const name = (FENSTER.find(function (f) { return f[0] === k; }) || [k, k])[1];
      const von = w.vonText !== undefined ? speicherDatum(w.vonText) : w.von;
      const bis = w.bisText !== undefined ? speicherDatum(w.bisText) : w.bis;
      if (!von || !bis) throw new Error("Datum bei " + name + " unlesbar – bitte TT.MM. oder TT.MM.JJJJ.");
      if (von.length !== bis.length) throw new Error("Bei " + name + " beide Daten mit oder beide ohne Jahr.");
      d.fenster[k] = { von: von, bis: bis };
    }
    for (const k of ["halloween", "ostern"]) {
      const s = d.suche[k];
      if (!Number.isInteger(s.belohnung) || s.belohnung < 0 || s.belohnung > 1000) throw new Error("Belohnung je Fund: 0 bis 1000.");
      if (!Number.isInteger(s.bonus) || s.bonus < 0 || s.bonus > 10000) throw new Error("Bonus: 0 bis 10000.");
      s.titel = String(s.titel || "").trim();
      if (!s.titel || s.titel.length > 32) throw new Error("Titel: 1 bis 32 Zeichen.");
    }
    d.advent.forEach(function (t, i) {
      if (t.art === "dublonen" && (!Number.isInteger(t.wert) || t.wert < 1 || t.wert > 5000)) throw new Error("Türchen " + (i + 1) + ": Dublonen 1 bis 5000.");
      if (t.art === "code" && !/^[A-Za-z0-9_-]{2,40}$/.test(String(t.wert))) throw new Error("Türchen " + (i + 1) + ": Code nur aus Buchstaben, Ziffern, - und _ (2–40).");
      if (t.art === "eigen") {
        t.wert = String(t.wert || "").trim();
        if (!t.wert || t.wert.length > 80) throw new Error("Türchen " + (i + 1) + ": Text 1 bis 80 Zeichen.");
        if (!Number.isInteger(t.dublonen || 0) || (t.dublonen || 0) < 0 || t.dublonen > 5000) throw new Error("Türchen " + (i + 1) + ": Dublonen dazu 0 bis 5000.");
        t.dublonen = t.dublonen || 0;
      }
    });
    if (!Number.isInteger(d.neujahr.geschenk) || d.neujahr.geschenk < 0 || d.neujahr.geschenk > 5000) throw new Error("Neujahrsgeschenk: 0 bis 5000.");
    return d;
  }

  async function speichern() {
    let d;
    try { d = bereinigt(); } catch (err) { status(err.message, true); return; }
    status("Speichere …");
    try {
      const r = await rpc("admin_saison_speichern", { p_daten: d });
      if (!r || !r.ok) { status("Die Datenbank hat die Einstellung abgelehnt (" + ((r && r.grund) || "?") + ").", true); return; }
      daten = d;
      lage.saison = r.saison;
      if (window.fhSaison) window.fhSaison.laden();
      zeichnen();
      status("✓ Saisons gespeichert.");
    } catch (err) {
      console.error("Saisons speichern:", err);
      status("Fehlgeschlagen: " + ((err && err.message) || err), true);
    }
  }

  async function montieren(ziel) {
    wurzel = ziel;
    if (!wurzel) return;
    wurzel.replaceChildren(el("p", "gateway-status-sub", "Lade Saisons …"));
    try {
      const r = await rpc("admin_saison_lesen");
      daten = r.daten;
      lage = { saison: r.saison, heute: r.heute };
      const { data } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("spind_teile").select("teil_id, art, ordnung").order("art").order("ordnung");
      });
      teile = data || [];
      zeichnen();
    } catch (err) {
      console.error("Saisons laden:", err);
      wurzel.replaceChildren(el("p", "gateway-status-sub", "Saisons ließen sich nicht laden – ist Migration 69 eingespielt?"));
    }
  }

  window.fhSaisonAdmin = { montieren: montieren };
})();
