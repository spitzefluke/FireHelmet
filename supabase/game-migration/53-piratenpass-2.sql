/* ======================================================
   PIRATENPASS #2: DIE SEEKARTE
   ---------------------------------------------------
   Zweite Saison auf der "???"-Seite. Sie startet, sobald der Admin
   im Panel "Pass 2 freischalten" drueckt (siteConfig.pass2Ab, ein
   ISO-Zeitpunkt), und loest Pass 1 ab. Laufzeit 61 Tage, 50 Stufen,
   dieselbe XP-Kurve wie Pass 1 (Stufe N braucht N*(N+1)*50 Pass-XP).

   ZWEI SPUREN
     matrose   fuer alle
     kapitaen  nur mit Kapitaenspass (einmalig 950 Dublonen)

   Anders als bei Pass 1 entscheidet hier der SERVER, was eine Stufe
   gibt und ob sie schon erreicht ist: Die Belohnungen stehen in
   pass_belohnungen, das Abholen laeuft nur ueber
   pass_belohnung_holen(). Der Browser schickt "Stufe 12, Kapitaen"
   und bekommt zurueck, was gutgeschrieben wurde. Dadurch faellt
   auch nichts in claimed_reward_ids (Deckel 300).

   SKILLPUNKTE UEBERLEBEN DEN SAISONWECHSEL
   Die Skillpunkte aus 22 folgen aus der Passstufe (skill_level(
   pass_xp)). Beim Wechsel auf season2 faellt pass_xp auf 0 - ohne
   Gegenmassnahme waeren alle verdienten Punkte weg und bereits
   ausgegebene staenden im Minus. Deshalb merkt sich ein Trigger beim
   Wechsel die erreichte Stufe in fruehere_pass_stufen, und
   skill_freischalten() zaehlt sie mit.

   Dazu eine zweite Bedingung in valid_progression_write(): Ein
   direkter Schreibzugriff darf pass_id nur auf die LAUFENDE Saison
   setzen und dabei hoechstens 500 Pass-XP mitbringen. Bisher war
   pass_xp bei einem Wechsel ungedeckelt - mit nur einer Saison
   harmlos, mit zweien liesse sich sonst hin- und herspringen.

   REIHENFOLGE: nach 52 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. SAISON ZULASSEN UND ERKENNEN
====================================================== */
alter table public.player_progression drop constraint if exists progression_pass_id_valid;
alter table public.player_progression
  add constraint progression_pass_id_valid check (pass_id is null or pass_id in ('season1', 'season2'));

/* Beginn von Pass 2 laut Admin-Freigabe, sonst null. Ein kaputter
   Eintrag im Blob zaehlt als "nicht freigegeben". */
create or replace function app.pass2_start() returns timestamptz
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  roh text;
begin
  select data ->> 'pass2Ab' into roh from public.site_config where id = 'main';
  if roh is null or roh = '' then
    return null;
  end if;
  return roh::timestamptz;
exception when others then
  return null;
end
$$;

/* Laeuft die Saison gerade? Nur season2 hat ein Fenster auf dem
   Server; season1 rechnet wie bisher allein der Browser. */
create or replace function app.pass_saison_offen(p_pass_id text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select p_pass_id = 'season2'
     and app.pass2_start() is not null
     and now() >= app.pass2_start()
     and now() < app.pass2_start() + interval '61 days'
$$;

/* Die Saison, auf die ein Spieler wechseln darf. */
create or replace function app.pass_saison_aktuell() returns text
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select case when app.pass2_start() is not null and now() >= app.pass2_start() then 'season2' else 'season1' end
$$;


/* ======================================================
   2. SKILLPUNKTE AUS FRUEHEREN SAISONS
====================================================== */
alter table public.player_progression
  add column if not exists fruehere_pass_stufen integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'progression_fruehere_stufen_sane') then
    alter table public.player_progression
      add constraint progression_fruehere_stufen_sane check (fruehere_pass_stufen between 0 and 500);
  end if;
end $$;

/* Der Wert gehoert allein diesem Trigger: Was ein Client oder eine
   andere Funktion hineinschreibt, wird hier ueberschrieben. */
