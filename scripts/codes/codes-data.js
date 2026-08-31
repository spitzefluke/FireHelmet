/* ======================================
   CODE DATENBANK
   ---------------------------------------------------
   SICHERHEITSHINWEIS: Codes stehen hier absichtlich NICHT
   mehr im Klartext, sondern als SHA-256-Hash. So kann niemand
   einfach diese Datei öffnen (z.B. über GitHub oder die
   Browser-Konsole) und alle Lösungen direkt ablesen - man
   MUSS den echten Code kennen bzw. erraten.

   NEUEN CODE HINZUFÜGEN:
   Öffne die Konsole (F12) auf irgendeiner Seite und tippe:

     crypto.subtle.digest("SHA-256", new TextEncoder().encode("deincode"))
       .then(buf => console.log(
         [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("")
       ));

   ("deincode" durch deinen neuen Code ersetzen, klein geschrieben -
   Groß-/Kleinschreibung spielt beim Einlösen später keine Rolle)
   Den ausgegebenen Hash dann unten bei "hash" eintragen.
   ---------------------------------------------------

   Optional: "image" hinzufügen, um bei diesem Code zusätzlich
   ein Bild anzuzeigen. Pfad relativ zur index.html.

   Optional: "reward" hinzufügen, wenn dieser Code einen ECHTEN
   Gewinn auslöst - erscheint dann als Gewinn-Spalte in der
   Rangliste.

   Optional: "audio" hinzufügen, um beim Einlösen eine eigene
   Audio-Datei abzuspielen (deine eigene Aufnahme, oder eine mit
   einem beliebigen KI-Sprachtool erzeugte MP3 - z.B. ElevenLabs,
   Google TTS, etc., einfach als MP3 exportieren und hier verlinken).
   Pfad relativ zur index.html, z.B. "scripts/audio/dave-01.mp3"
   Das klingt IMMER besser als die eingebaute Browser-Stimme.

   Optional (nur als Rückfalllösung OHNE eigene Audio-Datei):
   "speak: true" liest die Nachricht mit der einfachen Browser-
   Stimme vor. Falls der Vorlesetext anders sein soll als der
   angezeigte Text, zusätzlich "speakText: "..."" angeben.
====================================== */

