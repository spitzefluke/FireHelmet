/* ======================================================
   PRUEFUNG ZU 56-schlacht-orte-freigabe.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 55 und 56 eingespielt wurden.
   Ein einziger DO-Block. Alles Geschriebene (Freigabe, Epoche,
   Testspieler, Probe-Schlachten) steht in einem inneren Block, der
   mit einer Ausnahme endet - Postgres rollt ihn zurueck.
   Erwartet: vier Zeilen, alle "PASS".
====================================================== */
do $$
declare
  ad      constant text := '56aa0000-0000-0000-0000-0000000000ff';
  admin   text := substring(pg_get_functiondef('app.is_admin()'::regprocedure) from '''([^'']+@[^'']+)''');
  ausgabe text := E'\n';
  ok      boolean;
  sid     bigint;
begin
  perform set_config('role', 'postgres', true);

  begin
    update public.sternenschlacht set status = 'vorbei' where status = 'laeuft';
    update public.players set seite = null where seite is not null;
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'schlachtOrte') where id = 'main';
    insert into public.players (firebase_uid, nickname, seite) values (ad, 'FreigabeAdmin', 'menschen');
    perform set_config('request.jwt.claims',
      '{"sub":"' || ad || '","role":"authenticated","email":"' || admin || '"}', true);

    /* T1: ohne Freigabe kein Ort. */
    sid := app.admin_schlacht_starten(10);
    ok := (select ort from public.sternenschlacht where id = sid) is null;
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe startet die Schlacht ohne Ort' || E'\n';

    /* T2: ein ausdruecklich gewaehlter Ort gilt auch ohne Freigabe. */
    sid := app.admin_schlacht_starten(10, 'eisring');
    ok := (select ort from public.sternenschlacht where id = sid) = 'eisring';
    perform app.admin_schlacht_beenden();
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 gewaehlter Ort gilt immer' || E'\n';

    /* T3: mit Freigabe wird ausgelost. */
    update public.site_config set data = jsonb_set(data, '{featureFlags,schlachtOrte}', 'true'::jsonb) where id = 'main';
    sid := app.admin_schlacht_starten(10);
    ok := (select ort from public.sternenschlacht where id = sid) in (select ort_id from public.schlacht_orte);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 mit Freigabe wird ausgelost' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T4: die Hilfsfunktion ist nur intern. */
  ok := has_function_privilege('authenticated', 'app.schlacht_orte_frei()', 'execute') = false
    and has_function_privilege('anon', 'app.schlacht_orte_frei()', 'execute') = false
    and has_function_privilege('authenticated', 'public.admin_schlacht_starten(integer, text)', 'execute') = true;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
