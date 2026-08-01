/* ======================================================
   MAIN WEBSITE SYSTEM
====================================================== */

/* ------------------------------------------------------
   SEITENWECHSEL
------------------------------------------------------ */
function changePage(pageID) {
  const pages = document.querySelectorAll(".page");
  pages.forEach((page) => page.classList.remove("active-page"));

  const target = document.getElementById(pageID);
  if (target) {
    target.classList.add("active-page");
  }

  updateMusicForPage(pageID);
  updateHomeEffects(pageID);
  updateWheelPage(pageID);
  updateLeaderboardPage(pageID);
  updateRacePage(pageID);
  updateStreamRaetselPage(pageID);

  if (typeof updateGiveawayPage === "function") {
    updateGiveawayPage(pageID);
  }

  if (typeof updateLoginPage === "function") {
    updateLoginPage(pageID);
  }
  closeMenu();
}

/* ------------------------------------------------------
   HOME HINTERGRUND-ANIMATION
   Aufsteigender Sternenstaub + gelegentliche Sternschnuppen,
   nur aktiv solange man auf der Home/Countdown-Seite ist.
------------------------------------------------------ */
const homeFx = document.getElementById("home-fx");
const homeDynamic = document.getElementById("home-dynamic");

let particleInterval = null;
let shootingStarInterval = null;

const PARTICLE_COLORS = ["#bcdfff", "#8fd9ff", "#c9a4ff", "#ffffff", "#7ac8ff"];
const STAR_COLORS = ["#ffffff", "#a8d8ff", "#d4b3ff"];

function spawnParticle() {
  if (!homeDynamic) return;

  const particle = document.createElement("div");
  particle.className = "home-particle";

  const size = 2 + Math.random() * 4;
  const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];

  particle.style.left = Math.random() * 100 + "%";
  particle.style.width = size + "px";
  particle.style.height = size + "px";
  particle.style.background = color;
  particle.style.boxShadow = `0 0 ${size * 3}px ${size}px ${color}`;
  particle.style.animationDuration = 5 + Math.random() * 6 + "s";

  homeDynamic.appendChild(particle);

  setTimeout(() => particle.remove(), 12000);
}

function spawnShootingStar() {
  if (!homeDynamic) return;

  const star = document.createElement("div");
  star.className = "shooting-star";

  const length = 120 + Math.random() * 140;
  const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];

  star.style.top = Math.random() * 40 + "%";
  star.style.left = 65 + Math.random() * 35 + "%";
  star.style.width = length + "px";
  star.style.background = `linear-gradient(90deg, rgba(255,255,255,0), ${color})`;
  star.style.boxShadow = `0 0 12px 2px ${color}`;

  homeDynamic.appendChild(star);

  setTimeout(() => star.remove(), 1400);
}

function startHomeEffects() {
  if (!homeFx || particleInterval) return;

  particleInterval = setInterval(spawnParticle, 350);
  shootingStarInterval = setInterval(() => {
    spawnShootingStar();
    // gelegentlich eine zweite Sternschnuppe kurz danach für einen "Wow"-Moment
    if (Math.random() < 0.25) {
      setTimeout(spawnShootingStar, 200 + Math.random() * 300);
    }
  }, 3000 + Math.random() * 3000);
}

function stopHomeEffects() {
  clearInterval(particleInterval);
  clearInterval(shootingStarInterval);
  particleInterval = null;
  shootingStarInterval = null;

  if (homeDynamic) homeDynamic.innerHTML = "";
}

function updateHomeEffects(pageID) {
  if (pageID === "home") {
    startHomeEffects();
  } else {
    stopHomeEffects();
  }
}

/* ------------------------------------------------------
   MUSIK SYSTEM
   Spielt eine Playlist (scripts/music-data.js) nacheinander
   ab, solange man auf der Home/Countdown-Seite ist. Ist der
   letzte Song zu Ende, geht es automatisch wieder mit dem
   ersten Song weiter (Endlosschleife der ganzen Playlist).
   Browser blockieren Autoplay mit Ton oft, bis der Nutzer
   einmal irgendwo geklickt hat – daher der Fallback über
   "pendingAutoplay".
------------------------------------------------------ */
const bgMusic = document.getElementById("bg-music");
const musicToggle = document.getElementById("music-toggle");

let musicMuted = false;
let pendingAutoplay = false;
let currentTrackIndex = 0;

