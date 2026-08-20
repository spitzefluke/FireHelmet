/* ======================================================
   WOCHENRENNEN
   - Jede Woche (Montag bis Sonntag) läuft ein eigenes Rennen
   - Fortschritt kommt automatisch durch Schatzrad-Drehungen
     (wheel.js -> finalizeSpin) und neu geknackte Codes
     (wheel.js -> recordCodeCrack)
   - Am Ende der Woche steht der Spieler mit dem meisten
     Fortschritt als Sieger fest - die neue Woche startet
     automatisch bei 0, ganz ohne Reset-Aktion nötig, weil
     jede Woche ihre eigene Kennung (z.B. "2026-W29") bekommt
   - Einstellungen: scripts/race-data.js
====================================================== */

let raceCountdownInterval = null;

/* ------------------------------------------------------
   WOCHEN-KENNUNG (ISO-Woche, z.B. "2026-W29")
------------------------------------------------------ */
function getISOWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3);

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const weekNum = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Dublonen-Belohnung für Platz 1/2/3 beim Wochenrennen - wird
// sowohl für die tatsächliche Vergabe als auch für die Anzeige
// in der Ergebnisliste genutzt
const RACE_REWARDS_BY_RANK = [150, 90, 50];

function getCurrentWeekId() {
  return getISOWeekId(new Date());
}

function getPreviousWeekId() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getISOWeekId(d);
}

/* ------------------------------------------------------
   WÖCHENTLICHE STRECKEN-AUSWAHL
   Reihum nach Wochennummer - für alle Besucher gleich,
   da rein aus der Wochen-Kennung berechnet (kein Zufall).
------------------------------------------------------ */
function getWeeklyTrack() {
  if (typeof raceTracks === "undefined" || raceTracks.length === 0) return null;

  const weekId = getCurrentWeekId();
  const match = weekId.match(/W(\d+)/);
  const weekNum = match ? parseInt(match[1], 10) : 1;

  return raceTracks[weekNum % raceTracks.length];
}

let raceBuiltForWeek = null;

function buildRaceTrack() {
  const track = getWeeklyTrack();
  if (!track) return;

  const currentWeek = getCurrentWeekId();
  if (raceBuiltForWeek === currentWeek) return; // schon für diese Woche gebaut

  const grassEl = document.getElementById("race-grass");
  const curbEl = document.getElementById("race-curb");
  const trackPathEl = document.getElementById("race-track-path");
  const roadInnerEl = document.getElementById("race-road-inner");
  const centerLineEl = document.getElementById("race-center-line");
  const themeEl = document.getElementById("race-track-theme");

  if (grassEl) grassEl.setAttribute("fill", track.grass);
  if (curbEl) {
    curbEl.setAttribute("d", track.path);
    curbEl.setAttribute("stroke", track.curb);
  }
  if (trackPathEl) {
    trackPathEl.setAttribute("d", track.path);
    trackPathEl.setAttribute("stroke", track.roadOuter);
  }
  if (roadInnerEl) {
    roadInnerEl.setAttribute("d", track.path);
    roadInnerEl.setAttribute("stroke", track.roadInner);
  }
  if (centerLineEl) centerLineEl.setAttribute("d", track.path);
  if (themeEl) themeEl.textContent = `Diese Woche: ${track.emoji} ${track.name}`;

  // Bereits gezeichnete Karts/Boote/Flugzeuge entfernen, damit sie beim
  // nächsten Positionieren mit dem NEUEN Fahrzeugtyp neu erstellt werden
  const kartsLayer = document.getElementById("race-karts-layer");
  if (kartsLayer) kartsLayer.innerHTML = "";
  raceKartElements = {};

  // Streckenlänge neu berechnen, da sich der Pfad geändert hat
  raceTrackLength = null;
  raceBuiltForWeek = currentWeek;
}

