/* ======================================================
   BELOHNUNGEN JE STORY - VOM ADMIN EINSTELLBAR
   ---------------------------------------------------
   Bisher standen die Belohnungen fest in live_story_belohnung()
   (29, 31): 150 Dublonen je Wetter-Story, Titel + Skillpunkt fuer
   Hacked, 10 Dublonen je Muenze im Schatzregen usw. Jetzt legt der
   Admin sie je Story selbst fest - Dublonen, Skillpunkte und
   optional einen Event-Titel (Tabelle event_titel aus 27).

   live_story_preise   eine Zeile je Belohnung. Danach richtet sich
                       live_story_belohnung() beim Auszahlen.
   live_event.story_preise
                       dieselben Werte als jsonb, mit Titeltext und
                       -stil. Kommt mit der Zeile, die alle Browser
                       ohnehin lesen (Realtime) - so zeigen die
                       Storys die richtigen Betraege, ohne eigene
                       Abfrage. Geschrieben nur von
                       app.story_preise_auffrischen().

   Schluessel: die Storys, die der Admin starten kann, dazu
   "hintertueren" (nach Hacked). gegenhack_niederlage zahlt wie
   "werbung" (wie bisher); gegenhack_sieg hat die Belohnungen der
   Quest (31) und bleibt aussen vor.

   Schatzregen und Werbungsflut zahlen je gefangener Muenze bzw. je
   Secret: dublonen ist dort der Betrag JE STUECK, deckel die
   Hoechstzahl Stuecke, extra_ab ab wie vielen Stuecken Skillpunkte
   und Titel dazukommen. Bei allen anderen gilt alles pauschal.

   Startwerte = die bisherigen festen Werte. Disco, Riss und
   Systemausfall hatten keine Belohnung und starten mit 0 - solange
   dort nichts eingetragen ist, aendert sich nichts.

   Neu abholbar: Art 'abschluss' fuer Disco, Riss und Systemausfall
   (am Ende der Story). live_story_belohnung wird dafuer neu
   angelegt; alle Arten aus 29/31 bleiben mit denselben
   Fruehestens-Zeiten.

   REIHENFOLGE: nach 35 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. TABELLE
====================================================== */
create table if not exists public.live_story_preise (
  schluessel    text primary key,
  dublonen      integer not null default 0,
  skillpunkte   integer not null default 0,
  titel_id      text references public.event_titel(titel_id) on delete set null,
  deckel        integer,
  extra_ab      integer,
  geaendert_am  timestamptz not null default now(),

  constraint live_story_preise_bekannt check (schluessel in
    ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'hintertueren', 'schatz',
     'werbung', 'disco', 'riss', 'ende')),
  constraint live_story_preise_dublonen check (dublonen between 0 and 30000),
  constraint live_story_preise_skillpunkte check (skillpunkte between 0 and 10),
  /* deckel/extra_ab nur dort, wo je Stueck gezahlt wird. */
  constraint live_story_preise_stueck check (
    (schluessel in ('schatz', 'werbung')) = (deckel is not null)
    and (extra_ab is null or schluessel in ('schatz', 'werbung'))),
  constraint live_story_preise_deckel check (
    deckel is null
    or (schluessel = 'schatz'  and deckel between 1 and 500)
    or (schluessel = 'werbung' and deckel between 1 and 6)),   -- es gibt nur 6 Secrets
  constraint live_story_preise_extra_ab check (extra_ab is null or extra_ab between 1 and 500),
  /* Hoechstens 30000 Dublonen auf einmal - wie der Deckel je
     Schreibvorgang in app.valid_players_write(). */
  constraint live_story_preise_summe check (dublonen * coalesce(deckel, 1) <= 30000)
);

alter table public.live_story_preise enable row level security;
alter table public.live_story_preise force row level security;
-- Keine Policy: lesen und schreiben nur die Funktionen unten; die
-- Browser sehen die Werte ueber live_event.story_preise.
revoke all on public.live_story_preise from anon, authenticated;

insert into public.live_story_preise (schluessel, dublonen, skillpunkte, titel_id, deckel, extra_ab) values
  ('sturm',        150, 0, null,             null, null),
  ('nordlicht',    150, 0, null,             null, null),
  ('nebel',        150, 0, null,             null, null),
  ('flut',         150, 0, null,             null, null),
  ('hacked',         0, 1, 'firewall-pirat', null, null),
  ('hintertueren',   0, 1, null,             null, null),
  ('schatz',        10, 1, null,             60,   25),
  ('werbung',       25, 0, null,             6,    null),
  ('disco',          0, 0, null,             null, null),
  ('riss',           0, 0, null,             null, null),
  ('ende',           0, 0, null,             null, null)
on conflict (schluessel) do nothing;


/* ======================================================
   2. KOPIE FUER DIE BROWSER: live_event.story_preise
   { "<schluessel>": { "dublonen": n, "skillpunkte": n,
                       "deckel": n|null, "extra_ab": n|null,
                       "titel": {"text": "...", "stil": "..."}|null } }
====================================================== */
alter table public.live_event
  add column if not exists story_preise jsonb not null default '{}'::jsonb;

