#!/usr/bin/env bash
# Roda os testes do banco num PostgreSQL LOCAL descartável (nunca no Supabase de produção).
# Uso: PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash tests/rodar_testes_banco.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-caminhao_masters_teste}
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" 2>&1 | grep -vE "^(NOTICE:  (trigger|policy|relation|schema|extension|table|function|view|publication).*skipping)|wal_level|HINT|^$" || true; }
run tests/sql/00_simulador_supabase.sql
for f in supabase/migrations/*.sql; do run "$f"; done
psql -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/01_testes_regras.sql 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /; s/^NOTICE:  /  /' | grep -vE '^( entrar |-+|\(1 row\)|)$'
bash tests/sql/02_concorrencia.sh "$DB"
