/* ======================================================
   MAIN WEBSITE SYSTEM
====================================================== */

/* ------------------------------------------------------
   SEITENWECHSEL
------------------------------------------------------ */
function changePage(pageID) {
  // VOR dem Umschalten merken, wo der Fokus war: sobald die alte Seite
  // auf display:none geht, setzt der Browser den Fokus von selbst auf
  // <body> zurueck - danach liesse sich nicht mehr feststellen, ob der
  // Nutzer gerade in einem Feld getippt hat.
  const fokusVorher = document.activeElement;

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

  if (typeof updateShipRepairPage === "function") {
    updateShipRepairPage(pageID);
  }

  if (typeof updateTournamentPage === "function") {
    updateTournamentPage(pageID);
  }

  if (typeof updateGatewayPage === "function") {
    updateGatewayPage(pageID);
  }

  if (typeof updateSpielothekPage === "function") {
    updateSpielothekPage(pageID);
  }

  if (typeof updateCodeAmbientPage === "function") {
    updateCodeAmbientPage(pageID);
  }

  if (typeof updateCodeHistoryPage === "function") {
    updateCodeHistoryPage(pageID);
  }

  if (typeof updateCommunityBossPage === "function") {
    updateCommunityBossPage(pageID);
  }

  if (typeof updateShopPage === "function") {
    updateShopPage(pageID);
  }

  // Der Dublonenstand steht seit dem 1c-Umbau auch in der Topbar und
  // ist damit auf JEDER Seite sichtbar - er muss also bei jedem
  // Wechsel nachgezogen werden, nicht mehr nur beim Betreten des
  // Shops. Die Funktion schreibt beide Anzeigen aus einer Abfrage.
  if (typeof refreshShopCurrencyDisplay === "function") {
    refreshShopCurrencyDisplay();
  }

  // Die Startseiten-Uebersicht zeigt Lesestand, Schatzrad, Rennen und
  // Codes. Wer von einer dieser Seiten zurueckkommt, soll den neuen
  // Stand sehen und nicht den vom Seitenaufruf.
  if (pageID === "home" && typeof fhRenderHomeDashboard === "function") {
    fhRenderHomeDashboard();
  }

  if (typeof updateRatingPage === "function") {
    updateRatingPage(pageID);
  }

  if (typeof updateCharactersPage === "function") {
    updateCharactersPage(pageID);
  }

  if (typeof updateLoginPage === "function") {
    updateLoginPage(pageID);
  }

  if (typeof updateDetectiveCasePage === "function") {
    updateDetectiveCasePage(pageID);
  }

  updateActiveNavHighlight(pageID);
  closeMenu();
  moveFocusToPage(pageID, fokusVorher);
}

/* ------------------------------------------------------
   FOKUS AUF DIE NEUE SEITE
   ---------------------------------------------------
   Nach einem Seitenwechsel blieb der Fokus auf <body>. Wer mit
   der Tastatur navigiert, landete beim naechsten Tab wieder ganz
   oben in der Navigation statt im Inhalt - und Screenreader
   bekamen vom Wechsel gar nichts mit, weil die Seite technisch
   nie neu geladen wird.

   Absichtlich nur bei einem ECHTEN Wechsel und ohne Scroll-
   Sprung (preventScroll), damit die Seite dabei nicht springt.
   Der Fokus geht auf <main id="fh-main">, nicht auf ein Element
   innerhalb der Seite - so bleibt die Tab-Reihenfolge danach die
   natuerliche.
------------------------------------------------------ */
let fhLastFocusedPage = null;

function moveFocusToPage(pageID, fokusVorher) {
  if (pageID === fhLastFocusedPage) return;
  fhLastFocusedPage = pageID;

  const main = document.getElementById("fh-main");
  if (!main) return;

  // Nicht dazwischenfunken, wenn der Nutzer in einem Feld getippt hat,
  // DAS ES NOCH GIBT - etwa weil das Feld ausserhalb der Seiten liegt.
  // Ein Feld auf der verlassenen Seite ist dagegen weg, dort waere ein
  // Fokus auf <body> das schlechtere Ergebnis.
  if (
    fokusVorher &&
    /^(INPUT|TEXTAREA|SELECT)$/.test(fokusVorher.tagName) &&
    fokusVorher.isConnected &&
    fokusVorher.offsetParent !== null
  ) {
    return;
  }

  try {
    main.focus({ preventScroll: true });
  } catch (err) {
    main.focus();
  }
}

