/* ======================================================
   STORY SYSTEM
====================================================== */

let currentStory = null;
let currentChapter = null;

/* ------------------------------------------------------
   SPRACH-BADGE (Emoji + Farbklasse je nach Sprache)
------------------------------------------------------ */
function getLanguageBadge(language) {
  const lang = (language || "").toLowerCase();

  if (lang.includes("deutsch")) {
    return { emoji: "🇩🇪", className: "language-de" };
  }

  if (lang.includes("english")) {
    return { emoji: "🇬🇧", className: "language-en" };
  }

  return { emoji: "🌐", className: "" };
}

/* ------------------------------------------------------
   STORY ARCHIV LADEN
------------------------------------------------------ */
function loadStories() {
  const container = document.getElementById("story-grid");
  if (!container) return;

  container.innerHTML = "";

  stories.forEach((story) => {
    const card = document.createElement("div");
    card.className = "story-card";
    card.onclick = () => openStory(story.id);

    card.innerHTML = `
      <img src="${story.cover}" alt="${story.title}">
      <h2>${story.title}</h2>
      <p>${story.description}</p>
    `;

    container.appendChild(card);
  });
}

/* ------------------------------------------------------
   STORY ÖFFNEN
------------------------------------------------------ */
function openStory(id) {
  const story = stories.find((item) => item.id === id);
  if (!story) return;

  currentStory = story;

  document.getElementById("detail-cover").src = story.cover;
  document.getElementById("detail-title").textContent = story.title;
  document.getElementById("detail-description").textContent = story.description;

  loadChapters();
  changePage("story-detail");
}

/* ------------------------------------------------------
   KAPITEL LADEN
------------------------------------------------------ */
function loadChapters() {
  const container = document.getElementById("chapter-list");
  container.innerHTML = "";

  currentStory.chapters.forEach((chapter) => {
    const card = document.createElement("div");
    card.className = "chapter-card";
    card.onclick = () => openChapter(chapter.id);

    const badge = getLanguageBadge(chapter.language);

    card.innerHTML = `
      <h3>${chapter.title}</h3>
      <span class="language ${badge.className}">${badge.emoji} ${chapter.language}</span>
    `;

    container.appendChild(card);
  });
}

/* ------------------------------------------------------
   KAPITEL ÖFFNEN
------------------------------------------------------ */
function openChapter(id) {
  const chapter = currentStory.chapters.find((item) => item.id === id);
  if (!chapter) return;

  currentChapter = chapter;

  document.getElementById("book-title").textContent = chapter.title;

  const bookLangEl = document.getElementById("book-language");
  const badge = getLanguageBadge(chapter.language);
  bookLangEl.textContent = `${badge.emoji} ${chapter.language}`;
  bookLangEl.className = `language ${badge.className}`;

  document.getElementById("book-text").textContent = chapter.text;

  changePage("book-reader");
}

/* ------------------------------------------------------
   START
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  loadStories();
});
