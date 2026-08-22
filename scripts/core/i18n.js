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
    "menu.spielothek": "🎰 Ändiis Spielothek",
    "menu.spielothekShort": "Spielothek",
    "menu.leaderboard": "🏆 Rangliste",
    "menu.race": "🏎️ Wochenrennen",
    "menu.communityBoss": "🐙 Community-Boss",
    "menu.streamraetsel": "❓ ???",
    "menu.streamraetselShort": "???",
    "menu.support": "🆘 Support",
    "menu.rating": "⭐ Bewertung",

    "support.title": "SUPPORT",
    "support.subtitle": "Melde ein Problem oder ein Anliegen",
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

    "spielothek.title": "🎰 ÄNDIIS SPIELOTHEK",
    "spielothek.subtitle": "Jeden Monat ein anderes Spiel - rein spielerisch, nur mit Dublonen.",
    "spielothek.playButton": "SPIELEN",
    "spielothek.rulesHeading": "Spielregeln",
    "spielothek.needLogin": "Melde dich zuerst an, um zu spielen!",
    "spielothek.notEnoughCurrency": "❌ Nicht genug Dublonen dafür.",
    "spielothek.saveFailed": "⚠️ Die Spielrunde konnte gerade nicht gespeichert werden. Deine Daten wurden nicht verändert. Bitte versuch's nochmal.",
    "spielothek.perRound": "Runde",
    "spielothek.betLabel": "Einsatz:",
    "spielothek.andiIdle1": "Ich hab doch gesagt, lass es!",
    "spielothek.andiIdle2": "Das Glück ist heute nicht auf deiner Seite.",
    "spielothek.andiIdle3": "Nur noch einmal…? Genau so fängt es an.",
    "spielothek.andiIdle4": "Ich würde es lassen.",
    "spielothek.andiIdle5": "Die Bank gewinnt immer.",
    "spielothek.andiIdle6": "Ich warne dich!",
    "spielothek.andiIdle7": "Du bist schon wieder hier?!",
    "spielothek.andiWin1": "Na gut, diesmal hattest du Glück. Einmalig!",
    "spielothek.andiWin2": "Selbst eine kaputte Uhr hat zweimal am Tag recht ...",
    "spielothek.andiWin3": "Pah. Anfängerglück.",
    "spielothek.andiWinBig1": "WAS?! Das war Glück!",
    "spielothek.andiWinBig2": "Okay, das hab selbst ich nicht kommen sehen.",
    "spielothek.andiWinBig3": "Moment... das war jetzt nicht ernst gemeint, oder?!",
    "spielothek.andiWinJackpot1": "Das kann doch nicht dein Ernst sein!",
    "spielothek.andiWinJackpot2": "NEIN! Nicht der Jackpot! Alles, nur nicht der Jackpot!",
    "spielothek.andiWinJackpot3": "Die Schiffskasse... sie brennt gerade lichterloh.",
    "spielothek.cooldownLabel": "Nächster Spin in:",
    "spielothek.cooldownWaitButton": "WARTEN ...",
    "spielothek.spinCompleteLabel": "🎰 Dreh abgeschlossen!",
    "spielothek.cooldownQuote1": "Sei nicht so süchtig! 😂",
    "spielothek.cooldownQuote2": "Immer langsam, Pirat.",
    "spielothek.cooldownQuote3": "Du hast doch gerade erst gedreht!",
    "spielothek.cooldownQuote4": "Atme erstmal durch.",
    "spielothek.cooldownQuote5": "Nicht schon wieder!",
    "spielothek.cooldownQuote6": "Ich hab doch gesagt: Lass es!",
    "spielothek.cooldownQuote7": "Du kannst auch mal kurz warten.",
    "spielothek.cooldownQuote8": "Das Schiff läuft dir nicht weg.",
    "spielothek.andiLose1": "ICH HABE DICH GEWARNT!",
    "spielothek.andiLose2": "Siehst du? Die Bank gewinnt immer.",
    "spielothek.andiLose3": "Das nächste Mal hörst du vielleicht auf mich.",
    "spielothek.andiLose4": "Tja. Zumindest hast du's versucht.",
    "spielothek.andiLose5": "Autsch. Das war jetzt eher großzügig von dir.",
    "spielothek.andiLose6": "Die Dublonen haben sich gerade von dir verabschiedet.",
    "spielothek.andiLose7": "Fast gewonnen. Also... sehr fast.",
    "spielothek.andiLose8": "Das Schiff hat mehr Glück als du.",
    "spielothek.andiLose9": "Mutig gespielt. Schlecht gespielt.",
    "spielothek.andiLose10": "Die Spielothek bedankt sich herzlich.",
    "spielothek.andiLose11": "Deine Dublonen sind jetzt woanders glücklicher.",
    "spielothek.andiLose12": "Das war kein Gewinn. Das war eine Spende.",
    "spielothek.andiLose13": "Vielleicht nächstes Mal den Glückskobold fragen.",
    "spielothek.andiLose14": "Uff. Selbst der Zufall ist gerade enttäuscht.",
    "spielothek.andiLose15": "Na gut, Übung macht den Meister. Noch ein bisschen üben.",
    "spielothek.andiLose16": "Ich hab extra nicht hingeschaut - und trotzdem tat's weh.",
    "spielothek.andiLose17": "Das nenn ich mal eine großzügige Spende an die Schiffskasse.",
    "spielothek.andiLose18": "Immerhin bleibt dir die Erfahrung. Und sonst nix.",
    "spielothek.andiLose19": "Die Würfel mögen dich heute nicht besonders.",
    "spielothek.andiLose20": "Ich hab schon Papageien besser spielen sehen.",

    "socials.audiobookTitle": "🎧 Das Fire-Helmet-Hörspiel",
    "socials.audiobookText": "Tauche noch tiefer in die Geschichte ein.",
    "socials.audiobookButton": "Auf Spotify anhören",

    "socials.gameTitle": "🎮 Andiis Schatzraub",
    "socials.gameText": "Spiel das Schatzraub-Game und stell dein Glück auf die Probe.",
    "socials.gameButton": "Jetzt spielen",

    "home.loadingText": "Wird geladen",

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
    "story.expeditionProgress": "EXPEDITION-FORTSCHRITT",
    "story.chapterLockedMessage": "Dieses Kapitel ist noch nicht freigeschaltet.",

    "progression.notLoggedIn": "Noch nicht angemeldet",
    "progression.level": "LEVEL",
    "progression.maxLevel": "Max. Level erreicht",
    "progression.levelUp": "LEVEL UP!",
    "progression.crewJoinWelcome": "Willkommen in der Crew!",
    "progression.close": "Schließen",

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

    "ship.title": "⚓ SCHIFF REPARIEREN",
    "ship.subtitle": "Repariere dein eigenes Schiff, Etappe für Etappe - dein Fortschritt gehört nur dir.",
    "ship.completeEyebrow": "⚓ SCHIFF VOLLSTÄNDIG REPARIERT!",
    "ship.completeHint": "Deine Flitzpiepen ist wieder seetüchtig und bereit für die nächste Reise.",
    "ship.repairRunning": "🔧 REPARATUR LÄUFT ...",
    "ship.needLogin": "Melde dich zuerst an, um mitzureparieren!",
    "ship.repairButton": "Reparieren",
    "ship.toolsHeading": "Deine Werkzeuge",
    "ship.stagesHeading": "Reparatur-Etappen",
    "ship.puzzlesHeading": "⚓ Rätsel des Kapitäns",

    "menu.shipRepair": "⚒ Repariere das Schiff",

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
    "menu.spielothek": "🎰 Ändii's Arcade",
    "menu.spielothekShort": "Arcade",
    "menu.leaderboard": "🏆 Leaderboard",
    "menu.race": "🏎️ Weekly Race",
    "menu.communityBoss": "🐙 Community Boss",
    "menu.streamraetsel": "❓ ???",
    "menu.streamraetselShort": "???",
    "menu.support": "🆘 Support",
    "menu.rating": "⭐ Rating",

    "support.title": "SUPPORT",
    "support.subtitle": "Report a problem or an issue",
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

    "spielothek.title": "🎰 ÄNDII'S ARCADE",
    "spielothek.subtitle": "A different game every month - purely for fun, virtual currency only.",
    "spielothek.playButton": "PLAY",
    "spielothek.rulesHeading": "Game rules",
    "spielothek.needLogin": "Log in first to play!",
    "spielothek.notEnoughCurrency": "❌ Not enough doubloons for that.",
    "spielothek.saveFailed": "⚠️ That round couldn't be saved right now. Your data wasn't changed. Please try again.",
    "spielothek.perRound": "round",
    "spielothek.betLabel": "Bet:",
    "spielothek.andiIdle1": "I told you to stop!",
    "spielothek.andiIdle2": "Luck isn't on your side today.",
    "spielothek.andiIdle3": "Just one more...? That's exactly how it starts.",
    "spielothek.andiIdle4": "I wouldn't do it.",
    "spielothek.andiIdle5": "The house always wins.",
    "spielothek.andiIdle6": "I'm warning you!",
    "spielothek.andiIdle7": "You're back again?!",
    "spielothek.andiWin1": "Fine, you got lucky this time. Just this once!",
    "spielothek.andiWin2": "Even a broken clock is right twice a day ...",
    "spielothek.andiWin3": "Pfft. Beginner's luck.",
    "spielothek.andiWinBig1": "WHAT?! That was pure luck!",
    "spielothek.andiWinBig2": "Okay, even I didn't see that coming.",
    "spielothek.andiWinBig3": "Wait... you're not serious right now, are you?!",
    "spielothek.andiWinJackpot1": "You cannot be serious right now!",
    "spielothek.andiWinJackpot2": "NO! Not the jackpot! Anything but the jackpot!",
    "spielothek.andiWinJackpot3": "The ship's treasury... it's on fire right now.",
    "spielothek.cooldownLabel": "Next spin in:",
    "spielothek.cooldownWaitButton": "WAITING ...",
    "spielothek.spinCompleteLabel": "🎰 Spin complete!",
    "spielothek.cooldownQuote1": "Don't be so addicted! 😂",
    "spielothek.cooldownQuote2": "Easy there, pirate.",
    "spielothek.cooldownQuote3": "You literally just spun!",
    "spielothek.cooldownQuote4": "Take a breath first.",
    "spielothek.cooldownQuote5": "Not again!",
    "spielothek.cooldownQuote6": "I told you: leave it alone!",
    "spielothek.cooldownQuote7": "You can wait a moment, you know.",
    "spielothek.cooldownQuote8": "The ship isn't going anywhere.",
    "spielothek.andiLose1": "I WARNED YOU!",
    "spielothek.andiLose2": "See? The house always wins.",
    "spielothek.andiLose3": "Maybe you'll listen to me next time.",
    "spielothek.andiLose4": "Well. At least you tried.",
    "spielothek.andiLose5": "Ouch. That was pretty generous of you.",
    "spielothek.andiLose6": "Your doubloons just said their goodbyes.",
    "spielothek.andiLose7": "So close to winning. Well... sort of close.",
    "spielothek.andiLose8": "The ship has better luck than you.",
    "spielothek.andiLose9": "Bravely played. Badly played.",
    "spielothek.andiLose10": "The Spielothek thanks you kindly.",
    "spielothek.andiLose11": "Your doubloons are happier somewhere else now.",
    "spielothek.andiLose12": "That wasn't a win. That was a donation.",
    "spielothek.andiLose13": "Maybe ask the luck goblin next time.",
    "spielothek.andiLose14": "Yikes. Even chance itself is disappointed right now.",
    "spielothek.andiLose15": "Well, practice makes perfect. Keep practicing.",
    "spielothek.andiLose16": "I deliberately looked away - and it still hurt.",
    "spielothek.andiLose17": "I'll call that a generous donation to the ship's fund.",
    "spielothek.andiLose18": "At least you got the experience. That's about it.",
    "spielothek.andiLose19": "The dice just don't like you much today.",
    "spielothek.andiLose20": "I've seen parrots play better than that.",

    "socials.audiobookTitle": "🎧 The Fire Helmet Audio Drama",
    "socials.audiobookText": "Dive even deeper into the story.",
    "socials.audiobookButton": "Listen on Spotify",

    "socials.gameTitle": "🎮 Andii's Treasure Heist",
    "socials.gameText": "Play the treasure heist game and test your luck.",
    "socials.gameButton": "Play now",

    "home.loadingText": "Loading",

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
    "story.expeditionProgress": "EXPEDITION PROGRESS",
    "story.chapterLockedMessage": "This chapter hasn't been unlocked yet.",

    "progression.notLoggedIn": "Not signed in yet",
    "progression.level": "LEVEL",
    "progression.maxLevel": "Max level reached",
    "progression.levelUp": "LEVEL UP!",
    "progression.crewJoinWelcome": "Welcome to the crew!",
    "progression.close": "Close",

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

    "ship.title": "⚓ REPAIR THE SHIP",
    "ship.subtitle": "Repair your own ship, stage by stage - your progress belongs to you alone.",
    "ship.completeEyebrow": "⚓ SHIP FULLY REPAIRED!",
    "ship.completeHint": "Your Flitzpiepen is seaworthy again and ready for the next voyage.",
    "ship.repairRunning": "🔧 REPAIR IN PROGRESS ...",
    "ship.needLogin": "Log in first to help with repairs!",
    "ship.repairButton": "Repair",
    "ship.toolsHeading": "Your Tools",
    "ship.stagesHeading": "Repair Stages",
    "ship.puzzlesHeading": "⚓ Captain's Riddles",

    "menu.shipRepair": "⚒ Repair the Ship",

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
