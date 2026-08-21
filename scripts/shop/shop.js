/* ======================================================
   SHOP
   - Zeigt den Katalog aus scripts/shop/shop-data.js als Grid
   - Zwei Kategorien: Avatar-Rahmen UND kaufbare Avatare
   - Kauf zieht Dublonen ab (Firestore-Transaktion) und schaltet
     den Artikel dauerhaft frei (players/{uid}.ownedShopItems)
   - Rahmen werden zusätzlich "ausgerüstet" (equippedFrame),
     Avatare erscheinen einfach im normalen Avatar-Picker
     (genau wie ein per Code freigeschalteter Avatar)
====================================================== */

let shopActiveTab = "frame";

function switchShopTab(tab) {
  shopActiveTab = tab;
  document.querySelectorAll(".shop-tab").forEach((btn) => {
    btn.classList.toggle("shop-tab-active", btn.dataset.shopTab === tab);
  });
  renderShopGrid();
}

function getOwnedShopItems() {
  try {
    return JSON.parse(localStorage.getItem("ownedShopItems") || "[]");
  } catch (err) {
    return [];
  }
}

function getEquippedFrame() {
  return localStorage.getItem("equippedFrame") || "";
}

function equipFrame(frameId) {
  const current = getEquippedFrame();
  // Nochmal draufklicken = ablegen
  localStorage.setItem("equippedFrame", current === frameId ? "" : frameId);

  if (typeof savePlayerData === "function") {
    savePlayerData({ equippedFrame: getEquippedFrame() });
  }

  renderShopGrid({ quiet: true });
  if (typeof renderAvatarPicker === "function") renderAvatarPicker();
}

/* ------------------------------------------------------
   SELTENHEIT: Anzeige-Infos aus der zentralen Konfiguration
   (scripts/core/fire-helmet-config.js) holen, mit robustem
   Fallback falls ein Artikel (noch) keine "rarity" hat.
------------------------------------------------------ */
function getRarityInfo(rarityKey) {
  const fallback = { order: 0, color: "#9aa4b2", glow: "154,164,178", label: { de: "Gewöhnlich", en: "Common" }, desc: { de: "", en: "" } };
  if (typeof FIRE_HELMET_CONFIG === "undefined") return fallback;
  return FIRE_HELMET_CONFIG.rarities[rarityKey] || fallback;
}

