import { useEffect, useRef, useState } from 'react'

/* ---- Efeitos de produto (Astrovia): números que contam, rosca animada, seda no fundo, revelar ao rolar ---- */
const reduce = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let tap = null
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { tap = { x: e.clientX, y: e.clientY, t: Date.now() } }, true)
/** último toque (para a janela "abrir de onde clicou") */
export const lastTap = () => (tap && Date.now() - tap.t < 900 ? tap : null)

/** anima o primeiro número dentro do texto (R$ 1.234,56 · 19 · 79%) de 0 até o valor */
export function CountUp({ text }) {
  const s = String(text ?? '')
  const m = s.match(/\d[\d.]*(,\d+)?/)
  const [p, setP] = useState(() => (m && !reduce() ? 0 : 1))
  useEffect(() => {
    if (!m || reduce()) { setP(1); return }
    let raf, t0
    const step = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 900); setP(1 - Math.pow(1 - k, 3)); if (k < 1) raf = requestAnimationFrame(step) }
    setP(0); raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || p >= 1) return s
  const raw = m[0]; const dec = raw.includes(',') ? raw.split(',')[1].length : 0
  const num = Number(raw.replace(/\./g, '').replace(',', '.')) || 0
  return s.replace(raw, (num * p).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }))
}

/** gráfico de rosca com entrada animada */
export function Donut({ data, fmt = (v) => v }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const id = setTimeout(() => setOn(true), 60); return () => clearTimeout(id) }, [])
  const R = 70, C = 2 * Math.PI * R
  const total = data.reduce((a, d) => a + d.value, 0)
  const colors = ['var(--v-ac)', 'var(--v-g2)', 'var(--v-g3)', 'var(--v-ac2)', 'var(--v-soft)', 'var(--v-muted)']
  if (!total) return <p className="muted small">Ainda sem vendas de procedimentos este mês.</p>
  let acc = 0
  return (
    <div className="donut">
      <div className="donut-ring">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle cx="90" cy="90" r={R} className="donut-bg" />
          {data.map((d, i) => { const len = (C * d.value) / total; const el = <circle key={i} cx="90" cy="90" r={R} stroke={colors[i % 6]} strokeDasharray={`${on ? Math.max(0, len - 3) : 0} ${C}`} strokeDashoffset={-acc} style={{ transitionDelay: `${i * 110}ms` }} />; acc += len; return el })}
        </svg>
        <div className="donut-c"><small>Total</small><b><CountUp text={fmt(total)} /></b></div>
      </div>
      <ul className="donut-l">{data.map((d, i) => <li key={i} style={{ '--i': i }}><i style={{ background: colors[i % 6] }} /><span>{d.label}</span><b>{Math.round((d.value / total) * 100)}%</b></li>)}</ul>
    </div>
  )
}

/** fundo de seda em movimento lento, nas cores da marca (pausa fora da tela e respeita "menos movimento") */
export function Silk() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const g = c.getContext('2d'); let raf = 0, last = 0, vis = true
    const css = getComputedStyle(document.documentElement)
    const col = ['--v-g1', '--v-g2', '--v-g3'].map((v) => { const x = css.getPropertyValue(v).trim(); return /^#[0-9a-f]{6}$/i.test(x) ? x : '#c9a35f' })
    const size = () => { const r = c.getBoundingClientRect(); const d = Math.min(1.5, window.devicePixelRatio || 1); c.width = Math.max(1, r.width * d); c.height = Math.max(1, r.height * d) }
    const draw = (t) => {
      const w = c.width, h = c.height; g.clearRect(0, 0, w, h)
      for (let k = 0; k < 6; k++) {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, col[k % 3] + '00'); gr.addColorStop(0.5, col[(k + 1) % 3]); gr.addColorStop(1, col[(k + 2) % 3] + '00')
        g.strokeStyle = gr; g.globalAlpha = 0.28 + k * 0.04; g.lineWidth = h * (0.05 + k * 0.012); g.lineCap = 'round'; g.beginPath()
        for (let x = -30; x <= w + 30; x += 14) {
          const y = h * (0.22 + k * 0.1) + Math.sin((x / w) * Math.PI * 2 * (0.55 + k * 0.14) + (t / 2200) * (1 + k * 0.18) + k) * h * 0.08 + Math.sin((x / w) * 7 + t / 3100) * h * 0.02
          if (x < -20) g.moveTo(x, y); else g.lineTo(x, y)
        }
        g.stroke()
      }
      g.globalAlpha = 1
    }
    const loop = (t) => { raf = requestAnimationFrame(loop); if (!vis || t - last < 33) return; last = t; draw(t) }
    size(); window.addEventListener('resize', size)
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting }); io.observe(c)
    if (reduce()) draw(0); else raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', size) }
  }, [])
  return <canvas ref={ref} className="silk" aria-hidden="true" />
}

/** revela elementos (selector) quando entram na tela; usa data-rv para não brigar com o className do React */
export function useReveal(selector, deps = []) {
  useEffect(() => {
    if (reduce()) return
    const els = [...document.querySelectorAll(selector)].filter((e) => !e.dataset.rv)
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.dataset.rv = '2'; io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px' })
    els.forEach((e, i) => { e.dataset.rv = '1'; e.style.setProperty('--rv', `${(i % 6) * 60}ms`); io.observe(e) })
    return () => io.disconnect()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/** título que se monta palavra por palavra */
export function Words({ text, accent }) {
  return text.split(' ').flatMap((w, i) => [<span key={i} className={'v-w' + (w.replace(/[.,!?]/g, '') === accent ? ' v-it' : '')} style={{ '--i': i }}>{w}</span>, ' '])
}

/* ---- toque com pétalas + brilho que segue o cursor nos cartões ---- */
if (typeof window !== 'undefined' && !window.__vfx) {
  window.__vfx = true
  const PET = ['--v-g1', '--v-g2', '--v-g3', '--v-ac2']
  window.addEventListener('pointerdown', (e) => {
    if (reduce() || !document.documentElement.classList.contains('v2')) return
    if (e.target.closest?.('input, textarea, select, .no-petal')) return
    const css = getComputedStyle(document.documentElement)
    const box = document.createElement('div'); box.className = 'v-petals'; box.style.left = e.clientX + 'px'; box.style.top = e.clientY + 'px'
    const n = e.pointerType === 'mouse' ? 5 : 7
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); const a = (Math.PI * 2 * i) / n + Math.random() * 0.6; const d = 34 + Math.random() * 38
      p.style.setProperty('--x', `${Math.cos(a) * d}px`); p.style.setProperty('--y', `${Math.sin(a) * d - 10}px`); p.style.setProperty('--r', `${Math.random() * 300 - 150}deg`)
      p.style.background = css.getPropertyValue(PET[i % PET.length]).trim() || '#E3A59C'; p.style.animationDelay = `${i * 12}ms`
      box.appendChild(p)
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 900)
  }, { passive: true })
  let lastEl = null
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    const el = e.target.closest?.(".card, .stat:not(.stat-accent), .team-card, .info-card")
    if (lastEl && lastEl !== el) lastEl.classList.remove('v-lit')
    if (!el) { lastEl = null; return }
    const r = el.getBoundingClientRect(); el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`); el.classList.add('v-lit'); lastEl = el
  }, { passive: true })
}
