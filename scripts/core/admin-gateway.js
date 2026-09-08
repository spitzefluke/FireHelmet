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

      <h2 class="fh-ship-section-heading">Statusbrett</h2>
      <div id="gateway-statusbrett">Lade Zahlen ...</div>

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

      <h2 class="fh-ship-section-heading">Spieler verwalten</h2>
      ${buildGatewaySpielerHtml()}

      <h2 class="fh-ship-section-heading">Spieler-Identität</h2>
      ${buildGatewayIdentitaetHtml()}

      <h2 class="fh-ship-section-heading">Vorschau</h2>
      <p class="gateway-preview-hint">So sieht die normale Website gerade aus (aktualisiert sich live mit deinen Änderungen):</p>
      <iframe class="gateway-preview-frame" src="index.html" title="Vorschau"></iframe>
    </div>
  `;

  ladeGatewayStatusbrett();

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
    // Immer verfuegbar, auch waehrend das Turnier laeuft: setzt den
    // Fortschritt zurueck, OHNE die Anmeldungen zu loeschen.
    actions.push(`<button type="button" class="code-button" onclick="gatewayTurnierFortschrittZuruecksetzen('${tournament.id}')">Fortschritt zurücksetzen (Anmeldungen bleiben)</button>`);

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

/* Setzt ein laufendes Turnier zurueck in die Anmeldephase: alle
   Matches weg, niemand mehr ausgeschieden, die Teilnehmerliste bleibt
   vollstaendig. Ein erneutes "Turnier starten" lost dann neu aus.

   Nicht zu verwechseln mit gatewayResetTournament(): das loescht
   Teilnehmer UND Turnier und geht nur vor dem Start. */
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
        <label>Name<br><input type="text" maxlength="30" class="code-input" id="gsp-nick-${id}" value="${escapeHtml(sp.nickname || "")}"></label>
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
