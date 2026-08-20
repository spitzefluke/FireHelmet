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
      #fh-journey-scene). Nutzt GSAP ScrollTrigger, um den
      Fortschritt (0-1) als CSS-Variable --fh-progress zu
      schreiben, solange #home (der Scroll-Container) durch
      den 300vh hohen Track scrollt. Die meisten Ebenen (Nebel,
      Sterne, Ziel ...) laufen weiterhin komplett in CSS via
      calc()/clamp() auf --fh-progress - GSAP ersetzt hier nur
      den frueheren, selbst gebauten rAF-Scroll-Listener (siehe
      fhShipJourneyFallback() weiter unten, falls GSAP/
      ScrollTrigger mal nicht laden sollten). Zusaetzlich holt
      GSAP das Schiff selbst von der reinen Geradeausfahrt: Es
      folgt jetzt per MotionPathPlugin einer leicht geschwungenen
      Route (fhInitShipMotionPath()), dazu Segelflattern/Kielwasser
      per CSS und eine gelegentliche Sternschnuppe beim Durchqueren
      der Sternenhimmel-Phase (fhInitShootingStar()).

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

    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      // CDN nicht erreichbar o.ä. - alter handgeschriebener
      // Scroll-Listener als Fallback, damit die Sequenz notfalls
      // trotzdem funktioniert statt bei --fh-progress:0 haengen zu bleiben.
      fhShipJourneyFallback(homeSection, track, scene);
      return;
    }

    const scrollTriggerBase = {
      trigger: track,
      scroller: homeSection,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
    };

    gsap.to(scene, {
      "--fh-progress": 1,
      ease: "none",
      scrollTrigger: scrollTriggerBase,
    });

    fhInitShipMotionPath(homeSection, scrollTriggerBase);
    fhInitShootingStar(track, homeSection);
  }

  /* ------------------------------------------------------
     SCHIFF AUF EINEM WELLENFOERMIGEN PFAD (GSAP MotionPathPlugin)
     Ersetzt die fruehere reine Geradeaus-Bewegung (nur --fh-progress
     als x-Versatz) durch eine echte, leicht geschwungene Segelroute
     ueber das Meer - waehrend die eigentliche Groessen-Skalierung
     (per scale) weiterhin am selben ScrollTrigger haengt wie
     --fh-progress oben, also exakt synchron bleibt.
  ------------------------------------------------------ */
  function fhInitShipMotionPath(homeSection, scrollTriggerBase) {
    const shipRig = document.getElementById("fh-ship-rig");
    if (!shipRig || typeof MotionPathPlugin === "undefined") return;

    // Reisedistanz an die tatsaechliche Breite anpassen (deckt sich
    // in etwa mit dem alten "32vw" aus der CSS-calc()-Version), nach
    // oben gedeckelt, damit die Route auf riesigen Screens nicht
    // ausufert.
    const travel = Math.min(homeSection.clientWidth, 1200) * 0.34;

    // Startzustand: weit rechts, klein - wie zuvor per calc().
    gsap.set(shipRig, { xPercent: -50, x: travel, y: 18, scale: 0.5 });

    gsap.to(shipRig, {
      motionPath: {
        path: [
          { x: travel * 0.7, y: -22 },
          { x: travel * 0.4, y: 20 },
          { x: travel * 0.15, y: -14 },
          { x: 0, y: 0 },
        ],
        curviness: 1.35,
      },
      scale: 1.35,
      ease: "none",
      scrollTrigger: scrollTriggerBase,
    });
  }

  /* ------------------------------------------------------
     GELEGENTLICHE STERNSCHNUPPE
     Einmaliger Flourish, sobald man beim Scrollen die Sternenhimmel-
     Phase durchquert (~38% der Strecke) - sowohl vorwaerts als auch
     rueckwaerts scrollend. Rein dekorativ, auf Mobile deaktiviert
     (Punkt 24/32-Konvention wie schon bei fhSpawnEmbers()).
  ------------------------------------------------------ */
  function fhInitShootingStar(track, homeSection) {
    const star = document.getElementById("fh-shooting-star");
    if (!star || isMobile.matches) return;

    function fire() {
      gsap.killTweensOf(star);
      gsap.fromTo(
        star,
        { x: 0, y: 0, opacity: 0 },
        { x: -200, y: 100, opacity: 1, duration: .8, ease: "power1.in",
          onComplete: () => gsap.to(star, { opacity: 0, duration: .25 }) }
      );
    }

    // "38% top" wuerde sich auf 38% der reinen Track-Hoehe beziehen -
    // eine andere Skala als --fh-progress (das zusaetzlich die
    // Viewport-Hoehe abzieht, siehe scrollTriggerBase oben). Der
    // px-Offset unten nutzt dieselbe Rechnung wie dort, damit die
    // Sternschnuppe wirklich bei ~38% des sichtbaren Fortschritts
    // ausgeloest wird statt erst deutlich spaeter.
    const scrollRange = track.offsetHeight - homeSection.clientHeight;

    ScrollTrigger.create({
      trigger: track,
      scroller: homeSection,
      start: `top+=${Math.max(0, scrollRange * 0.38)} top`,
      onEnter: fire,
      onEnterBack: fire,
    });
  }

  /* rAF-entprellter Scroll-Listener, funktional identisch zur
     bisherigen (Vor-GSAP) Implementierung - nur noch als Fallback. */
  function fhShipJourneyFallback(homeSection, track, scene) {
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
