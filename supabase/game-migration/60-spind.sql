/* ======================================================
   SPIND: TITEL, NAMENSFARBE, BANNER, PROFILKARTE
   ---------------------------------------------------
   Eine neue Seite "Spind" (Freigabe "spind"), in der jeder Spieler
   anpasst, wie er auf der Seite erscheint:

   - TITEL: Wer mehrere Event-Titel hat (Live-Event, Piratenpass 2,
     Nordlicht), waehlt hier, welchen er traegt. Bisher galt immer der
     neueste. event_titel_je_spieler (27) liefert ab jetzt den
     GETRAGENEN Titel, sonst wie bisher den neuesten.
   - AVATAR und RAHMEN: wie bisher (Avatarwahl, Shop-Rahmen in
     players.equipped_frame) - der Spind zeigt sie nur gesammelt an.
   - NAMENSFARBE und BANNER: neue Teile aus spind_teile, einige gratis,
     die anderen fuer Dublonen (spind_teil_kaufen).
   - PROFILKARTE: Banner, Avatar, Rahmen, Name in Farbe, Titel, ein
     kurzer Spruch (bis 60 Zeichen) und Statistik. Jeder kann sie per
     spind_profil(uid) ansehen - etwa ueber einen Klick in der
     Rangliste.

   Die Farben und Banner selbst sind reines CSS im Browser; hier steht
   nur, WELCHES Teil - aus einer festen Liste.

   REIHENFOLGE: nach 59 einspielen. Von Hand, im SQL-Editor (enthaelt
   Policies). Idempotent.
====================================================== */


/* ======================================================
   1. TEILE, BESITZ, AUSWAHL
====================================================== */
create table if not exists public.spind_teile (
  teil_id  text primary key,
  art      text not null,
  preis    integer not null default 0,
  ordnung  integer not null,
  constraint spind_teil_art check (art in ('namensfarbe', 'banner')),
  constraint spind_teil_preis check (preis between 0 and 1000000)
);
insert into public.spind_teile (teil_id, art, preis, ordnung) values
  ('weiss',        'namensfarbe',     0, 1),
  ('gold',         'namensfarbe',  2500, 2),
  ('feuer',        'namensfarbe',  2500, 3),
  ('eis',          'namensfarbe',  2500, 4),
  ('smaragd',      'namensfarbe',  4000, 5),
  ('nordlicht',    'namensfarbe',  8000, 6),
  ('regenbogen',   'namensfarbe', 15000, 7),
  ('meer',         'banner',          0, 1),
  ('sturm',        'banner',       3000, 2),
  ('schatzkarte',  'banner',       3000, 3),
  ('vulkan',       'banner',       5000, 4),
  ('sternennebel', 'banner',       6000, 5),
  ('kraken',       'banner',      12000, 6),
  ('zeitriss',     'banner',      20000, 7)
on conflict (teil_id) do nothing;

create table if not exists public.spind_besitz (
  firebase_uid text not null,
  teil_id      text not null references public.spind_teile(teil_id),
  gekauft_am   timestamptz not null default now(),
  primary key (firebase_uid, teil_id)
);

create table if not exists public.spind_auswahl (
  firebase_uid text primary key,
  titel_id     text references public.event_titel(titel_id) on delete set null,
  namensfarbe  text references public.spind_teile(teil_id),
  banner       text references public.spind_teile(teil_id),
  spruch       text,
  updated_at   timestamptz not null default now(),
  constraint spind_spruch_len check (spruch is null or char_length(spruch) <= 60)
);

alter table public.spind_teile   enable row level security;
alter table public.spind_teile   force row level security;
alter table public.spind_besitz  enable row level security;
alter table public.spind_besitz  force row level security;
alter table public.spind_auswahl enable row level security;
alter table public.spind_auswahl force row level security;

drop policy if exists spind_teile_lesen on public.spind_teile;
create policy spind_teile_lesen on public.spind_teile for select to anon, authenticated using (true);
drop policy if exists spind_besitz_eigener on public.spind_besitz;
create policy spind_besitz_eigener on public.spind_besitz
  for select to authenticated using (firebase_uid = app.firebase_uid());
/* Die Auswahl ist oeffentlich - sie steht in Rangliste und Profilkarte. */
drop policy if exists spind_auswahl_lesen on public.spind_auswahl;
create policy spind_auswahl_lesen on public.spind_auswahl for select to anon, authenticated using (true);

revoke all on public.spind_teile, public.spind_besitz, public.spind_auswahl from anon, authenticated;
grant select on public.spind_teile, public.spind_auswahl to anon, authenticated;
grant select on public.spind_besitz to authenticated;


/* ======================================================
   2. HILFEN
====================================================== */
create or replace function app.spind_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'spind' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

