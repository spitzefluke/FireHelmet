/* ======================================================
   GLÜCKSRAD + CODE-TRACKING + GLOBALE RANGLISTE
   - Rad wird aus scripts/wheel-data.js gebaut
   - Einmal pro Tag drehbar (pro Browser/Gerät, via localStorage)
   - Rangliste zählt, wie viele VERSCHIEDENE Codes ein
     Besucher erfolgreich geknackt hat (scripts/main.js ruft
     dafür recordCodeCrack() auf)
   - Nach dem Drehen läuft ein Countdown bis zur nächsten
     möglichen Drehung (Mitternacht)
   - Jede Drehung und jeder NEU geknackte Code geben zusätzlich
     Fortschritt fürs Wochenrennen (siehe scripts/race.js)
   - Alles wird über Supabase/Postgres global gespeichert (RLS-
     geschuetzt ueber die anonyme Supabase-Sitzung, siehe
     scripts/supabase/supabase-client.js und
     supabase/game-migration/README.md)
====================================================== */

let wheelBuilt = false;
let wheelCountdownInterval = null;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getWheelState() {
  return {
    nickname: localStorage.getItem("wheelNickname") || "",
    lastSpin: localStorage.getItem("wheelLastSpin") || null,
    streak: parseInt(localStorage.getItem("wheelStreak") || "0", 10),
  };
}

function getCrackedCodes() {
  try {
    return JSON.parse(localStorage.getItem("crackedCodes") || "[]");
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------
   EINMALIGE MIGRATION: alte, im Klartext gespeicherte Codes
   (vor der Sicherheits-Umstellung auf Hashes) werden beim
   nächsten Seitenaufruf automatisch in Hashes umgewandelt,
   damit sie nicht versehentlich doppelt gezählt werden.
------------------------------------------------------ */
async function migrateCrackedCodesFormat() {
  if (localStorage.getItem("crackedCodesMigrated") === "1") return;

  const cracked = getCrackedCodes();
  if (!cracked.length || typeof sha256Hex !== "function") {
    localStorage.setItem("crackedCodesMigrated", "1");
    return;
  }

  const isHash = (v) => /^[a-f0-9]{64}$/i.test(v);
  const migrated = [];

  for (const entry of cracked) {
    if (isHash(entry)) {
      migrated.push(entry);
    } else {
      migrated.push(await sha256Hex(String(entry).toLowerCase()));
    }
  }

  const unique = [...new Set(migrated)];
  localStorage.setItem("crackedCodes", JSON.stringify(unique));
  localStorage.setItem("codesCracked", String(unique.length));
  localStorage.setItem("crackedCodesMigrated", "1");
}

window.addEventListener("DOMContentLoaded", () => {
  migrateCrackedCodesFormat();
  renderAvatarPicker();
});

function isCodeAlreadyCracked(codeId) {
  return getCrackedCodes().includes(codeId);
}

/* ------------------------------------------------------
   RAD AUFBAUEN
------------------------------------------------------ */
/* ------------------------------------------------------
   WÖCHENTLICHES RAD-THEMA AUSWÄHLEN
   Reihum nach Wochennummer - für alle Besucher gleich.
------------------------------------------------------ */
function getWeeklyWheelTheme() {
  if (typeof wheelThemes === "undefined" || wheelThemes.length === 0) return null;
  if (typeof getCurrentWeekId !== "function") return wheelThemes[0];

  const weekId = getCurrentWeekId();
  const match = weekId.match(/W(\d+)/);
  const weekNum = match ? parseInt(match[1], 10) : 1;

  return wheelThemes[weekNum % wheelThemes.length];
}

function applyWheelThemeAccent(theme) {
  if (!theme) return;

  document.documentElement.style.setProperty("--wheel-accent", theme.accent);

  const themeLabel = document.getElementById("wheel-theme-label");
  if (themeLabel) {
    themeLabel.textContent = `Diese Woche: ${theme.name}`;
  }

  buildWheelOrbitRing(theme);
}

/* ------------------------------------------------------
   ORBIT-RING
   Kreisende, zum Wochenthema passende Icons um das Rad
   (z.B. Anker/Gold für "Gold & Piraten", Wellen/Fische für
   "Ozean-Blau" usw.) - macht jede Woche optisch komplett neu.
------------------------------------------------------ */
function buildWheelOrbitRing(theme) {
  const wrapper = document.querySelector(".wheel-wrapper");
  if (!wrapper || !theme || !theme.icons) return;

  let ring = wrapper.querySelector(".wheel-orbit-ring");
  if (!ring) {
    ring = document.createElement("div");
    ring.className = "wheel-orbit-ring";
    wrapper.insertBefore(ring, wrapper.firstChild);
  }

  ring.innerHTML = "";
  const iconCount = 8;

  for (let i = 0; i < iconCount; i++) {
    const angle = (360 / iconCount) * i;
    const icon = theme.icons[i % theme.icons.length];

    const item = document.createElement("span");
    item.className = "wheel-orbit-icon";
    item.textContent = icon;
    item.style.transform = `rotate(${angle}deg) translateY(-165px) rotate(${-angle}deg)`;
    item.style.animationDelay = `${i * -1.5}s`;

    ring.appendChild(item);
  }
}

function buildWheel() {
  const disc = document.getElementById("wheel-disc");
  if (!disc || typeof wheelPrizes === "undefined" || wheelPrizes.length === 0) {
    return;
  }

  const theme = getWeeklyWheelTheme();
  applyWheelThemeAccent(theme);

  const segmentAngle = 360 / wheelPrizes.length;

  const gradientParts = wheelPrizes
    .map((p, i) => {
      const color = theme ? theme.colors[i % theme.colors.length] : p.color;
      return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
    })
    .join(", ");

  disc.style.background = `conic-gradient(${gradientParts})`;
  disc.innerHTML = "";

  wheelPrizes.forEach((prize, i) => {
    const mid = segmentAngle * i + segmentAngle / 2;

    const label = document.createElement("div");
    label.className = "wheel-label";
    label.textContent = prize.label;
    label.style.transform = `rotate(${mid}deg)`;

    disc.appendChild(label);
  });

  buildWheelBulbs();
}

/* ------------------------------------------------------
   BLINKENDE RAND-LICHTER (wie bei einem echten Glücksrad)
------------------------------------------------------ */
function buildWheelBulbs() {
  const container = document.getElementById("wheel-bulbs");
  if (!container) return;

  container.innerHTML = "";

  const count = 16;
  const radiusPercent = 49;

  for (let i = 0; i < count; i++) {
    const rad = ((360 / count) * i * Math.PI) / 180;
    const x = 50 + radiusPercent * Math.cos(rad);
    const y = 50 + radiusPercent * Math.sin(rad);

    const bulb = document.createElement("div");
    bulb.className = "wheel-bulb";
    bulb.style.left = x + "%";
    bulb.style.top = y + "%";
    bulb.style.animationDelay = (i % 2 === 0 ? "0s" : ".45s");

    container.appendChild(bulb);
  }
}

/* ------------------------------------------------------
   FUNKEN-EFFEKT, WENN DAS RAD LANDET
------------------------------------------------------ */
function spawnWheelSparks() {
  const container = document.getElementById("wheel-sparks");
  if (!container) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * 360;
    const distance = 55 + Math.random() * 65;

    const spark = document.createElement("div");
    spark.className = "wheel-spark";
    spark.style.setProperty("--angle", angle + "deg");
    spark.style.setProperty("--distance", distance + "px");

    container.appendChild(spark);
    setTimeout(() => spark.remove(), 850);
  }
}

/* ------------------------------------------------------
   COUNTDOWN BIS ZUR NÄCHSTEN DREHUNG
------------------------------------------------------ */
function getMsUntilNextMidnight() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  return nextMidnight - now;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopWheelCountdown() {
  clearInterval(wheelCountdownInterval);
  wheelCountdownInterval = null;

  const countdownEl = document.getElementById("wheel-countdown");
  if (countdownEl) {
    countdownEl.style.display = "none";
    countdownEl.textContent = "";
  }
}

function startWheelCountdown() {
  const countdownEl = document.getElementById("wheel-countdown");
  if (!countdownEl) return;

  stopWheelCountdown();

  function tick() {
    const msLeft = getMsUntilNextMidnight();

    if (msLeft <= 0) {
      stopWheelCountdown();
      refreshWheelStatus(); // Tag hat gewechselt -> Rad wieder freigeben
      return;
    }

    countdownEl.textContent = tFormat("wheel.countdownLabel", { time: formatDuration(msLeft) });
    countdownEl.style.display = "block";
  }

  tick();
  wheelCountdownInterval = setInterval(tick, 1000);
}

/* ------------------------------------------------------
   STATUS-ANZEIGE (gesperrt/frei, aktuelle Streak, Countdown)
------------------------------------------------------ */
function refreshWheelStatus() {
  const state = getWheelState();
  const statusEl = document.getElementById("wheel-status");
  const spinBtn = document.getElementById("spin-button");
  const loginHint = document.getElementById("wheel-login-hint");

  if (!statusEl || !spinBtn) return;

  if (loginHint) {
    loginHint.style.display = state.nickname ? "none" : "block";
  }

  const today = todayStr();

  if (!state.nickname) {
    spinBtn.disabled = true;
    statusEl.textContent = t("wheel.status.needLogin");
    stopWheelCountdown();
    return;
  }

  if (state.lastSpin === today) {
    spinBtn.disabled = true;
    statusEl.textContent = tFormat("wheel.status.spunToday", { streak: state.streak });
    startWheelCountdown();
  } else {
    spinBtn.disabled = false;
    statusEl.textContent =
      state.streak > 0
        ? tFormat("wheel.status.streakActive", { streak: state.streak })
        : t("wheel.status.readyToSpin");
    stopWheelCountdown();
  }
}

/* ------------------------------------------------------
   NAMENS-FILTER
   Normalisiert den eingegebenen Namen (Kleinschreibung, gängige
   Zahlen-Buchstaben-Vertauschungen aufgelöst, Sonderzeichen
   entfernt) und prüft ihn gegen scripts/wheel/nickname-filter-data.js
------------------------------------------------------ */
// Kyrillische/griechische Buchstaben, die optisch wie lateinische
// aussehen, werden hierauf abgebildet - sonst würden sie beim
// Filtern einfach nur entfernt, statt das Wort zu enttarnen
// (z.B. würde ein kyrillisches "а" in "аrschloch" sonst einfach
// verschwinden und "rschloch" übrig bleiben, statt "arschloch"
// zu ergeben).
const NICKNAME_HOMOGLYPHS = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ѕ: "s", // kyrillisch
  α: "a", ε: "e", ο: "o", ρ: "p", υ: "y", χ: "x", ι: "i", // griechisch
};

