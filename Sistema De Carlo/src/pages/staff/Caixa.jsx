import { useState } from 'react'
import { Lock, RotateCcw, Unlock, Receipt } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Button, Card, Empty, Field, Modal } from '../../components/ui'
import Checkout from '../../components/Checkout'
import { AppointmentModal, ApptRow } from '../../components/Appointments'
import { money, PAYMENTS, sum, today, canCharge } from '../../lib/utils'

export default function Caixa() {
  const { data, session } = useStore()
  if (!canCharge(data?.settings, session)) return <div className="empty"><strong>Cobrança liberada só para a gestão</strong><p>Se precisar, a dona pode liberar em Ajustes → Privacidade.</p></div>
  return <CaixaInner />
}

function CaixaInner() {
  const { data, session, actions } = useStore()
  const isAdmin = session.role === 'admin'
  const [sel, setSel] = useState(null)
  const [closing, setClosing] = useState(false)
  const [counted, setCounted] = useState('')
  const [opening, setOpening] = useState('150')
  const [k, setK] = useState(0)
  const t = today()

  const session0 = data.cash.find((c) => !c.closedAt)
  const salesToday = data.sales.filter((s) => s.date === t && (isAdmin || s.barberId === session.barberId)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const byPay = Object.keys(PAYMENTS).map((p) => ({ p, v: sum(salesToday.filter((s) => s.payment === p), (s) => s.total) }))
  const cashIn = byPay.find((x) => x.p === 'dinheiro').v
  const toCharge = data.appointments.filter((a) => a.date === t && ['agendado', 'confirmado'].includes(a.status) && (isAdmin || a.barberId === session.barberId)).sort((a, b) => a.time.localeCompare(b.time))

  const openCash = () => actions.upsert('cash', { openedAt: new Date().toISOString(), openingAmount: Number(opening) || 0, closedAt: null, closingAmount: null, note: '' }, 'Caixa aberto')
  const closeCash = async () => {
    await actions.upsert('cash', { ...session0, closedAt: new Date().toISOString(), closingAmount: Number(String(counted).replace(',', '.')) || 0 }, 'Caixa fechado')
    setClosing(false); setCounted('')
  }
  const expected = (session0?.openingAmount || 0) + cashIn

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">PDV</p>
          <h1 className="page-title">{isAdmin ? 'Caixa' : 'Cobrar atendimento'}</h1>
        </div>
        {isAdmin && (
          <div className="cash-state">
            {session0 ? (
              <>
                <span className="badge badge-good"><Unlock size={13} /> Aberto às {new Date(session0.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <Button variant="ghost" size="sm" icon={Lock} onClick={() => setClosing(true)}>Fechar caixa</Button>
              </>
            ) : (
              <>
                <span className="badge badge-bad"><Lock size={13} /> Fechado</span>
                <input className="mini-input" value={opening} onChange={(e) => setOpening(e.target.value)} aria-label="Fundo de troco" />
                <Button size="sm" icon={Unlock} onClick={openCash}>Abrir caixa</Button>
              </>
            )}
          </div>
        )}
      </div>

      {toCharge.length > 0 && (
        <Card title="Atendimentos de hoje para cobrar" pad={false} className="mb">
          <div className="list horiz">{toCharge.map((a) => <ApptRow key={a.id} a={a} onClick={() => setSel(a)} showBarber={isAdmin} />)}</div>
        </Card>
      )}

      <Checkout key={k} presetBarberId={isAdmin ? undefined : session.barberId} lockBarber={!isAdmin} onDone={() => setK(k + 1)} />

      <div className="grid-2 mt-lg">
        <Card title={`Vendas de hoje · ${money(sum(salesToday, (s) => s.total))}`} pad={false}>
          {salesToday.length ? (
            <div className="list">
              {salesToday.map((s) => {
                const b = data.barbers.find((x) => x.id === s.barberId)
                return (
                  <div key={s.id} className="sale-row">
                    <span className="appt-time">{s.time}</span>
                    <span className="appt-info"><b>{s.clientName}</b><small>{s.items.map((i) => `${i.qty > 1 ? i.qty + 'x ' : ''}${i.name}`).join(', ')} · {b?.name.split(' ')[0]} · {PAYMENTS[s.payment]}</small></span>
                    <b>{money(s.total)}</b>
                    {isAdmin && <button className="icon-btn sm" title="Estornar venda" onClick={async () => (await actions.confirm(`Estornar a venda de ${money(s.total)} para ${s.clientName}? O estoque volta e a comissão é removida.`, 'Estornar')) && actions.deleteSale(s.id)}><RotateCcw size={15} /></button>}
                  </div>
                )
              })}
            </div>
          ) : <Empty icon={Receipt} title="Nenhuma venda ainda hoje" text="As vendas finalizadas aparecem aqui." />}
        </Card>
        <Card title="Entradas por forma de pagamento">
          <div className="pay-sum">
            {byPay.map(({ p, v }) => <div key={p}><span>{PAYMENTS[p]}</span><b>{money(v)}</b></div>)}
            {isAdmin && session0 && <div className="exp"><span>Dinheiro esperado na gaveta</span><b>{money(expected)}</b></div>}
          </div>
        </Card>
      </div>

      {sel && <AppointmentModal appt={sel} onClose={() => setSel(null)} />}
      <Modal open={closing} onClose={() => setClosing(false)} title="Fechar caixa" footer={<Button block icon={Lock} onClick={closeCash}>Confirmar fechamento</Button>}>
        <div className="pay-sum">
          <div><span>Fundo de troco</span><b>{money(session0?.openingAmount)}</b></div>
          <div><span>Entradas em dinheiro</span><b>{money(cashIn)}</b></div>
          <div className="exp"><span>Esperado na gaveta</span><b>{money(expected)}</b></div>
        </div>
        <Field label="Valor contado na gaveta (R$)" hint={counted ? `Diferença: ${money((Number(String(counted).replace(',', '.')) || 0) - expected)}` : ''}>
          <input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" />
        </Field>
      </Modal>
    </div>
  )
}
