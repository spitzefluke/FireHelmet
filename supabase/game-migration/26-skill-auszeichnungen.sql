/* ======================================================
   SKILL-BAUM, ETAPPE 3: TITEL UND ABZEICHEN IN DER RANGLISTE
   ---------------------------------------------------
   player_progression ist nur fuer die EIGENE Zeile lesbar
   (progression_select_own). Damit die Rangliste die Titel ANDERER
   Spieler zeigen kann, gibt es hier eine schmale Lese-Funktion:

     public.skill_auszeichnungen()
       -> firebase_uid, titel, abzeichen

   Sie gibt NUR diese drei Dinge heraus - keine Punkte, keine Boni,
   keine anderen Spalten - und nur fuer Spieler, die mindestens einen
   Titel oder ein Abzeichen haben. Titel und Abzeichen sind ohnehin
   zum Zeigen da.

   WELCHER TITEL
   Der teuerste freigeschaltete Knoten der Art "titel" (die Legende
   mit 3 Punkten schlaegt den Gluecksritter mit 2). So muss hier nichts
   angepasst werden, wenn spaeter weitere Titel dazukommen.

   Ob die Titel ueberhaupt angezeigt werden, entscheidet der Browser
   ueber das Feature-Flag skillTree (scripts/wheel/wheel.js) - vor dem
   Release sieht sie nur der Admin.

   REIHENFOLGE: nach 25 einspielen. Von Hand. Idempotent.
====================================================== */

create or replace function app.skill_auszeichnungen()
  returns table (firebase_uid text, titel text, abzeichen text[])
language sql stable security definer set search_path = public, app, pg_temp
as $$
  select p.firebase_uid,
         (select s.node_id from public.skill_nodes s
           where s.art = 'titel' and s.node_id = any(p.unlocked_skills)
           order by s.kosten desc, s.node_id
           limit 1),
         coalesce((select array_agg(s.node_id order by s.node_id) from public.skill_nodes s
                    where s.art = 'abzeichen' and s.node_id = any(p.unlocked_skills)), '{}')
    from public.player_progression p
   where exists (select 1 from public.skill_nodes s
                  where s.art in ('titel', 'abzeichen') and s.node_id = any(p.unlocked_skills))
$$;

create or replace function public.skill_auszeichnungen()
  returns table (firebase_uid text, titel text, abzeichen text[])
language sql stable security definer set search_path = public, app, pg_temp
as $$ select * from app.skill_auszeichnungen() $$;

/* Beide Ebenen, wie in 10-boss-attacks.sql: der oeffentliche Wrapper
   reicht nur durch. anon, weil die Rangliste auch ohne Anmeldung
   geladen wird. */
grant execute on function app.skill_auszeichnungen()    to anon, authenticated;
grant execute on function public.skill_auszeichnungen() to anon, authenticated;
