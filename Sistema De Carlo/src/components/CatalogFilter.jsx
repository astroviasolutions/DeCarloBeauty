import { useEffect, useState } from 'react'
import { ChevronDown, Filter, Search, X } from 'lucide-react'
import { cls } from '../lib/utils'

/** Busca sem acento/maiúscula */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Categoria do serviço/produto: campo "category" ou a 1ª parte da descrição "Categoria · detalhes" */
export const catOf = (x) => (x.category ? String(x.category).trim() : String(x.description || '').includes(' · ') ? String(x.description).split(' · ')[0].trim() : '')

/** Opções do filtro: categorias + estados úteis (estoque baixo, inativos, só interno) */
export function catalogCats(list, isSvc) {
  const cats = [...new Set(list.map(catOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }))
  const states = isSvc
    ? [list.some((x) => x.online === false) && { value: '__internal', label: 'Só interno' }, list.some((x) => !x.active) && { value: '__off', label: 'Inativos' }]
    : [list.some((x) => x.active && Number(x.stock) <= 3) && { value: '__low', label: 'Estoque baixo' }, list.some((x) => !x.active) && { value: '__off', label: 'Inativos' }]
  return [...cats, ...states.filter(Boolean)]
}
export function catalogMatch(x, cat) {
  if (cat === '__low') return x.active && Number(x.stock) <= 3
  if (cat === '__off') return !x.active
  if (cat === '__internal') return x.online === false
  return catOf(x) === cat
}

/**
 * Lista agrupada por categoria, cada grupo abre/fecha (lembra no navegador).
 * Buscando, mostra tudo aberto para nada ficar escondido.
 */
export function CatalogGroups({ items, storageKey, forceOpen = false, noun = 'itens', wrapClass, children }) {
  const read = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] } }
  const [closed, setClosed] = useState(read)
  const save = (next) => { setClosed(next); try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* sem armazenamento */ } }
  useEffect(() => { setClosed(read()) }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = Object.entries(items.reduce((m, x) => { const c = catOf(x) || 'Sem categoria'; (m[c] ||= []).push(x); return m }, {}))
    .sort((a, b) => (a[0] === 'Sem categoria') - (b[0] === 'Sem categoria') || a[0].localeCompare(b[0]))
  const single = groups.length === 1
  const label = (c) => (single && c === 'Sem categoria' ? `Todos os ${noun}` : c)
  const allClosed = groups.every(([c]) => closed.includes(c))
  return (
    <div className="cat-groups">
      {!forceOpen && groups.length > 1 && <button type="button" className="link cat-groups-all" onClick={() => save(allClosed ? [] : groups.map(([c]) => c))}>{allClosed ? 'Abrir tudo' : 'Recolher tudo'}</button>}
      {groups.map(([c, list]) => {
        const open = forceOpen || !closed.includes(c)
        return (
          <section key={c} className={cls('cat-group', !open && 'shut')}>
            <button type="button" className="cat-group-head" aria-expanded={open} disabled={forceOpen} onClick={() => save(open ? [...closed, c] : closed.filter((x) => x !== c))}>
              <ChevronDown size={16} className="cat-group-chev" /> <b>{label(c)}</b> <small>{list.length}</small>
              {!forceOpen && <span className="cat-group-hint">{open ? 'esconder' : 'mostrar'}</span>}
            </button>
            {open && <div className={wrapClass}>{list.map(children)}</div>}
          </section>
        )
      })}
    </div>
  )
}

/** Barra de busca + filtros recolhíveis (abre/fecha no botão "Filtros") */
export default function CatalogFilter({ q, setQ, cats, cat, setCat, show, setShow, placeholder = 'Buscar…', count, compact = false }) {
  return (
    <div className={cls('cat-filter', compact && 'compact')}>
      <div className="cat-filter-bar">
        <div className="search"><Search size={16} /><input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" className="icon-btn sm" aria-label="Limpar busca" onClick={() => setQ('')}><X size={14} /></button>}</div>
        {cats.length > 0 && <button type="button" className={cls('pill', (show || cat) && 'on')} onClick={() => setShow(!show)} aria-expanded={show}><Filter size={14} /> Filtros{cat ? ' (1)' : ''}</button>}
        {count !== undefined && !compact && <small className="muted">{count} {count === 1 ? 'item' : 'itens'}</small>}
      </div>
      {show && cats.length > 0 && (
        <div className="cat-filter-chips">
          <button type="button" className={cls('pill', !cat && 'on')} onClick={() => setCat('')}>Todos</button>
          {cats.map((c) => <button key={c.value} type="button" className={cls('pill', cat === c.value && 'on')} onClick={() => setCat(cat === c.value ? '' : c.value)}>{c.label}</button>)}
        </div>
      )}
    </div>
  )
}
