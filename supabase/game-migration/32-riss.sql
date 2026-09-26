/* ======================================================
   LIVE-STORY "DER RISS"
   ---------------------------------------------------
   Der 5-Minuten-Film aus dem Claude-Design-Entwurf "Der Riss"
   (scripts/liveevent/riss-film.js). Er bereitet das naechste Event
   vor: Rueckeroberung scheitert, Systemausfall, ein Riss, Flug durch
   Raum und Zeit bis ins Jahr 1720.

   Die Story laeuft wie jede andere ueber admin_live_story('riss')
   und live_event.story. Sie hat keine Belohnung und hinterlaesst
   keinen Dauerzustand - nach 300 s ist die Seite wie vorher.

   Wie in 31 pruefen admin_live_story und die beiden Constraints
   feste Story-Listen. Die Funktion wird hier WORTGLEICH aus 31 neu
   angelegt, nur um 'riss' ergaenzt (mit "32:" markiert).
   live_story_belohnung bleibt unberuehrt: 'riss' faellt dort auf
   "falsche-art".

   REIHENFOLGE: nach 31 einspielen. Von Hand. Idempotent.
====================================================== */

alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss'));  -- 32

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss'));  -- 32


/* admin_live_story aus 31, wortgleich - 32: 'riss'. */
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
                     'riss') then  -- 32: 'riss'
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

/* create or replace behaelt die Rechte aus 29 - hier nur zur Sicherheit. */
revoke execute on function app.admin_live_story(text) from public, anon;
grant  execute on function app.admin_live_story(text) to authenticated;
