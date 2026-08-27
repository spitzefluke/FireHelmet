/* ======================================================
   COMMUNITY-BOSS
   Ein gemeinsamer Gegner (geteilte HP in Supabase/Postgres), den alle
   Besucher zusammen innerhalb eines Kalendermonats besiegen.
   Jeder darf einmal am Tag angreifen. Am Monatsanfang beginnt
   automatisch eine neue Runde mit vollen HP und einem neuen Boss.

   Der Boss wird als animierte Canvas-Kreatur gezeichnet (nicht
   nur ein Emoji) - jeder Boss-Typ hat sein eigenes Aussehen,
   Idle-Bewegung und Themen-Partikel. Angriffe wechseln zufällig
   zwischen zwei Effekten: Kanonenschuss oder Säbel-Hieb.
====================================================== */

// Dublonen-Belohnung für Platz 1/2/3 beim Sieg über den Boss -
// wird sowohl für die tatsächliche Vergabe als auch für die
// Anzeige in der Rangliste genutzt (siehe checkBossSlayerReward
// und renderBossLeaderboard)
const BOSS_REWARDS_BY_RANK = [200, 120, 70];

function getCurrentMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentBoss() {
  if (typeof communityBosses === "undefined" || communityBosses.length === 0) return null;

  const [year, month] = getCurrentMonthId().split("-").map(Number);
  const monthIndex = year * 12 + month; // steigt jeden Monat um 1 -> rotiert zuverlässig durch
  return communityBosses[monthIndex % communityBosses.length];
}

function getBossDailyAttackKey() {
  return `communityBossLastAttack_${getCurrentMonthId()}`;
}

function hasAttackedToday() {
  const last = localStorage.getItem(getBossDailyAttackKey());
  return last === todayStr();
}

/* ------------------------------------------------------
   CANVAS-RENDERER
------------------------------------------------------ */
let bossCanvas = null;
let bossCtx = null;
let bossAnimFrame = null;
let bossRenderRunning = false;
let bossParticles = [];
let bossEffects = []; // aktive Angriffs-Effekte (Schuss/Säbel)
let bossShakeUntil = 0;
let bossHitFlashUntil = 0;
let bossCounterAuraUntil = 0;
let bossRageLevel = 0; // 0 (volle HP) bis 1 (fast besiegt) - steuert die Aura-Intensität
let bossRecoilUntil = 0; // Kreatur wird kurz zurückgestoßen (echtes Recoil, nicht nur Bildschirm-Zittern)
let bossRecoilDir = 1;
let bossSmoke = []; // dunkle Rauchwolken, die bei jedem Treffer aufsteigen (Punkt 22)