/* ------------------------------------------------------
   AKTIVE SEITE IN DER NAVIGATION MARKIEREN
   Betrifft die feste Desktop-Sidebar UND die untere
   Tab-Leiste auf Mobile (beide nutzen dieselbe Klasse).
------------------------------------------------------ */
function updateActiveNavHighlight(pageID) {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.classList.toggle("fh-nav-active", el.dataset.page === pageID);
  });
}

/* ------------------------------------------------------
   FUNKEN-EFFEKT BEIM KLICK AUF EINEN MENUEPUNKT
   Ein Klick zuendet ein paar kleine Goldfunken direkt an der
   Klickposition - passend zum "Feuer"-Thema (dieselbe Farbsprache
   wie .fh-ember auf der Home-Seite), unabhaengig von changePage()
   selbst nutzbar. Ein EINZIGER delegierter Listener deckt alle drei
   Navigations-Oberflaechen ab (klassisches Hamburger-Menue, feste
   Desktop-Sidebar, mobile untere Tableiste), statt fuer jede Liste
   einen eigenen Handler zu brauchen.
------------------------------------------------------ */
(function initNavClickSparks() {
  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const SPARK_COUNT = 6;

  function spawnSparks(x, y) {
    if (reduceMotion.matches) return;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = document.createElement("span");
      spark.className = "fh-nav-spark";

      const angle = (Math.PI * 2 * i) / SPARK_COUNT + Math.random() * 0.5;
      const distance = 26 + Math.random() * 22;
      spark.style.setProperty("--fh-spark-x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--fh-spark-y", `${Math.sin(angle) * distance}px`);
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;

      document.body.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("#sidebar a, .fh-sidebar-nav a, .fh-bottom-nav a");
    if (!link) return;
    spawnSparks(e.clientX, e.clientY);
  });
})();

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

  // Bass-Bereich (die ersten paar Frequenzbänder) statt gesamtem
  // Spektrum - das macht die Reaktion viel spürbarer/rhythmischer,
  // näher am tatsächlichen Beat statt einem trägen Durchschnitt.
  const bassBins = Math.max(4, Math.floor(audioDataArray.length * 0.22));
  let sum = 0;
  for (let i = 0; i < bassBins; i++) sum += audioDataArray[i];
  const avg = sum / bassBins / 255;

  // Betonung: leise Stellen bleiben ruhig, laute Stellen schlagen
  // deutlich stärker aus
  const emphasized = Math.pow(avg, 1.4) * 1.6;

  // Schneller Attack (springt sofort mit hoch), langsamerer Release
  // (fällt sanft wieder ab) - fühlt sich "punchy" an statt trägem Mittelwert
  if (emphasized > audioLevelSmoothed) {
    audioLevelSmoothed += (emphasized - audioLevelSmoothed) * 0.55;
  } else {
    audioLevelSmoothed += (emphasized - audioLevelSmoothed) * 0.08;
  }

  return Math.min(1, audioLevelSmoothed);
}

function applyAudioReactiveUI(level) {
  const heroTitle = document.querySelector(".hero h1");
  const timeBoxes = document.querySelectorAll(".time-box");
  const heroBlock = document.querySelector(".hero");

  // Beim allerersten Hover eine Box freiräumen: der bisherige
  // Inline-Style (von den Frames davor) muss weg, sonst blockiert er
  // die CSS-":hover"-Regel weiterhin, obwohl wir unten aufhören ihn
  // neu zu setzen
  timeBoxes.forEach((box) => {
    if (box.dataset.hoverBound) return;
    box.dataset.hoverBound = "1";
    box.addEventListener("mouseenter", () => {
      box.style.boxShadow = "";
      box.style.transform = "";
    });
  });

  if (heroTitle) {
    heroTitle.style.filter = `brightness(${(1 + level * 0.9).toFixed(3)})`;
    heroTitle.style.textShadow = `0 0 ${Math.round(40 + level * 110)}px #4da3ff`;
  }

  if (heroBlock) {
    heroBlock.style.transform = `scale(${(1 + level * 0.035).toFixed(3)})`;
  }

  timeBoxes.forEach((box) => {
    // Box unterm Mauszeiger lassen wir in Ruhe, damit die CSS-Hover-
    // Animation (:hover { transform, box-shadow }) sichtbar bleibt -
    // sonst überschreibt dieser Style hier jeden Frame den Hover-Effekt
    if (box.matches(":hover")) return;

    box.style.boxShadow = `0 0 ${Math.round(10 + level * 75)}px rgba(77,163,255,${(0.25 + level * 0.7).toFixed(2)})`;
    box.style.transform = `scale(${(1 + level * 0.09).toFixed(3)})`;
  });
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

  drawHomeRipples();
  applyAudioReactiveUI(audioLevel);

  if (homeEffectsRunning) homeAnimationFrame = requestAnimationFrame(drawHomeFrame);
}

