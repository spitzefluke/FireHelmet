# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

Eine deutschsprachige Spiel- und Community-Seite zur Piratensaga „FireHelmet" (Streamer Ändii),
live auf GitHub Pages unter `https://spitzefluke.github.io/FireHelmet/`.

**Der Code ist auf Deutsch kommentiert. Schreib neue Kommentare, Commit-Nachrichten und
Nutzertexte ebenfalls auf Deutsch** — englische Kommentare mitten im Bestand fallen auf.
Bezeichner sind gemischt (historisch englisch, neuer Code oft deutsch); richte dich nach der
Datei, die du gerade anfasst.

## Es gibt keinen Build, keinen Linter, keine Testsuite

Das ist Absicht und keine Lücke, die man füllen soll. Die Seite ist **statisches
HTML/CSS/Vanilla-JS ohne Bundler**: `index.html` lädt ~110 `<script defer>`-Tags in fester
Reihenfolge. `package.json` hat keine Skripte; die Abhängigkeiten (gsap, three, motion) werden
per CDN geladen, nicht gebündelt.

Prüfen heißt hier:

```bash
node --check scripts/pfad/datei.js          # Syntax jeder geänderten JS-Datei
python3 -c "import io; s=io.open('css/60-fortschritt.css',encoding='utf-8').read(); \
  print(s.count('{'), s.count('}'))"        # CSS: Klammern müssen ausgeglichen sein
```

Für alles Weitere: siehe „Im Browser prüfen" unten. **Verlass dich nicht auf `node --check`
allein** — es findet keine gelöschte Funktion, die woanders noch aufgerufen wird, und keinen
CSS-Fehler.

## Im Browser prüfen