create or replace function app.pass_wechsel_merken() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.fruehere_pass_stufen := 0;
    return new;
  end if;
  new.fruehere_pass_stufen := coalesce(old.fruehere_pass_stufen, 0);
  if old.pass_id is not null and new.pass_id is distinct from old.pass_id then
    new.fruehere_pass_stufen := least(500, new.fruehere_pass_stufen + app.skill_level(old.pass_xp));
  end if;
  return new;
end
$$;

drop trigger if exists pass_wechsel_merken on public.player_progression;
create trigger pass_wechsel_merken
  before insert or update on public.player_progression
  for each row execute function app.pass_wechsel_merken();

/* Rumpf aus 22 Wort fuer Wort, nur die Zeile "verfuegbar" zaehlt
   fruehere_pass_stufen mit. */
create or replace function app.skill_freischalten(p_node text) returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid        text := app.firebase_uid();
  prog       public.player_progression;
  knoten     public.skill_nodes;
  ausgegeben integer := 0;
  verfuegbar integer;
  fehlt      text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;

  select * into knoten from public.skill_nodes where node_id = p_node;
  if not found then
    return -1;
  end if;

  /* Zeile anlegen, falls der Spieler noch keine hat. */
  insert into public.player_progression (firebase_uid) values (uid)
  on conflict (firebase_uid) do nothing;
  select * into prog from public.player_progression where firebase_uid = uid;

  if knoten.node_id = any(prog.unlocked_skills) then
    return 0;
  end if;

  /* Voraussetzungen: jeder benoetigte Knoten muss schon da sein. */
  foreach fehlt in array knoten.benoetigt loop
    if not (fehlt = any(prog.unlocked_skills)) then
      return -2;
    end if;
  end loop;

  /* Bereits ausgegebene Punkte = Summe der Kosten aller
     freigeschalteten Knoten. */
  select coalesce(sum(sk.kosten), 0) into ausgegeben
    from public.skill_nodes sk
   where sk.node_id = any(prog.unlocked_skills);

  verfuegbar := app.skill_level(prog.pass_xp) + coalesce(prog.bonus_skill_points, 0)
              + coalesce(prog.fruehere_pass_stufen, 0) - ausgegeben;
  if verfuegbar < knoten.kosten then
    return -3;
  end if;

  update public.player_progression
     set unlocked_skills = array_append(unlocked_skills, knoten.node_id),
         updated_at = now()
   where firebase_uid = uid;

  return knoten.kosten;
end
$$;

/* Rumpf aus 22 Wort fuer Wort, dazu EINE Bedingung am Ende. */
create or replace function app.valid_progression_write(p_uid text, new_row public.player_progression) returns boolean
language plpgsql stable
as $$
declare
  old_row public.player_progression := app.old_progression(p_uid);
  old_xp integer := coalesce(old_row.xp, 0);
  old_pass_id text := old_row.pass_id;
  old_pass_xp integer := coalesce(old_row.pass_xp, 0);
  old_claimed_count integer := coalesce(array_length(old_row.claimed_reward_ids,1), 0);
  new_claimed_count integer := coalesce(array_length(new_row.claimed_reward_ids,1), 0);
begin
  return new_row.xp <= old_xp + 500
    and (new_row.pass_id != old_pass_id or new_row.pass_xp <= old_pass_xp + 500)
    and new_claimed_count >= old_claimed_count
    and new_claimed_count <= old_claimed_count + 1
    and new_row.has_flitzpiepen_cap = coalesce(old_row.has_flitzpiepen_cap, false)
    /* NEU: der Skill-Baum wird nur ueber die RPC geaendert. */
    and new_row.unlocked_skills = coalesce(old_row.unlocked_skills, '{}')
    and new_row.bonus_skill_points = coalesce(old_row.bonus_skill_points, 0)
    /* NEU (53): Saisonwechsel nur auf die laufende Saison, mit
       hoechstens 500 Pass-XP. */
    and (new_row.pass_id is not distinct from old_pass_id
         or (new_row.pass_id = app.pass_saison_aktuell() and new_row.pass_xp <= 500));
