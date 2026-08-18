/* ======================================
   SCHATZRAD PREISE
   ---------------------------------------------------
   NEU: das Rad vergibt jetzt ECHTE, unterschiedliche
   Belohnungen statt nur Flavor-Text. Jeder Eintrag hat:
   - "type": "currency" | "tool" | "frame" | "tempAvatar"
   - "rarity": "common" | "rare" | "epic" | "legendary"
     (siehe WHEEL_RARITY_WEIGHTS unten - zentral, leicht
     anpassbar, bestimmt wie WAHRSCHEINLICH dieser Eintrag
     gezogen wird)
   - "label"/"icon": was auf dem Rad-Segment steht
   - "message": Text im Ergebnis-Popup nach dem Drehen

   Alle Belohnungen nutzen AUSSCHLIESSLICH bereits
   bestehende Systeme (Dublonen-Konto, Werkzeugkiste,
   Shop-Rahmen, Avatar-Auswahl) - siehe redeemWheelPrize()
   in wheel.js. Kein neues, paralleles Inventar.

   NEUEN PREIS HINZUFÜGEN: einfach einen weiteren Eintrag
   unten ergänzen (mit gültigem type/rarity) - das Rad und
   die Gewichtung passen sich automatisch an, keine feste
   Segmentzahl nötig.
====================================== */

/* Zentrale Seltenheits-Gewichtung - je höher die Zahl, desto
   wahrscheinlicher wird EIN Eintrag dieser Seltenheit gezogen.
   Die tatsächliche Chance pro Eintrag ergibt sich aus seinem
   eigenen "weight" geteilt durch die Summe ALLER Gewichte im Pool
   (siehe pickWeightedWheelPrize() in wheel.js) - diese Tabelle hier
   ist nur zur Orientierung/Dokumentation, welche Grössenordnung
   pro Seltenheit gedacht ist. */
const WHEEL_RARITY_INFO = {
  common: { label: "Gewöhnlich", targetShare: 0.55 },
  rare: { label: "Selten", targetShare: 0.28 },
  epic: { label: "Episch", targetShare: 0.13 },
  legendary: { label: "Legendär", targetShare: 0.04 },
};

const wheelPrizes = [
  // --- GEWÖHNLICH (hohe Wahrscheinlichkeit) ---
  { id: "coins-50", rarity: "common", weight: 14, type: "currency", amount: 50,
    icon: "🪙", label: "50 Dublonen", message: "🪙 +50 Dublonen für dich!" },
  { id: "coins-75", rarity: "common", weight: 14, type: "currency", amount: 75,
    icon: "🪙", label: "75 Dublonen", message: "🪙 +75 Dublonen für dich!" },
  { id: "coins-100", rarity: "common", weight: 14, type: "currency", amount: 100,
    icon: "🪙", label: "100 Dublonen", message: "🪙 +100 Dublonen für dich!" },
  { id: "tool-find", rarity: "common", weight: 13, type: "tool",
    icon: "🔧", label: "Werkzeug-Fund", message: "🔧 Ein Werkzeug für die Schiffsreparatur wandert in deine Kiste!" },

  // --- SELTEN (mittlere Wahrscheinlichkeit) ---
  { id: "coins-150", rarity: "rare", weight: 10, type: "currency", amount: 150,
    icon: "🪙", label: "150 Dublonen", message: "🪙 +150 Dublonen für dich!" },
  { id: "coins-200", rarity: "rare", weight: 9, type: "currency", amount: 200,
    icon: "🪙", label: "200 Dublonen", message: "🪙 +200 Dublonen für dich!" },
  { id: "shop-bonus", rarity: "rare", weight: 9, type: "currency", amount: 120,
    icon: "🛍️", label: "Shop-Bonus", message: "🛍️ Shop-Bonus: +120 Dublonen extra für deinen nächsten Einkauf!" },

  // --- EPISCH (niedrige Wahrscheinlichkeit) ---
  { id: "coins-300", rarity: "epic", weight: 5, type: "currency", amount: 300,
    icon: "💰", label: "300 Dublonen", message: "💰 +300 Dublonen für dich!" },
  { id: "temp-avatar-aendii", rarity: "epic", weight: 4, type: "tempAvatar",
    avatarId: "Ändii", avatar: "scripts/avatare/ändii.webp", durationDays: 3,
    icon: "🎭", label: "3-Tage-Ändii", message: "🎭 Seltener Fund! Du darfst Ändii 3 Tage lang als Avatar tragen." },
  { id: "cosmetic-frame-bronze", rarity: "epic", weight: 4, type: "frame", frameId: "frame-bronze",
    icon: "🖼️", label: "Bronze-Rahmen", message: "🖼️ Ein kosmetischer Bronze-Rahmen für dein Profilbild ist jetzt deiner!" },

  // --- LEGENDÄR (sehr niedrige Wahrscheinlichkeit) ---
  { id: "coins-500", rarity: "legendary", weight: 2, type: "currency", amount: 500,
    icon: "👑", label: "500 Dublonen", message: "👑 Riesenfund! +500 Dublonen für dich!" },
  { id: "cosmetic-frame-legend", rarity: "legendary", weight: 2, type: "frame", frameId: "frame-legend",
    icon: "🏆", label: "Legend-Rahmen", message: "🏆 Legendär! Der seltene Legend-Rahmen gehört jetzt dir!" },
];

/* ======================================
   WÖCHENTLICHE RAD-THEMEN
   Jede Woche wird automatisch (nach Kalenderwoche,
   für alle Besucher gleich) eines dieser Farbthemen
   fürs Rad-Aussehen gewählt. Die Preise selbst
   (oben) bleiben immer gleich, nur der Look wechselt.
   Die Farb-/Icon-Listen dürfen eine andere Länge haben
   als wheelPrizes - buildWheel() zyklt sie einfach durch
   (per Modulo), es müssen also nicht 1:1 so viele Einträge
   wie Preise sein.
====================================== */
const wheelThemes = [
  {
    name: "Gold & Piraten",
    colors: ["#d4af37", "#3b2415", "#0e7c66", "#3b2415", "#7c2d12", "#d4af37", "#3b2415", "#0e7c66"],
    accent: "#d4af37",
    icons: ["⚓", "💰", "🏴‍☠️", "🗺️"],
  },
  {
    name: "Ozean-Blau",
    colors: ["#4da3ff", "#0a1f33", "#38bdf8", "#0a1f33", "#1c4f8f", "#4da3ff", "#0a1f33", "#38bdf8"],
    accent: "#4da3ff",
    icons: ["🌊", "🐚", "🐠", "⛵"],
  },
  {
    name: "Dschungel-Grün",
    colors: ["#4ade80", "#12241a", "#0e7c66", "#12241a", "#1f5c3a", "#4ade80", "#12241a", "#0e7c66"],
    accent: "#4ade80",
    icons: ["🌴", "🦜", "🍃", "🐍"],
  },
  {
    name: "Mitternacht-Lila",
    colors: ["#9146ff", "#160a29", "#c084fc", "#160a29", "#5b2a99", "#9146ff", "#160a29", "#c084fc"],
    accent: "#9146ff",
    icons: ["🔮", "⭐", "🌙", "✨"],
  },
];
