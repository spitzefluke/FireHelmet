/* ======================================================
   THE CHALLENGE - TURNIER-SEITE (Phase 7)
   ---------------------------------------------------
   Verbindet die bisherigen Bausteine zu einer echten Seite:
   - tournament-api.js (Phase 4): Datenzugriff/RPCs
   - tournament-data.js (Phase 5/6): Rundennamen, aktives Minispiel
   - tournament-bracket.js (Phase 5): Bracket-Rendering
   - games/reaction-game.js (Phase 6): das eigentliche Minispiel

   Diese Datei selbst kennt kein SQL/PostgREST-Detail - sie ruft nur
   die oben genannten Funktionen auf und reagiert auf deren Ergebnisse/
   Fehler (siehe mapTournamentErrorToMessage(), das die rohen
   raise-exception-Texte aus 07-tournament.sql in Anzeigetexte
   uebersetzt).

   ASYNCHRONES MULTIPLAYER-MODELL: kein Realtime/WebSocket noetig -
   die Seite laedt den aktuellen Stand bei jedem Seitenaufruf neu und
   pollt zusaetzlich alle TOURNAMENT_POLL_INTERVAL_MS, SOLANGE man auf
   der Seite ist (siehe startTournamentPoll()/stopTournamentPoll(),
   exakt dasselbe Muster wie der Boss-Gegenangriff-Timer in
   community-boss.js). Waehrend ein Minispiel laeuft oder eine
   Aktion (Beitreten/Absenden) unterwegs ist, wird das Poll-Rerendern
   bewusst ausgesetzt (tournamentGameInProgress/tournamentPageBusy),
   damit es dem Spieler nicht mitten im Spiel den Bildschirm wegzieht.
====================================================== */

const TOURNAMENT_POLL_INTERVAL_MS = 12000;

let tournamentPollTimer = null;
let tournamentPageBusy = false; // Beitreten/Match-Uebermittlung laeuft gerade
let tournamentGameInProgress = false; // Minispiel ist gerade gemountet
let tournamentCurrentUid = null; // vom letzten renderTournamentPage()-Durchlauf, fuer den Ergebnis-Bildschirm

function tt(key, fallback) {
  return typeof t === "function" ? t(key, fallback) : fallback;
}

function updateTournamentPage(pageID) {
  if (pageID !== "tournament") {
    stopTournamentPoll();
    if (window.TOURNAMENT_GAME_HANDLERS && window.TOURNAMENT_GAME_HANDLERS.reaction) {
      window.TOURNAMENT_GAME_HANDLERS.reaction.unmount();
    }
    tournamentGameInProgress = false;
    return;
  }

  renderTournamentPage();
  startTournamentPoll();
}

function startTournamentPoll() {
  if (tournamentPollTimer) return;
  tournamentPollTimer = setInterval(() => {
    if (!tournamentPageBusy && !tournamentGameInProgress) renderTournamentPage();
  }, TOURNAMENT_POLL_INTERVAL_MS);
}

function stopTournamentPoll() {
  clearInterval(tournamentPollTimer);
  tournamentPollTimer = null;
}

/* ------------------------------------------------------
   FEHLERTEXTE
   ---------------------------------------------------
   tournament-api.js wirft Fehler bewusst unveraendert weiter (siehe
   Kopfkommentar dort) - hier werden die rohen raise exception-Texte
   aus app.tournament_*()/07-tournament.sql einmalig zentral in
   Anzeigetexte uebersetzt, statt an jeder Aufrufstelle einzeln.
------------------------------------------------------ */
const TOURNAMENT_ERROR_KEY_BY_CODE = {
  "not-signed-in": "tournament.error.notSignedIn",
  "invalid-score": "tournament.error.invalidScore",
  "match-not-found": "tournament.error.matchNotFound",
  "tournament-not-active": "tournament.error.notActive",
  "tournament-paused": "tournament.error.paused",
  "match-already-complete": "tournament.error.alreadyComplete",
  "match-not-ready": "tournament.error.notReady",
  "not-your-match": "tournament.error.notYourMatch",
  "already-played": "tournament.error.alreadyPlayed",
};

function mapTournamentErrorToMessage(err) {
  // Doppelter Turnierbeitritt scheitert an der zusammengesetzten
  // Primary Key von tournament_participants (kein eigener
  // raise exception-Text, siehe 07-tournament.sql) - kommt als
  // Postgres-Unique-Violation (23505) durch.
  if (err && err.code === "23505") {
    return tt("tournament.error.alreadyJoined", "Du bist diesem Turnier bereits beigetreten.");
  }

  const code = err && err.message;
  const key = code && TOURNAMENT_ERROR_KEY_BY_CODE[code];
  return key ? tt(key, code) : tt("tournament.error.generic", "Etwas ist schiefgelaufen. Bitte versuch es erneut.");
}

