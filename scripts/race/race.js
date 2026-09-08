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

/* ======================================================
   LANDSCHAFT NEBEN DER BAHN
   ---------------------------------------------------
   Vorher war der Untergrund ein einfarbiges Rechteck - die Strecke
   sah aus wie ein Gummiband in einem Kasten. Jetzt stehen Duenen,
   Palmen, Felsen oder Wolken daneben.

   NICHT VON HAND GESETZT. Die Standorte werden aus dem Streckennamen
   erwuerfelt (immer derselbe Name, immer dasselbe Bild) und dabei von
   der Bahn ferngehalten: der Pfad wird an 90 Stellen abgetastet, und
   jeder Vorschlag, der einer dieser Stellen zu nahe kommt, faellt
   weg. Eine zehnte Strecke bekommt ihre Umgebung damit geschenkt,
   ohne dass jemand Koordinaten abtippt.
====================================================== */

/* Kleiner, reproduzierbarer Zufall aus einer Zeichenkette. Ohne
   festen Anfangswert saehe die Strecke bei jedem Seitenwechsel anders
   aus - das waere Unruhe ohne Gewinn. */
function raceWuerfel(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Was zu welcher Landschaft gehoert. Die Zahl dahinter ist die
   ungefaehre Anzahl - der Rest ergibt sich aus dem Platz, der neben
   der Bahn uebrig bleibt. */
const RACE_LANDSCHAFTEN = {
  wueste:    { himmel: "#3a2410", horizont: "#c8934a", teile: ["duene", "kaktus", "fels"], anzahl: 16 },
  kueste:    { himmel: "#0c2338", horizont: "#4a9fd8", teile: ["palme", "welle", "fels"],  anzahl: 14 },
  dschungel: { himmel: "#0a1e12", horizont: "#3f9d5c", teile: ["baum", "baum", "fels"],    anzahl: 18 },
  neon:      { himmel: "#07060f", horizont: "#a855f7", teile: ["mast", "mast", "fels"],    anzahl: 14 },
  ozean:     { himmel: "#061a2c", horizont: "#5fb8e8", teile: ["welle", "welle", "insel"], anzahl: 16 },
  himmel:    { himmel: "#8fc4e6", horizont: "#ffffff", teile: ["wolke", "wolke", "vogel"], anzahl: 15 },
  riff:      { himmel: "#1d1208", horizont: "#ff9f4d", teile: ["fels", "fels", "welle"],   anzahl: 17 },
  nebel:     { himmel: "#141b22", horizont: "#9fb8c8", teile: ["schwade", "fels"],         anzahl: 13 },
  sturm:     { himmel: "#0b0b16", horizont: "#c084fc", teile: ["wolke", "blitz", "wolke"], anzahl: 14 },
};

/* Ein Landschaftsteil als SVG. Alles bewusst schlicht: es steht
   klein und weit weg, feine Zeichnung waere dort nur Rauschen. */
function raceDekoTeil(art, x, y, groesse, farbe, akzent) {
  const g = groesse;
  const o = (n) => n.toFixed(1);
  switch (art) {
    case "duene":
      return `<path d="M${o(x-g*1.8)},${o(y)} Q${o(x)},${o(y-g)} ${o(x+g*1.8)},${o(y)} Z" fill="${farbe}" opacity=".8"/>`;
    case "kaktus":
      return `<g fill="${farbe}" opacity=".92">`
           + `<rect x="${o(x-g*0.16)}" y="${o(y-g*1.5)}" width="${o(g*0.32)}" height="${o(g*1.5)}" rx="${o(g*0.16)}"/>`
           + `<rect x="${o(x-g*0.7)}" y="${o(y-g*1.0)}" width="${o(g*0.26)}" height="${o(g*0.6)}" rx="${o(g*0.13)}"/>`
           + `<rect x="${o(x+g*0.44)}" y="${o(y-g*1.2)}" width="${o(g*0.26)}" height="${o(g*0.75)}" rx="${o(g*0.13)}"/></g>`;
    case "fels":
      return `<path d="M${o(x-g)},${o(y)} L${o(x-g*0.5)},${o(y-g*0.85)} L${o(x+g*0.3)},${o(y-g*0.6)} L${o(x+g)},${o(y)} Z" fill="${farbe}" opacity=".85"/>`;
    case "palme":
      return `<g opacity=".95"><path d="M${o(x)},${o(y)} Q${o(x+g*0.2)},${o(y-g)} ${o(x-g*0.1)},${o(y-g*1.7)}" stroke="${farbe}" stroke-width="${o(g*0.16)}" fill="none"/>`
           + [0,1,2,3].map(i => { const a = -2.5 + i * 0.85;
               return `<path d="M${o(x-g*0.1)},${o(y-g*1.7)} q${o(Math.cos(a)*g*0.8)},${o(Math.sin(a)*g*0.5-g*0.2)} ${o(Math.cos(a)*g*1.3)},${o(Math.sin(a)*g*0.8)}" stroke="${akzent}" stroke-width="${o(g*0.13)}" fill="none" stroke-linecap="round"/>`;
             }).join("") + `</g>`;
    case "baum":
      return `<g opacity=".92"><rect x="${o(x-g*0.12)}" y="${o(y-g*0.9)}" width="${o(g*0.24)}" height="${o(g*0.9)}" fill="${farbe}"/>`
           + `<circle cx="${o(x)}" cy="${o(y-g*1.15)}" r="${o(g*0.62)}" fill="${akzent}"/>`
           + `<circle cx="${o(x-g*0.4)}" cy="${o(y-g*0.85)}" r="${o(g*0.42)}" fill="${akzent}" opacity=".85"/></g>`;
    case "welle":
      return `<path d="M${o(x-g*1.6)},${o(y)} q${o(g*0.5)},${o(-g*0.42)} ${o(g*1.0)},0 q${o(g*0.5)},${o(g*0.42)} ${o(g*1.0)},0" stroke="${akzent}" stroke-width="${o(g*0.16)}" fill="none" opacity=".75" stroke-linecap="round"/>`;
    case "insel":
      return `<g opacity=".88"><path d="M${o(x-g*1.4)},${o(y)} Q${o(x)},${o(y-g*0.9)} ${o(x+g*1.4)},${o(y)} Z" fill="${farbe}"/>`
           + `<circle cx="${o(x)}" cy="${o(y-g*0.75)}" r="${o(g*0.3)}" fill="${akzent}"/></g>`;
    case "wolke":
      return `<g fill="${akzent}" opacity=".72"><ellipse cx="${o(x)}" cy="${o(y)}" rx="${o(g*1.5)}" ry="${o(g*0.6)}"/>`
           + `<circle cx="${o(x-g*0.5)}" cy="${o(y-g*0.25)}" r="${o(g*0.55)}"/>`
           + `<circle cx="${o(x+g*0.45)}" cy="${o(y-g*0.2)}" r="${o(g*0.45)}"/></g>`;
    case "vogel":
      return `<path d="M${o(x-g*0.6)},${o(y)} q${o(g*0.3)},${o(-g*0.35)} ${o(g*0.6)},0 q${o(g*0.3)},${o(-g*0.35)} ${o(g*0.6)},0" stroke="${akzent}" stroke-width="${o(g*0.11)}" fill="none" opacity=".8" stroke-linecap="round"/>`;
    case "mast":
      return `<g opacity=".95"><rect x="${o(x-g*0.08)}" y="${o(y-g*1.9)}" width="${o(g*0.16)}" height="${o(g*1.9)}" fill="${farbe}"/>`
           + `<rect x="${o(x-g*0.45)}" y="${o(y-g*2.05)}" width="${o(g*0.9)}" height="${o(g*0.22)}" rx="${o(g*0.11)}" fill="${akzent}"/></g>`;
    case "schwade":
      return `<ellipse cx="${o(x)}" cy="${o(y)}" rx="${o(g*2.2)}" ry="${o(g*0.5)}" fill="${akzent}" opacity=".38"/>`;
    case "blitz":
      return `<path d="M${o(x)},${o(y-g*1.8)} L${o(x-g*0.35)},${o(y-g*0.7)} L${o(x+g*0.1)},${o(y-g*0.75)} L${o(x-g*0.25)},${o(y)}" stroke="${akzent}" stroke-width="${o(g*0.13)}" fill="none" opacity=".85" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

/* Zwei Farben, die sich vom Untergrund abheben - eine dunklere und
   eine hellere Fassung davon. Vorher standen hier Fahrbahn- und
   Akzentfarbe: die Fahrbahn ist dem Untergrund oft zu aehnlich (Wueste:
   Sand auf Sand), und der Akzent ist die Signalfarbe der Strecke, die
   soll dem Curb gehoeren, nicht jedem Kaktus. */
function raceTonMischen(hex, zielHex, anteil) {
  const l = (h) => {
    const c = String(h || "#000000").replace("#", "");
    const v = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
    return [parseInt(v.slice(0,2),16) || 0, parseInt(v.slice(2,4),16) || 0, parseInt(v.slice(4,6),16) || 0];
  };
  const a = l(hex), b = l(zielHex);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * anteil));
  return "#" + m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function raceDekoAufbauen(track) {
  const fern = document.getElementById("race-deko-fern");
  const nah = document.getElementById("race-deko-nah");
  const pfad = document.getElementById("race-track-path");
  if (!fern || !nah || !pfad) return;

  fern.innerHTML = "";
  nah.innerHTML = "";

  const l = RACE_LANDSCHAFTEN[track.landschaft];
  if (!l) return;

  // Himmel und Horizont nach Landschaft
  const himmelEl = document.getElementById("race-himmel");
  const horizontEl = document.getElementById("race-horizont");
  if (himmelEl) himmelEl.setAttribute("fill", l.himmel);
  if (horizontEl) horizontEl.setAttribute("fill", l.horizont);

  // Die Bahn abtasten, um sie danach freizuhalten.
  let laenge = 0;
  try { laenge = pfad.getTotalLength(); } catch (err) { return; }
  if (!laenge) return;
  const bahn = [];
  for (let i = 0; i < 90; i++) {
    const pt = pfad.getPointAtLength((laenge * i) / 90);
    bahn.push([pt.x, pt.y]);
  }
  // Die Fahrbahn ist 54 breit, der Curb 62 - 46 Abstand zur Mittellinie
  // laesst also gerade eben nichts mehr auf den Asphalt ragen.
  const ABSTAND = 46 * 46;

  const dunkel = raceTonMischen(track.grass, "#000000", 0.45);
  const hell   = raceTonMischen(track.grass, "#ffffff", 0.42);

  const w = raceWuerfel(track.name || "strecke");
  const teileFern = [];
  const teileNah = [];
  let versuche = 0;

  while (teileFern.length + teileNah.length < l.anzahl && versuche < 400) {
    versuche++;
    const x = -20 + w() * 640;
    const y = -50 + w() * 400;

    let frei = true;
    for (let i = 0; i < bahn.length; i++) {
      const dx = bahn[i][0] - x, dy = bahn[i][1] - y;
      if (dx * dx + dy * dy < ABSTAND) { frei = false; break; }
    }
    if (!frei) continue;

    const art = l.teile[Math.floor(w() * l.teile.length)];
    const groesse = 9 + w() * 13;
    const svg = raceDekoTeil(art, x, y, groesse, dunkel, hell);
    // Was unterhalb der ganzen Bahn liegt, steht davor - der Rest
    // dahinter. Sonst laeuft ein Kart hinter einer Palme entlang, die
    // eigentlich weiter weg ist.
    (y > 268 ? teileNah : teileFern).push(svg);
  }

  fern.innerHTML = teileFern.join("");
  nah.innerHTML = teileNah.join("");
}

/* ======================================================
   START-/ZIELLINIE UND SEKTORENMARKEN
   ---------------------------------------------------
   Die Ziellinie stand bisher als festes Rechteck bei x=94,y=42 im
   Markup - sie passte damit zu genau EINER der neun Strecken und lag
   bei allen anderen daneben. Jetzt wird sie aus dem Pfad berechnet
   und quer darauf gelegt, mitsamt Sektorenmarken bei einem und zwei
   Dritteln. Erst dadurch sieht man, wo eine Runde anfaengt.
====================================================== */
function raceLinienAufbauen() {
  const pfad = document.getElementById("race-track-path");
  const ziel = document.getElementById("race-ziellinie");
  const sekt = document.getElementById("race-sektoren");
  if (!pfad || !ziel || !sekt) return;

  ziel.innerHTML = "";
  sekt.innerHTML = "";

  let laenge = 0;
  try { laenge = pfad.getTotalLength(); } catch (err) { return; }
  if (!laenge) return;

  function querAuf(anteil) {
    const s = laenge * anteil;
    const p = pfad.getPointAtLength(s);
    const q = pfad.getPointAtLength(Math.min(laenge, s + 2));
    const winkel = Math.atan2(q.y - p.y, q.x - p.x) * (180 / Math.PI);
    return { x: p.x, y: p.y, winkel: winkel };
  }

  const z = querAuf(0);
  ziel.innerHTML =
    `<g transform="translate(${z.x.toFixed(1)},${z.y.toFixed(1)}) rotate(${z.winkel.toFixed(1)})">` +
    `<rect x="-5" y="-27" width="10" height="54" fill="url(#race-checker)"/>` +
    `<rect x="-6.5" y="-27" width="1.5" height="54" fill="rgba(255,255,255,.5)"/>` +
    `<rect x="5" y="-27" width="1.5" height="54" fill="rgba(255,255,255,.5)"/></g>`;

  sekt.innerHTML = [1 / 3, 2 / 3].map(function (a) {
    const p = querAuf(a);
    return `<g transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${p.winkel.toFixed(1)})">` +
           `<rect x="-1" y="-27" width="2" height="54" fill="rgba(255,255,255,.28)"/></g>`;
  }).join("");
}

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
  // Zweite, um eine halbe Teilung versetzte Strichlinie in Weiss -
  // zusammen ergibt das den abwechselnden Rand einer echten
  // Randbegrenzung statt einer einfarbigen Strichelung.
  const curbHellEl = document.getElementById("race-curb-hell");
  if (curbHellEl) curbHellEl.setAttribute("d", track.path);
  if (trackPathEl) {
    trackPathEl.setAttribute("d", track.path);
    trackPathEl.setAttribute("stroke", track.roadOuter);
  }
  if (roadInnerEl) {
    roadInnerEl.setAttribute("d", track.path);
    roadInnerEl.setAttribute("stroke", track.roadInner);
  }
  if (centerLineEl) centerLineEl.setAttribute("d", track.path);
  // Steht seit dem 1c-Umbau als Vorzeile UEBER dem Seitentitel
  // (siehe .race-head in index.html) - dort traegt schon der Titel
  // "Wochenrennen" die Woche, das "Diese Woche:" davor waere doppelt.
  if (themeEl) themeEl.textContent = `${track.emoji} ${track.name}`;

  /* Der Seitenhintergrund (scripts/core/seiten-fx-szenen.js, Eintrag
     "race") nimmt Grund- und Akzentfarbe der gefahrenen Strecke.
     Beide stehen ohnehin schon hier - eine zehnte Strecke in
     race-data.js bekommt damit von selbst den passenden
     Hintergrund, ohne dass am Shader etwas zu aendern waere. */
  window.fhRennThema = track;

  // Bereits gezeichnete Karts/Boote/Flugzeuge entfernen, damit sie beim
  // nächsten Positionieren mit dem NEUEN Fahrzeugtyp neu erstellt werden
  const kartsLayer = document.getElementById("race-karts-layer");
  if (kartsLayer) kartsLayer.innerHTML = "";
  raceKartElements = {};

  // Streckenlänge neu berechnen, da sich der Pfad geändert hat
  raceTrackLength = null;
  raceBuiltForWeek = currentWeek;

  // Erst NACH dem Setzen von "d": beide lesen den Pfad ab.
  raceLinienAufbauen();
  raceDekoAufbauen(track);
  // Das Gelaende kann sich mit der Woche geaendert haben - dann
  // stehen andere drei Fahrzeuge zur Wahl.
  renderRaceFahrzeugwahl();
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
  const nickname = localStorage.getItem("wheelNickname") || "";

  if (!nickname || !supabaseClient) {
    // Kein Server-Ziel vorhanden (z.B. Name noch nicht vergeben) - rein
    // lokal weiterzaehlen bleibt die einzige Option.
    const newProgress = getLocalRaceProgress() + amount;
    localStorage.setItem("raceWeek", currentWeek);
    localStorage.setItem("raceProgress", String(newProgress));
    refreshOwnRaceProgress();
    return;
  }

  wheelAuthReady.then(async (uid) => {
    if (!uid) return;

    // Server-massgeblich statt aus dem lokalen Zaehler uebernommen: ein
    // rein lokal (localStorage "raceProgress") mitgezaehlter Wert kann
    // vom tatsaechlichen DB-Stand abweichen - z.B. wenn fruehere
    // Schreibversuche in derselben Woche fehlgeschlagen sind (localStorage
    // wurde trotzdem schon optimistisch erhoeht). Ein daraus
    // resultierender zu hoher Sprung wuerde von der RLS (progress <=
    // alter Wert + 15) ohnehin abgelehnt - hier wird er gar nicht erst
    // versucht, sondern immer aus dem echten DB-Stand fuer diese Woche
    // berechnet.
    const { data: current } = await supabaseClient
      .from("race_progress")
      .select("progress")
      .eq("week", currentWeek)
      .eq("firebase_uid", uid)
      .maybeSingle();

    const newProgress = (current ? current.progress : 0) + amount;
    localStorage.setItem("raceWeek", currentWeek);
    localStorage.setItem("raceProgress", String(newProgress));

    // Echtes Upsert (ein Aufruf deckt sowohl "erster Eintrag diese
    // Woche" als auch "Fortschritt aktualisieren" ab) - der
    // zusammengesetzte Schluessel (week, firebase_uid) ist die
    // natuerliche Entsprechung zu Firestores Dokument-ID-Trick
    // "<week>_<uid>", siehe 03-race-boss.sql.
    // withSupabaseRlsColdStartRetry(): siehe Kommentar in supabase-client.js
    const { error } = await withSupabaseRlsColdStartRetry(() =>
      supabaseClient.from("race_progress").upsert(
        {
          week: currentWeek,
          firebase_uid: uid,
          nickname: nickname,
          progress: newProgress,
          equipped_frame: localStorage.getItem("equippedFrame") || null,
        },
        { onConflict: "week,firebase_uid" }
      )
    );
    if (error) console.error("Rennfortschritt konnte nicht gespeichert werden:", error);

    refreshOwnRaceProgress();
    // Live-Rangliste nachladen, falls die Rennseite gerade offen ist
    loadRaceLeaderboard();
  });
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

