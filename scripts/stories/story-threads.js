/* ======================================================
   TAUWERK-HINTERGRUND FÜR DIE LOGBÜCHER
   ---------------------------------------------------
   Waagerechte, langsam wogende Linien hinter dem Archiv - wie
   Tauwerk, das sich im Wind bewegt. Die Seite hatte bisher gar
   keine eigene Stimmung; sie lag nur auf dem allgemeinen
   Nordlicht-Hintergrund.

   Nach "Threads" aus React Bits (https://reactbits.dev,
   MIT + Commons Clause, Copyright (c) 2026 David Haz).
   Uebernommen wurde die GLSL-Rechnung (Perlin-Rauschen plus
   Linienfunktion). Geaendert:

   1. VON ogl AUF three.js. Die Seite laedt three.js bereits fuer
      den Hintergrund und die Home-Eroeffnung; eine zweite
      WebGL-Bibliothek nur fuer diesen Effekt waere Ballast.
      Damit wird aus GLSL 1 (attribute/varying/gl_FragColor)
      GLSL 3 (in/out/eigene Ausgabe), weil fh-webgl.js darauf
      steht.

   2. 32 STATT 40 LINIEN. Der Shader rechnet das Perlin-Rauschen
      pro Bildpunkt und pro Linie - die Kosten haengen also direkt
      an dieser Zahl. Bei 22 waren zu wenige Straenge uebrig (die
      Linienfunktion blendet hohe Nummern ohnehin aus), bei 32
      stimmt das Bild und es bleibt ein Fuenftel guenstiger als die
      Vorlage.

   3. GOLD STATT WEISS, passend zu --fh-gold.

   Maussteuerung ist aus (in der Vorlage ebenfalls die Voreinstellung):
   sie kostet einen Zuhoerer auf der ganzen Seitenflaeche und eine
   Glaettung pro Bild fuer etwas, das hinter dem Inhalt liegt.
====================================================== */

(function () {
  "use strict";

  const FRAG = `precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform vec3  uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2  uMouse;

out vec4 fragColor;

#define PI 3.1415926538

/* 32 statt 40: die Kosten des Shaders haengen linear an dieser
   Zahl, siehe Kopf der Datei. */
const int u_line_count = 32;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
  vec2 Pi = floor(P);
  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
  Pt += vec2(26.0, 161.0).xyxy;
  Pt *= Pt;
  Pt = Pt.xzxz * Pt.yyww;
  vec4 hash_x = fract(Pt * (1.0 / 951.135664));
  vec4 hash_y = fract(Pt * (1.0 / 642.949883));
  vec4 grad_x = hash_x - 0.49999;
  vec4 grad_y = hash_y - 0.49999;
  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
      * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
  grad_results *= 1.4142135623730950;
  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
             * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
  vec4 blend2 = vec4(blend, vec2(1.0 - blend));
  return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
  return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset,
             vec2 mouse, float time, float amplitude, float distance) {
  float split_offset = (perc * 0.4);
  float split_point = 0.1 + split_offset;

  float amplitude_normal = smoothstep(split_point, 0.7, st.x);
  float amplitude_strength = 0.5;
  float finalAmplitude = amplitude_normal * amplitude_strength
                         * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

  float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
  float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

  float xnoise = mix(
    Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
    Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
    st.x * 0.3
  );

  float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

  float line_start = smoothstep(
    y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur), y, st.y);
  float line_end = smoothstep(
    y, y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur), st.y);

  return clamp((line_start - line_end)
               * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;

  float line_strength = 1.0;
  for (int i = 0; i < u_line_count; i++) {
    float p = float(i) / float(u_line_count);
    line_strength *= (1.0 - lineFn(
      uv,
      u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
      p, (PI * 1.0) * p, uMouse, iTime, uAmplitude, uDistance));
  }

  float wert = 1.0 - line_strength;
  fragColor = vec4(uColor * wert, wert);
}
`;

  /* Der Shader rechnet pro Bildpunkt - die Kosten haengen also an
     der Zahl der gezeichneten Punkte. Auf grossen und feinen
     Bildschirmen wird deshalb heruntergerechnet; die Linien sind so
     weich, dass man es nicht sieht. */
  const MAX_KANTE = 1280;

  let renderer = null;
  let szene = null;
  let kamera = null;
  let material = null;
  let huelle = null;
  let rafId = 0;
  let laeuft = false;
  let aufgegeben = false;
  let wacht = null;
  let resizeHandler = null;

  function aufbauen() {
    if (renderer || aufgegeben) return !!renderer;
    if (!window.fhWebGL) return false;

    huelle = document.getElementById("story-ambient-fx");
    if (!huelle) return false;

    renderer = window.fhWebGL.rendererErzeugen({ alpha: true });
    if (!renderer) {
      // Kein WebGL oder Software-Rasterung: die Seite bleibt schlicht
      // ohne diesen Effekt - sie hatte vorher auch keinen.
      aufgegeben = true;
      return false;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "story-threads-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    huelle.appendChild(renderer.domElement);

    szene = new THREE.Scene();
    kamera = new THREE.Camera();

    const netz = window.fhWebGL.vollbildNetz(FRAG, {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      uColor: { value: new THREE.Vector3(0.84, 0.66, 0.31) }, // --fh-gold
      uAmplitude: { value: 1.4 },
      uDistance: { value: 0.35 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    });
    material = netz.material;
    szene.add(netz);

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

    const basis = Math.min(window.devicePixelRatio || 1, 2);
    const kante = Math.max(b, h) * basis;
    const dpr = kante > MAX_KANTE ? (basis * MAX_KANTE) / kante : basis;

    renderer.setPixelRatio(dpr);
    renderer.setSize(b, h, false);
    material.uniforms.iResolution.value.set(b * dpr, h * dpr, b / h);
    standbildFallsNoetig();
  }

  /* Groessenaenderung leert den WebGL-Puffer. Solange die Schleife
     laeuft, faellt das nicht auf - beim naechsten Bild steht wieder
     etwas da. Bei "Bewegung reduzieren" laeuft aber keine Schleife,
     und der Effekt waere nach jedem Fensterwechsel verschwunden. */
  function standbildFallsNoetig() {
    if (laeuft || aufgegeben || !renderer) return;
    if (!window.fhWebGL.reduzierteBewegung()) return;
    material.uniforms.iTime.value = 6.0;
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
    material.uniforms.iTime.value = t * 0.001;
    renderer.render(szene, kamera);
    if (wacht(t)) return aufgeben();
    rafId = requestAnimationFrame(bild);
  }

  function starten() {
    if (laeuft || aufgegeben) return;
    if (!aufbauen()) return;

    // Die Groesse steht erst fest, wenn die Seite sichtbar ist -
    // auf display:none sind alle Masse 0.
    groesse();

    if (window.fhWebGL.reduzierteBewegung()) {
      // Ein einziges Bild: das Tauwerk steht sichtbar da, es bewegt
      // sich nur nicht.
      standbildFallsNoetig();
      return;
    }

    laeuft = true;
    rafId = requestAnimationFrame(bild);
  }

  function anhalten() {
    laeuft = false;
    cancelAnimationFrame(rafId);
  }

  function updateStoryBackgroundPage(pageID) {
    if (pageID === "story") starten();
    else anhalten();
  }

  document.addEventListener("visibilitychange", function () {
    const s = document.getElementById("story");
    if (document.hidden) anhalten();
    else if (s && s.classList.contains("active-page")) starten();
  });

  window.updateStoryBackgroundPage = updateStoryBackgroundPage;
})();
