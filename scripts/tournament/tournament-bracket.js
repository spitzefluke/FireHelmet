/* ======================================================
   THE CHALLENGE - BRACKET-DARSTELLUNG (reines Rendering)
   ---------------------------------------------------
   Nimmt Turnier-/Match-Daten entgegen (aus tournament-api.js) und
   liefert reines HTML zurueck - keine eigenen Datenbankzugriffe, kein
   State. Die spaetere Seiten-Datei (Phase 7) ruft renderTournament
   Bracket() auf und fuegt das Ergebnis in einen Container ein; dieses
   Modul weiss nichts von "welche Seite gerade aktiv ist" o.ae.

   AUFBAU: eine horizontal scrollbare Spalte pro Runde (Achtelfinale
   -> ... -> Finale), je Spalte eine Karte pro Match. Bewusst OHNE
   gezeichnete Verbindungslinien zwischen den Runden (SVG-Konnektoren
   waeren deutlich mehr Code fuer wenig zusaetzlichen Nutzen bei einer
   Turniergroesse von hoechstens 16) - die Spalten-Reihenfolge macht
   den Turnierverlauf bereits eindeutig erkennbar, genau die
   "technisch einfachste, robusteste" Umsetzung.
====================================================== */

function formatTournamentScoreMs(scoreMs) {
  return typeof scoreMs === "number" ? `${scoreMs} ms` : "";
}

// ausgeschlossen (Migration 37): vom Admin ausgeschlossen - verliert
// jedes Match automatisch; steht sichtbar am Namen.
function renderTournamentPlayerSlot(uid, nickname, score, isWinner, matchComplete, ausgeschlossen) {
  const classes = ["tournament-match-player"];
  let nameHtml;

  if (!uid) {
    classes.push("is-pending");
    nameHtml = typeof t === "function" ? t("tournament.bracket.pending", "Wird ermittelt") : "Wird ermittelt";
  } else if (isTournamentByeSlot(uid)) {
    classes.push("is-bye");
    nameHtml = typeof t === "function" ? t("tournament.bracket.bye", "Freilos") : "Freilos";
  } else {
    nameHtml = typeof escapeHtml === "function" ? escapeHtml(nickname || "?") : (nickname || "?");
    if (isWinner) classes.push("is-winner");
    else if (matchComplete) classes.push("is-loser");
    if (ausgeschlossen) {
      classes.push("is-ausgeschlossen");
      const label = typeof t === "function" ? t("tournament.bracket.excluded", "ausgeschlossen") : "ausgeschlossen";
      nameHtml += ` <span class="tournament-match-player-badge">${typeof escapeHtml === "function" ? escapeHtml(label) : label}</span>`;
    }
  }

  const scoreHtml = typeof score === "number"
    ? `<span class="tournament-match-player-score">${formatTournamentScoreMs(score)}</span>`
    : "";

  return `<div class="${classes.join(" ")}">
    <span class="tournament-match-player-name">${nameHtml}</span>
    ${scoreHtml}
  </div>`;
}

function renderTournamentMatchCard(match, myUid, ausgeschlossen) {
  const aus = (uid) => !!ausgeschlossen && !!uid && ausgeschlossen.has(uid);
  const state = getTournamentMatchDisplayState(match);
  const isMine = !!myUid && (match.player_1_uid === myUid || match.player_2_uid === myUid);
  const classes = ["tournament-match-card", `is-${state}`];
  if (isMine) classes.push("is-mine");

  const complete = state === "complete";
  const p1IsWinner = complete && match.winner_uid === match.player_1_uid;
  const p2IsWinner = complete && match.winner_uid === match.player_2_uid;

  return `<div class="${classes.join(" ")}">
    ${renderTournamentPlayerSlot(match.player_1_uid, match.player_1_nickname, match.player_1_score, p1IsWinner, complete, aus(match.player_1_uid))}
    <div class="tournament-match-divider">vs</div>
    ${renderTournamentPlayerSlot(match.player_2_uid, match.player_2_nickname, match.player_2_score, p2IsWinner, complete, aus(match.player_2_uid))}
  </div>`;
}

// tournament: Zeile aus getOpenTournament()/getTournamentById() (braucht
// mind. bracket_size, status, winner_uid, winner_nickname).
// matches: Ergebnis von getTournamentMatches(tournamentId).
// myUid: optionale eigene UID, hebt das eigene Match/den eigenen
// Champion-Eintrag visuell hervor (siehe UX-Anforderung "wo bin ich im
// Turnier?").
// ausgeschlossen: optionales Set der UIDs, die der Admin ausgeschlossen
// hat (Migration 37) - stehen im Baum mit Hinweis.
function renderTournamentBracket(tournament, matches, myUid, ausgeschlossen) {
  if (!tournament || !Array.isArray(matches)) return "";

  const bracketSize = tournament.bracket_size;
  const totalRounds = getTournamentTotalRounds(bracketSize);
  if (!totalRounds) return "";

  const columns = [];
  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches = matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.match_index - b.match_index);

    const cardsHtml = roundMatches.map((m) => renderTournamentMatchCard(m, myUid, ausgeschlossen)).join("");

    columns.push(`
      <div class="tournament-round" data-round="${round}">
        <h3 class="tournament-round-title">${escapeHtml(getTournamentRoundName(round, bracketSize))}</h3>
        <div class="tournament-round-matches">${cardsHtml}</div>
      </div>
    `);
  }

  let championHtml = "";
  if (tournament.status === "finished" && tournament.winner_nickname) {
    const label = typeof t === "function" ? t("tournament.bracket.champion", "Champion") : "Champion";
    const isMyChampionship = !!myUid && tournament.winner_uid === myUid;
    championHtml = `
      <div class="tournament-round tournament-round-champion">
        <h3 class="tournament-round-title">🏆 ${escapeHtml(label)}</h3>
        <div class="tournament-champion-card${isMyChampionship ? " is-mine" : ""}">
          <span class="tournament-champion-name">${escapeHtml(tournament.winner_nickname)}</span>
        </div>
      </div>
    `;
  }

  return `<div class="tournament-bracket">${columns.join("")}${championHtml}</div>`;
}
