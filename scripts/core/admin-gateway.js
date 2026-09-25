/* ======================================================
   ADMIN-GATEWAY
   ---------------------------------------------------
   ECHTE Supabase Authentication statt eines Passworts im Frontend:
   Anmeldung per Google, danach wird geprüft, ob die vom
   GOOGLE-SERVER selbst bestätigte E-Mail-Adresse exakt
   FIRE_HELMET_CONFIG.ownerEmail entspricht. Ein Besucher kann
   diese Prüfung nicht faelschen, da die E-Mail nicht vom Client
   kommt, sondern Teil der von Supabase selbst kryptografisch
   geprüften Sitzung ist. Die eigentliche, serverseitige
   Durchsetzung (nicht nur diese Client-Anzeige-Pruefung) passiert
   über app.is_admin() in der Supabase RLS-Policy
   "site_config_write_admin" (siehe 05-site-data.sql), die
   auth.jwt() ->> 'email' gegen dieselbe ownerEmail prueft.

   WICHTIG - Voraussetzung: im Supabase-Dashboard muss unter
   Authentication -> Sign In / Providers -> Google die Anmeldung
   aktiv sein (eigene Google-OAuth-Client-ID/Secret aus der Google
   Cloud Console eintragen). Ist sie das nicht, zeigt der
   "Mit Google anmelden"-Button einen klaren Fehler.

   signInWithOAuth() statt eines Popups: Supabase-js bietet fuer
   OAuth nur einen Redirect-Flow (kein linkWithPopup()-Aequivalent
   fuer eine bestehende anonyme Sitzung) - der Browser wechselt kurz
   zu Google und kommt zurueck. Das ersetzt die bisherige anonyme
   Sitzung durch eine echte Google-Sitzung (anders als zuvor bei
   Firebase, wo die anonyme UID per linkWithPopup() erhalten blieb) -
   fuer den Admin-Bereich unproblematisch, da er nicht von der
   eigenen Spielerzeile abhaengt.
====================================================== */

function getGoogleEmail(user) {
  return user ? user.email : null;
}

function isAuthorizedAdmin(user) {
  const email = getGoogleEmail(user);
  return !!email && typeof FIRE_HELMET_CONFIG !== "undefined" && email.toLowerCase() === (FIRE_HELMET_CONFIG.ownerEmail || "").toLowerCase();
}

async function loginAdminWithGoogle() {
  const statusEl = document.getElementById("gateway-login-status");
  if (!supabaseClient) {
    if (statusEl) statusEl.textContent = "⚠️ Supabase ist nicht verfügbar.";
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });

  if (error) {
    console.error("Admin-Login fehlgeschlagen:", error);
    if (statusEl) statusEl.textContent = "⚠️ Anmeldung fehlgeschlagen: " + (error.message || "");
  }
  // Bei Erfolg verlaesst der Browser die Seite Richtung Google -
  // renderGatewayPage() laeuft nach der Rueckkehr ueber den normalen
  // Seiten-Start erneut, kein manueller Aufruf hier noetig.
}

async function logoutAdmin() {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.warn("Abmelden fehlgeschlagen:", err);
  }
  renderGatewayPage();
}

/* ------------------------------------------------------
   KAPITEL-GRUPPEN FÜR DIE SPERR-LISTE
   Fasst DE/EN-Varianten desselben Kapitels zu einer Zeile
   zusammen (id-Muster "<story>-<de|en>-<nr>") - ein Admin denkt
   in "Kapiteln", nicht in einzelnen Sprachdateien.
------------------------------------------------------ */
function getChapterGroupsForGateway() {
  const groups = {};
  if (typeof stories === "undefined") return [];

  stories.forEach((story) => {
    story.chapters.forEach((chapter) => {
      const match = chapter.id.match(/^(.*)-(de|en)-(\d+)$/);
      const key = match ? `${match[1]}-${match[3]}` : chapter.id;
      if (!groups[key]) {
        groups[key] = { key, storyTitle: story.title, ids: [], displayTitle: chapter.title };
      }
      groups[key].ids.push(chapter.id);
      if (!match || match[2] === "de") groups[key].displayTitle = chapter.title;
    });
  });

  return Object.values(groups);
}

/* ------------------------------------------------------
   SPEICHERN
------------------------------------------------------ */
async function saveGatewayCountdowns() {
  const statusEl = document.getElementById("gateway-save-status");
  const mainInput = document.getElementById("gateway-main-countdown");
  const shipInput = document.getElementById("gateway-ship-countdown");
  if (!supabaseClient) return;

  const update = {};
  if (mainInput && mainInput.value) update.mainCountdownTarget = new Date(mainInput.value).toISOString().slice(0, 19);
  if (shipInput && shipInput.value) update.shipEventUnlockDate = new Date(shipInput.value).toISOString().slice(0, 19);

  try {
    await patchSupabaseSiteConfig(update);
    // Kurz verzögert setzen: das eigene Speichern löst über
    // applySiteConfigSnapshot() (siehe site-config.js) sofort ein
    // Neuzeichnen des gesamten Panels aus - das würde die Meldung
    // hier sonst augenblicklich wieder überschreiben, bevor sie
    // sichtbar wird. (Früher stand hier "für die Live-Vorschau";
    // die ist entfernt, das Neuzeichnen bleibt aber, weil das Panel
    // seine Felder aus dem Schnappschuss füllt.)
    setTimeout(() => {
      const el = document.getElementById("gateway-save-status");
      if (el) el.textContent = "✅ Gespeichert.";
    }, 80);
  } catch (err) {
    console.error("Countdown konnte nicht gespeichert werden:", err);
    if (statusEl) statusEl.textContent = "⚠️ Speichern fehlgeschlagen (siehe Konsole).";
  }
}

async function toggleGatewayChapterLock(groupKey, ids, locked) {
  if (!supabaseClient) return;
  const current = Array.isArray(siteConfig.lockedChapterIds) ? [...siteConfig.lockedChapterIds] : [];
  const withoutGroup = current.filter((id) => !ids.includes(id));
  const next = locked ? [...withoutGroup, ...ids] : withoutGroup;

  try {
    await patchSupabaseSiteConfig({ lockedChapterIds: next });
  } catch (err) {
    console.error("Kapitel-Sperre konnte nicht gespeichert werden:", err);
  }
}

/* ------------------------------------------------------
   RENDERING
------------------------------------------------------ */
function formatDateForInput(isoOrConfigValue) {
  try {
    const d = new Date(isoOrConfigValue);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return "";
  }
}

