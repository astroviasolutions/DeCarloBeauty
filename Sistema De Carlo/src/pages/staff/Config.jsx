import { useEffect, useState } from 'react'
import { BellRing, Copy, ExternalLink, Send, EyeOff, MessageCircle, RotateCcw, Save, Tv } from 'lucide-react'
import { BRAND } from '../../config/brand'
import { MESSAGES } from '../../lib/messages'
import { disablePush, enablePush, pushStatus, sendTestPush } from '../../lib/push'
import { NOTIFY_DEFAULTS } from '../../components/Notifier'
import { Link } from 'react-router-dom'
import Importer from '../../components/Importer'
import Backup from '../../components/Backup'
import { useStore } from '../../state/Store'
import { Button, Card, Field } from '../../components/ui'
import { maskPhone, onlyDigits, WEEKDAYS } from '../../lib/utils'

export default function Config() {
  const { data, actions, isDemo } = useStore()
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(data.settings)))
  const link = `${location.origin}${location.pathname}#/`

  const setDay = (d, v) => setS({ ...s, hours: { ...s.hours, [d]: v } })
  const [msgKey, setMsgKey] = useState(MESSAGES[0].key)
  const cur = MESSAGES.find((m) => m.key === msgKey)
  const setMsg = (k, v) => setS({ ...s, messages: { ...(s.messages || {}), [k]: v } })
  const notify = { ...NOTIFY_DEFAULTS, ...(s.notify || {}) }
  const setNotify = (k, v) => setS({ ...s, notify: { ...notify, [k]: v } })
  const privacy = { hideContacts: true, ...(s.privacy || {}) }
  const rules = { extraMode: 'avg', extraRate: 50, discountReduces: true, ...(privacy.commission || {}) }
  const setRule = (k, v) => setS({ ...s, privacy: { ...privacy, commission: { ...rules, [k]: v } } })
  const page = s.page || {}
  const setPage = (k, v) => setS({ ...s, page: { ...page, [k]: v } })

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Sua clínica</p><h1 className="page-title">Ajustes</h1></div>
        <Button icon={Save} onClick={() => actions.saveSettings({ ...s, whatsapp: onlyDigits(s.whatsapp), slotStep: Number(s.slotStep), bookingDaysAhead: Number(s.bookingDaysAhead), birthdayDiscount: Number(s.birthdayDiscount || 0), loyalty: { ...s.loyalty, goal: Number(s.loyalty?.goal || 10) } })}>Salvar</Button>
      </div>
      <div className="grid-2">
        <Card title="Dados da clínica">
          <div className="form-grid">
            <Field label="Nome exibido no app" className="span-2"><input value={s.shopName} onChange={(e) => setS({ ...s, shopName: e.target.value })} /></Field>
            <Field label="WhatsApp da clínica" hint="Recebe as confirmações dos clientes"><input inputMode="tel" value={maskPhone(s.whatsapp)} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} /></Field>
            <Field label="Instagram"><input value={s.instagram} onChange={(e) => setS({ ...s, instagram: e.target.value })} /></Field>
            <Field label="Endereço" className="span-2"><input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
            <Field label="Intervalo da agenda"><select value={s.slotStep} onChange={(e) => setS({ ...s, slotStep: e.target.value })}>{[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
            <Field label="Agenda aberta para"><select value={s.bookingDaysAhead} onChange={(e) => setS({ ...s, bookingDaysAhead: e.target.value })}>{[7, 14, 21, 30, 60].map((m) => <option key={m} value={m}>{m} dias</option>)}</select></Field>
            <Field label="Pausa almoço (opcional)" className="span-2">
              <div className="range">
                <input type="time" value={s.breakTime?.[0] || ''} onChange={(e) => setS({ ...s, breakTime: e.target.value ? [e.target.value, s.breakTime?.[1] || '13:00'] : null })} />
                <input type="time" value={s.breakTime?.[1] || ''} disabled={!s.breakTime} onChange={(e) => setS({ ...s, breakTime: [s.breakTime[0], e.target.value] })} />
              </div>
            </Field>
          </div>
        </Card>
        <Card title="Horário de funcionamento">
          <div className="hours">
            {WEEKDAYS.map((w, d) => {
              const h = s.hours[d]
              return (
                <div key={d} className="hour-row">
                  <label className="switch"><input type="checkbox" checked={!!h} onChange={(e) => setDay(d, e.target.checked ? ['09:00', '19:00'] : null)} /><span /></label>
                  <b>{w}</b>
                  {h ? (
                    <div className="range">
                      <input type="time" value={h[0]} onChange={(e) => setDay(d, [e.target.value, h[1]])} />
                      <input type="time" value={h[1]} onChange={(e) => setDay(d, [h[0], e.target.value])} />
                    </div>
                  ) : <span className="muted">Fechado</span>}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
      <div className="grid-2 mt">
        <Card title="Fidelidade e benefícios">
          <div className="toggles">
            <label className="toggle-row"><span><b>Cartão Fidelidade</b><small>Cada visita marca um ponto no cartão</small></span><span className="switch"><input type="checkbox" checked={s.loyalty?.enabled !== false} onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, enabled: e.target.checked } })} /><span /></span></label>
            <div className="form-grid">
              <Field label="Visitas para ganhar"><input inputMode="numeric" value={s.loyalty?.goal ?? 10} onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, goal: onlyDigits(e.target.value) } })} /></Field>
              <Field label="Prêmio"><select value={s.loyalty?.rewardServiceId || ''} onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, rewardServiceId: e.target.value } })}>{data.services.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </div>
            <label className="toggle-row"><span><b>Clube (assinatura)</b><small>Mostra os planos no app</small></span><span className="switch"><input type="checkbox" checked={s.clubEnabled !== false} onChange={(e) => setS({ ...s, clubEnabled: e.target.checked })} /><span /></span></label>
            <label className="toggle-row"><span><b>Lista de espera</b><small>Cliente pede vaga quando não há horário</small></span><span className="switch"><input type="checkbox" checked={s.waitlistEnabled !== false} onChange={(e) => setS({ ...s, waitlistEnabled: e.target.checked })} /><span /></span></label>
            <div className="form-grid">
              <Field label="Desconto de aniversário (%)"><input inputMode="numeric" value={s.birthdayDiscount ?? 15} onChange={(e) => setS({ ...s, birthdayDiscount: onlyDigits(e.target.value) })} /></Field>
              <Field label="Link de avaliação do Google" hint="Quem der 4 ou 5 estrelas é convidado a avaliar no Google"><input value={s.googleReviewUrl || ''} onChange={(e) => setS({ ...s, googleReviewUrl: e.target.value })} placeholder="https://g.page/r/..." /></Field>
            </div>
          </div>
        </Card>
        <Card title="Importar planilha"><Importer /></Card>
        <Card title="Backup dos dados"><Backup /></Card>
      </div>
      <div className="grid-2 mt">
        <Card title="Mensagens do WhatsApp">
          <p className="muted small">Edite os textos que o sistema prepara para o WhatsApp. As palavras entre chaves são trocadas automaticamente.</p>
          <div className="msg-edit mt-sm">
            <Field label="Mensagem">
              <select value={msgKey} onChange={(e) => setMsgKey(e.target.value)}>
                {MESSAGES.map((m) => <option key={m.key} value={m.key}>{m.label}{(s.messages?.[m.key] || '').trim() ? ' · editada' : ''}</option>)}
              </select>
            </Field>
            <p className="field-hint">{cur.who}</p>
            <Field label="Texto"><textarea rows={7} value={(s.messages?.[msgKey] ?? '') || cur.text} onChange={(e) => setMsg(msgKey, e.target.value)} /></Field>
            <div className="msg-vars">{cur.vars.map((v) => <button key={v} type="button" className="pill" onClick={() => setMsg(msgKey, `${(s.messages?.[msgKey] ?? '') || cur.text}{${v}}`)}>{`{${v}}`}</button>)}</div>
            <div className="foot-row">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setMsg(msgKey, '')}>Voltar ao padrão</Button>
              <span className="muted small"><MessageCircle size={13} /> Clique em Salvar no topo</span>
            </div>
          </div>
        </Card>
        <div className="stack">
          <Card title="Página de agendamento">
            <div className="form-grid">
              <Field label="Frase de destaque" className="span-2"><textarea rows={2} value={page.heroText ?? ''} placeholder={BRAND.heroText} onChange={(e) => setPage('heroText', e.target.value)} /></Field>
              <Field label="Aviso para as clientes (opcional)" className="span-2" hint="Aparece no topo do site. Também dá para editar em Avisos."><textarea rows={2} value={page.notice ?? ''} placeholder="Ex.: Feriado dia 12/10, estaremos fechados." onChange={(e) => setPage('notice', e.target.value)} /></Field>
            </div>
          </Card>
          <Card title="Privacidade da equipe">
            <label className="toggle-row"><span><b><EyeOff size={14} /> Ocultar contato das clientes</b><small>As profissionais não veem telefone nem WhatsApp das clientes. Só a gestão.</small></span><span className="switch"><input type="checkbox" checked={privacy.hideContacts !== false} onChange={(e) => setS({ ...s, privacy: { ...privacy, hideContacts: e.target.checked } })} /><span /></span></label>
            <div className="toggle-row"><span><b>Quem pode agendar pelo painel</b><small>Todas podem marcar horários na própria agenda. Toque para bloquear (fica riscado).</small></span></div>
            <div className="days">
              {data.barbers.filter((b) => b.active).map((b) => { const off = (privacy.bookingBlocked || []).includes(b.id); return <button key={b.id} type="button" className={`pill ${off ? '' : 'on'}`} style={off ? { textDecoration: 'line-through', opacity: 0.6 } : undefined} onClick={() => setS({ ...s, privacy: { ...privacy, bookingBlocked: off ? privacy.bookingBlocked.filter((x) => x !== b.id) : [...(privacy.bookingBlocked || []), b.id] } })}>{b.name.split(' ')[0]}</button> })}
            </div>
            <div className="toggle-row"><span><b>Quem pode cobrar (Caixa)</b><small>A gestão sempre pode. Marque quem mais pode lançar cobranças.</small></span></div>
            <div className="days">
              {data.barbers.filter((b) => b.active).map((b) => { const on = (privacy.billingAllowed || []).includes(b.id); return <button key={b.id} type="button" className={`pill ${on ? 'on' : ''}`} onClick={() => setS({ ...s, privacy: { ...privacy, billingAllowed: on ? privacy.billingAllowed.filter((x) => x !== b.id) : [...(privacy.billingAllowed || []), b.id] } })}>{b.name.split(' ')[0]}</button> })}
            </div>
            <p className="muted small mt-sm">Cada profissional vê só a própria agenda, o próprio extrato e os avisos dela.</p>
          </Card>
          <Card title="Agenda sobreposta (tempo de pausa)">
            <p className="muted small mb-sm">Para quem precisa marcar outra cliente enquanto um procedimento está em pausa (ex.: coloração agindo). Só vale para agendamentos feitos pelo painel; o site das clientes continua sem sobreposição.</p>
            <div className="toggle-row"><span><b>Quem pode sobrepor</b><small>Toque para liberar (ex.: as profissionais do cabelo).</small></span></div>
            <div className="days">
              {data.barbers.filter((b) => b.active).map((b) => { const on = (privacy.overlap?.barbers || []).includes(b.id); return <button key={b.id} type="button" className={`pill ${on ? 'on' : ''}`} onClick={() => setS({ ...s, privacy: { ...privacy, overlap: { max: 2, ...(privacy.overlap || {}), barbers: on ? (privacy.overlap?.barbers || []).filter((x) => x !== b.id) : [...(privacy.overlap?.barbers || []), b.id] } } })}>{b.name.split(' ')[0]}</button> })}
            </div>
            <Field label="Atendimentos ao mesmo tempo (máximo)">
              <select value={privacy.overlap?.max || 2} onChange={(e) => setS({ ...s, privacy: { ...privacy, overlap: { barbers: [], ...(privacy.overlap || {}), max: Number(e.target.value) } } })}>
                <option value={2}>2 clientes</option><option value={3}>3 clientes</option><option value={4}>4 clientes</option>
              </select>
            </Field>
          </Card>
          <Card title="Regras de comissão">
            <p className="muted small mb-sm">A % de cada atendimento segue esta ordem: 1) % do procedimento para aquela profissional (Equipe → Editar → Procedimentos); 2) % geral da profissional (Equipe); 3) % do procedimento no Catálogo.</p>
            <Field label="Adicional cobrado no caixa">
              <select value={rules.extraMode} onChange={(e) => setRule('extraMode', e.target.value)}>
                <option value="avg">Mesma % dos serviços da venda</option>
                <option value="fixed">Uma % fixa</option>
                <option value="none">Sem comissão (fica para a clínica)</option>
              </select>
            </Field>
            {rules.extraMode === 'fixed' && <Field label="% do adicional"><input inputMode="decimal" value={rules.extraRate} onChange={(e) => setRule('extraRate', e.target.value.replace(',', '.'))} /></Field>}
            <label className="toggle-row"><span><b>Desconto reduz a comissão</b><small>Ligado: a profissional recebe sobre o valor cobrado. Desligado: recebe sobre o preço cheio e a clínica absorve o desconto.</small></span><span className="switch"><input type="checkbox" checked={rules.discountReduces !== false} onChange={(e) => setRule('discountReduces', e.target.checked)} /><span /></span></label>
            <p className="muted small mt-sm">Vale para as próximas cobranças. As já lançadas não mudam.</p>
          </Card>
        </div>
      </div>
      <div className="grid-2 mt">
        <Card title="Notificações da equipe">
          <div className="toggles">
            <label className="toggle-row"><span><b>Pop-up de novo agendamento</b><small>Avisa a profissional (e a gestão) quando entra um horário</small></span><span className="switch"><input type="checkbox" checked={notify.newBooking !== false} onChange={(e) => setNotify('newBooking', e.target.checked)} /><span /></span></label>
            <label className="toggle-row"><span><b>Resumo do dia</b><small>Ao abrir o painel, mostra quantos atendimentos a profissional tem hoje</small></span><span className="switch"><input type="checkbox" checked={notify.dailySummary !== false} onChange={(e) => setNotify('dailySummary', e.target.checked)} /><span /></span></label>
            <label className="toggle-row"><span><b>Notificação do navegador</b><small>Também avisa com o site em segundo plano (cada aparelho precisa permitir)</small></span><span className="switch"><input type="checkbox" checked={notify.browser !== false} onChange={(e) => setNotify('browser', e.target.checked)} /><span /></span></label>
            <div className="form-grid">
              <Field label="Lembrete antes do atendimento"><select value={notify.reminderMinutes} onChange={(e) => setNotify('reminderMinutes', Number(e.target.value))}>{[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m ? `${m} min antes` : 'Desligado'}</option>)}</select></Field>
              <Field label="Atualizar a agenda a cada"><select value={notify.pollSeconds} onChange={(e) => setNotify('pollSeconds', Number(e.target.value))}>{[60, 120, 300].map((m) => <option key={m} value={m}>{m < 60 ? `${m} s` : `${m / 60} min`}</option>)}</select></Field>
            </div>
            <h4 className="toggles-head">Avisos no celular</h4>
            <p className="muted small">Chegam mesmo com o site fechado. Quem fez a ação não recebe o próprio aviso.</p>
            {PUSH_EVENTS.map(([k, t, d]) => (
              <label key={k} className="toggle-row"><span><b>{t}</b><small>{d}</small></span><span className="switch"><input type="checkbox" checked={notify[k] !== false} onChange={(e) => setNotify(k, e.target.checked)} /><span /></span></label>
            ))}
            <div className="form-grid">
              <Field label="Resumo da agenda no celular"><select value={notify.summaryTime || ''} onChange={(e) => setNotify('summaryTime', e.target.value)}><option value="">Desligado</option>{['06:30', '07:00', '07:30', '08:00', '08:30', '09:00'].map((h) => <option key={h} value={h}>Todo dia às {h}</option>)}</select></Field>
              <Field label="Avisar estoque baixo"><select value={notify.lowStock} onChange={(e) => setNotify('lowStock', Number(e.target.value))}><option value={0}>Desligado</option>{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>Quando restar {n} ou menos</option>)}</select></Field>
            </div>
            <label className="toggle-row"><span><b>Avisar também o que eu mesmo fiz</b><small>Bom para testar sozinha. Depois do teste, pode desligar.</small></span><span className="switch"><input type="checkbox" checked={!!notify.selfToo} onChange={(e) => setNotify('selfToo', e.target.checked)} /><span /></span></label>
            <PushPanel />
          </div>
        </Card>
        <Card title="Modo TV da recepção">
          <p className="muted small">Abra numa TV ou tablet na recepção: mostra quem está na cadeira, os próximos clientes e um QR code para agendar.</p>
          <Link className="btn btn-primary mt-sm" to="/tv"><Tv size={16} /> Abrir modo TV</Link>
        </Card>
        <Card title="Link de agendamento">
          <p className="muted small">Coloque na bio do Instagram, no Google Meu Negócio e no status do WhatsApp.</p>
          <div className="copy-link"><code>{link}</code>
            <Button variant="ghost" size="sm" icon={Copy} onClick={() => { navigator.clipboard?.writeText(link).then(() => actions.notify('Link copiado')).catch(() => actions.notify('Selecione o link e copie manualmente', 'bad')) }}>Copiar</Button>
            <a className="btn btn-ghost btn-sm" href="#/" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir</a>
          </div>
        </Card>
        {isDemo && (
          <Card title="Modo demonstração">
            <p className="muted small">Os dados desta demonstração ficam salvos só neste navegador. Restaure para voltar aos dados de exemplo.</p>
            <Button variant="danger" icon={RotateCcw} onClick={async () => (await actions.confirm('Restaurar todos os dados de exemplo? O que foi lançado nesta demonstração será apagado.', 'Restaurar')) && actions.resetDemo()}>Restaurar dados de exemplo</Button>
          </Card>
        )}
      </div>
    </div>
  )
}

