import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays, CalendarRange, ChartColumn, Crown, House, LogOut, Megaphone, Package, PiggyBank, Receipt, Settings, ShoppingCart, Tv, Users, UserRound, Wallet,
} from 'lucide-react'
import Notifier, { pendingAnnouncements } from '../../components/Notifier'
import GlobalSearch, { SearchButton } from '../../components/GlobalSearch'
import { useStore } from '../../state/Store'
import { Avatar, Logo, ThemeToggle } from '../../components/ui'
import { cls, canCharge, clockSkewMin, deskCan, isDesk } from '../../lib/utils'

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
// recepção: só o trabalho do dia a dia (sem financeiro, relatórios, ajustes, equipe)
const RECEPTION_NAV = [
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/painel/caixa', label: 'Caixa', icon: ShoppingCart },
  { to: '/painel/clientes', label: 'Clientes', icon: Users },
  { to: '/tv', label: 'Modo TV', icon: Tv }, // painel da recepção: quem está atendendo e próximos (sem valores)
]
export const homeOf = (session) => (session?.role === 'admin' ? '/painel/inicio' : session?.role === 'reception' ? '/painel/agenda' : '/painel/profissional')

export function RequireAuth({ role, children }) {
  const { session } = useStore()
  if (!session) return <Navigate to="/painel" replace />
  // role: um perfil ou lista de perfis permitidos (ex.: ['admin', 'reception'])
  if (role && !(Array.isArray(role) ? role : [role]).includes(session.role)) return <Navigate to={homeOf(session)} replace />
  return children
}

export default function StaffLayout() {
  const { session, data, actions, isDemo, error } = useStore()
  const loc = useLocation()
  if (!session) return <Navigate to="/painel" replace />
  const barberNav = BARBER_NAV.filter((n) => n.to !== '/painel/caixa' || canCharge(data?.settings, session))
  const receptionNav = RECEPTION_NAV.filter((n) => n.to !== '/tv' || deskCan(data?.settings, session, 'tv')) // Modo TV: Ajustes → Recepção
  const nav = session.role === 'admin' ? ADMIN_NAV : session.role === 'reception' ? receptionNav : barberNav
  const barber = data?.barbers?.find((b) => b.id === session.barberId)
  const unread = pendingAnnouncements(data, session).length
  const mobile = session.role === 'admin'
    ? [...ADMIN_NAV.filter((n) => MOBILE_ADMIN.includes(n.to)), { to: '/painel/mais', label: 'Mais', icon: Settings }]
    : session.role === 'reception' ? receptionNav : barberNav

  return (
    <div className="staff">
      <aside className="side">
        <div className="side-brand"><Logo size={40} withText sub={session.role === 'admin' ? 'Gestão' : session.role === 'reception' ? 'Recepção' : 'Profissional'} /></div>
        {isDesk(session) && <SearchButton />}
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cls('side-link', isActive && 'on')}>
              <n.icon size={19} /> {n.label}{n.to === '/painel/meus-avisos' && unread > 0 && <span className="nav-count">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        {/* rodapé numa linha só (usuário + tema + sair): sobra altura para o menu inteiro aparecer em notebook */}
        <div className="side-foot">
          <div className="side-user">
            <Avatar name={session.name} color={barber?.color || '#1F3E66'} photo={barber?.photo} size={34} />
            <div className="side-user-name"><b>{session.name}</b><small>{session.role === 'admin' ? 'Proprietária' : session.role === 'reception' ? 'Recepção' : 'Profissional'}</small></div>
            <ThemeToggle />
            <button className="icon-btn side-out" onClick={actions.logout} aria-label="Sair" title="Sair"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      <div className="staff-main">
        <header className="topbar">
          <Logo size={32} withText />
          <div className="topbar-actions">
            {isDesk(session) && <SearchButton compact />}
            <ThemeToggle />
            <button className="icon-btn" onClick={actions.logout} aria-label="Sair"><LogOut size={20} /></button>
          </div>
        </header>
        {isDemo && <div className="demo-bar">Modo demonstração · dados fictícios salvos neste navegador</div>}
        {Math.abs(clockSkewMin()) >= 5 && <div className="demo-bar clock-bar">O relógio deste computador está {Math.abs(clockSkewMin()) >= 90 ? `${Math.round(Math.abs(clockSkewMin()) / 60)} h` : `${Math.abs(clockSkewMin())} min`} {clockSkewMin() > 0 ? 'atrasado' : 'adiantado'}. O sistema já usa a hora certa, mas ajuste a data e a hora do Windows (Configurações → Hora e idioma → "Definir hora automaticamente").</div>}
        <main className="page" key={loc.pathname}>
          {data ? <Outlet /> : error ? (
            // carregamento falhou: mostra o motivo em vez de girar o logo para sempre
            <div className="card" style={{ maxWidth: 520, margin: '40px auto', padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>Não foi possível carregar os dados</h3>
              <p className="muted small" style={{ overflowWrap: 'anywhere' }}>{error}</p>
              <div className="foot-row"><button type="button" className="btn btn-ghost" onClick={() => actions.logout()}>Sair</button><button type="button" className="btn btn-primary" onClick={() => location.reload()}>Tentar de novo</button></div>
            </div>
          ) : <div className="loading"><Logo size={56} /></div>}
        </main>
        {data && <Notifier />}
        {data && isDesk(session) && <GlobalSearch />}
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
