/* ======================================================
   LIVE-EVENT: DER ADMIN LOEST BEI ALLEN GLEICHZEITIG AUS
   ---------------------------------------------------
   Eine einzige Zustandszeile (public.live_event), die der Admin
   schreibt und alle Besucher lesen. Aendert sich die Zeile, holen
   die Browser sie und reagieren: Banderole einblenden, Disco an,
   Konfetti, Bildschirm-Uebernahme, oder einen Grant einloesen.

   WIE ES ZU ALLEN KOMMT
   Ueber Supabase Realtime (Postgres Changes auf dieser Tabelle).
   WICHTIG FUER DEN BETREIBER: Realtime muss fuer public.live_event
   eingeschaltet werden, d.h. die Tabelle gehoert in die Publikation
   supabase_realtime. public.live_grants braucht das NICHT - die
   Browser abonnieren nur live_event und lesen den Grant beim
   Einloesen ueber die RPC. Einmalig im SQL-Editor (idempotent):

     do $$ begin
       if not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime'
                         and schemaname = 'public' and tablename = 'live_event') then
         alter publication supabase_realtime add table public.live_event;
       end if;
     end $$;

   Ohne Realtime faellt der Browser auf ein Polling alle 5 s
   zurueck: das Event kommt trotzdem an, nur verzoegert.

   WER DARF SCHREIBEN
   Nur der Admin (app.is_admin() in der RLS-Policy) - genauso wie
   site_config. Ein normaler Besucher kann die Zeile lesen, aber
   nicht setzen; er kann also keine gefaelschte "Admin-Nachricht"
   an alle schicken.

   DIE GRANTS ("Dublonen/Avatar an alle")
   Kein Massen-Schreibzugriff. Der Admin legt einen Grant an; jeder
   Browser loest ihn GENAU EINMAL ueber eine SECURITY-DEFINER-
   Funktion ein, die den Betrag SELBST aus der Grant-Zeile nimmt
   (nicht vom Client) und gutschreibt. Dasselbe sichere Muster wie
   die XP-Codes.

   REIHENFOLGE: nach 22 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. DIE ZUSTANDSZEILE
   ---------------------------------------------------
   Genau eine Zeile (id = 1). Zeitstempel statt Zaehler: der
   Browser reagiert, wenn sich message_at / pulse_at / grant_at
   auf einen NEUEN Wert aendert - so feuert auch zweimal dasselbe
   (zweimal Konfetti) zuverlaessig.
====================================================== */
create table if not exists public.live_event (
  id            smallint primary key default 1,
  message       text,
  message_color text,
  message_from  text,
  message_at    timestamptz,
  disco         boolean not null default false,
  takeover      boolean not null default false,
  pulse_kind    text,
  pulse_at      timestamptz,
  grant_id      text,
  grant_at      timestamptz,
  updated_at    timestamptz not null default now(),

  constraint live_event_singleton check (id = 1),
  /* Gegen einen versehentlich riesigen oder eingeschleusten Text -
     der Browser escaped ohnehin, aber kurz halten schadet nie. */
  constraint live_event_message_len check (message is null or char_length(message) <= 280),
  constraint live_event_from_len    check (message_from is null or char_length(message_from) <= 60),
  constraint live_event_color_safe  check (message_color is null or message_color ~ '^#[0-9a-fA-F]{3,8}$'),
  constraint live_event_pulse_known check (pulse_kind is null or pulse_kind in ('konfetti','blitz','sound'))
);

insert into public.live_event (id) values (1) on conflict (id) do nothing;

alter table public.live_event enable row level security;
alter table public.live_event force row level security;

create policy "live_event_select_public" on public.live_event
  for select to anon, authenticated using (true);

/* Schreiben nur der Admin - wie site_config. */
create policy "live_event_write_admin" on public.live_event
  for update to authenticated using (app.is_admin()) with check (app.is_admin());


/* ======================================================
   2. GRANTS
====================================================== */
create table if not exists public.live_grants (
  grant_id    text primary key,
  art         text not null,
  wert        integer not null default 0,   -- Dublonen-Betrag (bei art='dublonen')
  avatar_id   text,                          -- Avatar-ID (bei art='avatar')
  angelegt_am timestamptz not null default now(),

  constraint live_grants_art_bekannt check (art in ('dublonen','avatar')),
  constraint live_grants_wert_sane   check (wert between 0 and 5000)
);

alter table public.live_grants enable row level security;
alter table public.live_grants force row level security;

/* Oeffentlich lesbar, damit der Browser weiss, WAS es gibt. Der
   eigentliche Betrag beim Gutschreiben kommt trotzdem
   server-seitig aus dieser Zeile, nicht vom Client. */
create policy "live_grants_select_public" on public.live_grants
  for select to anon, authenticated using (true);

create table if not exists public.live_grant_einloesungen (
  firebase_uid  text not null,
  grant_id      text not null references public.live_grants(grant_id) on delete cascade,
  eingeloest_am timestamptz not null default now(),
  primary key (firebase_uid, grant_id)
);

alter table public.live_grant_einloesungen enable row level security;
alter table public.live_grant_einloesungen force row level security;

create policy "live_grant_einl_select_own" on public.live_grant_einloesungen
  for select to authenticated using (firebase_uid = app.firebase_uid());


/* ======================================================
   3. ADMIN LOEST EINEN GRANT AUS
   ---------------------------------------------------
   Legt eine Grant-Zeile an und zeigt live_event darauf. Prueft
   selbst, dass der Aufrufer Admin ist.
====================================================== */
create or replace function app.live_grant_ausloesen(p_art text, p_wert integer, p_avatar text)
  returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  gid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_art not in ('dublonen','avatar') then
    raise exception 'unbekannte-art';
  end if;

  gid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_grants (grant_id, art, wert, avatar_id)
    values (gid, p_art, coalesce(p_wert, 0), p_avatar);

  update public.live_event
     set grant_id = gid, grant_at = now(), updated_at = now()
   where id = 1;

  return gid;
end
$$;

create or replace function public.live_grant_ausloesen(p_art text, p_wert integer, p_avatar text)
  returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.live_grant_ausloesen(p_art, p_wert, p_avatar) $$;
grant execute on function public.live_grant_ausloesen(text, integer, text) to authenticated;


/* ======================================================
   4. BESUCHER LOEST DEN GRANT EIN (genau einmal)
   ---------------------------------------------------
   Rueckgabe:
     > 0  so viele Dublonen gutgeschrieben
       1  Avatar freigeschaltet (art='avatar')
       0  schon eingeloest
      -1  Grant unbekannt oder zu alt
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

create or replace function public.live_grant_einloesen(p_grant text) returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.live_grant_einloesen(p_grant) $$;
grant execute on function public.live_grant_einloesen(text) to authenticated;
