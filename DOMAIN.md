# Eigene Adresse statt spitzefluke.github.io

Die Seite liegt weiterhin auf GitHub Pages — nur die Adresse in der
Adresszeile ändert sich. Kein Umzug, kein anderer Anbieter, kein Risiko
für die Daten.

---

## 1. Einen Namen aussuchen

Ich habe die Verfügbarkeit **nicht geprüft** — das geht nur beim
Registrar, und die Lage ändert sich täglich. Prüf zwei oder drei davon,
bevor du dich festlegst.

### Kurz und direkt

| Domain | Warum |
| --- | --- |
| `firehelmet.de` | Der Name der Seite, sonst nichts. Am leichtesten zu merken und im Stream zu sagen. |
| `firehelmet.gg` | `.gg` ist die übliche Endung für Spiel- und Stream-Projekte. Teurer als `.de`. |
| `feuerhelm.de` | Die deutsche Fassung — passt, wenn das Publikum deutschsprachig ist. |

### Mit Bezug zur Saga

| Domain | Warum |
| --- | --- |
| `piratensaga.de` | Beschreibt, worum es geht, ohne den Titel festzunageln. |
| `flitzpiepen.de` | Der Crew-Name aus den Codes — kurz, eigen, kaum zu verwechseln. |
| `dublonen.de` | Die Währung der Seite. Sehr kurz, sehr einprägsam. |

### Wenn der Stream im Mittelpunkt steht

| Domain | Warum |
| --- | --- |
| `zugfahrerdave.de` | Wenn die Seite als Anlaufstelle zum Kanal gedacht ist. |
| `aendii.de` | Kurz. Vorsicht: Umlaut-Domains machen beim Vorlesen Ärger — dann eher `aendii.de` als `ändii.de`. |

**Wo kaufen:** INWX, Netcup oder Namecheap. Eine `.de` kostet etwa 5–15 €
im Jahr, `.gg` deutlich mehr (30–80 €). Nimm einen Anbieter, bei dem du
die DNS-Einträge selbst setzen kannst — das können alle drei.

**Nicht bei einem Anbieter kaufen, der nur ein "Website-Paket" verkauft.**
Du brauchst nur die Domain, gehostet wird weiterhin bei GitHub.

---

## 2. DNS beim Anbieter eintragen

Für `deinedomain.de` **vier A-Einträge und ein CNAME**:

| Typ | Name | Wert |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `spitzefluke.github.io.` |

Die vier A-Einträge sind die Server von GitHub Pages — alle vier
eintragen, nicht nur einen: fällt einer aus, übernehmen die anderen.

Der Punkt am Ende von `spitzefluke.github.io.` gehört dazu. Manche
Oberflächen ergänzen ihn selbst, manche nicht.

**Das dauert.** DNS-Änderungen brauchen zwischen zehn Minuten und 24
Stunden, bis sie überall angekommen sind. Wenn es nach einer Stunde noch
nicht geht, ist das normal.

---

## 3. Bei GitHub eintragen

1. Repository → **Settings** → **Pages**
2. Unter *Custom domain* die Domain eintragen, **Save**
3. Warten, bis der Haken bei *DNS check successful* steht
4. **Enforce HTTPS** anhaken

Punkt 4 geht erst, wenn GitHub das Zertifikat ausgestellt hat — das
dauert nach dem DNS-Check noch einmal bis zu einer Stunde. Ohne diesen
Haken ist die Seite über `http://` erreichbar, und das will man nicht.

GitHub legt dabei selbst eine Datei `CNAME` im Repository an. Die nicht
löschen — verschwindet sie, fällt die Domain wieder weg.

---

## 4. Was ich im Projekt anpassen muss

Sobald die Domain feststeht, sag mir Bescheid — dann ziehe ich das nach.
Es sind fünf Stellen:

| Datei | Was |
| --- | --- |
| `index.html` | `canonical`, `og:url`, `og:image`, `twitter:image` |
| `scripts/core/share.js` | `SHARE_URL` — die Adresse, die beim Teilen kopiert wird |
| `scripts/auth/twitch-config.js` | nur der Kommentar mit der Beispieladresse |
| `scripts/auth/discord-config.js` | dito |

Die Vorschaubilder (`og:image`) müssen **absolut** bleiben, also mit
`https://` und Domain. Facebook, Discord und Twitter holen die Bilder von
außen — ein relativer Pfad zeigt für sie ins Leere.

---

## 5. Was du bei den Anbietern nachziehen musst

Das ist der Teil, den man leicht vergisst, und dann geht die **Anmeldung
nicht mehr**. Überall muss die neue Adresse dazu:

**Supabase** → Authentication → URL Configuration
- *Site URL* auf `https://deinedomain.de/` setzen
- Unter *Redirect URLs* die neue Adresse ergänzen
- Die alte `https://spitzefluke.github.io/FireHelmet/` erst einmal
  **drinlassen** — falls jemand einen alten Link benutzt

**Twitch** → https://dev.twitch.tv/console/apps → deine App → Manage
- Bei *OAuth Redirect URLs* die neue Adresse ergänzen

**Discord** → https://discord.com/developers/applications → OAuth2
- Bei *Redirects* die neue Adresse ergänzen

**Google** (für den neuen Google-Login) → Google Cloud Console →
Credentials → deine OAuth-Client-ID
- Bei *Authorized redirect URIs* die Supabase-Callback-Adresse eintragen:
  `https://kxlntqjevvdiiefzkoiu.supabase.co/auth/v1/callback`

Google zeigt hier **nicht** auf deine Domain, sondern auf Supabase —
Supabase führt den OAuth-Tanz und schickt dich danach weiter. Das ist bei
Twitch und Discord genauso, wenn du sie im Supabase-Dashboard einträgst.

---

## 6. Danach prüfen

- `https://deinedomain.de/` lädt die Seite
- `http://deinedomain.de/` leitet auf `https://` um
- `https://www.deinedomain.de/` leitet ebenfalls um
- Anmeldung mit Twitch, Discord, Google und E-Mail geht durch
- Ein Link in Discord gepostet zeigt das Vorschaubild
- Die alte `spitzefluke.github.io`-Adresse leitet auf die neue um
  (macht GitHub automatisch)

---

## Anhang: die CNAME-Datei

Im Projekt liegt `CNAME.beispiel` als Vorlage. **Du musst sie nicht selbst
anlegen** — GitHub schreibt die richtige Datei von allein, sobald du die
Domain unter Settings → Pages einträgst (Schritt 3).

Die Vorlage ist nur da, damit du siehst, wie die Datei aussieht: eine
einzige Zeile, nur die Domain, kein `https://`, kein Schrägstrich.

Wenn du die Datei doch selbst anlegst, benenn sie in `CNAME` um (ohne
Endung, groß geschrieben) und leg sie ins Wurzelverzeichnis.
