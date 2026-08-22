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
    // Neuzeichnen des gesamten Panels aus (für die Live-Vorschau) -
    // das würde die Meldung hier sonst augenblicklich wieder
    // überschreiben, bevor sie sichtbar wird.
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
  // Dieses Datum steuert nur noch die "???"-Seite (siehe scripts/
  // streamraetsel/streamraetsel.js) - die Schiffsreparatur haengt davon
  // NICHT mehr ab (eigener Reparatur-Countdown pro Phase, siehe
  // scripts/ship/ship-repair.js).
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

async function buildGatewayShipStatusHtml() {
  // Die Schiffsreparatur ist seit der Personalisierung PRO SPIELER
  // (ship_repair/{uid}, siehe scripts/ship/ship-repair.js) - es gibt
  // dadurch keinen einzelnen "globalen" Fortschritt mehr, den man hier
  // sinnvoll anzeigen könnte, ohne die Reparaturdaten aller Spieler
  // aufzulisten (was die Security Rules bewusst nicht erlauben).
  return `<p class="gateway-status-sub">Reparaturfortschritt ist jetzt pro Spieler persönlich - kein globaler Wert mehr.</p>`;
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

/* ------------------------------------------------------
   SCHIFFSREPARATUR <-> STORY-VERKNUEPFUNG
   Welches Kapitel (falls ueberhaupt eins) automatisch entsperrt
   wird, sobald das Schiff fertig repariert ist - siehe
   maybeUnlockChapterAfterShipRepair() in ship-repair.js.
------------------------------------------------------ */
function buildGatewayShipUnlockSelectHtml() {
  const groups = getChapterGroupsForGateway();
  const current = Array.isArray(siteConfig.shipRepairUnlockChapterIds) ? siteConfig.shipRepairUnlockChapterIds : [];
  const currentGroup = groups.find((g) => g.ids.some((id) => current.includes(id)));

  const options = groups
    .map((g) => `<option value="${g.key}" ${currentGroup && currentGroup.key === g.key ? "selected" : ""}>${g.displayTitle} (${g.storyTitle})</option>`)
    .join("");

  return `
    <label class="gateway-form-row">
      <span>Kapitel nach abgeschlossener Schiffsreparatur automatisch freischalten:</span><br>
      <select id="gateway-ship-unlock-chapter" class="code-input" onchange="saveGatewayShipUnlockChapter(this.value)">
        <option value="">- keins -</option>
        ${options}
      </select>
    </label>
  `;
}

async function saveGatewayShipUnlockChapter(groupKey) {
  if (!supabaseClient) return;
  const group = getChapterGroupsForGateway().find((g) => g.key === groupKey);
  try {
    await patchSupabaseSiteConfig({ shipRepairUnlockChapterIds: group ? group.ids : [] });
  } catch (err) {
    console.error("Konnte nicht gespeichert werden:", err);
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

  const mainTarget = siteConfig.mainCountdownTarget || FIRE_HELMET_CONFIG.mainCountdownFallback;
  const shipTarget = siteConfig.shipEventUnlockDate || FIRE_HELMET_CONFIG.shipEventUnlockDate;

  container.innerHTML = `
    <div class="gateway-panel">
      <p class="gateway-welcome">✅ Angemeldet als ${getGoogleEmail(user)} <button type="button" class="gateway-logout-link" onclick="logoutAdmin()">Abmelden</button></p>

      <h2 class="fh-ship-section-heading">Status</h2>
      ${buildGatewayStatusHtml()}
      <div id="gateway-ship-status-sub"></div>

      <h2 class="fh-ship-section-heading">Countdown</h2>
      <div class="gateway-form-row">
        <label>Haupt-Countdown Endzeit<br>
          <input type="datetime-local" id="gateway-main-countdown" class="code-input" value="${formatDateForInput(mainTarget)}">
        </label>
        <label>„???“-Freischaltung Endzeit<br>
          <input type="datetime-local" id="gateway-ship-countdown" class="code-input" value="${formatDateForInput(shipTarget)}">
        </label>
      </div>
      <button type="button" class="code-button" onclick="saveGatewayCountdowns()">Countdown speichern</button>
      <p id="gateway-save-status" class="wheel-status"></p>

      <h2 class="fh-ship-section-heading">Kapitel aktivieren/deaktivieren</h2>
      <div class="gateway-chapter-list">${buildGatewayChapterListHtml()}</div>
      ${buildGatewayShipUnlockSelectHtml()}

      <h2 class="fh-ship-section-heading">Ändiis Spielothek</h2>
      ${buildGatewaySpielothekHtml()}

      <h2 class="fh-ship-section-heading">THE CHALLENGE (Turnier)</h2>
      <div id="gateway-tournament-sub">Lade Turnierstatus...</div>

      <h2 class="fh-ship-section-heading">Vorschau</h2>
      <p class="gateway-preview-hint">So sieht die normale Website gerade aus (aktualisiert sich live mit deinen Änderungen):</p>
      <iframe class="gateway-preview-frame" src="index.html" title="Vorschau"></iframe>
    </div>
  `;

  buildGatewayShipStatusHtml().then((html) => {
    const sub = document.getElementById("gateway-ship-status-sub");
    if (sub) sub.innerHTML = html;
  });

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

    return `
      ${prizeHtml}
      <p class="gateway-status-sub">Turnier <code>${escapeHtml(tournament.id)}</code> - Status: ${escapeHtml(tournament.status)}${tournament.paused ? " (pausiert)" : ""}</p>
      <p class="gateway-status-sub">${participants.length} Teilnehmer${tournament.bracket_size ? `, Bracket-Größe ${tournament.bracket_size}` : ""}${tournament.status === "active" ? `, ${openMatches} offene Matches` : ""}</p>
      ${actions.join(" ")}
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

async function gatewayMarkTournamentPrizeFulfilled() {
  const statusEl = document.getElementById("gateway-tournament-status");
  try {
    await adminMarkPrizeFulfilled();
    renderGatewayPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = "⚠️ " + (err && err.message);
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
