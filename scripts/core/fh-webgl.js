/* ======================================================
   FH WEBGL-BASIS
   ---------------------------------------------------
   Vier Stellen der Seite zeichnen inzwischen mit WebGL:

     scripts/core/aurora-bg.js       Hintergrund aller Seiten
     scripts/stories/story-threads.js  Logbuecher
     scripts/wheel/wheel-particles.js  Schatzrad
     scripts/core/celebration-burst-3d.js (aelter, eigener Aufbau)

   Alle brauchen dieselben Vorpruefungen: Gibt es three.js? Gibt es
   einen WebGL-Kontext? Wird in Software gerendert? Haelt die
   Bildrate? Diese Datei beantwortet das an EINER Stelle - sonst
   stuenden dieselben Regeln viermal da und wuerden viermal
   auseinanderlaufen.

   Nichts hier zeichnet selbst. Die Datei stellt nur Werkzeuge
   bereit und muss deshalb VOR den drei Effektdateien geladen
   werden.
====================================================== */

(function () {
  "use strict";

  /* Ohne Grafikbeschleunigung ist ein bildschirmfuellender Shader
     teurer als das CSS, das er ersetzt. Gemessen in einer
     Software-Rendering-Umgebung: 60 -> 23 Bilder/s. Auf einer echten
     Grafikkarte ist es umgekehrt. Diese Namen tauchen auf, wenn der
     Browser mangels Treiber auf die Software-Rasterung ausweicht. */
  const SOFTWARE = /swiftshader|llvmpipe|software|microsoft basic|angle \(software/i;

  function reduzierteBewegung() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /* Erzeugt einen Renderer oder gibt null zurueck - null heisst
     immer "hier nicht mit WebGL arbeiten", ohne dass der Aufrufer
     die Gruende auseinanderhalten muesste.

     optionen wird an THREE.WebGLRenderer durchgereicht; ueblich ist
     { canvas } fuer eine vorhandene Leinwand oder gar nichts, dann
     legt three.js selbst eine an (renderer.domElement). */
  function rendererErzeugen(optionen) {
    if (typeof THREE === "undefined") return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer(
        Object.assign(
          {
            antialias: false,
            alpha: true,
            powerPreference: "low-power",
          },
          optionen || {}
        )
      );
    } catch (err) {
      // Kein WebGL: alte Geraete, abgeschaltete Hardwarebeschleunigung,
      // zu viele offene Kontexte. Der Aufrufer laesst dann sein CSS
      // stehen.
      return null;
    }

    let chip = "";
    try {
      const gl = renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) chip = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    } catch (err) {
      chip = "";
    }

    if (SOFTWARE.test(chip)) {
      renderer.dispose();
      return null;
    }

    return renderer;
  }

  /* Zweite Sicherung nach der Chip-Kennung: die sagt nicht alles
     (manche Browser verschweigen sie, manche Treiber sind trotz
     Namens langsam). Deshalb werden die ersten Bilder gemessen.

     Rueckgabe ist eine Funktion melde(t), die pro Bild einmal mit
     dem Zeitstempel aus requestAnimationFrame aufgerufen wird und
     true liefert, sobald aufgegeben werden soll. Danach misst sie
     nicht weiter.

     Der Median statt des Mittelwerts, weil die ersten Bilder nach
     dem Aufbau regelmaessig Ausreisser sind. */
  function bildwacht(einstellungen) {
    const opt = einstellungen || {};
    const bilder = opt.bilder || 45;
    const grenzeMs = opt.grenzeMs || 24; // 24ms sind gut 40 Bilder/s
    let probe = [];
    let letzte = 0;

    return function melde(t) {
      if (!probe) return false;

      if (letzte) probe.push(t - letzte);
      letzte = t;

      if (probe.length < bilder) return false;

      const sortiert = probe.slice().sort((a, b) => a - b);
      const median = sortiert[Math.floor(sortiert.length / 2)];
      probe = null;
      return median > grenzeMs;
    };
  }

  /* Ein einzelnes bildschirmfuellendes Dreieck statt zweier
     Vierecks-Dreiecke: eine Rasterung weniger an der Diagonale.

     three.js leitet aus "position" sonst eine Huellkugel ab und
     rechnet dabei mit drei Komponenten - bei unseren zweien kommt
     NaN heraus. Das Dreieck fuellt ohnehin immer das Bild, es
     braucht weder Huellkugel noch Sichtbarkeitspruefung. */
  function vollbildDreieck() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2)
    );
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    return g;
  }

  /* Ein Netz aus einem Vollbild-Dreieck plus Shader, fertig
     zusammengesteckt - der Teil, den sich Aurora und Threads sonst
     Zeile fuer Zeile teilen wuerden. */
  function vollbildNetz(frag, uniforms, optionen) {
    const opt = optionen || {};
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      /* Ohne "#version 300 es": three.js stellt die Zeile bei
         glslVersion: THREE.GLSL3 selbst voran, und sie muss die
         erste im Programm sein - schreibt man sie mit, steht sie
         doppelt und der Shader laesst sich nicht uebersetzen. */
      vertexShader:
        opt.vertexShader ||
        "in vec2 position;\nvoid main() { gl_Position = vec4(position, 0.0, 1.0); }\n",
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      // Ein deckender Hintergrund braucht kein Mischen; eine Ebene
      // ueber dem Seiteninhalt sehr wohl.
      transparent: opt.transparent !== false,
      uniforms: uniforms,
    });

    const netz = new THREE.Mesh(vollbildDreieck(), material);
    netz.frustumCulled = false;
    return netz;
  }

  window.fhWebGL = {
    reduzierteBewegung: reduzierteBewegung,
    rendererErzeugen: rendererErzeugen,
    bildwacht: bildwacht,
    vollbildDreieck: vollbildDreieck,
    vollbildNetz: vollbildNetz,
  };
})();
