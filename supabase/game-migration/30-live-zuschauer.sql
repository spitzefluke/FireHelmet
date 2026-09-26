/* ======================================================
   LIVE-EVENT FUER ZUSCHAUER: EVENT-START, LOGBUCH,
   CREW-ABSTIMMUNG, ABZEICHEN "WAR DABEI"
   ---------------------------------------------------
   Umsetzung des Claude-Design-Entwurfs "Live-Event Zuschauer",
   so wie der Betreiber es festgelegt hat.

   EVENT
   Der Admin startet ein Event mit Namen und Countdown (3-60 s).
   live_event.event_id / event_name / event_live_ab zeigen es allen
   an (Realtime aus 23). Bis event_live_ab laeuft der Countdown,
   danach ist das Event "live" - bis admin_event_beenden().
   Ein neuer Event-Start beendet auch einen gehackten Zustand
   (story = 'ende' aus 29): "bis zum naechsten Live-Event".

   LOGBUCH
   Kurze Eintraege je Event ("Crew-Abstimmung laeuft" ...). Lesen
   darf jeder, schreiben nur der Admin (RLS) - die Admin-Funktionen
   hier tragen selbst ein, das Panel ergaenzt Story-Starts.

   ABSTIMMUNG
   Frage und zwei Antworten vom Admin, 10-300 s. Eine Stimme je
   Spieler (Primaerschluessel). Wer wie gestimmt hat, sieht
   niemand; live_abstimmung_stand() gibt nur die Summen und die
   eigene Wahl heraus.

   ABZEICHEN
   Zu jedem Event legt admin_event_starten() ein Abzeichen "War
   dabei: <Name>" an. Wer waehrend des Events auf der Seite ist,
   holt es sich mit live_war_dabei() - einmal je Spieler, nur
   solange das Event laeuft (plus 10 Minuten Nachlauf). Die Art
   'gegenhacker' ist fuer die Quest aus 31 vorgesehen.

   REIHENFOLGE: nach 29 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. EVENTS UND ZUSTAND
====================================================== */
create table if not exists public.live_events (
  event_id    text primary key,
  name        text not null,
  countdown_ab timestamptz not null default now(),
  live_ab     timestamptz not null,
  beendet_am  timestamptz,
  constraint live_events_name_len check (char_length(btrim(name)) between 1 and 60)
);

alter table public.live_events enable row level security;
alter table public.live_events force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'live_events' and policyname = 'live_events_select_public') then
    create policy "live_events_select_public" on public.live_events
      for select to anon, authenticated using (true);
  end if;
end $$;

alter table public.live_event
  add column if not exists event_id       text,
  add column if not exists event_name     text,
  add column if not exists event_live_ab  timestamptz,
  add column if not exists abstimmung_id  text;

alter table public.live_event drop constraint if exists live_event_event_name_len;
alter table public.live_event add constraint live_event_event_name_len
  check (event_name is null or char_length(event_name) <= 60);


/* ======================================================
   2. LOGBUCH
====================================================== */
create table if not exists public.live_logbuch (
  id       bigserial primary key,
  event_id text not null references public.live_events(event_id) on delete cascade,
  text     text not null,
  am       timestamptz not null default now(),
  constraint live_logbuch_text_len check (char_length(btrim(text)) between 1 and 140)
);

create index if not exists live_logbuch_event_am on public.live_logbuch (event_id, am desc);

alter table public.live_logbuch enable row level security;
alter table public.live_logbuch force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'live_logbuch' and policyname = 'live_logbuch_select_public') then
    create policy "live_logbuch_select_public" on public.live_logbuch
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'live_logbuch' and policyname = 'live_logbuch_insert_admin') then
    create policy "live_logbuch_insert_admin" on public.live_logbuch
      for insert to authenticated with check (app.is_admin());
  end if;
end $$;

revoke update, delete on public.live_logbuch from anon, authenticated;
grant select on public.live_logbuch to anon, authenticated;
grant insert on public.live_logbuch to authenticated;
grant usage on sequence public.live_logbuch_id_seq to authenticated;


/* ======================================================
   3. ABZEICHEN
====================================================== */
create table if not exists public.event_abzeichen (
  abzeichen_id text primary key,
  art          text not null,
  titel        text not null,
  event_id     text references public.live_events(event_id) on delete set null,
  am           timestamptz not null default now(),
  constraint event_abzeichen_art_bekannt check (art in ('dabei', 'gegenhacker')),
  constraint event_abzeichen_titel_len check (char_length(btrim(titel)) between 1 and 80)
);

