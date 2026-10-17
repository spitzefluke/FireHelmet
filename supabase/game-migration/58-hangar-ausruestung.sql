/* ======================================================
   HANGAR: SONDERWAFFEN, MODULE UND SCHIFFS-RANG
   ---------------------------------------------------
   Drei Erweiterungen des Hangars (48), alle erst mit der Freigabe
   "hangarAusruestung" (Live-Event -> Freigaben):

   1. SONDERWAFFEN - eine je Schiff, sichtbar am Rumpf und am
      Zielschuss. Wirken nur auf den Zielschuss (schlacht_ziel):
        plasma   Plasmakanone    15 000  Zielschuss +15 %
        raketen  Raketenwerfer   20 000  Zielschuss +10 %, Fokusfeuer
                                         bis +80 % statt +50 %
        tesla    Tesla-Spule     30 000  springt mit 50 % auf ein
                                         zweites Ziel ueber
        lanze    Lichtlanze      30 000  Zielschuss +35 %, laedt aber
                                         8 statt 5 s

   2. MODULE - zwei Steckplaetze, jedes Modul hoechstens einmal:
        panzer        Verbundpanzer    12 000  Leben +15 %
        schild        Deflektorschild  12 000  erhaltener Zielschuss -20 %
        nachbrenner   Nachbrenner      10 000  Ausweichen -40 % statt -25 %
                                               (nur mit "Bewegen", 59)
        zielcomputer  Zielcomputer     15 000  Zielschuss 1 s schneller
        reaktor       Ueberladereaktor 18 000  Spezial laedt 25 % schneller

   3. SCHIFFS-RANG - Erfahrung aus Sternenschlachten (vergeben ab 59
      beim Ende einer Schlacht). Sechs Raenge, je Rang +2 % Leben und
      Schaden in der Schlacht (Admiral: +10 %):
        0 Rekrut  1 Kadett (100 XP)  2 Leutnant (300)  3 Kommandant (700)
        4 Kapitaen (1500)  5 Admiral (3000)

   Gekauft und angelegt wird nur ueber die RPCs hier (Dublonen aus
   players.currency, wie hangar_ausbauen). Gekaufte Teile behaelt der
   Spieler; angelegt wird im Hangar, wirksam ab der naechsten
   Aufstellung einer Schlacht. Die Wirkung in der Schlacht rechnet 59.

   REIHENFOLGE: nach 57 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. KATALOG, BESITZ, STECKPLAETZE, RANG
====================================================== */
create table if not exists public.hangar_teile (
  teil     text primary key,
  art      text not null,
  preis    integer not null,
  ordnung  integer not null,
  wert     numeric not null default 0,
  wert2    numeric not null default 0,
  constraint hangar_teil_art check (art in ('waffe', 'modul')),
  constraint hangar_teil_preis check (preis between 0 and 1000000)
);
insert into public.hangar_teile (teil, art, preis, ordnung, wert, wert2) values
  ('plasma',       'waffe', 15000, 1, 0.15, 0),
  ('raketen',      'waffe', 20000, 2, 0.10, 0.8),
  ('tesla',        'waffe', 30000, 3, 0.50, 0),
  ('lanze',        'waffe', 30000, 4, 0.35, 8),
  ('panzer',       'modul', 12000, 1, 0.15, 0),
  ('schild',       'modul', 12000, 2, 0.20, 0),
  ('nachbrenner',  'modul', 10000, 3, 0.40, 0),
  ('zielcomputer', 'modul', 15000, 4, 1,    0),
  ('reaktor',      'modul', 18000, 5, 0.25, 0)
on conflict (teil) do nothing;

create table if not exists public.hangar_besitz (
  firebase_uid text not null,
  teil         text not null references public.hangar_teile(teil),
  gekauft_am   timestamptz not null default now(),
  primary key (firebase_uid, teil)
);

alter table public.hangar_einheiten add column if not exists waffe  text references public.hangar_teile(teil);
alter table public.hangar_einheiten add column if not exists modul1 text references public.hangar_teile(teil);
alter table public.hangar_einheiten add column if not exists modul2 text references public.hangar_teile(teil);

create table if not exists public.schiff_rang (
  firebase_uid text primary key,
  xp           integer not null default 0,
  schlachten   integer not null default 0,
  siege        integer not null default 0,
  updated_at   timestamptz not null default now(),
  constraint schiff_rang_werte check (xp >= 0 and schlachten >= 0 and siege >= 0)
);

alter table public.hangar_teile  enable row level security;
alter table public.hangar_teile  force row level security;
alter table public.hangar_besitz enable row level security;
alter table public.hangar_besitz force row level security;
alter table public.schiff_rang   enable row level security;
alter table public.schiff_rang   force row level security;

