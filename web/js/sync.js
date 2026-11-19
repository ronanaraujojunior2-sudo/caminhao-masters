// Sincronização offline, tempo real, notificações e push.
import { Fila, armazenamentoIndexedDB, novoId } from './lib/fila.js';
import { sb, estado, msgErro } from './api.js';
import { CONFIG } from './config.js';
import { aviso, janela, esc, fmtDataHora, comprimirImagem, confirmar } from './ui.js';

// ---------------------------------------------------------------------
// FILA OFFLINE
// ---------------------------------------------------------------------
function converterErro(err) {
  const e = new Error(err.message || String(err));
  const sc = Number(err.statusCode ?? err.status);
  e.status = /failed to fetch|networkerror|load failed|fetch failed/i.test(e.message) ? 0 : (Number.isFinite(sc) && sc ? sc : 400);
  return e;
}

async function executor(op) {
  let r;
  if (op.tipo === 'insert') {
    r = await sb.from(op.tabela).upsert(op.dados, { onConflict: 'id', ignoreDuplicates: true });
  } else if (op.tipo === 'update') {
    r = await sb.from(op.tabela).update(op.dados).eq('id', op.chave);
  } else if (op.tipo === 'rpc') {
    r = await sb.rpc(op.funcao, op.args);
  } else if (op.tipo === 'upload') {
    const up = await sb.storage.from(op.bucket).upload(op.caminho, op.arquivo, { contentType: op.mime, upsert: false });
    if (up.error && !/exist|duplicate/i.test(up.error.message)) throw converterErro(up.error);
    r = await sb.from('anexos').upsert({
      id: op.anexo_id, entidade: op.entidade, entidade_id: op.entidade_id, bucket: op.bucket,
      caminho: op.caminho, nome_arquivo: op.nome_arquivo, mime: op.mime, enviado_por: op.usuario_id,
    }, { onConflict: 'id', ignoreDuplicates: true });
  } else {
    throw new Error('Operação desconhecida: ' + op.tipo);
  }
  if (r?.error) throw converterErro(r.error);
}

export const fila = new Fila({ armazenamento: armazenamentoIndexedDB(), executor, aoMudar: () => atualizarIndicador() });

/** Registra uma operação (funciona sem internet). */
export async function registrar(op) {
  await fila.adicionar({ ...op, rotulo: op.rotulo || op.tabela || op.funcao });
  if (navigator.onLine) await fila.processar();
}

/** Coloca fotos na fila (comprimidas). */
export async function registrarFotos(entidade, entidadeId, arquivos) {
  for (const original of arquivos || []) {
    const arq = await comprimirImagem(original);
    const ext = (arq.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    await fila.adicionar({
      tipo: 'upload', rotulo: 'foto', bucket: 'fotos', anexo_id: novoId(),
      caminho: `${estado.usuario.id}/${entidade}/${entidadeId}/${novoId()}.${ext}`,
      arquivo: arq, mime: arq.type || 'image/jpeg', nome_arquivo: original.name,
      entidade, entidade_id: entidadeId, usuario_id: estado.usuario.id,
    });
  }
  if (navigator.onLine) await fila.processar();
}

export async function atualizarIndicador() {
  const el = document.getElementById('sync-indicador');
  if (!el) return;
  const { pendentes, erros } = await fila.contar();
  const off = !navigator.onLine;
  el.hidden = !pendentes && !erros && !off;
  el.className = 'sync ' + (erros ? 'sync-erro' : off ? 'sync-off' : 'sync-pend');
  el.textContent = erros ? `⚠ ${erros} com erro` : pendentes ? `⟳ ${pendentes} pendente(s) de sincronização` : 'Sem conexão';
  el.title = 'Registros guardados neste aparelho aguardando envio ao banco central';
}

export async function abrirPainelSincronizacao() {
  const ops = await fila.listar();
  const linhas = ops.map((o) => `<tr><td>${esc(o.rotulo || o.tipo)}</td><td>${fmtDataHora(o.criado_em)}</td>
    <td>${o.estado === 'erro' ? `<b class="txt-erro">Erro:</b> ${esc(o.erro)}` : 'Pendente'}</td>
    <td>${o.estado === 'erro' ? `<button class="btn btn-sm btn-sec" data-tentar="${o.id}">Tentar de novo</button>
      <button class="btn btn-sm btn-perigo" data-descartar="${o.id}">Descartar</button>` : ''}</td></tr>`).join('');
  janela({
    titulo: 'Registros pendentes de sincronização',
    largura: 'larga',
    corpo: `<p>Enquanto houver itens aqui, eles <b>ainda não chegaram ao banco central</b>. O caminhão só é
      considerado liberado depois da sincronização. ${navigator.onLine ? '' : '<b>Você está sem conexão.</b>'}</p>
      ${ops.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Registro</th><th>Feito em</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<p>Nenhum registro pendente. Tudo sincronizado.</p>'}`,
    botoes: [{ texto: 'Fechar', valor: null, classe: 'btn-sec' }],
    aoAbrir: (j) => {
      j.addEventListener('click', async (e) => {
        const t = e.target.dataset.tentar, d = e.target.dataset.descartar;
        if (t) { await fila.tentarNovamente(t); j.querySelector('.fechar').click(); abrirPainelSincronizacao(); }
        if (d && await confirmar('Descartar este registro? Ele NÃO será enviado ao banco.', { perigo: true, textoOk: 'Descartar' })) {
          await fila.descartar(d); j.querySelector('.fechar').click(); abrirPainelSincronizacao();
        }
      });
    },
  });
}

window.addEventListener('online', () => { atualizarIndicador(); fila.processar(); });
window.addEventListener('offline', atualizarIndicador);
setInterval(() => { if (navigator.onLine && estado.usuario) fila.processar(); }, 60000);

// ---------------------------------------------------------------------
// TEMPO REAL
// ---------------------------------------------------------------------
const ouvintes = new Set();
let canal = null;
let timer = null;

/** Páginas registram uma função para recarregar quando a agenda muda. */
export function aoMudarAgenda(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export function limparOuvintes() { ouvintes.clear(); }

function avisarMudanca() {
  clearTimeout(timer);
  timer = setTimeout(() => ouvintes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }), 350);
}

