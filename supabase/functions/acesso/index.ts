// =====================================================================
// CAMINHÃO MASTERS — Edge Function "acesso"
// Primeiro acesso, recuperação de senha por chave pessoal e alteração de senha.
// Não usa e-mail. Não revela se uma conta existe. Limita tentativas.
//
// IMPORTANTE (Supabase > Edge Functions > acesso > Details):
//   "Verify JWT with legacy secret" = DESLIGADO (a função valida internamente).
// Variáveis automáticas do Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Variável opcional (Secrets): AUTH_EMAIL_DOMAIN (padrão: caminhaomasters.local)
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("CM_SERVICE_ROLE_KEY"))!;
const DOMINIO = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "caminhaomasters.local";

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MSG_GENERICA =
  "Não foi possível concluir. Confira os dados informados. Após várias tentativas erradas, o acesso fica bloqueado por 15 minutos.";

const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem 0/O, 1/I para evitar confusão
function gerarSegredo(grupos: number, tamanho: number): string {
  const bytes = new Uint8Array(grupos * tamanho);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALFABETO[b % 32]);
  const partes: string[] = [];
  for (let i = 0; i < grupos; i++) partes.push(chars.slice(i * tamanho, (i + 1) * tamanho).join(""));
  return partes.join("-");
}

function validarSenha(s: unknown): string | null {
  if (typeof s !== "string") return "Informe a nova senha.";
  if (s.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (s.length > 72) return "A senha deve ter no máximo 72 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/[0-9]/.test(s)) return "A senha deve conter letras e números.";
  return null;
}

const normalizarUsuario = (u: unknown) => String(u ?? "").trim().toLowerCase();
const ip = (req: Request) => (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
const atraso = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 400));

async function limiteExcedido(chaves: string[], tipo: string): Promise<boolean> {
  for (const [i, chave] of chaves.entries()) {
    const max = i === 0 ? 5 : 20; // 5 por usuário, 20 por IP, a cada 15 minutos
    const { data } = await admin.rpc("svc_limite_excedido", { p_chave: chave, p_tipo: tipo, p_max: max, p_minutos: 15 });
    if (data === true) return true;
  }
  return false;
}
async function registrar(chaves: string[], tipo: string, sucesso: boolean) {
  for (const chave of chaves) await admin.rpc("svc_registrar_tentativa", { p_chave: chave, p_tipo: tipo, p_sucesso: sucesso });
}

async function definirSenha(userId: string, senha: string) {
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha });
  if (error) throw new Error("Falha ao gravar a senha: " + error.message);
}

// ---------------------------------------------------------------------
async function primeiroAcesso(req: Request, b: Record<string, unknown>) {
  const usuario = normalizarUsuario(b.usuario);
  const erroSenha = validarSenha(b.senha);
  if (!usuario || !b.codigo) return resp(400, { erro: "Informe usuário, código de primeiro acesso e senha." });
  if (erroSenha) return resp(400, { erro: erroSenha });
  if (b.senha !== b.confirmacao) return resp(400, { erro: "A confirmação não confere com a senha." });

  const chaves = ["usuario:" + usuario, "ip:" + ip(req)];
  if (await limiteExcedido(chaves, "primeiro_acesso")) { await atraso(); return resp(429, { erro: MSG_GENERICA }); }

  const { data: userId } = await admin.rpc("svc_validar_codigo_acesso", { p_usuario: usuario, p_codigo: String(b.codigo) });
  if (!userId) { await registrar(chaves, "primeiro_acesso", false); await atraso(); return resp(400, { erro: MSG_GENERICA }); }

  await definirSenha(userId, String(b.senha));
  const chave = gerarSegredo(5, 5);
  const { error } = await admin.rpc("svc_gravar_nova_chave", { p_usuario: userId, p_chave: chave, p_acao: "primeiro_acesso" });
  if (error) throw error;
  await registrar(chaves, "primeiro_acesso", true);
  return resp(200, { ok: true, chave_recuperacao: chave });
}

async function recuperar(req: Request, b: Record<string, unknown>) {
  const usuario = normalizarUsuario(b.usuario);
  const erroSenha = validarSenha(b.senha);
  if (!usuario || !b.chave) return resp(400, { erro: "Informe usuário, chave pessoal e nova senha." });
  if (erroSenha) return resp(400, { erro: erroSenha });
  if (b.senha !== b.confirmacao) return resp(400, { erro: "A confirmação não confere com a senha." });

  const chaves = ["usuario:" + usuario, "ip:" + ip(req)];
  if (await limiteExcedido(chaves, "recuperacao")) { await atraso(); return resp(429, { erro: MSG_GENERICA }); }

  const { data: userId } = await admin.rpc("svc_validar_chave_recuperacao", { p_usuario: usuario, p_chave: String(b.chave) });
  if (!userId) { await registrar(chaves, "recuperacao", false); await atraso(); return resp(400, { erro: MSG_GENERICA }); }

  await definirSenha(userId, String(b.senha));
  const nova = gerarSegredo(5, 5);
  const { error } = await admin.rpc("svc_gravar_nova_chave", { p_usuario: userId, p_chave: nova, p_acao: "recuperacao_senha" });
  if (error) throw error;
  await registrar(chaves, "recuperacao", true);
  return resp(200, { ok: true, chave_recuperacao: nova });
}

async function alterarSenha(req: Request, b: Record<string, unknown>) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return resp(401, { erro: "Sessão expirada. Entre novamente." });
  const { data: perfil } = await admin.from("perfis").select("usuario, ativo").eq("id", u.user.id).single();
  if (!perfil?.ativo) return resp(403, { erro: "Acesso desativado." });

  const erroSenha = validarSenha(b.senha_nova);
  if (erroSenha) return resp(400, { erro: erroSenha });
  if (b.senha_nova !== b.confirmacao) return resp(400, { erro: "A confirmação não confere com a nova senha." });

  const chaves = ["usuario:" + perfil.usuario];
  if (await limiteExcedido(chaves, "alterar_senha")) return resp(429, { erro: MSG_GENERICA });

  // confere a senha atual sem afetar a sessão do usuário
  const verif = createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: errLogin } = await verif.auth.signInWithPassword({
    email: `${perfil.usuario}@${DOMINIO}`, password: String(b.senha_atual ?? ""),
  });
  if (errLogin) { await registrar(chaves, "alterar_senha", false); return resp(400, { erro: "Senha atual incorreta." }); }

  await definirSenha(u.user.id, String(b.senha_nova));
  await admin.rpc("svc_invalidar_sessoes", { p_usuario: u.user.id });
  await admin.rpc("svc_auditar", { p_usuario: u.user.id, p_acao: "alteracao_senha", p_tabela: "perfis", p_registro: u.user.id });
  await registrar(chaves, "alterar_senha", true);
  return resp(200, { ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });
  try {
    const b = await req.json().catch(() => ({}));
    switch (b.acao) {
      case "primeiro_acesso": return await primeiroAcesso(req, b);
      case "recuperar": return await recuperar(req, b);
      case "alterar_senha": return await alterarSenha(req, b);
      default: return resp(400, { erro: "Ação inválida." });
    }
  } catch (e) {
    console.error(e);
    return resp(500, { erro: "Erro interno. Tente novamente em instantes." });
  }
});
