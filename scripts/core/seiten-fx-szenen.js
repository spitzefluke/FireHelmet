/* ======================================================
   DIE SZENEN DER SEITEN-EFFEKTFLÄCHE
   ---------------------------------------------------
   Hier steht, wie jede Seite im Hintergrund aussieht.
   scripts/core/seiten-fx.js baut daraus die eine Leinwand und
   schaltet beim Seitenwechsel um - warum nur eine, steht dort.

   Jeder Eintrag ist eine Funktion, die eine Szene zurueckgibt:

     { szene, kamera, aktualisieren(zeit, deckkraft), groesse(b, h, seite) }

   Sie wird erst aufgerufen, wenn die Seite das erste Mal betreten
   wird. Wer nie ins Turnier geht, zahlt auch nichts dafuer.

   Die meisten Szenen sind ein bildschirmfuellender Shader - dafuer
   gibt es flaeche() weiter unten, damit nicht jedes Mal dasselbe
   Geruest dasteht. Der Schatzstaub des Schatzrads ist die Ausnahme:
   er ist eine Punktwolke mit eigener Kamera.

   ALLE Shader teilen sich den GRUND-Block: dieselben Zufalls- und
   Rauschfunktionen, dieselben Uniformen (uTime, uRes, uDeck). uDeck
   ist die Ueberblendung beim Seitenwechsel und MUSS am Ende in die
   Alpha-Ausgabe multipliziert werden, sonst springt der Effekt beim
   Wechsel hart ins Bild.
====================================================== */

