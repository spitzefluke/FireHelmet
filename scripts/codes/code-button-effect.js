/* ======================================================
   DECRYPT-HOVEREFFEKT FÜR DEN "BESTÄTIGEN"-BUTTON BEI CODES
   Beim Hover scrambelt der Text mit RGB-Glitch-Versatz durch
   zufällige Zeichen und "entschlüsselt" sich dann Stück für
   Stück zurück zum Originaltext.
====================================================== */
(function () {
  const matrixChars = "!<>-_\\/[]{}—=+*^?#01ÄÖÜ";

  function attachDecryptHover(btnEl) {
    if (!btnEl || btnEl.dataset.decryptBound) return;
    btnEl.dataset.decryptBound = "1";

    let matrixInterval = null;
    let glitchTimeout = null;

    btnEl.addEventListener("mouseenter", () => {
      const originalText = btnEl.textContent;
      btnEl.dataset.originalText = originalText;
      let iteration = 0;
      clearInterval(matrixInterval);

      // kurzer, harter RGB-Split-Glitch beim Reinhovern
      btnEl.classList.add("code-btn-glitching");
      clearTimeout(glitchTimeout);
      glitchTimeout = setTimeout(() => btnEl.classList.remove("code-btn-glitching"), 220);

      matrixInterval = setInterval(() => {
        btnEl.textContent = originalText
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) return originalText[index];
            return matrixChars[Math.floor(Math.random() * matrixChars.length)];
          })
          .join("");

        if (iteration >= originalText.length) {
          clearInterval(matrixInterval);
        }
        iteration += 1 / 2;
      }, 35);
    });

    btnEl.addEventListener("mouseleave", () => {
      clearInterval(matrixInterval);
      clearTimeout(glitchTimeout);
      btnEl.classList.remove("code-btn-glitching");
      if (btnEl.dataset.originalText) {
        btnEl.textContent = btnEl.dataset.originalText;
      }
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    attachDecryptHover(document.getElementById("code-confirm-btn"));
  });
})();
