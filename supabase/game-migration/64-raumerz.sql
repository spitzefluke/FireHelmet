/* ======================================================
   GLUECKSMINE MIT BLOECKEN, RAUMERZ, HANGAR BIS STUFE 15
   ---------------------------------------------------
   1. BLOECKE STATT FELS
      Die Mine (61) besteht jetzt aus Bloecken mit Leben. Jeder Hieb
      bringt wie bisher 2 x Spitzhacke Erz und zieht dem Block so viel
      Leben ab, wie die Spitzhacke Stufen hat. Ist er zerbrochen, gibt
      es seine Beute, und der naechste Block erscheint:
        art        Leben  Beute beim Zerbrechen
        stein          8  -
        eisen         14  30 x Spitzhacke Erz
        gold          20  100 x Spitzhacke Erz        (Goldader)
        kristall      30  400 x Spitzhacke Erz        (Edelstein)
        raumerz       45  1 RAUMERZ
      Welcher Block kommt, wuerfelt die Datenbank beim Zerbrechen des
      vorigen (app.mine_neuer_block):
        raumerz   genau 1/30
        kristall  0,6 % + 0,3 % je Lampenstufe
        gold      4 % + 2 % je Lampenstufe
        eisen     25 %
        stein     der Rest
      Ueberschuessiger Schaden verfaellt mit dem Block.

   2. RAUMERZ
      Eine eigene Waehrung (mine_stand.raumerz). Mit der Freigabe
      "gluecksmine" ist Raumerz der EINZIGE Weg, Leben, Schaden und
      Spezial im Hangar auszubauen - von Stufe 1 bis 15:
        Stufe  1..5    1  2  3  4  5
        Stufe  6..10   7  9 11 14 17
        Stufe 11..15  20 24 28 33 40      (zusammen 218 je Wert)
      Ohne Freigabe bleibt es bei Dublonen bis Stufe 5 (48), damit
      niemand festsitzt. Erz bezahlt weiter die Schiffssysteme (61)
      und die Geraete der Mine.

   3. HANGAR
      Stufen 0..15 (bisher 0..10). hangar_ausbauen (Dublonen, 48)
      lehnt bei Freigabe mit 'nur-raumerz' ab; hangar_ausbauen_erz
      (61) immer - der Erz-Weg fuer 6..10 ist durch Raumerz ersetzt.
      Was jemand schon ausgebaut hat, bleibt.

   Einspielen nach 63. Danach 64-raumerz.test.sql.
====================================================== */

/* ======================================================
   1. TABELLEN
====================================================== */
alter table public.mine_stand add column if not exists block_art      text   not null default 'stein';
alter table public.mine_stand add column if not exists block_leben    integer not null default 8;
alter table public.mine_stand add column if not exists block_max      integer not null default 8;
alter table public.mine_stand add column if not exists bloecke        bigint not null default 0;
alter table public.mine_stand add column if not exists raumerz        bigint not null default 0;
alter table public.mine_stand add column if not exists raumerz_gesamt bigint not null default 0;
alter table public.mine_stand drop constraint if exists mine_block;
alter table public.mine_stand add constraint mine_block
  check (block_art in ('stein', 'eisen', 'gold', 'kristall', 'raumerz')
         and block_leben between 0 and block_max and block_max > 0
         and raumerz >= 0 and raumerz_gesamt >= 0 and bloecke >= 0);

alter table public.hangar_einheiten drop constraint if exists hangar_stufen;
alter table public.hangar_einheiten add constraint hangar_stufen
  check (stufe_leben between 0 and 15 and stufe_schaden between 0 and 15 and stufe_spezial between 0 and 15);


/* ======================================================
   2. HILFEN
====================================================== */
create or replace function app.mine_block_leben(p_art text) returns integer
language sql immutable
as $$
  select case p_art when 'stein' then 8 when 'eisen' then 14 when 'gold' then 20
                    when 'kristall' then 30 when 'raumerz' then 45 end
$$;

/* Beute in Erz beim Zerbrechen (Raumerz zaehlt extra). */
create or replace function app.mine_block_beute(p_art text, p_hacke integer) returns bigint
language sql immutable
as $$
  select (case p_art when 'eisen' then 30 when 'gold' then 100 when 'kristall' then 400 else 0 end * p_hacke)::bigint
$$;

