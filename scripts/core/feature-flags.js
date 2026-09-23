/* ======================================================
   FEATURE-FLAGS: NEUE FUNKTIONEN ERST AUF KNOPFDRUCK SICHTBAR
   ---------------------------------------------------
   Eine neu gebaute Funktion (z.B. der Skill-Baum) soll auf der
   Seite liegen, aber fuer normale Besucher UNSICHTBAR sein, bis
   der Admin sie im Panel unter "Live-Event" freigibt. Das ist der
   "Release"-Knopf: er setzt ein Flag in siteConfig.featureFlags,
   und ab dann sehen es alle.

   ADMIN-VORSCHAU
   Der Admin soll die Funktion aber schon VORHER sehen, um Fehler
   vor dem Release zu finden. Deshalb: sichtbar, wenn das Flag an
   ist ODER der Betrachter der Admin ist. Sieht der Admin sie nur,
   WEIL er Admin ist (Flag noch aus), traegt das Element zusaetzlich
   die Klasse "fh-flag-vorschau" - daran haengt der Hinweis "nur
   fuer dich sichtbar".

   SICHERHEIT
   Das ist reine ANZEIGE-Steuerung. Die eigentlichen Daten und
   Aktionen (Skill-Baum-RPC usw.) sind server-seitig ueber
   app.is_admin()/RLS abgesichert - ein Besucher, der das Element
   per Konsole einblendet, kommt an nichts heran, das ihm nicht
   ohnehin zusteht.

   MARKUP
   Ein Nav-Eintrag oder eine <section> bekommt data-fh-flag="name".
   Dieses Modul blendet sie passend ein/aus.
====================================================== */

(function () {
  "use strict";

  let viewerIstAdmin = false;

  function flagAn(flag) {
    return !!(typeof siteConfig !== "undefined" && siteConfig.featureFlags && siteConfig.featureFlags[flag] === true);
  }

  /* Fuer den lokalen Test (ohne Supabase): window.__fhFlagOverride
     = { skillTree: true } erzwingt eine Sichtbarkeit. Live nie
     gesetzt. */
  function override(flag) {
    const o = window.__fhFlagOverride;
    return o && Object.prototype.hasOwnProperty.call(o, flag) ? !!o[flag] : null;
  }

  window.fhFeatureSichtbar = function (flag) {
    const ov = override(flag);
    if (ov !== null) return ov;
    return flagAn(flag) || viewerIstAdmin;
  };

  /* Sichtbar, aber NUR weil der Betrachter Admin ist (Flag noch
     aus) - dann ist es eine Vorschau. */
  window.fhFeatureNurVorschau = function (flag) {
    if (override(flag) !== null) return false;
    return !flagAn(flag) && viewerIstAdmin;
  };

  window.fhViewerIstAdmin = function () { return viewerIstAdmin; };

  function anwenden() {
    const flaggen = document.querySelectorAll("[data-fh-flag]");
    flaggen.forEach(function (el) {
      const flag = el.getAttribute("data-fh-flag");
      const sichtbar = window.fhFeatureSichtbar(flag);
      el.classList.toggle("fh-flag-aus", !sichtbar);
      el.classList.toggle("fh-flag-vorschau", sichtbar && window.fhFeatureNurVorschau(flag));
    });
    window.dispatchEvent(new CustomEvent("fhFlagsUpdated"));
  }
  window.fhFlagsAnwenden = anwenden;

  /* Admin-Status ermitteln: die im Google-Login hinterlegte E-Mail
     gegen FIRE_HELMET_CONFIG.ownerEmail. Ein anonymer Besucher hat
     keine E-Mail und ist damit kein Admin. */
  async function adminErmitteln() {
    try {
      if (!window.supabaseClient) return;
      if (typeof wheelAuthReady !== "undefined" && wheelAuthReady && wheelAuthReady.then) {
        try { await wheelAuthReady; } catch (e) { /* egal */ }
      }
      const { data } = await supabaseClient.auth.getUser();
      const email = data && data.user && data.user.email;
      viewerIstAdmin = !!email && typeof FIRE_HELMET_CONFIG !== "undefined"
        && email.toLowerCase() === (FIRE_HELMET_CONFIG.ownerEmail || "").toLowerCase();
    } catch (e) { /* kein Login -> kein Admin */ }
    anwenden();
  }

  /* Bei jeder Config-Aenderung (Admin drueckt Release) neu
     anwenden, und einmal beim Start, sobald die Config da ist. */
  window.addEventListener("siteConfigUpdated", anwenden);
  document.addEventListener("DOMContentLoaded", function () {
    anwenden();
    if (typeof onSiteConfigReady === "function") onSiteConfigReady(anwenden);
    adminErmitteln();
  });

  /* Nach einem Google-Login/Logout meldet admin-gateway.js den
     Wechsel - dann Admin-Status neu bestimmen. */
  window.addEventListener("fhAdminStatusGeaendert", adminErmitteln);
})();
