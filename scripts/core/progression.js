/* ======================================================
   FORTSCHRITTS-SYSTEM: LOGIK
   ---------------------------------------------------
   Level/XP-Berechnung, zentraler Reward-Dispatcher (claimReward),
   XP-Vergabe fuer bestehende Aktionen, Spielerkarte in der Sidebar
   und Level-Up-Overlay. Konfiguration liegt in progression-data.js
   (vorher geladen, siehe index.html).

   WIEDERVERWENDET statt dupliziert: wheelDb/wheelAuthReady
   (firebase-config.js), unlockAvatar()/isAvatarImagePath()/
   buildAvatarPickerHtml() (wheel.js), addCurrency()-Vertrauensmodell
   (nicht-transaktionale, aber gedeckelte Increments).
====================================== */

/* ------------------------------------------------------
   LEVEL-BERECHNUNG (rein aus xp abgeleitet, siehe
   xpRequiredForLevel() in progression-data.js - es gibt bewusst kein
   eigenes "level"-Feld in Firestore, das aus dem Ruder laufen koennte)
------------------------------------------------------ */
function getPlayerLevel(xp) {
  const totalXp = xp || 0;
  let level = 1;
  for (let l = 2; l <= PROGRESSION_MAX_LEVEL; l++) {
    if (totalXp >= xpRequiredForLevel(l)) level = l;
    else break;
  }
  return level;
}

function getLevelProgress(xp) {
  const totalXp = Math.max(0, xp || 0);
  const level = getPlayerLevel(totalXp);
  const isMaxLevel = level >= PROGRESSION_MAX_LEVEL;
  const currentThreshold = xpRequiredForLevel(level);
  const nextThreshold = isMaxLevel ? currentThreshold : xpRequiredForLevel(level + 1);
  const span = Math.max(1, nextThreshold - currentThreshold);
  const into = Math.min(span, totalXp - currentThreshold);
  return { level, xpIntoLevel: into, xpForNextLevel: span, totalXp, isMaxLevel };
}

/* ------------------------------------------------------
   PIRATENPASS - SAISON-AUSWAHL (rein datumsbasiert, siehe
   PIRATE_PASSES in progression-data.js)
   ---------------------------------------------------
   resolvePassDates() loest das Sonder-Schluesselwort
   "@streamraetsel-unlock" gegen die BEREITS VORHANDENE "???"-
   Countdown-Logik auf (getStreamRaetselUnlockDate() in scripts/
   streamraetsel/streamraetsel.js) - keine zweite, unabhaengige
   Datumsquelle. endDate wird immer aus startDate + durationDays
   berechnet, nie separat gespeichert.
------------------------------------------------------ */
function resolvePassDates(pass) {
  const start = pass.startDate === "@streamraetsel-unlock" && typeof getStreamRaetselUnlockDate === "function"
    ? getStreamRaetselUnlockDate()
    : new Date(pass.startDate);
  const end = new Date(start.getTime() + pass.durationDays * 86400000);
  return { start, end };
}

function getCurrentPirateSeason() {
  const now = Date.now();
  return PIRATE_PASSES.find((pass) => {
    const { start, end } = resolvePassDates(pass);
    return now >= start.getTime() && now < end.getTime();
  }) || null;
}

function getNextPirateSeason() {
  const now = Date.now();
  let next = null;
  let nextStartMs = null;
  PIRATE_PASSES.forEach((pass) => {
    const { start } = resolvePassDates(pass);
    if (start.getTime() > now && (nextStartMs === null || start.getTime() < nextStartMs)) {
      next = pass;
      nextStartMs = start.getTime();
    }
  });
  return next;
}

function getLatestEndedPirateSeason() {
  const now = Date.now();
  let latest = null;
  let latestEndMs = null;
  PIRATE_PASSES.forEach((pass) => {
    const { end } = resolvePassDates(pass);
    if (end.getTime() <= now && (latestEndMs === null || end.getTime() > latestEndMs)) {
      latest = pass;
      latestEndMs = end.getTime();
    }
  });
  return latest;
}

