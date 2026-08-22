/* ======================================================
   ÄNDIIS SPIELOTHEK
   ---------------------------------------------------
   Rein virtuelles Website-Feature - nutzt AUSSCHLIESSLICH die
   bestehende virtuelle Währung (players/{uid}.currency, dieselbe
   wie im Schwarzmarkt/Schatzrad/Community-Boss). Keine echte
   Währung, keine Ein-/Auszahlung, keine Zahlungsanbieter.

   FAIRNESS/SICHERHEIT (Punkt 14/15):
   Jeder Spieldurchlauf läuft in EINEM einzigen Supabase-UPDATE (wie
   buyShopItem() in shop.js): Einsatz wird erst nach Prüfung des
   aktuellen Kontostands abgezogen, Gewinn wird IM SELBEN Schritt
   gutgeschrieben. Der Client kann den Kontostand nicht selbst
   verändern - jede Spielrunde muss serverseitig (Postgres Row
   Level Security, siehe supabase/game-migration/) über genau
   dieses UPDATE laufen. Angezeigt wird IMMER exakt das Ergebnis,
   das der Schreibvorgang zurückgegeben hat, nie ein separat im
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

function getRandomAndiResultQuote(win, tier) {
  let pool = "andiLose";
  let count = ANDII_LOSE_QUOTE_COUNT;

  if (win) {
    if (tier === "jackpot") {
      pool = "andiWinJackpot";
      count = ANDII_WIN_JACKPOT_QUOTE_COUNT;
    } else if (tier === "big" || tier === "veryBig") {
      pool = "andiWinBig";
      count = ANDII_WIN_BIG_QUOTE_COUNT;
    } else {
      pool = "andiWin";
      count = ANDII_WIN_QUOTE_COUNT;
    }
  }

  const n = Math.floor(Math.random() * count) + 1;
  return typeof t === "function" ? t(`spielothek.${pool}${n}`, "...") : "...";
}

function getRandomAndiCooldownQuote() {
  const n = Math.floor(Math.random() * ANDII_COOLDOWN_QUOTE_COUNT) + 1;
  return typeof t === "function" ? t(`spielothek.cooldownQuote${n}`, "...") : "...";
}

/* ------------------------------------------------------
   COOLDOWN ZWISCHEN ZWEI SPIELRUNDEN (Auftrag Punkt 1-3)
   ---------------------------------------------------
   Rein die UI-Anzeige (Countdown-Text, deaktivierter Button, Ändiis
   Spruch) - die tatsaechliche Sperre wird serverseitig per Postgres
   RLS erzwungen (valid_spielothek_cooldown(), liest
   players.last_spielothek_play_at, siehe supabase/game-migration/)
   und kann daher NICHT durch Reload/mehrere Tabs/Konsolen-Manipulation
   umgangen werden: selbst wenn hier im Client jemand cooldownUntil
   auf 0 setzen wuerde, lehnt die Datenbank den verfruehten
   Schreibversuch trotzdem ab (siehe catch-Zweig "cooldown" unten).
   Genau dasselbe Muster wie die bestehende 20h-Sperre des Schatzrads
   (last_wheel_spin_at + valid_wheel_fields()) - hier nur mit kurzer
   Dauer statt eines ganzen Tages.
------------------------------------------------------ */
let spielothekCooldownUntil = 0;
let spielothekCooldownInterval = null;

function stopSpielothekCooldownUI() {
  clearInterval(spielothekCooldownInterval);
  spielothekCooldownInterval = null;
}

