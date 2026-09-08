/* ======================================================
   SEITENWECHSEL: RICHTUNG UND GESTAFFELTER INHALT
   ---------------------------------------------------
   Bisher sah jeder Seitenwechsel gleich aus: die neue Seite kam von
   unten hereingeschoben (translateY 24px) und blendete auf, egal
   ob man vorwaerts oder rueckwaerts durchs Menue ging. Das ist
   sauber, sagt aber nichts. Wer vom Shop zur Rangliste geht und
   wieder zurueck, bekommt zweimal dieselbe Bewegung und verliert
   das Gefuehl, wo er sich befindet.

   Zwei Aenderungen:

   1. RICHTUNG
      Die Reihenfolge steht in der Navigationsleiste (index.html,
      .fh-nav-item[data-page]) - sie ist die Ordnung, die der Nutzer
      vor Augen hat. Geht es in dieser Liste nach unten, kommt die
      neue Seite von rechts; nach oben, von links. Steht eine der
      beiden Seiten nicht in der Liste (Kapitelansicht, Leseansicht,
      Gateway), bleibt es beim bisherigen Weg von unten.

      Umgesetzt ueber zwei CSS-Variablen auf dem Abschnitt, die das
      vorhandene @keyframes pageShow liest - kein zweiter
      Bewegungsweg, keine zusaetzliche Klasse, die man wieder
      abraeumen muesste.

   2. INHALT GESTAFFELT
      Die Seite kam bisher als ein Block. Jetzt laufen die obersten
      Kinder des Inhaltsbereichs kurz hintereinander ein - der Blick
      bekommt eine Leserichtung statt einer Wand.

      Dafuer GSAP, und zwar aus einem Grund: ABBRECHBARKEIT.
      gsap.killTweensOf() raeumt beim naechsten Seitenwechsel
      zuverlaessig auf. Wer schnell durchklickt, haette mit
      CSS-Animationen halb eingeblendete Elemente stehen, die auf
      opacity 0 haengenbleiben - genau der Fehler, den man auf
      Seiten sieht, die Einblend-Animationen ohne Aufraeumen
      verwenden. GSAP ist ohnehin geladen (scripts/core/gsap-init.js)
      und wurde bisher nur an rund zehn Stellen benutzt.

   AUSNAHME STARTSEITE: die hat mit dem Kino-Scroll (cinematic.js,
   ScrollTrigger) eine eigene, laengere Eroeffnung. Eine zweite
   Staffelung daneben waere Bewegung ueber Bewegung.

   Bei "Bewegung reduzieren" passiert von beidem nichts: die
   Richtung wird nicht gesetzt (die vorhandene Regel in
   00-basis.css schaltet die Seitenanimation dort ohnehin ab), und
   die Staffelung setzt die Elemente nur auf sichtbar, ohne sie zu
   bewegen.
====================================================== */

