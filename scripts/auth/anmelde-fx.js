/* ======================================================
   ANMELDESEITE: BEWEGUNG
   ---------------------------------------------------
   Alles hier laeuft NUR, wenn etwas passiert - beim Betreten der
   Seite, beim Umschalten, beim Tippen. Keine Dauerschleife: die
   Seite hat davon schon genug, und ein Anmeldeformular ist der
   falsche Ort dafuer.

   Jede Funktion prueft vorher prefers-reduced-motion und macht dann
   nichts (der Endzustand steht ohnehin im CSS). Das ist die
   Hausregel dieses Projekts, siehe streamraetsel.js und
   progression.js.
====================================================== */

function fhRuhigeBewegung() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------
   DER PAPAGEI AM PASSWORTFELD
   ---------------------------------------------------
   Er haelt sich die Augen zu, sobald man ins Passwortfeld tippt,
   und lugt hervor, wenn man auf das Auge drueckt. Das ist nicht
   nur Spielerei: man sieht auf einen Blick, ob das Passwort gerade
   sichtbar ist oder nicht - und genau das uebersieht man bei einem
   reinen Symbolknopf regelmaessig.

   Gezeichnet statt Emoji (siehe CLAUDE.md): ein Emoji sieht auf
   jedem Geraet anders aus, und dieses hier muss die Fluegel
   bewegen koennen.
------------------------------------------------------ */
function fhPapageiSvg() {
  /* Augen sitzen bei (19,23) und (29,23). Die Fluegel liegen im
     Ruhezustand daneben, bei (9,30) und (39,30), und wandern beim
     Tippen genau auf die Augen - deshalb sind es einfache
     Verschiebungen und keine Drehungen: nur so trifft es sicher. */
  return `
<svg class="fh-papagei" viewBox="0 0 48 48" aria-hidden="true">
  <ellipse cx="24" cy="29" rx="13" ry="14" fill="#1f9d55"/>
  <ellipse cx="24" cy="24" rx="11.5" ry="10.5" fill="#35c877"/>
  <path d="M24 13c6 0 10 4 11 9 0-8-5-12-11-12s-11 4-11 12c1-5 5-9 11-9z" fill="#e8b13a"/>
  <g class="fh-papagei-augen">
    <circle cx="19" cy="23" r="3.6" fill="#fff"/>
    <circle cx="29" cy="23" r="3.6" fill="#fff"/>
    <circle class="fh-papagei-pupille fh-papagei-pupille-links" cx="19" cy="23" r="1.8" fill="#16281f"/>
    <circle class="fh-papagei-pupille fh-papagei-pupille-rechts" cx="29" cy="23" r="1.8" fill="#16281f"/>
  </g>
  <path d="M24 28c-3.4 0-6 1.8-6 3.6h12c0-1.8-2.6-3.6-6-3.6z" fill="#f0a63c"/>
  <path d="M18 31.6c0 3 2.7 5.2 6 5.2s6-2.2 6-5.2z" fill="#d98428"/>
  <g class="fh-papagei-fluegel fh-papagei-fluegel-links">
    <ellipse cx="9" cy="30" rx="5.4" ry="4.4" fill="#178a4a"/>
    <path d="M4.6 30.6c2.4-1.4 5.4-1.8 8.4-1" fill="none" stroke="#0f6b39" stroke-width="1" stroke-linecap="round"/>
  </g>
  <g class="fh-papagei-fluegel fh-papagei-fluegel-rechts">
    <ellipse cx="39" cy="30" rx="5.4" ry="4.4" fill="#178a4a"/>
    <path d="M43.4 30.6c-2.4-1.4-5.4-1.8-8.4-1" fill="none" stroke="#0f6b39" stroke-width="1" stroke-linecap="round"/>
  </g>
</svg>`;
}

/* Wie stark ist das Passwort? Bewusst nur LAENGE und
   ZEICHENVIELFALT - alles andere (Wortlisten, Muster) koennte der
   Browser nicht ehrlich beurteilen, und eine erfundene Bewertung
   waere schlimmer als gar keine. */
function fhPasswortStaerke(pw) {
  const text = String(pw || "");
  if (!text) return 0;
  let punkte = 0;
  if (text.length >= 8) punkte++;
  if (text.length >= 12) punkte++;
  const arten = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(text)).length;
  if (arten >= 3) punkte++;
  return Math.min(3, punkte);
}

const FH_STAERKE_WORT = ["zu kurz", "dünn", "geht so", "fest"];

function fhStaerkeZeigen(feld) {
  const anzeige = document.getElementById("fh-reg-staerke");
  if (!anzeige) return;
  const stufe = fhPasswortStaerke(feld.value);
  const muenzen = anzeige.querySelectorAll(".fh-staerke-muenze");
  muenzen.forEach(function (m, i) {
    const voll = i < stufe;
    // Nur beim Wechsel anstossen, sonst zuckt die Muenze bei jedem Tastendruck.
    if (voll && !m.classList.contains("ist-voll") && !fhRuhigeBewegung()) {
      m.classList.remove("faellt");
      void m.offsetWidth;
      m.classList.add("faellt");
    }
    m.classList.toggle("ist-voll", voll);
  });
  const wort = anzeige.querySelector(".fh-staerke-wort");
  if (wort) wort.textContent = feld.value ? FH_STAERKE_WORT[stufe] : "";
  anzeige.dataset.stufe = String(stufe);
}