function buildGatewayStatusHtml() {
  const mainTarget = (siteConfig.mainCountdownTarget) || FIRE_HELMET_CONFIG.mainCountdownFallback;
  // Dieses Datum steuert nur die "???"-Seite (siehe scripts/
  // streamraetsel/streamraetsel.js), trotz des historischen Namens
  // shipEventUnlockDate.
  const streamTarget = typeof getStreamRaetselUnlockDate === "function" ? getStreamRaetselUnlockDate() : null;
  const lockedCount = Array.isArray(siteConfig.lockedChapterIds) ? siteConfig.lockedChapterIds.length : 0;

  return `
    <div class="gateway-status-grid">
      <div class="gateway-status-card">
        <p class="gateway-status-label">Haupt-Countdown</p>
        <p class="gateway-status-value">${new Date(mainTarget).toLocaleString("de-DE")}</p>
      </div>
      <div class="gateway-status-card">
        <p class="gateway-status-label">„???“-Freischaltung</p>
        <p class="gateway-status-value">${streamTarget ? streamTarget.toLocaleString("de-DE") : "-"} ${streamTarget && typeof isStreamRaetselUnlocked === "function" && isStreamRaetselUnlocked() ? "(bereits freigeschaltet)" : ""}</p>
      </div>
      <div class="gateway-status-card">
        <p class="gateway-status-label">Gesperrte Kapitel</p>
        <p class="gateway-status-value">${lockedCount}</p>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------
   SPIELOTHEK-VERWALTUNG
   Nur wirklich fertige Spiele (implemented: true in
   spielothek-data.js) lassen sich hier ueberhaupt an-/
   abschalten - halbfertige Spiele erscheinen im Gateway gar
   nicht erst, damit niemand aus Versehen ein kaputtes Spiel
   live schaltet.
------------------------------------------------------ */
function buildGatewaySpielothekHtml() {
  if (typeof SPIELOTHEK_GAMES === "undefined") return "";
  const disabled = Array.isArray(siteConfig.disabledGameIds) ? siteConfig.disabledGameIds : [];
  const implemented = SPIELOTHEK_GAMES.filter((g) => g.implemented);
  const current = typeof getCurrentSpielothekGame === "function" ? getCurrentSpielothekGame() : null;

  const rows = implemented
    .map((game) => {
      const isDisabled = disabled.includes(game.id);
      return `
        <label class="gateway-chapter-row">
          <input type="checkbox" ${isDisabled ? "" : "checked"} onchange="toggleGatewaySpielothekGame('${game.id}', !this.checked)">
          <span>${game.emoji} ${game.name.de}</span>
        </label>
      `;
    })
    .join("");

  return `
    <p class="gateway-status-sub">${current ? `Aktuelles Spiel des Monats: ${current.emoji} ${current.name.de}` : "Kein aktives Spiel diesen Monat (alle deaktiviert oder noch keins fertig)."}</p>
    <div class="gateway-chapter-list">${rows || "<p class=\"wheel-status\">Noch kein fertiges Spiel vorhanden.</p>"}</div>
  `;
}

async function toggleGatewaySpielothekGame(gameId, disabled) {
  if (!supabaseClient) return;
  const current = Array.isArray(siteConfig.disabledGameIds) ? [...siteConfig.disabledGameIds] : [];
  const withoutGame = current.filter((id) => id !== gameId);
  const next = disabled ? [...withoutGame, gameId] : withoutGame;

  try {
    await patchSupabaseSiteConfig({ disabledGameIds: next });
  } catch (err) {
    console.error("Spiel konnte nicht umgeschaltet werden:", err);
  }
}


function buildGatewayChapterListHtml() {
  const locked = Array.isArray(siteConfig.lockedChapterIds) ? siteConfig.lockedChapterIds : [];
  return getChapterGroupsForGateway()
    .map((group) => {
      const isLocked = group.ids.some((id) => locked.includes(id));
      return `
        <label class="gateway-chapter-row">
          <input type="checkbox" ${isLocked ? "checked" : ""} onchange="toggleGatewayChapterLock('${group.key}', ${JSON.stringify(group.ids).replace(/"/g, "&quot;")}, this.checked)">
          <span>${group.displayTitle} <small>(${group.storyTitle})</small></span>
        </label>
      `;
    })
    .join("");
}

/* ------------------------------------------------------
   LIVE-EVENT: FUNKTIONEN FREIGEBEN (Feature-Flags)
   ---------------------------------------------------
   Jede neu gebaute Funktion liegt zuerst versteckt auf der Seite
   und ist nur fuer dich (Admin) als Vorschau sichtbar. Erst ein
   Klick auf "Freigeben" setzt das Flag, und ab dann sehen es alle.
   So kannst du eine Funktion in Ruhe pruefen, bevor sie live geht.
------------------------------------------------------ */
const GATEWAY_FEATURE_FLAGS = [
  { key: "skillTree", label: "Skill-Baum", hinweis: "Der Fertigkeitsbaum mit Skillpunkten." },
];

/* Aufgeteilt in drei Teile des Menues (Steuerung, Geschenke,
   Freigaben), damit keiner davon lang wird. */
function buildGatewayFreigabenHtml() {
  const flags = (typeof siteConfig !== "undefined" && siteConfig.featureFlags) || {};
  const zeilen = GATEWAY_FEATURE_FLAGS.map((f) => {
    const an = flags[f.key] === true;
    return `
      <label class="gateway-form-row gateway-flag-row">
        <input type="checkbox" ${an ? "checked" : ""} onchange="saveGatewayFeatureFlag('${f.key}', this.checked)">
        <span><strong>${escapeHtml(f.label)}</strong>${f.hinweis ? " - " + escapeHtml(f.hinweis) : ""}<br>
        <small class="gateway-status-sub">${an ? "🟢 Fuer alle sichtbar" : "🔒 Versteckt - nur du siehst sie als Vorschau"}</small></span>
      </label>`;
  }).join("");
  return `
    <p class="gateway-status-sub">Haken = fuer alle sichtbar. Ohne Haken bleibt die Funktion versteckt und nur fuer dich als Vorschau sichtbar.</p>
    ${zeilen}
  `;
}

/* Eine Zeile der Effekt-Tabelle. Impulse (Konfetti ...) haben je
   einen Knopf, Dauerzustaende (Disco, Buehne) je An und Aus. */
function gwLiveZeile(name, test, alle) {
  const knoepfe = (liste, klasse) => liste.map(([text, aufruf]) =>
    `<button type="button" class="gw-live-knopf ${klasse}" onclick="${aufruf}">${text}</button>`).join("");
  return `
    <div class="gw-live-zeile" role="row">
      <span class="gw-live-name" role="rowheader">${name}</span>
      <span class="gw-live-zelle" role="cell">${knoepfe(test, "")}</span>
      <span class="gw-live-zelle" role="cell">${knoepfe(alle, "ist-alle")}</span>
    </div>`;
}

function buildGatewayLiveSteuerungHtml() {
  return `
    <div class="gw-live-nachricht">
      <input type="text" id="gw-live-msg" class="gw-feld gw-feld-breit" maxlength="280" placeholder="Nachricht an alle ..." aria-label="Nachricht">
      <input type="text" id="gw-live-von" class="gw-feld" maxlength="60" placeholder="Dein Name" aria-label="Absender">
      <input type="color" id="gw-live-farbe" class="gw-farbe" value="#f0c96a" title="Farbe der Banderole" aria-label="Farbe">
      <button type="button" class="gw-live-knopf" onclick="gwLiveMessage(false)">Bei mir testen</button>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwLiveMessage(true)">An alle senden</button>
    </div>
    <p id="gw-live-status" class="gw-live-status" role="status" aria-live="polite"></p>

    <div class="gw-live-tabelle" role="table" aria-label="Effekte">
      <div class="gw-live-zeile gw-live-kopf" role="row">
        <span role="columnheader">Effekt</span>
        <span role="columnheader">Nur bei mir</span>
        <span role="columnheader">An alle</span>
      </div>
      ${gwLiveZeile("Konfetti", [["Testen", "gwLivePulse('konfetti', false)"]], [["Senden", "gwLivePulse('konfetti', true)"]])}
      ${gwLiveZeile("Blitz", [["Testen", "gwLivePulse('blitz', false)"]], [["Senden", "gwLivePulse('blitz', true)"]])}
      ${gwLiveZeile("Sound", [["Testen", "gwLivePulse('sound', false)"]], [["Senden", "gwLivePulse('sound', true)"]])}
      ${gwLiveZeile("Live-Bühne", [["An", "gwLiveTakeover(true, false)"], ["Aus", "gwLiveTakeover(false, false)"]], [["An", "gwLiveTakeover(true, true)"], ["Aus", "gwLiveTakeover(false, true)"]])}
    </div>
    <p class="gateway-status-sub">Die Live-Bühne schickt alle auf eine leere Fläche, auf der deine Effekte wirken. Disco, Sturm, Hacked und die anderen Szenen stehen unter „Storys“.</p>
  `;
}

function buildGatewayLiveGeschenkeHtml() {
  return `
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Dublonen
        <input type="number" id="gw-live-dub" class="gw-feld" min="1" max="5000" value="100">
      </label>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwLiveGrant('dublonen')">Dublonen an alle</button>
    </div>
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Avatar-ID
        <input type="text" id="gw-live-av" class="gw-feld" placeholder="z.B. meisterdetektiv">
      </label>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwLiveGrant('avatar')">Avatar an alle</button>
    </div>
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Skillpunkte (1–10)
        <input type="number" id="gw-live-sp" class="gw-feld" min="1" max="10" value="1">
      </label>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwLiveGrant('skillpunkte')">Skillpunkte an alle</button>
    </div>
    <p id="gw-geschenk-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Jeder anwesende Spieler bekommt es genau einmal. Der Betrag wird server-seitig verrechnet.</p>
  `;
}

/* ------------------------------------------------------
   LIVE-EVENT: STORYS (Migration 29, scripts/liveevent/live-storys.js)
   ---------------------------------------------------
   "Vorschau" spielt die Story nur hier im eigenen Browser ab, ohne
   Belohnung. "Für alle" startet sie ueber admin_live_story() bei
   allen, die gerade auf der Seite sind. Die Belohnungen legt die
   Datenbank fest - die Texte hier beschreiben sie nur.
------------------------------------------------------ */
const GW_STORYS = [
  ["schatz", "Schatzregen", "25 s · Zuschauer fangen Münzen · Beute ×10 Dublonen (max. 600), ab 25 zusätzlich +1 Skillpunkt", "gold"],
  ["hacked", "Hacked", "32 s · Unbekannter gegen Dave · Titel „Firewall-Pirat“ + 1 Skillpunkt, danach 6 Hintertüren zum Schließen (+1 Skillpunkt)", "neon"],
  ["sturm", "Sturm", "12,4 s · Blitz und Einschlag · +150 Dublonen", "kalt"],
  ["nordlicht", "Nordlicht", "17 s · Sternschnuppen und ein Wunsch · +150 Dublonen", "violett"],
  ["nebel", "Geisterschiff", "14 s · Nebel und ein Fluch · +150 Dublonen", "papier"],
  ["flut", "Sturmflut", "13,6 s · Land unter und Treibgut · +150 Dublonen", "wasser"],
  ["disco", "Disco-Party", "Endlos, bis du sie beendest · mit Musik (unten hochladen)", "gold"],
  ["ende", "Systemausfall", "12 s · beendet das Event – die Seite bleibt für alle gehackt, bis die nächste Story startet oder du wiederherstellst", "rot"],
];

function buildGatewayStorysHtml() {
  const zeilen = GW_STORYS.map(([id, name, info, ton]) => `
    <div class="gw-story ist-${ton}">
      <div class="gw-story-text"><span class="gw-story-name">${name}</span><span class="gw-story-info">${info}</span></div>
      <div class="gw-story-knoepfe">
        <button type="button" class="gw-live-knopf" onclick="gwStoryVorschau('${id}')">Vorschau</button>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwStoryStart('${id}')">Für alle</button>
      </div>
    </div>`).join("");
  return `
    <div class="gw-story-lage">
      <p id="gw-story-jetzt" class="gw-story-jetzt">Lade …</p>
      <div class="gw-story-lage-knoepfe">
        <button type="button" class="gw-live-knopf" onclick="gwStoryBeenden()">Disco beenden</button>
        <button type="button" class="gw-live-knopf" onclick="gwStoryAufraeumen()">Abbrechen / Seite wiederherstellen</button>
        <button type="button" class="gw-live-knopf" onclick="gwStoryVorschauStopp()">Vorschau stoppen</button>
      </div>
    </div>
    <div class="gw-story-liste">${zeilen}</div>
    <p id="gw-story-status" class="gw-live-status" role="status" aria-live="polite"></p>

    <div class="gw-musik">
      <div class="gw-musik-text">
        <span class="gw-story-name">Disco-Musik</span>
        <span id="gw-musik-stand" class="gw-story-info">Lade …</span>
      </div>
      <label class="gw-live-knopf gw-musik-datei">Datei wählen<input type="file" accept="audio/*" onchange="gwMusikHochladen(this)" hidden></label>
      <button type="button" class="gw-live-knopf" onclick="gwMusikProbe()">Anhören</button>
      <button type="button" class="gw-live-knopf" onclick="gwMusikEntfernen()">Entfernen</button>
    </div>
    <p id="gw-musik-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Die Musik liegt in Supabase Storage (Bucket „live-musik“) und wird bei allen abgespielt, sobald die Disco läuft. Ohne eigene Datei läuft music/disco.mp3. Höchstens 15 MB.</p>
  `;
}

function gwStoryName(id) {
  const s = GW_STORYS.find((x) => x[0] === id);
  return s ? s[1] : id;
}

async function gwStoryLageLaden() {
  const ziel = document.getElementById("gw-story-jetzt");
  const musik = document.getElementById("gw-musik-stand");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from("live_event").select("story, story_at, story_ende_at, musik_version").eq("id", 1).maybeSingle();
    if (error) throw error;
    const z = data || {};
    if (!z.story) ziel.textContent = "Gerade läuft keine Story.";
    else if (z.story === "ende") ziel.textContent = "Zuletzt: Systemausfall – die Seite ist gehackt, bis du wiederherstellst oder eine neue Story startest.";
    else if (z.story === "disco" && !z.story_ende_at) ziel.textContent = "Disco läuft seit " + String(z.story_at || "").slice(11, 16) + " Uhr (UTC) – „Disco beenden“ lässt sie ausklingen.";
    else ziel.textContent = "Zuletzt gestartet: " + gwStoryName(z.story) + " um " + String(z.story_at || "").slice(11, 16) + " Uhr (UTC).";
    if (musik) musik.textContent = z.musik_version ? "Eigene Datei hochgeladen (Version " + z.musik_version + ")" : "Standard: music/disco.mp3";
  } catch (err) {
    ziel.textContent = "Stand nicht lesbar – ist Migration 29 eingespielt?";
  }
}

function gwStoryVorschau(id) {
  if (!window.fhLiveStorys) { gwLiveStatus("gw-story-status", "live-storys.js ist nicht geladen.", true); return; }
  window.fhLiveStorys.vorschau(id);
  gwLiveStatus("gw-story-status", "Vorschau: " + gwStoryName(id) + " – nur bei dir, ohne Belohnung.", false);
}

function gwStoryVorschauStopp() {
  if (window.fhLiveStorys) window.fhLiveStorys.vorschauStopp();
  gwLiveStatus("gw-story-status", "Vorschau gestoppt.", false);
}

async function gwStoryStart(id) {
  if (!supabaseClient) return;
  if (id === "ende" && !confirm("Systemausfall für alle starten? Die Seite bleibt danach für alle gehackt, bis die nächste Story startet oder du wiederherstellst.")) return;
  gwLiveStatus("gw-story-status", "Starte …", false);
  try {
    const { error } = await supabaseClient.rpc("admin_live_story", { p_story: id });
    if (error) throw error;
    gwLiveStatus("gw-story-status", "✓ " + gwStoryName(id) + " läuft jetzt bei allen.", false);
    gwStoryLageLaden();
  } catch (err) {
    console.error("Story starten fehlgeschlagen:", err);
    gwLiveStatus("gw-story-status", "Starten fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwStoryBeenden() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_live_story_beenden");
    if (error) throw error;
    gwLiveStatus("gw-story-status", data ? "✓ Disco klingt bei allen aus." : "Es lief nichts, das man beenden könnte.", !data);
    gwStoryLageLaden();
  } catch (err) {
    gwLiveStatus("gw-story-status", "Beenden fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwStoryAufraeumen() {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.rpc("admin_live_story", { p_story: null });
    if (error) throw error;
    gwLiveStatus("gw-story-status", "✓ Story abgebrochen, Seite bei allen wiederhergestellt.", false);
    gwStoryLageLaden();
  } catch (err) {
    gwLiveStatus("gw-story-status", "Fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwMusikHochladen(feld) {
  const datei = feld && feld.files && feld.files[0];
  if (feld) feld.value = "";
  if (!datei || !supabaseClient) return;
  if (!/^audio\//.test(datei.type || "")) { gwLiveStatus("gw-musik-status", "Das ist keine Audiodatei.", true); return; }
  if (datei.size > 15 * 1024 * 1024) { gwLiveStatus("gw-musik-status", "Die Datei ist größer als 15 MB.", true); return; }
  gwLiveStatus("gw-musik-status", "Lade „" + datei.name + "“ hoch …", false);
  try {
    const { error } = await supabaseClient.storage.from("live-musik").upload("disco", datei, { upsert: true, contentType: datei.type, cacheControl: "60" });
    if (error) throw error;
    /* Neue Version: alle Browser holen die Datei frisch, statt die
       alte aus dem Cache zu spielen. */
    const version = Date.now().toString(36);
    const { data, error: e2 } = await supabaseClient.from("live_event").update({ musik_version: version, updated_at: new Date().toISOString() }).eq("id", 1).select("id");
    if (e2) throw e2;
    if (!data || !data.length) throw new Error("Keine Berechtigung für live_event");
    gwLiveStatus("gw-musik-status", "✓ „" + datei.name + "“ ist die neue Disco-Musik.", false);
    gwStoryLageLaden();
  } catch (err) {
    console.error("Musik hochladen fehlgeschlagen:", err);
    gwLiveStatus("gw-musik-status", "Hochladen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwMusikEntfernen() {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.storage.from("live-musik").remove(["disco"]);
    if (error) throw error;
    const { error: e2 } = await supabaseClient.from("live_event").update({ musik_version: null, updated_at: new Date().toISOString() }).eq("id", 1).select("id");
    if (e2) throw e2;
    gwLiveStatus("gw-musik-status", "✓ Eigene Musik entfernt – es läuft wieder music/disco.mp3.", false);
    gwStoryLageLaden();
  } catch (err) {
    gwLiveStatus("gw-musik-status", "Entfernen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

let gwMusikAudio = null;
function gwMusikProbe() {
  if (gwMusikAudio && !gwMusikAudio.paused) { gwMusikAudio.pause(); gwLiveStatus("gw-musik-status", "Angehalten.", false); return; }
  const url = window.fhLiveStorys ? window.fhLiveStorys.musikUrl() : "music/disco.mp3";
  gwMusikAudio = new Audio(url);
  gwMusikAudio.volume = 0.6;
  gwMusikAudio.play().then(
    () => gwLiveStatus("gw-musik-status", "Spielt – nochmal „Anhören“ zum Anhalten.", false),
    () => gwLiveStatus("gw-musik-status", "Konnte nicht abgespielt werden – ist eine Datei vorhanden?", true));
}

/* ------------------------------------------------------
   LIVE-EVENT: EVENT-TITEL (Migration 27)
   ---------------------------------------------------
   Ein eigener Titel (bis 32 Zeichen) mit einem der fuenf Stile aus
   scripts/liveevent/event-titel.js. "An alle Anwesenden" laeuft wie
   die anderen Geschenke ueber einen Grant; "an einen Spieler" ueber
   die vorhandene Spielersuche.

   Spielernamen kommen von Nutzern - die Trefferliste und die
   Vorschau werden deshalb per textContent gebaut, nie per innerHTML.
------------------------------------------------------ */
const GW_TITEL_STILE = [
  ["regenbogen", "Regenbogen"], ["gold", "Goldschimmer"], ["feuer", "Feuer"],
  ["eis", "Eis / Neon"], ["hacked", "hacked"],
];

function buildGatewayEventTitelHtml() {
  const optionen = GW_TITEL_STILE.map(([wert, name]) => `<option value="${wert}">${name}</option>`).join("");
  return `
    <div class="gw-live-nachricht">
      <input type="text" id="gw-titel-text" class="gw-feld gw-feld-breit" maxlength="32" placeholder="Titel, z. B. Held des Sturms" aria-label="Titeltext" oninput="gwTitelVorschau()">
      <label class="gw-feld-label">Stil
        <select id="gw-titel-stil" class="gw-feld" onchange="gwTitelVorschau()">${optionen}</select>
      </label>
    </div>
    <p class="gw-titel-vorschau" id="gw-titel-vorschau" aria-label="Vorschau"><span class="fh-event-titel fh-titel-regenbogen">Vorschau</span></p>
    <div class="gw-live-nachricht">
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwTitelAnAlle()">Titel an alle Anwesenden</button>
    </div>
    <div class="gw-live-nachricht">
      <input type="text" id="gw-titel-suche" class="gw-feld gw-feld-breit" placeholder="Oder gezielt: Spielername suchen" aria-label="Spieler suchen" autocomplete="off"
             onkeydown="if (event.key === 'Enter') gwTitelSpielerSuchen()">
      <button type="button" class="gw-live-knopf" onclick="gwTitelSpielerSuchen()">Suchen</button>
    </div>
    <div id="gw-titel-treffer" class="gw-titel-treffer"></div>
    <p id="gw-titel-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Jeder Spieler traegt seinen neuesten Event-Titel - auf der Spielerkarte und in der Rangliste, vor einem Skill-Titel.</p>
  `;
}

function gwTitelEingabe() {
  const text = ((document.getElementById("gw-titel-text") || {}).value || "").trim();
  const stil = (document.getElementById("gw-titel-stil") || {}).value || "regenbogen";
  return { text, stil: GW_TITEL_STILE.some(([w]) => w === stil) ? stil : "regenbogen" };
}

function gwTitelVorschau() {
  const ziel = document.getElementById("gw-titel-vorschau");
  if (!ziel) return;
  const { text, stil } = gwTitelEingabe();
  const probe = document.createElement("span");
  probe.className = "fh-event-titel fh-titel-" + stil;
  probe.textContent = text || "Vorschau";
  ziel.replaceChildren(probe);
}

function gwTitelPruefen() {
  const eingabe = gwTitelEingabe();
  if (!eingabe.text) { gwLiveStatus("gw-titel-status", "Erst einen Titel eingeben.", true); return null; }
  if (eingabe.text.length > 32) { gwLiveStatus("gw-titel-status", "Hoechstens 32 Zeichen.", true); return null; }
  return eingabe;
}

async function gwTitelAnAlle() {
  const eingabe = gwTitelPruefen();
  if (!eingabe || !supabaseClient) return;
  gwLiveStatus("gw-titel-status", "Verteile ...", false);
  try {
    const { error } = await supabaseClient.rpc("admin_event_titel_an_alle", { p_text: eingabe.text, p_stil: eingabe.stil });
    if (error) throw error;
    gwLiveStatus("gw-titel-status", `✓ Titel „${eingabe.text}“ an alle Anwesenden verteilt`, false);
  } catch (err) {
    console.error("Titel an alle fehlgeschlagen:", err);
    gwLiveStatus("gw-titel-status", "Verteilen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwTitelSpielerSuchen() {
  const suche = ((document.getElementById("gw-titel-suche") || {}).value || "").trim();
  const liste = document.getElementById("gw-titel-treffer");
  if (!liste || !supabaseClient) return;
  if (!suche) { gwLiveStatus("gw-titel-status", "Erst einen Namen eingeben.", true); return; }
  liste.replaceChildren();
  try {
    const { data, error } = await supabaseClient.rpc("admin_spieler_suchen", { p_suche: suche });
    if (error) throw error;
    if (!data || !data.length) { gwLiveStatus("gw-titel-status", "Niemand gefunden.", true); return; }
    gwLiveStatus("gw-titel-status", data.length + " Treffer", false);
    data.forEach((sp) => {
      const zeile = document.createElement("div");
      zeile.className = "gw-titel-treffer-zeile";
      const name = document.createElement("span");
      name.className = "gw-titel-treffer-name";
      name.textContent = sp.nickname || "(ohne Namen)";
      const id = document.createElement("code");
      id.textContent = String(sp.firebase_uid).slice(0, 8);
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "gw-live-knopf";
      knopf.textContent = "Titel geben";
      knopf.addEventListener("click", () => gwTitelAnSpieler(sp.firebase_uid, sp.nickname || ""));
      zeile.append(name, id, knopf);
      liste.appendChild(zeile);
    });
  } catch (err) {
    console.error("Spielersuche fehlgeschlagen:", err);
    gwLiveStatus("gw-titel-status", "Suche fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwTitelAnSpieler(uid, name) {
  const eingabe = gwTitelPruefen();
  if (!eingabe || !supabaseClient) return;
  try {
    const { error } = await supabaseClient.rpc("admin_event_titel_an_spieler", { p_text: eingabe.text, p_stil: eingabe.stil, p_uid: uid });
    if (error) throw error;
    gwLiveStatus("gw-titel-status", `✓ Titel „${eingabe.text}“ an ${name || uid} vergeben`, false);
    if (window.fhEventTitel) window.fhEventTitel.laden();
  } catch (err) {
    console.error("Titel an Spieler fehlgeschlagen:", err);
    gwLiveStatus("gw-titel-status", "Vergeben fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

/* ------------------------------------------------------
   LIVE-EVENT: AUSLOESER
   Schreibt in die Zustandszeile public.live_event (nur der Admin
   darf das laut RLS) bzw. loest einen Grant ueber die RPC aus.
   "Bei mir testen" ruft stattdessen direkt den Effekt im eigenen
   Browser auf (window.fhLiveVorschau), sendet also NICHTS.

   Rueckmeldung: supabase-js wirft bei Fehlern nicht, sondern gibt
   { error } zurueck - und ein von RLS geblocktes UPDATE aendert
   still null Zeilen. Deshalb .select() und die Zeilen zaehlen,
   sonst glaubt man mitten im Event, es sei etwas angekommen.
------------------------------------------------------ */
function gwLiveStatus(id, text, istFehler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("ist-fehler", !!istFehler);
}

async function liveSend(update, was) {
  if (!supabaseClient) return;
  gwLiveStatus("gw-live-status", "Sende ...", false);
  try {
    const { data, error } = await supabaseClient.from("live_event").update(update).eq("id", 1).select("id");
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      gwLiveStatus("gw-live-status", "Nichts angekommen: keine Schreibrechte. Ist Migration 23 eingespielt und bist du als Admin angemeldet?", true);
      return;
    }
    gwLiveStatus("gw-live-status", `✓ ${was} an alle gesendet (${new Date().toLocaleTimeString("de-DE")})`, false);
  } catch (err) {
    console.error("Live-Event senden fehlgeschlagen:", err);
    gwLiveStatus("gw-live-status", "Senden fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}
function liveJetzt() { return new Date().toISOString(); }

const GW_LIVE_NAMEN = { konfetti: "Konfetti", blitz: "Blitz", sound: "Sound" };

function gwLiveMessage(anAlle) {
  const text = ((document.getElementById("gw-live-msg") || {}).value || "").trim();
  const farbe = (document.getElementById("gw-live-farbe") || {}).value || "#f0c96a";
  const von = ((document.getElementById("gw-live-von") || {}).value || "").trim();
  if (!text) { gwLiveStatus("gw-live-status", "Erst eine Nachricht eingeben.", true); return; }
  if (anAlle) liveSend({ message: text, message_color: farbe, message_from: von || null, message_at: liveJetzt() }, "Nachricht");
  else if (window.fhLiveVorschau) window.fhLiveVorschau.banderole(text, farbe, von);
}
function gwLivePulse(kind, anAlle) {
  if (anAlle) liveSend({ pulse_kind: kind, pulse_at: liveJetzt() }, GW_LIVE_NAMEN[kind] || kind);
  else if (window.fhLiveVorschau) window.fhLiveVorschau.pulse(kind);
}
function gwLiveTakeover(an, anAlle) {
  if (anAlle) liveSend({ takeover: !!an }, an ? "Live-Bühne AN" : "Live-Bühne AUS");
  else if (window.fhLiveVorschau) (an ? window.fhLiveVorschau.uebernahmeAn() : window.fhLiveVorschau.uebernahmeAus());
}
async function gwLiveGrant(art) {
  if (!supabaseClient) return;
  let wert = 0, avatar = null;
  if (art === "dublonen") {
    wert = parseInt((document.getElementById("gw-live-dub") || {}).value, 10) || 0;
    if (wert <= 0 || wert > 5000) { gwLiveStatus("gw-geschenk-status", "Dublonen zwischen 1 und 5000.", true); return; }
  } else if (art === "skillpunkte") {
    /* Dieselbe Grenze prueft die Datenbank (live_grants_skillpunkte_klein,
       Migration 24) - hier nur, damit die Meldung sofort kommt. */
    wert = parseInt((document.getElementById("gw-live-sp") || {}).value, 10) || 0;
    if (wert < 1 || wert > 10) { gwLiveStatus("gw-geschenk-status", "Skillpunkte zwischen 1 und 10.", true); return; }
  } else {
    avatar = ((document.getElementById("gw-live-av") || {}).value || "").trim();
    if (!avatar) { gwLiveStatus("gw-geschenk-status", "Erst eine Avatar-ID eingeben.", true); return; }
  }
  gwLiveStatus("gw-geschenk-status", "Verteile ...", false);
  try {
    const { error } = await supabaseClient.rpc("live_grant_ausloesen", { p_art: art, p_wert: wert, p_avatar: avatar });
    if (error) throw error;
    const was = art === "dublonen" ? wert + " Dublonen"
      : art === "skillpunkte" ? wert + (wert === 1 ? " Skillpunkt" : " Skillpunkte")
      : "Avatar „" + avatar + "“";
    gwLiveStatus("gw-geschenk-status", `✓ ${was} an alle verteilt`, false);
  } catch (err) {
    console.error("Grant fehlgeschlagen:", err);
    gwLiveStatus("gw-geschenk-status", "Verteilen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function saveGatewayFeatureFlag(name, on) {
  if (!supabaseClient) return;
  const flags = Object.assign({}, (typeof siteConfig !== "undefined" && siteConfig.featureFlags) || {});
  flags[name] = !!on;
  try {
    await patchSupabaseSiteConfig({ featureFlags: flags });
    if (typeof fhFlagsAnwenden === "function") fhFlagsAnwenden();
    renderGatewayPage();
  } catch (err) {
    console.error("Feature-Flag konnte nicht gespeichert werden:", err);
  }
}

/* ------------------------------------------------------
   MENUE DES ADMIN-GATES
   ---------------------------------------------------
   Statt 16 Abschnitten untereinander: sieben Bereiche oben, bei
   mehreren Teilen eine kleine zweite Reihe darunter. Sichtbar ist
   immer genau EIN Teil. Alle Teile stehen trotzdem im DOM (nur
   hidden), weil die Lade-Funktionen (ladeGatewayBoss & Co.) per
   id in sie hineinschreiben.

   renderGatewayPage() zeichnet nach fast jeder Admin-Aktion alles
   neu - deshalb merkt sich gwAktiv den gewaehlten Teil und wird
   danach wieder angewandt, sonst spraenge das Menue nach jedem
   Klick zurueck auf "Uebersicht".
------------------------------------------------------- */
const GW_SVG = (pfade) =>
  `<svg class="gw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pfade}</svg>`;

