/* ======================================================
   ADMIN-WERKZEUGE, RUNDE 1
   Turnier-Reset, Statusbrett, Spieler bearbeiten, Namenssperre
   ---------------------------------------------------
   Alles hier laeuft ueber SECURITY DEFINER-Funktionen mit
   app.is_admin() als erster Zeile - genau wie die Turnierfunktionen
   in 07-tournament.sql und aus demselben Grund: diese Eingriffe
   veraendern Zeilen, die dem Aufrufer nicht "gehoeren". Eine
   RLS-Policy koennte das nur ausdruecken, indem sie JEDEM
   Angemeldeten Schreibrechte auf fremde Zeilen gibt.

   Jede veraendernde Aktion schreibt eine Zeile ins Admin-Protokoll
   (public.admin_protokoll). Das ist kein Sicherheitsmerkmal - der
   Admin koennte es selbst leeren -, sondern eine Gedaechtnisstuetze:
   "wann habe ich wem die Dublonen gesetzt" ist nach zwei Wochen
   sonst nicht mehr zu beantworten.
====================================================== */


/* ======================================================
   1. ADMIN-PROTOKOLL
====================================================== */
create table if not exists public.admin_protokoll (
  id bigint generated always as identity primary key,
  wann timestamptz not null default now(),
  wer text,
  aktion text not null,
  ziel text,
  einzelheiten jsonb
);

alter table public.admin_protokoll enable row level security;
alter table public.admin_protokoll force row level security;
-- Keine Policy: nur ueber die Funktionen unten erreichbar.
revoke all on public.admin_protokoll from anon, authenticated;

create or replace function app.admin_notiz(p_aktion text, p_ziel text, p_einzelheiten jsonb default null)
returns void
language sql security definer set search_path = public, app, pg_temp
as $$
  insert into public.admin_protokoll (wer, aktion, ziel, einzelheiten)
  values (auth.jwt() ->> 'email', p_aktion, p_ziel, p_einzelheiten)
$$;


/* ======================================================
   2. TURNIER: FORTSCHRITT ZURUECKSETZEN
   ---------------------------------------------------
   Unterschied zu app.admin_reset_tournament(): das dort loescht
   Teilnehmer UND Turnier und geht nur vor dem Start. Diese Funktion
   ist fuer den umgekehrten Fall - das Turnier laeuft schon, soll
   aber noch einmal von vorn beginnen, OHNE dass sich alle neu
   eintragen muessen.

   Danach steht das Turnier wieder auf "registration": weitere
   Spieler koennen noch dazukommen, und ein erneutes
   admin_start_tournament() lost neu aus (die Reihenfolge wird dort
   ohnehin zufaellig gemischt).
====================================================== */
create or replace function app.admin_turnier_fortschritt_zuruecksetzen(p_tournament_id text)
returns public.tournaments
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  t public.tournaments;
  anzahl int;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament-not-found';
  end if;

  select count(*) into anzahl from public.tournament_participants
   where tournament_id = p_tournament_id;

  -- Matches komplett weg. Der Turnierbaum wird von
  -- admin_start_tournament() ohnehin vollstaendig neu angelegt.
  delete from public.tournament_matches where tournament_id = p_tournament_id;

  -- Alle wieder im Rennen
  update public.tournament_participants
     set eliminated = false
   where tournament_id = p_tournament_id;

  update public.tournaments
     set status = 'registration',
         bracket_size = null,
         started_at = null,
         finished_at = null,
         paused = false,
         winner_uid = null,
         winner_nickname = null
   where id = p_tournament_id
  returning * into t;

  perform app.admin_notiz('turnier-fortschritt-zurueckgesetzt', p_tournament_id,
                          jsonb_build_object('teilnehmer_behalten', anzahl,
                                             'vorher_status', t.status));
  return t;
end
$$;

create or replace function public.admin_turnier_fortschritt_zuruecksetzen(p_tournament_id text)
returns public.tournaments
language sql
as $$ select * from app.admin_turnier_fortschritt_zuruecksetzen(p_tournament_id) $$;

