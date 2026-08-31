/* ======================================================
   GEWINNSPIEL
   - Läuft NICHT automatisch/periodisch, sondern wird von dir
     (scripts/giveaway-data.js: "id" + "active" + "endDate")
     gestartet
   - Besucher müssen aktiv auf "Teilnehmen" klicken, um im
     Lostopf zu sein - keine automatische Anmeldung
   - Nach dem Enddatum wird 1x deterministisch ausgelost und
     das Ergebnis dauerhaft festgeschrieben (bleibt stehen,
     bis du eine neue Runde mit neuer "id" startest)
====================================================== */

let giveawayCountdownInterval = null;

/* ------------------------------------------------------
   DETERMINISTISCHE ZUFALLSAUSWAHL
   Gleiche Runden-ID + gleicher Teilnehmerkreis ergibt für
   jeden Besucher IMMER das gleiche Ergebnis.
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

function pickGiveawayWinners(participants, count, roundId) {
  const rng = seededRandom(hashStringToInt("giveaway_" + roundId));
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
   COUNTDOWN BIS ZUM ENDDATUM
------------------------------------------------------ */
function stopGiveawayCountdown() {
  clearInterval(giveawayCountdownInterval);
  giveawayCountdownInterval = null;
}

function isGiveawayEnded() {
  return new Date() >= new Date(giveawayConfig.endDate);
}

function startGiveawayCountdown() {
  const el = document.getElementById("giveaway-countdown");
  if (!el) return;

  stopGiveawayCountdown();

  function tick() {
    const msLeft = new Date(giveawayConfig.endDate) - new Date();

    if (msLeft <= 0) {
      loadGiveawayView();
      return;
    }

    const totalSeconds = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    el.textContent = `⏳ Ziehung in ${days}T ${String(hours).padStart(2, "0")}Std ${String(minutes).padStart(2, "0")}Min`;
  }

  tick();
  giveawayCountdownInterval = setInterval(tick, 30000);
}

/* ------------------------------------------------------
   TEILNAHME (Beitritt per Knopfdruck)
------------------------------------------------------ */
function hasJoinedGiveaway() {
  return localStorage.getItem("giveawayJoinedId") === giveawayConfig.id;
}

function joinGiveaway() {
  const nickname = localStorage.getItem("wheelNickname") || "";
  const statusEl = document.getElementById("giveaway-join-status");

  if (!nickname) {
    if (statusEl) statusEl.textContent = "Bitte melde dich zuerst im 🎮 Anmelden-Bereich an.";
    return;
  }

  if (!supabaseClient) return;

  wheelAuthReady.then((uid) => {
    if (!uid) return;

    // Reines .insert() statt .set() - giveaway_entries hat in der RLS
    // bewusst KEINE update-Policy (siehe 05-site-data.sql), ein
    // zweiter Beitrittsversuch fuer dieselbe Runde/UID scheitert daher
    // schon am zusammengesetzten Primary Key (giveaway_id,
    // firebase_uid), genau wie zuvor Firestores "allow update: if false"
    // einen erneuten .set() auf denselben Dokumentnamen ablehnte.
    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    withSupabaseRlsColdStartRetry(() =>
      supabaseClient
        .from("giveaway_entries")
        .insert({ giveaway_id: giveawayConfig.id, firebase_uid: uid, nickname: nickname })
    )
      .then(({ error }) => {
        if (error) throw error;
        localStorage.setItem("giveawayJoinedId", giveawayConfig.id);
        loadGiveawayView();
      })
      .catch((err) => {
        console.error("Teilnahme fehlgeschlagen:", err);
        if (statusEl) statusEl.textContent = "⚠️ Teilnahme fehlgeschlagen. Versuch es nochmal.";
      });
  });
}

/* ------------------------------------------------------
   TEILNEHMERKREIS DIESER RUNDE LADEN
------------------------------------------------------ */
function loadGiveawayParticipants() {
  return supabaseClient
    .from("giveaway_entries")
    .select("firebase_uid, nickname")
    .eq("giveaway_id", giveawayConfig.id)
    .then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map((row) => ({ uid: row.firebase_uid, nickname: row.nickname }));
    });
}

