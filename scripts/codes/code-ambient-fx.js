/* ======================================================
   MATRIX-RAIN HINTERGRUND FÜR DIE CODES-SEITE
   Echter Canvas-Regen aus fallenden Zeichen (wie im Film),
   plus Glow-Orbs, die langsam durchs Bild schweben.
   Läuft komplett unabhängig von main.js (eigener page-hook).
====================================================== */
(function () {
  let canvas = null;
  let ctx = null;
  let columns = [];
  let fontSize = 18;
  let animationFrame = null;
  let running = false;
  let resizeHandler = null;

  const matrixChars = "01アイウエオカキクケコサシスセソ$#%&?*<>{}[]".split("");

  function setupCanvas() {
    const fx = document.getElementById("code-ambient-fx");
    if (!fx) return false;

    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "code-matrix-canvas";
      fx.appendChild(canvas);
      ctx = canvas.getContext("2d");
    }

    resizeCanvas();
    return true;
  }

  function resizeCanvas() {
    const fx = document.getElementById("code-ambient-fx");
    if (!canvas || !fx) return;

    canvas.width = fx.clientWidth;
    canvas.height = fx.clientHeight;

    const columnCount = Math.floor(canvas.width / fontSize);
    columns = new Array(columnCount).fill(0).map(() => Math.random() * -canvas.height / fontSize);
  }

  function draw() {
    if (!ctx || !canvas) return;

    // Leicht transparent statt komplett löschen -> Trail-Effekt
    ctx.fillStyle = "rgba(2, 8, 4, 0.18)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = fontSize + "px 'Courier New', monospace";

    for (let i = 0; i < columns.length; i++) {
      const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
      const x = i * fontSize;
      const y = columns[i] * fontSize;

      // Vorderstes Zeichen heller/weißlich, Rest im Grün-Glow
      ctx.fillStyle = Math.random() > 0.94 ? "#c8ffe0" : "rgba(80, 255, 140, 0.85)";
      ctx.shadowColor = "rgba(80, 255, 140, .8)";
      ctx.shadowBlur = 6;
      ctx.fillText(char, x, y);
      ctx.shadowBlur = 0;

      if (y > canvas.height && Math.random() > 0.975) {
        columns[i] = 0;
      } else {
        columns[i] += 1;
      }
    }

    if (running) animationFrame = requestAnimationFrame(draw);
  }

  function spawnGlowOrb() {
    const fx = document.getElementById("code-ambient-fx");
    if (!fx) return;

    const orb = document.createElement("div");
    orb.className = "code-glow-orb";
    orb.style.left = Math.random() * 100 + "%";
    orb.style.top = Math.random() * 100 + "%";
    const size = 120 + Math.random() * 180;
    orb.style.width = size + "px";
    orb.style.height = size + "px";
    orb.style.animationDuration = 9 + Math.random() * 6 + "s";
    fx.appendChild(orb);
    setTimeout(() => orb.remove(), 15000);
  }

  let orbInterval = null;

  function startCodeAmbient() {
    if (running) return;
    if (!setupCanvas()) return;

    running = true;
    draw();

    orbInterval = setInterval(spawnGlowOrb, 2500);
    spawnGlowOrb();

    if (!resizeHandler) {
      resizeHandler = () => resizeCanvas();
      window.addEventListener("resize", resizeHandler);
    }
  }

  function stopCodeAmbient() {
    running = false;
    cancelAnimationFrame(animationFrame);
    clearInterval(orbInterval);
    orbInterval = null;

    const fx = document.getElementById("code-ambient-fx");
    if (fx) {
      fx.querySelectorAll(".code-glow-orb").forEach((el) => el.remove());
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