drop policy if exists hangar_teile_lesen on public.hangar_teile;
create policy hangar_teile_lesen on public.hangar_teile for select to anon, authenticated using (true);
drop policy if exists hangar_besitz_eigener on public.hangar_besitz;
create policy hangar_besitz_eigener on public.hangar_besitz
  for select to authenticated using (firebase_uid = app.firebase_uid());
/* Rang ist oeffentlich - er steht in der Schlacht neben dem Namen. */
drop policy if exists schiff_rang_lesen on public.schiff_rang;
create policy schiff_rang_lesen on public.schiff_rang for select to anon, authenticated using (true);

revoke all on public.hangar_teile, public.hangar_besitz, public.schiff_rang from anon, authenticated;
grant select on public.hangar_teile, public.schiff_rang to anon, authenticated;
grant select on public.hangar_besitz to authenticated;


/* ======================================================
   2. HILFEN
====================================================== */
/* Freigabe "hangarAusruestung" an? Kaputt = aus. */
create or replace function app.hangar_ausruestung_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'hangarAusruestung' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

/* Rang 0..5 aus den Erfahrungspunkten. */
create or replace function app.rang_stufe(p_xp integer) returns integer
language sql immutable
as $$
  select case when coalesce(p_xp, 0) >= 3000 then 5 when p_xp >= 1500 then 4 when p_xp >= 700 then 3
              when p_xp >= 300 then 2 when p_xp >= 100 then 1 else 0 end
$$;

/* Stand fuer den Hangar: angelegt, Besitz, Rang. */
create or replace function app.hangar_ausruestung_stand(p_uid text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'waffe',  (select waffe  from public.hangar_einheiten where firebase_uid = p_uid),
    'modul1', (select modul1 from public.hangar_einheiten where firebase_uid = p_uid),
    'modul2', (select modul2 from public.hangar_einheiten where firebase_uid = p_uid),
    'besitz', coalesce((select jsonb_agg(teil order by teil) from public.hangar_besitz where firebase_uid = p_uid), '[]'::jsonb),
    'xp',     coalesce((select xp from public.schiff_rang where firebase_uid = p_uid), 0),
    'rang',   app.rang_stufe((select xp from public.schiff_rang where firebase_uid = p_uid)),
    'schlachten', coalesce((select schlachten from public.schiff_rang where firebase_uid = p_uid), 0),
    'siege',  coalesce((select siege from public.schiff_rang where firebase_uid = p_uid), 0))
$$;


/* ======================================================
   3. KAUFEN UND ANLEGEN
   Antwort {ok, ausruestung, currency?} oder {ok:false, grund}.
   Gruende: nicht-frei, gesperrt, nicht-2100, keine-seite,
   unbekannt, schon, zu-wenig, nicht-gekauft, falscher-platz, doppelt.
====================================================== */
create or replace function app.hangar_teil_kaufen(p_teil text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  seite text;
  tl    public.hangar_teile;
  rest  bigint;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if not app.hangar_ausruestung_frei() and not coalesce(app.is_admin(), false) then
    return jsonb_build_object('ok', false, 'grund', 'nicht-frei');
  end if;
  seite := app.hangar_vorab(uid);
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  select * into tl from public.hangar_teile where teil = p_teil;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if exists (select 1 from public.hangar_besitz where firebase_uid = uid and teil = p_teil) then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;

  /* Abziehen nur, wenn es reicht - in derselben Zeile geprueft. */
  update public.players set currency = currency - tl.preis
   where firebase_uid = uid and currency >= tl.preis
  returning currency into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'preis', tl.preis);
  end if;
  insert into public.hangar_besitz (firebase_uid, teil) values (uid, p_teil);

  /* Gleich anlegen, wenn der Platz frei ist. */
  insert into public.hangar_einheiten (firebase_uid, typ)
       values (uid, case seite when 'aliens' then 'drohne' else 'jaeger' end)
  on conflict (firebase_uid) do nothing;
  if tl.art = 'waffe' then
    update public.hangar_einheiten set waffe = p_teil, updated_at = now() where firebase_uid = uid and waffe is null;
  else
    update public.hangar_einheiten
       set modul1 = case when modul1 is null then p_teil else modul1 end,
           modul2 = case when modul1 is not null and modul2 is null and modul1 <> p_teil then p_teil else modul2 end,
           updated_at = now()
     where firebase_uid = uid;
  end if;
  return jsonb_build_object('ok', true, 'preis', tl.preis, 'currency', rest,
                            'ausruestung', app.hangar_ausruestung_stand(uid));