function startSpielothekCooldownUI(untilMs) {
  spielothekCooldownUntil = untilMs;
  const playBtn = document.getElementById("spielothek-play-btn");
  const statusEl = document.getElementById("spielothek-status");
  const andiEl = document.getElementById("spielothek-andi-quote");

  if (andiEl) andiEl.textContent = getRandomAndiCooldownQuote();

  stopSpielothekCooldownUI();

  function tick() {
    const remainingMs = spielothekCooldownUntil - Date.now();

    if (remainingMs <= 0) {
      stopSpielothekCooldownUI();
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.textContent = typeof t === "function" ? t("spielothek.playButton", "SPIELEN") : "SPIELEN";
      }
      if (statusEl) statusEl.textContent = "";
      return;
    }

    if (playBtn) {
      playBtn.disabled = true;
      const secondsLeft = Math.ceil(remainingMs / 1000);
      const waitLabel = typeof t === "function" ? t("spielothek.cooldownWaitButton", "WARTEN ...") : "WARTEN ...";
      playBtn.textContent = `${waitLabel} (${secondsLeft})`;
    }
    if (statusEl) {
      const doneLabel = typeof t === "function" ? t("spielothek.spinCompleteLabel", "🎰 Dreh abgeschlossen!") : "🎰 Dreh abgeschlossen!";
      const label = typeof t === "function" ? t("spielothek.cooldownLabel", "Nächster Spin in:") : "Nächster Spin in:";
      const secondsLeft = Math.ceil(remainingMs / 1000);
      statusEl.textContent = `${doneLabel} ${label} ${String(secondsLeft).padStart(2, "0")}`;
    }
  }

  tick();
  spielothekCooldownInterval = setInterval(tick, 200);
}

/* ------------------------------------------------------
   EINSATZ-AUSWAHL (nur bei Spielen mit handler.variableBet, aktuell
   nur der Slot - Auftrag: "man soll selbst definieren wie viel man
   einsetzt, je mehr desto mehr gewinnt man")
   ---------------------------------------------------
   Rein clientseitiger UI-Zustand fuer die Anzeige - die eigentliche
   Absicherung (Einsatz innerhalb der erlaubten Spanne, Kontostand
   ausreichend) prueft die Datenbank ohnehin bei jedem Schreibvorgang
   (siehe playSpielothekGame() unten und app.valid_players_write() in
   supabase/game-migration/01-players-ship-progression.sql).
------------------------------------------------------ */
let spielothekSelectedBet = null;

function clampSpielothekBet(handler, rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return handler.defaultBet;

  const stepped = Math.round(n / handler.betStep) * handler.betStep;
  return Math.min(handler.maxBet, Math.max(handler.minBet, stepped));
}

function updateSpielothekBetDisplay(value) {
  const label = document.getElementById("spielothek-bet-value");
  if (label) label.textContent = `${value} 🪙`;
}

function onSpielothekBetInput(rawValue) {
  const game = getCurrentSpielothekGame();
  const handler = getSpielothekHandler(game);
  if (!handler || !handler.variableBet) return;

  spielothekSelectedBet = clampSpielothekBet(handler, rawValue);
  updateSpielothekBetDisplay(spielothekSelectedBet);
}

/* ------------------------------------------------------
   SPIEL AUSFÜHREN (serverseitig geprüfte Transaktion)
------------------------------------------------------ */
let spielothekBusy = false;

