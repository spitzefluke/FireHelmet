/* ======================================================
   PRUEFUNG ZU 66-drehbuch-mehr.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 66 eingespielt wurde.
   Ein einziger DO-Block. Testzeilen (Name beginnt mit "66TEST")
   werden am Ende geloescht. Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ausgabe text := E'\n';
  ok      boolean;
  boese   jsonb;
begin
  perform set_config('role', 'postgres', true);
  delete from public.event_drehbuecher where name like '66TEST%';

  /* T1: Alte Drehbuecher aus 65 gehen weiter durch. */
  insert into public.event_drehbuecher (name, schritte) values ('66TEST alt', '[
    {"art":"text","text":"Gleich geht es los","farbe":"#f0c96a","von":"Aendii","modus":"auto","sek":8},
    {"art":"story","story":"disco","modus":"hand"},
    {"art":"effekt","effekt":"konfetti","modus":"auto","sek":0},
    {"art":"pause","modus":"auto","sek":5},
    {"art":"story_ende","modus":"hand"}]'::jsonb);
  ausgabe := ausgabe || 'PASS  T1 Drehbuch im Format von 65 wird weiter gespeichert' || E'\n';

  /* T2: Alle neuen Arten in gueltiger Form. */
  insert into public.event_drehbuecher (name, schritte) values ('66TEST neu', '[
    {"art":"freigabe","flag":"gluecksmine","an":true,"modus":"auto","sek":2},
    {"art":"seite","seite":"shop","an":false,"modus":"auto","sek":0},
    {"art":"event_start","name":"Disco-Nacht","countdown":10,"modus":"auto","sek":12},
    {"art":"abstimmung","frage":"Welcher Kurs?","a":"Nord","b":"Sued","dauer":60,"modus":"hand"},
    {"art":"buehne","an":true,"modus":"auto","sek":3},
    {"art":"epoche","jahr":"2100","modus":"auto","sek":3},
    {"art":"geschenk","gabe":"dublonen","wert":250,"modus":"auto","sek":1},
    {"art":"geschenk","gabe":"skillpunkte","wert":2,"modus":"auto","sek":1},
    {"art":"geschenk","gabe":"pass_xp","wert":500,"modus":"auto","sek":1},
    {"art":"geschenk","gabe":"diamanten","wert":20,"modus":"auto","sek":1},
    {"art":"geschenk","gabe":"avatar","avatar":"pirat_gold","modus":"auto","sek":1},
    {"art":"geschenk","gabe":"titel","titel":"Held der Nacht","stil":"gold","modus":"auto","sek":1},
    {"art":"schlacht","boss":false,"tempo":10,"ort":"","links":"piraten","rechts":"geister","sammeln":90,"modus":"hand"},
    {"art":"schlacht","boss":true,"tempo":5,"ort":"pulsar","sammeln":60,"staerke":3,"modus":"hand"},
    {"art":"schlacht_ende","modus":"hand"},
    {"art":"event_ende","modus":"hand"}]'::jsonb);
  ausgabe := ausgabe || 'PASS  T2 alle neuen Schritt-Arten werden gespeichert' || E'\n';

  /* T3: Boeses wird abgelehnt. */
  ok := true;
  for boese in select value from jsonb_array_elements('[
      [{"art":"freigabe","flag":"x; drop","an":true}],
      [{"art":"freigabe","flag":"spind","an":"ja"}],
      [{"art":"seite","seite":"gateway","an":false}],
      [{"art":"event_start","name":"","countdown":10}],
      [{"art":"event_start","name":"X","countdown":999}],
      [{"art":"abstimmung","frage":"F","a":"A","b":"","dauer":60}],
      [{"art":"abstimmung","frage":"F","a":"A","b":"B","dauer":5}],
      [{"art":"epoche","jahr":"1999"}],
      [{"art":"geschenk","gabe":"dublonen","wert":999999}],
      [{"art":"geschenk","gabe":"skillpunkte","wert":11}],
      [{"art":"geschenk","gabe":"diamanten","wert":"10"}],
      [{"art":"geschenk","gabe":"gold","wert":1}],
      [{"art":"geschenk","gabe":"titel","titel":"Viel zu langer Titel fuer einen Spieler","stil":"gold"}],
      [{"art":"geschenk","gabe":"titel","titel":"Held","stil":"pink"}],
      [{"art":"schlacht","tempo":10,"links":"menschen","rechts":"menschen"}],
      [{"art":"schlacht","tempo":10,"ort":"Ort mit Leerzeichen"}],
      [{"art":"schlacht"}],
      [{"art":"buehne"}]
    ]'::jsonb) loop
    begin
      insert into public.event_drehbuecher (name, schritte) values ('66TEST boese', boese);
      ok := false;
      raise notice 'durchgerutscht: %', boese;
    exception when check_violation then null; end;
  end loop;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 falsche Werte, Grenzen und Formen werden abgelehnt' || E'\n';

  /* T4: Die Tabelle prueft mit der neuen Funktion, die alte bleibt. */
  ok := exists (select 1 from pg_constraint where conname = 'drehbuch_schritte_form_66')
        and not exists (select 1 from pg_constraint where conname = 'drehbuch_schritte_form')
        and to_regprocedure('public.drehbuch_form_ok(jsonb)') is not null;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 neue Pruefung aktiv, alte Funktion unangetastet' || E'\n';

  delete from public.event_drehbuecher where name like '66TEST%';
  raise notice '%', ausgabe;
exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.event_drehbuecher where name like '66TEST%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
