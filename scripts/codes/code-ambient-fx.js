/* ======================================================
   GLITCH-ZEICHENFELD FÜR DIE CODES-SEITE
   ---------------------------------------------------
   Loest den bisherigen Matrix-Regen ab (fallende Zeichen plus
   weichgezeichnete Glow-Orbs). Statt einzelner Spalten steht jetzt
   ein volles Raster aus Zeichen da, von dem staendig ein kleiner
   Teil umspringt und dabei die Farbe wechselt - passend zu einer
   Seite, auf der man Geheimcodes knackt.

   Nach "Letter Glitch" aus React Bits (https://reactbits.dev,
   MIT + Commons Clause, Copyright (c) 2026 David Haz).
   Uebernommen wurden Aufbau und Idee; drei Dinge sind hier anders:

   1. NUR GEAENDERTE ZELLEN WERDEN NEU GEZEICHNET.
      Die Vorlage loescht die ganze Leinwand und malt in JEDEM Bild
      alle Zellen neu. Auf 1440x900 sind das rund 6.000 fillText pro
      Bild - der abgeloeste Matrix-Regen kam mit 75 aus. Hier fuehrt
      der Code eine Liste der Zellen, die sich gerade veraendern,
      und ruehrt nur die an. Gemessen steht die Seite damit ungefaehr
      dort, wo sie vorher stand.

   2. DER FARBUEBERGANG IST REPARIERT.
      Die Vorlage schreibt den Zwischenwert als "rgb(a, b, c)" in
      dasselbe Feld zurueck, aus dem sie ihn im naechsten Schritt
      wieder als Hex-Wert zu lesen versucht - das schlaegt fehl, und
      die Farbe bleibt nach dem ersten Schritt stehen. Hier stehen
      Start- und Zielfarbe getrennt als Zahlen, der Uebergang laeuft
      vollstaendig durch.

   3. DIE ZAHL DER ZELLEN PRO TAKT HAENGT AN DER BREITE, NICHT AN DER
      GESAMTZAHL. Sonst wuerde der Aufwand auf langen Seiten mit der
      Hoehe mitwachsen, ohne dass man mehr davon saehe.

   Die Glow-Orbs sind ersatzlos weg: sie waren weichgezeichnete,
   dauerbewegte <div> (bis zu sechs gleichzeitig) und sollten die
   Luecken des duennen Regens fuellen. Das Zeichenraster hat keine.
====================================================== */

