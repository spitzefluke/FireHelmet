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

  if (typeof updateCodeAmbientPage === "function") {
    updateCodeAmbientPage(pageID);
  }

  if (typeof updateGiveawayPage === "function") {
    updateGiveawayPage(pageID);
  }

  if (typeof updateCharactersPage === "function") {
    updateCharactersPage(pageID);
  }

  if (typeof updateSupportPage === "function") {
    updateSupportPage(pageID);
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

function getHomeIntensity() {
  return typeof getHomeIntensityMultiplier === "function" ? getHomeIntensityMultiplier() : 1;
}

function startHomeEffects() {
  if (!homeFx || particleInterval) return;

  const intensity = getHomeIntensity();

  particleInterval = setInterval(spawnParticle, 350 / intensity);
  shootingStarInterval = setInterval(() => {
    spawnShootingStar();
    // gelegentlich eine zweite Sternschnuppe kurz danach für einen "Wow"-Moment
    if (Math.random() < 0.25) {
      setTimeout(spawnShootingStar, 200 + Math.random() * 300);
    }
  }, (3000 + Math.random() * 3000) / intensity);
}

// Wird von scripts/home/home-crack.js aufgerufen, wenn sich die
// Countdown-Stufe ändert, damit Partikel/Sternschnuppen sofort
// im neuen Tempo weiterlaufen (statt erst bei Seitenwechsel)
function restartHomeEffectsIntensity() {
  if (!particleInterval) return; // Home-Effekte laufen gerade nicht - nichts zu tun
  stopHomeEffects();
  startHomeEffects();
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
   MUSIK
   Ausgelagert nach scripts/music/music-player.js
------------------------------------------------------ */

/* ------------------------------------------------------
   MENÜ SYSTEM
   (Klasse "open" muss zu style.css passen: .sidebar.open)
------------------------------------------------------ */
function openMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btn = document.querySelector(".menu-button");
  if (menu) menu.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
  if (btn) btn.classList.add("menu-open");
}

function closeMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btn = document.querySelector(".menu-button");
  if (menu) menu.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
  if (btn) btn.classList.remove("menu-open");
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
   AUDIO-AUSGABE FÜR CODES
   Spielt eine eigene Audio-Datei ab (deine Aufnahme oder
   eine mit einem beliebigen KI-Sprachtool erzeugte MP3),
   wenn der Code in codes-data.js ein "audio"-Feld hat.

   Fallback: falls kein "audio" hinterlegt ist, aber "speak: true"
   gesetzt ist, wird notfalls die (einfachere) Browser-Stimme
   genutzt - empfohlen ist aber immer eine eigene Audio-Datei.
------------------------------------------------------ */
function playCodeAudio(match) {
  if (match.audio) {
    const player = document.getElementById("code-audio-player");
    if (!player) return;

    player.src = match.audio;
    player.play().catch((err) => {
      console.warn("Audio konnte nicht abgespielt werden:", err);
    });
    return;
  }

  // Fallback ohne eigene Audio-Datei: einfache Browser-Sprachausgabe
  if (match.speak && "speechSynthesis" in window) {
    const text = match.speakText || match.message;
    const lang = typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE";

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
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

      playCodeAudio(match);

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
});