(function () {
  "use strict";

  /* Wie weit die neue Seite seitlich anlaeuft. 26px sind genug, um
     die Richtung zu erkennen, und wenig genug, dass daneben kein
     Streifen leerer Flaeche aufblitzt. */
  const WEG = 26;

  /* Der Inhalt jeder Seite steckt in einem dieser Behaelter. Die
     Startseite fehlt hier bewusst. */
  const INHALT = ".page-content, .story-library, .story-detail-container";

  let reihenfolge = null;

  function reduziert() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* Die Liste einmal aus dem Markup lesen. Nicht fest verdrahten:
     sortiert jemand die Leiste um oder kommt ein Punkt dazu, soll
     die Richtung von selbst stimmen. */
  function ordnung() {
    if (reihenfolge) return reihenfolge;
    reihenfolge = new Map();
    const punkte = document.querySelectorAll(".fh-sidebar-nav .fh-nav-item[data-page]");
    punkte.forEach((el, i) => {
      const seite = el.getAttribute("data-page");
      if (seite && !reihenfolge.has(seite)) reihenfolge.set(seite, i);
    });
    return reihenfolge;
  }

  /* Setzt den Anlaufpunkt der neuen Seite. Muss laufen, BEVOR
     .active-page gesetzt wird - danach hat die Animation schon
     begonnen. */
  function richtung(vonID, nachID) {
    const ziel = document.getElementById(nachID);
    if (!ziel) return;

    // Immer zuerst zuruecksetzen: sonst behaelt eine Seite die
    // Richtung des letzten Aufrufs, wenn sie diesmal keine bekommt.
    ziel.style.removeProperty("--fh-seite-x");
    ziel.style.removeProperty("--fh-seite-y");

    if (reduziert() || !vonID || vonID === nachID) return;

    const ord = ordnung();
    if (!ord.has(vonID) || !ord.has(nachID)) return;

    const d = ord.get(nachID) - ord.get(vonID);
    if (!d) return;

    ziel.style.setProperty("--fh-seite-x", (d > 0 ? WEG : -WEG) + "px");
    ziel.style.setProperty("--fh-seite-y", "0px");
  }

  /* Die obersten Kinder des Inhaltsbereichs einblenden. Bewusst nur
     die oberste Ebene: eine Rangliste mit 50 Zeilen wuerde sonst
     eine halbe Sekunde lang durchrieseln. */
  function staffeln(seiteID) {
    if (seiteID === "home") return;

    const seite = document.getElementById(seiteID);
    if (!seite) return;

    const behaelter = seite.querySelector(INHALT);
    if (!behaelter) return;

    const kinder = [];
    for (const k of behaelter.children) {
      // Leere und ausgeblendete Kaesten mitzuzaehlen wuerde Luecken
      // in die Staffelung reissen.
      if (k.hidden || k.offsetParent === null) continue;
      const r = k.getBoundingClientRect();
      if (!r.height) continue;
      kinder.push(k);
      if (kinder.length >= 8) break;   // darunter sieht es niemand
    }
    if (!kinder.length) return;

    if (typeof gsap === "undefined" || reduziert()) {
      // Ohne GSAP oder bei reduzierter Bewegung: nichts anfassen.
      // Die Elemente stehen ohnehin sichtbar da - hier wird nur
      // aufgeraeumt, falls ein abgebrochener Lauf etwas hinterlassen
      // hat.
      kinder.forEach((k) => {
        k.style.removeProperty("opacity");
        k.style.removeProperty("transform");
      });
      return;
    }

    /* Der eigentliche Grund fuer GSAP: ein noch laufender Einlauf
       der vorigen Seite wird hier sauber abgeraeumt. Ohne das
       blieben Elemente auf opacity 0 stehen, wenn jemand schneller
       klickt als die Animation laeuft. */
    gsap.killTweensOf(kinder);

    gsap.fromTo(kinder,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.34,
        ease: "power2.out",
        stagger: 0.045,
        overwrite: "auto",
        // Die Zwischenwerte wieder loswerden: sonst steht auf jedem
        // Element dauerhaft ein inline-transform, das spaetere
        // CSS-Schwebezustaende ueberstimmt.
        clearProps: "opacity,transform",
      }
    );
  }

  /* Der Seitentitel laeuft buchstabenweise ein.

     SplitText zerlegt die Ueberschrift dafuer in <span> je Zeichen.
     Das MUSS danach wieder zurueckgesetzt werden: die Titel tragen
     data-i18n, und applyTranslations() schreibt beim Sprachwechsel
     el.textContent - stehen die Spans noch, waeren sie danach weg,
     und ein spaeterer revert() wuerde einen alten Stand
     zurueckschreiben. Dasselbe Muster benutzt cinematic.js fuer die
     Eroeffnung der Startseite schon.

     Der letzte Lauf wird vor dem naechsten immer abgeraeumt - wer
     schnell durchklickt, soll keine halb zerlegten Ueberschriften
     stehen haben. */
  let letzterSplit = null;

  function splitAbraeumen() {
    if (!letzterSplit) return;
    try { if (letzterSplit.revert) letzterSplit.revert(); } catch (err) { /* egal */ }
    letzterSplit = null;
  }

  function titel(seiteID) {
    splitAbraeumen();

    if (seiteID === "home") return;   // hat ihre eigene Eroeffnung
    if (reduziert()) return;
    if (typeof gsap === "undefined" || typeof SplitText === "undefined") return;

    const seite = document.getElementById(seiteID);
    if (!seite) return;
    const h = seite.querySelector("h1.fh-page-title");
    if (!h || !h.textContent.trim()) return;

    let split;
    try { split = new SplitText(h, { type: "chars" }); }
    catch (err) { return; }

    if (!split.chars || !split.chars.length) {
      if (split.revert) split.revert();
      return;
    }
    letzterSplit = split;

    gsap.killTweensOf(split.chars);
    gsap.from(split.chars, {
      yPercent: 55,
      opacity: 0,
      duration: 0.5,
      ease: "power3.out",
      stagger: 0.028,
      onComplete: function () {
        // Nur abraeumen, wenn seither kein neuer Lauf begonnen hat.
        if (letzterSplit === split) splitAbraeumen();
      },
    });
  }

  window.fhSeitenRichtung = richtung;
  window.fhSeitenStaffeln = staffeln;
  window.fhSeitenTitel = titel;
})();