function setupBossCanvas() {
  const stage = document.getElementById("boss-stage");
  if (!stage) return false;

  if (!bossCanvas) {
    bossCanvas = document.createElement("canvas");
    bossCanvas.className = "boss-canvas";
    stage.appendChild(bossCanvas);
    bossCtx = bossCanvas.getContext("2d");

    const resize = () => {
      bossCanvas.width = stage.clientWidth;
      bossCanvas.height = stage.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
  }
  return true;
}

function startBossRender() {
  if (bossRenderRunning) return;
  if (!setupBossCanvas()) return;
  bossRenderRunning = true;
  drawBossFrame(0);
}

function stopBossRender() {
  bossRenderRunning = false;
  cancelAnimationFrame(bossAnimFrame);
  bossParticles = [];
  bossEffects = [];
  bossSmoke = [];
}

function drawBossFrame(time) {
  if (!bossCtx || !bossCanvas || !bossRenderRunning) return;

  const boss = getCurrentBoss();
  const w = bossCanvas.width;
  const h = bossCanvas.height;
  bossCtx.clearRect(0, 0, w, h);

  const shakeActive = time < bossShakeUntil;
  bossCtx.save();
  if (shakeActive) {
    bossCtx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  }

  drawBossAmbientParticles(time, w, h, boss);
  drawBossCreature(time, w, h, boss);
  drawBossSmoke();
  drawBossEffects(time, w, h);

  if (time < bossHitFlashUntil) {
    const flashAlpha = (bossHitFlashUntil - time) / 220;
    bossCtx.fillStyle = `rgba(255,255,255,${Math.min(0.35, flashAlpha * 0.35)})`;
    bossCtx.fillRect(0, 0, w, h);
  }

  bossCtx.restore();

  bossAnimFrame = requestAnimationFrame(drawBossFrame);
}

/* ------------------------------------------------------
   THEMEN-PARTIKEL IM HINTERGRUND
------------------------------------------------------ */
function drawBossAmbientParticles(time, w, h, boss) {
  if (!boss) return;

  if (Math.random() < 0.06) {
    bossParticles.push(createBossParticle(boss.type, w, h));
  }

  bossParticles = bossParticles.filter((p) => p.life < p.maxLife);
  bossParticles.forEach((p) => {
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    const fade = 1 - p.life / p.maxLife;

    bossCtx.globalAlpha = Math.max(0, fade) * p.baseAlpha;
    bossCtx.fillStyle = p.color;

    if (p.kind === "bolt") {
      bossCtx.strokeStyle = p.color;
      bossCtx.lineWidth = 2;
      bossCtx.beginPath();
      bossCtx.moveTo(p.x, p.y);
      bossCtx.lineTo(p.x + p.size, p.y + p.size * 1.4);
      bossCtx.lineTo(p.x - p.size * 0.4, p.y + p.size * 1.4);
      bossCtx.lineTo(p.x + p.size * 0.6, p.y + p.size * 2.8);
      bossCtx.stroke();
    } else {
      bossCtx.beginPath();
      bossCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bossCtx.fill();
    }
  });
  bossCtx.globalAlpha = 1;
}

/* ------------------------------------------------------
   RAUCH BEIM TREFFER (Punkt 22)
   Eigenständig von den Themen-Partikeln (Blasen/Blitze/Nebel) -
   dunkle, langsam aufsteigende Rauchwolken, die bei jedem
   Treffer aus der Kreatur aufsteigen. Menge/Dichte wächst mit
   sinkenden HP (bossRageLevel), damit der Boss sichtbar
   "mitgenommener" wirkt, je knapper er dran ist.
------------------------------------------------------ */
function spawnBossSmokeBurst(w, h) {
  const count = 4 + Math.round(bossRageLevel * 6);
  const cx = w / 2;
  const cy = h / 2 + 10;

  for (let i = 0; i < count; i++) {
    bossSmoke.push({
      life: 0,
      maxLife: 55 + Math.random() * 40,
      x: cx + (Math.random() - 0.5) * 90,
      y: cy - 20 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.5 - Math.random() * 0.6,
      size: 10 + Math.random() * 16,
      growth: 0.25 + Math.random() * 0.3,
      baseAlpha: 0.22 + bossRageLevel * 0.18,
    });
  }
}

function drawBossSmoke() {
  bossSmoke = bossSmoke.filter((p) => p.life < p.maxLife);
  bossSmoke.forEach((p) => {
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    p.size += p.growth;
    const fade = 1 - p.life / p.maxLife;

    bossCtx.globalAlpha = Math.max(0, fade) * p.baseAlpha;
    bossCtx.fillStyle = "rgba(35,32,30,.9)";
    bossCtx.beginPath();
    bossCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    bossCtx.fill();
  });
  bossCtx.globalAlpha = 1;
}

function createBossParticle(type, w, h) {
  const base = { life: 0, maxLife: 90 + Math.random() * 60, baseAlpha: 0.6 };

  if (type === "kraken") {
    return { ...base, kind: "bubble", x: w * 0.3 + Math.random() * w * 0.4, y: h * 0.85, vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 0.6, size: 2 + Math.random() * 4, color: "rgba(150,220,255,.8)" };
  }
  if (type === "storm") {
    return { ...base, kind: "bolt", maxLife: 12, x: w * 0.2 + Math.random() * w * 0.6, y: h * 0.15, vx: 0, vy: 0, size: 4 + Math.random() * 5, color: "rgba(220,235,255,.95)" };
  }
  if (type === "ghost-captain") {
    return { ...base, kind: "ember", x: w * 0.3 + Math.random() * w * 0.4, y: h * 0.8, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.5, size: 1.5 + Math.random() * 2.5, color: "rgba(255,180,90,.9)" };
  }
  // serpent
  return { ...base, kind: "mist", x: w * 0.2 + Math.random() * w * 0.6, y: h * 0.75 + Math.random() * h * 0.15, vx: (Math.random() - 0.5) * 0.5, vy: -0.15, size: 10 + Math.random() * 18, color: "rgba(120,255,180,.12)" };
}

/* ------------------------------------------------------
   BOSS-KREATUR JE TYP
------------------------------------------------------ */
function drawBossCreature(time, w, h, boss) {
  if (!boss) return;
  const cx = w / 2;
  const cy = h / 2 + 10;
  const bob = Math.sin(time / 700) * 6;
  const breathe = 1 + Math.sin(time / 900) * 0.03;

  // Energie-Ring hinterm Boss: pulsiert leise, flammt beim
  // Gegenangriff kurz kräftig auf UND wird bei sinkender HP
  // dauerhaft kräftiger + rötlicher (wie im v0-Referenzdesign)
  const counterBoost = Math.max(0, (bossCounterAuraUntil - time) / 700);
  const ringPulse = 0.5 + Math.sin(time / 500) * 0.2 + counterBoost * 0.8;
  const rageColor = mixHexColors(boss.color, "#d9431e", bossRageLevel);
  const ringGrad = bossCtx.createRadialGradient(cx, cy, 10, cx, cy, 150 + bossRageLevel * 40);
  ringGrad.addColorStop(0, hexToRgba(rageColor, 0.05 + counterBoost * 0.25 + bossRageLevel * 0.18));
  ringGrad.addColorStop(0.7, hexToRgba(rageColor, (0.12 + bossRageLevel * 0.18) * ringPulse));
  ringGrad.addColorStop(1, hexToRgba(rageColor, 0));
  bossCtx.fillStyle = ringGrad;
  bossCtx.beginPath();
  bossCtx.arc(cx, cy, 150 + bossRageLevel * 40, 0, Math.PI * 2);
  bossCtx.fill();

  // Dünner, rotierender Rune-Ring am Boden für mehr "Boss-Fight"-Gefühl
  bossCtx.save();
  bossCtx.translate(cx, cy + 95);
  bossCtx.scale(1, 0.32);
  bossCtx.rotate(time / 4000);
  bossCtx.strokeStyle = hexToRgba(rageColor, 0.35 + counterBoost * 0.4);
  bossCtx.lineWidth = 3;
  bossCtx.setLineDash([14, 10]);
  bossCtx.beginPath();
  bossCtx.arc(0, 0, 118, 0, Math.PI * 2);
  bossCtx.stroke();
  bossCtx.setLineDash([]);
  bossCtx.restore();

  // Echtes Recoil (Punkt 22): die Kreatur selbst wird kurz nach hinten
  // gestoßen und leicht gekippt, statt nur den ganzen Bildschirm zu
  // schütteln (das übernimmt weiterhin .fh-boss-impact separat) -
  // klingt quadratisch ab, damit der Rückstoß hart einsetzt und
  // weich ausläuft.
  const recoilT = Math.max(0, Math.min(1, (bossRecoilUntil - time) / 260));
  const recoilEase = recoilT * recoilT;
  const recoilX = recoilEase * 16 * bossRecoilDir;
  const recoilY = recoilEase * 9;
  const recoilTilt = recoilEase * 0.05 * bossRecoilDir;

  bossCtx.save();
  bossCtx.translate(cx + recoilX, cy + bob + recoilY);
  bossCtx.rotate(recoilTilt);
  bossCtx.scale(breathe, breathe);

  if (boss.type === "storm") drawStormDemon(time, boss);
  else if (boss.type === "ghost-captain") drawGhostCaptain(time, boss);
  else if (boss.type === "serpent") drawSeaSerpent(time, boss);
  else drawKraken(time, boss);

  drawBossDamageCracks(time, rageColor);

  bossCtx.restore();
}

/* ------------------------------------------------------
   SCHADENS-RISSE AUF DEM KOERPER (neu)
   ---------------------------------------------------
   Sichtbare, gluehende Risslinien direkt AUF der Kreatur, die mit
   sinkenden HP an Zahl und Intensitaet zunehmen (bossRageLevel, siehe
   applyBossHpDisplay()) - macht den Kampfverlauf am Boss selbst
   ablesbar, nicht nur an Arena-Hintergrund/HP-Balken. Die Risspfade
   selbst sind FEST (kein Math.random() pro Frame), nur Alpha/Glow
   pulsieren mit der Zeit - sonst wirkt es wie Bildrauschen statt
   wie echte Risse. Wird in DERSELBEN transformierten Koordinate
   gezeichnet wie die Kreatur (translate/scale bereits aktiv), landet
   also automatisch exakt auf ihr.
------------------------------------------------------ */
const BOSS_CRACK_PATHS = [
  [[0, -10], [-14, -34], [-8, -58], [-20, -82]],
  [[6, -4], [24, -20], [18, -44], [34, -60]],
  [[-4, 8], [-22, 22], [-14, 44], [-28, 64]],
  [[10, 14], [28, 32], [20, 52], [36, 74]],
  [[-8, -20], [-26, -8], [-40, 6], [-52, -4]],
  [[2, 2], [18, 14], [36, 10], [50, 22]],
];

function drawBossDamageCracks(time, rageColor) {
  if (bossRageLevel < 0.12) return;

  const ctx = bossCtx;
  const visibleCount = Math.min(BOSS_CRACK_PATHS.length, Math.round(bossRageLevel * BOSS_CRACK_PATHS.length) + 1);
  const flicker = 0.7 + Math.sin(time / 260) * 0.3;

  ctx.save();
  ctx.strokeStyle = hexToRgba(rageColor, Math.min(0.9, bossRageLevel * 0.9) * flicker);
  ctx.shadowColor = rageColor;
  ctx.shadowBlur = 10 + bossRageLevel * 10;
  ctx.lineWidth = 1.5 + bossRageLevel * 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < visibleCount; i++) {
    const path = BOSS_CRACK_PATHS[i];
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let p = 1; p < path.length; p++) ctx.lineTo(path[p][0], path[p][1]);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Blendet zwei Hex-Farben ineinander (t=0 -> colorA, t=1 -> colorB) -
// genutzt, um die Boss-Aura bei sinkender HP allmählich Richtung Rot
// (Rage-Farbe) wandern zu lassen
function mixHexColors(colorA, colorB, t) {
  const a = colorA.replace("#", "");
  const b = colorB.replace("#", "");
  const ai = parseInt(a, 16);
  const bi = parseInt(b, 16);
  const ar = (ai >> 16) & 255, ag = (ai >> 8) & 255, ab = ai & 255;
  const br = (bi >> 16) & 255, bg = (bi >> 8) & 255, bb = bi & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function drawGlowEyes(offsets, glowColor, size) {
  offsets.forEach(([ex, ey]) => {
    bossCtx.beginPath();
    bossCtx.arc(ex, ey, size, 0, Math.PI * 2);
    bossCtx.fillStyle = glowColor;
    bossCtx.shadowColor = glowColor;
    bossCtx.shadowBlur = 18;
    bossCtx.fill();
  });
  bossCtx.shadowBlur = 0;
}

/* ------------------------------------------------------
   KLEINE DETAIL-HELFER (wiederverwendet von allen vier Bossen)
   Runde Punkte fuer Saugnaepfe/Knoepfe/Nieten, kurze Linien fuer
   Narben/Naehte - bewusst winzig und billig zu zeichnen (keine
   Farbverlaeufe/Schatten), damit sie bei 320x320px Buehnengroesse
   die Silhouette praezisieren statt zu Bildrauschen zu werden.
------------------------------------------------------ */
function drawDot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawScarLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawKraken(time, boss) {
  const ctx = bossCtx;

  // Tentakel, jeder mit eigener Wellenbewegung - jetzt mit
  // Saugnapf-Reihen auf der Unterseite fuer mehr organische Detailtiefe
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 5) * (i - 2.5);
    const wave = Math.sin(time / 500 + i) * 18;
    const endX = Math.sin(angle) * 60 + wave * 1.6;
    const endY = 175 + Math.abs(wave) * 0.3;
    const midX = Math.sin(angle) * 90 + wave;
    const midY = 110;
    const startX = Math.sin(angle) * 30;

    ctx.strokeStyle = boss.color;
    ctx.lineWidth = 13 - i * 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(startX, 40);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();

    // Saugnaepfe entlang der Tentakel-Mitte (nur bei den 4 vorderen,
    // hinterste 2 bleiben glatt im Hintergrund - vermeidet Ueberladung)
    if (i >= 1 && i <= 4) {
      for (let s = 0.3; s < 0.95; s += 0.16) {
        const sx = startX + (midX - startX) * s + (endX - midX) * Math.max(0, s - 0.5);
        const sy = 40 + (midY - 40) * s + (endY - midY) * Math.max(0, s - 0.5);
        drawDot(ctx, sx, sy, 2.2 - s, "rgba(20,8,3,.55)");
      }
    }
  }

  // Kopf/Mantel - mit Rand-Rimlight fuer mehr Tiefe statt flachem Verlauf
  const grad = ctx.createRadialGradient(-20, -30, 10, 0, 0, 100);
  grad.addColorStop(0, "#c2601f");
  grad.addColorStop(0.7, boss.color);
  grad.addColorStop(1, "#2a1206");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, -20, 85, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warzige Haut-Textur: unregelmaessige dunkle Flecken auf dem Mantel
  const bumps = [[-45, -45], [-20, -60], [15, -55], [40, -35], [-35, -5], [30, 5], [0, -75]];
  bumps.forEach(([bx, by], i) => {
    drawDot(ctx, bx, by, 5 - (i % 3), "rgba(30,12,4,.35)");
  });

  // Brauenwulst ueber den Augen - macht den Blick finsterer statt neutral
  ctx.strokeStyle = "rgba(20,8,3,.6)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-42, -42);
  ctx.quadraticCurveTo(-28, -50, -14, -42);
  ctx.moveTo(14, -42);
  ctx.quadraticCurveTo(28, -50, 42, -42);
  ctx.stroke();

  drawGlowEyes([[-28, -30], [28, -30]], "rgba(255,80,60,.95)", 11);

  // Schlitzpupillen statt runder Punkte - deutlich bedrohlicher
  ctx.fillStyle = "#1a0a05";
  ctx.save();
  ctx.translate(-28, -30);
  ctx.scale(0.4, 1.3);
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(28, -30);
  ctx.scale(0.4, 1.3);
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Hakenschnabel unter den Augen (Kraken-typisches Merkmal, bisher fehlte
  // jede Mund-/Kieferandeutung komplett) - spitz nach unten statt rund,
  // damit er nicht wie ein Laecheln wirkt
  ctx.fillStyle = "#150a08";
  ctx.beginPath();
  ctx.moveTo(-16, -12);
  ctx.lineTo(0, 10);
  ctx.lineTo(16, -12);
  ctx.quadraticCurveTo(0, -20, -16, -12);
  ctx.closePath();
  ctx.fill();

  // Alte Narbe quer ueber den Mantel - individuelles Wiedererkennungsmerkmal
  drawScarLine(ctx, -50, -20, -20, 10, "rgba(15,6,2,.5)", 3);
  drawScarLine(ctx, -38, -6, -30, 16, "rgba(15,6,2,.5)", 2.5);
}

function drawStormDemon(time, boss) {
  const ctx = bossCtx;

  // Umhang-Silhouette: eine dunklere, in sich geschlossene Robenform
  // HINTER dem Wirbel, damit eine humanoide Gestalt im Sturm erkennbar
  // wird statt nur loser Ringe (Punkt "geheimnisvolle Elemente")
  const cloakSway = Math.sin(time / 900) * 8;
  ctx.fillStyle = "rgba(4, 9, 18, .8)";
  ctx.beginPath();
  ctx.moveTo(-58, -70);
  ctx.quadraticCurveTo(-90 + cloakSway * 0.4, 40, -70 + cloakSway, 130);
  ctx.quadraticCurveTo(0, 150, 70 - cloakSway, 130);
  ctx.quadraticCurveTo(90 - cloakSway * 0.4, 40, 58, -70);
  ctx.quadraticCurveTo(0, -95, -58, -70);
  ctx.closePath();
  ctx.fill();

  // Wirbelnder Sturm-Koerper (mehrere rotierende, versetzte Ellipsen)
  for (let i = 0; i < 5; i++) {
    const t = time / 600 + i * 0.7;
    const ringY = -60 + i * 30;
    const ringW = 100 - i * 12;
    ctx.beginPath();
    ctx.ellipse(Math.sin(t) * 10, ringY, ringW, 22, Math.sin(t) * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(28, 79, 143, ${0.55 - i * 0.07})`;
    ctx.fill();
  }

  // Zerfetzter Umhang-Saum unten - lose Fetzen statt glatter Kante
  ctx.strokeStyle = "rgba(8, 16, 28, .7)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    const fx = i * 20 + cloakSway * 0.5;
    const fLen = 14 + Math.abs(Math.sin(time / 700 + i)) * 10;
    ctx.beginPath();
    ctx.moveTo(fx, 118);
    ctx.lineTo(fx + Math.sin(time / 600 + i) * 6, 118 + fLen);
    ctx.stroke();
  }

  // Kapuzen-Schatten um das Gesicht - grenzt den Kopf klarer vom Wirbel ab
  const hoodGrad = ctx.createRadialGradient(0, -25, 5, 0, -25, 55);
  hoodGrad.addColorStop(0, "rgba(10,18,30,0)");
  hoodGrad.addColorStop(0.75, "rgba(10,18,30,0)");
  hoodGrad.addColorStop(1, "rgba(5,10,18,.6)");
  ctx.fillStyle = hoodGrad;
  ctx.beginPath();
  ctx.arc(0, -25, 55, 0, Math.PI * 2);
  ctx.fill();

  // Zornige Brauen ueber den Augen - schraeg nach innen, statt eines
  // neutralen/ueberraschten Blicks
  ctx.strokeStyle = "rgba(200,225,255,.55)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-34, -34);
  ctx.lineTo(-12, -26);
  ctx.moveTo(34, -34);
  ctx.lineTo(12, -26);
  ctx.stroke();

  drawGlowEyes([[-22, -20], [22, -20]], "rgba(255,255,255,.95)", 10);
  ctx.fillStyle = "#0a1520";
  ctx.beginPath();
  ctx.arc(-22, -20, 4, 0, Math.PI * 2);
  ctx.arc(22, -20, 4, 0, Math.PI * 2);
  ctx.fill();

  // Rissiger Blitz-Mund statt gesichtsloser Leere - breiter und dunkler
  // konturiert fuer bessere Erkennbarkeit
  ctx.strokeStyle = "rgba(210,232,255,.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-16, 2);
  ctx.lineTo(-6, 10);
  ctx.lineTo(2, 3);
  ctx.lineTo(14, 11);
  ctx.stroke();

  // Blitz-Krone oben - jetzt verzweigt statt ein einzelner Zickzack
  ctx.strokeStyle = "rgba(220,235,255,.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -100);
  ctx.lineTo(5, -80);
  ctx.lineTo(-5, -78);
  ctx.lineTo(10, -55);
  ctx.moveTo(2, -85);
  ctx.lineTo(18, -72);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(220,235,255,.5)";
  ctx.beginPath();
  ctx.moveTo(-5, -78);
  ctx.lineTo(-16, -66);
  ctx.stroke();
}

/* ------------------------------------------------------
   KAPITÄN BLACKGOLD - staerkster Detail-Fokus, da einziger echt
   humanoider Piraten-Kapitaen der vier Bosse: Totenschaedel mit
   Augenhoehlen/Riss/Kiefer, Mantel mit Revers/Knoepfen/Epauletten/
   Schaerpe, Dreispitz mit Band+Totenkopf-Abzeichen+Feder, Saebel.
------------------------------------------------------ */
function drawGhostCaptain(time, boss) {
  const ctx = bossCtx;
  const flicker = 0.85 + Math.sin(time / 250) * 0.15;

  // Saebel an der Seite (Waffe/Ausruestungsdetail) - hinter dem Mantel,
  // damit er wie am Guertel getragen wirkt
  ctx.save();
  ctx.translate(48, 20);
  ctx.rotate(0.5);
  const bladeGrad = ctx.createLinearGradient(0, 0, 0, 70);
  bladeGrad.addColorStop(0, "rgba(210,215,225,.85)");
  bladeGrad.addColorStop(1, "rgba(120,130,145,.6)");
  ctx.fillStyle = bladeGrad;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(10, 35, -2, 68);
  ctx.lineTo(-8, 66);
  ctx.quadraticCurveTo(2, 33, -10, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(-12, -6, 16, 6);
  drawDot(ctx, -4, -8, 4, "#c9a227");
  ctx.restore();

  // Wallender Geister-Mantel
  ctx.fillStyle = `rgba(59, 36, 21, ${flicker})`;
  ctx.beginPath();
  ctx.moveTo(-70, -10);
  for (let i = 0; i <= 6; i++) {
    const x = -70 + i * (140 / 6);
    const y = 90 + Math.sin(time / 400 + i) * 12;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(70, -10);
  ctx.quadraticCurveTo(0, -60, -70, -10);
  ctx.closePath();
  ctx.fill();

  // Zerschlissener Mantelsaum - kleine Kerben/Risse statt glatter Kontur
  ctx.strokeStyle = `rgba(30, 16, 8, ${flicker})`;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    const x = -70 + i * (140 / 6);
    const y = 90 + Math.sin(time / 400 + i) * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (i % 2 ? 4 : -4), y - 8);
    ctx.stroke();
  }

  // Revers (Mantel-Kragenaufschlaege) - gibt der Brust eine echte
  // Kleidungsform statt einer glatten Flaeche
  ctx.fillStyle = `rgba(40, 22, 12, ${flicker})`;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-26, 24);
  ctx.lineTo(-8, 30);
  ctx.lineTo(0, -6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(26, 24);
  ctx.lineTo(8, 30);
  ctx.lineTo(0, -6);
  ctx.closePath();
  ctx.fill();

  // Goldene Knopfreihe die Mitte hinunter
  for (let i = 0; i < 4; i++) {
    drawDot(ctx, 0, -2 + i * 12, 2.4, `rgba(201,162,39,${flicker})`);
  }

  // Schaerpe diagonal ueber die Brust - klassisches Kapitaens-Detail
  ctx.strokeStyle = `rgba(124, 45, 18, ${flicker * 0.9})`;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-32, -30);
  ctx.lineTo(24, 34);
  ctx.stroke();
  // Abzeichen an der Schaerpe (kleines Medaillon)
  ctx.save();
  ctx.translate(-4, 2);
  drawDot(ctx, 0, 0, 7, `rgba(201,162,39,${flicker})`);
  drawDot(ctx, 0, 0, 3.5, "rgba(30,16,8,.8)");
  ctx.restore();

  // Epauletten auf den Schultern - goldfarben statt mantelbraun, sonst
  // gehen sie farblich im Mantel unter
  drawDot(ctx, -48, -14, 8, `rgba(201,162,39,${flicker * 0.85})`);
  drawDot(ctx, 48, -14, 8, `rgba(201,162,39,${flicker * 0.85})`);
  drawDot(ctx, -48, -14, 3.5, `rgba(40,22,12,${flicker})`);
  drawDot(ctx, 48, -14, 3.5, `rgba(40,22,12,${flicker})`);

  // Dreispitz-Hut
  ctx.fillStyle = "#1c1006";
  ctx.beginPath();
  ctx.moveTo(-55, -55);
  ctx.quadraticCurveTo(0, -100, 55, -55);
  ctx.quadraticCurveTo(0, -70, -55, -55);
  ctx.fill();

  // Hutband mit Totenkopf-Abzeichen statt schmuckloser Krempe
  ctx.strokeStyle = "rgba(90,60,25,.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-38, -58);
  ctx.quadraticCurveTo(0, -68, 38, -58);
  ctx.stroke();
  drawDot(ctx, 0, -63, 5, "rgba(230,225,210,.9)");
  drawDot(ctx, -2, -64, 1, "#1a0a05");
  drawDot(ctx, 2, -64, 1, "#1a0a05");

  // Zerzauste Feder am Hut
  ctx.strokeStyle = "rgba(120,255,170,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(45, -68);
  ctx.quadraticCurveTo(60, -80, 52, -95);
  ctx.stroke();

  // Totenkopf-Gesicht
  ctx.fillStyle = `rgba(230,225,210,${flicker})`;
  ctx.beginPath();
  ctx.arc(0, -25, 34, 0, Math.PI * 2);
  ctx.fill();

  // Wangenknochen-Schatten fuer echte Gesichtstiefe statt einer flachen
  // Scheibe - dunklere Vertiefungen unter den Augenhoehlen
  ctx.fillStyle = "rgba(90,80,68,.7)";
  ctx.beginPath();
  ctx.ellipse(-18, -14, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(18, -14, 9, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Augenhoehlen (dunkle Vertiefung hinter dem Glow, macht die Augen zu
  // echten Hoehlen statt schwebenden Punkten)
  ctx.fillStyle = "rgba(15,8,4,.75)";
  ctx.beginPath();
  ctx.ellipse(-13, -28, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13, -28, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  drawGlowEyes([[-13, -28], [13, -28]], "rgba(120,255,170,.95)", 8);

  // Sprung ueber den Schaedel - individuelles Narbenmerkmal
  drawScarLine(ctx, -22, -48, -6, -18, "rgba(90,80,68,.6)", 2);
  drawScarLine(ctx, -14, -34, -18, -22, "rgba(90,80,68,.6)", 1.5);

  // Nasenhoehle
  ctx.fillStyle = "#1a0a05";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(-5, -5);
  ctx.lineTo(5, -5);
  ctx.closePath();
  ctx.fill();

  // Kiefer mit erkennbaren Zahnluecken statt einer glatten Linie
  ctx.strokeStyle = "rgba(120,110,95,.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 4);
  ctx.lineTo(16, 4);
  ctx.stroke();
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5, 4);
    ctx.lineTo(i * 5, 9);
    ctx.stroke();
  }
}

function drawSeaSerpent(time, boss) {
  const ctx = bossCtx;

  // Geschwungener Koerper aus Segmenten
  ctx.strokeStyle = boss.color;
  ctx.lineWidth = 34;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = -110 + t * 220;
    const y = Math.sin(t * Math.PI * 2.4 + time / 500) * 45;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Schuppen-Highlights
  ctx.strokeStyle = "rgba(255,255,255,.15)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = -110 + t * 220;
    const y = Math.sin(t * Math.PI * 2.4 + time / 500) * 45 - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Einzelne Schuppen-Boegen quer zum Koerper (statt nur einer
  // Laengs-Highlight-Linie) - echte Schuppenstruktur statt glatter Haut
  ctx.strokeStyle = "rgba(0,0,0,.18)";
  ctx.lineWidth = 1.5;
  for (let i = 4; i <= 56; i += 6) {
    const t = i / 60;
    const x = -110 + t * 220;
    const y = Math.sin(t * Math.PI * 2.4 + time / 500) * 45;
    ctx.beginPath();
    ctx.arc(x, y, 9, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  // Rueckenkamm-Zacken entlang des Koerpers - deutlich gefaehrlicheres
  // Profil statt einer glatten Wurst-Silhouette
  ctx.fillStyle = boss.color;
  for (let i = 6; i <= 54; i += 8) {
    const t = i / 60;
    const x = -110 + t * 220;
    const y = Math.sin(t * Math.PI * 2.4 + time / 500) * 45;
    const spikeH = 12 + Math.sin(t * 6) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 12);
    ctx.lineTo(x, y - 12 - spikeH);
    ctx.lineTo(x + 6, y - 12);
    ctx.closePath();
    ctx.fill();
  }

  // Kopf am vorderen Ende
  const headX = 110;
  const headY = Math.sin(2.4 * Math.PI + time / 500) * 45;
  ctx.fillStyle = boss.color;
  ctx.beginPath();
  ctx.ellipse(headX, headY, 30, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Kiefer-/Brauenkontur - schaerferer, reptilischerer Kopf statt eines
  // einfachen Ovals
  ctx.strokeStyle = "rgba(0,0,0,.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headX - 18, headY - 14);
  ctx.quadraticCurveTo(headX + 4, headY - 22, headX + 26, headY - 10);
  ctx.stroke();

  // Nuestern
  drawDot(ctx, headX + 22, headY - 4, 1.8, "rgba(0,0,0,.45)");

  drawGlowEyes([[headX + 8, headY - 8]], "rgba(255,220,60,.95)", 6);

  // Reisszaehne im Ober-/Unterkiefer statt keiner Bezahnung
  ctx.fillStyle = "rgba(255,250,235,.9)";
  [[headX + 18, headY + 6], [headX + 26, headY + 8], [headX + 20, headY + 12]].forEach(([tx, ty]) => {
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty - 4);
    ctx.lineTo(tx + 2, ty - 4);
    ctx.lineTo(tx, ty + 3);
    ctx.closePath();
    ctx.fill();
  });

  // gespaltene Zunge
  ctx.strokeStyle = "#ff5d5d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headX + 28, headY + 4);
  ctx.lineTo(headX + 42, headY + 4);
  ctx.moveTo(headX + 42, headY + 4);
  ctx.lineTo(headX + 48, headY);
  ctx.moveTo(headX + 42, headY + 4);
  ctx.lineTo(headX + 48, headY + 8);
  ctx.stroke();
}

/* ------------------------------------------------------
   ANGRIFFS-EFFEKTE: KANONENSCHUSS ODER SÄBEL-HIEB
   Wechselt bei jedem Angriff zufällig zwischen beiden.
------------------------------------------------------ */
function spawnBossAttackEffect(kind, w, h) {
  const cx = w / 2;
  const cy = h / 2 + 10;

  if (kind === "shot") {
    bossEffects.push({
      kind: "shot",
      startTime: performance.now(),
      duration: 260,
      fromX: w * (Math.random() < 0.5 ? -0.1 : 1.1),
      fromY: h * 0.9,
      toX: cx + (Math.random() - 0.5) * 60,
      toY: cy + (Math.random() - 0.5) * 40,
    });
  } else if (kind === "saber") {
    const angle = -0.6 + Math.random() * 1.2;
    bossEffects.push({
      kind: "saber",
      startTime: performance.now(),
      duration: 380,
      cx: cx + (Math.random() - 0.5) * 40,
      cy: cy + (Math.random() - 0.5) * 30,
      angle,
      length: Math.min(w, h) * 0.55,
    });
  } else if (kind === "harpoon") {
    bossEffects.push({
      kind: "harpoon",
      startTime: performance.now(),
      duration: 320,
      fromX: cx + (Math.random() < 0.5 ? -1 : 1) * w * 0.6,
      fromY: h * 1.05,
      toX: cx + (Math.random() - 0.5) * 50,
      toY: cy + (Math.random() - 0.5) * 30,
    });
  } else {
    // curse: Fluch-Projektil, das sich spiralförmig zum Boss zieht
    bossEffects.push({
      kind: "curse",
      startTime: performance.now(),
      duration: 420,
      fromX: cx + (Math.random() < 0.5 ? -0.75 : 0.75) * w * 0.55,
      fromY: h * 0.15,
      toX: cx,
      toY: cy,
    });
  }
}

const BOSS_ATTACK_KINDS = ["shot", "saber", "harpoon", "curse"];

function drawBossEffects(time, w, h) {
  const now = performance.now();

  bossEffects = bossEffects.filter((fx) => now - fx.startTime < fx.duration + 250);

  bossEffects.forEach((fx) => {
    const t = Math.min(1, (now - fx.startTime) / fx.duration);

    if (fx.kind === "shot") {
      const x = fx.fromX + (fx.toX - fx.fromX) * t;
      const y = fx.fromY + (fx.toY - fx.fromY) * t;

      // Rauchspur
      bossCtx.strokeStyle = "rgba(200,200,200,.35)";
      bossCtx.lineWidth = 3;
      bossCtx.beginPath();
      bossCtx.moveTo(fx.fromX, fx.fromY);
      bossCtx.lineTo(x, y);
      bossCtx.stroke();

      // Kugel
      bossCtx.beginPath();
      bossCtx.arc(x, y, 6, 0, Math.PI * 2);
      bossCtx.fillStyle = "#1a1a1a";
      bossCtx.shadowColor = "#ffcf6b";
      bossCtx.shadowBlur = 12;
      bossCtx.fill();
      bossCtx.shadowBlur = 0;

      drawBossImpactRing(fx.toX, fx.toY, t, "rgba(255,180,80,");
    } else if (fx.kind === "saber") {
      // Säbel-Hieb: heller Bogen, der über den Boss schwingt
      const ease = 1 - Math.pow(1 - t, 3);
      const sweep = (ease - 0.5) * 2.4; // -1.2 .. 1.2 rad Schwungbereich

      bossCtx.save();
      bossCtx.translate(fx.cx, fx.cy);
      bossCtx.rotate(fx.angle);

      const grad = bossCtx.createLinearGradient(-fx.length / 2, 0, fx.length / 2, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, `rgba(230,240,255,${0.9 * (1 - t)})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");

      bossCtx.strokeStyle = grad;
      bossCtx.lineWidth = 6;
      bossCtx.lineCap = "round";
      bossCtx.beginPath();
      bossCtx.moveTo(-fx.length / 2 + sweep * 20, -8);
      bossCtx.quadraticCurveTo(sweep * 40, 0, fx.length / 2 + sweep * 20, 8);
      bossCtx.stroke();

      bossCtx.restore();

      // Funken am Treffpunkt
      if (t > 0.35 && t < 0.75) {
        for (let i = 0; i < 3; i++) {
          bossCtx.beginPath();
          bossCtx.arc(
            fx.cx + (Math.random() - 0.5) * 40,
            fx.cy + (Math.random() - 0.5) * 40,
            2 + Math.random() * 2,
            0, Math.PI * 2
          );
          bossCtx.fillStyle = "rgba(255,255,255,.9)";
          bossCtx.fill();
        }
      }
    } else if (fx.kind === "harpoon") {
      const x = fx.fromX + (fx.toX - fx.fromX) * t;
      const y = fx.fromY + (fx.toY - fx.fromY) * t;
      const angle = Math.atan2(fx.toY - fx.fromY, fx.toX - fx.fromX);

      // Seil, das hinter der Harpune herzieht
      bossCtx.strokeStyle = "rgba(180,150,100,.5)";
      bossCtx.lineWidth = 2;
      bossCtx.beginPath();
      bossCtx.moveTo(fx.fromX, fx.fromY);
      bossCtx.lineTo(x, y);
      bossCtx.stroke();

      // Speerspitze
      bossCtx.save();
      bossCtx.translate(x, y);
      bossCtx.rotate(angle);
      bossCtx.fillStyle = "#c9c9c9";
      bossCtx.beginPath();
      bossCtx.moveTo(16, 0);
      bossCtx.lineTo(-6, -5);
      bossCtx.lineTo(-2, 0);
      bossCtx.lineTo(-6, 5);
      bossCtx.closePath();
      bossCtx.fill();
      bossCtx.strokeStyle = "#8a8a8a";
      bossCtx.lineWidth = 3;
      bossCtx.beginPath();
      bossCtx.moveTo(-6, 0);
      bossCtx.lineTo(-30, 0);
      bossCtx.stroke();
      bossCtx.restore();

      drawBossImpactRing(fx.toX, fx.toY, t, "rgba(220,220,220,");
    } else if (fx.kind === "curse") {
      // Fluch-Projektil: spiralt sich zum Boss, mit violettem Partikelschweif
      const ease = t * t;
      const spiralR = (1 - ease) * 70;
      const spiralAngle = time / 90 + t * 14;
      const x = fx.fromX + (fx.toX - fx.fromX) * ease + Math.cos(spiralAngle) * spiralR;
      const y = fx.fromY + (fx.toY - fx.fromY) * ease + Math.sin(spiralAngle) * spiralR;

      bossCtx.beginPath();
      bossCtx.arc(x, y, 7, 0, Math.PI * 2);
      bossCtx.fillStyle = "rgba(190,110,255,.9)";
      bossCtx.shadowColor = "rgba(190,110,255,1)";
      bossCtx.shadowBlur = 18;
      bossCtx.fill();
      bossCtx.shadowBlur = 0;

      for (let i = 0; i < 2; i++) {
        bossCtx.beginPath();
        bossCtx.arc(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, 2, 0, Math.PI * 2);
        bossCtx.fillStyle = "rgba(220,180,255,.7)";
        bossCtx.fill();
      }

      drawBossImpactRing(fx.toX, fx.toY, t, "rgba(190,110,255,");
    }
  });
}

