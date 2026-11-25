# Lista de arquivos do projeto

| Arquivo | Finalidade |
|---|---|
| `.gitignore` | Impede envio de segredos e arquivos temporários ao GitHub |
| `.env.example` | Modelo de variáveis de ambiente (sem segredos) |
| `.github/workflows/backup-banco.yml` | Backup diário criptografado |
| `README.md` | Visão geral |
| `docs/ARQUITETURA.md` | Documentação |
| `docs/LISTA_DE_ARQUIVOS.md` | Documentação |
| `docs/MANUAL_IMPLANTACAO.md` | Documentação |
| `docs/MANUAL_USUARIO.md` | Documentação |
| `docs/TESTES.md` | Documentação |
| `package.json` | Atalhos de testes e utilitários |
| `scripts/gerar-config.mjs` | Gera config.js a partir do .env |
| `scripts/gerar_banco_completo.sh` | Gera o SQL completo |
| `supabase/INSTALAR_BANCO_COMPLETO.sql` | Instalação completa do banco (colar no SQL Editor) |
| `supabase/config.toml` | Configuração para a Supabase CLI (opcional) |
| `supabase/functions/acesso/index.ts` | Primeiro acesso, recuperação por chave, alteração de senha |
| `supabase/functions/enviar-push/index.ts` | Notificações push (opcional) |
| `supabase/functions/usuarios/index.ts` | Cadastro de usuários, redefinição, admin inicial |
| `supabase/migrations/20261119000001_estrutura.sql` | Tabelas |
| `supabase/migrations/20261119000002_funcoes_regras.sql` | Regras de negócio, gatilhos, auditoria, agenda |
| `supabase/migrations/20261119000003_seguranca_rls.sql` | Segurança (RLS), Storage, Realtime |
| `supabase/migrations/20261119000004_dados_iniciais.sql` | Configuração e categorias iniciais |
| `tests/rodar_testes_banco.sh` | Testes do banco |
| `tests/rodar_todos.sh` | Roda todos os testes |
| `tests/sql/00_simulador_supabase.sql` | Simulador do Supabase (somente testes locais) |
| `tests/sql/01_testes_regras.sql` | 109 verificações do banco |
| `tests/sql/02_concorrencia.sh` | Teste de concorrência real |
| `tests/unit/fila.test.mjs` | Teste unitário |
| `tests/unit/regras.test.mjs` | Teste unitário |
| `tests/unit/xlsx.test.mjs` | Teste unitário |
| `tests/verificar_imports.py` | Conferência de módulos |
| `tests/visual/capturas/01-login-computador.png` | Captura do teste visual |
| `tests/visual/capturas/02-recuperar-senha.png` | Captura do teste visual |
| `tests/visual/capturas/03-primeiro-acesso.png` | Captura do teste visual |
| `tests/visual/capturas/10-admin-painel.png` | Captura do teste visual |
| `tests/visual/capturas/11-admin-agenda-semana.png` | Captura do teste visual |
| `tests/visual/capturas/12-admin-agenda-mes.png` | Captura do teste visual |
| `tests/visual/capturas/12b-detalhe-atividade.png` | Captura do teste visual |
| `tests/visual/capturas/13-admin-solicitacoes.png` | Captura do teste visual |
| `tests/visual/capturas/14-admin-solicitacao-detalhe.png` | Captura do teste visual |
| `tests/visual/capturas/14b-recusa-exige-justificativa.png` | Captura do teste visual |
| `tests/visual/capturas/15-solicitar.png` | Captura do teste visual |
| `tests/visual/capturas/16-bloqueios.png` | Captura do teste visual |
| `tests/visual/capturas/17-manutencoes.png` | Captura do teste visual |
| `tests/visual/capturas/18-diario.png` | Captura do teste visual |
| `tests/visual/capturas/19-ocorrencias.png` | Captura do teste visual |
| `tests/visual/capturas/21-documentos.png` | Captura do teste visual |
| `tests/visual/capturas/22-relatorios.png` | Captura do teste visual |
| `tests/visual/capturas/23-obras.png` | Captura do teste visual |
| `tests/visual/capturas/24-caminhoes.png` | Captura do teste visual |
| `tests/visual/capturas/25-usuarios.png` | Captura do teste visual |
| `tests/visual/capturas/25b-novo-usuario.png` | Captura do teste visual |
| `tests/visual/capturas/26-auditoria.png` | Captura do teste visual |
| `tests/visual/capturas/27-configuracoes.png` | Captura do teste visual |
| `tests/visual/capturas/28-notificacoes.png` | Captura do teste visual |
| `tests/visual/capturas/29-conta.png` | Captura do teste visual |
| `tests/visual/capturas/30-login-celular.png` | Captura do teste visual |
| `tests/visual/capturas/31-motorista-meu-dia.png` | Captura do teste visual |
| `tests/visual/capturas/32-motorista-iniciar-expediente.png` | Captura do teste visual |
| `tests/visual/capturas/33-motorista-finalizar-atendimento.png` | Captura do teste visual |
| `tests/visual/capturas/34-motorista-agenda-celular.png` | Captura do teste visual |
| `tests/visual/capturas/35-menu-celular.png` | Captura do teste visual |
| `tests/visual/capturas/40-solicitante-agenda.png` | Captura do teste visual |
| `tests/visual/capturas/41-solicitante-formulario.png` | Captura do teste visual |
| `tests/visual/capturas/42-solicitante-detalhe.png` | Captura do teste visual |
| `tests/visual/capturas/50-tablet-agenda.png` | Captura do teste visual |
| `tests/visual/supabase-simulado.js` | Simulador usado no teste visual |
| `tests/visual/testar_telas.py` | Teste visual ponta a ponta |
| `web/assets/caminhao-munck.svg` | Ilustração do caminhão Munck |
| `web/assets/icones/icone-180.png` | Ícone provisório do app |
| `web/assets/icones/icone-192.png` | Ícone provisório do app |
| `web/assets/icones/icone-512.png` | Ícone provisório do app |
| `web/assets/icones/icone-maskable-512.png` | Ícone provisório do app |
| `web/css/app.css` | Visual e responsividade |
| `web/index.html` | Página do aplicativo |
| `web/js/api.js` | Conexão com o Supabase e sessão |
| `web/js/app.js` | Navegação e menus por perfil |
| `web/js/config.example.js` | Modelo do config.js |
| `web/js/config.js` | CONFIGURAÇÃO (editar na implantação) |
| `web/js/lib/checklists.js` | Modelos de checklist |
| `web/js/lib/fila.js` | Fila de sincronização offline |
| `web/js/lib/regras.js` | Regras da agenda |
| `web/js/lib/xlsx.js` | Gerador de Excel |
| `web/js/lib/planilha-leitor.js` | Leitor de .xlsx/.csv sem biblioteca externa |
| `web/js/lib/obras-sienge.js` | Leitura da relação de obras do Sienge e comparação com o cadastro |
| `supabase/migrations/20261124000007_ajustes_gestao.sql` | Banco: sem financeiro, abastecimento com valor opcional, arquivar/excluir usuários |
| `web/js/lib/busca-texto.js` | Busca sem acentos por várias palavras |
| `web/js/busca-obra.js` | Campo de pesquisa de obras (usado em todos os formulários) |
| `web/js/abertura.js` | Animação de abertura (caminhão Munck com a logo oficial) |
| `web/js/paginas/obras-importar.js` | Tela: importar obras do Sienge |
| `supabase/migrations/20261119000006_obras_sienge.sql` | Banco: campos do Sienge nas obras e função de importação |
| `tests/fixtures/obras-sienge-teste.xlsx` | Planilha de teste no formato do Sienge (dados fictícios) |
| `web/js/paginas/agenda.js` | Tela: agenda |
| `web/js/paginas/auditoria.js` | Tela: auditoria |
| `web/js/paginas/bloqueios.js` | Tela: bloqueios |
| `web/js/paginas/caminhoes.js` | Tela: caminhoes |
| `web/js/paginas/chave.js` | Tela: chave |
| `web/js/paginas/configuracoes.js` | Tela: configuracoes |
| `web/js/paginas/conta.js` | Tela: conta |
| `web/js/paginas/diario-forms.js` | Tela: diario-forms |
| `web/js/paginas/diario.js` | Tela: diario |
| `web/js/paginas/documentos.js` | Tela: documentos |
| `web/js/paginas/instalacao.js` | Tela: instalacao |
| `web/js/paginas/login.js` | Tela: login |
| `web/js/paginas/manutencoes.js` | Tela: manutencoes |
| `web/js/paginas/motorista.js` | Tela: motorista |
| `web/js/paginas/notificacoes.js` | Tela: notificacoes |
| `web/js/paginas/obras.js` | Tela: obras |
| `web/js/paginas/ocorrencias.js` | Tela: ocorrencias |
| `web/js/paginas/painel.js` | Tela: painel |
| `web/js/paginas/primeiro-acesso.js` | Tela: primeiro-acesso |
| `web/js/paginas/recuperar.js` | Tela: recuperar |
| `web/js/paginas/solicitacoes.js` | Tela: solicitacoes |
| `web/js/paginas/solicitar.js` | Tela: solicitar |
| `web/js/paginas/usuarios.js` | Tela: usuarios |
| `web/js/sync.js` | Fila offline, tempo real, notificações |
| `web/js/ui.js` | Componentes de tela |
| `web/manifest.webmanifest` | Instalação como aplicativo |
| `web/sw.js` | Offline e push (Service Worker) |

Total: 112 arquivos.
