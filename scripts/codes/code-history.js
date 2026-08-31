/* ======================================================
   CODE-VERLAUF (letzte 7 Tage)
   ---------------------------------------------------
   Rein lokal pro Browser/Geraet (wie "crackedCodes" in wheel.js) -
   merkt sich bei jedem NEU eingeloesten Code Code+Antwort+Zeitpunkt
   und zeigt auf der Code-Seite ein kleines Verzeichnis aller Codes,
   die in den letzten 7 Tagen eingeloest wurden. Wird ausschliesslich
   von checkCode() in main.js aufgerufen, und zwar nur bei einem
   WIRKLICH neuen Treffer (kein zweiter Eintrag bei "bereits
   eingeloest"). Eintraege aelter als 30 Tage werden beim naechsten
   Schreiben automatisch entfernt, damit der lokale Speicher nicht
   unbegrenzt waechst - angezeigt werden ohnehin nur die letzten 7.
====================================================== */

(function () {
  const HISTORY_KEY = "codeHistory";
  const DISPLAY_DAYS = 7;
  const KEEP_DAYS = 30;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function getCodeHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function escapeCodeHistoryHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addCodeHistoryEntry(code, message) {
    const keepCutoff = Date.now() - KEEP_DAYS * DAY_MS;
    const history = getCodeHistory().filter((entry) => entry.redeemedAt >= keepCutoff);

    history.push({ code, message, redeemedAt: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

    renderCodeHistory();
  }

  function renderCodeHistory() {
    const wrapEl = document.getElementById("code-history");
    const listEl = document.getElementById("code-history-list");
    if (!wrapEl || !listEl) return;

    const displayCutoff = Date.now() - DISPLAY_DAYS * DAY_MS;
    const recent = getCodeHistory()
      .filter((entry) => entry.redeemedAt >= displayCutoff)
      .sort((a, b) => b.redeemedAt - a.redeemedAt);

    if (!recent.length) {
      wrapEl.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
    const dateFormat = lang === "en" ? "en-US" : "de-DE";

    listEl.innerHTML = recent
      .map((entry) => {
        const date = new Date(entry.redeemedAt).toLocaleDateString(dateFormat, {
          day: "2-digit",
          month: "2-digit",
        });
        return `
          <li class="code-history-item">
            <span class="code-history-code">${escapeCodeHistoryHtml(entry.code)}</span>
            <span class="code-history-message">${escapeCodeHistoryHtml(entry.message)}</span>
            <span class="code-history-date">${date}</span>
          </li>
        `;
      })
      .join("");

    staggerReveal(listEl, ".code-history-item");

    wrapEl.style.display = "block";
  }

  function updateCodeHistoryPage(pageID) {
    if (pageID === "code") {
      renderCodeHistory();
    }
  }

  document.addEventListener("DOMContentLoaded", renderCodeHistory);

  window.addCodeHistoryEntry = addCodeHistoryEntry;
  window.updateCodeHistoryPage = updateCodeHistoryPage;
})();
