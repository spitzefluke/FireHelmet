/* ======================================================
   "REPARIERE DAS SCHIFF" - EVENT-LOGIK
   ---------------------------------------------------
   Baut auf der bestehenden ???-Seite (#streamraetsel, siehe
   scripts/streamraetsel/streamraetsel.js) auf: derselbe
   Locked/Unlocked-Mechanismus, derselbe echte Zeitstempel-
   Vergleich (kein im Browser herunterzählender Timer), nur mit
   neuem Inhalt statt des generischen Rätsel-Textes.

   ARCHITEKTUR (Punkt 22/39 des Auftrags):
   - Das SCHIFF selbst ist EIN gemeinsames Community-Objekt,
     genau wie der Community-Boss (eine Firestore-Instanz für
     alle: Sammlung "ship_repair", Dokument "main"). Reparatur-
     phasen/-fortschritt sind dadurch ECHT global synchronisiert.
   - WERKZEUGE sind dagegen persönliches Inventar pro Spieler
     (players/{uid}.shipTools), genau wie Dublonen/ownedShopItems.
   - Ohne Login/Firebase (wheelDb nicht verfügbar) läuft die Seite
     im reinen Lesemodus mit klarer Meldung, statt einen zweiten,
     nur-lokalen Fortschritt vorzutäuschen (Punkt 22: "nicht
     vortäuschen, dass es global synchronisiert ist").
====================================================== */

/* ------------------------------------------------------
   OWNER-/PREVIEW-GATE (Punkt 5 des Auftrags)
   ---------------------------------------------------
   WICHTIG - das ist AUSDRÜCKLICH KEIN echter Zugriffsschutz:
   Es ist eine reine Frontend-Komfortfunktion, damit der
   Entwickler das Event vor dem echten Ablaufdatum ansehen kann.
   Jeder, der den Quelltext liest (oder einfach diesen Kommentar),
   kann den Query-Parameter unten selbst setzen. Es gibt in einer
   rein statischen GitHub-Pages-Seite ohne eigenes Backend keine
   Möglichkeit, ein "echtes" Passwort sicher zu prüfen - siehe
   Abschlussbericht für die ausführliche Einordnung.
   Aktivierung: index.html?fhpreview=1 einmal aufrufen (merkt sich
   das per localStorage) - ?fhpreview=0 schaltet es wieder aus.
------------------------------------------------------ */
const FH_PREVIEW_STORAGE_KEY = "fhDevPreview";

function initShipPreviewGate() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("fhpreview")) {
    if (params.get("fhpreview") === "1") {
      localStorage.setItem(FH_PREVIEW_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(FH_PREVIEW_STORAGE_KEY);
    }
  }
}

function isShipPreviewActive() {
  return localStorage.getItem(FH_PREVIEW_STORAGE_KEY) === "1";
}

/* ------------------------------------------------------
   FREISCHALT-ZUSTAND
   Exakt dasselbe Prinzip wie isStreamRaetselUnlocked(): fester
   Zeitstempel aus der Konfiguration, kein im Browser
   herunterzählender Wert - ein Reload springt nie zurück auf
   "10 Tage" (Punkt 4 des Auftrags).
------------------------------------------------------ */
function getShipEventUnlockDate() {
  const override = typeof siteConfig !== "undefined" ? siteConfig.shipEventUnlockDate : null;
  return new Date(override || FIRE_HELMET_CONFIG.shipEventUnlockDate);
}

function isShipEventUnlocked() {
  if (isShipPreviewActive()) return true;
  return new Date() >= getShipEventUnlockDate();
}

/* ------------------------------------------------------
   ZUFÄLLIGE REPARATURDAUER (Punkt 17)
------------------------------------------------------ */
function getRandomRepairDurationMs() {
  const min = SHIP_REPAIR_DURATION_MIN_MS;
  const max = SHIP_REPAIR_DURATION_MAX_MS;
  return Math.floor(min + Math.random() * (max - min));
}

/* ------------------------------------------------------
   GEMEINSAMER SCHIFFS-ZUSTAND (Firestore, EIN Dokument für
   die ganze Community - siehe loadBossState() in
   community-boss.js für dasselbe Muster)
------------------------------------------------------ */
async function loadShipState() {
  if (!wheelDb) return null;
  if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;

  const docRef = wheelDb.collection("ship_repair").doc("main");
  const snap = await docRef.get();

  if (snap.exists) return { ref: docRef, data: snap.data() };

  const initialData = { completedPhases: [], activeRepair: null, shipName: null, namedBy: null };
  try {
    await docRef.set(initialData);
  } catch (err) {
    // ein anderer Besucher war evtl. eine Millisekunde schneller
  }
  const freshSnap = await docRef.get();
  return { ref: docRef, data: freshSnap.exists ? freshSnap.data() : initialData };
}

function getNextPhase(completedPhases) {
  return SHIP_REPAIR_PHASES.find((p) => !completedPhases.includes(p.id)) || null;
}