/* ------------------------------------------------------
   SEITE LADEN + RENDERN
------------------------------------------------------ */
async function renderTournamentPage() {
  const container = document.getElementById("tournament-page-body");
  if (!container || tournamentGameInProgress) return;

  if (!supabaseClient) {
    container.innerHTML = `<p class="wheel-status">${escapeHtml(tt("tournament.page.noSupabase", "Verbindung nicht verfuegbar."))}</p>`;
    return;
  }

  try {
    const uid = await wheelAuthReady;
    tournamentCurrentUid = uid;

    const [tournament, prize] = await Promise.all([getOpenTournament(), getTournamentPrize()]);
    const finished = tournament ? null : await getLastFinishedTournament();
    const active = tournament || finished;

    let matches = [];
    let participants = [];
    if (active) {
      [matches, participants] = await Promise.all([
        getTournamentMatches(active.id),
        getTournamentParticipants(active.id),
      ]);
    }

    container.innerHTML = buildTournamentPageHtml({ uid, tournament, finished, matches, participants, prize });
  } catch (err) {
    console.error("Turnier konnte nicht geladen werden:", err);
    container.innerHTML = `<p class="wheel-status">⚠️ ${escapeHtml(tt("tournament.page.loadError", "Turnier konnte nicht geladen werden."))}</p>`;
  }
}

/* ------------------------------------------------------
   HTML-AUFBAU
------------------------------------------------------ */
function buildTournamentPageHtml({ uid, tournament, finished, matches, participants, prize }) {
  const active = tournament || finished;
  const myParticipant = active ? participants.find((p) => p.firebase_uid === uid) : null;

  const prizeHtml = buildTournamentPrizeBannerHtml(prize);
  const statusHtml = buildTournamentStatusHtml({ uid, tournament, finished, matches, myParticipant });
  const bracketHtml = active && matches.length
    ? `<div class="tournament-bracket-wrap">${renderTournamentBracket(active, matches, uid)}</div>`
    : "";

  return `
    <div class="tournament-hero">
      <h1 class="tournament-hero-title">${escapeHtml(tt("tournament.page.title", "THE CHALLENGE"))}</h1>
      <p class="tournament-hero-tagline">${escapeHtml(tt("tournament.page.tagline", "Gewinne das Turnier. Gewinne die limitierte Cap."))}</p>
    </div>

    ${prizeHtml}
    ${statusHtml}
    ${bracketHtml}
  `;
}

// Nutzt dasselbe Cap-Bild wie die Piratenpass-Maximalstufe
// (assets/piratenpass/cap.webp, siehe PIRATE_PASS_CAP_IMAGE in
// progression-data.js) statt eines Emojis - dieselbe Cap ist hier wie
// dort der reale, limitierte Gegenstand. progression-data.js ist auf
// jeder Seite geladen (vor tournament.js in index.html), daher kein
// eigener Preload-mit-Fallback-Mechanismus wie beim Pass noetig - das
// Bild existiert nachweislich bereits.
function buildTournamentPrizeCapImgHtml() {
  const src = typeof PIRATE_PASS_CAP_IMAGE !== "undefined" ? PIRATE_PASS_CAP_IMAGE : "";
  if (!src) return "";
  return `<img class="tournament-prize-cap-icon" src="${src}" alt="" aria-hidden="true">`;
}

function buildTournamentPrizeBannerHtml(prize) {
  const capImg = buildTournamentPrizeCapImgHtml();

  if (prize) {
    const lang = getCurrentLang();
    const date = new Date(prize.claimed_at).toLocaleDateString(lang === "en" ? "en-US" : "de-DE");
    return `
      <div class="tournament-prize-banner is-won">
        ${capImg}
        <p class="tournament-prize-headline">${escapeHtml(tt("tournament.prize.wonBanner", "THE CAP HAS BEEN WON"))}</p>
        <p class="tournament-prize-sub">${escapeHtml(tt("tournament.prize.wonBy", "by"))} <strong>@${escapeHtml(prize.winner_nickname)}</strong> · ${escapeHtml(date)}</p>
      </div>
    `;
  }

  return `
    <div class="tournament-prize-banner is-available">
      ${capImg}
      <p class="tournament-prize-headline">${escapeHtml(tt("tournament.prize.availableBanner", "Die limitierte Cap ist noch nicht vergeben - werde der erste Champion!"))}</p>
    </div>
  `;
}