/* Der naechste Block - Raumerz genau 1/30. */
create or replace function app.mine_neuer_block(p_lampe integer) returns text
language plpgsql volatile
as $$
declare
  w  numeric := random();
  rk numeric := 1.0 / 30;
  kr numeric := rk + 0.006 + 0.003 * p_lampe;
  go numeric := kr + 0.04 + 0.02 * p_lampe;
begin
  if w < rk then return 'raumerz'; end if;
  if w < kr then return 'kristall'; end if;
  if w < go then return 'gold'; end if;
  if w < go + 0.25 then return 'eisen'; end if;
  return 'stein';
end
$$;

/* Raumerz-Preis der Hangar-Stufe p_stufe (1..15), sonst null. */
create or replace function app.hangar_raumerz_preis(p_stufe integer) returns integer
language sql immutable
as $$
  select (array[1, 2, 3, 4, 5, 7, 9, 11, 14, 17, 20, 24, 28, 33, 40])[p_stufe]
   where p_stufe between 1 and 15
$$;

/* Antwort der Mine (aus 61) mit Block und Raumerz. */
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
                                 'lore', app.mine_preis('lore', m.lore), 'lampe', app.mine_preis('lampe', m.lampe)),
    /* NEU 64 */
    'block', jsonb_build_object('art', m.block_art, 'leben', m.block_leben, 'max', m.block_max),
    'bloecke_gesamt', m.bloecke, 'raumerz', m.raumerz, 'raumerz_gesamt', m.raumerz_gesamt)
    from public.mine_stand m where m.firebase_uid = p_uid
$$;


/* ======================================================
   3. HACKEN (aus 61, jetzt blockweise)
====================================================== */
create or replace function app.mine_hacken(p_anzahl integer) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid     text := app.firebase_uid();
  grund   text := app.mine_vorab(uid);
  m       public.mine_stand;
  n       integer;
  erlaubt integer;
  i       integer;
  ertrag  bigint := 0;
  gold    integer := 0;
  stein   integer := 0;
  raum    integer := 0;
  brueche integer := 0;
  art     text;
  leben   integer;
  gebrochen jsonb := '[]'::jsonb;
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if p_anzahl is null or p_anzahl < 1 then
    return jsonb_build_object('ok', false, 'grund', 'falsche-anzahl');
  end if;
  select * into m from public.mine_stand where firebase_uid = uid for update;
  /* Hoechstens 8 Schlaege je Sekunde seit dem letzten Aufruf, 20 je Aufruf (wie 61). */
  erlaubt := least(20, greatest(1, floor(coalesce(extract(epoch from (now() - m.hieb_at)), 10) * 8)::int));
  n := least(p_anzahl, erlaubt);
  art := m.block_art;
  leben := m.block_leben;
  for i in 1 .. n loop
    ertrag := ertrag + 2 * m.hacke;
    leben := leben - m.hacke;
    if leben <= 0 then
      brueche := brueche + 1;
      gebrochen := gebrochen || to_jsonb(art);
      ertrag := ertrag + app.mine_block_beute(art, m.hacke);
      if art = 'gold' then gold := gold + 1; end if;
      if art = 'kristall' then stein := stein + 1; end if;
      if art = 'raumerz' then raum := raum + 1; end if;
      art := app.mine_neuer_block(m.lampe);
      leben := app.mine_block_leben(art);
    end if;
  end loop;
  update public.mine_stand
     set erz = erz + ertrag, erz_gesamt = erz_gesamt + ertrag, schlaege = schlaege + n,
         goldadern = goldadern + gold, edelsteine = edelsteine + stein,
         raumerz = raumerz + raum, raumerz_gesamt = raumerz_gesamt + raum, bloecke = bloecke + brueche,
         block_art = art, block_leben = leben, block_max = app.mine_block_leben(art),
         hieb_at = now(), updated_at = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true, 'schlaege', n, 'ertrag', ertrag, 'goldadern', gold, 'edelsteine', stein,
                            'raumerz_neu', raum, 'gebrochen', gebrochen)
         || app.mine_antwort(uid);
end
$$;


