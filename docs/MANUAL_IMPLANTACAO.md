# Caminhão Masters — Manual de implantação (passo a passo)

Este manual foi escrito para quem **não é programador**. Siga as etapas na ordem. Ao final de cada etapa há um **✅ Como conferir**. Não avance se a conferência falhar.

> Os nomes de menus do Supabase e do GitHub podem mudar levemente com o tempo. Se não encontrar exatamente o texto indicado, procure a opção com nome parecido no mesmo menu.

**Tempo estimado:** 1h30 a 2h na primeira vez.
**Você vai precisar de:** um computador com navegador (Chrome ou Edge), o arquivo ZIP do projeto, a logomarca original da Masters e acesso a uma conta GitHub e a uma conta Supabase (podem ser as mesmas já usadas pela Masters).

---

## Etapa 1 — Descompactar o projeto
1. Clique com o botão direito no arquivo `caminhao-masters.zip` → **Extrair tudo…** → **Extrair**.
2. Abra a pasta `caminhao-masters`. Você verá as pastas `docs`, `supabase`, `web`, `tests`, `scripts` e o arquivo `README.md`.
3. A logomarca oficial (`web/assets/logo-masters.png`) e os ícones do aplicativo (`web/assets/icones/`) já estão no projeto, copiados sem alteração do sistema Masters Gestão.

✅ **Como conferir:** a tela de login mostra a logomarca da Masters Engenharia.

---

## Etapa 2 — Criar o banco de dados (Supabase)

### 2.1 Criar o projeto
1. Acesse **https://supabase.com** e entre na conta da Masters.
2. Clique em **New project**.
3. **Name:** `caminhao-masters` · **Database Password:** clique em **Generate a password** e **guarde a senha** em local seguro (será usada no backup) · **Region:** *South America (São Paulo)*.
4. Clique em **Create new project** e aguarde 1–2 minutos.

### 2.2 Instalar a estrutura do banco
1. No menu da esquerda, clique em **SQL Editor** → **New query**.
2. No seu computador, abra o arquivo `supabase/INSTALAR_BANCO_COMPLETO.sql` com o **Bloco de Notas** (botão direito → Abrir com → Bloco de Notas).
3. Selecione tudo (**Ctrl+A**), copie (**Ctrl+C**) e cole (**Ctrl+V**) na área de texto do SQL Editor.
4. Clique em **Run** (canto inferior direito).

✅ **Como conferir:** aparece **“Success. No rows returned”**. No menu **Table Editor** aparecem tabelas como `solicitacoes`, `obras`, `caminhoes`, `categorias`. Abra `categorias`: devem existir 7 categorias, incluindo **Outros**.

> Se aparecer erro, copie a mensagem e envie ao suporte técnico. O arquivo pode ser executado novamente sem apagar dados.

### 2.3 (Opcional, recomendado) Alertas automáticos diários
1. Menu **Database** → **Extensions** → procure **pg_cron** → ative.
2. **SQL Editor** → **New query** → cole e execute:
   ```sql
   select cron.schedule('alertas-caminhao-masters', '0 10 * * *', $$ select public.gerar_alertas(); $$);
   ```
✅ **Como conferir:** aparece uma linha com um número (o id do agendamento). Sem esta etapa, os alertas são gerados quando um administrador abre o Painel.

---

## Etapa 3 — Autenticação e segurança (Supabase)

### 3.1 Desligar o cadastro público
1. Menu **Authentication** → **Sign In / Providers** (ou **Providers**).
2. Desligue **Allow new users to sign up** (Permitir cadastro de novos usuários) → **Save**.
3. Em **Email**, deixe o provedor **ligado**, mas desligue **Confirm email** → **Save**. (Nenhum e-mail é enviado; o e-mail interno é só técnico.)

✅ **Como conferir:** a opção de cadastro público aparece **desligada**.

### 3.2 Publicar as funções de servidor (Edge Functions)
Repita para cada uma das três funções: **acesso**, **usuarios** e **enviar-push** (esta última é opcional).
1. Menu **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Apague o código de exemplo.
3. Abra no Bloco de Notas `supabase/functions/acesso/index.ts`, copie tudo e cole no editor.
4. No campo do nome da função digite exatamente **`acesso`** (minúsculas) → **Deploy function**.
5. Após publicar, abra a função → **Details** (ou **Settings**) → **desligue “Verify JWT with legacy secret” / “Enforce JWT verification”** → **Save**. *(A função valida o acesso internamente; sem desligar, a tela de login não consegue falar com ela.)*
6. Repita com `supabase/functions/usuarios/index.ts` (nome **`usuarios`**).

