/* ======================================
   PROFILBILDER FÜR DIE ANONYME ANMELDUNG
   Wer sich nur mit einem Namen anmeldet (ohne Twitch/Discord),
   kann sich eines dieser Bilder als Profilbild aussuchen - es
   erscheint dann auch in der Rangliste.

   Zwei Arten von Einträgen sind möglich:
   - Ein Emoji als Text, z.B. "🏴‍☠️" - braucht keine Bilddatei
   - Ein Bildpfad relativ zur index.html - für eigene Bilder,
     die du selbst erstellt hast. Leg deine Bilder in den Ordner
     scripts/avatare/ und trag hier den Pfad ein, z.B.:
     "scripts/avatare/pirat-1.png"

   Trage hier beliebig viele Einträge ein, gerne mischen.
====================================== */

const wheelAvatarOptions = [
  "scripts/avatare/5.png",
  "scripts/avatare/6.png",
  "scripts/avatare/1.png",
  "scripts/avatare/2.png",
  "scripts/avatare/3.png",
  "scripts/avatare/4.png",
  "scripts/avatare/7.png",
  "scripts/avatare/8.png",
  "scripts/avatare/10.png",
  "🌊",
  "🦑",

  // Eigene Bilder - liegen in scripts/avatare/, hier den Pfad eintragen:
  // "scripts/avatare/pirat-1.png",
  // "scripts/avatare/pirat-2.png",
];

/* ======================================
   FREISCHALTBARE SPEZIAL-AVATARE
   Diese Avatare sind zu Beginn GESPERRT und erscheinen im
   Auswahl-Menü mit einem Schloss-Symbol. Erst wer den
   passenden Code einlöst, schaltet sie dauerhaft frei.

   So verknüpfst du einen Code damit:
   1. Trag hier einen Eintrag mit einer eigenen "id" ein
      (frei wählbar, aber einmalig, z.B. "gold-pirat")
   2. Geh in scripts/codes/codes-data.js zu dem Code, der den
      Avatar freischalten soll, und ergänze dort das Feld
      avatarUnlock: "gold-pirat"  (also genau dieselbe id)

   "avatar" kann wieder ein Emoji ODER ein Bildpfad
   (scripts/avatare/...) sein.
====================================== */

