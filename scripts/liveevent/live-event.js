/* ======================================================
   LIVE-EVENT: DIE BESUCHER-SEITE
   ---------------------------------------------------
   Liest die Zustandszeile public.live_event (siehe
   supabase/game-migration/23-live-event.sql) und reagiert auf
   Aenderungen: Banderole, Disco, Konfetti/Blitz/Sound,
   Bildschirm-Uebernahme, und das Einloesen eines Grants.

   TRANSPORT
   In erster Linie Supabase Realtime (Postgres Changes). Falls das
   im Dashboard nicht eingeschaltet ist, greift ein kurzes Polling
   als Rueckfall - dann kommt alles genauso an, nur ein paar
   Sekunden spaeter.

   VORSCHAU FUER DEN ADMIN
   Jeder Effekt ist eine reine Funktion und haengt an
   window.fhLiveVorschau.* - das Admin-Panel ruft sie direkt auf
   ("nur bei mir testen"), ohne etwas an alle zu senden.

   SICHERHEIT
   Der Browser fuehrt nur aus, was in der Zeile steht; schreiben
   darf sie nur der Admin (RLS). Ein Grant wird server-seitig
   verrechnet (RPC), der Betrag kommt nicht aus dem Browser.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const DISCO_MUSIK = "music/disco.mp3"; // Der Streamer legt hier seine Datei ab; fehlt sie, laeuft Disco ohne Ton.

  /* supabaseClient ist ein top-level let in supabase-client.js und
     haengt deshalb NICHT an window - window.supabaseClient waere
     immer undefined (siehe CLAUDE.md). Direkt pruefen. */
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }

  function esc(v) { return typeof escapeHtml === "function" ? escapeHtml(v == null ? "" : v) : String(v == null ? "" : v); }

  /* ------------------------------------------------------
     EFFEKTE (reine Funktionen - auch fuer die Admin-Vorschau)
  ------------------------------------------------------ */

  function schicht(id, klasse) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      if (klasse) el.className = klasse;
      document.body.appendChild(el);
    }
    return el;
  }

  let banderoleUhr = null;
  function banderole(text, farbe, von) {
    if (!text) return;
    const el = schicht("fh-live-banderole", "fh-live-banderole");
    const sicherFarbe = /^#[0-9a-fA-F]{3,8}$/.test(farbe || "") ? farbe : "var(--fh-gold, #f0c96a)";
    el.style.setProperty("--live-farbe", sicherFarbe);
    /* Per textContent statt innerHTML aufbauen: der Text landet als
       reiner Textknoten und kann nie als Markup gelesen werden, egal
       was in der Zeile steht. (escapeHtml wuerde hier zwar reichen,
       aber der textContent-Umweg im Escaper laesst CodeQL zu Recht
       aufhorchen - so gibt es die Stelle gar nicht erst.) */
    el.textContent = "";
    if (von) {
      const vonEl = document.createElement("span");
      vonEl.className = "fh-live-von";
      vonEl.textContent = von;
      el.appendChild(vonEl);
    }
    const textEl = document.createElement("span");
    textEl.className = "fh-live-text";
    textEl.textContent = text;
    el.appendChild(textEl);
    el.classList.remove("ist-weg");
    // Reflow erzwingen, damit die Einblend-Animation neu startet
    void el.offsetWidth;
    el.classList.add("ist-da");
    clearTimeout(banderoleUhr);
    banderoleUhr = setTimeout(function () {
      el.classList.remove("ist-da");
      el.classList.add("ist-weg");
    }, 6000);
  }

  let discoAudio = null;
  function discoAn() {
    document.body.classList.add(RUHIG.matches ? "fh-live-disco-ruhig" : "fh-live-disco");
    schicht("fh-live-disco-licht", "fh-live-disco-licht");
    if (!discoAudio) {
      try {
        discoAudio = new Audio(DISCO_MUSIK);
        discoAudio.loop = true;
        discoAudio.volume = 0.6;
      } catch (e) { discoAudio = null; }
    }
    if (discoAudio) { discoAudio.currentTime = 0; discoAudio.play().catch(function () { /* Autoplay evtl. blockiert */ }); }
  }
  function discoAus() {
    document.body.classList.remove("fh-live-disco", "fh-live-disco-ruhig");
    const l = document.getElementById("fh-live-disco-licht");
    if (l) l.remove();
    if (discoAudio) { try { discoAudio.pause(); } catch (e) {} }
  }

  function konfetti() {
    if (RUHIG.matches) return; // bei reduzierter Bewegung kein Konfetti
    const halter = schicht("fh-live-konfetti", "fh-live-konfetti");
    const farben = ["#f0c96a", "#e0402a", "#4f8f5c", "#5aa0e0", "#d6a84f", "#ffffff"];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement("span");
      p.className = "fh-live-konfetti-stueck";
      p.style.left = Math.random() * 100 + "%";
      p.style.background = farben[i % farben.length];
      p.style.animationDelay = (Math.random() * 0.5) + "s";
      p.style.animationDuration = (1.8 + Math.random() * 1.4) + "s";
      p.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
      halter.appendChild(p);
    }
    setTimeout(function () { if (halter) halter.innerHTML = ""; }, 3600);
  }

  function blitz() {
    const el = schicht("fh-live-blitz", "fh-live-blitz");
    el.classList.remove("ist-an"); void el.offsetWidth; el.classList.add("ist-an");
    setTimeout(function () { el.classList.remove("ist-an"); }, 700);
  }

  let soundAudio = null;
  function sound() {
    try {
      soundAudio = soundAudio || new Audio("music/countdown-4.mp3");
      soundAudio.currentTime = 0;
      soundAudio.play().catch(function () {});
    } catch (e) { /* egal */ }
  }

  function pulse(kind) {
    if (kind === "konfetti") konfetti();
    else if (kind === "blitz") blitz();
    else if (kind === "sound") sound();
  }

  function uebernahmeAn() {
    const el = schicht("fh-live-buehne", "fh-live-buehne");
    el.innerHTML =
      '<div class="fh-live-buehne-inhalt">' +
        '<span class="fh-live-buehne-logo" aria-hidden="true">🔥</span>' +
        '<p class="fh-live-buehne-titel">' + esc(typeof window.t === "function" ? window.t("live.stageTitle", "Live-Event laeuft") : "Live-Event laeuft") + '</p>' +
        '<p class="fh-live-buehne-sub">' + esc(typeof window.t === "function" ? window.t("live.stageSub", "Bleib dran - gleich passiert etwas.") : "Bleib dran - gleich passiert etwas.") + '</p>' +
      '</div>';
    el.classList.add("ist-da");
  }
  function uebernahmeAus() {
    const el = document.getElementById("fh-live-buehne");
    if (el) el.remove();
  }

  window.fhLiveVorschau = {
    banderole: banderole, discoAn: discoAn, discoAus: discoAus,
    konfetti: konfetti, blitz: blitz, sound: sound, pulse: pulse,
    uebernahmeAn: uebernahmeAn, uebernahmeAus: uebernahmeAus,
  };

  /* ------------------------------------------------------
     AUF DIE ZUSTANDSZEILE REAGIEREN
  ------------------------------------------------------ */
  let letzte = { message_at: null, pulse_at: null, grant_at: null, disco: false, takeover: false, erstesMal: true };

  async function grantEinloesen(grantId) {
    if (!grantId || !dbDa()) return;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("live_grant_einloesen", { p_grant: grantId });
      });
      if (error) throw error;
      if (typeof data === "number" && data > 0) {
        banderole((typeof window.t === "function" ? window.t("live.grantGot", "Geschenk erhalten!") : "Geschenk erhalten!"), "#4f8f5c", "🎁");
        if (typeof refreshPlayerCard === "function") refreshPlayerCard();
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
      }
    } catch (err) { console.warn("Grant konnte nicht eingeloest werden:", err); }
  }

  function anwenden(z) {
    if (!z) return;
    const erst = letzte.erstesMal;

    /* Beim ERSTEN Laden nicht rueckwirkend feuern (sonst blitzt es
       bei jedem Seitenaufruf, weil pulse_at schon gesetzt ist) -
       nur Dauerzustaende (Disco, Uebernahme) sofort herstellen. */
    if (!erst && z.message_at && z.message_at !== letzte.message_at) {
      banderole(z.message, z.message_color, z.message_from);
    }
    if (!erst && z.pulse_at && z.pulse_at !== letzte.pulse_at) {
      pulse(z.pulse_kind);
    }
    if (!erst && z.grant_at && z.grant_at !== letzte.grant_at) {
      grantEinloesen(z.grant_id);
    }
    if (z.disco !== letzte.disco) { z.disco ? discoAn() : discoAus(); }
    if (z.takeover !== letzte.takeover) { z.takeover ? uebernahmeAn() : uebernahmeAus(); }

    letzte = {
      message_at: z.message_at, pulse_at: z.pulse_at, grant_at: z.grant_at,
      disco: z.disco, takeover: z.takeover, erstesMal: false,
    };
  }

  async function holen() {
    if (!dbDa()) return;
    try {
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.from("live_event").select("*").eq("id", 1).maybeSingle();
      });
      if (error) throw error;
      anwenden(data);
    } catch (err) { /* still - Rueckfall-Polling versucht es gleich wieder */ }
  }

  function starten() {
    if (!dbDa()) return;
    holen(); // Grundzustand
    // Realtime-Abo (wenn im Dashboard aktiviert)
    try {
      supabaseClient
        .channel("live_event_kanal")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_event" },
          function (nutzlast) { anwenden(nutzlast.new); })
        .subscribe();
    } catch (e) { /* kein Realtime -> Polling traegt */ }
    // Rueckfall-Polling: alle 5 s. Guenstig genug fuer ein Live-Event.
    setInterval(holen, 5000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (typeof onSiteConfigReady === "function") onSiteConfigReady(starten);
    else starten();
  });
})();
