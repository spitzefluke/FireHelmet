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

// Admin-Override aus dem Gateway (siteConfig.shipEventUnlockDate, siehe
// scripts/core/site-config.js) hat Vorrang vor dem statischen Fallback aus
// streamRaetselConfig.unlockDate - genau das Prinzip, das vorher in
// ship-repair.js verwendet wurde, jetzt hier direkt an der Stelle, die
// dieses Datum tatsaechlich noch verwendet ("???"-Seite, siehe Auftrag:
// Schiffsreparatur haengt nicht mehr an diesem Datum).
function getStreamRaetselUnlockDate() {
  const override = typeof siteConfig !== "undefined" ? siteConfig.shipEventUnlockDate : null;
  return new Date(override || streamRaetselConfig.unlockDate);
}

function isStreamRaetselUnlocked() {
  return new Date() >= getStreamRaetselUnlockDate();
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
  // Lief bisher dauerhaft alle 900ms, ohne auf reduzierte Bewegung
  // Ruecksicht zu nehmen - eine der wenigen wirklich fortlaufenden
  // Hintergrundanimationen der Seite (siehe Performance-Hinweis).
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
   MYSTERIÖSE HINTERGRUNDMUSIK - PLAYLIST
   Genau wie bei der Home-Seite: zufällige Reihenfolge, kein Song
   doppelt hintereinander, bis alle einmal dran waren. Eigener,
   unabhängiger Player (nicht derselbe wie die Home-Musik) - läuft
   nur, solange man auf der ???-Seite ist, mit sanftem Fade-In/
   Fade-Out beim Betreten/Verlassen.
------------------------------------------------------ */
let streamRaetselMusicEl = null;
let streamRaetselMusicFade = null;
let streamRaetselShuffleBag = [];
let streamRaetselLastPlayed = -1;
let streamRaetselMusicBound = false;

function getStreamRaetselMusicEl() {
  if (streamRaetselMusicEl) return streamRaetselMusicEl;

  streamRaetselMusicEl = document.getElementById("streamraetsel-music");
  return streamRaetselMusicEl;
}

function hasStreamRaetselPlaylist() {
  return typeof streamRaetselConfig !== "undefined"
    && Array.isArray(streamRaetselConfig.musicPlaylist)
    && streamRaetselConfig.musicPlaylist.length > 0;
}

function shuffleStreamRaetselArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function refillStreamRaetselShuffleBag() {
  if (!hasStreamRaetselPlaylist()) return;

  const playlist = streamRaetselConfig.musicPlaylist;
  const indices = playlist.map((_, i) => i);
  let shuffled = shuffleStreamRaetselArray(indices);

  // Vermeiden, dass der letzte Song der vorigen Runde direkt
  // nochmal als erster der neuen Runde kommt
  if (playlist.length > 1 && shuffled[0] === streamRaetselLastPlayed) {
    const swapWith = 1 + Math.floor(Math.random() * (shuffled.length - 1));
    [shuffled[0], shuffled[swapWith]] = [shuffled[swapWith], shuffled[0]];
  }

  streamRaetselShuffleBag = shuffled;
}

function pickStreamRaetselNextIndex() {
  if (streamRaetselShuffleBag.length === 0) {
    refillStreamRaetselShuffleBag();
  }
  const next = streamRaetselShuffleBag.shift();
  streamRaetselLastPlayed = next;
  return next;
}

function loadStreamRaetselRandomTrack() {
  const el = getStreamRaetselMusicEl();
  if (!el || !hasStreamRaetselPlaylist()) return;

  const index = pickStreamRaetselNextIndex();
  el.src = streamRaetselConfig.musicPlaylist[index];
  updateStreamRaetselNowPlayingUI(streamRaetselConfig.musicPlaylist[index]);
}

/* ------------------------------------------------------
   "JETZT LÄUFT"-ANZEIGE (rein visuell, unabhängig von der
   Countdown-Logik oben - siehe drawStreamRaetselCountdown()/
   updateStreamRaetselView() weiter unten, die dieses Element nie
   anfassen). Der Titel wird direkt aus dem Dateinamen abgeleitet
   (Unterstriche -> Leerzeichen, Endung weg) statt eines separaten
   Metadaten-Felds - spart eine zweite Quelle, die mit der Playlist
   synchron gehalten werden müsste.
------------------------------------------------------ */
function deriveStreamRaetselTrackTitle(path) {
  const fileName = path.split("/").pop() || "";
  return fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ");
}

function updateStreamRaetselNowPlayingUI(path) {
  const wrapEl = document.getElementById("streamraetsel-now-playing");
  const titleEl = document.getElementById("streamraetsel-now-playing-title");
  if (!wrapEl || !titleEl) return;

  titleEl.textContent = deriveStreamRaetselTrackTitle(path);
  wrapEl.hidden = false;
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
  if (!el || !hasStreamRaetselPlaylist()) return;

  // Beim ersten Mal: automatischen Sprung zum nächsten Song
  // einhängen, sobald einer zu Ende ist
  if (!streamRaetselMusicBound) {
    streamRaetselMusicBound = true;
    el.addEventListener("ended", () => {
      loadStreamRaetselRandomTrack();
      el.play().catch(() => {});
    });
    // Springt automatisch weiter, falls ein Song mal fehlt/kaputt ist
    el.addEventListener("error", () => {
      if (document.getElementById("streamraetsel")?.classList.contains("active-page")) {
        loadStreamRaetselRandomTrack();
        el.play().catch(() => {});
      }
    });
  }

  if (!el.src) {
    loadStreamRaetselRandomTrack();
  }

  el.volume = 0;
  el.play().catch((err) => {
    // "AbortError" bedeutet nur, dass play() durch ein fast zeitgleiches
    // pause() unterbrochen wurde (z.B. sehr schnelles Verlassen der Seite,
    // siehe stopStreamRaetselMusic()) - ein normaler, harmloser Vorgang
    // im Browser, kein echter Fehler, deshalb hier bewusst nicht geloggt.
    // Ein vom Browser blockiertes Autoplay startet ohnehin automatisch
    // beim nächsten Klick irgendwo auf der Seite nach (siehe unten).
    if (err.name !== "AbortError") {
      console.warn("Mystery-Musik konnte nicht automatisch starten:", err);
    }
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
  if (el && el.src && el.paused && document.getElementById("streamraetsel")?.classList.contains("active-page")) {
    el.play().catch(() => {});
  }
});

/* ------------------------------------------------------
   INHALT NACH DER FREISCHALTUNG
   ---------------------------------------------------
   Der "???"-Bereich ist der Eingang zum Piratenpass (siehe Auftrag
   "WICHTIGE KORREKTUR ZUM PIRATENPASS"): sobald der Countdown unten
   auf 0 laeuft, wird HIER, an genau dieser Stelle, direkt
   renderPassPage() (scripts/piratenpass/piratenpass.js) aufgerufen -
   kein eigener Menüpunkt, keine eigene Seite, kein zweiter,
   unabhaengiger Countdown. renderStreamRaetselContent() (der
   urspruengliche, nie mit echtem Inhalt befuellte Platzhalter-Text
   aus streamRaetselConfig) bleibt als Rueckfallebene erhalten, falls
   piratenpass.js aus irgendeinem Grund nicht geladen ist.
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

/* ------------------------------------------------------
   COUNTDOWN-ANZEIGE / UMSCHALTUNG AUF DEN PIRATENPASS
   ---------------------------------------------------
   Solange gesperrt: sekuendliches Ticken wie bisher. Sobald
   freigeschaltet: der Piratenpass zeigt selbst nur einen Tage-
   Countdown (keine Sekundenanzeige), daher reicht danach ein
   selteneres Intervall (60s) statt weiterhin sekuendlich neu zu
   rendern (Auftrag Punkt 25: "keine permanente Polling-Schleife").
   ensureStreamRaetselInterval() wechselt automatisch zwischen beiden
   Taktungen, auch WAEHREND die Seite schon offen ist (Countdown
   laeuft gerade ab, ohne dass neu geladen wird).
------------------------------------------------------ */
function updateStreamRaetselView() {
  const lockedEl = document.getElementById("streamraetsel-locked");
  const contentEl = document.getElementById("streamraetsel-content");
  if (!lockedEl || !contentEl) return;

  const unlocked = isStreamRaetselUnlocked();

  if (unlocked) {
    lockedEl.style.display = "none";
    contentEl.style.display = "block";

    if (typeof renderPassPage === "function") {
      renderPassPage();
    } else {
      renderStreamRaetselContent();
    }

    stopStreamRaetselParticles();
    ensureStreamRaetselInterval(true);
    return;
  }

  lockedEl.style.display = "flex";
  contentEl.style.display = "none";

  const now = new Date();
  const target = getStreamRaetselUnlockDate();
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

  ensureStreamRaetselInterval(false);
}

let streamRaetselInterval = null;
let streamRaetselIntervalIsFast = false;

function ensureStreamRaetselInterval(unlocked) {
  const desiredFast = !unlocked;
  if (streamRaetselInterval && streamRaetselIntervalIsFast === desiredFast) return;
  clearInterval(streamRaetselInterval);
  streamRaetselInterval = setInterval(updateStreamRaetselView, desiredFast ? 1000 : 60000);
  streamRaetselIntervalIsFast = desiredFast;
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
   ---------------------------------------------------
   Die "???"-Seite ist eine eigenstaendige Mystery-Seite, komplett
   unabhaengig von der Schiffsreparatur (siehe scripts/ship/
   ship-repair.js, Auftrag: Reparatur darf nicht an "???" gekoppelt
   sein). Diese Datei ist wieder alleine fuer ihre eigene Locked-
   Ansicht + Inhalt (inkl. Piratenpass) zustaendig.
------------------------------------------------------ */
function updateStreamRaetselPage(pageID) {
  if (pageID !== "streamraetsel") {
    clearInterval(streamRaetselInterval);
    streamRaetselInterval = null;
    streamRaetselIntervalIsFast = false;
    stopStreamRaetselParticles();
    stopStreamRaetselMusic();
    // Beim naechsten Betreten soll die Route wieder frisch zur
    // aktuellen Stufe scrollen, statt eine ggf. veraltete Scroll-
    // Position beizubehalten (siehe scrollToCurrentPassTier() in
    // scripts/piratenpass/piratenpass.js).
    if (typeof resetPiratenpassScrollState === "function") resetPiratenpassScrollState();
    return;
  }

  startStreamRaetselMusic();
  updateStreamRaetselView();

  if (!isStreamRaetselUnlocked()) {
    startStreamRaetselParticles();
  }
}


