# Firestore → Supabase Migration (Spieler-Datenbank)

**Status: Phase 4 vollständig abgeschlossen (4a–4l, alle Client-Dateien umgestellt + Dokumentation bereinigt). Phase 5 (Umschaltpunkt) ist vorbereitet, aber noch NICHT ausgeführt — noch NICHT live, Firestore läuft unverändert weiter. Diese Branch liegt als PR zur Review bereit; der eigentliche Merge/Deploy nach `main` ist der Cutover selbst, siehe "Phase 5: Umschaltpunkt" unten.**

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

- **4f** (erledigt): `scripts/core/progression.js` — zentraler Reward-Dispatcher (`claimReward()`, schreibt je nach Belohnungstyp in `players` UND/ODER `player_progression`), XP-Vergabe für bestehende Aktionen (`awardActionXp()`), Spielerkarte (`refreshPlayerCard()`, kein Live-Abo mehr — siehe unten). `passProgress` (Firestore: verschachtelte Map) ist in Postgres von Anfang an als zwei flache Spalten (`pass_id`/`pass_xp`) angelegt — hier entsprechend übersetzt.

  **Wichtig — kein Firestore-Cross-Collection-Transaktion-Äquivalent:** `claimReward()` konnte in Firestore `players` UND `player_progression` atomar in EINER Transaktion schreiben; ein normaler Supabase-REST-Aufruf kann das nicht (zwei unabhängige Anfragen). Um das schlimmere Fehlerbild zu vermeiden, schreibt `claimReward()` jetzt IMMER zuerst `players` (Belohnungseffekt), erst danach `player_progression` (Markierung "eingelöst") — schlägt nur der zweite Schritt fehl, bleibt die Belohnung unmarkiert und ein späterer Versuch holt sie sicher nach (schlimmstenfalls einmal doppelt vergeben, nie dauerhaft verloren).

  **Live-Abo entfernt:** `refreshPlayerCard()` nutzte bisher Firestores `onSnapshot()` für automatische Aktualisierung. Ein direktes Supabase-Realtime-Äquivalent wird in dieser Migration bislang nirgends genutzt, deshalb jetzt ein einmaliger Direktabruf — alle Stellen, die die Spielerkarte tatsächlich verändern, rufen `refreshPlayerCard()` bereits selbst explizit erneut auf, ein Verlust an Aktualität entsteht dadurch nicht.

  **Split-Brain-Falle rechtzeitig gefunden:** `player_progression` wird nicht nur von `progression.js` gelesen — `scripts/core/level-path.js` (2 Stellen), `scripts/piratenpass/piratenpass.js` und `scripts/stories/stories.js` lesen direkt aus derselben Tabelle für ihre jeweilige Anzeige (Levelpfad-Modal, Piratenpass-Fortschritt, Expeditions-Meilensteine). Da `claimReward()`/`awardActionXp()` jetzt nach Supabase schreiben, mussten diese vier Lesestellen in DERSELBEN Änderung mit umgestellt werden — sonst hätten sie sofort veraltete/falsche Daten aus Firestore angezeigt, sobald eine Belohnung eingelöst wird.

- **4g** (erledigt): `scripts/race/race.js` — Wochenrennen-Fortschritt (`addRaceProgress()`, echtes Upsert über den zusammengesetzten Schlüssel `(week, firebase_uid)` statt Firestores `"<week>_<uid>"`-Dokument-ID-Trick), Live-Rangliste (`loadRaceLeaderboard()`) und Vorwochen-Sieger + Top-3-Dublonen (`loadLastWeekWinner()`/`grantWeeklyRaceCurrency()`, liest jetzt `firebase_uid` statt des Firestore-eigenen `uid`-Felds).

  **Fehlende Spalte gefunden:** Firestores `raceProgress`-Dokument speichert zusätzlich `equippedFrame` (Momentaufnahme für den Rahmen um den Namen in der Rangliste, siehe `race.js` Zeile ~511) — `firestore.rules` validiert dieses Feld bewusst nicht extra. Die Phase-2-Tabelle `race_progress` hatte dafür bislang **keine Spalte** (in Phase 1/2 übersehen, da kein Test das Feld anfasste). Ohne Korrektur wäre die Rahmen-Anzeige in der Rangliste beim echten Cutover einfach leer geblieben (kein Datenverlust, nur ein optisches Downgrade) — trotzdem in `03-race-boss.sql` nachgezogen (`equipped_frame text` + Längenprüfung, keine RLS-Sonderprüfung nötig, genau wie im Original). **Muss additiv auf dem echten, bereits laufenden Supabase-Projekt nachgezogen werden, siehe unten.**

