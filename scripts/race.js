/* ======================================================
   WOCHENRENNEN
   - Jede Woche (Montag bis Sonntag) läuft ein eigenes Rennen
   - Fortschritt kommt automatisch durch Schatzrad-Drehungen
     (wheel.js -> finalizeSpin) und neu geknackte Codes
     (wheel.js -> recordCodeCrack)
   - Am Ende der Woche steht der Spieler mit dem meisten
     Fortschritt als Sieger fest - die neue Woche startet
     automatisch bei 0, ganz ohne Reset-Aktion nötig, weil
     jede Woche ihre eigene Kennung (z.B. "2026-W29") bekommt
   - Einstellungen: scripts/race-data.js
====================================================== */

let raceCountdownInterval = null;

/* ------------------------------------------------------
   WOCHEN-KENNUNG (ISO-Woche, z.B. "2026-W29")
------------------------------------------------------ */
function getISOWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const weekNum = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getCurrentWeekId() {
  return getISOWeekId(new Date());
}

function getPreviousWeekId() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getISOWeekId(d);
}

/* ------------------------------------------------------
   COUNTDOWN BIS ZUM WOCHENENDE (Montag 00:00)
------------------------------------------------------ */
function getMsUntilNextMonday() {
  const now = new Date();
  const dayNum = (now.getDay() + 6) % 7; // Montag = 0 ... Sonntag = 6
  const daysUntilMonday = 7 - dayNum;

  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    0, 0, 0, 0
  );

  return nextMonday - now;
}

function stopRaceCountdown() {
  clearInterval(raceCountdownInterval);
  raceCountdownInterval = null;
}

function startRaceCountdown() {
  const el = document.getElementById("race-countdown");
  if (!el) return;

  stopRaceCountdown();

  function tick() {
    const msLeft = getMsUntilNextMonday();

    if (msLeft <= 0) {
      // Neue Woche hat begonnen - Ansicht neu laden
      loadRaceLeaderboard();
      loadLastWeekWinner();
      return;
    }

    const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    el.textContent = `⏳ Noch ${days}T ${String(hours).padStart(2, "0")}Std ${String(minutes).padStart(2, "0")}Min bis Rennende`;
  }

  tick();
  raceCountdownInterval = setInterval(tick, 30000);
}

/* ------------------------------------------------------
   FORTSCHRITT HINZUFÜGEN
   Wird von wheel.js aufgerufen (Drehung / neuer Code)
------------------------------------------------------ */
function getLocalRaceProgress() {
  const currentWeek = getCurrentWeekId();
  const storedWeek = localStorage.getItem("raceWeek");

  if (storedWeek !== currentWeek) {
    // Neue Woche -> lokaler Fortschritt beginnt wieder bei 0
    localStorage.setItem("raceWeek", currentWeek);
    localStorage.setItem("raceProgress", "0");
    return 0;
  }

  return parseInt(localStorage.getItem("raceProgress") || "0", 10);
}

function addRaceProgress(amount) {
  const currentWeek = getCurrentWeekId();
  const newProgress = getLocalRaceProgress() + amount;

  localStorage.setItem("raceWeek", currentWeek);
  localStorage.setItem("raceProgress", String(newProgress));

  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname || !wheelDb) return;

  wheelAuthReady.then((uid) => {
    if (!uid) return;

    wheelDb
      .collection("raceProgress")
      .doc(`${currentWeek}_${uid}`)
      .set(
        {
          week: currentWeek,
          uid: uid,
          nickname: nickname,
          progress: newProgress,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch((err) => {
        console.error("Rennfortschritt konnte nicht gespeichert werden:", err);
      });
  });

  refreshOwnRaceProgress();
  // Live-Rangliste nachladen, falls die Rennseite gerade offen ist
  loadRaceLeaderboard();
}

/* ------------------------------------------------------
   EIGENEN FORTSCHRITT ANZEIGEN
------------------------------------------------------ */
function refreshOwnRaceProgress() {
  const el = document.getElementById("race-own-progress");
  if (!el) return;

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname) {
    el.textContent = "Trag im 🧭 Schatzrad zuerst deinen Namen ein, um mitzufahren.";
    return;
  }

  const progress = getLocalRaceProgress();
  el.textContent = `Dein Fortschritt diese Woche: ${progress} Punkte`;
}

