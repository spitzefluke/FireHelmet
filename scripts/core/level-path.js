/* ======================================================
   PERSÖNLICHER LEVELPFAD
   ---------------------------------------------------
   Interaktive, horizontale Reise-Karte ueber das BEREITS
   VORHANDENE persoenliche XP/Level-System (siehe progression.js/
   progression-data.js) - visualisiert nur die vorhandenen Daten
   (xp, Level, LEVEL_REWARDS, claimedRewardIds), erzeugt kein
   zweites, eigenstaendiges Levelsystem und keine eigene
   Belohnungslogik (nutzt claimReward() unveraendert).

   ABGRENZUNG ZUM PIRATENPASS (scripts/piratenpass/piratenpass.js):
   Optisch verwandt (gleiches Baukasten-Prinzip: horizontale Route,
   Knoten, Tooltip-Karte, Auto-Scroll), aber bewusst ANDERS gerahmt
   und eingefaerbt - der Piratenpass ist eine SAISONALE Belohnungs-
   route (endet nach der Saison), dieser Levelpfad ist die DAUERHAFTE
   persoenliche Reise des Spielers (Level 1 bis PROGRESSION_MAX_LEVEL,
   bleibt ueber Saisons hinweg bestehen). Eigenes CSS-Praefix
   "fh-levelpath-" (siehe style.css) - keine geteilten Klassen mit
   piratenpass-*, damit eine Design-Aenderung am einen Pfad nie
   versehentlich den anderen mitveraendert.

   KEIN eigener Menuepunkt: der Einstieg ist ausschliesslich der
   bestehende Level-/XP-Bereich der Spielerkarte (Sidebar/Mobile-
   Leiste, renderPlayerCardHtml() in progression.js) - ein Klick
   darauf ruft openLevelPath() unten auf, ersetzt den vorherigen
   Sprung zu changePage('piratenpass').
====================================== */

function levelPathRewardIcon(reward) {
  if (!reward) return "";
  switch (reward.type) {
    case "coins": return "🪙";
    case "xp": return "✨";
    case "avatar": return "🎭";
    case "temporary_avatar": return "🎭";
    case "tool": return "🔧";
    case "cap": return "🧢";
    default: return "🎁";
  }
}

function levelPathRewardLabel(reward, isEn) {
  if (!reward) return "";
  switch (reward.type) {
    case "coins": return `${reward.amount} ${isEn ? "Doubloons" : "Dublonen"}`;
    case "xp": return `${reward.amount} XP`;
    case "avatar": return isEn ? "New avatar" : "Neuer Avatar";
    case "temporary_avatar": return isEn ? `Avatar (${reward.durationDays}d)` : `Avatar (${reward.durationDays} Tage)`;
    case "tool": return isEn ? "Tool" : "Werkzeug";
    case "cap": return isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap';
    default: return "";
  }
}

/* Knotengroesse - rein aus vorhandenen Daten abgeleitet (Levelnummer +
   Belohnungstyp), analog zu getPassNodeSize() im Piratenpass, aber als
   eigene Funktion (siehe Abgrenzungs-Kommentar oben). */
function getLevelPathNodeSize(level, reward) {
  if (level === PROGRESSION_MAX_LEVEL) return "finale";
  if (level % 10 === 0) return "milestone";
  if (reward && (reward.type === "avatar" || reward.type === "temporary_avatar")) return "special";
  return "normal";
}