/* ------------------------------------------------------
   FALLS EINE REPARATUR FERTIG IST: ABSCHLIESSEN
   Läuft rein zeitstempelbasiert (repairEndsAt), genau wie der
   Event-Countdown selbst - überlebt Reload/Seitenverlassen
   (Punkt 18/19).
------------------------------------------------------ */
async function checkAndCompleteActiveRepair() {
  if (!wheelDb) return;

  const docRef = wheelDb.collection("ship_repair").doc("main");

  try {
    await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) return;
      const data = snap.data();
      const active = data.activeRepair;
      if (!active || Date.now() < active.endsAt) return;

      const completed = [...(data.completedPhases || []), active.phaseId];
      const isFinal = completed.length >= SHIP_REPAIR_PHASES.length;

      const update = { completedPhases: completed, activeRepair: null };
      if (isFinal && !data.shipName) {
        update.shipName = generateShipName(active.startedBy || "");
        update.namedBy = active.startedBy || null;
      }
      tx.update(docRef, update);
    });
  } catch (err) {
    console.warn("Reparatur konnte nicht abgeschlossen werden:", err);
  }
}

/* ------------------------------------------------------
   SCHIFFSNAME AUS DEM ANGEMELDETEN BENUTZERNAMEN (Punkt 23/24)
------------------------------------------------------ */
const SHIP_NAME_SUFFIXES = ["Revenge", "Pride", "Fury", "Glory", "Legacy", "Fortune"];

function generateShipName(nickname) {
  if (!nickname) return null;
  const suffix = SHIP_NAME_SUFFIXES[Math.floor(Math.random() * SHIP_NAME_SUFFIXES.length)];
  return `${nickname}'s ${suffix}`;
}

/* ------------------------------------------------------
   REPARATUR STARTEN
   Prüft serverseitig (Firestore-Transaktionen), dass wirklich
   noch kein Team gerade repariert UND dass der Spieler das
   richtige Werkzeug wirklich besitzt - eine geänderte
   Browser-Variable allein reicht nicht aus, um Fortschritt zu
   erzwingen (Punkt 40).
------------------------------------------------------ */
async function startShipRepair(phaseId) {
  const statusEl = document.getElementById("ship-repair-status");
  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname || !wheelDb) {
    if (statusEl) statusEl.textContent = "Melde dich zuerst an, um mitzureparieren!";
    return;
  }

  const phase = SHIP_REPAIR_PHASES.find((p) => p.id === phaseId);
  if (!phase) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const playerRef = wheelDb.collection("players").doc(uid);
    const shipRef = wheelDb.collection("ship_repair").doc("main");

    // 1) Werkzeug serverseitig abziehen (schlägt fehl, wenn nicht genug da ist)
    await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(playerRef);
      const data = snap.exists ? snap.data() : {};
      const tools = data.shipTools || {};
      const have = tools[phase.tool] || 0;
      if (have < 1) throw new Error("missing-tool");
      tx.set(playerRef, { shipTools: { ...tools, [phase.tool]: have - 1 } }, { merge: true });
    });

    // 2) Gemeinsame Reparatur starten (schlägt fehl, wenn inzwischen
    //    schon eine andere läuft oder die Phase nicht mehr "dran" ist)
    await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(shipRef);
      const data = snap.exists ? snap.data() : { completedPhases: [], activeRepair: null };
      if (data.activeRepair) throw new Error("already-active");
      const next = getNextPhase(data.completedPhases || []);
      if (!next || next.id !== phaseId) throw new Error("wrong-phase");

      const startedAt = Date.now();
      const endsAt = startedAt + getRandomRepairDurationMs();
      tx.update(shipRef, {
        activeRepair: { phaseId, tool: phase.tool, startedAt, endsAt, startedBy: nickname },
      });
    });

    if (statusEl) statusEl.textContent = "";
    renderShipRepairPage();
  } catch (err) {
    if (err.message === "missing-tool") {
      if (statusEl) statusEl.textContent = `❌ Dafür brauchst du ${SHIP_TOOLS[phase.tool].emoji} ${SHIP_TOOLS[phase.tool].label.de}.`;
    } else if (err.message === "already-active" || err.message === "wrong-phase") {
      if (statusEl) statusEl.textContent = "⏳ Diese Reparatur läuft schon (oder ist schon fertig) - Seite aktualisiert sich gleich.";
      renderShipRepairPage();
    } else {
      console.warn("Reparatur konnte nicht gestartet werden:", err);
      if (statusEl) statusEl.textContent = "⚠️ Das hat nicht geklappt, versuch's nochmal.";
    }
  }
}

/* ------------------------------------------------------
   WERKZEUG PER CODE FREISCHALTEN
   Wird von main.js checkCode() aufgerufen (match.toolUnlock),
   exakt wie unlockAvatar() bei match.avatarUnlock.
------------------------------------------------------ */
async function unlockShipTool(toolId) {
  if (!wheelDb || typeof SHIP_TOOLS === "undefined" || !SHIP_TOOLS[toolId]) return;

  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname) return; // Meldung übernimmt bereits checkCode() selbst

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    await wheelDb
      .collection("players")
      .doc(uid)
      .set({ shipTools: { [toolId]: firebase.firestore.FieldValue.increment(1) } }, { merge: true });

    showShipToolToast(toolId);
    renderShipToolInventory();
  } catch (err) {
    console.warn("Werkzeug konnte nicht gespeichert werden:", err);
  }
}

