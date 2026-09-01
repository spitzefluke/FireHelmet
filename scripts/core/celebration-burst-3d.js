/* ======================================================
   FH CELEBRATION BURST (three.js)
   ---------------------------------------------------
   Ein einziger, wiederverwendbarer 3D-Konfetti-/Funken-Ausbruch fuer
   die "grossen" Gewinn-/Erfolgsmomente im Projekt (Jackpot in der
   Spielothek, besiegter Community-Boss, ...) - EINE gemeinsame
   Implementierung statt paralleler Logik pro Feature (siehe bereits
   bestehende, bewusst einfachere 2D-Effekte wie
   triggerSpielothekConfetti() in spielothek.js oder spawnWheelSparks()
   in wheel.js, die für die HÄUFIGEN, kleineren Gewinne unveraendert
   bleiben - dieser hier ist zusaetzlich nur fuer die seltenen,
   besonders grossen Momente gedacht, damit er nicht durch staendige
   Wiederholung an Wirkung verliert).

   window.fhCelebrationBurst(targetEl, options) erzeugt einen
   kurzlebigen WebGL-Canvas GENAU ueber targetEl (fixed positioniert,
   deckungsgleich mit dessen BoundingClientRect), laesst Partikel
   radial mit Schwerkraft auseinanderfliegen und raeumt sich nach
   Ablauf der Dauer automatisch wieder auf (Canvas + alle three.js-
   Ressourcen).

   AUS-Bedingungen (dieselbe Konvention wie journey-scene-3d.js):
   - typeof THREE === "undefined" (CDN nicht geladen/geblockt)
   - prefers-reduced-motion
   - WebGL selbst nicht verfuegbar (Renderer-Erstellung wirft)
   In jedem dieser Faelle passiert einfach nichts - der jeweilige
   Aufrufer hat ohnehin schon einen eigenen (einfacheren) Effekt, der
   unveraendert weiterlaeuft.
====================================================== */

(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  let glowSpriteCache = null;

  function buildGlowSprite() {
    if (glowSpriteCache) return glowSpriteCache;

    const size = 32;
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

    glowSpriteCache = new THREE.CanvasTexture(c);
    return glowSpriteCache;
  }

  function fhCelebrationBurst(targetEl, options) {
    if (typeof THREE === "undefined") return;
    if (prefersReducedMotion.matches) return;
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const opts = Object.assign({
      colors: [0xf0c96a, 0xd6a84f, 0xffffff],
      count: 70,
      duration: 1500,
      size: 9,
    }, options);

    const canvas = document.createElement("canvas");
    canvas.className = "fh-celebration-burst-canvas";
    canvas.setAttribute("aria-hidden", "true");

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch (err) {
      return;
    }

    canvas.style.left = rect.left + "px";
    canvas.style.top = rect.top + "px";
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    document.body.appendChild(canvas);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(rect.width, rect.height, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -rect.width / 2, rect.width / 2,
      rect.height / 2, -rect.height / 2,
      1, 1000
    );
    camera.position.z = 500;

    const count = opts.count;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 2);
    const colorsAttr = new Float32Array(count * 3);
    const colorPalette = opts.colors.map((c) => new THREE.Color(c));

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 200;
      velocities[i * 2] = Math.cos(angle) * speed;
      velocities[i * 2 + 1] = Math.sin(angle) * speed;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colorsAttr[i * 3] = color.r;
      colorsAttr[i * 3 + 1] = color.g;
      colorsAttr[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsAttr, 3));

    const material = new THREE.PointsMaterial({
      size: opts.size,
      map: buildGlowSprite(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const gravity = 260;
    let start = null;

    function cleanup() {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      canvas.remove();
    }

    function frame(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const t = elapsed / 1000;

      const pos = geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        pos[i * 3] = velocities[i * 2] * t;
        pos[i * 3 + 1] = velocities[i * 2 + 1] * t - 0.5 * gravity * t * t;
      }
      geometry.attributes.position.needsUpdate = true;

      material.opacity = Math.max(0, 1 - elapsed / opts.duration);
      renderer.render(scene, camera);

      if (elapsed < opts.duration) {
        requestAnimationFrame(frame);
      } else {
        cleanup();
      }
    }

    requestAnimationFrame(frame);
  }

  window.fhCelebrationBurst = fhCelebrationBurst;
})();