create or replace function app.story_preise_json() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce(jsonb_object_agg(p.schluessel, jsonb_build_object(
           'dublonen', p.dublonen,
           'skillpunkte', p.skillpunkte,
           'deckel', p.deckel,
           'extra_ab', p.extra_ab,
           'titel', case when t.titel_id is null then null
                         else jsonb_build_object('text', t.text, 'stil', t.stil) end)), '{}'::jsonb)
    from public.live_story_preise p
    left join public.event_titel t on t.titel_id = p.titel_id
$$;

create or replace function app.story_preise_auffrischen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  j jsonb := app.story_preise_json();
begin
  update public.live_event set story_preise = j, updated_at = now() where id = 1;
  return j;
end
$$;

revoke execute on function app.story_preise_json()        from public, anon, authenticated;
revoke execute on function app.story_preise_auffrischen() from public, anon, authenticated;

select app.story_preise_auffrischen();


/* ======================================================
   3. ADMIN: EINE BELOHNUNG SETZEN
   p_deckel/p_extra_ab nur bei schatz und werbung (sonst null).
   p_titel_text leer/null = kein Titel. Gibt es den Titel mit
   genau diesem Text und Stil schon, wird er wiederverwendet -
   sonst neu angelegt (wie "Titel an alle" in 27).
====================================================== */
create or replace function app.admin_story_preis(
  p_schluessel  text,
  p_dublonen    integer,
  p_skillpunkte integer,
  p_deckel      integer,
  p_extra_ab    integer,
  p_titel_text  text,
  p_titel_stil  text
) returns jsonb
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  tid    text := null;
  ttext  text := nullif(btrim(coalesce(p_titel_text, '')), '');
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if not exists (select 1 from public.live_story_preise where schluessel = p_schluessel) then
    raise exception 'unbekannte-story';
  end if;

  if ttext is not null then
    if char_length(ttext) > 32 then
      raise exception 'titel-zu-lang';
    end if;
    if p_titel_stil is null or p_titel_stil not in ('regenbogen', 'gold', 'feuer', 'eis', 'hacked') then
      raise exception 'unbekannter-stil';
    end if;
    select titel_id into tid from public.event_titel
     where text = ttext and stil = p_titel_stil
     order by (titel_id = 'firewall-pirat') desc, angelegt_am
     limit 1;
    if tid is null then
      tid := app.event_titel_anlegen(ttext, p_titel_stil);
    end if;
  end if;

  /* Die Constraints der Tabelle pruefen Bereiche und Deckel - ein
     Fehler dort kommt als Ausnahme beim Admin an. */
  update public.live_story_preise
     set dublonen     = coalesce(p_dublonen, 0),
         skillpunkte  = coalesce(p_skillpunkte, 0),
         titel_id     = tid,
         deckel       = case when schluessel in ('schatz', 'werbung') then p_deckel end,
         extra_ab     = case when schluessel in ('schatz', 'werbung') then p_extra_ab end,
         geaendert_am = now()
   where schluessel = p_schluessel;

  return app.story_preise_auffrischen();
end
$$;

create or replace function public.admin_story_preis(
  p_schluessel text, p_dublonen integer, p_skillpunkte integer,
  p_deckel integer, p_extra_ab integer, p_titel_text text, p_titel_stil text
) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_story_preis(p_schluessel, p_dublonen, p_skillpunkte, p_deckel, p_extra_ab, p_titel_text, p_titel_stil) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.admin_story_preis(text, integer, integer, integer, integer, text, text)    from public, anon;
revoke execute on function public.admin_story_preis(text, integer, integer, integer, integer, text, text) from public, anon;
grant  execute on function app.admin_story_preis(text, integer, integer, integer, integer, text, text)    to authenticated;
grant  execute on function public.admin_story_preis(text, integer, integer, integer, integer, text, text) to authenticated;


/* ======================================================
   4. BELOHNUNG ABHOLEN (ersetzt die Fassung aus 31)
   ---------------------------------------------------
   Rueckgabe wie bisher:
     {"ok": true,  "dublonen": n, "skillpunkte": n, "titel": "..."|null}
     {"ok": false, "grund": "schon" | "unbekannt" | "zu-spaet" |
                            "zu-frueh" | "falsche-art" | "keine"}
   Neu ist nur "keine": fuer diese Story ist nichts eingestellt.

   Fruehestens ab (Sekunden nach dem Start), wie bisher:
     wetter 5, hacked 25, hintertueren 30, schatz 18, werbung 8
   neu (Art 'abschluss', am Ende der Story):
     disco 4 (Ausklang fruehestens nach Szene 1+2),
     ende 10 (Szenen zusammen 11,8 s), riss 290 (Film 300 s)
====================================================== */
alter table public.live_story_belohnungen drop constraint if exists live_story_belohnungen_art_bekannt;
alter table public.live_story_belohnungen add constraint live_story_belohnungen_art_bekannt
  check (art in ('wetter', 'hacked', 'hintertueren', 'schatz', 'werbung', 'abschluss'));  -- 36: 'abschluss'

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
  elsif p_art = 'abschluss' and st.story in ('disco', 'riss', 'ende') then
    schl := st.story;
    ab := case st.story when 'disco' then 4 when 'ende' then 10 else 290 end;
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

/* create or replace behaelt die Rechte aus 29 - hier nur zur Sicherheit. */
revoke execute on function app.live_story_belohnung(text, text, integer) from public, anon;
grant  execute on function app.live_story_belohnung(text, text, integer) to authenticated;
