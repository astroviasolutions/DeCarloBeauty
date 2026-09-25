import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './state/Store'
import { ConfirmHost, Toast } from './components/ui'
import Booking from './pages/Booking'
import MeusHorarios from './pages/MeusHorarios'
import Avaliar from './pages/Avaliar'
import TV from './pages/TV'
import Clube from './pages/staff/Clube'
import Financeiro from './pages/staff/Financeiro'
import Login from './pages/Login'
import StaffLayout, { MoreMenu, RequireAuth } from './pages/staff/Layout'
import Dashboard from './pages/staff/Dashboard'
import Agenda from './pages/staff/Agenda'
import Caixa from './pages/staff/Caixa'
import Comissoes from './pages/staff/Comissoes'
import { Catalogo, Clientes, Equipe } from './pages/staff/Cadastros'
import Relatorios from './pages/staff/Relatorios'
import Config from './pages/staff/Config'
import { BarberHome, BarberStatement, MyAgenda } from './pages/staff/Barber'
import Avisos, { MeusAvisos } from './pages/staff/Avisos'

const Admin = ({ children }) => <RequireAuth role="admin">{children}</RequireAuth>
const BarberOnly = ({ children }) => <RequireAuth role="barber">{children}</RequireAuth>

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Booking />} />
          <Route path="/meus" element={<MeusHorarios />} />
          <Route path="/avaliar/:id" element={<Avaliar />} />
          <Route path="/tv" element={<TV />} />
          <Route path="/painel" element={<Login />} />
          <Route path="/painel" element={<StaffLayout />}>
            <Route path="inicio" element={<Admin><Dashboard /></Admin>} />
            <Route path="agenda" element={<Admin><Agenda /></Admin>} />
            <Route path="caixa" element={<Caixa />} />
            <Route path="comissoes" element={<Admin><Comissoes /></Admin>} />
            <Route path="clientes" element={<Admin><Clientes /></Admin>} />
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
        <Toast />
        <ConfirmHost />
      </HashRouter>
    </StoreProvider>
  )
}