function showShipToolToast(toolId) {
  const tool = SHIP_TOOLS[toolId];
  if (!tool) return;

  const toast = document.createElement("div");
  toast.className = "currency-toast";
  toast.innerHTML = `<span class="currency-toast-icon">${tool.emoji}</span> +1 ${tool.label.de}`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/* ------------------------------------------------------
   RÄTSEL PRÜFEN (Punkt 10-12)
------------------------------------------------------ */
function getSolvedShipPuzzles() {
  try {
    return JSON.parse(localStorage.getItem("shipPuzzlesSolved") || "[]");
  } catch (e) {
    return [];
  }
}

function checkShipPuzzleAnswer(puzzleId) {
  const puzzle = SHIP_PUZZLES.find((p) => p.id === puzzleId);
  const input = document.getElementById(`ship-puzzle-input-${puzzleId}`);
  const resultEl = document.getElementById(`ship-puzzle-result-${puzzleId}`);
  if (!puzzle || !input || !resultEl) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const given = input.value.trim().toLowerCase();
  const validAnswers = [...(puzzle.answers.de || []), ...(puzzle.answers.en || [])];

  if (!given) return;

  if (validAnswers.includes(given)) {
    const solved = getSolvedShipPuzzles();
    if (!solved.includes(puzzleId)) {
      solved.push(puzzleId);
      localStorage.setItem("shipPuzzlesSolved", JSON.stringify(solved));
    }
    resultEl.className = "ship-puzzle-result ship-puzzle-result-success";
    resultEl.innerHTML =
      (lang === "en"
        ? `✅ Correct! Your repair code:<br><strong class="ship-puzzle-code">${puzzle.rewardCode}</strong><br>Enter it on the Codes page.`
        : `✅ Richtig! Dein Reparaturcode:<br><strong class="ship-puzzle-code">${puzzle.rewardCode}</strong><br>Gib ihn auf der Codes-Seite ein.`);
    input.disabled = true;
  } else {
    resultEl.className = "ship-puzzle-result ship-puzzle-result-error";
    resultEl.textContent = lang === "en" ? "❌ Not quite - try again." : "❌ Nicht ganz - versuch's nochmal.";
  }
}

/* ------------------------------------------------------
   OWNER-TESTWERKZEUGE (Punkt 44) - nur sichtbar/nutzbar im
   Preview-Modus, siehe isShipPreviewActive() oben.
------------------------------------------------------ */
async function devGrantAllShipTools() {
  if (!isShipPreviewActive() || !wheelDb) return;
  const uid = await wheelAuthReady;
  if (!uid) return;
  await wheelDb
    .collection("players")
    .doc(uid)
    .set(
      {
        shipTools: {
          hammer: firebase.firestore.FieldValue.increment(3),
          saw: firebase.firestore.FieldValue.increment(3),
          brush: firebase.firestore.FieldValue.increment(3),
        },
      },
      { merge: true }
    );
  renderShipRepairPage();
}

async function devFinishActiveRepair() {
  if (!isShipPreviewActive() || !wheelDb) return;
  const shipRef = wheelDb.collection("ship_repair").doc("main");
  const snap = await shipRef.get();
  if (!snap.exists || !snap.data().activeRepair) return;
  await shipRef.update({ "activeRepair.endsAt": Date.now() });
  await checkAndCompleteActiveRepair();
  renderShipRepairPage();
}

async function devResetShipEvent() {
  if (!isShipPreviewActive() || !wheelDb) return;
  await wheelDb.collection("ship_repair").doc("main").set({ completedPhases: [], activeRepair: null, shipName: null, namedBy: null });
  renderShipRepairPage();
}

/* ======================================================
   RENDERING
====================================================== */
function formatShipCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function renderShipToolInventory(tools) {
  const el = document.getElementById("ship-tool-inventory");
  if (!el) return;
  const t = tools || window._shipToolsCache || { hammer: 0, saw: 0, brush: 0 };

  el.innerHTML = Object.values(SHIP_TOOLS)
    .map((tool) => `<span class="ship-tool-chip"><span class="ship-tool-chip-emoji">${tool.emoji}</span> ${tool.label.de} ×${t[tool.id] || 0}</span>`)
    .join("");
}

function renderShipPreRepairView() {
  const lockedEl = document.getElementById("streamraetsel-locked");
  const contentEl = document.getElementById("streamraetsel-content");
  if (!lockedEl) return;

  lockedEl.style.display = "flex";
  if (contentEl) contentEl.style.display = "none";

  lockedEl.classList.add("fh-ship-locked");
  lockedEl.innerHTML = `
    <div class="fh-ship-wreck-scene" aria-hidden="true">
      <div class="fh-ship-wreck-fog"></div>
      <svg viewBox="0 0 500 260" class="fh-ship-wreck-svg" preserveAspectRatio="xMidYMax meet">
        <ellipse cx="250" cy="230" rx="210" ry="16" fill="#020306" opacity=".6"/>
        <path d="M60,190 Q80,160 130,168 L370,168 Q420,160 440,190 Q400,215 250,215 Q100,215 60,190 Z" fill="#12181f" stroke="#1c2a3a" stroke-width="2"/>
        <line x1="250" y1="60" x2="235" y2="168" stroke="#1c2a3a" stroke-width="6"/>
        <line x1="200" y1="95" x2="250" y2="60" stroke="#1c2a3a" stroke-width="5"/>
        <path d="M250,60 L290,85 L245,100 Z" fill="#0d1420" opacity=".8"/>
        <circle cx="150" cy="150" r="10" fill="#020306"/>
        <circle cx="300" cy="158" r="13" fill="#020306"/>
      </svg>
    </div>
    <span class="streamraetsel-live fh-ship-badge" data-i18n="ship.badge">⚓ EVENT</span>
    <h1 class="streamraetsel-title fh-ship-title" data-i18n="ship.lockedTitle">REPARIERE DAS SCHIFF</h1>
    <p class="streamraetsel-subtitle fh-ship-lead" data-i18n="ship.lockedLead">Das Schiff wurde zerstört. Die Crew braucht dich.</p>
    <p class="streamraetsel-teaser" data-i18n="ship.lockedSub">Das Abenteuer beginnt in:</p>

    <div class="countdown streamraetsel-countdown">
      <div class="time-box time-box-xl"><span id="streamraetsel-days">00</span><small data-i18n="common.days">Tage</small></div>
      <div class="time-box time-box-xl"><span id="streamraetsel-hours">00</span><small data-i18n="common.hours">Stunden</small></div>
      <div class="time-box time-box-xl"><span id="streamraetsel-minutes">00</span><small data-i18n="common.minutes">Minuten</small></div>
      <div class="time-box time-box-xl"><span id="streamraetsel-seconds">00</span><small data-i18n="common.seconds">Sekunden</small></div>
    </div>
    ${isShipPreviewActive() ? '<p class="fh-dev-badge">🔧 PREVIEW-MODUS (nur für dich sichtbar, kein echter Schutz)</p>' : ""}
  `;

  if (typeof applyTranslations === "function") applyTranslations();
}

async function renderShipRepairPage() {
  const contentEl = document.getElementById("streamraetsel-content");
  if (!contentEl) return;

  const lockedEl = document.getElementById("streamraetsel-locked");
  if (lockedEl) lockedEl.style.display = "none";
  contentEl.style.display = "block";

  if (!wheelDb) {
    contentEl.innerHTML = `<h1 data-i18n="ship.title">⚒ REPARIERE DAS SCHIFF</h1><p class="wheel-status">⚠️ Verbindung nicht verfügbar - versuch's später nochmal.</p>`;
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  await checkAndCompleteActiveRepair();
  const state = await loadShipState();
  if (!state) return;
  const data = state.data;
  const completed = data.completedPhases || [];
  const next = getNextPhase(completed);
  const nickname = localStorage.getItem("wheelNickname") || "";

  let tools = { hammer: 0, saw: 0, brush: 0 };
  const uid = typeof wheelAuthReady !== "undefined" ? await wheelAuthReady : null;
  if (uid) {
    const pSnap = await wheelDb.collection("players").doc(uid).get();
    if (pSnap.exists) tools = { ...tools, ...(pSnap.data().shipTools || {}) };
  }
  window._shipToolsCache = tools;

  const stageClasses = SHIP_REPAIR_PHASES.map((p) => (completed.includes(p.id) ? `fh-phase-${p.id}-done` : "")).join(" ");

  let mainPanelHtml;

  if (!next) {
    // Vollständig repariert
    mainPanelHtml = `
      <div class="fh-ship-complete-banner">
        <p class="fh-ship-complete-eyebrow" data-i18n="ship.completeEyebrow">⚓ DIE FLITZPIEPEN IST WIEDER SEETÜCHTIG!</p>
        <h2 class="fh-ship-complete-name">${data.shipName || "???"}</h2>
        ${data.namedBy ? `<p class="fh-ship-complete-captain">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Captain" : "Kapitän"}: ${data.namedBy}</p>` : ""}
        <p class="fh-ship-complete-hint" data-i18n="ship.completeHint">Schau auf der Home-Seite vorbei - dein Schiff wartet dort auf dich.</p>
      </div>
    `;
  } else {
    const activeRepair = data.activeRepair;
    const isActiveHere = activeRepair && activeRepair.phaseId === next.id;
    const tool = SHIP_TOOLS[next.tool];
    const haveTool = (tools[next.tool] || 0) > 0;

    let actionHtml;
    if (activeRepair) {
      actionHtml = `
        <div class="fh-ship-phase-timer">
          <p data-i18n="ship.repairRunning">🔧 REPARATUR LÄUFT ...</p>
          <p class="fh-ship-phase-timer-value" id="ship-repair-timer">${formatShipCountdown(activeRepair.endsAt - Date.now())}</p>
          <p class="fh-ship-phase-timer-by">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Started by" : "Gestartet von"} ${activeRepair.startedBy}</p>
        </div>
      `;
    } else if (!nickname) {
      actionHtml = `<p class="wheel-status" data-i18n="ship.needLogin">Melde dich zuerst an, um mitzureparieren!</p>`;
    } else if (!haveTool) {
      actionHtml = `<p class="wheel-status">❌ ${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "You need" : "Du brauchst"} ${tool.emoji} ${tool.label.de}. ${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Solve a puzzle below to get one." : "Löse unten ein Rätsel, um eins zu bekommen."}</p>`;
    } else {
      actionHtml = `<button type="button" class="code-button" onclick="startShipRepair('${next.id}')">🔧 <span data-i18n="ship.repairButton">Reparieren</span></button>`;
    }

    mainPanelHtml = `
      <div class="fh-ship-phase-card">
        <p class="fh-ship-phase-progress">${completed.length} / ${SHIP_REPAIR_PHASES.length}</p>
        <h2 class="fh-ship-phase-label">${next.label.de}</h2>
        <p class="fh-ship-phase-desc">${next.description.de}</p>
        <p class="fh-ship-phase-tool-req">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Requires" : "Benötigt"}: ${tool.emoji} ${tool.label.de}</p>
        <div id="ship-repair-status" class="wheel-status"></div>
        ${actionHtml}
      </div>
    `;
  }

  contentEl.innerHTML = `
    <h1 data-i18n="ship.title">⚒ REPARIERE DAS SCHIFF</h1>
    <p class="story-subtitle" data-i18n="ship.subtitle">Gemeinsam bringt die Crew die Flitzpiepen zurück aufs Wasser.</p>
    ${isShipPreviewActive() ? renderShipDevPanel() : ""}

    <div class="fh-ship-repair-stage ${stageClasses}" id="fh-ship-repair-stage">
      ${buildShipRepairSvg()}
    </div>

    ${mainPanelHtml}

    <h2 class="fh-ship-section-heading" data-i18n="ship.toolsHeading">Deine Werkzeuge</h2>
    <div id="ship-tool-inventory" class="ship-tool-inventory"></div>

    <h2 class="fh-ship-section-heading" data-i18n="ship.puzzlesHeading">⚓ Rätsel des Kapitäns</h2>
    <div class="ship-puzzle-list">${buildShipPuzzlesHtml()}</div>
  `;

  renderShipToolInventory(tools);
  if (typeof applyTranslations === "function") applyTranslations();

  if (data.activeRepair) startShipRepairTicker(data.activeRepair.phaseId);
}

function renderShipDevPanel() {
  return `
    <div class="fh-dev-panel">
      <p class="fh-dev-badge">🔧 PREVIEW-MODUS - nur für dich sichtbar, kein echter Zugriffsschutz</p>
      <div class="fh-dev-panel-actions">
        <button type="button" class="code-button" onclick="devGrantAllShipTools()">+3 von jedem Werkzeug</button>
        <button type="button" class="code-button" onclick="devFinishActiveRepair()">Aktive Reparatur sofort fertigstellen</button>
        <button type="button" class="code-button" onclick="devResetShipEvent()">Event zurücksetzen</button>
      </div>
    </div>
  `;
}

function buildShipPuzzlesHtml() {
  const solved = getSolvedShipPuzzles();
  return SHIP_PUZZLES.map((p) => {
    const isSolved = solved.includes(p.id);
    return `
      <div class="ship-puzzle-card ${isSolved ? "ship-puzzle-card-solved" : ""}">
        <p class="ship-puzzle-question">${p.question.de}</p>
        ${
          isSolved
            ? `<p class="ship-puzzle-result ship-puzzle-result-success">✅ Gelöst - dein Code: <strong class="ship-puzzle-code">${p.rewardCode}</strong></p>`
            : `
              <div class="ship-puzzle-input-row">
                <input type="text" id="ship-puzzle-input-${p.id}" class="code-input ship-puzzle-input" autocomplete="off" placeholder="Antwort eingeben ..." onkeydown="if(event.key==='Enter') checkShipPuzzleAnswer('${p.id}')">
                <button type="button" class="code-button" onclick="checkShipPuzzleAnswer('${p.id}')">Prüfen</button>
              </div>
              <p id="ship-puzzle-result-${p.id}" class="ship-puzzle-result"></p>
            `
        }
      </div>
    `;
  }).join("");
}

/* ------------------------------------------------------
   SCHIFF-SVG MIT REPARATUR-LAYERN
   Je Bauteil ein "broken"- und ein "fixed"-Layer, ein-/
   ausgeblendet über CSS-Klassen auf dem Container
   (.fh-phase-<id>-done), siehe style.css. Rein additiv, wird
   nirgends sonst verwendet.
------------------------------------------------------ */
function buildShipRepairSvg() {
  return `
    <div class="fh-ship-repair-smoke" aria-hidden="true"></div>
    <svg viewBox="0 0 500 320" class="fh-ship-repair-svg" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="shiprepair-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3a4a5e"/>
          <stop offset="100%" stop-color="#141c26"/>
        </linearGradient>
        <linearGradient id="shiprepair-sail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f1e8d2"/>
          <stop offset="100%" stop-color="#c9bd9c"/>
        </linearGradient>
      </defs>

      <ellipse cx="250" cy="270" rx="220" ry="18" fill="#4da3ff" opacity=".12"/>

      <!-- RUMPF: kaputt -->
      <g class="fh-ship-part fh-ship-part-hull-broken">
        <path d="M70,215 Q90,180 140,188 L200,182 Q210,205 195,215 L230,190 Q245,215 225,225 L360,188 Q410,180 430,215 Q390,240 250,240 Q110,240 70,215 Z" fill="url(#shiprepair-hull)" stroke="#0a3049" stroke-width="2"/>
        <ellipse cx="150" cy="205" rx="16" ry="10" fill="#020306"/>
        <ellipse cx="290" cy="210" rx="20" ry="12" fill="#020306"/>
      </g>
      <!-- RUMPF: repariert -->
      <g class="fh-ship-part fh-ship-part-hull-fixed">
        <path d="M70,210 Q90,178 140,186 L360,186 Q410,178 430,210 Q390,236 250,236 Q110,236 70,210 Z" fill="url(#shiprepair-hull)" stroke="#4da3ff" stroke-opacity=".4" stroke-width="2"/>
        <line x1="110" y1="200" x2="390" y2="200" stroke="#0a3049" stroke-width="1" opacity=".5"/>
        <line x1="110" y1="215" x2="390" y2="215" stroke="#0a3049" stroke-width="1" opacity=".5"/>
      </g>

      <!-- MAST: kaputt (Stumpf + abgebrochenes Stück quer am Deck) -->
      <g class="fh-ship-part fh-ship-part-mast-broken">
        <line x1="250" y1="186" x2="250" y2="150" stroke="#4a3826" stroke-width="7"/>
        <line x1="150" y1="192" x2="260" y2="165" stroke="#4a3826" stroke-width="6" stroke-linecap="round"/>
      </g>
      <!-- MAST: repariert -->
      <g class="fh-ship-part fh-ship-part-mast-fixed">
        <line x1="250" y1="186" x2="250" y2="35" stroke="#5a4a34" stroke-width="7"/>
        <line x1="180" y1="60" x2="320" y2="60" stroke="#5a4a34" stroke-width="4"/>
      </g>

      <!-- SEGEL: kaputt (Fetzen) -->
      <g class="fh-ship-part fh-ship-part-sails-broken">
        <path d="M250,60 L275,90 L255,85 L268,105 L250,98 Z" fill="url(#shiprepair-sail)" opacity=".65"/>
        <path d="M180,65 L200,80 L185,80 L195,95 Z" fill="url(#shiprepair-sail)" opacity=".5"/>
      </g>
      <!-- SEGEL: repariert (voll gesetzt) -->
      <g class="fh-ship-part fh-ship-part-sails-fixed">
        <path d="M250,42 C300,50 310,110 300,150 C280,135 260,128 250,128 Z" fill="url(#shiprepair-sail)"/>
        <path d="M250,42 C200,50 190,110 200,150 C220,135 240,128 250,128 Z" fill="url(#shiprepair-sail)" opacity=".92"/>
        <path d="M180,65 C210,70 216,105 210,130 C196,120 186,116 180,116 Z" fill="url(#shiprepair-sail)" opacity=".85"/>
      </g>

      <!-- RUDER: kaputt -->
      <g class="fh-ship-part fh-ship-part-rudder-broken">
        <line x1="430" y1="205" x2="452" y2="228" stroke="#4a3826" stroke-width="5" stroke-linecap="round" transform="rotate(20 430 205)"/>
      </g>
      <!-- RUDER: repariert -->
      <g class="fh-ship-part fh-ship-part-rudder-fixed">
        <path d="M428,205 L452,205 L446,232 L434,232 Z" fill="#4a3826"/>
      </g>

      <!-- FLAGGE: erst nach der letzten Reparatur -->
      <g class="fh-ship-part fh-ship-part-final-fixed">
        <path d="M250,35 L250,18 L278,25 L250,35 Z" fill="#f0c96a"/>
      </g>
    </svg>
  `;
}

/* ------------------------------------------------------
   REPARATUR-ABSCHLUSS-EFFEKT (Punkt 20)
   Lichtblitz + Funken/Splitter-Partikel: nutzt bewusst denselben
   Effekt wie beim Code-Einlösen (triggerCodeSuccessEffect() aus
   wheel.js, Element #code-fx aus index.html) statt etwas Neues zu
   bauen - fühlt sich dadurch wie Teil derselben Welt an. Der
   Erfolgstext kommt aus SHIP_REPAIR_PHASES[*].doneLabel.
------------------------------------------------------ */
function playShipRepairCompleteEffect(phase) {
  if (!phase) return;
  if (typeof triggerCodeSuccessEffect === "function") triggerCodeSuccessEffect();

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const label = (phase.doneLabel && phase.doneLabel[lang]) || phase.doneLabel.de;

  const toast = document.createElement("div");
  toast.className = "currency-toast ship-repair-done-toast";
  toast.innerHTML = `<span class="currency-toast-icon">⚒</span> ${label}`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 400);
  }, 4200);
}

