/* ======================================================
   PRUEFUNG ZU 21-schiff-detektiv-entfernen.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 21 eingespielt wurde.
   Einfach komplett markieren und laufen lassen.

   Ein einziger DO-Block (Begruendung siehe
   18-konto-loeschen.test.sql). Ergebnis als Hinweistext.

   Geprueft wird: die ship_repair-Tabelle und ihre zwei
   Funktionen sind WEG, und die players-Tabelle samt ihrer
   Schreibpruefung ist UNANGETASTET geblieben (die Loeschung darf
   nicht ueber ihr Ziel hinausgeschossen sein). Gegen "= false"
   bzw. "= 0" geprueft, nicht gegen "is not true".

   Erwartet: fuenf Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ausgabe text := E'\n';
  n       integer;
begin
  /* T1: die Tabelle ist weg. */
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'ship_repair';
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T1 Tabelle public.ship_repair existiert nicht mehr' || E'\n';

  /* T2: app.old_ship_repair ist weg. */
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'app' and p.proname = 'old_ship_repair';
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T2 app.old_ship_repair ist entfernt' || E'\n';

  /* T3: app.valid_ship_repair_update ist weg. */
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'app' and p.proname = 'valid_ship_repair_update';
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T3 app.valid_ship_repair_update ist entfernt' || E'\n';

  /* T4: keine ship_repair-Policy blieb als Waise zurueck. */
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'ship_repair';
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T4 keine ship_repair-Policy uebrig' || E'\n';

  /* T5: players ist unangetastet - Tabelle da UND ihre
     Schreibpruefung app.valid_players_write existiert weiter.
     Das ist der Gegenbeweis: die Loeschung hat nur das Schiff
     getroffen, nicht den Kern. */
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'players';
  if n = 1 then
    select count(*) into n from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'app' and p.proname = 'valid_players_write';
  else
    n := 0;
  end if;
  ausgabe := ausgabe || case when n >= 1 then 'PASS' else 'FAIL' end
          || '  T5 players und app.valid_players_write unangetastet' || E'\n';

  raise notice '%', ausgabe;
end $$;