/* ------------------------------------------------------
   COUNTDOWN BIS ZUM WOCHENENDE (Montag 00:00)
------------------------------------------------------ */
function getMsUntilNextMonday() {
  const now = new Date();
  const dayNum = (now.getDay() + 6) % 7; // Montag = 0 ... Sonntag = 6
  const daysUntilMonday = 7 - dayNum;

  const nextMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    0, 0, 0, 0
  );

  return nextMonday - now;
}

function stopRaceCountdown() {
  clearInterval(raceCountdownInterval);
  raceCountdownInterval = null;
}

function startRaceCountdown() {
  const el = document.getElementById("race-countdown");
  if (!el) return;

  stopRaceCountdown();

  function tick() {
    const msLeft = getMsUntilNextMonday();

    if (msLeft <= 0) {
      // Neue Woche hat begonnen - Ansicht neu laden
      loadRaceLeaderboard();
      loadLastWeekWinner();
      return;
    }

    const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    el.textContent = `⏳ Noch ${days}T ${String(hours).padStart(2, "0")}Std ${String(minutes).padStart(2, "0")}Min bis Rennende`;
  }

  tick();
  raceCountdownInterval = setInterval(tick, 30000);
}

/* ------------------------------------------------------
   FORTSCHRITT HINZUFÜGEN
   Wird von wheel.js aufgerufen (Drehung / neuer Code)
------------------------------------------------------ */
function getLocalRaceProgress() {
  const currentWeek = getCurrentWeekId();
  const storedWeek = localStorage.getItem("raceWeek");

  if (storedWeek !== currentWeek) {
    // Neue Woche -> lokaler Fortschritt beginnt wieder bei 0
    localStorage.setItem("raceWeek", currentWeek);
    localStorage.setItem("raceProgress", "0");
    return 0;
  }

  return parseInt(localStorage.getItem("raceProgress") || "0", 10);
}

