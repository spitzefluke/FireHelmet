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

function isStreamRaetselUnlocked() {
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
  `;
}

function updateStreamRaetselView() {
  const lockedEl = document.getElementById("streamraetsel-locked");
  const contentEl = document.getElementById("streamraetsel-content");
  if (!lockedEl || !contentEl) return;

  if (isStreamRaetselUnlocked()) {
    lockedEl.style.display = "none";
    contentEl.style.display = "block";
    renderStreamRaetselContent();

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
