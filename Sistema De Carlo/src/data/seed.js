import { addDays, today, toHHMM, uid, weekday, round2 } from '../lib/utils'
import { commissionRate } from '../lib/commission'

/** PRNG determinístico para dados de demonstração estáveis */
function rng(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function buildSeed() {
  const r = rng(20260924)
  const pick = (arr) => arr[Math.floor(r() * arr.length)]

  const settings = {
    id: 'main',
    shopName: 'De Carlo Beauty',
    whatsapp: '41999990000',
    address: 'Endereço da clínica — Curitiba/PR',
    instagram: '@decarlobeauty',
    messages: {},
    notify: { newBooking: true, reminderMinutes: 15, dailySummary: true, browser: true, pollSeconds: 60 },
    privacy: { hideContacts: true },
    page: { heroText: '', notice: '' },
    slotStep: 30,
    bookingDaysAhead: 21,
    hours: { 0: null, 1: ['09:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '20:00'], 5: ['09:00', '20:00'], 6: ['09:00', '15:00'] },
    breakTime: null,
    loyalty: { enabled: true, goal: 10, rewardServiceId: 's6' },
    birthdayDiscount: 15,
    googleReviewUrl: '',
    clubEnabled: true,
    waitlistEnabled: true,
  }

  const services = [
    { id: 's1', name: 'Limpeza de Pele Profunda', description: 'Higienização, extração, peeling suave e máscara calmante', duration: 90, price: 180, commission: 40, active: true, order: 1 },
    { id: 's2', name: 'Protocolo Glow', description: 'Hidratação intensa, vitamina C e LED para pele luminosa', duration: 60, price: 220, commission: 40, active: true, order: 2 },
    { id: 's3', name: 'Microagulhamento', description: 'Estímulo de colágeno para textura, poros e manchas', duration: 60, price: 350, commission: 35, active: true, order: 3 },
    { id: 's4', name: 'Radiofrequência Facial', description: 'Firmeza e contorno com efeito lifting', duration: 60, price: 240, commission: 35, active: true, order: 4 },
    { id: 's5', name: 'Drenagem Linfática', description: 'Técnica manual para desinchar e aliviar retenção', duration: 60, price: 150, commission: 40, active: true, order: 5 },
    { id: 's6', name: 'Design de Sobrancelhas', description: 'Visagismo, pinça e henna opcional', duration: 30, price: 70, commission: 45, active: true, order: 6 },
    { id: 's7', name: 'Lash Lifting', description: 'Curvatura e nutrição dos cílios naturais', duration: 60, price: 160, commission: 45, active: true, order: 7 },
    { id: 's8', name: 'Massagem Modeladora', description: 'Redução de medidas e contorno corporal', duration: 60, price: 170, commission: 40, active: true, order: 8 },
  ]

  const products = [
    { id: 'p1', name: 'Sérum Vitamina C 30ml', price: 189, stock: 14, commission: 10, active: true },
    { id: 'p2', name: 'Protetor Solar FPS 60 com cor', price: 139, stock: 20, commission: 10, active: true },
    { id: 'p3', name: 'Ácido Hialurônico Sérum', price: 169, stock: 9, commission: 10, active: true },
    { id: 'p4', name: 'Máscara Calmante Pós-procedimento', price: 99, stock: 12, commission: 10, active: true },
    { id: 'p5', name: 'Óleo Corporal Firmador', price: 129, stock: 7, commission: 10, active: true },
    { id: 'p6', name: 'Kit Home Care De Carlo', price: 349, stock: 5, commission: 12, active: true },
  ]

  const barbers = [
    { id: 'b1', goal: 26000, name: 'Amanda Ribeiro', phone: '41988881111', pin: '1111', color: '#1F3E66', serviceRate: null, productRate: null, daysOff: [0], active: true, bio: 'Estética facial avançada' },
    { id: 'b2', goal: 24000, name: 'Juliana Prado', phone: '41988882222', pin: '2222', color: '#C9837A', serviceRate: 45, productRate: null, daysOff: [0, 1], active: true, bio: 'Biomédica esteta', serviceOverrides: { s3: { duration: 90, commission: 50 }, s1: { duration: 75 } } },
    { id: 'b3', goal: 21000, name: 'Camila Duarte', phone: '41988883333', pin: '3333', color: '#6F8FB8', serviceRate: null, productRate: 15, daysOff: [0], active: true, bio: 'Corporal e drenagem' },
    { id: 'b4', goal: 17000, name: 'Bianca Rocha', phone: '41988884444', pin: '4444', color: '#8E6F86', serviceRate: null, productRate: null, daysOff: [0, 3], active: true, bio: 'Sobrancelhas e cílios' },
  ]

  const first = ['Mariana', 'Fernanda', 'Beatriz', 'Larissa', 'Gabriela', 'Isabela', 'Letícia', 'Carolina', 'Patrícia', 'Renata', 'Vanessa', 'Aline', 'Priscila', 'Débora', 'Natália', 'Helena', 'Luana', 'Tatiane', 'Sofia', 'Rafaela', 'Cristina', 'Eduarda', 'Paula', 'Ricardo']
  const last = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Rocha', 'Carvalho', 'Ferreira', 'Ribeiro', 'Gomes', 'Barbosa', 'Moraes', 'Teixeira']
  const clients = Array.from({ length: 42 }, (_, i) => ({
    id: `c${i + 1}`,
    name: `${pick(first)} ${pick(last)}`,
    phone: `4199${String(1000000 + Math.floor(r() * 8999999)).slice(0, 7)}`,
    notes: i % 7 === 0 ? 'Pele sensível · evitar ácidos fortes' : i % 9 === 0 ? 'Alergia a látex' : '',
    createdAt: addDays(today(), -120 + Math.floor(r() * 40)),
    birthday: r() < 0.7 ? (i % 8 === 0 ? today().slice(5, 8) : String(1 + Math.floor(r() * 12)).padStart(2, '0') + '-') + String(1 + Math.floor(r() * 28)).padStart(2, '0') : '',
  }))
  const SKINS = ['Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível']
  clients.forEach((c, i) => {
    c.anamnese = { skin: SKINS[i % 5], phototype: ['II', 'III', 'III', 'IV', 'II'][i % 5], allergies: i % 9 === 0 ? 'Látex' : '', meds: i % 11 === 0 ? 'Anticoncepcional' : '', conditions: '', pregnant: i === 6, acids: i % 4 === 0, sun: false, consent: i % 3 !== 2 }
  })
  // cliente de teste para "Meus horários"
  clients[0].name = 'Mariana Silva'; clients[0].phone = '41999990001'; clients[0].birthday = today().slice(5, 8) + '12'

  const appointments = []
  const sales = []
  const t = today()
  const weighted = ['s1', 's1', 's2', 's2', 's3', 's4', 's5', 's5', 's6', 's6', 's7', 's8']

  for (let d = -70; d <= 6; d++) {
    const date = addDays(t, d)
    const wd = weekday(date)
    const hours = settings.hours[wd]
    if (!hours) continue
    for (const b of barbers) {
      if (b.daysOff.includes(wd)) continue
      const [oh] = hours[0].split(':').map(Number)
      const [ch] = hours[1].split(':').map(Number)
      let m = oh * 60
      const fill = d < 0 ? 0.52 : d === 0 ? 0.55 : Math.max(0.1, 0.5 - d * 0.07)
      while (m < ch * 60 - 30) {
        const sid = pick(weighted)
        const svc = services.find((s) => s.id === sid)
        const extra = sid !== 's6' && r() < 0.18 ? services.find((s) => s.id === 's6') : null // + sobrancelha
        const picked = extra ? [svc, extra] : [svc]
        const totalDur = picked.reduce((a, x) => a + x.duration, 0)
        const dur = Math.ceil(totalDur / 30) * 30
        if (m + dur > ch * 60) break
        if (r() < fill) {
          const c = d > -45 ? pick(clients.slice(0, 35)) : pick(clients) // 7 clientes "sumidos" para a campanha
          const time = toHHMM(m)
          let status = 'agendado'
          if (d < 0) status = r() < 0.06 ? 'faltou' : r() < 0.04 ? 'cancelado' : 'concluido'
          else if (d === 0) status = m < 12 * 60 ? 'concluido' : r() < 0.5 ? 'confirmado' : 'agendado'
          else status = r() < 0.4 ? 'confirmado' : 'agendado'
          const appt = {
            id: uid(), date, time, duration: totalDur, barberId: b.id, serviceIds: picked.map((x) => x.id),
            clientId: c.id, clientName: c.name, clientPhone: c.phone, total: picked.reduce((a, x) => a + x.price, 0),
            status, source: r() < 0.72 ? 'online' : 'balcao', notes: '', saleId: null,
            createdAt: addDays(date, -Math.floor(r() * 5)),
          }
          if (status === 'concluido') {
            const items = picked.map((x) => ({ type: 'service', refId: x.id, name: x.name, price: x.price, qty: 1 }))
            if (r() < 0.28) { const p = pick(products); items.push({ type: 'product', refId: p.id, name: p.name, price: p.price, qty: 1 }) }
            const full = items.map((it) => {
              const src = it.type === 'service' ? services.find((s) => s.id === it.refId) : products.find((p) => p.id === it.refId)
              const rate = commissionRate(it.type, src, b)
              return { ...it, commissionRate: rate, commission: round2(it.price * it.qty * rate / 100) }
            })
            const total = full.reduce((a, x) => a + x.price * x.qty, 0)
            const sale = {
              id: uid(), date, time: toHHMM(m + dur), barberId: b.id, clientId: c.id, clientName: c.name,
              appointmentId: appt.id, items: full, subtotal: total, discount: 0, total,
              payment: pick(['pix', 'pix', 'pix', 'credito', 'debito', 'dinheiro']),
              commissionTotal: round2(full.reduce((a, x) => a + x.commission, 0)),
              createdAt: `${date}T${toHHMM(m + dur)}:00`,
            }
            appt.saleId = sale.id
            sales.push(sale)
          }
          appointments.push(appt)
        }
        m += dur
      }
    }
  }

  // Pagamentos de comissão já realizados (semanas anteriores)
  const payouts = []
  for (let w = 9; w >= 2; w--) {
    const from = addDays(t, -w * 7)
    const to = addDays(from, 6)
    for (const b of barbers) {
      const amount = round2(sales.filter((s) => s.barberId === b.id && s.date >= from && s.date <= to).reduce((a, s) => a + s.commissionTotal, 0))
      if (amount > 0) payouts.push({ id: uid(), barberId: b.id, from, to, amount, paidAt: addDays(to, 1), note: 'Acerto semanal' })
    }
  }

  // ---------- Runas: resgates já feitos (cada cliente fica com 0 ou 1 prêmio disponível) ----------
  const goalR = settings.loyalty.goal
  clients.forEach((c, idx) => {
    const mine = sales.filter((sa) => sa.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date))
    let visits = mine.length; let redeemed = 0
    const desired = idx % 3 === 0 ? 1 : 0
    for (const sa of mine) {
      if (Math.floor(visits / goalR) - redeemed <= desired) break
      sa.loyaltyRedeemed = true; sa.benefit = { kind: 'runas', label: 'Fidelidade: procedimento de presente', amount: 0 }
      visits--; redeemed++
    }
  })

  // ---------- Clube (assinaturas) ----------
  const plans = [
    { id: 'pl1', name: 'Essencial', price: 199.9, description: '1 limpeza de pele + 1 design de sobrancelhas por mês', serviceIds: ['s1', 's6'], limit: 2, productDiscount: 5, active: true, order: 1 },
    { id: 'pl2', name: 'Signature', price: 389.9, description: '4 sessões por mês de facial ou corporal', serviceIds: ['s1', 's2', 's4', 's5', 's6', 's8'], limit: 4, productDiscount: 10, active: true, order: 2, featured: true },
    { id: 'pl3', name: 'Prestige', price: 690, description: '8 sessões por mês, incluindo microagulhamento, + 15% em home care', serviceIds: services.map((x) => x.id), limit: 8, productDiscount: 15, active: true, order: 3 },
  ]
  const curMonth = t.slice(0, 7)
  const prevMonth = addDays(t.slice(0, 8) + '01', -1).slice(0, 7)
  const subscriptions = clients.slice(1, 11).map((c, i) => ({
    id: uid(), clientId: c.id, planId: ['pl1', 'pl2', 'pl2', 'pl3', 'pl1', 'pl2', 'pl1', 'pl3', 'pl2', 'pl1'][i], status: i === 9 ? 'cancelado' : 'ativo',
    startedAt: addDays(t, -30 - i * 9), paidMonths: i % 4 === 3 ? [prevMonth] : [prevMonth, curMonth],
  }))

  // ---------- Lista de espera ----------
  const waitlist = [
    { id: uid(), date: addDays(t, 1), barberId: 'b1', period: 'tarde', clientName: 'Juliana Tavares', phone: '41991234567', serviceIds: ['s2'], status: 'aguardando', createdAt: t },
    { id: uid(), date: addDays(t, 1), barberId: null, period: 'qualquer', clientName: 'Paula Henriques', phone: '41997654321', serviceIds: ['s1'], status: 'aguardando', createdAt: t },
    { id: uid(), date: addDays(t, 2), barberId: 'b2', period: 'manha', clientName: 'Renata Duarte', phone: '41993332211', serviceIds: ['s5'], status: 'aguardando', createdAt: t },
  ]

  // ---------- Folgas / bloqueios de horário ----------
  const blocks = [
    { id: uid(), barberId: 'b1', date: addDays(t, 1), start: '14:00', end: '16:00', reason: 'Congresso de estética' },
    { id: uid(), barberId: 'b3', date: addDays(t, 3), start: null, end: null, reason: 'Folga' },
  ]

  // ---------- Avaliações pós-atendimento ----------
  const comments = ['Minha pele nunca esteve tão bonita!', 'Atendimento impecável, ambiente lindo e acolhedor.', 'Saio sempre renovada.', 'Pontual, delicada e muito profissional.', 'O protocolo glow é maravilhoso!', '', '', 'Amei o resultado, só atrasou um pouquinho.', 'Me senti uma rainha. Voltarei com certeza.']
  const reviews = sales.filter(() => r() < 0.32).map((sa) => {
    const x = r()
    return { id: uid(), saleId: sa.id, barberId: sa.barberId, clientName: sa.clientName, stars: x < 0.72 ? 5 : x < 0.93 ? 4 : 3, comment: pick(comments), createdAt: sa.date }
  })

  // ---------- Promoções de horário vazio ----------
  const promos = [{ id: uid(), weekdays: [2], from: '09:00', to: '12:00', pct: 15, label: 'Terça cedo', active: true }]

  // ---------- Despesas (Lucro real) ----------
  const expenses = []
  for (const m of [addDays(t.slice(0, 8) + '01', -40).slice(0, 7), prevMonth, curMonth]) {
    for (const [category, description, amount] of [['Aluguel', 'Aluguel da clínica', 4200], ['Energia', 'Copel', 420], ['Água', 'Sanepar', 130], ['Internet', 'Fibra 500MB', 120], ['Produtos', 'Dermocosméticos e descartáveis', 1850], ['Marketing', 'Anúncios Instagram', 300], ['Limpeza', 'Material de limpeza', 180]]) {
      expenses.push({ id: uid(), month: m, category, description, amount: m === curMonth && category === 'Produtos' ? 1320 : amount })
    }
  }

  const cash = [{ id: uid(), openedAt: `${t}T08:45:00`, openingAmount: 150, closedAt: null, closingAmount: null, note: '' }]

  // ---------- Avisos da gestão para a equipe ----------
  const announcements = [
    { id: uid(), title: 'Bem-vinda ao novo sistema!', message: 'A partir de agora os agendamentos chegam por aqui. Confira sua agenda sempre que abrir o painel e toque em "Ciente" nos avisos. 🦋', audience: 'all', important: true, expiresAt: null, active: true, createdAt: `${t}T08:00:00`, reads: { b3: `${t}T08:40:00` } },
    { id: uid(), title: 'Reposição de descartáveis', message: 'Chegaram luvas, toucas e lençóis descartáveis. Estão no armário da sala 2.', audience: 'all', important: false, expiresAt: addDays(t, 7), active: true, createdAt: `${addDays(t, -1)}T17:30:00`, reads: { b1: `${addDays(t, -1)}T18:02:00`, b3: `${t}T08:41:00` } },
  ]

  return { settings, services, products, barbers, clients, appointments, sales, payouts, cash, expenses, plans, subscriptions, waitlist, blocks, reviews, promos, announcements, photos: [], seedDate: today(), touched: false }
}
