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

/* getGoogleEmail() und isAuthorizedAdmin() stehen in
   scripts/core/admin-zugang.js - die braucht die Seite auch, bevor
   diese Datei nachgeladen ist (siehe scripts/core/nachladen.js). */

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

/* ------------------------------------------------------
   SEITEN EIN-/AUSSCHALTEN (scripts/core/seiten-sperre.js)
   Die Liste kommt aus der Navigation selbst - jede neue Seite mit
   Nav-Eintrag taucht hier von allein auf. Start, Gateway, Impressum
   und Datenschutz lassen sich nicht abschalten. Abgeschaltete Seiten
   siehst nur du (gedimmt, roter Punkt).
------------------------------------------------------ */
function gwSeitenListe() {
  const nie = window.fhSeitenNieAus || ["home", "gateway", "impressum", "datenschutz"];
  const gesehen = new Set();
  const liste = [];
  document.querySelectorAll(".fh-sidebar-nav .fh-nav-item[data-page]").forEach((a) => {
    const id = a.getAttribute("data-page");
    if (!id || gesehen.has(id) || nie.includes(id) || !document.getElementById(id)) return;
    gesehen.add(id);
    const name = (a.querySelector(".fh-nav-label")?.textContent || id).trim();
    liste.push({ id, name });
  });
  return liste;
}

function buildGatewaySeitenHtml() {
  const aus = Array.isArray(siteConfig.disabledPageIds) ? siteConfig.disabledPageIds : [];
  const seiten = gwSeitenListe();
  const anzahlAus = seiten.filter((s) => aus.includes(s.id)).length;
  const zeilen = seiten
    .map((s) => `
        <label class="gateway-chapter-row">
          <input type="checkbox" ${aus.includes(s.id) ? "" : "checked"} onchange="toggleGatewaySeite('${escapeHtml(s.id)}', !this.checked)">
          <span>${escapeHtml(s.name)}${aus.includes(s.id) ? " <small>(aus – nur du siehst sie)</small>" : ""}</span>
        </label>`)
    .join("");
  return `
    <p class="gateway-status-sub">Haken weg = Seite für Besucher abgeschaltet: kein Menüeintrag, keine Links, wer sie trotzdem aufruft, landet auf der Startseite. Du siehst sie weiter, gedimmt mit rotem Punkt. Start, Admin, Impressum und Datenschutz bleiben immer an. Gerade aus: ${anzahlAus} von ${seiten.length}.</p>
    <div class="gw-story-lage-knoepfe">
      <button type="button" class="gw-live-knopf" onclick="gwAlleSeiten(true)">Alle ausschalten</button>
      <button type="button" class="gw-live-knopf" onclick="gwAlleSeiten(false)">Alle einschalten</button>
    </div>
    <div class="gateway-chapter-list">${zeilen}</div>
    <p id="gw-seiten-status" class="gw-live-status" role="status" aria-live="polite"></p>
  `;
}