// Gemeinsamer, sich ausbreitender Einschlag-Ring am Ende jeder
// Angriffs-Animation (letzte 10% der Laufzeit)
function drawBossImpactRing(x, y, t, rgbPrefix) {
  if (t <= 0.9) return;
  const impactT = (t - 0.9) / 0.1;
  bossCtx.beginPath();
  bossCtx.arc(x, y, 10 + impactT * 35, 0, Math.PI * 2);
  bossCtx.strokeStyle = `${rgbPrefix}${1 - impactT})`;
  bossCtx.lineWidth = 4;
  bossCtx.stroke();
}

/* ------------------------------------------------------
   BOSS-ZUSTAND AUS SUPABASE LADEN
------------------------------------------------------ */
async function loadBossState() {
  if (!supabaseClient) return null;

  if (typeof wheelAuthReady !== "undefined") {
    await wheelAuthReady;
  }

  const monthId = getCurrentMonthId();
  const maxHp = typeof communityBossConfig !== "undefined" ? communityBossConfig.maxHp : 5000;

  // Echtes Upsert mit ignoreDuplicates: legt den Boss nur an, falls er
  // fuer diesen Monat noch nicht existiert (community_boss_insert
  // verlangt hp = max_hp) - existiert er schon, bleibt er unangetastet.
  try {
    await supabaseClient
      .from("community_boss")
      .upsert({ month_id: monthId, hp: maxHp, max_hp: maxHp, defeated: false }, { onConflict: "month_id", ignoreDuplicates: true });
  } catch (err) {
    // Ein anderer Besucher war evtl. eine Millisekunde schneller - kein Problem,
    // wir lesen unten einfach nochmal
  }

  const { data, error } = await supabaseClient
    .from("community_boss")
    .select("hp, max_hp, defeated")
    .eq("month_id", monthId)
    .maybeSingle();
  if (error || !data) return null;

  return { data: { hp: data.hp, maxHp: data.max_hp, defeated: data.defeated } };
}