// Buchstaben-/Zahlen-Vertauschungen und Homoglyphen aufloesen, aber
// (anders als normalizeNicknameForFilter) Trennzeichen wie Leerzeichen
// noch NICHT entfernen - wird sowohl fuer den voll zusammengezogenen
// Vergleichstext als auch fuer die Wort-fuer-Wort-Pruefung unten
// gebraucht.
function applyNicknameSubstitutions(name) {
  let text = name.toLowerCase();

  for (const [from, to] of Object.entries(NICKNAME_HOMOGLYPHS)) {
    text = text.split(from).join(to);
  }

  return text
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function collapseRepeatedLetters(text) {
  // Wiederholte/gestreckte Buchstaben zusammenziehen, z.B.
  // "arrrschloch" oder "aaarschloch" -> "arschloch", damit sich
  // niemand durch Buchstaben-Wiederholung mitten im Wort
  // vorbeimogeln kann
  return text.replace(/(.)\1+/g, "$1");
}

function normalizeNicknameForFilter(name) {
  const substituted = applyNicknameSubstitutions(name).replace(/[^a-zäöüß]/g, "");
  return collapseRepeatedLetters(substituted);
}

// Einzelne "Woerter" des Namens (getrennt durch Leerzeichen oder
// sonstige Nicht-Buchstaben, z.B. Unterstriche/Punkte), jeweils fuer
// sich normalisiert. Wird nur fuer KURZE Filterbegriffe gebraucht,
// siehe isNicknameBlocked().
function getNicknameWords(name) {
  return applyNicknameSubstitutions(name)
    .split(/[^a-zäöüß]+/)
    .filter(Boolean)
    .map(collapseRepeatedLetters);
}

// Ab dieser Laenge wird ein Filterbegriff als Teilstring des GESAMTEN,
// getrennt-zeichen-frei zusammengezogenen Namens gesucht (fängt damit
// auch auseinandergezogene Schreibweisen wie "B e l e i d i g u n g"
// ab). KURZE Begriffe (z.B. "mod", 3 Zeichen) wuerden als reine
// Teilstring-Suche viel zu leicht harmlose Namen treffen, die den
// Begriff nur zufaellig enthalten (z.B. "Commodore" enthaelt "mod",
// "Modest" beginnt mit "mod") - die pruefen wir stattdessen nur gegen
// einzelne, durch Trennzeichen abgegrenzte Wortteile des Namens bzw.
// gegen den kompletten Namen, nicht gegen eine beliebige Stelle mitten
// in einem laengeren, harmlosen Wort.
const NICKNAME_SUBSTRING_MATCH_MIN_LENGTH = 5;

function isNicknameBlocked(name) {
  const normalized = normalizeNicknameForFilter(name);
  if (!normalized) return false;

  const ownList = typeof nicknameBlocklist !== "undefined" ? nicknameBlocklist : [];
  const combinedList = [...ownList, ...externalBadWordsList];
  const words = getNicknameWords(name);

  return combinedList.some((entry) => {
    const normalizedWord = normalizeNicknameForFilter(entry);
    if (!normalizedWord || normalizedWord.length < 3) return false;

    if (normalizedWord.length >= NICKNAME_SUBSTRING_MATCH_MIN_LENGTH) {
      return normalized.includes(normalizedWord);
    }

    // Kurzer Begriff: nur blocken, wenn er als eigenstaendiges Wort
    // vorkommt oder der GESAMTE Name (zusammengezogen) genau diesem
    // Begriff entspricht - nicht, wenn er nur zufaellig als
    // Teilstring in einem laengeren, harmlosen Namen steckt.
    return normalized === normalizedWord || words.includes(normalizedWord);
  });
}

/* ------------------------------------------------------
   ZENTRALE NAMENS-VALIDIERUNG
   ---------------------------------------------------
   EINZIGE Stelle, die einen vom Spieler frei eingegebenen Namen
   (aktuell: anonyme Anmeldung) vor dem Speichern prueft - Laenge,
   erlaubte Zeichen UND der Schimpfwort-Filter oben. Alle
   Anmeldewege, die einen frei eingetippten Namen entgegennehmen,
   sollen ausschliesslich ueber diese Funktion laufen, damit es nicht
   mehrere, unterschiedlich strenge Pruefungen im Code gibt.
   (Bei Twitch/Discord-Login wird stattdessen der echte, vom Anbieter
   bestaetigte Anzeigename uebernommen - der wird bewusst NICHT gegen
   den Schimpfwort-Filter geprueft, da er keine frei waehlbare,
   anonyme Trollerie ist, sondern die tatsaechliche Konto-Identitaet;
   beim Anzeigen wird er wie jeder andere Name ueber escapeHtml()
   ausgegeben, siehe renderPlayerCardHtml() etc.)
------------------------------------------------------ */
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 18; // deckt sich mit maxlength="18" auf #wheel-nickname-input
// Erlaubt: Buchstaben (inkl. Umlaute/Unicode), Zahlen, Leerzeichen und
// die gaengigen harmlosen Trennzeichen. Alles andere - insbesondere
// < > & " ' sowie Steuerzeichen - wird abgelehnt, damit ueber den
// Namen niemals HTML/JS eingeschleust werden kann. Das ist eine
// zusaetzliche Absicherung an der Eingabe; die eigentliche, immer
// greifende Schutzmassnahme ist aber, dass jede Anzeigestelle den
// Namen ausschliesslich per escapeHtml() (sichere Textausgabe) statt
// per roher HTML-Injektion ausgibt.
const NICKNAME_ALLOWED_CHARS = /^[\p{L}\p{N} _\-.]+$/u;

function validateUsername(rawName) {
  const name = (rawName || "").trim().replace(/\s+/g, " ");

  if (name.length < NICKNAME_MIN_LENGTH) {
    return { ok: false, reason: "tooShort" };
  }
  if (name.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: "tooLong" };
  }
  if (!NICKNAME_ALLOWED_CHARS.test(name)) {
    return { ok: false, reason: "invalidChars" };
  }
  if (isNicknameBlocked(name)) {
    return { ok: false, reason: "blocked" };
  }

  return { ok: true, name };
}

