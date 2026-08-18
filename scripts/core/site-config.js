/* ======================================================
   SITE-CONFIG (vom Admin-Gateway editierbare Werte)
   ---------------------------------------------------
   Ein einziges, kleines Firestore-Dokument (site_config/main),
   das per Admin-Gateway (scripts/core/admin-gateway.js) verwaltet
   werden kann, OHNE dafür jedes Mal Code zu ändern/neu zu
   deployen: Haupt-Countdown-Endzeit, Schiffsreparatur-Endzeit,
   gesperrte Kapitel-IDs.

   WICHTIG - Ausfallsicherheit:
   Jeder Wert hier ist rein additiv und OPTIONAL. Ist Firestore
   nicht erreichbar oder das Dokument (noch) leer, bleiben alle
   Werte auf ihrem Standard (null / leeres Array) - die jeweiligen
   Verbrauchsstellen (countdown.js, ship-repair.js, stories.js)
   fallen dann automatisch auf ihr bisheriges, unverändertes
   Verhalten zurück. Die bestehende Seite kann durch dieses Modul
   also nie kaputtgehen, selbst wenn es komplett fehlschlägt.

   `siteConfig` ist absichtlich ein einfaches, veränderliches
   globales Objekt (kein Modul-Export nötig) - andere Skripte lesen
   einfach `siteConfig.xyz` im Moment, in dem sie ihn brauchen
   (z.B. bei jedem Countdown-Tick), statt eine Kopie zu halten.
   Dadurch übernehmen bereits offene Tabs Admin-Änderungen live,
   ohne Sonderlogik in jeder einzelnen Verbrauchsstelle.
====================================================== */

let siteConfig = {
  mainCountdownTarget: null, // ISO-String oder null = Fallback aus FIRE_HELMET_CONFIG
  shipEventUnlockDate: null, // ISO-String oder null = Fallback aus FIRE_HELMET_CONFIG
  lockedChapterIds: [], // Kapitel-IDs (siehe stories-data.js), die (noch) gesperrt sind
  disabledGameIds: [], // Spielothek-Spiele-IDs (siehe spielothek-data.js), die der Admin deaktiviert hat

  // Kapitel-IDs (beide Sprachvarianten), die automatisch aus
  // lockedChapterIds entfernt werden, sobald das Schiff vollstaendig
  // repariert ist (siehe maybeUnlockChapterAfterShipRepair() in
  // scripts/ship/ship-repair.js). Leeres Array = keine automatische
  // Freischaltung konfiguriert.
  shipRepairUnlockChapterIds: [],
};

let siteConfigReady = false;
let siteConfigListeners = [];

function onSiteConfigReady(callback) {
  if (siteConfigReady) {
    callback(siteConfig);
    return;
  }
  siteConfigListeners.push(callback);
}

function markSiteConfigReady() {
  if (siteConfigReady) return;
  siteConfigReady = true;
  siteConfigListeners.forEach((cb) => cb(siteConfig));
  siteConfigListeners = [];
}

function applySiteConfigSnapshot(data) {
  siteConfig = {
    mainCountdownTarget: typeof data.mainCountdownTarget === "string" ? data.mainCountdownTarget : null,
    shipEventUnlockDate: typeof data.shipEventUnlockDate === "string" ? data.shipEventUnlockDate : null,
    lockedChapterIds: Array.isArray(data.lockedChapterIds) ? data.lockedChapterIds : [],
    disabledGameIds: Array.isArray(data.disabledGameIds) ? data.disabledGameIds : [],
    shipRepairUnlockChapterIds: Array.isArray(data.shipRepairUnlockChapterIds) ? data.shipRepairUnlockChapterIds : [],
  };
  markSiteConfigReady();
  window.dispatchEvent(new CustomEvent("siteConfigUpdated", { detail: siteConfig }));
}

async function initSiteConfig() {
  if (!wheelDb) {
    markSiteConfigReady();
    return;
  }

  try {
    if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;

    wheelDb
      .collection("site_config")
      .doc("main")
      .onSnapshot(
        (snap) => {
          applySiteConfigSnapshot(snap.exists ? snap.data() : {});
        },
        (err) => {
          console.warn("site_config konnte nicht geladen werden, bleibe bei Standardwerten:", err);
          markSiteConfigReady();
        }
      );
  } catch (err) {
    console.warn("site_config konnte nicht geladen werden, bleibe bei Standardwerten:", err);
    markSiteConfigReady();
  }
}

window.addEventListener("DOMContentLoaded", initSiteConfig);
