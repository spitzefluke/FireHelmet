/* ======================================================
   FH SIDEBAR AMBIENT (three.js)
   ---------------------------------------------------
   Macht die feste Desktop-Sidebar (.fh-sidebar) etwas lebendiger:
   ein ruhiges, sehr dezentes WebGL-Glutpartikelfeld hinter den
   Menuepunkten, das langsam nach oben treibt - passend zum
   "Feuer"-Thema und zur bestehenden Gold-Gluehen-Sprache (siehe
   .fh-ember auf der Home-Seite, celebration-burst-3d.js).

   Bewusst rein dekorativ und komplett vom eigentlichen Navigations-
   verhalten entkoppelt (kein Einfluss auf changePage()/Klicks/
   Tastatur-Fokus) - faellt three.js/WebGL/reduzierte Bewegung weg
   oder ist die Sidebar (unter 1024px) gar nicht sichtbar, passiert
   einfach nichts, das bestehende Aussehen (Funken beim Klick,
   Hover-Effekte, siehe main.js/style.css) bleibt unveraendert.
====================================================== */

(function () {
  "use strict";

  if (typeof THREE === "undefined") return;

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  const isDesktopSidebar = window.matchMedia
    ? window.matchMedia("(min-width: 1024px)")
    : { matches: false };

  if (prefersReducedMotion.matches || !isDesktopSidebar.matches) return;

  const PARTICLE_COUNT = 40;
  let ready = false;

  function init() {
    if (ready) return;

    const sidebar = document.getElementById("fh-sidebar");
    if (!sidebar) return;
    ready = true;

    const canvas = document.createElement("canvas");
    canvas.id = "fh-sidebar-ambient-webgl";
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

    sidebar.insertBefore(canvas, sidebar.firstChild);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-124, 124, 0, -812, 1, 1000);
    camera.position.z = 100;

    function buildGlowSprite() {
      const size = 32;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,.7)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(c);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const drifts = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 240;
      positions[i * 3 + 1] = -Math.random() * 812;
      positions[i * 3 + 2] = 0;
      speeds[i] = 6 + Math.random() * 14;
      drifts[i] = (Math.random() - 0.5) * 6;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      map: buildGlowSprite(),
      color: 0xf0c96a,
      size: 5,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    function resize() {
      const w = sidebar.clientWidth;
      const h = sidebar.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = 0;
      camera.bottom = -h;
      camera.updateProjectionMatrix();
    }
    resize();

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(sidebar);
    } else {
      window.addEventListener("resize", resize, { passive: true });
    }

    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);

      // Nur rendern, solange die Sidebar tatsaechlich sichtbar ist
      // (unter 1024px ist .fh-sidebar per CSS display:none -> canvas
      // hat dann kein offsetParent).
      if (canvas.offsetParent === null) return;

      const dt = Math.min(clock.getDelta(), 0.1);
      const pos = geometry.attributes.position.array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pos[i * 3 + 1] += speeds[i] * dt;
        pos[i * 3] += Math.sin((pos[i * 3 + 1] + i * 40) * 0.01) * drifts[i] * dt;

        if (pos[i * 3 + 1] > 20) {
          pos[i * 3 + 1] = -812;
          pos[i * 3] = (Math.random() - 0.5) * 240;
        }
      }
      geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    }

    animate();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