/* Die Stauchung der gekippten Ebene (matrix d in #race-neigung in
   index.html). Steht hier, weil vier Rechnungen sie brauchen - und
   damit sie nicht an zwei Stellen auseinanderlaufen kann. */
const RACE_STAUCHUNG = 0.62;
const RACE_GEGENSTAUCHUNG = +(1 / RACE_STAUCHUNG).toFixed(4);

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

/* ======================================================
   NEUN FAHRZEUGE, DREI JE GELAENDE
   ---------------------------------------------------
   Die Strecke bestimmt das GELAENDE (Land, Wasser, Luft), jeder
   Mitfahrer waehlt daraus sein Fahrzeug. Rein optisch: auf den
   Fortschritt hat die Wahl keinen Einfluss, es ist also auch nichts
   gegen Schummeln abzusichern und nichts zu speichern ausser im
   eigenen Browser.

   Alle neun tragen dieselben Klassen (.kart-body, .kart-number,
   .kart-shadow ...), damit Farbverlauf, Startnummer, Aura und Krone
   ohne Sonderfaelle weiterfunktionieren.
====================================================== */

const buggyMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="10" rx="14" ry="4"></ellipse>
      <!-- Stollenreifen: groesser und kantiger als beim Kart -->
      <g class="kart-wheel-group" transform="translate(-7.5,-8.5)">
        <circle class="kart-tire" r="4.2"></circle><circle class="kart-rim" r="1.7"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".45s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(-7.5,8.5)">
        <circle class="kart-tire" r="4.2"></circle><circle class="kart-rim" r="1.7"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".45s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(7,-8.5)">
        <circle class="kart-tire" r="4.2"></circle><circle class="kart-rim" r="1.7"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".45s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(7,8.5)">
        <circle class="kart-tire" r="4.2"></circle><circle class="kart-rim" r="1.7"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".45s" repeatCount="indefinite"></animateTransform>
      </g>
      <!-- Ueberrollbuegel statt Spoiler -->
      <path class="buggy-buegel" d="M-5,-6 Q0,-11 5,-6" fill="none" stroke="#2a2a2a" stroke-width="1.6"></path>
      <path class="buggy-buegel" d="M-5,6 Q0,11 5,6" fill="none" stroke="#2a2a2a" stroke-width="1.6"></path>
      <rect class="kart-body" x="-8" y="-6" width="16" height="12" rx="2.5"></rect>
      <rect class="kart-stripe" x="-8" y="-1.8" width="16" height="3.6"></rect>
      <circle class="kart-helmet" cx="-1" cy="0" r="3"></circle>
      <text class="kart-number" x="-1" y="1.6" text-anchor="middle"></text>
      <polygon class="kart-nose" points="8,-3 13,0 8,3"></polygon>
    </g>
  `;

const rennwagenMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="10" rx="15" ry="3.5"></ellipse>
      <g class="kart-wheel-group" transform="translate(-8,-8)">
        <circle class="kart-tire" r="3.2"></circle><circle class="kart-rim" r="1.4"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".3s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(-8,8)">
        <circle class="kart-tire" r="3.2"></circle><circle class="kart-rim" r="1.4"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".3s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(8,-7)">
        <circle class="kart-tire" r="2.6"></circle><circle class="kart-rim" r="1.1"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".3s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="kart-wheel-group" transform="translate(8,7)">
        <circle class="kart-tire" r="2.6"></circle><circle class="kart-rim" r="1.1"></circle>
        <animateTransform attributeName="transform" type="rotate" additive="sum" from="0 0 0" to="360 0 0" dur=".3s" repeatCount="indefinite"></animateTransform>
      </g>
      <!-- Langer, flacher Koerper mit grossem Heckfluegel -->
      <rect class="kart-spoiler" x="-15" y="-6.5" width="3.4" height="13" rx="1"></rect>
      <path class="kart-body" d="M-12,-4.5 L4,-4.5 Q10,-4 16,0 Q10,4 4,4.5 L-12,4.5 Q-13.5,0 -12,-4.5 Z"></path>
      <path class="kart-gloss" d="M-10,-3.6 L3,-3.6 L2,-2.2 L-10,-2.2 Z"></path>
      <rect class="kart-stripe" x="-12" y="-1.6" width="24" height="3.2"></rect>
      <path class="kart-windshield" d="M-3,-3.4 Q0,-5 3,-3.6 L2.4,-1.2 L-2.6,-1.2 Z"></path>
      <circle class="kart-helmet" cx="-1.5" cy="0" r="2.7"></circle>
      <text class="kart-number" x="-1.5" y="1.5" text-anchor="middle"></text>
      <rect class="kart-front-wing" x="12" y="3.4" width="6" height="1.3" rx=".6"></rect>
      <polygon class="kart-nose" points="16,-1.6 19,0 16,1.6"></polygon>
    </g>
  `;

const ruderbootMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="8" rx="12" ry="3"></ellipse>
      <path class="kart-body" d="M-11,1 Q0,-3 11,1 Q11,7 0,8.5 Q-11,7 -11,1 Z"></path>
      <path class="kart-side-shade" d="M-9,4 Q0,6 9,4 Q9,6.6 0,8 Q-9,6.6 -9,4 Z"></path>
      <path class="kart-gloss" d="M-9,1.4 Q0,-1.4 9,1.4 L7,2.6 Q0,0.4 -7,2.6 Z"></path>
      <!-- Ruder, die im Takt schlagen -->
      <g class="ruder-arm">
        <line x1="-2" y1="2" x2="-9" y2="-7" stroke="#8a6a42" stroke-width="1.3"></line>
        <ellipse cx="-9.6" cy="-8" rx="1.8" ry="1" fill="#8a6a42" transform="rotate(-40 -9.6 -8)"></ellipse>
        <animateTransform attributeName="transform" type="rotate" values="-9 -2 2; 9 -2 2; -9 -2 2" dur=".9s" repeatCount="indefinite"></animateTransform>
      </g>
      <g class="ruder-arm">
        <line x1="-2" y1="4" x2="-9" y2="13" stroke="#8a6a42" stroke-width="1.3"></line>
        <ellipse cx="-9.6" cy="14" rx="1.8" ry="1" fill="#8a6a42" transform="rotate(40 -9.6 14)"></ellipse>
        <animateTransform attributeName="transform" type="rotate" values="9 -2 4; -9 -2 4; 9 -2 4" dur=".9s" repeatCount="indefinite"></animateTransform>
      </g>
      <circle class="kart-helmet" cx="0" cy="3" r="2.6"></circle>
      <text class="kart-number" x="0" y="4.4" text-anchor="middle"></text>
      <polygon class="kart-nose" points="11,1.5 14.5,3.5 11,5.5"></polygon>
    </g>
  `;

const motorbootMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="9" rx="13" ry="3"></ellipse>
      <!-- Heckwelle: zwei Boegen, die mitlaufen -->
      <path class="motorboot-welle" d="M-11,2 q-4,2 -7,0" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.3" stroke-linecap="round">
        <animate attributeName="opacity" values=".7;.2;.7" dur=".5s" repeatCount="indefinite"></animate>
      </path>
      <path class="motorboot-welle" d="M-11,6 q-5,2 -9,0" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.1" stroke-linecap="round">
        <animate attributeName="opacity" values=".2;.6;.2" dur=".5s" repeatCount="indefinite"></animate>
      </path>
      <path class="kart-body" d="M-11,0 L6,0 Q13,2.5 13,4 Q13,5.5 6,8 L-11,8 Q-12.5,4 -11,0 Z"></path>
      <path class="kart-side-shade" d="M-11,5.4 L6,5.4 Q11,6.4 11,6.6 Q7,8 6,8 L-11,8 Z"></path>
      <path class="kart-gloss" d="M-9,0.8 L5,0.8 L4,2.2 L-9,2.2 Z"></path>
      <rect class="kart-stripe" x="-11" y="3" width="21" height="2.2"></rect>
      <path class="kart-windshield" d="M0,0 Q3,-2.6 5,-.4 L4.4,1 L-.4,1 Z"></path>
      <circle class="kart-helmet" cx="-2" cy="3.6" r="2.4"></circle>
      <text class="kart-number" x="-2" y="4.9" text-anchor="middle"></text>
      <polygon class="kart-nose" points="13,3 16,4 13,5"></polygon>
    </g>
  `;

const ballonMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="16" rx="8" ry="2.5" opacity=".22"></ellipse>
      <!-- Huelle -->
      <path class="kart-body" d="M0,-18 C9,-18 12,-10 12,-5 C12,1 6,5 0,6 C-6,5 -12,1 -12,-5 C-12,-10 -9,-18 0,-18 Z"></path>
      <path class="kart-stripe" d="M-4.5,-17.4 C-6,-11 -6,-3 -3,5.4 L3,5.4 C6,-3 6,-11 4.5,-17.4 Z" opacity=".75"></path>
      <path class="kart-gloss" d="M-7,-14 C-9,-10 -9.5,-6 -8.5,-2 L-5.5,-3 C-6.5,-7 -6,-11 -4.5,-14 Z" opacity=".5"></path>
      <!-- Seile und Korb -->
      <line x1="-6" y1="5" x2="-3" y2="11" stroke="#6b5334" stroke-width=".9"></line>
      <line x1="6" y1="5" x2="3" y2="11" stroke="#6b5334" stroke-width=".9"></line>
      <rect x="-4" y="11" width="8" height="6" rx="1.2" fill="#7a5c38"></rect>
      <rect x="-4" y="12.6" width="8" height=".9" fill="#5d4529"></rect>
      <text class="kart-number" x="0" y="16" text-anchor="middle"></text>
      <polygon class="kart-nose" points="12,-5 15,-5 12,-3.4"></polygon>
    </g>
  `;

const drachenMarkup = `
    <g class="kart-inner">
      <ellipse class="kart-shadow" cx="0" cy="14" rx="8" ry="2.5" opacity=".2"></ellipse>
      <!-- Rautensegel -->
      <path class="kart-body" d="M0,-13 L9,0 L0,13 L-9,0 Z"></path>
      <path class="kart-gloss" d="M0,-13 L9,0 L0,0 Z" opacity=".45"></path>
      <line x1="0" y1="-13" x2="0" y2="13" stroke="rgba(0,0,0,.28)" stroke-width=".8"></line>
      <line x1="-9" y1="0" x2="9" y2="0" stroke="rgba(0,0,0,.28)" stroke-width=".8"></line>
      <!-- Schweif mit Schleifen -->
      <path class="drachen-schweif" d="M-9,0 q-5,2 -9,-1 q-4,-3 -8,1" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1">
        <animate attributeName="d" dur="1.1s" repeatCount="indefinite"
                 values="M-9,0 q-5,2 -9,-1 q-4,-3 -8,1; M-9,0 q-5,-2 -9,1 q-4,3 -8,-1; M-9,0 q-5,2 -9,-1 q-4,-3 -8,1"></animate>
      </path>
      <text class="kart-number" x="0" y="2.5" text-anchor="middle"></text>
      <polygon class="kart-nose" points="9,0 12.5,0 9,1.6"></polygon>
    </g>
  `;

/* Welches Gelaende welche drei Fahrzeuge hat. Der erste ist der
   Standard - er ist jeweils das, was vor dieser Runde als einziges
   gefahren wurde, damit sich fuer niemanden ungefragt etwas aendert. */
const RACE_FAHRZEUGE = {
  car:   [ { id: "kart",       symbol: "🏎️", name: { de: "Kart",         en: "Kart" },        markup: () => kartMarkup },
           { id: "buggy",      symbol: "🚙", name: { de: "Buggy",        en: "Buggy" },       markup: () => buggyMarkup },
           { id: "rennwagen",  symbol: "🏁", name: { de: "Rennwagen",    en: "Race car" },    markup: () => rennwagenMarkup } ],
  boat:  [ { id: "segelboot",  symbol: "⛵", name: { de: "Segelboot",    en: "Sailboat" },    markup: () => boatMarkup },
           { id: "ruderboot",  symbol: "🚣", name: { de: "Ruderboot",    en: "Rowing boat" }, markup: () => ruderbootMarkup },
           { id: "motorboot",  symbol: "🚤", name: { de: "Motorboot",    en: "Speedboat" },   markup: () => motorbootMarkup } ],
  plane: [ { id: "flugzeug",   symbol: "✈️", name: { de: "Doppeldecker", en: "Biplane" },     markup: () => planeMarkup },
           { id: "ballon",     symbol: "🎈", name: { de: "Heißluftballon", en: "Hot-air balloon" }, markup: () => ballonMarkup },
           { id: "drachen",    symbol: "🪁", name: { de: "Flugdrachen",  en: "Kite" },        markup: () => drachenMarkup } ],
};

/* Die eigene Spieler-Kennung. Gebraucht, um NUR das eigene Fahrzeug
   auszutauschen - siehe createKartElement(). wheelAuthReady loest sie
   auf, sobald die Anmeldung steht; bis dahin bleibt sie null und alle
   fahren das Standardfahrzeug. */
let raceEigeneUid = null;
if (typeof wheelAuthReady !== "undefined" && wheelAuthReady && wheelAuthReady.then) {
  wheelAuthReady.then(function (uid) { raceEigeneUid = uid || null; })
                .catch(function () { /* nicht angemeldet - bleibt null */ });
}

function raceGelaende() {
  const t = getWeeklyTrack();
  const g = t ? t.vehicle : "car";
  return RACE_FAHRZEUGE[g] ? g : "car";
}

/* Die Wahl steht nur im eigenen Browser - sie ist rein optisch, es
   gibt also nichts, was der Server davon wissen muesste. */
function raceFahrzeugWahl(gelaende) {
  const g = gelaende || raceGelaende();
  const liste = RACE_FAHRZEUGE[g];
  let id = null;
  try { id = localStorage.getItem("raceFahrzeug_" + g); } catch (err) { /* egal */ }
  for (const f of liste) if (f.id === id) return f;
  return liste[0];
}

function raceFahrzeugSetzen(id) {
  const g = raceGelaende();
  if (!RACE_FAHRZEUGE[g].some((f) => f.id === id)) return;
  try { localStorage.setItem("raceFahrzeug_" + g, id); } catch (err) { /* egal */ }

  /* Nur das EIGENE Fahrzeug wegwerfen - es wird beim naechsten
     Positionieren mit dem neuen Markup neu gebaut. Alle anderen
     bleiben stehen: sie sind von der Wahl gar nicht betroffen, und
     sie neu zu bauen liesse das ganze Feld einmal aufblitzen. */
  if (raceEigeneUid && raceKartElements[raceEigeneUid]) {
    raceKartElements[raceEigeneUid].remove();
    delete raceKartElements[raceEigeneUid];
  }
  renderRaceFahrzeugwahl();
  loadRaceLeaderboard();
}

function renderRaceFahrzeugwahl() {
  const box = document.getElementById("race-fahrzeugwahl");
  if (!box) return;
  const g = raceGelaende();
  const en = typeof getCurrentLang === "function" && getCurrentLang() === "en";
  const jetzt = raceFahrzeugWahl(g);
  const gelaendeName = { car: en ? "on land" : "auf Land",
                         boat: en ? "on water" : "auf Wasser",
                         plane: en ? "in the air" : "in der Luft" }[g];

  box.innerHTML =
    `<p class="race-fahrzeug-titel">${en ? "Your vehicle" : "Dein Fahrzeug"} · ${gelaendeName}</p>` +
    `<div class="race-fahrzeug-reihe">` +
    RACE_FAHRZEUGE[g].map((f) =>
      `<button type="button" class="race-fahrzeug${f.id === jetzt.id ? " ist-gewaehlt" : ""}"
               data-fahrzeug="${f.id}" aria-pressed="${f.id === jetzt.id ? "true" : "false"}">
         <span class="race-fahrzeug-symbol">${f.symbol}</span>
         <span class="race-fahrzeug-name">${en ? f.name.en : f.name.de}</span>
       </button>`).join("") +
    `</div>`;

  box.querySelectorAll("[data-fahrzeug]").forEach((btn) => {
    btn.addEventListener("click", () => raceFahrzeugSetzen(btn.getAttribute("data-fahrzeug")));
  });
}

function createKartElement(uid) {
  const svgNS = "http://www.w3.org/2000/svg";
  const kart = document.createElementNS(svgNS, "g");
  kart.setAttribute("class", "race-kart");

  /* NUR DAS EIGENE FAHRZEUG richtet sich nach der eigenen Wahl.

     Das war zuerst falsch: raceFahrzeugWahl() wurde fuer JEDEN
     Mitfahrer aufgerufen, und sie liest die Wahl aus dem eigenen
     localStorage. Wer sich einen Buggy aussuchte, sah damit das ganze
     Feld im Buggy fahren.

     Die Wahl der anderen kennt der Browser nicht - sie steht bewusst
     nur lokal, weil sie rein optisch ist und nichts am Fortschritt
     aendert. Alle anderen fahren deshalb das Standardfahrzeug des
     Gelaendes (den ersten Eintrag der Liste), genau wie vor dieser
     Runde. */
  const eigenes = raceEigeneUid && uid === raceEigeneUid;
  const fahrzeug = eigenes
    ? raceFahrzeugWahl()
    : RACE_FAHRZEUGE[raceGelaende()][0];
  const bodyMarkup = fahrzeug.markup();

  /* Krone ist Teil von .kart-inner, damit sie WIRKLICH fest am Fahrzeug
     "verschweißt" ist - sie bewegt, dreht und bobt exakt mit dem Auto mit,
     statt separat zu schweben.

     .kart-neigung dazwischen traegt Gegenstauchung, Blickrichtung,
     Kurvenlage und Tiefenmassstab (siehe positionKart). Eine EIGENE
     Gruppe, weil .kart-inner bereits die Huepf-Animation im transform
     hat - beides in einer Gruppe wuerde sich gegenseitig ueberschreiben. */
  /* Der Name braucht seine EIGENE Gegenstauchung. Er sass sonst zu
     tief (16 mal 0,62 sind nur noch 10 Bildpunkte Abstand, er lag
     also halb auf dem Fahrzeug) und war dazu in der Hoehe
     zusammengedrueckt. Die Gruppe streckt ihn um denselben Faktor,
     um den die Ebene ihn staucht - beides hebt sich exakt auf, und
     zwar fuer Lage UND Buchstabenform. Anders als beim Fahrzeug ohne
     Drehung: ein Name, der sich mit der Fahrtrichtung mitdreht, waere
     auf der Gegengeraden auf dem Kopf. */
  kart.innerHTML =
    `<g class="kart-label-lage" transform="scale(1,${RACE_GEGENSTAUCHUNG})">` +
    `<text class="kart-label" y="-16" text-anchor="middle"></text></g>` +
    `<g class="kart-neigung">${bodyMarkup}</g>`;
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
  const s0 = clamped * length;
  const point = pathEl.getPointAtLength(s0);
  const lookAhead = pathEl.getPointAtLength(Math.min(length, s0 + 2));

  /* WARUM DIE BLICKRICHTUNG NICHT EINFACH atan2(dy, dx) IST
     Die ganze Ebene ist in der Hoehe gestaucht (matrix d=0.62 auf
     #race-neigung). Eine Fahrtrichtung, die im Pfad 45 Grad hat, sieht
     auf dem Bild flacher aus. Wer den ungestauchten Winkel nimmt, laesst
     das Fahrzeug schraeg zur eigenen Spur stehen - besonders auffaellig
     in den Kurven. Deshalb wird dy vorher mitgestaucht. */
  const angle = Math.atan2((lookAhead.y - point.y) * RACE_STAUCHUNG,
                           lookAhead.x - point.x) * (180 / Math.PI);

  /* KURVENLAGE: der Unterschied der Blickrichtung ueber ein kurzes
     Stueck ist die Kruemmung. Positiv heisst Rechtskurve. Als Scherung
     aufgetragen legt sich das Fahrzeug in die Kurve, statt starr auf
     der Linie zu kleben. */
  const weiter = pathEl.getPointAtLength(Math.min(length, s0 + 16));
  const winkel2 = Math.atan2((weiter.y - lookAhead.y) * RACE_STAUCHUNG,
                             weiter.x - lookAhead.x) * (180 / Math.PI);
  let dw = winkel2 - angle;
  while (dw > 180) dw -= 360;
  while (dw < -180) dw += 360;
  const lage = Math.max(-16, Math.min(16, dw * 0.9));

  /* TIEFE: was weiter unten liegt, ist naeher an der Kamera. Ein
     kleiner Groessenunterschied reicht - die Stauchung allein sagt
     "gekippte Ebene", erst der Massstab sagt "und ich sehe sie
     perspektivisch". */
  const tiefe = 0.86 + 0.28 * Math.max(0, Math.min(1, point.y / 300));

  let kart = raceKartElements[uid];
  if (!kart) {
    kart = createKartElement(uid);
    raceKartElements[uid] = kart;
  }

  kart.querySelector(".kart-body").setAttribute("fill", `url(#${raceKartGradients[colorIndex % raceKartGradients.length]})`);
  kart.querySelector(".kart-label").textContent = nickname;
  kart.querySelector(".kart-number").textContent = colorIndex + 1;
  /* Die Drehung sitzt jetzt IN der Neigungsgruppe, nicht mehr hier:
     nur so laesst sich die Stauchung der Ebene sauber herausrechnen
     (scale nach aussen, rotate nach innen). Nebenbei kann .race-kart
     dadurch eine reine Verschiebung ueberblenden - eine mitlaufende
     Drehung wuerde beim Ueberschreiten von 180 Grad einmal
     durchdrehen. */
  kart.style.transform = `translate(${point.x}px, ${point.y}px)`;
  const neigung = kart.querySelector(".kart-neigung");
  if (neigung) {
    neigung.setAttribute("transform",
      `scale(${tiefe.toFixed(3)}) scale(1,${RACE_GEGENSTAUCHUNG}) ` +
      `rotate(${angle.toFixed(1)}) skewX(${lage.toFixed(1)})`);
  }
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

  const svgNS = "http://www.w3.org/2000/svg";
  const x = parseFloat(match[1]);
  const y = parseFloat(match[2]);

  /* Die Spur richtet sich nach dem Gelaende: ein Kart wirbelt Staub
     auf, ein Boot zieht Kielwasser, ein Flugzeug einen
     Kondensstreifen. Dieselbe gelbe Flamme fuer alle drei sah beim
     Segelboot aus wie ein Motorschaden. */
  const g = raceGelaende();
  let el;

  if (g === "boat") {
    // Kielwasser: ein flacher Bogen quer zur Fahrtrichtung, der
    // auseinanderlaeuft.
    el = document.createElementNS(svgNS, "path");
    el.setAttribute("d", `M${(x - 7).toFixed(1)},${y.toFixed(1)} q7,-3 14,0`);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "rgba(255,255,255,.75)");
    el.setAttribute("stroke-width", "1.6");
    el.setAttribute("stroke-linecap", "round");
  } else if (g === "plane") {
    // Kondensstreifen: kurzer weisser Strich, der ausduennt.
    el = document.createElementNS(svgNS, "line");
    el.setAttribute("x1", (x - 9).toFixed(1));
    el.setAttribute("y1", y.toFixed(1));
    el.setAttribute("x2", (x + 2).toFixed(1));
    el.setAttribute("y2", y.toFixed(1));
    el.setAttribute("stroke", "rgba(240,248,255,.8)");
    el.setAttribute("stroke-width", "2.2");
    el.setAttribute("stroke-linecap", "round");
  } else {
    // Staub: kleine Wolken in der Farbe des Untergrunds statt gelber
    // Flammen - aufgewirbelter Sand ist sandfarben.
    const track = getWeeklyTrack();
    const grund = track ? track.grass : "#5a4426";
    el = document.createElementNS(svgNS, "circle");
    el.setAttribute("cx", (x + (Math.random() - 0.5) * 5).toFixed(1));
    el.setAttribute("cy", (y + (Math.random() - 0.5) * 4).toFixed(1));
    el.setAttribute("r", (2.5 + Math.random() * 2).toFixed(1));
    el.setAttribute("fill", raceTonMischen(grund, "#ffffff", 0.35));
  }

  el.setAttribute("class", "race-trail-dot");
  layer.insertBefore(el, leaderKart);
  setTimeout(() => el.remove(), 700);
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

