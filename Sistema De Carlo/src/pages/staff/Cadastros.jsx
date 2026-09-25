import { useMemo, useState } from 'react'
import { Camera, Crown, Gift, Megaphone, MessageCircle, Package, Pencil, Plus, Search, Send, Sparkles, Trash2, Users } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Avatar, Badge, Button, Card, Empty, Field, Modal, Segmented } from '../../components/ui'
import { serviceNames } from '../../components/Appointments'
import { ClientPortfolio, RuneMeter, Stars } from '../../components/Loyalty'
import { clubOf, isBirthdayMonth, loyaltyOf } from '../../lib/loyalty'
import { cls, fmtDate, fmtPhone, maskPhone, money, onlyDigits, sum, today, waLink, WD_SHORT, addDays } from '../../lib/utils'
import { bookingLink, MESSAGES, msg as fillMsg } from '../../lib/messages'

/* ============================== CLIENTES ============================== */
export function Clientes() {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState('todos')

  const rows = useMemo(() => data.clients.map((c) => clientStats(c, data)), [data])

  const filtered = rows
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || onlyDigits(c.phone).includes(onlyDigits(q) || '###'))
    .sort((a, b) => sort === 'spent' ? b.spent - a.spent : sort === 'name' ? a.name.localeCompare(b.name) : (b.last || '').localeCompare(a.last || ''))
  const sumido = (c) => c.last && c.last < addDays(today(), -30) && !c.next

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">{data.clients.length} clientes</p><h1 className="page-title">Clientes</h1></div>
        <div className="head-actions">
          <div className="search"><Search size={16} /><input placeholder="Nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Segmented value={view} onChange={setView} options={[{ value: 'todos', label: 'Todos' }, { value: 'campanha', label: `Campanha de volta (${rows.filter(sumido).length})` }]} />
          {view === 'todos' && <Segmented value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recentes' }, { value: 'spent', label: 'Top gasto' }, { value: 'name', label: 'A-Z' }]} />}
        </div>
      </div>
      {view === 'campanha' ? <Campaign rows={rows} /> : (
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Cliente</th><th>WhatsApp</th><th className="r">Visitas</th><th className="r">Portfólio</th><th>Fidelidade</th><th className="r">Gasto total</th><th>Última visita</th><th>Próximo</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setSel(c)}>
                  <td><div className="who"><Avatar name={c.name} color="#2a2424" size={30} /><b>{c.name}</b>{c.club && <Badge tone="club"><Crown size={11} /> {c.club.plan.name}</Badge>}{isBirthdayMonth(c.birthday) && <Badge tone="info"><Gift size={11} /> Aniversário</Badge>}{sumido(c) && <Badge tone="warn">Sumido</Badge>}</div></td>
                  <td>{fmtPhone(c.phone)}</td>
                  <td className="r">{c.visits}</td>
                  <td className="r">{c.photos ? <span className="photo-count"><Camera size={13} /> {c.photos}</span> : '—'}</td>
                  <td><span className="rune-mini">{c.loy.level.rune} {c.loy.progress}/{c.loy.goal}</span>{c.loy.available > 0 && <Badge tone="good">{c.loy.available} grátis</Badge>}</td>
                  <td className="r">{money(c.spent)}</td>
                  <td>{c.last ? fmtDate(c.last) : '—'}</td>
                  <td>{c.next ? `${fmtDate(c.next.date)} ${c.next.time}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty icon={Users} title="Nenhum cliente encontrado" />}
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
    ...c, loy: loyaltyOf(c.id, data.sales, data.settings), club: clubOf(c.id, data), visits: sales.length, spent: sum(sales, (s) => s.total), last,
    photos: data.photos.filter((p) => p.clientId === c.id).length,
    noShows: appts.filter((a) => a.status === 'faltou').length,
    next: appts.filter((a) => a.date >= today() && ['agendado', 'confirmado'].includes(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0],
  }
}

/** Ficha da cliente. `restricted` = visão da profissional (sem contato nem WhatsApp). */
export function ClientModal({ c: raw, onClose, restricted = false }) {
  const { data, actions, session } = useStore()
  const c = raw.loy ? raw : clientStats(raw, data)
  const [notes, setNotes] = useState(c.notes || '')
  const [an, setAn] = useState({ ...ANAMNESE_BLANK, ...(c.anamnese || {}) })
  const setA = (k, v) => setAn((x) => ({ ...x, [k]: v }))
  const [bday, setBday] = useState(c.birthday ? `${c.birthday.slice(3)}/${c.birthday.slice(0, 2)}` : '')
  const bdayISO = (() => { const d = onlyDigits(bday); return d.length === 4 ? `${d.slice(2)}-${d.slice(0, 2)}` : '' })()
  const history = data.appointments.filter((a) => a.clientId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  const back = fillMsg(data.settings, 'callClient', { nome: c.name.split(' ')[0], link: bookingLink() })
  return (
    <Modal open onClose={onClose} title={c.name} footer={<Button block onClick={async () => { await actions.upsert('clients', { ...stripClient(c), notes, anamnese: an, birthday: bdayISO || c.birthday || '' }, 'Cliente atualizado'); onClose() }}>Salvar</Button>}>
      <div className="mini-kpis row">
        <div><b>{c.visits}</b> visitas</div><div><b>{money(c.spent)}</b> gasto</div><div><b>{c.noShows}</b> faltas</div>
      </div>
      <RuneMeter loyalty={c.loy} />
      {c.club && <p className="muted small mt-sm"><Crown size={13} /> Clube {c.club.plan.name} · {c.club.paid ? 'mensalidade em dia' : 'mensalidade pendente'}</p>}
      {!restricted && onlyDigits(c.phone).length >= 10 && <a className="btn btn-wa btn-block mt" href={waLink(c.phone, back)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Chamar no WhatsApp</a>}
      <div className="form-grid mt">
        <Field label="Aniversário (dd/mm)"><input inputMode="numeric" value={bday} onChange={(e) => { const d = onlyDigits(e.target.value).slice(0, 4); setBday(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d) }} placeholder="dd/mm" /></Field>
        <Field label="Observações"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preferências, tipo de pele, observações…" /></Field>
      </div>
      <h4 className="sub-title">Ficha de anamnese</h4>
      {anamneseAlerts(an).length > 0 && <div className="an-alerts">{anamneseAlerts(an).map((t) => <span key={t} className="badge badge-warn">{t}</span>)}</div>}
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
      <h4 className="sub-title">Portfólio da cliente</h4>
      <ClientPortfolio client={c} barberId={session?.barberId} />
      <h4 className="sub-title">Histórico</h4>
      <div className="list compact">
        {history.slice(0, 12).map((a) => (
          <div key={a.id} className="sale-row">
            <span className="appt-time">{fmtDate(a.date)}</span>
            <span className="appt-info"><b>{serviceNames(a, data.services)}</b><small>{data.barbers.find((b) => b.id === a.barberId)?.name} · {a.time}</small></span>
            <Badge tone={a.status === 'concluido' ? 'good' : a.status === 'faltou' ? 'warn' : a.status === 'cancelado' ? 'bad' : 'neutral'}>{a.status}</Badge>
          </div>
        ))}
        {!history.length && <p className="muted">Sem histórico ainda.</p>}
      </div>
    </Modal>
  )
}
const stripClient = ({ id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt }) => ({ id, name, phone, notes, anamnese, createdAt, birthday, lastCampaignAt })

/* Ficha de anamnese (estética) */
const ANAMNESE_BLANK = { skin: '', phototype: '', allergies: '', meds: '', conditions: '', pregnant: false, acids: false, sun: false, consent: false }
export function anamneseAlerts(a = {}) {
  const out = []
  if (a.allergies) out.push(`Alergia: ${a.allergies}`)
  if (a.pregnant) out.push('Gestante/lactante')
  if (a.acids) out.push('Usa ácidos/retinoides')
  if (a.sun) out.push('Sol recente')
  if (a.meds) out.push(`Medicação: ${a.meds}`)
  if (a.conditions) out.push(a.conditions)
  return out
}

/* ============================== CAMPANHA DE VOLTA ============================== */
function Campaign({ rows }) {
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
              <span className="appt-info"><b>{c.name}</b><small>{c.visits} visitas · {money(c.spent)}</small></span>
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
export function Catalogo() {
  const { data, actions } = useStore()
  const [tab, setTab] = useState('services')
  const [edit, setEdit] = useState(null)
  const list = data[tab].slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
  const isSvc = tab === 'services'
  const blank = isSvc ? { name: '', description: '', duration: 30, price: 0, commission: 50, active: true, order: list.length + 1 } : { name: '', price: 0, stock: 0, commission: 10, active: true }

  const save = async () => {
    const row = { ...edit, price: Number(edit.price), commission: Number(edit.commission) }
    if (isSvc) row.duration = Number(edit.duration); else row.stock = Number(edit.stock)
    await actions.upsert(tab, row); setEdit(null)
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Preços e regras de comissão</p><h1 className="page-title">Catálogo</h1></div>
        <div className="head-actions">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'services', label: 'Serviços' }, { value: 'products', label: 'Produtos' }]} />
          <Button icon={Plus} onClick={() => setEdit(blank)}>{isSvc ? 'Novo serviço' : 'Novo produto'}</Button>
        </div>
      </div>
      <div className="cards">
        {list.map((x) => (
          <div key={x.id} className={cls('item-card', !x.active && 'inactive')}>
            <span className="tile-ico">{isSvc ? <Sparkles size={18} /> : <Package size={18} />}</span>
            <div className="item-main">
              <b>{x.name}</b>
              <small>{isSvc ? `${x.duration} min` : `${x.stock} em estoque`} · comissão {x.commission}%</small>
            </div>
            <b className="item-price">{money(x.price)}</b>
            {!x.active && <Badge>Inativo</Badge>}
            {!isSvc && Number(x.stock) <= 3 && x.active && <Badge tone="warn">Estoque baixo</Badge>}
            <button className="icon-btn sm" onClick={() => setEdit(x)} aria-label="Editar"><Pencil size={16} /></button>
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar' : 'Cadastrar'} footer={
        <div className="foot-row">
          {edit?.id && <Button variant="danger" icon={Trash2} onClick={async () => { if (await actions.confirm(`Excluir ${edit.name}? Essa ação não pode ser desfeita.`, 'Excluir')) { await actions.remove(tab, edit.id); setEdit(null) } }}>Excluir</Button>}
          <Button onClick={save} disabled={!edit?.name}>Salvar</Button>
        </div>
      }>
        {edit && (
          <div className="form-grid">
            <Field label="Nome" className="span-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            {isSvc && <Field label="Descrição" className="span-2"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>}
            <Field label="Preço (R$)"><input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label="Comissão (%)"><input inputMode="numeric" value={edit.commission} onChange={(e) => setEdit({ ...edit, commission: e.target.value })} /></Field>
            {isSvc ? (
              <Field label="Duração (min)"><select value={edit.duration} onChange={(e) => setEdit({ ...edit, duration: e.target.value })}>{[15, 30, 45, 60, 75, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
            ) : (
              <Field label="Estoque"><input inputMode="numeric" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} /></Field>
            )}
            <Field label="Status"><select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
            <p className="muted small span-2">Exemplo: {money(edit.price)} com {edit.commission || 0}% → profissional recebe {money((Number(edit.price) || 0) * (Number(edit.commission) || 0) / 100)}.</p>
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
  const blank = { name: '', phone: '', pin: '', goal: 6000, color: COLORS[data.barbers.length % COLORS.length], serviceRate: null, productRate: null, daysOff: [0], active: true, bio: '', serviceOverrides: {} }
  const linked = (id) => data.staff?.find((x) => x.barberId === id)?.email || ''
  const save = async () => {
    const { accessEmail: _ae, ...clean } = edit
    const r = { ...clean, serviceOverrides: cleanOverrides(edit.serviceOverrides), goal: Number(edit.goal || 0), serviceRate: edit.serviceRate === '' || edit.serviceRate == null ? null : Number(edit.serviceRate), productRate: edit.productRate === '' || edit.productRate == null ? null : Number(edit.productRate), phone: onlyDigits(edit.phone) }
    if (!isDemo) delete r.pin
    await actions.upsert('barbers', r); setEdit(null)
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
            <Avatar name={b.name} color={b.color} size={56} />
            <b>{b.name}</b>
            <small>{b.bio || 'Profissional'}</small>
            <div className="team-rates">
              <span>Serviços <b>{b.serviceRate != null ? `${b.serviceRate}%` : 'padrão'}</b></span>
              <span>Produtos <b>{b.productRate != null ? `${b.productRate}%` : 'padrão'}</b></span>
            </div>
            <small className="muted">Folga: {b.daysOff?.length ? b.daysOff.map((d) => WD_SHORT[d]).join(', ') : 'nenhuma'}</small>
            {(() => { const rs = data.reviews.filter((r) => r.barberId === b.id); const avg = rs.length ? rs.reduce((a, r) => a + r.stars, 0) / rs.length : 0; return rs.length ? <span className="team-rating"><Stars value={avg} size={12} /> {avg.toFixed(1)} · {rs.length}</span> : null })()}
            <small className="muted">Meta do mês: {money(b.goal || 0)} · {data.photos.filter((p) => p.barberId === b.id).length} fotos</small>
            {ownCount(b) > 0 && <small className="team-ov">{ownCount(b)} procedimentos personalizados</small>}
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEdit({ ...b, serviceRate: b.serviceRate ?? '', productRate: b.productRate ?? '' })}>Editar</Button>
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar profissional' : 'Nova profissional'} footer={<Button block onClick={save} disabled={!edit?.name}>Salvar</Button>}>
        {edit && (
          <div className="form-grid">
            <Field label="Nome" className="span-2"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="WhatsApp"><input inputMode="tel" value={maskPhone(edit.phone)} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            {isDemo ? <Field label="PIN de acesso (4 dígitos)"><input inputMode="numeric" maxLength={4} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: onlyDigits(e.target.value).slice(0, 4) })} /></Field>
              : <Field label="E-mail de acesso" hint={linked(edit.id) ? `Vinculado: ${linked(edit.id)}` : 'Crie o usuário em Supabase → Authentication e vincule aqui'}>
                  <div className="range"><input type="email" value={edit.accessEmail ?? ''} onChange={(e) => setEdit({ ...edit, accessEmail: e.target.value })} placeholder={linked(edit.id) || 'email@da.profissional'} />
                    <Button variant="ghost" size="sm" disabled={!edit.id || !edit.accessEmail?.includes('@')} onClick={() => actions.linkStaff(edit.accessEmail, edit.id)}>Vincular</Button></div>
                </Field>}
            <Field label="Meta de faturamento no mês (R$)" className="span-2" hint="Usada nos Destaques do mês"><input inputMode="numeric" value={edit.goal ?? ''} onChange={(e) => setEdit({ ...edit, goal: onlyDigits(e.target.value) })} /></Field>
            <Field label="Especialidade" className="span-2"><input value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} placeholder="Ex.: Degradê e navalha" /></Field>
            <Field label="Comissão serviços (%)" hint="Vazio = usa o % de cada serviço"><input inputMode="numeric" value={edit.serviceRate} onChange={(e) => setEdit({ ...edit, serviceRate: e.target.value })} placeholder="padrão" /></Field>
            <Field label="Comissão produtos (%)" hint="Vazio = usa o % de cada produto"><input inputMode="numeric" value={edit.productRate} onChange={(e) => setEdit({ ...edit, productRate: e.target.value })} placeholder="padrão" /></Field>
            <Field label="Dias de folga" className="span-2">
              <div className="days">{WD_SHORT.map((d, i) => <button key={d} type="button" className={cls('pill', edit.daysOff.includes(i) && 'on')} onClick={() => toggleDay(i)}>{d}</button>)}</div>
            </Field>
            <Field label="Cor" className="span-2">
              <div className="days">{COLORS.map((c) => <button key={c} type="button" className={cls('swatch', edit.color === c && 'on')} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label={c} />)}</div>
            </Field>
            <Field label="Status"><select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Field>
            <div className="span-2 ov-box">
              <h4 className="sub-title">Procedimentos desta profissional</h4>
              <p className="muted small">Deixe em branco para usar o tempo e a comissão padrão do Catálogo. O tempo muda os horários livres no agendamento.</p>
              <div className="ov-table">
                <div className="ov-row ov-head"><span>Procedimento</span><span>Tempo (min)</span><span>Comissão (%)</span></div>
                {data.services.filter((x) => x.active).map((x) => (
                  <div key={x.id} className="ov-row">
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