end
$$;

/* p_platz: 'waffe' | 'modul1' | 'modul2'; p_teil null = ablegen. */
create or replace function app.hangar_teil_anlegen(p_platz text, p_teil text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  seite text;
  tl    public.hangar_teile;
  e     public.hangar_einheiten;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if not app.hangar_ausruestung_frei() and not coalesce(app.is_admin(), false) then
    return jsonb_build_object('ok', false, 'grund', 'nicht-frei');
  end if;
  seite := app.hangar_vorab(uid);
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if p_platz is null or p_platz not in ('waffe', 'modul1', 'modul2') then
    return jsonb_build_object('ok', false, 'grund', 'falscher-platz');
  end if;
  if p_teil is not null then
    select * into tl from public.hangar_teile where teil = p_teil;
    if not found then
      return jsonb_build_object('ok', false, 'grund', 'unbekannt');
    end if;
    if not exists (select 1 from public.hangar_besitz where firebase_uid = uid and teil = p_teil) then
      return jsonb_build_object('ok', false, 'grund', 'nicht-gekauft');
    end if;
    if (tl.art = 'waffe') <> (p_platz = 'waffe') then
      return jsonb_build_object('ok', false, 'grund', 'falscher-platz');
    end if;
  end if;

  insert into public.hangar_einheiten (firebase_uid, typ)
       values (uid, case seite when 'aliens' then 'drohne' else 'jaeger' end)
  on conflict (firebase_uid) do nothing;
  select * into e from public.hangar_einheiten where firebase_uid = uid for update;
  if p_teil is not null and ((p_platz = 'modul1' and e.modul2 = p_teil) or (p_platz = 'modul2' and e.modul1 = p_teil)) then
    return jsonb_build_object('ok', false, 'grund', 'doppelt');
  end if;
  update public.hangar_einheiten
     set waffe  = case when p_platz = 'waffe'  then p_teil else waffe end,
         modul1 = case when p_platz = 'modul1' then p_teil else modul1 end,
         modul2 = case when p_platz = 'modul2' then p_teil else modul2 end,
         updated_at = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'ausruestung', app.hangar_ausruestung_stand(uid));
end
$$;

/* Eigener Stand fuer den Hangar (auch ohne Freigabe lesbar - der
   Rang sammelt sich, sobald 59 Erfahrung vergibt). */
create or replace function app.hangar_ausruestung() returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  return app.hangar_ausruestung_stand(uid) || jsonb_build_object('frei', app.hangar_ausruestung_frei());
end
$$;


/* ======================================================
   4. AUFRAEUMEN BEIM KONTO LOESCHEN
   Eigener Trigger - pass2_konto_aufraeumen (54) bleibt unberuehrt.
====================================================== */
create or replace function app.hangar_konto_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  delete from public.hangar_besitz where firebase_uid = old.firebase_uid;
  delete from public.schiff_rang   where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists hangar_konto_aufraeumen on public.players;
create trigger hangar_konto_aufraeumen
  after delete on public.players
  for each row execute function app.hangar_konto_aufraeumen();


/* ======================================================
   5. WRAPPER UND RECHTE
====================================================== */
create or replace function public.hangar_teil_kaufen(p_teil text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_teil_kaufen(p_teil) $$;
create or replace function public.hangar_teil_anlegen(p_platz text, p_teil text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_teil_anlegen(p_platz, p_teil) $$;
create or replace function public.hangar_ausruestung() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.hangar_ausruestung() $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.hangar_ausruestung_frei()                 from public, anon, authenticated;
revoke execute on function app.hangar_ausruestung_stand(text)            from public, anon, authenticated;
revoke execute on function app.hangar_konto_aufraeumen()                 from public, anon, authenticated;
revoke execute on function app.hangar_teil_kaufen(text)                  from public, anon;
revoke execute on function app.hangar_teil_anlegen(text, text)           from public, anon;
revoke execute on function app.hangar_ausruestung()                      from public, anon;
revoke execute on function public.hangar_teil_kaufen(text)               from public, anon;
revoke execute on function public.hangar_teil_anlegen(text, text)        from public, anon;
revoke execute on function public.hangar_ausruestung()                   from public, anon;
grant  execute on function app.hangar_teil_kaufen(text)                  to authenticated;
grant  execute on function app.hangar_teil_anlegen(text, text)           to authenticated;
grant  execute on function app.hangar_ausruestung()                      to authenticated;
grant  execute on function public.hangar_teil_kaufen(text)               to authenticated;
grant  execute on function public.hangar_teil_anlegen(text, text)        to authenticated;
grant  execute on function public.hangar_ausruestung()                   to authenticated;