/* ------------------------------------------------------
   AVATAR-AUSWAHL (nur bei der anonymen Anmeldung)
------------------------------------------------------ */
let selectedWheelAvatar = null;

function isAvatarImagePath(value) {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(value) || value.startsWith("http") || value.includes("/");
}

function buildAvatarPickerHtml(avatar) {
  return isAvatarImagePath(avatar)
    ? `<img src="${avatar}" alt="" loading="lazy" decoding="async">`
    : `<span>${avatar}</span>`;
}

function getUnlockedAvatarIds() {
  try {
    return JSON.parse(localStorage.getItem("unlockedAvatars") || "[]");
  } catch (err) {
    return [];
  }
}

// Zeitlich befristete Avatare (siehe redeemWheelPrize()/tempAvatar):
// Ablaufzeit kommt IMMER aus dem serverzeit-verankerten Datenbankfeld
// (ueber syncTempAvatarFromServer() nach localStorage gespiegelt),
// nicht aus einem separaten, frei erfundenen "gueltig bis"-Wert - ein
// Vergleich gegen die eigene (moeglicherweise verstellte) Client-Uhr
// kann hier bestenfalls die ANZEIGE, nie den tatsaechlich gespeicherten
// Wert selbst verfaelschen (siehe app.valid_wheel_fields() in
// supabase/game-migration/01-players-ship-progression.sql fuer die
// serverseitige Absicherung DIESES Wertes).
function getActiveTempAvatarId() {
  const expiresAt = parseInt(localStorage.getItem("tempAvatarExpiresAt") || "0", 10);
  if (!expiresAt || Date.now() >= expiresAt) return null;
  return localStorage.getItem("tempAvatarId") || null;
}

function formatTempAvatarRemaining(expiresAt) {
  const msLeft = expiresAt - Date.now();
  if (msLeft <= 0) return "";
  const hoursLeft = Math.ceil(msLeft / 3600000);
  return hoursLeft >= 24 ? `${Math.ceil(hoursLeft / 24)}d` : `${hoursLeft}h`;
}

function renderAvatarPicker() {
  const picker = document.getElementById("wheel-avatar-picker");
  if (!picker || typeof wheelAvatarOptions === "undefined") return;

  const unlockedIds = getUnlockedAvatarIds();
  const specials = typeof wheelSpecialAvatars !== "undefined" ? wheelSpecialAvatars : [];
  const activeTempAvatarId = getActiveTempAvatarId();
  const expiresAt = parseInt(localStorage.getItem("tempAvatarExpiresAt") || "0", 10);

  // Ein abgelaufener Test-Avatar darf nicht mehr als aktiv ausgewaehlt
  // sein - faellt die aktuelle Auswahl auf einen inzwischen abgelaufenen
  // (und nicht dauerhaft freigeschalteten) Test-Avatar, wird sie auf den
  // ersten Standard-Avatar zurueckgesetzt.
  const savedAvatar = localStorage.getItem("wheelAvatar");
  const savedMatchesExpiredTemp = specials.some((entry) =>
    entry.isTemporary && entry.avatar === savedAvatar
    && !unlockedIds.includes(entry.id) && entry.id !== activeTempAvatarId
  );
  if (savedMatchesExpiredTemp) {
    localStorage.removeItem("wheelAvatar");
  }
  selectedWheelAvatar = savedMatchesExpiredTemp ? (wheelAvatarOptions[0] || null) : (savedAvatar || wheelAvatarOptions[0] || null);

  // Immer verfügbare Standard-Avatare
  let html = wheelAvatarOptions
    .map((avatar, i) => {
      const isSelected = avatar === selectedWheelAvatar;
      return `
        <button type="button" class="avatar-option${isSelected ? " avatar-option-selected" : ""}"
          data-avatar-value="${encodeURIComponent(avatar)}" onclick="selectWheelAvatar(this.dataset.avatarValue)">
          ${buildAvatarPickerHtml(avatar)}
        </button>
      `;
    })
    .join("");

  // Freischaltbare Spezial-Avatare (gesperrt, bis der passende Code/das
  // Schatzrad kam) - zeitlich befristete Eintraege (isTemporary) gelten
  // zusaetzlich als "unlocked", solange ihre Server-Ablaufzeit noch in
  // der Zukunft liegt.
  html += specials
    .map((entry) => {
      const isActiveTemp = entry.isTemporary && entry.id === activeTempAvatarId;
      const unlocked = unlockedIds.includes(entry.id) || isActiveTemp;
      const isSelected = unlocked && entry.avatar === selectedWheelAvatar;

      if (!unlocked) {
        const lockedTitle = entry.isTemporary
          ? `Gesperrt - '${entry.label}' kann als zeitlich begrenzte Schatzrad-Belohnung gewonnen werden!`
          : `Gesperrt - schalte '${entry.label}' durch einen passenden Code frei!`;
        return `
          <button type="button" class="avatar-option avatar-option-locked" disabled
            title="${lockedTitle}">
            <span class="avatar-lock-icon">🔒</span>
          </button>
        `;
      }

      const remainingBadge = isActiveTemp
        ? `<span class="avatar-option-temp-badge" title="Noch verfügbar">⏳ ${formatTempAvatarRemaining(expiresAt)}</span>`
        : "";

      return `
        <button type="button" class="avatar-option avatar-option-unlocked${isSelected ? " avatar-option-selected" : ""}${isActiveTemp ? " avatar-option-temporary" : ""}"
          title="${entry.label}"
          data-avatar-value="${encodeURIComponent(entry.avatar)}" onclick="selectWheelAvatar(this.dataset.avatarValue)">
          ${buildAvatarPickerHtml(entry.avatar)}
          ${remainingBadge}
        </button>
      `;
    })
    .join("");

  picker.innerHTML = html;
}

/* ------------------------------------------------------
   ZEITLICH BEFRISTETEN AVATAR VOM SERVER ABGLEICHEN
   Wird bei jedem Besuch der Login-/Schatzrad-Seite aufgerufen (siehe
   updateLoginPage()/updateWheelPage()) - genau das gleiche Prinzip wie
   syncOwnedShopItemsFromServer() im Shop: players/{uid}.tempAvatarExpiresAt
   ist die alleinige Wahrheit, localStorage ist nur eine schnelle,
   NACHGEORDNETE Kopie fuer die Anzeige (siehe getActiveTempAvatarId()).
------------------------------------------------------ */
async function syncTempAvatarFromServer() {
  if (!supabaseClient) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const { data, error } = await supabaseClient
      .from("players")
      .select("temp_avatar_expires_at, temp_avatar_id")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (error || !data) return;

    if (typeof data.temp_avatar_expires_at === "number") {
      localStorage.setItem("tempAvatarExpiresAt", String(data.temp_avatar_expires_at));
      localStorage.setItem("tempAvatarId", data.temp_avatar_id || "");
    }

    if (typeof renderAvatarPicker === "function") {
      renderAvatarPicker();
    }
  } catch (err) {
    console.warn("Zeitlich begrenzter Avatar konnte nicht abgeglichen werden:", err);
  }
}

/* ------------------------------------------------------
   ECHTEN SERVER-COOLDOWN IN localStorage SPIEGELN
   ---------------------------------------------------
   refreshWheelStatus()/spinWheel() gaten den Dreh-Button bisher rein
   ueber den lokal gespeicherten Kalendertag ("wheelLastSpin" == heute)
   - die echte RLS-Regel (app.valid_wheel_fields, siehe
   01-players-ship-progression.sql) erlaubt aber ein rollendes 20h-
   Fenster, kein Kalendertag-Fenster. Weichen beide auseinander (z.B.
   nach einem frueheren, nur serverseitig erfolgreichen Testlauf, bei
   dem "wheelLastSpin" lokal nie mitgeschrieben wurde), zeigt der
   Button faelschlich "bereit" - die Drehung laeuft dann komplett
   durch und scheitert erst ganz am Ende an der echten RLS-Pruefung
   (redeemWheelPrize() wirft "too-soon"). Dieser Abgleich laeuft bei
   jedem Aufruf der Schatzrad-Seite und zieht "wheelLastSpin"/
   "wheelStreak" auf den tatsaechlichen Server-Stand nach, BEVOR der
   Button freigegeben wird.
------------------------------------------------------ */
async function syncWheelCooldownFromServer() {
  if (!supabaseClient) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    const { data, error } = await supabaseClient
      .from("players")
      .select("last_wheel_spin_at, streak")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (error || !data) return;

    const lastSpinAt = data.last_wheel_spin_at ? new Date(data.last_wheel_spin_at).getTime() : null;
    const stillOnCooldown = lastSpinAt && Date.now() - lastSpinAt < WHEEL_SPIN_MIN_INTERVAL_MS;

    localStorage.setItem("wheelLastSpin", stillOnCooldown ? todayStr() : "");
    localStorage.setItem("wheelStreak", String(data.streak || 0));

    refreshWheelStatus();
  } catch (err) {
    console.warn("Schatzrad-Cooldown konnte nicht mit dem Server abgeglichen werden:", err);
  }
}

