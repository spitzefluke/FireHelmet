/* ======================================================
   SCHIFFSREPARATUR UND "DER FALL" ENTFERNEN
   ---------------------------------------------------
   Beide Funktionen sind aus der Seite entfernt (Nav, Seiten,
   Skripte, Codes, Rad-Preise, Admin-Steuerung). Diese Migration
   raeumt die Datenbankseite nach.

   WAS HIER PASSIERT
   Die Tabelle public.ship_repair samt ihrer drei RLS-Policies und
   der zwei zugehoerigen Funktionen (app.old_ship_repair,
   app.valid_ship_repair_update) wird geloescht.

   "DER FALL" HATTE KEINE EIGENE TABELLE
   Das Detektivspiel lief rein im Browser (localStorage-Notizen);
   seine einzige Belohnung - 400 Dublonen und der Meisterdetektiv-
   Avatar - lief ueber den normalen Code-Einloeseweg
   (redeemCurrencyCode -> players). Hier ist also NICHTS zu
   loeschen. Der Avatar "meisterdetektiv" bleibt bewusst im
   Katalog (scripts/wheel/avatars-data.js): wer ihn schon
   freigeschaltet hat, soll ihn weiter tragen koennen - nur der
   Weg, ihn NEU zu verdienen, ist weg.

   WAS BEWUSST STEHEN BLEIBT: die Spalte players.ship_tools
   ship_tools ist eine SPALTE auf players, keine eigene Tabelle -
   und sie ist tief in app.valid_players_write() verdrahtet
   (zusammen mit valid_ship_tools() und den daily_quests-Feldern).
   Sie herauszuloesen hiesse, den zentralen Schreib-Waechter der
   players-Tabelle umzuschreiben - genau das, wovor die
   Projektregel warnt ("eine neue Migration darf valid_players_write
   nicht neu schreiben"). Der Klartext-Nutzen waere gering: die
   Spalte ist ein leeres JSONB ('{}'), das der Client seit dem
   Entfernen der Schiff-Seite nie wieder beschreibt. Das Risiko,
   dabei die WAEHRUNGS-Schreibpruefung aller Spieler zu
   beschaedigen, steht in keinem Verhaeltnis. Die Spalte bleibt
   deshalb als stiller Rest liegen; sie schadet nichts.

   REIHENFOLGE: nach 20-avatar-schutz.sql einspielen.
   Von Hand im Supabase-SQL-Editor. Idempotent (if exists),
   darf also gefahrlos zweimal laufen.

   UNWIDERRUFLICH: Ein "drop table" loescht die gespeicherten
   Schiffsreparatur-Fortschritte aller Spieler. Das ist der
   gewuenschte Effekt - die Funktion gibt es nicht mehr -, aber
   es gibt kein Zurueck. Wer die Daten aufheben will, exportiert
   public.ship_repair VOR dem Einspielen.
====================================================== */

/* Ein einziger Schritt: die Tabelle mit cascade. Das entfernt in
   einem Zug die drei RLS-Policies UND die zwei Funktionen, die den
   Zeilentyp public.ship_repair in ihrer Signatur fuehren
   (old_ship_repair GIBT ihn zurueck, valid_ship_repair_update NIMMT
   ihn entgegen) - beide haengen ueber den Typ an der Tabelle.

   Warum nicht die Funktionen zuerst einzeln droppen? Ein lokaler
   Test hat den Grund gezeigt: die update-Policy haengt an
   valid_ship_repair_update, ein "drop function" davor scheitert
   also. Und ein "drop function ... (text, public.ship_repair)"
   NACH dem Tabellen-Drop scheitert ebenfalls, weil der Typ dann
   schon weg ist und die Signatur nicht mehr aufloesbar. cascade
   loest genau diese Verkettung in der richtigen Reihenfolge auf -
   und bleibt durch "if exists" idempotent (zweiter Lauf: die
   Tabelle ist weg, der Befehl tut nichts). */
drop table if exists public.ship_repair cascade;
