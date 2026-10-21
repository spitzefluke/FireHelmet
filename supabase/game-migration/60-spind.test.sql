/* ======================================================
   PRUEFUNG ZU 60-spind.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 60 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene (Freigabe, Testspieler,
   Probe-Titel) steht in einem inneren Block, der mit einer Ausnahme
   endet - Postgres rollt ihn zurueck.
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  sp      constant text := '60aa0000-0000-0000-0000-000000000001';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.site_config (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;
    update public.site_config set data = jsonb_set(coalesce(data, '{}'::jsonb), '{featureFlags}',
           coalesce(data -> 'featureFlags', '{}'::jsonb) - 'spind') where id = 'main';
    insert into public.players (firebase_uid, nickname, currency) values (sp, 'Spindtester', 5000);
    insert into public.event_titel (titel_id, text, stil) values ('t60alt', 'Alter Titel', 'gold'), ('t60neu', 'Neuer Titel', 'feuer');
    insert into public.spieler_event_titel (firebase_uid, titel_id, erhalten_am) values
      (sp, 't60alt', now() - interval '2 days'), (sp, 't60neu', now() - interval '1 day');
    perform set_config('request.jwt.claims', '{"sub":"' || sp || '","role":"authenticated"}', true);

    /* T1: ohne Freigabe nichts kaufen oder tragen; Anzeige wie in 27
       (neuester Titel). */
    ok := app.spind_teil_kaufen('gold') ->> 'grund' = 'nicht-frei'
      and app.spind_tragen('titel', 't60alt') ->> 'grund' = 'nicht-frei'
      and (select text from app.event_titel_je_spieler() where firebase_uid = sp) = 'Neuer Titel';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 ohne Freigabe gesperrt' || E'\n';

    /* T2: Titel tragen - nur eigene; danach zeigt die Rangliste ihn. */
    update public.site_config set data = jsonb_set(data, '{featureFlags,spind}', 'true'::jsonb) where id = 'main';
    erg := app.spind_tragen('titel', 't60alt');
    ok := (erg ->> 'ok')::boolean = true and erg ->> 'titel_id' = 't60alt'
      and (select text from app.event_titel_je_spieler() where firebase_uid = sp) = 'Alter Titel'
      and app.spind_tragen('titel', 't-fremd') ->> 'grund' = 'nicht-dein-titel';
    erg := app.spind_tragen('titel', null);
    ok := ok and (select text from app.event_titel_je_spieler() where firebase_uid = sp) = 'Neuer Titel';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 Titel tragen und ablegen' || E'\n';

    /* T3: Kaufen - zieht Dublonen ab; Gratis-Teile hat jeder; zu wenig. */
    erg := app.spind_teil_kaufen('gold');
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'currency')::int = 2500
      and app.spind_teil_kaufen('gold') ->> 'grund' = 'schon'
      and app.spind_teil_kaufen('weiss') ->> 'grund' = 'schon'
      and app.spind_teil_kaufen('regenbogen') ->> 'grund' = 'zu-wenig'
      and (select currency from public.players where firebase_uid = sp) = 2500;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Teile kaufen' || E'\n';

    /* T4: Namensfarbe und Banner tragen - nur Gekauftes, nur die
       richtige Art; Spruch bis 60 Zeichen. */
    ok := (app.spind_tragen('namensfarbe', 'gold') ->> 'ok')::boolean = true
      and app.spind_tragen('namensfarbe', 'feuer') ->> 'grund' = 'nicht-gekauft'
      and app.spind_tragen('banner', 'gold') ->> 'grund' = 'unbekannt'
      and (app.spind_tragen('banner', 'meer') ->> 'ok')::boolean = true
      and app.spind_tragen('spruch', repeat('x', 61)) ->> 'grund' = 'zu-lang';
    erg := app.spind_tragen('spruch', 'Volle Kraft' || chr(10) || 'voraus');
    ok := ok and erg ->> 'spruch' = 'Volle Kraft voraus'
      and exists (select 1 from app.spind_je_spieler() where firebase_uid = sp and namensfarbe = 'gold');
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Namensfarbe, Banner, Spruch' || E'\n';

    /* T5: Profilkarte fuer alle (auch anonym); Konto loeschen raeumt auf. */
    perform set_config('request.jwt.claims', '', true);
    erg := app.spind_profil(sp);
    ok := (erg ->> 'ok')::boolean = true and erg ->> 'nickname' = 'Spindtester' and erg ->> 'namensfarbe' = 'gold'
      and erg -> 'titel' ->> 'text' = 'Neuer Titel' and (erg ->> 'titel_anzahl')::int = 2
      and app.spind_profil('gibt-es-nicht') ->> 'grund' = 'unbekannt';
    delete from public.players where firebase_uid = sp;
    ok := ok and not exists (select 1 from public.spind_besitz where firebase_uid = sp)
             and not exists (select 1 from public.spind_auswahl where firebase_uid = sp);
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Profilkarte und Aufraeumen' || E'\n';

    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Rechte. */
  ok := has_table_privilege('anon', 'public.spind_teile', 'select') = true
    and has_table_privilege('authenticated', 'public.spind_auswahl', 'update') = false
    and has_table_privilege('authenticated', 'public.spind_besitz', 'insert') = false
    and has_function_privilege('anon', 'public.spind_profil(text)', 'execute') = true
    and has_function_privilege('anon', 'public.spind_tragen(text, text)', 'execute') = false
    and has_function_privilege('authenticated', 'app.spind_hat(text, text)', 'execute') = false;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Rechte' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
