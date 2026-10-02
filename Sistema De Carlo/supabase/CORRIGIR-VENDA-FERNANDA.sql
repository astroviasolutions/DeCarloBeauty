-- Correção pontual: venda da Fernanda Dantas (01/10) fechada em R$160, mas ela pagou R$89.
-- Recalcula desconto, total e a comissão (proporcional) e atualiza o agendamento.
with alvo as (
  select id, subtotal from sales
  where client_name ilike 'Fernanda Dantas%' and date = '2026-10-01' and total = 160
)
update sales s set
  discount = a.subtotal - 89,
  total = 89,
  items = (select jsonb_agg(case when i->>'type' = 'extra' then i
                   else jsonb_set(i, '{commission}', to_jsonb(round((i->>'commission')::numeric * 89 / a.subtotal, 2))) end)
           from jsonb_array_elements(s.items) i),
  commission_total = round(s.commission_total * 89 / a.subtotal, 2)
from alvo a where s.id = a.id;

update appointments set total = 89
where id in (select appointment_id from sales where client_name ilike 'Fernanda Dantas%' and date = '2026-10-01' and total = 89);

-- confira: deve aparecer 1 linha com total 89
select client_name, date, subtotal, discount, total, commission_total from sales
where client_name ilike 'Fernanda Dantas%' and date = '2026-10-01';
