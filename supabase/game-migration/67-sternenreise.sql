/* ======================================================
   STERNENREISE FUER ALLE (Story 'reise')
   ---------------------------------------------------
   Der Film aus scripts/liveevent/sternenreise.js laeuft fuer alle
   Zuschauer zugleich, fest getaktet ab dem Start der Story:

       0    s  Sternenschlacht gegen das Mutterschiff
      48,5 s  Kanone besetzen (Name, Feuerfarbe)
      78,5 s  Reise durch fuenf Sektoren - 300 s
     378,5 s  Ergebnis: Landung auf Terra Nova oder die Arche ist verloren

   GEMEINSAME HUELLE
   Jeder Browser rechnet die Reise selbst; jeder Zuschauer verteidigt
   darin seinen eigenen Sektor (eine von neun Bahnen). Was in SEINEM
   Sektor die Arche trifft, meldet er alle paar Sekunden ueber
   reise_melden() (Summe seit Reisebeginn). Die Huelle fuer alle ist

       100 - 9 x Durchschnitt der gemeldeten Schaeden

   - wehren alle so gut ab wie der Durchschnitt, trifft die Arche
   genau so viel wie bei neun solchen Kanonen. Sie repariert sich nicht
   (die Huelle sinkt nur). Gezaehlt wird, wer eine Kanone besetzt hat.
   Grenzen gegen Unfug: hoechstens 25 Schaden je Kanone, der Schaden
   steigt hoechstens um 10 je Sekunde, Treffer um 8 je Sekunde.

   ERGEBNIS UND SEITE
   Faellt die Huelle auf 0, ist die Arche sofort fuer alle verloren.
   Sonst entscheidet reise_abschluss() nach 378,5 s (der erste Browser,
   der fragt): gelandet. Damit setzt die Datenbank live_event.reise_welt
   ('terra' oder 'verwahrung') und reise_welt_ab (Filmende). Ab dann
   sieht die ganze Seite fuer alle so aus (css/97-sternenreise.css),
   bis der Admin sie mit admin_reise_welt(null) zuruecksetzt - oder mit
   'terra'/'verwahrung' ohne Reise umschaltet.

   Wie in 51 pruefen admin_live_story, live_story_belohnung und die
   Constraints feste Story-Listen: sie werden WORTGLEICH aus 51 neu
   angelegt, nur um 'reise' ergaenzt (mit "67:" markiert). Belohnung
   ueber 'abschluss' fruehestens 400 s nach dem Start; Preis startet
   mit 0.

   REIHENFOLGE: nach 66 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. SEITE NACH DER REISE
====================================================== */
alter table public.live_event add column if not exists reise_welt text;
alter table public.live_event add column if not exists reise_welt_ab timestamptz;
alter table public.live_event add column if not exists reise_lauf text;

alter table public.live_event drop constraint if exists live_event_reise_welt_bekannt;
alter table public.live_event add constraint live_event_reise_welt_bekannt
  check (reise_welt is null or reise_welt in ('terra', 'verwahrung'));


/* ======================================================
   2. LAEUFE UND KANONEN
   Nur ueber die Funktionen unten - keine Rechte, keine Policy.
====================================================== */
create table if not exists public.reise_laeufe (
  story_id     text primary key references public.live_storys (story_id) on delete cascade,
  gestartet_am timestamptz not null default now(),
  huelle       numeric(6,2) not null default 100,
  ergebnis     text,
  ergebnis_at  timestamptz,
  constraint reise_laeufe_huelle check (huelle between 0 and 100),
  constraint reise_laeufe_ergebnis check (ergebnis is null or ergebnis in ('gelandet', 'verloren'))
);

create table if not exists public.reise_kanonen (
  story_id     text not null references public.reise_laeufe (story_id) on delete cascade,
  firebase_uid text not null,
  name         text,
  farbe        text not null default '#b5abfc',
  schaden      numeric(6,2) not null default 0,
  treffer      integer not null default 0,
  gemeldet_at  timestamptz not null default now(),
  primary key (story_id, firebase_uid),
  constraint reise_kanonen_name check (name is null or char_length(name) between 1 and 18),
  constraint reise_kanonen_farbe check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  constraint reise_kanonen_schaden check (schaden between 0 and 25),
  constraint reise_kanonen_treffer check (treffer between 0 and 100000)
);