/* ------------------------------------------------------
   GEWINNER LADEN ODER (EINMALIG) ZIEHEN
------------------------------------------------------ */
function loadOrDrawWinners(participants) {
  return supabaseClient
    .from("giveaway_winners")
    .select("winners")
    .eq("round_id", giveawayConfig.id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      if (data) return data.winners || [];

      const winners = pickGiveawayWinners(participants, giveawayConfig.winnersCount, giveawayConfig.id);
      if (!winners.length) return [];

      return wheelAuthReady.then((uid) => {
        if (!uid) return winners;

        // Reines .insert() statt Firestores atomarem .create() - der
        // Primary Key round_id sorgt bereits strukturell fuer dieselbe
        // Garantie: ein zweiter Zug fuer dieselbe Runde scheitert an
        // der Unique-Verletzung, kein doppeltes Ziehen moeglich.
        return withSupabaseRlsColdStartRetry(() =>
          supabaseClient.from("giveaway_winners").insert({ round_id: giveawayConfig.id, winners: winners })
        )
          .then(({ error: insertError }) => {
            if (insertError) throw insertError;
            return winners;
          })
          .catch(() => {
            // Ein anderer Besucher war schneller - dessen Ergebnis lesen
            return supabaseClient
              .from("giveaway_winners")
              .select("winners")
              .eq("round_id", giveawayConfig.id)
              .maybeSingle()
              .then(({ data: existing }) => (existing ? existing.winners : winners));
          });
      });
    });
}

/* ------------------------------------------------------
   GESAMTANSICHT LADEN
------------------------------------------------------ */
function loadGiveawayView() {
  const titleDescEl = document.getElementById("giveaway-prize-description");
  const joinBox = document.getElementById("giveaway-join-box");
  const joinBtn = document.getElementById("giveaway-join-btn");
  const joinStatus = document.getElementById("giveaway-join-status");
  const countdownEl = document.getElementById("giveaway-countdown");
  const poolEl = document.getElementById("giveaway-pool-size");
  const winnerEl = document.getElementById("giveaway-current-winner");
  const inactiveEl = document.getElementById("giveaway-inactive");

  if (titleDescEl) titleDescEl.textContent = giveawayConfig.prizeDescription;

  if (!giveawayConfig.active) {
    if (inactiveEl) inactiveEl.style.display = "block";
    if (joinBox) joinBox.style.display = "none";
    if (countdownEl) countdownEl.style.display = "none";
    if (poolEl) poolEl.style.display = "none";
    if (winnerEl) winnerEl.style.display = "none";
    stopGiveawayCountdown();
    return;
  }

  if (inactiveEl) inactiveEl.style.display = "none";

  if (!supabaseClient) {
    if (winnerEl) {
      winnerEl.style.display = "block";
      winnerEl.textContent = "Das Gewinnspiel ist noch nicht eingerichtet (Supabase-Zugangsdaten fehlen).";
    }
    return;
  }

  const ended = isGiveawayEnded();

  if (!ended) {
    // Runde läuft noch: Beitritts-Button + Countdown zeigen
    if (joinBox) joinBox.style.display = "block";
    if (countdownEl) {
      countdownEl.style.display = "block";
      startGiveawayCountdown();
    }
    if (winnerEl) winnerEl.style.display = "none";

    if (hasJoinedGiveaway()) {
      if (joinBtn) joinBtn.disabled = true;
      if (joinStatus) joinStatus.textContent = "✅ Du nimmst an dieser Runde teil!";
    } else {
      if (joinBtn) joinBtn.disabled = false;
      if (joinStatus) joinStatus.textContent = "";
    }
  } else {
    // Runde ist beendet: Countdown/Beitritt ausblenden, Gewinner zeigen
    if (joinBox) joinBox.style.display = "none";
    if (countdownEl) countdownEl.style.display = "none";
    stopGiveawayCountdown();

    if (winnerEl) {
      winnerEl.style.display = "block";
      winnerEl.textContent = "Lade Ergebnis ...";
    }
  }

  loadGiveawayParticipants().then((participants) => {
    if (poolEl) {
      poolEl.style.display = "block";
      poolEl.textContent = `${participants.length} Teilnehmer bei dieser Runde`;
    }

    if (ended && winnerEl) {
      loadOrDrawWinners(participants).then((winners) => {
        if (!winners.length) {
          winnerEl.textContent = "Bei dieser Runde hat niemand teilgenommen.";
        } else {
          const names = winners.map((w) => w.nickname).join(", ");
          winnerEl.textContent = `🏆 Gewinner: ${names}`;
        }
      });
    }
  });
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateGiveawayPage(pageID) {
  if (pageID !== "giveaway") {
    stopGiveawayCountdown();
    return;
  }

  loadGiveawayView();
}
