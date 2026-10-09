import { useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useStore } from '../state/Store'
import { Button } from './ui'
import { fmtPhone, money, onlyDigits } from '../lib/utils'

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const num = (v) => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const col = (row, ...keys) => { for (const k of Object.keys(row)) { const nk = norm(k); if (keys.some((x) => nk.startsWith(x))) return row[k] } return '' }
const bday = (v) => {
  if (v instanceof Date) return `${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  const d = onlyDigits(v); if (d.length < 4) return ''
  return `${d.slice(2, 4)}-${d.slice(0, 2)}`
}

function classify(rows) {
  const keys = Object.keys(rows[0] || {}).map(norm)
  if (keys.some((k) => k.startsWith('whats') || k.startsWith('telefone') || k.startsWith('celular'))) return 'clients'
  if (keys.some((k) => k.startsWith('dura'))) return 'services'
  if (keys.some((k) => k.startsWith('estoque'))) return 'products'
  return null
}

export function parseWorkbook(wb) {
  const out = { services: [], products: [], clients: [] }
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true, cellDates: true })
    if (!rows.length) continue
    const n = norm(name)
    const kind = n.startsWith('serv') ? 'services' : n.startsWith('prod') ? 'products' : n.startsWith('client') ? 'clients' : classify(rows)
    if (!kind) continue
    for (const r of rows) {
      const nome = String(col(r, 'nome', 'servico', 'produto', 'cliente')).trim()
      if (!nome) continue
      if (kind === 'services') out.services.push({ name: nome, price: num(col(r, 'preco', 'valor')), duration: num(col(r, 'dura')) || 30, commission: num(col(r, 'comiss')) || 50, description: String(col(r, 'descr') || '') })
      if (kind === 'products') out.products.push({ name: nome, price: num(col(r, 'preco', 'valor')), stock: num(col(r, 'estoque', 'qtd', 'quant')), commission: num(col(r, 'comiss')) || 10 })
      if (kind === 'clients') { const phone = onlyDigits(col(r, 'whats', 'telefone', 'celular', 'fone')); if (phone.length >= 10) out.clients.push({ name: nome, phone, birthday: bday(col(r, 'aniver', 'nasc')) }) }
    }
  }
  return out
}

export function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Nome: 'Limpeza de Pele', 'Preço': 180, 'Duração (min)': 90, 'Comissão (%)': 40, 'Descrição': 'Extração, peeling e máscara' },
    { Nome: 'Drenagem Linfática', 'Preço': 140, 'Duração (min)': 60, 'Comissão (%)': 40, 'Descrição': 'Manual, 60 minutos' },
  ]), 'Serviços')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Nome: 'Pomada', 'Preço': 45, Estoque: 10, 'Comissão (%)': 15 }]), 'Produtos')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Nome: 'João Silva', WhatsApp: '(41) 99999-0000', 'Aniversário (dd/mm)': '12/09' }]), 'Clientes')
  XLSX.writeFile(wb, 'modelo-barber-berserker.xlsx')
}

export default function Importer() {
  const { actions } = useStore()
  const [preview, setPreview] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setErr(''); setPreview(null)
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true })
      const p = parseWorkbook(wb)
      if (!p.services.length && !p.products.length && !p.clients.length) throw new Error('Não encontrei serviços, produtos ou clientes. Use o modelo (abas Serviços, Produtos e Clientes).')
      setPreview({ ...p, file: f.name })
    } catch (er) { setErr(er.message || 'Não foi possível ler a planilha') }
  }
  const run = async () => {
    setBusy(true)
    try { const n = await actions.bulkImport(preview); actions.notify(`${n} registros importados`); setPreview(null) } finally { setBusy(false) }
  }

  return (
    <div className="importer">
      <p className="muted small">Envie a planilha do cliente (Excel ou CSV) e o sistema já nasce com serviços, produtos e clientes cadastrados. Itens com o mesmo nome ou telefone são atualizados, não duplicados.</p>
      <div className="head-actions mt-sm">
        <label className="btn btn-primary"><Upload size={16} /> Escolher planilha<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} /></label>
        <Button variant="ghost" icon={Download} onClick={downloadTemplate}>Baixar modelo</Button>
      </div>
      {err && <p className="form-err mt-sm">{err}</p>}
      {preview && (
        <div className="import-preview fade-in">
          <p className="import-file"><FileSpreadsheet size={16} /> {preview.file}</p>
          <div className="mini-kpis row">
            <div><b>{preview.services.length}</b> serviços</div><div><b>{preview.products.length}</b> produtos</div><div><b>{preview.clients.length}</b> clientes</div>
          </div>
          <ul className="import-sample">
            {preview.services.slice(0, 3).map((x, i) => <li key={`s${i}`}>{x.name} · {money(x.price)} · {x.duration} min · {x.commission}%</li>)}
            {preview.products.slice(0, 2).map((x, i) => <li key={`p${i}`}>{x.name} · {money(x.price)} · estoque {x.stock}</li>)}
            {preview.clients.slice(0, 3).map((x, i) => <li key={`c${i}`}>{x.name} · {fmtPhone(x.phone)}{x.birthday ? ` · 🎂 ${x.birthday.slice(3)}/${x.birthday.slice(0, 2)}` : ''}</li>)}
          </ul>
          <Button block disabled={busy} onClick={run}>{busy ? 'Importando…' : 'Importar tudo'}</Button>
        </div>
      )}
    </div>
  )
}
