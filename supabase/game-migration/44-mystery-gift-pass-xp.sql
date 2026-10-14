/* ======================================================
   MYSTERY GIFT IM SHOP + PIRATENPASS-XP VERTEILEN
   ------------------------------------------------------
   1. MYSTERY GIFT
      Ein Geschenk, das Aendii selbst aussucht und uebergibt. Kostet
      100.000 Dublonen und steht nur selten im Shop: in etwa jeder
      zwanzigsten Stunde (5 %). Welche Stunde das ist, folgt aus
      einer festen Rechnung, die der Browser genauso anstellt
      (scripts/shop/mystery-gift.js) - alle sehen dasselbe Angebot.

      Der Kauf laeuft komplett hier (mystery_gift_kaufen): Angebot
      pruefen, Dublonen abziehen, Kauf festhalten - in EINER
      Transaktion. Der Browser kann also keinen Kauf vortaeuschen,
      ohne zu bezahlen, und keinen ausserhalb des Angebots taetigen.
      Je Angebotsstunde einmal pro Spieler (doppelter Klick kostet
      nicht doppelt).

      Im Admin-Bereich stehen alle Kaeufe (admin_mystery_gift_kaeufe)
      und lassen sich als erledigt abhaken (admin_mystery_gift_erledigt).

   2. PIRATENPASS-XP VERTEILEN
      Wie Dublonen und Skillpunkte: an alle Anwesenden ueber einen
      Live-Grant (Art 'pass_xp') oder direkt an einen Spieler. Die
      Saison (pass_id) schickt der Admin-Browser mit, weil sie im
      Browser aus dem Datum folgt (PIRATE_PASSES in progression-
      data.js). Gutgeschrieben wird wie bei XP-Codes (19): laeuft
      beim Spieler dieselbe Saison, wird addiert, sonst beginnt der
      Pass bei diesem Betrag. 1 bis 5000 je Vergabe (live_grants_
      wert_sane aus 23).

   app.live_grant_einloesen() wird WORTGLEICH aus 27 uebernommen,
   ergaenzt um den Block "Piratenpass-XP (NEU in 44)". Die
   Positivliste live_grants_art_bekannt wird - wie in 24 und 27 -
   ersetzt (eine zweite Bedingung koennte sie nur einschraenken).

   REIHENFOLGE: nach 43 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. MYSTERY GIFT
====================================================== */

/* Steht das Geschenk in dieser Stunde im Shop? Multiplikativer
   Hash der Stundennummer seit 1970 (Knuth), unterste 32 Bit, unter
   5 % von 2^32. Der Browser rechnet dasselbe mit Math.imul. */
create or replace function app.mystery_gift_stunde(p_zeit timestamptz default now()) returns bigint
language sql immutable set search_path = pg_catalog
as $$ select floor(extract(epoch from p_zeit) / 3600)::bigint $$;

create or replace function app.mystery_gift_im_angebot(p_zeit timestamptz default now()) returns boolean
language sql immutable set search_path = public, app, pg_temp
as $$
  select (app.mystery_gift_stunde(p_zeit) * 2654435761) % 4294967296 < 214748365
$$;

create table if not exists public.mystery_gift_kaeufe (
  id             bigint generated always as identity primary key,
  firebase_uid   text not null,
  spielername    text,
  preis          integer not null,
  angebot_stunde bigint not null,
  gekauft_am     timestamptz not null default now(),
  erledigt_am    timestamptz,
  constraint mystery_gift_einmal_je_angebot unique (firebase_uid, angebot_stunde),
  constraint mystery_gift_preis_positiv check (preis > 0)
);

alter table public.mystery_gift_kaeufe enable row level security;
alter table public.mystery_gift_kaeufe force row level security;
revoke all on public.mystery_gift_kaeufe from anon, authenticated;

create or replace function app.mystery_gift_kaufen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  preis  constant integer := 100000;
  stunde bigint := app.mystery_gift_stunde(now());
  sp     public.players;
  kauf   bigint;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  if not app.mystery_gift_im_angebot(now()) then
    return jsonb_build_object('ok', false, 'grund', 'nicht-im-angebot');
  end if;

  /* "Schon gekauft" vor "zu wenig": nach dem Kauf reicht das Geld
     meist nicht mehr, und dann waere die Meldung irrefuehrend. */
  if exists (select 1 from public.mystery_gift_kaeufe k
              where k.firebase_uid = uid and k.angebot_stunde = stunde) then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;

  /* Zeile sperren: zwei gleichzeitige Kaeufe lesen sonst denselben
     Kontostand. Der eindeutige Schluessel unten faengt den Rest ab. */
  select * into sp from public.players where firebase_uid = uid for update;
  if not found or coalesce(sp.currency, 0) < preis then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig');
  end if;

  insert into public.mystery_gift_kaeufe (firebase_uid, spielername, preis, angebot_stunde)
       values (uid, sp.nickname, preis, stunde)
  on conflict (firebase_uid, angebot_stunde) do nothing
  returning id into kauf;
  if kauf is null then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;

  update public.players set currency = currency - preis where firebase_uid = uid;

  return jsonb_build_object('ok', true, 'kauf', kauf, 'currency', sp.currency - preis);