(function () {
  "use strict";

  /* Grosse Lateinbuchstaben, Ziffern und Satzzeichen - alle mit
     gleicher Vorschubbreite. Die alten Katakana waren doppelt so
     breit und haetten das Raster gesprengt. */
  const ZEICHEN = Array.from(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789"
  );

  /* Dunkles Tiefgruen als Grundton, Signalgruen als Leuchtfarbe,
     dazu das Kalt-Blau der Seite (--fh-cold) als Klammer zum
     restlichen Farbklang.

     Nicht gleichverteilt: das Raster steht hinter Ueberschrift,
     Eingabefeld und Knopf. Bei gleicher Haeufigkeit leuchtet zu viel
     davon und der Inhalt geht darin unter - deshalb ist der dunkle
     Ton der Regelfall und die hellen sind die Ausnahme. */
  const FARBEN = [
    [18, 51, 42],   // #12332a  Grundton
    [18, 51, 42],
    [18, 51, 42],
    [28, 74, 58],   // eine Stufe heller
    [28, 74, 58],
    [61, 220, 151], // #3ddc97  Signalgruen
    [66, 184, 255], // #42b8ff  --fh-cold
  ];

  const SCHRIFTGROESSE = 16;
  const ZEILENHOEHE = 24;
  const TAKT_MS = 100;     // Abstand zwischen zwei Umsprung-Wellen
  const SCHRITT = 0.18;    // Farbuebergang pro Bild -> knapp 6 Bilder
  const JE_TAKT_PRO_SPALTE = 0.30; // 0.30 * Spaltenzahl Zellen je Takt

  let leinwand = null;
  let ctx = null;
  let zellen = [];         // { z, von[3], nach[3], fortschritt }
  let spalten = 0;
  let reihen = 0;
  let zellbreite = 10;
  let wechselnde = new Set();
  let rafId = 0;
  let laeuft = false;
  let letzterTakt = 0;
  let resizeTimer = 0;
  let resizeHandler = null;

  function zufallsZeichen() {
    return ZEICHEN[(Math.random() * ZEICHEN.length) | 0];
  }

  function zufallsFarbe() {
    return FARBEN[(Math.random() * FARBEN.length) | 0];
  }

  function mischen(von, nach, f) {
    return (
      "rgb(" +
      Math.round(von[0] + (nach[0] - von[0]) * f) + "," +
      Math.round(von[1] + (nach[1] - von[1]) * f) + "," +
      Math.round(von[2] + (nach[2] - von[2]) * f) + ")"
    );
  }

  function huelle() {
    return document.getElementById("code-ambient-fx");
  }

  /* Legt Leinwand, Raster und Zellen an. Muss laufen, waehrend die
     Seite sichtbar ist - auf display:none sind alle Masse 0. */
  function aufbauen() {
    const fx = huelle();
    if (!fx) return false;

    if (!leinwand) {
      leinwand = document.createElement("canvas");
      leinwand.className = "code-glitch-canvas";
      leinwand.setAttribute("aria-hidden", "true");
      fx.appendChild(leinwand);
      ctx = leinwand.getContext("2d");
    }

    const breite = fx.clientWidth;
    const hoehe = fx.clientHeight;
    if (!breite || !hoehe) return false;

    /* Das Raster liegt hinter dem Seiteninhalt und ist auf 55%
       Deckkraft gestellt. Volle Pixeldichte waere dort verschwendet;
       1.5 ist der Punkt, an dem die Zeichen auf feinen Displays noch
       sauber stehen. */
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    leinwand.width = Math.round(breite * dpr);
    leinwand.height = Math.round(hoehe * dpr);
    leinwand.style.width = breite + "px";
    leinwand.style.height = hoehe + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.font = SCHRIFTGROESSE + "px 'Courier New', monospace";
    ctx.textBaseline = "top";

    /* Zellbreite aus der echten Vorschubbreite der Schrift ableiten,
       nicht raten: sonst passt das Raster nur zufaellig, und beim
       Loeschen einer Zelle bleiben Reste der Nachbarn stehen. */
    zellbreite = Math.ceil(ctx.measureText("M").width) + 1;

    spalten = Math.ceil(breite / zellbreite);
    reihen = Math.ceil(hoehe / ZEILENHOEHE);

    zellen = new Array(spalten * reihen);
    for (let i = 0; i < zellen.length; i++) {
      const f = zufallsFarbe();
      zellen[i] = { z: zufallsZeichen(), von: f, nach: f, fortschritt: 1 };
    }
    wechselnde.clear();

    allesZeichnen();
    return true;
  }

  /* Einmal alles - nur beim Aufbau und nach Groessenaenderungen. */
  function allesZeichnen() {
    if (!ctx) return;
    // In CSS-Pixeln, denn ctx traegt die Pixeldichte als Transform.
    ctx.clearRect(0, 0, spalten * zellbreite, reihen * ZEILENHOEHE);
    for (let i = 0; i < zellen.length; i++) zelleZeichnen(i);
  }

  function zelleZeichnen(i) {
    const c = zellen[i];
    const x = (i % spalten) * zellbreite;
    const y = ((i / spalten) | 0) * ZEILENHOEHE;
    ctx.clearRect(x, y, zellbreite, ZEILENHOEHE);
    ctx.fillStyle = mischen(c.von, c.nach, c.fortschritt);
    ctx.fillText(c.z, x, y);
  }

  /* Eine Umsprung-Welle: ein paar zufaellige Zellen bekommen ein
     neues Zeichen und eine neue Zielfarbe. */
  function welle() {
    const anzahl = Math.max(1, Math.round(spalten * JE_TAKT_PRO_SPALTE));
    for (let n = 0; n < anzahl; n++) {
      const i = (Math.random() * zellen.length) | 0;
      const c = zellen[i];
      if (!c) continue;
      // Vom aktuell gezeigten Ton aus weiterblenden, sonst springt
      // eine Zelle, die noch mitten im Uebergang steckt.
      const jetzt = c.fortschritt >= 1 ? c.nach : c.von;
      c.von = jetzt;
      c.nach = zufallsFarbe();
      c.z = zufallsZeichen();
      c.fortschritt = 0;
      wechselnde.add(i);
    }
  }

  function bild(t) {
    if (!laeuft) return;

    if (t - letzterTakt >= TAKT_MS) {
      welle();
      letzterTakt = t;
    }

    for (const i of wechselnde) {
      const c = zellen[i];
      c.fortschritt += SCHRITT;
      if (c.fortschritt >= 1) {
        c.fortschritt = 1;
        c.von = c.nach;
        wechselnde.delete(i);
      }
      zelleZeichnen(i);
    }

    rafId = requestAnimationFrame(bild);
  }

  function starten() {
    if (laeuft) return;
    if (!aufbauen()) return;

    if (!resizeHandler) {
      resizeHandler = function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (laeuft || zellen.length) aufbauen();
        }, 120);
      };
      window.addEventListener("resize", resizeHandler);
    }

    // Bei "Bewegung reduzieren" bleibt genau EIN Bild stehen: das
    // Raster ist zu sehen, es springt nur nichts mehr um.
    if (window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    laeuft = true;
    letzterTakt = 0;
    rafId = requestAnimationFrame(bild);
  }

  function anhalten() {
    laeuft = false;
    cancelAnimationFrame(rafId);
  }

  function updateCodeAmbientPage(pageID) {
    if (pageID === "code") starten();
    else anhalten();
  }

  // Im Hintergrundtab weiterzeichnen kostet Akku und bringt
  // niemandem etwas.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) anhalten();
    else if (document.getElementById("code") &&
             document.getElementById("code").classList.contains("active-page")) {
      starten();
    }
  });

  window.updateCodeAmbientPage = updateCodeAmbientPage;
})();
