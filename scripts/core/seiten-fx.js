/* ======================================================
   SEITEN-EFFEKTE: EINE FLÄCHE FÜR ALLE SEITEN
   ---------------------------------------------------
   Fast jede Seite bekommt ihre eigene Stimmung im Hintergrund. Der
   naheliegende Weg waere pro Seite eine eigene Leinwand mit eigenem
   Renderer - so sind das Tauwerk der Logbuecher und der Schatzstaub
   des Schatzrads zuerst entstanden.

   DAS TRAEGT NICHT. Gemessen in Chromium: nach 16 gleichzeitigen
   WebGL-Kontexten raeumt der Browser die aeltesten ab, OHNE eine
   Fehlermeldung - 40 angeforderte Kontexte, 16 ueberlebten. Die
   Seite haelt schon bis zu sechs (Nordlicht, Seitenleiste,
   Home-Reise, Jubel-Funken, Tauwerk, Schatzstaub). Vierzehn weitere
   einzeln, und der Nordlicht-Hintergrund waere irgendwann lautlos
   verschwunden.

   Deshalb: EINE Leinwand, EIN Renderer, und je Seite nur eine
   Szene, die eingehaengt wird. Beim Seitenwechsel wird umgeschaltet
   und weich ueberblendet. Tauwerk und Schatzstaub sind mit
   hierhergezogen, damit alle Seiteneffekte an einer Stelle liegen
   statt an dreien.

   Eine Szene wird erst gebaut, wenn ihre Seite das erste Mal
   betreten wird, und danach behalten. Wer nie ins Turnier geht,
   zahlt auch nichts dafuer.

   Die Sicherungen kommen aus scripts/core/fh-webgl.js: kein WebGL
   oder erkennbar Software-Rasterung -> gar nicht erst starten; zu
   lange Bildzeiten -> selbst abraeumen. Bei "Bewegung reduzieren"
   steht ein einziges Bild.

   NEUE SEITE ANSCHLIESSEN: in scripts/core/seiten-fx-szenen.js eine
   Funktion unter dem Seiten-Namen eintragen. Hier ist nichts zu
   aendern.
====================================================== */

