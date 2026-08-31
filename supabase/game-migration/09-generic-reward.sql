/* ======================================================
   GENERISCHE BELOHNUNGEN (Dublonen/Werkzeug/befristeter Avatar):
   ATOMARE SECURITY-DEFINER-RPC STATT ROHEM UPDATE
   ---------------------------------------------------
   Root-Cause-Fix fuer einen echten, reproduzierbaren Fehler: jede
   Belohnung, die players.currency erhoeht, OHNE dabei auch
   redeemed_currency_codes zu aendern (Story-/Levelpfad-Meilensteine,
   aber strukturell auch Schatzrad-Dublonen-Preise und Spielothek-
   Gewinne traefen dasselbe Problem, siehe unten), wurde von
   app.valid_code_redemption() in 01-players-ship-progression.sql
   ausnahmslos abgelehnt ("insufficient privilege" / RLS-Ablehnung) -
   deren Schnellpfad ("redeemed_currency_codes unveraendert -> delta
   muss <= 0 sein") sollte NUR ein wiederholtes Einloesen DESSELBEN,
   bereits gespeicherten Codes verhindern, blockierte durch die
   fehlende Gegenpruefung aber jede andere Waehrungsgutschrift gleich
   mit. Schatzrad und Spielothek wurden in 01-players-ship-
   progression.sql bereits ueber eine gezielte Ausnahme repariert
   (dort aendert sich last_wheel_spin_at bzw. last_spielothek_play_at
   im selben Schreibvorgang mit, was schon eigenstaendig geprueft
   wird). Fuer den generischen, clientseitig getriebenen Belohnungs-
   Pfad (claimReward() in progression.js: Dublonen/Werkzeug/befristeter
   Avatar aus Level-/Meilenstein-/Piratenpass-Belohnungen) gibt es
   dagegen kein vergleichbares "Alibi-Feld" - hierfuer diese neue,
   selbst validierende RPC (exakt dasselbe Architekturprinzip wie
   app.claim_pass_cap() in 08-pass-cap.sql, nur ohne Limitierung/
   Einzigartigkeits-Anspruch: bewusst weiterhin dieselbe Race-
   Condition-Toleranz wie zuvor - "im schlimmsten Fall einmal zu oft
   vergeben, nie verloren" -, siehe Kommentar bei claimReward()).

   claimed_reward_ids bleibt bewusst WEITERHIN ein normaler,
   clientseitiger player_progression-Schreibvorgang (unveraendert) -
   dafuer gibt es in valid_progression_write() kein vergleichbares
   Problem, nur die players-Seite war betroffen.
====================================================== */

create or replace function app.claim_generic_player_reward(
  p_currency_delta integer default 0,
  p_tool_id text default null,
  p_temp_avatar_id text default null,
  p_temp_avatar_days integer default null
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  caller_uid text := auth.uid()::text;
  known_tool_ids text[] := array['spyglass','toolbox','hammer','sealant','saw','cableSet',
    'fuse','multimeter','oilCan','screwdriver','coolant','fuelFilter','wrench',
    'antenna','compass','circuitChip','brush','safetyKit','testKit','captainsSeal'];
begin
  if caller_uid is null then
    raise exception 'not-signed-in';
  end if;

  -- Selbst-Validierung (SECURITY DEFINER umgeht die normale RLS-
  -- Pruefung komplett, muss also seine Eingaben selbst begrenzen) -
  -- Obergrenzen bewusst grosszuegig ueber dem tatsaechlich groessten
  -- konfigurierten Einzelwert (siehe LEVEL_REWARDS/EXPEDITION_
  -- MILESTONES in progression-data.js, aktuell max. 350 Dublonen bzw.
  -- 3 Tage befristeter Avatar) - kein Ersatz fuer die serverseitige
  -- Reward-Tabelle, sondern nur eine Haerte-Grenze gegen einen
  -- fehlerhaften/manipulierten Client, analog zum bestehenden
  -- 30000er-Deckel in valid_players_write().
  if p_currency_delta < 0 or p_currency_delta > 1000 then
    raise exception 'invalid-currency-delta';
  end if;
  if p_tool_id is not null and not (p_tool_id = any(known_tool_ids)) then
    raise exception 'invalid-tool-id';
  end if;
  if p_temp_avatar_id is not null and char_length(p_temp_avatar_id) > 100 then
    raise exception 'invalid-temp-avatar-id';
  end if;
  if p_temp_avatar_days is not null and (p_temp_avatar_days < 0 or p_temp_avatar_days > 14) then
    raise exception 'invalid-temp-avatar-days';
  end if;

  -- Zeile sicherstellen (analog ensureSupabasePlayerRow() clientseitig,
  -- hier nur als Absicherung falls diese RPC vor dem normalen
  -- Row-Ensure-Upsert laeuft).
  insert into public.players (firebase_uid) values (caller_uid)
    on conflict (firebase_uid) do nothing;

  update public.players
  set
    currency = currency + p_currency_delta,
    total_currency_earned = total_currency_earned + p_currency_delta,
    ship_tools = case when p_tool_id is not null
      then jsonb_set(
        coalesce(ship_tools, '{}'::jsonb),
        array[p_tool_id],
        to_jsonb(coalesce((ship_tools ->> p_tool_id)::integer, 0) + 1)
      )
      else ship_tools end,
    temp_avatar_id = case when p_temp_avatar_id is not null then p_temp_avatar_id else temp_avatar_id end,
    temp_avatar_expires_at = case when p_temp_avatar_id is not null and p_temp_avatar_days is not null
      then (extract(epoch from now()) * 1000)::bigint + p_temp_avatar_days * 86400000
      else temp_avatar_expires_at end
  where firebase_uid = caller_uid;
end;
$$;

create or replace function public.claim_generic_player_reward(
  p_currency_delta integer default 0,
  p_tool_id text default null,
  p_temp_avatar_id text default null,
  p_temp_avatar_days integer default null
) returns void
language sql
as $$ select app.claim_generic_player_reward(p_currency_delta, p_tool_id, p_temp_avatar_id, p_temp_avatar_days) $$;

grant execute on function app.claim_generic_player_reward(integer, text, text, integer) to authenticated;
grant execute on function public.claim_generic_player_reward(integer, text, text, integer) to authenticated;