✅ **Como conferir:** em **Edge Functions** aparecem `acesso` e `usuarios` com status ativo.

### 3.3 Cadastrar os segredos das funções
1. Menu **Edge Functions** → **Secrets** (ou **Project Settings → Edge Functions → Secrets**).
2. Clique em **Add new secret** e cadastre:

| Nome | Valor |
|---|---|
| `AUTH_EMAIL_DOMAIN` | `caminhaomasters.local` |
| `BOOTSTRAP_TOKEN` | um texto aleatório com **pelo menos 16 caracteres** (ex.: `Masters-Instalacao-2026-k9Qz`). Anote-o: será usado na Etapa 6. |

✅ **Como conferir:** os dois nomes aparecem na lista de segredos (os valores ficam ocultos).

> **Não** cadastre a chave `service_role` no aplicativo. O Supabase já entrega essa chave às funções automaticamente.

---

## Etapa 4 — Localizar as duas informações de conexão
O aplicativo precisa de duas informações **públicas** do Supabase. Elas **não** são digitadas no código: serão cadastradas na hospedagem (Etapa 6).
1. No Supabase: **Project Settings** (engrenagem) → **Data API** (ou **API**). Copie a **Project URL** (ex.: `https://abcdefgh.supabase.co`) para um bloco de notas.
2. Em **API Keys**, copie a **Publishable key** (começa com `sb_publishable_`). Em projetos antigos, use a chave **anon public**.
3. **Nunca** use a chave *Secret* (`sb_secret_...`) nem a *service_role*. O sistema recusa publicar se ela for usada por engano.

✅ **Como conferir:** você tem a URL terminada em `.supabase.co` e uma chave começando com `sb_publishable_`.

---

## Etapa 5 — Executar localmente (opcional, para técnicos)
1. Instale o **Node.js** (LTS) em https://nodejs.org.
2. Na pasta do projeto, copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_KEY`.
3. Abra o terminal na pasta e execute `node scripts/gerar-config.mjs` e depois `npx --yes serve web -l 8080`.
4. Abra **http://localhost:8080**. O arquivo `.env` nunca vai para o GitHub (está no `.gitignore`).

---

## Etapa 6 — Publicar o sistema (Cloudflare Pages, gratuito)
**Por que Cloudflare Pages:** é gratuito, permite uso comercial, publica a partir de repositório **privado** do GitHub e não tem limite de tráfego. (GitHub Pages exige plano pago para repositório privado e não é destinado a uso empresarial; o plano gratuito da Vercel proíbe uso comercial.)

### 6.1 Repositório privado no GitHub
1. Instale o **GitHub Desktop** (https://desktop.github.com), entre com sua conta.
2. **File → Add local repository** → escolha a pasta `caminhao-masters` → clique em **create a repository** → **Create repository**.
3. Clique em **Publish repository**, deixe marcado **Keep this code private** → **Publish repository**.

✅ **Como conferir:** em https://github.com, o repositório `caminhao-masters` aparece com o cadeado (privado) e as pastas `web`, `supabase`, `docs`.

### 6.2 Criar o site no Cloudflare
1. Acesse https://dash.cloudflare.com/sign-up e crie a conta gratuita (confirme o e-mail).
2. Menu **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git** (Importar repositório existente).
3. Autorize o GitHub, permitindo acesso **somente** ao repositório `caminhao-masters`. Selecione-o → **Begin setup**.
4. Preencha:
   - **Project name:** `caminhao-masters` (será o endereço `caminhao-masters.pages.dev`; se estiver ocupado, use `caminhao-masters-eng`).
   - **Production branch:** `main`.
   - **Framework preset:** `None`.
   - **Build command:** `node scripts/gerar-config.mjs`
   - **Build output directory:** `web`
5. Abra **Environment variables (advanced)** e adicione:
   - `SUPABASE_URL` = a Project URL da Etapa 4;
   - `SUPABASE_KEY` = a Publishable key da Etapa 4.
6. **Save and Deploy**. Aguarde 1–2 minutos.

✅ **Como conferir:** aparece **Success** e o endereço `https://caminhao-masters.pages.dev`. Ao abri-lo, aparece a tela de login.

