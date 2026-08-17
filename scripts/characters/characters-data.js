/* ======================================================
   CHARAKTER-DATENBANK
   ---------------------------------------------------
   Jeder Charakter wird HIER nur EIN einziges Mal definiert.
   Die Characters-Seite trägt NICHTS mehr manuell ein - sie
   sammelt stattdessen automatisch alle "characters"-IDs, die
   in scripts/stories/stories-data.js bei den einzelnen Logbüchern
   referenziert werden (siehe deriveCharacterIdsFromStories() in
   scripts/characters/characters.js), entfernt Duplikate und
   schlägt jede ID hier nach.

   NEUEN CHARAKTER HINZUFÜGEN:
   1. Hier einen neuen Eintrag mit eindeutigem Key ergänzen
   2. Bei der/den passenden Story(s) in stories-data.js den Key
      in das "characters"-Array eintragen
   Das war's - die Characters-Seite aktualisiert sich von selbst,
   keine dritte Datei nötig.

   Felder je Charakter:
   - name: Anzeigename
   - role: kurze Rollenbeschreibung (z.B. "Captain")
   - image: Bildpfad, leer lässt eine Emblem-Kachel anzeigen
   - quote: kurzes, charakteristisches Zitat für die Kartenrückseite
   - description: längere Beschreibung
====================================================== */

const CHARACTER_DATABASE = {
  dave: {
    name: "Schifffahrer Dave",
    role: "Captain der Flitzpiepen",
    image: "scripts/image/charakter-3.png",
    quote: "Kurs setzen, Männer - wir haben eine Fracht auszuliefern!",
    description:
      "Dave ist Captain der Crew \"Flitzpiepen\" und ein abenteuerlustiger, freundlicher und erfahrener Schifffahrer. Seine Crew nennt ihn auch Fliezpiepenheimer. Im heutigen Sinne würde man ihn als Rentner bezeichnen – zerbrechlich, aber durchgeknallt.",
  },
  finjan: {
    name: "Finjan Backbeard",
    role: "Ausguck & Flaggendesigner",
    image: "scripts/image/charakter-2.png",
    quote: "Kompasse sind schließlich auch nur Seeleute mit Heimweh.",
    description:
      "Das jüngste und frechste Mitglied der Crew. Trotz seiner sonderbaren Art ist er ein Meister der Beobachtung und sitzt meistens oben im Ausguck. Er hat auch die Flagge des Schiffes entworfen.",
  },
  dean: {
    name: "Dean Silentmouth",
    role: "Steuermann",
    image: "scripts/image/charakter-1.png",
    quote: "...",
    description:
      "Der Steuermann des Schiffes und einer von Daves engsten Vertrauten. Redet nicht viel, aber kennt sich auf den Weltmeeren aus wie kaum ein anderer.",
  },
  andi: {
    name: "Ändi",
    role: "Crew - notorischer Würfler",
    image: "",
    quote: "Nie wieder Würfelspiele. Diesmal ganz bestimmt.",
    description:
      "Ein spielsüchtiges Mitglied der Crew, das schon mehr als einmal fast die gesamte Schiffskasse verzockt hätte. Wird seither von Dean mit Argusaugen beobachtet, sobald Würfel im Spiel sind.",
  },
  julian: {
    name: "Julian",
    role: "Crew-Mitglied",
    image: "",
    quote: "Halt dich fest, Captain!",
    description:
      "Packte im entscheidenden Moment mit an, als es darum ging, Dave aus den Tentakeln des Ungetüms zurück an Bord zu ziehen - ohne zu zögern.",
  },
  corwyn: {
    name: "Elias Corwyn",
    role: "Kartograph von Romna",
    image: "",
    quote: "Manche Dinge vergisst man aus gutem Grund.",
    description:
      "Ein alter Kartograph, der in einem windschiefen Turm über dem Hafen von Romna lebt, umgeben von Papierrollen, die kaum noch jemand außer ihm lesen kann. Kennt die Geschichte hinter der verlorenen Route besser als jeder andere.",
  },
  rosalind: {
    name: "Rosalind Ashgrave",
    role: "Rivalin & Kartografin-Kapitänin",
    image: "",
    quote: "Das Meer erinnert sich an alles, was man ihm zu vergessen befiehlt.",
    description:
      "Kapitänin eines schwarz getakelten Schiffes und langjährige Konkurrentin von Dave. Sucht seit fünfzehn Jahren nach der verlorenen Route - mit einer Entschlossenheit, die längst in Besessenheit umgeschlagen ist.",
  },
};
