/* ======================================================
   DER PIRATENPASS ALS SCHATZKARTE
   ---------------------------------------------------
   Die Belohnungsstrecke war eine gerade Reihe, die man seitwaerts
   scrollen musste - funktional, aber sie erzaehlt nichts. Hier
   wird daraus eine Karte: eine geschwungene Route ueber offenes
   Wasser, die Stufen als Stationen darauf, der bereits gefahrene
   Teil als Fahrtlinie, das Ziel als Kreuz.

   Bildschirmfuellend und ueber einen Knopf im Passkopf zu oeffnen.
   Die Reihe bleibt daneben bestehen - sie ist fuer den schnellen
   Blick weiterhin der kuerzere Weg.

   WIE DIE STATIONEN AUF DIE ROUTE KOMMEN
   Nicht von Hand gesetzt: der Kurs ist EIN SVG-Pfad, und die
   Stationen werden mit getPointAtLength() gleichmaessig darauf
   verteilt. Damit passt die Karte automatisch, wenn eine Saison
   mehr oder weniger Stufen hat - es ist nichts nachzuzeichnen.

   WOHER DIE DATEN KOMMEN
   renderPassPage() in piratenpass.js legt seinen fertig
   berechneten Stand in fhPassStand ab. Die Karte liest ihn von
   dort, statt dieselben Abfragen ein zweites Mal zu stellen.

   WARUM PERGAMENT UND NICHT BILDSCHIRM
   Vorher lag die Route auf einem blauen Farbverlauf mit weisser
   und goldener Zeichnung - das sah aus wie eine Benutzeroberflaeche
   mit Seefahrtsmotiv. Eine Karte ist Papier: warmer Grund,
   Faserstruktur, dunkelbraune Tinte, roter Kurs. Erst dadurch liest
   sich das Ganze als Dokument statt als Anzeige. Der Faserfilter
   ist derselbe feTurbulence, den die Seite schon fuer die Koernung
   ueber allem benutzt (body::after in css/70-entwurf-1c.css).

   WAS SICH ZUFAELLIG ANFUEHLT, IST ES NICHT
   Inselumrisse, Seeungeheuer, Wrack und Wellenstriche werden
   erwuerfelt - aber aus einem FESTEN Anfangswert. Beim zweiten
   Oeffnen sieht die Karte deshalb genauso aus wie beim ersten. Eine
   Karte, die sich bei jedem Blick veraendert, ist keine Karte.
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

  /* Grenzen fuer Zoom und Schwenken. Weiter als 1:1 herausziehen
     bringt nichts (die Karte ist dann kleiner als das Blatt), und
     mehr als vierfach heran macht die Striche nur dick. */
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;

  let overlay = null;
  let vorherFokus = null;

  /* Der Ausschnitt, den man gerade sieht. Wird als viewBox gesetzt -
     kein CSS-transform: so bleiben Strichstaerken und Schriftgroessen
     unveraendert, und die Karte wird beim Heranziehen wirklich
     genauer statt nur groesser. */
  let sicht = null;

  function istEn() {
    return typeof getCurrentLang === "function" && getCurrentLang() === "en";
  }

  function reduziert() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ------------------------------------------------------
     FESTER ZUFALL
     Immer derselbe Anfangswert, immer dieselbe Karte.
  ------------------------------------------------------ */
  function wuerfel(text) {
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

  /* ------------------------------------------------------
     EIN INSELUMRISS
     ---------------------------------------------------
     Vorher waren die Inseln fuenf Kreise. Ein Kreis ist keine
     Insel - er ist ein Kreis. Hier wird ein Ring aus Punkten mit
     schwankendem Abstand vom Mittelpunkt gelegt und durch die
     Mittelpunkte der Verbindungen weich hindurchgezogen. Das
     ergibt geschlossene, unregelmaessige Formen ohne Ecken.
  ------------------------------------------------------ */
  function inselPfad(cx, cy, r, w, unruhe) {
    const n = 11;
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const rr = r * (1 - unruhe / 2 + w() * unruhe);
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.78]);
    }
    // Durch die Mittelpunkte laufen, die Stuetzpunkte als Kontrolle -
    // so schliesst sich die Kurve ohne sichtbaren Knick.
    const m = (i) => [(p[i][0] + p[(i + 1) % n][0]) / 2,
                      (p[i][1] + p[(i + 1) % n][1]) / 2];
    let d = "M" + m(n - 1)[0].toFixed(1) + "," + m(n - 1)[1].toFixed(1);
    for (let i = 0; i < n; i++) {
      const mi = m(i);
      d += " Q" + p[i][0].toFixed(1) + "," + p[i][1].toFixed(1) +
           " " + mi[0].toFixed(1) + "," + mi[1].toFixed(1);
    }
    return d + " Z";
  }

  /* ------------------------------------------------------
     BEIWERK
     ---------------------------------------------------
     Inseln mit Hoehenlinien, ein Seeungeheuer, ein Wrack,
     Wellenstriche und die Kompassrose. Alles wird von der Route
     ferngehalten: der Kurs wird abgetastet, und was zu nah liegt,
     faellt weg. Sonst laege ein Seeungeheuer auf Stufe 23.
  ------------------------------------------------------ */
  function beiwerk(gDeko, kursEl, laenge) {
    const w = wuerfel("firehelmet-schatzkarte-1");
    const teile = [];

    // Die Route abtasten, um sie freizuhalten.
    const bahn = [];
    for (let i = 0; i <= 120; i++) {
      const pt = kursEl.getPointAtLength((laenge * i) / 120);
      bahn.push([pt.x, pt.y]);
    }
    function freiVonRoute(x, y, abstand) {
      const q = abstand * abstand;
      for (let i = 0; i < bahn.length; i++) {
        const dx = bahn[i][0] - x, dy = bahn[i][1] - y;
        if (dx * dx + dy * dy < q) return false;
      }
      return true;
    }

    /* --- Inseln --- */
    let gesetzt = 0, versuche = 0;
    const inseln = [];
    while (gesetzt < 6 && versuche < 200) {
      versuche++;
      const x = 70 + w() * (BREITE - 140);
      const y = 60 + w() * (HOEHE - 120);
      const r = 26 + w() * 30;
      if (!freiVonRoute(x, y, r + 34)) continue;
      // Auch untereinander Abstand halten.
      let frei = true;
      for (const i of inseln) {
        const dx = i[0] - x, dy = i[1] - y;
        if (Math.sqrt(dx * dx + dy * dy) < r + i[2] + 40) { frei = false; break; }
      }
      if (!frei) continue;
      inseln.push([x, y, r]);
      gesetzt++;

      teile.push('<g class="fh-karte-insel">' +
        '<path class="fh-karte-insel-flaeche" d="' + inselPfad(x, y, r, w, 0.55) + '"/>' +
        '<path class="fh-karte-insel-linie" d="' + inselPfad(x, y, r * 0.66, w, 0.4) + '"/>' +
        '<path class="fh-karte-insel-linie" d="' + inselPfad(x, y, r * 0.36, w, 0.3) + '"/>' +
        '</g>');
    }

    /* --- Wellenstriche: das "Meer" zwischen den Inseln --- */
    let wellen = 0; versuche = 0;
    while (wellen < 26 && versuche < 500) {
      versuche++;
      const x = 40 + w() * (BREITE - 80);
      const y = 40 + w() * (HOEHE - 80);
      if (!freiVonRoute(x, y, 44)) continue;
      let frei = true;
      for (const i of inseln) {
        const dx = i[0] - x, dy = i[1] - y;
        if (Math.sqrt(dx * dx + dy * dy) < i[2] + 26) { frei = false; break; }
      }
      if (!frei) continue;
      wellen++;
      const b = 9 + w() * 7;
      teile.push('<path class="fh-karte-welle" d="M' + (x - b).toFixed(1) + ',' + y.toFixed(1) +
        ' q' + (b / 2).toFixed(1) + ',-4 ' + b.toFixed(1) + ',0 q' +
        (b / 2).toFixed(1) + ',4 ' + b.toFixed(1) + ',0"/>');
    }

    /* --- Seeungeheuer --- */
    for (let versuch = 0; versuch < 60; versuch++) {
      const x = 140 + w() * (BREITE - 320);
      const y = 90 + w() * (HOEHE - 180);
      if (!freiVonRoute(x, y, 76)) continue;
      /* Anderthalbfach: bei Originalgroesse las es sich aus dem
         Abstand, in dem man die ganze Karte sieht, als kleiner Fisch.
         Ein Seeungeheuer, das man uebersieht, ist keines. */
      teile.push(
        '<g class="fh-karte-untier" transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(1.5)">' +
        // drei Buckel, die aus dem Wasser ragen
        '<path d="M-60,10 q14,-22 28,0 q14,-22 28,0 q14,-22 28,0"/>' +
        /* Hals und Kopf schliessen direkt an den letzten Buckel an.
           Mit dem urspruenglichen Abstand von 32 Einheiten sah der
           Kopf aus wie ein eigenes Tier daneben - gemeint war ein
           Hals, der zwischen zwei Wellen kurz untertaucht, aber so
           weit taucht keiner. */
        '<path d="M24,10 q10,-24 30,-18 q12,4 10,16 q-2,11 -16,12 Z"/>' +
        '<circle class="fh-karte-untier-auge" cx="44" cy="-2" r="2.4"/>' +
        '<path d="M36,12 l3,5 l3,-5 l3,5 l3,-5"/>' +
        // Schwanzflosse
        '<path d="M-60,10 q-16,-6 -22,-18 q16,4 22,10 q6,-8 16,-10"/>' +
        '</g>');
      break;
    }

    /* --- Wrack --- */
    for (let versuch = 0; versuch < 60; versuch++) {
      const x = 120 + w() * (BREITE - 260);
      const y = 90 + w() * (HOEHE - 180);
      if (!freiVonRoute(x, y, 62)) continue;
      /* Ein Wrack muss als Wrack lesbar sein. Mit -14 Grad und
         ganzem Mast sah es aus wie ein zweites, intaktes Schiff -
         auf einer Karte, auf der schon ein Schiff faehrt, ist das
         schlicht verwirrend. Jetzt kippt es um 38 Grad, der Mast ist
         auf halber Hoehe abgebrochen (zwei getrennte Stuecke), und
         die Spanten liegen frei. */
      teile.push(
        '<g class="fh-karte-wrack" transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(38)">' +
        '<path d="M-26,6 q26,10 52,0 l-6,10 q-20,7 -40,0 Z"/>' +   // Rumpf, tief im Wasser
        '<path d="M0,6 L-3,-14"/>' +                               // Maststumpf
        '<path d="M-9,-24 L-16,-33"/>' +                           // abgebrochenes Stueck daneben
        '<path d="M-18,3 l-1,-11 M-8,5 l-1,-12 M8,3 l1,-10"/>' +   // freiliegende Spanten
        '<path d="M-26,6 q8,-6 16,-2"/>' +                          // aufgerissene Bordwand
        '</g>');
      break;
    }

    /* --- Kompassrose --- */
    teile.push(
      '<g class="fh-karte-rose" transform="translate(922, 74)">' +
      '<circle r="34" class="fh-karte-rose-ring"/>' +
      '<circle r="26" class="fh-karte-rose-ring"/>' +
      '<path d="M0,-38 L8,0 L0,38 L-8,0 Z" class="fh-karte-rose-nadel"/>' +
      '<path d="M-38,0 L0,-7 L38,0 L0,7 Z" class="fh-karte-rose-quer"/>' +
      '<path d="M-24,-24 L3,-3 L24,24 L-3,3 Z" class="fh-karte-rose-quer" opacity=".5"/>' +
      '<path d="M24,-24 L3,3 L-24,24 L-3,-3 Z" class="fh-karte-rose-quer" opacity=".5"/>' +
      '<text y="-42" text-anchor="middle" class="fh-karte-rose-n">N</text>' +
      '</g>');

    /* --- Der Spruch in der Ecke --- */
    teile.push('<text class="fh-karte-spruch" x="52" y="' + (HOEHE - 34) + '">' +
      (istEn() ? "Here be dragons" : "Hier sind Drachen") + "</text>");

    gDeko.innerHTML = teile.join("");
  }

  function schliessen() {
    if (!overlay) return;
    document.removeEventListener("keydown", beiTaste);
    overlay.remove();
    overlay = null;
    sicht = null;
    // Fokus dorthin zurueck, wo er herkam - sonst landet er nach dem
    // Zuklappen auf <body> und die Tastaturbedienung faengt oben an.
    if (vorherFokus && vorherFokus.isConnected) {
      try { vorherFokus.focus(); } catch (err) { /* egal */ }
    }
    vorherFokus = null;
  }

  function beiTaste(e) {
    if (e.key === "Escape") { e.preventDefault(); schliessen(); return; }

    // Tastaturbedienung fuer Zoom und Schwenken - wer nicht mit der
    // Maus ziehen kann, kommt sonst nicht an die Ecken der Karte.
    const schritt = sicht ? sicht.b * 0.12 : 0;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomUm(0.8, BREITE / 2, HOEHE / 2); return; }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomUm(1.25, BREITE / 2, HOEHE / 2); return; }
    if (e.key === "0")                  { e.preventDefault(); sichtSetzen(0, 0, BREITE, HOEHE); return; }
    if (e.key === "ArrowLeft")  { e.preventDefault(); schwenken(-schritt, 0); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); schwenken(schritt, 0); return; }
    if (e.key === "ArrowUp")    { e.preventDefault(); schwenken(0, -schritt); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); schwenken(0, schritt); return; }

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

  /* ------------------------------------------------------
     AUSSCHNITT: ZOOM UND SCHWENKEN
     ---------------------------------------------------
     Alles ueber die viewBox. Der Ausschnitt wird immer so
     begrenzt, dass die Karte das Blatt fuellt - man kann sich also
     nicht aus Versehen ins Leere schieben und dann nicht mehr
     zurueckfinden.
  ------------------------------------------------------ */
  function sichtSetzen(x, y, b, h) {
    if (!overlay) return;
    const svg = overlay.querySelector(".fh-schatzkarte-svg");
    if (!svg) return;

    // Seitenverhaeltnis festhalten und in die Grenzen zwingen.
    b = Math.max(BREITE / ZOOM_MAX, Math.min(BREITE, b));
    h = b * (HOEHE / BREITE);
    x = Math.max(0, Math.min(BREITE - b, x));
    y = Math.max(0, Math.min(HOEHE - h, y));

    sicht = { x: x, y: y, b: b, h: h };
    svg.setAttribute("viewBox", x.toFixed(2) + " " + y.toFixed(2) + " " +
                                b.toFixed(2) + " " + h.toFixed(2));

    const zurueck = overlay.querySelector(".fh-karte-zoom-zurueck");
    if (zurueck) zurueck.disabled = b >= BREITE - 0.5;
  }

  function schwenken(dx, dy) {
    if (!sicht) return;
    sichtSetzen(sicht.x + dx, sicht.y + dy, sicht.b, sicht.h);
  }

  /* Um einen Punkt herum zoomen: der Punkt unter dem Zeiger soll
     dort bleiben, wo er ist. Ohne das wandert beim Heranziehen immer
     die Mitte heran, und man verliert, was man ansehen wollte. */
  function zoomUm(faktor, zielX, zielY) {
    if (!sicht) return;
    const neuB = Math.max(BREITE / ZOOM_MAX, Math.min(BREITE, sicht.b * faktor));
    const neuH = neuB * (HOEHE / BREITE);
    const ax = (zielX - sicht.x) / sicht.b;
    const ay = (zielY - sicht.y) / sicht.h;
    sichtSetzen(zielX - ax * neuB, zielY - ay * neuH, neuB, neuH);
  }

  /* Bildschirmpunkt in Kartenkoordinaten. */
  function inKarte(svg, klientX, klientY) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height || !sicht) return null;
    return {
      x: sicht.x + ((klientX - r.left) / r.width) * sicht.b,
      y: sicht.y + ((klientY - r.top) / r.height) * sicht.h,
    };
  }

  function bedienungAnhaengen(svg) {
    /* Mausrad und Zweifinger-Kneifen. passive:false, weil das
       Blaettern der Seite darunter sonst mitlaeuft. */
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      const p = inKarte(svg, e.clientX, e.clientY);
      if (p) zoomUm(e.deltaY > 0 ? 1.18 : 0.85, p.x, p.y);
    }, { passive: false });

    // Ziehen zum Schwenken. Pointer-Events decken Maus, Stift und
    // Finger in einem ab - kein zweiter Satz Zuhoerer noetig.
    let zieht = false, letzteX = 0, letzteY = 0, bewegt = 0;
    const zeiger = new Map();

    svg.addEventListener("pointerdown", function (e) {
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zeiger.size > 1) { zieht = false; return; }
      zieht = true; bewegt = 0;
      letzteX = e.clientX; letzteY = e.clientY;
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });

    svg.addEventListener("pointermove", function (e) {
      if (!zeiger.has(e.pointerId)) return;
      const vorher = zeiger.get(e.pointerId);
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (zeiger.size === 2) {
        // Kneifen: der Abstand der beiden Finger steuert den Zoom.
        const [a, b] = Array.from(zeiger.values());
        const jetzt = Math.hypot(a.x - b.x, a.y - b.y);
        const davorA = e.pointerId === Array.from(zeiger.keys())[0] ? vorher : a;
        const davor = Math.hypot(davorA.x - b.x, davorA.y - b.y) || jetzt;
        const mitte = inKarte(svg, (a.x + b.x) / 2, (a.y + b.y) / 2);
        if (mitte && jetzt > 0 && davor > 0) zoomUm(davor / jetzt, mitte.x, mitte.y);
        return;
      }
      if (!zieht || !sicht) return;

      const r = svg.getBoundingClientRect();
      const dx = ((e.clientX - letzteX) / r.width) * sicht.b;
      const dy = ((e.clientY - letzteY) / r.height) * sicht.h;
      bewegt += Math.abs(e.clientX - letzteX) + Math.abs(e.clientY - letzteY);
      letzteX = e.clientX; letzteY = e.clientY;
      schwenken(-dx, -dy);
      if (bewegt > 6) svg.classList.add("ist-am-ziehen");
    });

    function loslassen(e) {
      zeiger.delete(e.pointerId);
      if (zeiger.size === 0) { zieht = false; svg.classList.remove("ist-am-ziehen"); }
    }
    svg.addEventListener("pointerup", loslassen);
    svg.addEventListener("pointercancel", loslassen);
    svg.addEventListener("pointerleave", loslassen);

    // Doppelklick zieht die Stelle heran, ein zweiter faehrt zurueck.
    svg.addEventListener("dblclick", function (e) {
      e.preventDefault();
      const p = inKarte(svg, e.clientX, e.clientY);
      if (!p) return;
      if (sicht.b <= BREITE / 2.2) sichtSetzen(0, 0, BREITE, HOEHE);
      else zoomUm(0.42, p.x, p.y);
    });
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
            <!-- Papierton: leicht ungleichmaessig, damit es nicht wie
                 eine Flaeche wirkt -->
            <radialGradient id="fh-karte-papier" cx="42%" cy="38%" r="78%">
              <stop offset="0%"   stop-color="#efe0bd"/>
              <stop offset="62%"  stop-color="#e3d0a6"/>
              <stop offset="100%" stop-color="#c9b184"/>
            </radialGradient>

            <!-- Fasern: derselbe feTurbulence, den die Seite schon
                 fuer die Koernung ueber allem benutzt -->
            <filter id="fh-karte-fasern" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="7" result="rauschen"/>
              <feColorMatrix in="rauschen" type="saturate" values="0"/>
            </filter>

            <!-- Angesengte Raender: dunkler Saum ringsum -->
            <radialGradient id="fh-karte-saum" cx="50%" cy="50%" r="72%">
              <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
              <stop offset="72%"  stop-color="#3b2410" stop-opacity="0"/>
              <stop offset="100%" stop-color="#3b2410" stop-opacity=".55"/>
            </radialGradient>
          </defs>

          <rect x="0" y="0" width="${BREITE}" height="${HOEHE}" fill="url(#fh-karte-papier)"/>
          <rect x="0" y="0" width="${BREITE}" height="${HOEHE}"
                filter="url(#fh-karte-fasern)" opacity=".16" style="mix-blend-mode:multiply"/>

          <g class="fh-karte-deko"></g>
          <path class="fh-karte-kurs-grund" d="${KURS}"/>
          <path class="fh-karte-kurs-fahrt" d="${KURS}"/>
          <g class="fh-karte-schiff"></g>
          <g class="fh-karte-stationen"></g>

          <rect x="0" y="0" width="${BREITE}" height="${HOEHE}" fill="url(#fh-karte-saum)" pointer-events="none"/>
        </svg>
        <div class="fh-karte-zoom">
          <button type="button" class="fh-karte-zoom-btn fh-karte-zoom-raus"
                  aria-label="${en ? "Zoom out" : "Herauszoomen"}">−</button>
          <button type="button" class="fh-karte-zoom-btn fh-karte-zoom-rein"
                  aria-label="${en ? "Zoom in" : "Heranzoomen"}">+</button>
          <button type="button" class="fh-karte-zoom-btn fh-karte-zoom-zurueck"
                  aria-label="${en ? "Show whole map" : "Ganze Karte zeigen"}">⤢</button>
        </div>
      </div>
      <p class="fh-schatzkarte-fuss">${en
        ? "Pick a station for details. Drag to pan, scroll or pinch to zoom. Esc closes the map."
        : "Station anklicken für Einzelheiten. Ziehen zum Verschieben, Rad oder zwei Finger zum Zoomen. Esc schliesst die Karte."}</p>
    `;

    document.body.appendChild(overlay);

    const svg = overlay.querySelector(".fh-schatzkarte-svg");
    const kursGrund = overlay.querySelector(".fh-karte-kurs-grund");
    const kursFahrt = overlay.querySelector(".fh-karte-kurs-fahrt");
    const gDeko = overlay.querySelector(".fh-karte-deko");
    const gSchiff = overlay.querySelector(".fh-karte-schiff");
    const gStationen = overlay.querySelector(".fh-karte-stationen");

    const laenge = kursGrund.getTotalLength();
    const stufen = stand.pass.levels;

    /* Fahrtlinie: nur bis zur erreichten Stufe sichtbar. Ueber
       stroke-dasharray, damit sie beim Oeffnen mitwachsen kann. */
    const anteil = Math.min(1, Math.max(0, stand.currentTier / stufen));
    const gefahren = laenge * anteil;
    kursFahrt.style.strokeDasharray = laenge + " " + laenge;
    kursFahrt.style.strokeDashoffset = String(laenge - gefahren);

    beiwerk(gDeko, kursGrund, laenge);

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

      /* Das Ziel ist ein Kreuz, alles andere ein Punkt.

         NEU: darauf steht das Symbol der Belohnung statt der blossen
         Nummer - man sieht damit auf einen Blick, WAS an einer
         Station wartet, nicht nur die wievielte sie ist. Die Nummer
         steht klein darunter, damit sie nicht verloren geht. */
      const symbol = typeof passRewardIcon === "function"
        ? passRewardIcon(pt.z.belohnung) : "";

      g.innerHTML = letzte
        ? '<path d="M-14,-14 L14,14 M14,-14 L-14,14" class="fh-karte-kreuz"/>' +
          '<circle r="22" class="fh-karte-ziel-ring"/>'
        : '<circle r="12" class="fh-karte-punkt"/>' +
          '<text y="4.5" text-anchor="middle" class="fh-karte-symbol">' + symbol + '</text>' +
          '<text y="23" text-anchor="middle" class="fh-karte-nummer">' + pt.stufe + '</text>';

      if (pt.z.hier) {
        g.innerHTML +=
          '<circle r="21" class="fh-karte-hier-ring"/>' +
          '<text y="-27" text-anchor="middle" class="fh-karte-hier-text">' +
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

    /* ------------------------------------------------------
       DAS SCHIFF FAEHRT DIE ROUTE AB
       ---------------------------------------------------
       Vorher wuchs nur die Linie. Ein Schiff, das den Weg
       tatsaechlich abfaehrt, macht aus der Linie eine Reise - und
       zeigt nebenbei die Fahrtrichtung, die eine blosse Linie nicht
       hat. Am Ende bleibt es an der aktuellen Station liegen und
       schaukelt leise weiter.
    ------------------------------------------------------ */
    /* ZWEI GRUPPEN, NICHT EINE.
       Die aeussere traegt den Ort auf der Route, die innere das
       Schaukeln. Beides in einer Gruppe ging schief: das Schaukeln
       braucht transform-box: fill-box (damit es um den eigenen Rumpf
       kippt und nicht um den Nullpunkt der Karte), und fill-box
       verschiebt zugleich den Bezugspunkt des transform-ATTRIBUTS.
       Nachgemessen: Attribut translate(811,281), tatsaechlich stand
       das Schiff bei (1103,552) - also gut 290 Bildpunkte daneben,
       mitten im Meer statt auf dem Kurs. */
    gSchiff.innerHTML =
      '<g class="fh-karte-schiff-ort">' +
      '<g class="fh-karte-schiff-koerper">' +
      '<path d="M-11,4 L11,4 L8,10 Q0,12 -8,10 Z"/>' +      // Rumpf
      '<path d="M-1,4 L-1,-12"/>' +                          // Mast
      '<path d="M-1,-11 Q7,-5 9,3 L-1,3 Z"/>' +              // Segel
      '<path d="M-1,-7 L-8,3 L-1,3 Z"/>' +                   // Vorsegel
      '</g></g>';
    const schiffOrt = gSchiff.firstChild;
    const schiff = schiffOrt.firstChild;

    function schiffAuf(strecke) {
      const s = Math.max(0, Math.min(laenge, strecke));
      const p = kursGrund.getPointAtLength(s);
      const q = kursGrund.getPointAtLength(Math.min(laenge, s + 2));

      /* DAS SCHIFF WIRD NICHT GEDREHT, SONDERN GESPIEGELT.
         Es ist von der Seite gezeichnet - Rumpf unten, Mast oben.
         Auf dem Rueckweg der Serpentine betraegt die Fahrtrichtung
         rund 172 Grad; mitgedreht haengt der Mast dann nach unten.
         Auf einer Karte in Seitenansicht dreht sich ein Schiff aber
         nicht auf den Kopf, es faehrt andersherum. Deshalb nur das
         Vorzeichen in x, dazu eine kleine Neigung nach der Steigung
         - genug, dass es nicht wie aufgeklebt wirkt. */
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const richtung = dx < 0 ? -1 : 1;
      const neigung = Math.max(-14, Math.min(14,
        Math.atan2(dy, Math.abs(dx) || 0.001) * (180 / Math.PI) * 0.5)) * richtung;

      schiffOrt.setAttribute("transform",
        "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ") " +
        "rotate(" + neigung.toFixed(1) + ") scale(" + richtung + ",1)");
    }

    if (reduziert() || gefahren <= 0) {
      schiffAuf(gefahren);
      kursFahrt.style.strokeDashoffset = String(laenge - gefahren);
    } else {
      /* Die Linie und das Schiff laufen GEMEINSAM - das Schiff zieht
         die Fahrtlinie hinter sich her. Liefen sie getrennt, waere
         die Linie schon da, bevor das Schiff ankommt. */
      const DAUER = 1900;
      schiffAuf(0);
      kursFahrt.style.strokeDashoffset = String(laenge);
      const start = performance.now();
      (function schritt(t) {
        if (!overlay) return;                 // zwischendurch geschlossen
        const k = Math.min(1, (t - start) / DAUER);
        const weich = 1 - Math.pow(1 - k, 3); // schnell an, weich aus
        const s = gefahren * weich;
        schiffAuf(s);
        kursFahrt.style.strokeDashoffset = String(laenge - s);
        if (k < 1) requestAnimationFrame(schritt);
        else schiff.classList.add("ist-angekommen");
      })(start);
    }

    overlay.querySelector(".fh-schatzkarte-zu").addEventListener("click", schliessen);
    overlay.addEventListener("click", function (e) {
      // Klick auf den Grund schliesst, Klick auf Karte oder Kopf nicht.
      if (e.target === overlay) schliessen();
    });
    document.addEventListener("keydown", beiTaste);

    overlay.querySelector(".fh-karte-zoom-rein").addEventListener("click",
      () => zoomUm(0.7, sicht.x + sicht.b / 2, sicht.y + sicht.h / 2));
    overlay.querySelector(".fh-karte-zoom-raus").addEventListener("click",
      () => zoomUm(1.4, sicht.x + sicht.b / 2, sicht.y + sicht.h / 2));
    overlay.querySelector(".fh-karte-zoom-zurueck").addEventListener("click",
      () => sichtSetzen(0, 0, BREITE, HOEHE));

    bedienungAnhaengen(svg);

    /* Auf schmalen Bildschirmen faengt der Blick herangezoomt bei der
       aktuellen Station an - die ganze Karte auf 390px waere
       unlesbar. Vorher wurde dafuer das Blatt seitwaerts geschoben;
       mit Zoom und Schwenken ist das nicht mehr noetig, und man kommt
       jetzt auch nach oben und unten. */
    const schmal = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
    const hier = punkte.find((p) => p.z.hier) || punkte[0];
    if (schmal && hier) {
      const b = BREITE / 2.4;
      sichtSetzen(hier.x - b / 2, hier.y - (b * HOEHE / BREITE) / 2, b, 0);
    } else {
      sichtSetzen(0, 0, BREITE, HOEHE);
    }

    const zu = overlay.querySelector(".fh-schatzkarte-zu");
    if (zu) zu.focus();
  }

  window.fhSchatzkarteOeffnen = oeffnen;
  window.fhSchatzkarteSchliessen = schliessen;
})();