(function () {
  "use strict";

  /* ---------------------------------------------------
     GEMEINSAMER KOPF FÜR ALLE SHADER
     Ohne "#version 300 es": three.js stellt die Zeile bei
     glslVersion GLSL3 selbst voran, und sie muss die erste sein.
  --------------------------------------------------- */
  const GRUND = `precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform float uDeck;

out vec4 fragColor;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/* Wertrauschen mit weicher Ueberblendung - Grundlage von fbm(). */
float rauschen(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i),               hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

/* Fuenf Lagen Rauschen uebereinander: gibt die wolkige Struktur,
   aus der Nebel, Schleier und Wasserlicht gebaut sind. */
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * rauschen(p);
    p *= 2.02;
    a *= 0.5;
  }
  return s;
}

/* Bildkoordinaten 0..1, und dieselben mit ausgeglichenem
   Seitenverhaeltnis - sonst werden Kreise auf breiten Bildschirmen
   zu Ellipsen. */
vec2 bild()  { return gl_FragCoord.xy / uRes; }
vec2 gleich() { vec2 uv = bild(); return vec2(uv.x * (uRes.x / uRes.y), uv.y); }

/* Einheitlicher Abschluss: Helligkeit bestimmt die Deckkraft, und
   die Ueberblendung des Seitenwechsels wird eingerechnet. */
void ausgeben(vec3 farbe, float staerke) {
  fragColor = vec4(farbe, clamp(staerke, 0.0, 1.0) * uDeck);
}
`;

  /* ---------------------------------------------------
     GERÜST FÜR EINEN BILDSCHIRMFÜLLENDEN SHADER
  --------------------------------------------------- */
  function flaeche(THREE, frag, extraUniforms, beiZeit) {
    const uniforms = Object.assign({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDeck: { value: 1 },
    }, extraUniforms || {});

    const netz = window.fhWebGL.vollbildNetz(GRUND + frag, uniforms);
    const szene = new THREE.Scene();
    szene.add(netz);

    return {
      szene: szene,
      kamera: new THREE.Camera(),
      groesse: function (b, h) { uniforms.uRes.value.set(b, h); },
      aktualisieren: function (t, deck) {
        uniforms.uTime.value = t;
        uniforms.uDeck.value = deck;
        if (beiZeit) beiZeit(uniforms, t);
      },
    };
  }

  /* =========================================================
     SHOP - MÜNZSTAUB
     Goldene Koerner, die in drei Ebenen unterschiedlich schnell
     nach unten rieseln und dabei seitlich trudeln. Die hinteren
     Ebenen sind kleiner und dunkler - das gibt Tiefe, ohne dass
     eine zweite Zeichnung noetig waere.
  ========================================================= */
  const SHOP = `
void main() {
  vec2 uv = bild();
  vec2 p  = gleich();
  vec3 farbe = vec3(0.0);

  for (int k = 0; k < 3; k++) {
    float f = float(k);
    float dichte = 7.0 + f * 5.5;
    float tempo  = 0.030 + f * 0.018;

    vec2 g = p * dichte;
    g.y += uTime * tempo * dichte;
    g.x += sin(uTime * 0.16 + f * 2.0 + floor(g.y) * 0.7) * 0.22;

    vec2 zelle = floor(g);
    vec2 lokal = fract(g) - 0.5;
    float r = hash21(zelle + f * 37.0);
    if (r < 0.84) continue;

    vec2 mitte = (vec2(hash21(zelle + 1.3), hash21(zelle + 7.7)) - 0.5) * 0.6;
    float d = length(lokal - mitte);
    float korn = smoothstep(0.16 - f * 0.030, 0.0, d);
    korn *= 0.60 + 0.40 * sin(uTime * 2.2 + r * 40.0);
    /* Heller Kern, weicher Hof - sonst sind es nur graue Punkte. */
    korn += smoothstep(0.34 - f * 0.06, 0.0, d) * 0.22;
    farbe += vec3(1.00, 0.82, 0.42) * korn * (1.15 - f * 0.28);
  }

  /* Warmer Schein am unteren Rand - als lege unten der Schatz. */
  farbe += vec3(0.50, 0.35, 0.12) * smoothstep(0.85, 0.0, uv.y) * 0.16;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.6);
}
`;

  /* =========================================================
     RANGLISTE - AUFSTEIGENDE LICHTSÄULEN
     Schmale Balken, die von unten hochwandern und oben ausbleichen.
     Bewusst zurueckhaltend: davor steht eine Tabelle mit Zahlen,
     die lesbar bleiben muss.
  ========================================================= */
  const RANGLISTE = `
void main() {
  vec2 uv = bild();
  vec3 farbe = vec3(0.0);

  for (int k = 0; k < 16; k++) {
    float f = float(k);
    float x     = hash11(f * 3.71);
    float breit = 0.004 + hash11(f * 9.13) * 0.010;
    float tempo = 0.020 + hash11(f * 5.31) * 0.045;
    float ph    = hash11(f * 2.17);

    /* Kopf der Saeule wandert nach oben und faengt unten neu an. */
    float kopf = fract(uTime * tempo + ph) * 1.3 - 0.15;

    float quer  = smoothstep(breit, 0.0, abs(uv.x - x));
    float laeng = smoothstep(kopf - 0.42, kopf, uv.y) * smoothstep(kopf + 0.02, kopf - 0.02, uv.y);

    vec3 ton = mix(vec3(0.20, 0.60, 1.00), vec3(0.94, 0.79, 0.42), hash11(f * 7.77));
    farbe += ton * quer * laeng * 1.15;
  }

  /* Oben ausblenden, damit die Ueberschrift frei steht. */
  farbe *= smoothstep(1.02, 0.55, uv.y);

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.4);
}
`;

  /* =========================================================
     ANMELDEN - RUHIGER ATEM
     Ein einziger grosser Lichtschein, der langsam heller und
     dunkler wird. Hier soll nichts vom Namensfeld ablenken, also
     kein Korn, keine Linien, keine schnelle Bewegung.
  ========================================================= */
  const ANMELDEN = `
void main() {
  vec2 p = gleich() - vec2(uRes.x / uRes.y * 0.5, 0.5);

  /* Der Mittelpunkt wandert auf einer sehr langsamen Lissajous-Bahn,
     damit es nicht wie ein starrer Verlauf aussieht. */
  p -= vec2(sin(uTime * 0.09) * 0.06, cos(uTime * 0.07) * 0.05);

  float d = length(p);
  float atem = 0.62 + 0.38 * sin(uTime * 0.42);
  float schein = exp(-d * d * (5.2 - atem * 1.6));

  vec3 farbe = mix(vec3(0.10, 0.34, 0.62), vec3(0.30, 0.66, 1.00), atem) * schein * 0.42;

  /* Eine zweite, viel weitere Lage - nimmt dem Schein die harte
     Kante nach aussen. */
  farbe += vec3(0.06, 0.16, 0.34) * exp(-d * d * 1.1) * 0.30;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.8);
}
`;

  /* =========================================================
     SUPPORT UND BEWERTUNG - RUHIGER VERLAUF
     Zwei breite, schraege Baender, die langsam durchs Bild ziehen.
     Beide Seiten teilen sich den Shader; die Farbe unterscheidet
     sie (uTon).
  ========================================================= */
  const BAENDER = `
uniform vec3 uTon;

void main() {
  vec2 uv = bild();

  /* Schraege Achse: 0 links unten, 1 rechts oben. */
  float achse = uv.x * 0.75 + uv.y * 0.55;

  /* Hoehere Frequenz = mehr, schmalere Baender. Bei 3.2 spannte ein
     einziger Grat ueber den halben Bildschirm und stand dem
     Formular im Weg. */
  float b1 = sin(achse * 6.5 - uTime * 0.20);
  float b2 = sin(achse * 10.5 + uTime * 0.13 + 1.7);

  /* Die Baender bekommen weiche Kanten und ueberlagern sich. */
  /* Enge Grate statt breiter Flaechen: bei weiten Uebergaengen
     deckte ein einziges Band den halben Bildschirm zu und
     uebertoente den Inhalt. */
  float staerke = smoothstep(0.72, 1.0, b1) * 0.85
                + smoothstep(0.86, 1.0, b2) * 0.50;

  /* Leichtes Wolkenrauschen darueber, damit die Baender nicht wie
     gedruckte Streifen wirken. */
  staerke *= 0.65 + 0.35 * fbm(uv * 2.4 + vec2(uTime * 0.05, 0.0));

  /* 0.30 allein liess die Baender unter 10 von 255 - gemessen. */
  vec3 farbe = uTon * staerke * 0.30 * 1.5;
  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.7);
}
`;


  /* =========================================================
     SPIELOTHEK - NEON-SCHLEIER
     Warme Vorhaenge aus Licht, die langsam durchs Bild wehen.
  ========================================================= */
  const SPIELOTHEK = `
void main() {
  vec2 uv = bild();
  vec2 p  = gleich();

  /* Zwei Rauschlagen mit unterschiedlichem Tempo uebereinander -
     das ergibt den Eindruck von Rauch, durch den Licht faellt. */
  float n1 = fbm(vec2(p.x * 2.1, p.y * 1.3 - uTime * 0.06));
  float n2 = fbm(vec2(p.x * 3.4 + 5.0, p.y * 2.0 + uTime * 0.04));

  float schleier = smoothstep(0.42, 0.78, n1 * 0.65 + n2 * 0.45);

  /* Farbe wandert zwischen Magenta und Bernstein - Spielhalle. */
  float misch = 0.5 + 0.5 * sin(uTime * 0.23 + p.x * 1.6);
  vec3 ton = mix(vec3(0.86, 0.20, 0.62), vec3(1.00, 0.66, 0.22), misch);

  vec3 farbe = ton * schleier * 0.30;

  /* Ein paar helle Streifen, wie Leuchtroehren hinter dem Rauch. */
  float roehre = smoothstep(0.985, 1.0, sin(p.x * 9.0 - uTime * 0.35));
  farbe += vec3(1.0, 0.85, 0.55) * roehre * 0.22 * (0.4 + 0.6 * n1);

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.5);
}
`;

  /* =========================================================
     COMMUNITY-BOSS - NEBEL IN DER PHASENFARBE
     Der Nebel traegt die Farbe der aktuellen Boss-Phase. Die setzt
     community-boss.js ueber window.fhBossFarbe - so muss der Shader
     nichts ueber Spielregeln wissen, und neue Phasen wirken von
     selbst.
  ========================================================= */
  const BOSS = `
uniform vec3 uTon;

void main() {
  vec2 uv = bild();
  vec2 p  = gleich();

  /* Nebel steigt langsam auf und wabert seitlich. */
  float n = fbm(vec2(p.x * 1.8 + sin(uTime * 0.07) * 0.4,
                     p.y * 2.4 - uTime * 0.045));
  float nebel = smoothstep(0.35, 0.85, n);

  /* Von unten am dichtesten - der Boss steht im Dunst. */
  nebel *= smoothstep(1.05, 0.10, uv.y);

  vec3 farbe = uTon * nebel * 0.95;

  /* Langsamer Herzschlag im Zentrum. */
  vec2 m = p - vec2(uRes.x / uRes.y * 0.5, 0.42);
  float puls = exp(-dot(m, m) * 3.0) * (0.45 + 0.55 * sin(uTime * 0.9));
  farbe += uTon * puls * 0.32;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.5);
}
`;

  /* =========================================================
     TURNIER - VERZWEIGENDE LICHTLINIEN
     Waagerechte Linien, die sich nach rechts hin aufspalten - die
     Form eines Turnierbaums, nur abstrahiert.
  ========================================================= */
  const TURNIER = `
void main() {
  vec2 uv = bild();
  vec3 farbe = vec3(0.0);

  /* Vier Runden. Je weiter rechts, desto weniger Linien - wie im
     K.-o.-Baum. */
  for (int r = 0; r < 4; r++) {
    float fr = float(r);
    float anzahl = 8.0 / pow(2.0, fr);
    float xVon = fr * 0.25;
    float xBis = xVon + 0.25;

    /* Nur im Abschnitt dieser Runde zeichnen. */
    float imFeld = step(xVon, uv.x) * step(uv.x, xBis);
    if (imFeld < 0.5) continue;

    float sp = floor(uv.y * anzahl);
    float mitte = (sp + 0.5) / anzahl;
    float linie = smoothstep(0.0055, 0.0, abs(uv.y - mitte));

    /* Ein Lichtpunkt laeuft die Linie entlang. */
    float lauf = fract(uTime * 0.09 + hash11(sp * 3.1 + fr * 7.3));
    float punkt = smoothstep(0.10, 0.0, abs(uv.x - (xVon + lauf * 0.25)));

    farbe += vec3(0.94, 0.79, 0.42) * linie * (0.22 + punkt * 1.5);
  }

  /* Nach rechts heller: dort steht das Finale. */
  farbe *= 0.55 + 0.45 * uv.x;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.4);
}
`;

  /* =========================================================
     CREW - WANDERNDE LICHTKEGEL
     Weiche Scheinwerfer, die langsam ueber die Flaeche streichen,
     wie auf einer Buehne vor dem Auftritt.
  ========================================================= */
  const CREW = `
void main() {
  vec2 p = gleich();
  float seite = uRes.x / uRes.y;
  vec3 farbe = vec3(0.0);

  for (int k = 0; k < 3; k++) {
    float f = float(k);
    /* Jeder Kegel haengt oben und schwenkt hin und her. */
    float x = (0.22 + 0.28 * f) * seite + sin(uTime * (0.11 + f * 0.04) + f * 2.2) * 0.30 * seite;
    vec2 quelle = vec2(x, 1.25);

    vec2 d = p - quelle;
    float laenge = length(d);
    /* Winkel zum Lot - daraus die Kegelform. */
    float kegel = 1.0 - smoothstep(0.0, 0.42, abs(atan(d.x, -d.y)));
    float weite = smoothstep(1.5, 0.1, laenge);

    vec3 ton = mix(vec3(0.30, 0.66, 1.00), vec3(0.96, 0.80, 0.44), hash11(f * 4.3));
    farbe += ton * kegel * kegel * weite * 0.60;
  }

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.5);
}
`;

  /* =========================================================
     SCHIFFSREPARATUR - WASSERLICHT
     Das Netzmuster, das Wellen auf einen Grund werfen. Entsteht
     aus zwei versetzten Rauschlagen, deren Abstand zueinander die
     hellen Adern bildet.
  ========================================================= */
  const WERFT = `
void main() {
  vec2 uv = bild();
  vec2 p  = gleich() * 3.2;

  float a = fbm(p + vec2(uTime * 0.11, uTime * 0.06));
  float b = fbm(p + vec2(3.7 - uTime * 0.08, 1.9 + uTime * 0.05));

  /* Wo die beiden Lagen gleich hoch stehen, liegt eine Ader. */
  float ader = 1.0 - smoothstep(0.0, 0.09, abs(a - b));
  ader = pow(ader, 2.2);

  vec3 farbe = vec3(0.32, 0.68, 0.92) * ader * 0.42;

  /* Tiefe: unten dunkler, als schaue man in den Rumpf. */
  farbe *= 0.45 + 0.55 * smoothstep(0.0, 0.9, uv.y);

  /* Ein warmer Schein von der Werftlampe oben links. */
  vec2 m = gleich() - vec2(0.25, 0.85);
  farbe += vec3(0.90, 0.62, 0.28) * exp(-dot(m, m) * 5.0) * 0.14;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.5);
}
`;

  /* =========================================================
     DER FALL - KAPITAENSKAJUETE BEI LAMPENLICHT
     ---------------------------------------------------
     Vorher drehte sich hier ein Suchscheinwerfer. Der gehoert an
     eine Gefaengnismauer, nicht auf ein Schiff - und er passte
     schon gar nicht zu einer Ermittlungstafel, die an einer Wand
     haengt. Jetzt ist es ein Raum: dunkles Holz, eine schwankende
     Oellampe als einzige Lichtquelle, und Schatten, die mit ihr
     mitwandern.

     Der Seegang steuert alles aus EINER Zahl (schwung). Liefen
     Lampe, Lichtkegel und Schatten getrennt, waeren es drei Dinge,
     die zufaellig gleichzeitig wackeln - mit einer gemeinsamen
     Quelle ist es ein Schiff, das sich bewegt.
  ========================================================= */
  const FALL = `
void main() {
  vec2 uv = bild();
  float seite = uRes.x / uRes.y;
  vec2 p = gleich();

  /* Der Seegang. Zwei ungleiche Perioden, damit es nicht metronomisch
     wird - ein Schiff schaukelt nicht im Takt. */
  float schwung = sin(uTime * 0.42) * 0.6 + sin(uTime * 0.23 + 1.3) * 0.4;

  /* Die Lampe haengt oben und pendelt mit. */
  vec2 lampe = vec2(seite * 0.5 + schwung * 0.075, 0.14);

  /* Ihr Licht: nah hell, nach aussen schnell abfallend. Der Flackerwert
     ist bewusst schwach - eine Lampe, die sichtbar blinkt, sieht nach
     Wackelkontakt aus, nicht nach Docht. */
  float flackern = 0.94 + 0.06 * sin(uTime * 7.3) * sin(uTime * 3.1);
  vec2 d = p - lampe;
  float licht = exp(-dot(d, d) * 3.4) * flackern;

  vec3 farbe = vec3(1.00, 0.72, 0.38) * licht * 0.85;

  /* Der Docht selbst - ein kleiner, harter Kern im Zentrum. */
  farbe += vec3(1.0, 0.92, 0.72) * exp(-dot(d, d) * 90.0) * 0.55;

  /* Die Holzwand dahinter. Waagerechte Planken mit unruhiger
     Maserung; sie wird nur dort sichtbar, wo Licht hinfaellt. */
  float planke = fract(p.y * 5.2);
  float fuge = smoothstep(0.045, 0.0, min(planke, 1.0 - planke));
  float maser = fbm(vec2(p.x * 2.2, p.y * 24.0)) * 0.5 + 0.5;

  vec3 holz = mix(vec3(0.26, 0.15, 0.08), vec3(0.38, 0.23, 0.12), maser);
  holz = mix(holz, vec3(0.12, 0.07, 0.04), fuge);
  farbe += holz * licht * 1.15;

  /* Schatten, die mit der Lampe wandern: zwei senkrechte Streifen,
     die sich gegenlaeufig zum Pendel verschieben - so, wie ein
     Balken vor der Lampe seinen Schatten wirft. */
  float b1 = smoothstep(0.055, 0.0, abs(p.x - (seite * 0.20 - schwung * 0.13)));
  float b2 = smoothstep(0.045, 0.0, abs(p.x - (seite * 0.80 - schwung * 0.17)));
  farbe *= 1.0 - (b1 + b2) * 0.55;

  /* Aussen wird es dunkel - die Lampe reicht nicht bis in die Ecken.
     Genau das macht die Kajuete zum Raum statt zur Flaeche. */
  farbe *= smoothstep(1.35, 0.20, length(uv - vec2(0.5, 0.38)));

  /* Ein Hauch Staub im Lichtkegel. */
  float korn = hash21(gl_FragCoord.xy + floor(uTime * 12.0));
  farbe += vec3(korn) * licht * 0.045;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.6);
}
`;

  /* =========================================================
     STREAMRÄTSEL - STÖRBILD
     Waagerechte Versaetze, Farbkanaltrennung und ein wandernder
     Suchlaufbalken. Loest den ruhigen roten Schein ab, den die
     Seite bisher hatte.
  ========================================================= */
  const STOERBILD = `
void main() {
  vec2 uv = bild();

  /* Zeilenweiser Versatz - nur in Schueben, nicht dauernd. */
  float bloecke = floor(uv.y * 44.0);
  float schub = step(0.93, hash21(vec2(bloecke, floor(uTime * 5.0))));
  float versatz = (hash21(vec2(bloecke, floor(uTime * 5.0) + 9.0)) - 0.5) * 0.10 * schub;

  vec2 v = vec2(uv.x + versatz, uv.y);

  /* Grundschleier aus Rauschen. */
  float g = fbm(vec2(v.x * 3.0, v.y * 6.0 - uTime * 0.25));

  /* Farbkanaltrennung. */
  float r = fbm(vec2(v.x * 3.0 + 0.02, v.y * 6.0 - uTime * 0.25));
  float b = fbm(vec2(v.x * 3.0 - 0.02, v.y * 6.0 - uTime * 0.25));

  vec3 farbe = vec3(r, g * 0.55, b) * 0.30;
  farbe *= vec3(1.25, 0.55, 0.62);

  /* Suchlaufbalken, der langsam durchs Bild wandert. */
  float balken = fract(uv.y + uTime * 0.10);
  farbe += vec3(1.0, 0.35, 0.35) * smoothstep(0.96, 1.0, balken) * 0.30;

  /* Feine Zeilenstruktur. */
  farbe *= 0.80 + 0.20 * sin(uv.y * uRes.y * 0.55);

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.5);
}
`;

  /* =========================================================
     WOCHENRENNEN - NACH STRECKENTHEMA
     Neun Strecken in scripts/race/race-data.js, jede mit eigener
     Grund- und Akzentfarbe. Die beiden kommen als Uniform herein,
     der Shader kennt keine Streckennamen. Kommt eine zehnte
     Strecke dazu, passt der Hintergrund von selbst.
  ========================================================= */
  const RENNEN = `
uniform vec3  uGrund;
uniform vec3  uAkzent;
uniform float uStil;   // 0 neutral, 1 Hitze, 2 Neon, 3 Sturm, 4 Wasser, 5 Wolken

/* Ob ein Stil gemeint ist. Ganzzahlvergleich in float - der Wert
   kommt aus einer festen Tabelle, es gibt also keine krummen
   Zwischenwerte, gegen die man sich absichern muesste. */
float ist(float wert) { return step(wert - 0.5, uStil) * step(uStil, wert + 0.5); }

void main() {
  vec2 uv = bild();
  vec2 p  = gleich();

  /* HITZE: der ganze Blick flimmert, wie ueber heissem Sand. Die
     Verzerrung sitzt VOR allem anderen, damit auch die Streifen
     mitwabern - ein flimmernder Untergrund unter starren Streifen
     saehe aus wie ein Fehler. */
  float hitze = ist(1.0);
  p.x += hitze * sin(p.y * 22.0 + uTime * 3.4) * 0.010;
  p.y += hitze * sin(p.x * 17.0 + uTime * 2.6) * 0.006;
  uv.x += hitze * sin(uv.y * 30.0 + uTime * 3.1) * 0.006;

  /* Ziehende Schwaden in der Grundfarbe der Strecke - Staub,
     Wasser oder Wolken, je nachdem. Wasser zieht langsamer und
     breiter, Wolken noch langsamer. */
  float tempoDunst = 0.10 + ist(4.0) * (-0.055) + ist(5.0) * (-0.07);
  float dunst = fbm(vec2(p.x * 1.6 - uTime * tempoDunst, p.y * 2.6 + uTime * 0.03));
  vec3 farbe = uGrund * smoothstep(0.30, 0.85, dunst) * 0.55;

  /* Tempo-Streifen. Beim Neon-Stil sind sie schmaler, schneller und
     kraeftiger - dort SIND sie das Motiv, nicht nur Beiwerk. */
  float neon = ist(2.0);
  float schaerfe = mix(0.006, 0.0025, neon);
  float staerke  = mix(0.55, 1.15, neon);
  float zahl     = mix(1.0, 1.7, neon);

  for (int k = 0; k < 5; k++) {
    float f = float(k);
    float y = hash11(f * 5.7);
    float tempo = (0.35 + hash11(f * 3.3) * 0.55) * zahl;
    float x = fract(uTime * tempo + hash11(f * 8.1));

    float band = smoothstep(schaerfe, 0.0, abs(uv.y - y));
    float kopf = smoothstep(0.22, 0.0, abs(uv.x - x));
    farbe += uAkzent * band * kopf * staerke;
  }

  /* WASSER: lange, flache Wellenkaemme, die von unten heraufziehen. */
  float wasser = ist(4.0);
  if (wasser > 0.5) {
    float w = sin(uv.y * 26.0 - uTime * 0.9 + sin(uv.x * 3.0 + uTime * 0.4) * 1.4);
    farbe += uAkzent * smoothstep(0.86, 1.0, w) * 0.30 * smoothstep(0.0, 0.7, uv.y);
  }

  /* WOLKEN: breite, weiche Baender, die waagerecht durchziehen. */
  float wolken = ist(5.0);
  if (wolken > 0.5) {
    float b = fbm(vec2(p.x * 0.9 - uTime * 0.045, p.y * 1.8));
    farbe += uAkzent * smoothstep(0.55, 0.95, b) * 0.28;
  }

  /* STURM: unregelmaessige Blitze. Ein Blitz braucht einen harten
     Einsatz und ein weiches Nachglimmen - deshalb der steile
     smoothstep auf den Bruchteil der Sekunde, nicht ein Sinus. */
  float sturm = ist(3.0);
  if (sturm > 0.5) {
    float takt = floor(uTime * 0.7);
    float rest = fract(uTime * 0.7);
    float wann = hash11(takt * 7.3);
    if (wann > 0.62) {
      float schlag = smoothstep(0.10, 0.0, rest) + smoothstep(0.30, 0.16, rest) * 0.35;
      float wo = hash11(takt * 3.1);
      float naehe = smoothstep(0.35, 0.0, abs(uv.x - wo));
      farbe += uAkzent * schlag * naehe * 0.9;
      farbe += vec3(0.9) * schlag * 0.10;
    }
  }

  /* Horizont: unten heller, wie aufgewirbelter Untergrund. */
  farbe += uGrund * smoothstep(0.55, 0.0, uv.y) * 0.30;

  ausgeben(farbe, max(max(farbe.r, farbe.g), farbe.b) * 1.4);
}
`;

  /* =========================================================
     LOGBÜCHER UND KAPITELANSICHT - TAUWERK
     Der Threads-Shader aus React Bits (siehe
     scripts/stories/story-threads.js fuer Herkunft und Lizenz),
     hier auf den gemeinsamen GRUND-Block umgestellt: uRes statt
     iResolution, uTime statt iTime, und die Ueberblendung des
     Seitenwechsels kommt dazu.
  ========================================================= */
  const TAUWERK = `
#define PI 3.1415926538
const int u_line_count = 32;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
  vec2 Pi = floor(P);
  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
  Pt += vec2(26.0, 161.0).xyxy;
  Pt *= Pt;
  Pt = Pt.xzxz * Pt.yyww;
  vec4 hash_x = fract(Pt * (1.0 / 951.135664));
  vec4 hash_y = fract(Pt * (1.0 / 642.949883));
  vec4 grad_x = hash_x - 0.49999;
  vec4 grad_y = hash_y - 0.49999;
  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
      * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
  grad_results *= 1.4142135623730950;
  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
             * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
  vec4 blend2 = vec4(blend, vec2(1.0 - blend));
  return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float einPixel(float count) { return (1.0 / max(uRes.x, uRes.y)) * count; }

float lineFn(vec2 st, float width, float perc, float amplitude, float distance) {
  float split_point = 0.1 + perc * 0.4;
  float finalAmplitude = smoothstep(split_point, 0.7, st.x) * 0.5 * amplitude;
  float time_scaled = uTime / 10.0;
  float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

  float xnoise = mix(
    Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
    Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
    st.x * 0.3);

  float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

  float start = smoothstep(y + (width / 2.0) + (u_line_blur * einPixel(1.0) * blur), y, st.y);
  float ende  = smoothstep(y, y - (width / 2.0) - (u_line_blur * einPixel(1.0) * blur), st.y);

  return clamp((start - ende) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))), 0.0, 1.0);
}

void main() {
  vec2 uv = bild();
  float staerke = 1.0;
  for (int i = 0; i < u_line_count; i++) {
    float p = float(i) / float(u_line_count);
    staerke *= (1.0 - lineFn(uv, u_line_width * einPixel(1.0) * (1.0 - p), p, 1.4, 0.35));
  }
  float wert = 1.0 - staerke;
  ausgeben(vec3(0.84, 0.66, 0.31) * wert, wert * 0.85);
}
`;

  /* ---------------------------------------------------
     REGISTER
  --------------------------------------------------- */
  /* Hex-Farbe aus den Daten in einen Shader-Vektor. Faellt still
     auf die Ersatzfarbe zurueck, wenn etwas fehlt - ein
     Hintergrund darf nie der Grund sein, dass eine Seite kaputt
     geht. */
  function tonAus(THREE, hex, ersatz) {
    try {
      const c = new THREE.Color(hex);
      return new THREE.Vector3(c.r, c.g, c.b);
    } catch (err) {
      return ersatz;
    }
  }

  /* SCHATZRAD - SCHATZSTAUB
     Die einzige Szene, die kein Vollbild-Shader ist: eine
     Punktwolke mit eigener Kamera. Herkunft und Lizenz stehen in
     scripts/wheel/wheel-particles.js, von wo sie hierher gezogen
     ist, damit alle Seiteneffekte an einer Stelle liegen. */
  const STAUB_VERT = `
attribute vec3 position;
attribute vec4 zufall;
attribute vec3 farbe;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uBaseSize;
varying vec4 vZufall;
varying vec3 vFarbe;
void main() {
  vZufall = zufall;
  vFarbe = farbe;
  vec3 pos = position * 10.0;
  pos.z *= 10.0;
  vec4 mPos = modelMatrix * vec4(pos, 1.0);
  mPos.x += sin(uTime * zufall.z + 6.28 * zufall.w) * mix(0.1, 1.5, zufall.x);
  mPos.y += sin(uTime * zufall.y + 6.28 * zufall.x) * mix(0.1, 1.5, zufall.w);
  mPos.z += sin(uTime * zufall.w + 6.28 * zufall.y) * mix(0.1, 1.5, zufall.z);
  vec4 mvPos = viewMatrix * mPos;
  gl_PointSize = (uBaseSize * (1.0 + (zufall.x - 0.5))) / length(mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

  const STAUB_FRAG = `
precision highp float;
uniform float uTime;
uniform float uDeck;
varying vec4 vZufall;
varying vec3 vFarbe;
void main() {
  vec2 uv = gl_PointCoord.xy;
  float d = length(uv - vec2(0.5));
  float kreis = smoothstep(0.5, 0.32, d) * 0.8;
  gl_FragColor = vec4(vFarbe + 0.15 * sin(uv.yxx + uTime + vZufall.y * 6.28), kreis * uDeck);
}
`;

  function schatzstaub(THREE) {
    const ANZAHL = 220;
    const FARBEN = [
      [0.84, 0.66, 0.31],   // --fh-gold
      [0.26, 0.72, 1.00],   // --fh-cold
      [1.00, 0.95, 0.84],   // warmes Weiss
    ];

    const orte = new Float32Array(ANZAHL * 3);
    const zufall = new Float32Array(ANZAHL * 4);
    const farben = new Float32Array(ANZAHL * 3);

    for (let i = 0; i < ANZAHL; i++) {
      /* Gleichmaessig in einer Kugel: im Wuerfel ziehen, ausserhalb
         verwerfen, dann mit der dritten Wurzel auf den Radius
         abbilden. Ohne das saessen die Ecken voll. */
      let x, y, z, l;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        l = x * x + y * y + z * z;
      } while (l > 1 || l === 0);
      const r = Math.cbrt(Math.random());
      orte.set([x * r, y * r, z * r], i * 3);
      zufall.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      farben.set(FARBEN[(Math.random() * FARBEN.length) | 0], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(orte, 3));
    geo.setAttribute("zufall", new THREE.BufferAttribute(zufall, 4));
    geo.setAttribute("farbe", new THREE.BufferAttribute(farben, 3));

    /* Kein glslVersion: der Shader bleibt GLSL 1. three.js reicht
       ihn dann unveraendert durch und setzt die Matrix-Uniformen
       trotzdem selbst. */
    const material = new THREE.RawShaderMaterial({
      vertexShader: STAUB_VERT,
      fragmentShader: STAUB_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeck: { value: 1 },
        uBaseSize: { value: 300 },
      },
    });

    const punkte = new THREE.Points(geo, material);
    /* Der Shader verschiebt die Punkte selbst - die Huellkugel aus
       den rohen Orten passt danach nicht mehr. */
    punkte.frustumCulled = false;

    const szene = new THREE.Scene();
    szene.add(punkte);
    const kamera = new THREE.PerspectiveCamera(15, 1, 0.1, 200);
    kamera.position.set(0, 0, 20);

    let vergangen = 0;
    let letzte = 0;

    return {
      szene: szene,
      kamera: kamera,
      groesse: function (b, h, seite) {
        kamera.aspect = seite;
        kamera.updateProjectionMatrix();
        /* gl_PointSize rechnet in Geraetepunkten - ohne die
           Pixeldichte waeren die Koerner auf feinen Bildschirmen
           kleiner. b/seite ergibt die Hoehe in Geraetepunkten,
           geteilt durch die CSS-Hoehe ist das die Dichte. */
        material.uniforms.uBaseSize.value = 300 * Math.max(1, b / Math.max(1, window.innerWidth));
      },
      aktualisieren: function (t, deck) {
        vergangen += (letzte ? Math.min(t - letzte, 0.1) : 0.016) * 120;
        letzte = t;
        material.uniforms.uTime.value = vergangen * 0.001;
        material.uniforms.uDeck.value = deck;
        punkte.rotation.x = Math.sin(vergangen * 0.0002) * 0.1;
        punkte.rotation.y = Math.cos(vergangen * 0.0005) * 0.15;
        punkte.rotation.z += 0.0012;
      },
    };
  }

  window.fhSeitenSzenen = {
    shop: function (THREE) { return flaeche(THREE, SHOP); },

    leaderboard: function (THREE) { return flaeche(THREE, RANGLISTE); },

    login: function (THREE) { return flaeche(THREE, ANMELDEN); },

    support: function (THREE) {
      return flaeche(THREE, BAENDER, { uTon: { value: new THREE.Vector3(0.24, 0.58, 0.92) } });
    },

    rating: function (THREE) {
      // Waermer als der Support - Bewertung ist die freundlichere
      // der beiden Seiten.
      return flaeche(THREE, BAENDER, { uTon: { value: new THREE.Vector3(0.86, 0.66, 0.34) } });
    },

    spielothek: function (THREE) { return flaeche(THREE, SPIELOTHEK); },

    characters: function (THREE) { return flaeche(THREE, CREW); },

    "ship-repair": function (THREE) { return flaeche(THREE, WERFT); },

    "detective-case": function (THREE) { return flaeche(THREE, FALL); },

    tournament: function (THREE) { return flaeche(THREE, TURNIER); },

    streamraetsel: function (THREE) { return flaeche(THREE, STOERBILD); },

    /* Logbuecher und Kapitelansicht teilen sich das Tauwerk -
       dieselbe Stimmung, damit beide zusammengehoeren. */
    story: function (THREE) { return flaeche(THREE, TAUWERK); },
    "story-detail": function (THREE) { return flaeche(THREE, TAUWERK); },

    wheel: schatzstaub,

    /* Der Boss-Nebel traegt die Farbe der aktuellen Phase.
       community-boss.js legt sie in window.fhBossFarbe ab; der
       Shader kennt keine Spielregeln. */
    "community-boss": function (THREE) {
      const ersatz = new THREE.Vector3(0.72, 0.18, 0.20);
      return flaeche(THREE, BOSS,
        { uTon: { value: ersatz.clone() } },
        function (u) {
          if (window.fhBossFarbe) {
            const z = tonAus(THREE, window.fhBossFarbe, ersatz);
            // Weich nachziehen, damit ein Phasenwechsel nicht
            // schlagartig die Farbe umlegt.
            u.uTon.value.lerp(z, 0.02);
          }
        });
    },

    /* Der Rennhintergrund nimmt Grund- und Akzentfarbe der aktuell
       gefahrenen Strecke. Beide stehen schon in race-data.js -
       kommt eine zehnte Strecke dazu, passt der Hintergrund von
       selbst. */
    race: function (THREE) {
      const ersatzGrund  = new THREE.Vector3(0.35, 0.27, 0.15);
      const ersatzAkzent = new THREE.Vector3(1.00, 0.84, 0.42);
      /* Die Bewegungsart je Strecke. Die Farben ziehen weich nach
         (lerp), der Stil springt - ein halb geflimmerter, halb
         gewellter Zwischenzustand ergaebe kein Bild. Bei einem
         unbekannten Namen bleibt es beim neutralen Lauf, eine neue
         Strecke ohne "stil" faellt also nicht aus. */
      const STILE = { hitze: 1, neon: 2, sturm: 3, wasser: 4, wolken: 5 };
      return flaeche(THREE, RENNEN,
        { uGrund:  { value: ersatzGrund.clone() },
          uAkzent: { value: ersatzAkzent.clone() },
          uStil:   { value: 0 } },
        function (u) {
          const t = window.fhRennThema;
          if (!t) return;
          u.uGrund.value.lerp(tonAus(THREE, t.grass, ersatzGrund), 0.03);
          u.uAkzent.value.lerp(tonAus(THREE, t.accent, ersatzAkzent), 0.03);
          u.uStil.value = STILE[t.stil] || 0;
        });
    },
  };
})();
