# Firestore → Supabase Migration (Spieler-Datenbank)

**Status: Phase 2 von 5 — noch NICHT live, Firestore läuft unverändert weiter.**

Voraussetzung erfüllt: Third-Party Auth (Firebase) ist im Supabase-Dashboard aktiviert.

Dieser Ordner ersetzt schrittweise die komplette `firestore.rules`-Logik durch Supabase/Postgres. Firebase Authentication bleibt dabei die einzige Anmeldung (anonym + Twitch/Discord) — nur die Datenbank wandert. Es wird **keine** bestehende Firestore-Daten migriert (bewusste Entscheidung: alle Spieler starten nach dem Umstieg bei 0).

## Warum das überhaupt geht (technische Grundlage)

Anders als bei Firestore hat Postgres Row Level Security keinen eingebauten "alter Wert vs. neuer Wert"-Vergleich in einer einzigen Prüfung. Das wurde hier mit einer **echt gegen lokales Postgres verifizierten** Self-Subquery-Technik gelöst (`app.old_player(uid)` u.ä.) — siehe Kommentar oben in `01-players-ship-progression.sql`. Wichtige Randbedingung, die dabei entdeckt wurde: die Subquery braucht selbst eine passende `SELECT`-Policy, sonst liefert sie still `NULL` und die Prüfung schlägt unbemerkt fehl (kein Fehler, einfach `0 Zeilen betroffen`).

Ein weiterer Unterschied zu Firestore, der die Übersetzung stellenweise sogar **vereinfacht**: Firestores `set(...,{merge:true})` macht das GESAMTE Dokument nach dem Merge zu `newData`, weshalb die Firestore-Regeln überall `!('feld' in newData) || ...`-Ausnahmen brauchen. Ein Postgres-`UPDATE` mit einer `SET`-Klausel, die eine Spalte nicht erwähnt, behält automatisch deren alten Wert — der "Feld unverändert"-Fall ergibt sich von selbst.

## Was migriert ist

**Phase 1**: `players`, `ship_repair`, `player_progression` — vollständige 1:1-Übersetzung jeder Prüfung aus `firestore.rules`: `validShipTools()`, `validDailyQuestsWrite()`/-Detail()/dailyQuestDayIsUnlocked()/toolForQuestDay()/thresholdForQuestDay(), `validCodeRedemption()`-Detail (inkl. aller 6 aktuellen Dublonen-Codes, muss mit `scripts/codes/codes-data.js` synchron bleiben), `validWheelFields()` (20h-Cooldown, 3-Tage-Avatar), `validSpielothekCooldown()` (4s), `validQuestCounters()`, `validProgressionWrite()`, sowie der komplette Fall-A/Fall-B-Zustandsautomat für Reparatur-Etappen in `ship_repair`.

**Phase 2**: `race_progress`, `community_boss`, `community_boss_damage` — jeweils Delta-Obergrenze pro Schreibvorgang (Rennfortschritt +15, Boss-Schaden pro Angriff max. 45), öffentlich lesbar, Schreibrechte nur auf das eigene Dokument (bzw. bei `community_boss` als geteiltes Monats-Dokument ohne Eigentümer-Konzept, exakt wie in Firestore). Firestores "Dokument-ID = week_uid"-Trick wird hier durch einen echten zusammengesetzten Primary Key `(week, firebase_uid)` ersetzt — einfacher, kein String-Vergleich nötig.

## Voraussetzung im Supabase-Dashboard (musst du selbst prüfen)

**Authentication → Third-Party Auth → Firebase muss aktiviert sein**, damit `auth.jwt() ->> 'sub'` die echte, kryptographisch geprüfte Firebase-UID liefert. Ebenso muss geprüft werden, ob `auth.jwt() ->> 'email'` bei OAuth-Logins (Twitch/Discord verlinkt mit Google/E-Mail) tatsächlich die E-Mail-Claim des Firebase-ID-Tokens durchreicht (für `app.is_admin()`). Beides kann ich von hier aus nicht verifizieren.

## Tests

- `02-players-ship-progression.test.sql` — 25 Testfälle (Phase 1), **echt gegen eine lokale PostgreSQL-16-Instanz mit einem Supabase-Auth-Stub ausgeführt**: alle Manipulationsversuche aus dem ursprünglichen Auftrag (currency, gamesPlayed, gamesWon, shipTools, dailyQuests, redeemedCurrencyCodes, lastSpielothekPlayAt, lastWheelSpinAt, tempAvatarExpiresAt, progression, ship_repair, fremde UID, SQL-Injection), 25/25 bestanden.
- `04-race-boss.test.sql` — 12 Testfälle (Phase 2): Rennfortschritt-Sprung, Boss-HP-Manipulation, Schaden-Rangliste-Manipulation, fremde UID, Neuanlage über Obergrenze — 12/12 bestanden.

Lokal wiederholen (Phase 1 + 2):
```
createdb test_db
psql -d test_db -f 00-supabase-auth-stub.sql
psql -d test_db -f 01-players-ship-progression.sql
psql -d test_db -f 03-race-boss.sql
psql -d test_db -c "grant usage on schema app to anon, authenticated, service_role;
  grant select, insert, update, delete on public.players, public.ship_repair, public.player_progression, public.race_progress, public.community_boss, public.community_boss_damage to anon, authenticated;
  grant all on public.players, public.ship_repair, public.player_progression, public.race_progress, public.community_boss, public.community_boss_damage to service_role;"
psql -d test_db -f 02-players-ship-progression.test.sql
psql -d test_db -f 04-race-boss.test.sql
```

## Nächste Schritte (noch nicht umgesetzt)

- Phase 3: `site_config`, `site_meta`, `giveawayEntries`, `giveawayWinners`, `supportReports`, `site_ratings`
- Phase 4: Client-Umstellung (~15 Dateien von `wheelDb` auf `supabaseClient`)
- Phase 5: Umschaltpunkt — erst nach vollständiger Prüfung
