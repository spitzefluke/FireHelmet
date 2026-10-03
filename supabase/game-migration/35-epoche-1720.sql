/* ======================================================
   EPOCHE 1720: DIE SEITE NACH DEM RISS
   ---------------------------------------------------
   Der Film "Der Riss" (32) endet im Jahr 1720 - mit einer Seite aus
   Pergament, Tinte und Leder. Danach soll die ganze Website so
   aussehen, fuer alle, bis der Admin zurueckschaltet.

   jahr_1720_ab  Ab diesem Zeitpunkt zeigen alle Browser das
                 1720-Design (css/95-epoche-1720.css). null = 2026.

   Gesetzt wird es von selbst: Startet der Admin den Riss, steht hier
   story_at + 300 s - der Film ist genau 300 s lang, und wer zuschaut,
   sieht beim Ausblenden schon die neue Seite. Bricht der Admin den
   Riss vorher ab oder startet eine andere Story, faellt der noch nicht
   erreichte Zeitpunkt wieder weg. Ein schon erreichter bleibt -
   spaetere Storys aendern an der Epoche nichts.

   Das erledigt ein Trigger auf live_event statt einer neuen Fassung
   von admin_live_story (die bleibt wie in 32).

   admin_epoche('2026')  zurueck ins Heute (null)
   admin_epoche('1720')  sofort 1720, ohne Film

   REIHENFOLGE: nach 34 einspielen. Von Hand. Idempotent.
====================================================== */

alter table public.live_event
  add column if not exists jahr_1720_ab timestamptz;


/* ======================================================
   1. RISS STARTET -> NACH DEM FILM 1720
====================================================== */
create or replace function app.live_event_epoche() returns trigger
language plpgsql set search_path = public, app, pg_temp
as $$
begin
  if new.story_id is distinct from old.story_id then
    if new.story = 'riss' and new.story_id is not null then
      new.jahr_1720_ab := coalesce(new.story_at, now()) + interval '300 seconds';
    elsif old.jahr_1720_ab is not null and old.jahr_1720_ab > now() then
      /* Riss abgebrochen oder von einer anderen Story abgeloest,
         bevor er zu Ende war: kein Sprung nach 1720. */
      new.jahr_1720_ab := null;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists live_event_epoche on public.live_event;
create trigger live_event_epoche
  before update on public.live_event
  for each row execute function app.live_event_epoche();


/* ======================================================
   2. ADMIN: UMSCHALTEN
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
  if p_jahr is null or p_jahr not in ('2026', '1720') then
    raise exception 'unbekannte-epoche';
  end if;
  update public.live_event
     set jahr_1720_ab = case when p_jahr = '1720' then now() else null end,
         updated_at   = now()
   where id = 1
  returning jahr_1720_ab into ab;
  return ab;
end
$$;

create or replace function public.admin_epoche(p_jahr text) returns timestamptz
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_epoche(p_jahr) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.live_event_epoche()        from public, anon, authenticated;
revoke execute on function app.admin_epoche(text)         from public, anon;
revoke execute on function public.admin_epoche(text)      from public, anon;
grant  execute on function app.admin_epoche(text)         to authenticated;
grant  execute on function public.admin_epoche(text)      to authenticated;
