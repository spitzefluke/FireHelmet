/* ======================================================
   SCROLL-REVEAL
   ---------------------------------------------------
   EIN IntersectionObserver fuer die ganze Seite: jedes Element
   mit der Klasse ".fh-reveal" blendet ein, sobald es ins Bild
   kommt. Kein eigener Scroll-Listener je Element.

   Diese Datei hiess bis zum Umbau der Startseite
   scripts/home/cinematic.js und trug daneben die scroll-
   gebundene Eroeffnungssequenz (Schiff, Nebel, Video,
   Sternschnuppe, Cursor-Licht, Titel-Reveal). Die Startseite
   zeigt jetzt nur noch den Countdown - siehe
   scripts/home/startseite.js -, und alle Elemente, die jene
   Funktionen ansprachen, gibt es nicht mehr. Uebrig bleibt der
   Reveal, und der war nie an die Startseite gebunden: er wird
   von scripts/stories/stories.js benutzt und steht jeder
   weiteren Seite offen.

   Wer neue Karten per JS nachtraegt, ruft danach
   window.fhScanReveals() - der Observer wird
   wiederverwendet, nicht neu gebaut.
====================================================== */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  let fhRevealObserver = null;

  function fhScanReveals() {
    // Nur Elemente, die noch nicht behandelt wurden (frisch eingefuegt) -
    // "data-fh-reveal-bound" markiert bereits erfasste Elemente, damit
    // wiederholte Aufrufe (z.B. bei jedem Seitenwechsel) nichts doppelt
    // beobachten oder den Delay-Versatz neu verwuerfeln.
    const targets = document.querySelectorAll(".fh-reveal:not([data-fh-reveal-bound])");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion.matches) {
      // Kein Observer verfügbar oder reduzierte Bewegung gewünscht:
      // Inhalte sofort vollständig sichtbar machen, nichts animieren.
      targets.forEach((el) => {
        el.classList.add("fh-reveal-visible");
        el.setAttribute("data-fh-reveal-bound", "1");
      });
      return;
    }

    if (!fhRevealObserver) {
      fhRevealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("fh-reveal-visible");
              fhRevealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
      );
    }

    targets.forEach((el, i) => {
      el.style.setProperty("--fh-reveal-delay", `${Math.min(i * 0.08, 0.4)}s`);
      el.setAttribute("data-fh-reveal-bound", "1");
      fhRevealObserver.observe(el);
    });
  }

  // Global aufrufbar, damit andere Render-Funktionen (Rangliste, Shop,
  // Stories, Characters, Community-Boss, Support, ...) nach dem Einfuegen
  // neuer .fh-reveal-Karten einfach fhScanReveals() nachrufen koennen -
  // kein neues eigenes Observer-System pro Bereich noetig.
  window.fhScanReveals = fhScanReveals;

  function fhInitReveal() {
    fhScanReveals();
  }

  /* ------------------------------------------------------
     2) SCHIFF-VERFOLGUNG / SCROLL-FORTSCHRITT
  ------------------------------------------------------ */
  let journeyReady = false;

  window.addEventListener("DOMContentLoaded", fhInitReveal);
})();
