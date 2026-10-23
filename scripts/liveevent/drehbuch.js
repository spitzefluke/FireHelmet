/* ======================================================
   DREHBUCH FÜR LIVE-EVENTS (Admin-Bereich, Migration 65)
   ---------------------------------------------------
   Ein ganzes Event vorab bauen: Text → Disco → währenddessen Text
   → Konfetti → … Jeder Schritt hat einen Modus:

     automatisch   läuft, wartet „sek“ Sekunden, dann kommt der
                   nächste Schritt von allein
     von Hand      läuft, dann wartet das Drehbuch auf „Weiter“

   Schritt-Arten: Text (Banderole für alle), Story (auch Disco),
   Story beenden (Disco/Schatzregen ausklingen), Effekt
   (Konfetti/Blitz/Sound), Pause.

   WICHTIG: Abgespielt wird im Browser des Admins. Er sendet jeden
   Schritt über genau die Wege, die auch die Einzelknöpfe benutzen
   (liveSend, gwStoryStart, admin_live_story_beenden). Der Tab muss
   also offen bleiben, solange automatische Schritte laufen. Die
   Besucher-Seite und ihre Rechte ändern sich nicht.

   Alle Texte kommen per textContent ins DOM - nie als Markup.
   Geladen wird die Datei erst bei Bedarf (fhNachladen("drehbuch")),
   eingehängt von admin-gateway.js über gwDrehbuchStarten().
====================================================== */