const PUSH_EVENTS = [
  ['cancel', 'Cancelamento', 'Gestão e profissional. Mostra quem cancelou e se há lista de espera no dia'],
  ['reschedule', 'Remarcação ou troca de profissional', 'Gestão e as profissionais envolvidas'],
  ['confirm', 'Horário confirmado', 'Gestão e profissional'],
  ['noShow', 'Cliente faltou', 'Gestão'],
  ['sales', 'Atendimento concluído e vendas', 'Gestão: valor, forma de pagamento e profissional'],
  ['reviews', 'Nova avaliação', 'Gestão e a profissional avaliada'],
  ['waitlist', 'Lista de espera', 'Gestão, quando uma cliente entra na lista'],
  ['clientReminders', 'Lembretes para a cliente', '1 dia, 1 hora e 15 min antes, no celular de quem ativou no site. Ela também é avisada quando a equipe confirma, remarca ou cancela'],
]

/** Notificações neste aparelho (push) — usado em Ajustes e no Meu dia da profissional */
export function PushPanel() {
  const { actions, isDemo } = useStore()
  const [st, setSt] = useState('...')
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushStatus().then(setSt) }, [])
  const run = async (fn) => { setBusy(true); try { await fn() } catch (e) { actions.notify(e.message, 'bad') } finally { setBusy(false) } }
  const label = {
    on: 'Ativadas neste aparelho. Chegam mesmo com o site fechado.',
    local: isDemo ? 'Permitidas (na demonstração, só com o site aberto).' : 'Permitidas, mas o envio pelo servidor ainda não foi configurado.',
    off: 'Ainda não ativadas neste aparelho.',
    denied: 'Bloqueadas. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.',
    'ios-install': 'No iPhone: toque em Compartilhar → “Adicionar à Tela de Início”, abra pelo ícone e ative aqui.',
    unsupported: 'Este navegador não recebe notificações. No Android use o Chrome; no iPhone, instale na tela de início.',
    '...': 'Verificando…',
  }[st]
  return (
    <div className="push-panel">
      <p className={`push-status st-${st}`}><BellRing size={15} /> {label}</p>
      <div className="foot-row">
        {(st === 'off' || st === 'local') && !isDemo && <Button size="sm" icon={BellRing} disabled={busy} onClick={() => run(async () => { const r = await enablePush(); setSt(r); if (r === 'on') actions.notify('Notificações ativadas neste aparelho') })}>Ativar neste aparelho</Button>}
        {st === 'on' && <Button size="sm" variant="ghost" icon={Send} disabled={busy} onClick={() => run(async () => { const r = await sendTestPush(); actions.notify(`Teste enviado para ${r.sent} aparelho${r.sent > 1 ? 's' : ''}`) })}>Enviar teste</Button>}
        {st === 'on' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => setSt(await disablePush()))}>Desativar</Button>}
      </div>
    </div>
  )
}