/* ------------------------------------------------------
   SEITE AUFBAUEN / AKTUALISIEREN
------------------------------------------------------ */
async function renderCommunityBossPage() {
  const boss = getCurrentBoss();
  const nameEl = document.getElementById("boss-name");
  const flavorEl = document.getElementById("boss-flavor");
  const hpTextEl = document.getElementById("boss-hp-text");
  const hpFillEl = document.getElementById("boss-hp-fill");
  const attackBtn = document.getElementById("boss-attack-btn");
  const statusEl = document.getElementById("boss-status");
  const resetEl = document.getElementById("boss-reset-countdown");
  const defeatedBanner = document.getElementById("boss-defeated-banner");

  if (!boss || !nameEl) return;

  nameEl.textContent = boss.name;
  flavorEl.textContent = boss.flavorText;
  document.documentElement.style.setProperty("--boss-accent", boss.color);

  startBossRender();
  updateBossResetCountdown(resetEl);

  if (!supabaseClient) {
    if (statusEl) statusEl.textContent = "⚠️ Verbindung nicht verfügbar - versuch's später nochmal.";
    if (attackBtn) attackBtn.disabled = true;
    return;
  }

  const state = await loadBossState();
  if (!state) return;

  applyBossHpDisplay(state.data, hpTextEl, hpFillEl, boss, defeatedBanner, attackBtn);

  const monthId = getCurrentMonthId();
  renderBossLeaderboard(monthId);
  if (state.data.defeated) {
    checkBossSlayerReward(monthId);
  }
  startBossCounterattackTimer();

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname) {
    if (statusEl) statusEl.textContent = "Melde dich zuerst an, um mitzukämpfen!";
    if (attackBtn) attackBtn.disabled = true;
  } else if (state.data.defeated) {
    if (attackBtn) attackBtn.disabled = true;
    if (statusEl) statusEl.textContent = "";
  } else if (hasAttackedToday()) {
    if (attackBtn) attackBtn.disabled = true;
    if (statusEl) statusEl.textContent = "⏳ Du hast heute schon angegriffen - komm morgen wieder!";
  } else {
    if (attackBtn) attackBtn.disabled = false;
    if (statusEl) statusEl.textContent = "";
  }
}

