/* ======================================================
   EXTERNE SCHIMPFWORT-DATENBANK
   ---------------------------------------------------
   Ergänzt deine eigene Liste (nickname-filter-data.js) um
   eine öffentliche, von vielen Projekten genutzte und
   gepflegte Datenbank an Schimpfwörtern (Deutsch + Englisch):
   "List of Dirty, Naughty, Obscene, and Otherwise Bad Words"
   (LDNOOBW, Open Source, github.com/LDNOOBW).

   So kann niemand mehr eine Beleidigung als Namen nutzen, nur
   weil sie zufällig nicht in DEINER eigenen Liste stand.

   Wird beim ersten Seitenaufruf einmal geladen und danach 7
   Tage lang im Browser zwischengespeichert (kein ständiges
   Nachladen nötig). Klappt das Laden mal nicht (z.B. kein
   Internet, Liste nicht erreichbar), greift automatisch
   trotzdem deine eigene Liste aus nickname-filter-data.js -
   die Namensprüfung funktioniert also immer, auch offline.
====================================================== */

const EXTERNAL_BADWORDS_CACHE_KEY = "externalBadWordsCache";
const EXTERNAL_BADWORDS_CACHE_DAYS = 7;
const EXTERNAL_BADWORDS_URLS = [
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/de",
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en",
];

let externalBadWordsList = [];
let externalBadWordsLoadPromise = null;

function loadExternalBadWords() {
  if (externalBadWordsLoadPromise) return externalBadWordsLoadPromise;

  externalBadWordsLoadPromise = (async () => {
    // Erst den Zwischenspeicher probieren
    try {
      const cached = JSON.parse(localStorage.getItem(EXTERNAL_BADWORDS_CACHE_KEY) || "null");
      if (cached && Date.now() - cached.savedAt < EXTERNAL_BADWORDS_CACHE_DAYS * 24 * 60 * 60 * 1000) {
        externalBadWordsList = cached.words;
        return;
      }
    } catch (err) {
      // Zwischenspeicher unlesbar - einfach neu laden
    }

    try {
      const results = await Promise.all(
        EXTERNAL_BADWORDS_URLS.map((url) => fetch(url).then((r) => (r.ok ? r.text() : "")))
      );

      const words = results
        .join("\n")
        .split("\n")
        .map((w) => w.trim())
        .filter(Boolean);

      externalBadWordsList = words;

      try {
        localStorage.setItem(
          EXTERNAL_BADWORDS_CACHE_KEY,
          JSON.stringify({ words, savedAt: Date.now() })
        );
      } catch (err) {
        // Zwischenspeicher voll o.ä. - nicht schlimm, wird beim
        // nächsten Mal einfach erneut geladen
      }
    } catch (err) {
      console.warn("Externe Schimpfwort-Datenbank konnte nicht geladen werden, nutze nur eigene Liste:", err);
      externalBadWordsList = [];
    }
  })();

  return externalBadWordsLoadPromise;
}

// Direkt beim Laden der Seite anstoßen, damit die Liste im Idealfall
// schon bereitsteht, bevor jemand auf "Speichern" klickt
window.addEventListener("DOMContentLoaded", loadExternalBadWords);
