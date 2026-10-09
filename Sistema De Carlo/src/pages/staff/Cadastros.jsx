import { compressImage } from '../../lib/image'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Crown, Gift, Megaphone, MessageCircle, Package, PackagePlus, Pencil, Plus, Search, Send, Sparkles, Trash2, Users, X } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Avatar, Badge, Button, Card, Empty, Field, Modal, Segmented, useLimit } from '../../components/ui'
import { serviceNames } from '../../components/Appointments'
import { ClientPortfolio, RuneMeter, Stars } from '../../components/Loyalty'
import { ClientPackages } from '../../components/Packages'
import ReceiptButtons from '../../components/Receipt'
import ReviewButtons from '../../components/Review'
import ClientFiles from '../../components/ClientFiles'
import ClientPhone from '../../components/ClientPhone'
import SuppliesEditor, { cleanQty, fmtQty, parseQty, qtyUnit, unitOf, UNITS } from '../../components/Supplies'
import { increaseLabel } from '../../components/ItemIncrease'
import CatalogFilter, { CatalogGroups, catalogCats, catalogMatch, norm } from '../../components/CatalogFilter'
import { addCredit } from '../../lib/credit'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../../lib/loyalty'
import { cls, fmtDate, fmtPhone, maskPhone, money, onlyDigits, sum, today, waLink, WD_SHORT, addDays, parseMoney, deskCan, payLabel, saleRevenue } from '../../lib/utils'
import { bookingLink, MESSAGES, msg as fillMsg } from '../../lib/messages'

