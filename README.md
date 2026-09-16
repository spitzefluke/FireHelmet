# FireHelmet

Deutschsprachige Spiel- und Community-Seite zur Piratensaga „FireHelmet" (Streamer Ändii).
Statisches HTML/CSS/Vanilla-JS ohne Bundler, live über GitHub Pages:
**https://spitzefluke.github.io/FireHelmet/**

Jeder Merge nach `main` geht sofort live. Eine Staging-Umgebung gibt es nicht.

## Aufbau

| Ordner | Was drin liegt |
| --- | --- |
| `index.html` | Alle 22 Seiten als `<section class="page">`, dazu die Skript-Tags in **tragender** Reihenfolge |
| `css/` | Elf Dateien, `00-basis.css` bis `90-typografie.css`. Die Nummer ist die Kaskade; die Design-Tokens stehen in `00-basis.css` |
| `scripts/core/` | Kern und Zustand: `main.js`, `i18n.js`, Fortschritt, Konfiguration, Anmeldung |
| `scripts/fx/` | Reine Optik ohne eigenen Zustand — Hintergründe, Übergänge, WebGL-Flächen |
| `scripts/nav/` | Seitenwechsel, Navigationsleiste, Tastaturkürzel, Schnellsuche |
| `scripts/<bereich>/` | Je ein Bereich: `shop/`, `race/`, `wheel/`, `spielothek/`, `piratenpass/`, … |
| `scripts/supabase/` | Client und Anmeldung |
| `assets/`, `music/` | Bilder und Klänge |
| `supabase/game-migration/` | Migrationen `NN-name.sql` mit je einer `NN-name.test.sql` |
| `docs/` | `ANMELDUNG.md` (Anmeldewege), `DOMAIN.md` (eigene Adresse einrichten) |

`CLAUDE.md` beschreibt die Architektur ausführlich und nennt die Fallstricke, die hier
schon einmal Zeit gekostet haben — die Datei lohnt sich auch für Menschen.

## Örtlich ansehen

Es gibt keinen Build. Ein statischer Server genügt:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# dann http://127.0.0.1:8765/index.html öffnen
```

## Datenbank

Supabase ist Datenbank **und** Anmeldung. Die Migrationen unter
`supabase/game-migration/` werden **von Hand im Supabase-SQL-Editor** eingespielt, streng
aufsteigend — sie sind nicht Teil des Deployments. Wer eine Änderung merged, die eine
Migration braucht, muss sie dort nachziehen, sonst ist die Funktion live und kaputt.

## Sicherheit

Lücken bitte nicht als Issue öffnen, sondern den Weg in [`SECURITY.md`](SECURITY.md) nehmen.
