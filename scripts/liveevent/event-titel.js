/* ======================================================
   EVENT-TITEL: LADEN UND ANZEIGEN
   ---------------------------------------------------
   Titel, die der Admin im Live-Event vergibt (siehe
   supabase/game-migration/27-event-titel.sql). Jeder Spieler traegt
   seinen NEUESTEN Event-Titel - auf der Spielerkarte und in der
   Rangliste, dort VOR einem Skill-Baum-Titel.

   Die Farbanimation ist reines CSS (.fh-titel-<stil> in
   css/30-events.css). Der Stil kommt nur aus der festen Liste
   STILE - ein unbekannter Wert wird gar nicht gezeichnet. Der Text
   ist frei (bis 32 Zeichen) und wird deshalb immer escaped.

   Anders als die Skill-Titel haengen Event-Titel NICHT am
   Feature-Flag skillTree: ein im Event verteilter Titel ist sofort
   fuer alle sichtbar.
====================================================== */

(function () {
  "use strict";

  const STILE = ["regenbogen", "gold", "feuer", "eis", "hacked"];

  /* Farbe der Banderole, wenn man selbst einen Titel bekommt. Die
     Banderole nimmt nur Hex-Werte (siehe live-event.js). */
  const BANDEROLE_FARBE = {
    regenbogen: "#f0c96a", gold: "#f0c96a", feuer: "#ff6a2a", eis: "#42b8ff", hacked: "#39ff14",
  };

  let karte = new Map();   // uid -> { text, stil }
  let eigeneUid = null;

  /* supabaseClient ist ein top-level let (siehe CLAUDE.md) - nie
     ueber window pruefen. */
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function esc(v) { return typeof escapeHtml === "function" ? escapeHtml(v == null ? "" : String(v)) : ""; }

  async function laden() {
    if (!dbDa()) return karte;
    try {
      if (typeof wheelAuthReady !== "undefined") eigeneUid = await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("event_titel_je_spieler");
      });
      if (error) throw error;
      const neu = new Map();
      (data || []).forEach(function (z) {
        if (STILE.indexOf(z.stil) !== -1 && z.text) neu.set(z.firebase_uid, { text: z.text, stil: z.stil });
      });
      karte = neu;
      window.dispatchEvent(new CustomEvent("fhEventTitelGeladen"));
    } catch (err) {
      console.warn("Event-Titel konnten nicht geladen werden:", err);
    }
    return karte;
  }

  function fuer(uid) { return (uid && karte.get(uid)) || null; }
  function eigener() { return fuer(eigeneUid); }

  /* Ein Titel als HTML. Der Stil ist geprueft, der Text escaped. */
  function html(titel, extraKlasse) {
    if (!titel || STILE.indexOf(titel.stil) === -1) return "";
    return '<span class="fh-event-titel fh-titel-' + titel.stil + (extraKlasse ? " " + extraKlasse : "") + '">' + esc(titel.text) + "</span>";
  }

  /* Nach einem eingeloesten Geschenk (live-event.js): neu laden und,
     falls es ein neuer eigener Titel war, ihn gross ankuendigen. */
  async function nachGeschenk() {
    const vorher = eigener();
    await laden();
    const nachher = eigener();
    const neu = nachher && (!vorher || vorher.text !== nachher.text || vorher.stil !== nachher.stil);
    if (neu && window.fhLiveVorschau) {
      const wort = typeof window.t === "function" ? window.t("live.titleGot", "Neuer Titel") : "Neuer Titel";
      window.fhLiveVorschau.banderole(wort + ": " + nachher.text, BANDEROLE_FARBE[nachher.stil]);
    }
  }

  window.fhEventTitel = {
    STILE: STILE, laden: laden, fuer: fuer, eigener: eigener, html: html, nachGeschenk: nachGeschenk,
  };

  /* Sind die Titel da, die eigene Spielerkarte neu zeichnen. */
  window.addEventListener("fhEventTitelGeladen", function () {
    if (typeof refreshPlayerCard === "function") refreshPlayerCard();
  });

  document.addEventListener("DOMContentLoaded", function () {
    if (dbDa()) laden();
  });
})();