/* Symbole: lucide (ISC) - layout-dashboard, radio, globe, gamepad-2, key-round, users, message-circle */
const GW_MENUE = [
  { id: "uebersicht", titel: "Übersicht",
    icon: GW_SVG('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'),
    teile: [{ id: "uebersicht", kurz: "Übersicht", titel: "Übersicht" }] },
  { id: "live", titel: "Live-Event",
    icon: GW_SVG('<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>'),
    teile: [
      { id: "live", kurz: "Steuerung", titel: "Live-Steuerung" },
      { id: "storys", kurz: "Storys", titel: "Live-Storys" },
      { id: "geschenke", kurz: "Geschenke", titel: "Geschenke an alle" },
      { id: "titel", kurz: "Titel", titel: "Event-Titel verteilen" },
      { id: "freigaben", kurz: "Freigaben", titel: "Funktionen freigeben" },
    ] },
  { id: "seite", titel: "Seite",
    icon: GW_SVG('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
    teile: [
      { id: "countdown", kurz: "Countdown", titel: "Countdown" },
      { id: "kapitel", kurz: "Kapitel", titel: "Kapitel aktivieren/deaktivieren" },
      { id: "band", kurz: "Ankündigung", titel: "Ankündigung & Wartung" },
    ] },
  { id: "spiele", titel: "Spiele",
    icon: GW_SVG('<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>'),
    teile: [
      { id: "spielothek", kurz: "Spielothek", titel: "Ändiis Spielothek" },
      { id: "turnier", kurz: "Turnier", titel: "THE CHALLENGE (Turnier)" },
      { id: "rennen", kurz: "Wochenrennen", titel: "Wochenrennen" },
      { id: "boss", kurz: "Boss", titel: "Community-Boss" },
    ] },
  { id: "codes", titel: "Codes",
    icon: GW_SVG('<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>'),
    teile: [
      { id: "codeliste", kurz: "Übersicht", titel: "Alle Codes" },
      { id: "codes", kurz: "Anlegen", titel: "Geheimcodes anlegen" },
    ] },
  { id: "spieler", titel: "Spieler",
    icon: GW_SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    teile: [
      { id: "spieler", kurz: "Verwalten", titel: "Spieler verwalten" },
      { id: "identitaet", kurz: "Identität", titel: "Spieler-Identität" },
    ] },
  { id: "community", titel: "Community",
    icon: GW_SVG('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    teile: [
      { id: "support", kurz: "Support", titel: "Support-Meldungen" },
      { id: "caps", kurz: "Cap-Zusagen", titel: "Cap-Zusagen" },
      { id: "verlosung", kurz: "Verlosung", titel: "Verlosung" },
    ] },
];

const GW_SPEICHER = "fhGatewayMenue";

/* Gewaehlter Bereich + je Bereich der zuletzt offene Teil. */
let gwAktiv = (function () {
  try {
    const roh = JSON.parse(localStorage.getItem(GW_SPEICHER) || "null");
    if (roh && typeof roh.gruppe === "string" && roh.teil && typeof roh.teil === "object") return roh;
  } catch (e) { /* privater Modus o.ae. - dann eben ab Uebersicht */ }
  return { gruppe: "uebersicht", teil: {} };
})();

function gwZeige(gruppeId, teilId) {
  const gruppe = GW_MENUE.find((g) => g.id === gruppeId) || GW_MENUE[0];
  const wunsch = teilId || gwAktiv.teil[gruppe.id];
  const teil = gruppe.teile.find((t) => t.id === wunsch) || gruppe.teile[0];

  gwAktiv.gruppe = gruppe.id;
  gwAktiv.teil[gruppe.id] = teil.id;

  document.querySelectorAll("[data-gw-gruppe]").forEach((b) => {
    b.setAttribute("aria-current", b.dataset.gwGruppe === gruppe.id ? "true" : "false");
  });
  document.querySelectorAll("[data-gw-unter]").forEach((u) => {
    u.hidden = u.dataset.gwUnter !== gruppe.id;
  });
  document.querySelectorAll("[data-gw-teil-knopf]").forEach((b) => {
    b.setAttribute("aria-current", b.dataset.gwTeilKnopf === teil.id ? "true" : "false");
  });
  document.querySelectorAll("[data-gw-teil]").forEach((p) => {
    p.hidden = p.dataset.gwTeil !== teil.id;
  });

  try { localStorage.setItem(GW_SPEICHER, JSON.stringify(gwAktiv)); } catch (e) { /* egal */ }
}

function buildGatewayMenueHtml(inhalte) {
  const gruppen = GW_MENUE.map((g) =>
    `<button type="button" class="gw-gruppe" data-gw-gruppe="${g.id}" aria-current="false" onclick="gwZeige('${g.id}')">${g.icon}<span>${g.titel}</span></button>`
  ).join("");

  const unterReihen = GW_MENUE.filter((g) => g.teile.length > 1).map((g) =>
    `<div class="gw-unter" data-gw-unter="${g.id}" hidden>${g.teile.map((t) =>
      `<button type="button" class="gw-teil-knopf" data-gw-teil-knopf="${t.id}" aria-current="false" onclick="gwZeige('${g.id}', '${t.id}')">${t.kurz}</button>`
    ).join("")}</div>`
  ).join("");

  const teile = GW_MENUE.flatMap((g) => g.teile).map((t) =>
    `<section class="gw-teil" data-gw-teil="${t.id}" hidden>
      <h2 class="gw-teil-titel fh-visually-hidden">${t.titel.replace(/&/g, "&amp;")}</h2>
      ${inhalte[t.id] || ""}
    </section>`
  ).join("");

  return `<nav class="gw-menue" aria-label="Admin-Bereiche">${gruppen}</nav>${unterReihen}${teile}`;
}

async function renderGatewayPage() {
  const container = document.getElementById("gateway-content");
  if (!container) return;

  if (!supabaseClient) {
    container.innerHTML = `<p class="wheel-status">⚠️ Supabase ist nicht verfügbar - das Admin-Gateway benötigt eine Verbindung.</p>`;
    return;
  }

  if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
  const { data: userData } = await supabaseClient.auth.getUser();
  const user = userData ? userData.user : null;

  if (!user || user.is_anonymous) {
    container.innerHTML = `
      <div class="gateway-login-box">
        <p class="gateway-login-lead">Dieser Bereich ist nur für den Betreiber der Website. Melde dich mit deinem autorisierten Google-Account an.</p>
        <button type="button" class="code-button" onclick="loginAdminWithGoogle()">🔐 Mit Google anmelden</button>
        <p id="gateway-login-status" class="wheel-status"></p>
      </div>
    `;
    return;
  }

  if (!isAuthorizedAdmin(user)) {
    const email = getGoogleEmail(user);
    container.innerHTML = `
      <div class="gateway-login-box">
        <p class="gateway-login-lead gateway-denied">❌ Dieser Account (${email}) ist nicht für den Admin-Bereich autorisiert.</p>
        <button type="button" class="code-button" onclick="logoutAdmin()">Abmelden</button>
      </div>
    `;
    return;
  }

  /* Der Betrachter ist jetzt bestaetigter Admin - feature-flags.js
     davon in Kenntnis setzen, damit die Vorschau gegateter
     Funktionen ohne Neuladen erscheint. */
  window.dispatchEvent(new CustomEvent("fhAdminStatusGeaendert"));

  const mainTarget = siteConfig.mainCountdownTarget || FIRE_HELMET_CONFIG.mainCountdownFallback;
  const shipTarget = siteConfig.shipEventUnlockDate || FIRE_HELMET_CONFIG.shipEventUnlockDate;

  const inhalte = {
    uebersicht: `
      <div id="gateway-statusbrett">Lade Zahlen ...</div>
      ${buildGatewayStatusHtml()}`,
    live: buildGatewayLiveSteuerungHtml(),
    storys: buildGatewayStorysHtml(),
    geschenke: buildGatewayLiveGeschenkeHtml(),
    titel: buildGatewayEventTitelHtml(),
    freigaben: buildGatewayFreigabenHtml(),
    countdown: `
      <div class="gateway-form-row">
        <label>Haupt-Countdown Endzeit<br>
          <input type="datetime-local" id="gateway-main-countdown" class="code-input" value="${formatDateForInput(mainTarget)}">
        </label>
        <label>„???“-Freischaltung Endzeit<br>
          <input type="datetime-local" id="gateway-ship-countdown" class="code-input" value="${formatDateForInput(shipTarget)}">
        </label>
      </div>
      <button type="button" class="code-button" onclick="saveGatewayCountdowns()">Countdown speichern</button>
      <p id="gateway-save-status" class="wheel-status"></p>`,
    kapitel: `<div class="gateway-chapter-list">${buildGatewayChapterListHtml()}</div>`,
    band: buildGatewayBandHtml(),
    spielothek: buildGatewaySpielothekHtml(),
    turnier: `<div id="gateway-tournament-sub">Lade Turnierstatus...</div>`,
    rennen: buildGatewayRennenHtml(),
    boss: `<div id="gateway-boss">Lade Boss ...</div>`,
    codeliste: buildGatewayCodeListeHtml(),
    codes: buildGatewayCodesHtml(),
    spieler: buildGatewaySpielerHtml(),
    identitaet: buildGatewayIdentitaetHtml(),
    support: `<div id="gateway-support">Lade Meldungen ...</div>`,
    caps: `<div id="gateway-caps">Lade Caps ...</div>`,
    verlosung: `<div id="gateway-verlosung">Lade Verlosung ...</div>`,
  };

  container.innerHTML = `
    <div class="gateway-panel">
      <p class="gateway-welcome">✅ Angemeldet als ${getGoogleEmail(user)} <button type="button" class="gateway-logout-link" onclick="logoutAdmin()">Abmelden</button></p>
      ${buildGatewayMenueHtml(inhalte)}
    </div>
  `;
  gwZeige(gwAktiv.gruppe);

  ladeGatewayStatusbrett();
  ladeGatewayBoss();
  ladeGatewayCaps();
  ladeGatewaySupport();
  ladeGatewayVerlosung();
  ladeGatewayAngriffMarker();
  gwCodeListeLaden();
  gwStoryLageLaden();

  buildGatewayTournamentHtml().then((html) => {
    const sub = document.getElementById("gateway-tournament-sub");
    if (sub) sub.innerHTML = html;
  });
}

/* ------------------------------------------------------
   THE CHALLENGE (TURNIER) - ADMIN-STEUERUNG
   ---------------------------------------------------
   Bewusst nur die im Auftrag geforderten einfachen Aktionen (starten/
   zuruecksetzen/pausieren/Preis als ausgehaendigt markieren) - die
   eigentliche Zustandslogik (wer wann was darf) steckt bereits
   vollstaendig in den SECURITY DEFINER-Funktionen aus
   07-tournament.sql, hier wird nur tournament-api.js aufgerufen und
   danach das ganze Panel neu gezeichnet (kein eigenes Live-Update-
   Event wie bei siteConfig noetig - Admin-Aktionen hier sind selten).
------------------------------------------------------- */
async function buildGatewayTournamentHtml() {
  if (typeof getOpenTournament !== "function") return "";

  try {
    const [tournament, prize] = await Promise.all([getOpenTournament(), getTournamentPrize()]);

    const prizeHtml = prize
      ? `<p class="gateway-status-sub">🏆 Preis vergeben an <strong>${escapeHtml(prize.winner_nickname)}</strong> (${prize.fulfilled ? "ausgehändigt" : "noch nicht ausgehändigt"})${!prize.fulfilled ? ` <button type="button" class="code-button gateway-inline-btn" onclick="gatewayMarkTournamentPrizeFulfilled()">Als ausgehändigt markieren</button>` : ""}</p>`
      : `<p class="gateway-status-sub">🧢 Preis noch nicht vergeben.</p>`;

    if (!tournament) {
      return `
        ${prizeHtml}
        <p class="gateway-status-sub">Kein aktives Turnier.</p>
        <button type="button" class="code-button" onclick="gatewayCreateTournament()">Neues Turnier erstellen</button>
        <p id="gateway-tournament-status" class="wheel-status"></p>
      `;
    }

    const participants = await getTournamentParticipants(tournament.id);
    const matches = tournament.status === "active" ? await getTournamentMatches(tournament.id) : [];
    const openMatches = matches.filter((m) => m.status === "open").length;

    const actions = [];
    if (tournament.status === "registration") {
      actions.push(`<button type="button" class="code-button" onclick="gatewayStartTournament('${tournament.id}')">Turnier starten (${participants.length} angemeldet)</button>`);
      actions.push(`<button type="button" class="code-button" onclick="gatewayResetTournament('${tournament.id}')">Turnier zurücksetzen</button>`);
    } else {
      actions.push(`<button type="button" class="code-button" onclick="gatewaySetTournamentPaused('${tournament.id}', ${!tournament.paused})">${tournament.paused ? "Fortsetzen" : "Pausieren"}</button>`);
    }
    // Immer verfuegbar, auch waehrend das Turnier laeuft: setzt den
    // Fortschritt zurueck, OHNE die Anmeldungen zu loeschen.
    actions.push(`<button type="button" class="code-button" onclick="gatewayTurnierFortschrittZuruecksetzen('${tournament.id}')">Fortschritt zurücksetzen (Anmeldungen bleiben)</button>`);

    return `
      ${prizeHtml}
      <p class="gateway-status-sub">Turnier <code>${escapeHtml(tournament.id)}</code> - Status: ${escapeHtml(tournament.status)}${tournament.paused ? " (pausiert)" : ""}</p>
      <p class="gateway-status-sub">${participants.length} Teilnehmer${tournament.bracket_size ? `, Bracket-Größe ${tournament.bracket_size}` : ""}${tournament.status === "active" ? `, ${openMatches} offene Matches` : ""}</p>
      ${actions.join(" ")}
      ${buildGatewayTurnierFeinHtml(tournament, matches)}
      <p id="gateway-tournament-status" class="wheel-status"></p>
    `;
  } catch (err) {
    console.error("Turnierstatus für Gateway konnte nicht geladen werden:", err);
    return `<p class="wheel-status">⚠️ Turnierstatus konnte nicht geladen werden.</p>`;
  }
}

async function gatewayCreateTournament() {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminCreateTournament(`t-${Date.now()}`);
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
  }
}

