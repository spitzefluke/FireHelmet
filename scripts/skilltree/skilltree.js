/* ======================================================
   SKILL-BAUM: DIE SEITE
   ---------------------------------------------------
   Zeigt den Fertigkeitsbaum, schaltet Knoten frei und stellt die
   Boni fuer Rad/Spielothek/XP bereit.

   Sichtbar ist die Seite nur, wenn das Feature-Flag "skillTree"
   an ist ODER der Betrachter Admin ist (Vorschau) - siehe
   scripts/core/feature-flags.js. Die eigentliche Absicherung liegt
   aber auf dem Server: Freischalten geht nur ueber die RPC
   public.skill_freischalten(), die Kosten und Punkte selbst prueft.
====================================================== */

(function () {
  "use strict";

  const FLAG = "skillTree";
  let cache = { nodes: null, unlocked: [], passXp: 0, bonus: 0, geladen: false };

  /* Server-Spiegel der Stufenformel aus 22-skilltree.sql /
     progression-data.js: Stufe N braucht N*(N+1)*50, Deckel 50. */
  function skillLevel(passXp) {
    let s = 0;
    while (s < 50 && (s + 1) * (s + 2) * 50 <= (passXp || 0)) s++;
    return s;
  }

  function esc(v) { return typeof escapeHtml === "function" ? escapeHtml(v == null ? "" : v) : String(v == null ? "" : v); }
  function escA(v) { return typeof escapeAttr === "function" ? escapeAttr(v == null ? "" : v) : String(v == null ? "" : v); }
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

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

  async function laden() {
    if (!window.supabaseClient) return false;
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
  function verfuegbar() { return skillLevel(cache.passXp) + cache.bonus - ausgegeben(); }

  function knotenZustand(id) {
    if (cache.unlocked.indexOf(id) !== -1) return "frei";
    const n = cache.nodes[id];
    if (!n) return "gesperrt";
    const vorbedingung = (n.benoetigt || []).every(function (b) { return cache.unlocked.indexOf(b) !== -1; });
    if (!vorbedingung) return "gesperrt";
    return verfuegbar() >= n.kosten ? "offen" : "zuteuer";
  }

  function baumHtml() {
    const punkte = verfuegbar();
    const vorschau = typeof window.fhFeatureNurVorschau === "function" && window.fhFeatureNurVorschau(FLAG);

    /* Kanten als SVG-Linien zwischen den Knoten. */
    let kanten = "";
    if (typeof SKILL_KANTEN !== "undefined") {
      SKILL_KANTEN.forEach(function (k) {
        const a = SKILL_LAYOUT[k[0]], b = SKILL_LAYOUT[k[1]];
        if (!a || !b) return;
        const an = cache.unlocked.indexOf(k[0]) !== -1 && cache.unlocked.indexOf(k[1]) !== -1;
        kanten += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
          '" class="fh-skill-kante' + (an ? " ist-frei" : "") + '" />';
      });
    }

    let knoten = "";
    Object.keys(SKILL_LAYOUT).forEach(function (id) {
      const lay = SKILL_LAYOUT[id];
      const n = cache.nodes ? cache.nodes[id] : null;
      const zustand = knotenZustand(id);
      const kosten = n ? n.kosten : "?";
      const name = n ? n.bezeichnung : id;
      knoten +=
        '<button type="button" class="fh-skill-knoten ist-' + zustand + '"' +
        ' style="left:' + lay.x + '%;top:' + lay.y + '%"' +
        ' data-node="' + escA(id) + '"' +
        (zustand === "offen" ? ' onclick="fhSkillFreischalten(this)"' : ' disabled') +
        ' title="' + escA(name) + '">' +
        '<span class="fh-skill-icon" aria-hidden="true">' + esc(lay.icon) + '</span>' +
        '<span class="fh-skill-kosten">' + (zustand === "frei" ? "✓" : esc(kosten)) + '</span>' +
        '</button>';
    });

    return '' +
      '<div class="fh-page-head">' +
        '<p class="fh-page-kicker">' + esc(t("skilltree.kicker", "Fertigkeiten")) + '</p>' +
        '<h1 class="fh-page-title">' + esc(t("skilltree.title", "Skill-Baum")) + '</h1>' +
        (vorschau ? '<p class="fh-skill-vorschau">👁️ ' + esc(t("skilltree.preview", "Vorschau - nur fuer dich sichtbar, bis du die Funktion freigibst.")) + '</p>' : '') +
        '<p class="fh-page-lead">' + esc(t("skilltree.lead", "Ein Punkt je Passstufe. Schalte Knoten frei und behalte den Vorteil dauerhaft.")) + '</p>' +
      '</div>' +
      '<p class="fh-skill-punkte">' + esc(t("skilltree.points", "Freie Skillpunkte")) + ': <strong>' + esc(punkte) + '</strong></p>' +
      '<div class="fh-skill-flaeche">' +
        '<svg class="fh-skill-linien" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + kanten + '</svg>' +
        knoten +
      '</div>' +
      '<p class="fh-skill-status" id="fh-skill-status"></p>';
  }

  function zeichnen(ziel) {
    ziel.innerHTML = baumHtml();
  }

  window.fhSkillFreischalten = async function (btn) {
    const id = btn.getAttribute("data-node");
    const statusEl = document.getElementById("fh-skill-status");
    const setz = function (msg) { if (statusEl) statusEl.textContent = msg; };
    if (!window.supabaseClient) { setz(t("skilltree.noDb", "Verbindung nicht verfuegbar.")); return; }
    btn.disabled = true;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("skill_freischalten", { p_node: id });
      });
      if (error) throw error;
      if (data > 0) {
        cache.unlocked = cache.unlocked.concat([id]);
        if (typeof awardActionXp === "function") { /* optional: keine XP hier */ }
      } else if (data === 0) {
        setz(t("skilltree.already", "Schon freigeschaltet."));
      } else if (data === -2) {
        setz(t("skilltree.needPrereq", "Erst den vorherigen Knoten freischalten."));
      } else if (data === -3) {
        setz(t("skilltree.needPoints", "Nicht genug Skillpunkte."));
      } else {
        setz(t("skilltree.unknown", "Dieser Knoten ist unbekannt."));
      }
      const ziel = document.getElementById("skill-tree-content");
      if (ziel) zeichnen(ziel);
    } catch (err) {
      console.warn("Freischalten fehlgeschlagen:", err);
      setz(t("skilltree.error", "Hat nicht geklappt - versuch es spaeter noch einmal."));
      btn.disabled = false;
    }
  };

  async function updateSkillTreePage(pageID) {
    if (pageID !== "skill-tree") return;
    const ziel = document.getElementById("skill-tree-content");
    if (!ziel) return;

    /* Doppelte Absicherung zur Nav-Ausblendung: ist die Funktion
       weder freigegeben noch bin ich Admin, hier nichts zeigen. */
    if (typeof window.fhFeatureSichtbar === "function" && !window.fhFeatureSichtbar(FLAG)) {
      ziel.innerHTML = '<p class="wheel-status">' + esc(t("skilltree.locked", "Diese Funktion ist noch nicht freigeschaltet.")) + '</p>';
      return;
    }

    ziel.innerHTML = '<p class="wheel-status">' + esc(t("common.loading", "Lade ...")) + '</p>';
    const ok = await laden();
    if (!ok) {
      ziel.innerHTML = '<p class="wheel-status">' + esc(t("skilltree.noDb", "Verbindung nicht verfuegbar.")) + '</p>';
      return;
    }
    zeichnen(ziel);
    if (typeof applyTranslations === "function") applyTranslations();
  }
  window.updateSkillTreePage = updateSkillTreePage;

  /* Die Boni werden auch ausserhalb der Seite gebraucht (Rad,
     Spielothek). Einmal frueh laden, sobald Anmeldung steht. */
  document.addEventListener("DOMContentLoaded", function () {
    if (window.supabaseClient && typeof wheelAuthReady !== "undefined") {
      laden();
    }
  });
})();
