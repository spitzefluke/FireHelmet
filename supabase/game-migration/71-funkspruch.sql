/* ======================================================
   LIVE-STORY "FUNKSPRUCH" (runde Tonspur)
   ---------------------------------------------------
   Eine Sprachaufnahme als Story fuer alle: ein runder Spektrum-Ring,
   der auf die Stimme reagiert, innen die Huellkurve der ganzen
   Aufnahme mit Abspielkopf, in der Mitte ein Funk-Symbol, oben die
   gesprochenen Woerter auf ihrem Einsatz
   (scripts/liveevent/funk-film.js). Die Aufnahme laedt der Admin wie
   jede Story-Musik unter "Musik je Story" hoch (Bucket live-musik,
   Datei "funkspruch"; dazu auf Wunsch getrennte Spuren
   "funkspruch_stimme" und "funkspruch_musik" nur fuer die Analyse).
   Woerter und Laenge traegt er im Gateway ein; sie liegen in
   site_config.data (funkText, funkDauer) - dafuer braucht es hier
   nichts.

   Diese Datei laesst nur die Story zu: in beiden Listen, in
   admin_live_story(), bei den Preisen (Standard 0/0, der Admin
   stellt sie unter "Belohnungen" ein) und als Abschluss in
   live_story_belohnung() - ab 10 s, weil die Laenge der Aufnahme
   erst im Gateway feststeht.

   REIHENFOLGE: nach 70 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. STORY 'funkspruch' ZULASSEN
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch'));  -- 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch'));  -- 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'

/* admin_live_story aus 70, wortgleich - 71: 'funkspruch'. */
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
                     'riss', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch') then  -- 32: 'riss', 38: 'herz', 46: 'zeit', 51: 'nukes', 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'
    raise exception 'unbekannte-story';
  end if;

  sid := encode(extensions.gen_random_bytes(9), 'hex');
  insert into public.live_storys (story_id, story) values (sid, p_story);
  update public.live_event
     set story = p_story, story_id = sid, story_at = now(), story_ende_at = null, updated_at = now()
   where id = 1;
  if p_story = 'reise' then  -- 67
    insert into public.reise_laeufe (story_id, gestartet_am) values (sid, now());
  end if;
  return sid;
end
$$;

revoke execute on function app.admin_live_story(text) from public, anon;
grant  execute on function app.admin_live_story(text) to authenticated;


/* ======================================================
   2. BELOHNUNG
====================================================== */
alter table public.live_story_preise drop constraint if exists live_story_preise_bekannt;
alter table public.live_story_preise add constraint live_story_preise_bekannt check (schluessel in
  ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'hintertueren', 'schatz',
   'werbung', 'disco', 'riss', 'ende', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch'));  -- 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'

insert into public.live_story_preise (schluessel, dublonen, skillpunkte) values ('funkspruch', 0, 0)
on conflict (schluessel) do nothing;

select app.story_preise_auffrischen();

/* live_story_belohnung aus 70, wortgleich - 71: 'funkspruch' als Abschluss (ab 10 s; die Laenge der Aufnahme kennt nur das Gateway). */
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
  elsif p_art = 'abschluss' and st.story in ('disco', 'riss', 'ende', 'herz', 'zeit', 'nukes', 'reise', 'liebeslied', 'funkspruch') then  -- 38: 'herz', 46: 'zeit', 51: 'nukes', 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'
    schl := st.story;
    ab := case st.story when 'disco' then 4 when 'ende' then 10 when 'herz' then 600 when 'nukes' then 170 when 'reise' then 400 when 'liebeslied' then 70 when 'funkspruch' then 10 else 290 end;  -- 51: 'nukes', 67: 'reise', 70: 'liebeslied', 71: 'funkspruch'
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
