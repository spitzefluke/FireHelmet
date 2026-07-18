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
   RENNSTRECKE (aktuelle Woche) LADEN
------------------------------------------------------ */
function renderRaceTrack(containerId, entries, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = `<p class="wheel-status">${emptyMessage}</p>`;
    return;
  }

  const maxProgress = Math.max(
    raceConfig.finishLine,
    ...entries.map((e) => e.progress)
  );

  let html = "";

  entries.forEach((entry, i) => {
    const percent = Math.min(100, (entry.progress / maxProgress) * 100);
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;

    html += `
      <div class="race-track">
        <div class="race-fill" style="width:${percent}%;"></div>
        <span class="race-rank">${medal}</span>
        <span class="race-name">${escapeHtml(entry.nickname || "Unbekannt")}</span>
        <span class="race-car" style="left:${percent}%;">🏎️</span>
        <span class="race-points">${entry.progress} Pkt</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function loadRaceLeaderboard() {
  const container = document.getElementById("race-track-list");
  if (!container) return;

  if (!wheelDb) {
    container.innerHTML =
      '<p class="wheel-status">Das globale Rennen ist noch nicht eingerichtet (Firebase-Zugangsdaten fehlen in scripts/firebase-config.js).</p>';
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
      renderRaceTrack(
        "race-track-list",
        entries,
        "Noch niemand ist diese Woche gestartet – sei der Erste!"
      );
    })
    .catch((err) => {
      console.error("Rennen konnte nicht geladen werden:", err);
      container.innerHTML = '<p class="wheel-status">Rennen konnte nicht geladen werden.</p>';
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
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateRacePage(pageID) {
  if (pageID !== "race") {
    stopRaceCountdown();
    return;
  }

  refreshOwnRaceProgress();
  loadRaceLeaderboard();
  loadLastWeekWinner();
  startRaceCountdown();
}
