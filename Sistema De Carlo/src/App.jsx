import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './state/Store'
import { ConfirmHost, Toast } from './components/ui'
import Booking from './pages/Booking'
import MeusHorarios from './pages/MeusHorarios'
import Avaliar from './pages/Avaliar'
import Confirmar from './pages/Confirmar'

// Painel e Modo TV carregam só quando abertos: quem entra para agendar baixa só o site (mais leve e rápido)
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const TV = lazy(() => import('./pages/TV'))
const Login = lazy(() => import('./pages/Login'))
const StaffLayout = lazy(() => import('./pages/staff/Layout'))
const MoreMenu = named(() => import('./pages/staff/Layout'), 'MoreMenu')
const RequireAuth = named(() => import('./pages/staff/Layout'), 'RequireAuth')
const Dashboard = lazy(() => import('./pages/staff/Dashboard'))
const Agenda = lazy(() => import('./pages/staff/Agenda'))
const Caixa = lazy(() => import('./pages/staff/Caixa'))
const Comissoes = lazy(() => import('./pages/staff/Comissoes'))
const Clube = lazy(() => import('./pages/staff/Clube'))
const Financeiro = lazy(() => import('./pages/staff/Financeiro'))
const Relatorios = lazy(() => import('./pages/staff/Relatorios'))
const Config = lazy(() => import('./pages/staff/Config'))
const Catalogo = named(() => import('./pages/staff/Cadastros'), 'Catalogo')
const Clientes = named(() => import('./pages/staff/Cadastros'), 'Clientes')
const Equipe = named(() => import('./pages/staff/Cadastros'), 'Equipe')
const BarberHome = named(() => import('./pages/staff/Barber'), 'BarberHome')
const BarberStatement = named(() => import('./pages/staff/Barber'), 'BarberStatement')
const MyAgenda = named(() => import('./pages/staff/Barber'), 'MyAgenda')
const Avisos = lazy(() => import('./pages/staff/Avisos'))
const MeusAvisos = named(() => import('./pages/staff/Avisos'), 'MeusAvisos')

const Admin = ({ children }) => <RequireAuth role="admin">{children}</RequireAuth>
const Desk = ({ children }) => <RequireAuth role={['admin', 'reception']}>{children}</RequireAuth> // gestão ou recepção
const BarberOnly = ({ children }) => <RequireAuth role="barber">{children}</RequireAuth>
const Loading = () => <div className="loading" aria-label="Carregando" />

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Booking />} />
            <Route path="/meus" element={<MeusHorarios />} />
            <Route path="/avaliar/:id" element={<Avaliar />} />
            <Route path="/confirmar/:id" element={<Confirmar />} />
            <Route path="/tv" element={<TV />} />
            <Route path="/painel" element={<Login />} />
            <Route path="/painel" element={<StaffLayout />}>
              <Route path="inicio" element={<Admin><Dashboard /></Admin>} />
              <Route path="agenda" element={<Desk><Agenda /></Desk>} />
              <Route path="caixa" element={<Caixa />} />
              <Route path="comissoes" element={<Admin><Comissoes /></Admin>} />
              <Route path="clientes" element={<Desk><Clientes /></Desk>} />
              <Route path="avisos" element={<Admin><Avisos /></Admin>} />
              <Route path="clube" element={<Admin><Clube /></Admin>} />
              <Route path="financeiro" element={<Admin><Financeiro /></Admin>} />
              <Route path="catalogo" element={<Admin><Catalogo /></Admin>} />
              <Route path="equipe" element={<Admin><Equipe /></Admin>} />
              <Route path="relatorios" element={<Admin><Relatorios /></Admin>} />
              <Route path="config" element={<Admin><Config /></Admin>} />
              <Route path="mais" element={<Admin><MoreMenu /></Admin>} />
              <Route path="profissional" element={<BarberOnly><BarberHome /></BarberOnly>} />
              <Route path="extrato" element={<BarberOnly><BarberStatement /></BarberOnly>} />
              <Route path="minha-agenda" element={<BarberOnly><MyAgenda /></BarberOnly>} />
              <Route path="meus-avisos" element={<BarberOnly><MeusAvisos /></BarberOnly>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toast />
        <ConfirmHost />
      </HashRouter>
    </StoreProvider>
  )
}
