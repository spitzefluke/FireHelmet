# Zeitmaschine 2100 – Film, Epoche, Seitenwahl, Hangar, Sternenschlacht

Stand: 15.10.2026 · Quelle: Claude-Design-Projekt „Zeitmaschine 2100“
(`zeitmaschine-2100.jsx`, `Zeitmaschine 2100.dc.html`, `css/96-epoche-2100.css`)

## Ziel

Ein neuer Story-Film bringt die Seite ins Jahr 2100. Danach wählt jeder Spieler
endgültig eine Seite – **Menschen** oder **Aliens** – mit vielen verschachtelten
Vor- und Nachteilen, baut im **Hangar** seine Einheit aus und kämpft in einer
vom Admin live gestarteten **Sternenschlacht**. Das Wochenrennen ruht, solange
die Epoche 2100 gilt. Die Siegerseite bekommt nur Ruhm.

## Etappen (je ein eigener PR)

| # | Inhalt | Migration |
|---|---|---|
| 1 | Film „Zeitmaschine 2100“ als Story, Epoche 2100 (All-Look), Admin-Schalter | 46 |
| 2 | Seitenwahl (endgültig), Seiten-Boni überall, Wochenrennen ruht | 47 |
| 3 | Hangar: Einheitentyp wählen, Ausbau mit Dublonen | 48 |
| 4 | Live-Sternenschlacht, Prozentbanner, Ruhmeshalle | 49 |

Jede Etappe ist für sich lauffähig. Eine spätere setzt die frühere voraus.

## Etappe 1 – Film und Epoche 2100

- **Film** `scripts/liveevent/zeit-film.js`: Port von `zeitmaschine-2100.jsx`
  nach Vanilla-JS, im selben Muster wie `riss-film.js`/`herz-film.js`
  (eigener kleiner Renderer statt React, `window.fhZeitFilm`). Neun Szenen,
  zusammen 300 s: Werkstatt 30 · Aufladen 30 · Sprung 20 · Stille 30 · Erde 40 ·
  Spaltung 35 · Umsehen 25 · Krieg 50 · Neue Seite 40.
  Bilder: `scripts/avatare/1|3|5.png`, `scripts/image/logbuch2.webp`
  vorhanden, sonst aus dem Projekt übernehmen).
- **Nachladen:** Eintrag `zeit-film` in `ADRESSEN` (`scripts/core/nachladen.js`),
  nicht im HTML.
- **Story** `zeit` in `live-storys.js`, Admin-Knopf wie beim Riss, Texte DE/EN.
- **Migration 46** `46-epoche-2100.sql`: Spalte `live_event.jahr_2100_ab`.
  Der bestehende Epochen-Trigger bekommt eine **zweite** Funktion daneben (35
  wird nicht überschrieben): Story `zeit` → `jahr_2100_ab = story_at + 300 s`,
  Abbruch vor Ablauf nimmt den Zeitpunkt zurück. `admin_epoche('2100')` als
  neue Fassung mit erweiterter Prüfung; 2026 setzt beide Spalten auf `null`,
  2100 löscht `jahr_1720_ab`, 1720 löscht `jahr_2100_ab`. Story `zeit` in die
  erlaubten Storys und Story-Preise aufnehmen.
- **CSS** `css/96-epoche-2100.css` unter `html.fh-2100`, aus dem Entwurf
  übernommen und an alle Seiten angepasst (Glas-Flächen, Leuchtkanten,
  Sternenhimmel). Feste Live-Effekte an `body` nicht umfärben (wie bei 1720).
- **Client:** Epochen-Anwendung setzt `html.fh-2100` statt `fh-1720`, wenn
  `jahr_2100_ab <= jetzt`. Admin-Vorschau lokal.

## Etappe 2 – Seitenwahl und Boni

