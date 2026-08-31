/* ======================================================
   SITE-CONFIG (vom Admin-Gateway editierbare Werte)
   ---------------------------------------------------
   Eine einzige, kleine Supabase-Zeile (site_config, id="main", der
   eigentliche Inhalt liegt in der JSONB-Spalte "data"), die per
   Admin-Gateway (scripts/core/admin-gateway.js) verwaltet werden
   kann, OHNE dafür jedes Mal Code zu ändern/neu zu deployen:
   Haupt-Countdown-Endzeit, Schiffsreparatur-Endzeit, gesperrte
   Kapitel-IDs.

   WICHTIG - Ausfallsicherheit:
   Jeder Wert hier ist rein additiv und OPTIONAL. Ist Supabase
   nicht erreichbar oder die Zeile (noch) leer, bleiben alle Werte
   auf ihrem Standard (null / leeres Array) - die jeweiligen
   Verbrauchsstellen (countdown.js, ship-repair.js, stories.js)
   fallen dann automatisch auf ihr bisheriges, unverändertes
   Verhalten zurück. Die bestehende Seite kann durch dieses Modul
   also nie kaputtgehen, selbst wenn es komplett fehlschlägt.

   BEKANNTER UNTERSCHIED ZU FRUEHER: Firestores onSnapshot() hielt
   bereits offene Tabs live auf dem neuesten Stand, sobald der Admin
   irgendwo etwas änderte - kein direktes Supabase-Realtime-Äquivalent
   wird in dieser Migration bislang genutzt (siehe dieselbe
   Entscheidung bei refreshPlayerCard() in progression.js). Eine
   Admin-Änderung wird jetzt beim NÄCHSTEN Laden/Neuladen der Seite
   übernommen, nicht mehr live in bereits offenen Tabs anderer
   Besucher - für seltene Admin-Aktionen ein akzeptabler Trade-off
   gegenüber der Komplexität einer echten Realtime-Anbindung.

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
  if (!supabaseClient) {
    markSiteConfigReady();
    return;
  }

  try {
    if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;

    const { data, error } = await supabaseClient
      .from("site_config")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;

    applySiteConfigSnapshot((data && data.data) || {});
  } catch (err) {
    console.warn("site_config konnte nicht geladen werden, bleibe bei Standardwerten:", err);
    markSiteConfigReady();
  }
}

/* ------------------------------------------------------
   GEMEINSAME SCHREIBFUNKTION (admin-gateway.js + ship-repair.js
   maybeUnlockChapterAfterShipRepair())
   ---------------------------------------------------
   site_config liegt in Postgres als EIN JSONB-Blob (Spalte "data"),
   nicht als einzelne Top-Level-Spalten wie zuvor in Firestore -
   jede einzelne Admin-Aenderung (Countdown, Kapitel-Sperre, ...)
   muss den Blob deshalb erst lesen, den betroffenen Schluessel
   zusammenfuehren und komplett zurueckschreiben (Firestores
   set(...,{merge:true}) machte genau das serverseitig automatisch).
   RLS (site_config_write_admin) prueft dabei bewusst KEIN einzelnes
   Feld, nur app.is_admin() - exakt wie zuvor in firestore.rules.
------------------------------------------------------ */
async function patchSupabaseSiteConfig(partialUpdate) {
  if (!supabaseClient) throw new Error("no-db");

  const { data: current, error: readError } = await supabaseClient
    .from("site_config")
    .select("data")
    .eq("id", "main")
    .maybeSingle();
  if (readError) throw readError;

  const merged = { ...((current && current.data) || {}), ...partialUpdate };

  // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
  const { error: writeError } = await withSupabaseRlsColdStartRetry(() =>
    supabaseClient.from("site_config").upsert({ id: "main", data: merged }, { onConflict: "id" })
  );
  if (writeError) throw writeError;

  applySiteConfigSnapshot(merged);
  return merged;
}

window.addEventListener("DOMContentLoaded", initSiteConfig);
