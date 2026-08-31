/* ======================================================
   "DER FALL DER VERSCHWUNDENEN DUBLONEN"
   ---------------------------------------------------
   Kleine, in sich geschlossene Krimi-/Detektiv-Mission. Reine
   Anzeige-/Interaktionslogik, keine Firestore/Supabase-Aufrufe -
   die eigentliche Belohnung (400 Dublonen + exklusiver Avatar) wird
   NICHT hier vergeben, sondern erst danach ueber das bestehende
   Code-System (scripts/codes/, checkCode() in main.js), sobald der
   Spieler den am Ende gezeigten Geheimcode dort einloest - siehe
   detective-case-data.js fuer den genauen Code und den Sicherheits-
   hinweis zur Taeter-Verschleierung.

   Lokaler Fortschritt (welche Hinweise schon untersucht wurden, ob
   der Fall schon geloest ist) liegt bewusst nur in localStorage,
   genau wie storyReadChapters/shipPuzzlesSolved an anderer Stelle -
   das hier ist ein Ratespiel ohne echten Vermoegenswert, der Wert
   entsteht erst beim spaeteren, serverseitig abgesicherten Code-
   Einloesen.
====================================================== */

let detectiveSelectedSuspectId = null;
let detectiveWrongGuessActive = false;

function getDetectiveRevealedClueIds() {
  try {
    return JSON.parse(localStorage.getItem("detectiveCaseRevealedClues") || "[]");
  } catch (err) {
    return [];
  }
}

function isDetectiveCaseSolved() {
  return localStorage.getItem("detectiveCaseSolved") === "1";
}

/* ------------------------------------------------------
   HINWEIS UNTERSUCHEN
------------------------------------------------------ */
function investigateDetectiveClue(clueId) {
  const revealed = getDetectiveRevealedClueIds();
  if (!revealed.includes(clueId)) {
    revealed.push(clueId);
    localStorage.setItem("detectiveCaseRevealedClues", JSON.stringify(revealed));
  }
  renderDetectiveCasePage();
}

/* ------------------------------------------------------
   VERDÄCHTIGEN AUSWÄHLEN
------------------------------------------------------ */
function selectDetectiveSuspect(suspectId) {
  detectiveSelectedSuspectId = suspectId;
  detectiveWrongGuessActive = false;

  document.querySelectorAll(".detective-suspect-card[data-suspect-id]").forEach((card) => {
    card.classList.toggle("detective-suspect-selected", card.dataset.suspectId === suspectId);
  });

  const btn = document.getElementById("detective-accuse-btn");
  if (btn) btn.disabled = false;

  const wrongBanner = document.getElementById("detective-wrong-guess");
  if (wrongBanner) wrongBanner.remove();
}