function getPassTier(passXp, pass) {
  if (!pass) return 0;
  let tier = 0;
  for (let t = 1; t <= pass.levels; t++) {
    if (passXp >= passXpRequiredForTier(t)) tier = t;
    else break;
  }
  return tier;
}

/* ------------------------------------------------------
   ZENTRALER REWARD-DISPATCHER
   ---------------------------------------------------
   EINE Funktion fuer alle einmaligen Belohnungen (Level-Ups,
   Expedition-Meilensteine, Piratenpass-Stufen) - vergibt nur, wenn
   rewardId noch nicht in players/{uid}.claimedRewardIds steht, und
   markiert danach ATOMAR (Transaktion) als eingeloest. Ein Reload
   oder Doppelklick kann dieselbe rewardId nie zweimal ausloesen
   (Auftrag Punkt 21).

   Belohnungs-Effekte nutzen ausschliesslich bestehende, bereits
   server-synchronisierte Felder (currency/xp/tempAvatarExpiresAt/
   shipTools) - NUR "avatar" (dauerhaft) hat bewusst KEIN eigenes Firestore-Feld:
   das wuerde die bestehende, rein lokale unlockAvatar()-Logik
   duplizieren (Auftrag Punkt 22) statt sie wiederzuverwenden. Das
   entspricht exakt der bestehenden Garantie fuer code-freigeschaltete
   Avatare (main.js checkCode()) - keine neue, schwaechere Stelle.
------------------------------------------------------ */
// Belohnungs-Effekte verteilen sich auf ZWEI Dokumente derselben
// Transaktion: currency/shipTools/tempAvatar* bleiben in players/{uid}
// (bestehende, bereits validierte Felder - siehe validShopFields()/
// validShipTools()/validWheelFields() in firestore.rules), xp/
// passProgress/claimedRewardIds/hasFlitzpiepenCap leben in der neuen
// player_progression/{uid} (eigenes, unbelastetes Ausdrucksbudget -
// siehe Kommentar dort). Ein Firestore-Transaction kann mehrere
// Dokumente atomar lesen/schreiben, beide Schreibvorgaenge committen
// deshalb gemeinsam oder gar nicht.
function buildRewardFields(reward, playerData, progressionData, currentPass) {
  const playerFields = {};
  const progressionFields = {};

  switch (reward.type) {
    case "coins":
      playerFields.currency = firebase.firestore.FieldValue.increment(reward.amount);
      playerFields.totalCurrencyEarned = firebase.firestore.FieldValue.increment(reward.amount);
      break;

    case "xp": {
      progressionFields.xp = firebase.firestore.FieldValue.increment(reward.amount);
      const passAmount = reward.passAmount || 0;
      if (passAmount && currentPass) {
        const existingPassId = progressionData.passProgress && progressionData.passProgress.passId;
        if (existingPassId === currentPass.passId) {
          progressionFields.passProgress = { xp: firebase.firestore.FieldValue.increment(passAmount) };
        } else {
          progressionFields.passProgress = { passId: currentPass.passId, xp: passAmount };
        }
      }
      break;
    }

    case "temporary_avatar":
      playerFields.tempAvatarExpiresAt = Date.now() + reward.durationDays * 86400000;
      playerFields.tempAvatarId = reward.avatarId;
      break;

    case "tool":
      playerFields.shipTools = { [reward.toolId]: firebase.firestore.FieldValue.increment(1) };
      break;

    case "cap":
      progressionFields.hasFlitzpiepenCap = true;
      break;

    case "avatar":
      // Absichtlich kein Firestore-Feld - siehe Kommentar oben.
      break;

    default:
      break;
  }

  return { playerFields, progressionFields };
}

const PROGRESSION_REWARD_ID_CAP = 300;

