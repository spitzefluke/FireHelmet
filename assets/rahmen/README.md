# Avatar-Rahmen

Zehn gezeichnete Rahmen, die im Shop und überall dort erscheinen, wo ein
Avatar mit Rahmen gezeigt wird (Rangliste, Podest, Avatarwahl).

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

Die sechs älteren Rahmen (`bronze` … `legend`) sind reine CSS-Farbverläufe
und rotieren. Diese zehn stehen still: in der Rangliste liegen zwanzig
Avatare nebeneinander, und zwanzig rotierende Ringe sind dort keine
Zierde mehr, sondern Unruhe.

## Prüfen

Ein Rahmen muss bei **44 px** noch lesbar sein, nicht nur bei 104 px.
Feine Linien unter Strichstärke 1 und Formen kleiner als 3 Einheiten
verschwinden dort.