function addRaceProgress(amount) {
  const currentWeek = getCurrentWeekId();
  const newProgress = getLocalRaceProgress() + amount;

  localStorage.setItem("raceWeek", currentWeek);
  localStorage.setItem("raceProgress", String(newProgress));

  const nickname = localStorage.getItem("wheelNickname") || "";
  if (!nickname || !wheelDb) return;

  wheelAuthReady.then((uid) => {
    if (!uid) return;

    wheelDb
      .collection("raceProgress")
      .doc(`${currentWeek}_${uid}`)
      .set(
        {
          week: currentWeek,
          uid: uid,
          nickname: nickname,
          progress: newProgress,
          equippedFrame: localStorage.getItem("equippedFrame") || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch((err) => {
        console.error("Rennfortschritt konnte nicht gespeichert werden:", err);
      });
  });

  refreshOwnRaceProgress();
  // Live-Rangliste nachladen, falls die Rennseite gerade offen ist
  loadRaceLeaderboard();
}

/* ------------------------------------------------------
   EIGENEN FORTSCHRITT ANZEIGEN
------------------------------------------------------ */
function refreshOwnRaceProgress() {
  const el = document.getElementById("race-own-progress");
  if (!el) return;

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname) {
    el.textContent = "Trag im 🧭 Schatzrad zuerst deinen Namen ein, um mitzufahren.";
    return;
  }

  const progress = getLocalRaceProgress();
  el.textContent = `Dein Fortschritt diese Woche: ${progress} Punkte`;
}

/* ------------------------------------------------------
   RENNSTRECKE ZEICHNEN
   Die Karts fahren entlang eines SVG-Pfads (ovale Strecke)
   und richten sich dabei automatisch in Fahrtrichtung aus.
   Jeder Spieler bekommt ein festes Kart-Element, das bei
   jeder Aktualisierung sanft an die neue Position gleitet,
   statt zu "springen".
------------------------------------------------------ */
const raceKartGradients = ["kart-grad-0", "kart-grad-1", "kart-grad-2", "kart-grad-3", "kart-grad-4", "kart-grad-5", "kart-grad-6", "kart-grad-7"];
let raceKartElements = {};
let raceTrackLength = null;
let raceTrailInterval = null;
let raceLeaderUid = null;

function getRaceTrackLength() {
  if (raceTrackLength) return raceTrackLength;

  const pathEl = document.getElementById("race-track-path");
  if (!pathEl) return 0;

  // Der Pfad bekommt sein "d"-Attribut erst durch buildRaceTrack() -
  // ist das noch nicht geschehen (siehe Kommentar in
  // loadRaceLeaderboard() fuer den genauen Ablauf, der das
  // urspruenglich verursacht hat), wirft getTotalLength() einen
  // InvalidStateError ("path is empty") statt einfach 0
  // zurueckzugeben. Einmal abgefangen, statt den kompletten
  // restlichen Rangliste-Render abzubrechen.
  try {
    const length = pathEl.getTotalLength();
    if (!length) return 0;
    raceTrackLength = length;
    return raceTrackLength;
  } catch (err) {
    return 0;
  }
}

const kartMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="10" rx="13" ry="4"></ellipse>

      <!-- Reifen: dickere, realistische 3D-Räder mit Felge -->
      <g class="kart-wheel-group" transform="translate(-7,-7.5)">
        <circle class="kart-tire" r="3"></circle>
        <circle class="kart-rim" r="1.5"></circle>
        <rect class="kart-spoke" x="-1.5" y="-.4" width="3" height=".8"></rect>
        <rect class="kart-spoke" x="-.4" y="-1.5" width=".8" height="3"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(-7,7.5)">
        <circle class="kart-tire" r="3"></circle>
        <circle class="kart-rim" r="1.5"></circle>
        <rect class="kart-spoke" x="-1.5" y="-.4" width="3" height=".8"></rect>
        <rect class="kart-spoke" x="-.4" y="-1.5" width=".8" height="3"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(6.5,-7.5)">
        <circle class="kart-tire" r="2.7"></circle>
        <circle class="kart-rim" r="1.3"></circle>
        <rect class="kart-spoke" x="-1.3" y="-.35" width="2.6" height=".7"></rect>
        <rect class="kart-spoke" x="-.35" y="-1.3" width=".7" height="2.6"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(6.5,7.5)">
        <circle class="kart-tire" r="2.7"></circle>
        <circle class="kart-rim" r="1.3"></circle>
        <rect class="kart-spoke" x="-1.3" y="-.35" width="2.6" height=".7"></rect>
        <rect class="kart-spoke" x="-.35" y="-1.3" width=".7" height="2.6"></rect>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".4s" repeatCount="indefinite"></animateTransform>
      </g>

      <!-- Spoiler am Heck, mit Tragflächen-Profil -->
      <rect class="kart-spoiler-post" x="-11.5" y="-3" width="1.8" height="6"></rect>
      <rect class="kart-spoiler-post" x="-11.5" y="-3" width="1.8" height="1.2" opacity=".5"></rect>
      <rect class="kart-spoiler" x="-13.5" y="-5.8" width="3" height="11.6" rx="1.2"></rect>
      <rect class="kart-spoiler-shine" x="-13.5" y="-5.8" width="3" height="2.4" rx="1"></rect>

      <!-- Unterboden-Schatten für mehr Tiefe -->
      <rect class="kart-underbody" x="-9.5" y="1" width="18" height="4" rx="2"></rect>

      <!-- Karosserie mit Rundungen + Glanzlicht + Seitenkasten -->
      <rect class="kart-body" x="-9.5" y="-6.8" width="19" height="13.6" rx="4.5"></rect>
      <path class="kart-side-shade" d="M-9.5,3 Q0,5.5 9.5,3 L9.5,6.8 Q0,7.8 -9.5,6.8 Z"></path>
      <rect class="kart-stripe" x="-9.5" y="-2.2" width="19" height="4.4"></rect>
      <path class="kart-gloss" d="M-7.5,-6.2 Q0,-8.5 7.5,-6.2 L6.2,-4.4 Q0,-6.5 -6.2,-4.4 Z"></path>

      <!-- Cockpit: Scheibe + Helm mit Visier -->
      <path class="kart-windshield" d="M-4,-4.2 Q-1,-6.5 3,-5 L2,-1.5 L-3.5,-1.5 Z"></path>
      <circle class="kart-helmet" cx="-1.5" cy="0" r="3.2"></circle>
      <path class="kart-visor" d="M-3.6,-1 Q-1.5,-2.6 0.8,-1.2 L0.2,1 Q-1.7,1.9 -3.2,0.6 Z"></path>

      <text class="kart-number" x="-1" y="1.8" text-anchor="middle"></text>

      <!-- Nase + Frontflügel + Scheinwerfer -->
      <polygon class="kart-nose" points="9.5,-3.8 15.5,0 9.5,3.8"></polygon>
      <rect class="kart-front-wing" x="9" y="4" width="6" height="1.4" rx=".6"></rect>
      <circle class="kart-headlight" cx="12" cy="-1.4" r=".9"></circle>
    </g>
  `;

const boatMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="9" rx="13" ry="3.5"></ellipse>
      <!-- Rumpf mit Tiefen-Schattierung -->
      <path class="kart-body" d="M-11,3 L11,3 L8,9 Q0,11 -8,9 Z"></path>
      <path class="kart-side-shade" d="M-8,6 L8,6 L7,9 Q0,10.3 -7,9 Z"></path>
      <path class="kart-gloss" d="M-9,3 L9,3 L7,5 L-7,5 Z"></path>
      <!-- Mast -->
      <line class="boat-mast" x1="-2" y1="3" x2="-2" y2="-16" stroke="#4a3420" stroke-width="1.4"></line>
      <!-- Großsegel mit Wölbung für 3D-Wirkung -->
      <path class="kart-stripe boat-sail" d="M-2,-15 Q6,-8 9,2 L-2,2 Z"></path>
      <path class="kart-gloss" d="M-2,-15 Q3,-8 4,0 L-2,0 Z" opacity=".4"></path>
      <!-- Vorsegel -->
      <path class="boat-sail-front" d="M-2,-9 L-9,2 L-2,2 Z"></path>
      <text class="kart-number" x="-2" y="7.5" text-anchor="middle"></text>
      <polygon class="kart-nose" points="11,4 15,6 11,8"></polygon>
    </g>
  `;

const planeMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="12" rx="10" ry="3" opacity=".25"></ellipse>
      <!-- Tragflächen mit Schattierung -->
      <polygon class="plane-wing" points="-2,-2 -8,-13 -1,-3"></polygon>
      <polygon class="plane-wing-shade" points="-2,-2 -6,-10 -1.5,-3"></polygon>
      <polygon class="plane-wing" points="-2,2 -8,13 -1,3"></polygon>
      <polygon class="plane-wing-shade" points="-2,2 -6,10 -1.5,3"></polygon>
      <!-- Leitwerk -->
      <polygon class="plane-tail" points="-9,-1.5 -14,-7 -8,-1"></polygon>
      <polygon class="plane-tail" points="-9,1.5 -14,7 -8,1"></polygon>
      <!-- Rumpf -->
      <path class="kart-body" d="M-9,-2.2 L7,-2.2 Q11,-2.2 11,0 Q11,2.2 7,2.2 L-9,2.2 Q-11,0 -9,-2.2 Z"></path>
      <path class="kart-gloss" d="M-8,-1.6 L6,-1.6 L6,-.6 L-8,-.6 Z"></path>
      <ellipse class="kart-windshield" cx="5" cy="0" rx="2.4" ry="1.6"></ellipse>
      <text class="kart-number" x="0" y="1" text-anchor="middle"></text>
      <polygon class="kart-nose" points="11,0 15,0 11,-1.4"></polygon>
    </g>
  `;

function createKartElement(uid) {
  const svgNS = "http://www.w3.org/2000/svg";
  const kart = document.createElementNS(svgNS, "g");
  kart.setAttribute("class", "race-kart");

  const track = getWeeklyTrack();
  const vehicle = track ? track.vehicle : "car";
  const bodyMarkup = vehicle === "boat" ? boatMarkup : vehicle === "plane" ? planeMarkup : kartMarkup;

  // Krone ist Teil von .kart-inner, damit sie WIRKLICH fest am Fahrzeug
  // "verschweißt" ist - sie bewegt, dreht und bobt exakt mit dem Auto mit,
  // statt separat zu schweben.
  kart.innerHTML = `<text class="kart-label" y="-16" text-anchor="middle"></text>${bodyMarkup}`;
  const innerGroup = kart.querySelector(".kart-inner");
  if (innerGroup) {
    const crown = document.createElementNS(svgNS, "text");
    crown.setAttribute("class", "kart-crown");
    crown.setAttribute("x", "-1.5");
    crown.setAttribute("y", "-9.5");
    crown.setAttribute("text-anchor", "middle");
    crown.textContent = "👑";
    innerGroup.appendChild(crown);
  }

  document.getElementById("race-karts-layer").appendChild(kart);
  return kart;
}

function positionKart(uid, percent, nickname, colorIndex) {
  const pathEl = document.getElementById("race-track-path");
  if (!pathEl) return;

  const length = getRaceTrackLength();
  // Strecke wurde noch nicht gezeichnet (siehe buildRaceTrack() bzw.
  // der Aufruf-Absicherung in loadRaceLeaderboard() weiter unten) -
  // dann gibt es aktuell nichts Sinnvolles zu positionieren. Einzelne
  // Karts hier zu ueberspringen ist besser als die komplette
  // forEach-Schleife in renderRaceTrack() per Exception abzubrechen
  // (das wuerde ALLE nachfolgenden Karts unpositioniert lassen).
  if (!length) return;
  const clamped = Math.max(0, Math.min(1, percent));
  const point = pathEl.getPointAtLength(clamped * length);
  const lookAhead = pathEl.getPointAtLength(Math.min(length, clamped * length + 2));
  const angle = Math.atan2(lookAhead.y - point.y, lookAhead.x - point.x) * (180 / Math.PI);

  let kart = raceKartElements[uid];
  if (!kart) {
    kart = createKartElement(uid);
    raceKartElements[uid] = kart;
  }

  kart.querySelector(".kart-body").setAttribute("fill", `url(#${raceKartGradients[colorIndex % raceKartGradients.length]})`);
  kart.querySelector(".kart-label").textContent = nickname;
  kart.querySelector(".kart-number").textContent = colorIndex + 1;
  kart.style.transform = `translate(${point.x}px, ${point.y}px) rotate(${angle}deg)`;
  kart.classList.toggle("race-kart-leader", colorIndex === 0);
  kart.classList.toggle("race-kart-rank2", colorIndex === 1);
  kart.classList.toggle("race-kart-rank3", colorIndex === 2);

  if (colorIndex === 0) {
    raceLeaderUid = uid;
  }
}

/* ------------------------------------------------------
   TEMPO-TRAIL HINTER DEM FÜHRENDEN KART
------------------------------------------------------ */
function spawnRaceTrailDot() {
  const layer = document.getElementById("race-karts-layer");
  const leaderKart = raceLeaderUid ? raceKartElements[raceLeaderUid] : null;
  if (!layer || !leaderKart) return;

  const transform = leaderKart.style.transform;
  const match = transform.match(/translate\(([-\d.]+)px, ?([-\d.]+)px\)/);
  if (!match) return;

  const flameColors = ["#ffd76b", "#ff9f4d", "#ff5252"];
  const color = flameColors[Math.floor(Math.random() * flameColors.length)];

  const svgNS = "http://www.w3.org/2000/svg";
  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("class", "race-trail-dot");
  dot.setAttribute("cx", match[1]);
  dot.setAttribute("cy", match[2]);
  dot.setAttribute("r", "3");
  dot.setAttribute("fill", color);

  layer.insertBefore(dot, leaderKart);
  setTimeout(() => dot.remove(), 700);
}

function startRaceTrail() {
  stopRaceTrail();
  raceTrailInterval = setInterval(spawnRaceTrailDot, 220);
}

function stopRaceTrail() {
  clearInterval(raceTrailInterval);
  raceTrailInterval = null;
}

function removeStaleKarts(activeUids) {
  Object.keys(raceKartElements).forEach((uid) => {
    if (!activeUids.includes(uid)) {
      raceKartElements[uid].remove();
      delete raceKartElements[uid];
    }
  });
}

function renderRaceResultsList(entries) {
  const list = document.getElementById("race-results-list");
  const podiumContainer = document.getElementById("race-leaderboard-podium");
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = "";
    if (podiumContainer) podiumContainer.innerHTML = "";
    return;
  }

  // Podest für die Top 3 (nutzt denselben Baustein wie die Haupt-
  // Rangliste, siehe scripts/wheel/wheel.js) - rein additiv, die
  // Zeilenliste darunter bleibt unverändert bestehen
  if (podiumContainer && typeof buildLeaderboardPodiumEntry === "function") {
    const topThree = entries.slice(0, 3);
    podiumContainer.innerHTML = `
      <div class="fh-podium">
        ${topThree[1] ? buildLeaderboardPodiumEntry({ ...topThree[1], codesCracked: topThree[1].progress }, 2) : ""}
        ${topThree[0] ? buildLeaderboardPodiumEntry({ ...topThree[0], codesCracked: topThree[0].progress }, 1) : ""}
        ${topThree[2] ? buildLeaderboardPodiumEntry({ ...topThree[2], codesCracked: topThree[2].progress }, 3) : ""}
      </div>
    `;
    podiumContainer.querySelectorAll(".fh-podium-score").forEach((el) => {
      el.textContent = el.textContent.replace("🔑", "Punkte");
    });
  }

  let html = "";
  entries.forEach((entry, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const rewardHtml = i < 3 ? `<span class="race-result-reward">🏆 +${RACE_REWARDS_BY_RANK[i]} 💰</span>` : "";
    const frameRowClass = typeof rowFrameClass === "function" && typeof frameStyleFromId === "function"
      ? rowFrameClass(frameStyleFromId(entry.equippedFrame))
      : "";
    html += `
      <div class="race-result-row ${frameRowClass}">
        <span class="race-result-rank">${medal}</span>
        <span class="race-result-name">${escapeHtml(entry.nickname || "Unbekannt")}</span>
        <span class="race-result-points">${entry.progress} Pkt</span>
        ${rewardHtml}
      </div>
    `;
  });

  list.innerHTML = html;
}

