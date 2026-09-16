/* ======================================================
   LICHTPUNKT AUF DEM SEITENTITEL
   ---------------------------------------------------
   Der Titel der offenen Seite traegt einen hellen Fleck, der dem
   Zeiger folgt - als striche man mit einer Lampe darueber. Das
   Aussehen steht in css/90-typografie.css; hier kommen nur die
   beiden Zahlen her.

   Drei Dinge, die es zurueckhaltend halten:

   1. NUR MIT ECHTEM ZEIGER. Auf Beruehrungsgeraeten gibt es kein
      Schweben; dort bliebe der Fleck stehen, wo zuletzt getippt
      wurde. Die CSS-Regel steht deshalb in (hover: hover), und der
      Zuhoerer wird hier gar nicht erst gesetzt.

   2. HOECHSTENS EINMAL PRO BILD. mousemove feuert deutlich
      oefter, als der Bildschirm zeichnet. Ohne die Bremse
      schriebe der Code Dutzende Male je Bild dieselbe Eigenschaft
      neu - Arbeit, von der niemand etwas sieht.

   3. NUR AUF DEM TITEL DER OFFENEN SEITE. Ein Fleck auf jedem Text
      waere Unruhe; auf einer Ueberschrift ist es ein Akzent.

   Bei "Bewegung reduzieren" passiert nichts: der Fleck bleibt in
   der Mitte stehen, der Titel sieht aus wie ohne.
====================================================== */

(function () {
  "use strict";

  function init() {
    const zeigerDa = window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!zeigerDa) return;

    if (window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let offen = false;
    let mausX = 0;
    let mausY = 0;

    function schreiben() {
      offen = false;
      const titel = document.querySelector(".page.active-page h1.fh-page-title");
      if (!titel) return;

      const r = titel.getBoundingClientRect();
      if (!r.width || !r.height) return;

      /* In Prozent der Ueberschrift - so stimmt der Punkt
         unabhaengig von deren Groesse und Lage. Bewusst NICHT
         begrenzt: laeuft der Zeiger daran vorbei, wandert der
         Fleck aus dem Text heraus und der Titel wird wieder
         gleichmaessig hell. Genau das soll er. */
      const x = ((mausX - r.left) / r.width) * 100;
      const y = ((mausY - r.top) / r.height) * 100;

      titel.style.setProperty("--fh-licht-x", x.toFixed(1) + "%");
      titel.style.setProperty("--fh-licht-y", y.toFixed(1) + "%");
    }

    document.addEventListener("mousemove", function (e) {
      mausX = e.clientX;
      mausY = e.clientY;
      // Eine Anforderung pro Bild reicht - siehe Kopf, Punkt 2.
      if (offen) return;
      offen = true;
      requestAnimationFrame(schreiben);
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
