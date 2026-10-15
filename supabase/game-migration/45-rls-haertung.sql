/* ======================================================
   RLS-HAERTUNG: KOSMETIK/INVENTAR UND GLOBALE INSERTS
   ------------------------------------------------------
   Schliesst drei Loecher, mit denen ein normaler (nicht-Admin)
   angemeldeter Nutzer ohne echte Waehrung Vorteile oder globale
   Faelschungen erreichen konnte. Reine virtuelle Waehrung, kein
   echtes Geld - aber mehreres war global sichtbar.

   WARUM ALS ZWEITE (RESTRICTIVE) POLICY, NICHT ALS UMSCHRIEBENE
   app.valid_players_write()
   16-anmeldung.sql ruft valid_players_write() in der bestehenden
   UPDATE-Policy auf. Statt diese Funktion neu zu schreiben, kommt
   eine zweite, RESTRICTIVE Policy daneben (wie die Kontosperre in
   41-dublonen-anti-cheat.sql): restrictive Policies werden mit UND
   verknuepft, die alte Regel bleibt unberuehrt.

   WARUM SICH rewards/temp_avatar_id EINFRIEREN LASSEN
   Diese Felder setzt nur SECURITY DEFINER-Code (claim_pass_cap,
   claim_generic_player_reward), dessen Eigentuemer 'postgres' RLS
   per BYPASSRLS umgeht - die Policy hier greift also NICHT in die
   legitime Vergabe ein, nur in ein direktes Browser-UPDATE.

   1. players: owned_shop_items nur wachsen lassen (hoechstens ein
      Artikel je Schreibvorgang, und nur wenn der Kontostand sinkt -
      also bezahlt wurde). equipped_frame nur ablegen oder einen
      besessenen Artikel. rewards und temp_avatar_id per normalem
      UPDATE eingefroren. avatar bleibt frei - reine Anzeige, kann
      bei OAuth eine externe Bild-URL sein.
   2. site_ratings / support_reports: INSERT nur fuer die eigene UID.
   3. giveaway_winners: jeder eingetragene Gewinner muss echter
      Teilnehmer derselben Runde sein (der Zug selbst bleibt der
      bisherige: der erste Besucher traegt das deterministische
      Ergebnis ein, der Primaerschluessel verhindert ein zweites Mal).

   REIHENFOLGE: nach 44 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. PLAYERS: KOSMETIK UND INVENTAR
====================================================== */
create or replace function app.valid_players_kosmetik(p_uid text, new_row public.players) returns boolean
language plpgsql stable
set search_path = public, app, pg_temp
as $$
declare
  old_row   public.players := app.old_player(p_uid);
  alt_items text[] := coalesce(old_row.owned_shop_items, '{}');
  neu_items text[] := coalesce(new_row.owned_shop_items, '{}');
begin
  return
    /* rewards & temp_avatar_id: nur ueber SECURITY DEFINER-RPCs
       (umgehen RLS), per normalem UPDATE eingefroren. */
    new_row.rewards is not distinct from old_row.rewards
    and new_row.temp_avatar_id is not distinct from old_row.temp_avatar_id
    /* owned_shop_items: nichts entfernen/ersetzen (Obermenge),
       hoechstens ein neuer Artikel, und ein neuer Artikel nur gegen
       Bezahlung (der Kontostand sinkt im selben Schreibvorgang). */
    and neu_items @> alt_items
    and cardinality(neu_items) <= cardinality(alt_items) + 1
    and (cardinality(neu_items) = cardinality(alt_items)
         or new_row.currency < coalesce(old_row.currency, 0))
    /* equipped_frame: nur abgelegt ('' / null) oder ein besessener Artikel. */
    and (new_row.equipped_frame is null
         or new_row.equipped_frame = ''
         or new_row.equipped_frame = any(neu_items));
end;
$$;
revoke all on function app.valid_players_kosmetik(text, public.players) from public, anon;
grant  execute on function app.valid_players_kosmetik(text, public.players) to authenticated;

/* UPDATE: zusaetzlich zur bestehenden Policy (restrictive = UND). */
drop policy if exists players_kosmetik_update on public.players;
create policy players_kosmetik_update on public.players
  as restrictive for update to authenticated
  using (true)
  with check (app.valid_players_kosmetik(firebase_uid, players.*));

/* INSERT: eine frische Zeile faengt leer an (ensureSupabasePlayerRow
   legt sie nur mit firebase_uid/nickname an) - kein vorgefuelltes
   Inventar, keine Belohnungen. */
drop policy if exists players_kosmetik_insert on public.players;
create policy players_kosmetik_insert on public.players
  as restrictive for insert to authenticated
  with check (
    coalesce(cardinality(owned_shop_items), 0) = 0
    and coalesce(cardinality(rewards), 0) = 0
    and (equipped_frame is null or equipped_frame = '')
    and temp_avatar_id is null
  );


/* ======================================================
   2. GLOBALE INSERTS AN DIE EIGENE UID BINDEN
   Beide Browser-Clients schicken firebase_uid bereits mit
   (scripts/rating/rating.js, scripts/support/support.js) - die
   Bindung bricht nichts, verhindert aber Faelschungen auf fremde
   Namen/UIDs.
====================================================== */
drop policy if exists site_ratings_insert_signed_in on public.site_ratings;
create policy site_ratings_insert_signed_in on public.site_ratings
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and value >= 1 and value <= 5
    and char_length(nickname) <= 30
    and (comment is null or char_length(comment) <= 500)
  );

drop policy if exists support_reports_insert_signed_in on public.support_reports;
create policy support_reports_insert_signed_in on public.support_reports
  for insert to authenticated
  with check (
    firebase_uid = app.firebase_uid()
    and char_length(message) >= 1 and char_length(message) <= 2000
  );


/* ======================================================
   3. GIVEAWAY-GEWINNER: NUR ECHTE TEILNEHMER
   round_id ist derselbe Wert wie giveaway_entries.giveaway_id
   (beides giveawayConfig.id). Jeder Gewinner-Eintrag {uid, nickname}
   muss zu einem Teilnehmer derselben Runde gehoeren - sonst liesse
   sich ein Aussenstehender als Gewinner eintragen, bevor der echte,
   deterministische Zug stattfindet.
====================================================== */
drop policy if exists giveaway_winners_insert_signed_in on public.giveaway_winners;
create policy giveaway_winners_insert_signed_in on public.giveaway_winners
  for insert to authenticated
  with check (
    jsonb_typeof(winners) = 'array'
    and jsonb_array_length(winners) <= 10
    and not exists (
      select 1
      from jsonb_array_elements(winners) w
      where not exists (
        select 1 from public.giveaway_entries e
        where e.giveaway_id = giveaway_winners.round_id
          and e.firebase_uid = w.value ->> 'uid'
      )
    )
  );
