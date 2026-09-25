/* ======================================================
   LIVE-STORYS: SZENEN FUER ALLE, BELOHNUNGEN, DISCO-MUSIK
   ---------------------------------------------------
   Der Admin startet im Live-Event eine "Story" (Sturm, Nordlicht,
   Geisterschiff, Sturmflut, Hacked, Systemausfall, Schatzregen,
   Disco). Die Szenen laufen in jedem Browser selbst ab - hier steht
   nur, WELCHE Story WANN gestartet wurde. Wer spaeter dazukommt,
   steigt anhand von story_at an der richtigen Stelle ein.

   ZUSTAND IN live_event (Realtime aus 23 traegt ihn zu allen)
     story          welche Story zuletzt gestartet wurde (oder null)
     story_id       Kennung dieses Starts - Belohnungen haengen daran
     story_at       Startzeit
     story_ende_at  Disco laeuft endlos, bis der Admin sie beendet;
                    dann steht hier die Zeit, und alle klingen aus
     musik_version  wechselt bei jedem Hochladen der Disco-Musik,
                    damit kein Browser die alte Datei aus dem Cache nimmt

   "Systemausfall" laesst die Seite danach gehackt stehen. Das ist
   kein eigenes Feld: solange story = 'ende' ist, zeigen die Browser
   nach Ablauf der Szenen den gehackten Zustand - bis die naechste
   Story startet oder der Admin mit admin_live_story(null) aufraeumt.

   BELOHNUNGEN (vom Betreiber festgelegt)
     wetter        Sturm, Nordlicht, Geisterschiff, Sturmflut: 150 Dublonen
     hacked        Titel "Firewall-Pirat" (Stil hacked) + 1 Skillpunkt
     hintertueren  alle Hintertueren nach Hacked geschlossen: +1 Skillpunkt
     schatz        Schatzregen: Beute x 10 Dublonen (hoechstens 600),
                   ab 25 Beute zusaetzlich +1 Skillpunkt

   Der Browser meldet nur, DASS er eine Belohnung abholt (und beim
   Schatzregen die Beute). Betrag, Titel und Skillpunkte legt die
   Funktion unten selbst fest. Jede Belohnung gibt es je Spieler und
   Story-Start genau einmal (Primaerschluessel), und erst, wenn die
   Szene mit der Belohnung frühestens erreicht sein kann.
   Die Schatzregen-Beute zaehlt der Browser - die Datenbank kann nur
   den Deckel pruefen. Rein virtuelle Waehrung, bewusst so (siehe
   CLAUDE.md, "Sicherheitsgrenze").

   DISCO-MUSIK
   Bucket "live-musik" in Supabase Storage, oeffentlich lesbar (die
   Zuschauer spielen die Datei ueber die oeffentliche URL), schreiben
   nur der Admin.

   REIHENFOLGE: nach 28 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. live_event UM DIE STORY ERWEITERN
====================================================== */
alter table public.live_event
  add column if not exists story         text,
  add column if not exists story_id      text,
  add column if not exists story_at      timestamptz,
  add column if not exists story_ende_at timestamptz,
  add column if not exists musik_version text;

alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco'));

alter table public.live_event drop constraint if exists live_event_musik_version_len;
alter table public.live_event add constraint live_event_musik_version_len
  check (musik_version is null or musik_version ~ '^[0-9A-Za-z_-]{1,40}$');


/* ======================================================
   2. JEDER START EINE ZEILE
   Belohnungen verweisen auf den Start, nicht auf live_event - so
   kann jemand seine Hintertueren auch noch schliessen, wenn der
   Admin schon die naechste Story laufen laesst.
====================================================== */
create table if not exists public.live_storys (
  story_id     text primary key,
  story        text not null,
  gestartet_am timestamptz not null default now(),
  constraint live_storys_story_bekannt check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco'))
);

alter table public.live_storys enable row level security;
alter table public.live_storys force row level security;
-- Keine Policy: lesen und schreiben nur die Funktionen unten.
revoke all on public.live_storys from anon, authenticated;

create table if not exists public.live_story_belohnungen (
  firebase_uid  text not null,
  story_id      text not null references public.live_storys(story_id) on delete cascade,
  art           text not null,
  dublonen      integer not null default 0,
  skillpunkte   integer not null default 0,
  eingeloest_am timestamptz not null default now(),
  primary key (firebase_uid, story_id, art),
  constraint live_story_belohnungen_art_bekannt check (art in ('wetter', 'hacked', 'hintertueren', 'schatz'))
);

alter table public.live_story_belohnungen enable row level security;
alter table public.live_story_belohnungen force row level security;
revoke all on public.live_story_belohnungen from anon, authenticated;


/* Der feste Titel aus der Hacked-Story (Tabelle aus 27). */
insert into public.event_titel (titel_id, text, stil)
values ('firewall-pirat', 'Firewall-Pirat', 'hacked')
on conflict (titel_id) do nothing;


/* ======================================================
   3. ADMIN: STORY STARTEN, BEENDEN, AUFRAEUMEN
====================================================== */

/* p_story null: Story abbrechen bzw. die gehackte Seite wiederherstellen. */
create or replace function app.admin_live_story(p_story text) returns text
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  sid text;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;

  if p_story is null then
    update public.live_event
       set story = null, story_id = null, story_at = null, story_ende_at = null, updated_at = now()
     where id = 1;
    return null;
  end if;

  if p_story not in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco') then
    raise exception 'unbekannte-story';
  end if;

  sid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_storys (story_id, story) values (sid, p_story);
  update public.live_event
     set story = p_story, story_id = sid, story_at = now(), story_ende_at = null, updated_at = now()
   where id = 1;
  return sid;
end
$$;