grant execute on function app.admin_turnier_fortschritt_zuruecksetzen(text) to authenticated;
grant execute on function public.admin_turnier_fortschritt_zuruecksetzen(text) to authenticated;


/* ======================================================
   3. STATUSBRETT
   ---------------------------------------------------
   Eine einzige Abfrage statt zehn - das Panel soll beim Oeffnen
   nicht zehn Rundreisen zum Server machen.
====================================================== */
create or replace function app.admin_statusbrett()
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare erg jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select jsonb_build_object(
    'spieler_gesamt',      (select count(*) from public.players),
    'spieler_mit_namen',   (select count(*) from public.players where nickname is not null),
    'aktiv_24h',           (select count(*) from public.players where updated_at > now() - interval '24 hours'),
    'aktiv_7t',            (select count(*) from public.players where updated_at > now() - interval '7 days'),
    'dublonen_gesamt',     (select coalesce(sum(currency), 0) from public.players),
    'caps_vergeben',       (select granted from public.pass_cap_state where id = 'cap'),
    'caps_frei',           (select 4 - granted from public.pass_cap_state where id = 'cap'),
    'boss',                (select jsonb_build_object('monat', month_id, 'hp', hp, 'max_hp', max_hp, 'besiegt', defeated)
                              from public.community_boss order by month_id desc limit 1),
    'rennen_woche',        (select jsonb_build_object('woche', week, 'teilnehmer', count(*), 'bester', max(progress))
                              from public.race_progress
                             where week = (select max(week) from public.race_progress)
                             group by week),
    'turnier',             (select jsonb_build_object('id', id, 'status', status, 'pausiert', paused,
                                     'teilnehmer', (select count(*) from public.tournament_participants tp where tp.tournament_id = t.id),
                                     'offene_matches', (select count(*) from public.tournament_matches m
                                                         where m.tournament_id = t.id and m.status = 'open'))
                              from public.tournaments t where status in ('registration', 'active') limit 1),
    'support_offen',       (select count(*) from public.support_reports),
    'gesperrte_namen',     (select count(*) from public.gesperrte_namen)
  ) into erg;

  return erg;
end
$$;

create or replace function public.admin_statusbrett() returns jsonb
language sql
as $$ select app.admin_statusbrett() $$;


/* ======================================================
   4. NAMENSSPERRE
   ---------------------------------------------------
   Fuer einen Namen, der so nicht auf der Seite stehen soll. Der
   Fortschritt des Kontos bleibt unangetastet - nur der Name wird
   geleert und die Schreibweise gesperrt, damit sie nicht sofort
   wieder eingetragen wird.
====================================================== */
create table if not exists public.gesperrte_namen (
  name_klein text primary key,
  gesperrt_am timestamptz not null default now(),
  grund text
);

alter table public.gesperrte_namen enable row level security;
alter table public.gesperrte_namen force row level security;
-- Keine Policy und keine Rechte: die Liste selbst geht niemanden
-- etwas an. Geprueft wird sie ueber app.name_erlaubt() unten.
revoke all on public.gesperrte_namen from anon, authenticated;

