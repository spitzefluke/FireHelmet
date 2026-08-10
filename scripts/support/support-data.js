/* ======================================================
   SUPPORT-BOT DATENBASIS
   ---------------------------------------------------
   FAQ-EINTRÄGE
   Jeder Eintrag hat "keywords" (Wörter, auf die der Bot achtet)
   und "answer" (was er dann antwortet). Der Bot sucht sich den
   Eintrag mit den MEISTEN passenden Keywords zur Frage raus -
   du musst also nicht an alles denken, ein paar gute Stichworte
   pro Thema reichen.

   Trage hier beliebig viele weitere Einträge nach demselben
   Muster ein.
====================================================== */

const supportFaq = [
  {
    keywords: ["code", "codes", "geheimcode", "einlösen", "gültig"],
    answer:
      "Codes gibst du auf der Seite \"Code\" im Menü ein. Achte auf Groß-/Kleinschreibung ist egal, " +
      "aber Leerzeichen können einen Unterschied machen. Neue Codes verkündet Dave meistens live im Stream oder in Discord.",
  },
  {
    keywords: ["rad", "schatzrad", "drehen", "spin", "gewinn", "preis", "streak"],
    answer:
      "Das Schatzrad kannst du einmal am Tag drehen (Seite \"Schatzrad\"). Dafür musst du angemeldet sein " +
      "(Twitch, Discord oder einfach mit Namen). Jeden Tag am Stück drehen erhöht deine Streak!",
  },
  {
    keywords: ["rangliste", "leaderboard", "platz", "top", "bestenliste"],
    answer:
      "Die Rangliste zeigt, wer die meisten Codes geknackt hat. Sie aktualisiert sich automatisch - " +
      "knack einfach fleißig weiter Codes, um aufzusteigen!",
  },
  {
    keywords: ["rennen", "wochenrennen", "kart", "boot", "flugzeug", "fahrzeug"],
    answer:
      "Beim Wochenrennen sammelst du Fortschritt durchs Schatzrad-Drehen und Codes-Knacken. " +
      "Jede Woche gibt's eine neue Strecke mit einem anderen Fahrzeug - schau doch mal vorbei!",
  },
  {
    keywords: ["rätsel", "streamrätsel", "schloss", "schlösser", "zahlenschloss", "kombination"],
    answer:
      "Beim Streamrätsel musst du beide Zahlenschlösser knacken, indem du Ziffer für Ziffer die richtige " +
      "Zahl findest. Die Hinweise dazu bekommst du meist live im Stream - schau in den Hinweistext bei jeder Ziffer!",
  },
  {
    keywords: ["gewinnspiel", "giveaway", "teilnehmen"],
    answer:
      "Ob gerade ein Gewinnspiel läuft, siehst du auf der Seite \"Gewinnspiel\". Ist gerade keins aktiv, " +
      "schau einfach später nochmal vorbei - neue Runden werden meist im Stream angekündigt.",
  },
  {
    keywords: ["anmelden", "login", "twitch", "discord", "account", "einloggen"],
    answer:
      "Du kannst dich mit Twitch, Discord oder einfach nur mit einem Namen anmelden (Seite \"Anmelden\"). " +
      "Nur angemeldet zählst du in Rangliste und Wochenrennen mit.",
  },
  {
    keywords: ["musik", "sound", "lied", "song", "lauter", "leiser", "stumm"],
    answer:
      "Die Hintergrundmusik kannst du über das Lautsprecher-Symbol oben stummschalten. " +
      "Manche Browser blockieren Musik-Autoplay - einfach einmal irgendwo auf die Seite klicken, dann startet sie.",
  },
  {
    keywords: ["bug", "fehler", "kaputt", "geht nicht", "funktioniert nicht", "problem"],
    answer:
      "Das klingt nach etwas, das ich dir nicht einfach so beantworten kann. Nutz am besten das " +
      "Formular \"Fehler melden\" weiter unten - dann schaut sich das jemand genauer an!",
  },
];

/* ------------------------------------------------------
   STANDARD-ANTWORT
   Wird gezeigt, wenn keines der obigen Themen passt. Löst
   gleichzeitig aus, dass das "Fehler melden"-Formular kurz
   hervorgehoben wird und Themen-Vorschläge erscheinen.
------------------------------------------------------ */
const supportFallback =
  "Hmm, dazu hab ich leider keine passende Antwort parat. Versuch's mit anderen Worten, oder nutz das Formular unten, dann schaut sich das jemand an!";

/* ------------------------------------------------------
   BEGRÜSSUNGEN / SMALLTALK
------------------------------------------------------ */
const supportGreetings = {
  keywords: ["hallo", "hi", "hey", "servus", "moin", "hallöchen"],
  answers: [
    "Hey! 👋 Womit kann ich dir helfen?",
    "Moin! Was liegt an?",
    "Servus! Frag mich gerne was zu Codes, Rad, Rangliste, Rennen oder dem Streamrätsel.",
  ],
};

const supportThanks = {
  keywords: ["danke", "dankeschön", "thx", "merci"],
  answers: ["Gerne! 🙂", "Kein Problem, viel Spaß weiterhin!", "Immer gerne, sag Bescheid falls noch was ist!"],
};

/* ======================================================
   MODERATION
   ---------------------------------------------------
   Wörter/Ausdrücke, bei denen der Bot davon ausgeht, dass er
   (oder generell) beleidigt wird. Bei der ERSTEN Erkennung gibt
   es eine Verwarnung, beim ZWEITEN Mal einen kurzen Timeout.

   WICHTIG: Trag hier gerne alles ein, was du in deiner
   Community nicht tolerieren willst - das ist deine
   Entscheidung, wir haben bewusst nur ein paar Beispiele
   vorgegeben (siehe auch scripts/wheel/nickname-filter-data.js
   für denselben Mechanismus bei Namen).
====================================================== */
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

const supportTimeoutMinutes = 3;
