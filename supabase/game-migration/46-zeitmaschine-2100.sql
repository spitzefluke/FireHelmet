/* ======================================================
   LIVE-STORY "ZEITMASCHINE 2100" UND EPOCHE 2100
   ---------------------------------------------------
   Ein 5-Minuten-Film (scripts/liveevent/zeit-film.js): Auf der
   Pergament-Seite zeichnet sich eine Zeitmaschine auf, laedt sich
   auf, das Papier zerspringt, ein Lichttunnel fuehrt ins All. Die
   Erde bricht auseinander, Menschen und Aliens fuehren Krieg, und
   die Seite setzt sich im All-Look neu zusammen. Danach sieht die
   ganze Website so aus (css/96-epoche-2100.css), fuer alle, bis der
   Admin zurueckschaltet.

   jahr_2100_ab  Ab diesem Zeitpunkt gilt das Jahr 2100. null = nie.

   WELCHE EPOCHE GILT
   jahr_1720_ab (35) und jahr_2100_ab sind beide Zeitmarken. Es gilt
   die zuletzt ERREICHTE Marke; ist keine erreicht, gilt 2026. So
   bringt ein neuer Riss die Seite aus 2100 wieder nach 1720 und eine
   neue Zeitmaschine aus 1720 nach 2100, ohne dass die Storys die
   Marke der anderen anfassen muessen.

   Gesetzt wird jahr_2100_ab von selbst: Startet der Admin die Story
   'zeit', steht hier story_at + 300 s (Filmende). Bricht er vorher
   ab oder startet eine andere Story, faellt der noch nicht erreichte
   Zeitpunkt wieder weg - wie beim Riss. Das macht ein ZWEITER
   Trigger neben dem aus 35 (der bleibt unveraendert).

   admin_epoche('2026')  beide Marken weg
   admin_epoche('1720')  1720 sofort, 2100 weg
   admin_epoche('2100')  2100 sofort, 1720 weg

   Wie in 38 pruefen admin_live_story, live_story_belohnung und die
   Constraints feste Story-Listen: die Funktionen werden hier
   WORTGLEICH aus 38 neu angelegt, nur um 'zeit' ergaenzt (mit "46:"
   markiert). Belohnung ueber 'abschluss' am Filmende (fruehestens
   290 s nach dem Start, wie beim Riss); der Preis startet mit 0.

   REIHENFOLGE: nach 45 einspielen. Von Hand. Idempotent.
====================================================== */

alter table public.live_event
  add column if not exists jahr_2100_ab timestamptz;


/* ======================================================
   1. ZEITMASCHINE STARTET -> NACH DEM FILM 2100
====================================================== */
create or replace function app.live_event_epoche_2100() returns trigger
language plpgsql set search_path = public, app, pg_temp
as $$
begin
  if new.story_id is distinct from old.story_id then
    if new.story = 'zeit' and new.story_id is not null then
      new.jahr_2100_ab := coalesce(new.story_at, now()) + interval '300 seconds';
    elsif old.jahr_2100_ab is not null and old.jahr_2100_ab > now() then
      /* Zeitmaschine abgebrochen oder abgeloest, bevor der Film zu
         Ende war: kein Sprung nach 2100. */
      new.jahr_2100_ab := null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists live_event_epoche_2100 on public.live_event;
create trigger live_event_epoche_2100
  before update on public.live_event
  for each row execute function app.live_event_epoche_2100();


/* ======================================================
   2. ADMIN: UMSCHALTEN (neue Fassung von 35 mit '2100')
   Rueckgabe wie bisher: der Zeitpunkt der jetzt geltenden Marke
   (null bei 2026).
====================================================== */
create or replace function app.admin_epoche(p_jahr text) returns timestamptz
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  ab timestamptz;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_jahr is null or p_jahr not in ('2026', '1720', '2100') then  -- 46: '2100'
    raise exception 'unbekannte-epoche';
  end if;
  update public.live_event
     set jahr_1720_ab = case when p_jahr = '1720' then now() else null end,
         jahr_2100_ab = case when p_jahr = '2100' then now() else null end,
         updated_at   = now()
   where id = 1
  returning coalesce(jahr_2100_ab, jahr_1720_ab) into ab;
  return ab;
end
$$;

revoke execute on function app.live_event_epoche_2100()   from public, anon, authenticated;
revoke execute on function app.admin_epoche(text)         from public, anon;
revoke execute on function public.admin_epoche(text)      from public, anon;
grant  execute on function app.admin_epoche(text)         to authenticated;
grant  execute on function public.admin_epoche(text)      to authenticated;


/* ======================================================
   3. STORY 'zeit' ZULASSEN
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss', 'herz', 'zeit'));  -- 46: 'zeit'

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss', 'herz', 'zeit'));  -- 46: 'zeit'


/* admin_live_story aus 38, wortgleich - 46: 'zeit'. */
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
                     'riss', 'herz', 'zeit') then  -- 32: 'riss', 38: 'herz', 46: 'zeit'
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
   4. BELOHNUNG (Migration 36/38)
====================================================== */
alter table public.live_story_preise drop constraint if exists live_story_preise_bekannt;
alter table public.live_story_preise add constraint live_story_preise_bekannt check (schluessel in
  ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'hintertueren', 'schatz',
   'werbung', 'disco', 'riss', 'ende', 'herz', 'zeit'));  -- 46: 'zeit'

insert into public.live_story_preise (schluessel, dublonen, skillpunkte) values ('zeit', 0, 0)
on conflict (schluessel) do nothing;

select app.story_preise_auffrischen();


/* live_story_belohnung aus 38, wortgleich - 46: 'zeit' als Abschluss. */
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
  elsif p_art = 'abschluss' and st.story in ('disco', 'riss', 'ende', 'herz', 'zeit') then  -- 38: 'herz', 46: 'zeit'
    schl := st.story;
    ab := case st.story when 'disco' then 4 when 'ende' then 10 when 'herz' then 600 else 290 end;
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
