/* ======================================================
   FH CINEMATIC HOME EXPERIENCE
   ---------------------------------------------------
   Zwei unabhängige, schlanke Systeme:

   1) fhInitReveal()
      Zentrales Scroll-Reveal für die Klasse ".fh-reveal"
      (siehe style.css). Nutzt EINEN IntersectionObserver
      für die ganze Seite statt vieler einzelner
      Scroll-Listener. Kann künftig auch auf andere
      Bereiche (Cards, Panels, ...) angewendet werden,
      ohne dass dafür neuer JS-Code nötig ist - einfach
      die Klasse "fh-reveal" ergänzen.

   2) fhInitShipJourney()
      Treibt die neue Scroll-gebundene Eröffnungssequenz
      auf der Home-Seite (#fh-journey-track /
      #fh-journey-scene). EIN Scroll-Listener auf #home
      (rAF-entprellt), der den Fortschritt (0-1) als
      CSS-Variable --fh-progress schreibt. Die eigentliche
      Bewegung der Ebenen (Schiff, Nebel, Sterne, Ziel ...)
      passiert dadurch komplett in CSS via calc()/clamp() -
      pro Frame nur EIN einziger Style-Write.

   Beides ist bewusst additiv und komplett von den
   bestehenden Home-Effekten (scripts/core/main.js,
   scripts/home/home-crack.js) entkoppelt: keine
   bestehende Funktion/ID/Klasse wird verändert, keine
   globale Funktion wird überschrieben oder umbenannt.
====================================================== */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const isMobile = window.matchMedia
    ? window.matchMedia("(max-width: 640px)")
    : { matches: false };

  /* ------------------------------------------------------
     1) ZENTRALES SCROLL-REVEAL (".fh-reveal")
  ------------------------------------------------------ */
  function fhInitReveal() {
    const targets = document.querySelectorAll(".fh-reveal");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion.matches) {
      // Kein Observer verfügbar oder reduzierte Bewegung gewünscht:
      // Inhalte sofort vollständig sichtbar machen, nichts animieren.
      targets.forEach((el) => el.classList.add("fh-reveal-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("fh-reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el, i) => {
      el.style.setProperty("--fh-reveal-delay", `${Math.min(i * 0.08, 0.4)}s`);
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------
     2) SCHIFF-VERFOLGUNG / SCROLL-FORTSCHRITT
  ------------------------------------------------------ */
  let journeyReady = false;

  function fhInitShipJourney() {
    if (journeyReady) return; // keine doppelten Listener

    const homeSection = document.getElementById("home");
    const track = document.getElementById("fh-journey-track");
    const scene = document.getElementById("fh-journey-scene");

    if (!homeSection || !track || !scene) return;
    journeyReady = true;

    fhSpawnEmbers();

    if (prefersReducedMotion.matches) {
      // Reduzierte Bewegung: statischer Endzustand, kein
      // fortlaufendes Scroll-Tracking nötig - Inhalte bleiben
      // trotzdem vollständig erreichbar/lesbar.
      scene.style.setProperty("--fh-progress", "1");
      return;
    }

    let ticking = false;

    function updateProgress() {
      ticking = false;

      const trackHeight = track.offsetHeight - homeSection.clientHeight;
      if (trackHeight <= 0) {
        scene.style.setProperty("--fh-progress", "0");
        return;
      }

      const scrolled = homeSection.scrollTop - track.offsetTop;
      const progress = Math.min(1, Math.max(0, scrolled / trackHeight));
      scene.style.setProperty("--fh-progress", progress.toFixed(4));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    }

    homeSection.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    updateProgress();
  }

  /* ------------------------------------------------------
     DEZENTE PARTIKEL/GLUT VOR DEM SCHIFF
     Anzahl auf Mobile reduziert (Performance, siehe Punkt
     24/32 der Vorgaben). Rein dekorativ (aria-hidden Layer).
  ------------------------------------------------------ */
  function fhSpawnEmbers() {
    const layer = document.getElementById("fh-particle-layer");
    if (!layer || layer.childElementCount) return;
    if (prefersReducedMotion.matches) return;

    const count = isMobile.matches ? 8 : 18;

    for (let i = 0; i < count; i++) {
      const ember = document.createElement("span");
      ember.className = "fh-ember";
      ember.style.setProperty("--fh-ember-x", `${Math.random() * 100}%`);
      ember.style.setProperty("--fh-ember-delay", `${(Math.random() * 7).toFixed(2)}s`);
      ember.style.setProperty("--fh-ember-duration", `${(6 + Math.random() * 5).toFixed(2)}s`);
      layer.appendChild(ember);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    fhInitReveal();
    fhInitShipJourney();
  });
})();
