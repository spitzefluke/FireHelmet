/* ======================================================
   PRUEFUNG ZU 27-event-titel.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 27 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   WICHTIG: "an alle" wird hier NUR als Nicht-Admin geprueft (muss
   abgewiesen werden). Ein erfolgreicher Aufruf wuerde live_event
   aendern und den Titel an alle Besucher schicken, die gerade auf
   der Seite sind. Der Weg "an alle" wird deshalb ueber einen direkt
   angelegten Grant geprueft (wie in 23/24).

   Alle Testzeilen (Texte beginnen mit "27TEST") werden am Ende
   wieder geloescht. Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '27aa0000-0000-0000-0000-00000000000a';
  admin   constant text := '27ad0000-0000-0000-0000-0000000000ad';
  gid     text := '27testgrant0001';
  gid2    text := '27testgrant0002';
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  tid     text;
  tid2    text;
  zeile   record;
begin
  perform set_config('role', 'postgres', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.event_titel where text like '27TEST%';
  delete from public.players where firebase_uid = uid;
  insert into public.players (firebase_uid, nickname) values (uid, 'Testpirat27');

  /* T1: ein Nicht-Admin kann weder an einen noch an alle vergeben. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  ok := true;
  begin
    perform app.admin_event_titel_an_spieler('27TEST Frech', 'gold', uid);
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  begin
    perform app.admin_event_titel_an_alle('27TEST Frech', 'gold');
    ok := false;
  exception when others then ok := ok and (sqlerrm like '%nur-admin%'); end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T1 Nicht-Admin kann keine Titel vergeben' || E'\n';

  /* T2: der Admin gibt einem Spieler gezielt einen Titel. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || admin || '","role":"authenticated","is_anonymous":false,"email":"y.n.trott@gmail.com"}', true);
  tid := app.admin_event_titel_an_spieler('27TEST Held', 'hacked', uid);
  select t.text, t.stil into zeile from public.event_titel t
    join public.spieler_event_titel s on s.titel_id = t.titel_id
   where s.firebase_uid = uid and t.titel_id = tid;
  ausgabe := ausgabe || case when zeile.text = '27TEST Held' and zeile.stil = 'hacked' then 'PASS' else 'FAIL' end
          || '  T2 Admin gibt einem Spieler den Titel "27TEST Held" (hacked)' || E'\n';

  /* T3: unbekannter Stil und zu langer Text werden abgelehnt. */
  ok := true;
  begin
    perform app.admin_event_titel_an_spieler('27TEST Stil', 'blinkblink', uid);
    ok := false;
  exception when check_violation then null; when others then ok := false; end;
  begin
    perform app.admin_event_titel_an_spieler('27TEST ' || repeat('x', 40), 'gold', uid);
    ok := false;
  exception when check_violation then null; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 unbekannter Stil und Text ueber 32 Zeichen abgelehnt' || E'\n';

  /* T4: "an alle" ueber einen direkt angelegten Grant: einmal 1, dann 0. */
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
  tid2 := 't27' || substr(md5(random()::text), 1, 12);
  insert into public.event_titel (titel_id, text, stil) values (tid2, '27TEST Eventheld', 'regenbogen');
  insert into public.live_grants (grant_id, art, wert, titel_id) values (gid, 'titel', 0, tid2);
  n := public.live_grant_einloesen(gid);
  ok := n = 1 and public.live_grant_einloesen(gid) = 0
        and exists (select 1 from public.spieler_event_titel where firebase_uid = uid and titel_id = tid2);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Titel-Grant: erstes Einloesen 1, zweites 0 (war: ' || n || ')' || E'\n';

  /* T5: angezeigt wird der neueste Titel. */
  update public.spieler_event_titel set erhalten_am = now() - interval '1 day'
   where firebase_uid = uid and titel_id = tid;
  select * into zeile from public.event_titel_je_spieler() where firebase_uid = uid;
  ausgabe := ausgabe || case when zeile.text = '27TEST Eventheld' and zeile.stil = 'regenbogen' then 'PASS' else 'FAIL' end
          || '  T5 der neueste Titel gewinnt (war: ' || coalesce(zeile.text, 'null') || ')' || E'\n';

  /* T6: anon darf die Liste lesen, aber nichts selbst eintragen. */
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.event_titel_je_spieler() where firebase_uid = uid;
    ok := n = 1;
  exception when others then ok := false; end;
  begin
    insert into public.spieler_event_titel (firebase_uid, titel_id) values ('27frech', tid2);
    ok := false;
  exception when others then null; end;
  perform set_config('role', 'postgres', true);
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T6 anon liest die Titel, kann aber keine eintragen' || E'\n';

  /* T7: Dublonen-Geschenke gehen weiterhin (Einloese-Funktion neu gesetzt). */
  insert into public.live_grants (grant_id, art, wert) values (gid2, 'dublonen', 50);
  n := public.live_grant_einloesen(gid2);
  ausgabe := ausgabe || case when n = 50 then 'PASS' else 'FAIL' end
          || '  T7 Dublonen-Grant gibt weiterhin 50 (war: ' || n || ')' || E'\n';

  /* T8: eine unbekannte Grant-Art bleibt verboten. */
  begin
    insert into public.live_grants (grant_id, art, wert) values ('27quatsch', 'quatsch', 1);
    ok := false;
  exception when check_violation then ok := true; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T8 unbekannte Grant-Art wird weiterhin abgelehnt' || E'\n';

  /* Aufraeumen */
  perform set_config('request.jwt.claims', '', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.event_titel where text like '27TEST%';
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gid2);
  delete from public.spieler_event_titel where firebase_uid = uid;
  delete from public.event_titel where text like '27TEST%';
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