async function claimReward(rewardId, reward) {
  if (!wheelDb || typeof wheelAuthReady === "undefined") return { ok: false, reason: "no-db" };
  const uid = await wheelAuthReady;
  if (!uid) return { ok: false, reason: "no-auth" };

  const playerRef = wheelDb.collection("players").doc(uid);
  const progressionRef = wheelDb.collection("player_progression").doc(uid);
  let claimedNow = false;

  try {
    await wheelDb.runTransaction(async (tx) => {
      const progressionSnap = await tx.get(progressionRef);
      const progressionData = progressionSnap.exists ? progressionSnap.data() : {};
      const claimed = progressionData.claimedRewardIds || [];
      if (claimed.includes(rewardId)) return; // schon eingeloest - kein Fehler, einfach nichts tun

      if (claimed.length >= PROGRESSION_REWARD_ID_CAP) {
        throw new Error("reward-ledger-full");
      }

      const playerSnap = await tx.get(playerRef);
      const playerData = playerSnap.exists ? playerSnap.data() : {};

      const currentPass = getCurrentPirateSeason();
      const { playerFields, progressionFields } = buildRewardFields(reward, playerData, progressionData, currentPass);

      progressionFields.claimedRewardIds = firebase.firestore.FieldValue.arrayUnion(rewardId);

      if (Object.keys(playerFields).length) {
        playerFields.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        tx.set(playerRef, playerFields, { merge: true });
      }
      tx.set(progressionRef, progressionFields, { merge: true });
      claimedNow = true;
    });
  } catch (err) {
    console.warn("Belohnung konnte nicht vergeben werden:", err);
    return { ok: false, reason: "error" };
  }

  if (!claimedNow) return { ok: true, alreadyClaimed: true };

  if (reward.type === "avatar" && typeof unlockAvatar === "function") {
    unlockAvatar(reward.avatarId);
  }
  if (reward.type === "coins" && typeof showCurrencyToast === "function") {
    showCurrencyToast(reward.amount);
  }

  refreshPlayerCard();
  return { ok: true, alreadyClaimed: false };
}

/* ------------------------------------------------------
   XP FUER BEREITS BESTEHENDE, EIGENSTAENDIG DEDUPLIZIERTE AKTIONEN
   ---------------------------------------------------
   Codes einloesen / Reparatur-Etappe fertig / Tagesquest / Boss-
   Angriff sind an ihrer jeweiligen Erfolgsstelle bereits gegen
   Mehrfachvergabe abgesichert (redeemedCurrencyCodes/crackedCodes,
   ship_repair-Transaktionen, dailyQuests.claimedDays, taeglicher
   Angriffs-Schluessel) - hier wird deshalb NICHT nochmal ueber
   claimedRewardIds dedupliziert (das wuerde die Ledger unnoetig
   fuellen), sondern einfach direkt XP vergeben. "passProgress.xp"
   nutzt dabei ein atomares Feld-Increment per Punktpfad (sicher auch
   ohne Transaktion, siehe Firestore-Doku zu FieldValue.increment) -
   nur beim tatsaechlichen Saisonwechsel wird das Feld einmalig ganz
   neu gesetzt.
------------------------------------------------------ */
async function awardActionXp(actionKey) {
  if (!wheelDb || typeof wheelAuthReady === "undefined") return;
  const mainAmount = (typeof XP_PER_ACTION !== "undefined" && XP_PER_ACTION[actionKey]) || 0;
  const passAmount = (typeof PASS_XP_PER_ACTION !== "undefined" && PASS_XP_PER_ACTION[actionKey]) || 0;
  if (!mainAmount && !passAmount) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const progressionRef = wheelDb.collection("player_progression").doc(uid);
    const snap = await progressionRef.get();
    const data = snap.exists ? snap.data() : {};
    const oldXp = data.xp || 0;
    const currentPass = getCurrentPirateSeason();

    const fields = {};
    if (mainAmount) fields.xp = firebase.firestore.FieldValue.increment(mainAmount);

    if (currentPass && passAmount) {
      const existingPassId = data.passProgress && data.passProgress.passId;
      if (snap.exists && existingPassId === currentPass.passId) {
        fields.passProgress = { xp: firebase.firestore.FieldValue.increment(passAmount) };
      } else {
        fields.passProgress = { passId: currentPass.passId, xp: passAmount };
      }
    }

    await progressionRef.set(fields, { merge: true });
    handleXpGainSideEffects(oldXp, oldXp + mainAmount);
  } catch (err) {
    console.warn("XP konnte nicht vergeben werden:", err);
  }
}

