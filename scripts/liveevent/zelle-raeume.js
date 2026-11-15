/* ======================================================
   AUSBRUCH AUS DER VERWAHRUNG - DIE VIER RÄUME (Migration 72)
   ---------------------------------------------------
   Nachgeladen als „zelleRaeume“ von zelle.js. Jeder Raum ist eine
   gezeichnete SVG-Szene (1280 x 720) und bekommt von zelle.js ein
   api-Objekt (Inventar, Notizbuch, Meldung, Auge, Dunkelheit,
   loesen() gegen die Datenbank). Die Hinweise kommen aus der
   Datenbank (api.daten(n)) und sind je Lauf neu gewürfelt.

   1 ZELLE C-17   dunkel, Lichtkegel. Pritsche → Löffel, Naht der
                  Matratze → Draht, Löffel + Draht = Haken. Stein mit
                  dem Löffel → Blechstück. Vier Schrauben mit dem Blech →
                  Gitter offen, mit dem Haken die Notiz angeln: die
                  Reihenfolge der Symbole. Die Kerben (Symbol + Striche)
                  stehen an vier Orten im Dunkeln. Code am Tastenfeld
                  → Datenbank. Die Tür nur, solange das Auge zu ist.
   2 SCHACHT      Labyrinth aus der Saat der Datenbank, Licht nur um
                  dich. Sensorstrahlen im Takt (+15 s, drei Schritte
                  zurück). Eine Sackgasse trägt den Anfang der
                  Notruffrequenz. Am Ende die Sicherung → Datenbank.
   3 WACHRAUM     Vier Kameras mit Symbolen, der Rundgang auf dem
                  Klemmbrett = Spind-Code → Schlüsselkarte. Terminal:
                  Passwort = Klebezettel um die Uhrzeit zurück-
                  geschoben → Datenbank. Danach zeigt es Schaltmuster
                  und Funklog. Sicherungskasten im Muster → Kamera-Auge
                  20 s aus → mit der Karte durch die Tür.
   4 KAMMER       Das Funkgerät braucht die Sicherung. Frequenz =
                  Kerbe aus dem Schacht + Funklog. Senden heißt drei
                  Sekunden halten, solange das Auge zu ist → Datenbank.

   Alle Texte per textContent und t() (i18n.js: zelle.*). Feste
   SVG-Formen kommen als Zeichenketten aus FORMEN, nie Nutzerdaten.
====================================================== */

