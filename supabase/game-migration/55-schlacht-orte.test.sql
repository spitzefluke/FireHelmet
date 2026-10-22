/* ======================================================
   PRUEFUNG ZU 55-schlacht-orte.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 55 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Epoche, Seiten,
   Testspieler, die Probe-Schlacht) steht in einem inneren Block, der
   mit einer Ausnahme endet - Postgres rollt ihn zurueck. Eine
   laufende echte Schlacht wird dafuer nur innerhalb dieses Blocks
   beendet.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt. Jeder Ort wird gezielt gesetzt - kein Zufall.
   Erwartet: sieben Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '55aa0000-0000-0000-0000-0000000000ff';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  s       public.sternenschlacht;
  l0      numeric;
  wert1   numeric;
  sk      numeric;
  abgelehnt boolean;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    /* Seit 56 lost der Start nur mit Freigabe aus - fuer T1 an (vor 56 wirkungslos). */
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb)), '{featureFlags,schlachtOrte}', 'true'::jsonb) where id = 'main';
    insert into public.players (firebase_uid, nickname, seite) values (ad, 'OrtAdmin', 'menschen');
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    perform app.hangar_typ_waehlen('jaeger');

    /* T1: sieben Orte; Start mit Wunschort, unbekannter Ort abgelehnt,
       ohne Wunsch wird ausgelost. */
    abgelehnt := false;
    begin
      perform app.admin_schlacht_starten(10, 'mars');
    exception when others then abgelehnt := sqlerrm = 'ort-unbekannt';
    end;
    sid := app.admin_schlacht_starten(10, 'nebel');
    select * into s from public.sternenschlacht where id = sid;
    ok := abgelehnt = true and s.ort = 'nebel' and (select count(*) from public.schlacht_orte) >= 7;   -- 63: + 3
    perform app.admin_schlacht_beenden();
    sid := app.admin_schlacht_starten(10);
    ok := ok and (select ort from public.sternenschlacht where id = sid) in (select ort_id from public.schlacht_orte);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Ort: gewaehlt, ausgelost, unbekannt abgelehnt' || E'\n';

    /* T2: Zielschuss - Nebel 0,7; Asteroiden 1,25 fuer den wendigen Jaeger. */
    update public.sternenschlacht set ort = 'wurmloch' where id = sid;
    wert1 := (app.schlacht_ziel('ki-aliens-1') ->> 'wert')::numeric;
    update public.sternenschlacht_einheiten set ziel_at = null where schlacht_id = sid and firebase_uid = ad;
    update public.sternenschlacht set ort = 'nebel' where id = sid;
    ok := abs((app.schlacht_ziel('ki-aliens-1') ->> 'wert')::numeric - round(wert1 * 0.7, 1)) <= 0.1;
    update public.sternenschlacht_einheiten set ziel_at = null where schlacht_id = sid and firebase_uid = ad;
    update public.sternenschlacht set ort = 'asteroiden' where id = sid;
    /* Fokus zaehlt nur ANDERE Spieler - der eigene Schuss eben aendert nichts. */
    ok := ok and abs((app.schlacht_ziel('ki-aliens-1') ->> 'wert')::numeric - round(wert1 * 1.25, 1)) <= 0.1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Zielschuss nach Ort (Nebel, Asteroiden)' || E'\n';

    /* T3: Ereignis 'beide' (Sonne, alle 45 s 3 %): nach 100 s zwei
       Eruptionen. Ohne Dauerfeuer (skala 0) und ohne Aktionen. */
    delete from public.sternenschlacht_aktionen where schlacht_id = sid;
    select skala into sk from public.sternenschlacht where id = sid;
    update public.sternenschlacht set ort = 'sonne', skala = 0, runde = 1, runde_at = now() - interval '100 seconds' where id = sid;
    select * into s from public.sternenschlacht where id = sid;
    l0 := s.leben0_aliens;
    ok := abs(app.schlacht_leben(sid, 'aliens', now()) - (l0 - 2 * 0.03 * l0)) < 0.01;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Ereignis trifft beide Seiten' || E'\n';

    /* T4: 'abwechselnd' (Nebel, alle 30 s 1,5 %): nach 100 s drei
       Blitze. Ist k + Runde gerade, trifft der k-te die Menschen:
       in Runde 1 also k=1 und k=3 die Menschen, k=2 die Aliens; in
       Runde 2 umgekehrt. Die Menschen regenerieren 0,02 % je Sekunde -
       gedeckelt beim Startleben. */
    update public.sternenschlacht set ort = 'nebel' where id = sid;
    ok := abs(app.schlacht_leben(sid, 'aliens', now()) - (l0 - 1 * 0.015 * l0)) < 0.01
      and abs(app.schlacht_leben(sid, 'menschen', now())
              - least(s.leben0_menschen, s.leben0_menschen * (1 - 2 * 0.015 + 0.0002 * 100))) < 0.01;
    update public.sternenschlacht set runde = 2 where id = sid;
    ok := ok and abs(app.schlacht_leben(sid, 'aliens', now()) - (l0 - 2 * 0.015 * l0)) < 0.01;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Ereignis abwechselnd nach Rundennummer' || E'\n';

    /* T5: Dauerfeuer - Schwarzes Loch 1,25-fach. */
    update public.sternenschlacht set ort = 'wurmloch', skala = sk, runde_at = now() - interval '20 seconds' where id = sid;
    wert1 := l0 - app.schlacht_leben(sid, 'aliens', now());
    update public.sternenschlacht set ort = 'schwarzes_loch', runde_at = now() - interval '20 seconds' where id = sid;
    /* 20 s < 60 s: noch kein Ereignis. */
    ok := wert1 > 0 and abs((l0 - app.schlacht_leben(sid, 'aliens', now())) - wert1 * 1.25) < 0.01;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Dauerfeuer nach Ort' || E'\n';

    /* T6: Spezial - im Wurmloch laedt der Jaeger nach 30 statt 60 s;
       auf der Station heilt der Traeger 1,5-fach. */
    update public.sternenschlacht set ort = 'wurmloch', runde_at = now() - interval '40 seconds' where id = sid;
    update public.sternenschlacht_einheiten set spezial_at = null where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_spezial('ki-aliens-1');
    ok := (erg ->> 'ok')::boolean = true;
    update public.sternenschlacht set ort = 'station' where id = sid;
    update public.sternenschlacht_einheiten set spezial_at = null, typ = 'traeger', spezial = 1 where schlacht_id = sid and firebase_uid = ad;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'grund' = 'laedt';
    update public.sternenschlacht set runde_at = now() - interval '61 seconds' where id = sid;
    erg := app.schlacht_spezial();
    ok := ok and erg ->> 'wirkung' = 'heilung' and (erg ->> 'wert')::numeric = 600;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Spezial: Ladezeit und Heilung nach Ort' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T7: Rechte - Orte lesbar, nicht schreibbar; Ort-Hilfe nur intern. */
  ok := has_table_privilege('anon', 'public.schlacht_orte', 'select') = true
    and has_table_privilege('authenticated', 'public.schlacht_orte', 'insert') = false
    and has_table_privilege('authenticated', 'public.schlacht_orte', 'update') = false
    and has_function_privilege('authenticated', 'app.schlacht_ort(bigint)', 'execute') = false
    and has_function_privilege('anon', (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'admin_schlacht_starten'), 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
