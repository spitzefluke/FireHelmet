/* ======================================================
   ÄNDIIS SPIELOTHEK
   ---------------------------------------------------
   Rein virtuelles Website-Feature - nutzt AUSSCHLIESSLICH die
   bestehende virtuelle Währung (players/{uid}.currency, dieselbe
   wie im Schwarzmarkt/Schatzrad/Community-Boss). Keine echte
   Währung, keine Ein-/Auszahlung, keine Zahlungsanbieter.

   FAIRNESS/SICHERHEIT (Punkt 14/15):
   Jeder Spieldurchlauf läuft in EINER Firestore-Transaktion (wie
   buyShopItem() in shop.js): Einsatz wird erst nach Prüfung des
   aktuellen Kontostands abgezogen, Gewinn wird IM SELBEN Schritt
   gutgeschrieben. Der Client kann den Kontostand nicht selbst
   verändern - jede Spielrunde muss serverseitig (Firestore
   Security Rules, siehe firestore.rules) über genau diese
   Transaktion laufen. Angezeigt wird IMMER exakt das Ergebnis,
   das die Transaktion zurückgegeben hat, nie ein separat im
   Client berechneter Wert.

   MONATLICHE ROTATION:
   Genau wie beim Schwarzmarkt/Community-Boss deterministisch aus
   dem Kalendermonat abgeleitet (kein Zufall, für alle Besucher
   gleich) - siehe getCurrentSpielothekGame().
====================================================== */

function getCurrentSpielothekMonthId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Nur wirklich fertige Spiele (implemented: true) UND vom Admin
   nicht deaktivierte Spiele (siteConfig.disabledGameIds, siehe
   scripts/core/admin-gateway.js) kommen in die Rotation - ein
   Besucher soll nie ein halbfertiges oder absichtlich pausiertes
   Spiel sehen. */
function getActiveSpielothekGames() {
  if (typeof SPIELOTHEK_GAMES === "undefined") return [];
  const disabled = typeof siteConfig !== "undefined" ? siteConfig.disabledGameIds : [];
  return SPIELOTHEK_GAMES.filter((g) => g.implemented && !disabled.includes(g.id));
}

function getCurrentSpielothekGame() {
  const active = getActiveSpielothekGames();
  if (!active.length) return null;

  const [year, month] = getCurrentSpielothekMonthId().split("-").map(Number);
  const monthIndex = year * 12 + month; // steigt jeden Monat um 1 -> rotiert zuverlässig
  return active[monthIndex % active.length];
}

function getSpielothekHandler(game) {
  if (!game || typeof window.SPIELOTHEK_GAME_HANDLERS === "undefined") return null;
  return window.SPIELOTHEK_GAME_HANDLERS[game.module] || null;
}

/* ------------------------------------------------------
   ÄNDII-ZITATE
------------------------------------------------------ */
function getRandomAndiIdleQuote() {
  const n = Math.floor(Math.random() * ANDII_IDLE_QUOTE_COUNT) + 1;
  return typeof t === "function" ? t(`spielothek.andiIdle${n}`, "...") : "...";
}

function getRandomAndiResultQuote(win) {
  const count = win ? ANDII_WIN_QUOTE_COUNT : ANDII_LOSE_QUOTE_COUNT;
  const n = Math.floor(Math.random() * count) + 1;
  const key = win ? `spielothek.andiWin${n}` : `spielothek.andiLose${n}`;
  return typeof t === "function" ? t(key, "...") : "...";
}

/* ------------------------------------------------------
   SPIEL AUSFÜHREN (serverseitig geprüfte Transaktion)
------------------------------------------------------ */
let spielothekBusy = false;

