/* ======================================================
   FORTSCHRITTS-SYSTEM: KONFIGURATION
   ---------------------------------------------------
   Zentrale Konfiguration fuer XP-Kurve, Level-Belohnungen,
   Expedition-Meilensteine und den Piratenpass. Reine Daten, keine
   Logik (die Logik lebt in scripts/core/progression.js) - so lassen
   sich Werte/Belohnungen spaeter aendern, ohne Code anfassen zu
   muessen (Punkt 7/8/13 aus dem Auftrag "Levelsystem/Piratenpass").

   BELOHNUNGS-OBJEKT (zentrales Format, siehe applyReward() in
   progression.js):
     { type: "coins", amount: 100 }
     { type: "xp", amount: 250 }
     { type: "avatar", avatarId: "..." }              (dauerhaft)
     { type: "temporary_avatar", avatarId: "...", durationDays: 3 }
     { type: "tool", toolId: "..." }                  (Schiffswerkzeug)
     { type: "cap" }                                  (Stufe 50 Endbelohnung)
   Neue Typen lassen sich in applyReward() ergaenzen, ohne die
   bestehenden Typen anzufassen.
====================================== */

/* ------------------------------------------------------
   XP-KURVE
   ---------------------------------------------------
   Level 1 = 0 XP. Ab Level 2 steigt der Abstand zum jeweils
   vorherigen Level um 50 XP (100, 150, 200, 250, ...) - ergibt genau
   die im Auftrag genannte Beispielkurve (L2=100, L3=250, L4=450).
   xpRequiredForLevel() ist rein rechnerisch (kein hartes Array) und
   damit beliebig weit skalierbar, ohne dass jemand von Hand weitere
   Level ergaenzen muss.
------------------------------------------------------ */
// EINZIGE Stelle, die das maximale Level festlegt - Levelanzeige,
// XP-Balken, Level-Up, der persoenliche Levelpfad (scripts/core/
// level-path.js) und LEVEL_REWARDS unten lesen ausschliesslich diese
// Konstante, nirgendwo ist "50" ein zweites Mal hartcodiert. Ein
// spaeteres Erhoehen ist damit ein Einzeiler hier plus neue Eintraege
// in LEVEL_REWARDS - keine weiteren Codeaenderungen noetig.
const PROGRESSION_MAX_LEVEL = 50;

function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  let step = 100;
  for (let l = 2; l <= level; l++) {
    total += step;
    step += 50;
  }
  return total;
}

/* ------------------------------------------------------
   LEVEL-BELOHNUNGEN
   ---------------------------------------------------
   Sparsame Map (nicht jedes Level braucht eine Belohnung) - genau
   das im Auftrag geforderte Format "Level -> Belohnung" statt
   verstreuter if-Bloecke. rewardId wird in progression.js aus dem
   Level abgeleitet ("level_<n>_reward") und traegt die
   Dopplungssperre (claimedRewardIds).
------------------------------------------------------ */
const LEVEL_REWARDS = {
  5: { type: "coins", amount: 100 },
  10: { type: "avatar", avatarId: "level-10-albatros" },
  15: { type: "temporary_avatar", avatarId: "level-15-glueckssegel", durationDays: 3 },
  20: { type: "tool", toolId: "compass" },
  25: { type: "coins", amount: 250 },
  30: { type: "avatar", avatarId: "level-30-nachtkapitaen" },
  35: { type: "coins", amount: 300 },
  40: { type: "temporary_avatar", avatarId: "level-40-sturmreiter", durationDays: 3 },
  45: { type: "coins", amount: 350 },
  // Level 50 ist das aktuelle Maximum (PROGRESSION_MAX_LEVEL) - bewusst
  // die groesste Einzelbelohnung als Abschluss der persoenlichen Reise.
  50: { type: "avatar", avatarId: "level-50-legende" },
};