async function gatewayStartTournament(tournamentId) {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminStartTournament(tournamentId);
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
  }
}

async function gatewayResetTournament(tournamentId) {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminResetTournament(tournamentId);
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
  }
}

async function gatewaySetTournamentPaused(tournamentId, paused) {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminSetTournamentPaused(tournamentId, paused);
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
  }
}

/* Setzt ein laufendes Turnier zurueck in die Anmeldephase: alle
   Matches weg, niemand mehr ausgeschieden, die Teilnehmerliste bleibt
   vollstaendig. Ein erneutes "Turnier starten" lost dann neu aus.

   Nicht zu verwechseln mit gatewayResetTournament(): das loescht
   Teilnehmer UND Turnier und geht nur vor dem Start. */
/* ------------------------------------------------------
   TURNIER-FEINSTEUERUNG
   Ein Match von Hand entscheiden laeuft ueber DIESELBE Serverfunktion
   wie ein echtes Spielende - nur so rueckt der Sieger korrekt in die
   naechste Runde vor und der Verlierer wird als ausgeschieden
   markiert. Von Hand an den Tabellen zu schrauben wuerde genau das
   vergessen.
------------------------------------------------------ */
function buildGatewayTurnierFeinHtml(tournament, matches) {
  const offen = (matches || []).filter((m) => m.status === "open");

  const matchListe = offen.length
    ? offen.map((m) => `
        <p class="gateway-status-sub">
          Runde ${m.round}: <strong>${escapeHtml(m.player_1_nickname || "?")}</strong> gegen <strong>${escapeHtml(m.player_2_nickname || "?")}</strong>
          <button type="button" class="code-button gateway-inline-btn" onclick="gatewayMatchEntscheiden(${m.id}, '${escapeHtml(m.player_1_uid || "")}')">${escapeHtml(m.player_1_nickname || "?")} gewinnt</button>
          <button type="button" class="code-button gateway-inline-btn" onclick="gatewayMatchEntscheiden(${m.id}, '${escapeHtml(m.player_2_uid || "")}')">${escapeHtml(m.player_2_nickname || "?")} gewinnt</button>
        </p>`).join("")
    : `<p class="gateway-status-sub">Gerade kein offenes Match.</p>`;

  const anmeldung = tournament.status === "registration";

  return `
    <details class="gateway-details">
      <summary>Feinsteuerung</summary>
      <h3 class="gateway-untertitel">Offene Matches von Hand entscheiden</h3>
      ${matchListe}

      <h3 class="gateway-untertitel">Teilnehmer</h3>
      ${anmeldung ? `
        <div class="gateway-form-row">
          <label>Spieler-ID<br><input type="text" id="gateway-tn-uid" class="code-input" placeholder="UUID" autocomplete="off"></label>
          <label>Name<br><input type="text" id="gateway-tn-name" class="code-input" maxlength="30" autocomplete="off"></label>
        </div>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayTeilnehmerNachtragen('${tournament.id}')">Nachtragen</button>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayTeilnehmerEntfernen('${tournament.id}')">Entfernen</button>
      ` : `<p class="gateway-preview-hint">Nachtragen und Entfernen gehen nur während der Anmeldung — sobald das Turnier läuft, steht der Baum und hätte keinen Platz mehr. Setz es dafür kurz mit „Fortschritt zurücksetzen“ auf Anmeldung.</p>`}
    </details>
  `;
}

