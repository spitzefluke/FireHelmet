/* ======================================================
   ZEITMASCHINE 2100, ETAPPE 3: HANGAR
   ---------------------------------------------------
   Im Jahr 2100 hat jeder Spieler mit Seite (Migration 47) EINE
   Einheit. Im Hangar waehlt er ihren Typ und ruestet sie mit
   Dublonen auf. Gekaempft wird damit in der Sternenschlacht
   (Etappe 4).

   TYPEN (je Seite vier)
     menschen: jaeger, fregatte, kreuzer, traeger
     aliens:   drohne, stachel, weber, brutschiff
   Der Typ ist frei wechselbar; die Ausbauten gehoeren dem Spieler,
   nicht dem Typ. (Waehrend einer laufenden Schlacht sperrt Etappe 4
   den Wechsel.)

   AUSBAU
   Drei Werte - leben, schaden, spezial - je Stufe 0 bis 5. Die
   naechste Stufe kostet 1000 / 3000 / 8000 / 20000 / 50000 Dublonen
   (app.hangar_preis). Gekauft wird NUR hier: Seite, Epoche 2100,
   Stufe und Kontostand werden geprueft und die Dublonen in derselben
   Transaktion abgezogen (wie mystery_gift_kaufen in 44). Der Browser
   kann also keine Stufe vortaeuschen.

   LESEN
   Die Einheiten sind fuer alle lesbar (die Schlacht zeigt alle
   Schiffe); schreiben laesst sich die Tabelle nur ueber die RPCs.

   REIHENFOLGE: nach 47 einspielen. Von Hand. Idempotent.
====================================================== */

create table if not exists public.hangar_einheiten (
  firebase_uid  text primary key,
  typ           text not null,
  stufe_leben   smallint not null default 0,
  stufe_schaden smallint not null default 0,
  stufe_spezial smallint not null default 0,
  updated_at    timestamptz not null default now(),
  constraint hangar_typ_bekannt check (typ in
    ('jaeger', 'fregatte', 'kreuzer', 'traeger', 'drohne', 'stachel', 'weber', 'brutschiff')),
  constraint hangar_stufen check (stufe_leben between 0 and 5 and stufe_schaden between 0 and 5
                                  and stufe_spezial between 0 and 5)
);

alter table public.hangar_einheiten enable row level security;
alter table public.hangar_einheiten force row level security;

drop policy if exists hangar_einheiten_lesen on public.hangar_einheiten;
create policy hangar_einheiten_lesen on public.hangar_einheiten
  for select to anon, authenticated using (true);

revoke all on public.hangar_einheiten from anon, authenticated;
grant select on public.hangar_einheiten to anon, authenticated;


/* ======================================================
   HILFEN
====================================================== */
/* Welche Typen gehoeren zu welcher Seite. */
create or replace function app.hangar_typ_passt(p_seite text, p_typ text) returns boolean
language sql immutable
as $$
  select (p_seite = 'menschen' and p_typ in ('jaeger', 'fregatte', 'kreuzer', 'traeger'))
      or (p_seite = 'aliens'   and p_typ in ('drohne', 'stachel', 'weber', 'brutschiff'))
$$;

/* Preis der Stufe p_stufe (1..5), sonst null. */
create or replace function app.hangar_preis(p_stufe integer) returns integer
language sql immutable
as $$
  select case p_stufe when 1 then 1000 when 2 then 3000 when 3 then 8000
                      when 4 then 20000 when 5 then 50000 else null end
$$;

/* Gemeinsame Pruefung fuer beide RPCs: angemeldet, nicht gesperrt,
   Jahr 2100, Seite gewaehlt. Liefert die Seite oder einen Grund mit
   Praefix "!". */
create or replace function app.hangar_vorab(p_uid text) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  s text;
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return '!gesperrt';
  end if;
  if app.epoche_jetzt() <> '2100' then
    return '!nicht-2100';
  end if;
  select seite into s from public.players where firebase_uid = p_uid;
  if s is null then
    return '!keine-seite';
  end if;
  return s;
end
$$;


/* ======================================================
   TYP WAEHLEN
   Antwort {ok, einheit} oder {ok:false, grund}.
====================================================== */
create or replace function app.hangar_typ_waehlen(p_typ text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  seite text := app.hangar_vorab(uid);
  e     public.hangar_einheiten;
begin
  if left(seite, 1) = '!' then
    return jsonb_build_object('ok', false, 'grund', substr(seite, 2));
  end if;
  if p_typ is null or not app.hangar_typ_passt(seite, p_typ) then
    return jsonb_build_object('ok', false, 'grund', 'falscher-typ');
  end if;

  insert into public.hangar_einheiten (firebase_uid, typ) values (uid, p_typ)
  on conflict (firebase_uid) do update set typ = excluded.typ, updated_at = now()
  returning * into e;
  return jsonb_build_object('ok', true, 'einheit', to_jsonb(e) - 'firebase_uid');
end
$$;


/* ======================================================
   AUSBAUEN
   p_wert: 'leben' | 'schaden' | 'spezial'. Ohne Einheit wird der
   erste Typ der Seite angelegt. Antwort {ok, einheit, preis,
   currency} oder {ok:false, grund}.
====================================================== */
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

  /* Abziehen nur, wenn es reicht - in derselben Zeile geprueft. */
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


/* ======================================================
   ADMIN: AUSBAUTEN ZURUECKSETZEN (z. B. nach einem Fehler)
====================================================== */
create or replace function app.admin_hangar_zuruecksetzen(p_uid text) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  delete from public.hangar_einheiten where firebase_uid = p_uid;
  return found;
end
$$;


/* ======================================================
   OEFFENTLICHE WRAPPER UND RECHTE
====================================================== */
create or replace function public.hangar_typ_waehlen(p_typ text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_typ_waehlen(p_typ) $$;

create or replace function public.hangar_ausbauen(p_wert text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.hangar_ausbauen(p_wert) $$;

create or replace function public.admin_hangar_zuruecksetzen(p_uid text) returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_hangar_zuruecksetzen(p_uid) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.hangar_vorab(text)                  from public, anon, authenticated;
revoke execute on function app.hangar_typ_waehlen(text)            from public, anon;
revoke execute on function app.hangar_ausbauen(text)               from public, anon;
revoke execute on function app.admin_hangar_zuruecksetzen(text)    from public, anon;
revoke execute on function public.hangar_typ_waehlen(text)         from public, anon;
revoke execute on function public.hangar_ausbauen(text)            from public, anon;
revoke execute on function public.admin_hangar_zuruecksetzen(text) from public, anon;
grant  execute on function app.hangar_typ_waehlen(text)            to authenticated;
grant  execute on function app.hangar_ausbauen(text)               to authenticated;
grant  execute on function app.admin_hangar_zuruecksetzen(text)    to authenticated;
grant  execute on function public.hangar_typ_waehlen(text)         to authenticated;
grant  execute on function public.hangar_ausbauen(text)            to authenticated;
grant  execute on function public.admin_hangar_zuruecksetzen(text) to authenticated;
