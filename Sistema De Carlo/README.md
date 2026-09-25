# De Carlo Beauty · Agendamento e Gestão

Sistema da Astrovia Solutions feito para a **De Carlo Beauty**: site de agendamento para as clientes, com painel para a proprietária e para cada profissional.

- **Sem `.env`**, o sistema abre em **modo demonstração**: os dados de exemplo ficam salvos no navegador. PIN da proprietária **1234** e das profissionais **1111 a 4444**.
- **Com `.env`** (dados do Supabase), o sistema funciona **online de verdade**: a dona, a equipe e as clientes usam o mesmo sistema, cada uma com o seu login.

---

## O que foi feito para a De Carlo

| Pedido | Onde fica |
|---|---|
| Logo e cores da marca (azul-marinho, rosé e pérola) | Todo o sistema. Tema claro por padrão e tema escuro opcional |
| **Pop-ups de aviso** para a equipe | Novo agendamento, lembrete antes do atendimento, resumo do dia e avisos da gestão (a profissional toca em "Ciente"). Notificação do navegador quando permitida |
| **Avisos da gestão** | Painel → **Avisos**: para toda a equipe ou para uma profissional, com validade e quem já leu. Também tem o aviso no topo do site para as clientes |
| **Contato das clientes bloqueado** para as profissionais | A regra fica no banco: elas não recebem telefone nem WhatsApp das clientes. Liga e desliga em Ajustes → Privacidade |
| **Filtro da agenda** por dia, semana, mês e período | Agenda. Também filtra por profissional e por status |
| **Agendar direto no calendário** | Toque no horário vazio (visão Dia), no "+ Agendar" do dia (Semana) ou no "+" do dia (Mês) |
| **Cada profissional vê só a agenda dela** | Perfil da profissional → Agenda (e Meu dia) |
| **Tempo e comissão por procedimento, por profissional** | Equipe → Editar → "Procedimentos desta profissional". O tempo muda os horários livres no site |
| **Relatórios em PDF com filtros** | Relatórios → **PDF gerencial** (análise da gestão) e **Extratos** (um por profissional, para enviar). A profissional baixa o dela em Extrato |
| **Portfólio no card da cliente** | Clientes → ficha → Portfólio da cliente (enviar fotos de antes e depois). Também abre no detalhe do agendamento |
| **Ajustes editáveis** | Ajustes → Mensagens do WhatsApp (11 textos), página de agendamento, notificações e privacidade |

Continuam funcionando todos os recursos da base: ficha de anamnese com alertas, caixa com comissões automáticas, cartão fidelidade, clube de assinatura, lista de espera, aniversariantes, campanha de volta, avaliações, lucro real, modo TV e importação por planilha.

---

## Colocar no ar para o período de teste

São três contas: **Supabase** (banco e login), **GitHub** (guarda o código) e **Vercel** (publica o site). As três têm plano gratuito.

### 1. Supabase (banco de dados)

1. Em supabase.com → **New project**. Nome: `decarlo-beauty`. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Menu **SQL Editor** → **New query** → cole o arquivo `supabase/schema.sql` inteiro → **Run**. Deve aparecer "Success".
3. Menu **Authentication → Users → Add user → Create new user**: e-mail e senha da **proprietária**, com **Auto Confirm User** marcado.
4. Volte ao **SQL Editor** e rode a linha abaixo, trocando o e-mail:
   ```sql
   insert into staff(user_id, role, name, email)
   select id, 'admin', 'Gestão De Carlo', email from auth.users where email = 'EMAIL-DA-DONA';
   ```
5. Menu **Authentication → Sign In / Providers**: deixe **Email** ligado e desligue "Allow new users to sign up" (só a gestão cria os logins).
6. Menu **Project Settings → API**: copie a **Project URL** e a chave **anon public**. Elas vão para a Vercel no passo 3.

### 2. GitHub (código)

