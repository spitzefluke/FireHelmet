/* ======================================================
   GSAP-PLUGINS REGISTRIEREN
   ---------------------------------------------------
   Muss NACH allen GSAP-<script>-Tags in index.html geladen werden
   und VOR jedem Script, das gsap.to()/ScrollTrigger.create()/etc.
   benutzt.
====================================================== */

gsap.registerPlugin(
  MotionPathPlugin,
  MorphSVGPlugin,
  ScrollTrigger,
  ScrollSmoother,
  ScrollToPlugin
);
