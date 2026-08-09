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
   HOME HINTERGRUND-ANIMATION (Canvas)
   Kino-reifer Sternenhimmel: mehrere Parallax-Ebenen aus
   twinkelnden Sternen, langsam driftende Nebel-Wolken und
   gelegentliche Kometen mit Leuchtspur. Nur aktiv solange
   man auf der Home/Countdown-Seite ist.
------------------------------------------------------ */
const homeFx = document.getElementById("home-fx");

let homeCanvas = null;
let homeCtx = null;
let homeAnimationFrame = null;
let homeEffectsRunning = false;
let homeResizeHandler = null;
let homeCometTimeout = null;

let homeStars = [];
let homeNebulae = [];
let homeComets = [];

const HOME_STAR_COLORS = ["#ffffff", "#bcdfff", "#c9a4ff", "#8fd9ff"];
const HOME_NEBULA_COLORS = ["rgba(77,163,255,.16)", "rgba(145,70,255,.14)", "rgba(255,110,196,.10)"];

function getHomeIntensity() {
  return typeof getHomeIntensityMultiplier === "function" ? getHomeIntensityMultiplier() : 1;
}

function setupHomeCanvas() {
  if (!homeFx) return false;

  if (!homeCanvas) {
    homeCanvas = document.createElement("canvas");
    homeCanvas.className = "home-canvas";
    homeFx.appendChild(homeCanvas);
    homeCtx = homeCanvas.getContext("2d");
  }

  resizeHomeCanvas();
  return true;
}

function resizeHomeCanvas() {
  if (!homeCanvas || !homeFx) return;

  homeCanvas.width = homeFx.clientWidth;
  homeCanvas.height = homeFx.clientHeight;
  buildHomeStarfield();
  buildHomeNebulae();
}

function buildHomeStarfield() {
  if (!homeCanvas) return;
  const area = homeCanvas.width * homeCanvas.height;
  const density = Math.min(220, Math.max(90, Math.floor(area / 9000)));

  homeStars = new Array(density).fill(0).map(() => ({
    x: Math.random() * homeCanvas.width,
    y: Math.random() * homeCanvas.height,
    layer: Math.random(), // 0 = weit weg/klein/langsam, 1 = nah/groß/schnell
    radius: 0,
    phase: Math.random() * Math.PI * 2,
    color: HOME_STAR_COLORS[Math.floor(Math.random() * HOME_STAR_COLORS.length)],
  })).map((star) => ({
    ...star,
    radius: 0.5 + star.layer * 1.6,
  }));
}

function buildHomeNebulae() {
  if (!homeCanvas) return;

  homeNebulae = HOME_NEBULA_COLORS.map((color, i) => ({
    baseX: (0.2 + i * 0.3) * homeCanvas.width,
    baseY: (0.25 + (i % 2) * 0.4) * homeCanvas.height,
    radius: homeCanvas.width * (0.35 + i * 0.08),
    color,
    angle: Math.random() * Math.PI * 2,
    speed: 0.00025 + i * 0.00008,
  }));
}

function spawnHomeComet() {
  if (!homeCanvas) return;

  homeComets.push({
    x: homeCanvas.width * (0.55 + Math.random() * 0.4),
    y: homeCanvas.height * Math.random() * 0.35,
    vx: -(9 + Math.random() * 6),
    vy: 4 + Math.random() * 3,
    life: 0,
    maxLife: 55 + Math.random() * 20,
    color: HOME_STAR_COLORS[Math.floor(Math.random() * HOME_STAR_COLORS.length)],
  });

  const intensity = getHomeIntensity();
  clearTimeout(homeCometTimeout);
  homeCometTimeout = setTimeout(spawnHomeComet, (3200 + Math.random() * 3800) / intensity);
}

/* ------------------------------------------------------
   AUDIO-REAKTIVITÄT
   Verbindet sich einmalig per Web Audio API mit dem
   Hintergrund-Musikplayer (#bg-music) und liefert ein
   geglättetes 0..1 Pegelsignal. Damit pulsieren Sternenglanz,
   Piratenschiff-Laterne und Countdown im Takt der Musik mit.
   Bricht die Musikwiedergabe NIE ab, falls etwas schiefgeht.
------------------------------------------------------ */
let audioCtx = null;
let audioAnalyser = null;
let audioDataArray = null;
let audioLevelSmoothed = 0;
let audioSetupAttempted = false;

function setupAudioReactivity() {
  if (audioSetupAttempted) return;
  audioSetupAttempted = true;

  const bgMusicEl = document.getElementById("bg-music");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!bgMusicEl || !AudioContextClass) return;

  try {
    audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaElementSource(bgMusicEl);
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 64;
    audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);

    // WICHTIG: ohne diese Verbindung zum Ausgang bliebe die Musik stumm
    source.connect(audioAnalyser);
    audioAnalyser.connect(audioCtx.destination);
  } catch (err) {
    console.warn("Audio-Reaktivität konnte nicht initialisiert werden:", err);
    audioCtx = null;
    audioAnalyser = null;
  }
}

