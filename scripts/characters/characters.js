/* ======================================================
   CHARAKTER-SYSTEM
   Baut die Charakter-Karten NICHT mehr aus einer manuell
   gepflegten Liste, sondern automatisch aus den "characters"-
   Referenzen in scripts/stories/stories-data.js, aufgelöst
   gegen die zentrale CHARACTER_DATABASE (scripts/characters/
   characters-data.js). Neue Charaktere in neuen/bestehenden
   Logbüchern erscheinen dadurch ohne weitere Änderung an dieser
   Datei automatisch auf der Characters-Seite - keine Duplikate,
   da über eine ID-Liste dedupliziert wird.
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

/* ------------------------------------------------------
   CHARAKTERE AUS DEN STORIES ABLEITEN
   Bevorzugt: die explizite "characters"-Liste jeder Story.
   Fallback (falls eine Story mal keine solche Liste pflegt):
   Charakternamen aus CHARACTER_DATABASE im Fließtext der
   Kapitel suchen. Ergebnis ist eine deduplizierte Liste von
   IDs in der Reihenfolge ihres ersten Auftretens.
------------------------------------------------------ */
function deriveCharacterIdsFromStories() {
  const ids = [];
  if (typeof stories === "undefined") return ids;

  const addId = (id) => {
    if (id && !ids.includes(id) && typeof CHARACTER_DATABASE !== "undefined" && CHARACTER_DATABASE[id]) {
      ids.push(id);
    }
  };

  stories.forEach((story) => {
    if (Array.isArray(story.characters) && story.characters.length) {
      story.characters.forEach(addId);
      return;
    }

    if (typeof CHARACTER_DATABASE === "undefined" || !Array.isArray(story.chapters)) return;

    const combinedText = story.chapters.map((c) => c.text || "").join(" \n ").toLowerCase();
    Object.keys(CHARACTER_DATABASE).forEach((id) => {
      const firstName = (CHARACTER_DATABASE[id].name || "").split(" ")[0].toLowerCase();
      if (firstName.length > 2 && combinedText.includes(firstName)) addId(id);
    });
  });

  return ids;
}

function buildCharacters() {
  const container = document.getElementById("character-container");
  if (!container || typeof CHARACTER_DATABASE === "undefined") return;

  const entries = deriveCharacterIdsFromStories()
    .map((id) => ({ id, ...CHARACTER_DATABASE[id] }))
    .filter((char) => char.name);

  container.innerHTML = "";

  entries.forEach((char, index) => {
    const theme = CHARACTER_THEMES[index % CHARACTER_THEMES.length];
    const emblem = pickCharacterEmblem(char.role || char.description, theme.emblem);

    const card = document.createElement("div");
    card.className = "character-card-v2";
    card.style.setProperty("--char-accent", theme.accent);
    card.style.setProperty("--char-accent2", theme.accent2);

    const imageHtml = char.image
      ? `<img src="${char.image}" class="character-image" alt="${char.name}">`
      : `<div class="character-image character-image-placeholder">${emblem}</div>`;

    const quoteHtml = char.quote ? `<p class="character-quote">&bdquo;${char.quote}&ldquo;</p>` : "";

    card.innerHTML = `
      <div class="character-card-inner">
        <div class="character-face character-face-front">
          ${imageHtml}
          <span class="character-emblem-badge">${emblem}</span>
          <span class="character-name-tag">
            <span class="character-name-tag-name">${char.name}</span>
            ${char.role ? `<span class="character-name-tag-role">${char.role}</span>` : ""}
          </span>
        </div>
        <div class="character-face character-face-back">
          <span class="character-emblem-back">${emblem}</span>
          <h2>${char.name}</h2>
          ${char.role ? `<p class="character-role">${char.role}</p>` : ""}
          ${quoteHtml}
          <p>${char.description}</p>
        </div>
      </div>
    `;

    // Zusätzlich zum Hover (Desktop) per Antippen umdrehen, damit die
    // Rückseite mit der Beschreibung auch auf Touch-Geräten erscheint
    card.addEventListener("click", () => {
      card.classList.toggle("character-card-flipped");
    });

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
