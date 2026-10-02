-- Serviço visível ou não no agendamento online (rode 1 vez)
alter table services add column if not exists online boolean not null default true;
