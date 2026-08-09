/* ======================================
   SCHATZRAD PREISE
   Trage hier deine Segmente ein. Am besten
   6 oder 8 Stück, dann sieht das Rad schön
   gleichmäßig aus. Die "color" hier ist nur
   der Fallback, falls mal kein Wochen-Thema
   gefunden wird - normalerweise bestimmt das
   Thema unten die tatsächlichen Farben.
====================================== */

const wheelPrizes = [
  { label: "Kartenfetzen",     message: "Du findest ein Stück einer alten Schatzkarte ...", color: "#d4af37" },
  { label: "Leeres Fass",      message: "Nur ein leeres Rumfass – diesmal kein Glück. Morgen wieder!", color: "#3b2415" },
  { label: "Geheimwort",       message: "Dein Bonus-Wort lautet: STURMFLUT", color: "#0e7c66" },
  { label: "Falsche Fährte",   message: "So knapp am Schatz vorbei! Morgen hast du eine neue Chance.", color: "#3b2415" },
  { label: "Kapitäns-Tipp",    message: "Psst: Schau dir bald nochmal die Characters-Seite an.", color: "#7c2d12" },
  { label: "Flitzpiepen-Gruß", message: "Die Flitzpiepen-Crew grüßt dich! 🏴‍☠️", color: "#d4af37" },
  { label: "Sturm zieht auf",  message: "Kein Fund heute – aber deine Streak zählt trotzdem!", color: "#3b2415" },
  { label: "Seltener Fund",    message: "Du hast eine geheime Schatzkarten-Ecke entdeckt ...", color: "#0e7c66" },
];

/* ======================================
   WÖCHENTLICHE RAD-THEMEN
   Jede Woche wird automatisch (nach Kalenderwoche,
   für alle Besucher gleich) eines dieser Farbthemen
   fürs Rad-Aussehen gewählt. Die Preise selbst
   (Texte oben) bleiben immer gleich, nur der Look
   wechselt. Füge gerne weitere Themen hinzu.
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