function renderRaceTrack(entries, emptyMessage) {
  const wrap = document.getElementById("race-track-wrap");
  const emptyEl = document.getElementById("race-track-empty");
  if (!wrap) return;

  if (!entries.length) {
    if (emptyEl) {
      emptyEl.textContent = emptyMessage;
      emptyEl.style.display = "flex";
    }
    removeStaleKarts([]);
    renderRaceResultsList([]);
    stopRaceTrail();
    raceLeaderUid = null;
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";

  const maxProgress = Math.max(raceConfig.finishLine, ...entries.map((e) => e.progress));
  const activeUids = [];

  entries.forEach((entry, i) => {
    const uid = entry.uid || entry.nickname; // Fallback für ältere Datensätze ohne uid
    activeUids.push(uid);
    const percent = entry.progress / maxProgress;
    positionKart(uid, percent, entry.nickname, i);
  });

  removeStaleKarts(activeUids);
  renderRaceResultsList(entries);
  startRaceTrail();
}

function loadRaceLeaderboard() {
  // URSACHE des "path is empty"-Fehlers: addRaceProgress() (wheel.js,
  // nach jeder Rad-Drehung/jedem geknackten Code) ruft diese Funktion
  // IMMER auf, damit die Rangliste live aktualisiert ist, falls die
  // Rennseite gerade offen ist - unabhaengig davon, auf welcher Seite
  // sich der Spieler gerade befindet. Das Zeichnen der SVG-Strecke
  // (buildRaceTrack(), setzt das "d"-Attribut von #race-track-path)
  // lief bisher dagegen NUR beim tatsaechlichen Besuch der Rennseite
  // (updateRacePage()). Spinnt ein Spieler das Rad, ohne die
  // Rennseite in dieser Sitzung je geoeffnet zu haben, war die
  // Strecke beim Rendern also noch nie gezeichnet -> leerer Pfad ->
  // getPointAtLength() wirft. buildRaceTrack() ist idempotent (baut
  // pro Woche nur einmal), daher hier immer sicherheitshalber zuerst
  // aufrufen, statt die eigentliche Ursache mit try/catch zu verdecken.
  buildRaceTrack();

  const emptyEl = document.getElementById("race-track-empty");

  if (!wheelDb) {
    if (emptyEl) {
      emptyEl.textContent =
        "Das globale Rennen ist noch nicht eingerichtet (Firebase-Zugangsdaten fehlen in scripts/firebase-config.js).";
      emptyEl.style.display = "flex";
    }
    return;
  }

  const currentWeek = getCurrentWeekId();

  wheelDb
    .collection("raceProgress")
    .where("week", "==", currentWeek)
    .orderBy("progress", "desc")
    .limit(raceConfig.topPlayersShown)
    .get()
    .then((snapshot) => {
      const entries = [];
      snapshot.forEach((doc) => entries.push(doc.data()));
      renderRaceTrack(entries, "Noch niemand ist diese Woche gestartet – sei der Erste!");
    })
    .catch((err) => {
      console.error("Rennen konnte nicht geladen werden:", err);

      if (!emptyEl) return;

      if (err.code === "failed-precondition") {
        emptyEl.textContent =
          "Firestore braucht noch einen Suchindex fürs Rennen. Öffne die Browser-Konsole (F12) - " +
          "dort zeigt Firebase einen Link zum automatischen Erstellen an. Einmal klicken, kurz " +
          "warten (1-2 Minuten), dann Seite neu laden.";
      } else {
        emptyEl.textContent = "Rennen konnte nicht geladen werden.";
      }
      emptyEl.style.display = "flex";
    });
}

/* ------------------------------------------------------
   SIEGER DER LETZTEN WOCHE
------------------------------------------------------ */
function loadLastWeekWinner() {
  const el = document.getElementById("race-last-winner");
  if (!el || !wheelDb) return;

  const previousWeek = getPreviousWeekId();

  wheelDb
    .collection("raceProgress")
    .where("week", "==", previousWeek)
    .orderBy("progress", "desc")
    .limit(3)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        el.textContent = "Letzte Woche gab es noch keinen Sieger.";
        return;
      }

      const winner = snapshot.docs[0].data();
      el.textContent = `🏆 Sieger der letzten Woche: ${winner.nickname} mit ${winner.progress} Punkten!`;

      grantWeeklyRaceCurrency(previousWeek, snapshot.docs);
    })
    .catch((err) => {
      console.error("Vorwochen-Sieger konnte nicht geladen werden:", err);
    });
}