function loadCurrentTrack() {
  if (!bgMusic || typeof musicPlaylist === "undefined" || musicPlaylist.length === 0) {
    return;
  }

  bgMusic.src = musicPlaylist[currentTrackIndex];
}

function playNextTrack() {
  if (typeof musicPlaylist === "undefined" || musicPlaylist.length === 0) {
    return;
  }

  // Springt zum nächsten Song, nach dem letzten geht es zurück auf 0
  currentTrackIndex = (currentTrackIndex + 1) % musicPlaylist.length;
  loadCurrentTrack();
  bgMusic.play().catch(() => {
    pendingAutoplay = true;
  });
}

// Wenn ein Song zu Ende ist, automatisch den nächsten starten
if (bgMusic) {
  bgMusic.addEventListener("ended", playNextTrack);
}

function updateMusicForPage(pageID) {
  if (!bgMusic) return;

  if (pageID === "home") {
    musicToggle.style.display = "flex";

    if (!bgMusic.src || bgMusic.src === window.location.href) {
      loadCurrentTrack();
    }

    if (!musicMuted) {
      const playPromise = bgMusic.play();

      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay wurde vom Browser blockiert.
          // Wird beim nächsten Klick automatisch nachgeholt.
          pendingAutoplay = true;
        });
      }
    }
  } else {
    bgMusic.pause();
    musicToggle.style.display = "none";
  }
}

function toggleMusic() {
  if (!bgMusic) return;

  musicMuted = !musicMuted;

  if (musicMuted) {
    bgMusic.pause();
    musicToggle.textContent = "🔇";
  } else {
    bgMusic.play().catch(() => {});
    musicToggle.textContent = "🔊";
  }
}

// Fallback: Falls der Browser den Autoplay-Start blockiert hat,
// wird die Musik beim ersten Klick irgendwo auf der Seite nachgestartet.
document.addEventListener(
  "click",
  () => {
    if (pendingAutoplay && !musicMuted && bgMusic) {
      bgMusic.play().catch(() => {});
      pendingAutoplay = false;
    }
  },
  { once: false }
);

/* ------------------------------------------------------
   MENÜ SYSTEM
   (Klasse "open" muss zu style.css passen: .sidebar.open)
------------------------------------------------------ */
function openMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (menu) menu.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
}

function closeMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (menu) menu.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
}

/* ------------------------------------------------------
   CODE SYSTEM
   Vergleicht die Eingabe mit der Liste in codes-data.js
------------------------------------------------------ */
/* ------------------------------------------------------
   HASH-BERECHNUNG (Web Crypto API)
   Wird genutzt, um Codes zu prüfen, ohne die echten Codes
   im Quelltext lesbar zu halten (siehe codes-data.js).
------------------------------------------------------ */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------
   BREMSE GEGEN AUTOMATISIERTES DURCHPROBIEREN
   Nach ein paar Fehlversuchen muss man kurz warten, bevor
   der nächste Versuch gezählt wird.
------------------------------------------------------ */
let codeWrongAttempts = 0;
let codeLockedUntil = 0;

/* ------------------------------------------------------
   SPRACHAUSGABE (Web Speech API)
   Wird nur bei Codes ausgelöst, die in codes-data.js
   "speak: true" gesetzt haben. Liest entweder die normale
   Nachricht vor, oder - falls angegeben - den Text aus
   "speakText" (falls der Vorlesetext anders sein soll als
   der angezeigte Text).
------------------------------------------------------ */
/* ------------------------------------------------------
   SPRACHAUSGABE (Web Speech API)
   Wird nur bei Codes ausgelöst, die in codes-data.js
   "speak: true" gesetzt haben. Sucht sich automatisch die
   beste verfügbare Stimme des Browsers (viele Systeme haben
   z.B. "Google Deutsch" oder ähnliche natürlich klingende
   Stimmen zusätzlich zur Standard-Stimme installiert).

   Kann jederzeit über den Schalter auf der Code-Seite
   komplett deaktiviert werden (isSpeechEnabled()).
------------------------------------------------------ */
function isSpeechEnabled() {
  return localStorage.getItem("speechEnabled") !== "off"; // Standard: an
}

function toggleSpeech() {
  const enabled = isSpeechEnabled();
  localStorage.setItem("speechEnabled", enabled ? "off" : "on");

  if (enabled) {
    speechSynthesis.cancel(); // laufende Ansage sofort stoppen
  }

  refreshSpeechToggleUI();
}

