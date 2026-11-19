// =====================================================================
// CONFIGURAÇÃO DO CAMINHÃO MASTERS — EDITE ESTE ARQUIVO NA IMPLANTAÇÃO
// (passo a passo em docs/MANUAL_IMPLANTACAO.md, Etapa 4)
// As chaves abaixo são PÚBLICAS por natureza (a segurança está nas regras
// do banco). NUNCA coloque aqui a chave "service_role"/"secret".
// =====================================================================
export const CONFIG = {
  // Supabase > Project Settings > API > Project URL
  SUPABASE_URL: 'https://wjxnjbaqhsgefnprmksi.supabase.co',
  // Supabase > Project Settings > API Keys > "Publishable key" (ou "anon public")
  SUPABASE_KEY: 'sb_publishable_j62Yh5G6Vp5UR3pQu06_VA_glY5W-oW',
  // Domínio interno dos logins (nunca é mostrado). Igual ao segredo AUTH_EMAIL_DOMAIN das funções.
  AUTH_EMAIL_DOMAIN: 'caminhaomasters.local',
  // Opcional: chave pública VAPID para notificações push (deixe vazio para desativar)
  VAPID_PUBLIC_KEY: '',
};
