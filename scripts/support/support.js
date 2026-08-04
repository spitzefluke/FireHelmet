/* ======================================================
   SUPPORT-BOT
   - Einfacher regelbasierter Chat (keine externe KI nötig)
   - Zusätzlich ein Formular, um Fehler/Anliegen direkt an
     dich (den Betreiber) zu melden - landet in Firestore,
     einsehbar in der Firebase Console unter "supportReports"
====================================================== */

function findSupportAnswer(question) {
  const lower = question.toLowerCase();
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

  const question = input.value.trim();
  if (!question) return;

  addSupportMessage(question, "user");
  input.value = "";

  setTimeout(() => {
    const answer = findSupportAnswer(question);
    addSupportMessage(answer, "bot");

    if (answer === supportFallback) {
      const reportBox = document.getElementById("support-report-box");
      if (reportBox) reportBox.classList.add("support-highlight");
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
}
