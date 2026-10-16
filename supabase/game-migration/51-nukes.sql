/* ======================================================
   LIVE-STORY "HUNDERT ATOMBOMBEN GEGEN EINE MUECKE" (nukes)
   ---------------------------------------------------
   Ein 3-Minuten-Film (scripts/liveevent/nukes-film.js) nach dem
   Claude-Design-Entwurf "Film 100 Nukes": 03:12 Uhr, eine Muecke
   weckt Kapitaen Aendii. Hand, Pfanne, Kanone - alles daneben. Dann
   der Notfallknopf, hundert Atombomben, die Erde bricht in zwei
   Teile. Endlich Ruhe. Bsss.

   Wie bei 'herz' und 'zeit' nur ein Film: keine Epoche, keine Spiel-
   regeln. Die Datenbank muss die Story nur kennen:
     - live_event / live_storys: 'nukes' in den Story-Listen
     - admin_live_story: der Admin darf sie starten
     - live_story_preise / live_story_belohnung: Belohnung am Ende,
       wenn der Admin eine einstellt (Abschluss ab 170 s nach Start)
   Die drei Funktionen bzw. Listen sind WORTGLEICH aus 46 uebernommen,
   nur um 'nukes' ergaenzt (mit "51:" markiert).

   REIHENFOLGE: nach 50 einspielen. Von Hand, im SQL-Editor.
   Idempotent.
====================================================== */


/* ======================================================
   STORY 'nukes' ZULASSEN
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss', 'herz', 'zeit', 'nukes'));  -- 46: 'zeit', 51: 'nukes'

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss', 'herz', 'zeit', 'nukes'));  -- 46: 'zeit', 51: 'nukes'


/* admin_live_story aus 46, wortgleich - 51: 'nukes'. */
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

  if p_story not in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco', 'werbung',
                     'riss', 'herz', 'zeit', 'nukes') then  -- 32: 'riss', 38: 'herz', 46: 'zeit', 51: 'nukes'
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

revoke execute on function app.admin_live_story(text) from public, anon;
grant  execute on function app.admin_live_story(text) to authenticated;


/* ======================================================
   BELOHNUNG (Migration 36/38/46)
====================================================== */
alter table public.live_story_preise drop constraint if exists live_story_preise_bekannt;
alter table public.live_story_preise add constraint live_story_preise_bekannt check (schluessel in
  ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'hintertueren', 'schatz',
   'werbung', 'disco', 'riss', 'ende', 'herz', 'zeit', 'nukes'));  -- 46: 'zeit', 51: 'nukes'

insert into public.live_story_preise (schluessel, dublonen, skillpunkte) values ('nukes', 0, 0)
on conflict (schluessel) do nothing;

select app.story_preise_auffrischen();


/* live_story_belohnung aus 46, wortgleich - 51: 'nukes' als Abschluss (ab 170 s). */
create or replace function app.live_story_belohnung(p_story_id text, p_art text, p_beute integer default 0)
  returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  st      public.live_storys;
  pr      public.live_story_preise;
  schl    text;
  dub     integer := 0;
  sp      integer := 0;
  titel   text := null;
  ab      integer;
  stueck  integer;
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
    schl := st.story; ab := 5;
  elsif p_art = 'hacked' and st.story = 'hacked' then
    schl := 'hacked'; ab := 25;
  elsif p_art = 'hintertueren' and st.story = 'hacked' then
    schl := 'hintertueren'; ab := 30;
  elsif p_art = 'schatz' and st.story = 'schatz' then
    schl := 'schatz'; ab := 18;
  elsif p_art = 'werbung' and st.story in ('werbung', 'gegenhack_niederlage') then
    schl := 'werbung'; ab := 8;
  elsif p_art = 'abschluss' and st.story in ('disco', 'riss', 'ende', 'herz', 'zeit', 'nukes') then  -- 38: 'herz', 46: 'zeit', 51: 'nukes'
    schl := st.story;
    ab := case st.story when 'disco' then 4 when 'ende' then 10 when 'herz' then 600 when 'nukes' then 170 else 290 end;  -- 51: 'nukes'
  else
    return jsonb_build_object('ok', false, 'grund', 'falsche-art');
  end if;

  if now() < st.gestartet_am + make_interval(secs => ab) then
    return jsonb_build_object('ok', false, 'grund', 'zu-frueh');
  end if;

  select * into pr from public.live_story_preise where schluessel = schl;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'keine');
  end if;

  if pr.deckel is not null then
    /* Je Stueck: Muenzen bzw. Secrets, gekappt beim Deckel. Skillpunkte
       und Titel erst ab extra_ab Stueck (mindestens einem). */
    stueck := greatest(0, least(pr.deckel, coalesce(p_beute, 0)));
    dub := stueck * pr.dublonen;
    if stueck >= greatest(1, coalesce(pr.extra_ab, 1)) then
      sp := pr.skillpunkte;
      titel := pr.titel_id;
    end if;
  else
    dub := pr.dublonen;
    sp := pr.skillpunkte;
    titel := pr.titel_id;
  end if;

  if dub = 0 and sp = 0 and titel is null then
    return jsonb_build_object('ok', false, 'grund', 'keine');
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

revoke execute on function app.live_story_belohnung(text, text, integer) from public, anon;
grant  execute on function app.live_story_belohnung(text, text, integer) to authenticated;
