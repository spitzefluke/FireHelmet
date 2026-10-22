/* ======================================================
   PRUEFUNG ZU 61-gluecksmine.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 61 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigabe, Epoche,
   Testspieler) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  sp      constant text := '61aa0000-0000-0000-0000-000000000001';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  m       public.mine_stand;
  ertrag  bigint := 0;
  i       integer;
  /* Seit 64 gibt es Bloecke statt Glueck je Schlag, und der Hangar
     ueber Stufe 5 kostet Raumerz statt Erz - das prueft dann
     64-raumerz.test.sql. */
  seit64  boolean := to_regprocedure('app.hangar_ausbauen_raumerz(text)') is not null;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'gluecksmine') where id = 'main';
    insert into public.players (firebase_uid, nickname, seite) values (sp, 'Bergmann', 'menschen');
    perform set_config('request.jwt.claims', '{"sub":"' || sp || '","role":"authenticated"}', true);

    /* T1: ohne Freigabe keine Mine. */
    ok := app.mine_hacken(5) ->> 'grund' = 'nicht-frei'
      and app.mine_stand_holen() ->> 'grund' = 'nicht-frei'
      and not exists (select 1 from public.mine_stand where firebase_uid = sp);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe gesperrt' || E'\n';

    /* T2: Hacken - hoechstens 20 je Aufruf, danach gedrosselt; Ertrag
       mindestens 2 je Schlag (Spitzhacke 1). */
    update public.site_config set data = jsonb_set(data, '{featureFlags,gluecksmine}', 'true'::jsonb) where id = 'main';
    erg := app.mine_hacken(50);
    ok := (erg ->> 'schlaege')::int = 20 and (erg ->> 'ertrag')::bigint >= 40 and (erg ->> 'erz')::bigint = (erg ->> 'ertrag')::bigint;
    erg := app.mine_hacken(50);
    ok := ok and (erg ->> 'schlaege')::int = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Hacken mit Drosselung' || E'\n';

    /* T3: Glueck - mit voller Lampe kommen Goldadern; 3 000 Schlaege. */
    update public.mine_stand set lampe = 10, hacke = 1, erz = 0 where firebase_uid = sp;
    for i in 1 .. 150 loop
      update public.mine_stand set hieb_at = now() - interval '10 seconds' where firebase_uid = sp;
      erg := app.mine_hacken(20);
    end loop;
    select * into m from public.mine_stand where firebase_uid = sp;
    ok := case when seit64 then m.goldadern > 0 and m.erz >= 3000 * 2
               else m.goldadern between 250 and 500 and m.edelsteine between 15 and 80 and m.erz >= 3000 * 2 end;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Goldadern und Edelsteine (Glueck)' || E'\n';

    /* T4: Bohrer und Lore - gedeckelt bei 2 + 2 x Lore Stunden. */
    update public.mine_stand set bohrer = 2, lore = 1, erz = 0, gesammelt_bis = now() - interval '10 hours' where firebase_uid = sp;
    erg := app.mine_abholen();
    ok := (erg ->> 'abgeholt')::bigint = 2 * 60 * 4 and (erg ->> 'im_bohrer')::bigint = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Bohrer foerdert, Lore deckelt' || E'\n';

    /* T5: Verbessern kostet Erz; zu wenig; voll. */
    update public.mine_stand set erz = 100, hacke = 1, lampe = 0 where firebase_uid = sp;
    erg := app.mine_verbessern('hacke');
    ok := (erg ->> 'hacke')::int = 2 and (erg ->> 'erz')::bigint = 50
      and app.mine_verbessern('lampe') ->> 'grund' = 'zu-wenig'
      and app.mine_verbessern('mars') ->> 'grund' = 'unbekannt';
    update public.mine_stand set hacke = 10 where firebase_uid = sp;
    ok := ok and app.mine_verbessern('hacke') ->> 'grund' = 'max';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Geraete verbessern' || E'\n';

    /* T6: Hangar - Stufe 6 erst nach Stufe 5 (Dublonen), dann mit Erz;
       Schiffssysteme; Wirkung beim Aufstellen. */
    update public.mine_stand set erz = 100000 where firebase_uid = sp;
    insert into public.hangar_einheiten (firebase_uid, typ, stufe_leben) values (sp, 'jaeger', 4);
    if seit64 then
      update public.mine_stand set erz = 98000 where firebase_uid = sp;
      ok := app.hangar_ausbauen_erz('leben') ->> 'grund' = 'nur-raumerz';
    else
      ok := app.hangar_ausbauen_erz('leben') ->> 'grund' = 'erst-dublonen';
      update public.hangar_einheiten set stufe_leben = 5 where firebase_uid = sp;
      erg := app.hangar_ausbauen_erz('leben');
      ok := ok and (erg -> 'einheit' ->> 'stufe_leben')::int = 6 and (erg ->> 'erz')::bigint = 98000;
      update public.hangar_einheiten set stufe_leben = 10 where firebase_uid = sp;
      ok := ok and app.hangar_ausbauen_erz('leben') ->> 'grund' = 'max';
    end if;
    erg := app.schiff_system_ausbauen('panzer');
    ok := ok and (erg -> 'einheit' ->> 'sys_panzer')::int = 1 and (erg ->> 'erz')::bigint = 98000 - 1500;
    erg := app.schiff_system_ausbauen('geschuetz');
    ok := ok and (erg ->> 'erz')::bigint = 98000 - 3000;
    ok := ok and (select f_leben from app.schlacht_ausruestung(sp, false)) = 1.04
      and (select f_schaden from app.schlacht_ausruestung(sp, false)) = 1.04;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Erz fuer Hangar 6-10 und Schiffssysteme' || E'\n';

    /* T7: Bestenliste oeffentlich; Konto loeschen raeumt die Mine ab. */
    perform set_config('request.jwt.claims', '', true);
    ok := exists (select 1 from app.mine_bestenliste() where firebase_uid = sp);
    delete from public.players where firebase_uid = sp;
    ok := ok and not exists (select 1 from public.mine_stand where firebase_uid = sp);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Bestenliste und Aufraeumen' || E'\n';

    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T8: Rechte. */
  ok := has_table_privilege('authenticated', 'public.mine_stand', 'update') = false
    and has_table_privilege('anon', 'public.mine_stand', 'select') = false
    and has_function_privilege('anon', 'public.mine_hacken(integer)', 'execute') = false
    and has_function_privilege('authenticated', 'public.mine_hacken(integer)', 'execute') = true
    and has_function_privilege('authenticated', 'app.mine_vorab(text)', 'execute') = false
    and has_function_privilege('anon', 'public.mine_bestenliste()', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
