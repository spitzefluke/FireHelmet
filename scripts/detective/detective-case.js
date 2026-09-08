/* ======================================================
   "DER FALL DER VERSCHWUNDENEN DUBLONEN"
   ---------------------------------------------------
   Kleine, in sich geschlossene Krimi-/Detektiv-Mission. Reine
   Anzeige-/Interaktionslogik, keine Firestore/Supabase-Aufrufe -
   die eigentliche Belohnung (400 Dublonen + exklusiver Avatar) wird
   NICHT hier vergeben, sondern erst danach ueber das bestehende
   Code-System (scripts/codes/, checkCode() in main.js), sobald der
   Spieler den am Ende gezeigten Geheimcode dort einloest - siehe
   detective-case-data.js fuer den genauen Code und den Sicherheits-
   hinweis zur Taeter-Verschleierung.

   Lokaler Fortschritt (welche Hinweise schon untersucht wurden, ob
   der Fall schon geloest ist) liegt bewusst nur in localStorage,
   genau wie storyReadChapters/shipPuzzlesSolved an anderer Stelle -
   das hier ist ein Ratespiel ohne echten Vermoegenswert, der Wert
   entsteht erst beim spaeteren, serverseitig abgesicherten Code-
   Einloesen.
====================================================== */

let detectiveSelectedSuspectId = null;
let detectiveWrongGuessActive = false;

function getDetectiveRevealedClueIds() {
  try {
    return JSON.parse(localStorage.getItem("detectiveCaseRevealedClues") || "[]");
  } catch (err) {
    return [];
  }
}

function isDetectiveCaseSolved() {
  return localStorage.getItem("detectiveCaseSolved") === "1";
}

/* ------------------------------------------------------
   HINWEIS UNTERSUCHEN
------------------------------------------------------ */
function investigateDetectiveClue(clueId) {
  const revealed = getDetectiveRevealedClueIds();
  if (!revealed.includes(clueId)) {
    revealed.push(clueId);
    localStorage.setItem("detectiveCaseRevealedClues", JSON.stringify(revealed));
  }
  renderDetectiveCasePage();
}

/* ------------------------------------------------------
   VERDÄCHTIGEN AUSWÄHLEN
------------------------------------------------------ */
function selectDetectiveSuspect(suspectId) {
  detectiveSelectedSuspectId = suspectId;
  detectiveWrongGuessActive = false;

  document.querySelectorAll(".detective-suspect-card[data-suspect-id]").forEach((card) => {
    card.classList.toggle("detective-suspect-selected", card.dataset.suspectId === suspectId);
  });

  /* Diese Funktion baut die Seite bewusst NICHT neu auf - sonst
     liefen bei jedem Klick alle Einblend-Animationen von vorn los.
     Sie muss deshalb selbst nachziehen, was von der Auswahl
     abhaengt: welche Zettel hervorgehoben sind, und die Faeden.

     (Genau das war zuerst vergessen: die Faeden waren gebaut, wurden
      aber nie gezeichnet, weil nichts sie anstiess.) */
  document.querySelectorAll(".detective-clue-card[data-betrifft]").forEach((zettel) => {
    const betrifft = (zettel.getAttribute("data-betrifft") || "").split(" ").filter(Boolean);
    zettel.classList.toggle("ist-verbunden", betrifft.indexOf(suspectId) >= 0);
  });

  detectiveFaedenZeichnen();

  const btn = document.getElementById("detective-accuse-btn");
  if (btn) btn.disabled = false;

  const wrongBanner = document.getElementById("detective-wrong-guess");
  if (wrongBanner) wrongBanner.remove();
}