(function () {
  "use strict";

  /* Ueberblendung beim Seitenwechsel. Kuerzer als der Seitenwechsel
     selbst (340ms), damit der neue Hintergrund schon steht, wenn der
     Inhalt ankommt. */
  const BLENDE_MS = 260;

  let renderer = null;
  let leinwand = null;
  let wacht = null;
  let rafId = 0;
  let laeuft = false;
  let aufgegeben = false;

  // Seiten-Name -> { szene, kamera, aktualisieren(t, breite, hoehe) }
  const szenen = new Map();
  let aktuelle = null;      // die gerade gezeigte Szene
  let aktuelleSeite = null;
  let deckkraft = 0;        // 0..1, fuer die Ueberblendung
  let zielDeckkraft = 0;

  function reduziert() {
    return !!(window.fhWebGL && window.fhWebGL.reduzierteBewegung());
  }

  function aufbauen() {
    if (renderer || aufgegeben) return !!renderer;
    if (!window.fhWebGL || typeof THREE === "undefined") return false;

    renderer = window.fhWebGL.rendererErzeugen({ alpha: true });
    if (!renderer) {
      aufgegeben = true;
      return false;
    }

    renderer.setClearColor(0x000000, 0);
    /* Die Effekte sind weich und liegen hinter dem Inhalt. Volle
       Pixeldichte waere dort verschwendet. */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    leinwand = renderer.domElement;
    leinwand.className = "fh-seiten-fx";
    leinwand.setAttribute("aria-hidden", "true");
    document.body.appendChild(leinwand);

    groesse();
    window.addEventListener("resize", groesse);

    wacht = window.fhWebGL.bildwacht();
    return true;
  }

  function groesse() {
    if (!renderer) return;
    const b = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(b, h, false);
    const dpr = renderer.getPixelRatio();
    // Jede Szene darf auf die neue Groesse reagieren (Aufloesung,
    // Seitenverhaeltnis).
    szenen.forEach(function (s) {
      if (typeof s.groesse === "function") s.groesse(b * dpr, h * dpr, b / h);
    });
    if (!laeuft) einBild();
  }

  /* Holt die Szene einer Seite - baut sie beim ersten Mal. Gibt null
     zurueck, wenn die Seite keinen Effekt hat. */
  function holen(seite) {
    if (szenen.has(seite)) return szenen.get(seite);
    if (!window.fhSeitenSzenen || !window.fhSeitenSzenen[seite]) return null;

    let s = null;
    try {
      s = window.fhSeitenSzenen[seite](THREE);
    } catch (err) {
      // Eine kaputte Szene darf nicht die ganze Flaeche mitreissen.
      console.error("Seiten-Effekt " + seite + " liess sich nicht bauen:", err);
      s = null;
    }
    szenen.set(seite, s);

    if (s && typeof s.groesse === "function" && renderer) {
      const dpr = renderer.getPixelRatio();
      s.groesse(window.innerWidth * dpr, window.innerHeight * dpr,
                window.innerWidth / window.innerHeight);
    }
    return s;
  }

  let letzteZeit = 0;

  function zeichnen(t) {
    if (!renderer) return;

    // Ueberblendung fortschreiben
    const dt = letzteZeit ? Math.min(t - letzteZeit, 100) : 16;
    letzteZeit = t;
    if (deckkraft !== zielDeckkraft) {
      const schritt = dt / BLENDE_MS;
      deckkraft = zielDeckkraft > deckkraft
        ? Math.min(zielDeckkraft, deckkraft + schritt)
        : Math.max(zielDeckkraft, deckkraft - schritt);
    }

    if (!aktuelle || deckkraft <= 0) {
      renderer.clear();
    } else {
      if (typeof aktuelle.aktualisieren === "function") {
        aktuelle.aktualisieren(t * 0.001, deckkraft);
      }
      renderer.render(aktuelle.szene, aktuelle.kamera);
    }
  }

  function bild(t) {
    if (!laeuft) return;
    zeichnen(t);
    if (wacht(t)) return aufgeben();
    rafId = requestAnimationFrame(bild);
  }

  function einBild() {
    // Ein Standbild - fuer "Bewegung reduzieren" und nach
    // Groessenaenderungen.
    if (!renderer) return;
    deckkraft = zielDeckkraft;
    zeichnen(performance.now());
  }

  function starten() {
    if (laeuft || aufgegeben || !renderer) return;
    if (reduziert()) { einBild(); return; }
    laeuft = true;
    letzteZeit = 0;
    rafId = requestAnimationFrame(bild);
  }

  function anhalten() {
    laeuft = false;
    letzteZeit = 0;
    cancelAnimationFrame(rafId);
  }

  function aufgeben() {
    anhalten();
    aufgegeben = true;
    if (renderer) {
      renderer.dispose();
      if (leinwand && leinwand.parentNode) leinwand.parentNode.removeChild(leinwand);
      renderer = null;
      leinwand = null;
    }
  }

  /* Wird aus changePage aufgerufen. */
  function seitenEffekt(seite) {
    if (aufgegeben) return;
    if (seite === aktuelleSeite) return;

    if (!aufbauen()) return;

    aktuelleSeite = seite;
    const s = holen(seite);

    if (!s) {
      // Keine Szene fuer diese Seite: ausblenden und danach anhalten.
      zielDeckkraft = 0;
      if (reduziert()) { aktuelle = null; einBild(); anhalten(); return; }
      starten();
      // Nach der Blende die Schleife stoppen - sonst laeuft sie auf
      // Seiten ohne Effekt weiter und rechnet leere Bilder.
      setTimeout(function () {
        if (aktuelleSeite === seite) { aktuelle = null; anhalten(); renderer && renderer.clear(); }
      }, BLENDE_MS + 40);
      return;
    }

    aktuelle = s;
    zielDeckkraft = 1;
    if (reduziert()) { einBild(); return; }
    deckkraft = 0;          // immer von vorne einblenden
    starten();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) anhalten();
    else if (aktuelle) starten();
  });

  window.fhSeitenEffekt = seitenEffekt;
})();
