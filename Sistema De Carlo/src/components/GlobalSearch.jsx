import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CornerDownLeft, Package, Search, Sparkles, Users, X, Compass } from 'lucide-react'
import { useStore } from '../state/Store'
import { AppointmentModal, serviceNames } from './Appointments'
import { ClientModal } from '../pages/staff/Cadastros'
import { norm } from './CatalogFilter'
import { cls, fmtDate, fmtPhone, money, onlyDigits, today } from '../lib/utils'

/** Telas do painel + palavras que levam até elas ("boleto" → Lucro real) */
const PAGES = [
  { to: '/painel/inicio', label: 'Início', keys: 'inicio dashboard avisos resumo hoje' },
  { to: '/painel/agenda', label: 'Agenda', keys: 'agenda agendar horario encaixe comandas abertas bloqueio' },
  { to: '/painel/caixa', label: 'Caixa', keys: 'caixa cobrar venda vender comanda receber pagamento' },
  { to: '/painel/comissoes', label: 'Comissões', keys: 'comissoes comissao pagar profissional adiantamento vale extrato' },
  { to: '/painel/clientes', label: 'Clientes', keys: 'clientes ficha anamnese prontuario campanha sumidos' },
  { to: '/painel/financeiro', label: 'Lucro real (despesas e boletos)', keys: 'lucro real financeiro despesas despesa boleto boletos parcela contas aluguel' },
  { to: '/painel/catalogo', label: 'Catálogo (serviços e produtos)', keys: 'catalogo servicos produtos preco estoque entrada de estoque categoria' },
  { to: '/painel/relatorios', label: 'Relatórios (clientes devendo)', keys: 'relatorios devendo dividas fiado devedores faturamento' },
  { to: '/painel/equipe', label: 'Equipe', keys: 'equipe profissionais metas horarios folgas' },
  { to: '/painel/clube', label: 'Clube de assinatura', keys: 'clube assinatura planos mensalidade' },
  { to: '/painel/avisos', label: 'Avisos', keys: 'avisos recados equipe' },
  { to: '/painel/config', label: 'Ajustes', keys: 'ajustes configuracoes config backup importar mensagens' },
]