create or replace function app.name_erlaubt(p_name text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select p_name is null
      or not exists (select 1 from public.gesperrte_namen where name_klein = lower(p_name))
$$;

grant execute on function app.name_erlaubt(text) to anon, authenticated;

/* app.valid_players_write() aus 01-players-ship-progression.sql um die
   Namenspruefung erweitert. Bewusst hier per "create or replace" statt
   in der alten Datei: 01 ist auf dem Live-Projekt laengst eingespielt,
   und diese Migration soll fuer sich allein lauffaehig sein.
   ALLE uebrigen Bedingungen sind unveraendert uebernommen. */
create or replace function app.valid_players_write(p_uid text, new_row public.players) returns boolean
language plpgsql stable
as $$
declare
  old_row public.players := app.old_player(p_uid);
begin
  return new_row.currency <= coalesce(old_row.currency, 0) + 30000
    and new_row.games_played <= coalesce(old_row.games_played, 0) + 1
    and new_row.games_won <= coalesce(old_row.games_won, 0) + 1
    and new_row.total_currency_earned <= coalesce(old_row.total_currency_earned, 0) + 30000
    and new_row.streak <= coalesce(old_row.streak, 0) + 1
    and new_row.codes_cracked <= coalesce(old_row.codes_cracked, 0) + 1
    -- NEU: gesperrte Namen lassen sich nicht (wieder) eintragen.
    -- Ein unveraenderter Name bleibt erlaubt, damit ein gesperrtes
    -- Konto nicht bei jedem anderen Schreibvorgang blockiert.
    and (new_row.nickname is not distinct from old_row.nickname
         or app.name_erlaubt(new_row.nickname))
    and app.valid_ship_tools(p_uid, new_row.ship_tools)
    and app.valid_daily_quests_write(p_uid, new_row.daily_quests_started_at, new_row.daily_quests_claimed_days, new_row.ship_tools)
    and app.valid_code_redemption(p_uid, new_row.redeemed_currency_codes, new_row.currency, new_row.last_wheel_spin_at, new_row.last_spielothek_play_at)
    and app.valid_wheel_fields(p_uid, new_row.last_wheel_spin_at, new_row.temp_avatar_expires_at)
    and app.valid_spielothek_cooldown(p_uid, new_row.last_spielothek_play_at)
    and app.valid_avatar_unlock(p_uid, new_row.unlocked_avatars, new_row.redeemed_currency_codes);
end;
$$;

create or replace function app.admin_name_sperren(p_uid text, p_grund text default null)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare alt text;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select nickname into alt from public.players where firebase_uid = p_uid;
  if alt is null then
    raise exception 'kein-name-gesetzt';
  end if;

  insert into public.gesperrte_namen (name_klein, grund) values (lower(alt), p_grund)
    on conflict (name_klein) do update set grund = excluded.grund;

  update public.players set nickname = null where firebase_uid = p_uid;

  perform app.admin_notiz('name-gesperrt', p_uid, jsonb_build_object('name', alt, 'grund', p_grund));
end
$$;

create or replace function public.admin_name_sperren(p_uid text, p_grund text default null) returns void
language sql
as $$ select app.admin_name_sperren(p_uid, p_grund) $$;

create or replace function app.admin_name_entsperren(p_name text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  delete from public.gesperrte_namen where name_klein = lower(p_name);
  perform app.admin_notiz('name-entsperrt', null, jsonb_build_object('name', p_name));
end
$$;

create or replace function public.admin_name_entsperren(p_name text) returns void
language sql
as $$ select app.admin_name_entsperren(p_name) $$;

create or replace function app.admin_gesperrte_namen()
returns table (name_klein text, gesperrt_am timestamptz, grund text)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query select g.name_klein, g.gesperrt_am, g.grund
                 from public.gesperrte_namen g order by g.gesperrt_am desc;
end
$$;

create or replace function public.admin_gesperrte_namen()
returns table (name_klein text, gesperrt_am timestamptz, grund text)
language sql
as $$ select * from app.admin_gesperrte_namen() $$;


/* ======================================================
   5. SPIELER SUCHEN UND BEARBEITEN
====================================================== */
create or replace function app.admin_spieler_suchen(p_suche text)
returns table (
  firebase_uid text, nickname text, currency integer, xp integer,
  games_played integer, games_won integer, codes_cracked integer,
  avatar text, angelegt timestamptz, zuletzt timestamptz,
  im_turnier boolean, hat_cap boolean
)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if coalesce(trim(p_suche), '') = '' then
    raise exception 'suche-leer';
  end if;

  return query
    select p.firebase_uid, p.nickname, p.currency,
           coalesce(pp.xp, 0), p.games_played, p.games_won, p.codes_cracked,
           p.avatar, u.created_at, p.updated_at,
           exists (select 1 from public.tournament_participants tp where tp.firebase_uid = p.firebase_uid),
           exists (select 1 from public.pass_cap_grants g where g.firebase_uid = p.firebase_uid)
      from public.players p
      left join public.player_progression pp on pp.firebase_uid = p.firebase_uid
      left join auth.users u on u.id::text = p.firebase_uid
     where p.firebase_uid = trim(p_suche)
        or p.nickname ilike '%' || trim(p_suche) || '%'
     order by p.updated_at desc nulls last
     limit 25;
end
$$;

create or replace function public.admin_spieler_suchen(p_suche text)
returns table (
  firebase_uid text, nickname text, currency integer, xp integer,
  games_played integer, games_won integer, codes_cracked integer,
  avatar text, angelegt timestamptz, zuletzt timestamptz,
  im_turnier boolean, hat_cap boolean
)
language sql
as $$ select * from app.admin_spieler_suchen(p_suche) $$;

/* null heisst jeweils "unveraendert lassen". Fuer den Namen gibt es
   bewusst KEINEN Weg, ihn hier zu leeren - dafuer ist
   admin_name_sperren() da, damit ein geleerter Name nicht sofort
   wieder eingetragen wird. */
create or replace function app.admin_spieler_setzen(
  p_uid text,
  p_currency integer default null,
  p_xp integer default null,
  p_nickname text default null
) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare vorher jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if not exists (select 1 from public.players where firebase_uid = p_uid) then
    raise exception 'spieler-unbekannt';
  end if;
  if p_currency is not null and p_currency < 0 then
    raise exception 'dublonen-negativ';
  end if;
  if p_xp is not null and p_xp < 0 then
    raise exception 'xp-negativ';
  end if;
  if p_nickname is not null and char_length(trim(p_nickname)) not between 1 and 30 then
    raise exception 'name-laenge';
  end if;
  if p_nickname is not null and not app.name_erlaubt(trim(p_nickname)) then
    raise exception 'name-gesperrt';
  end if;

  select jsonb_build_object('currency', p.currency, 'nickname', p.nickname,
                            'xp', (select xp from public.player_progression where firebase_uid = p_uid))
    into vorher
    from public.players p where p.firebase_uid = p_uid;

  update public.players
     set currency = coalesce(p_currency, currency),
         nickname = coalesce(trim(p_nickname), nickname),
         updated_at = now()
   where firebase_uid = p_uid;

  if p_xp is not null then
    insert into public.player_progression (firebase_uid, xp) values (p_uid, p_xp)
      on conflict (firebase_uid) do update set xp = excluded.xp, updated_at = now();
  end if;

  perform app.admin_notiz('spieler-bearbeitet', p_uid,
    jsonb_build_object('vorher', vorher,
                       'nachher', jsonb_build_object('currency', p_currency, 'nickname', p_nickname, 'xp', p_xp)));
end
$$;

create or replace function public.admin_spieler_setzen(
  p_uid text, p_currency integer default null, p_xp integer default null, p_nickname text default null
) returns void
language sql
as $$ select app.admin_spieler_setzen(p_uid, p_currency, p_xp, p_nickname) $$;


/* ======================================================
   6. RECHTE
====================================================== */
grant execute on function app.admin_statusbrett()                     to authenticated;
grant execute on function public.admin_statusbrett()                  to authenticated;
grant execute on function app.admin_name_sperren(text, text)          to authenticated;
grant execute on function public.admin_name_sperren(text, text)       to authenticated;
grant execute on function app.admin_name_entsperren(text)             to authenticated;
grant execute on function public.admin_name_entsperren(text)          to authenticated;
grant execute on function app.admin_gesperrte_namen()                 to authenticated;
grant execute on function public.admin_gesperrte_namen()              to authenticated;
grant execute on function app.admin_spieler_suchen(text)              to authenticated;
grant execute on function public.admin_spieler_suchen(text)           to authenticated;
grant execute on function app.admin_spieler_setzen(text, integer, integer, text)    to authenticated;
grant execute on function public.admin_spieler_setzen(text, integer, integer, text) to authenticated;
