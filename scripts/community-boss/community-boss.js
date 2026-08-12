/* ======================================================
   COMMUNITY-BOSS
   Ein gemeinsamer Gegner (geteilte HP in Firestore), den alle
   Besucher zusammen innerhalb eines Kalendermonats besiegen.
   Jeder darf einmal am Tag angreifen. Am Monatsanfang beginnt
   automatisch eine neue Runde mit vollen HP und einem neuen Boss.

   Der Boss wird als animierte Canvas-Kreatur gezeichnet (nicht
   nur ein Emoji) - jeder Boss-Typ hat sein eigenes Aussehen,
   Idle-Bewegung und Themen-Partikel. Angriffe wechseln zufällig
   zwischen zwei Effekten: Kanonenschuss oder Säbel-Hieb.
====================================================== */

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

  bossCtx.save();
  bossCtx.translate(cx, cy + bob);
  bossCtx.scale(breathe, breathe);

  if (boss.type === "storm") drawStormDemon(time, boss);
  else if (boss.type === "ghost-captain") drawGhostCaptain(time, boss);
  else if (boss.type === "serpent") drawSeaSerpent(time, boss);
  else drawKraken(time, boss);

  bossCtx.restore();
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

function drawKraken(time, boss) {
  const ctx = bossCtx;

  // Tentakel, jeder mit eigener Wellenbewegung
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 5) * (i - 2.5);
    const wave = Math.sin(time / 500 + i) * 18;
    ctx.strokeStyle = boss.color;
    ctx.lineWidth = 13 - i * 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * 30, 40);
    ctx.quadraticCurveTo(
      Math.sin(angle) * 90 + wave, 110,
      Math.sin(angle) * 60 + wave * 1.6, 175 + Math.abs(wave) * 0.3
    );
    ctx.stroke();
  }

  // Kopf/Mantel
  const grad = ctx.createRadialGradient(-20, -30, 10, 0, 0, 100);
  grad.addColorStop(0, "#c2601f");
  grad.addColorStop(1, boss.color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, -20, 85, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  drawGlowEyes([[-28, -30], [28, -30]], "rgba(255,80,60,.95)", 11);

  // Pupillen
  ctx.fillStyle = "#1a0a05";
  ctx.beginPath();
  ctx.arc(-28, -30, 4, 0, Math.PI * 2);
  ctx.arc(28, -30, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStormDemon(time, boss) {
  const ctx = bossCtx;

  // Wirbelnder Sturm-Körper (mehrere rotierende, versetzte Ellipsen)
  for (let i = 0; i < 5; i++) {
    const t = time / 600 + i * 0.7;
    const ringY = -60 + i * 30;
    const ringW = 100 - i * 12;
    ctx.beginPath();
    ctx.ellipse(Math.sin(t) * 10, ringY, ringW, 22, Math.sin(t) * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(28, 79, 143, ${0.55 - i * 0.07})`;
    ctx.fill();
  }

  drawGlowEyes([[-22, -20], [22, -20]], "rgba(255,255,255,.95)", 10);
  ctx.fillStyle = "#0a1520";
  ctx.beginPath();
  ctx.arc(-22, -20, 4, 0, Math.PI * 2);
  ctx.arc(22, -20, 4, 0, Math.PI * 2);
  ctx.fill();

  // Blitz-Krone oben
  ctx.strokeStyle = "rgba(220,235,255,.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -100);
  ctx.lineTo(5, -80);
  ctx.lineTo(-5, -78);
  ctx.lineTo(10, -55);
  ctx.stroke();
}

function drawGhostCaptain(time, boss) {
  const ctx = bossCtx;
  const flicker = 0.85 + Math.sin(time / 250) * 0.15;

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

  // Dreispitz-Hut
  ctx.fillStyle = "#1c1006";
  ctx.beginPath();
  ctx.moveTo(-55, -55);
  ctx.quadraticCurveTo(0, -100, 55, -55);
  ctx.quadraticCurveTo(0, -70, -55, -55);
  ctx.fill();

  // Totenkopf-Gesicht
  ctx.fillStyle = `rgba(230,225,210,${flicker})`;
  ctx.beginPath();
  ctx.arc(0, -25, 34, 0, Math.PI * 2);
  ctx.fill();

  drawGlowEyes([[-13, -28], [13, -28]], "rgba(120,255,170,.95)", 8);

  ctx.fillStyle = "#1a0a05";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(-5, -5);
  ctx.lineTo(5, -5);
  ctx.closePath();
  ctx.fill();
}

function drawSeaSerpent(time, boss) {
  const ctx = bossCtx;

  // Geschwungener Körper aus Segmenten
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

  // Kopf am vorderen Ende
  const headX = 110;
  const headY = Math.sin(2.4 * Math.PI + time / 500) * 45;
  ctx.fillStyle = boss.color;
  ctx.beginPath();
  ctx.ellipse(headX, headY, 30, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  drawGlowEyes([[headX + 8, headY - 8]], "rgba(255,220,60,.95)", 6);

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
  } else {
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
  }
}

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

      // Einschlag am Ziel
      if (t > 0.9) {
        const impactT = (t - 0.9) / 0.1;
        bossCtx.beginPath();
        bossCtx.arc(fx.toX, fx.toY, 10 + impactT * 35, 0, Math.PI * 2);
        bossCtx.strokeStyle = `rgba(255,180,80,${1 - impactT})`;
        bossCtx.lineWidth = 4;
        bossCtx.stroke();
      }
    } else {
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
    }
  });
}

/* ------------------------------------------------------
   BOSS-ZUSTAND AUS FIRESTORE LADEN
------------------------------------------------------ */
async function loadBossState() {
  if (!wheelDb) return null;

  if (typeof wheelAuthReady !== "undefined") {
    await wheelAuthReady;
  }

  const monthId = getCurrentMonthId();
  const docRef = wheelDb.collection("community_boss").doc(monthId);
  const snap = await docRef.get();

  if (snap.exists) {
    return { ref: docRef, data: snap.data() };
  }

  // Erste Anfrage in diesem Monat -> neuen Boss mit vollen HP anlegen
  const maxHp = typeof communityBossConfig !== "undefined" ? communityBossConfig.maxHp : 5000;
  const initialData = { hp: maxHp, maxHp, defeated: false };

  try {
    await docRef.set(initialData);
  } catch (err) {
    // Ein anderer Besucher war evtl. eine Millisekunde schneller - kein Problem,
    // wir lesen unten einfach nochmal
  }

  const freshSnap = await docRef.get();
  return { ref: docRef, data: freshSnap.exists ? freshSnap.data() : initialData };
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

  if (!wheelDb) {
    if (statusEl) statusEl.textContent = "⚠️ Verbindung nicht verfügbar - versuch's später nochmal.";
    if (attackBtn) attackBtn.disabled = true;
    return;
  }

  const state = await loadBossState();
  if (!state) return;

  applyBossHpDisplay(state.data, hpTextEl, hpFillEl, boss, defeatedBanner, attackBtn);

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

function applyBossHpDisplay(data, hpTextEl, hpFillEl, boss, defeatedBanner, attackBtn) {
  const hp = Math.max(0, data.hp);
  const maxHp = data.maxHp || 1;
  const percent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  if (hpTextEl) hpTextEl.textContent = `${hp.toLocaleString("de-DE")} / ${maxHp.toLocaleString("de-DE")} HP`;
  if (hpFillEl) hpFillEl.style.width = `${percent}%`;

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

  if (!nickname || !wheelDb || hasAttackedToday()) return;
  if (attackBtn) attackBtn.disabled = true;

  const cfg = typeof communityBossConfig !== "undefined" ? communityBossConfig : { minDamagePerAttack: 15, maxDamagePerAttack: 45 };
  const damage = Math.floor(cfg.minDamagePerAttack + Math.random() * (cfg.maxDamagePerAttack - cfg.minDamagePerAttack));

  const monthId = getCurrentMonthId();
  const docRef = wheelDb.collection("community_boss").doc(monthId);

  try {
    if (typeof wheelAuthReady !== "undefined") {
      await wheelAuthReady;
    }

    await docRef.update({
      hp: firebase.firestore.FieldValue.increment(-damage),
    });

    localStorage.setItem(getBossDailyAttackKey(), todayStr());
    spawnBossHitEffect(damage);

    if (statusEl) statusEl.textContent = `⚔️ Du hast ${damage} Schaden verursacht! Komm morgen wieder.`;

    const snap = await docRef.get();
    const data = snap.data();
    if (data.hp <= 0 && !data.defeated) {
      await docRef.update({ defeated: true, hp: 0 });
    }

    setTimeout(renderCommunityBossPage, 600);
  } catch (err) {
    console.warn("Angriff konnte nicht gespeichert werden:", err);
    if (statusEl) statusEl.textContent = "⚠️ Angriff ist fehlgeschlagen, versuch's nochmal.";
    if (attackBtn) attackBtn.disabled = false;
  }
}

function spawnBossHitEffect(damage) {
  const stage = document.getElementById("boss-stage");
  if (!stage || !bossCanvas) return;

  const now = performance.now();
  const kind = Math.random() < 0.5 ? "shot" : "saber";

  spawnBossAttackEffect(kind, bossCanvas.width, bossCanvas.height);

  // Bildschirm-Wackler + kurzer Weißblitz, zeitlich an den Effekt angepasst
  const impactDelay = kind === "shot" ? 230 : 130;
  bossShakeUntil = now + impactDelay + 220;
  setTimeout(() => {
    bossHitFlashUntil = performance.now() + 180;
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
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateCommunityBossPage(pageID) {
  if (pageID !== "community-boss") {
    stopBossRender();
    return;
  }
  renderCommunityBossPage();
}
