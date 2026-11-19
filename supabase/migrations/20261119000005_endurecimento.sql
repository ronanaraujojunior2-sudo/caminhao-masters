-- =====================================================================
-- CAMINHÃO MASTERS — MIGRAÇÃO 5: ENDURECIMENTO (recomendações do Supabase Security Advisor)
-- 1) Fixa o search_path das funções auxiliares (evita sequestro de nomes).
-- 2) fn_exigir_perfil só é usada dentro de outras funções do banco: não precisa
--    ser chamável diretamente pelo navegador.
-- =====================================================================
alter function public.fn_rotulo_periodo(text) set search_path = public;
alter function public.svc_normalizar_segredo(text) set search_path = public;
alter function public.fn_bloquear_alteracao() set search_path = public;
alter function public.fn_set_justificativa(text) set search_path = public;
alter function public.fn_touch() set search_path = public;
alter function public.trg_categoria_protecao() set search_path = public;
alter function public.fn_inicio_periodo(date, text) set search_path = public;
alter function public.fn_proximo_dia_util(date) set search_path = public;
alter function public.fn_hoje_local() set search_path = public;
revoke execute on function public.fn_exigir_perfil(text[]) from authenticated, anon, public;
