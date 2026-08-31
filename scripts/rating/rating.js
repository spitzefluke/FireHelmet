/* ======================================================
   BEWERTUNG
   - Jeder darf die Seite mit 1-5 Sternen + optionalem Kommentar
     bewerten (einmal pro Gerät, danach nur noch Ansicht)
   - Zeigt den öffentlichen Durchschnitt aller Bewertungen an
====================================================== */

let selectedRatingValue = 0;

function initRatingStars() {
  const stars = document.querySelectorAll(".rating-star");
  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRatingValue = parseInt(star.dataset.value, 10);
      highlightRatingStars(selectedRatingValue);
    });
    star.addEventListener("mouseenter", () => {
      highlightRatingStars(parseInt(star.dataset.value, 10));
    });
  });

  const container = document.getElementById("rating-stars");
  if (container) {
    container.addEventListener("mouseleave", () => {
      highlightRatingStars(selectedRatingValue);
    });
  }
}

function highlightRatingStars(value) {
  document.querySelectorAll(".rating-star").forEach((star) => {
    star.classList.toggle("rating-star-active", parseInt(star.dataset.value, 10) <= value);
  });
}

async function submitRating() {
  const statusEl = document.getElementById("rating-status");
  const commentEl = document.getElementById("rating-comment");

  if (!selectedRatingValue) {
    if (statusEl) statusEl.textContent = "Bitte wähle zuerst eine Sterne-Bewertung aus.";
    return;
  }

  if (localStorage.getItem("ratingSubmitted")) {
    if (statusEl) statusEl.textContent = "Du hast bereits bewertet - danke dir!";
    return;
  }

  if (!supabaseClient) {
    if (statusEl) statusEl.textContent = "⚠️ Bewertung ist gerade nicht verfügbar.";
    return;
  }

  if (statusEl) statusEl.textContent = "⏳ Wird gesendet ...";

  const comment = (commentEl?.value || "").trim().slice(0, 500);
  const nickname = localStorage.getItem("wheelNickname") || "Anonym";

  try {
    const uid = await wheelAuthReady;

    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    const { error } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient.from("site_ratings").insert({
        firebase_uid: uid || null,
        nickname,
        value: selectedRatingValue,
        comment: comment || null,
      })
    );
    if (error) throw error;

    localStorage.setItem("ratingSubmitted", "1");
    if (statusEl) statusEl.textContent = "✅ Danke für dein Feedback!";
    if (commentEl) commentEl.value = "";

    loadRatingAverage();
  } catch (err) {
    console.warn("Bewertung konnte nicht gespeichert werden:", err);
    if (statusEl) statusEl.textContent = "⚠️ Konnte nicht gesendet werden, versuch's später nochmal.";
  }
}

/* ------------------------------------------------------
   DURCHSCHNITT ANZEIGEN
------------------------------------------------------ */
async function loadRatingAverage() {
  const box = document.getElementById("rating-average");
  const starsEl = document.getElementById("rating-average-stars");
  const textEl = document.getElementById("rating-average-text");
  if (!box || !supabaseClient) return;

  try {
    const { data, error } = await supabaseClient.from("site_ratings").select("value");
    if (error) throw error;
    if (!data || !data.length) return;

    let total = 0;
    data.forEach((row) => {
      total += row.value || 0;
    });
    const avg = total / data.length;
    const roundedStars = Math.round(avg);

    if (starsEl) starsEl.textContent = "★".repeat(roundedStars) + "☆".repeat(5 - roundedStars);
    if (textEl) textEl.textContent = `${avg.toFixed(1)} / 5 (${data.length} Bewertung${data.length === 1 ? "" : "en"})`;

    box.style.display = "flex";
  } catch (err) {
    console.warn("Durchschnitt konnte nicht geladen werden:", err);
  }
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
let ratingStarsInitialized = false;

function updateRatingPage(pageID) {
  if (pageID !== "rating") return;

  if (!ratingStarsInitialized) {
    initRatingStars();
    ratingStarsInitialized = true;
  }

  if (localStorage.getItem("ratingSubmitted")) {
    const statusEl = document.getElementById("rating-status");
    if (statusEl) statusEl.textContent = "Du hast bereits bewertet - danke dir!";
  }

  loadRatingAverage();
}
