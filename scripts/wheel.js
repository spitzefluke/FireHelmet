/* ======================================================
   GLÜCKSRAD + GLOBALE RANGLISTE
   - Rad wird aus scripts/wheel-data.js gebaut
   - Einmal pro Tag drehbar (pro Browser/Gerät, via localStorage)
   - Streak = Tage in Folge gedreht
   - Rangliste wird über Firebase Firestore global gespeichert
     (siehe scripts/firebase-config.js für Setup)
====================================================== */

let wheelBuilt = false;

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

/* ------------------------------------------------------
   RAD AUFBAUEN
------------------------------------------------------ */
function buildWheel() {
  const disc = document.getElementById("wheel-disc");
  if (!disc || typeof wheelPrizes === "undefined" || wheelPrizes.length === 0) {
    return;
  }

  const segmentAngle = 360 / wheelPrizes.length;

  const gradientParts = wheelPrizes
    .map((p, i) => `${p.color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`)
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
}

/* ------------------------------------------------------
   STATUS-ANZEIGE (gesperrt/frei, aktuelle Streak)
------------------------------------------------------ */
function refreshWheelStatus() {
  const state = getWheelState();
  const statusEl = document.getElementById("wheel-status");
  const spinBtn = document.getElementById("spin-button");

  if (!statusEl || !spinBtn) return;

  const today = todayStr();

  if (!state.nickname) {
    spinBtn.disabled = true;
    statusEl.textContent = "Bitte trag zuerst deinen Namen ein.";
    return;
  }

  if (state.lastSpin === today) {
    spinBtn.disabled = true;
    statusEl.textContent = `Heute schon gedreht – komm morgen wieder! Aktuelle Streak: ${state.streak} Tag(e) 🔥`;
  } else {
    spinBtn.disabled = false;
    statusEl.textContent =
      state.streak > 0
        ? `Aktuelle Streak: ${state.streak} Tag(e) 🔥 – heute noch nicht gedreht!`
        : "Heute noch nicht gedreht – viel Glück!";
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

  if (wheelDb) {
    wheelAuthReady.then((uid) => {
      if (!uid) {
        console.warn("Keine Firebase-Anmeldung vorhanden, Eintrag wird nicht in der Rangliste gespeichert.");
        return;
      }

      wheelDb
        .collection("wheelPlayers")
        .doc(uid)
        .set({
          nickname: state.nickname,
          streak: newStreak,
          lastSpin: today,
          lastPrize: prize.label,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => {
          console.error("Rangliste konnte nicht gespeichert werden:", err);
        });
    });
  }
}

/* ------------------------------------------------------
   RANGLISTE LADEN
------------------------------------------------------ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

  wheelDb
    .collection("wheelPlayers")
    .orderBy("streak", "desc")
    .limit(20)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        container.innerHTML =
          '<p class="wheel-status">Noch niemand hat gedreht – sei der Erste!</p>';
        return;
      }

      let html =
        '<table class="leaderboard-table"><thead><tr><th>#</th><th>Name</th><th>Streak</th></tr></thead><tbody>';
      let rank = 1;

      snapshot.forEach((doc) => {
        const data = doc.data();
        html += `<tr><td>${rank}</td><td>${escapeHtml(data.nickname || "Unbekannt")}</td><td>${data.streak || 0} 🔥</td></tr>`;
        rank++;
      });

      html += "</tbody></table>";
      container.innerHTML = html;
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
  if (pageID !== "wheel") return;

  if (!wheelBuilt) {
    buildWheel();
    wheelBuilt = true;
  }

  const nicknameInput = document.getElementById("wheel-nickname-input");
  if (nicknameInput) {
    nicknameInput.value = localStorage.getItem("wheelNickname") || "";
  }

  refreshWheelStatus();
}

function updateLeaderboardPage(pageID) {
  if (pageID === "leaderboard") {
    loadLeaderboard();
  }
}
