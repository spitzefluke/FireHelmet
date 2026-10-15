# Zeitmaschine 2100 – Etappe 1: Film und Epoche 2100

> Ausführung: inline in dieser Sitzung (executing-plans), Schritte als Checkboxen.

**Ziel:** Der Admin startet die Story „Zeitmaschine 2100“. Alle Zuschauer sehen den
5-Minuten-Film; zum Filmende wechselt die ganze Seite für alle in die Epoche 2100.

**Aufbau:** Wie „Der Riss“ (Migration 32/35, `riss-film.js`): Film als nachgeladenes
Vanilla-JS mit kleinem `_h`-Baum, Story über `live_event.story`, Epoche über eine
Zeitmarke in `live_event`, Klasse `html.fh-2100` mit eigener CSS-Datei.

**Spezifikation:** `docs/superpowers/specs/2026-10-15-zeitmaschine-2100-design.md`

## Feste Regeln

- Kommentare, Commits, Texte auf Deutsch; jeder sichtbare Text DE und EN.
- Migration 35/38 werden nicht überschrieben; Erweiterung als neue Funktion/neuer Trigger.
- Story-Funktionen (`admin_live_story`, `live_story_belohnung`) wortgleich aus 38, nur um
  `'zeit'` ergänzt, mit `46:` markiert.
- Vor dem Commit `python3 werkzeuge/cache-versionen.py`; Prüfen mit `--pruefen`.

## Epochen-Regel (Client und Datenbank)

`jahr_1720_ab` und `jahr_2100_ab` sind Zeitmarken. Es gilt die **zuletzt erreichte**
Marke (≤ jetzt); keine erreicht → 2026. Story `riss` setzt nur 1720 (Trigger aus 35),
Story `zeit` setzt nur 2100 (neuer Trigger). `admin_epoche` setzt eine Marke auf
`now()` und löscht die andere; `'2026'` löscht beide.

## Aufgaben

### 1. Migration 46 + Test
- [ ] `46-zeitmaschine-2100.sql`: Spalte `jahr_2100_ab`; Trigger `live_event_epoche_2100`
  (Start `zeit` → `story_at + 300 s`, Abbruch vor Ablauf → `null`); Story-Constraints,
  `admin_live_story`, `live_story_preise` (+ Zeile `zeit`), `live_story_belohnung`
  (`abschluss` ab 290 s) um `'zeit'` ergänzt; `app.admin_epoche` neu mit `'2100'`.
- [ ] `46-zeitmaschine-2100.test.sql`: Trigger setzt/löscht, Admin-Umschalten in alle drei
  Richtungen, Constraint lässt `zeit` zu, Belohnung `zu-frueh` vor 290 s.
- [ ] Probelauf lokal (pg im Scratchpad), dann Commit.

### 2. Film `scripts/liveevent/zeit-film.js`
- [ ] JSX aus dem Entwurf mit esbuild (`--jsx-factory=_h`) übersetzen; `React.Fragment`
  → `_Frag`, `useComposition` → feste Szenenmarken, `window.Easing` → lokal.
- [ ] Renderer aus `riss-film.js` übernehmen, SVG-Tags erweitern (`rect`, `circle`,
  `ellipse`, `line`, `image`, `polyline`, `radialGradient`, `clipPath`),
  `preserveAspectRatio` camelCase lassen.
- [ ] API `window.fhZeitFilm = { start({ab, vorschau}), ende(), weg(), laeuft(), DAUER }`.
- [ ] `node --check`.

### 3. Einbindung
- [ ] `nachladen.js`: `zeit` in `ADRESSEN`.
- [ ] `live-storys.js`: Szenen `zeit` (30/30/20/30/40/35/25/50/40 s), Start/Ende/Weg,
  Belohnung am Ende, Epochen-Logik auf zwei Marken, `fhEpoche.jahr()` → 2026/1720/2100.
- [ ] `admin-gateway.js`: Story-Eintrag, Preis-Eintrag, Epochen-Knöpfe 2100 + Vorschau 2100.
- [ ] `i18n.js`: `zeit.aria`, `story.zeit.reward` (DE/EN).

### 4. CSS
- [ ] `css/96-epoche-2100.css` aus dem Entwurf, `#fh-zeit` in die `:not`-Listen von 95 und 96.
- [ ] `index.html`: Link nach 95. CLAUDE.md: dreizehn CSS-Dateien.

### 5. Prüfen und ausliefern
- [ ] Browser (localhost, Supabase ersetzt): Film an mehreren Zeitpunkten, Handy hochkant,
  Epoche 2100 auf mehreren Seiten, Admin-Knöpfe.
- [ ] Cache-Versionen, Commit, Push, PR (Migration 46 im PR-Text als Handarbeit).