async function playSpielothekGame() {
  if (spielothekBusy) return;

  const statusEl = document.getElementById("spielothek-status");
  const nickname = localStorage.getItem("wheelNickname") || "";
  const game = getCurrentSpielothekGame();
  const handler = getSpielothekHandler(game);

  if (!game || !handler) {
    if (statusEl) statusEl.textContent = "⚠️ Kein Spiel verfügbar.";
    return;
  }
  if (!nickname || !wheelDb) {
    if (statusEl) statusEl.textContent = typeof t === "function" ? t("spielothek.needLogin", "Melde dich zuerst an, um zu spielen!") : "Melde dich zuerst an, um zu spielen!";
    return;
  }

  spielothekBusy = true;
  const playBtn = document.getElementById("spielothek-play-btn");
  if (playBtn) playBtn.disabled = true;
  if (statusEl) statusEl.textContent = "";

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const docRef = wheelDb.collection("players").doc(uid);
    const betCost = handler.betCost;

    const result = await wheelDb.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? snap.data() : {};
      const currentCurrency = data.currency || 0;

      if (currentCurrency < betCost) {
        throw new Error("not-enough-currency");
      }

      // Ergebnis wird HIER, innerhalb der Transaktion, ermittelt -
      // dasselbe Ergebnis wird gleich unten angezeigt UND ist exakt
      // das, was tatsächlich gutgeschrieben/abgezogen wurde.
      const spin = handler.play();
      const newCurrency = currentCurrency - betCost + spin.payout;

      // Lebenslange Zähler, Grundlage der täglichen Reparatur-Quests
      // (siehe DAILY_QUESTS in ship-repair-data.js) - unabhängig vom
      // Kontostand, der durch Einsätze/Käufe auch wieder sinkt.
      const currentGamesPlayed = data.gamesPlayed || 0;
      const currentGamesWon = data.gamesWon || 0;
      const currentTotalEarned = data.totalCurrencyEarned || 0;

      tx.set(
        docRef,
        {
          currency: Math.max(0, newCurrency),
          gamesPlayed: currentGamesPlayed + 1,
          gamesWon: spin.win ? currentGamesWon + 1 : currentGamesWon,
          totalCurrencyEarned: spin.payout > 0 ? currentTotalEarned + spin.payout : currentTotalEarned,
        },
        { merge: true }
      );
      return spin;
    });

    refreshSpielothekCurrencyDisplay();
    await renderSpielothekResult(game, handler, result);
  } catch (err) {
    if (err.message === "not-enough-currency") {
      if (statusEl) statusEl.textContent = typeof t === "function" ? t("spielothek.notEnoughCurrency", "❌ Nicht genug Dublonen dafür.") : "❌ Nicht genug Dublonen dafür.";
    } else {
      console.warn("Spielrunde konnte nicht verarbeitet werden:", err);
      if (statusEl) statusEl.textContent = "⚠️ Das hat nicht geklappt, versuch's nochmal.";
    }
  } finally {
    spielothekBusy = false;
    if (playBtn) playBtn.disabled = false;
  }
}

/* ------------------------------------------------------
   ANZEIGE
------------------------------------------------------ */
async function refreshSpielothekCurrencyDisplay() {
  const el = document.getElementById("spielothek-currency-amount");
  if (!el || !wheelDb) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;
    const snap = await wheelDb.collection("players").doc(uid).get();
    const currency = snap.exists ? snap.data().currency || 0 : 0;
    el.textContent = currency.toLocaleString("de-DE");
  } catch (err) {
    // still leaves the last known value on screen instead of breaking
  }
}

