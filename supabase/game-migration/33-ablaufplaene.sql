/* ======================================================
   ABLAUFPLAENE FUER LIVE-EVENTS
   ---------------------------------------------------
   Der Admin legt vorab geplante Events an ("Event 3 - Der Riss")
   und ordnet ihnen Storys in fester Reihenfolge zu. Waehrend des
   Events steht im Admin-Bereich der gewaehlte Plan oben, mit
   "als Naechstes" an der richtigen Stelle.

   - storys:  Story-Kennungen in Reihenfolge (dieselben wie in
              admin_live_story). Geprueft wird nur die Form; welche
              Story es gibt, entscheidet admin_live_story beim Start.
   - aktiv:   der gerade gewaehlte Plan - hoechstens einer, damit
              jedes Admin-Geraet denselben sieht.
   - schritt: wie viele Storys des Ablaufs schon liefen. Der
              Admin-Bereich setzt ihn beim Start ueber den Plan und
              beim Event-Start auf 0.

   Nur Admins lesen und schreiben (RLS mit app.is_admin()). Die
   Zuschauer sehen davon nichts - die Storys selbst laufen wie
   bisher ueber admin_live_story und live_event.

   REIHENFOLGE: nach 32 einspielen. Von Hand. Idempotent.
====================================================== */

create table if not exists public.event_ablaufplaene (
  plan_id      text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  name         text not null,
  storys       text[] not null default '{}',
  aktiv        boolean not null default false,
  schritt      integer not null default 0,
  geaendert_am timestamptz not null default now(),
  constraint ablaufplan_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint ablaufplan_storys_anzahl check (coalesce(cardinality(storys), 0) <= 30),
  constraint ablaufplan_storys_form check (array_to_string(storys, ',') ~ '^([a-z_]{1,30}(,[a-z_]{1,30})*)?$'),
  constraint ablaufplan_schritt check (schritt between 0 and 30)
);

/* Hoechstens ein gewaehlter Plan. */
create unique index if not exists event_ablaufplaene_ein_aktiver
  on public.event_ablaufplaene (aktiv) where aktiv;

alter table public.event_ablaufplaene enable row level security;
alter table public.event_ablaufplaene force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'event_ablaufplaene' and policyname = 'event_ablaufplaene_admin') then
    create policy "event_ablaufplaene_admin" on public.event_ablaufplaene
      for all to authenticated using (app.is_admin()) with check (app.is_admin());
  end if;
end $$;

revoke all on public.event_ablaufplaene from anon, authenticated;
grant select, insert, update, delete on public.event_ablaufplaene to authenticated;
