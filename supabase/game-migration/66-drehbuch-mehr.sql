/* ======================================================
   DREHBUCH: MEHR SCHRITT-ARTEN
   ---------------------------------------------------
   Das Drehbuch (65) kann jetzt auch:

     { "art": "freigabe",   "flag": "gluecksmine", "an": true }       -- Live-Event -> Freigaben
     { "art": "seite",      "seite": "shop", "an": false }            -- Seite an/aus
     { "art": "event_start","name": "Disco-Nacht", "countdown": 10 }
     { "art": "event_ende" }
     { "art": "abstimmung", "frage": "...", "a": "...", "b": "...", "dauer": 60 }
     { "art": "buehne",     "an": true }                              -- Live-Buehne
     { "art": "epoche",     "jahr": "2100" }                          -- 2026 | 1720 | 2100
     { "art": "geschenk",   "gabe": "dublonen|skillpunkte|pass_xp|diamanten", "wert": 100 }
     { "art": "geschenk",   "gabe": "avatar", "avatar": "..." }
     { "art": "geschenk",   "gabe": "titel", "titel": "...", "stil": "gold" }
     { "art": "schlacht",   "boss": false, "tempo": 10, "ort": "", "links": "menschen",
                            "rechts": "aliens", "sammeln": 90, "staerke": 3 }
     { "art": "schlacht_ende" }

   Abgespielt wird weiter im Browser des Admins ueber dieselben RPCs
   wie die Einzelknoepfe - die pruefen Rechte und Grenzen selbst. Hier
   steht nur die Form, damit kein Unsinn gespeichert wird.

   65 bleibt unangetastet: Die alte Pruefung drehbuch_form_ok() bleibt
   stehen, die Tabelle prueft ab jetzt mit drehbuch_form_ok_66(), die
   alles Alte genauso annimmt.

   REIHENFOLGE: nach 65 einspielen. Von Hand. Idempotent.
====================================================== */

/* Ganze Zahl zwischen lo und hi (auch: Schluessel fehlt -> false). */
create or replace function public.drehbuch_zahl_ok(s jsonb, k text, lo integer, hi integer) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(s -> k) = 'number'
         and (s ->> k) ~ '^[0-9]{1,6}$'
         and (s ->> k)::int between lo and hi, false)
$$;

create or replace function public.drehbuch_text_ok(s jsonb, k text, lo integer, hi integer) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(s -> k) = 'string'
         and char_length(btrim(s ->> k)) between lo and hi, false)
$$;

create or replace function public.drehbuch_form_ok_66(j jsonb) returns boolean
language plpgsql immutable
as $$
declare
  s jsonb;
  art text;
  gabe text;
