-- Ajustar valor de uma venda já fechada (desconto esquecido, forma de pagamento errada)
create or replace function adjust_sale(p_id text, p_items jsonb, p_discount numeric, p_total numeric, p_commission_total numeric, p_payment text)
returns void language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  if not is_admin() then raise exception 'Somente a gestão pode ajustar vendas'; end if;
  select * into s from sales where id = p_id; if not found then raise exception 'Venda não encontrada'; end if;
  update sales set items = p_items, discount = p_discount, total = p_total, commission_total = p_commission_total, payment = coalesce(p_payment, payment) where id = p_id;
  if s.appointment_id is not null then update appointments set total = p_total where id = s.appointment_id; end if;
end $$;
grant execute on function adjust_sale(text, jsonb, numeric, numeric, numeric, text) to authenticated;