/* ------------------------------------------------------
   VERDÄCHTIGEN BESCHULDIGEN
   ---------------------------------------------------
   Vergleicht den SHA-256-Hash der ausgewaehlten Verdaechtigen-ID mit
   DETECTIVE_CASE_SOLUTION_HASH (sha256Hex() kommt aus main.js, exakt
   dieselbe Funktion, die auch das Code-System nutzt) - siehe
   Sicherheitshinweis in detective-case-data.js.
------------------------------------------------------ */
async function accuseDetectiveSuspect() {
  if (!detectiveSelectedSuspectId || typeof sha256Hex !== "function") return;

  const confirmMsg = typeof t === "function"
    ? t("detectiveCase.confirmAccuse", "Bist du dir sicher? Ein falscher Vorwurf könnte den wahren Täter warnen.")
    : "Bist du dir sicher? Ein falscher Vorwurf könnte den wahren Täter warnen.";
  if (!window.confirm(confirmMsg)) return;

  const guessHash = await sha256Hex(detectiveSelectedSuspectId);

  if (guessHash === DETECTIVE_CASE_SOLUTION_HASH) {
    localStorage.setItem("detectiveCaseSolved", "1");
    detectiveWrongGuessActive = false;
  } else {
    detectiveWrongGuessActive = true;
  }

  renderDetectiveCasePage();

  if (detectiveWrongGuessActive) {
    const banner = document.getElementById("detective-wrong-guess");
    if (banner) banner.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ------------------------------------------------------
   DARSTELLUNG
------------------------------------------------------ */
function safeDetectiveText(str) {
  return typeof escapeHtml === "function" ? escapeHtml(str || "") : (str || "");
}

function buildDetectiveSuspectCardHtml(suspect) {
  const isSelected = suspect.id === detectiveSelectedSuspectId;
  const character = suspect.characterId && typeof CHARACTER_DATABASE !== "undefined"
    ? CHARACTER_DATABASE[suspect.characterId]
    : null;

  const imageHtml = character && character.image
    ? `<img src="${character.image}" class="detective-suspect-image" alt="" loading="lazy" decoding="async">`
    : `<span class="detective-suspect-image detective-suspect-image-placeholder" aria-hidden="true">${suspect.emoji}</span>`;

  const name = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.name`) : suspect.id;
  const role = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.role`) : "";
  const statement = typeof t === "function" ? t(`detectiveCase.suspect.${suspect.key}.statement`) : "";

  /* Die eigene Einschaetzung steht als kleiner Reiter an der Karte.
     Sie sagt NICHTS ueber die Loesung - sie haelt nur fest, was man
     selbst schon ausgeschlossen hat. Bei vier Verdaechtigen und
     sechs Hinweisen verliert man das sonst leicht. */
  const notiz = detectiveNotiz(suspect.id);
  const notizText = notiz === "verdaechtig"
    ? (typeof t === "function" ? t("detectiveCase.noteSuspect", "verdächtig") : "verdächtig")
    : notiz === "entlastet"
      ? (typeof t === "function" ? t("detectiveCase.noteCleared", "entlastet") : "entlastet")
      : "";

  return `
    <div class="detective-suspect-halter" data-suspect-halter="${suspect.id}">
      <span class="detective-pinnnadel" aria-hidden="true"></span>
      <button type="button" class="detective-suspect-card${isSelected ? " detective-suspect-selected" : ""}${notiz ? " detective-notiz-" + notiz : ""}"
        data-suspect-id="${suspect.id}" onclick="selectDetectiveSuspect('${suspect.id}')">
        ${imageHtml}
        <span class="detective-suspect-name">${safeDetectiveText(name)}</span>
        <span class="detective-suspect-role">${safeDetectiveText(role)}</span>
        <span class="detective-suspect-statement">&bdquo;${safeDetectiveText(statement)}&ldquo;</span>
        ${notizText ? `<span class="detective-notiz-reiter">${notizText}</span>` : ""}
      </button>
      <div class="detective-notiz-wahl" role="group">
        <button type="button" class="detective-notiz-btn${notiz === "verdaechtig" ? " ist-an" : ""}"
                onclick="detectiveNotizSetzen('${suspect.id}','verdaechtig')"
                title="${typeof t === "function" ? t("detectiveCase.noteSuspect", "verdächtig") : "verdächtig"}">✗</button>
        <button type="button" class="detective-notiz-btn${notiz === "entlastet" ? " ist-an" : ""}"
                onclick="detectiveNotizSetzen('${suspect.id}','entlastet')"
                title="${typeof t === "function" ? t("detectiveCase.noteCleared", "entlastet") : "entlastet"}">✓</button>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------
   EIGENE EINSCHAETZUNG
   ---------------------------------------------------
   Rein im Browser. Sie hat auf die Loesung keinen Einfluss und wird
   nirgends geprueft - sie ist ein Notizzettel, kein Spielzug.
   Deshalb auch kein Server: es gibt nichts abzusichern.
------------------------------------------------------ */
const DETECTIVE_NOTIZ_SCHLUESSEL = "detectiveNotizen";

function detectiveNotizen() {
  try { return JSON.parse(localStorage.getItem(DETECTIVE_NOTIZ_SCHLUESSEL) || "{}") || {}; }
  catch (err) { return {}; }
}

function detectiveNotiz(id) {
  const n = detectiveNotizen();
  return n[id] || "";
}

function detectiveNotizSetzen(id, wert) {
  const n = detectiveNotizen();
  // Nochmal dasselbe druecken hebt die Markierung wieder auf.
  if (n[id] === wert) delete n[id];
  else n[id] = wert;
  try { localStorage.setItem(DETECTIVE_NOTIZ_SCHLUESSEL, JSON.stringify(n)); }
  catch (err) { /* egal - dann eben nur fuer diesen Besuch */ }
  renderDetectiveCasePage();
}

function buildDetectiveClueCardHtml(clue) {
  const revealed = getDetectiveRevealedClueIds().includes(clue.id);
  const title = typeof t === "function" ? t(`detectiveCase.clue.${clue.key}.title`) : clue.id;

  if (!revealed) {
    const cta = typeof t === "function" ? t("detectiveCase.investigateCta", "🔍 Untersuchen") : "🔍 Untersuchen";
    return `
      <button type="button" class="detective-clue-card detective-clue-locked" onclick="investigateDetectiveClue('${clue.id}')">
        <span class="detective-clue-icon" aria-hidden="true">${clue.icon}</span>
        <span class="detective-clue-title">${safeDetectiveText(title)}</span>
        <span class="detective-clue-cta">${cta}</span>
      </button>
    `;
  }

  const text = typeof t === "function" ? t(`detectiveCase.clue.${clue.key}.text`) : "";

  /* Betrifft der Zettel den gerade gewaehlten Verdaechtigen? Dann
     ist er angehoben und traegt am Rand, WAS er ueber ihn sagt.
     Genau diese Zuordnung ziehen auch die roten Faeden nach.

     Der Bezugstext steht IMMER im Markup, sichtbar macht ihn erst
     die Klasse .ist-verbunden. Grund: das Auswaehlen eines
     Verdaechtigen baut die Seite absichtlich NICHT neu auf (sonst
     liefen bei jedem Klick saemtliche Einblend-Animationen von vorn
     los). Es schaltet nur Klassen um - dafuer muss der Text schon
     dastehen. */
  const betrifft = Array.isArray(clue.betrifft) ? clue.betrifft : [];
  const trifft = detectiveSelectedSuspectId && betrifft.indexOf(detectiveSelectedSuspectId) >= 0;
  const bezug = clue.art
    ? (typeof t === "function" ? t("detectiveCase.clueRelation." + clue.art, "") : "")
    : "";

  return `
    <div class="detective-clue-card detective-clue-revealed${trifft ? " ist-verbunden" : ""}${clue.art ? " detective-clue-" + clue.art : ""}"
         data-clue-id="${clue.id}" data-betrifft="${betrifft.join(" ")}">
      <span class="detective-pinnnadel" aria-hidden="true"></span>
      <span class="detective-clue-icon" aria-hidden="true">${clue.icon}</span>
      <span class="detective-clue-title">${safeDetectiveText(title)}</span>
      <p class="detective-clue-text">${safeDetectiveText(text)}</p>
      ${bezug ? `<span class="detective-clue-bezug">${safeDetectiveText(bezug)}</span>` : ""}
    </div>
  `;
}

/* ======================================================
   DER ZEITSTRAHL DER TATNACHT
   ---------------------------------------------------
   Der Widerspruch des Falls liegt in den Uhrzeiten - er stand aber
   nur in vier Absaetzen verteilt, die man im Kopf uebereinanderlegen
   musste. Nebeneinander auf einer Achse sieht man ihn.

   Es erscheint nur, was schon untersucht ist: der Zeitstrahl fuellt
   sich mit der Ermittlung, statt die Loesung von Anfang an
   hinzulegen.
====================================================== */
function detectiveZeit(minuten) {
  const h = 22 + Math.floor(minuten / 60);
  const m = minuten % 60;
  return String(h % 24).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function buildDetectiveZeitstrahlHtml() {
  if (typeof DETECTIVE_ZEITSTRAHL === "undefined") return "";

  const offen = getDetectiveRevealedClueIds();
  const sichtbar = DETECTIVE_ZEITSTRAHL.filter(
    (e) => e.aus === "immer" || offen.indexOf(e.aus) >= 0);

  const von = DETECTIVE_ZEITSTRAHL_VON;
  const spanne = DETECTIVE_ZEITSTRAHL_BIS - von;
  const pos = (m) => (((m - von) / spanne) * 100).toFixed(2) + "%";
  const txt = (k, f) => (typeof t === "function" ? t("detectiveCase.zeit." + k, f) : f);

  const balken = sichtbar.filter((e) => e.art === "balken");
  const punkte = sichtbar.filter((e) => e.art === "punkt");

  /* Stundenraster: 22, 23, 00. Mehr Striche wuerden bei zwei Stunden
     nur die Balken zerschneiden. */
  const raster = [0, 60, 120].map((m) =>
    `<div class="detective-zeit-marke" style="left:${pos(m)}">` +
    `<span>${detectiveZeit(m)}</span></div>`).join("");

  const zeilen = balken.map(function (b) {
    return `<div class="detective-zeit-zeile">
      <span class="detective-zeit-name">${safeDetectiveText(txt(b.key, b.key))}</span>
      <div class="detective-zeit-bahn">
        <div class="detective-zeit-balken${b.bestaetigt ? " ist-bestaetigt" : " ist-unbestaetigt"}"
             style="left:${pos(b.von)};width:calc(${pos(b.bis)} - ${pos(b.von)})"></div>
      </div>
    </div>`;
  }).join("");

  /* JEDES EREIGNIS BEKOMMT EINE EIGENE ZEILE.
     Zuerst standen sie als Faehnchen nebeneinander auf einer
     gemeinsamen Achse, auf drei Hoehen verteilt. Das ging nicht auf:
     die vier entscheidenden Ereignisse liegen zwischen 23:10 und
     23:13, also in drei Minuten - bei zwei Stunden Gesamtbreite sind
     das gut zwei Prozent. Die Beschriftungen lagen uebereinander,
     ausgerechnet an der Stelle, auf die es ankommt.

     Als Zeilen im selben Raster wie die Balken fluchten sie senkrecht
     mit ihnen. Man kann jetzt eine Uhrzeit heruntergehen und
     ablesen, wer zu diesem Zeitpunkt wo war - genau das ist die
     Frage des Falls. */
  const ereignisZeilen = punkte
    .slice()
    .sort((a, b) => a.zeit - b.zeit)
    .map(function (p) {
      return `<div class="detective-zeit-zeile detective-zeit-ereignis detective-zeit-punkt-${p.gewicht}">
        <span class="detective-zeit-name">
          <span class="detective-zeit-uhr">${detectiveZeit(p.zeit)}</span>
          ${safeDetectiveText(txt(p.key, p.key))}
        </span>
        <div class="detective-zeit-bahn detective-zeit-bahn-duenn">
          <span class="detective-zeit-marker" style="left:${pos(p.zeit)}"></span>
        </div>
      </div>`;
    }).join("");

  const leer = !zeilen && !ereignisZeilen;

  return `
    <h2 class="detective-section-heading" data-i18n="detectiveCase.timelineHeading">🕰️ Die Tatnacht</h2>
    <p class="detective-zeit-hinweis" data-i18n="detectiveCase.timelineHint">Jeder untersuchte Hinweis trägt hier etwas ein. Wer sich selbst widerspricht, fällt auf.</p>
    <div class="detective-zeitstrahl">
      <div class="detective-zeit-raster">${raster}</div>
      ${zeilen}
      ${ereignisZeilen ? `<div class="detective-zeit-trenner"></div>${ereignisZeilen}` : ""}
      ${leer ? `<p class="detective-zeit-leer" data-i18n="detectiveCase.timelineEmpty">Noch nichts eingetragen. Untersuche die Hinweise.</p>` : ""}
    </div>
  `;
}

function buildDetectiveWrongGuessHtml() {
  return `
    <div id="detective-wrong-guess" class="detective-wrong-guess">
      <p class="detective-wrong-guess-title" data-i18n="detectiveCase.wrong.title">❌ Falsche Spur.</p>
      <p data-i18n="detectiveCase.wrong.text">Deine Beweise reichen nicht aus. Der wahre Täter ist noch an Bord.</p>
      <p class="detective-wrong-guess-hint" data-i18n="detectiveCase.wrong.hint">Vielleicht solltest du die Aussagen noch einmal miteinander vergleichen.</p>
    </div>
  `;
}

function buildDetectiveSolvedHtml() {
  return `
    <div class="detective-solved">
      <p class="detective-solved-reveal" data-i18n="detectiveCase.solved.reveal">🕵️ FALL GELÖST!</p>
      <p data-i18n="detectiveCase.solved.revealLine1">Du hast den Täter entlarvt.</p>
      <p data-i18n="detectiveCase.solved.revealLine2">Die 400 verschwundenen Dublonen wurden gefunden.</p>

      <h2 class="detective-solved-heading" data-i18n="detectiveCase.solved.heading">🏆 DER FALL IST GELÖST</h2>
      <p data-i18n="detectiveCase.solved.crewLine">Die Crew kann aufatmen.</p>

      <h3 data-i18n="detectiveCase.solved.rewardHeading">DEINE BELOHNUNG</h3>
      <ul class="detective-reward-list">
        <li>💰 <span data-i18n="detectiveCase.solved.rewardCurrency">400 Dublonen</span></li>
        <li>🕵️ <span data-i18n="detectiveCase.solved.rewardAvatar">Exklusiver Avatar: Meisterdetektiv</span></li>
      </ul>

      <p data-i18n="detectiveCase.solved.codeUnlocked">Dein Geheimcode wurde freigeschaltet.</p>
      <p class="detective-secret-code">${DETECTIVE_CASE_SECRET_CODE}</p>

      <button type="button" class="code-button" onclick="changePage('code')" data-i18n="detectiveCase.solved.redeemButton">🔑 CODE EINLÖSEN</button>
    </div>
  `;
}

function renderDetectiveCasePage() {
  const container = document.getElementById("detective-case-content");
  if (!container || typeof DETECTIVE_CASE_SUSPECTS === "undefined") return;

  if (isDetectiveCaseSolved()) {
    container.innerHTML = buildDetectiveSolvedHtml();
    if (typeof applyTranslations === "function") applyTranslations();
    return;
  }

  const suspectsHtml = DETECTIVE_CASE_SUSPECTS.map(buildDetectiveSuspectCardHtml).join("");
  const cluesHtml = DETECTIVE_CASE_CLUES.map(buildDetectiveClueCardHtml).join("");
  const accuseDisabled = detectiveSelectedSuspectId ? "" : "disabled";

  /* ERMITTLUNGSTAFEL STATT KARTENRASTER
     Verdaechtige und Hinweise haengen jetzt auf EINEM Korkbrett -
     vorher waren es zwei getrennte Raster untereinander, und die
     Verbindung zwischen einer Aussage und dem Zettel, der sie
     widerlegt, musste man sich denken. Die roten Faeden ziehen sie
     nach (detectiveFaedenZeichnen). */
  container.innerHTML = `
    <p class="detective-story" data-i18n="detectiveCase.story">
      In der Nacht wurde die Schatzkammer zuletzt um 23:10 Uhr geöffnet - danach war das Gold weg. Vier Crewmitglieder waren zur Tatzeit an Bord. Einer von ihnen lügt. Untersuche die Hinweise, vergleiche die Aussagen - und finde heraus, wer wirklich hinter dem Diebstahl steckt.
    </p>

    ${buildDetectiveZeitstrahlHtml()}

    <h2 class="detective-section-heading" data-i18n="detectiveCase.boardHeading">📌 Ermittlungstafel</h2>
    <p class="detective-tafel-hinweis" data-i18n="detectiveCase.threadHint">Wähle einen Verdächtigen - die Fäden zeigen, was über ihn bekannt ist.</p>
    <div class="detective-tafel" id="detective-tafel">
      <!-- Die Faeden liegen UNTER den Zetteln: sie sollen die
           Verbindung zeigen, nicht den Text ueberdecken. -->
      <svg class="detective-faeden" id="detective-faeden" aria-hidden="true"></svg>

      <div class="detective-suspects-grid">${suspectsHtml}</div>

      <h3 class="detective-tafel-untertitel" data-i18n="detectiveCase.cluesHeading">🔎 Hinweise</h3>
      <div class="detective-clues-grid">${cluesHtml}</div>
    </div>

    ${detectiveWrongGuessActive ? buildDetectiveWrongGuessHtml() : ""}

    <div class="detective-accuse-box">
      <button type="button" id="detective-accuse-btn" class="code-button detective-accuse-btn" ${accuseDisabled} onclick="accuseDetectiveSuspect()" data-i18n="detectiveCase.accuseButton">🔎 VERDÄCHTIGEN BESCHULDIGEN</button>
    </div>
  `;

  if (typeof applyTranslations === "function") applyTranslations();

  /* Erst nach dem Umbruch: vorher stehen die Elemente noch nicht an
     ihrem Platz, und die Faeden liefen ins Leere. */
  requestAnimationFrame(detectiveFaedenZeichnen);
}

/* ------------------------------------------------------
   DIE ROTEN FAEDEN
   ---------------------------------------------------
   Vom gewaehlten Verdaechtigen zu jedem Zettel, der etwas ueber ihn
   sagt. Gezeichnet wird erst nach dem Umbruch aus den tatsaechlichen
   Positionen - fest eingetragene Koordinaten waeren bei jeder
   Fensterbreite falsch.

   Die Faeden haengen leicht durch (quadratische Kurve mit
   Stuetzpunkt unterhalb der Verbindungslinie). Eine gerade Linie
   sieht nach Diagramm aus, ein durchhaengender Faden nach Schnur.
------------------------------------------------------ */
function detectiveFaedenZeichnen() {
  const svg = document.getElementById("detective-faeden");
  const tafel = document.getElementById("detective-tafel");
  if (!svg || !tafel) return;

  const t0 = tafel.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.round(t0.width)} ${Math.round(t0.height)}`);
  svg.setAttribute("width", Math.round(t0.width));
  svg.setAttribute("height", Math.round(t0.height));

  if (!detectiveSelectedSuspectId || typeof DETECTIVE_CASE_CLUES === "undefined") {
    svg.innerHTML = "";
    return;
  }

  const karte = tafel.querySelector(`[data-suspect-halter="${detectiveSelectedSuspectId}"]`);
  if (!karte) { svg.innerHTML = ""; return; }

  const k = karte.getBoundingClientRect();
  const von = { x: k.left - t0.left + k.width / 2, y: k.bottom - t0.top - 6 };

  const offen = getDetectiveRevealedClueIds();
  const pfade = [];

  DETECTIVE_CASE_CLUES.forEach(function (clue) {
    if (offen.indexOf(clue.id) < 0) return;
    const betrifft = Array.isArray(clue.betrifft) ? clue.betrifft : [];
    if (betrifft.indexOf(detectiveSelectedSuspectId) < 0) return;

    const zettel = tafel.querySelector(`[data-clue-id="${clue.id}"]`);
    if (!zettel) return;
    const z = zettel.getBoundingClientRect();
    const nach = { x: z.left - t0.left + z.width / 2, y: z.top - t0.top + 8 };

    // Durchhang: ein Zehntel des Abstands, mindestens 14 Bildpunkte.
    const durchhang = Math.max(14, Math.hypot(nach.x - von.x, nach.y - von.y) * 0.1);
    const mx = (von.x + nach.x) / 2;
    const my = (von.y + nach.y) / 2 + durchhang;

    pfade.push(
      `<path class="detective-faden detective-faden-${clue.art || "neutral"}" ` +
      `d="M${von.x.toFixed(1)},${von.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ` +
      `${nach.x.toFixed(1)},${nach.y.toFixed(1)}"/>` +
      `<circle class="detective-faden-nadel" cx="${nach.x.toFixed(1)}" cy="${nach.y.toFixed(1)}" r="3.5"/>`);
  });

  svg.innerHTML = pfade.join("") +
    `<circle class="detective-faden-nadel" cx="${von.x.toFixed(1)}" cy="${von.y.toFixed(1)}" r="4"/>`;
}

/* Bei jeder Breitenaenderung neu ziehen - die Zettel rutschen dann
   in eine andere Zeile, und alte Faeden zeigten ins Nichts. */
window.addEventListener("resize", function () {
  if (document.getElementById("detective-faeden")) detectiveFaedenZeichnen();
});

function updateDetectiveCasePage(pageID) {
  if (pageID !== "detective-case") return;

  detectiveSelectedSuspectId = null;
  detectiveWrongGuessActive = false;

  renderDetectiveCasePage();
}
