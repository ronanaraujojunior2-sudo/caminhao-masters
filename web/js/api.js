// Conexão com o Supabase, sessão, perfil e utilidades de acesso a dados.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm';
import { CONFIG } from './config.js';

export const configurado = /^https:\/\/.+/.test(CONFIG.SUPABASE_URL) && !CONFIG.SUPABASE_KEY.startsWith('COLE_');

export const sb = configurado
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'caminhao-masters-sessao' },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

/** Estado global da sessão. */
export const estado = {
  usuario: null,       // auth user
  perfil: null,        // linha de public.perfis
  config: null,        // public.configuracoes
  caminhoes: [],       // caminhões ativos
  caminhaoId: null,    // caminhão selecionado
};

export const emailDe = (usuario) => `${String(usuario).trim().toLowerCase()}@${CONFIG.AUTH_EMAIL_DOMAIN}`;
export const ehAdmin = () => estado.perfil?.perfil === 'admin';
export const ehMotorista = () => estado.perfil?.perfil === 'motorista';
export const ehSolicitante = () => estado.perfil?.perfil === 'solicitante';

/** Executa uma consulta do supabase-js e lança erro legível em caso de falha. */
export async function q(promessa) {
  const { data, error, count } = await promessa;
  if (error) throw error;
  return count !== undefined && count !== null && data === null ? count : data;
}

export function msgErro(e) {
  const m = String(e?.message || e?.error_description || e || '');
  if (/invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(m)) return 'Sem conexão com a internet. Verifique a rede e tente novamente.';
  if (/jwt expired|invalid jwt|refresh token/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta operação.';
  if (/user is banned/i.test(m)) return 'Acesso desativado. Procure o administrador.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/duplicate key|already exists/i.test(m) && !/CONFLITO/.test(m)) return 'Já existe um registro com esses dados.';
  if (/violates foreign key/i.test(m)) return 'Registro vinculado a outro que não existe mais.';
  if (/violates check constraint/i.test(m)) return 'Algum campo tem valor inválido. Revise o formulário.';
  return m || 'Erro inesperado.';
}

/** Chama uma Edge Function (acesso/usuarios). */
export async function funcao(nome, corpo, autenticado = false) {
  const headers = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY };
  if (autenticado) {
    const { data } = await sb.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  // Sem sessão: só o cabeçalho apikey. Chaves "publishable" não são JWT e não vão no Authorization.
  let r;
  try {
    r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${nome}`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  } catch {
    throw new Error('Sem conexão com a internet. Verifique a rede e tente novamente.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Falha no servidor (${r.status}). Verifique se a função "${nome}" foi publicada.`);
  return j;
}

/** Carrega perfil, configuração e caminhões. Retorna false se não há sessão válida. */
export async function carregarSessao() {
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  if (!data.session) return false;
  estado.usuario = data.session.user;
  const { data: perfil, error } = await sb.from('perfis').select('*').eq('id', estado.usuario.id).maybeSingle();
  if (error && /failed to fetch/i.test(error.message)) {
    // offline: usa o perfil guardado da última sessão (somente leitura + fila do motorista)
    const cache = lerCache('perfil');
    if (cache?.id === estado.usuario.id) { Object.assign(estado, lerCache('estado') || {}); estado.perfil = cache; return true; }
    return false;
  }
  if (!perfil || !perfil.ativo || perfil.primeiro_acesso_pendente) { await sb.auth.signOut(); return false; }
  estado.perfil = perfil;
  const [cfg, cams] = await Promise.all([
    sb.from('configuracoes').select('*').eq('id', 1).maybeSingle(),
    sb.from('caminhoes').select('*').eq('ativo', true).order('nome'),
  ]);
  if (!cfg.data) { await sb.auth.signOut(); return false; } // sessão invalidada (ex.: senha trocada em outro aparelho)
  estado.config = cfg.data;
  estado.caminhoes = cams.data || [];
  const salvo = localStorage.getItem('cm-caminhao');
  estado.caminhaoId = estado.caminhoes.find((c) => c.id === salvo)?.id || estado.caminhoes[0]?.id || null;
  gravarCache('perfil', perfil);
  gravarCache('estado', { config: estado.config, caminhoes: estado.caminhoes, caminhaoId: estado.caminhaoId });
  return true;
}

export async function sair() {
  try { await sb?.auth.signOut(); } catch { /* offline */ }
  estado.usuario = estado.perfil = null;
  localStorage.removeItem('cm-cache-perfil');
  location.hash = '#/login';
}

export function caminhaoAtual() { return estado.caminhoes.find((c) => c.id === estado.caminhaoId) || null; }
export function selecionarCaminhao(id) { estado.caminhaoId = id; localStorage.setItem('cm-caminhao', id); }

export function gravarCache(chave, valor) { try { localStorage.setItem('cm-cache-' + chave, JSON.stringify(valor)); } catch { /* cheio */ } }
export function lerCache(chave) { try { return JSON.parse(localStorage.getItem('cm-cache-' + chave)); } catch { return null; } }

/** Diferença do fuso da empresa para UTC, em minutos (Manaus = -240). */
export function offsetFuso(tz = estado.config?.fuso_horario || 'America/Manaus', quando = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(quando)
      .find((x) => x.type === 'timeZoneName')?.value || 'GMT-4';
    const m = p.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { return -240; }
}

/** URL assinada (temporária) de um arquivo privado do Storage. */
export async function urlArquivo(bucket, caminho, segundos = 600) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(caminho, segundos);
  if (error) throw error;
  return data.signedUrl;
}
