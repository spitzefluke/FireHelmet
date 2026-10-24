/* ======================================================
   STERNENREISE (Claude Design „Sternenreise“, Entwurf Nocturne)
   ---------------------------------------------------
   Ein Live-Erlebnis in sechs Teilen:

     schlacht   Erdflotte gegen das Mutterschiff des Schwarms (40 s),
                bis es fällt – „Die Schlacht ist gewonnen.“
     bereit     Jeder besetzt eine Kanone der Arche: Name, Feuerfarbe
     reise      rund fünf Minuten durch fünf Sektoren; jede Kanone
                deckt einen Sektor (Bahn), die Hülle repariert sich nicht
     ankunft    Terra Nova kommt näher – und öffnet ein Auge
     landung    die Arche setzt auf          (Hülle > 0)
     zerstoert  die Arche zerbricht          (Hülle 0)

   Danach ändert sich die ganze Seite: „Terra Nova“ (gelandet, ein
   Auge wacht über die Kolonie) oder „Verwahrung“ (Arche verloren,
   Gitter, Akte, das Auge schläft nicht) – siehe weltAn() unten und
   css/97-sternenreise.css (html.fh-terra / html.fh-verwahrung).

   WIE ES GEBAUT IST
   - Der Entwurf ist eine DC-Komponente (Klasse mit setState). Ihre
     Zeichen- und Spiellogik steht hier fast wörtlich in der Klasse
     Reise; die Vorlage (Kopfzeilen, Karten, Anzeigen) baut ui() als
     DOM, alle Texte per textContent und t() (i18n.js: reise.*).
   - Schiffe und Waffen kommen aus scripts/hangar/schiffe.js und
     scripts/schlacht/schlacht-fx.js (Design V2, unverändert).
   - Mitspieler: Andere Tabs im selben Browser kommen über einen
     BroadcastChannel dazu (wie im Entwurf), die übrigen Kanonen
     besetzt die Crew aus NAMEN. Eine gemeinsame Reise für alle
     Zuschauer bräuchte eine Migration – noch nicht gebaut.

   Bisher nur als Admin-Vorschau (Admin → Live-Event → Epoche):
     fhSternenreise.start({ dauer, crew })   Film, danach die Seite
     fhSternenreise.welt("terra"|"verwahrung"|null, fin?)
     fhSternenreise.stopp()
   Geladen über fhNachladen("reise").
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function tf(key, fallback, werte) {
    let s = t(key, fallback);
    Object.keys(werte || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(werte[k])); });
    return s;
  }
  function sprache() { return typeof getCurrentLang === "function" && getCurrentLang() === "en" ? "en-US" : "de-DE"; }
  function zahl(n) { return Number(n || 0).toLocaleString(sprache()); }
  function el(tag, klasse, text) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text != null) e.textContent = text;
    return e;
  }
  /* Symbole: lucide (ISC), stroke-width 1.6 */
  const SYMBOL = {
    weiter: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
    ziel: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
    schild: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    planet: '<circle cx="12" cy="12" r="8"/><path d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5 1.1 1.6 6.5-.4 12-4.3 5.6-3.9 8.9-8.5 7.8-10.1-.6-.9-2.4-.8-4.8.1"/>',
    auge: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  };
  function symbol(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.6");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = SYMBOL[name] || "";   // feste Zeichenketten oben, keine Nutzerdaten
    return s;
  }
  function knopf(text, klasse, klick, sym) {
    const k = el("button", "rs-knopf" + (klasse ? " " + klasse : ""));
    k.type = "button";
    if (sym) k.appendChild(symbol(sym));
    k.appendChild(document.createTextNode(text));
    if (klick) k.addEventListener("click", klick);
    return k;
  }

  /* Takt der Story 'reise' in Sekunden ab dem Start (Migration 67,
     app.reise_takt): Schlacht, Kanone besetzen, Reise, Ergebnis. */
  const BEREIT_AB = 48.5, REISE_AB = 78.5, REISE_DAUER = 300;
  function dbDa() { return typeof supabaseClient !== "undefined" && !!supabaseClient; }
  function rpc(name, args) {
    const ruf = function () { return supabaseClient.rpc(name, args); };
    const p = typeof withSupabaseRlsColdStartRetry === "function" ? withSupabaseRlsColdStartRetry(ruf) : ruf();
    return Promise.resolve(p).then(function (a) { if (a.error) throw a.error; return a.data; });
  }

  /* Die Texte der fünf Sektoren (Entwurf: SEK[].name/text/feinde) */
  const SEK_TEXT = [
    ["kuiper", "Kuipergürtel", "Asteroiden und Piratenkaper", "Piraten-Armada"],
    ["orion", "Orion-Nebel", "Schwarm und Piraten jagen gemeinsam", "Schwarm · Piraten"],
    ["vega", "Trümmerfeld von Vega", "Die Maschinen erwachen in den Wracks", "Maschinen-Kollektiv · Piraten"],
    ["riff", "Kristallriff", "Die Kristall-Konklave verteidigt ihr Revier", "Kristall-Konklave · Schwarm"],
    ["kepler", "Kepler-Tor", "Die Geisterflotte und alle anderen zugleich", "Geisterflotte · alle Parteien"],
  ];
  function sekText(i, teil) {
    const z = SEK_TEXT[i], n = teil === "name" ? 1 : teil === "text" ? 2 : 3;
    return t("reise.sek." + z[0] + "." + teil, z[n]);
  }

  class Reise {
    NAMEN = ["Nordlicht", "Kometa", "Pixelpirat", "Sturmfalke", "Lunaris", "Orbitkind", "Glutkern", "Sternschnuppe", "Nebelwolf", "Quasar_Lena", "Funkfeuer", "Bordkatze", "Raumschmied", "Hagelkorn", "Vektor", "Polarstern"];
    SEK = [
      { mix: { stein: .62, truemmer: .14, kaper: .24 }, rate: 1.0, neb: ["#262a60", "#2b2741"] },
      { mix: { stein: .3, drohne: .28, stachel: .1, kaper: .18, brigant: .14 }, rate: 1.3, neb: ["#423a6a", "#262a60"] },
      { mix: { truemmer: .3, stein: .16, sonde: .3, zerstoerer: .12, kaper: .12 }, rate: 1.6, neb: ["#353b80", "#3f424d"] },
      { mix: { splitter: .3, prisma: .14, drohne: .2, stachel: .12, stein: .24 }, rate: 1.9, neb: ["#5d5294", "#2b2741"] },
      { mix: { irrlicht: .2, phantom: .16, zerstoerer: .08, brigant: .08, prisma: .08, stachel: .1, stein: .3 }, rate: 2.3, neb: ["#4c5397", "#262a60"] },
    ];
    FEIND = {
      drohne: { p: "aliens", r: 20, hp: 2, sp: 150, fire: 0 }, stachel: { p: "aliens", r: 30, hp: 5, sp: 110, fire: 3.4 },
      kaper: { p: "piraten", r: 24, hp: 3, sp: 165, fire: 2.8 }, brigant: { p: "piraten", r: 36, hp: 7, sp: 90, fire: 2.2 },
      sonde: { p: "maschinen", r: 20, hp: 3, sp: 140, fire: 3.2 }, zerstoerer: { p: "maschinen", r: 40, hp: 9, sp: 80, fire: 2.4 },
      splitter: { p: "kristall", r: 24, hp: 3, sp: 175, fire: 3 }, prisma: { p: "kristall", r: 34, hp: 6, sp: 95, fire: 2.6 },
      irrlicht: { p: "geister", r: 20, hp: 2, sp: 195, fire: 0 }, phantom: { p: "geister", r: 30, hp: 5, sp: 120, fire: 2.6 },
    };
    FARBEN = [{ id: "violett", n: "Violett", c: "#b5abfc" }, { id: "glut", n: "Glut", c: "#ff9d3d" }, { id: "gift", n: "Gift", c: "#a6ff6e" }, { id: "rosa", n: "Rosa", c: "#ff9ae4" }, { id: "gold", n: "Gold", c: "#f0c96a" }, { id: "eis", n: "Eis", c: "#e9f8ff" }];
    KEY = "fhReiseKanone";
    BOLT = 1100;
    state = { phase: "laden", name: "", hud: null, boss: 100, sieg: false, banner: null, landing: false, landingEye: false, landed: false, lost: false, fin: null, crew: [], fireCol: "#b5abfc" };

    constructor(props, beimEnde) {
      this.props = props || {};
      this.beimEnde = beimEnde;
    }

    cfg() {
      const p = this.props;
      return {
        dur: Math.max(20, p.journeySeconds ?? 300),
        crew: Math.max(2, Math.min(16, p.crewSize ?? 9)),
      };
    }
    seed(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    farbName(c) { const f = this.FARBEN.find((x) => x.c === c) || this.FARBEN[0]; return t("reise.farbe." + f.id, f.n); }

    /* Entspricht componentDidMount des Entwurfs - ohne Fortsetzen
       aus localStorage (gemerkt werden nur Name und Feuerfarbe). */
    starten(root) {
      this.root = root;
      this.cv = root.querySelector("canvas");
      this.fadeEl = root.querySelector(".rs-blende");
      this.ebene = root.querySelector(".rs-ebene");
      const E = this.E = { W: 800, H: 600, dpr: 1, phase: "laden", stars: [], objs: [], bolts: [], cannons: [], remote: {}, mx: -999, my: -999, cx: 0, cy: 0, down: false, key: false, hull: 100, shake: 0, flash: 0, elapsed: 0, pt: 0, spawnAcc: 0, sector: -1, secT: 99, prevSec: 0, crewHits: 0, lastHud: 0, lastSave: 0, lastBc: 0, last: 0 };
      for (let i = 0; i < 240; i++) E.stars.push({ x: Math.random(), y: Math.random(), z: .15 + Math.random() * .85 });
      E.planet = this.makePlanet();
      this.id = Math.random().toString(36).slice(2, 9);
      try {
        const gemerkt = JSON.parse(localStorage.getItem(this.KEY) || "null");
        if (gemerkt) { this.state.name = String(gemerkt.name || "").slice(0, 18); if (this.FARBEN.some((f) => f.c === gemerkt.fireCol)) this.state.fireCol = gemerkt.fireCol; }
      } catch (e) { /* Privatmodus */ }
      this.onResize = () => this.resize();
      this.onMove = (e) => { const R = this.rect || { left: 0, top: 0 }; E.mx = e.clientX - R.left; E.my = e.clientY - R.top; E.cx = e.clientX; E.cy = e.clientY; };
      this.onUp = () => { E.down = false; };
      this.onKey = (e) => {
        if (E.phase === "reise" && e.code === "Space" && !(e.target && /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName))) { E.key = e.type === "keydown"; e.preventDefault(); }
      };
      this.onDown = (e) => { this.onMove(e); E.down = true; };
      window.addEventListener("resize", this.onResize);
      window.addEventListener("pointermove", this.onMove);
      window.addEventListener("pointerup", this.onUp);
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      this.cv.addEventListener("pointerdown", this.onDown);
      try {
        this.bc = new BroadcastChannel("fh-sternenreise");
        this.bc.onmessage = (m) => {
          const d = m.data; if (!d || d.id === this.id) return;
          const known = !!E.remote[d.id];
          if (d.phase !== "reise") { if (known) { delete E.remote[d.id]; this.buildCannons(); } return; }
          E.remote[d.id] = { name: String(d.name || "").slice(0, 18), ang: Number(d.ang) || 0, fire: !!d.fire, col: /^#[0-9a-f]{6}$/i.test(d.col) ? d.col : "#7dffd2", last: performance.now() };
          if (!known && (E.phase === "reise" || E.phase === "bereit")) this.buildCannons();
        };
      } catch (e) { /* ohne Mitspieler aus anderen Tabs */ }
      const go = () => {
        if (!window.fhSchiffe || !window.fhSchlachtFx || !this.cv) { this.wt = setTimeout(go, 60); return; }
        this.resize();
        if (!this.ctx) { this.wt = setTimeout(go, 60); return; }
        if (window.ResizeObserver && !this.ro) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.root); }
        this.enter(this.props.live ? this.livePhase() : (this.props.startPhase || "schlacht"), null);
        this.raf = requestAnimationFrame(this.loop);
      };
      go();
    }
    stoppen() {
      cancelAnimationFrame(this.raf); clearTimeout(this.wt); clearTimeout(this.bt);
      window.removeEventListener("resize", this.onResize); window.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp); window.removeEventListener("keydown", this.onKey); window.removeEventListener("keyup", this.onKey);
      if (this.cv) this.cv.removeEventListener("pointerdown", this.onDown);
      if (this.bc) this.bc.close();
      if (this.ro) this.ro.disconnect();
      if (window.fhSchlachtFx) window.fhSchlachtFx.leeren();
      this.E.phase = "aus";
    }
    resize() {
      const E = this.E, root = this.root || this.cv; if (!root) return;
      const R = this.rect = root.getBoundingClientRect();
      if (R.width < 2 || R.height < 2) return;
      E.W = R.width; E.H = R.height; E.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.round(E.W * E.dpr); this.cv.height = Math.round(E.H * E.dpr);
      this.ctx = this.cv.getContext("2d");
    }
    save() {
      try { localStorage.setItem(this.KEY, JSON.stringify({ name: this.state.name, fireCol: this.state.fireCol })); } catch (e) { /* Privatmodus */ }
    }

    enter(ph, saved) {
      const E = this.E; E.phase = ph; E.pt = 0; E.flash = 0;
      if (window.fhSchlachtFx) fhSchlachtFx.leeren();
      clearTimeout(this.bt);
      if (ph === "erde") { this.stoppen(); if (this.beimEnde) this.beimEnde((saved && saved.fin) || this.finish()); return; }
      if (this.fadeEl && ph !== "landung") { this.fadeEl.style.transition = "none"; this.fadeEl.style.opacity = 0; }
      const st = { phase: ph, sieg: false, banner: null, landing: false, landingEye: false, landed: false, lost: false };
      if (ph === "landung") { E.touched = false; E.dust = []; E.shake = 0; if (!this.land) this.land = this.makeLand(); }
      if (ph === "zerstoert") { E.chain = 0; E.boom = false; E.debris = []; st.lost = true; }
      if (ph === "schlacht") { this.setupBattle(); st.boss = 100; E.crewHits = 0; E.cannons.forEach(k => k.hits = 0); if (this.props.live) E.battle.t = Math.max(0, this.liveSek()); }
      if (ph === "bereit" || ph === "reise" || ph === "ankunft") this.buildCannons(saved && saved.hits);
      if (ph === "bereit") st.crew = E.cannons.filter(k => !k.me).map(k => k.name);
      if (ph === "reise") {
        E.objs = []; E.bolts = []; E.elapsed = 0; E.hull = 100;
        E.crewHits = 0; E.sector = -1; E.spawnAcc = 0; E.secT = 99;
        E.cannons.forEach(k => k.hits = 0);
      }
      if (ph === "ankunft") { E.elapsed = this.cfg().dur; E.sector = 4; }
      this.setState(st, () => this.save());
    }

    finish(lost) {
      const E = this.E;
      if (this.props.live && this.stand) {
        const me0 = E.cannons.find(k => k.me) || { hits: 0 }, d = this.stand;
        return { crewHits: Number(d.treffer_gesamt) || 0, myHits: d.ich ? Number(d.ich.treffer) || 0 : me0.hits, hull: Math.round(Number(d.huelle) || 0),
          crew: Number(d.kanonen) || 0, name: this.state.name || t("reise.du", "Du"), lost: !!lost };
      }
      if (!E.cannons.length) this.buildCannons();
      if (!E.crewHits) { E.cannons.forEach(k => k.hits = 30 + Math.floor(Math.random() * 70)); E.crewHits = E.cannons.reduce((s, k) => s + k.hits, 0); E.hull = 64; }
      const me = E.cannons.find(k => k.me) || { hits: 0 };
      return { crewHits: E.crewHits, myHits: me.hits, hull: Math.round(E.hull), crew: E.cannons.length, name: this.state.name || t("reise.du", "Du"), leaders: this.leaders(10), lost: !!lost };
    }

    /* ------------------------------------------------------
       LIVE FÜR ALLE (Story 'reise', Migration 67)
       Die Uhr läuft ab dem Start der Story (props.live.t0). Jeder
       verteidigt seinen Sektor; was dort die Arche trifft (schaden),
       meldet reise_melden() alle 2 s. Die Hülle für alle und das
       Ergebnis kommen aus der Datenbank (this.stand).
    ------------------------------------------------------ */
    liveSek() { return (Date.now() - this.props.live.t0) / 1000; }
    livePhase() {
      const s = this.liveSek();
      return s < BEREIT_AB ? "schlacht" : s < REISE_AB ? "bereit" : "reise";
    }
    schaden(o, menge) {
      const E = this.E;
      if (!this.props.live) { E.hull = Math.max(0, E.hull - menge); return; }
      const me = E.cannons.find(k => k.me);
      if (me && o && o.lane === me.lane) E.eigen = (E.eigen || 0) + menge;
    }
    liveTakt(ts) {
      const E = this.E, s = this.liveSek();
      if (E.phase === "schlacht" && s >= BEREIT_AB) this.enter("bereit");
      if (E.phase === "bereit" && s >= REISE_AB) this.enter("reise");
      if (E.phase === "bereit" && this.ref && this.ref.los && ts - (this.letzterLos || 0) > 400) {
        this.letzterLos = ts;
        this.losSchreiben();
      }
      const fragen = E.phase === "reise" || (E.phase === "ankunft" && !this.stand);
      if (fragen && ts - (this.letzteMeldung || 0) > 2000) { this.letzteMeldung = ts; this.melden(); }
    }
    losSchreiben() {
      const R = this.ref || {};
      if (!R.los) return;
      const rest = Math.max(0, Math.ceil(REISE_AB - this.liveSek()));
      R.losText.textContent = this.bemannt ? tf("reise.live.bereit", "Bereit · Start in {n} s", { n: rest }) : t("reise.bereit.los", "Kanone besetzen");
      R.los.disabled = !!this.bemannt;
    }
    melden() {
      if (this.meldetGerade || !dbDa()) return;
      const E = this.E, L = this.props.live, me = E.cannons.find(k => k.me);
      const zuEnde = E.elapsed >= this.cfg().dur;
      let p;
      if (zuEnde) p = rpc("reise_abschluss", { p_story_id: L.storyId });
      else if (this.bemannt) {
        p = rpc("reise_melden", { p_story_id: L.storyId, p_schaden: Math.round((E.eigen || 0) * 100) / 100, p_treffer: me ? me.hits : 0,
          p_name: (this.state.name || "").trim() || null, p_farbe: this.state.fireCol });
      } else p = rpc("reise_stand", { p_story_id: L.storyId });
      this.meldetGerade = true;
      p.then((d) => this.standNeu(d), (err) => console.warn("Sternenreise:", (err && err.message) || err))
        .then(() => { this.meldetGerade = false; });
    }
    standNeu(d) {
      if (!d || d.ok !== true || !this.E) return;
      this.stand = d;
      this.E.hull = Math.max(0, Math.min(100, Number(d.huelle)));
      /* Die anderen Kanonen tragen die Namen echter Mitspieler. */
      const namen = (d.crew || []).filter((c) => !c.ich).map((c) => String(c.name || "").slice(0, 18));
      this.E.cannons.filter((k) => !k.me && !k.remote).forEach((k, i) => { if (namen[i]) k.name = namen[i]; });
    }

    /* ------------------------------------------------------
       ANZEIGEN (statt der Vorlage des Entwurfs)
       Die Ebene über dem Bild wird nur neu gebaut, wenn sich ihr
       Aufbau ändert (Phase, Banner, Sieg ...); Zahlen schreibt
       hudSchreiben() alle 200 ms in die gemerkten Felder.
    ------------------------------------------------------ */
    setState(patch, fertig) {
      Object.assign(this.state, patch);
      const s = this.state;
      const sig = [s.phase, s.sieg, s.banner && s.banner.nr, s.landing, s.landingEye, s.landed, s.lost, !!s.hud, s.crew.length, s.fireCol].join("|");
      if (sig !== this.sig) { this.sig = sig; this.ui(); }
      this.hudSchreiben();
      if (fertig) fertig();
    }

    farbwahl(gross) {
      const reihe = el("div", "rs-farben" + (gross ? " ist-gross" : ""));
      this.FARBEN.forEach((f) => {
        const k = el("button", "rs-farbe" + (f.c === this.state.fireCol ? " ist-an" : ""));
        k.type = "button";
        k.style.setProperty("--rs-farbe", f.c);
        const name = t("reise.farbe." + f.id, f.n);
        k.title = name; k.setAttribute("aria-label", name);
        k.setAttribute("aria-pressed", f.c === this.state.fireCol ? "true" : "false");
        k.addEventListener("click", () => this.setState({ fireCol: f.c }, () => this.save()));
        reihe.appendChild(k);
      });
      return reihe;
    }

    ui() {
      const s = this.state, eb = this.ebene, ph = s.phase;
      if (!eb) return;
      this.ref = {};
      const R = this.ref;
      const teile = [];
      const banner = (klasse, kicker, titel, unter) => {
        const b = el("div", "rs-banner " + (klasse || ""));
        b.appendChild(el("div", "rs-kicker", kicker));
        b.appendChild(el("div", "rs-gross", titel));
        if (unter) b.appendChild(unter);
        return b;
      };
      this.root.classList.toggle("ist-zielen", ph === "reise");

      if (ph === "schlacht") {
        const kopf = el("div", "rs-ecke rs-lo rs-kopf");
        kopf.appendChild(el("div", "rs-kicker", t("reise.schlacht.kicker", "Die Sternenschlacht")));
        kopf.appendChild(el("div", "rs-titel", t("reise.schlacht.titel", "Erdflotte gegen Schwarm, Piraten und Maschinen")));
        const boss = el("div", "rs-ecke rs-ro rs-boss");
        const zeile = el("div", "rs-zeile");
        zeile.appendChild(el("span", null, t("reise.schlacht.boss", "Mutterschiff des Schwarms")));
        R.bossPct = zeile.appendChild(el("span", null, "100 %"));
        const bahn = el("div", "rs-bahn"); R.bossBalken = bahn.appendChild(el("div", "rs-bahn-fuell ist-boss"));
        boss.append(zeile, bahn);
        const unten = el("div", "rs-ecke rs-lu");
        unten.appendChild(knopf(t("reise.ueberspringen", "Überspringen"), "ist-leise", () => this.enter("bereit"), "weiter"));
        teile.push(kopf, boss, unten);
        if (s.sieg) {
          const linie = el("div", "rs-linie");
          teile.push(banner("ist-mitte", t("reise.sieg.kicker", "Sieg der Menschheit"), t("reise.sieg.titel", "Die Schlacht ist gewonnen."), linie));
        }
      }

      if (ph === "bereit") {
        const karte = el("div", "rs-karte rs-bereit");
        karte.appendChild(el("div", "rs-kicker", t("reise.bereit.kicker", "Tag 0 · Nach der Schlacht")));
        karte.appendChild(el("div", "rs-karte-titel", t("reise.bereit.titel", "Bringt das Mutterschiff nach Hause.")));
        karte.appendChild(el("p", "rs-text", tf("reise.bereit.text", "Rund {min} min durch die Galaxie bis zur neuen Erde. Jeder Zuschauer bekommt eine Kanone und verteidigt einen eigenen Sektor. Nur wenn alle mitschießen, kommt die Arche an.", { min: Math.max(1, Math.round(this.cfg().dur / 60)) })));
        const feld = el("label", "rs-feld");
        feld.appendChild(el("span", null, t("reise.bereit.name", "Name deiner Kanone")));
        const eingabe = el("input", "rs-eingabe");
        eingabe.type = "text"; eingabe.maxLength = 18; eingabe.value = s.name;
        eingabe.placeholder = t("reise.bereit.platzhalter", "z. B. Sternfalke");
        eingabe.addEventListener("input", () => {
          const v = eingabe.value.slice(0, 18); this.state.name = v;
          const me = this.E && this.E.cannons.find(k => k.me); if (me) me.name = v || t("reise.du", "Du");
          if (R.meTag) R.meTag.textContent = v || t("reise.du", "Du");
        });
        eingabe.addEventListener("keydown", (e) => { if (e.key === "Enter" && !this.props.live) this.enter("reise"); });
        feld.appendChild(eingabe);
        const farbe = el("div", "rs-feld");
        farbe.appendChild(el("span", null, t("reise.bereit.farbe", "Feuerfarbe")));
        const fz = el("div", "rs-farbzeile");
        fz.append(this.farbwahl(true), el("span", "rs-leise", this.farbName(s.fireCol)));
        farbe.appendChild(fz);
        const crew = el("div", "rs-crew");
        crew.appendChild(el("div", "rs-leise", this.props.live ? t("reise.live.anBord", "Jeder Zuschauer besetzt eine Kanone – die Reise beginnt für alle zugleich.")
          : tf("reise.bereit.anBord", "An Bord · {n} Kanonen besetzt", { n: s.crew.length + 1 })));
        const tags = el("div", "rs-tags");
        R.meTag = tags.appendChild(el("span", "rs-tag ist-ich", s.name || t("reise.du", "Du")));
        if (!this.props.live) s.crew.forEach((n) => tags.appendChild(el("span", "rs-tag", n)));
        crew.appendChild(tags);
        const los = knopf(t("reise.bereit.los", "Kanone besetzen"), "ist-haupt", () => {
          this.save();
          if (!this.props.live) { this.enter("reise"); return; }
          this.bemannt = true; this.losSchreiben();
        }, "ziel");
        if (this.props.live) {
          R.los = los;
          R.losText = los.lastChild;
          eingabe.addEventListener("keydown", (e) => { if (e.key === "Enter") { this.bemannt = true; this.losSchreiben(); } });
        }
        karte.append(feld, farbe, crew, los);
        if (this.props.live) this.losSchreiben();
        teile.push(karte);
      }

      if (ph === "reise" && s.hud) {
        const lo = el("div", "rs-ecke rs-lo rs-sektor");
        R.sekNr = lo.appendChild(el("span", "rs-tag ist-rand"));
        R.sekName = lo.appendChild(el("div", "rs-titel ist-klein"));
        R.sekFeinde = lo.appendChild(el("div", "rs-leise"));
        const mitte = el("div", "rs-ecke rs-om rs-fortschritt");
        const z = el("div", "rs-zeile");
        R.lj = z.appendChild(el("span"));
        R.rest = z.appendChild(el("span", "rs-ziffern"));
        const bahn = el("div", "rs-bahn ist-reise");
        R.reiseFuell = bahn.appendChild(el("div", "rs-bahn-fuell"));
        R.reisePunkt = bahn.appendChild(el("div", "rs-bahn-punkt"));
        mitte.append(z, bahn);
        const huelle = el("div", "rs-ecke rs-ro rs-huelle");
        const hk = el("div", "rs-huelle-kopf");
        R.huelleSym = hk.appendChild(symbol("schild"));
        const hb = el("div", "rs-huelle-text");
        hb.appendChild(el("span", "rs-kicker", t("reise.huelle", "Hülle der Arche")));
        R.huelleZustand = hb.appendChild(el("span", "rs-leise"));
        hk.appendChild(hb);
        R.huelleZahl = hk.appendChild(el("span", "rs-huelle-zahl"));
        const segs = el("div", "rs-segmente");
        R.segs = [];
        for (let i = 0; i < 20; i++) R.segs.push(segs.appendChild(el("div", "rs-segment")));
        huelle.append(hk, segs);
        R.huelle = huelle;
        const lu = el("div", "rs-ecke rs-lu rs-rang");
        const rk = el("div", "rs-zeile rs-kicker");
        R.crewZahl = rk.appendChild(el("span"));
        R.crewTreffer = rk.appendChild(el("span"));
        R.rangListe = el("div", "rs-rangliste");
        lu.append(rk, R.rangListe, el("div", "rs-leise", t("reise.sektorJe", "Jede Kanone deckt einen Sektor")));
        const ru = el("div", "rs-ecke rs-ru rs-ich");
        R.ichName = ru.appendChild(el("div", "rs-kicker"));
        const tr = el("div", "rs-ich-zahl");
        R.ichTreffer = tr.appendChild(el("span", "rs-ziffern"));
        tr.appendChild(el("span", "rs-leise", " " + t("reise.treffer", "Treffer")));
        ru.appendChild(tr);
        R.drohung = ru.appendChild(el("div", "rs-drohung"));
        ru.appendChild(el("div", "rs-leise", t("reise.steuerung", "Maus zielt · Klicken, Halten oder Leertaste feuert")));
        ru.appendChild(this.farbwahl(false));
        teile.push(lo, mitte, huelle, lu, ru);
        if (s.banner) {
          teile.push(banner("ist-oben", tf("reise.sektor", "Sektor {n}", { n: s.banner.nr }), s.banner.name, el("div", "rs-unter", s.banner.text)));
        }
      }

      if (ph === "ankunft" && s.landing) {
        const unter = s.landingEye ? el("div", "rs-unter ist-auge", t("reise.ankunft.auge", "Etwas dort unten öffnet sein Auge.")) : null;
        teile.push(banner("ist-oben", t("reise.ankunft.kicker", "Ziel erreicht"), t("reise.ankunft.titel", "Terra Nova in Sicht."), unter));
      }
      if (ph === "landung" && s.landed) {
        teile.push(banner("ist-hoch", t("reise.landung.kicker", "Terra Nova · Landeplatz 1"), t("reise.landung.titel", "Landung bestätigt.")));
      }
      if (ph === "zerstoert") {
        teile.push(banner("ist-oben ist-rot", t("reise.verloren.kicker", "Hülle 0 % · Signal verloren"), t("reise.verloren.titel", "Die Arche ist verloren.")));
      }

      /* Steuerung der Vorschau: unten in der Mitte */
      const steuer = el("div", "rs-steuer");
      if (this.props.vorschau && ph === "reise") {
        steuer.appendChild(knopf(t("reise.vorschau.ankunft", "Zur Ankunft"), "ist-leise", () => this.enter("ankunft"), "weiter"));
        steuer.appendChild(knopf(t("reise.vorschau.verlieren", "Arche verlieren"), "ist-leise", () => { this.E.hull = 0; }));
      }
      steuer.appendChild(knopf(t("reise.beenden", "Beenden"), "ist-leise", () => { if (this.beimAbbruch) this.beimAbbruch(); }, "x"));
      teile.push(steuer);
      eb.replaceChildren.apply(eb, teile);
    }

    hudSchreiben() {
      const s = this.state, R = this.ref || {};
      if (s.phase === "schlacht" && R.bossPct) {
        R.bossPct.textContent = s.boss + " %";
        R.bossBalken.style.width = s.boss + "%";
      }
      if (s.phase !== "reise" || !s.hud || !R.sekNr) return;
      const h = s.hud;
      R.sekNr.textContent = tf("reise.sektorVon", "Sektor {n} / 5", { n: h.nr });
      R.sekName.textContent = h.sector;
      R.sekFeinde.textContent = t("reise.angreifer", "Angreifer") + " · " + h.feinde;
      R.lj.textContent = tf("reise.lichtjahre", "{n} Lichtjahre bis Terra Nova", { n: h.lj });
      R.rest.textContent = h.left;
      R.reiseFuell.style.width = h.pct + "%";
      R.reisePunkt.style.left = h.pct + "%";
      R.huelle.style.boxShadow = h.hullShadow;
      R.huelleSym.style.color = h.hullCol;
      R.huelleZustand.textContent = h.hullState;
      R.huelleZustand.style.color = h.hullStateCol;
      R.huelleZahl.textContent = h.hull + " %";
      R.huelleZahl.style.color = h.hullCol;
      h.segs.forEach((g, i) => { R.segs[i].style.background = g.bg; R.segs[i].style.boxShadow = g.glow; });
      R.crewZahl.textContent = tf("reise.crew", "Crew · {n} Kanonen", { n: h.crew });
      R.crewTreffer.textContent = zahl(h.crewHits);
      R.rangListe.replaceChildren.apply(R.rangListe, h.leaders.map((r) => {
        const z = el("div", "rs-rangzeile" + (r.ich ? " ist-ich" : ""));
        z.appendChild(el("span", "rs-leise rs-ziffern", String(r.rank)));
        z.appendChild(el("span", "rs-rangname", r.name));
        if (r.live) z.appendChild(el("span", "rs-tag ist-rand ist-mini", "live"));
        z.appendChild(el("span", "rs-ziffern", zahl(r.hits)));
        return z;
      }));
      R.ichName.textContent = t("reise.deineKanone", "Deine Kanone") + " · " + h.myName;
      R.ichTreffer.textContent = zahl(h.myHits);
      R.drohung.textContent = tf("reise.ziele", "{n} Ziele in deinem Sektor", { n: h.threat });
      R.drohung.classList.toggle("ist-rot", h.threat > 0);
    }

    leaders(n) {
      return this.E.cannons.slice().sort((a, b) => b.hits - a.hits).slice(0, n).map((k, i) => ({ rank: i + 1, name: k.me ? (k.name + " " + t("reise.duKlammer", "(du)")) : k.name, hits: k.hits, live: !!k.remote, ich: !!k.me }));
    }

    buildCannons(hm) {
      const E = this.E, c = this.cfg(), prev = {}; E.cannons.forEach(k => prev[k.name] = k.hits);
      hm = hm || prev;
      const rem = Object.keys(E.remote);
      const nb = Math.max(0, c.crew - 1 - rem.length);
      if (!this.botNames) this.botNames = this.shuffle(this.NAMEN.slice());
      const list = [{ me: true, name: this.state.name || t("reise.du", "Du") }]
        .concat(rem.map(id => ({ remote: id, name: E.remote[id].name || t("reise.gast", "Gast") })))
        .concat(this.botNames.slice(0, nb).map(n => ({ name: n, skill: .5 + Math.random() * 1.1 })));
      const N = list.length, slots = [];
      for (let i = 0; i < N; i++) {
        const fx = N === 1 ? 0 : -.34 + .74 * i / (N - 1), top = i % 2 === 0;
        let fy = top ? -.072 : .07;
        for (const [cx, ry] of [[-.14, .2], [.09, .25]]) if (Math.abs(fx - cx) < .035) fy = (top ? -1 : 1) * (ry + .012);
        if (top && fy > -.1 && fx > -.26 && fx < -.04) fy = -.137;
        slots.push({ fx, fy });
      }
      let mid = Math.floor(N / 2); if (mid % 2) mid -= 1;
      const order = [mid].concat(slots.map((_, i) => i).filter(i => i !== mid));
      E.cannons = list.map((k, j) => Object.assign({ ang: -.2, cd: Math.random() * .5, hits: hm[k.name] || 0, jit: 0, flash: 0, x: 0, y: 0, tgt: null }, slots[order[j]], k));
      const lm = Math.floor(N / 2), lanes = [lm].concat(Array.from({ length: N }, (_, i) => i).filter(i => i !== lm));
      E.lanes = N; E.laneBot = {};
      E.cannons.forEach((k, j) => { k.lane = lanes[j]; E.laneBot[k.lane] = !k.me && !k.remote; });
    }

    setupBattle() {
      const H = [["arche", .16, .5, 300], ["traeger", .07, .2, 150], ["kreuzer", .26, .82, 130], ["fregatte", .31, .28, 96], ["fregatte", .24, .68, 90], ["jaeger", .39, .42, 54], ["jaeger", .41, .6, 54], ["jaeger", .36, .14, 50], ["jaeger", .37, .9, 50], ["jaeger", .45, .5, 50]];
      const A = [["mutterschiff", .85, .5, 400, "boss", 46], ["brutschiff", .68, .16, 140, "aliens", 8], ["brigant", .7, .84, 130, "piraten", 7], ["zerstoerer", .66, .36, 120, "maschinen", 7], ["stachel", .6, .64, 84, "aliens", 4], ["kaper", .56, .24, 60, "piraten", 3], ["sonde", .55, .5, 54, "maschinen", 2], ["drohne", .57, .76, 50, "aliens", 2], ["splitter", .52, .1, 56, "kristall", 3], ["irrlicht", .53, .9, 50, "geister", 2]];
      this.E.battle = {
        t: 0, fa: 0, ea: 0, ba: 0, down: 0, chain: 0, big: false, siegAt: 0, lastBoss: 0,
        hum: H.map(h => ({ typ: h[0], bx: h[1], by: h[2], b: h[3], seite: "menschen", hp: h[0] === "jaeger" ? 5 : 1e9, alive: true, ph: Math.random() * 6, treffer: 0 })),
        ali: A.map(a => ({ typ: a[0], bx: a[1], by: a[2], b: a[3], seite: a[4], hp: a[5], max: a[5], alive: true, ph: Math.random() * 6, treffer: 0 })),
      };
    }
    u() { return Math.max(.45, Math.min(this.E.W / 1400, this.E.H / 820)); }
    posB(o, now) {
      const E = this.E, B = E.battle, u = this.u();
      const adv = o.seite === "menschen" ? Math.min(B.t, 14) * .004 : 0;
      return { x: (o.bx + adv) * E.W + Math.sin(now * .0006 + o.ph) * 8 * u, y: o.by * E.H + Math.cos(now * .0005 + o.ph) * 10 * u };
    }

    loop = (ts) => {
      this.raf = requestAnimationFrame(this.loop);
      const E = this.E, dt = Math.min(.05, (ts - (E.last || ts)) / 1000); E.last = ts;
      if (this.root && this.root.clientWidth > 1 && (!this.ctx || Math.abs(this.root.clientWidth - E.W) > 1 || Math.abs(this.root.clientHeight - E.H) > 1)) this.resize();
      if (!this.ctx || E.phase === "erde" || E.phase === "laden" || E.phase === "aus") return;
      if (RUHIG.matches) E.shake = 0;
      E.pt += dt;
      if (this.props.live) { this.liveTakt(ts); if (E.phase === "erde" || E.phase === "aus") return; }
      const ctx = this.ctx; ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
      if (E.phase === "schlacht") this.battle(ctx, dt, ts);
      else if (E.phase === "bereit") this.bereit(ctx, dt, ts);
      else if (E.phase === "reise") this.reise(ctx, dt, ts);
      else if (E.phase === "ankunft") this.ankunft(ctx, dt, ts);
      else if (E.phase === "landung") this.landung(ctx, dt, ts);
      else if (E.phase === "zerstoert") this.zerstoert(ctx, dt, ts);
      if (E.flash > 0) { ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0); ctx.fillStyle = "rgba(245,244,255," + (E.flash * .55) + ")"; ctx.fillRect(0, 0, E.W, E.H); E.flash = Math.max(0, E.flash - dt * 1.6); }
      if (ts - E.lastBc > 100 && this.bc) {
        E.lastBc = ts; const me = E.cannons.find(k => k.me);
        try { this.bc.postMessage({ id: this.id, phase: E.phase, name: this.state.name || t("reise.gast", "Gast"), ang: me ? me.ang : 0, fire: E.down || E.key, col: this.state.fireCol }); } catch (e) {}
        let gone = false; for (const id in E.remote) if (ts - E.remote[id].last > 2500) { delete E.remote[id]; gone = true; }
        if (gone) this.buildCannons();
      }
    };

    bg(ctx, now, sec, f) {
      const E = this.E, W = E.W, H = E.H, M = Math.max(W, H);
      ctx.fillStyle = "#161826"; ctx.fillRect(0, 0, W, H);
      const blob = (col, x, y, r, al) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(22,24,38,0)"); ctx.globalAlpha = al; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
      const d = now * .00003;
      const pairs = f < 1 && E.prevSec != null ? [[this.SEK[E.prevSec].neb, 1 - f], [this.SEK[sec].neb, f]] : [[this.SEK[sec].neb, 1]];
      pairs.forEach(([n, al]) => { blob(n[0], W * (.72 + Math.sin(d) * .08), H * .32, M * .55, al * .75); blob(n[1], W * (.22 + Math.cos(d * 1.3) * .06), H * .78, M * .5, al * .65); });
      ctx.globalAlpha = 1;
    }
    stars(ctx, dt, speed) {
      const E = this.E; ctx.fillStyle = "#e9e9ed";
      for (const s of E.stars) {
        s.x -= speed * s.z * dt / E.W; if (s.x < 0) { s.x += 1; s.y = Math.random(); }
        ctx.globalAlpha = .2 + .65 * s.z;
        ctx.fillRect(s.x * E.W, s.y * E.H, Math.max(1, speed * s.z * .035), s.z > .8 ? 1.6 : 1);
      }
      ctx.globalAlpha = 1;
    }
    ship(now) {
      const E = this.E, b = Math.max(260, Math.min(640, E.W * .44, E.H * .95));
      return { x: E.W * .3, y: E.H * .56 + Math.sin(now * .0006) * 6, b };
    }
    drawShip(ctx, g, now, alpha) {
      const S = window.fhSchiffe, E = this.E;
      for (let i = 0; i < 2; i++) {
        const a = now * .00035 + i * Math.PI;
        S.zeichnen(ctx, { typ: "jaeger", seite: "menschen", x: g.x + Math.cos(a) * g.b * .62, y: g.y + Math.sin(a) * g.b * .34, winkel: 0, breite: g.b * .12, dpr: E.dpr, zeit: now, phase: i, alpha });
      }
      this.drawArk(ctx, g.x, g.y, g.b, now, alpha, E.hitT || 0);
    }
    drawArk(ctx, x, y, b, now, A, hit) {
      const s = b / 100;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = A; ctx.lineJoin = "round";
      const fl = .85 + .15 * Math.sin(now * .03);
      for (const yy of [-6, 0, 6]) {
        const L = (yy ? 14 : 20) * fl, g = ctx.createLinearGradient(-47, 0, -47 - L, 0);
        g.addColorStop(0, "rgba(233,248,255,.95)"); g.addColorStop(.35, "rgba(143,227,255,.55)"); g.addColorStop(1, "rgba(143,227,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-46, yy - 2.4); ctx.quadraticCurveTo(-47 - L * .6, yy - 1.2, -47 - L, yy); ctx.quadraticCurveTo(-47 - L * .6, yy + 1.2, -46, yy + 2.4); ctx.fill();
      }
      const rings = [[-14, 20, 1], [9, 25, -1]];
      const ring = (cx, ry, front, rx) => { ctx.beginPath(); ctx.ellipse(cx, 0, rx, ry, 0, front ? -Math.PI / 2 : Math.PI / 2, front ? Math.PI / 2 : Math.PI * 1.5); };
      rings.forEach(([cx, ry]) => { ctx.strokeStyle = "#3f424d"; ctx.lineWidth = 3.4; ring(cx, ry, false, ry * .24); ctx.stroke(); ctx.strokeStyle = "rgba(145,132,217,.3)"; ctx.lineWidth = .5; ring(cx, ry, false, ry * .24 + 1.5); ctx.stroke(); });
      ctx.strokeStyle = "#595d6c"; ctx.lineWidth = .9;
      rings.forEach(([cx, ry]) => { ctx.beginPath(); ctx.moveTo(cx, -6); ctx.lineTo(cx, -ry); ctx.moveTo(cx, 6); ctx.lineTo(cx, ry); ctx.stroke(); });
      let g = ctx.createLinearGradient(0, -12, 0, 12); g.addColorStop(0, "#75798c"); g.addColorStop(.5, "#3f424d"); g.addColorStop(1, "#292b31");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-36, -11); ctx.lineTo(-44, -12); ctx.lineTo(-47, -8); ctx.lineTo(-47, 8); ctx.lineTo(-44, 12); ctx.lineTo(-36, 11); ctx.closePath(); ctx.fill();
      g = ctx.createLinearGradient(0, -8, 0, 8); g.addColorStop(0, "#9397ab"); g.addColorStop(.35, "#595d6c"); g.addColorStop(1, "#292b31");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(51, 0); ctx.quadraticCurveTo(46, -4.6, 36, -5.4); ctx.lineTo(-10, -6.2); ctx.lineTo(-24, -8.4); ctx.lineTo(-37, -7.6); ctx.lineTo(-37, 7.6); ctx.lineTo(-24, 8.4); ctx.lineTo(-10, 6.2); ctx.lineTo(36, 5.4); ctx.quadraticCurveTo(46, 4.6, 51, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(207,211,229,.35)"; ctx.lineWidth = .4; ctx.stroke();
      ctx.fillStyle = "#3f424d"; ctx.beginPath(); ctx.moveTo(-30, -8); ctx.lineTo(-26, -12.5); ctx.lineTo(-4, -12.5); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#292b31"; ctx.beginPath(); ctx.moveTo(18, 5.6); ctx.lineTo(22, 9.5); ctx.lineTo(34, 9); ctx.lineTo(37, 5.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(22,24,38,.55)"; ctx.lineWidth = .35;
      for (let px = -32; px < 40; px += 5) { ctx.beginPath(); ctx.moveTo(px, -5.6); ctx.lineTo(px, 5.6); ctx.stroke(); }
      g = ctx.createLinearGradient(-36, 0, 48, 0); g.addColorStop(0, "rgba(145,132,217,0)"); g.addColorStop(.2, "rgba(181,171,252,.9)"); g.addColorStop(.85, "rgba(181,171,252,.9)"); g.addColorStop(1, "rgba(145,132,217,0)");
      ctx.strokeStyle = g; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-36, -1.4); ctx.lineTo(46, -1.4); ctx.stroke();
      ctx.fillStyle = "rgba(231,229,254,.75)"; for (let px = -20, i = 0; px < 34; px += 2.2, i++) if (i % 3) ctx.fillRect(px, 1.6, .9, .7);
      ctx.fillStyle = "#151c26"; [-6, 0, 6].forEach(yy => { ctx.beginPath(); ctx.ellipse(-47, yy, 1, 2.6, 0, 0, 6.283); ctx.fill(); });
      rings.forEach(([cx, ry, dir]) => {
        const rx = ry * .24;
        ctx.strokeStyle = "#75798c"; ctx.lineWidth = 3.4; ring(cx, ry, true, rx); ctx.stroke();
        ctx.strokeStyle = "rgba(207,211,229,.5)"; ctx.lineWidth = .5; ring(cx, ry, true, rx + 1.5); ctx.stroke();
        for (let i = 0, n = 24; i < n; i++) {
          const th = (((i / n + now * .00004 * dir) % 1) + 1) % 1 * 6.283, c = Math.cos(th);
          if (c <= 0) continue;
          ctx.globalAlpha = A * c; ctx.fillStyle = i % 5 ? "#e7e5fe" : "#f0c96a";
          ctx.fillRect(cx + c * rx - .5, Math.sin(th) * ry - .5, 1, 1);
        }
        ctx.globalAlpha = A;
      });
      const pu = .6 + .4 * Math.sin(now * .004);
      g = ctx.createRadialGradient(47, 0, 0, 47, 0, 9); g.addColorStop(0, "rgba(245,244,255," + (.9 * pu) + ")"); g.addColorStop(.3, "rgba(181,171,252," + (.5 * pu) + ")"); g.addColorStop(1, "rgba(145,132,217,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(47, 0, 9, 0, 6.283); ctx.fill();
      if (Math.sin(now * .005) > .5) { ctx.fillStyle = "#ff5a5a"; ctx.beginPath(); ctx.arc(-24, -8.6, .9, 0, 6.283); ctx.fill(); ctx.fillStyle = "#7dff9a"; ctx.beginPath(); ctx.arc(-24, 8.6, .9, 0, 6.283); ctx.fill(); }
      if (hit > 0) { ctx.globalAlpha = A * hit; ctx.strokeStyle = "#b5abfc"; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(0, 0, 54, 27, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = A * hit * .12; ctx.fillStyle = "#9184d9"; ctx.fill(); }
      ctx.restore();
    }

    battle(ctx, dt, now) {
      const E = this.E, B = E.battle, FX = window.fhSchlachtFx, S = window.fhSchiffe, u = this.u();
      B.t += dt;
      const hum = B.hum.filter(h => h.alive), ali = B.ali.filter(a => a.alive);
      const boss = B.ali[0], small = ali.filter(a => a !== boss);
      B.fa += dt;
      while (B.fa > .1) {
        B.fa -= .1; const h = hum[Math.floor(Math.random() * hum.length)];
        const z = small.length ? small[Math.floor(Math.random() * Math.min(4, small.length))] : (boss.alive && !B.down ? boss : null);
        if (h && z) FX.schuss(h, z, { typ: h.typ, seite: "menschen", stark: Math.random() < .15, beimTreffer: (o) => this.hitB(o) });
      }
      B.ea += dt;
      while (B.ea > .32) {
        B.ea -= .32; const a = small[Math.floor(Math.random() * small.length)];
        if (a && hum.length) { const pool = Math.random() < .3 ? hum.filter(h => h.typ === "jaeger") : hum.filter(h => h.typ !== "jaeger"); const z = pool[Math.floor(Math.random() * pool.length)]; if (z) FX.schuss(a, z, { typ: a.typ, seite: a.seite, beimTreffer: (o) => this.hitH(o) }); }
      }
      B.ba += dt;
      if (boss.alive && !B.down && B.ba > 2.4) { B.ba = 0; const z = hum[Math.floor(Math.random() * hum.length)]; if (z) FX.schuss(boss, z, { typ: "mutterschiff", seite: "boss", stark: true, beimTreffer: (o) => this.hitH(o) }); }
      if (B.t > 40 && !B.down) boss.hp = 0, B.down = B.t;
      if (B.down) {
        const p = this.posB(boss, now), k = B.t - B.down;
        if (k < 2.4) { B.chain += dt; while (B.chain > .12) { B.chain -= .12; FX.explosion(p.x + (Math.random() - .5) * boss.b * u * .8, p.y + (Math.random() - .5) * boss.b * u * .4, "boss", 20 + Math.random() * 30); } }
        else if (!B.big) { B.big = true; boss.alive = false; E.flash = 1; for (let i = 0; i < 4; i++) FX.explosion(p.x + (i - 1.5) * 40 * u, p.y, "boss", 90 * u); }
        if (k > 3 && !this.state.sieg) this.setState({ sieg: true });
        if (k > 8.5) { this.enter("bereit"); return; }
      }
      if (now - B.lastBoss > 150) { B.lastBoss = now; const pct = Math.max(0, Math.round(boss.hp / boss.max * 100)); if (pct !== this.state.boss) this.setState({ boss: pct }); }

      this.bg(ctx, now, 3, 1); this.stars(ctx, dt, 16);
      FX.hintergrund(ctx, E.W, E.H, now, E.dpr, false);
      const draw = (o, w) => { const p = this.posB(o, now); if (o.typ === "arche") this.drawArk(ctx, p.x, p.y, o.b * u, now, 1, o.treffer); else S.zeichnen(ctx, { typ: o.typ, seite: o.seite, stufen: { leben: 3, schaden: 3, spezial: 0 }, x: p.x, y: p.y, winkel: w, breite: o.b * u, dpr: E.dpr, zeit: now, phase: o.ph, treffer: o.treffer }); o.treffer = Math.max(0, o.treffer - dt * 4); };
      B.ali.forEach(a => a.alive && draw(a, Math.PI));
      B.hum.forEach(h => h.alive && draw(h, 0));
      FX.zeichnen(ctx, (o, n) => this.posB(o, n), now);
    }
    hitB(o) {
      const B = this.E.battle; if (!o.alive) return;
      o.treffer = 1; o.hp--;
      if (o.hp <= 0) {
        if (o.typ === "mutterschiff") { if (!B.down) B.down = B.t; }
        else { o.alive = false; const p = this.posB(o, performance.now()); fhSchlachtFx.explosion(p.x, p.y, o.seite, o.b * this.u() * .45); }
      }
    }
    hitH(o) {
      if (!o.alive) return; o.treffer = 1; o.hp--;
      if (o.hp <= 0) { o.alive = false; const p = this.posB(o, performance.now()); fhSchlachtFx.explosion(p.x, p.y, "menschen", o.b * this.u() * .5); }
    }

    bereit(ctx, dt, now) {
      const E = this.E, g = this.ship(now);
      this.bg(ctx, now, 0, 1); this.stars(ctx, dt, 40);
      this.drawShip(ctx, g, now, 1);
      E.cannons.forEach(k => { k.x = g.x + k.fx * g.b; k.y = g.y + k.fy * g.b; k.ang += (-.25 + Math.sin(now * .001 + k.fx * 9) * .35 - k.ang) * .05; this.drawCannon(ctx, k, now); });
    }

    spawn(S, g) {
      const E = this.E; let r = Math.random(), kind = "stein";
      for (const k in S.mix) { r -= S.mix[k]; if (r <= 0) { kind = k; break; } }
      const N = E.lanes || 1, lane = Math.floor(Math.random() * N);
      const x = E.W + 60, y = E.H * (.06 + (lane + .1 + Math.random() * .8) / N * .88);
      const tx = g.x + (Math.random() - .5) * g.b * .9, ty = g.y + ((lane + .5) / N - .5) * g.b * .3;
      const F = this.FEIND[kind], kk = .45 + E.W / 1400 * .55;
      const sp = (F ? F.sp * (.85 + Math.random() * .3) : kind === "stein" ? 90 + Math.random() * 70 : 130 + Math.random() * 80) * kk;
      const d = Math.hypot(tx - x, ty - y) || 1;
      const o = { kind: F ? "feind" : kind, typ: kind, x, y, vx: (tx - x) / d * sp, vy: (ty - y) / d * sp, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.6, ph: Math.random() * 6.28, hit: 0, sp, age: 0, lane, hy: y, cd: 1 + Math.random() * 2 };
      if (F) { o.partei = F.p; o.r = F.r; o.hp = F.hp; }
      else if (kind === "stein") { o.r = 14 + Math.random() * 30; o.hp = Math.ceil(o.r / 12); o.pts = this.rock(o.r); }
      else { o.r = 12 + Math.random() * 8; o.hp = 1; }
      E.objs.push(o);
    }
    rock(r) { const n = 9, p = []; for (let i = 0; i < n; i++) { const a = i / n * 6.283, k = r * (.72 + Math.random() * .36); p.push([Math.cos(a) * k, Math.sin(a) * k]); } return p; }
    kill(o, own) {
      const E = this.E; o.dead = true;
      fhSchlachtFx.explosion(o.x, o.y, o.kind === "feind" ? o.partei : "menschen", o.r * .9);
      if (own) { own.hits++; E.crewHits++; }
      if (o.kind === "stein" && o.r > 28) {
        for (const s of [-1, 1]) { const n = { kind: "stein", x: o.x, y: o.y, r: o.r * .55, vx: o.vx * .9 - o.vy * .5 * s, vy: o.vy * .9 + o.vx * .5 * s, rot: 0, vr: (Math.random() - .5) * 3, hit: 0, ph: 0 }; n.hp = 1; n.lane = o.lane; n.pts = this.rock(n.r); E.objs.push(n); }
      }
    }
    pickTarget(k) {
      const E = this.E; let best = null, bd = 1e9;
      let own = E.objs.some(o => !o.dead && o.lane === k.lane && o.x > k.x - 30 && o.x < E.W + 10);
      for (const o of E.objs) { if (o.dead || o.x < k.x - 30 || o.x > E.W + 10) continue; if (own ? o.lane !== k.lane : !E.laneBot[o.lane]) continue; const d = Math.hypot(o.x - k.x, o.y - k.y) * (.7 + Math.random() * .6); if (d < bd) { bd = d; best = o; } }
      return best;
    }

    reise(ctx, dt, now) {
      const E = this.E, c = this.cfg(), g = this.ship(now);
      if (this.props.live) E.elapsed = Math.min(c.dur, Math.max(0, this.liveSek() - REISE_AB)); else E.elapsed += dt;
      const prog = Math.min(1, E.elapsed / c.dur);
      const si = Math.min(4, Math.floor(prog * 5));
      if (si !== E.sector) { E.prevSec = E.sector < 0 ? si : E.sector; E.sector = si; E.secT = 0; this.showBanner(si); }
      E.secT += dt;
      const S = this.SEK[si];
      if (prog < .975) { E.spawnAcc += dt * S.rate * (.8 + .5 * (prog * 5 - si)) * 1.3 * (E.lanes || c.crew) / 9; while (E.spawnAcc > 1) { E.spawnAcc--; this.spawn(S, g); } }
      this.simulate(dt, now, g, true);
      if (this.props.live ? (this.stand && this.stand.ergebnis === "verloren") : E.hull <= 0) { this.hud(prog, si); this.enter("zerstoert"); return; }
      if (now - E.lastHud > 200) { E.lastHud = now; this.hud(prog, si); }
      if (now - E.lastSave > 2000) { E.lastSave = now; this.save("reise"); }
      this.scene(ctx, dt, now, g, si, 380 + prog * 260, 1);
      if (E.elapsed >= c.dur) {
        if (!this.props.live) this.enter("ankunft");
        else if (this.stand && this.stand.ergebnis) this.enter(this.stand.ergebnis === "gelandet" ? "ankunft" : "zerstoert");
      }
    }
    simulate(dt, now, g, shoot) {
      const E = this.E;
      E.hitT = Math.max(0, (E.hitT || 0) - dt * 3);
      for (const k of E.cannons) {
        k.x = g.x + k.fx * g.b; k.y = g.y + k.fy * g.b; k.cd -= dt; k.flash = Math.max(0, k.flash - dt * 8);
        if (k.rec) { k.rec[0] = Math.max(0, k.rec[0] - dt * 9); k.rec[1] = Math.max(0, k.rec[1] - dt * 9); } k.heat = Math.max(0, (k.heat || 0) - dt * .5);
        let fire = false;
        if (k.me) { k.ang = Math.atan2(E.my - k.y, E.mx - k.x); fire = E.down || E.key; if (fire && shoot) this.bemannt = true; }
        else if (k.remote) { const R = E.remote[k.remote]; if (R) { k.ang = R.ang; fire = R.fire; k.col = R.col; } }
        else {
          if (!k.tgt || k.tgt.dead || Math.random() < dt * .7) k.tgt = this.pickTarget(k);
          let want = k.ang;
          if (k.tgt) { const o = k.tgt, tt = Math.hypot(o.x - k.x, o.y - k.y) / this.BOLT; want = Math.atan2(o.y + o.vy * tt - k.y, o.x + o.vx * tt - k.x) + k.jit; }
          let da = want - k.ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
          k.ang += Math.max(-5 * dt, Math.min(5 * dt, da));
          fire = !!k.tgt && Math.abs(da) < .12;
        }
        if (shoot && fire && k.cd <= 0) {
          k.cd = k.me || k.remote ? .13 : .22 + Math.random() * .25;
          if (!k.me && !k.remote) k.jit = (Math.random() - .5) * .12 * k.skill;
          const ca = Math.cos(k.ang), sa = Math.sin(k.ang), sc = k.me ? 1.35 : 1;
          k.side = k.side ? 0 : 1; const off = (k.side ? 2.6 : -2.6) * sc;
          E.bolts.push({ x: k.x + ca * 21 * sc - sa * off, y: k.y + sa * 21 * sc + ca * off, vx: ca * this.BOLT, vy: sa * this.BOLT, life: 1.4, own: k });
          k.rec = k.rec || [0, 0]; k.rec[k.side] = 1; k.heat = Math.min(1.5, (k.heat || 0) + .08); k.flash = 1;
        }
      }
      for (const b of E.bolts) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        for (const o of E.objs) {
          if (o.dead) continue;
          const dx = o.x - b.x, dy = o.y - b.y;
          if (dx * dx + dy * dy < (o.r + 4) * (o.r + 4)) { b.life = 0; o.hp--; o.hit = 1; if (o.hp <= 0) this.kill(o, b.own); break; }
        }
      }
      E.bolts = E.bolts.filter(b => b.life > 0 && b.x > -20 && b.x < E.W + 20 && b.y > -20 && b.y < E.H + 20);
      for (const o of E.objs) {
        if (o.dead) continue;
        if (o.kind === "feind") {
          o.age += dt; const F = this.FEIND[o.typ];
          const hover = F.fire && o.age < 9, hx = hover ? g.x + g.b * (.78 + .22 * Math.sin(o.ph)) : g.x, hy = hover ? o.hy + Math.sin(now * .0012 + o.ph) * 40 : g.y;
          const a = Math.atan2(hy - o.y, hx - o.x) + (hover ? 0 : Math.sin(now * .002 + o.ph) * .5);
          const want = hover && Math.hypot(hx - o.x, hy - o.y) < 70 ? o.sp * .2 : o.sp;
          o.vx += (Math.cos(a) * want - o.vx) * dt * .9; o.vy += (Math.sin(a) * want - o.vy) * dt * .9;
          if (F.fire && shoot && o.x < E.W - 20) {
            o.cd -= dt;
            if (o.cd <= 0) {
              o.cd = F.fire * (.8 + Math.random() * .5);
              const tg = { x: g.x + (Math.random() - .5) * g.b * .7, y: g.y + (Math.random() - .5) * g.b * .1 };
              window.fhSchlachtFx.schuss(o, tg, { typ: o.typ, seite: o.partei, beimTreffer: () => { const E2 = this.E; if (E2.phase !== "reise") return; this.schaden(o, 1); E2.hitT = Math.max(E2.hitT || 0, .6); E2.shake = Math.max(E2.shake, 4); } });
            }
          }
        }
        o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt; o.hit = Math.max(0, o.hit - dt * 6);
        const ex = (o.x - g.x) / (g.b * .48), ey = (o.y - g.y) / (g.b * .15);
        if (ex * ex + ey * ey < 1) {
          o.dead = true; this.schaden(o, o.kind === "stein" ? o.r * .16 : o.kind === "truemmer" ? 1.5 : o.r * .13);
          E.shake = 9; E.hitT = 1; fhSchlachtFx.explosion(o.x, o.y, "boss", o.r * 1.1);
        }
        if (o.x < -100 || o.y < -140 || o.y > E.H + 140) o.dead = true;
      }
      E.objs = E.objs.filter(o => !o.dead);
    }
    scene(ctx, dt, now, g, si, speed, shipAlpha) {
      const E = this.E, S = window.fhSchiffe;
      this.bg(ctx, now, si, Math.min(1, E.secT / 4));
      this.stars(ctx, dt, speed);
      ctx.save();
      if (E.shake > .2) { ctx.translate((Math.random() - .5) * E.shake, (Math.random() - .5) * E.shake); E.shake *= .88; }
      const meK = E.cannons.find(k => k.me), fc0 = this.state.fireCol;
      if (E.phase === "reise" && meK && E.lanes) {
        const y0 = E.H * (.06 + meK.lane / E.lanes * .88), lh = E.H * .88 / E.lanes;
        const lg = ctx.createLinearGradient(E.W - 160, 0, E.W, 0); lg.addColorStop(0, this.rgba(fc0, 0)); lg.addColorStop(1, this.rgba(fc0, .14));
        ctx.fillStyle = lg; ctx.fillRect(E.W - 160, y0, 160, lh);
        ctx.fillStyle = fc0; ctx.fillRect(E.W - 3, y0 + 2, 3, lh - 4);
        ctx.font = "600 10px Inter, system-ui, sans-serif"; ctx.textAlign = "right"; ctx.globalAlpha = .9; ctx.fillText(t("reise.deinSektor", "DEIN SEKTOR"), E.W - 12, y0 + lh / 2 + 3); ctx.globalAlpha = 1;
      }
      for (const o of E.objs) {
        this.drawObj(ctx, o, now);
        if (E.phase === "reise" && meK && o.lane === meK.lane && o.x < E.W + 20) {
          const q = o.r + 7, m = 6; ctx.strokeStyle = fc0; ctx.lineWidth = 1.4; ctx.globalAlpha = .85;
          ctx.beginPath();
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { ctx.moveTo(o.x + sx * q, o.y + sy * (q - m)); ctx.lineTo(o.x + sx * q, o.y + sy * q); ctx.lineTo(o.x + sx * (q - m), o.y + sy * q); });
          ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      if (shipAlpha > 0) { this.drawShip(ctx, g, now, shipAlpha); ctx.globalAlpha = shipAlpha; E.cannons.forEach(k => this.drawCannon(ctx, k, now)); ctx.globalAlpha = 1; }
      for (const b of E.bolts) {
        const me = b.own && b.own.me, col = me ? this.state.fireCol : b.own && b.own.remote ? (b.own.col || "#7dffd2") : "#8fe3ff", core = me ? "#f5f4ff" : "#e9f8ff";
        ctx.lineCap = "round";
        ctx.globalAlpha = .4; ctx.strokeStyle = col; ctx.lineWidth = me ? 6 : 4.5;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * .022, b.y - b.vy * .022); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = core; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * .016, b.y - b.vy * .016); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      window.fhSchlachtFx.zeichnen(ctx, (o) => (o && o.x != null ? { x: o.x, y: o.y } : null), now);
      ctx.restore();
      if (E.phase === "reise" && E.mx > -500) {
        const me = E.cannons.find(k => k.me);
        const fc = this.state.fireCol; if (me) { ctx.globalAlpha = .18; ctx.strokeStyle = fc; ctx.setLineDash([3, 7]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(E.mx, E.my); ctx.stroke(); ctx.setLineDash([]); }
        ctx.globalAlpha = 1; ctx.strokeStyle = fc; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(E.mx, E.my, 11, 0, 6.283); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * 1.5708; ctx.beginPath(); ctx.moveTo(E.mx + Math.cos(a) * 15, E.my + Math.sin(a) * 15); ctx.lineTo(E.mx + Math.cos(a) * 21, E.my + Math.sin(a) * 21); ctx.stroke(); }
        ctx.fillStyle = "#f5f4ff"; ctx.fillRect(E.mx - 1, E.my - 1, 2, 2);
      }
      if (E.hitT > 0) { const v = ctx.createRadialGradient(E.W / 2, E.H / 2, Math.min(E.W, E.H) * .35, E.W / 2, E.H / 2, Math.max(E.W, E.H) * .75); v.addColorStop(0, "rgba(255,59,107,0)"); v.addColorStop(1, "rgba(255,59,107," + (E.hitT * .22) + ")"); ctx.fillStyle = v; ctx.fillRect(0, 0, E.W, E.H); }
    }
    drawObj(ctx, o, now) {
      const S = window.fhSchiffe, E = this.E;
      if (o.kind === "feind") { S.zeichnen(ctx, { typ: o.typ, seite: o.partei, x: o.x, y: o.y, winkel: Math.atan2(E.H * .56 - o.y, E.W * .3 - o.x), breite: o.r * 2.6, dpr: E.dpr, zeit: now, phase: o.ph, treffer: o.hit }); return; }
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
      if (o.kind === "stein") {
        const g = ctx.createRadialGradient(-o.r * .35, -o.r * .35, 1, 0, 0, o.r * 1.1); g.addColorStop(0, "#8a8e9c"); g.addColorStop(1, "#2c2e3a");
        ctx.fillStyle = g; ctx.beginPath(); o.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(207,211,229,.28)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "rgba(22,24,38,.45)"; ctx.beginPath(); ctx.arc(o.r * .2, o.r * .15, o.r * .18, 0, 6.283); ctx.arc(-o.r * .3, o.r * .3, o.r * .1, 0, 6.283); ctx.fill();
        if (o.hit > 0) { ctx.globalAlpha = o.hit * .6; ctx.fillStyle = "#d2cefd"; ctx.beginPath(); o.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
      } else {
        ctx.fillStyle = "#51627a"; ctx.strokeStyle = "#8a9bb0"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-o.r, -o.r * .3); ctx.lineTo(o.r * .7, -o.r * .45); ctx.lineTo(o.r, o.r * .2); ctx.lineTo(-o.r * .5, o.r * .4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ff9d3d"; ctx.globalAlpha = .6 + .4 * Math.sin(now * .01 + o.ph); ctx.beginPath(); ctx.arc(o.r * .5, 0, 2, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }
    drawCannon(ctx, k, now) {
      const col = k.me ? this.state.fireCol : k.remote ? (k.col || "#7dffd2") : "#8fe3ff", A = ctx.globalAlpha, sc = k.me ? 1.35 : 1, up = k.fy < 0 ? -1 : 1;
      ctx.save(); ctx.translate(k.x, k.y); ctx.scale(sc, sc);
      ctx.fillStyle = "#3f424d"; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(6.5, -up * 7); ctx.lineTo(-6.5, -up * 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#292b31"; ctx.strokeStyle = "#75798c"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.globalAlpha = A * (k.me ? .95 : .5);
      const spin = k.me ? now * .002 : k.fx * 5;
      for (let i = 0; i < 3; i++) { const a0 = spin + i * 2.094; ctx.beginPath(); ctx.arc(0, 0, 10.5, a0, a0 + 1.35); ctx.stroke(); }
      ctx.globalAlpha = A;
      ctx.rotate(k.ang);
      const rec = k.rec || [0, 0];
      [[0, -2.6], [1, 2.6]].forEach(([j, yy]) => {
        const L = 18 - rec[j] * 5;
        ctx.fillStyle = "#b2b6ca"; ctx.fillRect(2, yy - 1.1, L, 2.2);
        ctx.fillStyle = "#595d6c"; ctx.fillRect(2 + L * .45, yy - 1.5, 3, 3);
        ctx.fillStyle = col; ctx.fillRect(2 + L - 1.6, yy - 1.3, 1.6, 2.6);
        if (rec[j] > 0) { ctx.globalAlpha = A * rec[j]; const gg = ctx.createRadialGradient(4 + L, yy, 0, 4 + L, yy, 9); gg.addColorStop(0, "#f5f4ff"); gg.addColorStop(.35, col); gg.addColorStop(1, "rgba(22,24,38,0)"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(4 + L, yy, 9, 0, 6.283); ctx.fill(); ctx.globalAlpha = A; }
      });
      if (k.heat > .05) { ctx.globalAlpha = A * Math.min(.7, k.heat * .7); ctx.fillStyle = "#ff9d3d"; ctx.fillRect(9, -3.7, 9, 2.2); ctx.fillRect(9, 1.5, 9, 2.2); ctx.globalAlpha = A; }
      const hg = ctx.createLinearGradient(0, -6, 0, 6); hg.addColorStop(0, "#9397ab"); hg.addColorStop(.5, "#595d6c"); hg.addColorStop(1, "#292b31");
      ctx.fillStyle = hg; ctx.strokeStyle = "rgba(207,211,229,.5)"; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(-6, -5.5); ctx.lineTo(3, -5.5); ctx.lineTo(7, -2.5); ctx.lineTo(7, 2.5); ctx.lineTo(3, 5.5); ctx.lineTo(-6, 5.5); ctx.lineTo(-8, 2.5); ctx.lineTo(-8, -2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(-6, -.6, 9, 1.2);
      ctx.globalAlpha = A * (.6 + .4 * Math.sin(now * .008 + k.fx * 20)); ctx.beginPath(); ctx.arc(-3.5, -3.2, 1.1, 0, 6.283); ctx.fill(); ctx.globalAlpha = A;
      ctx.restore();
      const label = k.me ? t("reise.duGross", "DU") + " · " + k.name : k.name;
      ctx.font = (k.me ? "600 " : "500 ") + "10px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width + 12, ly = k.y + up * (k.me ? 27 : 21);
      ctx.fillStyle = "rgba(22,24,38,.72)"; ctx.strokeStyle = k.me ? col : "rgba(147,151,171,.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(k.x - tw / 2, ly - 8, tw, 16, 8); else ctx.rect(k.x - tw / 2, ly - 8, tw, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = k.me ? "#e7e5fe" : "rgba(233,233,237,.85)"; ctx.fillText(label, k.x, ly + .5); ctx.textBaseline = "alphabetic";
    }
    rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
    hud(prog, si) {
      const E = this.E, c = this.cfg(), left = Math.max(0, c.dur - E.elapsed), me = E.cannons.find(k => k.me) || { hits: 0, name: t("reise.du", "Du") };
      const hull = Math.max(0, Math.round(E.hull)), lit = Math.ceil(hull / 5), crit = hull <= 30, pulse = crit && Math.floor(performance.now() / 400) % 2 === 0;
      const segCol = hull > 55 ? "#b5abfc" : hull > 30 ? "#f0c96a" : "#ff6b78";
      const segs = Array.from({ length: 20 }, (_, i) => i < lit ? { bg: (i === lit - 1 && pulse) ? "#f5f4ff" : segCol, glow: "0 0 6px " + segCol } : { bg: "", glow: "none" });
      const mk = E.cannons.find(k => k.me);
      const threat = mk ? E.objs.filter(o => o.lane === mk.lane && o.x < E.W).length : 0;
      this.setState({ hud: Object.assign({
        threat,
        segs, hullState: hull <= 0 ? t("reise.huelle.weg", "Zerstört") : crit ? t("reise.huelle.kritisch", "Kritisch · keine Reparatur") : hull > 55 ? t("reise.huelle.stabil", "Stabil · keine Reparatur") : t("reise.huelle.beschaedigt", "Beschädigt · keine Reparatur"),
        hullStateCol: crit ? "#ff8a94" : "",
        hullShadow: (E.hitT || 0) > .2 ? "0 0 0 1px #ff6b78, 0 0 18px rgba(255,107,120,.45)" : crit ? "0 0 0 1px rgba(255,107,120,.55)" : "",
        nr: si + 1, sector: sekText(si, "name"), feinde: sekText(si, "feinde"), pct: (prog * 100).toFixed(1), left: Math.floor(left / 60) + ":" + String(Math.floor(left % 60)).padStart(2, "0"),
        lj: zahl(Math.round((1 - prog) * 1240)), hull, hullCol: segCol,
        crew: E.cannons.length, crewHits: E.crewHits, myHits: me.hits, myName: me.name, leaders: this.leaders(5),
      }, this.props.live && this.stand ? {
        /* Live: Crew und Treffer aller echten Kanonen aus der Datenbank */
        crew: Number(this.stand.kanonen) || 0, crewHits: Number(this.stand.treffer_gesamt) || 0,
        leaders: (this.stand.crew || []).slice(0, 5).map((c, i) => ({ rank: i + 1, name: String(c.name || "").slice(0, 18) + (c.ich ? " " + t("reise.duKlammer", "(du)") : ""), hits: Number(c.treffer) || 0, live: false, ich: !!c.ich })),
      } : {}) });
    }
    showBanner(si) {
      clearTimeout(this.bt);
      this.setState({ banner: { nr: si + 1, name: sekText(si, "name"), text: sekText(si, "text") } });
      this.bt = setTimeout(() => this.setState({ banner: null }), 3800);
    }
    ankunft(ctx, dt, now) {
      const E = this.E, t = E.pt, W = E.W, H = E.H;
      const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      if (t > .6 && t < 5 && !this.state.landing) this.setState({ landing: true });
      if (t >= 5 && this.state.landing) this.setState({ landing: false });
      if (t > 3.4 && t < 5 && !this.state.landingEye) this.setState({ landingEye: true });
      const g0 = this.ship(now);
      this.simulate(dt, now, g0, t < 3);
      const grow = ease(t / 5), px = W * .74, py = H * .46, R = H * .05 + H * .36 * grow;
      const open = ease((t - 2.4) / 1.6), dil = ease((t - 6) / 2.5), ex = px - R * .06, ey = py + R * .04;
      const s = ease((t - 5) / 2.5), z = t < 5 ? 1 : Math.exp((t - 5) * .9);
      const g = { x: g0.x + (ex - g0.x) * s * .9, y: g0.y + (ey - g0.y) * s * .9, b: g0.b * (1 - .85 * s) };
      this.bg(ctx, now, 4, 1);
      this.stars(ctx, dt, Math.max(30, 600 * (1 - grow)) + (t > 5 ? (t - 5) * 900 : 0));
      ctx.save();
      ctx.translate(ex + (W / 2 - ex) * s, ey + (H / 2 - ey) * s); ctx.scale(z, z); ctx.translate(-ex, -ey);
      this.planet(ctx, px, py, R, now, open, dil);
      ctx.restore();
      for (const o of E.objs) this.drawObj(ctx, o, now);
      const sa = Math.max(0, 1 - Math.max(0, t - 6) / 1.5);
      if (sa > 0) { this.drawShip(ctx, g, now, sa); if (s < .2) { ctx.globalAlpha = 1 - s * 5; E.cannons.forEach(k => this.drawCannon(ctx, k, now)); ctx.globalAlpha = 1; } }
      window.fhSchlachtFx.zeichnen(ctx, (o) => (o && o.x != null ? { x: o.x, y: o.y } : null), now);
      if (t > 8.6 && this.fadeEl) { this.fadeEl.style.transition = "none"; this.fadeEl.style.opacity = Math.min(1, (t - 8.6) / 1.6); }
      if (t >= 10.4) this.enter("landung");
    }
    makeLand() {
      const r = this.seed(5), L = { ridges: [], towers: [] };
      [[.6, .12, "#241f2e"], [.66, .08, "#33282c"], [.71, .05, "#463424"]].forEach(([base, amp, col]) => { const pts = []; for (let i = 0; i <= 48; i++) pts.push([i / 48, base - r() * amp * .6 - Math.abs(Math.sin(i * .37 + r() * 2)) * amp]); L.ridges.push({ pts, col }); });
      for (let i = 0; i < 16; i++) L.towers.push({ x: .62 + r() * .34, w: .008 + r() * .02, h: .04 + r() * .17, dome: r() < .3, ph: r() * 6 });
      return L;
    }
    landung(ctx, dt, now) {
      const E = this.E, t = E.pt, W = E.W, H = E.H, L = this.land, FX = window.fhSchlachtFx;
      const ease = (x) => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };
      if (t < 1.4 && this.fadeEl) { this.fadeEl.style.transition = "none"; this.fadeEl.style.opacity = Math.max(0, 1 - t / 1.4); }
      ctx.save();
      if (E.shake > .2) { ctx.translate((Math.random() - .5) * E.shake, (Math.random() - .5) * E.shake); E.shake *= .9; }
      let g = ctx.createLinearGradient(0, 0, 0, H * .75); g.addColorStop(0, "#0b1424"); g.addColorStop(.6, "#173a4e"); g.addColorStop(1, "#2e6f78");
      ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = "#e9e9ed";
      for (const st of E.stars) { if (st.y > .45) continue; ctx.globalAlpha = (.45 - st.y) * st.z; ctx.fillRect(st.x * W, st.y * H, 1, 1); }
      ctx.globalAlpha = 1;
      g = ctx.createRadialGradient(W * .16, H * .66, 0, W * .16, H * .66, W * .5); g.addColorStop(0, "rgba(255,43,61,.34)"); g.addColorStop(1, "rgba(255,43,61,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,110,120,.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(W * .16, H * .68, W * .5, H * .06, 0, Math.PI, 6.283); ctx.stroke();
      for (const rd of L.ridges) { ctx.fillStyle = rd.col; ctx.beginPath(); ctx.moveTo(0, H); rd.pts.forEach(p => ctx.lineTo(p[0] * W, p[1] * H)); ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); }
      g = ctx.createLinearGradient(0, H * .7, 0, H); g.addColorStop(0, "#3a2c1e"); g.addColorStop(1, "#161826");
      ctx.fillStyle = g; ctx.fillRect(0, H * .72, W, H * .3);
      const gy = H * .74;
      for (const tw of L.towers) {
        const x = tw.x * W, w = Math.max(6, tw.w * W), h = tw.h * H;
        ctx.fillStyle = "#292b31";
        if (tw.dome) { ctx.beginPath(); ctx.ellipse(x, gy, w * 1.6, h * .45, 0, Math.PI, 6.283); ctx.fill(); }
        else { ctx.fillRect(x - w / 2, gy - h, w, h); ctx.fillStyle = "#e7e5fe"; for (let yy = gy - h + 6; yy < gy - 4; yy += 7) { if (Math.sin(yy * 3.1 + tw.ph) > .1) { ctx.globalAlpha = .55; ctx.fillRect(x - w / 2 + 2, yy, Math.max(1, w - 4), 1.5); } } ctx.globalAlpha = 1; }
        if (Math.sin(now * .004 + tw.ph) > .4) { ctx.fillStyle = "#ff5a5a"; ctx.beginPath(); ctx.arc(x, gy - h - 2, 1.6, 0, 6.283); ctx.fill(); }
      }
      const px = W * .42, py = H * .82;
      ctx.fillStyle = "#3f424d"; ctx.strokeStyle = "#75798c"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(px, py, W * .17, H * .028, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, on = (Math.floor(now / 90) % 16) === i; ctx.fillStyle = on ? "#f5f4ff" : "#9184d9"; ctx.globalAlpha = on ? 1 : .5; ctx.beginPath(); ctx.arc(px + Math.cos(a) * W * .16, py + Math.sin(a) * H * .025, on ? 2.4 : 1.6, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
      const k = ease(t / 7), b1 = Math.min(W * .42, 460), b = b1 * (.35 + .65 * k);
      const sx = W * .1 + (px - W * .1) * k, sy = -H * .12 + (py - b1 * .13 + H * .12) * k;
      ctx.globalAlpha = .55 * k; ctx.fillStyle = "#0c0d15"; ctx.beginPath(); ctx.ellipse(sx, py, b * .45, H * .02, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      if (t < 7.3) {
        const fl = .8 + .2 * Math.sin(now * .04), len = b * (.22 - .1 * k) * fl;
        for (const ox of [-.26, 0, .24]) {
          const fx = sx + ox * b, fy = sy + b * .07;
          g = ctx.createLinearGradient(fx, fy, fx, fy + len); g.addColorStop(0, "rgba(233,248,255,.95)"); g.addColorStop(.35, "rgba(143,227,255,.6)"); g.addColorStop(1, "rgba(143,227,255,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - b * .022, fy); ctx.quadraticCurveTo(fx, fy + len * 1.1, fx + b * .022, fy); ctx.fill();
        }
      }
      this.drawArk(ctx, sx, sy, b, now, 1, 0);
      if (t >= 7 && !E.touched) {
        E.touched = true; E.shake = 10; this.setState({ landed: true });
        for (let i = 0; i < 70; i++) { const d = Math.random() < .5 ? -1 : 1; E.dust.push({ x: px + (Math.random() - .5) * b * .6, y: py, vx: d * (40 + Math.random() * 220), vy: -(8 + Math.random() * 50), r: 3 + Math.random() * 8, life: 1 }); }
      }
      for (const d of E.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= .98; d.vy += 20 * dt; d.r += 14 * dt; d.life -= dt * .5; }
      E.dust = E.dust.filter(d => d.life > 0);
      for (const d of E.dust) { ctx.globalAlpha = d.life * .45; ctx.fillStyle = "#b8925a"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
      FX.zeichnen(ctx, () => null, now);
      ctx.restore();
      if (t > 9.4 && this.fadeEl) { this.fadeEl.style.transition = "none"; this.fadeEl.style.opacity = Math.min(1, (t - 9.4) / 1.3); }
      if (t >= 10.8) this.enter("erde");
    }
    zerstoert(ctx, dt, now) {
      const E = this.E, t = E.pt, g = this.ship(now), FX = window.fhSchlachtFx;
      this.simulate(dt, now, g, false);
      E.chain += dt;
      while (E.chain > .09 && t < 2.6) { E.chain -= .09; FX.explosion(g.x + (Math.random() - .5) * g.b * .9, g.y + (Math.random() - .5) * g.b * .25, Math.random() < .5 ? "menschen" : "boss", 14 + Math.random() * 26); E.shake = 7; E.hitT = 1; }
      if (t >= 2.6 && !E.boom) {
        E.boom = true; E.flash = 1; E.shake = 18;
        for (let i = 0; i < 6; i++) FX.explosion(g.x + (i - 2.5) * g.b * .15, g.y, "menschen", g.b * .25);
        for (let i = 0; i < 46; i++) { const a = Math.random() * 6.283, v = 60 + Math.random() * 320; E.debris.push({ x: g.x + (Math.random() - .5) * g.b * .8, y: g.y + (Math.random() - .5) * g.b * .15, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - .5) * 8, s: 3 + Math.random() * 10, life: 1 }); }
      }
      this.scene(ctx, dt, now, g, Math.max(0, E.sector), Math.max(20, 380 * (1 - t / 3)), t < 2.6 ? 1 : 0);
      for (const d of E.debris) {
        d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; d.life -= dt * .22;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.globalAlpha = Math.max(0, d.life);
        ctx.fillStyle = "#595d6c"; ctx.fillRect(-d.s / 2, -d.s / 4, d.s, d.s / 2);
        ctx.fillStyle = "#ff9d3d"; ctx.fillRect(d.s / 2 - 2, -d.s / 4, 2, d.s / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (t > 4.4 && this.fadeEl) { this.fadeEl.style.transition = "none"; this.fadeEl.style.opacity = Math.min(1, (t - 4.4) / 1.4); }
      if (t >= 6) this.enter("erde", { fin: this.finish(true) });
    }
    makePlanet() {
      const r = this.seed(11), P = { cont: [], cloud: [], lights: [] };
      for (let i = 0; i < 14; i++) { const c = { lon: r() * 6.283, lat: (r() - .5) * 2, s: .08 + r() * .16, a: r() * 3, sub: [] }; for (let j = 0; j < 4; j++) c.sub.push({ dl: (r() - .5) * c.s * 1.6, dt: (r() - .5) * c.s * 1.2, s: c.s * (.4 + r() * .5), a: r() * 3 }); P.cont.push(c); }
      for (let i = 0; i < 34; i++) P.cloud.push({ lon: r() * 6.283, lat: (r() - .5) * 2.4, s: .03 + r() * .12, a: r() * 3, w: (.2 + r() * .3).toFixed(2) });
      for (let i = 0; i < 180; i++) P.lights.push({ x: (r() - .5) * 2, y: (r() - .5) * 2, s: .004 + r() * .006 });
      return P;
    }
    planet(ctx, x, y, R, now, open, dil) {
      const P = this.E.planet, rot = now * .00004, mo = now * .00025;
      open = open || 0; dil = dil || 0;
      const moon = (k, front) => { const a = mo * (k ? 1.6 : 1) + k * 2.2, sn = Math.sin(a); if ((sn > 0) !== front) return; const mx = x + Math.cos(a) * R * (k ? 1.7 : 2.4), my = y + sn * R * (k ? .35 : .5) + R * (k ? .2 : -.2), mr = R * (k ? .06 : .1); const g = ctx.createRadialGradient(mx - mr * .4, my - mr * .4, mr * .1, mx, my, mr); g.addColorStop(0, k ? "#cfd3e5" : "#b2b6ca"); g.addColorStop(1, "#292b31"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill(); };
      const ringHalf = (front) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-.28); [[1.55, .1, "rgba(210,200,240,.22)"], [1.72, .05, "rgba(181,171,252,.32)"], [1.92, .025, "rgba(233,233,237,.18)"]].forEach(([k, w, c]) => { ctx.strokeStyle = c; ctx.lineWidth = R * w; ctx.beginPath(); ctx.ellipse(0, 0, R * k, R * k * .2, 0, front ? 0 : Math.PI, front ? Math.PI : 6.283); ctx.stroke(); }); ctx.restore(); };
      moon(0, false); moon(1, false); ringHalf(false);
      let g = ctx.createRadialGradient(x, y, R * .92, x, y, R * 1.35); g.addColorStop(0, "rgba(140,220,230,.42)"); g.addColorStop(.5, "rgba(181,171,252,.16)"); g.addColorStop(1, "rgba(181,171,252,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.35, 0, 6.283); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.clip();
      g = ctx.createRadialGradient(x - R * .35, y - R * .35, R * .05, x, y, R); g.addColorStop(0, "#4fc4b8"); g.addColorStop(.55, "#1e6f84"); g.addColorStop(1, "#0d2440");
      ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
      const blob = (lon, lat, s, a, col) => { const c = Math.cos(lon); if (c < -.05) return; const bx = x + R * Math.sin(lon) * Math.cos(lat), by = y + R * Math.sin(lat) * .98; ctx.globalAlpha = Math.min(1, c * 1.6 + .1); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(bx, by, Math.max(.4, s * R * Math.max(.16, c)), s * R * .72, a, 0, 6.283); ctx.fill(); };
      for (const c of P.cont) { blob(c.lon + rot, c.lat, c.s, c.a, "#b8925a"); for (const u of c.sub) blob(c.lon + u.dl + rot, c.lat + u.dt, u.s, u.a, "#7f5f3a"); for (const u of c.sub) blob(c.lon + u.dl * .5 + rot, c.lat + u.dt * .5, u.s * .45, u.a, "#5f7a4a"); }
      ctx.globalAlpha = .75; ctx.fillStyle = "#e4e7f5";
      ctx.beginPath(); ctx.ellipse(x, y - R * .97, R * .55, R * .14, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + R * .98, R * .42, R * .1, 0, 0, 6.283); ctx.fill();
      for (const c of P.cloud) blob(c.lon + rot * 1.7, c.lat, c.s, c.a, "rgba(240,245,255," + c.w + ")");
      ctx.globalAlpha = 1;
      const ex = x - R * .06, ey = y + R * .04, er = R * .3;
      if (open > .01) {
        ctx.save(); ctx.translate(ex, ey); ctx.scale(1, Math.max(.02, open));
        g = ctx.createRadialGradient(0, 0, er * .9, 0, 0, er * 1.6); g.addColorStop(0, "rgba(255,43,61,.5)"); g.addColorStop(1, "rgba(255,43,61,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, er * 1.6, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#e4dcd8"; ctx.beginPath(); ctx.ellipse(0, 0, er * 1.3, er * .96, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(154,7,22,.35)"; ctx.lineWidth = Math.max(.5, er * .015);
        for (let i = 0; i < 10; i++) { const a = i * .63 + .3, r0 = er * .95; ctx.beginPath(); ctx.moveTo(Math.cos(a) * er * 1.25, Math.sin(a) * er * .9); ctx.quadraticCurveTo(Math.cos(a + .2) * er * 1.1, Math.sin(a + .2) * er * .8, Math.cos(a) * r0, Math.sin(a) * r0 * .95); ctx.stroke(); }
        g = ctx.createRadialGradient(0, 0, er * .2, 0, 0, er * .9); g.addColorStop(0, "#ffb3a0"); g.addColorStop(.35, "#ff2b3d"); g.addColorStop(.8, "#9a0716"); g.addColorStop(1, "#3a0309");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, er * .9, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(255,190,170,.35)"; ctx.lineWidth = Math.max(.5, er * .012);
        for (let i = 0; i < 72; i++) { const a = i / 72 * 6.283 + Math.sin(i * 3.7) * .05, e2 = .8 + .07 * Math.sin(i * 1.9); ctx.beginPath(); ctx.moveTo(Math.cos(a) * er * .36, Math.sin(a) * er * .36); ctx.lineTo(Math.cos(a) * er * e2, Math.sin(a) * er * e2); ctx.stroke(); }
        const pr = er * (.3 + .42 * dil);
        ctx.fillStyle = "#0c0d15"; ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.283); ctx.fill();
        ctx.fillStyle = "rgba(255,240,240,.8)"; ctx.beginPath(); ctx.ellipse(-er * .28, -er * .32, er * .08, er * .05, -.5, 0, 6.283); ctx.fill();
        ctx.restore();
      }
      g = ctx.createLinearGradient(x - R * .7, y - R * .7, x + R, y + R); g.addColorStop(0, "rgba(10,12,30,0)"); g.addColorStop(.55, "rgba(10,12,30,.14)"); g.addColorStop(1, "rgba(10,12,30,.85)");
      ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
      ctx.fillStyle = "#f0c96a";
      for (const p of P.lights) { const sh = p.x * .7 + p.y * .7; if (sh < .3 || p.x * p.x + p.y * p.y > .9) continue; ctx.globalAlpha = Math.min(.8, (sh - .3) * 2); ctx.fillRect(x + p.x * R, y + p.y * R, Math.max(.6, R * p.s), Math.max(.6, R * p.s)); }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = "rgba(170,230,235,.55)"; ctx.lineWidth = Math.max(1, R * .012); ctx.beginPath(); ctx.arc(x, y, R, 3.4, 5.6); ctx.stroke();
      ringHalf(true); moon(0, true); moon(1, true);
    }

  }

  /* ======================================================
     DIE SEITE NACH DER REISE: „Terra Nova“ oder „Verwahrung“
     ---------------------------------------------------
     html.fh-terra       gelandet: Nocturne-Violett, ein Auge wandert
                         über die Seite und folgt dem Mauszeiger
     html.fh-verwahrung  Arche verloren: Rot, Gitter, Flackern, ein
                         großes Auge oben rechts, die Akte
     Alles Feste hängt in #fh-reise-welt an body (steht in den
     :not-Listen von 95/96/97). Die Willkommenskarte erscheint einmal
     je Reise (localStorage „fhReiseWeltGesehen“) und lässt sich
     schließen. Für alle gilt die Seite über live_event.reise_welt
     (live-storys.js ruft welt() mit allen: true); eine Admin-Vorschau
     (vorschau: true) merkt sich nichts und hat Vorrang, bis sie endet.
  ====================================================== */
  const welt = { art: null, fin: null, wurzel: null, auge: null, uhren: [], maus: null, x: -1, y: -1, schluessel: null, vorschau: false, nr: 0, opt: null, vorschauFrei: false };

  /* „Entkomme der Zelle“: Wer ausgebrochen ist, sieht keine Gitter mehr
     (je Verwahrung; in der Admin-Vorschau nur bis zum Neuladen). */
  function entkommenSchon() {
    return welt.vorschau ? welt.vorschauFrei : !!welt.schluessel && gemerkt("fhZelleEntkommen") === welt.schluessel;
  }
  function zelleOeffnen() {
    if (typeof window.fhNachladen !== "function") return;
    window.fhNachladen("zelle").then(function () {
      if (!window.fhZelle || welt.art !== "verwahrung") return;
      window.fhZelle.start({
        schluessel: welt.vorschau ? "vorschau" : (welt.schluessel || "vorschau"),
        belohnung: !welt.vorschau && !!welt.schluessel,
        beimEntkommen: function () {
          if (welt.art !== "verwahrung") return;
          if (welt.vorschau) welt.vorschauFrei = true;
          /* Seite neu zeichnen: ohne Gitter, „Auf der Flucht“ */
          const art = welt.art, fin = welt.fin, opt = Object.assign({}, welt.opt || {}, { ohneKarte: true });
          welt.schluessel = null;
          weltAn(art, fin, opt);
        },
      });
    }, function (e) { console.warn(e); });
  }

  function merken(schl, wert) {
    try { if (wert == null) localStorage.removeItem(schl); else localStorage.setItem(schl, wert); } catch (e) { /* Privatmodus */ }
  }
  function gemerkt(schl) {
    try { return localStorage.getItem(schl); } catch (e) { return null; }
  }

  function weltAus(opt) {
    opt = opt || {};
    if (opt.allen && welt.vorschau) return;
    if (!opt.vorschau) merken("fhReiseWelt", null);
    welt.vorschau = false; welt.schluessel = null; welt.nr++;
    welt.uhren.forEach(clearInterval); welt.uhren = [];
    if (welt.maus) document.removeEventListener("pointermove", welt.maus);
    welt.maus = null;
    if (welt.wurzel) welt.wurzel.remove();
    welt.wurzel = null; welt.auge = null; welt.art = null;
    const h = document.documentElement;
    h.classList.add("fh-reise-wechsel");
    h.classList.remove("fh-terra", "fh-verwahrung");
    setTimeout(function () { h.classList.remove("fh-reise-wechsel"); }, 1200);
  }

  /* Ohne Zahlen einer Reise (Admin schaltet direkt um): leere Karte. */
  function leerFin(verloren) {
    return { leer: true, crewHits: 0, myHits: 0, hull: verloren ? 0 : 100, crew: 0, name: gemerkt("wheelNickname") || t("reise.du", "Du"), lost: !!verloren };
  }
  function finAusStand(d, verloren) {
    if (!d || d.ok !== true || !(Number(d.kanonen) > 0)) return null;
    return { crewHits: Number(d.treffer_gesamt) || 0, myHits: d.ich ? Number(d.ich.treffer) || 0 : 0, hull: Math.round(Number(d.huelle) || 0),
      crew: Number(d.kanonen) || 0, name: gemerkt("wheelNickname") || t("reise.du", "Du"), lost: !!verloren };
  }

  function insasse(name) {
    return String(1000 + Array.from(name || "x").reduce(function (a, ch) { return (a * 31 + ch.charCodeAt(0)) % 9000; }, 7));
  }

  function zeile(eltern, klasse, teile) {
    const z = el("div", klasse);
    teile.forEach(function (x) { z.appendChild(typeof x === "string" ? el("span", null, x) : x); });
    eltern.appendChild(z);
    return z;
  }

  function willkommen(art, fin) {
    const verloren = art === "verwahrung";
    const k = el("section", "rsw-karte");
    k.setAttribute("role", "dialog");
    k.setAttribute("aria-modal", "false");
    k.setAttribute("aria-labelledby", "rsw-titel");
    k.appendChild(el("span", "rs-tag ist-rand" + (verloren ? " ist-rot" : ""), verloren ? t("reise.welt.v.tag", "Signal verloren · Verwahrung Tag 1") : t("reise.welt.t.tag", "Landung bestätigt · Tag 1")));
    const h = el("h2", "rsw-titel", verloren ? t("reise.welt.v.titel", "Willkommen in der Verwahrung.") : t("reise.welt.t.titel", "Willkommen auf der neuen Erde."));
    h.id = "rsw-titel";
    k.appendChild(h);
    k.appendChild(el("p", "rsw-text", verloren
      ? t("reise.welt.v.text", "Die Arche ist gefallen. Eure Crew wurde aus den Trümmern geborgen und hierher gebracht. Hier seid ihr sicher. Hier bleibt ihr.")
      : t("reise.welt.t.text", "Die Flotte hat Terra Nova erreicht. Atmosphäre stabil, Biosphäre intakt, alle Systeme online. Ihr seid in Sicherheit.")));

    if (!verloren && !fin.leer) {
      const zahlen = el("div", "rsw-zahlen");
      [[zahl(fin.crewHits), t("reise.welt.t.crewTreffer", "Abschüsse der Crew auf der Reise")],
        [zahl(fin.myHits), tf("reise.welt.t.deine", "davon von {name}", { name: fin.name })],
        [fin.hull + " %", t("reise.welt.t.huelle", "Hülle bei der Landung")],
        [zahl(fin.crew), t("reise.welt.t.kanonen", "Kanonen besetzt")]].forEach(function (p) {
        const z = el("div", "rsw-zahl");
        z.append(el("div", "rsw-zahl-wert", p[0]), el("div", "rsw-zahl-text", p[1]));
        zahlen.appendChild(z);
      });
      k.appendChild(zahlen);
    }
    if (!verloren) {
      const sys = el("div", "rsw-systeme");
      [["atmo", "Atmosphäre", "21 % Sauerstoff, 0,94 g. Atmen ohne Maske ab Tag drei.", "Sensor 01 · online"],
        ["bio", "Biosphäre", "Wälder, Ozeane, gemäßigte Zonen. Keine bekannten Raubtiere.", "Sensor 02 · online"],
        ["energie", "Energie", "Orbitale Kollektoren versorgen jede Siedlung rund um die Uhr.", "Netz · 100 %"],
        ["wacht", "Wacht", "Ein einziges Auge sieht jeden Winkel der Kolonie. Zu eurem Schutz.", "Immer aktiv"]].forEach(function (s) {
        const z = el("div", "rsw-system" + (s[0] === "wacht" ? " ist-rot" : ""));
        if (s[0] === "wacht") z.appendChild(symbol("auge"));
        z.append(el("div", "rsw-system-name", t("reise.welt.sys." + s[0] + ".name", s[1])),
          el("p", "rsw-system-text", t("reise.welt.sys." + s[0] + ".text", s[2])),
          el("div", "rs-leise", t("reise.welt.sys." + s[0] + ".meta", s[3])));
        sys.appendChild(z);
      });
      k.appendChild(sys);
    } else {
      const doppel = el("div", "rsw-doppel");
      const akte = el("div", "rsw-akte");
      akte.appendChild(el("div", "rs-kicker ist-rot", t("reise.welt.v.akte", "Akte")));
      const g = el("div", "rsw-akte-raster");
      [[t("reise.welt.v.name", "Name"), fin.name],
        [t("reise.welt.v.nummer", "Nummer"), "#" + insasse(fin.name)],
        [t("reise.welt.v.zelle", "Zelle"), "C-17"],
        [t("reise.welt.v.vergehen", "Vergehen"), t("reise.welt.v.vergehenText", "Arche verloren · Hülle 0 %")],
        [t("reise.welt.v.abschuesse", "Abschüsse"), fin.leer ? "–" : tf("reise.welt.v.abschuesseText", "{mein} von {alle}", { mein: zahl(fin.myHits), alle: zahl(fin.crewHits) })],
        [t("reise.welt.v.status", "Status"), t("reise.welt.v.statusText", "unter Beobachtung")]].forEach(function (p, i) {
        g.appendChild(el("span", "rs-leise", p[0]));
        g.appendChild(el("span", i === 5 ? "ist-rot" : null, p[1]));
      });
      akte.appendChild(g);
      const ordnung = el("div", "rsw-akte");
      ordnung.appendChild(el("div", "rs-kicker ist-rot", t("reise.welt.v.ordnung", "Hausordnung")));
      const ol = el("ol", "rsw-ordnung");
      [["1", "Bleibt in euren Zellen."], ["2", "Wenn ihr angesehen werdet, schaut zurück."], ["3", "Es gibt keinen Weg zurück zur Arche."], ["4", "Das Auge schläft nicht."]].forEach(function (r) {
        ol.appendChild(el("li", null, t("reise.welt.v.regel" + r[0], r[1])));
      });
      ordnung.appendChild(ol);
      doppel.append(akte, ordnung);
      k.appendChild(doppel);
    }

    const fuss = el("div", "rsw-fuss");
    fuss.appendChild(el("span", "rs-leise" + (verloren ? " ist-rot" : ""), verloren
      ? t("reise.welt.v.fuss", "Verwahranlage Terra Nova · Fluchtversuche werden protokolliert.")
      : t("reise.welt.t.fuss", "Kolonialnetz Terra Nova · Jede Bewegung wird zu eurer Sicherheit erfasst.")));
    const zu = function () { k.remove(); };
    if (verloren) {
      /* Das Minispiel „Entkomme der Zelle“ (zelle.js) */
      fuss.appendChild(knopf(entkommenSchon() ? t("reise.welt.v.nochmal", "Noch einmal ausbrechen") : t("reise.welt.v.zelleVerlassen", "Zelle verlassen"),
        "ist-leise", function () { k.remove(); zelleOeffnen(); }, "schloss"));
      fuss.appendChild(knopf(t("reise.welt.v.schliessen", "Akte schließen"), "ist-haupt ist-rot", zu));
    } else {
      fuss.appendChild(knopf(t("reise.welt.t.quartier", "Quartier beziehen"), "ist-haupt", zu, "planet"));
    }
    k.appendChild(fuss);
    return k;
  }

  /* Das Auge: wandert bei Terra Nova alle 6 s weiter (Lidschlag
     dazwischen), sitzt in der Verwahrung groß oben rechts. Die
     Pupille folgt dem Mauszeiger. */
  function augePlatz(verloren) {
    const w = verloren ? 150 : 58;
    if (verloren) return { x: 66, y: 17, w: w };
    const rechts = Math.random() < .75;
    return { x: rechts ? 58 + Math.random() * 34 : 7 + Math.random() * 4, y: 12 + Math.random() * 72, w: w };
  }
  function augeSetzen(p) {
    const a = welt.auge; if (!a) return;
    a.style.left = p.x + "%"; a.style.top = p.y + "%";
    a.style.width = p.w + "px"; a.style.height = Math.round(p.w * .46) + "px";
    a.style.setProperty("--rsw-glut", Math.round(p.w * .6) + "px");
    schauen();
  }
  function schauen() {
    const a = welt.auge; if (!a || welt.x < 0) return;
    const r = a.getBoundingClientRect(), p = a.firstChild;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = Math.atan2(welt.y - cy, welt.x - cx), d = Math.min(1, Math.hypot(welt.x - cx, welt.y - cy) / 160);
    p.style.transform = "translate(-50%,-50%) translate(" + (Math.cos(w) * d * r.width * .28).toFixed(1) + "px," + (Math.sin(w) * d * r.height * .2).toFixed(1) + "px)";
  }
  function blinzeln(dauer) {
    const a = welt.auge; if (!a) return;
    a.classList.add("ist-zu");
    setTimeout(function () { if (welt.auge === a) a.classList.remove("ist-zu"); }, dauer || 150);
  }

  /* opt: { schluessel, lauf, allen, vorschau } - siehe oben. */
  function weltAn(art, fin, opt) {
    opt = opt || {};
    if (art !== "terra" && art !== "verwahrung") { weltAus(opt); return; }
    if (opt.allen && welt.vorschau) return;
    if (opt.schluessel && opt.schluessel === welt.schluessel && welt.art === art) return;
    const verloren = art === "verwahrung";
    /* Für alle nach einer Reise: erst die Zahlen holen, dann umschalten. */
    if (!fin && opt.lauf && dbDa()) {
      const nr = ++welt.nr;
      rpc("reise_stand", { p_story_id: opt.lauf })
        .then((d) => finAusStand(d, verloren), () => null)
        .then((f) => { if (nr === welt.nr) weltAn(art, f || leerFin(verloren), Object.assign({}, opt, { lauf: null })); });
      return;
    }
    if (welt.art) weltAus(opt);
    fin = fin ? Object.assign(leerFin(verloren), fin, { leer: !!fin.leer }) : leerFin(verloren);
    const frei = !!opt.ohneKarte && welt.vorschauFrei;
    welt.art = art; welt.fin = fin; welt.schluessel = opt.schluessel || null; welt.vorschau = !!opt.vorschau; welt.opt = opt;
    welt.vorschauFrei = frei;
    if (!opt.vorschau) merken("fhReiseWelt", art);
    const still = !!opt.ohneKarte || !!(opt.schluessel && gemerkt("fhReiseWeltGesehen") === opt.schluessel);
    const flucht = verloren && entkommenSchon();
    if (opt.schluessel && !still) merken("fhReiseWeltGesehen", opt.schluessel);
    const h = document.documentElement;
    h.classList.add("fh-reise-wechsel");
    h.classList.toggle("fh-terra", !verloren);
    h.classList.toggle("fh-verwahrung", verloren);
    setTimeout(function () { h.classList.remove("fh-reise-wechsel"); }, 1200);

    const w = el("div", "rsw rsw-" + art);
    w.id = "fh-reise-welt";
    if (verloren && !flucht) {
      w.appendChild(el("div", "rsw-gitter")).setAttribute("aria-hidden", "true");
      w.appendChild(el("div", "rsw-flacker")).setAttribute("aria-hidden", "true");
    }
    if (flucht) w.classList.add("ist-flucht");
    const auge = el("div", "rsw-auge");
    auge.setAttribute("aria-hidden", "true");
    auge.appendChild(el("div", "rsw-pupille"));
    welt.auge = w.appendChild(auge);

    const leiste = el("div", "rsw-leiste");
    leiste.setAttribute("role", "status");
    leiste.appendChild(symbol(verloren ? "schloss" : "planet"));
    let uhr;
    if (verloren) {
      zeile(leiste, "rsw-leiste-teil", [flucht ? t("reise.welt.v.flucht", "Auf der Flucht") : t("reise.welt.v.anlage", "Verwahranlage Terra Nova")]);
      zeile(leiste, "rsw-leiste-teil", [tf("reise.welt.v.insasse", "Insasse #{n}", { n: insasse(fin.name) })]);
      zeile(leiste, "rsw-leiste-teil", [tf("reise.welt.v.zelleNr", "Zelle {n}", { n: "C-17" })]);
      uhr = el("span", "rs-ziffern ist-rot", "00:59");
      zeile(leiste, "rsw-leiste-teil", [t("reise.welt.v.kontrolle", "Nächste Kontrolle") + " ", uhr]);
      if (!flucht) leiste.appendChild(knopf(t("reise.welt.v.ausbruch", "Ausbruch versuchen"), "ist-leise rsw-ausbruch", zelleOeffnen, "schloss"));
    } else {
      zeile(leiste, "rsw-leiste-teil", [t("reise.welt.t.netz", "Kolonialnetz Terra Nova")]);
      uhr = el("span", "rs-ziffern", "00:00:00");
      zeile(leiste, "rsw-leiste-teil", [t("reise.welt.t.zeit", "Systemzeit") + " ", uhr]);
      zeile(leiste, "rsw-leiste-teil", [t("reise.welt.t.beobachter", "Beobachter aktiv") + " ", el("span", "ist-rot", "1")]);
    }
    w.appendChild(leiste);
    if (!still) w.appendChild(willkommen(art, fin));
    document.body.appendChild(w);
    welt.wurzel = w;

    welt.maus = function (e) { welt.x = e.clientX; welt.y = e.clientY; schauen(); };
    document.addEventListener("pointermove", welt.maus, { passive: true });
    augeSetzen(augePlatz(verloren));
    const t0 = Date.now();
    welt.uhren.push(setInterval(function () {
      const s = Math.floor((Date.now() - t0) / 1000);
      uhr.textContent = verloren ? "00:" + String(59 - s % 60).padStart(2, "0")
        : [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(function (v) { return String(v).padStart(2, "0"); }).join(":");
    }, 1000));
    if (!verloren) {
      welt.uhren.push(setInterval(function () {
        blinzeln(200);
        setTimeout(function () { augeSetzen(augePlatz(false)); }, 200);
      }, 6000));
    }
    welt.uhren.push(setInterval(function () {
      if (Math.random() < (verloren ? .12 : .3)) blinzeln(150);
      const f = w.querySelector(".rsw-flacker");
      if (f && !RUHIG.matches && Math.random() < .22) {
        f.style.opacity = .6 + Math.random() * .4;
        setTimeout(function () {
          f.style.opacity = 0;
          setTimeout(function () { if (Math.random() < .5) { f.style.opacity = .5; setTimeout(function () { f.style.opacity = 0; }, 60); } }, 70);
        }, 70 + Math.random() * 90);
      }
    }, 1500));
  }

  /* ======================================================
     FILM STARTEN UND BEENDEN
  ====================================================== */
  let film = null;

  function filmWeg(sanft) {
    const f = film; film = null;
    if (!f) return;
    f.reise.stoppen();
    document.removeEventListener("keydown", f.esc);
    if (sanft && !RUHIG.matches) {
      f.wurzel.classList.add("ist-weg");
      setTimeout(function () { f.wurzel.remove(); }, 1600);
    } else {
      f.wurzel.remove();
    }
  }

  function start(opt) {
    opt = opt || {};
    filmWeg(false);
    const w = el("div", "rs");
    w.id = "fh-reise";
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-label", t("reise.name", "Sternenreise"));
    const cv = el("canvas", "rs-cv");
    cv.setAttribute("aria-hidden", "true");
    w.append(cv, el("div", "rs-ebene"), el("div", "rs-blende"));
    document.body.appendChild(w);
    const live = opt.live || null;
    const reise = new Reise({ journeySeconds: live ? REISE_DAUER : (opt.dauer || 300), crewSize: opt.crew || 9, vorschau: !live && opt.vorschau !== false, startPhase: opt.ab || "schlacht", live: live }, function (fin) {
      filmWeg(true);
      const art = fin && fin.lost ? "verwahrung" : "terra";
      if (live) weltAn(art, fin, { allen: true, schluessel: art + "|" + live.storyId });
      else weltAn(art, fin, { vorschau: true });
    });
    reise.beimAbbruch = function () { filmWeg(false); };
    const esc = function (e) { if (e.key === "Escape") filmWeg(false); };
    document.addEventListener("keydown", esc);
    film = { wurzel: w, reise: reise, esc: esc };
    reise.starten(w);
  }

  window.fhSternenreise = {
    /* Admin-Vorschau: nur dieser Browser, ohne Datenbank */
    start: start,
    stopp: function () { filmWeg(false); },
    /* Story 'reise' aus live-storys.js: ab = ms seit dem Start */
    live: function (o) {
      o = o || {};
      if (!o.storyId || o.vorschau) { start({ dauer: REISE_DAUER, vorschau: true }); return; }
      /* Längst vorbei (später Einstieg): die Seite schaltet live-storys.js. */
      if ((o.ab || 0) / 1000 > REISE_AB + REISE_DAUER + 24) return;
      start({ live: { storyId: o.storyId, t0: Date.now() - (o.ab || 0) } });
    },
    ende: function () { filmWeg(true); },
    weg: function () { filmWeg(false); },
    /* welt(art, fin?, { allen, lauf, schluessel, vorschau }) */
    welt: function (art, fin, opt) { weltAn(art, fin, opt); },
    weltArt: function () { return welt.art; },
  };
})();