function refreshSpeechToggleUI() {
  const btn = document.getElementById("speech-toggle-btn");
  if (!btn) return;

  const enabled = isSpeechEnabled();
  btn.textContent = enabled ? "🔊 Sprachausgabe: An" : "🔇 Sprachausgabe: Aus";
  btn.classList.toggle("speech-off", !enabled);
}

function pickBestVoice(langPrefix) {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  if (!voices.length) return null;

  // Bevorzugt natürlicher klingende Stimmen, die viele Browser/Systeme
  // zusätzlich zur Standard-Roboterstimme anbieten
  const preferredKeywords = ["google", "natural", "neural", "online", "premium"];
  const preferred = voices.find((v) =>
    preferredKeywords.some((kw) => v.name.toLowerCase().includes(kw))
  );

  return preferred || voices[0];
}

function speakCodeMessage(match) {
  if (!match.speak || !("speechSynthesis" in window) || !isSpeechEnabled()) return;

  const text = match.speakText || match.message;
  const langPrefix = typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en" : "de";

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langPrefix === "en" ? "en-US" : "de-DE";
  utterance.rate = 1;

  const bestVoice = pickBestVoice(langPrefix);
  if (bestVoice) utterance.voice = bestVoice;

  speechSynthesis.cancel(); // laufende Ansagen abbrechen, falls vorhanden
  speechSynthesis.speak(utterance);
}

async function checkCode() {
  const input = document.getElementById("code-input");
  const messageEl = document.getElementById("code-message");
  const imageEl = document.getElementById("code-image");

  if (!input || !messageEl) {
    console.error("Code-Eingabe: #code-input oder #code-message fehlt im HTML.");
    return;
  }

  if (typeof codes === "undefined") {
    console.error(
      "Code-Eingabe: 'codes' ist nicht definiert. Ist scripts/codes-data.js eingebunden und VOR main.js geladen?"
    );
    messageEl.textContent = "⚠️ Code-System ist noch nicht bereit.";
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    return;
  }

  const now = Date.now();
  if (now < codeLockedUntil) {
    const waitSeconds = Math.ceil((codeLockedUntil - now) / 1000);
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    messageEl.textContent = `⏳ Zu viele Fehlversuche – warte noch ${waitSeconds} Sekunde(n).`;
    return;
  }

  const enteredCode = input.value.trim().toLowerCase();

  if (!enteredCode) {
    return;
  }

  const enteredHash = await sha256Hex(enteredCode);
  const match = codes.find((entry) => entry.hash === enteredHash);

  messageEl.classList.remove("code-success", "code-error");

  if (match) {
    codeWrongAttempts = 0;

    const codeId = match.hash;
    const alreadyCracked =
      typeof isCodeAlreadyCracked === "function" && isCodeAlreadyCracked(codeId);

    messageEl.classList.add("code-success");

    if (alreadyCracked) {
      messageEl.textContent = "✅ Diesen Code hast du bereits eingelöst.";

      if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    } else {
      messageEl.textContent = match.message;

      if (typeof recordCodeCrack === "function") {
        recordCodeCrack(codeId, match.reward || null);
      }

      if (typeof triggerCodeSuccessEffect === "function") {
        triggerCodeSuccessEffect();
      }

      speakCodeMessage(match);

      if (match.image && imageEl) {
        imageEl.src = match.image;
        imageEl.classList.add("visible");
      } else if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    }
  } else {
    codeWrongAttempts++;

    if (codeWrongAttempts >= 5) {
      codeLockedUntil = Date.now() + 10000; // 10 Sekunden Pause
      codeWrongAttempts = 0;
    }

    messageEl.textContent =
      typeof codeNotFoundMessage !== "undefined"
        ? codeNotFoundMessage
        : "Dieser Code ist ungültig.";
    messageEl.classList.add("code-error");

    if (imageEl) {
      imageEl.classList.remove("visible");
      imageEl.removeAttribute("src");
    }
  }

  input.value = "";
}

/* ------------------------------------------------------
   START
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  changePage("home");
  refreshSpeechToggleUI();

  // Manche Browser laden die Stimmenliste asynchron nach -
  // hier einmal "warmlaufen" lassen, damit pickBestVoice()
  // beim ersten Code direkt die volle Auswahl hat
  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", () => {
      speechSynthesis.getVoices();
    });
  }
});
