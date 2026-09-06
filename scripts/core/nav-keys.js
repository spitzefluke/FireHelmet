/* ======================================================
   FH MENUE PER TASTATUR
   ---------------------------------------------------
   Die Menuepunkte sind <a>-Elemente OHNE href - sie rufen
   changePage() ueber onclick auf. Ein <a> ohne href ist fuer den
   Browser aber kein Link: es laesst sich nicht antabben und
   reagiert nicht auf Enter. Wer mit der Tastatur arbeitet, kam
   also gar nicht ins Menue.

   Solange die Punkte beschriftet waren, fiel das kaum auf - man
   sah wenigstens, wohin es geht. Seit dem 1c-Umbau zeigt die
   Leiste nur noch Symbole, und die Beschriftung erscheint erst
   beim Zeigen oder Anspringen. Damit ist der Tastaturweg
   Voraussetzung dafuer, dass die Navigation ueberhaupt lesbar
   bleibt.

   Das tabindex="0" steht im Markup (index.html), damit auch die
   Kopien in der Schublade es mitbekommen - scripts/core/nav-sync.js
   klont die Punkte einschliesslich Attribute. Hier kommt nur die
   Tastenbedienung dazu.

   Leertaste zusaetzlich zu Enter: die Punkte verhalten sich
   funktional wie Schaltflaechen, und dort erwartet man beides.

   Rein additiv - Mausbedienung, onclick und Reihenfolge bleiben
   unveraendert.
====================================================== */

(function () {
  "use strict";

  function aktiviere(e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;

    const item = e.target.closest("a[tabindex]");
    if (!item) return;
    // Echte Links (Dave Awards) macht der Browser selbst auf.
    if (item.hasAttribute("href")) return;

    // Leertaste scrollt sonst die Seite weg.
    e.preventDefault();
    item.click();
  }

  function init() {
    [".fh-sidebar-nav", "#sidebar"].forEach((sel) => {
      const box = document.querySelector(sel);
      if (box) box.addEventListener("keydown", aktiviere);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
