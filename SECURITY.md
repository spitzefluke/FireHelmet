# Sicherheit

## Lücke gefunden?

Bitte **nicht** als öffentliches Issue melden, sondern über GitHub unter
**Security → Report a vulnerability** (privat) an die Betreiber dieses Repositorys.

Alternativ: privaten Kontakt über den Support-Bereich der Live-Seite
(https://spitzefluke.github.io/FireHelmet/ → Support).

## Was die Seite schützt

- **Datenbank:** Supabase mit Row Level Security; Schreibzugriffe laufen über geprüfte
  RPCs (`security definer`). Die Spalte `firebase_uid` enthält aus historischen Gründen
  eine Supabase-UUID.
- **Anmeldung:** anonyme Sitzungen (optional mit Cloudflare Turnstile), optional Google
  für Admins. Kontosperren werden clientseitig angezeigt und serverseitig erzwungen.
- **Webseite:** statisches HTML/CSS/Vanilla-JS auf GitHub Pages, keine Server-Secrets im
  Client. In `scripts/supabase/supabase-config.js` stehen nur die öffentliche Project-URL
  und der Anon-Key.
- **Geheimnisse:** liegen ausschließlich in Supabase (Dashboard → Project Settings / Edge
  Function Secrets), nie im Code und nie in Issues.

## Wenn etwas passiert

1. Betroffene Secrets rotieren (Supabase-Keys, Turnstile, OAuth-Client-Secret).
2. Bei verdächtigen Konten: in Supabase unter Authentication → Users sperren oder abmelden.
3. Die Änderung in einer eigenen PR dokumentieren; öffentliche Issues nur für nicht-sensible Hinweise.

## Unterstützte Version

Es gibt nur den Stand auf `main` (GitHub Pages liefert bei jedem Merge live aus).
Sicherheitsfixes landen dort direkt.
