import { useState } from 'react'
import { Gift, Lock, Pencil, RotateCcw, Unlock, Receipt } from 'lucide-react'
import GiftCard from '../../components/GiftCard'
import { payParts } from '../../lib/cardFees'
import { saleCreditEffects, saveCredit } from '../../lib/credit'
import { useStore } from '../../state/Store'
import { Button, Card, Empty, Field, Modal, useLimit } from '../../components/ui'
import Checkout from '../../components/Checkout'
import { increaseLabel } from '../../components/ItemIncrease'
import { AppointmentModal, ApptRow } from '../../components/Appointments'
import { money, PAYMENTS, sum, today, canCharge, fmtDate, parseMoney, payLabel, isDesk, deskCan } from '../../lib/utils'
import { adjustSale } from '../../lib/commission'

export default function Caixa() {
  const { data, session } = useStore()
  if (!canCharge(data?.settings, session)) return <div className="empty"><strong>Cobrança liberada só para a gestão</strong><p>Se precisar, a dona pode liberar em Ajustes → Privacidade.</p></div>
  return <CaixaInner />
}

function CaixaInner() {
  const { data, session, actions } = useStore()
  const isAdmin = session.role === 'admin'
  // recepção: o que a gestão liberou em Ajustes → Recepção (gestão sempre pode)
  const canRefund = deskCan(data.settings, session, 'refund') // estornar/ajustar venda
  const canCash = deskCan(data.settings, session, 'cash') // abrir/fechar caixa
  const showTotals = session.role !== 'reception' || deskCan(data.settings, session, 'cashTotals')
  const desk = isDesk(session) // gestão ou recepção: todas as profissionais, abrir/fechar caixa
  const [sel, setSel] = useState(null)
  const [closing, setClosing] = useState(false)
  const [counted, setCounted] = useState('')
  const [opening, setOpening] = useState('150')
  const [k, setK] = useState(0)
  const t = today()
  const [day, setDay] = useState(t)
  const [adj, setAdj] = useState(null)
  const [gift, setGift] = useState(false)
  const [conf, setConf] = useState({}) // fechamento: valor conferido no extrato/maquininha por forma

  const session0 = data.cash.find((c) => !c.closedAt)
  const salesToday = data.sales.filter((s) => s.date === (desk ? day : t) && (desk || s.barberId === session.barberId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  // pagamento dividido ("pix R$ 50 + dinheiro R$ 50") entra em cada forma pelo seu valor; antes ficava de fora
  const { visible: visibleSales, more: moreSales } = useLimit(salesToday, 20, 'vendas')
  const parts = salesToday.flatMap((s) => payParts(s, PAYMENTS))
  const byPay = Object.keys(PAYMENTS).map((p) => ({ p, v: sum(parts.filter((x) => x.p === p), (x) => x.v) }))
  const fiadoHoje = sum(parts.filter((x) => x.p === 'fiado'), (x) => x.v)
  // fiado recebido no dia (Relatórios → Clientes devendo): entra na gaveta/conferência, não no faturamento
  const recs = (data.recebimentos || []).filter((r) => r.date === (desk ? day : t))
  const recBy = (p) => sum(recs.filter((r) => r.payment === p), (r) => Number(r.amount || 0))
  const sysOf = (p) => (byPay.find((x) => x.p === p)?.v || 0) + recBy(p)
  const cashIn = byPay.find((x) => x.p === 'dinheiro').v
  const toCharge = data.appointments.filter((a) => a.date === t && ['agendado', 'confirmado'].includes(a.status) && (desk || a.barberId === session.barberId)).sort((a, b) => a.time.localeCompare(b.time))

  const openCash = () => actions.upsert('cash', { openedAt: new Date().toISOString(), openingAmount: Number(opening) || 0, closedAt: null, closingAmount: null, note: '' }, 'Caixa aberto')
  const closeCash = async () => {
    // conferência das outras formas fica registrada na observação do caixa
    const note = ['pix', 'debito', 'credito'].filter((k) => conf[k] !== undefined && conf[k] !== '').map((k) => { const sys = sysOf(k); const got = parseMoney(conf[k]); return `${PAYMENTS[k]}: sistema ${money(sys)} · conferido ${money(got)} · diferença ${money(got - sys)}` }).join(' | ')
    await actions.upsert('cash', { ...session0, closedAt: new Date().toISOString(), closingAmount: parseMoney(counted), note: [session0.note, note].filter(Boolean).join(' | ') }, 'Caixa fechado')
    setClosing(false); setCounted(''); setConf({})
  }
  const expected = (session0?.openingAmount || 0) + cashIn + recBy('dinheiro')

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">PDV</p>
          <h1 className="page-title">{desk ? 'Caixa' : 'Cobrar atendimento'}</h1>
        </div>
        {desk && (
          <div className="cash-state">
            <Button variant="ghost" size="sm" icon={Gift} onClick={() => setGift(true)}>Vale-presente</Button>
            {session0 ? (
              <>
                <span className="badge badge-good"><Unlock size={13} /> Aberto às {new Date(session0.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {canCash && <Button variant="ghost" size="sm" icon={Lock} onClick={() => setClosing(true)}>Fechar caixa</Button>}
              </>
            ) : (
              <>
                <span className="badge badge-bad"><Lock size={13} /> Fechado</span>
                {canCash && <><input className="mini-input" value={opening} onChange={(e) => setOpening(e.target.value)} aria-label="Fundo de troco" />
                <Button size="sm" icon={Unlock} onClick={openCash}>Abrir caixa</Button></>}
              </>
            )}
          </div>
        )}
      </div>

      {toCharge.length > 0 && (
        <Card title="Atendimentos de hoje para cobrar" pad={false} className="mb">
          <div className="list horiz">{toCharge.map((a) => <ApptRow key={a.id} a={a} onClick={() => setSel(a)} showBarber={desk} />)}</div>
        </Card>
      )}

      <Checkout key={k} presetBarberId={desk ? undefined : session.barberId} lockBarber={!desk} onDone={() => setK(k + 1)} />

      <div className="grid-2 mt-lg">
        <Card title={`Vendas ${day === t ? 'de hoje' : `de ${fmtDate(day)}`}${showTotals ? ` · ${money(sum(salesToday, (s) => s.total))}` : ''}`} pad={false} action={desk ? <input type="date" className="mini-input" value={day} max={t} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Dia das vendas" /> : null}>
          {salesToday.length ? (
            <div className="list">
              {visibleSales.map((s) => {
                const b = data.barbers.find((x) => x.id === s.barberId)
                return (
                  <div key={s.id} className="sale-row">
                    <span className="appt-time">{s.time}</span>
                    <span className="appt-info"><b>{s.clientName}</b><small>{s.items.filter((i) => i.type !== 'supply').map((i) => `${i.qty > 1 ? i.qty + 'x ' : ''}${i.name}${increaseLabel(i) ? ` (${increaseLabel(i)})` : ''}`).join(', ')} · {b?.name.split(' ')[0]} · {payLabel(s)}</small></span>
                    <b>{money(s.total)}</b>
                    {canRefund && <button className="icon-btn sm" title="Ajustar valor ou desconto" onClick={() => setAdj({ s, final: String(s.total).replace('.', ','), payment: s.payment })}><Pencil size={15} /></button>}
                    {canRefund && <button className="icon-btn sm" title="Estornar venda" onClick={async () => {
                      // estorno também desfaz fiado, saldo usado e crédito/vale vendido
                      const eff = saleCreditEffects(s, data.clients, PAYMENTS, payParts)
                      const extra = eff.map((x) => `${x.client.name}: saldo ${x.delta > 0 ? '+' : ''}${money(x.delta)}`).join('; ')
                      if (!(await actions.confirm(`Estornar a venda de ${money(s.total)} para ${s.clientName}? O estoque volta e a comissão é removida.${extra ? ` Saldo ajustado: ${extra}.` : ''}`, 'Estornar'))) return
                      await actions.deleteSale(s.id)
                      for (const x of eff) await saveCredit(actions, x.client, Number(x.client.credit || 0) + x.delta, null)
                    }}><RotateCcw size={15} /></button>}
                  </div>
                )
              })}
              {moreSales}
            </div>
          ) : <Empty icon={Receipt} title={day === t ? 'Nenhuma venda ainda hoje' : 'Nenhuma venda neste dia'} text="Para vender: escolha a profissional, a cliente e toque nos serviços ou produtos ao lado. Atendimentos de hoje também podem ser cobrados no topo." />}
        </Card>
        {showTotals && <Card title="Entradas por forma de pagamento">
          <div className="pay-sum">
            {byPay.map(({ p, v }) => <div key={p}><span>{PAYMENTS[p]}</span><b>{money(v)}</b></div>)}
            {fiadoHoje > 0 && <div><span>Ficou a pagar (fiado)</span><b>{money(fiadoHoje)}</b></div>}
            {recs.length > 0 && <div><span>Fiado recebido ({[...new Set(recs.map((r) => PAYMENTS[r.payment] || r.payment))].join(', ')})</span><b>{money(sum(recs, (r) => Number(r.amount || 0)))}</b></div>}
            {desk && session0 && <div className="exp"><span>Dinheiro esperado na gaveta</span><b>{money(expected)}</b></div>}
          </div>
        </Card>}
      </div>

      {sel && <AppointmentModal appt={sel} onClose={() => setSel(null)} />}
      {gift && <GiftCard onClose={() => setGift(false)} />}
      <Modal open={closing} onClose={() => setClosing(false)} title="Fechar caixa" footer={<Button block icon={Lock} onClick={closeCash}>Confirmar fechamento</Button>}>
        {!showTotals && <p className="muted small mb-sm">Conte o dinheiro da gaveta e digite abaixo. A gestão confere a diferença.</p>}
        {showTotals && <div className="pay-sum">
          <div><span>Fundo de troco</span><b>{money(session0?.openingAmount)}</b></div>
          <div><span>Entradas em dinheiro</span><b>{money(cashIn)}</b></div>
          {recBy('dinheiro') > 0 && <div><span>Fiado recebido em dinheiro</span><b>{money(recBy('dinheiro'))}</b></div>}
          <div className="exp"><span>Esperado na gaveta</span><b>{money(expected)}</b></div>
        </div>}
        <Field label="Valor contado na gaveta (R$)" hint={counted && showTotals ? `Diferença: ${money(parseMoney(counted) - expected)}` : ''}>
          <input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" />
        </Field>
        <h4 className="sub-title mt">Conferir as outras formas (opcional)</h4>
        <p className="muted small">Digite o que aparece no extrato do banco / relatório da maquininha. A diferença fica registrada no fechamento.</p>
        <div className="form-grid">
          {['pix', 'debito', 'credito'].map((k) => {
            const sys = sysOf(k)
            const has = conf[k] !== undefined && conf[k] !== ''
            const dif = parseMoney(conf[k]) - sys
            return <Field key={k} label={showTotals ? `${PAYMENTS[k]} · sistema ${money(sys)}` : PAYMENTS[k]} hint={has && showTotals ? (Math.abs(dif) < 0.01 ? 'Confere ✓' : `Diferença: ${money(dif)}`) : ''}><input inputMode="decimal" value={conf[k] ?? ''} onChange={(e) => setConf({ ...conf, [k]: e.target.value })} placeholder={showTotals ? money(sys) : '0,00'} /></Field>
          })}
        </div>
      </Modal>
      {adj && (() => {
        const subtotal = adj.s.items.reduce((a, x) => a + Number(x.price) * Number(x.qty), 0)
        const final = Number(String(adj.final).replace(/\./g, '').replace(',', '.')) || 0
        const r = adjustSale(adj.s, subtotal - final, data.settings.privacy?.commission || {})
        const b = data.barbers.find((x) => x.id === adj.s.barberId)
        return (
          <Modal open onClose={() => setAdj(null)} title="Ajustar venda" footer={<Button block disabled={final <= 0 || final > subtotal} onClick={async () => { await actions.adjustSale(adj.s.id, r, adj.payment); setAdj(null) }}>Salvar ajuste</Button>}>
            <p className="muted small">{adj.s.clientName} · {fmtDate(adj.s.date)} {adj.s.time} · {adj.s.items.map((i) => i.name).join(', ')}</p>
            <div className="form-grid">
              <Field label="Valor cheio"><input value={money(subtotal)} disabled /></Field>
              <Field label="Valor que a cliente pagou (R$)" hint="O desconto é calculado sozinho"><input inputMode="decimal" autoFocus value={adj.final} onChange={(e) => setAdj({ ...adj, final: e.target.value.replace(/[^\d,.]/g, '') })} /></Field>
              <Field label="Forma de pagamento" className="span-2"><select value={adj.payment} onChange={(e) => setAdj({ ...adj, payment: e.target.value })}>{Object.entries(PAYMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
            <div className="ov-box mt">
              <p>Desconto: <b>{money(r.discount)}</b> · Total: <b>{money(r.total)}</b></p>
              {isAdmin && <p>Comissão de {b?.name.split(' ')[0]}: <s className="muted">{money(adj.s.commissionTotal)}</s> → <b>{money(r.commissionTotal)}</b></p>}
              <p className="muted small">O financeiro, as comissões e o relatório já usam o valor novo. Se a comissão já foi paga, confira o acerto dela.</p>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}