-- =====================================================================
-- DE CARLO BEAUTY — banco de dados (Supabase)
-- Sistema Astrovia · agendamento + gestão
-- Rode este arquivo INTEIRO no SQL Editor do projeto (pode rodar de novo
-- sem perder dados: tudo usa "if not exists" / "create or replace").
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists settings (
  id text primary key default 'main',
  shop_name text not null default 'De Carlo Beauty',
  whatsapp text default '',
  address text default '',
  instagram text default '',
  slot_step int not null default 30,
  booking_days_ahead int not null default 21,
  hours jsonb not null default '{"0":null,"1":["09:00","19:00"],"2":["09:00","19:00"],"3":["09:00","19:00"],"4":["09:00","19:00"],"5":["09:00","19:00"],"6":["08:00","17:00"]}',
  break_time jsonb,
  loyalty jsonb not null default '{"enabled":true,"goal":10,"rewardServiceId":null}',
  birthday_discount numeric(5,2) not null default 15,
  google_review_url text default '',
  club_enabled boolean not null default true,
  waitlist_enabled boolean not null default true,
  messages jsonb not null default '{}',                     -- textos do WhatsApp editados em Ajustes
  notify jsonb not null default '{"newBooking":true,"reminderMinutes":15,"dailySummary":true,"browser":true,"pollSeconds":60}',
  privacy jsonb not null default '{"hideContacts":true}',   -- profissionais não veem contato das clientes
  page jsonb not null default '{}'                          -- frase do site e aviso para as clientes
);

create table if not exists services (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text default '',
  duration int not null default 30 check (duration > 0),
  price numeric(10,2) not null default 0,
  commission numeric(5,2) not null default 50,
  active boolean not null default true,
  "order" int default 0
);

create table if not exists products (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  price numeric(10,2) not null default 0,
  stock int not null default 0,
  commission numeric(5,2) not null default 10,
  active boolean not null default true
);

create table if not exists barbers (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  phone text default '',
  color text default '#1F3E66',
  service_rate numeric(5,2),          -- null = usa o % do serviço
  product_rate numeric(5,2),          -- null = usa o % do produto
  days_off int[] not null default '{0}',
  active boolean not null default true,
  bio text default '',
  goal numeric(10,2) not null default 0,  -- meta de faturamento no mês
  service_overrides jsonb not null default '{}'  -- {serviceId: {duration, commission}} por profissional
);

create table if not exists clients (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  phone text not null unique,
  notes text default '',
  anamnese jsonb not null default '{}'::jsonb, -- ficha de anamnese (estética)
  birthday text,                        -- MM-DD
  last_campaign_at date,
  created_at date not null default current_date
);

create table if not exists appointments (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  time time not null,
  duration int not null,
  barber_id text not null references barbers(id),
  service_ids text[] not null default '{}',
  client_id text references clients(id),
  client_name text not null,
  client_phone text not null,
  total numeric(10,2) not null default 0,
  status text not null default 'agendado' check (status in ('agendado','confirmado','concluido','faltou','cancelado')),
  source text not null default 'online',
  notes text default '',
  sale_id text,
  promo jsonb,
  created_at date not null default current_date
);
create index if not exists appointments_date_idx on appointments(date, barber_id);

create table if not exists sales (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  time time not null default localtime,
  barber_id text not null references barbers(id),
  client_id text references clients(id),
  client_name text default 'Cliente avulso',
  appointment_id text references appointments(id),
  items jsonb not null default '[]',     -- [{type, refId, name, price, qty, commissionRate, commission}]
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment text not null default 'pix',
  commission_total numeric(10,2) not null default 0,
  benefit jsonb,                         -- {kind: club|runas(fidelidade)|birthday|promo, label, amount}
  loyalty_redeemed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sales_date_idx on sales(date, barber_id);

create table if not exists payouts (
  id text primary key default gen_random_uuid()::text,
  barber_id text not null references barbers(id),
  "from" date not null,
  "to" date not null,
  amount numeric(10,2) not null,
  paid_at date not null default current_date,
  note text default ''
);

create table if not exists cash (
  id text primary key default gen_random_uuid()::text,
  opened_at timestamptz not null default now(),
  opening_amount numeric(10,2) not null default 0,
  closed_at timestamptz,
  closing_amount numeric(10,2),
  note text default ''
);

-- Clube (assinaturas)
create table if not exists plans (
  id text primary key default gen_random_uuid()::text,
  name text not null, price numeric(10,2) not null, description text default '',
  service_ids text[] not null default '{}', "limit" int, product_discount numeric(5,2) not null default 0,
  featured boolean not null default false, active boolean not null default true, "order" int default 0
);
create table if not exists subscriptions (
  id text primary key default gen_random_uuid()::text,
  client_id text not null references clients(id), plan_id text not null references plans(id),
  status text not null default 'ativo' check (status in ('ativo','cancelado')),
  started_at date not null default current_date, paid_months text[] not null default '{}'
);
-- Lista de espera
create table if not exists waitlist (
  id text primary key default gen_random_uuid()::text,
  date date not null, barber_id text references barbers(id), period text default 'qualquer',
  client_name text not null, phone text not null, service_ids text[] default '{}',
  status text not null default 'aguardando', created_at date not null default current_date
);
-- Folgas / bloqueios
create table if not exists blocks (
  id text primary key default gen_random_uuid()::text,
  barber_id text not null references barbers(id), date date not null, start time, "end" time, reason text default ''
);
-- Avaliações
create table if not exists reviews (
  id text primary key default gen_random_uuid()::text,
  sale_id text not null unique references sales(id) on delete cascade, barber_id text references barbers(id),
  client_name text, stars int not null check (stars between 1 and 5), comment text default '', created_at date not null default current_date
);
-- Promoções de horário vazio
create table if not exists promos (
  id text primary key default gen_random_uuid()::text,
  weekdays int[] not null, "from" text not null, "to" text not null, pct numeric(5,2) not null, label text default '', active boolean not null default true
);
-- Portfólio (fotos de antes e depois)
create table if not exists photos (
  id text primary key default gen_random_uuid()::text,
  barber_id text references barbers(id), client_id text references clients(id), appointment_id text references appointments(id),
  url text not null, caption text default '', created_at date not null default current_date,
  private boolean not null default false  -- fotos da ficha da cliente não aparecem no site
);
-- Despesas (Lucro real)
create table if not exists expenses (
  id text primary key default gen_random_uuid()::text,
  month text not null, category text not null, description text default '', amount numeric(10,2) not null
);

-- Avisos da gestão para a equipe (pop-up no painel até a profissional tocar em "Ciente")
create table if not exists announcements (
  id text primary key default gen_random_uuid()::text,
  title text not null, message text not null,
  audience text not null default 'all',      -- 'all' ou o id da profissional
  important boolean not null default false,
  expires_at date, active boolean not null default true,
  created_at timestamptz not null default now(),
  reads jsonb not null default '{}'          -- {barberId: data/hora em que tocou em Ciente}
);

-- Quem acessa o painel: proprietária (admin) e profissionais (barber)
create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','barber')),
  name text not null,
  barber_id text references barbers(id),
  email text
);