- **Wahl:** Ist 2100 aktiv und hat der angemeldete Spieler noch keine Seite,
  erscheint ein Vollbild mit beiden Seiten, ihren Vor- und Nachteilen und
  einer zweiten Bestätigung („endgültig“). Gäste sehen die Seiten, wählen
  erst nach Anmeldung.
- **Migration 47:** Spalte `players.seite` (`'menschen' | 'aliens' | null`),
  RPC `seite_waehlen(p_seite)` – nur wenn `null`, nur in 2100. Restrictive
  Policy: `seite` per normalem UPDATE eingefroren. `admin_seite_setzen(uid,
  seite)` als einzige Änderung danach. Renn-Einträge (`race_progress`) per
  zusätzlicher restrictive Policy gesperrt, solange 2100 gilt.
- **Boni** nur in 2100, über eine neue Funktion `fhSeitenBonus(art)`, die
  `fhSkillBonus(art)` an den bestehenden Stellen ergänzt (Rad, Shop,
  Spielothek, XP) plus Boss (serverseitig, wie Migration 25).

| Bereich | Menschen | Aliens |
|---|---|---|
| Glücksrad | +12 % Dublonen | −10 % Dublonen |
| Shop | −8 %, „Feilscher“ wirkt 1,5-fach | +10 % teurer |
| Spielothek | −10 % | +15 % |
| XP/Pass tagsüber (6–18 Uhr) | +10 % | −10 % |
| XP/Pass nachts (22–6 Uhr) | −10 % | +20 % |
| Boss | −10 % Schaden | +15 % Schaden, Kampf-Skills 1,5-fach |
| Schlacht | +25 % Leben, Schilde laden nach, Formation (+2 % Schaden je eigene Einheit in der Nähe, max. +20 %), −15 % Schaden, Spezial lädt langsamer | +30 % Schaden, Drohnen doppelt, −20 % Leben, Schilde laden nicht nach |

Tageszeit = Ortszeit des Browsers. Alle Dublonen-Boni bleiben unter den
Deckeln von `app.valid_players_write()` – die Deckel werden nicht angehoben.

- **Rennseite** zeigt in 2100 nur „Das Rennen ruht – die Flotten sind im All“
  mit Links zu Hangar und Schlacht; die Wochenauszahlung entfällt in 2100.

## Etappe 3 – Hangar

- Neue Seite `#hangar` (nur in 2100 in der Navigation), Eintrag in
  `changePage` nicht nötig, solange sie keine Auffrischung braucht; sonst
  `updateHangarPage`.
- Vier Typen je Seite, frei wechselbar außer während einer laufenden Schlacht:

| Menschen | Spezial | Aliens | Spezial |
|---|---|---|---|
| Jäger – schnell, wenig Leben | Raketensalve (Sofortschaden) | Drohne – schwach, doppelt | Schwarmangriff (Sofortschaden) |
| Fregatte – ausgewogen | Störsender (Gegner −30 % Schaden, 15 s) | Stachel – Bomber | Säurebombe (großer Sofortschaden) |
| Kreuzer – zäh, langsam | Schildwall (eigene Seite −50 % Schaden, 20 s) | Weber – bremst | Netz (Gegner −40 % Schaden, 20 s) |
| Träger – heilt Nachbarn | Reparaturdrohnen (Heilung) | Brutschiff – erzeugt Drohnen | Brut (Zusatz-Dauerfeuer, 30 s) |

- Ausbau: Leben, Schaden, Spezial je 5 Stufen; Preise 1 000 / 3 000 / 8 000 /
  20 000 / 50 000 Dublonen. Ausbauten gehören dem Spieler, nicht dem Typ.
- **Migration 48:** Tabelle `hangar_einheiten` (uid, typ, stufe_leben,
  stufe_schaden, stufe_spezial), RPCs `hangar_typ_waehlen`, `hangar_ausbauen(wert)`
  – prüfen Seite, Kontostand, Stufe < 5, ziehen Dublonen ab (wie
  `mystery_gift_kaufen`). Lesen für alle, Schreiben nur per RPC.