function fhPasswortfeldAufbauen(kasten) {
  if (kasten.dataset.fhFertig) return;
  kasten.dataset.fhFertig = "1";

  const feld = kasten.querySelector("input");
  const auge = kasten.querySelector(".fh-passwort-auge");
  if (!feld || !auge) return;

  kasten.insertAdjacentHTML("afterbegin", `<span class="fh-papagei-huelle">${fhPapageiSvg()}</span>`);
  const papagei = kasten.querySelector(".fh-papagei");

  function zudecken(zu) {
    if (papagei) papagei.classList.toggle("haelt-zu", zu);
  }

  feld.addEventListener("focus", function () { zudecken(feld.type === "password"); });
  feld.addEventListener("blur", function () { zudecken(false); });

  feld.addEventListener("input", function () {
    if (feld.hasAttribute("data-fh-staerke")) fhStaerkeZeigen(feld);
    if (fhRuhigeBewegung()) return;
    // Ein winziger Nicker pro Zeichen. 90ms, damit schnelles Tippen
    // nicht in einer Zuckerei endet.
    if (papagei) {
      papagei.classList.remove("nickt");
      void papagei.offsetWidth;
      papagei.classList.add("nickt");
    }
  });

  auge.addEventListener("click", function () {
    const sichtbar = feld.type === "text";
    feld.type = sichtbar ? "password" : "text";
    auge.setAttribute("aria-pressed", sichtbar ? "false" : "true");
    auge.classList.toggle("ist-offen", !sichtbar);
    const schluessel = sichtbar ? "login.pwZeigen" : "login.pwVerbergen";
    const ersatz = sichtbar ? "Passwort anzeigen" : "Passwort verbergen";
    auge.title = typeof t === "function" ? t(schluessel, ersatz) : ersatz;
    // Sichtbares Passwort = Papagei guckt wieder.
    zudecken(!sichtbar ? false : document.activeElement === feld);
    if (document.activeElement !== feld) feld.focus();
  });
}

function fhPasswortfelderAufbauen() {
  document.querySelectorAll("[data-fh-passwort]").forEach(fhPasswortfeldAufbauen);
}

/* ------------------------------------------------------
   DER LAEUFER UNTER DEM UMSCHALTER
   Ein einzelnes Element, das zur aktiven Schaltflaeche wandert -
   statt zwei Hintergruende hart umzuschalten. Die Breite kommt aus
   der Messung, damit "Registrieren" und "Anmelden" trotz
   unterschiedlicher Laenge beide passen.
------------------------------------------------------ */
function fhLaeuferSetzen() {
  const leiste = document.querySelector(".fh-anmelde-umschalter");
  if (!leiste) return;
  const laeufer = leiste.querySelector(".fh-anmelde-laeufer");
  const aktiv = leiste.querySelector(".fh-anmelde-tab.ist-aktiv");
  if (!laeufer || !aktiv) return;
  laeufer.style.width = aktiv.offsetWidth + "px";
  laeufer.style.transform = "translateX(" + aktiv.offsetLeft + "px)";
}

/* ------------------------------------------------------
   UEBERSCHRIFT BEIM BETRETEN
   Die Buchstaben laufen einmal von unten ein. Kein Dauerlaeufer -
   und der Endzustand steht im CSS, damit die Ueberschrift auch
   ohne dieses Skript vollstaendig dasteht.
------------------------------------------------------ */
function fhUeberschriftAuftritt() {
  if (fhRuhigeBewegung()) return;

  /* WARUM KEINE EINZELNEN BUCHSTABEN
     Naheliegend waere gewesen, Titel und Kicker in <span> je
     Buchstabe zu zerlegen und gestaffelt einlaufen zu lassen. Das
     geht hier nicht: BEIDE tragen in css/90-typografie.css einen
     Farbverlauf per background-clip: text und damit
     -webkit-text-fill-color: transparent. Kindelemente erben die
     durchsichtige Fuellung, haben aber keinen eigenen Verlauf - der
     Text waere schlicht unsichtbar. Ausprobiert, genau so passiert.

     Beide bekommen deshalb einen Auftritt als Ganzes. Der Kicker
     schimmert dabei EINMAL durch, statt es wie sonst endlos zu tun
     (siehe die Regel weiter unten in css/20-spiele.css). */
  ["#login .fh-titel-auftritt", "#login .fh-schrift-auftritt"].forEach(function (wahl, i) {
    const el = document.querySelector(wahl);
    if (!el) return;
    el.classList.remove("laeuft-ein");
    void el.offsetWidth;
    el.style.animationDelay = (i * 90) + "ms";
    el.classList.add("laeuft-ein");
  });
}

document.addEventListener("DOMContentLoaded", function () {
  fhPasswortfelderAufbauen();
  fhLaeuferSetzen();
});

window.addEventListener("resize", fhLaeuferSetzen);