// Manche Browser starten den AudioContext gesperrt, bis der Mensch klickt
document.addEventListener("click", () => {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
});

function getAudioLevel() {
  if (!audioAnalyser || !audioDataArray) return 0;

  audioAnalyser.getByteFrequencyData(audioDataArray);
  let sum = 0;
  for (let i = 0; i < audioDataArray.length; i++) sum += audioDataArray[i];
  const avg = sum / audioDataArray.length / 255;

  // sanft glätten, damit die Effekte nicht hektisch flackern
  audioLevelSmoothed += (avg - audioLevelSmoothed) * 0.15;
  return audioLevelSmoothed;
}

function applyAudioReactiveUI(level) {
  const heroTitle = document.querySelector(".hero h1");
  const timeBoxes = document.querySelectorAll(".time-box");

  if (heroTitle) {
    heroTitle.style.filter = `brightness(${(1 + level * 0.4).toFixed(3)})`;
    heroTitle.style.textShadow = `0 0 ${Math.round(40 + level * 55)}px #4da3ff`;
  }

  timeBoxes.forEach((box) => {
    box.style.boxShadow = `0 0 ${Math.round(10 + level * 40)}px rgba(77,163,255,${(0.25 + level * 0.55).toFixed(2)})`;
    box.style.transform = `scale(${(1 + level * 0.04).toFixed(3)})`;
  });
}

/* ------------------------------------------------------
   PIRATENSCHIFF
   Segelt langsam über den Horizont am unteren Rand des
   Sternenhimmels, mit sanftem Wellengang und einer Laterne,
   die im Takt der Musik heller/dunkler flackert.
------------------------------------------------------ */
const homeShip = { x: 0, active: false };

function initHomeShip() {
  if (!homeCanvas) return;
  if (!homeShip.active) {
    homeShip.x = homeCanvas.width + 220;
    homeShip.active = true;
  }
}

function drawHomeShip(time, level) {
  if (!homeCtx || !homeCanvas || !homeShip.active) return;

  const y = homeCanvas.height * 0.86;
  const bob = Math.sin(time / 850) * 5;

  homeCtx.save();
  homeCtx.translate(homeShip.x, y + bob);
  homeCtx.rotate(Math.sin(time / 1400) * 0.02);

  homeCtx.fillStyle = "rgba(8, 11, 24, 0.92)";

  // Rumpf
  homeCtx.beginPath();
  homeCtx.moveTo(-72, 0);
  homeCtx.quadraticCurveTo(-78, 24, -48, 28);
  homeCtx.lineTo(48, 28);
  homeCtx.quadraticCurveTo(78, 24, 72, 0);
  homeCtx.closePath();
  homeCtx.fill();

  // Mast
  homeCtx.fillRect(-2, -92, 4, 92);

  // Hauptsegel
  homeCtx.beginPath();
  homeCtx.moveTo(2, -90);
  homeCtx.quadraticCurveTo(40, -58, 2, -18);
  homeCtx.closePath();
  homeCtx.fill();

  // Vordersegel
  homeCtx.beginPath();
  homeCtx.moveTo(-2, -70);
  homeCtx.quadraticCurveTo(-32, -48, -2, -24);
  homeCtx.closePath();
  homeCtx.fill();

  // Flagge
  homeCtx.beginPath();
  homeCtx.moveTo(0, -92);
  homeCtx.lineTo(16 + Math.sin(time / 300) * 3, -87);
  homeCtx.lineTo(0, -82);
  homeCtx.closePath();
  homeCtx.fill();

  // Laterne am Heck, flackert mit der Musik mit
  const lanternGlow = 0.55 + level * 0.45;
  homeCtx.beginPath();
  homeCtx.arc(58, 6, 3 + level * 3, 0, Math.PI * 2);
  homeCtx.fillStyle = `rgba(255,196,110,${lanternGlow.toFixed(2)})`;
  homeCtx.shadowColor = "rgba(255,190,110,.9)";
  homeCtx.shadowBlur = 10 + level * 22;
  homeCtx.fill();
  homeCtx.shadowBlur = 0;

  homeCtx.restore();

  homeShip.x -= 0.3 + level * 0.35;
  if (homeShip.x < -220) {
    homeShip.x = homeCanvas.width + 220;
  }
}