/* Kapitel-Lese-XP: die EINZIGE Aktion ohne bestehendes Server-Feld
   fuer "schon einmal passiert" (Lesefortschritt bleibt bewusst rein
   lokal, siehe getReadChapterIds() in stories.js) - deshalb hier
   ueber die generische claimedRewardIds-Ledger dedupliziert. */
function awardChapterReadXp(chapterId) {
  if (typeof XP_PER_ACTION === "undefined") return;
  return claimReward(`chapter_read_${chapterId}`, {
    type: "xp",
    amount: XP_PER_ACTION.chapterRead,
    passAmount: (typeof PASS_XP_PER_ACTION !== "undefined" && PASS_XP_PER_ACTION.chapterRead) || 0,
  });
}

/* ------------------------------------------------------
   LEVEL-UP-ERKENNUNG
------------------------------------------------------ */
// Einzige Stelle, die das rewardId-Format fuer Level-Belohnungen
// festlegt - sowohl der automatische Level-Up (unten) als auch der
// persoenliche Levelpfad (scripts/core/level-path.js, zeigt/beansprucht
// dieselben Belohnungen manuell ueber claimedRewardIds) nutzen exakt
// dieselbe ID, damit eine im Levelpfad eingeloeste Belohnung nicht
// beim naechsten Level-Up ein zweites Mal ausgeloest werden koennte
// (und umgekehrt).
function getLevelRewardId(level) {
  return `level_${level}_reward`;
}

function handleXpGainSideEffects(oldXp, newXp) {
  refreshPlayerCard();

  const oldLevel = getPlayerLevel(oldXp);
  const newLevel = getPlayerLevel(newXp);
  if (newLevel <= oldLevel) return;

  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    const reward = typeof LEVEL_REWARDS !== "undefined" ? LEVEL_REWARDS[lvl] : null;
    if (reward) {
      claimReward(getLevelRewardId(lvl), reward).then((res) => {
        if (res.ok && !res.alreadyClaimed) showLevelUpOverlay(lvl, reward);
      });
    } else {
      showLevelUpOverlay(lvl, null);
    }
  }
}

/* ------------------------------------------------------
   SPIELERKARTE (ersetzt "Crew Flitzpiepen · Online" in der Sidebar,
   siehe .fh-sidebar-footer in index.html)
------------------------------------------------------ */
function renderPlayerCardHtml(data) {
  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname) {
    const label = typeof t === "function" ? t("progression.notLoggedIn", "Noch nicht angemeldet") : "Noch nicht angemeldet";
    return `<p class="fh-sidebar-footer-status"><span class="fh-status-dot"></span> ${label}</p>`;
  }

  const xp = (data && data.xp) || 0;
  const progress = getLevelProgress(xp);
  const percent = progress.isMaxLevel ? 100 : Math.round((progress.xpIntoLevel / progress.xpForNextLevel) * 100);

  const provider = localStorage.getItem("loginProvider") || "";
  let avatar = "🏴‍☠️";
  if (provider === "discord") avatar = localStorage.getItem("discordAvatar") || avatar;
  else if (provider === "twitch") avatar = localStorage.getItem("twitchAvatar") || avatar;
  else avatar = localStorage.getItem("wheelAvatar") || avatar;

  const avatarHtml = typeof buildAvatarPickerHtml === "function" ? buildAvatarPickerHtml(avatar) : `<span>${avatar}</span>`;
  const levelLabel = typeof t === "function" ? t("progression.level", "LEVEL") : "LEVEL";
  const xpText = progress.isMaxLevel
    ? (typeof t === "function" ? t("progression.maxLevel", "Max. Level erreicht") : "Max. Level erreicht")
    : `${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP`;
  // Der Spielername stammt letztlich vom Nutzer (Nickname-Eingabe) -
  // niemals ungefiltert in innerHTML einsetzen, siehe escapeHtml()
  // in wheel.js (dieselbe Funktion, die auch Rangliste/Boss nutzen).
  const safeNickname = typeof escapeHtml === "function" ? escapeHtml(nickname) : nickname;

  return `
    <button type="button" class="fh-player-card" onclick="openLevelPath()" aria-label="${levelLabel} ${progress.level}">
      <span class="fh-player-card-avatar">${avatarHtml}</span>
      <span class="fh-player-card-info">
        <span class="fh-player-card-name">${safeNickname}</span>
        <span class="fh-player-card-level">${levelLabel} ${progress.level}</span>
        <span class="fh-player-card-xpbar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${xpText}">
          <span class="fh-player-card-xpfill" style="width:${percent}%"></span>
        </span>
        <span class="fh-player-card-xptext">${xpText}</span>
      </span>
    </button>
  `;
}