end
$$;

/* Wrapper als security definer - das Schema app hat kein USAGE-Recht
   fuer authenticated (Begruendung wie bei xp_code_einloesen in 19). */
create or replace function public.mystery_gift_kaufen() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mystery_gift_kaufen() $$;

revoke execute on function app.mystery_gift_kaufen()    from public, anon;
revoke execute on function public.mystery_gift_kaufen() from public, anon;
grant  execute on function app.mystery_gift_kaufen()    to authenticated;
grant  execute on function public.mystery_gift_kaufen() to authenticated;


/* ---- Admin: Kaeufe ansehen und abhaken ---- */
create or replace function app.admin_mystery_gift_kaeufe()
  returns table (id bigint, firebase_uid text, spielername text, preis integer,
                 gekauft_am timestamptz, erledigt_am timestamptz)
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  /* Offene zuerst, darin die neuesten oben. Der Name wird aktuell
     nachgeschlagen (falls sich jemand inzwischen umbenannt hat). */
  return query
    select k.id, k.firebase_uid, coalesce(p.nickname, k.spielername), k.preis,
           k.gekauft_am, k.erledigt_am
      from public.mystery_gift_kaeufe k
      left join public.players p on p.firebase_uid = k.firebase_uid
     order by (k.erledigt_am is null) desc, k.gekauft_am desc
     limit 200;
end
$$;

create or replace function app.admin_mystery_gift_erledigt(p_id bigint, p_erledigt boolean) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  update public.mystery_gift_kaeufe
     set erledigt_am = case when p_erledigt then coalesce(erledigt_am, now()) else null end
   where id = p_id;
  return found;
end
$$;

create or replace function public.admin_mystery_gift_kaeufe()
  returns table (id bigint, firebase_uid text, spielername text, preis integer,
                 gekauft_am timestamptz, erledigt_am timestamptz)
language sql security definer set search_path = public, app, pg_temp
as $$ select * from app.admin_mystery_gift_kaeufe() $$;

create or replace function public.admin_mystery_gift_erledigt(p_id bigint, p_erledigt boolean) returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_mystery_gift_erledigt(p_id, p_erledigt) $$;

revoke execute on function app.admin_mystery_gift_kaeufe()                     from public, anon;
revoke execute on function public.admin_mystery_gift_kaeufe()                  from public, anon;
revoke execute on function app.admin_mystery_gift_erledigt(bigint, boolean)    from public, anon;
revoke execute on function public.admin_mystery_gift_erledigt(bigint, boolean) from public, anon;
grant  execute on function app.admin_mystery_gift_kaeufe()                     to authenticated;
grant  execute on function public.admin_mystery_gift_kaeufe()                  to authenticated;
grant  execute on function app.admin_mystery_gift_erledigt(bigint, boolean)    to authenticated;
grant  execute on function public.admin_mystery_gift_erledigt(bigint, boolean) to authenticated;


/* ======================================================
   2. PIRATENPASS-XP
====================================================== */
alter table public.live_grants add column if not exists pass_id text;

alter table public.live_grants drop constraint if exists live_grants_art_bekannt;
alter table public.live_grants add constraint live_grants_art_bekannt
  check (art in ('dublonen', 'avatar', 'skillpunkte', 'titel', 'pass_xp'));   -- 44: 'pass_xp'

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_grants_pass_xp_saison') then
    alter table public.live_grants add constraint live_grants_pass_xp_saison
      /* "is not null" ausdruecklich: ein Vergleich mit NULL ergibt NULL,
       und eine CHECK-Regel mit NULL gilt als erfuellt. */
      check (art <> 'pass_xp' or (wert >= 1 and pass_id is not null and pass_id ~ '^[a-z0-9_-]{1,40}$'));
  end if;
end $$;

