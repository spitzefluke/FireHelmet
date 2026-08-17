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
        buttonHtml = `<button type="button" class="shop-item-btn" onclick="buyShopItem('${item.id}')">${item.price.toLocaleString("de-DE")} 💰 Kaufen</button>`;
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
            <p class="shop-item-info-meta"><span>${categoryLabel}</span><span>${item.price.toLocaleString("de-DE")} 💰</span></p>
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
  if (!nickname || !wheelDb) {
    if (statusEl) statusEl.textContent = "Melde dich zuerst an, um im Shop einzukaufen!";
    return;
  }

  if (statusEl) statusEl.textContent = "⏳ Kauf wird verarbeitet ...";

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const docRef = wheelDb.collection("players").doc(uid);

    await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? snap.data() : {};
      const currentCurrency = data.currency || 0;
      const owned = data.ownedShopItems || [];

      if (owned.includes(itemId)) {
        throw new Error("already-owned");
      }
      if (currentCurrency < item.price) {
        throw new Error("not-enough-currency");
      }

      tx.set(
        docRef,
        {
          currency: currentCurrency - item.price,
          ownedShopItems: [...owned, itemId],
        },
        { merge: true }
      );
    });

    const owned = getOwnedShopItems();
    owned.push(itemId);
    localStorage.setItem("ownedShopItems", JSON.stringify(owned));

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
  if (!amountEl || !wheelDb) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) {
      amountEl.textContent = "0";
      return;
    }

    const snap = await wheelDb.collection("players").doc(uid).get();
    const currency = snap.exists ? snap.data().currency || 0 : 0;
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
  if (!wheelDb || typeof shopItems === "undefined") return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const snap = await wheelDb.collection("players").doc(uid).get();
    if (!snap.exists) return;

    const data = snap.data();
    if (Array.isArray(data.ownedShopItems)) {
      localStorage.setItem("ownedShopItems", JSON.stringify(data.ownedShopItems));

      // Gekaufte Avatare auch im Picker verfügbar machen
      data.ownedShopItems.forEach((itemId) => {
        const item = shopItems.find((i) => i.id === itemId);
        if (item && item.type === "avatar" && item.avatarId && typeof unlockAvatar === "function") {
          unlockAvatar(item.avatarId);
        }
      });
    }
    if (data.equippedFrame) {
      localStorage.setItem("equippedFrame", data.equippedFrame);
    }
    renderShopGrid({ quiet: true });
  } catch (err) {
    console.warn("Shop-Abgleich fehlgeschlagen:", err);
  }
}
