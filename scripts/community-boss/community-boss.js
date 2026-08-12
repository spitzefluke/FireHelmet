/* ======================================================
   COMMUNITY-BOSS
   Ein gemeinsamer Gegner (geteilte HP in Firestore), den alle
   Besucher zusammen innerhalb eines Kalendermonats besiegen.
   Jeder darf einmal am Tag angreifen. Am Monatsanfang beginnt
   automatisch eine neue Runde mit vollen HP und einem neuen Boss.
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
  const emojiEl = document.getElementById("boss-emoji");
  const flavorEl = document.getElementById("boss-flavor");
  const hpTextEl = document.getElementById("boss-hp-text");
  const hpFillEl = document.getElementById("boss-hp-fill");
  const attackBtn = document.getElementById("boss-attack-btn");
  const statusEl = document.getElementById("boss-status");
  const resetEl = document.getElementById("boss-reset-countdown");
  const defeatedBanner = document.getElementById("boss-defeated-banner");

  if (!boss || !nameEl) return;

  nameEl.textContent = boss.name;
  emojiEl.textContent = boss.emoji;
  flavorEl.textContent = boss.flavorText;
  document.documentElement.style.setProperty("--boss-accent", boss.color);

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
  if (!stage) return;

  const hit = document.createElement("div");
  hit.className = "boss-hit-number";
  hit.textContent = `-${damage}`;
  hit.style.left = 40 + Math.random() * 20 + "%";
  stage.appendChild(hit);
  setTimeout(() => hit.remove(), 1200);

  stage.classList.remove("boss-shake");
  void stage.offsetWidth;
  stage.classList.add("boss-shake");

  if (typeof triggerCodeSuccessEffect === "function") {
    triggerCodeSuccessEffect();
  }
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateCommunityBossPage(pageID) {
  if (pageID !== "community-boss") return;
  renderCommunityBossPage();
}
