/* ======================================================
   GLÜCKSRAD + CODE-TRACKING + GLOBALE RANGLISTE
   - Rad wird aus scripts/wheel-data.js gebaut
   - Einmal pro Tag drehbar (pro Browser/Gerät, via localStorage)
   - Rangliste zählt, wie viele VERSCHIEDENE Codes ein
     Besucher erfolgreich geknackt hat (scripts/main.js ruft
     dafür recordCodeCrack() auf)
   - Nach dem Drehen läuft ein Countdown bis zur nächsten
     möglichen Drehung (Mitternacht)
   - Jede Drehung und jeder NEU geknackte Code geben zusätzlich
     Fortschritt fürs Wochenrennen (siehe scripts/race.js)
   - Alles wird über Firebase Firestore global gespeichert
     (siehe scripts/firebase-config.js für Setup)
====================================================== */

let wheelBuilt = false;
let wheelCountdownInterval = null;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getWheelState() {
  return {
    nickname: localStorage.getItem("wheelNickname") || "",
    lastSpin: localStorage.getItem("wheelLastSpin") || null,
    streak: parseInt(localStorage.getItem("wheelStreak") || "0", 10),
  };
}

function getCrackedCodes() {
  try {
    return JSON.parse(localStorage.getItem("crackedCodes") || "[]");
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------
   EINMALIGE MIGRATION: alte, im Klartext gespeicherte Codes
   (vor der Sicherheits-Umstellung auf Hashes) werden beim
   nächsten Seitenaufruf automatisch in Hashes umgewandelt,
   damit sie nicht versehentlich doppelt gezählt werden.
------------------------------------------------------ */
async function migrateCrackedCodesFormat() {
  if (localStorage.getItem("crackedCodesMigrated") === "1") return;

  const cracked = getCrackedCodes();
  if (!cracked.length || typeof sha256Hex !== "function") {
    localStorage.setItem("crackedCodesMigrated", "1");
    return;
  }

  const isHash = (v) => /^[a-f0-9]{64}$/i.test(v);
  const migrated = [];

  for (const entry of cracked) {
    if (isHash(entry)) {
      migrated.push(entry);
    } else {
      migrated.push(await sha256Hex(String(entry).toLowerCase()));
    }
  }

  const unique = [...new Set(migrated)];
  localStorage.setItem("crackedCodes", JSON.stringify(unique));
  localStorage.setItem("codesCracked", String(unique.length));
  localStorage.setItem("crackedCodesMigrated", "1");
}

window.addEventListener("DOMContentLoaded", () => {
  migrateCrackedCodesFormat();
});

function isCodeAlreadyCracked(codeId) {
  return getCrackedCodes().includes(codeId);
}

/* ------------------------------------------------------
   RAD AUFBAUEN
------------------------------------------------------ */
/* ------------------------------------------------------
   WÖCHENTLICHES RAD-THEMA AUSWÄHLEN
   Reihum nach Wochennummer - für alle Besucher gleich.
------------------------------------------------------ */
function getWeeklyWheelTheme() {
  if (typeof wheelThemes === "undefined" || wheelThemes.length === 0) return null;
  if (typeof getCurrentWeekId !== "function") return wheelThemes[0];

  const weekId = getCurrentWeekId();
  const match = weekId.match(/W(\d+)/);
  const weekNum = match ? parseInt(match[1], 10) : 1;

  return wheelThemes[weekNum % wheelThemes.length];
}

function applyWheelThemeAccent(theme) {
  if (!theme) return;

  document.documentElement.style.setProperty("--wheel-accent", theme.accent);

  const themeLabel = document.getElementById("wheel-theme-label");
  if (themeLabel) {
    themeLabel.textContent = `Diese Woche: ${theme.name}`;
  }
}

function buildWheel() {
  const disc = document.getElementById("wheel-disc");
  if (!disc || typeof wheelPrizes === "undefined" || wheelPrizes.length === 0) {
    return;
  }

  const theme = getWeeklyWheelTheme();
  applyWheelThemeAccent(theme);

  const segmentAngle = 360 / wheelPrizes.length;

  const gradientParts = wheelPrizes
    .map((p, i) => {
      const color = theme ? theme.colors[i % theme.colors.length] : p.color;
      return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
    })
    .join(", ");

  disc.style.background = `conic-gradient(${gradientParts})`;
  disc.innerHTML = "";

  wheelPrizes.forEach((prize, i) => {
    const mid = segmentAngle * i + segmentAngle / 2;

    const label = document.createElement("div");
    label.className = "wheel-label";
    label.textContent = prize.label;
    label.style.transform = `rotate(${mid}deg)`;

    disc.appendChild(label);
  });

  buildWheelBulbs();
}

/* ------------------------------------------------------
   BLINKENDE RAND-LICHTER (wie bei einem echten Glücksrad)
------------------------------------------------------ */
function buildWheelBulbs() {
  const container = document.getElementById("wheel-bulbs");
  if (!container) return;

  container.innerHTML = "";

  const count = 16;
  const radiusPercent = 49;

  for (let i = 0; i < count; i++) {
    const rad = ((360 / count) * i * Math.PI) / 180;
    const x = 50 + radiusPercent * Math.cos(rad);
    const y = 50 + radiusPercent * Math.sin(rad);

    const bulb = document.createElement("div");
    bulb.className = "wheel-bulb";
    bulb.style.left = x + "%";
    bulb.style.top = y + "%";
    bulb.style.animationDelay = (i % 2 === 0 ? "0s" : ".45s");

    container.appendChild(bulb);
  }
}

/* ------------------------------------------------------
   FUNKEN-EFFEKT, WENN DAS RAD LANDET
------------------------------------------------------ */
function spawnWheelSparks() {
  const container = document.getElementById("wheel-sparks");
  if (!container) return;

  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * 360;
    const distance = 55 + Math.random() * 65;

    const spark = document.createElement("div");
    spark.className = "wheel-spark";
    spark.style.setProperty("--angle", angle + "deg");
    spark.style.setProperty("--distance", distance + "px");

    container.appendChild(spark);
    setTimeout(() => spark.remove(), 850);
  }
}

/* ------------------------------------------------------
   COUNTDOWN BIS ZUR NÄCHSTEN DREHUNG
------------------------------------------------------ */
function getMsUntilNextMidnight() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  return nextMidnight - now;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopWheelCountdown() {
  clearInterval(wheelCountdownInterval);
  wheelCountdownInterval = null;

  const countdownEl = document.getElementById("wheel-countdown");
  if (countdownEl) {
    countdownEl.style.display = "none";
    countdownEl.textContent = "";
  }
}

function startWheelCountdown() {
  const countdownEl = document.getElementById("wheel-countdown");
  if (!countdownEl) return;

  stopWheelCountdown();

  function tick() {
    const msLeft = getMsUntilNextMidnight();

    if (msLeft <= 0) {
      stopWheelCountdown();
      refreshWheelStatus(); // Tag hat gewechselt -> Rad wieder freigeben
      return;
    }

    countdownEl.textContent = tFormat("wheel.countdownLabel", { time: formatDuration(msLeft) });
    countdownEl.style.display = "block";
  }

  tick();
  wheelCountdownInterval = setInterval(tick, 1000);
}

/* ------------------------------------------------------
   STATUS-ANZEIGE (gesperrt/frei, aktuelle Streak, Countdown)
------------------------------------------------------ */
function refreshWheelStatus() {
  const state = getWheelState();
  const statusEl = document.getElementById("wheel-status");
  const spinBtn = document.getElementById("spin-button");
  const loginHint = document.getElementById("wheel-login-hint");

  if (!statusEl || !spinBtn) return;

  if (loginHint) {
    loginHint.style.display = state.nickname ? "none" : "block";
  }

  const today = todayStr();

  if (!state.nickname) {
    spinBtn.disabled = true;
    statusEl.textContent = t("wheel.status.needLogin");
    stopWheelCountdown();
    return;
  }

  if (state.lastSpin === today) {
    spinBtn.disabled = true;
    statusEl.textContent = tFormat("wheel.status.spunToday", { streak: state.streak });
    startWheelCountdown();
  } else {
    spinBtn.disabled = false;
    statusEl.textContent =
      state.streak > 0
        ? tFormat("wheel.status.streakActive", { streak: state.streak })
        : t("wheel.status.readyToSpin");
    stopWheelCountdown();
  }
}

/* ------------------------------------------------------
   NAME SPEICHERN
------------------------------------------------------ */
function saveNickname() {
  const input = document.getElementById("wheel-nickname-input");
  if (!input) return;

  const name = input.value.trim();
  if (!name) return;

  localStorage.setItem("wheelNickname", name);
  refreshWheelStatus();
  syncCodesToFirestore();
}

/* ------------------------------------------------------
   NACHHOL-SYNCHRONISIERUNG
   Falls schon vorher Codes lokal geknackt wurden, bevor ein
   Name gesetzt war (oder die Synchronisierung mal fehlschlug),
   werden sie hier nachträglich in die Datenbank übertragen -
   sicher per atomarem Zähler, kein Überschreiben möglich.
------------------------------------------------------ */
function syncCodesToFirestore() {
  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname || !wheelDb) return;

  const totalCracked = getCrackedCodes().length;
  const syncedCount = parseInt(localStorage.getItem("codesSyncedCount") || "0", 10);
  const missing = totalCracked - syncedCount;

  if (missing <= 0) return;

  wheelAuthReady.then((uid) => {
    if (!uid) return;

    const fields = {
      nickname: nickname,
      codesCracked: firebase.firestore.FieldValue.increment(missing),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const rewards = getCodeRewards();
    if (rewards.length) {
      // arrayUnion ist ungefährlich mehrfach aufzurufen (dedupliziert automatisch)
      fields.rewards = firebase.firestore.FieldValue.arrayUnion(...rewards);
    }

    wheelDb
      .collection("players")
      .doc(uid)
      .set(fields, { merge: true })
      .then(() => {
        localStorage.setItem("codesSyncedCount", String(totalCracked));
      })
      .catch((err) => {
        console.error("Nachhol-Synchronisierung fehlgeschlagen:", err);
      });
  });
}

/* ------------------------------------------------------
   FIRESTORE: EINEN SPIELER-EINTRAG AKTUALISIEREN
   (merge:true, damit Glücksrad-, Code- und Rennen-Statistiken
   sich nicht gegenseitig überschreiben)
------------------------------------------------------ */
function savePlayerData(fields) {
  if (!wheelDb) return;

  const provider = localStorage.getItem("loginProvider") || "";
  const avatar =
    (provider === "discord"
      ? localStorage.getItem("discordAvatar")
      : localStorage.getItem("twitchAvatar")) || null;

  wheelAuthReady.then((uid) => {
    if (!uid) {
      console.warn("Keine Firebase-Anmeldung vorhanden, Eintrag wird nicht gespeichert.");
      return;
    }

    wheelDb
      .collection("players")
      .doc(uid)
      .set(
        {
          ...fields,
          avatar: avatar,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch((err) => {
        console.error("Eintrag konnte nicht gespeichert werden:", err);
      });
  });
}

/* ------------------------------------------------------
   DREHEN
------------------------------------------------------ */
function spinWheel() {
  const state = getWheelState();
  const today = todayStr();

  if (!state.nickname || state.lastSpin === today) {
    refreshWheelStatus();
    return;
  }

  const disc = document.getElementById("wheel-disc");
  const spinBtn = document.getElementById("spin-button");
  const resultEl = document.getElementById("wheel-result");

  if (!disc || !spinBtn || typeof wheelPrizes === "undefined") return;

  spinBtn.disabled = true;
  resultEl.textContent = "";
  resultEl.classList.remove("code-success", "code-error");

  const segmentAngle = 360 / wheelPrizes.length;
  const prizeIndex = Math.floor(Math.random() * wheelPrizes.length);
  const prize = wheelPrizes[prizeIndex];

  const targetMid = prizeIndex * segmentAngle + segmentAngle / 2;
  const fullSpins = 5;
  const finalRotation = fullSpins * 360 + (360 - targetMid);

  // Rad sauber auf 0 zurücksetzen, damit jede Drehung gleich aussieht
  disc.style.transition = "none";
  disc.style.transform = "rotate(0deg)";
  void disc.offsetWidth;
  disc.style.transition = "transform 4.5s cubic-bezier(0.15, 0.7, 0.15, 1)";
  disc.style.transform = `rotate(${finalRotation}deg)`;

  setTimeout(() => {
    resultEl.textContent = prize.message;
    resultEl.classList.add("code-success");
    spawnWheelSparks();
    finalizeSpin(state, today, prize);
  }, 4600);
}

function finalizeSpin(state, today, prize) {
  let newStreak = 1;
  if (state.lastSpin === yesterdayStr()) {
    newStreak = state.streak + 1;
  }

  localStorage.setItem("wheelLastSpin", today);
  localStorage.setItem("wheelStreak", String(newStreak));

  refreshWheelStatus();

  savePlayerData({
    nickname: state.nickname,
    streak: newStreak,
    lastSpin: today,
    lastPrize: prize.label,
  });

  // Fortschritt fürs Wochenrennen
  if (typeof addRaceProgress === "function" && typeof raceConfig !== "undefined") {
    addRaceProgress(raceConfig.progressPerSpin);
  }
}

/* ------------------------------------------------------
   CODES-TRACKING
   Wird von main.js -> checkCode() bei jedem ERFOLGREICH
   erkannten Code aufgerufen. Zählt jeden Code nur einmal
   und gibt zurück, ob es ein NEUER Code war.
------------------------------------------------------ */
function getCodeRewards() {
  try {
    return JSON.parse(localStorage.getItem("codeRewards") || "[]");
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------
   SCHATZ-EFFEKT BEIM CODE-EINLÖSEN
   Wird von main.js -> checkCode() ausgelöst, wenn ein
   CODE ZUM ERSTEN MAL erfolgreich geknackt wurde.
------------------------------------------------------ */
function triggerCodeSuccessEffect() {
  const fx = document.getElementById("code-fx");
  if (!fx) return;

  fx.classList.remove("code-fx-flash");
  void fx.offsetWidth;
  fx.classList.add("code-fx-flash");

  const symbols = ["🪙", "✨", "💰", "🧭", "⭐"];
  const count = 36;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "code-fx-particle";
    particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];

    const angle = Math.random() * 360;
    const distance = 140 + Math.random() * 260;

    particle.style.setProperty("--angle", angle + "deg");
    particle.style.setProperty("--distance", distance + "px");
    particle.style.animationDelay = Math.random() * 0.15 + "s";
    particle.style.fontSize = 16 + Math.random() * 14 + "px";

    fx.appendChild(particle);
    setTimeout(() => particle.remove(), 2000);
  }
}

function recordCodeCrack(codeId, reward) {
  const cracked = getCrackedCodes();

  if (cracked.includes(codeId)) {
    return false; // dieser Code wurde schon vorher gezählt
  }

  cracked.push(codeId);
  localStorage.setItem("crackedCodes", JSON.stringify(cracked));
  localStorage.setItem("codesCracked", String(cracked.length));
  localStorage.setItem("codesSyncedCount", String(cracked.length));

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (reward) {
    const rewards = getCodeRewards();
    if (!rewards.includes(reward)) {
      rewards.push(reward);
      localStorage.setItem("codeRewards", JSON.stringify(rewards));
    }
  }

  if (nickname && wheelDb) {
    wheelAuthReady.then((uid) => {
      if (!uid) return;

      const fields = {
        nickname: nickname,
        codesCracked: firebase.firestore.FieldValue.increment(1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (reward) {
        fields.rewards = firebase.firestore.FieldValue.arrayUnion(reward);
      }

      wheelDb
        .collection("players")
        .doc(uid)
        .set(fields, { merge: true })
        .catch((err) => {
          console.error("Code-Fortschritt konnte nicht gespeichert werden:", err);
        });
    });
  }

  // Fortschritt fürs Wochenrennen
  if (typeof addRaceProgress === "function" && typeof raceConfig !== "undefined") {
    addRaceProgress(raceConfig.progressPerCode);
  }

  return true;
}

/* ------------------------------------------------------
   RANGLISTE LADEN (sortiert nach geknackten Codes)
------------------------------------------------------ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderRewardBadges(rewards) {
  if (!rewards || !rewards.length) {
    return '<span class="reward-none">–</span>';
  }

  return rewards
    .map((r) => `<span class="reward-badge">🏆 ${escapeHtml(r)}</span>`)
    .join("");
}

function buildLeaderboardRow(player, rank, isOwnRow) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
  const classes = [];

  if (rank <= 3) classes.push(`leaderboard-top leaderboard-top-${rank}`);
  if (isOwnRow) classes.push("leaderboard-you");

  const avatarHtml = player.avatar
    ? `<img src="${player.avatar}" class="leaderboard-avatar" alt="">`
    : "";

  return `
    <tr class="${classes.join(" ")}">
      <td class="leaderboard-rank">${medal}</td>
      <td class="leaderboard-name">${avatarHtml}${escapeHtml(player.nickname || "Unbekannt")}${isOwnRow ? ' <span class="leaderboard-you-tag">(Du)</span>' : ""}</td>
      <td class="leaderboard-codes">${player.codesCracked} 🔑</td>
      <td class="leaderboard-rewards">${renderRewardBadges(player.rewards)}</td>
    </tr>
  `;
}

function loadLeaderboard() {
  const container = document.getElementById("leaderboard-list");
  if (!container) return;

  if (!wheelDb) {
    container.innerHTML =
      '<p class="wheel-status">Die globale Rangliste ist noch nicht eingerichtet (Firebase-Zugangsdaten fehlen in scripts/firebase-config.js).</p>';
    return;
  }

  container.innerHTML = '<p class="wheel-status">Lade Rangliste ...</p>';

  // WICHTIG: kein orderBy() hier! Firestore würde sonst alle Spieler
  // weglassen, die noch kein "codesCracked"-Feld haben (z.B. weil sie
  // erst am Rad gedreht, aber noch keinen Code geknackt haben). Wir
  // laden daher ALLE Spieler mit Namen und sortieren selbst im Browser.
  Promise.all([
    wheelDb.collection("players").get(),
    wheelAuthReady,
  ])
    .then(([snapshot, ownUid]) => {
      const players = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.nickname) return; // Einträge ganz ohne Namen überspringen
        players.push({ uid: doc.id, codesCracked: 0, ...data });
      });

      players.sort((a, b) => (b.codesCracked || 0) - (a.codesCracked || 0));

      if (!players.length) {
        container.innerHTML =
          '<p class="wheel-status">Noch niemand ist registriert – sei der Erste!</p>';
        return;
      }

      const ownIndex = ownUid ? players.findIndex((p) => p.uid === ownUid) : -1;
      const ownRank = ownIndex >= 0 ? ownIndex + 1 : null;
      const topFive = players.slice(0, 5);

      let html = '<table class="leaderboard-table"><thead><tr><th>#</th><th>Name</th><th>Codes</th><th>Gewinne</th></tr></thead><tbody>';

      topFive.forEach((player, i) => {
        const rank = i + 1;
        html += buildLeaderboardRow(player, rank, player.uid === ownUid);
      });

      // Falls der eigene Platz außerhalb der Top 5 liegt, extra anzeigen
      if (ownRank && ownRank > 5) {
        html += `
          <tr class="leaderboard-gap">
            <td colspan="4">⋯</td>
          </tr>
        `;
        html += buildLeaderboardRow(players[ownIndex], ownRank, true);
      }

      html += "</tbody></table>";
      container.innerHTML = html;

      // Hinweis-Zeile über dem eigenen Platz
      const noteEl = document.createElement("p");
      noteEl.className = "wheel-status leaderboard-own-note";

      if (ownRank) {
        noteEl.textContent = `Du stehst auf Platz ${ownRank} von ${players.length}.`;
      } else {
        noteEl.textContent = "Trag im 🧭 Schatzrad deinen Namen ein, um in der Rangliste zu erscheinen!";
      }

      container.appendChild(noteEl);
    })
    .catch((err) => {
      console.error("Rangliste konnte nicht geladen werden:", err);
      container.innerHTML =
        '<p class="wheel-status">Rangliste konnte nicht geladen werden.</p>';
    });
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOKS
   (werden von main.js beim Seitenwechsel aufgerufen)
------------------------------------------------------ */
function updateWheelPage(pageID) {
  if (pageID !== "wheel") {
    stopWheelCountdown();
    return;
  }

  if (!wheelBuilt) {
    buildWheel();
    wheelBuilt = true;
  }

  const nicknameInput = document.getElementById("wheel-nickname-input");
  if (nicknameInput) {
    nicknameInput.value = localStorage.getItem("wheelNickname") || "";
  }

  if (typeof refreshTwitchLoginUI === "function") {
    refreshTwitchLoginUI();
  }

  syncCodesToFirestore();
  refreshWheelStatus();
}

function updateLeaderboardPage(pageID) {
  if (pageID === "leaderboard") {
    loadLeaderboard();
  }
}
