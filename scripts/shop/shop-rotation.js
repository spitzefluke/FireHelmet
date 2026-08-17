/* ======================================================
   SCHWARZMARKT-ROTATION
   ---------------------------------------------------
   Alle FIRE_HELMET_CONFIG.shopRotationMinutes (Standard: 60)
   wechselt das Schaufenster des Shops. Die Auswahl wird NICHT
   per setInterval(random) gewürfelt (dabei würde jeder Besucher
   eine andere Auswahl sehen), sondern deterministisch aus einem
   gemeinsamen Zeitfenster berechnet:

       Zyklus = floor(Zeitstempel / (Rotationsminuten * 60000))

   Aus diesem Zyklus wird über einen einfachen, seed-baren
   Zufallsgenerator (mulberry32) IMMER dieselbe Auswahl erzeugt -
   für alle Besucher innerhalb derselben Stunde identisch, und
   reproduzierbar testbar (siehe getShopRotation weiter unten).

   WICHTIG: Das hier steuert nur, welche Artikel aus dem
   bestehenden Katalog (scripts/shop/shop-data.js) gerade "im
   Schaufenster" stehen. Die Kauf-/Besitz-Logik in scripts/shop/
   shop.js bleibt unverändert und arbeitet weiterhin direkt mit
   den echten Artikel-IDs - bereits besessene Artikel werden
   unabhängig von der Rotation immer weiter angezeigt, damit man
   sie jederzeit ausrüsten/verwalten kann.
====================================================== */

/* ------------------------------------------------------
   Deterministischer PRNG (mulberry32) - aus einer Zahl (Seed)
   entsteht IMMER dieselbe Folge von "Zufalls"-Werten.
------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates, aber mit dem übergebenen (seed-baren) rng statt Math.random
function seededShuffle(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ------------------------------------------------------
   GEWICHTETE SELTENHEITS-AUSWAHL
   Kein "items.sort(() => Math.random()-0.5)" - stattdessen wird
   zuerst (gewichtet nach FIRE_HELMET_CONFIG.rarities[*].weight)
   eine Seltenheitsstufe gezogen, danach ein zufälliges Item
   genau dieser Stufe. Je seltener die Stufe, desto kleiner ihr
   Gewicht und desto unwahrscheinlicher taucht sie auf.
------------------------------------------------------ */
function getRarityWeight(rarityKey) {
  if (typeof FIRE_HELMET_CONFIG === "undefined") return 1;
  const info = FIRE_HELMET_CONFIG.rarities[rarityKey];
  return info && typeof info.weight === "number" ? info.weight : 1;
}

function weightedPickRarity(rng, rarityKeys) {
  const total = rarityKeys.reduce((sum, key) => sum + getRarityWeight(key), 0);
  if (total <= 0) return rarityKeys[0] || null;

  let roll = rng() * total;
  for (const key of rarityKeys) {
    const w = getRarityWeight(key);
    if (roll < w) return key;
    roll -= w;
  }
  return rarityKeys[rarityKeys.length - 1];
}

/* Wählt "slots" Artikel aus "pool" (schon nach Kategorie gefiltert):
   pro Slot wird erst eine verfügbare Seltenheit gewichtet gezogen,
   dann ein zufälliges Item genau dieser Seltenheit - jeweils ohne
   Zurücklegen, damit keine Duplikate entstehen. Deterministisch,
   solange derselbe (seed-bare) rng verwendet wird. */
function weightedPickItems(pool, slots, rng) {
  const remaining = pool.slice();
  const picked = [];

  while (picked.length < slots && remaining.length > 0) {
    const rarityKeys = [...new Set(remaining.map((item) => item.rarity || "common"))];
    const rarity = weightedPickRarity(rng, rarityKeys);
    const candidates = remaining.filter((item) => (item.rarity || "common") === rarity);
    const chosen = candidates[Math.floor(rng() * candidates.length)];

    picked.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }

  return picked;
}

