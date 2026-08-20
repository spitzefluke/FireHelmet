# FireHelmet Supabase-Proxy-Worker

Dieser Ordner ist **Referenzcode** fuer ein eigenstaendiges Cloudflare-Workers-Projekt. Er ist **nicht** Teil der statischen GitHub-Pages-Seite und wird **nicht automatisch deployt** – genau wie `firestore.rules` musst du ihn manuell einrichten. Das entspricht dem bereits bestehenden Discord-Notify-Worker (`scripts/core/discord-notify-data.js`), der nach demselben Muster funktioniert.

## Warum ein Worker und kein direkter Client-Insert?

Die Website hat entschieden: Spielothek-Runden und Community-Boss-Angriffe werden **gehärtet** nach Supabase geloggt. Das heißt konkret:

- Der Browser schreibt **niemals** direkt in `spielothek_rounds` oder `community_boss_attacks` (dafür gibt es in `supabase/schema.sql` bewusst **keine** INSERT-Policy für `anon`/`authenticated`).
- Nur dieser Worker darf schreiben – mit dem `service_role`-Key, der **ausschließlich** hier als Cloudflare-Secret liegt, nie im Browser.
- Bevor der Worker irgendetwas schreibt, verifiziert er das mitgeschickte Firebase-ID-Token **kryptographisch** gegen Googles öffentliche Schlüssel (`verify-firebase-token.js`) – ganz ohne Firebase Admin SDK. Die `firebase_uid` kommt **ausschließlich** aus dem geprüften Token, nie aus dem vom Client gesendeten JSON.

Das schließt Statistik-Fälschung durch einen manipulierten Client strukturell aus, nicht nur durch eine Prüfung, die man theoretisch umgehen könnte.

## Setup

1. **Supabase-Projekt anlegen** (falls noch nicht geschehen), dann `supabase/schema.sql` im SQL-Editor ausführen.
2. **Cloudflare-Workers-Projekt anlegen** (z.B. `wrangler init`), diese 4 Dateien hineinkopieren: `index.js`, `verify-firebase-token.js`, `supabase-rest.js`, `rate-limit.js`.
3. `wrangler.toml.example` nach `wrangler.toml` kopieren, `ALLOWED_ORIGIN` auf deine echte Domain setzen.
4. Secrets setzen (niemals in eine Datei schreiben):
   ```
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
5. Optional: KV-Namespace für Rate Limiting anlegen (siehe Kommentare in `wrangler.toml.example`).
6. Deployen: `wrangler deploy`.
7. Die resultierende Worker-URL (z.B. `https://firehelmet-supabase-proxy.DEINNAME.workers.dev`) trägst du in `scripts/supabase/supabase-proxy-data.js` ein (siehe dortiger Platzhalter-Kommentar) und setzt `enabled: true`.

## Endpunkte

- `POST /spielothek-log` – Body `{ gameId, betAmount, payoutAmount, won }`, Header `Authorization: Bearer <firebase-id-token>`.
- `POST /boss-attack-log` – Body `{ nickname, monthId, damage }`, gleicher Header.

Beide validieren serverseitig dieselben Obergrenzen, die auch in `firestore.rules` gelten (`payoutAmount <= 3000`, `damage <= 45`) – zusätzlich zur Datenbank-CHECK-Constraint (Verteidigung in der Tiefe).

## Ranglisten-Snapshots

Werden **nicht** vom Worker selbst erzeugt (der hat keine Firebase-Admin-Zugangsdaten für einen vollständigen `players`-Read über alle Nutzer). Stattdessen: `supabase/scripts/generate-leaderboard-snapshot.mjs`, ein separates Node-Skript, das du selbst mit deinem Firebase-Service-Account-Schlüssel ausführst (lokal oder z.B. per GitHub-Actions-Cron mit encrypted Secrets – das ist eine spätere, bewusste Entscheidung, siehe Abschlussbericht).

## Testen

- `verify-firebase-token.js` ist mit echten Kryptografie-Tests gegen ein lokal erzeugtes Test-Token geprüft (`supabase/worker/verify-firebase-token.test.mjs` im Scratchpad dieser Session – bei Bedarf erneut ausführbar: `node verify-token.test.mjs`, benötigt kein Netzwerk).
- Für einen echten End-to-End-Test brauchst du ein echtes Supabase-Projekt und einen laufenden Worker – das kann ich aus dieser Sandbox heraus nicht ausführen (kein Netzwerkzugriff auf supabase.com/cloudflare.com, keine Zugangsdaten).
