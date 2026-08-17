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
   KAPITEL-SPERRE (Admin-Gateway, siehe scripts/core/site-config.js)
   ---------------------------------------------------
   siteConfig.lockedChapterIds ist standardmäßig ein leeres Array -
   ist Firestore nicht erreichbar oder noch nichts gesperrt, bleibt
   JEDES Kapitel exakt wie bisher sofort verfügbar (Punkt 5: erst
   additiv, kein bestehendes Kapitel verschwindet ohne Grund).
------------------------------------------------------ */
function isChapterLocked(chapterId) {
  const locked = typeof siteConfig !== "undefined" ? siteConfig.lockedChapterIds : [];
  return Array.isArray(locked) && locked.includes(chapterId);
}

/* ------------------------------------------------------
   GELESENE KAPITEL (rein lokal, pro Browser) - für die
   Expeditions-Fortschrittsanzeige, siehe renderStoryProgress().
------------------------------------------------------ */
function getReadChapterIds() {
  try {
    return JSON.parse(localStorage.getItem("storyReadChapters") || "[]");
  } catch (e) {
    return [];
  }
}

function markChapterAsRead(chapterId) {
  const read = getReadChapterIds();
  if (!read.includes(chapterId)) {
    read.push(chapterId);
    localStorage.setItem("storyReadChapters", JSON.stringify(read));
  }
}

function renderStoryProgress() {
  const el = document.getElementById("story-progress");
  if (!el || !currentStory) return;

  const unlockedChapters = currentStory.chapters.filter((c) => !isChapterLocked(c.id));
  if (!unlockedChapters.length) {
    el.innerHTML = "";
    return;
  }

  const read = getReadChapterIds();
  const readCount = unlockedChapters.filter((c) => read.includes(c.id)).length;
  const percent = Math.round((readCount / unlockedChapters.length) * 100);
  const label = typeof t === "function" ? t("story.expeditionProgress", "EXPEDITION-FORTSCHRITT") : "EXPEDITION-FORTSCHRITT";

  el.innerHTML = `
    <p class="story-progress-label">${label} ${percent}%</p>
    <div class="story-progress-bar"><div class="story-progress-fill" style="width:${percent}%"></div></div>
  `;
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
  renderStoryProgress();
  changePage("story-detail");
}

/* ------------------------------------------------------
   KAPITEL LADEN
------------------------------------------------------ */
function loadChapters() {
  const container = document.getElementById("chapter-list");
  container.innerHTML = "";

  const read = getReadChapterIds();

  currentStory.chapters.forEach((chapter) => {
    const locked = isChapterLocked(chapter.id);
    const card = document.createElement("div");
    card.className = `chapter-card${locked ? " chapter-card-locked" : ""}`;
    card.onclick = () => openChapter(chapter.id);

    const badge = getLanguageBadge(chapter.language);
    const statusBadge = locked
      ? `<span class="chapter-status chapter-status-locked">🔒</span>`
      : read.includes(chapter.id)
      ? `<span class="chapter-status chapter-status-read">✓</span>`
      : "";

    card.innerHTML = `
      <h3>${statusBadge}${chapter.title}</h3>
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

  if (isChapterLocked(id)) {
    const msg = typeof t === "function" ? t("story.chapterLockedMessage", "Dieses Kapitel ist noch nicht freigeschaltet.") : "Dieses Kapitel ist noch nicht freigeschaltet.";
    alert(msg);
    return;
  }

  currentChapter = chapter;

  document.getElementById("book-title").textContent = chapter.title;

  const bookLangEl = document.getElementById("book-language");
  const badge = getLanguageBadge(chapter.language);
  bookLangEl.textContent = `${badge.emoji} ${chapter.language}`;
  bookLangEl.className = `language ${badge.className}`;

  document.getElementById("book-text").textContent = chapter.text;

  markChapterAsRead(id);

  changePage("book-reader");
}

/* ------------------------------------------------------
   LIVE-VORSCHAU FÜR DAS ADMIN-GATEWAY
   Ändert der Admin z.B. eine Kapitel-Sperre, während gerade eine
   Story-Detailseite offen ist (z.B. in einem zweiten Tab als
   Vorschau), aktualisiert sich die Kapitelliste sofort neu.
------------------------------------------------------ */
window.addEventListener("siteConfigUpdated", () => {
  if (!currentStory) return;
  loadChapters();
  renderStoryProgress();
});

/* ------------------------------------------------------
   START
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  loadStories();
});