/* Endlos-Story (Disco) ausklingen lassen. */
create or replace function app.admin_live_story_beenden() returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  update public.live_event
     set story_ende_at = now(), updated_at = now()
   where id = 1 and story is not null and story_ende_at is null;
  return found;
end
$$;

create or replace function public.admin_live_story(p_story text) returns text
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_live_story(p_story) $$;

create or replace function public.admin_live_story_beenden() returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_live_story_beenden() $$;

revoke execute on function app.admin_live_story(text)           from public, anon;
revoke execute on function public.admin_live_story(text)        from public, anon;
revoke execute on function app.admin_live_story_beenden()       from public, anon;
revoke execute on function public.admin_live_story_beenden()    from public, anon;
grant  execute on function app.admin_live_story(text)           to authenticated;
grant  execute on function public.admin_live_story(text)        to authenticated;
grant  execute on function app.admin_live_story_beenden()       to authenticated;
grant  execute on function public.admin_live_story_beenden()    to authenticated;


/* ======================================================
   4. BELOHNUNG ABHOLEN
   ---------------------------------------------------
   Rueckgabe (jsonb):
     {"ok": true,  "dublonen": n, "skillpunkte": n, "titel": "..."|null}
     {"ok": false, "grund": "schon" | "unbekannt" | "zu-spaet" |
                            "zu-frueh" | "falsche-art"}
   Eine Antwort statt einer Ausnahme, weil alle Faelle normal sind.

   Fruehestens ab (Sekunden nach dem Start) - dann kann die Szene
   mit der Belohnung erreicht sein (Szenenlaengen in
   scripts/liveevent/live-storys.js, etwas grosszuegig abgerundet):
     wetter 5, hacked 25, hintertueren 30, schatz 18
====================================================== */
create or replace function app.live_story_belohnung(p_story_id text, p_art text, p_beute integer default 0)
  returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  st     public.live_storys;
  dub    integer := 0;
  sp     integer := 0;
  titel  text := null;
  ab     integer;
  beute  integer := greatest(0, least(60, coalesce(p_beute, 0)));
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into st from public.live_storys where story_id = p_story_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if st.gestartet_am < now() - interval '2 hours' then
    return jsonb_build_object('ok', false, 'grund', 'zu-spaet');
  end if;

  if p_art = 'wetter' and st.story in ('sturm', 'nordlicht', 'nebel', 'flut') then
    dub := 150; ab := 5;
  elsif p_art = 'hacked' and st.story = 'hacked' then
    sp := 1; titel := 'firewall-pirat'; ab := 25;
  elsif p_art = 'hintertueren' and st.story = 'hacked' then
    sp := 1; ab := 30;
  elsif p_art = 'schatz' and st.story = 'schatz' then
    dub := beute * 10;
    if beute >= 25 then sp := 1; end if;
    ab := 18;
  else
    return jsonb_build_object('ok', false, 'grund', 'falsche-art');
  end if;

  if now() < st.gestartet_am + make_interval(secs => ab) then
    return jsonb_build_object('ok', false, 'grund', 'zu-frueh');
  end if;

  insert into public.live_story_belohnungen (firebase_uid, story_id, art, dublonen, skillpunkte)
       values (uid, st.story_id, p_art, dub, sp)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;

  if dub > 0 then
    insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
    update public.players set currency = currency + dub where firebase_uid = uid;
  end if;

  if sp > 0 then
    insert into public.player_progression (firebase_uid) values (uid)
      on conflict (firebase_uid) do nothing;
    /* least(): Deckel aus 22 (bonus_skill_points <= 500) - kappen statt scheitern. */
    update public.player_progression
       set bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + sp),
           updated_at = now()
     where firebase_uid = uid;
  end if;

  if titel is not null then
    /* Schon einmal bekommen: nach vorn holen, damit er als neuester zaehlt. */
    insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, titel)
    on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
  end if;

  return jsonb_build_object('ok', true, 'dublonen', dub, 'skillpunkte', sp,
    'titel', (select t.text from public.event_titel t where t.titel_id = titel));
end
$$;

create or replace function public.live_story_belohnung(p_story_id text, p_art text, p_beute integer default 0)
  returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.live_story_belohnung(p_story_id, p_art, p_beute) $$;

revoke execute on function app.live_story_belohnung(text, text, integer)    from public, anon;
revoke execute on function public.live_story_belohnung(text, text, integer) from public, anon;
grant  execute on function app.live_story_belohnung(text, text, integer)    to authenticated;
grant  execute on function public.live_story_belohnung(text, text, integer) to authenticated;


/* ======================================================
   5. DISCO-MUSIK IN SUPABASE STORAGE
   ---------------------------------------------------
   Oeffentlicher Bucket: Lesen geht ueber die oeffentliche URL ohne
   Policy. Hochladen/Ersetzen/Loeschen nur der Admin - dafuer alle
   vier Policies, weil ein Hochladen mit upsert lesen, einfuegen und
   aendern muss.
====================================================== */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-musik', 'live-musik', true, 15728640,
        array['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav',
              'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'live_musik_admin_select') then
    create policy "live_musik_admin_select" on storage.objects
      for select to authenticated using (bucket_id = 'live-musik' and app.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'live_musik_admin_insert') then
    create policy "live_musik_admin_insert" on storage.objects
      for insert to authenticated with check (bucket_id = 'live-musik' and app.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'live_musik_admin_update') then
    create policy "live_musik_admin_update" on storage.objects
      for update to authenticated using (bucket_id = 'live-musik' and app.is_admin())
      with check (bucket_id = 'live-musik' and app.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'live_musik_admin_delete') then
    create policy "live_musik_admin_delete" on storage.objects
      for delete to authenticated using (bucket_id = 'live-musik' and app.is_admin());
  end if;
end $$;