-- Colunas novas para projetos criados com versões anteriores
alter table settings add column if not exists messages jsonb not null default '{}';
alter table settings add column if not exists notify jsonb not null default '{"newBooking":true,"reminderMinutes":15,"dailySummary":true,"browser":true,"pollSeconds":60}';
alter table settings add column if not exists privacy jsonb not null default '{"hideContacts":true}';
alter table settings add column if not exists page jsonb not null default '{}';
alter table barbers add column if not exists service_overrides jsonb not null default '{}';
alter table barbers add column if not exists service_ids text[] not null default '{}';  -- serviços que ela faz (vazio = todos)
alter table barbers add column if not exists lunch jsonb;  -- ["12:00","13:00"] almoço da profissional (vazio = intervalo geral)
-- sincronização leve: o painel busca só o que mudou (economiza o tráfego do plano gratuito)
alter table appointments add column if not exists updated_at timestamptz not null default now();
alter table clients add column if not exists updated_at timestamptz not null default now();
create index if not exists appointments_updated_idx on appointments(updated_at);
create index if not exists clients_updated_idx on clients(updated_at);
create index if not exists sales_created_idx on sales(created_at);
create or replace function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists appointments_touch on appointments;
create trigger appointments_touch before update on appointments for each row execute function touch_updated_at();
drop trigger if exists clients_touch on clients;
create trigger clients_touch before update on clients for each row execute function touch_updated_at();
alter table photos add column if not exists private boolean not null default false;
alter table staff add column if not exists email text;
alter table clients add column if not exists anamnese jsonb not null default '{}'::jsonb;

-- ---------- Funções auxiliares ----------
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from staff where user_id = auth.uid()) $$;

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from staff where user_id = auth.uid() and role = 'admin') $$;

create or replace function my_barber_id() returns text language sql stable security definer set search_path = public as
$$ select barber_id from staff where user_id = auth.uid() $$;

-- Vitrine pública das profissionais (sem telefone e sem comissões; só o tempo de cada procedimento)
drop view if exists barbers_public;
create view barbers_public as
  select b.id, b.name, b.color, b.days_off, b.active, b.bio, b.service_ids, b.lunch,
         coalesce((select jsonb_object_agg(e.key, e.value->'duration') from jsonb_each(b.service_overrides) e
                   where coalesce(e.value->>'duration', '') <> ''), '{}'::jsonb) as durations,
         coalesce((select avg(stars) from reviews r where r.barber_id = b.id), 0) as rating_avg,
         (select count(*) from reviews r where r.barber_id = b.id) as rating_count
  from barbers b where b.active;
grant select on barbers_public to anon, authenticated;

-- Horários ocupados de um dia (o público só vê hora/duração, nada de nomes)
create or replace function get_busy(p_date date)
returns table(barber_id text, "time" text, duration int)
language sql stable security definer set search_path = public as $$
  select a.barber_id, to_char(a.time, 'HH24:MI'), a.duration
  from appointments a
  where a.date = p_date and a.status not in ('cancelado','faltou')
  union all
  select b.barber_id, coalesce(to_char(b.start, 'HH24:MI'), '00:00'),
         case when b.start is null then 1440 else (extract(epoch from (b."end" - b.start)) / 60)::int end
  from blocks b where b.date = p_date
$$;
grant execute on function get_busy(date) to anon, authenticated;

