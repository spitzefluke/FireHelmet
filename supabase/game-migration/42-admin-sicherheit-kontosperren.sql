/* ======================================================
   ADMIN-SICHERHEIT: SPIELERSPERREN, KICK UND AUDIT
   ------------------------------------------------------
   Eine aktive Sperre blockiert serverseitig jede Spielmutation,
   auch aus bereits offenen Sitzungen und SECURITY DEFINER-RPCs.
   Support-Meldungen bleiben als Einspruchsweg offen.
====================================================== */

create schema if not exists private;

create table if not exists private.account_suspensions (
  account_uid text primary key,
  reason text not null check (char_length(reason) between 1 and 500),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table private.account_suspensions enable row level security;
alter table private.account_suspensions force row level security;
revoke all on table private.account_suspensions from public, anon, authenticated;

create table if not exists private.account_moderation_log (
  id bigint generated always as identity primary key,
  account_uid text not null,
  action text not null check (action in ('sperre', 'entsperre')),
  reason text not null check (char_length(reason) between 1 and 500),
  previous_reason text,
  performed_by text not null,
  created_at timestamptz not null default now()
);
alter table private.account_moderation_log enable row level security;
alter table private.account_moderation_log force row level security;
revoke all on table private.account_moderation_log from public, anon, authenticated;

create or replace function app.current_account_suspended()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from private.account_suspensions s
      where s.account_uid = auth.uid()::text
    )
    or exists (
      select 1 from private.dublonen_kontosperren s
      where s.firebase_uid = auth.uid()::text
    )
  )
$$;
revoke all on function app.current_account_suspended() from public, anon;
grant execute on function app.current_account_suspended() to authenticated;

create or replace function app.reject_suspended_account_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if app.current_account_suspended() then
    raise exception using
      errcode = '42501',
      message = 'konto-gesperrt';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;
revoke all on function app.reject_suspended_account_write() from public, anon, authenticated;

/* Trigger-Schutz fängt auch RPCs ab, die direkt auth.uid() statt
   app.firebase_uid() verwenden. Nur Spielerzustand; Support und
   öffentliche Lesedaten bleiben erreichbar. */
