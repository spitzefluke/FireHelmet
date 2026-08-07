/* ======================================================
   COUNTDOWN RISS-EFFEKT
   Stufen (anhand Resttage bis targetDate aus countdown.js):
   0  = normal (>50 Tage)
   1  = ≤50 Tage: etwas mehr Partikel/Sternschnuppen
   2  = ≤40 Tage: noch mehr
   3  = ≤30 Tage: erste Risse erscheinen langsam
   4  = ≤20 Tage: mehr und größere Risse
   5  = ≤10 Tage: zersplittert, Bild scheint ganz leicht
       und unscharf durch
====================================================== */

let currentHomeTier = 0;
let homeTierInterval = null;

function getDaysUntilTarget() {
  if (typeof targetDate === "undefined") return 999;
  const diff = targetDate - new Date();
  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

function getHomeTier(daysLeft) {
  if (daysLeft <= 10) return 5;
  if (daysLeft <= 20) return 4;
  if (daysLeft <= 30) return 3;
  if (daysLeft <= 40) return 2;
  if (daysLeft <= 50) return 1;
  return 0;
}

/* Wird von main.js (spawnParticle/startHomeEffects) genutzt,
   um Partikel-/Sternschnuppen-Tempo an die Stufe anzupassen */
function getHomeIntensityMultiplier() {
  // Stufe 0-2: leicht steigend, Stufe 3+: bleibt bei "viel", der
  // Fokus verschiebt sich dann auf die Risse statt noch mehr Partikel
  return 1 + Math.min(currentHomeTier, 2) * 0.6;
}

function applyHomeTier(tier) {
  const layer = document.getElementById("home-crack-layer");
  if (!layer) return;

  // Klassen kumulativ setzen (tier-1 bis zur aktuellen Stufe),
  // damit CSS je Riss/Effekt einfach nach Stufe schalten kann
  layer.className = "home-crack-layer";
  for (let i = 1; i <= tier; i++) {
    layer.classList.add(`home-tier-${i}`);
  }

  // Enthüllungsbild ab Stufe 5 einblenden (falls eines hinterlegt ist)
  const img = document.getElementById("home-reveal-image");
  if (img && typeof homeCrackConfig !== "undefined" && homeCrackConfig.revealImage) {
    if (tier >= 5 && !img.getAttribute("src")) {
      img.src = homeCrackConfig.revealImage;
    }
  }
}

function updateHomeTier() {
  const daysLeft = getDaysUntilTarget();
  const tier = getHomeTier(daysLeft);

  if (tier !== currentHomeTier) {
    currentHomeTier = tier;
    applyHomeTier(tier);

    // Partikel-/Sternschnuppen-Tempo neu anwenden, falls gerade aktiv
    if (typeof restartHomeEffectsIntensity === "function") {
      restartHomeEffectsIntensity();
    }
  }
}

function startHomeTierWatch() {
  updateHomeTier();
  clearInterval(homeTierInterval);
  homeTierInterval = setInterval(updateHomeTier, 60000); // reicht 1x/Minute
}

window.addEventListener("DOMContentLoaded", () => {
  startHomeTierWatch();
});
