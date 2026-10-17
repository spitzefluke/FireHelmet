/* ======================================================
   STERNENSCHLACHT: KAMPFORTE UND START-ANIMATION
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
     intro(buehne, { ortId, ort, menschen, aliens, runde, klang }) -> Promise
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
      if (ruheCache.size > 4) ruheCache.delete(ruheCache.keys().next().value);
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
  const DAUER = { asteroiden: 1300, schwarzes_loch: 1600, station: 1200, nebel: 900, sonne: 1700, eisring: 1300 };

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

  function introStarten(buehneEl, o) {
    if (intro) intro.abbrechen();
    return new Promise(function (fertig) {
      const ruhig = RUHIG.matches;
      const box = el("div", "sl-intro" + (ruhig ? " ist-ruhig" : ""));
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", t("schlacht.intro.aria", "Die Schlacht beginnt"));
      const cv = el("canvas", "sl-intro-canvas");
      cv.id = "sl-intro-canvas";   // fuer die Filter-Ausnahme in 95/96
      cv.setAttribute("aria-hidden", "true");

      const sprung = el("p", "sl-intro-sprung", t("schlacht.intro.sprung", "Sprung in den Einsatzraum"));
      const ortBox = el("div", "sl-intro-ort");
      ortBox.append(
        el("p", "sl-intro-kicker", t("schlacht.intro.schauplatz", "Schauplatz")),
        el("h2", "sl-intro-name", name(o.ortId)),
        el("p", "sl-intro-gegend", gegend(o.ortId))
      );
      const liste = el("ul", "sl-intro-regeln");
      regeln(o.ort).forEach(function (r, i) {
        const li = el("li", null, r);
        li.style.setProperty("--i", i);
        liste.appendChild(li);
      });
      ortBox.appendChild(liste);
      const vs = el("div", "sl-intro-vs");
      const vm = el("div", "sl-intro-seite ist-menschen");
      vm.append(el("span", "sl-intro-volk", t("seiten.menschen.name", "Die Erdflotte")), el("strong", null, String((o.menschen || []).length)));
      const va = el("div", "sl-intro-seite ist-aliens");
      va.append(el("span", "sl-intro-volk", t("seiten.aliens.name", "Der Schwarm")), el("strong", null, String((o.aliens || []).length)));
      vs.append(vm, el("span", "sl-intro-gegen", "VS"), va);
      const zahl = el("div", "sl-intro-zahl");
      zahl.setAttribute("aria-hidden", "true");
      const weiter = el("button", "sl-intro-weiter", t("schlacht.intro.weiter", "Überspringen"));
      weiter.type = "button";
      box.append(cv, sprung, ortBox, vs, zahl, weiter);
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
      for (let i = 0; i < 300; i++) stars.push({ a: sr() * 6.283, d: 0.02 + sr() * 0.98, v: 0.4 + sr() * 0.8 });

      function flotte(liste2, seite) {
        return (liste2 || []).slice(0, 7).map(function (e, i) {
          const r = zufall(seite + i);
          return { typ: e.typ, stufen: e.stufen, y: 0.24 + (i / 7) * 0.56 + (r() - 0.5) * 0.05, x: 0.12 + r() * 0.2, d: i * 90 + r() * 120, breite: 34 + r() * 26 };
        });
      }
      const fM = flotte(o.menschen, "menschen"), fA = flotte(o.aliens, "aliens");

      let raf = 0, zeiten = [];
      const t0 = performance.now();
      const ENDE = ruhig ? 3600 : 9000;
      let phase = "";

      function setzePhase(p) {
        if (phase === p) return;
        phase = p;
        box.dataset.phase = p;
      }

      function plane(ms, fn) { zeiten.push(setTimeout(fn, ms)); }
      if (!ruhig) {
        if (k) k.akzent("sprung");
        plane(1700, function () { if (k) k.akzent("ort"); });
        [6200, 6900, 7600].forEach(function (ms, i) {
          plane(ms, function () { zahl.textContent = String(3 - i); zahl.classList.remove("ist-tick"); void zahl.offsetWidth; zahl.classList.add("ist-tick"); if (k) k.akzent("zaehlen"); });
        });
        plane(8300, function () { zahl.textContent = t("schlacht.intro.feuer", "Feuer!"); zahl.classList.remove("ist-tick"); void zahl.offsetWidth; zahl.classList.add("ist-tick", "ist-feuer"); if (k) k.akzent("feuer"); });
      }

      function schiffe(liste2, seite, q, jetzt) {
        if (!window.fhSchiffe) return;
        liste2.forEach(function (s) {
          const lq = Math.max(0, Math.min(1, (q * 1800 - s.d) / 700));
          if (lq <= 0) return;
          const e = 1 - Math.pow(1 - lq, 3);
          const zielX = seite === "menschen" ? B * s.x : B * (1 - s.x);
          const startX = seite === "menschen" ? -B * 0.3 : B * 1.3;
          const x = startX + (zielX - startX) * e, y = H * s.y;
          if (lq < 1) {
            g.strokeStyle = seite === "menschen" ? "rgba(143,227,255," + (0.8 * (1 - lq)) + ")" : "rgba(166,255,110," + (0.8 * (1 - lq)) + ")";
            g.lineWidth = 3;
            g.beginPath(); g.moveTo(x, y); g.lineTo(startX + (x - startX) * 0.2, y); g.stroke();
          }
          window.fhSchiffe.zeichnen(g, {
            typ: s.typ, seite: seite, stufen: s.stufen, x: x, y: y, winkel: seite === "menschen" ? 0 : Math.PI,
            breite: s.breite, dpr: D, zeit: jetzt, phase: s.d, treffer: 0, ruhig: false,
          });
          if (lq >= 1 && !s.blitz) s.blitz = jetzt;   // Ankunftsblitz einmal
          if (s.blitz && jetzt - s.blitz < 300) {
            const f = (jetzt - s.blitz) / 300;
            g.fillStyle = "rgba(255,255,255," + (0.7 * (1 - f)) + ")";
            g.beginPath(); g.arc(x, y, s.breite * (0.4 + f), 0, 6.283); g.fill();
          }
        });
      }

      function bild(jetzt) {
        const z = jetzt - t0;
        g.setTransform(D, 0, 0, D, 0, 0);
        if (ruhig) {
          setzePhase("ort");
          hintergrund(g, B, H, jetzt, D, o.ortId, true);
        } else if (z < 1700) {
          setzePhase("sprung");
          const q = z / 1700, speed = 0.15 + q * q * 3;
          g.fillStyle = "rgba(2,4,12," + (0.35 + (1 - q) * 0.4) + ")";
          g.fillRect(0, 0, B, H);
          const cx = B / 2, cy = H / 2, M = Math.hypot(B, H) / 2;
          stars.forEach(function (s) {
            s.d += s.v * speed * 0.016;
            if (s.d > 1) s.d -= 1;
            const d0 = s.d * s.d * M, d1 = Math.min(M, d0 + (8 + q * 140) * s.d);
            g.strokeStyle = "rgba(" + Math.round(170 + q * 80) + "," + Math.round(200 + q * 50) + ",255," + (0.3 + s.d * 0.7) + ")";
            g.lineWidth = 0.8 + s.d * 1.6;
            g.beginPath();
            g.moveTo(cx + Math.cos(s.a) * d0, cy + Math.sin(s.a) * d0);
            g.lineTo(cx + Math.cos(s.a) * d1, cy + Math.sin(s.a) * d1);
            g.stroke();
          });
          g.fillStyle = radial(g, cx, cy, M * 0.4, [[0, "rgba(140,170,255," + (0.15 + q * 0.3) + ")"], [1, "rgba(40,60,160,0)"]]);
          g.fillRect(0, 0, B, H);
        } else {
          setzePhase(z < 4400 ? "ort" : z < 6200 ? "vs" : "zaehlen");
          /* Ort mit langsamem Zoom */
          const zoom = 1 + 0.22 * Math.max(0, 1 - (z - 1700) / 3200);
          g.save();
          g.translate(B / 2, H / 2); g.scale(zoom, zoom); g.translate(-B / 2, -H / 2);
          hintergrund(g, B, H, jetzt, D, o.ortId, false);
          g.restore();
          if (z >= 4400) {
            schiffe(fM, "menschen", (z - 4400) / 1800, jetzt);
            schiffe(fA, "aliens", (z - 4400) / 1800, jetzt);
          }
          /* Schockwellen beim Countdown */
          [6200, 6900, 7600, 8300].forEach(function (ms, i) {
            const q = (z - ms) / 700;
            if (q < 0 || q > 1) return;
            g.strokeStyle = i === 3 ? "rgba(255,200,120," + (1 - q) + ")" : "rgba(240,201,106," + (0.8 * (1 - q)) + ")";
            g.lineWidth = (i === 3 ? 10 : 5) * (1 - q) + 1;
            g.beginPath(); g.arc(B / 2, H / 2, 40 + q * Math.max(B, H) * (i === 3 ? 0.7 : 0.35), 0, 6.283); g.stroke();
          });
          /* Weissblitz nach dem Sprung */
          if (z < 2100) {
            g.fillStyle = "rgba(255,255,255," + Math.max(0, 1 - (z - 1700) / 400) + ")";
            g.fillRect(0, 0, B, H);
          }
          /* Vignette */
          g.fillStyle = radial(g, B / 2, H / 2, Math.max(B, H) * 0.75, [[0.55, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.65)"]]);
          g.fillRect(0, 0, B, H);
        }
        if (z >= ENDE) { beenden(); return; }
        if (z >= ENDE - 500) box.classList.add("ist-aus");
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

  function demoFlotte(seite) {
    const typen = seite === "menschen" ? ["jaeger", "fregatte", "kreuzer", "traeger"] : ["drohne", "stachel", "weber", "brutschiff"];
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
    const fM = demoFlotte("menschen"), fA = demoFlotte("aliens");

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
    knoepfe.append(einflug, ausloesen);
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
          typ: s2.typ, seite: seite, stufen: s2.stufen, x: x + (ruhig ? 0 : Math.sin(jetzt / 900 + i) * 4),
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
      introStarten(box, { ortId: aktiv, ort: zeilen && zeilen[aktiv], menschen: fM, aliens: fA, runde: 1, klang: k })
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
  };
})();
