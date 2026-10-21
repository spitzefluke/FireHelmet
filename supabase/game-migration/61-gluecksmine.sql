/* ======================================================
   GLUECKSMINE, ERZ UND UPGRADES MIT ERZ
   ---------------------------------------------------
   Ein neues Spiel (Freigabe "gluecksmine") mit einer neuen Waehrung:
   ERZ. Es liegt in mine_stand, nicht in players - dort duerfte der
   Browser per RLS schreiben.

   DIE MINE
   - Hacken: Jeder Schlag bringt Erz (Spitzhacke: Stufe x 2). Mit Glueck
     (Grubenlampe hebt es) trifft man eine Goldader (x10) oder einen
     Edelstein (+500 x Stufe). Der Browser schickt die Schlaege
     gebuendelt (mine_hacken, hoechstens 20 je Aufruf und 8 je
     Sekunde); die Datenbank wuerfelt.
   - Bohrer: foerdert von selbst, auch wenn man weg ist - 60 Erz je
     Stunde und Stufe. Die Lore fasst 2 Stunden plus 2 je Stufe;
     mine_abholen leert sie.
   - Verbessern (mine_verbessern) kostet Erz:
       Spitzhacke  1..10   50 x 2,2^(Stufe-1)
       Bohrer      0..10  100 x 2,3^Stufe
       Lore        0..10  150 x 2^Stufe
       Grubenlampe 0..10  200 x 2,5^Stufe
   - Bestenliste: mine_bestenliste (Erz insgesamt).

   ERZ FUER DEN HANGAR (48)
   - Stufen 6 bis 10 fuer Leben, Schaden und Spezial - nur mit Erz
     (hangar_ausbauen_erz): 2 000, 4 000, 8 000, 15 000, 25 000.
     Wie bisher je Stufe +20 % (Spezial +25 %).
   - Schiffssysteme: Panzerung und Geschuetze, je 0..5, +4 % Leben bzw.
     Schaden je Stufe in der Sternenschlacht (schiff_system_ausbauen):
     1 500 x 2^Stufe.

   NEUE FASSUNG: app.schlacht_ausruestung (59) rechnet die
   Schiffssysteme mit ein - immer, unabhaengig von der Freigabe
   "hangarAusruestung" (Rang, Waffe und Module weiter nur mit ihr).

   REIHENFOLGE: nach 60 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. MINE
====================================================== */
create table if not exists public.mine_stand (
  firebase_uid  text primary key,
  erz           bigint not null default 0,
  erz_gesamt    bigint not null default 0,
  hacke         smallint not null default 1,
  bohrer        smallint not null default 0,
  lore          smallint not null default 0,
  lampe         smallint not null default 0,
  schlaege      bigint not null default 0,
  goldadern     integer not null default 0,
  edelsteine    integer not null default 0,
  gesammelt_bis timestamptz not null default now(),
  hieb_at       timestamptz,
  updated_at    timestamptz not null default now(),
  constraint mine_werte check (erz >= 0 and erz_gesamt >= 0 and hacke between 1 and 10 and bohrer between 0 and 10
                               and lore between 0 and 10 and lampe between 0 and 10)
);
alter table public.mine_stand enable row level security;
alter table public.mine_stand force row level security;
drop policy if exists mine_stand_eigener on public.mine_stand;
create policy mine_stand_eigener on public.mine_stand
  for select to authenticated using (firebase_uid = app.firebase_uid());
revoke all on public.mine_stand from anon, authenticated;
grant select on public.mine_stand to authenticated;

/* Hangar: Stufen bis 10, Schiffssysteme. */
alter table public.hangar_einheiten drop constraint if exists hangar_stufen;
alter table public.hangar_einheiten add constraint hangar_stufen
  check (stufe_leben between 0 and 10 and stufe_schaden between 0 and 10 and stufe_spezial between 0 and 10);