async function playSpielothekGame() {
  if (spielothekBusy) return;
  if (Date.now() < spielothekCooldownUntil) return; // Button ist eh disabled, aber doppelt haelt besser

  const statusEl = document.getElementById("spielothek-status");
  const nickname = localStorage.getItem("wheelNickname") || "";
  const game = getCurrentSpielothekGame();
  const handler = getSpielothekHandler(game);

  if (!game || !handler) {
    if (statusEl) statusEl.textContent = "⚠️ Kein Spiel verfügbar.";
    return;
  }
  if (!nickname || !supabaseClient) {
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

    // Bei Spielen mit frei waehlbarem Einsatz (Auftrag: 4. Slot-Walze
    // + selbst gewaehlter Einsatz) wird der zuletzt vom Regler
    // gemeldete Wert genutzt, nochmal serverfrisch geklammert (falls
    // der Regler z.B. noch nie beruehrt wurde) - fuer Spiele ohne
    // variableBet bleibt es beim alten festen handler.betCost.
    const betCost = handler.variableBet
      ? clampSpielothekBet(handler, spielothekSelectedBet ?? handler.defaultBet)
      : handler.betCost;

    await ensureSupabasePlayerRow(uid, nickname);

    const { data: current, error: readError } = await supabaseClient
      .from("players")
      .select("currency, games_played, games_won, total_currency_earned, last_spielothek_play_at")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (readError) throw readError;

    const data = current || {};
    const currentCurrency = data.currency || 0;

    // Freundliche Vor-Pruefung (liest den FRISCHEN Serverstand, keinen
    // moeglicherweise veralteten Client-Cache) - wirft einen klaren,
    // eigenen Fehler statt einer generischen RLS-Ablehnung. Die
    // eigentliche, nicht umgehbare Absicherung bleibt trotzdem die
    // Datenbank-Regel selbst (siehe supabase/game-migration/
    // 01-players-ship-progression.sql, valid_spielothek_cooldown()) -
    // diese Pruefung hier ist nur fuer eine bessere Fehlermeldung.
    const lastPlayMs = data.last_spielothek_play_at ? new Date(data.last_spielothek_play_at).getTime() : 0;
    if (lastPlayMs && Date.now() - lastPlayMs < SPIELOTHEK_COOLDOWN_MS) {
      throw new Error("cooldown");
    }

    if (currentCurrency < betCost) {
      throw new Error("not-enough-currency");
    }

    // Ergebnis wird HIER ermittelt - dasselbe Ergebnis wird gleich
    // unten angezeigt UND ist exakt das, was tatsächlich gutgeschrieben/
    // abgezogen wurde.
    const spin = handler.play(betCost);
    const newCurrency = Math.max(0, currentCurrency - betCost + spin.payout);

    // Lebenslange Zähler, Grundlage der täglichen Reparatur-Quests
    // (siehe DAILY_QUESTS in ship-repair-data.js) - unabhängig vom
    // Kontostand, der durch Einsätze/Käufe auch wieder sinkt.
    const currentGamesPlayed = data.games_played || 0;
    const currentGamesWon = data.games_won || 0;
    const currentTotalEarned = data.total_currency_earned || 0;

    // EIN einzelnes UPDATE, dessen Zulaessigkeit die Datenbank selbst
    // prueft (RLS vergleicht neuen mit altem Wert, siehe
    // valid_players_write() im Migrationsschema) - dadurch von Natur
    // aus atomar, kein client-getriebenes Transaktions-Konstrukt noetig
    // (anders als bei Firestore).
    const { data: updated, error: writeError } = await supabaseClient
      .from("players")
      .update({
        currency: newCurrency,
        games_played: currentGamesPlayed + 1,
        games_won: spin.win ? currentGamesWon + 1 : currentGamesWon,
        total_currency_earned: spin.payout > 0 ? currentTotalEarned + spin.payout : currentTotalEarned,
        last_spielothek_play_at: new Date().toISOString(),
      })
      .eq("firebase_uid", uid)
      .select()
      .maybeSingle();

    if (writeError || !updated) {
      // Von der Datenbank abgelehnt (z.B. Wettlauf mit einem anderen
      // Tab, der zwischen der Vor-Pruefung oben und diesem Schreib-
      // vorgang bereits gespielt hat) - Cooldown-UI aus dem echten
      // Serverstand neu aufbauen statt einer verwirrenden Meldung.
      throw new Error("cooldown");
    }

    const result = spin;

    refreshSpielothekCurrencyDisplay();
    // Rein additiv, NACH dem bereits erfolgreichen/server-geprueften
    // Supabase-UPDATE oben - siehe scripts/supabase/supabase-games.js
    // (separate Statistik-Tabelle, laeuft ueber den Cloudflare-Worker-
    // Proxy statt direkt ueber den Supabase-Client).
    // Ein Fehlschlag hier kann das eigentliche Spiel nicht beeinflussen.
    if (typeof logSpielothekRoundToSupabase === "function") {
      logSpielothekRoundToSupabase(game.id, betCost, result.payout, result.win);
    }
    await renderSpielothekResult(game, handler, result, betCost);
    // Cooldown erst NACH der abgeschlossenen Ergebnis-Anzeige starten,
    // nicht schon waehrend die Walzen noch laufen (Auftrag: "Nach
    // einem abgeschlossenen Spin" - nicht waehrenddessen).
    startSpielothekCooldownUI(Date.now() + SPIELOTHEK_COOLDOWN_MS);
  } catch (err) {
    if (err.message === "not-enough-currency") {
      if (statusEl) statusEl.textContent = typeof t === "function" ? t("spielothek.notEnoughCurrency", "❌ Nicht genug Dublonen dafür.") : "❌ Nicht genug Dublonen dafür.";
      if (playBtn) playBtn.disabled = false;
    } else if (err.message === "cooldown") {
      // Client-Uhr/Cache war minimal daneben (z.B. anderer Tab hat
      // gerade gespielt) - einfach die Cooldown-UI aus dem tatsaechlichen
      // Serverstand neu aufbauen statt eine verwirrende Fehlermeldung
      // zu zeigen.
      await refreshSpielothekCooldownFromServer();
    } else {
      // Das UPDATE ist entweder komplett durchgelaufen (siehe
      // supabaseClient.from("players").update() oben - dann landen wir
      // hier gar nicht) oder komplett fehlgeschlagen, nie halb: Ein Fehler
      // hier bedeutet
      // also sicher, dass NICHTS gespeichert wurde. Wichtig, das dem
      // Spieler auch so zu sagen, statt eine vage Meldung zu zeigen,
      // die den Eindruck erwecken koennte, der Einsatz sei trotzdem
      // weg (siehe Auftrag Punkt 14/15 - kein Gewinn ohne Speicherung).
      console.warn("Spielrunde konnte nicht verarbeitet werden:", err);
      if (statusEl) {
        statusEl.textContent = typeof t === "function"
          ? t("spielothek.saveFailed", "⚠️ Die Spielrunde konnte gerade nicht gespeichert werden. Deine Daten wurden nicht verändert. Bitte versuch's nochmal.")
          : "⚠️ Die Spielrunde konnte gerade nicht gespeichert werden. Deine Daten wurden nicht verändert. Bitte versuch's nochmal.";
      }
      if (playBtn) playBtn.disabled = false;
    }
  } finally {
    spielothekBusy = false;
  }
}

