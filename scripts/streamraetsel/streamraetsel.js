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
const streamRaetselSymbols = ["🧩", "❓", "🎮", "🔍"];

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
   ZAHLENSCHLÖSSER (rot + schwarz)
------------------------------------------------------ */
const lockState = {
  red: [0, 0, 0],
  black: [0, 0, 0],
};

const lockOpened = {
  red: false,
  black: false,
};

function buildLockHtml(lockName, label) {
  let dials = "";

  for (let i = 0; i < 3; i++) {
    dials += `
      <div class="combo-dial">
        <button type="button" class="combo-arrow" onclick="changeLockDial('${lockName}',${i},1)">▲</button>
        <span class="combo-digit" id="combo-digit-${lockName}-${i}">0</span>
        <button type="button" class="combo-arrow" onclick="changeLockDial('${lockName}',${i},-1)">▼</button>
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
  if (el) el.textContent = lockState[lockName][dialIndex];
}

function changeLockDial(lockName, dialIndex, direction) {
  if (lockOpened[lockName]) return; // schon offen, nichts mehr verstellbar

  lockState[lockName][dialIndex] = (lockState[lockName][dialIndex] + direction + 10) % 10;
  updateLockDialDisplay(lockName, dialIndex);
  checkLock(lockName);
}

function checkLock(lockName) {
  const combo = lockName === "red" ? streamRaetselConfig.redLockCombination : streamRaetselConfig.blackLockCombination;
  const current = lockState[lockName].join("");

  if (current === combo && !lockOpened[lockName]) {
    lockOpened[lockName] = true;

    const lockEl = document.getElementById(`combo-lock-${lockName}`);
    if (lockEl) lockEl.classList.add("combo-lock-open");

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

    <div id="stream-finale" class="stream-finale">
      <p class="stream-finale-text">${streamRaetselConfig.finaleText}</p>
    </div>
  `;

  // Zustand zurücksetzen, falls die Seite neu aufgebaut wird
  lockState.red = [0, 0, 0];
  lockState.black = [0, 0, 0];
  lockOpened.red = false;
  lockOpened.black = false;
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

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
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