alter table public.hangar_einheiten add column if not exists sys_panzer    smallint not null default 0;
alter table public.hangar_einheiten add column if not exists sys_geschuetz smallint not null default 0;
alter table public.hangar_einheiten drop constraint if exists hangar_systeme;
alter table public.hangar_einheiten add constraint hangar_systeme
  check (sys_panzer between 0 and 5 and sys_geschuetz between 0 and 5);


/* ======================================================
   2. HILFEN
====================================================== */
create or replace function app.mine_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'gluecksmine' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

/* Preis der naechsten Stufe eines Geraets (null = schon voll). */
create or replace function app.mine_preis(p_geraet text, p_stufe integer) returns bigint
language sql immutable
as $$
  select case
    when p_geraet = 'hacke'  and p_stufe < 10 then round(50  * power(2.2, p_stufe - 1))
    when p_geraet = 'bohrer' and p_stufe < 10 then round(100 * power(2.3, p_stufe))
    when p_geraet = 'lore'   and p_stufe < 10 then round(150 * power(2.0, p_stufe))
    when p_geraet = 'lampe'  and p_stufe < 10 then round(200 * power(2.5, p_stufe))
  end::bigint
$$;

/* Hangar-Stufe 6..10 in Erz (p_stufe = Zielstufe). */
create or replace function app.hangar_erz_preis(p_stufe integer) returns integer
language sql immutable
as $$ select case p_stufe when 6 then 2000 when 7 then 4000 when 8 then 8000 when 9 then 15000 when 10 then 25000 end $$;

/* Erz im Bohrer bis jetzt (ohne abzuholen). */
create or replace function app.mine_im_bohrer(m public.mine_stand) returns bigint
language sql stable
as $$
  select floor(m.bohrer * 60 * least(extract(epoch from (now() - m.gesammelt_bis)) / 3600.0, 2 + 2 * m.lore))::bigint
$$;

/* Gemeinsame Pruefung; legt die Mine beim ersten Mal an. */
create or replace function app.mine_vorab(p_uid text) returns text
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return 'gesperrt';
  end if;
  if not app.mine_frei() and not coalesce(app.is_admin(), false) then
    return 'nicht-frei';
  end if;
  insert into public.mine_stand (firebase_uid) values (p_uid) on conflict (firebase_uid) do nothing;
  return null;
end
$$;

create or replace function app.mine_antwort(p_uid text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'erz', m.erz, 'erz_gesamt', m.erz_gesamt,
    'hacke', m.hacke, 'bohrer', m.bohrer, 'lore', m.lore, 'lampe', m.lampe,
    'schlaege_gesamt', m.schlaege, 'goldadern_gesamt', m.goldadern, 'edelsteine_gesamt', m.edelsteine,
    'im_bohrer', app.mine_im_bohrer(m), 'bohrer_je_stunde', m.bohrer * 60, 'lore_stunden', 2 + 2 * m.lore,
    'gesammelt_bis', m.gesammelt_bis, 'jetzt', now(),
    'preise', jsonb_build_object('hacke', app.mine_preis('hacke', m.hacke), 'bohrer', app.mine_preis('bohrer', m.bohrer),
                                 'lore', app.mine_preis('lore', m.lore), 'lampe', app.mine_preis('lampe', m.lampe)))
    from public.mine_stand m where m.firebase_uid = p_uid
$$;


/* ======================================================
   3. SPIELEN
====================================================== */
create or replace function app.mine_stand_holen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.mine_vorab(uid);
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund, 'frei', app.mine_frei());
  end if;
  return jsonb_build_object('ok', true, 'frei', app.mine_frei()) || app.mine_antwort(uid);
end
$$;