/* ------------------------------------------------------
   HORIZONTALE ROUTE
------------------------------------------------------ */
function buildLevelPathRouteHtml(currentLevel, claimedIds) {
  const displayCurrentLevel = Math.max(1, currentLevel);
  let html = `<span class="fh-levelpath-start-flag" aria-hidden="true">🏴</span>`;

  for (let level = 1; level <= PROGRESSION_MAX_LEVEL; level++) {
    const reward = (typeof LEVEL_REWARDS !== "undefined" ? LEVEL_REWARDS[level] : null) || null;
    const rewardId = reward ? getLevelRewardId(level) : null;
    const claimed = !!(rewardId && claimedIds.includes(rewardId));
    const locked = level > currentLevel;
    const state = locked ? "locked" : (reward ? (claimed ? "claimed" : "ready") : "reached");
    const size = getLevelPathNodeSize(level, reward);
    const isCurrent = level === displayCurrentLevel;
    const icon = size === "finale" ? "🏝️" : (reward ? levelPathRewardIcon(reward) : "");
    const badge = state === "claimed" ? "✓" : locked ? "🔒" : (state === "ready" ? "🎁" : "");

    html += `
      <div class="fh-levelpath-node fh-levelpath-node-${size} fh-levelpath-node-${state}${isCurrent ? " fh-levelpath-node-current" : ""}${icon ? " fh-levelpath-node-has-icon" : ""}"
           data-level="${level}" tabindex="0" role="button"
           aria-label="Level ${level}${reward ? ": " + levelPathRewardLabel(reward, false) : ""}"
           onclick="showLevelPathNodeTooltip(${level})"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showLevelPathNodeTooltip(${level});}">
        ${isCurrent ? '<span class="fh-levelpath-node-current-tag">DU HIER</span>' : ""}
        ${icon ? `<span class="fh-levelpath-node-icon" aria-hidden="true">${icon}</span>` : ""}
        ${badge ? `<span class="fh-levelpath-node-status-badge">${badge}</span>` : ""}
        <span class="fh-levelpath-node-number">${level}</span>
      </div>
    `;

    if (level < PROGRESSION_MAX_LEVEL) {
      html += `<div class="fh-levelpath-connector${level < currentLevel ? " fh-levelpath-connector-filled" : ""}"></div>`;
    }
  }

  return html;
}

let levelPathAutoScrolled = false;

function scrollToCurrentLevelNode() {
  const scrollEl = document.getElementById("fh-levelpath-scroll");
  const currentNode = scrollEl ? scrollEl.querySelector(".fh-levelpath-node-current") : null;
  if (!scrollEl || !currentNode) return;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targetLeft = currentNode.offsetLeft - scrollEl.clientWidth / 2 + currentNode.offsetWidth / 2;
  if (reduceMotion) {
    scrollEl.scrollLeft = Math.max(0, targetLeft);
  } else {
    scrollEl.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }
}