/* Rein visuelle Phasen anhand der vorhandenen HP-Prozentzahl
   (kein neues Backend-Feld nötig - siehe Punkt 7: "wenn das
   Backend aktuell keine Phasen unterstützt, zunächst nur visuell
   anhand der vorhandenen HP darstellen"). "key" steuert zusätzlich
   eine CSS-Klasse auf der Arena (siehe applyBossPhaseVisuals). */
/* Sechs visuelle Zustände genau an den geforderten HP-Schwellen
   100/75/50/25/10/0% (Punkt 22) - jede Schwelle markiert den
   ÜBERGANG in die jeweils nächste, sichtbar eskalierende Stufe. */
function getBossPhase(percent) {
  const t = typeof window.t === "function" ? window.t : (k, f) => f;
  if (percent <= 0) return { label: t("boss.phaseDefeated", "BESIEGT"), index: 5, key: "defeated" };
  if (percent <= 10) return { label: t("boss.phaseFinal", "FINAL PHASE"), index: 4, key: "final" };
  if (percent <= 25) return { label: t("boss.phaseCritical", "CRITICAL"), index: 3, key: "critical" };
  if (percent <= 50) return { label: t("boss.phaseEnraged", "ENRAGED"), index: 2, key: "enraged" };
  if (percent <= 75) return { label: t("boss.phaseWounded", "WOUNDED"), index: 1, key: "wounded" };
  return { label: t("boss.phaseNormal", "NORMAL"), index: 0, key: "normal" };
}

