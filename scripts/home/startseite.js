/* ======================================================
   STARTSEITE: DER SCROLLWEG
   ---------------------------------------------------
   Eine Aufgabe: den Scrollfortschritt als Zahl zwischen 0 und 1
   in die CSS-Variable --fh-weg schreiben. Daraus rechnet
   css/65-startseite.css alles Sichtbare selbst aus - die sieben
   Kapiteltexte, den Fortschrittsbalken, die Balken oben und
   unten, den Scroll-Wink. scripts/home/ozean-szene.js liest
   dieselbe Zahl fuer die 3D-Reise.

   Warum nicht mehr in JavaScript? Weil hier bei jedem
   Scrollpixel gerechnet wird. Eine einzige Variable zu setzen
   und den Rest dem Compositor zu ueberlassen ist deutlich
   billiger, als sieben Kapitel einzeln anzufassen - der Entwurf
   aus Claude Design tut genau das in einer
   requestAnimationFrame-Schleife.

   Die EINZIGE Ausnahme ist der Kapitelzaehler oben rechts: ein
   Textinhalt laesst sich in CSS nicht aus einer Zahl ableiten.

   WICHTIG: #home ist der Scroll-Container, nicht das Dokument.
   ScrollTrigger braucht deshalb "scroller: homeSection".
====================================================== */

