/* ======================================================
   ??? - MYSTERIÖSER COUNTDOWN
   - Bis zum Datum in scripts/streamraetsel/streamraetsel-data.js
     läuft ein Countdown und der Inhalt bleibt gesperrt
   - Danach wird automatisch der Inhalt angezeigt, auch ohne
     Neuladen der Seite (wird jede Sekunde geprüft)
   - Spielt eigene, mysteriöse Hintergrundmusik, solange man
     auf dieser Seite ist (pausiert automatisch beim Verlassen)
====================================================== */

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
   SCHWEBENDE MYSTERY-SYMBOLE IM HINTERGRUND
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

let streamRaetselParticleInterval = null;

/* ------------------------------------------------------
   MYSTERIÖSE HINTERGRUNDMUSIK
   Eigener, unabhängiger Player (nicht derselbe wie die
   Home-Musik) - spielt nur, solange man auf der ???-Seite
   ist, mit sanftem Fade-In/Fade-Out beim Betreten/Verlassen.
------------------------------------------------------ */
let streamRaetselMusicEl = null;
let streamRaetselMusicFade = null;

function getStreamRaetselMusicEl() {
  if (streamRaetselMusicEl) return streamRaetselMusicEl;

  streamRaetselMusicEl = document.getElementById("streamraetsel-music");
  return streamRaetselMusicEl;
}

function fadeStreamRaetselMusic(el, targetVolume, duration, onComplete) {
  clearInterval(streamRaetselMusicFade);

  const startVolume = el.volume;
  const diff = targetVolume - startVolume;
  if (diff === 0) {
    if (onComplete) onComplete();
    return;
  }

  const steps = 25;
  const stepTime = duration / steps;
  let step = 0;

  streamRaetselMusicFade = setInterval(() => {
    step++;
    el.volume = Math.min(1, Math.max(0, startVolume + diff * (step / steps)));
    if (step >= steps) {
      clearInterval(streamRaetselMusicFade);
      el.volume = Math.min(1, Math.max(0, targetVolume));
      if (onComplete) onComplete();
    }
  }, stepTime);
}

function startStreamRaetselMusic() {
  const el = getStreamRaetselMusicEl();
  if (!el) return;

  const musicSrc = typeof streamRaetselConfig !== "undefined" ? streamRaetselConfig.musicSrc : "";
  if (!musicSrc) return; // noch keine Musik hinterlegt

  if (!el.dataset.srcSet) {
    el.src = musicSrc;
    el.dataset.srcSet = "1";
  }

  el.volume = 0;
  el.play().catch((err) => {
    // Autoplay evtl. vom Browser blockiert - startet beim nächsten
    // Klick irgendwo auf der Seite automatisch nach
    console.warn("Mystery-Musik konnte nicht automatisch starten:", err);
  });
  fadeStreamRaetselMusic(el, 0.6, 900);
}

function stopStreamRaetselMusic() {
  const el = getStreamRaetselMusicEl();
  if (!el) return;

  fadeStreamRaetselMusic(el, 0, 700, () => {
    el.pause();
  });
}

// Falls Autoplay beim ersten Aufruf blockiert wurde: beim ersten
// Klick irgendwo auf der Seite nachholen, sofern man gerade auf
// der ???-Seite ist
document.addEventListener("click", () => {
  const el = getStreamRaetselMusicEl();
  if (el && el.dataset.srcSet && el.paused && document.getElementById("streamraetsel")?.classList.contains("active-page")) {
    el.play().catch(() => {});
  }
});

/* ------------------------------------------------------
   INHALT NACH DER FREISCHALTUNG
------------------------------------------------------ */
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

let streamRaetselContentRendered = false;

/* ------------------------------------------------------
   COUNTDOWN-ANZEIGE
------------------------------------------------------ */
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

let streamRaetselInterval = null;

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateStreamRaetselPage(pageID) {
  if (pageID !== "streamraetsel") {
    clearInterval(streamRaetselInterval);
    streamRaetselInterval = null;
    stopStreamRaetselParticles();
    stopStreamRaetselMusic();
    return;
  }

  updateStreamRaetselView();
  startStreamRaetselMusic();

  if (!isStreamRaetselUnlocked()) {
    streamRaetselInterval = setInterval(updateStreamRaetselView, 1000);
    startStreamRaetselParticles();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  checkStreamRaetselPreviewKey();
});
