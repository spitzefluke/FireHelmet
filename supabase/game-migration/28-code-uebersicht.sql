/* ======================================================
   CODE-UEBERSICHT FUER DEN ADMIN
   ---------------------------------------------------
   Bisher zeigte das Admin-Panel von den Geheimcodes nur die ersten
   acht Hashzeichen - den Code selbst kannte danach niemand mehr,
   auch der Admin nicht. Ab hier:

   - admin_code_klartext: eine Tabelle NUR fuer den Admin, in der
     der Klartext zu einem Hash steht. Niemand sonst kann sie lesen
     (RLS erzwungen, keine Policy, keine Tabellenrechte - wie bei
     currency_codes in 14).
   - admin_code_klartext_merken(art, code): traegt einen Klartext
     ein, ABER nur, wenn sein Hash in der passenden Code-Tabelle
     wirklich vorkommt. Das Panel ruft sie direkt nach dem Anlegen
     eines Codes auf; fuer alte Codes kann der Admin den Code
     eintippen ("nachtragen"). Ein falscher Code landet so nie in
     der Tabelle.
   - admin_codes_uebersicht(): alle Dublonen-, Boss- und XP-Codes
     mit Belohnung, Notiz, Datum, Klartext (falls bekannt) und wie
     oft sie eingeloest wurden.

   WARUM KEINE BESTEHENDE FUNKTION ANGEFASST WIRD
   admin_code_setzen() und admin_boss_code_setzen() bleiben, wie
   sie sind. Das Merken ist ein zweiter Aufruf aus dem Panel. Geht
   er schief, fehlt nur der Klartext - er laesst sich nachtragen.

   NORMALISIERUNG - muss zu den Einloese-Funktionen passen:
     dublonen  lower(btrim(code))   (14, app.admin_code_setzen)
     xp        lower(btrim(code))   (19, app.xp_code_einloesen)
     boss      upper(btrim(code))   (10/17, boss_unlock_special)

   EINLOESUNGEN
     dublonen  Spieler, in deren redeemed_currency_codes der Hash steht
     xp        Zeilen in xp_code_einloesungen
     boss      Spieler, die den Angriff freigeschaltet haben. Das ist
               je ANGRIFF gezaehlt, nicht je Code - teilen sich zwei
               Codes einen Angriff, zeigen beide dieselbe Zahl.

   Story-Codes aus scripts/codes/codes-data.js liegen nicht in der
   Datenbank; die listet das Panel selbst aus der Datei.

   REIHENFOLGE: nach 27 einspielen. Von Hand. Idempotent.
====================================================== */


/* ======================================================
   1. TABELLE
====================================================== */
create table if not exists public.admin_code_klartext (
  art            text not null,
  code_sha256    text not null,
  klartext       text not null,
  eingetragen_am timestamptz not null default now(),
  primary key (art, code_sha256),

  constraint admin_code_klartext_art_bekannt check (art in ('dublonen', 'boss', 'xp')),
  constraint admin_code_klartext_hash_form check (code_sha256 ~ '^[0-9a-f]{64}$'),
  constraint admin_code_klartext_len check (char_length(klartext) between 1 and 64)
);

alter table public.admin_code_klartext enable row level security;
alter table public.admin_code_klartext force row level security;
-- Keine Policy, keine Rechte: lesen und schreiben nur die Funktionen
-- unten, und die pruefen app.is_admin().
revoke all on public.admin_code_klartext from anon, authenticated;


