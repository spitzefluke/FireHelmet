/* ======================================================
   LIVE-STORY "ZWEI HAELFTEN EINES HERZENS" (Migration 38)
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Zwei Haelften eines Herzens":
   ein Kurzfilm in zehn Kapiteln (10:16 min) mit Erzaehlerstimme -
   von einer Kindheit unter Leistungsdruck ueber Angst, Luegen,
   Einsamkeit, Mobbing und eine erste Liebe bis zu einem geteilten
   Herzen, in dessen dunkler Haelfte ein kleines Licht entsteht.

   WIE ES GEBAUT IST (wie riss-film.js)
   - Der Entwurf ist React: jedes Bild eine reine Funktion der Zeit T.
     Der Bildteil (in baueFilm) ist einmalig mit esbuild von JSX in
     Aufrufe von _h() uebersetzt; _h() baut einen kleinen Baum,
     zeichnen() gleicht ihn mit dem DOM ab. Buehne 1920 x 1080,
     eingepasst, hoechstens 30 Bilder pro Sekunde.
   - Abweichungen vom Entwurf: feste Farben statt der Variablen des
     Design-Systems; Koernung, Regen, Staub und Waende bewegen sich
     per transform statt per left/top/backgroundPosition.
   - Das Drehbuch (Erzaehlung, Gedanken, Nachrichten) steht unten in
     beiden Sprachen.

   ERZAEHLERSTIMME
   Wie im Entwurf die Sprachausgabe des Browsers (Web Speech API):
   jeder Satz wird zu seiner Zeitmarke vorgelesen, Deutsch oder
   Englisch je nach Sprache der Seite. Klang und Stimme haengen vom
   Geraet ab; ohne Sprachausgabe laeuft der Film mit Untertiteln.
   Browser lassen Ton erst nach einem Tippen zu - dann erscheint
   "Ton an" (live-storys.js) und die Stimme setzt beim Tippen ein.
   Die Musik ("Patient Pulse" im Entwurf) kommt wie bei jeder Story
   ueber "Musik je Story" im Admin-Bereich; in den stillen Stellen des
   Drehbuchs wird sie leiser.

   live-storys.js startet den Film in der Story "herz":
     fhHerzFilm.start({ ab: ms, vorschau })
     fhHerzFilm.ende()   - Story vorbei: kurz ausblenden
     fhHerzFilm.weg()    - abgebrochen: sofort weg

   Alle Texte sind fest (keine Daten aus der Datenbank), der Baum
   setzt sie trotzdem nur als Textknoten.
====================================================== */