/* ======================================================
   4. HANGAR MIT RAUMERZ
====================================================== */
create or replace function app.hangar_ausbauen_raumerz(p_wert text) returns jsonb
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
  if stufe >= 15 then
    return jsonb_build_object('ok', false, 'grund', 'max');
  end if;
  preis := app.hangar_raumerz_preis(stufe + 1);
  update public.mine_stand set raumerz = raumerz - preis, updated_at = now()
   where firebase_uid = uid and raumerz >= preis
  returning raumerz into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig-raumerz', 'preis', preis);
  end if;
  update public.hangar_einheiten
     set stufe_leben   = stufe_leben   + case when p_wert = 'leben'   then 1 else 0 end,
         stufe_schaden = stufe_schaden + case when p_wert = 'schaden' then 1 else 0 end,
         stufe_spezial = stufe_spezial + case when p_wert = 'spezial' then 1 else 0 end,
         updated_at    = now()
   where firebase_uid = uid
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid', 'preis', preis, 'raumerz', rest);
end
$$;

/* Dublonen (aus 48): mit Freigabe der Mine nur noch Raumerz. Sonst
   unveraendert bis Stufe 5. */
create or replace function app.hangar_ausbauen(p_wert text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid    text := app.firebase_uid();
  seite  text := app.hangar_vorab(uid);
  e      public.hangar_einheiten;
  stufe  integer;
  preis  integer;
  rest   bigint;
begin
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if app.mine_frei() then
    return jsonb_build_object('ok', false, 'grund', 'nur-raumerz');   -- NEU 64
  end if;
  if p_wert is null or p_wert not in ('leben', 'schaden', 'spezial') then
    return jsonb_build_object('ok', false, 'grund', 'falscher-wert');
  end if;

  insert into public.hangar_einheiten (firebase_uid, typ)
       values (uid, case seite when 'aliens' then 'drohne' else 'jaeger' end)
  on conflict (firebase_uid) do nothing;
  select * into e from public.hangar_einheiten where firebase_uid = uid for update;

  stufe := case p_wert when 'leben' then e.stufe_leben when 'schaden' then e.stufe_schaden
                       else e.stufe_spezial end;
  if stufe >= 5 then
    return jsonb_build_object('ok', false, 'grund', 'max');
  end if;
  preis := app.hangar_preis(stufe + 1);

  update public.players
     set currency = currency - preis
   where firebase_uid = uid and currency >= preis
  returning currency into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'preis', preis);
  end if;

  update public.hangar_einheiten
     set stufe_leben   = stufe_leben   + case when p_wert = 'leben'   then 1 else 0 end,
         stufe_schaden = stufe_schaden + case when p_wert = 'schaden' then 1 else 0 end,
         stufe_spezial = stufe_spezial + case when p_wert = 'spezial' then 1 else 0 end,
         updated_at    = now()
   where firebase_uid = uid
  returning * into e;

  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid',
                            'preis', preis, 'currency', rest);
end
$$;

/* Erz fuer Stufe 6..10 (aus 61): ersetzt durch Raumerz. */
create or replace function app.hangar_ausbauen_erz(p_wert text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  return jsonb_build_object('ok', false, 'grund', 'nur-raumerz');
end
$$;


/* ======================================================
   5. WRAPPER UND RECHTE
====================================================== */
create or replace function public.hangar_ausbauen_raumerz(p_wert text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_ausbauen_raumerz(p_wert) $$;

revoke execute on function app.mine_block_leben(text)                  from public, anon, authenticated;
revoke execute on function app.mine_block_beute(text, integer)         from public, anon, authenticated;
revoke execute on function app.mine_neuer_block(integer)               from public, anon, authenticated;
revoke execute on function app.hangar_raumerz_preis(integer)           from public, anon, authenticated;
revoke execute on function app.mine_antwort(text)                      from public, anon, authenticated;
revoke execute on function app.mine_hacken(integer)                    from public, anon;
revoke execute on function app.hangar_ausbauen_raumerz(text)           from public, anon;
revoke execute on function app.hangar_ausbauen(text)                   from public, anon;
revoke execute on function app.hangar_ausbauen_erz(text)               from public, anon;
revoke execute on function public.hangar_ausbauen_raumerz(text)        from public, anon;
grant  execute on function app.mine_hacken(integer)                    to authenticated;
grant  execute on function app.hangar_ausbauen_raumerz(text)           to authenticated;
grant  execute on function app.hangar_ausbauen(text)                   to authenticated;
grant  execute on function app.hangar_ausbauen_erz(text)               to authenticated;
grant  execute on function public.hangar_ausbauen_raumerz(text)        to authenticated;