/* ======================================================
   2. KLARTEXT MERKEN (nur Admin)
   ---------------------------------------------------
   Rueckgabe true = eingetragen, false = zu diesem Code gibt es in
   der gewaehlten Art keinen Eintrag (vertippt oder falsche Art).
====================================================== */
create or replace function app.admin_code_klartext_merken(p_art text, p_code text) returns boolean
language plpgsql security definer set search_path = public, app, extensions, pg_temp
as $$
declare
  sauber text := btrim(coalesce(p_code, ''));
  hash   text;
  da     boolean;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  if p_art is null or p_art not in ('dublonen', 'boss', 'xp') then
    raise exception 'unbekannte-art';
  end if;
  if char_length(sauber) < 2 or char_length(sauber) > 64 then
    return false;
  end if;

  hash := encode(extensions.digest(case when p_art = 'boss' then upper(sauber) else lower(sauber) end, 'sha256'), 'hex');

  da := case p_art
          when 'dublonen' then exists (select 1 from public.currency_codes     where code_sha256 = hash)
          when 'boss'     then exists (select 1 from public.boss_special_codes where code_sha256 = hash)
          else                 exists (select 1 from public.xp_codes           where code_sha256 = hash)
        end;
  if not da then
    return false;
  end if;

  insert into public.admin_code_klartext (art, code_sha256, klartext)
       values (p_art, hash, sauber)
  on conflict (art, code_sha256) do update
     set klartext = excluded.klartext, eingetragen_am = now();

  /* Aufraeumen: Klartexte zu inzwischen geloeschten Codes. */
  delete from public.admin_code_klartext k
   where (k.art = 'dublonen' and not exists (select 1 from public.currency_codes     c where c.code_sha256 = k.code_sha256))
      or (k.art = 'boss'     and not exists (select 1 from public.boss_special_codes c where c.code_sha256 = k.code_sha256))
      or (k.art = 'xp'       and not exists (select 1 from public.xp_codes           c where c.code_sha256 = k.code_sha256));

  return true;
end
$$;

create or replace function public.admin_code_klartext_merken(p_art text, p_code text) returns boolean
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_code_klartext_merken(p_art, p_code) $$;

revoke execute on function app.admin_code_klartext_merken(text, text)    from public;
revoke execute on function public.admin_code_klartext_merken(text, text) from public;
grant  execute on function app.admin_code_klartext_merken(text, text)    to authenticated;
grant  execute on function public.admin_code_klartext_merken(text, text) to authenticated;


/* ======================================================
   3. UEBERSICHT (nur Admin)
   ---------------------------------------------------
   wert       Dublonen bzw. Pass-XP; bei Boss-Codes null
   schluessel der Spezialangriff; nur bei Boss-Codes
   klartext   null, solange er nicht gemerkt/nachgetragen ist
====================================================== */
create or replace function app.admin_codes_uebersicht()
returns table (art text, code_sha256 text, klartext text, wert integer, schluessel text,
               notiz text, angelegt timestamptz, einloesungen integer)
language plpgsql stable security definer set search_path = public, app, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;
  return query
    select 'dublonen'::text, c.code_sha256, k.klartext, c.betrag, null::text, c.bemerkung, c.erstellt,
           (select count(*)::integer from public.players p where p.redeemed_currency_codes ? c.code_sha256)
      from public.currency_codes c
      left join public.admin_code_klartext k on k.art = 'dublonen' and k.code_sha256 = c.code_sha256
    union all
    select 'boss'::text, b.code_sha256, k.klartext, null::integer, b.schluessel, b.bemerkung, b.erstellt,
           (select count(*)::integer from public.boss_attack_state s where b.schluessel = any(s.frei))
      from public.boss_special_codes b
      left join public.admin_code_klartext k on k.art = 'boss' and k.code_sha256 = b.code_sha256
    union all
    select 'xp'::text, x.code_sha256, k.klartext, x.punkte, null::text, x.bezeichnung, x.angelegt_am,
           (select count(*)::integer from public.xp_code_einloesungen e where e.code_sha256 = x.code_sha256)
      from public.xp_codes x
      left join public.admin_code_klartext k on k.art = 'xp' and k.code_sha256 = x.code_sha256
    order by 1, 7 desc;
end
$$;

create or replace function public.admin_codes_uebersicht()
returns table (art text, code_sha256 text, klartext text, wert integer, schluessel text,
               notiz text, angelegt timestamptz, einloesungen integer)
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.admin_codes_uebersicht() $$;

revoke execute on function app.admin_codes_uebersicht()    from public;
revoke execute on function public.admin_codes_uebersicht() from public;
grant  execute on function app.admin_codes_uebersicht()    to authenticated;
grant  execute on function public.admin_codes_uebersicht() to authenticated;
