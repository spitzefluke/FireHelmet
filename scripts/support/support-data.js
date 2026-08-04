/* ======================================
   SUPPORT-BOT - WISSENSBASIS
   Einfacher, regelbasierter Chat-Bot (keine echte KI, läuft
   komplett ohne externe Dienste). Er sucht in der Nutzer-
   frage nach den "keywords" und antwortet mit dem am besten
   passenden Eintrag. Trifft nichts zu, wird automatisch das
   Fehler-melden-Formular vorgeschlagen.

   Füge gerne weitere Einträge hinzu - je mehr passende
   Schlüsselwörter, desto besser trifft der Bot die Frage.
====================================== */

const supportFaq = [
  {
    keywords: ["code", "funktioniert nicht", "code geht nicht", "einlösen"],
    answer:
      "Codes gibst du auf der 🔑 Code-Seite ein - Groß-/Kleinschreibung spielt keine Rolle. Falls er nicht erkannt wird, prüfe auf Tippfehler oder Leerzeichen davor/danach.",
  },
  {
    keywords: ["rad", "schatzrad", "drehen", "dreht sich nicht", "spin"],
    answer:
      "Das Schatzrad kannst du einmal am Tag drehen. Dafür musst du zuerst im 🎮 Anmelden-Bereich einen Namen setzen (Twitch, Discord oder manuell). Hast du heute schon gedreht, siehst du einen Countdown bis zur nächsten Drehung.",
  },
  {
    keywords: ["rangliste", "platz", "leaderboard", "nicht in der rangliste"],
    answer:
      "Du erscheinst in der Rangliste, sobald du angemeldet bist und mindestens einen Code geknackt hast. Dein eigener Platz wird dir immer angezeigt, auch außerhalb der Top 5.",
  },
  {
    keywords: ["rennen", "wochenrennen", "kart", "boot", "flugzeug"],
    answer:
      "Beim Wochenrennen sammelst du Punkte durch Schatzrad-Drehungen und geknackte Codes. Jede Woche wechselt automatisch die Strecke (und manchmal auch das Fahrzeug: Auto, Boot oder Flugzeug).",
  },
  {
    keywords: ["gewinnspiel", "teilnehmen", "gewinner", "auslosung"],
    answer:
      "Beim Gewinnspiel musst du aktiv auf 'Teilnehmen' klicken, um im Lostopf zu sein. Der Gewinner wird automatisch zum Enddatum gezogen und bleibt angezeigt, bis eine neue Runde startet.",
  },
  {
    keywords: ["anmelden", "login", "twitch", "discord", "name"],
    answer:
      "Anmelden geht über den 🎮 Anmelden-Menüpunkt - entweder mit Twitch, mit Discord, oder einfach mit einem frei gewählten Namen.",
  },
  {
    keywords: ["musik", "ton", "sound", "höre nichts", "kein ton"],
    answer:
      "Musik läuft nur auf der Home-Seite. Manche Browser blockieren automatisches Abspielen mit Ton - klick dafür einmal auf den 🔊-Button oben rechts, dann startet sie sicher.",
  },
  {
    keywords: ["streamrätsel", "rätsel", "gesperrt", "schaltet sich frei"],
    answer:
      "Das Streamrätsel schaltet sich automatisch zum angekündigten Datum frei. Bis dahin siehst du einen Countdown.",
  },
];

// Antwort, wenn keine passende Frage gefunden wurde
const supportFallback =
  "Das konnte ich leider nicht direkt beantworten. Nutze gerne das Formular unten, um mir dein Anliegen oder einen Fehler zu melden - ich schau's mir an!";
