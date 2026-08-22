/* ======================================================
   THE CHALLENGE - MINI-GAME: REAKTIONSTEST (Phase 6)
   ---------------------------------------------------
   Erstes, bewusst sehr einfaches Turnier-Minispiel: "Druecke den
   Button, sobald er gruen wird." Gemessen wird die Reaktionszeit in
   Millisekunden (niedriger = besser) - genau das Format, das
   tournament-api.js/submitMatchScore() ohnehin erwartet (siehe
   app.tournament_submit_score() in supabase/game-migration/
   07-tournament.sql: gueltiger Bereich 50-10000ms, niedriger
   gewinnt).

   AUSTAUSCHBARKEIT (Auftrag: "sehr einfach & leicht austauschbar"):
   Dieses Modul kennt weder Turnier noch Match noch Supabase - es
   nimmt nur einen Container und einen Callback entgegen und liefert
   irgendwann GENAU EINMAL eine Millisekundenzahl zurueck. Ein
   zukuenftiges Spiel (z.B. ClickSpeedGame/MemoryGame) muss nur
   denselben mount(container, onScore)/unmount()-Vertrag erfuellen
   und sich unter einer neuen ID in TOURNAMENT_GAME_HANDLERS eintragen
   - welches Spiel gerade aktiv ist, waehlt Phase 7 ausschliesslich
   ueber TOURNAMENT_ACTIVE_GAME_ID (tournament-data.js), der Rest der
   Turnier-Logik (Bracket, Matches, Sieger, Preis) bleibt davon
   vollstaendig unberuehrt.

   SICHERHEIT: dieses Modul ist NICHT die Vertrauensgrenze (wie auch
   Spielothek/games/slot.js). Ein manipulierter Client koennte hier
   jeden Wert an onScore() uebergeben - die Datenbank prueft trotzdem
   selbst (50-10000ms, genau eine Einreichung pro Spieler pro Match,
   siehe 07-tournament.sql). Die Clamp-Logik hier verhindert nur,
   dass ein ehrlicher Client durch Rundungs-/Timing-Ausreisser einen
   fuer den Server ungueltigen Wert schickt.
====================================================== */

const REACTION_MIN_DELAY_MS = 1200;
const REACTION_MAX_DELAY_MS = 4000;
const REACTION_CLICK_WINDOW_MS = 3000; // Zeitfenster ab "gruen", danach Timeout
const REACTION_WORST_VALID_SCORE_MS = 10000; // Serverobergrenze - Strafwert bei Fruehklick/Timeout
const REACTION_BEST_VALID_SCORE_MS = 50; // Serveruntergrenze - Clamp gegen Timing-Ausreisser

function reactionT(key, fallback) {
  return typeof t === "function" ? t(key, fallback) : fallback;
}

// Modul-globaler State, bewusst wie SPIELOTHEK_GAME_HANDLERS.slot als
// einzelne aktive Instanz gehalten - ein Spieler spielt ohnehin immer
// nur genau ein offenes Match gleichzeitig.
let reactionGameState = null;

function clearReactionTimer() {
  if (reactionGameState && reactionGameState.timeoutId) {
    clearTimeout(reactionGameState.timeoutId);
    reactionGameState.timeoutId = null;
  }
}

// Schliesst die laufende Runde GENAU EINMAL ab. Der "done"-Schutz
// verhindert einen doppelten onScore()-Aufruf, falls z.B. sowohl ein
// Klick als auch ein bereits gefeuerter Timeout knapp aufeinander
// eintreffen.
function finishReactionGame(rawScoreMs, statusKey, statusFallback) {
  if (!reactionGameState || reactionGameState.done) return;
  reactionGameState.done = true;
  clearReactionTimer();

  const scoreMs = Math.max(
    REACTION_BEST_VALID_SCORE_MS,
    Math.min(REACTION_WORST_VALID_SCORE_MS, Math.round(rawScoreMs))
  );

  renderReactionResult(reactionGameState.container, scoreMs, statusKey, statusFallback);

  const onScore = reactionGameState.onScore;
  onScore(scoreMs);
}

function renderReactionResult(container, scoreMs, statusKey, statusFallback) {
  container.innerHTML = `
    <div class="tournament-reaction-game">
      <p class="tournament-reaction-status">${escapeHtml(reactionT(statusKey, statusFallback))}</p>
      <button type="button" class="code-button tournament-reaction-button is-done" disabled>
        ${escapeHtml(String(scoreMs))} ms
      </button>
      <p class="tournament-reaction-substatus">${escapeHtml(reactionT("tournament.reaction.resultButton", "Ergebnis wird uebermittelt..."))}</p>
    </div>
  `;
}

