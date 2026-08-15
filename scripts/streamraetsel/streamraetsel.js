/* ======================================================
   STREAMRÄTSEL
   - Bis zum Datum in scripts/streamraetsel-data.js läuft
     ein Countdown und der Inhalt bleibt gesperrt
   - Danach wird automatisch der Inhalt angezeigt, auch ohne
     Neuladen der Seite (wird jede Sekunde geprüft)
====================================================== */

let streamRaetselInterval = null;
let streamRaetselParticleInterval = null;

function padTwo(value) {
  return String(value).padStart(2, "0");
}

/* ------------------------------------------------------
   ERSTELLER-VORSCHAU (Gate)
   Aufruf mit ?admin=DEIN-SCHLÜSSEL in der URL schaltet die
   Vorschau NUR in diesem Browser dauerhaft frei - andere
   Besucher sehen weiterhin ganz normal den Countdown.
------------------------------------------------------ */
function checkStreamRaetselPreviewKey() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("admin");

  if (key && typeof streamRaetselConfig !== "undefined" && key === streamRaetselConfig.previewKey) {
    localStorage.setItem("streamRaetselPreview", "1");

    // Schlüssel aus der sichtbaren URL entfernen
    params.delete("admin");
    const newUrl =
      window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    history.replaceState(null, "", newUrl);
  }
}

function isStreamRaetselPreview() {
  return localStorage.getItem("streamRaetselPreview") === "1";
}

function isStreamRaetselUnlocked() {
  if (isStreamRaetselPreview()) return true;

  const target = new Date(streamRaetselConfig.unlockDate);
  return new Date() >= target;
}

/* ------------------------------------------------------
   SCHWEBENDE RÄTSEL-SYMBOLE IM HINTERGRUND
------------------------------------------------------ */
const streamRaetselSymbols = ["❓", "🌫️", "👁️", "🔮"];

function spawnStreamRaetselParticle() {
  const fx = document.getElementById("streamraetsel-fx");
  if (!fx) return;

  const particle = document.createElement("div");
  particle.className = "streamraetsel-particle";
  particle.textContent = streamRaetselSymbols[Math.floor(Math.random() * streamRaetselSymbols.length)];
  particle.style.left = Math.random() * 100 + "%";
  particle.style.animationDuration = 8 + Math.random() * 6 + "s";

  fx.appendChild(particle);
  setTimeout(() => particle.remove(), 15000);
}

function startStreamRaetselParticles() {
  stopStreamRaetselParticles();
  streamRaetselParticleInterval = setInterval(spawnStreamRaetselParticle, 900);
}

function stopStreamRaetselParticles() {
  clearInterval(streamRaetselParticleInterval);
  streamRaetselParticleInterval = null;

  const fx = document.getElementById("streamraetsel-fx");
  if (fx) {
    fx.querySelectorAll(".streamraetsel-particle").forEach((el) => el.remove());
  }
}

/* ------------------------------------------------------
   ZAHLENSCHLÖSSER MIT ZIFFER-FÜR-ZIFFER-FREISCHALTUNG
   Reihenfolge: Rot Ziffer 1 -> Rot Ziffer 2 -> Rot Ziffer 3
   (Rot öffnet sich) -> Schwarz Ziffer 1 -> 2 -> 3 (Schwarz
   öffnet sich) -> beide offen -> Finale.

   Nur die JEWEILS aktuelle Ziffer ist drehbar, alle anderen
   sind gesperrt. Bestätigt wird über den "Prüfen"-Button
   unten. Bei falscher Ziffer steigt die Wartezeit mit jedem
   Fehlversuch: 5s, 10s, 20s, 40s ... (max. 2 Minuten).
------------------------------------------------------ */
const lockState = {
  red: [0, 0, 0],
  black: [0, 0, 0],
};

const lockOpened = {
  red: false,
  black: false,
};

const digitConfirmed = {
  red: [false, false, false],
  black: [false, false, false],
};

const comboProgress = {
  activeLock: "red", // "red" | "black" | "done"
  activeDigit: 0, // 0, 1 oder 2
  wrongAttempts: 0,
  lockedUntil: 0,
};

function getComboWaitSeconds(attempts) {
  const seconds = 5 * Math.pow(2, attempts - 1);
  return Math.min(seconds, 120);
}

function buildLockHtml(lockName, label) {
  let dials = "";

  for (let i = 0; i < 3; i++) {
    dials += `
      <div class="combo-dial" id="combo-dial-${lockName}-${i}">
        <button type="button" class="combo-arrow" id="combo-arrow-up-${lockName}-${i}" onclick="changeLockDial('${lockName}',${i},1)">▲</button>
        <span class="combo-digit" id="combo-digit-${lockName}-${i}">0</span>
        <button type="button" class="combo-arrow" id="combo-arrow-down-${lockName}-${i}" onclick="changeLockDial('${lockName}',${i},-1)">▼</button>
      </div>
    `;
  }

  return `
    <div class="combo-lock combo-lock-${lockName}" id="combo-lock-${lockName}">
      <div class="combo-shackle"></div>
      <div class="combo-body">
        ${dials}
      </div>
      <p class="combo-label">${label}</p>
    </div>
  `;
}

