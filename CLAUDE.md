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
HTML/CSS/Vanilla-JS ohne Bundler**: `index.html` lädt 134 `<script defer>`-Tags in fester
Reihenfolge, davon 120 aus diesem Repo. Sieben große Skripte, die fast niemand braucht
(`admin-gateway.js`, `riss-film.js`, `herz-film.js`, `zeit-film.js`, `nukes-film.js`, `story-wetter.js`,
`drehbuch.js`), stehen stattdessen in der Tabelle
`ADRESSEN` in `scripts/core/nachladen.js` und kommen erst bei Bedarf über `fhNachladen(name)`.
Die Adressen gehören **nicht** ins HTML: Aus dem DOM gelesen und als `script.src` gesetzt,
meldet CodeQL das als hohe Sicherheitslücke. `package.json` hat keine Skripte; die Abhängigkeiten (gsap, three, motion) werden
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

## gstack

**Zum Surfen die Skill `/browse` aus gstack nehmen, nichts anderes.** Die Werkzeuge
`mcp__claude-in-chrome__*` sind dafür **nicht** zu verwenden.

Verfügbare Skills:

`/office-hours` · `/plan-ceo-review` · `/plan-eng-review` · `/plan-design-review` ·
`/design-consultation` · `/design-shotgun` · `/design-html` · `/review` · `/ship` ·
`/land-and-deploy` · `/canary` · `/benchmark` · `/browse` · `/connect-chrome` · `/qa` ·
`/qa-only` · `/design-review` · `/scrape` · `/setup-browser-cookies` · `/setup-deploy` ·
`/setup-gbrain` · `/retro` · `/investigate` · `/document-release` · `/document-generate` ·
`/codex` · `/cso` · `/autoplan` · `/plan-devex-review` · `/devex-review` · `/careful` ·
`/freeze` · `/guard` · `/unfreeze` · `/gstack-upgrade` · `/learn`

Zwei Hinweise, die beim Eintragen dieser Liste aufgefallen sind und die noch offen sind:

- `/connect-chrome` und `/devex-review` stehen so **nicht** in der gstack-README. Dort
  heißen die nächstliegenden Einträge `/open-gstack-browser` und `/plan-devex-review`.
  Wer eine der beiden aufruft und ins Leere läuft, weiß hiermit warum.
- gstack ist **nicht Teil dieses Repos** und wird pro Rechner installiert
  (`~/.claude/skills/gstack`). In einer frisch aufgesetzten Umgebung ist es nicht da,
  und dann gilt für das Surfen wieder, was unter „Im Browser prüfen" steht.

## Architektur

### Seiten

`index.html` enthält alle 28 Seiten als `<section id="…" class="page">`. `changePage(pageID)`
in `scripts/core/main.js` schaltet `.active-page` um und ruft danach die `update…Page(pageID)`
jedes Bereichs auf. **Eine neue Seite muss sich dort eintragen**, sonst wird sie nie
aufgefrischt. Der Wechsel selbst ist eine CSS-Transition auf `.page` (350 ms, `--fh-ease`) —
diese Animation nicht zusätzlich per JS bespielen.

Der Admin kann jede Seite außer Start, Gateway, Impressum und Datenschutz abschalten
(`siteConfig.disabledPageIds`, `scripts/core/seiten-sperre.js`). Die Liste im Gateway
entsteht aus den Nav-Einträgen mit `data-page` – eine neue Seite braucht dafür nichts
Eigenes. Die Sperre nutzt die Klasse `fh-seite-aus`, **nicht** `fh-flag-aus` (die schaltet
das Jahr 2100 für Hangar & Co.); beide dürfen sich nicht gegenseitig aufheben.

### Skripte

`scripts/` ist nach Zuständigkeit geteilt, nicht nach Seite. Drei Ordner tragen die
gemeinsame Grundlage:

- **`scripts/core/`** — Kern und Zustand: `main.js`, `i18n.js`, die beiden
  `progression*`-Dateien, Konfiguration, Anmeldung, Hinweise.
- **`scripts/fx/`** — reine Optik ohne eigenen Zustand: `aurora-bg`, `seiten-fx`,
  `motion-fx`, `reveal`, `skeleton`, `zaehler`, die drei WebGL-Flächen. **Nichts hier
  darf Spiellogik enthalten** — wer eine dieser Dateien entfernt, darf höchstens
  Aussehen verlieren, nie Funktion.
- **`scripts/nav/`** — Navigation: `seitenwechsel`, `nav-sync`, `nav-keys`,
  `rail-flyout`, `quick-search`.

