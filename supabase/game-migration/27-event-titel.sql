/* ======================================================
   EVENT-TITEL MIT FARBANIMATION
   ---------------------------------------------------
   Der Admin vergibt im Live-Event eigene Titel (bis 32 Zeichen) mit
   einem von fuenf Stilen: regenbogen, gold, feuer, eis, hacked. Die
   Animation selbst ist reines CSS im Browser; hier steht nur, WELCHER
   Stil - aus einer festen Liste, eigenes CSS ist nicht moeglich.

   ZWEI WEGE
   - An alle Anwesenden: wie die anderen Geschenke ueber einen Grant
     (live_grants, Art 'titel'). Jeder Browser loest ihn genau einmal
     ein - dafuer bekommt live_grant_einloesen() den Zweig 'titel'.
   - An einen Spieler: admin_event_titel_an_spieler() traegt ihn
     direkt ein.

   ANZEIGE
   event_titel_je_spieler() liefert je Spieler den NEUESTEN Titel
   (uid, Text, Stil) - fuer Spielerkarte und Rangliste, auch ohne
   Anmeldung. Titel sind zum Zeigen da; mehr gibt die Funktion nicht
   heraus.

   WARUM EINLOESEN NEU GESETZT WIRD
   app.live_grant_einloesen() wird WORTGLEICH aus 24 uebernommen (per
   Skript ausgeschnitten) und nur um den Zweig 'titel' ergaenzt. Die
   Positivliste live_grants_art_bekannt wird - wie in 24 - ersetzt.

   REIHENFOLGE: nach 26 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. TABELLEN
====================================================== */
create table if not exists public.event_titel (
  titel_id    text primary key,
  text        text not null,
  stil        text not null,
  angelegt_am timestamptz not null default now(),

  constraint event_titel_text_len check (char_length(btrim(text)) between 1 and 32),
  constraint event_titel_stil_bekannt check (stil in ('regenbogen', 'gold', 'feuer', 'eis', 'hacked'))
);

alter table public.event_titel enable row level security;
alter table public.event_titel force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'event_titel' and policyname = 'event_titel_select_public') then
    create policy "event_titel_select_public" on public.event_titel
      for select to anon, authenticated using (true);
  end if;
end $$;

create table if not exists public.spieler_event_titel (
  firebase_uid text not null,
  titel_id     text not null references public.event_titel(titel_id) on delete cascade,
  erhalten_am  timestamptz not null default now(),
  primary key (firebase_uid, titel_id)
);

alter table public.spieler_event_titel enable row level security;
alter table public.spieler_event_titel force row level security;

/* Lesen nur die eigenen Zeilen, schreiben niemand direkt - Titel
   kommen ausschliesslich ueber die Funktionen unten. */
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'spieler_event_titel' and policyname = 'spieler_event_titel_select_own') then
    create policy "spieler_event_titel_select_own" on public.spieler_event_titel
      for select to authenticated using (firebase_uid = app.firebase_uid());
  end if;
end $$;


/* ======================================================
   2. GRANTS KOENNEN EINEN TITEL TRAGEN
====================================================== */
alter table public.live_grants
  add column if not exists titel_id text references public.event_titel(titel_id) on delete cascade;

alter table public.live_grants drop constraint if exists live_grants_art_bekannt;
alter table public.live_grants add constraint live_grants_art_bekannt
  check (art in ('dublonen', 'avatar', 'skillpunkte', 'titel'));


/* ======================================================
   3. VERGEBEN (nur Admin)
====================================================== */
create or replace function app.event_titel_anlegen(p_text text, p_stil text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  tid text := 't' || encode(extensions.gen_random_bytes(8), 'hex');
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  insert into public.event_titel (titel_id, text, stil) values (tid, btrim(p_text), p_stil);
  return tid;
end
$$;
revoke execute on function app.event_titel_anlegen(text, text) from public;

/* An alle Anwesenden: Titel anlegen, Grant anlegen, live_event darauf
   zeigen lassen - die Browser loesen ihn dann selbst ein. */
create or replace function app.admin_event_titel_an_alle(p_text text, p_stil text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  tid text;
  gid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  tid := app.event_titel_anlegen(p_text, p_stil);
  gid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_grants (grant_id, art, wert, titel_id) values (gid, 'titel', 0, tid);
  update public.live_event
     set grant_id = gid, grant_at = now(), updated_at = now()
   where id = 1;
  return gid;
end
$$;

/* An einen Spieler: direkt eintragen. */
create or replace function app.admin_event_titel_an_spieler(p_text text, p_stil text, p_uid text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  tid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if not exists (select 1 from public.players where firebase_uid = p_uid) then
    raise exception 'spieler-unbekannt';
  end if;
  tid := app.event_titel_anlegen(p_text, p_stil);
  insert into public.spieler_event_titel (firebase_uid, titel_id) values (p_uid, tid);
  return tid;
end
$$;

create or replace function public.admin_event_titel_an_alle(p_text text, p_stil text) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_event_titel_an_alle(p_text, p_stil) $$;

create or replace function public.admin_event_titel_an_spieler(p_text text, p_stil text, p_uid text) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_event_titel_an_spieler(p_text, p_stil, p_uid) $$;

grant execute on function app.admin_event_titel_an_alle(text, text)          to authenticated;
grant execute on function public.admin_event_titel_an_alle(text, text)       to authenticated;
grant execute on function app.admin_event_titel_an_spieler(text, text, text) to authenticated;
grant execute on function public.admin_event_titel_an_spieler(text, text, text) to authenticated;


/* ======================================================
   4. ANZEIGEN: der neueste Titel je Spieler
====================================================== */
create or replace function app.event_titel_je_spieler()
  returns table (firebase_uid text, text text, stil text)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select distinct on (s.firebase_uid) s.firebase_uid, t.text, t.stil
    from public.spieler_event_titel s
    join public.event_titel t on t.titel_id = s.titel_id
   order by s.firebase_uid, s.erhalten_am desc, s.titel_id
$$;

create or replace function public.event_titel_je_spieler()
  returns table (firebase_uid text, text text, stil text)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.event_titel_je_spieler() $$;

grant execute on function app.event_titel_je_spieler()    to anon, authenticated;
grant execute on function public.event_titel_je_spieler() to anon, authenticated;


/* ======================================================
   5. EINLOESEN MIT TITEL-ZWEIG
   ---------------------------------------------------
   Wortgleich aus 24-skilltree-etappe1.sql, ergaenzt um den Block
   "Event-Titel (NEU in 27)".
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
