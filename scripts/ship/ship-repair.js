/* ======================================================
   "REPARIERE DAS SCHIFF" - EVENT-LOGIK
   ---------------------------------------------------
   Eigene, direkt aus dem Hauptmenü erreichbare Seite (#ship-repair,
   siehe index.html) - UNABHÄNGIG von der "???"-Seite
   (#streamraetsel, scripts/streamraetsel/streamraetsel.js). Die
   Reparatur ist NICHT an ein Freischalt-Datum gekoppelt: einzige
   "Countdown"-Instanz ist die Dauer einer bereits gestarteten
   Reparaturphase (activeRepair.endsAt) - siehe startShipRepairTicker().

   ARCHITEKTUR (persönliche Reparatur, siehe Auftrag):
   - Das SCHIFF ist PERSÖNLICH pro Spieler: eine eigene Firestore-
     Instanz je Nutzer (Sammlung "ship_repair", Dokument-ID = die
     eigene Auth-UID, genau wie bei "players/{uid}"). Repariert
     Spieler A sein Schiff, hat das NULL Einfluss auf den
     Reparaturstatus von Spieler B - jeder sieht und ändert
     ausschließlich sein eigenes Dokument (siehe firestore.rules:
     isOwner(playerId) auf ship_repair/{playerId}).
   - WERKZEUGE sind ebenfalls persönliches Inventar pro Spieler
     (players/{uid}.shipTools), genau wie Dublonen/ownedShopItems.
   - Ohne Login/Firebase (wheelDb nicht verfügbar oder keine UID)
     läuft die Seite im reinen Lesemodus mit klarer Meldung, statt
     einen zweiten, nur-lokalen Fortschritt vorzutäuschen.
====================================================== */

/* ------------------------------------------------------
   OWNER-/PREVIEW-GATE (Punkt 5 des Auftrags)
   ---------------------------------------------------
   WICHTIG - das ist AUSDRÜCKLICH KEIN echter Zugriffsschutz:
   Es ist eine reine Frontend-Komfortfunktion, die im Reparatur-
   Dev-Panel (renderShipDevPanel()) ein paar Testwerkzeuge
   einblendet. Jeder, der den Quelltext liest (oder einfach diesen
   Kommentar), kann den Query-Parameter unten selbst setzen. Es
   gibt in einer rein statischen GitHub-Pages-Seite ohne eigenes
   Backend keine Möglichkeit, ein "echtes" Passwort sicher zu
   prüfen. Aktivierung: index.html?fhpreview=1 einmal aufrufen
   (merkt sich das per localStorage) - ?fhpreview=0 schaltet es
   wieder aus.
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
   ZUFÄLLIGE REPARATURDAUER (Punkt 17)
------------------------------------------------------ */
function getRandomRepairDurationMs() {
  const min = SHIP_REPAIR_DURATION_MIN_MS;
  const max = SHIP_REPAIR_DURATION_MAX_MS;
  return Math.floor(min + Math.random() * (max - min));
}