end;
$$;


/* ======================================================
   3. TITEL, BELOHNUNGEN, TABELLEN
====================================================== */
insert into public.event_titel (titel_id, text, stil) values
  ('pass2_deckschrubber', 'Deckschrubber a.D.', 'gold'),
  ('pass2_seewolf', 'Seewolf', 'eis'),
  ('pass2_verflucht', 'Verfluchter Kapitän', 'feuer'),
  ('pass2_schrecken', 'Schrecken der Meere', 'regenbogen')
on conflict (titel_id) do nothing;

create table if not exists public.pass_belohnungen (
  pass_id     text not null,
  stufe       integer not null,
  spur        text not null,
  dublonen    integer not null default 0,
  xp          integer not null default 0,
  skillpunkte integer not null default 0,
  avatar_id   text,
  avatar_tage integer,
  titel_id    text references public.event_titel (titel_id),
  primary key (pass_id, stufe, spur),
  constraint pass_belohnung_stufe check (stufe between 1 and 50),
  constraint pass_belohnung_spur check (spur in ('matrose', 'kapitaen')),
  constraint pass_belohnung_werte check (dublonen between 0 and 5000 and xp between 0 and 500
                                         and skillpunkte between 0 and 5
                                         and (avatar_tage is null or avatar_tage between 1 and 14))
);

alter table public.pass_belohnungen enable row level security;
alter table public.pass_belohnungen force row level security;
/* Gelesen wird ueber pass_stand(), geschrieben nur per Migration. */
revoke all on public.pass_belohnungen from anon, authenticated;

/* Das Muster der normalen Stufen, darunter die Meilensteine 10/20/
   30/40/50 von Hand. Steht hier und nur hier - die Seite liest es
   ueber pass_stand(). */
insert into public.pass_belohnungen (pass_id, stufe, spur, dublonen, xp, skillpunkte)
select 'season2', n, 'matrose',
       case when n % 5 <> 0 and n % 2 = 1 then 40 + 4 * n else 0 end,
       case when n % 5 <> 0 and n % 2 = 0 then 50 + 2 * n else 0 end,
       case when n % 5 = 0 then 1 else 0 end
  from generate_series(1, 50) n
 where n % 10 <> 0
on conflict (pass_id, stufe, spur) do nothing;

insert into public.pass_belohnungen (pass_id, stufe, spur, dublonen, xp, skillpunkte)
select 'season2', n, 'kapitaen',
       case when n % 3 <> 0 and n % 2 = 1 then 80 + 6 * n else 0 end,
       case when n % 3 <> 0 and n % 2 = 0 then 100 + 4 * n else 0 end,
       case when n % 3 = 0 then 1 else 0 end
  from generate_series(1, 50) n
 where n % 10 <> 0
on conflict (pass_id, stufe, spur) do nothing;

insert into public.pass_belohnungen (pass_id, stufe, spur, dublonen, xp, skillpunkte, avatar_id, avatar_tage, titel_id) values
  ('season2', 10, 'matrose',  300, 0, 0, null, null, null),
  ('season2', 20, 'matrose',    0, 0, 0, null, null, 'pass2_deckschrubber'),
  ('season2', 30, 'matrose',  500, 0, 0, null, null, null),
  ('season2', 40, 'matrose',    0, 0, 0, 'pass-s2-knochenflagge', null, null),
  ('season2', 50, 'matrose',  500, 0, 0, null, null, 'pass2_seewolf'),
  ('season2', 10, 'kapitaen',   0, 0, 0, 'pass-s2-moewenschrei', null, null),
  ('season2', 20, 'kapitaen',   0, 0, 0, 'pass-s2-geisterpapagei', 7, null),
  ('season2', 30, 'kapitaen',   0, 0, 0, 'pass-s2-rote-lilie', null, null),
  ('season2', 40, 'kapitaen',   0, 0, 2, null, null, 'pass2_verflucht'),
  ('season2', 50, 'kapitaen', 1000, 0, 0, 'pass-s2-schwarze-witwe', null, 'pass2_schrecken')
on conflict (pass_id, stufe, spur) do nothing;

