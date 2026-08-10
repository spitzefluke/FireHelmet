/* ======================================================
   SUPPORT-BOT
   - Einfacher regelbasierter Chat (keine externe KI nötig)
   - Zusätzlich ein Formular, um Fehler/Anliegen direkt an
     dich (den Betreiber) zu melden - landet in Firestore,
     einsehbar in der Firebase Console unter "supportReports"
====================================================== */

function findSupportAnswer(question) {
  const lower = question.toLowerCase();

  if (typeof supportGreetings !== "undefined" && supportGreetings.keywords.some((kw) => lower.includes(kw))) {
    return randomFromArray(supportGreetings.answers);
  }

  if (typeof supportThanks !== "undefined" && supportThanks.keywords.some((kw) => lower.includes(kw))) {
    return randomFromArray(supportThanks.answers);
  }

  let bestMatch = null;
  let bestScore = 0;

  supportFaq.forEach((entry) => {
    let score = 0;
    entry.keywords.forEach((kw) => {
      if (lower.includes(kw.toLowerCase())) score++;
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  });

  return bestScore > 0 ? bestMatch.answer : supportFallback;
}

function randomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------
   TEXT NORMALISIEREN + SCHIMPFWORT-ERKENNUNG
   (löst gängige Zahlen-Buchstaben-Tricks wie "4rschloch" auf)
------------------------------------------------------ */
function normalizeSupportText(text) {
  return text
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function containsBadWord(text) {
  if (typeof supportBadWords === "undefined") return false;
  const normalized = normalizeSupportText(text);
  return supportBadWords.some((word) => normalized.includes(normalizeSupportText(word)));
}

function addSupportSuggestions() {
  const log = document.getElementById("support-chat-log");
  if (!log || typeof supportFaq === "undefined") return;

  const row = document.createElement("div");
  row.className = "support-suggestions";

  const shuffled = [...supportFaq].sort(() => Math.random() - 0.5).slice(0, 3);
  shuffled.forEach((entry) => {
    const label = entry.keywords[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "support-suggestion-btn";
    btn.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    btn.onclick = () => {
      const input = document.getElementById("support-chat-input");
      if (input) input.value = label;
      sendSupportMessage();
    };
    row.appendChild(btn);
  });

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

/* ------------------------------------------------------
   TIMEOUT-SYSTEM BEI BELEIDIGUNGEN
   1. Mal -> Verwarnung, 2. Mal -> Chat für ein paar Minuten
   gesperrt (übersteht auch ein Neuladen der Seite)
------------------------------------------------------ */
const SUPPORT_TIMEOUT_KEY = "supportTimeoutUntil";
const SUPPORT_STRIKES_KEY = "supportStrikes";
let supportTimeoutInterval = null;

function getSupportTimeoutRemaining() {
  const until = parseInt(localStorage.getItem(SUPPORT_TIMEOUT_KEY) || "0", 10);
  return until - Date.now();
}

function isSupportTimedOut() {
  return getSupportTimeoutRemaining() > 0;
}

function applySupportTimeoutUI() {
  const input = document.getElementById("support-chat-input");
  const sendBtn = document.querySelector(".support-chat-input-row .code-button");
  const remaining = getSupportTimeoutRemaining();

  if (remaining <= 0) {
    clearInterval(supportTimeoutInterval);
    supportTimeoutInterval = null;
    if (input) {
      input.disabled = false;
      input.placeholder = "Deine Frage ...";
    }
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  if (input) {
    input.disabled = true;
    const secondsLeft = Math.ceil(remaining / 1000);
    const mm = Math.floor(secondsLeft / 60);
    const ss = String(secondsLeft % 60).padStart(2, "0");
    input.placeholder = `⏳ Timeout - noch ${mm}:${ss} Minute(n)`;
  }
  if (sendBtn) sendBtn.disabled = true;
}

function startSupportTimeout() {
  const minutes = typeof supportTimeoutMinutes !== "undefined" ? supportTimeoutMinutes : 3;
  const until = Date.now() + minutes * 60 * 1000;
  localStorage.setItem(SUPPORT_TIMEOUT_KEY, String(until));
  localStorage.setItem(SUPPORT_STRIKES_KEY, "0");

  addSupportMessage(`🚫 So geht das nicht. Du bist für ${minutes} Minuten im Chat-Timeout.`, "bot");

  clearInterval(supportTimeoutInterval);
  applySupportTimeoutUI();
  supportTimeoutInterval = setInterval(applySupportTimeoutUI, 1000);
}

function registerSupportStrike() {
  const strikes = parseInt(localStorage.getItem(SUPPORT_STRIKES_KEY) || "0", 10) + 1;
  localStorage.setItem(SUPPORT_STRIKES_KEY, String(strikes));

  if (strikes >= 2) {
    startSupportTimeout();
  } else {
    addSupportMessage(
      "⚠️ Hey, bleib bitte freundlich - das ist eine Verwarnung. Beim nächsten Mal gibt's einen kurzen Timeout.",
      "bot"
    );
  }
}

function addSupportMessage(text, sender) {
  const log = document.getElementById("support-chat-log");
  if (!log) return;

  const bubble = document.createElement("div");
  bubble.className = sender === "user" ? "support-msg support-msg-user" : "support-msg support-msg-bot";
  bubble.textContent = text;

  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function sendSupportMessage() {
  const input = document.getElementById("support-chat-input");
  if (!input) return;

  if (isSupportTimedOut()) {
    applySupportTimeoutUI();
    return;
  }

  const question = input.value.trim();
  if (!question) return;

  addSupportMessage(question, "user");
  input.value = "";

  if (containsBadWord(question)) {
    registerSupportStrike();
    return;
  }

  setTimeout(() => {
    const answer = findSupportAnswer(question);
    addSupportMessage(answer, "bot");

    if (answer === supportFallback) {
      const reportBox = document.getElementById("support-report-box");
      if (reportBox) reportBox.classList.add("support-highlight");
      addSupportSuggestions();
    }
  }, 400);
}

/* ------------------------------------------------------
   FEHLER MELDEN / ANLIEGEN AN DEN BETREIBER
------------------------------------------------------ */
function submitSupportReport() {
  const messageInput = document.getElementById("support-report-message");
  const statusEl = document.getElementById("support-report-status");
  if (!messageInput || !statusEl) return;

  const message = messageInput.value.trim();
  if (!message) return;

  if (containsBadWord(message)) {
    statusEl.textContent = "⚠️ Bitte formuliere dein Anliegen sachlich, dann kann dir schneller geholfen werden.";
    return;
  }

  const nickname = localStorage.getItem("wheelNickname") || "Anonym";

  statusEl.textContent = "Wird gesendet ...";

  if (!wheelDb) {
    statusEl.textContent = "⚠️ Konnte nicht gesendet werden (Firebase ist nicht eingerichtet).";
    return;
  }

  wheelAuthReady.then((uid) => {
    wheelDb
      .collection("supportReports")
      .add({
        uid: uid || null,
        nickname: nickname,
        message: message,
        page: window.location.href,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        statusEl.textContent = "✅ Danke! Deine Nachricht wurde übermittelt.";
        messageInput.value = "";
      })
      .catch((err) => {
        console.error("Support-Meldung fehlgeschlagen:", err);
        statusEl.textContent = "⚠️ Konnte nicht gesendet werden. Versuch es später nochmal.";
      });
  });
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
let supportChatStarted = false;

function updateSupportPage(pageID) {
  if (pageID !== "support") return;

  if (!supportChatStarted) {
    addSupportMessage(
      "Hey! 👋 Frag mich etwas zur Seite (z.B. \"Wie tritt ich dem Gewinnspiel bei?\") oder melde direkt unten einen Fehler.",
      "bot"
    );
    supportChatStarted = true;
  }

  applySupportTimeoutUI();
  if (isSupportTimedOut() && !supportTimeoutInterval) {
    supportTimeoutInterval = setInterval(applySupportTimeoutUI, 1000);
  }
}
