import { useState } from 'react'
import { Check, Globe, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../state/Store'
import { Avatar, Badge, Button, Card, Empty, Field, Modal } from '../../components/ui'
import { fmtDate, today } from '../../lib/utils'

const when = (iso) => (iso ? `${fmtDate(String(iso).slice(0, 10))} ${String(iso).slice(11, 16)}`.trim() : '')

/** Gestão: avisos para a equipe (pop-up no painel) e aviso no site para as clientes */
export default function Avisos() {
  const { data, actions } = useStore()
  const [edit, setEdit] = useState(null)
  const [siteNotice, setSiteNotice] = useState(data.settings.page?.notice || '')
  const team = data.barbers.filter((b) => b.active)
  const list = (data.announcements || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const audienceOf = (n) => (!n.audience || n.audience === 'all' ? team : team.filter((b) => b.id === n.audience))
  const blank = { title: '', message: '', audience: 'all', important: false, expiresAt: '', active: true }
  const save = async () => {
    await actions.upsert('announcements', { ...edit, expiresAt: edit.expiresAt || null, createdAt: edit.createdAt || new Date().toISOString(), reads: edit.reads || {} }, edit.id ? 'Aviso atualizado' : 'Aviso publicado')
    setEdit(null)
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Pop-up no painel da equipe</p><h1 className="page-title">Avisos</h1></div>
        <Button icon={Plus} onClick={() => setEdit(blank)}>Novo aviso</Button>
      </div>
      <div className="grid-2 avisos">
        <Card title="Avisos para a equipe" pad={false}>
          {list.length ? (
            <div className="list">
              {list.map((n) => {
                const aud = audienceOf(n)
                const read = aud.filter((b) => n.reads?.[b.id])
                const expired = n.expiresAt && n.expiresAt < today()
                return (
                  <div key={n.id} className="aviso-row">
                    <div className="aviso-top">
                      <span className="appt-info"><b>{n.title}</b><small>{when(n.createdAt)} · {n.audience === 'all' || !n.audience ? 'Toda a equipe' : aud[0]?.name || 'Profissional'}</small></span>
                      {n.important && <Badge tone="warn">Importante</Badge>}
                      {expired ? <Badge>Encerrado</Badge> : n.active === false ? <Badge>Pausado</Badge> : <Badge tone="good">{read.length}/{aud.length} ciente</Badge>}
                      <button className="icon-btn sm" onClick={() => setEdit({ ...n, expiresAt: n.expiresAt || '' })} aria-label="Editar aviso"><Pencil size={16} /></button>
                    </div>
                    <p className="aviso-msg">{n.message}</p>
                    <div className="aviso-reads">
                      {aud.map((b) => (
                        <span key={b.id} className={n.reads?.[b.id] ? 'on' : ''} title={n.reads?.[b.id] ? `Ciente em ${when(n.reads[b.id])}` : 'Ainda não leu'}>
                          <Avatar name={b.name} color={b.color} size={22} /> {b.name.split(' ')[0]} {n.reads?.[b.id] ? <Check size={13} /> : '·'}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <Empty icon={Megaphone} title="Nenhum aviso ainda" text="O aviso aparece como pop-up quando a profissional abrir o painel, até ela tocar em Ciente." />}
        </Card>
        <Card title="Aviso no site para as clientes">
          <p className="muted small">Aparece no topo da página de agendamento. Ex.: feriado, horário especial, promoção da semana. Deixe vazio para não mostrar.</p>
          <Field label="Texto do aviso" className="mt-sm"><textarea rows={4} value={siteNotice} onChange={(e) => setSiteNotice(e.target.value)} placeholder="Ex.: Dia 12/10 não abriremos. Agende para o dia 13 ✨" /></Field>
          <div className="foot-row mt-sm">
            {data.settings.page?.notice && <Button variant="ghost" onClick={async () => { await actions.saveSettings({ ...data.settings, page: { ...(data.settings.page || {}), notice: '' } }); setSiteNotice('') }}>Remover</Button>}
            <Button icon={Globe} onClick={() => actions.saveSettings({ ...data.settings, page: { ...(data.settings.page || {}), notice: siteNotice.trim() } })}>Publicar no site</Button>
          </div>
        </Card>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar aviso' : 'Novo aviso'} footer={
        <div className="foot-row">
          {edit?.id && <Button variant="danger" icon={Trash2} onClick={async () => { if (await actions.confirm('Excluir este aviso?', 'Excluir')) { await actions.remove('announcements', edit.id); setEdit(null) } }}>Excluir</Button>}
          <Button onClick={save} disabled={!edit?.title?.trim() || !edit?.message?.trim()}>{edit?.id ? 'Salvar' : 'Publicar'}</Button>
        </div>
      }>
        {edit && (
          <div className="form-grid">
            <Field label="Título" className="span-2"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ex.: Reunião de equipe sexta às 18h" /></Field>
            <Field label="Mensagem" className="span-2"><textarea rows={5} value={edit.message} onChange={(e) => setEdit({ ...edit, message: e.target.value })} placeholder="Escreva o aviso para a equipe" /></Field>
            <Field label="Para quem">
              <select value={edit.audience || 'all'} onChange={(e) => setEdit({ ...edit, audience: e.target.value })}>
                <option value="all">Toda a equipe</option>
                {team.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Válido até (opcional)"><input type="date" min={today()} value={edit.expiresAt || ''} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} /></Field>
            <label className="toggle-row span-2"><span><b>Marcar como importante</b><small>O pop-up aparece com destaque</small></span><span className="switch"><input type="checkbox" checked={!!edit.important} onChange={(e) => setEdit({ ...edit, important: e.target.checked })} /><span /></span></label>
            {edit.id && <label className="toggle-row span-2"><span><b>Aviso ativo</b><small>Desligue para pausar sem apagar</small></span><span className="switch"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /><span /></span></label>}
            {edit.id && <p className="muted small span-2">Quem já tocou em Ciente não vê de novo. Para reenviar a todas, crie um aviso novo.</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Profissional: histórico dos avisos recebidos */
export function MeusAvisos() {
  const { data, session, actions } = useStore()
  const me = session.barberId
  const list = (data.announcements || []).filter((n) => n.active !== false && (!n.audience || n.audience === 'all' || n.audience === me))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return (
    <div>
      <div className="page-head"><div><p className="eyebrow">Da gestão para você</p><h1 className="page-title">Avisos</h1></div></div>
      <Card pad={false}>
        {list.length ? (
          <div className="list">
            {list.map((n) => (
              <div key={n.id} className="aviso-row">
                <div className="aviso-top">
                  <span className="appt-info"><b>{n.title}</b><small>{when(n.createdAt)}{n.expiresAt ? ` · até ${fmtDate(n.expiresAt)}` : ''}</small></span>
                  {n.important && <Badge tone="warn">Importante</Badge>}
                  {n.reads?.[me] ? <Badge tone="good">Ciente</Badge> : <Button size="sm" icon={Check} onClick={() => actions.markRead(n.id)}>Ciente</Button>}
                </div>
                <p className="aviso-msg">{n.message}</p>
              </div>
            ))}
          </div>
        ) : <Empty icon={Megaphone} title="Nenhum aviso" text="Quando a gestão publicar um aviso, ele aparece aqui e como pop-up." />}
      </Card>
    </div>
  )
}
