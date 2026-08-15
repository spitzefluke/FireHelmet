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

  if (typeof updateCommunityBossPage === "function") {
    updateCommunityBossPage(pageID);
  }

  if (typeof updateShopPage === "function") {
    updateShopPage(pageID);
  }

  if (typeof updateRatingPage === "function") {
    updateRatingPage(pageID);
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

  updateActiveNavHighlight(pageID);
  closeMenu();
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

/* ------------------------------------------------------
   PIRATENSCHIFF
   Detailreiche Silhouette mit zwei Masten, Rigg-Seilen,
   Krähennest, Bugspriet-Segel, Totenkopf-Flagge, leuchtenden
   Bullaugen und einer Kielwasser-Spur. Reagiert auf die Musik
   (Laternen-/Bullaugen-Glühen, Fahrtgeschwindigkeit).
------------------------------------------------------ */
const homeShip = { x: 0, active: false };
let homeShipWake = [];
let homeShipWakeTimer = 0;

function initHomeShip() {
  if (!homeCanvas) return;
  if (!homeShip.active) {
    homeShip.x = homeCanvas.width + 280;
    homeShip.active = true;
  }
}

function drawSail(ctx, x, topY, bottomY, curve, flutter) {
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.quadraticCurveTo(x + curve + flutter, (topY + bottomY) / 2, x, bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHomeShip(time, level) {
  if (!homeCtx || !homeCanvas || !homeShip.active) return;

  const y = homeCanvas.height * 0.86;
  const bob = Math.sin(time / 850) * 5;
  const tilt = Math.sin(time / 1400) * 0.02;
  const wind = Math.sin(time / 260);
  const lanternGlow = 0.55 + level * 0.45;

  // Das Schiff fährt nach LINKS (homeShip.x nimmt ab) - der Bug (die
  // Vorderseite mit Bugspriet) muss also links liegen. Alles wird lokal
  // mit Bug rechts (x>0) und Heck links (x<0) gezeichnet, dann am Ende
  // per ctx.scale(-1,1) gespiegelt, damit der Bug wirklich in Fahrt-
  // richtung zeigt.
  const sternWorldX = homeShip.x + 80; // Heck, für Kielwasser + Laternen-Reflexion

  // Mond-Halo hinter dem Schiff für dramatische Silhouette
  const haloGrad = homeCtx.createRadialGradient(homeShip.x, y - 40, 10, homeShip.x, y - 40, 140);
  haloGrad.addColorStop(0, `rgba(255,244,214,${(0.1 + level * 0.14).toFixed(2)})`);
  haloGrad.addColorStop(1, "rgba(255,244,214,0)");
  homeCtx.fillStyle = haloGrad;
  homeCtx.beginPath();
  homeCtx.arc(homeShip.x, y - 40, 140, 0, Math.PI * 2);
  homeCtx.fill();

  // Kielwasser: startet jetzt korrekt am Heck und driftet dahinter aus
  homeShipWakeTimer++;
  if (homeShipWakeTimer % 4 === 0) {
    homeShipWake.push({ x: sternWorldX, y: y + 27 + bob, life: 0, maxLife: 75 });
  }
  homeShipWake = homeShipWake.filter((w) => w.life < w.maxLife);
  homeShipWake.forEach((w) => {
    w.life++;
    w.x += 0.25;
    const fade = 1 - w.life / w.maxLife;
    homeCtx.beginPath();
    homeCtx.arc(w.x, w.y + Math.sin(w.life / 6) * 1.5, 1.5 + w.life * 0.05, 0, Math.PI * 2);
    homeCtx.fillStyle = `rgba(190,220,255,${(fade * 0.35).toFixed(2)})`;
    homeCtx.fill();
  });

  // Laternenschein-Pfütze auf dem Wasser hinterm Heck
  const reflectGrad = homeCtx.createRadialGradient(sternWorldX, y + 30, 2, sternWorldX, y + 30, 26);
  reflectGrad.addColorStop(0, `rgba(255,196,110,${(lanternGlow * 0.22).toFixed(2)})`);
  reflectGrad.addColorStop(1, "rgba(255,196,110,0)");
  homeCtx.fillStyle = reflectGrad;
  homeCtx.beginPath();
  homeCtx.ellipse(sternWorldX, y + 30, 26, 8, 0, 0, Math.PI * 2);
  homeCtx.fill();

  homeCtx.save();
  homeCtx.translate(homeShip.x, y + bob);
  homeCtx.rotate(tilt);
  homeCtx.scale(-1, 1); // Bug zeigt jetzt in Fahrtrichtung (nach links)

  const hullFill = "rgba(6, 9, 20, 0.95)";
  homeCtx.strokeStyle = "rgba(90, 120, 200, 0.4)";
  homeCtx.lineWidth = 1;

  // Wasser-Spiegelung: schwacher, gestauchter Umriss des Rumpfs unter
  // der Wasserlinie
  homeCtx.save();
  homeCtx.scale(1, -0.35);
  homeCtx.translate(0, 44);
  homeCtx.globalAlpha = 0.18;
  homeCtx.beginPath();
  homeCtx.moveTo(-78, 6);
  homeCtx.quadraticCurveTo(-84, 26, -50, 30);
  homeCtx.lineTo(50, 30);
  homeCtx.quadraticCurveTo(84, 26, 78, 6);
  homeCtx.closePath();
  homeCtx.fillStyle = hullFill;
  homeCtx.fill();
  homeCtx.restore();
  homeCtx.globalAlpha = 1;

  // Rumpf mit Verlaufsschattierung (oben heller/beleuchtet, unten dunkel)
  const hullGrad = homeCtx.createLinearGradient(0, -4, 0, 30);
  hullGrad.addColorStop(0, "rgba(38, 46, 74, 0.95)");
  hullGrad.addColorStop(0.4, "rgba(10, 13, 26, 0.95)");
  hullGrad.addColorStop(1, "rgba(3, 4, 9, 0.97)");

  homeCtx.beginPath();
  homeCtx.moveTo(-78, 6);
  homeCtx.quadraticCurveTo(-84, 26, -50, 30);
  homeCtx.lineTo(50, 30);
  homeCtx.quadraticCurveTo(84, 26, 78, 6);
  homeCtx.quadraticCurveTo(40, -2, 0, 0);
  homeCtx.quadraticCurveTo(-40, -2, -78, 6);
  homeCtx.closePath();
  homeCtx.fillStyle = hullGrad;
  homeCtx.fill();
  homeCtx.stroke();

  // Planken-Linien für Holz-Textur-Andeutung
  homeCtx.strokeStyle = "rgba(0,0,0,.35)";
  homeCtx.lineWidth = .6;
  [11, 17, 23].forEach((py) => {
    homeCtx.beginPath();
    homeCtx.moveTo(-74, py);
    homeCtx.lineTo(74, py);
    homeCtx.stroke();
  });
  homeCtx.strokeStyle = "rgba(90, 120, 200, 0.4)";
  homeCtx.lineWidth = 1;

  // Kanonen-Rohre entlang der Bordwand
  homeCtx.fillStyle = "rgba(15,15,18,.95)";
  [-52, -26, 20, 44].forEach((cx) => {
    homeCtx.beginPath();
    homeCtx.roundRect ? homeCtx.roundRect(cx - 1.4, 6, 2.8, 8, 1) : homeCtx.rect(cx - 1.4, 6, 2.8, 8);
    homeCtx.fill();
  });

  // Achterkastell (erhöhtes Heck)
  const aftGrad = homeCtx.createLinearGradient(-88, -18, -46, 4);
  aftGrad.addColorStop(0, "rgba(30, 36, 60, 0.95)");
  aftGrad.addColorStop(1, "rgba(8, 10, 20, 0.95)");
  homeCtx.beginPath();
  homeCtx.moveTo(-78, 6);
  homeCtx.quadraticCurveTo(-88, -14, -66, -18);
  homeCtx.lineTo(-46, -14);
  homeCtx.lineTo(-46, 4);
  homeCtx.closePath();
  homeCtx.fillStyle = aftGrad;
  homeCtx.fill();
  homeCtx.stroke();

  // Heck-Laterne, hängt am Achterkastell, flackert mit der Musik
  homeCtx.beginPath();
  homeCtx.arc(-70, -6, 2.2 + level * 1.5, 0, Math.PI * 2);
  homeCtx.fillStyle = `rgba(255,206,130,${lanternGlow.toFixed(2)})`;
  homeCtx.shadowColor = "rgba(255,190,110,.95)";
  homeCtx.shadowBlur = 12 + level * 20;
  homeCtx.fill();
  homeCtx.shadowBlur = 0;

  // Bullaugen, leuchten im Takt der Musik
  [-64, -38, -14, 12].forEach((bx) => {
    homeCtx.beginPath();
    homeCtx.arc(bx, 14, 2.3, 0, Math.PI * 2);
    homeCtx.fillStyle = `rgba(255,196,110,${(lanternGlow * 0.8).toFixed(2)})`;
    homeCtx.shadowColor = "rgba(255,190,110,.9)";
    homeCtx.shadowBlur = 6 + level * 12;
    homeCtx.fill();
  });
  homeCtx.shadowBlur = 0;
  homeCtx.beginPath();
  [-64, -38, -14, 12].forEach((bx) => {
    homeCtx.moveTo(bx + 2.3, 14);
    homeCtx.arc(bx, 14, 2.3, 0, Math.PI * 2);
  });
  homeCtx.strokeStyle = "rgba(255,230,180,.5)";
  homeCtx.lineWidth = .5;
  homeCtx.stroke();
  homeCtx.strokeStyle = "rgba(90, 120, 200, 0.4)";
  homeCtx.lineWidth = 1;

  // Bugspriet mit kleinem Focksegel
  homeCtx.beginPath();
  homeCtx.moveTo(74, 2);
  homeCtx.lineTo(104, -10);
  homeCtx.lineTo(74, -6);
  homeCtx.closePath();
  homeCtx.fillStyle = hullFill;
  homeCtx.fill();
  homeCtx.stroke();

  homeCtx.fillStyle = "rgba(210, 205, 190, 0.9)";
  drawSail(homeCtx, 88, -8, 4, 16 + wind * 4, 0);

  // Hauptmast (hinten, groß) + Focksegel-Mast (vorne, kleiner)
  const masts = [
    { x: -18, height: 112, sailW: 46, flag: true, net: true },
    { x: 34, height: 80, sailW: 32, flag: false, net: false },
  ];

  // Rigg-Netz zwischen den beiden Masten
  homeCtx.strokeStyle = "rgba(90,110,150,.22)";
  homeCtx.lineWidth = .6;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    homeCtx.beginPath();
    homeCtx.moveTo(-18, -112 + t * 60);
    homeCtx.lineTo(34, -80 + t * 40);
    homeCtx.stroke();
  }

  masts.forEach((m) => {
    homeCtx.fillStyle = hullFill;
    homeCtx.fillRect(m.x - 2, -m.height, 4, m.height + 4);

    // Rigg-Seilen vom Mast-Top zum Deck
    homeCtx.strokeStyle = "rgba(90,110,150,.25)";
    homeCtx.lineWidth = .7;
    [-1, 1].forEach((dir) => {
      homeCtx.beginPath();
      homeCtx.moveTo(m.x, -m.height);
      homeCtx.lineTo(m.x + dir * 22, 4);
      homeCtx.stroke();
    });
    homeCtx.strokeStyle = "rgba(90, 120, 200, 0.4)";
    homeCtx.lineWidth = 1;

    // Krähennest oben auf dem Hauptmast
    if (m.net) {
      homeCtx.beginPath();
      homeCtx.ellipse(m.x, -m.height - 4, 7, 4, 0, 0, Math.PI * 2);
      homeCtx.fillStyle = hullFill;
      homeCtx.fill();
      homeCtx.stroke();
    }

    // Segel mit Wind-Flatter-Kurve + feinen Nahtlinien
    const flutter = wind * (3 + level * 3);
    homeCtx.fillStyle = "rgba(212, 207, 192, 0.92)";
    homeCtx.strokeStyle = "rgba(90, 120, 200, 0.35)";
    drawSail(homeCtx, m.x + 2, -m.height + 10, -14, m.sailW, flutter);
    drawSail(homeCtx, m.x - 2, -m.height * 0.55, -8, -m.sailW * 0.7, -flutter);

    homeCtx.strokeStyle = "rgba(120,110,90,.35)";
    homeCtx.lineWidth = .4;
    for (let i = 1; i <= 2; i++) {
      const seamY = -m.height + 10 + ((-14 - (-m.height + 10)) * i) / 3;
      homeCtx.beginPath();
      homeCtx.moveTo(m.x + 2, seamY);
      homeCtx.quadraticCurveTo(m.x + 2 + m.sailW * 0.6, seamY, m.x + 2 + flutter * 0.6, seamY);
      homeCtx.stroke();
    }

    homeCtx.fillStyle = hullFill;
  });

  // Totenkopf-Flagge auf dem Hauptmast
  const flagFlutter = 18 + wind * 5;
  homeCtx.beginPath();
  homeCtx.moveTo(-18, -112);
  homeCtx.quadraticCurveTo(-18 + flagFlutter * 0.6, -108, -18 + flagFlutter, -104);
  homeCtx.quadraticCurveTo(-18 + flagFlutter * 0.6, -100, -18, -96);
  homeCtx.closePath();
  homeCtx.fillStyle = hullFill;
  homeCtx.fill();

  // Totenkopf mit gekreuzten Knochen
  const skullX = -18 + flagFlutter * 0.45;
  const skullY = -104;
  homeCtx.fillStyle = "rgba(230,230,220,.9)";
  homeCtx.beginPath();
  homeCtx.arc(skullX, skullY, 2.4, 0, Math.PI * 2);
  homeCtx.fill();
  homeCtx.fillRect(skullX - 1.6, skullY + 1.6, 3.2, 1.6);
  homeCtx.strokeStyle = "rgba(230,230,220,.9)";
  homeCtx.lineWidth = .9;
  homeCtx.beginPath();
  homeCtx.moveTo(skullX - 3, skullY + 5);
  homeCtx.lineTo(skullX + 3, skullY + 8.5);
  homeCtx.moveTo(skullX + 3, skullY + 5);
  homeCtx.lineTo(skullX - 3, skullY + 8.5);
  homeCtx.stroke();

  homeCtx.restore();

  homeShip.x -= 0.3 + level * 0.35;
  if (homeShip.x < -280) {
    homeShip.x = homeCanvas.width + 280;
    homeShipWake = [];
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
  drawHomeRipples();
  applyAudioReactiveUI(audioLevel);

  if (homeEffectsRunning) homeAnimationFrame = requestAnimationFrame(drawHomeFrame);
}

function startHomeEffects() {
  if (homeEffectsRunning) return;
  if (!setupHomeCanvas()) return;

  setupAudioReactivity();
  initHomeShip();
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
  homeShipWake = [];
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
    } else {
      messageEl.textContent = match.message;

      if (typeof recordCodeCrack === "function") {
        recordCodeCrack(codeId, match.reward || null);
      }

      if (match.avatarUnlock && typeof unlockAvatar === "function") {
        unlockAvatar(match.avatarUnlock);
      }

      if (match.currencyReward && typeof addCurrency === "function") {
        addCurrency(match.currencyReward);
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
