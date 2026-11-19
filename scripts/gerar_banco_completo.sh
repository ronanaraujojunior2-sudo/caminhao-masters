#!/usr/bin/env bash
# Junta as 4 migrações em um único arquivo para colar no SQL Editor do Supabase.
cd "$(dirname "$0")/.."
{
  echo "-- ====================================================================="
  echo "-- CAMINHÃO MASTERS — INSTALAÇÃO COMPLETA DO BANCO (gerado automaticamente)"
  echo "-- Cole TODO este conteúdo no Supabase > SQL Editor > New query > Run."
  echo "-- Pode ser executado de novo com segurança (não apaga dados)."
  echo "-- ====================================================================="
  for f in supabase/migrations/*.sql; do echo; echo "-- >>> $(basename "$f")"; cat "$f"; done
} > supabase/INSTALAR_BANCO_COMPLETO.sql
echo "supabase/INSTALAR_BANCO_COMPLETO.sql gerado."
