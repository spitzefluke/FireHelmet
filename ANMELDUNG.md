# Anmeldung einrichten

Der Login wurde von Grund auf umgebaut. Vorher holten Twitch und Discord
nur Name und Bild in den Browser — der Server sah davon nichts, und **jeder
konnte sich per Konsole jeden Namen geben**, auch deinen. Jetzt führt
Supabase die Anmeldung selbst und stellt ein signiertes Token aus.

Damit das läuft, musst du vier Dinge im Dashboard eintragen. Ohne sie
zeigen die Knöpfe eine Fehlermeldung, die restliche Seite läuft normal
weiter.

---

## Erst: die Migration einspielen

Im Supabase-SQL-Editor, in dieser Reihenfolge:

```
supabase/game-migration/16-anmeldung.sql
```

Danach zur Kontrolle `16-anmeldung.test.sql` — fünf Zeilen, alle sollten
`PASS` sagen. Der wichtigste ist **N3**: er prüft, dass sich niemand
selbst als verifiziert eintragen kann. Ginge das, wären N1 und N2 wertlos
— man würde sich erst verifizieren und dann den fremden Namen nehmen.

---

## Dann: den Schalter, ohne den nichts geht

**Authentication → Sign In / Providers**, ganz nach unten scrollen, unter
den Anbietern:

- **Allow manual linking** → **einschalten**
- **Allow anonymous sign-ins** → bleibt an (ist es schon, sonst käme
  niemand auf die Seite)

Ohne den ersten Schalter antwortet Supabase auf jeden Anmeldeversuch mit
*„Manual linking is disabled for this project“*. Der Grund: die Seite
benutzt `linkIdentity()`, um die Twitch-Identität an das **bestehende**
anonyme Konto zu hängen — genau das ist „manual linking“. Ohne den
Schalter bliebe nur `signInWithOAuth()`, und das legt ein neues Konto mit
neuer UID an: der Fortschritt wäre aus Sicht des Spielers weg.

---

## Dann: die vier Anbieter

Alle unter **Authentication → Sign In / Providers**.

### Twitch

Du hast die App schon: https://dev.twitch.tv/console/apps → deine App →
*Manage*.

1. Bei **OAuth Redirect URLs** eintragen:
   `https://kxlntqjevvdiiefzkoiu.supabase.co/auth/v1/callback`
2. *New Secret* klicken, Client-ID und Secret kopieren
3. In Supabase bei **Twitch** einschalten und beides eintragen

Die Redirect-URL zeigt jetzt auf **Supabase**, nicht mehr auf deine Seite.
Das ist der ganze Unterschied zum alten Weg: Supabase nimmt die Antwort
von Twitch entgegen, prüft die Signatur und stellt dann erst ein Token für
deine Seite aus.

### Discord

https://discord.com/developers/applications → deine App → *OAuth2*

1. Bei **Redirects** dieselbe Supabase-Adresse eintragen
2. Client-ID und Secret kopieren
3. In Supabase bei **Discord** einschalten und eintragen

### Google

https://console.cloud.google.com → *APIs & Services* → *Credentials*

1. *Create Credentials* → *OAuth client ID* → Web application
2. Bei **Authorized redirect URIs** dieselbe Supabase-Adresse
3. Client-ID und Secret in Supabase bei **Google** eintragen

Beim ersten Mal verlangt Google einen *OAuth consent screen*. Für eine
private Seite reicht *External* mit Testnutzern — willst du, dass sich
jeder anmelden kann, musst du die App veröffentlichen. Google prüft das
nur bei sensiblen Berechtigungen; für Name und E-Mail geht es meist ohne
Prüfung durch.

### E-Mail und Passwort

Ist bei Supabase schon aktiv. Hier sind **zwei Schalter wichtig**, sonst
kann sich niemand über die Registrieren-Karte anmelden.

**1. Confirm email AUSSCHALTEN**

*Authentication → Sign In / Providers → Email → **Confirm email** aus.*