/* ------------------------------------------------------
   ZYKLUS AUS ZEITSTEMPEL BERECHNEN
   Exportiert für Tests, siehe Punkt 35 des Auftrags:
   getShopRotation(new Date("...").getTime()) lässt sich mit
   beliebigen Zeitstempeln aufrufen, ohne eine Stunde zu warten.
   Kein sichtbares User-Feature, rein intern nutzbar
   (z.B. aus der Browser-Konsole).
------------------------------------------------------ */
function getShopRotationCycle(timestamp) {
  const minutes = (typeof FIRE_HELMET_CONFIG !== "undefined" && FIRE_HELMET_CONFIG.shopRotationMinutes) || 60;
  return Math.floor(timestamp / (minutes * 60000));
}

function getShopRotationCycleEndMs(timestamp) {
  const minutes = (typeof FIRE_HELMET_CONFIG !== "undefined" && FIRE_HELMET_CONFIG.shopRotationMinutes) || 60;
  const windowMs = minutes * 60000;
  const cycle = getShopRotationCycle(timestamp);
  return (cycle + 1) * windowMs;
}

/* ------------------------------------------------------
   AKTUELLE ROTATION BERECHNEN
   Gibt { cycle, itemIds } zurück. itemIds enthält die IDs aller
   Artikel, die in diesem Zyklus "im Schaufenster" stehen -
   pro Kategorie (type) maximal shopRotationSlotsPerType[type]
   Stück, deterministisch aus dem Katalog gewählt.
------------------------------------------------------ */
function getShopRotation(timestamp) {
  const ts = typeof timestamp === "number" ? timestamp : Date.now();
  const cycle = getShopRotationCycle(ts);

  if (typeof shopItems === "undefined") {
    return { cycle, itemIds: [] };
  }

  const slotsPerType = (typeof FIRE_HELMET_CONFIG !== "undefined" && FIRE_HELMET_CONFIG.shopRotationSlotsPerType) || {};
  const types = [...new Set(shopItems.map((item) => item.type))];
  const itemIds = [];

  types.forEach((type, typeIndex) => {
    // Jede Kategorie bekommt einen eigenen (aber weiterhin vom
    // Zyklus abgeleiteten) Seed, damit nicht z.B. immer nur die
    // ersten N Rahmen UND die ersten N Avatare zusammen wechseln.
    const rng = mulberry32(cycle * 1000 + typeIndex * 37 + 7);
    const pool = shopItems.filter((item) => item.type === type);
    const slots = Math.min(slotsPerType[type] || pool.length, pool.length);
    weightedPickItems(pool, slots, rng).forEach((item) => itemIds.push(item.id));
  });

  return { cycle, itemIds };
}

/* ------------------------------------------------------
   LIVE-COUNTDOWN + AUTOMATISCHER ROTATIONSWECHSEL
------------------------------------------------------ */
let shopRotationInterval = null;
let shopRotationLastCycle = null;

function formatShopCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function tickShopRotation() {
  const countdownEl = document.getElementById("shop-rotation-countdown");
  const now = Date.now();
  const rotation = getShopRotation(now);

  if (shopRotationLastCycle === null) {
    shopRotationLastCycle = rotation.cycle;
  } else if (rotation.cycle !== shopRotationLastCycle) {
    shopRotationLastCycle = rotation.cycle;
    if (typeof renderShopGrid === "function") renderShopGrid({ quiet: true });
    showShopRotationToast();
    flashShopContentRefresh();
  }

  if (countdownEl) {
    countdownEl.textContent = formatShopCountdown(getShopRotationCycleEndMs(now) - now);
  }
}

function startShopRotationCountdown() {
  if (shopRotationInterval) return;
  tickShopRotation();
  shopRotationInterval = setInterval(tickShopRotation, 1000);
}

function stopShopRotationCountdown() {
  clearInterval(shopRotationInterval);
  shopRotationInterval = null;
}

// Kurzer Aufhell-Puls auf dem Shop-Inhalt bei Rotationswechsel -
// bewusst deutlich kürzer/leiser als die volle Eingangssequenz
// (siehe Punkt 11: nicht bei jedem Update die große Animation).
function flashShopContentRefresh() {
  const content = document.querySelector("#shop .shop-content");
  if (!content) return;
  content.classList.remove("fh-shop-content-refresh");
  void content.offsetWidth;
  content.classList.add("fh-shop-content-refresh");
}

function showShopRotationToast() {
  const toast = document.getElementById("shop-rotation-toast");
  if (!toast) return;
  toast.classList.remove("visible");
  void toast.offsetWidth;
  toast.classList.add("visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 4200);
}
