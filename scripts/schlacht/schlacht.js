/* ======================================================
   LIVE-STERNENSCHLACHT (Migrationen 49 und 50)
   ---------------------------------------------------
   Seite #sternenschlacht, nur im Jahr 2100 in der Navigation.
   Der Admin startet die Schlacht; die Datenbank haelt fest, wer
   mitkaempft, und rechnet den Stand (schlacht_stand). Seit 50 laeuft
   sie endlos in Runden, bis der Admin sie beendet: Faellt eine Seite
   auf 0, gibt es einen Rundensieg, und die Datenbank stellt beide
   Flotten neu auf (neue Spieler, Hangar-Ausbauten, Spezial wieder
   frei). Eine leere Seite fuellt eine Uebungsflotte ("ki-...").

   VOLLBILD: Die Schlacht fuellt immer das ganze Fenster
   (#fh-schlacht-buehne, haengt an body und steht in den :not-Listen
   von 95 und 96 - kein Farbfilter, kein Rand von #fh-main). X oder
   Esc fuehren zur vorigen Seite zurueck. Kopf (Runde, Rundensiege,
   Ton, Schliessen) oben, Schlachtfeld in der Mitte, Banner und
   Steuerung unten. Auf hohen Bildschirmen (Handy hochkant) stehen
   die Menschen unten und die Aliens oben.

   Der Browser zeigt nur:
   - das Schlachtfeld (Canvas): jede Einheit mit eigener Form und
     sichtbarem Ausbau (scripts/hangar/schiffe.js), jeder Typ mit
     eigener Waffe, Explosionen beim Ausfall (schlacht-fx.js).
     Hoechstens 60 Einheiten je Seite einzeln; mit sinkendem Leben
     einer Seite fallen ihre Schiffe nach und nach aus.
   - Ziel antippen: Gegner anklicken -> schlacht_ziel (alle 5 s).
   - Spezialangriff: einmal je Runde -> schlacht_spezial.
   - das Prozentbanner unten: Anteil am verbliebenen Leben der
     laufenden Runde; oben Rundennummer und Rundensiege.
   - am Ende das Siegerbanner und die Ruhmeshalle.
   Musik und Klang: schlacht-klang.js (startet beim Oeffnen).

   KAMPFORT (Migration 55): Jede Schlacht spielt an einem Ort mit
   eigenen Regeln (public.schlacht_orte). Hintergrund, Ereignisse und
   die Start-Animation zeichnet schlacht-orte.js. Die Ereignisse
   erscheinen zu denselben Zeitpunkten, an denen die Datenbank sie
   abrechnet (alle ereignis_sek ab Rundenbeginn, nach Serverzeit). Die
   Start-Animation laeuft einmal je Schlacht und Geraet; ueber die
   Orts-Plakette im Kopf laesst sie sich wiederholen.

   PARTEIEN (Migration 57): Mit der Freigabe "schlachtParteien" waehlt
   der Admin beim Start zwei von sechs Parteien. Dann beginnt die
   Schlacht mit einer SAMMELPHASE: statt des Schlachtfelds die Wahl von
   Partei und Schiffstyp (schlacht_partei_waehlen) mit Countdown bis
   beginn_at. Danach stellt die Datenbank die Flotten auf. Waehrend
   des Kampfs oeffnet "Partei & Schiff" dieselbe Wahl als Tafel ueber
   dem Feld (gilt ab der naechsten Runde). Intern bleiben die Slots
   "menschen" (links) und "aliens" (rechts); Namen, Farben und Schiffe
   kommen von partei_links/partei_rechts bzw. der Partei der Einheit.

   BEWEGEN, HUELLE, AUSRUESTUNG, BOSS (Migrationen 58/59, je mit
   Freigabe; was beim Start galt, steht in mit_bewegung,
   mit_ausruestung, modus): Antippen der eigenen Haelfte (oder
   Pfeiltasten/WASD) fliegt das eigene Schiff dorthin
   (schlacht_bewegen, gedrosselt). Jedes Schiff zeigt seine Huelle;
   zerstoerte Schiffe fallen bis zum Notsprung (45 s) aus.
   Sonderwaffen und Module sieht man am Schiff und am Zielschuss, den
   Rang als Winkel am Namen. Im Boss-Modus steht rechts das
   Mutterschiff mit eigener Lebensleiste, Salven und Schild - zu
   denselben Zeiten, die app.schlacht_leben abrechnet. Die Rechnung
   dazu steht in schlacht-kampf.js.

   FRONT (Migration 62, Freigabe "schlachtFront"): Leiste, Haltung,
   Kampfpunkte und die Frontlinie auf dem Feld stehen in
   schlacht-front.js; hier nur das Einhaengen. Ist ein Takt faellig,
   holt tick() sofort den neuen Stand.

   Alle 3 s holt der Browser den Stand und die neuen Aktionen (fuer
   die Treffer-Effekte); die Datenbank bleibt massgeblich.

   Auf allen anderen Seiten erscheint im Jahr 2100 ein Hinweis, wenn
   eine Schlacht laeuft (#fh-schlacht-hinweis, haengt an body und
   steht in den :not-Listen von 95 und 96).

   Namen von Spielern landen nur per textContent im DOM bzw. per
   fillText im Canvas.
====================================================== */