(function () {
  "use strict";

  const RUHIG = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function t(key, fallback) { return typeof window.t === "function" ? window.t(key, fallback) : fallback; }
  function L(key, de) { return t("herz." + key, de); }
  function istEn() { return typeof getCurrentLang === "function" && getCurrentLang() === "en"; }

  /* ------------------------------------------------------
     ZEIT-HELFER (aus animations-v3.jsx / core.jsx des Entwurfs)
  ------------------------------------------------------ */
  const Easing = {
    easeOutCubic: (x) => (--x) * x * x + 1,
    easeInOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const MOTION = {
    /* Deckkraft-Huelle: 0 ausserhalb [a,b], weiche Rampen. */
    env(T, a, b, fin, fout) {
      fin = fin == null ? 1.2 : fin; fout = fout == null ? 1.2 : fout;
      if (!(T > a && T < b)) return 0;
      const v = Math.min(1, (T - a) / fin, (b - T) / fout);
      return Easing.easeInOutSine(Math.max(0, v));
    },
    /* Langsame Kamerafahrt zwischen zwei Werten in [a,b]. */
    glide(T, a, b, from, to) {
      const p = clamp((T - a) / (b - a), 0, 1);
      return from + (to - from) * Easing.easeInOutSine(p);
    },
    /* Aufsteigender Eintritt 0 -> 1. */
    rise(T, a, d) {
      return Easing.easeOutCubic(clamp((T - a) / (d == null ? 1.2 : d), 0, 1));
    },
  };
  const rnd = (i, k) => {
    const x = Math.sin(i * 127.1 + (k || 0) * 311.7 + 1.3) * 43758.5453;
    return x - Math.floor(x);
  };

  /* ------------------------------------------------------
     DER KLEINE BAUM: _h(tag, props, ...kinder) - wie in riss-film.js,
     dazu die SVG-Elemente des Herzens
     Komponenten (Funktionen) werden sofort aufgerufen, _Frag ist
     eine Liste. Ergebnis: { tag, p, k } oder Text.
  ------------------------------------------------------ */
  const _Frag = "#frag";
  function flach(liste, aus) {
    for (let i = 0; i < liste.length; i++) {
      const x = liste[i];
      if (x == null || x === false || x === true) continue;
      if (Array.isArray(x)) flach(x, aus);
      else if (x.tag === _Frag) flach(x.k, aus);
      else aus.push(typeof x === "object" ? x : String(x));
    }
    return aus;
  }
  function _h(tag, props) {
    const kinder = Array.prototype.slice.call(arguments, 2);
    if (typeof tag === "function") {
      const p = Object.assign({}, props);
      p.children = kinder.length === 1 ? kinder[0] : kinder;
      return tag(p);
    }
    return { tag: tag, p: props || {}, k: kinder };
  }

  const OHNE_EINHEIT = { opacity: 1, zIndex: 1, flex: 1, flexGrow: 1, flexShrink: 1, fontWeight: 1, lineHeight: 1, order: 1 };
  const kebabCache = {};
  function kebab(k) { return kebabCache[k] || (kebabCache[k] = k.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); })); }
  function stilText(st) {
    let s = "";
    for (const k in st) {
      const v = st[k];
      if (v == null || v === "") continue;
      s += kebab(k) + ":" + (typeof v === "number" && !OHNE_EINHEIT[k] ? v + "px" : v) + ";";
    }
    return s;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const SVG_TAGS = { svg: 1, g: 1, path: 1, defs: 1, linearGradient: 1, radialGradient: 1, stop: 1, clipPath: 1, polygon: 1, polyline: 1, circle: 1 };
  const SVG_CAMEL = { viewBox: 1, stdDeviation: 1, pathLength: 1 };

  function attrsSetzen(el, p, svg) {
    const alt = el.__p || {};
    for (const k in p) {
      if (k === "key" || k === "children" || k === "male") continue;
      const v = p[k];
      if (k === "style") {
        const s = stilText(v);
        if (el.__s !== s) { el.style.cssText = s; el.__s = s; }
        continue;
      }
      if (alt[k] === v) continue;
      const name = k === "className" ? "class" : svg && !SVG_CAMEL[k] ? kebab(k) : k;
      if (v == null || v === false) el.removeAttribute(name);
      else el.setAttribute(name, v);
    }
    el.__p = p;
    /* Canvas: "male" zeichnet nach jedem Abgleich hinein. */
    if (typeof p.male === "function") p.male(el);
  }

  function neu(v, svg) {
    if (typeof v === "string") return document.createTextNode(v);
    const istSvg = svg || !!SVG_TAGS[v.tag];
    const el = istSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
    el.__tag = v.tag;
    if (v.tag === "img") { el.decoding = "async"; el.alt = ""; }
    attrsSetzen(el, v.p, istSvg);
    zeichnen(el, v.k, istSvg);
    return el;
  }

  /* Kinder von "el" auf die Liste "kinder" bringen - Stelle fuer Stelle. */
  function zeichnen(el, kinder, svg) {
    const liste = flach(kinder, []);
    const da = el.childNodes;
    for (let i = 0; i < liste.length; i++) {
      const v = liste[i], d = da[i];
      if (typeof v === "string") {
        if (d && d.nodeType === 3) { if (d.nodeValue !== v) d.nodeValue = v; }
        else if (d) el.replaceChild(document.createTextNode(v), d);
        else el.appendChild(document.createTextNode(v));
        continue;
      }
      const istSvg = svg || !!SVG_TAGS[v.tag];
      if (d && d.__tag === v.tag) {
        attrsSetzen(d, v.p, istSvg);
        zeichnen(d, v.k, istSvg);
      } else if (d) el.replaceChild(neu(v, svg), d);
      else el.appendChild(neu(v, svg));
    }
    while (da.length > liste.length) el.removeChild(el.lastChild);
  }

  /* ------------------------------------------------------
     DAS DREHBUCH (aus film/narration.js des Entwurfs)
     Zeiten in Sekunden RELATIV zum Kapitelbeginn. Jede Zeile in
     beiden Sprachen [de, en] - das Drehbuch steht hier und nicht in
     i18n.js, weil es nur gebraucht wird, solange der Film laeuft
     (diese Datei wird erst dann nachgeladen).
       lines      gesprochen und als Untertitel; mode "words" = Wort
                  fuer Wort, place "center" = mittig
       fragments  schwebende Gedanken (nicht gesprochen)
       heartbeats Herzschlag-Pulse im Bild
       silences   Stille: die Musik wird leiser
  ------------------------------------------------------ */
  const KAPITEL = [
    {
      name: ["Kindheit und Leistungsdruck", "Childhood and the Pressure to Perform"],
      dur: 62, markerAt: 12.5,
      lines: [
        { at: 14, until: 21, text: ["Es gab eine Zeit, in der er noch nicht wusste, dass man sich Liebe verdienen muss.", "There was a time when he didn't yet know that love had to be earned."] },
        { at: 22.5, until: 28.5, text: ["Dann kamen die Zahlen. Noten, Zeugnisse, Vergleiche.", "Then came the numbers. Grades, report cards, comparisons."] },
        { at: 30, until: 35.5, text: ["Eine Zwei war gut. Nur nicht gut genug.", "A B was good. Just not good enough."] },
        { at: 37, until: 43, text: ["Er lernte früh, in den Gesichtern der Erwachsenen zu lesen.", "He learned early to read the faces of the grown-ups."] },
        { at: 44.5, until: 50.5, text: ["Ein kurzes Nicken. Ein Seufzer. Ein Schweigen am Küchentisch.", "A brief nod. A sigh. A silence at the kitchen table."] },
        { at: 52.5, until: 59.5, text: ["Was muss ich tun, damit ich genug bin?", "What do I have to do to be enough?"], mode: "words", place: "center" },
      ],
      fragments: [
        { at: 24, until: 34, text: ["Das kannst du besser.", "You can do better."], x: 66, y: 20 },
        { at: 31, until: 41, text: ["Warum keine Eins?", "Why not an A?"], x: 10, y: 28 },
        { at: 40, until: 50, text: ["Andere schaffen das auch.", "Others manage it too."], x: 60, y: 36 },
      ],
      heartbeats: [53.2, 54.3],
      silences: [[50.5, 60]],
    },
    {
      name: ["Wachsende Angst", "Growing Fear"],
      dur: 60,
      lines: [
        { at: 3, until: 9, text: ["Die Angst kam nicht auf einmal.", "The fear didn't come all at once."] },
        { at: 10.5, until: 17.5, text: ["Sie kam leise. Wie Regen, der zuerst nur die Fenster berührt.", "It came quietly. Like rain that at first only touches the windows."] },
        { at: 19, until: 26, text: ["Vor jeder Klassenarbeit lag er wach. Vor jedem Elternabend wurde sein Atem flach.", "Before every test he lay awake. Before every parents' evening his breath grew shallow."] },
        { at: 28, until: 35, text: ["Er wurde still, damit niemand merkte, wie laut es in ihm war.", "He went quiet so that no one would notice how loud it was inside him."] },
        { at: 41.5, until: 47, text: ["Sein Herz schlug schneller, als es sollte.", "His heart beat faster than it should."] },
        { at: 49, until: 55, text: ["Und niemand hörte es.", "And no one heard it."] },
      ],
      fragments: [
        { at: 13, until: 24, text: ["Was, wenn ich alles vergesse?", "What if I forget everything?"], x: 8, y: 22 },
        { at: 22, until: 32, text: ["Morgen. Morgen. Morgen.", "Tomorrow. Tomorrow. Tomorrow."], x: 12, y: 34 },
      ],
      heartbeats: [41.6, 42.4, 43.15, 43.85, 44.5, 45.1, 45.7],
      silences: [[35, 41.5]],
    },
    {
      name: ["Lügen aus Angst vor Enttäuschung", "Lies out of Fear of Disappointing"],
      dur: 58,
      lines: [
        { at: 3, until: 9, text: ["Irgendwann begann er zu lügen.", "At some point he began to lie."] },
        { at: 10.5, until: 17.5, text: ["Nicht, um jemandem zu schaden. Sondern um niemanden zu enttäuschen.", "Not to hurt anyone. But so as not to disappoint anyone."] },
        { at: 19, until: 27, text: ["Ein vergessenes Heft wurde zu einem verlorenen. Eine Fünf wurde zu einer Drei.", "A forgotten notebook became a lost one. An E became a C."] },
        { at: 29, until: 35, text: ["Jede Lüge war ein kleiner Schutzraum.", "Every lie was a small shelter."] },
        { at: 37, until: 42.5, text: ["Aber jeder Schutzraum hatte Wände.", "But every shelter had walls."] },
        { at: 45, until: 54, text: ["Und hinter den Wänden wurde es enger.", "And behind the walls it grew narrower."] },
      ],
      fragments: [
        { at: 12, until: 22, text: ["Alles gut.", "All good."], x: 70, y: 22 },
        { at: 20, until: 30, text: ["Hab ich schon gemacht.", "Already done it."], x: 8, y: 20 },
        { at: 27, until: 37, text: ["War nicht so schlimm.", "It wasn't that bad."], x: 64, y: 34 },
      ],
      heartbeats: [],
      silences: [],
      walls: [29, 37, 45],
    },
    {
      name: ["Einsamkeit und soziale Unsicherheit", "Loneliness and Social Insecurity"],
      dur: 60,
      lines: [
        { at: 3, until: 9.5, text: ["In den Pausen stand er oft am Rand.", "At break time he often stood at the edge."] },
        { at: 11, until: 18.5, text: ["Nah genug, um dazuzugehören. Weit genug, um nicht aufzufallen.", "Close enough to belong. Far enough not to stand out."] },
        { at: 20.5, until: 26.5, text: ["Er übte Sätze im Kopf, bevor er sie sagte.", "He rehearsed sentences in his head before he said them."] },
        { at: 28, until: 32.5, text: ["Meistens sagte er sie nicht.", "Mostly he didn't say them."] },
        { at: 35, until: 44, text: ["Die anderen lachten über Dinge, die er nicht verstand. Oder über ihn – er war sich nie sicher.", "The others laughed about things he didn't understand. Or about him – he was never sure."] },
        { at: 46.5, until: 56, text: ["Allein zu sein war nicht das Schlimmste. Das Schlimmste war, unter Menschen allein zu sein.", "Being alone wasn't the worst. The worst was being alone among people."] },
      ],
      fragments: [
        { at: 21, until: 29, text: ["Hey … ach, egal.", "Hey … oh, never mind."], x: 14, y: 22 },
        { at: 28, until: 37, text: ["Jetzt ist es zu spät.", "Now it's too late."], x: 24, y: 33 },
      ],
      heartbeats: [],
      silences: [[32.5, 35]],
    },
    {
      name: ["Beginn der Erzieherausbildung", "Training to Become an Educator"],
      dur: 52,
      lines: [
        { at: 3, until: 10, text: ["Nach der Schule wählte er einen Weg, der sich richtig anfühlte.", "After school he chose a path that felt right."] },
        { at: 11.5, until: 20.5, text: ["Erzieher. Kinder begleiten. Für sie da sein – so, wie er es sich selbst gewünscht hätte.", "An educator. Walking alongside children. Being there for them – the way he would have wished for himself."] },
        { at: 22.5, until: 29, text: ["Am ersten Tag trug er Hoffnung wie einen neuen Mantel.", "On the first day he wore hope like a new coat."] },
        { at: 30.5, until: 35, text: ["Ein bisschen zu groß. Aber warm.", "A little too big. But warm."] },
        { at: 38, until: 46, text: ["Zum ersten Mal seit Langem dachte er: Vielleicht ist das mein Ort.", "For the first time in a long while he thought: maybe this is my place."] },
      ],
      fragments: [],
      heartbeats: [],
      silences: [],
    },
    {
      name: ["Ausgrenzung und Cybermobbing", "Exclusion and Cyberbullying"],
      dur: 66,
      lines: [
        { at: 3, until: 10, text: ["Es begann mit Blicken. Dann mit einer Gruppe, in der er nicht war.", "It began with looks. Then with a group he wasn't part of."] },
        { at: 12, until: 16.5, text: ["Dann mit Nachrichten.", "Then with messages."], maxWidth: 880 },
        { at: 28.5, until: 35.5, text: ["Die Worte kamen nachts, wenn das Zimmer dunkel war und das Display hell.", "The words came at night, when the room was dark and the screen was bright."], maxWidth: 880 },
        { at: 37.5, until: 45.5, text: ["Er las sie immer wieder. Als könnte er beim zehnten Mal etwas anderes darin finden.", "He read them again and again. As if the tenth time he might find something different."], maxWidth: 880 },
        { at: 48, until: 53.5, text: ["Irgendwann ging er nicht mehr hin.", "At some point he stopped going."], maxWidth: 880 },
        { at: 55.5, until: 61, text: ["Niemand fragte, warum.", "No one asked why."], maxWidth: 880 },
      ],
      fragments: [],
      messages: [
        { at: 17, time: "23:41", text: ["Hast du gesehen, wie der redet?", "Did you see how he talks?"] },
        { at: 19.5, time: "23:41", text: ["peinlich.", "embarrassing."] },
        { at: 22, time: "23:43", text: ["Lad den bloß nicht ein.", "Don't you dare invite him."] },
        { at: 24.5, time: "23:44", text: ["lol", "lol"] },
        { at: 27, time: "00:12", text: ["Der merkt das eh nicht.", "He won't even notice."] },
      ],
      heartbeats: [],
      silences: [[16.5, 28]],
    },
    {
      name: ["Verschlossene Gefühle", "Locked-Away Feelings"],
      dur: 58,
      lines: [
        { at: 3, until: 8.5, text: ["Er lernte, Gefühle wegzuschließen.", "He learned to lock his feelings away."] },
        { at: 10, until: 15.5, text: ["Nicht in eine Kiste. In sich selbst.", "Not in a box. Inside himself."] },
        { at: 17.5, until: 24.5, text: ["Wenn jemand fragte, wie es ihm gehe, sagte er: „Gut.“", "When someone asked how he was, he said: “Fine.”"] },
        { at: 26.5, until: 34.5, text: ["Das Wort war leicht. Es kostete nichts. Und es hielt alle auf Abstand.", "The word was easy. It cost nothing. And it kept everyone at a distance."] },
        { at: 36.5, until: 42.5, text: ["Innen wurde es kalt. Außen blieb er freundlich.", "Inside it turned cold. Outside he stayed friendly."] },
        { at: 45, until: 53, text: ["Zwei Hälften. Eine, die man sah. Und eine, die niemand kannte.", "Two halves. One that people saw. And one that no one knew."] },
      ],
      fragments: [
        { at: 19, until: 27, text: ["Gut.", "Fine."], x: 68, y: 20 },
        { at: 22, until: 30, text: ["Alles gut.", "All good."], x: 76, y: 32 },
      ],
      heartbeats: [],
      silences: [],
    },
    {
      name: ["Erste Liebe und Trennung", "First Love and Breaking Up"],
      dur: 68,
      lines: [
        { at: 3, until: 8, text: ["Und dann war da jemand.", "And then there was someone."] },
        { at: 9.5, until: 15.5, text: ["Jemand, der blieb, wenn er schwieg.", "Someone who stayed when he was silent."] },
        { at: 17.5, until: 24.5, text: ["Zum ersten Mal ließ er eine Tür einen Spalt weit offen.", "For the first time he left a door open a crack."] },
        { at: 26.5, until: 33, text: ["Er lachte wieder. Echt. Ohne es vorher zu üben.", "He laughed again. For real. Without rehearsing it first."] },
        { at: 39.5, until: 45, text: ["Aber Nähe macht verletzlich.", "But closeness makes you vulnerable."] },
        { at: 47, until: 55, text: ["Als es endete, sagte niemand etwas Böses. Es war einfach vorbei.", "When it ended, no one said anything cruel. It was simply over."] },
        { at: 57, until: 63, text: ["Und die Tür fiel leise wieder ins Schloss.", "And the door quietly fell shut again."] },
      ],
      fragments: [],
      heartbeats: [26.8, 27.7],
      silences: [[33, 39.5]],
    },
    {
      name: ["Neue Ausbildung und Selbstzweifel", "New Training and Self-Doubt"],
      dur: 58,
      lines: [
        { at: 3, until: 10.5, text: ["Er fing noch einmal an. Eine neue Ausbildung. Ein neuer Anfang.", "He started over. New training. A new beginning."] },
        { at: 12.5, until: 17, text: ["Doch die alte Stimme kam mit.", "But the old voice came along."] },
        { at: 19, until: 26.5, text: ["Du schaffst das sowieso nicht.", "You won't make it anyway."], mode: "words", place: "center" },
        { at: 28.5, until: 36, text: ["Jede Rückmeldung klang wie ein Urteil. Jedes Lob wie ein Irrtum.", "Every piece of feedback sounded like a verdict. Every bit of praise like a mistake."] },
        { at: 38.5, until: 44, text: ["Und trotzdem stand er jeden Morgen auf.", "And still he got up every morning."] },
        { at: 46.5, until: 54, text: ["Vielleicht war das schon mehr, als er sich selbst zugestand.", "Maybe that was already more than he gave himself credit for."] },
      ],
      fragments: [
        { at: 27, until: 36, text: ["Wieder falsch.", "Wrong again."], x: 10, y: 24 },
        { at: 30, until: 40, text: ["Die merken bald, dass du es nicht kannst.", "They'll soon notice you can't do it."], x: 52, y: 18 },
      ],
      heartbeats: [],
      silences: [[17, 19]],
    },
    {
      name: ["Das zweigeteilte Herz und ein vorsichtiger Ausblick", "The Divided Heart and a Cautious Outlook"],
      dur: 74,
      lines: [
        { at: 4, until: 10, text: ["Er trug beide Hälften in sich.", "He carried both halves within him."] },
        { at: 11.5, until: 17, text: ["Die eine, die Angst hatte, nicht genug zu sein.", "The one that was afraid of not being enough."] },
        { at: 18.5, until: 24, text: ["Und die andere, die trotzdem hoffte.", "And the other, which hoped anyway."] },
        { at: 26.5, until: 34, text: ["Die dunkle Hälfte verschwand nicht. Vielleicht würde sie das nie.", "The dark half didn't disappear. Maybe it never would."] },
        { at: 36, until: 42, text: ["Aber in ihr war etwas Neues. Klein. Kaum sichtbar.", "But inside it was something new. Small. Barely visible."] },
        { at: 44, until: 48.5, text: ["Ein Licht.", "A light."], place: "center" },
        { at: 51, until: 57, text: ["Er war noch nicht dort angekommen, wo er sein wollte.", "He hadn't yet arrived where he wanted to be."], place: "center" },
        { at: 58.5, until: 64.5, text: ["Aber seine Geschichte war noch nicht vorbei.", "But his story wasn't over yet."], place: "center" },
      ],
      fragments: [],
      heartbeats: [44.2, 45.1],
      silences: [[42, 44], [64.5, 80]],
      blackAt: 68,
    },
  ];

  /* Kapitel mit Start/Ende auf der Film-Zeitachse, Texte in einer
     Sprache (0 = de, 1 = en). */
  function kapitelFuer(sp) {
    let start = 0;
    return KAPITEL.map(function (k, i) {
      const c = {
        index: i, start: start, end: start + k.dur, titel: k.name[sp],
        markerAt: k.markerAt, heartbeats: k.heartbeats, silences: k.silences, walls: k.walls, blackAt: k.blackAt,
        lines: k.lines.map(function (l) { return Object.assign({}, l, { text: l.text[sp] }); }),
        fragments: k.fragments.map(function (f) { return Object.assign({}, f, { text: f.text[sp] }); }),
        messages: (k.messages || []).map(function (m) { return Object.assign({}, m, { text: m.text[sp] }); }),
      };
      start += k.dur;
      return c;
    });
  }
  const DAUER = KAPITEL.reduce(function (s, k) { return s + k.dur; }, 0);   // 616 s

  /* ------------------------------------------------------
     DER FILM (aus dem Entwurf, uebersetzt)
     In einer Funktion, damit die Texte in der Sprache stehen, die
     beim Start gilt.
  ------------------------------------------------------ */
  function baueFilm(EN) {
    const FILM = { W: 1920, H: 1080 };
    /* Nocturne-Palette des Entwurfs, die Variablen des Design-Systems
       als feste Werte (neutral-200/300/400). */
    const C = {
      void: "#07080e",
      sil: "oklch(0.085 0.012 270)",
      sil2: "oklch(0.115 0.015 268)",
      floor: "oklch(0.09 0.012 268)",
      deep: "oklch(0.2 0.035 264)",
      mist: "oklch(0.34 0.03 258)",
      rain: "oklch(0.86 0.02 250)",
      dust: "oklch(0.8 0.015 260)",
      text: "#e4e7f5",
      textSoft: "#cfd3e5",
      muted: "#b2b6ca",
      gold: "oklch(0.82 0.1 80)",
      goldA: (a) => "oklch(0.82 0.1 80 / " + a + ")",
      blueA: (a) => "oklch(0.7 0.06 245 / " + a + ")",
    };
    const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";
    const TEXT_SHADOW = "0 2px 28px rgba(7,8,14,0.95), 0 0 2px rgba(7,8,14,0.8)";
    const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const TXT = EN
      ? { titel: L("title", "Two Halves of a Heart"), untertitel: L("subtitle", "A short film in ten chapters"), kapitel: L("chapter", "Chapter") }
      : { titel: L("title", "Zwei Hälften eines Herzens"), untertitel: L("subtitle", "Ein Kurzfilm in zehn Kapiteln"), kapitel: L("chapter", "Kapitel") };
    const HEART_PATH = "M100 182 C 42 136, 4 100, 4 58 C 4 28, 26 8, 54 8 C 75 8, 91 20, 100 38 C 109 20, 125 8, 146 8 C 174 8, 196 28, 196 58 C 196 100, 158 136, 100 182 Z";
    const HEART_SEAM = [[100, 38], [92, 62], [106, 86], [93, 110], [104, 134], [96, 158], [100, 182]];
    let REDUCED = false;

    /* Koernung: einmal eine Rauschkachel als Bild. */
    let GRAIN_URL = null;
    function grainUrl() {
      if (GRAIN_URL) return GRAIN_URL;
      const c = document.createElement("canvas"); c.width = c.height = 192;
      const g = c.getContext("2d"); const img = g.createImageData(192, 192);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(rnd(i, 11) * 255); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
      g.putImageData(img, 0, 0); GRAIN_URL = c.toDataURL(); return GRAIN_URL;
    }

    function aktiveZeile(T, chapters) {
      for (const ch of chapters) {
        if (T < ch.start - 1 || T > ch.end + 1) continue;
        for (const l of ch.lines) {
          const a = ch.start + l.at, b = ch.start + l.until;
          if (T > a && T < b) return { l: l, a: a, b: b };
        }
      }
      return null;
    }

    /* ---- ab hier der uebersetzte Entwurf ---- */
    const Box = ({ style, children }) => _h("div", { style: Object.assign({ position: "absolute" }, style) }, children);
    function Rain({ T, amount = 1, reduced, count = 90, box, speed = 1, alpha = 0.22 }) {
      if (amount <= 0.01) return null;
      const b = box || { x: 0, y: 0, w: FILM.W, h: FILM.H };
      const n = reduced ? Math.round(count * 0.4) : count;
      const drops = [];
      for (let i = 0; i < n; i++) {
        const len = 40 + rnd(i, 2) * 70;
        const v = (900 + rnd(i, 3) * 700) * speed;
        const span = b.h + len + 40;
        const y = reduced ? rnd(i, 1) * span : (rnd(i, 1) * span + T * v) % span;
        const x = rnd(i) * (b.w + 140) - 140 + y * 0.12;
        drops.push(_h("div", { style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: 1.4,
          height: len,
          background: `linear-gradient(to bottom, transparent, ${C.rain})`,
          opacity: alpha * amount * (0.4 + rnd(i, 4) * 0.6) * (reduced ? 0.6 : 1),
          transform: `translate(${x.toFixed(1)}px, ${(y - len).toFixed(1)}px) rotate(-7deg)`
        } }));
      }
      return _h("div", { style: { position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, overflow: "hidden", pointerEvents: "none" } }, drops);
    }
    function Motes({ T, amount = 1, reduced, count = 30, color = C.dust, box, size = [1.5, 4], rise = 8, seed = 0, alpha = 0.55 }) {
      if (amount <= 0.01) return null;
      const b = box || { x: 0, y: 0, w: FILM.W, h: FILM.H };
      const out = [];
      for (let i = 0; i < count; i++) {
        const k = i + seed * 97;
        const s = size[0] + rnd(k, 9) * (size[1] - size[0]);
        const dx = reduced ? 0 : Math.sin(T * 0.13 + k) * 24;
        const yy = rnd(k, 6) * b.h - (reduced ? 0 : T * rise * (0.5 + rnd(k, 7)));
        const y = (yy % b.h + b.h) % b.h;
        const tw = reduced ? 0.75 : 0.5 + 0.5 * Math.sin(T * (0.5 + rnd(k, 8)) + k * 3);
        out.push(_h("div", { style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: s,
          height: s,
          transform: `translate(${(b.x + rnd(k, 5) * b.w + dx).toFixed(1)}px, ${(b.y + y).toFixed(1)}px)`,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 ${s * 4}px ${color}`,
          opacity: alpha * amount * tw
        } }));
      }
      return _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } }, out);
    }
    function Fog({ T, amount = 1, reduced, tint = C.mist, y = 760, spread = 1 }) {
      if (amount <= 0.01) return null;
      return _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } }, [0, 1, 2].map((i) => {
        const cx = 260 + i * 700 + (reduced ? 0 : Math.sin(T * 0.035 + i * 2.1) * 180);
        const w = 1500 * spread, h = 520;
        return _h("div", { style: {
          position: "absolute",
          left: cx - w / 2,
          top: y - h / 2 + i * 50,
          width: w,
          height: h,
          background: `radial-gradient(ellipse at center, ${tint} 0%, transparent 68%)`,
          opacity: 0.28 * amount
        } });
      }));
    }
    function Glow({ x, y, w, h, color, o = 1 }) {
      if (o <= 5e-3) return null;
      return _h("div", { style: {
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        background: `radial-gradient(ellipse at center, ${color} 0%, transparent 70%)`,
        opacity: o,
        pointerEvents: "none"
      } });
    }
    function Vignette() {
      return _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 48%, transparent 52%, rgba(4,5,9,0.88) 100%)" } });
    }
    function Grain({ T, reduced }) {
      const f = reduced ? 0 : Math.floor(T * 12);
      const x = Math.floor(rnd(f, 1) * 192), y = Math.floor(rnd(f, 2) * 192);
      return _h("div", { style: { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.55 } }, _h("div", { style: { position: "absolute", left: -192, top: -192, width: FILM.W + 384, height: FILM.H + 384, backgroundImage: `url(${grainUrl()})`, transform: `translate(${x}px, ${y}px)` } }));
    }
    function LightShaft({ x, y, w = 520, h = 700, angle = 0, color, o = 1, T = 0, reduced }) {
      if (o <= 5e-3) return null;
      const flick = reduced ? 1 : 0.92 + 0.08 * Math.sin(T * 0.7) * Math.sin(T * 1.9 + 1);
      return _h("div", { style: {
        position: "absolute",
        left: x - w / 2,
        top: y,
        width: w,
        height: h,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "50% 0",
        clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)",
        background: `linear-gradient(180deg, ${color}, transparent 92%)`,
        opacity: o * flick,
        filter: "blur(6px)",
        pointerEvents: "none"
      } });
    }
    function Figure({ x, ground, h, color = C.sil, opacity = 1, sit = false, tilt = 0, rim, T, walk = 0 }) {
      if (opacity <= 5e-3) return null;
      const br = T == null || REDUCED ? 0 : Math.sin(T * 1.25 + x * 0.01);
      const bob = walk && !REDUCED ? -Math.abs(Math.sin(walk / 38)) * h * 0.018 : 0;
      ground = ground + bob;
      tilt = tilt + (walk && !REDUCED ? 1.2 : 0);
      const head = h * 0.17;
      const bodyW = h * 0.34;
      const bodyH = sit ? h * 0.5 : h * 0.66;
      const total = bodyH + head * 1.06;
      const r = bodyW * 0.48;
      return _h("div", { style: {
        position: "absolute",
        left: x - bodyW / 2,
        top: ground - total,
        width: bodyW,
        height: total,
        opacity,
        transform: `rotate(${tilt}deg) scaleY(${1 + br * 6e-3})`,
        transformOrigin: "50% 100%"
      } }, _h("div", { style: {
        position: "absolute",
        left: (bodyW - head) / 2,
        top: 0,
        width: head,
        height: head,
        borderRadius: "50%",
        background: color,
        boxShadow: rim ? `inset -${head * 0.12}px 0 ${head * 0.2}px -${head * 0.06}px ${rim}` : "none"
      } }), _h("div", { style: {
        position: "absolute",
        left: 0,
        top: head * 1.06,
        width: bodyW,
        height: bodyH,
        background: color,
        borderRadius: `${r}px ${r}px ${bodyW * 0.1}px ${bodyW * 0.1}px`,
        boxShadow: rim ? `inset -${bodyW * 0.08}px 0 ${bodyW * 0.14}px -${bodyW * 0.04}px ${rim}` : "none"
      } }));
    }
    function SplitHeart({ id, cx, cy, size = 300, gap = 20, opacity = 1, light = 0, rim = 0.5, scale = 1, tilt = 4 }) {
      if (opacity <= 5e-3) return null;
      const seam = HEART_SEAM.map((p) => p.join(",")).join(" ");
      const seamRev = HEART_SEAM.slice().reverse().map((p) => p.join(",")).join(" ");
      const u = 200 / size;
      const g = gap / 2 * u;
      const W = size * 1.4, H = size * 1.1;
      return _h("svg", { width: W, height: H, viewBox: "-40 -6 280 216", style: {
        position: "absolute",
        left: cx - W / 2,
        top: cy - H / 2,
        opacity,
        overflow: "visible",
        transform: `scale(${scale})`,
        transformOrigin: "50% 50%"
      } }, _h("defs", null, _h("clipPath", { id: id + "L" }, _h("polygon", { points: `0,0 100,0 ${seam} 0,200` })), _h("clipPath", { id: id + "R" }, _h("polygon", { points: `100,0 200,0 200,200 ${seamRev}` })), _h("linearGradient", { id: id + "d", x1: "0", y1: "0", x2: "0.4", y2: "1" }, _h("stop", { offset: "0", stopColor: "oklch(0.21 0.03 265)" }), _h("stop", { offset: "1", stopColor: "oklch(0.1 0.015 268)" })), _h("linearGradient", { id: id + "l", x1: "1", y1: "0", x2: "0.5", y2: "1" }, _h("stop", { offset: "0", stopColor: "oklch(0.64 0.02 258)" }), _h("stop", { offset: "1", stopColor: "oklch(0.4 0.022 262)" })), _h("radialGradient", { id: id + "g" }, _h("stop", { offset: "0", stopColor: "oklch(0.86 0.1 82)", stopOpacity: "0.95" }), _h("stop", { offset: "0.35", stopColor: "oklch(0.78 0.1 76)", stopOpacity: "0.35" }), _h("stop", { offset: "1", stopColor: "oklch(0.78 0.1 76)", stopOpacity: "0" }))), _h("g", { transform: `translate(${-g} 0) rotate(${-tilt * (gap / 40)} 100 182)` }, _h("g", { clipPath: `url(#${id}L)` }, _h("path", { d: HEART_PATH, fill: `url(#${id}d)` }), _h("path", { d: HEART_PATH, fill: "none", stroke: "oklch(0.3 0.02 262)", strokeWidth: "1.2" })), _h("polyline", { points: seam, fill: "none", stroke: "oklch(0.32 0.02 262)", strokeWidth: "1" }), light > 1e-3 ? _h("g", null, _h("circle", { cx: "56", cy: "78", r: 30 * light, fill: `url(#${id}g)` }), _h("circle", { cx: "56", cy: "78", r: 2.6 * light, fill: "oklch(0.9 0.08 85)" })) : null), _h("g", { transform: `translate(${g} 0) rotate(${tilt * (gap / 40)} 100 182)` }, _h("g", { clipPath: `url(#${id}R)` }, _h("path", { d: HEART_PATH, fill: `url(#${id}l)` }), _h("path", { d: HEART_PATH, fill: "none", stroke: "oklch(0.82 0.1 80)", strokeOpacity: rim, strokeWidth: "1.4" })), _h("polyline", { points: seam, fill: "none", stroke: "oklch(0.72 0.03 258)", strokeOpacity: "0.6", strokeWidth: "1" })));
    }
    function SceneFrame({ T, ch, reduced, cam, bg, children, fade = 3 }) {
      const s = ch.start, e = ch.end;
      const op = MOTION.env(T, s - fade / 2, e + fade / 2, fade, fade);
      if (op <= 0) return null;
      const c = cam || {};
      const a = s + (c.a || 0), b = s + (c.b != null ? c.b : e - s);
      const pick = (k0, k1, d) => reduced ? c[k0] != null ? c[k0] : d : MOTION.glide(T, a, b, c[k0] != null ? c[k0] : d, c[k1] != null ? c[k1] : c[k0] != null ? c[k0] : d);
      const sc = pick("s0", "s1", 1);
      const dx = reduced ? 0 : Math.sin(T * 0.11 + s) * 9 + Math.sin(T * 0.23) * 4;
      const dy = reduced ? 0 : Math.cos(T * 0.09 + s) * 6;
      const x = pick("x0", "x1", 0) + dx, y = pick("y0", "y1", 0) + dy;
      return _h("div", { style: { position: "absolute", inset: 0, opacity: op, background: bg || C.void, overflow: "hidden" } }, _h("div", { style: { position: "absolute", inset: 0, transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(4)})`, transformOrigin: c.o || "50% 50%", willChange: "transform" } }, children));
    }
    const Floor = ({ top = 880, color = C.floor }) => _h(Box, { style: { left: -200, right: -200, top, bottom: -200, background: `linear-gradient(180deg, ${color}, ${C.void} 70%)` } });
    function SceneChildhood({ T, ch, reduced }) {
      const t = T - ch.start;
      const lamp = MOTION.rise(t, 11, 4) * (1 - 0.55 * MOTION.glide(t, 51, 57, 0, 1));
      const grade = MOTION.env(t, 22, 37, 1.5, 3);
      return _h(SceneFrame, { T, ch, reduced, cam: { a: 11, s0: 1, s1: 1.18, o: "960px 640px" } }, _h(Box, { style: { inset: 0, opacity: lamp, background: `radial-gradient(ellipse 60% 55% at 50% 40%, ${C.deep}, ${C.void} 75%)` } }), _h(Glow, { x: 960, y: 560, w: 1300, h: 900, color: C.goldA(0.13), o: lamp }), _h(Box, { style: { left: 959, top: -20, width: 2, height: 300, background: C.sil2, opacity: lamp } }), _h(Box, { style: { left: 880, top: 270, width: 160, height: 64, background: "oklch(0.16 0.02 265)", clipPath: "polygon(28% 0, 72% 0, 100% 100%, 0 100%)", opacity: lamp } }), _h(Box, { style: { left: 900, top: 330, width: 120, height: 8, borderRadius: 4, background: C.goldA(0.75), boxShadow: `0 6px 40px ${C.goldA(0.5)}`, opacity: lamp } }), _h(LightShaft, { x: 960, y: 334, w: 900, h: 620, color: C.goldA(0.12), o: lamp, T, reduced }), _h(Figure, { T, x: 610, ground: 910, h: 590, color: C.sil, rim: C.goldA(0.18), opacity: lamp, tilt: MOTION.glide(t, 30, 40, 0, 2) }), _h(Figure, { T: T + 2, x: 1310, ground: 910, h: 610, color: C.sil, opacity: lamp, tilt: MOTION.glide(t, 36, 46, 0, -2) }), _h(Figure, { T: T + 1, x: 960, ground: 910, h: 350, color: C.sil2, rim: C.goldA(0.25), opacity: lamp, tilt: MOTION.glide(t, 50, 58, 0, 3) }), _h(Box, { style: { left: 440, top: 726, width: 1040, height: 20, borderRadius: 3, background: "oklch(0.17 0.02 265)", opacity: lamp } }), _h(Box, { style: { left: 500, top: 746, width: 14, height: 170, background: C.sil2, opacity: lamp } }), _h(Box, { style: { left: 1406, top: 746, width: 14, height: 170, background: C.sil2, opacity: lamp } }), _h(Box, { style: { left: 890, top: 714, width: 140, height: 12, background: "oklch(0.72 0.01 260)", transform: "skewX(-30deg)", opacity: lamp * MOTION.rise(t, 21, 2) * 0.8 } }), _h(Box, { style: {
        left: 900,
        width: 120,
        top: 560,
        transform: `translateY(${(-MOTION.rise(t, 22.5, 6) * 70).toFixed(1)}px)`,
        textAlign: "center",
        fontSize: 132,
        fontWeight: 500,
        color: C.gold,
        opacity: grade * 0.9,
        textShadow: `0 0 50px ${C.goldA(0.45)}`
      } }, "2"), _h(Floor, { top: 916 }), _h(Motes, { T, reduced, amount: lamp, count: 26, box: { x: 560, y: 320, w: 800, h: 520 }, color: C.goldA(0.9), alpha: 0.35, seed: 1 }));
    }
    function SceneFear({ T, ch, reduced }) {
      const t = T - ch.start;
      const rain = MOTION.glide(t, 0, 30, 0.45, 1);
      const rings = (ch.heartbeats || []).map((h) => {
        const p = (t - h) / 1.6;
        if (p < 0 || p > 1) return null;
        const r = 30 + Easing.easeOutCubic(p) * 260;
        return _h(Box, { style: { left: 700 - r, top: 610 - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `1.5px solid ${C.blueA(0.55 * (1 - p))}` } });
      });
      return _h(SceneFrame, { T, ch, reduced, bg: `linear-gradient(180deg, oklch(0.13 0.02 262), ${C.void})`, cam: { s0: 1.04, s1: 1.16, o: "760px 620px" } }, _h(Glow, { x: 1400, y: 420, w: 1100, h: 900, color: C.blueA(0.12) }), _h(Box, { style: { left: 1180, top: 170, width: 440, height: 520, background: "linear-gradient(180deg, oklch(0.3 0.035 250), oklch(0.17 0.03 258))", overflow: "hidden" } }, _h(Glow, { x: 300, y: 120, w: 260, h: 260, color: C.blueA(0.5) })), _h(Rain, { T, reduced, amount: rain, count: 60, box: { x: 1180, y: 170, w: 440, h: 520 }, alpha: 0.4, speed: 0.7 }), _h(Box, { style: { left: 1170, top: 160, width: 460, height: 540, border: `12px solid ${C.sil2}`, boxSizing: "border-box" } }), _h(Box, { style: { left: 1394, top: 170, width: 12, height: 520, background: C.sil2 } }), _h(Box, { style: { left: 1180, top: 424, width: 440, height: 12, background: C.sil2 } }), _h(LightShaft, { x: 1300, y: 300, w: 760, h: 700, angle: 28, color: C.blueA(0.1), T, reduced }), _h(Box, { style: { left: 640, top: 830, width: 900, height: 230, background: C.blueA(0.1), clipPath: "polygon(58% 0, 100% 0, 78% 100%, 0 100%)" } }), _h(Floor, { top: 830 }), _h(Box, { style: { left: 360, top: 740, width: 720, height: 100, borderRadius: 12, background: C.sil2 } }), _h(Box, { style: { left: 340, top: 600, width: 30, height: 260, borderRadius: 6, background: C.sil2 } }), _h(Figure, { T: T * 1.6, x: 700, ground: 760, h: 340, sit: true, color: C.sil, rim: C.blueA(0.35), tilt: MOTION.glide(t, 28, 36, 0, 4) }), rings);
    }
    function SceneLies({ T, ch, reduced }) {
      const t = T - ch.start;
      const w = ch.walls || [29, 37, 45];
      let gap = 2200;
      gap = MOTION.glide(t, w[0], w[0] + 4, gap, 1200);
      if (t > w[1]) gap = MOTION.glide(t, w[1], w[1] + 4, 1200, 700);
      if (t > w[2]) gap = MOTION.glide(t, w[2], w[2] + 7, 700, 230);
      const side = Math.max(0, (1920 - gap) / 2);
      const wall = (left) => ({
        top: -100,
        height: 1280,
        width: 1160,
        left: left ? -1160 : 1920,
        transform: `translateX(${(left ? side : -side).toFixed(1)}px)`,
        background: `linear-gradient(${left ? 90 : 270}deg, oklch(0.07 0.01 268), oklch(0.12 0.015 266))`,
        boxShadow: `${left ? "" : "-"}1px 0 0 ${C.blueA(0.22)}`
      });
      return _h(SceneFrame, { T, ch, reduced, cam: { s0: 1, s1: 1.08, o: "960px 640px" } }, _h(Glow, { x: 960, y: 520, w: Math.max(260, gap * 0.9), h: 1e3, color: C.blueA(0.2) }), _h(Floor, { top: 880, color: "oklch(0.11 0.015 266)" }), _h(Figure, { T, x: 960, ground: 880, h: MOTION.glide(t, 29, 54, 430, 400), color: C.sil, rim: C.blueA(0.25) }), _h(Box, { style: wall(true) }), _h(Box, { style: wall(false) }), _h(Motes, { T, reduced, count: 18, alpha: 0.3, seed: 3 }));
    }
    function SceneLonely({ T, ch, reduced }) {
      const t = T - ch.start;
      const bars = [];
      for (let i = 0; i < 16; i++) bars.push(_h(Box, { style: { left: 110 + i * 34, top: 570, width: 4, height: 320, background: C.sil2 } }));
      const group = [[1330, 470], [1430, 500], [1515, 455], [1600, 490], [1690, 465]];
      return _h(
        SceneFrame,
        {
          T,
          ch,
          reduced,
          bg: `linear-gradient(180deg, oklch(0.15 0.025 262) 0%, oklch(0.25 0.035 250) 56%, oklch(0.12 0.02 265) 56.2%, ${C.void} 100%)`,
          cam: { a: 4, b: 50, s0: 1.14, s1: 1.14, x0: -240, x1: 230, o: "50% 60%" }
        },
        _h(Glow, { x: 1520, y: 720, w: 1e3, h: 560, color: C.goldA(0.14) }),
        group.map(([x, h], i) => _h(Figure, { T: T + i * 1.7, x, ground: 890, h, color: C.sil, rim: C.goldA(0.22), tilt: reduced ? 0 : Math.sin(T * 0.6 + i * 2) * (MOTION.env(t, 35, 44, 1, 2) * 3 + 0.6) })),
        _h(Box, { style: { left: 110, top: 584, width: 548, height: 6, background: C.sil2 } }),
        bars,
        _h(Figure, { T, x: 470, ground: 895, h: 430, color: C.sil, tilt: MOTION.glide(t, 28, 34, 0, -2) }),
        _h(Fog, { T, reduced, y: 820, amount: 0.8 })
      );
    }
    function SceneTraining({ T, ch, reduced }) {
      const t = T - ch.start;
      const o = MOTION.glide(t, 0.5, 7, 0, 1);
      const x = MOTION.glide(t, 4, 40, 380, 1060);
      return _h(SceneFrame, { T, ch, reduced, bg: `linear-gradient(180deg, oklch(0.12 0.02 264), ${C.void})`, cam: { s0: 1, s1: 1.1, o: "1200px 620px" } }, _h(Glow, { x: 1380, y: 590, w: 1300, h: 1e3, color: C.goldA(0.16), o }), _h(Box, { style: { left: 1240, top: 300, width: 280, height: 580, background: "linear-gradient(180deg, oklch(0.6 0.07 78), oklch(0.42 0.06 70))", opacity: 0.9 * o } }), _h(Figure, { x: 1335, ground: 880, h: 190, color: C.sil, opacity: MOTION.rise(t, 9, 4) }), _h(Figure, { x: 1425, ground: 880, h: 170, color: C.sil, opacity: MOTION.rise(t, 11, 4) }), _h(Box, { style: { left: 1240, top: 300, width: 280, height: 580, background: C.sil2, transform: `scaleX(${(1 - 0.86 * o).toFixed(4)})`, transformOrigin: "0 50%" } }), _h(Box, { style: { left: 1226, top: 286, width: 308, height: 594, border: `14px solid ${C.sil}`, borderBottom: "none", boxSizing: "border-box" } }), _h(Floor, { top: 880 }), _h(Box, { style: { left: 560, top: 880, width: 960, height: 200, background: `linear-gradient(90deg, transparent, ${C.goldA(0.2)})`, clipPath: "polygon(70% 0, 100% 0, 100% 100%, 0 100%)", opacity: o } }), _h(LightShaft, { x: 1380, y: 300, w: 1100, h: 700, angle: 58, color: C.goldA(0.1), o, T, reduced }), _h(Figure, { T, x, ground: 884, h: 440, color: C.sil, rim: C.goldA(0.5 * o), walk: t > 4 && t < 40 ? x : 0 }), _h(Motes, { T, reduced, amount: o, count: 22, box: { x: 1e3, y: 260, w: 700, h: 640 }, color: C.goldA(0.9), alpha: 0.45, seed: 5 }));
    }
    function SceneMobbing({ T, ch, reduced }) {
      const t = T - ch.start;
      const a = MOTION.env(t, -2, 13, 1, 3);
      const b = MOTION.rise(t, 12, 3);
      const screen = MOTION.rise(t, 13, 2) * (1 - MOTION.glide(t, 50, 55, 0, 1));
      const msgs = ch.messages || [];
      return _h(SceneFrame, { T, ch, reduced, bg: C.void, cam: { a: 12, s0: 1, s1: 1.08, o: "1300px 520px" } }, _h(Box, { style: { inset: 0, opacity: a, background: `linear-gradient(180deg, oklch(0.15 0.02 262), ${C.void})` } }, _h(Floor, { top: 880 }), [1290, 1410, 1530].map((x, i) => _h(Figure, { x, ground: 880, h: 470 + i * 12, color: C.sil, rim: C.blueA(0.2) })), _h(Figure, { x: 520, ground: 880, h: 430, color: C.sil })), _h(Box, { style: { inset: 0, opacity: b } }, _h(Glow, { x: 1360, y: 540, w: 1200, h: 1100, color: C.blueA(0.2), o: screen }), _h(Floor, { top: 900 }), _h(Figure, { T, x: 640, ground: 900, h: 410, sit: true, color: C.sil, rim: C.blueA(0.55 * screen), tilt: MOTION.glide(t, 28, 46, 0, 6) }), _h(Box, { style: {
        left: 1100,
        top: 140,
        width: 520,
        height: 800,
        borderRadius: 40,
        boxSizing: "border-box",
        padding: "90px 36px",
        background: "linear-gradient(180deg, oklch(0.24 0.03 252), oklch(0.16 0.025 258))",
        border: `1px solid ${C.blueA(0.35)}`,
        opacity: 0.25 + 0.75 * screen,
        display: "flex",
        flexDirection: "column",
        gap: 22
      } }, msgs.map((m, i) => {
        const inn = MOTION.rise(t, m.at, 0.9);
        const dec = MOTION.glide(t, 40 + i * 1.6, 44 + i * 1.6, 0, 1);
        return _h("div", { style: { opacity: inn * (1 - dec), transform: `translateY(${(1 - inn) * 14}px)`, filter: dec > 1e-3 ? `blur(${dec * 6}px)` : "none", display: "flex", flexDirection: "column", gap: 6 } }, _h("div", { style: { fontSize: 18, color: C.muted, letterSpacing: "0.04em" } }, m.time), _h("div", { style: { alignSelf: "flex-start", maxWidth: 420, padding: "14px 20px", borderRadius: 18, background: "oklch(0.31 0.03 252)", color: C.text, fontSize: 28, lineHeight: 1.3 } }, m.text));
      }))));
    }
    function SceneClosed({ T, ch, reduced }) {
      const t = T - ch.start;
      const strip = 0.85 * (1 - MOTION.glide(t, 2, 40, 0, 0.88));
      const door = 1 - MOTION.glide(t, 40, 45, 0, 1);
      return _h(SceneFrame, { T, ch, reduced, bg: `linear-gradient(180deg, oklch(0.13 0.02 264), ${C.void})`, cam: { b: 42, s0: 1, s1: 1.12, o: "960px 860px" } }, _h(Box, { style: { inset: 0, opacity: door } }, _h(Floor, { top: 884 }), _h(Box, { style: { left: 770, top: 200, width: 380, height: 684, background: "linear-gradient(180deg, oklch(0.16 0.02 264), oklch(0.11 0.015 266))", boxShadow: "inset 0 0 0 2px oklch(0.2 0.02 264)" } }), _h(Box, { style: { left: 1100, top: 560, width: 16, height: 16, borderRadius: "50%", background: "oklch(0.3 0.02 262)" } }), _h(Box, { style: { left: 770, top: 882, width: 380, height: 4, background: C.goldA(1), opacity: strip } }), _h(Glow, { x: 960, y: 890, w: 720, h: 90, color: C.goldA(0.5), o: strip })), _h(SplitHeart, { id: "zhC", cx: 960, cy: 500, size: 440, opacity: MOTION.rise(t, 44, 3.5), gap: MOTION.glide(t, 46, 56, 10, 84), rim: 0.4 }), _h(Motes, { T, reduced, count: 16, alpha: 0.25, seed: 7 }));
    }
    function SceneLove({ T, ch, reduced }) {
      const t = T - ch.start;
      const flick = reduced || t < 47 || t > 56 ? 1 : Math.sin(t * 13) > 0.92 ? 0.55 : 1;
      const lamp = (1 - 0.65 * MOTION.glide(t, 47, 60, 0, 1)) * flick;
      let bx = MOTION.glide(t, 25.5, 29, 1150, 1040);
      if (t > 49) bx = MOTION.glide(t, 49.5, 60, 1040, 1880);
      const sit = t < 49;
      const bOp = MOTION.rise(t, 2, 3) * (1 - MOTION.glide(t, 57, 61, 0, 1));
      return _h(SceneFrame, { T, ch, reduced, bg: `linear-gradient(180deg, oklch(0.12 0.02 264), ${C.void})`, cam: { s0: 1.04, s1: 1.14, o: "1000px 720px" } }, _h(Box, { style: { left: 980, top: 214, width: 520, height: 680, clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)", background: `linear-gradient(180deg, ${C.goldA(0.2)}, ${C.goldA(0.03)})`, opacity: lamp } }), _h(Glow, { x: 1240, y: 210, w: 420, h: 300, color: C.goldA(0.4), o: lamp }), _h(Floor, { top: 890 }), _h(Glow, { x: 1100, y: 900, w: 900, h: 160, color: C.goldA(0.18), o: lamp }), _h(Box, { style: { left: 1236, top: 214, width: 8, height: 676, background: C.sil2 } }), _h(Box, { style: { left: 1206, top: 192, width: 68, height: 26, borderRadius: 6, background: C.sil2 } }), _h(Box, { style: { left: 1218, top: 216, width: 44, height: 6, borderRadius: 3, background: C.goldA(0.9), opacity: lamp } }), _h(Box, { style: { left: 760, top: 730, width: 520, height: 12, borderRadius: 3, background: C.sil2 } }), _h(Figure, { T, x: 880, ground: 800, h: 420, sit: true, color: C.sil, rim: C.goldA(0.3 * lamp), tilt: MOTION.glide(t, 26, 30, 0, 3) - MOTION.glide(t, 48, 54, 0, 5) }), _h(Figure, { T: T + 1, x: bx, ground: sit ? 800 : 892, h: sit ? 410 : 450, sit, walk: t > 49.5 && t < 60 ? bx : 0, tilt: sit ? -MOTION.glide(t, 26, 30, 0, 3) : 0, color: C.sil, rim: C.goldA(0.3 * lamp), opacity: bOp }), _h(Box, { style: { left: 760, top: 790, width: 520, height: 16, borderRadius: 3, background: C.sil2 } }), _h(Box, { style: { left: 790, top: 806, width: 12, height: 86, background: C.sil2 } }), _h(Box, { style: { left: 1238, top: 806, width: 12, height: 86, background: C.sil2 } }), _h(Rain, { T, reduced, amount: MOTION.glide(t, 46, 56, 0, 0.85), count: 80 }));
    }
    const CLIMB = [2, 6, 10, 15, 22, 28, 34, 40, 47];
    function SceneDoubt({ T, ch, reduced }) {
      const t = T - ch.start;
      const k = CLIMB.reduce((acc, c) => acc + MOTION.rise(t, c, 1.6), 0);
      const fx = 380 + k * 150, fg = 830 - k * 70;
      const sh = MOTION.env(t, 11, 46, 6, 6) * 0.95;
      const steps = [];
      for (let i = 0; i < 10; i++) {
        steps.push(_h(Box, { style: { left: 300 + i * 150, top: 830 - i * 70, width: 1920, height: 400, background: C.sil2, boxShadow: "inset 0 1px 0 oklch(0.24 0.02 262)" } }));
      }
      return _h(SceneFrame, { T, ch, reduced, bg: "linear-gradient(180deg, oklch(0.17 0.02 262), oklch(0.1 0.015 266))", cam: { s0: 1.06, s1: 1.12, x0: 120, x1: -160, y0: -40, y1: 160, o: "50% 50%" } }, _h(Glow, { x: 1800, y: 110, w: 1300, h: 800, color: C.goldA(0.24), o: MOTION.rise(t, 38, 9) }), sh > 5e-3 ? _h("div", { style: { position: "absolute", inset: 0, filter: "blur(10px)", opacity: sh } }, _h(Figure, { x: fx + 300, ground: fg + 60, h: 940 * (0.85 + 0.15 * MOTION.glide(t, 12, 36, 0, 1)), color: "oklch(0.06 0.01 268)" })) : null, steps, _h(Figure, { T, x: fx, ground: fg, h: 300, color: C.sil, rim: C.goldA(0.35 * MOTION.rise(t, 38, 9)), walk: CLIMB.some((c) => t > c && t < c + 1.6) ? fx : 0, tilt: MOTION.env(t, 17, 38, 3, 4) * 4 }));
    }
    function SceneHeart({ T, ch, reduced }) {
      const t = T - ch.start;
      const flick = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
      const light = MOTION.rise(t, 43, 5) * (t > 48 ? flick : 1);
      const out = 1 - MOTION.glide(t, 64.5, 68, 0, 1);
      const breathe = reduced ? 1 : 1 + 8e-3 * Math.sin(t * 1.1);
      return _h(SceneFrame, { T, ch, reduced, bg: `radial-gradient(ellipse 55% 60% at 50% 44%, oklch(0.16 0.025 264), ${C.void} 80%)`, cam: { b: 64, s0: 0.96, s1: 1.06, o: "960px 470px" } }, _h(Box, { style: { inset: 0, opacity: out } }, _h(Glow, { x: 810, y: 430, w: 520, h: 520, color: C.goldA(0.18), o: light }), _h(SplitHeart, { id: "zhH", cx: 960, cy: 460, size: 470, gap: MOTION.glide(t, 0, 40, 72, 22), light, rim: 0.45, scale: breathe }), _h(Motes, { T, reduced, amount: light, count: 14, box: { x: 560, y: 200, w: 800, h: 560 }, color: C.goldA(0.9), alpha: 0.4, seed: 9, rise: 5 }), _h(Motes, { T, reduced, count: 20, alpha: 0.22, seed: 10 })));
    }
    const SCENES = [SceneChildhood, SceneFear, SceneLies, SceneLonely, SceneTraining, SceneMobbing, SceneClosed, SceneLove, SceneDoubt, SceneHeart];
    function NarrationLayer({ T, chapters, reduced }) {
      const hit = aktiveZeile(T, chapters);
      if (!hit) return null;
      const { l, a, b } = hit;
      const center = l.place === "center";
      const wrap = center ? { left: 160, right: 160, bottom: 230, textAlign: "center", display: "flex", justifyContent: "center" } : { left: 150, bottom: 230, maxWidth: l.maxWidth || 1180 };
      const inner = {
        fontFamily: FONT,
        fontWeight: 400,
        color: C.text,
        textShadow: TEXT_SHADOW,
        fontSize: l.mode === "words" ? 64 : center ? 52 : 46,
        lineHeight: 1.32,
        letterSpacing: "-0.005em",
        textWrap: "pretty",
        maxWidth: center ? 1400 : l.maxWidth || 1180,
        margin: 0
      };
      if (l.mode === "words" && !reduced) {
        const words = l.text.split(" ");
        const out = clamp((b - T) / 1.2, 0, 1);
        return _h(Box, { style: wrap }, _h("p", { style: Object.assign({}, inner, { display: "flex", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start", columnGap: "0.3em" }) }, words.map((w, i) => {
          const p = MOTION.rise(T, a + 0.3 + i * 0.5, 1.1);
          return _h("span", { style: {
            display: "inline-block",
            opacity: p * out,
            transform: `translateY(${(1 - p) * 16}px)`,
            filter: p < 0.999 ? `blur(${(1 - p) * 6}px)` : "none"
          } }, w);
        })));
      }
      const op = MOTION.env(T, a, b, 1.3, 1.1);
      const y = reduced ? 0 : (1 - MOTION.rise(T, a, 1.8)) * 12;
      return _h(Box, { style: wrap }, _h("p", { style: Object.assign({}, inner, { opacity: op, transform: `translateY(${y}px)` }) }, l.text));
    }
    function FragmentLayer({ T, chapters, reduced }) {
      const out = [];
      chapters.forEach((ch) => {
        if (T < ch.start - 1 || T > ch.end + 1) return;
        (ch.fragments || []).forEach((f, i) => {
          const a = ch.start + f.at, b = ch.start + f.until;
          const op = MOTION.env(T, a, b, 1.8, 1.8);
          if (op <= 0) return;
          const p = clamp((T - a) / (b - a), 0, 1);
          const bl = reduced ? 0 : (1 - Math.min(1, op * 1.4)) * 4;
          out.push(
            _h(Box, { style: {
              left: `${f.x}%`,
              top: `${f.y}%`,
              maxWidth: 640,
              transform: reduced ? "none" : `translate(${Math.sin(p * 2 + i) * 10}px, ${-p * 46}px)`,
              opacity: op * 0.85,
              color: C.muted,
              fontSize: 30,
              fontWeight: 400,
              letterSpacing: "0.01em",
              textShadow: TEXT_SHADOW,
              filter: bl > 0.01 ? `blur(${bl}px)` : "none"
            } }, f.text)
          );
        });
      });
      return _h(_Frag, null, out);
    }
    function ChapterMark({ T, chapters }) {
      for (const ch of chapters) {
        const a = ch.start + (ch.markerAt != null ? ch.markerAt : 0.8);
        const b = a + 6.5;
        if (T <= a || T >= b) continue;
        const op = MOTION.env(T, a, b, 1.6, 1.8);
        return _h(Box, { style: { left: 150, top: 104, display: "flex", flexDirection: "column", gap: 14, opacity: op, maxWidth: 1100 } }, _h("div", { style: { display: "flex", alignItems: "center", gap: 16 } }, _h("div", { style: { width: 28, height: 2, background: C.gold } }), _h("div", { style: { fontSize: 18, letterSpacing: "0.24em", textTransform: "uppercase", color: C.muted } }, TXT.kapitel + " " + ROMAN[ch.index])), _h("div", { style: { fontSize: 30, fontWeight: 500, color: C.textSoft, textShadow: TEXT_SHADOW, letterSpacing: "-0.01em" } }, ch.titel));
      }
      return null;
    }
    function TitleCard({ T, reduced }) {
      const op = MOTION.env(T, 0.6, 11.5, 3, 2.5);
      if (op <= 0) return null;
      const s = reduced ? 1 : MOTION.glide(T, 0, 11.5, 1, 1.04);
      return _h(Box, { style: { inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, opacity: op } }, _h("div", { style: { position: "relative", width: 200, height: 170, transform: `scale(${s})` } }, _h(SplitHeart, { id: "zhT", cx: 100, cy: 85, size: 150, gap: MOTION.glide(T, 1, 10, 4, 14), rim: 0.35 })), _h("div", { style: { fontSize: 80, fontWeight: 500, color: C.text, letterSpacing: "-0.02em", textAlign: "center", lineHeight: 1.1 } }, TXT.titel), _h("div", { style: { fontSize: 24, letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, opacity: MOTION.rise(T, 3.5, 2.5) } }, TXT.untertitel));
    }
    function HeartbeatPulse({ T, chapters, reduced }) {
      let p = 0;
      chapters.forEach((ch) => (ch.heartbeats || []).forEach((h) => {
        const d = T - (ch.start + h);
        if (d >= 0 && d < 0.9) p = Math.max(p, Math.exp(-d * 5));
      }));
      if (p <= 0.01) return null;
      return _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(4,5,9,0.9) 100%)", opacity: p * (reduced ? 0.35 : 0.7) } });
    }
    function Film({ T, chapters, reduced, showText }) {
      REDUCED = reduced;
      const last = chapters[chapters.length - 1];
      const black = last && last.blackAt != null ? MOTION.glide(T, last.start + last.blackAt - 3.5, last.start + last.blackAt, 0, 1) : 0;
      const Slot = ({ children }) => _h("div", { style: { position: "absolute", inset: 0, pointerEvents: "none" } }, children);
      return _h("div", { style: { position: "absolute", inset: 0, fontFamily: FONT, background: C.void } }, chapters.map((ch, i) => {
        const S = SCENES[i];
        const dran = S && T > ch.start - 3 && T < ch.end + 3;
        return _h(Slot, null, dran ? _h(S, { T, ch, reduced }) : null);
      }), _h(Slot, null, _h(TitleCard, { T, reduced })), _h(Vignette, null), _h(Grain, { T, reduced }), _h(Slot, null, _h(HeartbeatPulse, { T, chapters, reduced })), _h(Slot, null, showText ? _h(FragmentLayer, { T, chapters, reduced }) : null), _h(Slot, null, _h(ChapterMark, { T, chapters })), _h(Slot, null, showText ? _h(NarrationLayer, { T, chapters, reduced }) : null), _h("div", { style: { position: "absolute", inset: 0, background: C.void, opacity: black, pointerEvents: "none" } }));
    }

    return Film;
  }

  /* ------------------------------------------------------
     ERZAEHLERSTIMME (Web Speech API, wie im Entwurf)
     Jeder Satz wird gesprochen, sobald seine Zeitmarke erreicht ist
     - aber nur, wenn noch mindestens 1,5 s davon uebrig sind (wer
     mitten in einen Satz einsteigt, hoert erst den naechsten ganz).
     Ob die Stimme an ist, merkt sich der Browser (fhHerzStimme).
  ------------------------------------------------------ */
  function sprachDa() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }
  function stimmeAn() {
    try { return localStorage.getItem("fhHerzStimme") !== "aus"; } catch (e) { return true; }
  }
  function stimmeMerken(an) {
    try { localStorage.setItem("fhHerzStimme", an ? "an" : "aus"); } catch (e) { /* dann nur fuer jetzt */ }
  }

  function stimmeWaehlen(en) {
    const alle = window.speechSynthesis.getVoices() || [];
    const muster = en ? /^en/i : /^de/i;
    return alle.find(function (v) { return muster.test(v.lang) && /natural|neural|premium|enhanced/i.test(v.name); })
      || alle.find(function (v) { return muster.test(v.lang); }) || null;
  }

  function sprechen(text) {
    if (!lauf || !sprachDa()) return;
    const ss = window.speechSynthesis;
    ss.cancel();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lauf.en ? "en-US" : "de-DE";
    const v = stimmeWaehlen(lauf.en);
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = 0.92;
    u.onerror = function (e) {
      /* Ohne Tippen auf die Seite verweigert der Browser die Stimme:
         dann "Ton an" anbieten - das Tippen holt den Satz nach. */
      if (e && e.error === "not-allowed") freigabeAnfordern();
    };
    ss.speak(u);
  }

  function freigabeAnfordern() {
    if (!lauf || lauf.freigabe) return;
    lauf.freigabe = true;
    const l = lauf;
    if (window.fhLiveStorys && window.fhLiveStorys.tonFreigabe) {
      window.fhLiveStorys.tonFreigabe(function () {
        if (lauf !== l) return;
        l.freigabe = false;
        /* Im Tippen selbst sprechen - sonst zaehlt die Freigabe nicht. */
        const z = aktuelleZeile(l.T);
        l.gesprochen = z ? z.i : null;
        sprechen(z && z.b - l.T > 1.5 ? z.text : " ");
      });
    }
  }

  function aktuelleZeile(T) {
    const zs = lauf.zeilen;
    for (let i = 0; i < zs.length; i++) if (T >= zs[i].a && T < zs[i].b) return zs[i];
    return null;
  }

  function erzaehlen(T) {
    if (!lauf.stimme || !sprachDa() || lauf.freigabe) return;
    const z = aktuelleZeile(T);
    if (!z || z.i === lauf.gesprochen) return;
    lauf.gesprochen = z.i;
    if (z.b - T < 1.5) return;
    sprechen(z.text);
  }

  /* Musik in den stillen Stellen leiser (live-storys.js spielt sie). */
  function stilleFaktor(T) {
    let f = 1;
    lauf.stillen.forEach(function (s) {
      const ramp = 1.5, a = s[0], b = s[1];
      if (T > a - ramp && T < b + ramp) {
        const v = Math.min(1, Math.max(0, Math.min((T - (a - ramp)) / ramp, (b + ramp - T) / ramp)));
        f = Math.min(f, 1 - v);
      }
    });
    return f;
  }
  function musikDaempfen(f) {
    if (window.fhLiveStorys && window.fhLiveStorys.musikDaempfen) window.fhLiveStorys.musikDaempfen(f);
  }

  /* ------------------------------------------------------
     BUEHNE UND ABLAUF
  ------------------------------------------------------ */
  let lauf = null;   // { wurzel, buehne, film, kapitel, zeilen, stillen, t0, ab, uhr, letzt, en, stimme, gesprochen, T }

  function einpassen() {
    if (!lauf) return;
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    lauf.buehne.style.transform = "translate(-50%, -50%) scale(" + s + ")";
    lauf.wurzel.classList.toggle("ist-hochkant", window.innerHeight > window.innerWidth * 1.1);
  }

  function bild(jetzt) {
    if (!lauf) return;
    lauf.uhr = requestAnimationFrame(bild);
    if (jetzt - lauf.letzt < 32) return;   // hoechstens ~30 Bilder/s
    lauf.letzt = jetzt;
    const T = Math.min(DAUER, (jetzt - lauf.t0) / 1000 + lauf.ab);
    lauf.T = T;
    zeichnen(lauf.buehne, [lauf.film({ T: T, chapters: lauf.kapitel, reduced: RUHIG.matches, showText: true })], false);
    erzaehlen(T);
    const f = stilleFaktor(T);
    if (Math.abs(f - lauf.daempfung) > 0.02 || (f === 1 && lauf.daempfung !== 1)) { lauf.daempfung = f; musikDaempfen(f); }
  }

  function taste(e) { if (e.key === "Escape") weg(); }

  /* Der Film deckt alles ab: die WebGL-Flaechen der Seite halten so
     lange an (siehe riss-film.js). */
  function vollbild(an) {
    window.fhVollbildAn = an;
    document.dispatchEvent(new CustomEvent("fh:vollbild", { detail: { an: an } }));
  }

  function stimmeKnopfZeigen(knopf) {
    knopf.textContent = lauf.stimme ? L("voiceOff", "Stimme aus") : L("voiceOn", "Stimme an");
    knopf.setAttribute("aria-pressed", lauf.stimme ? "true" : "false");
  }

  function start(opts) {
    weg();
    opts = opts || {};
    const en = istEn();
    const kapitel = kapitelFuer(en ? 1 : 0);
    const zeilen = [], stillen = [];
    kapitel.forEach(function (c) {
      c.lines.forEach(function (l) { zeilen.push({ i: zeilen.length, a: c.start + l.at, b: c.start + l.until, text: l.text }); });
      (c.silences || []).forEach(function (s) { stillen.push([c.start + s[0], c.start + s[1]]); });
    });

    const wurzel = document.createElement("div");
    wurzel.id = "fh-herz";
    wurzel.className = "fh-riss fh-herz";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", L("aria", "Live-Story: Zwei Hälften eines Herzens"));
    const buehne = document.createElement("div");
    buehne.className = "fh-riss-buehne";
    buehne.setAttribute("aria-hidden", "true");
    const hinweis = document.createElement("p");
    hinweis.className = "fh-riss-hinweis";
    hinweis.textContent = L("rotate", "Tipp: Handy quer halten");
    const leiste = document.createElement("div");
    leiste.className = "fh-herz-leiste";
    const stimmeKnopf = document.createElement("button");
    stimmeKnopf.type = "button";
    stimmeKnopf.className = "fh-riss-weiter fh-herz-knopf";
    const weiter = document.createElement("button");
    weiter.type = "button";
    weiter.className = "fh-riss-weiter fh-herz-knopf";
    weiter.textContent = L("skip", "Überspringen");
    weiter.addEventListener("click", weg);
    if (sprachDa()) leiste.appendChild(stimmeKnopf);
    leiste.appendChild(weiter);
    wurzel.append(buehne, hinweis, leiste);
    document.body.appendChild(wurzel);

    lauf = {
      wurzel: wurzel, buehne: buehne, film: baueFilm(en), kapitel: kapitel, zeilen: zeilen, stillen: stillen,
      t0: performance.now(), ab: Math.max(0, (opts.ab || 0) / 1000), uhr: 0, letzt: 0, T: 0,
      en: en, stimme: stimmeAn(), gesprochen: null, freigabe: false, daempfung: 1,
    };
    stimmeKnopfZeigen(stimmeKnopf);
    stimmeKnopf.addEventListener("click", function () {
      if (!lauf) return;
      lauf.stimme = !lauf.stimme;
      stimmeMerken(lauf.stimme);
      stimmeKnopfZeigen(stimmeKnopf);
      if (!lauf.stimme) { if (sprachDa()) window.speechSynthesis.cancel(); return; }
      /* Im Klick sprechen: das ist zugleich die Ton-Freigabe. */
      const z = aktuelleZeile(lauf.T);
      lauf.gesprochen = z ? z.i : null;
      sprechen(z && z.b - lauf.T > 1.5 ? z.text : " ");
    });
    /* Manche Browser laden die Stimmen erst nach. */
    if (sprachDa() && window.speechSynthesis.getVoices().length === 0 && window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener("voiceschanged", function () { /* stimmeWaehlen fragt bei jedem Satz neu */ }, { once: true });
    }
    einpassen();
    window.addEventListener("resize", einpassen);
    document.addEventListener("keydown", taste);
    lauf.uhr = requestAnimationFrame(bild);
    vollbild(true);
  }

  function stimmeStumm() { if (sprachDa()) window.speechSynthesis.cancel(); }

  /* Story vorbei: das letzte Bild blendet kurz aus. */
  function ende() {
    if (!lauf) return;
    const l = lauf;
    stimmeStumm();
    l.wurzel.classList.add("ist-aus");
    setTimeout(function () { if (lauf === l) weg(); }, 1200);
  }

  function weg() {
    if (!lauf) return;
    cancelAnimationFrame(lauf.uhr);
    window.removeEventListener("resize", einpassen);
    document.removeEventListener("keydown", taste);
    stimmeStumm();
    musikDaempfen(1);
    lauf.wurzel.remove();
    lauf = null;
    vollbild(false);
  }

  window.fhHerzFilm = {
    start: start,
    ende: ende,
    weg: weg,
    laeuft: function () { return !!lauf; },
    DAUER: DAUER,
  };
})();
