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
    <svg class="whale-svg" viewBox="-30 -10 250 90" xmlns="http://www.w3.org/2000/svg">
      <g class="whale-tail" style="transform-origin: 10px 45px;">
        <path d="M10,45 C-5,32 -22,28 -30,20 C-24,38 -24,38 -20,45 C-24,52 -24,52 -30,70 C-22,62 -5,58 10,45 Z" />
      </g>
      <g class="whale-body">
        <path d="M10,45
                 C14,22 46,6 96,5
                 C150,4 196,16 218,36
                 C202,42 178,45 156,44
                 C148,56 126,66 98,66
                 C72,66 46,60 26,52
                 C18,50 12,49 10,45 Z" />
        <path class="whale-fin" d="M128,10 C132,-2 140,-8 146,-9 C142,0 138,8 132,13 Z" />
        <path class="whale-pectoral" d="M90,50 C86,62 78,70 68,74 C74,62 78,54 84,48 Z" />
        <circle class="whale-eye" cx="188" cy="28" r="1.6" />
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
