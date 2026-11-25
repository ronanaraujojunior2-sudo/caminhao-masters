# Caminhão Masters — Arquitetura e decisões técnicas

## 1. Resumo

| Camada | Tecnologia | Onde roda | Custo |
|---|---|---|---|
| Aplicativo (telas) | PWA em JavaScript puro, sem etapa de compilação | GitHub Pages (repositório público, sem segredos no código) | Gratuito |
| Banco de dados | PostgreSQL do Supabase | Supabase | Gratuito (plano Free) ou US$ 25/mês (Pro) |
| Login e sessões | Supabase Auth (usuário + senha, **sem e-mail**) | Supabase | Incluído |
| Regras de segurança | RLS (Row Level Security) + funções no banco | Supabase | Incluído |
| Funções de servidor | 3 Edge Functions (Deno/TypeScript) | Supabase | Incluído |
| Fotos e documentos | Supabase Storage (2 compartimentos privados) | Supabase | Incluído até o limite do plano |
| Tempo real | Supabase Realtime | Supabase | Incluído |
| Offline | Service Worker + IndexedDB (fila de sincronização) | Aparelho do motorista | — |
| Backup | GitHub Actions (pg_dump diário criptografado) | GitHub | Gratuito |

**Por que esta escolha:** é a mesma linha já adotada pela Masters em outros sistemas (Supabase + PWA + GitHub), tem custo zero para começar, não exige servidor próprio, e — o mais importante — **as regras críticas ficam no banco de dados**, não na tela. Mesmo que alguém tente burlar o aplicativo, o banco recusa a operação.

## 2. Princípios de segurança

1. **Tudo bloqueado por padrão.** Visitantes não autenticados não leem nenhuma tabela. Cada perfil recebe somente o necessário (políticas RLS em `supabase/migrations/…03_seguranca_rls.sql`).
2. **Identidade vem da sessão.** O solicitante, o motorista, o autor de cada ação e o usuário gravado na auditoria vêm de `auth.uid()` (token assinado), nunca de um campo digitado. O navegador não consegue inserir solicitações diretamente na tabela — só pela função `criar_solicitacao`, que grava o solicitante a partir da sessão.
3. **Escrita controlada.** Solicitações, histórico, ocupação da agenda e auditoria só mudam por funções do banco que validam perfil e estado (máquina de estados).
4. **Segredos fora do código.** O arquivo `web/js/config.js` contém apenas a URL e a chave **pública** (publishable/anon), que é pública por desenho. A chave secreta (`service_role`) existe apenas dentro das Edge Functions, fornecida pelo próprio Supabase. Os valores são cadastrados como variáveis na hospedagem e o script de publicação recusa publicar se detectar chave secreta.
5. **Auditoria imutável.** Gatilhos registram inclusões, alterações (só os campos alterados, com valor anterior e novo) e exclusões. Um gatilho impede alterar ou apagar a auditoria e o histórico — inclusive pelo dono do banco.

## 3. Login sem e-mail

- O Supabase Auth exige um identificador; o sistema usa um **e-mail interno sintético** (`usuario@caminhaomasters.local`) que nunca é mostrado nem pedido. O usuário digita apenas **nome de usuário** e **senha**.
- O cadastro público fica **desligado**. Só o administrador cria contas (Edge Function `usuarios`), informando nome completo, usuário e perfil.
- A conta nasce com uma senha aleatória que ninguém conhece. O sistema gera um **código de primeiro acesso** (12 caracteres, uso único, válido 72 h, armazenado só como hash bcrypt), entregue pessoalmente.
- No **primeiro acesso**, o funcionário informa usuário + código + nova senha. O sistema grava a senha (o administrador nunca a vê), gera a **chave pessoal de recuperação** (25 caracteres ≈ 125 bits), exibe-a **uma única vez** e guarda apenas o hash.