alter table public.event_abzeichen enable row level security;
alter table public.event_abzeichen force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'event_abzeichen' and policyname = 'event_abzeichen_select_public') then
    create policy "event_abzeichen_select_public" on public.event_abzeichen
      for select to anon, authenticated using (true);
  end if;
end $$;

create table if not exists public.spieler_abzeichen (
  firebase_uid text not null,
  abzeichen_id text not null references public.event_abzeichen(abzeichen_id) on delete cascade,
  erhalten_am  timestamptz not null default now(),
  primary key (firebase_uid, abzeichen_id)
);

alter table public.spieler_abzeichen enable row level security;
alter table public.spieler_abzeichen force row level security;
-- Keine Policy: lesen und schreiben nur ueber die Funktionen unten.
revoke all on public.spieler_abzeichen from anon, authenticated;


/* ======================================================
   4. ABSTIMMUNG
====================================================== */
create table if not exists public.live_abstimmungen (
  abst_id   text primary key,
  event_id  text references public.live_events(event_id) on delete set null,
  frage     text not null,
  antwort_a text not null,
  antwort_b text not null,
  ab        timestamptz not null default now(),
  bis       timestamptz not null,
  constraint live_abst_frage_len check (char_length(btrim(frage)) between 1 and 120),
  constraint live_abst_a_len     check (char_length(btrim(antwort_a)) between 1 and 40),
  constraint live_abst_b_len     check (char_length(btrim(antwort_b)) between 1 and 40)
);

alter table public.live_abstimmungen enable row level security;
alter table public.live_abstimmungen force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'live_abstimmungen' and policyname = 'live_abstimmungen_select_public') then
    create policy "live_abstimmungen_select_public" on public.live_abstimmungen
      for select to anon, authenticated using (true);
  end if;
end $$;

create table if not exists public.live_stimmen (
  abst_id      text not null references public.live_abstimmungen(abst_id) on delete cascade,
  firebase_uid text not null,
  wahl         text not null,
  am           timestamptz not null default now(),
  primary key (abst_id, firebase_uid),
  constraint live_stimmen_wahl check (wahl in ('a', 'b'))
);

alter table public.live_stimmen enable row level security;
alter table public.live_stimmen force row level security;
revoke all on public.live_stimmen from anon, authenticated;


/* ======================================================
   5. ADMIN-FUNKTIONEN
====================================================== */

/* Event starten: Zustandszeile setzen, Event + Abzeichen anlegen,
   einen gehackten Zustand beenden, Logbuch beginnen. */
create or replace function app.admin_event_starten(p_name text, p_sekunden integer) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  eid  text := encode(extensions.gen_random_bytes(9), 'hex');
  name text := btrim(coalesce(p_name, ''));
  sek  integer := greatest(3, least(60, coalesce(p_sekunden, 10)));
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if char_length(name) < 1 or char_length(name) > 60 then
    raise exception 'event-name-ungueltig';
  end if;

  /* Ein noch laufendes Event gilt damit als beendet. */
  update public.live_events set beendet_am = now()
   where beendet_am is null;

  insert into public.live_events (event_id, name, countdown_ab, live_ab)
       values (eid, name, now(), now() + make_interval(secs => sek));
  insert into public.event_abzeichen (abzeichen_id, art, titel, event_id)
       values ('dabei-' || eid, 'dabei', left('War dabei: ' || name, 80), eid);
  insert into public.live_logbuch (event_id, text) values (eid, 'Event gestartet');

  update public.live_event
     set event_id = eid, event_name = name, event_live_ab = now() + make_interval(secs => sek),
         abstimmung_id = null,
         /* "bis zum naechsten Live-Event": gehackte Seite aufraeumen */
         story = case when story = 'ende' then null else story end,
         story_id = case when story = 'ende' then null else story_id end,
         story_at = case when story = 'ende' then null else story_at end,
         story_ende_at = case when story = 'ende' then null else story_ende_at end,
         updated_at = now()
   where id = 1;
  return eid;
end
$$;

