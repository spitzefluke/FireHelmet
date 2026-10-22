/* ======================================================
   PRUEFUNG ZU 63-schlacht-design-v2.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 63 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck.

   Als Admin handelt der Test mit der Adresse, die app.is_admin()
   selbst nennt. Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '63aa0000-0000-0000-0000-0000000000ff';
  sp      constant text := '63aa0000-0000-0000-0000-0000000000a1';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  sid     bigint;
  w       record;
begin
  perform set_config('role', 'postgres', true);

  /* T1: drei neue Orte mit denselben Zahlen wie schlacht-orte.js. */
  ok := (select count(*) from public.schlacht_orte where ort_id in ('pulsar', 'friedhof', 'mondring')) = 3
    and (select ziel = 0.85 and spezial = 1.15 and ereignis_sek = 35 and ereignis_art = 'abwechselnd'
           from public.schlacht_orte where ort_id = 'pulsar')
    and (select wendig = 0.9 and heilung = 1.25 and schild = 1.1 and ereignis_sek = 45
           from public.schlacht_orte where ort_id = 'friedhof')
    and (select dauerfeuer = 0.9 and wendig = 1.2 and ereignis_sek = 55
           from public.schlacht_orte where ort_id = 'mondring');
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Drei neue Kampforte' || E'\n';

  /* T2: jede der sechs Parteien hat fuenf Typen, der neue an Stelle 5;
     der Grundtyp (Uebungsflotte) bleibt der erste. */
  ok := (select count(*) from public.schlacht_typen
          where partei in ('menschen', 'aliens', 'piraten', 'maschinen', 'kristall', 'geister')) = 30
    and not exists (select 1 from public.schlacht_parteien p
                     where p.partei in ('menschen', 'aliens', 'piraten', 'maschinen', 'kristall', 'geister')
                       and (select count(*) from public.schlacht_typen t where t.partei = p.partei) <> 5)
    and (select string_agg(typ, ',' order by partei) from public.schlacht_typen where ordnung = 5 and partei <> 'boss')
        = 'koenigin,leviathan,kathedrale,titan,schlachtschiff,rammer'
    and app.partei_grundtyp('menschen') = 'jaeger' and app.partei_grundtyp('geister') = 'irrlicht';
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Fuenf Typen je Partei' || E'\n';

  /* T3: Werte wie jeder andere Typ - Titan bei den Maschinen
     (Leben x1,2, Schaden x0,95). */
  select * into w from app.schlacht_werte('titan', 'maschinen', 1, 0, 2);
  ok := w.leben = round(260 * 1.2 * 1.2) and w.schaden = round(7 * 0.95 * 10) / 10.0 and w.spezial = 1.5;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Kampfwerte der neuen Typen' || E'\n';

  /* T4: Hangar - Menschen und Aliens duerfen ihren fuenften Typ
     waehlen, fremde Typen nicht. */
  ok := app.hangar_typ_passt('menschen', 'schlachtschiff') = true
    and app.hangar_typ_passt('aliens', 'koenigin') = true
    and app.hangar_typ_passt('aliens', 'schlachtschiff') = false
    and app.hangar_typ_passt('menschen', 'jaeger') = true
    and app.hangar_typ_passt('piraten', 'rammer') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Hangar kennt die neuen Typen' || E'\n';

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) || '{"schlachtOrte": true, "schlachtParteien": true}'::jsonb)
     where id = 'main';
    insert into public.players (firebase_uid, nickname, seite) values (ad, 'DesignAdmin', 'menschen'), (sp, 'Koenigin', 'aliens');

    /* T5: Schlacht am neuen Ort, Wahl des neuen Typs in der Sammelphase;
       im Hangar waehlt eine Alien-Spielerin die Koenigin. */
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);
    sid := app.admin_schlacht_starten(10, 'mondring', 'geister', 'kristall', 60);
    ok := (select ort from public.sternenschlacht where id = sid) = 'mondring';
    erg := app.schlacht_partei_waehlen('geister', 'leviathan');
    ok := ok and (erg ->> 'ok')::boolean = true
      and (select typ from public.schlacht_wahl where schlacht_id = sid and firebase_uid = ad) = 'leviathan'
      and app.schlacht_partei_waehlen('geister', 'kathedrale') ->> 'grund' = 'falscher-typ';
    perform app.admin_schlacht_beenden();
    perform set_config('request.jwt.claims', '{"sub":"' || sp || '","role":"authenticated"}', true);
    erg := app.hangar_typ_waehlen('koenigin');
    ok := ok and (erg ->> 'ok')::boolean = true
      and (select typ from public.hangar_einheiten where firebase_uid = sp) = 'koenigin'
      and app.hangar_typ_waehlen('titan') ->> 'grund' = 'falscher-typ';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Neuer Ort und neue Typen im Spiel' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Rechte - die Hilfsfunktion ist nicht von aussen aufrufbar. */
  ok := has_function_privilege('authenticated', 'app.hangar_typ_passt(text, text)', 'execute') = false
    and has_function_privilege('anon', 'app.hangar_typ_passt(text, text)', 'execute') = false
    and has_table_privilege('authenticated', 'public.schlacht_typen', 'insert') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
