/* ======================================================
   SPRACHSYSTEM (Deutsch / Englisch)
   ---------------------------------------------------
   Übersetzt automatisch alle Elemente mit einem
   data-i18n="schlüssel" Attribut (Text) oder
   data-i18n-placeholder="schlüssel" (Eingabefeld-Platzhalter).

   NEUEN TEXT ÜBERSETZBAR MACHEN:
   1. In index.html beim Element data-i18n="bereich.name" ergänzen
   2. Hier unten bei "de" UND "en" den gleichen Schlüssel eintragen

   Für JavaScript-Texte (z.B. Status-Meldungen) gibt es die
   Funktion t("bereich.name") - siehe Verwendung in den
   anderen scripts/*.js Dateien.
====================================================== */

const translations = {
  de: {
    "menu.title": "MENU",
    "menu.login": "🎮 Anmelden",
    "menu.home": "🏠 Home",
    "menu.story": "📖 Stories",
    "menu.characters": "👤 Characters",
    "menu.socials": "🌐 Socials",
    "menu.code": "🔑 Code",
    "menu.wheel": "🧭 Schatzrad",
    "menu.leaderboard": "🏆 Rangliste",
    "menu.race": "🏎️ Wochenrennen",
    "menu.communityBoss": "🐙 Community-Boss",
    "menu.streamraetsel": "❓ ???",
    "menu.support": "🆘 Support",

    "support.title": "SUPPORT",
    "support.subtitle": "Frag den Bot oder melde ein Problem",
    "support.send": "Senden",
    "support.reportTitle": "🐞 Fehler melden / Anliegen",
    "support.reportPlaceholder": "Beschreibe kurz, was los ist ...",
    "support.reportSend": "Absenden",

    "common.days": "Tage",
    "common.hours": "Stunden",
    "common.minutes": "Minuten",
    "common.seconds": "Sekunden",
    "common.back": "← Zurück",
    "common.save": "Speichern",
    "common.logout": "Abmelden",

    "home.title": "COUNTDOWN",
    "home.subtitle": "Die neue Story startet in ...",

    "story.title": "STORIES",
    "story.subtitle": "Wähle ein Logbuch aus dem Archiv",
    "story.chapterHeading": "Kapitel",

    "characters.title": "CHARACTERS",

    "socials.title": "SOCIALS",
    "socials.daveHeading": "🚂 Socials von Zugfahrer_DaveTV",

    "login.title": "ANMELDUNG",
    "login.subtitle": "Melde dich an, um in Rangliste und Wochenrennen zu erscheinen",
    "login.twitchButton": "Mit Twitch anmelden",
    "login.discordButton": "Mit Discord anmelden",
    "login.divider": "— oder —",
    "login.namePlaceholder": "Namen manuell eintragen",

    "code.title": "CODE",
    "code.subtitle": "Gib deinen geheimen Code ein",
    "code.placeholder": "Code eingeben ...",
    "code.confirm": "Bestätigen",
    "code.notReady": "⚠️ Code-System ist noch nicht bereit.",
    "code.tooManyAttempts": "⏳ Zu viele Fehlversuche – warte noch {seconds} Sekunde(n).",
    "code.alreadyRedeemed": "✅ Diesen Code hast du bereits eingelöst.",
    "code.invalid": "Dieser Code ist ungültig.",

    "wheel.title": "SCHATZRAD",
    "wheel.subtitle": "Einmal am Tag drehen und dein Glück bei der Schatzsuche versuchen",
    "wheel.loginHintPrefix": "Noch nicht angemeldet? ",
    "wheel.loginHintLink": "Hier geht's zur Anmeldung",
    "wheel.spinButton": "Drehen",
    "wheel.status.needLogin": "Bitte melde dich zuerst an.",
    "wheel.status.spunToday": "Heute schon gedreht! Aktuelle Streak: {streak} Tag(e) 🔥",
    "wheel.status.streakActive": "Aktuelle Streak: {streak} Tag(e) 🔥 – heute noch nicht gedreht!",
    "wheel.status.readyToSpin": "Heute noch nicht gedreht – viel Glück!",
    "wheel.countdownLabel": "⏳ Nächste Drehung in {time}",

    "leaderboard.title": "RANGLISTE",
    "leaderboard.subtitle": "Wer hat die meisten Geheimcodes geknackt?",
    "leaderboard.loading": "Lade Rangliste ...",

    "race.title": "WOCHENRENNEN",
    "race.subtitle": "Jede Woche neu: Fortschritt durch Schatzrad-Drehen und Codes-Knacken",
    "race.loadingWinner": "Lade Sieger der letzten Woche ...",
    "race.dailyBonusButton": "Tagesbonus abholen 🎁",

    "stream.liveLabel": "🔴 LIVE COUNTDOWN",
    "stream.title": "❓ ???",
    "stream.subtitle": "Etwas Großes braut sich zusammen ...",
    "stream.teaser": "🌫️ Niemand weiß, was hier erscheinen wird ...",

    "boss.title": "COMMUNITY-BOSS",
    "boss.subtitle": "Gemeinsam besiegen, bevor der Monat endet!",
  },

  en: {
    "menu.title": "MENU",
    "menu.login": "🎮 Login",
    "menu.home": "🏠 Home",
    "menu.story": "📖 Stories",
    "menu.characters": "👤 Characters",
    "menu.socials": "🌐 Socials",
    "menu.code": "🔑 Code",
    "menu.wheel": "🧭 Treasure Wheel",
    "menu.leaderboard": "🏆 Leaderboard",
    "menu.race": "🏎️ Weekly Race",
    "menu.communityBoss": "🐙 Community Boss",
    "menu.streamraetsel": "❓ ???",
    "menu.support": "🆘 Support",

    "support.title": "SUPPORT",
    "support.subtitle": "Ask the bot or report a problem",
    "support.send": "Send",
    "support.reportTitle": "🐞 Report a bug / issue",
    "support.reportPlaceholder": "Briefly describe what's going on ...",
    "support.reportSend": "Submit",

    "common.days": "Days",
    "common.hours": "Hours",
    "common.minutes": "Minutes",
    "common.seconds": "Seconds",
    "common.back": "← Back",
    "common.save": "Save",
    "common.logout": "Log out",

    "home.title": "COUNTDOWN",
    "home.subtitle": "The new Story starts in ...",

    "story.title": "STORIES",
    "story.subtitle": "Choose a logbook from the archive",
    "story.chapterHeading": "Chapters",

    "characters.title": "CHARACTERS",

    "socials.title": "SOCIALS",
    "socials.daveHeading": "🚂 Zugfahrer_DaveTV's socials",

    "login.title": "LOGIN",
    "login.subtitle": "Log in to appear on the leaderboard and in the weekly race",
    "login.twitchButton": "Log in with Twitch",
    "login.discordButton": "Log in with Discord",
    "login.divider": "— or —",
    "login.namePlaceholder": "Enter a name manually",

    "code.title": "CODE",
    "code.subtitle": "Enter your secret code",
    "code.placeholder": "Enter code ...",
    "code.confirm": "Confirm",
    "code.notReady": "⚠️ The code system isn't ready yet.",
    "code.tooManyAttempts": "⏳ Too many failed attempts – try again in {seconds} second(s).",
    "code.alreadyRedeemed": "✅ You've already redeemed this code.",
    "code.invalid": "This code is invalid.",

    "wheel.title": "TREASURE WHEEL",
    "wheel.subtitle": "Spin once a day and try your luck at the treasure hunt",
    "wheel.loginHintPrefix": "Not logged in yet? ",
    "wheel.loginHintLink": "Go to login",
    "wheel.spinButton": "Spin",
    "wheel.status.needLogin": "Please log in first.",
    "wheel.status.spunToday": "Already spun today! Current streak: {streak} day(s) 🔥",
    "wheel.status.streakActive": "Current streak: {streak} day(s) 🔥 – haven't spun today yet!",
    "wheel.status.readyToSpin": "Haven't spun today yet – good luck!",
    "wheel.countdownLabel": "⏳ Next spin in {time}",

    "leaderboard.title": "LEADERBOARD",
    "leaderboard.subtitle": "Who has cracked the most secret codes?",
    "leaderboard.loading": "Loading leaderboard ...",

    "race.title": "WEEKLY RACE",
    "race.subtitle": "New every week: progress through wheel spins and cracked codes",
    "race.loadingWinner": "Loading last week's winner ...",
    "race.dailyBonusButton": "Claim daily bonus 🎁",

    "stream.liveLabel": "🔴 LIVE COUNTDOWN",
    "stream.title": "❓ ???",
    "stream.subtitle": "Something big is brewing ...",
    "stream.teaser": "🌫️ Nobody knows what will appear here ...",

    "boss.title": "COMMUNITY BOSS",
    "boss.subtitle": "Defeat it together before the month ends!",
  },
};