let shipRepairTickerPhaseId = null;

function startShipRepairTicker(activePhaseId) {
  stopShipRepairTicker();
  if (activePhaseId) shipRepairTickerPhaseId = activePhaseId;

  window._shipTimerTick = setInterval(async () => {
    const el = document.getElementById("ship-repair-timer");
    if (!el) {
      stopShipRepairTicker();
      return;
    }

    await checkAndCompleteActiveRepair();
    const state = await loadShipState();
    if (!state) return;

    if (!state.data.activeRepair) {
      const finishedPhase = SHIP_REPAIR_PHASES.find((p) => p.id === shipRepairTickerPhaseId);
      stopShipRepairTicker();
      playShipRepairCompleteEffect(finishedPhase);
      renderShipRepairPage();
      return;
    }

    el.textContent = formatShipCountdown(state.data.activeRepair.endsAt - Date.now());
  }, 1000);
}

function stopShipRepairTicker() {
  clearInterval(window._shipTimerTick);
  window._shipTimerTick = null;
  shipRepairTickerPhaseId = null;
}

/* ------------------------------------------------------
   HOME-REVEAL: repariertes Schiff auf der Homepage
   Prüft einmalig beim Laden (unabhängig von changePage, siehe
   Kommentar oben), ob das Schiff bereits fertig ist, und
   blendet dann den Reveal-Block in der Cinematic-Sequenz ein
   (siehe .fh-copy-destination in index.html). Bleibt danach
   dauerhaft sichtbar (Punkt 27).
------------------------------------------------------ */
async function checkShipStatusForHomeReveal() {
  if (!wheelDb) return;
  try {
    const snap = await wheelDb.collection("ship_repair").doc("main").get();
    if (!snap.exists) return;
    const data = snap.data();
    if (!data.shipName) return;

    const reveal = document.getElementById("fh-ship-return");
    const nameEl = document.getElementById("fh-ship-return-name");
    const captainEl = document.getElementById("fh-ship-return-captain");
    if (!reveal) return;

    if (nameEl) nameEl.textContent = data.shipName;
    if (captainEl && data.namedBy) captainEl.textContent = data.namedBy;
    reveal.classList.add("fh-ship-return-visible");
    document.getElementById("fh-ship-rig")?.classList.add("fh-ship-repaired");
  } catch (err) {
    console.warn("Schiffsstatus für Home konnte nicht geladen werden:", err);
  }
}