create table if not exists public.pass_belohnungen_geholt (
  firebase_uid text not null,
  pass_id      text not null,
  stufe        integer not null,
  spur         text not null,
  geholt_am    timestamptz not null default now(),
  primary key (firebase_uid, pass_id, stufe, spur)
);

create table if not exists public.pass_kapitaen (
  firebase_uid text not null,
  pass_id      text not null,
  preis        integer not null,
  gekauft_am   timestamptz not null default now(),
  primary key (firebase_uid, pass_id)
);

alter table public.pass_belohnungen_geholt enable row level security;
alter table public.pass_belohnungen_geholt force row level security;
alter table public.pass_kapitaen enable row level security;
alter table public.pass_kapitaen force row level security;

drop policy if exists pass_geholt_eigene on public.pass_belohnungen_geholt;
create policy pass_geholt_eigene on public.pass_belohnungen_geholt
  for select to authenticated using (firebase_uid = app.firebase_uid());
drop policy if exists pass_kapitaen_eigene on public.pass_kapitaen;
create policy pass_kapitaen_eigene on public.pass_kapitaen
  for select to authenticated using (firebase_uid = app.firebase_uid());

revoke all on public.pass_belohnungen_geholt from anon, authenticated;
revoke all on public.pass_kapitaen from anon, authenticated;
grant select on public.pass_belohnungen_geholt to authenticated;
grant select on public.pass_kapitaen to authenticated;