/* ------------------------------------------------------
   RENNSTRECKE ZEICHNEN
   Die Karts fahren entlang eines SVG-Pfads (ovale Strecke)
   und richten sich dabei automatisch in Fahrtrichtung aus.
   Jeder Spieler bekommt ein festes Kart-Element, das bei
   jeder Aktualisierung sanft an die neue Position gleitet,
   statt zu "springen".
------------------------------------------------------ */
const raceKartColors = ["#ff5252", "#4da3ff", "#ffd76b", "#8a6bff", "#4ade80", "#ff9f4d", "#f472b6", "#38bdf8"];
let raceKartElements = {};
let raceTrackLength = null;

function getRaceTrackLength() {
  if (raceTrackLength) return raceTrackLength;

  const pathEl = document.getElementById("race-track-path");
  if (!pathEl) return 0;

  raceTrackLength = pathEl.getTotalLength();
  return raceTrackLength;
}

function createKartElement(uid) {
  const svgNS = "http://www.w3.org/2000/svg";
  const kart = document.createElementNS(svgNS, "g");
  kart.setAttribute("class", "race-kart");

  kart.innerHTML = `
    <text class="kart-label" y="-15" text-anchor="middle"></text>
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="9" rx="11" ry="3.5"></ellipse>
      <g class="kart-wheel-group" transform="translate(-6,-7)">
        <circle class="kart-wheel" r="2.6"></circle>
        <rect class="kart-spoke" x="-2.2" y="-.5" width="4.4" height="1"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(-6,7)">
        <circle class="kart-wheel" r="2.6"></circle>
        <rect class="kart-spoke" x="-2.2" y="-.5" width="4.4" height="1"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(6,-7)">
        <circle class="kart-wheel" r="2.6"></circle>
        <rect class="kart-spoke" x="-2.2" y="-.5" width="4.4" height="1"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(6,7)">
        <circle class="kart-wheel" r="2.6"></circle>
        <rect class="kart-spoke" x="-2.2" y="-.5" width="4.4" height="1"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <rect class="kart-body" x="-9" y="-6.5" width="18" height="13" rx="4"></rect>
      <rect class="kart-stripe" x="-9" y="-2" width="18" height="4"></rect>
      <polygon class="kart-nose" points="9,-3.5 15,0 9,3.5"></polygon>
      <circle class="kart-helmet" cx="-2" cy="0" r="3"></circle>
    </g>
  `;

  document.getElementById("race-karts-layer").appendChild(kart);
  return kart;
}

function positionKart(uid, percent, nickname, colorIndex) {
  const pathEl = document.getElementById("race-track-path");
  if (!pathEl) return;

  const length = getRaceTrackLength();
  const clamped = Math.max(0, Math.min(1, percent));
  const point = pathEl.getPointAtLength(clamped * length);
  const lookAhead = pathEl.getPointAtLength(Math.min(length, clamped * length + 2));
  const angle = Math.atan2(lookAhead.y - point.y, lookAhead.x - point.x) * (180 / Math.PI);

  let kart = raceKartElements[uid];
  if (!kart) {
    kart = createKartElement(uid);
    raceKartElements[uid] = kart;
  }

  kart.querySelector(".kart-body").setAttribute("fill", raceKartColors[colorIndex % raceKartColors.length]);
  kart.querySelector(".kart-label").textContent = nickname;
  kart.style.transform = `translate(${point.x}px, ${point.y}px) rotate(${angle}deg)`;
}

function removeStaleKarts(activeUids) {
  Object.keys(raceKartElements).forEach((uid) => {
    if (!activeUids.includes(uid)) {
      raceKartElements[uid].remove();
      delete raceKartElements[uid];
    }
  });
}

function renderRaceResultsList(entries) {
  const list = document.getElementById("race-results-list");
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = "";
    return;
  }

  let html = "";
  entries.forEach((entry, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    html += `
      <div class="race-result-row">
        <span class="race-result-rank">${medal}</span>
        <span class="race-result-name">${escapeHtml(entry.nickname || "Unbekannt")}</span>
        <span class="race-result-points">${entry.progress} Pkt</span>
      </div>
    `;
  });

  list.innerHTML = html;
}

