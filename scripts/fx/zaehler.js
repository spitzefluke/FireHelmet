/* ======================================================
   ZAHLEN HOCHZÄHLEN
   ---------------------------------------------------
   Zahlen sprangen bisher ueberall schlagartig um: die Dublonen in
   der Topbar und im Shop, die Leben des Community-Bosses. Ein
   Sprung von 120 auf 220 sieht genauso aus wie einer von 120 auf
   125 - man sieht DASS sich etwas geaendert hat, aber nicht, wie
   viel. Ein kurzes Hochzaehlen macht die Groesse der Aenderung
   sichtbar, ohne dass irgendwo eine Zahl dazugeschrieben werden
   muesste.

   Drei Regeln, die verhindern, dass daraus eine Zumutung wird:

   1. NUR BEI EINER ECHTEN AENDERUNG. Beim ersten Aufbau steht die
      Zahl sofort da. Wer eine Seite oeffnet, will den Stand sehen,
      nicht beim Zaehlen zusehen. Das Element merkt sich seinen
      letzten Wert selbst (dataset), es braucht also keine
      Buchfuehrung an der Aufrufstelle.

   2. NUR BEI SICHTBAREN ELEMENTEN. Auf einer ausgeblendeten Seite
      hochzuzaehlen kostet Rechenzeit fuer nichts.

   3. DAUER NACH GROESSE DER AENDERUNG, aber gedeckelt. +5 Dublonen
      laufen in 0,25s durch, +5000 in 0,9s - und nie laenger, egal
      wie gross der Sprung ist. Sonst wartet man bei einem grossen
      Gewinn sekundenlang auf eine Zahl, die man schon kennt.

   GSAP uebernimmt das Zaehlen, weil es hier - wie beim
   Seitenwechsel - um Abbrechbarkeit geht: kommt waehrend des
   Zaehlens ein neuer Wert (zwei Gewinne kurz hintereinander),
   raeumt overwrite den alten Lauf weg, statt zwei Schleifen
   gegeneinander schreiben zu lassen.

   Ohne GSAP und bei "Bewegung reduzieren" wird der Zielwert direkt
   geschrieben - dieselbe Anzeige, nur ohne Weg dorthin.
====================================================== */

(function () {
  "use strict";

  const MIN_MS = 250;
  const MAX_MS = 900;

  function reduziert() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* Standardformat der Seite: 1.234 statt 1234. Ueber die Option
     "format" kann eine Aufrufstelle etwas anderes einsetzen (der
     Boss haengt " HP" an und zeigt zwei Zahlen). */
  function standardFormat(n) {
    return Math.round(n).toLocaleString("de-DE");
  }

  /* el       Element, dessen Text die Zahl ist
     ziel     Zielwert
     opt      { format, sofort } */
  function fhZaehle(el, ziel, opt) {
    if (!el) return;
    const o = opt || {};
    const format = typeof o.format === "function" ? o.format : standardFormat;
    const zahl = Number(ziel);
    if (!isFinite(zahl)) return;

    const vorher = el.dataset.fhWert;
    const alt = vorher === undefined ? null : Number(vorher);
    el.dataset.fhWert = String(zahl);

    const springen =
      o.sofort === true ||          // Aufrufstelle will es ausdruecklich
      alt === null ||               // erster Aufbau
      alt === zahl ||               // nichts passiert
      !isFinite(alt) ||
      reduziert() ||
      typeof gsap === "undefined" ||
      el.offsetParent === null;     // ausgeblendet

    if (springen) {
      if (typeof gsap !== "undefined") gsap.killTweensOf(el);
      el.textContent = format(zahl);
      return;
    }

    /* Dauer aus der Groesse des Sprungs: 60 Schritte pro
       Sekunde als Richtwert, gedeckelt auf MIN/MAX. */
    const weg = Math.abs(zahl - alt);
    const dauer = Math.min(MAX_MS, Math.max(MIN_MS, weg * 16)) / 1000;

    const stand = { n: alt };
    gsap.killTweensOf(stand);
    gsap.to(stand, {
      n: zahl,
      duration: dauer,
      ease: "power2.out",
      overwrite: true,
      onUpdate: function () { el.textContent = format(stand.n); },
      // Der letzte Zwischenwert liegt durch das Runden fast immer
      // knapp daneben - am Ende einmal den echten Wert schreiben.
      onComplete: function () { el.textContent = format(zahl); },
    });
  }

  window.fhZaehle = fhZaehle;
})();