Alles Übrige unter `scripts/` gehört je einem Bereich (`shop/`, `race/`, `wheel/`, …).
**Die Ladereihenfolge in `index.html` ist tragend** — ein neues `<script>` gehört an die
Stelle, an der seine Abhängigkeiten schon geladen sind, nicht ans Ende.

Nachgeladene Skripte sind beim Seitenstart **nicht** da: `window.fhRissFilm`,
`window.fhHerzFilm`, `window.fhZeitFilm`, `window.fhNukesFilm`, `window.fhStoryWetter`, `window.fhDrehbuch` und alles aus `admin-gateway.js` (z. B. `renderGatewayPage`) erst
nach `fhNachladen(...)`. Das **Drehbuch** (Migration 65, `scripts/liveevent/drehbuch.js`) baut
im Admin-Bereich ein Live-Event vorab aus Schritten (Text, Story, Story beenden, Effekt, Pause),
gespeichert in `event_drehbuecher` (nur Admins per RLS); abgespielt wird im Browser des Admins
über dieselben Wege wie die Einzelknöpfe (`liveSend`, `gwStoryStart`). Was andere Dateien früher brauchen, gehört in die kleine
Immer-geladen-Datei daneben (`admin-zugang.js`: `isAuthorizedAdmin`, `updateGatewayPage`).

### CSS

Dreizehn Dateien in fester Ladereihenfolge, `css/00-basis.css` bis `css/96-epoche-2100.css`. Die
Nummer ist die Kaskade: Späteres überschreibt Früheres. Die Design-Tokens (`--fh-gold`,
`--fh-surface`, `--fh-ease`, …) stehen in `00-basis.css` unter `:root`. **Neue Farben und
Kurven aus den Tokens nehmen**, nicht als Rohwert schreiben.

`95-epoche-1720.css` gilt nur unter `html.fh-1720` (nach dem Riss, Migration 35): Ein
Farbfilter dreht dort den ganzen Inhalt von dunkel auf Pergament. Neues Markup braucht
dafür nichts Eigenes. Nur wer ein neues festes Element direkt an `body` hängt, das **nicht**
umgefärbt werden soll (ein Live-Effekt), trägt es dort in die `:not(...)`-Liste ein. Und:
`position: fixed` im Inhalt landet unter 1720 am Rand von `#fh-main` statt am
Bildschirmrand – feste Hinweise an `body` hängen.

`96-epoche-2100.css` gilt genauso unter `html.fh-2100` (nach der Zeitmaschine, Migration 46)
und hat eine eigene `:not(...)`-Liste – ein neues Live-Element gehört in **beide** Listen.
Welche Epoche gilt, entscheidet die zuletzt erreichte Zeitmarke (`jahr_1720_ab`,
`jahr_2100_ab`), siehe `live-storys.js`.

### Piratenpass

Die Saisons stehen in `PIRATE_PASSES` (`scripts/core/progression-data.js`). Pass 1 rechnet
seine Belohnungen im Browser (`piratenpass.js`, `schatzkarte.js`). **Pass 2 („Die Seekarte“,
`scripts/piratenpass/pass2.js`) nicht:** Belohnungen, Stand und Abholen liegen in der Datenbank
(`pass_belohnungen`, `pass_stand()`, `pass_belohnung_holen()`, Migration 53). Er startet, wenn
der Admin ihn freischaltet (`siteConfig.pass2Ab`), und beendet damit Pass 1. Eine neue Saison
braucht ihre `pass_id` im Constraint `progression_pass_id_valid` und in
`app.pass_saison_aktuell()`, sonst lehnt die Datenbank den Wechsel ab.

**Diamanten** (Migration 54) sind eine zweite Währung, die nur der Admin verteilt. Sie liegen in
`diamanten_konto`, nicht in `players` – dort dürfte der Browser per RLS schreiben. Der
Kapitänspass von Pass 2 kostet 100 Diamanten; die Kapitänsstufe 50 ist ein Tanz für 500 V-Bucks,
den der Spieler mit Epic-Namen über `pass_tanz_holen()` anfordert (Admin: Community →
Tanz-Zusagen). Neue Tabellen mit Spielerbezug räumt der Trigger `pass2_konto_aufraeumen` auf
`players` mit ab – `mein_konto_loeschen()` (18) kennt sie nicht.

### Sternenschlacht

Die Schlacht (`scripts/schlacht/`) rechnet allein die Datenbank (Migrationen 49, 50, 55); der
Browser zeigt nur. Seit 55 spielt jede Schlacht an einem **Kampfort** (`schlacht_orte`) mit
eigenen Faktoren und Ereignissen im festen Takt – `schlacht-orte.js` zeichnet Hintergrund,
Ereignisse und die Start-Animation zu denselben Zeitpunkten, die `app.schlacht_leben()`
abrechnet. Wer eine Regel ändert, ändert sie in der Tabelle, nicht im Browser. Ausgelost wird
erst mit der Freigabe `schlachtOrte` (Live-Event → Freigaben, Migration 56); vorher sieht nur
der Admin die Orte über `fhSchlachtOrte.vorschau()` („Kampforte ansehen“).

