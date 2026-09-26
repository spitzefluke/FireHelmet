/* ======================================================
   LIVE-STORYS: SZENEN FUER ALLE ZUSCHAUER
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Skill-Baum & Live-Event".
   Der Admin startet eine Story (admin_live_story, Migration 29);
   live-event.js reicht die Zustandszeile hierher weiter, und jeder
   Browser spielt die Szenen selbst ab. Wer spaeter dazukommt,
   steigt anhand von story_at an der passenden Szene ein.

   AUFBAU
   - STORYS: Szenen je Story mit ihrer Dauer (wie im Entwurf).
   - EBENEN: jede sichtbare Schicht mit der Bedingung, in welcher
     Szene sie steht. Beim Szenenwechsel wird jede Ebene an- oder
     abgebaut - das entspricht den <sc-if>-Bloecken des Entwurfs.
   - Seiteneffekte: Farbfilter ueber eine Ebene mit backdrop-filter
     (NICHT filter auf #fh-main: das machte #fh-main zum Bezug fuer
     alle fest positionierten Elemente darin), Wackeln/Schaukeln
     kurz per transform auf #fh-main.
   - Belohnungen holt live_story_belohnung() ab; Betrag, Titel und
     Skillpunkte legt die Datenbank fest, nicht dieser Code.
   - Die Hintertueren nach "Hacked" und der Schatzregen sind kleine
     Spiele im Browser.

   Alle Texte kommen aus i18n.js (story.*). Markup mit Inline-Stilen
   ist wie im Entwurf; alles, was aus der Datenbank kommt, geht nur
   per textContent ins DOM.

   Die Keyframes heissen fhSt... und stehen in css/30-events.css.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Text aus i18n, escaped - fuer das feste Markup der Szenen. */
  function T(key, de) { return esc(t("story." + key, de)); }

  function svg(pfade, groesse, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:' + groesse + ';height:' + groesse + ';display:block;flex-shrink:0;' + (extra || '') + '">' + pfade + '</svg>';
  }
  const IC = {
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    skull: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  };

  /* ------------------------------------------------------
     DIE STORYS - Szenen und Dauer in ms, wie im Entwurf.
     loop: Disco springt von Szene 4 zurueck auf 3, bis der Admin
     sie beendet (story_ende_at), dann Szene 5.
     Die fruehesten Belohnungszeiten in 29-live-storys.sql sind an
     diese Dauern angelehnt - wer sie aendert, prueft dort mit.
  ------------------------------------------------------ */
  const STORYS = {
    hacked:    { szenen: [1400, 4800, 3600, 10500, 3800, 3200, 5200] },
    ende:      { szenen: [2600, 3800, 2600, 2800] },
    schatz:    { szenen: [3200, 2700, 15000, 4500] },
    nebel:     { szenen: [2200, 2400, 3200, 3000, 3200] },
    flut:      { szenen: [1800, 2600, 3200, 3000, 3000] },
    disco:     { szenen: [1400, 2700, 4200, 3600, 2600], loop: [3, 4] },
    sturm:     { szenen: [2000, 2400, 1800, 3200, 3000] },
    nordlicht: { szenen: [2400, 4400, 3600, 3600, 3000] },
    /* Migration 31: Werbungsflut und das Gegenhack-Finale. Die Flut
       und der Sieg-Bildschirm leben in werbungsflut.js/gegenhack.js;
       die Szene gibt nur den Rahmen vor. */
    werbung:              { szenen: [2200, 55000, 800] },
    gegenhack_niederlage: { szenen: [4800, 55000, 800] },
    gegenhack_sieg:       { szenen: [1600, 30000] },
  };
  const ZEITEN_IN_SZENE = {};  // Summe der Dauer bis zum Beginn jeder Szene
  Object.keys(STORYS).forEach(function (st) {
    let summe = 0;
    ZEITEN_IN_SZENE[st] = STORYS[st].szenen.map(function (ms) { const beginn = summe; summe += ms; return beginn; });
    STORYS[st].gesamt = summe;
  });

  /* ------------------------------------------------------
     ZUSTAND
  ------------------------------------------------------ */
  let lauf = null;          // { story, id, n, vorschau, timer, szeneAb }
  let aktuelleId = null;    // story_id der zuletzt gesehenen Zeile
  let letztesEnde = null;   // story_ende_at der zuletzt gesehenen Zeile
  let musikVersion = null;  // live_event.musik_version
  let gehackt = false;      // Systemausfall: bleibt bis zur naechsten Story
  let nachregen = false;    // nach dem Sturm: leiser Regen bis zum naechsten Event
  let sturmNachwirkung = true;
  const timer = [];         // alle Zeitgeber der laufenden Story
  const ebenen = {};        // Name -> Element

  function spaeter(fn, ms) { const id = setTimeout(fn, ms); timer.push(id); return id; }
  function timerWeg() { while (timer.length) clearTimeout(timer.pop()); }

  function halter() {
    let h = document.getElementById("fh-story");
    if (!h) {
      h = document.createElement("div");
      h.id = "fh-story";
      document.body.appendChild(h);
    }
    return h;
  }

  /* Festes Markup (Inline-Stile wie im Entwurf) in ein Element. */
  function aus(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function ebene(name, an, bau) {
    if (an) {
      if (!ebenen[name]) {
        const el = bau();
        if (!el) return;
        el.setAttribute("data-story-ebene", name);
        el.setAttribute("aria-hidden", el.getAttribute("aria-hidden") || "true");
        halter().appendChild(el);
        ebenen[name] = el;
      }
    } else if (ebenen[name]) {
      ebenen[name].remove();
      delete ebenen[name];
    }
  }

  /* ------------------------------------------------------
     SEITENEFFEKTE
  ------------------------------------------------------ */
  let filterUhr = null;
  function seitenFilter(wert, ms) {
    let el = document.getElementById("fh-story-filter");
    if (!el) {
      el = document.createElement("div");
      el.id = "fh-story-filter";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    clearTimeout(filterUhr);
    el.style.transition = "opacity " + (ms || 600) + "ms ease";
    if (wert) {
      el.style.backdropFilter = wert;
      el.style.webkitBackdropFilter = wert;
      void el.offsetWidth;
      el.style.opacity = "1";
    } else {
      el.style.opacity = "0";
      filterUhr = setTimeout(function () { el.style.backdropFilter = ""; el.style.webkitBackdropFilter = ""; }, (ms || 600) + 50);
    }
  }

  /* Dauerhafte Bewegung der ganzen Seite (Schaukeln, Schwanken). */
  function seitenBewegung(klasse) {
    const main = document.getElementById("fh-main");
    if (!main) return;
    ["fh-story-schaukeln", "fh-story-schwanken", "fh-story-glitch", "fh-story-gehackt-flackern"].forEach(function (k) {
      if (k !== klasse) main.classList.remove(k);
    });
    if (klasse && !RUHIG.matches) main.classList.add(klasse);
  }

  let bebenZaehler = 0;
  function beben() {
    if (RUHIG.matches) return;
    const main = document.getElementById("fh-main");
    if (!main) return;
    bebenZaehler++;
    main.classList.remove("fh-story-beben-1", "fh-story-beben-2");
    void main.offsetWidth;
    main.classList.add("fh-story-beben-" + (bebenZaehler % 2 + 1));
    setTimeout(function () { main.classList.remove("fh-story-beben-1", "fh-story-beben-2"); }, 500);
  }

  /* Der Skill-Baum reagiert auf die Storys (css/30-events.css). */
  function himmelStimmung(klasse) {
    ["fh-story-hack", "fh-story-beat", "fh-story-geladen", "fh-story-geist", "fh-story-schwimmt", "fh-story-wunsch"].forEach(function (k) {
      document.body.classList.toggle(k, k === klasse);
    });
  }

  function effekte() { return window.fhLiveVorschau || {}; }
  function banderole(text, von, farbe, mono) { const e = effekte(); if (e.banderole) e.banderole(text, farbe, von, mono); }
  function konfetti() { const e = effekte(); if (e.konfetti) e.konfetti(); }
  function blitz() { const e = effekte(); if (e.blitz) e.blitz(); }

  /* ------------------------------------------------------
     DIE EBENEN DER SZENEN
     [Name, Bedingung, Bau]. sz("sturm") ist die laufende Szene der
     Story (oder 0). Ebenen mit wechselndem Ein-/Ausblenden haengen
     die Szene an den Namen, damit sie neu gebaut werden.
  ------------------------------------------------------ */
  function sz(st) { return lauf && lauf.story === st ? lauf.n : 0; }

  const MITTE = "position:fixed;left:0;right:0;margin:0;text-align:center;pointer-events:none;";
  const VOLL = "position:fixed;inset:0;pointer-events:none;";
  const DISPLAY = "font-family:var(--fh-font-display);";
  const MONO = "font-family:var(--fh-mono);";
  const NEON_BOX = "background:rgba(3,10,5,.94);";

  function textZeile(text, top, groesse, farbe, schatten, anim, extra) {
    return '<p style="' + MITTE + 'top:' + top + ';z-index:10000;' + DISPLAY + 'font-size:' + groesse + ';letter-spacing:.08em;color:' + farbe + ';' +
      (schatten ? 'text-shadow:' + schatten + ';' : '') + 'animation:' + anim + ';' + (extra || '') + '">' + text + '</p>';
  }

  function countdown() {
    const z = function (ziffer, d) {
      return '<span style="grid-area:1 / 1;' + DISPLAY + 'font-size:clamp(120px, 22vw, 240px);font-weight:500;line-height:1;color:var(--fh-gold-bright);text-shadow:0 0 60px rgba(240,201,106,.55);opacity:0;animation:fhStZahl .9s cubic-bezier(.22,.9,.32,1) ' + d + 's both;">' + ziffer + '</span>';
    };
    return '<div style="' + VOLL + 'z-index:10000;display:grid;place-items:center;">' + z(3, 0) + z(2, 0.9) + z(1, 1.8) + '</div>';
  }

  /* Belohnungs-Karte (Sturm, Geisterschiff, Sturmflut) */
  function karte(top, farbeRand, glow, iconFarbe, iconRand, icon, etikettFarbe, etikett, text, iconAnim, schweben) {
    return '<div style="position:fixed;left:0;right:0;top:' + top + ';z-index:10000;display:flex;justify-content:center;padding:0 16px;pointer-events:none;">' +
      '<div style="animation:fhStZoomRein .45s cubic-bezier(.22,.9,.32,1) both;">' +
        '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;border:1px solid ' + farbeRand + ';border-radius:var(--fh-radius);background:rgba(8,14,24,.92);box-shadow:0 0 40px ' + glow + ', var(--fh-shadow);' + (schweben ? 'animation:fhStSchweben 2.2s ease-in-out infinite;' : '') + '">' +
          '<span style="display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:50%;border:1.5px ' + iconRand + ' ' + iconFarbe + ';color:' + iconFarbe + ';' + (iconAnim ? 'animation:' + iconAnim + ';' : '') + '">' + svg(icon, '16px') + '</span>' +
          '<div><p style="margin:0 0 2px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + etikettFarbe + ';">' + etikett + '</p>' +
          '<p style="margin:0;font-size:15px;color:var(--fh-fg);">' + text + '</p></div>' +
        '</div>' +
      '</div></div>';
  }

  /* Konsolenzeile mit Tipp-Effekt */
  function tippZeile(prompt, text, breite, dauer, schritte, start, nachher) {
    return '<div style="display:flex;gap:10px;align-items:baseline;"><span style="color:' + prompt + ';">&gt;</span>' +
      '<span style="--w:' + breite + 'ch;display:inline-block;max-width:0;overflow:hidden;white-space:nowrap;animation:fhStTippen ' + dauer + 's steps(' + schritte + ',end) ' + start + 's forwards;">' + text + '</span>' + (nachher || '') + '</div>';
  }
  function okNach(s, farbe, text) {
    return '<span style="opacity:0;color:' + farbe + ';animation:fhStAn 1ms ' + s + 's forwards;">' + text + '</span>';
  }

  /* Chat-Blase im Bordfunk (Hacked, Szene 4) */
  function funk(wer, text, start, weg) {
    const fremd = wer === "?";
    const kopf = fremd
      ? '<span style="display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:50%;border:1px solid var(--fh-neon);background:#0c2410;' + MONO + 'font-size:14px;color:var(--fh-neon);">?</span>'
      : '<span style="display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:50%;border:1px solid var(--fh-gold);background:var(--fh-surface-light);' + DISPLAY + 'font-size:14px;color:var(--fh-gold-bright);">D</span>';
    const punkte = function (farbe) {
      return '<i style="width:6px;height:6px;border-radius:50%;background:' + farbe + ';animation:fhStTippDots 1s infinite;"></i>' +
        '<i style="width:6px;height:6px;border-radius:50%;background:' + farbe + ';animation:fhStTippDots 1s .15s infinite;"></i>' +
        '<i style="width:6px;height:6px;border-radius:50%;background:' + farbe + ';animation:fhStTippDots 1s .3s infinite;"></i>';
    };
    const leer = wer === "";
    const blase = fremd || leer
      ? '<div style="display:grid;"><span style="grid-area:1 / 1;justify-self:start;align-self:end;display:flex;gap:4px;padding:10px 12px;border-radius:12px 12px 12px 4px;background:rgba(57,255,20,.1);animation:fhStAus 1ms ' + weg + 's forwards;">' + punkte('var(--fh-neon)') + '</span>' +
        '<span style="grid-area:1 / 1;padding:8px 12px;border-radius:12px 12px 12px 4px;border:1px solid rgba(57,255,20,.35);background:rgba(57,255,20,.08);opacity:0;animation:fhStAn 1ms ' + weg + 's forwards;">' +
        (leer ? '' : '<span style="display:block;' + MONO + 'font-size:11px;color:var(--fh-neon);">' + T("unknown", "unbekannt") + '</span>') +
        '<span style="' + MONO + 'font-size:14px;color:var(--fh-fg);">' + text + '</span></span></div>'
      : '<div style="display:grid;justify-items:end;"><span style="grid-area:1 / 1;align-self:end;display:flex;gap:4px;padding:10px 12px;border-radius:12px 12px 4px 12px;background:rgba(240,201,106,.1);animation:fhStAus 1ms ' + weg + 's forwards;">' + punkte('var(--fh-gold-bright)') + '</span>' +
        '<span style="grid-area:1 / 1;padding:8px 12px;border-radius:12px 12px 4px 12px;border:1px solid rgba(214,168,79,.45);background:rgba(240,201,106,.08);text-align:right;opacity:0;animation:fhStAn 1ms ' + weg + 's forwards;">' +
        '<span style="display:block;font-size:11px;font-weight:600;color:var(--fh-gold-bright);">' + T("dave", "Schifffahrer Dave") + '</span>' +
        '<span style="font-size:14px;color:var(--fh-fg);">' + text + '</span></span></div>';
    return '<div style="display:flex;' + (fremd || leer ? '' : 'flex-direction:row-reverse;') + 'gap:10px;align-items:flex-end;max-height:0;opacity:0;overflow:hidden;animation:fhStZeile .35s cubic-bezier(.22,.9,.32,1) ' + start + 's forwards;">' +
      (leer ? '<span style="width:32px;flex-shrink:0;"></span>' : kopf) + blase + '</div>';
  }

  /* Zufall mit fester Saat - der Code-Regen sieht bei jedem gleich aus. */
  function zufallsZeichen(n, saat) {
    const z = "ABCDEF0123456789#$%&@XYZ<>/"; let s = ""; let x = saat;
    for (let i = 0; i < n; i++) { x = (x * 16807) % 2147483647; s += z[x % z.length]; }
    return s;
  }

  function codeRegen() {
    let spalten = "";
    for (let i = 0; i < 22; i++) {
      const zeichen = Array.from(zufallsZeichen(26, 97 + i * 13)).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join("");
      spalten += '<span style="position:absolute;top:0;left:' + (i * 4.6 + 1).toFixed(1) + '%;display:flex;flex-direction:column;' + MONO + 'font-size:14px;line-height:1.25;color:var(--fh-neon);opacity:' + (0.18 + (i % 4) * 0.08).toFixed(2) + ';text-shadow:0 0 6px rgba(57,255,20,.6);animation:fhStCodeRegen ' + (2.2 + (i % 5) * 0.5) + 's linear ' + (-(i % 7) * 0.4).toFixed(1) + 's infinite;">' + zeichen + '</span>';
    }
    return '<div style="' + VOLL + 'z-index:9999;overflow:hidden;">' + spalten + '</div>';
  }

  function entschluesseln() {
    const wort = "FIREHELMET";
    return '<span style="display:inline-flex;gap:.08em;">' + Array.from(wort).map(function (ch, i) {
      const zeichen = Array.from(zufallsZeichen(9, 31 + i * 7)).concat([ch]);
      return '<span style="display:inline-block;height:1.1em;line-height:1.1em;overflow:hidden;"><span style="display:flex;flex-direction:column;animation:fhStEntschl ' + (0.6 + i * 0.17).toFixed(2) + 's steps(9,end) .5s both;">' +
        zeichen.map(function (c, j) { return '<span style="height:1.1em;color:' + (j === 9 ? 'var(--fh-success)' : 'var(--fh-neon)') + ';">' + esc(c) + '</span>'; }).join("") +
        '</span></span>';
    }).join("") + '</span>';
  }

  const EBENEN = [
    /* ================= HACKED ================= */
    [function () { return "hackScan" + (sz("hacked") === 6 ? "W" : ""); }, function () { const h = sz("hacked"); return h >= 1 && h <= 6; }, function () {
      const h = sz("hacked");
      return aus('<div style="' + VOLL + 'z-index:9997;background:repeating-linear-gradient(0deg, rgba(57,255,20,.07) 0 1px, transparent 1px 4px), radial-gradient(90% 70% at 50% 50%, rgba(57,255,20,.10), rgba(0,0,0,.4));animation:' +
        (h === 6 ? 'fhStScan .5s linear infinite, fhStWisch 1.6s 1.1s cubic-bezier(.7,0,.3,1) forwards' : h === 1 ? 'fhStScan .5s linear infinite, fhStEinblenden .3s both' : 'fhStScan .5s linear infinite') + ';"></div>');
    }],
    ["hack1", function () { return sz("hacked") === 1; }, function () {
      const balken = function (top, h, farbe, dauer, d) { return '<div style="position:absolute;left:0;right:0;top:' + top + ';height:' + h + ';background:' + farbe + ';opacity:0;animation:fhStGlitchBalken ' + dauer + 's steps(1,end) ' + d + 's infinite;"></div>'; };
      return aus('<div style="' + VOLL + 'z-index:9999;mix-blend-mode:screen;">' + balken('18%', '3px', 'rgba(57,255,20,.6)', .9, 0) + balken('41%', '16px', 'rgba(229,57,53,.4)', .7, .2) + balken('63%', '6px', 'rgba(66,184,255,.45)', .8, .1) + balken('80%', '26px', 'rgba(57,255,20,.22)', 1, .35) + '</div>');
    }],
    ["hack2", function () { return sz("hacked") === 2; }, function () {
      const g = 'rgba(57,255,20,.5)';
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="width:min(580px, 100%);border:1px solid rgba(57,255,20,.4);border-radius:10px;background:rgba(3,10,5,.92);box-shadow:0 0 0 1px rgba(0,0,0,.6), 0 0 60px rgba(57,255,20,.18), var(--fh-shadow);' + MONO + 'color:var(--fh-neon);animation:fhStZoomRein .35s cubic-bezier(.22,.9,.32,1) both;">' +
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(57,255,20,.2);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(57,255,20,.65);">' + svg(IC.terminal, '16px') + '<span>???@fh-hauptdeck</span><span style="margin-left:auto;padding:2px 8px;border:1px solid rgba(229,57,53,.6);border-radius:4px;color:var(--fh-danger);">' + T("hack.intruder", "Eindringling") + '</span></div>' +
          '<div style="display:flex;flex-direction:column;gap:9px;padding:16px 16px 18px;font-size:14px;line-height:1.4;">' +
            tippZeile(g, T("hack.t1", "verbinde mit fh-hauptdeck …"), 28, .6, 27, .25, okNach(.9, 'var(--fh-success)', 'ok')) +
            tippZeile(g, T("hack.t2", "umgehe schiffs-firewall …"), 26, .6, 25, 1, okNach(1.65, 'var(--fh-success)', 'ok')) +
            tippZeile(g, T("hack.t3", "kapitän ändii: zugang"), 22, .5, 21, 1.8, okNach(2.35, 'var(--fh-danger)', T("hack.locked", "GESPERRT"))) +
            tippZeile(g, T("hack.t4", "öffne dublonen-tresor"), 22, .5, 21, 2.6, '<span style="flex:1;height:8px;border:1px solid rgba(57,255,20,.4);border-radius:2px;overflow:hidden;opacity:0;animation:fhStAn 1ms 3.1s forwards;"><span style="display:block;height:100%;width:0;background:var(--fh-neon);box-shadow:0 0 10px var(--fh-neon);animation:fhStFuellen 1.1s steps(9,end) 3.15s forwards;"></span></span>') +
            tippZeile(g, T("hack.t5", "übernehme sternbild …"), 22, .5, 21, 4.1, '<span style="opacity:0;animation:fhStAn 1ms 4.6s forwards;"><span style="animation:fhStCursor 1s steps(1,end) infinite;">_</span></span>') +
          '</div></div></div>');
    }],
    ["codeRegen", function () { return sz("hacked") === 3 || sz("ende") === 2; }, function () { return aus(codeRegen()); }],
    ["hack3", function () { return sz("hacked") === 3; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
        '<span style="display:block;color:var(--fh-neon);filter:drop-shadow(0 0 18px rgba(57,255,20,.6));animation:fhStZoomRein .5s cubic-bezier(.22,.9,.32,1) both, fhStHackFlackern .16s steps(1) .5s 6;">' + svg(IC.skull, 'clamp(64px, 10vw, 96px)') + '</span>' +
        '<p style="margin:16px 0 0;' + MONO + 'font-size:clamp(44px, 9vw, 104px);font-weight:700;line-height:1;letter-spacing:.16em;color:var(--fh-neon);animation:fhStZoomRein .5s .1s cubic-bezier(.22,.9,.32,1) both, fhStGlitchText 1.1s steps(1,end) .6s infinite;">' + T("hack.captured", "GEKAPERT") + '</p>' +
        '<p style="margin:14px 0 0;' + MONO + 'font-size:15px;color:rgba(57,255,20,.8);animation:fhStHoch .5s .5s both;">' + T("hack.owned", "Das Bordnetz gehört jetzt") + ' <span style="padding:1px 6px;border:1px solid rgba(57,255,20,.5);border-radius:4px;color:var(--fh-neon);">' + T("hack.someone", "einem Unbekannten") + '</span></p>' +
        '<div style="width:min(420px, 80vw);margin-top:26px;animation:fhStHoch .5s .8s both;">' +
          '<div style="display:flex;justify-content:space-between;' + MONO + 'font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(57,255,20,.7);"><span>' + T("hack.vault", "Dublonen-Tresor") + '</span><span>' + T("hack.access", "Zugriff") + '</span></div>' +
          '<div style="height:6px;margin-top:8px;border:1px solid rgba(57,255,20,.45);border-radius:3px;overflow:hidden;"><div style="height:100%;width:12%;background:var(--fh-neon);box-shadow:0 0 12px var(--fh-neon);animation:fhStTresor 2.4s 1s cubic-bezier(.4,0,.7,.2) forwards;"></div></div>' +
        '</div></div>');
    }],
    ["hack4", function () { return sz("hacked") === 4; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="width:min(580px, 100%);border:1px solid rgba(57,255,20,.4);border-radius:12px;' + NEON_BOX + 'box-shadow:0 0 60px rgba(57,255,20,.16), var(--fh-shadow);animation:fhStZoomRein .35s cubic-bezier(.22,.9,.32,1) both;">' +
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(57,255,20,.2);' + MONO + 'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(57,255,20,.7);">' + svg(IC.terminal, '16px') + '<span>#' + T("hack.radio", "bordfunk") + '</span><span style="color:var(--fh-muted-fg);">· ' + T("hack.tapped", "abgehört") + '</span><span style="margin-left:auto;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--fh-neon);animation:fhStLivePunkt 1.2s infinite;"></span>' + T("hack.aboard", "2 an Bord") + '</span></div>' +
          '<div style="display:flex;flex-direction:column;padding:4px 16px 16px;">' +
            funk("?", T("hack.c1", "ahoi dave. dein bordnetz gehört jetzt mir."), .3, 1.1) +
            funk("D", T("hack.c2", "Wer bist du?! Runter von meinem Schiff!"), 2.2, 2.8) +
            funk("?", T("hack.c3", "niemand, den du kennst. noch nicht."), 3.6, 4.5) +
            funk("D", T("hack.c4", "Zeig dich, du feige Landratte!"), 5.6, 6.1) +
            funk("?", T("hack.c5", "nur wenn die crew mein passwort knackt."), 6.9, 7.7) +
            funk("", T("hack.c6", "tipp: es ist der name dieses schiffs. ihr habt drei sekunden."), 8.4, 9) +
          '</div></div></div>');
    }],
    ["hack5", function () { return sz("hacked") === 5; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:min(520px, 100%);padding:22px 20px;border:1px solid rgba(57,255,20,.45);border-radius:12px;' + NEON_BOX + 'box-shadow:0 0 60px rgba(57,255,20,.18), var(--fh-shadow);text-align:center;animation:fhStZoomRein .35s cubic-bezier(.22,.9,.32,1) both;">' +
          '<p style="margin:0;' + MONO + 'font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(57,255,20,.7);">' + T("hack.crack", "Crew-Konter · Passwort knacken") + '</p>' +
          '<div style="padding:12px 18px;border:1px solid rgba(57,255,20,.35);border-radius:8px;background:rgba(0,0,0,.35);' + MONO + 'font-size:clamp(26px, 6vw, 38px);font-weight:700;letter-spacing:.06em;text-shadow:0 0 10px rgba(57,255,20,.5);">' + entschluesseln() + '</div>' +
          '<p style="margin:0;' + MONO + 'font-size:13px;color:var(--fh-muted-fg);animation:fhStAus .3s 2.6s forwards;">' + T("hack.trying", "Die Crew probiert Kombinationen …") + '</p>' +
          '<p style="margin:-30px 0 0;' + MONO + 'font-size:18px;letter-spacing:.2em;color:var(--fh-success);text-shadow:0 0 16px rgba(85,200,120,.6);opacity:0;animation:fhStZoomRein .4s 2.7s cubic-bezier(.22,.9,.32,1) both;">' + T("hack.granted", "ZUGANG ERLANGT") + '</p>' +
        '</div></div>');
    }],
    ["hack6", function () { return sz("hacked") === 6; }, function () {
      const g = 'var(--fh-gold)';
      return aus('<div style="' + VOLL + 'z-index:10000;">' +
        '<div style="position:fixed;top:0;bottom:0;left:0;z-index:9998;width:2px;background:var(--fh-gold-bright);box-shadow:0 0 24px 6px rgba(240,201,106,.55);opacity:0;animation:fhStWischLinie 1.6s 1.1s cubic-bezier(.7,0,.3,1) both;"></div>' +
        '<div style="' + VOLL + 'display:flex;align-items:center;justify-content:center;padding:24px;">' +
          '<div style="width:min(580px, 100%);border:1px solid rgba(214,168,79,.6);border-radius:10px;background:rgba(8,10,16,.94);box-shadow:var(--fh-glow-gold), var(--fh-shadow);' + MONO + 'color:var(--fh-gold-bright);animation:fhStZoomRein .4s cubic-bezier(.22,.9,.32,1) both;">' +
            '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(214,168,79,.25);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--fh-gold);">' + svg(IC.shield, '16px') + '<span>' + T("hack.bridge", "kapitänsbrücke · gegenwehr") + '</span></div>' +
            '<div style="display:flex;flex-direction:column;gap:9px;padding:16px 16px 18px;font-size:14px;line-height:1.4;">' +
              tippZeile(g, T("hack.d1", "schifffahrer dave: nicht auf meinem schiff."), 44, .9, 43, .2) +
              tippZeile(g, T("hack.d2", "firewall neu gezogen …"), 23, .5, 22, 1.25, okNach(1.8, 'var(--fh-success)', 'ok')) +
              tippZeile(g, T("hack.d3", "kraken ausgesperrt. deck gesichert."), 36, .8, 35, 2.1) +
            '</div></div></div></div>');
    }],
    ["hack7", function () { return sz("hacked") === 7; }, function () {
      const blase = function (inhalt, d, rot) {
        return '<div style="display:flex;gap:10px;align-items:flex-end;animation:fhStHoch .4s ' + d + 's both;"><span style="width:36px;flex-shrink:0;"></span><span style="padding:10px 14px;border-radius:12px 12px 12px 4px;border:1px solid ' + (rot ? 'rgba(229,57,53,.55)' : 'rgba(57,255,20,.4)') + ';' + NEON_BOX + 'box-shadow:var(--fh-shadow-sm);">' + inhalt + '</span></div>';
      };
      const m = MONO + 'font-size:14px;';
      return aus('<div style="position:fixed;left:0;right:0;top:28%;z-index:10000;display:flex;justify-content:center;padding:0 16px;pointer-events:none;animation:fhStAus .6s 4.5s forwards;"><div style="display:flex;flex-direction:column;gap:8px;width:min(480px, 100%);">' +
        '<div style="display:flex;gap:10px;align-items:flex-end;animation:fhStHoch .4s .2s both;"><span style="display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border-radius:50%;border:1px solid var(--fh-neon);background:#0c2410;' + MONO + 'font-size:15px;color:var(--fh-neon);box-shadow:0 0 14px rgba(57,255,20,.4);">?</span>' +
          '<span style="padding:10px 14px;border-radius:12px 12px 12px 4px;border:1px solid rgba(57,255,20,.4);' + NEON_BOX + 'box-shadow:var(--fh-shadow-sm);"><span style="display:block;' + MONO + 'font-size:11px;color:var(--fh-neon);">' + T("unknown", "unbekannt") + '</span><span style="' + m + 'color:var(--fh-fg);">' + T("hack.e1", "nicht schlecht, crew. diesmal habt ihr gewonnen.") + '</span></span></div>' +
        blase('<span style="' + m + 'color:var(--fh-fg);">' + T("hack.e2", "ich komme wieder. bis dahin – ein titel für jeden an deck:") + '</span> <span style="' + m + 'color:var(--fh-neon);text-shadow:0 0 6px rgba(57,255,20,.7);">Firewall-Pirat_</span>', 1.3) +
        blase('<span style="' + m + 'color:var(--fh-fg);">' + T("hack.e3a", "ach ja – ich hab euch ein paar") + ' </span><span style="' + m + 'color:var(--fh-danger);">' + T("hack.e3b", "hintertüren") + '</span><span style="' + m + 'color:var(--fh-fg);"> ' + T("hack.e3c", "dagelassen.") + '</span>', 2.6, true) +
        '</div></div>');
    }],

    /* ================= SYSTEMAUSFALL ================= */
    ["ende1", function () { return sz("ende") === 1; }, function () {
      return aus('<div style="' + VOLL + 'z-index:9998;">' +
        '<div style="' + VOLL + 'background:radial-gradient(70% 60% at 50% 50%, transparent 30%, rgba(229,57,53,.55));animation:fhStAlarm .8s ease-in-out infinite;"></div>' +
        '<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
          '<p style="margin:0;' + MONO + 'font-size:clamp(40px, 8vw, 92px);font-weight:700;letter-spacing:.2em;color:var(--fh-danger);text-shadow:0 0 30px rgba(229,57,53,.7);animation:fhStZoomRein .4s both, fhStHackFlackern .4s steps(1) .4s infinite;">' + T("end.warning", "WARNUNG") + '</p>' +
          '<p style="margin:12px 0 0;' + MONO + 'font-size:15px;color:var(--fh-fg);animation:fhStHoch .5s .4s both;">' + T("end.access", "Unbekannter Zugriff auf alle Systeme") + '</p>' +
        '</div></div>');
    }],
    ["ende2", function () { return sz("ende") === 2; }, function () {
      const zeile = function (was, status, d) { return '<span style="display:flex;justify-content:space-between;opacity:0;animation:fhStAn 1ms ' + d + 's forwards;"><span>' + was + '</span><span style="color:var(--fh-danger);">' + status + '</span></span>'; };
      const ueber = T("end.taken", "übernommen");
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="width:min(520px, 100%);padding:18px;border:1px solid rgba(57,255,20,.45);border-radius:12px;background:rgba(3,10,5,.94);box-shadow:0 0 60px rgba(57,255,20,.2);' + MONO + 'font-size:14px;color:var(--fh-neon);animation:fhStZoomRein .35s both;">' +
          '<p style="margin:0 0 12px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(57,255,20,.7);">??? · ' + T("end.takeAll", "übernehme alle systeme") + '</p>' +
          '<div style="display:flex;flex-direction:column;gap:6px;">' +
            zeile(T("end.s1", "schatzrad"), ueber, .3) + zeile(T("end.s2", "spielothek"), ueber, .9) + zeile(T("end.s3", "schwarzmarkt"), ueber, 1.5) +
            zeile(T("end.s4", "skill-baum"), ueber, 2.1) + zeile(T("end.s5", "live-event"), T("end.ending", "wird beendet …"), 2.7) +
          '</div>' +
          '<div style="height:6px;margin-top:14px;border:1px solid rgba(57,255,20,.45);border-radius:3px;overflow:hidden;"><div style="height:100%;width:0;background:var(--fh-neon);box-shadow:0 0 10px var(--fh-neon);animation:fhStFuellen 3.3s steps(20,end) .2s forwards;"></div></div>' +
        '</div></div>');
    }],
    ["ende3", function () { return sz("ende") === 3; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10004;display:flex;align-items:center;justify-content:center;background:var(--fh-bg);">' +
        '<div style="position:absolute;inset:0;background:#dfe9e0;animation:fhStCrtAus .55s cubic-bezier(.7,0,.3,1) forwards;"></div>' +
        '<p style="position:relative;margin:0;padding:0 24px;text-align:center;' + MONO + 'font-size:clamp(30px, 6vw, 72px);font-weight:700;letter-spacing:.14em;color:var(--fh-danger);opacity:0;animation:fhStAn 1ms .8s forwards, fhStGlitchText 1s steps(1,end) .8s infinite;">' + T("end.over", "LIVE-EVENT BEENDET") + '</p>' +
      '</div>');
    }],
    ["ende4", function () { return sz("ende") === 4; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10004;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:repeating-linear-gradient(0deg, rgba(232,237,244,.05) 0 1px, transparent 1px 2px), repeating-linear-gradient(90deg, rgba(232,237,244,.04) 0 1px, transparent 1px 3px), var(--fh-bg);animation:fhStRauschen .12s steps(2) infinite;text-align:center;">' +
        '<p style="margin:0;' + MONO + 'font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--fh-muted-fg);animation:fhStHackFlackern .6s steps(1) infinite;">' + T("end.signal", "Signal verloren") + '</p>' +
        '<p style="margin:0;' + MONO + 'font-size:18px;color:var(--fh-neon);animation:fhStHoch .5s 1s both;">' + T("end.bye", "???: bis zum nächsten mal, crew.") + '</p>' +
      '</div>');
    }],
    /* Nach dem Systemausfall: bleibt, bis die naechste Story startet. */
    ["gehackt", function () { return gehackt && !lauf; }, function () {
      const lauf1 = T("end.ticker", "System kompromittiert · live-event beendet von ??? · alle stationen offline · widerstand ist zwecklos ·");
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9990;background:repeating-linear-gradient(0deg, rgba(57,255,20,.06) 0 1px, transparent 1px 3px), radial-gradient(80% 70% at 50% 50%, transparent 40%, rgba(2,8,3,.7));animation:fhStScan .6s linear infinite;"></div>' +
        '<div style="' + VOLL + 'z-index:9991;mix-blend-mode:screen;">' +
          '<div style="position:absolute;left:0;right:0;top:27%;height:4px;background:rgba(57,255,20,.5);opacity:0;animation:fhStGlitchBalken 5s steps(1,end) infinite;"></div>' +
          '<div style="position:absolute;left:0;right:0;top:61%;height:18px;background:rgba(229,57,53,.3);opacity:0;animation:fhStGlitchBalken 7s steps(1,end) 2s infinite;"></div>' +
        '</div>' +
        '<div class="fh-story-laufband" style="position:fixed;top:0;left:0;right:0;z-index:10001;overflow:hidden;border-bottom:1px solid rgba(229,57,53,.6);background:rgba(20,4,4,.92);' + MONO + 'font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--fh-danger);pointer-events:none;">' +
          '<div style="display:flex;width:max-content;padding:8px 0;animation:fhStLaufband 22s linear infinite;"><span style="padding-right:48px;white-space:nowrap;">' + lauf1 + '</span><span style="padding-right:48px;white-space:nowrap;">' + lauf1 + '</span></div>' +
        '</div>' +
        '<div style="position:fixed;left:16px;bottom:16px;z-index:10001;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border:1px solid rgba(229,57,53,.6);border-radius:999px;background:rgba(20,4,4,.92);' + MONO + 'font-size:12px;color:var(--fh-danger);pointer-events:none;">' +
          '<span style="width:10px;height:10px;margin-left:6px;border-radius:50%;background:var(--fh-danger);box-shadow:0 0 10px var(--fh-danger);animation:fhStLivePunkt 1s steps(1) infinite;"></span>' +
          '<span>' + T("end.badge", "Live-Event beendet · Seite übernommen") + '</span></div>' +
      '</div>');
    }],

    /* ================= SCHATZREGEN ================= */
    ["schatz1", function () { return sz("schatz") === 1; }, function () {
      const muenze = function (inhalt, bg, rand, farbe, wert, wertFarbe, extra) {
        return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><span style="display:grid;place-items:center;width:46px;height:46px;box-sizing:border-box;border-radius:50%;border:2px solid ' + rand + ';background:' + bg + ';color:' + farbe + ';' + DISPLAY + 'font-size:20px;font-weight:600;' + (extra || '') + '">' + inhalt + '</span><span style="font-size:13px;color:' + wertFarbe + ';">' + wert + '</span></div>';
      };
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
        '<p style="margin:0;' + DISPLAY + 'font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:var(--fh-gold-bright);animation:fhStHoch .5s both;">' + T("treasure.kicker", "Live-Event · Mitmachen") + '</p>' +
        '<p style="margin:10px 0 0;' + DISPLAY + 'font-size:clamp(48px, 10vw, 120px);font-weight:500;line-height:1;letter-spacing:.04em;color:var(--fh-gold-bright);text-shadow:0 0 50px rgba(240,201,106,.5);animation:fhStZoomRein .5s .1s cubic-bezier(.22,.9,.32,1) both;">' + T("treasure.title", "SCHATZREGEN") + '</p>' +
        '<p style="margin:14px 0 0;max-width:44ch;font-size:16px;line-height:1.5;color:var(--fh-fg);text-wrap:pretty;animation:fhStHoch .5s .4s both;">' + T("treasure.lead", "Fang so viele Dublonen wie möglich – aber Finger weg von verfluchten Münzen!") + '</p>' +
        '<div style="display:flex;gap:26px;margin-top:22px;animation:fhStHoch .5s .7s both;">' +
          muenze('D', 'radial-gradient(circle at 40% 32%, var(--fh-paper), var(--fh-gold-bright) 40%, var(--fh-gold) 75%, #8a5a1c)', 'var(--fh-gold-bright)', '#3a2408', '+1', 'var(--fh-gold-bright)') +
          muenze('5', 'radial-gradient(circle at 40% 32%, #fffaf0, var(--fh-gold-bright) 35%, var(--fh-gold) 70%, var(--fh-fire-deep))', 'var(--fh-gold-bright)', '#3a2408', '+5 · ' + T("treasure.rare", "selten"), 'var(--fh-gold-bright)', 'box-shadow:0 0 22px var(--fh-gold-bright);') +
          muenze(svg(IC.skull, '18px'), 'radial-gradient(circle at 40% 35%, #b3312c, var(--fh-red-deep) 60%, #2a0a09)', 'var(--fh-danger)', 'var(--fh-paper)', '−3', 'var(--fh-danger)') +
        '</div>' +
        '<p style="margin:18px 0 0;font-size:13px;color:var(--fh-muted-fg);animation:fhStHoch .5s .9s both;">' + T("treasure.reward", "Jede Dublone zählt ×10 · ab 25 zusätzlich +1 Skillpunkt") + '</p>' +
      '</div>');
    }],
    ["schatz2", function () { return sz("schatz") === 2; }, function () { return aus(countdown()); }],
    ["schatz3", function () { return sz("schatz") === 3; }, function () {
      return aus('<div style="position:fixed;top:16px;left:0;right:0;z-index:10003;display:flex;justify-content:center;padding:0 16px;pointer-events:none;">' +
        '<div style="display:flex;align-items:center;gap:18px;padding:10px 18px;border:1px solid rgba(214,168,79,.5);border-radius:var(--fh-radius);background:rgba(8,10,16,.9);box-shadow:var(--fh-glow-gold), var(--fh-shadow-sm);animation:fhStHoch .4s both;">' +
          '<div style="display:flex;align-items:baseline;gap:10px;"><strong id="fh-schatz-punkte" style="display:inline-block;' + DISPLAY + 'font-size:56px;font-weight:500;line-height:1;color:var(--fh-gold-bright);text-shadow:var(--fh-glow-gold);font-variant-numeric:tabular-nums;">0</strong><span style="font-size:13px;color:var(--fh-muted-fg);">' + T("treasure.coins", "Dublonen") + '</span></div>' +
          '<span style="width:1px;align-self:stretch;background:linear-gradient(180deg, transparent, var(--fh-border-strong), transparent);"></span>' +
          '<div style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--fh-muted-fg);"><span id="fh-schatz-zeit" style="' + MONO + 'font-size:18px;color:var(--fh-fg);">15 s</span><span>' + T("treasure.left", "übrig") + '</span></div>' +
          '<span id="fh-schatz-combo" hidden style="padding:4px 10px;border:1px solid var(--fh-gold-bright);border-radius:999px;font-size:12px;font-weight:600;color:var(--fh-gold-bright);"></span>' +
        '</div></div>');
    }],
    ["schatz4", function () { return sz("schatz") === 4; }, function () {
      const pk = schatz ? schatz.punkte : 0;
      const rang = pk >= 40 ? T("treasure.r4", "Schatzmeister") : pk >= 25 ? T("treasure.r3", "Goldgräber") : pk >= 10 ? T("treasure.r2", "Leichtmatrose") : T("treasure.r1", "Deckschrubber");
      const dub = Math.min(60, pk) * 10;
      const beloh = pk > 0
        ? T("treasure.rewardGot", "Deine Beute:") + ' +' + dub + ' ' + T("treasure.coins", "Dublonen") + (pk >= 25 ? ' · +1 ' + T("skillpoint", "Skillpunkt") : '')
        : T("treasure.rewardNone", "Diesmal keine Beute – beim nächsten Regen!");
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:min(420px, 100%);padding:24px 22px;border:1px solid rgba(214,168,79,.6);border-radius:var(--fh-radius-lg);background:rgba(8,10,16,.94);box-shadow:var(--fh-glow-gold), var(--fh-shadow);text-align:center;animation:fhStZoomRein .45s cubic-bezier(.22,.9,.32,1) both;">' +
          '<p style="margin:0;' + DISPLAY + 'font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:var(--fh-gold-bright);">' + T("treasure.loot", "Deine Beute") + '</p>' +
          '<p style="margin:0;' + DISPLAY + 'font-size:72px;font-weight:500;line-height:1;color:var(--fh-gold-bright);text-shadow:var(--fh-glow-gold);">' + pk + '</p>' +
          '<p style="margin:0;' + DISPLAY + 'font-size:21px;font-weight:500;letter-spacing:.04em;color:var(--fh-fg);">' + rang + '</p>' +
          '<p style="margin:0;font-size:13px;color:var(--fh-muted-fg);">' + (schatz ? schatz.gefangen : 0) + ' ' + T("treasure.caught", "gefangen") + ' · ' + (schatz ? schatz.verpasst : 0) + ' ' + T("treasure.missed", "verpasst") + '</p>' +
          '<p style="margin:0;font-size:14px;color:' + (pk > 0 ? 'var(--fh-success)' : 'var(--fh-muted-fg)') + ';">' + beloh + '</p>' +
        '</div></div>');
    }],

    /* ================= DISCO ================= */
    ["discoDunkel", function () { const d = sz("disco"); return d === 1 || d === 2; }, function () {
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9996;background:radial-gradient(circle at 50% 46%, transparent 0 80px, rgba(5,7,11,.95) 240px);animation:fhStEinblenden .25s steps(2) both;"></div>' +
        textZeile(T("disco.dark", "Wer hat das Licht ausgemacht?"), '20%', 'clamp(18px, 2.6vw, 28px)', 'var(--fh-muted-fg)', '', 'fhStHoch .6s .3s both', 'letter-spacing:.06em;') +
      '</div>');
    }],
    ["disco2", function () { return sz("disco") === 2; }, function () { return aus(countdown()); }],
    ["disco3", function () { return sz("disco") === 3; }, function () {
      const worte = t("story.disco.party", "PARTY AN DECK");
      let i = 0;
      const buchstaben = Array.from(worte).map(function (ch) {
        if (ch === " ") return '<span style="display:inline-block;width:.35em;"></span>';
        const d = (i++ * 0.05).toFixed(2);
        return '<span style="display:inline-block;animation:fhStHuepf .5s cubic-bezier(.22,.9,.32,1) ' + d + 's infinite;">' + esc(ch) + '</span>';
      }).join("");
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;animation:fhStZoomRein .45s cubic-bezier(.22,.9,.32,1) both;">' +
        '<p style="display:flex;flex-wrap:wrap;justify-content:center;margin:0;' + DISPLAY + 'font-size:clamp(48px, 10vw, 120px);font-weight:500;line-height:1.05;letter-spacing:.04em;color:var(--fh-gold-bright);text-shadow:0 0 40px rgba(240,201,106,.5);">' + buchstaben + '</p>' +
        '<p style="margin:16px 0 0;font-size:16px;color:var(--fh-fg);animation:fhStHoch .5s .4s both;">' + T("disco.lead", "Ändii legt auf – alle an Deck!") + '</p>' +
      '</div>');
    }],
    ["discoLicht", function () { const d = sz("disco"); return d === 3 || d === 4; }, function () {
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9996;background:radial-gradient(70% 60% at 50% 50%, rgba(240,201,106,.16), transparent 70%);animation:fhStBeat .5s ease-out infinite;"></div>' +
        '<div style="' + VOLL + 'z-index:9996;mix-blend-mode:screen;animation:fhStDiscoLicht 2.4s steps(1) infinite;"></div>' +
        '<div style="' + VOLL + 'z-index:9996;overflow:hidden;mix-blend-mode:screen;">' +
          '<div style="position:absolute;left:50%;top:0;width:220vmax;height:220vmax;background:repeating-conic-gradient(from 0deg, rgba(240,201,106,.16) 0deg 5deg, transparent 5deg 24deg);animation:fhStKegel 9s linear infinite;"></div>' +
          '<div style="position:absolute;left:20%;top:0;width:200vmax;height:200vmax;background:repeating-conic-gradient(from 10deg, rgba(66,184,255,.12) 0deg 4deg, transparent 4deg 30deg);animation:fhStKegel 13s linear infinite reverse;"></div>' +
        '</div></div>');
    }],

    /* ================= WERBUNGSFLUT / GEGENHACK (31) ================= */
    ["wb-intro", function () { return sz("werbung") === 1; }, function () {
      return aus(textZeile(esc(t("werbung.intro", "??? hat Werbung gebucht.")), '38%', 'clamp(22px, 4vw, 44px)', 'var(--fh-neon)', null, 'fhStHoch .5s both, fhStGlitchText 1.4s steps(1, end) .5s infinite', MONO + 'text-transform:uppercase;'));
    }],
    /* Niederlage: der Grund bleibt, bis die Flut vorbei ist. */
    ["gh-grund", function () { const n = sz("gegenhack_niederlage"); return n === 1 || n === 2; }, function () {
      return aus('<div style="' + VOLL + 'z-index:9990;background:repeating-linear-gradient(0deg, rgba(57,255,20,.06) 0 1px, transparent 1px 3px), radial-gradient(90% 80% at 50% 45%, #2a0707, #030604 70%);animation:fhStEinblenden .4s both;"></div>');
    }],
    /* ??? zeigt sich - das ASCII-Gesicht aus dem Entwurf. */
    ["gh-gesicht", function () { return sz("gegenhack_niederlage") === 1; }, function () {
      const gesicht = [
        "        ▄▄████████▄▄        ",
        "      ▄██████████████▄      ",
        "     ████▀▀      ▀▀████     ",
        "    ███▀  ▄▄    ▄▄  ▀███    ",
        "    ██   ████  ████   ██    ",
        "    ██   ▀██▀  ▀██▀   ██    ",
        "    ██       ▄▄       ██    ",
        "    ███     ▀▀▀▀     ███    ",
        "     ███  ▀▄▄▄▄▄▄▀  ███     ",
        "      ▀███▄      ▄███▀      ",
        "        ▀▀████████▀▀        ",
      ].join("\n");
      const zeile = function (key, de, d, schritte, farbe) {
        return '<span style="display:block;margin:0 auto;max-width:0;overflow:hidden;white-space:nowrap;color:' + farbe + ';animation:fhGhTippZeile .6s ' + d + 's steps(' + schritte + ', end) both;">' + esc(t(key, de)) + '</span>';
      };
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;' + MONO + 'color:var(--fh-fg);animation:fhGhFinaleGlitch 1.2s steps(1, end);">' +
        '<div style="animation:fhGhFaceRein .9s 1.1s cubic-bezier(.22,1.2,.36,1) both, fhGhFaceZurueck .8s 4s ease forwards;">' +
          '<pre style="margin:0;font-family:inherit;font-size:clamp(11px, 2.4vw, 22px);line-height:1.02;color:var(--fh-neon);animation:fhStGlitchText 1.4s steps(1, end) infinite;">' + gesicht + '</pre>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-top:26px;font-size:clamp(16px, 3vw, 26px);letter-spacing:.08em;text-transform:uppercase;">' +
          zeile("werbung.face1", "Hallo, Crew.", 2, 12, "var(--fh-fg)") +
          zeile("werbung.face2", "Ihr wart zu langsam.", 2.9, 20, "var(--fh-fg)") +
          zeile("werbung.face3", "Zeit für Werbung.", 3.7, 18, "var(--fh-danger)") +
        '</div>' +
      '</div>');
    }],

    /* ================= STURM ================= */
    [function () { return "regen" + (sz("sturm") === 1 ? "A" : sz("sturm") === 5 ? "Z" : ""); }, function () { return sz("sturm") >= 1; }, function () {
      const s = sz("sturm");
      return aus('<div style="' + VOLL + 'z-index:9997;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%, rgba(42,74,114,.5), rgba(5,7,11,.55));' + (s === 1 ? 'animation:fhStEinblenden 1.2s both;' : s === 5 ? 'animation:fhStAus 2.4s ease forwards;' : '') + '">' +
        '<div style="position:absolute;inset:0;background-image:repeating-linear-gradient(105deg, transparent 0 26px, rgba(200,222,245,.16) 26px 27px, transparent 27px 60px);background-size:220px 220px;animation:fhStRegen .45s linear infinite;"></div>' +
        '<div style="position:absolute;inset:0;opacity:.6;background-image:repeating-linear-gradient(102deg, transparent 0 40px, rgba(200,222,245,.12) 40px 41px, transparent 41px 90px);background-size:300px 300px;animation:fhStRegen .8s linear infinite;"></div>' +
      '</div>');
    }],
    /* Nachwirkung: nach dem Sturm regnet es leise weiter - ohne die
       Abdunklung, damit die Seite benutzbar bleibt. */
    ["nachregen", function () { return nachregen && !lauf; }, function () {
      return aus('<div style="' + VOLL + 'z-index:9997;overflow:hidden;opacity:.55;animation:fhStEinblenden 2.4s both;">' +
        '<div style="position:absolute;inset:0;background-image:repeating-linear-gradient(105deg, transparent 0 26px, rgba(200,222,245,.14) 26px 27px, transparent 27px 60px);background-size:220px 220px;animation:fhStRegen .6s linear infinite;"></div>' +
        '<div style="position:absolute;inset:0;opacity:.6;background-image:repeating-linear-gradient(102deg, transparent 0 40px, rgba(200,222,245,.1) 40px 41px, transparent 41px 90px);background-size:300px 300px;animation:fhStRegen 1s linear infinite;"></div>' +
      '</div>');
    }],
    ["sturm1", function () { return sz("sturm") === 1; }, function () {
      return aus(textZeile(T("storm.t1", "Ein Sturm zieht auf …"), '20%', 'clamp(20px, 3vw, 34px)', 'var(--fh-fg)', '0 0 30px rgba(66,184,255,.45)', 'fhStHoch .8s .4s both'));
    }],
    ["sturm2", function () { return sz("sturm") === 2; }, function () {
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9998;background:radial-gradient(60% 50% at 72% 8%, rgba(66,184,255,.4), transparent 70%);opacity:0;animation:fhStFerneBlitz 2.4s both;"></div>' +
        textZeile(T("storm.t2", "Hörst du das Grollen?"), '20%', 'clamp(20px, 3vw, 34px)', 'var(--fh-muted-fg)', '', 'fhStHoch .6s both') +
      '</div>');
    }],
    ["sturm3", function () { return sz("sturm") === 3; }, function () {
      const linie = function (pts, w, d) { return '<polyline points="' + pts + '" fill="none" stroke="#e8edf4" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round" pathLength="1" vector-effect="non-scaling-stroke" style="stroke-dasharray:1;stroke-dashoffset:1;animation:fhStLinieZuenden .22s ease-out ' + d + 's forwards;"/>'; };
      return aus('<div>' +
        '<svg viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true" style="position:fixed;left:50%;top:0;width:min(260px, 40vw);height:78vh;transform:translateX(-50%);z-index:10001;pointer-events:none;filter:drop-shadow(0 0 10px var(--fh-cold)) drop-shadow(0 0 28px var(--fh-cold));animation:fhStBoltAus 1.6s ease-out forwards;">' +
          linie('55,0 38,52 60,58 30,118 54,122 22,200', 3.5, 0) + linie('60,58 80,86 72,104', 1.8, .12) + linie('30,118 12,140', 1.4, .16) +
        '</svg>' +
        '<p style="' + MITTE + 'bottom:18%;z-index:10001;' + DISPLAY + 'font-size:clamp(40px, 8vw, 96px);font-weight:500;letter-spacing:.2em;color:var(--fh-fg);text-shadow:0 0 40px var(--fh-cold), 0 0 80px rgba(66,184,255,.5);animation:fhStZoomRein .4s .15s cubic-bezier(.22,.9,.32,1) both;">' + T("storm.impact", "EINSCHLAG") + '</p>' +
      '</div>');
    }],
    ["sturm4", function () { return sz("sturm") === 4; }, function () {
      return aus(karte('14%', 'var(--fh-cold)', 'rgba(66,184,255,.3)', 'var(--fh-cold)', 'solid', IC.zap, 'var(--fh-cold)', T("storm.charged", "Aufgeladen"), T("storm.card", "Der Blitz hat die Schatzkiste aufgesprengt – +150 Dublonen."), 'fhStHackFlackern .3s steps(1) infinite'));
    }],

    /* ================= GEISTERSCHIFF (NEBEL) ================= */
    [function () { return "nebel" + (sz("nebel") === 1 ? "A" : sz("nebel") === 5 ? "Z" : ""); }, function () { return sz("nebel") >= 1; }, function () {
      const n = sz("nebel");
      return aus('<div style="' + VOLL + 'z-index:9997;overflow:hidden;' + (n === 1 ? 'animation:fhStEinblenden 2s ease both;' : n === 5 ? 'animation:fhStNebelWeg 2.8s ease forwards;' : '') + '">' +
        '<div style="position:absolute;inset:-20%;background:radial-gradient(40% 30% at 20% 60%, rgba(232,237,244,.16), transparent 70%), radial-gradient(35% 25% at 70% 40%, rgba(232,237,244,.12), transparent 70%);filter:blur(30px);animation:fhStNebelDrift 9s ease-in-out infinite alternate;"></div>' +
        '<div style="position:absolute;inset:-20%;background:radial-gradient(45% 30% at 60% 75%, rgba(232,213,168,.12), transparent 70%), radial-gradient(30% 25% at 30% 25%, rgba(232,237,244,.12), transparent 70%);filter:blur(40px);animation:fhStNebelDrift 12s ease-in-out -4s infinite alternate-reverse;"></div>' +
        '<div style="position:absolute;inset:0;background:radial-gradient(70% 60% at 50% 50%, transparent 30%, rgba(5,7,11,.65));"></div>' +
      '</div>');
    }],
    ["nebel2", function () { return sz("nebel") === 2; }, function () {
      return aus(textZeile(T("fog.t2", "Da draußen ist etwas …"), '20%', 'clamp(20px, 3vw, 34px)', 'var(--fh-paper)', '0 0 30px rgba(232,213,168,.4)', 'fhStHoch 1s .2s both'));
    }],
    ["irrlichter", function () { const n = sz("nebel"); return n >= 2 && n <= 4; }, function () {
      let s = "";
      for (let i = 0; i < 6; i++) {
        const g = 14 + (i % 3) * 6;
        s += '<span style="position:absolute;left:' + (8 + i * 16) + '%;top:' + (30 + (i * 23) % 45) + '%;width:' + g + 'px;height:' + g + 'px;border-radius:50%;background:radial-gradient(circle, #fffaf0, rgba(232,213,168,.6) 40%, transparent 70%);box-shadow:0 0 30px 10px rgba(232,213,168,.25);animation:fhStIrrlicht ' + (4 + i * 0.7).toFixed(1) + 's ease-in-out ' + (-i * 0.9).toFixed(1) + 's infinite alternate, fhStGeist 1.6s ease-in-out infinite;"></span>';
      }
      return aus('<div style="' + VOLL + 'z-index:9998;overflow:hidden;">' + s + '</div>');
    }],
    ["nebel3", function () { return sz("nebel") === 3; }, function () {
      const buchst = function () {
        return Array.from(t("story.fog.ship", "GEISTERSCHIFF")).map(function (c, i) {
          return '<span style="display:inline-block;animation:fhStGeistBuchstabe 3.2s cubic-bezier(.45,0,.2,1) ' + (i * 0.07).toFixed(2) + 's both, fhStWabern 2.4s ease-in-out ' + (i * 0.15).toFixed(2) + 's infinite;">' + esc(c) + '</span>';
        }).join("");
      };
      const stil = DISPLAY + 'font-size:clamp(34px, 7vw, 84px);font-weight:500;letter-spacing:.24em;line-height:1;color:var(--fh-paper);text-shadow:0 0 40px rgba(232,213,168,.7), 0 0 90px rgba(232,213,168,.3);';
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9998;overflow:hidden;"><div style="position:absolute;left:-60vw;top:28%;width:60vw;height:34vh;border-radius:50%;background:radial-gradient(closest-side, rgba(232,213,168,.35), rgba(232,237,244,.08) 60%, transparent);filter:blur(20px);animation:fhStGeistLicht 3.2s ease-in-out both;"></div></div>' +
        '<div style="position:fixed;left:0;right:0;top:38%;z-index:10000;display:flex;flex-direction:column;align-items:center;pointer-events:none;">' +
          '<div style="' + stil + '">' + buchst() + '</div>' +
          '<div aria-hidden="true" style="' + stil + 'transform:scaleY(-1);margin-top:6px;opacity:.22;filter:blur(2px);-webkit-mask-image:linear-gradient(0deg, #000, transparent 70%);mask-image:linear-gradient(0deg, #000, transparent 70%);">' + buchst() + '</div>' +
        '</div></div>');
    }],
    ["nebel4", function () { return sz("nebel") === 4; }, function () {
      const worte = [T("fog.w1", "kehrt um …"), T("fog.w2", "zu spät"), T("fog.w3", "ihr gehört uns"), T("fog.w4", "hört ihr die glocke?"), T("fog.w5", "niemand entkommt"), T("fog.w6", "tiefer …")];
      const links = [12, 68, 30, 74, 18, 52], oben = [22, 30, 62, 70, 48, 84];
      const fl = worte.map(function (w, i) {
        return '<span style="position:absolute;left:' + links[i] + '%;top:' + oben[i] + '%;' + DISPLAY + 'font-size:' + (18 + (i % 3) * 6) + 'px;letter-spacing:.2em;color:var(--fh-paper);opacity:0;filter:blur(1px);text-shadow:0 0 18px rgba(232,213,168,.6);animation:fhStFluestern 2.2s ease-in-out ' + (i * 0.42).toFixed(2) + 's both;">' + w + '</span>';
      }).join("");
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9999;">' + fl + '</div>' +
        karte('14%', 'rgba(232,213,168,.45)', 'rgba(232,213,168,.18)', 'var(--fh-paper)', 'dashed', IC.skull, 'var(--fh-paper)', T("fog.cursed", "Verflucht"), T("fog.card", "Ein Fluch liegt über dem Deck – halt dich fest."), 'fhStGeist 2s ease-in-out infinite') +
      '</div>');
    }],
    ["nebel5", function () { return sz("nebel") === 5; }, function () {
      return aus('<div>' +
        '<div style="' + VOLL + 'z-index:9996;background:radial-gradient(90% 60% at 50% 110%, rgba(240,201,106,.28), rgba(255,106,42,.08) 50%, transparent 75%);animation:fhStEinblenden 1.2s both, fhStAus .8s 2.4s forwards;"></div>' +
        '<div style="position:fixed;left:50%;bottom:-40vh;z-index:9996;width:180vmax;height:180vmax;pointer-events:none;mix-blend-mode:screen;background:repeating-conic-gradient(from 0deg at 50% 50%, rgba(240,201,106,.14) 0deg 4deg, transparent 4deg 18deg);-webkit-mask-image:radial-gradient(circle, #000 10%, transparent 55%);mask-image:radial-gradient(circle, #000 10%, transparent 55%);animation:fhStStrahlenAuf 3.2s cubic-bezier(.45,0,.2,1) both, fhStAus .8s 2.4s forwards;"></div>' +
      '</div>');
    }],

    /* ================= STURMFLUT ================= */
    ["flutWasser", function () { return sz("flut") >= 1; }, function () {
      const pfad = function (amp, per, y) { let d = 'M0 ' + y; for (let x = 0; x <= 2400; x += per / 2) d += ' Q' + (x + per / 4) + ' ' + (y + (((x / (per / 2)) % 2) ? amp : -amp)) + ' ' + (x + per / 2) + ' ' + y; return d + ' V80 H0 Z'; };
      const lage = function (amp, per, y, farbe, dauer, op) { return '<svg viewBox="0 0 2400 80" preserveAspectRatio="none" style="position:absolute;left:0;top:-46px;width:200%;height:60px;opacity:' + op + ';animation:fhStWellenZug ' + dauer + 's linear infinite;"><path d="' + pfad(amp, per, y) + '" fill="' + farbe + '"/></svg>'; };
      return aus('<div id="fh-story-wasser" style="position:fixed;left:0;right:0;bottom:0;z-index:9997;height:0;pointer-events:none;background:linear-gradient(180deg, rgba(42,74,114,.55), rgba(11,24,36,.85));box-shadow:inset 0 1px 0 rgba(200,222,245,.35);">' +
        '<div style="position:absolute;inset:0;pointer-events:none;">' + lage(10, 300, 40, 'rgba(90,160,224,.35)', 9, 1) + lage(14, 400, 44, 'rgba(42,74,114,.6)', 6, 1) + lage(7, 240, 48, 'rgba(200,222,245,.25)', 4, .9) +
        '<div style="position:absolute;inset:0;mix-blend-mode:screen;background:radial-gradient(40px 14px at 20% 30%, rgba(200,222,245,.12), transparent), radial-gradient(60px 18px at 65% 55%, rgba(200,222,245,.1), transparent), radial-gradient(50px 12px at 40% 80%, rgba(200,222,245,.1), transparent);background-size:320px 220px;animation:fhStKaustik 5s linear infinite;"></div></div>' +
      '</div>');
    }],
    ["flut1", function () { return sz("flut") === 1; }, function () {
      return aus(textZeile(T("flood.t1", "Das Wasser zieht sich zurück …"), '20%', 'clamp(20px, 3vw, 34px)', 'var(--fh-fg)', '0 0 30px rgba(90,160,224,.5)', 'fhStHoch .8s .2s both'));
    }],
    ["gischt", function () { return sz("flut") === 2; }, function () {
      let s = "";
      for (let i = 0; i < 36; i++) {
        const g = 5 + (i % 4) * 2;
        s += '<span style="position:absolute;bottom:28vh;left:' + ((i * 29) % 100) + '%;width:' + g + 'px;height:' + g + 'px;border-radius:50%;background:rgba(200,222,245,.75);--dx:' + ((i % 7) - 3) * 14 + 'px;--dy:' + -(80 + (i * 37) % 160) + 'px;animation:fhStGischt 1.2s cubic-bezier(.2,.8,.4,1) ' + ((i % 6) * 0.08).toFixed(2) + 's both;"></span>';
      }
      return aus('<div style="' + VOLL + 'z-index:9999;overflow:hidden;">' + s + '</div>');
    }],
    ["landUnter", function () { return sz("flut") === 3; }, function () {
      return aus('<p style="' + MITTE + 'top:14%;z-index:10000;' + DISPLAY + 'font-size:clamp(44px, 9vw, 110px);font-weight:500;letter-spacing:.14em;color:var(--fh-fg);text-shadow:0 0 40px rgba(90,160,224,.7);animation:fhStZoomRein .6s cubic-bezier(.22,.9,.32,1) both, fhStSchweben 2.4s ease-in-out .6s infinite;">' + T("flood.land", "LAND UNTER") + '</p>');
    }],
    ["blasen", function () { const f = sz("flut"); return f === 3 || f === 4; }, function () {
      let s = "";
      for (let i = 0; i < 28; i++) {
        const g = 4 + (i * 7) % 14;
        s += '<span style="position:absolute;bottom:-20px;left:' + ((i * 37) % 100) + '%;width:' + g + 'px;height:' + g + 'px;border-radius:50%;border:1px solid rgba(200,222,245,.55);background:radial-gradient(circle at 35% 30%, rgba(232,237,244,.5), transparent 60%);animation:fhStBlase ' + (2.4 + (i % 5) * 0.6).toFixed(1) + 's ease-in ' + ((i % 9) * 0.3).toFixed(1) + 's infinite;"></span>';
      }
      return aus('<div style="' + VOLL + 'z-index:9998;overflow:hidden;">' + s + '</div>');
    }],
    ["flut4", function () { return sz("flut") === 4; }, function () {
      return aus(karte('calc(42vh - 76px)', 'rgba(90,160,224,.6)', 'rgba(90,160,224,.25)', 'var(--fh-success)', 'solid', IC.gift, '#5aa0e0', T("flood.drift", "Treibgut"), T("flood.card", "Eine Kiste treibt an Deck – +150 Dublonen."), '', true));
    }],
    ["strudel", function () { return sz("flut") === 5; }, function () {
      return aus('<div style="position:fixed;left:50%;bottom:0;z-index:9998;width:70vmin;height:70vmin;border-radius:50%;pointer-events:none;background:repeating-conic-gradient(rgba(90,160,224,.35) 0deg 10deg, transparent 10deg 30deg);-webkit-mask-image:radial-gradient(circle, transparent 12%, #000 30%, transparent 70%);mask-image:radial-gradient(circle, transparent 12%, #000 30%, transparent 70%);animation:fhStStrudel 2.8s cubic-bezier(.45,0,.2,1) forwards;"></div>');
    }],

    /* ================= NORDLICHT ================= */
    [function () { return "nordlicht" + (sz("nordlicht") === 1 ? "A" : sz("nordlicht") === 5 ? "Z" : ""); }, function () { return sz("nordlicht") >= 1; }, function () {
      const n = sz("nordlicht");
      return aus('<div style="' + VOLL + 'z-index:9996;overflow:hidden;mix-blend-mode:screen;' + (n === 1 ? 'animation:fhStEinblenden 2.4s cubic-bezier(.45,0,.2,1) both;' : n === 5 ? 'animation:fhStAus 2.8s cubic-bezier(.45,0,.2,1) forwards;' : '') + '">' +
        '<div style="position:absolute;left:-20%;top:4%;width:140%;height:40vh;border-radius:50%;background:linear-gradient(90deg, transparent, rgba(85,200,120,.5), rgba(66,184,255,.35), rgba(166,107,255,.45), transparent);filter:blur(46px);animation:fhStAurora 9s cubic-bezier(.45,0,.55,1) infinite alternate;"></div>' +
        '<div style="position:absolute;left:-20%;top:16%;width:140%;height:30vh;border-radius:50%;background:linear-gradient(90deg, transparent, rgba(166,107,255,.4), rgba(85,200,120,.45), transparent);filter:blur(56px);animation:fhStAurora 12s cubic-bezier(.45,0,.55,1) -5s infinite alternate-reverse;"></div>' +
        '<div style="position:absolute;left:-10%;top:0;width:120%;height:60vh;background:repeating-linear-gradient(90deg, rgba(200,245,220,.07) 0 2px, transparent 2px 16px);-webkit-mask-image:linear-gradient(180deg, transparent, #000 30%, transparent 85%);mask-image:linear-gradient(180deg, transparent, #000 30%, transparent 85%);animation:fhStAurora 10s cubic-bezier(.45,0,.55,1) -2s infinite alternate;"></div>' +
      '</div>');
    }],
    ["nl1", function () { return sz("nordlicht") === 1; }, function () {
      return aus(textZeile(T("aurora.t1", "Der Himmel wird still …"), '22%', 'clamp(20px, 3vw, 34px)', 'var(--fh-fg)', '', 'fhStHoch 1.4s cubic-bezier(.45,0,.2,1) .4s both', 'letter-spacing:.1em;'));
    }],
    ["nl2", function () { return sz("nordlicht") === 2; }, function () {
      return aus('<p style="' + MITTE + 'top:40%;z-index:10000;' + DISPLAY + 'font-size:clamp(40px, 8vw, 100px);font-weight:500;color:var(--fh-fg);text-shadow:0 0 50px rgba(166,107,255,.6), 0 0 90px rgba(85,200,120,.35);animation:fhStGeistText 4.4s cubic-bezier(.45,0,.2,1) both;">' + T("aurora.title", "NORDLICHT") + '</p>');
    }],
    ["schnuppen", function () { return sz("nordlicht") === 3; }, function () {
      let s = "";
      for (let i = 0; i < 16; i++) {
        s += '<span style="position:absolute;left:' + (40 + (i * 37) % 70) + '%;top:' + ((i * 23) % 45) + '%;width:' + (140 + (i % 3) * 60) + 'px;height:2px;border-radius:2px;background:linear-gradient(90deg, rgba(232,237,244,0), #e8edf4);box-shadow:0 0 10px rgba(232,237,244,.6);transform:rotate(-28deg);opacity:0;animation:fhStSchnuppeFlug 1.3s cubic-bezier(.3,0,.2,1) ' + (i * 0.2).toFixed(2) + 's both;"></span>';
      }
      return aus('<div style="' + VOLL + 'z-index:9998;overflow:hidden;">' + s + '</div>');
    }],
    ["nl4", function () { return sz("nordlicht") === 4; }, function () {
      return aus('<div style="' + VOLL + 'z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;">' +
        '<p style="margin:0;' + DISPLAY + 'font-size:clamp(36px, 7vw, 84px);font-weight:500;letter-spacing:.06em;color:var(--fh-fg);text-shadow:0 0 50px rgba(166,107,255,.6);animation:fhStGeistBuchstabe 3.6s cubic-bezier(.45,0,.2,1) both;">' + T("aurora.wish", "Wünsch dir was") + '</p>' +
        '<p style="margin:14px 0 0;font-size:16px;color:var(--fh-fg);animation:fhStHoch 1s cubic-bezier(.45,0,.2,1) .8s both;">' + T("aurora.granted", "Ein Wunsch geht in Erfüllung – +150 Dublonen") + '</p>' +
      '</div>');
    }],
  ];

  /* Farbfilter der Seite je Szene - [backdrop-filter, Uebergang ms]. */
  function filterFuer() {
    const hk = sz("hacked"), en = sz("ende"), sr = sz("schatz"), ds = sz("disco"), sw = sz("sturm"), nb = sz("nebel"), fl = sz("flut"), nl = sz("nordlicht");
    if (hk >= 2 && hk <= 5) return ["saturate(.3) brightness(.5)", 600];
    if (hk === 6) return [null, 1600];
    if (en === 1) return ["saturate(1.4) brightness(.8)", 300];
    if (sz("werbung") === 2) return ["brightness(.7) saturate(.8)", 600];
    if (en === 2) return ["saturate(.3) brightness(.45)", 600];
    if (sr === 2 || sr === 3) return ["brightness(.5) saturate(.7)", 800];
    if (ds === 1 || ds === 2) return ["brightness(.35)", 200];
    if (sw >= 1 && sw <= 4) return ["brightness(.72) saturate(.55)", 1400];
    if (nb >= 1 && nb <= 4) return ["saturate(.45) brightness(.75)", 2000];
    if (fl === 3 || fl === 4) return ["hue-rotate(-14deg) saturate(.75) brightness(.85)", 1600];
    if (nl >= 1 && nl <= 4) return ["brightness(.62) saturate(.85)", 2400];
    if (gehackt && !lauf) return ["grayscale(1) sepia(1) hue-rotate(58deg) saturate(3.2) brightness(.92)", 600];
    return [null, nl === 5 ? 2800 : nb === 5 ? 2400 : sw === 5 || fl === 5 ? 2000 : sr === 4 ? 1600 : 600];
  }

  function bewegungFuer() {
    const hk = sz("hacked"), nb = sz("nebel"), fl = sz("flut");
    if (hk === 1 || sz("gegenhack_niederlage") === 1) return "fh-story-glitch";
    if (nb === 4) return "fh-story-schwanken";
    if (fl >= 2 && fl <= 4) return "fh-story-schaukeln";
    if (gehackt && !lauf) return "fh-story-gehackt-flackern";
    return null;
  }

  function stimmungFuer() {
    const hk = sz("hacked");
    if (hk >= 2 && hk <= 5) return "fh-story-hack";
    if (sz("disco") === 4) return "fh-story-beat";
    if (sz("sturm") === 4) return "fh-story-geladen";
    const nb = sz("nebel"); if (nb === 3 || nb === 4) return "fh-story-geist";
    const fl = sz("flut"); if (fl === 3 || fl === 4) return "fh-story-schwimmt";
    const nl = sz("nordlicht"); if (nl >= 2 && nl <= 4) return "fh-story-wunsch";
    return null;
  }

  /* Alles zur aktuellen Szene herstellen. */
  function anzeigen() {
    const soll = {};
    EBENEN.forEach(function (e) {
      if (!e[1]()) return;
      soll[typeof e[0] === "function" ? e[0]() : e[0]] = e[2];
    });
    Object.keys(ebenen).forEach(function (name) { if (!soll[name]) ebene(name, false); });
    Object.keys(soll).forEach(function (name) { ebene(name, true, soll[name]); });
    const f = filterFuer();
    seitenFilter(f[0], f[1]);
    seitenBewegung(bewegungFuer());
    himmelStimmung(stimmungFuer());
    const w = document.getElementById("fh-story-wasser");
    if (w) {
      const fl = sz("flut");
      w.style.transition = "height " + (fl === 5 ? 2.6 : 2) + "s cubic-bezier(.45,0,.2,1)";
      requestAnimationFrame(function () { w.style.height = ([0, 4, 32, 72, 58, 0][fl] || 0) + "vh"; });
    }
  }

  /* ------------------------------------------------------
     SCHATZREGEN: Muenzen fangen
     Die Muenzen laufen direkt im DOM (kein Neuzeichnen je Muenze).
     D = 1, Gold = 5, Fluch = -3; ab fuenf in Folge doppelte Beute.
  ------------------------------------------------------ */
  let schatz = null;        // { punkte, gefangen, verpasst, combo }
  let muenzUhr = null, regenEnde = 0;

  function muenzStil(typ) {
    const gr = typ === "gold" ? 56 : 46;
    const bg = typ === "fluch" ? "radial-gradient(circle at 40% 35%, #b3312c, var(--fh-red-deep) 60%, #2a0a09)" : typ === "gold" ? "radial-gradient(circle at 40% 32%, #fffaf0, var(--fh-gold-bright) 35%, var(--fh-gold) 70%, var(--fh-fire-deep))" : "radial-gradient(circle at 40% 32%, var(--fh-paper), var(--fh-gold-bright) 40%, var(--fh-gold) 75%, #8a5a1c)";
    const glow = typ === "gold" ? "0 0 26px var(--fh-gold-bright), inset 0 0 0 4px rgba(58,36,8,.25)" : typ === "fluch" ? "0 0 18px rgba(229,57,53,.6), inset 0 0 0 4px rgba(0,0,0,.3)" : "0 0 14px rgba(240,201,106,.5), inset 0 0 0 4px rgba(58,36,8,.22)";
    return "display:grid;place-items:center;width:" + gr + "px;height:" + gr + "px;margin-left:-" + gr / 2 + "px;padding:0;border-radius:50%;box-sizing:border-box;border:2px solid " + (typ === "fluch" ? "var(--fh-danger)" : "var(--fh-gold-bright)") + ";background:" + bg + ";color:" + (typ === "fluch" ? "var(--fh-paper)" : "#3a2408") + ";font:600 " + (typ === "gold" ? 24 : 20) + "px var(--fh-font-display);cursor:pointer;pointer-events:auto;touch-action:manipulation;box-shadow:" + glow + ";animation:fhStMuenzeDreh " + (typ === "gold" ? 0.8 : 1.3) + "s ease-in-out infinite";
  }

  function muenzEbene() {
    let el = document.getElementById("fh-story-muenzen");
    if (!el) {
      el = document.createElement("div");
      el.id = "fh-story-muenzen";
      el.style.cssText = "position:fixed;inset:0;z-index:10002;pointer-events:none;overflow:hidden;";
      halter().appendChild(el);
    }
    return el;
  }

  function schatzAnzeige() {
    const p = document.getElementById("fh-schatz-punkte");
    if (p) {
      p.textContent = schatz ? schatz.punkte : 0;
      p.classList.remove("fh-story-pop-1", "fh-story-pop-2");
      void p.offsetWidth;
      p.classList.add("fh-story-pop-" + ((schatz ? schatz.gefangen + schatz.verpasst : 0) % 2 + 1));
    }
    const c = document.getElementById("fh-schatz-combo");
    if (c) {
      const combo = schatz ? schatz.combo : 0;
      c.hidden = combo < 2;
      c.textContent = combo >= 2 ? t("story.treasure.combo", "Combo") + " ×" + combo + (combo >= 5 ? " · " + t("story.treasure.double", "doppelte Beute") : "") : "";
    }
  }

  function regenStart(dauer) {
    clearInterval(muenzUhr);
    const layer = muenzEbene();
    regenEnde = Date.now() + dauer;
    const schaedel = svg(IC.skull, "18px");
    muenzUhr = setInterval(function () {
      const rest = Math.max(0, regenEnde - Date.now());
      const zeit = document.getElementById("fh-schatz-zeit");
      if (zeit) zeit.textContent = Math.ceil(rest / 1000) + " s";
      if (rest <= 0) { clearInterval(muenzUhr); muenzUhr = null; return; }
      const fort = 1 - rest / 15000;
      const r = Math.random();
      const typ = r < 0.08 ? "gold" : r < 0.22 ? "fluch" : "normal";
      const w = document.createElement("div");
      w.style.cssText = "position:absolute;top:0;left:" + (4 + Math.random() * 88).toFixed(1) + "%;will-change:transform;animation:fhStMuenzeFall " + (3.8 - fort * 1.4 + Math.random() * 0.8).toFixed(2) + "s linear forwards";
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", typ === "fluch" ? t("story.treasure.cursedCoin", "Verfluchte Münze") : t("story.treasure.catch", "Dublone fangen"));
      b.style.cssText = muenzStil(typ);
      if (typ === "fluch") b.innerHTML = schaedel; else b.textContent = typ === "gold" ? "5" : "D";
      b.addEventListener("pointerdown", function (e) { if (w._weg) return; w._weg = true; w.remove(); fangen(typ, e); });
      w.addEventListener("animationend", function (e) {
        if (e.target !== w || w._weg) return;
        w._weg = true; w.remove();
        if (typ !== "fluch" && schatz) { schatz.verpasst++; schatz.combo = 0; schatzAnzeige(); }
      });
      w.appendChild(b);
      layer.appendChild(w);
    }, 260);
  }

  function regenStop() {
    clearInterval(muenzUhr); muenzUhr = null;
    const layer = document.getElementById("fh-story-muenzen");
    if (layer) layer.remove();
  }

  function fangen(typ, e) {
    if (!schatz) return;
    schatz.combo = typ === "fluch" ? 0 : schatz.combo + 1;
    const wert = typ === "fluch" ? -3 : (typ === "gold" ? 5 : 1) * (schatz.combo >= 5 ? 2 : 1);
    schatz.punkte = Math.max(0, schatz.punkte + wert);
    if (wert > 0) schatz.gefangen++;
    schatzAnzeige();
    const layer = document.getElementById("fh-story-muenzen");
    if (!layer) return;
    const fluch = typ === "fluch", farbe = fluch ? "var(--fh-danger)" : "var(--fh-gold-bright)";
    const ring = document.createElement("span");
    ring.style.cssText = "position:absolute;left:" + e.clientX + "px;top:" + e.clientY + "px;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:2px solid " + farbe + ";animation:fhStWelle .6s ease-out forwards";
    const txt = document.createElement("span");
    txt.textContent = (wert > 0 ? "+" : "−") + Math.abs(wert);
    txt.style.cssText = "position:absolute;left:" + e.clientX + "px;top:" + e.clientY + "px;font:600 " + (typ === "gold" ? 34 : 26) + "px var(--fh-font-display);color:" + farbe + ";text-shadow:0 0 16px " + (fluch ? "rgba(229,57,53,.7)" : "rgba(240,201,106,.8)") + ";animation:fhStPunktPop .8s cubic-bezier(.22,.9,.32,1) forwards";
    layer.appendChild(ring); layer.appendChild(txt);
    setTimeout(function () { ring.remove(); txt.remove(); }, 820);
  }

  /* ------------------------------------------------------
     HINTERTUEREN NACH "HACKED"
     Sechs Loecher; jedes schliesst man mit drei Treffern im
     gruenen Fenster. Alle zu: +1 Skillpunkt (live_story_belohnung).
     Bleiben nur bis zum Neuladen - wer die Seite neu laedt, hat
     sie nicht mehr.
  ------------------------------------------------------ */
  const LOCH_POS = [[12, 9, 78], [84, 13, 64], [33, 40, 88], [64, 57, 70], [90, 44, 60], [22, 80, 74]];
  const SPOTT = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const SPOTT_DE = ["zu langsam, crew.", "diese lücke gehört mir.", "ihr findet nie alle.", "tick tack …", "hübsches schiff. wäre schade drum.", "ich sehe euch."];
  let loecher = [];          // { id, x, y, g, zu, el }
  let loecherStory = null;   // story_id der Hacked-Story, zu der sie gehoeren
  let loecherVorschau = false;
  let spiel = null;          // laufendes Gegenhack-Spiel

  function spott(i) { return t("story.backdoor." + SPOTT[i % SPOTT.length], SPOTT_DE[i % SPOTT_DE.length]); }

  function loecherAnzeigen() {
    let hinweis = document.getElementById("fh-loch-hinweis");
    const offen = loecher.filter(function (l) { return !l.zu; }).length;
    if (!offen) { if (hinweis) hinweis.remove(); return; }
    if (!hinweis) {
      hinweis = aus('<div id="fh-loch-hinweis" style="position:fixed;left:16px;bottom:16px;z-index:10001;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border:1px solid rgba(57,255,20,.5);border-radius:999px;background:rgba(3,10,5,.94);box-shadow:0 0 24px rgba(57,255,20,.2);' + MONO + 'font-size:12px;color:var(--fh-neon);pointer-events:none;animation:fhStHoch .4s 1s both;">' +
        '<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid var(--fh-neon);background:#0c2410;font-size:13px;animation:fhStHackFlackern 1.8s steps(1) infinite;">?</span><span id="fh-loch-text"></span></div>');
      halter().appendChild(hinweis);
    }
    const text = document.getElementById("fh-loch-text");
    if (text) text.textContent = offen + " " + (offen === 1 ? t("story.backdoor.oneOpen", "Hintertür offen") : t("story.backdoor.manyOpen", "Hintertüren offen")) + " – " + t("story.backdoor.hint", "klick sie an und hack zurück");
  }

  function loecherSpawnen(storyId, vorschau) {
    loecherWeg();
    loecherStory = storyId;
    loecherVorschau = !!vorschau;
    loecher = LOCH_POS.map(function (p, i) {
      const knopf = aus('<button type="button" class="fh-story-loch" style="position:fixed;left:' + p[0] + '%;top:' + p[1] + '%;z-index:9989;width:' + p[2] + 'px;height:' + p[2] + 'px;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;transform:translate(-50%, -50%);filter:drop-shadow(0 0 10px rgba(57,255,20,.6));animation:fhStLochAuf .6s cubic-bezier(.22,.9,.32,1) ' + (i * 0.18).toFixed(2) + 's both;">' +
        '<div style="position:absolute;inset:0;clip-path:polygon(50% 0%, 63% 12%, 80% 6%, 84% 24%, 100% 34%, 90% 50%, 100% 66%, 82% 74%, 80% 94%, 62% 86%, 50% 100%, 36% 88%, 18% 96%, 16% 76%, 0% 66%, 10% 50%, 0% 32%, 18% 24%, 20% 6%, 38% 12%);background:radial-gradient(circle at 50% 50%, #020503 0 42%, #06170a 58%, rgba(57,255,20,.9) 72%, rgba(57,255,20,.25) 100%);animation:fhStLochFlackern 2.6s steps(1,end) infinite;">' +
          '<div style="position:absolute;inset:16%;border-radius:50%;background:repeating-conic-gradient(rgba(57,255,20,.2) 0deg 8deg, transparent 8deg 24deg);animation:fhStLochDreh 6s linear infinite;"></div>' +
          '<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg, rgba(57,255,20,.12) 0 1px, transparent 1px 3px);"></div>' +
          '<span style="position:absolute;inset:0;display:grid;place-items:center;' + MONO + 'font-size:22px;font-weight:700;color:var(--fh-neon);animation:fhStGlitchText 1.4s steps(1,end) infinite;">?</span>' +
        '</div></button>');
      knopf.setAttribute("aria-label", t("story.backdoor.close", "Hintertür schließen"));
      const loch = { id: i, zu: false, el: knopf };
      knopf.addEventListener("click", function () { lochOeffnen(loch); });
      halter().appendChild(knopf);
      return loch;
    });
    loecherAnzeigen();
  }

  function loecherWeg() {
    spielZu();
    loecher.forEach(function (l) { if (l.el) l.el.remove(); });
    loecher = [];
    loecherStory = null;
    loecherAnzeigen();
  }

  function neuesFenster(r) { const fl = [22, 16, 11][r] || 11; return { fs: 4 + Math.random() * (92 - fl), fl: fl, dauer: [1.3, 1.0, 0.8][r] || 0.8 }; }

  function lochOeffnen(loch) {
    if (loch.zu || spiel) return;
    spiel = Object.assign({ loch: loch, treffer: 0, status: "bereit", spott: spott(loch.id), key: 0, wackel: 0,
      nr: loecher.filter(function (l) { return l.zu; }).length + 1 }, neuesFenster(0));
    spielZeichnen(true);
  }

  function spielZu() {
    spiel = null;
    const el = document.getElementById("fh-story-spiel");
    if (el) el.remove();
  }

  function spielZeichnen(neu) {
    let el = document.getElementById("fh-story-spiel");
    if (!spiel) { if (el) el.remove(); return; }
    const farbe = spiel.status === "fehler" ? "var(--fh-danger)" : spiel.status === "gewonnen" ? "var(--fh-gold-bright)" : "var(--fh-neon)";
    if (!el || neu) {
      if (el) el.remove();
      el = aus('<div id="fh-story-spiel" role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:10005;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,6,4,.72);animation:fhStEinblenden .2s both;">' +
        '<div class="fh-spiel-panel" style="width:min(520px, 100%);box-sizing:border-box;border:1px solid rgba(57,255,20,.5);border-radius:12px;background:rgba(3,10,5,.97);' + MONO + 'color:var(--fh-neon);animation:fhStZoomRein .3s cubic-bezier(.22,.9,.32,1) both;">' +
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(57,255,20,.2);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(57,255,20,.75);">' + svg(IC.terminal, '16px') + '<span class="fh-spiel-titel"></span>' +
            '<button type="button" class="fh-spiel-zu" style="display:grid;place-items:center;margin-left:auto;width:32px;height:32px;border:1px solid var(--fh-border-strong);border-radius:8px;background:transparent;color:var(--fh-muted-fg);cursor:pointer;' + MONO + 'font-size:14px;">×</button></div>' +
          '<div style="display:flex;flex-direction:column;gap:14px;padding:16px;">' +
            '<div style="display:flex;gap:10px;align-items:flex-end;"><span style="display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:50%;border:1px solid var(--fh-neon);background:#0c2410;font-size:14px;color:var(--fh-neon);">?</span>' +
              '<span style="padding:8px 12px;border-radius:12px 12px 12px 4px;border:1px solid rgba(57,255,20,.35);background:rgba(57,255,20,.08);"><span style="display:block;font-size:11px;color:var(--fh-neon);">' + T("unknown", "unbekannt") + '</span><span class="fh-spiel-spott" style="font-size:14px;color:var(--fh-fg);"></span></span></div>' +
            '<div class="fh-spiel-bar" style="position:relative;height:46px;border:1px solid rgba(57,255,20,.45);border-radius:6px;overflow:hidden;background:repeating-linear-gradient(90deg, transparent 0 calc(5% - 1px), rgba(57,255,20,.16) calc(5% - 1px) 5%), rgba(0,0,0,.45);">' +
              '<div class="fh-spiel-fenster" style="position:absolute;top:0;bottom:0;background:rgba(57,255,20,.26);border-left:2px solid var(--fh-neon);border-right:2px solid var(--fh-neon);box-shadow:inset 0 0 16px rgba(57,255,20,.4);transition:left 250ms cubic-bezier(.22,.9,.32,1), width 250ms cubic-bezier(.22,.9,.32,1);"></div>' +
              '<div class="fh-spiel-cursor" style="position:absolute;top:-2px;bottom:-2px;left:0;width:4px;border-radius:2px;box-shadow:0 0 10px var(--fh-fg);"></div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;"><div class="fh-spiel-pips" style="display:flex;gap:5px;"><span></span><span></span><span></span></div><p class="fh-spiel-status" style="margin:0;flex:1;font-size:12px;line-height:1.4;"></p></div>' +
            '<button type="button" class="fh-spiel-hack" style="min-height:50px;border:1px solid var(--fh-neon);border-radius:10px;background:rgba(57,255,20,.1);color:var(--fh-neon);' + MONO + 'font-size:18px;font-weight:700;letter-spacing:.3em;cursor:pointer;text-shadow:0 0 8px rgba(57,255,20,.7);"></button>' +
          '</div></div></div>');
      el.querySelector(".fh-spiel-zu").setAttribute("aria-label", t("story.backdoor.closeGame", "Schließen"));
      el.querySelector(".fh-spiel-zu").addEventListener("click", spielZu);
      el.querySelector(".fh-spiel-hack").addEventListener("click", spielHack);
      halter().appendChild(el);
      el.querySelector(".fh-spiel-hack").focus();
    }
    el.querySelector(".fh-spiel-titel").textContent = t("story.backdoor.title", "Gegenhack · Hintertür") + " " + spiel.nr + "/" + LOCH_POS.length;
    el.querySelector(".fh-spiel-spott").textContent = spiel.spott;
    const panel = el.querySelector(".fh-spiel-panel");
    panel.style.borderColor = spiel.status === "gewonnen" ? "var(--fh-gold)" : "rgba(57,255,20,.5)";
    panel.style.boxShadow = "0 0 60px " + (spiel.status === "gewonnen" ? "rgba(240,201,106,.3)" : "rgba(57,255,20,.2)") + ", var(--fh-shadow)";
    if (spiel.status === "fehler") {
      panel.style.animation = "none"; void panel.offsetWidth;
      panel.style.animation = "fhStWackeln" + (spiel.wackel % 2 + 1) + " .4s cubic-bezier(.22,.9,.32,1)";
    }
    const fenster = el.querySelector(".fh-spiel-fenster");
    fenster.style.left = spiel.fs + "%";
    fenster.style.width = spiel.fl + "%";
    const cursor = el.querySelector(".fh-spiel-cursor");
    cursor.style.background = spiel.status === "fehler" ? "var(--fh-danger)" : "var(--fh-fg)";
    cursor.style.animation = "fhStCursorLauf" + (spiel.key % 2 + 1) + " " + spiel.dauer + "s linear infinite alternate";
    cursor.style.animationPlayState = spiel.status === "gewonnen" ? "paused" : "running";
    el.querySelectorAll(".fh-spiel-pips span").forEach(function (p, i) {
      p.style.cssText = "width:26px;height:8px;border-radius:2px;border:1px solid rgba(57,255,20,.5);transition:background 200ms;background:" +
        (i < spiel.treffer ? (spiel.status === "gewonnen" ? "var(--fh-gold-bright)" : "var(--fh-neon)") : "transparent") + ";box-shadow:" + (i < spiel.treffer ? "0 0 8px var(--fh-neon)" : "none");
    });
    const status = el.querySelector(".fh-spiel-status");
    status.style.color = spiel.status === "bereit" ? "var(--fh-muted-fg)" : farbe;
    status.textContent = {
      bereit: t("story.backdoor.ready", "Drück HACK (oder Leertaste), wenn der Cursor im grünen Fenster steht."),
      treffer: t("story.backdoor.hit", "Treffer! Firewall-Segment") + " " + spiel.treffer + "/3 " + t("story.backdoor.set", "gesetzt."),
      fehler: t("story.backdoor.miss", "Zugriff verweigert – ein Segment verloren."),
      gewonnen: t("story.backdoor.closed", "Hintertür geschlossen."),
    }[spiel.status];
    el.querySelector(".fh-spiel-hack").textContent = spiel.status === "gewonnen" ? t("story.backdoor.shut", "GESCHLOSSEN") : "HACK";
  }

  function spielHack() {
    const el = document.getElementById("fh-story-spiel");
    if (!spiel || spiel.status === "gewonnen" || !el) return;
    const b = el.querySelector(".fh-spiel-bar").getBoundingClientRect();
    const c = el.querySelector(".fh-spiel-cursor").getBoundingClientRect();
    const pct = ((c.left + c.width / 2) - b.left) / b.width * 100;
    if (pct >= spiel.fs - 1 && pct <= spiel.fs + spiel.fl + 1) {
      const tr = spiel.treffer + 1;
      if (tr >= 3) {
        Object.assign(spiel, { treffer: tr, status: "gewonnen", spott: t("story.backdoor.onlyOne", "… das war nur eine.") });
        spielZeichnen();
        const loch = spiel.loch;
        setTimeout(function () { lochSchliessen(loch); }, 850);
      } else {
        Object.assign(spiel, neuesFenster(tr), { treffer: tr, status: "treffer", key: spiel.key + 1,
          spott: tr === 1 ? t("story.backdoor.lucky", "glück gehabt.") : t("story.backdoor.notBad", "hm. nicht schlecht.") });
        spielZeichnen();
      }
    } else {
      Object.assign(spiel, { treffer: Math.max(0, spiel.treffer - 1), status: "fehler", spott: t("story.backdoor.haha", "ha! daneben."), wackel: spiel.wackel + 1 });
      spielZeichnen();
    }
  }

  function lochSchliessen(loch) {
    spielZu();
    loch.zu = true;
    if (loch.el) {
      loch.el.style.filter = "drop-shadow(0 0 14px var(--fh-gold-bright))";
      loch.el.style.animation = "fhStLochZu .85s cubic-bezier(.4,0,.7,.2) forwards";
      loch.el.appendChild(aus('<div style="position:absolute;inset:-10%;border-radius:50%;border:3px solid var(--fh-gold-bright);animation:fhStWelle .8s ease-out forwards;"></div>'));
      setTimeout(function () { if (loch.el) loch.el.remove(); loch.el = null; }, 900);
    }
    loecherAnzeigen();
    if (loecher.every(function (l) { return l.zu; })) {
      setTimeout(function () {
        konfetti();
        belohnungAbholen(loecherStory, "hintertueren", 0, loecherVorschau).then(function (erg) {
          banderole(t("story.backdoor.allClosed", "Alle Hintertüren geschlossen") + belohnungsText(erg), t("story.dave", "Schifffahrer Dave"), "#f0c96a", false);
        });
        loecher = [];
      }, 900);
    }
  }

  document.addEventListener("keydown", function (e) {
    if (!spiel) return;
    if (e.key === "Escape") { spielZu(); return; }
    if ((e.key === " " || e.key === "Enter") && !(e.target && e.target.tagName === "BUTTON")) { e.preventDefault(); spielHack(); }
  });

  /* ------------------------------------------------------
     BELOHNUNGEN
     Die Datenbank legt fest, was es gibt (29-live-storys.sql).
     In der Vorschau des Admins wird nichts abgeholt - dort steht
     nur, was es gaebe.
  ------------------------------------------------------ */
  function vorschauBelohnung(art, beute) {
    const b = Math.max(0, Math.min(60, beute || 0));
    if (art === "wetter") return { ok: true, dublonen: 150, skillpunkte: 0, vorschau: true };
    if (art === "hacked") return { ok: true, dublonen: 0, skillpunkte: 1, titel: "Firewall-Pirat", vorschau: true };
    if (art === "hintertueren") return { ok: true, dublonen: 0, skillpunkte: 1, vorschau: true };
    if (art === "schatz") return { ok: true, dublonen: b * 10, skillpunkte: b >= 25 ? 1 : 0, vorschau: true };
    if (art === "werbung") return { ok: true, dublonen: Math.min(6, b) * 25, skillpunkte: 0, vorschau: true };
    return null;
  }

  async function belohnungAbholen(storyId, art, beute, vorschau) {
    if (vorschau || !storyId) return vorschauBelohnung(art, beute);
    if (!dbDa()) return null;
    try {
      if (typeof wheelAuthReady !== "undefined") await wheelAuthReady;
      const { data, error } = await withSupabaseRlsColdStartRetry(function () {
        return supabaseClient.rpc("live_story_belohnung", { p_story_id: storyId, p_art: art, p_beute: beute || 0 });
      });
      if (error) throw error;
      if (data && data.ok) {
        if (typeof refreshPlayerCard === "function") refreshPlayerCard();
        if (typeof refreshShopCurrencyDisplay === "function") refreshShopCurrencyDisplay();
        if (data.skillpunkte > 0 && typeof window.fhSkillNeuLaden === "function") window.fhSkillNeuLaden();
        if (data.titel && window.fhEventTitel) window.fhEventTitel.laden();
      }
      return data;
    } catch (err) {
      console.warn("Story-Belohnung konnte nicht abgeholt werden:", err);
      return null;
    }
  }

  /* " · +150 Dublonen · +1 Skillpunkt" - leer, wenn es nichts gab
     (schon abgeholt, zu spaet, keine Verbindung). */
  function belohnungsText(erg) {
    if (!erg || !erg.ok) return "";
    const teile = [];
    if (erg.dublonen > 0) teile.push("+" + erg.dublonen + " " + t("story.treasure.coins", "Dublonen"));
    if (erg.skillpunkte > 0) teile.push("+" + erg.skillpunkte + " " + (erg.skillpunkte === 1 ? t("story.skillpoint", "Skillpunkt") : t("story.skillpoints", "Skillpunkte")));
    if (!teile.length) return "";
    return " · " + teile.join(" · ") + (erg.vorschau ? " (" + t("story.preview", "Vorschau") + ")" : "");
  }

  /* ------------------------------------------------------
     DISCO-MUSIK
     Hochgeladen im Admin-Panel (Bucket "live-musik", Datei "disco");
     ohne Upload die Datei music/disco.mp3 aus dem Repo.
  ------------------------------------------------------ */
  let audio = null, fadeUhr = null, musikLaeuft = false;

  function musikUrl() {
    if (musikVersion && dbDa() && supabaseClient.storage) {
      try {
        const d = supabaseClient.storage.from("live-musik").getPublicUrl("disco").data;
        if (d && d.publicUrl) return d.publicUrl + "?v=" + encodeURIComponent(musikVersion);
      } catch (e) { /* dann die Datei aus dem Repo */ }
    }
    return "music/disco.mp3";
  }

  function musikStart() {
    const src = musikUrl();
    if (!audio) audio = new Audio();
    clearInterval(fadeUhr);
    if (audio.getAttribute("src") !== src) audio.src = src;
    audio.loop = true;
    audio.volume = 0.6;
    audio.currentTime = 0;
    audio.play().catch(function () { /* Autoplay evtl. blockiert, bis man einmal geklickt hat */ });
    musikLaeuft = true;
  }

  function musikAus(ms) {
    musikLaeuft = false;
    if (!audio) return;
    clearInterval(fadeUhr);
    if (!ms) { audio.pause(); return; }
    const v0 = audio.volume, t0 = Date.now();
    fadeUhr = setInterval(function () {
      const k = Math.min(1, (Date.now() - t0) / ms);
      audio.volume = v0 * (1 - k);
      if (k >= 1) { clearInterval(fadeUhr); audio.pause(); }
    }, 50);
  }

  /* ------------------------------------------------------
     WAS BEIM BETRETEN EINER SZENE PASSIERT
  ------------------------------------------------------ */
  function onSzene(st, n) {
    const id = lauf.id, vorschau = lauf.vorschau;
    const wetter = function (text, von, farbe) {
      /* Die Belohnung wurde eine Szene vorher abgeholt (oder jetzt). */
      const p = lauf.belohnung || belohnungAbholen(id, "wetter", 0, vorschau);
      p.then(function (erg) { banderole(text + belohnungsText(erg), von, farbe, false); });
    };

    /* Werbungsflut allein oder nach der Gegenhack-Niederlage (31). */
    const flut = function (gehackt) {
      if (!window.fhWerbungsflut) return;
      window.fhWerbungsflut.start({
        dauer: lauf.rest,
        gehackt: gehackt,
        belohnen: function (zahl) { return belohnungAbholen(id, "werbung", zahl, vorschau); },
        ende: gehackt ? {
          kopf: t("werbung.lostKicker", "Gegenhack fehlgeschlagen"),
          titel: t("werbung.lostTitle", "Ruhe. Vorerst."),
          text: window.fhGegenhack ? window.fhGegenhack.niederlageText(id, vorschau) : undefined,
        } : null,
      });
    };
    if (st === "werbung" && n === 1) blitz();
    if (st === "werbung" && n === 2) flut(false);
    if ((st === "werbung" || st === "gegenhack_niederlage") && n === 3 && window.fhWerbungsflut) window.fhWerbungsflut.zeitUm();
    if (st === "gegenhack_niederlage" && n === 1) { blitz(); spaeter(beben, 1100); }
    if (st === "gegenhack_niederlage" && n === 2) flut(true);
    if (st === "gegenhack_sieg" && n === 1) { blitz(); spaeter(konfetti, 400); }
    if (st === "gegenhack_sieg" && n === 2 && window.fhGegenhack) window.fhGegenhack.siegZeigen(id, vorschau);

    if (st === "hacked" && n === 5) spaeter(beben, 2500);
    if (st === "hacked" && n === 7) {
      const p = belohnungAbholen(id, "hacked", 0, vorschau);
      spaeter(function () {
        p.then(function (erg) {
          const titel = t("story.hack.titleGot", "Titel „Firewall-Pirat“");
          banderole(erg && erg.ok ? titel + belohnungsText(erg) : titel, "???", "#39ff14", true);
        });
        konfetti();
      }, 1800);
    }

    if (st === "ende" && n === 1) { spaeter(beben, 400); spaeter(beben, 1500); }
    if (st === "ende" && n === 3) beben();

    if (st === "schatz" && (n === 1 || !schatz)) schatz = { punkte: 0, gefangen: 0, verpasst: 0, combo: 0 };
    if (st === "schatz" && n === 1) konfetti();
    if (st === "schatz" && n === 3) spaeter(function () { regenStart(Math.max(1000, lauf.rest || 15000)); schatzAnzeige(); }, 30);
    if (st === "schatz" && n === 4) {
      regenStop();
      const pk = schatz ? schatz.punkte : 0;
      if (pk >= 25) konfetti();
      const p = pk > 0 ? belohnungAbholen(id, "schatz", pk, vorschau) : Promise.resolve(null);
      p.then(function (erg) {
        banderole(pk + " " + t("story.treasure.caughtCoins", "Dublonen gefangen") + belohnungsText(erg), t("story.treasure.title", "SCHATZREGEN"), "#f0c96a", false);
      });
    }

    if (st === "disco" && n === 3 && !musikLaeuft) musikStart();
    if (st === "disco" && n === 4) konfetti();
    if (st === "disco" && n === 5) { musikAus(2400); banderole(t("story.disco.thanks", "Danke fürs Tanzen, Crew!"), "Ändii", "#f0c96a", false); }

    if (st === "sturm" && n === 2) { spaeter(beben, 500); spaeter(beben, 1500); }
    if (st === "sturm" && n === 3) blitz();
    if (st === "sturm" && n === 4) lauf.belohnung = belohnungAbholen(id, "wetter", 0, vorschau);
    if (st === "sturm" && n === 5) wetter(t("story.storm.done", "Sturm überstanden"), "Ändii", "#42b8ff");

    if (st === "nordlicht" && n === 4) lauf.belohnung = belohnungAbholen(id, "wetter", 0, vorschau);
    if (st === "nordlicht" && n === 5) wetter(t("story.aurora.done", "Dein Wunsch wurde erhört"), t("story.aurora.from", "Nordlicht"), "#a66bff");

    if (st === "nebel" && n === 4) spaeter(beben, 1200);
    if (st === "nebel" && n === 5) wetter(t("story.fog.done", "Der Fluch ist gebrochen"), "Ändii", "#e8d5a8");

    if (st === "flut" && n === 1) spaeter(beben, 900);
    if (st === "flut" && n === 4) lauf.belohnung = belohnungAbholen(id, "wetter", 0, vorschau);
    if (st === "flut" && n === 5) wetter(t("story.flood.done", "Treibgut geborgen"), "Ändii", "#5aa0e0");
  }

  /* ------------------------------------------------------
     ABLAUF
  ------------------------------------------------------ */

  /* Wo steht eine Story nach "ms" Millisekunden? { n, rest } oder
     null, wenn sie vorbei ist. Disco dreht Szene 3-4 im Kreis, bis
     endeMs gesetzt ist - dann laeuft nur noch Szene 5. */
  function position(st, ms, endeMs) {
    const def = STORYS[st];
    const d = def.szenen;
    if (def.loop) {
      if (endeMs) {
        const seit = Math.max(0, Date.now() - endeMs);
        return seit < d[4] ? { n: 5, rest: d[4] - seit } : null;
      }
      if (ms < d[0]) return { n: 1, rest: d[0] - ms };
      if (ms < d[0] + d[1]) return { n: 2, rest: d[0] + d[1] - ms };
      const m = (ms - d[0] - d[1]) % (d[2] + d[3]);
      return m < d[2] ? { n: 3, rest: d[2] - m } : { n: 4, rest: d[2] + d[3] - m };
    }
    if (ms >= def.gesamt) return null;
    let summe = 0;
    for (let i = 0; i < d.length; i++) {
      if (ms < summe + d[i]) return { n: i + 1, rest: summe + d[i] - ms };
      summe += d[i];
    }
    return null;
  }

  function szeneBetreten(n, rest) {
    if (!lauf) return;
    clearTimeout(lauf.timer);
    lauf.n = n;
    lauf.rest = rest;
    onSzene(lauf.story, n);
    anzeigen();
    lauf.timer = spaeter(naechsteSzene, rest);
  }

  function naechsteSzene() {
    if (!lauf) return;
    const def = STORYS[lauf.story];
    let m = lauf.n + 1;
    if (def.loop && lauf.n === def.loop[1] && !lauf.ausklingen) m = def.loop[0];
    if (m > def.szenen.length) { storyEnde(); return; }
    szeneBetreten(m, def.szenen[m - 1]);
  }

  function storyEnde() {
    if (!lauf) return;
    const st = lauf.story, id = lauf.id, vorschau = lauf.vorschau;
    timerWeg();
    regenStop();
    lauf = null;
    if (st === "hacked") loecherSpawnen(id, vorschau);
    if (st === "ende" || st === "gegenhack_niederlage") gehackt = true;
    if (st === "sturm" && !vorschau) nachregen = true;
    anzeigen();
  }

  function starten(st, id, ms, vorschau, endeMs) {
    if (!STORYS[st]) return;
    stoppen();
    gehackt = false;
    nachregen = false;
    if (st === "hacked") loecherWeg();
    lauf = { story: st, id: id, vorschau: !!vorschau, n: 0, ausklingen: !!endeMs };
    const pos = position(st, ms, endeMs);
    if (!pos) {
      /* Schon vorbei: nur den Dauerzustand herstellen. */
      lauf = null;
      if (st === "ende" || st === "gegenhack_niederlage") gehackt = true;
      if (st === "sturm" && !vorschau && sturmNachwirkung) nachregen = true;
      anzeigen();
      return;
    }
    szeneBetreten(pos.n, pos.rest);
  }

  function stoppen() {
    timerWeg();
    regenStop();
    if (window.fhWerbungsflut) window.fhWerbungsflut.weg();
    if (window.fhGegenhack) window.fhGegenhack.siegWeg();
    if (musikLaeuft) musikAus(0);
    lauf = null;
    anzeigen();
  }

  /* Disco beenden: sofort in den Ausklang. */
  function ausklingen() {
    if (!lauf || !STORYS[lauf.story].loop || lauf.ausklingen) return;
    lauf.ausklingen = true;
    const d = STORYS[lauf.story].szenen;
    szeneBetreten(d.length, d[d.length - 1]);
  }

  /* ------------------------------------------------------
     VON live-event.js: die Zustandszeile
     Beim ersten Laden steigt man anhand von story_at ein. Kommt eine
     Aenderung LIVE an (Realtime/Polling), beginnt die Story bei 0 -
     so stoert eine falsch gehende Uhr beim Zuschauer nicht.
  ------------------------------------------------------ */
  function zustand(z, erstesMal) {
    if (!z) return;
    musikVersion = z.musik_version || null;
    const id = z.story_id || null;
    if (id !== aktuelleId) {
      aktuelleId = id;
      letztesEnde = z.story_ende_at || null;
      if (!id || !z.story) {
        gehackt = false;
        nachregen = false;
        stoppen();
        return;
      }
      /* Ein Sturm VOR dem laufenden Event (Countdown hoechstens 60 s)
         hinterlaesst keinen Regen mehr - "bis zum naechsten Event". */
      sturmNachwirkung = !(z.event_live_ab && Date.parse(z.story_at) < Date.parse(z.event_live_ab) - 61000);
      const ms = erstesMal ? Math.max(0, Date.now() - Date.parse(z.story_at)) : 0;
      const endeMs = z.story_ende_at ? (erstesMal ? Date.parse(z.story_ende_at) : Date.now()) : null;
      starten(z.story, id, ms, false, endeMs);
      return;
    }
    if (id && z.story_ende_at && z.story_ende_at !== letztesEnde) {
      letztesEnde = z.story_ende_at;
      ausklingen();
    }
  }

  window.fhLiveStorys = {
    zustand: zustand,
    /* Admin: nur im eigenen Browser, ohne Belohnung */
    vorschau: function (st) { starten(st, null, 0, true, null); },
    vorschauAusklingen: ausklingen,
    vorschauStopp: function () { gehackt = false; loecherWeg(); stoppen(); },
    laeuft: function () { return lauf ? { story: lauf.story, szene: lauf.n, szenen: STORYS[lauf.story].szenen.length, vorschau: lauf.vorschau } : null; },
    istGehackt: function () { return gehackt; },
    /* live-zuschauer.js: ein neues Event beendet den Nachregen. */
    nachregenAus: function () { if (nachregen) { nachregen = false; anzeigen(); } },
    musikUrl: musikUrl,
    STORYS: Object.keys(STORYS),
  };
})();