/* ------------------------------------------------------
   DUBLONEN FÜR TOP-3 DER VORWOCHE
   Wird einmal pro Woche vergeben (localStorage-Sperre), sobald
   ein Top-3-Platz beim Besuch dieser Seite erkannt wird - man
   muss also nach Wochenende einmal auf der Seite vorbeischauen.
------------------------------------------------------ */
async function grantWeeklyRaceCurrency(weekId, topDocs) {
  const claimKey = `raceRewardClaimed_${weekId}`;
  if (localStorage.getItem(claimKey)) return;
  if (typeof addCurrency !== "function" || typeof wheelAuthReady === "undefined") return;

  const ownUid = await wheelAuthReady;
  if (!ownUid) return;

  const rewardsByRank = RACE_REWARDS_BY_RANK;
  const ownIndex = topDocs.findIndex((doc) => doc.data().uid === ownUid);

  localStorage.setItem(claimKey, "1"); // merken, egal ob getroffen oder nicht

  if (ownIndex >= 0 && rewardsByRank[ownIndex]) {
    addCurrency(rewardsByRank[ownIndex]);
  }
}

/* ------------------------------------------------------
   TÄGLICHER RENNEN-BONUS
   Zusätzlich zum Fortschritt durch Rad/Codes gibt es einmal
   am Tag einen kleinen Bonus, nur fürs Vorbeischauen beim Rennen.
------------------------------------------------------ */
function refreshRaceDailyStatus() {
  const btn = document.getElementById("race-daily-button");
  const statusEl = document.getElementById("race-daily-status");
  if (!btn || !statusEl) return;

  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname) {
    btn.disabled = true;
    statusEl.textContent = "Trag im 🧭 Schatzrad zuerst deinen Namen ein, um mitzufahren.";
    return;
  }

  const today = todayStr();
  const lastClaim = localStorage.getItem("raceDailyBonusDate");

  if (lastClaim === today) {
    btn.disabled = true;
    statusEl.textContent = "Tagesbonus heute schon abgeholt – komm morgen wieder! 🎁";
  } else {
    btn.disabled = false;
    statusEl.textContent = `Heute noch nicht abgeholt: +${raceConfig.dailyBonusProgress} Bonus-Punkte warten! 🎁`;
  }
}