function startHomeEffects() {
  if (homeEffectsRunning) return;
  if (!setupHomeCanvas()) return;

  setupAudioReactivity();
  setupHomeTapEffect();

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

/* ------------------------------------------------------
   TIPP-/KLICK-EFFEKT AUF DEM HINTERGRUND
   Beim Antippen des Sternenhimmels gibt es, sofern das Gerät
   es unterstützt, eine kurze echte Vibration (navigator.vibrate
   - "haptisches" Feedback auf dem Handy) UND eine sichtbare,
   ausbreitende Ringwelle an der Tippstelle, für alle Geräte.
------------------------------------------------------ */
let homeRipples = [];
let homeTapListenerBound = false;

function spawnHomeRipple(x, y) {
  homeRipples.push({ x, y, life: 0, maxLife: 45 });

  if (navigator.vibrate) {
    navigator.vibrate(18);
  }
}

function drawHomeRipples() {
  if (!homeCtx) return;

  homeRipples = homeRipples.filter((r) => r.life < r.maxLife);
  homeRipples.forEach((r) => {
    r.life++;
    const progress = r.life / r.maxLife;
    const radius = progress * 90;
    const fade = 1 - progress;

    homeCtx.beginPath();
    homeCtx.arc(r.x, r.y, radius, 0, Math.PI * 2);
    homeCtx.strokeStyle = `rgba(255,255,255,${(fade * 0.55).toFixed(2)})`;
    homeCtx.lineWidth = 2.5 * fade + 0.5;
    homeCtx.shadowColor = "rgba(140,200,255,.8)";
    homeCtx.shadowBlur = 14 * fade;
    homeCtx.stroke();
    homeCtx.shadowBlur = 0;

    // zweiter, kleinerer Ring kurz dahinter für mehr "Wumms"
    if (progress > 0.15) {
      const innerProgress = Math.max(0, progress - 0.15);
      homeCtx.beginPath();
      homeCtx.arc(r.x, r.y, innerProgress * 90, 0, Math.PI * 2);
      homeCtx.strokeStyle = `rgba(255,255,255,${(fade * 0.35).toFixed(2)})`;
      homeCtx.lineWidth = 1.5;
      homeCtx.stroke();
    }
  });
}

function setupHomeTapEffect() {
  if (homeTapListenerBound || !homeFx) return;
  homeTapListenerBound = true;

  homeFx.addEventListener("pointerdown", (e) => {
    const rect = homeCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnHomeRipple(x, y);
  });
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
  homeRipples = [];

  const heroTitle = document.querySelector(".hero h1");
  if (heroTitle) {
    heroTitle.style.filter = "";
    heroTitle.style.textShadow = "";
  }
  const heroBlock = document.querySelector(".hero");
  if (heroBlock) {
    heroBlock.style.transform = "";
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
    } else if (match.currencyReward) {
      // Währungscodes (FIRE100/FIRE300/COINS300/BEUTEL25/KLEINERBEUTEL/...):
      // ERST die atomare, server-verifizierte Transaktion abwarten - NUR
      // bei bestätigtem Erfolg gilt der Code als eingelöst. Vorher wurde
      // hier sofort lokal "eingelöst" markiert UND unabhängig davon
      // versucht, Dublonen gutzuschreiben; schlug Letzteres fehl, zeigte
      // die Seite trotzdem Erfolg, aber es kamen nie Dublonen an und der
      // Code ließ sich nie wieder versuchen (siehe redeemCurrencyCode()
      // in wheel.js für die genaue Erklärung).
      if (typeof redeemCurrencyCode !== "function") {
        messageEl.classList.remove("code-success");
        messageEl.classList.add("code-error");
        messageEl.textContent = "⚠️ Code-System ist noch nicht bereit.";
        return;
      }

      try {
        await redeemCurrencyCode(codeId, match.currencyReward, match.avatarUnlockSecure || null);
      } catch (err) {
        if (err.message === "already-redeemed") {
          if (typeof markCodeCrackedLocally === "function") {
            markCodeCrackedLocally(codeId, match.reward || null);
          }
          messageEl.textContent = typeof t === "function" ? t("code.alreadyRedeemed") : "✅ Diesen Code hast du bereits eingelöst.";
        } else {
          console.warn("Code konnte nicht eingelöst werden:", err);
          messageEl.classList.remove("code-success");
          messageEl.classList.add("code-error");
          messageEl.textContent = "⚠️ Das hat nicht geklappt, bitte versuch's gleich nochmal.";
        }
        return;
      }

      // Schreibvorgang bestätigt erfolgreich - jetzt erst lokal markieren
      // (das atomare Supabase-UPDATE hat codes_cracked bereits mit
      // erhöht, deshalb NUR die lokale Buchhaltung, nicht recordCodeCrack()
      // mit seinem eigenen, zusätzlichen Datenbank-Schreibvorgang).
      if (typeof markCodeCrackedLocally === "function") {
        markCodeCrackedLocally(codeId, match.reward || null);
      }

      messageEl.textContent = match.message;

      if (typeof addCodeHistoryEntry === "function") {
        addCodeHistoryEntry(enteredCode, match.message);
      }

      if (typeof refreshShopCurrencyDisplay === "function") {
        refreshShopCurrencyDisplay();
      }
      if (typeof showCurrencyToast === "function") {
        showCurrencyToast(match.currencyReward);
      }
      if (typeof triggerCodeSuccessEffect === "function") {
        triggerCodeSuccessEffect();
      }

      if (typeof awardActionXp === "function") awardActionXp("codeRedeemed");

      playCodeAudio(match);

      if (match.image && imageEl) {
        // Absicherung: laedt das Bild nicht (Datei fehlt, falscher Pfad,
        // kaputte Datei), soll KEIN zerbrochenes Bild-Symbol stehen
        // bleiben - dann bleibt nur die Nachricht. Genau das war bei
        // raetsel1.png der Fall, siehe Kommentar in codes-data.js.
        imageEl.onerror = () => {
          imageEl.classList.remove("visible");
          imageEl.removeAttribute("src");
          console.warn("Code-Bild konnte nicht geladen werden:", match.image);
        };
        imageEl.src = match.image;
        imageEl.classList.add("visible");
      } else if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    } else {
      messageEl.textContent = match.message;

      if (typeof addCodeHistoryEntry === "function") {
        addCodeHistoryEntry(enteredCode, match.message);
      }

      if (typeof recordCodeCrack === "function") {
        recordCodeCrack(codeId, match.reward || null);
      }

      if (match.avatarUnlock && typeof unlockAvatar === "function") {
        unlockAvatar(match.avatarUnlock);
      }

      if (match.toolUnlock && typeof unlockShipTool === "function") {
        unlockShipTool(match.toolUnlock);
      }

      if (typeof triggerCodeSuccessEffect === "function") {
        triggerCodeSuccessEffect();
      }

      if (typeof awardActionXp === "function") awardActionXp("codeRedeemed");

      playCodeAudio(match);

      if (match.image && imageEl) {
        // Absicherung: laedt das Bild nicht (Datei fehlt, falscher Pfad,
        // kaputte Datei), soll KEIN zerbrochenes Bild-Symbol stehen
        // bleiben - dann bleibt nur die Nachricht. Genau das war bei
        // raetsel1.png der Fall, siehe Kommentar in codes-data.js.
        imageEl.onerror = () => {
          imageEl.classList.remove("visible");
          imageEl.removeAttribute("src");
          console.warn("Code-Bild konnte nicht geladen werden:", match.image);
        };
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
