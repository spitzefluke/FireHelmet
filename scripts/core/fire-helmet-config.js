/* ======================================================
   FIRE HELMET - ZENTRALE KONFIGURATION
   ---------------------------------------------------
   Ein Ort für Werte, die sich später ändern könnten,
   ohne dass man dafür mehrere Dateien durchsuchen muss:
   Spotify-Link, Shop-Rotation, Seltenheiten-Definition.

   Muss VOR allen anderen scripts/ Dateien geladen werden,
   die FIRE_HELMET_CONFIG lesen (siehe index.html).
====================================================== */

const FIRE_HELMET_CONFIG = {
  // Hörspiel-Link für die Socials-Seite. Zentral hier eintragen -
  // wird NUR von scripts/core/audiobook-link.js gelesen, nirgends
  // sonst hart im Code verteilt.
  spotifyAudiobookUrl: "https://open.spotify.com/episode/4HwcXrFhMIOGXARtDKAVWV?si=xDwsPpJTTggjm_L3bqY3Qw&utm_source=copy-link",

  // "Repariere das Schiff"-Event (siehe scripts/ship/*): fester
  // Endzeitpunkt statt eines im Browser herunterzählenden Timers -
  // ein Reload springt dadurch nie wieder auf "10 Tage" zurück.
  shipEventUnlockDate: "2026-08-27T18:00:00",

  // Wie oft sich der Schwarzmarkt neu bestückt (in Minuten).
  shopRotationMinutes: 60,

  // Wie viele Artikel pro Kategorie in jeder Rotation im Schaufenster
  // stehen. Ist eine Kategorie kleiner als dieser Wert, werden einfach
  // alle ihre Artikel gezeigt.
  shopRotationSlotsPerType: {
    frame: 4,
    avatar: 3,
  },

  // Seltenheitsstufen: Farbe, Glow-Farbe (für CSS-Variablen),
  // DE/EN-Bezeichnung + Kurzbeschreibung für die Legende im Shop,
  // und "weight" = relative Wahrscheinlichkeit, mit der ein Artikel
  // dieser Stufe bei der stündlichen Rotation gezogen wird (siehe
  // scripts/shop/shop-rotation.js, weightedPickRarity()). Je höher
  // die Zahl, desto häufiger taucht die Stufe im Schaufenster auf -
  // legendary/mythic sind bewusst sehr selten.
  rarities: {
    common: {
      order: 1,
      color: "#9aa4b2",
      glow: "154,164,178",
      label: { de: "Gewöhnlich", en: "Common" },
      desc: {
        de: "Gewöhnliche Gegenstände.",
        en: "Ordinary items.",
      },
      priceRange: [500, 1000],
      weight: 60,
    },
    uncommon: {
      order: 2,
      color: "#4ade80",
      glow: "74,222,128",
      label: { de: "Ungewöhnlich", en: "Uncommon" },
      desc: {
        de: "Etwas schwerer zu bekommen.",
        en: "A bit harder to come by.",
      },
      priceRange: [1000, 2500],
      weight: 25,
    },
    rare: {
      order: 3,
      color: "#4da3ff",
      glow: "77,163,255",
      label: { de: "Selten", en: "Rare" },
      desc: {
        de: "Seltene Sammlerstücke.",
        en: "Rare collector's items.",
      },
      priceRange: [2500, 5000],
      weight: 10,
    },
    epic: {
      order: 4,
      color: "#a463ff",
      glow: "164,99,255",
      label: { de: "Episch", en: "Epic" },
      desc: {
        de: "Extrem seltene Gegenstände.",
        en: "Extremely rare items.",
      },
      priceRange: [5000, 10000],
      weight: 4,
    },
    legendary: {
      order: 5,
      color: "#f0c96a",
      glow: "240,201,106",
      label: { de: "Legendär", en: "Legendary" },
      desc: {
        de: "Außergewöhnliche Gegenstände.",
        en: "Extraordinary items.",
      },
      priceRange: [10000, 25000],
      weight: 0.9,
    },
    mythic: {
      order: 6,
      color: "#ff5555",
      glow: "255,85,85",
      label: { de: "Mythisch", en: "Mythic" },
      desc: {
        de: "Die seltensten Gegenstände des Schwarzmarkts.",
        en: "The rarest items on the black market.",
      },
      priceRange: [25000, 50000],
      weight: 0.1,
    },
  },
};
