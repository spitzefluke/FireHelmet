/* ======================================================
   SCHATZSTAUB HINTER DEM SCHATZRAD
   ---------------------------------------------------
   Frei schwebende Lichtpunkte in Gold, Kaltblau und Warmweiss -
   Staub, der ums Rad steht. Die Seite hatte bisher nur die Funken
   nach einer Drehung (#wheel-sparks); dazwischen war der Raum leer.

   Nach "Particles" aus React Bits (https://reactbits.dev,
   MIT + Commons Clause, Copyright (c) 2026 David Haz).
   Uebernommen wurden die beiden Shader und die Punktverteilung
   (gleichmaessig in einer Kugel, nicht im Wuerfel - sonst sitzen
   die Ecken voll). Geaendert:

   1. VON ogl AUF three.js, wie beim Tauwerk der Logbuecher: die
      Seite laedt three.js ohnehin.

      Dabei bleibt der Shader bewusst in GLSL 1
      (attribute/varying/gl_FragColor) - also THREE.RawShaderMaterial
      OHNE glslVersion. three.js reicht ihn dann unveraendert durch,
      und WebGL 2 uebersetzt ESSL-1-Programme weiterhin. Die
      Matrix-Uniformen (modelMatrix, viewMatrix, projectionMatrix)
      setzt three.js auch bei RawShaderMaterial selbst, sobald sie
      im Shader stehen.

   2. DAS FARBATTRIBUT HEISST "farbe", NICHT "color". "color" ist bei
      three.js der Name, den vertexColors belegt - der Effekt braucht
      diese Verbindung nicht, und ein eigener Name kann sich damit
      auch nicht ueberkreuzen.

   3. WEICHE STATT HARTER PUNKTE (alphaParticles), damit es nach
      Staub aussieht und nicht nach Konfetti.
====================================================== */

