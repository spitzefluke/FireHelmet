# firehelmet.de einrichten

Die Seite liegt weiterhin auf GitHub Pages — nur die Adresse ändert sich.
Kein Umzug, kein anderer Anbieter, kein Risiko für die Daten.

**Verfügbarkeit:** Meine DNS-Abfrage ergab keine Auflösung für
`firehelmet.de`. Das ist ein *Hinweis*, dass sie frei sein könnte, aber
kein Beweis — eine registrierte, ungenutzte Domain löst genauso wenig
auf. Sicher weißt du es erst beim Registrar.

---

## ⚠️ Die Reihenfolge ist wichtig

Sobald eine Datei namens `CNAME` im Repository liegt, **leitet GitHub die
alte Adresse auf die neue um**. Steht die Domain zu dem Zeitpunkt noch
nicht, ist die Seite unter *beiden* Adressen nicht erreichbar.

Deshalb liegt die Datei hier als `CNAME.wartet` und ist damit inaktiv.
Sie wird erst im letzten Schritt umbenannt.

---

## 1. Domain kaufen

**INWX** (https://www.inwx.de) oder **Netcup**
(https://www.netcup.de/domains/). Beide lassen dich die DNS-Einträge
selbst setzen, das ist die einzige Anforderung.

Eine `.de` kostet dort etwa **5–8 € im Jahr**.

Nimm **nur die Domain**, kein "Website-Paket" und kein Hosting —
gehostet wird weiterhin bei GitHub, das kostet nichts.

---

## 2. DNS eintragen

Bei INWX unter *Domains → firehelmet.de → DNS*, bei Netcup im
*Customercontrol Panel → Domains → DNS*.

**Vier A-Einträge und ein CNAME:**

| Typ | Name | Wert |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `spitzefluke.github.io.` |

Die vier A-Einträge sind die Server von GitHub Pages. **Alle vier
eintragen**, nicht nur einen: fällt ein Server aus, übernehmen die
anderen.

Der Punkt am Ende von `spitzefluke.github.io.` gehört dazu. Manche
Oberflächen ergänzen ihn selbst, manche nicht — schadet nie.

Falls beim Kauf schon Einträge angelegt wurden (Parkseite, Weiterleitung,
`A` auf eine andere Adresse): **die alten `A`-Einträge für `@` löschen**,
sonst zeigt die Domain mal hierhin, mal dorthin.

**Das dauert.** DNS-Änderungen brauchen zwischen zehn Minuten und 24
Stunden. Wenn es nach einer Stunde noch nicht geht, ist das normal —
nichts nachjustieren, einfach warten.

---

## 3. Prüfen, ob DNS steht

Bevor du weitermachst, im Terminal:

```
nslookup firehelmet.de
```

Kommen die vier `185.199.*`-Adressen zurück, ist DNS fertig. Kommt
nichts oder etwas anderes, **noch nicht weitermachen**.

---

## 4. Bei GitHub eintragen

1. Repository → **Settings** → **Pages**
2. Unter *Custom domain* `firehelmet.de` eintragen, **Save**
3. Warten, bis dort *DNS check successful* steht
4. **Enforce HTTPS** anhaken

Punkt 4 geht erst, wenn GitHub das Zertifikat ausgestellt hat — nach dem
DNS-Check noch einmal bis zu einer Stunde. Ohne diesen Haken wäre die
Seite auch über unverschlüsseltes `http://` erreichbar.

GitHub legt dabei selbst eine Datei `CNAME` im Repository an. Das ist in
Ordnung — dann ist Schritt 5 schon erledigt.

---

## 5. Die CNAME-Datei aktivieren

Nur nötig, falls GitHub sie in Schritt 4 **nicht** selbst angelegt hat:

```
git mv CNAME.wartet CNAME
git commit -m "Domain firehelmet.de aktiviert"
git push
```

Diese Datei nicht löschen — verschwindet sie, fällt die Domain weg.

---

## 6. Sag mir Bescheid

Sobald `https://firehelmet.de` lädt, ziehe ich im Projekt nach:

| Datei | Was |
| --- | --- |
| `index.html` | `canonical`, `og:url`, `og:image`, `twitter:image` |
| `scripts/core/share.js` | `SHARE_URL` — die Adresse beim Teilen |
| `scripts/auth/twitch-config.js` | Kommentar mit der Beispieladresse |
| `scripts/auth/discord-config.js` | dito |

Die Vorschaubilder (`og:image`) müssen **absolut** bleiben, also mit
`https://` und Domain. Discord, Facebook und Twitter holen die Bilder von
außen — ein relativer Pfad zeigt für sie ins Leere.

Ich mache das **nach** Schritt 4 und nicht vorher: bis die Domain steht,
würden die Vorschaubilder sonst ins Leere zeigen.

---

## 7. Was du bei den Anbietern nachziehen musst

Der Teil, den man vergisst — und dann **geht die Anmeldung nicht mehr**.

**Supabase** → Authentication → URL Configuration
- *Site URL* auf `https://firehelmet.de/` setzen
- Unter *Redirect URLs* `https://firehelmet.de/` ergänzen
- Die alte `https://spitzefluke.github.io/FireHelmet/` **drinlassen** —
  falls jemand einen alten Link benutzt

**Twitch** → https://dev.twitch.tv/console/apps → deine App → *Manage*
- Bei *OAuth Redirect URLs* muss die **Supabase**-Adresse stehen:
  `https://kxlntqjevvdiiefzkoiu.supabase.co/auth/v1/callback`

**Discord** → https://discord.com/developers/applications → *OAuth2*
- Bei *Redirects* dieselbe Supabase-Adresse

**Google** → Google Cloud Console → *Credentials*
- Bei *Authorized redirect URIs* dieselbe Supabase-Adresse

Twitch, Discord und Google zeigen **nicht** auf deine Domain, sondern auf
Supabase. Supabase führt den OAuth-Tanz und schickt dich danach weiter —
deshalb steht deine eigene Adresse nur bei Supabase unter *Redirect URLs*.

---

## 8. Danach prüfen

- `https://firehelmet.de/` lädt die Seite
- `http://firehelmet.de/` leitet auf `https://` um
- `https://www.firehelmet.de/` leitet ebenfalls um
- `https://spitzefluke.github.io/FireHelmet/` leitet auf die neue Adresse
  um (macht GitHub automatisch)
- Anmeldung mit Twitch, Discord, Google und E-Mail geht durch
- Ein Link in Discord gepostet zeigt das Vorschaubild

---

## Wenn etwas klemmt

**„Domain is not properly configured"** in den GitHub-Einstellungen — DNS
ist noch nicht durch. Warten, dann *Check again*.

**Die Seite lädt, aber ohne Bilder und ohne Stil** — dann greift noch ein
alter Pfad. Einmal hart neu laden (Strg+Shift+R).

**Nach dem Anmelden landet man auf `localhost:3000`** — bei Supabase unter
*URL Configuration* ist die *Site URL* falsch. Das ist hier schon einmal
passiert, die Notiz steht in `supabase/game-migration/README.md`.

**Zertifikatswarnung im Browser** — *Enforce HTTPS* war noch nicht
angehakt oder das Zertifikat ist noch nicht fertig. Eine Stunde warten.