function buildTournamentStatusHtml({ uid, tournament, finished, matches, myParticipant }) {
  if (!tournament && !finished) {
    return `
      <div class="tournament-status-card">
        <p class="tournament-status-text">${escapeHtml(tt("tournament.page.noTournament", "Aktuell laeuft kein Turnier. Schau bald wieder vorbei!"))}</p>
      </div>
    `;
  }

  if (finished) {
    return buildTournamentFinishedHtml(finished, uid, myParticipant);
  }

  // tournament.status is either "registration" or "active" ab hier
  if (tournament.status === "registration") {
    return buildTournamentRegistrationHtml(tournament, myParticipant);
  }

  return buildTournamentActiveHtml(tournament, matches, uid, myParticipant);
}

function buildTournamentRegistrationHtml(tournament, myParticipant) {
  const explanation = `<p class="tournament-explanation">${escapeHtml(tt("tournament.page.explanation", ""))}</p>`;

  if (myParticipant) {
    return `
      <div class="tournament-status-card">
        ${explanation}
        <p class="tournament-status-text is-positive">${escapeHtml(tt("tournament.page.joinedStatus", "Du bist dabei! Warte auf den Turnierstart."))}</p>
      </div>
    `;
  }

  const nickname = localStorage.getItem("wheelNickname") || "";
  const enterButton = nickname
    ? `<button type="button" class="code-button tournament-enter-button" id="tournament-join-btn" onclick="joinTournamentFlow('${escapeHtml(tournament.id)}')">${escapeHtml(tt("tournament.page.enterButton", "TURNIER BEITRETEN"))}</button>`
    : `<p class="tournament-status-text is-warning">${escapeHtml(tt("tournament.page.needNickname", "Setze zuerst einen Namen, um teilzunehmen."))}</p>`;

  return `
    <div class="tournament-status-card">
      ${explanation}
      <p class="tournament-status-text">${escapeHtml(tt("tournament.page.registrationOpenStatus", "Die Anmeldung ist offen."))}</p>
      ${enterButton}
      <p id="tournament-join-status" class="tournament-status-text is-warning"></p>
    </div>
  `;
}

function buildTournamentActiveHtml(tournament, matches, uid, myParticipant) {
  const pausedNote = tournament.paused
    ? `<p class="tournament-status-text is-warning">${escapeHtml(tt("tournament.page.pausedStatus", "Das Turnier ist aktuell pausiert."))}</p>`
    : "";

  if (!myParticipant) {
    return `
      <div class="tournament-status-card">
        ${pausedNote}
        <p class="tournament-status-text">${escapeHtml(tt("tournament.page.alreadyStartedNotJoined", "Das Turnier laeuft bereits."))}</p>
      </div>
    `;
  }

  if (myParticipant.eliminated) {
    return `
      <div class="tournament-status-card">
        ${pausedNote}
        <p class="tournament-status-text is-negative">${escapeHtml(tt("tournament.page.eliminatedStatus", "Du bist ausgeschieden."))}</p>
      </div>
    `;
  }

  const myMatch = findMyOpenMatch(matches, uid);

  if (!myMatch || myMatch.status === "pending") {
    return `
      <div class="tournament-status-card">
        ${pausedNote}
        <p class="tournament-status-text">${escapeHtml(tt("tournament.page.waitingNextRound", "Warte auf deine naechste Runde..."))}</p>
        <button type="button" class="code-button tournament-refresh-button" onclick="renderTournamentPage()">${escapeHtml(tt("tournament.page.refreshButton", "🔄 Aktualisieren"))}</button>
      </div>
    `;
  }

  const amIP1 = myMatch.player_1_uid === uid;
  const myScoreAlready = amIP1 ? myMatch.player_1_score !== null : myMatch.player_2_score !== null;
  const opponentNickname = amIP1 ? myMatch.player_2_nickname : myMatch.player_1_nickname;

  if (myScoreAlready) {
    return `
      <div class="tournament-status-card">
        ${pausedNote}
        <p class="tournament-status-text">${escapeHtml(tt("tournament.page.alreadyPlayedWaiting", "Du hast bereits gespielt. Warte auf"))} <strong>${escapeHtml(opponentNickname || "?")}</strong>...</p>
        <button type="button" class="code-button tournament-refresh-button" onclick="renderTournamentPage()">${escapeHtml(tt("tournament.page.refreshButton", "🔄 Aktualisieren"))}</button>
      </div>
    `;
  }

  return `
    <div class="tournament-status-card">
      ${pausedNote}
      <p class="tournament-opponent-label">${escapeHtml(tt("tournament.page.opponentLabel", "Dein Gegner"))}</p>
      <p class="tournament-opponent-name">${escapeHtml(opponentNickname || "?")}</p>
      <button type="button" class="code-button tournament-play-button" ${tournament.paused ? "disabled" : ""} onclick="startTournamentMatch(${myMatch.id})">${escapeHtml(tt("tournament.page.playMatchButton", "MATCH SPIELEN"))}</button>
      <div id="tournament-game-container" class="tournament-game-slot"></div>
    </div>
  `;
}