let progressionUnsubscribe = null;

// Misst die TATSAECHLICHE Hoehe von Tableiste + (falls sichtbar)
// mobiler Spielerkarte und spiegelt sie in eine CSS-Variable, statt
// dass .page irgendwo einen geratenen Pixelwert dafuer reserviert
// (siehe --fh-mobile-stack-height in style.css). Laeuft ausserdem bei
// jeder Fenstergroessenaenderung, damit z.B. eine Drehung des Handys
// (andere env(safe-area-inset-bottom)) nichts verdeckt.
function syncMobileBottomStackHeight() {
  const stack = document.getElementById("fh-mobile-bottom-stack");
  if (!stack) return;
  document.documentElement.style.setProperty("--fh-mobile-stack-height", `${stack.offsetHeight}px`);
}
window.addEventListener("resize", syncMobileBottomStackHeight);

// Beide Karten (feste Desktop-Sidebar ab 1024px UND die kompakte
// Mobile-Leiste darunter) werden hier IMMER gemeinsam aus derselben
// renderPlayerCardHtml()-Ausgabe befuellt - es gibt bewusst keine
// zweite, eigenstaendige Levellogik nur fuer Mobile.
function paintPlayerCardTargets(data) {
  const html = renderPlayerCardHtml(data);
  const hasCard = html.includes("fh-player-card");
  ["fh-sidebar-footer", "fh-mobile-player-card"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    // Ohne Login zeigt die mobile Leiste keinen leeren Balken ueber
    // der Tableiste an, sondern bleibt platzsparend eingeklappt.
    el.classList.toggle("fh-mobile-player-card-empty", id === "fh-mobile-player-card" && !hasCard);
  });
  syncMobileBottomStackHeight();
}

async function refreshPlayerCard() {
  const container = document.getElementById("fh-sidebar-footer");
  if (!container || !wheelDb || typeof wheelAuthReady === "undefined") return;

  const uid = await wheelAuthReady;
  if (!uid) {
    paintPlayerCardTargets(null);
    return;
  }

  if (!progressionUnsubscribe) {
    progressionUnsubscribe = wheelDb.collection("player_progression").doc(uid).onSnapshot((snap) => {
      paintPlayerCardTargets(snap.exists ? snap.data() : null);
    });
    return;
  }

  // Bereits abonniert (onSnapshot liefert den aktuellen Stand sofort
  // erneut) - hier reicht ein einmaliger Direktabruf fuer eine
  // sofort sichtbare Aktualisierung (z.B. direkt nach einer
  // Belohnungsvergabe), ohne ein zweites Abo aufzumachen.
  const snap = await wheelDb.collection("player_progression").doc(uid).get();
  paintPlayerCardTargets(snap.exists ? snap.data() : null);
}

