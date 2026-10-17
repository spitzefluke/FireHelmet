/* ======================================================
   PRUEFUNG ZU 58-hangar-ausruestung.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 58 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigabe, Epoche,
   Testspieler) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  sp      constant text := '58aa0000-0000-0000-0000-000000000001';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.live_event set jahr_1720_ab = now() - interval '2 hours', jahr_2100_ab = now() - interval '1 hour' where id = 1;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'hangarAusruestung') where id = 'main';
    insert into public.players (firebase_uid, nickname, seite, currency) values (sp, 'Ausruester', 'menschen', 40000);
    perform set_config('request.jwt.claims', '{"sub":"' || sp || '","role":"authenticated"}', true);

    /* T1: ohne Freigabe kein Kauf, kein Anlegen. */
    ok := app.hangar_teil_kaufen('plasma') ->> 'grund' = 'nicht-frei'
      and app.hangar_teil_anlegen('waffe', 'plasma') ->> 'grund' = 'nicht-frei'
      and (select currency from public.players where firebase_uid = sp) = 40000;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe gesperrt' || E'\n';

    /* T2: Kauf zieht ab und legt gleich an; doppelt nicht. */
    update public.site_config set data = jsonb_set(data, '{featureFlags,hangarAusruestung}', 'true'::jsonb) where id = 'main';
    erg := app.hangar_teil_kaufen('plasma');
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'currency')::int = 25000
      and erg -> 'ausruestung' ->> 'waffe' = 'plasma'
      and app.hangar_teil_kaufen('plasma') ->> 'grund' = 'schon'
      and app.hangar_teil_kaufen('mars') ->> 'grund' = 'unbekannt';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Kauf mit Dublonen, gleich angelegt' || E'\n';

    /* T3: zu wenig Geld - nichts gekauft. */
    erg := app.hangar_teil_kaufen('tesla');
    ok := erg ->> 'grund' = 'zu-wenig' and (select currency from public.players where firebase_uid = sp) = 25000
      and not exists (select 1 from public.hangar_besitz where firebase_uid = sp and teil = 'tesla');
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 zu wenig Dublonen' || E'\n';

    /* T4: Module fuellen beide Plaetze; Anlegen prueft Besitz, Platz,
       Doppelung; Ablegen mit null. */
    perform app.hangar_teil_kaufen('schild');
    erg := app.hangar_teil_kaufen('nachbrenner');
    ok := erg -> 'ausruestung' ->> 'modul1' = 'schild' and erg -> 'ausruestung' ->> 'modul2' = 'nachbrenner'
      and app.hangar_teil_anlegen('modul1', 'reaktor') ->> 'grund' = 'nicht-gekauft'
      and app.hangar_teil_anlegen('waffe', 'schild') ->> 'grund' = 'falscher-platz'
      and app.hangar_teil_anlegen('modul1', 'nachbrenner') ->> 'grund' = 'doppelt';
    erg := app.hangar_teil_anlegen('modul2', null);
    ok := ok and (erg ->> 'ok')::boolean = true and erg -> 'ausruestung' ->> 'modul2' is null;
    erg := app.hangar_teil_anlegen('modul1', 'nachbrenner');
    ok := ok and erg -> 'ausruestung' ->> 'modul1' = 'nachbrenner';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Module anlegen und ablegen' || E'\n';

    /* T5: Rang aus Erfahrung, Stand lesbar. */
    insert into public.schiff_rang (firebase_uid, xp, schlachten, siege) values (sp, 750, 4, 2);
    erg := app.hangar_ausruestung();
    ok := (erg ->> 'rang')::int = 3 and (erg ->> 'frei')::boolean = true
      and jsonb_array_length(erg -> 'besitz') = 3
      and app.rang_stufe(0) = 0 and app.rang_stufe(99) = 0 and app.rang_stufe(100) = 1 and app.rang_stufe(5000) = 5;
    /* Konto loeschen raeumt Besitz und Rang mit ab. */
    perform set_config('request.jwt.claims', '', true);
    delete from public.players where firebase_uid = sp;
    ok := ok and not exists (select 1 from public.hangar_besitz where firebase_uid = sp)
             and not exists (select 1 from public.schiff_rang where firebase_uid = sp);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Rang und Aufraeumen' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Rechte - Katalog und Rang lesbar, nichts schreibbar; Hilfen intern. */
  ok := has_table_privilege('anon', 'public.hangar_teile', 'select') = true
    and has_table_privilege('authenticated', 'public.hangar_teile', 'update') = false
    and has_table_privilege('authenticated', 'public.hangar_besitz', 'insert') = false
    and has_table_privilege('anon', 'public.hangar_besitz', 'select') = false
    and has_table_privilege('authenticated', 'public.schiff_rang', 'update') = false
    and has_function_privilege('authenticated', 'app.hangar_ausruestung_frei()', 'execute') = false
    and has_function_privilege('authenticated', 'app.hangar_ausruestung_stand(text)', 'execute') = false
    and has_function_privilege('anon', 'public.hangar_teil_kaufen(text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.hangar_teil_kaufen(text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
