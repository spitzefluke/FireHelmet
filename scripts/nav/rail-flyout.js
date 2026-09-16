/* ======================================================
   FH SPRECHBLASE AN DER ICON-LEISTE
   ---------------------------------------------------
   Die Desktop-Navigation ist seit dem 1c-Umbau nur noch 76px
   breit und zeigt ausschliesslich Symbole. Damit trotzdem klar
   ist, wohin ein Punkt fuehrt, erscheint beim Zeigen (Maus) oder
   Anspringen (Tastatur) die Beschriftung rechts daneben.

   WARUM EIN EINZELNES ELEMENT AM <body> und kein ::after am
   Menuepunkt: die Liste der 19 Punkte passt bei niedrigen
   Fenstern nicht am Stueck hinein, .fh-sidebar-nav scrollt also.
   Ein scrollender Bereich schneidet seine Kinder an beiden
   Achsen ab (overflow-y:auto erzwingt auch auf X ein Clipping) -
   eine Blase INNERHALB der Leiste waere an deren Kante
   abgeschnitten worden. Deshalb liegt sie daneben und wird hier
   von Hand positioniert.

   Die Beschriftung wird bei jedem Zeigen frisch aus dem
   .fh-nav-label gelesen, damit sie nach einem Sprachwechsel
   automatisch stimmt.

   Rein additiv: faellt dieses Skript aus, bleibt die Navigation
   vollstaendig bedienbar - nur ohne Beschriftung.
====================================================== */

(function () {
  "use strict";

  /* Nur dort, wo die schmale Leiste ueberhaupt sichtbar ist -
     derselbe Umbruchpunkt wie bei .fh-sidebar in style.css. */
  const RAIL_QUERY = "(min-width: 1024px)";

  /* Abstand zwischen Leistenkante und Blase. */
  const GAP = 8;

  let blase = null;
  let aktuell = null;

  function railSichtbar() {
    return !window.matchMedia || window.matchMedia(RAIL_QUERY).matches;
  }

  function hole() {
    if (blase) return blase;
    blase = document.createElement("div");
    blase.className = "fh-rail-flyout";
    // Die Beschriftung steht bereits im Menuepunkt selbst und
    // wuerde sonst doppelt vorgelesen.
    blase.setAttribute("aria-hidden", "true");
    document.body.appendChild(blase);
    return blase;
  }

  function zeige(item) {
    if (!railSichtbar()) return;

    const label = item.querySelector(".fh-nav-label");
    const text = label ? label.textContent.trim() : "";
    if (!text) return;

    const el = hole();
    el.textContent = text;

    const kasten = item.getBoundingClientRect();
    // An der AUSSENKANTE der Leiste ausrichten, nicht am Feld: die
    // Felder sind schmaler als die Leiste, eine Blase am Feldrand
    // laege sonst noch halb auf der Leiste selbst.
    const leiste = item.closest(".fh-sidebar");
    const kante = leiste ? leiste.getBoundingClientRect().right : kasten.right;

    el.style.left = Math.max(kante, kasten.right) + GAP + "px";
    el.style.top = kasten.top + kasten.height / 2 + "px";
    el.classList.add("is-visible");
    aktuell = item;
  }

  function verstecke(item) {
    if (item && aktuell !== item) return;
    if (blase) blase.classList.remove("is-visible");
    aktuell = null;
  }

  function init() {
    const nav = document.querySelector(".fh-sidebar-nav");
    if (!nav) return;

    // Zeigen/Verlassen steigen nicht auf, deshalb in der
    // Erfassungsphase mitgehoert statt 19 Punkte einzeln zu
    // verdrahten - so gilt es auch fuer spaeter ergaenzte Punkte.
    nav.addEventListener("mouseover", (e) => {
      const item = e.target.closest(".fh-nav-item");
      if (item && nav.contains(item)) zeige(item);
    });

    nav.addEventListener("mouseleave", () => verstecke(null));

    nav.addEventListener("focusin", (e) => {
      const item = e.target.closest(".fh-nav-item");
      if (item) zeige(item);
    });

    nav.addEventListener("focusout", (e) => {
      const item = e.target.closest(".fh-nav-item");
      verstecke(item);
    });

    // Beim Scrollen der Liste wandert der Punkt unter der Blase
    // weg - die feste Position waere dann falsch.
    nav.addEventListener("scroll", () => verstecke(null), { passive: true });

    // Nach einem Seitenwechsel per Klick soll die Blase nicht
    // stehen bleiben, wenn der Zeiger die Leiste gar nicht verlaesst.
    nav.addEventListener("click", () => verstecke(null));

    window.addEventListener("resize", () => verstecke(null));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