(function () {
  "use strict";

  const ARTEN = { text: "Text", story: "Story", story_ende: "Story beenden", effekt: "Effekt", pause: "Pause" };
  const EFFEKTE = { konfetti: "Konfetti", blitz: "Blitz", sound: "Sound" };
  const FARBE_ART = { text: "papier", story_ende: "rot", effekt: "kalt", pause: "wasser" };
  const MAX_SCHRITTE = 60;

  let plaene = [];
  let gewaehlt = null;   // plan_id
  let wurzel = null;
  let bearbeite = -1;    // Index des Schritts, der gerade im Formular steht

  /* Abspiel-Zustand lebt im Modul, damit ein Neuzeichnen des
     Admin-Bereichs das laufende Drehbuch nicht anhält. */
  const lauf = { aktiv: false, pausiert: false, wartet: false, naechster: 0, uhr: null, ticker: null, bis: 0, rest: 0 };

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

  /* ------------------------------------------------------
     LADEN / SPEICHERN
  ------------------------------------------------------ */
  async function laden() {
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from("event_drehbuecher").select("plan_id, name, schritte, schritt").order("name");
      if (error) throw error;
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
      const { error } = await supabaseClient.from("event_drehbuecher")
        .update(Object.assign({ geaendert_am: new Date().toISOString() }, felder)).eq("plan_id", p.plan_id);
      if (error) throw error;
      Object.assign(p, felder);
      zeichnen();
      if (meldung) status(meldung, false);
      return true;
    } catch (err) {
      status("Speichern fehlgeschlagen: " + ((err && err.message) || err), true);
      return false;
    }
  }

  /* ------------------------------------------------------
     BESCHREIBUNG EINES SCHRITTS
  ------------------------------------------------------ */
  function titel(s) {
    if (s.art === "text") return "Text: „" + (s.text.length > 60 ? s.text.slice(0, 57) + "…" : s.text) + "“";
    if (s.art === "story") return "Story: " + storyName(s.story);
    if (s.art === "effekt") return "Effekt: " + (EFFEKTE[s.effekt] || s.effekt);
    return ARTEN[s.art] || s.art;
  }
  function danach(s) {
    return s.modus === "auto" ? "danach automatisch nach " + (s.sek || 0) + " s" : "danach wartet es auf „Weiter“";
  }

  /* ------------------------------------------------------
     ABSPIELEN
  ------------------------------------------------------ */
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
    if (s.art === "story") return !!(await gwStoryStart(s.story));
    if (s.art === "story_ende") {
      try {
        const { error } = await supabaseClient.rpc("admin_live_story_beenden");
        if (error) throw error;
        if (typeof gwStoryLageLaden === "function") gwStoryLageLaden();
        return true;
      } catch (err) {
        status("Beenden fehlgeschlagen: " + ((err && err.message) || err), true);
        return false;
      }
    }
    return false;
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
    lauf.wartet = false; lauf.pausiert = false;
    if (i >= p.schritte.length) { ende("✓ Drehbuch zu Ende."); return; }
    const s = p.schritte[i];
    status("Schritt " + (i + 1) + " läuft: " + titel(s), false);
    lauf.naechster = i + 1;
    zeitZeichnen();
    const ok = await aktion(s);
    if (!lauf.aktiv) return; // währenddessen gestoppt
    if (!ok) {
      ende("");
      status("Schritt " + (i + 1) + " fehlgeschlagen – Drehbuch angehalten. „Start“ macht beim selben Schritt weiter.", true);
      await speichern({ schritt: i });
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
    if (!confirm("„" + p.name + "“ ab Schritt " + (ab + 1) + " für alle abspielen? Jeder Schritt geht sofort an alle Besucher. Der Tab muss offen bleiben, solange automatische Schritte laufen.")) return;
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

  /* ------------------------------------------------------
     BEARBEITEN
  ------------------------------------------------------ */
  async function neu() {
    const name = (prompt("Name des neuen Drehbuchs (z. B. „Event 4 – Die Disco-Nacht“):") || "").trim();
    if (!name) return;
    try {
      const { data, error } = await supabaseClient.from("event_drehbuecher").insert({ name: name.slice(0, 60) }).select("plan_id").single();
      if (error) throw error;
      gewaehlt = data.plan_id;
      await laden();
      status("✓ Drehbuch angelegt.", false);
    } catch (err) {
      status("Anlegen fehlgeschlagen: " + ((err && err.message) || err), true);
    }
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
      const { error } = await supabaseClient.from("event_drehbuecher").delete().eq("plan_id", p.plan_id);
      if (error) throw error;
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
    speichern({ schritte: neue, schritt: i < p.schritt ? p.schritt - 1 : Math.min(p.schritt, neue.length) });
    if (bearbeite === i) bearbeite = -1;
  }
  function schrittVerschieben(i, d) {
    const p = plan();
    const j = i + d;
    if (!p || j < 0 || j >= p.schritte.length) return;
    const neue = p.schritte.slice();
    [neue[i], neue[j]] = [neue[j], neue[i]];
    speichern({ schritte: neue });
  }

  function schrittAusFormular() {
    const w = (id) => document.getElementById(id);
    const art = w("gw-db-art").value;
    const s = { art: art, modus: w("gw-db-modus").value };
    if (s.modus === "auto") {
      const sek = parseInt(w("gw-db-sek").value, 10);
      if (!(sek >= 0 && sek <= 3600)) { status("Dauer zwischen 0 und 3600 Sekunden.", true); return null; }
      s.sek = sek;
    }
    if (art === "text") {
      const text = w("gw-db-text").value.trim();
      if (!text || text.length > 280) { status("Text: 1 bis 280 Zeichen.", true); return null; }
      s.text = text;
      s.farbe = w("gw-db-farbe").value || "#f0c96a";
      const von = w("gw-db-von").value.trim();
      if (von) s.von = von.slice(0, 60);
    } else if (art === "story") {
      s.story = w("gw-db-story").value;
    } else if (art === "effekt") {
      s.effekt = w("gw-db-effekt").value;
    }
    return s;
  }

  async function schrittSpeichern() {
    const p = plan();
    if (!p) return;
    const s = schrittAusFormular();
    if (!s) return;
    const neue = p.schritte.slice();
    if (bearbeite >= 0) neue[bearbeite] = s;
    else {
      if (neue.length >= MAX_SCHRITTE) { status("Höchstens " + MAX_SCHRITTE + " Schritte.", true); return; }
      neue.push(s);
    }
    const ersetzt = bearbeite >= 0;
    bearbeite = -1;
    await speichern({ schritte: neue }, ersetzt ? "✓ Schritt ersetzt." : "✓ Schritt hinzugefügt.");
  }

  function schrittTesten(s) {
    const v = window.fhLiveVorschau;
    if (!v) { status("Vorschau nicht verfügbar.", true); return; }
    if (s.art === "text") v.banderole(s.text, s.farbe || "#f0c96a", s.von || "");
    else if (s.art === "effekt") v.pulse(s.effekt);
  }

  function formularFuellen(s) {
    const w = (id) => document.getElementById(id);
    w("gw-db-art").value = s.art;
    w("gw-db-modus").value = s.modus || "hand";
    w("gw-db-sek").value = s.sek != null ? s.sek : 8;
    w("gw-db-text").value = s.text || "";
    w("gw-db-farbe").value = s.farbe || "#f0c96a";
    w("gw-db-von").value = s.von || "";
    if (s.story) w("gw-db-story").value = s.story;
    if (s.effekt) w("gw-db-effekt").value = s.effekt;
    formularUmschalten();
  }

  function formularUmschalten() {
    const art = document.getElementById("gw-db-art").value;
    const modus = document.getElementById("gw-db-modus").value;
    const zeige = (id, an) => { const e = document.getElementById(id); if (e) e.hidden = !an; };
    zeige("gw-db-g-text", art === "text");
    zeige("gw-db-story", art === "story");
    zeige("gw-db-effekt", art === "effekt");
    zeige("gw-db-sek-gruppe", modus === "auto");
  }

  /* ------------------------------------------------------
     ZEICHNEN
  ------------------------------------------------------ */
  function knopf(eltern, beschriftung, klick, extra, titelText) {
    const k = el("button", "gw-live-knopf" + (extra ? " " + extra : ""), beschriftung);
    k.type = "button";
    if (titelText) k.setAttribute("aria-label", titelText);
    k.addEventListener("click", klick);
    eltern.appendChild(k);
    return k;
  }

  function option(wert, text) {
    const o = el("option", null, text);
    o.value = wert;
    return o;
  }

  function zeichnen() {
    if (!wurzel || !wurzel.isConnected) {
      const neu = document.getElementById("gw-db-wurzel");
      if (!neu) return;
      wurzel = neu;
    }
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
      gewaehlt = wahl.value || null; bearbeite = -1; zeichnen();
    });
    kopf.appendChild(wahl);
    knopf(kopf, "Neues Drehbuch", neu);
    knopf(kopf, "Umbenennen", umbenennen).disabled = !p;
    knopf(kopf, "Löschen", loeschen).disabled = !p;
    box.appendChild(kopf);

    /* Schritte */
    const liste = el("ol", "gw-plan-ablauf");
    if (!p) {
      liste.appendChild(el("li", "gw-plan-leer", "Lege ein Drehbuch an und baue dein Event Schritt für Schritt."));
    } else if (!p.schritte.length) {
      liste.appendChild(el("li", "gw-plan-leer", "Noch keine Schritte – unten einen Text, eine Story oder einen Effekt hinzufügen."));
    }
    if (p) p.schritte.forEach((s, i) => {
      const eintrag = s.art === "story" ? (typeof GW_STORYS !== "undefined" ? GW_STORYS.find((x) => x[0] === s.story) : null) : null;
      const farbe = s.art === "story" ? (eintrag ? eintrag[3] : "rot") : FARBE_ART[s.art] || "rot";
      const zustand = i < p.schritt ? "ist-gelaufen" : i === p.schritt ? "ist-naechste" : "";
      const li = el("li", "gw-story gw-plan-schritt ist-" + farbe + (zustand ? " " + zustand : ""));
      const text = el("div", "gw-story-text");
      text.appendChild(el("span", "gw-story-name", (i + 1) + ". " + titel(s) + (i < p.schritt ? "  ✓" : "")));
      text.appendChild(el("span", "gw-story-info", (i === p.schritt ? "Als Nächstes · " : "") + danach(s) + (s.art === "text" && s.von ? " · von " + s.von : "")));
      const kn = el("div", "gw-story-knoepfe");
      knopf(kn, "↑", () => schrittVerschieben(i, -1), "ist-klein", "Nach oben").disabled = i === 0;
      knopf(kn, "↓", () => schrittVerschieben(i, 1), "ist-klein", "Nach unten").disabled = i === p.schritte.length - 1;
      knopf(kn, "✎", () => { bearbeite = i; zeichnen(); formularFuellen(s); }, "ist-klein", "Schritt bearbeiten");
      knopf(kn, "✕", () => schrittWeg(i), "ist-klein", "Schritt entfernen");
      if (s.art === "text" || s.art === "effekt") knopf(kn, "Bei mir testen", () => schrittTesten(s));
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

      /* Formular */
      const form = el("div", "gw-plan-fuss gw-db-form");
      const art = el("select", "gw-feld"); art.id = "gw-db-art"; art.setAttribute("aria-label", "Art des Schritts");
      Object.keys(ARTEN).forEach((k) => art.appendChild(option(k, ARTEN[k])));
      art.addEventListener("change", formularUmschalten);

      const gText = el("span", "gw-db-gruppe"); gText.id = "gw-db-g-text";
      const text = el("input", "gw-feld gw-feld-breit"); text.type = "text"; text.id = "gw-db-text"; text.maxLength = 280; text.placeholder = "Text für alle (bis 280 Zeichen)"; text.setAttribute("aria-label", "Text");
      const farbe = el("input", "gw-feld"); farbe.type = "color"; farbe.id = "gw-db-farbe"; farbe.value = "#f0c96a"; farbe.setAttribute("aria-label", "Farbe");
      const von = el("input", "gw-feld"); von.type = "text"; von.id = "gw-db-von"; von.maxLength = 60; von.placeholder = "Absender (optional)"; von.setAttribute("aria-label", "Absender");
      gText.append(text, farbe, von);

      const story = el("select", "gw-feld"); story.id = "gw-db-story"; story.setAttribute("aria-label", "Story");
      storyListe().forEach((s) => story.appendChild(option(s[0], s[1])));
      const effekt = el("select", "gw-feld"); effekt.id = "gw-db-effekt"; effekt.setAttribute("aria-label", "Effekt");
      Object.keys(EFFEKTE).forEach((k) => effekt.appendChild(option(k, EFFEKTE[k])));

      const modus = el("select", "gw-feld"); modus.id = "gw-db-modus"; modus.setAttribute("aria-label", "Wie geht es danach weiter");
      modus.appendChild(option("auto", "danach automatisch weiter"));
      modus.appendChild(option("hand", "danach auf „Weiter“ warten"));
      modus.value = "auto";
      modus.addEventListener("change", formularUmschalten);
      const sekGruppe = el("span", "gw-db-gruppe"); sekGruppe.id = "gw-db-sek-gruppe";
      const sek = el("input", "gw-feld"); sek.type = "number"; sek.id = "gw-db-sek"; sek.min = "0"; sek.max = "3600"; sek.value = "8"; sek.setAttribute("aria-label", "Sekunden bis zum nächsten Schritt");
      sekGruppe.append(sek, el("span", "gw-story-info", "Sekunden"));

      form.append(art, gText, story, effekt, modus, sekGruppe);
      knopf(form, bearbeite >= 0 ? "Schritt ersetzen" : "Schritt hinzufügen", schrittSpeichern, "ist-alle");
      if (bearbeite >= 0) knopf(form, "Abbrechen", () => { bearbeite = -1; zeichnen(); });
      box.appendChild(form);
    }

    const st = el("p", "gw-live-status"); st.id = "gw-db-status"; st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite");
    box.appendChild(st);
    box.appendChild(el("p", "gateway-status-sub",
      "Baue das Event vorab: Text, Storys (auch Disco), Effekte und Pausen in fester Reihenfolge. Jeder Schritt läuft entweder nach einer Zeit automatisch weiter oder wartet auf „Weiter“. Ein Text direkt nach „Story: Disco“ erscheint also, während die Disco läuft. Der Admin-Tab muss offen bleiben, solange automatische Schritte laufen."));

    wurzel.replaceChildren(box);
    if (p) formularUmschalten();
    zeitZeichnen();
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