(function () {
  "use strict";

  const ANZAHL = 220;
  const STREUUNG = 10;
  const TEMPO = 0.12;
  const GRUNDGROESSE = 300;
  const KAMERA_ABSTAND = 20;

  /* --fh-gold, --fh-cold und ein warmes Weiss. */
  const FARBEN = [
    [0.84, 0.66, 0.31],
    [0.26, 0.72, 1.00],
    [1.00, 0.95, 0.84],
  ];

  const VERT = `
attribute vec3 position;
attribute vec4 zufall;
attribute vec3 farbe;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uSpread;
uniform float uBaseSize;
uniform float uSizeRandomness;

varying vec4 vZufall;
varying vec3 vFarbe;

void main() {
  vZufall = zufall;
  vFarbe = farbe;

  vec3 pos = position * uSpread;
  pos.z *= 10.0;

  vec4 mPos = modelMatrix * vec4(pos, 1.0);
  float t = uTime;
  mPos.x += sin(t * zufall.z + 6.28 * zufall.w) * mix(0.1, 1.5, zufall.x);
  mPos.y += sin(t * zufall.y + 6.28 * zufall.x) * mix(0.1, 1.5, zufall.w);
  mPos.z += sin(t * zufall.w + 6.28 * zufall.y) * mix(0.1, 1.5, zufall.z);

  vec4 mvPos = viewMatrix * mPos;
  gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (zufall.x - 0.5))) / length(mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

  const FRAG = `
precision highp float;

uniform float uTime;
varying vec4 vZufall;
varying vec3 vFarbe;

void main() {
  vec2 uv = gl_PointCoord.xy;
  float d = length(uv - vec2(0.5));
  // Weicher Rand statt harter Scheibe: nach Staub, nicht nach Konfetti.
  float kreis = smoothstep(0.5, 0.32, d) * 0.8;
  gl_FragColor = vec4(vFarbe + 0.15 * sin(uv.yxx + uTime + vZufall.y * 6.28), kreis);
}
`;

  let renderer = null;
  let szene = null;
  let kamera = null;
  let material = null;
  let punkte = null;
  let huelle = null;
  let rafId = 0;
  let laeuft = false;
  let aufgegeben = false;
  let wacht = null;
  let resizeHandler = null;
  let vergangen = 0;
  let letzte = 0;

  function aufbauen() {
    if (renderer || aufgegeben) return !!renderer;
    if (!window.fhWebGL) return false;

    huelle = document.getElementById("wheel-ambient-fx");
    if (!huelle) return false;

    renderer = window.fhWebGL.rendererErzeugen({ alpha: true });
    if (!renderer) {
      // Kein WebGL oder Software-Rasterung: die Seite bleibt ohne
      // Staub - die Funken nach der Drehung gibt es weiterhin.
      aufgegeben = true;
      return false;
    }

    renderer.setClearColor(0x000000, 0);
    // Punkte sind weich; volle Pixeldichte bringt hier nichts.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "wheel-particles-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    huelle.appendChild(renderer.domElement);

    szene = new THREE.Scene();
    kamera = new THREE.PerspectiveCamera(15, 1, 0.1, 200);
    kamera.position.set(0, 0, KAMERA_ABSTAND);

    const orte = new Float32Array(ANZAHL * 3);
    const zufall = new Float32Array(ANZAHL * 4);
    const farben = new Float32Array(ANZAHL * 3);

    for (let i = 0; i < ANZAHL; i++) {
      /* Gleichmaessig in einer Kugel: erst einen Punkt im
         Einheitswuerfel ziehen und verwerfen, was ausserhalb liegt,
         dann mit der dritten Wurzel auf den Radius abbilden. Ohne
         das saessen die Ecken voll und die Mitte waere leer. */
      let x, y, z, l;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        l = x * x + y * y + z * z;
      } while (l > 1 || l === 0);
      const r = Math.cbrt(Math.random());
      orte.set([x * r, y * r, z * r], i * 3);
      zufall.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      farben.set(FARBEN[(Math.random() * FARBEN.length) | 0], i * 3);
    }

    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute("position", new THREE.BufferAttribute(orte, 3));
    geometrie.setAttribute("zufall", new THREE.BufferAttribute(zufall, 4));
    geometrie.setAttribute("farbe", new THREE.BufferAttribute(farben, 3));

    /* Kein glslVersion: der Shader bleibt GLSL 1, siehe Kopf. */
    material = new THREE.RawShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: STREUUNG },
        /* gl_PointSize rechnet in Geraetepunkten, GRUNDGROESSE ist
           aber als CSS-Groesse gedacht - ohne die Pixeldichte waeren
           die Staubkoerner auf feinen Bildschirmen kleiner. */
        uBaseSize: { value: GRUNDGROESSE * renderer.getPixelRatio() },
        uSizeRandomness: { value: 1 },
      },
    });

    punkte = new THREE.Points(geometrie, material);
    /* Der Shader verschiebt die Punkte selbst (uSpread und die
       Sinus-Auslenkung). Die Huellkugel aus den rohen Orten passt
       danach nicht mehr - three.js wuerde die Wolke wegkuerzen,
       sobald sie ueber den Rand ragt. */
    punkte.frustumCulled = false;
    szene.add(punkte);

    groesse();

    if (!resizeHandler) {
      resizeHandler = groesse;
      window.addEventListener("resize", resizeHandler);
    }

    wacht = window.fhWebGL.bildwacht();
    return true;
  }

  function groesse() {
    if (!renderer || !huelle) return;
    const b = huelle.clientWidth;
    const h = huelle.clientHeight;
    if (!b || !h) return;
    renderer.setSize(b, h, false);
    kamera.aspect = b / h;
    kamera.updateProjectionMatrix();
    standbildFallsNoetig();
  }

  /* Groessenaenderung leert den WebGL-Puffer. Solange die Schleife
     laeuft, faellt das nicht auf - beim naechsten Bild steht wieder
     etwas da. Bei "Bewegung reduzieren" laeuft aber keine Schleife,
     und der Effekt waere nach jedem Fensterwechsel verschwunden. */
  function standbildFallsNoetig() {
    if (laeuft || aufgegeben || !renderer) return;
    if (!window.fhWebGL.reduzierteBewegung()) return;
    material.uniforms.uTime.value = 3.0;
    renderer.render(szene, kamera);
  }

  function aufgeben() {
    anhalten();
    aufgegeben = true;
    if (renderer) {
      const c = renderer.domElement;
      renderer.dispose();
      if (c && c.parentNode) c.parentNode.removeChild(c);
      renderer = null;
    }
  }

  function bild(t) {
    if (!laeuft) return;

    vergangen += (letzte ? t - letzte : 16) * TEMPO;
    letzte = t;

    material.uniforms.uTime.value = vergangen * 0.001;
    punkte.rotation.x = Math.sin(vergangen * 0.0002) * 0.1;
    punkte.rotation.y = Math.cos(vergangen * 0.0005) * 0.15;
    punkte.rotation.z += 0.01 * TEMPO;

    renderer.render(szene, kamera);
    if (wacht(t)) return aufgeben();
    rafId = requestAnimationFrame(bild);
  }

  function starten() {
    if (laeuft || aufgegeben) return;
    if (!aufbauen()) return;

    // Die Groesse steht erst fest, wenn die Seite sichtbar ist.
    groesse();

    if (window.fhWebGL.reduzierteBewegung()) {
      // Ein einziges Bild: der Staub steht sichtbar im Raum.
      standbildFallsNoetig();
      return;
    }

    letzte = 0;
    laeuft = true;
    rafId = requestAnimationFrame(bild);
  }

  function anhalten() {
    laeuft = false;
    letzte = 0;
    cancelAnimationFrame(rafId);
  }

  function updateWheelParticlesPage(pageID) {
    if (pageID === "wheel") starten();
    else anhalten();
  }

  document.addEventListener("visibilitychange", function () {
    const w = document.getElementById("wheel");
    if (document.hidden) anhalten();
    else if (w && w.classList.contains("active-page")) starten();
  });

  window.updateWheelParticlesPage = updateWheelParticlesPage;
})();