/* ------------------------------------------------------
   COOLDOWN-STATUS BEIM SEITENBESUCH LADEN
   ---------------------------------------------------
   Wichtig fuer Reload/mehrere Tabs (Auftrag Punkt 3/7): ein frischer
   Seitenaufruf kennt den lokalen spielothekCooldownUntil-Stand nicht
   mehr (der lebt nur im JS-Speicher) - hier wird er aus dem
   tatsaechlichen Server-Zeitstempel neu hergeleitet, BEVOR der
   Spieler ueberhaupt auf "Spielen" klicken kann. Verhindert, dass ein
   Reload die sichtbare Sperre einfach "vergisst" (die serverseitige
   Sperre selbst bliebe ohnehin bestehen, das hier ist nur fuer eine
   korrekte Anzeige).
------------------------------------------------------ */
async function refreshSpielothekCooldownFromServer() {
  if (!supabaseClient || typeof wheelAuthReady === "undefined") return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const { data: snapData } = await supabaseClient
      .from("players")
      .select("last_spielothek_play_at")
      .eq("firebase_uid", uid)
      .maybeSingle();
    const data = snapData || {};
    const lastPlayMs = data.last_spielothek_play_at ? new Date(data.last_spielothek_play_at).getTime() : 0;

    if (lastPlayMs) {
      const until = lastPlayMs + SPIELOTHEK_COOLDOWN_MS;
      if (until > Date.now()) {
        startSpielothekCooldownUI(until);
        return;
      }
    }

    stopSpielothekCooldownUI();
    spielothekCooldownUntil = 0;
    const playBtn = document.getElementById("spielothek-play-btn");
    if (playBtn) playBtn.disabled = false;
  } catch (err) {
    // Kein Grund, das Spiel deswegen zu blockieren - schlimmstenfalls
    // greift beim naechsten Klick einfach die serverseitige Sperre
    // (Postgres RLS, siehe supabase/game-migration/) mit der normalen
    // Fehlerbehandlung oben.
  }
}

