/* ======================================================
   STARTSEITE: DAS BOOT
   ---------------------------------------------------
   Ein Low-Poly-Rumpf mit Mast, Segel und Wimpel, der beim
   Durchbruch durch die Wasseroberflaeche ins Bild kommt und bis
   zum Morgengrauen bleibt.

   DREI REGELN, DIE HIER ALLES BESTIMMEN

   1. Das Boot rechnet NICHT selbst am Scrollweg herum, sondern
      liest --fh-weg von #home - dieselbe Zahl, aus der auch die
      Kulisse in css/65-startseite.css alles ableitet. So kann es
      nicht auseinanderlaufen.

   2. Die Abschnitts-Fenster (Sturm, Morgen, Auftritt) stehen
      deshalb ZWEIMAL: hier und im CSS. Wer eines aendert, muss
      das andere mitaendern. Die Alternative waere, die fertigen
      Werte aus dem CSS zu lesen - das geht aber nicht:
      getPropertyValue() liefert bei nicht registrierten Custom
      Properties nur den rohen calc()-Text, kein Ergebnis.

   3. Ohne brauchbares WebGL uebernimmt die flache SVG-Silhouette
      im Markup. Dieselbe Erzaehlung, nur ohne 3D - die Seite darf
      auf schwachen Geraeten nicht plotzlich eine andere
      Geschichte erzaehlen.

   Geladen wird nach three.js und scripts/core/fh-webgl.js.
====================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------
     DIE ABSCHNITTS-FENSTER
     Muessen zu css/65-startseite.css passen (siehe Regel 2).
  ------------------------------------------------------ */
  const AUFTRITT = [0.36, 0.46]; // Boot kommt, bleibt danach
  const STURM = [0.46, 0.55, 0.65, 0.74]; // auf, halten, ab
  const MORGEN = [0.86, 1.0];

  /* Wie tief das Boot in der Szene sitzt. Steht hier, weil es an
     zwei Stellen gebraucht wird: beim Aufbau und im Wiegen. */
  const FH_BOOT_TIEFE = -1.55;

  /* Smoothstep - flach am Anfang, flach am Ende, steil in der
     Mitte. Dasselbe t*t*(3-2t) wie im CSS. */
  function weich(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function trapez(f, x) {
    return weich(f[0], f[1], x) * (1 - weich(f[2], f[3], x));
  }

  function zahl(text, ersatz) {
    const n = parseFloat(text);
    return isFinite(n) ? n : ersatz;
  }

  /* ------------------------------------------------------
     DER RUMPF
     Der Querschnitt ist ein Dreieck: zwei Deckskanten und ein
     Kiel darunter. Pro Station also drei Punkte, und zwischen
     zwei Stationen spannen sich Backbord, Steuerbord und Deck
     auf. Wenige grosse Flaechen, harte Kanten - genau das, was
     "Low-Poly" meint.

     Ein Punkt pro Station statt eines gerundeten Spants spart
     nicht nur Dreiecke, er ist auch der Grund, warum das Boot
     ueberhaupt kantig aussieht.
  ------------------------------------------------------ */
  const STATIONEN = [
    // x (Heck -> Bug), halbe Deckbreite, Kieltiefe, Deckshoehe
    [-2.05, 0.42, 0.26, 0.20],
    [-1.20, 0.68, 0.44, 0.08],
    [-0.10, 0.76, 0.50, 0.02],
    [1.05, 0.60, 0.46, 0.08],
    [1.95, 0.30, 0.34, 0.22],
    [2.45, 0.05, 0.16, 0.40],
  ];

  function rumpfGeometrie(farbeSeite, farbeDeck, farbeKante) {
    const punkte = [];
    const farben = [];

    function ecke(p, f) {
      punkte.push(p[0], p[1], p[2]);
      farben.push(f.r, f.g, f.b);
    }

    function dreieck(a, b, c, f) {
      ecke(a, f);
      ecke(b, f);
      ecke(c, f);
    }

    /* Die Deckskante bekommt ein schmales Band in Gold - der
       einzige warme Ton am Rumpf und die Klammer zur
       Countdown-Farbe. Es wird aus denselben Stationen erzeugt
       und folgt dem Rumpf deshalb bis in die Bugspitze; ein
       aufgesetzter Balken wuerde vorn ueberstehen. */
    const BAND = 0.09;

    function station(i) {
      const s = STATIONEN[i];
      return {
        L: [s[0], s[3], s[1]], // Deck, Backbord
        R: [s[0], s[3], -s[1]], // Deck, Steuerbord
        LB: [s[0], s[3] - BAND, s[1] * 0.985], // Unterkante des Bands
        RB: [s[0], s[3] - BAND, -s[1] * 0.985],
        K: [s[0], -s[2], 0], // Kiel
      };
    }

    for (let i = 0; i < STATIONEN.length - 1; i++) {
      const a = station(i);
      const b = station(i + 1);

      // Backbord (+z) - gegen den Uhrzeigersinn von aussen gesehen
      dreieck(a.L, a.K, b.K, farbeSeite);
      dreieck(a.L, b.K, b.L, farbeSeite);

      // Steuerbord (-z) - gespiegelt, also andersherum gewickelt
      dreieck(a.R, b.R, b.K, farbeSeite);
      dreieck(a.R, b.K, a.K, farbeSeite);

      // Deck
      dreieck(a.L, b.L, b.R, farbeDeck);
      dreieck(a.L, b.R, a.R, farbeDeck);

      // Goldband auf der Deckskante, beidseitig
      dreieck(a.L, a.LB, b.LB, farbeKante);
      dreieck(a.L, b.LB, b.L, farbeKante);
      dreieck(a.R, b.R, b.RB, farbeKante);
      dreieck(a.R, b.RB, a.RB, farbeKante);
    }

    // Spiegel am Heck und die Spitze am Bug schliessen den Rumpf.
    const heck = station(0);
    const bug = station(STATIONEN.length - 1);
    dreieck(heck.L, heck.R, heck.K, farbeDeck);
    dreieck(bug.L, bug.K, bug.R, farbeSeite);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(punkte, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(farben, 3));
    /* Nicht indiziert: jedes Dreieck hat eigene Ecken, damit
       computeVertexNormals() eine Normale PRO FLAECHE liefert.
       Geteilte Ecken wuerden die Kanten weichzeichnen - das
       Gegenteil von dem, was hier gewollt ist. */
    g.computeVertexNormals();
    return g;
  }

  /* Das Segel spannt sich LAENGS des Rumpfes auf, nicht quer.

     Der erste Versuch hatte es quer gespannt - anatomisch richtig
     fuer ein Rahsegel, aber die Kamera steht seitlich, und quer
     heisst von der Seite: hochkant. Aus dem Segel wurde ein
     grauer Splitter. Laengs gespannt zeigt es dem Betrachter die
     Flaeche.

     Zwei Dreiecke - Grossegel nach achtern, Vorsegel nach vorn -
     statt eines Rechtecks. Das Rechteck war der zweite Versuch
     und sah aus wie ein Lampenschirm; erst die Dreiecksform macht
     aus dem Ding ein Boot. Sie ist ausserdem dieselbe wie in der
     flachen SVG-Silhouette, damit beide Wege dasselbe zeigen. */
  function segelGeometrie() {
    const spitze = [0, 2.05, 0.02]; // Masttop
    const fuss = [0, 0.6, 0.02]; // Mastfuss
    const achtern = [-1.25, 0.78, 0.12]; // Grossegel nach hinten
    const vorn = [1.2, 0.86, -0.08]; // Vorsegel nach vorn

    const gross = [0.8, 0.84, 0.88]; // helles Tuch
    const vor = [0.66, 0.71, 0.77]; // im Schatten des Grossegels

    const punkte = [];
    const farben = [];
    function ecke(p, f) {
      punkte.push(p[0], p[1], p[2]);
      farben.push(f[0], f[1], f[2]);
    }

    ecke(spitze, gross);
    ecke(fuss, gross);
    ecke(achtern, gross);

    ecke(spitze, vor);
    ecke(vorn, vor);
    ecke(fuss, vor);

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(punkte, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(farben, 3));
    g.computeVertexNormals();
    return g;
  }

  function wimpelGeometrie() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 2.62, 0, 0.62, 2.5, 0.06, 0, 2.36, 0],
        3
      )
    );
    g.computeVertexNormals();
    return g;
  }

  function token(name, ersatz) {
    try {
      const wert = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return wert || ersatz;
    } catch (err) {
      return ersatz;
    }
  }

  function bootBauen() {
    const gold = new THREE.Color(token("--fh-gold", "#d6a84f"));
    const seite = new THREE.Color("#16243a");
    const deck = new THREE.Color("#2c4157");

    const gruppe = new THREE.Group();

    const rumpf = new THREE.Mesh(
      rumpfGeometrie(seite, deck, gold),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    gruppe.add(rumpf);

    const mast = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 2.5, 0.08),
      new THREE.MeshLambertMaterial({ color: "#3d2b1c", flatShading: true })
    );
    mast.position.set(-0.05, 1.35, 0);
    gruppe.add(mast);

    const segel = new THREE.Mesh(
      segelGeometrie(),
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide, // von beiden Seiten zu sehen
      })
    );
    segel.position.set(-0.05, 0, 0);
    gruppe.add(segel);

    const wimpel = new THREE.Mesh(
      wimpelGeometrie(),
      new THREE.MeshLambertMaterial({
        color: gold,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    );
    wimpel.position.set(-0.05, 0, 0);
    gruppe.add(wimpel);

    return gruppe;
  }

  /* ------------------------------------------------------
     AUFBAU
  ------------------------------------------------------ */
  function fhStartBootAufbauen() {
    const huelle = document.getElementById("fh-start-boot");
    const heim = document.getElementById("home");
    if (!huelle || !heim) return;

    const leinwand = huelle.querySelector(".fh-boot-leinwand");
    if (!leinwand) return;

    function flachBleiben() {
      // Die SVG-Silhouette im Markup uebernimmt.
      huelle.classList.add("fh-boot-flach-an");
    }

    const webgl = window.fhWebGL;
    if (!webgl || typeof THREE === "undefined" || webgl.reduzierteBewegung()) {
      flachBleiben();
      return;
    }

    const renderer = webgl.rendererErzeugen({ canvas: leinwand, alpha: true });
    if (!renderer) {
      flachBleiben();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    const boot = bootBauen();
    /* Klein und tief. Beides ist noetig, damit die Mastspitze
       unter den Countdown-Kaesten bleibt - beim ersten Versuch
       stand der Wimpel mitten in den Minuten. Und der Countdown
       ist die Hauptsache; das Boot faehrt darunter vorbei. */
    boot.scale.setScalar(0.7);
    boot.position.y = FH_BOOT_TIEFE;
    szene.add(boot);

    const himmel = new THREE.HemisphereLight(0x9fc4e8, 0x0a1420, 0.7);
    szene.add(himmel);
    const sonne = new THREE.DirectionalLight(0xffffff, 1.05);
    sonne.position.set(2.5, 4, 3);
    szene.add(sonne);

    /* Die beiden Lichtstimmungen, zwischen denen der Scrollweg
       ueberblendet: kaltes Sturmlicht und warmes Morgenlicht. */
    const kalt = new THREE.Color(0x8fb4d6);
    const warm = new THREE.Color(0xffd79a);
    const neutral = new THREE.Color(0xdfe9f4);
    // Einmal angelegt und pro Bild neu befuellt - ein new THREE.Color()
    // im Bildtakt waere Muell fuer die Speicherbereinigung.
    const lichtfarbe = new THREE.Color();

    function groesseSetzen() {
      const b = huelle.clientWidth || 1;
      const h = huelle.clientHeight || 1;
      renderer.setSize(b, h, false);
      kamera.aspect = b / h;
      /* Auf schmalen Schirmen weiter weg, sonst haengt der Bug
         links und rechts aus dem Bild. */
      kamera.position.set(0, 0.15, kamera.aspect < 1.1 ? 13.5 : 10.2);
      kamera.lookAt(0, -0.55, 0);
      kamera.updateProjectionMatrix();
    }

    groesseSetzen();
    window.addEventListener("resize", groesseSetzen);

    const wacht = webgl.bildwacht({ bilder: 45, grenzeMs: 24 });
    let laeuft = true;

    function aufgeben() {
      laeuft = false;
      window.removeEventListener("resize", groesseSetzen);
      renderer.dispose();
      flachBleiben();
    }

    function bild(t) {
      if (!laeuft) return;
      requestAnimationFrame(bild);

      const weg = zahl(heim.style.getPropertyValue("--fh-weg"), 0);
      const auftritt = weich(AUFTRITT[0], AUFTRITT[1], weg);

      /* Nicht zeichnen, was niemand sieht: vor dem Auftritt, auf
         einer anderen Seite oder im Hintergrundtab. */
      if (auftritt <= 0.001 || !heim.classList.contains("active-page")) return;
      /* Die Bildwacht bekommt nur gezeichnete Bilder zu sehen.
         Nach einer Pause (andere Seite, zurueckgescrollt) ist die
         erste Messung dadurch ein Ausreisser - die Wacht nimmt
         aber den Median aus 45 Proben, ein Ausreisser pro Pause
         faellt nicht ins Gewicht. */
      if (wacht(t)) {
        aufgeben();
        return;
      }

      const sturm = trapez(STURM, weg);
      const morgen = weich(MORGEN[0], MORGEN[1], weg);
      const s = t / 1000;

      /* Das Wiegen laeuft immer - ein Boot, das beim Stillstehen
         einfriert, sieht aus wie ein Bild vom Boot. Wie stark es
         kraengt, haengt am Sturm. */
      const kraengung = 0.045 + 0.19 * sturm;
      const hub = 0.05 + 0.2 * sturm;

      boot.rotation.z = Math.sin(s * 0.9) * kraengung + Math.sin(s * 2.3) * kraengung * 0.35;
      boot.rotation.x = Math.sin(s * 0.7) * (0.02 + 0.07 * sturm);
      /* Die Lage im Bild: beim Auftritt fast von der Seite, zum
         Morgen hin leicht gedreht, als nehme es Fahrt auf. */
      boot.rotation.y = -0.55 + 0.3 * morgen;
      boot.position.y = FH_BOOT_TIEFE + Math.sin(s * 1.1) * hub;

      lichtfarbe.copy(neutral);
      lichtfarbe.lerp(kalt, sturm * 0.85);
      lichtfarbe.lerp(warm, morgen);
      sonne.color.copy(lichtfarbe);
      sonne.intensity = 0.55 + 0.5 * (1 - sturm) + 0.35 * morgen;
      himmel.intensity = 0.45 + 0.35 * morgen;

      renderer.render(szene, kamera);
    }

    requestAnimationFrame(bild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fhStartBootAufbauen);
  } else {
    fhStartBootAufbauen();
  }
})();