1. Crie um repositório **privado** chamado `decarlo-beauty`.
2. Envie o conteúdo desta pasta (`Sistema De Carlo`). Pode ser pelo GitHub Desktop ou arrastando os arquivos em "Add file → Upload files".
   - **Não envie** a pasta `node_modules` nem um arquivo `.env` com chaves (o `.gitignore` já ignora os dois).

### 3. Vercel (site)

1. Em vercel.com → **Add New → Project** → importe o repositório `decarlo-beauty`.
2. Framework: **Vite**. Build Command: `npm run build`. Output Directory: `dist`.
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon public
4. **Deploy**. O link fica no formato `decarlo-beauty.vercel.app`.

> Atenção: pelos termos da Vercel, o plano Hobby (gratuito) é para uso não comercial. Se preferir outra opção gratuita, o Netlify e o Cloudflare Pages permitem uso comercial e as configurações são as mesmas: build `npm run build`, pasta `dist` e as mesmas duas variáveis.

### 4. Primeiro acesso da proprietária

1. Abra o link → **Área da equipe** → entre com o e-mail e a senha da proprietária.
2. **Ajustes**: nome, WhatsApp, endereço, Instagram, horários, mensagens e notificações. Clique em **Salvar**.
3. **Catálogo**: cadastre os serviços, os preços, a duração e a comissão padrão. Se tiver uma planilha, use Ajustes → Importar planilha.
4. **Equipe**: cadastre cada profissional, com folgas, cor, e tempo e comissão por procedimento se precisar.
5. **Logins das profissionais**: no Supabase, crie o usuário de cada uma em Authentication → Users → Add user (com Auto Confirm). Depois, no painel, vá em Equipe → Editar → **E-mail de acesso** → **Vincular**.
6. Copie o link de agendamento (Ajustes → Link de agendamento) e coloque na bio do Instagram e no WhatsApp.

### Dicas para o teste

- **Notificações**: cada aparelho precisa tocar em "Ativar" no aviso do painel, ou em Ajustes → Notificações → Permitir aqui. Os pop-ups aparecem com o painel aberto, e a agenda atualiza sozinha a cada minuto.
- **No celular**: abra o site e use "Adicionar à tela inicial". Ele passa a abrir como um aplicativo.
- **Pausa do Supabase**: no plano gratuito, projetos sem nenhum acesso por 7 dias são pausados. Com uso diário, isso não acontece.
- **Fotos**: o portfólio usa o bucket `portfolio` do Supabase Storage, que o `schema.sql` já cria. As fotos da ficha só aparecem no site se "Mostrar no site" for marcado.

---

## Para desenvolver

```bash
npm install
npm run dev          # http://localhost:5173 (modo demonstração sem .env)
npm run build        # versão de produção em dist/
npm run build:demo   # demonstração em um único arquivo: dist-demo/index.html
```

```
src/
  config/brand.js        ← nome, logo e textos da marca
  lib/messages.js        ← modelos das mensagens de WhatsApp (editáveis em Ajustes)
  lib/pdf.js             ← relatórios em PDF
  lib/commission.js      ← regras de comissão e tempo por profissional
  components/Notifier.jsx← pop-ups e notificações da equipe
  data/demo.js | supabase.js ← modo demonstração | banco real
  pages/Booking.jsx      ← site da cliente
  pages/staff/*          ← painel da gestão e das profissionais
supabase/schema.sql      ← tabelas, regras de acesso (RLS) e funções
```

### Segurança

- As clientes só veem serviços, profissionais (sem telefone) e horários ocupados, sem nomes.
- O agendamento passa pela função `book_appointment`: o preço e a duração saem do banco (com o tempo próprio de cada profissional), e ela impede que duas clientes marquem o mesmo horário.
- As profissionais **não acessam** as tabelas de clientes e agendamentos direto. Elas usam as funções `pro_*`, que entregam só a agenda dela, sem contato das clientes quando a privacidade está ligada.
- Vendas, estoque e conclusão do atendimento acontecem juntos, em uma única operação (`create_sale`). Cada profissional só lança vendas dela e só a gestão pode estornar.
