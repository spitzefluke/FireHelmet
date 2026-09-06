/* ======================================================
   GSAP-PLUGINS REGISTRIEREN
   ---------------------------------------------------
   Muss NACH allen GSAP-<script>-Tags in index.html geladen werden
   und VOR jedem Script, das gsap.to()/ScrollTrigger.create()/etc.
   benutzt. Scripts, die GSAP nutzen (z.B. cinematic.js), pruefen
   selbst auf "typeof gsap" und haben einen Fallback.

   Frueher stand hier ein einziger registerPlugin()-Aufruf mit
   allen fuenf Plugins. Der war nur gegen ein fehlendes "gsap"
   abgesichert - laedt GSAP selbst, aber ein einzelnes
   Plugin-Script nicht (CDN-Aussetzer, Adblocker, Netzfehler),
   warf der Zugriff auf den fehlenden Namen einen ReferenceError.
   Damit brach die Registrierung KOMPLETT ab, auch fuer die
   Plugins, die geladen hatten.

   Jetzt wird jedes Plugin einzeln geprueft und registriert. Faellt
   eines aus, laufen die anderen weiter, und in der Konsole steht,
   welches fehlt.
====================================================== */

(function () {
  "use strict";

  if (typeof gsap === "undefined") {
    console.warn("GSAP nicht geladen - Animationen laufen im Fallback.");
    return;
  }

  // Namen als Strings, damit ein fehlendes Plugin hier kein
  // ReferenceError ausloest, sondern nur "undefined" ergibt.
  const plugins = [
    "MotionPathPlugin",
    "MorphSVGPlugin",
    "ScrollTrigger",
    "ScrollSmoother",
    "ScrollToPlugin",
    "SplitText",
    "DrawSVGPlugin",
    "Flip",
    "CustomEase",
  ];

  const fehlend = [];

  plugins.forEach((name) => {
    const plugin = window[name];
    if (!plugin) {
      fehlend.push(name);
      return;
    }
    try {
      gsap.registerPlugin(plugin);
    } catch (err) {
      fehlend.push(name);
      console.warn("GSAP-Plugin konnte nicht registriert werden:", name, err);
    }
  });

  if (fehlend.length) {
    console.warn(
      "GSAP-Plugins fehlen (die uebrigen sind registriert):",
      fehlend.join(", ")
    );
  }
})();
