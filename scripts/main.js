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

function spawnWhale() {
  if (!homeDynamic) return;

  const whale = document.createElement("div");
  const reverse = Math.random() < 0.5;

  whale.className = reverse ? "space-whale reverse" : "space-whale";
  whale.style.top = 15 + Math.random() * 55 + "%";

  whale.innerHTML = `
    <svg class="whale-svg" viewBox="-40 -55 300 150" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="whaleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#eaf8ff" stop-opacity=".9" />
          <stop offset="45%"  stop-color="#7ec8ff" stop-opacity=".75" />
          <stop offset="100%" stop-color="#1c6fd6" stop-opacity=".45" />
        </linearGradient>
        <filter id="whaleGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#whaleGlow)" fill="url(#whaleGrad)" stroke="#cfeaff" stroke-width="1" stroke-opacity=".6">
        <!-- Schwanzflosse, geschwungen wie leuchtende Lichtbahnen -->
        <g class="whale-tail" style="transform-origin: 20px 50px;">
          <path d="M20,50 C-2,42 -20,44 -42,38 C-20,52 -18,58 -34,72
                   C-14,62 0,64 18,58 C10,52 14,50 20,50 Z" />
          <path d="M16,55 C-4,58 -18,66 -30,80 C-10,72 6,68 22,62 Z"
                opacity=".55" />
        </g>

        <!-- Körper -->
        <g class="whale-body">
          <path d="M20,50
                   C8,22 55,-8 120,-10
                   C175,-11 218,4 240,28
                   C220,38 195,42 172,40
                   C160,58 128,70 92,68
                   C62,66 34,58 20,50 Z" />

          <!-- Großflügelige Brustflosse, wie eine leuchtende Schwinge -->
          <path d="M108,16 C68,-26 24,-48 -18,-42
                    C14,-18 34,8 58,26 C72,14 90,10 108,16 Z"
                opacity=".85" />

          <!-- Bauchfurchen als feine Linien -->
          <path d="M45,52 C70,62 100,64 128,58"
                fill="none" stroke="#eaf8ff" stroke-opacity=".35" stroke-width="1.2" />
          <path d="M50,58 C75,66 100,68 122,63"
                fill="none" stroke="#eaf8ff" stroke-opacity=".25" stroke-width="1" />

          <circle class="whale-eye" cx="205" cy="22" r="1.8" fill="#0a1428" />
        </g>

        <!-- Funkelnde Lichtpunkte auf dem Rücken, wie Biolumineszenz -->
        <circle class="whale-sparkle" cx="70" cy="4" r="1.4" />
        <circle class="whale-sparkle" cx="110" cy="-2" r="1.1" />
        <circle class="whale-sparkle" cx="150" cy="6" r="1.3" />
        <circle class="whale-sparkle" cx="185" cy="14" r="1" />
        <circle class="whale-sparkle" cx="45" cy="22" r="1" />
      </g>
    </svg>
  `;

  homeDynamic.appendChild(whale);

  setTimeout(() => whale.remove(), 18500);
}

let whaleInterval = null;

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

  // Erster Wal etwas verzögert, danach alle 25-45 Sekunden
  setTimeout(spawnWhale, 4000);
  whaleInterval = setInterval(spawnWhale, 25000 + Math.random() * 20000);
}

function stopHomeEffects() {
  clearInterval(particleInterval);
  clearInterval(shootingStarInterval);
  clearInterval(whaleInterval);
  particleInterval = null;
  shootingStarInterval = null;
  whaleInterval = null;

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
  if (menu) menu.classList.add("open");
}

function closeMenu() {
  const menu = document.getElementById("sidebar");
  if (menu) menu.classList.remove("open");
}

/* ------------------------------------------------------
   CODE SYSTEM
   Vergleicht die Eingabe mit der Liste in codes-data.js
------------------------------------------------------ */
function checkCode() {
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

  const enteredCode = input.value.trim().toLowerCase();

  if (!enteredCode) {
    return;
  }

  const match = codes.find(
    (entry) => entry.code.toLowerCase() === enteredCode
  );

  messageEl.classList.remove("code-success", "code-error");

  if (match) {
    messageEl.textContent = match.message;
    messageEl.classList.add("code-success");

    if (match.image && imageEl) {
      imageEl.src = match.image;
      imageEl.classList.add("visible");
    } else if (imageEl) {
      imageEl.classList.remove("visible");
      imageEl.removeAttribute("src");
    }
  } else {
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