function renderRaceTrack(entries, emptyMessage) {
  const wrap = document.getElementById("race-track-wrap");
  const emptyEl = document.getElementById("race-track-empty");
  if (!wrap) return;

  if (!entries.length) {
    if (emptyEl) {
      emptyEl.textContent = emptyMessage;
      emptyEl.style.display = "flex";
    }
    removeStaleKarts([]);
    renderRaceResultsList([]);
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  const maxProgress = Math.max(raceConfig.finishLine, ...entries.map((e) => e.progress));
  const activeUids = [];

  entries.forEach((entry, i) => {
    const uid = entry.uid || entry.nickname; // Fallback für ältere Datensätze ohne uid
    activeUids.push(uid);
    const percent = entry.progress / maxProgress;
    positionKart(uid, percent, entry.nickname, i);
  });

  removeStaleKarts(activeUids);
  renderRaceResultsList(entries);
}

function loadRaceLeaderboard() {
  const emptyEl = document.getElementById("race-track-empty");

  if (!wheelDb) {
    if (emptyEl) {
      emptyEl.textContent =
        "Das globale Rennen ist noch nicht eingerichtet (Firebase-Zugangsdaten fehlen in scripts/firebase-config.js).";
      emptyEl.style.display = "flex";
    }
    return;
  }

  const currentWeek = getCurrentWeekId();

  wheelDb
    .collection("raceProgress")
    .where("week", "==", currentWeek)
    .orderBy("progress", "desc")
    .limit(raceConfig.topPlayersShown)
    .get()
    .then((snapshot) => {
      const entries = [];
      snapshot.forEach((doc) => entries.push(doc.data()));
      renderRaceTrack(entries, "Noch niemand ist diese Woche gestartet – sei der Erste!");
    })
    .catch((err) => {
      console.error("Rennen konnte nicht geladen werden:", err);

      if (!emptyEl) return;

      if (err.code === "failed-precondition") {
        emptyEl.textContent =
          "Firestore braucht noch einen Suchindex fürs Rennen. Öffne die Browser-Konsole (F12) - " +
          "dort zeigt Firebase einen Link zum automatischen Erstellen an. Einmal klicken, kurz " +
          "warten (1-2 Minuten), dann Seite neu laden.";
      } else {
        emptyEl.textContent = "Rennen konnte nicht geladen werden.";
      }
      emptyEl.style.display = "flex";
    });
}

/* ------------------------------------------------------
   SIEGER DER LETZTEN WOCHE
------------------------------------------------------ */
function loadLastWeekWinner() {
  const el = document.getElementById("race-last-winner");
  if (!el || !wheelDb) return;

  const previousWeek = getPreviousWeekId();

  wheelDb
    .collection("raceProgress")
    .where("week", "==", previousWeek)
    .orderBy("progress", "desc")
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        el.textContent = "Letzte Woche gab es noch keinen Sieger.";
        return;
      }

      const winner = snapshot.docs[0].data();
      el.textContent = `🏆 Sieger der letzten Woche: ${winner.nickname} mit ${winner.progress} Punkten!`;
    })
    .catch((err) => {
      console.error("Vorwochen-Sieger konnte nicht geladen werden:", err);
    });
}

/* ------------------------------------------------------
   TÄGLICHER RENNEN-BONUS
   Zusätzlich zum Fortschritt durch Rad/Codes gibt es einmal
   am Tag einen kleinen Bonus, nur fürs Vorbeischauen beim Rennen.
------------------------------------------------------ */
function refreshRaceDailyStatus() {
  const btn = document.getElementById("race-daily-button");
  const statusEl = document.getElementById("race-daily-status");
  if (!btn || !statusEl) return;

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname) {
    btn.disabled = true;
    statusEl.textContent = "Trag im 🧭 Schatzrad zuerst deinen Namen ein, um mitzufahren.";
    return;
  }

  const today = todayStr();
  const lastClaim = localStorage.getItem("raceDailyBonusDate");

  if (lastClaim === today) {
    btn.disabled = true;
    statusEl.textContent = "Tagesbonus heute schon abgeholt – komm morgen wieder! 🎁";
  } else {
    btn.disabled = false;
    statusEl.textContent = `Heute noch nicht abgeholt: +${raceConfig.dailyBonusProgress} Bonus-Punkte warten! 🎁`;
  }
}

function claimDailyRaceBonus() {
  const nickname = localStorage.getItem("wheelNickname") || "";
  const today = todayStr();
  const lastClaim = localStorage.getItem("raceDailyBonusDate");

  if (!nickname || lastClaim === today) {
    refreshRaceDailyStatus();
    return;
  }

  localStorage.setItem("raceDailyBonusDate", today);
  addRaceProgress(raceConfig.dailyBonusProgress);
  refreshRaceDailyStatus();
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateRacePage(pageID) {
  if (pageID !== "race") {
    stopRaceCountdown();
    return;
  }

  refreshOwnRaceProgress();
  refreshRaceDailyStatus();
  loadRaceLeaderboard();
  loadLastWeekWinner();
  startRaceCountdown();
}
