import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ChevronLeft, Delete } from 'lucide-react'
import { useStore } from '../state/Store'
import { Button, Field, Logo, RuneRule, ThemeToggle } from '../components/ui'
import { BRAND } from '../config/brand'

export default function Login() {
  const { session, actions, isDemo, pub } = useStore()
  const nav = useNavigate()
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to={session.role === 'admin' ? '/painel/inicio' : '/painel/profissional'} replace />

  const go = async (cred) => {
    setErr(''); setLoading(true)
    try {
      const s = await actions.login(cred)
      nav(s.role === 'admin' ? '/painel/inicio' : '/painel/profissional', { replace: true })
    } catch (e) { setErr(e.message); setPin('') } finally { setLoading(false) }
  }

  const press = (d) => {
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) go({ pin: next })
  }

  return (
    <div className="login" style={{ backgroundImage: `var(--login-veil), url(${BRAND.banner})` }}>
      <div className="login-card">
        <div className="login-top"><Link to="/" className="back"><ChevronLeft size={18} /> Voltar ao agendamento</Link><ThemeToggle /></div>
        <div className="login-brand">
          <Logo size={96} />
          <img className="login-mark only-light" src={BRAND.mark} alt="" />
          <img className="login-mark only-dark" src={BRAND.markLight} alt="" />
          <h1 className="wordmark">{BRAND.wordmark}</h1>
          <RuneRule />
          <p className="tagline">{BRAND.tagline}</p>
          <p>Painel da equipe{pub?.settings?.shopName && pub.settings.shopName !== BRAND.appName ? ` · ${pub.settings.shopName}` : ''}</p>
        </div>

        {isDemo ? (
          <>
            <div className="pin-dots" aria-label="PIN">{[0, 1, 2, 3].map((i) => <span key={i} className={pin.length > i ? 'on' : ''} />)}</div>
            {err && <p className="form-err center" role="alert">{err}</p>}
            <div className="keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => press(String(n))} disabled={loading}>{n}</button>)}
              <span />
              <button onClick={() => press('0')} disabled={loading}>0</button>
              <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Apagar"><Delete size={22} /></button>
            </div>
            <div className="demo-hint">
              <b>Modo demonstração</b>
              <span>Proprietária: <code>{BRAND.demoAdminPin}</code> · Profissionais: <code>1111</code> <code>2222</code> <code>3333</code> <code>4444</code></span>
            </div>
          </>
        ) : (
          <form className="me-form" onSubmit={(e) => { e.preventDefault(); go({ email, password }) }}>
            <Field label="E-mail"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Senha"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <p className="form-err" role="alert">{err}</p>}
            <Button type="submit" block size="lg" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</Button>
          </form>
        )}
      </div>
    </div>
  )
}
