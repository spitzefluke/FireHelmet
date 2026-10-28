/* ======================================================
   MAIN WEBSITE SYSTEM
====================================================== */

/* ------------------------------------------------------
   SEITENWECHSEL
------------------------------------------------------ */
// Hier startet jeder Besuch. Seiten-Sperre, Sternenschlacht und
// Gegenhack schicken ebenfalls hierher zurueck.
const FH_STARTSEITE = "stand";

function changePage(pageID) {
  // Die fruehere Startseite "home" gibt es nicht mehr - "Dein Stand"
  // ist jetzt der Einstieg. Alte Aufrufe und Lesezeichen landen dort.
  if (pageID === "home") pageID = FH_STARTSEITE;

  // Vom Admin abgeschaltete Seite (seiten-sperre.js): Besucher landen
  // auf der Startseite, der Admin sieht sie weiter als Vorschau.
  if (typeof fhSeiteGesperrt === "function" && fhSeiteGesperrt(pageID)) {
    pageID = FH_STARTSEITE;
  }

  // VOR dem Umschalten merken, wo der Fokus war: sobald die alte Seite
  // auf display:none geht, setzt der Browser den Fokus von selbst auf
  // <body> zurueck - danach liesse sich nicht mehr feststellen, ob der
  // Nutzer gerade in einem Feld getippt hat.
  const fokusVorher = document.activeElement;

  // Welche Seite war offen? Wird fuer die Richtung des Wechsels
  // gebraucht und ist nach dem Umschalten nicht mehr feststellbar.
  const vorherigeSeite = document.querySelector(".page.active-page");
  const vorherID = vorherigeSeite ? vorherigeSeite.id : null;

  const pages = document.querySelectorAll(".page");
  pages.forEach((page) => page.classList.remove("active-page"));

  // MUSS vor .active-page laufen: danach hat die Einblend-Animation
  // schon begonnen und liest den Anlaufpunkt nicht mehr.
  if (typeof fhSeitenRichtung === "function") {
    fhSeitenRichtung(vorherID, pageID);
  }

  const target = document.getElementById(pageID);
  if (target) {
    target.classList.add("active-page");
  }

  updateMusicForPage(pageID);
  updateWheelPage(pageID);
  updateLeaderboardPage(pageID);
  updateRacePage(pageID);
  updateStreamRaetselPage(pageID);
  if (typeof updateSkillTreePage === "function") {
    updateSkillTreePage(pageID);
  }


  if (typeof updateTournamentPage === "function") {
    updateTournamentPage(pageID);
  }

  if (typeof updateGatewayPage === "function") {
    updateGatewayPage(pageID);
  }

  if (typeof updateSpielothekPage === "function") {
    updateSpielothekPage(pageID);
  }
  if (typeof updateGegenhackPage === "function") {
    updateGegenhackPage(pageID);
  }
  if (typeof updateHangarPage === "function") {
    updateHangarPage(pageID);
  }
  if (typeof updateSternenschlachtPage === "function") {
    updateSternenschlachtPage(pageID);
  }
  if (typeof updateSpindPage === "function") {
    updateSpindPage(pageID);
  }
  if (typeof updateGluecksminePage === "function") {
    updateGluecksminePage(pageID);
  }

  if (typeof updateCodeAmbientPage === "function") {
    updateCodeAmbientPage(pageID);
  }

  // Die gemeinsame Effektflaeche aller Seiten
  // (scripts/fx/seiten-fx.js) - schaltet die Stimmung um.
  if (typeof fhSeitenEffekt === "function") {
    fhSeitenEffekt(pageID);
  }

  if (typeof updateCodeHistoryPage === "function") {
    updateCodeHistoryPage(pageID);
  }

  if (typeof updateCommunityBossPage === "function") {
    updateCommunityBossPage(pageID);
  }

  if (typeof updateShopPage === "function") {
    updateShopPage(pageID);
  }

  // Der Dublonenstand steht seit dem 1c-Umbau auch in der Topbar und
  // ist damit auf JEDER Seite sichtbar - er muss also bei jedem
  // Wechsel nachgezogen werden, nicht mehr nur beim Betreten des
  // Shops. Die Funktion schreibt beide Anzeigen aus einer Abfrage.
  if (typeof refreshShopCurrencyDisplay === "function") {
    refreshShopCurrencyDisplay();
  }

  if (typeof updateRatingPage === "function") {
    updateRatingPage(pageID);
  }

  if (typeof updateCharactersPage === "function") {
    updateCharactersPage(pageID);
  }

  if (typeof updateLoginPage === "function") {
    updateLoginPage(pageID);
  }


  if (typeof updateStandPage === "function") {
    updateStandPage(pageID);
  }

  // Saisons (scripts/saison/saison.js): Adventskalender und die
  // versteckten Funde auf der neuen Seite.
  if (typeof updateSaisonPage === "function") {
    updateSaisonPage(pageID);
  }

  updateActiveNavHighlight(pageID);
  closeMenu();
  moveFocusToPage(pageID, fokusVorher);

  // Ganz am Ende: bis hierher haben die update*-Funktionen oben den
  // Inhalt der neuen Seite erzeugt. Vorher gaebe es nichts zu
  // staffeln.
  if (typeof fhSeitenStaffeln === "function") {
    fhSeitenStaffeln(pageID);
  }

  if (typeof fhSeitenTitel === "function") {
    fhSeitenTitel(pageID);
  }
}