/* ------------------------------------------------------
   VERDÄCHTIGEN BESCHULDIGEN
   ---------------------------------------------------
   Vergleicht den SHA-256-Hash der ausgewaehlten Verdaechtigen-ID mit
   DETECTIVE_CASE_SOLUTION_HASH (sha256Hex() kommt aus main.js, exakt
   dieselbe Funktion, die auch das Code-System nutzt) - siehe
   Sicherheitshinweis in detective-case-data.js.
------------------------------------------------------ */
async function accuseDetectiveSuspect() {
  if (!detectiveSelectedSuspectId || typeof sha256Hex !== "function") return;

  const confirmMsg = typeof t === "function"
    ? t("detectiveCase.confirmAccuse", "Bist du dir sicher? Ein falscher Vorwurf könnte den wahren Täter warnen.")
    : "Bist du dir sicher? Ein falscher Vorwurf könnte den wahren Täter warnen.";
  if (!window.confirm(confirmMsg)) return;

  const guessHash = await sha256Hex(detectiveSelectedSuspectId);

  if (guessHash === DETECTIVE_CASE_SOLUTION_HASH) {
    localStorage.setItem("detectiveCaseSolved", "1");
    detectiveWrongGuessActive = false;
  } else {
    detectiveWrongGuessActive = true;
  }

  renderDetectiveCasePage();

  if (detectiveWrongGuessActive) {
    const banner = document.getElementById("detective-wrong-guess");
    if (banner) banner.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ------------------------------------------------------
   DARSTELLUNG
------------------------------------------------------ */
function safeDetectiveText(str) {
  return typeof escapeHtml === "function" ? escapeHtml(str || "") : (str || "");
}

function buildDetectiveSuspectCardHtml(suspect) {
  const isSelected = suspect.id === detectiveSelectedSuspectId;
  const character = suspect.characterId && typeof CHARACTER_DATABASE !== "undefined"
    ? CHARACTER_DATABASE[suspect.characterId]
    : null;

  const imageHtml = character && character.image
    ? `<img src="${character.image}" class="detective-suspect-image" alt="" loading="lazy" decoding="async">`
    : `<span class="detective-suspect-image detective-suspect-image-placeholder" aria-hidden="true">${suspect.emoji}</span>`;

  const name = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.name`) : suspect.id;
  const role = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.role`) : "";
  const statement = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.statement`) : "";

  return `
    <button type="button" class="detective-suspect-card${isSelected ? " detective-suspect-selected" : ""}"
      data-suspect-id="${suspect.id}" onclick="selectDetectiveSuspect('${suspect.id}')">
      ${imageHtml}
      <span class="detective-suspect-name">${safeDetectiveText(name)}</span>
      <span class="detective-suspect-role">${safeDetectiveText(role)}</span>
      <span class="detective-suspect-statement">&bdquo;${safeDetectiveText(statement)}&ldquo;</span>
    </button>
  `;
}

function buildDetectiveClueCardHtml(clue) {
  const revealed = getDetectiveRevealedClueIds().includes(clue.id);
  const title = typeof t === "function" ? t(`detectiveCase.clue.${clue.key}.title`) : clue.id;

  if (!revealed) {
    const cta = typeof t === "function" ? t("detectiveCase.investigateCta", "🔍 Untersuchen") : "🔍 Untersuchen";
    return `
      <button type="button" class="detective-clue-card detective-clue-locked" onclick="investigateDetectiveClue('${clue.id}')">
        <span class="detective-clue-icon" aria-hidden="true">${clue.icon}</span>
        <span class="detective-clue-title">${safeDetectiveText(title)}</span>
        <span class="detective-clue-cta">${cta}</span>
      </button>
    `;
  }

  const text = typeof t === "function" ? t(`detectiveCase.clue.${clue.key}.text`) : "";
  return `
    <div class="detective-clue-card detective-clue-revealed">
      <span class="detective-clue-icon" aria-hidden="true">${clue.icon}</span>
      <span class="detective-clue-title">${safeDetectiveText(title)}</span>
      <p class="detective-clue-text">${safeDetectiveText(text)}</p>
    </div>
  `;
}

function buildDetectiveWrongGuessHtml() {
  return `
    <div id="detective-wrong-guess" class="detective-wrong-guess">
      <p class="detective-wrong-guess-title" data-i18n="detectiveCase.wrong.title">❌ Falsche Spur.</p>
      <p data-i18n="detectiveCase.wrong.text">Deine Beweise reichen nicht aus. Der wahre Täter ist noch an Bord.</p>
      <p class="detective-wrong-guess-hint" data-i18n="detectiveCase.wrong.hint">Vielleicht solltest du die Aussagen noch einmal miteinander vergleichen.</p>
    </div>
  `;
}

function buildDetectiveSolvedHtml() {
  return `
    <div class="detective-solved">
      <p class="detective-solved-reveal" data-i18n="detectiveCase.solved.reveal">🕵️ FALL GELÖST!</p>
      <p data-i18n="detectiveCase.solved.revealLine1">Du hast den Täter entlarvt.</p>
      <p data-i18n="detectiveCase.solved.revealLine2">Die 400 verschwundenen Dublonen wurden gefunden.</p>

      <h2 class="detective-solved-heading" data-i18n="detectiveCase.solved.heading">🏆 DER FALL IST GELÖST</h2>
      <p data-i18n="detectiveCase.solved.crewLine">Die Crew kann aufatmen.</p>

      <h3 data-i18n="detectiveCase.solved.rewardHeading">DEINE BELOHNUNG</h3>
      <ul class="detective-reward-list">
        <li>💰 <span data-i18n="detectiveCase.solved.rewardCurrency">400 Dublonen</span></li>
        <li>🕵️ <span data-i18n="detectiveCase.solved.rewardAvatar">Exklusiver Avatar: Meisterdetektiv</span></li>
      </ul>

      <p data-i18n="detectiveCase.solved.codeUnlocked">Dein Geheimcode wurde freigeschaltet.</p>
      <p class="detective-secret-code">${DETECTIVE_CASE_SECRET_CODE}</p>

      <button type="button" class="code-button" onclick="changePage('code')" data-i18n="detectiveCase.solved.redeemButton">🔑 CODE EINLÖSEN</button>
    </div>
  `;
}

function renderDetectiveCasePage() {
  const container = document.getElementById("detective-case-content");
  if (!container || typeof DETECTIVE_CASE_SUSPECTS === "undefined") return;

  if (isDetectiveCaseSolved()) {
    container.innerHTML = buildDetectiveSolvedHtml();
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  const suspectsHtml = DETECTIVE_CASE_SUSPECTS.map(buildDetectiveSuspectCardHtml).join("");
  const cluesHtml = DETECTIVE_CASE_CLUES.map(buildDetectiveClueCardHtml).join("");
  const accuseDisabled = detectiveSelectedSuspectId ? "" : "disabled";

  container.innerHTML = `
    <p class="detective-story" data-i18n="detectiveCase.story">
      In der Nacht wurde die Schatzkammer zuletzt um 23:10 Uhr geöffnet - danach war das Gold weg. Vier Crewmitglieder waren zur Tatzeit an Bord. Einer von ihnen lügt. Untersuche die Hinweise, vergleiche die Aussagen - und finde heraus, wer wirklich hinter dem Diebstahl steckt.
    </p>

    <h2 class="detective-section-heading" data-i18n="detectiveCase.suspectsHeading">🧑‍🤝‍🧑 Verdächtige</h2>
    <div class="detective-suspects-grid">${suspectsHtml}</div>

    <h2 class="detective-section-heading" data-i18n="detectiveCase.cluesHeading">🔎 Hinweise</h2>
    <div class="detective-clues-grid">${cluesHtml}</div>

    ${detectiveWrongGuessActive ? buildDetectiveWrongGuessHtml() : ""}

    <div class="detective-accuse-box">
      <button type="button" id="detective-accuse-btn" class="code-button detective-accuse-btn" ${accuseDisabled} onclick="accuseDetectiveSuspect()" data-i18n="detectiveCase.accuseButton">🔎 VERDÄCHTIGEN BESCHULDIGEN</button>
    </div>
  `;

  if (typeof applyTranslations === "function") applyTranslations();
}

function updateDetectiveCasePage(pageID) {
  if (pageID !== "detective-case") return;

  detectiveSelectedSuspectId = null;
  detectiveWrongGuessActive = false;

  renderDetectiveCasePage();
}