function buildTournamentFinishedHtml(finished, uid, myParticipant) {
  const isWinner = finished.winner_uid && finished.winner_uid === uid;
  const headline = isWinner
    ? `<p class="tournament-status-text is-positive tournament-champion-headline">${escapeHtml(tt("tournament.page.youAreChampion", "🏆 DU HAST DAS TURNIER GEWONNEN!"))}</p>`
    : `<p class="tournament-status-text">${escapeHtml(tt("tournament.page.finishedStatus", "Das Turnier ist vorbei."))} ${finished.winner_nickname ? `${escapeHtml(tt("tournament.page.championLabel", "Champion"))}: <strong>${escapeHtml(finished.winner_nickname)}</strong>` : ""}</p>`;

  return `<div class="tournament-status-card">${headline}</div>`;
}

/* ------------------------------------------------------
   BEITRETEN
------------------------------------------------------ */
async function joinTournamentFlow(tournamentId) {
  if (tournamentPageBusy) return;

  const nickname = localStorage.getItem("wheelNickname") || "";
  const statusEl = document.getElementById("tournament-join-status");
  if (!nickname) {
    if (statusEl) statusEl.textContent = tt("tournament.page.needNickname", "Setze zuerst einen Namen, um teilzunehmen.");
    return;
  }

  tournamentPageBusy = true;
  const btn = document.getElementById("tournament-join-btn");
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = "";

  try {
    await joinTournament(tournamentId, nickname);
    await renderTournamentPage();
  } catch (err) {
    if (statusEl) statusEl.textContent = mapTournamentErrorToMessage(err);
    if (btn) btn.disabled = false;
  } finally {
    tournamentPageBusy = false;
  }
}

/* ------------------------------------------------------
   MATCH SPIELEN
------------------------------------------------------ */
function startTournamentMatch(matchId) {
  const container = document.getElementById("tournament-game-container");
  const handler = getActiveTournamentGameHandler();
  if (!container || !handler) return;

  tournamentGameInProgress = true;
  handler.mount(container, (scoreMs) => {
    submitTournamentMatchResult(matchId, scoreMs);
  });
}

async function submitTournamentMatchResult(matchId, scoreMs) {
  try {
    const result = await submitMatchScore(matchId, scoreMs);
    tournamentGameInProgress = false;
    renderTournamentMatchResult(result, scoreMs);
  } catch (err) {
    tournamentGameInProgress = false;
    const container = document.getElementById("tournament-game-container");
    if (container) {
      container.innerHTML = `<p class="tournament-status-text is-warning">${escapeHtml(mapTournamentErrorToMessage(err))}</p>`;
    }
    // Trotzdem den echten Serverstand nachladen (z.B. falls das Match
    // zwischenzeitlich schon vom Gegner-Timeout o.ae. abgeschlossen wurde).
    renderTournamentPage();
  }
}

function renderTournamentMatchResult(result, scoreMs) {
  const container = document.getElementById("tournament-game-container");
  if (!container) return;

  let headline;
  let cssClass;
  if (result.matchStatus === "complete") {
    const won = result.winnerUid === tournamentCurrentUid;
    headline = won
      ? tt("tournament.match.youWon", "Sieg! Du gehst weiter.")
      : tt("tournament.match.youLost", "Niederlage. Du bist ausgeschieden.");
    cssClass = won ? "is-win" : "is-loss";
  } else {
    headline = tt("tournament.match.waitingForOpponent", "Ergebnis gespeichert. Warte auf deinen Gegner...");
    cssClass = "is-waiting";
  }

  container.innerHTML = `
    <div class="tournament-match-result ${cssClass}">
      <p class="tournament-match-result-score">${escapeHtml(String(scoreMs))} ms</p>
      <p class="tournament-match-result-headline">${escapeHtml(headline)}</p>
      <button type="button" class="code-button" onclick="renderTournamentPage()">${escapeHtml(tt("tournament.match.continueButton", "Weiter"))}</button>
    </div>
  `;
}
