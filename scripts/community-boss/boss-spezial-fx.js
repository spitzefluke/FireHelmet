/* ======================================================
   ALLE VIERZEHN ANGRIFFE - WIE SIE AUSSEHEN
   ---------------------------------------------------
   Ein eigenes Modul, weil community-boss.js mit rund 2400 Zeilen
   schon gross genug ist und diese Zeichenroutinen mit der
   Kampflogik nichts zu tun haben.

   Frueher standen hier nur die elf Spezialangriffe. Die drei
   Grundangriffe (Saebel, Kanone, Enterhaken) bekamen stattdessen
   einen ZUFAELLIGEN von vier allgemeinen Effekten zugewiesen - ein
   Saebelhieb konnte als Harpune erscheinen. Jetzt hat jeder der
   vierzehn seine eigene Darstellung, und die Zufallsauswahl in
   community-boss.js greift nur noch, solange die Migration nicht
   eingespielt ist und der Angriff gar keinen Namen hat.

   ANBINDUNG
   community-boss.js fragt bei jedem Angriff zuerst hier nach:
     fhBossSpezial.erzeugen(art, w, h, einzel)  -> Effektobjekt oder null
     fhBossSpezial.zeichnen(ctx, fx, t, w, h)   -> true, wenn gezeichnet
   Gibt erzeugen() null zurueck, greift die alte Zufallsauswahl aus
   BOSS_ATTACK_KINDS - ein unbekannter Angriff faellt also nicht
   durch, er sieht nur aus wie bisher.

   "einzel" ist, was der Server zum Angriff mitgeschickt hat: die
   Walzen der Slotmaschine, die Zahl der heutigen Angreifer, der
   Spielothek-Verlust. Gewuerfelt wird auf dem Server (siehe
   10-boss-attacks.sql) - hier wird nur angezeigt, was dort
   entschieden wurde. Genau deshalb steht in slot() kein
   Math.random() fuer die Walzen.

   t laeuft in jeder Zeichenroutine von 0 bis 1 ueber die Dauer des
   Effekts.
====================================================== */

