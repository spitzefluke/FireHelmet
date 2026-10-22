/* ======================================================
   NACHLADEN
   ---------------------------------------------------
   Grosse Skripte, die fast kein Besucher braucht, laedt die Seite
   nicht mehr beim Oeffnen, sondern erst, wenn es so weit ist:

     admin    scripts/core/admin-gateway.js   (nur der Admin-Bereich)
     riss     scripts/liveevent/riss-film.js  (nur die Story "Der Riss")
     wetter   scripts/liveevent/story-wetter.js (nur die Wetter-Storys)
     herz     scripts/liveevent/herz-film.js  (nur "Zwei Hälften eines Herzens")
     zeit     scripts/liveevent/zeit-film.js  (nur "Zeitmaschine 2100")
     nukes    scripts/liveevent/nukes-film.js (nur "Hundert Atombomben gegen eine Mücke")

   Die Adressen stehen fest hier in ADRESSEN - nicht im HTML, damit
   keine Skriptadresse aus dem DOM gelesen wird (CodeQL: "DOM text
   reinterpreted as HTML"). Ihre ?v=-Nummern pflegt
   werkzeuge/cache-versionen.py in dieser Datei mit - nach einem Merge
   holt der Browser also auch diese Dateien frisch.

   fhNachladen("riss").then(...) laedt jede Datei hoechstens einmal.
   Schlaegt das Laden fehl, darf der naechste Aufruf es neu versuchen.
====================================================== */

(function () {
  "use strict";

  const ADRESSEN = {
    admin: "scripts/core/admin-gateway.js?v=7ba5a0bf12",
    riss: "scripts/liveevent/riss-film.js?v=c60d9cac41",
    herz: "scripts/liveevent/herz-film.js?v=c6ba6293c5",
    zeit: "scripts/liveevent/zeit-film.js?v=8a4f71898d",
    nukes: "scripts/liveevent/nukes-film.js?v=5a18110731",
    wetter: "scripts/liveevent/story-wetter.js?v=d38bfcebe3"
  };

  const laeuft = Object.create(null);

  window.fhNachladen = function (name) {
    if (laeuft[name]) return laeuft[name];
    if (!Object.prototype.hasOwnProperty.call(ADRESSEN, name)) {
      return Promise.reject(new Error("fhNachladen: unbekannt – " + name));
    }
    laeuft[name] = new Promise(function (fertig, fehler) {
      const s = document.createElement("script");
      s.src = ADRESSEN[name];
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