/* ------------------------------------------------------
   PERSÖNLICHER SCHIFFS-ZUSTAND (Firestore, EIN Dokument PRO
   SPIELER - ship_repair/{uid}, siehe players/{uid} für dasselbe
   Muster). Jeder Spieler repariert sein eigenes Schiff; die
   Reparatur eines anderen Spielers hat darauf keinerlei
   Einfluss (Punkt 3 des Auftrags).
------------------------------------------------------ */
async function loadShipState(uid) {
  if (!wheelDb || !uid) return null;

  const docRef = wheelDb.collection("ship_repair").doc(uid);
  const snap = await docRef.get();

  if (snap.exists) return { ref: docRef, data: snap.data() };

  const initialData = { completedPhases: [], activeRepair: null, shipName: null, namedBy: null };
  try {
    await docRef.set(initialData);
  } catch (err) {
    // ein anderer Tab desselben Spielers war evtl. eine Millisekunde schneller
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
async function checkAndCompleteActiveRepair(uid) {
  if (!wheelDb || !uid) return;

  const docRef = wheelDb.collection("ship_repair").doc(uid);

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
   TÄGLICHE QUESTS (20 Tage, je ein Werkzeug)
   ---------------------------------------------------
   Sicherheitskritischer Kern: welcher Tag freigeschaltet ist, wird
   ANSCHLIESSEND SERVERSEITIG per firestore.rules (dailyQuestDayIsUnlocked())
   anhand von request.time minus dem einmalig per serverTimestamp()
   gesetzten dailyQuests.startedAt geprüft - die hier im Client
   berechnete "unlockedDay" dient NUR der Anzeige (z. B. "🔒 Tag 5"),
   niemals als alleinige Zugriffsprüfung. Ein Spieler kann also seine
   lokale Uhr beliebig verstellen, ohne dadurch echte Tage freizuschalten.
------------------------------------------------------ */
const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureDailyQuestsStarted(uid, data) {
  if (data.dailyQuests && data.dailyQuests.startedAt) return data.dailyQuests;

  const playerRef = wheelDb.collection("players").doc(uid);
  try {
    await playerRef.set(
      { dailyQuests: { startedAt: firebase.firestore.FieldValue.serverTimestamp(), claimedDays: [] } },
      { merge: true }
    );
  } catch (err) {
    console.warn("Tagesquest konnte nicht gestartet werden:", err);
    return data.dailyQuests || null;
  }
  const snap = await playerRef.get();
  return snap.exists && snap.data().dailyQuests ? snap.data().dailyQuests : null;
}

function getUnlockedDailyQuestDay(dailyQuests) {
  if (!dailyQuests || !dailyQuests.startedAt || typeof dailyQuests.startedAt.toMillis !== "function") return 1;
  const elapsedMs = Date.now() - dailyQuests.startedAt.toMillis();
  return Math.min(DAILY_QUESTS.length, Math.floor(elapsedMs / DAY_MS) + 1);
}

function buildDailyQuestDescription(quest, lang) {
  const template = DAILY_QUEST_METRIC_TEXT[quest.metric];
  if (!template) return "";
  return (lang === "en" ? template.en : template.de)(quest.threshold);
}

/* ------------------------------------------------------
   TAGESQUEST EINLÖSEN
   Prüft serverseitig (Firestore-Transaktion + Security Rules), dass
   der Tag wirklich der Reihe nach dran ist, laut Server-Uhrzeit
   bereits freigeschaltet ist, die Anforderung wirklich erreicht wurde
   UND dass diese Quest noch nicht eingelöst wurde - ein erneutes
   Klicken oder ein Reload kann das Werkzeug daher nie doppelt
   vergeben (siehe validDailyQuestsWrite() in firestore.rules).
------------------------------------------------------ */
async function claimDailyQuest(day) {
  const statusEl = document.getElementById("ship-quest-status");
  const uid = await wheelAuthReady;
  if (!uid) return;

  const quest = DAILY_QUESTS.find((q) => q.day === day);
  if (!quest) return;

  const playerRef = wheelDb.collection("players").doc(uid);
  try {
    await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(playerRef);
      const data = snap.exists ? snap.data() : {};
      const dq = data.dailyQuests || {};
      const claimed = dq.claimedDays || [];

      if (claimed.includes(day)) throw new Error("already-claimed");
      if (claimed.length + 1 !== day) throw new Error("wrong-order");
      if (!dq.startedAt) throw new Error("not-started");
      if (day > getUnlockedDailyQuestDay(dq)) throw new Error("locked");
      if ((data[quest.metric] || 0) < quest.threshold) throw new Error("not-met");

      tx.set(
        playerRef,
        {
          dailyQuests: { startedAt: dq.startedAt, claimedDays: firebase.firestore.FieldValue.arrayUnion(day) },
          shipTools: { [quest.toolId]: firebase.firestore.FieldValue.increment(1) },
        },
        { merge: true }
      );
    });

    showShipToolToast(quest.toolId);
    renderShipRepairPage();
  } catch (err) {
    if (!statusEl) return;
    const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
    const isEn = lang === "en";
    if (err.message === "already-claimed") {
      statusEl.textContent = isEn ? "✅ You already completed this quest." : "✅ Diese Quest hast du bereits abgeschlossen.";
    } else if (err.message === "locked" || err.message === "wrong-order" || err.message === "not-started") {
      statusEl.textContent = isEn ? "🔒 This quest isn't unlocked yet." : "🔒 Diese Quest ist noch nicht freigeschaltet.";
      renderShipRepairPage();
    } else if (err.message === "not-met") {
      statusEl.textContent = isEn ? "⏳ Not quite there yet - keep playing!" : "⏳ Noch nicht geschafft - weiterspielen!";
    } else {
      console.warn("Quest konnte nicht abgeschlossen werden:", err);
      statusEl.textContent = isEn ? "⚠️ That didn't work, try again." : "⚠️ Das hat nicht geklappt, versuch's nochmal.";
    }
  }
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
    const shipRef = wheelDb.collection("ship_repair").doc(uid);

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
  const playerRef = wheelDb.collection("players").doc(uid);
  const increments = {};
  Object.keys(SHIP_TOOLS).forEach((id) => (increments[id] = firebase.firestore.FieldValue.increment(1)));
  // 3 einzelne Schreibvorgänge statt einem einzigen "+3" - die Security
  // Rules erlauben pro Werkzeug bewusst nur max. +1 pro Schreibvorgang
  // (siehe validToolDelta() in firestore.rules), damit auch dieses reine
  // Test-Werkzeug denselben echten Regeln unterliegt.
  for (let i = 0; i < 3; i++) {
    await playerRef.set({ shipTools: increments }, { merge: true });
  }
  renderShipRepairPage();
}

async function devFinishActiveRepair() {
  if (!isShipPreviewActive() || !wheelDb) return;
  const uid = await wheelAuthReady;
  if (!uid) return;
  const shipRef = wheelDb.collection("ship_repair").doc(uid);
  const snap = await shipRef.get();
  if (!snap.exists || !snap.data().activeRepair) return;
  await shipRef.update({ "activeRepair.endsAt": Date.now() });
  await checkAndCompleteActiveRepair(uid);
  renderShipRepairPage();
}

async function devResetShipEvent() {
  if (!isShipPreviewActive() || !wheelDb) return;
  const uid = await wheelAuthReady;
  if (!uid) return;
  await wheelDb.collection("ship_repair").doc(uid).set({ completedPhases: [], activeRepair: null, shipName: null, namedBy: null });
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

function emptyShipToolsInventory() {
  const empty = {};
  Object.keys(SHIP_TOOLS).forEach((id) => (empty[id] = 0));
  return empty;
}

function renderShipToolInventory(tools) {
  const el = document.getElementById("ship-tool-inventory");
  if (!el) return;
  const t = tools || window._shipToolsCache || emptyShipToolsInventory();

  el.innerHTML = Object.values(SHIP_TOOLS)
    .map((tool) => `<span class="ship-tool-chip ${(t[tool.id] || 0) > 0 ? "ship-tool-chip-owned" : ""}"><span class="ship-tool-chip-emoji">${tool.emoji}</span> ${tool.label.de} ×${t[tool.id] || 0}</span>`)
    .join("");
}

async function renderShipRepairPage() {
  const contentEl = document.getElementById("ship-repair-page-body");
  if (!contentEl) return;

  if (!wheelDb) {
    contentEl.innerHTML = `<h1 data-i18n="ship.title">⚓ SCHIFF REPARIEREN</h1><p class="wheel-status">⚠️ Verbindung nicht verfügbar - versuch's später nochmal.</p>`;
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  const nickname = localStorage.getItem("wheelNickname") || "";
  const uid = typeof wheelAuthReady !== "undefined" ? await wheelAuthReady : null;

  if (!uid) {
    contentEl.innerHTML = `<h1 data-i18n="ship.title">⚓ SCHIFF REPARIEREN</h1><p class="wheel-status" data-i18n="ship.needLogin">Melde dich zuerst an, um mitzureparieren!</p>`;
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  await checkAndCompleteActiveRepair(uid);
  const state = await loadShipState(uid);
  if (!state) return;
  const data = state.data;
  const completed = data.completedPhases || [];

  // Kapitel-Freischaltung pruefen (siehe maybeUnlockChapterAfterShipRepair()
  // weiter unten) - nutzt die hier ohnehin schon geladenen Daten mit,
  // statt eine eigene, zusaetzliche Abfrage zu machen.
  if (data.shipName) maybeUnlockChapterAfterShipRepair();
  const next = getNextPhase(completed);

  let tools = emptyShipToolsInventory();
  const pSnap = await wheelDb.collection("players").doc(uid).get();
  const playerData = pSnap.exists ? pSnap.data() : {};
  tools = { ...tools, ...(playerData.shipTools || {}) };
  window._shipToolsCache = tools;

  const dailyQuests = await ensureDailyQuestsStarted(uid, playerData);

  const stageClasses = SHIP_REPAIR_PHASES.map((p) => (completed.includes(p.id) ? `fh-phase-${p.id}-done` : "")).join(" ");

  let mainPanelHtml;

  if (!next) {
    // Vollständig repariert
    mainPanelHtml = `
      <div class="fh-ship-complete-banner">
        <p class="fh-ship-complete-eyebrow" data-i18n="ship.completeEyebrow">⚓ DIE FLITZPIEPEN IST WIEDER SEETÜCHTIG!</p>
        <h2 class="fh-ship-complete-name">${data.shipName || "???"}</h2>
        ${data.namedBy ? `<p class="fh-ship-complete-captain">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Captain" : "Kapitän"}: ${data.namedBy}</p>` : ""}
        <p class="fh-ship-complete-hint" data-i18n="ship.completeHint">Deine Flitzpiepen ist wieder seetüchtig und bereit für die nächste Reise.</p>
      </div>
    `;
  } else {
    const activeRepair = data.activeRepair;
    const isActiveHere = activeRepair && activeRepair.phaseId === next.id;
    const tool = SHIP_TOOLS[next.tool];
    const haveTool = (tools[next.tool] || 0) > 0;

    let actionHtml;
    if (activeRepair) {
      const totalMs = Math.max(1, activeRepair.endsAt - activeRepair.startedAt);
      const elapsedMs = Math.min(totalMs, Date.now() - activeRepair.startedAt);
      const pct = Math.round((elapsedMs / totalMs) * 100);
      actionHtml = `
        <div class="fh-ship-phase-timer">
          <p data-i18n="ship.repairRunning">🔧 REPARATUR LÄUFT ...</p>
          <div class="fh-ship-phase-progress-bar"><div class="fh-ship-phase-progress-fill" id="ship-repair-progress-fill" style="width:${pct}%"></div></div>
          <p class="fh-ship-phase-timer-value" id="ship-repair-timer">${formatShipCountdown(activeRepair.endsAt - Date.now())}</p>
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
        <p class="fh-ship-phase-progress">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? `Stage ${next.stageNumber} of ${SHIP_REPAIR_PHASES.length}` : `Etappe ${next.stageNumber} von ${SHIP_REPAIR_PHASES.length}`}</p>
        <h2 class="fh-ship-phase-label">${next.label.de}</h2>
        <p class="fh-ship-phase-desc">${next.description.de}</p>
        <p class="fh-ship-phase-tool-req">${(typeof getCurrentLang === "function" && getCurrentLang() === "en") ? "Requires" : "Benötigt"}: ${tool.emoji} ${tool.label.de}</p>
        <div id="ship-repair-status" class="wheel-status"></div>
        ${actionHtml}
      </div>
    `;
  }

  contentEl.innerHTML = `
    <h1 data-i18n="ship.title">⚓ SCHIFF REPARIEREN</h1>
    <p class="story-subtitle" data-i18n="ship.subtitle">Gemeinsam bringt die Crew die Flitzpiepen zurück aufs Wasser.</p>
    ${isShipPreviewActive() ? renderShipDevPanel() : ""}

    <div class="fh-ship-repair-stage ${stageClasses}" id="fh-ship-repair-stage">
      ${buildShipRepairSvg()}
    </div>

    ${buildOverallProgressHtml(completed.length)}

    ${mainPanelHtml}

    ${buildDailyQuestCardHtml(dailyQuests, playerData)}

    <h2 class="fh-ship-section-heading" data-i18n="ship.toolsHeading">Deine Werkzeuge</h2>
    <div id="ship-tool-inventory" class="ship-tool-inventory"></div>

    <h2 class="fh-ship-section-heading" data-i18n="ship.stagesHeading">Reparatur-Etappen</h2>
    <div class="fh-ship-stage-list">${buildStageChecklistHtml(completed, next)}</div>

    <h2 class="fh-ship-section-heading" data-i18n="ship.puzzlesHeading">⚓ Rätsel des Kapitäns</h2>
    <div class="ship-puzzle-list">${buildShipPuzzlesHtml()}</div>
  `;

  renderShipToolInventory(tools);
  if (typeof applyTranslations === "function") applyTranslations();

  if (data.activeRepair) startShipRepairTicker(uid, data.activeRepair.phaseId);
}

/* ------------------------------------------------------
   GESAMT-FORTSCHRITTSBALKEN (Punkt 15: "8 / 20")
------------------------------------------------------ */
function buildOverallProgressHtml(completedCount) {
  const total = SHIP_REPAIR_PHASES.length;
  const pct = Math.round((completedCount / total) * 100);
  const isEn = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  return `
    <div class="fh-ship-overall-progress">
      <p class="fh-ship-overall-progress-label">${isEn ? "Progress" : "Fortschritt"}</p>
      <div class="fh-ship-overall-progress-bar"><div class="fh-ship-overall-progress-fill" style="width:${pct}%"></div></div>
      <p class="fh-ship-overall-progress-count">${completedCount} / ${total}</p>
    </div>
  `;
}

/* ------------------------------------------------------
   ETAPPEN-CHECKLISTE (Punkt 15)
   Fertige Etappen eindeutig markiert, die aktuelle hervorgehoben,
   alle danach sichtbar als "gesperrt" - Namen bleiben lesbar (reiner
   Fortschrittsstatus, keine Spoiler-Mechanik nötig), nur der
   Zugriff/Status unterscheidet sich optisch.
------------------------------------------------------ */
function buildStageChecklistHtml(completed, next) {
  const isEn = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  return SHIP_REPAIR_PHASES.map((phase) => {
    const isDone = completed.includes(phase.id);
    const isActive = next && next.id === phase.id;
    const label = phase.label[isEn ? "en" : "de"] || phase.label.de;
    const status = isDone ? "done" : isActive ? "active" : "locked";
    const icon = isDone ? "✓" : isActive ? "🔧" : "🔒";
    return `
      <div class="fh-ship-stage-row fh-ship-stage-row-${status}">
        <span class="fh-ship-stage-row-icon">${icon}</span>
        <span class="fh-ship-stage-row-number">${isEn ? "Stage" : "Etappe"} ${phase.stageNumber}</span>
        <span class="fh-ship-stage-row-label">${label}</span>
      </div>
    `;
  }).join("");
}

/* ------------------------------------------------------
   TAGESQUEST-KARTE (Punkt 15/5/6)
   Zeigt die naechste NOCH NICHT eingeloeste Quest - alle vorherigen
   Tage sind entweder schon eingeloest oder (falls verpasst) weiterhin
   nachholbar, aber immer nur EINE nach der anderen (kein Ueberspringen,
   siehe claimDailyQuest()/validDailyQuestsWrite() in firestore.rules).
------------------------------------------------------ */
function buildDailyQuestCardHtml(dailyQuests, playerData) {
  const isEn = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  const claimed = (dailyQuests && dailyQuests.claimedDays) || [];

  if (claimed.length >= DAILY_QUESTS.length) {
    return `
      <div class="fh-daily-quest-card fh-daily-quest-card-done">
        <p class="fh-daily-quest-heading">${isEn ? "🗓️ Daily quests" : "🗓️ Tagesquests"}</p>
        <p class="fh-daily-quest-complete">${isEn ? "✅ All 20 daily quests completed!" : "✅ Alle 20 Tagesquests abgeschlossen!"}</p>
      </div>
    `;
  }

  const day = claimed.length + 1;
  const quest = DAILY_QUESTS.find((q) => q.day === day);
  if (!quest) return "";

  const tool = SHIP_TOOLS[quest.toolId];
  const unlockedDay = getUnlockedDailyQuestDay(dailyQuests);
  const isUnlocked = day <= unlockedDay;
  const progressValue = playerData[quest.metric] || 0;
  const isMet = progressValue >= quest.threshold;
  const description = buildDailyQuestDescription(quest, isEn ? "en" : "de");

  let actionHtml;
  if (!isUnlocked) {
    actionHtml = `<p class="wheel-status">🔒 ${isEn ? "Unlocks tomorrow" : "Schaltet sich morgen frei"}</p>`;
  } else if (!isMet) {
    actionHtml = `<p class="fh-daily-quest-progress">${Math.min(progressValue, quest.threshold)} / ${quest.threshold}</p>`;
  } else {
    actionHtml = `<button type="button" class="code-button" onclick="claimDailyQuest(${day})">${tool.emoji} <span>${isEn ? "Claim tool" : "Werkzeug abholen"}</span></button>`;
  }

  return `
    <div class="fh-daily-quest-card">
      <p class="fh-daily-quest-heading">${isEn ? `🗓️ Day ${day} of ${DAILY_QUESTS.length}` : `🗓️ Tag ${day} von ${DAILY_QUESTS.length}`}</p>
      <p class="fh-daily-quest-desc">${description}</p>
      <p class="fh-daily-quest-reward">${isEn ? "Reward" : "Belohnung"}: ${tool.emoji} ${tool.label[isEn ? "en" : "de"]}</p>
      <div id="ship-quest-status" class="wheel-status"></div>
      ${actionHtml}
    </div>
  `;
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

function startShipRepairTicker(uid, activePhaseId) {
  stopShipRepairTicker();
  if (activePhaseId) shipRepairTickerPhaseId = activePhaseId;

  window._shipTimerTick = setInterval(async () => {
    const el = document.getElementById("ship-repair-timer");
    if (!el) {
      stopShipRepairTicker();
      return;
    }

    await checkAndCompleteActiveRepair(uid);
    const state = await loadShipState(uid);
    if (!state) return;

    if (!state.data.activeRepair) {
      const finishedPhase = SHIP_REPAIR_PHASES.find((p) => p.id === shipRepairTickerPhaseId);
      stopShipRepairTicker();
      playShipRepairCompleteEffect(finishedPhase);
      renderShipRepairPage();
      return;
    }

    el.textContent = formatShipCountdown(state.data.activeRepair.endsAt - Date.now());
    const fillEl = document.getElementById("ship-repair-progress-fill");
    if (fillEl) {
      const totalMs = Math.max(1, state.data.activeRepair.endsAt - state.data.activeRepair.startedAt);
      const elapsedMs = Math.min(totalMs, Date.now() - state.data.activeRepair.startedAt);
      fillEl.style.width = Math.round((elapsedMs / totalMs) * 100) + "%";
    }
  }, 1000);
}

function stopShipRepairTicker() {
  clearInterval(window._shipTimerTick);
  window._shipTimerTick = null;
  shipRepairTickerPhaseId = null;
}

/* ------------------------------------------------------
   SCHIFFSREPARATUR <-> STORY-VERKNUEPFUNG (Punkt 4/17)
   ---------------------------------------------------
   Rein additiv und standardmaessig ein No-Op: nur wenn der Admin
   im Gateway ein Kapitel als "nach Schiffsreparatur freischalten"
   markiert hat (siteConfig.shipRepairUnlockChapterIds), wird genau
   DIESES Kapitel automatisch aus lockedChapterIds entfernt, sobald
   das Schiff einen Namen hat (= vollstaendig repariert). Laeuft bei
   jedem Aufruf von renderShipRepairPage() erneut (jeder Besuch der
   "Repariere das Schiff"-Seite) - selbstheilend, falls ein
   einzelner Versuch mal fehlschlaegt, und ein reines No-Op, sobald
   das Kapitel schon freigeschaltet ist.
------------------------------------------------------ */
async function maybeUnlockChapterAfterShipRepair() {
  if (!wheelDb || typeof siteConfig === "undefined") return;

  const targetIds = siteConfig.shipRepairUnlockChapterIds || [];
  if (!targetIds.length) return;

  const locked = siteConfig.lockedChapterIds || [];
  const stillLocked = targetIds.filter((id) => locked.includes(id));
  if (!stillLocked.length) return;

  try {
    await wheelDb
      .collection("site_config")
      .doc("main")
      .set({ lockedChapterIds: locked.filter((id) => !targetIds.includes(id)) }, { merge: true });
  } catch (err) {
    console.warn("Kapitel konnte nach Schiffsreparatur nicht automatisch freigeschaltet werden:", err);
  }
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
   ---------------------------------------------------
   Reagiert nur noch auf die eigene Menüseite (#ship-repair) - die
   Reparatur zeigt/versteckt sich NICHT mehr abhängig von "???"
   oder der Home-Seite (siehe Auftrag: keine Kopplung an "???",
   kein Reparatur-Hinweis mehr auf Home). Einziger noch relevanter
   "Countdown" ist der einer bereits laufenden Reparaturphase
   (startShipRepairTicker()), der ohnehin nur läuft, waehrend die
   Seite selbst aktiv ist.
------------------------------------------------------ */
function updateShipRepairPage(pageID) {
  if (pageID === "ship-repair") {
    renderShipRepairPage();
  } else {
    stopShipRepairTicker();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initShipPreviewGate();
});