const codes = [
  {
    hash: "280d44ab1e9f79b5cce2dd4f58f5fe91f0fbacdac9f7447dffc318ceb79f2d02", // welcome
    message: "Willkommen an Bord, Crewmitglied! 🏴‍☠️ Du hast den ersten Geheimcode geknackt.",
    // Beispiel: audio: "scripts/audio/welcome.mp3",
  },
  {
    hash: "c1d6e4fc7422656509d6988df576d75c439f2102297cc477633a02bb7d190c12", // 13123
    message: "Du bist ein kluger Mensch hier dein nächster Vorteil: 11490, löse ihn auf der Fortnite Map ein.",
  },
  {
    hash: "2c70e12b7a0646f92279f427c7b38e7334d8e5389cff167a1dc30e73f826b683", // key
    message: "PS: Schau auf Youtube",
    // Beispiel: image: "scripts/images/key-hinweis.png",
  },
  {
    hash: "61ea0803f8853523b777d414ace3130cd4d3f92de2cd7ff8695c337d79c2eeee", // dave
    message: "Ah du bist also ein Mitglied der Flitzpiepen, dann bekommst du einen ersten Hinweis für einen Gewinn im Wert von 2500 VBucks !  Der Hinweis liegt im Twitch Account vom besten Mod vom Zugfahrer_Dave",
    reward: "2500 VBucks-Hinweis",
  },
  {
    hash: "59a853d277efc60873b2b9691ffa0e652e3d76b7196844beef971105447ddc00", // 010123
    message: "Den ersten Hinweis hast du also geknackt. Mal sehen wie alt du bist: XHMNKKKFMWJW",
  },
  {
    hash: "b63814c6f67f93b490e15534af1e134421bfa76280d6546c38bedc018b1bd7a2", // schifffahrer
    message: "Du bist auf einem guten Weg, am 20.07. gehts weiter.",
  },
  {
    hash: "ec6820622d6388215f724a89365d214c25666a951f90b3322e730713bfbd1eec", // sturmflut
    message: "Glückwunsch, zu deinem Glücksradgewinn, merke dir diese 4 Ziffern für ein Game in Roblox: 9562",
    reward: "Roblox-Code",
  },
  {
    hash: "099ef95be2a4db34c612f6326988690bd92b53c4b08d9b53f447c892597c7b5a", // 01864
    message: "Glückwunsch Seemann nun etwas schwerer löse dieses Rätsel:",
    image: "scripts/image/raetsel1.png",
  },
  {
    hash: "b0c27fca74fa91934900c9ffcb3dcca5b807a3c059a3b516cdd0788807b5ff49", // roma
    message: "Wo liege ich genau, finde mich doch und trau dich mich zu suchen",
  },
  {
    hash: "059f5e543bd484b00e235edc5083558c59d45706bd99c14422bda8868c6c6f90", // 4112
    message: "Du hast das nächste Tägliche geschafft, Glückwunsch",
  },
  {
    hash: "174f91e07e02eda58bb2c14a4cfbd85efdc2de378f3ff7d09c57123758769080", // 00387
    message: "von oben...",
    image: "scripts/image/raetsel2.png",
  },
  {
    hash: "9d030edcde5e56001ba919be683b8f7ddacf7cd4a0f991448d7b792594a71daa", // 6119p
    message: "Du hast dich für das erste Gewinnspiel registriert, Glückwunsch. Schicke ein Bild an spitzefluke@gmail.com oder in den Discord Helme und Züge.",
    reward: "Gewinnspiel-Teilnahme",
  },
  {
    hash: "31d8d90581a4e61fddd554f8278fbb51ecb4d52d75705fdef21594ab672d6979", // ausguck (versteckt bei den Stories)
    message: "Scharfe Augen! Du hast den winzigen Code bei den Stories entdeckt. 🔭",
  },
  {
    hash: "6700869c8ff7480e34a70a708b028700dbaa3a033b5652b903afe89f49a31456", // Ben
    message: "Der beste und alte Bruder vom Dave.",
  },
  {
    hash: "1deb056277cbf73bff5424e04fdc2a866a920e557568b4a6ca746311d2d96322", // 004100
    message: "So alt ist der alte Dave und der Schifffahrer Dave schon.",
  },
  {
    hash: "c35896745c9e780bc800b9601205cd8d0fd7e542b2a831b5884ba80f7f7f706f", // Zoey
    message: "Tochter vom Zugfahrer",
  },
  {
    hash: "4addb2791110e403d458977d8e4f3bc812de8d149e5a49f6f653564aa35ec27a", // Drache
    message: "Feuer, Flügel und Lieblingsbegleiter vom Dave.",
  },
  {
    hash: "59858c2960c57e08940d544225e998cdc3a21e7bb429a8d1832c052563eab2d4", // Saulappen
    message: "Du bist nun ein Saulappen und Teil der Crew von den Saulappen des Daves.",
  },
  {
    hash: "ed227bb0d191d168545bec592e8b9c1199ef4ffa122a7395ededa0cf888dc09f", // SixSeven
    message: "Ist es 67 oder sixseven, egal beim Dave ist das Wort und die Zahl gesperrt.",
  },
  {
    hash: "20cb2ba2653ca07b952ed0aeedad987e611188771380e5a50780248291bd7865", // Flietzpiepen
    message: "Bin ich ein Wort, eine Gruppierung, eine Sekte oder doch ein Merch?",
    reward: "???Tipp???",
  },
  {
    hash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918", // ADMIN
    message: "Avatar wurde freigeschaltet",
    avatarUnlock: "Admin",
  },
  {
    hash: "cac24f302a4a4945ae50be622c14407102347c6527c127d530f16fbbdf9c9da9", // Hörspiel
    message: "Morgen 18:00 auf Spotify",
  },

  /* ------------------------------------------------------
     "REPARIERE DAS SCHIFF"-EVENT: REPARATURCODES
     Werden NICHT durch Hinweise/Suche gefunden, sondern durch
     Lösen eines Rätsels im Event selbst (siehe scripts/ship/
     ship-repair-data.js -> SHIP_PUZZLES). Das Rätsel-System
     zeigt dem Spieler nach richtiger Antwort exakt den Code,
     der hier unten registriert ist - dieselbe Codes-Seite/
     derselbe checkCode() wie überall sonst, kein zweites
     System. "toolUnlock" schaltet ein Reparatur-Werkzeug frei
     (siehe unlockShipTool() in scripts/ship/ship-repair.js).
  ------------------------------------------------------ */
  {
    hash: "ccdd73ff505f3432fd1a297becac991249d86627ac5f86aae57765de63f25153", // hammer-7k4x
    message: "🔨 Der Hammer liegt jetzt in deinem Werkzeugkasten. Zeit, den Rumpf zu flicken.",
    toolUnlock: "hammer",
  },
  {
    hash: "c0980f837e7175583958225393be1393dcd55048bd27f32847be9b3a9bde5510", // saege-3q9p
    message: "🪚 Die Säge ist jetzt deine. Der Mast wartet auf dich.",
    toolUnlock: "saw",
  },
  {
    hash: "b893f7cedf706e51ef4bf23ba44692016f7acd6652a15b2747f262e0861dd98d", // pinsel-5r2m
    message: "🖌️ Der Pinsel gehört jetzt dir. Zeit für den letzten Anstrich.",
    toolUnlock: "brush",
  },
  {
    hash: "069c360ca57de943aeed22bbc6ea9d689dc4a832cd9c8122d4e6aba91fbbe70e", // hammer-9d2l
    message: "🔨 Noch ein Hammer für die Werkzeugkiste.",
    toolUnlock: "hammer",
  },
  {
    hash: "d0e6cbfca5f729b7d719949cd4a67033a4212e643de84fbe7f547b3f20f39f1f", // saege-6t1v
    message: "🪚 Noch eine Säge - der Rumpf braucht noch mehr Arbeit.",
    toolUnlock: "saw",
  },
  {
    hash: "fb311c2d661543ef2dbfaf2294dae0f226b9765e64b7922abf62167e5e7b03d6", // pinsel-8w4n
    message: "🖌️ Ein zweiter Pinsel, für die letzten Details.",
    toolUnlock: "brush",
  },
  {
    hash: "516f8d0acea001b6c788aab67b70f88c7c18eca88fb1a61cf922bb77a8af2769", // fire100
    message: "🪙 +100 Dublonen für dich!",
    currencyReward: 100,
  },
  {
    hash: "a32e56ce3c0d998093891aec8d03f5c3a4baa9d058acd81f40571d75792e86d4", // beutel25
    message: "🪙 +25 Dublonen für dich!",
    currencyReward: 25,
  },
  {
    hash: "8bfe3282c066093f84dc23ea2215dff3eae0c7bb2a0d7a11585800adc3d7efb1", // kleinerbeutel
    message: "🪙 +25 Dublonen für dich!",
    currencyReward: 25,
  },
  {
    hash: "8f42ea772af5c16d5b27feb56aae75e6407d8b85e9174e79e468320b9ed88dba", // fire300
    message: "🪙 +300 Dublonen für dich!",
    currencyReward: 300,
  },
  {
    hash: "d422fd99131807e57e4c5b71defeeab9544b77d9d9201cf36a922f14bf5f226d", // coins300
    message: "🪙 +300 Dublonen für dich!",
    currencyReward: 300,
  },
  {
    hash: "80ebd9ad284c580790b9d1f1e276568c455838fa1604159d7bf323b89718f27c", // sorry500
    message: "🪙 +500 Dublonen als Entschuldigung dafür, dass die Spielothek 3 Tage lang nicht funktioniert hat!",
    currencyReward: 500,
  },
  {
    hash: "484aab2f2cd0f77b3c30f91521ba9a76c8c501112a53e100154a098c274f03d3", // sorry
    message: "🪙 +300 Dublonen als Entschuldigung für die technischen Probleme heute - die komplette Spielothek läuft jetzt zuverlässig über Supabase!",
    currencyReward: 300,
  },

  /* ------------------------------------------------------
     "DER FALL DER VERSCHWUNDENEN DUBLONEN" - siehe scripts/detective/.
     Einziger Code, der GLEICHZEITIG Dublonen UND einen dauerhaften
     Avatar vergibt - "avatarUnlockSecure" (statt des aelteren, rein
     clientseitigen "avatarUnlock") laeuft ueber dieselbe atomare,
     server-verifizierte Transaktion wie currencyReward (siehe
     redeemCurrencyCode() in wheel.js + app.valid_avatar_unlock() in
     supabase/game-migration/01-players-ship-progression.sql) - kann
     also nicht per localStorage-Manipulation gefaelscht werden.
  ------------------------------------------------------ */
  {
    hash: "5836a4ee100cdabe7e2cf26b1a73d9dba43e43b17e27a4d159de60ebc6b41d22", // flame-400-detektiv
    message: "🕵️ Fall gelöst! +400 Dublonen und der exklusive Meisterdetektiv-Avatar sind jetzt dein.",
    currencyReward: 400,
    avatarUnlockSecure: "meisterdetektiv",
    reward: "🕵️ Meisterdetektiv-Avatar",
  },

  /* ------------------------------------------------------
     10 ZUFALLSCODES - "hacked"
     Codes im Klartext (nirgendwo sonst gespeichert, hier nur
     als Kommentar zur eigenen Referenz): prsbn19i, d4v7gre6,
     jbs08ha0, st7f6ay0, 8nuo3gxw, 9xugd1qg, cblrncyf, cbz82e9z,
     896lv3gi, 7536xyf5
  ------------------------------------------------------ */
  {
    hash: "3e6abdb95e1b0acc372908ed8318b086b40400b96a35c59ebd1f4fb83bee5e77", // prsbn19i
    message: "hacked",
  },
  {
    hash: "cb6b9c6b4bdd9ef4c7ed6c03eed0011bc0b30d596a4ca4d963917095166e6735", // d4v7gre6
    message: "hacked",
  },
  {
    hash: "c1b640f91943ee65097f2dc0acfcea746efc718c4d76eb2ed111dd701ba699cc", // jbs08ha0
    message: "hacked",
  },
  {
    hash: "6cc4f79c97769335dcabf0ea00dd4fc8feb4dd2460388d7817a616fca1de0771", // st7f6ay0
    message: "hacked",
  },
  {
    hash: "2526513be80527512558a2b3936aff977733d45f7a3a7a689fef645131b88080", // 8nuo3gxw
    message: "hacked",
  },
  {
    hash: "ce08e670886c61230efee042c91942e6487ab6549d320b0f68997f4bff6fc7d1", // 9xugd1qg
    message: "hacked",
  },
  {
    hash: "5ec5675c2ea02f56a30e5ecd254d541a1e1dbf54439edd9d8aedf5befe9ed7a8", // cblrncyf
    message: "hacked",
  },
  {
    hash: "cc3bc352ea9298a8f994d9d675e7cf2f65978d76bca5c13cf830809dde40f905", // cbz82e9z
    message: "hacked",
  },
  {
    hash: "3161fa663852bb8cad212ce140f84d6a4e88787db36324bccbfdf1476200cf45", // 896lv3gi
    message: "hacked",
  },
  {
    hash: "4b40cdd3eb0e8c95da5d8bd34e7684c7021a54eb38d52ce91d84b4b76e32f995", // 7536xyf5
    message: "hacked",
  },
];

// Nachricht, wenn der Code nicht gefunden wurde
const codeNotFoundMessage = "❌ Dieser Code ist ungültig. Versuch es nochmal!";