/* Besitzt der Spieler das Teil? Gratis-Teile hat jeder. */
create or replace function app.spind_hat(p_uid text, p_teil text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select exists (select 1 from public.spind_teile t where t.teil_id = p_teil and t.preis = 0)
      or exists (select 1 from public.spind_besitz b where b.firebase_uid = p_uid and b.teil_id = p_teil)
$$;

create or replace function app.spind_vorab(p_uid text) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if p_uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  if app.current_account_suspended() then
    return 'gesperrt';
  end if;
  if not app.spind_frei() and not coalesce(app.is_admin(), false) then
    return 'nicht-frei';
  end if;
  return null;
end
$$;


/* ======================================================
   3. STAND, KAUFEN, TRAGEN
====================================================== */
/* Eigener Spind: Auswahl, Besitz, alle eigenen Titel. */
create or replace function app.spind_stand() returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  uid text := app.firebase_uid();
  a   public.spind_auswahl;
begin
  if uid is null then
    raise exception 'nicht-angemeldet';
  end if;
  select * into a from public.spind_auswahl where firebase_uid = uid;
  return jsonb_build_object(
    'frei', app.spind_frei(),
    'titel_id', a.titel_id, 'namensfarbe', coalesce(a.namensfarbe, 'weiss'), 'banner', coalesce(a.banner, 'meer'),
    'spruch', a.spruch,
    'besitz', coalesce((select jsonb_agg(teil_id order by teil_id) from public.spind_besitz where firebase_uid = uid), '[]'::jsonb),
    'titel', coalesce((select jsonb_agg(jsonb_build_object('titel_id', t.titel_id, 'text', t.text, 'stil', t.stil, 'erhalten_am', s.erhalten_am)
                                        order by s.erhalten_am desc)
                         from public.spieler_event_titel s join public.event_titel t on t.titel_id = s.titel_id
                        where s.firebase_uid = uid), '[]'::jsonb));
end
$$;

create or replace function app.spind_teil_kaufen(p_teil text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.spind_vorab(uid);
  tl    public.spind_teile;
  rest  bigint;
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  select * into tl from public.spind_teile where teil_id = p_teil;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  if app.spind_hat(uid, p_teil) then
    return jsonb_build_object('ok', false, 'grund', 'schon');
  end if;
  update public.players set currency = currency - tl.preis
   where firebase_uid = uid and currency >= tl.preis
  returning currency into rest;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'zu-wenig', 'preis', tl.preis);
  end if;
  insert into public.spind_besitz (firebase_uid, teil_id) values (uid, p_teil);
  return jsonb_build_object('ok', true, 'preis', tl.preis, 'currency', rest);
end
$$;

/* Tragen: p_art 'titel' | 'namensfarbe' | 'banner' | 'spruch'.
   p_wert null = ablegen (Titel: wieder der neueste; Farbe/Banner:
   Grundteil; Spruch: leer). */
create or replace function app.spind_tragen(p_art text, p_wert text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  uid   text := app.firebase_uid();
  grund text := app.spind_vorab(uid);
  w     text := nullif(btrim(coalesce(p_wert, '')), '');
begin
  if grund is not null then
    return jsonb_build_object('ok', false, 'grund', grund);
  end if;
  if p_art is null or p_art not in ('titel', 'namensfarbe', 'banner', 'spruch') then
    return jsonb_build_object('ok', false, 'grund', 'falsche-art');
  end if;
  if w is not null then
    if p_art = 'titel' and not exists (select 1 from public.spieler_event_titel where firebase_uid = uid and titel_id = w) then
      return jsonb_build_object('ok', false, 'grund', 'nicht-dein-titel');
    end if;
    if p_art in ('namensfarbe', 'banner') then
      if not exists (select 1 from public.spind_teile where teil_id = w and art = p_art) then
        return jsonb_build_object('ok', false, 'grund', 'unbekannt');
      end if;
      if not app.spind_hat(uid, w) then
        return jsonb_build_object('ok', false, 'grund', 'nicht-gekauft');
      end if;
    end if;
    if p_art = 'spruch' then
      if char_length(w) > 60 then
        return jsonb_build_object('ok', false, 'grund', 'zu-lang');
      end if;
      /* Keine Zeilenumbrueche, keine Steuerzeichen. */
      w := regexp_replace(w, '[[:cntrl:]]', ' ', 'g');
    end if;
  end if;

  insert into public.spind_auswahl (firebase_uid) values (uid) on conflict (firebase_uid) do nothing;
  update public.spind_auswahl
     set titel_id    = case when p_art = 'titel'       then w else titel_id end,
         namensfarbe = case when p_art = 'namensfarbe' then w else namensfarbe end,
         banner      = case when p_art = 'banner'      then w else banner end,
         spruch      = case when p_art = 'spruch'      then w else spruch end,
         updated_at  = now()
   where firebase_uid = uid;
  return jsonb_build_object('ok', true) || app.spind_stand();
end
$$;


/* ======================================================
   4. ANZEIGE FUER ALLE
====================================================== */
/* Event-Titel je Spieler (aus 27): NEU 60 - der getragene, sonst der
   neueste. */
create or replace function app.event_titel_je_spieler()
  returns table (firebase_uid text, text text, stil text)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select distinct on (s.firebase_uid) s.firebase_uid, t.text, t.stil
    from public.spieler_event_titel s
    join public.event_titel t on t.titel_id = s.titel_id
    left join public.spind_auswahl a on a.firebase_uid = s.firebase_uid
   order by s.firebase_uid, (a.titel_id is not distinct from s.titel_id) desc, s.erhalten_am desc, s.titel_id
$$;

/* Namensfarbe und Banner aller Spieler, die etwas gewaehlt haben -
   fuer die Rangliste. Ohne Freigabe leer. */
create or replace function app.spind_je_spieler()
  returns table (firebase_uid text, namensfarbe text, banner text)
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select a.firebase_uid, a.namensfarbe, a.banner
    from public.spind_auswahl a
   where app.spind_frei() and (a.namensfarbe is not null or a.banner is not null)
$$;

/* Profilkarte eines Spielers - oeffentliche Angaben. */
create or replace function app.spind_profil(p_uid text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
declare
  p  public.players;
  a  public.spind_auswahl;
  ti record;
begin
  select * into p from public.players where firebase_uid = p_uid;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;
  select * into a from public.spind_auswahl where firebase_uid = p_uid;
  select e.text, e.stil into ti from app.event_titel_je_spieler() e where e.firebase_uid = p_uid;
  return jsonb_build_object(
    'ok', true,
    'nickname', p.nickname, 'avatar', p.avatar, 'equipped_frame', p.equipped_frame,
    'codes_cracked', p.codes_cracked,
    'titel', case when ti.text is not null then jsonb_build_object('text', ti.text, 'stil', ti.stil) end,
    'titel_anzahl', (select count(*) from public.spieler_event_titel where firebase_uid = p_uid),
    'namensfarbe', case when app.spind_frei() then coalesce(a.namensfarbe, 'weiss') else 'weiss' end,
    'banner', case when app.spind_frei() then coalesce(a.banner, 'meer') else 'meer' end,
    'spruch', case when app.spind_frei() then a.spruch end,
    'seite', p.seite,
    'schlacht', (select jsonb_build_object('xp', r.xp, 'rang', app.rang_stufe(r.xp), 'schlachten', r.schlachten, 'siege', r.siege)
                   from public.schiff_rang r where r.firebase_uid = p_uid));
end
$$;


/* ======================================================
   5. AUFRAEUMEN BEIM KONTO LOESCHEN
====================================================== */
create or replace function app.spind_konto_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  delete from public.spind_besitz  where firebase_uid = old.firebase_uid;
  delete from public.spind_auswahl where firebase_uid = old.firebase_uid;
  return old;
end
$$;
drop trigger if exists spind_konto_aufraeumen on public.players;
create trigger spind_konto_aufraeumen
  after delete on public.players
  for each row execute function app.spind_konto_aufraeumen();


/* ======================================================
   6. WRAPPER UND RECHTE
====================================================== */
create or replace function public.spind_stand() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.spind_stand() $$;
create or replace function public.spind_teil_kaufen(p_teil text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.spind_teil_kaufen(p_teil) $$;
create or replace function public.spind_tragen(p_art text, p_wert text) returns jsonb
language sql security definer set search_path = public, app, pg_temp
as $$ select app.spind_tragen(p_art, p_wert) $$;
create or replace function public.spind_je_spieler()
  returns table (firebase_uid text, namensfarbe text, banner text)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.spind_je_spieler() $$;
create or replace function public.spind_profil(p_uid text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp
as $$ select app.spind_profil(p_uid) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.spind_frei()                     from public, anon, authenticated;
revoke execute on function app.spind_hat(text, text)            from public, anon, authenticated;
revoke execute on function app.spind_vorab(text)                from public, anon, authenticated;
revoke execute on function app.spind_konto_aufraeumen()         from public, anon, authenticated;
revoke execute on function app.spind_stand()                    from public, anon;
revoke execute on function app.spind_teil_kaufen(text)          from public, anon;
revoke execute on function app.spind_tragen(text, text)         from public, anon;
revoke execute on function public.spind_stand()                 from public, anon;
revoke execute on function public.spind_teil_kaufen(text)       from public, anon;
revoke execute on function public.spind_tragen(text, text)      from public, anon;
grant  execute on function app.spind_stand()                    to authenticated;
grant  execute on function app.spind_teil_kaufen(text)          to authenticated;
grant  execute on function app.spind_tragen(text, text)         to authenticated;
grant  execute on function public.spind_stand()                 to authenticated;
grant  execute on function public.spind_teil_kaufen(text)       to authenticated;
grant  execute on function public.spind_tragen(text, text)      to authenticated;
grant  execute on function app.spind_je_spieler()               to anon, authenticated;
grant  execute on function public.spind_je_spieler()            to anon, authenticated;
grant  execute on function app.spind_profil(text)               to anon, authenticated;
grant  execute on function public.spind_profil(text)            to anon, authenticated;
