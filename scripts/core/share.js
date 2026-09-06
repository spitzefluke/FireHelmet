/* ======================================================
   FH TEILEN
   ---------------------------------------------------
   Kleiner Teilen-Knopf in der Topbar, neben Sprache und
   Musik-Schalter (siehe .fh-topbar-btn in style.css).

   Er stand vorher frei schwebend in der rechten oberen Ecke und
   war per CSS auf die Startseite beschraenkt. In der Topbar ist
   er jetzt auf jeder Seite erreichbar - geteilt wird ohnehin
   immer dieselbe Adresse.

   Nutzt die native Teilen-Auswahl des Geraets, wo es sie gibt
   (Handy, neuere Desktop-Browser) - dort landet der Link
   direkt in WhatsApp, Discord, Signal usw. Wo nicht, wandert
   die Adresse in die Zwischenablage. Beides mit Rueckmeldung
   ueber fhNotice() (scripts/core/notice.js).

   Der geteilte Link zeigt dank der Open-Graph-Angaben in
   index.html Titel, Beschreibung und Vorschaubild.
====================================================== */

(function () {
  "use strict";

  const SHARE_URL = "https://spitzefluke.github.io/FireHelmet/";

  function shareText() {
    return typeof t === "function"
      ? t("share.text", "FireHelmet - Pirate Saga")
      : "FireHelmet - Pirate Saga";
  }

  function say(key, fallback, kind) {
    const message = typeof t === "function" ? t(key, fallback) : fallback;
    if (typeof fhNotice === "function") fhNotice(message, kind);
  }

  async function copyToClipboard(text) {
    // navigator.clipboard gibt es nur in sicheren Kontexten (https bzw.
    // localhost). Auf http faellt es aus, deshalb der execCommand-Weg
    // als Rueckfallebene.
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "-1000px";
    document.body.appendChild(helper);
    helper.select();

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    helper.remove();
    return ok;
  }

  async function fhShareSite() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "FireHelmet - Pirate Saga",
          text: shareText(),
          url: SHARE_URL,
        });
        return;
      } catch (err) {
        // AbortError = der Nutzer hat die Auswahl selbst abgebrochen.
        // Das ist kein Fehler und braucht keine Meldung.
        if (err && err.name === "AbortError") return;
        // Alles andere (z.B. Teilen nicht erlaubt): stillschweigend
        // auf die Zwischenablage ausweichen.
      }
    }

    const copied = await copyToClipboard(SHARE_URL);
    if (copied) {
      say("share.copied", "Link kopiert.", "success");
    } else {
      say("share.failed", "Link konnte nicht kopiert werden.", "error");
    }
  }

  window.fhShareSite = fhShareSite;
})();
