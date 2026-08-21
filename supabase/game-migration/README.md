# Firestore → Supabase Migration (Spieler-Datenbank)

**Status: Phase 1 von 5 — noch NICHT live, Firestore läuft unverändert weiter.**

Dieser Ordner ersetzt schrittweise die komplette `firestore.rules`-Logik durch Supabase/Postgres. Firebase Authentication bleibt dabei die einzige Anmeldung (anonym + Twitch/Discord) — nur die Datenbank wandert. Es wird **keine** bestehende Firestore-Daten migriert (bewusste Entscheidung: alle Spieler starten nach dem Umstieg bei 0).

## Warum das überhaupt geht (technische Grundlage)

Anders als bei Firestore hat Postgres Row Level Security keinen eingebauten "alter Wert vs. neuer Wert"-Vergleich in einer einzigen Prüfung. Das wurde hier mit einer **echt gegen lokales Postgres verifizierten** Self-Subquery-Technik gelöst (`app.old_player(uid)` u.ä.) — siehe Kommentar oben in `01-players-ship-progression.sql`. Wichtige Randbedingung, die dabei entdeckt wurde: die Subquery braucht selbst eine passende `SELECT`-Policy, sonst liefert sie still `NULL` und die Prüfung schlägt unbemerkt fehl (kein Fehler, einfach `0 Zeilen betroffen`).

Ein weiterer Unterschied zu Firestore, der die Übersetzung stellenweise sogar **vereinfacht**: Firestores `set(...,{merge:true})` macht das GESAMTE Dokument nach dem Merge zu `newData`, weshalb die Firestore-Regeln überall `!('feld' in newData) || ...`-Ausnahmen brauchen. Ein Postgres-`UPDATE` mit einer `SET`-Klausel, die eine Spalte nicht erwähnt, behält automatisch deren alten Wert — der "Feld unverändert"-Fall ergibt sich von selbst.

## Was migriert ist (Phase 1)

`players`, `ship_repair`, `player_progression` — vollständige 1:1-Übersetzung jeder Prüfung aus `firestore.rules`: `validShipTools()`, `validDailyQuestsWrite()`/-Detail()/dailyQuestDayIsUnlocked()/toolForQuestDay()/thresholdForQuestDay(), `validCodeRedemption()`-Detail (inkl. aller 6 aktuellen Dublonen-Codes, muss mit `scripts/codes/codes-data.js` synchron bleiben), `validWheelFields()` (20h-Cooldown, 3-Tage-Avatar), `validSpielothekCooldown()` (4s), `validQuestCounters()`, `validProgressionWrite()`, sowie der komplette Fall-A/Fall-B-Zustandsautomat für Reparatur-Etappen in `ship_repair`.

## Voraussetzung im Supabase-Dashboard (musst du selbst prüfen)

**Authentication → Third-Party Auth → Firebase muss aktiviert sein**, damit `auth.jwt() ->> 'sub'` die echte, kryptographisch geprüfte Firebase-UID liefert. Ebenso muss geprüft werden, ob `auth.jwt() ->> 'email'` bei OAuth-Logins (Twitch/Discord verlinkt mit Google/E-Mail) tatsächlich die E-Mail-Claim des Firebase-ID-Tokens durchreicht (für `app.is_admin()`). Beides kann ich von hier aus nicht verifizieren.

## Tests

`02-players-ship-progression.test.sql` — 25 Testfälle, **echt gegen eine lokale PostgreSQL-16-Instanz mit einem Supabase-Auth-Stub ausgeführt** (nicht nur behauptet): alle Manipulationsversuche aus dem ursprünglichen Auftrag (currency, gamesPlayed, gamesWon, shipTools, dailyQuests, redeemedCurrencyCodes, lastSpielothekPlayAt, lastWheelSpinAt, tempAvatarExpiresAt, progression, ship_repair, fremde UID, SQL-Injection), alle 25/25 bestanden.

Lokal wiederholen:
```
createdb test_db
psql -d test_db -f 00-supabase-auth-stub.sql
psql -d test_db -f 01-players-ship-progression.sql
psql -d test_db -c "grant usage on schema app to anon, authenticated, service_role;
  grant select, insert, update, delete on public.players, public.ship_repair, public.player_progression to anon, authenticated;
  grant all on public.players, public.ship_repair, public.player_progression to service_role;"
psql -d test_db -f 02-players-ship-progression.test.sql
```

## Nächste Schritte (noch nicht umgesetzt)

- Phase 2: `raceProgress`, `community_boss`, `community_boss_damage`
- Phase 3: `site_config`, `site_meta`, `giveawayEntries`, `giveawayWinners`, `supportReports`, `site_ratings`
- Phase 4: Client-Umstellung (~15 Dateien von `wheelDb` auf `supabaseClient`)
- Phase 5: Umschaltpunkt — erst nach vollständiger Prüfung
