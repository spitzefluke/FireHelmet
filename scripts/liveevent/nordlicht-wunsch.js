/* ======================================================
   NORDLICHT: WUNSCHSTERNE (Migration 52)
   ---------------------------------------------------
   Erscheint in der Live-Story "nordlicht" der Satz "Wuensch dir was"
   (Szene 4, live-storys.js), schweben Wunschsterne heran. Jeder
   Spieler tippt EINEN an und bekommt genau den - garantiert, einmal
   je Nordlicht:

     500 Dublonen · 1 Skillpunkt · 250 Pass-XP (laufende Saison) ·
     ein Nordlicht-Titel, den er noch nicht hat (Sternenkind, dann
     Polarlichtjaeger)

   Das Angebot und die Erfuellung rechnet die Datenbank
   (nordlicht_angebot, nordlicht_wunsch). Die Sterne bleiben stehen,
   auch wenn die Story vorbei ist - bis gewaehlt, geschlossen oder
   nach zwei Minuten.

   In der Vorschau (Admin) laufen Sterne und Auswahl ganz normal,
   gebucht wird aber nichts.

   #fh-wunsch haengt an body und steht in den :not-Listen von 95 und
   96 (kein Epochen-Farbfilter).

   API: window.fhNordlichtWunsch.zeigen({ storyId, vorschau })
        -> Promise<boolean> (false: Migration 52 fehlt / kein Angebot)
        window.fhNordlichtWunsch.weg()
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const OFFEN_MS = 120000;

  /* Symbole: lucide (ISC), stroke-width 1.6 */
  const SVG = function (pfade) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";
  };
  const SYM = {
    dublonen: SVG('<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>'),
    skillpunkt: SVG('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'),
    pass_xp: SVG('<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>'),
    titel: SVG('<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>'),
    zu: SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  };

  let lauf = null;   // { wurzel, storyId, vorschau, gewaehlt, uhr }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  function zahl(n) { return Number(n || 0).toLocaleString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"); }

  function passId() {
    try { return typeof getCurrentPirateSeason === "function" ? getCurrentPirateSeason().passId : null; } catch (e) { return null; }
  }

  function kartenText(k) {
    if (k.wunsch === "dublonen") return [zahl(k.wert) + " " + t("wunsch.dublonen", "Dublonen"), t("wunsch.dublonenSub", "ein Beutel voll Gold")];
    if (k.wunsch === "skillpunkt") return [k.wert + " " + t("wunsch.skillpunkt", "Skillpunkt"), t("wunsch.skillpunktSub", "für deinen Skill-Baum")];
    if (k.wunsch === "pass_xp") return [zahl(k.wert) + " " + t("wunsch.passXp", "Pass-XP"), t("wunsch.passXpSub", "für den Piratenpass")];
    return [t("wunsch.titel", "Titel") + " „" + (k.text || "?") + "“", t("wunsch.titelSub", "nur vom Nordlicht")];
  }

  function erfuelltText(erg) {
    if (!erg) return "";
    if (erg.dublonen) return "+" + zahl(erg.dublonen) + " " + t("wunsch.dublonen", "Dublonen");
    if (erg.skillpunkte) return "+" + erg.skillpunkte + " " + t("wunsch.skillpunkt", "Skillpunkt");
    if (erg.pass_xp) return "+" + zahl(erg.pass_xp) + " " + t("wunsch.passXp", "Pass-XP");
    if (erg.titel) return t("wunsch.titel", "Titel") + " „" + erg.titel.text + "“";
    return "";
  }

  const GRUENDE = {
    "schon": ["wunsch.fehler.schon", "Dein Wunsch für dieses Nordlicht ist schon erfüllt."],
    "zu-spaet": ["wunsch.fehler.spaet", "Das Nordlicht ist schon verblasst."],
    "tageslimit": ["wunsch.fehler.limit", "Für heute ist dein Dublonen-Beutel voll – wähle einen anderen Stern."],
    "keine-saison": ["wunsch.fehler.saison", "Gerade läuft keine Pass-Saison – wähle einen anderen Stern."],
    "titel-schon": ["wunsch.fehler.titel", "Diesen Titel hast du schon – wähle einen anderen Stern."],
    "gesperrt": ["wunsch.fehler.gesperrt", "Dein Konto ist gesperrt."],
  };

  function status(text, istFehler) {
    if (!lauf) return;
    const s = lauf.wurzel.querySelector(".fh-wunsch-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }

  async function rpc(name, args) {
    if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
    const { data, error } = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.rpc(name, args); });
    if (error) throw error;
    return data;
  }

  function auffrischen(erg) {
    if (typeof refreshPlayerCard === "function") refreshPlayerCard();
    if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
    if (erg && erg.skillpunkte && typeof window.fhSkillNeuLaden === "function") window.fhSkillNeuLaden();
    if (erg && erg.titel && window.fhEventTitel) window.fhEventTitel.laden();
  }

  async function waehlen(knopf, karte) {
    if (!lauf || lauf.gewaehlt) return;
    lauf.gewaehlt = true;
    lauf.wurzel.classList.add("ist-waehlend");
    knopf.classList.add("ist-gewaehlt");
    let erg;
    if (lauf.vorschau || !dbDa()) {
      erg = { ok: true, wunsch: karte.wunsch, vorschau: true };
      if (karte.wunsch === "dublonen") erg.dublonen = karte.wert;
      else if (karte.wunsch === "skillpunkt") erg.skillpunkte = karte.wert;
      else if (karte.wunsch === "pass_xp") erg.pass_xp = karte.wert;
      else erg.titel = { text: karte.text };
    } else {
      try {
        erg = await rpc("nordlicht_wunsch", { p_story_id: lauf.storyId, p_wunsch: karte.wunsch, p_pass_id: karte.wunsch === "pass_xp" ? passId() : null });
      } catch (err) {
        console.warn("Nordlicht-Wunsch fehlgeschlagen:", err);
        erg = null;
      }
    }
    if (!lauf) return;
    if (!erg || !erg.ok) {
      const grund = erg && erg.grund;
      const g = GRUENDE[grund];
      status(g ? t(g[0], g[1]) : t("wunsch.fehler.allgemein", "Der Wunsch kam nicht an – versuch es noch einmal."), true);
      knopf.classList.remove("ist-gewaehlt");
      lauf.wurzel.classList.remove("ist-waehlend");
      if (grund === "tageslimit" || grund === "keine-saison" || grund === "titel-schon") knopf.disabled = true;
      lauf.gewaehlt = grund === "schon" || grund === "zu-spaet" || grund === "gesperrt";
      if (lauf.gewaehlt) schliessenNach(4000);
      return;
    }
    lauf.wurzel.classList.add("ist-erfuellt");
    status(t("wunsch.erfuellt", "Dein Wunsch geht in Erfüllung") + ": " + erfuelltText(erg) + (erg.vorschau ? " (" + t("story.preview", "Vorschau") + ")" : ""), false);
    if (!erg.vorschau) auffrischen(erg);
    schliessenNach(5000);
  }

  function schliessenNach(ms) {
    if (!lauf) return;
    clearTimeout(lauf.uhr);
    const l = lauf;
    lauf.uhr = setTimeout(function () { if (lauf === l) weg(); }, ms);
  }

  function aufbauen(angebot, opts) {
    const wurzel = el("div", "fh-wunsch" + (RUHIG.matches ? " ist-ruhig" : ""));
    wurzel.id = "fh-wunsch";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-label", t("wunsch.aria", "Nordlicht: Wünsch dir was"));
    const kopf = el("div", "fh-wunsch-kopf");
    kopf.append(el("p", "fh-wunsch-kicker", t("wunsch.kicker", "Du hast einen Wunsch frei")), el("p", "fh-wunsch-tipp", t("wunsch.tipp", "Tippe einen Stern an")));
    const zu = el("button", "fh-wunsch-zu");
    zu.type = "button";
    zu.setAttribute("aria-label", t("wunsch.schliessen", "Ohne Wunsch schließen"));
    zu.title = zu.getAttribute("aria-label");
    zu.innerHTML = SYM.zu;   // festes SVG
    zu.addEventListener("click", weg);
    const reihe = el("div", "fh-wunsch-sterne");
    angebot.karten.forEach(function (k, i) {
      if (k.wunsch === "pass_xp" && !passId()) return;
      const txt = kartenText(k);
      const b = el("button", "fh-wunsch-stern ist-" + k.wunsch);
      b.type = "button";
      b.style.setProperty("--i", i);
      const kreis = el("span", "fh-wunsch-kreis");
      kreis.innerHTML = SYM[k.wunsch] || SYM.pass_xp;   // festes SVG
      b.append(kreis, el("span", "fh-wunsch-name", txt[0]), el("span", "fh-wunsch-sub", txt[1]));
      b.addEventListener("click", function () { waehlen(b, k); });
      reihe.appendChild(b);
    });
    const st = el("p", "fh-wunsch-status");
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    wurzel.append(zu, kopf, reihe, st);
    document.body.appendChild(wurzel);
    lauf = { wurzel: wurzel, storyId: opts.storyId, vorschau: !!opts.vorschau, gewaehlt: false, uhr: 0 };
    document.addEventListener("keydown", taste);
    schliessenNach(OFFEN_MS);
    const erster = reihe.querySelector("button");
    if (erster) erster.focus({ preventScroll: true });
    if (angebot.schon) {
      lauf.gewaehlt = true;
      wurzel.classList.add("ist-erfuellt");
      const gewaehlt = reihe.querySelector(".ist-" + angebot.schon);
      if (gewaehlt) gewaehlt.classList.add("ist-gewaehlt");
      status(t("wunsch.fehler.schon", "Dein Wunsch für dieses Nordlicht ist schon erfüllt."), false);
      schliessenNach(4000);
    }
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  function vorschauAngebot() {
    return { ok: true, schon: null, karten: [
      { wunsch: "dublonen", wert: 500 }, { wunsch: "skillpunkt", wert: 1 }, { wunsch: "pass_xp", wert: 250 },
      { wunsch: "titel", titel_id: "nordlicht_sternenkind", text: "Sternenkind", stil: "eis" },
    ] };
  }

  async function zeigen(opts) {
    opts = opts || {};
    weg();
    let angebot = null;
    if (opts.vorschau || !dbDa()) {
      angebot = vorschauAngebot();
    } else {
      try {
        angebot = await rpc("nordlicht_angebot", { p_story_id: opts.storyId });
      } catch (err) {
        console.warn("Nordlicht-Angebot nicht lesbar (Migration 52?):", err);
        return false;
      }
    }
    if (!angebot || !angebot.ok || !angebot.karten || !angebot.karten.length) return false;
    aufbauen(angebot, opts);
    return true;
  }

  function weg() {
    if (!lauf) return;
    clearTimeout(lauf.uhr);
    document.removeEventListener("keydown", taste);
    const w = lauf.wurzel;
    lauf = null;
    w.classList.add("ist-aus");
    setTimeout(function () { w.remove(); }, RUHIG.matches ? 0 : 500);
  }

  window.fhNordlichtWunsch = { zeigen: zeigen, weg: weg, offen: function () { return !!lauf; } };
})();
