/* ======================================================
   FH ZEICHENZAEHLER
   ---------------------------------------------------
   Haengt an jedes Feld mit data-fh-counter einen kleinen
   Zaehler "x / max" unter das Feld.

   Warum: der Nickname hatte zwar maxlength="18", aber nichts
   sagte das - man tippte einfach ins Leere, sobald die Grenze
   erreicht war. Support-Text und Bewertungskommentar hatten in
   der Oberflaeche gar keine Grenze, obwohl die Datenbank sie
   auf 2000 bzw. 500 Zeichen begrenzt (siehe
   supabase/game-migration/05-site-data.sql) - zu langer Text
   wurde also erst beim Absenden abgewiesen.

   Rein additiv: das Feld selbst, seine Klassen, IDs und
   Ereignis-Handler bleiben unangetastet. Faellt dieses Skript
   aus, verhaelt sich alles wie vorher.
====================================================== */

(function () {
  "use strict";

  /* Ab wann der Zaehler auffaellt: erst wenn es wirklich eng wird.
     Ein Zaehler, der von Anfang an warnt, wird ignoriert. */
  const WARN_AB = 0.9;

  function aktualisiere(feld, zaehler) {
    const max = parseInt(feld.getAttribute("maxlength"), 10);
    if (!max) return;

    const laenge = feld.value.length;
    zaehler.textContent = laenge + " / " + max;

    const anteil = laenge / max;
    zaehler.classList.toggle("is-warn", anteil >= WARN_AB && anteil < 1);
    zaehler.classList.toggle("is-full", laenge >= max);
  }

  function haengeAn(feld) {
    if (feld.dataset.fhCounterReady) return;
    const max = parseInt(feld.getAttribute("maxlength"), 10);
    if (!max) return;
    feld.dataset.fhCounterReady = "1";

    const zaehler = document.createElement("span");
    zaehler.className = "fh-field-counter";
    // aria-hidden: der Zaehler waere sonst bei jedem Tastendruck
    // vorgelesen worden. Die Grenze selbst kennt der Screenreader
    // bereits ueber das maxlength-Attribut des Feldes.
    zaehler.setAttribute("aria-hidden", "true");

    feld.insertAdjacentElement("afterend", zaehler);
    feld.addEventListener("input", () => aktualisiere(feld, zaehler));
    aktualisiere(feld, zaehler);
  }

  function init() {
    document.querySelectorAll("[data-fh-counter]").forEach(haengeAn);
  }

  // defer sorgt dafuer, dass dieses Skript vor DOMContentLoaded
  // laeuft - der Listener greift also noch.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
