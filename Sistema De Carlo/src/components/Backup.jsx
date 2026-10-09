import { useState } from 'react'
import { DatabaseBackup } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useStore } from '../state/Store'
import { Button } from './ui'
import { fmtDate, safeLS, today } from '../lib/utils'

const SHEETS = { clients: 'Clientes', appointments: 'Agendamentos', sales: 'Vendas', services: 'Serviços', products: 'Produtos', barbers: 'Equipe', plans: 'Planos', subscriptions: 'Assinaturas', waitlist: 'Lista de espera', blocks: 'Bloqueios', reviews: 'Avaliações', payouts: 'Pagamentos comissão', cash: 'Caixa', expenses: 'Despesas', promos: 'Promoções', announcements: 'Avisos', photos: 'Fotos', settings: 'Ajustes', packages: 'Pacotes', client_files: 'Anexos' }
const cell = (v) => {
  if (v == null) return ''
  if (typeof v === 'object') v = JSON.stringify(v)
  if (typeof v === 'string' && v.startsWith('data:')) return '(imagem)'
  return typeof v === 'string' && v.length > 32000 ? v.slice(0, 32000) : v
}

/** Backup completo: uma planilha com uma aba por tabela (abre no Excel/Google Planilhas) */
export default function Backup() {
  const { data, actions } = useStore()
  const [busy, setBusy] = useState(false)
  const last = safeLS.get('lastBackup')
  const run = async () => {
    setBusy(true)
    try {
      const all = await actions.backup()
      const wb = XLSX.utils.book_new()
      for (const [k, name] of Object.entries(SHEETS)) {
        const rows = [].concat(all[k] || []).map((r) => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, cell(b)])))
        XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(vazio)']]), name.slice(0, 31))
      }
      const shop = (data.settings?.shopName || 'sistema').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').toLowerCase()
      XLSX.writeFile(wb, `backup-${shop}-${today()}.xlsx`)
      safeLS.set('lastBackup', today())
      actions.notify('Backup baixado. Guarde no Google Drive ou no computador.')
    } catch (e) { actions.notify(e.message || 'Não foi possível gerar o backup', 'bad') } finally { setBusy(false) }
  }
  // cópia exata (sem cortar textos), usada para conferir e restaurar dados
  const runJson = async () => {
    setBusy(true)
    try {
      const all = await actions.backup()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...all })], { type: 'application/json' }))
      a.download = `backup-tecnico-${today()}.json`; a.click()
      actions.notify('Backup técnico baixado')
    } catch (e) { actions.notify(e.message || 'Não foi possível gerar o backup', 'bad') } finally { setBusy(false) }
  }
  return (
    <div>
      <p className="muted small mb-sm">Baixa todos os dados (clientes, agenda, vendas, equipe, catálogo e mais) numa planilha. Faça uma vez por mês e guarde no Google Drive.{last ? ` Último backup neste aparelho: ${fmtDate(last)}.` : ''}</p>
      <div className="head-actions">
        <Button icon={DatabaseBackup} disabled={busy} onClick={run}>{busy ? 'Gerando…' : 'Baixar backup completo'}</Button>
        <Button variant="ghost" disabled={busy} onClick={runJson}>Backup técnico (JSON)</Button>
      </div>
    </div>
  )
}
