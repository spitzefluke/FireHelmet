/* ======================================================
   NORDLICHT: WIRKLICH ETWAS WUENSCHEN
   ---------------------------------------------------
   Erscheint in der Live-Story "nordlicht" der Satz "Wuensch dir was",
   schweben Wunschsterne heran (scripts/liveevent/nordlicht-wunsch.js).
   Jeder Spieler tippt EINEN an und bekommt genau den - garantiert,
   einmal je Nordlicht.

   Angebot (nordlicht_angebot):
     dublonen   500 Dublonen
     skillpunkt 1 Skillpunkt (Deckel 500 aus 22)
     pass_xp    250 Pass-XP fuer die laufende Saison
     titel      ein Nordlicht-Titel, den der Spieler noch nicht hat:
                erst "Sternenkind" (eis), dann "Polarlichtjaeger"
                (regenbogen); hat er beide, entfaellt die Karte
   Die Werte stehen fest hier (Entscheidung: "immer erfuellt", keine
   Einstellung im Admin).

   Erfuellen (nordlicht_wunsch): ab 9 s nach dem Start der Story (die
   Wunsch-Szene beginnt bei 10,4 s) und bis 30 Minuten danach. Ein
   Eintrag je Spieler und Story in nordlicht_wuensche; ein zweiter
   Wunsch meldet "schon". Stoesst die Gutschrift an den Tagesdeckel
   der Dublonen (41), wird nichts verbucht - der Spieler kann dann
   einen anderen Stern waehlen.

   Die alte Nordlicht-Belohnung (36, "wetter": 150 Dublonen fuer alle)
   ersetzt der Wunsch: ihr Preis wird hier auf 0 gesetzt, sonst liesse
   sich beides abholen.

   REIHENFOLGE: nach 51 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. TITEL UND TABELLE
====================================================== */
insert into public.event_titel (titel_id, text, stil) values
  ('nordlicht_sternenkind', 'Sternenkind', 'eis'),
  ('nordlicht_polarlicht', 'Polarlichtjäger', 'regenbogen')
on conflict (titel_id) do nothing;

create table if not exists public.nordlicht_wuensche (
  firebase_uid text not null,
  story_id     text not null,
  wunsch       text not null,
  erfuellt_am  timestamptz not null default now(),
  primary key (firebase_uid, story_id),
  constraint nordlicht_wunsch_bekannt check (wunsch in ('dublonen', 'skillpunkt', 'pass_xp', 'titel'))
);

alter table public.nordlicht_wuensche enable row level security;
alter table public.nordlicht_wuensche force row level security;

drop policy if exists nordlicht_wuensche_eigene on public.nordlicht_wuensche;
create policy nordlicht_wuensche_eigene on public.nordlicht_wuensche
  for select to authenticated using (firebase_uid = app.firebase_uid());

revoke all on public.nordlicht_wuensche from anon, authenticated;
grant select on public.nordlicht_wuensche to authenticated;

/* Die alte Pauschal-Belohnung fuer alle entfaellt (siehe oben). */
update public.live_story_preise set dublonen = 0, skillpunkte = 0, titel_id = null where schluessel = 'nordlicht';
select app.story_preise_auffrischen();


/* ======================================================
   2. ANGEBOT
====================================================== */
/* Gemeinsame Pruefung: Story ist ein Nordlicht und im Wunsch-Fenster. */
create or replace function app.nordlicht_fenster(p_story_id text) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  st public.live_storys;
begin
  select * into st from public.live_storys where story_id = p_story_id;
  if not found or st.story <> 'nordlicht' then
    return 'unbekannt';
  end if;
  if now() < st.gestartet_am + interval '9 seconds' then
    return 'zu-frueh';
  end if;
  if now() > st.gestartet_am + interval '30 minutes' then
    return 'zu-spaet';
  end if;
  return null;
end
$$;

/* Erster Nordlicht-Titel, den der Spieler noch nicht hat (oder null). */
create or replace function app.nordlicht_titel_frei(p_uid text) returns text
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select t from unnest(array['nordlicht_sternenkind', 'nordlicht_polarlicht']) with ordinality as x(t, n)
   where not exists (select 1 from public.spieler_event_titel s where s.firebase_uid = p_uid and s.titel_id = x.t)
   order by n limit 1
$$;

