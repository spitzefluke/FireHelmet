/* ======================================================
   STARTSEITE: DER SCROLLWEG
   ---------------------------------------------------
   Eine Aufgabe: den Scrollfortschritt als Zahl zwischen 0 und 1
   in die CSS-Variable --fh-weg schreiben. Alles Sichtbare rechnet
   css/65-startseite.css daraus selbst aus.

   Warum nicht mehr in JavaScript? Weil hier bei jedem Scrollpixel
   gerechnet wird. Eine einzige Variable zu setzen und den Rest dem
   Compositor zu ueberlassen ist deutlich billiger, als zehn Ebenen
   einzeln anzufassen - und es ist dieselbe Bauweise, die die
   fruehere Sequenz schon hatte.

   WICHTIG: #home ist der Scroll-Container, nicht das Dokument.
   ScrollTrigger braucht deshalb "scroller: homeSection".
====================================================== */

(function () {
  "use strict";

  /* Die Laenge der Bahn in Pixeln. An EINER Stelle, damit sie sich
     ohne Suchen aendern laesst. Bei 8000 bekommt jeder der sechs
     Abschnitte gut 1300px - genug, damit er wirkt, statt
     vorbeizuhuschen. */
  const FH_START_WEG = 8000;

  const ruhig = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  let letzterBlitz = 0;
  let winkUhr = null;

  /* ------------------------------------------------------
     DER SCROLL-WINK
     Erscheint nach drei Sekunden ohne Scrollen und ist nach dem
     ERSTEN Scrollen endgueltig weg - nicht nach jeder Pause
     wieder. Wer einmal verstanden hat, dass es weitergeht, muss
     nicht erneut angetippt werden.
  ------------------------------------------------------ */
  function winkAufbauen(heim) {
    const wink = document.getElementById("fh-start-wink");
    if (!wink || ruhig.matches) return;

    function wegDamit() {
      clearTimeout(winkUhr);
      wink.hidden = true;
      heim.removeEventListener("scroll", wegDamit);
    }

    winkUhr = setTimeout(function () {
      // Nur zeigen, wenn wirklich noch nichts gescrollt wurde.
      if (heim.scrollTop > 4) return;
      wink.hidden = false;
    }, 3000);

    heim.addEventListener("scroll", wegDamit, { passive: true, once: true });

    /* Klick auf den Wink scrollt ein Stueck weiter - wer ihn
       antippt, will offensichtlich los. */
    window.fhStartWinkFolgen = function () {
      wegDamit();
      heim.scrollTo({ top: heim.clientHeight * 1.2, behavior: "smooth" });
    };
  }

  function bahnHoeheSetzen(heim, bahn) {
    /* Die Bahn ist so lang wie der gewuenschte Weg PLUS ein
       Bildschirm - sonst wuerde das letzte Bild nie erreicht,
       weil die klebende Buehne die letzten 100% aufbraucht.

       "Ein Bildschirm" ist dabei die Hoehe des SCROLL-CONTAINERS,
       nicht die des Fensters. Auf dem Handy sitzt unten die
       Tab-Leiste: #home ist dort rund 180px kuerzer als 100svh.
       Mass an der falschen Stelle genommen, und der Scrollweg war
       4184 statt 4000 - die Buehne bekommt deshalb dieselbe Zahl
       als --fh-schirm. */
    const schirm = heim.clientHeight || window.innerHeight;
    heim.style.setProperty("--fh-schirm", schirm + "px");
    bahn.style.height = (FH_START_WEG + schirm) + "px";
  }

  function blitzZuenden(blitz, weg) {
    if (!blitz || ruhig.matches) return;
    // Nur im Sturmabschnitt, und hoechstens alle 1,4 Sekunden.
    if (weg < 0.52 || weg > 0.72) return;
    const jetzt = Date.now();
    if (jetzt - letzterBlitz < 1400) return;
    if (Math.random() > 0.22) return;
    letzterBlitz = jetzt;
    blitz.classList.remove("zuckt");
    void blitz.offsetWidth;
    blitz.classList.add("zuckt");
  }

  function fhStartseiteAufbauen() {
    const heim = document.getElementById("home");
    const bahn = document.getElementById("fh-start");
    const buehne = document.getElementById("fh-start-buehne");
    const blitz = document.getElementById("fh-start-blitz");
    if (!heim || !bahn || !buehne) return;

    bahnHoeheSetzen(heim, bahn);
    window.addEventListener("resize", function () { bahnHoeheSetzen(heim, bahn); });

    if (ruhig.matches) {
      /* Ans Ende der Reise setzen: goldener Countdown, klarer
         Himmel. Die lange Bahn faellt dabei weg - 8000px zu
         scrollen, ohne dass sich etwas aendert, waere eine
         Zumutung und kein Entgegenkommen. */
      heim.style.setProperty("--fh-weg", "1");
      bahn.style.height = "auto";
      return;
    }

    winkAufbauen(heim);

    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      fhStartFallback(heim, bahn, buehne, blitz);
      return;
    }

    ScrollTrigger.create({
      trigger: bahn,
      scroller: heim,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (self) {
        heim.style.setProperty("--fh-weg", self.progress.toFixed(4));
        blitzZuenden(blitz, self.progress);
      },
    });
  }

  /* Ohne GSAP (CDN nicht erreichbar) derselbe Wert von Hand.
     rAF-gedrosselt, damit der Scroll-Handler nicht bei jedem
     Ereignis rechnet. */
  function fhStartFallback(heim, bahn, buehne, blitz) {
    let laeuft = false;

    function rechnen() {
      laeuft = false;
      const strecke = bahn.offsetHeight - buehne.offsetHeight;
      if (strecke <= 0) return;
      const weg = Math.min(1, Math.max(0, heim.scrollTop / strecke));
      heim.style.setProperty("--fh-weg", weg.toFixed(4));
      blitzZuenden(blitz, weg);
    }

    heim.addEventListener("scroll", function () {
      if (laeuft) return;
      laeuft = true;
      requestAnimationFrame(rechnen);
    }, { passive: true });

    rechnen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fhStartseiteAufbauen);
  } else {
    fhStartseiteAufbauen();
  }
})();