/* ------------------------------------------------------
   SPRACHE SETZEN / LADEN
------------------------------------------------------ */
function getCurrentLang() {
  return localStorage.getItem("siteLang") || "de";
}

function t(key, fallback) {
  const lang = getCurrentLang();
  const dict = translations[lang] || translations.de;
  return dict[key] || (translations.de[key] || fallback || key);
}

/* Wie t(), ersetzt aber zusätzlich {platzhalter} im Text.
   Beispiel: tFormat("wheel.status.spunToday", { streak: 3 }) */
function tFormat(key, params) {
  let text = t(key);
  if (params) {
    Object.keys(params).forEach((k) => {
      text = text.replace(`{${k}}`, params[k]);
    });
  }
  return text;
}

function applyTranslations() {
  const lang = getCurrentLang();
  const dict = translations[lang] || translations.de;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) {
      el.setAttribute("placeholder", dict[key]);
    }
  });

  document.documentElement.setAttribute("lang", lang);
  document.body.classList.toggle("lang-de", lang === "de");
  document.body.classList.toggle("lang-en", lang === "en");

  document.querySelectorAll(".lang-switch").forEach((switchEl) => {
    switchEl.classList.toggle("is-en", lang === "en");
    switchEl.setAttribute("aria-pressed", lang === "en" ? "true" : "false");
  });
}

function setLanguage(lang) {
  localStorage.setItem("siteLang", lang);
  applyTranslations();

  // Seiten, die ihre Inhalte per JS neu aufbauen, müssen nach dem
  // Sprachwechsel einmal neu gerendert werden (Status-Texte etc.)
  if (typeof refreshWheelStatus === "function") refreshWheelStatus();
  if (typeof loadLeaderboard === "function" && document.getElementById("leaderboard")?.classList.contains("active-page")) {
    loadLeaderboard();
  }
}

// Vom neuen Toggle-Switch im Menü aufgerufen - wechselt einfach
// zwischen den beiden Sprachen hin und her
function toggleLanguage() {
  setLanguage(getCurrentLang() === "de" ? "en" : "de");
}

window.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
});