/* ------------------------------------------------------
   FOKUS AUF DIE NEUE SEITE
   ---------------------------------------------------
   Nach einem Seitenwechsel blieb der Fokus auf <body>. Wer mit
   der Tastatur navigiert, landete beim naechsten Tab wieder ganz
   oben in der Navigation statt im Inhalt - und Screenreader
   bekamen vom Wechsel gar nichts mit, weil die Seite technisch
   nie neu geladen wird.

   Absichtlich nur bei einem ECHTEN Wechsel und ohne Scroll-
   Sprung (preventScroll), damit die Seite dabei nicht springt.
   Der Fokus geht auf <main id="fh-main">, nicht auf ein Element
   innerhalb der Seite - so bleibt die Tab-Reihenfolge danach die
   natuerliche.
------------------------------------------------------ */
let fhLastFocusedPage = null;

function moveFocusToPage(pageID, fokusVorher) {
  if (pageID === fhLastFocusedPage) return;
  fhLastFocusedPage = pageID;

  const main = document.getElementById("fh-main");
  if (!main) return;

  // Nicht dazwischenfunken, wenn der Nutzer in einem Feld getippt hat,
  // DAS ES NOCH GIBT - etwa weil das Feld ausserhalb der Seiten liegt.
  // Ein Feld auf der verlassenen Seite ist dagegen weg, dort waere ein
  // Fokus auf <body> das schlechtere Ergebnis.
  if (
    fokusVorher &&
    /^(INPUT|TEXTAREA|SELECT)$/.test(fokusVorher.tagName) &&
    fokusVorher.isConnected &&
    fokusVorher.offsetParent !== null
  ) {
    return;
  }

  try {
    main.focus({ preventScroll: true });
  } catch (err) {
    main.focus();
  }
}

/* ------------------------------------------------------
   AKTIVE SEITE IN DER NAVIGATION MARKIEREN
   Betrifft die feste Desktop-Sidebar UND die untere
   Tab-Leiste auf Mobile (beide nutzen dieselbe Klasse).
------------------------------------------------------ */
function updateActiveNavHighlight(pageID) {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.classList.toggle("fh-nav-active", el.dataset.page === pageID);
  });
}

/* ------------------------------------------------------
   FUNKEN-EFFEKT BEIM KLICK AUF EINEN MENUEPUNKT
   Ein Klick zuendet ein paar kleine Goldfunken direkt an der
   Klickposition - passend zum "Feuer"-Thema (dieselbe Farbsprache
   wie .fh-ember auf der Home-Seite), unabhaengig von changePage()
   selbst nutzbar. Ein EINZIGER delegierter Listener deckt alle drei
   Navigations-Oberflaechen ab (klassisches Hamburger-Menue, feste
   Desktop-Sidebar, mobile untere Tableiste), statt fuer jede Liste
   einen eigenen Handler zu brauchen.
------------------------------------------------------ */
(function initNavClickSparks() {
  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const SPARK_COUNT = 6;

  function spawnSparks(x, y) {
    if (reduceMotion.matches) return;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const spark = document.createElement("span");
      spark.className = "fh-nav-spark";

      const angle = (Math.PI * 2 * i) / SPARK_COUNT + Math.random() * 0.5;
      const distance = 26 + Math.random() * 22;
      spark.style.setProperty("--fh-spark-x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--fh-spark-y", `${Math.sin(angle) * distance}px`);
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;

      document.body.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
    }
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest("#sidebar a, .fh-sidebar-nav a, .fh-bottom-nav a");
    if (!link) return;
    spawnSparks(e.clientX, e.clientY);
  });
})();

