/* ======================================================
   DER PIRATENPASS ALS SCHATZKARTE
   ---------------------------------------------------
   Die Belohnungsstrecke war eine gerade Reihe, die man seitwaerts
   scrollen musste - funktional, aber sie erzaehlt nichts. Hier
   wird daraus eine Karte: eine geschwungene Route ueber offenes
   Wasser, die Stufen als Stationen darauf, der bereits gefahrene
   Teil als gestrichelte Fahrtlinie, das Ziel als Kreuz.

   Bildschirmfuellend und ueber einen Knopf im Passkopf zu oeffnen.
   Die Reihe bleibt daneben bestehen - sie ist auf dem Handy und
   fuer den schnellen Blick weiterhin der kuerzere Weg.

   WIE DIE STATIONEN AUF DIE ROUTE KOMMEN
   Nicht von Hand gesetzt: der Kurs ist EIN SVG-Pfad, und die
   Stationen werden mit getPointAtLength() gleichmaessig darauf
   verteilt. Damit passt die Karte automatisch, wenn eine Saison
   mehr oder weniger Stufen hat - es ist nichts nachzuzeichnen.

   WOHER DIE DATEN KOMMEN
   renderPassPage() in piratenpass.js legt seinen fertig
   berechneten Stand in fhPassStand ab. Die Karte liest ihn von
   dort, statt dieselben Abfragen ein zweites Mal zu stellen. Ist
   noch nichts da (die Karte laesst sich ohnehin nur ueber den Knopf
   im gerenderten Pass oeffnen), passiert nichts.
====================================================== */