function applyBossPhaseVisuals(phaseKey) {
  const panel = document.getElementById("fh-boss-panel");
  const arenaBg = document.getElementById("fh-boss-arena-bg");
  [panel, arenaBg].forEach((el) => {
    if (!el) return;
    el.classList.remove(
      "fh-boss-phase-normal",
      "fh-boss-phase-wounded",
      "fh-boss-phase-enraged",
      "fh-boss-phase-critical",
      "fh-boss-phase-final",
      "fh-boss-phase-defeated"
    );
    el.classList.add(`fh-boss-phase-${phaseKey}`);
  });
}

/* ------------------------------------------------------
   DAMAGE/ATTACKERS-STATISTIK
   "Damage" ergibt sich direkt aus maxHp-hp (kein Extra-Feld
   nötig). "Attackers" ist eine Supabase Aggregations-Query
   (count:"exact", head:true) - schlägt sie fehl, bleibt
   einfach ein Platzhalter stehen statt die Seite zu zerstören
   (siehe Punkt 36: Fehlerzustand statt leerer Seite).
------------------------------------------------------ */
async function updateBossStatsRow(monthId, hp, maxHp) {
  const dmgEl = document.getElementById("boss-stat-damage");
  if (dmgEl) dmgEl.textContent = Math.max(0, maxHp - hp).toLocaleString("de-DE");

  const atkEl = document.getElementById("boss-stat-attackers");
  if (!atkEl || !supabaseClient) return;

  try {
    const { count, error } = await supabaseClient
      .from("community_boss_damage")
      .select("firebase_uid", { count: "exact", head: true })
      .eq("month_id", monthId);
    if (error) throw error;
    atkEl.textContent = (count || 0).toLocaleString("de-DE");
  } catch (err) {
    atkEl.textContent = "–";
  }
}

function applyBossHpDisplay(data, hpTextEl, hpFillEl, boss, defeatedBanner, attackBtn) {
  const hp = Math.max(0, data.hp);
  const maxHp = data.maxHp || 1;
  const percent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  const ghostEl = document.getElementById("boss-hp-ghost");
  const numericEl = document.getElementById("boss-hp-numeric");
  const phaseBadgeEl = document.getElementById("boss-phase-badge");
  const phase = getBossPhase(percent);

  if (hpTextEl) hpTextEl.textContent = `${percent.toFixed(1)}%`;
  if (hpFillEl) hpFillEl.style.width = `${percent}%`;

  // Geister-Balken zieht bewusst verzögert nach (klassischer
  // RPG-"Schaden genommen"-Effekt) - CSS-Transition macht die
  // Verzögerung, hier nur der Zielwert
  if (ghostEl) {
    setTimeout(() => {
      ghostEl.style.width = `${percent}%`;
    }, 150);
  }

  if (numericEl) numericEl.textContent = `${hp.toLocaleString("de-DE")} / ${maxHp.toLocaleString("de-DE")} HP`;
  if (phaseBadgeEl) phaseBadgeEl.textContent = phase.label;
  phaseBadgeEl?.setAttribute("data-phase", phase.key);
  applyBossPhaseVisuals(phase.key);
  updateBossStatsRow(getCurrentMonthId(), hp, maxHp);

  // Roter Rand-Glow hinter dem Boss wird intensiver, je weniger
  // HP übrig sind
  bossRageLevel = 1 - percent / 100;
  document.documentElement.style.setProperty("--boss-rage", bossRageLevel.toFixed(2));

  const isDefeated = data.defeated || hp <= 0;

  if (defeatedBanner) {
    defeatedBanner.style.display = isDefeated ? "block" : "none";
    defeatedBanner.textContent = isDefeated ? boss.defeatMessage : "";
  }
  if (attackBtn) attackBtn.style.display = isDefeated ? "none" : "inline-flex";
}