/** Busca geral do painel: clientes, agendamentos, serviços, produtos e telas. Abre com Ctrl+K. */
export default function GlobalSearch() {
  const { data } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const [client, setClient] = useState(null)
  const [appt, setAppt] = useState(null)
  const input = useRef(null)

  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) } }
    const ev = () => setOpen(true)
    window.addEventListener('keydown', k); window.addEventListener('open-search', ev)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('open-search', ev) }
  }, [])
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 30) } }, [open])
  // trocou de tela: fecha o que a busca abriu
  const { pathname } = useLocation()
  useEffect(() => { setClient(null); setAppt(null); setOpen(false) }, [pathname])

  const groups = useMemo(() => {
    const t = norm(q), dig = onlyDigits(q), d = today()
    if (!t) return [{ title: 'Ir para', icon: Compass, items: PAGES.map((p) => ({ k: p.to, label: p.label, go: () => nav(p.to) })) }]
    const hit = (s) => norm(s).includes(t)
    const clients = data.clients.filter((c) => hit(c.name) || (dig.length >= 3 && onlyDigits(c.phone).includes(dig))).slice(0, 6)
      .map((c) => ({ k: c.id, label: c.name, sub: [fmtPhone(c.phone), Number(c.credit) < 0 ? `deve ${money(-c.credit)}` : Number(c.credit) > 0 ? `crédito ${money(c.credit)}` : ''].filter(Boolean).join(' · '), go: () => setClient(c) }))
    const appts = data.appointments.filter((a) => a.status !== 'cancelado' && (hit(a.clientName || '') || hit(serviceNames(a, data.services))))
      .sort((a, b) => { const fa = a.date >= d, fb = b.date >= d; return fa !== fb ? (fa ? -1 : 1) : fa ? (a.date + a.time).localeCompare(b.date + b.time) : (b.date + b.time).localeCompare(a.date + a.time) }).slice(0, 6)
      .map((a) => ({ k: a.id, label: `${fmtDate(a.date)} ${a.time} · ${a.clientName}`, sub: `${serviceNames(a, data.services)} · ${data.barbers.find((b) => b.id === a.barberId)?.name || ''}${a.date >= d ? '' : ' · passado'}`, go: () => setAppt(a) }))
    const svcs = data.services.filter((s) => hit(s.name) || hit(s.category || '')).slice(0, 4)
      .map((s) => ({ k: s.id, label: s.name, sub: `${money(s.price)} · ${s.duration} min${s.active ? '' : ' · inativo'}`, go: () => nav(`/painel/catalogo?tab=services&q=${encodeURIComponent(s.name)}`) }))
    const prods = data.products.filter((p) => hit(p.name) || hit(p.category || '')).slice(0, 4)
      .map((p) => ({ k: p.id, label: p.name, sub: `${money(p.price)} · estoque ${p.stock}`, go: () => nav(`/painel/catalogo?tab=products&q=${encodeURIComponent(p.name)}`) }))
    const pages = PAGES.filter((p) => norm(`${p.label} ${p.keys}`).includes(t)).slice(0, 4).map((p) => ({ k: p.to, label: p.label, go: () => nav(p.to) }))
    return [
      { title: 'Clientes', icon: Users, items: clients },
      { title: 'Agendamentos', icon: CalendarDays, items: appts },
      { title: 'Serviços', icon: Sparkles, items: svcs },
      { title: 'Produtos', icon: Package, items: prods },
      { title: 'Telas', icon: Compass, items: pages },
    ].filter((g) => g.items.length)
  }, [q, data, nav])
  const flat = groups.flatMap((g) => g.items)
  const pick = (it) => { if (!it) return; setOpen(false); it.go() }
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(flat.length - 1, x + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[i]) }
    else if (e.key === 'Escape') setOpen(false)
  }
  let n = -1

  return (
    <>
      {open && (
        <div className="gs-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="gs" role="dialog" aria-modal="true" aria-label="Buscar no sistema">
            <div className="gs-bar">
              <Search size={18} />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} onKeyDown={key} placeholder="Buscar cliente, telefone, agendamento, serviço, produto ou tela…" />
              <button type="button" className="icon-btn sm" aria-label="Fechar" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <div className="gs-list">
              {groups.map((g) => (
                <div key={g.title} className="gs-group">
                  <p className="gs-title"><g.icon size={13} /> {g.title}</p>
                  {g.items.map((it) => { n += 1; const me = n; return (
                    <button key={it.k} type="button" className={cls('gs-item', me === i && 'on')} onMouseEnter={() => setI(me)} onClick={() => pick(it)}>
                      <span><b>{it.label}</b>{it.sub && <small>{it.sub}</small>}</span>
                      {me === i && <CornerDownLeft size={14} />}
                    </button>
                  ) })}
                </div>
              ))}
              {!flat.length && <p className="muted small gs-empty">Nada encontrado para “{q}”. Tente parte do nome, o telefone ou o nome do serviço.</p>}
            </div>
            <p className="gs-foot muted small">↑ ↓ para escolher · Enter abre · Esc fecha · Atalho: Ctrl+K</p>
          </div>
        </div>
      )}
      {client && <ClientModal c={client} onClose={() => setClient(null)} />}
      {appt && <AppointmentModal appt={appt} onClose={() => setAppt(null)} />}
    </>
  )
}

/** Botão que abre a busca (menu lateral e topo no celular) */
export function SearchButton({ compact }) {
  return compact
    ? <button type="button" className="icon-btn" aria-label="Buscar" onClick={() => window.dispatchEvent(new Event('open-search'))}><Search size={20} /></button>
    : <button type="button" className="gs-open" onClick={() => window.dispatchEvent(new Event('open-search'))}><Search size={16} /> <span>Buscar…</span><kbd>Ctrl K</kbd></button>
}