- **4h** (erledigt): `scripts/community-boss/community-boss.js` — Boss-Zustand (`loadBossState()`, echtes Upsert legt den Monatsboss nur bei Bedarf frisch an), Angriff (`attackCommunityBoss()`), Schaden pro Spieler (`recordBossDamage()`), Rangliste (`renderBossLeaderboard()`), Top-3-Belohnung (`checkBossSlayerReward()`) und die Angreifer-Statistik (`updateBossStatsRow()`, nutzt Supabases `count: 'exact', head: true` statt Firestores `count()`-Aggregation).

  **Erste echte RPC-Funktion der Migration:** `community_boss` ist (anders als alle bisher migrierten Tabellen) eine GEMEINSAME Zeile, die potenziell viele verschiedene Spieler gleichzeitig treffen — der Normalfall bei einem "Community"-Boss, nicht ein seltener Randfall. Firestores `FieldValue.increment(-damage)` war ein echtes atomares Server-Increment; das übliche "erst lesen, dann zurückschreiben"-Muster dieser Migration hätte hier bei echter Gleichzeitigkeit regelmäßig Schaden verloren (Lost-Update-Problem). Deshalb neu: `app.attack_community_boss(month_id, damage)` in `03-race-boss.sql` — eine kleine PL/pgSQL-Funktion, die die relative Änderung in einem einzigen SQL-`UPDATE` ausführt (Postgres serialisiert konkurrierende UPDATEs auf dieselbe Zeile von selbst) und gleichzeitig den `defeated`-Übergang in demselben atomaren Schritt setzt. Läuft als SECURITY INVOKER (Standard) — dieselbe `community_boss_update`-RLS-Policy gilt unverändert, keine erweiterten Rechte. Lokal gegen PostgreSQL 16 verifiziert: zwei aufeinanderfolgende Angriffe ziehen korrekt kumulativ ab, ein überhöhter Schadenswert (>45) wird abgelehnt, und ein finaler Treffer setzt `hp=0`/`defeated=true` in einem einzigen Aufruf. **Muss additiv auf dem echten, bereits laufenden Supabase-Projekt nachgezogen werden, siehe unten.**

- **4i** (erledigt): `scripts/core/site-config.js` + `scripts/core/admin-gateway.js` — Site-Config-Lesen (`initSiteConfig()`) und alle Admin-Schreibvorgänge (Countdown-Termine, Kapitel-Sperren, Spielothek-Deaktivierung, Schiffsreparatur-Freischalt-Kapitel) über eine neue gemeinsame Funktion `patchSupabaseSiteConfig()` (in `site-config.js`, auch von `ship-repair.js` genutzt). `site_config` liegt in Postgres als EIN JSONB-Blob (Spalte `data`) statt einzelner Top-Level-Felder wie zuvor in Firestore — jede Admin-Änderung liest den Blob deshalb erst, führt den betroffenen Schlüssel zusammen und schreibt ihn komplett zurück (Firestores `set(...,{merge:true})` erledigte das serverseitig automatisch). Schließt außerdem die in Phase 4e bewusst offen gelassene `maybeUnlockChapterAfterShipRepair()`-Kopplung in `ship-repair.js` (liest/schreibt jetzt konsistent über Supabase statt Firestore).

  **Live-Abo entfernt (bekannter, akzeptierter Unterschied):** Firestores `onSnapshot()` hielt bereits offene Tabs ANDERER Besucher live auf dem neuesten Stand, sobald der Admin etwas änderte. Kein Supabase-Realtime-Äquivalent wird in dieser Migration bislang genutzt (dieselbe Entscheidung wie bei `refreshPlayerCard()` in Phase 4f) — Admin-Änderungen wirken jetzt erst beim nächsten Laden/Neuladen einer Seite bei anderen Besuchern. Das Admin-Gateway selbst bleibt live: `patchSupabaseSiteConfig()` aktualisiert `siteConfig` lokal sofort und feuert weiterhin das bestehende `siteConfigUpdated`-Event, wodurch sich sowohl das Admin-Panel als auch die integrierte Live-Vorschau (`<iframe src="index.html">`) beim Speichern unverändert sofort selbst aktualisieren.

  **Dead Code entdeckt:** `scripts/giveaway/giveaway.js` ist in `index.html` **nirgends eingebunden** (kein `<script>`-Tag, keine Seite, kein Menüpunkt) — komplett unverdrahtete/inaktive Funktionalität. Wird trotzdem als eigener Schritt migriert (die Phase-3-Tabelle existiert bereits), aber ohne Playwright-Testabdeckung, da keine echte Seite existiert, über die sie sich auslösen ließe.

