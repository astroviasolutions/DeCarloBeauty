-- Desconto/adicional: o valor cobrado no caixa passa a aparecer no agendamento (rode 1 vez)
create or replace function create_sale(p_sale jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; it jsonb;
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  if not is_admin() and (p_sale->>'barber_id') is distinct from my_barber_id() then raise exception 'Você só pode lançar vendas suas'; end if;
  if not is_admin() and not coalesce((select (privacy->'billingAllowed') ? my_barber_id() from settings where id = 'main'), false) then raise exception 'Cobrança liberada só para a gestão'; end if;
  -- trava contra cobrança em dobro (duplo toque, dois aparelhos)
  if nullif(p_sale->>'appointment_id','') is not null then
    perform pg_advisory_xact_lock(hashtext('sale' || (p_sale->>'appointment_id')));
    if exists(select 1 from sales where appointment_id = p_sale->>'appointment_id') then raise exception 'Esse atendimento já foi cobrado. Veja em Caixa → Vendas.'; end if;
  end if;
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
    update appointments set status = 'concluido', sale_id = v_id, total = (p_sale->>'total')::numeric where id = p_sale->>'appointment_id';
  end if;
  return v_id;
end $$;
grant execute on function create_sale(jsonb) to authenticated;

-- corrige os atendimentos já cobrados que ainda mostram o preço cheio
update appointments a set total = s.total
from sales s
where s.appointment_id = a.id and a.total is distinct from s.total
  and (select count(*) from sales x where x.appointment_id = a.id) = 1;
