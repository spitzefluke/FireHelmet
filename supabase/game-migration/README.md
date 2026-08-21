# Firestore → Supabase Migration (Spieler-Datenbank)

**Status: Phase 4 von 5 (Client-Umstellung läuft, Datei für Datei) — noch NICHT live, Firestore läuft unverändert weiter.**

Voraussetzung erfüllt: Third-Party Auth (Firebase) ist im Supabase-Dashboard aktiviert.

Dieser Ordner ersetzt schrittweise die komplette `firestore.rules`-Logik durch Supabase/Postgres. Firebase Authentication bleibt dabei die einzige Anmeldung (anonym + Twitch/Discord) — nur die Datenbank wandert. Es wird **keine** bestehende Firestore-Daten migriert (bewusste Entscheidung: alle Spieler starten nach dem Umstieg bei 0).

## Warum das überhaupt geht (technische Grundlage)

Anders als bei Firestore hat Postgres Row Level Security keinen eingebauten "alter Wert vs. neuer Wert"-Vergleich in einer einzigen Prüfung. Das wurde hier mit einer **echt gegen lokales Postgres verifizierten** Self-Subquery-Technik gelöst (`app.old_player(uid)` u.ä.) — siehe Kommentar oben in `01-players-ship-progression.sql`. Wichtige Randbedingung, die dabei entdeckt wurde: die Subquery braucht selbst eine passende `SELECT`-Policy, sonst liefert sie still `NULL` und die Prüfung schlägt unbemerkt fehl (kein Fehler, einfach `0 Zeilen betroffen`).

Ein weiterer Unterschied zu Firestore, der die Übersetzung stellenweise sogar **vereinfacht**: Firestores `set(...,{merge:true})` macht das GESAMTE Dokument nach dem Merge zu `newData`, weshalb die Firestore-Regeln überall `!('feld' in newData) || ...`-Ausnahmen brauchen. Ein Postgres-`UPDATE` mit einer `SET`-Klausel, die eine Spalte nicht erwähnt, behält automatisch deren alten Wert — der "Feld unverändert"-Fall ergibt sich von selbst.

## Was migriert ist

**Phase 1**: `players`, `ship_repair`, `player_progression` — vollständige 1:1-Übersetzung jeder Prüfung aus `firestore.rules`: `validShipTools()`, `validDailyQuestsWrite()`/-Detail()/dailyQuestDayIsUnlocked()/toolForQuestDay()/thresholdForQuestDay(), `validCodeRedemption()`-Detail (inkl. aller 6 aktuellen Dublonen-Codes, muss mit `scripts/codes/codes-data.js` synchron bleiben), `validWheelFields()` (20h-Cooldown, 3-Tage-Avatar), `validSpielothekCooldown()` (4s), `validQuestCounters()`, `validProgressionWrite()`, sowie der komplette Fall-A/Fall-B-Zustandsautomat für Reparatur-Etappen in `ship_repair`.

**Phase 2**: `race_progress`, `community_boss`, `community_boss_damage` — jeweils Delta-Obergrenze pro Schreibvorgang (Rennfortschritt +15, Boss-Schaden pro Angriff max. 45), öffentlich lesbar, Schreibrechte nur auf das eigene Dokument (bzw. bei `community_boss` als geteiltes Monats-Dokument ohne Eigentümer-Konzept, exakt wie in Firestore). Firestores "Dokument-ID = week_uid"-Trick wird hier durch einen echten zusammengesetzten Primary Key `(week, firebase_uid)` ersetzt — einfacher, kein String-Vergleich nötig.

**Phase 3**: `site_config`, `site_meta`, `giveaway_entries`, `giveaway_winners`, `support_reports`, `site_ratings`. Bemerkenswert: `site_config` validiert in Firestore bewusst KEIN einzelnes Feld (nur `isAdmin()`) — Entsprechung ist ein JSONB-Blob statt erfundener Spalten. `support_reports` hat bewusst KEINE Lese-Policy für `anon`/`authenticated` (Firestore: `allow read: if false`) — nur `service_role` (Supabase-eigener Table-Editor/Dashboard-Login) kann sie einsehen, genau wie bisher nur die Firebase Console.

## Voraussetzung im Supabase-Dashboard (musst du selbst prüfen)

**Authentication → Third-Party Auth → Firebase muss aktiviert sein**, damit `auth.jwt() ->> 'sub'` die echte, kryptographisch geprüfte Firebase-UID liefert. Ebenso muss geprüft werden, ob `auth.jwt() ->> 'email'` bei OAuth-Logins (Twitch/Discord verlinkt mit Google/E-Mail) tatsächlich die E-Mail-Claim des Firebase-ID-Tokens durchreicht (für `app.is_admin()`). Beides kann ich von hier aus nicht verifizieren.

## Tests