/* ------------------------------------------------------
   LEVEL-UP-OVERLAY
   ---------------------------------------------------
   Respektiert prefers-reduced-motion (siehe Auftrag Punkt 9/25):
   bei reduzierter Bewegung erscheint/verschwindet das Overlay ohne
   Konfetti-Partikel und ohne Skalierungs-Animation, nur per Fade.
------------------------------------------------------ */
function showLevelUpOverlay(level, reward) {
  const existing = document.getElementById("fh-levelup-overlay");
  if (existing) existing.remove();

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const overlay = document.createElement("div");
  overlay.id = "fh-levelup-overlay";
  overlay.className = `fh-levelup-overlay${reduceMotion ? " fh-reduced-motion" : ""}`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");

  const titleLabel = typeof t === "function" ? t("progression.levelUp", "LEVEL UP!") : "LEVEL UP!";
  const levelLabel = typeof t === "function" ? t("progression.level", "LEVEL") : "LEVEL";
  const closeLabel = typeof t === "function" ? t("progression.close", "Schließen") : "Schließen";

  const rewardHtml = reward ? describeRewardHtml(reward) : "";

  overlay.innerHTML = `
    <div class="fh-levelup-card">
      ${reduceMotion ? "" : '<div class="fh-levelup-confetti" aria-hidden="true"></div>'}
      <p class="fh-levelup-title">🏴‍☠️ ${titleLabel}</p>
      <p class="fh-levelup-level">${levelLabel} ${level}</p>
      ${rewardHtml ? `<p class="fh-levelup-reward">${rewardHtml}</p>` : ""}
      <button type="button" class="fh-levelup-close" autofocus>${closeLabel}</button>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 350);
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  overlay.querySelector(".fh-levelup-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);
}

/* ------------------------------------------------------
   "CREW BEIGETRETEN"-ANIMATION
   ---------------------------------------------------
   Laeuft NUR beim allerersten anonymen Anmelden (siehe Aufruf in
   saveNickname() in scripts/wheel/wheel.js, gated ueber das einmalig
   in localStorage gesetzte Flag "hasSeenCrewJoinAnimation" - wird
   NIE erneut gezeigt, auch nicht nach Reload/erneutem Login).
   Kurze, 1-3s selbst-ausblendende Sequenz, angelehnt an
   showLevelUpOverlay() oben (gleiche Overlay-/Konfetti-Bausteine,
   keine zweite eigenstaendige Overlay-Implementierung von Grund auf).
------------------------------------------------------ */
function showCrewJoinAnimation(name) {
  const existing = document.getElementById("fh-crewjoin-overlay");
  if (existing) existing.remove();

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const overlay = document.createElement("div");
  overlay.id = "fh-crewjoin-overlay";
  overlay.className = `fh-crewjoin-overlay${reduceMotion ? " fh-reduced-motion" : ""}`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");

  // Name kommt aus validateUsername()/saveNickname() - trotzdem hier
  // ebenfalls per escapeHtml() ausgeben (dieselbe Funktion wie
  // ueberall sonst), statt roher HTML-Injektion.
  const safeName = typeof escapeHtml === "function" ? escapeHtml(name) : name;
  const welcomeLabel = typeof t === "function" ? t("progression.crewJoinWelcome", "Willkommen in der Crew!") : "Willkommen in der Crew!";

  overlay.innerHTML = `
    <div class="fh-crewjoin-card">
      ${reduceMotion ? "" : '<div class="fh-crewjoin-confetti" aria-hidden="true"></div>'}
      <div class="fh-crewjoin-flag" aria-hidden="true">🏴‍☠️</div>
      <p class="fh-crewjoin-title">${welcomeLabel}</p>
      <p class="fh-crewjoin-name">${safeName}</p>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 350);
  }

  // Blendet sich von allein wieder aus (1-3s Vorgabe) - ein Klick
  // ueberspringt die Animation vorzeitig, falls jemand ungeduldig ist.
  overlay.addEventListener("click", close);
  setTimeout(close, reduceMotion ? 1300 : 2600);
}

function describeRewardHtml(reward) {
  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";
  switch (reward.type) {
    case "coins":
      return `💰 +${reward.amount} ${isEn ? "Doubloons" : "Dublonen"}`;
    case "xp":
      return `✨ +${reward.amount} XP`;
    case "avatar":
      return isEn ? "🖼️ New avatar unlocked" : "🖼️ Neuer Avatar freigeschaltet";
    case "temporary_avatar":
      return isEn ? `🖼️ Avatar for ${reward.durationDays} days` : `🖼️ Avatar für ${reward.durationDays} Tage`;
    case "tool":
      return isEn ? "🔧 New tool" : "🔧 Neues Werkzeug";
    case "cap":
      return isEn ? "🏴‍☠️ \"I'm a Flitzpiepe\" cap" : "🏴‍☠️ \"Ich bin eine Flitzpiepe\"-Cap";
    default:
      return "";
  }
}

/* ------------------------------------------------------
   START / LIVE-AKTUALISIERUNG
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  refreshPlayerCard();
});