/* ------------------------------------------------------
   GRID AUFBAUEN
   options.quiet = true unterdrückt die Eintritts-Animation der
   Karten (siehe style.css .shop-grid-quiet) - genutzt bei Kauf/
   Ausrüsten, damit nicht bei jeder Kleinigkeit die komplette
   Eingangsanimation erneut abläuft. Ohne "quiet" (Seitenaufruf,
   Tab-Wechsel, Rotationswechsel) spielt sie ganz bewusst.
------------------------------------------------------ */
function renderShopGrid(options) {
  const grid = document.getElementById("shop-grid");
  if (!grid || typeof shopItems === "undefined") return;

  const quiet = !!(options && options.quiet);
  grid.classList.toggle("shop-grid-quiet", quiet);

  const owned = getOwnedShopItems();
  const equipped = getEquippedFrame();
  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";

  const rotation = typeof getShopRotation === "function" ? getShopRotation(Date.now()) : { itemIds: null };
  const inRotation = (id) => !rotation.itemIds || rotation.itemIds.includes(id);

  // Bereits besessene Artikel bleiben IMMER sichtbar (verwaltbar/
  // ausrüstbar), unabhängig von der aktuellen Rotation - nur noch
  // nicht besessene Artikel werden durch die Rotation gefiltert.
  const items = shopItems.filter((item) => item.type === shopActiveTab && (owned.includes(item.id) || inRotation(item.id)));

  grid.innerHTML = items
    .map((item) => {
      const isOwned = owned.includes(item.id);
      const isFrame = item.type === "frame";
      const isEquipped = isFrame && equipped === item.id;
      const rarity = getRarityInfo(item.rarity);
      const rarityLabel = rarity.label[lang] || rarity.label.de;

      let buttonHtml;
      if (isEquipped) {
        buttonHtml = `<button type="button" class="shop-item-btn shop-item-equipped" onclick="equipFrame('${item.id}')">✓ Ausgerüstet</button>`;
      } else if (isOwned && isFrame) {
        buttonHtml = `<button type="button" class="shop-item-btn shop-item-equip" onclick="equipFrame('${item.id}')">Ausrüsten</button>`;
      } else if (isOwned) {
        buttonHtml = `<button type="button" class="shop-item-btn shop-item-equipped" disabled>✓ Freigeschaltet</button>`;
      } else {
        buttonHtml = `<button type="button" class="shop-item-btn" onclick="buyShopItem('${item.id}')"><span class="shop-item-price">${item.price.toLocaleString("de-DE")} 💰</span> Kaufen</button>`;
      }

      const previewClass = isFrame ? `avatar-frame-${item.style}` : "";
      const categoryLabel = isFrame
        ? (lang === "en" ? "Avatar Frame" : "Avatar-Rahmen")
        : (lang === "en" ? "Avatar" : "Avatar");

      return `
        <div class="shop-item shop-item-rarity-${item.rarity || "common"} ${isOwned ? "shop-item-owned" : ""}" style="--rarity-color:${rarity.color};--rarity-glow:${rarity.glow};">
          <span class="shop-item-rarity-badge">${rarityLabel}</span>
          <button type="button" class="shop-item-info-btn" aria-expanded="false" aria-label="Info" onclick="toggleShopItemInfo(this)">i</button>

          <div class="shop-item-preview ${previewClass}">
            <span class="shop-item-emoji">${item.emoji}</span>
          </div>
          <p class="shop-item-name">${item.name}</p>
          ${buttonHtml}

          <div class="shop-item-info-panel" role="tooltip">
            <p class="shop-item-info-name">${item.emoji} ${item.name}</p>
            <p class="shop-item-info-rarity">${rarityLabel}</p>
            ${item.description ? `<p class="shop-item-info-desc">&bdquo;${item.description}&ldquo;</p>` : ""}
            <p class="shop-item-info-meta"><span>${categoryLabel}</span><span class="shop-item-price">${item.price.toLocaleString("de-DE")} 💰</span></p>
          </div>
        </div>
      `;
    })
    .join("");
}

