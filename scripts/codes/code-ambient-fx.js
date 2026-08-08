/* ======================================================
   AMBIENTE HINTERGRUND-ANIMATION FÜR DIE CODES-SEITE
   Grüne "Matrix"-Zeichen fallen im Hintergrund herab,
   solange man auf der Codes-Seite ist. Läuft komplett
   unabhängig von main.js (eigener page-hook).
====================================================== */
(function () {
  let ambientInterval = null;

  const codeAmbientSymbols = ["0", "1", "$", "#", "%", "&", "?", "*", "🔑", "🔒"];

  function spawnCodeAmbientParticle() {
    const fx = document.getElementById("code-ambient-fx");
    if (!fx) return;

    const particle = document.createElement("div");
    particle.className = "code-ambient-particle";
    particle.textContent = codeAmbientSymbols[Math.floor(Math.random() * codeAmbientSymbols.length)];
    particle.style.left = Math.random() * 100 + "%";
    particle.style.fontSize = 14 + Math.random() * 16 + "px";
    particle.style.animationDuration = 6 + Math.random() * 5 + "s";

    fx.appendChild(particle);
    setTimeout(() => particle.remove(), 12000);
  }

  function startCodeAmbient() {
    stopCodeAmbient();
    ambientInterval = setInterval(spawnCodeAmbientParticle, 300);
  }

  function stopCodeAmbient() {
    clearInterval(ambientInterval);
    ambientInterval = null;

    const fx = document.getElementById("code-ambient-fx");
    if (fx) fx.querySelectorAll(".code-ambient-particle").forEach((el) => el.remove());
  }

  function updateCodeAmbientPage(pageID) {
    if (pageID === "code") {
      startCodeAmbient();
    } else {
      stopCodeAmbient();
    }
  }

  window.updateCodeAmbientPage = updateCodeAmbientPage;
})();
