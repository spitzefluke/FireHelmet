/* ======================================================
   FH VERBINDER ZEICHNEN
   ---------------------------------------------------
   Level-Pfad und Piratenpass zeigen ihren Fortschritt ueber eine
   Kette kleiner Verbindungsstriche zwischen den Knoten. Die
   ausgefuellten Striche (= schon erreicht) standen bisher
   schlagartig da.

   Sie wachsen jetzt von links nach rechts nacheinander an - der
   Weg zeichnet sich also bis zum aktuellen Stand.

   WARUM KEIN DrawSVGPlugin: die Verbinder sind keine SVG-Pfade,
   sondern schlichte <div>-Balken (siehe .fh-levelpath-connector
   und .piratenpass-connector in style.css). DrawSVG arbeitet
   ueber stroke-dasharray und kann mit ihnen nichts anfangen -
   fuer einen Balken ist scaleX das richtige Mittel und braucht
   ausserdem kein Plugin.

   Rein dekorativ: ohne GSAP oder bei reduzierter Bewegung
   passiert nichts, die Striche sind dann sofort da wie bisher.
====================================================== */

(function () {
  "use strict";

  function fhDrawConnectors(container, selector) {
    if (!container) return;

    const prefersReduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    if (typeof gsap === "undefined") return;

    const striche = container.querySelectorAll(selector);
    if (!striche.length) return;

    gsap.fromTo(
      striche,
      { scaleX: 0 },
      {
        scaleX: 1,
        // Von der linken Kante aus wachsen, nicht aus der Mitte -
        // sonst sieht es aus, als entstuende der Strich ueberall
        // gleichzeitig statt entlang des Weges.
        transformOrigin: "left center",
        duration: 0.32,
        ease: "power2.out",
        stagger: 0.05,
        // Danach die Inline-Styles wieder entfernen: die Striche
        // sollen im Ruhezustand exakt so aussehen wie vorher, ohne
        // von GSAP gesetztes transform.
        clearProps: "transform",
      }
    );
  }

  window.fhDrawConnectors = fhDrawConnectors;
})();