function updateBossResetCountdown(resetEl) {
  if (!resetEl) return;

  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft = Math.ceil((nextMonth - now) / (1000 * 60 * 60 * 24));

  resetEl.textContent = `🔄 Neuer Boss in ${daysLeft} Tag(en)`;
}

/* ------------------------------------------------------
   ANGREIFEN
------------------------------------------------------ */
async function attackCommunityBoss() {
  const attackBtn = document.getElementById("boss-attack-btn");
  const statusEl = document.getElementById("boss-status");
  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname || !supabaseClient || hasAttackedToday()) return;
  if (attackBtn) attackBtn.disabled = true;

  const cfg = typeof communityBossConfig !== "undefined" ? communityBossConfig : { minDamagePerAttack: 15, maxDamagePerAttack: 45 };
  const damage = Math.floor(cfg.minDamagePerAttack + Math.random() * (cfg.maxDamagePerAttack - cfg.minDamagePerAttack));

  const monthId = getCurrentMonthId();

  try {
    if (typeof wheelAuthReady !== "undefined") {
      await wheelAuthReady;
    }

    // app.attack_community_boss() statt Read-dann-Write: community_boss
    // ist eine GEMEINSAME Zeile, die viele Spieler gleichzeitig treffen -
    // nur ein echtes serverseitiges relatives UPDATE (wie Firestores
    // FieldValue.increment() zuvor) verliert dabei keinen Schaden durch
    // ueberholte Zwischenstaende, siehe Kommentar in 03-race-boss.sql.
    const { data: rows, error: attackError } = await supabaseClient.rpc("attack_community_boss", {
      p_month_id: monthId,
      p_damage: damage,
    });
    if (attackError) throw attackError;
    const bossAfter = Array.isArray(rows) ? rows[0] : rows;
    if (!bossAfter) throw new Error("attack-failed");

    await recordBossDamage(monthId, nickname, damage);

    // Rein additiv, NACH den bereits erfolgreichen Supabase-Schreib-
    // vorgaengen oben - siehe scripts/supabase/supabase-games.js. Ein
    // Fehlschlag hier kann den eigentlichen Angriff nicht beeinflussen.
    if (typeof logBossAttackToSupabase === "function") {
      logBossAttackToSupabase(nickname, monthId, damage);
    }

    localStorage.setItem(getBossDailyAttackKey(), todayStr());
    spawnBossHitEffect(damage);
    if (typeof awardActionXp === "function") awardActionXp("bossAttack");

    if (statusEl) statusEl.textContent = `⚔️ Du hast ${damage} Schaden verursacht! Komm morgen wieder.`;

    setTimeout(renderCommunityBossPage, 600);
    setTimeout(() => renderBossLeaderboard(monthId), 700);
  } catch (err) {
    console.warn("Angriff konnte nicht gespeichert werden:", err);
    if (statusEl) statusEl.textContent = "⚠️ Angriff ist fehlgeschlagen, versuch's nochmal.";
    if (attackBtn) attackBtn.disabled = false;
  }
}

/* ------------------------------------------------------
   SCHADEN PRO SPIELER MERKEN (für Rangliste + Top-3-Belohnung)
------------------------------------------------------ */
async function recordBossDamage(monthId, nickname, damage) {
  if (!supabaseClient) return;

  const uid = await wheelAuthReady;
  if (!uid) return;

  const provider = localStorage.getItem("loginProvider") || "";
  let avatar = null;
  if (provider === "discord") avatar = localStorage.getItem("discordAvatar") || null;
  else if (provider === "twitch") avatar = localStorage.getItem("twitchAvatar") || null;
  else avatar = localStorage.getItem("wheelAvatar") || null;

  const equippedFrame = localStorage.getItem("equippedFrame") || null;

  const { data: current, error: readError } = await supabaseClient
    .from("community_boss_damage")
    .select("total_damage")
    .eq("month_id", monthId)
    .eq("firebase_uid", uid)
    .maybeSingle();
  if (readError) throw readError;

  const newTotal = ((current && current.total_damage) || 0) + damage;

  await supabaseClient.from("community_boss_damage").upsert(
    { month_id: monthId, firebase_uid: uid, nickname, avatar, equipped_frame: equippedFrame, total_damage: newTotal },
    { onConflict: "month_id,firebase_uid" }
  );
}

