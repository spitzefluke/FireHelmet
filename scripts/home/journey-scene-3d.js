/* ======================================================
   FH JOURNEY SCENE - 3D-EBENE (three.js)
   ---------------------------------------------------
   Reworkt die bisher rein 2D/CSS-getriebenen Sterne- und
   Glut-Ebenen der Scroll-Eroeffnungssequenz (siehe
   scripts/home/cinematic.js) um eine echte WebGL-Tiefenebene:
   ein Sternenfeld MIT Tiefen-Parallaxe (statt der bisherigen
   flachen Hintergrundgrafik in .fh-layer-stars, die als
   Fallback-Basis unveraendert bestehen bleibt) und ein
   Glut-Partikelfeld, das die vorherigen DOM-<span>-Embers
   (fhSpawnEmbers() in cinematic.js) ersetzt.

   Faehrt - wie der Rest der Sequenz - ausschliesslich ueber
   die bereits von GSAP ScrollTrigger geschriebene CSS-Variable
   --fh-progress (kein zweiter Scroll-Listener) sowie die von
   fhInitCursorParallax() gepflegten --fh-cursor-x/-y. Bewusst
   in einer eigenen Datei statt cinematic.js direkt zu erweitern -
   faellt so komplett weg, wenn three.js/WebGL nicht verfuegbar
   sind, ohne die bestehende, seit langem stabile Sequenz
   anzufassen.

   AUS-Bedingungen (identische Konvention wie beim Video/der
   Sternschnuppe in cinematic.js):
   - typeof THREE === "undefined" (CDN nicht geladen/geblockt)
   - prefers-reduced-motion
   - Mobile (schwerste Ebene der ganzen Sequenz, WebGL auf
     schwachen Geraeten/Akkusparmodus vermeiden)
   - WebGL selbst nicht verfuegbar (Renderer-Erstellung wirft)

   In jedem dieser Faelle bleibt exakt der bisherige Zustand
   (flache CSS-Sterne + DOM-Embers) erhalten - siehe die
   window.fhJourney3DActive-Abfrage in fhSpawnEmbers().
====================================================== */

(function () {
  "use strict";

  if (typeof THREE === "undefined") return;

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const isMobile = window.matchMedia
    ? window.matchMedia("(max-width: 640px)")
    : { matches: false };

  if (prefersReducedMotion.matches || isMobile.matches) return;

  const STAR_COUNT = 500;
  const EMBER_COUNT = 90;

  let ready = false;

  function init() {
    if (ready) return;

    const scene = document.getElementById("fh-journey-scene");
    const starsLayer = document.querySelector(".fh-layer-stars");
    if (!scene || !starsLayer) return;
    ready = true;

    let renderer;
    const canvas = document.createElement("canvas");
    canvas.id = "fh-journey-webgl";
    canvas.className = "fh-layer fh-layer-webgl";
    canvas.setAttribute("aria-hidden", "true");

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch (err) {
      // Kein WebGL - alter CSS-Stern-Hintergrund + DOM-Embers
      // (fhSpawnEmbers()) bleiben unveraendert die Loesung, siehe
      // Kopfkommentar. window.fhJourney3DActive bleibt bewusst
      // undefined, kein weiterer Code hier noetig.
      return;
    }

    starsLayer.insertAdjacentElement("afterend", canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 2000);
    camera.position.z = 400;

    /* Weiche, kreisrunde Glow-Textur statt der harten Standard-Quadrate
       von THREE.PointsMaterial - per Canvas zur Laufzeit erzeugt statt
       nachgeladen, damit keine weitere externe Ressource noetig ist.
       Passt zur bestehenden Gold-Gluehen-Sprache der Seite (siehe
       .fh-ember/box-shadow an anderer Stelle). */
    function buildGlowSprite() {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0,
        size / 2, size / 2, size / 2
      );
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,.7)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    }

    const glowSprite = buildGlowSprite();

    /* Sternenfeld: viele weit entfernte Punkte. Die Kamera fährt beim
       Scrollen leicht nach vorn (siehe animate()), wodurch die Sterne
       eine echte Tiefen-Parallaxe bekommen statt sich nur flach zu
       verschieben. */
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 1800;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 1100;
      starPositions[i * 3 + 2] = -Math.random() * 1500 - 100;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      map: glowSprite,
      color: 0xbcdfff,
      size: 3.2,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const starPoints = new THREE.Points(starGeometry, starMaterial);
    threeScene.add(starPoints);

    /* Glut-Partikel: nah an der Kamera, treiben in Endlosschleife nach
       oben - ersetzt die vorherigen DOM-<span>-Embers 1:1 in der
       Wirkung, aber mit echter Tiefenstaffelung statt einer flachen
       Ebene. */
    const emberGeometry = new THREE.BufferGeometry();
    const emberPositions = new Float32Array(EMBER_COUNT * 3);
    const emberSpeeds = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i++) {
      emberPositions[i * 3] = (Math.random() - 0.5) * 700;
      emberPositions[i * 3 + 1] = (Math.random() - 0.5) * 500 - 100;
      emberPositions[i * 3 + 2] = Math.random() * 300 - 50;
      emberSpeeds[i] = 0.15 + Math.random() * 0.35;
    }
    emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
    const emberMaterial = new THREE.PointsMaterial({
      map: glowSprite,
      color: 0xf0c96a,
      size: 5,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const emberPoints = new THREE.Points(emberGeometry, emberMaterial);
    threeScene.add(emberPoints);

    function resize() {
      const w = scene.clientWidth;
      const h = scene.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const clock = new THREE.Clock();

    function readProgressVar(name, fallback) {
      const raw = getComputedStyle(scene).getPropertyValue(name);
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function animate() {
      requestAnimationFrame(animate);

      // Nur rendern, solange die Home-Seite tatsaechlich sichtbar ist
      // (".page:not(.active-page)" ist display:none -> offsetParent
      // ist dann null) - billiger Check statt einer eigenen Kopplung
      // an changePage().
      if (scene.offsetParent === null) return;

      const dt = Math.min(clock.getDelta(), 0.1);
      const progress = readProgressVar("--fh-progress", 0);
      const cursorX = readProgressVar("--fh-cursor-x", 50);
      const cursorY = readProgressVar("--fh-cursor-y", 45);

      camera.position.z = 400 - progress * 260;
      camera.position.x = (cursorX - 50) * 0.6;
      camera.position.y = -(cursorY - 45) * 0.4;
      camera.lookAt(0, 0, -500);

      const positions = emberGeometry.attributes.position.array;
      for (let i = 0; i < EMBER_COUNT; i++) {
        positions[i * 3 + 1] += emberSpeeds[i] * dt * 60;
        if (positions[i * 3 + 1] > 280) {
          positions[i * 3 + 1] = -280;
          positions[i * 3] = (Math.random() - 0.5) * 700;
        }
      }
      emberGeometry.attributes.position.needsUpdate = true;

      starPoints.rotation.y += dt * 0.006;

      renderer.render(threeScene, camera);
    }

    animate();

    // Signalisiert fhSpawnEmbers() (cinematic.js), dass die 3D-Ebene
    // uebernimmt und die alten DOM-Embers nicht zusaetzlich gespawnt
    // werden sollen. Wird erst HIER gesetzt (nach erfolgreichem
    // WebGLRenderer-Aufbau), nicht schon am Dateianfang - deckt so
    // auch den Fall ab, dass THREE zwar laedt, WebGL selbst aber
    // nicht verfuegbar ist (siehe catch oben).
    window.fhJourney3DActive = true;
  }

  window.addEventListener("DOMContentLoaded", init);
})();
