/* ======================================================
   MUSIK-PLAYER (eigenständig, robust)
   Spielt die Playlist aus scripts/music/music-data.js in
   Dauerschleife, solange die Home-Seite aktiv ist.

   Diese Datei ist bewusst komplett eigenständig (unabhängig
   von main.js), damit ein Fehler an anderer Stelle der Seite
   die Musik nie mehr lahmlegen kann. Zusätzlich mit:
   - Selbstheilung: falls eine Track-Datei fehlt/kaputt ist
     (Fehler 404 o.ä.), wird automatisch zum nächsten Song
     gesprungen statt dass die Musik komplett stehen bleibt
   - Regelmäßiger Kontroll-Check: falls die Musik eigentlich
     laufen sollte, aber aus irgendeinem Grund pausiert ist
     (z.B. Browser hat sie unterbrochen), wird automatisch
     versucht, sie wieder zu starten
   - Klarer manueller Start-Button funktioniert IMMER, auch
     wenn Autoplay vom Browser blockiert wurde
====================================================== */

(function () {
  let bgMusic = null;
  let musicToggle = null;

  let musicMuted = false;
  let pendingAutoplay = false;
  let currentTrackIndex = 0;
  let onHomePage = false;
  let watchdogInterval = null;

  function hasPlaylist() {
    return typeof musicPlaylist !== "undefined" && musicPlaylist.length > 0;
  }

  function loadTrack(index) {
    if (!bgMusic || !hasPlaylist()) return;

    currentTrackIndex = ((index % musicPlaylist.length) + musicPlaylist.length) % musicPlaylist.length;
    bgMusic.src = musicPlaylist[currentTrackIndex];
  }

  function attemptPlay() {
    if (!bgMusic || musicMuted) return;

    const playPromise = bgMusic.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          pendingAutoplay = false;
        })
        .catch(() => {
          // Autoplay vom Browser blockiert - wird beim nächsten
          // Klick irgendwo auf der Seite automatisch nachgeholt
          pendingAutoplay = true;
        });
    }
  }

  function playNextTrack() {
    if (!hasPlaylist()) return;
    loadTrack(currentTrackIndex + 1);
    attemptPlay();
  }

  function updateToggleIcon() {
    if (!musicToggle) return;
    musicToggle.textContent = musicMuted ? "🔇" : "🔊";
  }

  function updateMusicForPage(pageID) {
    if (!bgMusic) return;
    onHomePage = pageID === "home";

    if (!musicToggle) musicToggle = document.getElementById("music-toggle");

    if (onHomePage) {
      if (musicToggle) musicToggle.style.display = "flex";

      if (!bgMusic.src) {
        loadTrack(0);
      }

      attemptPlay();
      startWatchdog();
    } else {
      bgMusic.pause();
      if (musicToggle) musicToggle.style.display = "none";
      stopWatchdog();
    }
  }

  function toggleMusic() {
    if (!bgMusic) return;

    musicMuted = !musicMuted;
    updateToggleIcon();

    if (musicMuted) {
      bgMusic.pause();
    } else {
      if (!bgMusic.src) loadTrack(0);
      attemptPlay();
    }
  }

  /* ------------------------------------------------------
     KONTROLL-CHECK (Selbstheilung)
     Prüft alle paar Sekunden, ob die Musik eigentlich laufen
     sollte, aber aus irgendeinem Grund steht - und startet
     sie dann automatisch neu.
  ------------------------------------------------------ */
  function startWatchdog() {
    stopWatchdog();
    watchdogInterval = setInterval(() => {
      if (!onHomePage || musicMuted || !bgMusic) return;
      if (bgMusic.paused && !pendingAutoplay) {
        attemptPlay();
      }
    }, 4000);
  }

  function stopWatchdog() {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }

  function init() {
    bgMusic = document.getElementById("bg-music");
    musicToggle = document.getElementById("music-toggle");
    if (!bgMusic) return;

    bgMusic.addEventListener("ended", playNextTrack);

    // Falls eine Track-Datei fehlt oder kaputt ist: automatisch
    // zum nächsten Song springen, statt dass alles stehen bleibt
    bgMusic.addEventListener("error", () => {
      if (onHomePage) playNextTrack();
    });

    updateToggleIcon();
  }

  // Fallback: Falls Autoplay blockiert wurde, springt die Musik
  // beim allerersten Klick irgendwo auf der Seite an
  document.addEventListener("click", () => {
    if (pendingAutoplay && !musicMuted && onHomePage) {
      attemptPlay();
    }
  });

  window.addEventListener("DOMContentLoaded", init);

  // Global verfügbar machen, damit main.js/HTML sie aufrufen können
  window.updateMusicForPage = updateMusicForPage;
  window.toggleMusic = toggleMusic;
})();
