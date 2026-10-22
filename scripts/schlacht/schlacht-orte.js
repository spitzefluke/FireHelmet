/* ======================================================
   STERNENSCHLACHT: KAMPFORTE UND START-ANIMATION (V2)
   V2: Tiefe fuer alle Orte, neue Orte pulsar/friedhof/mondring,
   Einflug mit Kamerafahrt, Partei-Formationen und Wappen.
   ---------------------------------------------------
   Reine Optik ohne Spielzustand. Welcher Ort gilt und was er im
   Kampf bewirkt, entscheidet die Datenbank (Migration 55,
   public.schlacht_orte); schlacht.js reicht hier nur die Zeile durch.

   Jeder Ort hat
     - einen ruhenden Hintergrund (einmal je Groesse in eine eigene
       Zeichenflaeche gemalt) und bewegte Teile darueber,
     - ein Ereignis, das zu denselben Zeitpunkten erscheint, an denen
       die Datenbank es abrechnet (alle ereignis_sek ab Rundenbeginn):
         asteroiden      Einschlag        Meteor, Krater-Blitz, Truemmer
         schwarzes_loch  Gezeitenwelle    violetter Ring aus der Mitte
         station         Reaktorleck      gruene Explosion, Lichtboegen
         nebel           Ionenblitz       Blitz von oben, Weissblitz
         sonne           Sonneneruption   Feuerwelle ueber das ganze Feld
         eisring         Eissplitter      Splitterregen auf eine Seite
         wurmloch        (keins)          dafuer laedt das Spezial schneller

   START-ANIMATION (intro): rund 9 Sekunden, jederzeit ueberspringbar
   (Knopf, Klick, Esc, Enter):
     0,0 s  Hyperraumsprung - Sterne ziehen sich zu Lichtstreifen
     1,7 s  Weissblitz, der Ort taucht auf (Zoom), Name und Regeln
     4,4 s  die Flotten springen von links und rechts ein, VS
     6,2 s  Countdown 3 - 2 - 1, "FEUER!"
   Bei "Bewegung reduzieren" nur eine ruhige Ortskarte.

   API (window.fhSchlachtOrte):
     hintergrund(ctx, b, h, jetzt, dpr, ortId, ruhig)
     ereignis(ortId, seite)                  - ein Ereignis ausloesen
     zeichneEreignisse(ctx, b, h, jetzt, hochkant)
     wackeln(jetzt) -> { x, y }              - Erschuetterung
     regeln(ortZeile) -> [Text]              - Regeln als Saetze
     name(ortId), gegend(ortId), ereignisName(ortId)
     intro(buehne, { ortId, ort, menschen, aliens, runde, klang,
                     links, rechts }) -> Promise
       links/rechts: Parteien (Migration 57), Standard menschen/aliens;
       "menschen"/"aliens" bleiben die Slots links/rechts.
     introLaeuft(), introAbbrechen()
     leeren()
     vorschau(ortId)                         - Admin: alle Orte ansehen

   VORSCHAU (Admin, Migration 56): Die Orte kommen erst, wenn der Admin
   sie unter "Live-Event -> Freigaben" freischaltet. Vorher kann er sie
   hier ansehen - Vollbild (#fh-orte-vorschau an body, in den :not-
   Listen von 95 und 96) mit Reitern fuer alle Orte, zwei
   Uebungsflotten, den Regeln, "Einflug abspielen" und "Ereignis
   ausloesen". Reine Anzeige: nichts davon erreicht die Datenbank.
   Die Werte kommen aus public.schlacht_orte; fehlt Migration 55 noch,
   aus STANDARD unten (dieselben Zahlen).
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  /* Name einer Partei (hangar-data.js, Migration 57) */
  function parteiName(p) {
    return typeof schlachtParteiText === "function" ? schlachtParteiText(p, "name") : (p === "aliens" ? t("seiten.aliens.name", "Der Schwarm") : t("seiten.menschen.name", "Die Erdflotte"));
  }
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* Gleichbleibende Zufallszahlen je Ort und Zweck (mulberry32). */
  function zufall(saat) {
    let a = 0;
    for (let i = 0; i < saat.length; i++) a = Math.imul(a ^ saat.charCodeAt(i), 2654435761);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ORTE = ["asteroiden", "schwarzes_loch", "station", "nebel", "sonne", "eisring", "wurmloch"];
  const TEXTE = {
    asteroiden:     ["Kepler-Asteroidengürtel", "Trümmerring eines zerbrochenen Planeten", "Asteroideneinschlag"],
    schwarzes_loch: ["Ereignishorizont Sagitta", "Am Rand eines Schwarzen Lochs", "Gezeitenwelle"],
    station:        ["Wrack der Orbis-Station", "Ruine der größten Raumstation der Menschheit", "Reaktorleck"],
    nebel:          ["Ionennebel von Vesh", "Ein Sturm aus geladenem Gas", "Ionenblitz"],
    sonne:          ["Korona von Helion", "Dicht an einem tobenden Stern", "Sonneneruption"],
    eisring:        ["Eisringe von Kryos", "In den Ringen eines Eisriesen", "Eissplitter"],
    wurmloch:       ["Wurmloch-Schlund Ixion", "Vor dem Tor in eine andere Galaxie", ""],
  };
  function name(id) { return TEXTE[id] ? t("schlacht.ort." + id + ".name", TEXTE[id][0]) : ""; }
  function gegend(id) { return TEXTE[id] ? t("schlacht.ort." + id + ".gegend", TEXTE[id][1]) : ""; }
  function ereignisName(id) { return TEXTE[id] && TEXTE[id][2] ? t("schlacht.ort." + id + ".ereignis", TEXTE[id][2]) : ""; }
  /* V2: drei neue Orte (brauchen Zeilen in public.schlacht_orte) */
  Object.assign(TEXTE, {
    pulsar:   ["Pulsar Vela-9", "Ein toter Stern, der sich rasend schnell dreht", "Strahlenkegel"],
    friedhof: ["Schiffsfriedhof Nekros", "Wracks einer vergessenen Schlacht", "Minenfeld"],
    mondring: ["Ringe von Tethra", "Ein Mond zieht durch den Ring eines Gasriesen", "Mondschatten"],
  });
  ORTE.push("pulsar", "friedhof", "mondring");

  /* "+25 %" / "−30 %" */
  function prozent(f) {
    const p = Math.round((Number(f) - 1) * 100);
    return (p > 0 ? "+" : "−") + Math.abs(p) + " %";
  }

  /* Die Regeln eines Orts als kurze Saetze - nur, was vom Normalwert abweicht. */
  function regeln(o) {
    if (!o) return [];
    const r = [];
    function wenn(feld, key, fallback) {
      if (o[feld] != null && Math.abs(Number(o[feld]) - 1) > 0.001) r.push(t(key, fallback).replace("{p}", prozent(o[feld])));
    }
    wenn("dauerfeuer", "schlacht.regel.dauerfeuer", "Dauerfeuer {p}");
    wenn("ziel", "schlacht.regel.ziel", "Zielschüsse {p}");
    wenn("wendig", "schlacht.regel.wendig", "Jäger, Drohnen & Stachel: Zielschüsse {p}");
    wenn("spezial", "schlacht.regel.spezial", "Spezialschaden {p}");
    wenn("heilung", "schlacht.regel.heilung", "Reparatur {p}");
    wenn("schild", "schlacht.regel.schild", "Schilddauer {p}");
    wenn("laden", "schlacht.regel.laden", "Spezial-Ladezeit {p}");
    if (o.ereignis_sek && Number(o.ereignis_anteil) > 0) {
      r.push(t("schlacht.regel.ereignis", "{e} alle {s} s: −{p} % Leben ({wen})")
        .replace("{e}", ereignisName(o.ort_id))
        .replace("{s}", o.ereignis_sek)
        .replace("{p}", String(Math.round(Number(o.ereignis_anteil) * 1000) / 10).replace(".", t("schlacht.komma", ",")))
        .replace("{wen}", o.ereignis_art === "beide" ? t("schlacht.regel.beide", "beide Flotten") : t("schlacht.regel.abwechselnd", "abwechselnd")));
    }
    return r;
  }

  /* ------------------------------------------------------
     HINTERGRUENDE
  ------------------------------------------------------ */
  /* Ruhende Ebenen je Ort und Groesse - Schlachtfeld und Start-
     Animation laufen gleichzeitig mit verschiedenen Groessen. */
  const ruheCache = new Map();

  function sterne(g, b, h, rnd, n, farbe) {
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.15 + rnd() * 0.6;
      g.fillStyle = farbe || "#dfe8ff";
      const s = rnd() < 0.08 ? 2 : 1.1;
      g.fillRect(rnd() * b, rnd() * h, s, s);
    }
    g.globalAlpha = 1;
  }

  function radial(g, x, y, r, stops) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    return gr;
  }

  function fels(g, x, y, r, w, rnd, hell, dunkel) {
    g.save();
    g.translate(x, y);
    g.rotate(w);
    g.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283, rr = r * (0.72 + rnd() * 0.36);
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = radial(g, -r * 0.35, -r * 0.35, r * 1.4, [[0, hell], [1, dunkel]]);
    g.fill();
    g.fillStyle = "rgba(0,0,0,.22)";
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc((rnd() - 0.5) * r, (rnd() - 0.5) * r, r * (0.1 + rnd() * 0.12), 0, 6.283); g.fill(); }
    g.restore();
  }

  /* Ruhende Teile: einmal je Ort und Groesse. */
  const RUHE = {
    asteroiden: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b * 0.7, h * 0.3, Math.max(b, h), [[0, "#1d1b26"], [1, "#06070c"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 160);
      /* Staubband schraeg durchs Bild */
      for (let i = 0; i < 900; i++) {
        const u = rnd(), v = (rnd() - 0.5) * 0.35;
        g.globalAlpha = 0.04 + rnd() * 0.1;
        g.fillStyle = rnd() < 0.5 ? "#8a6e55" : "#5a4a40";
        g.fillRect(u * b, h * (0.75 - u * 0.5 + v), 2, 2);
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 46; i++) fels(g, rnd() * b, rnd() * h, 2 + rnd() * 6, rnd() * 6, rnd, "#3a3129", "#15110e");
    },
    schwarzes_loch: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b / 2, h / 2, Math.max(b, h) * 0.75, [[0, "#1b0f2c"], [0.5, "#0b0614"], [1, "#030207"]]);
      g.fillRect(0, 0, b, h);
      /* Sterne auf Kreisboegen - das Licht wird um das Loch gelenkt. */
      const cx = b / 2, cy = h / 2;
      for (let i = 0; i < 260; i++) {
        const r = Math.min(b, h) * (0.16 + rnd() * 0.9), a = rnd() * 6.283, l = 0.02 + rnd() * 0.12 / (r / Math.min(b, h) + 0.2);
        g.strokeStyle = "rgba(220,210,255," + (0.08 + rnd() * 0.35) + ")";
        g.lineWidth = rnd() < 0.1 ? 1.6 : 0.8;
        g.beginPath(); g.arc(cx, cy, r, a, a + l); g.stroke();
      }
    },
    station: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b * 0.3, h * 0.2, Math.max(b, h), [[0, "#122033"], [1, "#04070c"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 180);
      /* Der zerbrochene Ring der Orbis-Station, oben rechts angeschnitten */
      const cx = b * 0.86, cy = -h * 0.08, R = Math.min(b, h) * 0.62, D = R * 0.11;
      const stuecke = [[0.35, 1.25], [1.42, 2.05], [2.22, 2.62]];
      stuecke.forEach(function (st) {
        /* Rumpf mit Licht von oben links */
        g.lineWidth = D;
        g.strokeStyle = "#1c2738";
        g.beginPath(); g.arc(cx, cy, R, st[0], st[1]); g.stroke();
        g.lineWidth = D * 0.28;
        g.strokeStyle = "#4b6383";
        g.beginPath(); g.arc(cx, cy, R - D * 0.36, st[0], st[1]); g.stroke();
        /* Paneele */
        g.lineWidth = D * 0.7;
        g.strokeStyle = "rgba(90,120,160,.35)";
        g.setLineDash([D * 0.5, D * 0.35]);
        g.beginPath(); g.arc(cx, cy, R, st[0], st[1]); g.stroke();
        g.setLineDash([]);
        /* Gezackte Bruchkanten */
        [st[0], st[1]].forEach(function (a) {
          g.fillStyle = "#0b111b";
          g.beginPath();
          for (let k = 0; k < 5; k++) {
            const rr = R + (k - 2) * D * 0.25, aa = a + (k % 2 ? 0.02 : -0.02);
            g.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
          }
          g.closePath(); g.fill();
        });
      });
      /* Nabe (die Speichen sind abgerissen) */
      g.fillStyle = radial(g, cx - R * 0.05, cy + R * 0.05, R * 0.2, [[0, "#3a4f6b"], [1, "#121b29"]]);
      g.beginPath(); g.arc(cx, cy, R * 0.17, 0, 6.283); g.fill();
    },
    nebel: function (g, b, h, rnd) {
      g.fillStyle = "#06040d";
      g.fillRect(0, 0, b, h);
      const farben = ["rgba(176,48,122,", "rgba(42,168,160,", "rgba(90,60,192,", "rgba(220,90,140,"];
      for (let i = 0; i < 14; i++) {
        const x = rnd() * b, y = rnd() * h, r = Math.max(b, h) * (0.15 + rnd() * 0.35), f = farben[i % farben.length];
        g.fillStyle = radial(g, x, y, r, [[0, f + (0.14 + rnd() * 0.12) + ")"], [1, f + "0)"]]);
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      sterne(g, b, h, rnd, 140);
    },
    sonne: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b / 2, -h * 0.2, Math.max(b, h) * 1.1, [[0, "#3a1406"], [0.5, "#140603"], [1, "#050202"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 90, "#ffe2c8");
    },
    eisring: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b * 0.8, h * 0.85, Math.max(b, h), [[0, "#0d1d33"], [1, "#02040a"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 200);
      /* Eisriese unten rechts angeschnitten, mit Ring */
      const px = b * 0.93, py = h * 1.12, pr = Math.min(b, h) * 0.48;
      function ring(von, bis, alpha) {
        g.beginPath(); g.ellipse(px, py, pr * 2.1, pr * 0.4, -0.2, von, bis);
        g.lineWidth = pr * 0.14; g.strokeStyle = "rgba(190,225,250," + alpha + ")"; g.stroke();
        g.lineWidth = pr * 0.03; g.strokeStyle = "rgba(240,250,255," + (alpha + 0.1) + ")"; g.stroke();
      }
      ring(Math.PI, 2 * Math.PI, 0.14);
      g.save();
      g.beginPath(); g.arc(px, py, pr, 0, 6.283); g.clip();
      g.fillStyle = radial(g, px - pr * 0.45, py - pr * 0.55, pr * 1.6, [[0, "#d8eef9"], [0.45, "#76a8cb"], [1, "#16304a"]]);
      g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      g.globalAlpha = 0.16;
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 2 ? "#ffffff" : "#24507a";
        g.beginPath(); g.ellipse(px, py - pr + i * pr * 0.26, pr * 1.2, pr * 0.05, -0.2, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
      ring(0, Math.PI, 0.24);
    },
    wurmloch: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b / 2, h / 2, Math.max(b, h) * 0.7, [[0, "#0d0b2a"], [1, "#030210"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 220, "#cdd6ff");
    },
  };

  /* Bewegte Teile. */
  const BEWEGT = {
    asteroiden: function (g, b, h, z, rnd) {
      for (let i = 0; i < 11; i++) {
        const r = Math.min(b, h) * (0.02 + rnd() * 0.045), v = 6 + rnd() * 14;
        const x = ((rnd() * (b + 400) + z * v) % (b + 400)) - 200;
        const y = h * (0.1 + rnd() * 0.8) + Math.sin(z * 0.2 + i) * 6;
        fels(g, x, y, r, z * (0.05 + rnd() * 0.1) * (i % 2 ? 1 : -1), zufall("f" + i), "#7a6553", "#221a14");
      }
    },
    schwarzes_loch: function (g, b, h, z) {
      const cx = b / 2, cy = h / 2, R = Math.min(b, h) * 0.1;
      /* hinterer Teil der Scheibe */
      scheibe(g, cx, cy, R, z, Math.PI, 2 * Math.PI);
      /* gelenkter Bogen ueber dem Loch */
      g.strokeStyle = "rgba(255,190,120,.55)";
      g.lineWidth = R * 0.12;
      g.beginPath(); g.ellipse(cx, cy - R * 0.1, R * 1.25, R * 1.15, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      /* Schatten und Photonenring */
      g.fillStyle = radial(g, cx, cy, R * 1.25, [[0, "#000"], [0.78, "#000"], [0.86, "rgba(255,220,170,.9)"], [1, "rgba(255,160,90,0)"]]);
      g.beginPath(); g.arc(cx, cy, R * 1.25, 0, 6.283); g.fill();
      /* vorderer Teil */
      scheibe(g, cx, cy, R, z, 0, Math.PI);
    },
    station: function (g, b, h, z, rnd) {
      const cx = b * 0.86, cy = -h * 0.08, R = Math.min(b, h) * 0.62;
      /* Positionslichter auf dem Ring */
      for (let i = 0; i < 16; i++) {
        const a = 0.4 + rnd() * 2.2;
        if (Math.sin(z * (2 + rnd() * 3) + i) < 0.75) continue;
        g.fillStyle = i % 3 ? "rgba(255,90,80,.95)" : "rgba(220,240,255,.95)";
        g.beginPath(); g.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 2.4, 0, 6.283); g.fill();
      }
      /* Truemmer treiben vorbei */
      for (let i = 0; i < 9; i++) {
        const v = 5 + rnd() * 10, w = 16 + rnd() * 40, hh = 4 + rnd() * 10;
        const x = ((rnd() * (b + 300) + z * v) % (b + 300)) - 150, y = h * (0.2 + rnd() * 0.75);
        g.save(); g.translate(x, y); g.rotate(z * 0.08 * (i % 2 ? 1 : -1) + i);
        g.fillStyle = "#2a3647"; g.fillRect(-w / 2, -hh / 2, w, hh);
        g.strokeStyle = "#47607e"; g.lineWidth = 1; g.strokeRect(-w / 2, -hh / 2, w, hh);
        g.restore();
      }
      /* Funken an den Bruchkanten */
      [1.25, 1.42, 2.05].forEach(function (a, j) {
        const bx = cx + Math.cos(a) * R, by = cy + Math.sin(a) * R;
        for (let i = 0; i < 7; i++) {
          const p = (z * (1.1 + j * 0.3) + i / 7) % 1;
          g.fillStyle = "rgba(255," + Math.round(170 + 60 * (1 - p)) + ",110," + (1 - p) + ")";
          g.fillRect(bx + p * 26 * Math.cos(i * 1.7 + j), by + p * 34 * Math.abs(Math.sin(i * 1.3 + j)), 2, 2);
        }
      });
    },
    nebel: function (g, b, h, z, rnd) {
      for (let i = 0; i < 3; i++) {
        const x = b * (0.2 + 0.3 * i) + Math.sin(z * 0.05 + i * 2) * b * 0.08, y = h * (0.3 + 0.2 * i) + Math.cos(z * 0.04 + i) * h * 0.06;
        const r = Math.max(b, h) * 0.3;
        const f = i === 1 ? "rgba(42,168,160," : "rgba(176,48,122,";
        g.fillStyle = radial(g, x, y, r, [[0, f + "0.10)"], [1, f + "0)"]]);
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      /* Wetterleuchten im Nebel */
      const takt = Math.floor(z / 2.3), phase = z / 2.3 - takt;
      if (phase < 0.12) {
        const r2 = zufall("l" + takt);
        const x = r2() * b, y = r2() * h, r = Math.max(b, h) * 0.25;
        g.fillStyle = radial(g, x, y, r, [[0, "rgba(200,220,255," + (0.18 * (1 - phase / 0.12)) + ")"], [1, "rgba(200,220,255,0)"]]);
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    sonne: function (g, b, h, z) {
      const cx = b / 2, cy = -h * 0.42, R = Math.max(b * 0.5, h * 0.62);
      const puls = 1 + Math.sin(z * 0.8) * 0.015;
      g.fillStyle = radial(g, cx, cy, R * 1.5 * puls, [[0, "rgba(255,250,225,.95)"], [0.48, "rgba(255,206,110,.9)"], [0.6, "rgba(255,140,40,.55)"], [0.8, "rgba(255,90,20,.15)"], [1, "rgba(255,60,10,0)"]]);
      g.fillRect(0, 0, b, Math.min(h, cy + R * 1.5));
      /* Flammenfahnen vom Sternrand */
      for (let i = 0; i < 6; i++) {
        const fx = b * (0.08 + i * 0.17), p = (Math.sin(z * 0.6 + i * 1.9) + 1) / 2;
        const lang = h * (0.12 + p * 0.16), rr = Math.max(40, b * 0.06);
        g.fillStyle = radial(g, fx, 0, lang, [[0, "rgba(255,200,110," + (0.22 + p * 0.25) + ")"], [0.6, "rgba(255,120,40," + (0.08 + p * 0.1) + ")"], [1, "rgba(255,80,20,0)"]]);
        g.beginPath(); g.ellipse(fx, 0, rr, lang, 0, 0, Math.PI); g.fill();
      }
      /* Glut treibt herab */
      for (let i = 0; i < 26; i++) {
        const r = zufall("g" + i), x = r() * b, v = 10 + r() * 20;
        const y = (r() * h + z * v) % h;
        g.fillStyle = "rgba(255," + Math.round(120 + r() * 100) + ",60," + (0.25 + r() * 0.4) + ")";
        g.fillRect(x, y, 2, 2);
      }
    },
    eisring: function (g, b, h, z) {
      for (let i = 0; i < 40; i++) {
        const r = zufall("k" + i), x = (r() * b + z * (3 + r() * 6)) % b, y = r() * h;
        const fun = (Math.sin(z * (1 + r() * 2) + i) + 1) / 2;
        g.fillStyle = "rgba(220,240,255," + (0.15 + fun * 0.7) + ")";
        const s = 1.5 + fun * 2.5;
        g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.5, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.5, y); g.closePath(); g.fill();
      }
    },
    wurmloch: function (g, b, h, z) {
      const cx = b / 2, cy = h / 2, R = Math.min(b, h) * 0.32;
      for (let i = 12; i >= 1; i--) {
        const f = i / 12;
        g.strokeStyle = "hsla(" + (230 + f * 60) + ",90%," + (40 + (1 - f) * 40) + "%," + (0.12 + (1 - f) * 0.3) + ")";
        g.lineWidth = 2 + (1 - f) * 3;
        g.beginPath();
        g.ellipse(cx, cy, R * f, R * f * 0.55, z * 0.25 * (i % 2 ? 1 : -1) + i, 0, 5.2);
        g.stroke();
      }
      g.fillStyle = radial(g, cx, cy, R * 0.35, [[0, "rgba(240,240,255,.9)"], [0.4, "rgba(150,140,255,.5)"], [1, "rgba(80,60,200,0)"]]);
      g.beginPath(); g.arc(cx, cy, R * 0.35, 0, 6.283); g.fill();
      /* Lichtstreifen werden eingesogen */
      for (let i = 0; i < 24; i++) {
        const r = zufall("w" + i), a = r() * 6.283 + z * 0.3, p = 1 - ((z * (0.15 + r() * 0.2) + r()) % 1);
        const d = R * (0.4 + p * 2.2);
        g.strokeStyle = "rgba(190,200,255," + (0.5 * (1 - p)) + ")";
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.55);
        g.lineTo(cx + Math.cos(a + 0.12) * (d - 18), cy + Math.sin(a + 0.12) * (d - 18) * 0.55);
        g.stroke();
      }
    },
  };

  /* ======================================================
     V2: MEHR TIEFE FUER ALLE ORTE + DREI NEUE ORTE
  ====================================================== */
  function wolke(g, x, y, r, farbe, a) {
    g.fillStyle = radial(g, x, y, r, [[0, farbe + a + ")"], [1, farbe + "0)"]]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function kugel(g, x, y, r, stops, atmo) {
    if (atmo) {
      g.fillStyle = radial(g, x, y, r * 1.18, [[0.8, atmo + "0)"], [0.86, atmo + "0.5)"], [1, atmo + "0)"]]);
      g.beginPath(); g.arc(x, y, r * 1.18, 0, 6.283); g.fill();
    }
    g.fillStyle = radial(g, x - r * 0.4, y - r * 0.45, r * 1.6, stops);
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
  function vignette(g, b, h, st) {
    g.fillStyle = radial(g, b / 2, h / 2, Math.max(b, h) * 0.72, [[0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0," + (st || 0.55) + ")"]]);
    g.fillRect(0, 0, b, h);
  }
  function wrack(g, x, y, l, w, rot, rnd) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    g.moveTo(l * .5, 0); g.lineTo(l * .3, -w); g.lineTo(-l * .3, -w); g.lineTo(-l * .34, -w * .4);
    g.lineTo(-l * .28, -w * .1); g.lineTo(-l * .38, w * .3); g.lineTo(-l * .32, w); g.lineTo(l * .3, w); g.closePath();
    const gr = g.createLinearGradient(0, -w, 0, w); gr.addColorStop(0, "#22302b"); gr.addColorStop(1, "#070b0a");
    g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(150,210,180,.28)"; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 2;
    for (let k = -l * .25; k < l * .28; k += l * .06) { g.beginPath(); g.moveTo(k, -w); g.lineTo(k, w); g.stroke(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = "rgba(160,255,200," + (.15 + rnd() * .35) + ")"; g.fillRect(-l * .25 + rnd() * l * .5, (rnd() - .5) * w * 1.4, 2, 2); }
    g.restore();
  }

  /* Zusaetzliche ruhende Ebenen fuer die sieben bisherigen Orte. */
  const PLUS = {
    asteroiden: function (g, b, h, rnd) {
      const M = Math.max(b, h), m = Math.min(b, h);
      wolke(g, b * .75, h * .3, M * .5, "rgba(180,110,60,", .12);
      wolke(g, b * .2, h * .8, M * .4, "rgba(90,60,140,", .1);
      kugel(g, b * .16, h * .2, m * .09, [[0, "#c98a5a"], [.5, "#6a3a22"], [1, "#120806"]], "rgba(255,170,110,");
      fels(g, b * .03, h * .98, m * .17, .4, rnd, "#2a221c", "#08060a");
      fels(g, b * .98, h * .04, m * .12, 1.2, rnd, "#2a221c", "#08060a");
      g.strokeStyle = "rgba(255,190,140,.3)"; g.lineWidth = 2;
      g.beginPath(); g.arc(b * .03, h * .98, m * .16, -1.4, -.3); g.stroke();
      vignette(g, b, h, .5);
    },
    schwarzes_loch: function (g, b, h) {
      const M = Math.max(b, h), m = Math.min(b, h);
      wolke(g, b * .28, h * .32, M * .5, "rgba(140,60,200,", .16);
      wolke(g, b * .74, h * .7, M * .45, "rgba(255,120,60,", .08);
      g.fillStyle = radial(g, b / 2, h / 2, m * .32, [[.55, "rgba(255,200,150,0)"], [.78, "rgba(255,200,150,.07)"], [1, "rgba(255,200,150,0)"]]);
      g.fillRect(0, 0, b, h);
      vignette(g, b, h, .6);
    },
    station: function (g, b, h) {
      const m = Math.min(b, h);
      kugel(g, b * .1, h * 1.32, m * .78, [[0, "#8cc4f0"], [.35, "#2c5f9a"], [.75, "#0b1f3a"], [1, "#040a14"]], "rgba(120,190,255,");
      wolke(g, b * .4, h * .3, Math.max(b, h) * .4, "rgba(60,120,200,", .08);
      vignette(g, b, h, .5);
    },
    nebel: function (g, b, h, rnd) {
      const M = Math.max(b, h);
      for (let i = 0; i < 10; i++) wolke(g, rnd() * b, rnd() * h, M * (.06 + rnd() * .1), i % 2 ? "rgba(255,110,190," : "rgba(80,230,210,", .16 + rnd() * .1);
      for (let i = 0; i < 4; i++) wolke(g, rnd() * b, rnd() * h, M * (.12 + rnd() * .12), "rgba(0,0,0,", .45);
      vignette(g, b, h, .5);
    },
    sonne: function (g, b, h) {
      const m = Math.min(b, h);
      wolke(g, b * .5, h * 1.1, Math.max(b, h) * .6, "rgba(140,30,10,", .22);
      g.fillStyle = "#070302"; g.beginPath(); g.arc(b * .84, h * .72, m * .07, 0, 6.283); g.fill();
      g.strokeStyle = "rgba(255,170,90,.55)"; g.lineWidth = 2; g.beginPath(); g.arc(b * .84, h * .72, m * .07, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
      vignette(g, b, h, .45);
    },
    eisring: function (g, b, h) {
      const m = Math.min(b, h);
      kugel(g, b * .18, h * .22, m * .06, [[0, "#f4fbff"], [.5, "#8fb6d0"], [1, "#102030"]], "rgba(200,235,255,");
      wolke(g, b * .9, h * .62, Math.max(b, h) * .3, "rgba(90,255,200,", .07);
      wolke(g, b * .3, h * .5, Math.max(b, h) * .45, "rgba(60,110,200,", .07);
      vignette(g, b, h, .5);
    },
    wurmloch: function (g, b, h, rnd) {
      const gx = b * .16, gy = h * .24, R = Math.min(b, h) * .12;
      wolke(g, gx, gy, R * 1.6, "rgba(200,190,255,", .14);
      for (let i = 0; i < 360; i++) {
        const arm = i % 2, tt = i / 360 * 9, a = tt + arm * Math.PI, rr = R * (tt / 9) + (rnd() - .5) * R * .12;
        g.fillStyle = "rgba(220,215,255," + (.15 + rnd() * .4) + ")";
        g.fillRect(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * .45, 1.2, 1.2);
      }
      wolke(g, b * .78, h * .76, Math.max(b, h) * .4, "rgba(120,80,255,", .09);
      vignette(g, b, h, .55);
    },
  };
  Object.keys(PLUS).forEach(function (id) {
    const alt = RUHE[id];
    RUHE[id] = function (g, b, h, rnd) { alt(g, b, h, rnd); PLUS[id](g, b, h, zufall("plus-" + id)); };
  });

  Object.assign(RUHE, {
    pulsar: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b * .5, h * .45, Math.max(b, h) * .8, [[0, "#0c1430"], [.6, "#050818"], [1, "#020309"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 220, "#d6e6ff");
      const cx = b * .5, cy = h * .45, R = Math.min(b, h) * .42;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * 6.283, rr = R * (.8 + rnd() * .4);
        wolke(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8, R * (.08 + rnd() * .14), i % 3 ? "rgba(80,200,255," : "rgba(230,90,200,", .05 + rnd() * .07);
      }
      vignette(g, b, h, .5);
    },
    friedhof: function (g, b, h, rnd) {
      const M = Math.max(b, h), m = Math.min(b, h);
      g.fillStyle = radial(g, b * .6, h * .3, M, [[0, "#13201c"], [1, "#030605"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 150, "#d4eadf");
      wolke(g, b * .7, h * .35, M * .45, "rgba(70,140,110,", .1);
      wolke(g, b * .15, h * .8, M * .35, "rgba(60,90,120,", .1);
      wrack(g, b * .76, h * .2, m * 1.0, m * .09, -.22, rnd);
      wrack(g, b * .14, h * .86, m * .62, m * .06, .35, rnd);
      for (let i = 0; i < 70; i++) {
        g.globalAlpha = .3 + rnd() * .5; g.fillStyle = rnd() < .5 ? "#24332e" : "#3a4a44";
        g.fillRect(rnd() * b, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2);
      }
      g.globalAlpha = 1;
      vignette(g, b, h, .55);
    },
    mondring: function (g, b, h, rnd) {
      g.fillStyle = radial(g, b * .3, h * .2, Math.max(b, h), [[0, "#1a1428"], [1, "#04030a"]]);
      g.fillRect(0, 0, b, h);
      sterne(g, b, h, rnd, 190, "#fff0dc");
      wolke(g, b * .2, h * .3, Math.max(b, h) * .4, "rgba(150,90,170,", .1);
      const px = b * .72, py = h * 1.05, pr = Math.min(b, h) * .55, tilt = -.16;
      function ring(von, bis) {
        for (let k = 0; k < 22; k++) {
          const f = 1.3 + k * .04;
          g.beginPath(); g.ellipse(px, py, pr * f, pr * f * .24, tilt, von, bis);
          g.lineWidth = pr * .03;
          g.strokeStyle = "rgba(" + (k % 3 ? "235,205,160," : "200,160,120,") + (.05 + (k % 5) * .025) + ")";
          g.stroke();
        }
      }
      ring(Math.PI, 2 * Math.PI);
      kugel(g, px, py, pr, [[0, "#f4dcaa"], [.35, "#c48c52"], [.75, "#5a3420"], [1, "#140a06"]], "rgba(255,210,150,");
      g.save();
      g.beginPath(); g.arc(px, py, pr, 0, 6.283); g.clip();
      g.globalAlpha = .14;
      for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? "#fff2d8" : "#6a3a1e"; g.beginPath(); g.ellipse(px, py - pr + i * pr * .2, pr * 1.3, pr * .045, tilt, 0, 6.283); g.fill(); }
      g.globalAlpha = .4; g.fillStyle = "#0a0604";
      g.beginPath(); g.ellipse(px, py - pr * .1, pr * 1.4, pr * .06, tilt, 0, 6.283); g.fill();
      g.restore();
      ring(0, Math.PI);
      vignette(g, b, h, .5);
    },
  });

  Object.assign(BEWEGT, {
    pulsar: function (g, b, h, z) {
      const cx = b * .5, cy = h * .45, L = Math.hypot(b, h), w = z * .9;
      g.save();
      g.globalCompositeOperation = "lighter";
      [0, Math.PI].forEach(function (off) {
        const a = w + off;
        const gr = g.createLinearGradient(cx, cy, cx + Math.cos(a) * L * .6, cy + Math.sin(a) * L * .33);
        gr.addColorStop(0, "rgba(220,245,255,.55)"); gr.addColorStop(.4, "rgba(120,200,255,.16)"); gr.addColorStop(1, "rgba(80,160,255,0)");
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - .06) * L, cy + Math.sin(a - .06) * L * .55);
        g.lineTo(cx + Math.cos(a + .06) * L, cy + Math.sin(a + .06) * L * .55);
        g.closePath(); g.fill();
      });
      g.strokeStyle = "rgba(140,200,255,.12)"; g.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { g.beginPath(); g.ellipse(cx, cy, 30 * k, 12 * k, w * .15, 0, 6.283); g.stroke(); }
      const puls = .8 + .2 * Math.sin(z * 30);
      g.fillStyle = radial(g, cx, cy, 60, [[0, "rgba(255,255,255," + puls + ")"], [.15, "rgba(180,230,255,.8)"], [1, "rgba(80,160,255,0)"]]);
      g.beginPath(); g.arc(cx, cy, 60, 0, 6.283); g.fill();
      g.restore();
    },
    friedhof: function (g, b, h, z, rnd) {
      for (let i = 0; i < 8; i++) {
        const v = 4 + rnd() * 8, w = 20 + rnd() * 50, hh = 5 + rnd() * 12;
        const x = ((rnd() * (b + 300) + z * v) % (b + 300)) - 150, y = h * (.15 + rnd() * .75);
        g.save(); g.translate(x, y); g.rotate(z * .06 * (i % 2 ? 1 : -1) + i);
        g.fillStyle = "#1a2622"; g.fillRect(-w / 2, -hh / 2, w, hh);
        g.strokeStyle = "rgba(140,200,170,.35)"; g.lineWidth = 1; g.strokeRect(-w / 2, -hh / 2, w, hh);
        g.restore();
      }
      for (let i = 0; i < 9; i++) {
        const x = b * (.08 + rnd() * .84) + Math.sin(z * .2 + i) * 14, y = h * (.1 + rnd() * .8) + Math.cos(z * .17 + i) * 10;
        g.fillStyle = "#2a2f2e"; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
        g.strokeStyle = "#4a5552"; g.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          const a = k * 1.047 + z * .3;
          g.beginPath(); g.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke();
        }
        if (Math.sin(z * 3 + i * 1.7) > .7) {
          g.fillStyle = radial(g, x, y, 14, [[0, "rgba(255,80,60,.95)"], [1, "rgba(255,40,30,0)"]]);
          g.beginPath(); g.arc(x, y, 14, 0, 6.283); g.fill();
        }
      }
      const tk = Math.floor(z / 1.7), ph = z / 1.7 - tk;
      if (ph < .18) {
        const r2 = zufall("fu" + tk), x = b * (.6 + r2() * .3), y = h * (.12 + r2() * .2);
        g.fillStyle = radial(g, x, y, 40, [[0, "rgba(200,255,220," + (.8 * (1 - ph / .18)) + ")"], [1, "rgba(100,200,160,0)"]]);
        g.beginPath(); g.arc(x, y, 40, 0, 6.283); g.fill();
      }
    },
    mondring: function (g, b, h, z) {
      const m = Math.min(b, h), q = (z % 90) / 90, mx = b * (-.1 + q * 1.2), my = h * .2 - Math.sin(q * 3.14) * h * .05, mr = m * .065;
      g.fillStyle = radial(g, mx + b * .04, h * .8, m * .24, [[0, "rgba(0,0,0,.55)"], [1, "rgba(0,0,0,0)"]]);
      g.beginPath(); g.ellipse(mx + b * .04, h * .8, m * .24, m * .1, -.1, 0, 6.283); g.fill();
      kugel(g, mx, my, mr, [[0, "#e8e4dc"], [.5, "#8a857c"], [1, "#1a1814"]]);
      g.fillStyle = "rgba(0,0,0,.18)";
      [[-.3, -.2, .18], [.25, .1, .14], [-.05, .35, .1]].forEach(function (k) { g.beginPath(); g.arc(mx + k[0] * mr, my + k[1] * mr, k[2] * mr, 0, 6.283); g.fill(); });
      const px = b * .72, py = h * 1.05, pr = m * .55;
      for (let i = 0; i < 34; i++) {
        const r = zufall("rg" + i), a = Math.PI + r() * Math.PI, f = 1.3 + r() * .85, fun = (Math.sin(z * (1 + r() * 2) + i) + 1) / 2;
        const x = px + Math.cos(a) * pr * f, y = py + Math.sin(a) * pr * f * .24 - (x - px) * .16;
        if (y < 0 || y > h) continue;
        g.fillStyle = "rgba(255,240,210," + (fun * .7) + ")"; g.fillRect(x, y, 2, 2);
      }
    },
  });

  /* Vordergrund-Staub fuer jeden Ort - die Kamera wirkt tiefer. */
  const STAUB = {
    asteroiden: "255,200,150", schwarzes_loch: "220,180,255", station: "180,210,255", nebel: "255,170,220",
    sonne: "255,190,110", eisring: "220,240,255", wurmloch: "190,200,255", pulsar: "170,230,255",
    friedhof: "190,230,200", mondring: "255,230,190",
  };
  function staub(g, b, h, z, id) {
    const f = STAUB[id] || "220,230,255";
    for (let i = 0; i < 22; i++) {
      const r = zufall("mo" + i), gross = i % 7 === 0, v = gross ? 22 + r() * 14 : 6 + r() * 12;
      const x = ((r() * (b + 200) + z * v) % (b + 200)) - 100, y = r() * h + Math.sin(z * .3 + i) * 8;
      if (gross) {
        const rr = 10 + r() * 16;
        g.fillStyle = radial(g, x, y, rr, [[0, "rgba(" + f + ",.07)"], [1, "rgba(" + f + ",0)"]]);
        g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
      } else {
        g.fillStyle = "rgba(" + f + "," + (.15 + r() * .35) + ")"; g.fillRect(x, y, 1.4, 1.4);
      }
    }
  }
  Object.keys(BEWEGT).forEach(function (id) {
    const alt = BEWEGT[id];
    BEWEGT[id] = function (g, b, h, z, rnd) { alt(g, b, h, z, rnd); staub(g, b, h, z, id); };
  });

  function scheibe(g, cx, cy, R, z, von, bis) {
    /* Grundglut durchgehend, darueber wandernde helle Schlieren */
    for (let i = 0; i < 6; i++) {
      const f = 1.3 + i * 0.2;
      g.strokeStyle = "rgba(255," + (205 - i * 20) + "," + (150 - i * 18) + "," + (0.42 - i * 0.055) + ")";
      g.lineWidth = R * 0.2;
      g.beginPath(); g.ellipse(cx, cy, R * f, R * f * 0.26, -0.12, von, bis); g.stroke();
      g.strokeStyle = "rgba(255,245,220," + (0.35 - i * 0.05) + ")";
      g.lineWidth = R * 0.05;
      g.setLineDash([R * 0.9, R * 0.6]);
      g.lineDashOffset = -z * R * (1.4 - i * 0.15);
      g.beginPath(); g.ellipse(cx, cy, R * f, R * f * 0.26, -0.12, von, bis); g.stroke();
      g.setLineDash([]);
    }
  }

  function hintergrund(ctx, b, h, jetzt, dpr, ortId, ruhig) {
    if (!RUHE[ortId]) return false;
    const schluessel = ortId + ":" + Math.round(b) + "x" + Math.round(h) + "@" + dpr;
    let f = ruheCache.get(schluessel);
    if (!f) {
      f = document.createElement("canvas");
      f.width = Math.max(1, Math.round(b * dpr));
      f.height = Math.max(1, Math.round(h * dpr));
      const g = f.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      RUHE[ortId](g, b, h, zufall("ruhe-" + ortId));
      ruheCache.set(schluessel, f);
      if (ruheCache.size > 24) ruheCache.delete(ruheCache.keys().next().value);
    }
    /* In der aktuellen Transformation - so wirkt auch der Zoom der
       Start-Animation. */
    ctx.drawImage(f, 0, 0, b, h);
    const z = ruhig ? 0 : jetzt / 1000;
    ctx.save();
    BEWEGT[ortId](ctx, b, h, z, zufall("bewegt-" + ortId));
    ctx.restore();
    return true;
  }

  /* ------------------------------------------------------
     EREIGNISSE
  ------------------------------------------------------ */
  let ereignisse = [];
  let wackelBis = 0, wackelStark = 0;
  const DAUER = { asteroiden: 1300, schwarzes_loch: 1600, station: 1200, nebel: 900, sonne: 1700, eisring: 1300, pulsar: 1300, friedhof: 1500, mondring: 1700 };

  function ereignis(ortId, seite) {
    if (!DAUER[ortId]) return;
    const jetzt = performance.now();
    ereignisse.push({ ort: ortId, seite: seite, t0: jetzt, r: zufall("e" + jetzt) });
    if (ereignisse.length > 8) ereignisse.shift();
    if (!RUHIG.matches) { wackelBis = jetzt + 600; wackelStark = ortId === "sonne" || ortId === "schwarzes_loch" ? 7 : 5; }
  }

  function wackeln(jetzt) {
    if (jetzt >= wackelBis) return { x: 0, y: 0 };
    const k = (wackelBis - jetzt) / 600 * wackelStark;
    return { x: Math.sin(jetzt * 0.09) * k, y: Math.cos(jetzt * 0.11) * k };
  }

  function mitte(seite, b, h, hoch) {
    if (hoch) return { x: b / 2, y: seite === "menschen" ? h * 0.75 : h * 0.25 };
    return { x: seite === "menschen" ? b * 0.25 : b * 0.75, y: h / 2 };
  }

  function blitzLinie(g, x0, y0, x1, y1, r, breite) {
    g.beginPath();
    g.moveTo(x0, y0);
    const n = 9;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      g.lineTo(x0 + (x1 - x0) * f + (r() - 0.5) * 60, y0 + (y1 - y0) * f + (r() - 0.5) * 30);
    }
    g.lineTo(x1, y1);
    g.lineWidth = breite;
    g.stroke();
  }

  function zeichneEreignisse(g, b, h, jetzt, hoch) {
    ereignisse = ereignisse.filter(function (e) { return jetzt - e.t0 < DAUER[e.ort]; });
    ereignisse.forEach(function (e) {
      /* rAF-Zeitstempel koennen vor dem Ausloesezeitpunkt liegen. */
      const p = Math.max(0, (jetzt - e.t0) / DAUER[e.ort]);
      const m = mitte(e.seite, b, h, hoch);
      g.save();
      if (e.ort === "asteroiden") {
        /* Meteor fliegt 45 % der Zeit, dann Einschlag */
        const sx = m.x + (e.seite === "menschen" ? -b * 0.15 : b * 0.15), sy = -40;
        if (p < 0.45) {
          const q = p / 0.45, x = sx + (m.x - sx) * q, y = sy + (m.y - sy) * q;
          g.strokeStyle = "rgba(255,190,120,.8)"; g.lineWidth = 4;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - (m.x - sx) * 0.25, y - (m.y - sy) * 0.25); g.stroke();
          fels(g, x, y, 14, q * 6, zufall("met"), "#9a8068", "#2a2018");
        } else {
          const q = (p - 0.45) / 0.55, r = 60 + q * 220;
          if (q < 0.15) { g.fillStyle = "rgba(255,235,200," + (0.35 * (1 - q / 0.15)) + ")"; g.fillRect(0, 0, b, h); }
          g.fillStyle = radial(g, m.x, m.y, r, [[0, "rgba(255,250,230," + (1 - q) + ")"], [0.25, "rgba(255,190,90," + (0.9 * (1 - q)) + ")"], [0.6, "rgba(220,90,30," + (0.5 * (1 - q)) + ")"], [1, "rgba(120,40,10,0)"]]);
          g.beginPath(); g.arc(m.x, m.y, r, 0, 6.283); g.fill();
          g.strokeStyle = "rgba(255,220,170," + (0.9 * (1 - q)) + ")";
          g.lineWidth = 6 * (1 - q) + 1;
          g.beginPath(); g.arc(m.x, m.y, 30 + q * 300, 0, 6.283); g.stroke();
          for (let i = 0; i < 22; i++) {
            const a = (i / 22) * 6.283 + i, d = q * (140 + (i % 5) * 40);
            fels(g, m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 3 + (i % 4) * 1.6, q * 8 + i, zufall("t" + i), "#a88a70", "#2a2018");
          }
        }
      } else if (e.ort === "schwarzes_loch") {
        const cx = b / 2, cy = h / 2, r = p * Math.max(b, h) * 0.75;
        g.strokeStyle = "rgba(190,120,255," + (0.8 * (1 - p)) + ")";
        g.lineWidth = 14 * (1 - p) + 2;
        g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
        g.strokeStyle = "rgba(255,200,255," + (0.5 * (1 - p)) + ")";
        g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, r * 0.92, 0, 6.283); g.stroke();
      } else if (e.ort === "station") {
        const q = Math.min(1, p * 1.4);
        g.fillStyle = radial(g, m.x, m.y, 30 + q * 150, [[0, "rgba(230,255,170," + (1 - p) + ")"], [0.5, "rgba(120,220,80," + (0.6 * (1 - p)) + ")"], [1, "rgba(40,120,40,0)"]]);
        g.beginPath(); g.arc(m.x, m.y, 30 + q * 150, 0, 6.283); g.fill();
        g.strokeStyle = "rgba(200,255,140," + (1 - p) + ")";
        for (let i = 0; i < 4; i++) {
          const a = e.r() * 6.283;
          blitzLinie(g, m.x, m.y, m.x + Math.cos(a) * 140, m.y + Math.sin(a) * 140, e.r, 1.6);
        }
      } else if (e.ort === "nebel") {
        if (p < 0.15) { g.fillStyle = "rgba(225,235,255," + (0.5 * (1 - p / 0.15)) + ")"; g.fillRect(0, 0, b, h); }
        const r = zufall("b" + e.t0), x0 = m.x + (r() - 0.5) * 160;
        const flacker = p < 0.5 ? (Math.floor(p * 20) % 2 ? 1 : 0.55) : 1 - (p - 0.5) * 2;
        g.shadowColor = "rgba(140,190,255,1)";
        g.shadowBlur = 22;
        g.strokeStyle = "rgba(235,245,255," + flacker + ")";
        blitzLinie(g, x0, 0, m.x, m.y, zufall("b" + e.t0), 5);
        g.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const ab = zufall("a" + e.t0 + k), y = m.y * (0.3 + ab() * 0.4), x = x0 + (m.x - x0) * (y / m.y);
          blitzLinie(g, x, y, x + (ab() - 0.5) * 220, y + 60 + ab() * 90, ab, 1.6);
        }
        g.shadowBlur = 0;
        g.fillStyle = radial(g, m.x, m.y, 130, [[0, "rgba(235,245,255," + (0.95 * flacker) + ")"], [0.4, "rgba(150,190,255," + (0.5 * flacker) + ")"], [1, "rgba(80,120,255,0)"]]);
        g.beginPath(); g.arc(m.x, m.y, 130, 0, 6.283); g.fill();
      } else if (e.ort === "sonne") {
        /* Weiche Feuerfront von oben ueber das ganze Feld */
        const y = p * (h + 400) - 200, band = h * 0.35;
        const gr = g.createLinearGradient(0, y - band, 0, y + band * 0.4);
        gr.addColorStop(0, "rgba(255,90,20,0)");
        gr.addColorStop(0.55, "rgba(255,140,40," + (0.35 * (1 - p * 0.5)) + ")");
        gr.addColorStop(0.8, "rgba(255,225,160," + (0.5 * (1 - p * 0.5)) + ")");
        gr.addColorStop(1, "rgba(255,240,200,0)");
        g.fillStyle = gr;
        g.fillRect(0, y - band, b, band * 1.4);
        g.fillStyle = "rgba(255,120,40," + (0.14 * Math.sin(p * Math.PI)) + ")";
        g.fillRect(0, 0, b, h);
      } else if (e.ort === "pulsar") {
        const cx = b * .5, cy = h * .45, a = Math.atan2(m.y - cy, m.x - cx) + (p - .5) * 1.1, L = Math.hypot(b, h), st = Math.sin(p * Math.PI);
        g.globalCompositeOperation = "lighter";
        const gr = g.createLinearGradient(cx, cy, cx + Math.cos(a) * L * .7, cy + Math.sin(a) * L * .7);
        gr.addColorStop(0, "rgba(255,255,255," + .9 * st + ")"); gr.addColorStop(.5, "rgba(140,210,255," + .5 * st + ")"); gr.addColorStop(1, "rgba(80,160,255,0)");
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - .14) * L, cy + Math.sin(a - .14) * L);
        g.lineTo(cx + Math.cos(a + .14) * L, cy + Math.sin(a + .14) * L);
        g.closePath(); g.fill();
        g.fillStyle = radial(g, m.x, m.y, Math.max(b, h) * .3, [[0, "rgba(220,240,255," + .35 * st + ")"], [1, "rgba(120,180,255,0)"]]);
        g.fillRect(0, 0, b, h);
      } else if (e.ort === "friedhof") {
        for (let i = 0; i < 7; i++) {
          const r = zufall("mine" + e.t0 + i), x = m.x + (r() - .5) * b * .3, y = m.y + (r() - .5) * h * .5, d = .12 + i * .08;
          if (p < d) {
            g.fillStyle = Math.floor(p * 30) % 2 ? "rgba(255,70,60,1)" : "rgba(120,20,20,1)";
            g.beginPath(); g.arc(x, y, 4, 0, 6.283); g.fill();
            g.strokeStyle = "rgba(255,90,70,.6)"; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 10, 0, 6.283); g.stroke();
          } else {
            const q = Math.min(1, (p - d) / .4);
            if (q >= 1) continue;
            const rr = 20 + q * 90;
            g.fillStyle = radial(g, x, y, rr, [[0, "rgba(255,245,210," + (1 - q) + ")"], [.35, "rgba(255,150,60," + .8 * (1 - q) + ")"], [1, "rgba(160,40,10,0)"]]);
            g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill();
            g.strokeStyle = "rgba(255,200,140," + (1 - q) + ")"; g.lineWidth = 3 * (1 - q) + .5;
            g.beginPath(); g.arc(x, y, rr * 1.3, 0, 6.283); g.stroke();
          }
        }
      } else if (e.ort === "mondring") {
        const st = Math.sin(p * Math.PI), rr = Math.max(b, h) * (.25 + p * .35);
        g.fillStyle = radial(g, m.x, m.y, rr, [[0, "rgba(2,3,10," + .75 * st + ")"], [.7, "rgba(4,6,18," + .55 * st + ")"], [1, "rgba(4,6,18,0)"]]);
        g.fillRect(0, 0, b, h);
        g.strokeStyle = "rgba(150,190,255," + .6 * st + ")"; g.lineWidth = 2;
        g.beginPath(); g.arc(m.x, m.y, rr * .92, 0, 6.283); g.stroke();
        for (let i = 0; i < 14; i++) {
          const r = zufall("eis" + e.t0 + i), q = (p * 1.4 + r() * .4) % 1, x = m.x + (r() - .5) * 260, y = m.y - 220 + q * 360;
          g.fillStyle = "rgba(240,220,190," + (1 - q) + ")"; g.fillRect(x, y, 3, 3);
        }
      } else if (e.ort === "eisring") {
        for (let i = 0; i < 22; i++) {
          const r = zufall("s" + e.t0 + i), d = r() * 0.4;
          const q = Math.max(0, Math.min(1, (p - d) / 0.55));
          if (q <= 0 || q >= 1) continue;
          const x0 = m.x + (r() - 0.5) * 220 - 120, y0 = m.y - 260;
          const x = x0 + q * 120, y = y0 + q * (260 + (r() - 0.5) * 80);
          g.strokeStyle = "rgba(210,240,255," + (1 - q * 0.6) + ")";
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10, y - 22); g.stroke();
        }
        if (p > 0.45) {
          const q = (p - 0.45) / 0.55;
          g.fillStyle = radial(g, m.x, m.y, 120, [[0, "rgba(220,245,255," + (0.5 * (1 - q)) + ")"], [1, "rgba(150,200,255,0)"]]);
          g.beginPath(); g.arc(m.x, m.y, 120, 0, 6.283); g.fill();
        }
      }
      g.restore();
    });
  }

  function leeren() { ereignisse = []; wackelBis = 0; }

  /* ------------------------------------------------------
     START-ANIMATION
  ------------------------------------------------------ */
  let intro = null;   // { abbrechen }

  function introLaeuft() { return !!intro; }
  function introAbbrechen() { if (intro) intro.abbrechen(); }

  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  /* V2-EINFLUG (9 s, dichter):
       0,0 s  Hyperraum - Streifen in beiden Parteifarben
       1,1 s  Weissblitz, Kamerafahrt ueber den Ort (Zoom + Schwenk), Name und Regeln
       3,5 s  die Flotten fliegen in ihrer Partei-Formation ein
       5,1 s  Wappen schlagen ein, VS
       6,65 s Countdown 3 - 2 - 1 (je 0,55 s), 8,3 s "FEUER!"
     Formation und Einflug je Partei:
       menschen  Keil     synchroner Sprung mit Lichtspur
       aliens    Schwarm  wellige Boegen, versetzt
       piraten   Rudel    schiesst uebers Ziel hinaus, schaukelt
       maschinen Raster   Spalte fuer Spalte, Scanlinie
       kristall  Gitter   materialisiert am Platz, Prismenblitz
       geister   Nebel    gleitet aus dem Dunst, Nachbilder */
  const FORMATION = { menschen: "keil", aliens: "schwarm", piraten: "rudel", maschinen: "raster", kristall: "gitter", geister: "nebel", boss: "keil" };
  const FORM_NAME = { keil: "Keilformation", schwarm: "Schwarmwolke", rudel: "Rudel", raster: "Raster", gitter: "Kristallgitter", nebel: "Nebelwand" };
  /* Formationsname in der aktuellen Sprache (i18n.js schlacht.formation.*). */
  function formName(art) { return t("schlacht.formation." + art, FORM_NAME[art] || ""); }
  /* Wohin die Kamera zuerst schaut (Versatz von der Bildmitte). */
  const KAMERA = {
    asteroiden: [-0.17, 0.12], schwarzes_loch: [-0.1, 0.08], station: [0.17, -0.12], nebel: [-0.15, -0.1],
    sonne: [0, -0.17], eisring: [0.17, 0.15], wurmloch: [0.06, 0], pulsar: [0.1, -0.05],
    friedhof: [0.17, -0.12], mondring: [0.15, 0.15],
  };
  function css(e, s) { e.style.cssText = s; return e; }

  function formation(partei, n) {
    const art = FORMATION[partei] || "keil", r = zufall("form-" + partei), pos = [];
    for (let i = 0; i < n; i++) {
      let x, y;
      if (art === "keil") { const k = Math.ceil(i / 2), sg = i % 2 ? -1 : 1; x = 0.36 - k * 0.05; y = 0.5 + sg * k * 0.085; }
      else if (art === "schwarm") { const a = i * 2.4, rr = 0.03 + 0.13 * Math.sqrt(i / n); x = 0.24 + Math.cos(a) * rr * 0.8; y = 0.5 + Math.sin(a) * rr * 1.6; }
      else if (art === "rudel") { x = 0.12 + r() * 0.24; y = 0.18 + (i / Math.max(1, n - 1)) * 0.64 + (r() - 0.5) * 0.08; }
      else if (art === "raster") { const col = Math.floor(i / 3), row = i % 3; x = 0.34 - col * 0.085; y = 0.3 + row * 0.2; }
      else if (art === "gitter") { if (i === 0) { x = 0.24; y = 0.5; } else { const a = (i - 1) / Math.max(1, n - 1) * 6.283; x = 0.24 + Math.cos(a) * 0.1; y = 0.5 + Math.sin(a) * 0.22; } }
      else { x = 0.2 + (i % 2) * 0.08 + r() * 0.03; y = 0.14 + (i / Math.max(1, n - 1)) * 0.72; }
      pos.push({ x: x, y: y });
    }
    return pos;
  }

  function introStarten(buehneEl, o) {
    if (intro) intro.abbrechen();
    return new Promise(function (fertig) {
      const ruhig = RUHIG.matches;
      const FS = window.fhSchiffe;
      const pl = o.links || "menschen", pr = o.rechts || "aliens";
      const fL = FS ? FS.farbe(pl) : { akzent: "#6fd3ff", licht: "#ffffff" };
      const fR = FS ? FS.farbe(pr) : { akzent: "#9dff6a", licht: "#ffffff" };

      const box = css(el("div", "sl-intro" + (ruhig ? " ist-ruhig" : "")),
        "position:absolute;inset:0;z-index:5;overflow:hidden;background:#04050a;cursor:pointer;container-type:size;transition:opacity .45s ease;" +
        "font-family:var(--fh-font-sans);color:var(--fh-text);user-select:none");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", t("schlacht.intro.aria", "Die Schlacht beginnt"));
      const cv = css(el("canvas", "sl-intro-canvas"), "position:absolute;inset:0;width:100%;height:100%;display:block");
      cv.id = "sl-intro-canvas";
      cv.setAttribute("aria-hidden", "true");

      const AUS = "opacity:0;transition:opacity .45s ease,transform .6s cubic-bezier(.2,.8,.2,1);";
      const sprung = css(el("p", null, t("schlacht.intro.sprung", "Sprung in den Einsatzraum")),
        "position:absolute;left:0;right:0;top:50%;margin:0;text-align:center;transform:translateY(-50%);font-size:max(12px,1.6cqh);letter-spacing:.4em;text-transform:uppercase;color:color-mix(in srgb,var(--fh-text) 82%,transparent);" + AUS);

      const ortBox = css(el("div", "sl-intro-ort"), "position:absolute;left:5cqw;bottom:9cqh;max-width:min(560px,60cqw);padding-left:2cqw;" + AUS + "transform:translateX(-24px)");
      const kante = css(el("span"), "position:absolute;left:0;top:0;bottom:0;width:1px;background:linear-gradient(transparent,var(--fh-nocturne),transparent)");
      const liste = css(el("ul", "sl-intro-regeln"), "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7cqh");
      const lis = regeln(o.ort).map(function (r, i) {
        const li = css(el("li", null, r), "position:relative;padding-left:1.4em;font-size:max(12px,1.9cqh);opacity:0;transform:translateX(-10px);transition:opacity .35s ease " + (0.3 + i * 0.12) + "s,transform .35s ease " + (0.3 + i * 0.12) + "s");
        li.prepend(css(el("span"), "position:absolute;left:0;top:.62em;width:.8em;height:1px;background:var(--fh-nocturne)"));
        liste.appendChild(li);
        return li;
      });
      ortBox.append(kante,
        css(el("p", null, t("schlacht.intro.schauplatz", "Schauplatz")), "margin:0 0 .8cqh;font-size:max(11px,1.5cqh);letter-spacing:.24em;text-transform:uppercase;color:var(--fh-nocturne)"),
        css(el("h2", "sl-intro-name", name(o.ortId)), "margin:0;font-family:var(--fh-font-sans);font-weight:500;font-size:max(24px,6.4cqh);line-height:1.05;letter-spacing:-.01em;text-wrap:balance"),
        css(el("p", "sl-intro-gegend", gegend(o.ortId)), "margin:.8cqh 0 1.8cqh;font-size:max(13px,2.1cqh);color:color-mix(in srgb,var(--fh-text) 82%,transparent)"),
        liste);

      function seitenLabel(partei, F, n, x) {
        const d = css(el("div", "sl-intro-seite"), "position:absolute;top:61cqh;left:" + x + "cqw;display:flex;flex-direction:column;align-items:center;gap:.7cqh;text-align:center;" + AUS + "transform:translate(-50%,12px)");
        d.dataset.partei = partei;
        d.append(
          css(el("span", "sl-intro-volk", parteiName(partei)), "font-family:var(--fh-font-sans);font-weight:500;font-size:max(16px,3.6cqh);white-space:nowrap;color:" + F.licht + ";text-shadow:0 0 18px " + F.akzent),
          css(el("span", null, n + " " + t("schlacht.intro.schiffe", "Schiffe") + " · " + formName(FORMATION[partei] || "keil")), "font-size:max(11px,1.6cqh);letter-spacing:.14em;text-transform:uppercase;color:color-mix(in srgb,var(--fh-text) 82%,transparent)"));
        return d;
      }
      const labL = seitenLabel(pl, fL, Math.min(9, (o.menschen || []).length), 30);
      const labR = seitenLabel(pr, fR, Math.min(9, (o.aliens || []).length), 70);
      const vs = css(el("span", "sl-intro-gegen", "VS"), "position:absolute;left:50%;top:42cqh;font-family:var(--fh-font-sans);font-weight:500;font-size:max(28px,9cqh);letter-spacing:.06em;" + AUS + "transform:translate(-50%,-50%) scale(1.8)");
      const zahl = css(el("div", "sl-intro-zahl"), "position:absolute;left:50%;top:45%;font-family:var(--fh-font-sans);font-weight:500;font-size:max(48px,22cqh);line-height:1;white-space:nowrap;opacity:0;transform:translate(-50%,-50%);text-shadow:0 0 40px rgba(145,132,217,.6)");
      zahl.setAttribute("aria-hidden", "true");
      const weiter = css(el("button", "sl-intro-weiter", t("schlacht.intro.weiter", "Überspringen")),
        "position:absolute;right:2.4cqw;bottom:2.4cqh;font:inherit;font-size:13px;padding:8px 14px;border-radius:var(--fh-radius-sm);border:1px solid var(--fh-nocturne);background:rgba(10,12,20,.45);color:var(--fh-text);cursor:pointer");
      weiter.type = "button";
      box.append(cv, sprung, ortBox, labL, vs, labR, zahl, weiter);
      buehneEl.appendChild(box);

      const g = cv.getContext("2d");
      let B = 1, H = 1, D = 1;
      function einpassen() {
        const r = box.getBoundingClientRect();
        D = Math.min(2, window.devicePixelRatio || 1);
        B = Math.max(1, r.width); H = Math.max(1, r.height);
        cv.width = Math.round(B * D); cv.height = Math.round(H * D);
      }
      einpassen();
      window.addEventListener("resize", einpassen);

      const k = o.klang;
      const stars = [];
      const sr = zufall("sprung");
      for (let i = 0; i < 420; i++) stars.push({ a: sr() * 6.283, d: 0.02 + sr() * 0.98, v: 0.4 + sr() * 0.8, f: i % 2 });

      const DAUER_ART = { keil: 650, schwarm: 1100, rudel: 850, raster: 620, gitter: 600, nebel: 1300 };
      function flotte(liste2, partei) {
        const art = FORMATION[partei] || "keil", L = (liste2 || []).slice(0, 9), P = formation(partei, L.length), r = zufall("d-" + partei);
        return L.map(function (e, i) {
          return {
            typ: e.typ, stufen: e.stufen, x: P[i].x, y: P[i].y, i: i, art: art, dauer: DAUER_ART[art],
            d: art === "keil" ? Math.ceil(i / 2) * 80 : art === "schwarm" ? r() * 800 : art === "rudel" ? r() * 380
              : art === "raster" ? Math.floor(i / 3) * 300 : art === "gitter" ? i * 110 : i * 140,
            rel: (i === 0 ? 0.13 : 0.1) * (0.85 + r() * 0.3),
          };
        });
      }
      const fM = flotte(o.menschen, pl), fA = flotte(o.aliens, pr);

      let raf = 0;
      const zeiten = [];
      const t0 = performance.now();
      const ENDE = ruhig ? 3600 : 9000;
      function plane(ms, fn) { zeiten.push(setTimeout(fn, ms)); }
      function zeige(e, an, aus) { e.style.opacity = an ? "1" : "0"; if (aus != null) e.style.transform = an ? aus[0] : aus[1]; }
      function ziffer(text, feuer) {
        zahl.textContent = text;
        zahl.style.transition = "none";
        zahl.style.opacity = "0";
        zahl.style.color = feuer ? "#ffd45a" : "var(--fh-text)";
        zahl.style.transform = "translate(-50%,-50%) scale(" + (feuer ? 2.2 : 1.8) + ")";
        void zahl.offsetWidth;
        zahl.style.transition = "transform .42s cubic-bezier(.16,1,.3,1), opacity .18s ease";
        zahl.style.opacity = "1";
        zahl.style.transform = "translate(-50%,-50%) scale(1)";
        plane((performance.now() - t0) + (feuer ? 560 : 430), function () {
          zahl.style.transition = "opacity .14s ease, transform .3s ease";
          zahl.style.opacity = "0";
          zahl.style.transform = "translate(-50%,-50%) scale(.85)";
        });
        if (k) k.akzent(feuer ? "feuer" : "zaehlen");
      }
      const ORT_AN = ["none", "translateX(-24px)"], LI_AN = ["none", "translateX(-10px)"];
      const LAB_AN = ["translate(-50%,0)", "translate(-50%,12px)"], VS_AN = ["translate(-50%,-50%) scale(1)", "translate(-50%,-50%) scale(1.8)"];
      if (ruhig) {
        zeige(ortBox, true, ORT_AN); lis.forEach(function (li) { zeige(li, true, LI_AN); });
        zeige(labL, true, LAB_AN); zeige(labR, true, LAB_AN);
      } else {
        if (k) k.akzent("sprung");
        plane(60, function () { zeige(sprung, true); });
        plane(900, function () { zeige(sprung, false); });
        plane(1100, function () { if (k) k.akzent("ort"); });
        plane(1500, function () { zeige(ortBox, true, ORT_AN); lis.forEach(function (li) { zeige(li, true, LI_AN); }); });
        plane(3500, function () { zeige(ortBox, false, ORT_AN); });
        plane(5200, function () { zeige(labL, true, LAB_AN); });
        plane(5260, function () { zeige(vs, true, VS_AN); });
        plane(5350, function () { zeige(labR, true, LAB_AN); });
        plane(6500, function () { zeige(labL, false, LAB_AN); zeige(labR, false, LAB_AN); zeige(vs, false, VS_AN); });
        [6650, 7200, 7750].forEach(function (ms, i) { plane(ms, function () { ziffer(String(3 - i), false); }); });
        plane(8300, function () { ziffer(t("schlacht.intro.feuer", "Feuer!"), true); });
      }

      function hyperraum(q) {
        const speed = 0.2 + q * q * 4;
        g.fillStyle = "rgba(3,4,10," + (0.28 + (1 - q) * 0.4) + ")";
        g.fillRect(0, 0, B, H);
        const cx = B / 2, cy = H / 2, M = Math.hypot(B, H) / 2;
        stars.forEach(function (s) {
          s.d += s.v * speed * 0.016;
          if (s.d > 1) s.d -= 1;
          const d0 = s.d * s.d * M, d1 = Math.min(M * 1.1, d0 + (6 + q * 190) * s.d);
          g.globalAlpha = 0.25 + s.d * 0.75;
          g.strokeStyle = s.d < 0.35 ? "#dfe8ff" : (s.f ? fL.akzent : fR.akzent);
          g.lineWidth = 0.7 + s.d * 1.8;
          g.beginPath();
          g.moveTo(cx + Math.cos(s.a) * d0, cy + Math.sin(s.a) * d0);
          g.lineTo(cx + Math.cos(s.a) * d1, cy + Math.sin(s.a) * d1);
          g.stroke();
        });
        g.globalAlpha = 1;
        g.fillStyle = radial(g, cx, cy, M * 0.4, [[0, "rgba(170,175,255," + (0.1 + q * 0.3) + ")"], [1, "rgba(40,60,160,0)"]]);
        g.fillRect(0, 0, B, H);
      }

      function kamera(z) {
        const p = Math.min(1, Math.max(0, (z - 1100) / 2600)), e = 1 - Math.pow(1 - p, 3);
        let s = 1.55 - 0.4 * e;
        if (z > 3700) s -= 0.09 * Math.min(1, (z - 3700) / 5300);
        const K = KAMERA[o.ortId] || [0.15, -0.1], lim = (1 - 1 / s) / 2;
        return {
          s: s,
          dx: Math.max(-lim, Math.min(lim, K[0] * (1 - e))),
          dy: Math.max(-lim, Math.min(lim, K[1] * (1 - e))),
        };
      }

      function schiffe(liste2, seite, zt, jetzt) {
        if (!FS) return;
        const partei = seite === "menschen" ? pl : pr, F = FS.farbe(partei), sg = seite === "menschen" ? 1 : -1;
        liste2.forEach(function (s) {
          const lq = Math.max(0, Math.min(1, (zt - s.d) / s.dauer));
          if (lq <= 0) return;
          const zx = seite === "menschen" ? B * s.x : B * (1 - s.x), zy = H * s.y;
          const startX = seite === "menschen" ? -B * 0.25 : B * 1.25;
          const voll = Math.min(B, H) * s.rel;
          let x = zx, y = zy, alpha = 1, breite = voll, winkel = seite === "menschen" ? 0 : Math.PI, spur = 0;
          if (s.art === "keil") { const e = 1 - Math.pow(1 - lq, 5); x = startX + (zx - startX) * e; spur = 1 - lq; }
          else if (s.art === "schwarm") {
            const e = 1 - Math.pow(1 - lq, 3);
            x = startX + (zx - startX) * e;
            y = zy + Math.sin(lq * 7 + s.i) * H * 0.12 * (1 - e);
            winkel += Math.cos(lq * 7 + s.i) * 0.5 * (1 - e) * sg;
            spur = (1 - lq) * 0.6;
          } else if (s.art === "rudel") {
            const c1 = 1.9, c3 = c1 + 1, e = 1 + c3 * Math.pow(lq - 1, 3) + c1 * Math.pow(lq - 1, 2);
            x = startX + (zx - startX) * e;
            winkel += Math.sin(lq * 9 + s.i) * 0.18 * (1 - lq);
            spur = (1 - lq) * 0.8;
          } else if (s.art === "raster") { const e = 1 - (1 - lq) * (1 - lq); x = startX + (zx - startX) * e; spur = (1 - lq) * 0.5; }
          else if (s.art === "gitter") { const e = 1 - Math.pow(1 - lq, 3); alpha = e; breite = voll * (0.5 + 0.5 * e); }
          else { const e = 1 - Math.pow(1 - lq, 2); x = zx - sg * B * 0.08 * (1 - e); alpha = e * 0.95; }
          if (lq >= 1) y += Math.sin(jetzt * 0.002 + s.i) * 3;

          if (spur > 0.01) {
            const lang = B * 0.28 * spur, gr = g.createLinearGradient(x, y, x - sg * lang, y);
            gr.addColorStop(0, F.akzent); gr.addColorStop(1, F.akzent + "00");
            g.save(); g.globalAlpha = 0.85 * spur + 0.15; g.strokeStyle = gr; g.lineWidth = Math.max(2, breite * 0.1); g.lineCap = "round";
            g.beginPath(); g.moveTo(x, y); g.lineTo(x - sg * lang, y); g.stroke(); g.restore();
          }
          if (s.art === "gitter" && lq < 1) {
            g.save(); g.globalAlpha = 1 - lq; g.lineWidth = 2;
            for (let k2 = 0; k2 < 8; k2++) {
              const a = k2 * 0.785 + s.i, l = breite * (0.4 + 1.3 * lq);
              g.strokeStyle = k2 % 2 ? F.akzent : (F.zweit || F.licht);
              g.beginPath(); g.moveTo(zx + Math.cos(a) * l * 0.3, zy + Math.sin(a) * l * 0.3); g.lineTo(zx + Math.cos(a) * l, zy + Math.sin(a) * l); g.stroke();
            }
            g.restore();
          }
          if (s.art === "nebel" && lq < 1) {
            g.save(); g.globalAlpha = 0.5 * (1 - lq);
            g.fillStyle = radial(g, x, y, voll * 1.2, [[0, F.akzent + "88"], [1, F.akzent + "00"]]);
            g.beginPath(); g.arc(x, y, voll * 1.2, 0, 6.283); g.fill(); g.restore();
          }
          if (s.art === "raster" && lq > 0.6 && lq < 1) {
            g.save(); g.globalAlpha = (1 - lq) * 2.5; g.strokeStyle = F.akzent; g.lineWidth = 1.5;
            g.beginPath(); g.moveTo(zx, zy - voll * 0.6); g.lineTo(zx, zy + voll * 0.6); g.stroke(); g.restore();
          }
          FS.zeichnen(g, {
            typ: s.typ, seite: partei, stufen: s.stufen, x: x, y: y, winkel: winkel, breite: breite,
            dpr: D, zeit: jetzt, phase: s.d + s.i * 300, treffer: 0, ruhig: false, alpha: alpha,
          });
          if (lq >= 1 && !s.blitz) s.blitz = jetzt;
          if (s.blitz && jetzt - s.blitz < 260) {
            const f = (jetzt - s.blitz) / 260;
            g.save(); g.globalAlpha = 0.7 * (1 - f); g.fillStyle = F.licht;
            g.beginPath(); g.arc(x, y, voll * (0.3 + f * 0.7), 0, 6.283); g.fill(); g.restore();
          }
        });
      }

      function wappen(z, jetzt) {
        if (!FS || !FS.emblem) return;
        const aus = z > 6450 ? Math.max(0, 1 - (z - 6450) / 350) : 1;
        [[pl, fL, 0.3, 5150], [pr, fR, 0.7, 5300]].forEach(function (w) {
          const tt = z - w[3];
          if (tt < 0) return;
          const p = Math.min(1, tt / 360), e = 1 - Math.pow(1 - p, 4);
          const r = Math.min(B, H) * 0.12, cx = B * w[2], cy = H * 0.42;
          g.save();
          g.globalAlpha = 0.22 * aus * e;
          g.fillStyle = radial(g, cx, cy, Math.max(B, H) * 0.45, [[0, w[1].akzent], [1, w[1].akzent + "00"]]);
          g.fillRect(0, 0, B, H);
          g.restore();
          g.save();
          g.globalAlpha = Math.min(1, p * 2.5) * aus;
          FS.emblem(g, w[0], cx, cy, r * (2.6 - 1.6 * e), jetzt);
          g.restore();
          const q = (tt - 360) / 600;
          if (q > 0 && q < 1) {
            g.save(); g.globalAlpha = (1 - q) * aus; g.strokeStyle = w[1].akzent; g.lineWidth = 6 * (1 - q) + 1;
            g.beginPath(); g.arc(cx, cy, r * (1 + q * 2.4), 0, 6.283); g.stroke(); g.restore();
          }
        });
      }

      function bild(jetzt) {
        const z = jetzt - t0;
        g.setTransform(D, 0, 0, D, 0, 0);
        if (ruhig) {
          hintergrund(g, B, H, jetzt, D, o.ortId, true);
          schiffe(fM, "menschen", 99999, jetzt);
          schiffe(fA, "aliens", 99999, jetzt);
          wappen(6000, jetzt);
        } else if (z < 1100) {
          hyperraum(z / 1100);
        } else {
          const kam = kamera(z);
          g.save();
          g.translate(B / 2, H / 2); g.scale(kam.s, kam.s); g.translate(-(0.5 + kam.dx) * B, -(0.5 + kam.dy) * H);
          hintergrund(g, B, H, jetzt, D, o.ortId, false);
          g.restore();
          if (z >= 3500) {
            schiffe(fM, "menschen", z - 3500, jetzt);
            schiffe(fA, "aliens", z - 3500, jetzt);
          }
          if (z >= 5150 && z < 6800) wappen(z, jetzt);
          [6650, 7200, 7750, 8300].forEach(function (ms, i) {
            const q = (z - ms) / 700;
            if (q < 0 || q > 1) return;
            const fe = i === 3;
            g.save();
            g.globalAlpha = (fe ? 1 : 0.8) * (1 - q);
            g.strokeStyle = fe ? "#ffd45a" : (i % 2 ? fR.akzent : fL.akzent);
            g.lineWidth = (fe ? 12 : 5) * (1 - q) + 1;
            g.beginPath(); g.arc(B / 2, H * 0.45, 40 + q * Math.max(B, H) * (fe ? 0.75 : 0.35), 0, 6.283); g.stroke();
            g.restore();
          });
          if (z < 1500) { g.fillStyle = "rgba(255,255,255," + Math.max(0, 1 - (z - 1100) / 400) + ")"; g.fillRect(0, 0, B, H); }
          if (z >= 8300 && z < 8500) { g.fillStyle = "rgba(255,240,210," + 0.35 * (1 - (z - 8300) / 200) + ")"; g.fillRect(0, 0, B, H); }
          g.fillStyle = radial(g, B / 2, H / 2, Math.max(B, H) * 0.75, [[0.55, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.6)"]]);
          g.fillRect(0, 0, B, H);
        }
        if (z >= ENDE) { beenden(); return; }
        if (z >= ENDE - 450) box.style.opacity = "0";
        raf = requestAnimationFrame(bild);
      }

      function beenden() {
        cancelAnimationFrame(raf);
        zeiten.forEach(clearTimeout);
        window.removeEventListener("resize", einpassen);
        document.removeEventListener("keydown", taste, true);
        box.remove();
        intro = null;
        fertig();
      }
      function taste(ev) {
        if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); beenden(); }
      }
      weiter.addEventListener("click", function (ev) { ev.stopPropagation(); beenden(); });
      box.addEventListener("click", beenden);
      document.addEventListener("keydown", taste, true);
      intro = { abbrechen: beenden };
      weiter.focus({ preventScroll: true });
      raf = requestAnimationFrame(bild);
    });
  }

  /* ------------------------------------------------------
     VORSCHAU FUER DEN ADMIN
  ------------------------------------------------------ */
  /* Dieselben Zahlen wie in 55-schlacht-orte.sql - nur fuer die
     Vorschau, falls die Tabelle (noch) nicht lesbar ist. */
  const STANDARD = {
    asteroiden:     { dauerfeuer: 1,    ziel: 1,   wendig: 1.25, spezial: 1,    heilung: 1,   schild: 1,   laden: 1,   ereignis_sek: 40,   ereignis_anteil: 0.02,  ereignis_art: "abwechselnd" },
    schwarzes_loch: { dauerfeuer: 1.25, ziel: 1,   wendig: 1,    spezial: 1.35, heilung: 0.7, schild: 1,   laden: 1,   ereignis_sek: 60,   ereignis_anteil: 0.015, ereignis_art: "beide" },
    station:        { dauerfeuer: 1,    ziel: 0.8, wendig: 1,    spezial: 1,    heilung: 1.5, schild: 1.3, laden: 1,   ereignis_sek: 50,   ereignis_anteil: 0.025, ereignis_art: "abwechselnd" },
    nebel:          { dauerfeuer: 1,    ziel: 0.7, wendig: 1,    spezial: 1.2,  heilung: 1,   schild: 1,   laden: 1,   ereignis_sek: 30,   ereignis_anteil: 0.015, ereignis_art: "abwechselnd" },
    sonne:          { dauerfeuer: 1.15, ziel: 1,   wendig: 1,    spezial: 1,    heilung: 1.2, schild: 0.7, laden: 1,   ereignis_sek: 45,   ereignis_anteil: 0.03,  ereignis_art: "beide" },
    eisring:        { dauerfeuer: 0.85, ziel: 1.1, wendig: 1,    spezial: 1,    heilung: 1,   schild: 1.5, laden: 1,   ereignis_sek: 70,   ereignis_anteil: 0.01,  ereignis_art: "abwechselnd" },
    wurmloch:       { dauerfeuer: 1,    ziel: 1,   wendig: 1,    spezial: 1.1,  heilung: 1,   schild: 1,   laden: 0.5, ereignis_sek: null, ereignis_anteil: 0,     ereignis_art: "beide" },
  };
  Object.assign(STANDARD, {
    pulsar:   { dauerfeuer: 1,   ziel: 0.85, wendig: 1,   spezial: 1.15, heilung: 1,    schild: 1,   laden: 1, ereignis_sek: 35, ereignis_anteil: 0.02,  ereignis_art: "abwechselnd" },
    friedhof: { dauerfeuer: 1,   ziel: 1,    wendig: 0.9, spezial: 1,    heilung: 1.25, schild: 1.1, laden: 1, ereignis_sek: 45, ereignis_anteil: 0.025, ereignis_art: "abwechselnd" },
    mondring: { dauerfeuer: 0.9, ziel: 1,    wendig: 1.2, spezial: 1,    heilung: 1,    schild: 1,   laden: 1, ereignis_sek: 55, ereignis_anteil: 0.015, ereignis_art: "abwechselnd" },
  });
  const DEMO_TAKT = 6000;   // in der Vorschau alle 6 s ein Ereignis

  let vorschauOffen = null;   // { schliessen }

  async function ortZeilen() {
    const zeilen = {};
    ORTE.forEach(function (id) { zeilen[id] = Object.assign({ ort_id: id }, STANDARD[id]); });
    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient) {
        const a = await withSupabaseRlsColdStartRetry(function () { return supabaseClient.from("schlacht_orte").select("*"); });
        if (!a.error && Array.isArray(a.data)) a.data.forEach(function (z) { if (zeilen[z.ort_id]) zeilen[z.ort_id] = z; });
      }
    } catch (e) { /* ohne Migration 55: Standardwerte */ }
    return zeilen;
  }

  function demoFlotte(partei) {
    const typen = typeof HANGAR_REIHENFOLGE !== "undefined" && HANGAR_REIHENFOLGE[partei]
      ? HANGAR_REIHENFOLGE[partei] : ["jaeger", "fregatte", "kreuzer", "traeger"];
    const liste = [];
    for (let i = 0; i < 9; i++) {
      liste.push({ typ: typen[i % 4], stufen: { leben: i % 4, schaden: (i * 2) % 5, spezial: i % 3 } });
    }
    return liste;
  }

  function vorschau(startId) {
    if (vorschauOffen) vorschauOffen.schliessen();
    const vorher = document.activeElement;
    const k = window.fhSchlachtKlang || null;
    let aktiv = ORTE.indexOf(startId) >= 0 ? startId : ORTE[0];
    let zeilen = null;
    /* Parteien (Migration 57): Paare zum Durchschalten. */
    const PAARE = [["menschen", "aliens"], ["piraten", "maschinen"], ["kristall", "geister"],
      ["menschen", "geister"], ["piraten", "aliens"], ["maschinen", "kristall"]];
    let paar = 0;
    let fM = demoFlotte("menschen"), fA = demoFlotte("aliens");

    const box = el("div", "sl-vorschau");
    box.id = "fh-orte-vorschau";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "sl-vorschau-titel");

    const kopf = el("div", "sl-vorschau-kopf");
    const titel = el("h2", "sl-vorschau-titel", t("schlacht.vorschau.titel", "Kampforte · Vorschau"));
    titel.id = "sl-vorschau-titel";
    const reiter = el("div", "sl-vorschau-reiter");
    reiter.setAttribute("role", "tablist");
    reiter.setAttribute("aria-label", t("schlacht.vorschau.orte", "Kampforte"));
    const zu = el("button", "sl-rund-knopf sl-vorschau-zu");
    zu.type = "button";
    zu.setAttribute("aria-label", t("schlacht.vorschau.schliessen", "Vorschau schließen"));
    zu.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    kopf.append(titel, reiter, zu);

    const feld = el("div", "sl-vorschau-feld");
    const cv = el("canvas", "sl-vorschau-canvas");
    cv.id = "sl-vorschau-canvas";   // fuer die Filter-Ausnahme in 95/96
    cv.setAttribute("role", "img");
    feld.appendChild(cv);

    const fuss = el("div", "sl-vorschau-fuss");
    const info = el("div", "sl-vorschau-info");
    const knoepfe = el("div", "sl-vorschau-knoepfe");
    const einflug = el("button", "sl-vorschau-knopf", t("schlacht.vorschau.einflug", "Einflug abspielen"));
    einflug.type = "button";
    const ausloesen = el("button", "sl-vorschau-knopf", t("schlacht.vorschau.ereignis", "Ereignis auslösen"));
    ausloesen.type = "button";
    const parteiKnopf = el("button", "sl-vorschau-knopf");
    parteiKnopf.type = "button";
    function parteiText() {
      parteiKnopf.textContent = t("schlacht.vorschau.parteien", "Parteien") + ": " + parteiName(PAARE[paar][0]) + " · " + parteiName(PAARE[paar][1]);
    }
    parteiText();
    parteiKnopf.addEventListener("click", function () {
      paar = (paar + 1) % PAARE.length;
      fM = demoFlotte(PAARE[paar][0]); fA = demoFlotte(PAARE[paar][1]);
      parteiText();
    });
    knoepfe.append(einflug, ausloesen, parteiKnopf);
    const hinweis = el("p", "sl-vorschau-hinweis", t("schlacht.vorschau.hinweis", "Nur für dich. Spieler sehen die Orte erst, wenn du sie unter Live-Event → Freigaben freischaltest."));
    fuss.append(info, knoepfe, hinweis);
    box.append(kopf, feld, fuss);
    document.body.appendChild(box);
    document.documentElement.classList.add("fh-schlacht-offen");
    if (k) k.start("vorschau");

    const g = cv.getContext("2d");
    let B = 1, H = 1, D = 1;
    function einpassen() {
      const rr = feld.getBoundingClientRect();
      D = Math.min(2, window.devicePixelRatio || 1);
      B = Math.max(1, rr.width); H = Math.max(1, rr.height);
      cv.width = Math.round(B * D); cv.height = Math.round(H * D);
    }

    function reiterBauen() {
      reiter.replaceChildren();
      ORTE.forEach(function (id) {
        const b2 = el("button", "sl-vorschau-reiter-knopf", name(id));
        b2.type = "button";
        b2.setAttribute("role", "tab");
        b2.setAttribute("aria-selected", id === aktiv ? "true" : "false");
        b2.addEventListener("click", function () { waehlen(id); });
        reiter.appendChild(b2);
        if (id === aktiv) requestAnimationFrame(function () { b2.scrollIntoView({ block: "nearest", inline: "center" }); });
      });
    }

    function infoBauen() {
      info.replaceChildren();
      info.append(el("p", "sl-ort-name", name(aktiv)), el("p", "sl-ort-gegend", gegend(aktiv)));
      const liste = el("ul", "sl-ort-regeln");
      regeln(zeilen && zeilen[aktiv]).forEach(function (x) { liste.appendChild(el("li", null, x)); });
      info.appendChild(liste);
      ausloesen.disabled = !DAUER[aktiv];
      cv.setAttribute("aria-label", name(aktiv));
    }

    let naechstesDemo = performance.now() + 2500, demoSeite = "menschen";
    function waehlen(id) {
      aktiv = id;
      leeren();
      naechstesDemo = performance.now() + 2500;
      reiterBauen();
      infoBauen();
    }

    function ereignisZeigen() {
      if (!DAUER[aktiv]) return;
      const z = zeilen && zeilen[aktiv];
      if (z && z.ereignis_art === "beide") {
        if (aktiv === "sonne" || aktiv === "schwarzes_loch") ereignis(aktiv, "beide");
        else { ereignis(aktiv, "menschen"); ereignis(aktiv, "aliens"); }
      } else {
        ereignis(aktiv, demoSeite);
        demoSeite = demoSeite === "menschen" ? "aliens" : "menschen";
      }
      if (k) k.akzent("ereignis");
    }

    function flotteZeichnen(liste, seite, jetzt) {
      if (!window.fhSchiffe) return;
      const hoch = H > B * 1.1;
      liste.forEach(function (s2, i) {
        const r2 = zufall(seite + "v" + i);
        let x, y;
        if (hoch) {
          x = B * (0.12 + (i % 5) * 0.19) + (r2() - 0.5) * 20;
          y = seite === "menschen" ? H * (0.72 + Math.floor(i / 5) * 0.12) : H * (0.28 - Math.floor(i / 5) * 0.12);
        } else {
          x = seite === "menschen" ? B * (0.08 + Math.floor(i / 3) * 0.1) : B * (0.92 - Math.floor(i / 3) * 0.1);
          y = H * (0.25 + (i % 3) * 0.25) + (r2() - 0.5) * 30;
        }
        const ruhig = RUHIG.matches;
        window.fhSchiffe.zeichnen(g, {
          typ: s2.typ, seite: PAARE[paar][seite === "menschen" ? 0 : 1], stufen: s2.stufen, x: x + (ruhig ? 0 : Math.sin(jetzt / 900 + i) * 4),
          y: y + (ruhig ? 0 : Math.cos(jetzt / 1100 + i) * 5),
          winkel: hoch ? (seite === "menschen" ? -Math.PI / 2 : Math.PI / 2) : (seite === "menschen" ? 0 : Math.PI),
          breite: Math.max(40, Math.min(B, H) * 0.1), dpr: D, zeit: jetzt, phase: i * 300, treffer: 0, ruhig: ruhig,
        });
      });
    }

    let raf = 0;
    function bild(jetzt) {
      raf = requestAnimationFrame(bild);
      if (intro) return;   // die Start-Animation zeichnet selbst
      g.setTransform(D, 0, 0, D, 0, 0);
      g.clearRect(0, 0, B, H);
      hintergrund(g, B, H, jetzt, D, aktiv, RUHIG.matches);
      if (DAUER[aktiv] && !RUHIG.matches && jetzt >= naechstesDemo) { naechstesDemo = jetzt + DEMO_TAKT; ereignisZeigen(); }
      const w = wackeln(jetzt);
      g.save();
      g.translate(w.x, w.y);
      flotteZeichnen(fM, "menschen", jetzt);
      flotteZeichnen(fA, "aliens", jetzt);
      zeichneEreignisse(g, B, H, jetzt, H > B * 1.1);
      g.restore();
    }

    function taste(ev) {
      if (ev.key === "Escape" && !intro) { ev.preventDefault(); schliessen(); }
    }
    function schliessen() {
      cancelAnimationFrame(raf);
      if (intro) intro.abbrechen();
      window.removeEventListener("resize", einpassen);
      document.removeEventListener("keydown", taste);
      box.remove();
      leeren();
      if (!document.getElementById("fh-schlacht-buehne") || document.getElementById("fh-schlacht-buehne").hidden) {
        document.documentElement.classList.remove("fh-schlacht-offen");
      }
      if (k) k.stop("vorschau");
      vorschauOffen = null;
      if (vorher && vorher.focus) vorher.focus({ preventScroll: true });
    }

    zu.addEventListener("click", schliessen);
    einflug.addEventListener("click", function () {
      introStarten(box, { ortId: aktiv, ort: zeilen && zeilen[aktiv], menschen: fM, aliens: fA, runde: 1, klang: k, links: PAARE[paar][0], rechts: PAARE[paar][1] })
        .then(function () { if (vorschauOffen) einflug.focus({ preventScroll: true }); });
    });
    ausloesen.addEventListener("click", ereignisZeigen);
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    vorschauOffen = { schliessen: schliessen };

    reiterBauen();
    infoBauen();
    einpassen();
    zu.focus({ preventScroll: true });
    raf = requestAnimationFrame(bild);
    ortZeilen().then(function (z) { zeilen = z; if (vorschauOffen) infoBauen(); });
  }

  window.fhSchlachtOrte = {
    ORTE: ORTE,
    hintergrund: hintergrund,
    ereignis: ereignis,
    zeichneEreignisse: zeichneEreignisse,
    wackeln: wackeln,
    regeln: regeln,
    name: name, gegend: gegend, ereignisName: ereignisName,
    intro: introStarten,
    introLaeuft: introLaeuft,
    introAbbrechen: introAbbrechen,
    leeren: leeren,
    vorschau: vorschau,
    STANDARD: STANDARD,
    FORMATION: FORMATION,
    FORM_NAME: FORM_NAME,
    formation: formation,   // V2: Positionen je Partei (0..1, linke Seite)
  };
})();
