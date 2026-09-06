/* ======================================================
   PIRATENPASS
   ---------------------------------------------------
   Horizontale Schatzroute mit 50 Stufen (siehe PIRATE_PASSES in
   scripts/core/progression-data.js). Nutzt den zentralen Reward-
   Dispatcher claimReward() (scripts/core/progression.js) fuer jede
   Stufen-Belohnung - keine eigene Belohnungslogik.

   KEIN eigener Menüpunkt/keine eigene Seite: der Pass ersetzt den
   bestehenden "???"-Bereich an genau derselben Stelle, sobald dessen
   Countdown abgelaufen ist - siehe updateStreamRaetselView() in
   scripts/streamraetsel/streamraetsel.js, die renderPassPage() unten
   direkt aufruft. Alle CSS-Klassen sind mit "piratenpass-" praefigiert
   (siehe style.css) - keine globalen Selektoren, die andere Bereiche
   der Website beeinflussen koennten.
====================================== */

function passStatusEmoji(state) {
  return state === "claimed" ? "🟢" : state === "ready" ? "🟡" : "🔒";
}

function passRewardIcon(reward) {
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

function passRewardLabel(reward, isEn) {
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

/* Groesse eines Stufen-Knotens - variiert bewusst (Auftrag Punkt 5):
   normale Belohnungen klein, Avatare "besonders", jede 10. Stufe ein
   groesserer Meilenstein, Stufe 50 das große Finale. Rein abgeleitet
   aus vorhandenen Daten (Stufennummer + Belohnungstyp), keine
   zusaetzliche Konfiguration noetig. */
function getPassNodeSize(pass, tier, reward) {
  if (tier === pass.levels) return "finale";
  if (tier % 10 === 0) return "milestone";
  if (reward.type === "avatar" || reward.type === "temporary_avatar") return "special";
  return "normal";
}

function getPassRewardId(pass, tier) {
  return `pass_${pass.passId}_tier_${tier}`;
}

/* ------------------------------------------------------
   HORIZONTALE ROUTE
------------------------------------------------------ */
function buildPassRouteHtml(pass, currentTier, claimedIds, hasCap) {
  const displayCurrentTier = Math.max(1, currentTier);
  let html = `<span class="piratenpass-start-flag" aria-hidden="true">🏴</span>`;

  for (let tier = 1; tier <= pass.levels; tier++) {
    const reward = pass.rewards[tier];
    if (!reward) continue;

    const rewardId = getPassRewardId(pass, tier);
    const claimed = claimedIds.includes(rewardId) || (reward.type === "cap" && hasCap);
    const state = tier > currentTier ? "locked" : (claimed ? "claimed" : "ready");
    const size = getPassNodeSize(pass, tier, reward);
    const isCurrent = tier === displayCurrentTier;
    const icon = size === "finale" ? "🏝️" : passRewardIcon(reward);
    const badge = state === "claimed" ? "✓" : state === "locked" ? "🔒" : "";

    html += `
      <div class="piratenpass-node piratenpass-node-${size} piratenpass-node-${state}${isCurrent ? " piratenpass-node-current" : ""}"
           data-tier="${tier}" tabindex="0" role="button"
           aria-label="Stufe ${tier}: ${passRewardLabel(reward, false)}"
           onclick="showPassTierTooltip(${tier})"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showPassTierTooltip(${tier});}">
        ${isCurrent ? '<span class="piratenpass-node-current-tag">DU HIER</span>' : ""}
        <span class="piratenpass-node-icon" aria-hidden="true">${icon}</span>
        ${badge ? `<span class="piratenpass-node-status-badge">${badge}</span>` : ""}
        <span class="piratenpass-node-number">${tier}</span>
      </div>
    `;

    if (tier < pass.levels) {
      html += `<div class="piratenpass-connector${tier < currentTier ? " piratenpass-connector-filled" : ""}"></div>`;
    }
  }

  return html;
}

let piratenpassAutoScrolled = false;

function resetPiratenpassScrollState() {
  piratenpassAutoScrolled = false;
}

function scrollToCurrentPassTier() {
  const scrollEl = document.getElementById("piratenpass-scroll");
  const currentNode = scrollEl ? scrollEl.querySelector(".piratenpass-node-current") : null;
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
   HAUPTANSICHT - rendert IMMER in #streamraetsel-content (dem
   bisherigen "??? freigeschaltet"-Bereich), niemals in eine eigene
   Seite.
   ---------------------------------------------------
   piratenpassRenderToken schuetzt gegen sich ueberlappende
   Aufrufe (z.B. schnelles Verlassen+Wiederbetreten der Seite,
   waehrend der vorherige Firestore-Abruf noch laeuft): nur der
   ZULETZT gestartete Aufruf darf sein Ergebnis noch ins DOM
   schreiben - ein aelterer, inzwischen ueberholter Aufruf wuerde
   sonst das DOM (und damit auch die Scroll-Position) eines
   bereits neueren Renders wieder ueberschreiben.
------------------------------------------------------ */
let piratenpassRenderToken = 0;

async function renderPassPage() {
  const myRenderToken = ++piratenpassRenderToken;
  const container = document.getElementById("streamraetsel-content");
  if (!container || typeof PIRATE_PASSES === "undefined") return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";
  const active = typeof getCurrentPirateSeason === "function" ? getCurrentPirateSeason() : null;
  const pass = active || (typeof getLatestEndedPirateSeason === "function" ? getLatestEndedPirateSeason() : null);

  if (!pass) {
    const next = typeof getNextPirateSeason === "function" ? getNextPirateSeason() : null;
    const daysUntil = next ? Math.max(0, Math.ceil((resolvePassDates(next).start.getTime() - Date.now()) / 86400000)) : null;
    container.innerHTML = `
      <div class="piratenpass-wrap">
        <h1>🏴‍☠️ ${isEn ? "PIRATE PASS" : "PIRATENPASS"}</h1>
        <p class="piratenpass-empty-state">${
          next
            ? (isEn ? `The next Pirate Pass starts in ${daysUntil} days.` : `Der nächste Piratenpass startet in ${daysUntil} Tagen.`)
            : (isEn ? "No pass season is configured yet." : "Aktuell ist keine Piratenpass-Saison eingeplant.")
        }</p>
      </div>
    `;
    return;
  }

  let passXp = 0;
  let claimedIds = [];
  let hasCap = false;

  if (typeof supabaseClient !== "undefined" && supabaseClient && typeof wheelAuthReady !== "undefined") {
    try {
      const uid = await wheelAuthReady;
      if (uid) {
        const { data } = await withSupabaseRlsColdStartRetry(() =>
          supabaseClient
            .from("player_progression")
            .select("pass_id, pass_xp, claimed_reward_ids, has_flitzpiepen_cap")
            .eq("firebase_uid", uid)
            .maybeSingle()
        );
        if (data && data.pass_id === pass.passId) {
          passXp = data.pass_xp || 0;
        }
        claimedIds = (data && data.claimed_reward_ids) || [];
        hasCap = !!(data && data.has_flitzpiepen_cap);
      }
    } catch (err) {
      console.warn("Piratenpass-Fortschritt konnte nicht geladen werden:", err);
    }
  }

  // Waehrend des obigen await ist evtl. schon ein neuerer Aufruf
  // gestartet - dann diesen hier verwerfen, statt sein (veraltetes)
  // Ergebnis noch ins DOM zu schreiben.
  if (myRenderToken !== piratenpassRenderToken) return;

  const currentTier = typeof getPassTier === "function" ? getPassTier(passXp, pass) : 0;
  const isEnded = !active;
  const { end: passEnd } = resolvePassDates(pass);
  const daysLeft = Math.max(0, Math.ceil((passEnd.getTime() - Date.now()) / 86400000));

  const nextTierXp = currentTier < pass.levels ? passXpRequiredForTier(currentTier + 1) : passXpRequiredForTier(pass.levels);
  const tierBaseXp = passXpRequiredForTier(currentTier);
  const totalTierXp = passXpRequiredForTier(pass.levels);

  const capReached = currentTier >= pass.levels;
  // Stufe 50 kann bereits "eingeloest" (claimed_reward_ids) sein, OHNE
  // dass hasCap stimmt - naemlich dann, wenn zum Zeitpunkt des Klicks
  // alle 9 echten Caps schon vergeben waren und stattdessen Dublonen
  // kamen (siehe app.claim_pass_cap() in 08-pass-cap.sql). Ohne diese
  // Unterscheidung wuerde die Person hier fuer immer den "EINLÖSEN"-
  // Button sehen, obwohl sie schon (per Fallback) bedient wurde.
  const capRewardId = getPassRewardId(pass, pass.levels);
  const capRewardClaimed = claimedIds.includes(capRewardId);
  const routeHtml = buildPassRouteHtml(pass, currentTier, claimedIds, hasCap);

  container.innerHTML = `
    <div class="piratenpass-wrap">
      <div class="piratenpass-header">
        <h1>🏴‍☠️ ${pass.name}</h1>
        <div class="piratenpass-header-row">
          <span class="piratenpass-season-label">${isEn ? "SEASON 1" : "SAISON 1"}</span>
          <span class="piratenpass-days-left">${
            isEnded ? (isEn ? "Season ended" : "Saison beendet") : (isEn ? `Still ${daysLeft} days` : `Noch ${daysLeft} Tage`)
          }</span>
        </div>
        <p class="piratenpass-tier-heading">${isEn ? "TIER" : "STUFE"} ${currentTier} / ${pass.levels}</p>
        <div class="piratenpass-header-progressbar" role="progressbar" aria-valuenow="${currentTier}" aria-valuemin="0" aria-valuemax="${pass.levels}"
             aria-label="${isEn ? "Pass tier" : "Pass-Stufe"} ${currentTier}/${pass.levels}">
          <div class="piratenpass-header-progressbar-fill" style="width:${Math.round((currentTier / pass.levels) * 100)}%"></div>
        </div>
        <span class="piratenpass-header-xp">${passXp.toLocaleString(isEn ? "en-US" : "de-DE")} / ${totalTierXp.toLocaleString(isEn ? "en-US" : "de-DE")} Pass-XP</span>
      </div>

      <div class="piratenpass-scroll" id="piratenpass-scroll" tabindex="0" aria-label="${isEn ? "Pirate Pass route, scroll horizontally" : "Piratenpass-Route, horizontal scrollbar"}">
        <div class="piratenpass-route">
          ${routeHtml}
        </div>
      </div>

      ${capReached && !capRewardClaimed ? `
        <div class="piratenpass-cap-banner">
          <p class="piratenpass-cap-banner-title">🎉 ${isEn ? "YOU COMPLETED THE PIRATE PASS!" : "DU HAST DEN PIRATENPASS ABGESCHLOSSEN!"}</p>
          <p class="piratenpass-cap-banner-sub">${isEn ? "Your reward:" : "Deine Belohnung:"}</p>
          ${renderCapBadge(isEn)}
          <p class="piratenpass-cap-banner-note">${isEn
            ? `Only ${PASS_CAP_TOTAL_SLOTS} real caps exist worldwide - once they're gone, you'll get ${PASS_CAP_FALLBACK_CURRENCY} Doubloons instead.`
            : `Nur ${PASS_CAP_TOTAL_SLOTS} echte Caps gibt es weltweit - sind sie vergeben, bekommst du stattdessen ${PASS_CAP_FALLBACK_CURRENCY} Dublonen.`}</p>
          <button type="button" class="piratenpass-tooltip-claim-btn" onclick="claimPassTier(${pass.levels})">${isEn ? "COLLECT" : "EINLÖSEN"}</button>
        </div>
      ` : hasCap ? `
        <div class="piratenpass-cap-banner piratenpass-cap-banner-claimed">
          <p class="piratenpass-cap-banner-title">🏴‍☠️ ${isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap'}</p>
          ${renderCapBadge(isEn)}
        </div>
      ` : capRewardClaimed ? `
        <div class="piratenpass-cap-banner piratenpass-cap-banner-claimed">
          <p class="piratenpass-cap-banner-title">🎉 ${isEn ? "YOU COMPLETED THE PIRATE PASS!" : "DU HAST DEN PIRATENPASS ABGESCHLOSSEN!"}</p>
          <p class="piratenpass-cap-banner-sub">${isEn
            ? `All ${PASS_CAP_TOTAL_SLOTS} caps had already been claimed - as a thank you, you got ${PASS_CAP_FALLBACK_CURRENCY} Doubloons instead. 🪙`
            : `Alle ${PASS_CAP_TOTAL_SLOTS} Caps waren bereits vergeben - als Dankeschön hast du stattdessen ${PASS_CAP_FALLBACK_CURRENCY} Dublonen bekommen. 🪙`}</p>
        </div>
      ` : ""}
    </div>
  `;

  staggerReveal(container, ".piratenpass-node");

  // Erreichte Verbinder von links nach rechts wachsen lassen -
  // siehe scripts/core/path-draw.js.
  if (typeof fhDrawConnectors === "function") {
    fhDrawConnectors(container, ".piratenpass-connector-filled");
  }

  if (capReached || hasCap) upgradeCapBadgeIfImageExists();

  if (!piratenpassAutoScrolled) {
    scrollToCurrentPassTier();
    piratenpassAutoScrolled = true;
  }
}

/* ------------------------------------------------------
   STUFEN-TOOLTIP (beim Anklicken/Tappen eines Knotens)
------------------------------------------------------ */
function showPassTierTooltip(tier) {
  const pass = typeof getCurrentPirateSeason === "function" ? getCurrentPirateSeason() : null;
  if (!pass) return;
  const reward = pass.rewards[tier];
  if (!reward) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";

  const nodeEl = document.querySelector(`.piratenpass-node[data-tier="${tier}"]`);
  const state = nodeEl
    ? (nodeEl.classList.contains("piratenpass-node-locked") ? "locked"
      : nodeEl.classList.contains("piratenpass-node-claimed") ? "claimed" : "ready")
    : "locked";

  const existing = document.getElementById("piratenpass-tooltip-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "piratenpass-tooltip-overlay";
  overlay.className = "piratenpass-tooltip-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const icon = passRewardIcon(reward);
  const label = passRewardLabel(reward, isEn);
  const tierLabel = isEn ? "TIER" : "STUFE";

  const statusHtml = state === "claimed"
    ? `<p class="piratenpass-tooltip-status">✓ ${isEn ? "Already claimed" : "Bereits erhalten"}</p>`
    : state === "locked"
    ? `<p class="piratenpass-tooltip-status">🔒 ${isEn ? "Not reached yet" : "Noch nicht erreicht"}</p>`
    : `<p class="piratenpass-tooltip-status is-ready">🎁 ${isEn ? "Reward ready!" : "Belohnung bereit!"}</p>
       <button type="button" class="piratenpass-tooltip-claim-btn" onclick="claimPassTierFromTooltip(${tier})">${isEn ? "COLLECT" : "EINLÖSEN"}</button>`;

  overlay.innerHTML = `
    <div class="piratenpass-tooltip-card">
      <p class="piratenpass-tooltip-title">${icon} ${tierLabel} ${tier}</p>
      <p class="piratenpass-tooltip-reward">${label}</p>
      ${statusHtml}
      <button type="button" class="piratenpass-tooltip-close-btn">${isEn ? "Close" : "Schließen"}</button>
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

  overlay.querySelector(".piratenpass-tooltip-close-btn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);
}

async function claimPassTierFromTooltip(tier) {
  await claimPassTier(tier);
  const overlay = document.getElementById("piratenpass-tooltip-overlay");
  if (overlay) overlay.remove();
}

/* Bild-Preload mit Fallback: solange assets/piratenpass/cap.png noch
   nicht existiert (siehe Auftrag Punkt 14/11 aus dem urspruenglichen
   Gamification-Auftrag), zeigt die Seite ein textbasiertes Abzeichen
   statt eines kaputten <img>-Tags - kein Platzhalterbild noetig, das
   spaeter ersetzt werden muesste. Ein ueber innerHTML eingefuegtes
   <script>-Tag wuerde NICHT ausgefuehrt (Browser-Verhalten) - der
   Bild-Check laeuft deshalb separat in upgradeCapBadgeIfImageExists(),
   aufgerufen NACHDEM das Markup im DOM steht.
------------------------------------------------------ */
function renderCapBadge(isEn) {
  const label = isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap';
  return `
    <span class="piratenpass-cap-badge" id="piratenpass-cap-badge" data-label="${label}">
      <span class="piratenpass-cap-badge-fallback">
        <span class="piratenpass-cap-badge-emoji" aria-hidden="true">🧢</span>
        <span class="piratenpass-cap-badge-label">${label}</span>
      </span>
    </span>
  `;
}

function upgradeCapBadgeIfImageExists() {
  const el = document.getElementById("piratenpass-cap-badge");
  if (!el || typeof PIRATE_PASS_CAP_IMAGE === "undefined") return;

  const img = new Image();
  img.onload = () => {
    const target = document.getElementById("piratenpass-cap-badge");
    if (!target) return;
    target.innerHTML = `<img src="${PIRATE_PASS_CAP_IMAGE}" alt="${el.dataset.label}">`;
  };
  img.src = PIRATE_PASS_CAP_IMAGE;
}

async function claimPassTier(tier) {
  if (typeof getCurrentPirateSeason !== "function" || typeof claimReward !== "function") return;
  const pass = getCurrentPirateSeason();
  if (!pass) return;

  const reward = pass.rewards[tier];
  if (!reward) return;

  const rewardId = getPassRewardId(pass, tier);
  const result = await claimReward(rewardId, reward);
  if (result.ok) {
    // Kleiner 3D-Funkenausbruch bei jeder eingeloesten Stufe, ein
    // groesserer bei Meilenstein-/Finale-Stufen (dieselbe Unterscheidung
    // wie schon bei getPassNodeSize() fuer die Knotengroesse) - anders
    // als beim Jackpot in der Spielothek ist das Einloesen einer
    // Pass-Stufe von Natur aus schon ein seltener, bewusster Moment
    // (max. 50 Mal pro Saison), daher hier bei JEDER Stufe ein Effekt.
    if (typeof window.fhCelebrationBurst === "function") {
      const nodeEl = document.querySelector(`.piratenpass-node[data-tier="${tier}"]`);
      const size = getPassNodeSize(pass, tier, reward);
      const isBig = size === "milestone" || size === "finale";
      window.fhCelebrationBurst(nodeEl || document.body, {
        colors: [0xf0c96a, 0xd6a84f, 0xffffff],
        count: isBig ? 100 : 45,
        duration: isBig ? 1800 : 1100,
        size: isBig ? 11 : 8,
      });
    }
    renderPassPage();
  }
}