**Se der erro:** clique na implantação → **View build log**. Mensagens comuns: “SUPABASE_URL ausente ou inválida” (variável não cadastrada ou com espaço) e “PERIGO: chave SECRETA” (foi usada a chave errada). Corrija em **Settings → Variables and Secrets** e clique em **Retry deployment**.

**Atualizações futuras:** altere os arquivos na pasta, abra o GitHub Desktop, escreva um resumo (ex.: “Ajuste na agenda”), clique em **Commit to main** e **Push origin**. O Cloudflare publica sozinho em 1–2 minutos. Ao alterar telas, aumente a versão em `web/sw.js` (`const VERSAO = ...`).

---

## Etapa 7 — Cadastrar o administrador inicial
1. Abra o endereço publicado acrescentando **`#/instalacao`** ao final. Ex.: `https://caminhao-masters.pages.dev/#/instalacao`.
2. Preencha: **Token de instalação** (o `BOOTSTRAP_TOKEN` da Etapa 3.3), **Nome completo** e **Nome de usuário** (ex.: `masters.admin`).
3. Clique em **Criar administrador** e **anote o código de primeiro acesso** exibido.
4. **Imediatamente**, no Supabase → **Edge Functions → Secrets**, **apague** o segredo `BOOTSTRAP_TOKEN`.
5. Clique em **Fazer primeiro acesso**, informe o código, crie a senha (mínimo 8 caracteres, com letras e números; use o ícone de olho para conferir o que digitou).
6. O sistema exibe a **chave pessoal de recuperação**: copie, baixe o arquivo `.txt` ou anote em papel e guarde em local seguro. Marque “Guardei minha chave” → **Continuar**.

✅ **Como conferir:** você entra no **Painel geral**. Tentar `#/instalacao` novamente mostra “Já existe administrador cadastrado”.

> Recomendação: cadastre um **segundo administrador** (Etapa 8). Assim um pode redefinir o acesso do outro em caso de perda de senha e chave.

---

## Etapa 8 — Cadastrar os funcionários
1. Menu **Cadastros → Usuários** → **+ Novo usuário**.
2. Informe **Nome completo**, **Nome de usuário** (ex.: `joao.silva` — sem espaços, sem acentos; não pode ser alterado depois) e **Perfil** (Solicitante, Motorista ou Administrador).
3. Clique em **Cadastrar**. Anote o **código de primeiro acesso** (válido por 72 horas, uso único) e entregue **pessoalmente** ao funcionário, junto com o endereço do sistema e o nome de usuário.
4. O funcionário abre o sistema → **Primeiro acesso** → informa usuário, código e cria a própria senha → guarda a chave de recuperação.

✅ **Como conferir:** na lista, o funcionário aparece como “Aguardando primeiro acesso” e, depois do primeiro acesso, como “Ativo”.

**Outras ações:** *Editar* (nome e perfil), *Desativar* (perde o acesso na hora; histórico mantido), *Redefinir acesso* (somente se o funcionário perdeu senha **e** chave, após conferir pessoalmente um documento oficial com foto).

---

## Etapa 9 — Cadastrar o caminhão e as obras
### Caminhão
1. Menu **Cadastros → Caminhões** → **+ Novo caminhão**.
2. Preencha nome (ex.: `Munck 01`), placa, marca/modelo, ano/modelo, **responsável geral** pelo caminhão (pessoa responsável pelo veículo na empresa — não é o administrador do sistema), telefone e o **KM atual**.

### Obras
1. Menu **Cadastros → Obras** → **+ Nova obra**.
2. Preencha nome, endereço completo (opcional, usado no mapa do motorista), **responsável principal** (obrigatório, um por obra), telefone e até dois contatos adicionais.
3. Obras encerradas: use **Inativar** — elas deixam de receber solicitações, mas o histórico é mantido.

