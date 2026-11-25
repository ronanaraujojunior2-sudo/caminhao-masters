// =====================================================================
// CAMINHÃO MASTERS — Edge Function "usuarios"
// Cadastro de usuários pelo administrador, redefinição excepcional de acesso,
// ativação/desativação e criação do ADMINISTRADOR INICIAL (bootstrap).
// O administrador NUNCA vê nem define a senha do funcionário: ele recebe um
// código de primeiro acesso, de uso único e validade de 72 horas.
//
// IMPORTANTE (Supabase > Edge Functions > usuarios > Details):
//   "Verify JWT with legacy secret" = DESLIGADO (a função valida internamente).
// Secrets: AUTH_EMAIL_DOMAIN (opcional), BOOTSTRAP_TOKEN (só para criar o 1º admin;
//          apague depois de usar).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("CM_SERVICE_ROLE_KEY"))!;
const DOMINIO = Deno.env.get("AUTH_EMAIL_DOMAIN") ?? "caminhaomasters.local";
const BOOTSTRAP = (Deno.env.get("BOOTSTRAP_TOKEN") ?? "").trim();

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function gerarSegredo(grupos: number, tamanho: number): string {
  const bytes = new Uint8Array(grupos * tamanho);
  crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => ALFABETO[b % 32]);
  return Array.from({ length: grupos }, (_, i) => c.slice(i * tamanho, (i + 1) * tamanho).join("")).join("-");
}
function senhaAleatoria(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)); // ninguém conhece esta senha
}
function iguaisTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let dif = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return dif === 0;
}
const USUARIO_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const PERFIS = ["admin", "solicitante", "motorista"];
const ip = (req: Request) => (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();

// Confere se quem chama é administrador ativo com sessão válida
async function exigirAdmin(req: Request): Promise<string> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) throw new Erro(401, "Sessão expirada. Entre novamente.");
  const { data: p } = await admin.from("perfis")
    .select("perfil, ativo, primeiro_acesso_pendente, sessoes_invalidadas_em").eq("id", data.user.id).single();
  let iat = 0;
  try { iat = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).iat ?? 0; } catch { /* */ }
  const invalidada = p ? Math.floor(new Date(p.sessoes_invalidadas_em).getTime() / 1000) : Infinity;
  if (!p || !p.ativo || p.primeiro_acesso_pendente || p.perfil !== "admin" || iat < invalidada) {
    throw new Erro(403, "Somente administradores podem gerenciar usuários.");
  }
  return data.user.id;
}
class Erro extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function criarConta(nome: string, usuario: string, perfil: string, ator: string | null) {
  nome = String(nome ?? "").trim().replace(/\s+/g, " ");
  usuario = String(usuario ?? "").trim().toLowerCase();
  if (nome.length < 3) throw new Erro(400, "Informe o nome completo.");
  if (!USUARIO_RE.test(usuario)) {
    throw new Erro(400, "Nome de usuário inválido: use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, sem espaços nem acentos.");
  }
  if (!PERFIS.includes(perfil)) throw new Erro(400, "Perfil inválido.");

  const { data: existe } = await admin.from("perfis").select("id").ilike("usuario", usuario).maybeSingle();
  if (existe) throw new Erro(409, "Este nome de usuário já está em uso. Escolha outro.");

