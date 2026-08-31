/* ======================================================
   MOTION-FX: GESTAFFELTE EINBLEND-ANIMATION FUER LISTEN/GRIDS
   ---------------------------------------------------
   Nutzt die "motion"-Bibliothek (window.Motion, siehe index.html -
   per CDN geladen, global als "Motion" verfuegbar, KEIN Bundler
   noetig). Ergaenzt rein additiv das, was GSAP bisher NICHT abdeckt:
   GSAP kuemmert sich ausschliesslich um die Home-Seite (siehe
   scripts/home/cinematic.js), die einzelnen Karten/Zeilen auf allen
   anderen Seiten (Rangliste, Shop, Stories, Characters, ...) hatten
   bisher gar keine Eintritts-Animation - genau diese Luecke fuellt
   staggerReveal() unten.

   WICHTIG: reine Anzeige-Ebene. staggerReveal() erstellt/entfernt/
   verschiebt niemals Elemente und aendert nie Klassen, IDs oder
   Attribute - es animiert nur opacity/transform der bereits fertig
   gerenderten Elemente. Jeder Aufruf ist ein einzelner, zusaetzlicher
   Funktionsaufruf direkt NACH dem bestehenden innerHTML-Aufbau in der
   jeweiligen render()-Funktion, sonst nichts wird an der bestehenden
   Rendering-Logik veraendert.

   Faellt in jedem Fehlerfall (Motion nicht geladen, reduzierte
   Bewegung gewuenscht, kein passendes Element gefunden) einfach
   lautlos auf "keine Animation" zurueck - Inhalte bleiben normal
   sofort sichtbar, nichts wird jemals unsichtbar "haengen gelassen".
====================================================== */

function staggerReveal(container, itemSelector, opts) {
  if (!container) return;

  const items = container.querySelectorAll(itemSelector);
  if (!items.length) return;

  if (typeof Motion === "undefined" || typeof Motion.animate !== "function") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const options = opts || {};
  const staggerStep = options.stagger || 0.045;
  const duration = options.duration || 0.4;
  const distance = options.distance || 14;

  try {
    Motion.animate(
      items,
      { opacity: [0, 1], transform: [`translateY(${distance}px)`, "translateY(0px)"] },
      {
        duration,
        delay: Motion.stagger(staggerStep),
        // Entspricht --fh-ease (style.css) - dieselbe Bewegungssprache
        // wie der bestehende .page-Uebergang, kein zweiter, abweichender
        // "Look".
        easing: [0.22, 0.9, 0.32, 1],
      }
    );
  } catch (err) {
    // Nie eine kaputte Seite riskieren, nur weil eine optionale
    // Zier-Animation scheitert (z.B. veraltete Motion-Version).
    console.warn("staggerReveal() konnte nicht animieren:", err);
  }
}