(function () {
  "use strict";

  const W = 1280, H = 720;

  /* Formen in 24 x 24 (lucide, ISC, und einfache Grundformen). */
  const FORMEN = {
    kreis: '<circle cx="12" cy="12" r="8"/>',
    dreieck: '<path d="M12 4 20 19H4Z"/>',
    quadrat: '<rect x="5" y="5" width="14" height="14"/>',
    kreuz: '<path d="M12 4v16M4 12h16"/>',
    anker: '<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>',
    stern: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    mond: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    schaedel: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    welle: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    krone: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  };
  const SPIND_REIHE = ["anker", "stern", "mond", "schaedel", "welle", "krone"];

  function form(api, eltern, name, x, y, groesse, klasse) {
    const g = api.sv("g", { transform: "translate(" + x + " " + y + ") scale(" + (groesse / 24) + ")", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", class: klasse || "" }, eltern);
    g.innerHTML = FORMEN[name] || "";
    return g;
  }
  function formBild(api, name, groesse) {
    const box = api.sv("svg", { viewBox: "0 0 24 24", width: groesse, height: groesse, "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" });
    box.innerHTML = FORMEN[name] || "";
    return box;
  }
  function symName(api, s) { return api.t("zelle.sym." + s, s); }
  function szene(api, buehne, name) {
    return api.sv("svg", { viewBox: "0 0 " + W + " " + H, class: "zl-szene", role: "group", "aria-label": name, preserveAspectRatio: "xMidYMid meet" }, buehne);
  }
  function panel(api, buehne, klasse) {
    const p = api.el("div", "zl-panel " + (klasse || ""));
    p.hidden = true;
    buehne.appendChild(p);
    return p;
  }

  /* Zufall mit fester Saat (mulberry32) - alle sehen dasselbe Labyrinth. */
  function zufall(saat) {
    let a = saat >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ======================================================
     RAUM 1: ZELLE C-17
  ====================================================== */
  function raum1(buehne, api) {
    const t = api.t, z = api.zustand, d = api.daten(1);
    const svg = szene(api, buehne, t("zelle.raum.1", "Zelle C-17"));
    const defs = api.sv("defs", {}, svg);
    const muster = api.sv("pattern", { id: "zl-ziegel", width: 96, height: 40, patternUnits: "userSpaceOnUse" }, defs);
    api.sv("rect", { width: 96, height: 40, class: "zl-ziegel" }, muster);
    api.sv("path", { d: "M0 0H96M0 20H96M0 40H96M48 0V20M0 20V40M96 20V40", class: "zl-fuge" }, muster);
    api.sv("rect", { x: 0, y: 0, width: W, height: 540, fill: "url(#zl-ziegel)" }, svg);
    api.sv("rect", { x: 0, y: 540, width: W, height: 180, class: "zl-boden" }, svg);
    api.sv("ellipse", { cx: 700, cy: 640, rx: 46, ry: 12, class: "zl-abfluss" }, svg);
    api.sv("circle", { cx: 640, cy: 18, r: 14, class: "zl-gluehbirne" }, svg);

    /* Hausordnung - Stimmung, kein Rätsel mehr */
    const ord = api.sv("g", {}, svg);
    api.sv("rect", { x: 470, y: 90, width: 210, height: 250, rx: 4, class: "zl-papier" }, ord);
    const kopf = api.sv("text", { x: 575, y: 124, class: "zl-papier-kopf", "text-anchor": "middle" }, ord);
    kopf.textContent = t("reise.welt.v.ordnung", "Hausordnung");
    for (let i = 1; i <= 4; i++) {
      const zeile = api.sv("text", { x: 488, y: 150 + i * 40, class: "zl-papier-text" }, ord);
      zeile.textContent = i + ". " + t("reise.welt.v.regel" + i, "").slice(0, 26);
    }
    api.klickbar(ord, t("reise.welt.v.ordnung", "Hausordnung"), function () {
      api.zettel(t("reise.welt.v.ordnung", "Hausordnung"), [1, 2, 3, 4].map(function (i) { return i + ". " + t("reise.welt.v.regel" + i, ""); }));
    });

    /* Lüftungsgitter mit vier Schrauben */
    const gitter = api.sv("g", {}, svg);
    api.sv("rect", { x: 90, y: 60, width: 220, height: 130, rx: 4, class: "zl-schacht-loch" }, gitter);
    const zettelImSchacht = api.sv("rect", { x: 230, y: 130, width: 46, height: 26, class: "zl-papier", transform: "rotate(-8 253 143)" }, gitter);
    const lamellen = api.sv("g", { class: "zl-lamellen" }, gitter);
    for (let i = 0; i < 9; i++) api.sv("rect", { x: 98 + i * 23.5, y: 66, width: 12, height: 118, rx: 2 }, lamellen);
    const schacht = api.sv("g", {}, gitter);
    api.sv("rect", { x: 90, y: 60, width: 220, height: 130, fill: "transparent" }, schacht);
    api.klickbar(schacht, t("zelle.gitter.name", "Lüftungsgitter"), function () {
      if (!z.gitter) { api.meldung(api.hat("blech") ? t("zelle.gitter.schraubenZuerst", "Erst die vier Schrauben lösen.") : t("zelle.gitter.fest", "Vier Schrauben halten das Lüftungsgitter. Mit den Fingern rutschst du ab.")); return; }
      if (z.notiz) { notizZeigen(); return; }
      if (!api.hat("haken")) { api.meldung(t("zelle.schacht.weit", "Ganz hinten im Schacht liegt ein Zettel – zu weit weg für deine Finger.")); return; }
      z.notiz = true; api.merken();
      api.nimm("notiz"); api.ton("fund");
      notizZeigen();
      malen();
    });
    const schrauben = [[96, 66], [304, 66], [96, 184], [304, 184]].map(function (p, i) {
      const s = api.sv("g", { class: "zl-schraube" }, gitter);
      api.sv("circle", { cx: p[0], cy: p[1], r: 9 }, s);
      api.sv("path", { d: "M" + (p[0] - 6) + " " + p[1] + "h12", class: "zl-schlitz" }, s);
      api.klickbar(s, api.tf("zelle.gitter.schraubeName", "Schraube {n}", { n: i + 1 }), function () {
        if ((z.schrauben || []).indexOf(i) >= 0 || z.gitter) return;
        if (!api.hat("blech")) { api.meldung(t("zelle.gitter.fest", "Vier Schrauben halten das Lüftungsgitter. Mit den Fingern rutschst du ab.")); return; }
        z.schrauben = (z.schrauben || []).concat([i]);
        api.ton("klick");
        if (z.schrauben.length >= 4) { z.gitter = true; api.ton("schloss"); api.meldung(t("zelle.gitter.offen", "Das Gitter fällt dir in die Hände. Ganz hinten im Schacht liegt ein Zettel."), "gut"); }
        else api.meldung(api.tf("zelle.gitter.schraube", "Eine Schraube ist los. Noch {n}.", { n: 4 - z.schrauben.length }));
        api.merken(); malen();
      });
      return s;
    });

    /* Der lockere Stein */
    const stein = api.sv("g", {}, svg);
    const steinFl = api.sv("rect", { x: 330, y: 300, width: 72, height: 38, rx: 3, class: "zl-stein" }, stein);
    api.klickbar(stein, t("zelle.stein.name", "Lockerer Stein"), function () {
      if (z.stein) { api.meldung(t("zelle.stein.leer", "Das Loch in der Wand ist leer.")); return; }
      if (!api.hat("loeffel")) { api.meldung(t("zelle.stein.fest", "Ein Stein sitzt locker. Mit den Fingern bekommst du ihn nicht heraus.")); return; }
      z.stein = true; api.merken();
      api.nimm("blech"); api.ton("fund");
      api.meldung(t("zelle.stein.fund", "Mit dem Löffel hebelst du den Stein heraus. Dahinter liegt ein flaches Blechstück."), "gut");
      malen();
    });

    /* Pritsche und Matratze */
    const pritsche = api.sv("g", {}, svg);
    api.sv("rect", { x: 60, y: 470, width: 420, height: 26, rx: 4, class: "zl-metall" }, pritsche);
    api.sv("rect", { x: 70, y: 496, width: 16, height: 70, class: "zl-metall" }, pritsche);
    api.sv("rect", { x: 454, y: 496, width: 16, height: 70, class: "zl-metall" }, pritsche);
    api.klickbar(pritsche, t("zelle.pritsche.name", "Pritsche"), function () {
      if (z.loeffel) { api.meldung(t("zelle.pritsche.leer", "Unter der Pritsche nur Rost und Staub.")); return; }
      z.loeffel = true; api.merken();
      api.nimm("loeffel"); api.ton("fund");
      api.meldung(t("zelle.pritsche.fund", "Unter der Pritsche klemmt ein Löffel. Du steckst ihn ein."), "gut");
    });
    const matratze = api.sv("g", {}, svg);
    api.sv("rect", { x: 66, y: 440, width: 408, height: 34, rx: 10, class: "zl-stoff" }, matratze);
    api.sv("path", { d: "M300 448c10 6 22 -4 34 4s20 -2 30 4", class: "zl-naht" }, matratze);
    api.klickbar(matratze, t("zelle.matratze.name", "Matratze"), function () {
      if (z.draht) { api.meldung(t("zelle.matratze.leer", "Nur Stroh und ein muffiger Geruch.")); return; }
      z.draht = true; api.merken();
      api.nimm("draht"); api.ton("fund");
      api.meldung(t("zelle.matratze.fund", "Die Naht ist aufgerissen. Darin steckt ein steifes Drahtstück."), "gut");
    });

    /* Tür und Tastenfeld */
    const tuer = api.sv("g", {}, svg);
    const tuerFl = api.sv("rect", { x: 930, y: 110, width: 260, height: 430, rx: 4, class: "zl-tuer" }, tuer);
    for (let i = 0; i < 5; i++) api.sv("rect", { x: 950 + i * 48, y: 140, width: 10, height: 200, class: "zl-gitterstab" }, tuer);
    api.sv("circle", { cx: 1160, cy: 340, r: 9, class: "zl-metall" }, tuer);
    api.klickbar(tuer, t("zelle.tuer.name", "Zellentür"), function () {
      if (!api.geloest()) { api.meldung(t("zelle.tuer.zu", "Die Tür ist verriegelt. Daneben ein Tastenfeld für vier Ziffern.")); return; }
      if (!augeApi.zu()) { augeApi.wach(); api.ton("fehler"); api.meldung(t("zelle.tuer.auge", "Die Klinke gibt nach – doch das Auge sieht dich. Die Tür rührt sich nicht."), "rot"); return; }
      tuerFl.classList.add("ist-offen");
      api.ton("schloss");
      setTimeout(api.weiter, api.ruhig ? 0 : 500);
    });
    const feld = api.sv("g", {}, svg);
    api.sv("rect", { x: 860, y: 270, width: 52, height: 86, rx: 5, class: "zl-feld" }, feld);
    const anzeige = api.sv("rect", { x: 866, y: 278, width: 40, height: 14, class: "zl-feld-anzeige" }, feld);
    for (let i = 0; i < 9; i++) api.sv("rect", { x: 868 + (i % 3) * 12, y: 300 + Math.floor(i / 3) * 16, width: 9, height: 11, rx: 2, class: "zl-feld-taste" }, feld);
    api.klickbar(feld, t("zelle.feld.name", "Tastenfeld"), function () { tasten.hidden = false; tasten.querySelector("button").focus(); });

    /* Die Kerben: Symbol + Striche an vier Orten (nur im Licht zu sehen) */
    const ORTE = { pritsche: [150, 600], tuer: [880, 450], gitter: [330, 210], boden: [760, 600] };
    (d.kerben || []).forEach(function (k) {
      const p = ORTE[k.ort] || [640, 400];
      const g = api.sv("g", { class: "zl-kerbe" }, svg);
      form(api, g, k.sym, p[0], p[1], 20, "zl-kerbe-form");
      for (let i = 0; i < k.n; i++) {
        const block = Math.floor(i / 5), pos = i % 5, x0 = p[0] + 30 + block * 34;
        if (pos === 4) api.sv("path", { d: "M" + (x0 - 2) + " " + (p[1] + 18) + "L" + (x0 + 24) + " " + (p[1] + 2), class: "zl-kerbe-strich" }, g);
        else api.sv("path", { d: "M" + (x0 + pos * 6) + " " + p[1] + "v20", class: "zl-kerbe-strich" }, g);
      }
      api.klickbar(g, t("zelle.kerbe.name", "Kerben in der Wand"), function () {
        const text = api.tf("zelle.kerbe.text", "Kerben {ort}: ein {sym} und {n} Striche.", { ort: t("zelle.ort." + k.ort, k.ort), sym: symName(api, k.sym), n: k.n });
        api.notiz("kerbe-" + k.sym, text);
        api.meldung(text, "gut");
      });
    });

    /* Erst die Dunkelheit, dann das Auge: es glüht im Dunkeln. */
    const licht = api.dunkel(svg, 160, 0.07);
    const augeApi = api.auge(svg, 1200, 64, 22);
    svg.addEventListener("pointermove", function (e) {
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      augeApi.blick(p.x, p.y);
    });
    licht.hin(260, 470);

    /* Tastenfeld als Panel */
    const tasten = panel(api, buehne, "zl-tasten");
    const ziffern = api.el("div", "zl-tasten-anzeige rs-ziffern", api.geloest() ? t("zelle.tuer.offenAnzeige", "OFFEN") : "_ _ _ _");
    tasten.appendChild(ziffern);
    let eingabe = "";
    const tastGrid = api.el("div", "zl-tasten-grid");
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].forEach(function (zz) {
      tastGrid.appendChild(api.knopf(zz, "zl-taste", async function () {
        if (api.gesperrt() || api.geloest()) return;
        api.ton("klick");
        if (zz === "C") eingabe = "";
        else if (zz === "OK") {
          if (eingabe.length < 4) return;
          const ok = await api.loesen(eingabe);
          if (ok) {
            ziffern.textContent = t("zelle.tuer.offenAnzeige", "OFFEN");
            api.meldung(t("zelle.tuer.code", "Das Schloss klickt. Jetzt nur noch die Tür aufziehen – wenn dich keiner ansieht."), "gut");
            setTimeout(function () { tasten.hidden = true; }, 900);
            malen();
            return;
          }
          augeApi.wach();
          eingabe = "";
        } else if (eingabe.length < 4) eingabe += zz;
        ziffern.textContent = (eingabe + "____").slice(0, 4).split("").join(" ");
      }));
    });
    tasten.appendChild(tastGrid);
    tasten.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { tasten.hidden = true; }));

    function notizZeigen() {
      const reihe = api.el("div", "zl-notiz-reihe");
      (d.folge || []).forEach(function (s, i) {
        reihe.appendChild(formBild(api, s, 34));
        if (i < 3) reihe.appendChild(api.el("span", null, "→"));
      });
      const folgeText = (d.folge || []).map(function (s) { return symName(api, s); }).join(" – ");
      api.notiz("notiz", api.tf("zelle.notiz.buch", "Notiz des Vorgängers: Kerben in der Folge {f} lesen. Tür nur, wenn es nicht hinsieht.", { f: folgeText }));
      api.zettel(t("zelle.notiz.titel", "Notiz des Vorgängers"), [
        t("zelle.notiz.1", "Die Wände zählen mit. Vier Zeichen, vier Zahlen – lies sie in dieser Folge:"),
        reihe,
        t("zelle.notiz.2", "Und die Tür geht nie auf, solange es dich ansieht."),
      ]);
    }

    function malen() {
      lamellen.setAttribute("opacity", z.gitter ? "0" : "1");
      zettelImSchacht.setAttribute("opacity", z.gitter && !z.notiz ? "1" : "0");
      schrauben.forEach(function (s, i) { s.setAttribute("opacity", z.gitter || (z.schrauben || []).indexOf(i) >= 0 ? "0" : "1"); });
      steinFl.classList.toggle("ist-raus", !!z.stein);
      anzeige.classList.toggle("ist-offen", api.geloest());
    }
    malen();
  }

  /* ======================================================
     RAUM 2: LÜFTUNGSSCHACHT (Labyrinth)
  ====================================================== */
  const SP = 12, ZE = 6, ZELLE = 80, OX = 160, OY = 120;
  const TAKT = 2400, AN = 1100;

  function labyrinth(saat) {
    const r = zufall(saat);
    const n = SP * ZE, offen = [];
    for (let i = 0; i < n; i++) offen.push([]);
    const besucht = new Array(n).fill(false), stapel = [0];
    besucht[0] = true;
    while (stapel.length) {
      const c = stapel[stapel.length - 1], x = c % SP, y = Math.floor(c / SP);
      const nb = [];
      if (x > 0 && !besucht[c - 1]) nb.push(c - 1);
      if (x < SP - 1 && !besucht[c + 1]) nb.push(c + 1);
      if (y > 0 && !besucht[c - SP]) nb.push(c - SP);
      if (y < ZE - 1 && !besucht[c + SP]) nb.push(c + SP);
      if (!nb.length) { stapel.pop(); continue; }
      const z = nb[Math.floor(r() * nb.length)];
      offen[c].push(z); offen[z].push(c);
      besucht[z] = true;
      stapel.push(z);
    }
    /* Weg vom Start zum Ziel, Entfernungen */
    const ziel = n - 1, dist = new Array(n).fill(-1), vor = new Array(n).fill(-1), q = [0];
    dist[0] = 0;
    while (q.length) { const c = q.shift(); offen[c].forEach(function (z) { if (dist[z] < 0) { dist[z] = dist[c] + 1; vor[z] = c; q.push(z); } }); }
    const weg = [];
    for (let c = ziel; c >= 0; c = vor[c]) weg.unshift(c);
    const aufWeg = new Set(weg);
    /* Kerbe in der entferntesten Sackgasse abseits des Wegs */
    let kerbe = -1;
    for (let i = 1; i < n; i++) if (offen[i].length === 1 && !aufWeg.has(i) && (kerbe < 0 || dist[i] > dist[kerbe])) kerbe = i;
    if (kerbe < 0) kerbe = weg[Math.floor(weg.length / 2)];
    /* Sensoren auf dem Weg, gleichmäßig verteilt, mit Phase */
    const sensoren = [];
    const anzahl = Math.min(8, Math.max(4, Math.floor(weg.length / 4)));
    for (let k = 1; k <= anzahl; k++) {
      const c = weg[Math.floor(k * (weg.length - 2) / (anzahl + 1)) + 1];
      if (c !== 0 && c !== ziel && !sensoren.some(function (s) { return s.c === c; })) sensoren.push({ c: c, phase: Math.floor(r() * TAKT), quer: r() < 0.5 });
    }
    return { offen: offen, ziel: ziel, kerbe: kerbe, sensoren: sensoren };
  }
  function mitte(c) { return [OX + (c % SP) * ZELLE + ZELLE / 2, OY + Math.floor(c / SP) * ZELLE + ZELLE / 2]; }

  function raum2(buehne, api) {
    const t = api.t, z = api.zustand, d = api.daten(2);
    const lab = labyrinth(d.saat);
    if (typeof z.pos !== "number") { z.pos = 0; z.weg = [0]; }
    const svg = szene(api, buehne, t("zelle.raum.2", "Lüftungsschacht"));
    api.sv("rect", { x: 0, y: 0, width: W, height: H, class: "zl-schacht-grund" }, svg);
    api.sv("rect", { x: OX - 6, y: OY - 6, width: SP * ZELLE + 12, height: ZE * ZELLE + 12, class: "zl-schacht-blech" }, svg);
    /* Wände */
    let pfad = "";
    for (let c = 0; c < SP * ZE; c++) {
      const x = OX + (c % SP) * ZELLE, y = OY + Math.floor(c / SP) * ZELLE;
      if (lab.offen[c].indexOf(c + 1) < 0 || c % SP === SP - 1) pfad += "M" + (x + ZELLE) + " " + y + "v" + ZELLE;
      if (lab.offen[c].indexOf(c + SP) < 0) pfad += "M" + x + " " + (y + ZELLE) + "h" + ZELLE;
      if (c % SP === 0) pfad += "M" + x + " " + y + "v" + ZELLE;
      if (c < SP) pfad += "M" + x + " " + y + "h" + ZELLE;
    }
    api.sv("path", { d: pfad, class: "zl-schacht-wand" }, svg);
    /* Kerbe mit dem Frequenz-Anfang */
    const km = mitte(lab.kerbe);
    const kg = api.sv("g", { class: "zl-schacht-kerbe" }, svg);
    const kt = api.sv("text", { x: km[0], y: km[1] + 18, "text-anchor": "middle" }, kg);
    kt.textContent = d.kerbe + "…";
    form(api, kg, "welle", km[0] - 12, km[1] - 30, 24, "");
    /* Sensoren */
    const strahlen = lab.sensoren.map(function (s) {
      const m = mitte(s.c);
      const l = api.sv("path", { d: s.quer ? "M" + (m[0] - ZELLE / 2 + 6) + " " + m[1] + "h" + (ZELLE - 12) : "M" + m[0] + " " + (m[1] - ZELLE / 2 + 6) + "v" + (ZELLE - 12), class: "zl-sensor" }, svg);
      api.sv("circle", { cx: s.quer ? m[0] - ZELLE / 2 + 6 : m[0], cy: s.quer ? m[1] : m[1] - ZELLE / 2 + 6, r: 4, class: "zl-sensor-kopf" }, svg);
      return { s: s, el: l };
    });
    /* Ziel: Wartungskasten mit der Sicherung */
    const zm = mitte(lab.ziel);
    const zg = api.sv("g", { class: "zl-schacht-ziel" }, svg);
    api.sv("rect", { x: zm[0] - 22, y: zm[1] - 26, width: 44, height: 52, rx: 4 }, zg);
    form(api, zg, "kreuz", zm[0] - 10, zm[1] - 10, 20, "");
    /* Spielfigur und Licht um sie herum */
    const figur = api.sv("circle", { r: 13, class: "zl-figur" }, svg);
    const licht = api.dunkel(svg, 175, 0.02, true);

    function aktiv(s) { return ((Date.now() + s.phase) % TAKT) < AN; }
    function figurSetzen() {
      const m = mitte(z.pos);
      figur.setAttribute("cx", m[0]); figur.setAttribute("cy", m[1]);
      licht.hin(m[0], m[1]);
    }
    function alarm() {
      api.ton("alarm");
      api.strafe("sensor");
      const zurueck = Math.min(3, z.weg.length - 1);
      for (let i = 0; i < zurueck; i++) z.weg.pop();
      z.pos = z.weg[z.weg.length - 1];
      api.merken();
      figurSetzen();
      buehne.classList.add("ist-alarm");
      setTimeout(function () { buehne.classList.remove("ist-alarm"); }, 600);
      api.meldung(api.tf("zelle.schacht.alarm", "Ein Sensor schlägt an! Du kriechst zurück – +{s} s.", { s: 15 }), "rot");
    }
    function sensorHier() { return lab.sensoren.find(function (s) { return s.c === z.pos && aktiv(s); }); }
    async function ankommen() {
      if (z.pos === lab.kerbe) {
        const text = api.tf("zelle.schacht.kerbeText", "In die Schachtwand geritzt: „{k}…“ und darüber eine Welle – wie ein Funksignal.", { k: d.kerbe });
        api.notiz("kerbe-schacht", text);
        api.meldung(text, "gut");
      }
      if (z.pos === lab.ziel) {
        if (!api.hat("sicherung")) {
          api.nimm("sicherung");
          api.ton("fund");
          api.notiz("sicherung", api.tf("zelle.schacht.sicherungText", "Sicherung aus dem Wartungskasten, Kennung {s}.", { s: d.sicherung }));
        }
        api.meldung(api.tf("zelle.schacht.ziel", "Ein Wartungskasten. Du ziehst die Sicherung {s} heraus – unter dir knackt ein Gitter …", { s: d.sicherung }), "gut");
        if (await api.loesen(d.sicherung)) {
          api.meldung(t("zelle.schacht.fall", "Das Gitter gibt nach. Du landest im Wachraum."), "gut");
          setTimeout(api.weiter, api.ruhig ? 0 : 700);
        }
      }
    }
    let warten = 0;
    function gehen(ziel) {
      if (api.gesperrt() || Date.now() < warten) return;
      if (lab.offen[z.pos].indexOf(ziel) < 0) { api.ton("klick"); return; }
      warten = Date.now() + 140;
      z.pos = ziel;
      if (z.weg.length > 1 && z.weg[z.weg.length - 2] === ziel) z.weg.pop(); else z.weg.push(ziel);
      if (z.weg.length > 400) z.weg = z.weg.slice(-200);
      api.merken();
      figurSetzen();
      if (sensorHier()) { alarm(); return; }
      ankommen();
    }
    function richtung(dx, dy) {
      const x = z.pos % SP + dx, y = Math.floor(z.pos / SP) + dy;
      if (x < 0 || y < 0 || x >= SP || y >= ZE) return;
      gehen(y * SP + x);
    }
    const tasten = function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key];
      if (!m) return;
      e.preventDefault();
      richtung(m[0], m[1]);
    };
    document.addEventListener("keydown", tasten);
    svg.addEventListener("click", function (e) {
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      const x = Math.floor((p.x - OX) / ZELLE), y = Math.floor((p.y - OY) / ZELLE);
      if (x < 0 || y < 0 || x >= SP || y >= ZE) return;
      const px = z.pos % SP, py = Math.floor(z.pos / SP);
      if (Math.abs(x - px) + Math.abs(y - py) === 1) gehen(y * SP + x);
    });
    /* Steuerkreuz für Touch */
    const kreuz = api.el("div", "zl-kreuz");
    [["↑", 0, -1, "hoch"], ["←", -1, 0, "links"], ["→", 1, 0, "rechts"], ["↓", 0, 1, "runter"]].forEach(function (k) {
      const b = api.knopf(k[0], "zl-kreuz-" + k[3], function () { richtung(k[1], k[2]); });
      b.setAttribute("aria-label", t("zelle.schacht." + k[3], k[3]));
      kreuz.appendChild(b);
    });
    buehne.appendChild(kreuz);

    /* Sensoren im Takt zeichnen; wer drin steht, wenn einer anspringt: Alarm */
    let uhr = 0, warAktiv = false;
    function tick() {
      strahlen.forEach(function (x) { x.el.classList.toggle("ist-an", aktiv(x.s)); });
      const s = sensorHier();
      if (s && !warAktiv && !api.gesperrt()) alarm();
      warAktiv = !!s;
      uhr = requestAnimationFrame(tick);
    }
    uhr = requestAnimationFrame(tick);
    figurSetzen();
    api.abbau(function () { cancelAnimationFrame(uhr); document.removeEventListener("keydown", tasten); });
  }

  /* ======================================================
     RAUM 3: WACHRAUM
  ====================================================== */
  function raum3(buehne, api) {
    const t = api.t, z = api.zustand, d = api.daten(3);
    const svg = szene(api, buehne, t("zelle.raum.3", "Wachraum"));
    api.sv("rect", { x: 0, y: 0, width: W, height: 560, class: "zl-wache-wand" }, svg);
    api.sv("rect", { x: 0, y: 560, width: W, height: 160, class: "zl-boden" }, svg);

    /* Vier Monitore */
    (d.kameras || []).forEach(function (sym, i) {
      const x = 50 + (i % 2) * 250, y = 50 + Math.floor(i / 2) * 175;
      const g = api.sv("g", { class: "zl-monitor" }, svg);
      api.sv("rect", { x: x, y: y, width: 230, height: 155, rx: 8, class: "zl-monitor-rahmen" }, g);
      api.sv("rect", { x: x + 10, y: y + 10, width: 210, height: 135, rx: 4, class: "zl-monitor-bild" }, g);
      api.sv("path", { d: "M" + (x + 10) + " " + (y + 145) + "L" + (x + 80) + " " + (y + 70) + "H" + (x + 150) + "L" + (x + 220) + " " + (y + 145), class: "zl-monitor-gang" }, g);
      form(api, g, sym, x + 100, y + 76, 30, "zl-monitor-zeichen");
      const lab = api.sv("text", { x: x + 18, y: y + 30, class: "zl-monitor-text" }, g);
      lab.textContent = "K" + (i + 1);
      api.klickbar(g, api.tf("zelle.kamera.name", "Monitor K{n}", { n: i + 1 }), function () {
        const text = api.tf("zelle.kamera.text", "Monitor K{n}: Im Gang ist ein {sym} an die Wand gemalt.", { n: i + 1, sym: symName(api, sym) });
        api.notiz("kamera-" + (i + 1), text);
        api.meldung(text, "gut");
      });
    });

    /* Klemmbrett mit dem Rundgang */
    const brett = api.sv("g", {}, svg);
    api.sv("rect", { x: 580, y: 70, width: 160, height: 210, rx: 6, class: "zl-brett" }, brett);
    api.sv("rect", { x: 595, y: 92, width: 130, height: 170, class: "zl-papier" }, brett);
    const bk = api.sv("text", { x: 660, y: 120, "text-anchor": "middle", class: "zl-papier-kopf" }, brett);
    bk.textContent = t("zelle.rundgang.titel", "Rundgang Nacht");
    const rz = api.sv("text", { x: 660, y: 170, "text-anchor": "middle", class: "zl-papier-gross" }, brett);
    rz.textContent = (d.rundgang || []).map(function (n) { return "K" + n; }).join(" → ");
    api.klickbar(brett, t("zelle.rundgang.name", "Klemmbrett"), function () {
      const text = api.tf("zelle.rundgang.text", "Klemmbrett „Rundgang Nacht“: {r}.", { r: rz.textContent });
      api.notiz("rundgang", text);
      api.meldung(text, "gut");
    });

    /* Wanduhr */
    const uhrG = api.sv("g", {}, svg);
    api.sv("circle", { cx: 840, cy: 150, r: 64, class: "zl-uhr-blatt" }, uhrG);
    for (let i = 0; i < 12; i++) {
      const w = i / 12 * Math.PI * 2;
      api.sv("path", { d: "M" + (840 + Math.sin(w) * 52) + " " + (150 - Math.cos(w) * 52) + "L" + (840 + Math.sin(w) * 60) + " " + (150 - Math.cos(w) * 60), class: "zl-uhr-strich" }, uhrG);
    }
    const hw = (d.uhr % 12) / 12 * Math.PI * 2;
    api.sv("path", { d: "M840 150L" + (840 + Math.sin(hw) * 32).toFixed(1) + " " + (150 - Math.cos(hw) * 32).toFixed(1), class: "zl-uhr-zeiger ist-dick" }, uhrG);
    api.sv("path", { d: "M840 150V98", class: "zl-uhr-zeiger" }, uhrG);
    api.klickbar(uhrG, t("zelle.uhr.name", "Wanduhr"), function () {
      const text = api.tf("zelle.uhr.text", "Die Wanduhr ist stehen geblieben: genau {h} Uhr.", { h: d.uhr });
      api.notiz("uhr", text);
      api.meldung(text, "gut");
    });

    /* Schreibtisch mit Terminal und Klebezettel */
    api.sv("rect", { x: 360, y: 520, width: 520, height: 26, class: "zl-metall" }, svg);
    const term = api.sv("g", {}, svg);
    api.sv("rect", { x: 450, y: 330, width: 300, height: 190, rx: 10, class: "zl-monitor-rahmen" }, term);
    const schirm = api.sv("rect", { x: 466, y: 346, width: 268, height: 158, rx: 6, class: "zl-terminal-schirm" }, term);
    const st = api.sv("text", { x: 600, y: 430, "text-anchor": "middle", class: "zl-terminal-text" }, term);
    api.klickbar(term, t("zelle.terminal.name", "Terminal"), function () { terminalZeigen(); });
    const kleb = api.sv("g", {}, svg);
    api.sv("rect", { x: 720, y: 330, width: 92, height: 70, class: "zl-klebe", transform: "rotate(6 766 365)" }, kleb);
    const kt = api.sv("text", { x: 766, y: 372, "text-anchor": "middle", class: "zl-klebe-text", transform: "rotate(6 766 365)" }, kleb);
    kt.textContent = d.notiz;
    api.klickbar(kleb, t("zelle.klebe.name", "Klebezettel"), function () {
      const text = api.tf("zelle.klebe.text", "Klebezettel am Terminal: „{w}“ – darunter: „Die Uhr weiß es.“", { w: d.notiz });
      api.notiz("klebe", text);
      api.meldung(text, "gut");
    });

    /* Spind mit drei Symbolrädern */
    const spind = api.sv("g", {}, svg);
    const spindTuer = api.sv("rect", { x: 900, y: 270, width: 150, height: 290, rx: 4, class: "zl-spind" }, spind);
    for (let i = 0; i < 4; i++) api.sv("rect", { x: 920, y: 290 + i * 10, width: 110, height: 4, class: "zl-spind-schlitz" }, spind);
    api.klickbar(spind, t("zelle.spind.name", "Spind"), function () {
      if (z.spind) { api.meldung(t("zelle.spind.leer", "Der Spind ist leer – bis auf eine alte Thermoskanne.")); return; }
      spindPanel.hidden = false; spindPanel.querySelector("button").focus();
    });

    /* Sicherungskasten */
    const kasten = api.sv("g", {}, svg);
    api.sv("rect", { x: 1090, y: 70, width: 160, height: 190, rx: 6, class: "zl-kasten" }, kasten);
    const kastenLed = api.sv("circle", { cx: 1230, cy: 88, r: 6, class: "zl-led" }, kasten);
    for (let i = 0; i < 8; i++) api.sv("rect", { x: 1106 + (i % 4) * 34, y: 120 + Math.floor(i / 4) * 60, width: 20, height: 40, rx: 4, class: "zl-schalter" }, kasten);
    api.klickbar(kasten, t("zelle.kasten.name", "Sicherungskasten"), function () { kastenPanel.hidden = false; kastenPanel.querySelector("button").focus(); });

    /* Tür zur Asservatenkammer mit Kartenleser */
    const tuer = api.sv("g", {}, svg);
    api.sv("rect", { x: 1080, y: 290, width: 180, height: 270, rx: 4, class: "zl-tuer" }, tuer);
    const leser = api.sv("rect", { x: 1060, y: 380, width: 16, height: 40, rx: 3, class: "zl-leser" }, tuer);
    const tuerText = api.sv("text", { x: 1170, y: 330, "text-anchor": "middle", class: "zl-tuer-schild" }, tuer);
    tuerText.textContent = t("zelle.raum.4", "Asservatenkammer").toUpperCase();
    api.klickbar(tuer, t("zelle.tuer3.name", "Tür zur Asservatenkammer"), function () {
      if (!api.hat("karte")) { api.meldung(t("zelle.tuer3.karte", "Ein Kartenleser. Ohne Schlüsselkarte geht hier nichts.")); return; }
      if (!api.geloest()) { api.meldung(t("zelle.tuer3.gesperrt", "Die Karte wird gelesen … „Zugang nur nach Anmeldung am Terminal.“")); api.ton("fehler"); return; }
      if (!augeApi.zu()) { augeApi.wach(); api.ton("alarm"); api.meldung(t("zelle.tuer3.auge", "Die Kamera sieht dich. Der Leser blinkt rot – erst muss das Auge weg."), "rot"); return; }
      leser.classList.add("ist-gruen");
      api.ton("schloss");
      setTimeout(api.weiter, api.ruhig ? 0 : 500);
    });

    const augeApi = api.auge(svg, 640, 40, 20, false);

    /* Terminal-Panel */
    const termPanel = panel(api, buehne, "zl-terminal");
    function terminalZeigen() {
      termPanel.replaceChildren();
      termPanel.appendChild(api.el("div", "rs-kicker ist-rot", t("zelle.terminal.kopf", "Wachsystem · Anmeldung")));
      if (!api.geloest()) {
        const f = api.el("form", "zl-terminal-form");
        const inp = api.el("input", "zl-eingabe");
        inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.maxLength = 20;
        inp.setAttribute("aria-label", t("zelle.terminal.passwort", "Passwort"));
        inp.placeholder = t("zelle.terminal.passwort", "Passwort");
        f.appendChild(inp);
        const senden = api.knopf(t("zelle.terminal.anmelden", "Anmelden"), "ist-haupt");
        senden.type = "submit";
        f.appendChild(senden);
        f.addEventListener("submit", async function (e) {
          e.preventDefault();
          if (!inp.value.trim()) return;
          if (await api.loesen(inp.value.trim())) { api.meldung(t("zelle.terminal.ok", "Angemeldet. Das Wachsystem öffnet sich."), "gut"); malen(); terminalZeigen(); }
          else inp.select();
        });
        termPanel.appendChild(f);
        termPanel.appendChild(api.el("p", "rs-leise", t("zelle.terminal.hinweis", "Groß- und Kleinschreibung egal.")));
        termPanel.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { termPanel.hidden = true; }));
        termPanel.hidden = false;
        inp.focus();
        return;
      }
      const d4 = api.daten(4) || {};
      const zeilen = [
        api.tf("zelle.terminal.muster", "WARTUNG KAMERA-AUGE: Schaltmuster {m} (1 = oben), dann Hebel.", { m: d4.muster }),
        api.tf("zelle.terminal.log", "FUNKLOG: Notruf zuletzt auf …{l} MHz abgesetzt.", { l: d4.log }),
        t("zelle.terminal.spind", "DIENST: Spindcode = Zeichen der Kameras im Rundgang."),
      ];
      api.notiz("muster", zeilen[0]);
      api.notiz("funklog", zeilen[1]);
      zeilen.forEach(function (x) { termPanel.appendChild(api.el("p", "zl-terminal-zeile rs-ziffern", x)); });
      termPanel.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { termPanel.hidden = true; }));
      termPanel.hidden = false;
    }

    /* Spind-Panel: drei Räder */
    const spindPanel = panel(api, buehne, "zl-spindschloss");
    const rad = z.rad || [0, 0, 0];
    const radKnoepfe = [];
    spindPanel.appendChild(api.el("div", "rs-kicker", t("zelle.spind.schloss", "Zahlenschloss mit Zeichen")));
    const reihe = api.el("div", "zl-raeder");
    [0, 1, 2].forEach(function (i) {
      const b = api.knopf("", "zl-rad", function () {
        rad[i] = (rad[i] + 1) % SPIND_REIHE.length;
        z.rad = rad; api.merken(); api.ton("klick");
        radMalen(i);
      });
      radKnoepfe.push(b);
      reihe.appendChild(b);
    });
    spindPanel.appendChild(reihe);
    spindPanel.appendChild(api.knopf(t("zelle.spind.ziehen", "Am Griff ziehen"), "ist-haupt", function () {
      const soll = (d.rundgang || []).map(function (n) { return SPIND_REIHE.indexOf(d.kameras[n - 1]); });
      if (soll.every(function (s, i) { return s === rad[i]; })) {
        z.spind = true; api.merken();
        api.nimm("karte"); api.ton("fund");
        spindTuer.classList.add("ist-offen");
        spindPanel.hidden = true;
        api.meldung(t("zelle.spind.offen", "Klack. Im Spind hängt eine Schlüsselkarte am Haken."), "gut");
      } else { api.ton("fehler"); api.meldung(t("zelle.spind.zu", "Der Griff rührt sich nicht.")); }
    }));
    spindPanel.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { spindPanel.hidden = true; }));
    function radMalen(i) {
      const b = radKnoepfe[i], s = SPIND_REIHE[rad[i]];
      b.replaceChildren(formBild(api, s, 40));
      b.setAttribute("aria-label", api.tf("zelle.spind.rad", "Rad {n}: {s}", { n: i + 1, s: symName(api, s) }));
    }
    [0, 1, 2].forEach(radMalen);

    /* Sicherungskasten-Panel: acht Schalter und Hebel */
    const kastenPanel = panel(api, buehne, "zl-kastenpanel");
    const schalter = z.schalter || [0, 0, 0, 0, 0, 0, 0, 0];
    kastenPanel.appendChild(api.el("div", "rs-kicker", t("zelle.kasten.name", "Sicherungskasten")));
    const sr = api.el("div", "zl-schalterreihe");
    schalter.forEach(function (_, i) {
      const b = api.knopf("", "zl-kipp" + (schalter[i] ? " ist-oben" : ""), function () {
        schalter[i] = schalter[i] ? 0 : 1;
        z.schalter = schalter; api.merken(); api.ton("klick");
        b.classList.toggle("ist-oben", !!schalter[i]);
        b.setAttribute("aria-pressed", schalter[i] ? "true" : "false");
      });
      b.setAttribute("aria-label", api.tf("zelle.kasten.schalter", "Schalter {n}", { n: i + 1 }));
      b.setAttribute("aria-pressed", schalter[i] ? "true" : "false");
      sr.appendChild(b);
    });
    kastenPanel.appendChild(sr);
    kastenPanel.appendChild(api.knopf(t("zelle.kasten.hebel", "Wartungshebel umlegen"), "ist-haupt", function () {
      const d4 = api.daten(4);
      if (!d4) { api.ton("fehler"); api.meldung(t("zelle.kasten.ohnePlan", "Funken sprühen. Ohne Schaltplan aus dem Terminal ist das Raten.")); return; }
      if (schalter.join("") !== d4.muster) { api.ton("fehler"); api.meldung(t("zelle.kasten.falsch", "Funken sprühen – falsches Muster.")); return; }
      augeApi.aus(20000);
      kastenLed.classList.add("ist-an");
      setTimeout(function () { kastenLed.classList.remove("ist-an"); }, 20000);
      api.ton("summen");
      kastenPanel.hidden = true;
      api.meldung(t("zelle.kasten.ok", "Ein Summen erstirbt. Das Kamera-Auge ist für 20 Sekunden aus – schnell!"), "gut");
    }));
    kastenPanel.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { kastenPanel.hidden = true; }));

    function malen() {
      st.textContent = api.geloest() ? t("zelle.terminal.angemeldet", "ANGEMELDET") : "PASSWORT: _";
      schirm.classList.toggle("ist-an", api.geloest());
      spindTuer.classList.toggle("ist-offen", !!z.spind);
    }
    malen();
  }

  /* ======================================================
     RAUM 4: ASSERVATENKAMMER (Funkgerät)
  ====================================================== */
  function raum4(buehne, api) {
    const t = api.t, z = api.zustand;
    if (typeof z.frq !== "number") z.frq = 10000;   // 100.00 MHz in Hundertsteln
    const svg = szene(api, buehne, t("zelle.raum.4", "Asservatenkammer"));
    api.sv("rect", { x: 0, y: 0, width: W, height: 560, class: "zl-wache-wand" }, svg);
    api.sv("rect", { x: 0, y: 560, width: W, height: 160, class: "zl-boden" }, svg);
    /* Regale mit Kisten */
    [[40, 120], [40, 300], [1000, 120], [1000, 300]].forEach(function (p, i) {
      api.sv("rect", { x: p[0], y: p[1] + 120, width: 240, height: 12, class: "zl-metall" }, svg);
      for (let k = 0; k < 3; k++) {
        api.sv("rect", { x: p[0] + 10 + k * 76, y: p[1] + 40, width: 66, height: 80, rx: 3, class: "zl-kiste" }, svg);
        const nr = api.sv("text", { x: p[0] + 43 + k * 76, y: p[1] + 86, "text-anchor": "middle", class: "zl-kisten-nr" }, svg);
        nr.textContent = "A-" + (17 + i * 3 + k);
      }
    });
    /* Tisch mit dem Funkgerät */
    api.sv("rect", { x: 420, y: 470, width: 440, height: 22, class: "zl-metall" }, svg);
    const geraet = api.sv("g", { class: "zl-funk" }, svg);
    api.sv("rect", { x: 480, y: 300, width: 320, height: 170, rx: 14, class: "zl-funk-koerper" }, geraet);
    api.sv("rect", { x: 510, y: 325, width: 170, height: 52, rx: 6, class: "zl-funk-anzeige" }, geraet);
    const anz = api.sv("text", { x: 595, y: 361, "text-anchor": "middle", class: "zl-funk-zahl" }, geraet);
    api.sv("circle", { cx: 740, cy: 352, r: 30, class: "zl-funk-knopf" }, geraet);
    api.sv("path", { d: "M780 300 790 210", class: "zl-funk-antenne" }, geraet);
    const ledG = api.sv("circle", { cx: 520, cy: 440, r: 7, class: "zl-led" }, geraet);
    for (let i = 0; i < 6; i++) api.sv("rect", { x: 560 + i * 26, y: 405, width: 14, height: 40, rx: 3, class: "zl-funk-gitter" }, geraet);
    api.klickbar(geraet, t("zelle.funk.name", "Dein Funkgerät"), function () { funkZeigen(); });
    /* Erst die Dunkelheit, dann das Auge: es glüht im Dunkeln. */
    api.dunkel(svg, 240, 0.16);
    const augeApi = api.auge(svg, 640, 64, 24);

    /* Funk-Panel */
    const fp = panel(api, buehne, "zl-funkpanel");
    function frqText() { return (z.frq / 100).toFixed(2); }
    function malen() {
      anz.textContent = z.strom ? frqText() : "– – –";
      ledG.classList.toggle("ist-an", !!z.strom);
    }
    function funkZeigen() {
      fp.replaceChildren();
      fp.appendChild(api.el("div", "rs-kicker ist-rot", t("zelle.funk.name", "Dein Funkgerät")));
      if (!z.strom) {
        if (!api.hat("sicherung")) {
          fp.appendChild(api.el("p", "rs-text", t("zelle.funk.tot", "Das Gerät ist tot. Im Batteriefach steckt nichts – nur eine leere Sicherungsbuchse.")));
        } else {
          z.strom = true; api.merken(); api.ton("summen");
          api.meldung(t("zelle.funk.strom", "Die Sicherung aus dem Schacht passt. Das Funkgerät erwacht mit einem Rauschen."), "gut");
          malen();
        }
      }
      if (z.strom) {
        const anzeige = api.el("div", "zl-funk-panelzahl rs-ziffern", frqText() + " MHz");
        fp.appendChild(anzeige);
        const reihe = api.el("div", "zl-funk-regler");
        [[-100, "−1"], [-1, "−0,01"], [1, "+0,01"], [100, "+1"]].forEach(function (s) {
          reihe.appendChild(api.knopf(s[1], "zl-taste", function () {
            z.frq = Math.max(10000, Math.min(19999, z.frq + s[0]));
            api.merken(); api.ton("rauschen");
            anzeige.textContent = frqText() + " MHz";
            malen();
          }));
        });
        fp.appendChild(reihe);
        const senden = api.knopf(t("zelle.funk.senden", "Notruf senden (3 s halten)"), "ist-haupt ist-rot zl-senden");
        const balken = api.el("div", "zl-senden-balken");
        const fuell = balken.appendChild(api.el("i"));
        let uhr = 0, beginn = 0;
        const abbrechen = function (still) {
          cancelAnimationFrame(uhr); uhr = 0; fuell.style.width = "0%";
          if (!still) api.meldung(t("zelle.funk.abbruch", "Losgelassen – der Notruf bricht ab."));
        };
        const halten = function () {
          if (api.gesperrt()) return;
          if (!augeApi.zu()) { augeApi.wach(); api.ton("alarm"); api.meldung(t("zelle.funk.auge", "Das Auge sieht dich – der Wärter wäre sofort da. Erst zurückstarren."), "rot"); return; }
          beginn = performance.now();
          const schritt = function (jetzt) {
            const p = Math.min(1, (jetzt - beginn) / 3000);
            fuell.style.width = (p * 100).toFixed(1) + "%";
            if (!augeApi.zu()) { abbrechen(true); api.meldung(t("zelle.funk.augeAuf", "Das Auge öffnet sich – Abbruch!"), "rot"); return; }
            if (p < 1) { uhr = requestAnimationFrame(schritt); return; }
            uhr = 0;
            api.meldung(api.tf("zelle.funk.sendet", "Sende auf {f} MHz …", { f: frqText() }));
            api.loesen(frqText()).then(function (ok) {
              fuell.style.width = "0%";
              if (!ok) api.meldung(api.tf("zelle.funk.rauschen", "Nur Rauschen auf {f} MHz. Niemand antwortet.", { f: frqText() }), "rot");
            });
          };
          uhr = requestAnimationFrame(schritt);
        };
        senden.addEventListener("pointerdown", function (e) { e.preventDefault(); halten(); });
        ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { senden.addEventListener(ev, function () { if (uhr) abbrechen(); }); });
        senden.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !uhr && !e.repeat) { e.preventDefault(); halten(); } });
        senden.addEventListener("keyup", function (e) { if ((e.key === " " || e.key === "Enter") && uhr) abbrechen(); });
        fp.appendChild(senden);
        fp.appendChild(balken);
      }
      fp.appendChild(api.knopf(t("zelle.weglegen", "Weglegen"), "ist-leise", function () { fp.hidden = true; }));
      fp.hidden = false;
      const erster = fp.querySelector("button");
      if (erster) erster.focus();
    }
    malen();
  }

  window.fhZelleRaeume = { 1: raum1, 2: raum2, 3: raum3, 4: raum4 };
})();