  const { data: criado, error } = await admin.auth.admin.createUser({
    email: `${usuario}@${DOMINIO}`, password: senhaAleatoria(), email_confirm: true,
    user_metadata: { usuario, nome_completo: nome },
  });
  if (error || !criado.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) throw new Erro(409, "Este nome de usuário já está em uso.");
    throw new Erro(500, "Falha ao criar a conta: " + (error?.message ?? ""));
  }
  const id = criado.user.id;
  const { error: errPerfil } = await admin.from("perfis").insert({
    id, nome_completo: nome, usuario, perfil, criado_por: ator, primeiro_acesso_pendente: true,
  });
  if (errPerfil) {
    await admin.auth.admin.deleteUser(id); // desfaz
    throw new Erro(errPerfil.code === "23505" ? 409 : 500,
      errPerfil.code === "23505" ? "Este nome de usuário já está em uso." : "Falha ao gravar o perfil: " + errPerfil.message);
  }
  const codigo = gerarSegredo(3, 4);
  const { error: errCod } = await admin.rpc("svc_definir_codigo_acesso", {
    p_usuario: id, p_codigo: codigo, p_ator: ator ?? id, p_acao: "cadastro_usuario",
    p_justificativa: `Cadastro de ${nome} (${usuario}) com perfil ${perfil}`,
  });
  if (errCod) throw errCod;
  return { id, usuario, codigo_primeiro_acesso: codigo, validade_horas: 72 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "Método não permitido." });
  try {
    const b = await req.json().catch(() => ({}));

    // ---------- Administrador inicial (só funciona se NÃO houver nenhum admin) ----------
    if (b.acao === "bootstrap") {
      // Sem token configurado a criação é impossível; avisar isso não ajuda um atacante
      // e evita gastar tentativas à toa. Não conta como tentativa.
      if (BOOTSTRAP.length < 16) {
        return resp(503, { erro: "O token de instalação ainda não está cadastrado no Supabase (segredo BOOTSTRAP_TOKEN, mínimo 16 caracteres). Cadastre-o e tente de novo." });
      }
      const chave = "ip:" + ip(req);
      const { data: bloqueado } = await admin.rpc("svc_limite_excedido", { p_chave: chave, p_tipo: "bootstrap", p_max: 5, p_minutos: 60 });
      if (bloqueado) return resp(429, { erro: "Muitas tentativas. Aguarde 1 hora." });
      if (!iguaisTempoConstante(String(b.token ?? "").trim(), BOOTSTRAP)) {
        await admin.rpc("svc_registrar_tentativa", { p_chave: chave, p_tipo: "bootstrap", p_sucesso: false });
        return resp(403, { erro: "Token de instalação incorreto. Confira se é exatamente o valor salvo no Supabase (maiúsculas e minúsculas contam)." });
      }
      const { count } = await admin.from("perfis").select("id", { count: "exact", head: true }).eq("perfil", "admin");
      if ((count ?? 0) > 0) return resp(409, { erro: "Já existe administrador cadastrado. Use a tela de usuários." });
      const r = await criarConta(b.nome_completo, b.usuario, "admin", null);
      return resp(200, { ok: true, ...r });
    }

    const ator = await exigirAdmin(req);

    if (b.acao === "criar") {
      const r = await criarConta(b.nome_completo, b.usuario, b.perfil, ator);
      return resp(200, { ok: true, ...r });
    }

    if (b.acao === "redefinir") {
      // Procedimento excepcional: funcionário perdeu senha E chave.
      const just = String(b.justificativa ?? "").trim();
      if (just.length < 10) throw new Erro(400, "Descreva como a identidade do funcionário foi confirmada (mínimo 10 caracteres).");
      if (b.usuario_id === ator) throw new Erro(400, "Por segurança, outro administrador deve redefinir o seu acesso.");
      const { data: alvo } = await admin.from("perfis").select("id, usuario, ativo").eq("id", b.usuario_id).single();
      if (!alvo) throw new Erro(404, "Usuário não encontrado.");
      if (!alvo.ativo) throw new Erro(400, "Reative o usuário antes de redefinir o acesso.");
      await admin.auth.admin.updateUserById(alvo.id, { password: senhaAleatoria() }); // senha antiga deixa de valer
      const codigo = gerarSegredo(3, 4);
      const { error } = await admin.rpc("svc_definir_codigo_acesso", {
        p_usuario: alvo.id, p_codigo: codigo, p_ator: ator, p_acao: "redefinicao_acesso", p_justificativa: just,
      });
      if (error) throw error;
      return resp(200, { ok: true, usuario: alvo.usuario, codigo_primeiro_acesso: codigo, validade_horas: 72 });
    }

    if (b.acao === "ativar" || b.acao === "desativar") {
      const ativo = b.acao === "ativar";
      const just = String(b.justificativa ?? "").trim();
      if (!ativo && just.length < 3) throw new Erro(400, "Informe o motivo da desativação.");
      if (b.usuario_id === ator && !ativo) throw new Erro(400, "Você não pode desativar o próprio acesso.");
      const { data: alvo } = await admin.from("perfis").select("id, arquivado_em, excluido_em").eq("id", b.usuario_id).maybeSingle();
      if (!alvo) throw new Erro(404, "Usuário não encontrado.");
      if (alvo.excluido_em) throw new Erro(400, "Este usuário foi excluído e não pode ser reativado.");
      if (ativo && alvo.arquivado_em) {
        // Reativar um usuário arquivado: tira do arquivo e devolve o acesso
        const { error } = await admin.rpc("svc_arquivar_usuario", { p_alvo: alvo.id, p_ator: ator, p_arquivar: false, p_justificativa: just || null });
        if (error) throw new Erro(400, error.message);
        await admin.auth.admin.updateUserById(alvo.id, { ban_duration: "none" });
        return resp(200, { ok: true });
      }
      const { error } = await admin.from("perfis").update({ ativo }).eq("id", b.usuario_id);
      if (error) throw new Erro(400, error.message);
      await admin.auth.admin.updateUserById(b.usuario_id, { ban_duration: ativo ? "none" : "876000h" });
      if (!ativo) await admin.rpc("svc_invalidar_sessoes", { p_usuario: b.usuario_id });
      await admin.rpc("svc_auditar", {
        p_usuario: ator, p_acao: ativo ? "ativacao_usuario" : "desativacao_usuario", p_tabela: "perfis",
        p_registro: b.usuario_id, p_justificativa: just || null,
      });
      return resp(200, { ok: true });
    }

    if (b.acao === "arquivar") {
      // Arquivar: sai da lista principal e perde o acesso (pode ser reativado depois)
      const just = String(b.justificativa ?? "").trim();
      const { error } = await admin.rpc("svc_arquivar_usuario", { p_alvo: b.usuario_id, p_ator: ator, p_arquivar: true, p_justificativa: just || null });
      if (error) throw new Erro(400, error.message);
      await admin.auth.admin.updateUserById(b.usuario_id, { ban_duration: "876000h" });
      return resp(200, { ok: true });
    }

    if (b.acao === "excluir") {
      // Excluir: o banco decide entre apagar o cadastro (sem histórico) ou mantê-lo como
      // registro histórico (com histórico). Em ambos os casos a conta de acesso é apagada.
      const just = String(b.justificativa ?? "").trim();
      const { data: r, error } = await admin.rpc("svc_excluir_usuario", { p_alvo: b.usuario_id, p_ator: ator, p_justificativa: just || null });
      if (error) {
        // Já excluído antes (ex.: falha de rede ao apagar a conta): só conclui a remoção da conta de acesso.
        if (/já foi excluído/.test(error.message)) {
          await admin.auth.admin.deleteUser(b.usuario_id).catch(() => {});
          return resp(200, { ok: true, modo: "historico" });
        }
        throw new Erro(400, error.message);
      }
      const { error: errAuth } = await admin.auth.admin.deleteUser(b.usuario_id);
      if (errAuth && !/not.?found/i.test(errAuth.message)) {
        // O cadastro já não permite acesso; a conta será apagada numa nova tentativa.
        console.error("Falha ao apagar a conta de acesso:", errAuth.message);
        return resp(200, { ok: true, ...r, aviso: "Cadastro excluído, mas a conta de acesso não pôde ser apagada agora. O acesso já está bloqueado." });
      }
      return resp(200, { ok: true, ...r });
    }

    return resp(400, { erro: "Ação inválida." });
  } catch (e) {
    if (e instanceof Erro) return resp(e.status, { erro: e.message });
    console.error(e);
    return resp(500, { erro: "Erro interno. Tente novamente." });
  }
});
