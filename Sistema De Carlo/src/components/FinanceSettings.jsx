import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field } from './ui'
import { financeOf, MAX_PARCELAS } from '../lib/cardFees'

const CATS = ['Aluguel', 'Energia', 'Água', 'Internet', 'Produtos', 'Marketing', 'Limpeza', 'Manutenção', 'Impostos', 'Outros']
const dec = (v) => String(v ?? '').replace(/[^\d.,]/g, '')
const uid = () => Math.random().toString(36).slice(2, 9)

/** Ajustes → Financeiro: maquininhas, repasse de juros, imposto, fiado e contas fixas (settings.privacy.finance) */
export default function FinanceSettings({ s, setS }) {
  const privacy = s.privacy || {}
  const raw = privacy.finance || {}
  const fin = financeOf(s)
  // edita sempre a versão "crua" (texto digitado), com as maquininhas já migradas das taxas antigas
  const machines = raw.machines?.length ? raw.machines : fin.machines
  const put = (patch) => setS({ ...s, privacy: { ...privacy, finance: { ...raw, machines, ...patch } } })
  const setM = (i, k, v) => put({ machines: machines.map((m, j) => (j === i ? { ...m, [k]: v } : m)) })
  const setCred = (i, n, v) => put({ machines: machines.map((m, j) => (j === i ? { ...m, credito: { ...(m.credito || {}), [n]: dec(v) } } : m)) })
  const rec = raw.recurring || []
  const setR = (i, k, v) => put({ recurring: rec.map((r, j) => (j === i ? { ...r, [k]: v } : r)) })
  const rules = privacy.commission || {}
  const setRule = (k, v) => setS({ ...s, privacy: { ...privacy, finance: { ...raw, machines }, commission: { ...rules, [k]: v } } })

  return (
    <>
      <Card title="Maquininhas de cartão">
        <p className="muted small mb-sm">Taxa (%) de cada maquininha e em quantos dias o dinheiro cai na conta. No Caixa, ao cobrar no cartão, você escolhe a maquininha e as parcelas; a taxa sai no <b>Lucro real</b> e a data de recebimento aparece em <b>Lucro real → A receber do cartão</b>.</p>
        {machines.map((m, i) => (
          <div key={m.id} className="fin-machine">
            <div className="fin-machine-head">
              <Field label="Nome"><input value={m.name || ''} onChange={(e) => setM(i, 'name', e.target.value)} placeholder="Ex.: Stone, InfinitePay" /></Field>
              {machines.length > 1 && <button type="button" className="icon-btn sm" aria-label={`Remover ${m.name}`} onClick={() => put({ machines: machines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>}
            </div>
            <div className="fee-grid">
              <Field label="Débito (%)"><input inputMode="decimal" value={m.debito ?? ''} onChange={(e) => setM(i, 'debito', dec(e.target.value))} placeholder="0" /></Field>
              {Array.from({ length: MAX_PARCELAS }, (_, k) => k + 1).map((n) => (
                <Field key={n} label={n === 1 ? 'Crédito à vista (%)' : `Crédito ${n}x (%)`}><input inputMode="decimal" value={m.credito?.[n] ?? ''} onChange={(e) => setCred(i, n, e.target.value)} placeholder="0" /></Field>
              ))}
            </div>
            <div className="fee-grid mt-sm">
              <Field label="Débito cai em (dias)"><input inputMode="numeric" value={m.diasDebito ?? 1} onChange={(e) => setM(i, 'diasDebito', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Crédito cai em (dias)" hint="Por parcela"><input inputMode="numeric" value={m.diasCredito ?? 30} onChange={(e) => setM(i, 'diasCredito', e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <label className="toggle-row mt-sm"><span><b>Antecipa os recebíveis</b><small>Ligado: o parcelado cai todo de uma vez no prazo do crédito, com a taxa de antecipação abaixo.</small></span><span className="switch"><input type="checkbox" checked={!!m.antecipa} onChange={(e) => setM(i, 'antecipa', e.target.checked)} /><span /></span></label>
            {m.antecipa && <Field label="Taxa de antecipação (%)" hint="Sobre o valor parcelado"><input inputMode="decimal" value={m.taxaAntecipacao ?? ''} onChange={(e) => setM(i, 'taxaAntecipacao', dec(e.target.value))} placeholder="0" /></Field>}
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => put({ machines: [...machines, { id: uid(), name: `Maquininha ${machines.length + 1}`, debito: '', credito: {}, diasDebito: 1, diasCredito: 30, antecipa: false }] })}>Adicionar maquininha</Button>
      </Card>

      <Card title="Juros, imposto e comissão">
        <label className="toggle-row"><span><b>Repassar a taxa do parcelado para a cliente</b><small>No crédito parcelado, o Caixa acrescenta o valor da taxa na conta da cliente. A clínica recebe o valor cheio do serviço.</small></span><span className="switch"><input type="checkbox" checked={!!raw.repasse?.on} onChange={(e) => put({ repasse: { ...(raw.repasse || {}), on: e.target.checked } })} /><span /></span></label>
        {raw.repasse?.on && <Field label="Repassar a partir de"><select value={raw.repasse?.from || 2} onChange={(e) => put({ repasse: { ...raw.repasse, from: Number(e.target.value) } })}>{Array.from({ length: MAX_PARCELAS }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Crédito à vista (1x)' : `${n}x`}</option>)}</select></Field>}
        <label className="toggle-row mt-sm"><span><b>Descontar imposto automático no Lucro real</b><small>Ex.: Simples Nacional. Ligado, o Lucro real desconta a % abaixo sobre o faturamento e deixa de somar as despesas da categoria "Impostos" (para não contar duas vezes).</small></span><span className="switch"><input type="checkbox" checked={!!raw.imposto?.on} onChange={(e) => put({ imposto: { ...(raw.imposto || {}), on: e.target.checked } })} /><span /></span></label>
        {raw.imposto?.on && <Field label="Imposto sobre o faturamento (%)" hint="A alíquota efetiva que o contador passar"><input inputMode="decimal" value={raw.imposto?.rate ?? ''} onChange={(e) => put({ imposto: { ...raw.imposto, rate: dec(e.target.value) } })} placeholder="6" /></Field>}
        <label className="toggle-row mt-sm"><span><b>Taxa do cartão reduz a comissão</b><small>Ligado: a profissional recebe sobre o valor que entra líquido (depois da taxa). Desligado: a clínica absorve a taxa.</small></span><span className="switch"><input type="checkbox" checked={!!rules.feeReduces} onChange={(e) => setRule('feeReduces', e.target.checked)} /><span /></span></label>
        <label className="toggle-row mt-sm"><span><b>Custo de material reduz a comissão</b><small>Ligado: a comissão do procedimento sai sobre (preço − custo de material). O custo de cada procedimento fica no Catálogo.</small></span><span className="switch"><input type="checkbox" checked={!!rules.materialReduces} onChange={(e) => setRule('materialReduces', e.target.checked)} /><span /></span></label>
        <p className="muted small mt-sm">Valem para as próximas cobranças; as já lançadas não mudam.</p>
      </Card>

      <Card title="Fiado (cliente pagar depois)">
        <div className="form-grid">
          <Field label="Prazo para pagar (dias)" hint="Vencimento do fiado a partir da venda"><input inputMode="numeric" value={raw.fiado?.dias ?? 30} onChange={(e) => put({ fiado: { ...(raw.fiado || {}), dias: e.target.value.replace(/\D/g, '') } })} /></Field>
          <Field label="Chave Pix para receber" hint="Vai na mensagem de cobrança"><input value={raw.fiado?.pix || ''} onChange={(e) => put({ fiado: { ...(raw.fiado || {}), pix: e.target.value } })} placeholder="CNPJ, e-mail ou telefone" /></Field>
        </div>
        <p className="muted small mt-sm">Em <b>Relatórios → Clientes devendo</b> aparece o vencimento e o botão de cobrar no WhatsApp. O texto da mensagem se muda em Mensagens do WhatsApp → "Cobrança de fiado".</p>
      </Card>

      <Card title="Contas fixas (lançadas sozinhas todo mês)">
        <p className="muted small mb-sm">Ex.: aluguel, internet, contador. No início de cada mês, ao abrir o Lucro real, cada conta ativa é lançada como <b>a pagar</b> com o vencimento no dia escolhido. Se apagar uma, ela não volta naquele mês.</p>
        {rec.map((r, i) => (
          <div key={r.id} className="fin-rec">
            <Field label="Descrição"><input value={r.description || ''} onChange={(e) => setR(i, 'description', e.target.value)} placeholder="Ex.: Aluguel da sala" /></Field>
            <Field label="Categoria"><select value={r.category || 'Outros'} onChange={(e) => setR(i, 'category', e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Valor (R$)"><input inputMode="decimal" value={r.amount ?? ''} onChange={(e) => setR(i, 'amount', dec(e.target.value))} placeholder="0,00" /></Field>
            <Field label="Vence dia"><input inputMode="numeric" value={r.day ?? ''} onChange={(e) => setR(i, 'day', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="10" /></Field>
            <label className="toggle-row"><span><b>Ativa</b></span><span className="switch"><input type="checkbox" checked={r.active !== false} onChange={(e) => setR(i, 'active', e.target.checked)} /><span /></span></label>
            <button type="button" className="icon-btn sm" aria-label="Remover conta fixa" onClick={() => put({ recurring: rec.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => put({ recurring: [...rec, { id: uid(), description: '', category: 'Aluguel', amount: '', day: '10', active: true, months: [] }] })}>Adicionar conta fixa</Button>
        <p className="muted small mt-sm">Clique em <b>Salvar</b> no topo da página para valer.</p>
      </Card>
    </>
  )
}