Die Live-Seite und `*.supabase.co` sind in dieser Umgebung durch die Egress-Richtlinie
gesperrt. **`localhost` nicht.** Der Weg, der funktioniert:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 &
# Playwright gegen http://127.0.0.1:8765/index.html
# Browser: /opt/pw-browsers/chromium-1194/chrome-linux/chrome, args: ['--no-sandbox']
```

Dabei zu beachten:

- **Das „Neuigkeiten"-Fenster liegt über allem.** Vor dem Screenshot wegräumen:
  `document.getElementById('update-notice-close')?.click()`.
- **Die CDN-Skripte (gsap, three, supabase-js) sind geblockt.** Die entsprechenden
  Konsolenfehler sind hier erwartbar und existieren live nicht. Wer Supabase braucht, muss es
  ersetzen — siehe nächster Punkt.
- **`supabaseClient` ist ein top-level `let` in `scripts/supabase/supabase-client.js`.** Ein
  `window.supabaseClient = …` im Test trifft es **nicht** und legt eine unbeteiligte
  Eigenschaft an. Ohne `window.` zuweisen. Dasselbe gilt für jedes top-level `const`/`let`,
  wenn du eine Datei in einem `vm`-Kontext lädst: hänge eine Ausleitung an
  (`;globalThis.__raus = { KONSTANTE, funktion };`), sonst siehst du nichts.

Diese drei Fallen haben in der Vergangenheit jeweils zu Testergebnissen geführt, die aussahen
wie Codefehler. Wenn eine Prüfung fehlschlägt: **erst fragen, ob der Test falsch ist.**

## Architektur

### Seiten

`index.html` enthält alle 20 Seiten als `<section id="…" class="page">`. `changePage(pageID)`
in `scripts/core/main.js` schaltet `.active-page` um und ruft danach die `update…Page(pageID)`
jedes Bereichs auf. **Eine neue Seite muss sich dort eintragen**, sonst wird sie nie
aufgefrischt. Der Wechsel selbst ist eine CSS-Transition auf `.page` (350 ms, `--fh-ease`) —
diese Animation nicht zusätzlich per JS bespielen.

### CSS

Zehn Dateien in fester Ladereihenfolge, `css/00-basis.css` bis `css/90-typografie.css`. Die
Nummer ist die Kaskade: Späteres überschreibt Früheres. Die Design-Tokens (`--fh-gold`,
`--fh-surface`, `--fh-ease`, …) stehen in `00-basis.css` unter `:root`. **Neue Farben und
Kurven aus den Tokens nehmen**, nicht als Rohwert schreiben.

### Datenbank und Anmeldung

Supabase ist die einzige Datenbank **und** die einzige Anmeldung (Firebase ist vollständig
entfernt — siehe `supabase/game-migration/README.md` für die Vorgeschichte).

- `scripts/supabase/supabase-client.js` legt den Client an und löst `wheelAuthReady` auf
  (anonyme Anmeldung). Jeder Datenzugriff wartet auf dieses Promise.
- Die Spalte heißt aus historischen Gründen weiterhin `firebase_uid`, enthält aber eine
  Supabase-UUID.
- `withSupabaseRlsColdStartRetry(fn)` gehört um **jeden** RPC- und Tabellenzugriff. Fehlt es,
  scheitert der erste Zugriff nach einer Ruhephase.

### Migrationen

`supabase/game-migration/NN-name.sql`, streng aufsteigend, dazu je eine `NN-name.test.sql`.
Sie werden **von Hand im Supabase-SQL-Editor eingespielt** — es gibt keine Migrations-CLI in
diesem Repo. Eine neue Migration darf frühere Dateien nicht überschreiben; wenn eine Regel
erweitert werden muss, kommt eine **zweite Bedingung** dazu (siehe `16-anmeldung.sql`, das
`app.valid_players_write()` bewusst nicht neu schreibt).

Testdateien laufen in einer Transaktion mit `rollback` am Ende und geben `PASS`/`FAIL` je
Zeile aus. **Prüfe gegen `= false`, nicht gegen `is not true`** — Letzteres besteht auch bei
`NULL`, und genau dadurch blieb ein Fehler in `app.is_admin()` lange unentdeckt (`not NULL`
ist `NULL`, ein `if` darauf feuert nie).

Sicherheitsgrenze: Der Browser rechnet Spielergebnisse selbst; die Datenbank prüft nur, dass
der resultierende Kontostand-Sprung Deckel einhält (`app.valid_players_write()`). Rein
virtuelle Währung, kein echtes Geld — bewusste Vereinfachung, kein Versehen.

### Zwei Seiten pro Text

`scripts/core/i18n.js` hält alle Texte in DE und EN. Markup bekommt `data-i18n="bereich.name"`
bzw. `data-i18n-placeholder="…"`, JS nutzt `t(key, fallback)`. Nach dynamischem Markup
`applyTranslations()` aufrufen. **Jeder neue sichtbare Text braucht beide Sprachen.**

## Was schon einmal schiefgegangen ist

- **`pkill -f muster` erwischt die eigene Shell**, weil das Muster in deren Kommandozeile
  steht. Über die PID beenden (`ss -lptn 'sport = :8765'`).
- **Vorlagen mit Platzhaltern werden ausgeführt.** Ein `INSERT` mit `'DEIN-CODE-HIER'` läuft
  fehlerfrei durch und meldet Erfolg — so standen elf Boss-Geheimcodes in der Datenbank, die
  niemand kannte. Schreib in Anleitungen **keine fertig ausführbaren Beispiele**; entweder
  einen Abbruch bei Platzhaltern einbauen oder auf das Admin-Panel verweisen.
- **Emoji sind kein Symbolsatz.** Sie sehen auf jedem Gerät anders aus. Neue Symbole als
  eingebettetes SVG (lucide, ISC) mit `stroke-width="1.6"`, nicht per CDN-Laufzeitbibliothek.
- **Eine CSS-Keyframe ohne `animation-fill-mode` fällt auf den Grundzustand zurück.** Fehlt
  dort `opacity: 0`, bleibt ein gedachter Lichtimpuls dauerhaft stehen.

## Ausliefern

Die Seite ist GitHub Pages auf `main` — **jeder Merge geht sofort live.** Es gibt keine
Staging-Umgebung. Auf `main` laufen CodeQL und eine JavaScript-Analyse; vor dem Merge abwarten,
nicht darüber hinweggehen.

Migrationen und Dashboard-Einstellungen sind **nicht** Teil des Deployments. Wenn eine Änderung
beides braucht, gehört in den PR-Text, was der Betreiber danach von Hand tun muss — sonst ist
die Funktion live und kaputt.
