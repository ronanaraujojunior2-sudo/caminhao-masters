-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 4: DADOS INICIAIS
-- Somente o essencial para o sistema funcionar. NENHUM dado fictício:
-- caminhão, obras e usuários são cadastrados pela Masters.
-- =====================================================================

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

insert into public.categorias (nome, ordem, protegida) values
  ('Transporte de materiais', 10, false),
  ('Transporte de ferramentas/equipamentos', 20, false),
  ('Retirada de materiais', 30, false),
  ('Entrega de materiais', 40, false),
  ('Apoio operacional à obra', 50, false),
  ('Movimentação de materiais dentro da obra', 60, false),
  ('Outros', 999, true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- OPCIONAL: alertas automáticos diários de documentos e manutenção.
-- No Supabase: Database > Extensions > ative "pg_cron"; depois rode:
--
--   select cron.schedule('alertas-caminhao-masters', '0 10 * * *',
--                        $$ select public.gerar_alertas(); $$);
--
-- (10:00 UTC = 06:00 em Manaus). Sem o pg_cron, os alertas também são
-- gerados sempre que um administrador abre o Painel.
-- ---------------------------------------------------------------------