function drawHomeFrame(time) {
  if (!homeCtx || !homeCanvas) return;

  const audioLevel = getAudioLevel();

  homeCtx.clearRect(0, 0, homeCanvas.width, homeCanvas.height);

  // Nebel-Wolken, langsam auf leichten Kreisbahnen driftend - werden
  // im Takt der Musik etwas kräftiger
  homeNebulae.forEach((n) => {
    n.angle += n.speed;
    const x = n.baseX + Math.cos(n.angle) * 60;
    const y = n.baseY + Math.sin(n.angle) * 40;

    const gradient = homeCtx.createRadialGradient(x, y, 0, x, y, n.radius * (1 + audioLevel * 0.08));
    gradient.addColorStop(0, n.color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    homeCtx.fillStyle = gradient;
    homeCtx.fillRect(0, 0, homeCanvas.width, homeCanvas.height);
  });

  // Twinkelnde Sterne mit Parallax-Drift, Helligkeit reagiert auf die Musik
  homeStars.forEach((star) => {
    const twinkle = 0.55 + Math.sin(time / 900 + star.phase) * 0.45;
    star.x -= 0.02 + star.layer * 0.06;
    if (star.x < -5) star.x = homeCanvas.width + 5;

    homeCtx.globalAlpha = Math.max(0, Math.min(1, twinkle + audioLevel * 0.3));
    homeCtx.fillStyle = star.color;
    homeCtx.shadowColor = star.color;
    homeCtx.shadowBlur = star.radius * (3 + audioLevel * 2.5);
    homeCtx.beginPath();
    homeCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    homeCtx.fill();
  });
  homeCtx.globalAlpha = 1;
  homeCtx.shadowBlur = 0;

  // Kometen mit ausblassender Leuchtspur
  homeComets = homeComets.filter((c) => c.life < c.maxLife);
  homeComets.forEach((c) => {
    c.x += c.vx;
    c.y += c.vy;
    c.life++;

    const fade = 1 - c.life / c.maxLife;
    const tailX = c.x - c.vx * 6;
    const tailY = c.y - c.vy * 6;

    const grad = homeCtx.createLinearGradient(c.x, c.y, tailX, tailY);
    grad.addColorStop(0, `rgba(255,255,255,${fade})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");

    homeCtx.strokeStyle = grad;
    homeCtx.lineWidth = 2.5;
    homeCtx.shadowColor = c.color;
    homeCtx.shadowBlur = 14;
    homeCtx.beginPath();
    homeCtx.moveTo(c.x, c.y);
    homeCtx.lineTo(tailX, tailY);
    homeCtx.stroke();
    homeCtx.shadowBlur = 0;
  });

  drawHomeShip(time, audioLevel);
  applyAudioReactiveUI(audioLevel);

  if (homeEffectsRunning) homeAnimationFrame = requestAnimationFrame(drawHomeFrame);
}

function startHomeEffects() {
  if (homeEffectsRunning) return;
  if (!setupHomeCanvas()) return;

  setupAudioReactivity();
  initHomeShip();

  homeEffectsRunning = true;
  drawHomeFrame(0);

  const intensity = getHomeIntensity();
  clearTimeout(homeCometTimeout);
  homeCometTimeout = setTimeout(spawnHomeComet, 1200 / intensity);

  if (!homeResizeHandler) {
    homeResizeHandler = () => resizeHomeCanvas();
    window.addEventListener("resize", homeResizeHandler);
  }
}

// Wird von scripts/home/home-crack.js aufgerufen, wenn sich die
// Countdown-Stufe ändert, damit Partikel/Sternschnuppen sofort
// im neuen Tempo weiterlaufen (statt erst bei Seitenwechsel)
function restartHomeEffectsIntensity() {
  if (!homeEffectsRunning) return; // Home-Effekte laufen gerade nicht - nichts zu tun
  stopHomeEffects();
  startHomeEffects();
}

function stopHomeEffects() {
  homeEffectsRunning = false;
  cancelAnimationFrame(homeAnimationFrame);
  clearTimeout(homeCometTimeout);
  homeCometTimeout = null;
  homeComets = [];

  const heroTitle = document.querySelector(".hero h1");
  if (heroTitle) {
    heroTitle.style.filter = "";
    heroTitle.style.textShadow = "";
  }
  document.querySelectorAll(".time-box").forEach((box) => {
    box.style.boxShadow = "";
    box.style.transform = "";
  });

  if (homeCtx && homeCanvas) homeCtx.clearRect(0, 0, homeCanvas.width, homeCanvas.height);
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
    messageEl.textContent = typeof t === "function" ? t("code.notReady") : "⚠️ Code-System ist noch nicht bereit.";
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    return;
  }

  const now = Date.now();
  if (now < codeLockedUntil) {
    const waitSeconds = Math.ceil((codeLockedUntil - now) / 1000);
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    messageEl.textContent =
      typeof tFormat === "function"
        ? tFormat("code.tooManyAttempts", { seconds: waitSeconds })
        : `⏳ Zu viele Fehlversuche – warte noch ${waitSeconds} Sekunde(n).`;
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
      messageEl.textContent = typeof t === "function" ? t("code.alreadyRedeemed") : "✅ Diesen Code hast du bereits eingelöst.";

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
        : typeof t === "function" ? t("code.invalid") : "Dieser Code ist ungültig.";
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
