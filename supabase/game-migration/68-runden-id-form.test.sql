/* ======================================================
   PRUEFUNG ZU 68-runden-id-form.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 68 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  sp      constant text := '68aa0000-0000-0000-0000-0000000000a1';
  ausgabe text := E'\n';
  ok      boolean;
  boese   text;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Beide Pruefungen sind da. */
  ok := exists (select 1 from pg_constraint where conname = 'giveaway_entries_runde_form')
    and exists (select 1 from pg_constraint where conname = 'giveaway_winners_runde_form');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Pruefungen angelegt' || E'\n';

  begin
    /* T2: Eine normale Runden-ID geht weiter durch. */
    insert into public.giveaway_entries (giveaway_id, firebase_uid, nickname) values ('runde-68_test', sp, 'Test');
    insert into public.giveaway_winners (round_id, winners) values ('runde-68_test', '[]'::jsonb);
    ausgabe := ausgabe || 'PASS  T2 normale Runden-ID wird gespeichert' || E'\n';

    /* T3: Anfuehrungszeichen, Klammern, Leerzeichen, Ueberlaenge fliegen raus. */
    ok := true;
    foreach boese in array array[$x$x');alert(1);('$x$, 'x" onmouseover="a', 'mit leerzeichen', '', repeat('a', 41), '<b>'] loop
      begin
        insert into public.giveaway_entries (giveaway_id, firebase_uid, nickname) values (boese, sp, 'Test');
        ok := false;
        raise notice 'durchgerutscht (Los): %', boese;
      exception when check_violation then null; end;
      begin
        insert into public.giveaway_winners (round_id, winners) values (boese, '[]'::jsonb);
        ok := false;
        raise notice 'durchgerutscht (Zug): %', boese;
      exception when check_violation then null; end;
    end loop;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 gefaehrliche Runden-IDs werden abgelehnt' || E'\n';

    raise exception 'zurueckrollen';
  exception when raise_exception then
    if sqlerrm <> 'zurueckrollen' then raise; end if;
  end;

  /* T4: Nichts vom Test ist geblieben. */
  ok := not exists (select 1 from public.giveaway_entries where firebase_uid = sp)
    and not exists (select 1 from public.giveaway_winners where round_id = 'runde-68_test');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Testzeilen zurueckgerollt' || E'\n';

  raise notice '%', ausgabe;
end $$;