function claimDailyRaceBonus() {
  const nickname = localStorage.getItem("wheelNickname") || "";
  const today = todayStr();
  const lastClaim = localStorage.getItem("raceDailyBonusDate");

  if (!nickname || lastClaim === today) {
    refreshRaceDailyStatus();
    return;
  }

  localStorage.setItem("raceDailyBonusDate", today);
  addRaceProgress(raceConfig.dailyBonusProgress);
  refreshRaceDailyStatus();
  playDailyBonusAnimation(raceConfig.dailyBonusProgress);
}

/* ------------------------------------------------------
   TAGESBONUS-ANIMATION
   Kurzes "Geschenk aufgeht"-Feuerwerk am Button, damit man
   deutlich sieht, dass der Bonus wirklich abgeholt wurde.
------------------------------------------------------ */
function playDailyBonusAnimation(points) {
  const btn = document.getElementById("race-daily-button");
  if (!btn) return;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const burst = document.createElement("div");
  burst.className = "daily-bonus-burst";
  burst.innerHTML = `
    <span class="daily-bonus-points">+${points}</span>
    ${reducedMotion ? "" : Array.from({ length: 10 })
      .map((_, i) => `<span class="daily-bonus-spark" style="--i:${i}"></span>`)
      .join("")}
  `;

  btn.style.position = "relative";
  btn.appendChild(burst);

  btn.classList.remove("daily-bonus-pop");
  void btn.offsetWidth;
  btn.classList.add("daily-bonus-pop");

  if (typeof triggerCodeSuccessEffect === "function") {
    triggerCodeSuccessEffect();
  }

  setTimeout(() => burst.remove(), 1400);
}

/* ------------------------------------------------------
   SEITENWECHSEL-HOOK
------------------------------------------------------ */
function updateRacePage(pageID) {
  if (pageID !== "race") {
    stopRaceCountdown();
    stopRaceTrail();
    return;
  }

  buildRaceTrack();
  refreshOwnRaceProgress();
  refreshRaceDailyStatus();
  loadRaceLeaderboard();
  loadLastWeekWinner();
  startRaceCountdown();
}
