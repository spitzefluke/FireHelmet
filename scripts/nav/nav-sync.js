/* ======================================================
   FH NAV-SYNC
   ---------------------------------------------------
   Die Seite hatte ihre Menuepunkte ZWEIMAL im Markup: einmal in
   der festen Desktop-Sidebar (.fh-sidebar-nav) und einmal im
   Schubladen-Menue (#sidebar), das unter 1024px per Hamburger
   aufgeht. Jede Aenderung musste an beiden Stellen gemacht werden -
   beim Umbau der Menue-Icons war genau das der Fall, und ein
   vergessener Zweig faellt erst auf dem Handy auf.

   Ab jetzt ist die Sidebar die einzige gepflegte Liste. Die
   Schublade wird daraus abgeleitet.

   Zwei bewusste Unterschiede bleiben erhalten:
   - "Spielothek" heisst in der schmalen Sidebar kurz so, in der
     breiteren Schublade ausgeschrieben "Aendiis Spielothek".
   - Der Gateway-Zugang steht NUR in der Schublade. Er bleibt als
     statischer Eintrag im Markup und wird hier nicht angefasst.

   Die Klassen werden beim Uebertragen bewusst abgelegt: die
   Schublade hat ihr eigenes Aussehen ueber ".sidebar a", waehrend
   ".fh-nav-item" auf die Sidebar zugeschnitten ist. Bliebe die
   Klasse dran, mischten sich beide.
====================================================== */

(function () {
  "use strict";

  /* Punkte, die in der Schublade eine andere Beschriftung tragen
     als in der schmalen Sidebar. */
  const ABWEICHENDE_LABELS = {
    spielothek: "menu.spielothek",
  };

  function baueSchublade() {
    const quelle = document.querySelector(".fh-sidebar-nav");
    const ziel = document.getElementById("sidebar");
    if (!quelle || !ziel) return;

    const anker = ziel.querySelector("[data-fh-nav-slot]");
    if (!anker) return;

    const fragment = document.createDocumentFragment();

    Array.from(quelle.children).forEach((el) => {
      // Der Sucheingang gehoert nur in die Sidebar - in der
      // Schublade waere er doppelt.
      if (el.classList.contains("fh-qs-trigger")) return;

      if (el.classList.contains("fh-nav-section-label")) {
        fragment.appendChild(el.cloneNode(true));
        return;
      }

      if (!el.classList.contains("fh-nav-item")) return;

      const kopie = el.cloneNode(true);
      kopie.classList.remove("fh-nav-item", "fh-nav-active");

      const seite = kopie.getAttribute("data-page");
      const label = kopie.querySelector(".fh-nav-label");
      if (label && seite && ABWEICHENDE_LABELS[seite]) {
        label.setAttribute("data-i18n", ABWEICHENDE_LABELS[seite]);
      }

      fragment.appendChild(kopie);
    });

    anker.replaceWith(fragment);

    // Die Kopien tragen data-i18n-Schluessel, sind aber erst jetzt
    // im Dokument - der globale Uebersetzungslauf beim Seitenstart
    // hat sie noch nicht gesehen.
    if (typeof applyTranslations === "function") applyTranslations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baueSchublade);
  } else {
    baueSchublade();
  }
})();