create or replace function app.mine_hacken(p_anzahl integer) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  grund  text := app.mine_vorab(uid);
  m      public.mine_stand;
  n      integer;
  erlaubt integer;
  i      integer;
  wurf   numeric;
  ertrag bigint := 0;
  gold   integer := 0;
  stein  integer := 0;
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if p_anzahl is null or p_anzahl < 1 then
    return jsonb_build_object('ok', false, 'grund', 'falsche-anzahl');
  end if;
  select * into m from public.mine_stand where firebase_uid = uid for update;
  /* Hoechstens 8 Schlaege je Sekunde seit dem letzten Aufruf, 20 je Aufruf. */
  erlaubt := least(20, greatest(1, floor(coalesce(extract(epoch from (now() - m.hieb_at)), 10) * 8)::int));
  n := least(p_anzahl, erlaubt);
  for i in 1 .. n loop
    wurf := random();
    if wurf < 0.002 + 0.001 * m.lampe then
      stein := stein + 1;
      ertrag := ertrag + 500 * m.hacke;
    elsif wurf < 0.022 + 0.011 * m.lampe then
      gold := gold + 1;
      ertrag := ertrag + 20 * m.hacke;
    else
      ertrag := ertrag + 2 * m.hacke;
    end if;
  end loop;
  update public.mine_stand
     set erz = erz + ertrag, erz_gesamt = erz_gesamt + ertrag, schlaege = schlaege + n,
         goldadern = goldadern + gold, edelsteine = edelsteine + stein,
         hieb_at = now(), updated_at = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'schlaege', n, 'ertrag', ertrag, 'goldadern', gold, 'edelsteine', stein)
         || app.mine_antwort(uid);
end
$$;

create or replace function app.mine_abholen() returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.mine_vorab(uid);
  m     public.mine_stand;
  menge bigint;
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  select * into m from public.mine_stand where firebase_uid = uid for update;
  menge := app.mine_im_bohrer(m);
  update public.mine_stand
     set erz = erz + menge, erz_gesamt = erz_gesamt + menge, gesammelt_bis = now(), updated_at = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'abgeholt', menge) || app.mine_antwort(uid);
end
$$;

create or replace function app.mine_verbessern(p_geraet text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.mine_vorab(uid);
  m     public.mine_stand;
  stufe integer;
  preis bigint;
  vorher bigint;
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if p_geraet is null or p_geraet not in ('hacke', 'bohrer', 'lore', 'lampe') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  select * into m from public.mine_stand where firebase_uid = uid for update;
  stufe := case p_geraet when 'hacke' then m.hacke when 'bohrer' then m.bohrer when 'lore' then m.lore else m.lampe end;
  preis := app.mine_preis(p_geraet, stufe);
  if preis is null then
    return jsonb_build_object('ok', false, 'grund', 'max');
  end if;
  if m.erz < preis then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'preis', preis);
  end if;
  /* Bohrer und Lore: erst abholen, damit nichts verloren geht oder
     rueckwirkend mehr foerdert. */
  vorher := case when p_geraet in ('bohrer', 'lore') then app.mine_im_bohrer(m) else 0 end;
  update public.mine_stand
     set erz = erz - preis + vorher, erz_gesamt = erz_gesamt + vorher,
         gesammelt_bis = case when p_geraet in ('bohrer', 'lore') then now() else gesammelt_bis end,
         hacke  = hacke  + case when p_geraet = 'hacke'  then 1 else 0 end,
         bohrer = bohrer + case when p_geraet = 'bohrer' then 1 else 0 end,
         lore   = lore   + case when p_geraet = 'lore'   then 1 else 0 end,
         lampe  = lampe  + case when p_geraet = 'lampe'  then 1 else 0 end,
         updated_at = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'preis', preis) || app.mine_antwort(uid);
end
$$;

/* Bestenliste: Erz insgesamt, die besten 10 (oeffentlich). */
create or replace function app.mine_bestenliste()
  returns table (firebase_uid text, nickname text, avatar text, erz_gesamt bigint, hacke smallint)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select m.firebase_uid, p.nickname, p.avatar, m.erz_gesamt, m.hacke
    from public.mine_stand m join public.players p on p.firebase_uid = m.firebase_uid
   where m.erz_gesamt > 0 and p.nickname is not null
   order by m.erz_gesamt desc, m.firebase_uid
   limit 10
$$;


