/* ======================================================
   SEITEN ABSCHALTEN (Admin-Gateway, Bereich "Seite" -> "Seiten")
   ---------------------------------------------------
   siteConfig.disabledPageIds haelt die Seiten-IDs, die der Admin
   abgeschaltet hat. Fuer Besucher verschwinden dann:
     - der Eintrag in der Navigation ([data-page="id"]),
     - jeder Knopf/Link, der changePage('id') aufruft,
   und changePage() (main.js) leitet auf die Startseite um, falls
   die Seite doch angesteuert wird (Suche, Tastatur, alter Tab).

   Unterseiten haengen an ihrer Hauptseite: Ist "story" aus, sind
   es auch "story-detail" und "book-reader".

   Nie abschaltbar: Start, Admin-Gateway, Impressum, Datenschutz -
   sonst sperrt sich der Admin aus oder die Pflichtseiten fehlen.

   ADMIN-VORSCHAU (wie feature-flags.js): Der Admin sieht abgeschaltete
   Seiten weiter, der Nav-Eintrag ist gedimmt und mit einem roten
   Punkt markiert ("fh-seite-vorschau"). So laesst sich eine Seite in
   Ruhe pruefen, bevor sie wieder fuer alle angeht.

   SICHERHEIT: reine Anzeige-Steuerung. Daten und Aktionen der Seiten
   sind wie bisher ueber RLS/RPCs abgesichert.

   Eigene Klasse "fh-seite-aus" statt "fh-flag-aus": Das Jahr 2100
   blendet Hangar & Co. ueber fh-flag-aus ein und aus - beides darf
   sich nicht gegenseitig aufheben.
====================================================== */

(function () {
  "use strict";

  const NIE_AUS = ["stand", "gateway", "impressum", "datenschutz"];
  const UNTERSEITEN = { "story-detail": "story", "book-reader": "story" };
  const LINK_MUSTER = /changePage\('([^']+)'\)/;

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  function abgeschaltet() {
    return typeof siteConfig !== "undefined" && Array.isArray(siteConfig.disabledPageIds) ? siteConfig.disabledPageIds : [];
  }

  function hauptseite(id) { return UNTERSEITEN[id] || id; }

  function viewerIstAdmin() {
    return typeof window.fhViewerIstAdmin === "function" && window.fhViewerIstAdmin();
  }

  /* Ist die Seite abgeschaltet (egal fuer wen)? */
  window.fhSeiteAus = function (id) {
    const haupt = hauptseite(id);
    return NIE_AUS.indexOf(haupt) === -1 && abgeschaltet().indexOf(haupt) !== -1;
  };

  /* Darf der aktuelle Betrachter die Seite NICHT oeffnen? */
  window.fhSeiteGesperrt = function (id) {
    return window.fhSeiteAus(id) && !viewerIstAdmin();
  };

  window.fhSeitenNieAus = NIE_AUS.slice();

  function zielVon(el) {
    const direkt = el.getAttribute("data-page");
    if (direkt) return direkt;
    const m = LINK_MUSTER.exec(el.getAttribute("onclick") || "");
    return m ? m[1] : null;
  }

  function anwenden() {
    const admin = viewerIstAdmin();
    document.querySelectorAll("[data-page], [onclick*=\"changePage('\"]").forEach(function (el) {
      const id = zielVon(el);
      if (!id) return;
      const aus = window.fhSeiteAus(id);
      el.classList.toggle("fh-seite-aus", aus && !admin);
      el.classList.toggle("fh-seite-vorschau", aus && admin);
      /* Hinweis als title; ein eigener title des Elements kommt danach zurueck. */
      if (aus && admin) {
        if (!el.hasAttribute("data-fh-titel-vorher")) el.setAttribute("data-fh-titel-vorher", el.getAttribute("title") || "");
        el.title = t("seitenSperre.vorschau", "Für Besucher abgeschaltet – nur du siehst die Seite");
      } else if (el.hasAttribute("data-fh-titel-vorher")) {
        const vorher = el.getAttribute("data-fh-titel-vorher");
        if (vorher) el.title = vorher; else el.removeAttribute("title");
        el.removeAttribute("data-fh-titel-vorher");
      }
    });

    /* Ist die offene Seite gerade abgeschaltet worden? Dann zum Start. */
    const offen = document.querySelector(".page.active-page");
    if (offen && window.fhSeiteGesperrt(offen.id) && typeof changePage === "function") changePage("stand");
  }
  window.fhSeitenSperreAnwenden = anwenden;

  window.addEventListener("siteConfigUpdated", anwenden);
  /* feature-flags.js meldet sich nach jeder Admin-Ermittlung. */
  window.addEventListener("fhFlagsUpdated", anwenden);
  document.addEventListener("DOMContentLoaded", anwenden);
})();
