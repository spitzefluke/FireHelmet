/* ======================================================
   PRUEFUNG ZU 30-live-zuschauer.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 30 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   WICHTIG: Der Admin startet hier KEIN Event ueber
   admin_event_starten() - das wuerde live_event aendern und den
   Countdown bei allen Besuchern abspielen. Event und Abstimmung
   werden direkt in die Tabellen geschrieben; die Admin-Funktionen
   werden nur als Nicht-Admin geprueft (muessen abgewiesen werden).

   Alle Testzeilen (event_id beginnt mit "30test") werden am Ende
   wieder geloescht. Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '30aa0000-0000-0000-0000-00000000000a';
  uid2    constant text := '30bb0000-0000-0000-0000-00000000000b';
  ausgabe text := E'\n';
  ok      boolean;
  n       integer;
  r       jsonb;
  zeile   record;
begin
  perform set_config('role', 'postgres', true);
  delete from public.live_events where event_id like '30test%';
  delete from public.event_abzeichen where abzeichen_id like 'dabei-30test%';

  insert into public.live_events (event_id, name, countdown_ab, live_ab) values
    ('30test-jetzt', '30TEST Sturm', now() - interval '1 minute', now() - interval '50 seconds'),
    ('30test-alt',   '30TEST Alt',   now() - interval '2 days',   now() - interval '2 days');
  update public.live_events set beendet_am = now() - interval '1 day' where event_id = '30test-alt';
  insert into public.event_abzeichen (abzeichen_id, art, titel, event_id) values
    ('dabei-30test-jetzt', 'dabei', 'War dabei: 30TEST Sturm', '30test-jetzt'),
    ('dabei-30test-alt',   'dabei', 'War dabei: 30TEST Alt',   '30test-alt');
  insert into public.live_abstimmungen (abst_id, event_id, frage, antwort_a, antwort_b, ab, bis) values
    ('30test-abst', '30test-jetzt', '30TEST Kurs?', 'Sturm', 'Schatz', now() - interval '5 seconds', now() + interval '1 minute'),
    ('30test-zu',   '30test-jetzt', '30TEST Vorbei?', 'Ja', 'Nein', now() - interval '5 minutes', now() - interval '4 minutes');

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T1: ein Nicht-Admin startet weder Event noch Abstimmung. */
  ok := true;
  begin
    perform app.admin_event_starten('30TEST Frech', 10);
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_abstimmung_starten('F', 'A', 'B', 20);
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_event_beenden();
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Nicht-Admin kann kein Event und keine Abstimmung starten' || E'\n';

  /* T2: abstimmen - einmal, zweites Mal "schon". */
  ok := app.live_abstimmen('30test-abst', 'a') = 1 and app.live_abstimmen('30test-abst', 'b') = 0;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 eine Stimme zaehlt, die zweite nicht' || E'\n';

  /* T3: abgelaufene Abstimmung und unsinnige Wahl: -1. */
  ok := app.live_abstimmen('30test-zu', 'a') = -1 and app.live_abstimmen('30test-abst', 'c') = -1;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 vorbei oder ungueltig: -1' || E'\n';

  /* T4: Stand zeigt Summen und die eigene Wahl. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid2 || '","role":"authenticated","is_anonymous":true}', true);
  perform app.live_abstimmen('30test-abst', 'b');
  select * into zeile from app.live_abstimmung_stand('30test-abst');
  ausgabe := ausgabe || case when zeile.a = 1 and zeile.b = 1 and zeile.meine = 'b' then 'PASS' else 'FAIL' end
          || '  T4 Stand: 1 zu 1, meine Wahl b' || E'\n';

  /* T5: Abzeichen "War dabei" fuer das laufende Event - einmal neu. */
  r := app.live_war_dabei('30test-jetzt');
  ok := (r->>'ok')::boolean = true and (r->>'neu')::boolean = true
        and (app.live_war_dabei('30test-jetzt')->>'neu')::boolean = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 Abzeichen fuer das laufende Event, beim zweiten Mal nicht neu' || E'\n';

  /* T6: laengst beendetes Event: kein Abzeichen. */
  r := app.live_war_dabei('30test-alt');
  ausgabe := ausgabe || case when (r->>'ok')::boolean = false then 'PASS' else 'FAIL' end
          || '  T6 kein Abzeichen fuer ein vor einem Tag beendetes Event' || E'\n';

  /* T7: Sammlung und Rangliste sehen es. */
  select count(*) into n from app.meine_abzeichen() m where m.habe = true and m.abzeichen_id = 'dabei-30test-jetzt' and m.anzahl = 1;
  ok := n = 1 and exists (select 1 from app.abzeichen_je_spieler() z where z.firebase_uid = uid2 and z.titel = 'War dabei: 30TEST Sturm');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 Sammlung und Rangliste zeigen das Abzeichen' || E'\n';

  /* T8: niemand kommt direkt an Stimmen oder Abzeichen. */
  ok := has_table_privilege('authenticated', 'public.live_stimmen', 'select') = false
        and has_table_privilege('authenticated', 'public.spieler_abzeichen', 'insert') = false
        and has_function_privilege('anon', 'public.live_abstimmen(text,text)', 'execute') = false
        and has_function_privilege('anon', 'public.admin_event_starten(text,integer)', 'execute') = false
        and has_function_privilege('anon', 'public.abzeichen_je_spieler()', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T8 keine direkten Rechte, anon nur Lesefunktionen' || E'\n';

  /* T9: Logbuch lesen darf jeder, schreiben nur der Admin. */
  perform set_config('role', 'authenticated', true);
  ok := true;
  begin
    insert into public.live_logbuch (event_id, text) values ('30test-jetzt', '30TEST frech');
    ok := false;
  exception when others then null; end;
  perform set_config('role', 'postgres', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T9 Nicht-Admin kann nichts ins Logbuch schreiben' || E'\n';

  /* Aufraeumen */
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.event_abzeichen where abzeichen_id like 'dabei-30test%';
  delete from public.live_events where event_id like '30test%';
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.event_abzeichen where abzeichen_id like 'dabei-30test%';
  delete from public.live_events where event_id like '30test%';
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
