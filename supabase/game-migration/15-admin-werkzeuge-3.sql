/* ======================================================
   ADMIN-WERKZEUGE, RUNDE 3
   Cap-Zusagen, Support-Meldungen, Verlosung
   ---------------------------------------------------
   Baut auf 13-admin-werkzeuge.sql auf (app.admin_notiz()).

   Ankuendigung und Wartungshinweis brauchen hier nichts: die liegen
   als zwei zusaetzliche Felder im site_config-Blob, und der ist fuer
   den Admin ohnehin schon beschreibbar (site_config_write_admin).
====================================================== */


/* ======================================================
   1. CAP-ZUSAGEN
   ---------------------------------------------------
   pass_cap_grants haelt fest, WER eine Cap zugesagt bekommen hat;
   pass_cap_state.granted ist der Zaehler, an dem die Grenze von 4
   haengt. Beide muessen zusammen bewegt werden - deshalb hier
   ausschliesslich ueber Funktionen und nie von Hand.
====================================================== */
create or replace function app.admin_caps()
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare erg jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select jsonb_build_object(
    'vergeben', (select granted from public.pass_cap_state where id = 'cap'),
    'grenze', 4,
    'zusagen', (select coalesce(jsonb_agg(jsonb_build_object(
                         'uid', firebase_uid, 'name', nickname,
                         'pass', pass_id, 'wann', claimed_at) order by claimed_at), '[]'::jsonb)
                  from public.pass_cap_grants)
  ) into erg;
  return erg;
end
$$;

create or replace function public.admin_caps() returns jsonb
language sql
as $$ select app.admin_caps() $$;

create or replace function app.admin_cap_vergeben(p_uid text, p_nickname text, p_pass_id text default 'admin')
returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare stand integer;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  if char_length(coalesce(btrim(p_nickname), '')) not between 1 and 30 then
    raise exception 'name-laenge';
  end if;

  select granted into stand from public.pass_cap_state where id = 'cap' for update;
  if stand >= 4 then
    raise exception 'alle-vier-schon-vergeben';
  end if;
  if exists (select 1 from public.pass_cap_grants where firebase_uid = p_uid) then
    raise exception 'hat-schon-eine-cap';
  end if;

  insert into public.pass_cap_grants (firebase_uid, nickname, pass_id)
       values (p_uid, btrim(p_nickname), p_pass_id);
  update public.pass_cap_state set granted = granted + 1 where id = 'cap'
    returning granted into stand;

  perform app.admin_notiz('cap-vergeben', p_uid, jsonb_build_object('name', p_nickname, 'stand', stand));
  return stand;
end
$$;

create or replace function public.admin_cap_vergeben(p_uid text, p_nickname text, p_pass_id text default 'admin')
returns integer
language sql
as $$ select app.admin_cap_vergeben(p_uid, p_nickname, p_pass_id) $$;

/* Eine Zusage zuruecknehmen. Das ist ein Wortbruch gegenueber der
   Person - gedacht nur fuer Fehleintraege, deshalb steht der Grund
   im Protokoll. */
create or replace function app.admin_cap_zuruecknehmen(p_uid text, p_grund text default null)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare stand integer; weg int;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  delete from public.pass_cap_grants where firebase_uid = p_uid;
  get diagnostics weg = row_count;
  if weg = 0 then
    raise exception 'keine-zusage-vorhanden';
  end if;

  update public.pass_cap_state set granted = greatest(granted - 1, 0) where id = 'cap'
    returning granted into stand;

  perform app.admin_notiz('cap-zurueckgenommen', p_uid, jsonb_build_object('grund', p_grund, 'stand', stand));
  return stand;
end
$$;

create or replace function public.admin_cap_zuruecknehmen(p_uid text, p_grund text default null)
returns integer
language sql
as $$ select app.admin_cap_zuruecknehmen(p_uid, p_grund) $$;


/* ======================================================
   2. SUPPORT-MELDUNGEN
   ---------------------------------------------------
   support_reports hat bewusst KEINE select-Policy: was jemand
   meldet, geht andere Besucher nichts an. Bisher kam man deshalb nur
   ueber das Supabase-Dashboard heran. Ab hier gibt es einen Weg fuers
   Panel - weiterhin nur fuer den Admin.
====================================================== */
alter table public.support_reports
  add column if not exists erledigt boolean not null default false;

create or replace function app.admin_support_liste(p_nur_offene boolean default true)
returns table (id bigint, nachricht text, nickname text, seite text, wann timestamptz, erledigt boolean)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select r.id, r.message, r.nickname, r.page, r.created_at, r.erledigt
      from public.support_reports r
     where (not p_nur_offene) or (not r.erledigt)
     order by r.created_at desc
     limit 100;
end
$$;

create or replace function public.admin_support_liste(p_nur_offene boolean default true)
returns table (id bigint, nachricht text, nickname text, seite text, wann timestamptz, erledigt boolean)
language sql
as $$ select * from app.admin_support_liste(p_nur_offene) $$;

create or replace function app.admin_support_erledigt(p_id bigint, p_erledigt boolean default true)
returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  update public.support_reports set erledigt = p_erledigt where id = p_id;
  if not found then
    raise exception 'meldung-unbekannt';
  end if;
