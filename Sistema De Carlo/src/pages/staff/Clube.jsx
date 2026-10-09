import { useState } from 'react'
import { Check, Crown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Badge, Button, Card, Field, Modal, Price, Stat } from '../../components/ui'
import { clubOf } from '../../lib/loyalty'
import { cls, fmtDate, fmtPhone, money, onlyDigits, sum, today, waLink, parseMoney } from '../../lib/utils'
import { msg as fillMsg } from '../../lib/messages'

export default function Clube() {
  const { data, actions } = useStore()
  const [editPlan, setEditPlan] = useState(null)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [pick, setPick] = useState({ clientId: '', planId: '' })
  const month = today().slice(0, 7)
  const subs = data.subscriptions.filter((s) => s.status === 'ativo')
  const priceOf = (id) => Number(data.plans.find((p) => p.id === id)?.price || 0)
  const mrr = sum(subs, (s) => priceOf(s.planId))
  const paid = subs.filter((s) => (s.paidMonths || []).includes(month))

  const togglePaid = (s) => {
    const has = (s.paidMonths || []).includes(month)
    actions.upsert('subscriptions', { ...s, paidMonths: has ? s.paidMonths.filter((m) => m !== month) : [...(s.paidMonths || []), month] }, has ? 'Pagamento desmarcado' : 'Mensalidade recebida')
  }
  const savePlan = async () => {
    await actions.upsert('plans', { ...editPlan, price: parseMoney(editPlan.price), limit: editPlan.limit === '' || editPlan.limit == null ? null : Number(editPlan.limit), productDiscount: Number(editPlan.productDiscount || 0) })
    setEditPlan(null)
  }
  const addSub = async () => {
    await actions.upsert('subscriptions', { clientId: pick.clientId, planId: pick.planId, status: 'ativo', startedAt: today(), paidMonths: [month] }, 'Assinante adicionado ao Clube')
    setAdding(false); setPick({ clientId: '', planId: '' }); setQ('')
  }
  const matches = q.length >= 2 ? data.clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || onlyDigits(c.phone).includes(onlyDigits(q) || '###')).slice(0, 6) : []

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Receita recorrente</p><h1 className="page-title">Clube de assinatura</h1></div>
        <div className="head-actions">
          <Button variant="ghost" icon={Plus} onClick={() => setEditPlan({ name: '', price: '', description: '', serviceIds: [], limit: '', productDiscount: 0, active: true, order: data.plans.length + 1 })}>Novo plano</Button>
          <Button icon={Plus} onClick={() => setAdding(true)}>Novo assinante</Button>
        </div>
      </div>
      <div className="stats">
        <Stat accent label="Receita mensal (MRR)" value={money(mrr)} sub={`${subs.length} assinantes ativos`} icon={Crown} />
        <Stat label="Recebido este mês" value={money(sum(paid, (s) => priceOf(s.planId)))} sub={`${paid.length} pagos`} />
        <Stat label="A receber" value={money(mrr - sum(paid, (s) => priceOf(s.planId)))} sub={`${subs.length - paid.length} pendentes`} />
        <Stat label="Ticket do clube" value={money(subs.length ? mrr / subs.length : 0)} sub="por assinante" />
      </div>

      <div className="cards plans-admin mt">
        {data.plans.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => (
          <div key={p.id} className={cls('plan', 'admin', p.featured && 'featured', !p.active && 'inactive')}>
            <Crown size={20} className="plan-ico" />
            <h3>{p.name}</h3>
            <div className="plan-price"><Price v={p.price} /><small>/mês</small></div>
            <p className="plan-desc">{p.description}</p>
            <small className="muted">{subs.filter((s) => s.planId === p.id).length} assinantes · {p.limit == null ? 'ilimitado' : `${p.limit}/mês`}</small>
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditPlan({ ...p, limit: p.limit ?? '' })}>Editar</Button>
          </div>
        ))}
      </div>

      <Card title="Assinantes" pad={false} className="mt">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Desde</th><th className="r">Uso no mês</th><th>Mensalidade</th><th /></tr></thead>
            <tbody>
              {data.subscriptions.slice().sort((a, b) => a.status.localeCompare(b.status)).map((s) => {
                const c = data.clients.find((x) => x.id === s.clientId)
                const info = clubOf(s.clientId, data)
                const plan = data.plans.find((p) => p.id === s.planId)
                const isPaid = (s.paidMonths || []).includes(month)
                const msg = fillMsg(data.settings, 'clubCharge', { nome: c?.name.split(' ')[0], plano: plan?.name, valor: money(plan?.price) })
                return (
                  <tr key={s.id} className={s.status !== 'ativo' ? 'row-off' : ''}>
                    <td><b>{c?.name || 'Cliente'}</b><small>{fmtPhone(c?.phone)}</small></td>
                    <td>{plan?.name}<small>{money(plan?.price)}/mês</small></td>
                    <td>{fmtDate(s.startedAt)}</td>
                    <td className="r">{s.status === 'ativo' ? (info ? `${info.used}${plan?.limit != null ? `/${plan.limit}` : ''}` : '—') : '—'}</td>
                    <td>{s.status !== 'ativo' ? <Badge>Cancelado</Badge> : isPaid ? <Badge tone="good">Pago</Badge> : <Badge tone="warn">Pendente</Badge>}</td>
                    <td className="r nowrap">
                      {s.status === 'ativo' && !isPaid && <a className="btn btn-ghost btn-sm" href={waLink(c?.phone, msg)} target="_blank" rel="noreferrer">Cobrar</a>}
                      {s.status === 'ativo' && <Button size="sm" variant={isPaid ? 'ghost' : 'primary'} icon={Check} onClick={() => togglePaid(s)}>{isPaid ? 'Desfazer' : 'Recebido'}</Button>}
                      {s.status === 'ativo'
                        ? <button className="icon-btn sm" title="Cancelar assinatura" onClick={async () => (await actions.confirm(`Cancelar a assinatura de ${c?.name}?`, 'Cancelar assinatura')) && actions.upsert('subscriptions', { ...s, status: 'cancelado' }, 'Assinatura cancelada')}><Trash2 size={15} /></button>
                        : <Button size="sm" variant="ghost" onClick={() => actions.upsert('subscriptions', { ...s, status: 'ativo' }, 'Assinatura reativada')}>Reativar</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="muted small mt">No caixa, o benefício do Clube aparece sozinho quando o cliente assinante é selecionado. A profissional recebe a comissão normal.</p>

      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title={editPlan?.id ? 'Editar plano' : 'Novo plano'} footer={
        <div className="foot-row">
          {editPlan?.id && <Button variant="danger" icon={Trash2} onClick={async () => { if (await actions.confirm(`Excluir o plano ${editPlan.name}?`, 'Excluir')) { await actions.remove('plans', editPlan.id); setEditPlan(null) } }}>Excluir</Button>}
          <Button onClick={savePlan} disabled={!editPlan?.name || !editPlan?.price}>Salvar</Button>
        </div>
      }>
        {editPlan && (
          <div className="form-grid">
            <Field label="Nome do plano"><input value={editPlan.name} onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })} placeholder="Ex.: Signature" /></Field>
            <Field label="Preço mensal (R$)"><input inputMode="decimal" value={editPlan.price} onChange={(e) => setEditPlan({ ...editPlan, price: e.target.value })} /></Field>
            <Field label="Descrição" className="span-2"><input value={editPlan.description} onChange={(e) => setEditPlan({ ...editPlan, description: e.target.value })} placeholder="Ex.: Sessões ilimitados + barba" /></Field>
            <Field label="Atendimentos por mês" hint="Vazio = ilimitado"><input inputMode="numeric" value={editPlan.limit} onChange={(e) => setEditPlan({ ...editPlan, limit: e.target.value })} /></Field>
            <Field label="Desconto em produtos (%)"><input inputMode="numeric" value={editPlan.productDiscount} onChange={(e) => setEditPlan({ ...editPlan, productDiscount: e.target.value })} /></Field>
            <Field label="Serviços incluídos" className="span-2">
              <div className="days">{data.services.filter((s) => s.active).map((s) => (
                <button key={s.id} type="button" className={cls('pill', editPlan.serviceIds.includes(s.id) && 'on')} onClick={() => setEditPlan({ ...editPlan, serviceIds: editPlan.serviceIds.includes(s.id) ? editPlan.serviceIds.filter((x) => x !== s.id) : [...editPlan.serviceIds, s.id] })}>{s.name}</button>
              ))}</div>
            </Field>
            <Field label="Destaque"><select value={editPlan.featured ? '1' : '0'} onChange={(e) => setEditPlan({ ...editPlan, featured: e.target.value === '1' })}><option value="0">Não</option><option value="1">Mais escolhido</option></select></Field>
            <Field label="Status"><select value={editPlan.active ? '1' : '0'} onChange={(e) => setEditPlan({ ...editPlan, active: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Oculto</option></select></Field>
          </div>
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Novo assinante" footer={<Button block disabled={!pick.clientId || !pick.planId} onClick={addSub}>Adicionar ao Clube</Button>}>
        <Field label="Cliente">
          {pick.clientId ? (
            <div className="locked">{data.clients.find((c) => c.id === pick.clientId)?.name}<button className="link" onClick={() => setPick({ ...pick, clientId: '' })}>trocar</button></div>
          ) : (
            <div className="client-pick">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou telefone" />
              {matches.length > 0 && <div className="suggest">{matches.map((c) => <button key={c.id} onClick={() => setPick({ ...pick, clientId: c.id })}>{c.name} <small>{fmtPhone(c.phone)}</small></button>)}</div>}
            </div>
          )}
        </Field>
        <Field label="Plano" className="mt">
          <div className="days">{data.plans.filter((p) => p.active).map((p) => <button key={p.id} type="button" className={cls('pill', pick.planId === p.id && 'on')} onClick={() => setPick({ ...pick, planId: p.id })}>{p.name} · {money(p.price)}</button>)}</div>
        </Field>
        <p className="muted small mt">A mensalidade deste mês já entra como recebida.</p>
      </Modal>
    </div>
  )
}
