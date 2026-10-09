/**
 * DE CARLO BEAUTY — configuração white-label
 * ------------------------------------------------------------
 * Sistema Astrovia (agendamento + gestão). Logo em src/assets:
 * icon.jpg (redonda), mark.png (logo com fundo transparente),
 * mark-light.png (versão clara para o tema escuro) e banner.jpg.
 * Serviços, equipe, horários e mensagens são editados no painel.
 */
import logo from '../assets/icon.jpg'
import mark from '../assets/mark.png'
import markLight from '../assets/mark-light.png'
import banner from '../assets/banner.jpg'

export const BRAND = {
  appName: 'De Carlo Beauty',
  shopName: 'De Carlo Beauty',
  wordmark: 'De Carlo',
  tagline: 'Beauty',
  heroText: 'Cuidado, técnica e carinho em cada detalhe. Reserve seu horário em poucos toques.',
  logo,
  mark,
  markLight,
  banner,
  colors: {
    primary: '#1F3E66',      // azul-marinho da logo
    primaryDark: '#16304F',
    rose: '#E3A59C',         // rosé da borboleta
    paper: '#FAF6F4',        // pérola
  },
  // PIN da proprietária no modo demonstração (no Supabase o login é por e-mail/senha)
  demoAdminPin: '1234',
}

/** As cores da marca vêm do CSS (camada De Carlo no fim de styles.css) */
export function applyBrandColors() {}