function updateLockDialDisplay(lockName, dialIndex) {
  const el = document.getElementById(`combo-digit-${lockName}-${dialIndex}`);
  if (!el) return;

  el.textContent = lockState[lockName][dialIndex];
  el.classList.remove("combo-digit-flip");
  // Reflow erzwingen, damit die Animation bei jedem Klick neu startet
  void el.offsetWidth;
  el.classList.add("combo-digit-flip");
}

function changeLockDial(lockName, dialIndex, direction) {
  // Nur die aktuell aktive Ziffer darf verstellt werden
  if (comboProgress.activeLock !== lockName || comboProgress.activeDigit !== dialIndex) return;

  lockState[lockName][dialIndex] = (lockState[lockName][dialIndex] + direction + 10) % 10;
  updateLockDialDisplay(lockName, dialIndex);
}

/* Grafischen Zustand aller Ziffern aktualisieren: aktiv/gesperrt/bestätigt */
function refreshComboLockUI() {
  ["red", "black"].forEach((lockName) => {
    for (let i = 0; i < 3; i++) {
      const dialEl = document.getElementById(`combo-dial-${lockName}-${i}`);
      const upBtn = document.getElementById(`combo-arrow-up-${lockName}-${i}`);
      const downBtn = document.getElementById(`combo-arrow-down-${lockName}-${i}`);
      if (!dialEl) continue;

      const isActive = comboProgress.activeLock === lockName && comboProgress.activeDigit === i;
      const isConfirmed = digitConfirmed[lockName][i];

      dialEl.classList.toggle("combo-dial-active", isActive);
      dialEl.classList.toggle("combo-dial-locked", !isActive && !isConfirmed);
      dialEl.classList.toggle("combo-dial-confirmed", isConfirmed);

      if (upBtn) upBtn.disabled = !isActive;
      if (downBtn) downBtn.disabled = !isActive;
    }
  });

  const checkBtn = document.getElementById("combo-check-btn");
  if (checkBtn) checkBtn.style.display = comboProgress.activeLock === "done" ? "none" : "inline-flex";
}

function playComboAudio(audioPath, btnEl) {
  const player = document.getElementById("code-audio-player");
  if (!player || !audioPath) return;

  player.src = audioPath;
  player.play().catch((err) => {
    console.warn("Audio konnte nicht abgespielt werden:", err);
  });

  if (btnEl) {
    const playsLeft = (parseInt(btnEl.dataset.playsLeft, 10) || 1) - 1;
    btnEl.dataset.playsLeft = playsLeft;

    if (playsLeft <= 0) {
      btnEl.disabled = true;
      btnEl.textContent = "🔇 Aufgebraucht";
    } else {
      btnEl.textContent = `▶️ Hinweis abspielen (${playsLeft}x übrig)`;
    }
  }
}

function showComboMessage(text, type, audioPath) {
  const messageEl = document.getElementById("combo-message");
  if (!messageEl) return;

  messageEl.classList.remove("code-success", "code-error");
  messageEl.classList.add(type === "success" ? "code-success" : "code-error");
  messageEl.textContent = text;

  if (audioPath) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-button combo-audio-btn";
    btn.textContent = "▶️ Hinweis abspielen (3x übrig)";
    btn.dataset.playsLeft = "3";
    btn.onclick = () => playComboAudio(audioPath, btn);
    messageEl.appendChild(document.createElement("br"));
    messageEl.appendChild(btn);
  }
}

