import { useEffect, useState } from 'react'
import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { useStore } from '../state/Store'
import { db } from '../data'
import { Empty } from './ui'

const MAX = 10 * 1024 * 1024 // 10 MB por arquivo
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Anexos da cliente: termos assinados, exames, fotos, PDFs. Privados (só a equipe logada abre). */
export default function ClientFiles({ client, canDelete }) {
  const { actions, session } = useStore()
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => db.clientFiles(client.id).then(setList)
  useEffect(() => { load() }, [client.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        if (f.size > MAX) { actions.notify(`${f.name} passa de 10 MB`, 'bad'); continue }
        await db.uploadClientFile(client.id, f, session?.name || '')
      }
      actions.notify('Anexo salvo'); await load()
    } catch (er) { actions.notify(er.message || 'Não foi possível enviar', 'bad') } finally { setBusy(false) }
  }
  // abre a aba já no clique (senão o navegador bloqueia como pop-up) e depois carrega o link temporário
  const open = async (f) => { const w = window.open('', '_blank'); try { const url = await db.clientFileUrl(f); if (w) w.location.href = url; else window.location.href = url } catch (er) { w?.close(); actions.notify(er.message, 'bad') } }
  const del = async (f) => {
    if (!(await actions.confirm(`Excluir o anexo "${f.name}"? Não dá para desfazer.`, 'Excluir'))) return
    try { await db.deleteClientFile(f); await load() } catch (er) { actions.notify(er.message, 'bad') }
  }

  return (
    <div className="pkg-box">
      <label className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}><Paperclip size={15} /> {busy ? 'Enviando…' : 'Adicionar arquivo'}<input type="file" multiple hidden disabled={busy} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={add} /></label>
      <p className="muted small">Termos assinados, exames, fotos, receitas. Até 10 MB por arquivo. Só a equipe logada consegue abrir.</p>
      {list === null && <p className="muted small">Carregando…</p>}
      {list?.length === 0 && <Empty title="Nenhum anexo" text="Os arquivos desta cliente aparecem aqui." />}
      {list?.map((f) => (
        <div key={f.id} className="pkg-row">
          <div className="pkg-head">
            <button className="link" onClick={() => open(f)}><FileText size={14} /> {f.name}</button>
            <small>{new Date(f.createdAt).toLocaleDateString('pt-BR')}{f.size ? ` · ${kb(f.size)}` : ''}{f.createdBy ? ` · ${f.createdBy}` : ''}</small>
            {canDelete && <button className="icon-btn sm" aria-label="Excluir anexo" onClick={() => del(f)}><Trash2 size={15} /></button>}
          </div>
        </div>
      ))}
    </div>
  )
}
