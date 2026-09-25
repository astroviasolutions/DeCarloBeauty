import { useEffect, useState } from 'react'
import { safeLS } from './utils'

const KEY = 'dcb:theme'
const root = () => document.documentElement

/** Tema inicial: escolha salva → tema do navegador/app hospedeiro → preferência do sistema */
export function initialTheme() {
  const saved = safeLS.get(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'light' // De Carlo abre sempre no claro; o escuro fica como opção
}

export function applyTheme(t) {
  if (root().getAttribute('data-bb-theme') === t) return
  root().setAttribute('data-bb-theme', t)
  window.dispatchEvent(new CustomEvent('bb-theme', { detail: t }))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#FAF6F4' : '#0C1522')
}

export function useTheme() {
  const [theme, setTheme] = useState(() => root().getAttribute('data-bb-theme') || initialTheme())
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    // segue o sistema enquanto a pessoa não escolher manualmente
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const on = () => {}
    const sync = (e) => setTheme(e.detail)
    mq?.addEventListener?.('change', on)
    window.addEventListener('bb-theme', sync)
    return () => { mq?.removeEventListener?.('change', on); window.removeEventListener('bb-theme', sync) }
  }, [])
  const toggle = () => setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; safeLS.set(KEY, n); return n })
  return { theme, toggle }
}