/* ------------------------------------------------------
   KOPF DER KARTE: AKTUELLER SPIELER (Avatar/Name/Level/XP)
   ---------------------------------------------------
   Nutzt dieselben, bereits vorhandenen Bausteine wie die
   Spielerkarte (buildAvatarPickerHtml() aus wheel.js,
   getLevelProgress() aus progression.js) - keine zweite
   Level-/XP-Berechnung.
------------------------------------------------------ */
function buildLevelPathPlayerHeaderHtml(xp) {
  const nickname = localStorage.getItem("wheelNickname") || "";
  const safeNickname = typeof escapeHtml === "function" ? escapeHtml(nickname) : nickname;

  const provider = localStorage.getItem("loginProvider") || "";
  let avatar = "🏴‍☠️";
  if (provider === "discord") avatar = localStorage.getItem("discordAvatar") || avatar;
  else if (provider === "twitch") avatar = localStorage.getItem("twitchAvatar") || avatar;
  else avatar = localStorage.getItem("wheelAvatar") || avatar;
  const avatarHtml = typeof buildAvatarPickerHtml === "function" ? buildAvatarPickerHtml(avatar) : `<span>${avatar}</span>`;

  const progress = getLevelProgress(xp);
  const percent = progress.isMaxLevel ? 100 : Math.round((progress.xpIntoLevel / progress.xpForNextLevel) * 100);
  const levelLabel = typeof t === "function" ? t("progression.level", "LEVEL") : "LEVEL";
  const xpText = progress.isMaxLevel
    ? (typeof t === "function" ? t("progression.maxLevel", "Max. Level erreicht") : "Max. Level erreicht")
    : `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP`;

  return `
    <div class="fh-levelpath-player">
      <span class="fh-levelpath-player-avatar">${avatarHtml}</span>
      <div class="fh-levelpath-player-info">
        <p class="fh-levelpath-player-name">${safeNickname}</p>
        <p class="fh-levelpath-player-level">${levelLabel} ${progress.level}</p>
        <span class="fh-levelpath-player-xpbar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${xpText}">
          <span class="fh-levelpath-player-xpfill" style="width:${percent}%"></span>
        </span>
        <p class="fh-levelpath-player-xptext">${xpText}</p>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------
   MODAL OEFFNEN
   ---------------------------------------------------
   levelPathRenderToken schuetzt gegen sich ueberlappende Aufrufe
   (z.B. schnelles Schliessen+erneutes Oeffnen waehrend der
   vorherige Firestore-Abruf noch laeuft) - analog zu
   piratenpassRenderToken in piratenpass.js.
------------------------------------------------------ */
let levelPathRenderToken = 0;

async function openLevelPath() {
  const myRenderToken = ++levelPathRenderToken;
  levelPathAutoScrolled = false;

  const existing = document.getElementById("fh-levelpath-overlay");
  if (existing) existing.remove();

  let xp = 0;
  let claimedIds = [];

  if (typeof supabaseClient !== "undefined" && supabaseClient && typeof wheelAuthReady !== "undefined") {
    try {
      const uid = await wheelAuthReady;
      if (uid) {
        const { data } = await supabaseClient
          .from("player_progression")
          .select("xp, claimed_reward_ids")
          .eq("firebase_uid", uid)
          .maybeSingle();
        xp = (data && data.xp) || 0;
        claimedIds = (data && data.claimed_reward_ids) || [];
      }
    } catch (err) {
      console.warn("Levelpfad-Fortschritt konnte nicht geladen werden:", err);
    }
  }

  if (myRenderToken !== levelPathRenderToken) return;

  renderLevelPathOverlay(xp, claimedIds);
}

function renderLevelPathOverlay(xp, claimedIds) {
  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";
  const progress = getLevelProgress(xp);
  const currentLevel = progress.level;
  const isMaxLevel = progress.isMaxLevel;

  const overlay = document.createElement("div");
  overlay.id = "fh-levelpath-overlay";
  overlay.className = "fh-levelpath-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", isEn ? "Your personal level journey" : "Deine persönliche Levelreise");

  const maxLevelReward = typeof LEVEL_REWARDS !== "undefined" ? LEVEL_REWARDS[PROGRESSION_MAX_LEVEL] : null;
  const maxLevelRewardId = maxLevelReward ? getLevelRewardId(PROGRESSION_MAX_LEVEL) : null;
  const maxLevelClaimed = !!(maxLevelRewardId && claimedIds.includes(maxLevelRewardId));

  overlay.innerHTML = `
    <div class="fh-levelpath-card">
      <button type="button" class="fh-levelpath-close-btn" aria-label="${isEn ? "Close" : "Schließen"}">✕</button>

      ${buildLevelPathPlayerHeaderHtml(xp)}

      <p class="fh-levelpath-eyebrow">⭐ ${isEn ? "PERMANENT · YOUR JOURNEY" : "DAUERHAFT · DEINE REISE"}</p>
      <h1 class="fh-levelpath-title">🏴‍☠️ ${isEn ? "YOUR FLITZPIEPEN JOURNEY" : "DEINE FLITZPIEPEN-REISE"}</h1>

      <p class="fh-levelpath-heading">${isEn ? "LEVEL" : "LEVEL"} ${currentLevel} / ${PROGRESSION_MAX_LEVEL}</p>
      <div class="fh-levelpath-header-progressbar" role="progressbar" aria-valuenow="${currentLevel}" aria-valuemin="0" aria-valuemax="${PROGRESSION_MAX_LEVEL}"
           aria-label="${isEn ? "Level" : "Level"} ${currentLevel}/${PROGRESSION_MAX_LEVEL}">
        <div class="fh-levelpath-header-progressbar-fill" style="width:${Math.round((currentLevel / PROGRESSION_MAX_LEVEL) * 100)}%"></div>
      </div>

      <div class="fh-levelpath-scroll" id="fh-levelpath-scroll" tabindex="0" aria-label="${isEn ? "Level journey, scroll horizontally" : "Levelreise, horizontal scrollbar"}">
        <div class="fh-levelpath-route">
          ${buildLevelPathRouteHtml(currentLevel, claimedIds)}
        </div>
      </div>

      ${isMaxLevel ? `
        <div class="fh-levelpath-max-banner">
          <p class="fh-levelpath-max-banner-title">🏆 ${isEn ? "MAX LEVEL REACHED!" : "MAX LEVEL ERREICHT!"}</p>
          ${maxLevelReward && !maxLevelClaimed ? `
            <p class="fh-levelpath-max-banner-sub">${isEn ? "Your reward:" : "Deine Belohnung:"} ${levelPathRewardIcon(maxLevelReward)} ${levelPathRewardLabel(maxLevelReward, isEn)}</p>
            <button type="button" class="fh-levelpath-tooltip-claim-btn" onclick="claimLevelPathRewardFromTooltip(${PROGRESSION_MAX_LEVEL})">${isEn ? "COLLECT" : "EINLÖSEN"}</button>
          ` : `<p class="fh-levelpath-max-banner-sub">${isEn ? "You've reached the end of the journey - for now." : "Du hast das Ende der Reise erreicht - vorerst."}</p>`}
        </div>
      ` : ""}
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 300);
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  overlay.querySelector(".fh-levelpath-close-btn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);

  if (!levelPathAutoScrolled) {
    scrollToCurrentLevelNode();
    levelPathAutoScrolled = true;
  }
}

