/* ======================================================
   PRUEFUNG ZU 54-diamanten-tanz.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 53 und 54 eingespielt wurden.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck.
   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst kennt.
   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '54aa0000-0000-0000-0000-00000000000a';
  ad      constant text := '54aa0000-0000-0000-0000-0000000000ad';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  abgelehnt boolean;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.site_config (id, data) values ('main', '{}'::jsonb)
    on conflict (id) do nothing;
    update public.site_config set data = data || jsonb_build_object('pass2Ab', (now() - interval '1 hour')::text)
     where id = 'main';
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'TanzTest', 5000);
    insert into public.player_progression (firebase_uid, pass_id, pass_xp) values (uid, 'season2', 0);
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

    /* T1: Kapitaenspass kostet Diamanten, nicht Dublonen. */
    erg := app.pass_kapitaen_kaufen('season2');
    ok := erg ->> 'grund' = 'zu-wenig'
      and (select currency from public.players where firebase_uid = uid) = 5000
      and (app.pass_stand('season2') ->> 'preis')::int = 100
      and app.pass_stand('season2') ->> 'waehrung' = 'diamanten';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Kapitaenspass verlangt Diamanten' || E'\n';

    /* T2: Spieler kann sich keine Diamanten geben - weder per RPC noch per Tabelle. */
    abgelehnt := false;
    begin
      perform app.admin_diamanten_geben(uid, 500);
    exception when others then abgelehnt := sqlerrm = 'nur-admin';
    end;
    ok := abgelehnt = true
      and has_table_privilege('authenticated', 'public.diamanten_konto', 'insert') = false
      and has_table_privilege('authenticated', 'public.diamanten_konto', 'update') = false;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Diamanten nur vom Admin' || E'\n';

    /* T3: Admin gibt 150, Spieler kauft fuer 100, bleibt 50; nicht doppelt. */
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    ok := app.admin_diamanten_geben(uid, 150) = 150;
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    erg := app.pass_kapitaen_kaufen('season2');
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'diamanten')::int = 50
      and (select stand from public.diamanten_konto where firebase_uid = uid) = 50
      and (select currency from public.players where firebase_uid = uid) = 5000
      and app.pass_kapitaen_kaufen('season2') ->> 'grund' = 'schon'
      and (select count(*) from public.diamanten_buchungen where firebase_uid = uid) = 2;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Kauf zieht 100 Diamanten ab' || E'\n';

    /* T4: Abzug unter 0 landet bei 0. */
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    ok := app.admin_diamanten_geben(uid, -500) = 0;
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Stand faellt nie unter 0' || E'\n';

    /* T5: Stufe 50 Kapitaen ist der Tanz - nur ueber das Formular, erst ab Stufe 50. */
    ok := app.pass_tanz_holen('season2', 'EpicPirat', 'Orange Justice') ->> 'grund' = 'zu-frueh';
    update public.player_progression set pass_xp = 127500 where firebase_uid = uid;
    ok := ok and app.pass_belohnung_holen('season2', 50, 'kapitaen') ->> 'grund' = 'tanz-formular'
      and app.pass_tanz_holen('season2', 'ab', 'Orange Justice') ->> 'grund' = 'epic-name'
      and app.pass_tanz_holen('season2', 'EpicPirat', 'x') ->> 'grund' = 'tanz-name';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Tanz nur per Formular ab Stufe 50' || E'\n';

    /* T6: Tanz anfordern, nicht doppelt; "Alles einsammeln" laesst ihn liegen. */
    erg := app.pass_alle_holen('season2');
    ok := not exists (select 1 from public.pass_belohnungen_geholt
                       where firebase_uid = uid and stufe = 50 and spur = 'kapitaen')
      and (erg ->> 'anzahl')::int = 99;
    erg := app.pass_tanz_holen('season2', '  EpicPirat ', 'Orange Justice');
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'vbucks')::int = 500
      and (select epic_name from public.pass_tanz_zusagen where firebase_uid = uid) = 'EpicPirat'
      and app.pass_tanz_holen('season2', 'EpicPirat', 'Orange Justice') ->> 'grund' = 'schon'
      and app.pass_stand('season2') -> 'tanz' ->> 'tanz' = 'Orange Justice';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Tanz-Zusage einmal, mit Epic-Name' || E'\n';

    /* T7: Nur der Admin sieht die Liste; abhaken loescht den Epic-Namen. */
    abgelehnt := false;
    begin
      perform app.admin_tanz_zusagen();
    exception when others then abgelehnt := sqlerrm = 'nur-admin';
    end;
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    /* Aufruf und Pruefung in getrennten Anweisungen: im selben
       Ausdruck saehe die Abfrage noch den Stand VOR dem Aufruf. */
    ok := abgelehnt = true
      and jsonb_array_length(app.admin_tanz_zusagen()) >= 1
      and app.admin_tanz_erledigt(uid, 'season2') = true;
    ok := ok and (select epic_name from public.pass_tanz_zusagen where firebase_uid = uid) is null
      and (select erledigt_am from public.pass_tanz_zusagen where firebase_uid = uid) is not null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Admin-Liste, Epic-Name nach Abhaken weg' || E'\n';

    /* T8: Spielerzeile weg - Diamanten, Zusage und Abgeholtes mit. */
    delete from public.players where firebase_uid = uid;
    ok := not exists (select 1 from public.diamanten_konto where firebase_uid = uid)
      and not exists (select 1 from public.pass_tanz_zusagen where firebase_uid = uid)
      and not exists (select 1 from public.pass_belohnungen_geholt where firebase_uid = uid)
      and not exists (select 1 from public.diamanten_buchungen where firebase_uid = uid);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Konto loeschen raeumt mit auf' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
