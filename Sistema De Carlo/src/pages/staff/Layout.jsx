import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays, CalendarRange, ChartColumn, Crown, House, LogOut, Megaphone, Package, PiggyBank, Receipt, Settings, ShoppingCart, Tv, Users, UserRound, Wallet,
} from 'lucide-react'
import Notifier, { pendingAnnouncements } from '../../components/Notifier'
import { useStore } from '../../state/Store'
import { Avatar, Logo, ThemeToggle } from '../../components/ui'
import { cls, canCharge } from '../../lib/utils'

const ADMIN_NAV = [
  { to: '/painel/inicio', label: 'Início', icon: House },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/painel/caixa', label: 'Caixa', icon: ShoppingCart },
  { to: '/painel/comissoes', label: 'Comissões', icon: Wallet },
  { to: '/painel/clientes', label: 'Clientes', icon: Users },
  { to: '/painel/avisos', label: 'Avisos', icon: Megaphone },
  { to: '/painel/clube', label: 'Clube', icon: Crown },
  { to: '/painel/financeiro', label: 'Lucro real', icon: PiggyBank },
  { to: '/painel/catalogo', label: 'Catálogo', icon: Package },
  { to: '/painel/equipe', label: 'Equipe', icon: UserRound },
  { to: '/painel/relatorios', label: 'Relatórios', icon: ChartColumn },
  { to: '/painel/config', label: 'Ajustes', icon: Settings },
  { to: '/tv', label: 'Modo TV', icon: Tv },
]
const BARBER_NAV = [
  { to: '/painel/profissional', label: 'Meu dia', icon: CalendarDays },
  { to: '/painel/minha-agenda', label: 'Agenda', icon: CalendarRange },
  { to: '/painel/caixa', label: 'Cobrar', icon: ShoppingCart },
  { to: '/painel/extrato', label: 'Extrato', icon: Receipt },
  { to: '/painel/meus-avisos', label: 'Avisos', icon: Megaphone },
]
const MOBILE_ADMIN = ['/painel/inicio', '/painel/agenda', '/painel/caixa', '/painel/comissoes', '/painel/mais']

export function RequireAuth({ role, children }) {
  const { session } = useStore()
  if (!session) return <Navigate to="/painel" replace />
  if (role && session.role !== role) return <Navigate to={session.role === 'admin' ? '/painel/inicio' : '/painel/profissional'} replace />
  return children
}

export default function StaffLayout() {
  const { session, data, actions, isDemo } = useStore()
  const loc = useLocation()
  if (!session) return <Navigate to="/painel" replace />
  const barberNav = BARBER_NAV.filter((n) => n.to !== '/painel/caixa' || canCharge(data?.settings, session))
  const nav = session.role === 'admin' ? ADMIN_NAV : barberNav
  const barber = data?.barbers?.find((b) => b.id === session.barberId)
  const unread = pendingAnnouncements(data, session).length
  const mobile = session.role === 'admin'
    ? [...ADMIN_NAV.filter((n) => MOBILE_ADMIN.includes(n.to)), { to: '/painel/mais', label: 'Mais', icon: Settings }]
    : barberNav

  return (
    <div className="staff">
      <aside className="side">
        <div className="side-brand"><Logo size={40} withText sub={session.role === 'admin' ? 'Gestão' : 'Profissional'} /></div>
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cls('side-link', isActive && 'on')}>
              <n.icon size={19} /> {n.label}{n.to === '/painel/meus-avisos' && unread > 0 && <span className="nav-count">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="theme-row"><span>Tema</span><ThemeToggle /></div>
          <div className="side-user">
            <Avatar name={session.name} color={barber?.color || '#1F3E66'} photo={barber?.photo} size={34} />
            <div><b>{session.name}</b><small>{session.role === 'admin' ? 'Proprietária' : 'Profissional'}</small></div>
          </div>
          <button className="side-link" onClick={actions.logout}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      <div className="staff-main">
        <header className="topbar">
          <Logo size={32} withText />
          <div className="topbar-actions">
            <ThemeToggle />
            <button className="icon-btn" onClick={actions.logout} aria-label="Sair"><LogOut size={20} /></button>
          </div>
        </header>
        {isDemo && <div className="demo-bar">Modo demonstração · dados fictícios salvos neste navegador</div>}
        <main className="page" key={loc.pathname}>
          {data ? <Outlet /> : <div className="loading"><Logo size={56} /></div>}
        </main>
        {data && <Notifier />}
      </div>

      <nav className="bottom-nav">
        {mobile.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cls(isActive && 'on')}>
            <n.icon size={21} /><span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** Menu "Mais" no celular (dono) */
export function MoreMenu() {
  const { actions } = useStore()
  return (
    <div className="more">
      <h1 className="page-title">Mais</h1>
      <div className="more-grid">
        {ADMIN_NAV.filter((n) => !MOBILE_ADMIN.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} className="more-item"><n.icon size={24} /><span>{n.label}</span></NavLink>
        ))}
        <button className="more-item" onClick={actions.logout}><LogOut size={24} /><span>Sair</span></button>
      </div>
    </div>
  )
}
