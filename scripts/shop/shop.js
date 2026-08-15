/* ======================================================
   SHOP
   - Zeigt den Katalog aus scripts/shop/shop-data.js als Grid
   - Kauf zieht Dublonen ab (Firestore) und schaltet den Rahmen
     dauerhaft frei (players/{uid}.ownedFrames)
   - Der ausgerüstete Rahmen wird in localStorage gemerkt und
     überall dort verwendet, wo Avatare angezeigt werden
====================================================== */

let shopActiveTab = "frame";

function switchShopTab(tab) {
  shopActiveTab = tab;
  document.querySelectorAll(".shop-tab").forEach((btn) => {
    btn.classList.toggle("shop-tab-active", btn.dataset.shopTab === tab);
  });
  renderShopGrid();
}

function getOwnedFrames() {
  try {
    return JSON.parse(localStorage.getItem("ownedFrames") || "[]");
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

  renderShopGrid();
  if (typeof renderAvatarPicker === "function") renderAvatarPicker();
}

/* ------------------------------------------------------
   GRID AUFBAUEN
------------------------------------------------------ */
function renderShopGrid() {
  const grid = document.getElementById("shop-grid");
  if (!grid || typeof shopItems === "undefined") return;

  const owned = getOwnedFrames();
  const equipped = getEquippedFrame();
  const items = shopItems.filter((item) => item.type === shopActiveTab);

  grid.innerHTML = items
    .map((item) => {
      const isOwned = owned.includes(item.id);
      const isEquipped = equipped === item.id;

      let buttonHtml;
      if (isEquipped) {
        buttonHtml = `<button type="button" class="shop-item-btn shop-item-equipped" onclick="equipFrame('${item.id}')">✓ Ausgerüstet</button>`;
      } else if (isOwned) {
        buttonHtml = `<button type="button" class="shop-item-btn shop-item-equip" onclick="equipFrame('${item.id}')">Ausrüsten</button>`;
      } else {
        buttonHtml = `<button type="button" class="shop-item-btn" onclick="buyShopItem('${item.id}')">${item.price} 💰 Kaufen</button>`;
      }

      return `
        <div class="shop-item ${isOwned ? "shop-item-owned" : ""}">
          <div class="shop-item-preview avatar-frame-${item.style}">
            <span class="shop-item-emoji">${item.emoji}</span>
          </div>
          <p class="shop-item-name">${item.name}</p>
          ${buttonHtml}
        </div>
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
      const owned = data.ownedFrames || [];

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
          ownedFrames: [...owned, itemId],
        },
        { merge: true }
      );
    });

    const owned = getOwnedFrames();
    owned.push(itemId);
    localStorage.setItem("ownedFrames", JSON.stringify(owned));

    if (statusEl) statusEl.textContent = `✅ ${item.name} gekauft!`;
    refreshShopCurrencyDisplay();
    renderShopGrid();
  } catch (err) {
    if (err.message === "not-enough-currency") {
      if (statusEl) statusEl.textContent = "❌ Nicht genug Dublonen dafür.";
    } else if (err.message === "already-owned") {
      if (statusEl) statusEl.textContent = "Den hast du schon.";
      renderShopGrid();
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
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateShopPage(pageID) {
  if (pageID !== "shop") return;

  renderShopGrid();
  refreshShopCurrencyDisplay();

  // Eigene Firestore-Kopie der freigeschalteten Rahmen mit dem
  // lokalen Speicher abgleichen (z.B. wenn man auf einem neuen
  // Gerät eingeloggt ist)
  syncOwnedFramesFromServer();
}

async function syncOwnedFramesFromServer() {
  if (!wheelDb) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const snap = await wheelDb.collection("players").doc(uid).get();
    if (!snap.exists) return;

    const data = snap.data();
    if (Array.isArray(data.ownedFrames)) {
      localStorage.setItem("ownedFrames", JSON.stringify(data.ownedFrames));
    }
    if (data.equippedFrame) {
      localStorage.setItem("equippedFrame", data.equippedFrame);
    }
    renderShopGrid();
  } catch (err) {
    console.warn("Rahmen-Abgleich fehlgeschlagen:", err);
  }
}
