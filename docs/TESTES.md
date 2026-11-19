# Caminhão Masters — Testes automatizados e validação

Resultado na entrega (todos executados e aprovados):

| Conjunto | Quantidade | O que cobre |
|---|---|---|
| Banco de dados (`tests/sql/01_testes_regras.sql`) | 109 verificações | Permissões dos 3 perfis e de visitantes, cadastros, solicitações, conflitos, antecedência, esclarecimento, recusa, cancelamento, conclusão, bloqueios, manutenção, Diário de Bordo, checklists críticos, abastecimento/despesas, ocorrências, documentos, alertas, auditoria imutável, invalidação de sessões, primeiro acesso, chave de recuperação, força bruta |
| Concorrência real (`tests/sql/02_concorrencia.sh`) | 1 | Duas conexões simultâneas pedindo o mesmo período: exatamente uma grava |
| Unitários (`tests/unit/*.test.mjs`) | 19 | Regras de data/antecedência no fuso de Manaus, grade e filtros da agenda, divergência de materiais, validade de documentos, senha/usuário, planilha Excel (validada por leitor independente), fila offline (ordem, sem duplicar, erro de regra, sem envio em dobro) |
| Módulos (`tests/verificar_imports.py`) | todos | Cada nome importado existe; cada rota tem sua tela |
| Visual de ponta a ponta (`tests/visual/testar_telas.py`) | 36 capturas + 9 verificações | App real em Chrome, computador/tablet/celular, 3 perfis; mostrar/ocultar senha; filtros; validações; menus e rotas por perfil; nenhum erro de JavaScript; nenhuma tela mais larga que o aparelho |

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
