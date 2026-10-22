/* ======================================================
   PRUEFUNG ZU 64-raumerz.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 64 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigabe, Epoche,
   Testspieler) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: acht Zeilen, alle "PASS".
====================================================== */
do $$
declare
  sp      constant text := '64aa0000-0000-0000-0000-000000000001';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  m       public.mine_stand;
  w       record;
  i       integer;
  raum    integer := 0;
begin
  perform set_config('role', 'postgres', true);

  /* T1: Raumerz-Bloecke kommen genau mit 1/30 - 30 000 Wuerfe,
     erwartet 1 000 (Streuung etwa 31). */
  for i in 1 .. 30000 loop
    if app.mine_neuer_block(0) = 'raumerz' then raum := raum + 1; end if;
  end loop;
  ok := raum between 880 and 1120;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Raumerz-Block mit 1/30 (' || raum || ' von 30000)' || E'\n';

  begin
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) || '{"gluecksmine": true}'::jsonb) where id = 'main';
    insert into public.players (firebase_uid, nickname, seite, currency) values (sp, 'Raumfahrer', 'menschen', 5000);
    perform set_config('request.jwt.claims', '{"sub":"' || sp || '","role":"authenticated"}', true);

    /* T2: Der erste Block ist Stein mit 8 Leben; fuenf Hiebe mit
       Spitzhacke 1 lassen 3 uebrig und bringen 10 Erz. */
    erg := app.mine_stand_holen();
    ok := erg -> 'block' ->> 'art' = 'stein' and (erg -> 'block' ->> 'leben')::int = 8 and (erg ->> 'raumerz')::int = 0;
    erg := app.mine_hacken(5);
    ok := ok and (erg -> 'block' ->> 'leben')::int = 3 and (erg ->> 'ertrag')::bigint = 10
      and jsonb_array_length(erg -> 'gebrochen') = 0;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Block mit Leben' || E'\n';

    /* T3: Zerbrechen bringt die Beute, dann kommt ein neuer Block mit
       vollem Leben - Kristall: 2 x 3 + 400 x 3 Erz; Raumerz: 1. */
    update public.mine_stand set block_art = 'kristall', block_leben = 1, block_max = 30, hacke = 3, erz = 0,
           hieb_at = now() - interval '10 seconds' where firebase_uid = sp;
    erg := app.mine_hacken(1);
    ok := (erg ->> 'ertrag')::bigint = 1206 and (erg ->> 'edelsteine')::int = 1
      and erg -> 'gebrochen' = '["kristall"]'::jsonb and (erg ->> 'bloecke_gesamt')::int = 1
      and (erg -> 'block' ->> 'leben')::int = (erg -> 'block' ->> 'max')::int
      and (erg -> 'block' ->> 'max')::int = app.mine_block_leben(erg -> 'block' ->> 'art');
    update public.mine_stand set block_art = 'raumerz', block_leben = 2, block_max = 45,
           hieb_at = now() - interval '10 seconds' where firebase_uid = sp;
    erg := app.mine_hacken(1);
    ok := ok and (erg ->> 'raumerz_neu')::int = 1 and (erg ->> 'raumerz')::int = 1 and (erg ->> 'raumerz_gesamt')::int = 1;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Beute beim Zerbrechen' || E'\n';

    /* T4: Mit Freigabe nur noch Raumerz im Hangar - Dublonen und Erz
       lehnen ab, zu wenig Raumerz wird abgelehnt. */
    update public.mine_stand set raumerz = 0, erz = 100000 where firebase_uid = sp;
    ok := app.hangar_ausbauen('leben') ->> 'grund' = 'nur-raumerz'
      and app.hangar_ausbauen_erz('leben') ->> 'grund' = 'nur-raumerz';
    erg := app.hangar_ausbauen_raumerz('leben');
    ok := ok and erg ->> 'grund' = 'zu-wenig-raumerz' and (erg ->> 'preis')::int = 1
      and (select currency from public.players where firebase_uid = sp) = 5000;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Hangar nur mit Raumerz' || E'\n';

    /* T5: Ausbauen mit Raumerz bis Stufe 15 - Preise 1 und 40, dann voll. */
    update public.mine_stand set raumerz = 300 where firebase_uid = sp;
    erg := app.hangar_ausbauen_raumerz('leben');
    ok := (erg -> 'einheit' ->> 'stufe_leben')::int = 1 and (erg ->> 'raumerz')::int = 299;
    update public.hangar_einheiten set stufe_schaden = 14 where firebase_uid = sp;
    erg := app.hangar_ausbauen_raumerz('schaden');
    ok := ok and (erg -> 'einheit' ->> 'stufe_schaden')::int = 15 and (erg ->> 'preis')::int = 40 and (erg ->> 'raumerz')::int = 259
      and app.hangar_ausbauen_raumerz('schaden') ->> 'grund' = 'max'
      and app.hangar_ausbauen_raumerz('mut') ->> 'grund' = 'falscher-wert'
      and (select sum(app.hangar_raumerz_preis(s)) from generate_series(1, 15) s) = 218
      and app.hangar_raumerz_preis(16) is null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Raumerz bis Stufe 15' || E'\n';

    /* T6: Ohne Freigabe bleibt es bei Dublonen bis Stufe 5. */
    update public.site_config set data = jsonb_set(data, '{featureFlags,gluecksmine}', 'false'::jsonb) where id = 'main';
    update public.hangar_einheiten set stufe_spezial = 0 where firebase_uid = sp;
    erg := app.hangar_ausbauen('spezial');
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'currency')::bigint = 4000
      and app.hangar_ausbauen_raumerz('spezial') ->> 'grund' = 'nicht-frei';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Ohne Freigabe Dublonen' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T7: Stufe 15 in der Schlacht - Leben und Schaden x4, Spezial x4,75. */
  select * into w from app.schlacht_werte('jaeger', 'menschen', 15, 15, 15);
  ok := w.leben = round(80 * 4 * 1.25) and w.schaden = round(14 * 4 * 0.85 * 10) / 10.0 and w.spezial = 4.75;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T7 Stufe 15 im Kampf' || E'\n';

  /* T8: Rechte. */
  ok := has_function_privilege('authenticated', 'app.mine_neuer_block(integer)', 'execute') = false
    and has_function_privilege('authenticated', 'app.hangar_raumerz_preis(integer)', 'execute') = false
    and has_function_privilege('anon', 'public.hangar_ausbauen_raumerz(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.hangar_ausbauen_raumerz(text)', 'execute') = true
    and has_table_privilege('authenticated', 'public.mine_stand', 'update') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T8 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