-- Agendamento público, com checagem de conflito dentro do banco
create or replace function book_appointment(
  p_client_name text, p_client_phone text, p_barber_id text, p_service_ids text[],
  p_date date, p_time time, p_duration int, p_total numeric, p_source text default 'online', p_notes text default '',
  p_birthday text default null, p_promo jsonb default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_client text; v_id text; v_total numeric; v_dur int;
begin
  if p_date < current_date then raise exception 'Data inválida'; end if;
  if length(regexp_replace(p_client_phone, '\D', '', 'g')) < 10 then raise exception 'WhatsApp inválido'; end if;
  if not exists(select 1 from barbers where id = p_barber_id and active) then raise exception 'Profissional indisponível'; end if;
  if is_staff() and not is_admin() and p_barber_id is distinct from my_barber_id() then raise exception 'Você só pode agendar na sua própria agenda'; end if;
  if exists(select 1 from barbers where id = p_barber_id and cardinality(service_ids) > 0 and not (p_service_ids <@ service_ids)) then
    raise exception 'Essa profissional não faz esse serviço. Escolha outra, por favor.'; end if;

  -- preço e duração vêm do banco (a cliente não consegue alterar); o tempo pode ser próprio da profissional
  select coalesce(sum(s.price),0),
         coalesce(sum(coalesce(nullif(b.service_overrides->s.id->>'duration', '')::int, s.duration)),0)
    into v_total, v_dur
    from services s cross join (select service_overrides from barbers where id = p_barber_id) b
   where s.id = any(p_service_ids) and s.active;
  if v_dur = 0 then raise exception 'Serviço inválido'; end if;

  perform pg_advisory_xact_lock(hashtext(p_barber_id || p_date::text));
  if exists(
    select 1 from appointments a
    where a.barber_id = p_barber_id and a.date = p_date and a.status not in ('cancelado','faltou')
      and p_time < a.time + make_interval(mins => a.duration)
      and p_time + make_interval(mins => v_dur) > a.time
  ) then raise exception 'Esse horário acabou de ser reservado. Escolha outro, por favor.'; end if;
  if exists(
    select 1 from blocks b where b.barber_id = p_barber_id and b.date = p_date
      and (b.start is null or (p_time < b."end" and p_time + make_interval(mins => v_dur) > b.start))
  ) then raise exception 'A profissional não atende nesse horário. Escolha outro, por favor.'; end if;

  insert into clients(name, phone) values (p_client_name, regexp_replace(p_client_phone, '\D', '', 'g'))
  on conflict (phone) do update set name = excluded.name, birthday = coalesce(nullif(p_birthday, ''), clients.birthday)
  returning id into v_client;
  if p_birthday is not null and p_birthday <> '' then update clients set birthday = p_birthday where id = v_client; end if;

  insert into appointments(date, time, duration, barber_id, service_ids, client_id, client_name, client_phone, total, source, notes, promo)
  values (p_date, p_time, v_dur, p_barber_id, p_service_ids, v_client, p_client_name, regexp_replace(p_client_phone, '\D', '', 'g'), v_total,
          case when is_staff() then coalesce(p_source,'balcao') else 'online' end, coalesce(p_notes,''), p_promo)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function book_appointment(text,text,text,text[],date,time,int,numeric,text,text,text,jsonb) to anon, authenticated;

-- Venda (PDV): grava, baixa estoque e conclui o atendimento numa transação
create or replace function create_sale(p_sale jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; it jsonb;
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  if not is_admin() and (p_sale->>'barber_id') is distinct from my_barber_id() then raise exception 'Você só pode lançar vendas suas'; end if;
  insert into sales(date, time, barber_id, client_id, client_name, appointment_id, items, subtotal, discount, total, payment, commission_total, benefit, loyalty_redeemed)
  values (coalesce((p_sale->>'date')::date, current_date), coalesce((p_sale->>'time')::time, localtime), p_sale->>'barber_id',
          nullif(p_sale->>'client_id',''), coalesce(p_sale->>'client_name','Cliente avulso'), nullif(p_sale->>'appointment_id',''),
          coalesce(p_sale->'items','[]'), (p_sale->>'subtotal')::numeric, coalesce((p_sale->>'discount')::numeric,0),
          (p_sale->>'total')::numeric, coalesce(p_sale->>'payment','pix'), coalesce((p_sale->>'commission_total')::numeric,0),
          nullif(p_sale->'benefit', 'null'::jsonb), coalesce((p_sale->>'loyalty_redeemed')::boolean, false))
  returning id into v_id;

  for it in select * from jsonb_array_elements(coalesce(p_sale->'items','[]')) loop
    if it->>'type' = 'product' then
      update products set stock = greatest(0, stock - (it->>'qty')::int) where id = it->>'refId';
    end if;
  end loop;

  if nullif(p_sale->>'appointment_id','') is not null then
    update appointments set status = 'concluido', sale_id = v_id where id = p_sale->>'appointment_id';
  end if;
  return v_id;
end $$;
grant execute on function create_sale(jsonb) to authenticated;

-- Estorno (somente a gestão)
create or replace function delete_sale(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare s sales; it jsonb;
begin
  if not is_admin() then raise exception 'Somente a gestão pode estornar'; end if;
  select * into s from sales where id = p_id; if not found then return; end if;
  for it in select * from jsonb_array_elements(s.items) loop
    if it->>'type' = 'product' then update products set stock = stock + (it->>'qty')::int where id = it->>'refId'; end if;
  end loop;
  update appointments set status = 'confirmado', sale_id = null where id = s.appointment_id;
  delete from sales where id = p_id;
end $$;
grant execute on function delete_sale(text) to authenticated;

-- ---------- RLS ----------
alter table settings enable row level security;
alter table services enable row level security;
alter table products enable row level security;
alter table barbers enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table sales enable row level security;
alter table payouts enable row level security;
alter table cash enable row level security;
alter table staff enable row level security;
alter table announcements enable row level security;

-- Público (app de agendamento)
drop policy if exists "settings_read" on settings;   create policy "settings_read" on settings for select using (true);
drop policy if exists "services_read" on services;   create policy "services_read" on services for select using (true);

-- Dono edita configurações e catálogo
drop policy if exists "settings_admin" on settings;  create policy "settings_admin" on settings for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "services_admin" on services;  create policy "services_admin" on services for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "products_read" on products;   create policy "products_read" on products for select to authenticated using (is_staff());
drop policy if exists "products_admin" on products;  create policy "products_admin" on products for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "barbers_read" on barbers;     create policy "barbers_read" on barbers for select to authenticated using (is_staff());
drop policy if exists "barbers_admin" on barbers;    create policy "barbers_admin" on barbers for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "payouts_read" on payouts;     create policy "payouts_read" on payouts for select to authenticated using (is_admin() or barber_id = (select barber_id from staff where user_id = auth.uid()));
drop policy if exists "payouts_admin" on payouts;    create policy "payouts_admin" on payouts for all to authenticated using (is_admin()) with check (is_admin());

-- Clientes e agendamentos: acesso direto só da gestão.
-- As profissionais leem pelas funções pro_* abaixo (só a agenda dela, sem contato das clientes).
drop policy if exists "clients_staff" on clients;    drop policy if exists "clients_admin" on clients;
create policy "clients_admin" on clients for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "appts_staff" on appointments; drop policy if exists "appts_admin" on appointments;
create policy "appts_admin" on appointments for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "sales_read" on sales;         create policy "sales_read" on sales for select to authenticated using (is_admin() or barber_id = (select barber_id from staff where user_id = auth.uid()));
drop policy if exists "cash_staff" on cash;          create policy "cash_staff" on cash for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "staff_self" on staff;         create policy "staff_self" on staff for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists "staff_admin" on staff;        create policy "staff_admin" on staff for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Portal do cliente, espera e avaliações (públicos, por telefone) ----------
create or replace function client_portal(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clients; begin
  select * into c from clients where phone = regexp_replace(p_phone, '\D', '', 'g');
  if not found then return null; end if;
  return jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'birthday', c.birthday),
    'upcoming', coalesce((select jsonb_agg(to_jsonb(a) - 'client_phone' order by a.date, a.time) from appointments a
                 where a.client_id = c.id and a.date >= current_date and a.status in ('agendado','confirmado')), '[]'),
    'last', (select jsonb_build_object('service_ids', a.service_ids, 'barber_id', a.barber_id, 'date', a.date) from appointments a
             where a.client_id = c.id and a.status = 'concluido' order by a.date desc, a.time desc limit 1),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'date', s.date, 'client_id', s.client_id, 'items', s.items, 'benefit', s.benefit, 'loyalty_redeemed', s.loyalty_redeemed))
               from sales s where s.client_id = c.id), '[]'),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(x)) from subscriptions x where x.client_id = c.id), '[]'),
    'plans', coalesce((select jsonb_agg(to_jsonb(p)) from plans p), '[]'),
    'settings', (select jsonb_build_object('loyalty', loyalty) from settings where id = 'main'),
    'to_review', (select jsonb_build_object('id', s.id, 'date', s.date) from sales s where s.client_id = c.id and s.date >= current_date - 14
                  and not exists(select 1 from reviews r where r.sale_id = s.id) order by s.date desc limit 1)
  );