do $$
declare t text;
begin
  foreach t in array array[
    'players',
    'player_progression',
    'race_progress',
    'spielothek_rounds',
    'community_boss',
    'community_boss_damage',
    'community_boss_attacks',
    'boss_attack_state',
    'tournament_participants',
    'tournament_matches',
    'pass_cap_state',
    'pass_cap_grants',
    'player_identity_codes',
    'player_identity_versuche',
    'site_ratings',
    'live_grant_einloesungen',
    'giveaway_entries',
    'live_abstimmungen',
    'live_stimmen',
    'gegenhack_beitraege',
    'spieler_event_titel',
    'spieler_abzeichen',
    'xp_code_einloesungen'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists account_suspension_write_guard on public.%I', t);
      execute format(
        'create trigger account_suspension_write_guard before insert or update or delete on public.%I for each row execute function app.reject_suspended_account_write()',
        t
      );
    end if;
  end loop;
end
$$;

create or replace function app.admin_account_suspend(p_uid text, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare grund text := btrim(coalesce(p_reason, ''));
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_uid is null or p_uid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'spieler-id-ungueltig';
  end if;
  p_uid := lower(p_uid);
  if p_uid = auth.uid()::text then
    raise exception 'selbstsperre-nicht-erlaubt';
  end if;
  if not exists (select 1 from public.players p where p.firebase_uid = p_uid) then
    raise exception 'spieler-nicht-gefunden';
  end if;
  if char_length(grund) not between 1 and 500 then
    raise exception 'sperrgrund-erforderlich';
  end if;

  insert into private.account_suspensions (account_uid, reason, created_by, created_at)
  values (p_uid, grund, coalesce(auth.jwt() ->> 'email', 'admin'), now())
  on conflict (account_uid) do update
    set reason = excluded.reason,
        created_by = excluded.created_by,
        created_at = excluded.created_at;

  insert into private.account_moderation_log (account_uid, action, reason, performed_by)
  values (p_uid, 'sperre', grund, coalesce(auth.jwt() ->> 'email', 'admin'));
end
$$;
revoke all on function app.admin_account_suspend(text, text) from public, anon;
grant execute on function app.admin_account_suspend(text, text) to authenticated;

create or replace function app.admin_account_unsuspend(p_uid text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  grund text := btrim(coalesce(p_reason, ''));
  vorher text;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if p_uid is null or p_uid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'spieler-id-ungueltig';
  end if;
  p_uid := lower(p_uid);
  if char_length(grund) not between 1 and 500 then
    raise exception 'pruefgrund-erforderlich';
  end if;

  delete from private.account_suspensions
   where account_uid = p_uid
   returning reason into vorher;
  if not found then
    delete from private.dublonen_kontosperren
     where firebase_uid = p_uid
     returning grund into vorher;
  end if;
  if vorher is null then
    raise exception 'keine-sperre-gefunden';
  end if;

  insert into private.account_moderation_log
    (account_uid, action, reason, previous_reason, performed_by)
  values
    (p_uid, 'entsperre', grund, vorher, coalesce(auth.jwt() ->> 'email', 'admin'));
  return true;
end
$$;
revoke all on function app.admin_account_unsuspend(text, text) from public, anon;
grant execute on function app.admin_account_unsuspend(text, text) to authenticated;

create or replace function app.admin_account_suspensions()
returns table (
  account_uid text,
  nickname text,
  reason text,
  created_by text,
  created_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  return query
    select s.account_uid, p.nickname, s.reason, s.created_by, s.created_at, 'manuell'::text
      from private.account_suspensions s
      left join public.players p on p.firebase_uid = s.account_uid
    union all
    select s.firebase_uid, p.nickname, s.grund, null::text, s.markiert_am, 'anti-cheat'::text
      from private.dublonen_kontosperren s
      left join public.players p on p.firebase_uid = s.firebase_uid
     where not exists (
       select 1 from private.account_suspensions a where a.account_uid = s.firebase_uid
     )
    order by 5 desc
    limit 200;
end
$$;
revoke all on function app.admin_account_suspensions() from public, anon;
grant execute on function app.admin_account_suspensions() to authenticated;

create or replace function public.admin_account_suspend(p_uid text, p_reason text)
returns void
language sql
security invoker
set search_path = pg_catalog, app
as $$ select app.admin_account_suspend(p_uid, p_reason) $$;
revoke all on function public.admin_account_suspend(text, text) from public, anon;
grant execute on function public.admin_account_suspend(text, text) to authenticated;

create or replace function public.admin_account_unsuspend(p_uid text, p_reason text)
returns boolean
language sql
security invoker
set search_path = pg_catalog, app
as $$ select app.admin_account_unsuspend(p_uid, p_reason) $$;
revoke all on function public.admin_account_unsuspend(text, text) from public, anon;
grant execute on function public.admin_account_unsuspend(text, text) to authenticated;

create or replace function public.admin_account_suspensions()
returns table (
  account_uid text,
  nickname text,
  reason text,
  created_by text,
  created_at timestamptz,
  source text
)
language sql
stable
security invoker
set search_path = pg_catalog, app
as $$ select * from app.admin_account_suspensions() $$;
revoke all on function public.admin_account_suspensions() from public, anon;
grant execute on function public.admin_account_suspensions() to authenticated;

create or replace function public.mein_kontosperrstatus()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare uid text := auth.uid()::text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  return jsonb_build_object(
    'gesperrt', app.current_account_suspended(),
    'grund', coalesce(
      (select s.reason from private.account_suspensions s where s.account_uid = uid),
      case when app.current_account_suspended()
        then 'Dein Konto ist vorläufig zur Prüfung gesperrt. Bitte wende dich an den Support.'
        else null
      end
    )
  );
end
$$;
revoke all on function public.mein_kontosperrstatus() from public, anon;
grant execute on function public.mein_kontosperrstatus() to authenticated;

/* Die bisherige site_meta-Policy erlaubte jedem angemeldeten Konto
   direkte INSERT-/UPDATE-Schreibzugriffe. Meta-Schreibzugriff ist
   ausschließlich ein Admin-Vorgang; öffentliches Lesen bleibt offen. */
drop policy if exists site_meta_write_signed_in on public.site_meta;
drop policy if exists site_meta_update_signed_in on public.site_meta;
drop policy if exists site_meta_write_admin on public.site_meta;
create policy site_meta_write_admin
  on public.site_meta for all to authenticated
  using (app.is_admin())
  with check (app.is_admin());
