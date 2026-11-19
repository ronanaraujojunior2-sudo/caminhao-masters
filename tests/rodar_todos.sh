#!/usr/bin/env bash
# Roda TODOS os testes: unitários, banco (PostgreSQL local), imports e visual.
set -eo pipefail
cd "$(dirname "$0")/.."
echo "== 1/4 Testes unitários (regras da agenda, planilha Excel, fila offline)"; node --test tests/unit/*.test.mjs
echo "== 2/4 Testes do banco (regras, permissões, segurança, concorrência)"; bash tests/rodar_testes_banco.sh | tail -3
echo "== 3/4 Conferência de módulos e rotas"; python3 tests/verificar_imports.py web/js
echo "== 4/4 Teste visual (computador, tablet, celular; 3 perfis)"; python3 tests/visual/testar_telas.py | tail -1
echo "== TODOS OS TESTES PASSARAM =="