/* ------------------------------------------------------
   KNOTEN-TOOLTIP (beim Anklicken/Tappen eines Levels)
------------------------------------------------------ */
function showLevelPathNodeTooltip(level) {
  const nodeEl = document.querySelector(`.fh-levelpath-node[data-level="${level}"]`);
  if (!nodeEl) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";

  const reward = (typeof LEVEL_REWARDS !== "undefined" ? LEVEL_REWARDS[level] : null) || null;
  const state = nodeEl.classList.contains("fh-levelpath-node-locked") ? "locked"
    : nodeEl.classList.contains("fh-levelpath-node-claimed") ? "claimed"
    : nodeEl.classList.contains("fh-levelpath-node-ready") ? "ready"
    : "reached";

  const existing = document.getElementById("fh-levelpath-tooltip-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "fh-levelpath-tooltip-overlay";
  overlay.className = "fh-levelpath-tooltip-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const titleIcon = state === "locked" ? "🔒" : level % 10 === 0 ? "⭐" : "📍";
  const levelLabel = isEn ? "LEVEL" : "LEVEL";

  const rewardHtml = reward
    ? `<p class="fh-levelpath-tooltip-reward-label">${isEn ? "Reward" : "Belohnung"}</p>
       <p class="fh-levelpath-tooltip-reward">${levelPathRewardIcon(reward)} ${levelPathRewardLabel(reward, isEn)}</p>`
    : "";

  const statusHtml = state === "claimed"
    ? `<p class="fh-levelpath-tooltip-status">✓ ${isEn ? "Already claimed" : "Bereits erhalten"}</p>`
    : state === "locked"
    ? `<p class="fh-levelpath-tooltip-status">🔒 ${isEn ? "Not reached yet" : "Noch nicht erreicht"}</p>`
    : state === "ready"
    ? `<p class="fh-levelpath-tooltip-status is-ready">🎁 ${isEn ? "Reward ready!" : "Belohnung bereit!"}</p>
       <button type="button" class="fh-levelpath-tooltip-claim-btn" onclick="claimLevelPathRewardFromTooltip(${level})">${isEn ? "COLLECT" : "EINLÖSEN"}</button>`
    : `<p class="fh-levelpath-tooltip-status">✓ ${isEn ? "Reached" : "Bereits erreicht"}</p>`;

  overlay.innerHTML = `
    <div class="fh-levelpath-tooltip-card">
      <p class="fh-levelpath-tooltip-title">${titleIcon} ${levelLabel} ${level}</p>
      ${rewardHtml}
      ${statusHtml}
      <button type="button" class="fh-levelpath-tooltip-close-btn">${isEn ? "Close" : "Schließen"}</button>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 300);
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  overlay.querySelector(".fh-levelpath-tooltip-close-btn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);
}

async function claimLevelPathRewardFromTooltip(level) {
  const reward = typeof LEVEL_REWARDS !== "undefined" ? LEVEL_REWARDS[level] : null;
  if (!reward || typeof claimReward !== "function") return;

  const result = await claimReward(getLevelRewardId(level), reward);
  if (!result.ok) return;

  const tooltipOverlay = document.getElementById("fh-levelpath-tooltip-overlay");
  if (tooltipOverlay) tooltipOverlay.remove();

  // Karte im Hintergrund neu aufbauen, damit der Knoten sofort als
  // "eingeloest" markiert erscheint, ohne das ganze Modal neu zu oeffnen.
  if (typeof supabaseClient !== "undefined" && supabaseClient && typeof wheelAuthReady !== "undefined") {
    const uid = await wheelAuthReady;
    if (uid) {
      const { data } = await supabaseClient
        .from("player_progression")
        .select("xp, claimed_reward_ids")
        .eq("firebase_uid", uid)
        .maybeSingle();
      const existingOverlay = document.getElementById("fh-levelpath-overlay");
      if (existingOverlay) {
        existingOverlay.remove();
        renderLevelPathOverlay((data && data.xp) || 0, (data && data.claimed_reward_ids) || []);
        // Nach dem Neu-Rendern erneut zur aktuellen Stufe scrollen (das
        // frische Scroll-Element steht sonst wieder bei 0, unabhaengig
        // davon, wo der Spieler die Belohnung gerade eingeloest hat).
        scrollToCurrentLevelNode();
      }
    }
  }
}