(function () {
  "use strict";

  /* Wie lange jeder Effekt laeuft, und wann darin der Treffer sitzt.
     Der Einschlagszeitpunkt steuert Ruettler, Rauch und Rueckstoss
     in community-boss.js - er soll auf dem Bild sitzen, nicht davor. */
  const DAUER = {
    // Grundangriffe - kurz, sie kommen taeglich
    saebel: 700, kanone: 950, enterhaken: 1100,
    // Spezialangriffe
    salve: 1100, brandpfeil: 900, enterkommando: 1300, pulverfass: 1000,
    schlachtruf: 1400, fass: 2200, slot: 2400, moewen: 1800,
    katapult: 1200, seemannslied: 1600, rechnung: 1100,
  };
  const EINSCHLAG = {
    saebel: 260, kanone: 420, enterhaken: 430,
    salve: 380, brandpfeil: 420, enterkommando: 800, pulverfass: 560,
    schlachtruf: 300, fass: 900, slot: 1900, moewen: 700,
    katapult: 620, seemannslied: 400, rechnung: 560,
  };

  function zufall(a, b) { return a + Math.random() * (b - a); }

  function erzeugen(art, w, h, einzel) {
    if (!DAUER[art]) return null;
    const fx = {
      kind: "spezial:" + art,
      art: art,
      startTime: performance.now(),
      duration: DAUER[art],
      einzel: einzel || {},
      cx: w / 2,
      cy: h / 2 + 10,
      w: w,
      h: h,
    };

    // Was pro Aufruf zufaellig sein DARF, wird hier einmal festgelegt -
    // nicht in der Zeichenroutine. Sonst zittert der Effekt, weil bei
    // jedem Bild neu gewuerfelt wird.
    if (art === "salve") {
      fx.schuesse = [0, 1, 2].map(function (i) {
        return { verzug: i * 0.13, ziel: [fx.cx + zufall(-45, 45), fx.cy + zufall(-35, 35)] };
      });
    } else if (art === "moewen") {
      const n = Math.min(200, (fx.einzel.moewen || 200));
      fx.voegel = [];
      for (let i = 0; i < n; i++) {
        fx.voegel.push({
          y: zufall(0.08, 0.92) * h,
          verzug: Math.random() * 0.55,
          tempo: zufall(0.9, 1.6),
          groesse: zufall(3, 7),
          schlag: Math.random() * 6,
        });
      }
    } else if (art === "enterkommando") {
      const n = Math.max(6, Math.min(18, 6 + (fx.einzel.angreiferHeute || 0)));
      fx.leute = [];
      for (let i = 0; i < n; i++) {
        fx.leute.push({ x: zufall(0.12, 0.88) * w, verzug: Math.random() * 0.4, tempo: zufall(0.8, 1.3) });
      }
    } else if (art === "saebel") {
      // Der Hieb kommt mal von links oben, mal von rechts oben -
      // sonst sieht der taegliche Angriff nach zwei Wochen aus wie
      // eine Schleife. Die Richtung steht hier fest, nicht in der
      // Zeichenroutine: sonst kippt der Schnitt mitten im Bild.
      fx.vonLinks = Math.random() < 0.5;
      fx.neigung = zufall(-0.22, 0.22);
    } else if (art === "kanone") {
      // Die Kanone ist das Gluecksspiel unter den dreien (10-50
      // Schaden). Wie stark der Einschlag ausfaellt, entscheidet der
      // Server; hier wird nur gestreut, wohin die Truemmer fliegen.
      fx.truemmer = [];
      for (let i = 0; i < 14; i++) {
        fx.truemmer.push({ winkel: Math.random() * Math.PI * 2, weite: zufall(0.5, 1),
                           groesse: zufall(2, 5) });
      }
      fx.abweichung = zufall(-30, 30);
    } else if (art === "enterhaken") {
      fx.hoehe = zufall(-25, 15);
    } else if (art === "seemannslied") {
      fx.noten = [];
      for (let i = 0; i < 14; i++) {
        fx.noten.push({ x: fx.cx + zufall(-90, 90), verzug: Math.random() * 0.6,
                        drift: zufall(-30, 30), zeichen: Math.random() < 0.5 ? "♪" : "♫" });
      }
    }
    return fx;
  }

  /* --- kleine Helfer, von mehreren Effekten benutzt --- */

  function ring(ctx, x, y, r, breite, farbe) {
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function funken(ctx, x, y, t, n, farbe, weite) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + t * 2;
      const d = t * weite;
      ctx.fillStyle = farbe;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, 4 * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* --- die elf --- */
  const male = {

    /* Drei Einschlaege kurz nacheinander, jeder mit Muendungsfeuer
       am Rand, Flugbahn und Aufschlagsring. */
    /* ============================================================
       DIE DREI GRUNDANGRIFFE
       ---------------------------------------------------
       Sie hatten bisher keine eigene Darstellung: community-boss.js
       zog fuer sie einen ZUFAELLIGEN Effekt aus vier allgemeinen
       (shot/saber/harpoon/curse). Ein Saebelhieb konnte also als
       Harpune erscheinen und ein Enterhaken als Fluch - die Anzeige
       hatte mit der Wahl des Spielers nichts zu tun.

       Sie sind bewusst kuerzer und ruhiger gehalten als die elf
       Spezialangriffe: man sieht sie jeden Tag. Was selten ist, darf
       laut sein; was taeglich kommt, muss man aushalten koennen.
    ============================================================ */

    /* Saebelhieb: ein Bogen zieht durch, der Schnitt leuchtet kurz
       nach. Verlaesslich, ohne Schnickschnack - genau wie der
       Angriff selbst (28-32 Schaden, kaum Streuung). */
    saebel: function (ctx, fx, t) {
      const richtung = fx.vonLinks ? 1 : -1;
      const spanne = fx.w * 0.42;
      const mx = fx.cx, my = fx.cy;

      // Phase 1: die Klinge faehrt durch
      const zug = Math.min(1, t / 0.42);
      if (zug < 1) {
        const p = zug * zug * (3 - 2 * zug);      // weich an, weich aus
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(fx.neigung);
        const x = -richtung * spanne + richtung * spanne * 2 * p;

        // Die Klinge hat Koerper: breiter Ruecken, schmale Schneide,
        // dazu ein Griff. Eine blosse Linie sah aus wie ein Kratzer.
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(Math.atan2(92, richtung * 26) - Math.PI / 2);
        const kl = ctx.createLinearGradient(-4, 0, 4, 0);
        kl.addColorStop(0, "#8fa4bd");
        kl.addColorStop(0.45, "#ffffff");
        kl.addColorStop(1, "#c3d2e6");
        ctx.fillStyle = kl;
        ctx.beginPath();
        ctx.moveTo(0, -52);            // Spitze
        ctx.lineTo(4, -30);
        ctx.lineTo(4, 34);
        ctx.lineTo(-4, 34);
        ctx.lineTo(-4, -30);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6b4a2a";     // Griff
        ctx.fillRect(-3, 34, 6, 16);
        ctx.fillStyle = "#d8b25a";     // Parierstange
        ctx.fillRect(-10, 31, 20, 4);
        ctx.restore();
        // Schliere hinter der Klinge
        const grad = ctx.createLinearGradient(x - richtung * 110, 0, x, 0);
        grad.addColorStop(0, "rgba(200,225,255,0)");
        grad.addColorStop(1, "rgba(220,238,255,.55)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.moveTo(x - richtung * 110, 6);
        ctx.lineTo(x, 6);
        ctx.stroke();
        ctx.restore();
      }

      // Phase 2: der Schnitt bleibt kurz stehen und verglueht
      if (t > 0.34) {
        const nt = Math.min(1, (t - 0.34) / 0.66);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(fx.neigung);
        ctx.globalAlpha = 1 - nt;
        ctx.strokeStyle = "#fff2d0";
        ctx.lineWidth = 3 * (1 - nt) + 1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-spanne, -18);
        ctx.lineTo(spanne, 18);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
        if (nt < 0.5) funken(ctx, mx, my, nt * 2, 7, "#ffe6b0", 55);
      }
    },

    /* Kanonenschuss: Kugel von links, Rauchfahne, harter Einschlag
       mit Druckring und Truemmern. Das Gluecksspiel der drei - der
       Einschlag darf entsprechend wuchtig ausfallen. */
    kanone: function (ctx, fx, t) {
      const flug = Math.min(1, t / 0.44);
      const zielX = fx.cx + fx.abweichung, zielY = fx.cy;

      if (flug < 1) {
        const vonX = -30, vonY = fx.h * 0.72;
        const x = vonX + (zielX - vonX) * flug;
        // leichter Bogen, sonst wirkt es wie ein Laser
        const y = vonY + (zielY - vonY) * flug - Math.sin(flug * Math.PI) * 42;

        // Rauchfahne: aeltere Wolken sind groesser und blasser
        for (let i = 1; i <= 7; i++) {
          const f = Math.max(0, flug - i * 0.045);
          if (f <= 0) continue;
          const rx = vonX + (zielX - vonX) * f;
          const ry = vonY + (zielY - vonY) * f - Math.sin(f * Math.PI) * 42;
          ctx.fillStyle = "rgba(190,190,195," + (0.20 * (1 - i / 8)) + ")";
          ctx.beginPath();
          ctx.arc(rx, ry, 5 + i * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Muendungsfeuer im ersten Moment
        if (flug < 0.16) {
          ctx.fillStyle = "rgba(255,214,140," + (1 - flug * 6) + ")";
          ctx.beginPath();
          ctx.arc(vonX, vonY, 34 * (1 - flug * 5), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "#20242c";
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,190,120,.5)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
      } else {
        const nt = Math.min(1, (t - 0.44) / 0.56);
        // Blitz, Druckring, Truemmer
        if (nt < 0.22) {
          ctx.fillStyle = "rgba(255,236,190," + (1 - nt * 4.5) + ")";
          ctx.beginPath(); ctx.arc(zielX, zielY, 52 * (1 - nt * 2), 0, Math.PI * 2); ctx.fill();
        }
        ring(ctx, zielX, zielY, 14 + nt * 96, 6 * (1 - nt), "rgba(255,176,96," + (1 - nt) + ")");
        ring(ctx, zielX, zielY, 14 + nt * 58, 3 * (1 - nt), "rgba(255,232,190," + (1 - nt) + ")");
        ctx.globalAlpha = 1 - nt;
        fx.truemmer.forEach(function (b) {
          const d = nt * 120 * b.weite;
          ctx.fillStyle = "#3a3d46";
          ctx.beginPath();
          ctx.arc(zielX + Math.cos(b.winkel) * d,
                  zielY + Math.sin(b.winkel) * d + nt * nt * 55,
                  b.groesse * (1 - nt * 0.5), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    },

    /* Enterhaken: Haken an der Leine fliegt raus, beisst sich fest,
       die Leine strafft sich und reisst. Hat der Server einen
       Zusatzangriff gutgeschrieben (jeder dritte Wurf), blitzt am
       Ende ein zweiter Haken auf - man SIEHT den Bonus, statt ihn
       nur im Meldungstext zu lesen. */
    enterhaken: function (ctx, fx, t) {
      const vonX = -20, vonY = fx.h * 0.78;
      const zielX = fx.cx - 10, zielY = fx.cy + fx.hoehe;
      const wurf = Math.min(1, t / 0.4);
      const x = vonX + (zielX - vonX) * wurf;
      const y = vonY + (zielY - vonY) * wurf - Math.sin(wurf * Math.PI) * 60;

      // Die Leine - im Flug durchhaengend, nach dem Treffer straff
      ctx.strokeStyle = "rgba(196,176,140,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(vonX, vonY);
      if (wurf < 1) {
        ctx.quadraticCurveTo((vonX + x) / 2, Math.max(y, vonY) + 30, x, y);
      } else {
        // Zug: die Leine zittert kurz nach
        const zug = Math.min(1, (t - 0.4) / 0.6);
        const zittern = Math.sin(zug * 26) * 6 * (1 - zug);
        ctx.quadraticCurveTo((vonX + zielX) / 2, (vonY + zielY) / 2 + zittern, zielX, zielY);
      }
      ctx.stroke();

      // Der Haken selbst
      ctx.save();
      ctx.translate(wurf < 1 ? x : zielX, wurf < 1 ? y : zielY);
      ctx.rotate(wurf < 1 ? wurf * 7 : 0.4);
      ctx.strokeStyle = "#cbd3de";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-9, -9);
      ctx.lineTo(0, 4);
      ctx.arc(0, 4, 7, -Math.PI * 0.5, Math.PI * 0.85);
      ctx.stroke();
      ctx.restore();

      if (wurf >= 1) {
        const nt = Math.min(1, (t - 0.4) / 0.6);
        ring(ctx, zielX, zielY, nt * 54, 4 * (1 - nt), "rgba(210,225,245," + (1 - nt) + ")");
        if (nt < 0.45) funken(ctx, zielX, zielY, nt / 0.45, 6, "#dfe8f5", 42);

        // Jeder dritte Wurf schenkt einen Angriff - das kommt vom
        // Server als einzel.zusatzAngriff, hier wird es nur gezeigt.
        if (fx.einzel.zusatzAngriff && nt > 0.3) {
          const bt = Math.min(1, (nt - 0.3) / 0.7);
          ctx.save();
          ctx.globalAlpha = bt < 0.75 ? 1 : (1 - bt) * 4;
          ctx.font = "bold 20px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#f0c96a";
          ctx.fillText("+1", zielX + 34, zielY - 26 - bt * 26);
          ctx.restore();
        }
      }
    },

    salve: function (ctx, fx, t) {
      fx.schuesse.forEach(function (s, i) {
        const lokal = (t - s.verzug) / (1 - s.verzug * 2);
        if (lokal <= 0) return;
        const vonX = -20, vonY = fx.h * (0.35 + i * 0.2);
        if (lokal < 1) {
          const x = vonX + (s.ziel[0] - vonX) * lokal;
          const y = vonY + (s.ziel[1] - vonY) * lokal;
          ctx.strokeStyle = "rgba(255,190,120,.4)";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(vonX, vonY); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = "#ffd9a0";
          ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
          if (lokal < 0.25) {
            ctx.fillStyle = "rgba(255,220,140," + (1 - lokal * 4) + ")";
            ctx.beginPath(); ctx.arc(vonX, vonY, 26 * (1 - lokal * 3), 0, Math.PI * 2); ctx.fill();
          }
        } else {
          const nt = Math.min(1, lokal - 1);
          ring(ctx, s.ziel[0], s.ziel[1], nt * 70, 5 * (1 - nt), "rgba(255,170,90," + (1 - nt) + ")");
          funken(ctx, s.ziel[0], s.ziel[1], nt, 8, "#ffcf8a", 60);
        }
      });
    },

    /* Ein brennender Pfeil im Bogen, danach lecken Flammen hoch. */
    brandpfeil: function (ctx, fx, t) {
      const flug = Math.min(1, t / 0.47);
      const x = -30 + (fx.cx + 30) * flug;
      const y = fx.h * 0.95 - Math.sin(flug * Math.PI) * fx.h * 0.55;
      if (flug < 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(Math.cos(flug * Math.PI) * -1.7, 1));
        ctx.strokeStyle = "#e8d6b0"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(12, 0); ctx.stroke();
        ctx.fillStyle = "rgba(255,150,50,.9)";
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(-16 - i * 7, Math.sin(t * 30 + i) * 3, 6 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else {
        // Flammen am Einschlag: feste Positionen, nur die Hoehe atmet.
        const nt = (t - 0.47) / 0.53;
        for (let i = 0; i < 9; i++) {
          const fxx = fx.cx - 60 + i * 15;
          const hoehe = (26 + Math.sin(i * 2.3 + t * 22) * 12) * (1 - nt * 0.45);
          const g = ctx.createLinearGradient(fxx, fx.cy + 30, fxx, fx.cy + 30 - hoehe);
          g.addColorStop(0, "rgba(255,90,20," + (0.75 * (1 - nt)) + ")");
          g.addColorStop(1, "rgba(255,220,120,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(fxx - 7, fx.cy + 30);
          ctx.quadraticCurveTo(fxx, fx.cy + 30 - hoehe, fxx + 7, fx.cy + 30);
          ctx.fill();
        }
      }
    },

    /* Enternde Piraten klettern an Tauen von unten hoch. Je mehr
       heute schon angegriffen haben, desto mehr sind es. */
    enterkommando: function (ctx, fx, t) {
      fx.leute.forEach(function (p) {
        const lokal = Math.max(0, Math.min(1, (t - p.verzug) * p.tempo * 1.7));
        if (lokal <= 0) return;
        const y = fx.h * 1.05 - lokal * (fx.h * 0.62);
        ctx.strokeStyle = "rgba(190,160,110,.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, fx.h * 1.05); ctx.lineTo(p.x, y); ctx.stroke();
        ctx.fillStyle = "#14100c";
        ctx.beginPath(); ctx.arc(p.x, y - 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(p.x - 3.5, y - 4, 7, 12);
        // Saebel
        ctx.strokeStyle = "rgba(220,225,235,.8)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + 4, y);
        ctx.lineTo(p.x + 11, y - 7 - Math.sin(t * 18 + p.x) * 3);
        ctx.stroke();
      });
    },

    /* Ein Fass poltert heran und geht hoch. */
    pulverfass: function (ctx, fx, t) {
      if (t < 0.56) {
        const k = t / 0.56;
        const x = -30 + (fx.cx + 30) * k;
        const y = fx.h * 0.92 - Math.sin(k * Math.PI) * fx.h * 0.3;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(k * 9);
        ctx.fillStyle = "#6b4423";
        ctx.fillRect(-13, -17, 26, 34);
        ctx.strokeStyle = "#2a1a0c"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-13, -6); ctx.lineTo(13, -6);
        ctx.moveTo(-13, 6); ctx.lineTo(13, 6); ctx.stroke();
        ctx.restore();
        // Zuendschnur
        ctx.fillStyle = "rgba(255,210,120,.9)";
        ctx.beginPath(); ctx.arc(x + 6, y - 20, 3 + Math.sin(t * 40) * 1.5, 0, Math.PI * 2); ctx.fill();
      } else {
        const nt = (t - 0.56) / 0.44;
        const r = nt * Math.min(fx.w, fx.h) * 0.55;
        const g = ctx.createRadialGradient(fx.cx, fx.cy, 0, fx.cx, fx.cy, Math.max(1, r));
        g.addColorStop(0, "rgba(255,240,190," + (1 - nt) + ")");
        g.addColorStop(0.4, "rgba(255,140,40," + (0.8 * (1 - nt)) + ")");
        g.addColorStop(1, "rgba(120,40,10,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx.cx, fx.cy, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
        funken(ctx, fx.cx, fx.cy, nt, 16, "#ffd08a", 150);
      }
    },

    /* Kein Schaden, nur Schall: Ringe laufen vom Spieler nach aussen. */
    schlachtruf: function (ctx, fx, t) {
      for (let i = 0; i < 4; i++) {
        const lokal = t - i * 0.13;
        if (lokal <= 0) continue;
        const r = lokal * Math.max(fx.w, fx.h) * 0.75;
        ring(ctx, fx.cx, fx.h * 0.95, r, 4 * (1 - lokal), "rgba(240,201,106," + (0.55 * (1 - lokal)) + ")");
      }
      ctx.fillStyle = "rgba(240,201,106," + (0.9 * (1 - t)) + ")";
      ctx.font = "bold 26px Oswald, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ALLE MANN!", fx.cx, fx.h * 0.86 - t * 26);
      ctx.textAlign = "start";
    },

    /* Das Fass, das niemand oeffnen sollte. Weisser Blitz,
       Druckwelle, Pilzwolke - und ein langes Nachglimmen. */
    fass: function (ctx, fx, t) {
      if (t < 0.41) {   // Anflug
        const k = t / 0.41;
        const x = -30 + (fx.cx + 30) * k;
        const y = fx.h * 0.9 - Math.sin(k * Math.PI) * fx.h * 0.45;
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * 12);
        ctx.fillStyle = "#3c4a2a"; ctx.fillRect(-15, -19, 30, 38);
        ctx.fillStyle = "#d8d24a"; ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center"; ctx.fillText("☢", 0, 6); ctx.textAlign = "start";
        ctx.restore();
        return;
      }
      const nt = (t - 0.41) / 0.59;
      // 1. Weissblitz, sehr kurz
      if (nt < 0.16) {
        ctx.fillStyle = "rgba(255,255,255," + (1 - nt / 0.16) + ")";
        ctx.fillRect(-20, -20, fx.w + 40, fx.h + 40);
      }
      // 2. Druckwelle
      const r = nt * Math.max(fx.w, fx.h) * 1.1;
      ring(ctx, fx.cx, fx.cy, r, 10 * (1 - nt), "rgba(255,240,200," + (0.9 * (1 - nt)) + ")");
      // 3. Pilzwolke: Stiel und Hut steigen auf
      const steig = Math.min(1, nt * 1.5);
      const kopfY = fx.cy - steig * fx.h * 0.34;
      ctx.fillStyle = "rgba(90,70,55," + (0.75 * (1 - nt * 0.6)) + ")";
      ctx.beginPath();
      ctx.ellipse(fx.cx, fx.cy + 20, 22 + steig * 12, 40 * steig, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (Math.PI * 2 * i) / 7 + nt * 1.2;
        ctx.beginPath();
        ctx.arc(fx.cx + Math.cos(a) * (30 + steig * 34), kopfY + Math.sin(a) * 13,
                20 + steig * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /* Drei Walzen. Die Symbole kommen vom Server - hier wird nichts
       gewuerfelt, nur ausgerollt und angehalten. */
    slot: function (ctx, fx, t) {
      const symbole = ["☠", "⚓", "⭐", "\u{1f48e}", "\u{1f36f}", "\u{1f9ed}"];
      const ergebnis = (fx.einzel.walzen || [0, 1, 2]);
      const bx = fx.cx - 96, by = fx.cy - 130;
      ctx.fillStyle = "rgba(18,14,10,.92)";
      ctx.fillRect(bx - 10, by - 10, 212, 90);
      ctx.strokeStyle = "rgba(240,201,106,.75)"; ctx.lineWidth = 3;
      ctx.strokeRect(bx - 10, by - 10, 212, 90);

      ctx.font = "40px sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < 3; i++) {
        const haelt = 0.42 + i * 0.16;      // Walzen halten nacheinander an
        const x = bx + 32 + i * 64;
        if (t < haelt) {
          // laufende Walze: verwischte Symbole
          const rollen = (t * 26 + i * 3) % symbole.length;
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = "#e8dcc0";
          ctx.fillText(symbole[Math.floor(rollen) % symbole.length], x, by + 52);
          ctx.fillText(symbole[(Math.floor(rollen) + 1) % symbole.length], x, by + 12);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = "#fff3d6";
          ctx.fillText(symbole[ergebnis[i] % symbole.length], x, by + 52);
        }
      }
      ctx.textAlign = "start";

      // Nach dem letzten Halt: Jackpot feiern oder Niete zeigen
      if (t > 0.78) {
        const nt = (t - 0.78) / 0.22;
        const drei = ergebnis[0] === ergebnis[1] && ergebnis[1] === ergebnis[2];
        if (drei) {
          ring(ctx, fx.cx, by + 35, nt * 190, 6 * (1 - nt), "rgba(240,201,106," + (1 - nt) + ")");
          funken(ctx, fx.cx, by + 35, nt, 14, "#ffd76b", 170);
        }
      }
    },

    /* Zweihundert Moewen ziehen quer durchs Bild. */
    moewen: function (ctx, fx, t) {
      ctx.strokeStyle = "rgba(240,240,245,.85)";
      ctx.lineWidth = 1.6;
      fx.voegel.forEach(function (v) {
        const lokal = (t - v.verzug) * v.tempo;
        if (lokal <= 0 || lokal > 1.3) return;
        const x = -25 + lokal * (fx.w + 50);
        const schlag = Math.sin(t * 34 + v.schlag) * v.groesse * 0.55;
        ctx.beginPath();
        ctx.moveTo(x - v.groesse, v.y + schlag);
        ctx.lineTo(x, v.y - schlag * 0.4);
        ctx.lineTo(x + v.groesse, v.y + schlag);
        ctx.stroke();
      });
    },

    /* Ein kleinerer, sehr empoerter Krake wird geschleudert. */
    katapult: function (ctx, fx, t) {
      const k = Math.min(1, t / 0.52);
      const x = -40 + (fx.cx + 40) * k;
      const y = fx.h * 0.95 - Math.sin(k * Math.PI) * fx.h * 0.6;
      const platt = t > 0.52 ? Math.min(1, (t - 0.52) / 0.18) : 0;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k * 7);
      ctx.scale(1 + platt * 0.5, 1 - platt * 0.45);
      ctx.fillStyle = "#a8431a";
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        ctx.strokeStyle = "#a8431a"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * 10, 12);
        ctx.quadraticCurveTo(Math.sin(a) * 24, 26, Math.sin(a) * 20 + Math.sin(t * 20 + i) * 6, 36);
        ctx.stroke();
      }
      // sehr empoerte Augen
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-7, -4, 5, 0, Math.PI * 2); ctx.arc(7, -4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#140704";
      ctx.beginPath(); ctx.arc(-7, -4, 2.4, 0, Math.PI * 2); ctx.arc(7, -4, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (platt > 0) funken(ctx, x, y, platt, 10, "rgba(200,120,70,.9)", 70);
    },

    /* Noten steigen auf, der Boss doest weg. */
    seemannslied: function (ctx, fx, t) {
      ctx.font = "24px serif";
      ctx.textAlign = "center";
      fx.noten.forEach(function (n) {
        const lokal = t - n.verzug;
        if (lokal <= 0) return;
        const y = fx.h * 0.92 - lokal * fx.h * 0.75;
        ctx.fillStyle = "rgba(240,201,106," + Math.max(0, 0.9 - lokal) + ")";
        ctx.fillText(n.zeichen, n.x + Math.sin(lokal * 5) * n.drift, y);
      });
      if (t > 0.45) {
        const nt = (t - 0.45) / 0.55;
        ctx.font = "bold 30px Oswald, sans-serif";
        ctx.fillStyle = "rgba(200,220,255," + Math.max(0, 0.85 - nt * 0.85) + ")";
        ctx.fillText("Z z z", fx.cx + 60, fx.cy - 70 - nt * 24);
      }
      ctx.textAlign = "start";
    },

    /* Ein Zettel flattert heran und klatscht dem Boss ins Gesicht. */
    rechnung: function (ctx, fx, t) {
      const k = Math.min(1, t / 0.52);
      const x = fx.w + 40 - (fx.w * 0.5 + 80) * k;
      const y = fx.cy - 60 + Math.sin(k * 7) * 26;
      const klatsch = t > 0.52 ? Math.min(1, (t - 0.52) / 0.2) : 0;

      ctx.save();
      ctx.translate(x, y + klatsch * 40);
      ctx.rotate(Math.sin(k * 7) * 0.4 * (1 - klatsch));
      ctx.fillStyle = "#f2ead6";
      ctx.fillRect(-26, -34, 52, 68);
      ctx.strokeStyle = "rgba(60,40,20,.35)"; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(-19, -22 + i * 10); ctx.lineTo(19 - (i % 2) * 9, -22 + i * 10); ctx.stroke();
      }
      ctx.fillStyle = "#a8271b";
      ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("OFFEN", 0, 26);
      ctx.textAlign = "start";
      ctx.restore();

      if (klatsch > 0) funken(ctx, x, y + 40, klatsch, 8, "rgba(240,230,200,.9)", 50);
    },
  };

  function zeichnen(ctx, fx, t) {
    if (!fx || !fx.art || !male[fx.art]) return false;
    ctx.save();
    try { male[fx.art](ctx, fx, Math.max(0, Math.min(1, t))); }
    finally { ctx.restore(); }
    return true;
  }

  window.fhBossSpezial = {
    erzeugen: erzeugen,
    zeichnen: zeichnen,
    einschlagNach: function (art) { return EINSCHLAG[art] || 300; },
    dauer: function (art) { return DAUER[art] || 0; },
    kennt: function (art) { return !!DAUER[art]; },
  };
})();
