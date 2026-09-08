/* ======================================================
   FH HINTERGRUND: EINE EBENE STATT DREI
   ---------------------------------------------------
   Der Seitenhintergrund bestand aus drei fest positionierten
   Vollbild-Ebenen, die alle gleichzeitig dauerhaft animiert waren
   (siehe .stars/.stars2/.nebula in css/00-basis.css):

     .stars   background-position, 120s, endlos
     .stars2  background-position,  80s, endlos, rueckwaerts
     .nebula  transform + filter: blur(90px) auf 900x900px, endlos

   Jede davon zwingt den Browser, bei JEDEM Bild die ganze
   Seitenflaeche neu zu zeichnen - der Weichzeichner der Nebel-Ebene
   zusaetzlich mit einem 90px-Radius. Gemessen: mit allen
   CSS-Animationen an 13 Bilder/s, ohne sie 60 (in einer
   Software-Rendering-Umgebung, die absoluten Zahlen sind also
   pessimistisch - das Verhaeltnis nicht).

   Hier ersetzt EINE Leinwand alle drei. Sternenfeld, Nordlicht und
   Nebelschein entstehen in einem einzigen Shader-Durchlauf auf der
   Grafikkarte, statt in drei sich ueberlagernden Zeichenvorgaengen
   auf dem Hauptprozessor.

   Die drei <div> bleiben als Rueckfallebene im Markup: ohne WebGL
   (alte Geraete, abgeschaltete Hardwarebeschleunigung) sieht man
   weiterhin Sterne und Nebel - dann eben statisch.

   Nordlicht-Shader nach "Aurora" aus React Bits
   (https://reactbits.dev, MIT + Commons Clause,
   Copyright (c) 2026 David Haz). Uebernommen wurde die
   GLSL-Rechnung; Sternenfeld, Nebelschein und die Einbettung ohne
   React sind hier dazugekommen.
====================================================== */

