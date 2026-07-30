/* ======================================================
   GEWINNSPIEL
   - Alle registrierten Spieler (players-Sammlung) sind
     automatisch im Lostopf
   - Alle paar Tage (scripts/giveaway-data.js) wird ein
     Gewinner gezogen - komplett ohne eigenen Server:
     die Auslosung wird deterministisch aus der Perioden-
     Kennung berechnet, jeder Besucher kommt auf das
     GLEICHE Ergebnis
   - Das Ergebnis wird einmalig in Firestore festgeschrieben
     (der erste Besucher nach Ablauf der Periode "zieht" es,
     danach lesen alle nur noch den gespeicherten Gewinner)
====================================================== */

let giveawayCountdownInterval = null;

/* ------------------------------------------------------
   PERIODEN-BERECHNUNG
------------------------------------------------------ */
function getGiveawayPeriodId(date) {
  const anchor = new Date(giveawayConfig.anchorDate + "T00:00:00");
  const diffMs = date - anchor;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / giveawayConfig.drawEveryDays);
}

function getGiveawayPeriodEnd(periodId) {
  const anchor = new Date(giveawayConfig.anchorDate + "T00:00:00");
  return new Date(anchor.getTime() + (periodId + 1) * giveawayConfig.drawEveryDays * 86400000);
}

/* ------------------------------------------------------
   DETERMINISTISCHE ZUFALLSAUSWAHL
   Gleiche Perioden-Kennung + gleicher Teilnehmerkreis
   ergibt für jeden Besucher IMMER das gleiche Ergebnis.
------------------------------------------------------ */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickGiveawayWinners(participants, count, periodId) {
  const rng = seededRandom(hashStringToInt("giveaway_" + periodId));
  const pool = [...participants].sort((a, b) => a.uid.localeCompare(b.uid));

  const winners = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(rng() * pool.length);
    winners.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return winners;
}

/* ------------------------------------------------------
   COUNTDOWN BIS ZUR NÄCHSTEN ZIEHUNG
------------------------------------------------------ */
function stopGiveawayCountdown() {
  clearInterval(giveawayCountdownInterval);
  giveawayCountdownInterval = null;
}

function startGiveawayCountdown() {
  const el = document.getElementById("giveaway-countdown");
  if (!el) return;

  stopGiveawayCountdown();

  function tick() {
    const currentPeriod = getGiveawayPeriodId(new Date());
    const periodEnd = getGiveawayPeriodEnd(currentPeriod);
    const msLeft = periodEnd - new Date();

    if (msLeft <= 0) {
      loadGiveawayView();
      return;
    }

    const totalSeconds = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    el.textContent = `⏳ Nächste Ziehung in ${days}T ${String(hours).padStart(2, "0")}Std ${String(minutes).padStart(2, "0")}Min`;
  }

  tick();
  giveawayCountdownInterval = setInterval(tick, 30000);
}

/* ------------------------------------------------------
   TEILNEHMERKREIS LADEN (alle registrierten Spieler)
------------------------------------------------------ */
function loadGiveawayParticipants() {
  return wheelDb
    .collection("players")
    .get()
    .then((snapshot) => {
      const participants = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.nickname) {
          participants.push({ uid: doc.id, nickname: data.nickname });
        }
      });
      return participants;
    });
}

/* ------------------------------------------------------
   GEWINNER DER ABGESCHLOSSENEN PERIODE LADEN ODER ZIEHEN
------------------------------------------------------ */
function loadOrDrawWinners(periodId, participants) {
  const winnersRef = wheelDb.collection("giveawayWinners").doc(String(periodId));

  return winnersRef.get().then((doc) => {
    if (doc.exists) {
      return doc.data().winners || [];
    }

    // Noch nicht gezogen - wir ziehen jetzt deterministisch und schreiben es fest
    const winners = pickGiveawayWinners(participants, giveawayConfig.winnersCount, periodId);

    if (!winners.length) {
      return []; // niemand im Lostopf
    }

    return wheelAuthReady.then((uid) => {
      if (!uid) return winners;

      return winnersRef
        .create({
          period: periodId,
          winners: winners,
          drawnAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => winners)
        .catch(() => {
          // Ein anderer Besucher war schneller - einfach dessen Ergebnis lesen
          return winnersRef.get().then((d) => (d.exists ? d.data().winners : winners));
        });
    });
  });
}

/* ------------------------------------------------------
   VERGANGENE ZIEHUNGEN ANZEIGEN
------------------------------------------------------ */
function renderGiveawayHistory(docs) {
  const container = document.getElementById("giveaway-history");
  if (!container) return;

  if (!docs.length) {
    container.innerHTML = '<p class="wheel-status">Noch keine vergangenen Ziehungen.</p>';
    return;
  }

  let html = "";
  docs.forEach((data) => {
    const names = (data.winners || []).map((w) => escapeHtml(w.nickname)).join(", ");
    html += `<div class="giveaway-history-row">🏆 ${names || "niemand teilgenommen"}</div>`;
  });

  container.innerHTML = html;
}

/* ------------------------------------------------------
   GESAMTANSICHT LADEN
------------------------------------------------------ */
function loadGiveawayView() {
  const poolEl = document.getElementById("giveaway-pool-size");
  const winnerEl = document.getElementById("giveaway-current-winner");

  if (!wheelDb) {
    if (winnerEl) {
      winnerEl.textContent =
        "Das Gewinnspiel ist noch nicht eingerichtet (Firebase-Zugangsdaten fehlen).";
    }
    return;
  }

  loadGiveawayParticipants().then((participants) => {
    if (poolEl) {
      poolEl.textContent = `${participants.length} Teilnehmer aktuell im Lostopf`;
    }

    const currentPeriod = getGiveawayPeriodId(new Date());
    const lastCompletedPeriod = currentPeriod - 1;

    if (lastCompletedPeriod < 0) {
      if (winnerEl) winnerEl.textContent = "Die erste Ziehung steht noch bevor.";
    } else {
      loadOrDrawWinners(lastCompletedPeriod, participants).then((winners) => {
        if (!winnerEl) return;

        if (!winners.length) {
          winnerEl.textContent = "Bei der letzten Ziehung hat niemand teilgenommen.";
        } else {
          const names = winners.map((w) => w.nickname).join(", ");
          winnerEl.textContent = `🏆 Gewinner der letzten Ziehung: ${names}`;
        }
      });
    }

    // Verlauf laden (letzte 10 Perioden vor der aktuellen)
    wheelDb
      .collection("giveawayWinners")
      .orderBy("period", "desc")
      .limit(10)
      .get()
      .then((snapshot) => {
        const docs = [];
        snapshot.forEach((d) => docs.push(d.data()));
        renderGiveawayHistory(docs);
      })
      .catch(() => {
        renderGiveawayHistory([]);
      });
  });

  startGiveawayCountdown();
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateGiveawayPage(pageID) {
  if (pageID !== "giveaway") {
    stopGiveawayCountdown();
    return;
  }

  const descEl = document.getElementById("giveaway-prize-description");
  if (descEl && typeof giveawayConfig !== "undefined") {
    descEl.textContent = giveawayConfig.prizeDescription;
  }

  loadGiveawayView();
}
