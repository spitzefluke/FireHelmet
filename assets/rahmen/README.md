# Avatar-Rahmen

Sechzehn gezeichnete Rahmen. Sichtbar in der Shop-Vorschau, in der
Rangliste, auf dem Podest und in der Boss-Rangliste — überall über
`wrapAvatarWithFrame()` in `scripts/wheel/wheel.js`.

Zwischenzeitlich waren sie aus der Rangliste ausgebaut: damals waren es
rotierende Farbverläufe mit je nach Stufe unterschiedlichem Tempo, und
bei 32-px-Avataren in einer vollen Tabelle war das zu unruhig. Seit alle
sechzehn stillstehende Zeichnungen sind, fällt der Grund weg.

## Wie sie eingebunden sind

Über die bestehende Klassenmechanik, nicht über neues JavaScript:

    <div class="avatar-frame-tau">…Avatarbild…</div>

Die Regel dazu steht in `css/40-shop.css` und setzt die Datei als
`background-image` auf `::before`. Ein neuer Rahmen braucht deshalb
genau drei Dinge: die SVG hier, eine Zeile CSS und einen Eintrag in
`scripts/shop/shop-data.js` mit passendem `style`.

## Geometrie

- `viewBox="0 0 100 100"`, Mittelpunkt (50, 50).
- **Das Avatarbild reicht bis r = 44.** Alles, was ein Rahmen zeichnet,
  gehört nach aussen ab etwa r = 40 — sonst verdeckt er das Gesicht.
- Nach aussen darf über r = 50 hinausgeragt werden: das CSS setzt das
  Element mit `inset: -13%` grösser als das Bild. Genau davon leben die
  Speichen des Steuerrads, die Krakenarme und der gerissene
  Pergamentrand.
- Keine gefüllte Innenfläche. Wer einen geschlossenen Umriss zeichnet,
  braucht ein echtes Loch (`fill-rule="evenodd"` mit einem zweiten,
  gegenläufigen Kreis) — siehe `pergament.svg`.

## Warum sie sich nicht drehen

Anfangs waren `bronze` … `legend` rotierende CSS-Farbverläufe, jeder mit
eigenem Tempo. Genau diese Unruhe hat den Ring aus der Rangliste
geworfen. Alle sechzehn stehen deshalb still. Den Unterschied zwischen
den Stufen macht die Zeichnung selbst — und im Shop zusätzlich der
Seltenheitspuls der Karte (`css/50-redesign.css`).

## Prüfen

Ein Rahmen muss bei **44 px** noch lesbar sein, nicht nur bei 104 px.
Feine Linien unter Strichstärke 1 und Formen kleiner als 3 Einheiten
verschwinden dort.
