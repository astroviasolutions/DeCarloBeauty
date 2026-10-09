import { useEffect, useMemo, useState } from 'react'
import { CountUp, lastTap } from './fx'
import { ChevronDown, Moon, Sparkles, Sun, X } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { BRAND } from '../config/brand'
import { cls, initials, money, STATUS } from '../lib/utils'
import { useStore } from '../state/Store'

export function Logo({ size = 44, withText = false, light = false, sub }) {
  return (
    <div className="logo">
      <img className="logo-img" src={BRAND.logo} width={size} height={size} alt={BRAND.appName} />
      {withText && (
        <div className="logo-text">
          <span className={cls('wordmark', light && 'light')}>{BRAND.wordmark}</span>
          {sub && <span className="logo-sub">{sub}</span>}
        </div>
      )}
    </div>
  )
}

export function Button({ variant = 'primary', size, icon: Icon, children, className, block, ...p }) {
  return (
    <button className={cls('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className)} {...p}>
      {Icon && <Icon size={size === 'sm' ? 15 : 18} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children, className, required }) {
  // <label> só envolve um campo simples; grupos com botões viram <div role="group">
  const single = children && !Array.isArray(children) && ['input', 'select', 'textarea'].includes(children.type)
  const Tag = single ? 'label' : 'div'
  return (
    <Tag className={cls('field', className)} {...(single ? {} : { role: 'group', 'aria-label': typeof label === 'string' ? label : undefined })}>
      {label && <span className="field-label">{label}{required && <b className="req"> *</b>}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Tag>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  const from = useMemo(() => (open && typeof window !== 'undefined' && window.innerWidth > 600 ? lastTap() : null), [open])
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cls('modal', wide && 'modal-wide', from && 'v-from')} style={from ? { '--dx': `${from.x - window.innerWidth / 2}px`, '--dy': `${from.y - window.innerHeight / 2}px` } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={cls('badge', `badge-${tone}`)}>{children}</span>
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.agendado
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function Avatar({ name, color = '#1F3E66', size = 40, photo }) {
  if (photo) return <span className="avatar has-photo" style={{ width: size, height: size, background: color }}><img src={photo} alt={name || ''} loading="lazy" /></span>
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  )
}

/** Explicação curta: "?" que abre/fecha um balão com o texto */
export function Help({ text }) {
  const [open, setOpen] = useState(false) // false | 'l' | 'r' (lado para onde o balão abre, para não sair da tela)
  if (!text) return null
  return (
    <span className="help">
      <button type="button" className="help-btn" aria-label="O que é isso?" aria-expanded={!!open} title={text} onClick={(e) => { e.stopPropagation(); setOpen(open ? false : e.currentTarget.getBoundingClientRect().left + 280 > window.innerWidth ? 'r' : 'l') }}>?</button>
      {open && <span className={cls('help-pop', open === 'r' && 'right')} role="note" onClick={() => setOpen(false)}>{text}</span>}
    </span>
  )
}

export function Stat({ label, value, sub, icon: Icon, accent, help }) {
  return (
    <div className={cls('stat', accent && 'stat-accent')}>
      <div className="stat-top">
        <span className="stat-label">{label}<Help text={help} /></span>
        {Icon && <Icon size={18} />}
      </div>
      <div className="stat-value"><CountUp text={value} /></div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      <span className="empty-art" aria-hidden="true"><i /><i /><i />{Icon ? <Icon size={30} strokeWidth={1.7} /> : <Sparkles size={30} strokeWidth={1.7} />}</span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={cls(value === o.value && 'on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toast() {
  const { toast } = useStore()
  if (!toast) return null
  return <div key={toast.k} className={cls('toast', `toast-${toast.tone}`)}>{toast.msg}</div>
}

/**
 * Quadro. `collapsible` + `storageKey`: o título vira botão para recolher/abrir (lembra neste aparelho).
 */
export function Card({ title, action, children, className, pad = true, collapsible = false, storageKey, defaultCollapsed = false }) {
  const key = storageKey && `dcb:card:${storageKey}`
  const [shut, setShut] = useState(() => { if (!collapsible) return false; try { const v = key && localStorage.getItem(key); return v === null || v === undefined ? defaultCollapsed : v === '1' } catch { return defaultCollapsed } })
  const toggle = () => { const n = !shut; setShut(n); try { if (key) localStorage.setItem(key, n ? '1' : '0') } catch { /* sem armazenamento */ } }
  return (
    <section className={cls('card', className, collapsible && shut && 'card-shut')}>
      {(title || action) && (
        <header className="card-head">
          {title && (collapsible
            ? <button type="button" className="card-toggle" aria-expanded={!shut} onClick={toggle}><ChevronDown size={16} className="card-chev" /><h3>{title}</h3><small>{shut ? 'mostrar' : 'recolher'}</small></button>
            : <h3>{title}</h3>)}
          {!shut && action}
        </header>
      )}
      {!shut && <div className={cls(pad && 'card-body')}>{children}</div>}
    </section>
  )
}

/**
 * Lista longa: mostra as primeiras `limit` e o botão "Mostrar todas (N)" / "Mostrar menos".
 * Uso: const { visible, more } = useLimit(lista, 20) → {visible.map(...)}{more}
 */
export function useLimit(items = [], limit = 20, noun = 'itens') {
  const [all, setAll] = useState(false)
  const visible = all || items.length <= limit ? items : items.slice(0, limit)
  const more = items.length > limit
    ? <button type="button" className="link show-more" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : `Mostrar todos (${items.length} ${noun})`}</button>
    : null
  return { visible, more }
}

/**
 * Gráfico de colunas simples (1 série) com tooltip no hover/toque.
 * data: [{ label, value, hint }]
 */
export function BarChart({ data, height = 180, format = money }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = [max, max / 2, 0]
  return (
    <div className="bars" style={{ height }}>
      <div className="bars-grid">
        {ticks.map((t, i) => <div key={i} className="bars-tick"><span>{format(t).replace(',00', '')}</span></div>)}
      </div>
      <div className="bars-plot">
        {data.map((d, i) => (
          <div key={i} className="bar-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
            <div className={cls('bar', hover === i && 'bar-on')} style={{ height: `${(d.value / max) * 100}%` }} />
            <span className="bar-label">{d.label}</span>
            {hover === i && (
              <div className="bar-tip">
                <b>{format(d.value)}</b>
                <span>{d.hint || d.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Barra horizontal de ranking */
export function RankRow({ label, value, max, right, color }) {
  return (
    <div className="rank">
      <div className="rank-top"><span>{label}</span><b>{right}</b></div>
      <div className="rank-track"><div className="rank-fill" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></div>
    </div>
  )
}

export function ConfirmHost() {
  const { ask, setAsk } = useStore()
  if (!ask) return null
  const done = (v) => { ask.resolve(v); setAsk(null) }
  return (
    <Modal open onClose={() => done(false)} title="Confirmar" footer={
      <div className="foot-row">
        <Button variant="ghost" onClick={() => done(false)}>Voltar</Button>
        <Button onClick={() => done(true)}>{ask.okLabel}</Button>
      </div>
    }>
      <p>{ask.message}</p>
    </Modal>
  )
}

/** Botão claro/escuro */
export function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'claro' : 'escuro'
  return (
    <button type="button" className={cls('theme-btn', className)} onClick={toggle} aria-label={`Mudar para tema ${next}`} title={`Tema ${next}`}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

/** Preço com centavos discretos: R$ 45 ,00 */
export function Price({ v, className }) {
  const n = Number(v || 0)
  const [int, dec] = n.toFixed(2).split('.')
  return (
    <span className={cls('price', className)} aria-label={money(n)}>
      <small className="price-cur">R$</small>{Number(int).toLocaleString('pt-BR')}<small className="price-dec">,{dec}</small>
    </span>
  )
}

/** Divisor dourado (ornamento da marca) */
export function RuneRule({ glyph = '✦' }) {
  return <div className="rune-rule" aria-hidden="true"><span /><b>{glyph}</b><span /></div>
}