/* ------------------------------------------------------
   HOME-ZUSAMMENFASSUNG: "REPARATUR DES SCHIFFES"
   ---------------------------------------------------
   Sitzt direkt unter dem bestehenden Haupt-Countdown auf der
   Startseite (siehe #fh-home-ship-repair in index.html). Zeigt
   den ECHTEN, gemeinsamen Fortschritt aus ship_repair/main -
   KEIN zweites, unabhängiges Reparatursystem, nur eine kompakte
   Zusammenfassung mit Link zur vollständigen Schiff-Seite.

   Eigene Timer-Variablen (homeShip*), bewusst getrennt von den
   Timern der vollständigen Schiff-Seite (shipCountdownInterval /
   window._shipTimerTick) und vom bestehenden Haupt-Countdown
   (countdown.js) - keine gemeinsame Variable, keine Konflikte.
------------------------------------------------------ */
let homeShipCountdownInterval = null;
let homeShipTickerInterval = null;

function stopHomeShipRepairTimers() {
  clearInterval(homeShipCountdownInterval);
  clearInterval(homeShipTickerInterval);
  homeShipCountdownInterval = null;
  homeShipTickerInterval = null;
}

function tickHomeShipCountdown() {
  const bodyEl = document.getElementById("fh-home-ship-repair-body");
  if (!bodyEl) {
    stopHomeShipRepairTimers();
    return;
  }

  if (isShipEventUnlocked()) {
    renderHomeShipRepairSummary();
    return;
  }

  const diff = getShipEventUnlockDate() - new Date();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysEl = document.getElementById("home-ship-days");
  const hoursEl = document.getElementById("home-ship-hours");
  const minutesEl = document.getElementById("home-ship-minutes");
  const secondsEl = document.getElementById("home-ship-seconds");
  if (daysEl) daysEl.textContent = padShipCountdown(days);
  if (hoursEl) hoursEl.textContent = padShipCountdown(hours);
  if (minutesEl) minutesEl.textContent = padShipCountdown(minutes);
  if (secondsEl) secondsEl.textContent = padShipCountdown(seconds);
}

