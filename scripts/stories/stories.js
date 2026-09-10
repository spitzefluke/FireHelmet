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

  const read = getReadChapterIds();

  stories.forEach((story) => {
    const card = document.createElement("div");
    // "fh-reveal" blendet die Karte sanft ein, sobald sie beim Scrollen
    // ins Blickfeld kommt (scripts/core/reveal.js/fhScanReveals()) -
    // .story-card hatte bisher (anders als z.B. Shop/Rangliste/Characters)
    // ueberhaupt keine Eingangsanimation.
    card.className = "story-card fh-reveal";
    card.onclick = () => openStory(story.id);

    /* Lesestand pro Logbuch - im Entwurf steht auf jeder Archiv-
       Karte, wie weit man ist. Gesperrte Kapitel zaehlen nicht mit,
       sonst waere "12 von 12" nie erreichbar. Dieselbe Quelle wie
       die Startseiten-Karte und die Kapitelliste. */
    const kapitel = (story.chapters || []).filter(
      (k) => !isChapterLocked(k.id)
    );
    const fertig = kapitel.filter((k) => read.includes(k.id)).length;
    const prozent = kapitel.length ? Math.round((fertig / kapitel.length) * 100) : 0;

    const fortschrittLabel = typeof tFormat === "function"
      ? tFormat("story.cardProgress", { done: fertig, total: kapitel.length })
      : `${fertig} von ${kapitel.length} geöffnet`;

    card.innerHTML = `
      <img src="${story.cover}" alt="${story.title}" loading="lazy" decoding="async">
      <div class="story-card-body">
        <h2>${story.title}</h2>
        <p>${story.description}</p>
        <div class="fh-bar">
          <div class="fh-bar-fill" style="width:${prozent}%;background:linear-gradient(90deg,var(--fh-gold),var(--fh-gold-bright))"></div>
        </div>
        <p class="story-card-progress">${fortschrittLabel}</p>
      </div>
    `;

    container.appendChild(card);
  });

  if (typeof window.fhScanReveals === "function") {
    window.fhScanReveals();
  }
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

/* ------------------------------------------------------
   EXPEDITION-MEILENSTEINE
   ---------------------------------------------------
   Nutzt EXPEDITION_MILESTONES (scripts/core/progression-data.js) und
   den zentralen Reward-Dispatcher claimReward() (scripts/core/
   progression.js) - dieselbe Meilenstein-Vorlage gilt fuer JEDES
   Logbuch, aber jedes Logbuch hat unabhaengige rewardIds
   ("story_<storyId>_milestone_<percent>"), siehe Auftrag Punkt 2.
   Der Lesefortschritt selbst bleibt bewusst rein lokal
   (getReadChapterIds() oben, unveraendert) - nur die Belohnungs-
   VERGABE ist serverseitig dedupliziert (claimedRewardIds in
   player_progression/{uid}), damit ein Reload nie doppelt vergibt.
------------------------------------------------------ */
function rewardMilestoneIcon(reward) {
  switch (reward.type) {
    case "coins": return "🪙";
    case "avatar": return "🎭";
    case "temporary_avatar": return "🎭";
    case "tool": return "🔧";
    default: return "🎁";
  }
}

function buildMilestoneMarkersHtml(storyId, percent, claimedIds) {
  if (typeof EXPEDITION_MILESTONES === "undefined") return "";
  return EXPEDITION_MILESTONES.map((m) => {
    const reached = percent >= m.percent;
    const rewardId = `story_${storyId}_milestone_${m.percent}`;
    const claimed = claimedIds.includes(rewardId);
    const stateClass = claimed ? "story-milestone-claimed" : reached ? "story-milestone-ready" : "story-milestone-locked";
    const stateEmoji = claimed ? "🟢" : reached ? "🟡" : "🔒";
    const icon = rewardMilestoneIcon(m.reward);
    return `<span class="story-milestone-marker ${stateClass}" style="left:${m.percent}%" title="${m.percent}% ${stateEmoji}">
      <span class="story-milestone-dot" aria-hidden="true"></span>
      <span class="story-milestone-icon" aria-hidden="true">${icon}</span>
    </span>`;
  }).join("");
}

function renderMilestoneBanner(storyId, percent, claimedIds) {
  const slot = document.getElementById("story-milestone-banner");
  if (!slot || typeof EXPEDITION_MILESTONES === "undefined") return;

  const pending = EXPEDITION_MILESTONES.find(
    (m) => percent >= m.percent && !claimedIds.includes(`story_${storyId}_milestone_${m.percent}`)
  );
  if (!pending) {
    slot.innerHTML = "";
    return;
  }

  const lang = typeof getCurrentLang === "function" ? getCurrentLang() : "de";
  const isEn = lang === "en";
  const rewardText = typeof describeRewardHtml === "function" ? describeRewardHtml(pending.reward) : "";
  const title = isEn ? "ARRR! Milestone reached!" : "ARRR! Meilenstein erreicht!";
  const subtitle = isEn
    ? `You've completed ${pending.percent}% of the expedition!`
    : `Du hast ${pending.percent}% der Expedition geschafft!`;
  const rewardLabel = isEn ? "Reward" : "Belohnung";
  const btnLabel = isEn ? "Collect reward" : "Belohnung einsammeln";

  slot.innerHTML = `
    <div class="story-milestone-banner">
      <p class="story-milestone-banner-title">🏴‍☠️ ${title}</p>
      <p class="story-milestone-banner-subtitle">${subtitle}</p>
      <p class="story-milestone-banner-reward">${rewardLabel}: ${rewardText}</p>
      <button type="button" class="story-milestone-banner-btn" onclick="claimStoryMilestone('${storyId}', ${pending.percent})">${btnLabel}</button>
    </div>
  `;
}