export function iniciarTempoReal() {
  if (canal || !estado.usuario) return;
  canal = sb.channel('caminhao-masters');
  for (const t of ['solicitacoes', 'ocupacoes', 'bloqueios', 'atividades_operacionais']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, avisarMudanca);
  }
  canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${estado.usuario.id}` },
    (p) => novaNotificacao(p.new));
  canal.subscribe((status) => {
    const el = document.getElementById('tempo-real');
    if (el) {
      el.className = 'tempo-real ' + (status === 'SUBSCRIBED' ? 'on' : 'off');
      el.title = status === 'SUBSCRIBED' ? 'Agenda atualizando em tempo real' : 'Tempo real desconectado (tentando reconectar)';
    }
    if (status === 'SUBSCRIBED') avisarMudanca();
  });
}

export async function pararTempoReal() { if (canal) { await sb.removeChannel(canal); canal = null; } }

// ---------------------------------------------------------------------
// NOTIFICAÇÕES
// ---------------------------------------------------------------------
export async function atualizarSino() {
  const el = document.getElementById('sino-contador');
  if (!el || !estado.usuario) return;
  const { count } = await sb.from('notificacoes').select('id', { count: 'exact', head: true }).eq('lida', false);
  el.textContent = count > 99 ? '99+' : String(count || '');
  el.hidden = !count;
  document.title = count ? `(${count}) Caminhão Masters` : 'Caminhão Masters';
}

async function novaNotificacao(n) {
  atualizarSino();
  aviso(n.titulo, 'info', 7000);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && !(await pushAtivo())) {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.showNotification(n.titulo, { body: n.mensagem || '', icon: 'assets/icones/icone-192.png', data: { link: n.link } });
  }
}

// ---------------------------------------------------------------------
// PUSH (celular e computador)
// ---------------------------------------------------------------------
export const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushConfigurado = () => Boolean(CONFIG.VAPID_PUBLIC_KEY);

async function pushAtivo() {
  if (!pushSuportado() || !pushConfigurado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

function base64ParaUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function ativarNotificacoes() {
  if (!('Notification' in window)) throw new Error('Este navegador não oferece notificações. No iPhone, instale o app na tela inicial (iOS 16.4 ou superior).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');
  if (!pushSuportado() || !pushConfigurado()) return 'local';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(CONFIG.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await sb.from('push_inscricoes').upsert(
    { usuario_id: estado.usuario.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: 'endpoint', ignoreDuplicates: true });
  if (error && !/duplicate/i.test(error.message)) throw new Error(msgErro(error));
  return 'push';
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await sb.from('push_inscricoes').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}