end
$$;

create or replace function public.admin_support_erledigt(p_id bigint, p_erledigt boolean default true) returns void
language sql
as $$ select app.admin_support_erledigt(p_id, p_erledigt) $$;

create or replace function app.admin_support_loeschen(p_id bigint) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  delete from public.support_reports where id = p_id;
  perform app.admin_notiz('support-geloescht', p_id::text, null);
end
$$;

create or replace function public.admin_support_loeschen(p_id bigint) returns void
language sql
as $$ select app.admin_support_loeschen(p_id) $$;


/* ======================================================
   3. VERLOSUNG
   ---------------------------------------------------
   Gezogen wird bisher im Browser: der erste Besucher, der die Seite
   nach Ende der Verlosung oeffnet, wuerfelt die Gewinner mit einem
   festen Startwert aus der Runden-ID (deshalb kommen bei allen
   dieselben heraus) und schreibt sie in giveaway_winners; der
   Primaerschluessel verhindert ein zweites Ziehen.

   Das bleibt unangetastet. Hier kommt nur der Fall dazu, dass DU
   ziehen willst - dann wird wirklich zufaellig gezogen und ein
   vorhandenes Ergebnis ueberschrieben.
====================================================== */
create or replace function app.admin_verlosung_uebersicht()
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare erg jsonb;
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;

  select jsonb_build_object(
    'runden', (select coalesce(jsonb_agg(jsonb_build_object(
                        'runde', giveaway_id, 'lose', anzahl,
                        'gezogen', (select w.winners from public.giveaway_winners w where w.round_id = e.giveaway_id))
                        order by giveaway_id desc), '[]'::jsonb)
                 from (select giveaway_id, count(*) as anzahl
                         from public.giveaway_entries group by giveaway_id) e)
  ) into erg;
  return erg;
end
$$;

create or replace function public.admin_verlosung_uebersicht() returns jsonb
language sql
as $$ select app.admin_verlosung_uebersicht() $$;

create or replace function app.admin_verlosung_lose(p_round_id text)
returns table (firebase_uid text, nickname text, wann timestamptz)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  return query
    select e.firebase_uid, e.nickname, e.joined_at
      from public.giveaway_entries e
     where e.giveaway_id = p_round_id
     order by e.joined_at
     limit 500;
end
$$;

create or replace function public.admin_verlosung_lose(p_round_id text)
returns table (firebase_uid text, nickname text, wann timestamptz)
language sql
as $$ select * from app.admin_verlosung_lose(p_round_id) $$;

create or replace function app.admin_verlosung_ziehen(p_round_id text, p_anzahl integer default 1)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
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

create or replace function public.admin_verlosung_ziehen(p_round_id text, p_anzahl integer default 1)
returns jsonb
language sql
as $$ select app.admin_verlosung_ziehen(p_round_id, p_anzahl) $$;

create or replace function app.admin_verlosung_los_entfernen(p_round_id text, p_uid text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'not-admin';
  end if;
  delete from public.giveaway_entries where giveaway_id = p_round_id and firebase_uid = p_uid;
  perform app.admin_notiz('verlosung-los-entfernt', p_round_id, jsonb_build_object('uid', p_uid));
end
$$;

create or replace function public.admin_verlosung_los_entfernen(p_round_id text, p_uid text) returns void
language sql
as $$ select app.admin_verlosung_los_entfernen(p_round_id, p_uid) $$;


/* ======================================================
   4. RECHTE
====================================================== */
grant execute on function app.admin_caps()                                    to authenticated;
grant execute on function public.admin_caps()                                 to authenticated;
grant execute on function app.admin_cap_vergeben(text, text, text)            to authenticated;
grant execute on function public.admin_cap_vergeben(text, text, text)         to authenticated;
grant execute on function app.admin_cap_zuruecknehmen(text, text)             to authenticated;
grant execute on function public.admin_cap_zuruecknehmen(text, text)          to authenticated;
grant execute on function app.admin_support_liste(boolean)                    to authenticated;
grant execute on function public.admin_support_liste(boolean)                 to authenticated;
grant execute on function app.admin_support_erledigt(bigint, boolean)         to authenticated;
grant execute on function public.admin_support_erledigt(bigint, boolean)      to authenticated;
grant execute on function app.admin_support_loeschen(bigint)                  to authenticated;
grant execute on function public.admin_support_loeschen(bigint)               to authenticated;
grant execute on function app.admin_verlosung_uebersicht()                    to authenticated;
grant execute on function public.admin_verlosung_uebersicht()                 to authenticated;
grant execute on function app.admin_verlosung_lose(text)                      to authenticated;
grant execute on function public.admin_verlosung_lose(text)                   to authenticated;
grant execute on function app.admin_verlosung_ziehen(text, integer)           to authenticated;
grant execute on function public.admin_verlosung_ziehen(text, integer)        to authenticated;
grant execute on function app.admin_verlosung_los_entfernen(text, text)       to authenticated;
grant execute on function public.admin_verlosung_los_entfernen(text, text)    to authenticated;
