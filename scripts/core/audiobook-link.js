/* ======================================================
   SPOTIFY-HÖRSPIEL-LINK (Socials-Seite)
   ---------------------------------------------------
   Liest die URL zentral aus FIRE_HELMET_CONFIG.spotifyAudiobookUrl
   (scripts/core/fire-helmet-config.js) - hier NICHTS hart
   verdrahten. Solange dort noch der Platzhalter steht, wird die
   Karte bewusst als "kommt bald" markiert statt so zu tun, als
   würde sie schon funktionieren (siehe Punkt 33 des Auftrags).
====================================================== */

function initAudiobookLink() {
  const card = document.getElementById("fh-audiobook-card");
  if (!card || typeof FIRE_HELMET_CONFIG === "undefined") return;

  const url = FIRE_HELMET_CONFIG.spotifyAudiobookUrl || "https://open.spotify.com/episode/4HwcXrFhMIOGXARtDKAVWV?si=xDwsPpJTTggjm_L3bqY3Qw&utm_source=copy-link";
  const isRealUrl = /^https?:\/\//i.test(url);

  if (isRealUrl) {
    card.href = url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  } else {
    card.href = "#";
    card.removeAttribute("target");
    card.classList.add("fh-audiobook-card-soon");
    card.setAttribute("aria-disabled", "true");
    card.addEventListener("click", (e) => e.preventDefault());
  }
}

window.addEventListener("DOMContentLoaded", initAudiobookLink);