async function claimStoryMilestone(storyId, percent) {
  if (typeof EXPEDITION_MILESTONES === "undefined" || typeof claimReward !== "function") return;
  const milestone = EXPEDITION_MILESTONES.find((m) => m.percent === percent);
  if (!milestone) return;

  const rewardId = `story_${storyId}_milestone_${percent}`;
  const result = await claimReward(rewardId, milestone.reward);
  if (result.ok) renderStoryProgress();
}

async function renderStoryProgress() {
  const el = document.getElementById("story-progress");
  if (!el || !currentStory) return;
  const storyAtStart = currentStory;

  const unlockedChapters = storyAtStart.chapters.filter((c) => !isChapterLocked(c.id));
  if (!unlockedChapters.length) {
    el.innerHTML = "";
    return;
  }

  const read = getReadChapterIds();
  const readCount = unlockedChapters.filter((c) => read.includes(c.id)).length;
  const percent = Math.round((readCount / unlockedChapters.length) * 100);
  const label = typeof t === "function" ? t("story.expeditionProgress", "EXPEDITION-FORTSCHRITT") : "EXPEDITION-FORTSCHRITT";

  let claimedIds = [];
  if (typeof supabaseClient !== "undefined" && supabaseClient && typeof wheelAuthReady !== "undefined") {
    try {
      const uid = await wheelAuthReady;
      if (uid) {
        const { data } = await withSupabaseRlsColdStartRetry(() =>
          supabaseClient
            .from("player_progression")
            .select("claimed_reward_ids")
            .eq("firebase_uid", uid)
            .maybeSingle()
        );
        claimedIds = (data && data.claimed_reward_ids) || [];
      }
    } catch (err) {
      console.warn("Meilenstein-Status konnte nicht geladen werden:", err);
    }
  }

  // Falls der Nutzer inzwischen die Story gewechselt hat, waehrend
  // dieser asynchrone Ladevorgang lief, nicht mehr in die falsche
  // Story rendern.
  if (currentStory !== storyAtStart) return;

  const milestonesHtml = buildMilestoneMarkersHtml(storyAtStart.id, percent, claimedIds);

  el.innerHTML = `
    <p class="story-progress-label">${label} ${percent}%</p>
    <div class="story-progress-bar">
      <div class="story-progress-fill" style="width:${percent}%"></div>
      ${milestonesHtml}
    </div>
    <div class="story-milestone-banner-slot" id="story-milestone-banner"></div>
  `;

  renderMilestoneBanner(storyAtStart.id, percent, claimedIds);
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

  /* Kompakte Zeilen statt Karten (Entwurf 2a): 24 Kapitel als je
     150px hohe Karte waren ueber 3000px Scrollweg fuer je eine
     Zeile Text. Anklickbar, gesperrt und gelesen bleiben dieselben
     Zustaende wie vorher - nur die Form ist anders. */
  currentStory.chapters.forEach((chapter, i) => {
    const locked = isChapterLocked(chapter.id);
    const gelesen = read.includes(chapter.id);

    const card = document.createElement("div");
    card.className = `chapter-row fh-row fh-row-clickable${locked ? " chapter-row-locked" : ""}`;
    card.onclick = () => openChapter(chapter.id);

    const badge = getLanguageBadge(chapter.language);

    /* Bewusst NICHTS fuer noch ungelesene Kapitel: das ist der
       Normalfall. Stuende an jeder der 24 Zeilen "Offen", waere die
       Spalte nur noch Rauschen und die zwei Zustaende, auf die es
       ankommt, gingen darin unter. */
    const zustand = locked
      ? `<span class="fh-row-state fh-row-state-muted"><i class="ph ph-lock-simple" aria-hidden="true"></i>${t("story.stateLocked", "Gesperrt")}</span>`
      : gelesen
      ? `<span class="fh-row-state"><i class="ph ph-check" aria-hidden="true"></i>${t("story.stateRead", "Gelesen")}</span>`
      : "";

    card.innerHTML = `
      <span class="fh-row-nr">${i + 1}</span>
      <span class="fh-row-main">${chapter.title}</span>
      <span class="language ${badge.className} chapter-row-lang">${badge.emoji} ${chapter.language}</span>
      ${zustand}
    `;

    container.appendChild(card);
  });

  staggerReveal(container, ".chapter-row");
}

/* ------------------------------------------------------
   KAPITEL ÖFFNEN
------------------------------------------------------ */
function openChapter(id) {
  const chapter = currentStory.chapters.find((item) => item.id === id);
  if (!chapter) return;

  if (isChapterLocked(id)) {
    const msg = typeof t === "function" ? t("story.chapterLockedMessage", "Dieses Kapitel ist noch nicht freigeschaltet.") : "Dieses Kapitel ist noch nicht freigeschaltet.";
    fhNotice(msg);
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
  if (typeof awardChapterReadXp === "function") awardChapterReadXp(id);

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
