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
   Läuft nur auf der Home/Countdown-Seite, überall sonst
   wird pausiert. Browser blockieren Autoplay mit Ton oft,
   bis der Nutzer einmal irgendwo geklickt hat – daher der
   Fallback über "pendingAutoplay".
------------------------------------------------------ */
const bgMusic = document.getElementById("bg-music");
const musicToggle = document.getElementById("music-toggle");

let musicMuted = false;
let pendingAutoplay = false;

function updateMusicForPage(pageID) {
  if (!bgMusic) return;

  if (pageID === "home") {
    musicToggle.style.display = "flex";

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
  } else {
    messageEl.textContent = codeNotFoundMessage;
    messageEl.classList.add("code-error");
  }

  input.value = "";
}

/* ------------------------------------------------------
   START
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  changePage("home");
});