Warum: Wer sich ohne E-Mail registriert, bekommt intern eine erfundene
Adresse (`name@spieler.firehelmet.de`, siehe unten). Dorthin kann keine
Bestätigungsmail gehen. Bleibt der Schalter an, wird das Konto zwar
angelegt, aber nie bestätigt — und damit ist die Anmeldung tot. Die Seite
sagt dann ehrlich „muss noch bestätigt werden", statt so zu tun, als sei
alles in Ordnung.

**2. Redirect URLs**

*Authentication → URL Configuration → **Redirect URLs*** muss deine
Seitenadresse enthalten, sonst führt der Link aus der Mail ins Leere.
Sobald `firehelmet.de` steht, muss die neue Adresse dort ergänzt werden —
die vollständige Liste steht in `DOMAIN.md`, Abschnitt 7.

**3. Eigenes SMTP — nötig für „Passwort vergessen"**

Der eingebaute Mailversand von Supabase stellt **nur an Mitglieder deiner
Organisation** zu (*Organization Settings → Team*). Jede andere Adresse
bekommt den Fehler *„Email address not authorized."* — es kommt also
nichts an. Solange kein eigener Versand eingerichtet ist, funktioniert
„Passwort vergessen" nicht, und die Seite sagt das auch so.

Einrichten unter *Authentication → Emails → **SMTP Settings***
(direkt: `https://supabase.com/dashboard/project/_/auth/smtp`).

### Du brauchst dafür eine eigene Domain — aber KEINEN Umzug

Häufiges Missverständnis: die Seite liegt auf
`spitzefluke.github.io/FireHelmet/`, und GitHub Pages kann keine Mails
verschicken und gibt dir auch keine Absenderadresse. Absender und
Hosting sind zwei getrennte Dinge.

Ein Versanddienst muss beweisen dürfen, dass er in deinem Namen
schicken darf. Dafür setzt er DNS-Einträge in einer Domain, die dir
gehört. Ohne Domain geht das nicht — mit einer @gmail.com-Adresse als
Absender landet die Mail bei den meisten Empfängern im Spam, weil
Google für gmail.com festlegt, wer in seinem Namen senden darf, und ein
fremder Dienst da nicht dazugehört.

**Das Gute:** du musst die Seite dafür nicht umziehen. Es reicht, die
Domain zu *besitzen* und dort die drei Mail-Einträge zu setzen. Die
Seite bleibt auf der GitHub-Adresse, `CNAME.wartet` bleibt inaktiv, an
`DOMAIN.md` ändert sich nichts. Eine `.de` kostet bei INWX oder Netcup
etwa 5–8 € im Jahr (siehe `DOMAIN.md`, Abschnitt 1).

**Solange du keine Domain hast:** „Passwort vergessen" bleibt aus, und
die Seite sagt das ehrlich an. Wer sein Passwort vergisst, kommt über
das **Wiederherstellungs-Kennwort** auf der Anmeldeseite wieder rein —
das läuft ohne Mail und ist schon eingebaut. Registrieren, Anmelden und
die drei Plattformen funktionieren ebenfalls ohne SMTP.

**Was du jetzt schon eintragen musst**, unabhängig vom Versand:
unter *Authentication → URL Configuration → Redirect URLs* gehört
`https://spitzefluke.github.io/FireHelmet/` hinein — sonst führen die
Rückwege von Twitch, Discord und Google ins Leere.

Schritt für Schritt mit Resend (kostenlos bis 3.000 Mails im Monat):

1. Auf `resend.com` anmelden.
2. *Domains → Add Domain* → `firehelmet.de` eintragen. Resend zeigt drei
   DNS-Einträge (DKIM, SPF, und einen für den Rückweg). Die trägst du bei
   deinem Domain-Anbieter ein; danach in Resend auf *Verify* klicken.
   Ohne eigene Domain geht es nicht — an `@gmail.com` als Absender
   verschickt kein seriöser Dienst.
3. *API Keys → Create API Key*, Recht *Sending access*. Den Schlüssel
   einmal kopieren, er wird nicht wieder angezeigt.
