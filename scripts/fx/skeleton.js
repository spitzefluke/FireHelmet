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
     el.innerHTML = fhSkeletonKasten(3, { label: "Lade Turnier ..." });

   NACHTRAG: der Platzhalter wurde anfangs nur an zwei Stellen
   benutzt (Rangliste und Startseiten-Uebersicht). Ueberall sonst
   sah das Laden anders aus - mal eine Textzeile ("Lade Ergebnis
   ..."), mal eine leere Flaeche, in die der Inhalt spaeter
   hineinsprang. Jetzt liegt derselbe Platzhalter auch unter
   Wochenrennen, Turnier und Verlosung.

   Dafuer kam fhSkeletonKasten dazu: nicht jeder Bereich ist eine
   Liste mit Rang, Bild und Wert. Fuer Tafeln und einzelne Werte
   sind es einfach ein paar Balken in einem Kasten - dieselben
   Bausteine (.fh-skeleton-cell), dieselbe Bewegung, nur ohne
   Zeilenform.
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

  /* Platzhalter fuer Bereiche, die KEINE Liste sind: eine Tafel,
     ein Ergebnisfeld, eine Turnieruebersicht. Balken unterschiedlicher
     Laenge in einem Kasten.

     Auch hier feste statt zufaelliger Breiten, damit der Platzhalter
     bei jedem Aufruf gleich aussieht und nicht bei jedem Neuladen
     anders flackert. */
  function fhSkeletonKasten(count, opts) {
    const n = Math.max(1, Math.min(8, parseInt(count, 10) || 3));
    const label = (opts && opts.label) || "Wird geladen ...";
    const BREITEN = [72, 46, 88, 38, 64, 52, 80, 44];

    let zeilen = "";
    for (let i = 0; i < n; i++) {
      // Die erste Zeile etwas kraeftiger: sie steht fuer die
      // Ueberschrift, die dort spaeter erscheint.
      const hoehe = i === 0 ? 16 : 12;
      zeilen += `
        <span class="fh-skeleton-cell"
              style="width:${BREITEN[i % BREITEN.length]}%;height:${hoehe}px;--fh-skeleton-delay:${(i * 0.08).toFixed(2)}s"></span>`;
    }

    return `
      <div class="fh-skeleton fh-skeleton-kasten" role="status" aria-busy="true">
        <span class="fh-skeleton-label">${label}</span>
        ${zeilen}
      </div>`;
  }

  window.fhSkeletonList = fhSkeletonList;
  window.fhSkeletonKasten = fhSkeletonKasten;
})();