(function () {
  "use strict";

  /* Der Kurs. Eine Serpentine ueber vier Bahnen - lang genug, dass
     50 Stationen mit Abstand daraufpassen, und geschwungen genug,
     dass es nach Seeweg aussieht und nicht nach Zeitstrahl. */
  const KURS =
    "M 70,120 C 210,60 330,60 470,120 S 720,210 880,150" +
    " C 960,120 985,190 930,240 S 700,300 520,270" +
    " C 340,240 190,250 120,320 S 90,420 260,440" +
    " S 620,410 800,450 C 900,472 940,530 870,560";

  const BREITE = 1000;
  const HOEHE = 620;

  let overlay = null;
  let vorherFokus = null;

  function istEn() {
    return typeof getCurrentLang === "function" && getCurrentLang() === "en";
  }

  function reduziert() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function schliessen() {
    if (!overlay) return;
    document.removeEventListener("keydown", beiTaste);
    overlay.remove();
    overlay = null;
    // Fokus dorthin zurueck, wo er herkam - sonst landet er nach dem
    // Zuklappen auf <body> und die Tastaturbedienung faengt oben an.
    if (vorherFokus && vorherFokus.isConnected) {
      try { vorherFokus.focus(); } catch (err) { /* egal */ }
    }
    vorherFokus = null;
  }

  function beiTaste(e) {
    if (e.key === "Escape") { e.preventDefault(); schliessen(); return; }
    if (e.key !== "Tab" || !overlay) return;

    /* Fokusfalle: solange die Karte offen ist, soll die Tabkette
       nicht hinter sie laufen. */
    const ziele = overlay.querySelectorAll('button, [tabindex="0"]');
    if (!ziele.length) return;
    const erster = ziele[0];
    const letzter = ziele[ziele.length - 1];
    if (e.shiftKey && document.activeElement === erster) {
      e.preventDefault(); letzter.focus();
    } else if (!e.shiftKey && document.activeElement === letzter) {
      e.preventDefault(); erster.focus();
    }
  }

  /* Zustand einer Stufe - dieselbe Regel wie in der Reihe. */
  function zustand(stand, stufe) {
    const belohnung = stand.pass.rewards[stufe];
    if (!belohnung) return null;
    const id = typeof getPassRewardId === "function"
      ? getPassRewardId(stand.pass, stufe) : String(stufe);
    const eingeloest = stand.claimedIds.indexOf(id) >= 0 ||
      (belohnung.type === "cap" && stand.hasCap);
    return {
      belohnung: belohnung,
      art: stufe > stand.currentTier ? "locked" : (eingeloest ? "claimed" : "ready"),
      hier: stufe === Math.max(1, stand.currentTier),
    };
  }

  function oeffnen() {
    if (overlay) return;
    const stand = window.fhPassStand;
    if (!stand || !stand.pass) return;

    const en = istEn();
    vorherFokus = document.activeElement;

    overlay = document.createElement("div");
    overlay.className = "fh-schatzkarte";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", en ? "Pirate Pass treasure map" : "Piratenpass als Schatzkarte");

    overlay.innerHTML = `
      <div class="fh-schatzkarte-kopf">
        <p class="fh-schatzkarte-kicker">${en ? "SEASON 1" : "SAISON 1"}</p>
        <h2 class="fh-schatzkarte-titel">${en ? "The route" : "Die Route"}</h2>
        <p class="fh-schatzkarte-stand">${en ? "Tier" : "Stufe"} ${stand.currentTier} / ${stand.pass.levels}</p>
        <button type="button" class="fh-schatzkarte-zu"
                aria-label="${en ? "Close map" : "Karte schliessen"}">✕</button>
      </div>
      <div class="fh-schatzkarte-blatt">
        <svg class="fh-schatzkarte-svg" viewBox="0 0 ${BREITE} ${HOEHE}"
             preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <radialGradient id="fh-karte-grund" cx="50%" cy="45%" r="75%">
              <stop offset="0%"   stop-color="#14304a"/>
              <stop offset="100%" stop-color="#081726"/>
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="${BREITE}" height="${HOEHE}" fill="url(#fh-karte-grund)"/>
          <g class="fh-karte-deko"></g>
          <path class="fh-karte-kurs-grund" d="${KURS}"/>
          <path class="fh-karte-kurs-fahrt" d="${KURS}"/>
          <g class="fh-karte-stationen"></g>
        </svg>
      </div>
      <p class="fh-schatzkarte-fuss">${en
        ? "Pick a station for details. Esc closes the map."
        : "Station anklicken für Einzelheiten. Esc schliesst die Karte."}</p>
    `;

    document.body.appendChild(overlay);

    const svg = overlay.querySelector(".fh-schatzkarte-svg");
    const kursGrund = overlay.querySelector(".fh-karte-kurs-grund");
    const kursFahrt = overlay.querySelector(".fh-karte-kurs-fahrt");
    const gDeko = overlay.querySelector(".fh-karte-deko");
    const gStationen = overlay.querySelector(".fh-karte-stationen");

    const laenge = kursGrund.getTotalLength();
    const stufen = stand.pass.levels;

    /* Fahrtlinie: nur bis zur erreichten Stufe sichtbar. Ueber
       stroke-dasharray, damit sie beim Oeffnen mitwachsen kann. */
    const anteil = Math.min(1, Math.max(0, stand.currentTier / stufen));
    const gefahren = laenge * anteil;
    kursFahrt.style.strokeDasharray = laenge + " " + laenge;
    kursFahrt.style.strokeDashoffset = String(laenge - gefahren);

    /* Ein paar Inseln als Beiwerk - feste Punkte, damit die Karte
       bei jedem Oeffnen gleich aussieht. */
    [[180, 210, 26], [640, 120, 18], [880, 330, 22], [330, 520, 20], [700, 560, 15]]
      .forEach(function (i) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        el.setAttribute("cx", i[0]); el.setAttribute("cy", i[1]); el.setAttribute("r", i[2]);
        el.setAttribute("class", "fh-karte-insel");
        gDeko.appendChild(el);
      });

    /* Kompassrose oben rechts. */
    const rose = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rose.setAttribute("class", "fh-karte-rose");
    rose.setAttribute("transform", "translate(925, 70)");
    rose.innerHTML =
      '<circle r="30" class="fh-karte-rose-ring"/>' +
      '<path d="M0,-34 L7,0 L0,34 L-7,0 Z" class="fh-karte-rose-nadel"/>' +
      '<path d="M-34,0 L0,-6 L34,0 L0,6 Z" class="fh-karte-rose-quer"/>' +
      '<text y="-38" text-anchor="middle" class="fh-karte-rose-n">N</text>';
    gDeko.appendChild(rose);

    /* Die Stationen gleichmaessig auf dem Kurs verteilen. */
    const punkte = [];
    for (let stufe = 1; stufe <= stufen; stufe++) {
      const z = zustand(stand, stufe);
      if (!z) continue;

      const p = kursGrund.getPointAtLength(laenge * ((stufe - 0.5) / stufen));
      punkte.push({ stufe: stufe, x: p.x, y: p.y, z: z });
    }

    const gross = punkte.length ? punkte[punkte.length - 1].stufe : 0;

    punkte.forEach(function (pt, i) {
      const letzte = pt.stufe === gross;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class",
        "fh-karte-station fh-karte-station-" + pt.z.art +
        (pt.z.hier ? " fh-karte-station-hier" : "") +
        (letzte ? " fh-karte-station-ziel" : ""));
      g.setAttribute("transform", "translate(" + pt.x.toFixed(1) + "," + pt.y.toFixed(1) + ")");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      const bez = typeof passRewardLabel === "function"
        ? passRewardLabel(pt.z.belohnung, en) : "";
      g.setAttribute("aria-label",
        (en ? "Tier " : "Stufe ") + pt.stufe + (bez ? ": " + bez : ""));
      g.style.setProperty("--fh-karte-verzug", (i * 0.012).toFixed(3) + "s");

      /* Das Ziel ist ein Kreuz, alles andere ein Punkt mit Nummer. */
      g.innerHTML = letzte
        ? '<path d="M-13,-13 L13,13 M13,-13 L-13,13" class="fh-karte-kreuz"/>' +
          '<circle r="20" class="fh-karte-ziel-ring"/>'
        : '<circle r="11" class="fh-karte-punkt"/>' +
          '<text y="4" text-anchor="middle" class="fh-karte-nummer">' + pt.stufe + "</text>";

      if (pt.z.hier) {
        g.innerHTML +=
          '<circle r="20" class="fh-karte-hier-ring"/>' +
          '<text y="-26" text-anchor="middle" class="fh-karte-hier-text">' +
          (en ? "YOU" : "DU") + "</text>";
      }

      function ausloesen() {
        if (typeof showPassTierTooltip === "function") showPassTierTooltip(pt.stufe);
      }
      g.addEventListener("click", ausloesen);
      g.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        ausloesen();
      });

      gStationen.appendChild(g);
    });

    /* Die Fahrtlinie einmal nachziehen lassen. Bei reduzierter
       Bewegung steht sie sofort da. */
    if (!reduziert()) {
      kursFahrt.style.transition = "none";
      kursFahrt.style.strokeDashoffset = String(laenge);
      // Ein Bild warten, sonst fasst der Browser beide Werte zusammen
      // und es gibt keinen Uebergang.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          kursFahrt.style.transition = "stroke-dashoffset 1.5s var(--fh-ease, ease)";
          kursFahrt.style.strokeDashoffset = String(laenge - gefahren);
        });
      });
    }

    overlay.querySelector(".fh-schatzkarte-zu").addEventListener("click", schliessen);
    overlay.addEventListener("click", function (e) {
      // Klick auf den Grund schliesst, Klick auf Karte oder Kopf nicht.
      if (e.target === overlay) schliessen();
    });
    document.addEventListener("keydown", beiTaste);

    /* Auf schmalen Bildschirmen wird die Karte geschoben statt
       geschrumpft (siehe css/90-typografie.css). Dann soll der Blick
       dort anfangen, wo man gerade steht - nicht bei Stufe 1. */
    const blatt = overlay.querySelector(".fh-schatzkarte-blatt");
    const hier = overlay.querySelector(".fh-karte-station-hier");
    if (blatt && hier && blatt.scrollWidth > blatt.clientWidth) {
      const m = /translate\(([-\d.]+),/.exec(hier.getAttribute("transform"));
      if (m) {
        const anteil = parseFloat(m[1]) / BREITE;
        blatt.scrollLeft = Math.max(0,
          anteil * blatt.scrollWidth - blatt.clientWidth / 2);
      }
    }

    const zu = overlay.querySelector(".fh-schatzkarte-zu");
    if (zu) zu.focus();

    // svg wird nur zur Vollstaendigkeit gehalten - alle Eingriffe
    // laufen ueber die Gruppen darin.
    void svg;
  }

  window.fhSchatzkarteOeffnen = oeffnen;
  window.fhSchatzkarteSchliessen = schliessen;
})();