/* ======================================================
   4. STAND, KAUF, ABHOLEN
====================================================== */
create or replace function app.pass_stand(p_pass_id text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  prog public.player_progression;
  pxp  integer := 0;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into prog from public.player_progression where firebase_uid = uid;
  if found and prog.pass_id is not distinct from p_pass_id then
    pxp := coalesce(prog.pass_xp, 0);
  end if;
  return jsonb_build_object(
    'offen', app.pass_saison_offen(p_pass_id),
    'pass_xp', pxp,
    'stufe', app.skill_level(pxp),
    'kapitaen', exists (select 1 from public.pass_kapitaen k where k.firebase_uid = uid and k.pass_id = p_pass_id),
    'preis', 950,
    'dublonen', coalesce((select currency from public.players where firebase_uid = uid), 0),
    'geholt', coalesce((select jsonb_agg(g.stufe || ':' || g.spur) from public.pass_belohnungen_geholt g
                         where g.firebase_uid = uid and g.pass_id = p_pass_id), '[]'::jsonb),
    'belohnungen', coalesce((select jsonb_agg(jsonb_build_object(
                         'stufe', b.stufe, 'spur', b.spur, 'dublonen', b.dublonen, 'xp', b.xp,
                         'skillpunkte', b.skillpunkte, 'avatar_id', b.avatar_id, 'avatar_tage', b.avatar_tage,
                         'titel_id', b.titel_id, 'titel_text', t.text, 'titel_stil', t.stil)
                         order by b.stufe, b.spur)
                       from public.pass_belohnungen b
                       left join public.event_titel t on t.titel_id = b.titel_id
                      where b.pass_id = p_pass_id), '[]'::jsonb));
end
$$;

create or replace function app.pass_kapitaen_kaufen(p_pass_id text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  preis integer := 950;
  stand integer;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  if not app.pass_saison_offen(p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'keine-saison');
  end if;
  if exists (select 1 from public.pass_kapitaen where firebase_uid = uid and pass_id = p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  /* "for update": zwei gleichzeitige Kaeufe koennen nicht beide den
     alten Kontostand sehen. */
  select currency into stand from public.players where firebase_uid = uid for update;
  if stand is null or stand < preis then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'dublonen', coalesce(stand, 0));
  end if;
  insert into public.pass_kapitaen (firebase_uid, pass_id, preis) values (uid, p_pass_id, preis)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  update public.players set currency = currency - preis where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'dublonen', stand - preis);
end
$$;

/* Eine Stufe einer Spur gutschreiben. Rueckgabe: was es gab, oder
   ein Grund (zu-frueh, kein-kapitaen, schon, tageslimit, ...). */
create or replace function app.pass_belohnung_holen(p_pass_id text, p_stufe integer, p_spur text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid  text := app.firebase_uid();
  b    public.pass_belohnungen;
  prog public.player_progression;
  pxp  integer := 0;
  erg  jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt');
  end if;
  if not app.pass_saison_offen(p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'keine-saison');
  end if;
  select * into b from public.pass_belohnungen where pass_id = p_pass_id and stufe = p_stufe and spur = p_spur;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  select * into prog from public.player_progression where firebase_uid = uid;
  if found and prog.pass_id is not distinct from p_pass_id then
    pxp := coalesce(prog.pass_xp, 0);
  end if;
  if app.skill_level(pxp) < p_stufe then
    return jsonb_build_object('ok', false, 'grund', 'zu-frueh');
  end if;
  if p_spur = 'kapitaen'
     and not exists (select 1 from public.pass_kapitaen where firebase_uid = uid and pass_id = p_pass_id) then
    return jsonb_build_object('ok', false, 'grund', 'kein-kapitaen');
  end if;

  begin
    insert into public.pass_belohnungen_geholt (firebase_uid, pass_id, stufe, spur)
    values (uid, p_pass_id, p_stufe, p_spur)
    on conflict do nothing;
    if not found then
      return jsonb_build_object('ok', false, 'grund', 'schon');
    end if;

    if b.dublonen > 0 or (b.avatar_id is not null and b.avatar_tage is not null) then
      insert into public.players (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
      update public.players
         set currency = currency + b.dublonen,
             total_currency_earned = total_currency_earned + b.dublonen,
             temp_avatar_id = case when b.avatar_tage is not null then b.avatar_id else temp_avatar_id end,
             temp_avatar_expires_at = case when b.avatar_tage is not null
               then (extract(epoch from now()) * 1000)::bigint + b.avatar_tage * 86400000
               else temp_avatar_expires_at end
       where firebase_uid = uid;
    end if;
    if b.xp > 0 or b.skillpunkte > 0 then
      /* least(): Deckel aus 22 (bonus_skill_points <= 500). */
      update public.player_progression
         set xp = xp + b.xp,
             bonus_skill_points = least(500, coalesce(bonus_skill_points, 0) + b.skillpunkte),
             updated_at = now()
       where firebase_uid = uid;
    end if;
    if b.titel_id is not null then
      insert into public.spieler_event_titel (firebase_uid, titel_id) values (uid, b.titel_id)
      on conflict (firebase_uid, titel_id) do update set erhalten_am = now();
    end if;
  exception when others then
    /* Tagesdeckel (41): nichts verbucht, die Stufe bleibt offen. */
    if sqlerrm = 'dublonen-tageslimit' then
      return jsonb_build_object('ok', false, 'grund', 'tageslimit');
    end if;
    raise;
  end;

  if b.dublonen > 0 then erg := erg || jsonb_build_object('dublonen', b.dublonen); end if;
  if b.xp > 0 then erg := erg || jsonb_build_object('xp', b.xp); end if;
  if b.skillpunkte > 0 then erg := erg || jsonb_build_object('skillpunkte', b.skillpunkte); end if;
  if b.avatar_id is not null then
    erg := erg || jsonb_build_object('avatar_id', b.avatar_id, 'avatar_tage', b.avatar_tage);
  end if;
  if b.titel_id is not null then
    erg := erg || jsonb_build_object('titel', (select jsonb_build_object('text', t.text, 'stil', t.stil)
                                                 from public.event_titel t where t.titel_id = b.titel_id));
  end if;
  return jsonb_build_object('ok', true, 'stufe', p_stufe, 'spur', p_spur) || erg;
end
$$;


/* "Alles einsammeln": jede erreichte, noch offene Stufe nacheinander
   ueber pass_belohnung_holen(). Haelt am Tagesdeckel an - was bis
   dahin gutgeschrieben wurde, bleibt. */
create or replace function app.pass_alle_holen(p_pass_id text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  b       record;
  e       jsonb;
  anzahl  integer := 0;
  dub     integer := 0;
  xp      integer := 0;
  sp      integer := 0;
  avatare jsonb := '[]'::jsonb;
  titel   jsonb := '[]'::jsonb;
  grund   text;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  for b in
    select pb.stufe, pb.spur from public.pass_belohnungen pb
     where pb.pass_id = p_pass_id
       and not exists (select 1 from public.pass_belohnungen_geholt g
                        where g.firebase_uid = uid and g.pass_id = p_pass_id
                          and g.stufe = pb.stufe and g.spur = pb.spur)
     order by pb.stufe, pb.spur desc
  loop
    e := app.pass_belohnung_holen(p_pass_id, b.stufe, b.spur);
    if (e ->> 'ok')::boolean then
      anzahl := anzahl + 1;
      dub := dub + coalesce((e ->> 'dublonen')::int, 0);
      xp  := xp + coalesce((e ->> 'xp')::int, 0);
      sp  := sp + coalesce((e ->> 'skillpunkte')::int, 0);
      if e ? 'avatar_id' then
        avatare := avatare || jsonb_build_array(jsonb_build_object('avatar_id', e ->> 'avatar_id', 'avatar_tage', e -> 'avatar_tage'));
      end if;
      if e ? 'titel' then
        titel := titel || jsonb_build_array(e -> 'titel');
      end if;
    elsif e ->> 'grund' in ('tageslimit', 'keine-saison', 'gesperrt') then
      grund := e ->> 'grund';
      exit;
    end if;
    /* zu-frueh / kein-kapitaen: diese Stufe bleibt einfach liegen. */
  end loop;
  return jsonb_build_object('ok', true, 'anzahl', anzahl, 'dublonen', dub, 'xp', xp,
                            'skillpunkte', sp, 'avatare', avatare, 'titel', titel, 'grund', grund);
end
$$;


/* ======================================================
   5. WRAPPER UND RECHTE
====================================================== */
create or replace function public.pass_stand(p_pass_id text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.pass_stand(p_pass_id) $$;
create or replace function public.pass_kapitaen_kaufen(p_pass_id text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.pass_kapitaen_kaufen(p_pass_id) $$;
create or replace function public.pass_belohnung_holen(p_pass_id text, p_stufe integer, p_spur text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.pass_belohnung_holen(p_pass_id, p_stufe, p_spur) $$;
create or replace function public.pass_alle_holen(p_pass_id text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.pass_alle_holen(p_pass_id) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). pass_saison_aktuell
   braucht authenticated, weil valid_progression_write (Policy) sie
   im Namen des Spielers aufruft. */
revoke execute on function app.pass2_start()                                   from public, anon, authenticated;
revoke execute on function app.pass_saison_offen(text)                         from public, anon, authenticated;
revoke execute on function app.pass_saison_aktuell()                           from public, anon;
revoke execute on function app.pass_wechsel_merken()                           from public, anon, authenticated;
revoke execute on function app.pass_stand(text)                                from public, anon;
revoke execute on function app.pass_kapitaen_kaufen(text)                      from public, anon;
revoke execute on function app.pass_belohnung_holen(text, integer, text)       from public, anon;
revoke execute on function app.pass_alle_holen(text)                           from public, anon;
revoke execute on function public.pass_alle_holen(text)                        from public, anon;
revoke execute on function public.pass_stand(text)                             from public, anon;
revoke execute on function public.pass_kapitaen_kaufen(text)                   from public, anon;
revoke execute on function public.pass_belohnung_holen(text, integer, text)    from public, anon;
grant  execute on function app.pass_saison_aktuell()                           to authenticated;
grant  execute on function app.pass_stand(text)                                to authenticated;
grant  execute on function app.pass_kapitaen_kaufen(text)                      to authenticated;
grant  execute on function app.pass_belohnung_holen(text, integer, text)       to authenticated;
grant  execute on function app.pass_alle_holen(text)                           to authenticated;
grant  execute on function public.pass_alle_holen(text)                        to authenticated;
grant  execute on function public.pass_stand(text)                             to authenticated;
grant  execute on function public.pass_kapitaen_kaufen(text)                   to authenticated;
grant  execute on function public.pass_belohnung_holen(text, integer, text)    to authenticated;