4. In Supabase unter *Authentication → Emails → SMTP Settings*
   **Enable Custom SMTP** einschalten und eintragen:

   | Feld | Wert |
   |---|---|
   | Sender email | `no-reply@firehelmet.de` |
   | Sender name | `FireHelmet` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | der API-Schlüssel aus Schritt 3 |

5. Speichern, dann auf der Seite „Passwort vergessen" mit einer echten
   Adresse testen.

Statt Resend gehen genauso Brevo, Postmark, AWS SES oder SendGrid — die
sechs Felder oben sind bei allen dieselben, nur Host/Username ändern sich.

Mit eigenem SMTP liegt das Limit bei **30 neuen Nutzern pro Stunde**
(einstellbar unter *Authentication → Rate Limits*). Vor einem Stream, bei
dem sich viele auf einmal anmelden, lohnt es sich, das vorher hochzusetzen.

#### Wie Name und Passwort intern funktionieren

Supabase kennt **keine Anmeldung per Benutzername** — Passwort heißt dort
immer `signUp({ email, password })`. Deshalb erzeugt die Seite aus dem
Namen eine Adresse:

    "Kapitän Ahab"  →  kapitaen-ahab@spieler.firehelmet.de

Die sieht niemand, sie ist reiner Schlüssel. Wer bei der Registrierung
eine **echte** Adresse hinterlegt, bekommt diese als Kontoadresse (ein
Konto hat bei Supabase genau eine) — und meldet sich dann auch **mit
dieser** an. Das Anmeldefeld nimmt beides entgegen, und die Fehlermeldung
sagt es.

---

## Was mit bestehenden Konten passiert

**Nichts geht verloren.** Wer anonym gespielt hat und sich jetzt anmeldet,
behält Dublonen, Schiffsfortschritt und Boss-Schaden.

Der Grund steht in `scripts/auth/anmeldung.js`: bei einer anonymen Sitzung
wird `linkIdentity()` benutzt, nicht `signInWithOAuth()`. Das hängt die
Twitch-Identität an das **bestehende** Konto — dieselbe UID, derselbe
Fortschritt, nur jetzt mit Nachweis. `signInWithOAuth()` hätte eine neue
Sitzung mit neuer UID angelegt, und der Fortschritt wäre aus Sicht des
Spielers verschwunden (er läge noch da, nur unerreichbar).

Anonym spielen bleibt möglich und ist weiterhin der Standard. Die
Anmeldung ist ein Angebot, keine Hürde.

---

## Was der Umbau sicherheitstechnisch bringt

| Vorher | Jetzt |
| --- | --- |
| Name aus `localStorage`, Server prüft nur die Länge | Name aus dem signierten Token |
| Jeder konnte sich „Ändii" nennen | Ein verifizierter Name ist für alle anderen gesperrt |
| „Verifiziert" war eine Behauptung des Browsers | `players.anmeldeart` kommt aus `app_metadata` im Token |
| Twitch nutzte den veralteten Implicit-Flow, Token in der URL | Supabase nutzt den Authorization-Code-Flow |

`players.anmeldeart` ist für Spieler **schreibgeschützt** — gesetzt wird
sie nur von `app.anmeldeart_festhalten()`, und die liest den Wert aus
`app_metadata`. Das ist der Teil des Tokens, den der Nutzer nicht
verändern kann, im Gegensatz zu `user_metadata`.

---

## Wenn etwas nicht geht

**„Unsupported provider"** — der Anbieter ist in Supabase nicht
eingeschaltet.

**„Manual linking is disabled for this project"** — der Schalter *Allow
manual linking* fehlt, siehe oben.

**Nach dem Anmelden landet man auf `localhost:3000`** — unter
*Authentication → URL Configuration* ist die *Site URL* falsch. Das ist
schon einmal passiert, die Notiz dazu steht in
`supabase/game-migration/README.md`.

**„Identity is already linked to another user"** — die Twitch-Kennung
hängt schon an einem anderen Konto. Passiert, wenn man sich früher schon
einmal angemeldet hatte. Über das Admin-Panel lässt sich das umhängen
(`admin_identitaet_umhaengen`).
