-- CAMINHÃO MASTERS — Migração 8: a função de gatilho que protege o último
-- administrador não deve ser chamável pela API (alerta do Supabase).
revoke all on function public.trg_perfis_exclusao() from public, anon, authenticated;
