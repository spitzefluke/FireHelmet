/* ======================================================
   FH NOTICE - gemeinsamer Kurz-Hinweis
   ---------------------------------------------------
   Ersetzt die letzten window.alert()-Aufrufe der Seite
   (Discord-/Twitch-Login, Stories). alert() blockiert den
   ganzen Tab, sieht auf jedem Betriebssystem anders aus und
   bricht optisch komplett aus dem Rest der Seite aus.

   Bewusst KEIN neues Toast-Framework: die Seite hat bereits
   mehrere spezialisierte Toasts (showCurrencyToast in
   wheel.js, showShipToolToast in ship-repair.js,
   showShopRotationToast in shop-rotation.js). Diese hier ist
   nur der schlichte Allzweck-Fall fuer kurze Meldungen und
   uebernimmt deren Bildsprache (oben rechts, hereinfahrend).

   Verwendung:
     fhNotice("Text");                  // neutral
     fhNotice("Text", "error");         // Fehler
     fhNotice("Text", "success");       // Erfolg
====================================================== */

(function () {
  "use strict";

  const DURATION = 4600;
  let current = null;

  function fhNotice(message, type) {
    const text = String(message == null ? "" : message).trim();
    if (!text) return;

    // Immer nur einer gleichzeitig - zwei uebereinander gestapelte
    // Meldungen waeren an derselben Position nicht lesbar.
    if (current) {
      clearTimeout(current._timer);
      current.remove();
      current = null;
    }

    const kind = type === "error" || type === "success" ? type : "info";
    const icon = kind === "error" ? "⚠️" : kind === "success" ? "✅" : "ℹ️";

    const el = document.createElement("div");
    el.className = "fh-notice fh-notice-" + kind;
    // role/aria-live, damit Screenreader die Meldung mitbekommen -
    // bei alert() war das durch den Modaldialog automatisch gegeben.
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");

    const iconEl = document.createElement("span");
    iconEl.className = "fh-notice-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;

    const textEl = document.createElement("span");
    textEl.className = "fh-notice-text";
    // textContent statt innerHTML: die Meldungen enthalten teils
    // Serverantworten, die nicht als HTML interpretiert werden duerfen.
    textEl.textContent = text;

    const closeEl = document.createElement("button");
    closeEl.type = "button";
    closeEl.className = "fh-notice-close";
    closeEl.setAttribute("aria-label", "Hinweis schließen");
    closeEl.textContent = "×";
    closeEl.addEventListener("click", () => dismiss(el));

    el.appendChild(iconEl);
    el.appendChild(textEl);
    el.appendChild(closeEl);
    document.body.appendChild(el);
    current = el;

    requestAnimationFrame(() => el.classList.add("visible"));
    el._timer = setTimeout(() => dismiss(el), DURATION);
  }

  function dismiss(el) {
    if (!el || !el.isConnected) return;
    clearTimeout(el._timer);
    el.classList.remove("visible");
    setTimeout(() => {
      el.remove();
      if (current === el) current = null;
    }, 400);
  }

  window.fhNotice = fhNotice;
})();