/* ------------------------------------------------------
   ITEM-INFO EIN-/AUSBLENDEN (Touch/Klick)
   Auf Desktop erscheint das Panel zusätzlich schon bei :hover
   (siehe style.css) - dieser Klick-Toggle ist der verlässliche
   Weg für Touch-Geräte ohne echten Hover-Zustand.
------------------------------------------------------ */
function toggleShopItemInfo(btn) {
  const card = btn.closest(".shop-item");
  if (!card) return;

  const isOpen = card.classList.toggle("shop-item-info-open");
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");

  // Nur ein offenes Info-Panel gleichzeitig, damit sich auf Mobile
  // nicht mehrere Panels überlappen
  if (isOpen) {
    document.querySelectorAll("#shop-grid .shop-item.shop-item-info-open").forEach((other) => {
      if (other !== card) {
        other.classList.remove("shop-item-info-open");
        const otherBtn = other.querySelector(".shop-item-info-btn");
        if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
}

/* ------------------------------------------------------
   SELTENHEITEN-LEGENDE
   Baut die Erklärungs-Chips aus FIRE_HELMET_CONFIG.rarities.
   Beschreibung erscheint bei Hover/Fokus (siehe CSS) - Chips
   sind echte <button>, damit sie auch per Tastatur/Touch
   erreichbar sind (kein reines Hover-Feature).
------------------------------------------------------ */
function renderRarityLegend() {
  const el = document.getElementById("shop-rarity-legend");
  if (!el || typeof FIRE_HELMET_CONFIG === "undefined") return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const entries = Object.entries(FIRE_HELMET_CONFIG.rarities).sort((a, b) => a[1].order - b[1].order);

  el.innerHTML = entries
    .map(([key, r]) => {
      const label = r.label[lang] || r.label.de;
      const desc = r.desc[lang] || r.desc.de;
      return `
        <button type="button" class="fh-rarity-chip" style="--rarity-color:${r.color};--rarity-glow:${r.glow};" title="${desc}">
          <span class="fh-rarity-chip-label">${label}</span>
          <span class="fh-rarity-chip-desc">${desc}</span>
        </button>
      `;
    })
    .join("");
}

/* ------------------------------------------------------
   KAUFEN
------------------------------------------------------ */
async function buyShopItem(itemId) {
  const statusEl = document.getElementById("shop-status");
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) return;

  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname || !supabaseClient) {
    if (statusEl) statusEl.textContent = "Melde dich zuerst an, um im Shop einzukaufen!";
    return;
  }

  if (statusEl) statusEl.textContent = "⏳ Kauf wird verarbeitet ...";

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    await ensureSupabasePlayerRow(uid, nickname);

    const { data: current, error: readError } = await supabaseClient
      .from("players")
      .select("currency, owned_shop_items")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (readError) throw readError;

    const data = current || {};
    const currentCurrency = data.currency || 0;
    const owned = data.owned_shop_items || [];

    if (owned.includes(itemId)) {
      throw new Error("already-owned");
    }
    if (currentCurrency < item.price) {
      throw new Error("not-enough-currency");
    }

    // EIN einzelnes UPDATE, dessen Zulaessigkeit die Datenbank selbst
    // prueft (RLS vergleicht neuen mit altem Wert) - von Natur aus
    // atomar, kein client-getriebenes Transaktions-Konstrukt noetig.
    const { data: updated, error: writeError } = await supabaseClient
      .from("players")
      .update({
        currency: currentCurrency - item.price,
        owned_shop_items: [...owned, itemId],
      })
      .eq("firebase_uid", uid)
      .select()
      .maybeSingle();

    if (writeError || !updated) {
      throw new Error("purchase-failed");
    }

    const ownedLocal = getOwnedShopItems();
    ownedLocal.push(itemId);
    localStorage.setItem("ownedShopItems", JSON.stringify(ownedLocal));

    // Avatare direkt im normalen Avatar-Picker freischalten (nutzt
    // dieselbe Mechanik wie ein per Code freigeschalteter Avatar)
    if (item.type === "avatar" && item.avatarId && typeof unlockAvatar === "function") {
      unlockAvatar(item.avatarId);
    }

    if (statusEl) statusEl.textContent = `✅ ${item.name} gekauft!`;
    refreshShopCurrencyDisplay();
    renderShopGrid({ quiet: true });
  } catch (err) {
    if (err.message === "not-enough-currency") {
      if (statusEl) statusEl.textContent = "❌ Nicht genug Dublonen dafür.";
    } else if (err.message === "already-owned") {
      if (statusEl) statusEl.textContent = "Den hast du schon.";
      renderShopGrid({ quiet: true });
    } else {
      console.warn("Kauf fehlgeschlagen:", err);
      if (statusEl) statusEl.textContent = "⚠️ Kauf ist fehlgeschlagen, versuch's nochmal.";
    }
  }
}

/* ------------------------------------------------------
   WÄHRUNGSANZEIGE
------------------------------------------------------ */
async function refreshShopCurrencyDisplay() {
  const amountEl = document.getElementById("shop-currency-amount");
  if (!amountEl || !supabaseClient) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) {
      amountEl.textContent = "0";
      return;
    }

    const { data } = await supabaseClient
      .from("players")
      .select("currency")
      .eq("firebase_uid", uid)
      .maybeSingle();
    const currency = data ? data.currency || 0 : 0;
    amountEl.textContent = currency.toLocaleString("de-DE");
  } catch (err) {
    console.warn("Dublonen-Stand konnte nicht geladen werden:", err);
  }
}

/* ------------------------------------------------------
   EINGANGSANIMATION
   Spielt nur einmal pro Seitenbesuch (nicht bei jedem
   Firestore-Refresh) - der Flag wird zurückgesetzt, sobald man
   den Shop verlässt, siehe updateShopPage unten.
------------------------------------------------------ */
let shopEntranceShown = false;

