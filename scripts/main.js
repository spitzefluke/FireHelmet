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
  closeMenu();
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

    if (!bgMusic.src) {
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