/* ------------------------------------------------------
   EXPEDITION-MEILENSTEINE
   ---------------------------------------------------
   EINE gemeinsame Vorlage, die auf JEDES Logbuch gleichermassen
   angewendet wird (siehe renderStoryProgress() in stories.js) - pro
   Logbuch trotzdem unabhaengig einloesbar, weil die rewardId die
   story-Id enthaelt ("story_<storyId>_milestone_<percent>"). Neue
   Meilensteine hinzufuegen = ein neuer Eintrag hier, kein Code-Umbau.
------------------------------------------------------ */
const EXPEDITION_MILESTONES = [
  { percent: 10, reward: { type: "coins", amount: 20 }, descriptionKey: "progression.milestone.small" },
  { percent: 20, reward: { type: "coins", amount: 60 }, descriptionKey: "progression.milestone.coins" },
  { percent: 30, reward: { type: "avatar", avatarId: "milestone-30-schatzkarte" }, descriptionKey: "progression.milestone.avatar" },
  { percent: 40, reward: { type: "temporary_avatar", avatarId: "milestone-40-nebelgeist", durationDays: 3 }, descriptionKey: "progression.milestone.tempAvatar" },
  { percent: 50, reward: { type: "tool", toolId: "spyglass" }, descriptionKey: "progression.milestone.tool" },
  { percent: 60, reward: { type: "coins", amount: 80 }, descriptionKey: "progression.milestone.coins" },
  { percent: 70, reward: { type: "avatar", avatarId: "milestone-70-kompassrose" }, descriptionKey: "progression.milestone.avatar" },
  { percent: 80, reward: { type: "coins", amount: 150 }, descriptionKey: "progression.milestone.special" },
  { percent: 90, reward: { type: "temporary_avatar", avatarId: "milestone-90-goldnebel", durationDays: 3 }, descriptionKey: "progression.milestone.tempAvatar" },
  { percent: 100, reward: { type: "coins", amount: 300 }, descriptionKey: "progression.milestone.grand" },
];

/* ------------------------------------------------------
   XP-BETRAEGE PRO AKTION
   ---------------------------------------------------
   Wie viel Haupt-XP UND Pass-XP eine bestimmte Aktion bringt. Werden
   an den jeweils bestehenden, bereits deduplizierten Erfolgsstellen
   vergeben (siehe progression.js awardActionXp() + die jeweiligen
   Aufrufer in stories.js/ship-repair.js/main.js/community-boss.js) -
   KEINE neue Dopplungs-Logik noetig, ausser bei Kapitel-Lese-XP (die
   einzige Aktion ohne bestehendes Server-Feld dafuer).
------------------------------------------------------ */
const XP_PER_ACTION = {
  codeRedeemed: 25,
  chapterRead: 15,
  shipRepairPhase: 40,
  dailyQuest: 30,
  bossAttack: 10,
};

const PASS_XP_PER_ACTION = {
  codeRedeemed: 15,
  chapterRead: 10,
  shipRepairPhase: 25,
  dailyQuest: 20,
  bossAttack: 8,
};

/* ------------------------------------------------------
   PIRATENPASS - SAISONS
   ---------------------------------------------------
   Statische Liste (wie ship-repair-data.js/community-boss-data.js) -
   ein neuer Pass = ein neuer Eintrag hier (siehe Auftrag Punkt 11:
   "spaeter problemlos ein neuer Pass angelegt werden kann"). passId
   MUSS zusaetzlich im CHECK-Constraint progression_pass_id_valid
   (supabase/game-migration/01-players-ship-progression.sql) eingetragen
   werden, damit Pass-XP-Schreibvorgaenge fuer die neue Saison
   akzeptiert werden - sonst lehnt Postgres das UPDATE strukturell ab.

   startDate: entweder ein normales ISO-Datum, ODER das spezielle
   Schluesselwort "@streamraetsel-unlock" - dann wird das Startdatum
   zur Laufzeit aus dem BEREITS VORHANDENEN "???"-Countdown
   uebernommen (getStreamRaetselUnlockDate() in scripts/streamraetsel/
   streamraetsel.js, siehe resolvePassStartDate() in progression.js) -
   keine zweite, unabhaengige Datumsquelle. endDate wird IMMER aus
   startDate + durationDays berechnet, nie fest eingetragen, damit
   eine spaetere Verschiebung des "???"-Termins (z.B. per Admin-
   Gateway) automatisch auch die Piratenpass-Saison mitverschiebt.

   50 Stufen, XP-Bedarf pro Stufe steigt gleichmaessig (100 XP pro
   Stufe zusaetzlich) - insgesamt 2550 Pass-XP fuer Stufe 50, bei
   einer 2-Monats-Saison ueber taegliche Aktionen gut erreichbar.
------------------------------------------------------ */
function passXpRequiredForTier(tier) {
  if (tier <= 0) return 0;
  return (tier * (tier + 1) * 100) / 2;
}