/* Pass-XP einem Spieler gutschreiben - wie xp_code_einloesen (19). */
create or replace function app.pass_xp_gutschreiben(p_uid text, p_xp integer, p_pass_id text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  insert into public.player_progression (firebase_uid, xp, pass_id, pass_xp)
       values (p_uid, 0, p_pass_id, p_xp)
  on conflict (firebase_uid) do update
     set pass_id = p_pass_id,
         pass_xp = case when public.player_progression.pass_id is not distinct from p_pass_id
                        then coalesce(public.player_progression.pass_xp, 0) + p_xp
                        else p_xp end,
         updated_at = now();
end
$$;
revoke execute on function app.pass_xp_gutschreiben(text, integer, text) from public, anon, authenticated;

create or replace function app.pass_xp_pruefen(p_xp integer, p_pass_id text) returns void
language plpgsql immutable set search_path = pg_catalog
as $$
begin
  if p_xp is null or p_xp < 1 or p_xp > 5000 then
    raise exception 'pass-xp-1-bis-5000';
  end if;
  if p_pass_id is null or p_pass_id !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'keine-saison';
  end if;
end
$$;

/* An alle Anwesenden: Grant anlegen, live_event darauf zeigen lassen. */
create or replace function app.admin_pass_xp_an_alle(p_xp integer, p_pass_id text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  gid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  perform app.pass_xp_pruefen(p_xp, p_pass_id);
  gid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_grants (grant_id, art, wert, pass_id) values (gid, 'pass_xp', p_xp, p_pass_id);
  update public.live_event
     set grant_id = gid, grant_at = now(), updated_at = now()
   where id = 1;
  return gid;
end
$$;

/* An einen Spieler: direkt gutschreiben. */
create or replace function app.admin_pass_xp_an_spieler(p_uid text, p_xp integer, p_pass_id text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  perform app.pass_xp_pruefen(p_xp, p_pass_id);
  if not exists (select 1 from public.players where firebase_uid = p_uid) then
    raise exception 'spieler-unbekannt';
  end if;
  perform app.pass_xp_gutschreiben(p_uid, p_xp, p_pass_id);
  return p_xp;
end
$$;

create or replace function public.admin_pass_xp_an_alle(p_xp integer, p_pass_id text) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_pass_xp_an_alle(p_xp, p_pass_id) $$;

create or replace function public.admin_pass_xp_an_spieler(p_uid text, p_xp integer, p_pass_id text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_pass_xp_an_spieler(p_uid, p_xp, p_pass_id) $$;

revoke execute on function app.admin_pass_xp_an_alle(integer, text)              from public, anon;
revoke execute on function public.admin_pass_xp_an_alle(integer, text)           from public, anon;
revoke execute on function app.admin_pass_xp_an_spieler(text, integer, text)     from public, anon;
revoke execute on function public.admin_pass_xp_an_spieler(text, integer, text)  from public, anon;
grant  execute on function app.admin_pass_xp_an_alle(integer, text)              to authenticated;
grant  execute on function public.admin_pass_xp_an_alle(integer, text)           to authenticated;
grant  execute on function app.admin_pass_xp_an_spieler(text, integer, text)     to authenticated;
grant  execute on function public.admin_pass_xp_an_spieler(text, integer, text)  to authenticated;


/* ======================================================
   3. EINLOESEN
   Wortgleich aus 27-event-titel.sql, ergaenzt um den Block
   "Piratenpass-XP (NEU in 44)".
====================================================== */
create or replace function app.live_grant_einloesen(p_grant text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  g      public.live_grants;
  neu    boolean;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into g from public.live_grants where grant_id = p_grant;
  if not found or g.angelegt_am < now() - interval '2 hours' then
    return -1;
  end if;

  insert into public.live_grant_einloesungen (firebase_uid, grant_id)
    values (uid, p_grant) on conflict do nothing;
  get diagnostics neu = row_count;
  if not neu then
    return 0;
  end if;

  if g.art = 'skillpunkte' then
    insert into public.player_progression (firebase_uid) values (uid)
      on conflict (firebase_uid) do nothing;
    /* least(): der Deckel aus 22 (bonus_skill_points <= 500) soll
       das Einloesen nicht scheitern lassen, sondern nur kappen. */
    update public.player_progression
       set bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + g.wert),
           updated_at = now()
     where firebase_uid = uid;
    return g.wert;
  end if;

  /* Piratenpass-XP (NEU in 44): wie ein XP-Code gutschreiben. */
  if g.art = 'pass_xp' then
    perform app.pass_xp_gutschreiben(uid, g.wert, g.pass_id);
    return g.wert;
  end if;

  /* Event-Titel (NEU in 27): dem Spieler zuordnen. Die Rueckgabe 1
     heisst wie beim Avatar "bekommen". */
  if g.art = 'titel' then
    insert into public.spieler_event_titel (firebase_uid, titel_id)
      values (uid, g.titel_id) on conflict do nothing;
    return 1;
  end if;

  /* Spielerzeile sicherstellen. */
  insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;

  if g.art = 'dublonen' then
    update public.players
       set currency = currency + g.wert
     where firebase_uid = uid;
    return g.wert;
  else
    /* Avatar: in unlocked_avatars aufnehmen, falls noch nicht da. */
    update public.players
       set unlocked_avatars = case
             when g.avatar_id = any(coalesce(unlocked_avatars, '{}')) then unlocked_avatars
             else array_append(coalesce(unlocked_avatars, '{}'), g.avatar_id) end
     where firebase_uid = uid;
    return 1;
  end if;
end
$$;