alter table public.reise_laeufe enable row level security;
alter table public.reise_laeufe force row level security;
alter table public.reise_kanonen enable row level security;
alter table public.reise_kanonen force row level security;
revoke all on public.reise_laeufe from anon, authenticated;
revoke all on public.reise_kanonen from anon, authenticated;

/* Takt in Sekunden ab dem Start der Story (wie im Browser). */
create or replace function app.reise_takt(p_teil text) returns numeric
language sql immutable
as $$
  select case p_teil when 'bereit' then 48.5 when 'reise' then 78.5 when 'ende' then 378.5 end::numeric
$$;


/* ======================================================
   3. STAND (fuer alle, die die Reise sehen)
====================================================== */
create or replace function app.reise_stand_json(p_story_id text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  l    public.reise_laeufe;
  crew jsonb;
  ich  public.reise_kanonen;
begin
  select * into l from public.reise_laeufe where story_id = p_story_id;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  select coalesce(jsonb_agg(z order by (z ->> 'treffer')::int desc), '[]'::jsonb) into crew
    from (select jsonb_build_object(
                   'name', coalesce(k.name, nullif(p.nickname, ''), 'Kanone'),
                   'farbe', k.farbe, 'treffer', k.treffer, 'ich', k.firebase_uid = uid) as z
            from public.reise_kanonen k
            left join public.players p on p.firebase_uid = k.firebase_uid
           where k.story_id = p_story_id
           order by k.treffer desc
           limit 12) x;
  select * into ich from public.reise_kanonen where story_id = p_story_id and firebase_uid = uid;
  return jsonb_build_object(
    'ok', true,
    'huelle', l.huelle,
    'ergebnis', l.ergebnis,
    'ergebnis_at', l.ergebnis_at,
    'sekunden', round(extract(epoch from now() - l.gestartet_am)::numeric, 1),
    'kanonen', (select count(*) from public.reise_kanonen where story_id = p_story_id),
    'treffer_gesamt', (select coalesce(sum(treffer), 0) from public.reise_kanonen where story_id = p_story_id),
    'crew', crew,
    'ich', case when ich.firebase_uid is null then null
                else jsonb_build_object('treffer', ich.treffer, 'schaden', ich.schaden) end);
end
$$;

/* Die Arche ist verloren bzw. gelandet: Ergebnis und Seite setzen. */
create or replace function app.reise_ergebnis_setzen(p_story_id text, p_ergebnis text) returns void
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  update public.reise_laeufe
     set ergebnis = p_ergebnis, ergebnis_at = now()
   where story_id = p_story_id and ergebnis is null;
  if not found then
    return;
  end if;
  /* Nur die laufende Story schaltet die Seite um. Filmende: Zerstoerung
     6 s, Anflug und Landung zusammen gut 21 s. */
  update public.live_event
     set reise_welt    = case p_ergebnis when 'gelandet' then 'terra' else 'verwahrung' end,
         reise_welt_ab = now() + case p_ergebnis when 'gelandet' then interval '22 seconds' else interval '7 seconds' end,
         reise_lauf    = p_story_id,
         updated_at    = now()
   where id = 1 and story_id = p_story_id;
end
$$;


/* ======================================================
   4. MELDEN (je Kanone, waehrend der Reise)
====================================================== */
create or replace function app.reise_melden(p_story_id text, p_schaden numeric, p_treffer integer, p_name text, p_farbe text)
  returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  l     public.reise_laeufe;
  alt   public.reise_kanonen;
  sek   numeric;
  seit  numeric;
  sch   numeric;
  tr    integer;
  nm    text;
  fa    text;
  neu   numeric;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into l from public.reise_laeufe where story_id = p_story_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  sek := extract(epoch from now() - l.gestartet_am);
  /* Nur waehrend der Reise (5 s Spielraum fuer langsame Uhren). */
  if l.ergebnis is not null or sek < app.reise_takt('reise') - 5 or sek > app.reise_takt('ende') + 5 then
    return app.reise_stand_json(p_story_id);
  end if;

  nm := nullif(btrim(coalesce(p_name, '')), '');
  if nm is not null and (char_length(nm) > 18 or nm ~ '[[:cntrl:]]' or app.name_erlaubt(nm) = false) then
    nm := null;
  end if;
  fa := case when coalesce(p_farbe, '') ~ '^#[0-9a-fA-F]{6}$' then p_farbe else '#b5abfc' end;

  select * into alt from public.reise_kanonen where story_id = p_story_id and firebase_uid = uid;
  seit := case when alt.firebase_uid is null then greatest(1, sek - app.reise_takt('reise'))
               else greatest(0, extract(epoch from now() - alt.gemeldet_at)) end;
  sch := least(25, greatest(coalesce(alt.schaden, 0), least(coalesce(p_schaden, 0), coalesce(alt.schaden, 0) + 10 * seit)));
  tr  := least(100000, greatest(coalesce(alt.treffer, 0), least(coalesce(p_treffer, 0), coalesce(alt.treffer, 0) + (8 * seit)::integer)));

  insert into public.reise_kanonen (story_id, firebase_uid, name, farbe, schaden, treffer, gemeldet_at)
       values (p_story_id, uid, nm, fa, sch, tr, now())
  on conflict (story_id, firebase_uid) do update
     set name = excluded.name, farbe = excluded.farbe, schaden = excluded.schaden,
         treffer = excluded.treffer, gemeldet_at = excluded.gemeldet_at;

  /* Huelle: 100 - 9 x Durchschnitt; sie sinkt nur. */
  select greatest(0, 100 - 9 * avg(schaden)) into neu from public.reise_kanonen where story_id = p_story_id;
  update public.reise_laeufe set huelle = least(huelle, round(neu, 2)) where story_id = p_story_id
  returning huelle into neu;
  if neu <= 0 then
    perform app.reise_ergebnis_setzen(p_story_id, 'verloren');
  end if;
  return app.reise_stand_json(p_story_id);
end
$$;

/* Nach dem Ende der Reise: wer zuerst fragt, setzt das Ergebnis. */
create or replace function app.reise_abschluss(p_story_id text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  l public.reise_laeufe;
begin
  select * into l from public.reise_laeufe where story_id = p_story_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if l.ergebnis is null and now() >= l.gestartet_am + make_interval(secs => app.reise_takt('ende')) then
    perform app.reise_ergebnis_setzen(p_story_id, case when l.huelle > 0 then 'gelandet' else 'verloren' end);
  end if;
  return app.reise_stand_json(p_story_id);
end
$$;


/* ======================================================
   5. ADMIN: SEITE UMSCHALTEN
   'terra' oder 'verwahrung' sofort fuer alle, null = zurueck.
====================================================== */
create or replace function app.admin_reise_welt(p_art text) returns timestamptz
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  ab timestamptz;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_art is not null and p_art not in ('terra', 'verwahrung') then
    raise exception 'unbekannte-welt';
  end if;
  update public.live_event
     set reise_welt = p_art,
         reise_welt_ab = case when p_art is null then null else now() end,
         reise_lauf = null,
         updated_at = now()
   where id = 1
  returning reise_welt_ab into ab;
  return ab;
end
$$;


/* ======================================================
   6. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.reise_konto_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  delete from public.reise_kanonen where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists reise_konto_aufraeumen on public.players;
create trigger reise_konto_aufraeumen
  after delete on public.players
  for each row execute function app.reise_konto_aufraeumen();


/* ======================================================
   7. WRAPPER UND RECHTE
====================================================== */
create or replace function public.reise_stand(p_story_id text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.reise_stand_json(p_story_id) $$;
create or replace function public.reise_melden(p_story_id text, p_schaden numeric, p_treffer integer, p_name text, p_farbe text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.reise_melden(p_story_id, p_schaden, p_treffer, p_name, p_farbe) $$;
create or replace function public.reise_abschluss(p_story_id text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.reise_abschluss(p_story_id) $$;
create or replace function public.admin_reise_welt(p_art text) returns timestamptz
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_reise_welt(p_art) $$;

revoke execute on function app.reise_takt(text)                                      from public, anon, authenticated;
revoke execute on function app.reise_stand_json(text)                                from public, anon, authenticated;
revoke execute on function app.reise_ergebnis_setzen(text, text)                     from public, anon, authenticated;
revoke execute on function app.reise_melden(text, numeric, integer, text, text)      from public, anon, authenticated;
revoke execute on function app.reise_abschluss(text)                                 from public, anon, authenticated;
revoke execute on function app.admin_reise_welt(text)                                from public, anon, authenticated;
revoke execute on function app.reise_konto_aufraeumen()                              from public, anon, authenticated;
revoke execute on function public.reise_stand(text)                                  from public, anon;
revoke execute on function public.reise_melden(text, numeric, integer, text, text)   from public, anon;
revoke execute on function public.reise_abschluss(text)                              from public, anon;
revoke execute on function public.admin_reise_welt(text)                             from public, anon;
grant  execute on function public.reise_stand(text)                                  to authenticated;
grant  execute on function public.reise_melden(text, numeric, integer, text, text)   to authenticated;
grant  execute on function public.reise_abschluss(text)                              to authenticated;
grant  execute on function public.admin_reise_welt(text)                             to authenticated;


/* ======================================================
   8. STORY 'reise' ZULASSEN
====================================================== */
alter table public.live_event drop constraint if exists live_event_story_bekannt;
alter table public.live_event add constraint live_event_story_bekannt
  check (story is null or story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                                    'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                                    'riss', 'herz', 'zeit', 'nukes', 'reise'));  -- 46: 'zeit', 51: 'nukes', 67: 'reise'

alter table public.live_storys drop constraint if exists live_storys_story_bekannt;
alter table public.live_storys add constraint live_storys_story_bekannt
  check (story in ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'ende', 'schatz', 'disco',
                   'werbung', 'gegenhack_sieg', 'gegenhack_niederlage',
                   'riss', 'herz', 'zeit', 'nukes', 'reise'));  -- 46: 'zeit', 51: 'nukes', 67: 'reise'


/* admin_live_story aus 51, wortgleich - 67: 'reise' (legt dazu den Lauf in reise_laeufe an). */
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
                     'riss', 'herz', 'zeit', 'nukes', 'reise') then  -- 32: 'riss', 38: 'herz', 46: 'zeit', 51: 'nukes', 67: 'reise'
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
   BELOHNUNG (Migration 36/38/46/51)
====================================================== */
alter table public.live_story_preise drop constraint if exists live_story_preise_bekannt;
alter table public.live_story_preise add constraint live_story_preise_bekannt check (schluessel in
  ('sturm', 'nordlicht', 'nebel', 'flut', 'hacked', 'hintertueren', 'schatz',
   'werbung', 'disco', 'riss', 'ende', 'herz', 'zeit', 'nukes', 'reise'));  -- 46: 'zeit', 51: 'nukes', 67: 'reise'

insert into public.live_story_preise (schluessel, dublonen, skillpunkte) values ('reise', 0, 0)
on conflict (schluessel) do nothing;

select app.story_preise_auffrischen();


/* live_story_belohnung aus 51, wortgleich - 67: 'reise' als Abschluss (ab 400 s, nach der Landung). */
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
  elsif p_art = 'abschluss' and st.story in ('disco', 'riss', 'ende', 'herz', 'zeit', 'nukes', 'reise') then  -- 38: 'herz', 46: 'zeit', 51: 'nukes', 67: 'reise'
    schl := st.story;
    ab := case st.story when 'disco' then 4 when 'ende' then 10 when 'herz' then 600 when 'nukes' then 170 when 'reise' then 400 else 290 end;  -- 51: 'nukes', 67: 'reise'
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
