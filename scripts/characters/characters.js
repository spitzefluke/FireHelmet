/* ======================================================
   CHARAKTER-SYSTEM
   Baut die Charakter-Karten aus scripts/characters-data.js -
   Bild sichtbar, Beschreibung erscheint beim Drüberfahren
   mit der Maus (bzw. per Antippen auf dem Handy).
====================================================== */

let charactersBuilt = false;

function buildCharacters() {
  const container = document.getElementById("character-container");
  if (!container || typeof characters === "undefined") return;

  container.innerHTML = "";

  characters.forEach((char) => {
    const card = document.createElement("div");
    card.className = "character-card-v2";

    const imageHtml = char.image
      ? `<img src="${char.image}" class="character-image" alt="${char.name}">`
      : `<div class="character-image character-image-placeholder">👤</div>`;

    card.innerHTML = `
      ${imageHtml}
      <div class="character-overlay">
        <h2>${char.name}</h2>
        <p>${char.description}</p>
      </div>
      <span class="character-name-tag">${char.name}</span>
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