(function () {
  "use strict";

  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function ist2100() { return !!(window.fhEpoche && window.fhEpoche.jahr() === 2100); }
  function angemeldet() { try { return !!localStorage.getItem("wheelNickname"); } catch (e) { return false; } }
  function klang() { return window.fhSchlachtKlang || null; }
  function fx() { return window.fhSchlachtFx || null; }
  function orte() { return window.fhSchlachtOrte || null; }
  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  const ZEIGEN_JE_SEITE = 60;
  const TAKT_MS = 3000;
  const SVG = function (pfade) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + pfade + "</svg>";
  };
  /* lucide (ISC): x, volume-2, volume-x */
  const SYM_ZU = SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const SYM_TON_AN = SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>');
  const SYM_TON_AUS = SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>');

  let schlacht = null;       // Zeile aus sternenschlacht
  let einheiten = [];        // Zeilen aus sternenschlacht_einheiten
  let einheitenFuer = null;  // "ID:Runde", zu der einheiten gehoeren
  let stand = null;          // Antwort von schlacht_stand
  let meineUid = null;
  let letzteAktion = 0;      // hoechste gesehene Aktions-ID
  let wellen = [];           // Spezial-Wellen { seite, wirkung, t0, farbe }
  let ziel = null;           // uid des gewaehlten Gegners
  let zielBereit = 0;        // ms-Zeitpunkt, ab dem wieder geschossen werden darf
  let spezialGenutzt = false;
  let takt = null, bild = 0;
  let canvas = null, ctx = null, layout = [];
  let feldB = 0, feldH = 0, dpr = 1;
  let ruhm = [];
  let lebendVorher = null;   // Set der UIDs, die im letzten Bild noch flogen
  let schussKonto = 0, letztesBild = 0;
  let vorherigeSeite = "stand";
  let siegGespielt = null;
  let ortZeile = null;       // Zeile aus schlacht_orte (Migration 55)
  let zeitVersatz = 0;       // Serverzeit minus Geraetezeit in ms
  let ereignisRunde = null, ereignisK = 0;
  const INTRO_SPEICHER = "fhSchlachtIntro";
  let meineStufen = null;    // Hangar-Stufen fuer die Wahl-Karten (57)
  let wahlLaeuft = false;
  let wahlOffen = false;     // Wahl-Tafel ueber dem Feld (Kampfphase)
  let lobbyUhr = null;
  let startAngestossen = null;
  let bewegtGesendet = 0;     // ms-Zeitpunkt des letzten schlacht_bewegen (59)
  let bewegungOffen = false;  // eigene Bewegung noch nicht gemeldet
  let salveK = null, schildWar = false;
  const SONDER_KLANG = { plasma: "plasma", raketen: "breitseite", tesla: "netz", lanze: "rail" };

  /* ------------------------------------------------------
     DATEN
  ------------------------------------------------------ */
  async function q(fn) {
    const { data, error } = await withSupabaseRlsColdStartRetry(fn);
    if (error) throw error;
    return data;
  }

  async function letzteSchlacht() {
    return q(function () {
      return supabaseClient.from("sternenschlacht").select("*").order("id", { ascending: false }).limit(1).maybeSingle();
    });
  }

  function istKi(uid) { return String(uid || "").indexOf("ki-") === 0; }

  /* Beginn der laufenden Runde (Schlachten aus 49: der Start). */
  function rundeStart() {
    return (schlacht && (schlacht.runde_at || schlacht.start_at)) || new Date().toISOString();
  }

  /* PARTEIEN (57): Slot -> Partei, Namen und Farben. */
  function parteiVon(slot) {
    if (slot === "menschen") return (schlacht && schlacht.partei_links) || "menschen";
    return (schlacht && schlacht.partei_rechts) || "aliens";
  }
  function parteiName(p) { return typeof schlachtParteiText === "function" ? schlachtParteiText(p, "name") : p; }
  function parteiVolk(p) { return typeof schlachtParteiText === "function" ? schlachtParteiText(p, "volk") : p; }
  function parteiFarbe(p) { return window.fhSchiffe && window.fhSchiffe.farbe ? window.fhSchiffe.farbe(p).akzent : "#f0c96a"; }
  function seitenName(seite) { return parteiName(parteiVon(seite)); }
  /* "Die Erdflotte" -> "die Erdflotte" mitten im Satz */
  function klein(name) { return name.replace(/^(Die|Der|Das|The) /, function (m) { return m.toLowerCase(); }); }
  function mitWahl() { return !!(schlacht && schlacht.mit_wahl); }
  function sammelphase() { return !!(schlacht && schlacht.status === "laeuft" && schlacht.mit_wahl && schlacht.aufgestellt === false); }
  /* 58/59 */
  function kampf() { return window.fhSchlachtKampf || null; }
  function front() { return window.fhSchlachtFront || null; }
  function mitBewegung() { return !!(schlacht && schlacht.mit_bewegung && kampf()); }
  function mitAusruestung() { return !!(schlacht && schlacht.mit_ausruestung); }
  function bossModus() { return !!(schlacht && schlacht.modus === "boss"); }
  function ausVon(e) {
    if (!mitAusruestung() || !e || (!e.waffe && !e.modul1 && !e.modul2)) return null;
    return { waffe: e.waffe, module: [e.modul1, e.modul2].filter(Boolean) };
  }
  function hatModul(e, m) { return !!(e && mitAusruestung() && (e.modul1 === m || e.modul2 === m)); }
  /* Ladezeit des Zielschusses wie in app.schlacht_ziel. */
  function meinTakt() {
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    let tk = mitAusruestung() && ich && ich.waffe === "lanze" ? 8 : 5;
    if (hatModul(ich, "zielcomputer")) tk -= 1;
    return tk;
  }
  function einheitenSpalten() {
    let sp = "firebase_uid, nickname, seite, typ, leben, schaden, spezial, spezial_at";
    if (mitWahl() || bossModus() || mitAusruestung() || mitBewegung()) sp += ", partei";
    if (mitAusruestung()) sp += ", waffe, modul1, modul2, rang";
    if (mitBewegung()) sp += ", pos_x, pos_y, bewegt_at, treffer, zerstoert_at";
    return sp;
  }

  /* Neue Runde: wer hat die letzte gewonnen? */
  function rundeGemeldet() {
    const lr = stand && stand.letzte_runde;
    if (!lr || !seiteOffen()) return;
    const text = lr.sieger === "unentschieden"
      ? t("schlacht.rundeRemis", "Runde {n}: unentschieden.").replace("{n}", lr.nr)
      : t("schlacht.rundeSieg", "Runde {n} geht an {seite}!").replace("{n}", lr.nr).replace("{seite}", klein(seitenName(lr.sieger)));
    status(text + " " + t("schlacht.rundeNeu", "Die Flotten formieren sich neu."), false);
    ["menschen", "aliens"].forEach(function (s2) {
      wellen.push({ seite: s2, wirkung: "heilung", t0: performance.now(), farbe: "#55c878" });
    });
    if (klang()) klang().akzent("runde");
  }

  async function laden() {
    if (!dbDa()) return;
    try {
      if (typeof wheelAuthReady !== "undefined") meineUid = await wheelAuthReady;
      const s = await letzteSchlacht();
      schlacht = s || null;
      /* Erst der Stand: schlacht_stand wechselt die Runde, wenn eine
         Seite bei 0 ist - danach gelten Runde und Aufstellung neu. */
      if (schlacht) stand = await q(function () { return supabaseClient.rpc("schlacht_stand", { p_id: schlacht.id }); });
      if (stand && stand.jetzt) zeitVersatz = Date.parse(stand.jetzt) - Date.now();
      if (schlacht && schlacht.ort && (!ortZeile || ortZeile.ort_id !== schlacht.ort)) {
        const ort = schlacht.ort;
        ortZeile = await q(function () { return supabaseClient.from("schlacht_orte").select("*").eq("ort_id", ort).maybeSingle(); }) || null;
      } else if (schlacht && !schlacht.ort) {
        ortZeile = null;
      }
      /* Jeder Kampfort hat seine eigene Musik (schlacht-klang.js). */
      if (seiteOffen() && klang()) klang().ort(ortZeile ? ortZeile.ort_id : null);
      if (stand && stand.ok && schlacht && stand.id === schlacht.id) {
        if (stand.status === "vorbei" && schlacht.status === "laeuft") schlacht.status = "vorbei";
        if (stand.ende_at) schlacht.ende_at = stand.ende_at;
        if (stand.runde) { schlacht.runde = stand.runde; schlacht.runde_at = stand.runde_at; }
        if (stand.phase) schlacht.aufgestellt = stand.phase === "kampf";
      }
      if (fx() && fx().parteien) fx().parteien(parteiVon("menschen"), parteiVon("aliens"));
      if (mitWahl() && !meineStufen && meineUid) await stufenLaden();
      /* Einheiten je Schlacht und Runde einmal laden - nicht an
         schlacht haengen, das setzt auch die Hinweis-Pruefung
         (hinweisPruefen). */
      const schluessel = schlacht ? schlacht.id + ":" + (schlacht.runde || 1) + ":" + (sammelphase() ? "s" : "k") : null;
      if (schlacht && einheitenFuer !== schluessel) {
        const id = schlacht.id;
        const alt = einheitenFuer ? einheitenFuer.split(":") : [];
        const neueRunde = alt[0] === String(id) && alt[1] !== String(schlacht.runde || 1);
        einheiten = (await q(function () {
          return supabaseClient.from("sternenschlacht_einheiten")
            .select(einheitenSpalten()).eq("schlacht_id", id);
        }) || []).map(function (e) {
          return istKi(e.firebase_uid) ? Object.assign({}, e, { nickname: t("schlacht.ki", "Übungsflotte") }) : e;
        });
        einheitenFuer = schluessel;   // erst nach dem Erfolg - sonst beim naechsten Takt neu versuchen
        if (!neueRunde) letzteAktion = 0;
        wellen = [];
        if (fx()) fx().leeren();
        if (orte()) orte().leeren();
        ziel = null;
        const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
        spezialGenutzt = !!(ich && ich.spezial_at && Date.parse(ich.spezial_at) >= Date.parse(rundeStart()));
        layoutBauen();
        if (neueRunde) rundeGemeldet();
      } else if (schlacht && mitBewegung() && !sammelphase()) {
        await zustandHolen();
      }
      if (!schlacht || schlacht.status !== "laeuft" || !ruhm.length) ruhm = await q(function () {
        return supabaseClient.from("sternenschlacht").select("*")
          .eq("status", "vorbei").order("id", { ascending: false }).limit(12);
      }) || [];
    } catch (err) {
      console.warn("Sternenschlacht: Laden fehlgeschlagen:", err);
    }
  }

  /* Hangar-Stufen fuer die Wahl-Karten (gelten fuer jeden Typ). */
  async function stufenLaden() {
    try {
      const h = await q(function () {
        return supabaseClient.from("hangar_einheiten").select("stufe_leben, stufe_schaden, stufe_spezial").eq("firebase_uid", meineUid).maybeSingle();
      });
      meineStufen = { leben: h ? h.stufe_leben : 0, schaden: h ? h.stufe_schaden : 0, spezial: h ? h.stufe_spezial : 0 };
    } catch (err) {
      meineStufen = { leben: 0, schaden: 0, spezial: 0 };
    }
  }

  /* Positionen, Treffer, Zerstoerung der anderen (59) - je Takt. */
  async function zustandHolen() {
    try {
      const id = schlacht.id;
      const zeilen = await q(function () {
        return supabaseClient.from("sternenschlacht_einheiten")
          .select("firebase_uid, pos_x, pos_y, bewegt_at, treffer, zerstoert_at").eq("schlacht_id", id);
      }) || [];
      const nach = {};
      zeilen.forEach(function (z) { nach[z.firebase_uid] = z; });
      layout.forEach(function (p) {
        const z = nach[p.e.firebase_uid];
        if (!z) return;
        const ich = p.e.firebase_uid === meineUid;
        p.e.treffer = z.treffer;
        p.e.zerstoert_at = z.zerstoert_at;
        p.e.bewegt_at = z.bewegt_at;
        /* Die eigene Position fuehrt der Browser; fremde fliegen hin. */
        if (!ich && z.pos_x != null) { p.zx = Number(z.pos_x); p.zy = Number(z.pos_y); }
        if (ich && z.pos_x != null && p.px == null) { p.px = p.zx = Number(z.pos_x); p.py = p.zy = Number(z.pos_y); }
      });
    } catch (err) {
      console.warn("Sternenschlacht: Zustand fehlgeschlagen:", err);
    }
  }

  async function aktionenHolen() {
    if (!schlacht || !dbDa()) return;
    try {
      const neu = await q(function () {
        return supabaseClient.from("sternenschlacht_aktionen")
          .select("id, firebase_uid, seite, art, typ, ziel_uid, wirkung, betroffen, wert")
          .eq("schlacht_id", schlacht.id).gt("id", letzteAktion).order("id").limit(200);
      }) || [];
      const erstesMal = letzteAktion === 0;
      neu.forEach(function (a) {
        letzteAktion = Math.max(letzteAktion, a.id);
        if (!erstesMal && a.firebase_uid !== meineUid) effektFuer(a);
      });
    } catch (err) {
      console.warn("Sternenschlacht: Aktionen fehlgeschlagen:", err);
    }
  }

  /* ------------------------------------------------------
     SCHLACHTFELD
  ------------------------------------------------------ */
  /* FNV-1a mit Schluss-Durchmischung (murmur3 fmix32): aehnliche IDs
     wie "m1", "m2" landen sonst fast an derselben Stelle. */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function layoutBauen() {
    layout = [];
    lebendVorher = null;
    ["menschen", "aliens"].forEach(function (seite) {
      let liste = einheiten.filter(function (e) { return e.seite === seite; })
        .sort(function (a, b) { return b.leben - a.leben || (a.firebase_uid < b.firebase_uid ? -1 : 1); });
      const ich = liste.find(function (e) { return e.firebase_uid === meineUid; });
      liste = liste.slice(0, ZEIGEN_JE_SEITE);
      if (ich && liste.indexOf(ich) === -1) liste[liste.length - 1] = ich;
      const max = Math.max.apply(null, liste.map(function (e) { return e.leben; }).concat([1]));
      liste.forEach(function (e, i) {
        const h1 = hash(e.firebase_uid), h2 = hash(e.firebase_uid + "y");
        const stufen = istKi(e.firebase_uid) || !window.fhSchiffe ? { leben: 0, schaden: 0, spezial: 0 } : window.fhSchiffe.stufenAus(e);
        layout.push({
          e: e, seite: seite, partei: e.partei || parteiVon(seite), i: i, anzahl: liste.length,
          tiefe: h1, quer: h2,
          g: 0.8 + 0.4 * Math.sqrt(e.leben / max),
          phase: h1 * 6.28,
          stufen: stufen,
          trefferT: 0,
          boss: e.firebase_uid === "ki-boss",
        });
      });
    });
    /* 59: Startposition aus der Datenbank, sonst wie bisher. */
    if (mitBewegung()) {
      layout.forEach(function (p) {
        const sp = p.e.pos_x != null ? { px: Number(p.e.pos_x), py: Number(p.e.pos_y) } : kampf().startPos(p);
        p.px = p.zx = sp.px; p.py = p.zy = sp.py;
      });
    }
  }

  function lebendig(p) {
    if (!stand) return true;
    if (p.boss) return !stand.aliens || Number(stand.aliens.rest) > 0;
    /* 59: eigene Huelle statt Ausduennen nach dem Seitenstand. */
    if (mitBewegung()) {
      if (kampf().zerstoert(p.e, serverJetzt())) return false;
      const hu = kampf().huelle(p.e, stand);
      return hu == null || hu > 0;
    }
    const rest = stand[p.seite] ? Number(stand[p.seite].rest) : 1;
    /* Die Schiffe mit dem kleinsten Index halten am laengsten durch;
       die eigene Einheit bleibt bis zum Schluss sichtbar. */
    if (p.e.firebase_uid === meineUid) return rest > 0;
    return p.i < Math.ceil(rest * p.anzahl);
  }

  function hochkant() { return feldH > feldB * 1.1; }

  /* Groesse eines Schiffs (Breite der 260er-Box) in CSS-Pixeln. */
  function schiffBreite(p) {
    if (p.boss) return hochkant() ? Math.min(feldH * 0.3, feldB * 0.9) : Math.min(feldB * 0.42, feldH * 1.05);
    const n = Math.max(1, p.anzahl);
    const flaeche = feldB * feldH * 0.3;
    const basis = Math.sqrt(flaeche / n) * 1.25;
    const b = Math.max(30, Math.min(170, basis)) * p.g;
    return p.e.firebase_uid === meineUid ? Math.max(b, 54) : b;
  }

  function pos(p, jetzt) {
    if (!p || p.x != null) return p;    // fester Punkt
    const ruhig = RUHIG.matches ? 0 : 1;
    const w = feldB, h = feldH;
    let x, y, winkel;
    const wobX = Math.sin(jetzt * 0.0004 + p.phase) * 10 * ruhig;
    const wobY = Math.cos(jetzt * 0.0003 + p.phase * 1.3) * 7 * ruhig;
    const neigung = -Math.sin(jetzt * 0.0003 + p.phase * 1.3) * 0.08 * ruhig;
    /* 59: das Mutterschiff schwebt gross auf seiner Seite. */
    if (p.boss) {
      return hochkant()
        ? { x: w / 2 + wobY * 0.6, y: h * 0.27 + wobX * 0.4, winkel: Math.PI / 2 + neigung * 0.3 }
        : { x: w * 0.76 + wobX * 0.4, y: h / 2 + wobY * 0.6, winkel: Math.PI + neigung * 0.3 };
    }
    /* 59: bewegliche Schiffe an ihrer Laufposition, leicht in Flugrichtung geneigt. */
    if (mitBewegung() && p.px != null) {
      const P = kampf().feldPunkt(p.seite, p.px, p.py, w, h, hochkant());
      const basis = hochkant() ? (p.seite === "menschen" ? -Math.PI / 2 : Math.PI / 2) : (p.seite === "menschen" ? 0 : Math.PI);
      const quer = p.zx != null && (Math.abs(p.zx - p.px) + Math.abs(p.zy - p.py)) > 0.004 ? (p.vy || 0) * 0.35 * (p.seite === "menschen" ? 1 : -1) : 0;
      return { x: P.x + wobX * 0.4, y: P.y + wobY * 0.4, winkel: basis + neigung + quer };
    }
    if (!hochkant()) {
      x = (p.seite === "menschen" ? 0.06 + p.tiefe * 0.34 : 0.94 - p.tiefe * 0.34) * w + wobX;
      y = (0.1 + p.quer * 0.8) * h + wobY;
      winkel = (p.seite === "menschen" ? 0 : Math.PI) + neigung;
    } else {
      x = (0.08 + p.quer * 0.84) * w + wobY;
      y = (p.seite === "menschen" ? 0.92 - p.tiefe * 0.34 : 0.08 + p.tiefe * 0.34) * h + wobX;
      winkel = (p.seite === "menschen" ? -Math.PI / 2 : Math.PI / 2) + neigung;
    }
    return { x: x, y: y, winkel: winkel };
  }

  function findeUid(uid) { return layout.find(function (p) { return p.e.firebase_uid === uid; }); }

  function beimTreffer(nach, art) {
    if (art !== "reparatur" && nach && nach.e) nach.trefferT = performance.now();
    if (klang() && Math.random() < 0.25) klang().sfx("treffer");
  }

  function schussVon(von, nach, stark) {
    if (!fx() || !von || !nach) return;
    const waffe = stark && mitAusruestung() ? von.e.waffe : null;
    fx().schuss(von, nach, { typ: von.e.typ, seite: von.partei, stark: stark, beimTreffer: beimTreffer, waffe: waffe });
    if (klang() && (stark || Math.random() < 0.3)) klang().sfx(SONDER_KLANG[waffe] || fx().WAFFEN[von.e.typ] || "laser", stark);
  }

  function effektFuer(a) {
    const von = findeUid(a.firebase_uid);
    const nach = a.ziel_uid ? findeUid(a.ziel_uid) : null;
    if (a.art === "ziel" && von && nach) schussVon(von, nach, true);
    if (a.art === "spezial") {
      wellen.push({ seite: a.betroffen, wirkung: a.wirkung, t0: performance.now(), farbe: parteiFarbe(parteiVon(a.seite)) });
      if (klang()) klang().akzent("spezial");
    }
  }

  /* Dauerfeuer: je Sekunde ein paar Schuesse zwischen lebenden
     Schiffen, jeder mit der Waffe seines Typs. Traeger heilen. */
  function dauerfeuer(lebende, dt) {
    if (RUHIG.matches || !lebende.length) return;
    const rate = Math.min(9, 1.5 + lebende.length / 10);
    schussKonto += dt / 1000 * rate;
    let n = 0;
    while (schussKonto >= 1 && n < 4) {
      schussKonto -= 1; n++;
      const von = lebende[Math.floor(Math.random() * lebende.length)];
      const eigene = lebende.filter(function (p) { return p.seite === von.seite && p !== von; });
      const gegner = lebende.filter(function (p) { return p.seite !== von.seite; });
      const heilt = fx() && fx().WAFFEN[von.e.typ] === "reparatur";   // Traeger, Schmuggler, Fabrik, Monolith
      const pool = heilt && eigene.length ? eigene : gegner;
      if (!pool.length) continue;
      schussVon(von, pool[Math.floor(Math.random() * pool.length)], false);
    }
    if (schussKonto > 3) schussKonto = 0;
  }

  /* Ereignis des Orts: zu denselben Zeitpunkten wie in der Datenbank
     (app.schlacht_leben, Migration 55). Beim ersten Bild einer Runde
     wird nur gezaehlt, nicht nachgeholt. */
  function ereignissePruefen() {
    const o = ortZeile;
    if (!o || !o.ereignis_sek || !(Number(o.ereignis_anteil) > 0) || !orte()) return;
    const runde = schlacht.runde || 1;
    const sek = (Date.now() + zeitVersatz - Date.parse(rundeStart())) / 1000;
    const k = Math.max(0, Math.floor(sek / o.ereignis_sek));
    const schluessel = schlacht.id + ":" + runde;
    if (ereignisRunde !== schluessel) { ereignisRunde = schluessel; ereignisK = k; return; }
    if (k <= ereignisK) return;
    ereignisK = k;
    let seiten;
    if (o.ereignis_art === "beide") seiten = o.ort_id === "sonne" || o.ort_id === "schwarzes_loch" ? ["beide"] : ["menschen", "aliens"];
    else seiten = [(k + runde) % 2 === 0 ? "menschen" : "aliens"];
    seiten.forEach(function (sx) { orte().ereignis(o.ort_id, sx); });
    const jetzt = performance.now();
    layout.forEach(function (p) { if (seiten[0] === "beide" || seiten.indexOf(p.seite) >= 0) p.trefferT = jetzt; });
    if (klang()) klang().akzent("ereignis");
    const wen = seiten.length > 1 || seiten[0] === "beide" ? t("schlacht.ereignis.beide", "beide Flotten")
      : klein(seitenName(seiten[0]));
    status(t("schlacht.ereignis.text", "{e} trifft {wen}!").replace("{e}", orte().ereignisName(o.ort_id)).replace("{wen}", wen), false);
  }

  function sterne(jetzt) {
    for (let i = 0; i < 120; i++) {
      const sx = hash("s" + i) * feldB, sy = hash("t" + i) * feldH;
      const funkel = RUHIG.matches ? 0.5 : 0.5 + 0.5 * Math.sin(jetzt * 0.001 + i);
      ctx.fillStyle = "rgba(220,230,255," + (0.15 + 0.45 * hash("a" + i) * funkel) + ")";
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1.3, i % 9 === 0 ? 2 : 1.3);
    }
  }

  function zeichnen(jetzt) {
    if (!ctx || !canvas) return;
    const dt = letztesBild ? Math.min(100, jetzt - letztesBild) : 16;
    letztesBild = jetzt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, feldB, feldH);
    /* Der Kampfort (schlacht-orte.js); ohne Ort der Sternenhimmel. */
    const mitOrt = ortZeile && orte() && orte().hintergrund(ctx, feldB, feldH, jetzt, dpr, ortZeile.ort_id, RUHIG.matches);
    if (!mitOrt) sterne(jetzt);
    /* Grossschiffe ziehen hinter dem Gefecht vorbei (schlacht-fx.js). */
    if (fx() && fx().hintergrund) fx().hintergrund(ctx, feldB, feldH, jetzt, dpr, RUHIG.matches);

    const laeuft = schlacht && schlacht.status === "laeuft";
    if (laeuft) ereignissePruefen();
    /* Erschuetterung bei einem Ereignis - alles ausser dem Hintergrund. */
    const w = orte() ? orte().wackeln(jetzt) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(w.x, w.y);
    const lebende = layout.filter(lebendig);

    /* Ausgefallene Schiffe explodieren. */
    const jetztLebend = new Set(lebende.map(function (p) { return p.e.firebase_uid; }));
    if (lebendVorher && laeuft) {
      layout.forEach(function (p) {
        if (lebendVorher.has(p.e.firebase_uid) && !jetztLebend.has(p.e.firebase_uid)) {
          const P = pos(p, jetzt);
          if (fx()) fx().explosion(P.x, P.y, p.partei, schiffBreite(p) * 0.35);
          if (klang()) klang().sfx("explosion");
        }
      });
    }
    lebendVorher = jetztLebend;

    if (front() && front().aktiv(stand)) front().bild(ctx, feldB, feldH, hochkant(), jetzt, RUHIG.matches);
    if (laeuft && mitBewegung()) bewegungSchritt(dt);
    if (laeuft && bossModus()) bossPruefen(lebende);
    if (laeuft) dauerfeuer(lebende, dt);

    /* Schiffe */
    lebende.forEach(function (p) {
      const P = pos(p, jetzt);
      const breite = schiffBreite(p);
      const treffer = p.trefferT ? Math.max(0, 1 - (jetzt - p.trefferT) / 380) : 0;
      if (window.fhSchiffe) {
        window.fhSchiffe.zeichnen(ctx, {
          typ: p.e.typ, seite: p.partei, stufen: p.stufen, x: P.x, y: P.y, winkel: P.winkel,
          breite: breite, dpr: dpr, zeit: jetzt, phase: p.phase, treffer: treffer, ruhig: RUHIG.matches,
          ausruestung: ausVon(p.e),
        });
      }
      const ich = p.e.firebase_uid === meineUid, gezielt = p.e.firebase_uid === ziel;
      /* 59: Bossschild, Huelle */
      if (p.boss && bossSchildAn()) kampf().schildZeichnen(ctx, P.x, P.y, breite, jetzt, RUHIG.matches);
      if (mitBewegung() && !p.boss && (ich || gezielt || Number(p.e.treffer) > 0)) {
        const hu = kampf().huelle(p.e, stand);
        if (hu != null) kampf().huelleZeichnen(ctx, P.x, P.y, breite, hu, ich);
      }
      if (ich || gezielt) {
        const r = breite * 0.46 + 6;
        ctx.strokeStyle = ich ? "#f0c96a" : "#ff6a6a";
        ctx.lineWidth = 2;
        ctx.setLineDash(gezielt ? [5, 4] : []);
        ctx.beginPath();
        ctx.arc(P.x, P.y, r, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ich ? "#f0c96a" : "#ff9a9a";
        ctx.font = "600 12px Inter, sans-serif";
        ctx.textAlign = "center";
        const name = ich ? t("schlacht.du", "Du") : (p.e.nickname || "?");
        ctx.fillText(name, P.x, P.y - r - 6);
        if (p.e.rang && kampf()) kampf().rangZeichnen(ctx, P.x + ctx.measureText(name).width / 2 + 9, P.y - r - 8, p.e.rang, ctx.fillStyle);
      }
    });

    if (fx()) fx().zeichnen(ctx, pos, jetzt);

    /* Spezial-Wellen */
    wellen = wellen.filter(function (fw) { return jetzt - fw.t0 < 900; });
    wellen.forEach(function (fw) {
      const f = (jetzt - fw.t0) / 900;
      let cx = fw.seite === "menschen" ? feldB * 0.25 : feldB * 0.75, cy = feldH / 2;
      if (hochkant()) { cx = feldB / 2; cy = fw.seite === "menschen" ? feldH * 0.75 : feldH * 0.25; }
      ctx.strokeStyle = fw.wirkung === "heilung" ? "#55c878" : fw.farbe;
      ctx.globalAlpha = 1 - f;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 40 + f * Math.max(feldB, feldH) * 0.3, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    if (orte()) orte().zeichneEreignisse(ctx, feldB, feldH, jetzt, hochkant());
    ctx.restore();
  }

  function schleife(jetzt) {
    if (!seiteOffen() || !canvas) { bild = 0; return; }
    bild = requestAnimationFrame(schleife);
    zeichnen(jetzt);
    knoepfeAuffrischen();
    if (front() && front().aktiv(stand)) front().takt(jetzt);
  }

  function canvasEinpassen() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    feldB = Math.max(1, r.width);
    feldH = Math.max(1, r.height);
    canvas.width = Math.round(feldB * dpr);
    canvas.height = Math.round(feldH * dpr);
  }

  function klickAufFeld(ev) {
    if (!schlacht || schlacht.status !== "laeuft") return;
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    const jetzt = performance.now();
    let best = null, bestD = Infinity;
    layout.filter(lebendig).forEach(function (p) {
      if (ich && p.seite === ich.seite) return;
      const P = pos(p, jetzt);
      const d = Math.hypot(P.x - mx, P.y - my);
      if (d < Math.max(44, schiffBreite(p) * (p.boss ? 0.42 : 0.6)) && d < bestD) { bestD = d; best = p; }
    });
    if (!best) {
      /* 59: in die eigene Haelfte getippt - dorthin fliegen. */
      if (mitBewegung() && ich) {
        const z2 = kampf().posAus(ich.seite, mx, my, feldB, feldH, hochkant());
        if (z2) fliegen(z2.px, z2.py);
      }
      return;
    }
    ziel = best.e.firebase_uid;
    schiessen();
  }

  /* ------------------------------------------------------
     BEWEGEN UND BOSS (59)
  ------------------------------------------------------ */
  function fliegen(px, py) {
    const p = findeUid(meineUid);
    if (!p || p.px == null) return;
    if (kampf().zerstoert(p.e, serverJetzt())) { fehler("zerstoert"); return; }
    p.zx = px; p.zy = py;
  }

  function bewegungSchritt(dt) {
    layout.forEach(function (p) {
      if (p.px == null || p.boss) return;
      const ich = p.e.firebase_uid === meineUid;
      const tempo = kampf().TEMPO * (hatModul(p.e, "nachbrenner") ? 1.5 : 1);
      const lief = kampf().schritt(p, dt, ich ? tempo : tempo * 1.2);
      if (ich && lief) bewegungOffen = true;
    });
    if (bewegungOffen && performance.now() - bewegtGesendet > 450) bewegungSenden();
  }

  /* Hoechstens alle 450 ms; die Datenbank kuerzt zu weite Wege. */
  async function bewegungSenden() {
    const p = findeUid(meineUid);
    if (!p || p.px == null) return;
    bewegtGesendet = performance.now();
    bewegungOffen = false;
    try {
      const erg = await rpc("schlacht_bewegen", { p_x: Math.round(p.px * 1000) / 1000, p_y: Math.round(p.py * 1000) / 1000 });
      if (erg && erg.ok) p.e.bewegt_at = new Date(serverJetzt()).toISOString();
      else if (erg && erg.grund === "zu-schnell") bewegungOffen = true;
      else if (erg && erg.grund !== "keine-bewegung") fehler(erg.grund);
    } catch (err) {
      console.warn("Sternenschlacht: Bewegen fehlgeschlagen:", err);
    }
  }

  /* Pfeiltasten/WASD: ein Stueck in Bildschirmrichtung. */
  function tasteBewegen(ev) {
    if (!mitBewegung() || !canvas || !schlacht || schlacht.status !== "laeuft") return false;
    const k = (ev.key || "").toLowerCase();
    const r = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
    const p = findeUid(meineUid);
    if (!r || !p || p.px == null || (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName))) return false;
    const P = kampf().feldPunkt(p.seite, p.zx != null ? p.zx : p.px, p.zy != null ? p.zy : p.py, feldB, feldH, hochkant());
    const schritt = Math.min(feldB, feldH) * 0.08;
    const z2 = kampf().posAus(p.seite, P.x + r[0] * schritt, P.y + r[1] * schritt, feldB, feldH, hochkant(), true);
    if (z2) fliegen(z2.px, z2.py);
    ev.preventDefault();
    return true;
  }

  function bossPhase() { return stand && stand.boss ? Number(stand.boss.phase) || 1 : 1; }
  function rundenSek() { return (serverJetzt() - Date.parse(rundeStart())) / 1000; }
  function bossSchildAn() { return bossModus() && !!kampf() && kampf().bossSchild(bossPhase(), rundenSek()); }

  /* Salven und Schild zu denselben Zeiten wie app.schlacht_leben. */
  function bossPruefen(lebende) {
    if (!kampf()) return;
    const k = Math.floor(rundenSek() / kampf().bossTakt(bossPhase()));
    const schl = schlacht.id + ":" + (schlacht.runde || 1);
    if (!salveK || salveK.s !== schl) salveK = { s: schl, k: k };
    else if (k > salveK.k) { salveK.k = k; salve(lebende); }
    const sch = bossSchildAn();
    if (sch && !schildWar) {
      status(t("schlacht.boss.schildAn", "Schild aktiv – das Mutterschiff nimmt nur 40 % Schaden."), false);
      if (klang()) klang().akzent("ort");
    }
    schildWar = sch;
  }

  function salve(lebende) {
    const boss = layout.find(function (p) { return p.boss; });
    const ziele = lebende.filter(function (p) { return p.seite === "menschen"; });
    if (!boss || !ziele.length || !fx()) return;
    const n = Math.min(18, Math.max(6, ziele.length * 2));
    for (let i = 0; i < n; i++) {
      const z = ziele[Math.floor(Math.random() * ziele.length)];
      setTimeout(function () { fx().schuss(boss, z, { typ: "mutterschiff", seite: "boss", stark: true, art: "plasma", beimTreffer: beimTreffer }); }, i * 45);
    }
    if (klang()) { klang().akzent("ereignis"); klang().sfx("breitseite", true); }
    status(t("schlacht.boss.salve", "Salve des Mutterschiffs!"), false);
  }

  function bossLeisteAuffrischen() {
    const l = document.getElementById("schlacht-boss");
    if (!l || !stand || !stand.boss) return;
    const max = Number(stand.boss.max) || 1, leben = Math.max(0, Number(stand.boss.leben) || 0);
    const pz = Math.max(0, Math.min(100, leben / max * 100));
    l.querySelector(".sl-boss-fuellung").style.width = pz + "%";
    l.querySelector(".sl-boss-zahl").textContent = Math.ceil(pz) + " %";
    l.querySelector(".sl-boss-phase").textContent = t("schlacht.boss.phase", "Phase {n}").replace("{n}", bossPhase());
    l.querySelector(".sl-boss-schild").hidden = !bossSchildAn();
    l.dataset.phase = bossPhase();
    l.setAttribute("aria-label", parteiName("boss") + ": " + Math.ceil(pz) + " %");
  }

  /* ------------------------------------------------------
     AKTIONEN
  ------------------------------------------------------ */
  const GRUENDE = {
    "keine-schlacht": ["schlacht.fehler.keine", "Gerade läuft keine Schlacht."],
    "vorbei": ["schlacht.fehler.vorbei", "Die Schlacht ist vorbei."],
    "nicht-dabei": ["schlacht.fehler.dabei", "Du kämpfst noch nicht mit – wähle eine Seite, dann bist du ab der nächsten Runde dabei."],
    "naechste-runde": ["schlacht.fehler.runde", "Du steigst in der nächsten Runde ein."],
    "zu-schnell": ["schlacht.fehler.schnell", "Deine Waffen laden noch."],
    "falsches-ziel": ["schlacht.fehler.ziel", "Wähle ein gegnerisches Schiff."],
    "schon": ["schlacht.fehler.schon", "Dein Spezialangriff ist in dieser Runde schon verbraucht."],
    "laedt": ["schlacht.fehler.laedt", "Dein Spezialangriff lädt noch."],
    "gesperrt": ["schlacht.fehler.gesperrt", "Dein Konto ist gesperrt."],
    "sammeln": ["schlacht.fehler.sammeln", "Die Schlacht beginnt gleich – du bist dabei."],
    "keine-wahl": ["schlacht.fehler.keineWahl", "Wähle zuerst Partei und Schiff."],
    "falsche-partei": ["schlacht.fehler.partei", "Diese Partei kämpft hier nicht mit."],
    "falscher-typ": ["schlacht.fehler.typ", "Dieses Schiff gehört nicht zu der Partei."],
    "partei-fest": ["schlacht.fehler.parteiFest", "Du kämpfst in dieser Schlacht schon für die andere Seite – das Schiff darfst du wechseln."],
    "zerstoert": ["schlacht.fehler.zerstoert", "Dein Schiff ist zerstört – warte auf den Notsprung."],
    "zu-wenig-kp": ["schlacht.fehler.kp", "Dafür reichen deine Kampfpunkte noch nicht."],
    "max": ["schlacht.fehler.max", "Schon ganz ausgebaut."],
    "keine-front": ["schlacht.fehler.front", "In dieser Schlacht gibt es keine Front."],
  };
  function status(text, istFehler) {
    const s = document.getElementById("schlacht-status");
    if (!s) return;
    s.textContent = text || "";
    s.classList.toggle("ist-fehler", !!istFehler);
  }
  function fehler(grund) {
    const g = GRUENDE[grund];
    status(g ? t(g[0], g[1]) : t("schlacht.fehler.allgemein", "⚠️ Das hat nicht geklappt."), true);
  }

  async function rpc(name, args) {
    if (!angemeldet()) { status(t("schlacht.anmelden", "Melde dich an, um mitzukämpfen."), true); return null; }
    return q(function () { return supabaseClient.rpc(name, args); });
  }

  async function schiessen() {
    if (!ziel || performance.now() < zielBereit) return;
    zielBereit = performance.now() + meinTakt() * 1000;
    try {
      const erg = await rpc("schlacht_ziel", { p_ziel_uid: ziel });
      if (!erg) return;
      if (erg.ok) {
        if (erg.takt) zielBereit = performance.now() + Number(erg.takt) * 1000;
        schussVon(findeUid(meineUid), findeUid(ziel), true);
        /* 59: Tesla-Uebersprung und Zerstoerung */
        const zp = findeUid(ziel);
        if (erg.kette && fx() && zp) {
          const k2 = findeUid(erg.kette);
          if (k2) setTimeout(function () { fx().schuss(zp, k2, { typ: "", seite: zp.partei, stark: true, art: "blitz", beimTreffer: beimTreffer }); }, 260);
        }
        if (erg.zerstoert && zp) zp.e.zerstoert_at = new Date(serverJetzt()).toISOString();
        if (zp && mitBewegung() && !zp.boss) zp.e.treffer = Number(zp.e.treffer || 0) + Number(erg.wert);
        status(t("schlacht.treffer", "Treffer!") + " −" + Math.round(erg.wert) + (erg.fokus ? " · " + t("schlacht.fokus", "Fokusfeuer") + " +" + Math.min(80, erg.fokus * 10) + " %" : "")
          + (erg.kette ? " · " + t("schlacht.kette", "Übersprung") + " −" + Math.round(erg.kette_wert) : "")
          + (erg.zerstoert ? " · " + t("schlacht.zerstoertZiel", "Zerstört!") : ""), false);
      } else {
        if (erg.grund !== "zu-schnell") zielBereit = 0;
        fehler(erg.grund);
      }
    } catch (err) {
      zielBereit = 0;
      console.warn("Sternenschlacht: Ziel fehlgeschlagen:", err);
      fehler(null);
    }
  }

  async function spezial() {
    try {
      const erg = await rpc("schlacht_spezial", { p_ziel_uid: ziel });
      if (!erg) return;
      if (erg.ok) {
        spezialGenutzt = true;
        const ich = findeUid(meineUid);
        if (ich) {
          const gegner = ich.seite === "menschen" ? "aliens" : "menschen";
          const trifft = erg.wirkung === "schaden" || Number(erg.faktor) > 1;
          wellen.push({ seite: trifft ? gegner : ich.seite, wirkung: erg.wirkung, t0: performance.now(), farbe: "#f0c96a" });
        }
        if (klang()) klang().akzent("spezial");
        status(t("schlacht.spezialLos", "Spezialangriff ausgelöst!"), false);
      } else {
        if (erg.grund === "schon") spezialGenutzt = true;
        fehler(erg.grund);
      }
    } catch (err) {
      console.warn("Sternenschlacht: Spezial fehlgeschlagen:", err);
      fehler(null);
    }
  }

  /* ------------------------------------------------------
     ANZEIGE
  ------------------------------------------------------ */
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }

  function seiteOffen() {
    const s = document.getElementById("sternenschlacht");
    return !!(s && s.classList.contains("active-page"));
  }

  function restZeit() {
    if (!schlacht) return "";
    if (!schlacht.ende_at) return t("schlacht.runde", "Runde") + " " + (schlacht.runde || 1);
    const ms = Math.max(0, Date.parse(schlacht.ende_at) - Date.now());
    return String(Math.floor(ms / 60000)).padStart(2, "0") + ":" + String(Math.floor(ms % 60000 / 1000)).padStart(2, "0");
  }

  function bannerAuffrischen() {
    const b = document.getElementById("schlacht-banner");
    if (!b || !stand || !stand.ok) return;
    let pm = Math.max(0, Math.min(100, Number(stand.prozent_menschen)));
    /* 59: im Boss-Modus Allianz gegen das ganze Leben des Mutterschiffs. */
    if (bossModus() && stand.boss && Number(stand.boss.max) > 0 && stand.status === "laeuft") {
      const r1 = stand.menschen ? Number(stand.menschen.rest) : 1, r2 = Number(stand.boss.leben) / Number(stand.boss.max);
      pm = r1 + r2 > 0 ? 100 * r1 / (r1 + r2) : 50;
    }
    b.querySelector(".sl-banner-m").style.width = pm + "%";
    b.querySelector(".sl-banner-a").style.width = (100 - pm) + "%";
    const gm = Math.round(pm);   // ganze Prozent, die zusammen 100 ergeben
    b.querySelector(".sl-banner-zahl-m").textContent = gm + " %";
    b.querySelector(".sl-banner-zahl-a").textContent = (100 - gm) + " %";
    b.setAttribute("aria-label", parteiVolk(parteiVon("menschen")) + " " + gm + " %, " + parteiVolk(parteiVon("aliens")) + " " + (100 - gm) + " %");
    /* Musik: Spannung, sobald eine Seite unter 25 % ihres Lebens faellt. */
    const rm = stand.menschen ? Number(stand.menschen.rest) : 1, ra = stand.aliens ? Number(stand.aliens.rest) : 1;
    const knapp = Math.min(rm, ra);
    if (klang()) klang().spannung(knapp < 0.25 ? 0.5 + 2 * (0.25 - knapp) : 0.1);
  }

  function knoepfeAuffrischen() {
    if (bossModus()) bossLeisteAuffrischen();
    const uhr = document.getElementById("schlacht-uhr");
    if (uhr && schlacht && schlacht.status === "laeuft") uhr.textContent = restZeit();
    const punkte = document.getElementById("schlacht-punkte");
    if (punkte && stand && stand.ok && stand.endlos) {
      const pm = stand.punkte_menschen || 0, pa = stand.punkte_aliens || 0;
      punkte.textContent = pm + " : " + pa;
      punkte.setAttribute("aria-label", t("schlacht.rundensiege", "Rundensiege") + ": " + parteiVolk(parteiVon("menschen")) + " " + pm + ", " + parteiVolk(parteiVon("aliens")) + " " + pa);
    }
    const k = document.getElementById("schlacht-spezial");
    if (!k) return;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    if (!ich) { k.hidden = true; return; }
    k.hidden = false;
    /* Ladezeit je Partei (57) mal Ort (55) - wie app.schlacht_spezial. */
    const P = typeof SCHLACHT_PARTEIEN !== "undefined" ? SCHLACHT_PARTEIEN[ich.partei || parteiVon(ich.seite)] : null;
    const laden2 = ortZeile && ortZeile.laden ? Number(ortZeile.laden) : 1;
    const warten = Math.round((P ? P.laden : (ich.seite === "menschen" ? 60 : 30)) * laden2 * (hatModul(ich, "reaktor") ? 0.75 : 1)) * 1000;
    const weg = mitBewegung() && kampf().zerstoert(ich, serverJetzt());
    const notsprung = weg ? Math.max(0, Math.ceil((Date.parse(ich.zerstoert_at) + kampf().NOTSPRUNG_MS - serverJetzt()) / 1000)) : 0;
    const ab = Date.parse(rundeStart()) + warten;
    const name = t("hangar.typ." + ich.typ + ".spezial", (HANGAR_TYPEN[ich.typ] || {}).spezial || "Spezial");
    if (weg) { k.disabled = true; k.textContent = t("schlacht.notsprung", "Notsprung in {s} s").replace("{s}", notsprung); }
    else if (spezialGenutzt) { k.disabled = true; k.textContent = name + " · " + t("schlacht.verbraucht", "verbraucht"); }
    else if (Date.now() < ab) { k.disabled = true; k.textContent = name + " · " + Math.ceil((ab - Date.now()) / 1000) + " s"; }
    else { k.disabled = false; k.textContent = name + " · " + t("schlacht.bereit", "bereit!"); }
    const z = document.getElementById("schlacht-ziel-info");
    if (z) {
      const cd = Math.ceil((zielBereit - performance.now()) / 1000);
      z.textContent = weg ? t("schlacht.zerstoertIch", "Zerstört! Notsprung in {s} s.").replace("{s}", notsprung)
        : cd > 0 ? t("schlacht.laedt", "Waffen laden") + " … " + cd + " s"
        : mitBewegung() ? t("schlacht.tippBewegen", "Gegner antippen: schießen. Eigene Hälfte antippen oder Pfeiltasten: fliegen.")
        : t("schlacht.tipp", "Tippe ein gegnerisches Schiff an, um es zu beschießen.");
    }
  }

  function ruhmZeigen(ziel2) {
    const box = el("section", "sl-ruhm");
    box.appendChild(el("h2", "sl-ruhm-titel", t("schlacht.ruhm", "Ruhmeshalle")));
    if (!ruhm.length) { box.appendChild(el("p", "sl-leer", t("schlacht.ruhmLeer", "Noch keine Schlacht geschlagen."))); ziel2.appendChild(box); return; }
    const liste = el("ol", "sl-ruhm-liste");
    ruhm.forEach(function (r) {
      const li = el("li", "sl-ruhm-eintrag ist-" + (r.sieger || "unentschieden"));
      const pl = r.partei_links || "menschen", pr = r.partei_rechts || "aliens";
      const siegerPartei = r.sieger === "menschen" ? pl : r.sieger === "aliens" ? pr : null;
      if (siegerPartei) li.dataset.partei = siegerPartei;
      const datum = new Date(r.start_at).toLocaleDateString(typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      const boss = r.modus === "boss";
      const sieger = boss ? (r.sieger === "menschen" ? t("schlacht.boss.ruhmSieg", "Mutterschiff besiegt") : t("schlacht.boss.ruhmEntkommen", "Mutterschiff entkommen"))
        : siegerPartei ? parteiName(siegerPartei) : t("schlacht.unentschieden", "Unentschieden");
      const kopf = el("div", "sl-ruhm-kopf");
      kopf.append(el("span", "sl-ruhm-datum", datum), el("strong", "sl-ruhm-sieger", sieger),
        el("span", "sl-ruhm-stand", boss ? t("schlacht.boss.zerstoert", "{p} % zerstört").replace("{p}", Math.round(Number(r.endstand_menschen) || 0))
          : r.endlos ? rundenText(r.punkte_menschen, r.punkte_aliens) : standText(r.endstand_menschen)));
      li.appendChild(kopf);
      const helden = el("p", "sl-ruhm-helden");
      ["menschen", "aliens"].forEach(function (s) {
        ((r.ruhm && r.ruhm[s]) || []).forEach(function (hd) {
          const span = el("span", "sl-held ist-" + s);
          span.dataset.partei = s === "menschen" ? pl : pr;
          span.textContent = (hd.nickname || "?") + " · " + Math.round(hd.schaden);
          helden.appendChild(span);
        });
      });
      if (helden.childNodes.length) li.appendChild(helden);
      liste.appendChild(li);
    });
    box.appendChild(liste);
    ziel2.appendChild(box);
  }

  /* ------------------------------------------------------
     VOLLBILD-BUEHNE
  ------------------------------------------------------ */
  function buehne() {
    let b = document.getElementById("fh-schlacht-buehne");
    if (b) return b;
    b = el("div", "sl-buehne");
    b.id = "fh-schlacht-buehne";
    b.hidden = true;
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-modal", "true");
    b.setAttribute("aria-labelledby", "sl-buehne-titel");

    const kopf = el("div", "sl-buehne-kopf");
    const titel = el("div", "sl-buehne-titel");
    const h = el("h2", null, t("schlacht.titel", "Sternenschlacht"));
    h.id = "sl-buehne-titel";
    titel.append(el("span", "sl-buehne-kicker", t("hangar.kicker", "Jahr 2100")), h);
    const lage = el("div", "sl-buehne-lage");
    lage.id = "schlacht-lage";
    const ton = el("button", "sl-rund-knopf sl-ton");
    ton.type = "button";
    ton.id = "schlacht-ton";
    ton.addEventListener("click", function () {
      const k = klang();
      if (!k) return;
      k.setzeAn(!k.istAn());
      tonKnopf();
    });
    const zu = el("button", "sl-rund-knopf sl-zu");
    zu.type = "button";
    zu.setAttribute("aria-label", t("schlacht.schliessen", "Schlacht verlassen"));
    zu.title = t("schlacht.schliessen", "Schlacht verlassen");
    zu.innerHTML = SYM_ZU;   // festes SVG, keine Nutzerdaten
    zu.addEventListener("click", verlassen);
    kopf.append(titel, lage, ton, zu);

    const inhalt = el("div", "sl-buehne-inhalt");
    inhalt.id = "schlacht-inhalt";
    b.append(kopf, inhalt);
    document.body.appendChild(b);
    tonKnopf();
    return b;
  }

  /* Texte im Kopf - auch nach einem Sprachwechsel (i18n.js baut die
     offene Schlachtseite dann neu auf). */
  function kopfTexte() {
    const h = document.getElementById("sl-buehne-titel");
    if (h) h.textContent = t("schlacht.titel", "Sternenschlacht");
    const k = document.querySelector("#fh-schlacht-buehne .sl-buehne-kicker");
    if (k) k.textContent = t("hangar.kicker", "Jahr 2100");
    const zu = document.querySelector("#fh-schlacht-buehne .sl-zu");
    if (zu) { zu.setAttribute("aria-label", t("schlacht.schliessen", "Schlacht verlassen")); zu.title = zu.getAttribute("aria-label"); }
    tonKnopf();
  }

  function tonKnopf() {
    const k = document.getElementById("schlacht-ton");
    if (!k) return;
    const an = !!(klang() && klang().istAn());
    k.innerHTML = an ? SYM_TON_AN : SYM_TON_AUS;   // festes SVG
    k.setAttribute("aria-pressed", an ? "true" : "false");
    k.setAttribute("aria-label", an ? t("schlacht.tonAus", "Ton ausschalten") : t("schlacht.tonAn", "Ton einschalten"));
    k.title = k.getAttribute("aria-label");
  }

  function buehneOeffnen() {
    const b = buehne();
    if (!b.hidden) return;
    b.hidden = false;
    document.documentElement.classList.add("fh-schlacht-offen");
    document.addEventListener("keydown", tasten);
    const zu = b.querySelector(".sl-zu");
    if (zu) zu.focus({ preventScroll: true });
    if (klang()) klang().start("schlacht");
    tonKnopf();
  }

  function buehneSchliessen() {
    const b = document.getElementById("fh-schlacht-buehne");
    if (!b || b.hidden) return;
    b.hidden = true;
    document.documentElement.classList.remove("fh-schlacht-offen");
    document.removeEventListener("keydown", tasten);
    cancelAnimationFrame(bild); bild = 0;
    clearInterval(lobbyUhr); lobbyUhr = null;
    if (orte()) orte().introAbbrechen();
    if (klang()) klang().stop("schlacht");
  }

  function tasten(ev) {
    if (ev.key === "Escape" && !(orte() && orte().introLaeuft())) { verlassen(); return; }
    if (!(orte() && orte().introLaeuft()) && !wahlOffen) tasteBewegen(ev);
  }

  function verlassen() {
    const ziel2 = vorherigeSeite && vorherigeSeite !== "sternenschlacht" ? vorherigeSeite : "stand";
    if (typeof changePage === "function") changePage(ziel2);
    else buehneSchliessen();
  }

  function lageZeigen(laeuft) {
    const lage = document.getElementById("schlacht-lage");
    if (!lage) return;
    lage.replaceChildren();
    if (!laeuft) return;
    const punkte = el("span", "sl-punkte");
    punkte.id = "schlacht-punkte";
    punkte.title = t("schlacht.rundensiege", "Rundensiege");
    const uhr = el("span", "sl-uhr");
    uhr.id = "schlacht-uhr";
    uhr.textContent = restZeit();
    lage.append(el("span", "sl-live", t("schlacht.live", "Live")), punkte, uhr);
    if (ortZeile && orte()) lage.appendChild(ortPlakette());
  }

  /* Ortsname im Kopf; ein Klick zeigt die Regeln und bietet die
     Start-Animation noch einmal an. */
  function ortPlakette() {
    const wrap = el("div", "sl-ort");
    const knopf = el("button", "sl-ort-knopf", orte().name(ortZeile.ort_id));
    knopf.type = "button";
    knopf.setAttribute("aria-expanded", "false");
    const tafel = el("div", "sl-ort-tafel");
    tafel.hidden = true;
    tafel.id = "schlacht-ort-tafel";
    knopf.setAttribute("aria-controls", tafel.id);
    tafel.append(el("p", "sl-ort-name", orte().name(ortZeile.ort_id)), el("p", "sl-ort-gegend", orte().gegend(ortZeile.ort_id)));
    const liste = el("ul", "sl-ort-regeln");
    orte().regeln(ortZeile).forEach(function (r2) { liste.appendChild(el("li", null, r2)); });
    const nochmal = el("button", "sl-ort-nochmal", t("schlacht.intro.nochmal", "Einflug noch einmal ansehen"));
    nochmal.type = "button";
    nochmal.addEventListener("click", function () { tafel.hidden = true; knopf.setAttribute("aria-expanded", "false"); introZeigen(true); });
    tafel.append(liste, nochmal);
    knopf.addEventListener("click", function () {
      tafel.hidden = !tafel.hidden;
      knopf.setAttribute("aria-expanded", tafel.hidden ? "false" : "true");
    });
    wrap.append(knopf, tafel);
    return wrap;
  }

  /* Start-Animation: einmal je Schlacht und Geraet (oder auf Wunsch). */
  function introZeigen(erzwingen) {
    const b = document.getElementById("fh-schlacht-buehne");
    if (!b || b.hidden || !orte() || !ortZeile || !schlacht || schlacht.status !== "laeuft") return;
    if (orte().introLaeuft()) return;
    let gesehen = null;
    try { gesehen = localStorage.getItem(INTRO_SPEICHER); } catch (e) { /* privater Modus */ }
    if (!erzwingen && gesehen === String(schlacht.id)) return;
    try { localStorage.setItem(INTRO_SPEICHER, String(schlacht.id)); } catch (e) { /* egal */ }
    function seite(sx) {
      return layout.filter(function (p) { return p.seite === sx; }).map(function (p) { return { typ: p.e.typ, stufen: p.stufen }; });
    }
    orte().intro(b, { ortId: ortZeile.ort_id, ort: ortZeile, menschen: seite("menschen"), aliens: seite("aliens"), runde: schlacht.runde || 1, klang: klang(),
      links: parteiVon("menschen"), rechts: parteiVon("aliens") })
      .then(function () { const zu = b.querySelector(".sl-zu"); if (zu && !b.hidden) zu.focus({ preventScroll: true }); });
  }

  function aufbauen() {
    buehne();
    kopfTexte();
    const ziel2 = document.getElementById("schlacht-inhalt");
    if (!ziel2) return;
    ziel2.replaceChildren();
    ziel2.classList.remove("ist-feld", "ist-front");
    canvas = ctx = null;
    cancelAnimationFrame(bild); bild = 0;
    clearInterval(lobbyUhr); lobbyUhr = null;

    if (!ist2100()) {
      lageZeigen(false);
      ziel2.appendChild(hinweisBox(t("schlacht.zu.titel", "Keine Schlacht in Sicht"), t("schlacht.zu.text", "Die Sternenschlacht gibt es nur im Jahr 2100.")));
      return;
    }
    if (!schlacht || schlacht.status !== "laeuft") {
      lageZeigen(false);
      if (schlacht && schlacht.status === "vorbei" && stand && stand.ok && Date.now() - Date.parse(schlacht.ende_at) < 10 * 60000) {
        ziel2.appendChild(siegerBanner());
        if (siegGespielt !== schlacht.id && klang()) { siegGespielt = schlacht.id; klang().akzent("sieg"); }
      } else {
        ziel2.appendChild(hinweisBox(t("schlacht.ruhig.titel", "Ruhe im All"), t("schlacht.ruhig.text", "Gerade läuft keine Sternenschlacht. Ändii startet sie live – rüste bis dahin im Hangar auf.")));
      }
      ruhmZeigen(ziel2);
      return;
    }

    if (sammelphase()) {
      lageZeigen(true);
      lobbyZeigen(ziel2);
      return;
    }

    lageZeigen(true);
    ziel2.classList.add("ist-feld");
    const feld = el("div", "sl-feld");
    canvas = el("canvas", "sl-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("schlacht.feldAriaP", "Schlachtfeld: {l} links, {r} rechts")
      .replace("{l}", parteiVolk(parteiVon("menschen"))).replace("{r}", parteiVolk(parteiVon("aliens"))));
    canvas.addEventListener("click", klickAufFeld);
    feld.appendChild(canvas);
    if (bossModus()) {
      /* 59: Lebensleiste des Mutterschiffs ueber dem Feld */
      const bl = el("div", "sl-boss");
      bl.id = "schlacht-boss";
      bl.setAttribute("role", "img");
      const bk = el("div", "sl-boss-kopf");
      const schild = el("span", "sl-boss-schild", t("schlacht.boss.schild", "Schild"));
      schild.hidden = true;
      bk.append(el("span", "sl-boss-name", parteiName("boss")), el("span", "sl-boss-phase"), schild, el("span", "sl-boss-zahl"));
      const bb = el("div", "sl-boss-balken");
      bb.appendChild(el("span", "sl-boss-fuellung"));
      bl.append(bk, bb);
      feld.appendChild(bl);
    }

    const fuss = el("div", "sl-fuss");
    const banner = el("div", "sl-banner");
    banner.id = "schlacht-banner";
    banner.setAttribute("role", "img");
    const m = el("div", "sl-banner-m"), a = el("div", "sl-banner-a");
    m.dataset.partei = parteiVon("menschen");
    a.dataset.partei = parteiVon("aliens");
    m.append(el("span", "sl-banner-name", parteiVolk(parteiVon("menschen"))), el("span", "sl-banner-zahl-m"));
    a.append(el("span", "sl-banner-zahl-a"), el("span", "sl-banner-name", parteiVolk(parteiVon("aliens"))));
    banner.append(m, a);

    const steuer = el("div", "sl-steuer");
    const info = el("p", "sl-ziel-info");
    info.id = "schlacht-ziel-info";
    const sp = el("button", "sl-spezial");
    sp.type = "button";
    sp.id = "schlacht-spezial";
    sp.hidden = true;
    sp.addEventListener("click", spezial);
    steuer.append(info, sp);
    if (mitWahl()) {
      /* Partei und Schiff fuer die naechste Runde (57) */
      const dabei = einheiten.some(function (e) { return e.firebase_uid === meineUid; });
      const wk = el("button", "sl-wahl-knopf", dabei ? t("schlacht.wahl.wechseln", "Schiff wechseln") : t("schlacht.wahl.knopf", "Partei & Schiff wählen"));
      wk.type = "button";
      wk.id = "schlacht-wahl-knopf";
      wk.setAttribute("aria-expanded", "false");
      wk.addEventListener("click", function () { wahlTafelZeigen(!wahlOffen); });
      steuer.appendChild(wk);
    }
    const st = el("p", "sl-status");
    st.id = "schlacht-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");

    if (!einheiten.some(function (e) { return e.firebase_uid === meineUid; })) {
      st.textContent = !angemeldet() ? t("schlacht.anmelden", "Melde dich an, um mitzukämpfen.")
        : mitWahl() && stand && stand.meine_wahl ? t("schlacht.fehler.runde", "Du steigst in der nächsten Runde ein.")
        : mitWahl() ? t("schlacht.wahl.spaeter", "Wähle Partei und Schiff – ab der nächsten Runde bist du dabei.")
        : t("schlacht.fehler.dabei", "Du kämpfst noch nicht mit – wähle eine Seite, dann bist du ab der nächsten Runde dabei.");
    }

    fuss.append(banner, steuer, st);
    if (front() && front().aktiv(stand)) {
      front().bauen(fuss, {
        rpc: rpc, status: status, fehler: fehler, klang: klang, serverJetzt: serverJetzt,
        parteiName: function (slot) { return parteiVolk(parteiVon(slot)); },
        parteiFarbe: function (slot) { return parteiFarbe(parteiVon(slot)); },
        neuLaden: function () { if (seiteOffen()) tick(); },
      });
      front().auffrischen(stand);
      ziel2.classList.add("ist-front");
    }
    ziel2.append(feld, fuss);
    if (mitWahl()) {
      const ueber = el("div", "sl-wahl-ueber");
      ueber.id = "schlacht-wahl-ueber";
      ueber.hidden = true;
      feld.appendChild(ueber);
      wahlOffen = false;
    }
    ctx = canvas.getContext("2d");
    canvasEinpassen();
    bannerAuffrischen();
    knoepfeAuffrischen();
    letztesBild = 0;
    bild = requestAnimationFrame(schleife);
    introZeigen(false);
  }

  /* "58 % : 42 %" - ganze Prozent, die zusammen 100 ergeben. */
  function standText(prozentMenschen) {
    const m = Math.round(Number(prozentMenschen) || 0);
    return m + " % : " + (100 - m) + " %";
  }

  /* "2 : 1 Runden" - Rundensiege einer endlosen Schlacht. */
  function rundenText(pm, pa) {
    return (pm || 0) + " : " + (pa || 0) + " " + t("schlacht.runden", "Runden");
  }

  function hinweisBox(titel, text) {
    const b = el("div", "sl-hinweis");
    b.append(el("h2", "sl-hinweis-titel", titel), el("p", "sl-hinweis-text", text));
    return b;
  }

  function siegerBanner() {
    const s = stand.sieger;
    const b = el("div", "sl-sieger ist-" + (s || "unentschieden"));
    const sp = s === "menschen" ? (stand.partei_links || "menschen") : s === "aliens" ? (stand.partei_rechts || "aliens") : null;
    if (sp) b.dataset.partei = sp;
    const name = sp ? parteiName(sp) : null;
    if (stand.modus === "boss") {
      /* 59 */
      b.append(
        el("p", "sl-sieger-kicker", t("schlacht.ende", "Die Schlacht ist geschlagen")),
        el("h2", "sl-sieger-titel", s === "menschen" ? t("schlacht.boss.besiegt", "Das Mutterschiff ist gefallen!") : t("schlacht.boss.entkommen", "Das Mutterschiff entkommt")),
        el("p", "sl-sieger-stand", t("schlacht.boss.zerstoert", "{p} % zerstört").replace("{p}", Math.round(Number(stand.prozent_menschen) || 0)))
      );
    } else b.append(
      el("p", "sl-sieger-kicker", t("schlacht.ende", "Die Schlacht ist geschlagen")),
      el("h2", "sl-sieger-titel", name ? name + " " + t("schlacht.siegt", "siegt!") : t("schlacht.unentschieden", "Unentschieden")),
      el("p", "sl-sieger-stand", stand.endlos ? rundenText(stand.punkte_menschen, stand.punkte_aliens) : standText(stand.prozent_menschen))
    );
    if (!RUHIG.matches) {
      const funken = el("div", "sl-funken");
      funken.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 24; i++) {
        const f = el("span");
        f.style.setProperty("--x", (hash("fx" + i) * 100) + "%");
        f.style.setProperty("--d", (hash("fd" + i) * 1.8).toFixed(2) + "s");
        funken.appendChild(f);
      }
      b.appendChild(funken);
    }
    return b;
  }

  /* ------------------------------------------------------
     SAMMELPHASE UND WAHL (Migration 57)
  ------------------------------------------------------ */
  function serverJetzt() { return Date.now() + zeitVersatz; }

  function countdownText() {
    const ms = Math.max(0, Date.parse(schlacht.beginn_at || schlacht.runde_at) - serverJetzt());
    const sek = Math.ceil(ms / 1000);
    return String(Math.floor(sek / 60)).padStart(2, "0") + ":" + String(sek % 60).padStart(2, "0");
  }

  function lobbyZeigen(ziel2) {
    const box = el("section", "sl-lobby");
    box.setAttribute("aria-labelledby", "sl-lobby-titel");
    const kopf = el("div", "sl-lobby-kopf");
    const titel = el("h2", "sl-lobby-titel", bossModus() ? t("schlacht.boss.lobbyTitel", "Die Allianz sammelt sich") : t("schlacht.wahl.titel", "Die Flotten sammeln sich"));
    titel.id = "sl-lobby-titel";
    const uhr = el("p", "sl-lobby-uhr");
    uhr.id = "schlacht-countdown";
    uhr.setAttribute("aria-live", "off");
    kopf.append(
      el("p", "sl-lobby-kicker", bossModus() ? t("schlacht.boss.lobbyKicker", "Ein Mutterschiff nähert sich") : t("schlacht.wahl.kicker", "Wähle deine Seite für diese Schlacht")),
      titel,
      uhr,
      el("p", "sl-lobby-text", bossModus() ? t("schlacht.boss.lobbyText", "Wähle eine Partei und ein Schiff – alle kämpfen gemeinsam gegen das Mutterschiff. Sein Leben bleibt über die Runden erhalten.")
        : t("schlacht.wahl.text", "Wähle eine Partei und eines ihrer Schiffe. Deine Hangar-Ausbauten gelten für jedes Schiff."))
    );
    const tafel = el("div", "sl-wahl");
    tafel.id = "schlacht-wahl";
    const st = el("p", "sl-status");
    st.id = "schlacht-status";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    if (!angemeldet()) st.textContent = t("schlacht.anmelden", "Melde dich an, um mitzukämpfen.");
    box.append(kopf, tafel, st);
    ziel2.appendChild(box);
    wahlAuffrischen();
    lobbyTakt();
    lobbyUhr = setInterval(lobbyTakt, 250);
  }

  /* Countdown; bei 0 einmal den Stand holen - dort stellt die
     Datenbank die Flotten auf (schlacht_sammeln_beenden). */
  function lobbyTakt() {
    if (!sammelphase() || !seiteOffen()) { clearInterval(lobbyUhr); lobbyUhr = null; return; }
    const text = countdownText();
    const u = document.getElementById("schlacht-countdown");
    if (u) u.textContent = t("schlacht.wahl.start", "Start in") + " " + text;
    const kopfUhr = document.getElementById("schlacht-uhr");
    if (kopfUhr) kopfUhr.textContent = text;
    if (text === "00:00" && startAngestossen !== schlacht.id) {
      startAngestossen = schlacht.id;
      tick();
    }
  }

  /* Die Wahl-Tafel: zwei Parteien mit je vier Schiffen. In der
     Sammelphase in der Seite, im Kampf ueber dem Feld. */
  function wahlTafelZeigen(an) {
    const ueber = document.getElementById("schlacht-wahl-ueber");
    const knopf = document.getElementById("schlacht-wahl-knopf");
    if (!ueber) return;
    wahlOffen = !!an;
    ueber.hidden = !wahlOffen;
    if (knopf) knopf.setAttribute("aria-expanded", wahlOffen ? "true" : "false");
    if (!wahlOffen) return;
    ueber.replaceChildren();
    const kopf = el("div", "sl-wahl-ueber-kopf");
    kopf.appendChild(el("h3", "sl-wahl-ueber-titel", t("schlacht.wahl.naechste", "Für die nächste Runde")));
    const zu = el("button", "sl-rund-knopf");
    zu.type = "button";
    zu.setAttribute("aria-label", t("schlacht.wahl.zu", "Wahl schließen"));
    zu.innerHTML = SYM_ZU;   // festes SVG
    zu.addEventListener("click", function () { wahlTafelZeigen(false); if (knopf) knopf.focus({ preventScroll: true }); });
    kopf.appendChild(zu);
    const tafel = el("div", "sl-wahl");
    tafel.id = "schlacht-wahl";
    ueber.append(kopf, tafel);
    wahlAuffrischen();
  }

  function wahlAuffrischen() {
    const tafel = document.getElementById("schlacht-wahl");
    if (!tafel || !schlacht) return;
    const meine = stand && stand.meine_wahl;
    const ich = einheiten.find(function (e) { return e.firebase_uid === meineUid; });
    const fest = ich ? (ich.partei || parteiVon(ich.seite)) : null;
    const zahlen = (stand && stand.wahl) || {};
    tafel.replaceChildren();
    tafel.classList.toggle("ist-boss", bossModus());
    if (bossModus()) { bossWahl(tafel, meine, zahlen); return; }
    ["menschen", "aliens"].forEach(function (slot) {
      const partei = parteiVon(slot);
      const spalte = el("section", "sl-wahl-partei");
      spalte.dataset.partei = partei;
      const gesperrt = !!(fest && fest !== partei);
      spalte.classList.toggle("ist-gesperrt", gesperrt);
      const kopf = el("div", "sl-wahl-partei-kopf");
      const n = slot === "menschen" ? zahlen.links : zahlen.rechts;
      kopf.append(
        el("h3", "sl-wahl-partei-name", parteiName(partei)),
        el("p", "sl-wahl-partei-text", typeof schlachtParteiText === "function" ? schlachtParteiText(partei, "text") : ""),
        el("p", "sl-wahl-partei-zahl", (n || 0) + " " + t("schlacht.wahl.kaempfer", "Kämpfer"))
      );
      const typen = el("div", "sl-wahl-typen");
      typen.setAttribute("role", "group");
      typen.setAttribute("aria-label", parteiName(partei));
      (HANGAR_REIHENFOLGE[partei] || []).forEach(function (typ) {
        typen.appendChild(wahlKarte(partei, typ, !!(meine && meine.partei === partei && meine.typ === typ), gesperrt));
      });
      spalte.append(kopf, typen);
      tafel.appendChild(spalte);
    });
  }

  /* 59: Boss - jede freigegebene Partei, umschaltbar. */
  let bossPartei = null;
  function bossWahl(tafel, meine, zahlen) {
    const frei = typeof siteConfig !== "undefined" && siteConfig.featureFlags && siteConfig.featureFlags.schlachtParteien === true;
    const erlaubt = frei ? SCHLACHT_PARTEI_REIHE : ["menschen", "aliens"];
    if (!bossPartei || erlaubt.indexOf(bossPartei) < 0) bossPartei = meine && erlaubt.indexOf(meine.partei) >= 0 ? meine.partei : erlaubt[0];
    const spalte = el("section", "sl-wahl-partei");
    spalte.dataset.partei = bossPartei;
    const kopf = el("div", "sl-wahl-partei-kopf");
    const chips = el("div", "sl-wahl-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", t("schlacht.boss.partei", "Partei"));
    erlaubt.forEach(function (p) {
      const c = el("button", "sl-wahl-chip", parteiVolk(p));
      c.type = "button";
      c.dataset.partei = p;
      c.setAttribute("aria-pressed", p === bossPartei ? "true" : "false");
      c.addEventListener("click", function () { bossPartei = p; wahlAuffrischen(); });
      chips.appendChild(c);
    });
    kopf.append(
      chips,
      el("h3", "sl-wahl-partei-name", parteiName(bossPartei)),
      el("p", "sl-wahl-partei-text", schlachtParteiText(bossPartei, "text")),
      el("p", "sl-wahl-partei-zahl", (zahlen.links || 0) + " " + t("schlacht.boss.inAllianz", "in der Allianz"))
    );
    const typen = el("div", "sl-wahl-typen");
    typen.setAttribute("role", "group");
    typen.setAttribute("aria-label", parteiName(bossPartei));
    (HANGAR_REIHENFOLGE[bossPartei] || []).forEach(function (typ) {
      typen.appendChild(wahlKarte(bossPartei, typ, !!(meine && meine.partei === bossPartei && meine.typ === typ), false));
    });
    spalte.append(kopf, typen);
    tafel.appendChild(spalte);
  }

  function wahlKarte(partei, typ, aktiv, gesperrt) {
    const T = HANGAR_TYPEN[typ];
    const st = meineStufen || { leben: 0, schaden: 0, spezial: 0 };
    const w = hangarWerte(typ, st, partei);
    const b = el("button", "sl-wahl-typ" + (aktiv ? " ist-aktiv" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", aktiv ? "true" : "false");
    b.disabled = gesperrt;
    const bildBox = el("span", "sl-wahl-bild");
    if (window.fhSchiffe) bildBox.appendChild(window.fhSchiffe.bild(typ, partei, st, 116));
    const name = t("hangar.typ." + typ + ".name", T.name);
    const werte = el("span", "sl-wahl-werte",
      t("hangar.wert.leben", "Leben") + " " + Math.round(w.leben * w.anzahl) + " · " + t("schlacht.wahl.schaden", "Schaden") + " " + Math.round(w.schaden * w.anzahl * 10) / 10);
    b.append(
      bildBox,
      el("span", "sl-wahl-name", name + (w.anzahl > 1 ? " ×" + w.anzahl : "")),
      el("span", "sl-wahl-rolle", t("hangar.typ." + typ + ".rolle", T.rolle)),
      werte,
      el("span", "sl-wahl-spezial", t("hangar.typ." + typ + ".spezial", T.spezial) + ": " + t("hangar.typ." + typ + ".spezialText", T.spezialText))
    );
    b.addEventListener("click", function () { if (!aktiv) waehlen(partei, typ); });
    return b;
  }

  async function waehlen(partei, typ) {
    if (wahlLaeuft || !dbDa()) return;
    wahlLaeuft = true;
    try {
      const erg = await rpc("schlacht_partei_waehlen", { p_partei: partei, p_typ: typ });
      if (!erg) return;
      if (erg.ok) {
        const vorher = stand && stand.meine_wahl;
        stand = Object.assign({}, stand || {}, { meine_wahl: { partei: partei, typ: typ } });
        /* Zaehler sofort anpassen - der naechste Takt holt die echten. */
        const slotVon = function (p2) { return bossModus() || p2 === parteiVon("menschen") ? "links" : "rechts"; };
        if (stand.wahl && (!vorher || slotVon(vorher.partei) !== slotVon(partei))) {
          const w2 = Object.assign({}, stand.wahl);
          const slot = slotVon(partei);
          w2[slot] = (w2[slot] || 0) + 1;
          if (vorher) { const alt = slot === "links" ? "rechts" : "links"; w2[alt] = Math.max(0, (w2[alt] || 0) - 1); }
          stand.wahl = w2;
        }
        wahlAuffrischen();
        if (klang() && fx()) klang().sfx(fx().WAFFEN[typ] || "laser", true);
        const name = t("hangar.typ." + typ + ".name", HANGAR_TYPEN[typ].name);
        status((erg.ab === "start" ? t("schlacht.wahl.ok", "{typ} für {partei} – du bist beim Start dabei.")
          : t("schlacht.wahl.okRunde", "{typ} für {partei} – ab der nächsten Runde.")).replace("{typ}", name).replace("{partei}", klein(parteiName(partei))), false);
      } else {
        fehler(erg.grund);
      }
    } catch (err) {
      console.warn("Sternenschlacht: Wahl fehlgeschlagen:", err);
      fehler(null);
    } finally {
      wahlLaeuft = false;
    }
  }

  /* ------------------------------------------------------
     TAKT, SEITE, HINWEIS
  ------------------------------------------------------ */
  async function tick() {
    const vorher = schlacht ? schlacht.status : null, vorherId = schlacht ? schlacht.id : null, vorherSammeln = sammelphase();
    await laden();
    await aktionenHolen();
    const wechsel = !schlacht || schlacht.status !== vorher || schlacht.id !== vorherId || sammelphase() !== vorherSammeln;
    if (seiteOffen()) {
      if (sammelphase()) { if (wechsel || !document.getElementById("schlacht-wahl")) aufbauen(); else wahlAuffrischen(); }
      else if (wechsel || !canvas) aufbauen();
      else {
        bannerAuffrischen();
        if (wahlOffen) wahlAuffrischen();
        if (front()) { if (front().aktiv(stand) && !document.getElementById("schlacht-front")) aufbauen(); else front().auffrischen(stand); }
      }
    }
    hinweisAuffrischen();
  }

  function taktStarten() {
    clearInterval(takt);
    takt = setInterval(function () {
      if (!seiteOffen()) { clearInterval(takt); takt = null; return; }
      tick();
    }, TAKT_MS);
  }

  /* main.js ruft das bei JEDEM Seitenwechsel mit der neuen Seite auf -
     so merkt sich die Buehne, wohin X zurueckfuehrt, und schliesst
     sich, sobald eine andere Seite offen ist. */
  window.updateSternenschlachtPage = function (pageID) {
    if (pageID !== "sternenschlacht") {
      vorherigeSeite = pageID;
      buehneSchliessen();
      return;
    }
    buehneOeffnen();
    aufbauen();
    tick().then(function () { if (seiteOffen()) aufbauen(); });
    taktStarten();
    hinweisAuffrischen();
  };

  /* Hinweis auf allen anderen Seiten: nur in 2100, nur wenn eine
     Schlacht laeuft. Alle 30 s ein leichter Blick in die Tabelle. */
  function hinweisAuffrischen() {
    let h = document.getElementById("fh-schlacht-hinweis");
    const zeigen = ist2100() && schlacht && schlacht.status === "laeuft"
      && (!schlacht.ende_at || Date.parse(schlacht.ende_at) > Date.now()) && !seiteOffen();
    if (!zeigen) { if (h) h.remove(); return; }
    const text = bossModus()
      ? (sammelphase() ? t("schlacht.boss.hinweisWahl", "Ein Mutterschiff naht – schließ dich der Allianz an!") : t("schlacht.boss.hinweis", "Das Mutterschiff greift an!"))
      : sammelphase() ? t("schlacht.hinweisWahl", "Die Flotten sammeln sich – wähle deine Partei!") : t("schlacht.hinweis", "Sternenschlacht läuft!");
    if (h) { const tx = h.querySelector(".fh-schlacht-hinweis-text"); if (tx && tx.textContent !== text) tx.textContent = text; return; }
    h = el("div", "fh-schlacht-hinweis");
    h.id = "fh-schlacht-hinweis";
    h.setAttribute("role", "status");
    const k = el("button", "fh-schlacht-hinweis-knopf", t("schlacht.hinweisKnopf", "Jetzt mitkämpfen"));
    k.type = "button";
    k.addEventListener("click", function () { if (typeof changePage === "function") changePage("sternenschlacht"); });
    h.append(el("span", "fh-schlacht-hinweis-punkt"), el("span", "fh-schlacht-hinweis-text", text), k);
    document.body.appendChild(h);
  }

  async function hinweisPruefen() {
    if (!ist2100() || !dbDa() || seiteOffen()) { hinweisAuffrischen(); return; }
    try {
      const s = await letzteSchlacht();
      if (!schlacht || !s || s.id !== schlacht.id || s.status !== schlacht.status) schlacht = s || null;
    } catch (e) { /* naechstes Mal */ }
    hinweisAuffrischen();
  }

  function navAnpassen() {
    document.querySelectorAll('[data-page="sternenschlacht"]').forEach(function (a) {
      if (a.closest("#sternenschlacht")) return;
      a.classList.toggle("fh-flag-aus", !ist2100());
    });
  }

  document.addEventListener("fh:epoche", function () { navAnpassen(); hinweisPruefen(); if (seiteOffen()) aufbauen(); });
  window.addEventListener("resize", function () { if (seiteOffen()) canvasEinpassen(); });
  window.addEventListener("load", function () { setTimeout(hinweisPruefen, 3000); });
  setInterval(hinweisPruefen, 30000);
  navAnpassen();
})();
