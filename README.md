# Caminhão Masters

Sistema web (PWA) para **agendamento e gestão operacional do caminhão Munck da Masters Engenharia**.
A **agenda** é o centro do sistema: solicitações por período (manhã/tarde), aprovação administrativa,
proteção contra conflitos no banco de dados e atualização em tempo real. Complementam: Diário de Bordo
(com funcionamento offline), checklists, abastecimentos, manutenção, documentos e vencimentos, notificações e auditoria.
Foco exclusivo na gestão operacional do caminhão: sem módulo financeiro (fica no Sienge) e sem módulo de relatórios — as consultas e os históricos ficam em cada tela.

## Comece por aqui
| Documento | Para quem |
|---|---|
| [`docs/MANUAL_IMPLANTACAO.md`](docs/MANUAL_IMPLANTACAO.md) | Quem vai colocar o sistema no ar (passo a passo, sem programação) |
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Administradores, solicitantes e motoristas |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Equipe técnica: arquitetura, segurança e decisões |
| [`docs/TESTES.md`](docs/TESTES.md) | Testes automatizados e validação |
| [`docs/LISTA_DE_ARQUIVOS.md`](docs/LISTA_DE_ARQUIVOS.md) | Todos os arquivos do projeto |

## Resumo técnico
- **Front-end:** HTML/CSS/JavaScript puro (módulos ES), sem compilação — pasta `web/`.
- **Back-end:** Supabase — PostgreSQL com RLS, funções e gatilhos (`supabase/migrations/`), Auth, Storage, Realtime e 3 Edge Functions (`supabase/functions/`).
- **Hospedagem:** GitHub Pages (mesmo padrão do Controle de Ferramentas e Materiais), publicado automaticamente pela rotina `.github/workflows/publicar-site.yml`. Endereço: https://ronanaraujojunior2-sudo.github.io/caminhao-masters/
- **Login:** nome de usuário + senha, sem e-mail; recuperação por chave pessoal.

## Início rápido (técnico)
1. Supabase: execute `supabase/INSTALAR_BANCO_COMPLETO.sql` no SQL Editor; publique as funções `acesso` e `usuarios` (JWT desligado); cadastre os segredos `AUTH_EMAIL_DOMAIN` e `BOOTSTRAP_TOKEN`; desligue o cadastro público.
2. Cadastre `SUPABASE_URL` e `SUPABASE_KEY` (publishable) como variáveis da hospedagem.
3. Publique e abra `#/instalacao` para criar o primeiro administrador.
4. Testes: `bash tests/rodar_todos.sh`.

Nenhuma senha ou chave secreta está no código-fonte. O sistema não contém dados fictícios.