Seit 57 gibt es sechs **Parteien** (Menschen, Aliens, Piraten, Maschinen, Kristall, Geister) mit je
vier Schiffstypen; Werte und Spezialangriffe stehen in `schlacht_parteien` und `schlacht_typen`,
nicht mehr in Fallunterscheidungen. Mit der Freigabe `schlachtParteien` wählt der Admin beim Start
zwei Parteien, und die Schlacht beginnt mit einer Sammelphase (`schlacht_wahl`,
`schlacht_partei_waehlen()`). Intern bleiben die Slots `menschen` (links) und `aliens` (rechts) –
welche Partei darin kämpft, sagen `partei_links`/`partei_rechts` und `sternenschlacht_einheiten.partei`.
Im Browser ist `seite` bei `fhSchiffe.zeichnen()` immer die **Partei**; ein neuer Typ braucht
Einträge in `hangar-data.js`, `schiffe.js` (Form), `schlacht-fx.js` (Waffe), `i18n.js` und
`schlacht_typen`.

Seit 58/59 gibt es **Ausrüstung** (Sonderwaffen, zwei Module, Schiffs-Rang aus Erfahrung;
`hangar_teile`, `hangar_besitz`, `schiff_rang`), **Bewegen und Hülle** und das
**Boss-Mutterschiff** (`modus = 'boss'`, `admin_boss_starten()`), jeweils hinter einer Freigabe
(`hangarAusruestung`, `schlachtBewegung`, `schlachtBoss`). Was beim Start einer Schlacht
freigegeben war, hält ein Trigger in `mit_ausruestung` / `mit_bewegung` fest – eine laufende
Schlacht ändert ihre Regeln nicht. Die Browser-Seite dieser Regeln (Positionen, Hülle,
Boss-Takt) steht in `schlacht-kampf.js` und muss zu `app.schlacht_huelle()`,
`app.schlacht_bewegen()` und `app.schlacht_leben()` passen. Neue Tabellen mit Spielerbezug
räumt hier der Trigger `hangar_konto_aufraeumen` ab.

Seit 62 gibt es die **Front** (Freigabe `schlachtFront`, nicht im Boss-Modus): Alle
`front_takt_sek` Sekunden (Standard 10) rechnet `app.schlacht_front_takt()` einen Takt –
Frontlinie (`front_wert`, −100..100) verschieben, Druckschaden, bei ±100 ein Durchbruch, dazu
ein Ereignis aus `app.front_ereignis()` und Kampfpunkte. Spieler wählen eine Haltung
(`schlacht_haltung()`) und geben Kampfpunkte für Vorstoß, Bollwerk und Reparatur aus
(`schlacht_front_verbessern()`). Ist eine Seite deutlich kleiner, bekommt sie beim Start einen
**Ausgleich** (`ausgleich_links`/`_rechts`) auf Leben und Schaden. Die Regler stehen in
`schlacht_regler` (Admin: Sternenschlacht → Front, `admin_front_einstellen()`); der Start
übernimmt sie in die Schlacht. Die Browser-Seite steht in `schlacht-front.js` – sie zeigt nur
und lädt neu, wenn ein Takt fällig ist.

Seit 63 gilt das **Design V2** aus Claude Design („Schlacht Design“): `scripts/hangar/schiffe.js`
und `scripts/schlacht/schlacht-orte.js` stammen von dort (Wappen, Bemalung, Formationen,
Kamerafahrt im Einflug). Der Einflug stylt sich selbst mit Inline-Stilen aus den `--fh-*`-Tokens
– dafür gibt es kein CSS mehr in `50-redesign.css`. Es gibt zehn Kampforte (neu: `pulsar`,
`friedhof`, `mondring`) und je Partei **fünf** Typen; der fünfte ist ein schweres Großschiff.
Ein neuer Typ für Menschen oder Aliens braucht zusätzlich einen Eintrag im Constraint
`hangar_typ_bekannt`; `app.hangar_typ_passt()` liest seit 63 aus `schlacht_typen`.

**Musik je Kampfort** (`schlacht-klang.js`): Jeder Ort hat ein eigenes Synth-Stück (`STUECKE`:
Tempo, Akkorde, Muster, Erkennungszeichen) oder eine hochgeladene Datei `schlacht_<ort>` (Admin:
„Musik je Story“, Versionen in `live_event.musik_versionen`, Migration 34 – keine eigene Migration
nötig). `fhSchlachtKlang.ort(id)` schaltet um; die Schlacht setzt den Ort der laufenden Schlacht,
der Hangar den der letzten Schlacht oder den dort gewählten (`localStorage` „fhHangarMusik“).
Ein neuer Ort braucht ein Stück in `STUECKE` und eine Zeile in `GW_MUSIK_STORYS`.