### Configurações
Menu **Configurações**: escolha a antecedência mínima (próximo dia útil, 24 h, 48 h ou personalizada), se os materiais são obrigatórios no registro de atendimento, prazos dos alertas e o fuso horário. Ali também se gerenciam as **categorias** (renomear, desativar, reordenar; “Outros” é fixa).

✅ **Como conferir:** a **Agenda** passa a mostrar a semana com os períodos “Disponível”.

---

## Etapa 10 — Testar os três perfis
Cadastre três usuários de teste (um de cada perfil) e use **três navegadores ou janelas anônimas** (Ctrl+Shift+N) para estar logado com os três ao mesmo tempo.

| # | Perfil | Ação | Resultado esperado |
|---|---|---|---|
| 1 | Todos | Na tela de login, digitar a senha e clicar no **olho** | A senha aparece e some sem apagar o que foi digitado |
| 2 | Solicitante | **Solicitar caminhão** para amanhã (se dia útil), manhã | Mensagem “Solicitação nº … enviada”; na agenda, o período fica “Reservado” |
| 3 | Admin | Observar a agenda **sem recarregar** | O novo pedido aparece sozinho em segundos; o sino mostra 1 notificação |
| 4 | Outro solicitante | Pedir o **mesmo** período | O período aparece indisponível; se forçado, o sistema mostra “CONFLITO DE AGENDA” |
| 5 | Admin | Abrir a solicitação → **Solicitar esclarecimentos** | Solicitante recebe notificação; período continua reservado |
| 6 | Solicitante | **Responder esclarecimento** | Volta para “Pendente” e o admin é notificado |
| 7 | Admin | **Aprovar** (com prioridade) | Solicitante e motorista notificados; agenda mostra “Agendado” |
| 8 | Motorista | **Meu dia** → **Iniciar expediente** (KM + checklist) | Expediente aberto; checklist com item crítico irregular gera alerta ao admin |
| 9 | Motorista | Ativar **modo avião** → **Iniciar atendimento** → **Finalizar atendimento** (preencher, anexar foto) | Indicador “pendente(s) de sincronização” no topo |
| 10 | Motorista | Desativar modo avião | Em até 1 minuto, o indicador some; admin recebe “Atendimento finalizado” |
| 11 | Admin | **Validar e concluir** | Período liberado na agenda |
| 12 | Admin | **Bloqueios** → bloquear um dia com solicitação aprovada | Sistema impede e informa a solicitação em conflito |
| 13 | Motorista | Tentar abrir `#/usuarios` ou `#/relatorios` | É redirecionado; menus administrativos não aparecem |
| 14 | Solicitante | **Esqueceu sua senha?** com a chave guardada | Nova senha funciona; nova chave exibida; a chave antiga não funciona mais |
| 15 | Admin | **Auditoria** | Todas as ações acima aparecem com usuário, data/hora, valores anterior e novo |
| 16 | Todos | Abrir no celular e **Adicionar à tela inicial** | Ícone instalado; telas legíveis, botões grandes |

---