const wheelSpecialAvatars = [
  { id: "gold-pirat", avatar: "🏆", label: "Gold-Pirat" },
  { id: "kraken", avatar: "🐲", label: "Kraken-Bezwinger" },
  { id: "Evoli", avatar: "scripts/avatare/9.png", label: "Evoli" },
  { id: "Admin", avatar: "scripts/avatare/11.png", label: "Admin" },
  { id: "boss-slayer", avatar: "🏅", label: "Boss-Bezwinger (Top 3 Schaden)" },

  // "Der Fall der verschwundenen Dublonen" (scripts/detective/) -
  // einziger Weg diesen Avatar zu bekommen: den Geheimcode am Ende des
  // Falls loesen. Anders als die uebrigen Eintraege hier wird dieser
  // NICHT ueber unlockAvatar()/"unlockedAvatars" lokal, sondern
  // serverseitig ueber players.unlocked_avatars vergeben (siehe
  // app.valid_avatar_unlock() in supabase/game-migration/
  // 01-players-ship-progression.sql sowie redeemCurrencyCode() in
  // wheel.js) - markAvatarUnlockedLocally() in wheel.js spiegelt das
  // Ergebnis danach nur noch in dieses lokale Array.
  { id: "meisterdetektiv", avatar: "🕵️", label: "🕵️ Meisterdetektiv" },

  // Zeitlich befristete Schatzrad-Belohnung (siehe wheel-data.js:
  // wheelPrizes -> type "tempAvatar" -> avatarId "Ändii"). Nutzt das
  // bereits vorhandene Ändii-Bild aus dem Charaktersystem (scripts/
  // characters/characters-data.js -> CHARACTER_DATABASE.andi.image) -
  // kein neues, externes Bild. isTemporary:true markiert diesen
  // Eintrag fuer renderAvatarPicker(): er wird NICHT wie die anderen
  // hier dauerhaft ueber "unlockedAvatars" freigeschaltet, sondern
  // ueber das separate, server-synchronisierte tempAvatarExpiresAt.
  { id: "Ändii", avatar: "scripts/avatare/ändii.webp", label: "Ändii (3-Tage-Test)", isTemporary: true },

  // Im Shop kaufbare Avatare (siehe scripts/shop/shop-data.js, dort
  // referenziert per "avatarId" - genau dieselbe id wie hier)
  { id: "shop-papagei", avatar: "🦜", label: "Papagei" },
  { id: "shop-kompass", avatar: "🧭", label: "Kompass" },
  { id: "shop-totenkopf", avatar: "💀", label: "Totenkopf" },
  { id: "shop-anker", avatar: "⚓", label: "Anker" },

  // Neue Shop-Piraten (Bilder einzeln zugeschnitten aus den gelieferten Vorlagen).
  { id: "shop-pirat-01", avatar: "scripts/avatare/shop-pirat-01.webp", label: "Strohhut-Pirat" },
  { id: "shop-pirat-02", avatar: "scripts/avatare/shop-pirat-02.webp", label: "Rotschopf" },
  { id: "shop-pirat-03", avatar: "scripts/avatare/shop-pirat-03.webp", label: "Brummbart" },
  { id: "shop-pirat-04", avatar: "scripts/avatare/shop-pirat-04.webp", label: "Knochenwache" },
  { id: "shop-pirat-05", avatar: "scripts/avatare/shop-pirat-05.webp", label: "Papagei" },
  { id: "shop-pirat-06", avatar: "scripts/avatare/shop-pirat-06.webp", label: "Schattenklinge" },
  { id: "shop-pirat-07", avatar: "scripts/avatare/shop-pirat-07.webp", label: "Freibeuterin" },
  { id: "shop-pirat-08", avatar: "scripts/avatare/shop-pirat-08.webp", label: "Pixelkapitän" },
  { id: "shop-pirat-09", avatar: "scripts/avatare/shop-pirat-09.webp", label: "Feuerschädel" },
  { id: "shop-pirat-10", avatar: "scripts/avatare/shop-pirat-10.webp", label: "Sonnenpirat" },
  { id: "shop-pirat-11", avatar: "scripts/avatare/shop-pirat-11.webp", label: "Strohhut-Abenteurer" },
  { id: "shop-pirat-12", avatar: "scripts/avatare/shop-pirat-12.webp", label: "Rothaarige Kapitänin" },
  { id: "shop-pirat-13", avatar: "scripts/avatare/shop-pirat-13.webp", label: "Goldzahn-Pirat" },
  { id: "shop-pirat-14", avatar: "scripts/avatare/shop-pirat-14.webp", label: "Blaue Knochenwache" },
  { id: "shop-pirat-15", avatar: "scripts/avatare/shop-pirat-15.webp", label: "Schwarzsegel-Kapitän" },
  { id: "shop-pirat-16", avatar: "scripts/avatare/shop-pirat-16.webp", label: "Papagei-Scout" },
  { id: "shop-pirat-17", avatar: "scripts/avatare/shop-pirat-17.webp", label: "Feuer-Pirat" },
  { id: "shop-pirat-18", avatar: "scripts/avatare/shop-pirat-18.webp", label: "Glückspiratin" },
  { id: "shop-pirat-19", avatar: "scripts/avatare/shop-pirat-19.webp", label: "Blockwelt-Pirat" },
  { id: "shop-pirat-20", avatar: "scripts/avatare/shop-pirat-20.webp", label: "Nachtwache" },
  { id: "shop-pirat-21", avatar: "scripts/avatare/shop-pirat-21.webp", label: "Klingenpirat" },
  { id: "shop-pirat-22", avatar: "scripts/avatare/shop-pirat-22.webp", label: "Insel-Otter" },
  { id: "shop-pirat-23", avatar: "scripts/avatare/shop-pirat-23.webp", label: "Flammenkapitänin" },
  { id: "shop-pirat-24", avatar: "scripts/avatare/shop-pirat-24.webp", label: "Geistersteuerer" },
  { id: "shop-pirat-25", avatar: "scripts/avatare/shop-pirat-25.webp", label: "Strohhut-Optimist" },
  { id: "shop-pirat-26", avatar: "scripts/avatare/shop-pirat-26.webp", label: "Grinsender Seebär" },
  { id: "shop-pirat-27", avatar: "scripts/avatare/shop-pirat-27.webp", label: "Silberhaar-Piratin" },
  { id: "shop-pirat-28", avatar: "scripts/avatare/shop-pirat-28.webp", label: "Blockwelt-Abenteurer" },
  { id: "shop-pirat-29", avatar: "scripts/avatare/shop-pirat-29.webp", label: "Pistolen-Kapitän" },
  { id: "shop-pirat-30", avatar: "scripts/avatare/shop-pirat-30.webp", label: "Doppelklingen-Schädel" },

  // Eigene Beispiele:
  // { id: "legendaer", avatar: "scripts/avatare/legendaer.png", label: "Legendärer Pirat" },

  // Level-/Expedition-/Piratenpass-Belohnungen (siehe LEVEL_REWARDS /
  // EXPEDITION_MILESTONES / PIRATE_PASSES in scripts/core/progression-
  // data.js) - werden nicht per Code, sondern automatisch beim
  // Erreichen des jeweiligen Levels/Meilensteins/Stufe freigeschaltet
  // (siehe applyReward() in scripts/core/progression.js).
  { id: "level-10-albatros", avatar: "🐦", label: "Albatros (Level 10)" },
  { id: "level-15-glueckssegel", avatar: "🎏", label: "Glückssegel (Level 15, 3 Tage)", isTemporary: true },
  { id: "level-30-nachtkapitaen", avatar: "🌙", label: "Nachtkapitän (Level 30)" },
  { id: "level-40-sturmreiter", avatar: "⛈️", label: "Sturmreiter (Level 40, 3 Tage)", isTemporary: true },
  { id: "level-50-legende", avatar: "👑", label: "Legende (Level 50)" },
  { id: "milestone-30-schatzkarte", avatar: "🗺️", label: "Schatzkarte (Expedition 30%)" },
  { id: "milestone-40-nebelgeist", avatar: "👻", label: "Nebelgeist (Expedition 40%, 3 Tage)", isTemporary: true },
  { id: "milestone-70-kompassrose", avatar: "🧭", label: "Kompassrose (Expedition 70%)" },
  { id: "milestone-90-goldnebel", avatar: "✨", label: "Goldnebel (Expedition 90%, 3 Tage)", isTemporary: true },
  { id: "pass-s1-tier-10-schmuggler", avatar: "🎭", label: "Schmuggler (Piratenpass Stufe 10)" },
  { id: "pass-s1-tier-25-nebelkoenigin", avatar: "🫧", label: "Nebelkönigin (Piratenpass Stufe 25, 3 Tage)", isTemporary: true },
  { id: "pass-s1-tier-30-sturmlaeufer", avatar: "🌊", label: "Sturmläufer (Piratenpass Stufe 30)" },
  // Piratenpass #2 "Die Seekarte" - vergeben vom Server (public.pass_belohnungen,
  // Migration 53), freigeschaltet in scripts/piratenpass/pass2.js.
  { id: "pass-s2-knochenflagge", avatar: "assets/piratenpass/s2/knochenflagge.svg", label: "Flagge: Gekreuzte Knochen (Piratenpass 2, Stufe 40)" },
  { id: "pass-s2-moewenschrei", avatar: "assets/piratenpass/s2/moewenschrei.svg", label: "Schaluppe „Möwenschrei“ (Piratenpass 2, Kapitän 10)" },
  { id: "pass-s2-geisterpapagei", avatar: "assets/piratenpass/s2/geisterpapagei.svg", label: "Geisterpapagei (Piratenpass 2, Kapitän 20, 7 Tage)", isTemporary: true },
  { id: "pass-s2-rote-lilie", avatar: "assets/piratenpass/s2/rote-lilie.svg", label: "Brigg „Rote Lilie“ (Piratenpass 2, Kapitän 30)" },
  { id: "pass-s2-schwarze-witwe", avatar: "assets/piratenpass/s2/schwarze-witwe.svg", label: "Galeone „Schwarze Witwe“ (Piratenpass 2, Kapitän 50)" },
];
