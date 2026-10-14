/* ======================================================
   PRUEFUNG ZU 44-mystery-gift-pass-xp.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 44 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Alles, was schreibt, steht in einem inneren Block, der mit einer
   Ausnahme endet - Postgres rollt ihn zurueck. live_event bleibt
   unberuehrt (jede Aenderung dort ginge per Realtime an alle).
   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '44aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  r       jsonb;
  n       integer;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Die Angebotsrechnung trifft etwa 5 % der Stunden und stimmt
     mit dem Browser ueberein (dort Math.imul(h, 2654435761) >>> 0). */
  select count(*) filter (where app.mystery_gift_im_angebot(to_timestamp(h * 3600)))
    into n from generate_series(480000::bigint, 489999::bigint) h;
  ok := n between 400 and 600
        and app.mystery_gift_stunde(to_timestamp(1800000000)) = 500000
        /* 500000 * 2654435761 mod 2^32 = 4266559264 -> nicht im Angebot */
        and app.mystery_gift_im_angebot(to_timestamp(1800000000)) = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Angebot in ' || n || ' von 10000 Stunden (erwartet ~500)' || E'\n';

  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  /* T2: Der Kauf richtet sich nach der Stunde, in der der Test
     laeuft (now() laesst sich nicht verstellen). Im Angebot: 100.000
     weg, Kauf vermerkt, zweiter Kauf derselben Stunde abgelehnt.
     Ausserhalb: abgelehnt, nichts abgezogen. */
  ok := false;
  begin
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'Testpirat44', 150000);
    r := app.mystery_gift_kaufen();
    if app.mystery_gift_im_angebot(now()) then
      ok := (r->>'ok')::boolean = true and (r->>'currency')::int = 50000;
      ok := ok and (select currency from public.players where firebase_uid = uid) = 50000
               and exists (select 1 from public.mystery_gift_kaeufe where firebase_uid = uid and preis = 100000);
      r := app.mystery_gift_kaufen();
      ok := ok and r->>'grund' = 'schon';
    else
      ok := r->>'grund' = 'nicht-im-angebot'
            and (select currency from public.players where firebase_uid = uid) = 150000;
    end if;
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 Kauf zieht 100.000 ab und nur einmal je Angebot (oder: ausserhalb abgelehnt)' || E'\n';

  /* T3: Zu wenig Dublonen - abgelehnt, nichts abgezogen. */
  ok := false;
  begin
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'Testpirat44', 99999);
    r := app.mystery_gift_kaufen();
    ok := r->>'grund' in ('zu-wenig', 'nicht-im-angebot')
          and (select currency from public.players where firebase_uid = uid) = 99999
          and not exists (select 1 from public.mystery_gift_kaeufe where firebase_uid = uid);
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 zu wenig Dublonen: kein Kauf, nichts abgezogen' || E'\n';

  /* T4: Nicht-Admin sieht keine Kaeufe und verteilt keine Pass-XP. */
  ok := true;
  begin perform app.admin_mystery_gift_kaeufe(); ok := false; exception when others then ok := ok and sqlerrm like '%nur-admin%'; end;
  begin perform app.admin_mystery_gift_erledigt(1, true); ok := false; exception when others then ok := ok and sqlerrm like '%nur-admin%'; end;
  begin perform app.admin_pass_xp_an_alle(100, 'season1'); ok := false; exception when others then ok := ok and sqlerrm like '%nur-admin%'; end;
  begin perform app.admin_pass_xp_an_spieler(uid, 100, 'season1'); ok := false; exception when others then ok := ok and sqlerrm like '%nur-admin%'; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Nicht-Admin: keine Kaufliste, kein Abhaken, keine Pass-XP' || E'\n';

  /* T5: Pass-XP-Grant einloesen - addiert in derselben Saison, nur
     einmal; andere Saison beginnt beim Betrag. */
  ok := false;
  begin
    insert into public.live_grants (grant_id, art, wert, pass_id) values ('44test-a', 'pass_xp', 300, 'season1');
    insert into public.player_progression (firebase_uid, pass_id, pass_xp) values (uid, 'season1', 1000);
    /* Aufruf und Pruefung in getrennten Anweisungen: im selben
       Ausdruck saehe die Abfrage noch den Stand VOR dem Aufruf. */
    ok := app.live_grant_einloesen('44test-a') = 300;
    ok := ok and (select pass_xp from public.player_progression where firebase_uid = uid) = 1300;
    ok := ok and app.live_grant_einloesen('44test-a') = 0;
    ok := ok and (select pass_xp from public.player_progression where firebase_uid = uid) = 1300;
    /* Ohne laufende Saison beginnt der Pass beim Betrag. (Andere
       Saisons als season1 laesst progression_pass_id_valid noch
       nicht zu.) */
    update public.player_progression set pass_id = null, pass_xp = 900 where firebase_uid = uid;
    insert into public.live_grants (grant_id, art, wert, pass_id) values ('44test-b', 'pass_xp', 70, 'season1');
    ok := ok and app.live_grant_einloesen('44test-b') = 70;
    ok := ok and (select pass_xp from public.player_progression where firebase_uid = uid) = 70
             and (select pass_id from public.player_progression where firebase_uid = uid) = 'season1';
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T5 Pass-XP-Grant: addiert einmal, ohne Saison beginnt der Pass beim Betrag' || E'\n';

  /* T6: Regeln - Pass-XP-Grant ohne Saison oder ueber 5000 abgelehnt;
     die alten Arten gehen weiter. */
  perform set_config('request.jwt.claims', '', true);
  ok := true;
  begin
    begin insert into public.live_grants (grant_id, art, wert) values ('44test-c', 'pass_xp', 100); ok := false;
    exception when check_violation then null; end;
    begin insert into public.live_grants (grant_id, art, wert, pass_id) values ('44test-d', 'pass_xp', 5001, 'season1'); ok := false;
    exception when check_violation then null; end;
    insert into public.live_grants (grant_id, art, wert) values ('44test-e', 'dublonen', 100);
    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then ok := false; ausgabe := ausgabe || '      (' || sqlerrm || ')' || E'\n'; end if;
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 Pass-XP-Grant braucht Saison und hoechstens 5000, Dublonen gehen weiter' || E'\n';

  /* T7: Rechte - anon darf nichts, Kauftabelle nicht direkt lesbar. */
  ok := has_function_privilege('anon', 'public.mystery_gift_kaufen()', 'execute') = false
        and has_function_privilege('authenticated', 'public.mystery_gift_kaufen()', 'execute') = true
        and has_function_privilege('anon', 'public.admin_pass_xp_an_alle(integer, text)', 'execute') = false
        and has_function_privilege('authenticated', 'app.pass_xp_gutschreiben(text, integer, text)', 'execute') = false
        and has_table_privilege('authenticated', 'public.mystery_gift_kaeufe', 'select') = false
        and has_table_privilege('anon', 'public.mystery_gift_kaeufe', 'select') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T7 Rechte: Kauf nur angemeldet, Kaufliste nicht direkt lesbar' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
