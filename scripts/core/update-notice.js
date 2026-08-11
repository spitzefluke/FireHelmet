/* ======================================================
   UPDATE-MITTEILUNG
   Zeigt beim ersten Seitenaufruf ein Popup mit dem Text aus
   scripts/core/update-notice-data.js. Merkt sich per
   localStorage, ob der aktuell eingetragene Text schon
   gesehen wurde. Ändert sich Titel ODER Nachricht in der
   Config-Datei, erkennt das Skript das automatisch (per
   Prüfsumme über den Text) und zeigt das Popup erneut -
   für ALLE Besucher, auch die, die eine ältere Version schon
   gesehen hatten.
====================================================== */

const UPDATE_NOTICE_STORAGE_KEY = "updateNoticeSeenHash";

// Einfache, stabile Prüfsumme über einen Text (kein Crypto nötig,
// reicht völlig um "hat sich der Text geändert?" zu erkennen)
function hashUpdateNoticeText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0; // in 32-bit Integer zwingen
  }
  return String(hash);
}

function buildUpdateNoticeMarkup() {
  const overlay = document.getElementById("update-notice-overlay");
  if (!overlay || typeof updateNoticeConfig === "undefined") return;

  const imageHtml = updateNoticeConfig.image
    ? `<img src="${updateNoticeConfig.image}" class="update-notice-image" alt="">`
    : "";

  overlay.innerHTML = `
    <div class="update-notice-box">
      <div class="update-notice-glow"></div>
      <div class="update-notice-confetti">
        ${Array.from({ length: 14 }).map(() => '<span></span>').join("")}
      </div>
      <span class="update-notice-badge">NEU</span>
      <div class="update-notice-icon">📢</div>
      <h2 class="update-notice-title">${updateNoticeConfig.title}</h2>
      ${imageHtml}
      <p class="update-notice-message">${updateNoticeConfig.message}</p>
      <button type="button" class="update-notice-button" id="update-notice-close">
        ${updateNoticeConfig.buttonText || "Alles klar!"}
      </button>
    </div>
  `;
}

function closeUpdateNotice(currentHash) {
  const overlay = document.getElementById("update-notice-overlay");
  if (overlay) overlay.classList.remove("visible");

  try {
    localStorage.setItem(UPDATE_NOTICE_STORAGE_KEY, currentHash);
  } catch (err) {
    console.warn("Update-Mitteilung konnte nicht gespeichert werden:", err);
  }
}

function initUpdateNotice() {
  if (typeof updateNoticeConfig === "undefined") return;

  const currentHash = hashUpdateNoticeText(
    (updateNoticeConfig.title || "") + "||" + (updateNoticeConfig.message || "")
  );

  let seenHash = null;
  try {
    seenHash = localStorage.getItem(UPDATE_NOTICE_STORAGE_KEY);
  } catch (err) {
    // localStorage nicht verfügbar (z.B. privater Modus) - Popup
    // wird dann bei jedem Besuch gezeigt, ist aber kein harter Fehler
  }

  if (seenHash === currentHash) return; // schon in dieser Version gesehen

  buildUpdateNoticeMarkup();

  const overlay = document.getElementById("update-notice-overlay");
  const closeBtn = document.getElementById("update-notice-close");

  if (overlay) {
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeUpdateNotice(currentHash));
  }

  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeUpdateNotice(currentHash);
    });
  }
}

window.addEventListener("DOMContentLoaded", initUpdateNotice);
