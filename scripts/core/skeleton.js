/* ======================================================
   FH SKELETON - Platzhalter waehrend des Ladens
   ---------------------------------------------------
   Rangliste und Wochenrennen zeigten waehrend des Ladens
   nur eine Textzeile ("Lade Rangliste ...") und sprangen
   dann schlagartig zur fertigen Liste - oder direkt zur
   Fehlermeldung. Ein Platzhalter in der Form des spaeteren
   Inhalts nimmt diesen Sprung heraus und macht sichtbar,
   WAS gerade laedt.

   Bewusst reines Markup + CSS, keine Bibliothek und keine
   Verhaltensaenderung: die Ladefunktionen ueberschreiben das
   Container-innerHTML anschliessend wie bisher.

   Verwendung:
     el.innerHTML = fhSkeletonList(6);
     el.innerHTML = fhSkeletonList(3, { label: "Lade Rennen ..." });
====================================================== */

(function () {
  "use strict";

  function fhSkeletonList(count, opts) {
    const n = Math.max(1, Math.min(12, parseInt(count, 10) || 5));
    const label = (opts && opts.label) || "Wird geladen ...";

    // Feste, unregelmaessige Namensbreiten - gleich lange Balken wirken
    // wie ein eingefrorenes Raster statt wie Inhalt. Bewusst eine feste
    // Folge statt Math.random(), damit der Platzhalter bei jedem Aufruf
    // gleich aussieht und nicht bei jedem Neuladen anders flackert.
    const WIDTHS = [58, 41, 67, 49, 74, 44, 61, 52, 70, 46, 63, 55];

    let rows = "";
    for (let i = 0; i < n; i++) {
      const width = WIDTHS[i % WIDTHS.length];
      rows += `
        <div class="fh-skeleton-row" style="--fh-skeleton-delay:${(i * 0.08).toFixed(2)}s">
          <span class="fh-skeleton-cell fh-skeleton-rank"></span>
          <span class="fh-skeleton-cell fh-skeleton-avatar"></span>
          <span class="fh-skeleton-cell fh-skeleton-name" style="width:${width}%"></span>
          <span class="fh-skeleton-cell fh-skeleton-value"></span>
        </div>`;
    }

    // aria-busy + sr-only-Text: fuer Screenreader bleibt es eine
    // angesagte Ladephase, optisch sind es nur die Balken.
    return `
      <div class="fh-skeleton" role="status" aria-busy="true">
        <span class="fh-skeleton-label">${label}</span>
        ${rows}
      </div>`;
  }

  window.fhSkeletonList = fhSkeletonList;
})();
