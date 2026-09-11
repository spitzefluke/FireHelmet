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
     verschiebt nur das Ziel; wie schnell die Seite dorthin
     laeuft, ist ueberall gleich.

     TEMPO   Pixel pro Sekunde. 8000px Reise / 1200 = knapp sieben
             Sekunden von der offenen See bis zur Insel, wenn man
             durchscrollt.
     VORLAUF Wie weit das Ziel der Seite vorauslaufen darf. Ohne
             diese Grenze wuerde ein kraeftiger Schwung minutenlang
             nachlaufen, und die Seite reagierte nicht mehr auf den
             Nutzer.
     SCHRITT Wie weit ein Rad-Klick das Ziel verschiebt.
  ------------------------------------------------------ */
  const FH_TEMPO = 1200;
  const FH_VORLAUF = 900;
  const FH_SCHRITT = 380;

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

  function zaehlerSetzen(weg) {
    const feld = document.getElementById("fh-kapitel-zaehler");
    if (!feld) return;
    const zahl = ROEMISCH[Math.min(6, Math.floor(weg * 7))];
    if (zahl === letzteZahl) return; // sonst bei jedem Scrollpixel ein DOM-Schreibzugriff
    letzteZahl = zahl;
    feld.textContent = zahl + " / VII";
  }

  function wegSetzen(heim, weg) {
    heim.style.setProperty("--fh-weg", weg.toFixed(4));
    zaehlerSetzen(weg);
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

     Beruehrung, Tastatur und der Scrollbalken bleiben
     unangetastet: dort zieht man die Seite direkt, und ein
     Nachlauf wuerde sich wie eine klemmende Seite anfuehlen.
     Aendert sich scrollTop von aussen, uebernimmt das Ziel den
     neuen Stand, damit die Schleife nicht dagegen arbeitet.
  ------------------------------------------------------ */
  function gleichmaessigScrollen(heim) {
    let ziel = heim.scrollTop;
    let laeuft = false;
    let vorher = 0;
    /* Woran die Schleife ihre eigenen Schreibzugriffe erkennt.
       Ein Flag "ich schreibe gerade" reicht NICHT: scroll-
       Ereignisse kommen asynchron, das Flag steht dann laengst
       wieder auf false, und das Ziel wuerde sich nach einem Bild
       selbst auf den Ist-Stand zuruecksetzen - die Bewegung
       bliebe sofort stehen. Verglichen wird deshalb der Wert. */
    let selbstGeschrieben = -1;

    function grenze() {
      return Math.max(0, heim.scrollHeight - heim.clientHeight);
    }

    /* deltaMode: 0 = Pixel, 1 = Zeilen, 2 = Seiten. Nur das
       Vorzeichen zaehlt - die Weite kommt aus FH_SCHRITT, sonst
       waere die Radgeschwindigkeit wieder im Spiel. Feine Raeder
       und Tastfelder melden viele kleine Ereignisse; fuer die
       wird der Schritt anteilig kleiner, damit sie nicht
       vierfach so schnell laufen. */
    function weite(e) {
      const roh = e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * heim.clientHeight
          : e.deltaY;
      const anteil = Math.min(1, Math.abs(roh) / 90);
      return Math.sign(roh) * FH_SCHRITT * anteil;
    }

    heim.addEventListener("wheel", function (e) {
      if (e.ctrlKey) return;               // Zoomen nicht abfangen
      const max = grenze();
      if (max <= 0) return;
      e.preventDefault();
      const jetzt = heim.scrollTop;
      ziel = Math.min(max, Math.max(0,
        Math.min(jetzt + FH_VORLAUF, Math.max(jetzt - FH_VORLAUF, ziel + weite(e)))));
      starten();
    }, { passive: false });

    /* Zieht jemand am Scrollbalken oder springt per Tastatur,
       folgt das Ziel - sonst zerrte die Schleife zurueck. */
    heim.addEventListener("scroll", function () {
      if (Math.abs(heim.scrollTop - selbstGeschrieben) < 1.5) return;
      ziel = heim.scrollTop;
    }, { passive: true });

    function starten() {
      if (laeuft) return;
      laeuft = true;
      vorher = 0;
      requestAnimationFrame(schritt);
    }

    function schritt(t) {
      const dt = vorher ? Math.min((t - vorher) / 1000, 0.05) : 0;
      vorher = t;
      const rest = ziel - heim.scrollTop;
      if (Math.abs(rest) < 0.5) { laeuft = false; return; }
      heim.scrollTop += Math.sign(rest) * Math.min(FH_TEMPO * dt, Math.abs(rest));
      selbstGeschrieben = heim.scrollTop; // zurueckgelesen: der Browser rundet
      requestAnimationFrame(schritt);
    }

    /* Der Scroll-Wink springt sonst mit behavior:"smooth" los und
       kaempft gegen diese Schleife. */
    window.fhStartZielSetzen = function (wert) {
      ziel = Math.min(grenze(), Math.max(0, wert));
      starten();
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
