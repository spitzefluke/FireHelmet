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

   NACHTRAG: der Zuhoerer hing zuerst nur an der Seitenleiste und an
   der Schublade. Gemessen blieben damit sieben weitere <a> ohne
   href aussen vor - darunter die GESAMTE untere Leiste am Handy
   (Home, Boss, Rennen, Rangliste), beide Gateway-Links und der
   Anmelde-Hinweis auf der Schatzrad-Seite. Die waren per Tastatur
   nicht erreichbar.

   Deshalb haengt der Zuhoerer jetzt am Dokument. Das ist genau ein
   Zuhoerer fuer die ganze Seite, greift auch fuer Elemente, die
   spaeter erst erzeugt werden, und braucht keine Pflege, wenn ein
   weiterer Punkt dazukommt.

   Leertaste zusaetzlich zu Enter: die Punkte verhalten sich
   funktional wie Schaltflaechen, und dort erwartet man beides.

   Rein additiv - Mausbedienung, onclick und Reihenfolge bleiben
   unveraendert.
====================================================== */

(function () {
  "use strict";

  function aktiviere(e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;

    /* Am Dokument haengend kommt hier jeder Tastendruck der Seite
       vorbei - auch die Leertaste in einem Eingabefeld. Die darf
       nicht abgefangen werden. */
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

    const item = t && t.closest ? t.closest("a[tabindex]") : null;
    if (!item) return;
    // Echte Links (Dave Awards) macht der Browser selbst auf.
    if (item.hasAttribute("href")) return;

    // Leertaste scrollt sonst die Seite weg.
    e.preventDefault();
    item.click();
  }

  function init() {
    document.addEventListener("keydown", aktiviere);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