function renderReactionActivePhase(container) {
  container.innerHTML = `
    <div class="tournament-reaction-game">
      <p class="tournament-reaction-status">${escapeHtml(reactionT("tournament.reaction.goStatus", "JETZT KLICKEN!"))}</p>
      <button type="button" class="code-button tournament-reaction-button is-active" data-role="reaction-hit">
        ${escapeHtml(reactionT("tournament.reaction.goButton", "JETZT!"))}
      </button>
    </div>
  `;

  const greenAt = performance.now();

  const btn = container.querySelector('[data-role="reaction-hit"]');
  if (btn) {
    btn.addEventListener(
      "click",
      () => finishReactionGame(performance.now() - greenAt, "tournament.reaction.resultStatus", "Deine Zeit:"),
      { once: true }
    );
  }

  reactionGameState.timeoutId = setTimeout(() => {
    finishReactionGame(REACTION_WORST_VALID_SCORE_MS, "tournament.reaction.timeoutStatus", "Zu langsam! Zeit abgelaufen.");
  }, REACTION_CLICK_WINDOW_MS);
}

function renderReactionWaitingPhase(container) {
  container.innerHTML = `
    <div class="tournament-reaction-game">
      <p class="tournament-reaction-status">${escapeHtml(reactionT("tournament.reaction.waitingStatus", "Warte auf GRUEN..."))}</p>
      <button type="button" class="code-button tournament-reaction-button is-waiting" data-role="reaction-early">
        ${escapeHtml(reactionT("tournament.reaction.waitingButton", "Noch nicht!"))}
      </button>
    </div>
  `;

  const btn = container.querySelector('[data-role="reaction-early"]');
  if (btn) {
    btn.addEventListener(
      "click",
      () => finishReactionGame(REACTION_WORST_VALID_SCORE_MS, "tournament.reaction.earlyStatus", "Zu frueh geklickt! Das zaehlt als schlechteste Zeit."),
      { once: true }
    );
  }

  const delay = REACTION_MIN_DELAY_MS + Math.random() * (REACTION_MAX_DELAY_MS - REACTION_MIN_DELAY_MS);
  reactionGameState.timeoutId = setTimeout(() => {
    if (!reactionGameState || reactionGameState.done) return; // z.B. bereits per Fruehklick beendet
    renderReactionActivePhase(container);
  }, delay);
}

function renderReactionIdlePhase(container) {
  container.innerHTML = `
    <div class="tournament-reaction-game">
      <p class="tournament-reaction-status">${escapeHtml(reactionT("tournament.reaction.introStatus", "Bereit fuer den Reaktionstest?"))}</p>
      <button type="button" class="code-button tournament-reaction-button is-idle" data-role="reaction-start">
        ${escapeHtml(reactionT("tournament.reaction.startButton", "Los!"))}
      </button>
    </div>
  `;

  const btn = container.querySelector('[data-role="reaction-start"]');
  if (btn) {
    btn.addEventListener("click", () => renderReactionWaitingPhase(container), { once: true });
  }
}

window.TOURNAMENT_GAME_HANDLERS = window.TOURNAMENT_GAME_HANDLERS || {};

window.TOURNAMENT_GAME_HANDLERS.reaction = {
  id: "reaction",

  // container: bestehendes DOM-Element (von der Phase-7-Seite bereitgestellt).
  // onScore: wird GENAU EINMAL mit einer Zahl 50-10000 aufgerufen, sobald
  // ein Ergebnis feststeht (echter Klick im gruenen Fenster, Fruehklick
  // oder Timeout - beide Fehlerfaelle liefern die schlechtestmoegliche
  // gueltige Zeit statt eines Fehlers, damit der Aufrufer nie einen
  // Sonderfall behandeln muss). Ruft niemals eigenstaendig
  // submitMatchScore() auf - das entscheidet die Seiten-Datei (Phase 7).
  mount: function mountReactionGame(container, onScore) {
    if (!container || typeof onScore !== "function") return;
    reactionGameState = { container, onScore, timeoutId: null, done: false };
    renderReactionIdlePhase(container);
  },

  // Muss aufgerufen werden, sobald der Container verlassen wird (z.B.
  // Seitenwechsel waehrend des Wartens auf gruen) - sonst wuerde ein
  // verwaister setTimeout spaeter versuchen, ein bereits entferntes
  // Element zu beschreiben bzw. einen Callback auf einem Match
  // aufzurufen, das der Spieler gar nicht mehr aktiv betrachtet.
  unmount: function unmountReactionGame() {
    if (!reactionGameState) return;
    reactionGameState.done = true;
    clearReactionTimer();
    reactionGameState = null;
  },
};
