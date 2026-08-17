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
    "menu.shop": "🛒 Shop",
    "menu.home": "🏠 Home",
    "menu.story": "📖 Stories",
    "menu.characters": "👤 Characters",
    "menu.socials": "🌐 Socials",
    "menu.code": "🔑 Code",
    "menu.wheel": "🧭 Schatzrad",
    "menu.leaderboard": "🏆 Rangliste",
    "menu.race": "🏎️ Wochenrennen",
    "menu.communityBoss": "🐙 Community-Boss",
    "menu.streamraetsel": "⚒ REPARIERE DAS SCHIFF",
    "menu.streamraetselShort": "Schiff",
    "menu.support": "🆘 Support",
    "menu.rating": "⭐ Bewertung",

    "support.title": "SUPPORT",
    "support.subtitle": "Frag den Bot oder melde ein Problem",
    "support.send": "Senden",
    "support.reportTitle": "🐞 Fehler melden / Anliegen",
    "support.reportPlaceholder": "Beschreibe kurz, was los ist ...",
    "support.reportSend": "Absenden",

    "rating.title": "⭐ BEWERTUNG",
    "rating.subtitle": "Wie gefällt dir die Seite? Deine Meinung hilft uns weiter!",
    "rating.commentPlaceholder": "Was gefällt dir, was können wir besser machen? (optional)",
    "rating.submitButton": "Bewertung abschicken",

    "shop.title": "🛒 SCHWARZMARKT DER FLITZPIEPEN",
    "shop.subtitle": "Jede Stunde neue Ware - gib deine Dublonen für Rahmen und Extras aus",
    "shop.currencyLabel": "Dublonen",
    "shop.earnHint": "Dublonen bekommst du durchs Einlösen bestimmter Codes, gute Platzierungen beim Wochenrennen und viel Schaden gegen den Community-Boss.",
    "shop.tabFrames": "Avatar-Rahmen",
    "shop.tabAvatars": "Avatare",
    "shop.introTitle": "DER SCHWARZMARKT",
    "shop.rotationLabel": "Neuer Schwarzmarkt in",
    "shop.rotationToast": "⚓ Der Schwarzmarkt hat neue Ware erhalten!",
    "shop.raritiesHeading": "Seltenheiten",

    "socials.audiobookTitle": "🎧 Das Fire-Helmet-Hörspiel",
    "socials.audiobookText": "Tauche noch tiefer in die Geschichte ein.",
    "socials.audiobookButton": "Auf Spotify anhören",

    "common.days": "Tage",
    "common.hours": "Stunden",
    "common.minutes": "Minuten",
    "common.seconds": "Sekunden",
    "common.back": "← Zurück",
    "common.save": "Speichern",
    "common.logout": "Abmelden",

    "home.title": "COUNTDOWN",
    "home.subtitle": "Die neue Story startet in ...",

    "home.cinematicEyebrow": "Eine Reise beginnt",
    "home.cinematicTitle": "FIREHELMET",
    "home.cinematicLead": "Irgendwo da draußen, jenseits von Nebel und Sternenhimmel, wartet die nächste Geschichte der Crew.",
    "home.destinationEyebrow": "Das Ziel",
    "home.destinationTitle": "DAS ZIEL",
    "home.destinationLead": "Was erwartet die Crew hinter dem Horizont? Der Nebel lichtet sich – und ein Licht zeigt den Weg.",
    "home.metaLocationLabel": "Ort",
    "home.metaLocationValue": "Unbekannt",
    "home.metaStatusLabel": "Status",
    "home.metaStatusValue": "Aktiv",
    "home.metaMissionLabel": "Mission",
    "home.metaMissionValue": "Entdecken",
    "home.scrollCue": "Scrollen",

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

    "ship.badge": "⚓ EVENT",
    "ship.lockedTitle": "REPARIERE DAS SCHIFF",
    "ship.lockedLead": "Das Schiff wurde zerstört. Die Crew braucht dich.",
    "ship.lockedSub": "Das Abenteuer beginnt in:",
    "ship.title": "⚒ REPARIERE DAS SCHIFF",
    "ship.subtitle": "Gemeinsam bringt die Crew die Flitzpiepen zurück aufs Wasser.",
    "ship.completeEyebrow": "⚓ DIE FLITZPIEPEN IST WIEDER SEETÜCHTIG!",
    "ship.completeHint": "Schau auf der Home-Seite vorbei - dein Schiff wartet dort auf dich.",
    "ship.repairRunning": "🔧 REPARATUR LÄUFT ...",
    "ship.needLogin": "Melde dich zuerst an, um mitzureparieren!",
    "ship.repairButton": "Reparieren",
    "ship.toolsHeading": "Deine Werkzeuge",
    "ship.puzzlesHeading": "⚓ Rätsel des Kapitäns",
    "ship.returnEyebrow": "DEIN SCHIFF IST ZURÜCK",
    "ship.returnCaptainLabel": "Kapitän",

    "boss.title": "COMMUNITY-BOSS",
    "boss.subtitle": "Gemeinsam besiegen, bevor der Monat endet!",
    "boss.statDamage": "Schaden",
    "boss.statAttackers": "Angreifer",
    "boss.phaseNormal": "NORMAL",
    "boss.phaseWounded": "ANGESCHLAGEN",
    "boss.phaseEnraged": "ENRAGED",
    "boss.phaseCritical": "CRITICAL",
    "boss.phaseFinal": "FINALE PHASE",
    "boss.phaseDefeated": "BESIEGT",
  },

  en: {
    "menu.title": "MENU",
    "menu.login": "🎮 Login",
    "menu.shop": "🛒 Shop",
    "menu.home": "🏠 Home",
    "menu.story": "📖 Stories",
    "menu.characters": "👤 Characters",
    "menu.socials": "🌐 Socials",
    "menu.code": "🔑 Code",
    "menu.wheel": "🧭 Treasure Wheel",
    "menu.leaderboard": "🏆 Leaderboard",
    "menu.race": "🏎️ Weekly Race",
    "menu.communityBoss": "🐙 Community Boss",
    "menu.streamraetsel": "⚒ REPAIR THE SHIP",
    "menu.streamraetselShort": "Ship",
    "menu.support": "🆘 Support",
    "menu.rating": "⭐ Rating",

    "support.title": "SUPPORT",
    "support.subtitle": "Ask the bot or report a problem",
    "support.send": "Send",
    "support.reportTitle": "🐞 Report a bug / issue",
    "support.reportPlaceholder": "Briefly describe what's going on ...",
    "support.reportSend": "Submit",

    "rating.title": "⭐ RATING",
    "rating.subtitle": "How do you like the site? Your feedback helps us improve!",
    "rating.commentPlaceholder": "What do you like, what could be better? (optional)",
    "rating.submitButton": "Submit rating",

    "shop.title": "🛒 THE FLITZPIEPEN BLACK MARKET",
    "shop.subtitle": "New stock every hour - spend your doubloons on frames and extras",
    "shop.currencyLabel": "Doubloons",
    "shop.earnHint": "You earn doubloons by redeeming certain codes, placing well in the weekly race, and dealing lots of damage to the community boss.",
    "shop.tabFrames": "Avatar Frames",
    "shop.tabAvatars": "Avatars",
    "shop.introTitle": "THE BLACK MARKET",
    "shop.rotationLabel": "New black market in",
    "shop.rotationToast": "⚓ The black market just got fresh stock!",
    "shop.raritiesHeading": "Rarities",

    "socials.audiobookTitle": "🎧 The Fire Helmet Audio Drama",
    "socials.audiobookText": "Dive even deeper into the story.",
    "socials.audiobookButton": "Listen on Spotify",

    "common.days": "Days",
    "common.hours": "Hours",
    "common.minutes": "Minutes",
    "common.seconds": "Seconds",
    "common.back": "← Back",
    "common.save": "Save",
    "common.logout": "Log out",

    "home.title": "COUNTDOWN",
    "home.subtitle": "The new Story starts in ...",

    "home.cinematicEyebrow": "A journey begins",
    "home.cinematicTitle": "FIREHELMET",
    "home.cinematicLead": "Somewhere out there, beyond the fog and the night sky, the crew's next story is waiting.",
    "home.destinationEyebrow": "The Destination",
    "home.destinationTitle": "THE DESTINATION",
    "home.destinationLead": "What awaits the crew beyond the horizon? The fog is clearing - and a light shows the way.",
    "home.metaLocationLabel": "Location",
    "home.metaLocationValue": "Unknown",
    "home.metaStatusLabel": "Status",
    "home.metaStatusValue": "Active",
    "home.metaMissionLabel": "Mission",
    "home.metaMissionValue": "Discover",
    "home.scrollCue": "Scroll",

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

    "ship.badge": "⚓ EVENT",
    "ship.lockedTitle": "REPAIR THE SHIP",
    "ship.lockedLead": "The ship was destroyed. The crew needs you.",
    "ship.lockedSub": "The adventure begins in:",
    "ship.title": "⚒ REPAIR THE SHIP",
    "ship.subtitle": "Together, the crew brings the Flitzpiepen back to sea.",
    "ship.completeEyebrow": "⚓ THE FLITZPIEPEN IS SEAWORTHY AGAIN!",
    "ship.completeHint": "Check out the Home page - your ship is waiting for you there.",
    "ship.repairRunning": "🔧 REPAIR IN PROGRESS ...",
    "ship.needLogin": "Log in first to help with repairs!",
    "ship.repairButton": "Repair",
    "ship.toolsHeading": "Your Tools",
    "ship.puzzlesHeading": "⚓ Captain's Riddles",
    "ship.returnEyebrow": "YOUR SHIP IS BACK",
    "ship.returnCaptainLabel": "Captain",

    "boss.title": "COMMUNITY BOSS",
    "boss.subtitle": "Defeat it together before the month ends!",
    "boss.statDamage": "Damage",
    "boss.statAttackers": "Attackers",
    "boss.phaseNormal": "NORMAL",
    "boss.phaseWounded": "WOUNDED",
    "boss.phaseEnraged": "ENRAGED",
    "boss.phaseCritical": "CRITICAL",
    "boss.phaseFinal": "FINAL PHASE",
    "boss.phaseDefeated": "DEFEATED",
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
  if (typeof renderRarityLegend === "function") renderRarityLegend();
  if (typeof renderShopGrid === "function" && document.getElementById("shop")?.classList.contains("active-page")) {
    renderShopGrid({ quiet: true });
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
