/* ======================================================
   PRUEFUNG ZU 53-piratenpass-2.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 53 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (auch die Freigabe in
   site_config) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: zehn Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '53aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  geld    integer;
  abgelehnt boolean;
begin
  perform set_config('role', 'postgres', true);

  begin
    /* Ausgangslage: keine Freigabe, Spieler mitten in Pass 1 (Stufe 30). */
    insert into public.site_config (id, data) values ('main', '{}'::jsonb)
    on conflict (id) do update set data = public.site_config.data - 'pass2Ab';
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'PassZweiTest', 100);
    insert into public.player_progression (firebase_uid) values (uid);
    update public.player_progression set pass_id = 'season1', pass_xp = 46500 where firebase_uid = uid;
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

    /* T1: ohne Freigabe ist Pass 2 zu. */
    erg := app.pass_stand('season2');
    ok := (erg ->> 'offen')::boolean = false
      and app.pass_saison_aktuell() = 'season1'
      and app.pass_belohnung_holen('season2', 1, 'matrose') ->> 'grund' = 'keine-saison'
      and app.pass_kapitaen_kaufen('season2') ->> 'grund' = 'keine-saison';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe geschlossen' || E'\n';

    /* T2: Freigabe vor einer Stunde - offen, 100 Belohnungen. */
    update public.site_config set data = data || jsonb_build_object('pass2Ab', (now() - interval '1 hour')::text)
     where id = 'main';
    erg := app.pass_stand('season2');
    ok := (erg ->> 'offen')::boolean = true and app.pass_saison_aktuell() = 'season2'
      and jsonb_array_length(erg -> 'belohnungen') = 100 and (erg ->> 'pass_xp')::int = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Freigabe oeffnet die Saison' || E'\n';

    /* T3: Saisonwechsel merkt Stufe 30, ein eingeschmuggelter Wert zaehlt nicht. */
    update public.player_progression set pass_id = 'season2', pass_xp = 0 where firebase_uid = uid;
    update public.player_progression set fruehere_pass_stufen = 499 where firebase_uid = uid;
    ok := (select fruehere_pass_stufen from public.player_progression where firebase_uid = uid) = 30;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Stufe aus Pass 1 bleibt als Skillpunkte' || E'\n';

    /* T4: als Spieler (RLS) - zurueck auf season1 oder mit zu viel XP geht nicht. */
    perform set_config('role', 'authenticated', true);
    /* Gegenprobe: ein normaler Schritt in derselben Saison geht durch -
       sonst bestuende T4 auch, wenn nur ein Tabellenrecht fehlt. */
    update public.player_progression set pass_xp = 100 where firebase_uid = uid;
    update public.player_progression set pass_xp = 0 where firebase_uid = uid;
    ok := (select pass_xp from public.player_progression where firebase_uid = uid) = 0;
    abgelehnt := false;
    begin
      update public.player_progression set pass_id = 'season1', pass_xp = 46500 where firebase_uid = uid;
    exception when others then abgelehnt := true;
    end;
    ok := ok and abgelehnt = true;
    abgelehnt := false;
    begin
      update public.player_progression set pass_id = null, pass_xp = 0 where firebase_uid = uid;
      update public.player_progression set pass_id = 'season2', pass_xp = 600 where firebase_uid = uid;
    exception when others then abgelehnt := true;
    end;
    ok := ok and abgelehnt = true;
    perform set_config('role', 'postgres', true);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Wechsel nur in die laufende Saison' || E'\n';

    /* T5: Abholen - erst ab der Stufe, nur einmal, Kapitaen gesperrt. */
    ok := app.pass_belohnung_holen('season2', 3, 'matrose') ->> 'grund' = 'zu-frueh';
    update public.player_progression set pass_xp = 600 where firebase_uid = uid;   -- genau Stufe 3
    erg := app.pass_belohnung_holen('season2', 3, 'matrose');
    select currency into geld from public.players where firebase_uid = uid;
    ok := ok and (erg ->> 'ok')::boolean = true and (erg ->> 'dublonen')::int = 52 and geld = 152
      and app.pass_belohnung_holen('season2', 3, 'matrose') ->> 'grund' = 'schon'
      and app.pass_belohnung_holen('season2', 4, 'matrose') ->> 'grund' = 'zu-frueh'
      and app.pass_belohnung_holen('season2', 3, 'kapitaen') ->> 'grund' = 'kein-kapitaen';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Abholen ab Stufe, nur einmal' || E'\n';

    /* T6: Kapitaenspass - zu wenig, dann gekauft, nicht doppelt. */
    ok := app.pass_kapitaen_kaufen('season2') ->> 'grund' = 'zu-wenig';
    update public.players set currency = 2000 where firebase_uid = uid;
    erg := app.pass_kapitaen_kaufen('season2');
    select currency into geld from public.players where firebase_uid = uid;
    ok := ok and (erg ->> 'ok')::boolean = true and geld = 1050
      and app.pass_kapitaen_kaufen('season2') ->> 'grund' = 'schon'
      and (app.pass_stand('season2') ->> 'kapitaen')::boolean = true;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Kapitaenspass fuer 950' || E'\n';

    /* T7: Kapitaen Stufe 3 gibt einen Skillpunkt. */
    erg := app.pass_belohnung_holen('season2', 3, 'kapitaen');
    ok := (erg ->> 'skillpunkte')::int = 1
      and (select bonus_skill_points from public.player_progression where firebase_uid = uid) = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Skillpunkt aus der Kapitaensspur' || E'\n';

    /* T8: Endbelohnung - Avatar, Titel und 1000 Dublonen. */
    update public.player_progression set pass_xp = 127500 where firebase_uid = uid;
    erg := app.pass_belohnung_holen('season2', 50, 'kapitaen');
    select currency into geld from public.players where firebase_uid = uid;
    ok := erg ->> 'avatar_id' = 'pass-s2-schwarze-witwe' and erg -> 'titel' ->> 'text' = 'Schrecken der Meere'
      and geld = 2050
      and exists (select 1 from public.spieler_event_titel where firebase_uid = uid and titel_id = 'pass2_schrecken');
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Endbelohnung Stufe 50' || E'\n';

    /* T9: Alles einsammeln - der Rest bis Stufe 50 auf einmal, danach nichts mehr. */
    erg := app.pass_alle_holen('season2');
    ok := (erg ->> 'anzahl')::int = 97
      and (select count(*) from public.pass_belohnungen_geholt where firebase_uid = uid) = 100
      and jsonb_array_length(erg -> 'titel') = 3
      and (app.pass_alle_holen('season2') ->> 'anzahl')::int = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T9 Alles einsammeln' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T9: Rechte. */
  ok := has_function_privilege('anon', 'public.pass_belohnung_holen(text, integer, text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.pass_belohnung_holen(text, integer, text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.pass_saison_offen(text)', 'execute') = false
    and has_table_privilege('authenticated', 'public.pass_belohnungen_geholt', 'insert') = false
    and has_table_privilege('authenticated', 'public.pass_kapitaen', 'insert') = false
    and has_table_privilege('authenticated', 'public.pass_belohnungen', 'select') = false
    and has_function_privilege('anon', 'public.pass_alle_holen(text)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T10 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
