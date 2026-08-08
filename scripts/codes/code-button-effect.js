/* ======================================================
   DECRYPT-HOVEREFFEKT FÜR DEN "BESTÄTIGEN"-BUTTON BEI CODES
   Beim Hover scrambelt der Text kurz durch zufällige Zeichen
   und "entschlüsselt" sich dann zurück zum Originaltext.
====================================================== */
(function () {
  const matrixChars = "!<>-_\\/[]{}—=+*^?#01ÄÖÜ";

  function attachDecryptHover(btnEl) {
    if (!btnEl || btnEl.dataset.decryptBound) return;
    btnEl.dataset.decryptBound = "1";

    let matrixInterval = null;

    btnEl.addEventListener("mouseenter", () => {
      const originalText = btnEl.textContent;
      let iteration = 0;
      clearInterval(matrixInterval);

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

      btnEl.dataset.originalText = originalText;
    });

    btnEl.addEventListener("mouseleave", () => {
      clearInterval(matrixInterval);
      if (btnEl.dataset.originalText) {
        btnEl.textContent = btnEl.dataset.originalText;
      }
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    attachDecryptHover(document.getElementById("code-confirm-btn"));
  });
})();