function selectWheelAvatar(rawValue) {
  const value = decodeURIComponent(rawValue);
  selectedWheelAvatar = value;

  document.querySelectorAll(".avatar-option[data-avatar-value]").forEach((btn) => {
    btn.classList.toggle("avatar-option-selected", decodeURIComponent(btn.dataset.avatarValue) === value);
  });
}

/* ------------------------------------------------------
   AVATAR PER CODE FREISCHALTEN
   Wird von main.js aufgerufen, wenn ein Code mit einem
   "avatarUnlock"-Feld erfolgreich (und zum ersten Mal)
   eingelöst wurde.
------------------------------------------------------ */
function unlockAvatar(avatarId) {
  if (typeof wheelSpecialAvatars === "undefined") return;

  const entry = wheelSpecialAvatars.find((a) => a.id === avatarId);
  if (!entry) return;

  const unlockedIds = getUnlockedAvatarIds();
  if (unlockedIds.includes(avatarId)) return; // schon freigeschaltet

  unlockedIds.push(avatarId);
  localStorage.setItem("unlockedAvatars", JSON.stringify(unlockedIds));

  renderAvatarPicker();
  showAvatarUnlockToast(entry);
}

function showAvatarUnlockToast(entry) {
  const toast = document.createElement("div");
  toast.className = "avatar-unlock-toast";
  toast.innerHTML = `
    <div class="avatar-unlock-toast-icon">${buildAvatarPickerHtml(entry.avatar)}</div>
    <div class="avatar-unlock-toast-text">
      <strong>Neuer Avatar freigeschaltet!</strong>
      <span>${entry.label}</span>
    </div>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ------------------------------------------------------
   NAME SPEICHERN
------------------------------------------------------ */
const NICKNAME_VALIDATION_MESSAGES = {
  tooShort: "❌ Der Name ist zu kurz. Bitte gib mindestens 2 Zeichen ein.",
  tooLong: `❌ Der Name ist zu lang (max. ${NICKNAME_MAX_LENGTH} Zeichen).`,
  // Verraet absichtlich NICHT, welcher Begriff genau angeschlagen hat -
  // sonst liesse sich der Filter durch Ausprobieren "durchtesten".
  invalidChars: "❌ Bitte nur Buchstaben, Zahlen, Leerzeichen sowie - _ . verwenden.",
  blocked: "Arrr! Dieser Name passt leider nicht zu unserer Crew. Versuch bitte einen anderen.",
};

async function saveNickname() {
  const input = document.getElementById("wheel-nickname-input");
  const messageEl = document.getElementById("nickname-error");
  if (!input) return;

  const rawName = input.value.trim();
  if (messageEl) messageEl.textContent = "";

  if (!rawName) return;

  // Sicherstellen, dass die externe Schimpfwort-Datenbank geladen ist,
  // bevor geprüft wird (ist in aller Regel längst fertig, da das Laden
  // schon beim Öffnen der Seite gestartet wurde)
  if (messageEl) messageEl.textContent = "⏳ Name wird geprüft ...";
  if (typeof loadExternalBadWords === "function") {
    await loadExternalBadWords();
  }
  if (messageEl) messageEl.textContent = "";

  // Einzige Stelle, die einen frei eingetippten Namen prueft (Laenge,
  // erlaubte Zeichen, Schimpfwort-Filter) - siehe validateUsername()
  // weiter oben in dieser Datei.
  const result = validateUsername(rawName);
  if (!result.ok) {
    if (messageEl) {
      messageEl.textContent = NICKNAME_VALIDATION_MESSAGES[result.reason] || NICKNAME_VALIDATION_MESSAGES.blocked;
    }
    return;
  }
  const name = result.name;

  const isFirstEverSignup = !localStorage.getItem("wheelNickname") && !localStorage.getItem("hasSeenCrewJoinAnimation");

  localStorage.setItem("wheelNickname", name);
  localStorage.setItem("loginProvider", "anonymous");

  if (selectedWheelAvatar) {
    localStorage.setItem("wheelAvatar", selectedWheelAvatar);
  }

  refreshWheelStatus();
  savePlayerData({ nickname: name });
  syncCodesToDatabase();
  showNicknameSuccess(name);
  if (typeof refreshPlayerCard === "function") refreshPlayerCard();

  if (isFirstEverSignup && typeof showCrewJoinAnimation === "function") {
    localStorage.setItem("hasSeenCrewJoinAnimation", "1");
    showCrewJoinAnimation(name);
  }
}

/* ------------------------------------------------------
   ERFOLGS-ANIMATION NACH DEM (ANONYMEN) REGISTRIEREN
------------------------------------------------------ */
function showNicknameSuccess(name) {
  const box = document.getElementById("wheel-nickname-box");
  const successEl = document.getElementById("nickname-success");
  const textEl = successEl ? successEl.querySelector(".nickname-success-text") : null;
  if (!box || !successEl) return;

  if (textEl) {
    textEl.textContent = `Willkommen, ${name}!`;
  }

  box.classList.add("nickname-just-saved");
  successEl.classList.remove("visible");
  void successEl.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
  successEl.classList.add("visible");

  if (typeof triggerCodeSuccessEffect === "function") {
    triggerCodeSuccessEffect();
  }

  setTimeout(() => {
    box.classList.remove("nickname-just-saved");
    successEl.classList.remove("visible");
  }, 2600);
}

/* ------------------------------------------------------
   NACHHOL-SYNCHRONISIERUNG
   Falls schon vorher Codes lokal geknackt wurden, bevor ein
   Name gesetzt war (oder die Synchronisierung mal fehlschlug),
   werden sie hier nachträglich in die Datenbank übertragen -
   sicher per atomarem Zähler, kein Überschreiben möglich.
------------------------------------------------------ */
function syncCodesToDatabase() {
  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname || !supabaseClient) return;

  const totalCracked = getCrackedCodes().length;
  const syncedCount = parseInt(localStorage.getItem("codesSyncedCount") || "0", 10);
  const missing = totalCracked - syncedCount;

  if (missing <= 0) return;

  wheelAuthReady.then(async (uid) => {
    if (!uid) return;

    try {
      await ensureSupabasePlayerRow(uid, nickname);

      const { data: current, error: readError } = await supabaseClient
        .from("players")
        .select("codes_cracked, rewards")
        .eq("firebase_uid", uid)
        .maybeSingle();
      if (readError) throw readError;

      const fields = {
        nickname: nickname,
        codes_cracked: (current && current.codes_cracked ? current.codes_cracked : 0) + missing,
      };

      // Aequivalent zu Firestores arrayUnion: dedupliziert von Hand,
      // ungefaehrlich mehrfach aufzurufen.
      const rewards = getCodeRewards();
      if (rewards.length) {
        const oldRewards = (current && current.rewards) || [];
        fields.rewards = [...new Set([...oldRewards, ...rewards])];
      }

      const { error: writeError } = await supabaseClient
        .from("players")
        .update(fields)
        .eq("firebase_uid", uid);
      if (writeError) throw writeError;

      localStorage.setItem("codesSyncedCount", String(totalCracked));
    } catch (err) {
      console.error("Nachhol-Synchronisierung fehlgeschlagen:", err);
    }
  });
}

/* ------------------------------------------------------
   DUBLONEN (Shop-Währung) VERGEBEN
   Wird von main.js (Codes), race.js (Wochenrennen-Platzierung)
   und community-boss.js (Top-Angreifer) aufgerufen.
------------------------------------------------------ */
async function addCurrency(amount) {
  if (!supabaseClient || !amount) return;

  try {
    const uid = await wheelAuthReady;
    if (!uid) return;

    await ensureSupabasePlayerRow(uid, localStorage.getItem("wheelNickname") || "");

    const { data: current, error: readError } = await supabaseClient
      .from("players")
      .select("currency, total_currency_earned")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (readError) throw readError;

    const { error: writeError } = await supabaseClient
      .from("players")
      .update({
        currency: (current && current.currency ? current.currency : 0) + amount,
        // Lebenslanger Zaehler, unabhaengig vom (auch wieder sinkenden)
        // Kontostand - Grundlage fuer die taeglichen Reparatur-Quests
        // (siehe DAILY_QUESTS in ship-repair-data.js).
        total_currency_earned: (current && current.total_currency_earned ? current.total_currency_earned : 0) + amount,
      })
      .eq("firebase_uid", uid);
    if (writeError) throw writeError;

    if (typeof refreshShopCurrencyDisplay === "function") {
      refreshShopCurrencyDisplay();
    }
    if (typeof showCurrencyToast === "function") {
      showCurrencyToast(amount);
    }
  } catch (err) {
    console.warn("Dublonen konnten nicht vergeben werden:", err);
  }
}

function showCurrencyToast(amount) {
  const toast = document.createElement("div");
  toast.className = "currency-toast";
  toast.innerHTML = `<span class="currency-toast-icon">💰</span> +${amount} Dublonen`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function savePlayerData(fields) {
  if (!supabaseClient) return;

  const provider = localStorage.getItem("loginProvider") || "";
  let avatar = null;

  if (provider === "discord") {
    avatar = localStorage.getItem("discordAvatar") || null;
  } else if (provider === "twitch") {
    avatar = localStorage.getItem("twitchAvatar") || null;
  } else {
    avatar = localStorage.getItem("wheelAvatar") || null;
  }

  wheelAuthReady.then(async (uid) => {
    if (!uid) {
      console.warn("Keine Supabase-Anmeldung vorhanden, Eintrag wird nicht gespeichert.");
      return;
    }

    const nickname = "nickname" in fields ? fields.nickname : localStorage.getItem("wheelNickname") || "";

    try {
      await ensureSupabasePlayerRow(uid, nickname);

      // "fields" kommt bisher ausschliesslich mit genau einem von zwei
      // Schluesseln herein (nickname aus saveNickname()/twitch-auth.js,
      // equippedFrame aus shop.js equipFrame()) - deshalb explizite
      // Zuordnung auf die passenden Spalten statt eines generischen
      // camelCase->snake_case-Mappings.
      const update = { avatar: avatar };
      if ("nickname" in fields) update.nickname = fields.nickname;
      if ("equippedFrame" in fields) update.equipped_frame = fields.equippedFrame;

      const { error } = await supabaseClient.from("players").update(update).eq("firebase_uid", uid);
      if (error) throw error;
    } catch (err) {
      console.error("Eintrag konnte nicht gespeichert werden:", err);
    }
  });
}

/* ------------------------------------------------------
   GEWICHTETE ZUFALLSAUSWAHL (Seltenheiten)
   Jeder Preis in wheelPrizes hat ein eigenes "weight" - die tatsaech-
   liche Chance ist weight/Summe-aller-weights. Zentral hier statt
   verstreut, damit die in wheel-data.js dokumentierten Seltenheits-
   Stufen (WHEEL_RARITY_INFO) tatsaechlich das Auswahl-Verhalten
   steuern und bei Aenderung der Gewichte nichts hier angepasst
   werden muss.
------------------------------------------------------ */
function pickWeightedWheelPrize() {
  const totalWeight = wheelPrizes.reduce((sum, p) => sum + (p.weight || 1), 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < wheelPrizes.length; i++) {
    roll -= wheelPrizes[i].weight || 1;
    if (roll <= 0) return i;
  }
  return wheelPrizes.length - 1; // Rundungs-Fallback
}

// Verhindert mehrfache Belohnungen durch schnelles Klicken/Konsolen-
// Aufrufe: spinWheel() bricht sofort ab, wenn bereits eine Drehung
// laeuft - unabhaengig vom (erst NACH der Animation aktualisierten)
// "heute schon gedreht"-Datum in localStorage.
let wheelSpinInFlight = false;

/* ------------------------------------------------------
   DREHEN
------------------------------------------------------ */
function spinWheel() {
  if (wheelSpinInFlight) return;

  const state = getWheelState();
  const today = todayStr();

  if (!state.nickname || state.lastSpin === today) {
    refreshWheelStatus();
    return;
  }

  const disc = document.getElementById("wheel-disc");
  const wrapper = document.querySelector(".wheel-wrapper");
  const spinBtn = document.getElementById("spin-button");
  const resultEl = document.getElementById("wheel-result");

  if (!disc || !spinBtn || typeof wheelPrizes === "undefined") return;

  wheelSpinInFlight = true;
  spinBtn.disabled = true;
  resultEl.textContent = "";
  resultEl.classList.remove("code-success", "code-error");

  const segmentAngle = 360 / wheelPrizes.length;
  const prizeIndex = pickWeightedWheelPrize();
  const prize = wheelPrizes[prizeIndex];

  const targetMid = prizeIndex * segmentAngle + segmentAngle / 2;
  const fullSpins = 5;
  const finalRotation = fullSpins * 360 + (360 - targetMid);

  // Komplette Drehung wird bewusst NUR über JS + inline "transform"
  // gesteuert (keine CSS-Keyframe-Animation rührt "transform" an) -
  // so kann nichts mehr mit der eigentlichen Drehung kollidieren.
  disc.style.transition = "none";
  disc.style.transform = "rotate(0deg)";
  void disc.offsetWidth; // Reflow erzwingen

  // Kurzes "Anlauf nehmen" gegen die Drehrichtung
  disc.style.transition = "transform .35s ease-out";
  disc.style.transform = "rotate(-14deg)";

  setTimeout(() => {
    if (wrapper) wrapper.classList.add("wheel-spinning");

    disc.style.transition = "transform 4.8s cubic-bezier(0.15, 0.7, 0.15, 1)";
    disc.style.transform = `rotate(${finalRotation}deg)`;
  }, 360);

  // Das Rad landet visuell nach ~5.15s (.35s Anlauf + 4.8s Drehung) -
  // GENAU DANN wird die Belohnung serverseitig eingelöst (siehe
  // finalizeSpin()), NIE vorher. Das erfundene "Feld A anzeigen, Feld
  // B gutschreiben" ist damit ausgeschlossen: "prize" ist ab hier fix,
  // dieselbe Variable treibt sowohl die Drehung als auch die
  // Gutschrift.
  setTimeout(() => {
    spawnWheelSparks();
    finalizeSpin(state, today, prize);

    if (wrapper) {
      wrapper.classList.remove("wheel-spinning");
      wrapper.classList.add("wheel-landed");
      setTimeout(() => wrapper.classList.remove("wheel-landed"), 900);
    }
  }, 5200);
}

async function finalizeSpin(state, today, prize) {
  const resultEl = document.getElementById("wheel-result");
  const spinBtn = document.getElementById("spin-button");

  let newStreak;
  try {
    newStreak = await redeemWheelPrize(prize);
  } catch (err) {
    console.warn("Schatzrad-Belohnung konnte nicht eingelöst werden:", err);
    if (resultEl) {
      resultEl.textContent = err && err.message === "too-soon"
        ? (typeof t === "function" ? t("wheel.status.spunToday", { streak: state.streak }) : "Du hast heute schon gedreht.")
        : "⚠️ Das hat nicht geklappt, bitte versuch's gleich nochmal.";
      resultEl.classList.remove("code-success");
      resultEl.classList.add("code-error");
    }
    wheelSpinInFlight = false;
    if (spinBtn) spinBtn.disabled = false;
    return;
  }

  // Erst NACH bestätigter, serverseitiger Gutschrift gilt die Drehung
  // als abgeschlossen - genau das Prinzip aus der Codesystem-Reparatur
  // (siehe redeemCurrencyCode()): niemals lokal Erfolg vortäuschen,
  // bevor die Transaktion wirklich durch ist.
  resultEl.textContent = prize.message;
  resultEl.classList.add("code-success");

  localStorage.setItem("wheelLastSpin", today);
  localStorage.setItem("wheelStreak", String(newStreak));
  localStorage.setItem("wheelAvatar_lastPrize", prize.label);

  wheelSpinInFlight = false;
  refreshWheelStatus();

  if (typeof refreshShopCurrencyDisplay === "function") {
    refreshShopCurrencyDisplay();
  }
  if (typeof renderShipToolInventory === "function") {
    renderShipToolInventory();
  }
  if (typeof renderAvatarPicker === "function") {
    renderAvatarPicker();
  }

  // Fortschritt fürs Wochenrennen
  if (typeof addRaceProgress === "function" && typeof raceConfig !== "undefined") {
    addRaceProgress(raceConfig.progressPerSpin);
  }
}

/* ------------------------------------------------------
   SCHATZRAD-BELOHNUNG SERVERSEITIG EINLÖSEN
   ---------------------------------------------------
   Genau EIN atomares Supabase-UPDATE für die gesamte Drehung -
   dasselbe Prinzip wie redeemCurrencyCode() im Codesystem:
   - prüft serverzeit-verankert, ob wirklich genug Zeit seit der
     letzten Drehung vergangen ist (players.last_wheel_spin_at,
     siehe app.valid_wheel_fields() in supabase/game-migration/ -
     das ist die ECHTE Absicherung, nicht diese Client-Vorabprüfung
     hier),
   - schreibt Streak/letzte Drehung UND die eigentliche Belohnung in
     einem einzigen Schritt,
   - reused dafür ausschließlich bereits bestehende, bereits validierte
     Felder (currency/totalCurrencyEarned, shipTools, ownedShopItems) -
     nur für die zeitlich befristete Test-Avatar-Belohnung kommen zwei
     neue, schmale Felder dazu (tempAvatarExpiresAt/tempAvatarId).

   Wirft bei zu früher Drehung einen Error mit message === "too-soon".
------------------------------------------------------ */
const WHEEL_SPIN_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h, siehe app.valid_wheel_fields()

async function redeemWheelPrize(prize) {
  if (!supabaseClient) throw new Error("no-db");
  const uid = await wheelAuthReady;
  if (!uid) throw new Error("no-uid");

  const nickname = localStorage.getItem("wheelNickname") || "";

  await ensureSupabasePlayerRow(uid, nickname);

  const { data: current, error: readError } = await supabaseClient
    .from("players")
    .select("last_wheel_spin_at, streak, currency, total_currency_earned, ship_tools, owned_shop_items")
    .eq("firebase_uid", uid)
    .maybeSingle();
  if (readError) throw readError;

  const data = current || {};
  const lastSpinAt = data.last_wheel_spin_at ? new Date(data.last_wheel_spin_at).getTime() : null;
  if (lastSpinAt && Date.now() - lastSpinAt < WHEEL_SPIN_MIN_INTERVAL_MS) {
    throw new Error("too-soon");
  }

  // Server-massgeblich statt vom Aufrufer uebernommen: ein rein lokal
  // (localStorage "wheelStreak") mitgezaehlter Streak kann von der
  // echten Datenbank abweichen - z.B. nach dem Firestore->Supabase-
  // Umstieg, wo alle echten Spielstaende bei 0 neu begannen, das
  // Browser-localStorage aber unveraendert blieb. Ein daraus
  // resultierender zu hoher Sprung wuerde von der RLS (streak <= alter
  // Wert + 1) ohnehin abgelehnt - hier wird er gar nicht erst
  // versucht, sondern immer aus dem tatsaechlichen DB-Stand berechnet.
  const lastSpinDateStr = data.last_wheel_spin_at ? new Date(data.last_wheel_spin_at).toISOString().slice(0, 10) : null;
  const newStreak = lastSpinDateStr === yesterdayStr() ? (data.streak || 0) + 1 : 1;

  const fields = {
    last_wheel_spin_at: new Date().toISOString(),
    streak: newStreak,
  };
  if (nickname) fields.nickname = nickname;

  if (prize.type === "currency") {
    fields.currency = (data.currency || 0) + prize.amount;
    fields.total_currency_earned = (data.total_currency_earned || 0) + prize.amount;
  } else if (prize.type === "tool") {
    const toolIds = typeof SHIP_TOOLS !== "undefined" ? Object.keys(SHIP_TOOLS) : [];
    if (toolIds.length) {
      const toolId = toolIds[Math.floor(Math.random() * toolIds.length)];
      const oldTools = data.ship_tools || {};
      fields.ship_tools = { ...oldTools, [toolId]: (oldTools[toolId] || 0) + 1 };
      prize.grantedToolId = toolId; // für die Ergebnis-Anzeige (optional)
    }
  } else if (prize.type === "frame") {
    const owned = data.owned_shop_items || [];
    fields.owned_shop_items = owned.includes(prize.frameId) ? owned : [...owned, prize.frameId];
  } else if (prize.type === "tempAvatar") {
    // Serverzeit-verankert: der Client berechnet den Millisekunden-
    // Wert zwar lokal (Date.now() + Tage), aber die Supabase-RLS-Regel
    // (valid_wheel_fields in 01-players-ship-progression.sql) akzeptiert
    // nur einen Wert nahe der ECHTEN Serverzeit + 3 Tage - eine
    // vorgestellte Client-Uhr kann diesen Wert also nicht verlängern.
    fields.temp_avatar_expires_at = Date.now() + prize.durationDays * 86400000;
    fields.temp_avatar_id = prize.avatarId;
  }

  const { data: updated, error: writeError } = await supabaseClient
    .from("players")
    .update(fields)
    .eq("firebase_uid", uid)
    .select()
    .maybeSingle();

  if (writeError || !updated) {
    throw new Error("too-soon");
  }

  return updated.streak;
}

/* ------------------------------------------------------
   CODES-TRACKING
   Wird von main.js -> checkCode() bei jedem ERFOLGREICH
   erkannten Code aufgerufen. Zählt jeden Code nur einmal
   und gibt zurück, ob es ein NEUER Code war.
------------------------------------------------------ */
function getCodeRewards() {
  try {
    return JSON.parse(localStorage.getItem("codeRewards") || "[]");
  } catch (e) {
    return [];
  }
}

/* ------------------------------------------------------
   SCHATZ-EFFEKT BEIM CODE-EINLÖSEN
   Wird von main.js -> checkCode() ausgelöst, wenn ein
   CODE ZUM ERSTEN MAL erfolgreich geknackt wurde.
------------------------------------------------------ */
function triggerCodeSuccessEffect() {
  const fx = document.getElementById("code-fx");
  if (!fx) return;

  fx.classList.remove("code-fx-flash");
  void fx.offsetWidth;
  fx.classList.add("code-fx-flash");

  // Der kurze Aufblitz-Flash bleibt (ein einzelner Opacity-Uebergang),
  // der 36-Partikel-Burst darunter wird bei reduzierter Bewegung
  // uebersprungen - deutlich weniger Bewegung, aber der Erfolg bleibt
  // trotzdem sichtbar markiert.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const symbols = ["🪙", "✨", "💰", "🧭", "⭐"];
  const count = 36;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "code-fx-particle";
    particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];

    const angle = Math.random() * 360;
    const distance = 140 + Math.random() * 260;

    particle.style.setProperty("--angle", angle + "deg");
    particle.style.setProperty("--distance", distance + "px");
    particle.style.animationDelay = Math.random() * 0.15 + "s";
    particle.style.fontSize = 16 + Math.random() * 14 + "px";

    fx.appendChild(particle);
    setTimeout(() => particle.remove(), 2000);
  }
}

/* ------------------------------------------------------
   NUR die lokale Buchhaltung (localStorage) - keine Firestore-
   Schreibvorgänge. Ausgelagert aus recordCodeCrack(), damit
   redeemCurrencyCode() (siehe unten) dieselbe lokale Markierung
   nutzen kann, OHNE "codesCracked" ein zweites Mal in Firestore
   hochzuzählen (die atomare Transaktion hat das dort bereits
   erledigt - siehe Kommentar bei redeemCurrencyCode()).
------------------------------------------------------ */
function markCodeCrackedLocally(codeId, reward) {
  const cracked = getCrackedCodes();

  if (cracked.includes(codeId)) {
    return false; // dieser Code wurde schon vorher gezählt
  }

  cracked.push(codeId);
  localStorage.setItem("crackedCodes", JSON.stringify(cracked));
  localStorage.setItem("codesCracked", String(cracked.length));
  localStorage.setItem("codesSyncedCount", String(cracked.length));

  if (reward) {
    const rewards = getCodeRewards();
    if (!rewards.includes(reward)) {
      rewards.push(reward);
      localStorage.setItem("codeRewards", JSON.stringify(rewards));
    }
  }

  // Fortschritt fürs Wochenrennen
  if (typeof addRaceProgress === "function" && typeof raceConfig !== "undefined") {
    addRaceProgress(raceConfig.progressPerCode);
  }

  return true;
}

function recordCodeCrack(codeId, reward) {
  if (!markCodeCrackedLocally(codeId, reward)) return false;

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (nickname && supabaseClient) {
    wheelAuthReady.then(async (uid) => {
      if (!uid) return;

      try {
        await ensureSupabasePlayerRow(uid, nickname);

        const { data: current, error: readError } = await supabaseClient
          .from("players")
          .select("codes_cracked, rewards")
          .eq("firebase_uid", uid)
          .maybeSingle();
        if (readError) throw readError;

        const fields = {
          nickname: nickname,
          codes_cracked: (current && current.codes_cracked ? current.codes_cracked : 0) + 1,
        };

        if (reward) {
          const oldRewards = (current && current.rewards) || [];
          fields.rewards = oldRewards.includes(reward) ? oldRewards : [...oldRewards, reward];
        }

        const { error: writeError } = await supabaseClient
          .from("players")
          .update(fields)
          .eq("firebase_uid", uid);
        if (writeError) throw writeError;
      } catch (err) {
        console.error("Code-Fortschritt konnte nicht gespeichert werden:", err);
      }
    });
  }

  return true;
}

/* ------------------------------------------------------
   WÄHRUNGS-CODES SICHER (ATOMAR) EINLÖSEN
   ---------------------------------------------------
   Betrifft ausschließlich Codes mit "currencyReward" in
   codes-data.js (z.B. FIRE100, FIRE300, COINS300, BEUTEL25,
   KLEINERBEUTEL). Ersetzt für diese Codes den früheren Ablauf
   "sofort lokal als eingelöst markieren, dann UNABHÄNGIG und
   OHNE Rückmeldung versuchen, Dublonen gutzuschreiben (addCurrency)":
   Schlug Letzteres fehl (Netzwerk, veraltete/nicht veröffentlichte
   Security Rules, Offline, ...), zeigte die Seite trotzdem
   "eingelöst" an, UND der Code ließ sich nie wieder versuchen -
   ohne dass jemals Dublonen ankamen. Das war die tatsächliche
   Ursache der gemeldeten FIRE300/COINS300-Unzuverlässigkeit.

   Jetzt: EIN atomares Supabase-UPDATE
   - liest den aktuellen Spielstand,
   - prüft SERVERSEITIG (players.redeemed_currency_codes, nicht
     nur localStorage - das sich leicht löschen/umgehen lässt bzw.
     auf einem zweiten Gerät gar nicht existiert), ob DIESER Code
     für DIESEN Account schon eingelöst wurde,
   - schreibt Dublonen + codes_cracked + Markierung gemeinsam in
     einem einzigen atomaren Schritt (siehe app.valid_code_redemption()
     in supabase/game-migration/: prüft zusätzlich, dass der Betrag
     exakt zum jeweiligen Code passt - ein erfundener Code-Hash oder
     ein falscher Betrag wird serverseitig abgelehnt).

   localStorage wird NUR NACH bestätigtem Erfolg aktualisiert
   (schnelle "schon eingelöst"-Anzeige beim nächsten Versuch, ohne
   jedes Mal auf das Netzwerk warten zu müssen) - nie vorher.

   Wirft bei bereits eingelöstem Code einen Error mit
   message === "already-redeemed"; bei jedem anderen Fehler den
   echten Fehler (der Aufrufer zeigt dann eine ehrliche Fehler-
   meldung statt eines vorgetäuschten Erfolgs).
------------------------------------------------------ */
async function redeemCurrencyCode(codeId, amount) {
  if (!supabaseClient) throw new Error("no-db");
  const uid = await wheelAuthReady;
  if (!uid) throw new Error("no-uid");

  const nickname = localStorage.getItem("wheelNickname") || "";

  // ensureSupabasePlayerRow() vorher legt bei Bedarf eine frische Zeile an
  // (leeres redeemed_currency_codes) - das UPDATE unten kann sich damit auf
  // die "Zeile existiert bereits" Annahme verlassen, kein Insert-Zweig noetig.
  await ensureSupabasePlayerRow(uid, nickname);

  const { data: current, error: readError } = await supabaseClient
    .from("players")
    .select("currency, total_currency_earned, codes_cracked, redeemed_currency_codes")
    .eq("firebase_uid", uid)
    .maybeSingle();
  if (readError) throw readError;

  const data = current || {};
  const redeemed = data.redeemed_currency_codes || {};

  if (redeemed[codeId]) {
    throw new Error("already-redeemed");
  }

  const fields = {
    currency: (data.currency || 0) + amount,
    total_currency_earned: (data.total_currency_earned || 0) + amount,
    codes_cracked: (data.codes_cracked || 0) + 1,
    // JSONB-Merge von Hand (kein Firestore-Dot-Pfad noetig): alle bereits
    // eingeloesten Codes bleiben erhalten, nur dieser eine kommt dazu. Die
    // eigentliche Absicherung gegen doppeltes Einloesen (auch bei einer
    // echten Race Condition zwischen zwei parallelen Anfragen) liegt in
    // app.valid_code_redemption() - die liest den Ausgangszustand bei
    // JEDEM UPDATE frisch aus der Datenbank, nicht aus diesem Client-Stand.
    redeemed_currency_codes: { ...redeemed, [codeId]: true },
  };
  if (nickname) fields.nickname = nickname;

  const { data: updated, error: writeError } = await supabaseClient
    .from("players")
    .update(fields)
    .eq("firebase_uid", uid)
    .select()
    .maybeSingle();

  if (writeError || !updated) {
    throw new Error("redeem-failed");
  }
}

/* ------------------------------------------------------
   RANGLISTE LADEN (sortiert nach geknackten Codes)
------------------------------------------------------ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderRewardBadges(rewards) {
  if (!rewards || !rewards.length) {
    return '<span class="reward-none">–</span>';
  }

  return rewards
    .map((r) => `<span class="reward-badge">🏆 ${escapeHtml(r)}</span>`)
    .join("");
}

/* ------------------------------------------------------
   AVATAR MIT RAHMEN UMWICKELN
   ---------------------------------------------------
   War frueher der rotierende Farbverlauf-Ring um den Avatar in
   Rangliste + Boss-Rangliste (dieselbe Optik wie in der Shop-
   Vorschau, .avatar-frame-*::before mit avatarFrameSpin-Animation,
   siehe style.css). Auf Wunsch entfernt: der Ring lief bei kleinen
   32px-Avataren in Tabellen mit mehreren Spielern (je nach
   Rahmenstufe unterschiedlich schnell) zu unruhig. Der Zeilen-Glow
   (rowFrameClass(), .row-frame-*) bleibt als Rahmen-Kennzeichnung
   bestehen. Die Shop-Vorschau nutzt einen eigenen Code-Pfad
   (shop.js, direkt "avatar-frame-${item.style}") und ist davon
   nicht betroffen - dort bleibt die Animation als Vorschau sinnvoll.
------------------------------------------------------ */
function wrapAvatarWithFrame(avatarHtml, frameStyle) {
  return avatarHtml;
}

/* ------------------------------------------------------
   CAP-ABZEICHEN AUF DEM AVATAR
   ---------------------------------------------------
   Kleiner Aufkleber oben rechts auf dem Avatar fuer die maximal 9
   echten Piratenpass-Cap-Gewinner:innen (siehe app.claim_pass_cap()
   in supabase/game-migration/08-pass-cap.sql). Nutzt dasselbe Bild
   wie die Piratenpass-Endbelohnung (PIRATE_PASS_CAP_IMAGE), damit
   erkennbar dieselbe Cap gemeint ist. Wiederverwendet in wheel.js
   (Rangliste), progression.js (Spielerkarte) und community-boss.js
   (Boss-Rangliste) - EINE Stelle statt drei separaten Implementierungen.
------------------------------------------------------ */
function wrapAvatarWithCapBadge(avatarHtml, hasCap) {
  if (!hasCap || !avatarHtml) return avatarHtml;
  const capSrc = typeof PIRATE_PASS_CAP_IMAGE !== "undefined" ? PIRATE_PASS_CAP_IMAGE : "";
  const badge = capSrc
    ? `<img class="avatar-cap-badge" src="${capSrc}" alt="" aria-hidden="true" loading="lazy">`
    : `<span class="avatar-cap-badge avatar-cap-badge-emoji" aria-hidden="true">🧢</span>`;
  return `<span class="avatar-cap-wrap">${avatarHtml}${badge}</span>`;
}

/* ------------------------------------------------------
   LISTE DER CAP-GEWINNER:INNEN LADEN
   ---------------------------------------------------
   pass_cap_grants ist oeffentlich lesbar und hat hoechstens 9 Zeilen
   (siehe 08-pass-cap.sql) - ein voller, ungefilterter Abruf ist damit
   immer billig. Wird bei jedem Rangliste-/Boss-Rangliste-/Spielerkarte-
   Rendern frisch abgerufen statt zwischengespeichert - bei maximal 9
   Zeilen lohnt sich eine eigene Cache-Verwaltung nicht.
------------------------------------------------------ */
async function fetchPassCapWinnerUids() {
  if (!supabaseClient) return new Set();
  try {
    const { data, error } = await supabaseClient.from("pass_cap_grants").select("firebase_uid");
    if (error) throw error;
    return new Set((data || []).map((row) => row.firebase_uid));
  } catch (err) {
    console.warn("Cap-Gewinnerliste konnte nicht geladen werden:", err);
    return new Set();
  }
}

function frameStyleFromId(frameId) {
  if (!frameId || typeof shopItems === "undefined") return "";
  const item = shopItems.find((i) => i.id === frameId);
  return item ? item.style : "";
}

function rowFrameClass(frameStyle) {
  return frameStyle ? `row-frame row-frame-${frameStyle}` : "";
}

function buildLeaderboardRow(player, rank, isOwnRow) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
  const frameStyle = frameStyleFromId(player.equippedFrame);
  const classes = [rowFrameClass(frameStyle)];

  if (rank <= 3) classes.push(`leaderboard-top leaderboard-top-${rank}`);
  if (isOwnRow) classes.push("leaderboard-you");

  let avatarHtml = player.avatar
    ? isAvatarImagePath(player.avatar)
      ? `<img src="${player.avatar}" class="leaderboard-avatar" alt="" loading="lazy" decoding="async">`
      : `<span class="leaderboard-avatar leaderboard-avatar-emoji">${player.avatar}</span>`
    : "";

  avatarHtml = wrapAvatarWithFrame(avatarHtml, frameStyle);
  avatarHtml = wrapAvatarWithCapBadge(avatarHtml, player.hasCap);

  const crownHtml = rank === 1 ? `<span class="leaderboard-crown">👑</span>` : "";

  return `
    <tr class="${classes.join(" ")}">
      <td class="leaderboard-rank">${medal}</td>
      <td class="leaderboard-name">${crownHtml}${avatarHtml}${escapeHtml(player.nickname || "Unbekannt")}${isOwnRow ? ' <span class="leaderboard-you-tag">(Du)</span>' : ""}</td>
      <td class="leaderboard-codes">${player.codesCracked} 🔑</td>
      <td class="leaderboard-rewards">${renderRewardBadges(player.rewards)}</td>
    </tr>
  `;
}

function buildLeaderboardPodiumEntry(player, rank) {
  const avatarHtml = player.avatar
    ? isAvatarImagePath(player.avatar)
      ? `<img src="${player.avatar}" alt="" loading="lazy" decoding="async">`
      : `<span>${player.avatar}</span>`
    : `<span>🏴‍☠️</span>`;

  const crownHtml = rank === 1 ? `<span class="fh-podium-crown">👑</span>` : "";
  const frameStyle = frameStyleFromId(player.equippedFrame);

  return `
    <div class="fh-podium-col fh-podium-rank-${rank} ${rowFrameClass(frameStyle)}">
      ${crownHtml}
      <div class="fh-podium-avatar">${avatarHtml}</div>
      <p class="fh-podium-name">${escapeHtml(player.nickname || "Unbekannt")}</p>
      <p class="fh-podium-score">${player.codesCracked || 0} 🔑</p>
      <div class="fh-podium-pedestal">${rank}</div>
    </div>
  `;
}

function buildLeaderboardPodium(topThree) {
  if (!topThree.length) return "";

  // Visuelle Reihenfolge wie im Referenzdesign: 2. - 1. - 3.
  return `
    <div class="fh-podium">
      ${topThree[1] ? buildLeaderboardPodiumEntry(topThree[1], 2) : ""}
      ${topThree[0] ? buildLeaderboardPodiumEntry(topThree[0], 1) : ""}
      ${topThree[2] ? buildLeaderboardPodiumEntry(topThree[2], 3) : ""}
    </div>
  `;
}

function loadLeaderboard() {
  const container = document.getElementById("leaderboard-list");
  const podiumContainer = document.getElementById("leaderboard-podium");
  if (!container) return;

  if (!supabaseClient) {
    container.innerHTML =
      '<p class="wheel-status">Die globale Rangliste ist noch nicht eingerichtet (Supabase-Zugangsdaten fehlen in scripts/supabase/supabase-config.js).</p>';
    return;
  }

  container.innerHTML = '<p class="wheel-status">Lade Rangliste ...</p>';

  // players_select_public erlaubt jedem (auch anonym) das Lesen ALLER
  // Spielerzeilen (Firestore: "allow read: if true") - wir laden daher
  // wie zuvor ALLE Spieler mit Namen und sortieren selbst im Browser.
  Promise.all([
    supabaseClient
      .from("players")
      .select("firebase_uid, nickname, codes_cracked, rewards, avatar, equipped_frame"),
    wheelAuthReady,
    fetchPassCapWinnerUids(),
  ])
    .then(([{ data: rows, error }, ownUid, capWinnerUids]) => {
      if (error) throw error;

      const players = [];
      (rows || []).forEach((row) => {
        if (!row.nickname) return; // Einträge ganz ohne Namen überspringen
        players.push({
          uid: row.firebase_uid,
          nickname: row.nickname,
          codesCracked: row.codes_cracked || 0,
          rewards: row.rewards || [],
          avatar: row.avatar,
          equippedFrame: row.equipped_frame,
          hasCap: capWinnerUids.has(row.firebase_uid),
        });
      });

      players.sort((a, b) => (b.codesCracked || 0) - (a.codesCracked || 0));

      if (!players.length) {
        if (podiumContainer) podiumContainer.innerHTML = "";
        container.innerHTML =
          '<p class="wheel-status">Noch niemand ist registriert – sei der Erste!</p>';
        return;
      }

      if (podiumContainer) {
        podiumContainer.innerHTML = buildLeaderboardPodium(players.slice(0, 3));
      }

      const ownIndex = ownUid ? players.findIndex((p) => p.uid === ownUid) : -1;
      const ownRank = ownIndex >= 0 ? ownIndex + 1 : null;
      const topCount = 10;
      const topPlayers = players.slice(0, topCount);

      let html = '<table class="leaderboard-table"><thead><tr><th>#</th><th>Name</th><th>Codes</th><th>Gewinne</th></tr></thead><tbody>';

      topPlayers.forEach((player, i) => {
        const rank = i + 1;
        html += buildLeaderboardRow(player, rank, player.uid === ownUid);
      });

      // Falls der eigene Platz außerhalb der Top 10 liegt, extra anzeigen
      if (ownRank && ownRank > topCount) {
        html += `
          <tr class="leaderboard-gap">
            <td colspan="4">⋯</td>
          </tr>
        `;
        html += buildLeaderboardRow(players[ownIndex], ownRank, true);
      }

      html += "</tbody></table>";
      container.innerHTML = html;

      // Hinweis-Zeile über dem eigenen Platz
      const noteEl = document.createElement("p");
      noteEl.className = "wheel-status leaderboard-own-note";

      if (ownRank) {
        noteEl.textContent = `Du stehst auf Platz ${ownRank} von ${players.length}.`;
      } else {
        noteEl.textContent = "Trag im 🧭 Schatzrad deinen Namen ein, um in der Rangliste zu erscheinen!";
      }

      container.appendChild(noteEl);
    })
    .catch((err) => {
      console.error("Rangliste konnte nicht geladen werden:", err);
      container.innerHTML =
        '<p class="wheel-status">Rangliste konnte nicht geladen werden.</p>';
    });
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOKS
   (werden von main.js beim Seitenwechsel aufgerufen)
------------------------------------------------------ */
function updateWheelPage(pageID) {
  if (pageID !== "wheel") {
    stopWheelCountdown();
    return;
  }

  if (!wheelBuilt) {
    buildWheel();
    wheelBuilt = true;
  }

  const nicknameInput = document.getElementById("wheel-nickname-input");
  if (nicknameInput) {
    nicknameInput.value = localStorage.getItem("wheelNickname") || "";
  }

  if (typeof refreshTwitchLoginUI === "function") {
    refreshTwitchLoginUI();
  }

  syncCodesToDatabase();
  syncTempAvatarFromServer();
  syncWheelCooldownFromServer();
  refreshWheelStatus();
}

function updateLeaderboardPage(pageID) {
  if (pageID === "leaderboard") {
    loadLeaderboard();
  }
}