/* ============================== CLIENTES ============================== */
export function Clientes() {
  const { data, session } = useStore()
  const seeSpent = deskCan(data.settings, session, 'clientSpent') // recepção: só se a gestão liberar
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState('todos')

  const rows = useMemo(() => data.clients.map((c) => clientStats(c, data)), [data])

  const filtered = rows
    .filter((c) => norm(c.name).includes(norm(q)) || onlyDigits(c.phone).includes(onlyDigits(q) || '###'))
    .sort((a, b) => sort === 'spent' ? b.spent - a.spent : sort === 'name' ? a.name.localeCompare(b.name) : (b.last || '').localeCompare(a.last || ''))
  const sumido = (c) => c.last && c.last < addDays(today(), -30) && !c.next
  // milhares de fichas: mostra 100 por vez (a busca continua procurando em todas)
  const { visible: visibleClients, more: moreClients } = useLimit(filtered, 100, 'clientes')

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">{data.clients.length} clientes</p><h1 className="page-title">Clientes</h1></div>
        <div className="head-actions">
          <div className="search"><Search size={16} /><input placeholder="Nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Segmented value={view} onChange={setView} options={[{ value: 'todos', label: 'Todos' }, { value: 'campanha', label: `Campanha de volta (${rows.filter(sumido).length})` }]} />
          {view === 'todos' && <Segmented value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recentes' }, ...(seeSpent ? [{ value: 'spent', label: 'Top gasto' }] : []), { value: 'name', label: 'A-Z' }]} />}
        </div>
      </div>
      {view === 'campanha' ? <Campaign rows={rows} seeSpent={seeSpent} /> : (
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cliente</th><th>WhatsApp</th><th className="r">Visitas</th><th className="r">Portfólio</th><th>Fidelidade</th>{seeSpent && <th className="r">Gasto total</th>}<th>Última visita</th><th>Próximo</th></tr></thead>
            <tbody>
              {visibleClients.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setSel(c)}>
                  <td><div className="who"><Avatar name={c.name} color="#2a2424" size={30} /><b>{c.name}</b>{c.club && <Badge tone="club"><Crown size={11} /> {c.club.plan.name}</Badge>}{isBirthdayMonth(c.birthday) && <Badge tone="info"><Gift size={11} /> Aniversário</Badge>}{sumido(c) && <Badge tone="warn">Sumido</Badge>}</div></td>
                  <td>{fmtPhone(c.phone)}</td>
                  <td className="r">{c.visits}</td>
                  <td className="r">{c.photos ? <span className="photo-count"><Camera size={13} /> {c.photos}</span> : '—'}</td>
                  <td><span className="rune-mini">{c.loy.level.rune} {c.loy.progress}/{c.loy.goal}</span>{c.loy.available > 0 && <Badge tone="good">{c.loy.available} grátis</Badge>}</td>
                  {seeSpent && <td className="r">{money(c.spent)}</td>}
                  <td>{c.last ? fmtDate(c.last) : '—'}</td>
                  <td>{c.next ? `${fmtDate(c.next.date)} ${c.next.time}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {moreClients}
          {!filtered.length && <Empty icon={Users} title="Nenhum cliente encontrado" text={q ? "Confira a grafia, tente só o primeiro nome ou os últimos dígitos do telefone. Clientes novas são cadastradas ao agendar ou no Caixa." : "As clientes são cadastradas ao agendar ou ao vender no Caixa."} />}
        </div>
      </Card>
      )}
      {sel && <ClientModal c={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

export function clientStats(c, data) {
  const sales = data.sales.filter((s) => s.clientId === c.id)
  const appts = data.appointments.filter((a) => a.clientId === c.id)
  const last = sales.map((s) => s.date).sort().pop() || null
  return {
    // venda só de pacote/crédito (pagamento adiantado) não é visita; consumo pago com o saldo não conta o gasto duas vezes
    ...c, loy: loyaltyOf(c.id, data.sales, data.settings), club: clubOf(c.id, data), visits: sales.filter((s) => (s.items || []).some((i) => !['package', 'credit'].includes(i.type))).length, spent: sum(sales, saleRevenue), last,
    photos: data.photos.filter((p) => p.clientId === c.id).length,
    noShows: appts.filter((a) => a.status === 'faltou').length,
    next: appts.filter((a) => a.date >= today() && ['agendado', 'confirmado'].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0],
  }
}

/** Ficha da cliente. `restricted` = visão da profissional (sem contato nem WhatsApp). */
export function ClientModal({ c: raw, onClose, restricted = false, initialTab = 'cadastro' }) {
  const { data, actions, session } = useStore()
  const c = raw.loy ? raw : clientStats(raw, data)
  const [notes, setNotes] = useState(c.notes || '')
  const [an, setAn] = useState({ ...ANAMNESE_BLANK, ...(c.anamnese || {}) })
  const setA = (k, v) => setAn((x) => ({ ...x, [k]: v }))
  const [bday, setBday] = useState(c.birthday ? `${c.birthday.slice(3)}/${c.birthday.slice(0, 2)}` : '')
  const bdayISO = (() => { const d = onlyDigits(bday); return d.length === 4 ? `${d.slice(2)}-${d.slice(0, 2)}` : '' })()
  const [hq, setHq] = useState('')
  const [hst, setHst] = useState('') // filtro de status no histórico de agendamentos
  const [portalToken, setPortalToken] = useState(c.portalToken || '') // chave do link de "Meus horários" (vazio = SQL ainda não rodou)
  const [nm, setNm] = useState(c.name || '')
  const [ph, setPh] = useState(onlyDigits(c.phone || '').startsWith('sem') ? '' : onlyDigits(c.phone || ''))
  const [addCred, setAddCred] = useState('')
  const [credPay, setCredPay] = useState('pix')
  
  // abas da ficha: tudo da cliente separado, sem rolar uma tela gigante
  const [tab, setTab] = useState(initialTab)
  const nPk = (data.packages || []).filter((p) => p.clientId === c.id && p.active).length
  const fichaTabs = [['cadastro', 'Cadastro'], ['anamnese', 'Anamnese'], ['prontuario', `Prontuário (${(an.prontuario || []).length})`], ['pacotes', `Pacotes${nPk ? ` (${nPk})` : ''}`], ['comandas', 'Comandas'], ['agendamentos', 'Agendamentos'], ...(restricted ? [] : [['creditos', 'Créditos']]), ['anexos', 'Anexos'], ['portfolio', 'Portfólio']]

  const saveClient = async () => {
    // saldo atual do banco: se houve venda/fiado com a ficha aberta, não volta o valor antigo
    const fresh = data.clients.find((x) => x.id === c.id) || c
    const credit = await addCredit(actions, { ...c, credit: fresh.credit }, parseMoney(addCred), credPay, session?.barberId || data.barbers.find((b) => b.active)?.id)
    const name = nm.trim() || c.name
    const phone = restricted ? undefined : (ph.length >= 10 ? ph : c.phone)
    if (!restricted && ph && ph.length < 10) return actions.notify('WhatsApp incompleto: use DDD + número', 'bad')
    if (!restricted && phone !== c.phone && data.clients.some((x) => x.id !== c.id && onlyDigits(x.phone) === phone)) return actions.notify('Já existe outra cliente com esse WhatsApp', 'bad')
    await actions.upsert('clients', { ...stripClient(c), ...(restricted ? {} : { name, phone }), notes, anamnese: { ...an, prontuario: (an.prontuario || []).map(({ _new, ...e }) => e) }, birthday: bdayISO || c.birthday || '', credit }, 'Cliente atualizado')
    if (!restricted && (name !== c.name || phone !== c.phone)) {
      for (const a of data.appointments.filter((x) => x.clientId === c.id && x.date >= today() && ['agendado', 'confirmado'].includes(x.status))) await actions.updateAppointment(a.id, { clientName: name, clientPhone: phone })
    }
    onClose()
  }

  // prontuário grava na hora (sem depender do botão Salvar da ficha)
  const savePront = async (l) => {
    const prontuario = l.map(({ _new, ...e }) => e)
    const fresh = data.clients.find((x) => x.id === c.id) || c // dados atuais do banco (não sobrescreve crédito/observações com versão antiga)
    await actions.upsert('clients', { ...stripClient(fresh), anamnese: { ...(fresh.anamnese || {}), ...an, prontuario } }, 'Prontuário salvo')
    setA('prontuario', prontuario)
  }
  const history = data.appointments.filter((a) => a.clientId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  const salesHistory = data.sales.filter((s) => s.clientId === c.id).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
  const back = fillMsg(data.settings, 'callClient', { nome: c.name.split(' ')[0], link: bookingLink() })

  return (
    <Modal open onClose={onClose} title={c.name} footer={<Button block onClick={saveClient}>Salvar</Button>}>
      <div className="mini-kpis row">
        <div><b>{c.visits}</b> visitas</div>{deskCan(data.settings, session, 'clientSpent') && <div><b>{money(c.spent)}</b> gasto</div>}<div><b>{c.noShows}</b> faltas</div>
      </div>
      <RuneMeter loyalty={c.loy} />
      {c.club && <p className="muted small mt-sm"><Crown size={13} /> Clube {c.club.plan.name} · {c.club.paid ? 'mensalidade em dia' : 'mensalidade pendente'}</p>}
      {!restricted && onlyDigits(c.phone).length >= 10 && <a className="btn btn-wa btn-block mt" href={waLink(c.phone, back)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Chamar no WhatsApp</a>}
      {/* link pessoal de "Meus horários" (entra sem digitar nada; quem tiver o link vê os horários dela) */}
      {!restricted && portalToken && onlyDigits(c.phone).length >= 10 && (
        <p className="small mt-sm portal-link-row">
          <a href={waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Este é o seu link pessoal para ver e remarcar seus horários na ${data.settings.shopName || 'clínica'}: ${location.origin}${location.pathname}#/meus?c=${portalToken}\nNão compartilhe com outras pessoas.`)} target="_blank" rel="noreferrer">Enviar link de "Meus horários"</a>
          {' · '}<button type="button" className="link" onClick={async () => { if (!(await actions.confirm(`Gerar um link novo para ${c.name}? O link antigo para de funcionar (use se ele foi parar com outra pessoa).`, 'Gerar novo link'))) return; const t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); await actions.patch('clients', c.id, { portalToken: t }, 'Link novo gerado'); setPortalToken(t) }}>gerar novo link</button>
        </p>
      )}
      {anamneseAlerts(an).length > 0 && <div className="an-alerts mt-sm"><b>Atenção na ficha</b>{anamneseAlerts(an).map((t) => <span key={t} className="badge badge-warn">{t}</span>)}</div>}
      <div className="ficha-tabs" role="tablist">
        {fichaTabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={cls(tab === k && 'on')} onClick={() => { setTab(k); setHq('') }}>{l}</button>)}
      </div>
      {tab === 'cadastro' && <div className="form-grid">
        {!restricted && <Field label="Nome" required><input value={nm} onChange={(e) => setNm(e.target.value)} /></Field>}
        {restricted && <Field label="WhatsApp"><ClientPhone clientId={c.id} phone={c.phone} last4={c.phoneLast4} tel={false} /></Field>}
        {!restricted && <Field label="WhatsApp" required><input inputMode="tel" value={maskPhone(ph)} onChange={(e) => setPh(onlyDigits(e.target.value).slice(0, 11))} placeholder="(41) 99999-9999" /></Field>}
        <Field label="Aniversário (dd/mm)"><input inputMode="numeric" value={bday} onChange={(e) => { const d = onlyDigits(e.target.value).slice(0, 4); setBday(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d) }} placeholder="dd/mm" /></Field>
        <Field label="Observações" className="span-2"><textarea rows={10} style={{ minHeight: 220 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferências, tipo de pele, observações…" ></textarea></Field>
      </div>}
      {tab === 'creditos' && <div className="form-grid">
        <Field label={Number(c.credit || 0) < 0 ? "Deve (fiado)" : "Crédito em haver"} hint={Number(c.credit || 0) < 0 ? "Use o campo ao lado para receber" : "Saldo pago adiantado, usado no caixa"}><input value={money(Math.abs(Number(c.credit || 0)))} disabled style={Number(c.credit || 0) < 0 ? { color: "#b42318", fontWeight: 700 } : undefined} /></Field>
        <Field label={Number(c.credit || 0) < 0 ? "Receber / adicionar (R$)" : "Adicionar crédito (R$)"} hint="Paga o fiado primeiro; o resto vira crédito. Grava ao clicar em Salvar."><div style={{ display: 'flex', gap: 8 }}><input inputMode="decimal" value={addCred} onChange={(e) => setAddCred(e.target.value)} placeholder="0,00" /><select value={credPay} onChange={(e) => setCredPay(e.target.value)}><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></div></Field>
      </div>}
      {tab === 'anamnese' && <>
      <div className="form-grid">
        <Field label="Tipo de pele"><select value={an.skin} onChange={(e) => setA('skin', e.target.value)}><option value="">—</option>{['Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível', 'Acneica'].map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Fototipo"><select value={an.phototype} onChange={(e) => setA('phototype', e.target.value)}><option value="">—</option>{['I', 'II', 'III', 'IV', 'V', 'VI'].map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Alergias" className="span-2"><input value={an.allergies} onChange={(e) => setA('allergies', e.target.value)} placeholder="Ex.: látex, ácido salicílico, lidocaína…" /></Field>
        <Field label="Medicamentos em uso" className="span-2"><input value={an.meds} onChange={(e) => setA('meds', e.target.value)} placeholder="Ex.: isotretinoína, anticoagulante, anticoncepcional…" /></Field>
        <Field label="Condições de saúde" className="span-2"><input value={an.conditions} onChange={(e) => setA('conditions', e.target.value)} placeholder="Ex.: diabetes, hipertensão, herpes recorrente, marcapasso…" /></Field>
      </div>
      <div className="an-checks">
        {[['pregnant', 'Gestante ou lactante'], ['acids', 'Usa ácidos ou retinoides'], ['sun', 'Exposição solar recente'], ['consent', 'Termo de consentimento assinado']].map(([k, l]) => (
          <label key={k} className="toggle-row"><span><b>{l}</b></span><span className="switch"><input type="checkbox" checked={!!an[k]} onChange={(e) => setA(k, e.target.checked)} /><span /></span></label>
        ))}
      </div>
      <div className="form-grid mt">
        <Field label="Principal queixa" className="span-2"><textarea rows={2} value={an.complaint || ''} onChange={(e) => setA('complaint', e.target.value)} /></Field>
        <Field label="Profissão"><input value={an.profession || ''} onChange={(e) => setA('profession', e.target.value)} /></Field>
        <Field label="Qualidade do sono"><select value={an.sleep || ''} onChange={(e) => setA('sleep', e.target.value)}><option value="">—</option><option>Boa</option><option>Ruim</option></select></Field>
        <Field label="Água por dia"><select value={an.waterLiters || ''} onChange={(e) => setA('waterLiters', e.target.value)}><option value="">—</option><option>Até 1 litro</option><option>2 litros ou mais</option></select></Field>
        {HABITS.map(([k, l]) => <Field key={k} label={l}><select value={an[k] || ''} onChange={(e) => setA(k, e.target.value)}><option value="">—</option><option>Sim</option><option>Não</option></select></Field>)}
      </div>
      <span className="field-label mt">Problemas de saúde</span>
      <div className="pkg-items mt-sm">
        {DISEASES.map((d) => { const on = (an.diseases || []).includes(d); return <button key={d} type="button" className={cls('pill', on && 'on')} onClick={() => setA('diseases', on ? an.diseases.filter((x) => x !== d) : [...(an.diseases || []), d])}>{d}</button> })}
      </div>
      <div className="form-grid mt">
        {HEALTH_TEXT.slice(1).map(([k, l]) => <Field key={k} label={l} className="span-2"><input value={an[k] || ''} onChange={(e) => setA(k, e.target.value)} /></Field>)}
      </div>
      </>}
      {tab === 'prontuario' && <>
        <Prontuario list={an.prontuario || []} author={session?.name || (restricted ? 'Profissional' : 'Gestão')} onChange={savePront} />
        <p className="muted small">Cada registro (novo, editado ou excluído) é salvo na hora.</p>
      </>}
      {tab === 'pacotes' && <ClientPackages client={c} canSell={!restricted} barberId={session?.barberId} />}
      {tab === 'portfolio' && <ClientPortfolio client={c} barberId={session?.barberId} />}
      {tab === 'anexos' && <ClientFiles client={c} canDelete={!restricted} />}

      {tab === 'agendamentos' && (
        <>
          <div className="search mb-sm"><Search size={16} /><input placeholder="Buscar serviço, profissional ou data" value={hq} onChange={(e) => setHq(e.target.value)} /></div>
          <div className="cat-filter-chips mb-sm">
            {[['', 'Todos'], ['futuro', 'Próximos'], ['concluido', 'Concluídos'], ['faltou', 'Faltou'], ['cancelado', 'Cancelados']].map(([k, l]) => { const n = k ? history.filter((a) => (k === 'futuro' ? a.date >= today() && ['agendado', 'confirmado'].includes(a.status) : a.status === k)).length : history.length; return <button key={k} type="button" className={cls('pill', hst === k && 'on')} onClick={() => setHst(k)}>{l} · {n}</button> })}
          </div>
          <div className="list compact">
            {history.filter((a) => (!hst || (hst === 'futuro' ? a.date >= today() && ['agendado', 'confirmado'].includes(a.status) : a.status === hst)) && (!hq.trim() || norm(`${serviceNames(a, data.services)} ${data.barbers.find((b) => b.id === a.barberId)?.name || ''} ${fmtDate(a.date)} ${a.status}`).includes(norm(hq)))).slice(0, hq.trim() || hst ? 100 : 12).map((a) => (
              <div key={a.id} className="sale-row">
                <span className="appt-time">{fmtDate(a.date)}</span>
                <span className="appt-info"><b>{serviceNames(a, data.services)}</b><small>{data.barbers.find((b) => b.id === a.barberId)?.name} · {a.time}</small></span>
                <Badge tone={a.status === 'concluido' ? 'good' : a.status === 'faltou' ? 'warn' : a.status === 'cancelado' ? 'bad' : 'neutral'}>{a.status}</Badge>
              </div>
            ))}
            {!history.length && <Empty title="Sem agendamentos" text="Para agendar, use o botão Agendar na Agenda e escolha esta cliente." />}
          </div>
        </>
      )}
      {tab === 'comandas' && <ClientComandas c={c} sales={salesHistory} />}
    </Modal>
  )
}
const stripClient = ({ id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt, credit }) => ({ id, name, phone, notes, anamnese, createdAt, birthday, credit: Number(credit || 0), lastCampaignAt })

/* Comandas da cliente: vendas agrupadas por dia, da mais recente para a mais antiga */
function ClientComandas({ c, sales }) {
  const { data } = useStore()
  const old = [] // (sem histórico importado neste sistema)
  const [q, setQ] = useState('')
  const mine = Object.values(sales.reduce((m, s) => { (m[s.date] ||= { key: s.date, date: s.date, sales: [] }).sales.push(s); return m }, {}))
    .map((d) => ({ ...d, total: sum(d.sales, (s) => s.total), lines: d.sales.map((s) => ({ k: s.id, text: (s.items || []).filter((i) => i.type !== 'supply').map((i) => `${Number(i.qty) > 1 ? `${i.qty}x ` : ''}${i.name}${i.packageId ? ' (pacote)' : ''}${increaseLabel(i) ? ` (${increaseLabel(i)})` : ''}`).join(', ') || 'Venda', sub: `${data.barbers.find((b) => b.id === s.barberId)?.name.split(' ')[0] || ''} · ${s.time || ''} · ${payLabel(s)} · ${money(s.total)}` })) }))
  // o histórico importado só completa os dias que não estão nas vendas (evita comanda repetida)
  const saleDays = new Set(sales.map((s) => s.date))
  const prev = Object.values((old || []).filter((x) => !saleDays.has(x.date)).reduce((m, x) => { const k = `${x.date}|${x.comanda}`; (m[k] ||= { key: k, date: x.date, num: x.comanda, items: [] }).items.push(x); return m }, {}))
    .map((g) => ({ ...g, total: sum(g.items, (i) => Number(i.total || 0)), lines: g.items.map((i, k) => ({ k, text: `${Number(i.qty) > 1 ? `${Number(i.qty)}x ` : ''}${i.item}`, sub: `${i.professional || ''} · ${money(i.total)}` })) }))
  const every = [...mine, ...prev].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const all = every.filter((d) => !q.trim() || norm(`${d.lines.map((l) => `${l.text} ${l.sub}`).join(' ')} ${fmtDate(d.date)} ${d.num || ''}`).includes(norm(q)))
  // atalhos: procedimentos que a cliente mais fez (clicou = filtra "quando ela fez X?")
  const top = Object.entries(every.flatMap((d) => d.lines.flatMap((l) => l.text.split(', ').map((t) => t.replace(/^\d+x /, '').replace(' (pacote)', '')))).reduce((m, t) => { if (t && t !== 'Venda') m[t] = (m[t] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6)
  return (
    <>
      <div className="search mb-sm"><Search size={16} /><input placeholder="Buscar procedimento, profissional, pagamento ou data" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" className="icon-btn sm" aria-label="Limpar busca" onClick={() => setQ('')}><X size={14} /></button>}</div>
      {top.length > 1 && <div className="cat-filter-chips mb-sm">{top.map(([t, n]) => <button key={t} type="button" className={cls('pill', norm(q) === norm(t) && 'on')} onClick={() => setQ(norm(q) === norm(t) ? '' : t)}>{t} · {n}</button>)}</div>}
      {q.trim() && <p className="muted small mb-sm">{all.length} {all.length === 1 ? 'comanda encontrada' : 'comandas encontradas'}{all[0]?.date ? ` · última em ${fmtDate(all[0].date)}` : ''}</p>}
      <div className="list compact">
        {all.slice(0, q.trim() ? 100 : 30).map((d) => (
          <div key={d.key} className="comanda-card">
            <div className="comanda-head"><b>Comanda {d.date ? fmtDate(d.date) : '—'}{d.num ? ` · ${d.num}` : ''}</b><b>{money(d.total)}</b></div>
            {d.lines.map((l) => <div key={l.k} className="comanda-line"><span>{l.text}</span><small>{l.sub}</small></div>)}
            {d.sales && <ReceiptButtons sales={d.sales} phone={c.phone} />}
            {d.sales && <ReviewButtons sales={d.sales} phone={c.phone} />}
          </div>
        ))}
        {old !== null && !all.length && <Empty title="Sem comandas" text="Cada venda fechada no Caixa vira uma comanda aqui, com recibo para reenviar." />}
      </div>
    </>
  )
}

/* Prontuário: registros datados. Todos podem ser editados ou excluídos; cada ação grava na hora */
function Prontuario({ list, author, onChange }) {
  const { actions } = useStore()
  const [txt, setTxt] = useState('')
  const [dt, setDt] = useState(today())
  const [ed, setEd] = useState(null) // { id, date, text } em edição
  const [busy, setBusy] = useState(false)
  const run = async (next) => { setBusy(true); try { await onChange(next) } finally { setBusy(false) } }
  const add = async () => { if (!txt.trim()) return; await run([{ id: Date.now().toString(36), date: dt, text: txt.trim(), author }, ...list]); setTxt('') }
  const saveEd = async () => { if (!ed.text.trim()) return; await run(list.map((x) => (x.id === ed.id ? { ...x, date: ed.date, text: ed.text.trim(), editedAt: today(), editedBy: author } : x))); setEd(null) }
  const del = async (e) => { if (await actions.confirm(`Excluir o registro de ${e.date ? fmtDate(e.date) : 'sem data'} do prontuário?`, 'Excluir')) await run(list.filter((x) => x.id !== e.id)) }
  const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return (
    <div className="pront">
      <div className="pront-add">
        <input type="date" value={dt} onChange={(e) => setDt(e.target.value)} />
        <textarea rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Procedimento, produto, lote/validade, parâmetros, reações, orientações…" />
        <Button size="sm" variant="ghost" icon={Plus} disabled={busy || !txt.trim()} onClick={add}>{busy ? 'Salvando…' : 'Adicionar ao prontuário'}</Button>
      </div>
      {!sorted.length && <p className="muted small">Nenhum registro ainda.</p>}
      {sorted.map((e) => (
        <div key={e.id} className="pront-item">
          {ed?.id === e.id ? (
            <div className="pront-edit">
              <input type="date" value={ed.date || ''} onChange={(x) => setEd({ ...ed, date: x.target.value })} />
              <textarea rows={Math.min(14, Math.max(4, ed.text.split('\n').length + 1))} value={ed.text} onChange={(x) => setEd({ ...ed, text: x.target.value })} autoFocus />
              <div className="foot-row"><Button size="sm" variant="ghost" onClick={() => setEd(null)}>Cancelar</Button><Button size="sm" disabled={busy || !ed.text.trim()} onClick={saveEd}>{busy ? 'Salvando…' : 'Salvar alteração'}</Button></div>
            </div>
          ) : <>
            <small>{e.date ? fmtDate(e.date) : 'Sem data'} · {e.author}{e.editedAt ? ` · editado em ${fmtDate(e.editedAt)}${e.editedBy ? ` por ${e.editedBy}` : ''}` : ''}</small>
            <p>{e.text}</p>
            <div className="pront-acts">
              <button type="button" className="link" disabled={busy} onClick={() => setEd({ id: e.id, date: e.date || '', text: e.text || '' })}>editar</button>
              <button type="button" className="link" disabled={busy} onClick={() => del(e)}>excluir</button>
            </div>
          </>}
        </div>
      ))}
    </div>
  )
}

/* Ficha de anamnese (estética) */
const ANAMNESE_BLANK = { skin: '', phototype: '', allergies: '', meds: '', conditions: '', pregnant: false, acids: false, sun: false, consent: false, diseases: [], prontuario: [] }
// hábitos (sim/não ficam como texto: vazio = não informado)
const HABITS = [['smoker', 'Fumante'], ['alcohol', 'Ingere álcool'], ['exercise', 'Atividade física'], ['diet', 'Boa alimentação'], ['water', 'Ingere água'], ['breastfeeding', 'Amamentando'], ['lenses', 'Lentes nos olhos'], ['braces', 'Aparelho odontológico'], ['iud', 'DIU']]
const DISEASES = ['Circulatório', 'Câncer', 'Renais (rins)', 'Respiratório', 'Endócrino', 'Digestivo', 'Diabetes', 'Anemia', 'DST', 'Epilepsia', 'Hepáticos', 'Ginecológico', 'Colesterol', 'Cardíacos', 'Depressão', 'Herpes', 'Pressão alta', 'Pressão baixa', 'Alergia']
const HEALTH_TEXT = [['complaint', 'Principal queixa'], ['otherHealth', 'Outro problema de saúde'], ['surgeries', 'Cirurgias'], ['aesthetic', 'Procedimento estético no corpo'], ['aestheticWhere', 'Onde fez o procedimento'], ['implants', 'Marca-passo, pinos ou próteses'], ['cognitive', 'Deficiência cognitiva']]
const isNo = (v) => !v || /^(n[aã]o|nenhum|nada|-)\.?$/i.test(String(v).trim())
export function anamneseAlerts(a = {}) {
  const out = []
  if (a.allergies) out.push(`Alergia: ${a.allergies}`)
  if (a.pregnant) out.push('Gestante/lactante')
  if (a.breastfeeding === 'Sim') out.push('Amamentando')
  ;(a.diseases || []).forEach((d) => out.push(d))
  if (!isNo(a.implants)) out.push(`Marca-passo/pinos/próteses: ${a.implants}`)
  if (a.acids) out.push('Usa ácidos/retinoides')
  if (a.sun) out.push('Sol recente')
  if (a.meds) out.push(`Medicação: ${a.meds}`)
  if (a.conditions) out.push(a.conditions)
  return out
}

/* ============================== CAMPANHA DE VOLTA ============================== */
function Campaign({ rows, seeSpent }) {
  const { data, actions } = useStore()
  const [days, setDays] = useState(30)
  const link = `${location.origin}${location.pathname}#/`
  const [tpl, setTpl] = useState(() => (data.settings.messages?.comeback || '').trim() || MESSAGES.find((m) => m.key === 'comeback').text)
  const list = rows.filter((c) => c.last && c.last < addDays(today(), -days) && !c.next).sort((a, b) => a.last.localeCompare(b.last))
  const sentToday = (c) => c.lastCampaignAt === today()
  const pending = list.filter((c) => !sentToday(c))
  const msgFor = (c) => fillMsg({ ...data.settings, messages: { comeback: tpl } }, 'comeback', { nome: c.name.split(' ')[0], dias: Math.round((new Date(today()) - new Date(c.last)) / 86400000), link })
  const mark = (c) => actions.upsert('clients', { ...stripClient(c), lastCampaignAt: today() }, null)
  const next = pending[0]
  return (
    <div className="grid-2 campaign">
      <Card title="Mensagem">
        <Field label="Texto (use {nome}, {dias} e {link})"><textarea rows={5} value={tpl} onChange={(e) => setTpl(e.target.value)} /></Field>
        <Field label="Sumidos há mais de" className="mt">
          <Segmented value={days} onChange={setDays} options={[30, 45, 60, 90].map((d) => ({ value: d, label: `${d} dias` }))} />
        </Field>
        <div className="campaign-next">
          <div><b>{pending.length}</b><span>para enviar hoje · {list.length - pending.length} enviados</span></div>
          {next ? (
            <a className="btn btn-wa btn-lg" href={waLink(next.phone, msgFor(next))} target="_blank" rel="noreferrer" onClick={() => mark(next)}><Send size={18} /> Enviar para {next.name.split(' ')[0]}</a>
          ) : <span className="badge badge-good">Campanha concluída</span>}
        </div>
        <p className="muted small">Cada clique abre o WhatsApp com a mensagem pronta para um cliente. Depois de enviar, volte e clique de novo para o próximo.</p>
      </Card>
      <Card title={`Clientes sumidos (${list.length})`} pad={false}>
        <div className="list">
          {list.map((c) => (
            <div key={c.id} className={cls('sale-row', sentToday(c) && 'done')}>
              <span className="appt-time">{fmtDate(c.last)}</span>
              <span className="appt-info"><b>{c.name}</b><small>{c.visits} visitas{seeSpent ? ` · ${money(c.spent)}` : ''}</small></span>
              {sentToday(c) ? <Badge tone="good">Enviado</Badge>
                : <a className="btn btn-ghost btn-sm" href={waLink(c.phone, msgFor(c))} target="_blank" rel="noreferrer" onClick={() => mark(c)}><Megaphone size={14} /> Enviar</a>}
            </div>
          ))}
          {!list.length && <Empty icon={Users} title="Ninguém sumido" text="Todos os clientes voltaram dentro do prazo." />}
        </div>
      </Card>
    </div>
  )
}

/* ============================== CATÁLOGO ============================== */
/* Entrada de estoque (nota de compra): vários produtos, quantidade e custo; soma no estoque e lança o valor nas despesas */
const lastCost = { get: (id) => { try { return localStorage.getItem(`dcb:custo:${id}`) || '' } catch { return '' } }, set: (id, v) => { try { localStorage.setItem(`dcb:custo:${id}`, v) } catch { /* sem armazenamento */ } } }
const addMonthsISO = (d, n) => { const [y, m, day] = d.split('-').map(Number); const last = new Date(y, m + n, 0).getDate(); const x = new Date(y, m - 1 + n, Math.min(day, last)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
/** Compra de produto → despesas (categoria Produtos). Pago = 1 lançamento hoje; a pagar = N parcelas mensais (a última fecha os centavos) */
export async function launchPurchase(actions, { desc, total, payment, paid, parts = 1, due }) {
  const n = paid ? 1 : Math.max(1, Number(parts) || 1)
  const each = Math.floor((total / n) * 100) / 100
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each
    const d = paid ? today() : addMonthsISO(due || today(), i)
    await actions.upsert('expenses', { month: d.slice(0, 7), category: 'Produtos', description: n > 1 ? `${desc} (${i + 1}/${n})` : desc, amount, paidWith: payment || '', dueDate: d, paid: !!paid, paidAt: paid ? today() : null }, null)
  }
}
function StockEntry({ entry, setEntry, products }) {
  const { actions } = useStore()
  const [lines, setLines] = useState(() => (entry.productId ? [{ productId: entry.productId, qty: '', cost: lastCost.get(entry.productId) }] : []))
  const [pq, setPq] = useState('')
  const [picking, setPicking] = useState(!entry.productId)
  const [f, setF] = useState({ supplier: '', total: '', payment: 'Pix', paid: true, parts: 1, due: today(), noExpense: false })
  const [saving, setSaving] = useState(false)
  const prod = (id) => products.find((x) => x.id === id)
  const setLine = (i, k, v) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const sub = (l) => Math.round((parseQty(l.qty) || 0) * parseMoney(l.cost) * 100) / 100
  const calc = Math.round(lines.reduce((a, l) => a + sub(l), 0) * 100) / 100
  const total = f.total.trim() ? parseMoney(f.total) : calc
  const okLines = lines.length > 0 && lines.every((l) => prod(l.productId) && parseQty(l.qty) > 0)
  const okMoney = f.noExpense || total > 0
  const hits = pq.trim() ? products.filter((x) => norm(x.name).includes(norm(pq)) && !lines.some((l) => l.productId === x.id)).slice(0, 8) : []
  const pick = (x) => { setLines((l) => [...l, { productId: x.id, qty: '', cost: lastCost.get(x.id) }]); setPq(''); setPicking(false) }
  const save = async () => {
    if (!okLines || !okMoney) return
    setSaving(true)
    try {
      for (const l of lines) {
        const p = prod(l.productId); const q = parseQty(l.qty)
        // custo médio ponderado (estoque antigo pelo custo antigo + o que chegou pelo custo novo)
        const uc = parseMoney(l.cost); const st = Number(p.stock || 0)
        await actions.patch('products', p.id, { stock: Math.round((st + q) * 1000) / 1000, ...(uc > 0 ? { cost: Number(p.cost || 0) > 0 ? Math.round(((st * Number(p.cost) + q * uc) / Math.max(1, st + q)) * 100) / 100 : uc } : {}) }, null)
        if (parseMoney(l.cost) > 0) lastCost.set(p.id, l.cost)
      }
      if (!f.noExpense && total > 0) {
        const what = lines.map((l) => `${qtyUnit(parseQty(l.qty), prod(l.productId))} ${prod(l.productId).name}`).join(', ')
        await launchPurchase(actions, { desc: `Entrada de estoque${f.supplier.trim() ? ` · ${f.supplier.trim()}` : ''}: ${what}`, total, payment: f.payment, paid: f.paid, parts: f.parts, due: f.due })
      }
      actions.notify(`Estoque atualizado (${lines.length} produto${lines.length > 1 ? 's' : ''})${!f.noExpense && total > 0 ? ` · ${money(total)} nas despesas` : ''}`)
      setEntry(null)
    } finally { setSaving(false) }
  }
  return (
    <Modal open wide onClose={() => setEntry(null)} title="Entrada de estoque" footer={<Button block icon={PackagePlus} disabled={!okLines || !okMoney || saving} onClick={save}>{saving ? 'Salvando…' : !okLines ? 'Escolha os produtos e as quantidades' : !okMoney ? 'Informe o valor da compra' : `Dar entrada${f.noExpense ? '' : ` e lançar ${money(total)} nas despesas`}`}</Button>}>
      <h4 className="sub-title">1. O que chegou</h4>
      <div className="se-lines">
        {lines.map((l, i) => { const p = prod(l.productId); const q = parseQty(l.qty) || 0; return (
          <div key={l.productId} className="se-line">
            <div className="se-name"><b>{p?.name}</b><small>Estoque: {qtyUnit(p?.stock, p)}{q > 0 ? ` → ${qtyUnit(Number(p?.stock || 0) + q, p)}` : ''}</small></div>
            <label><span>Quantidade ({unitOf(p) === 'un' ? 'un.' : unitOf(p)})</span><input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, 'qty', cleanQty(e.target.value, 6))} placeholder="0" autoFocus={i === lines.length - 1} /></label>
            <label><span>Custo por {unitOf(p) === 'un' ? 'unidade' : unitOf(p)} (R$)</span><input inputMode="decimal" value={l.cost} onChange={(e) => setLine(i, 'cost', e.target.value)} placeholder="0,00" /></label>
            <span className="se-sub"><span>Subtotal</span><b>{money(sub(l))}</b></span>
            <button type="button" className="icon-btn sm" aria-label={`Tirar ${p?.name}`} onClick={() => setLines((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ) })}
      </div>
      {picking ? (
        <Field label={lines.length ? 'Outro produto' : 'Produto'}>
          <div className="search"><Search size={16} /><input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Buscar produto" autoFocus /></div>
          {hits.length > 0 && <div className="client-hits">{hits.map((x) => <button key={x.id} type="button" onClick={() => pick(x)}><b>{x.name}</b><small>{qtyUnit(x.stock, x)} em estoque</small></button>)}</div>}
        </Field>
      ) : <Button variant="ghost" size="sm" icon={Plus} onClick={() => setPicking(true)}>Adicionar outro produto</Button>}

      <h4 className="sub-title mt">2. Valor e pagamento (vai para as despesas)</h4>
      <div className="form-grid">
        <Field label="Fornecedor" hint="Opcional · ajuda a achar depois"><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="Ex.: Distribuidora Bella" /></Field>
        <Field label="Valor total da compra (R$)" hint={f.total.trim() ? `Soma dos itens: ${money(calc)}` : 'Vazio = soma dos itens (mude se tiver frete ou desconto)'}><input inputMode="decimal" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} placeholder={calc ? money(calc).replace('R$', '').trim() : '0,00'} /></Field>
        <Field label="Pago com"><select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}>{['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto'].map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Situação"><select value={f.paid ? 'pago' : 'apagar'} onChange={(e) => setF({ ...f, paid: e.target.value === 'pago' })}><option value="pago">Pago agora</option><option value="apagar">A pagar</option></select></Field>
        {!f.paid && <>
          <Field label="Em quantas vezes"><select value={f.parts} onChange={(e) => setF({ ...f, parts: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? '1x' : `${n}x de ${money(total / n)}`}</option>)}</select></Field>
          <Field label="1º vencimento"><input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        </>}
      </div>
      <label className="toggle-row mt-sm"><span><b>Não lançar nas despesas</b><small>Só para brinde ou bonificação do fornecedor (sem custo).</small></span><span className="switch"><input type="checkbox" checked={f.noExpense} onChange={(e) => setF({ ...f, noExpense: e.target.checked })} /><span /></span></label>
      {!f.noExpense && total > 0 && <p className="muted small mt-sm">Vai para <b>Lucro real → Despesas</b> (categoria Produtos){f.paid ? ' como pago hoje' : `, ${f.parts > 1 ? `${f.parts} parcelas a partir de ${fmtDate(f.due)}` : `a pagar em ${fmtDate(f.due)}`}, e aparece em Boletos e contas`}.</p>}
    </Modal>
  )
}
export function Catalogo() {
  const { data, actions } = useStore()
  const [sp] = useSearchParams() // vindo da busca geral / avisos: ?tab=products&q=nome&f=__low
  const [tab, setTab] = useState(sp.get('tab') === 'products' ? 'products' : 'services')
  const [edit, setEdit] = useState(null)
  const [q, setQ] = useState(sp.get('q') || '')
  const [cat, setCat] = useState(sp.get('f') || '') // categoria/estado escolhido no filtro
  const [showF, setShowF] = useState(!!sp.get('f')) // filtros recolhidos por padrão
  const [entry, setEntry] = useState(null) // entrada de estoque
  // já estando no Catálogo, a busca geral/avisos só mudam o endereço: aplica de novo
  useEffect(() => {
    const t = sp.get('tab'); if (t) setTab(t === 'products' ? 'products' : 'services')
    if (sp.get('q') !== null) setQ(sp.get('q') || '')
    if (sp.get('f')) { setCat(sp.get('f')); setShowF(true) }
  }, [sp])
  const isSvc = tab === 'services'
  const all = data[tab].slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
  const cats = catalogCats(all, isSvc)
  const list = all.filter((x) => (!q.trim() || norm(x.name).includes(norm(q))) && (!cat || catalogMatch(x, cat, isSvc)))
  const blank = isSvc ? { name: '', description: '', duration: 30, price: 0, commission: 50, active: true, order: list.length + 1 } : { name: '', price: 0, stock: 0, commission: 10, active: true }

  const team = data.barbers.filter((b) => b.active)
  const [ov, setOv] = useState({}) 
  const open = (x) => {
    setEdit(x)
    if (isSvc) setOv(Object.fromEntries(team.map((b) => [b.id, { duration: b.serviceOverrides?.[x.id]?.duration ?? '', commission: b.serviceOverrides?.[x.id]?.commission ?? '' }])))
  }
  const setOne = (bid, k, v) => setOv((o) => ({ ...o, [bid]: { ...o[bid], [k]: v } }))
  // estoque que entrou ao salvar (produto novo com estoque, ou estoque aumentado na edição) → pode virar despesa
  const origStock = edit?.id ? Number(data.products.find((p) => p.id === edit.id)?.stock || 0) : 0
  const added = !isSvc && edit ? Math.round(Math.max(0, parseQty(edit.stock) - origStock) * 1000) / 1000 : 0
  const buyTotal = Math.round(added * parseMoney(edit?.buyCost) * 100) / 100
  // custo de material pelos insumos do procedimento (quantidade × custo médio de cada produto)
  const supCost = isSvc && edit ? Math.round((edit.supplies || []).reduce((s, x) => s + Number(x.qty || 0) * Number(data.products.find((p) => p.id === x.productId)?.cost || 0), 0) * 100) / 100 : 0
  const save = async () => {
    // buy* = dados da compra (não ficam no produto; vão para as despesas)
    const { overrides: _o, buyCost: _c, buyPayment: _p, buyInstallments: _i, buyPaid: _pd, buyDue: _d, ...clean } = edit
    if (String(edit.price ?? '').trim() === '') return actions.notify('Informe o preço', 'bad')
    // aceita 96,00 · 96.00 · 1.250,00 (antes "96,00" virava vazio e o banco recusava)
    const row = { ...clean, price: parseMoney(edit.price), commission: parseMoney(edit.commission), category: String(edit.category || '').trim() || (edit.category !== undefined ? null : undefined) }
    if (isSvc) { row.duration = Math.max(5, Number(onlyDigits(edit.duration)) || 30); row.supplies = (edit.supplies || []).filter((x) => x.productId && parseQty(x.qty) > 0).map((x) => ({ productId: x.productId, qty: parseQty(x.qty) })); row.materialCost = parseMoney(edit.materialCost) || supCost } else {
      row.stock = parseQty(edit.stock)
      // custo médio: o que já tinha (custo antigo) + o que chegou agora (custo da compra)
      const oldCost = parseMoney(edit.cost)
      row.cost = added > 0 && parseMoney(edit.buyCost) > 0 ? (oldCost > 0 ? Math.round(((origStock * oldCost + added * parseMoney(edit.buyCost)) / Math.max(1, origStock + added)) * 100) / 100 : parseMoney(edit.buyCost)) : oldCost
    }
    const saved = await actions.upsert(tab, row, 'Salvo')
    if (!isSvc && saved && added > 0 && buyTotal > 0) {
      await launchPurchase(actions, { desc: `${edit.id ? 'Entrada de estoque' : 'Compra (produto novo)'}: ${qtyUnit(added, edit)} ${row.name}`, total: buyTotal, payment: edit.buyPayment || 'Pix', paid: edit.buyPaid !== 'apagar', parts: edit.buyInstallments || 1, due: edit.buyDue || today() })
      actions.notify(`Salvo · ${money(buyTotal)} lançado nas despesas`)
    }
    if (isSvc && saved?.id) {
      for (const b of team) {
        const cur = b.serviceOverrides?.[saved.id] || {}
        const nx = ov[b.id] || {}
        if (String(cur.duration ?? '') === String(nx.duration ?? '') && String(cur.commission ?? '') === String(nx.commission ?? '')) continue
        const next = cleanOverrides({ ...(b.serviceOverrides || {}), [saved.id]: nx })
        await actions.upsert('barbers', { ...stripBarber(b), serviceOverrides: next }, null)
      }
    }
    setEdit(null)
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Preços e regras de comissão</p><h1 className="page-title">Catálogo</h1></div>
        <div className="head-actions">
          <Segmented value={tab} onChange={(t) => { setTab(t); setCat(''); setQ('') }} options={[{ value: 'services', label: 'Serviços' }, { value: 'products', label: 'Produtos' }]} />
          {!isSvc && <Button variant="ghost" icon={PackagePlus} onClick={() => setEntry({ productId: '', qty: '', cost: '', payment: '', expense: true })}>Entrada de estoque</Button>}
          <Button icon={Plus} onClick={() => open(blank)}>{isSvc ? 'Novo serviço' : 'Novo produto'}</Button>
        </div>
      </div>
      <CatalogFilter q={q} setQ={setQ} cats={cats} cat={cat} setCat={setCat} show={showF} setShow={setShowF} placeholder={isSvc ? 'Buscar serviço' : 'Buscar produto'} count={list.length} />
      <CatalogGroups items={list} storageKey={`dcb:catalogo-grupos:${tab}`} forceOpen={!!q.trim() || !!cat} noun={isSvc ? 'serviços' : 'produtos'} wrapClass="cards">
        {(x) => (
          <div key={x.id} className={cls('item-card', !x.active && 'inactive')}>
            <span className="tile-ico">{isSvc ? <Sparkles size={18} /> : <Package size={18} />}</span>
            <div className="item-main">
              <b>{x.name}</b>{isSvc && x.online === false && <span className="badge" style={{ marginLeft: 8 }}>Só interno</span>}
              <small>{isSvc ? `${x.duration} min` : `${qtyUnit(x.stock, x)} em estoque`} · comissão {x.commission}%</small>
            </div>
            <b className="item-price">{money(x.price)}</b>
            {!x.active && <Badge>Inativo</Badge>}
            {!isSvc && Number(x.stock) <= 3 && x.active && <Badge tone="warn">Estoque baixo</Badge>}
            {!isSvc && x.internal && <Badge>Uso interno</Badge>}
            {isSvc && x.supplies?.length > 0 && <Badge tone="info">{x.supplies.length} insumo(s)</Badge>}
            {isSvc && team.some((b) => b.serviceOverrides?.[x.id]?.duration) && (
              <small className="item-ov">{team.filter((b) => b.serviceOverrides?.[x.id]?.duration).map((b) => `${b.name.split(' ')[0]} ${b.serviceOverrides[x.id].duration} min`).join(' · ')}</small>
            )}
            {!isSvc && <button className="icon-btn sm" onClick={() => setEntry({ productId: x.id, qty: '', cost: '', payment: '', expense: true })} aria-label={`Entrada de estoque de ${x.name}`} title="Entrada de estoque"><PackagePlus size={16} /></button>}
            <button className="icon-btn sm" onClick={() => open(x)} aria-label="Editar"><Pencil size={16} /></button>
          </div>
        )}
      </CatalogGroups>
      {!list.length && <Empty title="Nada encontrado" text="Tente outra busca ou limpe o filtro." />}
      {entry && <StockEntry entry={entry} setEntry={setEntry} products={data.products} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar' : 'Cadastrar'} footer={
        <div className="foot-row">
          {edit?.id && <Button variant="danger" icon={Trash2} onClick={async () => { if (await actions.confirm(`Excluir ${edit.name}? Essa ação não pode ser desfeita.`, 'Excluir')) { await actions.remove(tab, edit.id); setEdit(null) } }}>Excluir</Button>}
          <Button onClick={save} disabled={!edit?.name}>Salvar</Button>
        </div>
      }>
        {edit && (
          <div className="form-grid">
            <Field label="Nome" required className="span-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Categoria" hint="Usada nos filtros (Catálogo, Caixa e Agendamento)" className="span-2"><input list="cat-sugestoes" value={edit.category || ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder={isSvc ? 'Ex.: Cabelo, Unhas, Estética facial' : 'Ex.: Home care, Cabelo'} /><datalist id="cat-sugestoes">{cats.filter((c) => !c.value.startsWith('__')).map((c) => <option key={c.value} value={c.value} />)}</datalist></Field>
            {isSvc && <Field label="Descrição" className="span-2"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
            <Field label="Preço (R$)" required><input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label="Comissão (%)"><input inputMode="numeric" value={edit.commission} onChange={(e) => setEdit({ ...edit, commission: e.target.value })} /></Field>
            {isSvc ? (
              <><Field label="Custo de material (R$)" hint={supCost > 0 ? `Pelos insumos abaixo: ${money(supCost)} (vazio = usa este)` : 'Produtos/descartáveis gastos em 1 atendimento'}><input inputMode="decimal" value={edit.materialCost ?? ''} onChange={(e) => setEdit({ ...edit, materialCost: e.target.value })} placeholder={supCost > 0 ? money(supCost).replace('R$', '').trim() : '0,00'} /></Field>
              {/* Estoque automático: produtos que este procedimento consome; saem do estoque ao cobrar */}
              <div className="span-2"><SuppliesEditor collapsible={false} title="Estoque automático (insumos deste procedimento)" hint="Ex.: 1 agulha 22G, 1 cânula, 10 gazes, 2 luvas. Ao cobrar o procedimento, esses produtos saem do estoque (dá para ajustar na hora). Cadastre-os em Produtos, marcados como uso interno." value={edit.supplies || []} onChange={(v) => setEdit({ ...edit, supplies: v })} products={data.products} /></div>
              <Field label="Duração padrão (min)" required><input inputMode="numeric" value={edit.duration} onChange={(e) => setEdit({ ...edit, duration: onlyDigits(e.target.value).slice(0, 3) })} /></Field>
              <label className="toggle-row span-2"><span><b>Usa a sala da profissional</b><small>Desligue se o serviço é feito fora da sala.</small></span><span className="switch"><input type="checkbox" checked={!edit.noRoom} onChange={(e) => setEdit({ ...edit, noRoom: !e.target.checked })} /><span /></span></label>
              <label className="toggle-row span-2"><span><b>Aparece no agendamento online</b><small>Desligue para serviços de uso interno.</small></span><span className="switch"><input type="checkbox" checked={edit.online !== false} onChange={(e) => setEdit({ ...edit, online: e.target.checked })} /><span /></span></label></>
            ) : (<>
              <Field label={`Custo por ${unitOf(edit) === 'un' ? 'unidade' : unitOf(edit)} (R$)`} hint="Média das compras · usado no lucro por produto"><input inputMode="decimal" value={edit.cost ?? ''} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Unidade de medida" hint="Como o estoque é contado. Toxina: UI (ex.: frasco de 100 UI = 100)"><select value={unitOf(edit)} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
              <Field label={`Estoque (${unitOf(edit) === 'un' ? 'un.' : unitOf(edit)})`} hint={edit.id ? `Atual: ${qtyUnit(origStock, edit)}${added ? ` · +${fmtQty(added)} entrando` : ''}` : 'Quantidade que você tem agora'}><input inputMode="decimal" value={typeof edit.stock === 'number' ? fmtQty(edit.stock) : edit.stock} onChange={(e) => setEdit({ ...edit, stock: cleanQty(e.target.value) })} placeholder="0 (aceita 0,5)" /></Field>
              {added > 0 && (
                <div className="span-2 buy-box">
                  <h4 className="sub-title">Compra de {qtyUnit(added, edit)} (vai para as despesas)</h4>
                  <div className="form-grid">
                    <Field label={`Custo por ${unitOf(edit) === 'un' ? 'unidade' : unitOf(edit)} (R$)`} hint={buyTotal ? `Total: ${money(buyTotal)}` : 'Vazio = não lança despesa'}><input inputMode="decimal" value={edit.buyCost || ''} onChange={(e) => setEdit({ ...edit, buyCost: e.target.value })} placeholder="0,00" /></Field>
                    <Field label="Pago com"><select value={edit.buyPayment || 'Pix'} onChange={(e) => setEdit({ ...edit, buyPayment: e.target.value })}>{['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Boleto'].map((o) => <option key={o}>{o}</option>)}</select></Field>
                    <Field label="Situação"><select value={edit.buyPaid || 'pago'} onChange={(e) => setEdit({ ...edit, buyPaid: e.target.value })}><option value="pago">Pago agora</option><option value="apagar">A pagar</option></select></Field>
                    {edit.buyPaid === 'apagar' && <>
                      <Field label="Em quantas vezes"><select value={edit.buyInstallments || 1} onChange={(e) => setEdit({ ...edit, buyInstallments: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? '1x' : `${n}x${buyTotal ? ` de ${money(buyTotal / n)}` : ''}`}</option>)}</select></Field>
                      <Field label="1º vencimento"><input type="date" value={edit.buyDue || today()} onChange={(e) => setEdit({ ...edit, buyDue: e.target.value })} /></Field>
                    </>}
                  </div>
                </div>
              )}
              <label className="toggle-row span-2"><span><b>Só uso interno (insumo)</b><small>Agulha, luva, gaze… Não aparece para vender no Caixa; sai do estoque pelos procedimentos.</small></span><span className="switch"><input type="checkbox" checked={!!edit.internal} onChange={(e) => setEdit({ ...edit, internal: e.target.checked })} /><span /></span></label>
              {edit.id && parseQty(edit.stock) < origStock && <p className="muted small span-2">Baixando o estoque de {qtyUnit(origStock, edit)} para {qtyUnit(parseQty(edit.stock), edit)} (ajuste, perda ou uso interno). Não mexe no financeiro. Vendas já baixam o estoque sozinhas no Caixa.</p>}
            </>)}
            <Field label="Status"><select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
            <p className="muted small span-2">Exemplo: {money(parseMoney(edit.price))} com {edit.commission || 0}% → profissional recebe {money(parseMoney(edit.price) * parseMoney(edit.commission) / 100)}.</p>
            {isSvc && team.length > 0 && (
              <div className="span-2 ov-box">
                <h4 className="sub-title">Tempo e comissão por profissional</h4>
                <p className="muted small">Quanto tempo cada profissional leva neste procedimento. Em branco = usa o padrão.</p>
                <div className="ov-table">
                  <div className="ov-row ov-head"><span>Profissional</span><span>Tempo (min)</span><span>Comissão (%)</span></div>
                  {team.map((b) => (
                    <div key={b.id} className="ov-row">
                      <span><b>{b.name}</b><small>{b.bio || 'Profissional'}</small></span>
                      <input inputMode="numeric" aria-label={`Tempo de ${b.name}`} placeholder={String(edit.duration || 30)} value={ov[b.id]?.duration ?? ''} onChange={(e) => setOne(b.id, 'duration', onlyDigits(e.target.value).slice(0, 3))} />
                      <input inputMode="decimal" aria-label={`Comissão de ${b.name}`} placeholder={String(b.serviceRate ?? edit.commission ?? '')} value={ov[b.id]?.commission ?? ''} onChange={(e) => setOne(b.id, 'commission', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.').slice(0, 5))} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ============================== EQUIPE ============================== */
const COLORS = ['#B08A4A', '#86672F', '#C49A8A', '#8C6E63', '#6F7A6A', '#A7988A', '#4F5B66', '#2E2A26']

export function Equipe() {
  const { data, actions, isDemo } = useStore()
  const [edit, setEdit] = useState(null)
  const blank = { name: '', phone: '', pin: '', goal: 6000, color: COLORS[data.barbers.length % COLORS.length], serviceRate: null, productRate: null, daysOff: [0], active: true, bio: '', serviceOverrides: {}, serviceIds: [] }
  const linked = (id) => data.staff?.find((x) => x.barberId === id)?.email || ''
  const save = async () => {
    const { accessEmail: _ae, accessPass: _ap, accessSent: _as, ...clean } = edit
    const r = { ...clean, serviceOverrides: cleanOverrides(edit.serviceOverrides), goal: Number(edit.goal || 0), sort: Number(edit.sort || 0), serviceRate: edit.serviceRate === '' || edit.serviceRate == null ? null : Number(edit.serviceRate), productRate: edit.productRate === '' || edit.productRate == null ? null : Number(edit.productRate), phone: onlyDigits(edit.phone), room: (edit.room || '').replace(/\s+/g, ' ').trim() || null }
    if (!isDemo) delete r.pin
    delete r.photoData
    if (edit.photoData) {
      try { r.photo = await actions.uploadAvatar(edit.id, edit.photoData) } catch (er) { actions.notify(`Foto não enviada: ${er.message}`, 'bad'); return }
    }
    await actions.upsert('barbers', r); setEdit(null)
  }
  const activeIds = data.services.filter((x) => x.active).map((x) => x.id)
  const does = (sid) => !edit?.serviceIds?.length || edit.serviceIds.includes(sid)
  const toggleSvc = (sid) => {
    const cur = edit.serviceIds?.length ? edit.serviceIds.filter((x) => activeIds.includes(x)) : activeIds
    const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]
    if (!next.length) return
    setEdit({ ...edit, serviceIds: next.length === activeIds.length ? [] : next })
  }
  const toggleDay = (d) => setEdit({ ...edit, daysOff: edit.daysOff.includes(d) ? edit.daysOff.filter((x) => x !== d) : [...edit.daysOff, d] })
  const setOv = (sid, k, v) => setEdit({ ...edit, serviceOverrides: { ...(edit.serviceOverrides || {}), [sid]: { ...(edit.serviceOverrides?.[sid] || {}), [k]: v } } })
  const ownCount = (b) => Object.values(b.serviceOverrides || {}).filter((o) => o.duration || o.commission !== undefined && o.commission !== '' && o.commission !== null).length

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Profissionais comissionadas</p><h1 className="page-title">Equipe</h1></div>
        <Button icon={Plus} onClick={() => setEdit(blank)}>Nova profissional</Button>
      </div>
      <div className="cards team">
        {data.barbers.map((b) => (
          <div key={b.id} className={cls('team-card', !b.active && 'inactive')}>
            <Avatar name={b.name} color={b.color} photo={b?.photo} size={56} />
            <b>{b.name}</b>
            <small>{b.bio || 'Profissional'}</small>
            <div className="team-rates">
              <span>Serviços <b>{b.serviceRate != null ? `${b.serviceRate}%` : 'padrão'}</b></span>
              <span>Produtos <b>{b.productRate != null ? `${b.productRate}%` : 'padrão'}</b></span>
            </div>
            <small className="muted">Folga: {b.daysOff?.length ? b.daysOff.map((d) => WD_SHORT[d]).join(', ') : 'nenhuma'}</small>
            {(() => { const rs = data.reviews.filter((r) => r.barberId === b.id); const avg = rs.length ? rs.reduce((a, r) => a + r.stars, 0) / rs.length : 0; return rs.length ? <span className="team-rating"><Stars value={avg} size={12} /> {avg.toFixed(1)} · {rs.length}</span> : null })()}
            <small className="muted">Meta do mês: {money(b.goal || 0)} · {data.photos.filter((p) => p.barberId === b.id).length} fotos</small>
            {b.serviceIds?.length > 0 && <small className="team-ov">Faz {b.serviceIds.filter((id) => data.services.some((x) => x.id === id && x.active)).length} de {data.services.filter((x) => x.active).length} serviços</small>}
            {ownCount(b) > 0 && <small className="team-ov">{ownCount(b)} procedimentos personalizados</small>}
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit({ ...b, serviceRate: b.serviceRate ?? '', productRate: b.productRate ?? '' })}>Editar</Button>
          </div>
        ))}
      </div>
      <ReceptionAccess />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar profissional' : 'Nova profissional'} footer={<Button block onClick={save} disabled={!edit?.name}>Salvar</Button>}>
        {edit && (
          <div className="form-grid">
            <div className="span-2 photo-pick">
              <Avatar name={edit.name || '?'} color={edit.color} size={72} photo={edit.photoData || edit.photo} />
              <div>
                <b>Foto da profissional</b>
                <small className="muted">Aparece no site, na agenda e no painel. Use uma foto de rosto, bem iluminada.</small>
                <div className="range">
                  <label className="btn btn-ghost btn-sm">{edit.photo || edit.photoData ? 'Trocar foto' : 'Escolher foto'}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const { dataUrl } = await compressImage(f, 480, 0.8); setEdit((x) => ({ ...x, photoData: dataUrl })) } catch (er) { actions.notify(er.message, 'bad') } }} /></label>
                  {(edit.photo || edit.photoData) && <button type="button" className="link" onClick={() => setEdit({ ...edit, photo: null, photoData: null })}>Remover</button>}
                </div>
              </div>
            </div>
            <Field label="Nome" required className="span-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="WhatsApp"><input inputMode="tel" value={maskPhone(edit.phone)} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Sala (opcional)" hint="Quem divide a mesma sala: use o mesmo nome."><input value={edit.room || ''} onChange={(e) => setEdit({ ...edit, room: e.target.value })} placeholder="Ex.: Sala 2" /></Field>
            <Field label="Almoço (opcional)" hint="Vazio = usa o intervalo geral de Ajustes">
              <div className="range">
                <input type="time" aria-label="Início do almoço" value={edit.lunch?.[0] || ''} onChange={(e) => setEdit({ ...edit, lunch: e.target.value ? [e.target.value, edit.lunch?.[1] || '13:00'] : null })} />
                <input type="time" aria-label="Fim do almoço" value={edit.lunch?.[1] || ''} disabled={!edit.lunch} onChange={(e) => setEdit({ ...edit, lunch: [edit.lunch[0], e.target.value] })} />
              </div>
            </Field>
            {isDemo ? <Field label="PIN de acesso (4 dígitos)"><input inputMode="numeric" maxLength={4} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: onlyDigits(e.target.value).slice(0, 4) })} /></Field>
              : <div className="span-2 ov-box">
                  <h4 className="sub-title">Acesso da profissional {linked(edit.id) ? <small className="muted">· ativo: {linked(edit.id)}</small> : ''}</h4>
                  {!edit.id ? <p className="muted small">Salve a profissional primeiro. Depois abra de novo para criar o acesso.</p> : (
                    <>
                      <p className="muted small">Digite o e-mail dela e uma senha. O sistema cria o login e já liga a esta profissional. Se o e-mail já existir, a senha é trocada.</p>
                      <div className="form-grid">
                        <Field label="E-mail" required><input type="email" value={edit.accessEmail ?? linked(edit.id)} onChange={(e) => setEdit({ ...edit, accessEmail: e.target.value })} placeholder="email@da.profissional" /></Field>
                        <Field label="Senha" required hint="Mínimo 6 caracteres"><input value={edit.accessPass ?? ''} onChange={(e) => setEdit({ ...edit, accessPass: e.target.value })} placeholder="Ex.: decarlo2026" /></Field>
                      </div>
                      <div className="range">
                        <Button size="sm" disabled={!(edit.accessEmail ?? linked(edit.id))?.includes('@') || (edit.accessPass || '').length < 6} onClick={async () => { const email = (edit.accessEmail ?? linked(edit.id)).trim(); await actions.createStaffLogin(email, edit.accessPass, edit.id); setEdit({ ...edit, accessEmail: email, accessSent: { email, pass: edit.accessPass } }) }}>{linked(edit.id) ? 'Atualizar acesso' : 'Criar acesso'}</Button>
                        {edit.accessSent && onlyDigits(edit.phone).length >= 10 && <a className="btn btn-wa btn-sm" target="_blank" rel="noreferrer" href={waLink(edit.phone, `Olá, ${edit.name.split(' ')[0]}! Seu acesso ao sistema da ${data.settings.shopName || 'De Carlo Beauty'}:\n🔗 ${location.origin}${location.pathname}#/painel\n📧 ${edit.accessSent.email}\n🔑 ${edit.accessSent.pass}\nEntre em "Área da equipe" e ative as notificações. 🦋`)}>Enviar acesso no WhatsApp</a>}
                      </div>
                    </>
                  )}
                </div>}
            <Field label="Meta de faturamento no mês (R$)" className="span-2" hint="Usada nos Destaques do mês"><input inputMode="numeric" value={edit.goal ?? ''} onChange={(e) => setEdit({ ...edit, goal: onlyDigits(e.target.value) })} /></Field>
            <Field label="Especialidade" className="span-2"><input value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} placeholder="Ex.: Degradê e navalha" /></Field>
            <Field label="Comissão serviços (%)" hint="Vazio = usa o % de cada serviço"><input inputMode="numeric" value={edit.serviceRate} onChange={(e) => setEdit({ ...edit, serviceRate: e.target.value })} placeholder="padrão" /></Field>
            <Field label="Comissão produtos (%)" hint="Vazio = usa o % de cada produto"><input inputMode="numeric" value={edit.productRate} onChange={(e) => setEdit({ ...edit, productRate: e.target.value })} placeholder="padrão" /></Field>
            <Field label="Dias de folga" className="span-2">
              <div className="days">{WD_SHORT.map((d, i) => <button key={d} type="button" className={cls('pill', edit.daysOff.includes(i) && 'on')} onClick={() => toggleDay(i)}>{d}</button>)}</div>
            </Field>
            <Field label="Ordem na agenda" hint="1 = primeira coluna"><input inputMode="numeric" value={edit.sort ?? ''} onChange={(e) => setEdit({ ...edit, sort: e.target.value.replace(/\D/g, '') })} placeholder="1" /></Field>
            <Field label="Cor" className="span-2">
              <div className="days">{COLORS.map((c) => <button key={c} type="button" className={cls('swatch', edit.color === c && 'on')} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label={c} />)}</div>
            </Field>
            <Field label="Status"><select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
            <div className="span-2 ov-box">
              <h4 className="sub-title">Serviços que ela faz · tempo e comissão</h4>
              <p className="muted small">Desmarque o que ela não faz. Tempo e comissão em branco usam o padrão.</p>
              <div className="ov-table with-check">
                <div className="ov-row ov-head"><span>Faz</span><span>Procedimento</span><span>Tempo (min)</span><span>Comissão (%)</span></div>
                {data.services.filter((x) => x.active).map((x) => (
                  <div key={x.id} className={cls('ov-row', !does(x.id) && 'ov-off')}>
                    <input type="checkbox" className="ov-check" aria-label={`Faz ${x.name}`} checked={does(x.id)} onChange={() => toggleSvc(x.id)} />
                    <span><b>{x.name}</b><small>padrão {x.duration} min · {x.commission}%</small></span>
                    <input inputMode="numeric" aria-label={`Tempo de ${x.name}`} placeholder={String(x.duration)} value={edit.serviceOverrides?.[x.id]?.duration ?? ''} onChange={(e) => setOv(x.id, 'duration', onlyDigits(e.target.value).slice(0, 3))} />
                    <input inputMode="decimal" aria-label={`Comissão de ${x.name}`} placeholder={String(edit.serviceRate !== '' && edit.serviceRate != null ? edit.serviceRate : x.commission)} value={edit.serviceOverrides?.[x.id]?.commission ?? ''} onChange={(e) => setOv(x.id, 'commission', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.').slice(0, 5))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/**
 * Recepção: login de trabalho sem financeiro (agenda de todas, clientes e caixa; sem estorno, despesas,
 * comissões, Lucro real, relatórios, ajustes e equipe). Precisa do supabase/RECEPCAO.sql rodado.
 */
function ReceptionAccess() {
  const { data, actions, isDemo } = useStore()
  const [f, setF] = useState(null) // { name, email, pass, sent }
  const list = (data.staff || []).filter((x) => x.role === 'reception')
  const ok = f && f.name.trim() && f.email.includes('@') && f.pass.length >= 6
  const create = async () => {
    const email = f.email.trim().toLowerCase()
    await actions.createReceptionLogin(email, f.pass, f.name.trim())
    setF({ ...f, email, sent: { email, pass: f.pass } })
  }
  return (
    <Card title="Recepção" className="mt">
      <p className="muted small">Acesso só de trabalho: agenda de todas as profissionais, clientes (com o WhatsApp completo) e caixa. <b>Não vê</b> Lucro real, despesas, comissões, relatórios, ajustes nem a equipe, e não estorna vendas.</p>
      {isDemo && <p className="muted small">No modo demonstração, entre com o PIN <b>0000</b> para ver como fica.</p>}
      {list.length > 0 && (
        <div className="list compact mt-sm">
          {list.map((x) => (
            <div key={x.userId || x.email} className="appt-row">
              <span className="appt-info"><b>{x.name}</b><small>{x.email || 'sem e-mail'}</small></span>
              {x.email && <Button variant="ghost" size="sm" icon={Trash2} onClick={async () => { if (await actions.confirm(`Tirar o acesso de recepção de ${x.name} (${x.email})?`, 'Tirar acesso')) await actions.unlinkReception(x.email) }}>Tirar acesso</Button>}
            </div>
          ))}
        </div>
      )}
      {!isDemo && (f ? (
        <div className="ov-box mt-sm">
          <div className="form-grid">
            <Field label="Nome" required><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Ana (recepção)" /></Field>
            <Field label="WhatsApp" hint="Opcional · para mandar o acesso"><input inputMode="tel" value={maskPhone(f.phone || '')} onChange={(e) => setF({ ...f, phone: onlyDigits(e.target.value) })} /></Field>
            <Field label="E-mail" required><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="email@da.recepcao" /></Field>
            <Field label="Senha" required hint="Mínimo 6 caracteres. Se o e-mail já existir, a senha é trocada."><input value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} /></Field>
          </div>
          <div className="range">
            <Button size="sm" disabled={!ok} onClick={create}>Criar acesso da recepção</Button>
            {f.sent && onlyDigits(f.phone).length >= 10 && <a className="btn btn-wa btn-sm" target="_blank" rel="noreferrer" href={waLink(f.phone, `Olá, ${f.name.trim().split(' ')[0]}! Seu acesso ao sistema da ${data.settings.shopName || 'Lu Wolcher Estética Avançada'}:\n🔗 ${location.origin}${location.pathname}#/painel\n📧 ${f.sent.email}\n🔑 ${f.sent.pass}\nEntre em "Área da equipe". 🦋`)}>Enviar acesso no WhatsApp</a>}
            <button type="button" className="link" onClick={() => setF(null)}>fechar</button>
          </div>
        </div>
      ) : <Button variant="ghost" size="sm" icon={Plus} className="mt-sm" onClick={() => setF({ name: '', email: '', pass: '', phone: '' })}>Novo acesso de recepção</Button>)}
    </Card>
  )
}

/** Remove linhas vazias e converte para número */
function cleanOverrides(o = {}) {
  const out = {}
  for (const [k, v] of Object.entries(o || {})) {
    const d = v?.duration === '' || v?.duration == null ? null : Number(v.duration)
    const c = v?.commission === '' || v?.commission == null ? null : Number(v.commission)
    if ((d && d > 0) || (c !== null && !Number.isNaN(c))) out[k] = { ...(d && d > 0 ? { duration: d } : {}), ...(c !== null && !Number.isNaN(c) ? { commission: c } : {}) }
  }
  return out
}

/** Campos da profissional que vão para o banco (sem os calculados na tela) */
const stripBarber = ({ id, name, phone, pin, color, serviceRate, productRate, daysOff, active, bio, goal, serviceOverrides, serviceIds, lunch, room, photo }) =>
  ({ id, name, phone, pin, color, serviceRate, productRate, daysOff, active, bio, goal, serviceOverrides, serviceIds: serviceIds || [], lunch: lunch || null, room: room || null })