async function gwSeitenSpeichern(next, meldung) {
  if (!supabaseClient) return;
  try {
    await patchSupabaseSiteConfig({ disabledPageIds: next });
    if (typeof fhSeitenSperreAnwenden === "function") fhSeitenSperreAnwenden();
    await renderGatewayPage();
    gwLiveStatus("gw-seiten-status", meldung, false);
  } catch (err) {
    console.error("Seiten konnten nicht umgeschaltet werden:", err);
    gwLiveStatus("gw-seiten-status", "Speichern fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function toggleGatewaySeite(seiteId, aus) {
  const vorher = Array.isArray(siteConfig.disabledPageIds) ? siteConfig.disabledPageIds : [];
  const ohne = vorher.filter((id) => id !== seiteId);
  await gwSeitenSpeichern(aus ? [...ohne, seiteId] : ohne, aus ? "✓ Seite abgeschaltet." : "✓ Seite wieder an.");
}

async function gwAlleSeiten(aus) {
  if (aus && !confirm("Alle Seiten außer Start, Admin, Impressum und Datenschutz für Besucher abschalten?")) return;
  await gwSeitenSpeichern(aus ? gwSeitenListe().map((s) => s.id) : [], aus ? "✓ Alle Seiten abgeschaltet." : "✓ Alle Seiten wieder an.");
}

/* ------------------------------------------------------
   PIRATENPASS #2 FREISCHALTEN (Migration 53)
   Ein Klick setzt siteConfig.pass2Ab auf JETZT: Ab dann laeuft
   Pass 2 auf der "???"-Seite 61 Tage und loest Pass 1 ab. Die
   Datenbank liest denselben Zeitpunkt (app.pass2_start) und gibt
   erst danach Belohnungen heraus. Zurueckziehen setzt ihn auf null -
   bereits Abgeholtes bleibt, Pass 1 kommt aber NICHT zurueck, weil
   die Spieler schon auf season2 gewechselt sind.
------------------------------------------------------ */
function buildGatewayPass2Html() {
  const ab = siteConfig.pass2Ab ? new Date(siteConfig.pass2Ab) : null;
  const gueltig = ab && !isNaN(ab.getTime());
  const ende = gueltig ? new Date(ab.getTime() + 61 * 86400000) : null;
  const lage = !gueltig
    ? "Noch nicht freigeschaltet. Auf „???“ läuft Pass 1."
    : `Freigeschaltet seit ${escapeHtml(ab.toLocaleString("de-DE"))}, läuft bis ${escapeHtml(ende.toLocaleString("de-DE"))}.`;
  return `
    <p class="gateway-status-sub">${lage}</p>
    <p class="gateway-status-sub">Pass 2 „Die Seekarte“: 50 Stufen, zwei Spuren (Matrose für alle, Kapitän für 100 Diamanten). Endbelohnung der Kapitänsspur: ein Tanz nach Wahl für 500 V-Bucks – die Zusagen stehen unter Community → Tanz-Zusagen. Mit der Freigabe endet Pass 1, die Pass-XP starten bei 0. Die Skillpunkte aus Pass 1 bleiben erhalten. Braucht Migrationen 53 und 54.</p>
    <div class="gw-story-lage-knoepfe">
      ${gueltig
        ? `<button type="button" class="gw-live-knopf" onclick="gwPass2Setzen(false)">Freigabe zurückziehen</button>`
        : `<button type="button" class="gw-live-knopf" onclick="gwPass2Setzen(true)">Pass 2 jetzt freischalten</button>`}
      ${gueltig ? "" : `<button type="button" class="gw-live-knopf" onclick="window.fhPass2 && window.fhPass2.vorschau(true)">Vorschau ansehen</button>`}
    </div>
    <p id="gw-pass2-status" class="gw-live-status" role="status" aria-live="polite"></p>

    <p class="gateway-status-sub"><strong>Diamanten verteilen.</strong> Diamanten gibt es nur von dir – Spieler können sie sich nicht selbst gutschreiben. Der Kapitänspass kostet 100. Eine negative Zahl zieht ab (nie unter 0).</p>
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Diamanten (1–10000)
        <input type="number" id="gw-dia-alle" class="gw-feld" min="1" max="10000" value="100">
      </label>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwDiamantenAnAlle()">An alle Spieler</button>
    </div>
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Gezielt (−100000 bis 100000)
        <input type="number" id="gw-dia-einzeln" class="gw-feld" min="-100000" max="100000" value="100">
      </label>
      <input type="text" id="gw-dia-suche" class="gw-feld gw-feld-breit" placeholder="Spielername suchen" aria-label="Spieler für Diamanten suchen" autocomplete="off"
             onkeydown="if (event.key === 'Enter') gwDiamantenSuchen()">
      <button type="button" class="gw-live-knopf" onclick="gwDiamantenSuchen()">Suchen</button>
    </div>
    <div id="gw-dia-treffer" class="gw-titel-treffer"></div>
    <p id="gw-dia-status" class="gw-live-status" role="status" aria-live="polite"></p>
  `;
}

/* Diamanten (Migration 54): nur ueber die beiden Admin-RPCs. */
async function gwDiamantenAnAlle() {
  if (!supabaseClient) return;
  const n = parseInt((document.getElementById("gw-dia-alle") || {}).value, 10) || 0;
  if (n < 1 || n > 10000) { gwLiveStatus("gw-dia-status", "Zwischen 1 und 10000 Diamanten.", true); return; }
  if (!confirm(`${n} Diamanten an ALLE Spieler verteilen?`)) return;
  gwLiveStatus("gw-dia-status", "Verteile ...", false);
  try {
    const { data, error } = await supabaseClient.rpc("admin_diamanten_an_alle", { p_anzahl: n });
    if (error) throw error;
    gwLiveStatus("gw-dia-status", `✓ ${n} Diamanten an ${data} Spieler verteilt.`, false);
  } catch (err) {
    console.error("Diamanten an alle fehlgeschlagen:", err);
    gwLiveStatus("gw-dia-status", "Verteilen fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 54 eingespielt?", true);
  }
}

async function gwDiamantenSuchen() {
  const suche = ((document.getElementById("gw-dia-suche") || {}).value || "").trim();
  const liste = document.getElementById("gw-dia-treffer");
  if (!liste || !supabaseClient) return;
  if (!suche) { gwLiveStatus("gw-dia-status", "Erst einen Namen eingeben.", true); return; }
  liste.replaceChildren();
  try {
    const { data, error } = await supabaseClient.rpc("admin_spieler_suchen", { p_suche: suche });
    if (error) throw error;
    if (!data || !data.length) { gwLiveStatus("gw-dia-status", "Niemand gefunden.", true); return; }
    gwLiveStatus("gw-dia-status", data.length + " Treffer", false);
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
      knopf.textContent = "Diamanten buchen";
      knopf.addEventListener("click", () => gwDiamantenAnSpieler(sp.firebase_uid, sp.nickname || ""));
      zeile.append(name, id, knopf);
      liste.appendChild(zeile);
    });
  } catch (err) {
    console.error("Spielersuche fehlgeschlagen:", err);
    gwLiveStatus("gw-dia-status", "Suche fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwDiamantenAnSpieler(uid, name) {
  const n = parseInt((document.getElementById("gw-dia-einzeln") || {}).value, 10) || 0;
  if (!n || n < -100000 || n > 100000) { gwLiveStatus("gw-dia-status", "Zahl zwischen −100000 und 100000, nicht 0.", true); return; }
  try {
    const { data, error } = await supabaseClient.rpc("admin_diamanten_geben", { p_uid: uid, p_anzahl: n });
    if (error) throw error;
    gwLiveStatus("gw-dia-status", `✓ ${name || "Spieler"}: ${n > 0 ? "+" : ""}${n} Diamanten, jetzt ${data}.`, false);
  } catch (err) {
    console.error("Diamanten buchen fehlgeschlagen:", err);
    gwLiveStatus("gw-dia-status", "Buchen fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 54 eingespielt?", true);
  }
}

async function gwPass2Setzen(an) {
  if (!supabaseClient) return;
  if (an && !confirm("Piratenpass #2 jetzt freischalten? Pass 1 endet damit für alle.")) return;
  if (!an && !confirm("Freigabe zurückziehen? Pass 2 verschwindet von „???“; Pass 1 kommt nicht zurück.")) return;
  try {
    await patchSupabaseSiteConfig({ pass2Ab: an ? new Date().toISOString() : null });
    if (typeof renderPassPage === "function") renderPassPage();
    await renderGatewayPage();
    gwLiveStatus("gw-pass2-status", an ? "✓ Pass 2 läuft." : "✓ Freigabe zurückgezogen.", false);
  } catch (err) {
    console.error("Pass 2 konnte nicht umgeschaltet werden:", err);
    gwLiveStatus("gw-pass2-status", "Speichern fehlgeschlagen: " + ((err && err.message) || err), true);
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
  { key: "schlachtOrte", label: "Kampforte der Sternenschlacht", hinweis: "Ab der nächsten gestarteten Schlacht spielt jede an einem ausgelosten Ort mit eigenen Regeln und Start-Animation (Migration 56). Eine laufende Schlacht bleibt, wie sie ist. Vorschau: Sternenschlacht → „Kampforte ansehen“." },
  { key: "schlachtParteien", label: "Weitere Parteien der Sternenschlacht", hinweis: "Piraten-Armada, Maschinen-Kollektiv, Kristall-Konklave und Geisterflotte (Migration 57). Beim Start wählst du zwei Parteien; jeder Spieler wählt in der Sammelphase eine davon und ein Schiff. Gilt ab der nächsten gestarteten Schlacht. Vorschau: „Kampforte ansehen“ → „Parteien“." },
  { key: "hangarAusruestung", label: "Hangar: Sonderwaffen, Module, Schiffs-Rang", hinweis: "Im Hangar kaufen und anlegen die Spieler Sonderwaffen (sichtbar am Schiff) und zwei Module; aus Schlachten gibt es Erfahrung für den Rang (Migrationen 58/59). Wirkt ab der nächsten gestarteten Schlacht. Du selbst kannst vorher schon kaufen." },
  { key: "schlachtBewegung", label: "Sternenschlacht: Bewegen und Hülle", hinweis: "Spieler steuern ihr Schiff in der eigenen Hälfte (vorn trifft härter, Ausweichen schützt); jedes Schiff hat eine eigene Hülle und fällt bei 0 für 45 s aus (Migration 59). Gilt ab der nächsten gestarteten Schlacht." },
  { key: "schlachtBoss", label: "Sternenschlacht: Boss-Mutterschiff", hinweis: "Schaltet „Boss-Mutterschiff starten“ frei: alle Spieler gemeinsam gegen ein Mutterschiff mit drei Phasen, Salven und Schild (Migration 59)." },
  { key: "schlachtFront", label: "Sternenschlacht: Front (alle 10 s passiert was)", hinweis: "Beide Seiten drängen um eine Front; jeder wählt Angriff oder Verteidigung, sammelt Kampfpunkte und verbessert sich im Kampf; die kleinere Seite bekommt einen Ausgleich (Migration 62). Gilt ab der nächsten gestarteten Schlacht; die Regler stehen unter Sternenschlacht." },
  { key: "spind", label: "Spind", hinweis: "Öffnet sich per Klick aufs eigene Bild unten links (kein Menüeintrag): Titel tragen, Avatar und Rahmen, Namensfarbe, Banner, Spruch; Profilkarte per Klick auf Namen in der Rangliste (Migration 60)." },
  { key: "gluecksmine", label: "Glücksmine (Erz)", hinweis: "Neue Seite: Erz schürfen mit Spitzhacke, Bohrer, Lore und Grubenlampe. Mit Erz geht der Hangar bis Stufe 10, dazu Schiffssysteme (Migration 61)." },
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
    <div class="gw-live-nachricht">
      <label class="gw-feld-label">Piratenpass-XP (1–5000)
        <input type="number" id="gw-live-passxp" class="gw-feld" min="1" max="5000" value="250">
      </label>
      <button type="button" class="gw-live-knopf ist-alle" onclick="gwPassXpAnAlle()">Pass-XP an alle</button>
    </div>
    <p id="gw-geschenk-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Jeder anwesende Spieler bekommt es genau einmal. Der Betrag wird server-seitig verrechnet.</p>
    <div class="gw-live-nachricht">
      <input type="text" id="gw-passxp-suche" class="gw-feld gw-feld-breit" placeholder="Pass-XP gezielt: Spielername suchen" aria-label="Spieler für Pass-XP suchen" autocomplete="off"
             onkeydown="if (event.key === 'Enter') gwPassXpSpielerSuchen()">
      <button type="button" class="gw-live-knopf" onclick="gwPassXpSpielerSuchen()">Suchen</button>
    </div>
    <div id="gw-passxp-treffer" class="gw-titel-treffer"></div>
    <p id="gw-passxp-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Pass-XP gehen in die laufende Saison. Ein Spieler, der noch in keiner Saison steckt, beginnt beim vergebenen Betrag.</p>
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
  ["schatz", "Schatzregen", "Endlos, bis du ihn beendest · Zuschauer fangen Münzen", "gold"],
  ["hacked", "Hacked", "32 s · Unbekannter gegen Dave, danach 6 Hintertüren zum Schließen", "neon"],
  ["sturm", "Sturm", "12,4 s · Blitz und Einschlag", "kalt"],
  ["nordlicht", "Nordlicht", "17 s · Sternschnuppen und ein Wunsch – jeder wählt einen Wunschstern: 500 Dublonen, 1 Skillpunkt, 250 Pass-XP oder einen Nordlicht-Titel (Migration 52)", "violett"],
  ["nebel", "Geisterschiff", "14 s · Nebel und ein Fluch", "papier"],
  ["flut", "Sturmflut", "13,6 s · Land unter und Treibgut", "wasser"],
  ["disco", "Disco-Party", "Endlos, bis du sie beendest · Musik ab der Tanzfläche (ohne eigene Datei: music/disco.mp3)", "gold"],
  ["ende", "Systemausfall", "12 s · beendet das Event – die Seite bleibt für alle gehackt, bis die nächste Story startet oder du wiederherstellst", "rot"],
  ["werbung", "Werbungsflut", "bis 1 min · ??? spamt 32 Fenster mit 6 Secrets", "neon"],
  ["herz", "Zwei Hälften eines Herzens", "10:16 min · Kurzfilm in zehn Kapiteln mit Erzählerstimme (Sprachausgabe des Browsers, Deutsch oder Englisch je nach Seite): Leistungsdruck, Angst, Mobbing, eine erste Liebe – und ein kleines Licht. Musik („Patient Pulse“) unten unter „Musik je Story“ hochladen", "violett"],
  ["riss", "Der Riss", "5 min · Film: Rückeroberung scheitert, Systemausfall, Flug durch Raum und Zeit bis ins Jahr 1720 – danach ist die ganze Seite für alle im 1720-Design, bis du oben zurückschaltest", "violett"],
  ["zeit", "Zeitmaschine 2100", "5 min · Film: Auf dem Pergament zeichnet sich eine Zeitmaschine auf, Sprung durchs Zeittunnel, die Erde bricht auseinander, Menschen gegen Aliens – danach ist die ganze Seite für alle im All-Design (Jahr 2100), bis du oben zurückschaltest", "kalt"],
  ["nukes", "Hundert Atombomben gegen eine Mücke", "3 min · Film: Eine Mücke weckt Kapitän Ändii um 03:12 Uhr. Hand, Pfanne, Kanone – daneben. Dann der Notfallknopf und hundert Atombomben, bis die Erde zerbricht. Musik unten unter „Musik je Story“ hochladen (Migration 51)", "gold"],
];
/* Die beiden Finale-Storys laufen nur ueber "Finale auslösen" und
   stehen darum nicht in der Liste - hier nur ihre Namen fuer die
   Anzeige "Zuletzt gestartet". */
const GW_STORYS_FINALE = [
  ["gegenhack_sieg", "Gegenhack: Sieg"],
  ["gegenhack_niederlage", "Gegenhack: Niederlage"],
];

function buildGatewayStorysHtml() {
  const zeilen = GW_STORYS.map(([id, name, info, ton]) => `
    <div class="gw-story ist-${ton}">
      <div class="gw-story-text"><span class="gw-story-name">${name}</span><span class="gw-story-info">${info}<span id="gw-story-preis-${id}"></span></span></div>
      <div class="gw-story-knoepfe">
        <button type="button" class="gw-live-knopf" onclick="gwStoryVorschau('${id}')">Vorschau</button>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwStoryStart('${id}')">Für alle</button>
      </div>
    </div>`).join("");
  return `
    ${buildGatewayEventHtml()}
    ${buildGatewayGegenhackHtml()}
    <div class="gw-story-lage">
      <p id="gw-story-jetzt" class="gw-story-jetzt">Lade …</p>
      <div class="gw-story-lage-knoepfe">
        <button type="button" class="gw-live-knopf" onclick="gwStoryBeenden()">Disco / Schatzregen beenden</button>
        <button type="button" class="gw-live-knopf" onclick="gwStoryAufraeumen()">Abbrechen / Seite wiederherstellen</button>
        <button type="button" class="gw-live-knopf" onclick="gwStoryVorschauStopp()">Vorschau stoppen</button>
      </div>
    </div>
    ${buildGatewayEpocheHtml()}
    ${buildGatewayPlanHtml()}
    <div id="gw-db-wurzel"></div>
    <p class="gw-plan-ueberschrift">Alle Storys</p>
    <div class="gw-story-liste">${zeilen}</div>
    <p id="gw-story-status" class="gw-live-status" role="status" aria-live="polite"></p>

    ${buildGatewayPreiseHtml()}

    ${buildGatewayMusikHtml()}
  `;
}

/* ------------------------------------------------------
   LIVE-EVENT: EPOCHEN 1720 UND 2100 (Migration 35/46,
   css/95-epoche-1720.css, css/96-epoche-2100.css)
   ---------------------------------------------------
   Nach dem Riss sieht die Seite fuer alle aus wie im Jahr 1720,
   nach der Zeitmaschine wie im Jahr 2100 - von selbst zum Filmende.
   Hier geht es zurueck ins Heute, oder ohne Film sofort in eine der
   beiden Epochen. "Vorschau" schaltet nur diesen Browser.
------------------------------------------------------ */
function buildGatewayEpocheHtml() {
  return `
    <div class="gw-story-lage">
      <p id="gw-epoche-jetzt" class="gw-story-jetzt">Epoche: lade …</p>
      <div class="gw-story-lage-knoepfe">
        <button type="button" class="gw-live-knopf" onclick="gwEpocheSetzen('2026')">Zurück ins Jahr 2026</button>
        <button type="button" class="gw-live-knopf" onclick="gwEpocheSetzen('1720')">1720 jetzt für alle</button>
        <button type="button" class="gw-live-knopf" onclick="gwEpocheVorschau(1720)">Vorschau 1720 (nur hier)</button>
        <button type="button" class="gw-live-knopf" onclick="gwEpocheSetzen('2100')">2100 jetzt für alle</button>
        <button type="button" class="gw-live-knopf" onclick="gwEpocheVorschau(2100)">Vorschau 2100 (nur hier)</button>
      </div>
    </div>
    <p id="gw-epoche-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <div class="gw-story-lage">
      <p class="gw-story-jetzt">Sternenreise (Entwurf „Sternenreise“, bisher nur als Vorschau): Schlacht gegen das Mutterschiff, dann besetzt jeder eine Kanone der Arche und verteidigt sie auf der Reise nach Terra Nova. Kommt sie an, wird die Seite zur Kolonie „Terra Nova“, in der ein Auge wacht; ist die Hülle bei 0, wird sie zur „Verwahrung“. Alles nur in diesem Browser – für alle live geht es noch nicht.</p>
      <div class="gw-story-lage-knoepfe">
        <select id="gw-reise-dauer" class="gw-feld" aria-label="Dauer der Reise">
          <option value="60">Reise 1 min</option>
          <option value="180">Reise 3 min</option>
          <option value="300" selected>Reise 5 min (wie im Entwurf)</option>
        </select>
        <button type="button" class="gw-live-knopf" onclick="gwReiseFilm()">Sternenreise ansehen (nur hier)</button>
        <button type="button" class="gw-live-knopf" onclick="gwReiseWelt('terra')">Vorschau Terra Nova (nur hier)</button>
        <button type="button" class="gw-live-knopf" onclick="gwReiseWelt('verwahrung')">Vorschau Verwahrung (nur hier)</button>
        <button type="button" class="gw-live-knopf" onclick="gwReiseWelt(null)">Vorschau beenden</button>
      </div>
      <p id="gw-reise-status" class="gw-live-status" role="status" aria-live="polite"></p>
    </div>
    <div class="gw-story-lage">
      <p class="gw-story-jetzt">Seite eines Spielers (Jahr 2100, Migration 47) – die Wahl ist für Spieler endgültig, nur hier lässt sie sich ändern oder zurücksetzen.</p>
      <div class="gw-story-lage-knoepfe">
        <input type="text" id="gw-seite-uid" class="gw-feld gw-feld-breit" maxlength="64" placeholder="UID des Spielers" aria-label="UID des Spielers">
        <select id="gw-seite-wahl" class="gw-feld" aria-label="Neue Seite">
          <option value="">keine (neu wählen lassen)</option>
          <option value="menschen">Menschen (Erdflotte)</option>
          <option value="aliens">Aliens (Schwarm)</option>
        </select>
        <button type="button" class="gw-live-knopf" onclick="gwEigeneUid()">Meine UID</button>
        <button type="button" class="gw-live-knopf" onclick="gwSeiteSetzen()">Seite setzen</button>
        <button type="button" class="gw-live-knopf" onclick="gwHangarZuruecksetzen()">Hangar zurücksetzen</button>
      </div>
    </div>
    <p id="gw-seite-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <div class="gw-story-lage">
      <p id="gw-schlacht-jetzt" class="gw-story-jetzt">Sternenschlacht (Migration 50): Stand wird geladen …</p>
      <p class="gateway-status-sub">Läuft endlos in Runden, bis du sie beendest. Das Tempo bestimmt, wie lange eine Runde etwa dauert. Kampforte (Migrationen 55/56): Ausgelost wird erst, wenn du sie unter Live-Event → Freigaben freischaltest; einen gewählten Ort nutzt der Start immer. „Kampforte ansehen“ zeigt dir alle vorab. Parteien (Migration 57): Mit der Freigabe „Weitere Parteien“ wählst du zwei der sechs Parteien; die Schlacht beginnt dann mit einer Sammelphase, in der jeder Spieler Partei und Schiff wählt. Ohne Freigabe kämpfen Menschen gegen Aliens wie bisher. Boss-Mutterschiff (Migration 59, Freigabe „Boss-Mutterschiff“): alle gegen einen Koloss, Tempo, Ort und Sammelzeit wie oben; die Stärke bestimmt sein Leben. Zum Testen außerhalb von 2100: „Vorschau 2100“, selbst eine Seite wählen, dann starten – die leere Seite übernimmt eine Übungsflotte.</p>
      <div class="gw-story-lage-knoepfe">
        <select id="gw-schlacht-dauer" class="gw-feld" aria-label="Tempo einer Runde">
          <option value="5">Schnell (Runde ≈ 5 min)</option>
          <option value="10" selected>Normal (Runde ≈ 10 min)</option>
          <option value="20">Langsam (Runde ≈ 20 min)</option>
        </select>
        <select id="gw-schlacht-ort" class="gw-feld" aria-label="Kampfort">
          <option value="" selected>Ort auslosen (nur mit Freigabe „Kampforte“, sonst ohne Ort)</option>
          <option value="asteroiden">Kepler-Asteroidengürtel</option>
          <option value="schwarzes_loch">Ereignishorizont Sagitta (Schwarzes Loch)</option>
          <option value="station">Wrack der Orbis-Station</option>
          <option value="nebel">Ionennebel von Vesh</option>
          <option value="sonne">Korona von Helion (Sonne)</option>
          <option value="eisring">Eisringe von Kryos</option>
          <option value="wurmloch">Wurmloch-Schlund Ixion</option>
          <option value="pulsar">Pulsar Vela-9</option>
          <option value="friedhof">Schiffsfriedhof Nekros</option>
          <option value="mondring">Ringe von Tethra</option>
        </select>
        <select id="gw-schlacht-links" class="gw-feld" aria-label="Partei links">${gwParteiOptionen("menschen")}</select>
        <select id="gw-schlacht-rechts" class="gw-feld" aria-label="Partei rechts">${gwParteiOptionen("aliens")}</select>
        <select id="gw-schlacht-sammeln" class="gw-feld" aria-label="Sammelphase">
          <option value="60">Sammeln 1 min</option>
          <option value="90" selected>Sammeln 1,5 min</option>
          <option value="180">Sammeln 3 min</option>
          <option value="300">Sammeln 5 min</option>
        </select>
        <button type="button" class="gw-live-knopf" onclick="gwSchlachtStarten()">Sternenschlacht starten</button>
        <select id="gw-boss-staerke" class="gw-feld" aria-label="Stärke des Mutterschiffs">
          <option value="2">Boss leicht</option>
          <option value="3" selected>Boss normal</option>
          <option value="5">Boss schwer</option>
          <option value="8">Boss Albtraum</option>
        </select>
        <button type="button" class="gw-live-knopf" onclick="gwBossStarten()">Boss-Mutterschiff starten</button>
      </div>
      <p class="gateway-status-sub">Front (Migration 62, Freigabe „Front“): Takt, Stärke des Drängens, Schaden beim Durchbruch und Ausgleich für die kleinere Seite. Gilt sofort für eine laufende Front-Schlacht und für alle weiteren.</p>
      <div class="gw-story-lage-knoepfe">
        <select id="gw-front-takt" class="gw-feld" aria-label="Takt der Front">
          <option value="5">Takt 5 s</option>
          <option value="10" selected>Takt 10 s</option>
          <option value="15">Takt 15 s</option>
          <option value="20">Takt 20 s</option>
          <option value="30">Takt 30 s</option>
        </select>
        <select id="gw-front-staerke" class="gw-feld" aria-label="Stärke des Drängens">
          <option value="0.5">Drängen sanft</option>
          <option value="1" selected>Drängen normal</option>
          <option value="1.5">Drängen stark</option>
          <option value="2.5">Drängen wild</option>
        </select>
        <select id="gw-front-durchbruch" class="gw-feld" aria-label="Schaden beim Durchbruch">
          <option value="0.02">Durchbruch 2 %</option>
          <option value="0.05" selected>Durchbruch 5 %</option>
          <option value="0.1">Durchbruch 10 %</option>
          <option value="0.2">Durchbruch 20 %</option>
        </select>
        <label class="gw-check"><input type="checkbox" id="gw-front-ausgleich" checked> Ausgleich für die kleinere Seite</label>
        <button type="button" class="gw-live-knopf" onclick="gwFrontEinstellen()">Front-Regler speichern</button>
        <button type="button" class="gw-live-knopf" onclick="window.fhSchlachtOrte && window.fhSchlachtOrte.vorschau(document.getElementById('gw-schlacht-ort')?.value || null)">Kampforte ansehen</button>
        <button type="button" class="gw-live-knopf" onclick="gwSchlachtBeenden()">Schlacht beenden</button>
      </div>
    </div>
    <p id="gw-schlacht-status" class="gw-live-status" role="status" aria-live="polite"></p>
  `;
}

/* Auswahl der sechs Parteien (Migration 57; Namen aus hangar-data.js). */
function gwParteiOptionen(vorwahl) {
  const reihe = typeof SCHLACHT_PARTEI_REIHE !== "undefined" ? SCHLACHT_PARTEI_REIHE : ["menschen", "aliens"];
  /* feste Texte aus hangar-data.js bzw. i18n.js, keine Nutzerdaten */
  return reihe.map((p) => '<option value="' + p + '"' + (p === vorwahl ? " selected" : "") + ">" +
    (typeof schlachtParteiText === "function" ? schlachtParteiText(p, "name") : p) + "</option>").join("");
}

/* ------------------------------------------------------
   STERNENSCHLACHT (Migrationen 49 und 50)
   Alle Spieler mit Seite kaempfen mit; die Datenbank stellt zu jeder
   Runde die Einheiten auf und rechnet den Stand. Seit 50 endlos, bis
   der Admin beendet; der Admin darf auch ausserhalb von 2100 starten.
------------------------------------------------------ */
async function gwSchlachtZeigen() {
  const el = document.getElementById("gw-schlacht-jetzt");
  if (!el || !supabaseClient) return;
  gwFrontLaden();
  try {
    /* "*": die Spalte ort gibt es erst mit Migration 55. */
    const { data, error } = await supabaseClient.from("sternenschlacht").select("*")
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) el.textContent = "Sternenschlacht: noch keine geschlagen.";
    else if (data.status === "laeuft" && data.modus === "boss") el.textContent = (data.aufgestellt === false ? "Boss-Schlacht: Die Allianz sammelt sich bis " + new Date(data.beginn_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " Uhr."
      : "Boss-Schlacht läuft – Runde " + data.runde + ", Mutterschiff Phase " + data.boss_phase + ", Leben zu Rundenbeginn " + Math.round(100 * (data.boss_rest || 0) / (data.boss_max || 1)) + " % (" + data.anzahl_menschen + " Schiffe in der Allianz).")
      + (data.ort && window.fhSchlachtOrte ? " Ort: " + window.fhSchlachtOrte.name(data.ort) + "." : "");
    else if (data.status === "laeuft" && data.mit_wahl && data.aufgestellt === false) el.textContent = "Sternenschlacht: Sammelphase – " + gwParteiName(data.partei_links) + " gegen " + gwParteiName(data.partei_rechts) + ", Start um " + new Date(data.beginn_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " Uhr." + (data.ort && window.fhSchlachtOrte ? " Ort: " + window.fhSchlachtOrte.name(data.ort) + "." : "");
    else if (data.status === "laeuft" && data.endlos) el.textContent = "Sternenschlacht läuft endlos – Runde " + data.runde + ", Rundensiege " + gwParteiName(data.partei_links || "menschen") + " " + data.punkte_menschen + " : " + data.punkte_aliens + " " + gwParteiName(data.partei_rechts || "aliens") + " (" + data.anzahl_menschen + " gegen " + data.anzahl_aliens + " Schiffe)." + (data.ort && window.fhSchlachtOrte ? " Ort: " + window.fhSchlachtOrte.name(data.ort) + "." : "");
    else if (data.status === "laeuft") el.textContent = "Sternenschlacht läuft bis " + new Date(data.ende_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr – " + data.anzahl_menschen + " Menschen gegen " + data.anzahl_aliens + " Aliens.";
    else el.textContent = "Letzte Sternenschlacht: " + (data.sieger === "menschen" ? "Menschen" : data.sieger === "aliens" ? "Aliens" : "unentschieden") + (data.endlos ? " (Runden " + data.punkte_menschen + " : " + data.punkte_aliens + ")." : " (" + Math.round(data.endstand_menschen) + " % : " + (100 - Math.round(data.endstand_menschen)) + " %).");
  } catch (err) {
    el.textContent = "Sternenschlacht: Stand nicht lesbar – sind Migration 49 und 50 eingespielt?";
  }
}

function gwParteiName(p) {
  return typeof schlachtParteiText === "function" ? schlachtParteiText(p, "volk") : p;
}

async function gwSchlachtStarten() {
  if (!supabaseClient) return;
  const minuten = Number(document.getElementById("gw-schlacht-dauer")?.value || 10);
  const ort = document.getElementById("gw-schlacht-ort")?.value || null;
  const links = document.getElementById("gw-schlacht-links")?.value || "menschen";
  const rechts = document.getElementById("gw-schlacht-rechts")?.value || "aliens";
  const sammeln = Number(document.getElementById("gw-schlacht-sammeln")?.value || 90);
  const parteienFrei = !!(typeof siteConfig !== "undefined" && siteConfig.featureFlags && siteConfig.featureFlags.schlachtParteien === true);
  const mitParteien = parteienFrei || links !== "menschen" || rechts !== "aliens";
  if (links === rechts) { gwLiveStatus("gw-schlacht-status", "Wähle zwei verschiedene Parteien.", true); return; }
  if (!confirm(parteienFrei
    ? "Sternenschlacht starten: " + gwParteiName(links) + " gegen " + gwParteiName(rechts) + "? Zuerst sammeln sich die Flotten (" + Math.round(sammeln / 60 * 10) / 10 + " min) – jeder Spieler wählt Partei und Schiff. Danach läuft sie endlos in Runden, bis du sie beendest."
    : "Sternenschlacht starten? Sie läuft endlos in Runden, bis du sie beendest. Alle Spieler mit Seite kämpfen mit.")) return;
  try {
    /* p_ort nur mitschicken, wenn gewaehlt - so laeuft der Start auch
       noch ohne Migration 55 (dann ohne Ort). Parteien genauso erst
       mit Migration 57. */
    const args = ort ? { p_minuten: minuten, p_ort: ort } : { p_minuten: minuten };
    if (mitParteien) Object.assign(args, { p_links: links, p_rechts: rechts, p_sammeln_sek: sammeln });
    const { error } = await supabaseClient.rpc("admin_schlacht_starten", args);
    if (error) throw error;
    gwLiveStatus("gw-schlacht-status", parteienFrei ? "✓ Die Flotten sammeln sich." : "✓ Die Sternenschlacht läuft.", false);
    gwSchlachtZeigen();
  } catch (err) {
    console.error("Schlacht starten fehlgeschlagen:", err);
    const m = (err && err.message) || String(err);
    const grund = /nicht-2100/.test(m) ? "Migration 50 fehlt noch – erst sie startet auch außerhalb von 2100." : /schlacht-laeuft/.test(m) ? "Es läuft schon eine Schlacht." : /zu-wenige/.test(m) ? "Noch niemand hat eine Seite gewählt – wähle selbst eine (Vorschau 2100)." : /ort-unbekannt|p_ort/.test(m) ? "Kampforte gibt es erst mit Migration 55."
      : /parteien-gesperrt/.test(m) ? "Weitere Parteien sind noch nicht freigegeben (Live-Event → Freigaben)."
      : /parteien-gleich/.test(m) ? "Wähle zwei verschiedene Parteien."
      : /partei-unbekannt|p_links|p_rechts|p_sammeln/.test(m) ? "Parteien gibt es erst mit Migration 57." : m + " – sind Migration 49 und 50 eingespielt?";
    gwLiveStatus("gw-schlacht-status", "Start fehlgeschlagen: " + grund, true);
  }
}

/* Front-Regler (Migration 62). */
async function gwFrontEinstellen() {
  if (!supabaseClient) return;
  const args = {
    p_takt: Number(document.getElementById("gw-front-takt")?.value || 10),
    p_staerke: Number(document.getElementById("gw-front-staerke")?.value || 1),
    p_durchbruch: Number(document.getElementById("gw-front-durchbruch")?.value || 0.05),
    p_ausgleich: !!document.getElementById("gw-front-ausgleich")?.checked,
  };
  try {
    const { error } = await supabaseClient.rpc("admin_front_einstellen", args);
    if (error) throw error;
    gwLiveStatus("gw-schlacht-status", "✓ Front-Regler gespeichert: Takt " + args.p_takt + " s, Drängen ×" + String(args.p_staerke).replace(".", ",") + ", Durchbruch " + Math.round(args.p_durchbruch * 100) + " %, Ausgleich " + (args.p_ausgleich ? "an" : "aus") + ".", false);
  } catch (err) {
    console.error("Front-Regler fehlgeschlagen:", err);
    const m = (err && err.message) || String(err);
    gwLiveStatus("gw-schlacht-status", "Speichern fehlgeschlagen: " + (/admin_front_einstellen|function/.test(m) ? "Die Front gibt es erst mit Migration 62." : m), true);
  }
}

/* Regler aus der Datenbank in die Auswahl uebernehmen. */
async function gwFrontLaden() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from("schlacht_regler").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return;
    const setze = (id, wert) => { const e = document.getElementById(id); if (e && [...e.options].some((o) => Number(o.value) === Number(wert))) e.value = String(wert); };
    setze("gw-front-takt", data.takt_sek);
    setze("gw-front-staerke", data.staerke);
    setze("gw-front-durchbruch", data.durchbruch);
    const a = document.getElementById("gw-front-ausgleich");
    if (a) a.checked = data.ausgleich !== false;
  } catch (err) { /* ohne Migration 62 bleiben die Vorgaben */ }
}

/* Boss-Mutterschiff (Migration 59). */
async function gwBossStarten() {
  if (!supabaseClient) return;
  const minuten = Number(document.getElementById("gw-schlacht-dauer")?.value || 10);
  const ort = document.getElementById("gw-schlacht-ort")?.value || null;
  const sammeln = Number(document.getElementById("gw-schlacht-sammeln")?.value || 90);
  const staerke = Number(document.getElementById("gw-boss-staerke")?.value || 3);
  if (!confirm("Boss-Mutterschiff starten? Erst sammelt sich die Allianz (" + Math.round(sammeln / 60 * 10) / 10 + " min), dann kämpfen alle gemeinsam gegen das Mutterschiff – bis es fällt oder du beendest.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_boss_starten", { p_minuten: minuten, p_ort: ort, p_sammeln_sek: sammeln, p_staerke: staerke });
    if (error) throw error;
    gwLiveStatus("gw-schlacht-status", "✓ Das Mutterschiff naht – die Allianz sammelt sich.", false);
    gwSchlachtZeigen();
  } catch (err) {
    console.error("Boss starten fehlgeschlagen:", err);
    const m = (err && err.message) || String(err);
    const grund = /boss-gesperrt/.test(m) ? "Erst unter Live-Event → Freigaben „Boss-Mutterschiff“ einschalten."
      : /schlacht-laeuft/.test(m) ? "Es läuft schon eine Schlacht."
      : /ort-unbekannt/.test(m) ? "Unbekannter Ort."
      : /admin_boss_starten|function/.test(m) ? "Das Mutterschiff gibt es erst mit Migration 59." : m;
    gwLiveStatus("gw-schlacht-status", "Start fehlgeschlagen: " + grund, true);
  }
}

async function gwSchlachtBeenden() {
  if (!supabaseClient) return;
  if (!confirm("Die laufende Sternenschlacht jetzt beenden? Es siegt, wer mehr Runden gewonnen hat – bei Gleichstand der aktuelle Stand.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_schlacht_beenden");
    if (error) throw error;
    gwLiveStatus("gw-schlacht-status", data ? "✓ Schlacht beendet." : "Es lief keine Schlacht.", !data);
    gwSchlachtZeigen();
  } catch (err) {
    console.error("Schlacht beenden fehlgeschlagen:", err);
    gwLiveStatus("gw-schlacht-status", "Beenden fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

/* Einheit und Ausbauten eines Spielers loeschen (Migration 48) -
   bezahlte Dublonen gibt es dabei NICHT zurueck. */
async function gwHangarZuruecksetzen() {
  if (!supabaseClient) return;
  const uid = (document.getElementById("gw-seite-uid")?.value || "").trim();
  if (!uid) { gwLiveStatus("gw-seite-status", "Bitte eine UID eintragen.", true); return; }
  if (!confirm("Einheit und alle Ausbauten dieses Spielers löschen? Die bezahlten Dublonen gibt es nicht zurück.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_hangar_zuruecksetzen", { p_uid: uid });
    if (error) throw error;
    gwLiveStatus("gw-seite-status", data ? "✓ Hangar zurückgesetzt." : "Dieser Spieler hatte noch keine Einheit.", !data);
  } catch (err) {
    console.error("Hangar zuruecksetzen fehlgeschlagen:", err);
    gwLiveStatus("gw-seite-status", "Zurücksetzen fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 48 eingespielt?", true);
  }
}

/* Seite eines Spielers setzen oder zuruecksetzen (admin_seite_setzen). */
/* Fuer den eigenen Test: die eigene UID ins Feld - dann laesst sich
   die eigene Seite zuruecksetzen und neu waehlen. */
async function gwEigeneUid() {
  const feld = document.getElementById("gw-seite-uid");
  if (!feld) return;
  try {
    feld.value = (typeof wheelAuthReady !== "undefined" && (await wheelAuthReady)) || "";
  } catch (e) { feld.value = ""; }
  if (!feld.value) gwLiveStatus("gw-seite-status", "Deine UID ist gerade nicht lesbar.", true);
}

async function gwSeiteSetzen() {
  if (!supabaseClient) return;
  const uid = (document.getElementById("gw-seite-uid")?.value || "").trim();
  const seite = document.getElementById("gw-seite-wahl")?.value || "";
  if (!uid) { gwLiveStatus("gw-seite-status", "Bitte eine UID eintragen.", true); return; }
  try {
    const { error } = await supabaseClient.rpc("admin_seite_setzen", { p_uid: uid, p_seite: seite || null });
    if (error) throw error;
    gwLiveStatus("gw-seite-status", seite ? "✓ Seite gesetzt: " + (seite === "aliens" ? "Aliens" : "Menschen") + "." : "✓ Seite zurückgesetzt – der Spieler wählt neu.", false);
  } catch (err) {
    console.error("Seite setzen fehlgeschlagen:", err);
    const m = (err && err.message) || String(err);
    gwLiveStatus("gw-seite-status", /spieler-unbekannt/.test(m) ? "Keinen Spieler mit dieser UID gefunden." : "Setzen fehlgeschlagen: " + m + " – ist Migration 47 eingespielt?", true);
  }
}

/* ab1720/ab2100: die Zeitmarken aus live_event. Es gilt die zuletzt
   erreichte (wie in live-storys.js). */
function gwEpocheZeigen(ab1720, ab2100) {
  const el = document.getElementById("gw-epoche-jetzt");
  if (!el) return;
  const jetzt = Date.now();
  const marken = [[1720, ab1720 ? Date.parse(ab1720) : NaN], [2100, ab2100 ? Date.parse(ab2100) : NaN]];
  let jahr = 2026, beste = -Infinity, kommt = null;
  marken.forEach(([j, z]) => {
    if (!isFinite(z)) return;
    if (z <= jetzt && z > beste) { beste = z; jahr = j; }
    if (z > jetzt && (!kommt || z < kommt[1])) kommt = [j, z];
  });
  const uhr = (z) => new Date(z).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (kommt) el.textContent = "Epoche: " + (kommt[0] === 2100 ? "Die Zeitmaschine" : "Der Riss") + " läuft – um " + uhr(kommt[1]) + " Uhr wird die Seite für alle zum Jahr " + kommt[0] + ".";
  else if (jahr === 2100) el.textContent = "Epoche: Jahr 2100 – alle sehen das All-Design, bis du zurückschaltest.";
  else if (jahr === 1720) el.textContent = "Epoche: Jahr 1720 – alle sehen das Pergament-Design, bis du zurückschaltest.";
  else el.textContent = "Epoche: Jahr 2026 (normal).";
}

async function gwEpocheSetzen(jahr) {
  if (!supabaseClient) return;
  if (jahr !== "2026" && !confirm("Die Seite jetzt für alle ins Jahr " + jahr + " schalten – ohne den Film?")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_epoche", { p_jahr: jahr });
    if (error) throw error;
    if (window.fhEpoche) window.fhEpoche.vorschau(null);
    gwEpocheZeigen(jahr === "1720" ? data : null, jahr === "2100" ? data : null);
    gwLiveStatus("gw-epoche-status", jahr === "2026" ? "✓ Zurück im Jahr 2026 – für alle." : "✓ Alle sehen jetzt das Jahr " + jahr + ".", false);
  } catch (err) {
    console.error("Epoche umschalten fehlgeschlagen:", err);
    gwLiveStatus("gw-epoche-status", "Umschalten fehlgeschlagen: " + ((err && err.message) || err) + " – " + (jahr === "2100" ? "ist Migration 46 eingespielt?" : "ist Migration 35 eingespielt?"), true);
  }
}

/* Vorschau 1720 oder 2100 nur in diesem Browser; derselbe Knopf
   nochmal beendet sie. */
/* Sternenreise (scripts/liveevent/sternenreise.js): Film und die beiden
   Seitenzustände danach - bisher nur als Vorschau in diesem Browser. */
function gwReiseLaden() {
  if (typeof window.fhNachladen !== "function") return Promise.reject(new Error("fhNachladen fehlt"));
  return window.fhNachladen("reise").then(function () {
    if (!window.fhSternenreise) throw new Error("Sternenreise fehlt");
    return window.fhSternenreise;
  });
}
function gwReiseFilm() {
  const dauer = Number(document.getElementById("gw-reise-dauer")?.value || 300);
  gwReiseLaden().then(function (r) { r.start({ dauer: dauer, vorschau: true }); })
    .catch(function (err) { gwLiveStatus("gw-reise-status", "Sternenreise ließ sich nicht laden: " + ((err && err.message) || err), true); });
}
function gwReiseWelt(art) {
  gwReiseLaden().then(function (r) {
    r.welt(art);
    gwLiveStatus("gw-reise-status", art === "terra" ? "Vorschau Terra Nova – nur bei dir. „Vorschau beenden“ schaltet zurück."
      : art === "verwahrung" ? "Vorschau Verwahrung – nur bei dir. „Vorschau beenden“ schaltet zurück." : "Vorschau beendet.", false);
  }).catch(function (err) { gwLiveStatus("gw-reise-status", "Sternenreise ließ sich nicht laden: " + ((err && err.message) || err), true); });
}

function gwEpocheVorschau(jahr) {
  if (!window.fhEpoche) return;
  const an = window.fhEpoche.vorschauJahr ? window.fhEpoche.vorschauJahr() !== jahr : window.fhEpoche.jahr() !== jahr;
  window.fhEpoche.vorschau(an ? jahr : null);
  gwLiveStatus("gw-epoche-status", an ? "Vorschau: Jahr " + jahr + " – nur bei dir. Nochmal drücken beendet die Vorschau." : "Vorschau beendet – wieder wie bei allen.", false);
}

/* ------------------------------------------------------
   LIVE-EVENT: BELOHNUNGEN JE STORY (Migration 36)
   ---------------------------------------------------
   Je Story Dublonen, Skillpunkte und optional ein Event-Titel.
   Schatzregen und Werbungsflut zahlen je Stueck (Muenze bzw.
   Secret): dort gibt es dazu den Deckel und "ab wie vielen Stueck"
   Skillpunkte und Titel dazukommen. Disco, Riss und Systemausfall
   zahlen am Ende der Story. 0 und kein Titel = keine Belohnung.

   Die Werte kommen aus live_event.story_preise und gehen ueber
   admin_story_preis() zurueck; die Datenbank prueft die Grenzen
   (hoechstens 30000 Dublonen auf einmal, 10 Skillpunkte).
   Der Titeltext geht nur per value/textContent ins DOM.
------------------------------------------------------ */
const GW_PREISE = [
  // [schluessel, name, ton, stueck (null = pauschal), wann]
  ["sturm", "Sturm", "kalt", null, "nach dem Einschlag"],
  ["nebel", "Geisterschiff", "papier", null, "wenn der Fluch gebrochen ist"],
  ["flut", "Sturmflut", "wasser", null, "für das Treibgut"],
  ["hacked", "Hacked", "neon", null, "wenn Dave gewinnt"],
  ["hintertueren", "Hintertüren (nach Hacked)", "neon", null, "wer alle 6 schließt"],
  ["schatz", "Schatzregen", "gold", "Münze", "je gefangener Münze"],
  ["werbung", "Werbungsflut (auch Gegenhack-Niederlage)", "neon", "Secret", "je gefundenem Secret, höchstens 6"],
  ["disco", "Disco-Party", "gold", null, "am Ende"],
  ["riss", "Der Riss", "violett", null, "am Ende des Films"],
  ["herz", "Zwei Hälften eines Herzens", "violett", null, "am Ende des Films"],
  ["zeit", "Zeitmaschine 2100", "kalt", null, "am Ende des Films"],
  ["nukes", "Hundert Atombomben", "gold", null, "am Ende des Films"],
  ["ende", "Systemausfall", "rot", null, "am Ende"],
];
let gwPreise = {};

function buildGatewayPreiseHtml() {
  const stile = GW_TITEL_STILE.map(([wert, name]) => `<option value="${wert}">${name}</option>`).join("");
  const zeilen = GW_PREISE.map(([id, name, ton, stueck, wann]) => `
    <div class="gw-story gw-preis ist-${ton}">
      <div class="gw-story-text"><span class="gw-story-name">${name}</span><span id="gw-preis-stand-${id}" class="gw-story-info">${wann}</span></div>
      <div class="gw-preis-felder">
        <label class="gw-feld-label">${stueck ? "Dublonen je " + stueck : "Dublonen"}<input type="number" id="gw-preis-${id}-dub" class="gw-feld gw-feld-zahl" min="0" max="30000" step="1" value="0"></label>
        <label class="gw-feld-label">Skillpunkte<input type="number" id="gw-preis-${id}-sp" class="gw-feld gw-feld-zahl" min="0" max="10" step="1" value="0"></label>
        ${stueck ? `
        <label class="gw-feld-label">Höchstens ${stueck === "Secret" ? "Secrets" : "Münzen"}<input type="number" id="gw-preis-${id}-deckel" class="gw-feld gw-feld-zahl" min="1" max="${stueck === "Secret" ? 6 : 500}" step="1" value="1"></label>
        <label class="gw-feld-label">Skillpunkte/Titel ab<input type="number" id="gw-preis-${id}-ab" class="gw-feld gw-feld-zahl" min="1" max="500" step="1" value="1"></label>` : ""}
        <label class="gw-feld-label">Titel (leer = keiner)<input type="text" id="gw-preis-${id}-titel" class="gw-feld" maxlength="32" placeholder="z. B. Sturmreiter"></label>
        <label class="gw-feld-label">Stil<select id="gw-preis-${id}-stil" class="gw-feld">${stile}</select></label>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwPreisSpeichern('${id}')">Speichern</button>
      </div>
    </div>`).join("");
  return `
    <p class="gw-plan-ueberschrift">Belohnungen je Story</p>
    <div class="gw-story-liste">${zeilen}</div>
    <p id="gw-preis-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Gilt ab dem nächsten Start der Story. Jeder bekommt jede Belohnung je Start einmal. Höchstens 30.000 Dublonen auf einmal (beim Schatzregen: je Münze × Höchstzahl) und 10 Skillpunkte. Ein neuer Titel landet in der Titelliste und kann auch von Hand vergeben werden.</p>
  `;
}

/* "+150 Dublonen · +1 Skillpunkt · Titel „X“" - leer ohne Belohnung. */
function gwPreisText(id) {
  const p = gwPreise[id];
  if (!p) return "";
  const teile = [];
  const dub = Number(p.dublonen) || 0, sp = Number(p.skillpunkte) || 0;
  const titel = p.titel && p.titel.text ? "Titel „" + p.titel.text + "“" : "";
  if (p.deckel) {
    const stueck = id === "werbung" ? "Secret" : "Münze";
    if (dub > 0) teile.push("+" + dub + " Dublonen je " + stueck + " (max. " + (dub * p.deckel).toLocaleString("de-DE") + ")");
    const extra = [sp > 0 ? "+" + sp + " Skillpunkt" + (sp === 1 ? "" : "e") : "", titel].filter(Boolean).join(", ");
    if (extra) teile.push((Number(p.extra_ab) > 1 ? "ab " + p.extra_ab + ": " : "") + extra);
  } else {
    if (dub > 0) teile.push("+" + dub.toLocaleString("de-DE") + " Dublonen");
    if (sp > 0) teile.push("+" + sp + " Skillpunkt" + (sp === 1 ? "" : "e"));
    if (titel) teile.push(titel);
  }
  return teile.join(" · ");
}

function gwPreiseZeigen(preise) {
  const da = preise && typeof preise === "object" && Object.keys(preise).length > 0;
  gwPreise = da ? preise : {};
  GW_PREISE.forEach(([id, , , stueck, wann]) => {
    const p = gwPreise[id] || {};
    const setze = (feld, wert) => { const el = document.getElementById("gw-preis-" + id + "-" + feld); if (el && document.activeElement !== el) el.value = wert; };
    setze("dub", Number(p.dublonen) || 0);
    setze("sp", Number(p.skillpunkte) || 0);
    if (stueck) { setze("deckel", Number(p.deckel) || 1); setze("ab", Number(p.extra_ab) || 1); }
    setze("titel", p.titel && p.titel.text ? p.titel.text : "");
    setze("stil", p.titel && p.titel.stil ? p.titel.stil : "regenbogen");
    const stand = document.getElementById("gw-preis-stand-" + id);
    if (stand) stand.textContent = !da ? "Migration 36 fehlt – bisher feste Belohnungen" : wann + ": " + (gwPreisText(id) || "keine Belohnung");
  });
  /* In der Story-Liste oben: " · Belohnung: …" */
  GW_STORYS.forEach(([id]) => {
    const el = document.getElementById("gw-story-preis-" + id);
    if (!el) return;
    let text = gwPreisText(id);
    if (id === "hacked" && gwPreisText("hintertueren")) text = [text, "Hintertüren: " + gwPreisText("hintertueren")].filter(Boolean).join(" · ");
    el.textContent = da ? " · " + (text ? "Belohnung: " + text : "ohne Belohnung") : "";
  });
}

async function gwPreisSpeichern(id) {
  if (!supabaseClient) return;
  const wert = (feld) => { const el = document.getElementById("gw-preis-" + id + "-" + feld); return el ? el.value : ""; };
  const zahl = (feld) => { const n = parseInt(wert(feld), 10); return Number.isFinite(n) ? n : 0; };
  const stueck = (GW_PREISE.find(([k]) => k === id) || [])[3];
  const titel = String(wert("titel") || "").trim();
  try {
    const { data, error } = await supabaseClient.rpc("admin_story_preis", {
      p_schluessel: id,
      p_dublonen: zahl("dub"),
      p_skillpunkte: zahl("sp"),
      p_deckel: stueck ? zahl("deckel") : null,
      p_extra_ab: stueck ? zahl("ab") : null,
      p_titel_text: titel || null,
      p_titel_stil: titel ? (wert("stil") || "regenbogen") : null,
    });
    if (error) throw error;
    gwPreiseZeigen(data);
    const name = (GW_PREISE.find(([k]) => k === id) || [])[1] || id;
    gwLiveStatus("gw-preis-status", "✓ " + name + ": " + (gwPreisText(id) || "keine Belohnung") + " – gilt ab dem nächsten Start.", false);
  } catch (err) {
    console.error("Belohnung speichern fehlgeschlagen:", err);
    const m = String((err && err.message) || err);
    const grund = /check|violat/i.test(m) ? "Wert außerhalb der Grenzen (höchstens 30.000 Dublonen auf einmal, 10 Skillpunkte, beim Schatzregen höchstens 500, bei der Werbungsflut höchstens 6 Stück)."
      : /admin_story_preis|function/i.test(m) ? m + " – ist Migration 36 eingespielt?" : m;
    gwLiveStatus("gw-preis-status", "Speichern fehlgeschlagen: " + grund, true);
  }
}

/* ------------------------------------------------------
   LIVE-EVENT: MUSIK JE STORY (Migration 34)
   ---------------------------------------------------
   Jede Story kann eine eigene Datei bekommen (Bucket "live-musik",
   Dateiname = Kennung der Story). Sie laeuft bei allen vom Start bis
   zum Ende der Story in Schleife und blendet dann aus - auch in der
   Vorschau, so hoert man sie vorher. Die Disco spielt ab der
   Tanzflaeche und ohne eigene Datei music/disco.mp3.
------------------------------------------------------ */
const GW_MUSIK_STORYS = GW_STORYS.map(([id, name, , ton]) => [id, name, ton])
  .concat([["gegenhack_sieg", "Gegenhack: Sieg", "neon"], ["gegenhack_niederlage", "Gegenhack: Niederlage", "rot"],
    /* Sternenschlacht (scripts/schlacht/schlacht-klang.js): ohne Datei
       spielt die Schlacht ihre im Browser erzeugte Synth-Musik - je
       Kampfort ein eigenes Stueck. "schlacht" gilt nur ohne Kampfort. */
    ["schlacht", "Sternenschlacht (ohne Kampfort)", "neon"]])
  .concat([["asteroiden", "Kepler-Asteroidengürtel"], ["schwarzes_loch", "Ereignishorizont Sagitta"],
    ["station", "Wrack der Orbis-Station"], ["nebel", "Ionennebel von Vesh"], ["sonne", "Korona von Helion"],
    ["eisring", "Eisringe von Kryos"], ["wurmloch", "Wurmloch-Schlund Ixion"], ["pulsar", "Pulsar Vela-9"],
    ["friedhof", "Schiffsfriedhof Nekros"], ["mondring", "Ringe von Tethra"]]
    .map(([ort, name]) => ["schlacht_" + ort, "Sternenschlacht: " + name, "neon"]));
let gwMusikVersionen = {};
let gwMusikVersionAlt = null;  // live_event.musik_version aus 29 (Disco)

function buildGatewayMusikHtml() {
  const zeilen = GW_MUSIK_STORYS.map(([id, name, ton]) => `
    <div class="gw-story ist-${ton}">
      <div class="gw-story-text"><span class="gw-story-name">${name}</span><span id="gw-musik-stand-${id}" class="gw-story-info">Lade …</span></div>
      <div class="gw-story-knoepfe">
        <label class="gw-live-knopf gw-musik-datei">Datei wählen<input type="file" accept="audio/*" onchange="gwMusikHochladen('${id}', this)" hidden></label>
        <button type="button" class="gw-live-knopf" onclick="gwMusikProbe('${id}')">Anhören</button>
        <button type="button" class="gw-live-knopf" onclick="gwMusikEntfernen('${id}')">Entfernen</button>
      </div>
    </div>`).join("");
  return `
    <p class="gw-plan-ueberschrift">Musik je Story</p>
    <div class="gw-story-liste">${zeilen}</div>
    <p id="gw-musik-status" class="gw-live-status" role="status" aria-live="polite"></p>
    <p class="gateway-status-sub">Die Musik liegt in Supabase Storage (Bucket „live-musik“) und läuft bei allen, solange die Story läuft – in Schleife, am Ende ausgeblendet. Wer später dazukommt, hört an der passenden Stelle. Höchstens 15 MB je Datei.</p>
  `;
}

function gwMusikVersion(id) {
  return gwMusikVersionen[id] || (id === "disco" ? gwMusikVersionAlt : null);
}

function gwMusikStandZeigen() {
  GW_MUSIK_STORYS.forEach(([id]) => {
    const el = document.getElementById("gw-musik-stand-" + id);
    if (!el) return;
    const v = gwMusikVersion(id);
    if (v) el.textContent = "Eigene Datei (Version " + v + ")";
    else el.textContent = id === "disco" ? "Standard: music/disco.mp3"
      : id === "schlacht" ? "Keine Datei – es läuft die erzeugte Synth-Musik"
      : id.indexOf("schlacht_") === 0 ? "Keine Datei – es läuft die erzeugte Musik dieses Kampforts"
      : "Keine Musik – die Story läuft still";
  });
}

/* ------------------------------------------------------
   LIVE-EVENT: START, ABSTIMMUNG, LOGBUCH (Migration 30,
   scripts/liveevent/live-zuschauer.js)
   ---------------------------------------------------
   "Event starten" zeigt allen einen Countdown und danach die
   Live-Anzeige oben; wer dann da ist, bekommt das Abzeichen
   "War dabei: <Name>". Das Logbuch fuellt sich von selbst: Start,
   jede Story fuer alle, jede Nachricht an alle, jede Abstimmung.
------------------------------------------------------ */
function buildGatewayEventHtml() {
  return `
    <div class="gw-story-lage">
      <p id="gw-event-jetzt" class="gw-story-jetzt">Lade …</p>
      <div class="gw-live-nachricht">
        <input type="text" id="gw-event-name" class="gw-feld gw-feld-breit" maxlength="60" placeholder="Name des Events, z. B. Sturm vor Tortuga" aria-label="Name des Events">
        <label class="gw-story-info">Countdown <input type="number" id="gw-event-sek" class="gw-feld" min="3" max="60" value="10" aria-label="Countdown in Sekunden"> s</label>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwEventStarten()">Event starten</button>
        <button type="button" class="gw-live-knopf" onclick="gwEventBeenden()">Event beenden</button>
      </div>
      <p class="gateway-status-sub">Nach dem Ende bekommt jeder, der dabei war, ein Andenken-Fenster. Ein neues Event beendet ein laufendes, räumt den Systemausfall auf und stoppt den Regen nach dem Sturm.</p>
      <div class="gw-live-nachricht">
        <input type="text" id="gw-abst-frage" class="gw-feld gw-feld-breit" maxlength="120" placeholder="Frage an die Crew, z. B. Welchen Kurs setzen wir?" aria-label="Frage">
        <input type="text" id="gw-abst-a" class="gw-feld" maxlength="40" placeholder="Antwort A" aria-label="Antwort A">
        <input type="text" id="gw-abst-b" class="gw-feld" maxlength="40" placeholder="Antwort B" aria-label="Antwort B">
        <select id="gw-abst-sek" class="gw-feld" aria-label="Dauer"><option value="20">20 s</option><option value="60" selected>60 s</option></select>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwAbstimmungStarten()">Abstimmung starten</button>
      </div>
      <p id="gw-event-status" class="gw-live-status" role="status" aria-live="polite"></p>
      <p class="gateway-status-sub">Eine Stimme je Spieler. Das Ergebnis siehst du wie alle anderen unten auf der Seite – die passende Story startest du danach selbst.</p>
    </div>
  `;
}

async function gwEventLageLaden() {
  const ziel = document.getElementById("gw-event-jetzt");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from("live_event").select("event_id, event_name, event_live_ab").eq("id", 1).maybeSingle();
    if (error) throw error;
    const z = data || {};
    ziel.textContent = z.event_id
      ? "Event läuft: „" + (z.event_name || "") + "“ – live seit " + String(z.event_live_ab || "").slice(11, 16) + " Uhr (UTC)."
      : "Gerade läuft kein Event.";
  } catch (err) {
    ziel.textContent = "Stand nicht lesbar – ist Migration 30 eingespielt?";
  }
}

/* Eine Zeile ins Logbuch des laufenden Events. Ohne Event: nichts. */
async function gwLogbuch(text) {
  if (!supabaseClient || !text) return;
  try {
    const { data } = await supabaseClient.from("live_event").select("event_id").eq("id", 1).maybeSingle();
    if (!data || !data.event_id) return;
    await supabaseClient.from("live_logbuch").insert({ event_id: data.event_id, text: String(text).slice(0, 140) });
  } catch (err) { console.warn("Logbuch-Eintrag fehlgeschlagen:", err); }
}

async function gwEventStarten() {
  if (!supabaseClient) return;
  const name = ((document.getElementById("gw-event-name") || {}).value || "").trim();
  const sek = parseInt((document.getElementById("gw-event-sek") || {}).value, 10) || 10;
  if (!name) { gwLiveStatus("gw-event-status", "Erst einen Namen für das Event eingeben.", true); return; }
  if (sek < 3 || sek > 60) { gwLiveStatus("gw-event-status", "Countdown zwischen 3 und 60 Sekunden.", true); return; }
  if (!confirm("„" + name + "“ für alle starten? Alle sehen jetzt " + sek + " Sekunden Countdown.")) return;
  gwLiveStatus("gw-event-status", "Starte …", false);
  try {
    const { error } = await supabaseClient.rpc("admin_event_starten", { p_name: name, p_sekunden: sek });
    if (error) throw error;
    gwLiveStatus("gw-event-status", "✓ Countdown läuft bei allen – in " + sek + " s ist „" + name + "“ live.", false);
    const plan = typeof gwPlanAktiv === "function" ? gwPlanAktiv() : null;
    if (plan && plan.schritt) gwPlanSpeichern(plan, { schritt: 0 }, "Ablauf „" + plan.name + "“ beginnt von vorn.");
    gwEventLageLaden();
    gwStoryLageLaden();
  } catch (err) {
    console.error("Event starten fehlgeschlagen:", err);
    gwLiveStatus("gw-event-status", "Starten fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwEventBeenden() {
  if (!supabaseClient) return;
  if (!confirm("Event für alle beenden?")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_event_beenden");
    if (error) throw error;
    gwLiveStatus("gw-event-status", data ? "✓ Event beendet. Wer dabei war, sieht jetzt sein Andenken." : "Es lief kein Event.", !data);
    gwEventLageLaden();
  } catch (err) {
    gwLiveStatus("gw-event-status", "Beenden fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwAbstimmungStarten() {
  if (!supabaseClient) return;
  const wert = (id) => ((document.getElementById(id) || {}).value || "").trim();
  const frage = wert("gw-abst-frage"), a = wert("gw-abst-a"), b = wert("gw-abst-b");
  const sek = parseInt(wert("gw-abst-sek"), 10) || 60;
  if (!frage || !a || !b) { gwLiveStatus("gw-event-status", "Frage und beide Antworten eingeben.", true); return; }
  try {
    const { error } = await supabaseClient.rpc("admin_abstimmung_starten", { p_frage: frage, p_a: a, p_b: b, p_sekunden: sek });
    if (error) throw error;
    gwLiveStatus("gw-event-status", "✓ Abstimmung läuft " + sek + " s bei allen.", false);
  } catch (err) {
    const text = String((err && err.message) || err);
    gwLiveStatus("gw-event-status", /kein-event/.test(text) ? "Erst ein Event starten – Abstimmungen gibt es nur während eines Events." : "Fehlgeschlagen: " + text, true);
  }
}

function gwStoryName(id) {
  const s = GW_STORYS.concat(GW_STORYS_FINALE).find((x) => x[0] === id);
  return s ? s[1] : id;
}

/* ------------------------------------------------------
   COMMUNITY-QUEST GEGENHACK (Migration 31,
   scripts/liveevent/gegenhack.js)
   ---------------------------------------------------
   Starten: Titel, Ziel (Zahl geloester Aufgaben, jede Aufgabe
   zaehlt je Spieler einmal - hoechstens 3 pro Kopf) und Termin
   (nur Anzeige und Kalendereintrag). "Finale auslösen" geht nur
   waehrend eines Events: Sieg zahlt sofort aus, Niederlage laesst
   die Seite bis zum naechsten Event gehackt.
------------------------------------------------------ */
function buildGatewayGegenhackHtml() {
  return `
    <div class="gw-story-lage">
      <p id="gw-gh-jetzt" class="gw-story-jetzt">Lade …</p>
      <div class="gw-live-nachricht">
        <input type="text" id="gw-gh-titel" class="gw-feld gw-feld-breit" maxlength="60" placeholder="Titel, z. B. Gegenhack vorbereiten" aria-label="Titel der Quest">
        <label class="gw-story-info">Ziel <input type="number" id="gw-gh-ziel" class="gw-feld" min="1" max="100000" value="300" aria-label="Ziel: gelöste Aufgaben"></label>
        <label class="gw-story-info">Termin <input type="datetime-local" id="gw-gh-termin" class="gw-feld" aria-label="Termin des Gegenhacks"></label>
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwGegenhackStarten()">Quest starten</button>
      </div>
      <div class="gw-live-nachricht">
        <button type="button" class="gw-live-knopf ist-alle" onclick="gwGegenhackFinale()">Finale auslösen</button>
        <button type="button" class="gw-live-knopf" onclick="gwGegenhackAbbrechen()">Quest abbrechen</button>
      </div>
      <p id="gw-gh-status" class="gw-live-status" role="status" aria-live="polite"></p>
      <p class="gateway-status-sub">Ziel = Zahl gelöster Aufgaben der ganzen Crew; jeder Pirat kann höchstens 3 beitragen. Das Finale geht nur während eines Events. Sieg: jeder Helfer bekommt sofort 500 Dublonen je Aufgabe (max. 1500) und das Abzeichen „Gegenhacker“. Niederlage: ??? und die Werbungsflut, die Seite bleibt bis zum nächsten Event gehackt.</p>
    </div>
  `;
}

async function gwGegenhackLageLaden() {
  const ziel = document.getElementById("gw-gh-jetzt");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from("live_event").select("quest_id").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data || !data.quest_id) { ziel.textContent = "Gerade läuft keine Gegenhack-Quest."; return; }
    const { data: st, error: e2 } = await supabaseClient.rpc("gegenhack_stand", { p_quest: data.quest_id });
    if (e2) throw e2;
    const p = st && st.ziel ? Math.floor(Math.min(100, st.geloest / st.ziel * 100)) : 0;
    ziel.textContent = "Quest läuft: „" + (st.titel || "") + "“ – " + st.geloest + " von " + st.ziel + " Aufgaben (" + p + " %), " + st.helfer + " Helfer" +
      (st.geloest >= st.ziel ? " · reicht für den Sieg" : " · reicht noch nicht") + ".";
  } catch (err) {
    ziel.textContent = "Stand nicht lesbar – ist Migration 31 eingespielt?";
  }
}

async function gwGegenhackStarten() {
  if (!supabaseClient) return;
  const titel = ((document.getElementById("gw-gh-titel") || {}).value || "").trim() || "Gegenhack vorbereiten";
  const zielZahl = parseInt((document.getElementById("gw-gh-ziel") || {}).value, 10);
  const terminWert = (document.getElementById("gw-gh-termin") || {}).value || "";
  if (!(zielZahl >= 1 && zielZahl <= 100000)) { gwLiveStatus("gw-gh-status", "Ziel zwischen 1 und 100000.", true); return; }
  /* datetime-local ist Ortszeit ohne Zone - new Date() liest es genau so. */
  const termin = terminWert ? new Date(terminWert) : null;
  if (termin && isNaN(termin.getTime())) { gwLiveStatus("gw-gh-status", "Termin nicht lesbar.", true); return; }
  if (!confirm("Quest „" + titel + "“ mit Ziel " + zielZahl + " für alle starten? Eine laufende Quest wird dabei ohne Belohnung abgebrochen.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_gegenhack_starten", { p_titel: titel, p_ziel: zielZahl, p_termin: termin ? termin.toISOString() : null });
    if (error) throw error;
    gwLiveStatus("gw-gh-status", "✓ Quest läuft – Menüpunkt und Hinweis auf der Startseite sind jetzt bei allen sichtbar.", false);
    gwGegenhackLageLaden();
  } catch (err) {
    gwLiveStatus("gw-gh-status", "Starten fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwGegenhackFinale() {
  if (!supabaseClient) return;
  if (!confirm("Finale jetzt für alle auslösen? Sieg oder Niederlage steht dann fest – das lässt sich nicht zurücknehmen.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_gegenhack_finale");
    if (error) throw error;
    gwLiveStatus("gw-gh-status", data && data.ergebnis === "sieg"
      ? "✓ Sieg: " + data.geloest + " von " + data.ziel + " – " + data.helfer + " Helfer wurden ausgezahlt."
      : "✓ Niederlage: " + (data ? data.geloest + " von " + data.ziel : "") + " – ??? übernimmt.", false);
    gwGegenhackLageLaden();
    gwStoryLageLaden();
  } catch (err) {
    const text = String((err && err.message) || err);
    gwLiveStatus("gw-gh-status", /kein-event/.test(text) ? "Erst ein Event starten – das Finale gehört zum Event."
      : /keine-quest/.test(text) ? "Es läuft keine Quest." : "Fehlgeschlagen: " + text, true);
  }
}

async function gwGegenhackAbbrechen() {
  if (!supabaseClient) return;
  if (!confirm("Quest ohne Belohnung abbrechen?")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_gegenhack_abbrechen");
    if (error) throw error;
    gwLiveStatus("gw-gh-status", data ? "✓ Quest abgebrochen." : "Es lief keine Quest.", !data);
    gwGegenhackLageLaden();
  } catch (err) {
    gwLiveStatus("gw-gh-status", "Fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

/* ------------------------------------------------------
   DREHBUCH JE EVENT (Migration 65)
   ---------------------------------------------------
   Text → Disco → währenddessen Text → …, vorab gebaut und per
   Start/Weiter abgespielt. Die Oberfläche steckt in
   scripts/liveevent/drehbuch.js und wird erst hier nachgeladen.
------------------------------------------------------ */
function gwDrehbuchStarten() {
  const wurzel = document.getElementById("gw-db-wurzel");
  if (!wurzel || typeof window.fhNachladen !== "function") return;
  window.fhNachladen("drehbuch").then(function () {
    if (window.fhDrehbuch) window.fhDrehbuch.montieren(wurzel);
  }).catch(function (err) {
    console.error("Drehbuch nicht ladbar:", err);
    wurzel.textContent = "Drehbuch ließ sich nicht laden.";
  });
}

/* ------------------------------------------------------
   ABLAUFPLAN JE EVENT (Migration 33)
   ---------------------------------------------------
   Vorab geplante Events mit ihren Storys in fester Reihenfolge.
   Der gewaehlte Plan steht oben ueber "Alle Storys": jede Story
   mit Vorschau und "Für alle", die naechste ist markiert. Wer eine
   Story ueber den Plan startet, rueckt "als Nächstes" weiter;
   "Event starten" setzt den Plan auf Anfang. Nur Admins sehen die
   Plaene (RLS); gewaehlt ist er fuer alle Admin-Geraete gleich.
------------------------------------------------------ */
let gwPlaene = [];

function gwPlanAktiv() { return gwPlaene.find((p) => p.aktiv) || null; }

function buildGatewayPlanHtml() {
  const optionen = GW_STORYS.map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
  return `
    <div class="gw-plan">
      <div class="gw-plan-kopf">
        <span class="gw-story-name">Ablaufplan</span>
        <select id="gw-plan-wahl" class="gw-feld gw-feld-breit" onchange="gwPlanWaehlen(this.value)" aria-label="Ablaufplan wählen">
          <option value="">– kein Plan: alle Storys –</option>
        </select>
        <button type="button" class="gw-live-knopf" onclick="gwPlanNeu()">Neuer Plan</button>
        <button type="button" class="gw-live-knopf" onclick="gwPlanUmbenennen()">Umbenennen</button>
        <button type="button" class="gw-live-knopf" onclick="gwPlanLoeschen()">Löschen</button>
      </div>
      <ol id="gw-plan-ablauf" class="gw-plan-ablauf"></ol>
      <div id="gw-plan-fuss" class="gw-plan-fuss" hidden>
        <select id="gw-plan-dazu" class="gw-feld" aria-label="Story für den Ablauf">${optionen}</select>
        <button type="button" class="gw-live-knopf" onclick="gwPlanStoryDazu()">Zum Ablauf</button>
        <button type="button" class="gw-live-knopf" onclick="gwPlanVonVorn()">Ablauf von vorn</button>
      </div>
      <p id="gw-plan-status" class="gw-live-status" role="status" aria-live="polite"></p>
      <p class="gateway-status-sub">Leg für jedes kommende Event einen Plan an und stell die Storys in die Reihenfolge, in der sie laufen sollen. Beim Event wählst du den Plan – „Event starten“ übernimmt seinen Namen und fängt den Ablauf von vorn an.</p>
    </div>
  `;
}

async function gwPlaeneLaden() {
  if (!supabaseClient || !document.getElementById("gw-plan-wahl")) return;
  try {
    const { data, error } = await supabaseClient.from("event_ablaufplaene").select("plan_id, name, storys, aktiv, schritt").order("name");
    if (error) throw error;
    gwPlaene = Array.isArray(data) ? data : [];
  } catch (err) {
    gwLiveStatus("gw-plan-status", "Pläne nicht lesbar – ist Migration 33 eingespielt?", true);
    gwPlaene = [];
  }
  gwPlanZeichnen();
}

function gwPlanZeichnen() {
  const wahl = document.getElementById("gw-plan-wahl");
  const liste = document.getElementById("gw-plan-ablauf");
  const fuss = document.getElementById("gw-plan-fuss");
  if (!wahl || !liste) return;
  const aktiv = gwPlanAktiv();

  /* Auswahl neu fuellen - Namen nur als Text. */
  while (wahl.options.length > 1) wahl.remove(1);
  gwPlaene.forEach((p) => { const o = document.createElement("option"); o.value = p.plan_id; o.textContent = p.name; wahl.appendChild(o); });
  wahl.value = aktiv ? aktiv.plan_id : "";
  if (fuss) fuss.hidden = !aktiv;

  liste.replaceChildren();
  if (!aktiv) return;
  const storys = aktiv.storys || [];
  if (!storys.length) {
    const leer = document.createElement("li");
    leer.className = "gw-plan-leer";
    leer.textContent = "Noch keine Storys im Ablauf – unten eine auswählen und „Zum Ablauf“.";
    liste.appendChild(leer);
    return;
  }
  storys.forEach((id, i) => {
    const eintrag = GW_STORYS.find((x) => x[0] === id);
    const zeile = document.createElement("li");
    const status = i < aktiv.schritt ? "ist-gelaufen" : i === aktiv.schritt ? "ist-naechste" : "";
    zeile.className = "gw-story gw-plan-schritt ist-" + (eintrag ? eintrag[3] : "rot") + (status ? " " + status : "");
    const text = document.createElement("div");
    text.className = "gw-story-text";
    const name = document.createElement("span");
    name.className = "gw-story-name";
    name.textContent = (i + 1) + ". " + gwStoryName(id) + (i < aktiv.schritt ? "  ✓" : "");
    const info = document.createElement("span");
    info.className = "gw-story-info";
    info.textContent = i === aktiv.schritt ? "Als Nächstes" + (eintrag ? " · " + eintrag[2] : "") : eintrag ? eintrag[2] : "Unbekannte Story – bitte entfernen";
    text.append(name, info);
    const knoepfe = document.createElement("div");
    knoepfe.className = "gw-story-knoepfe";
    const knopf = (beschriftung, klick, extra, titel) => {
      const k = document.createElement("button");
      k.type = "button";
      k.className = "gw-live-knopf" + (extra ? " " + extra : "");
      k.textContent = beschriftung;
      if (titel) k.setAttribute("aria-label", titel);
      k.addEventListener("click", klick);
      knoepfe.appendChild(k);
      return k;
    };
    knopf("↑", () => gwPlanVerschieben(i, -1), "ist-klein", "Nach oben").disabled = i === 0;
    knopf("↓", () => gwPlanVerschieben(i, 1), "ist-klein", "Nach unten").disabled = i === storys.length - 1;
    knopf("✕", () => gwPlanStoryWeg(i), "ist-klein", "Aus dem Ablauf entfernen");
    if (eintrag) {
      knopf("Vorschau", () => gwStoryVorschau(id));
      knopf("Für alle", () => gwPlanStart(i), "ist-alle");
    }
    zeile.append(text, knoepfe);
    liste.appendChild(zeile);
  });
}

/* Eine Aenderung am gewaehlten Plan speichern und neu zeichnen. */
async function gwPlanSpeichern(plan, felder, meldung) {
  try {
    const { error } = await supabaseClient.from("event_ablaufplaene")
      .update(Object.assign({ geaendert_am: new Date().toISOString() }, felder)).eq("plan_id", plan.plan_id);
    if (error) throw error;
    /* gwPlaene kann inzwischen neu geladen sein - dort eintragen. */
    Object.assign(gwPlaene.find((p) => p.plan_id === plan.plan_id) || plan, felder);
    gwPlanZeichnen();
    if (meldung) gwLiveStatus("gw-plan-status", meldung, false);
    return true;
  } catch (err) {
    gwLiveStatus("gw-plan-status", "Speichern fehlgeschlagen: " + ((err && err.message) || err), true);
    return false;
  }
}

async function gwPlanWaehlen(planId) {
  if (!supabaseClient) return;
  try {
    /* Erst alle abwaehlen - es darf nur einen gewaehlten geben. */
    const { error: e1 } = await supabaseClient.from("event_ablaufplaene").update({ aktiv: false }).eq("aktiv", true);
    if (e1) throw e1;
    if (planId) {
      const { error: e2 } = await supabaseClient.from("event_ablaufplaene").update({ aktiv: true }).eq("plan_id", planId);
      if (e2) throw e2;
    }
    gwPlaene.forEach((p) => { p.aktiv = p.plan_id === planId; });
    gwPlanZeichnen();
    const plan = gwPlanAktiv();
    const feld = document.getElementById("gw-event-name");
    if (plan && feld && !feld.value.trim()) feld.value = plan.name.slice(0, 60);
    gwLiveStatus("gw-plan-status", plan ? "✓ Plan „" + plan.name + "“ gewählt." : "Kein Plan gewählt.", false);
  } catch (err) {
    gwLiveStatus("gw-plan-status", "Wählen fehlgeschlagen: " + ((err && err.message) || err), true);
    gwPlaeneLaden();
  }
}

async function gwPlanNeu() {
  if (!supabaseClient) return;
  const name = (prompt("Name des geplanten Events, z. B. „Event 3 – Der Riss“:") || "").trim();
  if (!name) return;
  if (name.length > 60) { gwLiveStatus("gw-plan-status", "Höchstens 60 Zeichen.", true); return; }
  try {
    const { data, error } = await supabaseClient.from("event_ablaufplaene").insert({ name: name }).select("plan_id").single();
    if (error) throw error;
    await gwPlaeneLaden();
    await gwPlanWaehlen(data.plan_id);
  } catch (err) {
    gwLiveStatus("gw-plan-status", "Anlegen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwPlanUmbenennen() {
  const plan = gwPlanAktiv();
  if (!plan) { gwLiveStatus("gw-plan-status", "Erst einen Plan wählen.", true); return; }
  const name = (prompt("Neuer Name:", plan.name) || "").trim();
  if (!name || name === plan.name) return;
  if (name.length > 60) { gwLiveStatus("gw-plan-status", "Höchstens 60 Zeichen.", true); return; }
  if (await gwPlanSpeichern(plan, { name: name }, "✓ Umbenannt.")) gwPlaeneLaden();
}

async function gwPlanLoeschen() {
  const plan = gwPlanAktiv();
  if (!plan) { gwLiveStatus("gw-plan-status", "Erst einen Plan wählen.", true); return; }
  if (!confirm("Plan „" + plan.name + "“ löschen? Die Storys selbst bleiben.")) return;
  try {
    const { error } = await supabaseClient.from("event_ablaufplaene").delete().eq("plan_id", plan.plan_id);
    if (error) throw error;
    gwLiveStatus("gw-plan-status", "✓ Plan gelöscht.", false);
    gwPlaeneLaden();
  } catch (err) {
    gwLiveStatus("gw-plan-status", "Löschen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

function gwPlanStoryDazu() {
  const plan = gwPlanAktiv();
  const id = (document.getElementById("gw-plan-dazu") || {}).value;
  if (!plan || !id) return;
  const storys = (plan.storys || []).concat(id);
  if (storys.length > 30) { gwLiveStatus("gw-plan-status", "Höchstens 30 Storys je Plan.", true); return; }
  gwPlanSpeichern(plan, { storys: storys }, "✓ " + gwStoryName(id) + " steht jetzt an Stelle " + storys.length + ".");
}

function gwPlanStoryWeg(i) {
  const plan = gwPlanAktiv();
  if (!plan) return;
  const storys = plan.storys.slice();
  storys.splice(i, 1);
  gwPlanSpeichern(plan, { storys: storys, schritt: Math.min(plan.schritt - (i < plan.schritt ? 1 : 0), storys.length) });
}

function gwPlanVerschieben(i, richtung) {
  const plan = gwPlanAktiv();
  const j = i + richtung;
  if (!plan || j < 0 || j >= plan.storys.length) return;
  const storys = plan.storys.slice();
  const x = storys[i]; storys[i] = storys[j]; storys[j] = x;
  gwPlanSpeichern(plan, { storys: storys });
}

function gwPlanVonVorn() {
  const plan = gwPlanAktiv();
  if (plan) gwPlanSpeichern(plan, { schritt: 0 }, "Ablauf steht wieder am Anfang.");
}

/* Story aus dem Plan fuer alle starten - danach ist die folgende dran. */
async function gwPlanStart(i) {
  const plan = gwPlanAktiv();
  if (!plan) return;
  const ok = await gwStoryStart(plan.storys[i]);
  /* gwStoryStart laedt die Plaene schon neu - danach noch einmal,
     damit der alte Stand den neuen Schritt nicht ueberholt. */
  if (ok && await gwPlanSpeichern(plan, { schritt: Math.max(plan.schritt, i + 1) })) gwPlaeneLaden();
}

async function gwStoryLageLaden() {
  gwEventLageLaden();
  gwGegenhackLageLaden();
  gwPlaeneLaden();
  const ziel = document.getElementById("gw-story-jetzt");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from("live_event").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    const z = data || {};
    if (!z.story) ziel.textContent = "Gerade läuft keine Story.";
    else if (z.story === "ende") ziel.textContent = "Zuletzt: Systemausfall – die Seite ist gehackt, bis du wiederherstellst oder eine neue Story startest.";
    else if (z.story === "gegenhack_niederlage") ziel.textContent = "Zuletzt: Gegenhack verloren – die Seite bleibt gehackt bis zum nächsten Event (oder bis du wiederherstellst).";
    else if (z.story === "disco" && !z.story_ende_at) ziel.textContent = "Disco läuft seit " + String(z.story_at || "").slice(11, 16) + " Uhr (UTC) – „Disco / Schatzregen beenden“ lässt sie ausklingen.";
    else if (z.story === "schatz" && !z.story_ende_at) ziel.textContent = "Schatzregen läuft seit " + String(z.story_at || "").slice(11, 16) + " Uhr (UTC) – „Disco / Schatzregen beenden“ stoppt den Regen, dann gibt es die Beute.";
    else ziel.textContent = "Zuletzt gestartet: " + gwStoryName(z.story) + " um " + String(z.story_at || "").slice(11, 16) + " Uhr (UTC).";
    gwEpocheZeigen(z.jahr_1720_ab || null, z.jahr_2100_ab || null);
    gwSchlachtZeigen();
    gwMusikVersionAlt = z.musik_version || null;
    gwMusikVersionen = z.musik_versionen && typeof z.musik_versionen === "object" ? z.musik_versionen : {};
    gwMusikStandZeigen();
    gwPreiseZeigen(z.story_preise);
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
  if (!supabaseClient) return false;
  if (id === "ende" && !confirm("Systemausfall für alle starten? Die Seite bleibt danach für alle gehackt, bis die nächste Story startet oder du wiederherstellst.")) return false;
  gwLiveStatus("gw-story-status", "Starte …", false);
  try {
    const { error } = await supabaseClient.rpc("admin_live_story", { p_story: id });
    if (error) throw error;
    gwLiveStatus("gw-story-status", "✓ " + gwStoryName(id) + " läuft jetzt bei allen.", false);
    gwLogbuch(gwStoryName(id));
    gwStoryLageLaden();
    return true;
  } catch (err) {
    console.error("Story starten fehlgeschlagen:", err);
    gwLiveStatus("gw-story-status", "Starten fehlgeschlagen: " + ((err && err.message) || err), true);
    return false;
  }
}

async function gwStoryBeenden() {
  /* Laeuft hier gerade eine Vorschau, endet nur die - ohne die
     Story bei allen anzufassen. */
  const vorschau = window.fhLiveStorys && window.fhLiveStorys.laeuft();
  if (vorschau && vorschau.vorschau) {
    window.fhLiveStorys.vorschauAusklingen();
    gwLiveStatus("gw-story-status", "✓ Vorschau klingt aus (nur hier).", false);
    return;
  }
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_live_story_beenden");
    if (error) throw error;
    gwLiveStatus("gw-story-status", data ? "✓ Klingt bei allen aus." : "Es lief nichts, das man beenden könnte.", !data);
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

function gwMusikName(id) {
  const z = GW_MUSIK_STORYS.find(([k]) => k === id);
  return z ? z[1] : id;
}

async function gwMusikHochladen(id, feld) {
  const datei = feld && feld.files && feld.files[0];
  if (feld) feld.value = "";
  if (!datei || !supabaseClient || !GW_MUSIK_STORYS.some(([k]) => k === id)) return;
  if (!/^audio\//.test(datei.type || "")) { gwLiveStatus("gw-musik-status", "Das ist keine Audiodatei.", true); return; }
  if (datei.size > 15 * 1024 * 1024) { gwLiveStatus("gw-musik-status", "Die Datei ist größer als 15 MB.", true); return; }
  gwLiveStatus("gw-musik-status", "Lade „" + datei.name + "“ für " + gwMusikName(id) + " hoch …", false);
  try {
    const { error } = await supabaseClient.storage.from("live-musik").upload(id, datei, { upsert: true, contentType: datei.type, cacheControl: "60" });
    if (error) throw error;
    /* Neue Version: alle Browser holen die Datei frisch, statt die
       alte aus dem Cache zu spielen. */
    const version = Date.now().toString(36);
    const { error: e2 } = await supabaseClient.rpc("admin_story_musik", { p_story: id, p_version: version });
    if (e2) throw e2;
    gwLiveStatus("gw-musik-status", "✓ „" + datei.name + "“ ist jetzt die Musik für " + gwMusikName(id) + ".", false);
    if (id.indexOf("schlacht") === 0) window.dispatchEvent(new CustomEvent("fhSchlachtMusikNeu"));
    gwStoryLageLaden();
  } catch (err) {
    console.error("Musik hochladen fehlgeschlagen:", err);
    gwLiveStatus("gw-musik-status", "Hochladen fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 34 eingespielt?", true);
  }
}

async function gwMusikEntfernen(id) {
  if (!supabaseClient) return;
  if (!gwMusikVersion(id)) { gwLiveStatus("gw-musik-status", gwMusikName(id) + " hat keine eigene Musik.", true); return; }
  try {
    const { error } = await supabaseClient.storage.from("live-musik").remove([id]);
    if (error) throw error;
    const { error: e2 } = await supabaseClient.rpc("admin_story_musik", { p_story: id, p_version: null });
    if (e2) throw e2;
    gwLiveStatus("gw-musik-status", id === "disco"
      ? "✓ Eigene Disco-Musik entfernt – es läuft wieder music/disco.mp3."
      : id.indexOf("schlacht") === 0
        ? "✓ Eigene Musik für " + gwMusikName(id) + " entfernt – es läuft wieder die erzeugte Synth-Musik."
        : "✓ Musik für " + gwMusikName(id) + " entfernt – die Story läuft wieder still.", false);
    if (id.indexOf("schlacht") === 0) window.dispatchEvent(new CustomEvent("fhSchlachtMusikNeu"));
    gwStoryLageLaden();
  } catch (err) {
    gwLiveStatus("gw-musik-status", "Entfernen fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

let gwMusikAudio = null, gwMusikAudioId = null;

/* Ohne Datei: die im Browser erzeugte Musik des Kampforts anhören
   (schlacht-klang.js). Endet beim Verlassen des Gateways. */
let gwSynthId = null, gwSynthUhr = null;
function gwSynthProbeAus() {
  clearInterval(gwSynthUhr);
  if (gwSynthId && window.fhSchlachtKlang) window.fhSchlachtKlang.stop("gateway");
  gwSynthId = null;
}
function gwSynthProbe(id) {
  const k = window.fhSchlachtKlang;
  if (gwSynthId === id) { gwSynthProbeAus(); gwLiveStatus("gw-musik-status", "Angehalten.", false); return; }
  if (!k.istAn()) { gwLiveStatus("gw-musik-status", "Der Ton der Sternenschlacht ist ausgeschaltet – im Hangar oder in der Schlacht einschalten.", true); return; }
  k.ort(id === "schlacht" ? null : id.slice("schlacht_".length));
  k.start("gateway");
  gwSynthId = id;
  clearInterval(gwSynthUhr);
  gwSynthUhr = setInterval(() => {
    const g = document.getElementById("gateway");
    if (!g || !g.classList.contains("active-page")) gwSynthProbeAus();
  }, 1000);
  gwLiveStatus("gw-musik-status", "Spielt die erzeugte Musik: " + gwMusikName(id) + " – nochmal „Anhören“ zum Anhalten.", false);
}

function gwMusikProbe(id) {
  if (gwMusikAudio && !gwMusikAudio.paused) {
    gwMusikAudio.pause();
    const gleich = gwMusikAudioId === id;
    gwMusikAudio = null;
    if (gleich) { gwLiveStatus("gw-musik-status", "Angehalten.", false); return; }
  }
  const v = gwMusikVersion(id);
  let url = id === "disco" ? "music/disco.mp3" : null;
  if (v) {
    try { url = supabaseClient.storage.from("live-musik").getPublicUrl(id).data.publicUrl + "?v=" + encodeURIComponent(v); } catch (e) { /* bleibt */ }
  }
  if (!url && id.indexOf("schlacht") === 0 && window.fhSchlachtKlang) { gwSynthProbe(id); return; }
  if (!url) { gwLiveStatus("gw-musik-status", gwMusikName(id) + " hat noch keine Musik – erst eine Datei wählen.", true); return; }
  gwSynthProbeAus();
  gwMusikAudio = new Audio(url);
  gwMusikAudioId = id;
  gwMusikAudio.volume = 0.6;
  gwMusikAudio.play().then(
    () => gwLiveStatus("gw-musik-status", "Spielt: " + gwMusikName(id) + " – nochmal „Anhören“ zum Anhalten.", false),
    () => gwLiveStatus("gw-musik-status", "Konnte nicht abgespielt werden – ist die Datei vorhanden?", true));
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
  if (!supabaseClient) return false;
  gwLiveStatus("gw-live-status", "Sende ...", false);
  try {
    const { data, error } = await supabaseClient.from("live_event").update(update).eq("id", 1).select("id");
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      gwLiveStatus("gw-live-status", "Nichts angekommen: keine Schreibrechte. Ist Migration 23 eingespielt und bist du als Admin angemeldet?", true);
      return false;
    }
    gwLiveStatus("gw-live-status", `✓ ${was} an alle gesendet (${new Date().toLocaleTimeString("de-DE")})`, false);
    return true;
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
  if (anAlle) {
    liveSend({ message: text, message_color: farbe, message_from: von || null, message_at: liveJetzt() }, "Nachricht")
      .then((ok) => { if (ok) gwLogbuch((von ? von + ": " : "") + text); });
  }
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

/* ------------------------------------------------------
   PIRATENPASS-XP VERTEILEN (Migration 44)
   An alle ueber einen Live-Grant, an einzelne direkt. Die Saison
   folgt im Browser aus dem Datum (getCurrentPirateSeason) und geht
   mit; die Datenbank deckelt auf 1 bis 5000 je Vergabe.
------------------------------------------------------ */
function gwPassXpEingabe(statusId) {
  const pass = typeof getCurrentPirateSeason === "function" ? getCurrentPirateSeason() : null;
  if (!pass) { gwLiveStatus(statusId, "Gerade läuft keine Piratenpass-Saison – Pass-XP hätten kein Ziel.", true); return null; }
  const xp = parseInt((document.getElementById("gw-live-passxp") || {}).value, 10) || 0;
  if (xp < 1 || xp > 5000) { gwLiveStatus(statusId, "Pass-XP zwischen 1 und 5000.", true); return null; }
  return { xp: xp, passId: pass.passId, name: pass.name };
}

async function gwPassXpAnAlle() {
  const e = gwPassXpEingabe("gw-geschenk-status");
  if (!e || !supabaseClient) return;
  gwLiveStatus("gw-geschenk-status", "Verteile ...", false);
  try {
    const { error } = await supabaseClient.rpc("admin_pass_xp_an_alle", { p_xp: e.xp, p_pass_id: e.passId });
    if (error) throw error;
    gwLiveStatus("gw-geschenk-status", `✓ ${e.xp} Pass-XP (${e.name}) an alle verteilt`, false);
  } catch (err) {
    console.error("Pass-XP an alle fehlgeschlagen:", err);
    gwLiveStatus("gw-geschenk-status", "Verteilen fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 44 eingespielt?", true);
  }
}

async function gwPassXpSpielerSuchen() {
  const suche = ((document.getElementById("gw-passxp-suche") || {}).value || "").trim();
  const liste = document.getElementById("gw-passxp-treffer");
  if (!liste || !supabaseClient) return;
  if (!suche) { gwLiveStatus("gw-passxp-status", "Erst einen Namen eingeben.", true); return; }
  liste.replaceChildren();
  try {
    const { data, error } = await supabaseClient.rpc("admin_spieler_suchen", { p_suche: suche });
    if (error) throw error;
    if (!data || !data.length) { gwLiveStatus("gw-passxp-status", "Niemand gefunden.", true); return; }
    gwLiveStatus("gw-passxp-status", data.length + " Treffer", false);
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
      knopf.textContent = "Pass-XP geben";
      knopf.addEventListener("click", () => gwPassXpAnSpieler(sp.firebase_uid, sp.nickname || ""));
      zeile.append(name, id, knopf);
      liste.appendChild(zeile);
    });
  } catch (err) {
    console.error("Spielersuche fehlgeschlagen:", err);
    gwLiveStatus("gw-passxp-status", "Suche fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gwPassXpAnSpieler(uid, name) {
  const e = gwPassXpEingabe("gw-passxp-status");
  if (!e || !supabaseClient) return;
  try {
    const { error } = await supabaseClient.rpc("admin_pass_xp_an_spieler", { p_uid: uid, p_xp: e.xp, p_pass_id: e.passId });
    if (error) throw error;
    gwLiveStatus("gw-passxp-status", `✓ ${e.xp} Pass-XP an ${name || uid} vergeben`, false);
  } catch (err) {
    console.error("Pass-XP an Spieler fehlgeschlagen:", err);
    gwLiveStatus("gw-passxp-status", "Vergeben fehlgeschlagen: " + ((err && err.message) || err) + " – ist Migration 44 eingespielt?", true);
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
      { id: "seiten", kurz: "Seiten", titel: "Seiten ein-/ausschalten" },
      { id: "pass2", kurz: "Piratenpass 2", titel: "Piratenpass #2 freischalten" },
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
      { id: "mystery", kurz: "Mystery Gift", titel: "Mystery-Gift-Käufe" },
      { id: "support", kurz: "Support", titel: "Support-Meldungen" },
      { id: "caps", kurz: "Cap-Zusagen", titel: "Cap-Zusagen" },
      { id: "tanz", kurz: "Tanz-Zusagen", titel: "Tanz-Zusagen (Piratenpass 2)" },
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
      <div id="gateway-mystery-hinweis"></div>
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
    seiten: buildGatewaySeitenHtml(),
    pass2: buildGatewayPass2Html(),
    band: buildGatewayBandHtml(),
    spielothek: buildGatewaySpielothekHtml(),
    turnier: `<div id="gateway-tournament-sub">Lade Turnierstatus...</div>`,
    rennen: buildGatewayRennenHtml(),
    boss: `<div id="gateway-boss">Lade Boss ...</div>`,
    codeliste: buildGatewayCodeListeHtml(),
    codes: buildGatewayCodesHtml(),
    spieler: buildGatewaySpielerHtml(),
    identitaet: buildGatewayIdentitaetHtml(),
    mystery: `<div id="gateway-mystery">Lade Käufe ...</div>`,
    support: `<div id="gateway-support">Lade Meldungen ...</div>`,
    caps: `<div id="gateway-caps">Lade Caps ...</div>`,
    tanz: `<div id="gateway-tanz">Lade Tanz-Zusagen ...</div>`,
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
  gatewaySperrenLaden();
  ladeGatewayBoss();
  ladeGatewayCaps();
  ladeGatewayTanz();
  ladeGatewaySupport();
  ladeGatewayMystery();
  gwMysteryBeobachten();
  ladeGatewayVerlosung();
  ladeGatewayAngriffMarker();
  gwCodeListeLaden();
  gwStoryLageLaden();
  gwDrehbuchStarten();

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
      ${buildGatewayTurnierFeinHtml(tournament, matches, participants)}
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
function buildGatewayTurnierFeinHtml(tournament, matches, participants) {
  const offen = (matches || []).filter((m) => m.status === "open");
  const raus = new Set((participants || []).filter((p) => p.ausgeschlossen).map((p) => p.firebase_uid));

  const matchListe = offen.length
    ? offen.map((m) => `
        <p class="gateway-status-sub">
          Runde ${m.round}: <strong>${escapeHtml(m.player_1_nickname || "?")}</strong> gegen <strong>${escapeHtml(m.player_2_nickname || "?")}</strong>
          ${raus.has(m.player_1_uid) && raus.has(m.player_2_uid) ? `<em>(beide ausgeschlossen – bitte von Hand entscheiden)</em>` : ""}
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

      <h3 class="gateway-untertitel">Spieler ausschließen</h3>
      ${buildGatewayTurnierAusschlussHtml(tournament, participants)}

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

/* Migration 37: Ein ausgeschlossener Spieler verliert jedes Match
   automatisch an seinen Gegner - sichtbar, im Baum steht
   "ausgeschlossen". Steht er gerade in einem offenen Match, ist es
   sofort entschieden; sonst, sobald sein naechstes Match offen ist.
   Sind beide ausgeschlossen, bleibt das Match offen (oben von Hand). */
function buildGatewayTurnierAusschlussHtml(tournament, participants) {
  const liste = participants || [];
  if (!liste.length) return `<p class="gateway-status-sub">Noch keine Teilnehmer.</p>`;
  const zeilen = liste.map((p) => {
    const zustand = p.ausgeschlossen ? "ausgeschlossen" : p.eliminated ? "ausgeschieden" : "im Rennen";
    return `
      <p class="gateway-status-sub">
        <strong>${escapeHtml(p.nickname || "?")}</strong> – ${zustand}
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayTeilnehmerAusschliessen('${escapeHtml(tournament.id)}', '${escapeHtml(p.firebase_uid)}', ${!p.ausgeschlossen})">${p.ausgeschlossen ? "Wieder zulassen" : "Ausschließen"}</button>
      </p>`;
  }).join("");
  return `${zeilen}
    <p class="gateway-preview-hint">Ausgeschlossene verlieren jedes Match automatisch an ihren Gegner; im Turnierbaum steht bei ihnen „ausgeschlossen“. „Wieder zulassen“ gilt nur für kommende Matches.</p>`;
}

async function gatewayTeilnehmerAusschliessen(tournamentId, uid, aus) {
  const statusEl = document.getElementById("gateway-tournament-status");
  if (aus && !window.confirm("Diesen Spieler von der Challenge ausschließen?\n\nSein offenes Match geht sofort an den Gegner, alle weiteren ebenfalls. Im Turnierbaum steht bei ihm „ausgeschlossen“.")) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_teilnehmer_ausschliessen", {
      p_tournament_id: tournamentId, p_uid: uid, p_aus: !!aus,
    });
    if (error) throw error;
    await renderGatewayPage();
    const el = document.getElementById("gateway-tournament-status");
    if (el) el.textContent = aus ? "✓ Ausgeschlossen" + (data > 0 ? " – " + data + " Match" + (data === 1 ? "" : "es") + " sofort entschieden." : ".") : "✓ Wieder zugelassen.";
  } catch (err) {
    console.error("Ausschließen fehlgeschlagen:", err);
    const m = String((err && err.message) || err);
    if (statusEl) statusEl.textContent = "⚠️ " + (/admin_teilnehmer_ausschliessen|function/i.test(m) ? m + " – ist Migration 37 eingespielt?" : m);
  }
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
      <summary>Gesperrte Spielkonten</summary>
      <p class="gateway-status-sub">Eine Sperre blockiert Spielaktionen direkt in der Datenbank. Support-Meldungen bleiben möglich.</p>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewaySperrenLaden()">Sperrliste laden</button>
      <div id="gateway-sperren-liste"></div>
    </details>

    <details class="gateway-details">
      <summary>Gesperrte Namen</summary>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayGesperrteNamen()">Liste laden</button>
      <div id="gateway-namen-liste"></div>
    </details>
  `;
}

async function gatewaySperrenLaden() {
  const liste = document.getElementById("gateway-sperren-liste");
  if (!liste || !supabaseClient) return;
  liste.replaceChildren();
  const ladehinweis = document.createElement("p");
  ladehinweis.className = "gateway-status-sub";
  ladehinweis.textContent = "Lade Sperren …";
  liste.appendChild(ladehinweis);

  try {
    const { data, error } = await supabaseClient.rpc("admin_account_suspensions");
    if (error) throw error;
    liste.replaceChildren();
    if (!data || !data.length) {
      const leer = document.createElement("p");
      leer.className = "gateway-status-sub";
      leer.textContent = "Keine aktiven Sperren.";
      liste.appendChild(leer);
      return;
    }

    data.forEach((sperre) => {
      const zeile = document.createElement("div");
      zeile.className = "gateway-spieler-karte";
      const titel = document.createElement("p");
      titel.className = "gateway-spieler-kopf";
      const name = document.createElement("strong");
      name.textContent = sperre.nickname || "(ohne Namen)";
      const marke = document.createElement("span");
      marke.className = "gateway-spieler-marken";
      marke.textContent = sperre.source === "anti-cheat" ? "Anti-Cheat-Prüfung" : "Manuelle Sperre";
      titel.append(name, marke);

      const id = document.createElement("p");
      id.className = "gateway-status-sub";
      const code = document.createElement("code");
      code.textContent = sperre.account_uid;
      id.appendChild(code);

      const grund = document.createElement("p");
      grund.className = "gateway-status-sub";
      grund.textContent = "Grund: " + String(sperre.reason || "—") +
        " · seit " + (sperre.created_at ? String(sperre.created_at).slice(0, 16).replace("T", " ") : "unbekannt") +
        (sperre.created_by ? " · von " + sperre.created_by : "");

      const entsperren = document.createElement("button");
      entsperren.type = "button";
      entsperren.className = "code-button gateway-inline-btn";
      entsperren.textContent = "Nach Prüfung entsperren";
      entsperren.addEventListener("click", () => gatewayAccountEntsperren(sperre.account_uid));

      zeile.append(titel, id, grund, entsperren);
      liste.appendChild(zeile);
    });
  } catch (err) {
    console.error("Sperrliste konnte nicht geladen werden:", err);
    liste.replaceChildren();
    const fehler = document.createElement("p");
    fehler.className = "wheel-status";
    fehler.textContent = "Sperrliste konnte nicht geladen werden: " + ((err && err.message) || err);
    liste.appendChild(fehler);
  }
}

async function gatewayAccountSperren(uid) {
  if (!supabaseClient) return;
  const grund = window.prompt("Pflichtgrund für die vorläufige Spielersperre (wird protokolliert):", "");
  if (grund === null) return;
  if (!grund.trim()) {
    gatewaySpielerStatus("Bitte einen Grund eintragen.", true);
    return;
  }
  if (!window.confirm("Spielzugriff dieser Person jetzt sperren? Aktive Spielaktionen werden serverseitig blockiert.")) return;

  try {
    const { error } = await supabaseClient.rpc("admin_account_suspend", {
      p_uid: uid,
      p_reason: grund.trim(),
    });
    if (error) throw error;
    gatewaySpielerStatus("Spielzugriff gesperrt. Grund und Aktion wurden protokolliert.");
    await Promise.all([gatewaySperrenLaden(), gatewaySpielerSuchen()]);
  } catch (err) {
    console.error("Spieler sperren fehlgeschlagen:", err);
    gatewaySpielerStatus("Sperre fehlgeschlagen: " + ((err && err.message) || err), true);
  }
}

async function gatewayAccountEntsperren(uid) {
  if (!supabaseClient) return;
  const grund = window.prompt("Pflichtgrund für die Entsperrung nach manueller Prüfung (wird protokolliert):", "");
  if (grund === null) return;
  if (!grund.trim()) {
    gatewaySpielerStatus("Bitte den Prüfgrund eintragen.", true);
    return;
  }
  if (!window.confirm("Spielzugriff nach der Prüfung wieder freigeben?")) return;

  try {
    const { error } = await supabaseClient.rpc("admin_account_unsuspend", {
      p_uid: uid,
      p_reason: grund.trim(),
    });
    if (error) throw error;
    gatewaySpielerStatus("Sperre aufgehoben. Die Prüfung und Entsperrung wurden protokolliert.");
    await Promise.all([gatewaySperrenLaden(), gatewaySpielerSuchen()]);
  } catch (err) {
    console.error("Spieler entsperren fehlgeschlagen:", err);
    gatewaySpielerStatus("Entsperren fehlgeschlagen: " + ((err && err.message) || err), true);
  }
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
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayCodesAbgleichen('${id}', ${Number(sp.codes_cracked) || 0})">Codes mit Einlösungen abgleichen</button>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayNameSperren('${id}')">Namen sperren</button>
      <button type="button" class="code-button gateway-inline-btn" onclick="gatewayAccountSperren('${id}')">Spielzugriff sperren</button>
    </div>`;
}

async function gatewayCodesAbgleichen(uid, bisher) {
  if (!supabaseClient) return;
  const grund = window.prompt(
    "Prüfgrund für den Abgleich mit dem serverseitigen Einlösungsprotokoll (wird protokolliert):",
    ""
  );
  if (grund === null) return;
  if (!grund.trim()) {
    gatewaySpielerStatus("Bitte einen Prüfgrund eintragen.", true);
    return;
  }
  if (!window.confirm(
    "Der Ranglistenzähler dieses Kontos wird aus verifizierten Einlösungen neu berechnet. " +
    "Der aktuelle Stand ist " + bisher + " Codes. Fortfahren?"
  )) return;

  try {
    const { data, error } = await supabaseClient.rpc("admin_codes_abgleichen", {
      p_uid: uid,
      p_reason: grund.trim(),
    });
    if (error) throw error;
    const ergebnis = Array.isArray(data) ? data[0] : data;
    gatewaySpielerStatus(
      "Codes abgeglichen: " + (ergebnis?.count_before ?? bisher) + " → " +
      (ergebnis?.count_after ?? "?") + " bestätigte Einlösungen. Prüfgrund protokolliert."
    );
    await gatewaySpielerSuchen();
  } catch (err) {
    console.error("Code-Abgleich fehlgeschlagen:", err);
    gatewaySpielerStatus("Abgleich fehlgeschlagen: " + ((err && err.message) || err), true);
  }
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
   TANZ-ZUSAGEN (Migration 54)
   Endbelohnung der Kapitaensspur in Piratenpass 2: ein Tanz nach
   Wahl fuer 500 V-Bucks. Der Spieler nennt Epic-Name und Tanz; nach
   "Verschenkt" loescht der Server den Epic-Namen wieder.
------------------------------------------------------ */
async function ladeGatewayTanz() {
  const ziel = document.getElementById("gateway-tanz");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_tanz_zusagen");
    if (error) throw error;
    const zusagen = data || [];
    const offen = zusagen.filter((z) => !z.erledigt_am).length;
    const liste = zusagen.length
      ? zusagen.map((z) => `
          <p class="gateway-status-sub">
            <strong>${escapeHtml(z.nickname || "?")}</strong>
            ${z.erledigt_am
              ? `– verschenkt am ${escapeHtml(String(z.erledigt_am).slice(0, 10))}: ${escapeHtml(z.tanz)}`
              : `– Epic: <code>${escapeHtml(z.epic_name || "?")}</code> · Tanz: <strong>${escapeHtml(z.tanz)}</strong> (${escapeHtml(String(z.vbucks))} V-Bucks) · seit ${escapeHtml(String(z.angefragt_am).slice(0, 10))}
                 <button type="button" class="code-button gateway-inline-btn" data-tanz-uid="${escapeHtml(z.uid)}" data-tanz-pass="${escapeHtml(z.pass_id)}">Verschenkt</button>`}
          </p>`).join("")
      : `<p class="gateway-status-sub">Noch niemand hat den Tanz angefordert.</p>`;
    ziel.innerHTML = `
      <p class="gateway-status-sub"><strong>${offen} offen</strong>, ${zusagen.length - offen} verschenkt.</p>
      ${liste}
      <p id="gateway-tanz-status" class="wheel-status"></p>
    `;
    ziel.querySelectorAll("[data-tanz-uid]").forEach((knopf) => {
      knopf.addEventListener("click", () => gwTanzErledigt(knopf.dataset.tanzUid, knopf.dataset.tanzPass));
    });
  } catch (err) {
    console.error("Tanz-Zusagen konnten nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Tanz-Zusagen konnten nicht geladen werden – ist Migration 54 eingespielt?</p>`;
  }
}

async function gwTanzErledigt(uid, passId) {
  if (!confirm("Als verschenkt abhaken? Der Epic-Name wird dabei gelöscht.")) return;
  try {
    const { error } = await supabaseClient.rpc("admin_tanz_erledigt", { p_uid: uid, p_pass_id: passId });
    if (error) throw error;
    ladeGatewayTanz();
  } catch (err) {
    console.error("Tanz abhaken fehlgeschlagen:", err);
    const el = document.getElementById("gateway-tanz-status");
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

/* ------------------------------------------------------
   MYSTERY GIFT - KAEUFE (Migration 44)
   Jeder Kauf aus dem Shop landet hier. Offene oben; "Erledigt",
   sobald das Geschenk uebergeben ist. Offene Kaeufe stehen zusaetzlich
   als Hinweis ganz oben in der Uebersicht.
------------------------------------------------------ */
async function ladeGatewayMystery() {
  const ziel = document.getElementById("gateway-mystery");
  const hinweis = document.getElementById("gateway-mystery-hinweis");
  if (!ziel || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("admin_mystery_gift_kaeufe");
    if (error) throw error;
    const kaeufe = data || [];
    const offen = kaeufe.filter((k) => !k.erledigt_am).length;

    if (hinweis) {
      hinweis.innerHTML = offen
        ? `<button type="button" class="gw-mystery-hinweis" onclick="gwZeige('community', 'mystery')">🎁 ${offen} ${offen === 1 ? "offener Mystery-Gift-Kauf" : "offene Mystery-Gift-Käufe"} – ansehen</button>`
        : "";
    }

    if (!kaeufe.length) {
      ziel.innerHTML = `<p class="gateway-status-sub">Noch niemand hat das Mystery Gift gekauft. Es steht in etwa jeder zwanzigsten Stunde im Shop und kostet 100.000 Dublonen.</p>`;
      return;
    }
    ziel.innerHTML = `<p class="gateway-status-sub">${offen} offen · ${kaeufe.length - offen} erledigt</p>` + kaeufe.map((k) => `
      <div class="gateway-meldung${k.erledigt_am ? " ist-erledigt" : ""}">
        <p class="gateway-status-sub">
          🎁 <strong>${escapeHtml(k.spielername || "ohne Namen")}</strong>
          · <code>${escapeHtml(String(k.firebase_uid).slice(0, 8))}</code>
          · ${escapeHtml(new Date(k.gekauft_am).toLocaleString("de-DE"))}
          · ${Number(k.preis).toLocaleString("de-DE")} 💰
          ${k.erledigt_am ? " · erledigt " + escapeHtml(new Date(k.erledigt_am).toLocaleDateString("de-DE")) : ""}
        </p>
        <button type="button" class="code-button gateway-inline-btn" onclick="gatewayMysteryErledigt(${Number(k.id)}, ${!k.erledigt_am})">${k.erledigt_am ? "Wieder öffnen" : "Erledigt"}</button>
      </div>`).join("");
  } catch (err) {
    console.error("Mystery-Gift-Käufe konnten nicht geladen werden:", err);
    ziel.innerHTML = `<p class="wheel-status">⚠️ Käufe konnten nicht geladen werden. Ist Migration 44 eingespielt?</p>`;
  }
}

/* Solange der Admin-Bereich offen ist, jede Minute nachsehen - ein
   Kauf soll auftauchen, ohne dass man neu laden muss. */
let gwMysteryUhr = null;
function gwMysteryBeobachten() {
  if (gwMysteryUhr) return;
  gwMysteryUhr = setInterval(function () {
    const seite = document.getElementById("gateway-content");
    if (!seite || !document.getElementById("gateway-mystery")) { clearInterval(gwMysteryUhr); gwMysteryUhr = null; return; }
    if (!document.hidden) ladeGatewayMystery();
  }, 60000);
}

async function gatewayMysteryErledigt(id, erledigt) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.rpc("admin_mystery_gift_erledigt", { p_id: id, p_erledigt: erledigt });
    if (error) throw error;
  } catch (err) {
    console.error("Mystery-Gift-Kauf konnte nicht umgestellt werden:", err);
  }
  ladeGatewayMystery();
}

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
