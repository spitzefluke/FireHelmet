/* ======================================================
   GSAP-PLUGINS REGISTRIEREN
   ---------------------------------------------------
   Muss NACH allen GSAP-<script>-Tags in index.html geladen werden
   und VOR jedem Script, das gsap.to()/ScrollTrigger.create()/etc.
   benutzt. Der typeof-Check faengt ab, wenn der CDN mal nicht
   erreichbar war - Scripts, die GSAP nutzen (z.B. cinematic.js),
   pruefen selbst auf "typeof gsap" und haben einen Fallback.
====================================================== */

if (typeof gsap !== "undefined") {
  gsap.registerPlugin(
    MotionPathPlugin,
    MorphSVGPlugin,
    ScrollTrigger,
    ScrollSmoother,
    ScrollToPlugin
  );
}