- `02-players-ship-progression.test.sql` — 27 Testfälle (Phase 1), **echt gegen eine lokale PostgreSQL-16-Instanz mit einem Supabase-Auth-Stub ausgeführt**: alle Manipulationsversuche aus dem ursprünglichen Auftrag (currency, gamesPlayed, gamesWon, shipTools, dailyQuests, redeemedCurrencyCodes, lastSpielothekPlayAt, lastWheelSpinAt, tempAvatarExpiresAt, progression, ship_repair, fremde UID, SQL-Injection), 27/27 bestanden. **Update (Phase 4e):** `valid_daily_quests_write()` Fall A verlangte ursprünglich `new_started_at = now()` exakt — funktioniert nur bei direktem SQL (wie in diesen Tests), nicht über einen echten Supabase-Client (PostgREST kann keine rohe `now()`-Funktion im Request-Body senden, nur einen fertigen Zeitwert). Auf ein 2-Minuten-Toleranzfenster umgestellt (TEST16a/16b decken das jetzt ab) — **muss auf dem echten Supabase-Projekt manuell nachgezogen werden**, siehe Hinweis unten.
- `04-race-boss.test.sql` — 12 Testfälle (Phase 2): Rennfortschritt-Sprung, Boss-HP-Manipulation, Schaden-Rangliste-Manipulation, fremde UID, Neuanlage über Obergrenze — 12/12 bestanden.
- `06-site-data.test.sql` — 20 Testfälle (Phase 3): Site-Config-Schreiben durch normalen Benutzer vs. Admin, Support-Report-Lesen (niemand darf, auch nicht der Absender), Gewinnspiel-Teilnahme/-Ziehung-Manipulation, Bewertungs-Grenzen, SQL-Injection — 20/20 bestanden.

Lokal wiederholen (alle 3 Phasen):
```
createdb test_db
psql -d test_db -f 00-supabase-auth-stub.sql
psql -d test_db -f 01-players-ship-progression.sql
psql -d test_db -f 03-race-boss.sql
psql -d test_db -f 05-site-data.sql
psql -d test_db -c "grant usage on schema app to anon, authenticated, service_role;
  grant select, insert, update, delete on public.players, public.ship_repair, public.player_progression, public.race_progress, public.community_boss, public.community_boss_damage, public.site_config, public.site_meta, public.giveaway_entries, public.giveaway_winners, public.support_reports, public.site_ratings to anon, authenticated;
  grant all on public.players, public.ship_repair, public.player_progression, public.race_progress, public.community_boss, public.community_boss_damage, public.site_config, public.site_meta, public.giveaway_entries, public.giveaway_winners, public.support_reports, public.site_ratings to service_role;"
psql -d test_db -f 02-players-ship-progression.test.sql
psql -d test_db -f 04-race-boss.test.sql
psql -d test_db -f 06-site-data.test.sql
```

## Phase 4: Client-Umstellung (läuft, Datei für Datei)

Direkt in den bestehenden Dateien umgestellt (keine Parallelkopien) — jede Datei einzeln per Playwright-Kontrollfluss-Test (Mock aus `firebase-mock.js` + `supabase-mock.js`) geprüft, bevor die nächste drankommt. Firestore bleibt bis zum Umschaltpunkt (Phase 5) vollständig unverändert nutzbar, betroffen ist ausschließlich der Lese-/Schreibpfad im Client.

- **4a** (erledigt): `scripts/supabase/supabase-client.js` — Third-Party-Auth-Client mit `accessToken`-Callback (echtes Firebase-ID-Token bei jeder Anfrage).
- **4b** (erledigt): `scripts/spielothek/spielothek.js` — Spielrunde, Cooldown, Dublonenanzeige.
- **4c** (erledigt): `scripts/shop/shop.js` — Kauf, Dublonenanzeige, Abgleich freigeschalteter Artikel.
- **4d** (erledigt): `scripts/wheel/wheel.js` — größte Einzeldatei: `savePlayerData()` (zentral, wird von `saveNickname()`, `shop.js equipFrame()` und `twitch-auth.js` genutzt), `addCurrency()` (Rennplatzierung, Boss-Top-Angreifer), Schatzrad-Drehung (`redeemWheelPrize()`, 20h-Cooldown + alle 4 Preistypen), Code-Tracking (`recordCodeCrack()`, `syncCodesToFirestore()`-Nachholsynchronisierung), sichere Währungscode-Einlösung (`redeemCurrencyCode()`), zeitlich befristeter Avatar-Abgleich (`syncTempAvatarFromServer()`) und die globale Rangliste (`loadLeaderboard()`). Dabei zusätzlich die in 4c bewusst offen gelassene `equippedFrame`-Kopplung in `shop.js` geschlossen (wird jetzt konsistent aus Supabase gelesen).

  Bemerkenswert: zwei rein informative, nirgends zurückgelesene Firestore-Felder (`lastSpin`, `lastPrize`) haben in der Postgres-Tabelle bewusst KEINE Spalte bekommen (in Phase 1 bereits final geprüft/getestet) — sie wurden beim Umstieg ersatzlos weggelassen, ohne Funktionsverlust.