## Etappe 4 – Live-Sternenschlacht

**Rechenweg A: Die Datenbank ist maßgeblich, jeder Browser rechnet mit.**

- **Migration 49:** Tabellen `sternenschlacht` (id, start_at, ende_at, seed,
  status, leben0_menschen, leben0_aliens, dps_menschen, dps_aliens, sieger,
  endstand), `sternenschlacht_einheiten` (Schnappschuss beim Start: uid, seite,
  typ, leben, schaden, spezial), `sternenschlacht_aktionen` (uid, art
  `ziel|spezial`, ziel_uid, at, wert).
- `admin_schlacht_starten(dauer_min)` – Standard 10 min, nur in 2100, nur
  eine laufende Schlacht. Nimmt alle Spieler mit Seite auf; Werte aus
  Typ + Ausbau + Seiten-Boni.
- `schlacht_ziel(ziel_uid)` – höchstens alle 5 s je Spieler, Schaden =
  eigener Schadenswert × Fokus (+10 % je weiterem Spieler auf dasselbe Ziel
  in den letzten 5 s, max. +50 %).
- `schlacht_spezial()` – einmal je Schlacht, Wirkung je Typ (siehe Hangar).
- `schlacht_stand(id)` – Leben je Seite zum Zeitpunkt `now()`:
  Startleben − Dauerfeuer des Gegners × Zeit (mit Wirkfenstern aus Schildwall,
  Netz, Störsender, Brut) − Ziel-/Sofortschaden + Heilung, nicht unter 0.
  Prozent = Anteil am Gesamtleben.
- `admin_schlacht_beenden()` bzw. automatisch beim ersten Aufruf nach
  `ende_at`: setzt `sieger`, `endstand`.
- **Client** `scripts/schlacht/schlacht.js` + Seite `#sternenschlacht`:
  Schlachtfeld im Film-Look (Schiffsformen aus dem Film), eigene Einheit
  markiert, bis ~120 Einheiten einzeln, Rest als Pulk. Realtime auf Aktionen;
  Banner unten aus derselben Formel, alle 5 s mit `schlacht_stand`
  abgeglichen. Live-Hinweis „Sternenschlacht läuft – jetzt mitkämpfen“.
- **Ende:** Siegerbanner, Feuerwerk in der Farbe der Siegerseite.
  **Ruhmeshalle** mit allen Schlachten (Datum, Sieger, Endstand, je Seite die
  zwei Spieler mit dem meisten Schaden). Keine Dublonen, keine XP.
- Gäste schauen zu; Ziel/Spezial nur angemeldet.

## Querschnitt

- Alle Texte DE/EN in `i18n.js`. Symbole als lucide-SVG, keine Emoji.
- Jeder Datenzugriff in `withSupabaseRlsColdStartRetry`.
- Neue Migrationen überschreiben keine alte Datei; Erweiterungen als zweite
  Bedingung bzw. neue Funktion.
- Policy-DDL wird im Supabase-SQL-Editor eingespielt (über die MCP-Anbindung
  hängt sie, siehe Migration 45).

## Prüfung

- Je Migration eine `NN-….test.sql` (PASS/FAIL, Vergleiche gegen `= false`):
  Epochen-Umschaltung, Seitenwahl nur einmal, Seite eingefroren, Rennsperre in
  2100, Hangar-Preise und Stufengrenze, Schadensmodell an festen Zeitpunkten,
  Ziel-Taktung, Spezial nur einmal.
- Browser gegen localhost (Desktop und Handy) je Etappe; Film: Szenenwechsel
  an den Szenengrenzen, Epoche nach 300 s.
- `python3 werkzeuge/cache-versionen.py` vor jedem Commit mit JS/CSS.

## Nicht Teil davon

- Echtzeit-Server, Steuerung der Einheit per Hand, Dublonen/XP für Sieger,
  Boni außerhalb von 2100.
