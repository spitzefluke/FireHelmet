/* ======================================================
   FH STARTSEITEN-DASHBOARD (Entwurf 1c)
   ---------------------------------------------------
   Unter der Cinematic-Sequenz steht jetzt eine Uebersicht mit
   fuenf Karten: Weiterlesen, Schatzrad, Wochenrennen,
   Geheimcode und Rangliste.

   Warum: der eigene Stand lag bisher ueber fuenf Unterseiten
   verstreut. Wer nach ein paar Tagen wiederkam, musste sich
   durchklicken, um zu sehen, wo er stehengeblieben ist.

   ES WIRD NICHTS NEU GERECHNET. Jede Karte liest genau die
   Quelle, aus der auch die zugehoerige Seite liest:
     - Weiterlesen  -> stories (stories-data.js) + getReadChapterIds()
     - Schatzrad    -> getWheelState() (wheel.js)
     - Wochenrennen -> getLocalRaceProgress() + raceConfig (race-data.js)
     - Geheimcode   -> getCrackedCodes() + codes (codes-data.js)
     - Rangliste    -> dieselbe players-Abfrage wie loadLeaderboard()
   Weicht eine Karte von "ihrer" Seite ab, liegt der Fehler also
   in der gemeinsamen Quelle und nicht an zwei Rechenwegen.

   Alle Klicks fuehren ueber changePage()/openStory() auf die
   bestehenden Seiten - die Karten sind Einstiege, keine zweite
   Bedienoberflaeche.

   Faellt eine Quelle aus (Skript nicht geladen, kein Netz), wird
   genau diese eine Karte ausgeblendet. Der Rest bleibt stehen.
====================================================== */

