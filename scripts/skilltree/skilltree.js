/* ======================================================
   SKILL-BAUM: DAS STERNBILD
   ---------------------------------------------------
   Zeichnet den Fertigkeitsbaum als Sternbild, schaltet Sterne frei
   und stellt die Boni fuer Rad/Spielothek/XP sowie die Titel fuer
   die Spielerkarte bereit.

   Sichtbar ist die Seite nur, wenn das Feature-Flag "skillTree"
   an ist ODER der Betrachter Admin ist (Vorschau) - siehe
   scripts/core/feature-flags.js. Die eigentliche Absicherung liegt
   aber auf dem Server: Freischalten geht nur ueber die RPC
   public.skill_freischalten(), die Kosten und Punkte selbst prueft.

   ABLAUF FUER DEN SPIELER
   Ein Klick auf einen Stern waehlt ihn nur aus und zeigt rechts
   (Handy: darunter) seine Karte. Erst der Knopf in der Karte gibt
   Punkte aus - so verschiesst niemand versehentlich einen Punkt.
====================================================== */

(function () {
  "use strict";

  const FLAG = "skillTree";
  const SCHMAL = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  let cache = { nodes: null, unlocked: [], passXp: 0, bonus: 0, geladen: false };
  let auswahl = null;   // gewaehlter Stern
  let neu = null;       // gerade freigeschaltet -> Aufflammen
  let beschaeftigt = false;

  /* supabaseClient ist ein top-level let in supabase-client.js und
     haengt deshalb NICHT an window - window.supabaseClient waere
     immer undefined (siehe CLAUDE.md). Direkt pruefen. */
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }

  function esc(v) { return typeof escapeHtml === "function" ? escapeHtml(v == null ? "" : v) : String(v == null ? "" : v); }
  function escA(v) { return typeof escapeAttr === "function" ? escapeAttr(v == null ? "" : v) : String(v == null ? "" : v); }
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  /* Server-Spiegel der Stufenformel aus 22-skilltree.sql /
     progression-data.js: Stufe N braucht N*(N+1)*50, Deckel 50. */
  function skillLevel(passXp) {
    let s = 0;
    while (s < 50 && (s + 1) * (s + 2) * 50 <= (passXp || 0)) s++;
    return s;
  }

  /* ------------------------------------------------------
     BONI - fuer wheel.js / spielothek.js / progression.js
     Summe der Prozente aller freigeschalteten Knoten einer Art,
     als Faktor 0.xx. Ohne geladene Daten: 0 (kein Bonus).
  ------------------------------------------------------ */
  window.fhSkillBonus = function (art) {
    if (!cache.geladen || !cache.nodes) return 0;
    let prozent = 0;
    cache.unlocked.forEach(function (id) {
      const n = cache.nodes[id];
      if (n && n.art === art) prozent += Number(n.wert) || 0;
    });
    return prozent / 100;
  };

  /* ------------------------------------------------------
     AUSZEICHNUNGEN - fuer die Spielerkarte (progression.js)
     { titel: "legende" | "titel1" | null, abzeichen: [...],
       legende: true/false } - nur Knoten-IDs, die Namen holt der
     Aufrufer ueber fhSkillName().
  ------------------------------------------------------ */
  window.fhSkillAuszeichnungen = function () {
    const aus = { titel: null, abzeichen: [], legende: false };
    if (!cache.geladen || typeof SKILL_AUSZEICHNUNGEN === "undefined") return aus;
    let besteStufe = 0;
    cache.unlocked.forEach(function (id) {
      const a = SKILL_AUSZEICHNUNGEN[id];
      if (!a) return;
      if (a.typ === "titel" && a.stufe > besteStufe) { besteStufe = a.stufe; aus.titel = id; }
      if (a.typ === "abzeichen") aus.abzeichen.push(id);
    });
    aus.legende = cache.unlocked.indexOf("legende") !== -1;
    return aus;
  };

  function name(id) {
    const n = cache.nodes && cache.nodes[id];
    return t("skilltree.node." + id + ".name", (n && n.bezeichnung) || id);
  }
  window.fhSkillName = name;

  async function laden() {
    if (!dbDa()) return false;
    try {
      const uid = await wheelAuthReady;
      const knotenAntwort = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("skill_nodes").select("node_id, kosten, benoetigt, art, wert, bezeichnung");
      });
      if (knotenAntwort.error) throw knotenAntwort.error;
      const nodes = {};
      (knotenAntwort.data || []).forEach(function (n) { nodes[n.node_id] = n; });

      let unlocked = [], passXp = 0, bonus = 0;
      if (uid) {
        const progAntwort = await withSupabaseRlsColdStartRetry(function () {
          return supabaseClient.from("player_progression")
            .select("pass_xp, bonus_skill_points, unlocked_skills")
            .eq("firebase_uid", uid).maybeSingle();
        });
        if (progAntwort.error) throw progAntwort.error;
        const p = progAntwort.data || {};
        unlocked = Array.isArray(p.unlocked_skills) ? p.unlocked_skills : [];
        passXp = p.pass_xp || 0;
        bonus = p.bonus_skill_points || 0;
      }
      cache = { nodes: nodes, unlocked: unlocked, passXp: passXp, bonus: bonus, geladen: true };
      window.dispatchEvent(new CustomEvent("fhSkillsGeaendert"));
      return true;
    } catch (err) {
      console.warn("Skill-Baum konnte nicht geladen werden:", err);
      return false;
    }
  }

  function ausgegeben() {
    let summe = 0;
    cache.unlocked.forEach(function (id) { const n = cache.nodes[id]; if (n) summe += n.kosten || 0; });
    return summe;
  }
  function verfuegbar() { return Math.max(0, skillLevel(cache.passXp) + cache.bonus - ausgegeben()); }

  function fehlendeVoraussetzungen(id) {
    const n = cache.nodes[id];
    if (!n) return [];
    return (n.benoetigt || []).filter(function (b) { return cache.unlocked.indexOf(b) === -1; });
  }

  function zustand(id) {
    if (cache.unlocked.indexOf(id) !== -1) return "frei";
    const n = cache.nodes[id];
    if (!n) return "gesperrt";
    if (fehlendeVoraussetzungen(id).length) return "gesperrt";
    return verfuegbar() >= n.kosten ? "offen" : "zuteuer";
  }

  function himmel() { return SKILL_HIMMEL[SCHMAL.matches ? "schmal" : "weit"]; }

  /* Nur Sterne, die Layout UND Datenbank kennen (siehe skilltree-data.js). */
  function sichtbareSterne() {
    return Object.keys(himmel().punkte).filter(function (id) { return cache.nodes && cache.nodes[id]; });
  }

  function symbolSvg(id, klasse) {
    const pfade = SKILL_SYMBOLE[SKILL_SYMBOL_JE_KNOTEN[id]] || "";
    return '<svg class="' + klasse + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + '</svg>';
  }

  function pips(kosten) {
    let s = "";
    for (let i = 0; i < kosten; i++) s += "<i></i>";
    return '<span class="fh-stern-pips" aria-hidden="true">' + s + "</span>";
  }

  function punkteWort(n) { return n === 1 ? t("skilltree.pointOne", "Punkt") : t("skilltree.pointMany", "Punkte"); }

  /* Hintergrundsterne: fester Zufall (immer dieselbe Saat), damit
     der Himmel beim Neuzeichnen nicht springt. */
  function hintergrundSterne(h) {
    let saat = 7;
    function zufall() { saat = (saat * 16807) % 2147483647; return (saat - 1) / 2147483646; }
    let s = "";
    const anzahl = Math.round(h.breite * h.hoehe / 7000);
    for (let i = 0; i < anzahl; i++) {
      const x = (zufall() * h.breite).toFixed(1);
      const y = (zufall() * h.hoehe).toFixed(1);
      const r = (0.5 + zufall() * 1.3).toFixed(2);
      const funkelt = zufall() < 0.3;
      s += '<circle class="fh-himmel-punkt' + (funkelt ? ' funkelt' : '') + '" cx="' + x + '" cy="' + y + '" r="' + r + '"' +
        (funkelt ? ' style="animation-delay:' + (zufall() * 4).toFixed(2) + 's"' : '') + '/>';
    }
    return s;
  }

  function himmelHtml() {
    const h = himmel();
    const ids = sichtbareSterne();

    let linien = "";
    SKILL_KANTEN.forEach(function (k) {
      const a = h.punkte[k[0]], b = h.punkte[k[1]];
      if (!a || !b || ids.indexOf(k[0]) === -1 || ids.indexOf(k[1]) === -1) return;
      const vonFrei = cache.unlocked.indexOf(k[0]) !== -1;
      const nachFrei = cache.unlocked.indexOf(k[1]) !== -1;
      const klasse = vonFrei && nachFrei ? " ist-frei" : (vonFrei ? " ist-bereit" : "");
      /* pathLength="1": die Licht-Animation beim Freischalten braucht
         so keine gemessene Linienlaenge. */
      linien += '<line class="fh-himmel-linie' + klasse + (neu === k[1] && nachFrei ? ' ist-neu' : '') + '"' +
        ' x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" pathLength="1"/>';
    });

    let sterne = "";
    ids.forEach(function (id) {
      const p = h.punkte[id];
      const n = cache.nodes[id];
      const z = zustand(id);
      const groesse = id === "legende" ? 3 : Math.min(n.kosten, 2);
      const zustandText = t("skilltree.state." + z, z);
      sterne +=
        '<button type="button" class="fh-stern groesse-' + groesse + ' ist-' + z +
          (auswahl === id ? ' ist-gewaehlt' : '') + (neu === id ? ' ist-neu' : '') + '"' +
        ' style="left:' + (p.x / h.breite * 100).toFixed(3) + '%;top:' + (p.y / h.hoehe * 100).toFixed(3) + '%"' +
        ' data-stern="' + escA(id) + '" onclick="fhSkillWaehle(this.dataset.stern)"' +
        ' aria-pressed="' + (auswahl === id ? 'true' : 'false') + '"' +
        ' aria-label="' + escA(name(id) + ' - ' + n.kosten + ' ' + punkteWort(n.kosten) + ' - ' + zustandText) + '">' +
          '<span class="fh-stern-kern">' + symbolSvg(id, "fh-stern-symbol") + '</span>' +
          pips(n.kosten) +
        '</button>';
    });

    return '' +
      '<div class="fh-himmel ' + (SCHMAL.matches ? 'ist-schmal' : 'ist-weit') + '" style="aspect-ratio:' + h.breite + ' / ' + h.hoehe + '">' +
        '<svg class="fh-himmel-svg" viewBox="0 0 ' + h.breite + ' ' + h.hoehe + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
          '<g class="fh-himmel-hintergrund">' + hintergrundSterne(h) + '</g>' +
          '<g class="fh-himmel-linien">' + linien + '</g>' +
        '</svg>' +
        sterne +
      '</div>';
  }

  function karteHtml() {
    if (!auswahl || !cache.nodes[auswahl]) {
      return '<div class="fh-stern-karte ist-leer"><p>' + esc(t("skilltree.pickStar", "Wähle einen Stern, um zu sehen, was er bewirkt.")) + '</p></div>';
    }
    const id = auswahl;
    const n = cache.nodes[id];
    const z = zustand(id);
    let unten = "";
    if (z === "frei") {
      unten = '<p class="fh-stern-karte-frei">' + esc(neu === id ? t("skilltree.justUnlocked", "Freigeschaltet!") : t("skilltree.state.frei", "Freigeschaltet")) + '</p>';
    } else if (z === "offen") {
      unten = '<button type="button" class="fh-stern-karte-knopf" onclick="fhSkillFreischalten()"' + (beschaeftigt ? ' disabled' : '') + '>' +
        esc(t("skilltree.unlockBtn", "Freischalten")) + ' <span>· ' + n.kosten + ' ' + esc(punkteWort(n.kosten)) + '</span></button>';
    } else if (z === "zuteuer") {
      const fehlt = n.kosten - verfuegbar();
      unten = '<p class="fh-stern-karte-hinweis">' + esc(t("skilltree.missingPoints", "Dir fehlen noch") + ' ' + fehlt + ' ' + punkteWort(fehlt) + '.') + '</p>' +
        '<p class="fh-stern-karte-klein">' + esc(t("skilltree.howToGet", "Punkte gibt es für jede Pass-Stufe und als Geschenk bei Live-Events.")) + '</p>';
    } else {
      const fehlend = fehlendeVoraussetzungen(id).map(name).join(", ");
      unten = '<p class="fh-stern-karte-hinweis">' + esc(t("skilltree.needsFirst", "Braucht zuerst:") + ' ' + fehlend) + '</p>';
    }
    return '' +
      '<div class="fh-stern-karte ist-' + z + (id === "legende" ? ' ist-legende' : '') + '">' +
        '<div class="fh-stern-karte-kopf">' +
          '<span class="fh-stern-karte-symbol">' + symbolSvg(id, "") + '</span>' +
          '<div><p class="fh-stern-karte-zustand">' + esc(t("skilltree.state." + z, z)) + '</p>' +
          '<h2 class="fh-stern-karte-name">' + esc(name(id)) + '</h2></div>' +
        '</div>' +
        '<p class="fh-stern-karte-wirkung">' + esc(t("skilltree.node." + id + ".effect", "")) + '</p>' +
        '<p class="fh-stern-karte-kosten">' + esc(t("skilltree.cost", "Kosten")) + ' ' + pips(n.kosten) + ' <span>' + n.kosten + ' ' + esc(punkteWort(n.kosten)) + '</span></p>' +
        unten +
        '<p class="fh-skill-status" id="fh-skill-status" role="status" aria-live="polite"></p>' +
      '</div>';
  }

  function kopfHtml() {
    const vorschau = typeof window.fhFeatureNurVorschau === "function" && window.fhFeatureNurVorschau(FLAG);
    const alle = sichtbareSterne();
    const frei = alle.filter(function (id) { return cache.unlocked.indexOf(id) !== -1; }).length;
    return '' +
      '<div class="fh-page-head">' +
        '<p class="fh-page-kicker">' + esc(t("skilltree.kicker", "Fertigkeiten")) + '</p>' +
        '<h1 class="fh-page-title">' + esc(t("skilltree.title", "Skill-Baum")) + '</h1>' +
        (vorschau ? '<p class="fh-skill-vorschau">👁️ ' + esc(t("skilltree.preview", "Vorschau - nur für dich sichtbar, bis du die Funktion freigibst.")) + '</p>' : '') +
        '<p class="fh-page-lead">' + esc(t("skilltree.lead", "Ein Punkt je Pass-Stufe, dazu Geschenke im Live-Event. Jeder Stern bleibt dauerhaft.")) + '</p>' +
      '</div>' +
      '<div class="fh-skill-leiste">' +
        '<p class="fh-skill-punkte"><strong>' + verfuegbar() + '</strong><span>' + esc(t("skilltree.points", "Freie Skillpunkte")) + '</span></p>' +
        '<p class="fh-skill-herkunft">' +
          esc(t("skilltree.fromLevel", "Pass-Stufe")) + ' ' + skillLevel(cache.passXp) +
          ' · ' + cache.bonus + ' ' + esc(t("skilltree.fromGift", "geschenkt")) +
          ' · ' + ausgegeben() + ' ' + esc(t("skilltree.spent", "ausgegeben")) + '</p>' +
        '<p class="fh-skill-fortschritt"><strong>' + frei + ' / ' + alle.length + '</strong> ' + esc(t("skilltree.stars", "Sterne")) + '</p>' +
      '</div>';
  }

  function ziel() { return document.getElementById("skill-tree-content"); }

  function zeichnen() {
    const el = ziel();
    if (!el) return;
    if (!auswahl) {
      /* Beim ersten Oeffnen gleich den ersten erreichbaren Stern
         zeigen - dann steht der Freischalten-Knopf schon da. */
      auswahl = sichtbareSterne().filter(function (id) { return zustand(id) === "offen"; })[0] || null;
    }
    el.innerHTML = kopfHtml() + '<div class="fh-skill-buehne">' + himmelHtml() + karteHtml() + '</div>';
  }

  function statusSetzen(msg) {
    const el = document.getElementById("fh-skill-status");
    if (el) el.textContent = msg;
  }

  window.fhSkillWaehle = function (id) {
    if (!cache.nodes || !cache.nodes[id]) return;
    auswahl = id;
    zeichnen();
    /* Auf dem Handy liegt die Karte unter dem Himmel - hinscrollen. */
    if (SCHMAL.matches) {
      const karte = document.querySelector(".fh-stern-karte");
      if (karte && karte.scrollIntoView) karte.scrollIntoView({ block: "nearest", behavior: RUHIG.matches ? "auto" : "smooth" });
    }
  };

  window.fhSkillFreischalten = async function () {
    const id = auswahl;
    if (!id || beschaeftigt) return;
    if (!dbDa()) { statusSetzen(t("skilltree.noDb", "Verbindung nicht verfügbar.")); return; }
    beschaeftigt = true;
    zeichnen();
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("skill_freischalten", { p_node: id });
      });
      if (error) throw error;
      beschaeftigt = false;
      if (data > 0) {
        cache.unlocked = cache.unlocked.concat([id]);
        neu = id;
        zeichnen();
        window.dispatchEvent(new CustomEvent("fhSkillsGeaendert"));
        if (typeof refreshPlayerCard === "function" && SKILL_AUSZEICHNUNGEN[id]) refreshPlayerCard();
        /* Aufflammen nur einmal: danach zaehlt der Stern als normal frei. */
        setTimeout(function () { if (neu === id) neu = null; }, 1600);
        return;
      }
      zeichnen();
      if (data === 0) statusSetzen(t("skilltree.already", "Schon freigeschaltet."));
      else if (data === -2) statusSetzen(t("skilltree.needPrereq", "Erst den vorherigen Knoten freischalten."));
      else if (data === -3) statusSetzen(t("skilltree.needPoints", "Nicht genug Skillpunkte."));
      else statusSetzen(t("skilltree.unknown", "Dieser Knoten ist unbekannt."));
    } catch (err) {
      console.warn("Freischalten fehlgeschlagen:", err);
      beschaeftigt = false;
      zeichnen();
      statusSetzen(t("skilltree.error", "Hat nicht geklappt - versuch es später noch einmal."));
    }
  };

  function seiteAktiv() {
    const s = document.getElementById("skill-tree");
    return !!(s && s.classList.contains("active-page"));
  }

  async function updateSkillTreePage(pageID) {
    if (pageID !== "skill-tree") return;
    const el = ziel();
    if (!el) return;

    /* Doppelte Absicherung zur Nav-Ausblendung: ist die Funktion
       weder freigegeben noch bin ich Admin, hier nichts zeigen. */
    if (typeof window.fhFeatureSichtbar === "function" && !window.fhFeatureSichtbar(FLAG)) {
      el.innerHTML = '<p class="wheel-status">' + esc(t("skilltree.locked", "Diese Funktion ist noch nicht freigeschaltet.")) + '</p>';
      return;
    }

    el.innerHTML = '<p class="wheel-status">' + esc(t("common.loading", "Lade ...")) + '</p>';
    const ok = await laden();
    if (!ok) {
      el.innerHTML = '<p class="wheel-status">' + esc(t("skilltree.noDb", "Verbindung nicht verfügbar.")) + '</p>';
      return;
    }
    zeichnen();
  }
  window.updateSkillTreePage = updateSkillTreePage;

  /* Nach einem Skillpunkte-Geschenk (live-event.js) neu laden. */
  window.fhSkillNeuLaden = async function () {
    const ok = await laden();
    if (ok && seiteAktiv()) zeichnen();
    if (ok && typeof refreshPlayerCard === "function") refreshPlayerCard();
  };

  /* Zwischen weitem und schmalem Himmel umschalten, wenn sich die
     Breite ueber die Grenze bewegt (Handy drehen, Fenster ziehen). */
  function aufBreiteReagieren() { if (cache.geladen && seiteAktiv()) zeichnen(); }
  /* Nach dem Sprachwechsel (setLanguage in i18n.js) neu zeichnen. */
  window.fhSkillNeuZeichnen = aufBreiteReagieren;
  if (SCHMAL.addEventListener) SCHMAL.addEventListener("change", aufBreiteReagieren);
  else if (SCHMAL.addListener) SCHMAL.addListener(aufBreiteReagieren);

  /* Die Boni und Titel werden auch ausserhalb der Seite gebraucht
     (Rad, Spielothek, Spielerkarte). Einmal frueh laden. */
  document.addEventListener("DOMContentLoaded", function () {
    if (dbDa() && typeof wheelAuthReady !== "undefined") {
      laden().then(function (ok) { if (ok && typeof refreshPlayerCard === "function") refreshPlayerCard(); });
    }
  });
})();