/* ------------------------------------------------------
   ANZEIGE
------------------------------------------------------ */
async function refreshSpielothekCurrencyDisplay() {
  const el = document.getElementById("spielothek-currency-amount");
  if (!el || !supabaseClient) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;
    const { data } = await supabaseClient
      .from("players")
      .select("currency")
      .eq("firebase_uid", uid)
      .maybeSingle();
    const currency = data ? data.currency || 0 : 0;
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
async function renderSpielothekResult(game, handler, result, betCost) {
  const resultEl = document.getElementById("spielothek-result");
  const andiEl = document.getElementById("spielothek-andi-quote");
  const stageEl = document.getElementById("spielothek-stage");
  if (!resultEl) return;

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";

  resultEl.innerHTML = handler.buildResultHtml(result);

  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Kurzer Licht-/Glow-Impuls GENAU dann, wenn eine Walze tatsaechlich
  // landet (Auftrag Punkt 5) - das Spiel-Modul (z.B. slot.js) kennt
  // seine eigenen Stopp-Zeitpunkte am besten und liefert sie optional
  // mit; spielothek.js selbst bleibt dadurch weiterhin unabhaengig von
  // slot-spezifischen Details (siehe Kommentar am Dateianfang).
  if (!reduceMotion && Array.isArray(handler.reelStopTimesMs)) {
    const symbolEls = resultEl.querySelectorAll(".spielothek-slot-symbol");
    handler.reelStopTimesMs.forEach((stopMs, i) => {
      const el = symbolEls[i];
      if (!el) return;
      setTimeout(() => el.classList.add("spielothek-slot-symbol-landed"), stopMs);
    });
  }

  const revealDelay = reduceMotion ? 0 : (typeof handler.resultRevealDelayMs === "number" ? handler.resultRevealDelayMs : 1150);
  if (revealDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, revealDelay));
  }

  // Immer der ECHTE Kontostand-Unterschied (Auszahlung minus Einsatz),
  // nie nur die Bruttoauszahlung - sonst würde die Anzeige bei einem
  // Gewinn einen höheren Zuwachs suggerieren, als tatsächlich gutgeschrieben
  // wurde (Punkt 14: keine manipulierte/irreführende Darstellung).
  const netDelta = result.payout - betCost;

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
      const label = result.tier === "jackpot" ? (isEn ? "JACKPOT" : "JACKPOT") : (isEn ? "Win" : "Gewinn");
      revealEl.textContent = `${label}: +${netDelta} 🪙`;
      revealEl.classList.add("spielothek-result-win");
      if (result.tier === "jackpot" || result.tier === "veryBig") revealEl.classList.add("spielothek-result-win-big");
      if (!reduceMotion) revealEl.classList.add("spielothek-amount-pop");
    }
    // Staerkerer Effekt bei selteneren Gewinnen (Auftrag Punkt 5): mehr
    // Konfetti-Teile, laenger sichtbar, je hoeher die Gewinnstufe.
    if (!reduceMotion) triggerSpielothekConfetti(resultEl, result.tier);
  } else {
    resultEl.insertAdjacentHTML("beforeend", `
      <p class="spielothek-result-line spielothek-result-lose">
        ${isEn ? "Loss" : "Verlust"}: ${netDelta} 🪙
      </p>
    `);
  }

  if (andiEl) andiEl.textContent = getRandomAndiResultQuote(result.win, result.tier);

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
const SPIELOTHEK_CONFETTI_TIERS = {
  jackpot: { pieceCount: 28, colors: ["#ff6a2a", "#f0c96a", "#ffe9b3", "#ff9f4d"], lifespanMs: 1500 },
  veryBig: { pieceCount: 20, colors: ["#7dd3fc", "#f0c96a", "#ffe9b3"], lifespanMs: 1200 },
  big: { pieceCount: 16, colors: ["#7dd3fc", "#e8a33d", "#ffe9b3"], lifespanMs: 1000 },
};
const SPIELOTHEK_CONFETTI_DEFAULT = { pieceCount: 10, colors: ["#f0c96a", "#e8a33d", "#ffe9b3", "#d6a84f"], lifespanMs: 900 };