(function () {
  "use strict";

  /* ---------- kleine Helfer ---------- */

  function txt(key, fallback) {
    return typeof t === "function" ? t(key, fallback) : fallback;
  }

  /* escapeHtml() kommt aus wheel.js und wird auch von der Rangliste
     benutzt. Fehlt es, lieber grob entschaerfen als ungeprueft
     einsetzen - in die Karten fliessen fremde Spitznamen ein. */
  function esc(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function card(el, html) {
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
  }

  function hide(el) {
    if (el) el.hidden = true;
  }

  function kopf(kicker, icon, farbe) {
    return `
      <div class="fh-card-head">
        <p class="fh-card-kicker">${esc(kicker)}</p>
        <i class="ph ${icon} fh-card-icon" style="color:${farbe}" aria-hidden="true"></i>
      </div>`;
  }

  function balken(prozent, farbe) {
    const p = Math.max(0, Math.min(100, Math.round(prozent)));
    return `<div class="fh-bar"><div class="fh-bar-fill" style="width:${p}%;background:${farbe}"></div></div>`;
  }

  function cta(label, icon, aktion) {
    return `<button type="button" class="fh-cta" onclick="${aktion}">
        <i class="ph ${icon}" aria-hidden="true"></i><span>${esc(label)}</span>
      </button>`;
  }

  /* ---------- 1. Weiterlesen ---------- */

  function renderRead() {
    const el = document.getElementById("fh-dash-read");
    if (typeof stories === "undefined" || !Array.isArray(stories) || !stories.length) {
      return hide(el);
    }

    const gelesen = typeof getReadChapterIds === "function" ? getReadChapterIds() : [];

    /* Gesperrte Kapitel (siteConfig.lockedChapterIds, siehe
       isChapterLocked() in stories.js) zaehlen hier nicht als
       "offen" - die Karte darf nicht auf ein Kapitel zeigen, das
       beim Klick nur eine Sperrmeldung ausloest. */
    const offen = (k) =>
      !gelesen.includes(k.id)
      && !(typeof isChapterLocked === "function" && isChapterLocked(k.id));

    /* Das Logbuch, an dem gerade gearbeitet wird: das erste mit noch
       offenen Kapiteln. Gibt es keins mehr, das letzte - dann steht
       die Karte auf "durch". */
    let logbuch = stories.find((st) => (st.chapters || []).some(offen));
    const durch = !logbuch;
    if (durch) logbuch = stories[stories.length - 1];

    const kapitel = logbuch.chapters || [];
    const fertig = kapitel.filter((k) => gelesen.includes(k.id)).length;
    const naechstes = kapitel.find(offen);
    const prozent = kapitel.length ? (fertig / kapitel.length) * 100 : 0;

    const titel = durch
      ? txt("dash.readDone", "Alles gelesen")
      : naechstes.title;

    const cover = logbuch.cover
      ? `<img class="fh-card-cover" src="${esc(logbuch.cover)}" alt="" loading="lazy" decoding="async">`
      : "";

    card(el, `
      ${cover}
      <div class="fh-card-body">
        ${kopf(txt("dash.readKicker", "Weiterlesen"), "ph-book-open-text", "var(--fh-gold-bright)")}
        <h3 class="fh-card-title">${esc(titel)}</h3>
        <p class="fh-card-note">${esc(logbuch.title)}</p>
        ${balken(prozent, "linear-gradient(90deg, var(--fh-gold), var(--fh-gold-bright))")}
        <p class="fh-card-note fh-card-note-sm">${fertig} / ${kapitel.length} ${esc(txt("dash.readChapters", "Kapitel gelesen"))}</p>
        <div class="fh-card-spacer"></div>
        ${cta(
          durch ? txt("dash.readAgain", "Logbuch öffnen") : txt("dash.readOpen", "Kapitel öffnen"),
          "ph-book-open-text",
          /* openStory() setzt currentStory UND wechselt selbst auf die
             Detailseite - openChapter() braucht beides und bringt den
             Leser dann direkt in den Text. Ist alles gelesen, bleibt es
             bei der Uebersicht des Logbuchs. */
          durch
            ? `openStory('${esc(logbuch.id)}')`
            : `openStory('${esc(logbuch.id)}');openChapter('${esc(naechstes.id)}')`
        )}
      </div>`);
  }

  /* ---------- 2. Schatzrad ---------- */

  function renderWheel() {
    const el = document.getElementById("fh-dash-wheel");
    if (typeof getWheelState !== "function") return hide(el);

    const state = getWheelState();
    const heute = new Date().toISOString().slice(0, 10);
    const schonGedreht = state.lastSpin === heute;

    let titel;
    let hinweis;

    if (!state.nickname) {
      titel = txt("dash.wheelNoName", "Erst anmelden");
      hinweis = txt("dash.wheelNoNameNote", "Mit einem Namen darfst du täglich einmal drehen.");
    } else if (schonGedreht) {
      titel = txt("dash.wheelDone", "Heute schon gedreht");
      hinweis = state.streak > 0
        ? state.streak + " " + txt("dash.wheelStreak", "Tage in Folge")
        : txt("dash.wheelComeBack", "Morgen geht es weiter.");
    } else {
      titel = txt("dash.wheelReady", "Dreh frei");
      hinweis = state.streak > 0
        ? state.streak + " " + txt("dash.wheelStreak", "Tage in Folge")
        : txt("dash.wheelFirst", "Deine erste Drehung wartet.");
    }

    card(el, `
      ${kopf(txt("dash.wheelKicker", "Schatzrad"), "ph-compass", "var(--fh-gold-bright)")}
      <h3 class="fh-card-title">${esc(titel)}</h3>
      <p class="fh-card-note">${esc(hinweis)}</p>
      <div class="fh-card-spacer"></div>
      ${cta(
        state.nickname ? txt("dash.wheelCta", "Zum Schatzrad") : txt("dash.wheelCtaLogin", "Namen wählen"),
        state.nickname ? "ph-arrows-clockwise" : "ph-sign-in",
        state.nickname ? "changePage('wheel')" : "changePage('login')"
      )}`);
  }

  /* ---------- 3. Wochenrennen ---------- */

  function renderRace() {
    const el = document.getElementById("fh-dash-race");
    if (typeof getLocalRaceProgress !== "function" || typeof raceConfig === "undefined") {
      return hide(el);
    }

    const stand = getLocalRaceProgress();
    const ziel = raceConfig.finishLine || 150;
    const strecke = typeof getWeeklyTrack === "function" ? getWeeklyTrack() : null;

    card(el, `
      ${kopf(txt("dash.raceKicker", "Wochenrennen"), "ph-flag-checkered", "var(--fh-cold)")}
      <div class="fh-card-figure">
        <span class="fh-card-figure-value">${stand}</span>
        <span class="fh-card-note">${txt("dash.raceOf", "von")} ${ziel}</span>
      </div>
      <p class="fh-card-note">${esc(txt("dash.raceTrack", "Strecke") + ": " + (strecke ? strecke.name : "-"))}</p>
      ${balken((stand / ziel) * 100, "linear-gradient(90deg, var(--fh-blue), var(--fh-cold))")}
      <p class="fh-card-note fh-card-note-sm">+${raceConfig.progressPerSpin} ${esc(txt("dash.racePerSpin", "pro Drehung"))} · +${raceConfig.progressPerCode} ${esc(txt("dash.racePerCode", "pro Code"))}</p>
      <div class="fh-card-spacer"></div>
      ${cta(txt("dash.raceCta", "Zum Rennen"), "ph-flag-checkered", "changePage('race')")}`);
  }

  /* ---------- 4. Geheimcode ---------- */

  function renderCode() {
    const el = document.getElementById("fh-dash-code");
    if (typeof codes === "undefined" || !Array.isArray(codes)) return hide(el);

    const geknackt = typeof getCrackedCodes === "function" ? getCrackedCodes() : [];
    const offen = Math.max(0, codes.length - geknackt.length);

    card(el, `
      ${kopf(txt("dash.codeKicker", "Geheimcode"), "ph-key", "var(--fh-gold-bright)")}
      <div class="fh-card-figure">
        <span class="fh-card-figure-value">${geknackt.length}</span>
        <span class="fh-card-note">${txt("dash.codeOf", "von")} ${codes.length}</span>
      </div>
      ${balken((geknackt.length / codes.length) * 100, "linear-gradient(90deg, var(--fh-gold), var(--fh-gold-bright))")}
      <p class="fh-card-note fh-card-note-sm">${offen} ${esc(txt("dash.codeOpen", "noch nicht geknackt"))}</p>
      <div class="fh-card-spacer"></div>
      ${cta(txt("dash.codeCta", "Code eingeben"), "ph-arrow-right", "changePage('code')")}`);
  }

  /* ---------- 5. Rangliste ---------- */

  async function renderBoard() {
    const el = document.getElementById("fh-dash-board");
    if (!el) return;

    el.hidden = false;
    el.innerHTML = kopf(txt("dash.boardKicker", "Rangliste"), "ph-trophy", "var(--fh-gold-bright)")
      + (typeof fhSkeletonList === "function"
        ? fhSkeletonList(3, { label: txt("dash.boardLoading", "Lade Rangliste ...") })
        : "");

    // supabaseClient entsteht erst in einem async-Anlauf (siehe
    // scripts/supabase/supabase-client.js) und ist beim
    // DOMContentLoaded meist noch null. wheelAuthReady ist genau das
    // Signal, auf das auch shop.js und wheel.js warten - ohne es
    // haette die Karte sich beim ersten Laden immer selbst
    // ausgeblendet.
    if (typeof wheelAuthReady !== "undefined") {
      try {
        await wheelAuthReady;
      } catch (err) {
        /* Anmeldung fehlgeschlagen - unten faengt die Pruefung das ab. */
      }
    }

    // Ohne Verbindung waere die Karte eine leere Behauptung.
    if (typeof supabaseClient === "undefined" || !supabaseClient) return hide(el);

    return supabaseClient
      .from("players")
      .select("nickname, codes_cracked, avatar")
      .then(({ data, error }) => {
        if (error) throw error;

        const spieler = (data || [])
          .filter((row) => row.nickname)
          .sort((a, b) => (b.codes_cracked || 0) - (a.codes_cracked || 0))
          .slice(0, 3);

        if (!spieler.length) return hide(el);

        const zeilen = spieler.map((row, i) => {
          const bild = row.avatar && typeof isAvatarImagePath === "function" && isAvatarImagePath(row.avatar)
            ? `<img src="${esc(row.avatar)}" alt="" loading="lazy" decoding="async">`
            : `<span>${esc(row.avatar || "🏴‍☠️")}</span>`;

          return `
            <li class="fh-card-rank">
              <span class="fh-card-rank-nr">${i + 1}</span>
              <span class="fh-card-rank-avatar">${bild}</span>
              <span class="fh-card-rank-name">${esc(row.nickname)}</span>
              <span class="fh-card-rank-score">${row.codes_cracked || 0}</span>
            </li>`;
        }).join("");

        card(el, `
          ${kopf(txt("dash.boardKicker", "Rangliste"), "ph-trophy", "var(--fh-gold-bright)")}
          <ol class="fh-card-ranks">${zeilen}</ol>
          <div class="fh-card-spacer"></div>
          ${cta(txt("dash.boardCta", "Ganze Rangliste"), "ph-trophy", "changePage('leaderboard')")}`);
      })
      .catch(() => hide(el));
  }

  /* ---------- Anstoss ---------- */

  function fhRenderHomeDashboard() {
    // Jede Karte einzeln absichern: faellt eine Quelle aus, sollen die
    // uebrigen vier trotzdem stehen.
    [renderRead, renderWheel, renderRace, renderCode, renderBoard].forEach((fn) => {
      try {
        // renderBoard laeuft asynchron weiter - ohne das .catch()
        // landete ein Netzfehler als unbehandelte Ablehnung in der
        // Konsole, statt nur diese eine Karte auszublenden.
        const ergebnis = fn();
        if (ergebnis && typeof ergebnis.catch === "function") {
          ergebnis.catch((err) => console.warn("Dashboard-Karte:", err));
        }
      } catch (err) {
        console.warn("Dashboard-Karte konnte nicht aufgebaut werden:", err);
      }
    });
  }

  window.fhRenderHomeDashboard = fhRenderHomeDashboard;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fhRenderHomeDashboard);
  } else {
    fhRenderHomeDashboard();
  }
})();