end $$;
grant execute on function client_portal(text) to anon, authenticated;

create or replace function client_cancel(p_id text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update appointments set status = 'cancelado'
  where id = p_id and client_phone = regexp_replace(p_phone, '\D', '', 'g') and status in ('agendado','confirmado') and date >= current_date;
  if not found then raise exception 'Agendamento não encontrado'; end if;
end $$;
grant execute on function client_cancel(text, text) to anon, authenticated;

create or replace function join_waitlist(p_date date, p_barber_id text, p_period text, p_name text, p_phone text, p_service_ids text[]) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; begin
  if p_date < current_date then raise exception 'Data inválida'; end if;
  insert into waitlist(date, barber_id, period, client_name, phone, service_ids)
  values (p_date, nullif(p_barber_id, ''), coalesce(p_period, 'qualquer'), p_name, regexp_replace(p_phone, '\D', '', 'g'), coalesce(p_service_ids, '{}'))
  returning id into v_id; return v_id;
end $$;
grant execute on function join_waitlist(date, text, text, text, text, text[]) to anon, authenticated;

create or replace function review_target(p_sale_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('sale_id', s.id, 'client_first', split_part(s.client_name, ' ', 1), 'barber_id', s.barber_id,
    'barber_name', (select name from barbers b where b.id = s.barber_id), 'date', s.date,
    'services', (select string_agg(i->>'name', ' + ') from jsonb_array_elements(s.items) i where i->>'type' = 'service'),
    'reviewed', exists(select 1 from reviews r where r.sale_id = s.id))
  from sales s where s.id = p_sale_id
$$;
grant execute on function review_target(text) to anon, authenticated;

create or replace function submit_review(p_sale_id text, p_stars int, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare s sales; begin
  select * into s from sales where id = p_sale_id; if not found then raise exception 'Atendimento não encontrado'; end if;
  if s.date < current_date - 30 then raise exception 'Este link de avaliação expirou'; end if;
  insert into reviews(sale_id, barber_id, client_name, stars, comment) values (s.id, s.barber_id, s.client_name, greatest(1, least(5, p_stars)), left(coalesce(p_comment, ''), 500));
exception when unique_violation then raise exception 'Este atendimento já foi avaliado. Obrigado!';
end $$;
grant execute on function submit_review(text, int, text) to anon, authenticated;

alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table waitlist enable row level security;
alter table blocks enable row level security;
alter table reviews enable row level security;
alter table promos enable row level security;
alter table photos enable row level security;
alter table expenses enable row level security;
drop policy if exists "plans_read" on plans;   create policy "plans_read" on plans for select using (true);
drop policy if exists "plans_admin" on plans;  create policy "plans_admin" on plans for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "promos_read" on promos; create policy "promos_read" on promos for select using (true);
drop policy if exists "promos_admin" on promos; create policy "promos_admin" on promos for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "photos_read" on photos; create policy "photos_read" on photos for select using (not private or is_staff());
drop policy if exists "photos_staff" on photos; create policy "photos_staff" on photos for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "subs_staff" on subscriptions; create policy "subs_staff" on subscriptions for all to authenticated using (is_staff()) with check (is_admin());
drop policy if exists "wait_staff" on waitlist; create policy "wait_staff" on waitlist for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "blocks_staff" on blocks; create policy "blocks_staff" on blocks for all to authenticated using (is_staff()) with check (is_admin() or barber_id = (select barber_id from staff where user_id = auth.uid()));
drop policy if exists "reviews_staff" on reviews; create policy "reviews_staff" on reviews for select to authenticated using (is_staff());
drop policy if exists "expenses_admin" on expenses; create policy "expenses_admin" on expenses for all to authenticated using (is_admin()) with check (is_admin());

-- Storage: fotos do portfólio (bucket público só para leitura)
insert into storage.buckets (id, name, public) values ('portfolio', 'portfolio', true) on conflict (id) do nothing;
drop policy if exists "portfolio_read" on storage.objects;  create policy "portfolio_read" on storage.objects for select using (bucket_id = 'portfolio');
drop policy if exists "portfolio_write" on storage.objects; create policy "portfolio_write" on storage.objects for insert to authenticated with check (bucket_id = 'portfolio' and public.is_staff());

drop policy if exists "ann_read" on announcements;  create policy "ann_read" on announcements for select to authenticated using (is_admin() or (is_staff() and (audience = 'all' or audience = my_barber_id())));
drop policy if exists "ann_admin" on announcements; create policy "ann_admin" on announcements for all to authenticated using (is_admin()) with check (is_admin());

-- ---------- Área da profissional (agenda própria e privacidade) ----------
drop function if exists pro_data();
create or replace function pro_data(p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := my_barber_id(); hide boolean;
begin
  if me is null then raise exception 'Sem permissão'; end if;
  select coalesce((privacy->>'hideContacts')::boolean, true) into hide from settings where id = 'main';
  return jsonb_build_object(
    'appointments', coalesce((select jsonb_agg(case when hide then to_jsonb(a) || jsonb_build_object('client_phone', '') else to_jsonb(a) end)
                   from appointments a where a.barber_id = me and a.date >= current_date - 120 and (p_since is null or a.updated_at > p_since)), '[]'),
    'clients', coalesce((select jsonb_agg(case when hide then to_jsonb(c) || jsonb_build_object('phone', '') else to_jsonb(c) end) from clients c where p_since is null or c.updated_at > p_since), '[]')
  );
end $$;
grant execute on function pro_data(timestamptz) to authenticated;

create or replace function pro_update_appointment(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a appointments; v_date date; v_time time; v_svc text[]; v_dur int; v_total numeric;
begin
  if not exists(select 1 from appointments where id = p_id and barber_id = my_barber_id()) then raise exception 'Agendamento não encontrado'; end if;
  if p_patch ? 'status' and p_patch->>'status' not in ('agendado','confirmado','faltou','cancelado') then raise exception 'Status inválido'; end if;
  -- remarcar / trocar serviços na própria agenda (preço e tempo saem do banco)
  if p_patch ?| array['date', 'time', 'service_ids'] then
    select * into a from appointments where id = p_id;
    if a.status not in ('agendado', 'confirmado') then raise exception 'Esse agendamento não pode mais ser editado'; end if;
    v_date := coalesce((p_patch->>'date')::date, a.date);
    v_time := coalesce((p_patch->>'time')::time, a.time);
    v_svc := case when p_patch ? 'service_ids' then array(select jsonb_array_elements_text(p_patch->'service_ids')) else a.service_ids end;
    if cardinality(v_svc) = 0 then v_svc := a.service_ids; end if;
    if v_date < current_date then raise exception 'Data inválida'; end if;
    if exists(select 1 from barbers where id = a.barber_id and cardinality(service_ids) > 0 and not (v_svc <@ service_ids)) then raise exception 'Você não faz esse serviço'; end if;
    select coalesce(sum(s.price),0), coalesce(sum(coalesce(nullif(b.service_overrides->s.id->>'duration', '')::int, s.duration)),0)
      into v_total, v_dur
      from services s cross join (select service_overrides from barbers where id = a.barber_id) b where s.id = any(v_svc);
    if v_dur = 0 then raise exception 'Serviço inválido'; end if;
    if exists(select 1 from appointments x where x.id <> p_id and x.barber_id = a.barber_id and x.date = v_date and x.status not in ('cancelado','faltou')
      and v_time < x.time + make_interval(mins => x.duration) and v_time + make_interval(mins => v_dur) > x.time)
    then raise exception 'Conflito com outro agendamento nesse horário'; end if;
    update appointments set date = v_date, time = v_time, service_ids = v_svc, duration = v_dur, total = v_total where id = p_id;
  end if;
  update appointments set
    status = coalesce(p_patch->>'status', status),
    notes = coalesce(p_patch->>'notes', notes)
  where id = p_id;
end $$;
grant execute on function pro_update_appointment(text, jsonb) to authenticated;

create or replace function pro_update_client(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update clients set
    notes = coalesce(p_patch->>'notes', notes),
    anamnese = coalesce(p_patch->'anamnese', anamnese),
    birthday = coalesce(nullif(p_patch->>'birthday', ''), birthday)
  where id = p_id;
end $$;
grant execute on function pro_update_client(text, jsonb) to authenticated;

-- Cadastra (ou encontra) a cliente pelo WhatsApp — usado no caixa
create or replace function staff_upsert_client(p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clients; ph text := regexp_replace(p_phone, '\D', '', 'g');
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  if length(ph) < 10 then raise exception 'WhatsApp inválido'; end if;
  insert into clients(name, phone) values (p_name, ph) on conflict (phone) do nothing;
  select * into c from clients where phone = ph;
  return case when is_admin() or not coalesce((select (privacy->>'hideContacts')::boolean from settings where id = 'main'), true)
              then to_jsonb(c) else to_jsonb(c) || jsonb_build_object('phone', '') end;
end $$;
grant execute on function staff_upsert_client(text, text) to authenticated;

-- "Ciente" no aviso
create or replace function mark_announcement_read(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := coalesce(my_barber_id(), 'admin');
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update announcements set reads = reads || jsonb_build_object(me, now()) where id = p_id;
end $$;
grant execute on function mark_announcement_read(text) to authenticated;

-- Liga o login (criado em Authentication) a uma profissional — a gestão faz pelo painel (Equipe)
create or replace function link_staff(p_email text, p_barber_id text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare u uuid; b barbers;
begin
  if not is_admin() then raise exception 'Somente a gestão'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Nenhum usuário com esse e-mail. Crie o usuário em Authentication → Users primeiro.'; end if;
  select * into b from barbers where id = p_barber_id;
  if not found then raise exception 'Profissional não encontrada'; end if;
  if exists(select 1 from staff where user_id = u and role = 'admin') then raise exception 'Esse e-mail é da gestão'; end if;
  delete from staff where barber_id = p_barber_id and user_id <> u;
  insert into staff(user_id, role, name, barber_id, email) values (u, 'barber', b.name, b.id, lower(trim(p_email)))
  on conflict (user_id) do update set role = 'barber', name = excluded.name, barber_id = excluded.barber_id, email = excluded.email;
  return 'ok';
end $$;
grant execute on function link_staff(text, text) to authenticated;

-- ---------- Dados iniciais ----------
insert into settings(id, shop_name) values ('main', 'De Carlo Beauty') on conflict do nothing;

-- =====================================================================
-- DEPOIS DE RODAR (uma vez só):
-- 1) Authentication → Users → "Add user" → e-mail e senha da proprietária
--    (marque "Auto Confirm User").
-- 2) Rode a linha abaixo trocando o e-mail:
--    insert into staff(user_id, role, name, email)
--    select id, 'admin', 'Gestão De Carlo', email from auth.users where email = 'dona@exemplo.com';
-- 3) As profissionais: crie o usuário de cada uma em Authentication → Users
--    e, no painel, vá em Equipe → Editar → "E-mail de acesso" → Vincular.
-- =====================================================================

-- =====================================================================
-- NOTIFICAÇÕES PUSH (celular, mesmo com o site fechado)
-- Quem envia é a função "send-push" (supabase/functions/send-push).
-- O endereço da função e a senha interna ficam em private_config
-- (preenchidos pelo arquivo ATIVAR-PUSH.sql, fora do GitHub).
-- =====================================================================
create extension if not exists pg_net;

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'barber',
  barber_id text,
  keys jsonb not null,
  user_agent text default '',
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;   -- sem políticas: só as funções abaixo acessam

create table if not exists private_config (key text primary key, value text not null);
alter table private_config enable row level security;       -- sem políticas: ninguém lê pelo site

alter table appointments add column if not exists reminded_at timestamptz;

-- aparelho da pessoa logada passa a receber push
create or replace function save_push_subscription(p_endpoint text, p_keys jsonb, p_user_agent text default '') returns void
language plpgsql security definer set search_path = public as $$
declare st staff;
begin
  select * into st from staff where user_id = auth.uid();
  if not found then raise exception 'Sem permissão'; end if;
  insert into push_subscriptions(endpoint, user_id, role, barber_id, keys, user_agent)
  values (p_endpoint, st.user_id, st.role, st.barber_id, p_keys, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, role = excluded.role, barber_id = excluded.barber_id, keys = excluded.keys, user_agent = excluded.user_agent;
end $$;
grant execute on function save_push_subscription(text, jsonb, text) to authenticated;

create or replace function delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;
grant execute on function delete_push_subscription(text) to authenticated;

-- chama a função de envio (nunca atrapalha o agendamento se algo falhar)
create or replace function push_dispatch(p_type text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select value into u from private_config where key = 'push_function_url';
  select value into s from private_config where key = 'push_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(
    url := u,
    body := jsonb_build_object('type', p_type) || coalesce(p_payload, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s)
  );
exception when others then
  raise warning 'push_dispatch: %', sqlerrm;
end $$;
revoke execute on function push_dispatch(text, jsonb) from public, anon, authenticated;

create or replace function trg_push_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('agendado', 'confirmado') then perform push_dispatch('appointment', jsonb_build_object('id', new.id, 'actor', auth.uid())); end if;
  return new;
end $$;
drop trigger if exists push_new_appointment on appointments;
create trigger push_new_appointment after insert on appointments for each row execute function trg_push_appointment();

create or replace function trg_push_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active then perform push_dispatch('announcement', jsonb_build_object('id', new.id)); end if;
  return new;
end $$;
drop trigger if exists push_new_announcement on announcements;
create trigger push_new_announcement after insert on announcements for each row execute function trg_push_announcement();

-- lembrete antes do atendimento (rodado a cada 5 minutos pelo agendador)
create or replace function push_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare tz text; mins int; local_now timestamp; ids text[];
begin
  select coalesce((select value from private_config where key = 'timezone'), 'America/Sao_Paulo') into tz;
  select coalesce((notify->>'reminderMinutes')::int, 15) into mins from settings where id = 'main';
  perform push_daily_summary();
  perform push_client_reminders();
  if coalesce(mins, 0) <= 0 then return 0; end if;
  local_now := (now() at time zone tz);
  with due as (
    update appointments a set reminded_at = now()
    where a.date = local_now::date and a.status in ('agendado', 'confirmado') and a.reminded_at is null
      and (a.date + a.time) >= local_now and (a.date + a.time) <= local_now + make_interval(mins => mins)
    returning a.id
  ) select array_agg(id) into ids from due;
  if ids is null then return 0; end if;
  perform push_dispatch('reminder', jsonb_build_object('ids', to_jsonb(ids)));
  return coalesce(array_length(ids, 1), 0);
end $$;
revoke execute on function push_reminders() from public, anon, authenticated;


-- =====================================================================
-- MAIS NOTIFICAÇÕES: cancelamento, remarcação, falta, confirmação,
-- atendimento concluído, avaliação, lista de espera, estoque baixo
-- e resumo da agenda de manhã. Quem fez a ação não recebe o próprio aviso
-- (a não ser que "Avisar também o que eu mesmo fiz" esteja ligado).
-- =====================================================================
create or replace function trg_push_appointment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if new.status = 'cancelado' and old.status in ('agendado', 'confirmado') then k := 'cancel';
  elsif new.status = 'faltou' and old.status <> 'faltou' then k := 'noshow';
  elsif new.status in ('agendado', 'confirmado') and old.status in ('agendado', 'confirmado')
        and (new.date <> old.date or new.time <> old.time or new.barber_id <> old.barber_id) then k := 'reschedule';
  elsif new.status = 'confirmado' and old.status = 'agendado' then k := 'confirm';
  elsif new.status in ('agendado', 'confirmado') and old.status in ('cancelado', 'faltou') then k := 'restore';
  end if;
  if k is not null then
    perform push_dispatch('change', jsonb_build_object('id', new.id, 'kind', k, 'actor', auth.uid(),
      'old_date', old.date, 'old_time', old.time, 'old_barber', old.barber_id));
  end if;
  if k = 'reschedule' then new.reminded_at := null; new.client_reminded := client_stages_passed(new.date, new.time); end if;
  return new;
end $$;
drop trigger if exists push_change_appointment on appointments;
create trigger push_change_appointment before update on appointments for each row
  when (old.status is distinct from new.status or old.date is distinct from new.date or old.time is distinct from new.time or old.barber_id is distinct from new.barber_id)
  execute function trg_push_appointment_change();

create or replace function trg_push_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform push_dispatch('sale', jsonb_build_object('id', new.id, 'actor', auth.uid())); return new; end $$;
drop trigger if exists push_new_sale on sales;
create trigger push_new_sale after insert on sales for each row execute function trg_push_sale();

create or replace function trg_push_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform push_dispatch('review', jsonb_build_object('id', new.id)); return new; end $$;
drop trigger if exists push_new_review on reviews;
create trigger push_new_review after insert on reviews for each row execute function trg_push_review();

create or replace function trg_push_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform push_dispatch('waitlist', jsonb_build_object('id', new.id, 'actor', auth.uid())); return new; end $$;
drop trigger if exists push_new_waitlist on waitlist;
create trigger push_new_waitlist after insert on waitlist for each row execute function trg_push_waitlist();

create or replace function trg_push_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int;
begin
  select coalesce((notify->>'lowStock')::int, 3) into lim from settings where id = 'main';
  lim := coalesce(lim, 3);
  if lim > 0 and new.active and new.stock <= lim and old.stock > lim then
    perform push_dispatch('stock', jsonb_build_object('id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists push_low_stock on products;
create trigger push_low_stock after update of stock on products for each row execute function trg_push_stock();

-- resumo da agenda de manhã (chamado pelo mesmo agendador dos lembretes)
create or replace function push_daily_summary() returns void
language plpgsql security definer set search_path = public as $$
declare tz text; hhmm text; local_now timestamp; last text;
begin
  select coalesce((select value from private_config where key = 'timezone'), 'America/Sao_Paulo') into tz;
  select coalesce(notify->>'summaryTime', '07:30') into hhmm from settings where id = 'main';
  if coalesce(hhmm, '') = '' then return; end if;
  local_now := (now() at time zone tz);
  if (local_now::time - hhmm::time) not between interval '0' and interval '3 hours' then return; end if;
  select value into last from private_config where key = 'summary_sent';
  if last = local_now::date::text then return; end if;
  insert into private_config(key, value) values ('summary_sent', local_now::date::text)
    on conflict (key) do update set value = excluded.value;
  perform push_dispatch('summary', jsonb_build_object('date', local_now::date));
  -- faxina diária: históricos técnicos não ocupam o espaço do banco
  begin delete from cron.job_run_details where end_time < now() - interval '3 days'; exception when others then null; end;
  begin delete from net._http_response where created < now() - interval '1 day'; exception when others then null; end;
exception when others then raise warning 'push_daily_summary: %', sqlerrm;
end $$;
revoke execute on function push_daily_summary() from public, anon, authenticated;


-- =====================================================================
-- LEMBRETES NO CELULAR DA CLIENTE (1 dia, 1 hora e 15 min antes)
-- A cliente ativa no site depois de agendar (ou em "Meus horários").
-- =====================================================================
create table if not exists client_push (
  endpoint text primary key,
  phone text not null,
  keys jsonb not null,
  user_agent text default '',
  created_at timestamptz not null default now()
);
create index if not exists client_push_phone_idx on client_push(phone);
alter table client_push enable row level security;   -- sem políticas: só as funções acessam
alter table appointments add column if not exists client_reminded int[] not null default '{}';

create or replace function save_client_push(p_endpoint text, p_keys jsonb, p_phone text, p_user_agent text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(v) < 10 or not exists(select 1 from clients where phone = v) then raise exception 'Faça um agendamento com este número primeiro'; end if;
  if coalesce(p_endpoint, '') = '' or p_keys is null then raise exception 'Aparelho inválido'; end if;
  insert into client_push(endpoint, phone, keys, user_agent) values (p_endpoint, v, p_keys, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set phone = excluded.phone, keys = excluded.keys, user_agent = excluded.user_agent;
end $$;
grant execute on function save_client_push(text, jsonb, text, text) to anon, authenticated;

-- lembretes que já "passaram" (ex.: agendou hoje para amanhã cedo → pula o de 1 dia)
create or replace function client_stages_passed(p_date date, p_time time) returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from unnest(array[1440, 60, 15]) x
  where x >= extract(epoch from ((p_date + p_time) - (now() at time zone coalesce((select value from private_config where key = 'timezone'), 'America/Sao_Paulo')))) / 60
$$;

create or replace function trg_client_reminded() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.client_reminded := client_stages_passed(new.date, new.time); return new; end $$;
drop trigger if exists client_reminded_init on appointments;
create trigger client_reminded_init before insert on appointments for each row execute function trg_client_reminded();

create or replace function push_client_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare tz text; local_now timestamp; r record;
begin
  if coalesce((select (notify->>'clientReminders')::boolean from settings where id = 'main'), true) = false then return; end if;
  select coalesce((select value from private_config where key = 'timezone'), 'America/Sao_Paulo') into tz;
  local_now := (now() at time zone tz);
  for r in
    select a.id, st.stage from appointments a
    cross join lateral (select min(x) as stage from unnest(array[1440, 60, 15]) x
                        where x >= extract(epoch from ((a.date + a.time) - local_now)) / 60) st
    where a.status in ('agendado', 'confirmado')
      and (a.date + a.time) > local_now and (a.date + a.time) <= local_now + interval '1 day'
      and st.stage is not null and not (st.stage = any(a.client_reminded))
      and exists(select 1 from client_push c where c.phone = a.client_phone)
  loop
    update appointments set client_reminded = array(select x from unnest(array[1440, 60, 15]) x where x >= r.stage) where id = r.id;
    perform push_dispatch('client_reminder', jsonb_build_object('id', r.id, 'stage', r.stage));
  end loop;
exception when others then raise warning 'push_client_reminders: %', sqlerrm;
end $$;
revoke execute on function push_client_reminders() from public, anon, authenticated;