/* ------------------------------------------------------
   ERGEBNIS ANZEIGEN (Punkt 6/7 - Ablauf statt Sofort-Ergebnis)
   ---------------------------------------------------
   Das Ergebnis steht (aus der Transaktion) zwar schon fest, wird dem
   Spieler aber bewusst nicht sofort verraten: zuerst zeigt
   handler.buildResultHtml() die spielspezifische Ablauf-Animation
   (z.B. drehende Walzen beim Slot, rein per CSS transform, siehe
   .spielothek-slot-spin in style.css), danach - nach einer kurzen
   Pause - erscheinen Gewinn/Verlust-Text, Ändiis Kommentar und der
   Leuchteffekt am Spieltisch. Respektiert prefers-reduced-motion
   (keine Pause, sofortige Anzeige). Async/await statt setInterval,
   also keine dauerhafte JS-Animation-Schleife.
------------------------------------------------------ */
async function renderSpielothekResult(game, handler, result) {
  const resultEl = document.getElementById("spielothek-result");
  const andiEl = document.getElementById("spielothek-andi-quote");
  const stageEl = document.getElementById("spielothek-stage");
  if (!resultEl) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";

  resultEl.innerHTML = handler.buildResultHtml(result);

  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealDelay = reduceMotion ? 0 : (typeof handler.resultRevealDelayMs === "number" ? handler.resultRevealDelayMs : 1150);
  if (revealDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, revealDelay));
  }

  // Immer der ECHTE Kontostand-Unterschied (Auszahlung minus Einsatz),
  // nie nur die Bruttoauszahlung - sonst würde die Anzeige bei einem
  // Gewinn einen höheren Zuwachs suggerieren, als tatsächlich gutgeschrieben
  // wurde (Punkt 14: keine manipulierte/irreführende Darstellung).
  const netDelta = result.payout - handler.betCost;

  if (result.win) {
    // Gewinn-Ablauf in zwei sichtbaren Schritten (Punkt 11): zuerst wird
    // nur "aufgedeckt", dass es ein Gewinn ist (kurze Spannung), dann -
    // nach einer kleinen Pause - erscheint der eigentliche Betrag samt
    // Glow/Konfetti-Effekt. Auf reduzierte Bewegung wird beides sofort
    // gemeinsam angezeigt.
    resultEl.insertAdjacentHTML("beforeend", `
      <p class="spielothek-result-line spielothek-result-reveal" id="spielothek-win-reveal">
        ${isEn ? "Win!" : "Gewinn!"}
      </p>
    `);

    if (!reduceMotion) {
      await new Promise((resolve) => setTimeout(resolve, 260));
    }

    const revealEl = document.getElementById("spielothek-win-reveal");
    if (revealEl) {
      revealEl.textContent = `${isEn ? "Win" : "Gewinn"}: +${netDelta} 🪙`;
      revealEl.classList.add("spielothek-result-win");
      if (!reduceMotion) revealEl.classList.add("spielothek-amount-pop");
    }
    if (!reduceMotion) triggerSpielothekConfetti(resultEl);
  } else {
    resultEl.insertAdjacentHTML("beforeend", `
      <p class="spielothek-result-line spielothek-result-lose">
        ${isEn ? "Loss" : "Verlust"}: ${netDelta} 🪙
      </p>
    `);
  }

  if (andiEl) andiEl.textContent = getRandomAndiResultQuote(result.win);

  // Ändii-Reaktionsanimation bei Verlust (Punkt 10): Avatar kommt von der
  // Seite herein, dann erscheint der Spruch, dann ein kurzer Bounce - siehe
  // .spielothek-andi-lose-react in style.css. Klasse wird bei JEDEM
  // Ergebnis zuerst entfernt (+ erzwungener Reflow), damit sie beim
  // naechsten Verlust erneut sauber abspielt statt nur einmalig zu
  // greifen; bei einem Gewinn bleibt sie einfach weg.
  const andiWrapEl = document.getElementById("spielothek-andi");
  if (andiWrapEl) {
    andiWrapEl.classList.remove("spielothek-andi-lose-react");
    void andiWrapEl.offsetWidth;
    if (!result.win) andiWrapEl.classList.add("spielothek-andi-lose-react");
  }

  if (stageEl) {
    stageEl.classList.remove("spielothek-stage-win", "spielothek-stage-lose");
    void stageEl.offsetWidth;
    stageEl.classList.add(result.win ? "spielothek-stage-win" : "spielothek-stage-lose");
  }
}

/* ------------------------------------------------------
   KONFETTI-EFFEKT BEI GEWINN (Punkt 11)
   ---------------------------------------------------
   Ein paar kurzlebige <span>-Elemente, die rein per CSS-Keyframe
   auseinanderfliegen und sich dabei ausblenden (siehe
   @keyframes spielothekConfettiPop in style.css) - läuft genau
   EINMAL pro Gewinn ab und entfernt sich danach selbst per
   setTimeout, KEINE dauerhafte requestAnimationFrame/Intervall-
   Schleife (Punkt 12: Performance).
------------------------------------------------------ */
function triggerSpielothekConfetti(containerEl) {
  if (!containerEl) return;

  const colors = ["#f0c96a", "#e8a33d", "#ffe9b3", "#d6a84f"];
  const burst = document.createElement("div");
  burst.className = "spielothek-confetti-burst";
  burst.setAttribute("aria-hidden", "true");

  const pieceCount = 10;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement("span");
    piece.className = "spielothek-confetti-piece";
    piece.style.setProperty("--fh-confetti-angle", `${(360 / pieceCount) * i}deg`);
    piece.style.setProperty("--fh-confetti-color", colors[i % colors.length]);
    piece.style.setProperty("--fh-confetti-delay", `${i * 12}ms`);
    burst.appendChild(piece);
  }

  containerEl.appendChild(burst);
  setTimeout(() => burst.remove(), 900);
}

function buildSpielothekAndiHtml() {
  const image = typeof CHARACTER_DATABASE !== "undefined" && CHARACTER_DATABASE.andi ? CHARACTER_DATABASE.andi.image : "";
  return image
    ? `<img src="${image}" class="spielothek-andi-image" alt="Ändii">`
    : `<div class="spielothek-andi-image spielothek-andi-placeholder">🎲</div>`;
}