- **4e** (erledigt): `scripts/ship/ship-repair.js` — persönlicher Schiffszustand (`ship_repair`-Tabelle: Reparatur starten/abschließen, Fall-A/Fall-B-Zustandsautomat), Werkzeug-Inventar (`players.ship_tools`), Tagesquests (`players.daily_quests_started_at`/`.daily_quests_claimed_days`, inkl. Metrik-Spaltenübersetzung fürs Anzeige-Objekt) sowie die Preview-Dev-Werkzeuge (`devGrantAllShipTools()`/`devFinishActiveRepair()`/`devResetShipEvent()` — zwei davon waren schon unter den alten `firestore.rules` faktisch wirkungslos, siehe Kommentare im Code, wurden aber bewusst 1:1 mit demselben Verhalten portiert statt die RLS dafür extra zu erweitern). `maybeUnlockChapterAfterShipRepair()` bleibt bewusst auf Firestore (site_config ist erst in Phase 4i dran).

  **Bugfund während 4e:** `app.valid_daily_quests_write()` verlangte für den Tagesquest-Erststart `new_started_at = now()` exakt — das funktioniert nur bei direktem SQL (wie in den Tests), ein echter Supabase-Client kann aber keine rohe `now()`-Funktion senden, nur einen fertigen Zeitwert, der nie exakt trifft. Dieser Fehler wäre erst beim echten Cutover aufgefallen (Tagesquests hätten nie starten können) und wurde in `01-players-ship-progression.sql` auf ein 2-Minuten-Toleranzfenster korrigiert — **muss manuell auf dem echten Supabase-Projekt nachgezogen werden, siehe unten.**

**Noch offen (Phase 4, weitere Dateien):** `progression.js`, `race.js`, `community-boss.js`, sowie die Phase-3-Tabellen betreffenden Dateien (`admin-gateway.js`, `site-config.js`, `giveaway.js`, `support.js`, `rating.js`, `level-path.js`, `piratenpass.js`, `stories.js`).

## ⚠️ Manueller Schritt erforderlich: Bugfix auf dem echten Supabase-Projekt nachziehen

Phase 1 wurde bereits von dir gegen das echte Supabase-Projekt getestet und läuft dort produktiv (Schema). Der oben beschriebene Bugfund in `valid_daily_quests_write()` betrifft eine bereits deployte Funktion. Bitte im Supabase-Dashboard → SQL Editor **einmalig** ausführen (rein additiv, kein Datenverlust, keine Downtime):

```sql
create or replace function app.valid_daily_quests_write(
  p_uid text,
  new_started_at timestamptz,
  new_claimed_days integer[],
  new_ship_tools jsonb
) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
  old_started_at timestamptz := old_row.daily_quests_started_at;
  old_claimed_days integer[] := coalesce(old_row.daily_quests_claimed_days, '{}');
  new_day int;
  needed_tool text;
  needed_threshold int;
  old_metric_value numeric;
  old_tool_count numeric;
  new_tool_count numeric;
begin
  if new_started_at is not distinct from old_started_at
     and coalesce(new_claimed_days,'{}') = old_claimed_days then
    return true;
  end if;

  if coalesce(array_length(new_claimed_days,1),0) > 20 then
    return false;
  end if;

  if old_started_at is null then
    return new_started_at between now() - interval '2 minutes' and now() + interval '2 minutes'
       and coalesce(array_length(new_claimed_days,1),0) = 0;
  end if;

  if new_started_at is distinct from old_started_at then
    return false;
  end if;

  if coalesce(array_length(new_claimed_days,1),0) <> coalesce(array_length(old_claimed_days,1),0) + 1 then
    return false;
  end if;

  new_day := coalesce(array_length(old_claimed_days,1),0) + 1;
  needed_tool := app.day_tool(new_day);
  needed_threshold := app.day_threshold(new_day);

  if now() < old_started_at + ((new_day - 1) * interval '1 day') then
    return false;
  end if;

  old_metric_value := app.day_metric_value(new_day, old_row);
  if old_metric_value < needed_threshold then
    return false;
  end if;

  old_tool_count := coalesce((old_row.ship_tools ->> needed_tool)::numeric, 0);
  new_tool_count := coalesce((new_ship_tools ->> needed_tool)::numeric, 0);
  if new_tool_count <> old_tool_count + 1 then
    return false;
  end if;

  return true;
end;
$$;
```

## Nächste Schritte (noch nicht umgesetzt)

- Phase 4 (Rest): restliche ~11 Dateien, siehe oben
- Phase 5: Umschaltpunkt — erst nach vollständiger Prüfung
