/* ======================================================
   PIRATENPASS
   ---------------------------------------------------
   Saison-Fortschritt mit 50 Stufen (siehe PIRATE_PASSES in
   scripts/core/progression-data.js). Nutzt den zentralen Reward-
   Dispatcher claimReward() (scripts/core/progression.js) fuer jede
   Stufen-Belohnung - keine eigene Belohnungslogik.

   KEIN eigener Menüpunkt/keine eigene Seite: der Pass ersetzt den
   bestehenden "???"-Bereich an genau derselben Stelle, sobald dessen
   Countdown abgelaufen ist - siehe updateStreamRaetselView() in
   scripts/streamraetsel/streamraetsel.js, die renderPassPage() unten
   direkt aufruft. Diese Datei bringt daher absichtlich KEINEN
   eigenen Seiten-Lebenszyklus-Hook (kein updatePiratenpassPage()) und
   KEINEN eigenen Countdown-Timer mit - beides uebernimmt die
   bestehende "???"-Logik.
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
    case "avatar": return isEn ? "Avatar" : "Avatar";
    case "temporary_avatar": return isEn ? `Avatar (${reward.durationDays}d)` : `Avatar (${reward.durationDays} Tage)`;
    case "tool": return isEn ? "Tool" : "Werkzeug";
    case "cap": return isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap';
    default: return "";
  }
}

/* ------------------------------------------------------
   HAUPTANSICHT - rendert IMMER in #streamraetsel-content (dem
   bisherigen "??? freigeschaltet"-Bereich), niemals in eine eigene
   Seite.
------------------------------------------------------ */
async function renderPassPage() {
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
      <h1>🏴‍☠️ ${isEn ? "PIRATE PASS" : "PIRATENPASS"}</h1>
      <p class="pass-empty-state">${
        next
          ? (isEn ? `The next Pirate Pass starts in ${daysUntil} days.` : `Der nächste Piratenpass startet in ${daysUntil} Tagen.`)
          : (isEn ? "No pass season is configured yet." : "Aktuell ist keine Piratenpass-Saison eingeplant.")
      }</p>
    `;
    return;
  }

  let passXp = 0;
  let claimedIds = [];
  let hasCap = false;

  if (typeof wheelDb !== "undefined" && wheelDb && typeof wheelAuthReady !== "undefined") {
    try {
      const uid = await wheelAuthReady;
      if (uid) {
        const snap = await wheelDb.collection("player_progression").doc(uid).get();
        const data = snap.exists ? snap.data() : {};
        if (data.passProgress && data.passProgress.passId === pass.passId) {
          passXp = data.passProgress.xp || 0;
        }
        claimedIds = data.claimedRewardIds || [];
        hasCap = !!data.hasFlitzpiepenCap;
      }
    } catch (err) {
      console.warn("Piratenpass-Fortschritt konnte nicht geladen werden:", err);
    }
  }

  const currentTier = typeof getPassTier === "function" ? getPassTier(passXp, pass) : 0;
  const isEnded = !active;
  const { end: passEnd } = resolvePassDates(pass);
  const daysLeft = Math.max(0, Math.ceil((passEnd.getTime() - Date.now()) / 86400000));

  const nextTierXp = currentTier < pass.levels ? passXpRequiredForTier(currentTier + 1) : passXpRequiredForTier(pass.levels);
  const tierBaseXp = passXpRequiredForTier(currentTier);
  const tierSpan = Math.max(1, nextTierXp - tierBaseXp);
  const tierPercent = currentTier >= pass.levels ? 100 : Math.round(((passXp - tierBaseXp) / tierSpan) * 100);

  const rows = [];
  for (let tier = 1; tier <= pass.levels; tier++) {
    const reward = pass.rewards[tier];
    if (!reward) continue;
    const rewardId = `pass_${pass.passId}_tier_${tier}`;
    const claimed = claimedIds.includes(rewardId) || (reward.type === "cap" && hasCap);
    const reached = currentTier >= tier;
    const state = claimed ? "claimed" : reached ? "ready" : "locked";
    const icon = passRewardIcon(reward);
    const label = passRewardLabel(reward, isEn);
    const claimBtn = state === "ready"
      ? `<button type="button" class="pass-tier-claim-btn" onclick="claimPassTier(${tier})">${isEn ? "Collect" : "Einsammeln"}</button>`
      : "";

    rows.push(`
      <div class="pass-tier-row pass-tier-${state}">
        <span class="pass-tier-number">${tier}</span>
        <span class="pass-tier-icon" aria-hidden="true">${icon}</span>
        <span class="pass-tier-label">${label}</span>
        <span class="pass-tier-status" aria-label="${state}">${passStatusEmoji(state)}</span>
        ${claimBtn}
      </div>
    `);
  }

  const capReached = currentTier >= pass.levels;

  container.innerHTML = `
    <h1>🏴‍☠️ ${pass.name}</h1>
    <p class="pass-season-status">
      ${isEnded
        ? (isEn ? "Season ended" : "Saison beendet")
        : (isEn ? `Still ${daysLeft} days` : `Noch ${daysLeft} Tage`)}
    </p>

    <div class="pass-overall-bar" role="progressbar" aria-valuenow="${currentTier}" aria-valuemin="0" aria-valuemax="${pass.levels}"
         aria-label="${isEn ? "Pass tier" : "Pass-Stufe"} ${currentTier}/${pass.levels}">
      <div class="pass-overall-fill" style="width:${Math.round((currentTier / pass.levels) * 100)}%"></div>
    </div>
    <p class="pass-tier-heading">${isEn ? "TIER" : "STUFE"} ${currentTier} / ${pass.levels}</p>
    ${currentTier < pass.levels ? `
      <div class="pass-tier-progress-bar" role="progressbar" aria-valuenow="${tierPercent}" aria-valuemin="0" aria-valuemax="100">
        <div class="pass-tier-progress-fill" style="width:${tierPercent}%"></div>
      </div>
      <p class="pass-tier-progress-text">${passXp - tierBaseXp} / ${tierSpan} XP</p>
    ` : ""}

    ${capReached && !hasCap ? `
      <div class="pass-cap-banner">
        <p class="pass-cap-banner-title">🎉 ${isEn ? "YOU COMPLETED THE PIRATE PASS!" : "DU HAST DEN PIRATENPASS ABGESCHLOSSEN!"}</p>
        <p class="pass-cap-banner-sub">${isEn ? "Your reward:" : "Deine Belohnung:"}</p>
        ${renderCapBadge(isEn)}
        <button type="button" class="pass-tier-claim-btn pass-cap-claim-btn" onclick="claimPassTier(${pass.levels})">${isEn ? "Collect" : "Einsammeln"}</button>
      </div>
    ` : hasCap ? `
      <div class="pass-cap-banner pass-cap-banner-claimed">
        <p class="pass-cap-banner-title">🏴‍☠️ ${isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap'}</p>
        ${renderCapBadge(isEn)}
      </div>
    ` : ""}

    <div class="pass-tier-list">
      ${rows.join("")}
    </div>
  `;

  if (capReached || hasCap) upgradeCapBadgeIfImageExists();
}

/* Bild-Preload mit Fallback: solange assets/piratenpass/cap.png noch
   nicht existiert (siehe Auftrag Punkt 14), zeigt die Seite ein
   textbasiertes Abzeichen statt eines kaputten <img>-Tags - kein
   Platzhalterbild noetig, das spaeter ersetzt werden muesste. Ein
   ueber innerHTML eingefuegtes <script>-Tag wuerde NICHT ausgefuehrt
   (Browser-Verhalten) - der Bild-Check laeuft deshalb separat in
   upgradeCapBadgeIfImageExists(), aufgerufen NACHDEM das Markup im
   DOM steht.
------------------------------------------------------ */
function renderCapBadge(isEn) {
  const label = isEn ? '"I\'m a Flitzpiepe" cap' : '"Ich bin eine Flitzpiepe"-Cap';
  return `
    <span class="pass-cap-badge" id="pass-cap-badge" data-label="${label}">
      <span class="pass-cap-badge-fallback">🧢<br>${label}</span>
    </span>
  `;
}

function upgradeCapBadgeIfImageExists() {
  const el = document.getElementById("pass-cap-badge");
  if (!el || typeof PIRATE_PASS_CAP_IMAGE === "undefined") return;

  const img = new Image();
  img.onload = () => {
    const target = document.getElementById("pass-cap-badge");
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

  const rewardId = `pass_${pass.passId}_tier_${tier}`;
  const result = await claimReward(rewardId, reward);
  if (result.ok) renderPassPage();
}
