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

### E-Mail

Ist bei Supabase schon aktiv. Kontrolliere nur zweierlei:

- **Confirm email** eingeschaltet lassen
- Unter *Authentication → URL Configuration* muss deine Seitenadresse bei
  **Redirect URLs** stehen, sonst führt der Link aus der Mail ins Leere

Kein Kennwort — Supabase schickt einen Einmal-Link. Eines mehr zu
verwalten wäre für eine Spielseite eine Zumutung, und ein schlecht
gewähltes wäre ein Risiko.

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

**Nach dem Anmelden landet man auf `localhost:3000`** — unter
*Authentication → URL Configuration* ist die *Site URL* falsch. Das ist
schon einmal passiert, die Notiz dazu steht in
`supabase/game-migration/README.md`.

**„Identity is already linked to another user"** — die Twitch-Kennung
hängt schon an einem anderen Konto. Passiert, wenn man sich früher schon
einmal angemeldet hatte. Über das Admin-Panel lässt sich das umhängen
(`admin_identitaet_umhaengen`).