function playShopEntrance() {
  const overlay = document.getElementById("shop-intro-overlay");
  const content = document.querySelector("#shop .shop-content");

  if (overlay) {
    overlay.classList.remove("fh-shop-intro-play");
    void overlay.offsetWidth;
    overlay.classList.add("fh-shop-intro-play");
  }
  if (content) {
    content.classList.remove("fh-shop-content-in");
    void content.offsetWidth;
    content.classList.add("fh-shop-content-in");
  }

  spawnShopIntroParticles();
}

/* ------------------------------------------------------
   GOLDSTAUB-PARTIKEL BEIM SHOP-EINTRITT
   Spielt genau EINMAL zusammen mit playShopEntrance() - eigene,
   NICHT endlos laufende Animation je Partikel (siehe
   fhShopIntroParticleDrift in style.css), räumt sich danach
   selbst über setTimeout ab. Auf Mobilgeräten und bei
   "reduced motion" bewusst weniger/keine Partikel (Punkt 20:
   Performance).
------------------------------------------------------ */
function spawnShopIntroParticles() {
  const layer = document.getElementById("fh-shop-intro-particles");
  if (!layer) return;
  layer.innerHTML = "";

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  const count = isMobile ? 5 : 10;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("span");
    particle.className = "fh-shop-intro-particle";
    particle.style.setProperty("--fh-particle-x", `${30 + Math.random() * 40}%`);
    particle.style.setProperty("--fh-particle-delay", `${(0.3 + Math.random() * 1.3).toFixed(2)}s`);
    particle.style.setProperty("--fh-particle-duration", `${(1.6 + Math.random() * 1.2).toFixed(2)}s`);
    layer.appendChild(particle);
    setTimeout(() => particle.remove(), 3200);
  }
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateShopPage(pageID) {
  if (pageID !== "shop") {
    stopShopRotationCountdown();
    shopEntranceShown = false;
    return;
  }

  if (!shopEntranceShown) {
    shopEntranceShown = true;
    playShopEntrance();
  }

  renderRarityLegend();
  renderShopGrid();
  refreshShopCurrencyDisplay();
  if (typeof startShopRotationCountdown === "function") startShopRotationCountdown();

  // Eigene Firestore-Kopie der freigeschalteten Artikel mit dem
  // lokalen Speicher abgleichen (z.B. wenn man auf einem neuen
  // Gerät eingeloggt ist)
  syncOwnedShopItemsFromServer();
}

async function syncOwnedShopItemsFromServer() {
  if (!supabaseClient || typeof shopItems === "undefined") return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const { data } = await supabaseClient
      .from("players")
      .select("owned_shop_items")
      .eq("firebase_uid", uid)
      .maybeSingle();

    if (data && Array.isArray(data.owned_shop_items)) {
      localStorage.setItem("ownedShopItems", JSON.stringify(data.owned_shop_items));

      // Gekaufte Avatare auch im Picker verfügbar machen
      data.owned_shop_items.forEach((itemId) => {
        const item = shopItems.find((i) => i.id === itemId);
        if (item && item.type === "avatar" && item.avatarId && typeof unlockAvatar === "function") {
          unlockAvatar(item.avatarId);
        }
      });
    }

    // equippedFrame wird bisher noch von savePlayerData() in wheel.js
    // geschrieben (dort noch nicht auf Supabase umgestellt) - deshalb
    // hier bewusst weiterhin aus Firestore gelesen, damit Schreiben
    // und Lesen zusammenbleiben. Sobald wheel.js in einer spaeteren
    // Phase ebenfalls umgestellt ist, kann dieser Block entfallen und
    // "equipped_frame" oben einfach mit ausgelesen werden.
    if (wheelDb) {
      try {
        const snap = await wheelDb.collection("players").doc(uid).get();
        if (snap.exists && snap.data().equippedFrame) {
          localStorage.setItem("equippedFrame", snap.data().equippedFrame);
        }
      } catch (err) {
        // unbedenklich - equippedFrame bleibt dann einfach auf dem
        // lokal zuletzt bekannten Stand
      }
    }

    renderShopGrid({ quiet: true });
  } catch (err) {
    console.warn("Shop-Abgleich fehlgeschlagen:", err);
  }
}