- **4j** (erledigt, damit ist Phase 4 vollständig): `scripts/support/support.js`, `scripts/rating/rating.js`, `scripts/giveaway/giveaway.js` (unverdrahtet, siehe oben) — Fehlermeldungen (`submitSupportReport()`), Sternebewertungen (`submitRating()`/`loadRatingAverage()`) und Gewinnspiel-Teilnahme/-Ziehung laufen jetzt über `supabaseClient` statt `wheelDb`/Firestore. `giveawayWinners.create()` (Firestores atomares "nur anlegen, wenn noch nicht vorhanden") wird durch ein reines `.insert()` ersetzt — der Primary Key `round_id` liefert dieselbe Garantie strukturell (Unique-Verletzung bei einem zweiten Zug), kein Sonderfall nötig.

  **Zwei fehlende Spalten gefunden (derselbe Fehlerklasse wie `race_progress.equipped_frame` in Phase 4g):** Firestores `supportReports`-Dokument speicherte zusätzlich `uid`/`nickname`/`page` (fürs Betreiber-Triage, `firestore.rules` validierte nur `message`), `site_ratings` zusätzlich `uid` — beide Tabellen hatten dafür in `05-site-data.sql` bislang keine Spalten. Nachgezogen (`firebase_uid`/`nickname`/`page` bzw. `firebase_uid`, alle mit defensiven Längenprüfungen, keine RLS-Sonderprüfung nötig, genau wie im Original). Lokal gegen PostgreSQL 16 verifiziert: bestehende 20 Phase-3-Tests weiterhin 20/20 grün, neue Spalten akzeptieren Schreibvorgänge, `support_reports` bleibt für niemanden lesbar (auch nicht den Absender selbst) — genau wie zuvor. **Muss additiv auf dem echten, bereits laufenden Supabase-Projekt nachgezogen werden, siehe unten.**

Getestet (4j): Playwright-Kontrollflusstest deckt Support-Meldung inkl. Schimpfwort-Filter-Ablehnung und Bewertung inkl. Durchschnittsanzeige und lokaler Doppel-Sperre ab - 7/7 Prüfpunkte grün. Volle 17-Seiten-Regression: nur die erwarteten sandbox-bedingten Netzwerkfehler, keine echten JS-Fehler.

