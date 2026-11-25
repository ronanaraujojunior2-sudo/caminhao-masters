# Caminhão Masters — Testes automatizados e validação

Resultado na entrega (todos executados e aprovados):

| Conjunto | Quantidade | O que cobre |
|---|---|---|
| Banco de dados (`tests/sql/01_testes_regras.sql`) | 151 verificações (+2 de concorrência) | Permissões dos 3 perfis e de visitantes, cadastros, solicitações, conflitos, antecedência, esclarecimento, recusa, cancelamento, conclusão, bloqueios, manutenção, Diário de Bordo, checklists críticos, abastecimento/despesas, ocorrências, documentos, alertas, auditoria imutável, invalidação de sessões, primeiro acesso, chave de recuperação, força bruta, importação de obras do Sienge (só administrador, sem duplicar, vazio não apaga, ligação a obra manual, auditoria), abastecimento com valor opcional e sem despesas, despesas inacessíveis, arquivar/reativar/excluir usuários preservando histórico (último administrador protegido, auditoria) |
| Concorrência real (`tests/sql/02_concorrencia.sh`) | 2 | Duas conexões simultâneas pedindo o mesmo período: exatamente uma grava; duas importações simultâneas da mesma obra: só uma cadastra |
| Unitários (`tests/unit/*.test.mjs`) | 35 | Regras de data/antecedência no fuso de Manaus, grade e filtros da agenda, divergência de materiais, validade de documentos, senha/usuário, planilha Excel (validada por leitor independente), fila offline (ordem, sem duplicar, erro de regra, sem envio em dobro), leitor de .xlsx/.csv e relação de obras do Sienge (formato real: período, títulos na linha 7, células mescladas, rodapé), pesquisa de obras |
| Módulos (`tests/verificar_imports.py`) | todos | Cada nome importado existe; cada rota tem sua tela |
| Visual de ponta a ponta (`tests/visual/testar_telas.py`) | 48 capturas + 29 verificações | App real em Chrome, computador/tablet/celular, 3 perfis; mostrar/ocultar senha; filtros; validações; menus e rotas por perfil; importação de obras (prévia, desmarcar, relatórios para baixar); módulos financeiro e de relatórios retirados (menu, rotas e painel); abastecimento com valor opcional; usuários (filtros, Excluir usuário com confirmação, Arquivar, Reativar); pesquisa de obras (teclado, toque); abertura (termina sozinha, não repete na sessão, pode ser pulada, respeita reduzir movimento); nenhum erro de JavaScript; nenhuma tela mais larga que o aparelho |

## Como rodar (técnico)
Pré-requisitos: Node.js 20+, Python 3 com Playwright e Google Chrome, PostgreSQL 15+ local **descartável**.

```bash
# PostgreSQL local (exemplo)
export PGHOST=/tmp PGPORT=5433 PGUSER=postgres
bash tests/rodar_todos.sh           # tudo
npm test                            # só unitários
npm run test:banco                  # só banco (cria e apaga o banco "caminhao_masters_teste")
npm run test:visual                 # só visual (capturas em tests/visual/capturas)
```
Os testes do banco usam `tests/sql/00_simulador_supabase.sql`, que simula `auth.uid()`, os papéis e o Storage do Supabase. **Nunca** execute esse simulador no Supabase real.

O teste visual troca apenas a biblioteca do Supabase por um simulador com dados de exemplo (`tests/visual/supabase-simulado.js`); todo o restante é o código real que vai para produção.

## O que não é possível testar automaticamente fora do Supabase real
Valide manualmente com a tabela da **Etapa 10 do Manual de Implantação**:
- chamadas reais às Edge Functions (primeiro acesso, recuperação, cadastro de usuários) — a lógica de banco que elas usam está coberta pelos testes;
- Realtime entre dois navegadores;
- push com o sistema fechado;
- instalação na tela inicial em iPhone/Android e envio real de fotos.
