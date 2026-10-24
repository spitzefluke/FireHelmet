/* ======================================================
   ENTKOMME DER ZELLE (Escape Room in der „Verwahrung“)
   ---------------------------------------------------
   Gibt es nur, solange die Seite nach einer verlorenen Sternenreise
   die Verwahrung zeigt (html.fh-verwahrung, sternenreise.js). Man
   öffnet es über „Zelle verlassen“ auf der Akte oder „Ausbruch
   versuchen“ in der Statusleiste.

   DIE KETTE
     1. Pritsche        unter der Matratze: ein Löffel
     2. lockerer Stein  mit dem Löffel heraushebeln: ein Blechstück
     3. Lüftungsgitter  vier Schrauben mit dem Blechstück lösen:
                        die Notiz des Vorgängers
     4. Hausordnung     der Türcode = Zahl der Wörter jeder Regel
                        (aus den Texten in der gerade gewählten Sprache)
     5. Tür             Code am Tastenfeld - aufgehen lässt sie sich
                        nur, solange das Auge zu ist: „Wenn ihr
                        angesehen werdet, schaut zurück.“ Ein Klick aufs
                        Auge schließt es für sechs Sekunden.
   Jede Minute kommt die Kontrolle (Taschenlampe, drei Sekunden nichts
   anfassen). „Tipp“ hilft Schritt für Schritt.

   Der Stand liegt je Verwahrung im localStorage („fhZelle“), damit
   ein Neuladen nicht von vorn beginnt. Wer entkommt, bekommt einmal
   je Verwahrung 250 Dublonen (addCurrency aus wheel.js, nicht in der
   Admin-Vorschau); die Seite zeigt ihm danach keine Gitter mehr.

   Alle Texte per textContent und t() (i18n.js: zelle.*).
   Geladen erst bei Bedarf: fhNachladen("zelle").
     fhZelle.start({ schluessel, belohnung, beimEntkommen })
     fhZelle.weg()
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function tf(key, fallback, werte) {
    let s = t(key, fallback);
    Object.keys(werte || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(werte[k])); });
    return s;
  }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  /* Symbole: lucide (ISC), stroke-width 1.6 */
  const SYMBOL = {
    loeffel: '<path d="M15 4a3 3 0 0 1 4 4l-2 2a3 3 0 0 1-4-4z"/><path d="m14 10-9 9a1.5 1.5 0 0 1-2-2l9-9"/>',
    blech: '<rect width="16" height="6" x="4" y="9" rx="1"/><path d="M8 9v6M12 9v6M16 9v6"/>',
    notiz: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/><path d="M8 13h8M8 17h5"/>',
    tipp: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    tuer: '<path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/>',
  };
  function symbol(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = SYMBOL[name] || "";   // feste Zeichenketten oben, keine Nutzerdaten
    return s;
  }
  function knopf(text, klasse, klick, sym) {
    const k = el("button", "rs-knopf" + (klasse ? " " + klasse : ""));
    k.type = "button";
    if (sym) k.appendChild(symbol(sym));
    k.appendChild(document.createTextNode(text));
    if (klick) k.addEventListener("click", klick);
    return k;
  }
  function gemerkt(schl) { try { return localStorage.getItem(schl); } catch (e) { return null; } }
  function merken(schl, wert) { try { localStorage.setItem(schl, wert); } catch (e) { /* Privatmodus */ } }

  const KONTROLLE_ALLE = 60000, KONTROLLE_DAUER = 3200, AUGE_ZU = 6000, BELOHNUNG = 250;
  const REGELN = [
    ["1", "Bleibt in euren Zellen."],
    ["2", "Wenn ihr angesehen werdet, schaut zurück."],
    ["3", "Es gibt keinen Weg zurück zur Arche."],
    ["4", "Das Auge schläft nicht."],
  ];
  function regel(i) { return t("reise.welt.v.regel" + REGELN[i][0], REGELN[i][1]); }
  /* Der Code: Wörter je Regel in der gerade gewählten Sprache. */
  function code() {
    return REGELN.map(function (_, i) { return String(Math.min(9, regel(i).trim().split(/\s+/).length)); }).join("");
  }

  let lauf = null;

  /* ------------------------------------------------------
     STAND
  ------------------------------------------------------ */
  function standLaden(schl) {
    try {
      const s = JSON.parse(gemerkt("fhZelle") || "null");
      if (s && s.schl === schl) return s;
    } catch (e) { /* neu */ }
    return { schl: schl, start: Date.now(), dinge: [], stein: false, schrauben: 0, gitter: false, notiz: false, offen: false, tipp: 0 };
  }
  function standMerken() { if (lauf) merken("fhZelle", JSON.stringify(lauf.s)); }
  function hat(ding) { return lauf.s.dinge.indexOf(ding) >= 0; }
  function nimm(ding) { if (!hat(ding)) lauf.s.dinge.push(ding); standMerken(); inventar(); }

  function meldung(text, art) {
    const m = lauf && lauf.ref.meldung;
    if (!m) return;
    m.textContent = text;
    m.className = "zl-meldung" + (art ? " ist-" + art : "");
  }
  function gesperrt() {
    if (lauf.kontrolle) { meldung(t("zelle.kontrolleStill", "Kontrolle! Halt still, bis das Licht weg ist."), "rot"); return true; }
    return false;
  }

  /* ------------------------------------------------------
     DINGE IM RAUM
  ------------------------------------------------------ */
  function pritsche() {
    if (gesperrt()) return;
    if (!hat("loeffel")) { nimm("loeffel"); meldung(t("zelle.pritsche.fund", "Unter der dünnen Matratze klemmt ein Löffel. Du steckst ihn ein."), "gut"); return; }
    meldung(t("zelle.pritsche.leer", "Nur eine dünne Matratze. Sie riecht nach Rost."));
  }

  function stein() {
    if (gesperrt()) return;
    if (lauf.s.stein) { meldung(t("zelle.stein.leer", "Das Loch in der Wand ist leer.")); return; }
    if (!hat("loeffel")) { meldung(t("zelle.stein.fest", "Ein Stein sitzt locker. Mit den Fingern bekommst du ihn nicht heraus.")); return; }
    lauf.s.stein = true; nimm("blech");
    lauf.ref.stein.classList.add("ist-raus");
    meldung(t("zelle.stein.fund", "Mit dem Löffel hebelst du den Stein heraus. Dahinter liegt ein flaches Blechstück."), "gut");
  }

  function schraube(i) {
    if (gesperrt()) return;
    if (lauf.s.gitter) return;
    if (!hat("blech")) { meldung(t("zelle.gitter.fest", "Vier Schrauben halten das Lüftungsgitter. Mit dem Löffel rutschst du ab.")); return; }
    const k = lauf.ref.schrauben[i];
    if (k.classList.contains("ist-los")) return;
    k.classList.add("ist-los");
    k.disabled = true;
    lauf.s.schrauben++;
    if (lauf.s.schrauben >= 4) {
      lauf.s.gitter = true;
      lauf.ref.gitter.classList.add("ist-offen");
      meldung(t("zelle.gitter.offen", "Das Gitter fällt dir in die Hände. Im Schacht liegt ein zusammengefalteter Zettel."), "gut");
    } else {
      meldung(tf("zelle.gitter.schraube", "Eine Schraube ist los. Noch {n}.", { n: 4 - lauf.s.schrauben }));
    }
    standMerken();
  }

  function schacht() {
    if (gesperrt()) return;
    if (!lauf.s.gitter) { schraube(lauf.ref.schrauben.findIndex(function (k) { return !k.classList.contains("ist-los"); })); return; }
    if (!hat("notiz")) nimm("notiz");
    lauf.s.notiz = true;
    standMerken();
    zettel(t("zelle.notiz.titel", "Notiz des Vorgängers"), [
      t("zelle.notiz.1", "Wer das hier findet: Der Code der Tür steht an der Wand."),
      t("zelle.notiz.2", "Zähl die Wörter jeder Regel. Eine Ziffer pro Regel, von oben nach unten."),
      t("zelle.notiz.3", "Und die Tür geht nie auf, solange es dich ansieht."),
    ]);
  }

  function hausordnung() {
    if (gesperrt()) return;
    zettel(t("reise.welt.v.ordnung", "Hausordnung"), REGELN.map(function (_, i) { return (i + 1) + ". " + regel(i); }));
  }

  function zettel(titel, zeilen) {
    const z = lauf.ref.zettel;
    z.replaceChildren();
    z.appendChild(el("div", "rs-kicker ist-rot", titel));
    zeilen.forEach(function (x) { z.appendChild(el("p", null, x)); });
    z.appendChild(knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { z.hidden = true; }));
    z.hidden = false;
    z.lastChild.focus();
  }

  /* Das Auge in der Ecke: ein Klick = zurückschauen, es schließt sich. */
  function auge() {
    if (gesperrt()) return;
    if (lauf.augeZu) return;
    lauf.augeZu = true;
    lauf.ref.auge.classList.add("ist-zu");
    meldung(t("zelle.auge.zu", "Du starrst zurück. Das Auge schließt sich – für ein paar Sekunden."), "gut");
    clearTimeout(lauf.augeUhr);
    lauf.augeUhr = setTimeout(function () {
      if (!lauf) return;
      lauf.augeZu = false;
      lauf.ref.auge.classList.remove("ist-zu");
    }, AUGE_ZU);
  }

  /* Tastenfeld */
  function taste(z) {
    if (gesperrt()) return;
    if (lauf.s.offen) return;
    if (z === "C") lauf.eingabe = "";
    else if (lauf.eingabe.length < 4) lauf.eingabe += z;
    lauf.ref.anzeige.textContent = (lauf.eingabe + "____").slice(0, 4).split("").join(" ");
    if (lauf.eingabe.length === 4) {
      if (lauf.eingabe === code()) {
        lauf.s.offen = true;
        standMerken();
        lauf.ref.anzeige.textContent = t("zelle.tuer.offenAnzeige", "OFFEN");
        lauf.ref.tuer.classList.add("ist-entsperrt");
        meldung(t("zelle.tuer.code", "Das Schloss klickt. Jetzt nur noch die Tür aufziehen."), "gut");
      } else {
        meldung(t("zelle.tuer.falsch", "Falsch. Ein rotes Licht blinkt – das Auge hat es gesehen."), "rot");
        lauf.ref.auge.classList.add("ist-wach");
        setTimeout(function () { if (lauf) lauf.ref.auge.classList.remove("ist-wach"); }, 900);
        lauf.eingabe = "";
        setTimeout(function () { if (lauf && !lauf.s.offen) lauf.ref.anzeige.textContent = "_ _ _ _"; }, 700);
      }
    }
  }

  function tuer() {
    if (gesperrt()) return;
    if (!lauf.s.offen) { meldung(t("zelle.tuer.zu", "Die Tür ist verriegelt. Daneben ein Tastenfeld für vier Ziffern.")); return; }
    if (!lauf.augeZu) { meldung(t("zelle.tuer.auge", "Die Klinke gibt nach – doch das Auge sieht dich. Die Tür rührt sich nicht."), "rot"); return; }
    entkommen();
  }

  /* ------------------------------------------------------
     TIPPS UND KONTROLLE
  ------------------------------------------------------ */
  function tipp() {
    const s = lauf.s;
    const text = !hat("loeffel") ? t("zelle.tipp.1", "Schau dir die Pritsche genauer an.")
      : !s.stein ? t("zelle.tipp.2", "Ein Stein in der Wand sitzt nicht ganz fest. Womit könntest du hebeln?")
      : !s.gitter ? t("zelle.tipp.3", "Das Blechstück passt in Schraubenköpfe. Oben links ist ein Gitter.")
      : !s.notiz ? t("zelle.tipp.4", "Im Lüftungsschacht liegt etwas.")
      : !s.offen ? t("zelle.tipp.5", "Lies die Hausordnung. Wie viele Wörter hat jede Regel?")
      : t("zelle.tipp.6", "Regel 2: Wenn ihr angesehen werdet, schaut zurück. Klick aufs Auge, dann schnell zur Tür.");
    s.tipp++;
    standMerken();
    meldung(text, "tipp");
  }

  function kontrolle() {
    if (!lauf || lauf.fertig) return;
    lauf.kontrolle = true;
    lauf.ref.raum.classList.add("ist-kontrolle");
    meldung(t("zelle.kontrolle", "Schritte im Gang – Kontrolle! Rühr dich nicht."), "rot");
    lauf.kontrollUhr = setTimeout(function () {
      if (!lauf) return;
      lauf.kontrolle = false;
      lauf.ref.raum.classList.remove("ist-kontrolle");
      meldung(t("zelle.kontrolleVorbei", "Die Schritte entfernen sich."));
    }, KONTROLLE_DAUER);
  }

  function zeitText(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function inventar() {
    const inv = lauf.ref.inventar;
    inv.replaceChildren();
    if (!lauf.s.dinge.length) { inv.appendChild(el("span", "rs-leise", t("zelle.taschenLeer", "Deine Taschen sind leer."))); return; }
    lauf.s.dinge.forEach(function (d) {
      const b = el("span", "zl-ding");
      b.appendChild(symbol(d === "notiz" ? "notiz" : d));
      b.appendChild(document.createTextNode(t("zelle.ding." + d, d === "loeffel" ? "Löffel" : d === "blech" ? "Blechstück" : "Notiz")));
      if (d === "notiz") { b.classList.add("ist-klickbar"); b.setAttribute("role", "button"); b.tabIndex = 0; b.addEventListener("click", schacht); }
      inv.appendChild(b);
    });
  }

  /* ------------------------------------------------------
     ENTKOMMEN
  ------------------------------------------------------ */
  function entkommen() {
    lauf.fertig = true;
    clearInterval(lauf.uhr); clearTimeout(lauf.naechsteUhr); clearTimeout(lauf.kontrollUhr);
    const zeit = Date.now() - lauf.s.start;
    const schonBelohnt = gemerkt("fhZelleEntkommen") === lauf.opt.schluessel;
    merken("fhZelleEntkommen", lauf.opt.schluessel);
    try { localStorage.removeItem("fhZelle"); } catch (e) { /* egal */ }
    const gibt = lauf.opt.belohnung && !schonBelohnt;
    if (gibt && typeof window.addCurrency === "function") window.addCurrency(BELOHNUNG);

    const k = el("div", "zl-ende");
    k.setAttribute("role", "dialog");
    k.setAttribute("aria-label", t("zelle.ende.titel", "Ausgebrochen."));
    k.appendChild(el("div", "rs-kicker", t("zelle.ende.kicker", "Zelle C-17 · leer")));
    k.appendChild(el("div", "rs-gross", t("zelle.ende.titel", "Ausgebrochen.")));
    k.appendChild(el("p", "rs-text", tf("zelle.ende.text", "Die Tür fällt hinter dir ins Schloss. Zeit: {zeit}, Tipps: {tipps}. Irgendwo hinter dir öffnet sich ein Auge.", { zeit: zeitText(zeit), tipps: lauf.s.tipp })));
    if (gibt) k.appendChild(el("p", "zl-belohnung", tf("zelle.ende.belohnung", "+{n} Dublonen für den Ausbruch", { n: BELOHNUNG })));
    k.appendChild(knopf(t("zelle.ende.weiter", "Auf die Flucht"), "ist-haupt", function () {
      const fertig = lauf && lauf.opt.beimEntkommen;
      weg();
      if (typeof fertig === "function") fertig();
    }, "tuer"));
    lauf.ref.raum.appendChild(k);
    k.lastChild.focus();
  }

  /* ------------------------------------------------------
     DER RAUM
  ------------------------------------------------------ */
  function teil(eltern, klasse, beschriftung, klick) {
    const b = el("button", "zl-teil " + klasse);
    b.type = "button";
    b.setAttribute("aria-label", beschriftung);
    b.title = beschriftung;
    if (klick) b.addEventListener("click", klick);
    eltern.appendChild(b);
    return b;
  }

  function bauen() {
    const R = lauf.ref = {};
    const w = el("div", "zl");
    w.id = "fh-zelle";
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-label", t("zelle.name", "Entkomme der Zelle"));

    const kopf = el("div", "zl-kopf");
    const titel = el("div", "zl-titel");
    titel.appendChild(el("div", "rs-kicker ist-rot", t("zelle.kicker", "Verwahranlage Terra Nova · Zelle C-17")));
    titel.appendChild(el("div", "rs-titel", t("zelle.name", "Entkomme der Zelle")));
    kopf.appendChild(titel);
    const rechts = el("div", "zl-kopf-rechts");
    R.zeit = rechts.appendChild(el("span", "rs-ziffern zl-zeit", "00:00"));
    R.kontrolle = rechts.appendChild(el("span", "rs-leise rs-ziffern"));
    rechts.appendChild(knopf(t("zelle.tipp", "Tipp"), "ist-leise", tipp, "tipp"));
    rechts.appendChild(knopf(t("zelle.schliessen", "Schließen"), "ist-leise", weg, "x"));
    kopf.appendChild(rechts);
    w.appendChild(kopf);

    const raum = R.raum = el("div", "zl-raum");
    raum.appendChild(el("div", "zl-wand"));
    raum.appendChild(el("div", "zl-boden"));
    raum.appendChild(el("div", "zl-lampe")).setAttribute("aria-hidden", "true");

    /* Lüftungsgitter mit vier Schrauben */
    R.gitter = el("div", "zl-gitter");
    const schacht0 = teil(R.gitter, "zl-schacht", t("zelle.gitter.name", "Lüftungsgitter"), schacht);
    schacht0.appendChild(el("span", "zl-zettel-im-schacht")).setAttribute("aria-hidden", "true");
    R.schrauben = [0, 1, 2, 3].map(function (i) {
      const b = teil(R.gitter, "zl-schraube zl-schraube-" + i, tf("zelle.gitter.schraubeName", "Schraube {n}", { n: i + 1 }), function () { schraube(i); });
      if (lauf.s.gitter || i < lauf.s.schrauben) { b.classList.add("ist-los"); b.disabled = true; }
      return b;
    });
    if (lauf.s.gitter) R.gitter.classList.add("ist-offen");
    raum.appendChild(R.gitter);

    R.stein = teil(raum, "zl-stein" + (lauf.s.stein ? " ist-raus" : ""), t("zelle.stein.name", "Stein in der Wand"), stein);
    teil(raum, "zl-ordnung", t("reise.welt.v.ordnung", "Hausordnung"), hausordnung).appendChild(el("span", null, t("reise.welt.v.ordnung", "Hausordnung")));
    teil(raum, "zl-pritsche", t("zelle.pritsche.name", "Pritsche"), pritsche);

    /* Tür mit Tastenfeld */
    R.tuer = teil(raum, "zl-tuer" + (lauf.s.offen ? " ist-entsperrt" : ""), t("zelle.tuer.name", "Tür"), tuer);
    R.tuer.appendChild(el("span", "zl-klinke")).setAttribute("aria-hidden", "true");
    const feld = el("div", "zl-feld");
    feld.setAttribute("role", "group");
    feld.setAttribute("aria-label", t("zelle.tuer.feld", "Tastenfeld"));
    R.anzeige = feld.appendChild(el("div", "zl-anzeige rs-ziffern", lauf.s.offen ? t("zelle.tuer.offenAnzeige", "OFFEN") : "_ _ _ _"));
    const tasten = el("div", "zl-tasten");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0"].forEach(function (z) {
      const b = el("button", "zl-taste", z);
      b.type = "button";
      b.addEventListener("click", function () { taste(z); });
      tasten.appendChild(b);
    });
    feld.appendChild(tasten);
    raum.appendChild(feld);

    /* Das Auge in der Ecke */
    R.auge = teil(raum, "zl-auge", t("zelle.auge.name", "Das Auge – zurückschauen"), auge);
    R.auge.appendChild(el("span", "zl-pupille"));

    raum.appendChild(el("div", "zl-licht")).setAttribute("aria-hidden", "true");
    R.zettel = el("div", "zl-zettel");
    R.zettel.setAttribute("role", "dialog");
    R.zettel.hidden = true;
    raum.appendChild(R.zettel);
    w.appendChild(raum);

    const fuss = el("div", "zl-fuss");
    R.meldung = fuss.appendChild(el("p", "zl-meldung"));
    R.meldung.setAttribute("role", "status");
    R.meldung.setAttribute("aria-live", "polite");
    R.inventar = fuss.appendChild(el("div", "zl-inventar"));
    w.appendChild(fuss);

    document.body.appendChild(w);
    lauf.wurzel = w;
    inventar();
    meldung(t("zelle.start", "Zelle C-17. Kalte Wände, eine Pritsche, eine Tür mit Tastenfeld. In der Ecke: das Auge."));
  }

  function weg() {
    if (!lauf) return;
    clearInterval(lauf.uhr); clearTimeout(lauf.naechsteUhr); clearTimeout(lauf.kontrollUhr); clearTimeout(lauf.augeUhr);
    document.removeEventListener("keydown", lauf.esc);
    if (lauf.wurzel) lauf.wurzel.remove();
    lauf = null;
  }

  function start(opt) {
    weg();
    opt = opt || {};
    const schl = opt.schluessel || "vorschau";
    lauf = { opt: Object.assign({}, opt, { schluessel: schl }), s: standLaden(schl), eingabe: "", augeZu: false, kontrolle: false, fertig: false };
    bauen();
    const naechste = function () { return KONTROLLE_ALLE - ((Date.now() - lauf.s.start) % KONTROLLE_ALLE); };
    lauf.uhr = setInterval(function () {
      if (!lauf || lauf.fertig) return;
      lauf.ref.zeit.textContent = zeitText(Date.now() - lauf.s.start);
      lauf.ref.kontrolle.textContent = tf("zelle.naechsteKontrolle", "Kontrolle in {zeit}", { zeit: zeitText(naechste()) });
    }, 500);
    lauf.naechsteUhr = setTimeout(function tick() {
      if (!lauf || lauf.fertig) return;
      kontrolle();
      lauf.naechsteUhr = setTimeout(tick, KONTROLLE_ALLE);
    }, naechste());
    lauf.esc = function (e) { if (e.key === "Escape") { if (lauf && lauf.ref.zettel && !lauf.ref.zettel.hidden) lauf.ref.zettel.hidden = true; else weg(); } };
    document.addEventListener("keydown", lauf.esc);
    if (RUHIG.matches) lauf.wurzel.classList.add("ist-ruhig");
  }

  window.fhZelle = { start: start, weg: weg, code: code };
})();