## Etapa 11 — Notificações push (opcional)
Sem esta etapa, as notificações funcionam no sino do sistema e como aviso do navegador **enquanto o sistema estiver aberto**. Para receber com o sistema **fechado**:
1. Gerar as chaves VAPID: no computador com Node.js (Etapa 5), abra o `cmd` e execute `npx --yes web-push generate-vapid-keys`. Anote a **Public Key** e a **Private Key**.
2. Supabase → **Edge Functions → Secrets**: cadastre `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + e-mail do responsável de TI) e `PUSH_WEBHOOK_SECRET` (um texto aleatório).
3. Publique a função **`enviar-push`** (Etapa 3.2, desligando a verificação JWT).
4. Supabase → **Database → Webhooks** → **Create a new hook**: tabela `notificacoes`, evento **Insert**, tipo **Supabase Edge Functions**, função `enviar-push`, e em **HTTP Headers** adicione `x-webhook-secret` com o mesmo valor do `PUSH_WEBHOOK_SECRET`.
5. Em `web/js/config.js`, preencha `VAPID_PUBLIC_KEY` com a **Public Key** e publique novamente.
6. Cada usuário: **Minha conta → Ativar notificações** e aceitar. No iPhone, só funciona com o app **instalado na tela inicial** (iOS 16.4 ou superior).

---

## Etapa 12 — Backups e manutenção

### Backup automático diário (gratuito)
1. Supabase → botão **Connect** (topo) → aba **Connection String** → **Session pooler** → copie o endereço e troque `[YOUR-PASSWORD]` pela senha do banco da Etapa 2.1.
2. GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = o endereço copiado;
   - `BACKUP_SENHA` = uma frase longa (guarde-a: sem ela o backup não abre).
3. **Actions → Backup do banco → Run workflow**.

✅ **Como conferir:** a execução fica verde e, ao abri-la, aparece o arquivo `backup-caminhao-masters` em **Artifacts**. Os backups ficam 90 dias, criptografados. Esta rotina diária também evita que o projeto gratuito do Supabase seja pausado por inatividade.

**Restaurar** (com apoio de TI): baixar o artefato, descriptografar com `gpg -d arquivo.tgz.gpg > backup.tgz`, extrair e usar `pg_restore` em um projeto novo onde as migrações já foram instaladas.

**Recomendação extra:** uma vez por mês, exporte em Excel as **Solicitações**, **Despesas** e **Auditoria** e guarde na pasta de rede da empresa.

### Manutenção de rotina
- **Semanal:** conferir o Painel (pendências, ocorrências, alertas).
- **Mensal:** conferir se o backup diário está verde em **Actions**; conferir uso em Supabase → **Settings → Usage** (banco, armazenamento de fotos).
- **Ao desligar um funcionário:** **Usuários → Desativar** no mesmo dia.
- **Atualização do sistema:** substituir os arquivos no GitHub; se houver nova migração SQL, executá-la no SQL Editor antes.

---

## Etapa 13 — Custos recorrentes

| Item | Custo | Observação |
|---|---|---|
| Supabase plano **Free** | R$ 0 | Banco de 500 MB, cerca de 1 GB de arquivos (fotos/documentos), 50 mil usuários ativos/mês. Projeto pausa após 7 dias sem uso (o backup diário evita). Sem backup automático do próprio Supabase. |
| Supabase plano **Pro** (recomendado após o período de testes) | a partir de US$ 25/mês (cerca de R$ 130–150) | Sem pausa, 8 GB de banco, mais armazenamento, backups diários do próprio Supabase. Inclui US$ 10 de crédito de processamento, que cobre a menor instância. |
| GitHub (repositório privado e backup via Actions) | R$ 0 | Plano gratuito inclui repositórios privados e minutos de Actions suficientes para o backup diário. |
| Cloudflare Pages (hospedagem) | R$ 0 | Uso comercial permitido, sem limite de tráfego, 500 publicações/mês. |
| Domínio próprio (opcional, ex.: `caminhao.masters.com.br`) | ~R$ 40/ano no Registro.br | Se a Masters já tem domínio, basta criar um subdomínio e ligá-lo em Cloudflare Pages → Custom domains. |
| Push, e-mail, SMS | R$ 0 | O sistema não usa e-mail nem SMS. |

**Estimativa de uso:** cada foto é reduzida para ~200–400 KB antes do envio; 1 GB comporta aproximadamente 3.000 fotos. Com uso intenso de fotos, o plano Free tende a ficar pequeno em alguns meses.
Valores confirmados em novembro/2026; confira em https://supabase.com/pricing antes de contratar.

---

## Etapa 14 — O que ainda depende da Masters
1. ~~Logomarca e ícone~~ — resolvidos: usados os arquivos oficiais do Masters Gestão, sem alteração.
3. **Plano do Supabase:** começar no Free para testes; decidir pelo Pro antes do uso oficial.
4. **Quem serão os administradores** (recomendado: dois) e lista de funcionários com perfis.
5. **Regra de antecedência** e se materiais serão obrigatórios no registro de atendimento.
6. **Cadastro real** do caminhão, obras, documentos e planos de manutenção (o sistema não vem com dados fictícios).
7. **Procedimento de identidade** para redefinição excepcional de acesso (qual documento, quem confere).
8. **Notificações push** (Etapa 11) — opcional.
9. **Domínio próprio** — opcional.
10. **Política de uso de fotos** (LGPD): fotos de pessoas, placas e recebedores podem conter dados pessoais; definir prazo de guarda.
11. **Feriados:** nesta versão, usar **Bloqueios** para feriados.