/* Balkenfarben der Ergebnisliste - dieselbe Reihenfolge wie die
   kart-grad-*-Verlaeufe der Strecke, damit Zeile und Fahrzeug
   dieselbe Farbe tragen. */
const RACE_ROW_COLORS = [
  "#ff5252", "#4da3ff", "#ffd76b", "#8a6bff",
  "#4ade80", "#ff9f4d", "#f472b6", "#38bdf8",
];

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

  /* Zeilenform aus dem Entwurf (2c): Platz, Name, ein kurzer
     Fortschrittsbalken und die Punktzahl. Der Balken zeigt den
     Stand zur Ziellinie - dieselbe Bezugsgroesse wie die
     Kart-Position auf der Strecke darueber. */
  const ziel = (typeof raceConfig !== "undefined" && raceConfig.finishLine) || 150;

  let html = "";
  entries.forEach((entry, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
    const rewardHtml = i < 3 ? `<span class="race-result-reward">+${RACE_REWARDS_BY_RANK[i]} 💰</span>` : "";
    const frameRowClass = typeof rowFrameClass === "function" && typeof frameStyleFromId === "function"
      ? rowFrameClass(frameStyleFromId(entry.equippedFrame))
      : "";

    const anteil = Math.max(0, Math.min(100, Math.round((entry.progress / ziel) * 100)));
    const farbe = RACE_ROW_COLORS[i % RACE_ROW_COLORS.length];

    html += `
      <div class="race-result-row fh-row ${frameRowClass}">
        <span class="fh-row-nr race-result-rank">${medal}</span>
        <span class="fh-row-main race-result-name">${escapeHtml(entry.nickname || "Unbekannt")}</span>
        ${rewardHtml}
        <span class="race-result-bar"><span class="race-result-bar-fill" style="width:${anteil}%;background:${farbe}"></span></span>
        <span class="race-result-points">${entry.progress}</span>
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

  if (!supabaseClient) {
    // Siehe Kommentar bei loadLeaderboard() in wheel.js - !supabaseClient
    // kann auch bedeuten, dass bei einem echten Besucher nur das
    // Supabase-JS-SDK nicht geladen hat, nicht dass die Seite nie
    // konfiguriert wurde. Deshalb keine internen Dateipfade im UI.
    if (emptyEl) {
      emptyEl.textContent = "⚠️ Verbindung nicht verfügbar - versuch's später nochmal.";
      emptyEl.style.display = "flex";
    }
    return;
  }

  /* Platzhalter, solange die Abfrage laeuft - aber nur beim ersten
     Aufbau. addRaceProgress() ruft diese Funktion nach jeder
     Rad-Drehung und jedem geknackten Code auf; waere der Platzhalter
     dort auch zu sehen, wuerde die fertige Liste bei jedem Punkt
     kurz durch graue Balken ersetzt. */
  const listeEl = document.getElementById("race-results-list");
  if (listeEl && !listeEl.children.length && typeof fhSkeletonList === "function") {
    listeEl.innerHTML = fhSkeletonList(5, { label: "Lade Rennstand ..." });
  }

  const currentWeek = getCurrentWeekId();

  supabaseClient
    .from("race_progress")
    .select("firebase_uid, nickname, progress, equipped_frame")
    .eq("week", currentWeek)
    .order("progress", { ascending: false })
    .limit(raceConfig.topPlayersShown)
    .then(({ data, error }) => {
      if (error) throw error;
      const entries = (data || []).map((row) => ({
        uid: row.firebase_uid,
        nickname: row.nickname,
        progress: row.progress,
        equippedFrame: row.equipped_frame,
      }));
      renderRaceTrack(entries, "Noch niemand ist diese Woche gestartet – sei der Erste!");
    })
    .catch((err) => {
      console.error("Rennen konnte nicht geladen werden:", err);
      if (!emptyEl) return;
      emptyEl.textContent = "Rennen konnte nicht geladen werden.";
      emptyEl.style.display = "flex";
    });
}

/* ------------------------------------------------------
   SIEGER DER LETZTEN WOCHE
------------------------------------------------------ */
function loadLastWeekWinner() {
  const el = document.getElementById("race-last-winner");
  if (!el || !supabaseClient) return;

  const previousWeek = getPreviousWeekId();

  supabaseClient
    .from("race_progress")
    .select("firebase_uid, nickname, progress")
    .eq("week", previousWeek)
    .order("progress", { ascending: false })
    .limit(3)
    .then(({ data, error }) => {
      if (error) throw error;
      const entries = data || [];

      if (!entries.length) {
        el.textContent = "Letzte Woche gab es noch keinen Sieger.";
        return;
      }

      const winner = entries[0];
      el.textContent = `🏆 Sieger der letzten Woche: ${winner.nickname} mit ${winner.progress} Punkten!`;

      grantWeeklyRaceCurrency(previousWeek, entries);
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
async function grantWeeklyRaceCurrency(weekId, topEntries) {
  const claimKey = `raceRewardClaimed_${weekId}`;
  if (localStorage.getItem(claimKey)) return;
  if (typeof addCurrency !== "function" || typeof wheelAuthReady === "undefined") return;

  const ownUid = await wheelAuthReady;
  if (!ownUid) return;

  const rewardsByRank = RACE_REWARDS_BY_RANK;
  const ownIndex = topEntries.findIndex((entry) => entry.firebase_uid === ownUid);

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
    // Bewusst kuerzer als der Hinweis in refreshOwnRaceProgress() (der
    // direkt darueber steht) - sonst stehen zwei Mal fast wortgleiche
    // Saetze untereinander, sobald kein Name gesetzt ist.
    statusEl.textContent = "Erst nach der Anmeldung im 🧭 Schatzrad verfügbar.";
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
/* ------------------------------------------------------
   STRECKE ZEICHNEN (GSAP DrawSVGPlugin)
   ---------------------------------------------------
   Die Fahrbahn war beim Betreten der Seite einfach da. Jetzt
   waechst sie in gut einer Sekunde von der Ziellinie aus - erst
   der dunkle Asphalt, kurz versetzt die hellere Innenbahn, zum
   Schluss die gestrichelte Mittellinie.

   DrawSVG arbeitet ueber stroke-dasharray/-dashoffset. Das
   beruehrt getPointAtLength() NICHT, mit dem race.js die
   Kart-Positionen auf dem Pfad berechnet - die Karts stehen also
   waehrenddessen und danach exakt richtig.

   Die Mittellinie ist bewusst ausgenommen: sie traegt schon ein
   eigenes stroke-dasharray (die Striche), das DrawSVG
   ueberschreiben wuerde. Sie wird stattdessen eingeblendet.
------------------------------------------------------ */
function drawRaceTrack() {
  const prefersReduced = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  if (typeof gsap === "undefined" || typeof DrawSVGPlugin === "undefined") return;

  const road = document.getElementById("race-track-path");
  const inner = document.getElementById("race-road-inner");
  const center = document.getElementById("race-center-line");
  if (!road || !road.getAttribute("d")) return;

  const tl = gsap.timeline();
  tl.fromTo(road, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1, ease: "power2.inOut" });
  if (inner) {
    tl.fromTo(inner, { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1, ease: "power2.inOut" }, 0.12);
  }
  if (center) {
    tl.fromTo(center, { opacity: 0 }, { opacity: 0.45, duration: 0.4 }, 0.95);
  }
}

function updateRacePage(pageID) {
  if (pageID !== "race") {
    stopRaceCountdown();
    stopRaceTrail();
    return;
  }

  buildRaceTrack();
  drawRaceTrack();
  refreshOwnRaceProgress();
  refreshRaceDailyStatus();
  loadRaceLeaderboard();
  loadLastWeekWinner();
  startRaceCountdown();
}