- **4k** (erledigt, gefunden durch eine abschließende Vollsweep NACH dem 4j-Commit): `scripts/core/discord-notify.js` — dieselbe Datei war beim ursprünglichen Datei-für-Datei-Durchgang durchgerutscht, weil sie ihre Firestore-Collection nicht als Literal, sondern über eine Variable referenzierte (`wheelDb.collection(DISCORD_NOTIFY_DOC_PATH[0])`) und dadurch bei den bisherigen wortwörtlichen Greps nicht auffiel. `trySendDiscordUpdateNotice()` (Dedupe-Wächter fürs automatische Discord-Update-Posting) liest/schreibt jetzt `site_meta`/`id="update_notice"` über `supabaseClient` statt `wheelDb`. **Keine Schema-Änderung nötig** — die bereits deployte `site_meta`-Tabelle (`id text primary key, last_sent_hash text, sent_at timestamptz`) deckt das unverändert ab. Nicht mehr benötigte `DISCORD_NOTIFY_DOC_PATH`-Konstante entfernt (per Grep bestätigt: sonst nirgends referenziert).

  Getestet (4k): eigener Playwright-Kontrollflusstest — Discord-Benachrichtigung legt `site_meta`-Zeile mit Hash an, erneuter Aufruf mit identischem Text sendet nicht doppelt (Hash bleibt gleich). Volle 17-Seiten-Regression erneut grün.

**Phase 4 ist damit für alle ~19 client-seitigen Dateien abgeschlossen** (4a–4k). Übrig bleibt ausschließlich Phase 5 (der eigentliche Umschaltpunkt).

## ✅ Vier Nachbesserungen auf dem echten Supabase-Projekt — erledigt

Phase 1, 2 und 3 wurden bereits gegen das echte Supabase-Projekt getestet (57 Testfälle) und laufen dort produktiv (Schema). Die vier unten beschriebenen Funde betrafen bereits deployte Struktur und sind laut Rückmeldung **alle vier bereits im Supabase-Dashboard → SQL Editor ausgeführt** (jeweils rein additiv, kein Datenverlust, keine Downtime). Die SQL-Snippets bleiben hier stehen, damit sie beim Aufsetzen eines neuen/zweiten Supabase-Projekts (z.B. Staging) jederzeit reproduzierbar sind.

**1) `support_reports`/`site_ratings`-Spalten nachziehen (Phase 4j, neu):**

```sql
alter table public.support_reports
  add column if not exists firebase_uid text,
  add column if not exists nickname text,
  add column if not exists page text,
  add constraint support_reports_nickname_len check (nickname is null or char_length(nickname) <= 30),
  add constraint support_reports_page_len check (page is null or char_length(page) <= 500);

alter table public.site_ratings
  add column if not exists firebase_uid text;
```

**2) `app.attack_community_boss()`-Funktion anlegen (Phase 4h):**

```sql
create or replace function app.attack_community_boss(p_month_id text, p_damage integer)
returns table(hp integer, max_hp integer, defeated boolean)
language plpgsql
as $$
begin
  if p_damage is null or p_damage < 0 or p_damage > 45 then
    raise exception 'invalid-damage';
  end if;

  return query
  update public.community_boss
  set hp = greatest(0, community_boss.hp - p_damage),
      defeated = community_boss.defeated or (community_boss.hp - p_damage <= 0)
  where month_id = p_month_id
  returning community_boss.hp, community_boss.max_hp, community_boss.defeated;
end;
$$;

grant execute on function app.attack_community_boss(text, integer) to authenticated;
```

**3) `race_progress.equipped_frame`-Spalte nachziehen (Phase 4g):**

```sql
alter table public.race_progress
  add column if not exists equipped_frame text,
  add constraint race_progress_frame_len check (equipped_frame is null or char_length(equipped_frame) <= 50);
```

**4) `valid_daily_quests_write()`-Toleranzfenster nachziehen (Phase 4e):**

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

## Phase 5: Umschaltpunkt (Cutover)

**Wichtig zu verstehen:** Phase 4 hat den Lese-/Schreibpfad direkt in den bestehenden Dateien ersetzt (keine Parallelkopien, kein Feature-Flag). Das bedeutet: **der eigentliche Umschaltpunkt ist der Merge/Deploy dieser Branch nach `main`** — es gibt keinen separaten Code-Schritt danach, der noch "umschaltet". Sobald diese Branch live ist, sprechen alle ~19 migrierten Dateien mit Supabase statt Firestore, für JEDEN Besucher gleichzeitig (kein schrittweises Rollout einzelner Nutzer möglich, da es sich um eine statische Website ohne serverseitiges Feature-Flagging handelt).

