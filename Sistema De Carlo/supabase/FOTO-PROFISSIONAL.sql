-- Fotos reais das profissionais (rode 1 vez no SQL Editor do Supabase)
alter table barbers add column if not exists photo text;

drop view if exists barbers_public;
create view barbers_public as
  select b.id, b.name, b.color, b.days_off, b.active, b.bio, b.service_ids, b.lunch, b.room, b.photo,
         coalesce((select jsonb_object_agg(e.key, e.value->'duration') from jsonb_each(b.service_overrides) e
                   where coalesce(e.value->>'duration', '') <> ''), '{}'::jsonb) as durations,
         coalesce((select avg(stars) from reviews r where r.barber_id = b.id), 0) as rating_avg,
         (select count(*) from reviews r where r.barber_id = b.id) as rating_count
  from barbers b where b.active;
grant select on barbers_public to anon, authenticated;
