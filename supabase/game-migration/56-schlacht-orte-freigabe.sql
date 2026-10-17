/* ======================================================
   KAMPFORTE ERST NACH FREIGABE
   ---------------------------------------------------
   Die Kampforte aus 55 sollen erst beim naechsten Live-Event kommen.
   Der Admin schaltet sie im Panel unter "Live-Event -> Freigaben"
   frei (siteConfig.featureFlags.schlachtOrte, derselbe Schalter wie
   fuer den Skill-Baum). Bis dahin startet jede Schlacht OHNE Ort -
   die Datenbank rechnet dann neutral wie vor 55.

   admin_schlacht_starten (Rumpf aus 55) lost nur noch aus, wenn die
   Freigabe an ist. Ein ausdruecklich gewaehlter Ort (p_ort) gilt
   weiterhin - der Admin kann damit vorab testen. Eine bereits
   laufende Schlacht bleibt, wie sie ist.

   REIHENFOLGE: nach 55 einspielen. Von Hand, im SQL-Editor.
   Idempotent.
====================================================== */

/* Ist die Freigabe "schlachtOrte" an? Ein kaputter Eintrag zaehlt als aus. */
create or replace function app.schlacht_orte_frei() returns boolean
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select coalesce((select data -> 'featureFlags' ->> 'schlachtOrte' = 'true'
                     from public.site_config where id = 'main'), false)
$$;

create or replace function app.admin_schlacht_starten(p_minuten integer default 10, p_ort text default null) returns bigint
language plpgsql security definer set search_path = public, app, private, pg_temp
as $$
declare
  sid bigint;
  ort text;
begin
  if not coalesce(app.is_admin(), false) then
    raise exception 'nur-admin';
  end if;
  if p_minuten is null or p_minuten < 3 or p_minuten > 30 then
    raise exception 'dauer-3-bis-30';
  end if;
  if p_ort is not null and p_ort <> '' then
    select ort_id into ort from public.schlacht_orte where ort_id = p_ort;
    if not found then
      raise exception 'ort-unbekannt';
    end if;
  elsif app.schlacht_orte_frei() then   -- NEU (56): auslosen nur mit Freigabe
    select ort_id into ort from public.schlacht_orte order by random() limit 1;
  end if;
  /* Eine faellige alte Schlacht (aus 49, mit Ende) erst abschliessen. */
  perform app.schlacht_abschliessen(s.id) from public.sternenschlacht s
   where s.status = 'laeuft' and s.ende_at is not null and s.ende_at <= now();
  if exists (select 1 from public.sternenschlacht where status = 'laeuft') then
    raise exception 'schlacht-laeuft';
  end if;

  insert into public.sternenschlacht (ende_at, endlos, tempo_sek, skala, leben0_menschen, leben0_aliens,
                                      dps_menschen, dps_aliens, anzahl_menschen, anzahl_aliens, ort)
       values (null, true, p_minuten * 60, 1, 0, 0, 0, 0, 0, 0, ort)
  returning id into sid;
  perform app.schlacht_aufstellen(sid);
  return sid;
end
$$;

revoke execute on function app.schlacht_orte_frei() from public, anon, authenticated;