/* ======================================================
   4. ERZ FUER DEN HANGAR
====================================================== */
create or replace function app.hangar_ausbauen_erz(p_wert text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  seite  text;
  grund  text;
  e      public.hangar_einheiten;
  stufe  integer;
  preis  integer;
  rest   bigint;
begin
  grund := app.mine_vorab(uid);
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  seite := app.hangar_vorab(uid);
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if p_wert is null or p_wert not in ('leben', 'schaden', 'spezial') then
    return jsonb_build_object('ok', false, 'grund', 'falscher-wert');
  end if;
  insert into public.hangar_einheiten (firebase_uid, typ)
       values (uid, case seite when 'aliens' then 'drohne' else 'jaeger' end)
  on conflict (firebase_uid) do nothing;
  select * into e from public.hangar_einheiten where firebase_uid = uid for update;
  stufe := case p_wert when 'leben' then e.stufe_leben when 'schaden' then e.stufe_schaden else e.stufe_spezial end;
  if stufe < 5 then
    return jsonb_build_object('ok', false, 'grund', 'erst-dublonen');
  end if;
  if stufe >= 10 then
    return jsonb_build_object('ok', false, 'grund', 'max');
  end if;
  preis := app.hangar_erz_preis(stufe + 1);
  update public.mine_stand set erz = erz - preis, updated_at = now()
   where firebase_uid = uid and erz >= preis
  returning erz into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig-erz', 'preis', preis);
  end if;
  update public.hangar_einheiten
     set stufe_leben   = stufe_leben   + case when p_wert = 'leben'   then 1 else 0 end,
         stufe_schaden = stufe_schaden + case when p_wert = 'schaden' then 1 else 0 end,
         stufe_spezial = stufe_spezial + case when p_wert = 'spezial' then 1 else 0 end,
         updated_at    = now()
   where firebase_uid = uid
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid', 'preis', preis, 'erz', rest);
end
$$;

/* p_system: 'panzer' | 'geschuetz'. */
create or replace function app.schiff_system_ausbauen(p_system text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  seite  text;
  grund  text;
  e      public.hangar_einheiten;
  stufe  integer;
  preis  integer;
  rest   bigint;
begin
  grund := app.mine_vorab(uid);
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  seite := app.hangar_vorab(uid);
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if p_system is null or p_system not in ('panzer', 'geschuetz') then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  insert into public.hangar_einheiten (firebase_uid, typ)
       values (uid, case seite when 'aliens' then 'drohne' else 'jaeger' end)
  on conflict (firebase_uid) do nothing;
  select * into e from public.hangar_einheiten where firebase_uid = uid for update;
  stufe := case p_system when 'panzer' then e.sys_panzer else e.sys_geschuetz end;
  if stufe >= 5 then
    return jsonb_build_object('ok', false, 'grund', 'max');
  end if;
  preis := 1500 * power(2, stufe)::int;
  update public.mine_stand set erz = erz - preis, updated_at = now()
   where firebase_uid = uid and erz >= preis
  returning erz into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig-erz', 'preis', preis);
  end if;
  update public.hangar_einheiten
     set sys_panzer    = sys_panzer    + case when p_system = 'panzer'    then 1 else 0 end,
         sys_geschuetz = sys_geschuetz + case when p_system = 'geschuetz' then 1 else 0 end,
         updated_at    = now()
   where firebase_uid = uid
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid', 'preis', preis, 'erz', rest);
end
$$;

/* Ausruestung beim Aufstellen (aus 59) - NEU 61: Schiffssysteme. */
create or replace function app.schlacht_ausruestung(p_uid text, p_an boolean,
  out waffe text, out modul1 text, out modul2 text, out rang integer, out f_leben numeric, out f_schaden numeric)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  sp integer := 0;
  sg integer := 0;
begin
  rang := 0; f_leben := 1; f_schaden := 1;
  select coalesce(h.sys_panzer, 0), coalesce(h.sys_geschuetz, 0) into sp, sg
    from public.hangar_einheiten h where h.firebase_uid = p_uid;
  f_leben := 1 + 0.04 * coalesce(sp, 0);
  f_schaden := 1 + 0.04 * coalesce(sg, 0);
  if not p_an then return; end if;
  select h.waffe, h.modul1, h.modul2 into waffe, modul1, modul2 from public.hangar_einheiten h where h.firebase_uid = p_uid;
  rang := app.rang_stufe((select xp from public.schiff_rang r where r.firebase_uid = p_uid));
  f_leben := f_leben * (1 + 0.02 * rang) * case when 'panzer' in (modul1, modul2) then 1.15 else 1 end;
  f_schaden := f_schaden * (1 + 0.02 * rang);
end
$$;


/* ======================================================
   5. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.mine_konto_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  delete from public.mine_stand where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists mine_konto_aufraeumen on public.players;
create trigger mine_konto_aufraeumen
  after delete on public.players
  for each row execute function app.mine_konto_aufraeumen();


/* ======================================================
   6. WRAPPER UND RECHTE
====================================================== */
create or replace function public.mine_stand_holen() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mine_stand_holen() $$;
create or replace function public.mine_hacken(p_anzahl integer) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mine_hacken(p_anzahl) $$;
create or replace function public.mine_abholen() returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mine_abholen() $$;
create or replace function public.mine_verbessern(p_geraet text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.mine_verbessern(p_geraet) $$;
create or replace function public.mine_bestenliste()
  returns table (firebase_uid text, nickname text, avatar text, erz_gesamt bigint, hacke smallint)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.mine_bestenliste() $$;
create or replace function public.hangar_ausbauen_erz(p_wert text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_ausbauen_erz(p_wert) $$;
create or replace function public.schiff_system_ausbauen(p_system text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.schiff_system_ausbauen(p_system) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.mine_frei()                             from public, anon, authenticated;
revoke execute on function app.mine_vorab(text)                        from public, anon, authenticated;
revoke execute on function app.mine_antwort(text)                      from public, anon, authenticated;
revoke execute on function app.mine_im_bohrer(public.mine_stand)       from public, anon, authenticated;
revoke execute on function app.mine_konto_aufraeumen()                 from public, anon, authenticated;
revoke execute on function app.mine_stand_holen()                      from public, anon;
revoke execute on function app.mine_hacken(integer)                    from public, anon;
revoke execute on function app.mine_abholen()                          from public, anon;
revoke execute on function app.mine_verbessern(text)                   from public, anon;
revoke execute on function app.hangar_ausbauen_erz(text)               from public, anon;
revoke execute on function app.schiff_system_ausbauen(text)            from public, anon;
revoke execute on function public.mine_stand_holen()                   from public, anon;
revoke execute on function public.mine_hacken(integer)                 from public, anon;
revoke execute on function public.mine_abholen()                       from public, anon;
revoke execute on function public.mine_verbessern(text)                from public, anon;
revoke execute on function public.hangar_ausbauen_erz(text)            from public, anon;
revoke execute on function public.schiff_system_ausbauen(text)         from public, anon;
grant  execute on function app.mine_stand_holen()                      to authenticated;
grant  execute on function app.mine_hacken(integer)                    to authenticated;
grant  execute on function app.mine_abholen()                          to authenticated;
grant  execute on function app.mine_verbessern(text)                   to authenticated;
grant  execute on function app.hangar_ausbauen_erz(text)               to authenticated;
grant  execute on function app.schiff_system_ausbauen(text)            to authenticated;
grant  execute on function public.mine_stand_holen()                   to authenticated;
grant  execute on function public.mine_hacken(integer)                 to authenticated;
grant  execute on function public.mine_abholen()                       to authenticated;
grant  execute on function public.mine_verbessern(text)                to authenticated;
grant  execute on function public.hangar_ausbauen_erz(text)            to authenticated;
grant  execute on function public.schiff_system_ausbauen(text)         to authenticated;
grant  execute on function app.mine_bestenliste()                      to anon, authenticated;
grant  execute on function public.mine_bestenliste()                   to anon, authenticated;
