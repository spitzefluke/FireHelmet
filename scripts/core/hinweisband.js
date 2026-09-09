/* ======================================================
   HINWEISBAND
   ---------------------------------------------------
   Ein schmales Band ganz oben fuer zwei Faelle, die der Admin im
   Gateway schaltet:

     Ankuendigung  - "Turnier startet um 20 Uhr"
     Wartung       - "Wir bauen gerade um"

   Beides kommt aus site_config und aendert sich live: site-config.js
   feuert bei jeder Aenderung "siteConfigUpdated", darauf zeichnet
   dieses Band sich neu. Ein offener Browser bekommt die Ankuendigung
   damit auch ohne Neuladen mit.

   BEWUSST KEINE SPERRE: Die Wartungsmeldung sperrt niemanden aus.
   Bei einer Seite, deren gesamter Code im Browser laeuft, waere eine
   "Sperre" ohnehin nur Fassade - wer sie umgehen will, kann es. Das
   Band sagt stattdessen ehrlich Bescheid, damit niemand ueber eine
   halb umgebaute Stelle stolpert und sie fuer kaputt haelt.

   Ein weggeklicktes Band bleibt fuer diese Ankuendigung weg
   (localStorage), kommt aber bei einem neuen Text wieder - der
   gespeicherte Schluessel ist der Text selbst.
====================================================== */

const FH_BAND_ID = "fh-hinweisband";

function fhBandWeggeklickt(text) {
  try {
    return localStorage.getItem("fhBandWeg") === text;
  } catch (err) {
    // Privates Fenster o.ae. - dann eben jedes Mal zeigen.
    return false;
  }
}

function fhBandSchliessen() {
  const band = document.getElementById(FH_BAND_ID);
  if (!band) return;
  try {
    localStorage.setItem("fhBandWeg", band.dataset.text || "");
  } catch (err) {
    /* nicht schlimm - dann kommt es beim naechsten Laden wieder */
  }
  band.remove();
  document.body.classList.remove("fh-hat-band");
}

function fhHinweisbandZeichnen() {
  const vorhanden = document.getElementById(FH_BAND_ID);
  if (vorhanden) vorhanden.remove();
  document.body.classList.remove("fh-hat-band");

  if (typeof siteConfig === "undefined") return;

  // Wartung geht vor: wenn beides gesetzt ist, ist der Umbau die
  // wichtigere Nachricht.
  const istWartung = !!siteConfig.wartung;
  const text = istWartung
    ? siteConfig.wartungText || "Wir bauen gerade um - es kann kurz ruckeln."
    : siteConfig.ankuendigung || "";

  if (!text || fhBandWeggeklickt(text)) return;

  const band = document.createElement("div");
  band.id = FH_BAND_ID;
  band.className = "fh-hinweisband" + (istWartung ? " ist-wartung" : "");
  band.dataset.text = text;
  band.setAttribute("role", "status");

  const span = document.createElement("span");
  span.className = "fh-hinweisband-text";
  // textContent statt innerHTML: der Text kommt aus dem Gateway, aber
  // ein Band ganz oben auf jeder Seite ist der letzte Ort, an dem man
  // sich auf "der Admin tippt schon nichts Boeses" verlassen sollte.
  span.textContent = (istWartung ? "🔧 " : "📣 ") + text;

  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "fh-hinweisband-zu";
  knopf.setAttribute("aria-label", "Hinweis schließen");
  knopf.textContent = "×";
  knopf.addEventListener("click", fhBandSchliessen);

  band.appendChild(span);
  band.appendChild(knopf);
  document.body.insertBefore(band, document.body.firstChild);
  document.body.classList.add("fh-hat-band");
}

window.addEventListener("siteConfigUpdated", fhHinweisbandZeichnen);
document.addEventListener("DOMContentLoaded", function () {
  if (typeof onSiteConfigReady === "function") {
    onSiteConfigReady(fhHinweisbandZeichnen);
  } else {
    fhHinweisbandZeichnen();
  }
});