/* ------------------------------------------------------
   RANGLISTE DER TOP-ANGREIFER
------------------------------------------------------ */
async function renderBossLeaderboard(monthId) {
  const container = document.getElementById("boss-leaderboard");
  if (!container || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient
      .from("community_boss_damage")
      .select("firebase_uid, nickname, avatar, equipped_frame, total_damage")
      .eq("month_id", monthId)
      .order("total_damage", { ascending: false })
      .limit(10);
    if (error) throw error;

    if (!data || !data.length) {
      container.innerHTML = `<p class="wheel-status">Noch niemand hat angegriffen - sei der/die Erste!</p>`;
      return;
    }

    const ownUid = typeof wheelAuthReady !== "undefined" ? await wheelAuthReady : null;
    const capWinnerUids = typeof fetchPassCapWinnerUids === "function" ? await fetchPassCapWinnerUids() : new Set();

    let html = "";
    data.forEach((p, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      const isOwn = p.firebase_uid === ownUid;
      const frameStyle = typeof frameStyleFromId === "function" ? frameStyleFromId(p.equipped_frame) : "";
      const frameRowClass = typeof rowFrameClass === "function" ? rowFrameClass(frameStyle) : "";
      let avatarHtml =
        p.avatar && typeof isAvatarImagePath === "function"
          ? isAvatarImagePath(p.avatar)
            ? `<img src="${p.avatar}" class="leaderboard-avatar" alt="" loading="lazy" decoding="async">`
            : `<span class="leaderboard-avatar leaderboard-avatar-emoji">${p.avatar}</span>`
          : "";

      if (typeof wrapAvatarWithFrame === "function") {
        avatarHtml = wrapAvatarWithFrame(avatarHtml, frameStyle);
      }
      if (typeof wrapAvatarWithCapBadge === "function") {
        avatarHtml = wrapAvatarWithCapBadge(avatarHtml, capWinnerUids.has(p.firebase_uid));
      }

      html += `
        <div class="boss-leaderboard-row ${frameRowClass}${rank <= 3 ? " boss-leaderboard-top" : ""}${isOwn ? " boss-leaderboard-own" : ""}">
          <span class="boss-leaderboard-rank">${medal}</span>
          <span class="boss-leaderboard-name">${avatarHtml}${escapeHtmlBoss(p.nickname || "Unbekannt")}${isOwn ? " (Du)" : ""}</span>
          <span class="boss-leaderboard-damage">${(p.total_damage || 0).toLocaleString("de-DE")} Schaden</span>
          ${rank <= 3 ? `<span class="boss-leaderboard-reward">🏆 +${BOSS_REWARDS_BY_RANK[rank - 1]} 💰</span>` : ""}
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.warn("Boss-Rangliste konnte nicht geladen werden:", err);
  }
}

function escapeHtmlBoss(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ------------------------------------------------------
   TOP-3-BELOHNUNG BEI BESIEGTEM BOSS
   Wer gerade die Seite besucht UND zu den Top 3 Schaden-
   Verursachern des Monats gehört, bekommt den Boss-Bezwinger-
   Avatar freigeschaltet (passiert also beim nächsten Besuch
   nach dem Sieg, nicht zwingend live in dem Moment).
------------------------------------------------------ */
async function checkBossSlayerReward(monthId) {
  if (!supabaseClient) return;

  try {
    const ownUid = typeof wheelAuthReady !== "undefined" ? await wheelAuthReady : null;
    if (!ownUid) return;

    const { data, error } = await supabaseClient
      .from("community_boss_damage")
      .select("firebase_uid")
      .eq("month_id", monthId)
      .order("total_damage", { ascending: false })
      .limit(3);
    if (error) throw error;

    const ownIndex = (data || []).findIndex((row) => row.firebase_uid === ownUid);
    if (ownIndex >= 0 && typeof unlockAvatar === "function") {
      unlockAvatar("boss-slayer");
    }

    // Dublonen nach Platzierung, einmal pro Monat (localStorage-Sperre)
    const claimKey = `bossRewardClaimed_${monthId}`;
    if (!localStorage.getItem(claimKey)) {
      localStorage.setItem(claimKey, "1");

      const rewardsByRank = BOSS_REWARDS_BY_RANK;
      if (ownIndex >= 0 && rewardsByRank[ownIndex] && typeof addCurrency === "function") {
        addCurrency(rewardsByRank[ownIndex]);
      }
    }
  } catch (err) {
    console.warn("Top-3-Prüfung fehlgeschlagen:", err);
  }
}

function spawnBossHitEffect(damage) {
  const stage = document.getElementById("boss-stage");
  if (!stage || !bossCanvas) return;

  const now = performance.now();
  const kind = BOSS_ATTACK_KINDS[Math.floor(Math.random() * BOSS_ATTACK_KINDS.length)];

  spawnBossAttackEffect(kind, bossCanvas.width, bossCanvas.height);

  // Bildschirm-Wackler + kurzer Weißblitz, zeitlich an den jeweiligen
  // Effekt angepasst (jeder Angriffstyp braucht unterschiedlich lang,
  // bis er "einschlägt")
  const impactDelayByKind = { shot: 230, saber: 130, harpoon: 290, curse: 380 };
  const impactDelay = impactDelayByKind[kind] || 200;
  bossShakeUntil = now + impactDelay + 220;
  setTimeout(() => {
    const impactTime = performance.now();
    bossHitFlashUntil = impactTime + 180;
    bossRecoilUntil = impactTime + 260;
    bossRecoilDir = Math.random() < 0.5 ? -1 : 1;
    spawnBossSmokeBurst(bossCanvas.width, bossCanvas.height);
  }, impactDelay);

  // Schwebende Schadenszahl (bleibt DOM-basiert, gut lesbar)
  const hit = document.createElement("div");
  hit.className = "boss-hit-number";
  hit.textContent = `-${damage}`;
  hit.style.left = 40 + Math.random() * 20 + "%";
  setTimeout(() => {
    stage.appendChild(hit);
    setTimeout(() => hit.remove(), 1200);
  }, impactDelay);

  if (typeof triggerCodeSuccessEffect === "function") {
    setTimeout(() => triggerCodeSuccessEffect(), impactDelay);
  }

  setTimeout(triggerBossArenaImpact, impactDelay);
}

/* ------------------------------------------------------
   DOM-WEITER IMPACT (zusätzlich zum Canvas-internen Zittern)
   Kurzer Arena-weiter Screen-Shake + Treffer-Flash, sehr kurz
   (< 400ms) und ausschließlich über transform/opacity - siehe
   Punkt 6/33 (kein Dauer-Effekt, keine top/left-Animation).
------------------------------------------------------ */
function triggerBossArenaImpact() {
  const panel = document.getElementById("fh-boss-panel");
  const wrap = document.getElementById("fh-boss-stage-wrap");
  [panel, wrap].forEach((el) => {
    if (!el) return;
    el.classList.remove("fh-boss-impact");
    void el.offsetWidth;
    el.classList.add("fh-boss-impact");
  });

  // Kurzer "Kamera-Ruck" (Skalier-Punch, unabhängig vom Zittern oben) -
  // nur auf der Bühne selbst, damit es wie ein Treffer aus Kamerasicht
  // wirkt statt nur wie ein wackelnder Rahmen.
  if (wrap) {
    wrap.classList.remove("fh-boss-camera-jolt");
    void wrap.offsetWidth;
    wrap.classList.add("fh-boss-camera-jolt");
  }
}

/* ------------------------------------------------------
   ARENA-GLUT-PARTIKEL
   Wiederverwendet die bereits vorhandene .fh-ember-Klasse/
   Keyframe-Animation (siehe scripts/home/cinematic.js /
   style.css) - spawnt sie einmalig in den Arena-Hintergrund.
------------------------------------------------------ */
let bossEmbersSpawned = false;

function spawnBossArenaEmbers() {
  const layer = document.getElementById("fh-boss-embers");
  if (!layer || bossEmbersSpawned || layer.childElementCount) return;
  bossEmbersSpawned = true;

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  const count = isMobile ? 7 : 16;

  for (let i = 0; i < count; i++) {
    const ember = document.createElement("span");
    ember.className = "fh-ember";
    ember.style.setProperty("--fh-ember-x", `${Math.random() * 100}%`);
    ember.style.setProperty("--fh-ember-delay", `${(Math.random() * 6).toFixed(2)}s`);
    ember.style.setProperty("--fh-ember-duration", `${(5 + Math.random() * 5).toFixed(2)}s`);
    layer.appendChild(ember);
  }
}

/* ------------------------------------------------------
   BOSS-EINTRITTSSEQUENZ (Punkt 5)
   Spielt nur einmal pro Seitenbesuch: Hintergrund dunkelt ab
   und Nebel bewegt sich (CSS-Klasse auf der Arena), die Bühne
   skaliert/scaled ein, danach Name/HP-Bar/UI zeitversetzt.
   Wird zurückgesetzt, sobald man die Seite verlässt.
------------------------------------------------------ */
let bossEntranceShown = false;

function playBossEntrance() {
  const arenaBg = document.getElementById("fh-boss-arena-bg");
  const panel = document.getElementById("boss-content-panel");

  if (arenaBg) {
    arenaBg.classList.remove("fh-boss-arena-play");
    void arenaBg.offsetWidth;
    arenaBg.classList.add("fh-boss-arena-play");
  }
  if (panel) {
    panel.classList.remove("fh-boss-entrance-play");
    void panel.offsetWidth;
    panel.classList.add("fh-boss-entrance-play");
  }
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateCommunityBossPage(pageID) {
  if (pageID !== "community-boss") {
    stopBossRender();
    stopBossCounterattackTimer();
    bossEntranceShown = false;
    return;
  }

  if (!bossEntranceShown) {
    bossEntranceShown = true;
    playBossEntrance();
  }
  spawnBossArenaEmbers();

  renderCommunityBossPage();
}

/* ------------------------------------------------------
   BOSS-GEGENANGRIFF
   Alle 5 Minuten, solange man auf der Boss-Seite ist, schlägt
   der Boss zurück: der Bildschirm blitzt rot auf, damit sich
   der Kampf auch dann noch "lebendig" anfühlt, wenn man länger
   auf der Seite bleibt. Rein atmosphärisch, kostet keine HP.
------------------------------------------------------ */
const BOSS_COUNTERATTACK_INTERVAL = 5 * 60 * 1000;
let bossCounterattackTimer = null;

function startBossCounterattackTimer() {
  if (bossCounterattackTimer) return;
  bossCounterattackTimer = setInterval(triggerBossCounterattack, BOSS_COUNTERATTACK_INTERVAL);
}

function stopBossCounterattackTimer() {
  clearInterval(bossCounterattackTimer);
  bossCounterattackTimer = null;
}

function triggerBossCounterattack() {
  const flash = document.getElementById("boss-counter-flash");
  const stage = document.getElementById("boss-stage");
  const statusEl = document.getElementById("boss-status");
  if (!flash) return;

  flash.classList.remove("active");
  void flash.offsetWidth;
  flash.classList.add("active");

  // Boss-Kreatur reagiert im selben Moment (Augen/Aura kurz greller)
  bossHitFlashUntil = performance.now() + 0; // kein Weißblitz im Canvas, nur Aura
  bossCounterAuraUntil = performance.now() + 700;
  bossShakeUntil = performance.now() + 350;

  if (navigator.vibrate) navigator.vibrate([40, 60, 40]);

  if (statusEl) {
    const prevText = statusEl.textContent;
    statusEl.textContent = "💥 Der Boss schlägt zurück!";
    setTimeout(() => {
      if (statusEl.textContent === "💥 Der Boss schlägt zurück!") {
        statusEl.textContent = prevText;
      }
    }, 2200);
  }

  setTimeout(() => flash.classList.remove("active"), 700);
}
