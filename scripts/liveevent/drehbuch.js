/* ======================================================
   DREHBUCH FÜR LIVE-EVENTS (Admin-Bereich, Migrationen 65 und 66)
   ---------------------------------------------------
   Ein ganzes Event vorab bauen: Text → Disco → währenddessen Text
   → Konfetti → … Jeder Schritt hat einen Modus:

     automatisch   läuft, wartet „sek“ Sekunden, dann kommt der
                   nächste Schritt von allein (0 s = gleichzeitig)
     von Hand      läuft, dann wartet das Drehbuch auf „Weiter“

   Schritt-Arten (65): Text (Banderole für alle), Story (auch Disco),
   Story beenden (Disco/Schatzregen ausklingen), Effekt
   (Konfetti/Blitz/Sound), Pause.
   Dazu seit 66: Freigabe und Seite an/aus, Event starten/beenden,
   Abstimmung, Live-Bühne, Epoche, Geschenke an alle (Dublonen,
   Skillpunkte, Pass-XP, Diamanten, Avatar, Titel), Sternenschlacht
   und Boss-Mutterschiff starten, Schlacht beenden.

   WICHTIG: Abgespielt wird im Browser des Admins. Er sendet jeden
   Schritt über genau die Wege, die auch die Einzelknöpfe benutzen
   (liveSend, gwStoryStart, die admin_*-RPCs, patchSupabaseSiteConfig)
   – nur ohne deren Rückfragen, die gibt es einmal beim Start. Der
   Tab muss also offen bleiben, solange automatische Schritte laufen.
   Die Besucher-Seite und ihre Rechte ändern sich nicht.

   Alle Texte kommen per textContent ins DOM - nie als Markup.
   Geladen wird die Datei erst bei Bedarf (fhNachladen("drehbuch")),
   eingehängt von admin-gateway.js über gwDrehbuchStarten().
====================================================== */

