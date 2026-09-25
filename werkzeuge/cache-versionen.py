#!/usr/bin/env python3
"""Versionsnummern fuer Skripte und Stylesheets in index.html.

WARUM
GitHub Pages erlaubt dem Browser, jede Datei zehn Minuten lang aus
dem Cache zu nehmen. Nach einem Merge lief deshalb oft noch das alte
JavaScript - neue Funktionen "fehlten", bis man Strg+F5 drueckte.

WAS ES TUT
Haengt an jedes lokale <script src="…js"> und <link href="…css"> in
index.html ein ?v=<Pruefsumme>. Die Pruefsumme kommt aus dem INHALT
der Datei: aendert sich eine Datei, aendert sich ihre Adresse, und
der Browser holt sie neu. Unveraenderte Dateien behalten ihre
Nummer und bleiben im Cache.

Das ist kein Build: index.html bleibt von Hand bearbeitbar, und eine
vergessene Nummer macht nichts kaputt - dann gilt fuer diese Datei
nur wieder der alte Zehn-Minuten-Cache.

AUFRUF (aus dem Repo-Wurzelverzeichnis, nur Standardbibliothek)
    python3 werkzeuge/cache-versionen.py            # Nummern auffrischen
    python3 werkzeuge/cache-versionen.py --pruefen  # nur melden, Exit 1 wenn veraltet
"""

import hashlib
import io
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(WURZEL, "index.html")

# src="…" / href="…" mit relativem Pfad auf .js oder .css, optional
# schon mit ?v=…. Absolute Adressen (http:, //, /) fasst das nicht an.
MUSTER = re.compile(r'((?:src|href)=")(?!https?:|//|/|data:)([^"?#]+\.(?:js|css))(\?v=[0-9a-f]+)?(")')


def pruefsumme(pfad):
    with open(pfad, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def main():
    nur_pruefen = "--pruefen" in sys.argv[1:]
    text = io.open(HTML, encoding="utf-8").read()
    fehlend = []
    geaendert = []

    def ersetzen(m):
        pfad = m.group(2)
        datei = os.path.join(WURZEL, pfad)
        if not os.path.isfile(datei):
            fehlend.append(pfad)
            return m.group(0)
        neu = "?v=" + pruefsumme(datei)
        if m.group(3) != neu:
            geaendert.append(pfad)
        return m.group(1) + pfad + neu + m.group(4)

    ergebnis = MUSTER.sub(ersetzen, text)

    for pfad in fehlend:
        print("FEHLT: " + pfad + " (in index.html eingebunden, aber nicht vorhanden)")
    if nur_pruefen:
        for pfad in geaendert:
            print("veraltet: " + pfad)
        print("%d veraltet, %d fehlend" % (len(geaendert), len(fehlend)))
        sys.exit(1 if geaendert or fehlend else 0)

    if ergebnis != text:
        io.open(HTML, "w", encoding="utf-8", newline="").write(ergebnis)
    print("%d Nummern aufgefrischt, %d fehlend" % (len(geaendert), len(fehlend)))
    sys.exit(1 if fehlend else 0)


if __name__ == "__main__":
    main()