### Spind und Glücksmine

Der **Spind** (Migration 60, Freigabe `spind`, `scripts/spind/spind.js`) bündelt Titel, Avatar
und Rahmen, Namensfarbe, Banner und Spruch. Er hat **keinen Menüeintrag**: Man erreicht ihn nur
über das eigene Bild in der Spielerkarte unten links (`fhAvatarKlick()` in `avatar-wahl.js`). Namensfarben und Banner kauft man mit Dublonen
(`spind_teile`, `spind_teil_kaufen()`); getragen wird über `spind_tragen()`. Was jemand trägt,
liest jeder über `spind_je_spieler()` – `fhProfil.namensKlasse(uid)` färbt damit Namen in
Bestenlisten, `fhProfil.zeigen(uid)` öffnet die Profilkarte. Der getragene Titel gewinnt in
`app.event_titel_je_spieler()` vor dem neuesten.

Die **Glücksmine** (Migration 61, Freigabe `gluecksmine`, `scripts/mine/gluecksmine.js`)
bringt **Erz**, eine dritte Währung in `mine_stand`. Gehackt wird über `mine_hacken()`
(serverseitig gedrosselt), der Bohrer füllt die Lore auch ohne Spieler (`mine_abholen()`),
Geräte steigen über `mine_verbessern()`. Erz bezahlt die Schiffssysteme Panzerung und Geschütz
(`schiff_system_ausbauen()`) und die Geräte. Die Seite folgt dem Entwurf „Nocturne“ aus Claude Design
(„Gluecksmine“, 1b): Fels als Bühne mit Anzeigen für Block und **Tiefe** (alle 25 Blöcke eine
weiter, reine Optik aus `bloecke_gesamt`), Bohrturm im Canvas, Ausrüstung und Bestenliste in
einer Spalte daneben. Die Lore leert sich bei offener Seite alle 30 s von selbst (`mine_abholen()`).

Seit 64 besteht die Mine aus **Blöcken mit Leben** (`block_art`, `block_leben`): Ein Hieb zieht
so viel ab, wie die Spitzhacke Stufen hat; beim Zerbrechen würfelt `app.mine_neuer_block()` den
nächsten – jeder 30. ist **Raumerz**. Mit der Freigabe `gluecksmine` kosten Leben, Schaden und
Spezial im Hangar auf **allen Stufen 1..15 nur Raumerz** (`hangar_ausbauen_raumerz()`,
Preise in `app.hangar_raumerz_preis()` und `HANGAR_RAUMERZ_PREISE`); `hangar_ausbauen()`
(Dublonen) lehnt dann mit `nur-raumerz` ab, `hangar_ausbauen_erz()` (61) immer. Ohne Freigabe
bleibt es bei Dublonen bis Stufe 5. Neue Tabellen mit Spielerbezug räumen die Trigger
`spind_konto_aufraeumen` und `mine_konto_aufraeumen` ab.

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

- **`window.supabaseClient` ist immer `undefined`** — auch im Produktivcode, nicht nur im
  Test (siehe „Im Browser prüfen“). Eine Prüfung `if (!window.supabaseClient) return;` legte
  Skill-Baum, Live-Event und Admin-Erkennung still lahm, ohne einen einzigen Fehler zu werfen.
  Prüfen mit `typeof supabaseClient !== "undefined" && supabaseClient`. Dasselbe gilt für
  jedes andere top-level `let`/`const`.
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

**Vor jedem Commit, der JS oder CSS ändert:** `python3 werkzeuge/cache-versionen.py`. Es
schreibt an jedes Skript und Stylesheet in `index.html` ein `?v=` aus dem Dateiinhalt. Pages
lässt Browser Dateien zehn Minuten zwischenspeichern; ohne neue Nummer sehen Besucher nach
einem Merge noch das alte JavaScript („die neuen Sachen sind nicht da“). Eine vergessene
Nummer macht nichts kaputt, sie verzögert nur. `--pruefen` meldet veraltete Nummern, ohne
etwas zu ändern. Ein neues `<script>` bekommt seine Nummer beim nächsten Lauf von selbst.

Migrationen und Dashboard-Einstellungen sind **nicht** Teil des Deployments. Wenn eine Änderung
beides braucht, gehört in den PR-Text, was der Betreiber danach von Hand tun muss — sonst ist
die Funktion live und kaputt.
