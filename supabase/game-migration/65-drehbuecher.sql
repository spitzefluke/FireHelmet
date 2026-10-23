/* ======================================================
   DREHBUECHER FUER LIVE-EVENTS
   ---------------------------------------------------
   Der Admin baut ein ganzes Event vorab: Banderolen-Text, Storys
   (auch Disco), Effekte, Pausen - in fester Reihenfolge. Jeder
   Schritt laeuft entweder automatisch nach einer Dauer oder wartet
   auf "Weiter". Abgespielt wird im Browser des Admins ueber die
   bestehenden Wege (live_event, admin_live_story) - an dem, was
   die Besucher sehen und was sie lesen duerfen, aendert sich nichts.

   schritte: jsonb-Liste, Form wird hier geprueft (drehbuch_form_ok):
     { "art": "text",       "text": "...", "farbe": "#f0c96a", "von": "...", "modus": "auto|hand", "sek": 8 }
     { "art": "story",      "story": "disco",        ... }
     { "art": "story_ende", ... }          -- beendet Disco / Schatzregen
     { "art": "effekt",     "effekt": "konfetti|blitz|sound", ... }
     { "art": "pause",      ... }
   schritt:  bei wie vielen Schritten das Abspielen steht (damit ein
             Neuladen des Admin-Bereichs mitten im Event nicht von
             vorn anfaengt).

   Nur Admins lesen und schreiben (RLS mit app.is_admin()).

   REIHENFOLGE: nach 64 einspielen (im Paket hiess sie 60 - die Nummer hat
   inzwischen der Spind). Von Hand. Idempotent.
====================================================== */

create or replace function public.drehbuch_form_ok(j jsonb) returns boolean
language plpgsql immutable
as $$
declare
  s jsonb;
  art text;
begin
  if j is null or jsonb_typeof(j) <> 'array' then return false; end if;
  if jsonb_array_length(j) > 60 then return false; end if;
  for s in select value from jsonb_array_elements(j) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    art := s ->> 'art';
    if art is null or art not in ('text', 'story', 'story_ende', 'effekt', 'pause') then return false; end if;
    if coalesce(s ->> 'modus', 'hand') not in ('auto', 'hand') then return false; end if;
    if s ? 'sek' then
      if jsonb_typeof(s -> 'sek') <> 'number' or (s ->> 'sek') !~ '^[0-9]{1,4}$' or (s ->> 'sek')::int > 3600 then return false; end if;
    end if;
    if art = 'text' then
      if coalesce(char_length(btrim(s ->> 'text')), 0) not between 1 and 280 then return false; end if;
      if s ? 'farbe' and (s ->> 'farbe') !~ '^#[0-9a-fA-F]{3,8}$' then return false; end if;
      if s ? 'von' and char_length(s ->> 'von') > 60 then return false; end if;
    elsif art = 'story' then
      if coalesce(s ->> 'story', '') !~ '^[a-z_]{1,30}$' then return false; end if;
    elsif art = 'effekt' then
      if coalesce(s ->> 'effekt', '') not in ('konfetti', 'blitz', 'sound') then return false; end if;
    end if;
  end loop;
  return true;
end $$;

create table if not exists public.event_drehbuecher (
  plan_id      text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  name         text not null,
  schritte     jsonb not null default '[]'::jsonb,
  schritt      integer not null default 0,
  geaendert_am timestamptz not null default now(),
  constraint drehbuch_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint drehbuch_schritte_form check (public.drehbuch_form_ok(schritte)),
  constraint drehbuch_schritt check (schritt between 0 and 60)
);

alter table public.event_drehbuecher enable row level security;
alter table public.event_drehbuecher force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'event_drehbuecher' and policyname = 'event_drehbuecher_admin') then
    create policy "event_drehbuecher_admin" on public.event_drehbuecher
      for all to authenticated using (app.is_admin()) with check (app.is_admin());
  end if;
end $$;

revoke all on public.event_drehbuecher from anon, authenticated;
grant select, insert, update, delete on public.event_drehbuecher to authenticated;
revoke all on function public.drehbuch_form_ok(jsonb) from anon;