function checkComboDigit() {
  if (comboProgress.activeLock === "done") return;

  const now = Date.now();
  if (now < comboProgress.lockedUntil) {
    const waitLeft = Math.ceil((comboProgress.lockedUntil - now) / 1000);
    showComboMessage(`⏳ Zu viele Fehlversuche - warte noch ${waitLeft} Sekunde(n).`, "error");
    return;
  }

  const lockName = comboProgress.activeLock;
  const digitIndex = comboProgress.activeDigit;
  const combo = lockName === "red" ? streamRaetselConfig.redLockCombination : streamRaetselConfig.blackLockCombination;
  const correctDigit = combo[digitIndex];
  const currentDigit = String(lockState[lockName][digitIndex]);

  if (currentDigit === correctDigit) {
    comboProgress.wrongAttempts = 0;
    digitConfirmed[lockName][digitIndex] = true;

    const messages = lockName === "red" ? streamRaetselConfig.redLockMessages : streamRaetselConfig.blackLockMessages;
    const digitInfo = messages && messages[digitIndex] ? messages[digitIndex] : null;

    showComboMessage(
      digitInfo && digitInfo.message ? digitInfo.message : "✅ Richtig!",
      "success",
      digitInfo && digitInfo.audio ? digitInfo.audio : null
    );

    if (typeof triggerCodeSuccessEffect === "function") {
      triggerCodeSuccessEffect();
    }

    advanceComboProgress(lockName);
  } else {
    comboProgress.wrongAttempts++;
    const waitSeconds = getComboWaitSeconds(comboProgress.wrongAttempts);
    comboProgress.lockedUntil = now + waitSeconds * 1000;

    showComboMessage(`❌ Falsch. Nächster Versuch in ${waitSeconds} Sekunde(n) möglich.`, "error");
  }

  refreshComboLockUI();
}

function advanceComboProgress(lockName) {
  if (comboProgress.activeDigit < 2) {
    comboProgress.activeDigit++;
    return;
  }

  // Alle 3 Ziffern dieses Schlosses bestätigt -> Schloss öffnet sich
  lockOpened[lockName] = true;
  const lockEl = document.getElementById(`combo-lock-${lockName}`);
  if (lockEl) lockEl.classList.add("combo-lock-open");

  if (lockName === "red") {
    comboProgress.activeLock = "black";
    comboProgress.activeDigit = 0;
  } else {
    comboProgress.activeLock = "done";
    checkBothLocksOpen();
  }
}

function checkBothLocksOpen() {
  if (!lockOpened.red || !lockOpened.black) return;

  const finale = document.getElementById("stream-finale");
  if (!finale) return;

  finale.classList.add("visible");

  if (typeof triggerCodeSuccessEffect === "function") {
    triggerCodeSuccessEffect();
  }

  startPackageCountdown();
}

/* ------------------------------------------------------
   PAKET-COUNTDOWN MIT LKW
   Sobald BEIDE Schlösser geknackt sind, startet ein neuer
   5-Tage-Countdown bis zur "Lieferung". Der Startzeitpunkt
   wird beim ERSTEN Lösen gespeichert (pro Browser), damit er
   bei einem erneuten Seitenaufruf nicht wieder von vorne
   losläuft. Ein LKW-Symbol wandert dabei über einen
   Fortschrittsbalken passend zum Lieferfortschritt.
------------------------------------------------------ */
const PACKAGE_COUNTDOWN_KEY = "streamraetselSolvedAt";
const PACKAGE_COUNTDOWN_DAYS = 5;
let packageCountdownInterval = null;

function startPackageCountdown() {
  const container = document.getElementById("package-countdown");
  if (!container) return;

  let solvedAt = null;
  try {
    solvedAt = localStorage.getItem(PACKAGE_COUNTDOWN_KEY);
  } catch (err) {
    // localStorage nicht verfügbar - Countdown läuft dann nur für
    // diesen einen Seitenaufruf, ist aber kein harter Fehler
  }

  if (!solvedAt) {
    solvedAt = String(Date.now());
    try {
      localStorage.setItem(PACKAGE_COUNTDOWN_KEY, solvedAt);
    } catch (err) {
      // s.o.
    }
  }

  const startTime = parseInt(solvedAt, 10);
  const targetTime = startTime + PACKAGE_COUNTDOWN_DAYS * 24 * 60 * 60 * 1000;
  const totalDuration = targetTime - startTime;

  container.classList.add("visible");
  updatePackageCountdown(startTime, targetTime, totalDuration);

  clearInterval(packageCountdownInterval);
  packageCountdownInterval = setInterval(
    () => updatePackageCountdown(startTime, targetTime, totalDuration),
    1000
  );
}

function updatePackageCountdown(startTime, targetTime, totalDuration) {
  const now = Date.now();
  const remaining = targetTime - now;
  const elapsed = now - startTime;
  const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

  const truck = document.getElementById("package-truck");
  const fill = document.getElementById("package-progress-fill");
  const label = document.getElementById("package-countdown-label");

  if (truck) truck.style.left = `${progress}%`;
  if (fill) fill.style.width = `${progress}%`;

  if (remaining <= 0) {
    clearInterval(packageCountdownInterval);
    if (label) label.textContent = "📦 Dein Paket ist angekommen!";
    if (truck) truck.textContent = "✅";
    const container = document.getElementById("package-countdown");
    if (container) container.classList.add("arrived");
    return;
  }

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

  if (label) {
    label.textContent = `🚚 Lieferung in ${days} Tag(en), ${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`;
  }
}