function triggerSpielothekConfetti(containerEl, tier) {
  if (!containerEl) return;

  const { pieceCount, colors, lifespanMs } = SPIELOTHEK_CONFETTI_TIERS[tier] || SPIELOTHEK_CONFETTI_DEFAULT;
  const burst = document.createElement("div");
  burst.className = `spielothek-confetti-burst${tier === "jackpot" ? " spielothek-confetti-burst-jackpot" : ""}`;
  burst.setAttribute("aria-hidden", "true");

  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement("span");
    piece.className = "spielothek-confetti-piece";
    piece.style.setProperty("--fh-confetti-angle", `${(360 / pieceCount) * i}deg`);
    piece.style.setProperty("--fh-confetti-color", colors[i % colors.length]);
    piece.style.setProperty("--fh-confetti-delay", `${i * 12}ms`);
    burst.appendChild(piece);
  }

  containerEl.appendChild(burst);
  setTimeout(() => burst.remove(), lifespanMs);
}

function buildSpielothekAndiHtml() {
  const image = typeof CHARACTER_DATABASE !== "undefined" && CHARACTER_DATABASE.andi ? CHARACTER_DATABASE.andi.image : "";
  return image
    ? `<img src="${image}" class="spielothek-andi-image" alt="Ändii">`
    : `<div class="spielothek-andi-image spielothek-andi-placeholder">🎲</div>`;
}

/* ------------------------------------------------------
   EINSATZ-HINWEIS/-REGLER
   ---------------------------------------------------
   Spiele mit handler.variableBet (aktuell nur der Slot) zeigen einen
   Schieberegler statt des alten statischen Texts - spielothekSelectedBet
   wird beim Aufbau auf handler.defaultBet zurueckgesetzt, damit jeder
   Seitenaufruf/Spielwechsel wieder beim selben, bekannten Einsatz
   startet statt einen Wert vom vorherigen (evtl. anderen) Spiel
   mitzuschleppen.
------------------------------------------------------ */
function buildSpielothekBetHtml(handler) {
  if (!handler.variableBet) {
    return `<p class="spielothek-bet-hint">(${handler.betCost} <span data-i18n="shop.currencyLabel">Dublonen</span> / <span data-i18n="spielothek.perRound">Runde</span>)</p>`;
  }

  spielothekSelectedBet = handler.defaultBet;

  return `
    <div class="spielothek-bet-picker">
      <label for="spielothek-bet-range" data-i18n="spielothek.betLabel">Einsatz:</label>
      <input
        type="range"
        id="spielothek-bet-range"
        min="${handler.minBet}"
        max="${handler.maxBet}"
        step="${handler.betStep}"
        value="${handler.defaultBet}"
        oninput="onSpielothekBetInput(this.value)"
      >
      <span id="spielothek-bet-value" class="spielothek-bet-value">${handler.defaultBet} 🪙</span>
    </div>
  `;
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
    ${buildSpielothekBetHtml(handler)}

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
  // Frisch aufgebautes Markup kennt einen evtl. noch laufenden Cooldown
  // nicht (siehe ausfuehrlicher Kommentar bei refreshSpielothekCooldownFromServer()
  // weiter oben) - hier direkt nach dem Aufbau nachladen.
  refreshSpielothekCooldownFromServer();
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