create or replace function app.nordlicht_angebot(p_story_id text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  grund  text;
  schon  text;
  tid    text;
  karten jsonb;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  grund := app.nordlicht_fenster(p_story_id);
  if grund is not null and grund <> 'zu-frueh' then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  select wunsch into schon from public.nordlicht_wuensche where firebase_uid = uid and story_id = p_story_id;

  karten := jsonb_build_array(
    jsonb_build_object('wunsch', 'dublonen', 'wert', 500),
    jsonb_build_object('wunsch', 'skillpunkt', 'wert', 1),
    jsonb_build_object('wunsch', 'pass_xp', 'wert', 250));
  tid := app.nordlicht_titel_frei(uid);
  if tid is not null then
    karten := karten || jsonb_build_array((select jsonb_build_object('wunsch', 'titel', 'titel_id', t.titel_id, 'text', t.text, 'stil', t.stil)
                                             from public.event_titel t where t.titel_id = tid));
  end if;
  return jsonb_build_object('ok', true, 'schon', schon, 'karten', karten);
end
$$;


/* ======================================================
   3. ERFUELLEN
====================================================== */
create or replace function app.nordlicht_wunsch(p_story_id text, p_wunsch text, p_pass_id text default null) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text;
  tid   text;
  erg   jsonb;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if p_wunsch is null or p_wunsch not in ('dublonen', 'skillpunkt', 'pass_xp', 'titel') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  grund := app.nordlicht_fenster(p_story_id);
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if p_wunsch = 'pass_xp' and (p_pass_id is null or p_pass_id !~ '^[a-z0-9_-]{1,40}$') then
    return jsonb_build_object('ok', false, 'grund', 'keine-saison');
  end if;
  if p_wunsch = 'titel' then
    tid := app.nordlicht_titel_frei(uid);
    if tid is null then
      return jsonb_build_object('ok', false, 'grund', 'titel-schon');
    end if;
  end if;

  begin
    insert into public.nordlicht_wuensche (firebase_uid, story_id, wunsch) values (uid, p_story_id, p_wunsch)
    on conflict do nothing;
    if not found then
      return jsonb_build_object('ok', false, 'grund', 'schon',
        'wunsch', (select wunsch from public.nordlicht_wuensche where firebase_uid = uid and story_id = p_story_id));
    end if;

    if p_wunsch = 'dublonen' then
      insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
      update public.players set currency = currency + 500 where firebase_uid = uid;
      erg := jsonb_build_object('dublonen', 500);
    elsif p_wunsch = 'skillpunkt' then
      insert into public.player_progression (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
      /* least(): Deckel aus 22 (bonus_skill_points <= 500). */
      update public.player_progression
         set bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + 1), updated_at = now()
       where firebase_uid = uid;
      erg := jsonb_build_object('skillpunkte', 1);
    elsif p_wunsch = 'pass_xp' then
      perform app.pass_xp_gutschreiben(uid, 250, p_pass_id);
      erg := jsonb_build_object('pass_xp', 250);
    else
      insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, tid)
      on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
      erg := jsonb_build_object('titel', (select jsonb_build_object('text', t.text, 'stil', t.stil) from public.event_titel t where t.titel_id = tid));
    end if;
  exception when others then
    /* Tagesdeckel (41) o. ae.: nichts verbucht, auch kein Wunsch. */
    if sqlerrm = 'dublonen-tageslimit' then
      return jsonb_build_object('ok', false, 'grund', 'tageslimit');
    end if;
    raise;
  end;

  return jsonb_build_object('ok', true, 'wunsch', p_wunsch) || erg;
end
$$;


/* ======================================================
   4. WRAPPER UND RECHTE
====================================================== */
create or replace function public.nordlicht_angebot(p_story_id text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.nordlicht_angebot(p_story_id) $$;
create or replace function public.nordlicht_wunsch(p_story_id text, p_wunsch text, p_pass_id text default null) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.nordlicht_wunsch(p_story_id, p_wunsch, p_pass_id) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.nordlicht_fenster(text)                         from public, anon, authenticated;
revoke execute on function app.nordlicht_titel_frei(text)                      from public, anon, authenticated;
revoke execute on function app.nordlicht_angebot(text)                         from public, anon;
revoke execute on function app.nordlicht_wunsch(text, text, text)              from public, anon;
revoke execute on function public.nordlicht_angebot(text)                      from public, anon;
revoke execute on function public.nordlicht_wunsch(text, text, text)           from public, anon;
grant  execute on function app.nordlicht_angebot(text)                         to authenticated;
grant  execute on function app.nordlicht_wunsch(text, text, text)              to authenticated;
grant  execute on function public.nordlicht_angebot(text)                      to authenticated;
grant  execute on function public.nordlicht_wunsch(text, text, text)           to authenticated;
