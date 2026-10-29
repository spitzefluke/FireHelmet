/* ======================================================
   LIVE-STORY "LIEBESLIED" (Migration 70) - 3D-FASSUNG
   ---------------------------------------------------
   Lyric-Video zu "I Don't Know Love" als Kamerafahrt durch einen
   three.js-Raum. Der Liedtext steht als Schrift im Raum am Weg; die
   Kamera fliegt auf jede Zeile zu und am Zeilenende hindurch.

   Gleiche API wie vorher (live-storys.js bleibt unveraendert):
     fhLiedFilm.start({ ab: ms, vorschau, text?, uhr? })
       uhr: optional, Funktion -> Sekunden (z. B. audio.currentTime);
            ohne uhr laeuft die Zeit wie bisher ab performance.now().
     fhLiedFilm.ende() / weg() / laeuft() / lesen() / zeit()
   Gleiches Textformat (siteConfig.liedText):
     # strophe | 15.0 | Text / zweite Zeile mit *Betonung* {ringe}

   Je Liedteil eine eigene Welt und eigene Kurven:
     intro/outro  Lichtring-Tunnel, Nebel, ruhige gerade Fahrt
     strophe      dunkle Flaechen mit feinen Linien, Orb, sanftes Pendeln
     refrain      Ringe hell, Bokeh, Spirale mit langsamer Rolle
     bruecke      Licht von unten, Riesen-Gitterkoerper, Gegenrolle
   Ueberall: Kristalle, Staub, Galaxien am Himmel.

   Schrift: Woerter setzen sich aus Partikeln zusammen und fliegen
   einzeln aus der Tiefe heran, Glanzstreif, echte Tiefe (gestapelte
   Ebenen), betonte Woerter mit Glitch/Farbversatz; am Ende zerfaellt
   die Zeile in Funken, waehrend die Kamera hindurchfliegt.

   Alles ist eine Funktion der Zeit T (fester Zufall) - wer spaeter
   einsteigt, sieht dasselbe. Ohne three.js/WebGL oder bei langsamer
   Software-Grafik laedt die klassische 2D-Fassung
   (lied-film-klassisch.js, nachgeladen als "liedKlassisch"). "Bewegung reduzieren": keine Partikel,
   kein Glitch, keine Rolle; Woerter blenden nur.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }

  const DAUER = 323.1;
  const STILE = ["intro", "strophe", "refrain", "bruecke", "outro"];
  const EFFEKTE = ["ringe", "horizont", "orb", "blitz", "kippen", "blende", "ohne"];
  const TEXT_MAX = 12000;
  const KLASSISCH = "liedKlassisch";   // Name in ADRESSEN (nachladen.js)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const mix = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  function zufall(start) {
    let s = (start * 2654435761) >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function hash1(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ------------------------------------------------------
     LIEDTEXT LESEN (Format wie bisher)
  ------------------------------------------------------ */
  function sekunden(s) {
    const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}(?:[.,]\d+)?)\s*$/.exec(s);
    if (!m) return null;
    const wert = (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(",", "."));
    return isFinite(wert) && wert >= 0 && wert < DAUER ? wert : null;
  }

  function woerter(text) {
    return text.split("/").map(function (teil) {
      return teil.trim().split(/\s+/).filter(Boolean).map(function (w) {
        const betont = /^\*.+\*$/.test(w) || /^\*[^*]+\*[,.!?…]+$/.test(w);
        return { w: w.replace(/\*/g, ""), betont: betont };
      }).filter(function (x) { return x.w; });
    }).filter(function (z) { return z.length; });
  }

  function lesen(roh) {
    const zeilen = [];
    let stil = "intro";
    String(roh || "").slice(0, TEXT_MAX).split(/\r?\n/).forEach(function (z) {
      const marke = /^\s*#\s*([a-zäöü]+)\s*$/i.exec(z);
      if (marke) {
        const name = marke[1].toLowerCase().replace("ü", "ue");
        if (STILE.indexOf(name) >= 0) stil = name;
        return;
      }
      const i = z.indexOf("|");
      if (i < 0) return;
      const ab = sekunden(z.slice(0, i));
      const tags = {};
      const text = z.slice(i + 1).replace(/\{([a-z]+)\}/gi, function (_, name) {
        name = name.toLowerCase();
        if (EFFEKTE.indexOf(name) >= 0) tags[name] = true;
        return " ";
      });
      const reihen = woerter(text);
      if (ab == null || !reihen.length) return;
      zeilen.push({ ab: ab, stil: stil, reihen: reihen, tags: tags });
    });
    zeilen.sort(function (a, b) { return a.ab - b.ab; });
    zeilen.forEach(function (z, n) {
      const naechste = zeilen[n + 1];
      z.nr = n;
      z.bis = naechste ? naechste.ab : DAUER;
      z.ende = Math.min(z.bis, z.ab + 9);
      z.anzahl = z.reihen.reduce(function (s, r) { return s + r.length; }, 0);
      z.betont = z.reihen.some(function (r) { return r.some(function (w) { return w.betont; }); });
      z.schritt = Math.min(0.42, Math.max(0.1, ((z.ende - z.ab) * 0.5) / Math.max(1, z.anzahl)));
      z.teilWechsel = !!naechste && naechste.stil !== z.stil;
      z.teilBeginn = n > 0 && zeilen[n - 1].stil !== z.stil;
      const r = zufall(n + 7);
      const ohne = z.tags.ohne;
      const s = z.stil;
      z.ringe = !ohne && (z.tags.ringe || (!z.tags.horizont && z.betont && s !== "strophe"));
      z.horizont = !ohne && (z.tags.horizont || (!z.ringe && (s === "intro" || s === "outro" || s === "bruecke") && n % 2 === 0));
      z.orb = !ohne && (z.tags.orb || s === "strophe");
      z.blitz = !ohne && !!z.tags.blitz;
      z.kippen = z.tags.blende ? false : (z.tags.kippen || z.teilWechsel || n % 2 === 1);
      z.x = s === "strophe" ? (r() * 2 - 1) * 380 : 0;
      z.y = s === "strophe" ? (r() * 2 - 1) * 220 : (s === "intro" || s === "outro" ? -30 : -10);
      z.buchstaben = s === "strophe" && n % 3 === 1;
      z.heranfliegen = s === "intro" || s === "outro" || (s === "bruecke" && n % 2 === 0);
      z.orbVon = [0.2 + r() * 0.6, 0.25 + r() * 0.5];
      z.orbNach = [0.2 + r() * 0.6, 0.25 + r() * 0.5];
      z.flaeche = r();
      /* Durchflug: kurz nach dem Zeilenende. */
      z.pass = Math.min(z.ende, z.bis) + 0.12;
    });
    return zeilen;
  }

  function aktiveZeile(zeilen, T) {
    for (let i = zeilen.length - 1; i >= 0; i--) if (T >= zeilen[i].ab) return i;
    return -1;
  }

  /* ------------------------------------------------------
     FARBEN (Tokens --fh-lied-*)
  ------------------------------------------------------ */
  function hex(h, ersatz) {
    const m = /^#?([0-9a-f]{6})$/i.exec((h || "").trim());
    return parseInt(m ? m[1] : ersatz, 16);
  }
  /* Farben roh setzen (ohne Farbraum-Umrechnung neuerer three.js-
     Versionen) - die Shader rechnen direkt in diesen Werten. */
  function farbe(n) { return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
  function farben() {
    const st = getComputedStyle(document.documentElement);
    const f = function (name, ersatz) { return farbe(hex(st.getPropertyValue(name), ersatz)); };
    return {
      nacht: f("--fh-lied-nacht", "0b0a1c"), daemmer: f("--fh-lied-daemmer", "4b4893"), daemmerRand: f("--fh-lied-daemmer-rand", "1a1938"),
      blau: f("--fh-lied-blau", "3436b4"), blauRand: f("--fh-lied-blau-rand", "11113c"), dunst: f("--fh-lied-dunst", "47427e"),
      dunstRand: f("--fh-lied-dunst-rand", "1b1935"), flaeche: f("--fh-lied-flaeche", "27272f"), linie: f("--fh-lied-linie", "6d6ae0"),
      lila: f("--fh-lied-lila", "a99cf0"), lilaTief: f("--fh-lied-lila-tief", "5d50b8"), licht: f("--fh-lied-licht", "f4f1ff"),
    };
  }
  function cssFarbe(c, a) { return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + a + ")"; }

  /* ------------------------------------------------------
     DIE BAHN: Kamera-Position als Funktion der Zeit
  ------------------------------------------------------ */
  const HZ = 30;
  const N = Math.ceil(DAUER * HZ) + 2;
  const FOV = 58, ASPEKT = 16 / 9;
  const D0 = 18;          // Abstand Kamera -> Zeile beim Zeilenbeginn
  /* Die Reise: ein Ort je Liedteil, der letzte Teil kehrt in den Tunnel zurueck. */
  const ORTE = ["tunnel", "hoehle", "galaxie", "landschaft", "stadt", "kathedrale", "truemmer", "planet", "aurora", "tunnel"];
  const ORTNAMEN = ["tunnel", "hoehle", "galaxie", "landschaft", "stadt", "kathedrale", "truemmer", "planet", "aurora"];

  function unschaerfe(a, radius) {
    const r = Math.max(1, Math.round(radius * HZ));
    for (let pass = 0; pass < 2; pass++) {
      const b = new Float32Array(a.length);
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[clamp(i, 0, a.length - 1)];
      for (let i = 0; i < a.length; i++) {
        b[i] = sum / (2 * r + 1);
        sum += a[clamp(i + r + 1, 0, a.length - 1)] - a[clamp(i - r, 0, a.length - 1)];
      }
      a.set(b);
    }
    return a;
  }

  function probe(arr, T) {
    const x = clamp(T * HZ, 0, arr.length - 1.001);
    const i = Math.floor(x), f = x - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  }

  function bahnBauen(zeilen) {
    const W = {};
    STILE.forEach(function (s) { W[s] = new Float32Array(N); });
    for (let i = 0; i < N; i++) {
      const T = i / HZ;
      const n = aktiveZeile(zeilen, T);
      const stil = n >= 0 ? zeilen[n].stil : (zeilen.length ? zeilen[0].stil : "intro");
      W[stil][i] = 1;
    }
    STILE.forEach(function (s) { unschaerfe(W[s], 1.4); });

    /* Vorwaertsweg S: je Zeile D0 Einheiten, Pausen gemaechlich. */
    const keys = [[0, -10]];
    let K = 0;
    zeilen.forEach(function (z) {
      keys.push([z.ab, K]);
      if (z.bis - z.ende > 0.5) { keys.push([z.ende + 0.2, K + D0]); K += D0 + (z.bis - z.ende - 0.2) * 1.4; }
      else K += D0;
    });
    if (!zeilen.length) K = DAUER * 3;
    keys.push([DAUER + 2, K + 6]);
    const S = new Float32Array(N);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const T = i / HZ;
      while (k < keys.length - 2 && T > keys[k + 1][0]) k++;
      const a = keys[k], b = keys[k + 1];
      S[i] = mix(a[1], b[1], clamp((T - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1));
    }
    unschaerfe(S, 0.45);

    const X = new Float32Array(N), Y = new Float32Array(N), R = new Float32Array(N);
    let roll = 0;
    for (let i = 0; i < N; i++) {
      const T = i / HZ;
      const wi = W.intro[i], ws = W.strophe[i], wr = W.refrain[i], wb = W.bruecke[i], wo = W.outro[i];
      const amp = 1.2 * wi + 3.6 * ws + 4.5 * wr + 4.2 * wb + 1.0 * wo;
      X[i] = amp * (Math.sin(0.21 * T) + 0.45 * Math.sin(0.53 * T + 1.3)) + 4 * wr * Math.cos(0.9 * T) + 3 * wb * Math.sin(0.35 * T + 2);
      Y[i] = amp * 0.55 * (Math.sin(0.16 * T + 0.7) + 0.5 * Math.sin(0.41 * T + 2)) + 4 * wr * Math.sin(0.9 * T) + 2.5 * wb * Math.cos(0.27 * T);
      roll += (0.03 * ws + 0.2 * wr - 0.12 * wb) / HZ;
      R[i] = RUHIG.matches ? 0 : roll;
    }
    for (let i = 1; i < N - 1; i++) R[i] += RUHIG.matches ? 0 : -(X[i + 1] - X[i - 1]) * HZ * 0.03;
    unschaerfe(R, 0.4);

    /* Orte: jeder Liedteil-Block bekommt einen eigenen Ort. */
    const bloecke = [];
    zeilen.forEach(function (z, n) {
      if (n === 0 || z.teilBeginn) bloecke.push({ stil: z.stil, ab: n === 0 ? 0 : z.ab, bis: DAUER });
      if (bloecke.length > 1) bloecke[bloecke.length - 2].bis = bloecke[bloecke.length - 1].ab;
    });
    if (!bloecke.length) bloecke.push({ stil: "intro", ab: 0, bis: DAUER });
    bloecke.forEach(function (bl, i) { bl.nr = i; bl.ort = (i === bloecke.length - 1 && i > 0) ? "tunnel" : ORTE[i % (ORTE.length - 1)]; });
    const O = {};
    ORTNAMEN.forEach(function (o) { O[o] = new Float32Array(N); });
    for (let i = 0, k2 = 0; i < N; i++) {
      const T = i / HZ;
      while (k2 < bloecke.length - 1 && T >= bloecke[k2].bis) k2++;
      O[bloecke[k2].ort][i] = 1;
    }
    ORTNAMEN.forEach(function (o) { unschaerfe(O[o], 2.2); });
    return { W: W, S: S, X: X, Y: Y, R: R, O: O, bloecke: bloecke };
  }

  function bahnPunkt(b, T, v) { return v.set(probe(b.X, T), probe(b.Y, T), -probe(b.S, T)); }

  /* Ausrichtung zur Zeit T: in Fahrtrichtung, mit Rolle. Fuer Kamera
     und Zeilen gemeinsam - die Zeile steht so, wie die Kamera sie im
     Moment des Durchflugs sieht. */
  const _p = { a: null, b: null, o: null };
  function ausrichten(b, T, obj) {
    if (!_p.a) { _p.a = new THREE.Vector3(); _p.b = new THREE.Vector3(); _p.o = new THREE.PerspectiveCamera(); }
    bahnPunkt(b, T, _p.a);
    bahnPunkt(b, T + 0.5, _p.b);
    _p.b.z -= 3;
    _p.o.position.copy(_p.a);
    _p.o.up.set(0, 1, 0);
    _p.o.lookAt(_p.b);
    _p.o.rotateZ(probe(b.R, T));
    obj.position.copy(_p.a);
    obj.quaternion.copy(_p.o.quaternion);
  }

  function gewicht(b, stil, T) { return probe(b.W[stil], T); }
  function ortGewicht(b, ort, T) { return probe(b.O[ort], T); }

  /* ------------------------------------------------------
     SHADER-BAUSTEINE
  ------------------------------------------------------ */
  const NOISE = [
    "float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}",
    "float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);",
    " return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),",
    "  mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}",
    "float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p*=2.03;a*=.5;}return v;}",
  ].join("\n");

  function weichTextur() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /* Abstand-Ausblendung fuer alles in der Welt: nah weich weg (kein
     Aufblitzen beim Durchfliegen), fern in den Nebel. */
  const FADE_GLSL = "float fadeD(float d){return smoothstep(1.5,9.,d)*(1.-smoothstep(110.,230.,d));}";

  /* ------------------------------------------------------
     DIE WELT
  ------------------------------------------------------ */
  function weltBauen(l) {
    const b = l.bahn, F = l.farben, szene = l.szene, r = zufall(70);
    const tmp = new THREE.Object3D(), v = new THREE.Vector3();
    const objekte = [];

    /* 1. Himmel: Nebel-Kugel mit Sternen, folgt der Kamera. */
    const himmel = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        uZeit: { value: 0 }, uMitte: { value: new THREE.Color() }, uRand: { value: new THREE.Color() },
        uLila: { value: F.lila }, uLicht: { value: F.licht }, uNacht: { value: F.nacht },
        uVorn: { value: new THREE.Vector3(0, 0, -1) }, uUnten: { value: 0 }, uDunst: { value: 0 }, uSterne: { value: 1 },
        uOa: { value: new THREE.Vector4() }, uOb: { value: new THREE.Vector4() },
      },
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
      fragmentShader: [
        "uniform float uZeit,uUnten,uDunst,uSterne; uniform vec3 uMitte,uRand,uLila,uLicht,uNacht,uVorn; uniform vec4 uOa,uOb; varying vec3 vD;",
        NOISE,
        "void main(){",
        " vec3 d=normalize(vD);",
        " float vorn=dot(d,normalize(uVorn))*.5+.5;",
        " vec3 col=mix(uRand,uMitte,pow(vorn,2.2));",
        " vec3 q=d*2.2+vec3(0.,0.,uZeit*.006);",
        " float n=fbm(q+fbm(q*1.7+uZeit*.004)*1.4);",
        " float wolke=smoothstep(.42,.9,n);",
        " col=mix(col,mix(uLila,uMitte,.35),wolke*(.32+uDunst*.25));",
        " col+=uLicht*pow(max(d.y,0.),4.)*.22*(1.-uUnten);",
        " col+=mix(uLila,uLicht,.4)*pow(max(-d.y,0.),3.)*.55*uUnten;",
        /* Hoehle: dunkel, Kristalladern im Gewoelbe */
        " float ader=pow(1.-abs(fbm(d*5.+vec3(0.,uZeit*.01,0.))*2.-1.),14.);",
        " col=mix(col,uNacht*.55,uOa.x*.65); col+=mix(uLila,uLicht,.3)*ader*.55*uOa.x;",
        /* Galaxie: Milchstrassen-Band */
        " float band=exp(-pow(dot(d,normalize(vec3(.35,1.,.15)))*4.2,2.));",
        " float staub=fbm(d*7.+3.);",
        " col+=mix(uLila,uLicht,staub)*band*(.25+.75*staub)*uOa.y*.75; col-=uNacht*band*smoothstep(.55,.75,fbm(d*11.))*.5*uOa.y;",
        /* Landschaft: Horizontgluehen und Mond */
        " vec3 mo=normalize(vec3(-.55,.32,-.78)); float md=dot(d,mo);",
        " col+=mix(uLila,uLicht,.55)*exp(-abs(d.y+.04)*10.)*.55*uOa.z;",
        " col+=uLicht*(smoothstep(.9975,.9982,md)*(.75+.25*fbm(d*40.))+pow(max(md,0.),90.)*.3)*uOa.z;",
        /* Stadt: Lichtdunst von unten, Wolkendecke */
        " col+=uLila*smoothstep(.25,-.45,d.y)*.4*uOa.w; col=mix(col,mix(uMitte,uLila,.3),smoothstep(.35,.8,n)*smoothstep(-.1,.4,d.y)*.4*uOa.w);",
        /* Kathedrale: Lichtstrahlen von oben */
        " float ang=atan(d.x,d.z); float strahl=pow(.5+.5*sin(ang*22.+n*4.+uZeit*.05),7.)*smoothstep(.05,.85,d.y);",
        " col+=uLicht*(strahl*.32+pow(max(d.y,0.),6.)*.35)*uOb.x;",
        /* Truemmer: schwerer Nebel */
        " float neb=smoothstep(.5,.95,fbm(d*3.6+vec3(4.,uZeit*.008,1.)));",
        " col=mix(col,uNacht*.7,.35*uOb.y); col+=mix(uLila,uMitte,.2)*neb*.7*uOb.y;",
        /* Planet: tiefes All mit Sonne */
        " vec3 so=normalize(vec3(.72,.18,-.66)); float sd=max(dot(d,so),0.);",
        " col=mix(col,uNacht*.6,.55*uOb.z); col+=uLicht*(pow(sd,900.)*3.+pow(sd,60.)*.35+pow(sd,8.)*.12)*uOb.z;",
        /* Polarlicht: klare Nacht */
        " col=mix(col,uNacht*.8,.3*uOb.w);",
        " float sm=uSterne*clamp(1.-uOa.x*.9-uOa.w*.6+uOa.y*.7+uOb.z*.9+uOb.w*.9,0.,2.5);",
        " vec3 g=floor(d*260.); float s=h31(g); vec3 fp=fract(d*260.)-.5;",
        " float stern=step(.985,s)*smoothstep(.5,.0,length(fp))*(.5+.5*sin(uZeit*(1.+s*3.)+s*60.));",
        " vec3 g2=floor(d*520.); float s2=h31(g2+7.); float stern2=step(.975,s2)*smoothstep(.5,.0,length(fract(d*520.)-.5))*.55;",
        " col+=uLicht*(stern*.9+stern2*clamp(uOa.y+uOb.z+uOb.w,0.,1.))*sm;",
        " col=mix(col,uNacht,smoothstep(.55,1.,1.-vorn)*.6);",
        " gl_FragColor=vec4(col,1.);",
        "}",
      ].join("\n"),
    }));
    himmel.renderOrder = -100;
    himmel.frustumCulled = false;
    szene.add(himmel);
    l.himmel = himmel;

    /* 2. Galaxien am Himmel (folgen der Kamera wie der Himmel). */
    const himmelGruppe = new THREE.Group();
    szene.add(himmelGruppe);
    l.himmelGruppe = himmelGruppe;
    function galaxie(anzahl, arme, lage, kipp, groesse, seed) {
      const rr = zufall(seed);
      const pos = new Float32Array(anzahl * 3), rnd = new Float32Array(anzahl);
      for (let i = 0; i < anzahl; i++) {
        const arm = i % arme, rad = Math.pow(rr(), 1.6);
        const w = arm / arme * Math.PI * 2 + rad * 5.2 + (rr() - 0.5) * 0.5 * (1 - rad * 0.5);
        const streu = (rr() - 0.5) * 0.12 * (1 - rad);
        pos[i * 3] = Math.cos(w) * rad * groesse;
        pos[i * 3 + 1] = streu * groesse;
        pos[i * 3 + 2] = Math.sin(w) * rad * groesse;
        rnd[i] = rr();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aR", new THREE.BufferAttribute(rnd, 1));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uLila: { value: F.lila }, uLicht: { value: F.licht }, uPx: { value: 1 }, uA: { value: 1 } },
        vertexShader: "attribute float aR; uniform float uPx; varying float vR; varying float vK; void main(){ vR=aR; vK=length(position.xz); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=(1.+aR*2.2)*uPx; gl_Position=projectionMatrix*mv; }",
        fragmentShader: "uniform vec3 uLila,uLicht; uniform float uA; varying float vR; varying float vK; void main(){ float r=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,r); vec3 c=mix(uLicht,uLila,clamp(vK/60.,0.,1.)); gl_FragColor=vec4(c*a*(.35+vR*.5)*uA,1.); }",
      });
      const p = new THREE.Points(g, m);
      p.position.copy(lage);
      p.rotation.set(kipp[0], kipp[1], kipp[2]);
      p.frustumCulled = false;
      p.renderOrder = -90;
      himmelGruppe.add(p);
      return p;
    }
    l.galaxien = [
      galaxie(16000, 3, new THREE.Vector3(-120, 90, -420), [0.9, 0.2, 0.35], 120, 3),
      galaxie(9000, 2, new THREE.Vector3(230, -60, -380), [1.25, -0.4, -0.2], 70, 9),
      galaxie(7000, 4, new THREE.Vector3(60, 160, 380), [0.4, 0.8, 0.1], 90, 17),
    ];

    /* Positionen entlang der Bahn in gleichen Abstaenden. */
    function entlang(abstand, fn) {
      let last = -1e9, i = 0;
      for (let T = 0; T < DAUER; T += 1 / HZ) {
        const s = probe(b.S, T);
        if (s - last >= abstand) { last = s; fn(T, i++); }
      }
    }

    /* 3. Lichtring-Tunnel. */
    const ringeListe = [];
    entlang(7, function (T, i) { ringeListe.push([T, i]); });
    const ringGeo = new THREE.TorusGeometry(1, 0.010, 6, 160);
    const ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uZeit: { value: 0 } },
      vertexShader: "uniform float uZeit; varying vec3 vC; varying vec2 vUv; varying float vF; " + FADE_GLSL + " void main(){ vUv=uv; vC=vec3(1.); \n#ifdef USE_INSTANCING_COLOR\n vC=instanceColor; \n#endif\n vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vF=fadeD(-mv.z); gl_Position=projectionMatrix*mv; }",
      fragmentShader: "uniform float uZeit; varying vec3 vC; varying vec2 vUv; varying float vF; void main(){ float k=pow(.5+.5*sin(vUv.x*6.2831*3.-uZeit*1.6+vC.r*20.),10.); float k2=pow(.5+.5*sin(vUv.x*6.2831*7.+uZeit*.9),24.); gl_FragColor=vec4(vC*(.35+k*1.6+k2*.8)*vF,1.); }",
    });
    const ringe = new THREE.InstancedMesh(ringGeo, ringMat, ringeListe.length);
    const fc = new THREE.Color();
    ringeListe.forEach(function (e, n) {
      const T = e[0];
      ausrichten(b, T, tmp);
      const rad = 15 + 4 * Math.sin(T * 0.7) + (n % 5 === 0 ? 6 : 0);
      tmp.scale.setScalar(rad);
      tmp.rotateZ(n * 0.37);
      tmp.updateMatrix();
      ringe.setMatrixAt(n, tmp.matrix);
      const st = 0.08 + ortGewicht(b, "tunnel", T) * 1.1 + ortGewicht(b, "kathedrale", T) * 0.2 + ortGewicht(b, "galaxie", T) * 0.25 + gewicht(b, "refrain", T) * 0.15;
      fc.copy(F.lila).lerp(F.licht, n % 3 === 0 ? 0.6 : 0.15).multiplyScalar(st * (n % 5 === 0 ? 1.3 : 0.75));
      ringe.setColorAt(n, fc);
    });
    ringe.frustumCulled = false;
    szene.add(ringe);
    objekte.push(ringe);

    /* 4. Kristalle: Splitter und Facettenkoerper, glaesern. */
    function kristalle(geo, anzahl, seed, lang) {
      const rr = zufall(seed);
      const seeds = new Float32Array(anzahl);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uZeit: { value: 0 }, uLila: { value: F.lila }, uLicht: { value: F.licht }, uTief: { value: F.lilaTief } },
        vertexShader: [
          "attribute float aSeed; uniform float uZeit; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vF; varying float vS;",
          FADE_GLSL,
          "mat3 rotA(vec3 a,float w){a=normalize(a);float s=sin(w),c=cos(w),o=1.-c;return mat3(o*a.x*a.x+c,o*a.x*a.y+a.z*s,o*a.z*a.x-a.y*s, o*a.x*a.y-a.z*s,o*a.y*a.y+c,o*a.y*a.z+a.x*s, o*a.z*a.x+a.y*s,o*a.y*a.z-a.x*s,o*a.z*a.z+c);}",
          "void main(){ vS=aSeed; mat3 R=rotA(vec3(sin(aSeed*31.),cos(aSeed*17.),sin(aSeed*7.)+.2), uZeit*(.05+aSeed*.25)+aSeed*20.);",
          " vec3 p=R*position; vec3 n=R*normal; vC=vec3(1.);",
          "#ifdef USE_INSTANCING_COLOR\n vC=instanceColor;\n#endif",
          " vec4 mv=modelViewMatrix*instanceMatrix*vec4(p,1.); vV=-mv.xyz; vN=normalize(normalMatrix*mat3(instanceMatrix)*n); vF=fadeD(-mv.z);",
          " gl_Position=projectionMatrix*mv; }",
        ].join("\n"),
        fragmentShader: [
          "uniform float uZeit; uniform vec3 uLila,uLicht,uTief; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vF; varying float vS;",
          "void main(){ vec3 N=normalize(vN), V=normalize(vV); float nv=abs(dot(N,V));",
          " float fres=pow(1.-nv,2.4);",
          " vec3 L=normalize(vec3(.4,.8,.5)); float spec=pow(max(dot(reflect(-V,N),L),0.),28.);",
          " float facet=.5+.5*dot(N,normalize(vec3(-.3,.6,.7)));",
          " float glanz=pow(.5+.5*sin(uZeit*1.3+vS*40.),16.);",
          " vec3 c=uTief*.10*facet + uLila*fres*.85 + uLicht*spec*1.4 + uLicht*glanz*fres*.6;",
          " gl_FragColor=vec4(c*vC*vF,1.); }",
        ].join("\n"),
      });
      const mesh = new THREE.InstancedMesh(geo, m, anzahl);
      const c = new THREE.Color();
      for (let i = 0; i < anzahl; i++) {
        const T = rr() * DAUER;
        bahnPunkt(b, T, v);
        const w = rr() * Math.PI * 2, fern = rr() < 0.12;
        const rad = fern ? 60 + rr() * 80 : 16 + rr() * 34;
        tmp.position.set(v.x + Math.cos(w) * rad, v.y + Math.sin(w) * rad, v.z - rr() * 6);
        const sk = fern ? 6 + rr() * 10 : 0.4 + Math.pow(rr(), 2) * 3.2;
        tmp.scale.set(sk, sk * (lang ? 2.2 + rr() * 2.5 : 1), sk);
        tmp.rotation.set(rr() * 6, rr() * 6, rr() * 6);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        const st = 0.3 + ortGewicht(b, "tunnel", T) * 0.3 + ortGewicht(b, "aurora", T) * 0.2 + gewicht(b, "bruecke", T) * 0.2;
        mesh.setColorAt(i, c.setScalar(st));
        seeds[i] = rr();
      }
      geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
      mesh.frustumCulled = false;
      szene.add(mesh);
      objekte.push(mesh);
      return mesh;
    }
    kristalle(new THREE.OctahedronGeometry(1, 0), 520, 41, true);
    kristalle(new THREE.IcosahedronGeometry(1, 0), 300, 43, false);

    /* 5. Strophe: grosse dunkle Flaechen mit feinen Linien. */
    const flaechenListe = [];
    let seite = 1;
    void seite;
    if (flaechenListe.length) {
      const fm = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uFl: { value: F.flaeche }, uLi: { value: F.linie }, uZeit: { value: 0 } },
        vertexShader: "varying vec3 vW; varying vec2 vUv; varying float vF; " + FADE_GLSL + " void main(){ vUv=uv; vec4 w=instanceMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=modelViewMatrix*w; vF=fadeD(-mv.z); gl_Position=projectionMatrix*mv; }",
        fragmentShader: "uniform vec3 uFl,uLi; uniform float uZeit; varying vec3 vW; varying vec2 vUv; varying float vF; void main(){ float l=smoothstep(.86,1.,fract(vUv.x*90.)); float band=step(.62,vUv.x)*step(vUv.x,.92); float kante=smoothstep(.006,0.,abs(vUv.x-.995)); float puls=.6+.4*sin(uZeit*.8+vUv.y*6.); vec3 c=uFl+uLi*l*band*.55*puls+uLi*kante*.9; gl_FragColor=vec4(c,.9*vF*smoothstep(0.,.08,vUv.y)*smoothstep(1.,.92,vUv.y)); }",
      });
      const flaechen = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), fm, flaechenListe.length);
      flaechenListe.forEach(function (e, n) {
        ausrichten(b, e[0], tmp);
        tmp.translateX(e[1] * (15 + hash1(n) * 8));
        tmp.translateY((hash1(n + 3) - 0.5) * 10);
        tmp.rotateY(e[1] * (1.15 + hash1(n + 5) * 0.25));
        tmp.rotateZ(-0.9 + hash1(n + 9) * 0.5);
        tmp.scale.set(70, 160, 1);
        tmp.updateMatrix();
        flaechen.setMatrixAt(n, tmp.matrix);
      });
      flaechen.frustumCulled = false;
      flaechen.renderOrder = -10;
      szene.add(flaechen);
      objekte.push(flaechen);
    }

    /* 6. Staub und Bokeh entlang der Bahn. */
    function staub(anzahl, seed, bokeh) {
      const rr = zufall(seed);
      const pos = new Float32Array(anzahl * 3), rnd = new Float32Array(anzahl * 2);
      for (let i = 0; i < anzahl; i++) {
        let T = rr() * DAUER;
        if (bokeh) for (let k = 0; k < 6 && gewicht(b, "refrain", T) + gewicht(b, "bruecke", T) < 0.5; k++) T = rr() * DAUER;
        bahnPunkt(b, T, v);
        const w = rr() * Math.PI * 2, rad = bokeh ? 6 + rr() * 40 : 3 + Math.pow(rr(), 0.7) * 55;
        pos[i * 3] = v.x + Math.cos(w) * rad; pos[i * 3 + 1] = v.y + Math.sin(w) * rad; pos[i * 3 + 2] = v.z + (rr() - 0.5) * 10;
        rnd[i * 2] = rr(); rnd[i * 2 + 1] = bokeh ? (gewicht(b, "refrain", T) + gewicht(b, "bruecke", T)) : 1;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aR", new THREE.BufferAttribute(rnd, 2));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uZeit: { value: 0 }, uSkala: { value: 500 }, uLila: { value: F.lila }, uLicht: { value: F.licht }, uGr: { value: bokeh ? 3.2 : 0.09 }, uBokeh: { value: bokeh ? 1 : 0 } },
        vertexShader: "attribute vec2 aR; uniform float uZeit,uSkala,uGr; varying float vA; varying float vR; " + FADE_GLSL + " void main(){ vR=aR.x; vec3 p=position+vec3(sin(uZeit*.3+aR.x*30.),cos(uZeit*.25+aR.x*20.),0.)*.6; vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z; vA=fadeD(d)*aR.y*(.5+.5*sin(uZeit*(.8+aR.x*2.)+aR.x*50.)); gl_PointSize=uGr*(.5+aR.x)*uSkala/max(d,.1); gl_Position=projectionMatrix*mv; }",
        fragmentShader: "uniform vec3 uLila,uLicht; uniform float uBokeh; varying float vA; varying float vR; void main(){ float r=length(gl_PointCoord-.5); float a=uBokeh>.5 ? smoothstep(.5,.42,r)*.35+smoothstep(.5,.0,r)*.25 : smoothstep(.5,0.,r); vec3 c=mix(uLila,uLicht,vR); gl_FragColor=vec4(c*a*vA*(uBokeh>.5?.22:1.),1.); }",
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      szene.add(p);
      objekte.push(p);
      return p;
    }
    staub(RUHIG.matches ? 3000 : 9000, 51, false);
    staub(380, 53, true);

    /* 7. Riesige Gitterkoerper, je Liedteil eine andere Form. */
    const teile = [];
    l.zeilen.forEach(function (z, n) {
      if (n === 0 || z.teilBeginn) teile.push({ stil: z.stil, ab: z.ab, bis: DAUER });
      if (teile.length > 1) teile[teile.length - 2].bis = Math.min(teile[teile.length - 2].bis, teile[teile.length - 1].ab);
    });
    const formen = {
      intro: function () { return new THREE.IcosahedronGeometry(1, 2); },
      outro: function () { return new THREE.IcosahedronGeometry(1, 2); },
      strophe: function () { return new THREE.OctahedronGeometry(1, 1); },
      refrain: function () { return new THREE.TorusKnotGeometry(0.7, 0.22, 120, 10, 2, 3); },
      bruecke: function () { return new THREE.DodecahedronGeometry(1, 0); },
    };
    l.giganten = [];
    teile.forEach(function (tl, k) {
      for (let j = 0; j < 2; j++) {
        const T = mix(tl.ab, tl.bis, 0.3 + j * 0.45);
        const geo = new THREE.EdgesGeometry(formen[tl.stil](), 1);
        const m = new THREE.LineBasicMaterial({ color: F.lila.clone().multiplyScalar(tl.stil === "refrain" ? 0.35 : 0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const g = new THREE.LineSegments(geo, m);
        bahnPunkt(b, T + 4, v);
        const w = (k * 1.7 + j * 2.4);
        g.position.set(v.x + Math.cos(w) * 70, v.y + Math.sin(w) * 45 + (tl.stil === "bruecke" ? -30 : 10), v.z - 40);
        g.scale.setScalar(tl.stil === "refrain" ? 42 : 34 + j * 12);
        g.userData.dreh = [0.02 + hash1(k + j) * 0.04, 0.03 + hash1(k * 3 + j) * 0.05];
        g.frustumCulled = false;
        szene.add(g);
        l.giganten.push(g);
        objekte.push(g);
      }
    });

    /* 8. Orb (Strophe), Horizont-Schein, Ringe um die Zeile. */
    const weich = weichTextur();
    l.weich = weich;
    function sprite(farbe, add) { return new THREE.Sprite(new THREE.SpriteMaterial({ map: weich, color: farbe, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 })); }
    l.orb = new THREE.Group();
    l.orbHalo = sprite(F.lila, true); l.orbKern = sprite(F.licht, true);
    l.orb.add(l.orbHalo, l.orbKern);
    szene.add(l.orb);
    l.horizont = sprite(F.lila, true);
    l.horizontKern = sprite(F.licht, true);
    szene.add(l.horizont, l.horizontKern);
    l.zeilenRinge = new THREE.Group();
    [440, 860, 1300].forEach(function (d, i) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(d / 2, 1.2, 4, 180), new THREE.MeshBasicMaterial({ color: F.licht, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.userData.basis = [0.55, 0.38, 0.22][i];
      l.zeilenRinge.add(m);
    });
    szene.add(l.zeilenRinge);

    l.weltObjekte = objekte;
    orteBauen(l);
  }


  /* ------------------------------------------------------
     DIE ORTE DER REISE (je Liedteil einer)
  ------------------------------------------------------ */
  const ROT_GLSL = "mat3 rotA(vec3 a,float w){a=normalize(a);float s=sin(w),c=cos(w),o=1.-c;return mat3(o*a.x*a.x+c,o*a.x*a.y+a.z*s,o*a.z*a.x-a.y*s, o*a.x*a.y-a.z*s,o*a.y*a.y+c,o*a.y*a.z+a.x*s, o*a.z*a.x+a.y*s,o*a.y*a.z-a.x*s,o*a.z*a.z+c);}";
  const FADE_FERN = "float fadeF(float d,float fern){return smoothstep(1.5,9.,d)*(1.-smoothstep(fern*.55,fern,d));}";

  function orteBauen(l) {
    const b = l.bahn, F = l.farben;
    const v = new THREE.Vector3(), v2 = new THREE.Vector3(), tmp = new THREE.Object3D(), rahmen = new THREE.Object3D();
    l.orte = [];
    function zwischen(a, e, abstand, fn) {
      let last = -1e9, i = 0;
      for (let T = Math.max(0, a); T < Math.min(DAUER, e); T += 1 / HZ) {
        const s = probe(b.S, T);
        if (s - last >= abstand) { last = s; fn(T, i++); }
      }
    }
    function basis(extra) { return Object.assign({ uSicht: { value: 0 }, uZeit: { value: 0 }, uLila: { value: F.lila }, uLicht: { value: F.licht }, uTief: { value: F.lilaTief }, uBlau: { value: F.blau }, uFl: { value: F.flaeche }, uLi: { value: F.linie } }, extra || {}); }
    const KOPF = "uniform float uSicht,uZeit; uniform vec3 uLila,uLicht,uTief,uBlau,uFl,uLi;";

    const BAUER = {
      /* Kristallhoehle: Waende aus Splittern, die zur Bahn zeigen. */
      hoehle: function (bl) {
        const rr = zufall(200 + bl.nr), liste = [];
        zwischen(bl.ab - 4, bl.bis + 4, 1.1, function (T) { for (let k = 0; k < 3; k++) liste.push(T); });
        const n = Math.min(1600, liste.length);
        const geo = new THREE.OctahedronGeometry(1, 0);
        const seeds = new Float32Array(n);
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: basis(),
          vertexShader: KOPF + " attribute float aSeed; varying vec3 vN; varying vec3 vV; varying float vF; varying float vS; varying float vH; " + FADE_FERN + " void main(){ vS=aSeed; vH=position.y; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vV=-mv.xyz; vN=normalize(normalMatrix*mat3(instanceMatrix)*normal); vF=fadeF(-mv.z,160.); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying vec3 vN; varying vec3 vV; varying float vF; varying float vS; varying float vH; void main(){ vec3 N=normalize(vN),V=normalize(vV); float fres=pow(1.-abs(dot(N,V)),2.2); float spec=pow(max(dot(reflect(-V,N),normalize(vec3(.3,.9,.4))),0.),24.); float ader=pow(.5+.5*sin(vH*9.-uZeit*2.2+vS*30.),14.); float puls=.7+.3*sin(uZeit*.9+vS*12.); vec3 c=uTief*.22+uLila*fres*1.1*puls+uLicht*spec*1.3+mix(uLila,uLicht,.5)*ader*(.25+fres)*.9; gl_FragColor=vec4(c*vF*uSicht,1.); }",
        });
        const mesh = new THREE.InstancedMesh(geo, m, n);
        for (let i = 0; i < n; i++) {
          const T = liste[Math.floor(i * liste.length / n)];
          bahnPunkt(b, T, v);
          ausrichten(b, T, rahmen);
          const sk = 0.5 + rr() * 1.4, lang = sk * (2 + rr() * 4);
          const w = rr() * Math.PI * 2, rad = 13 + rr() * 12 + lang * 0.7;
          v2.set(Math.cos(w) * rad, Math.sin(w) * rad, (rr() - 0.5) * 4).applyQuaternion(rahmen.quaternion);
          tmp.position.copy(v).add(v2);
          tmp.lookAt(v);
          tmp.rotateX(Math.PI / 2 + (rr() - 0.5) * 0.7);
          tmp.rotateZ((rr() - 0.5) * 0.6);
          tmp.scale.set(sk, lang, sk * (0.6 + rr() * 0.6));
          tmp.updateMatrix();
          mesh.setMatrixAt(i, tmp.matrix);
          seeds[i] = rr();
        }
        geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
        return [mesh];
      },

      /* Galaxie: die Bahn fliegt schraeg durch die Scheibe. */
      galaxie: function (bl) {
        const rr = zufall(300 + bl.nr), n = RUHIG.matches ? 9000 : 30000;
        const mitte = (bl.ab + bl.bis) / 2;
        ausrichten(b, mitte, rahmen);
        const pol = new Float32Array(n * 3), rnd = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const kern = i < n * 0.12;
          const rad = kern ? Math.pow(rr(), 2) * 30 : 12 + Math.pow(rr(), 0.8) * 190;
          const arm = (i % 3) / 3 * Math.PI * 2;
          const w = kern ? rr() * Math.PI * 2 : arm + Math.log(rad + 1) * 2.6 + (rr() - 0.5) * (0.5 + 18 / (rad + 6));
          const hh = (rr() - 0.5) * (kern ? 16 : 5) * Math.exp(-rad / 120);
          pol[i * 3] = rad; pol[i * 3 + 1] = w; pol[i * 3 + 2] = hh;
          rnd[i] = rr();
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pol, 3));
        g.setAttribute("aR", new THREE.BufferAttribute(rnd, 1));
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: basis({ uSkala: { value: 500 } }),
          vertexShader: KOPF + " uniform float uSkala; attribute float aR; varying float vA; varying float vR; " + FADE_FERN + " void main(){ float r=position.x; float w=position.y+uZeit*.6/(r*.08+1.); vec3 p=vec3(cos(w)*r,position.z,sin(w)*r); vR=r; vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z; vA=fadeF(d,420.)*(.35+aR*.65)*(.75+.25*sin(uZeit*2.+aR*80.)); gl_PointSize=(.25+aR*.55)*uSkala/max(d,.5); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying float vA; varying float vR; void main(){ float q=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,q)*vA; vec3 c=mix(uLicht,mix(uLila,uBlau*1.6,smoothstep(80.,190.,vR)),smoothstep(6.,60.,vR)); gl_FragColor=vec4(c*a*uSicht,1.); }",
        });
        const p = new THREE.Points(g, m);
        p.position.copy(rahmen.position);
        p.quaternion.copy(rahmen.quaternion);
        p.rotateX(1.15); p.rotateZ(0.5);
        const kern = new THREE.Sprite(new THREE.SpriteMaterial({ map: l.weich || weichTextur(), color: F.licht, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
        kern.position.copy(p.position); kern.scale.setScalar(90);
        kern.onBeforeRender = function () { kern.material.opacity = 0.55 * (m.uniforms.uSicht.value); };
        return [p, kern];
      },

      /* Gebirge aus Licht unter der Bahn, ein Tal fuer die Kamera. */
      landschaft: function (bl) {
        const s0 = probe(b.S, bl.ab) - 80, s1 = probe(b.S, bl.bis) + 160;
        const len = s1 - s0, mitte = (bl.ab + bl.bis) / 2;
        bahnPunkt(b, mitte, v);
        let minY = 1e9;
        for (let T = bl.ab; T < bl.bis; T += 0.5) minY = Math.min(minY, probe(b.Y, T));
        const geo = new THREE.PlaneGeometry(520, len, RUHIG.matches ? 90 : 180, Math.min(400, Math.ceil(len / 3)));
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: basis(),
          vertexShader: KOPF + NOISE + " varying vec3 vL; varying float vHh; varying float vF; " + FADE_FERN + " void main(){ vec3 p=position; float tal=smoothstep(14.,150.,abs(p.x)); float n=fbm(vec3(p.x*.018,p.y*.018,1.7)); float h=n*(4.+95.*tal*tal)+sin(p.y*.05+uZeit*.4)*1.2*(1.-tal); p.z+=h; vL=p; vHh=h; vec4 mv=modelViewMatrix*vec4(p,1.); vF=fadeF(-mv.z,300.); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying vec3 vL; varying float vHh; varying float vF; float lin(float x,float w){float f=abs(fract(x)-.5);return smoothstep(w,0.,f-(.5-w));} void main(){ float g=max(lin(vL.x/7.,.04),lin(vL.y/7.,.04)); float hl=lin(vHh/6.,.05); float spitze=smoothstep(40.,90.,vHh); float fluss=smoothstep(10.,0.,abs(vL.x))*(.5+.5*sin(vL.y*.3+uZeit*2.)); vec3 c=uTief*.08+uLila*g*(.18+vHh/120.)+uLicht*hl*.18*(.3+spitze)+uLicht*spitze*.12+mix(uLila,uLicht,.6)*fluss*.35; gl_FragColor=vec4(c*vF*uSicht,1.); }",
        });
        const mesh = new THREE.Mesh(geo, m);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(v.x, minY - 20, -(s0 + s1) / 2);
        return [mesh];
      },

      /* Stadt aus Monolithen mit Lichtlinien, Bruecken ueber der Bahn. */
      stadt: function (bl) {
        const rr = zufall(500 + bl.nr), liste = [];
        zwischen(bl.ab - 4, bl.bis + 4, 9, function (T) { liste.push(T); });
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: true, uniforms: basis(),
          vertexShader: KOPF + " varying vec3 vW; varying vec2 vUv; varying float vF; " + FADE_FERN + " void main(){ vUv=uv; vec4 w=instanceMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=modelViewMatrix*w; vF=fadeF(-mv.z,220.); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying vec3 vW; varying vec2 vUv; varying float vF; float h3(vec3 p){p=fract(p*.3183+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));} void main(){ float boden=smoothstep(.9,1.,fract(vW.y*.45)); vec3 zelle=floor(vec3(vW.x*.7,vW.y*.45,vW.z*.7)); float an=step(.9,h3(zelle))*(.6+.4*sin(uZeit*(1.+h3(zelle+3.)*3.)+h3(zelle)*40.)); vec2 e=min(vUv,1.-vUv); float kante=smoothstep(.02,0.,min(e.x,e.y)); float scan=smoothstep(.97,1.,fract(vW.y*.02-uZeit*.12)); vec3 c=uFl*.9+uLi*boden*.35+mix(uLila,uLicht,.4)*an*.8+uLi*kante*.9+uLicht*scan*.35; gl_FragColor=vec4(c*uSicht,.96*vF*uSicht); }",
        });
        const n = liste.length * 4;
        const mesh = new THREE.InstancedMesh(geo, m, n);
        let i = 0;
        liste.forEach(function (T, k) {
          ausrichten(b, T, rahmen);
          for (let j = 0; j < 4; j++) {
            tmp.position.copy(rahmen.position);
            tmp.quaternion.copy(rahmen.quaternion);
            if (j === 3 && k % 3 === 0) {
              tmp.translateY(13 + rr() * 8);
              tmp.scale.set(90, 1.2 + rr() * 2, 3 + rr() * 4);
            } else {
              const seite = j % 2 === 0 ? 1 : -1;
              const hoch = 25 + Math.pow(rr(), 1.5) * 140;
              tmp.translateX(seite * (16 + rr() * 34));
              tmp.translateY(-34 + hoch / 2);
              tmp.translateZ((rr() - 0.5) * 8);
              tmp.rotateY((rr() - 0.5) * 0.4);
              tmp.scale.set(4 + rr() * 11, hoch, 4 + rr() * 11);
            }
            tmp.updateMatrix();
            mesh.setMatrixAt(i++, tmp.matrix);
          }
        });
        mesh.count = i;
        return [mesh];
      },

      /* Kathedrale: Boegen aus Licht, Saeulen, Lichtfluss in den Rippen. */
      kathedrale: function (bl) {
        const liste = [];
        zwischen(bl.ab - 4, bl.bis + 4, 11, function (T) { liste.push(T); });
        const sh = {
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: basis(),
          vertexShader: KOPF + " varying vec2 vUv; varying float vF; varying float vI; " + FADE_FERN + " void main(){ vUv=uv; vI=float(gl_InstanceID); vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vF=fadeF(-mv.z,230.); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying vec2 vUv; varying float vF; varying float vI; void main(){ float k=pow(.5+.5*sin(vUv.x*40.-uZeit*3.+vI*.7),12.); float rippe=smoothstep(.3,0.,abs(vUv.y-.5)); vec3 c=uTief*.35+uLila*(.35+rippe*.6)+uLicht*k*1.2; gl_FragColor=vec4(c*vF*uSicht*.8,1.); }",
        };
        const bogenGeo = new THREE.TorusGeometry(1, 0.03, 8, 96, Math.PI);
        const saeuleGeo = new THREE.CylinderGeometry(1, 1.25, 1, 12, 1, true);
        const boegen = new THREE.InstancedMesh(bogenGeo, new THREE.ShaderMaterial(sh), liste.length * 2);
        const saeulen = new THREE.InstancedMesh(saeuleGeo, new THREE.ShaderMaterial(Object.assign({}, sh, { uniforms: basis() })), liste.length * 2);
        liste.forEach(function (T, k) {
          ausrichten(b, T, rahmen);
          [[30, -12], [44, -18]].forEach(function (d, j) {
            if (j === 1 && k % 2) { tmp.scale.setScalar(0); tmp.updateMatrix(); boegen.setMatrixAt(k * 2 + j, tmp.matrix); return; }
            tmp.position.copy(rahmen.position); tmp.quaternion.copy(rahmen.quaternion);
            tmp.translateY(d[1]); tmp.translateZ(j * -5.5);
            tmp.rotateZ(-(probe(b.R, T)));
            tmp.scale.set(d[0], d[0] * 1.25, d[0]);
            tmp.updateMatrix();
            boegen.setMatrixAt(k * 2 + j, tmp.matrix);
          });
          [-1, 1].forEach(function (seite, j) {
            tmp.position.copy(rahmen.position); tmp.quaternion.copy(rahmen.quaternion);
            tmp.rotateZ(-(probe(b.R, T)));
            tmp.translateX(seite * 30); tmp.translateY(-12 - 35);
            tmp.scale.set(1.3, 70, 1.3);
            tmp.updateMatrix();
            saeulen.setMatrixAt(k * 2 + j, tmp.matrix);
          });
        });
        return [boegen, saeulen];
      },

      /* Truemmerfeld: dunkle Felsbrocken, vom lila Licht gestreift. */
      truemmer: function (bl) {
        const rr = zufall(700 + bl.nr), n = 750;
        let geo = new THREE.IcosahedronGeometry(1, 1);
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i);
          const k = 0.72 + 0.5 * hash1(Math.round(v.x * 13) * 7 + Math.round(v.y * 13) * 13 + Math.round(v.z * 13) * 17);
          pa.setXYZ(i, v.x * k, v.y * k, v.z * k);
        }
        geo = geo.index ? geo.toNonIndexed() : geo;
        geo.computeVertexNormals();
        const seeds = new Float32Array(n);
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: true, uniforms: basis(),
          vertexShader: KOPF + ROT_GLSL + " attribute float aSeed; varying vec3 vN; varying vec3 vV; varying float vF; " + FADE_FERN + " void main(){ mat3 R=rotA(vec3(sin(aSeed*31.),cos(aSeed*17.),.3),uZeit*(.04+aSeed*.2)+aSeed*20.); vec4 mv=modelViewMatrix*instanceMatrix*vec4(R*position,1.); vV=-mv.xyz; vN=normalize(normalMatrix*mat3(instanceMatrix)*(R*normal)); vF=fadeF(-mv.z,200.); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying vec3 vN; varying vec3 vV; varying float vF; void main(){ vec3 N=normalize(vN),V=normalize(vV); vec3 L=normalize((viewMatrix*vec4(.6,.5,-.4,0.)).xyz); float d=max(dot(N,L),0.); float rim=pow(1.-max(dot(N,V),0.),3.); vec3 c=uFl*.55+uLila*d*.55+uLicht*pow(d,8.)*.35+uLila*rim*.8; gl_FragColor=vec4(c*uSicht,vF*uSicht); }",
        });
        const mesh = new THREE.InstancedMesh(geo, m, n);
        for (let i = 0; i < n; i++) {
          const T = mix(bl.ab - 3, bl.bis + 3, rr());
          ausrichten(b, T, rahmen);
          const w = rr() * Math.PI * 2, rad = 15 + Math.pow(rr(), 0.7) * 65;
          tmp.position.copy(rahmen.position); tmp.quaternion.copy(rahmen.quaternion);
          tmp.translateX(Math.cos(w) * rad); tmp.translateY(Math.sin(w) * rad); tmp.translateZ((rr() - 0.5) * 8);
          tmp.rotation.set(rr() * 6, rr() * 6, rr() * 6);
          const sk = 0.3 + Math.pow(rr(), 3) * (rad > 30 ? 14 : 5);
          tmp.scale.set(sk * (0.8 + rr() * 0.5), sk * (0.7 + rr() * 0.4), sk);
          tmp.updateMatrix();
          mesh.setMatrixAt(i, tmp.matrix);
          seeds[i] = rr();
        }
        geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
        return [mesh];
      },

      /* Ringplanet: die Bahn fuehrt mitten durch den Ring. */
      planet: function (bl) {
        const rr = zufall(800 + bl.nr), mitte = (bl.ab + bl.bis) / 2;
        ausrichten(b, mitte, rahmen);
        const zentrum = new THREE.Object3D();
        zentrum.position.copy(rahmen.position); zentrum.quaternion.copy(rahmen.quaternion);
        zentrum.translateX(290); zentrum.translateY(-70); zentrum.translateZ(-120);
        const kugel = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 64), new THREE.ShaderMaterial({
          transparent: true, uniforms: basis(),
          vertexShader: KOPF + " varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + NOISE + " varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vec3 N=normalize(vN),V=normalize(vV); vec3 L=normalize((viewMatrix*vec4(-.8,.4,.5,0.)).xyz); float d=smoothstep(-.15,.6,dot(N,L)); vec3 q=vP/150.; float band=fbm(vec3(q.y*7.+fbm(q*3.+uZeit*.01)*1.6,q.x*.6,q.z*.6)); vec3 c=mix(uBlau*.55,uLila*.9,band); c=mix(c,uLicht*.8,smoothstep(.7,.95,band)*.5); float rim=pow(1.-max(dot(N,V),0.),3.); c=c*d+uLila*rim*1.1*(.3+d); gl_FragColor=vec4(c*uSicht,uSicht); }",
        }));
        kugel.position.copy(zentrum.position);
        kugel.rotation.set(0.3, 0, 0.25);
        const n = RUHIG.matches ? 8000 : 26000;
        const pol = new Float32Array(n * 3), rnd = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let rad = 200 + rr() * 200;
          if (rad > 285 && rad < 300) rad += 18;      // Luecke im Ring
          pol[i * 3] = rad; pol[i * 3 + 1] = rr() * Math.PI * 2; pol[i * 3 + 2] = (rr() - 0.5) * 2.4;
          rnd[i] = rr();
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pol, 3));
        g.setAttribute("aR", new THREE.BufferAttribute(rnd, 1));
        const ring = new THREE.Points(g, new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: basis({ uSkala: { value: 500 } }),
          vertexShader: KOPF + " uniform float uSkala; attribute float aR; varying float vA; varying float vR; " + FADE_FERN + " void main(){ float r=position.x; float w=position.y+uZeit*12./r; vec3 p=vec3(cos(w)*r,position.z,sin(w)*r); vR=r; vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z; float band=.55+.45*sin(r*.35)*sin(r*.11); vA=fadeF(d,700.)*band*(.4+aR*.6); gl_PointSize=(.35+aR*1.1)*uSkala/max(d,.5); gl_Position=projectionMatrix*mv; }",
          fragmentShader: KOPF + " varying float vA; varying float vR; void main(){ float q=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,q)*vA; gl_FragColor=vec4(mix(uLila,uLicht,smoothstep(200.,400.,vR))*a*uSicht,1.); }",
        }));
        /* Ringebene so drehen, dass die Bahn durch den Ring fuehrt. */
        ring.position.copy(zentrum.position);
        ring.quaternion.copy(rahmen.quaternion);
        ring.rotateZ(0.12);
        return [kugel, ring];
      },

      /* Polarlicht: Vorhaenge aus Licht links, rechts und oben. */
      aurora: function (bl) {
        const objs = [];
        [[-1, 26, 0], [1, 34, 4], [-1, 52, 10], [1, 60, -6], [0, 0, 30]].forEach(function (cfg, k) {
          const pts = [];
          for (let T = bl.ab - 4; T < bl.bis + 4; T += 0.12) pts.push(T);
          const nV = pts.length * 2;
          const pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
          pts.forEach(function (T, i) {
            ausrichten(b, T, rahmen);
            for (let j = 0; j < 2; j++) {
              tmp.position.copy(rahmen.position); tmp.quaternion.copy(rahmen.quaternion);
              tmp.rotateZ(-probe(b.R, T));
              if (cfg[0] === 0) { tmp.translateY(cfg[2]); tmp.translateX(j ? 60 : -60); }
              else { tmp.translateX(cfg[0] * cfg[1]); tmp.translateY(cfg[2] - 30 + j * 75); }
              const o = (i * 2 + j) * 3;
              pos[o] = tmp.position.x; pos[o + 1] = tmp.position.y; pos[o + 2] = tmp.position.z;
              uv[(i * 2 + j) * 2] = i / (pts.length - 1); uv[(i * 2 + j) * 2 + 1] = j;
            }
          });
          const idx = [];
          for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          g.setIndex(idx);
          const lang = pts.length * 0.12;
          const m = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: basis({ uLang: { value: lang }, uK: { value: k } }),
            vertexShader: KOPF + " uniform float uK; varying vec2 vUv; varying float vF; " + FADE_FERN + " void main(){ vUv=uv; vec3 p=position; p.x+=sin(uv.x*90.+uZeit*.5+uK)*3.5*uv.y; p.y+=sin(uv.x*50.-uZeit*.3)*2.; vec4 mv=modelViewMatrix*vec4(p,1.); vF=fadeF(-mv.z,240.); gl_Position=projectionMatrix*mv; }",
            fragmentShader: KOPF + NOISE + " uniform float uLang,uK; varying vec2 vUv; varying float vF; void main(){ float x=vUv.x*uLang; float f=fbm(vec3(x*.35,uZeit*.15,uK)); float strahl=pow(n3(vec3(x*2.2,vUv.y*.6,uZeit*.4+uK)),3.)*1.6; float vert=smoothstep(0.,.18,vUv.y)*pow(1.-vUv.y,1.4); float a=(f*.7+strahl)*vert; vec3 c=mix(uBlau*1.4,mix(uLila,uLicht,smoothstep(.5,1.,vUv.y)),smoothstep(.0,.6,vUv.y)); gl_FragColor=vec4(c*a*vF*uSicht*.75,1.); }",
          });
          objs.push(new THREE.Mesh(g, m));
        });
        return objs;
      },
    };

    /* Portale: an jedem Ortswechsel ein Tor, durch das die Kamera fliegt. */
    l.portale = [];
    b.bloecke.forEach(function (bl) {
      if (bl.nr === 0) return;
      const rr = zufall(900 + bl.nr);
      const tor = new THREE.Group();
      ausrichten(b, bl.ab, tor);
      tor.rotateZ(-probe(b.R, bl.ab) + rr() * 0.6);
      const u = basis({ uOffen: { value: 0 }, uSeed: { value: rr() * 10 } });
      const scheibe = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: u,
        vertexShader: KOPF + " varying vec2 vP; varying float vD; void main(){ vP=position.xy; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }",
        fragmentShader: KOPF + NOISE + " uniform float uOffen,uSeed; varying vec2 vP; varying float vD; void main(){ float r=length(vP)/max(uOffen,.001); float a=atan(vP.y,vP.x); float w=a+r*5.-uZeit*1.6; vec3 q=vec3(cos(w)*r*2.6,sin(w)*r*2.6,uZeit*.25+uSeed); float sw=fbm(q+fbm(q*2.)*.8); float innen=smoothstep(.28,.92,r)*(1.-smoothstep(.93,.99,r)); float rand=exp(-pow((r-.95)*34.,2.)); float glut=exp(-pow((r-.95)*7.,2.)); float halo=step(1.,r)*exp(-(r-1.)*5.); float ticks=step(1.06,r)*step(r,1.11)*step(.55,fract(a*9.549+uZeit*.15)); float ticks2=step(1.17,r)*step(r,1.19)*step(.8,fract(-a*4.77+uZeit*.08)); vec3 c=mix(uLila,uLicht,smoothstep(.45,.85,sw))*innen*pow(sw,1.6)*1.9+uLicht*rand*1.7+uLila*glut*.7+uLila*halo*.35+mix(uLila,uLicht,.5)*(ticks*.55+ticks2*.4); float nah=smoothstep(.6,6.,vD); gl_FragColor=vec4(c*uSicht*nah,1.); }",
      }));
      const n = RUHIG.matches ? 900 : 2600;
      const at = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { at[i * 3] = rr() * Math.PI * 2; at[i * 3 + 1] = rr(); at[i * 3 + 2] = rr(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(at, 3));
      const funken = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: Object.assign(u, { uSkala: { value: 500 } }),
        vertexShader: KOPF + " uniform float uSkala,uOffen; varying float vA; void main(){ float f=fract(position.y+uZeit*(.18+position.z*.25)); float r=mix(1.9,.95,f)*uOffen; float w=position.x+f*(2.5+position.z*2.)+uZeit*.2; vec3 p=vec3(cos(w)*r,sin(w)*r,(1.-f)*(position.z-.5)*1.4); vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z; vA=sin(f*3.14159)*(.4+position.z*.6)*smoothstep(.6,6.,d); gl_PointSize=(.6+position.z*1.4)*uSkala/max(d,.5)*.06; gl_Position=projectionMatrix*mv; }",
        fragmentShader: KOPF + " varying float vA; void main(){ float q=length(gl_PointCoord-.5); gl_FragColor=vec4(mix(uLila,uLicht,.6)*smoothstep(.5,0.,q)*vA*uSicht,1.); }",
      }));
      tor.add(scheibe, funken);
      tor.scale.setScalar(13 + rr() * 3);
      [scheibe, funken].forEach(function (o) { o.frustumCulled = false; o.renderOrder = 50; });
      tor.visible = false;
      l.szene.add(tor);
      l.portale.push({ bl: bl, tor: tor, u: u, mats: [scheibe.material, funken.material] });
    });

    b.bloecke.forEach(function (bl) {
      const f = BAUER[bl.ort];
      if (!f) return;
      const objs = f(bl);
      objs.forEach(function (o) { o.frustumCulled = false; o.visible = false; l.szene.add(o); });
      l.orte.push({ bl: bl, objs: objs });
    });
  }

  /* ------------------------------------------------------
     SCHRIFT
  ------------------------------------------------------ */
  const STIL_SCHRIFT = {
    intro: { gew: 500, gr: 54, lh: 1.3, sp: 0.2, gross: true, kursiv: false, breite: 1500 },
    outro: { gew: 500, gr: 54, lh: 1.3, sp: 0.2, gross: true, kursiv: false, breite: 1500 },
    strophe: { gew: 600, gr: 112, lh: 1.12, sp: -0.012, gross: false, kursiv: false, breite: 1300 },
    refrain: { gew: 600, gr: 100, lh: 1.15, sp: -0.01, gross: false, kursiv: false, breite: 1500 },
    bruecke: { gew: 400, gr: 78, lh: 1.2, sp: 0, gross: false, kursiv: true, breite: 1500 },
  };
  const TIEFE_FARBEN = [0xd9d3ff, 0xc4bbfb, 0xada2f2, 0x978be6, 0x8175d8, 0x6c60c6, 0x5d50b8];
  const AUFL = 2;      // Texturaufloesung je CSS-Pixel

  /* Jeder Ort hat seine eigene Schrift. */
  const ORT_SCHRIFT = {
    tunnel: { fam: "Inter" },
    hoehle: { fam: "'Cormorant Garamond'", w: 500, wB: 700, kursiv: true, gr: 1.18, sp: 0.01 },
    galaxie: { fam: "'Space Grotesk'", w: 500, wB: 700, gr: 1, sp: -0.02 },
    landschaft: { fam: "'Playfair Display'", w: 400, wB: 700, gr: 1 },
    stadt: { fam: "'Bebas Neue'", w: 400, wB: 400, gross: true, kursiv: false, gr: 1.3, sp: 0.03 },
    kathedrale: { fam: "Cinzel", w: 500, wB: 700, gross: true, kursiv: false, gr: 0.82, sp: 0.06 },
    truemmer: { fam: "Syne", w: 600, wB: 800, kursiv: false, gr: 0.95, sp: -0.01 },
    planet: { fam: "Unbounded", w: 400, wB: 700, kursiv: false, gr: 0.74, sp: 0 },
    aurora: { fam: "'Josefin Sans'", w: 300, wB: 600, gross: true, kursiv: false, gr: 0.78, sp: 0.14 },
  };
  /* Selbst gehostet statt Google Fonts (DSGVO, wie Inter und Oswald). */
  const SCHRIFT_URL = "assets/fonts/lied-fonts.css";
  function schriftenLaden() {
    if (!document.querySelector('link[data-fh-lied-schriften]')) {
      const ln = document.createElement("link");
      ln.rel = "stylesheet"; ln.href = SCHRIFT_URL; ln.setAttribute("data-fh-lied-schriften", "");
      document.head.appendChild(ln);
    }
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const liste = ["500 54px Inter", "600 112px Inter", "700 112px Inter", "400 78px Inter", "italic 400 78px Inter"];
    Object.keys(ORT_SCHRIFT).forEach(function (k) {
      const o = ORT_SCHRIFT[k];
      if (!o.w) return;
      [o.w, o.wB].forEach(function (w) { liste.push(w + " 80px " + o.fam); if (o.kursiv !== false) liste.push("italic " + w + " 80px " + o.fam); });
    });
    const alle = Promise.all(liste.map(function (f) { return document.fonts.load(f).catch(function () {}); }));
    return Promise.race([alle, new Promise(function (ok) { setTimeout(ok, 3500); })]);
  }
  function ortVon(b, T) {
    for (let i = 0; i < b.bloecke.length; i++) if (T < b.bloecke[i].bis) return b.bloecke[i].ort;
    return b.bloecke[b.bloecke.length - 1].ort;
  }

  function wortStil(sf, os, stil, betont) {
    let gew = os.w || sf.gew, kursiv = os.kursiv == null ? sf.kursiv : os.kursiv, gr = sf.gr;
    if (betont) {
      gr *= (stil === "intro" || stil === "outro") ? 1.25 : 1.22;
      gew = os.wB || (stil === "intro" || stil === "outro" ? 600 : stil === "bruecke" ? 600 : 700);
      if (stil === "bruecke" && os.kursiv == null) kursiv = false;
    }
    return { font: (kursiv ? "italic " : "") + gew + " " + gr + "px " + os.fam + ", Inter, ui-sans-serif, system-ui, sans-serif", gr: gr, sp: os.sp != null ? os.sp : sf.sp };
  }

  const _mess = document.createElement("canvas").getContext("2d");
  function wortBreite(text, ws) {
    _mess.font = ws.font;
    if (!ws.sp) return _mess.measureText(text).width;
    let w = 0;
    for (const ch of text) w += _mess.measureText(ch).width + ws.sp * ws.gr;
    return w - ws.sp * ws.gr;
  }

  function wortTextur(text, ws, F) {
    const pad = Math.ceil(ws.gr * 0.42);
    const w = Math.ceil(wortBreite(text, ws) + pad * 2), h = Math.ceil(ws.gr * 1.45 + pad * 2);
    const c = document.createElement("canvas");
    c.width = w * AUFL; c.height = h * AUFL;
    const x = c.getContext("2d");
    x.scale(AUFL, AUFL);
    x.font = ws.font;
    x.textBaseline = "middle";
    function zeichnen() {
      if (!ws.sp) { x.fillText(text, pad, h / 2); return; }
      let px = pad;
      for (const ch of text) { x.fillText(ch, px, h / 2); px += x.measureText(ch).width + ws.sp * ws.gr; }
    }
    x.fillStyle = "#ffffff";
    x.shadowColor = cssFarbe(F.lila, 0.55);
    x.shadowBlur = 22 * AUFL;
    zeichnen();
    x.shadowBlur = 0;
    x.shadowColor = "transparent";
    zeichnen();
    return { canvas: c, w: w, h: h, pad: pad };
  }

  const WORT_VS = "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }";
  const WORT_FS = [
    "uniform sampler2D map; uniform float uRv,uOut,uZeit,uGlitch,uShine,uNeu,uSchicht; uniform vec3 uTint,uLila,uSchichtFarbe; uniform vec2 uAsp; varying vec2 vUv;",
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
    "void main(){",
    " vec2 uv=vUv; float fr=floor(uZeit*24.); float sl=floor(uv.y*14.);",
    " uv.x+=(h(vec2(sl,fr))-.5)*uGlitch*.09*step(.6,h(vec2(sl*3.1,fr)));",
    " float ca=uGlitch*.02;",
    " vec4 t=texture2D(map,uv);",
    " float nz=n2(uv*uAsp*5.)*.65+n2(uv*uAsp*16.)*.35;",
    " float cut=uOut*1.1;",
    " float keep=smoothstep(cut-.03,cut+.03,nz);",
    " float rand=smoothstep(.1,0.,abs(nz-cut))*step(.001,uOut);",
    " if(uSchicht>.5){ float core=smoothstep(.6,.9,t.a); gl_FragColor=vec4(uSchichtFarbe,core*uRv*keep); return; }",
    " vec4 tr=texture2D(map,uv+vec2(ca,0.)), tb=texture2D(map,uv-vec2(ca,0.));",
    " vec3 tint=mix(uTint,uLila,uNeu);",
    " vec3 col=vec3(tr.r*tint.r,t.g*tint.g,tb.b*tint.b);",
    " float a=max(t.a,max(tr.a,tb.a)*step(.001,ca));",
    " float sh=smoothstep(.07,0.,abs(vUv.x+(vUv.y-.5)*.4-uShine))*smoothstep(.5,.9,t.a);",
    " col+=vec3(sh*.85);",
    " col=mix(col,uLila*1.6+.3,rand);",
    " a=max(a*keep,rand*smoothstep(.2,.7,t.a));",
    " gl_FragColor=vec4(col,a*uRv);",
    "}",
  ].join("\n");

  const FUNK_VS = [
    "attribute vec3 aStart; attribute vec4 aRnd; uniform float uIn,uOut,uZeit,uGr,uSkala,uWeit; varying float vA; varying float vM;",
    "void main(){",
    " float d=aRnd.x*.35; float k=clamp((uIn-d)/.65,0.,1.); float e=1.-pow(1.-k,3.);",
    " vec3 p=mix(position+aStart,position,e);",
    " float o=clamp(uOut*1.35-aRnd.w*.35,0.,1.);",
    " vec3 dir=normalize(vec3(aRnd.y-.5,aRnd.z-.45,.35+aRnd.w));",
    " p+=dir*o*o*uWeit + vec3(sin(uZeit*3.+aRnd.y*40.),cos(uZeit*2.6+aRnd.z*40.),0.)*uGr*.6*(1.-e*.7);",
    " vec4 mv=modelViewMatrix*vec4(p,1.);",
    " float basis=smoothstep(0.,.08,k)*mix(1.,.16,e);",
    " vA=basis*(1.-o)+sin(o*3.14159)*1.3; vM=e;",
    " gl_PointSize=uGr*(.55+aRnd.y*.9)*(1.+o*1.8)*uSkala/max(-mv.z,.1);",
    " gl_Position=projectionMatrix*mv;",
    "}",
  ].join("\n");
  const FUNK_FS = "uniform vec3 uLila,uLicht; varying float vA; varying float vM; void main(){ float r=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,r)*vA; gl_FragColor=vec4(mix(uLila,uLicht,.35+vM*.4)*a,1.); }";

  function zeileBauen(l, z) {
    const F = l.farben, b = l.bahn, ruhig = RUHIG.matches;
    const gruppe = new THREE.Group();
    ausrichten(b, z.pass, gruppe);
    const s0 = probe(b.S, z.ab), s1 = probe(b.S, z.pass);
    const dist = Math.max(5, s1 - s0);
    const sichtW = 2 * dist * Math.tan((FOV * Math.PI) / 360) * ASPEKT;
    const k = sichtW / 1920;                          // Welt-Einheiten je Buehnen-Pixel
    const os = ORT_SCHRIFT[ortVon(b, z.ab)] || ORT_SCHRIFT.tunnel;
    const sf = Object.assign({}, STIL_SCHRIFT[z.stil]);
    sf.gr *= os.gr || 1;
    if (os.gross != null) sf.gross = os.gross || sf.gross;
    const r = zufall(z.nr + 101);

    /* Zeilen umbrechen wie flex-wrap, Wortabstand .3em. */
    const reihen = [];
    z.reihen.forEach(function (reihe) {
      let akt = [], breite = 0;
      reihe.forEach(function (w) {
        const ws = wortStil(sf, os, z.stil, w.betont);
        const text = sf.gross ? w.w.toUpperCase() : w.w;
        const bw = wortBreite(text, ws);
        const gap = sf.gr * 0.3;
        if (akt.length && breite + gap + bw > sf.breite) { reihen.push({ w: akt, b: breite }); akt = []; breite = 0; }
        breite += (akt.length ? gap : 0) + bw;
        akt.push({ text: text, ws: ws, bw: bw, betont: w.betont });
      });
      if (akt.length) reihen.push({ w: akt, b: breite });
    });
    const zeilenH = sf.gr * sf.lh * 1.08;
    const gesamtH = reihen.length * zeilenH;
    const versatzX = z.x * 0.55, versatzY = z.y * 0.5;
    const woerterListe = [];
    let idx = 0;
    const budget = ruhig ? 0 : 2600;
    const anzahl = z.anzahl;
    reihen.forEach(function (reihe, ri) {
      let px = -reihe.b / 2;
      const py = gesamtH / 2 - zeilenH * (ri + 0.5);
      reihe.w.forEach(function (w) {
        const tx = wortTextur(w.text, w.ws, F);
        const tex = new THREE.CanvasTexture(tx.canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        const geo = new THREE.PlaneGeometry(tx.w * k, tx.h * k);
        const tint = (w.betont && z.stil === "strophe") ? F.lila : F.licht;
        const wort = new THREE.Group();
        wort.position.set((px + w.bw / 2 + versatzX) * k, (py + versatzY) * k, 0);
        const mats = [];
        function mat(schicht, schichtFarbe) {
          const m = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, vertexShader: WORT_VS, fragmentShader: WORT_FS,
            uniforms: {
              map: { value: tex }, uRv: { value: 0 }, uOut: { value: 0 }, uZeit: { value: 0 }, uGlitch: { value: 0 }, uShine: { value: -1 }, uNeu: { value: 1 },
              uSchicht: { value: schicht ? 1 : 0 }, uTint: { value: tint }, uLila: { value: F.lila }, uSchichtFarbe: { value: farbe(schichtFarbe || 0) },
              uAsp: { value: new THREE.Vector2(tx.w / tx.h, 1) },
            },
          });
          mats.push(m);
          return m;
        }
        /* Echte Tiefe: gestapelte Ebenen dahinter (wie der alte
           text-shadow von .ist-tief, nur im Raum). */
        const tiefe = ruhig ? 0 : TIEFE_FARBEN.length;
        const schritt = w.ws.gr * k * 0.022;
        for (let i = tiefe - 1; i >= 0; i--) {
          const m = new THREE.Mesh(geo, mat(true, TIEFE_FARBEN[i]));
          m.position.z = -(i + 1) * schritt;
          m.renderOrder = 20 + (tiefe - i);
          wort.add(m);
        }
        const vorn = new THREE.Mesh(geo, mat(false));
        vorn.renderOrder = 40;
        wort.add(vorn);

        /* Partikel aus der Buchstabenform. */
        let funken = null;
        if (budget) {
          const ctx = tx.canvas.getContext("2d");
          const daten = ctx.getImageData(0, 0, tx.canvas.width, tx.canvas.height).data;
          const anteil = Math.floor(budget / Math.max(1, anzahl));
          const pkte = [];
          const raster = Math.max(2, Math.round(Math.sqrt((tx.canvas.width * tx.canvas.height * 0.12) / Math.max(1, anteil))));
          for (let yy = 0; yy < tx.canvas.height; yy += raster) for (let xx = 0; xx < tx.canvas.width; xx += raster) {
            if (daten[(yy * tx.canvas.width + xx) * 4 + 3] > 200) pkte.push(xx, yy);
          }
          const n = Math.min(anteil, pkte.length / 2);
          if (n > 0) {
            const pos = new Float32Array(n * 3), st = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
            const sprung = (pkte.length / 2) / n;
            const weit = tx.w * k;
            for (let i = 0; i < n; i++) {
              const j = Math.floor(i * sprung) * 2;
              pos[i * 3] = (pkte[j] / AUFL - tx.w / 2) * k;
              pos[i * 3 + 1] = (tx.h / 2 - pkte[j + 1] / AUFL) * k;
              pos[i * 3 + 2] = 0.02;
              const w2 = r() * Math.PI * 2, rr2 = (0.4 + r()) * weit * 0.9;
              st[i * 3] = Math.cos(w2) * rr2; st[i * 3 + 1] = Math.sin(w2) * rr2 * 0.6; st[i * 3 + 2] = -(0.2 + r()) * dist * 0.5;
              rnd[i * 4] = r(); rnd[i * 4 + 1] = r(); rnd[i * 4 + 2] = r(); rnd[i * 4 + 3] = r();
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
            g.setAttribute("aStart", new THREE.BufferAttribute(st, 3));
            g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
            const m = new THREE.ShaderMaterial({
              transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: FUNK_VS, fragmentShader: FUNK_FS,
              uniforms: { uIn: { value: 0 }, uOut: { value: 0 }, uZeit: { value: 0 }, uGr: { value: w.ws.gr * k * 0.05 }, uSkala: { value: 500 }, uWeit: { value: weit * 1.2 + dist * 0.25 }, uLila: { value: F.lila }, uLicht: { value: F.licht } },
            });
            funken = new THREE.Points(g, m);
            funken.frustumCulled = false;
            funken.renderOrder = 50;
            wort.add(funken);
          }
        }
        gruppe.add(wort);
        woerterListe.push({
          gruppe: wort, mats: mats, funken: funken, tex: tex, geo: geo, betont: w.betont, i: idx++,
          ziel: wort.position.clone(), dreh: (r() * 2 - 1) * 0.6, tief: z.heranfliegen ? dist * 0.55 : dist * (0.18 + r() * 0.12),
        });
        px += w.bw + sf.gr * 0.3;
      });
    });
    l.szene.add(gruppe);
    return { z: z, gruppe: gruppe, woerter: woerterListe, k: k, dist: dist, sichtW: sichtW, mitte: new THREE.Vector3(versatzX * k, versatzY * k, 0) };
  }

  function zeileWeg(l, e) {
    l.szene.remove(e.gruppe);
    e.woerter.forEach(function (w) {
      w.tex.dispose(); w.geo.dispose();
      w.mats.forEach(function (m) { m.dispose(); });
      if (w.funken) { w.funken.geometry.dispose(); w.funken.material.dispose(); }
    });
  }

  const AUFBAU_VOR = 2.4;   // Sekunden, die eine Zeile vor ihrem Einsatz zu entstehen beginnt
  function zeileAnimieren(l, e, T) {
    const z = e.z, ruhig = RUHIG.matches;
    /* Die Zeile baut sich schon vor ihrem Einsatz auf und bleibt stehen;
       die Kamera fliegt einfach hindurch. */
    const o = clamp((T - z.pass + 0.25) / 0.3, 0, 1);
    const schritt = Math.min(z.schritt, 1.3 / Math.max(1, z.anzahl));
    const skala = l.pxSkala;
    e.woerter.forEach(function (w) {
      const ws = z.ab - AUFBAU_VOR + w.i * schritt;
      const pIn = clamp((T - ws) / 1.1, 0, 1);
      const eIn = easeOut(pIn);
      const rv = ruhig ? clamp((T - ws) / 0.6, 0, 1) : smooth(0.4, 1, pIn);
      /* Aus der Tiefe heran, leicht gedreht. */
      w.gruppe.position.set(w.ziel.x, w.ziel.y, ruhig ? 0 : -(1 - eIn) * w.tief);
      let ry = ruhig ? 0 : (1 - eIn) * w.dreh, rx = 0;
      w.gruppe.rotation.set(rx, ry, 0);
      const neu = 1 - clamp((T - ws - 0.55) / 0.8, 0, 1);
      let gl = 0;
      if (!ruhig && w.betont) {
        gl = Math.max(0, 1 - Math.abs(T - ws - 0.75) / 0.35);
        const f = Math.floor(T * 6);
        if (hash1(f + z.nr * 13 + w.i * 7) > 0.9 && T > ws + 1) gl = Math.max(gl, 0.6);
      }
      const shine = ((T - ws) * 0.42) % 1.8 - 0.4;
      w.mats.forEach(function (m) {
        const u = m.uniforms;
        u.uRv.value = rv; u.uOut.value = 0; u.uZeit.value = T; u.uGlitch.value = gl; u.uShine.value = shine; u.uNeu.value = neu;
      });
      if (w.funken) {
        const u = w.funken.material.uniforms;
        u.uIn.value = pIn; u.uOut.value = 0; u.uZeit.value = T; u.uSkala.value = skala;
      }
    });
    if (ruhig) {
      const a = 1 - o;
      e.woerter.forEach(function (w) { w.mats.forEach(function (m) { m.uniforms.uRv.value *= a; }); });
    }
    e.raus = o;
  }

  /* ------------------------------------------------------
     EIN BILD
  ------------------------------------------------------ */
  function schnittStaerke(l, T) {
    let s = 0;
    l.zeilen.forEach(function (z) {
      if (!z.teilBeginn || T < z.ab - 0.3 || T > z.ab + 0.4) return;
      s = Math.max(s, T < z.ab ? (T - (z.ab - 0.3)) / 0.3 : 1 - (T - z.ab) / 0.4);
    });
    return clamp(s, 0, 1) * 0.7;
  }

  function malen(l, T) {
    const b = l.bahn, F = l.farben, kam = l.kamera, ruhig = RUHIG.matches;
    ausrichten(b, T, kam);
    if (ruhig) kam.rotation.z += 0;

    const wi = gewicht(b, "intro", T) + gewicht(b, "outro", T), ws = gewicht(b, "strophe", T), wr = gewicht(b, "refrain", T), wb = gewicht(b, "bruecke", T);
    /* Himmel. */
    const hu = l.himmel.material.uniforms;
    hu.uZeit.value = T;
    hu.uMitte.value.copy(F.daemmer).lerp(F.blau, ws).lerp(F.dunst, wr + wb);
    hu.uRand.value.copy(F.daemmerRand).lerp(F.blauRand, ws).lerp(F.dunstRand, wr + wb);
    hu.uUnten.value = clamp(wb + ortGewicht(b, "landschaft", T) * 0.7 + ortGewicht(b, "aurora", T) * 0.4, 0, 1);
    hu.uDunst.value = wr + wb;
    hu.uOa.value.set(ortGewicht(b, "hoehle", T), ortGewicht(b, "galaxie", T), ortGewicht(b, "landschaft", T), ortGewicht(b, "stadt", T));
    hu.uOb.value.set(ortGewicht(b, "kathedrale", T), ortGewicht(b, "truemmer", T), ortGewicht(b, "planet", T), ortGewicht(b, "aurora", T));
    l._v.set(0, 0, -1).applyQuaternion(kam.quaternion);
    hu.uVorn.value.copy(l._v);
    l.himmel.position.copy(kam.position);
    l.himmelGruppe.position.copy(kam.position);
    l.galaxien.forEach(function (g, i) { g.rotation.y = (ruhig ? 0 : T) * (0.01 + i * 0.006) + i; g.material.uniforms.uPx.value = l.pr; g.material.uniforms.uA.value = 0.6 + wi * 0.5 - ws * 0.25; });

    l.weltObjekte.forEach(function (o) {
      const u = o.material.uniforms;
      if (u && u.uZeit) u.uZeit.value = ruhig ? 0 : T;
      if (u && u.uSkala) u.uSkala.value = l.pxSkala;
    });
    l.giganten.forEach(function (g) { g.rotation.x = T * g.userData.dreh[0]; g.rotation.y = T * g.userData.dreh[1]; });
    let warp = 0;
    l.portale.forEach(function (p) {
      const a = p.bl.ab;
      const sicht = smooth(a - 7, a - 5.5, T) * (1 - smooth(a + 0.05, a + 0.6, T));
      p.tor.visible = sicht > 0.003;
      p.u.uSicht.value = sicht;
      p.u.uZeit.value = ruhig ? 0 : T;
      p.u.uOffen.value = 0.08 + 0.92 * Math.pow(smooth(a - 6.5, a - 3.5, T), 0.6);
      p.mats[1].uniforms.uSkala.value = l.pxSkala;
      warp = Math.max(warp, Math.exp(-Math.pow((T - a) / 0.35, 2)));
    });
    if (ruhig) warp = 0;
    const fovSoll = FOV + warp * 26;
    if (Math.abs(kam.fov - fovSoll) > 0.01) { kam.fov = fovSoll; kam.updateProjectionMatrix(); }
    l._warp = warp;
    l.orte.forEach(function (o) {
      const bl = o.bl;
      const sicht = smooth(bl.ab - 5, bl.ab + 1.5, T) * (1 - smooth(bl.bis - 1, bl.bis + 4, T));
      o.objs.forEach(function (m) {
        m.visible = sicht > 0.003;
        const u = m.material.uniforms;
        if (u) { if (u.uSicht) u.uSicht.value = sicht; if (u.uZeit) u.uZeit.value = ruhig ? 0 : T; if (u.uSkala) u.uSkala.value = l.pxSkala; }
      });
    });

    /* Zeilen: aktive, vorige (im Zerfall), naechste (vorgebaut). */
    const n = aktiveZeile(l.zeilen, T);
    const noetig = {};
    if (n >= 0) noetig[n] = true;
    if (n > 0 && T < l.zeilen[n - 1].pass + 0.2) noetig[n - 1] = true;
    for (let j = n + 1; j < l.zeilen.length && T > l.zeilen[j].ab - AUFBAU_VOR - 0.4; j++) noetig[j] = true;
    Object.keys(l.aktiv).forEach(function (k) { if (!noetig[k]) { zeileWeg(l, l.aktiv[k]); delete l.aktiv[k]; } });
    Object.keys(noetig).forEach(function (k) { if (!l.aktiv[k]) l.aktiv[k] = zeileBauen(l, l.zeilen[k]); });
    Object.keys(l.aktiv).forEach(function (k) {
      const e = l.aktiv[k];
      if (T > e.z.pass + 0.08) { e.gruppe.visible = false; return; }
      e.gruppe.visible = true;
      zeileAnimieren(l, e, T);
    });

    if (n !== l.zeileNr) {
      l.zeileNr = n;
      l.vorlesen.textContent = n >= 0 ? l.zeilen[n].reihen.map(function (r) { return r.map(function (w) { return w.w; }).join(" "); }).join(" ") : "";
    }
    const z = n >= 0 ? l.zeilen[n] : null;
    const e = n >= 0 ? l.aktiv[n] : null;

    /* Orb (Strophe): wandert hinter der Zeile. */
    if (z && z.orb && e) {
      const p = clamp((T - z.ab) / Math.max(0.5, z.ende - z.ab), 0, 1);
      const sicht = clamp((T - z.ab) / 0.5, 0, 1) * clamp((z.pass - 0.4 - T) / 0.5, 0, 1);
      const ox = (mix(z.orbVon[0], z.orbNach[0], easeInOut(p)) - 0.5) * e.sichtW;
      const oy = (0.5 - mix(z.orbVon[1], z.orbNach[1], easeInOut(p))) * e.sichtW / ASPEKT;
      l._v.set(ox, oy, -e.dist * 0.45);
      l.orb.position.copy(l._v.applyQuaternion(e.gruppe.quaternion).add(e.gruppe.position));
      const g = e.k * 340;
      l.orbHalo.scale.setScalar(g * 2.2); l.orbKern.scale.setScalar(g * 0.55);
      l.orbHalo.material.opacity = 0.55 * sicht; l.orbKern.material.opacity = sicht;
    } else { l.orbHalo.material.opacity = 0; l.orbKern.material.opacity = 0; }

    /* Horizont-Schein unter der Zeile. */
    if (z && z.horizont && e) {
      const al = clamp((T - z.ab - 0.3) / 0.8, 0, 1) * clamp((z.pass - T) / 0.6, 0, 1);
      l._v.set(0, -e.sichtW * 0.26, -e.dist * 0.6);
      const hp = l._v.applyQuaternion(e.gruppe.quaternion).add(e.gruppe.position);
      l.horizont.position.copy(hp); l.horizontKern.position.copy(hp);
      l.horizont.scale.set(e.sichtW * 1.3, e.sichtW * 0.32, 1);
      l.horizontKern.scale.set(e.sichtW * 0.5, e.sichtW * 0.08, 1);
      l.horizont.material.opacity = 0.55 * al; l.horizontKern.material.opacity = 0.8 * al;
    } else { l.horizont.material.opacity = 0; l.horizontKern.material.opacity = 0; }

    /* Ringe um die Zeile. */
    if (z && z.ringe && e) {
      const sicht = clamp((T - z.ab) / 0.5, 0, 1) * clamp((z.pass - 0.2 - T) / 0.5, 0, 1);
      const p = clamp((T - z.ab) / Math.max(1, z.pass - z.ab), 0, 1);
      l.zeilenRinge.position.copy(e.gruppe.position);
      l.zeilenRinge.quaternion.copy(e.gruppe.quaternion);
      l._v.copy(e.mitte).applyQuaternion(e.gruppe.quaternion);
      l.zeilenRinge.position.add(l._v);
      l.zeilenRinge.translateZ(-0.6);
      l.zeilenRinge.scale.setScalar(e.k * (ruhig ? 1 : 0.86 + 0.2 * easeOut(p)));
      l.zeilenRinge.children.forEach(function (m, i) { m.material.opacity = m.userData.basis * sicht; m.rotation.z = T * 0.05 * (i + 1); });
      l.zeilenRinge.visible = true;
    } else l.zeilenRinge.visible = false;

    l.renderer.render(l.szene, kam);

    /* Blitz und Schnitt als Ebene ueber dem Bild. */
    let blitz = 0;
    if (z && z.blitz && !ruhig) blitz = clamp(1 - (T - z.ab) / 0.5, 0, 1) * 0.7;
    blitz = Math.max(blitz, (l._warp || 0) * (ruhig ? 0.25 : 0.55));
    l.blitz.style.opacity = blitz.toFixed(3);
    l.schnitt.style.opacity = "0";
    l.note.style.opacity = l.zeilen.length ? "0" : String(0.35 + 0.25 * Math.sin(T * 1.6));
  }

  /* ------------------------------------------------------
     ABLAUF
  ------------------------------------------------------ */
  let lauf = null;
  let klassisch = false;

  function einpassen() {
    if (!lauf) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    lauf.buehne.style.transform = "translate(-50%, -50%) scale(" + s + ")";
    const hoch = window.innerHeight > window.innerWidth * 1.1;
    lauf.wurzel.classList.toggle("ist-hochkant", hoch);
    if (lauf.hinweis) lauf.hinweis.style.display = hoch ? "block" : "none";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lauf.pr = clamp(s * dpr * lauf.qualitaet, 0.35, 1.6);
    lauf.renderer.setPixelRatio(lauf.pr);
    lauf.renderer.setSize(1920, 1080, false);
    lauf.pxSkala = (1080 * lauf.pr) / (2 * Math.tan((FOV * Math.PI) / 360));
  }

  function bild(jetzt) {
    if (!lauf) return;
    lauf.uhr = requestAnimationFrame(bild);
    if (lauf.wache && lauf.wache(jetzt)) {
      lauf.wache = null;
      lauf.qualitaet = 0.6;
      einpassen();
    }
    const T = clamp(lauf.zeitQuelle ? lauf.zeitQuelle() : (jetzt - lauf.t0) / 1000 + lauf.ab, 0, DAUER);
    lauf.T = T;
    malen(lauf, T);
  }

  function taste(e) { if (e.key === "Escape") weg(); }
  function vollbild(an) {
    window.fhVollbildAn = an;
    document.dispatchEvent(new CustomEvent("fh:vollbild", { detail: { an: an } }));
  }
  function liedText() {
    return typeof siteConfig !== "undefined" && siteConfig && typeof siteConfig.liedText === "string" ? siteConfig.liedText : "";
  }

  function noteBauen() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "fh-lied-note");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.cssText = "position:absolute;left:50%;top:50%;width:96px;height:96px;margin:-48px 0 0 -48px;color:var(--fh-lied-lila,#a99cf0);opacity:0;";
    [["path", { d: "M9 18V5l12-2v13" }], ["circle", { cx: "6", cy: "18", r: "3" }], ["circle", { cx: "18", cy: "16", r: "3" }]].forEach(function (x) {
      const e = document.createElementNS(ns, x[0]);
      Object.keys(x[1]).forEach(function (k) { e.setAttribute(k, x[1][k]); });
      svg.appendChild(e);
    });
    return svg;
  }

  function el(tag, klasse, css) {
    const e = document.createElement(tag);
    e.className = klasse;
    if (css) e.style.cssText = css;
    return e;
  }

  /* Rueckfall: die klassische 2D-Fassung nachladen und dorthin abgeben
     (ueber fhNachladen, damit sie ihre ?v=-Nummer aus nachladen.js
     bekommt und keine Skriptadresse im DOM steht). */
  function klassischStarten(opts) {
    klassisch = true;
    function los() { if (klassisch && window.fhLiedFilmKlassisch) window.fhLiedFilmKlassisch.start(opts); }
    if (window.fhLiedFilmKlassisch) return los();
    if (window.fhNachladen) window.fhNachladen(KLASSISCH).then(los, function (e) { console.warn(e); });
  }

  function start(opts) {
    weg();
    opts = opts || {};
    const text = opts.text != null ? opts.text : liedText();
    const renderer = (typeof THREE !== "undefined") && (window.fhWebGL ? window.fhWebGL.rendererErzeugen({ antialias: true, alpha: false, powerPreference: "high-performance" }) : (function () { try { return new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); } catch (e) { return null; } })());
    if (!renderer) return klassischStarten(Object.assign({}, opts, { text: text }));
    klassisch = false;

    const wurzel = el("div", "fh-riss fh-lied", "position:fixed;inset:0;z-index:10050;overflow:hidden;background:var(--fh-lied-nacht,#0b0a1c);");
    wurzel.id = "fh-lied";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", t("lied.aria", "Live-Story: Liebeslied"));
    const buehne = el("div", "fh-riss-buehne", "position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:50% 50%;overflow:hidden;");
    buehne.setAttribute("aria-hidden", "true");
    const canvas = renderer.domElement;
    canvas.className = "fh-lied-grund";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    const vignette = el("div", "fh-lied-vignette", "position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 48%, transparent 55%, rgba(11,10,28,.72) 100%);");
    const blitz = el("div", "fh-lied-blitz", "position:absolute;inset:0;pointer-events:none;background:var(--fh-lied-lila,#a99cf0);opacity:0;mix-blend-mode:screen;");
    const schnitt = el("div", "fh-lied-schnitt", "position:absolute;inset:0;pointer-events:none;background:var(--fh-lied-nacht,#0b0a1c);opacity:0;");
    const note = noteBauen();
    buehne.append(canvas, vignette, blitz, schnitt, note);
    const vorlesen = el("p", "fh-lied-vorlesen", "position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;");
    vorlesen.setAttribute("aria-live", "polite");
    const hinweis = el("p", "fh-riss-hinweis", "display:none;position:absolute;left:0;right:0;top:18px;margin:0;padding:0 16px;text-align:center;font:400 13px/1.4 Inter,sans-serif;letter-spacing:.08em;color:rgba(232,237,244,.6);");
    hinweis.textContent = t("riss.rotate", "Tipp: Handy quer halten");
    const knopf = el("button", "fh-riss-weiter", "position:absolute;right:16px;bottom:16px;height:36px;padding:0 14px;border:1px solid rgba(232,237,244,.18);border-radius:8px;background:rgba(5,7,11,.55);color:rgba(232,237,244,.75);font:500 12px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;opacity:.55;");
    knopf.type = "button";
    knopf.textContent = t("riss.skip", "Überspringen");
    knopf.addEventListener("click", weg);
    knopf.addEventListener("mouseenter", function () { knopf.style.opacity = "1"; });
    knopf.addEventListener("mouseleave", function () { knopf.style.opacity = ".55"; });
    wurzel.append(buehne, vorlesen, hinweis, knopf);
    document.body.appendChild(wurzel);

    const F = farben();
    renderer.setClearColor(F.nacht, 1);
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.LinearSRGBColorSpace || "srgb-linear";
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(FOV, ASPEKT, 0.1, 1400);
    const zeilen = lesen(text);
    lauf = {
      wurzel: wurzel, buehne: buehne, renderer: renderer, szene: szene, kamera: kamera, farben: F,
      zeilen: zeilen, bahn: bahnBauen(zeilen), aktiv: {}, zeileNr: -2,
      vorlesen: vorlesen, hinweis: hinweis, note: note, blitz: blitz, schnitt: schnitt,
      t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), zeitQuelle: typeof opts.uhr === "function" ? opts.uhr : null,
      uhr: 0, T: 0, qualitaet: 1, pr: 1, pxSkala: 500, _v: new THREE.Vector3(),
      wache: window.fhWebGL ? window.fhWebGL.bildwacht({ bilder: 60, grenzeMs: 26 }) : null,
    };
    weltBauen(lauf);
    einpassen();
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    /* Schrift erst zeichnen, wenn Inter geladen ist. */
    const l = lauf;
    const schriften = schriftenLaden();
    schriften.catch(function () {}).then(function () { if (lauf === l) l.uhr = requestAnimationFrame(bild); });
    vollbild(true);
  }

  function ende() {
    if (klassisch && window.fhLiedFilmKlassisch) return window.fhLiedFilmKlassisch.ende();
    if (!lauf) return;
    const l = lauf;
    l.wurzel.style.transition = "opacity 1.2s ease";
    l.wurzel.style.opacity = "0";
    setTimeout(function () { if (lauf === l) weg(); }, 1200);
  }

  function weg() {
    if (klassisch && window.fhLiedFilmKlassisch) { window.fhLiedFilmKlassisch.weg(); klassisch = false; }
    if (!lauf) return;
    const l = lauf;
    lauf = null;
    cancelAnimationFrame(l.uhr);
    window.removeEventListener("resize", einpassen);
    document.removeEventListener("keydown", taste);
    Object.keys(l.aktiv).forEach(function (k) { zeileWeg(l, l.aktiv[k]); });
    l.szene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    if (l.weich) l.weich.dispose();
    l.renderer.dispose();
    if (l.renderer.forceContextLoss) l.renderer.forceContextLoss();
    l.wurzel.remove();
    vollbild(false);
  }

  window.fhLiedFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf || (klassisch && !!window.fhLiedFilmKlassisch && window.fhLiedFilmKlassisch.laeuft()); },
    lesen: lesen,
    zeit: function () { return lauf ? lauf.T : (klassisch && window.fhLiedFilmKlassisch ? window.fhLiedFilmKlassisch.zeit() : null); },
    DAUER: DAUER,
    STILE: STILE,
  };
})();