### Recuperação de senha (sem e-mail e sem o administrador)
- Tela “Esqueceu sua senha?”: usuário + chave pessoal + nova senha + confirmação.
- Sucesso: nova senha gravada, **chave anterior invalidada**, **nova chave** exibida uma única vez, **todas as sessões encerradas** (tokens de renovação apagados e tokens de acesso antigos recusados pelo banco), registro na auditoria.
- Proteções: 5 tentativas erradas por usuário e 20 por IP a cada 15 min; resposta idêntica para usuário inexistente, código errado ou bloqueio (não revela contas); comparação de hash executada mesmo quando o usuário não existe (tempo semelhante); atraso aleatório.
- **Procedimento excepcional** (perdeu senha **e** chave): o administrador confirma a identidade pessoalmente, com documento oficial com foto, marca a confirmação e descreve-a (obrigatório). O sistema invalida senha, chave e sessões e gera um novo código de primeiro acesso. Um administrador não pode redefinir o próprio acesso (exige outro administrador). Tudo vai para a auditoria.

### Invalidação de sessões
Cada usuário tem `sessoes_invalidadas_em`. Toda regra de segurança confere se o token foi emitido depois desse instante (`fn_meu_perfil`). Desativar um usuário, recuperar ou alterar senha encerra imediatamente o acesso em todos os aparelhos.

## 4. Agenda e proteção contra conflitos

- Períodos completos: **manhã (07h–12h)** e **tarde (13h–17h)**, segunda a sexta.
- Tabela `ocupacoes` com restrição **única** (caminhão + data + período). Solicitações pendentes/em esclarecimento/aprovadas, bloqueios e manutenções programadas inserem uma linha ali **por gatilho**. Se duas pessoas pedirem o mesmo período ao mesmo tempo, o PostgreSQL deixa só uma gravar; a outra recebe “CONFLITO DE AGENDA … ocupado por a solicitação nº X”. Testado com duas conexões simultâneas reais.
- Recusa, cancelamento, conclusão administrativa, remoção de bloqueio e cancelamento de manutenção **liberam** o período automaticamente.
- O motorista **finalizar** o atendimento **não** libera o período: o administrador valida e conclui.
- Antecedência mínima configurável (próximo dia útil, 24 h, 48 h, personalizada), validada no banco no fuso da empresa (padrão America/Manaus). O administrador pode agendar com prazo menor (fica na auditoria).
- Estrutura multi-caminhão: todas as tabelas operacionais têm `caminhao_id`; com mais de um caminhão ativo aparece um seletor no topo.

### Estados da solicitação
`pendente → (esclarecimento ⇄ pendente) → aprovada → concluída`, ou `recusada` / `cancelada`. Execução do motorista em campo separado: `aguardando → em atendimento → finalizada`.

## 5. Funcionamento offline (motorista)

- O Service Worker guarda as telas no aparelho; a última programação carregada fica em cache.
- Registros do Diário de Bordo (início/encerramento de expediente, checklists, atendimentos, materiais, abastecimentos, ocorrências, fotos, iniciar/finalizar atendimento) entram numa **fila no IndexedDB** com **ID gerado no aparelho**.
- A fila envia na ordem quando a internet volta (evento `online` e a cada 60 s). Reenvio nunca duplica (`on conflict do nothing`; funções idempotentes).
- Indicador no topo: “⟳ N pendente(s) de sincronização”. Erros de regra ficam marcados para revisão (tentar novamente/descartar).
- Até a sincronização, o banco central continua considerando o período ocupado — o caminhão não é liberado oficialmente.

## 6. Notificações
- Internas: tabela `notificacoes`, sino com contador, histórico, atualização em tempo real.
- Navegador: com o sistema aberto em segundo plano e permissão concedida, o aviso aparece como notificação do sistema operacional.
- Push (sistema fechado): Edge Function `enviar-push` + Database Webhook + chaves VAPID (opcional; ver manual).