**Vorher (Checkliste):**
- [x] Third-Party Auth (Firebase) im Supabase-Dashboard aktiviert
- [x] Alle vier manuellen SQL-Nachbesserungen oben ausgeführt
- [x] `scripts/supabase/supabase-config.js` zeigt bereits auf das echte, produktive Supabase-Projekt (kein Platzhalter mehr)
- [x] Phase 4 vollständig (4a–4l), volle 17-Seiten-Playwright-Regression zuletzt grün (nur die erwarteten sandbox-bedingten Netzwerkfehler)
- [ ] **Noch offen, nur von dir prüfbar:** ein echter End-to-End-Test gegen das ECHTE Supabase-Projekt (nicht nur gegen den lokalen Postgres-Test und die Playwright-Mocks) — z.B. einmal anonym einloggen, eine Spielothek-Runde spielen, Schatzrad drehen, und im Supabase-Dashboard → Table Editor prüfen, ob `players` wie erwartet befüllt wird. Ich habe dafür keine Zugangsdaten und wollte ohne Rücksprache keine echten Zeilen in eurer Produktivdatenbank anlegen.

**Was NICHT nötig ist:**
- Keine Datenmigration (bewusste "bei Null"-Entscheidung von Anfang an)
- Keine Änderung an `firestore.rules` — Firestore bleibt einfach ungenutzt stehen, nichts schreibt mehr dorthin (siehe unten)
- Keine Änderung an Firebase Authentication — bleibt exakt wie bisher

**Bekannter, akzeptierter Nebeneffekt — `wheelDb`/Firestore-SDK bleibt als toter Code:** `scripts/auth/firebase-config.js` initialisiert weiterhin `wheelDb = firebase.firestore()`, aber nichts im gesamten `scripts/`-Baum liest oder schreibt mehr darüber (per Sweep bestätigt: `grep -rn "wheelDb\.|firebase\.firestore(|\.collection(|\.doc(" scripts/` findet nach dieser Zeile nichts mehr). Bewusst NICHT entfernt — das Firestore-SDK bleibt geladen und `firestore.rules` bleibt deployt, als reine Rollback-Absicherung (siehe unten). Eine spätere Aufräum-Runde (SDK-Script-Tag + `wheelDb`-Init + `firestore.rules` entfernen) ist ein eigener, risikoarmer Schritt, der zeitlich unabhängig vom eigentlichen Cutover ist.

**Rollback-Plan, falls nach dem Deploy etwas nicht stimmt:**
Da Phase 4 direkt in den bestehenden Dateien umgestellt hat (kein Feature-Flag), ist der Rollback ein reiner Git-Revert, kein Datenbank-Vorgang:
1. Den Merge-Commit auf `main` per `git revert` rückgängig machen und erneut deployen — die Seite spricht danach wieder mit Firestore, exakt wie vor dem Cutover.
2. Firestore wurde die ganze Zeit nicht angerührt (Parallelbetrieb-Entscheidung), enthält also weiterhin den letzten Stand vor dem Cutover-Fenster — keine Datenlücke für den Rollback-Fall.
3. Einzige Einschränkung: Spielstände, die WÄHREND des Live-Fensters mit Supabase-Code entstanden sind (neue Spieler, neue Fortschritte), gehen beim Rollback verloren, weil sie nie in Firestore landeten — das ist dieselbe "bei Null"-Prämisse wie beim Cutover selbst, nur rückwärts. Für einen kurzen Beobachtungszeitraum (Stunden, nicht Tage) nach dem Deploy ist das ein vertretbares Risiko.

**Nach erfolgreichem Cutover (späterer, unabhängiger Aufräum-Schritt, nicht Teil dieser PR):**
- `firestore.rules` kann inhaltlich vereinfacht werden (nur noch, falls überhaupt, für ganz andere/zukünftige Firestore-Nutzung)
- Firestore-SDK-Script-Tag + `wheelDb`-Init in `firebase-config.js` können entfernt werden
- Die vier SQL-Snippets oben sind dann nur noch Referenz für neue Supabase-Projekte (Staging etc.)
