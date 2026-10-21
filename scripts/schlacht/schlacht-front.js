/* ======================================================
   STERNENSCHLACHT: DIE FRONT (Migration 62)
   ---------------------------------------------------
   Mit der Freigabe "schlachtFront" kaempfen beide Seiten um eine Front
   in der Mitte. Alle front_takt_sek (Standard 10 s) rechnet die
   Datenbank einen TAKT ab: Druck gegen Abwehr verschiebt die Front,
   ein Ereignis wirkt (Sturmangriff, Nachschub, Feuerpause,
   Meteorhagel, Gegenstoss, Ruhe), jeder bekommt Kampfpunkte.

   Diese Datei zeigt nur und schickt Befehle:
   - die FRONTLEISTE unter dem Feld (Tauziehen, Countdown zum naechsten
     Takt, aktuelles Ereignis, Ausgleich-Hinweis),
   - die HALTUNG (Angriff / Ausgewogen / Verteidigung ->
     schlacht_haltung),
   - die VERBESSERUNGEN mit Kampfpunkten (Vorstoss, Bollwerk,
     Reparatur -> schlacht_front_verbessern),
   - auf dem Schlachtfeld die leuchtende Frontlinie und zu jedem Takt
     das Ereignis gross in der Mitte.
   Ist der Countdown abgelaufen, holt schlacht.js sofort den neuen
   Stand (takt()-Rueckruf) - so passiert wirklich alle 10 s etwas.

   API (window.fhSchlachtFront):
     aktiv(stand)                         -> true, wenn die Front laeuft
     bauen(fuss, o)                       -> Leiste und Steuerung einhaengen
        o = { rpc, status, fehler, parteiName, parteiFarbe, klang,
              serverJetzt, neuLaden }
     auffrischen(stand)                   - nach jedem Stand
     bild(ctx, b, h, hoch, jetzt, ruhig)  - Frontlinie und Ereignis
     takt(jetzt)                          - Countdown (je Bild)
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  /* lucide (ISC): swords, scale, shield, chevrons-right, castle, wrench */
  const SVG = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  const SYM = {
    angriff: SVG('<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>'),
    ausgewogen: SVG('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
    verteidigung: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
    vorstoss: SVG('<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>'),
    bollwerk: SVG('<path d="M10 5V3H8v2H6V3H4v8h16V3h-2v2h-2V3h-2v2z"/><path d="M4 11v10h16V11"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>'),
    reparatur: SVG('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
  };
  const EREIGNISSE = ["ruhe", "sturmangriff", "nachschub", "feuerpause", "meteorhagel", "gegenstoss"];
  const EREIGNIS_FARBE = { ruhe: "#8296ad", sturmangriff: "#ff6a2a", nachschub: "#55c878", feuerpause: "#42b8ff", meteorhagel: "#d6a84f", gegenstoss: "#a66bff" };

  let o = null;              // Rueckrufe aus schlacht.js
  let stand = null;          // stand.front
  let frontAnzeige = 0;      // weich nachgefuehrte Frontposition
  let letzterTakt = null;    // "id:runde:takt", fuer das Ereignis-Banner
  let banner = null;         // { name, farbe, t0 }
  let angestossen = null;    // Takt, fuer den schon neu geladen wurde
  let beschaeftigt = false;

  function aktiv(s) { return !!(s && s.front && s.status === "laeuft" && s.phase !== "sammeln"); }

  /* ------------------------------------------------------
     LEISTE UND STEUERUNG
  ------------------------------------------------------ */
  function bauen(fuss, rueck) {
    o = rueck;
    const box = el("div", "sl-front");
    box.id = "schlacht-front";

    const leiste = el("div", "sl-front-leiste");
    leiste.setAttribute("role", "img");
    leiste.id = "schlacht-front-leiste";
    const spur = el("div", "sl-front-spur");
    spur.append(el("span", "sl-front-links"), el("span", "sl-front-rechts"), el("span", "sl-front-mitte"));
    const marke = el("span", "sl-front-marke");
    marke.id = "schlacht-front-marke";
    spur.appendChild(marke);
    leiste.appendChild(spur);
    const info = el("div", "sl-front-info");
    const uhr = el("span", "sl-front-uhr");
    uhr.id = "schlacht-front-uhr";
    const ereignis = el("span", "sl-front-ereignis");
    ereignis.id = "schlacht-front-ereignis";
    const ausgleich = el("span", "sl-front-ausgleich");
    ausgleich.id = "schlacht-front-ausgleich";
    ausgleich.hidden = true;
    info.append(uhr, ereignis, ausgleich);

    const steuer = el("div", "sl-front-steuer");
    const haltung = el("div", "sl-front-haltung");
    haltung.setAttribute("role", "radiogroup");
    haltung.setAttribute("aria-label", t("schlacht.front.haltung", "Haltung"));
    ["angriff", "ausgewogen", "verteidigung"].forEach(function (h) {
      const b = el("button", "sl-front-h");
      b.type = "button";
      b.dataset.haltung = h;
      b.setAttribute("role", "radio");
      b.innerHTML = SYM[h];   // festes SVG
      b.appendChild(el("span", null, t("schlacht.front." + h, h)));
      b.title = t("schlacht.front." + h + "Tipp", "");
      b.addEventListener("click", function () { haltungSetzen(h); });
      haltung.appendChild(b);
    });
    const kp = el("div", "sl-front-kp");
    kp.id = "schlacht-front-kp";
    const upg = el("div", "sl-front-upg");
    ["vorstoss", "bollwerk", "reparatur"].forEach(function (a) {
      const b = el("button", "sl-front-u");
      b.type = "button";
      b.dataset.art = a;
      b.innerHTML = SYM[a];   // festes SVG
      b.appendChild(el("span", "sl-front-u-text"));
      b.addEventListener("click", function () { verbessern(a); });
      upg.appendChild(b);
    });
    steuer.append(haltung, kp, upg);

    box.append(leiste, info, steuer);
    fuss.insertBefore(box, fuss.firstChild);
  }

  function auffrischen(s) {
    stand = s && s.front ? s.front : null;
    const box = document.getElementById("schlacht-front");
    if (!box) return;
    box.hidden = !aktiv(s);
    if (!stand) return;
    const ev = EREIGNISSE.indexOf(stand.ereignis) >= 0 ? stand.ereignis : null;
    const schl = (s.id || "") + ":" + (s.runde || 1) + ":" + stand.takt;
    if (letzterTakt && schl !== letzterTakt && ev && stand.takt > 0) {
      banner = { name: t("schlacht.front.e." + ev, ev), text: t("schlacht.front.e." + ev + "Text", ""), farbe: EREIGNIS_FARBE[ev], t0: performance.now() };
      if (o && o.klang) o.klang().akzent(ev === "ruhe" ? "zaehlen" : "ereignis");
    }
    letzterTakt = schl;
    const e2 = document.getElementById("schlacht-front-ereignis");
    if (e2) {
      e2.textContent = ev ? t("schlacht.front.e." + ev, ev) : "";
      e2.style.setProperty("--ev", ev ? EREIGNIS_FARBE[ev] : "transparent");
    }
    const ag = document.getElementById("schlacht-front-ausgleich");
    if (ag) {
      const l = Number(stand.ausgleich_links) || 1, r = Number(stand.ausgleich_rechts) || 1;
      const seite = l > 1 ? "menschen" : r > 1 ? "aliens" : null;
      ag.hidden = !seite;
      if (seite) ag.textContent = t("schlacht.front.ausgleich", "Ausgleich ×{f} für {p}")
        .replace("{f}", String(seite === "menschen" ? l : r).replace(".", ",")).replace("{p}", o ? o.parteiName(seite) : seite);
    }
    const leiste = document.getElementById("schlacht-front-leiste");
    if (leiste && o) {
      leiste.style.setProperty("--links", o.parteiFarbe("menschen"));
      leiste.style.setProperty("--rechts", o.parteiFarbe("aliens"));
      leiste.setAttribute("aria-label", t("schlacht.front.aria", "Front: {w}").replace("{w}", frontText(Number(stand.wert) || 0)));
    }
    /* Haltung und Kampfpunkte */
    const m = stand.meine;
    document.querySelectorAll("#schlacht-front .sl-front-h").forEach(function (b) {
      const an = !!(m && m.haltung === b.dataset.haltung);
      b.setAttribute("aria-checked", an ? "true" : "false");
      b.disabled = !m;
    });
    const kp = document.getElementById("schlacht-front-kp");
    if (kp) kp.textContent = m ? t("schlacht.front.kp", "{n} KP").replace("{n}", m.kp) : "";
    upgAuffrischen();
  }

  function frontText(w) {
    if (Math.abs(w) < 1 || !o) return t("schlacht.front.mitte", "ausgeglichen");
    return t("schlacht.front.draengt", "{p} drängt ({w} %)").replace("{p}", o.parteiName(w > 0 ? "menschen" : "aliens")).replace("{w}", Math.round(Math.abs(w)));
  }

  function upgAuffrischen() {
    const m = stand && stand.meine;
    document.querySelectorAll("#schlacht-front .sl-front-u").forEach(function (b) {
      const a = b.dataset.art, txt = b.querySelector(".sl-front-u-text");
      if (!m) { b.disabled = true; txt.textContent = t("schlacht.front.u." + a, a); return; }
      let preis, zusatz = "";
      if (a === "reparatur") {
        preis = 3;
        const ab = m.reparatur_at ? Date.parse(m.reparatur_at) + 30000 - (o ? o.serverJetzt() : Date.now()) : 0;
        if (ab > 0) zusatz = " · " + Math.ceil(ab / 1000) + " s";
        b.disabled = ab > 0 || m.kp < preis;
      } else {
        const stufe = Number(m[a]) || 0;
        preis = 2 * (stufe + 1);
        zusatz = " " + stufe + "/3";
        b.disabled = stufe >= 3 || m.kp < preis;
        if (stufe >= 3) preis = null;
      }
      txt.textContent = t("schlacht.front.u." + a, a) + zusatz + (preis ? " · " + preis + " KP" : "");
    });
  }

  async function haltungSetzen(h) {
    if (beschaeftigt || !o) return;
    beschaeftigt = true;
    try {
      const erg = await o.rpc("schlacht_haltung", { p_haltung: h });
      if (erg && erg.ok) {
        if (stand && stand.meine) stand.meine.haltung = h;
        document.querySelectorAll("#schlacht-front .sl-front-h").forEach(function (b) { b.setAttribute("aria-checked", b.dataset.haltung === h ? "true" : "false"); });
        o.status(t("schlacht.front." + h + "Ok", "Haltung: {h}").replace("{h}", t("schlacht.front." + h, h)), false);
        if (o.klang) o.klang().akzent("zaehlen");
      } else if (erg) o.fehler(erg.grund);
    } catch (err) {
      console.warn("Front: Haltung fehlgeschlagen:", err);
      o.fehler(null);
    } finally {
      beschaeftigt = false;
    }
  }

  async function verbessern(a) {
    if (beschaeftigt || !o) return;
    beschaeftigt = true;
    try {
      const erg = await o.rpc("schlacht_front_verbessern", { p_art: a });
      if (erg && erg.ok) {
        if (stand) stand.meine = erg.meine;
        auffrischenKurz();
        o.status(a === "reparatur" ? t("schlacht.front.repariert", "Reparatur: +{n} Leben").replace("{n}", Math.round(erg.wert))
          : t("schlacht.front.verbessert", "{u} verbessert!").replace("{u}", t("schlacht.front.u." + a, a)), false);
        if (o.klang) o.klang().akzent(a === "reparatur" ? "runde" : "spezial");
      } else if (erg) o.fehler(erg.grund);
    } catch (err) {
      console.warn("Front: Verbessern fehlgeschlagen:", err);
      o.fehler(null);
    } finally {
      beschaeftigt = false;
    }
  }
  function auffrischenKurz() {
    const kp = document.getElementById("schlacht-front-kp");
    if (kp && stand && stand.meine) kp.textContent = t("schlacht.front.kp", "{n} KP").replace("{n}", stand.meine.kp);
    upgAuffrischen();
  }

  /* ------------------------------------------------------
     JE BILD
  ------------------------------------------------------ */
  function takt(jetzt) {
    if (!stand || !o) return;
    const bis = Date.parse(stand.naechster_at) - o.serverJetzt();
    const u = document.getElementById("schlacht-front-uhr");
    if (u) u.textContent = t("schlacht.front.takt", "Nächster Takt in {s} s").replace("{s}", Math.max(0, Math.ceil(bis / 1000)));
    /* Marke weich nachfuehren */
    frontAnzeige += ((Number(stand.wert) || 0) - frontAnzeige) * 0.08;
    const m = document.getElementById("schlacht-front-marke");
    if (m) m.style.left = (50 + frontAnzeige / 2) + "%";
    /* Takt faellig: sofort den neuen Stand holen (einmal je Takt). */
    if (bis <= 150 && angestossen !== stand.naechster_at && o.neuLaden) {
      angestossen = stand.naechster_at;
      setTimeout(o.neuLaden, 300);
    }
    if (jetzt % 500 < 20) upgAuffrischen();
  }

  function bild(ctx, b, h, hoch, jetzt, ruhig) {
    if (!stand) return;
    /* Frontlinie: Mitte = 0, +100 = an der Linie der rechten Seite. */
    const f = frontAnzeige / 100;
    const farbeL = o ? o.parteiFarbe("menschen") : "#42b8ff", farbeR = o ? o.parteiFarbe("aliens") : "#a66bff";
    const puls = ruhig ? 0.6 : 0.6 + 0.4 * Math.sin(jetzt * 0.006);
    ctx.save();
    if (!hoch) {
      const x = b / 2 + f * b * 0.3;
      const g = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, f >= 0 ? farbeL : farbeR); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.18 * puls; ctx.fillStyle = g; ctx.fillRect(x - 40, 0, 80, h);
      ctx.globalAlpha = 0.85; ctx.strokeStyle = f >= 0 ? farbeL : farbeR; ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = ruhig ? 0 : -jetzt * 0.03;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    } else {
      const y = h / 2 - f * h * 0.3;
      const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, f >= 0 ? farbeL : farbeR); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.18 * puls; ctx.fillStyle = g; ctx.fillRect(0, y - 40, b, 80);
      ctx.globalAlpha = 0.85; ctx.strokeStyle = f >= 0 ? farbeL : farbeR; ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = ruhig ? 0 : -jetzt * 0.03;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(b, y); ctx.stroke();
    }
    ctx.restore();

    /* Ereignis des Takts gross in der Mitte, 1,6 s lang */
    if (banner) {
      const z = (jetzt - banner.t0) / 1600;
      if (z >= 1) { banner = null; return; }
      const a = z < 0.15 ? z / 0.15 : z > 0.7 ? (1 - z) / 0.3 : 1;
      const sk = ruhig ? 1 : 0.9 + 0.1 * Math.min(1, z / 0.15);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(b / 2, h * 0.42);
      ctx.scale(sk, sk);
      ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(Math.min(46, b / 12)) + "px Oswald, 'Arial Narrow', sans-serif";
      ctx.shadowColor = banner.farbe; ctx.shadowBlur = 24;
      ctx.fillStyle = banner.farbe;
      ctx.fillText(banner.name.toUpperCase(), 0, 0);
      if (banner.text) {
        ctx.shadowBlur = 8;
        ctx.font = "600 " + Math.round(Math.min(17, b / 30)) + "px Inter, sans-serif";
        ctx.fillStyle = "#e8edf4";
        ctx.fillText(banner.text, 0, Math.min(34, b / 16));
      }
      ctx.restore();
    }
  }

  window.fhSchlachtFront = { aktiv: aktiv, bauen: bauen, auffrischen: auffrischen, bild: bild, takt: takt };
})();
