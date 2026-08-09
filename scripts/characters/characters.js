/* ======================================================
   CHARAKTER-SYSTEM
   Baut die Charakter-Karten aus scripts/characters-data.js -
   3D-Flip-Karten (Bild vorne, Beschreibung hinten), jede mit
   einem individuell passenden Farb-Theme + Emblem.
====================================================== */

let charactersBuilt = false;

/* Kreisender Pool an Farb-Themen + Standard-Emblem, damit jede
   Karte optisch ihr eigenes Gesicht bekommt, unabhängig davon
   wie viele Charaktere in characters-data.js eingetragen sind. */
const CHARACTER_THEMES = [
  { accent: "#ffd76b", accent2: "#7c2d12", emblem: "⚓" },
  { accent: "#4da3ff", accent2: "#0a1f33", emblem: "🔭" },
  { accent: "#4ade80", accent2: "#0e7c66", emblem: "🧭" },
  { accent: "#ff6a3d", accent2: "#5b1a10", emblem: "🏴‍☠️" },
  { accent: "#c084fc", accent2: "#2f1145", emblem: "💀" },
  { accent: "#38bdf8", accent2: "#123a5c", emblem: "🌊" },
  { accent: "#f472b6", accent2: "#4a0f2e", emblem: "💎" },
  { accent: "#facc15", accent2: "#4a3300", emblem: "🗺️" },
];

/* Passt das Emblem, wenn möglich, automatisch zur Rollen-
   Beschreibung an (Kapitän/Ausguck/Steuermann), sonst fällt es
   auf das Standard-Emblem des zugewiesenen Themes zurück. */
function pickCharacterEmblem(description, fallback) {
  const text = (description || "").toLowerCase();
  if (text.includes("captain") || text.includes("kapitän")) return "⚓";
  if (text.includes("ausguck") || text.includes("beobacht")) return "🔭";
  if (text.includes("steuermann") || text.includes("steuer")) return "🧭";
  return fallback;
}

function buildCharacters() {
  const container = document.getElementById("character-container");
  if (!container || typeof characters === "undefined") return;

  container.innerHTML = "";

  characters.forEach((char, index) => {
    const theme = CHARACTER_THEMES[index % CHARACTER_THEMES.length];
    const emblem = pickCharacterEmblem(char.description, theme.emblem);

    const card = document.createElement("div");
    card.className = "character-card-v2";
    card.style.setProperty("--char-accent", theme.accent);
    card.style.setProperty("--char-accent2", theme.accent2);

    const imageHtml = char.image
      ? `<img src="${char.image}" class="character-image" alt="${char.name}">`
      : `<div class="character-image character-image-placeholder">${emblem}</div>`;

    card.innerHTML = `
      <div class="character-card-inner">
        <div class="character-face character-face-front">
          ${imageHtml}
          <span class="character-emblem-badge">${emblem}</span>
          <span class="character-name-tag">${char.name}</span>
        </div>
        <div class="character-face character-face-back">
          <span class="character-emblem-back">${emblem}</span>
          <h2>${char.name}</h2>
          <p>${char.description}</p>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function updateCharactersPage(pageID) {
  if (pageID !== "characters") return;

  if (!charactersBuilt) {
    buildCharacters();
    charactersBuilt = true;
  }
}
