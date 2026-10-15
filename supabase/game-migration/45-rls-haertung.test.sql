/* ======================================================
   PRUEFUNG ZU 45-rls-haertung.sql
   ---------------------------------------------------
   Im SQL-Editor ausfuehren, NACHDEM 45 eingespielt wurde.
   Ein einziger DO-Block. Alles Geschriebene steht in einem inneren
   Block, der mit einer Ausnahme endet - Postgres rollt ihn zurueck.
   Erwartet: neun Zeilen, alle "PASS".
====================================================== */
do $$
declare
  uid     constant text := '45aa0000-0000-0000-0000-00000000000a';
  ausgabe text := E'\n';
  ok      boolean;
  alt     public.players;
  nr      public.players;
begin
  perform set_config('role', 'postgres', true);

  begin
    insert into public.players (firebase_uid, nickname, currency, owned_shop_items, rewards, equipped_frame, temp_avatar_id)
      values (uid, 'KosmetikTest', 1000, array['frame-a','frame-b'], array['Belohnung X'], 'frame-a', null);
    alt := app.old_player(uid);

    /* T1: nur avatar geaendert (Anzeige) - erlaubt. */
    nr := alt; nr.avatar := 'https://example/neu.png';
    ok := app.valid_players_kosmetik(uid, nr) = true;
    ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T1 avatar frei aenderbar' || E'\n';

    /* T2: rewards bzw. temp_avatar_id per normalem UPDATE eingefroren. */
    nr := alt; nr.rewards := array['Belohnung X','Geschummelt'];
    ok := app.valid_players_kosmetik(uid, nr) = false;
    nr := alt; nr.temp_avatar_id := 'premium-avatar';
    ok := ok and app.valid_players_kosmetik(uid, nr) = false;
    ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T2 rewards/temp_avatar_id eingefroren' || E'\n';

    /* T3: owned_shop_items waechst nur bezahlt und hoechstens um eins. */
    nr := alt; nr.owned_shop_items := array['frame-a','frame-b','frame-c']; nr.currency := 900;
    ok := app.valid_players_kosmetik(uid, nr) = true;                       -- +1 bezahlt
    nr := alt; nr.owned_shop_items := array['frame-a','frame-b','frame-c']; nr.currency := 1000;
    ok := ok and app.valid_players_kosmetik(uid, nr) = false;               -- +1 unbezahlt
    nr := alt; nr.owned_shop_items := array['frame-a','frame-b','frame-c','frame-d']; nr.currency := 500;
    ok := ok and app.valid_players_kosmetik(uid, nr) = false;               -- +2 auf einmal
    nr := alt; nr.owned_shop_items := array['frame-a'];
    ok := ok and app.valid_players_kosmetik(uid, nr) = false;               -- etwas entfernt
    ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T3 owned_shop_items nur +1 und bezahlt' || E'\n';

    /* T4: equipped_frame nur abgelegt oder besessen. */
    nr := alt; nr.equipped_frame := 'frame-b';
    ok := app.valid_players_kosmetik(uid, nr) = true;
    nr := alt; nr.equipped_frame := '';
    ok := ok and app.valid_players_kosmetik(uid, nr) = true;
    nr := alt; nr.equipped_frame := 'frame-niemals-gekauft';
    ok := ok and app.valid_players_kosmetik(uid, nr) = false;
    ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T4 equipped_frame nur besessen' || E'\n';

    raise exception 'zurueck';
  exception when others then
    if sqlerrm <> 'zurueck' then
      ausgabe := ausgabe || 'FAIL  (Ausnahme: ' || sqlerrm || ')' || E'\n';
    end if;
  end;

  /* T5: Policies verdrahtet (restrictive bei players, UID-Bindung bei
     den globalen Tabellen, Teilnehmer-Pruefung bei den Gewinnern). */
  ok := exists (select 1 from pg_policies where tablename='players' and policyname='players_kosmetik_update' and permissive='RESTRICTIVE')
    and exists (select 1 from pg_policies where tablename='players' and policyname='players_kosmetik_insert' and permissive='RESTRICTIVE');
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T5 players-Kosmetik-Policies (restrictive) vorhanden' || E'\n';

  ok := exists (select 1 from pg_policies where tablename='site_ratings'
                 and policyname='site_ratings_insert_signed_in' and with_check like '%firebase_uid = app.firebase_uid()%')
    and exists (select 1 from pg_policies where tablename='support_reports'
                 and policyname='support_reports_insert_signed_in' and with_check like '%firebase_uid = app.firebase_uid()%');
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T6 site_ratings/support_reports an UID gebunden' || E'\n';

  ok := exists (select 1 from pg_policies where tablename='giveaway_winners'
                 and policyname='giveaway_winners_insert_signed_in' and with_check like '%giveaway_entries%');
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T7 giveaway_winners nur echte Teilnehmer' || E'\n';

  /* T8: Rechte der Hilfsfunktion - anon darf sie nicht aufrufen. */
  ok := has_function_privilege('anon', 'app.valid_players_kosmetik(text, public.players)', 'execute') = false
    and has_function_privilege('authenticated', 'app.valid_players_kosmetik(text, public.players)', 'execute') = true;
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T8 Rechte der Hilfsfunktion' || E'\n';

  /* T9: die alte Waehrungs-/Schreibregel bleibt unberuehrt (valid_players_write existiert weiter). */
  ok := exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='app' and p.proname='valid_players_write');
  ausgabe := ausgabe || case when ok then 'PASS' else 'FAIL' end || '  T9 valid_players_write unveraendert vorhanden' || E'\n';

  raise notice '%', ausgabe;

exception when others then
  perform set_config('role', 'postgres', true);
  raise notice '%', ausgabe || E'\nABBRUCH: ' || sqlerrm;
  raise;
end $$;