async function renderSpielothekPage() {
  const container = document.getElementById("spielothek-content");
  if (!container) return;

  const game = getCurrentSpielothekGame();
  const handler = getSpielothekHandler(game);
  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";

  if (!game || !handler) {
    container.innerHTML = `<p class="wheel-status">⚠️ Diesen Monat ist kein Spiel verfügbar - schau bald wieder vorbei.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="spielothek-game-heading">
      <span class="spielothek-game-emoji">${game.emoji}</span>
      <span class="spielothek-game-name">${game.name[lang] || game.name.de}</span>
    </div>

    <div class="shop-currency-bar spielothek-currency-bar">
      <span class="shop-currency-icon">💰</span>
      <span id="spielothek-currency-amount">0</span>
      <span data-i18n="shop.currencyLabel">Dublonen</span>
    </div>
    <p class="spielothek-bet-hint">(${handler.betCost} <span data-i18n="shop.currencyLabel">Dublonen</span> / <span data-i18n="spielothek.perRound">Runde</span>)</p>

    <div class="spielothek-stage" id="spielothek-stage">
      <div class="spielothek-andi" id="spielothek-andi">
        ${buildSpielothekAndiHtml()}
        <p class="spielothek-andi-quote" id="spielothek-andi-quote">${getRandomAndiIdleQuote()}</p>
      </div>

      <div class="spielothek-game-area">
        <div id="spielothek-result" class="spielothek-result"></div>
        <button type="button" class="code-button" id="spielothek-play-btn" onclick="playSpielothekGame()" data-i18n="spielothek.playButton">SPIELEN</button>
        <p id="spielothek-status" class="wheel-status"></p>
      </div>
    </div>

    <details class="spielothek-rules">
      <summary data-i18n="spielothek.rulesHeading">Spielregeln</summary>
      ${handler.getRulesHtml(lang)}
    </details>
  `;

  if (typeof applyTranslations === "function") applyTranslations();
  refreshSpielothekCurrencyDisplay();
}

/* ------------------------------------------------------
   OEFFNUNGS-SOUND (Punkt 2 des Auftrags)
   ---------------------------------------------------
   Wird NUR hier aufgerufen - direkt und synchron innerhalb von
   changePage('spielothek'), das ausschliesslich per onclick auf
   einen Menuepunkt ausgeloest wird (siehe index.html), NIE beim
   Laden der Seite selbst oder bei einem simplen Neu-Rendern (z.B.
   das "siteConfigUpdated"-Neuzeichnen unten ruft bewusst NUR
   renderSpielothekPage() auf, nicht diese Funktion). Dadurch
   bleibt der Aufruf innerhalb derselben Nutzer-Geste, wie es die
   Autoplay-Regeln der Browser verlangen. Ein neues <audio>-
   Element pro Aufruf statt einem wiederverwendeten Element, damit
   kein gemeinsamer Zustand/keine gemeinsame Promise mit anderen
   Seiten (z.B. der Mystery-Musik) entstehen kann.
------------------------------------------------------ */
function playSpielothekOpenSound() {
  try {
    const audio = new Audio("scripts/spielothek/audio/spielothek-open.wav");
    audio.volume = 0.55;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        // "AbortError" bedeutet nur, dass die Wiedergabe durch ein fast
        // zeitgleiches pause()/Entfernen unterbrochen wurde (z.B. sehr
        // schnelles mehrfaches Oeffnen) - kein echter Fehler. Blockiert
        // der Browser die Wiedergabe grundsaetzlich (z.B. weil er die
        // Nutzer-Geste doch nicht anerkennt), bleibt das Spiel trotzdem
        // voll nutzbar - der Sound ist rein kosmetisch.
        if (err.name !== "AbortError") {
          console.warn("Spielothek-Sound konnte nicht abgespielt werden:", err);
        }
      });
    }
  } catch (err) {
    // Audio komplett nicht verfuegbar (sehr alter Browser o.ae.) - das
    // Spiel funktioniert trotzdem normal weiter.
  }
}

function updateSpielothekPage(pageID) {
  if (pageID !== "spielothek") return;
  playSpielothekOpenSound();
  renderSpielothekPage();
}

window.addEventListener("siteConfigUpdated", () => {
  if (document.getElementById("spielothek")?.classList.contains("active-page")) {
    renderSpielothekPage();
  }
});