async function gatewayMatchEntscheiden(matchId, winnerUid) {
  const statusEl = document.getElementById("gateway-tournament-status");
  if (!winnerUid) return;
  if (!window.confirm("Dieses Match für den gewählten Spieler entscheiden?\n\nDer Gegner scheidet damit aus.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_match_entscheiden", {
      p_match_id: matchId, p_winner_uid: winnerUid,
    });
    if (error) throw error;
    renderGatewayPage();
  } catch (err) {
    console.error("Match entscheiden fehlgeschlagen:", err);
    if (statusEl) statusEl.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayTeilnehmerNachtragen(tournamentId) {
  const statusEl = document.getElementById("gateway-tournament-status");
  const uid = ((document.getElementById("gateway-tn-uid") || {}).value || "").trim();
  const name = ((document.getElementById("gateway-tn-name") || {}).value || "").trim();
  if (!uid || !name) { if (statusEl) statusEl.textContent = "ID und Name eintragen."; return; }
  try {
    const { error } = await supabaseClient.rpc("admin_teilnehmer_nachtragen", {
      p_tournament_id: tournamentId, p_uid: uid, p_nickname: name,
    });
    if (error) throw error;
    renderGatewayPage();
  } catch (err) {
    console.error("Nachtragen fehlgeschlagen:", err);
    if (statusEl) statusEl.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayTeilnehmerEntfernen(tournamentId) {
  const statusEl = document.getElementById("gateway-tournament-status");
  const uid = ((document.getElementById("gateway-tn-uid") || {}).value || "").trim();
  if (!uid) { if (statusEl) statusEl.textContent = "ID eintragen."; return; }
  if (!window.confirm("Diesen Spieler aus dem Turnier nehmen?")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_teilnehmer_entfernen", {
      p_tournament_id: tournamentId, p_uid: uid,
    });
    if (error) throw error;
    renderGatewayPage();
  } catch (err) {
    console.error("Entfernen fehlgeschlagen:", err);
    if (statusEl) statusEl.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayTurnierFortschrittZuruecksetzen(tournamentId) {
  const statusEl = document.getElementById("gateway-tournament-status");
  if (!window.confirm("Turnier-Fortschritt zurücksetzen?\n\nAlle Matches und Ergebnisse werden gelöscht, alle Angemeldeten bleiben eingetragen und sind wieder im Rennen. Danach kannst du neu starten.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_turnier_fortschritt_zuruecksetzen", { p_tournament_id: tournamentId });
    if (error) throw error;
    renderGatewayPage();
  } catch (err) {
    console.error("Turnier-Fortschritt zurücksetzen fehlgeschlagen:", err);
    if (statusEl) statusEl.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayMarkTournamentPrizeFulfilled() {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminMarkPrizeFulfilled();
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
  }
}

/* ------------------------------------------------------
   STATUSBRETT
   Eine einzige Serverabfrage (app.admin_statusbrett) statt zehn -
   das Panel soll beim Oeffnen nicht zehn Rundreisen machen.
------------------------------------------------------ */
async function ladeGatewayStatusbrett() {
  const ziel = document.getElementById("gateway-statusbrett");
  if (!ziel || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.rpc("admin_statusbrett");
    if (error) throw error;

    const kachel = (zahl, text) =>
      `<div class="gateway-kachel"><span class="gateway-kachel-zahl">${escapeHtml(String(zahl))}</span><span class="gateway-kachel-text">${escapeHtml(text)}</span></div>`;

    const b = data.boss || {};
    const r = data.rennen_woche || {};
    const t = data.turnier || {};

    ziel.innerHTML = `
      <div class="gateway-kacheln">
        ${kachel(data.aktiv_24h, "aktiv (24 h)")}
        ${kachel(data.aktiv_7t, "aktiv (7 Tage)")}
        ${kachel(data.spieler_mit_namen, "mit Namen")}
        ${kachel(data.dublonen_gesamt, "Dublonen im Umlauf")}
        ${kachel(data.caps_frei + " / 4", "Caps noch frei")}
        ${kachel(b.hp != null ? b.hp + " / " + b.max_hp : "-", "Boss-HP" + (b.monat ? " (" + b.monat + ")" : ""))}
        ${kachel(r.teilnehmer != null ? r.teilnehmer : "-", "im Rennen" + (r.woche ? " (" + r.woche + ")" : ""))}
        ${kachel(t.teilnehmer != null ? t.teilnehmer : "-", "im Turnier" + (t.status ? " (" + t.status + ")" : ""))}
        ${kachel(t.offene_matches != null ? t.offene_matches : "-", "offene Matches")}
        ${kachel(data.support_offen, "Support-Meldungen")}
        ${kachel(data.gesperrte_namen, "gesperrte Namen")}
      </div>`;
  } catch (err) {
    console.error("Statusbrett konnte nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Statusbrett konnte nicht geladen werden.</p>`;
  }
}

/* ------------------------------------------------------
   SPIELER VERWALTEN
------------------------------------------------------ */
function buildGatewaySpielerHtml() {
  return `
    <div class="gateway-form-row">
      <label>Name oder ID suchen<br>
        <input type="text" id="gateway-spieler-suche" class="code-input" placeholder="z.B. Seebaer" autocomplete="off">
      </label>
    </div>
    <button type="button" class="code-button" onclick="gatewaySpielerSuchen()">Suchen</button>
    <div id="gateway-spieler-treffer"></div>
    <p id="gateway-spieler-status" class="wheel-status"></p>

    <details class="gateway-details">
      <summary>Gesperrte Namen</summary>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayGesperrteNamen()">Liste laden</button>
      <div id="gateway-namen-liste"></div>
    </details>
  `;
}

function gatewaySpielerStatus(text, istFehler) {
  const el = document.getElementById("gateway-spieler-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = istFehler ? "var(--fh-warn, #ff9a76)" : "";
}

async function gatewaySpielerSuchen() {
  const feld = document.getElementById("gateway-spieler-suche");
  const ziel = document.getElementById("gateway-spieler-treffer");
  if (!feld || !ziel || !supabaseClient) return;

  const suche = (feld.value || "").trim();
  if (!suche) return;

  ziel.innerHTML = `<p class="wheel-status">Suche ...</p>`;
  gatewaySpielerStatus("");

  try {
    const { data, error } = await supabaseClient.rpc("admin_spieler_suchen", { p_suche: suche });
    if (error) throw error;
    if (!data || !data.length) {
      ziel.innerHTML = `<p class="wheel-status">Kein Spieler gefunden.</p>`;
      return;
    }
    ziel.innerHTML = data.map(gatewaySpielerKarte).join("");
  } catch (err) {
    console.error("Spielersuche fehlgeschlagen:", err);
    ziel.innerHTML = "";
    gatewaySpielerStatus("Suche fehlgeschlagen: " + (err.message || err), true);
  }
}

/* Ein Kasten je Treffer. Die Felder sind mit dem aktuellen Wert
   vorbelegt - wer nichts aendert, schickt denselben Wert wieder,
   das ist folgenlos. */
function gatewaySpielerKarte(sp) {
  const id = escapeHtml(sp.firebase_uid);
  const marken = [
    sp.im_turnier ? "im Turnier" : "",
    sp.hat_cap ? "hat Cap" : "",
    sp.nickname ? "" : "kein Name",
  ].filter(Boolean).join(" · ");

  return `
    <div class="gateway-spieler-karte" data-uid="${id}">
      <p class="gateway-spieler-kopf">
        <strong>${escapeHtml(sp.nickname || "(ohne Namen)")}</strong>
        ${marken ? `<span class="gateway-spieler-marken">${escapeHtml(marken)}</span>` : ""}
      </p>
      <p class="gateway-status-sub"><code>${id}</code></p>
      <p class="gateway-status-sub">${sp.games_played} Spiele, ${sp.games_won} gewonnen, ${sp.codes_cracked} Codes · zuletzt aktiv ${sp.zuletzt ? escapeHtml(String(sp.zuletzt).slice(0, 16).replace("T", " ")) : "?"}</p>
      <div class="gateway-form-row">
        <label>Dublonen<br><input type="number" min="0" class="code-input" id="gsp-cur-${id}" value="${sp.currency}"></label>
        <label>Erfahrungspunkte<br><input type="number" min="0" class="code-input" id="gsp-xp-${id}" value="${sp.xp}"></label>
        <label>Name<br><input type="text" maxlength="30" class="code-input" id="gsp-nick-${id}" value="${escapeAttr(sp.nickname || "")}"></label>
      </div>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewaySpielerSpeichern('${id}')">Speichern</button>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayNameSperren('${id}')">Namen sperren</button>
    </div>`;
}

async function gatewaySpielerSpeichern(uid) {
  const cur = document.getElementById("gsp-cur-" + uid);
  const xp = document.getElementById("gsp-xp-" + uid);
  const nick = document.getElementById("gsp-nick-" + uid);
  if (!cur || !xp || !nick) return;

  const name = (nick.value || "").trim();
  try {
    const { error } = await supabaseClient.rpc("admin_spieler_setzen", {
      p_uid: uid,
      p_currency: cur.value === "" ? null : Number(cur.value),
      p_xp: xp.value === "" ? null : Number(xp.value),
      // Leer lassen heisst "Name unveraendert" - zum Leeren gibt es
      // bewusst nur "Namen sperren", sonst traegt ihn der Spieler
      // sofort wieder ein.
      p_nickname: name || null,
    });
    if (error) throw error;
    gatewaySpielerStatus("Gespeichert. Die Person sieht es nach dem nächsten Laden.");
  } catch (err) {
    console.error("Speichern fehlgeschlagen:", err);
    gatewaySpielerStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayNameSperren(uid) {
  const grund = window.prompt("Grund für die Sperre (nur für dich, optional):", "");
  if (grund === null) return;   // abgebrochen
  try {
    const { error } = await supabaseClient.rpc("admin_name_sperren", { p_uid: uid, p_grund: grund || null });
    if (error) throw error;
    gatewaySpielerStatus("Name geleert und gesperrt. Der Fortschritt des Kontos bleibt erhalten.");
    gatewaySpielerSuchen();
  } catch (err) {
    console.error("Sperren fehlgeschlagen:", err);
    gatewaySpielerStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayGesperrteNamen() {
  const ziel = document.getElementById("gateway-namen-liste");
  if (!ziel || !supabaseClient) return;
  ziel.innerHTML = `<p class="wheel-status">Lade ...</p>`;
  try {
    const { data, error } = await supabaseClient.rpc("admin_gesperrte_namen");
    if (error) throw error;
    if (!data || !data.length) {
      ziel.innerHTML = `<p class="wheel-status">Kein Name gesperrt.</p>`;
      return;
    }
    ziel.innerHTML = data.map((n) => `
      <p class="gateway-status-sub">
        <code>${escapeHtml(n.name_klein)}</code>
        ${n.grund ? " – " + escapeHtml(n.grund) : ""}
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayNameEntsperren('${escapeHtml(n.name_klein)}')">Entsperren</button>
      </p>`).join("");
  } catch (err) {
    console.error("Namensliste fehlgeschlagen:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Liste konnte nicht geladen werden.</p>`;
  }
}

async function gatewayNameEntsperren(name) {
  try {
    const { error } = await supabaseClient.rpc("admin_name_entsperren", { p_name: name });
    if (error) throw error;
    gatewayGesperrteNamen();
  } catch (err) {
    console.error("Entsperren fehlgeschlagen:", err);
    gatewaySpielerStatus("Entsperren fehlgeschlagen: " + (err.message || err), true);
  }
}

/* ------------------------------------------------------
   ANKUENDIGUNG UND WARTUNGSHINWEIS
   Beides sind nur Felder im site_config-Blob; das Band oben auf der
   Seite zeichnet sich bei jeder Aenderung selbst neu (siehe
   scripts/core/hinweisband.js).
------------------------------------------------------ */
function buildGatewayBandHtml() {
  const a = (typeof siteConfig !== "undefined" && siteConfig.ankuendigung) || "";
  const wt = (typeof siteConfig !== "undefined" && siteConfig.wartungText) || "";
  const w = typeof siteConfig !== "undefined" && siteConfig.wartung === true;

  return `
    <div class="gateway-form-row">
      <label>Ankündigung (leer = kein Band)<br>
        <input type="text" id="gateway-ankuendigung" class="code-input" maxlength="160"
               value="${escapeAttr(a)}" placeholder="z.B. Turnier startet um 20 Uhr">
      </label>
      <label>Wartungstext<br>
        <input type="text" id="gateway-wartung-text" class="code-input" maxlength="160"
               value="${escapeAttr(wt)}" placeholder="Wir bauen gerade um">
      </label>
    </div>
    <label class="gateway-checkbox">
      <input type="checkbox" id="gateway-wartung" ${w ? "checked" : ""}> Wartungshinweis anzeigen
    </label>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayBandSpeichern()">Speichern</button>
    <p class="gateway-preview-hint">Wartung geht der Ankündigung vor. Das Band sperrt niemanden aus — bei einer Seite, deren Code komplett im Browser läuft, wäre eine Sperre ohnehin nur Fassade. Es sagt ehrlich Bescheid, damit niemand eine halb umgebaute Stelle für kaputt hält.</p>
    <p id="gateway-band-status" class="wheel-status"></p>
  `;
}

async function gatewayBandSpeichern() {
  const el = document.getElementById("gateway-band-status");
  try {
    await patchSupabaseSiteConfig({
      ankuendigung: ((document.getElementById("gateway-ankuendigung") || {}).value || "").trim(),
      wartungText: ((document.getElementById("gateway-wartung-text") || {}).value || "").trim(),
      wartung: !!(document.getElementById("gateway-wartung") || {}).checked,
    });
    if (el) el.textContent = "Gespeichert. Das Band oben ändert sich sofort, auch bei geöffneten Browsern.";
  } catch (err) {
    console.error("Band speichern fehlgeschlagen:", err);
    if (el) el.textContent = "⚠️ " + (err.message || err);
  }
}

/* ------------------------------------------------------
   CAP-ZUSAGEN
   Zusage und Zaehler bewegen sich nur gemeinsam, deshalb laeuft beides
   ueber Serverfunktionen und nie ueber die Tabellen direkt.
------------------------------------------------------ */
async function ladeGatewayCaps() {
  const ziel = document.getElementById("gateway-caps");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_caps");
    if (error) throw error;

    const zusagen = data.zusagen || [];
    const liste = zusagen.length
      ? zusagen.map((z) => `
          <p class="gateway-status-sub">
            <strong>${escapeHtml(z.name || "?")}</strong>
            <code>${escapeHtml(z.uid)}</code>
            ${z.wann ? escapeHtml(String(z.wann).slice(0, 10)) : ""}
            <button type="button" class="code-button gateway-inline-btn" onclick="gatewayCapZurueck('${escapeHtml(z.uid)}')">Zurücknehmen</button>
          </p>`).join("")
      : `<p class="gateway-status-sub">Noch keine Cap zugesagt.</p>`;

    ziel.innerHTML = `
      <p class="gateway-status-sub"><strong>${data.vergeben} von ${data.grenze}</strong> Caps vergeben.</p>
      ${liste}
      <div class="gateway-form-row">
        <label>Spieler-ID<br><input type="text" id="gateway-cap-uid" class="code-input" placeholder="UUID" autocomplete="off"></label>
        <label>Name<br><input type="text" id="gateway-cap-name" class="code-input" maxlength="30" autocomplete="off"></label>
      </div>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayCapVergeben()">Cap zusagen</button>
      <p id="gateway-cap-status" class="wheel-status"></p>
    `;
  } catch (err) {
    console.error("Caps konnten nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Cap-Zusagen konnten nicht geladen werden.</p>`;
  }
}

async function gatewayCapVergeben() {
  const el = document.getElementById("gateway-cap-status");
  const uid = ((document.getElementById("gateway-cap-uid") || {}).value || "").trim();
  const name = ((document.getElementById("gateway-cap-name") || {}).value || "").trim();
  if (!uid || !name) { if (el) el.textContent = "ID und Name eintragen."; return; }
  try {
    const { data, error } = await supabaseClient.rpc("admin_cap_vergeben", {
      p_uid: uid, p_nickname: name, p_pass_id: "admin",
    });
    if (error) throw error;
    ladeGatewayCaps();
    ladeGatewayStatusbrett();
    if (el) el.textContent = "Zugesagt. Jetzt " + data + " von 4.";
  } catch (err) {
    console.error("Cap vergeben fehlgeschlagen:", err);
    if (el) el.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayCapZurueck(uid) {
  const grund = window.prompt("Eine Zusage zurückzunehmen ist ein Wortbruch gegenüber der Person — gedacht nur für Fehleinträge.\n\nGrund (kommt ins Protokoll):", "");
  if (grund === null) return;
  try {
    const { error } = await supabaseClient.rpc("admin_cap_zuruecknehmen", { p_uid: uid, p_grund: grund || null });
    if (error) throw error;
    ladeGatewayCaps();
    ladeGatewayStatusbrett();
  } catch (err) {
    console.error("Cap zurücknehmen fehlgeschlagen:", err);
    const el = document.getElementById("gateway-cap-status");
    if (el) el.textContent = "⚠️ " + (err.message || err);
  }
}

/* ------------------------------------------------------
   SUPPORT-MELDUNGEN
   Die Tabelle hat bewusst keine Lese-Policy - was jemand meldet, geht
   andere Besucher nichts an. Bisher kam man nur ueber das
   Supabase-Dashboard heran.
------------------------------------------------------ */
let gatewaySupportNurOffene = true;

async function ladeGatewaySupport() {
  const ziel = document.getElementById("gateway-support");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_support_liste", { p_nur_offene: gatewaySupportNurOffene });
    if (error) throw error;

    const umschalter = `<button type="button" class="code-button gateway-inline-btn" onclick="gatewaySupportUmschalten()">${gatewaySupportNurOffene ? "Auch erledigte zeigen" : "Nur offene zeigen"}</button>`;

    if (!data || !data.length) {
      ziel.innerHTML = `<p class="gateway-status-sub">Keine ${gatewaySupportNurOffene ? "offenen " : ""}Meldungen.</p>${umschalter}`;
      return;
    }

    ziel.innerHTML = umschalter + data.map((m) => `
      <div class="gateway-meldung${m.erledigt ? " ist-erledigt" : ""}">
        <p class="gateway-status-sub">
          <strong>${escapeHtml(m.nickname || "ohne Namen")}</strong>
          ${m.seite ? " · " + escapeHtml(m.seite) : ""}
          · ${escapeHtml(String(m.wann).slice(0, 16).replace("T", " "))}
        </p>
        <p class="gateway-meldung-text">${escapeHtml(m.nachricht)}</p>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewaySupportErledigt(${m.id}, ${!m.erledigt})">${m.erledigt ? "Wieder öffnen" : "Erledigt"}</button>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewaySupportLoeschen(${m.id})">Löschen</button>
      </div>`).join("");
  } catch (err) {
    console.error("Support-Meldungen konnten nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Meldungen konnten nicht geladen werden.</p>`;
  }
}

function gatewaySupportUmschalten() {
  gatewaySupportNurOffene = !gatewaySupportNurOffene;
  ladeGatewaySupport();
}

async function gatewaySupportErledigt(id, erledigt) {
  try {
    const { error } = await supabaseClient.rpc("admin_support_erledigt", { p_id: id, p_erledigt: erledigt });
    if (error) throw error;
    ladeGatewaySupport();
    ladeGatewayStatusbrett();
  } catch (err) {
    console.error("Meldung abhaken fehlgeschlagen:", err);
  }
}

async function gatewaySupportLoeschen(id) {
  if (!window.confirm("Diese Meldung endgültig löschen?")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_support_loeschen", { p_id: id });
    if (error) throw error;
    ladeGatewaySupport();
    ladeGatewayStatusbrett();
  } catch (err) {
    console.error("Meldung löschen fehlgeschlagen:", err);
  }
}

/* ------------------------------------------------------
   VERLOSUNG
   Gezogen wird normalerweise im Browser des ersten Besuchers nach
   Ablauf - mit festem Startwert aus der Runden-ID, damit bei allen
   dasselbe herauskommt. Der Knopf hier zieht stattdessen wirklich
   zufaellig und ueberschreibt ein vorhandenes Ergebnis.
------------------------------------------------------ */
async function ladeGatewayVerlosung() {
  const ziel = document.getElementById("gateway-verlosung");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_verlosung_uebersicht");
    if (error) throw error;

    const runden = data.runden || [];
    const liste = runden.length
      ? runden.map((r) => {
          const g = Array.isArray(r.gezogen) ? r.gezogen : null;
          return `
            <p class="gateway-status-sub">
              <strong>${escapeHtml(r.runde)}</strong> — ${r.lose} Lose
              ${g ? " · gezogen: " + g.map((x) => escapeHtml(x.nickname || x.uid || "?")).join(", ") : " · noch nicht gezogen"}
              <button type="button" class="code-button gateway-inline-btn" onclick="gatewayVerlosungLose('${escapeHtml(r.runde)}')">Lose zeigen</button>
            </p>`;
        }).join("")
      : `<p class="gateway-status-sub">Noch keine Lose abgegeben.</p>`;

    ziel.innerHTML = `
      ${liste}
      <div class="gateway-form-row">
        <label>Runde<br><input type="text" id="gateway-los-runde" class="code-input" placeholder="Runden-ID" autocomplete="off"></label>
        <label>Gewinner<br><input type="number" min="1" max="10" id="gateway-los-anzahl" class="code-input" value="1"></label>
      </div>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayVerlosungZiehen()">Neu ziehen</button>
      <div id="gateway-los-liste"></div>
      <p id="gateway-los-status" class="wheel-status"></p>
    `;
  } catch (err) {
    console.error("Verlosung konnte nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Verlosung konnte nicht geladen werden.</p>`;
  }
}

async function gatewayVerlosungLose(runde) {
  const ziel = document.getElementById("gateway-los-liste");
  const feld = document.getElementById("gateway-los-runde");
  if (feld) feld.value = runde;
  if (!ziel) return;
  ziel.innerHTML = `<p class="wheel-status">Lade ...</p>`;
  try {
    const { data, error } = await supabaseClient.rpc("admin_verlosung_lose", { p_round_id: runde });
    if (error) throw error;
    ziel.innerHTML = (data || []).map((l) => `
      <p class="gateway-status-sub">
        ${escapeHtml(l.nickname || "?")} <code>${escapeHtml(l.firebase_uid)}</code>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayLosEntfernen('${escapeHtml(runde)}', '${escapeHtml(l.firebase_uid)}')">Los entfernen</button>
      </p>`).join("") || `<p class="gateway-status-sub">Keine Lose.</p>`;
  } catch (err) {
    console.error("Lose konnten nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Lose konnten nicht geladen werden.</p>`;
  }
}

async function gatewayVerlosungZiehen() {
  const el = document.getElementById("gateway-los-status");
  const runde = ((document.getElementById("gateway-los-runde") || {}).value || "").trim();
  const anzahl = (document.getElementById("gateway-los-anzahl") || {}).value;
  if (!runde) { if (el) el.textContent = "Runde eintragen."; return; }
  if (!window.confirm("Für " + runde + " neu ziehen?\n\nEin bereits gezogenes Ergebnis wird dabei überschrieben.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_verlosung_ziehen", {
      p_round_id: runde, p_anzahl: Number(anzahl),
    });
    if (error) throw error;
    if (el) el.textContent = "Gezogen: " + (data || []).map((x) => x.nickname).join(", ");
    ladeGatewayVerlosung();
  } catch (err) {
    console.error("Ziehen fehlgeschlagen:", err);
    if (el) el.textContent = "⚠️ " + (err.message || err);
  }
}

async function gatewayLosEntfernen(runde, uid) {
  if (!window.confirm("Dieses Los aus der Verlosung nehmen?")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_verlosung_los_entfernen", { p_round_id: runde, p_uid: uid });
    if (error) throw error;
    gatewayVerlosungLose(runde);
  } catch (err) {
    console.error("Los entfernen fehlgeschlagen:", err);
  }
}

/* ------------------------------------------------------
   COMMUNITY-BOSS STEUERN
------------------------------------------------------ */
function gatewayBossStatus(text, istFehler) {
  const el = document.getElementById("gateway-boss-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = istFehler ? "var(--fh-warn, #ff9a76)" : "";
}

async function ladeGatewayBoss() {
  const ziel = document.getElementById("gateway-boss");
  if (!ziel || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.rpc("admin_boss_uebersicht");
    if (error) throw error;

    const monate = data.monate || [];
    const jetzt = monate[0];
    const top = (data.top || []).slice(0, 5);

    const monatsListe = monate.map((m) =>
      `<p class="gateway-status-sub">${escapeHtml(m.monat)}: ${m.hp} / ${m.max_hp} HP${m.besiegt ? " — besiegt" : ""}</p>`
    ).join("");

    const topListe = top.length
      ? top.map((t, i) => `<p class="gateway-status-sub">${i + 1}. ${escapeHtml(t.name || "?")} — ${t.schaden} Schaden</p>`).join("")
      : `<p class="gateway-status-sub">Noch niemand hat angegriffen.</p>`;

    ziel.innerHTML = `
      ${monatsListe || `<p class="gateway-status-sub">Noch kein Boss angelegt.</p>`}
      ${jetzt ? `
      <div class="gateway-form-row">
        <label>Monat<br><input type="text" id="gateway-boss-monat" class="code-input" value="${escapeHtml(jetzt.monat)}"></label>
        <label>HP<br><input type="number" min="0" id="gateway-boss-hp" class="code-input" value="${jetzt.hp}"></label>
        <label>Obergrenze<br><input type="number" min="1" id="gateway-boss-maxhp" class="code-input" value="${jetzt.max_hp}"></label>
      </div>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayBossSetzen()">Speichern</button>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayBossZuruecksetzen(false)">Auf volle HP</button>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayBossZuruecksetzen(true)">Volle HP + Rangliste leeren</button>
      <p class="gateway-preview-hint">Die Obergrenze ist der Hebel für die Spezialangriffe: mit Treffern bis 400 Schaden fällt ein 5000-HP-Boss in wenigen Tagen. Ändere sie am Monatswechsel, nicht mittendrin.</p>
      ` : ""}

      <h3 class="gateway-untertitel">Stärkste Angreifer</h3>
      ${topListe}

      <div class="gateway-form-row">
        <label>Spieler-ID<br><input type="text" id="gateway-spezial-uid" class="code-input" placeholder="UUID" autocomplete="off"></label>
        <label>Spezialangriff<br><input type="text" id="gateway-spezial-key" class="code-input" placeholder="z.B. fass" autocomplete="off"></label>
      </div>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewaySpezialFreischalten()">Spezialangriff freischalten</button>
      <p id="gateway-boss-status" class="wheel-status"></p>
    `;
  } catch (err) {
    console.error("Boss konnte nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Boss konnte nicht geladen werden.</p>`;
  }
}

async function gatewayBossSetzen() {
  const monat = (document.getElementById("gateway-boss-monat") || {}).value;
  const hp = (document.getElementById("gateway-boss-hp") || {}).value;
  const maxhp = (document.getElementById("gateway-boss-maxhp") || {}).value;
  try {
    const { error } = await supabaseClient.rpc("admin_boss_setzen", {
      p_month_id: monat,
      p_hp: hp === "" ? null : Number(hp),
      p_max_hp: maxhp === "" ? null : Number(maxhp),
    });
    if (error) throw error;
    ladeGatewayBoss();
  } catch (err) {
    console.error("Boss setzen fehlgeschlagen:", err);
    gatewayBossStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayBossZuruecksetzen(schadenLoeschen) {
  const monat = (document.getElementById("gateway-boss-monat") || {}).value;
  if (schadenLoeschen && !window.confirm("Boss auf volle HP setzen UND die Schadensrangliste des Monats löschen?\n\nAlle bisherigen Einträge sind dann weg.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_boss_zuruecksetzen", {
      p_month_id: monat, p_schaden_loeschen: !!schadenLoeschen,
    });
    if (error) throw error;
    ladeGatewayBoss();
  } catch (err) {
    console.error("Boss zurücksetzen fehlgeschlagen:", err);
    gatewayBossStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewaySpezialFreischalten() {
  const uid = ((document.getElementById("gateway-spezial-uid") || {}).value || "").trim();
  const key = ((document.getElementById("gateway-spezial-key") || {}).value || "").trim();
  if (!uid || !key) { gatewayBossStatus("Beide Felder ausfüllen.", true); return; }
  try {
    const { data, error } = await supabaseClient.rpc("admin_spezial_freischalten", { p_uid: uid, p_schluessel: key });
    if (error) throw error;
    gatewayBossStatus("Freigeschaltet. Dieser Spieler hat jetzt: " + (data || []).join(", "));
  } catch (err) {
    console.error("Freischalten fehlgeschlagen:", err);
    gatewayBossStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

/* ------------------------------------------------------
   CODES -> UEBERSICHT
   ---------------------------------------------------
   Alle Codes auf einen Blick: Dublonen-, Boss- und XP-Codes aus
   der Datenbank (admin_codes_uebersicht, 28-code-uebersicht.sql)
   und die Story-Codes aus scripts/codes/codes-data.js.

   WOHER DER KLARTEXT KOMMT
   - Datenbank: seit Migration 28 merkt sich das Panel den Klartext
     beim Anlegen. Aeltere Codes traegt man nach, indem man sie
     eintippt - vorher prueft das Panel selbst, ob der Hash genau zu
     DIESER Zeile passt, damit ein Tippfehler nicht still als
     "passt zu einem anderen Code" durchgeht.
   - codes-data.js: dort steht hinter vielen Hashes der Code als
     Kommentar. Die Datei ist ohnehin oeffentlich; das Panel liest
     sie und nimmt ein Kommentarwort nur, wenn sein Hash stimmt.

   Alles, was aus Datenbank oder Datei kommt, landet per
   textContent im DOM, nie als Markup.
------------------------------------------------------ */
const GW_CODE_ARTEN = {
  dublonen: "Dublonen",
  boss: "Boss",
  xp: "Pass-XP",
  story: "Story",
};

let gwCodeListe = [];
let gwCodeFilter = "alle";

function buildGatewayCodeListeHtml() {
  const chips = [["alle", "Alle"]].concat(Object.entries(GW_CODE_ARTEN)).map(([wert, name]) =>
    `<button type="button" class="gw-teil-knopf" data-gw-code-filter="${wert}" aria-current="${wert === gwCodeFilter}" onclick="gwCodeFilterSetzen('${wert}')">${name}</button>`
  ).join("");
  return `
    <div class="gw-live-nachricht">
      <input type="search" id="gw-code-suche" class="gw-feld gw-feld-breit" placeholder="Suchen: Code, Belohnung, Notiz" aria-label="Codes durchsuchen" autocomplete="off" oninput="gwCodeListeZeichnen()">
      <button type="button" class="gw-live-knopf" onclick="gwCodeListeLaden()">Neu laden</button>
    </div>
    <div class="gw-code-filter" role="group" aria-label="Nach Art filtern">${chips}</div>
    <p id="gw-code-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <div id="gw-code-liste" class="gw-code-liste"></div>
    <p class="gateway-status-sub">Story-Codes werden nicht je Spieler gespeichert – bei ihnen steht deshalb keine Zahl der Einlösungen. Bei Boss-Codes zählt, wer den Angriff freigeschaltet hat.</p>
  `;
}

function gwCodeFilterSetzen(wert) {
  gwCodeFilter = GW_CODE_ARTEN[wert] ? wert : "alle";
  document.querySelectorAll("[data-gw-code-filter]").forEach((b) => {
    b.setAttribute("aria-current", b.dataset.gwCodeFilter === gwCodeFilter ? "true" : "false");
  });
  gwCodeListeZeichnen();
}

/* Wie beim Einloesen: Boss-Codes gross, alle anderen klein. */
function gwCodeNormal(art, code) {
  const sauber = String(code || "").trim();
  return art === "boss" ? sauber.toUpperCase() : sauber.toLowerCase();
}

/* Hash -> Kommentarwort aus codes-data.js, nur wenn der Hash stimmt. */
async function gwCodeKommentareLesen() {
  const treffer = new Map();
  if (typeof sha256Hex !== "function") return treffer;
  try {
    const antwort = await fetch("scripts/codes/codes-data.js", { cache: "no-cache" });
    if (!antwort.ok) return treffer;
    const text = await antwort.text();
    const muster = /hash:\s*"([0-9a-f]{64})"\s*,?\s*\/\/\s*([^\s(]+)/g;
    let m;
    const pruefungen = [];
    while ((m = muster.exec(text))) {
      const hash = m[1];
      const wort = m[2];
      pruefungen.push(sha256Hex(wort.toLowerCase()).then((h) => { if (h === hash) treffer.set(hash, wort); }));
    }
    await Promise.all(pruefungen);
  } catch (e) { /* ohne Datei eben ohne Kommentar-Klartexte */ }
  return treffer;
}

function gwCodeBossName(schluessel) {
  const a = typeof BOSS_SPEZIALANGRIFFE !== "undefined"
    ? BOSS_SPEZIALANGRIFFE.find((x) => x.schluessel === schluessel) : null;
  return a && a.name ? (a.name.de || a.name.en || schluessel) : (schluessel || "?");
}

/* meldung: was nach dem Laden in der Statuszeile stehen soll (z. B.
   "nachgetragen") - sonst steht dort die Anzahl. */
async function gwCodeListeLaden(meldung) {
  const ziel = document.getElementById("gw-code-liste");
  if (!ziel || !supabaseClient) return;
  gwLiveStatus("gw-code-status", "Lade ...", false);
  try {
    const [{ data, error }, kommentare] = await Promise.all([
      supabaseClient.rpc("admin_codes_uebersicht"),
      gwCodeKommentareLesen(),
    ]);
    if (error) throw error;

    const zeilen = (data || []).map((c) => ({
      art: c.art,
      hash: c.code_sha256,
      klartext: c.klartext || (c.art !== "boss" && kommentare.get(c.code_sha256)) || "",
      ausDatei: !c.klartext && c.art !== "boss" && kommentare.has(c.code_sha256),
      belohnung: c.art === "dublonen" ? `${c.wert} Dublonen`
               : c.art === "xp" ? `${c.wert} Pass-XP`
               : `Angriff: ${gwCodeBossName(c.schluessel)}`,
      notiz: c.notiz || "",
      angelegt: c.angelegt ? String(c.angelegt).slice(0, 10) : "",
      einloesungen: typeof c.einloesungen === "number" ? c.einloesungen : null,
    }));
    zeilen.forEach((z) => { z.nachtragbar = !z.klartext; });

    /* Story-Codes: alles aus codes-data.js, was nicht schon als
       Dublonen- oder XP-Code aus der Datenbank kam. */
    const schonDa = new Set(zeilen.map((z) => z.hash));
    if (typeof codes !== "undefined" && Array.isArray(codes)) {
      codes.filter((c) => c && c.hash && !schonDa.has(c.hash)).forEach((c) => {
        const belohnung = c.avatarUnlock ? `Avatar: ${c.avatarUnlock}`
                        : c.reward ? String(c.reward)
                        : c.currencyReward ? `${c.currencyReward} Dublonen`
                        : "Nachricht";
        zeilen.push({
          art: "story",
          hash: c.hash,
          klartext: kommentare.get(c.hash) || "",
          ausDatei: kommentare.has(c.hash),
          belohnung,
          notiz: String(c.message || "").slice(0, 90) + (String(c.message || "").length > 90 ? " …" : ""),
          angelegt: "",
          einloesungen: null,
          nachtragbar: false,
        });
      });
    }

    gwCodeListe = zeilen;
    const ohne = zeilen.filter((z) => !z.klartext).length;
    gwLiveStatus("gw-code-status", typeof meldung === "string" && meldung ? meldung
      : `${zeilen.length} Codes` + (ohne ? `, ${ohne} davon ohne bekannten Klartext` : ""), false);
    gwCodeListeZeichnen();
  } catch (err) {
    console.error("Code-Übersicht fehlgeschlagen:", err);
    gwLiveStatus("gw-code-status", "Übersicht konnte nicht geladen werden: " + ((err && err.message) || err) +
      " – ist Migration 28 eingespielt?", true);
  }
}

function gwCodeZelle(klasse, text) {
  const el = document.createElement("span");
  el.className = klasse;
  el.textContent = text;
  return el;
}

function gwCodeListeZeichnen() {
  const ziel = document.getElementById("gw-code-liste");
  if (!ziel) return;
  const suche = ((document.getElementById("gw-code-suche") || {}).value || "").trim().toLowerCase();
  const sichtbar = gwCodeListe.filter((z) =>
    (gwCodeFilter === "alle" || z.art === gwCodeFilter) &&
    (!suche || [z.klartext, z.belohnung, z.notiz, GW_CODE_ARTEN[z.art]].some((t) => String(t).toLowerCase().includes(suche)))
  );

  ziel.replaceChildren();
  if (!sichtbar.length) {
    ziel.appendChild(gwCodeZelle("gateway-status-sub", gwCodeListe.length ? "Nichts gefunden." : "Noch nichts geladen."));
    return;
  }

  sichtbar.forEach((z) => {
    const karte = document.createElement("div");
    karte.className = "gw-code-zeile";

    const kopf = document.createElement("div");
    kopf.className = "gw-code-kopf";
    kopf.appendChild(gwCodeZelle("gw-code-art ist-" + z.art, GW_CODE_ARTEN[z.art] || z.art));
    if (z.klartext) {
      const code = document.createElement("code");
      code.className = "gw-code-klartext";
      code.textContent = z.klartext;
      kopf.appendChild(code);
      const kopieren = document.createElement("button");
      kopieren.type = "button";
      kopieren.className = "gw-live-knopf gw-code-kopieren";
      kopieren.textContent = "Kopieren";
      kopieren.addEventListener("click", () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(z.klartext).then(
            () => gwLiveStatus("gw-code-status", `„${z.klartext}“ kopiert`, false),
            () => gwLiveStatus("gw-code-status", "Kopieren ging nicht – bitte von Hand markieren.", true));
        }
      });
      kopf.appendChild(kopieren);
    } else {
      kopf.appendChild(gwCodeZelle("gw-code-unbekannt", "Klartext unbekannt · " + z.hash.slice(0, 8) + "…"));
    }
    karte.appendChild(kopf);

    const daten = document.createElement("div");
    daten.className = "gw-code-daten";
    daten.appendChild(gwCodeZelle("gw-code-belohnung", z.belohnung));
    if (z.einloesungen !== null) daten.appendChild(gwCodeZelle("gw-code-meta", z.einloesungen + "× eingelöst"));
    if (z.angelegt) daten.appendChild(gwCodeZelle("gw-code-meta", "angelegt " + z.angelegt));
    if (z.ausDatei) daten.appendChild(gwCodeZelle("gw-code-meta", "Klartext aus codes-data.js"));
    karte.appendChild(daten);

    if (z.notiz) karte.appendChild(gwCodeZelle("gw-code-notiz", z.notiz));

    if (z.nachtragbar && z.art !== "story") {
      const reihe = document.createElement("div");
      reihe.className = "gw-code-nachtragen";
      const feld = document.createElement("input");
      feld.type = "text";
      feld.className = "gw-feld";
      feld.autocomplete = "off";
      feld.placeholder = "Code eintippen";
      feld.setAttribute("aria-label", "Klartext nachtragen");
      const knopf = document.createElement("button");
      knopf.type = "button";
      knopf.className = "gw-live-knopf";
      knopf.textContent = "Nachtragen";
      const los = () => gwCodeNachtragen(z, feld.value);
      knopf.addEventListener("click", los);
      feld.addEventListener("keydown", (e) => { if (e.key === "Enter") los(); });
      reihe.append(feld, knopf);
      karte.appendChild(reihe);
    }

    ziel.appendChild(karte);
  });
}

/* Den Klartext in der Datenbank merken. Liefert true/false, wirft nie -
   beim Anlegen soll ein Fehler hier den eigentlichen Code nicht
   rueckgaengig aussehen lassen. */
async function gwCodeKlartextMerken(art, code) {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient.rpc("admin_code_klartext_merken", { p_art: art, p_code: code });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.warn("Klartext merken fehlgeschlagen:", err);
    return false;
  }
}

async function gwCodeNachtragen(zeile, eingabe) {
  const code = String(eingabe || "").trim();
  if (!code) { gwLiveStatus("gw-code-status", "Erst den Code eintippen.", true); return; }
  if (typeof sha256Hex === "function") {
    const hash = await sha256Hex(gwCodeNormal(zeile.art, code));
    if (hash !== zeile.hash) {
      gwLiveStatus("gw-code-status", `„${code}“ ist nicht der Code dieser Zeile.`, true);
      return;
    }
  }
  const ok = await gwCodeKlartextMerken(zeile.art, code);
  if (!ok) { gwLiveStatus("gw-code-status", "Nachtragen fehlgeschlagen.", true); return; }
  gwCodeListeLaden(`✓ „${code}“ nachgetragen`);
}

/* ------------------------------------------------------
   GEHEIMCODES ANLEGEN
   Geprueft wird beim Einloesen nur der SHA-256. Den Klartext merkt
   sich seit 28-code-uebersicht.sql eine Tabelle, die nur du lesen
   kannst - direkt nach dem Anlegen, ueber einen zweiten Aufruf.
   Die Liste dazu steht unter "Codes -> Uebersicht".
------------------------------------------------------ */
function buildGatewayCodesHtml() {
  return `
    <div class="gateway-form-row">
      <label>Neuer Dublonen-Code<br><input type="text" id="gateway-code-neu" class="code-input" placeholder="z.B. SOMMER2026" autocomplete="off"></label>
      <label>Dublonen<br><input type="number" min="1" max="5000" id="gateway-code-betrag" class="code-input" value="100"></label>
      <label>Notiz<br><input type="text" id="gateway-code-notiz" class="code-input" placeholder="wofür?" autocomplete="off"></label>
    </div>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayCodeSetzen()">Code anlegen</button>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayCodeLoeschen()">Code löschen</button>

    <div class="gateway-form-row">
      <label>Boss-Geheimcode<br><input type="text" id="gateway-bosscode-neu" class="code-input" placeholder="z.B. KRAKEN99" autocomplete="off"></label>
      <label>Spezialangriff<br>${buildGatewayAngriffAuswahlHtml()}</label>
    </div>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayBossCodeSetzen()">Boss-Code anlegen</button>

    <p id="gateway-codes-status" class="wheel-status"></p>
    <p class="gateway-preview-hint">Neue Codes erscheinen mit Klartext unter <button type="button" class="gateway-logout-link" onclick="gwZeige('codes', 'codeliste')">Codes → Übersicht</button>. Den Klartext siehst nur du; beim Einlösen zählt weiter nur der Hash.</p>
  `;
}

function gatewayCodesStatus(text, istFehler) {
  const el = document.getElementById("gateway-codes-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = istFehler ? "var(--fh-warn, #ff9a76)" : "";
}

async function gatewayCodeSetzen() {
  const code = ((document.getElementById("gateway-code-neu") || {}).value || "").trim();
  const betrag = (document.getElementById("gateway-code-betrag") || {}).value;
  const notiz = ((document.getElementById("gateway-code-notiz") || {}).value || "").trim();
  if (!code) { gatewayCodesStatus("Code eintragen.", true); return; }
  try {
    const { error } = await supabaseClient.rpc("admin_code_setzen", {
      p_code: code, p_betrag: Number(betrag), p_bemerkung: notiz || null,
    });
    if (error) throw error;
    const gemerkt = await gwCodeKlartextMerken("dublonen", code);
    gatewayCodesStatus(`Code „${code}“ gibt jetzt ${betrag} Dublonen.` +
      (gemerkt ? " Er steht in der Übersicht." : " Der Klartext ließ sich nicht merken – schreib ihn dir auf oder trag ihn in der Übersicht nach."));
    gatewayCodesLaden();
  } catch (err) {
    console.error("Code anlegen fehlgeschlagen:", err);
    gatewayCodesStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayCodeLoeschen() {
  const code = ((document.getElementById("gateway-code-neu") || {}).value || "").trim();
  if (!code) { gatewayCodesStatus("Zu löschenden Code oben eintragen.", true); return; }
  try {
    const { data, error } = await supabaseClient.rpc("admin_code_loeschen", { p_code: code });
    if (error) throw error;
    gatewayCodesStatus(data ? `Code „${code}“ gelöscht.` : `Zu „${code}“ gab es keinen Eintrag.`, !data);
    gatewayCodesLaden();
  } catch (err) {
    console.error("Code löschen fehlgeschlagen:", err);
    gatewayCodesStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

/* ------------------------------------------------------
   AUSWAHLLISTE DER SPEZIALANGRIFFE
   ---------------------------------------------------
   Vorher stand hier ein Freitextfeld mit dem Platzhalter "z.B.
   fass". Der Schluessel musste also zeichengenau von Hand getippt
   werden - und ein Tippfehler faellt nicht auf: die Datenbank lehnt
   ihn zwar ab ("kein-spezialangriff"), aber man muss erst raten,
   wie der Angriff intern heisst. "Das Fass, das niemand oeffnen
   sollte" heisst intern "fass", "Kraken-Katapult" heisst
   "katapult". Das kann niemand wissen, der es nicht nachschlaegt.

   Die Liste kommt aus BOSS_SPEZIALANGRIFFE (boss-attacks-data.js) -
   derselben Quelle, aus der auch die Spielseite ihre Namen nimmt.
   Kommt dort ein Angriff dazu, steht er hier automatisch mit drin.
------------------------------------------------------ */
function buildGatewayAngriffAuswahlHtml() {
  if (typeof BOSS_SPEZIALANGRIFFE === "undefined" || !BOSS_SPEZIALANGRIFFE.length) {
    /* Rueckfall auf das alte Freitextfeld, falls die Angriffsdatei
       nicht geladen ist - lieber tippen als gar nichts. */
    return `<input type="text" id="gateway-bosscode-key" class="code-input"
                   placeholder="z.B. fass" autocomplete="off">`;
  }

  const zeilen = BOSS_SPEZIALANGRIFFE.map((a) => {
    const name = (a.name && (a.name.de || a.name.en)) || a.schluessel;
    return `<option value="${escapeHtml(a.schluessel)}">${escapeHtml(name)}</option>`;
  }).join("");

  return `<select id="gateway-bosscode-key" class="code-input">
            <option value="">— Angriff wählen —</option>
            ${zeilen}
          </select>`;
}

/* Hinter jeden Angriff schreiben, ob er schon einen Code hat.
   Braucht app.admin_boss_codes_fehlen() aus 17-boss-code-schutz.sql;
   fehlt die Migration noch, bleibt die Liste einfach ohne Marker. */
async function ladeGatewayAngriffMarker() {
  const feld = document.getElementById("gateway-bosscode-key");
  if (!feld || feld.tagName !== "SELECT" || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.rpc("admin_boss_codes_fehlen");
    if (error) throw error;

    const hatCode = {};
    (data || []).forEach((z) => { hatCode[z.schluessel] = z.hat_code; });

    Array.from(feld.options).forEach((opt) => {
      if (!opt.value) return;
      const roh = opt.getAttribute("data-name") || opt.textContent;
      opt.setAttribute("data-name", roh.replace(/\s*[·✓].*$/, "").trim());
      const basis = opt.getAttribute("data-name");
      opt.textContent = hatCode[opt.value] === true  ? `${basis} · ✓ hat Code`
                      : hatCode[opt.value] === false ? `${basis} · noch ohne Code`
                      : basis;
    });
  } catch (err) {
    /* Migration 17 noch nicht eingespielt oder kein Netz - die
       Auswahl funktioniert auch ohne Marker. */
  }
}

async function gatewayBossCodeSetzen() {
  const code = ((document.getElementById("gateway-bosscode-neu") || {}).value || "").trim();
  const key = ((document.getElementById("gateway-bosscode-key") || {}).value || "").trim();
  if (!code || !key) { gatewayCodesStatus("Code eintragen und Spezialangriff auswählen.", true); return; }
  try {
    const { error } = await supabaseClient.rpc("admin_boss_code_setzen", {
      p_code: code, p_schluessel: key, p_bemerkung: null,
    });
    if (error) throw error;

    /* Den lesbaren Namen melden, nicht den internen Schluessel -
       "fass" sagt niemandem etwas. */
    const gewaehlt = typeof BOSS_SPEZIALANGRIFFE !== "undefined"
      ? BOSS_SPEZIALANGRIFFE.find((a) => a.schluessel === key) : null;
    const name = gewaehlt && gewaehlt.name ? (gewaehlt.name.de || gewaehlt.name.en) : key;

    const gemerkt = await gwCodeKlartextMerken("boss", code);
    gatewayCodesStatus(`Boss-Code „${code}“ schaltet jetzt „${name}“ frei.` +
      (gemerkt ? " Er steht in der Übersicht." : " Der Klartext ließ sich nicht merken – schreib ihn dir auf oder trag ihn in der Übersicht nach."));
    gatewayCodesLaden();
    ladeGatewayAngriffMarker();
  } catch (err) {
    console.error("Boss-Code anlegen fehlgeschlagen:", err);
    gatewayCodesStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

/* Frueher eine eigene Liste mit Hash-Kennungen - jetzt frischt es
   einfach die Uebersicht auf. */
function gatewayCodesLaden() {
  gwCodeListeLaden();
}

/* ------------------------------------------------------
   WOCHENRENNEN
------------------------------------------------------ */
function buildGatewayRennenHtml() {
  return `
    <div class="gateway-form-row">
      <label>Woche (leer = die aktuelle)<br><input type="text" id="gateway-rennen-woche" class="code-input" placeholder="2026-W37" autocomplete="off"></label>
    </div>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayRennenLaden()">Rangliste laden</button>
    <button type="button" class="code-button gateway-inline-btn" onclick="gatewayRennenWocheLeeren()">Ganze Woche leeren</button>
    <div id="gateway-rennen-liste"></div>
    <p id="gateway-rennen-status" class="wheel-status"></p>
  `;
}

function gatewayRennenStatus(text, istFehler) {
  const el = document.getElementById("gateway-rennen-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = istFehler ? "var(--fh-warn, #ff9a76)" : "";
}

let gatewayRennenAktuelleWoche = null;

async function gatewayRennenLaden() {
  const ziel = document.getElementById("gateway-rennen-liste");
  const woche = ((document.getElementById("gateway-rennen-woche") || {}).value || "").trim();
  if (!ziel || !supabaseClient) return;
  ziel.innerHTML = `<p class="wheel-status">Lade ...</p>`;
  try {
    const { data, error } = await supabaseClient.rpc("admin_rennen_woche", { p_week: woche || null });
    if (error) throw error;
    if (!data || !data.length) { ziel.innerHTML = `<p class="wheel-status">Für diese Woche gibt es keine Einträge.</p>`; return; }

    gatewayRennenAktuelleWoche = data[0].week;
    const feld = document.getElementById("gateway-rennen-woche");
    if (feld && !feld.value) feld.value = data[0].week;

    ziel.innerHTML = data.map((r) => `
      <p class="gateway-status-sub gateway-rennen-zeile">
        <strong>${escapeHtml(r.nickname || "?")}</strong>
        <input type="number" min="0" class="code-input gateway-mini-input" id="grn-${escapeHtml(r.firebase_uid)}" value="${r.progress}">
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayRennenSetzen('${escapeHtml(r.firebase_uid)}')">Setzen</button>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayRennenLoeschen('${escapeHtml(r.firebase_uid)}')">Löschen</button>
      </p>`).join("");
  } catch (err) {
    console.error("Rennrangliste fehlgeschlagen:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Rangliste konnte nicht geladen werden.</p>`;
  }
}

async function gatewayRennenSetzen(uid) {
  const feld = document.getElementById("grn-" + uid);
  if (!feld || !gatewayRennenAktuelleWoche) return;
  try {
    const { error } = await supabaseClient.rpc("admin_rennen_setzen", {
      p_week: gatewayRennenAktuelleWoche, p_uid: uid, p_progress: Number(feld.value),
    });
    if (error) throw error;
    gatewayRennenStatus("Gesetzt.");
  } catch (err) {
    console.error("Rennpunkte setzen fehlgeschlagen:", err);
    gatewayRennenStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayRennenLoeschen(uid) {
  if (!gatewayRennenAktuelleWoche) return;
  if (!window.confirm("Diesen Eintrag aus der Wochenrangliste löschen?")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_rennen_eintrag_loeschen", {
      p_week: gatewayRennenAktuelleWoche, p_uid: uid,
    });
    if (error) throw error;
    gatewayRennenLaden();
  } catch (err) {
    console.error("Eintrag löschen fehlgeschlagen:", err);
    gatewayRennenStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayRennenWocheLeeren() {
  const woche = ((document.getElementById("gateway-rennen-woche") || {}).value || "").trim();
  if (!woche) { gatewayRennenStatus("Woche eintragen — bewusst keine Vorbelegung, damit nicht versehentlich die falsche erwischt wird.", true); return; }
  if (!window.confirm("Die komplette Rangliste der Woche " + woche + " löschen?")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_rennen_woche_leeren", { p_week: woche });
    if (error) throw error;
    gatewayRennenStatus(data + " Einträge gelöscht.");
    gatewayRennenLaden();
  } catch (err) {
    console.error("Woche leeren fehlgeschlagen:", err);
    gatewayRennenStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

/* ------------------------------------------------------
   SPIELER-IDENTITAET UMHAENGEN
   ---------------------------------------------------
   WOFUER: Die Anmeldung ist ein anonymes Supabase-Konto, das nur im
   Browserspeicher lebt. Raeumt der Browser ihn weg (Safari/iOS nach
   7 Tagen, privates Fenster, anderes Geraet), bekommt dieselbe
   Person eine NEUE ID - ihre Dublonen, ihr Level und eine laufende
   Turnier-Anmeldung haengen aber an der alten.

   Normalerweise loest der Spieler das selbst mit seinem
   Wiederherstellungs-Kennwort (scripts/core/spieler-kennwort.js).
   Diese Werkzeuge hier sind fuer den Fall, dass auch das Kennwort
   weg ist - dann bist DU die Identitaetspruefung (Stream, Discord),
   nicht die Datenbank.

   Die eigentliche Arbeit macht der Server (SECURITY DEFINER +
   app.is_admin()), siehe supabase/game-migration/12-spieler-kennwort.sql.
------------------------------------------------------ */
function buildGatewayIdentitaetHtml() {
  return `
    <p class="gateway-preview-hint">Ein Spieler kommt nicht mehr an sein Konto? Erst den Namen suchen, dann die alte auf die neue ID umhängen.</p>

    <div class="gateway-form-row">
      <label>Name suchen<br>
        <input type="text" id="gateway-ident-name" class="code-input" placeholder="z.B. 2201dn" autocomplete="off">
      </label>
    </div>
    <button type="button" class="code-button" onclick="gatewayKontenSuchen()">Konten anzeigen</button>
    <div id="gateway-ident-treffer"></div>

    <div class="gateway-form-row">
      <label>Alte ID<br>
        <input type="text" id="gateway-ident-alt" class="code-input" placeholder="alte UUID" autocomplete="off">
      </label>
      <label>Neue ID<br>
        <input type="text" id="gateway-ident-neu" class="code-input" placeholder="neue UUID" autocomplete="off">
      </label>
    </div>
    <button type="button" class="code-button" onclick="gatewayTeilnehmerUmhaengen()">Nur im laufenden Turnier umhängen</button>
    <button type="button" class="code-button" onclick="gatewayIdentitaetUmhaengen()">Ganzes Konto umhängen</button>
    <p class="gateway-preview-hint">„Ganzes Konto“ nimmt Dublonen, Level, Schiff und Turnier mit — und <strong>ersetzt dabei das neue Konto vollständig</strong>. Alles, was auf der neuen ID schon gespielt wurde, ist danach weg.</p>
    <p id="gateway-ident-status" class="wheel-status"></p>
  `;
}

function gatewayIdentStatus(text, istFehler) {
  const el = document.getElementById("gateway-ident-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = istFehler ? "var(--fh-warn, #ff9a76)" : "";
}

async function gatewayKontenSuchen() {
  const feld = document.getElementById("gateway-ident-name");
  const treffer = document.getElementById("gateway-ident-treffer");
  if (!feld || !treffer || !supabaseClient) return;

  const name = (feld.value || "").trim();
  if (!name) return;

  treffer.innerHTML = "<p class=\"wheel-status\">Suche ...</p>";
  gatewayIdentStatus("");

  try {
    const { data, error } = await supabaseClient.rpc("admin_konten_zu_name", { p_name: name });
    if (error) throw error;
    if (!data || !data.length) {
      treffer.innerHTML = "<p class=\"wheel-status\">Kein Konto unter diesem Namen.</p>";
      return;
    }

    // Neuestes zuerst - das ist in aller Regel das, in dem die Person
    // gerade sitzt; das mit "im Turnier" ist das, an dem die Anmeldung haengt.
    const zeilen = data.map((k, i) => `
      <tr>
        <td>${i === 0 ? "neuestes" : ""}</td>
        <td><code>${escapeHtml(k.firebase_uid)}</code></td>
        <td>${k.angelegt ? escapeHtml(String(k.angelegt).slice(0, 16).replace("T", " ")) : "?"}</td>
        <td>${k.currency} 🪙</td>
        <td>${k.im_turnier ? "im Turnier" : ""}</td>
      </tr>`).join("");

    treffer.innerHTML = `
      <table class="gateway-ident-tabelle">
        <thead><tr><th></th><th>ID</th><th>angelegt</th><th>Dublonen</th><th></th></tr></thead>
        <tbody>${zeilen}</tbody>
      </table>`;
  } catch (err) {
    console.error("Kontensuche fehlgeschlagen:", err);
    treffer.innerHTML = "";
    gatewayIdentStatus("Suche fehlgeschlagen: " + (err.message || err), true);
  }
}

function gatewayIdentPaar() {
  const alt = (document.getElementById("gateway-ident-alt") || {}).value || "";
  const neu = (document.getElementById("gateway-ident-neu") || {}).value || "";
  return { alt: alt.trim(), neu: neu.trim() };
}

async function gatewayTeilnehmerUmhaengen() {
  const { alt, neu } = gatewayIdentPaar();
  if (!alt || !neu) { gatewayIdentStatus("Beide IDs eintragen.", true); return; }

  try {
    const turnier = await getOpenTournament();
    if (!turnier) { gatewayIdentStatus("Gerade läuft kein Turnier.", true); return; }
    const { error } = await supabaseClient.rpc("admin_teilnehmer_umhaengen", {
      p_tournament_id: turnier.id, p_alt: alt, p_neu: neu,
    });
    if (error) throw error;
    gatewayIdentStatus("Turnier-Anmeldung umgehängt. Die Person soll die Seite neu laden.");
  } catch (err) {
    console.error("Umhängen fehlgeschlagen:", err);
    gatewayIdentStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

async function gatewayIdentitaetUmhaengen() {
  const { alt, neu } = gatewayIdentPaar();
  if (!alt || !neu) { gatewayIdentStatus("Beide IDs eintragen.", true); return; }
  if (!window.confirm("Das ganze Konto " + alt + " auf " + neu + " umhängen?\n\nAlles, was auf " + neu + " schon gespielt wurde, geht dabei verloren.")) return;

  try {
    const { error } = await supabaseClient.rpc("admin_identitaet_umhaengen", { p_alt: alt, p_neu: neu });
    if (error) throw error;
    gatewayIdentStatus("Konto umgehängt. Die Person soll die Seite neu laden.");
  } catch (err) {
    console.error("Umhängen fehlgeschlagen:", err);
    gatewayIdentStatus("Fehlgeschlagen: " + (err.message || err), true);
  }
}

function updateGatewayPage(pageID) {
  if (pageID !== "gateway") return;
  renderGatewayPage();
}

window.addEventListener("siteConfigUpdated", () => {
  if (document.getElementById("gateway")?.classList.contains("active-page")) {
    renderGatewayPage();
  }
});