/* ------------------------------------------------------
   MUSIK
   Ausgelagert nach scripts/music/music-player.js
------------------------------------------------------ */

/* ------------------------------------------------------
   MENÜ SYSTEM
   (Klasse "open" muss zu style.css passen: .sidebar.open)
------------------------------------------------------ */
function openMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btn = document.querySelector(".menu-button");
  if (menu) menu.classList.add("open");
  if (backdrop) backdrop.classList.add("open");
  if (btn) btn.classList.add("menu-open");
}

function closeMenu() {
  const menu = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btn = document.querySelector(".menu-button");
  if (menu) menu.classList.remove("open");
  if (backdrop) backdrop.classList.remove("open");
  if (btn) btn.classList.remove("menu-open");
}

/* ------------------------------------------------------
   CODE SYSTEM
   Vergleicht die Eingabe mit der Liste in codes-data.js
------------------------------------------------------ */
/* ------------------------------------------------------
   HASH-BERECHNUNG (Web Crypto API)
   Wird genutzt, um Codes zu prüfen, ohne die echten Codes
   im Quelltext lesbar zu halten (siehe codes-data.js).
------------------------------------------------------ */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------
   BREMSE GEGEN AUTOMATISIERTES DURCHPROBIEREN
   Nach ein paar Fehlversuchen muss man kurz warten, bevor
   der nächste Versuch gezählt wird.
------------------------------------------------------ */
let codeWrongAttempts = 0;
let codeLockedUntil = 0;

