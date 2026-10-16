/* ======================================================
   PRUEFUNG ZU 52-nordlicht-wunsch.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 52 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck.
   Erwartet: sechs Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '52aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  erg     jsonb;
  geld    integer;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.players (firebase_uid, nickname, currency) values (uid, 'WunschTest', 100);
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-frueh', 'nordlicht', now());
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-a', 'nordlicht', now() - interval '20 seconds');
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-b', 'nordlicht', now() - interval '20 seconds');
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-c', 'nordlicht', now() - interval '20 seconds');
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-d', 'nordlicht', now() - interval '20 seconds');
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-alt', 'nordlicht', now() - interval '1 hour');
    insert into public.live_storys (story_id, story, gestartet_am) values ('t52-sturm', 'sturm', now() - interval '20 seconds');
    perform set_config('request.jwt.claims',
      '{"sub":"' || uid || '","role":"authenticated","is_anonymous":true}', true);

    /* T1: Angebot - vier Karten, Titel "Sternenkind" zuerst. */
    erg := app.nordlicht_angebot('t52-a');
    ok := (erg ->> 'ok')::boolean = true and jsonb_array_length(erg -> 'karten') = 4
      and erg -> 'karten' -> 3 ->> 'titel_id' = 'nordlicht_sternenkind' and erg ->> 'schon' is null;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T1 Angebot mit vier Karten' || E'\n';

    /* T2: Fenster - nicht zu frueh, nicht zu spaet, nur Nordlicht. */
    ok := app.nordlicht_wunsch('t52-frueh', 'dublonen') ->> 'grund' = 'zu-frueh'
      and app.nordlicht_wunsch('t52-alt', 'dublonen') ->> 'grund' = 'zu-spaet'
      and app.nordlicht_wunsch('t52-sturm', 'dublonen') ->> 'grund' = 'unbekannt'
      and app.nordlicht_wunsch('t52-a', 'gold') ->> 'grund' = 'unbekannt';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T2 nur im Wunsch-Fenster eines Nordlichts' || E'\n';

    /* T3: Dublonen - genau 500, nur einmal je Nordlicht. */
    erg := app.nordlicht_wunsch('t52-a', 'dublonen');
    select currency into geld from public.players where firebase_uid = uid;
    ok := (erg ->> 'ok')::boolean = true and (erg ->> 'dublonen')::int = 500 and geld = 600;
    erg := app.nordlicht_wunsch('t52-a', 'skillpunkt');
    ok := ok and erg ->> 'grund' = 'schon' and erg ->> 'wunsch' = 'dublonen'
      and app.nordlicht_angebot('t52-a') ->> 'schon' = 'dublonen';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T3 Dublonen-Wunsch 500, nur einmal' || E'\n';

    /* T4: Skillpunkt und Pass-XP. */
    erg := app.nordlicht_wunsch('t52-b', 'skillpunkt');
    ok := (erg ->> 'skillpunkte')::int = 1
      and (select bonus_skill_points from public.player_progression where firebase_uid = uid) >= 1;
    ok := ok and app.nordlicht_wunsch('t52-c', 'pass_xp') ->> 'grund' = 'keine-saison';
    erg := app.nordlicht_wunsch('t52-c', 'pass_xp', 'season1');
    ok := ok and (erg ->> 'pass_xp')::int = 250
      and (select pass_xp from public.player_progression where firebase_uid = uid and pass_id = 'season1') >= 250;
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T4 Skillpunkt und Pass-XP' || E'\n';

    /* T5: Titel - erst Sternenkind, danach bietet das Angebot Polarlichtjaeger. */
    erg := app.nordlicht_wunsch('t52-d', 'titel');
    ok := erg -> 'titel' ->> 'text' = 'Sternenkind'
      and exists (select 1 from public.spieler_event_titel where firebase_uid = uid and titel_id = 'nordlicht_sternenkind');
    erg := app.nordlicht_angebot('t52-d');
    ok := ok and erg -> 'karten' -> 3 ->> 'titel_id' = 'nordlicht_polarlicht';
    ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T5 Titel ohne Doppel' || E'\n';

    perform set_config('request.jwt.claims', '', true);
    raise exception 'zurueck';
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T6: Rechte, alte Pauschal-Belohnung aus. */
  ok := has_function_privilege('anon', 'public.nordlicht_wunsch(text, text, text)', 'execute') = false
    and has_function_privilege('authenticated', 'public.nordlicht_wunsch(text, text, text)', 'execute') = true
    and has_function_privilege('authenticated', 'app.nordlicht_fenster(text)', 'execute') = false
    and has_table_privilege('authenticated', 'public.nordlicht_wuensche', 'insert') = false
    and (select dublonen from public.live_story_preise where schluessel = 'nordlicht') = 0;
  ausgabe := ausgabe || case when ok = true then 'PASS' else 'FAIL' end || '  T6 Rechte, alte Belohnung aus' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