begin
  if j is null or jsonb_typeof(j) <> 'array' then return false; end if;
  if jsonb_array_length(j) > 60 then return false; end if;
  for s in select value from jsonb_array_elements(j) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    art := s ->> 'art';
    if art is null or art not in ('text', 'story', 'story_ende', 'effekt', 'pause',
        'freigabe', 'seite', 'event_start', 'event_ende', 'abstimmung', 'buehne', 'epoche',
        'geschenk', 'schlacht', 'schlacht_ende') then return false; end if;
    if coalesce(s ->> 'modus', 'hand') not in ('auto', 'hand') then return false; end if;
    if s ? 'sek' and public.drehbuch_zahl_ok(s, 'sek', 0, 3600) = false then return false; end if;

    if art = 'text' then
      if coalesce(char_length(btrim(s ->> 'text')), 0) not between 1 and 280 then return false; end if;
      if s ? 'farbe' and (s ->> 'farbe') !~ '^#[0-9a-fA-F]{3,8}$' then return false; end if;
      if s ? 'von' and char_length(s ->> 'von') > 60 then return false; end if;
    elsif art = 'story' then
      if coalesce(s ->> 'story', '') !~ '^[a-z_]{1,30}$' then return false; end if;
    elsif art = 'effekt' then
      if coalesce(s ->> 'effekt', '') not in ('konfetti', 'blitz', 'sound') then return false; end if;

    elsif art = 'freigabe' then
      if coalesce(s ->> 'flag', '') !~ '^[A-Za-z0-9_]{1,40}$' then return false; end if;
      if coalesce(jsonb_typeof(s -> 'an'), '') <> 'boolean' then return false; end if;
    elsif art = 'seite' then
      if coalesce(s ->> 'seite', '') !~ '^[A-Za-z0-9_-]{1,40}$' then return false; end if;
      if (s ->> 'seite') in ('home', 'gateway', 'impressum', 'datenschutz') then return false; end if;
      if coalesce(jsonb_typeof(s -> 'an'), '') <> 'boolean' then return false; end if;
    elsif art = 'event_start' then
      if public.drehbuch_text_ok(s, 'name', 1, 60) = false then return false; end if;
      if public.drehbuch_zahl_ok(s, 'countdown', 3, 60) = false then return false; end if;
    elsif art = 'abstimmung' then
      if public.drehbuch_text_ok(s, 'frage', 1, 120) = false
         or public.drehbuch_text_ok(s, 'a', 1, 40) = false
         or public.drehbuch_text_ok(s, 'b', 1, 40) = false
         or public.drehbuch_zahl_ok(s, 'dauer', 10, 300) = false then return false; end if;
    elsif art = 'buehne' then
      if coalesce(jsonb_typeof(s -> 'an'), '') <> 'boolean' then return false; end if;
    elsif art = 'epoche' then
      if coalesce(s ->> 'jahr', '') not in ('2026', '1720', '2100') then return false; end if;

    elsif art = 'geschenk' then
      gabe := coalesce(s ->> 'gabe', '');
      if gabe = 'dublonen' then
        if public.drehbuch_zahl_ok(s, 'wert', 1, 5000) = false then return false; end if;
      elsif gabe = 'skillpunkte' then
        if public.drehbuch_zahl_ok(s, 'wert', 1, 10) = false then return false; end if;
      elsif gabe = 'pass_xp' then
        if public.drehbuch_zahl_ok(s, 'wert', 1, 5000) = false then return false; end if;
      elsif gabe = 'diamanten' then
        if public.drehbuch_zahl_ok(s, 'wert', 1, 10000) = false then return false; end if;
      elsif gabe = 'avatar' then
        if coalesce(s ->> 'avatar', '') !~ '^[A-Za-z0-9_.-]{1,60}$' then return false; end if;
      elsif gabe = 'titel' then
        if public.drehbuch_text_ok(s, 'titel', 1, 32) = false then return false; end if;
        if coalesce(s ->> 'stil', '') not in ('regenbogen', 'gold', 'feuer', 'eis', 'hacked') then return false; end if;
      else
        return false;
      end if;

    elsif art = 'schlacht' then
      if s ? 'boss' and jsonb_typeof(s -> 'boss') <> 'boolean' then return false; end if;
      if public.drehbuch_zahl_ok(s, 'tempo', 1, 60) = false then return false; end if;
      if coalesce(s ->> 'ort', '') !~ '^[a-z_]{0,30}$' then return false; end if;
      if s ? 'links' and (s ->> 'links') !~ '^[a-z_]{1,30}$' then return false; end if;
      if s ? 'rechts' and (s ->> 'rechts') !~ '^[a-z_]{1,30}$' then return false; end if;
      if s ? 'links' and s ? 'rechts' and (s ->> 'links') = (s ->> 'rechts') then return false; end if;
      if s ? 'sammeln' and public.drehbuch_zahl_ok(s, 'sammeln', 30, 600) = false then return false; end if;
      if s ? 'staerke' and public.drehbuch_zahl_ok(s, 'staerke', 1, 10) = false then return false; end if;
    end if;
  end loop;
  return true;
end $$;

alter table public.event_drehbuecher drop constraint if exists drehbuch_schritte_form;
alter table public.event_drehbuecher drop constraint if exists drehbuch_schritte_form_66;
alter table public.event_drehbuecher add constraint drehbuch_schritte_form_66
  check (public.drehbuch_form_ok_66(schritte));

revoke all on function public.drehbuch_zahl_ok(jsonb, text, integer, integer) from anon;
revoke all on function public.drehbuch_text_ok(jsonb, text, integer, integer) from anon;
revoke all on function public.drehbuch_form_ok_66(jsonb) from anon;