function buildHomeShipChecklistHtml(completedPhases) {
  return SHIP_REPAIR_PHASES.map((phase) => {
    const done = completedPhases.includes(phase.id);
    return `
      <li class="fh-home-ship-checklist-item ${done ? "fh-home-ship-checklist-done" : ""}">
        <span class="fh-home-ship-checklist-mark">${done ? "✓" : "○"}</span>
        <span>${phase.label.de}</span>
      </li>
    `;
  }).join("");
}

async function renderHomeShipRepairSummary() {
  const bodyEl = document.getElementById("fh-home-ship-repair-body");
  if (!bodyEl) return;

  stopHomeShipRepairTimers();

  if (!isShipEventUnlocked()) {
    bodyEl.innerHTML = `
      <div class="fh-home-ship-countdown-label" data-i18n="homeShip.countdownLabel">SCHIFFSREPARATUR</div>
      <div class="countdown fh-home-ship-countdown">
        <div class="time-box"><span id="home-ship-days">00</span><small data-i18n="common.days">Tage</small></div>
        <div class="time-box"><span id="home-ship-hours">00</span><small data-i18n="common.hours">Stunden</small></div>
        <div class="time-box"><span id="home-ship-minutes">00</span><small data-i18n="common.minutes">Minuten</small></div>
        <div class="time-box"><span id="home-ship-seconds">00</span><small data-i18n="common.seconds">Sekunden</small></div>
      </div>
    `;
    if (typeof applyTranslations === "function") applyTranslations();
    tickHomeShipCountdown();
    homeShipCountdownInterval = setInterval(tickHomeShipCountdown, 1000);
    return;
  }

  if (!wheelDb) {
    bodyEl.innerHTML = `<p class="wheel-status">⚠️ <span data-i18n="homeShip.unavailable">Verbindung nicht verfügbar - versuch's später nochmal.</span></p>`;
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  await checkAndCompleteActiveRepair();
  const state = await loadShipState();
  if (!state) return;

  const completed = state.data.completedPhases || [];
  const percent = Math.round((completed.length / SHIP_REPAIR_PHASES.length) * 100);

  if (completed.length >= SHIP_REPAIR_PHASES.length) {
    bodyEl.innerHTML = `
      <p class="fh-home-ship-complete" data-i18n="homeShip.complete">⚓ REPARATUR ABGESCHLOSSEN</p>
      ${state.data.shipName ? `<p class="fh-home-ship-complete-name">${state.data.shipName}</p>` : ""}
    `;
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  bodyEl.innerHTML = `
    <p class="fh-home-ship-progress-label" data-i18n="homeShip.progressLabel">Reparaturfortschritt</p>
    <div class="fh-home-ship-progress-bar">
      <div class="fh-home-ship-progress-fill" style="width:${percent}%"></div>
    </div>
    <p class="fh-home-ship-progress-percent">${percent}%</p>
    <ul class="fh-home-ship-checklist">${buildHomeShipChecklistHtml(completed)}</ul>
  `;
  if (typeof applyTranslations === "function") applyTranslations();

  if (state.data.activeRepair) {
    homeShipTickerInterval = setInterval(async () => {
      const bodyStillHere = document.getElementById("fh-home-ship-repair-body");
      if (!bodyStillHere) {
        stopHomeShipRepairTimers();
        return;
      }
      await checkAndCompleteActiveRepair();
      const fresh = await loadShipState();
      if (!fresh) return;
      const freshCompleted = fresh.data.completedPhases || [];
      if (freshCompleted.length !== completed.length) {
        renderHomeShipRepairSummary();
      }
    }, 5000);
  }
}

/* ------------------------------------------------------
   COUNTDOWN-ANZEIGE (gesperrte Ansicht)
   Selbes Prinzip wie das alte updateStreamRaetselView(): jede
   Sekunde neu aus dem echten Zeitstempel berechnet (kein
   Session-Zähler), schaltet automatisch auf die freigeschaltete
   Ansicht um, sobald die Zeit erreicht ist - auch ohne Reload.
------------------------------------------------------ */
let shipCountdownInterval = null;

function padShipCountdown(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function tickShipCountdown() {
  if (isShipEventUnlocked()) {
    stopShipCountdown();
    renderShipRepairPage();
    return;
  }

  const diff = getShipEventUnlockDate() - new Date();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysEl = document.getElementById("streamraetsel-days");
  const hoursEl = document.getElementById("streamraetsel-hours");
  const minutesEl = document.getElementById("streamraetsel-minutes");
  const secondsEl = document.getElementById("streamraetsel-seconds");
  if (daysEl) daysEl.textContent = padShipCountdown(days);
  if (hoursEl) hoursEl.textContent = padShipCountdown(hours);
  if (minutesEl) minutesEl.textContent = padShipCountdown(minutes);
  if (secondsEl) secondsEl.textContent = padShipCountdown(seconds);
}

function startShipCountdown() {
  stopShipCountdown();
  tickShipCountdown();
  shipCountdownInterval = setInterval(tickShipCountdown, 1000);
}

function stopShipCountdown() {
  clearInterval(shipCountdownInterval);
  shipCountdownInterval = null;
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
   Ersetzt/ergänzt updateStreamRaetselPage() NICHT - läuft
   eigenständig daneben und reagiert nur auf denselben
   pageID-Wert, den main.js sowieso schon bei jedem
   Seitenwechsel an alle *Page()-Hooks weiterreicht.
------------------------------------------------------ */
function updateShipRepairPage(pageID) {
  if (pageID === "home") {
    // Erneut prüfen (nicht nur einmalig beim ersten Laden) - falls das
    // Schiff erst in DIESER Sitzung fertig repariert wurde, während man
    // schon auf der Home-Seite war/dorthin zurückkehrt (Punkt 26: Reveal
    // bleibt danach dauerhaft sichtbar, nicht nur beim allerersten Laden).
    checkShipStatusForHomeReveal();
    renderHomeShipRepairSummary();
  } else {
    stopHomeShipRepairTimers();
  }

  if (pageID !== "streamraetsel") {
    stopShipRepairTicker();
    stopShipCountdown();
    return;
  }

  if (isShipEventUnlocked()) {
    stopShipCountdown();
    renderShipRepairPage();
  } else {
    renderShipPreRepairView();
    startShipCountdown();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initShipPreviewGate();
  checkShipStatusForHomeReveal();
  renderHomeShipRepairSummary();
});
