/**
 * Mensagens do WhatsApp — editáveis em Ajustes → Mensagens.
 * Use as variáveis entre chaves, por exemplo {nome}. Se a dona apagar o texto,
 * o sistema volta a usar o padrão abaixo.
 */
export const MESSAGES = [
  {
    key: 'confirmClient', label: 'Cliente confirma o agendamento', who: 'A cliente envia para a clínica depois de agendar',
    vars: ['nome', 'servico', 'data', 'hora', 'profissional', 'clinica'],
    text: 'Olá! Acabei de agendar pelo site:\n✨ {servico}\n📅 {data} às {hora}\n💆‍♀️ Profissional: {profissional}\n👤 {nome}\nConfirmado?',
  },
  {
    key: 'askConfirm', label: 'Pedido de confirmação (com link)', who: 'Botão "Pedir confirmação" no agendamento',
    vars: ['nome', 'servicos', 'data', 'clinica', 'endereco', 'link'],
    text: 'Olá, {nome}! Seu horário na {clinica} 🦋\n📅 {data}\n{servicos}\n📍 {endereco}\n\nToque para confirmar: {link}',
  },
  {
    key: 'reminder', label: 'Lembrete do horário', who: 'A clínica envia pela agenda',
    vars: ['nome', 'servico', 'data', 'hora', 'profissional', 'clinica', 'endereco'],
    text: 'Olá, {nome}! Passando para lembrar do seu horário na {clinica}:\n✨ {servico}\n📅 {data} às {hora}\n💆‍♀️ com {profissional}\n📍 {endereco}\nTe esperamos com carinho! 🦋',
  },
  {
    key: 'review', label: 'Pedido de avaliação', who: 'Depois de finalizar a venda no caixa',
    vars: ['nome', 'profissional', 'clinica', 'link'],
    text: 'Obrigada pela visita, {nome}! 🦋 Como foi seu atendimento com {profissional}? Avalie em 10 segundos: {link}',
  },
  {
    key: 'callClient', label: 'Chamar cliente', who: 'Botão da ficha da cliente',
    vars: ['nome', 'clinica', 'link'],
    text: 'Olá, {nome}! Que tal reservar um momento de cuidado para você? ✨ Agende em poucos toques: {link}',
  },
  {
    key: 'comeback', label: 'Campanha de volta', who: 'Clientes sumidas (Clientes → Campanha de volta)',
    vars: ['nome', 'dias', 'clinica', 'link'],
    text: 'Olá, {nome}! Sentimos sua falta na {clinica} 💕 Faz {dias} dias do seu último atendimento. Que tal reservar um momento só seu? Agende em poucos toques: {link}',
  },
  {
    key: 'birthday', label: 'Parabéns de aniversário', who: 'Lista de aniversariantes do mês',
    vars: ['nome', 'desconto', 'clinica', 'link'],
    text: 'Feliz aniversário, {nome}! 🎉 Neste mês você tem {desconto}% off em qualquer serviço na {clinica}. Agende: {link}',
  },
  {
    key: 'waitlist', label: 'Vaga da lista de espera', who: 'Quando abrir um horário',
    vars: ['nome', 'data', 'profissional', 'clinica', 'link'],
    text: 'Olá, {nome}! Abriu um horário em {data}{profissional} na {clinica}. Garanta o seu aqui: {link}',
  },
  {
    key: 'clubCharge', label: 'Cobrança do Clube', who: 'Mensalidade pendente do plano',
    vars: ['nome', 'plano', 'valor', 'clinica'],
    text: 'Olá, {nome}! Passando para lembrar da mensalidade do plano {plano} ({valor}) deste mês. Pode ser no Pix. Obrigada! 🦋',
  },
  {
    key: 'clubInterest', label: 'Cliente quer assinar um plano', who: 'Botão "Quero assinar" do site',
    vars: ['plano', 'valor', 'clinica'],
    text: 'Olá! Quero assinar o plano {plano} ({valor}/mês). Como faço?',
  },
  {
    key: 'payout', label: 'Fechamento de comissão', who: 'A dona envia para a profissional',
    vars: ['nome', 'periodo', 'detalhes', 'valor', 'clinica'],
    text: 'Olá, {nome}! Fechamento {periodo}:\n{detalhes}\n💰 Total: {valor}\nObrigada pelo trabalho! 🦋',
  },
  {
    key: 'greeting', label: 'Botão WhatsApp do site', who: 'Primeira mensagem da cliente',
    vars: ['clinica'],
    text: 'Olá! Vim pelo site de agendamento da {clinica}.',
  },
]

const byKey = Object.fromEntries(MESSAGES.map((m) => [m.key, m]))

/** Texto final da mensagem: modelo salvo em Ajustes (ou o padrão) com as variáveis trocadas */
export function msg(settings, key, vars = {}) {
  const tpl = (settings?.messages?.[key] || '').trim() || byKey[key]?.text || ''
  const all = { clinica: settings?.shopName || '', endereco: settings?.address || '', ...vars }
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (all[k] !== undefined && all[k] !== null ? String(all[k]) : m))
}

export const bookingLink = () => `${location.origin}${location.pathname}#/`