(function () {
  "use strict";

  /* Farben der Seite (siehe --fh-* in css/00-basis.css). Bewusst
     gedaempft: der Hintergrund liegt hinter JEDER Seite und darf
     nichts uebertoenen. */
  const FARBEN = [
    [0.10, 0.29, 0.45], // --fh-blue, etwas aufgehellt
    [0.26, 0.72, 1.00], // --fh-cold #42b8ff
    [0.84, 0.66, 0.31], // --fh-gold #d6a84f
  ];

  /* Ohne "#version 300 es": three.js stellt die Zeile bei
     glslVersion: THREE.GLSL3 selbst voran, und sie muss die erste
     im Programm sein - schreibt man sie mit, steht sie doppelt und
     der Shader laesst sich nicht uebersetzen. */
  const VERT = `in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

  /* --- Nordlicht: Simplex-Rauschen + Farbverlauf (React Bits) ---
     --- Sterne und Nebelschein: hier ergaenzt ------------------- */
  const FRAG = `precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3  uColorStops[3];
uniform vec2  uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/* Zufallswert pro Rasterzelle - Grundlage des Sternenfeldes. */
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

/* Ein Sternenfeld: Raster, pro Zelle hoechstens ein Stern an
   zufaelliger Stelle, der langsam heller und dunkler wird.
   Ersetzt die beiden gekachelten radial-gradient-Ebenen. */
float sterne(vec2 uv, float dichte, float groesse, float phase) {
  vec2 g = uv * dichte;
  vec2 zelle = floor(g);
  vec2 lokal = fract(g) - 0.5;

  float r = hash21(zelle);
  if (r < 0.82) return 0.0;               // die meisten Zellen bleiben leer

  vec2 mitte = (vec2(hash21(zelle + 1.7), hash21(zelle + 9.1)) - 0.5) * 0.7;
  float d = length(lokal - mitte);

  float funkeln = 0.65 + 0.35 * sin(uTime * 0.8 + r * 40.0 + phase);
  return smoothstep(groesse, 0.0, d) * funkeln * (r - 0.82) / 0.18;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float seite = uResolution.x / uResolution.y;

  /* ---- Nordlicht (React Bits) ---- */
  vec3 rampe;
  {
    float f = uv.x;
    rampe = f < 0.5
      ? mix(uColorStops[0], uColorStops[1], f * 2.0)
      : mix(uColorStops[1], uColorStops[2], (f - 0.5) * 2.0);
  }

  float hoehe = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  hoehe = exp(hoehe);
  hoehe = (uv.y * 2.0 - hoehe + 0.2);
  float staerke = 0.6 * hoehe;

  float mitte = 0.20;
  float alpha = smoothstep(mitte - uBlend * 0.5, mitte + uBlend * 0.5, staerke);
  vec3 nordlicht = staerke * rampe * alpha;

  /* Nach oben ausblenden: unten am Horizont am kraeftigsten. */
  nordlicht *= smoothstep(1.05, 0.15, uv.y);

  /* ---- Nebelschein in der Mitte (ersetzt .nebula) ---- */
  vec2 m = (uv - 0.5) * vec2(seite, 1.0);
  float schein = exp(-dot(m, m) * 3.2);
  schein *= 0.55 + 0.45 * sin(uTime * 0.12);
  vec3 nebel = vec3(0.0, 0.42, 0.85) * schein * 0.16;

  /* ---- Sternenfeld (ersetzt .stars und .stars2) ---- */
  vec2 suv = vec2(uv.x * seite, uv.y);
  float s1 = sterne(suv,  9.0, 0.055, 0.0);
  float s2 = sterne(suv, 16.0, 0.040, 2.1);
  vec3 sternenlicht = vec3(1.0, 1.0, 1.0) * s1 * 0.55
                    + vec3(0.55, 0.75, 1.0) * s2 * 0.40;

  vec3 farbe = nordlicht * 0.55 + nebel + sternenlicht;
  fragColor = vec4(farbe, 1.0);
}
`;

  let renderer = null;
  let rafId = 0;
  let laeuft = false;

  function init() {
    const ziel = document.getElementById("fh-bg-canvas");
    if (!ziel || !window.fhWebGL) return;

    /* Kein WebGL oder erkennbar Software-Rasterung: die drei <div>
       bleiben als Rueckfallebene sichtbar. Warum, steht in
       scripts/core/fh-webgl.js. */
    renderer = window.fhWebGL.rendererErzeugen({ canvas: ziel, alpha: false });
    if (!renderer) return;

    /* Der Hintergrund ist weich und liegt hinter allem. Volle
       Pixeldichte waere dort verschwendet: bei 0.75 sind es nur noch
       gut die Haelfte der Bildpunkte, und man sieht keinen
       Unterschied. */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1) * 0.75);

    const szene = new THREE.Scene();
    const kamera = new THREE.Camera();

    const netz = window.fhWebGL.vollbildNetz(FRAG, {
      uTime: { value: 0 },
      uAmplitude: { value: 0.9 },
      uBlend: { value: 0.55 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uColorStops: { value: FARBEN.map((f) => new THREE.Vector3(f[0], f[1], f[2])) },
    }, { vertexShader: VERT, transparent: false });
    const material = netz.material;
    szene.add(netz);

    function groesse() {
      const b = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(b, h, false);
      material.uniforms.uResolution.value.set(
        b * renderer.getPixelRatio(),
        h * renderer.getPixelRatio()
      );
    }

    window.addEventListener("resize", groesse);
    groesse();

    // Die <div>-Rueckfallebene erst jetzt abschalten - bis hierher
    // kann noch etwas fehlschlagen, und dann soll sie stehenbleiben.
    document.body.classList.add("fh-bg-canvas-aktiv");

    /* Zweite Sicherung (siehe fh-webgl.js): haelt die Leinwand keine
       vernuenftige Bildrate, schaltet sie sich selbst ab und die
       CSS-Ebenen kommen zurueck. Besser ein ruhiger Sternenhimmel
       als ein ruckelnder. */
    const wacht = window.fhWebGL.bildwacht();

    function aufgeben() {
      stopp();
      document.body.classList.remove("fh-bg-canvas-aktiv");
      const c = renderer.domElement;
      renderer.dispose();
      if (c) c.style.display = "none";
      renderer = null;
    }

    function bild(t) {
      material.uniforms.uTime.value = t * 0.0004;
      renderer.render(szene, kamera);

      if (wacht(t)) return aufgeben();

      rafId = requestAnimationFrame(bild);
    }

    function start() {
      if (laeuft) return;
      laeuft = true;
      rafId = requestAnimationFrame(bild);
    }

    function stopp() {
      laeuft = false;
      cancelAnimationFrame(rafId);
    }

    if (window.fhWebGL.reduzierteBewegung()) {
      // Ein einziges Bild: das Nordlicht steht, die Sterne stehen.
      // Sichtbar bleibt alles, bewegt wird nichts.
      material.uniforms.uTime.value = 1.7;
      renderer.render(szene, kamera);
    } else {
      start();
      // Im Hintergrundtab weiterrechnen kostet Akku und bringt
      // niemandem etwas. requestAnimationFrame pausiert zwar in den
      // meisten Browsern von selbst, aber nicht in allen und nicht
      // in jedem Fenstermodus.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopp(); else start();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
