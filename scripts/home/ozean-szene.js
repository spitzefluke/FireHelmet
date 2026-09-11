/* ======================================================
   STARTSEITE: DIE OZEAN-REISE
   ---------------------------------------------------
   Sieben Kapitel auf 8000 Pixeln: von der offenen See zur
   Schatzinsel, auf der am Ende der Countdown steht.

   Uebernommen aus dem Entwurf "Schatzinsel Scroll" (Claude
   Design). Was dort anders war und hier angepasst werden musste:

     1. Der Entwurf laedt three.js 0.163 als ES-Modul ueber eine
        importmap und holt Water/Sky von unpkg. index.html laedt
        three.js 0.160 als klassischen UMD-Build - so wie alle
        ~110 anderen Skripte. Ein zweites three.js daneben waere
        670 KB doppelt. Stattdessen liegen Water und Sky als
        scripts/vendor/three-water.js und three-sky.js bereit und
        haengen sich an den vorhandenen THREE-Globalen.

     2. Der Entwurf ist ein Custom Element <ocean-scene> mit
        this.progress, gesetzt von einer React-Laufzeit
        (support.js, 70 KB). Hier gibt es keine React-Laufzeit:
        die Szene liest --fh-weg von #home, dieselbe Zahl, die
        scripts/home/startseite.js per ScrollTrigger schreibt.

     3. Der Entwurf kennt nur eine Qualitaetsstufe, und die ist
        schwer: 150x150 Wasserfelder, die PRO BILD auf der CPU
        neu gerechnet werden, ein zweiter Renderdurchgang fuer die
        Wasserspiegelung, 130 einzeln gebaute Palmen. Hier gibt es
        drei Stufen (siehe STUFEN), die nach Geraet gewaehlt und
        bei zu wenig Bildern/s zur Laufzeit heruntergeschaltet
        werden.

     4. Der Countdown ist neu - im Entwurf gibt es ihn nicht.

   Reihenfolge in index.html: nach three.js, nach fh-webgl.js,
   nach den beiden vendor-Dateien, nach countdown.js.
====================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------
     QUALITAETSSTUFEN

     Die teuerste Zahl ist wasserSeg: das Wassergitter wird pro
     Bild auf der CPU durchgerechnet, mit vier Sinus-Wellen je
     Punkt. Bei 150x150 sind das 90000 Sinus-Aufrufe pro Bild.
     Deshalb faellt sie zwischen den Stufen am staerksten.

     spiegel = 0 heisst: kein Water-Shader, sondern eine einfache
     Flaeche. Das spart den kompletten zweiten Renderdurchgang.
  ------------------------------------------------------ */
  const STUFEN = [
    { name: "hoch",    wasserSeg: 150, spiegel: 512, palmen: 130, inselSeg: 190, wake: 700, spray: 420, pixel: 1.75, wellenTakt: 1 },
    { name: "mittel",  wasserSeg:  96, spiegel: 256, palmen:  70, inselSeg: 130, wake: 340, spray: 200, pixel: 1.35, wellenTakt: 1 },
    { name: "niedrig", wasserSeg:  56, spiegel:   0, palmen:  26, inselSeg:  84, wake: 150, spray:  80, pixel: 1.0,  wellenTakt: 2 }
  ];

  function stufeWaehlen() {
    const kerne = navigator.hardwareConcurrency || 4;
    const schmal = Math.min(screen.width, screen.height) < 820;
    const grob = (window.devicePixelRatio || 1) < 1.5 && window.innerWidth < 1100;
    if (schmal || kerne <= 4 || grob) return 2;
    if (kerne <= 8 || window.innerWidth < 1500) return 1;
    return 0;
  }

  const klemm = (v, a, b) => Math.min(b, Math.max(a, v));
  const misch = (a, b, t) => a + (b - a) * t;
  const weich = (a, b, x) => { const t = klemm((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- Rauschen ---------- */
  const streu = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  function wrauschen(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return misch(misch(streu(xi, yi), streu(xi + 1, yi), u), misch(streu(xi, yi + 1), streu(xi + 1, yi + 1), u), v);
  }
  function fbm(x, y, okt = 5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < okt; i++) { s += a * wrauschen(x * f, y * f); n += a; a *= 0.5; f *= 2.07; }
    return s / n;
  }

  /* ---------- Texturen ---------- */
  function normalTextur(groesse, skala) {
    const c = document.createElement("canvas"); c.width = c.height = groesse;
    const ctx = c.getContext("2d"), bild = ctx.createImageData(groesse, groesse), h = new Float32Array(groesse * groesse);
    for (let y = 0; y < groesse; y++) for (let x = 0; x < groesse; x++) h[y * groesse + x] = fbm(x / groesse * skala, y / groesse * skala, 6);
    for (let y = 0; y < groesse; y++) for (let x = 0; x < groesse; x++) {
      const i = (y * groesse + x) * 4;
      const hx = h[y * groesse + ((x + 1) % groesse)] - h[y * groesse + ((x - 1 + groesse) % groesse)];
      const hy = h[((y + 1) % groesse) * groesse + x] - h[((y - 1 + groesse) % groesse) * groesse + x];
      const nx = -hx * 7, ny = -hy * 7, nz = 1, l = Math.hypot(nx, ny, nz);
      bild.data[i] = (nx / l * 0.5 + 0.5) * 255;
      bild.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      bild.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      bild.data[i + 3] = 255;
    }
    ctx.putImageData(bild, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function weicheTextur(innen, mitte) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d"), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, innen || "rgba(255,255,255,1)");
    g.addColorStop(0.35, mitte || "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /* Senkrechte Schlieren fuer den Wasserfall. Wird in der
     Senkrechten wiederholt und im Bildtakt nach unten geschoben -
     das ist billiger als bewegte Geometrie und sieht aus der
     Entfernung, in der die Insel steht, genauso aus. */
  function strahlTextur() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 64, br = 1 + Math.random() * 4;
      const y = Math.random() * 256, h = 30 + Math.random() * 120;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255," + (0.25 + Math.random() * 0.5).toFixed(2) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(x, y, br, h);
    }
    /* Zu den Raendern hin ausblenden, damit der Fall keine
       harten Laengskanten hat. */
    const rand = ctx.createLinearGradient(0, 0, 64, 0);
    rand.addColorStop(0, "rgba(0,0,0,1)");
    rand.addColorStop(0.5, "rgba(0,0,0,0)");
    rand.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = rand; ctx.fillRect(0, 0, 64, 256);
    ctx.globalCompositeOperation = "source-over";
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* Weiches Ringprofil fuer die Brandung.

     Ein RingGeometry mit einfarbigem Material ergibt einen
     gestochen scharfen Kreis - und die Kueste ist nicht rund,
     sondern ausgefranst. Aus der Naehe sah die Insel dadurch aus,
     als stuende sie auf einem Teller. THREE legt die
     Texturkoordinaten eines Rings ueber sein umschliessendes
     Quadrat, der Abstand zur Bildmitte entspricht also dem
     Radius: ein radialer Verlauf mit einem weichen Grat an der
     richtigen Stelle gibt einen Saum ohne Kanten. */
  function brandungTextur() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, "rgba(255,255,255,0)");
    g.addColorStop(0.78, "rgba(255,255,255,0)");
    g.addColorStop(0.88, "rgba(255,255,255,0.55)");
    g.addColorStop(0.93, "rgba(255,255,255,0.95)");
    g.addColorStop(0.97, "rgba(255,255,255,0.35)");
    g.addColorStop(1.00, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  function segeltuchTextur() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ddd6c4"; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = "rgba(" + (150 + Math.random() * 60) + "," + (140 + Math.random() * 60) + "," + (120 + Math.random() * 60) + ",0.12)";
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 1);
    }
    for (let y = 0; y < 256; y += 32) { ctx.fillStyle = "rgba(120,110,95,0.18)"; ctx.fillRect(0, y, 256, 1.2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function holzTextur() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#4a3325"; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 12) {
      ctx.fillStyle = "rgba(" + (30 + Math.random() * 40) + "," + (20 + Math.random() * 26) + "," + (14 + Math.random() * 18) + ",0.9)";
      ctx.fillRect(0, y, 256, 1.6);
      for (let x = 0; x < 256; x += 4) {
        ctx.fillStyle = "rgba(" + (90 + Math.random() * 50) + "," + (64 + Math.random() * 34) + "," + (44 + Math.random() * 24) + ",0.10)";
        ctx.fillRect(x, y + 2, 4, 9);
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------- Duenung ---------- */
  const WELLEN = [
    { ri: [1, 0.25], laenge: 620, hub: 5.2, tempo: 0.55 },
    { ri: [0.7, -0.8], laenge: 340, hub: 3.1, tempo: 0.75 },
    { ri: [-0.4, 0.9], laenge: 180, hub: 1.6, tempo: 0.95 },
    { ri: [0.9, 0.6], laenge: 90, hub: 0.7, tempo: 1.25 }
  ].map(function (w) {
    const l = Math.hypot(w.ri[0], w.ri[1]);
    return { dx: w.ri[0] / l, dz: w.ri[1] / l, k: (Math.PI * 2) / w.laenge, hub: w.hub, tempo: w.tempo };
  });
  function wellenHoehe(x, z, t) {
    let y = 0;
    for (let i = 0; i < WELLEN.length; i++) {
      const w = WELLEN[i];
      y += w.hub * Math.sin((x * w.dx + z * w.dz) * w.k + t * w.tempo * 2.2);
    }
    return y;
  }

  /* ---------- Schiff ---------- */
  function rumpfNetz(laenge, breite, tiefe, mat) {
    const g = new THREE.BoxGeometry(1, 1, 1, 14, 12, 60);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i);
      const z = p.getZ(i), t = z + 0.5;
      const bug = 1 - 0.93 * Math.pow(klemm((t - 0.48) / 0.52, 0, 1), 1.8);
      const heck = 1 - 0.3 * Math.pow(klemm((0.24 - t) / 0.24, 0, 1), 1.4);
      const spant = 0.2 + 0.8 * Math.pow(y + 0.5, 0.62);
      x *= bug * heck * spant;
      const kiel = -0.2 * Math.pow(klemm((t - 0.5) / 0.5, 0, 1), 2.2);
      const sprung = 0.2 * Math.pow(klemm((t - 0.42) / 0.58, 0, 1), 2.2) + 0.13 * Math.pow(klemm((0.26 - t) / 0.26, 0, 1), 2);
      y += (y > 0 ? sprung : 0) + kiel * (y < 0 ? 1 : 0.25);
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    g.scale(breite, tiefe, laenge);
    return new THREE.Mesh(g, mat);
  }

  function segelNetz(b, h, mat) {
    const g = new THREE.PlaneGeometry(b, h, 16, 14);
    g.userData.grund = g.attributes.position.array.slice();
    return new THREE.Mesh(g, mat);
  }

  function baeuchen(netz, t, staerke) {
    const g = netz.geometry, p = g.attributes.position, grund = g.userData.grund;
    const b = g.parameters.width, h = g.parameters.height;
    for (let i = 0; i < p.count; i++) {
      const x = grund[i * 3], y = grund[i * 3 + 1];
      const u = x / b + 0.5, v = y / h + 0.5;
      const bauch = Math.sin(u * Math.PI) * (0.35 + 0.65 * Math.sin(v * Math.PI));
      p.setZ(i, bauch * staerke * (1 + 0.14 * Math.sin(t * 1.7 + v * 4 + u * 2)));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  }

  function schiffBauen(stufe) {
    const schiff = new THREE.Group();
    const holz = holzTextur();
    holz.repeat.set(3, 2);
    const rumpfMat = new THREE.MeshStandardMaterial({ map: holz, color: 0x6b4c34, roughness: 0.78, metalness: 0.04 });
    const dunkel = new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 0.9 });
    const zier = new THREE.MeshStandardMaterial({ color: 0x9c7233, roughness: 0.45, metalness: 0.45 });
    const deckMat = new THREE.MeshStandardMaterial({ map: holz, color: 0x8a6b48, roughness: 0.85 });
    const segelMat = new THREE.MeshStandardMaterial({ map: segeltuchTextur(), color: 0xe7e0cd, roughness: 0.95, side: THREE.DoubleSide });
    const tauMat = new THREE.LineBasicMaterial({ color: 0x1d1811, transparent: true, opacity: 0.85 });

    const oben = rumpfNetz(48, 13, 10, rumpfMat); oben.position.y = 1.6; schiff.add(oben);
    const unten = rumpfNetz(46, 12.2, 7, dunkel); unten.position.y = -2.2; schiff.add(unten);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 36), deckMat);
    deck.position.set(0, 6.1, -1); schiff.add(deck);

    [4.4, 6.6].forEach(function (y, i) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(13.2 - i * 0.6, 0.75, 42 - i * 2), zier);
      s.position.set(0, y, -1); schiff.add(s);
    });

    /* Stueckpforten und Kanonen. Auf der niedrigen Stufe nur jede
       zweite - aus der Entfernung, in der das Schiff die meiste
       Zeit steht, faellt das nicht auf, spart aber 36 Netze. */
    const schritt = stufe.name === "niedrig" ? 2 : 1;
    const kanonenMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.4, metalness: 0.7 });
    for (let i = -4; i <= 4; i += schritt) {
      if (i === 0) continue;
      [-1, 1].forEach(function (seite) {
        const pforte = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 1.7), dunkel);
        pforte.position.set(seite * 6.1, 5.5, i * 3.6); schiff.add(pforte);
        const kanone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 8), kanonenMat);
        kanone.rotation.z = Math.PI / 2;
        kanone.position.set(seite * 7.2, 5.5, i * 3.6); schiff.add(kanone);
      });
    }

    [-1, 1].forEach(function (seite) {
      const reling = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.5, 34), dunkel);
      reling.position.set(seite * 5.4, 7.2, -1); schiff.add(reling);
      if (stufe.name !== "niedrig") {
        for (let z = -16; z <= 16; z += 2.4) {
          const pfosten = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6), dunkel);
          pfosten.position.set(seite * 5.4, 7.1, z); schiff.add(pfosten);
        }
      }
    });

    const heckAufbau = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6, 10), rumpfMat);
    heckAufbau.position.set(0, 9, -16.5); schiff.add(heckAufbau);
    const heckDeck = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.6, 10.8), deckMat);
    heckDeck.position.set(0, 12.2, -16.5); schiff.add(heckDeck);
    const fensterMat = new THREE.MeshStandardMaterial({ color: 0xffcf97, emissive: 0xff9d4a, emissiveIntensity: 1.4, roughness: 0.3 });
    for (let i = -1; i <= 1; i++) {
      const fenster = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 0.4), fensterMat);
      fenster.position.set(i * 2.6, 9.4, -21.6); schiff.add(fenster);
    }
    const bugAufbau = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.2, 8), rumpfMat);
    bugAufbau.position.set(0, 7.6, 15); schiff.add(bugAufbau);

    const laterne = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffd39b }));
    laterne.position.set(0, 14.4, -20.4); schiff.add(laterne);
    const laterneSchein = new THREE.Sprite(new THREE.SpriteMaterial({ map: weicheTextur(), color: 0xffb268, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    laterneSchein.scale.set(16, 16, 1); laterneSchein.position.copy(laterne.position); schiff.add(laterneSchein);
    const laterneLicht = new THREE.PointLight(0xffb268, 140, 120, 2);
    laterneLicht.position.copy(laterne.position); schiff.add(laterneLicht);

    const bugspriet = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.62, 20, 8), dunkel);
    bugspriet.rotation.x = Math.PI / 2 - 0.26; bugspriet.position.set(0, 8.6, 29); schiff.add(bugspriet);
    const galionsfigur = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 7), zier);
    galionsfigur.rotation.x = Math.PI / 2.1; galionsfigur.position.set(0, 6.4, 23.4); schiff.add(galionsfigur);

    const segel = [];
    const masten = [
      { z: 13, h: 46, segel: [[14, 11, 14], [11, 9, 28]] },
      { z: -2, h: 58, segel: [[17, 13, 16], [14, 11, 32], [10, 8, 45]] },
      { z: -14.5, h: 42, segel: [[12, 10, 13], [9, 7.5, 25]] }
    ];
    masten.forEach(function (m) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.8, m.h, 10), dunkel);
      mast.position.set(0, 6 + m.h / 2, m.z); schiff.add(mast);
      const mars = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 10), dunkel);
      mars.position.set(0, 6 + m.h * 0.62, m.z); schiff.add(mars);
      m.segel.forEach(function (s) {
        const b = s[0], h = s[1], y = s[2];
        const rah = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, b + 4, 7), dunkel);
        rah.rotation.z = Math.PI / 2; rah.position.set(0, 6 + y + h / 2, m.z); schiff.add(rah);
        const tuch = segelNetz(b, h, segelMat);
        tuch.position.set(0, 6 + y, m.z + 1.1); schiff.add(tuch); segel.push(tuch);
      });

      /* Webeleinen: auf der niedrigen Stufe weggelassen. Es sind
         zwar nur Linien, aber drei Masten x 26 Segmente sind
         78 Linienzuege fuer etwas, das auf einem Handyschirm
         ohnehin unter einem Pixel breit ist. */
      if (stufe.name === "niedrig") return;
      const punkte = [];
      [-1, 1].forEach(function (seite) {
        for (let i = 0; i <= 6; i++) {
          punkte.push(new THREE.Vector3(seite * (0.4 + i * 0.72), 6.6, m.z), new THREE.Vector3(0, 6 + m.h * 0.62, m.z));
        }
        for (let i = 1; i <= 7; i++) {
          const yy = 6.6 + i * ((m.h * 0.62 - 0.6) / 8);
          const f = 1 - i / 9;
          punkte.push(new THREE.Vector3(seite * 4.6 * f, yy, m.z), new THREE.Vector3(seite * 0.3, yy, m.z));
        }
      });
      schiff.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(punkte), tauMat));
    });

    [[10, 9, 20, 30], [8, 7, 26, 36]].forEach(function (s) {
      const klue = segelNetz(s[0], s[1], segelMat);
      klue.rotation.y = Math.PI / 2; klue.position.set(0.2, s[3] * 0.55 + 4, s[2]); schiff.add(klue); segel.push(klue);
    });

    const flagge = segelNetz(8, 4.6, new THREE.MeshStandardMaterial({ color: 0x15131d, roughness: 1, side: THREE.DoubleSide }));
    flagge.position.set(4.2, 61, -2); schiff.add(flagge); segel.push(flagge);

    const stage = [];
    stage.push(new THREE.Vector3(0, 62, -2), new THREE.Vector3(0, 14, 36));
    stage.push(new THREE.Vector3(0, 50, 13), new THREE.Vector3(0, 12, 34));
    stage.push(new THREE.Vector3(0, 62, -2), new THREE.Vector3(0, 44, -14.5));
    stage.push(new THREE.Vector3(0, 44, -14.5), new THREE.Vector3(0, 10, -22));
    schiff.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stage), tauMat));

    schiff.userData.segel = segel;
    schiff.scale.setScalar(0.9);
    return schiff;
  }

  /* ---------- Insel ---------- */
  function inselBauen(stufe) {
    const insel = new THREE.Group();
    const GROESSE = 3400, SEG = stufe.inselSeg, R = 1250;
    const geo = new THREE.PlaneGeometry(GROESSE, GROESSE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const farben = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xe3d2a6), cGras = new THREE.Color(0x36503a), cDschungel = new THREE.Color(0x24402d),
      cFels = new THREE.Color(0x5a5560), cHoch = new THREE.Color(0x8d8896);
    const tmp = new THREE.Color();
    const gipfel = function (x, z, px, pz, h, w) { return h * Math.exp(-((x - px) * (x - px) + (z - pz) * (z - pz)) / (2 * w * w)); };

    /* Die Hoehenformel steht zweimal: einmal hier fuer das Netz,
       einmal als hoeheBei() weiter unten, um die Palmen zu
       setzen. So war es schon im Entwurf. Wer eine aendert, muss
       die andere mitaendern - sonst schweben die Palmen. */
    const hoeheRoh = function (x, z) {
      const d = Math.hypot(x, z) / R;
      const ufer = 1 - weich(0.55, 1.05, d);
      let h = fbm(x / 420 + 12, z / 420 + 7, 6) * 260 * Math.pow(ufer, 1.2);
      h += gipfel(x, z, -120, -160, 660, 275) * ufer;
      h += gipfel(x, z, 330, 210, 390, 185) * ufer;
      h += gipfel(x, z, -430, 260, 440, 165) * ufer;
      h += gipfel(x, z, 60, -520, 300, 150) * ufer;
      h += fbm(x / 90, z / 90, 4) * 26 * ufer;
      h -= 34 * weich(0.5, 1.0, d);
      return h;
    };

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = hoeheRoh(x, z);
      h -= 60 * Math.exp(-((x - 120) * (x - 120) + (z - 620) * (z - 620)) / (2 * 260 * 260)); // Bucht
      pos.setY(i, h);
      const hang = Math.min(1, Math.abs(fbm(x / 120, z / 120, 3) - 0.5) * 2.2);
      /* Die Wasserlinie liegt bei h = 10, denn das Gelaende sitzt
         um 10 tiefer als das Meer (land.position.y = -10). Der
         Sand endete vorher bei h < 8 - also vollstaendig unter
         Wasser, und was man ueber der Linie sah, war schon der
         Verlauf ins Gras. Jetzt liegt ein echtes Band aus hellem
         Sand ueber der Wasserlinie; erst darueber faengt das
         Gruen an. Das ist der helle Saum, der die Insel im
         Gegenlicht vom Wasser abhebt. */
      if (h < 22) tmp.copy(cSand);
      else if (h < 68) tmp.copy(cSand).lerp(cGras, weich(22, 64, h));
      else if (h < 190) tmp.copy(cGras).lerp(cDschungel, weich(68, 180, h));
      else if (h < 330) tmp.copy(cDschungel).lerp(cFels, weich(190, 320, h));
      else tmp.copy(cFels).lerp(cHoch, weich(330, 470, h));
      tmp.offsetHSL(0, 0, (hang - 0.5) * 0.05 + (streu(i, 3) - 0.5) * 0.035);
      farben[i * 3] = tmp.r; farben[i * 3 + 1] = tmp.g; farben[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(farben, 3));
    geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    land.position.y = -10;
    insel.add(land);

    const hoeheBei = function (x, z) { return hoeheRoh(x, z) - 10; };

    const felsMat = new THREE.MeshStandardMaterial({ color: 0x4c4854, roughness: 1, flatShading: true });
    [[-1480, 420, 70, 150], [1520, -180, 55, 120], [-1260, -760, 42, 86], [1180, 780, 48, 100]].forEach(function (f) {
      const x = f[0], z = f[1], r = f[2], h = f[3];
      const g = new THREE.ConeGeometry(r, h, 8, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) + (streu(i, 1) - 0.5) * r * 0.5, p.getY(i) + (streu(i, 5) - 0.5) * h * 0.12, p.getZ(i) + (streu(i, 9) - 0.5) * r * 0.5);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, felsMat); m.position.set(x, h / 2 - 14, z); insel.add(m);
    });

    /* Palmen. Im Entwurf ist jede Palme eine eigene Gruppe aus
       acht Netzen - bei 130 Palmen sind das gut 1000 Zeichen-
       aufrufe allein hier. Hier teilen sich alle Palmen zwei
       Materialien, und die Anzahl haengt an der Stufe. */
    const stammMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 1 });
    const wedelMat = new THREE.MeshStandardMaterial({ color: 0x2d4a32, roughness: 1, side: THREE.DoubleSide, flatShading: true });
    const stammGeo = new THREE.CylinderGeometry(0.9, 1.9, 1, 6);
    const wedelGeo = new THREE.ConeGeometry(4, 20, 4, 1);
    const palmen = new THREE.Group();
    let gesetzt = 0, versuche = 0;
    while (gesetzt < stufe.palmen && versuche++ < 4000) {
      const a = Math.random() * Math.PI * 2, rad = 500 + Math.random() * 700;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, y = hoeheBei(x, z);
      if (y < 2 || y > 150) continue;
      const h = 26 + Math.random() * 22;
      const palme = new THREE.Group();
      const stamm = new THREE.Mesh(stammGeo, stammMat);
      stamm.scale.y = h; stamm.position.y = h / 2; stamm.rotation.z = (Math.random() - 0.5) * 0.45;
      palme.add(stamm);
      for (let f = 0; f < 7; f++) {
        const w = (f / 7) * Math.PI * 2 + Math.random() * 0.3;
        const wedel = new THREE.Mesh(wedelGeo, wedelMat);
        wedel.position.set(Math.cos(w) * 8, h + 1, Math.sin(w) * 8);
        wedel.rotation.set(Math.PI / 2.3, 0, -w);
        wedel.scale.set(0.8, 1, 0.35);
        palme.add(wedel);
      }
      palme.position.set(x, y, z); palme.scale.setScalar(0.9 + Math.random() * 0.6);
      palmen.add(palme); gesetzt++;
    }
    insel.add(palmen);

    /* ---------- Dschungelkronen ----------
       Zwischen Strand und Fels lag bisher nackte Gelaendefarbe:
       Palmen stehen nur im Ring zwischen Hoehe 2 und 150, alles
       darueber war eine glatte gruene Flanke. Die Kronen sind
       bewusst grobe Koerper mit flacher Schattierung - aus der
       Entfernung, in der die Insel im Bild steht, zaehlt nur die
       unruhige Silhouette, nicht das einzelne Blatt. */
    const kronenMat = new THREE.MeshStandardMaterial({ color: 0x1f3a29, roughness: 1, flatShading: true });
    const kronenGeo = new THREE.IcosahedronGeometry(1, 0);
    const kronen = new THREE.Group();
    const kronenZahl = Math.round(stufe.palmen * 1.2);
    /* In Gruppen, nicht gleichverteilt. Einzeln verstreut ergaben
       dieselben Koerper lauter abgesetzte Klumpen am Hang - das
       las sich wie Geroell, nicht wie Bewuchs. Wald waechst in
       Nestern, und erst wo sich die Kronen ueberlappen, entsteht
       eine geschlossene Flaeche mit unruhigem Rand. */
    let kGesetzt = 0, nester = 0;
    while (kGesetzt < kronenZahl && nester++ < 900) {
      const a = Math.random() * Math.PI * 2, rad = 220 + Math.random() * 780;
      const nx = Math.cos(a) * rad, nz = Math.sin(a) * rad;
      if (hoeheBei(nx, nz) < 25) continue;
      const proNest = 4 + Math.floor(Math.random() * 5);
      for (let n = 0; n < proNest && kGesetzt < kronenZahl; n++) {
        const x = nx + (Math.random() - 0.5) * 130, z = nz + (Math.random() - 0.5) * 130;
        const y = hoeheBei(x, z);
        if (y < 22 || y > 280) continue;
        const k = new THREE.Mesh(kronenGeo, kronenMat);
        const gr = 15 + Math.random() * 20;
        /* Tief genug sitzen, dass die Krone im Hang steckt und
           nicht darauf liegt. */
        k.position.set(x, y + gr * 0.3, z);
        k.scale.set(gr, gr * (0.45 + Math.random() * 0.3), gr);
        k.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
        kronen.add(k); kGesetzt++;
      }
    }
    insel.add(kronen);

    /* ---------- Lichter im Dschungel ----------
       Kapitel VI heisst "Klippen, Dschungel, ein Licht" - bisher
       gab es genau eins. Jetzt blinzeln mehrere warme Punkte
       zwischen den Baeumen durch.

       Bewusst Sprites und KEINE PointLights: jedes echte Licht
       kostet in three.js einen Platz in der Beleuchtung jedes
       betroffenen Materials und laesst die Shader neu uebersetzen.
       Ein additiv gezeichneter Punkt sieht aus dieser Entfernung
       genauso aus und kostet nichts. Das eine echte Feuerlicht
       weiter unten bleibt, damit das Gelaende darum herum auch
       wirklich beleuchtet wird. */
    const lichtTex = weicheTextur("rgba(255,222,170,1)", "rgba(255,170,90,0.5)");
    const lichter = new THREE.Group();
    const lichtZahl = stufe.name === "niedrig" ? 4 : 9;
    let lGesetzt = 0, lVersuche = 0;
    while (lGesetzt < lichtZahl && lVersuche++ < 3000) {
      const a = Math.random() * Math.PI * 2, rad = 320 + Math.random() * 760;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, y = hoeheBei(x, z);
      if (y < 14 || y > 300) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: lichtTex, color: 0xffc078, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      const gr = 52 + Math.random() * 46;
      sp.scale.set(gr, gr, 1);
      sp.position.set(x, y + 16, z);
      /* Jedes Licht flackert mit eigener Frequenz und Phase -
         gleichmaessiges Pulsieren saehe nach Blinklicht aus. */
      sp.userData = { ph: Math.random() * 6.3, tempo: 0.7 + Math.random() * 1.9, grund: 0.45 + Math.random() * 0.4 };
      lichter.add(sp); lGesetzt++;
    }
    insel.add(lichter);
    insel.userData.lichter = lichter;

    /* ---------- Wasserfall ----------
       An der vorderen Flanke des Hauptgipfels (der steht bei
       x=-120, z=-160). Die Stelle wird nicht geraten, sondern
       gesucht: vom Gipfel aus nach vorn laufen, bis das Gelaende
       auf die Zielhoehe abgefallen ist. Sonst haengt der Fall bei
       jeder Aenderung an der Hoehenformel in der Luft oder steckt
       im Berg. */
    let wasserfall = null;
    if (stufe.name !== "niedrig") {
      const wx = -120;
      let oben = null, unten = null;
      for (let z = -160; z < 1200; z += 12) {
        const hh = hoeheBei(wx, z);
        if (oben === null && hh < 430) oben = { z: z, y: hh };
        if (oben !== null && hh < 12) { unten = { z: z, y: hh }; break; }
      }
      if (oben && unten && unten.z > oben.z + 60) {
        const fallHoehe = oben.y - unten.y, fallTiefe = unten.z - oben.z;
        const laenge = Math.hypot(fallHoehe, fallTiefe);
        const tex = strahlTextur();
        tex.repeat.set(1, Math.max(2, Math.round(laenge / 150)));
        const mat = new THREE.MeshBasicMaterial({
          map: tex, color: 0xdfe9f0, transparent: true, opacity: 0.62,
          depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        const netz = new THREE.Mesh(new THREE.PlaneGeometry(46, laenge), mat);
        netz.position.set(wx, (oben.y + unten.y) / 2, (oben.z + unten.z) / 2 + 26);
        /* Die Ebene steht senkrecht und wird so gekippt, dass sie
           der Flanke folgt. */
        netz.rotation.x = -Math.atan2(fallTiefe, fallHoehe);
        insel.add(netz);

        const fuss = new THREE.Sprite(new THREE.SpriteMaterial({
          map: weicheTextur("rgba(255,255,255,0.9)", "rgba(255,255,255,0.3)"),
          color: 0xeaf2f6, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        fuss.scale.set(150, 90, 1);
        fuss.position.set(wx, unten.y + 16, unten.z + 20);
        insel.add(fuss);
        wasserfall = { tex: tex, fuss: fuss };
      }
    }
    insel.userData.wasserfall = wasserfall;

    const gischt = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.74, R * 0.99, 128, 1),
      new THREE.MeshBasicMaterial({ map: weicheTextur("rgba(255,255,255,0.0)", "rgba(255,255,255,0.7)"), color: 0xdfe6ea, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
    );
    gischt.rotation.x = -Math.PI / 2; gischt.position.y = 1.4;
    insel.add(gischt);
    insel.userData.gischt = gischt;

    /* Die Brandungslinie liegt enger als der breite Gischtring
       und wird additiv gezeichnet: ein schmaler heller Saum genau
       dort, wo das Wasser auf den Sand trifft. Sie atmet im
       Bildtakt, damit die Kueste nicht wie aufgemalt wirkt. */
    const brandung = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.80, R * 1.02, 128, 1),
      new THREE.MeshBasicMaterial({
        map: brandungTextur(), color: 0xf2f7fa, transparent: true, opacity: 0.42,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      })
    );
    brandung.rotation.x = -Math.PI / 2; brandung.position.y = 2.2;
    insel.add(brandung);
    insel.userData.brandung = brandung;

    const schein = new THREE.Sprite(new THREE.SpriteMaterial({ map: weicheTextur(), color: 0xffc98c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    schein.scale.set(460, 460, 1); schein.position.set(300, 150, 430);
    insel.add(schein);
    insel.userData.schein = schein;
    const feuerLicht = new THREE.PointLight(0xffb268, 26000, 1600, 2);
    feuerLicht.position.set(300, 130, 430); insel.add(feuerLicht);

    const nebelMat = new THREE.SpriteMaterial({ map: weicheTextur("rgba(255,255,255,0.55)", "rgba(255,255,255,0.2)"), color: 0xcfd4dd, transparent: true, opacity: 0.18, depthWrite: false });
    const nebel = new THREE.Group();
    const nebelZahl = stufe.name === "niedrig" ? 10 : 26;
    for (let i = 0; i < nebelZahl; i++) {
      const s = new THREE.Sprite(nebelMat.clone());
      const a = Math.random() * Math.PI * 2, rad = 900 + Math.random() * 700;
      s.position.set(Math.cos(a) * rad, 20 + Math.random() * 90, Math.sin(a) * rad);
      s.scale.set(700 + Math.random() * 500, 260 + Math.random() * 180, 1);
      nebel.add(s);
    }
    insel.add(nebel);
    insel.userData.nebel = nebel;
    return insel;
  }

  /* ------------------------------------------------------
     DER COUNTDOWN IN 3D

     Vier Tafeln, die ueber der Insel schweben. Die Zahlen
     werden auf eine Leinwand gezeichnet und als Textur
     aufgelegt - das braucht keine Schriftdatei und erzeugt beim
     Sekundenwechsel keine neue Geometrie.

     WOHER DIE ZAHLEN KOMMEN: aus den vorhandenen Elementen
     #days/#hours/#minutes/#seconds, die scripts/core/countdown.js
     ohnehin jede Sekunde schreibt. Dadurch gibt es genau EINE
     Stelle, die den Termin kennt - samt der Moeglichkeit, ihn
     ueber das Admin-Panel zu ueberschreiben. Ein zweiter
     Rechenweg hier koennte abweichen.

     Der Rahmen ist beleuchtet (MeshStandardMaterial) und faengt
     das Morgenlicht. Die Ziffern selbst sind es NICHT
     (MeshBasicMaterial): sie sollen immer gleich gut lesbar
     sein, auch wenn die Szene gerade dunkel ist.
  ------------------------------------------------------ */
  const TAFELN = [
    { id: "days", wort: "TAGE", wortEn: "DAYS" },
    { id: "hours", wort: "STUNDEN", wortEn: "HOURS" },
    { id: "minutes", wort: "MINUTEN", wortEn: "MINUTES" },
    { id: "seconds", wort: "SEKUNDEN", wortEn: "SECONDS" }
  ];

  const TAFEL_BREITE = 250;
  const TAFEL_HOEHE = 230;
  const TAFEL_LUFT = 30;

  /* 384 statt 256: bei 256 waren die Ziffern auf einem grossen
     Schirm sichtbar weich. Die Textur kostet so 576 KB statt
     256 KB - viermal, also gut 2 MB Grafikspeicher. Vertretbar
     fuer das, was am Ende der Reise steht. */
  const ZIFF = 384;

  function ziffernLeinwand() {
    const c = document.createElement("canvas");
    c.width = ZIFF; c.height = ZIFF;
    return c;
  }

  function ziffernZeichnen(leinwand, zahl, wort, gold) {
    const ctx = leinwand.getContext("2d");
    ctx.clearRect(0, 0, ZIFF, ZIFF);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    /* Zweimal zeichnen: erst breit und weich als Schein, dann
       hart darueber. Ein einzelner shadowBlur macht die Ziffer
       insgesamt milchig, statt sie leuchten zu lassen.

       Die harte Lage war zuerst fast weiss (#fff3d6). Vor dem
       hellen Morgenhimmel ging sie darin unter - eine weisse
       Zahl auf weissem Grund. Jetzt liegt ein Verlauf von hellem
       zu sattem Gold darauf: oben hell wie angestrahltes Metall,
       unten dunkler, und dadurch an jeder Stelle ein Kontrast
       zum Hintergrund. */
    ctx.font = "700 200px Oswald, 'Arial Narrow', Impact, sans-serif";
    ctx.fillStyle = gold;
    ctx.shadowColor = "rgba(255, 186, 74, 0.95)";
    ctx.shadowBlur = 52;
    ctx.fillText(zahl, ZIFF / 2, 172);
    ctx.fillText(zahl, ZIFF / 2, 172); // zweimal: der Schein traegt weiter
    ctx.shadowBlur = 0;

    const verlauf = ctx.createLinearGradient(0, 62, 0, 262);
    verlauf.addColorStop(0, "#ffeec2");
    verlauf.addColorStop(0.45, "#f5c862");
    verlauf.addColorStop(1, "#c9923a");
    ctx.fillStyle = verlauf;
    ctx.fillText(zahl, ZIFF / 2, 172);

    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.font = "500 38px Inter, system-ui, sans-serif";
    ctx.letterSpacing = "8px";
    ctx.fillText(wort, ZIFF / 2, 312);
    ctx.letterSpacing = "0px";
  }

  function countdownBauen(gold, englisch) {
    const gruppe = new THREE.Group();
    const BREITE = TAFEL_BREITE, HOEHE = TAFEL_HOEHE, LUFT = TAFEL_LUFT;
    const gesamt = TAFELN.length * BREITE + (TAFELN.length - 1) * LUFT;

    /* Dunkler und deckender als zuvor. Die Tafeln standen vor dem
       hellen Morgenhimmel und dem Berg; bei 0x1b2436 mit 0.88
       Deckkraft verschwammen die Ziffern mit dem Hintergrund. */
    const rahmenMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0 });
    const kanteMat = new THREE.MeshStandardMaterial({ color: gold, roughness: 0.3, metalness: 0.65, transparent: true, opacity: 0 });
    const ziffernGeo = new THREE.PlaneGeometry(BREITE * 0.9, HOEHE * 0.9);

    const tafeln = TAFELN.map(function (feld, i) {
      const x = -gesamt / 2 + BREITE / 2 + i * (BREITE + LUFT);
      const tafel = new THREE.Group();
      tafel.position.x = x;

      const kante = new THREE.Mesh(new THREE.BoxGeometry(BREITE + 10, HOEHE + 10, 4), kanteMat);
      kante.position.z = -6; tafel.add(kante);
      const rahmen = new THREE.Mesh(new THREE.BoxGeometry(BREITE, HOEHE, 6), rahmenMat);
      rahmen.position.z = -2; tafel.add(rahmen);

      /* Zwei Ziffernflaechen uebereinander. Bei jedem Wechsel
         wird die eine aus- und die andere eingeblendet - deshalb
         zwei und nicht eine. */
      const lagen = [0, 1].map(function (n) {
        const leinwand = ziffernLeinwand();
        const tex = new THREE.CanvasTexture(leinwand);
        tex.anisotropy = 4;
        const mesh = new THREE.Mesh(ziffernGeo, new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0, depthWrite: false,
          /* Das ACES-Tonemapping der Szene laeuft am Ende bei
             Belichtung 0.64 - es zog das Gold der Ziffern nach
             Grau. Sie sind der einzige Teil der Szene, der nicht
             mitgestimmt werden soll: sie kommen so heraus, wie
             sie auf die Leinwand gezeichnet wurden. */
          toneMapped: false
        }));
        mesh.position.z = 2 + n * 0.4;
        tafel.add(mesh);
        return { leinwand: leinwand, tex: tex, mesh: mesh };
      });

      gruppe.add(tafel);
      return {
        id: feld.id,
        wort: englisch ? feld.wortEn : feld.wort,
        lagen: lagen,
        vorn: 0,       // welche Lage gerade sichtbar ist
        wert: null,    // zuletzt gezeichneter Wert
        blende: 1      // 1 = Wechsel fertig
      };
    });

    gruppe.userData.tafeln = tafeln;
    gruppe.userData.rahmenMat = rahmenMat;
    gruppe.userData.kanteMat = kanteMat;
    gruppe.userData.halbBreite = gesamt / 2;
    gruppe.visible = false;
    return gruppe;
  }

  /* ------------------------------------------------------
     WO STEHT DIE UHR AUF DEM SCHIRM?

     Die Tafeln haengen an einer festen Stelle in der 3D-Welt,
     der Text von Kapitel VII haengt am unteren Bildrand. Bei
     kurzen Fenstern wandert der Text in die Tafeln hinein -
     gemessen bei 883x563: "KAPITEL VII" stand mitten zwischen
     den Ziffern. Es gibt kein Seitenverhaeltnis, bei dem beides
     von sich aus zusammenpasst.

     Deshalb rechnet die Szene die Unterkante der Uhr in
     Bildschirmpixel um und schreibt sie als --fh-uhr-unten nach
     #home. Kapitel VII beginnt in der CSS darunter. Eine
     Richtung, keine Rueckkopplung: die Szene meldet, das Layout
     weicht aus.
  ------------------------------------------------------ */
  const ECKEN = [];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sy = -1; sy <= 1; sy += 2) ECKEN.push(new THREE.Vector3(sx, sy, 0));
  }
  const eckeHilf = new THREE.Vector3();

  function uhrUnterkante(gruppe, kamera, hoehePx) {
    const hb = gruppe.userData.halbBreite;
    const hh = TAFEL_HOEHE / 2 + 5;
    let unten = -Infinity;
    for (let i = 0; i < ECKEN.length; i++) {
      eckeHilf.set(ECKEN[i].x * hb, ECKEN[i].y * hh, 0);
      gruppe.localToWorld(eckeHilf);
      eckeHilf.project(kamera);
      // project() liefert -1..1 mit +1 oben; Bildschirm zaehlt von oben.
      const y = (1 - eckeHilf.y) * 0.5 * hoehePx;
      if (y > unten) unten = y;
    }
    return unten;
  }

  const BLENDE_MS = 200;

  function countdownAuffrischen(gruppe, gold, dt, deckkraft) {
    const tafeln = gruppe.userData.tafeln;
    gruppe.userData.rahmenMat.opacity = deckkraft * 0.88;
    gruppe.userData.kanteMat.opacity = deckkraft * 0.75;

    for (let i = 0; i < tafeln.length; i++) {
      const t = tafeln[i];
      const el = document.getElementById(t.id);
      const wert = el ? el.textContent.trim() : "00";

      if (wert !== t.wert) {
        if (t.wert === null) {
          // Erstes Zeichnen: ohne Ueberblenden direkt setzen.
          ziffernZeichnen(t.lagen[0].leinwand, wert, t.wort, gold);
          t.lagen[0].tex.needsUpdate = true;
          t.blende = 1;
        } else {
          const neu = 1 - t.vorn;
          ziffernZeichnen(t.lagen[neu].leinwand, wert, t.wort, gold);
          t.lagen[neu].tex.needsUpdate = true;
          t.vorn = neu;
          t.blende = 0;
        }
        t.wert = wert;
      }

      if (t.blende < 1) t.blende = Math.min(1, t.blende + dt * 1000 / BLENDE_MS);
      const e = t.blende * t.blende * (3 - 2 * t.blende);
      t.lagen[t.vorn].mesh.material.opacity = deckkraft * e;
      t.lagen[1 - t.vorn].mesh.material.opacity = deckkraft * (1 - e);
    }
  }

  /* ------------------------------------------------------
     DER HIMMEL ÜBER DER REISE

     Vorher stand die Sonne die ganzen 8000px zwischen 1,6 und
     4,0 Grad - es war durchgehend derselbe tiefe Sonnenaufgang,
     und der Himmel war eine leere Farbflaeche. Jetzt laeuft eine
     Zeitreise mit: Nacht, Daemmerung, Sturm, Morgen.

     Die Zahlen sind nicht frei erfunden, sondern die Groessen,
     die THREE.Sky aus der Atmosphaere rechnet:

       hoehe      Sonnenstand in Grad. Negativ = unter dem
                  Horizont, dann bleibt nur das Streulicht -
                  genau das macht die blaue Stunde.
       truebung   Dunst. Klare Nacht wenig, Sturm viel.
       rayleigh   Streuung an Luftmolekuelen. Hoch = tiefes
                  Blau oben und kraeftiges Rot am Horizont.
       mie        Streuung an Tropfen und Staub. Hoch = weisser
                  Schleier und ein grosser Hof um die Sonne.
  ------------------------------------------------------ */
  const HIMMEL_MARKEN = [
    // weg,  hoehe, truebung, rayleigh, mie,    richtung
    [0.00, -9.0, 1.6, 4.2, 0.0040, 202],  // Nacht
    [0.22, -3.5, 2.4, 4.0, 0.0050, 196],  // erstes Grau
    [0.40, 1.2, 5.0, 3.4, 0.0090, 188],  // Daemmerung, Morgenrot
    [0.52, 0.6, 8.5, 2.0, 0.0110, 180],  // Sturm: Dunst, Farbe raus
    [0.68, 0.9, 9.5, 1.8, 0.0120, 174],  // Sturm auf dem Hoehepunkt
    [0.82, 2.6, 7.0, 3.2, 0.0080, 166],  // es reisst auf
    [1.00, 5.5, 3.0, 3.8, 0.0035, 158]   // Morgen ueber der Insel
  ];

  function himmelBei(p, raus) {
    for (let i = 1; i < HIMMEL_MARKEN.length; i++) {
      if (p <= HIMMEL_MARKEN[i][0] || i === HIMMEL_MARKEN.length - 1) {
        const a = HIMMEL_MARKEN[i - 1], b = HIMMEL_MARKEN[i];
        const roh = klemm((p - a[0]) / (b[0] - a[0]), 0, 1);
        const t = roh * roh * (3 - 2 * roh);
        for (let k = 1; k <= 5; k++) raus[k - 1] = misch(a[k], b[k], t);
        return raus;
      }
    }
    return raus;
  }

  /* ---------- Wolken ----------
     Ein Dom um die Szene, auf dessen Innenseite eine Wolkendecke
     gezeichnet wird. Der Trick fuer echte Perspektive: die
     Blickrichtung wird auf eine waagerechte Ebene in
     Wolkenhoehe projiziert (dir.xz / dir.y). Dadurch draengen
     sich die Wolken zum Horizont hin zusammen, so wie am echten
     Himmel - eine Textur auf der Kugel wuerde dort stattdessen
     auseinanderlaufen.

     Die Form kommt aus fbm mit Domain Warping: das Rauschen
     verzerrt sich selbst, und daraus werden Ballen statt Flecken.
  ---------------------------------------------------------- */
  const WOLKEN_FRAG = [
    "precision highp float;",
    "uniform float uZeit;",
    "uniform float uDecke;",     // 0 klar, 1 zugezogen
    "uniform float uDeck;",       // Gesamtdeckkraft
    "uniform vec3  uSonne;",
    "uniform vec3  uHell;",
    "uniform vec3  uDunkel;",
    "varying vec3  vWelt;",
    "",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p), f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),",
    "             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float s = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }",
    "  return s;",
    "}",
    "void main(){",
    "  vec3 dir = normalize(vWelt - cameraPosition);",
    "  float h = dir.y;",
    "  if (h <= 0.015) discard;",
    /* Projektion auf die Wolkenebene - erst dadurch stimmt die
       Perspektive zum Horizont hin. */
    "  vec2 ebene = dir.xz / h * 0.55;",
    "  vec2 wind = vec2(uZeit * 0.9, uZeit * 0.35);",
    "  vec2 q = ebene * 0.011 + wind * 0.004;",
    /* Domain Warping: das Rauschen verschiebt seine eigenen
       Koordinaten. Ohne das bleiben es runde Flecken. */
    "  vec2 warp = vec2(fbm(q + 3.1), fbm(q + 7.7));",
    "  float d = fbm(q + warp * 1.6);",
    "  float schwelle = 1.02 - uDecke * 0.72;",
    "  float masse = smoothstep(schwelle, schwelle + 0.26, d);",
    "  if (masse <= 0.002) discard;",
    /* Beleuchtung: zur Sonne hin heller, dazu ein weicher Rand
       ueber die Dichte - das gibt den Wolken Volumen. */
    "  float zurSonne = max(dot(dir, normalize(uSonne)), 0.0);",
    "  float saum = smoothstep(0.0, 0.45, d - schwelle);",
    "  vec3 farbe = mix(uDunkel, uHell, clamp(saum * 0.75 + pow(zurSonne, 3.0) * 0.9, 0.0, 1.0));",
    /* Am Horizont in den Dunst auslaufen lassen - dort wird die
       Ebenen-Projektion sonst zur Singularitaet. */
    "  float rand = smoothstep(0.015, 0.22, h);",
    "  gl_FragColor = vec4(farbe, masse * rand * uDeck);",
    "}"
  ].join("\n");

  function wolkenBauen() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uZeit: { value: 0 },
        uDecke: { value: 0.35 },
        uDeck: { value: 0.9 },
        uSonne: { value: new THREE.Vector3(0, 0.2, -1) },
        uHell: { value: new THREE.Color(0xdfe4ee) },
        uDunkel: { value: new THREE.Color(0x39404f) }
      },
      vertexShader: [
        "varying vec3 vWelt;",
        "void main(){",
        "  vec4 w = modelMatrix * vec4(position, 1.0);",
        "  vWelt = w.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * w;",
        "}"
      ].join("\n"),
      fragmentShader: WOLKEN_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false
    });
    const netz = new THREE.Mesh(new THREE.SphereGeometry(9000, 24, 16), mat);
    netz.frustumCulled = false;
    netz.renderOrder = -5; // nach dem Himmel, vor allem anderen
    return netz;
  }

  /* ---------- Lichtstrahlen ----------
     Eine Scheibe direkt vor der Kamera, additiv. Gezeichnet wird
     ein Faecher aus der Bildschirmposition der Sonne; wie breit
     die einzelnen Strahlen sind, kommt aus einem Rauschen ueber
     dem Winkel. Das ist die billige Variante - ein echter
     Nachbearbeitungsschritt waere ein zweiter Renderdurchgang,
     und davon hat diese Szene schon einen fuer die
     Wasserspiegelung.
  ---------------------------------------------------------- */
  /* Abstand der Strahlen-Scheibe vor der Kamera. Muss groesser
     sein als deren Nahebene (1), sonst schneidet die sie weg. */
  const STRAHL_ABSTAND = 2;

  function strahlenBauen() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSonne: { value: new THREE.Vector2(0.5, 0.6) },
        uStaerke: { value: 0 },
        uZeit: { value: 0 },
        uFarbe: { value: new THREE.Color(0xffd9a0) },
        uSeite: { value: 1.7 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform vec2  uSonne;",
        "uniform float uStaerke;",
        "uniform float uZeit;",
        "uniform vec3  uFarbe;",
        "uniform float uSeite;",
        "varying vec2  vUv;",
        "float hash(float n){ return fract(sin(n) * 43758.5453); }",
        "float noise(vec2 p){",
        "  vec2 i = floor(p), f = fract(p);",
        "  vec2 u = f * f * (3.0 - 2.0 * f);",
        "  float a = hash(i.x + i.y * 57.0), b = hash(i.x + 1.0 + i.y * 57.0);",
        "  float c = hash(i.x + (i.y + 1.0) * 57.0), d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);",
        "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
        "}",
        "void main(){",
        "  if (uStaerke <= 0.001) discard;",
        /* Seitenverhaeltnis herausrechnen, sonst werden die
           Strahlen auf breiten Schirmen zu Ellipsen. */
        "  vec2 d = (vUv - uSonne) * vec2(uSeite, 1.0);",
        "  float weite = length(d);",
        "  float winkel = atan(d.y, d.x);",
        /* Zwei Lagen mit verschiedener Feinheit, langsam
           gegeneinander wandernd - so wirken die Strahlen wie
           von ziehenden Wolken zerschnitten. */
        "  float n = noise(vec2(winkel * 4.0, uZeit * 0.05)) * 0.6",
        "          + noise(vec2(winkel * 11.0, uZeit * 0.03 + 5.0)) * 0.4;",
        /* Eng gefasst blieb vom Faecher nur ein gleichmaessiger
           Hof - die Schwelle lag so hoch, dass fast das ganze
           Rauschen darunter wegfiel. Breiter gefasst treten
           einzelne Strahlen hervor. */
        "  n = smoothstep(0.30, 0.72, n);",
        "  float abfall = pow(max(0.0, 1.0 - weite * 1.25), 3.0);",
        "  float hof = pow(max(0.0, 1.0 - weite * 2.6), 6.0);",
        "  float licht = (abfall * n * 0.85 + hof * 0.5) * uStaerke;",
        "  gl_FragColor = vec4(uFarbe * licht, licht);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const netz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    netz.frustumCulled = false;
    netz.renderOrder = 900; // ganz zum Schluss, ueber die Szene
    return netz;
  }

  /* ------------------------------------------------------
     KRINGEL UNTER DEM ZEIGER

     Wo der Zeiger ueber das Wasser faehrt, zieht ein Ring auf
     und verklingt - wie bei einem hineingeworfenen Stein.

     Zwei Entscheidungen dahinter:

     1. Ein fester Vorrat an Ringen, kein Anlegen pro Ereignis.
        Die Maus liefert bis zu hundert Meldungen je Sekunde;
        wer daraus Geometrie erzeugt, beschaeftigt die
        Speicherbereinigung mehr als die Grafikkarte.
     2. Die Groesse haengt am Abstand zur Kamera. Ein Ring mit
        fester Weltgroesse ist direkt vor dem Bug ein Reifen und
        am Horizont ein unsichtbarer Punkt.
  ------------------------------------------------------ */
  function kringelBauen(anzahl) {
    const gruppe = new THREE.Group();
    gruppe.renderOrder = 5;
    /* Ein schmaler Ring mit Radius 1 - die Groesse macht
       ausschliesslich die Skalierung. */
    const geo = new THREE.RingGeometry(0.84, 1.0, 40, 1);
    geo.rotateX(-Math.PI / 2);
    const ringe = [];
    for (let i = 0; i < anzahl; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xcfe3ee, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      }));
      m.visible = false;
      m.userData = { alter: 0, dauer: 1, ziel: 1, x: 0, z: 0 };
      gruppe.add(m); ringe.push(m);
    }
    let naechster = 0;
    return {
      gruppe: gruppe,
      ringe: ringe,
      /* Reihum ueberschreiben: der aelteste Ring ist immer der,
         der als naechstes wieder gebraucht wird. */
      ausloesen: function (x, z, ziel) {
        const m = ringe[naechster];
        naechster = (naechster + 1) % ringe.length;
        m.userData.alter = 0;
        m.userData.dauer = 1.5 + Math.random() * 0.7;
        m.userData.ziel = ziel;
        m.userData.x = x; m.userData.z = z;
        m.position.set(x, 0, z);
        m.scale.setScalar(ziel * 0.08);
        m.visible = true;
      }
    };
  }

  /* ---------- Partikel ---------- */
  function partikelBauen(anzahl, tex, farbe, groesse, deckkraft) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(anzahl * 3).fill(-99999);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: tex, color: farbe, size: groesse, sizeAttenuation: true,
      transparent: true, opacity: deckkraft, depthWrite: false
    });
    const punkte = new THREE.Points(geo, mat);
    punkte.frustumCulled = false;
    return { punkte: punkte, pos: pos, anzahl: anzahl, zeiger: 0, leben: new Float32Array(anzahl), tempo: new Float32Array(anzahl * 3) };
  }

  /* ======================================================
     AUFBAU
  ====================================================== */
  function ozeanAufbauen() {
    const heim = document.getElementById("home");
    const huelle = document.getElementById("fh-ozean");
    if (!heim || !huelle) return;
    const leinwand = huelle.querySelector(".fh-ozean-leinwand");
    if (!leinwand) return;

    function flachBleiben() {
      /* Der Ersatz: nur der flache Countdown auf dunklem
         Verlauf. Die Kapiteltexte bleiben im Markup stehen und
         werden von der CSS ausgeblendet - sie beschreiben Bilder,
         die es ohne Szene nicht gibt. */
      const h = document.getElementById("home");
      h.classList.add("fh-ohne-ozean");
      h.classList.remove("fh-uhr-3d");
      /* Ohne Szene ist die Bahn nur einen Schirm hoch, es gibt
         nichts zu scrollen. Dann darf die Seite das senkrechte
         Wischen auch nicht fuer sich beanspruchen - sonst waere
         es tot, falls hier je wieder Inhalt dazukommt. */
      h.classList.remove("fh-eigener-scroll");
    }

    const webgl = window.fhWebGL;
    if (!webgl || typeof THREE === "undefined" || !THREE.Water || !THREE.Sky || webgl.reduzierteBewegung()) {
      flachBleiben();
      return;
    }

    const renderer = webgl.rendererErzeugen({ canvas: leinwand, alpha: false, antialias: true });
    if (!renderer) { flachBleiben(); return; }

    let stufeNr = stufeWaehlen();
    let stufe = STUFEN[stufeNr];

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, stufe.pixel));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.55;

    const szene = new THREE.Scene();
    szene.fog = new THREE.FogExp2(0xa79c96, 0.0016);
    const kamera = new THREE.PerspectiveCamera(48, 1, 1, 30000);

    /* ---------- Wasser ---------- */
    const wasserGeo = new THREE.PlaneGeometry(24000, 24000, stufe.wasserSeg, stufe.wasserSeg);
    const wasserGrund = wasserGeo.attributes.position.array.slice();
    let wasser;
    if (stufe.spiegel > 0) {
      wasser = new THREE.Water(wasserGeo, {
        textureWidth: stufe.spiegel, textureHeight: stufe.spiegel,
        waterNormals: normalTextur(stufe.spiegel >= 512 ? 512 : 256, 6),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffd9a8,
        waterColor: 0x0e1726,
        distortionScale: 3.6,
        fog: true
      });
      wasser.material.uniforms.size.value = 9.0;
    } else {
      /* Niedrige Stufe: kein Water-Shader. Der kostet einen
         zweiten kompletten Renderdurchgang pro Bild, nur fuer die
         Spiegelung. Eine normal beleuchtete Flaeche mit derselben
         Normaltextur sieht deutlich schlichter aus, laeuft dafuer
         ueberhaupt. */
      const normal = normalTextur(256, 6);
      normal.repeat.set(60, 60);
      wasser = new THREE.Mesh(wasserGeo, new THREE.MeshStandardMaterial({
        color: 0x14203a, roughness: 0.28, metalness: 0.55,
        normalMap: normal, normalScale: new THREE.Vector2(1.6, 1.6)
      }));
    }
    wasser.rotation.x = -Math.PI / 2;
    szene.add(wasser);

    const himmel = new THREE.Sky();
    himmel.scale.setScalar(25000);
    szene.add(himmel);
    const hu = himmel.material.uniforms;
    hu.turbidity.value = 8.5; hu.rayleigh.value = 2.6;
    hu.mieCoefficient.value = 0.005; hu.mieDirectionalG.value = 0.86;

    const sonneLicht = new THREE.DirectionalLight(0xffc79a, 2.4);
    szene.add(sonneLicht);
    const fuell = new THREE.DirectionalLight(0xa9b4d8, 0.85);
    szene.add(fuell);
    const hemi = new THREE.HemisphereLight(0x9aa6d9, 0x0d1018, 1.0);
    szene.add(hemi);
    szene.add(new THREE.AmbientLight(0x3d4159, 0.75));

    const sonne = new THREE.Vector3();
    const lichtRichtung = new THREE.Vector3();
    function sonneSetzen(hoehe, richtung) {
      const theta = THREE.MathUtils.degToRad(richtung);
      sonne.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - hoehe), theta);
      hu.sunPosition.value.copy(sonne);
      /* Der Himmel darf die Sonne unter den Horizont schicken -
         das ist die blaue Stunde. Das Licht auf Schiff und Wasser
         darf es nicht: eine Sonne bei -9 Grad beleuchtet die
         Segel von unten, und das sieht nicht nach Nacht aus,
         sondern nach vergessenem Vorzeichen. Also bleibt die
         Lichtrichtung ueber dem Horizont; wie dunkel es ist,
         macht allein die Helligkeit weiter unten. */
      lichtRichtung.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(hoehe, 2.0)), theta);
      if (wasser.material.uniforms) wasser.material.uniforms.sunDirection.value.copy(lichtRichtung);
      sonneLicht.position.copy(lichtRichtung).multiplyScalar(4000);
    }
    sonneSetzen(2.2, 178);

    /* Wolken und Lichtstrahlen gibt es erst ab der mittleren
       Stufe. Beides ist je ein bildschirmfuellender Shader-Durchgang;
       auf einem Geraet, das schon beim blanken Wasser strauchelt,
       waere das der Tropfen, der die Bilderrate kippt. */
    let wolken = stufe.name === "niedrig" ? null : wolkenBauen();
    if (wolken) szene.add(wolken);
    let wu = wolken ? wolken.material.uniforms : null;

    let strahlen = stufe.name === "niedrig" ? null : strahlenBauen();
    if (strahlen) {
      /* Als Kind der Kamera: dann steht die Scheibe von selbst
         immer im Bild, ohne sie pro Bild mitzuschleppen. Damit
         die Kamera ihre Kinder aber auch mitrechnet, muss sie
         selbst im Szenenbaum haengen - eine freischwebende
         Kamera aktualisiert keine Nachkommen. */
      szene.add(kamera);
      strahlen.position.set(0, 0, -STRAHL_ABSTAND);
      kamera.add(strahlen);
    }
    let su = strahlen ? strahlen.material.uniforms : null;

    /* Farben der Wolken: nachts fast schwarz, im Sturm bleiern,
       zum Morgen hin von unten angezuendet. Die Objekte werden
       einmal angelegt und pro Bild nur umgerechnet. */
    const W_HELL = [new THREE.Color(0x2d3448), new THREE.Color(0x6e7488), new THREE.Color(0xffd7a6)];
    const W_DUNKEL = [new THREE.Color(0x0d1120), new THREE.Color(0x272b38), new THREE.Color(0x6a5163)];
    /* Nebel: Nacht -> Dunst der Daemmerung -> Morgendunst. */
    const N_FOG = [new THREE.Color(0x0a1020), new THREE.Color(0x53525e), new THREE.Color(0xa79c96)];
    const himmelWerte = [0, 0, 0, 0, 0];
    const sonneBild = new THREE.Vector3();
    const kamBlick = new THREE.Vector3();

    const schiff = schiffBauen(stufe);
    szene.add(schiff);

    const insel = inselBauen(stufe);
    insel.position.set(0, 0, -4200);
    szene.add(insel);

    const goldWert = (function () {
      try {
        return getComputedStyle(document.documentElement).getPropertyValue("--fh-gold-bright").trim() || "#f0c96a";
      } catch (err) { return "#f0c96a"; }
    })();
    const englisch = (localStorage.getItem("wheelLang") || "de") === "en";
    /* Hoehe der Tafeln ueber der Insel. Bei 760 standen sie im
       oberen Bildrand und wurden vom Letterbox-Balken
       angeschnitten - die Schlusskamera schaut auf y=270 herab,
       alles deutlich darueber laeuft oben aus dem Bild. 430
       setzt sie ueber die Bergsilhouette, aber sicher innen. */
    const UHR_HOEHE = 430;

    const uhr3d = countdownBauen(goldWert, englisch);
    uhr3d.position.copy(insel.position).add(new THREE.Vector3(0, UHR_HOEHE, 900));
    szene.add(uhr3d);

    /* ---------- Kringel unter dem Zeiger ----------
       Der Treffpunkt wird NICHT ueber einen Raycaster gegen das
       Wasser gesucht: das Wasser ist eine Flaeche mit bis zu
       150x150 Feldern, und die Maus meldet sich bis zu hundert
       Mal je Sekunde. Stattdessen wird der Strahl mit der
       gedachten Ebene y=0 geschnitten - eine Handvoll
       Rechenschritte statt tausender Dreiecksproben. */
    /* Vorratsgroesse ist nicht geraten: die Drosselung laesst
       hoechstens 1000/130 = 7,7 Ringe je Sekunde zu, und ein Ring
       lebt bis zu 2,2 s - es koennen also bis zu 17 gleichzeitig
       offen sein. Bei 14 wuerde der aelteste mitten im Aufziehen
       ueberschrieben und spraenge sichtbar auf Anfang zurueck. */
    const kringel = kringelBauen(stufe.name === "niedrig" ? 8 : 18);
    szene.add(kringel.gruppe);
    const zeigerStrahl = new THREE.Raycaster();
    const zeigerNdc = new THREE.Vector2();
    const wasserEbene = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const treffer = new THREE.Vector3();
    let letzterKringel = 0, letzteZeigerX = -1e9, letzteZeigerY = -1e9;

    function zeigerMelden(klientX, klientY, jetzt) {
      /* Nicht bei jeder Meldung einen Ring: das waeren bis zu
         hundert je Sekunde. Ein Mindestabstand in Zeit UND Weg -
         sonst haeuft ein stillstehender Zeiger Ringe uebereinander. */
      if (jetzt - letzterKringel < 130) return;
      if (Math.hypot(klientX - letzteZeigerX, klientY - letzteZeigerY) < 26) return;

      const r = huelle.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      zeigerNdc.x = ((klientX - r.left) / r.width) * 2 - 1;
      zeigerNdc.y = -((klientY - r.top) / r.height) * 2 + 1;
      if (Math.abs(zeigerNdc.x) > 1 || Math.abs(zeigerNdc.y) > 1) return;

      zeigerStrahl.setFromCamera(zeigerNdc, kamera);
      /* Zeigt der Strahl in den Himmel, gibt es keinen
         Schnittpunkt - dann passiert schlicht nichts. */
      if (!zeigerStrahl.ray.intersectPlane(wasserEbene, treffer)) return;

      const weite = treffer.distanceTo(kamera.position);
      if (weite > 4200) return; // am Horizont waere es ein Punkt
      letzterKringel = jetzt;
      letzteZeigerX = klientX; letzteZeigerY = klientY;
      kringel.ausloesen(treffer.x, treffer.z, klemm(weite * 0.05, 14, 210));
    }

    huelle.addEventListener("pointermove", function (e) {
      /* Der Finger loest denselben Effekt aus. pointermove deckt
         Maus, Stift und Finger gemeinsam ab; passive:true, damit
         das senkrechte Wischen der Seite nicht gebremst wird. */
      zeigerMelden(e.clientX, e.clientY, performance.now());
    }, { passive: true });
    huelle.addEventListener("pointerdown", function (e) {
      /* Beim Aufsetzen sofort einen Ring, ohne Wegschwelle -
       sonst braeuchte eine Beruehrung erst eine Bewegung. */
      letzteZeigerX = -1e9; letzteZeigerY = -1e9; letzterKringel = 0;
      zeigerMelden(e.clientX, e.clientY, performance.now());
    }, { passive: true });

    const gischtTex = weicheTextur("rgba(255,255,255,0.95)", "rgba(255,255,255,0.35)");
    const kielwasser = partikelBauen(stufe.wake, gischtTex, 0xe8eef2, 26, 0.4);
    const spritzer = partikelBauen(stufe.spray, gischtTex, 0xf2f6f8, 9, 0.75);
    szene.add(kielwasser.punkte, spritzer.punkte);

    const voegel = new THREE.Group();
    const vogelMat = new THREE.LineBasicMaterial({ color: 0x2a2630, transparent: true, opacity: 0 });
    for (let i = 0; i < (stufe.name === "niedrig" ? 6 : 14); i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9, 0, 0), new THREE.Vector3(0, 4, 0), new THREE.Vector3(9, 0, 0)]);
      const v = new THREE.Line(g, vogelMat);
      v.userData = { a: Math.random() * Math.PI * 2, r: 200 + Math.random() * 700, y: 260 + Math.random() * 320, s: 0.15 + Math.random() * 0.2, ph: Math.random() * 6 };
      v.scale.setScalar(2.2 + Math.random() * 2);
      voegel.add(v);
    }
    voegel.position.copy(insel.position);
    szene.add(voegel);

    const bahn = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4, 0, -2000), new THREE.Vector3(6, 0, -1250), new THREE.Vector3(9, 0, -700),
      new THREE.Vector3(13, 0, -330), new THREE.Vector3(18, 0, -140), new THREE.Vector3(24, 0, 20),
      new THREE.Vector3(34, 0, 130), new THREE.Vector3(58, 0, 205), new THREE.Vector3(88, 0, 160),
      new THREE.Vector3(96, 0, 20), new THREE.Vector3(78, 0, -220), new THREE.Vector3(50, 0, -640),
      new THREE.Vector3(26, 0, -1300), new THREE.Vector3(30, 0, -2300), new THREE.Vector3(80, 0, -3200)
    ], false, "catmullrom", 0.35);

    const MARKEN = [[0, 0], [0.12, 0.08], [0.24, 0.17], [0.34, 0.27], [0.42, 0.38], [0.5, 0.47], [0.6, 0.54], [0.72, 0.63], [0.86, 0.8], [1, 1]];
    function schiffU(p) {
      for (let i = 1; i < MARKEN.length; i++) {
        if (p <= MARKEN[i][0]) {
          const p0 = MARKEN[i - 1][0], u0 = MARKEN[i - 1][1], p1 = MARKEN[i][0], u1 = MARKEN[i][1];
          const t = (p - p0) / (p1 - p0);
          return misch(u0, u1, t * t * (3 - 2 * t));
        }
      }
      return 1;
    }

    /* Alle Vektoren einmal anlegen und pro Bild nur neu befuellen.
       Der Entwurf legt im Kamera-Rig pro Bild ein halbes Dutzend
       Vector3 an - bei 60 Bildern/s sind das 360 Wegwerf-Objekte
       je Sekunde, die die Speicherbereinigung wieder einsammeln
       muss. Genau das ruckelt dann alle paar Sekunden. */
    const schiffPos = new THREE.Vector3(), tangente = new THREE.Vector3();
    const kamPos = new THREE.Vector3(-10, 11, 170), kamZiel = new THREE.Vector3(0, 10, -600);
    const vorherSchiff = new THREE.Vector3();
    const tAnfahrt = new THREE.Vector3(), tFolge = new THREE.Vector3(), tEnthuellung = new THREE.Vector3();
    const bAnfahrt = new THREE.Vector3(), bFolge = new THREE.Vector3(), bEnthuellung = new THREE.Vector3();
    const hilf = new THREE.Vector3(), quer = new THREE.Vector3(), hinten = new THREE.Vector3();
    const uhrBlick = new THREE.Vector3();
    const uhr = new THREE.Clock();
    let geglaettet = 0;
    let bildNr = 0;
    let letzteUhrKante = -1;
    let uhrGemeldet = false;

    function groesseSetzen() {
      const b = huelle.clientWidth || window.innerWidth, h = huelle.clientHeight || window.innerHeight;
      renderer.setSize(b, h, false);
      kamera.aspect = b / h; kamera.updateProjectionMatrix();
    }
    groesseSetzen();
    window.addEventListener("resize", groesseSetzen);

    function ausstossen(sys, x, y, z, vx, vy, vz, leben) {
      const i = sys.zeiger = (sys.zeiger + 1) % sys.anzahl;
      sys.pos[i * 3] = x; sys.pos[i * 3 + 1] = y; sys.pos[i * 3 + 2] = z;
      sys.tempo[i * 3] = vx; sys.tempo[i * 3 + 1] = vy; sys.tempo[i * 3 + 2] = vz;
      sys.leben[i] = leben;
    }
    function partikelSchritt(sys, dt, schwere) {
      for (let i = 0; i < sys.anzahl; i++) {
        if (sys.leben[i] <= 0) continue;
        sys.leben[i] -= dt;
        sys.tempo[i * 3 + 1] -= schwere * dt;
        sys.pos[i * 3] += sys.tempo[i * 3] * dt;
        sys.pos[i * 3 + 1] += sys.tempo[i * 3 + 1] * dt;
        sys.pos[i * 3 + 2] += sys.tempo[i * 3 + 2] * dt;
        if (sys.leben[i] <= 0) sys.pos[i * 3 + 1] = -99999;
      }
      sys.punkte.geometry.attributes.position.needsUpdate = true;
    }

    const wacht = webgl.bildwacht({ bilder: 70, grenzeMs: 26 });
    let laeuft = true;

    function herunterschalten() {
      /* Nicht aufgeben, sondern eine Stufe tiefer. Aufgegeben
         wird erst, wenn auch die niedrigste Stufe nicht traegt -
         dann ist der flache Countdown ehrlicher als eine
         Diaschau. */
      if (stufeNr >= STUFEN.length - 1) {
        laeuft = false;
        window.removeEventListener("resize", groesseSetzen);
        renderer.dispose();
        flachBleiben();
        return;
      }
      stufeNr++;
      stufe = STUFEN[stufeNr];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, stufe.pixel));
      if (stufe.name === "niedrig") {
        insel.userData.nebel.visible = false;
        voegel.visible = false;
        /* Wolken und Strahlen sind zwei bildschirmfuellende
           Durchgaenge - genau das, was auf der untersten Stufe
           als Erstes weg muss. Nur unsichtbar schalten reicht
           nicht, der Speicher soll auch frei werden. */
        if (wolken) { szene.remove(wolken); wolken.geometry.dispose(); wolken.material.dispose(); wolken = null; wu = null; }
        if (strahlen) { kamera.remove(strahlen); strahlen.geometry.dispose(); strahlen.material.dispose(); strahlen = null; su = null; }
      }
      groesseSetzen();
    }

    function bild(zeitstempel) {
      if (!laeuft) return;
      requestAnimationFrame(bild);

      const dt = Math.min(uhr.getDelta(), 0.05);
      const t = uhr.elapsedTime;

      /* Nicht zeichnen, wenn die Startseite gar nicht zu sehen
         ist. Der Wert wird trotzdem weiter geglaettet, damit die
         Szene beim Zurueckwechseln nicht springt. */
      if (!heim.classList.contains("active-page")) return;

      if (wacht(zeitstempel)) { herunterschalten(); return; }

      const ziel = parseFloat(heim.style.getPropertyValue("--fh-weg")) || 0;
      geglaettet += (ziel - geglaettet) * (1 - Math.pow(0.0025, dt));
      const p = geglaettet;

      /* Wasser */
      if (wasser.material.uniforms) wasser.material.uniforms.time.value += dt * 0.5;
      bildNr++;
      if (bildNr % stufe.wellenTakt === 0) {
        const wp = wasserGeo.attributes.position;
        for (let i = 0; i < wp.count; i++) {
          const x = wasserGrund[i * 3], y = wasserGrund[i * 3 + 1];
          wp.setZ(i, wellenHoehe(x, -y, t) * 0.9);
        }
        wp.needsUpdate = true;
      }

      /* Stimmung */
      himmelBei(p, himmelWerte);
      hu.turbidity.value = himmelWerte[1];
      hu.rayleigh.value = himmelWerte[2];
      hu.mieCoefficient.value = himmelWerte[3];
      sonneSetzen(himmelWerte[0], himmelWerte[4]);
      /* Nachts und im Sturm steht die Sonne tief oder gar nicht;
         Helligkeit und Dunstfarbe haengen daher am Sonnenstand,
         nicht mehr bloss am zurueckgelegten Weg. */
      const tag = klemm((himmelWerte[0] + 6) / 12, 0, 1);
      szene.fog.density = misch(0.0019, 0.00024, weich(0.5, 0.9, p));
      /* Der Dunst muss mit dem Himmel dunkeln. Bei fester
         Helligkeit stuende sonst ein hellgrauer Streifen unter
         einem Nachthimmel.

         Gemischt wird in RGB, NICHT ueber den Farbton: der Weg
         von Nachtblau (0.62) nach Morgenorange (0.085) fuehrt
         quer durch den Farbkreis, und der liegt dazwischen im
         Gruenen. Genau das hat die Insel im Sturm giftgruen
         eingefaerbt. */
      szene.fog.color.copy(N_FOG[0]).lerp(N_FOG[1], klemm(tag * 1.6, 0, 1)).lerp(N_FOG[2], tag * tag);
      /* Der Schluss lief bei 0.64 in die Saettigung: Sonnenhof
         und Dunst gingen zusammen in ein weisses Feld ueber der
         Insel - genau dort, wo der Countdown steht. */
      renderer.toneMappingExposure = misch(0.42, 0.54, weich(0.35, 0.92, p));
      hemi.intensity = misch(0.45, 1.15, tag);
      sonneLicht.intensity = misch(0.35, 3.4, tag * tag);
      fuell.intensity = misch(1.1, 0.85, tag);

      /* Kringel aufziehen lassen. Sie liegen auf dem bewegten
         Wasser, nicht auf einer gedachten glatten Flaeche -
         darum wird die Wellenhoehe jedes Bild neu geholt. */
      for (let i = 0; i < kringel.ringe.length; i++) {
        const m = kringel.ringe[i];
        if (!m.visible) continue;
        const d = m.userData;
        d.alter += dt;
        const f = d.alter / d.dauer;
        if (f >= 1) { m.visible = false; m.material.opacity = 0; continue; }
        /* Schnell aufziehen, langsam auslaufen: so sieht es aus
           wie eine Welle, die Schwung verliert. */
        m.scale.setScalar(d.ziel * (0.08 + 0.92 * Math.sqrt(f)));
        m.material.opacity = 0.42 * (1 - f) * (1 - f);
        m.position.y = wellenHoehe(d.x, d.z, t) + 1.2;
      }

      /* Schiff auf der Bahn, an die Wellen gekoppelt */
      const u = schiffU(p);
      bahn.getPointAt(klemm(u, 0, 1), schiffPos);
      bahn.getTangentAt(klemm(u, 0, 1), tangente);
      const wy = wellenHoehe(schiffPos.x, schiffPos.z, t);
      const gx = (wellenHoehe(schiffPos.x + 16, schiffPos.z, t) - wellenHoehe(schiffPos.x - 16, schiffPos.z, t)) / 32;
      const gz = (wellenHoehe(schiffPos.x, schiffPos.z + 26, t) - wellenHoehe(schiffPos.x, schiffPos.z - 26, t)) / 52;
      schiff.position.set(schiffPos.x, wy - 3.4, schiffPos.z);
      schiff.rotation.set(gz * 1.5 + Math.sin(t * 0.9) * 0.012, Math.atan2(tangente.x, tangente.z), -gx * 1.6 + Math.sin(t * 0.63 + 1) * 0.02);

      /* Die Segel nur baeuchen, solange das Schiff gross im Bild
         ist. Ab der Insel-Enthuellung ist es ein Punkt am
         Horizont - 16 Segel pro Bild neu zu tessellieren waere
         dort reine Rechenzeit ohne Bild. */
      if (p < 0.82) {
        const segel = schiff.userData.segel;
        for (let i = 0; i < segel.length; i++) baeuchen(segel[i], t + i * 0.6, 1.6 + (i % 3) * 0.4);
      }

      const tempo = vorherSchiff.distanceTo(schiff.position) / Math.max(dt, 0.001);
      vorherSchiff.copy(schiff.position);

      /* Kielwasser und Spritzer */
      const rate = klemm(tempo / 60, 0, 1);
      if (Math.random() < 0.55 + rate) {
        hinten.copy(tangente).multiplyScalar(-22);
        quer.set(-tangente.z, 0, tangente.x);
        for (let s = -1; s <= 1; s += 2) {
          const w = s * (5 + Math.random() * 5);
          ausstossen(kielwasser,
            schiff.position.x + hinten.x + quer.x * w, wy + 1, schiff.position.z + hinten.z + quer.z * w,
            quer.x * w * 0.25, 0.3, quer.z * w * 0.25, 5 + Math.random() * 4);
        }
      }
      if (rate > 0.25 && Math.random() < rate) {
        hilf.copy(tangente).multiplyScalar(24);
        for (let k = 0; k < 3; k++) {
          ausstossen(spritzer,
            schiff.position.x + hilf.x + (Math.random() - 0.5) * 8, wy + 6, schiff.position.z + hilf.z + (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 26, 16 + Math.random() * 22, (Math.random() - 0.5) * 26, 1.2 + Math.random());
        }
      }
      partikelSchritt(kielwasser, dt, -1.2);
      partikelSchritt(spritzer, dt, 28);

      /* Kamera: drei Einstellungen, ineinander geblendet */
      const wiegen = Math.sin(t * 0.55) * 1.5 + wellenHoehe(kamPos.x, kamPos.z, t) * 0.25;
      const ruckeln = function (a) { return (wrauschen(t * 1.4, a) - 0.5) * 2; };
      const mFolge = weich(0.42, 0.54, p);
      const mEnthuellung = weich(0.78, 0.92, p);

      tAnfahrt.set(
        misch(-16, 30, weich(0.05, 0.46, p)),
        misch(16, 8.5, weich(0.05, 0.4, p)) + wiegen,
        misch(230, 118, weich(0.02, 0.46, p))
      );
      hinten.copy(tangente).multiplyScalar(-misch(128, 230, weich(0.56, 0.86, p)));
      quer.set(-tangente.z, 0, tangente.x).multiplyScalar(misch(-30, -7, weich(0.56, 0.8, p)));
      tFolge.copy(schiff.position).add(hinten).add(quer).setY(misch(27, 92, weich(0.58, 0.86, p)) + wiegen * 0.5);
      const winkel = misch(Math.PI * 0.34, Math.PI * 0.1, weich(0.84, 1, p));
      const radius = misch(4200, 2650, weich(0.8, 1, p));
      tEnthuellung.copy(insel.position).add(
        hilf.set(Math.sin(winkel) * radius * 0.5, misch(400, 640, weich(0.82, 1, p)), Math.cos(winkel) * radius)
      );
      tAnfahrt.lerp(tFolge, mFolge).lerp(tEnthuellung, mEnthuellung);
      kamPos.lerp(tAnfahrt, 1 - Math.pow(0.0012, dt));

      bAnfahrt.copy(schiff.position).setY(misch(16, 26, weich(0.2, 0.5, p)));
      bFolge.copy(schiff.position).add(hilf.copy(tangente).multiplyScalar(misch(180, 1300, weich(0.62, 0.9, p)))).setY(misch(24, 140, weich(0.66, 0.88, p)));
      bEnthuellung.copy(insel.position).setY(misch(140, 270, weich(0.84, 1, p)));
      bAnfahrt.lerp(bFolge, mFolge).lerp(bEnthuellung, mEnthuellung);
      kamZiel.lerp(bAnfahrt, 1 - Math.pow(0.0018, dt));

      kamera.position.copy(kamPos);
      kamera.position.x += ruckeln(1) * 0.9 * (1 - mEnthuellung);
      kamera.position.y += ruckeln(7) * 0.6;
      kamera.up.set(ruckeln(13) * 0.006, 1, 0);
      fuell.position.copy(kamera.position).add(hilf.set(120, 220, 60));
      fuell.target.position.copy(schiff.position);
      fuell.target.updateMatrixWorld();
      kamera.lookAt(kamZiel);
      kamera.fov = misch(44, 60, weich(0.18, 0.46, p)) - 17 * weich(0.48, 0.8, p) + 2 * weich(0.88, 1, p);
      kamera.updateProjectionMatrix();

      /* Insel */
      insel.visible = p > 0.58;
      voegel.visible = p > 0.7 && stufe.name !== "niedrig";
      insel.userData.schein.material.opacity = (0.3 + 0.16 * Math.sin(t * 1.3)) * (0.35 + 0.65 * weich(0.62, 0.95, p));
      insel.userData.gischt.material.opacity = 0.22 + 0.1 * Math.sin(t * 0.9);

      /* Brandung: zwei Schwingungen verschiedener Laenge
         uebereinander, damit das Atmen nicht zaehlbar wird. */
      const br = insel.userData.brandung;
      br.material.opacity = (0.34 + 0.16 * Math.sin(t * 0.55) + 0.07 * Math.sin(t * 1.43 + 1.2))
        * (0.4 + 0.6 * weich(0.6, 0.92, p));
      br.scale.setScalar(1 + 0.012 * Math.sin(t * 0.55));

      /* Lichter im Dschungel, jedes mit eigener Frequenz. */
      insel.userData.lichter.children.forEach(function (l) {
        const d = l.userData;
        l.material.opacity = (d.grund + 0.35 * Math.sin(t * d.tempo + d.ph) + 0.12 * Math.sin(t * d.tempo * 2.7 + d.ph))
          * weich(0.62, 0.88, p);
      });

      /* Wasserfall: die Textur nach unten schieben. */
      if (insel.userData.wasserfall) {
        const wf = insel.userData.wasserfall;
        wf.tex.offset.y -= dt * 0.85;
        if (wf.tex.offset.y < -1) wf.tex.offset.y += 1;
        wf.fuss.material.opacity = (0.34 + 0.14 * Math.sin(t * 2.1)) * weich(0.6, 0.9, p);
      }
      if (insel.userData.nebel.visible) {
        insel.userData.nebel.children.forEach(function (s, i) {
          s.position.x += Math.sin(t * 0.06 + i) * 0.35;
          s.material.opacity = (0.1 + 0.08 * Math.sin(t * 0.3 + i)) * (1 - weich(0.8, 1, p) * 0.5);
        });
      }
      vogelMat.opacity = 0.5 * weich(0.82, 0.95, p);
      voegel.children.forEach(function (v) {
        v.userData.a += v.userData.s * dt;
        v.position.set(Math.cos(v.userData.a) * v.userData.r, v.userData.y + Math.sin(t + v.userData.ph) * 14, Math.sin(v.userData.a) * v.userData.r - 200);
        v.rotation.y = -v.userData.a;
        v.rotation.z = Math.sin(t * 3 + v.userData.ph) * 0.5;
      });

      /* Countdown: ab Kapitel VII, eingeblendet. Er dreht sich um
         die Hochachse zur Kamera, damit er beim Umkreisen der
         Insel lesbar bleibt - aber NUR um die Hochachse. Ein
         vollstaendiges Ausrichten wuerde die Neigung der
         Schlusskamera wegnehmen, und die Tafeln staenden wieder
         so flach im Bild wie ein aufgeklebtes HTML-Element. */
      const uhrAn = weich(0.87, 0.95, p);
      uhr3d.visible = uhrAn > 0.004;
      if (uhr3d.visible) {
        uhr3d.position.y = insel.position.y + UHR_HOEHE + Math.sin(t * 0.5) * 9;
        uhrBlick.copy(kamera.position);
        uhrBlick.y = uhr3d.position.y;
        uhr3d.lookAt(uhrBlick);
        uhr3d.updateMatrixWorld();
        countdownAuffrischen(uhr3d, goldWert, dt, uhrAn);

        /* Kapitel VII darf erst unterhalb der Tafeln beginnen -
           siehe uhrUnterkante(). Nur schreiben, wenn sich der
           Wert um mehr als ein Pixel geaendert hat: sonst
           stuende in jedem Bild ein Stilattribut-Schreibzugriff,
           und das Layout wuerde bei jedem Wiegen neu gerechnet. */
        const unten = uhrUnterkante(uhr3d, kamera, huelle.clientHeight || 1);
        if (Math.abs(unten - letzteUhrKante) > 1) {
          letzteUhrKante = unten;
          heim.style.setProperty("--fh-uhr-unten", Math.round(unten) + "px");
        }
        if (!uhrGemeldet) { uhrGemeldet = true; heim.classList.add("fh-uhr-3d"); }
      } else if (uhrGemeldet) {
        uhrGemeldet = false;
        heim.classList.remove("fh-uhr-3d");
      }

      /* Wolken: die Decke zieht zum Sturm hin zu und reisst zum
         Morgen wieder auf. Dieselben drei Phasen wie am Himmel,
         nur als eine Zahl. */
      if (wu) {
        const zieht = weich(0.38, 0.62, p);
        const reisst = weich(0.72, 0.95, p);
        wu.uZeit.value = t;
        wu.uDecke.value = klemm(0.30 + 0.62 * zieht - 0.52 * reisst, 0, 1);
        wu.uDeck.value = misch(0.9, 0.72, reisst);
        wu.uSonne.value.copy(sonne);
        /* Der Sturmanteil faellt zum Morgen wieder heraus, sonst
           blieben die Wolken bleiern, waehrend die Sonne schon
           steht. */
        const sturm = zieht * (1 - reisst);
        const morgen = weich(0.78, 1, p);
        wu.uHell.value.copy(W_HELL[0]).lerp(W_HELL[1], sturm).lerp(W_HELL[2], morgen);
        wu.uDunkel.value.copy(W_DUNKEL[0]).lerp(W_DUNKEL[1], sturm).lerp(W_DUNKEL[2], morgen);
      }

      /* Lichtstrahlen: erst wenn die Decke aufreisst und die
         Sonne wirklich ueber dem Horizont steht. */
      if (su) {
        /* Die Scheibe haengt an der Kamera, deren Bildwinkel sich
           waehrend der Fahrt aendert - also pro Bild neu auf das
           Sichtfeld spannen, sonst klafft ein Rand. */
        const hoch = 2 * Math.tan(THREE.MathUtils.degToRad(kamera.fov) / 2) * STRAHL_ABSTAND;
        strahlen.scale.set(hoch * kamera.aspect, hoch, 1);
        su.uSeite.value = kamera.aspect;
        su.uZeit.value = t;

        kamera.getWorldDirection(kamBlick);
        /* Steht die Sonne hinter der Kamera, liefert project()
           trotzdem Koordinaten - gespiegelt. Ohne diese Pruefung
           hinge der Faecher auf der falschen Bildseite. */
        const vorn = kamBlick.dot(sonne);
        sonneBild.copy(sonne).multiplyScalar(20000).project(kamera);
        su.uSonne.value.set(sonneBild.x * 0.5 + 0.5, sonneBild.y * 0.5 + 0.5);
        su.uStaerke.value = vorn <= 0.02 ? 0 :
          weich(0.72, 0.9, p) * klemm(himmelWerte[0] / 3, 0, 1) *
          klemm((vorn - 0.02) * 6, 0, 1) * (1 - weich(0.9, 1, p) * 0.55) * 0.7;
        su.uFarbe.value.setHSL(misch(0.085, 0.11, weich(0.8, 1, p)), 0.85, 0.72);
      }

      renderer.render(szene, kamera);
    }

    /* Erst zeichnen, wenn die Schrift steht - sonst wird die
       erste Ziffer mit der Ersatzschrift auf die Textur gebrannt
       und bleibt dort, bis die Sekunde wechselt. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        uhr3d.userData.tafeln.forEach(function (t) { t.wert = null; });
      });
    }

    requestAnimationFrame(bild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ozeanAufbauen);
  } else {
    ozeanAufbauen();
  }
})();
