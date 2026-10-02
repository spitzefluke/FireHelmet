/* ======================================================
   MUSIK FUER JEDE STORY
   ---------------------------------------------------
   Bisher gab es genau eine Musik: die Disco (Datei "disco" im
   Bucket "live-musik", Version in live_event.musik_version). Jetzt
   kann jede Story eine eigene Datei bekommen. Sie heisst wie die
   Story ("riss", "sturm", ...) und liegt im selben Bucket - die
   Policies aus 29 decken jede Datei dort ab, am Bucket aendert sich
   nichts.

   musik_versionen  { "<story>": "<version>", ... }
                    Steht eine Story darin, hat sie eine Datei, und
                    die Version haengt als ?v= an der Adresse, damit
                    kein Browser die alte Datei aus dem Cache spielt.
                    Fehlt sie, laeuft die Story still (Disco: dann
                    music/disco.mp3 aus dem Repo, wie bisher).

   musik_version (aus 29) bleibt und wird fuer die Disco weiter
   mitgeschrieben: Browser mit dem alten JavaScript im Cache spielen
   so noch bis zu zehn Minuten nach dem Merge die richtige Datei.

   Geschrieben wird nur ueber admin_story_musik() - ein Schluessel
   auf einmal, ohne die anderen anzufassen.

   REIHENFOLGE: nach 33 einspielen. Von Hand. Idempotent.
====================================================== */

/* Form der Versionsliste: ein Objekt mit hoechstens 30 Eintraegen,
   Schluessel wie Story-Kennungen, Werte wie musik_version in 29.
   Welche Storys es gibt, prueft die Liste bewusst nicht - sonst
   muesste jede neue Story auch diese Migration nachziehen. */
create or replace function app.musik_versionen_ok(j jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select jsonb_typeof(j) = 'object'
     and (select count(*) from jsonb_each(j)) <= 30
     and not exists (
       select 1 from jsonb_each(j) e
        where e.key !~ '^[a-z_]{1,30}$'
           or jsonb_typeof(e.value) <> 'string'
           or (e.value #>> '{}') !~ '^[0-9A-Za-z_-]{1,40}$')
$$;
grant execute on function app.musik_versionen_ok(jsonb) to authenticated;

alter table public.live_event
  add column if not exists musik_versionen jsonb not null default '{}'::jsonb;

alter table public.live_event drop constraint if exists live_event_musik_versionen_form;
alter table public.live_event add constraint live_event_musik_versionen_form
  check (app.musik_versionen_ok(musik_versionen));

/* Eine schon hochgeladene Disco-Musik uebernehmen. */
update public.live_event
   set musik_versionen = musik_versionen || jsonb_build_object('disco', musik_version)
 where id = 1 and musik_version is not null and not (musik_versionen ? 'disco');


/* ======================================================
   SETZEN UND ENTFERNEN
   p_version null = Eintrag weg (die Datei selbst loescht der
   Admin-Bereich vorher aus dem Bucket).
====================================================== */
create or replace function app.admin_story_musik(p_story text, p_version text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  neu jsonb;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_story is null or p_story !~ '^[a-z_]{1,30}$' then
    raise exception 'unbekannte-story';
  end if;
  if p_version is not null and p_version !~ '^[0-9A-Za-z_-]{1,40}$' then
    raise exception 'falsche-version';
  end if;

  update public.live_event
     set musik_versionen = case when p_version is null then musik_versionen - p_story
                                else musik_versionen || jsonb_build_object(p_story, p_version) end,
         /* Disco: das Feld aus 29 fuer Browser mit altem JavaScript. */
         musik_version   = case when p_story = 'disco' then p_version else musik_version end,
         updated_at      = now()
   where id = 1
  returning musik_versionen into neu;
  return neu;
end
$$;

revoke execute on function app.admin_story_musik(text, text) from public, anon;
grant  execute on function app.admin_story_musik(text, text) to authenticated;

create or replace function public.admin_story_musik(p_story text, p_version text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_story_musik(p_story, p_version) $$;

revoke execute on function public.admin_story_musik(text, text) from public, anon;
grant  execute on function public.admin_story_musik(text, text) to authenticated;