## 7. Decisões tomadas onde o documento não especificava
| Tema | Decisão | Motivo |
|---|---|---|
| Código de primeiro acesso | Gerado pelo sistema, entregue pessoalmente, 72 h, uso único | Permite que o funcionário crie a própria senha sem e-mail e sem o admin conhecer a senha |
| Solicitação feita pelo admin | Entra como pendente; o admin aprova em seguida | Mantém um único fluxo auditável |
| Motorista solicitar caminhão | Não permitido | O perfil do motorista é operacional (lista do item 9) |
| “Em manutenção” concluída | Mantém o período ocupado; cancelar libera | Histórico fiel do dia |
| Itens críticos do checklist | Pneus, freios, luzes, gancho, cabos/cintas, comandos hidráulicos, patolas, lança, vazamentos — sempre críticos; demais podem ser marcados como críticos pelo motorista | Servidor recalcula; não confia no aparelho |
| Abastecimento | Atualiza o KM do caminhão; o valor pago é opcional e apenas informativo (não gera despesa) | Controle financeiro fica no Sienge (ajuste da gestão, 24/11/2026). A tabela antiga de despesas foi preservada no banco, sem acesso pelo sistema |
| Relatórios | Sem módulo de relatórios: consultas e históricos operacionais ficam nas próprias telas (agenda, solicitações, Diário de Bordo, manutenções, ocorrências) | Ajuste da gestão (24/11/2026): foco exclusivo na gestão operacional |
| Exclusão de usuário | Conta de acesso apagada; cadastro apagado se não houver registros, ou mantido como “registro histórico” (nome preservado) se houver | Integridade do banco e rastreabilidade das operações |
| Hospedagem | GitHub Pages | Mesmo padrão do Controle de Ferramentas e Materiais; sem serviço adicional; a segurança fica no Supabase (RLS e funções de servidor), não no sigilo do código |
| Exportação PDF | Pela impressão do navegador (“Salvar como PDF”) com folha de estilo própria | Sem bibliotecas pesadas, funciona em qualquer aparelho |
| Exportação Excel | Gerador XLSX próprio (validado com leitor de planilhas) | Sem dependências externas |
| Feriados | Não automáticos nesta versão; usar Bloqueios | Fora do escopo do documento |
| Biblioteca Supabase | Carregada do CDN jsDelivr com versão fixa (2.119.1) e guardada em cache pelo Service Worker | Não exige instalação/compilação |
| Logomarca e ícone | Arquivos oficiais do Masters Gestão, copiados byte a byte | Regra: não recriar a marca |
| Padrão visual | Mesmo padrão do Masters Gestão (variáveis de cor, menu em degradê com grupos recolhíveis ›, ☰ e ◐, painel com faixa azul, tabelas com paginação, janelas e avisos) | Identidade única entre os sistemas da Masters |

## 8. Estrutura de pastas
```
caminhao-masters/
├── README.md                     visão geral e início rápido
├── .env.example                  modelo de variáveis (sem segredos)
├── package.json                  atalhos de testes e utilitários
├── docs/                         manuais e documentação
├── supabase/
│   ├── INSTALAR_BANCO_COMPLETO.sql   tudo em um arquivo para colar no SQL Editor
│   ├── migrations/               estrutura, regras, segurança, dados iniciais
│   ├── functions/                acesso · usuarios · enviar-push (Edge Functions)
│   └── config.toml               configuração para a Supabase CLI (opcional)
├── web/                          o aplicativo (é esta pasta que vai para o ar)
│   ├── index.html · sw.js · manifest.webmanifest
│   ├── css/app.css
│   ├── assets/                   logo (espaço reservado), ilustração, ícones
│   └── js/                       app, api, ui, sync, config, lib/, paginas/
├── tests/                        unitários, banco, concorrência, visual
├── scripts/                      gerar config.js e o SQL completo
└── .github/workflows/            backup diário criptografado
```
A lista completa de arquivos está em `docs/LISTA_DE_ARQUIVOS.md`.
