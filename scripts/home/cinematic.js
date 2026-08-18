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
  // Observer lebt auf Modul-Ebene (nicht mehr nur innerhalb der Funktion),
  // damit fhScanReveals() ihn spaeter WIEDERVERWENDEN kann - noetig, weil
  // Karten-Raster wie Rangliste/Shop/Stories/Characters/Community-Boss/
  // Support erst BEIM SEITENWECHSEL per JS neu gerendert werden (die
  // urspruengliche fhInitReveal() lief nur einmal beim allerersten Laden
  // und haette diese spaeter eingefuegten .fh-reveal-Elemente nie erfasst).
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

  /* ------------------------------------------------------
     3) DEZENTES CURSOR-LICHT (nur Desktop mit echter Maus)
     Ein Radial-Glow in der Ship-Scene folgt leicht dem
     Mauszeiger (Punkt 32) - auf Touch-Geräten und bei
     reduzierter Bewegung deaktiviert, rAF-entprellt wie der
     Scroll-Fortschritt, schreibt nur zwei CSS-Variablen.
  ------------------------------------------------------ */
  function fhInitCursorParallax() {
    const canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover || prefersReducedMotion.matches) return;

    const scene = document.getElementById("fh-journey-scene");
    if (!scene) return;

    let ticking = false;
    let lastX = 50;
    let lastY = 50;

    function apply() {
      ticking = false;
      scene.style.setProperty("--fh-cursor-x", `${lastX}%`);
      scene.style.setProperty("--fh-cursor-y", `${lastY}%`);
    }

    scene.addEventListener(
      "pointermove",
      (e) => {
        const rect = scene.getBoundingClientRect();
        lastX = ((e.clientX - rect.left) / rect.width) * 100;
        lastY = ((e.clientY - rect.top) / rect.height) * 100;
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(apply);
      },
      { passive: true }
    );
  }

  window.addEventListener("DOMContentLoaded", () => {
    fhInitReveal();
    fhInitShipJourney();
    fhInitCursorParallax();
  });
})();
