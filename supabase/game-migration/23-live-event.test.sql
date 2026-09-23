/* ======================================================
   PRUEFUNG ZU 23-live-event.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 23 eingespielt wurde.
   Ein einziger DO-Block (Begruendung siehe 18-...test.sql).

   Bewusst OHNE Admin-Simulation: der Grant wird zum Testen direkt
   angelegt (nicht ueber die Admin-RPC), damit die Pruefung auch
   im SQL-Editor laeuft, wo app.is_admin() falsch ist. Genau das
   testet T4: ein Nicht-Admin darf NICHT ausloesen.

   Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '23aa0000-0000-0000-0000-00000000000a';
  gid     text := '23testgrant0001';
  gida    text := '23testgrant0002';
  ausgabe text := E'\n';
  n       integer;
  ok      boolean;
  stand   integer;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gida);
  delete from public.players where firebase_uid = uid;

  /* T1: die Singleton-Zeile ist da. */
  select count(*) into n from public.live_event where id = 1;
  ausgabe := ausgabe || case when n = 1 then 'PASS' else 'FAIL' end
          || '  T1 live_event-Zeile (id=1) existiert' || E'\n';

  /* T2: eine kaputte Farbe wird abgelehnt. */
  begin
    update public.live_event set message_color = 'javascript:alert(1)' where id = 1;
    ok := false;
  exception when check_violation then ok := true; when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T2 unsinnige message_color wird abgelehnt' || E'\n';

  /* T3: eine gueltige Farbe geht durch. */
  begin
    update public.live_event set message_color = '#ff8800' where id = 1;
    ok := true;
  exception when others then ok := false; end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T3 gueltige Farbe #ff8800 wird angenommen' || E'\n';

  /* T4: ein Nicht-Admin darf keinen Grant ausloesen. */
  begin
    perform app.live_grant_ausloesen('dublonen', 100, null);
    ok := false;
  exception when others then
    ok := (sqlerrm like '%nur-admin%');
  end;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end
          || '  T4 Nicht-Admin kann keinen Grant ausloesen' || E'\n';

  /* --- Dublonen-Grant direkt anlegen und einloesen --- */
  insert into public.players (firebase_uid) values (uid);
  insert into public.live_grants (grant_id, art, wert) values (gid, 'dublonen', 250);

  n := public.live_grant_einloesen(gid);
  ausgabe := ausgabe || case when n = 250 then 'PASS' else 'FAIL' end
          || '  T5 Dublonen-Grant gibt 250 (war: ' || n || ')' || E'\n';

  select currency into stand from public.players where firebase_uid = uid;
  ausgabe := ausgabe || case when stand = 250 then 'PASS' else 'FAIL' end
          || '  T6 Kontostand ist um 250 gestiegen (war: ' || coalesce(stand,-1) || ')' || E'\n';

  /* T7: zweites Einloesen gibt 0. */
  n := public.live_grant_einloesen(gid);
  ausgabe := ausgabe || case when n = 0 then 'PASS' else 'FAIL' end
          || '  T7 zweites Einloesen gibt 0 (war: ' || n || ')' || E'\n';

  /* --- Avatar-Grant --- */
  insert into public.live_grants (grant_id, art, avatar_id) values (gida, 'avatar', 'meisterdetektiv');
  n := public.live_grant_einloesen(gida);
  select count(*) into stand from public.players
   where firebase_uid = uid and 'meisterdetektiv' = any(unlocked_avatars);
  ausgabe := ausgabe || case when n = 1 and stand = 1 then 'PASS' else 'FAIL' end
          || '  T8 Avatar-Grant schaltet den Avatar frei (war: ' || n || ')' || E'\n';

  /* T9: unbekannter Grant gibt -1. */
  n := public.live_grant_einloesen('gibtsnicht');
  ausgabe := ausgabe || case when n = -1 then 'PASS' else 'FAIL' end
          || '  T9 unbekannter Grant gibt -1 (war: ' || n || ')' || E'\n';

  /* Aufraeumen */
  perform set_config('request.jwt.claims', '', true);
  update public.live_event set message_color = null, message = null where id = 1;
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gida);
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.live_grant_einloesungen where firebase_uid = uid;
  delete from public.live_grants where grant_id in (gid, gida);
  delete from public.players where firebase_uid = uid;
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