/* ------------------------------------------------------
   SPRACHAUSGABE (Web Speech API)
   Wird nur bei Codes ausgelöst, die in codes-data.js
   "speak: true" gesetzt haben. Liest entweder die normale
   Nachricht vor, oder - falls angegeben - den Text aus
   "speakText" (falls der Vorlesetext anders sein soll als
   der angezeigte Text).
------------------------------------------------------ */
/* ------------------------------------------------------
   AUDIO-AUSGABE FÜR CODES
   Spielt eine eigene Audio-Datei ab (deine Aufnahme oder
   eine mit einem beliebigen KI-Sprachtool erzeugte MP3),
   wenn der Code in codes-data.js ein "audio"-Feld hat.

   Fallback: falls kein "audio" hinterlegt ist, aber "speak: true"
   gesetzt ist, wird notfalls die (einfachere) Browser-Stimme
   genutzt - empfohlen ist aber immer eine eigene Audio-Datei.
------------------------------------------------------ */
function playCodeAudio(match) {
  if (match.audio) {
    const player = document.getElementById("code-audio-player");
    if (!player) return;

    player.src = match.audio;
    player.play().catch((err) => {
      console.warn("Audio konnte nicht abgespielt werden:", err);
    });
    return;
  }

  // Fallback ohne eigene Audio-Datei: einfache Browser-Sprachausgabe
  if (match.speak && "speechSynthesis" in window) {
    const text = match.speakText || match.message;
    const lang = typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE";

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}

async function checkCode() {
  const input = document.getElementById("code-input");
  const messageEl = document.getElementById("code-message");
  const imageEl = document.getElementById("code-image");

  if (!input || !messageEl) {
    console.error("Code-Eingabe: #code-input oder #code-message fehlt im HTML.");
    return;
  }

  if (typeof codes === "undefined") {
    console.error(
      "Code-Eingabe: 'codes' ist nicht definiert. Ist scripts/codes-data.js eingebunden und VOR main.js geladen?"
    );
    messageEl.textContent = typeof t === "function" ? t("code.notReady") : "⚠️ Code-System ist noch nicht bereit.";
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    return;
  }

  const now = Date.now();
  if (now < codeLockedUntil) {
    const waitSeconds = Math.ceil((codeLockedUntil - now) / 1000);
    messageEl.classList.remove("code-success");
    messageEl.classList.add("code-error");
    messageEl.textContent =
      typeof tFormat === "function"
        ? tFormat("code.tooManyAttempts", { seconds: waitSeconds })
        : `⏳ Zu viele Fehlversuche – warte noch ${waitSeconds} Sekunde(n).`;
    return;
  }

  const enteredCode = input.value.trim().toLowerCase();

  if (!enteredCode) {
    return;
  }

  const enteredHash = await sha256Hex(enteredCode);
  const match = codes.find((entry) => entry.hash === enteredHash);

  messageEl.classList.remove("code-success", "code-error");

  if (match) {
    codeWrongAttempts = 0;

    const codeId = match.hash;
    const alreadyCracked =
      typeof isCodeAlreadyCracked === "function" && isCodeAlreadyCracked(codeId);

    messageEl.classList.add("code-success");

    if (alreadyCracked) {
      messageEl.textContent = typeof t === "function" ? t("code.alreadyRedeemed") : "✅ Diesen Code hast du bereits eingelöst.";

      if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    } else if (match.currencyReward) {
      // Währungscodes (FIRE100/FIRE300/COINS300/BEUTEL25/KLEINERBEUTEL/...):
      // ERST die atomare, server-verifizierte Transaktion abwarten - NUR
      // bei bestätigtem Erfolg gilt der Code als eingelöst. Vorher wurde
      // hier sofort lokal "eingelöst" markiert UND unabhängig davon
      // versucht, Dublonen gutzuschreiben; schlug Letzteres fehl, zeigte
      // die Seite trotzdem Erfolg, aber es kamen nie Dublonen an und der
      // Code ließ sich nie wieder versuchen (siehe redeemCurrencyCode()
      // in wheel.js für die genaue Erklärung).
      if (typeof redeemCurrencyCode !== "function") {
        messageEl.classList.remove("code-success");
        messageEl.classList.add("code-error");
        messageEl.textContent = "⚠️ Code-System ist noch nicht bereit.";
        return;
      }

      let creditedAmount;
      try {
        creditedAmount = await redeemCurrencyCode(codeId, match.currencyReward, match.avatarUnlockSecure || null);
      } catch (err) {
        if (err.message === "already-redeemed") {
          if (typeof markCodeCrackedLocally === "function") {
            markCodeCrackedLocally(codeId, match.reward || null);
          }
          messageEl.textContent = typeof t === "function" ? t("code.alreadyRedeemed") : "✅ Diesen Code hast du bereits eingelöst.";
        } else {
          console.warn("Code konnte nicht eingelöst werden:", err);
          messageEl.classList.remove("code-success");
          messageEl.classList.add("code-error");
          messageEl.textContent = err.message === "wallet-full"
            ? "⚠️ Dein Dublonen-Konto hat bereits das Limit von 2.000.000 erreicht."
            : "⚠️ Das hat nicht geklappt, bitte versuch's gleich nochmal.";
        }
        return;
      }

      // Schreibvorgang bestätigt erfolgreich - jetzt erst lokal markieren
      // (das atomare Supabase-UPDATE hat codes_cracked bereits mit
      // erhöht, deshalb NUR die lokale Buchhaltung, nicht recordCodeCrack()
      // mit seinem eigenen, zusätzlichen Datenbank-Schreibvorgang).
      if (typeof markCodeCrackedLocally === "function") {
        markCodeCrackedLocally(codeId, match.reward || null);
      }

      messageEl.textContent = creditedAmount < match.currencyReward
        ? `${match.message} (Es wurden ${creditedAmount} Dublonen gutgeschrieben; das Kontolimit hat den Rest begrenzt.)`
        : match.message;

      if (typeof addCodeHistoryEntry === "function") {
        addCodeHistoryEntry(enteredCode, match.message);
      }

      if (typeof refreshShopCurrencyDisplay === "function") {
        refreshShopCurrencyDisplay();
      }
      if (typeof showCurrencyToast === "function") {
        showCurrencyToast(creditedAmount);
      }
      if (typeof triggerCodeSuccessEffect === "function") {
        triggerCodeSuccessEffect();
      }

      if (typeof awardActionXp === "function") awardActionXp("codeRedeemed");

      playCodeAudio(match);

      if (match.image && imageEl) {
        // Absicherung: laedt das Bild nicht (Datei fehlt, falscher Pfad,
        // kaputte Datei), soll KEIN zerbrochenes Bild-Symbol stehen
        // bleiben - dann bleibt nur die Nachricht. Genau das war bei
        // raetsel1.png der Fall, siehe Kommentar in codes-data.js.
        imageEl.onerror = () => {
          imageEl.classList.remove("visible");
          imageEl.removeAttribute("src");
          console.warn("Code-Bild konnte nicht geladen werden:", match.image);
        };
        imageEl.src = match.image;
        imageEl.classList.add("visible");
      } else if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    } else {
      messageEl.textContent = match.message;

      if (typeof addCodeHistoryEntry === "function") {
        addCodeHistoryEntry(enteredCode, match.message);
      }

      if (typeof recordCodeCrack === "function") {
        recordCodeCrack(codeId, match.reward || null, enteredCode);
      }

      if (match.avatarUnlock && typeof unlockAvatar === "function") {
        unlockAvatar(match.avatarUnlock);
      }

      if (typeof triggerCodeSuccessEffect === "function") {
        triggerCodeSuccessEffect();
      }

      /* Erst die regulaeren Code-Punkte, DANN der Bonus - und
         bewusst nacheinander (await), nicht nebeneinander. Beide
         lesen den Punktestand und schreiben ihn erhoeht zurueck;
         parallel gestartet laesen beide denselben alten Wert und
         der zweite ueberschriebe den ersten. Ausserdem deckelt die
         Datenbank jeden Schreibvorgang auf +500 - zusammen in einem
         Zug waeren es bei einem 500er-Code 515, und der GANZE
         Vorgang floege raus. Siehe awardCodePassXp(). */
      if (typeof awardActionXp === "function") await awardActionXp("codeRedeemed");
      /* Der Betrag kommt jetzt vom Server (19-xp-codes.sql).
         match.passXpReward ist nur noch zweierlei: der Text in der
         Nachricht, und der Rueckfall, falls die Migration fehlt.

         Keine Anzeige-Auffrischung noetig: die Passseite baut sich
         beim Hinnavigieren ohnehin neu auf, und der Spieler steht
         beim Einloesen auf der Code-Seite. */
      if (match.passXpReward && typeof redeemPassXpCode === "function") {
        const punkte = await redeemPassXpCode(enteredCode, match.passXpReward);
        /* Genau 0 heisst: der Server kennt den Code, dieses Konto
           hatte ihn aber schon. Das gehoert dazugesagt - sonst
           stuende da "+500 Pass-XP!" und angekommen waere nichts.
           null heisst "liess sich nicht entscheiden" (Rueckfall)
           und bleibt bewusst unkommentiert. */
        if (punkte === 0) {
          messageEl.textContent = match.message + " " +
            t("codes.xpSchonEingeloest", "(Diesen Code hattest du schon - die Punkte gibt es nur einmal.)");
        }
      }

      playCodeAudio(match);

      if (match.image && imageEl) {
        // Absicherung: laedt das Bild nicht (Datei fehlt, falscher Pfad,
        // kaputte Datei), soll KEIN zerbrochenes Bild-Symbol stehen
        // bleiben - dann bleibt nur die Nachricht. Genau das war bei
        // raetsel1.png der Fall, siehe Kommentar in codes-data.js.
        imageEl.onerror = () => {
          imageEl.classList.remove("visible");
          imageEl.removeAttribute("src");
          console.warn("Code-Bild konnte nicht geladen werden:", match.image);
        };
        imageEl.src = match.image;
        imageEl.classList.add("visible");
      } else if (imageEl) {
        imageEl.classList.remove("visible");
        imageEl.removeAttribute("src");
      }
    }
  } else {
    codeWrongAttempts++;

    if (codeWrongAttempts >= 5) {
      codeLockedUntil = Date.now() + 10000; // 10 Sekunden Pause
      codeWrongAttempts = 0;
    }

    messageEl.textContent =
      typeof codeNotFoundMessage !== "undefined"
        ? codeNotFoundMessage
        : typeof t === "function" ? t("code.invalid") : "Dieser Code ist ungültig.";
    messageEl.classList.add("code-error");

    if (imageEl) {
      imageEl.classList.remove("visible");
      imageEl.removeAttribute("src");
    }
  }

  input.value = "";
}

/* ------------------------------------------------------
   START
------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  changePage(FH_STARTSEITE);
});