create or replace function app.admin_event_beenden() returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  eid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select event_id into eid from public.live_event where id = 1;
  if eid is null then
    return false;
  end if;
  update public.live_events set beendet_am = now() where event_id = eid and beendet_am is null;
  insert into public.live_logbuch (event_id, text) values (eid, 'Event beendet');
  update public.live_event
     set event_id = null, event_name = null, event_live_ab = null, abstimmung_id = null, updated_at = now()
   where id = 1;
  return true;
end
$$;

/* Abstimmung starten (nur waehrend eines Events). */
create or replace function app.admin_abstimmung_starten(p_frage text, p_a text, p_b text, p_sekunden integer) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  aid text := encode(extensions.gen_random_bytes(9), 'hex');
  eid text;
  sek integer := greatest(10, least(300, coalesce(p_sekunden, 60)));
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  select event_id into eid from public.live_event where id = 1;
  if eid is null then
    raise exception 'kein-event';
  end if;
  insert into public.live_abstimmungen (abst_id, event_id, frage, antwort_a, antwort_b, ab, bis)
       values (aid, eid, btrim(p_frage), btrim(p_a), btrim(p_b), now(), now() + make_interval(secs => sek));
  insert into public.live_logbuch (event_id, text) values (eid, left('Crew-Abstimmung: ' || btrim(p_frage), 140));
  update public.live_event set abstimmung_id = aid, updated_at = now() where id = 1;
  return aid;
end
$$;

create or replace function public.admin_event_starten(p_name text, p_sekunden integer) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_event_starten(p_name, p_sekunden) $$;
create or replace function public.admin_event_beenden() returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_event_beenden() $$;
create or replace function public.admin_abstimmung_starten(p_frage text, p_a text, p_b text, p_sekunden integer) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_abstimmung_starten(p_frage, p_a, p_b, p_sekunden) $$;


/* ======================================================
   6. FUER ALLE: ABSTIMMEN, STAND, ABZEICHEN
====================================================== */