(function () {
  "use strict";

  const ARTEN = {
    text: "Text", story: "Story", story_ende: "Story beenden", effekt: "Effekt", pause: "Pause",
    buehne: "Live-Bühne an/aus", epoche: "Epoche umschalten",
    event_start: "Event starten", abstimmung: "Abstimmung", event_ende: "Event beenden",
    freigabe: "Freigabe an/aus", seite: "Seite an/aus",
    geschenk: "Geschenk an alle",
    schlacht: "Sternenschlacht starten", schlacht_ende: "Sternenschlacht beenden"
  };
  /* Reihenfolge und Gruppen im Auswahlfeld */
  const GRUPPEN = [
    ["Bühne", ["text", "effekt", "pause", "buehne", "epoche"]],
    ["Storys", ["story", "story_ende"]],
    ["Event", ["event_start", "abstimmung", "event_ende"]],
    ["Freischalten", ["freigabe", "seite"]],
    ["Geschenke", ["geschenk"]],
    ["Sternenschlacht", ["schlacht", "schlacht_ende"]]
  ];
  const EFFEKTE = { konfetti: "Konfetti", blitz: "Blitz", sound: "Sound" };
  const GABEN = { dublonen: "Dublonen", skillpunkte: "Skillpunkte", pass_xp: "Pass-XP", diamanten: "Diamanten", avatar: "Avatar", titel: "Titel" };
  const GABE_GRENZE = { dublonen: 5000, skillpunkte: 10, pass_xp: 5000, diamanten: 10000 };
  const TEMPO = [[5, "Schnell (Runde ≈ 5 min)"], [10, "Normal (Runde ≈ 10 min)"], [20, "Langsam (Runde ≈ 20 min)"]];
  const SAMMELN = [[60, "Sammeln 1 min"], [90, "Sammeln 1,5 min"], [180, "Sammeln 3 min"], [300, "Sammeln 5 min"]];
  const STAERKE = [[2, "Boss leicht"], [3, "Boss normal"], [5, "Boss schwer"], [8, "Boss Albtraum"]];
  const ABST_DAUER = [[20, "20 s"], [30, "30 s"], [60, "60 s"], [120, "2 min"], [300, "5 min"]];
  const JAHRE = [["2026", "Jahr 2026 (normal)"], ["1720", "Jahr 1720 (Pergament)"], ["2100", "Jahr 2100 (All)"]];
  const FARBE_ART = {
    text: "papier", story_ende: "rot", effekt: "kalt", pause: "wasser",
    buehne: "neon", epoche: "kalt", event_start: "gold", abstimmung: "papier", event_ende: "rot",
    freigabe: "violett", seite: "violett", geschenk: "gold", schlacht: "neon", schlacht_ende: "rot"
  };
  /* Schritte, die etwas dauerhaft für alle ändern - beim Start eigens genannt */
  const DAUERHAFT = ["freigabe", "seite", "epoche", "geschenk"];
  const MAX_SCHRITTE = 60;

  let plaene = [];
  let gewaehlt = null;   // plan_id
  let wurzel = null;
  let bearbeite = -1;    // Index des Schritts, der gerade im Formular steht
  let einfuegen = -1;    // neuer Schritt kommt hinter diesen Index (-1 = ans Ende)

  /* Abspiel-Zustand lebt im Modul, damit ein Neuzeichnen des
     Admin-Bereichs das laufende Drehbuch nicht anhält. */
  const lauf = { aktiv: false, pausiert: false, wartet: false, naechster: 0, uhr: null, ticker: null, bis: 0, rest: 0, fehler: "" };

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  function status(text, fehler) {
    const s = document.getElementById("gw-db-status");
    if (!s) return;
    s.textContent = text;
    s.classList.toggle("ist-fehler", !!fehler);
  }
  function plan() { return plaene.find((p) => p.plan_id === gewaehlt) || null; }
  function storyName(id) { return typeof gwStoryName === "function" ? gwStoryName(id) : id; }
  function storyListe() {
    return (typeof GW_STORYS !== "undefined" ? GW_STORYS : []).filter((s) => s[0] !== "ende");
  }
  function flagListe() {
    return typeof GATEWAY_FEATURE_FLAGS !== "undefined" ? GATEWAY_FEATURE_FLAGS.map((f) => [f.key, f.label]) : [];
  }
  function flagName(key) {
    const f = flagListe().find((x) => x[0] === key);
    return f ? f[1] : key;
  }
  function seitenListe() {
    return typeof gwSeitenListe === "function" ? gwSeitenListe().map((s) => [s.id, s.name]) : [];
  }
  function seitenName(id) {
    const s = seitenListe().find((x) => x[0] === id);
    return s ? s[1] : id;
  }
  function ortListe() {
    const o = window.fhSchlachtOrte;
    return o && Array.isArray(o.ORTE) ? o.ORTE.map((id) => [id, o.name(id)]) : [];
  }
  function ortName(id) { return window.fhSchlachtOrte ? window.fhSchlachtOrte.name(id) : id; }
  function parteiListe() {
    const reihe = typeof SCHLACHT_PARTEI_REIHE !== "undefined" ? SCHLACHT_PARTEI_REIHE : ["menschen", "aliens"];
    return reihe.map((p) => [p, parteiName(p)]);
  }
  function parteiName(p) { return typeof schlachtParteiText === "function" ? schlachtParteiText(p, "name") : p; }
  function titelStile() {
    return typeof GW_TITEL_STILE !== "undefined" ? GW_TITEL_STILE : [["regenbogen", "Regenbogen"], ["gold", "Gold"]];
  }
  function flagAn(key) {
    return !!(typeof siteConfig !== "undefined" && siteConfig.featureFlags && siteConfig.featureFlags[key] === true);
  }
  function zahl(wert) { return Number(wert).toLocaleString("de-DE"); }

  /* Jeder Datenbankzugriff mit dem Kaltstart-Schutz (supabase-client.js). */
  async function rpc(name, args) {
    const ruf = () => supabaseClient.rpc(name, args || {});
    const { data, error } = typeof withSupabaseRlsColdStartRetry === "function" ? await withSupabaseRlsColdStartRetry(ruf) : await ruf();
    if (error) throw error;
    return data;
  }
  async function tabelle(bauen) {
    const { data, error } = typeof withSupabaseRlsColdStartRetry === "function" ? await withSupabaseRlsColdStartRetry(bauen) : await bauen();
    if (error) throw error;
    return data;
  }

  /* ------------------------------------------------------
     LADEN / SPEICHERN
  ------------------------------------------------------ */
  async function laden() {
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;
    try {
      const data = await tabelle(() => supabaseClient.from("event_drehbuecher").select("plan_id, name, schritte, schritt").order("name"));
      plaene = Array.isArray(data) ? data : [];
    } catch (err) {
      plaene = [];
      zeichnen();
      status("Drehbücher nicht lesbar – ist Migration 65 eingespielt?", true);
      return;
    }
    if (!plan()) gewaehlt = plaene.length ? plaene[0].plan_id : null;
    zeichnen();
  }

  async function speichern(felder, meldung) {
    const p = plan();
    if (!p) return false;
    try {
      await tabelle(() => supabaseClient.from("event_drehbuecher")
        .update(Object.assign({ geaendert_am: new Date().toISOString() }, felder)).eq("plan_id", p.plan_id));
      Object.assign(p, felder);
      zeichnen();
      if (meldung) status(meldung, false);
      return true;
    } catch (err) {
      const m = String((err && err.message) || err);
      status(/drehbuch_schritte_form/.test(m)
        ? "Die Datenbank kennt diese Schritt-Art noch nicht – ist Migration 66 eingespielt?"
        : "Speichern fehlgeschlagen: " + m, true);
      return false;
    }
  }

  /* ------------------------------------------------------
     BESCHREIBUNG EINES SCHRITTS
  ------------------------------------------------------ */
  function kurz(text, n) { return text.length > n ? text.slice(0, n - 3) + "…" : text; }
  function anAus(an) { return an ? "an" : "aus"; }

  function geschenkText(s) {
    if (s.gabe === "avatar") return "Avatar „" + s.avatar + "“";
    if (s.gabe === "titel") return "Titel „" + s.titel + "“";
    if (s.gabe === "skillpunkte") return s.wert + (s.wert === 1 ? " Skillpunkt" : " Skillpunkte");
    return zahl(s.wert) + " " + (GABEN[s.gabe] || s.gabe);
  }

  function titel(s) {
    switch (s.art) {
      case "text": return "Text: „" + kurz(s.text, 60) + "“";
      case "story": return "Story: " + storyName(s.story);
      case "effekt": return "Effekt: " + (EFFEKTE[s.effekt] || s.effekt);
      case "buehne": return "Live-Bühne " + anAus(s.an);
      case "epoche": return "Epoche: Jahr " + s.jahr;
      case "event_start": return "Event starten: „" + kurz(s.name, 40) + "“ (Countdown " + s.countdown + " s)";
      case "abstimmung": return "Abstimmung: „" + kurz(s.frage, 50) + "“ – " + s.a + " / " + s.b;
      case "freigabe": return "Freigabe „" + flagName(s.flag) + "“ " + anAus(s.an);
      case "seite": return "Seite „" + seitenName(s.seite) + "“ " + anAus(s.an);
      case "geschenk": return "Geschenk an alle: " + geschenkText(s);
      case "schlacht":
        if (s.boss) return "Boss-Mutterschiff starten" + (s.ort ? " · " + ortName(s.ort) : "");
        return "Sternenschlacht starten" + (s.links && s.rechts ? ": " + parteiName(s.links) + " gegen " + parteiName(s.rechts) : "") + (s.ort ? " · " + ortName(s.ort) : "");
      default: return ARTEN[s.art] || s.art;
    }
  }
  function danach(s) {
    if (s.modus !== "auto") return "danach wartet es auf „Weiter“";
    return (s.sek || 0) === 0 ? "danach sofort der nächste (gleichzeitig)" : "danach automatisch nach " + s.sek + " s";
  }
  function info(s) {
    if (s.art === "text" && s.von) return " · von " + s.von;
    if (s.art === "abstimmung") return " · läuft " + s.dauer + " s, nur während eines Events";
    if (s.art === "schlacht") {
      const tempo = TEMPO.find((x) => x[0] === s.tempo);
      return " · " + (tempo ? tempo[1] : s.tempo + " min") + (s.sammeln ? ", Sammeln " + s.sammeln + " s" : "") + (s.boss ? ", Stärke " + s.staerke : "");
    }
    return "";
  }

  function dauerText(sek) {
    if (sek < 60) return sek + " s";
    const m = Math.floor(sek / 60), r = sek % 60;
    return m + " min" + (r ? " " + r + " s" : "");
  }
  /* Gesamtdauer der automatischen Wartezeiten und Zahl der Halte. */
  function ueberblick(schritte) {
    let sek = 0, halte = 0;
    schritte.forEach((s) => { if (s.modus === "auto") sek += parseInt(s.sek, 10) || 0; else halte += 1; });
    return schritte.length + (schritte.length === 1 ? " Schritt" : " Schritte") + " · automatisch ca. " + dauerText(sek) +
      (halte ? " · " + halte + "× wartet auf „Weiter“" : " · läuft ganz von allein");
  }

  /* ------------------------------------------------------
     ABSPIELEN
  ------------------------------------------------------ */
  function grund(err) {
    const m = String((err && err.message) || err);
    if (/kein-event/.test(m)) return "Das geht nur während eines Events – vorher „Event starten“ ins Drehbuch legen.";
    if (/schlacht-laeuft/.test(m)) return "Es läuft schon eine Sternenschlacht.";
    if (/boss-gesperrt/.test(m)) return "Erst die Freigabe „Boss-Mutterschiff“ einschalten (auch als Schritt möglich).";
    if (/parteien-gesperrt/.test(m)) return "Weitere Parteien sind nicht freigegeben – Menschen gegen Aliens wählen oder die Freigabe einschalten.";
    if (/zu-wenige/.test(m)) return "Noch niemand hat eine Seite für die Schlacht gewählt.";
    if (/nur-admin/.test(m)) return "Nur als Admin angemeldet möglich.";
    return m;
  }

  async function geschenk(s) {
    if (s.gabe === "pass_xp") {
      const pass = typeof getCurrentPirateSeason === "function" ? getCurrentPirateSeason() : null;
      if (!pass) throw new Error("Gerade läuft keine Piratenpass-Saison – Pass-XP hätten kein Ziel.");
      await rpc("admin_pass_xp_an_alle", { p_xp: s.wert, p_pass_id: pass.passId });
    } else if (s.gabe === "diamanten") {
      await rpc("admin_diamanten_an_alle", { p_anzahl: s.wert });
    } else if (s.gabe === "titel") {
      await rpc("admin_event_titel_an_alle", { p_text: s.titel, p_stil: s.stil });
    } else {
      await rpc("live_grant_ausloesen", { p_art: s.gabe, p_wert: s.gabe === "avatar" ? 0 : s.wert, p_avatar: s.gabe === "avatar" ? s.avatar : null });
    }
  }

  async function schlacht(s) {
    const ort = s.ort || null;
    if (s.boss) {
      await rpc("admin_boss_starten", { p_minuten: s.tempo, p_ort: ort, p_sammeln_sek: s.sammeln || 90, p_staerke: s.staerke || 3 });
    } else {
      /* wie gwSchlachtStarten: Ort und Parteien nur mitschicken, wenn nötig */
      const args = ort ? { p_minuten: s.tempo, p_ort: ort } : { p_minuten: s.tempo };
      const links = s.links || "menschen", rechts = s.rechts || "aliens";
      if (flagAn("schlachtParteien") || links !== "menschen" || rechts !== "aliens") {
        Object.assign(args, { p_links: links, p_rechts: rechts, p_sammeln_sek: s.sammeln || 90 });
      }
      await rpc("admin_schlacht_starten", args);
    }
    if (typeof gwSchlachtZeigen === "function") gwSchlachtZeigen();
  }

  async function aktion(s) {
    if (s.art === "pause") return true;
    if (s.art === "text") {
      const ok = await liveSend({ message: s.text, message_color: s.farbe || "#f0c96a", message_from: s.von || null, message_at: liveJetzt() }, "Nachricht");
      if (ok && typeof gwLogbuch === "function") gwLogbuch((s.von ? s.von + ": " : "") + s.text);
      return !!ok;
    }
    if (s.art === "effekt") {
      return !!(await liveSend({ pulse_kind: s.effekt, pulse_at: liveJetzt() }, EFFEKTE[s.effekt] || s.effekt));
    }
    if (s.art === "buehne") return !!(await liveSend({ takeover: !!s.an }, s.an ? "Live-Bühne AN" : "Live-Bühne AUS"));
    if (s.art === "story") return !!(await gwStoryStart(s.story));
    try {
      if (s.art === "story_ende") {
        await rpc("admin_live_story_beenden");
        if (typeof gwStoryLageLaden === "function") gwStoryLageLaden();
      } else if (s.art === "epoche") {
        await rpc("admin_epoche", { p_jahr: s.jahr });
        if (window.fhEpoche && window.fhEpoche.vorschau) window.fhEpoche.vorschau(null);
      } else if (s.art === "event_start") {
        await rpc("admin_event_starten", { p_name: s.name, p_sekunden: s.countdown });
        if (typeof gwEventLageLaden === "function") gwEventLageLaden();
        if (typeof gwStoryLageLaden === "function") gwStoryLageLaden();
      } else if (s.art === "event_ende") {
        await rpc("admin_event_beenden");
        if (typeof gwEventLageLaden === "function") gwEventLageLaden();
      } else if (s.art === "abstimmung") {
        await rpc("admin_abstimmung_starten", { p_frage: s.frage, p_a: s.a, p_b: s.b, p_sekunden: s.dauer });
      } else if (s.art === "freigabe") {
        const flags = Object.assign({}, (typeof siteConfig !== "undefined" && siteConfig.featureFlags) || {});
        flags[s.flag] = !!s.an;
        await patchSupabaseSiteConfig({ featureFlags: flags });
        if (typeof fhFlagsAnwenden === "function") fhFlagsAnwenden();
      } else if (s.art === "seite") {
        const vorher = (typeof siteConfig !== "undefined" && Array.isArray(siteConfig.disabledPageIds)) ? siteConfig.disabledPageIds : [];
        const ohne = vorher.filter((id) => id !== s.seite);
        await patchSupabaseSiteConfig({ disabledPageIds: s.an ? ohne : ohne.concat([s.seite]) });
        if (typeof fhSeitenSperreAnwenden === "function") fhSeitenSperreAnwenden();
      } else if (s.art === "geschenk") {
        await geschenk(s);
      } else if (s.art === "schlacht") {
        await schlacht(s);
      } else if (s.art === "schlacht_ende") {
        await rpc("admin_schlacht_beenden");
        if (typeof gwSchlachtZeigen === "function") gwSchlachtZeigen();
      } else {
        return false;
      }
      return true;
    } catch (err) {
      console.error("Drehbuch-Schritt fehlgeschlagen:", err);
      lauf.fehler = grund(err);
      return false;
    }
  }

  function uhrenAus() {
    clearTimeout(lauf.uhr); lauf.uhr = null;
  }
  function tickerAn() {
    if (lauf.ticker) return;
    lauf.ticker = setInterval(zeitZeichnen, 400);
  }
  function tickerAus() { clearInterval(lauf.ticker); lauf.ticker = null; }

  function zeitZeichnen() {
    const z = document.getElementById("gw-db-zeit");
    if (!z) return;
    if (!lauf.aktiv) { z.textContent = ""; return; }
    if (lauf.pausiert) { z.textContent = "⏸ pausiert"; return; }
    if (lauf.wartet) { z.textContent = "⏭ wartet auf „Weiter“"; return; }
    if (lauf.uhr) { z.textContent = "⏱ nächster Schritt in " + Math.max(0, Math.ceil((lauf.bis - Date.now()) / 1000)) + " s"; return; }
    z.textContent = "läuft …";
  }

  function ende(meldung) {
    uhrenAus(); tickerAus();
    lauf.aktiv = false; lauf.pausiert = false; lauf.wartet = false;
    zeichnen();
    status(meldung, false);
  }

  async function ausfuehren(i) {
    const p = plan();
    if (!p || !lauf.aktiv) return;
    uhrenAus();
    lauf.wartet = false; lauf.pausiert = false; lauf.fehler = "";
    if (i >= p.schritte.length) { ende("✓ Drehbuch zu Ende."); return; }
    const s = p.schritte[i];
    status("Schritt " + (i + 1) + " läuft: " + titel(s), false);
    lauf.naechster = i + 1;
    zeitZeichnen();
    const ok = await aktion(s);
    if (!lauf.aktiv) return; // währenddessen gestoppt
    if (!ok) {
      const warum = lauf.fehler;
      ende("");
      await speichern({ schritt: i });
      status("Schritt " + (i + 1) + " fehlgeschlagen" + (warum ? ": " + warum : "") + " – Drehbuch angehalten. „Start“ macht beim selben Schritt weiter.", true);
      return;
    }
    await speichern({ schritt: i + 1 });
    if (i + 1 >= p.schritte.length) { ende("✓ Drehbuch zu Ende."); return; }
    if (s.modus === "auto") {
      const ms = Math.max(0, (parseInt(s.sek, 10) || 0) * 1000);
      lauf.bis = Date.now() + ms;
      lauf.uhr = setTimeout(() => ausfuehren(i + 1), ms);
    } else {
      lauf.wartet = true;
    }
    zeichnen();
    zeitZeichnen();
  }

  function start() {
    const p = plan();
    if (!p || !p.schritte.length) { status("Erst Schritte ins Drehbuch legen.", true); return; }
    if (lauf.aktiv) return;
    const ab = p.schritt >= p.schritte.length ? 0 : p.schritt;
    const dauerhaft = p.schritte.slice(ab).filter((s) => DAUERHAFT.includes(s.art)).length;
    if (!confirm("„" + p.name + "“ ab Schritt " + (ab + 1) + " für alle abspielen? Jeder Schritt geht sofort an alle Besucher." +
      (dauerhaft ? " " + dauerhaft + " Schritt(e) ändern etwas bleibend (Geschenke, Freigaben, Seiten, Epoche) – ohne weitere Rückfrage." : "") +
      " Der Tab muss offen bleiben, solange automatische Schritte laufen.")) return;
    lauf.aktiv = true;
    tickerAn();
    ausfuehren(ab);
  }

  function weiter() {
    const p = plan();
    if (!p) return;
    if (!lauf.aktiv) { start(); return; }
    if (lauf.pausiert) return;
    uhrenAus();
    ausfuehren(lauf.naechster);
  }

  function pausieren() {
    if (!lauf.aktiv) return;
    if (lauf.pausiert) {
      lauf.pausiert = false;
      if (!lauf.wartet) {
        lauf.bis = Date.now() + lauf.rest;
        lauf.uhr = setTimeout(() => ausfuehren(lauf.naechster), lauf.rest);
      }
    } else {
      lauf.pausiert = true;
      lauf.rest = lauf.uhr ? Math.max(0, lauf.bis - Date.now()) : 0;
      uhrenAus();
    }
    zeichnen();
    zeitZeichnen();
  }

  function stoppen() {
    if (!lauf.aktiv) return;
    ende("■ Gestoppt – bei allen läuft weiter, was gerade läuft (Disco etc. beenden über „Story beenden“).");
  }

  async function vonVorn() {
    if (lauf.aktiv && !confirm("Das laufende Drehbuch anhalten und von vorn beginnen?")) return;
    if (lauf.aktiv) { uhrenAus(); tickerAus(); lauf.aktiv = false; lauf.pausiert = false; lauf.wartet = false; }
    await speichern({ schritt: 0 }, "Drehbuch steht wieder am Anfang.");
  }

  /* Zu einem Schritt springen: läuft das Drehbuch, sofort ausführen,
     sonst nur den Zeiger setzen - „Start“ beginnt dann dort. */
  async function abHier(i) {
    const p = plan();
    if (!p) return;
    if (lauf.aktiv) {
      if (!confirm("Zu Schritt " + (i + 1) + " springen? Er läuft sofort bei allen.")) return;
      if (lauf.pausiert) { lauf.pausiert = false; }
      ausfuehren(i);
      return;
    }
    await speichern({ schritt: i }, "Drehbuch steht bei Schritt " + (i + 1) + " – „Start“ beginnt dort.");
  }

  /* ------------------------------------------------------
     BEARBEITEN
  ------------------------------------------------------ */
  async function anlegen(name, schritte, meldung) {
    try {
      const data = await tabelle(() => supabaseClient.from("event_drehbuecher").insert({ name: name.slice(0, 60), schritte: schritte }).select("plan_id").single());
      gewaehlt = data.plan_id;
      bearbeite = -1; einfuegen = -1;
      await laden();
      status(meldung, false);
    } catch (err) {
      status("Anlegen fehlgeschlagen: " + ((err && err.message) || err), true);
    }
  }

  async function neu() {
    const name = (prompt("Name des neuen Drehbuchs (z. B. „Event 4 – Die Disco-Nacht“):") || "").trim();
    if (name) await anlegen(name, [], "✓ Drehbuch angelegt.");
  }

  async function kopieren() {
    const p = plan();
    if (!p) return;
    const name = (prompt("Name der Kopie:", kurz(p.name, 52) + " (Kopie)") || "").trim();
    if (name) await anlegen(name, p.schritte.slice(), "✓ Kopie angelegt – sie steht am Anfang.");
  }

  async function umbenennen() {
    const p = plan();
    if (!p) return;
    const name = (prompt("Neuer Name:", p.name) || "").trim();
    if (name) await speichern({ name: name.slice(0, 60) }, "✓ Umbenannt.");
  }

  async function loeschen() {
    const p = plan();
    if (!p || !confirm("Drehbuch „" + p.name + "“ endgültig löschen?")) return;
    if (lauf.aktiv) { status("Erst das laufende Drehbuch stoppen.", true); return; }
    try {
      await tabelle(() => supabaseClient.from("event_drehbuecher").delete().eq("plan_id", p.plan_id));
      gewaehlt = null;
      await laden();
      status("✓ Gelöscht.", false);
    } catch (err) {
      status("Löschen fehlgeschlagen: " + ((err && err.message) || err), true);
    }
  }

  function schrittWeg(i) {
    const p = plan();
    if (!p) return;
    const neue = p.schritte.filter((_, k) => k !== i);
    if (bearbeite === i) bearbeite = -1;
    if (einfuegen >= neue.length) einfuegen = -1;
    speichern({ schritte: neue, schritt: i < p.schritt ? p.schritt - 1 : Math.min(p.schritt, neue.length) });
  }
  function schrittVerschieben(i, d) {
    const p = plan();
    const j = i + d;
    if (!p || j < 0 || j >= p.schritte.length) return;
    const neue = p.schritte.slice();
    [neue[i], neue[j]] = [neue[j], neue[i]];
    speichern({ schritte: neue });
  }
  /* Kopie direkt dahinter; eine Kopie eines schon gelaufenen Schritts
     zählt als gelaufen, damit der Zeiger auf demselben Schritt bleibt. */
  function schrittKopieren(i) {
    const p = plan();
    if (!p) return;
    if (p.schritte.length >= MAX_SCHRITTE) { status("Höchstens " + MAX_SCHRITTE + " Schritte.", true); return; }
    const neue = p.schritte.slice();
    neue.splice(i + 1, 0, JSON.parse(JSON.stringify(p.schritte[i])));
    speichern({ schritte: neue, schritt: i < p.schritt ? p.schritt + 1 : p.schritt }, "✓ Schritt " + (i + 1) + " kopiert.");
  }

  function wert(id) { const e = document.getElementById(id); return e ? e.value : ""; }
  function ganz(id) { return parseInt(wert(id), 10); }

  function schrittAusFormular() {
    const art = wert("gw-db-art");
    const s = { art: art };
    const modus = wert("gw-db-modus");
    if (modus === "sofort") { s.modus = "auto"; s.sek = 0; }
    else {
      s.modus = modus;
      if (modus === "auto") {
        const sek = ganz("gw-db-sek");
        if (!(sek >= 0 && sek <= 3600)) { status("Dauer zwischen 0 und 3600 Sekunden.", true); return null; }
        s.sek = sek;
      }
    }
    const fehler = (text) => { status(text, true); return null; };

    if (art === "text") {
      const text = wert("gw-db-text").trim();
      if (!text || text.length > 280) return fehler("Text: 1 bis 280 Zeichen.");
      s.text = text;
      s.farbe = wert("gw-db-farbe") || "#f0c96a";
      const von = wert("gw-db-von").trim();
      if (von) s.von = von.slice(0, 60);
    } else if (art === "story") {
      s.story = wert("gw-db-story");
    } else if (art === "effekt") {
      s.effekt = wert("gw-db-effekt");
    } else if (art === "buehne") {
      s.an = wert("gw-db-buehne-an") === "an";
    } else if (art === "epoche") {
      s.jahr = wert("gw-db-jahr");
    } else if (art === "event_start") {
      s.name = wert("gw-db-ev-name").trim();
      s.countdown = ganz("gw-db-ev-countdown");
      if (!s.name || s.name.length > 60) return fehler("Name des Events: 1 bis 60 Zeichen.");
      if (!(s.countdown >= 3 && s.countdown <= 60)) return fehler("Countdown zwischen 3 und 60 Sekunden.");
    } else if (art === "abstimmung") {
      s.frage = wert("gw-db-abst-frage").trim();
      s.a = wert("gw-db-abst-a").trim();
      s.b = wert("gw-db-abst-b").trim();
      s.dauer = ganz("gw-db-abst-dauer");
      if (!s.frage || !s.a || !s.b) return fehler("Frage und beide Antworten eingeben.");
    } else if (art === "freigabe") {
      s.flag = wert("gw-db-flag");
      s.an = wert("gw-db-flag-an") === "an";
      if (!s.flag) return fehler("Keine Freigaben gefunden.");
    } else if (art === "seite") {
      s.seite = wert("gw-db-seite");
      s.an = wert("gw-db-seite-an") === "an";
      if (!s.seite) return fehler("Keine Seiten gefunden.");
    } else if (art === "geschenk") {
      s.gabe = wert("gw-db-gabe");
      if (s.gabe === "avatar") {
        s.avatar = wert("gw-db-avatar").trim();
        if (!/^[A-Za-z0-9_.-]{1,60}$/.test(s.avatar)) return fehler("Avatar-ID: Buchstaben, Ziffern, _ . -");
      } else if (s.gabe === "titel") {
        s.titel = wert("gw-db-titel").trim();
        s.stil = wert("gw-db-stil");
        if (!s.titel || s.titel.length > 32) return fehler("Titel: 1 bis 32 Zeichen.");
      } else {
        s.wert = ganz("gw-db-wert");
        const max = GABE_GRENZE[s.gabe];
        if (!(s.wert >= 1 && s.wert <= max)) return fehler(GABEN[s.gabe] + " zwischen 1 und " + zahl(max) + ".");
      }
    } else if (art === "schlacht") {
      s.boss = wert("gw-db-sl-art") === "boss";
      s.tempo = ganz("gw-db-sl-tempo");
      s.ort = wert("gw-db-sl-ort");
      s.sammeln = ganz("gw-db-sl-sammeln");
      if (s.boss) s.staerke = ganz("gw-db-sl-staerke");
      else {
        s.links = wert("gw-db-sl-links");
        s.rechts = wert("gw-db-sl-rechts");
        if (s.links === s.rechts) return fehler("Zwei verschiedene Parteien wählen.");
      }
    }
    return s;
  }

  async function schrittSpeichern() {
    const p = plan();
    if (!p) return;
    const s = schrittAusFormular();
    if (!s) return;
    const neue = p.schritte.slice();
    let schritt = p.schritt;
    let meldung = "✓ Schritt ersetzt.";
    if (bearbeite >= 0) neue[bearbeite] = s;
    else {
      if (neue.length >= MAX_SCHRITTE) { status("Höchstens " + MAX_SCHRITTE + " Schritte.", true); return; }
      if (einfuegen >= 0 && einfuegen < neue.length - 1) {
        neue.splice(einfuegen + 1, 0, s);
        if (einfuegen + 1 < schritt) schritt += 1;
        meldung = "✓ Schritt als Nr. " + (einfuegen + 2) + " eingefügt.";
      } else {
        neue.push(s);
        meldung = "✓ Schritt hinzugefügt.";
      }
    }
    bearbeite = -1; einfuegen = -1;
    await speichern({ schritte: neue, schritt: schritt }, meldung);
  }

  function schrittTesten(s) {
    const v = window.fhLiveVorschau;
    if (s.art === "epoche") {
      if (window.fhEpoche && window.fhEpoche.vorschau) window.fhEpoche.vorschau(s.jahr === "2026" ? null : s.jahr);
      status(s.jahr === "2026" ? "Vorschau beendet." : "Vorschau Jahr " + s.jahr + " – nur bei dir. „Bei mir testen“ mit 2026 beendet sie.", false);
      return;
    }
    if (!v) { status("Vorschau nicht verfügbar.", true); return; }
    if (s.art === "text") v.banderole(s.text, s.farbe || "#f0c96a", s.von || "");
    else if (s.art === "effekt") v.pulse(s.effekt);
    else if (s.art === "buehne") (s.an ? v.uebernahmeAn() : v.uebernahmeAus());
  }
  function testbar(s) { return ["text", "effekt", "buehne", "epoche"].includes(s.art); }

  function setzen(id, wertNeu) {
    const e = document.getElementById(id);
    if (e && wertNeu != null) e.value = String(wertNeu);
  }

  function formularFuellen(s) {
    setzen("gw-db-art", s.art);
    setzen("gw-db-modus", s.modus === "auto" ? ((s.sek || 0) === 0 ? "sofort" : "auto") : "hand");
    setzen("gw-db-sek", s.sek != null && s.sek > 0 ? s.sek : 8);
    if (s.art === "text") {
      setzen("gw-db-text", s.text); setzen("gw-db-farbe", s.farbe || "#f0c96a"); setzen("gw-db-von", s.von || "");
    }
    setzen("gw-db-story", s.story);
    setzen("gw-db-effekt", s.effekt);
    if (s.art === "buehne") setzen("gw-db-buehne-an", anAus(s.an));
    setzen("gw-db-jahr", s.jahr);
    setzen("gw-db-ev-name", s.name); setzen("gw-db-ev-countdown", s.countdown);
    setzen("gw-db-abst-frage", s.frage); setzen("gw-db-abst-a", s.a); setzen("gw-db-abst-b", s.b); setzen("gw-db-abst-dauer", s.dauer);
    if (s.art === "freigabe") { setzen("gw-db-flag", s.flag); setzen("gw-db-flag-an", anAus(s.an)); }
    if (s.art === "seite") { setzen("gw-db-seite", s.seite); setzen("gw-db-seite-an", anAus(s.an)); }
    if (s.art === "geschenk") {
      setzen("gw-db-gabe", s.gabe); setzen("gw-db-wert", s.wert); setzen("gw-db-avatar", s.avatar);
      setzen("gw-db-titel", s.titel); setzen("gw-db-stil", s.stil);
    }
    if (s.art === "schlacht") {
      setzen("gw-db-sl-art", s.boss ? "boss" : "normal"); setzen("gw-db-sl-tempo", s.tempo); setzen("gw-db-sl-ort", s.ort || "");
      setzen("gw-db-sl-sammeln", s.sammeln); setzen("gw-db-sl-staerke", s.staerke);
      setzen("gw-db-sl-links", s.links); setzen("gw-db-sl-rechts", s.rechts);
    }
    formularUmschalten();
  }

  /* Welche Felder zu welcher Art gehören (id der Gruppe → Arten). */
  const GRUPPEN_FELDER = {
    "gw-db-g-text": ["text"], "gw-db-story": ["story"], "gw-db-effekt": ["effekt"],
    "gw-db-g-buehne": ["buehne"], "gw-db-g-epoche": ["epoche"], "gw-db-g-event": ["event_start"],
    "gw-db-g-abst": ["abstimmung"], "gw-db-g-flag": ["freigabe"], "gw-db-g-seite": ["seite"],
    "gw-db-g-geschenk": ["geschenk"], "gw-db-g-schlacht": ["schlacht"]
  };

  function formularUmschalten() {
    const art = wert("gw-db-art");
    const modus = wert("gw-db-modus");
    const zeige = (id, an) => { const e = document.getElementById(id); if (e) e.hidden = !an; };
    Object.keys(GRUPPEN_FELDER).forEach((id) => zeige(id, GRUPPEN_FELDER[id].includes(art)));
    zeige("gw-db-sek-gruppe", modus === "auto");
    const gabe = wert("gw-db-gabe");
    zeige("gw-db-wert", gabe in GABE_GRENZE);
    zeige("gw-db-avatar", gabe === "avatar");
    zeige("gw-db-titel", gabe === "titel");
    zeige("gw-db-stil", gabe === "titel");
    const wertFeld = document.getElementById("gw-db-wert");
    if (wertFeld && gabe in GABE_GRENZE) wertFeld.max = String(GABE_GRENZE[gabe]);
    const boss = wert("gw-db-sl-art") === "boss";
    zeige("gw-db-sl-links", !boss);
    zeige("gw-db-sl-rechts", !boss);
    zeige("gw-db-sl-staerke", boss);
  }

  /* ------------------------------------------------------
     ZEICHNEN
  ------------------------------------------------------ */
  function knopf(eltern, beschriftung, klick, extra, titelText) {
    const k = el("button", "gw-live-knopf" + (extra ? " " + extra : ""), beschriftung);
    k.type = "button";
    if (titelText) { k.setAttribute("aria-label", titelText); k.title = titelText; }
    k.addEventListener("click", klick);
    eltern.appendChild(k);
    return k;
  }

  function option(wertNeu, text) {
    const o = el("option", null, text);
    o.value = String(wertNeu);
    return o;
  }
  function auswahl(id, beschriftung, liste, vorwahl) {
    const s = el("select", "gw-feld");
    s.id = id;
    s.setAttribute("aria-label", beschriftung);
    liste.forEach(([w, t]) => s.appendChild(option(w, t)));
    if (vorwahl != null) s.value = String(vorwahl);
    return s;
  }
  function eingabe(id, beschriftung, art, extra) {
    const e = el("input", "gw-feld" + (extra && extra.breit ? " gw-feld-breit" : ""));
    e.type = art; e.id = id;
    e.setAttribute("aria-label", beschriftung);
    if (extra) {
      if (extra.platz) e.placeholder = extra.platz;
      if (extra.max != null) e.maxLength = extra.max;
      if (extra.von != null) e.min = String(extra.von);
      if (extra.bis != null) e.max = String(extra.bis);
      if (extra.wert != null) e.value = String(extra.wert);
    }
    return e;
  }
  function gruppe(id, kinder) {
    const g = el("span", "gw-db-gruppe");
    g.id = id;
    g.append.apply(g, kinder);
    return g;
  }
  const AN_AUS = [["an", "einschalten"], ["aus", "ausschalten"]];

  function formularBauen(box) {
    const form = el("div", "gw-plan-fuss gw-db-form");

    const art = el("select", "gw-feld"); art.id = "gw-db-art"; art.setAttribute("aria-label", "Art des Schritts");
    GRUPPEN.forEach(([name, arten]) => {
      const og = el("optgroup"); og.label = name;
      arten.forEach((k) => og.appendChild(option(k, ARTEN[k])));
      art.appendChild(og);
    });
    art.addEventListener("change", formularUmschalten);

    const farbe = eingabe("gw-db-farbe", "Farbe", "color", { wert: "#f0c96a" });
    const gText = gruppe("gw-db-g-text", [
      eingabe("gw-db-text", "Text", "text", { breit: true, max: 280, platz: "Text für alle (bis 280 Zeichen)" }),
      farbe,
      eingabe("gw-db-von", "Absender", "text", { max: 60, platz: "Absender (optional)" })
    ]);
    const story = auswahl("gw-db-story", "Story", storyListe().map((s) => [s[0], s[1]]));
    const effekt = auswahl("gw-db-effekt", "Effekt", Object.entries(EFFEKTE));
    const gBuehne = gruppe("gw-db-g-buehne", [auswahl("gw-db-buehne-an", "Live-Bühne", AN_AUS)]);
    const gEpoche = gruppe("gw-db-g-epoche", [auswahl("gw-db-jahr", "Jahr", JAHRE, "2100")]);
    const gEvent = gruppe("gw-db-g-event", [
      eingabe("gw-db-ev-name", "Name des Events", "text", { breit: true, max: 60, platz: "Name des Events, z. B. Die Disco-Nacht" }),
      eingabe("gw-db-ev-countdown", "Countdown in Sekunden", "number", { von: 3, bis: 60, wert: 10 }),
      el("span", "gw-story-info", "s Countdown")
    ]);
    const gAbst = gruppe("gw-db-g-abst", [
      eingabe("gw-db-abst-frage", "Frage", "text", { breit: true, max: 120, platz: "Frage an die Crew" }),
      eingabe("gw-db-abst-a", "Antwort A", "text", { max: 40, platz: "Antwort A" }),
      eingabe("gw-db-abst-b", "Antwort B", "text", { max: 40, platz: "Antwort B" }),
      auswahl("gw-db-abst-dauer", "Dauer der Abstimmung", ABST_DAUER, 60)
    ]);
    const gFlag = gruppe("gw-db-g-flag", [auswahl("gw-db-flag", "Freigabe", flagListe()), auswahl("gw-db-flag-an", "an oder aus", AN_AUS)]);
    const gSeite = gruppe("gw-db-g-seite", [auswahl("gw-db-seite", "Seite", seitenListe()), auswahl("gw-db-seite-an", "an oder aus", AN_AUS)]);

    const gabe = auswahl("gw-db-gabe", "Geschenk", Object.entries(GABEN));
    gabe.addEventListener("change", formularUmschalten);
    const stil = auswahl("gw-db-stil", "Stil des Titels", titelStile());
    const gGeschenk = gruppe("gw-db-g-geschenk", [
      gabe,
      eingabe("gw-db-wert", "Menge", "number", { von: 1, bis: 5000, wert: 100 }),
      eingabe("gw-db-avatar", "Avatar-ID", "text", { max: 60, platz: "Avatar-ID" }),
      eingabe("gw-db-titel", "Titel", "text", { max: 32, platz: "Titel, z. B. Held des Sturms" }),
      stil
    ]);

    const slArt = auswahl("gw-db-sl-art", "Art der Schlacht", [["normal", "Sternenschlacht"], ["boss", "Boss-Mutterschiff"]]);
    slArt.addEventListener("change", formularUmschalten);
    const gSchlacht = gruppe("gw-db-g-schlacht", [
      slArt,
      auswahl("gw-db-sl-tempo", "Tempo einer Runde", TEMPO, 10),
      auswahl("gw-db-sl-ort", "Kampfort", [["", "Ort auslosen"]].concat(ortListe())),
      auswahl("gw-db-sl-links", "Partei links", parteiListe(), "menschen"),
      auswahl("gw-db-sl-rechts", "Partei rechts", parteiListe(), "aliens"),
      auswahl("gw-db-sl-sammeln", "Sammelphase", SAMMELN, 90),
      auswahl("gw-db-sl-staerke", "Stärke des Mutterschiffs", STAERKE, 3)
    ]);

    const modus = auswahl("gw-db-modus", "Wie geht es danach weiter", [
      ["auto", "danach automatisch weiter"], ["sofort", "gleichzeitig: sofort der nächste"], ["hand", "danach auf „Weiter“ warten"]], "auto");
    modus.addEventListener("change", formularUmschalten);
    const sekGruppe = gruppe("gw-db-sek-gruppe", [
      eingabe("gw-db-sek", "Sekunden bis zum nächsten Schritt", "number", { von: 0, bis: 3600, wert: 8 }),
      el("span", "gw-story-info", "Sekunden")
    ]);

    form.append(art, gText, story, effekt, gBuehne, gEpoche, gEvent, gAbst, gFlag, gSeite, gGeschenk, gSchlacht, modus, sekGruppe);
    const p = plan();
    const beschriftung = bearbeite >= 0 ? "Schritt " + (bearbeite + 1) + " ersetzen"
      : einfuegen >= 0 && p && einfuegen < p.schritte.length - 1 ? "Als Schritt " + (einfuegen + 2) + " einfügen" : "Schritt hinzufügen";
    knopf(form, beschriftung, schrittSpeichern, "ist-alle");
    if (bearbeite >= 0 || einfuegen >= 0) knopf(form, "Abbrechen", () => { bearbeite = -1; einfuegen = -1; zeichnen(); });
    box.appendChild(form);
  }

  function zeichnen() {
    if (!wurzel || !wurzel.isConnected) {
      const neu = document.getElementById("gw-db-wurzel");
      if (!neu) return;
      wurzel = neu;
    }
    /* Eingaben im Formular über das Neuzeichnen retten (z. B. nach dem
       Speichern des Zeigers während eines laufenden Drehbuchs). */
    const offen = document.getElementById("gw-db-art") ? schrittEntwurf() : null;
    const p = plan();
    const box = el("div", "gw-plan gw-db");

    /* Kopf */
    const kopf = el("div", "gw-plan-kopf");
    kopf.appendChild(el("span", "gw-story-name", "Drehbuch"));
    const wahl = el("select", "gw-feld gw-feld-breit");
    wahl.setAttribute("aria-label", "Drehbuch wählen");
    wahl.appendChild(option("", plaene.length ? "– Drehbuch wählen –" : "– noch keins angelegt –"));
    plaene.forEach((x) => wahl.appendChild(option(x.plan_id, x.name)));
    wahl.value = gewaehlt || "";
    wahl.addEventListener("change", () => {
      if (lauf.aktiv) { status("Erst das laufende Drehbuch stoppen.", true); wahl.value = gewaehlt || ""; return; }
      gewaehlt = wahl.value || null; bearbeite = -1; einfuegen = -1; zeichnen();
    });
    kopf.appendChild(wahl);
    knopf(kopf, "Neues Drehbuch", neu);
    knopf(kopf, "Kopieren", kopieren).disabled = !p;
    knopf(kopf, "Umbenennen", umbenennen).disabled = !p;
    knopf(kopf, "Löschen", loeschen).disabled = !p;
    box.appendChild(kopf);
    if (p && p.schritte.length) {
      const rest = p.schritte.slice(Math.min(p.schritt, p.schritte.length));
      box.appendChild(el("p", "gw-story-info gw-db-ueberblick", ueberblick(p.schritte) +
        (p.schritt > 0 && rest.length ? " · ab Schritt " + (p.schritt + 1) + " noch ca. " + dauerText(rest.reduce((n, s) => n + (s.modus === "auto" ? parseInt(s.sek, 10) || 0 : 0), 0)) : "")));
    }

    /* Schritte */
    const liste = el("ol", "gw-plan-ablauf");
    if (!p) {
      liste.appendChild(el("li", "gw-plan-leer", "Lege ein Drehbuch an und baue dein Event Schritt für Schritt."));
    } else if (!p.schritte.length) {
      liste.appendChild(el("li", "gw-plan-leer", "Noch keine Schritte – unten Text, Story, Effekt, Event, Freigabe, Geschenk oder Sternenschlacht hinzufügen."));
    }
    if (p) p.schritte.forEach((s, i) => {
      const eintrag = s.art === "story" ? (typeof GW_STORYS !== "undefined" ? GW_STORYS.find((x) => x[0] === s.story) : null) : null;
      const farbe = s.art === "story" ? (eintrag ? eintrag[3] : "rot") : FARBE_ART[s.art] || "rot";
      const zustand = i < p.schritt ? "ist-gelaufen" : i === p.schritt ? "ist-naechste" : "";
      const li = el("li", "gw-story gw-plan-schritt ist-" + farbe + (zustand ? " " + zustand : "") + (i === bearbeite ? " ist-bearbeitet" : ""));
      const text = el("div", "gw-story-text");
      text.appendChild(el("span", "gw-story-name", (i + 1) + ". " + titel(s) + (i < p.schritt ? "  ✓" : "")));
      text.appendChild(el("span", "gw-story-info", (i === p.schritt ? "Als Nächstes · " : "") + danach(s) + info(s)));
      if (i === einfuegen) text.appendChild(el("span", "gw-story-info gw-db-marke", "↳ Der neue Schritt kommt hier dahinter."));
      const kn = el("div", "gw-story-knoepfe");
      knopf(kn, "↑", () => schrittVerschieben(i, -1), "ist-klein", "Nach oben").disabled = i === 0;
      knopf(kn, "↓", () => schrittVerschieben(i, 1), "ist-klein", "Nach unten").disabled = i === p.schritte.length - 1;
      knopf(kn, "✎", () => { bearbeite = i; einfuegen = -1; zeichnen(); formularFuellen(s); }, "ist-klein", "Schritt bearbeiten");
      knopf(kn, "⧉", () => schrittKopieren(i), "ist-klein", "Schritt kopieren");
      knopf(kn, "+", () => { einfuegen = i; bearbeite = -1; zeichnen(); }, "ist-klein", "Neuen Schritt dahinter einfügen");
      knopf(kn, "✕", () => schrittWeg(i), "ist-klein", "Schritt entfernen");
      knopf(kn, "Ab hier", () => abHier(i), null, lauf.aktiv ? "Sofort zu diesem Schritt springen" : "Drehbuch bei diesem Schritt beginnen lassen");
      if (testbar(s)) knopf(kn, "Bei mir testen", () => schrittTesten(s));
      li.append(text, kn);
      liste.appendChild(li);
    });
    box.appendChild(liste);

    if (p) {
      /* Steuerung */
      const steuer = el("div", "gw-plan-fuss gw-db-steuer");
      knopf(steuer, lauf.aktiv ? "▶ läuft" : "▶ Start", start, "ist-alle").disabled = lauf.aktiv;
      knopf(steuer, "⏭ Weiter", weiter).disabled = !p.schritte.length;
      knopf(steuer, lauf.pausiert ? "▶ Fortsetzen" : "⏸ Pause", pausieren).disabled = !lauf.aktiv;
      knopf(steuer, "■ Stopp", stoppen).disabled = !lauf.aktiv;
      knopf(steuer, "↺ Von vorn", vonVorn);
      steuer.appendChild(el("span", "gw-story-info"));
      steuer.lastChild.id = "gw-db-zeit";
      box.appendChild(steuer);

      formularBauen(box);
    }

    const st = el("p", "gw-live-status"); st.id = "gw-db-status"; st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite");
    const alterStatus = document.getElementById("gw-db-status");
    if (alterStatus) { st.textContent = alterStatus.textContent; st.className = alterStatus.className; }
    box.appendChild(st);
    box.appendChild(el("p", "gateway-status-sub",
      "Baue das Event vorab: Texte, Storys (auch Disco), Effekte, Pausen, Event mit Countdown und Abstimmung, Live-Bühne, Epoche, Freigaben und Seiten an/aus, Geschenke an alle und die Sternenschlacht – in fester Reihenfolge. Jeder Schritt läuft nach einer Zeit automatisch weiter, sofort gleichzeitig mit dem nächsten oder wartet auf „Weiter“. „Ab hier“ springt zu einem Schritt, ⧉ kopiert ihn, + fügt dahinter ein. Rückfragen gibt es nur einmal beim Start. Der Admin-Tab muss offen bleiben, solange automatische Schritte laufen."));

    wurzel.replaceChildren(box);
    if (p) {
      if (offen) entwurfZurueck(offen);
      formularUmschalten();
    }
    zeitZeichnen();
  }

  /* Alle Formularwerte als Liste (id → Wert) - fürs Neuzeichnen. */
  function schrittEntwurf() {
    const werte = {};
    document.querySelectorAll(".gw-db-form [id^='gw-db-']").forEach((e) => {
      if ("value" in e && e.tagName !== "BUTTON") werte[e.id] = e.value;
    });
    return werte;
  }
  function entwurfZurueck(werte) {
    Object.keys(werte).forEach((id) => setzen(id, werte[id]));
  }

  window.fhDrehbuch = {
    montieren: function (ziel) {
      wurzel = ziel;
      if (lauf.aktiv && plaene.length) { zeichnen(); return; }
      zeichnen();
      laden();
    },
    stoppen: stoppen
  };
})();
