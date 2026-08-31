/* ======================================================
   SUPPORT
   - Formular, um Fehler/Anliegen direkt an dich (den Betreiber)
     zu melden - landet in Supabase, einsehbar im Supabase-Dashboard
     unter "support_reports" (nur per service_role/Table-Editor-
     Login, nicht ueber die Website lesbar - siehe RLS in
     05-site-data.sql)

   HINWEIS: Der frühere Support-Bot (regelbasierter Chat +
   optionale KI-Anbindung) wurde komplett entfernt. Der
   Schimpfwort-Filter darunter (containsBadWord/normalizeSupportText/
   SUPPORT_HOMOGLYPHS/supportBadWords) blieb erhalten, weil ihn
   auch dieses Formular hier braucht.
====================================================== */

/* ------------------------------------------------------
   TEXT NORMALISIEREN + SCHIMPFWORT-ERKENNUNG
   (löst gängige Zahlen-Buchstaben-Tricks wie "4rschloch" auf)
------------------------------------------------------ */
// Kyrillische/griechische Buchstaben, die optisch wie lateinische
// aussehen (siehe ausführlicher Kommentar in scripts/wheel/wheel.js
// bei normalizeNicknameForFilter)
const SUPPORT_HOMOGLYPHS = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ѕ: "s",
  α: "a", ε: "e", ο: "o", ρ: "p", υ: "y", χ: "x", ι: "i",
};

// Woerter/Ausdruecke, bei denen die Meldung im "Fehler melden"-
// Formular als unsachlich abgelehnt wird (siehe containsBadWord()
// unten). Trag hier gerne alles ein, was du in deiner Community
// nicht tolerieren willst (siehe auch
// scripts/wheel/nickname-filter-data.js fuer denselben Mechanismus
// bei Namen).
const supportBadWords = [
  "fuck",
  "hurensohn",
  "wichser",
  "arschloch",
  "idiot",
  "spast",
  "opfer",
  "hurenkind",
];

function normalizeSupportText(text) {
  let result = text.toLowerCase();

  for (const [from, to] of Object.entries(SUPPORT_HOMOGLYPHS)) {
    result = result.split(from).join(to);
  }

  result = result
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/[^a-zäöüß]/g, "");

  // Wiederholte/gestreckte Buchstaben zusammenziehen (z.B.
  // "arrrschloch" -> "arschloch")
  return result.replace(/(.)\1+/g, "$1");
}

function containsBadWord(text) {
  const normalized = normalizeSupportText(text);
  const ownList = typeof supportBadWords !== "undefined" ? supportBadWords : [];
  const externalList = typeof externalBadWordsList !== "undefined" ? externalBadWordsList : [];
  const combinedList = [...ownList, ...externalList];

  return combinedList.some((word) => {
    const normalizedWord = normalizeSupportText(word);
    return normalizedWord && normalizedWord.length >= 3 && normalized.includes(normalizedWord);
  });
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

  if (!supabaseClient) {
    statusEl.textContent = "⚠️ Konnte nicht gesendet werden (Supabase ist nicht eingerichtet).";
    return;
  }

  wheelAuthReady.then((uid) => {
    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    withSupabaseRlsColdStartRetry(() =>
      supabaseClient.from("support_reports").insert({
        firebase_uid: uid || null,
        nickname: nickname,
        message: message,
        page: window.location.href,
      })
    )
      .then(({ error }) => {
        if (error) throw error;
        statusEl.textContent = "✅ Danke! Deine Nachricht wurde übermittelt.";
        messageInput.value = "";
      })
      .catch((err) => {
        console.error("Support-Meldung fehlgeschlagen:", err);
        statusEl.textContent = "⚠️ Konnte nicht gesendet werden. Versuch es später nochmal.";
      });
  });
}
