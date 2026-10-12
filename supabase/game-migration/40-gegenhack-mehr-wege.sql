/* ======================================================
   GEGENHACK: ZWEI ZUSAETZLICHE TAEGLICHE BEITRAGSWEGE
   ------------------------------------------------------
   Schatzrad-Dreh und Community-Boss-Schaden werden gegen
   serverseitig gespeicherte Spieleraktionen geprueft.
   Aufbauend auf Migration 39.
====================================================== */

alter table public.gegenhack_beitraege
  drop constraint if exists gegenhack_aufgabe_bekannt;
alter table public.gegenhack_beitraege
  add constraint gegenhack_aufgabe_bekannt
  check (aufgabe in ('frag', 'freq', 'code', 'rad', 'boss'));

create or replace function app.gegenhack_beitragen(p_quest text, p_aufgabe text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  berlin_tag timestamptz := ((now() at time zone 'Europe/Berlin')::date)::timestamp at time zone 'Europe/Berlin';
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_aufgabe is null or p_aufgabe not in ('frag', 'freq', 'code', 'rad', 'boss') then
    return -1;
  end if;
  if not exists (select 1 from public.gegenhack_quests where quest_id = p_quest and beendet_am is null) then
    return -1;
  end if;

  if p_aufgabe = 'rad' and not exists (
    select 1 from public.players p
     where p.firebase_uid = uid and p.last_wheel_spin_at >= berlin_tag
  ) then
    return -2;
  end if;

  if p_aufgabe = 'boss' and not exists (
    select 1 from public.community_boss_damage d
     where d.firebase_uid = uid and d.updated_at >= berlin_tag
  ) then
    return -2;
  end if;

  insert into public.gegenhack_beitraege (quest_id, firebase_uid, aufgabe, tag)
  values (p_quest, uid, p_aufgabe, (now() at time zone 'Europe/Berlin')::date)
  on conflict do nothing;
  return case when found then 1 else 0 end;
end
$$;