function renderStreamRaetselContent() {
  const contentEl = document.getElementById("streamraetsel-content");
  if (!contentEl) return;

  const imageHtml = streamRaetselConfig.image
    ? `<img src="${streamRaetselConfig.image}" class="detail-cover" style="margin-bottom:30px;">`
    : "";

  contentEl.innerHTML = `
    <h1>${streamRaetselConfig.title}</h1>
    ${imageHtml}
    <p class="story-subtitle">${streamRaetselConfig.description}</p>

    <div class="combo-lock-wrap">
      ${buildLockHtml("red", "🔴 Rot")}
      ${buildLockHtml("black", "⚫ Schwarz")}
    </div>

    <button type="button" id="combo-check-btn" class="code-button combo-check-btn" onclick="checkComboDigit()">Prüfen</button>
    <p id="combo-message" class="code-message"></p>

    <div id="stream-finale" class="stream-finale">
      <p class="stream-finale-text">${streamRaetselConfig.finaleText}</p>
    </div>

    <div id="package-countdown" class="package-countdown">
      <p id="package-countdown-label" class="package-countdown-label"></p>
      <div class="package-progress-track">
        <div id="package-progress-fill" class="package-progress-fill"></div>
        <div id="package-truck" class="package-truck">🚚</div>
        <span class="package-flag package-flag-start">🏁</span>
        <span class="package-flag package-flag-end">📦</span>
      </div>
    </div>
  `;

  // Zustand zurücksetzen, falls die Seite neu aufgebaut wird
  lockState.red = [0, 0, 0];
  lockState.black = [0, 0, 0];
  lockOpened.red = false;
  lockOpened.black = false;
  digitConfirmed.red = [false, false, false];
  digitConfirmed.black = [false, false, false];
  comboProgress.activeLock = "red";
  comboProgress.activeDigit = 0;
  comboProgress.wrongAttempts = 0;
  comboProgress.lockedUntil = 0;

  refreshComboLockUI();

  // War das Rätsel bei einem früheren Besuch schon gelöst, direkt das
  // Finale + den laufenden Paket-Countdown zeigen, statt die Schlösser
  // erneut zu verlangen
  let alreadySolved = null;
  try {
    alreadySolved = localStorage.getItem(PACKAGE_COUNTDOWN_KEY);
  } catch (err) {
    // localStorage nicht verfügbar - dann eben normal von vorne lösen
  }

  if (alreadySolved) {
    lockOpened.red = true;
    lockOpened.black = true;
    comboProgress.activeLock = "done";

    const redLockEl = document.getElementById("combo-lock-red");
    const blackLockEl = document.getElementById("combo-lock-black");
    if (redLockEl) redLockEl.classList.add("combo-lock-open");
    if (blackLockEl) blackLockEl.classList.add("combo-lock-open");

    const finale = document.getElementById("stream-finale");
    if (finale) finale.classList.add("visible");

    refreshComboLockUI();
    startPackageCountdown();
  }
}

let streamRaetselContentRendered = false;

function updateStreamRaetselView() {
  const lockedEl = document.getElementById("streamraetsel-locked");
  const contentEl = document.getElementById("streamraetsel-content");
  if (!lockedEl || !contentEl) return;

  if (isStreamRaetselUnlocked()) {
    lockedEl.style.display = "none";
    contentEl.style.display = "block";

    if (!streamRaetselContentRendered) {
      renderStreamRaetselContent();
      streamRaetselContentRendered = true;
    }

    clearInterval(streamRaetselInterval);
    streamRaetselInterval = null;
    stopStreamRaetselParticles();
    return;
  }

  lockedEl.style.display = "flex";
  contentEl.style.display = "none";

  const now = new Date();
  const target = new Date(streamRaetselConfig.unlockDate);
  const diff = target - now;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const daysEl = document.getElementById("streamraetsel-days");
  const hoursEl = document.getElementById("streamraetsel-hours");
  const minutesEl = document.getElementById("streamraetsel-minutes");
  const secondsEl = document.getElementById("streamraetsel-seconds");

  if (daysEl) daysEl.textContent = padTwo(days);
  if (hoursEl) hoursEl.textContent = padTwo(hours);
  if (minutesEl) minutesEl.textContent = padTwo(minutes);
  if (secondsEl) secondsEl.textContent = padTwo(seconds);
}

function updateStreamRaetselPage(pageID) {
  if (pageID !== "streamraetsel") {
    clearInterval(streamRaetselInterval);
    streamRaetselInterval = null;
    stopStreamRaetselParticles();
    return;
  }

  updateStreamRaetselView();

  if (!isStreamRaetselUnlocked()) {
    streamRaetselInterval = setInterval(updateStreamRaetselView, 1000);
    startStreamRaetselParticles();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  checkStreamRaetselPreviewKey();
});
