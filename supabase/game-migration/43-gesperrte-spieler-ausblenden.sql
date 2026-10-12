/* ======================================================
   GESPERRTE SPIELER AUS ALLEN OEFFENTLICHEN SPIELERANSICHTEN
   ------------------------------------------------------
   Konten und Pruefbelege bleiben erhalten. Gesperrte Spieler
   verschwinden aus Ranglisten, Feeds, Ergebnislisten und eigenen
   Spielstatistiken, bis eine manuelle Entsperrung erfolgt.
====================================================== */

create or replace function private.account_is_suspended(p_uid text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p_uid is not null and (
    exists (
      select 1 from private.account_suspensions s
       where s.account_uid = p_uid
    )
    or exists (
      select 1 from private.dublonen_kontosperren s
       where s.firebase_uid = p_uid
    )
  )
$$;
revoke all on function private.account_is_suspended(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.account_is_suspended(text) to anon, authenticated;

/* Direkte REST-/PostgREST-Lesewege. Die bestaetigten Admin-RPCs
   bleiben davon getrennt, damit die Pruefliste weiter funktioniert. */
drop policy if exists players_select_public on public.players;
create policy players_select_public on public.players
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists race_progress_select_public on public.race_progress;
create policy race_progress_select_public on public.race_progress
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists boss_damage_select_public on public.community_boss_damage;
create policy boss_damage_select_public on public.community_boss_damage
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists "community_boss_attacks: oeffentlich lesbar" on public.community_boss_attacks;
create policy "community_boss_attacks: oeffentlich lesbar" on public.community_boss_attacks
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists "leaderboard_snapshots: oeffentlich lesbar" on public.leaderboard_snapshots;
create policy "leaderboard_snapshots: oeffentlich lesbar" on public.leaderboard_snapshots
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists giveaway_entries_select_public on public.giveaway_entries;
create policy giveaway_entries_select_public on public.giveaway_entries
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists pass_cap_grants_select_public on public.pass_cap_grants;
create policy pass_cap_grants_select_public on public.pass_cap_grants
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists site_ratings_select_public on public.site_ratings;
create policy site_ratings_select_public on public.site_ratings
  for select to anon, authenticated
  using (firebase_uid is null or not private.account_is_suspended(firebase_uid));

drop policy if exists tournament_participants_select_public on public.tournament_participants;
create policy tournament_participants_select_public on public.tournament_participants
  for select to anon, authenticated
  using (not private.account_is_suspended(firebase_uid));

drop policy if exists tournament_matches_select_public on public.tournament_matches;
create policy tournament_matches_select_public on public.tournament_matches
  for select to anon, authenticated
  using (
    not private.account_is_suspended(player_1_uid)
    and not private.account_is_suspended(player_2_uid)
    and not private.account_is_suspended(winner_uid)
  );

drop policy if exists tournament_prize_select_public on public.tournament_prize;
create policy tournament_prize_select_public on public.tournament_prize
  for select to anon, authenticated
  using (not private.account_is_suspended(winner_uid));

drop policy if exists tournaments_select_public on public.tournaments;
create policy tournaments_select_public on public.tournaments
  for select to anon, authenticated
  using (not private.account_is_suspended(winner_uid));

drop policy if exists giveaway_winners_select_public on public.giveaway_winners;
create policy giveaway_winners_select_public on public.giveaway_winners
  for select to anon, authenticated
  using (
    not exists (
      select 1
        from jsonb_array_elements(coalesce(winners, '[]'::jsonb)) as entry
       where private.account_is_suspended(entry ->> 'uid')
    )
  );

drop policy if exists boss_community_buff_lesen on public.boss_community_buff;
create policy boss_community_buff_lesen on public.boss_community_buff
  for select to anon, authenticated
  using (von_uid is null or not private.account_is_suspended(von_uid));

/* Eigene sensible Verlaufsdaten bleiben fuer alle anderen lesbar,
   werden dem gesperrten Konto selbst aber ebenfalls entzogen. */
drop policy if exists progression_select_own on public.player_progression;
create policy progression_select_own on public.player_progression
  for select to authenticated
  using (firebase_uid = app.firebase_uid()
         and not private.account_is_suspended(firebase_uid));

drop policy if exists boss_attack_state_eigener on public.boss_attack_state;
create policy boss_attack_state_eigener on public.boss_attack_state
  for select to authenticated
  using (firebase_uid = app.firebase_uid()
         and not private.account_is_suspended(firebase_uid));

drop policy if exists live_grant_einl_select_own on public.live_grant_einloesungen;
create policy live_grant_einl_select_own on public.live_grant_einloesungen
  for select to authenticated
  using (firebase_uid = app.firebase_uid()
         and not private.account_is_suspended(firebase_uid));

drop policy if exists spieler_event_titel_select_own on public.spieler_event_titel;
create policy spieler_event_titel_select_own on public.spieler_event_titel
  for select to authenticated
  using (firebase_uid = app.firebase_uid()
         and not private.account_is_suspended(firebase_uid));

drop policy if exists "spielothek_rounds: eigene Runden lesen" on public.spielothek_rounds;
create policy "spielothek_rounds: eigene Runden lesen" on public.spielothek_rounds
  for select to authenticated
  using (firebase_uid = (auth.jwt() ->> 'sub')
         and not private.account_is_suspended(firebase_uid));

drop policy if exists xp_einloesungen_select_own on public.xp_code_einloesungen;
create policy xp_einloesungen_select_own on public.xp_code_einloesungen
  for select to authenticated
  using (firebase_uid = app.firebase_uid()
         and not private.account_is_suspended(firebase_uid));

/* SECURITY DEFINER-Lese-RPCs umgehen Tabellen-RLS bewusst. Sie
   erhalten denselben Ausschluss explizit in ihrer Abfrage. */
create or replace function app.abzeichen_je_spieler()
returns table(firebase_uid text, anzahl integer, titel text, art text)
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select distinct on (s.firebase_uid) s.firebase_uid,
         (count(*) over (partition by s.firebase_uid))::integer,
         a.titel, a.art
    from public.spieler_abzeichen s
    join public.event_abzeichen a on a.abzeichen_id = s.abzeichen_id
   where not private.account_is_suspended(s.firebase_uid)
   order by s.firebase_uid, s.erhalten_am desc, a.abzeichen_id
$$;

create or replace function app.event_titel_je_spieler()
returns table(firebase_uid text, text text, stil text)
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select distinct on (s.firebase_uid) s.firebase_uid, t.text, t.stil
    from public.spieler_event_titel s
    join public.event_titel t on t.titel_id = s.titel_id
   where not private.account_is_suspended(s.firebase_uid)
   order by s.firebase_uid, s.erhalten_am desc, s.titel_id
$$;

create or replace function app.gegenhack_feed(p_quest text)
returns table(name text, avatar text, aufgabe text, am timestamptz, ich boolean)
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select nullif(btrim(p.nickname), ''), p.avatar, b.aufgabe, b.am,
         b.firebase_uid = app.firebase_uid()
    from public.gegenhack_beitraege b
    left join public.players p on p.firebase_uid = b.firebase_uid
   where b.quest_id = p_quest
     and not private.account_is_suspended(b.firebase_uid)
   order by b.am desc
   limit 6
$$;

create or replace function app.gegenhack_stand(p_quest text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select case when q.quest_id is null then jsonb_build_object('ok', false) else
    jsonb_build_object(
      'ok', true,
      'titel', q.titel, 'ziel', q.ziel, 'termin', q.termin, 'gestartet_am', q.gestartet_am,
      'beendet', q.beendet_am is not null, 'ergebnis', q.ergebnis,
      'geloest', (select count(*) from public.gegenhack_beitraege b
                   where b.quest_id = q.quest_id
                     and not private.account_is_suspended(b.firebase_uid)),
      'helfer', (select count(distinct b.firebase_uid) from public.gegenhack_beitraege b
                  where b.quest_id = q.quest_id
                    and not private.account_is_suspended(b.firebase_uid)),
      'aktiv', (select count(distinct b.firebase_uid) from public.gegenhack_beitraege b
                 where b.quest_id = q.quest_id
                   and b.am > now() - interval '1 hour'
                   and not private.account_is_suspended(b.firebase_uid)),
      'meine', coalesce((select jsonb_agg(b.aufgabe order by b.aufgabe)
                          from public.gegenhack_beitraege b
                         where b.quest_id = q.quest_id
                           and b.firebase_uid = app.firebase_uid()
                           and b.tag = (now() at time zone 'Europe/Berlin')::date
                           and not private.account_is_suspended(b.firebase_uid)), '[]'::jsonb),
      'meine_dublonen', (select g.dublonen from public.gegenhack_belohnungen g
                          where g.quest_id = q.quest_id
                            and g.firebase_uid = app.firebase_uid()
                            and not private.account_is_suspended(g.firebase_uid))
    ) end
    from (select 1) eins
    left join public.gegenhack_quests q on q.quest_id = p_quest
$$;

create or replace function app.live_abstimmung_stand(p_abst text)
returns table(a integer, b integer, meine text)
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select (count(*) filter (where s.wahl = 'a'))::integer,
         (count(*) filter (where s.wahl = 'b'))::integer,
         (select m.wahl from public.live_stimmen m
           where m.abst_id = p_abst
             and m.firebase_uid = app.firebase_uid()
             and not private.account_is_suspended(m.firebase_uid))
    from public.live_stimmen s
   where s.abst_id = p_abst
     and not private.account_is_suspended(s.firebase_uid)
$$;

create or replace function app.meine_abzeichen()
returns table(abzeichen_id text, art text, titel text, am timestamptz, habe boolean, erhalten_am timestamptz, anzahl integer)
language sql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
  select a.abzeichen_id, a.art, a.titel, a.am,
         m.firebase_uid is not null, m.erhalten_am,
         (select count(*)::integer from public.spieler_abzeichen x
           where x.abzeichen_id = a.abzeichen_id
             and not private.account_is_suspended(x.firebase_uid))
    from public.event_abzeichen a
    left join public.spieler_abzeichen m
      on m.abzeichen_id = a.abzeichen_id
     and m.firebase_uid = app.firebase_uid()
     and not private.account_is_suspended(m.firebase_uid)
   order by a.am desc
$$;

/* Gesperrte Konten bleiben in der Admin-Auslosung sichtbar, aber
   duerfen nicht erneut als Gewinner gezogen werden. */
create or replace function app.admin_verlosung_ziehen(p_round_id text, p_anzahl integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
declare gewinner jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_anzahl is null or p_anzahl < 1 or p_anzahl > 10 then
    raise exception 'anzahl-ungueltig';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('uid', firebase_uid, 'nickname', nickname)), '[]'::jsonb)
    into gewinner
    from (select firebase_uid, nickname
            from public.giveaway_entries
           where giveaway_id = p_round_id
             and not private.account_is_suspended(firebase_uid)
           order by random()
           limit p_anzahl) z;

  if jsonb_array_length(gewinner) = 0 then
    raise exception 'keine-lose';
  end if;

  insert into public.giveaway_winners (round_id, winners) values (p_round_id, gewinner)
  on conflict (round_id) do update set winners = excluded.winners;

  perform app.admin_notiz('verlosung-gezogen', p_round_id, gewinner);
  return gewinner;
end
$$;