(function () {
  "use strict";

  /* Die Laenge der Bahn in Pixeln. An EINER Stelle, damit sie
     sich ohne Suchen aendern laesst. Bei 8000 bekommt jedes der
     sieben Kapitel gut 1100px - genug, damit es wirkt, statt
     vorbeizuhuschen. */
  const FH_START_WEG = 8000;

  const ROEMISCH = ["I", "II", "III", "IV", "V", "VI", "VII"];

  /* ------------------------------------------------------
     GLEICHES TEMPO FUER ALLE

     Wie weit ein Mausrad-Klick scrollt, entscheidet sonst das
     Betriebssystem, der Treiber und die Maus: an einer Maus mit
     freilaufendem Rad rauscht die ganze Reise in einer Sekunde
     vorbei, an einer anderen braucht sie zwanzig. Eine Sequenz,
     die von der Hardware abhaengt, ist keine Sequenz.

     Deshalb schreibt ab hier nur noch die Bildschleife an
     scrollTop, und zwar mit FESTER Geschwindigkeit. Das Rad
     kauft nur STRECKE; wie schnell sie abgefahren wird, ist
     ueberall gleich.

     Dasselbe gilt fuer den Finger: ein Wisch kauft Strecke, die
     Geschwindigkeit bleibt dieselbe wie am Rechner.

     WAS SICH GEGENUEBER DER ERSTEN FASSUNG AENDERT
     Vorher lief ein Ziel voraus, und die Seite fuhr mit festem
     Tempo hinterher: 300 px/s, sofort volle Geschwindigkeit,
     sofortiger Stillstand. Das war gleichmaessig, aber hart -
     jeder Anfang und jedes Ende ein Ruck.

     Jetzt gibt es ein WEGKONTO. Jede Eingabe legt Strecke darauf,
     und abgefahren wird sie mit festem Tempo. Die Reise dauert
     dadurch immer gleich lang, egal an welcher Maus - aber die
     Geschwindigkeit steigt in 320 ms an und faellt am Ende des
     Kontos wieder ab.

     EIN UNTERSCHIED ZUM ENTWURF, BEWUSST
     Der Entwurf aus Claude Design beschreibt das Ausklingen, sein
     Code macht es aber nicht: dort ist jede Bewegung am Konto
     festgemacht ("schritt = v * dt", gedeckelt auf den Rest), und
     ist das Konto leer, steht das Bild im selben Bild still. Die
     Geschwindigkeit klingt danach aus, ohne noch etwas zu bewegen -
     zu sehen ist also weiterhin ein harter Stopp.

     Hier sinkt stattdessen die SOLL-Geschwindigkeit, sobald das
     Konto zur Neige geht (FH_BREMSWEG). Damit klingt die Bewegung
     wirklich aus, und weil ein durchgehend scrollender Besucher
     das Konto stets voll haelt, bleiben die 45 Sekunden gueltig.

     DAUER     Sekunden fuer die ganze Bahn. Der Entwurf gibt den
               Wert als Regler von 20 bis 60 frei und setzt 45.
     TEMPO     Ergibt sich daraus - nicht getrennt einstellen,
               sonst passen Dauer und Tempo nicht mehr zusammen.
     KONTO     Deckel. Ohne ihn liefe ein kraeftiger Schwung
               minutenlang nach und die Seite reagierte nicht mehr.
     RAD_*     Ein Rasterklick kauft bis zu 220 px, ein feiner
               Trackpad-Wisch entsprechend weniger, mindestens 26.
     WISCH     Wieviel Weg ein Pixel Fingerbewegung kauft.
     ANFAHRT   Zeitkonstante der Rampe in Sekunden.
     BREMSWEG  Ab wieviel Restweg die Sollgeschwindigkeit sinkt.
               90 px bei 178 px/s sind rund eine halbe Sekunde
               Ausklingen.
     BODEN     Wie langsam der Auslauf hoechstens wird, als
               Anteil vom Tempo. Ohne diesen Boden endet die
               Bewegung nie richtig, sondern kriecht.
  ------------------------------------------------------ */
  const FH_DAUER = 45;
  const FH_TEMPO = FH_START_WEG / FH_DAUER;   // 178 px/s
  const FH_KONTO = 1400;
  const FH_RAD_MIN = 26;
  const FH_RAD_MAX = 220;
  const FH_RAD_FAKTOR = 1.85;
  const FH_WISCH = 1.6;
  const FH_ANFAHRT = 0.32;
  const FH_BREMSWEG = 90;
  const FH_BODEN = 0.16;

  const ruhig = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  let winkUhr = null;
  let letzteZahl = "";

  /* ------------------------------------------------------
     DER SCROLL-WINK
     Erscheint nach drei Sekunden ohne Scrollen und ist nach dem
     ERSTEN Scrollen endgueltig weg - nicht nach jeder Pause
     wieder. Wer einmal verstanden hat, dass es weitergeht, muss
     nicht erneut angetippt werden.
  ------------------------------------------------------ */
  function winkAufbauen(heim) {
    const wink = document.getElementById("fh-start-wink");
    if (!wink || ruhig.matches) return;

    function wegDamit() {
      clearTimeout(winkUhr);
      wink.hidden = true;
      heim.removeEventListener("scroll", wegDamit);
    }

    winkUhr = setTimeout(function () {
      if (heim.scrollTop > 4) return;
      wink.hidden = false;
    }, 3000);

    heim.addEventListener("scroll", wegDamit, { passive: true, once: true });

    window.fhStartWinkFolgen = function () {
      wegDamit();
      const ziel = heim.clientHeight * 1.2;
      /* Ueber dieselbe Schleife wie das Mausrad, nicht per
         behavior:"smooth" - sonst laufen zwei Animationen
         gleichzeitig gegen dieselbe scrollTop. */
      if (window.fhStartZielSetzen) window.fhStartZielSetzen(ziel);
      else heim.scrollTo({ top: ziel, behavior: "smooth" });
    };
  }

  function bahnHoeheSetzen(heim, bahn) {
    /* Die Bahn ist so lang wie der gewuenschte Weg PLUS ein
       Bildschirm - sonst wuerde das letzte Bild nie erreicht,
       weil die klebende Buehne die letzten 100% aufbraucht.

       "Ein Bildschirm" ist dabei die Hoehe des SCROLL-CONTAINERS,
       nicht die des Fensters. Auf dem Handy sitzt unten die
       Tab-Leiste: #home ist dort rund 180px kuerzer als 100svh.
       Mass an der falschen Stelle genommen, und der Scrollweg war
       4184 statt 4000 - die Buehne bekommt deshalb dieselbe Zahl
       als --fh-schirm. */
    const schirm = heim.clientHeight || window.innerHeight;
    heim.style.setProperty("--fh-schirm", schirm + "px");
    bahn.style.height = (FH_START_WEG + schirm) + "px";
  }

  /* ------------------------------------------------------
     DER RAHMEN

     Drei Dinge, die CSS aus --fh-weg allein NICHT ableiten kann,
     und nur diese drei:

     1. Die roemische Ziffer - ein Textinhalt laesst sich nicht
        aus einer Zahl rechnen.
     2. Die sieben Punkte - dafuer braucht es den ABSTAND zum
        laufenden Kapitel, und abs() ist noch nicht ueberall da,
        wo diese Seite laeuft.
     3. Das Atmen der Balken - es haengt an der Stelle INNERHALB
        des Kapitels, nicht am Gesamtweg.

     Alles andere bleibt in der CSS. Die Punkte werden nur beim
     Kapitelwechsel geschrieben, nicht bei jedem Scrollpixel -
     ihr Uebergang liegt als transition in der CSS.
  ------------------------------------------------------ */
  function rahmenSetzen(heim, weg) {
    const kap = Math.min(6, Math.floor(weg * 7));

    /* Das Atmen: sin() ueber den Kapitelverlauf ist in der Mitte
       am staerksten und an beiden Raendern null - die Balken
       geben also zum Uebergang von selbst wieder frei. */
    const innen = Math.sin(Math.min(1, Math.max(0, weg * 7 - kap)) * Math.PI);
    heim.style.setProperty("--balken-extra", (innen * 1.6).toFixed(2) + "vh");

    const zahl = ROEMISCH[kap];
    if (zahl === letzteZahl) return;     // sonst bei jedem Scrollpixel ein DOM-Schreibzugriff
    letzteZahl = zahl;

    const feld = document.getElementById("fh-kapitel-zaehler");
    if (feld) feld.textContent = zahl;

    for (let i = 0; i < 7; i++) {
      const naeh = Math.max(0, 1 - Math.abs(kap - i));
      heim.style.setProperty("--p" + i + "-o", (0.28 + 0.72 * naeh).toFixed(3));
      heim.style.setProperty("--p" + i + "-s", (1 + 0.75 * naeh).toFixed(3));
      heim.style.setProperty("--p" + i + "-g", (0.8 * naeh).toFixed(3));
    }
  }

  function wegSetzen(heim, weg) {
    heim.style.setProperty("--fh-weg", weg.toFixed(4));
    rahmenSetzen(heim, weg);
  }

  function fhStartseiteAufbauen() {
    const heim = document.getElementById("home");
    const bahn = document.getElementById("fh-start");
    const buehne = document.getElementById("fh-start-buehne");
    if (!heim || !bahn || !buehne) return;

    bahnHoeheSetzen(heim, bahn);
    window.addEventListener("resize", function () { bahnHoeheSetzen(heim, bahn); });

    if (ruhig.matches) {
      /* Ans Ende der Reise setzen: der Countdown steht in Kapitel
         VII, und der soll ohne Scrollen erreichbar sein. Die
         lange Bahn faellt dabei weg - 8000px zu scrollen, ohne
         dass sich etwas aendert, waere eine Zumutung und kein
         Entgegenkommen. */
      wegSetzen(heim, 1);
      bahn.style.height = "auto";
      return;
    }

    winkAufbauen(heim);
    gleichmaessigScrollen(heim);

    /* Einmal von Hand, bevor irgendetwas scrollt. Sonst stuende
       der erste Punkt bis zur ersten Bewegung blass da wie die
       sechs anderen - die CSS kennt nur ihren Rueckfallwert. */
    wegSetzen(heim, 0);

    if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
      fhStartFallback(heim, bahn, buehne);
      return;
    }

    ScrollTrigger.create({
      trigger: bahn,
      scroller: heim,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (self) { wegSetzen(heim, self.progress); },
    });
  }

  /* ------------------------------------------------------
     Das Mausrad verschiebt nur noch ein Ziel; dorthin laeuft die
     Seite mit fester Geschwindigkeit. Siehe FH_TEMPO oben.

     Der Finger laeuft seit derselben Runde ueber dieselbe
     Schleife - weiter unten bei den touch-Ereignissen. Tastatur
     und Scrollbalken bleiben nativ: dort springt man an eine
     Stelle, statt zu blaettern. Aendert sich scrollTop von
     aussen, uebernimmt das Ziel den neuen Stand, damit die
     Schleife nicht dagegen arbeitet.
  ------------------------------------------------------ */
  function gleichmaessigScrollen(heim) {
    /* Das Wegkonto: wieviel Strecke noch abzufahren ist.
       Vorzeichen = Richtung. */
    let konto = 0;
    let v = 0;
    let laeuft = false;
    let vorher = 0;
    /* UNSERE EIGENE STELLE, als Fliesskommazahl.
       heim.scrollTop rundet beim ZURUECKLESEN auf ganze Pixel.
       Solange die Schleife ohne Rampe mit vollem Tempo lief, fiel
       das nicht auf: der erste Schritt war schon 4,8 px gross.
       Mit der Rampe faengt sie bei null an, die ersten Schritte
       sind Bruchteile eines Pixels - und wer jedes Bild neu vom
       zurueckgelesenen scrollTop aus rechnet, verliert sie alle.
       Gemessen: nach 791 Rad-Ereignissen stand die Seite
       weiterhin auf 0. Deshalb wird hier mitgezaehlt und nur
       GESCHRIEBEN. */
    let stelle = 0;
    /* Woran die Schleife ihre eigenen Schreibzugriffe erkennt.
       Ein Flag "ich schreibe gerade" reicht NICHT: scroll-
       Ereignisse kommen asynchron, das Flag steht dann laengst
       wieder auf false, und das Konto wuerde geleert - die
       Bewegung bliebe sofort stehen. Verglichen wird deshalb der
       Wert. (Der Entwurf benutzt an dieser Stelle genau das
       Flag, das hier schon einmal nicht funktioniert hat.) */
    let selbstGeschrieben = -1;

    function grenze() {
      return Math.max(0, heim.scrollHeight - heim.clientHeight);
    }

    /* Strecke aufs Konto legen. Ein Richtungswechsel ERSETZT das
       Konto, statt sich abzuziehen: wer zurueckscrollt, will
       zurueck, und nicht erst den alten Schwung aufbrauchen. */
    function buchen(weg) {
      if (!weg) return;
      konto = (Math.sign(weg) !== Math.sign(konto)) ? weg : konto + weg;
      konto = Math.sign(konto) * Math.min(FH_KONTO, Math.abs(konto));
      starten();
    }

    /* deltaMode: 0 = Pixel, 1 = Zeilen, 2 = Seiten. Ein
       Rasterklick kauft FH_RAD_MAX, ein feiner Trackpad-Wisch
       anteilig weniger - aber nie unter FH_RAD_MIN, sonst
       bewegte sich bei sehr feinen Raedern nichts. */
    function weite(e) {
      const roh = e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * heim.clientHeight
          : e.deltaY;
      if (!roh) return 0;
      return Math.sign(roh) * Math.min(FH_RAD_MAX,
        Math.max(FH_RAD_MIN, Math.abs(roh) * FH_RAD_FAKTOR));
    }

    heim.addEventListener("wheel", function (e) {
      if (e.ctrlKey) return;               // Zoomen nicht abfangen
      if (grenze() <= 0) return;
      e.preventDefault();
      buchen(weite(e));
    }, { passive: false });

    /* Der Finger. Damit die Reise auf dem Handy genauso lange
       dauert wie am Rechner, zieht auch ein Wisch nicht direkt an
       der Seite, sondern bucht nur auf dasselbe Konto.

       touch-action setzt die CSS auf "pan-x pinch-zoom", sobald
       diese Schleife steht: senkrecht gehoert damit uns,
       waagerecht und Zoomen bleiben beim Browser. */
    let fingerY = 0;
    let einFinger = false;

    heim.addEventListener("touchstart", function (e) {
      einFinger = e.touches.length === 1;
      if (einFinger) fingerY = e.touches[0].clientY;
    }, { passive: true });

    heim.addEventListener("touchmove", function (e) {
      if (!einFinger || e.touches.length !== 1) return;
      if (grenze() <= 0) return;
      const y = e.touches[0].clientY;
      const weg = fingerY - y;             // nach oben wischen = vorwaerts
      fingerY = y;
      if (e.cancelable) e.preventDefault();
      if (Math.abs(weg) > 0.4) buchen(weg * FH_WISCH);
    }, { passive: false });

    heim.addEventListener("touchend", function () { einFinger = false; }, { passive: true });
    heim.addEventListener("touchcancel", function () { einFinger = false; }, { passive: true });

    heim.classList.add("fh-eigener-scroll");

    /* Zieht jemand am Scrollbalken oder springt per Tastatur,
       wird das Konto verworfen - sonst zerrte die Schleife
       anschliessend zurueck auf den alten Kurs. */
    heim.addEventListener("scroll", function () {
      if (Math.abs(heim.scrollTop - selbstGeschrieben) < 1.5) return;
      konto = 0;
      v = 0;
      stelle = heim.scrollTop;   // von aussen bewegt: neu ansetzen
    }, { passive: true });

    function starten() {
      if (laeuft) return;
      laeuft = true;
      vorher = 0;
      stelle = heim.scrollTop;
      requestAnimationFrame(schritt);
    }

    function schritt(t) {
      /* Die Obergrenze fuer dt faengt nur echte Luecken ab -
         Tabwechsel, Standby - und darf NICHT die Bildrate
         begrenzen. Mit 0.05 lief die Seite auf einem Geraet mit
         4 Bildern/s nur 60px pro Bild, also 240 statt 1200 px/s:
         das Tempo haette wieder an der Hardware gehangen, genau
         an dem, was diese Schleife abschaffen soll. Gemessen:
         120 px/s statt der eingestellten 1200. */
      const dt = vorher ? Math.min((t - vorher) / 1000, 0.25) : 0;
      vorher = t;

      /* Die Sollgeschwindigkeit: volles Tempo, solange genug auf
         dem Konto liegt, und sanft gegen null, wenn es zur Neige
         geht. GENAU HIER steckt das Ausklingen - der Entwurf
         setzt an dieser Stelle das volle Tempo und deckelt
         stattdessen den Schritt auf den Rest, was einen harten
         Stopp ergibt. */
      const anteil = Math.min(1, Math.abs(konto) / FH_BREMSWEG);
      /* Der Boden. Ohne ihn laeuft die Sollgeschwindigkeit
         asymptotisch gegen null, und die letzten Pixel kriechen:
         gemessen 2,7 Sekunden Nachlauf nach EINEM Rad-Klick, die
         letzte Sekunde davon in Bruchteilen von Pixeln. Mit dem
         Boden bleibt der Auslauf weich, endet aber. */
      const soll = konto === 0 ? 0
        : Math.sign(konto) * FH_TEMPO * Math.max(anteil, FH_BODEN);

      /* Anfahren und Abbremsen ueber dieselbe Zeitkonstante. Das
         exp() macht die Rampe unabhaengig von der Bildrate: bei
         30 und bei 144 Bildern/s dauert sie gleich lang. */
      const k = dt > 0 ? 1 - Math.exp((-dt / FH_ANFAHRT) * 3) : 0;
      v += (soll - v) * k;

      if (konto === 0 && Math.abs(v) < 1.5) { v = 0; laeuft = false; return; }

      let weg = v * dt;
      if (Math.abs(weg) >= Math.abs(konto)) { weg = konto; konto = 0; }
      else { konto -= weg; }

      const max = grenze();
      const roh = stelle + weg;
      stelle = Math.min(max, Math.max(0, roh));

      /* Am Anschlag ist das Konto hinfaellig - sonst stuende dort
         noch Guthaben, das beim naechsten Antippen losschiesst.

         Geprueft wird, ob wirklich GEKAPPT wurde, nicht ob die
         Stelle am Rand LIEGT. Der Unterschied hat hier eine
         Fassung lang jede Fahrt verhindert: die Reise faengt bei
         0 an, im ersten Bild ist dt und damit der Weg null, die
         Stelle also weiterhin 0 - und die Sperre loeschte das
         Konto, bevor sich etwas bewegen konnte. */
      if (roh !== stelle) { konto = 0; v = 0; }
      heim.scrollTop = stelle;
      selbstGeschrieben = heim.scrollTop; // zurueckgelesen: der Browser rundet
      requestAnimationFrame(schritt);
    }

    /* Der Scroll-Wink springt sonst mit behavior:"smooth" los und
       kaempft gegen diese Schleife. Er bucht denselben Weg wie
       ein Rad-Klick, nur eben so viel davon, wie bis zum Ziel
       fehlt - und laeuft damit durch dieselbe Rampe. */
    window.fhStartZielSetzen = function (wert) {
      const ziel = Math.min(grenze(), Math.max(0, wert));
      konto = 0;
      buchen(ziel - heim.scrollTop);
    };
  }

  /* Ohne GSAP (CDN nicht erreichbar) derselbe Wert von Hand.
     rAF-gedrosselt, damit der Scroll-Handler nicht bei jedem
     Ereignis rechnet. */
  function fhStartFallback(heim, bahn, buehne) {
    let laeuft = false;

    function rechnen() {
      laeuft = false;
      const strecke = bahn.offsetHeight - buehne.offsetHeight;
      if (strecke <= 0) return;
      wegSetzen(heim, Math.min(1, Math.max(0, heim.scrollTop / strecke)));
    }

    heim.addEventListener("scroll", function () {
      if (laeuft) return;
      laeuft = true;
      requestAnimationFrame(rechnen);
    }, { passive: true });

    rechnen();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fhStartseiteAufbauen);
  } else {
    fhStartseiteAufbauen();
  }
})();