/* Generiert die 50 Stufen-Belohnungen nach einem wiederkehrenden,
   aber ausgemischten Muster (XP/Dublonen/Avatar/3-Tage-Avatar/
   Werkzeug), mit ein paar von Hand gesetzten Meilenstein-Stufen
   (10/25/40) und der Endbelohnung auf Stufe 50. Einzelne Stufen
   lassen sich unten in PASS_REWARD_OVERRIDES jederzeit ueberschreiben,
   ohne den Generator anzufassen. */
function buildSeason1PassRewards() {
  const rewards = {};
  const pattern = [
    { type: "coins", amount: 50 },
    { type: "xp", amount: 40 },
    { type: "tool", toolId: "hammer" },
    { type: "coins", amount: 75 },
  ];

  for (let tier = 1; tier <= 50; tier++) {
    const step = pattern[(tier - 1) % pattern.length];
    rewards[tier] = step.type === "coins"
      ? { type: "coins", amount: step.amount + Math.floor(tier / 5) * 10 }
      : { ...step };
  }

  const overrides = {
    10: { type: "avatar", avatarId: "pass-s1-tier-10-schmuggler" },
    20: { type: "coins", amount: 200 },
    25: { type: "temporary_avatar", avatarId: "pass-s1-tier-25-nebelkoenigin", durationDays: 3 },
    30: { type: "avatar", avatarId: "pass-s1-tier-30-sturmlaeufer" },
    40: { type: "coins", amount: 300 },
    50: { type: "cap" },
  };

  return Object.assign(rewards, overrides);
}

const PIRATE_PASSES = [
  {
    passId: "season1",
    name: "Piratenpass #1",
    startDate: "@streamraetsel-unlock",
    durationDays: 61, // ~2 Monate
    levels: 50,
    rewards: buildSeason1PassRewards(),
  },

  // Naechste Saison einfach hier ergaenzen, z.B.:
  // {
  //   passId: "season2",
  //   name: "Piratenpass #2",
  //   startDate: "2026-10-19T00:00:00", // normales ISO-Datum
  //   durationDays: 61,
  //   levels: 50,
  //   rewards: buildSeason2PassRewards(),
  // },
];

/* ------------------------------------------------------
   ENDBELOHNUNG: "ICH BIN EINE FLITZPIEPE"-CAP
   ---------------------------------------------------
   Bildpfad fuer die physische Stufe-50-Belohnung (Produktfoto,
   22.08.2026 hochgeladen) - .webp statt .png: verlustfreie PNG-
   Kodierung des Fotos war ~5x groesser (ca. 950KB) bei identischer
   Bildqualitaet, siehe auch scripts/avatare/ändii.webp fuer denselben
   bereits etablierten Formatwechsel. upgradeCapBadgeIfImageExists()
   in piratenpass.js prueft per Bild-Preload, ob die Datei existiert,
   und zeigt bis dahin ein textbasiertes Abzeichen statt eines
   kaputten <img>-Tags - unveraendert, unabhaengig vom Dateiformat.
------------------------------------------------------ */
const PIRATE_PASS_CAP_IMAGE = "assets/piratenpass/cap.webp";
