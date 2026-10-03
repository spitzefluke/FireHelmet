/* ======================================================
   NACHLADEN
   ---------------------------------------------------
   Grosse Skripte, die fast kein Besucher braucht, laedt die Seite
   nicht mehr beim Oeffnen, sondern erst, wenn es so weit ist:

     admin    scripts/core/admin-gateway.js   (nur der Admin-Bereich)
     riss     scripts/liveevent/riss-film.js  (nur die Story "Der Riss")
     wetter   scripts/liveevent/story-wetter.js (nur die Wetter-Storys)

   Die Adressen stehen als <meta name="fh-nachladen"> im <head> von
   index.html. Dort bekommen sie wie jedes andere Skript ihre
   ?v=-Nummer von werkzeuge/cache-versionen.py (das Muster erfasst
   auch data-src) - nach einem Merge holt der Browser also auch diese
   Dateien frisch.

   fhNachladen("riss").then(...) laedt jede Datei hoechstens einmal.
   Schlaegt das Laden fehl, darf der naechste Aufruf es neu versuchen.
====================================================== */

(function () {
  "use strict";

  const laeuft = {};

  window.fhNachladen = function (name) {
    if (laeuft[name]) return laeuft[name];
    const eintrag = document.querySelector('meta[name="fh-nachladen"][data-name="' + name + '"]');
    if (!eintrag) return Promise.reject(new Error("fhNachladen: unbekannt – " + name));
    laeuft[name] = new Promise(function (fertig, fehler) {
      const s = document.createElement("script");
      s.src = eintrag.getAttribute("data-src");
      s.onload = function () { fertig(); };
      s.onerror = function () {
        delete laeuft[name];
        fehler(new Error("fhNachladen: " + name + " ließ sich nicht laden"));
      };
      document.head.appendChild(s);
    });
    return laeuft[name];
  };
})();
