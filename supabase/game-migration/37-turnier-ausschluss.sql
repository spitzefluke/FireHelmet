/* ======================================================
   THE CHALLENGE: SPIELER AUSSCHLIESSEN
   ---------------------------------------------------
   Der Admin kann einzelne Teilnehmer ausschliessen. Ein
   ausgeschlossener Spieler verliert jedes Match automatisch an seinen
   Gegner - sichtbar: im Turnierbaum steht bei ihm "ausgeschlossen",
   und er selbst sieht einen Hinweis statt "MATCH SPIELEN".

   tournament_participants.ausgeschlossen
                 vom Admin gesetzt, bleibt auch bei "Fortschritt
                 zuruecksetzen" stehen (anders als eliminated).

   WANN ENTSCHIEDEN WIRD
   - Wird ein Match offen (beide Slots echte Spieler) und genau einer
     ist ausgeschlossen, geht es sofort an den anderen. Das erledigt
     ein Trigger auf tournament_matches - dort laufen alle Wege
     zusammen: Turnierstart, Vorruecken, Freilos-Kaskade.
   - Wird jemand ausgeschlossen, der gerade in einem offenen Match
     steht, entscheidet admin_teilnehmer_ausschliessen() es gleich.
   - Sind BEIDE ausgeschlossen, bleibt das Match offen - der Admin
     entscheidet es von Hand ("Offene Matches von Hand entscheiden",
     admin_match_entscheiden aus 14).
   Entschieden wird ueber app.tournament_resolve_match() aus 07, also
   genau wie ein gespieltes Match: Verlierer scheidet aus, Sieger
   rueckt vor, im Finale bekommt der Sieger die Cap.

   Wieder zulassen nimmt nur die Markierung weg - schon entschiedene
   Matches bleiben entschieden.

   REIHENFOLGE: nach 36 einspielen. Von Hand. Idempotent.
====================================================== */

alter table public.tournament_participants
  add column if not exists ausgeschlossen boolean not null default false;


/* ======================================================
   1. EIN OFFENES MATCH PRUEFEN
   Genau einer ausgeschlossen -> der andere gewinnt. Gibt true
   zurueck, wenn entschieden wurde.
====================================================== */
create or replace function app.turnier_ausschluss_pruefen(p_match_id bigint) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  m     public.tournament_matches;
  aus1  boolean;
  aus2  boolean;
begin
  select * into m from public.tournament_matches where id = p_match_id;
  if not found or m.status <> 'open'
     or m.player_1_uid is null or m.player_2_uid is null
     or m.player_1_uid = 'BYE' or m.player_2_uid = 'BYE' then
    return false;
  end if;

  select coalesce(bool_or(ausgeschlossen), false) into aus1
    from public.tournament_participants
   where tournament_id = m.tournament_id and firebase_uid = m.player_1_uid;
  select coalesce(bool_or(ausgeschlossen), false) into aus2
    from public.tournament_participants
   where tournament_id = m.tournament_id and firebase_uid = m.player_2_uid;

  if aus1 = aus2 then
    return false;   -- keiner oder beide: so lassen
  end if;

  perform app.tournament_resolve_match(m.id, case when aus1 then m.player_2_uid else m.player_1_uid end, false);
  return true;
end
$$;

revoke execute on function app.turnier_ausschluss_pruefen(bigint) from public, anon, authenticated;


/* ======================================================
   2. TRIGGER: SOBALD EIN MATCH OFFEN WIRD
   AFTER UPDATE OF status - der Turnierstart (07/13) und
   tournament_place_in_next_match (07) setzen status = 'open' jeweils
   per UPDATE. Das Entscheiden setzt status = 'complete' und fuellt
   das naechste Match; der Trigger greift dort erneut (hoechstens so
   tief, wie das Turnier Runden hat).
====================================================== */
create or replace function app.tournament_matches_ausschluss() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp
as $$
begin
  perform app.turnier_ausschluss_pruefen(new.id);
  return null;
end
$$;

revoke execute on function app.tournament_matches_ausschluss() from public, anon, authenticated;

create or replace trigger tournament_matches_ausschluss
  after update of status on public.tournament_matches
  for each row
  when (new.status = 'open' and old.status is distinct from 'open')
  execute function app.tournament_matches_ausschluss();


/* ======================================================
   3. ADMIN: AUSSCHLIESSEN / WIEDER ZULASSEN
   Gibt die Zahl der dabei sofort entschiedenen Matches zurueck.
====================================================== */
create or replace function app.admin_teilnehmer_ausschliessen(p_tournament_id text, p_uid text, p_aus boolean)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp
as $$
declare
  mid     bigint;
  anzahl  integer := 0;
begin
  if not app.is_admin() then
    raise exception 'nur-admin';
  end if;

  update public.tournament_participants
     set ausgeschlossen = coalesce(p_aus, false)
   where tournament_id = p_tournament_id and firebase_uid = p_uid;
  if not found then
    raise exception 'nicht-angemeldet';
  end if;

  if coalesce(p_aus, false) then
    for mid in
      select id from public.tournament_matches
       where tournament_id = p_tournament_id and status = 'open'
         and (player_1_uid = p_uid or player_2_uid = p_uid)
    loop
      if app.turnier_ausschluss_pruefen(mid) then
        anzahl := anzahl + 1;
      end if;
    end loop;
  end if;

  return anzahl;
end
$$;

create or replace function public.admin_teilnehmer_ausschliessen(p_tournament_id text, p_uid text, p_aus boolean)
returns integer
language sql security definer set search_path = public, app, pg_temp
as $$ select app.admin_teilnehmer_ausschliessen(p_tournament_id, p_uid, p_aus) $$;

/* "from public, anon": Supabase gibt anon neue Funktionen per
   Default-Privileg ausdruecklich (siehe 28). */
revoke execute on function app.admin_teilnehmer_ausschliessen(text, text, boolean)    from public, anon;
revoke execute on function public.admin_teilnehmer_ausschliessen(text, text, boolean) from public, anon;
grant  execute on function app.admin_teilnehmer_ausschliessen(text, text, boolean)    to authenticated;
grant  execute on function public.admin_teilnehmer_ausschliessen(text, text, boolean) to authenticated;