/* 1 = gezaehlt, 0 = schon abgestimmt, -1 = nicht (mehr) offen. */
create or replace function app.live_abstimmen(p_abst text, p_wahl text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_wahl not in ('a', 'b') then
    return -1;
  end if;
  if not exists (select 1 from public.live_abstimmungen where abst_id = p_abst and now() between ab and bis) then
    return -1;
  end if;
  insert into public.live_stimmen (abst_id, firebase_uid, wahl) values (p_abst, uid, p_wahl)
  on conflict do nothing;
  return case when found then 1 else 0 end;
end
$$;

/* Summen und die eigene Wahl - nie, wer sonst wie gestimmt hat. */
create or replace function app.live_abstimmung_stand(p_abst text)
  returns table (a integer, b integer, meine text)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select (count(*) filter (where s.wahl = 'a'))::integer,
         (count(*) filter (where s.wahl = 'b'))::integer,
         (select m.wahl from public.live_stimmen m where m.abst_id = p_abst and m.firebase_uid = app.firebase_uid())
    from public.live_stimmen s
   where s.abst_id = p_abst
$$;

/* Abzeichen "War dabei" fuer das laufende Event holen.
   {"ok": true, "neu": true|false, "titel": "..."} oder {"ok": false}. */
create or replace function app.live_war_dabei(p_event text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  ev  public.live_events;
  az  public.event_abzeichen;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into ev from public.live_events where event_id = p_event;
  if not found or now() < ev.countdown_ab
     or (ev.beendet_am is not null and now() > ev.beendet_am + interval '10 minutes') then
    return jsonb_build_object('ok', false);
  end if;
  select * into az from public.event_abzeichen where event_id = p_event and art = 'dabei';
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.spieler_abzeichen (firebase_uid, abzeichen_id) values (uid, az.abzeichen_id)
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'neu', found, 'titel', az.titel);
end
$$;

/* Fuer die Rangliste: Zahl der Abzeichen und das neueste je Spieler. */
create or replace function app.abzeichen_je_spieler()
  returns table (firebase_uid text, anzahl integer, titel text, art text)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select distinct on (s.firebase_uid) s.firebase_uid,
         (count(*) over (partition by s.firebase_uid))::integer,
         a.titel, a.art
    from public.spieler_abzeichen s
    join public.event_abzeichen a on a.abzeichen_id = s.abzeichen_id
   order by s.firebase_uid, s.erhalten_am desc, a.abzeichen_id
$$;

/* Fuer die Sammlung: alle Abzeichen, mit Kennzeichen, ob ich es habe,
   und wie viele es haben ("an Bord"). */
create or replace function app.meine_abzeichen()
  returns table (abzeichen_id text, art text, titel text, am timestamptz, habe boolean, erhalten_am timestamptz, anzahl integer)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select a.abzeichen_id, a.art, a.titel, a.am,
         m.firebase_uid is not null, m.erhalten_am,
         (select count(*)::integer from public.spieler_abzeichen x where x.abzeichen_id = a.abzeichen_id)
    from public.event_abzeichen a
    left join public.spieler_abzeichen m on m.abzeichen_id = a.abzeichen_id and m.firebase_uid = app.firebase_uid()
   order by a.am desc
$$;

create or replace function public.live_abstimmen(p_abst text, p_wahl text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.live_abstimmen(p_abst, p_wahl) $$;
create or replace function public.live_abstimmung_stand(p_abst text)
  returns table (a integer, b integer, meine text)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.live_abstimmung_stand(p_abst) $$;
create or replace function public.live_war_dabei(p_event text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.live_war_dabei(p_event) $$;
create or replace function public.abzeichen_je_spieler()
  returns table (firebase_uid text, anzahl integer, titel text, art text)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.abzeichen_je_spieler() $$;
create or replace function public.meine_abzeichen()
  returns table (abzeichen_id text, art text, titel text, am timestamptz, habe boolean, erhalten_am timestamptz, anzahl integer)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.meine_abzeichen() $$;


/* ======================================================
   7. RECHTE
   "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28).
====================================================== */
revoke execute on function app.admin_event_starten(text, integer)                  from public, anon;
revoke execute on function public.admin_event_starten(text, integer)               from public, anon;
revoke execute on function app.admin_event_beenden()                               from public, anon;
revoke execute on function public.admin_event_beenden()                            from public, anon;
revoke execute on function app.admin_abstimmung_starten(text, text, text, integer) from public, anon;
revoke execute on function public.admin_abstimmung_starten(text, text, text, integer) from public, anon;
revoke execute on function app.live_abstimmen(text, text)                          from public, anon;
revoke execute on function public.live_abstimmen(text, text)                       from public, anon;
revoke execute on function app.live_war_dabei(text)                                from public, anon;
revoke execute on function public.live_war_dabei(text)                             from public, anon;
revoke execute on function app.meine_abzeichen()                                   from public, anon;
revoke execute on function public.meine_abzeichen()                                from public, anon;

grant execute on function app.admin_event_starten(text, integer)                  to authenticated;
grant execute on function public.admin_event_starten(text, integer)               to authenticated;
grant execute on function app.admin_event_beenden()                               to authenticated;
grant execute on function public.admin_event_beenden()                            to authenticated;
grant execute on function app.admin_abstimmung_starten(text, text, text, integer) to authenticated;
grant execute on function public.admin_abstimmung_starten(text, text, text, integer) to authenticated;
grant execute on function app.live_abstimmen(text, text)                          to authenticated;
grant execute on function public.live_abstimmen(text, text)                       to authenticated;
grant execute on function app.live_war_dabei(text)                                to authenticated;
grant execute on function public.live_war_dabei(text)                             to authenticated;
grant execute on function app.meine_abzeichen()                                   to authenticated;
grant execute on function public.meine_abzeichen()                                to authenticated;

/* Tabellen: Supabase gibt anon/authenticated per Default-Privileg
   auch Schreibrechte. RLS haelt sie ohnehin auf (keine Policy) -
   trotzdem ausdruecklich weg. Ins Logbuch schreibt nur der Admin. */
revoke insert, update, delete on public.live_events       from anon, authenticated;
revoke insert, update, delete on public.event_abzeichen   from anon, authenticated;
revoke insert, update, delete on public.live_abstimmungen from anon, authenticated;
revoke insert on public.live_logbuch from anon;

/* Stand und Rangliste auch ohne Anmeldung lesbar. */
grant execute on function app.live_abstimmung_stand(text)    to anon, authenticated;
grant execute on function public.live_abstimmung_stand(text) to anon, authenticated;
grant execute on function app.abzeichen_je_spieler()         to anon, authenticated;
grant execute on function public.abzeichen_je_spieler()      to anon, authenticated;
