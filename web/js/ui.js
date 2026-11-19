// Componentes de interface reutilizáveis: avisos, janelas, formulários, formatação.
import { PERIODOS, STATUS_SOLICITACAO, SITUACOES, PRIORIDADES } from './lib/regras.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---------- formatação ----------
export const fmtData = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtDataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtHora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtNum = (v, casas = 1) => (v === null || v === undefined || v === '' ? '—'
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }));
export const fmtPeriodo = (p) => (p === 'dia' ? 'Dia inteiro' : PERIODOS[p] ? `${PERIODOS[p].rotulo} (${PERIODOS[p].horario})` : p);
export const nomeDia = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
export const nomeDiaCurto = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
export const nomeMes = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
export const telLink = (t) => (t ? `<a href="tel:${esc(String(t).replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '—');
export const mapaLink = (end) => (end ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}" target="_blank" rel="noopener">${esc(end)} ↗</a>` : '—');
export const rotulo = (txt) => esc(String(txt || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

export function badgeStatus(s) { return `<span class="badge st-${esc(s)}">${esc(STATUS_SOLICITACAO[s] || s)}</span>`; }
export function badgeSituacao(s) { const x = SITUACOES[s] || { rotulo: s, classe: '' }; return `<span class="badge ${x.classe}">${esc(x.rotulo)}</span>`; }
export function badgePrioridade(p) { return p && p !== 'normal' ? `<span class="badge pr-${esc(p)}">Prioridade ${esc(PRIORIDADES[p] || p)}</span>` : ''; }

// ---------- avisos (toasts) ----------
export function aviso(msg, tipo = 'sucesso', ms = 5000) {
  const area = $('#avisos');
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(msg)}</span><button type="button" aria-label="Fechar">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  area.appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? ms * 2 : ms);
}

// ---------- janela (modal) ----------
/**
 * Abre uma janela. `corpo` é HTML. `botoes`: [{ texto, valor, classe }].
 * Se houver <form> no corpo, o botão com valor 'ok' envia o formulário e
 * `validar(form)` pode retornar mensagem de erro para impedir o fechamento.
 * Resolve com { valor, dados } (dados = campos do formulário) ou null se cancelado.
 */
export function janela({ titulo, corpo, botoes = [{ texto: 'Fechar', valor: null, classe: 'btn-sec' }], largura = '', validar, aoAbrir }) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div');
    fundo.className = 'janela-fundo';
    fundo.innerHTML = `
      <div class="janela ${largura}" role="dialog" aria-modal="true" aria-labelledby="janela-titulo">
        <header><h2 id="janela-titulo">${esc(titulo)}</h2><button type="button" class="fechar" aria-label="Fechar">×</button></header>
        <div class="janela-corpo">${corpo}</div>
        <div class="janela-erro" role="alert" hidden></div>
        <footer>${botoes.map((b, i) => `<button type="button" data-i="${i}" class="btn ${b.classe || 'btn-pri'}">${esc(b.texto)}</button>`).join('')}</footer>
      </div>`;
    document.body.appendChild(fundo);
    document.body.classList.add('sem-rolagem');
    ativarOlhos(fundo);
    const fechar = (v) => { fundo.remove(); document.body.classList.remove('sem-rolagem'); resolve(v); };
    fundo.querySelector('.fechar').onclick = () => fechar(null);
    fundo.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(null); });
    const form = fundo.querySelector('form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); fundo.querySelector('[data-i].btn-pri, [data-i].btn-perigo')?.click(); });
    fundo.querySelectorAll('footer button').forEach((btn) => {
      btn.onclick = async () => {
        const b = botoes[btn.dataset.i];
        if (b.valor === null || b.valor === undefined) return fechar(null);
        let dados = null;
        if (form) {
          const caixaErro = fundo.querySelector('.janela-erro');
          const mostrarErro = (m) => { caixaErro.textContent = m; caixaErro.hidden = false; caixaErro.scrollIntoView({ block: 'nearest' }); };
          if (!form.checkValidity()) { form.reportValidity(); mostrarErro('Preencha os campos obrigatórios (marcados com *).'); return; }
          dados = lerForm(form);
          const erro = validar ? await validar(dados, form) : null;
          if (erro) { mostrarErro(erro); return; }
        }
        fechar({ valor: b.valor, dados });
      };
    });
    setTimeout(() => (fundo.querySelector('input:not([type=hidden]):not([disabled]), select, textarea') || fundo.querySelector('footer .btn'))?.focus(), 30);
    aoAbrir?.(fundo);
  });
}

export async function confirmar(mensagem, { titulo = 'Confirmar', textoOk = 'Confirmar', perigo = false } = {}) {
  const r = await janela({
    titulo, corpo: `<p>${esc(mensagem)}</p>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: textoOk, valor: 'ok', classe: perigo ? 'btn-perigo' : 'btn-pri' }],
  });
  return r?.valor === 'ok';
}

/** Pede um texto (motivo, justificativa...). Retorna string ou null. */
export async function pedirTexto({ titulo, rotulo: lbl, ajuda = '', obrigatorio = true, textoOk = 'Confirmar', perigo = false, minimo = 3 }) {
  const r = await janela({
    titulo,
    corpo: `<form><label class="campo"><span>${esc(lbl)}${obrigatorio ? ' <b class="obr">*</b>' : ''}</span>
      <textarea name="texto" rows="4" ${obrigatorio ? `required minlength="${minimo}"` : ''}></textarea>
      ${ajuda ? `<small>${esc(ajuda)}</small>` : ''}</label></form>`,
    botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: textoOk, valor: 'ok', classe: perigo ? 'btn-perigo' : 'btn-pri' }],
    validar: (d) => (obrigatorio && (d.texto || '').trim().length < minimo ? `Preencha com pelo menos ${minimo} caracteres.` : null),
  });
  return r ? r.dados.texto.trim() : null;
}

// ---------- formulários ----------
export function lerForm(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) dados[el.name] = el.value; }
    else if (el.type === 'file') dados[el.name] = [...el.files];
    else dados[el.name] = el.value.trim?.() ?? el.value;
  }
  return dados;
}

export const opcoes = (lista, valor, vazio) =>
  (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') +
  lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(valor ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');

/** Campo de senha com botão de olho (mostrar/ocultar sem perder o que foi digitado). */
export function campoSenha(name, lbl, { auto = 'current-password', obrigatorio = true, ajuda = '' } = {}) {
  return `<label class="campo"><span>${esc(lbl)}${obrigatorio ? ' <b class="obr">*</b>' : ''}</span>
    <div class="senha-caixa"><input type="password" name="${esc(name)}" autocomplete="${auto}" ${obrigatorio ? 'required' : ''} maxlength="72">
    <button type="button" class="olho" aria-label="Mostrar senha" aria-pressed="false">${ICONES.olho}</button></div>
    ${ajuda ? `<small>${esc(ajuda)}</small>` : ''}</label>`;
}

export function ativarOlhos(raiz = document) {
  raiz.querySelectorAll('.senha-caixa .olho:not([data-ok])').forEach((b) => {
    b.dataset.ok = '1';
    b.addEventListener('click', () => {
      const inp = b.previousElementSibling;
      const mostrar = inp.type === 'password';
      const pos = [inp.selectionStart, inp.selectionEnd];
      inp.type = mostrar ? 'text' : 'password';
      b.innerHTML = mostrar ? ICONES.olhoFechado : ICONES.olho;
      b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      b.setAttribute('aria-pressed', String(mostrar));
      inp.focus();
      try { inp.setSelectionRange(pos[0], pos[1]); } catch { /* */ }
    });
  });
}

/** Desativa um botão enquanto a ação roda (evita clique duplo). */
export async function ocupado(botao, fn) {
  if (botao?.disabled) return;
  const original = botao?.innerHTML;
  if (botao) { botao.disabled = true; botao.innerHTML = '<span class="giro"></span> Aguarde…'; }
  try { return await fn(); } finally { if (botao) { botao.disabled = false; botao.innerHTML = original; } }
}

const MINI_MUNCK = `<svg class="mini-munck" viewBox="0 0 46 28" aria-hidden="true"><path d="M2 21h26v-4H2z" fill="currentColor" opacity=".55"/><path d="M29 21V11h7l5 5v5z" fill="currentColor"/>
  <path d="M20 17V12" stroke="currentColor" stroke-width="2"/><path d="M20 12L6 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <g class="mm-gancho"><path d="M6 4v7" stroke="currentColor" stroke-width="1.2"/><path d="M6 11v2a2 2 0 0 1-3 1.5" fill="none" stroke="#FC0A0B" stroke-width="1.6" stroke-linecap="round"/></g>
  <circle cx="8" cy="23" r="3" fill="currentColor"/><circle cx="34" cy="23" r="3" fill="currentColor"/></svg>`;
export const carregando = (txt = 'Carregando…') => `<div class="carregando" role="status">${MINI_MUNCK} ${esc(txt)}</div>`;
export const vazio = (txt) => `<div class="vazio">${esc(txt)}</div>`;

export function baixarArquivo(nome, bytes, tipo = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function debounce(fn, ms = 400) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Reduz fotos antes de enviar (economiza dados móveis e armazenamento). */
export async function comprimirImagem(arquivo, maxLado = 1600, qualidade = 0.8) {
  if (!arquivo.type.startsWith('image/') || /hei[cf]/i.test(arquivo.type)) return arquivo;
  try {
    const bmp = await createImageBitmap(arquivo);
    const esc2 = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * esc2), height: Math.round(bmp.height * esc2) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', qualidade));
    return blob ? new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : arquivo;
  } catch { return arquivo; }
}

export const ICONES = {
  olho: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>',
  olhoFechado: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M2.3 3.7 3.7 2.3l18 18-1.4 1.4-3.2-3.2A12 12 0 0 1 12 19c-5 0-9.3-3.1-11-7a12.6 12.6 0 0 1 4.1-5.1L2.3 3.7Zm5.3 5.3A4.5 4.5 0 0 0 15 14.4l-1.5-1.5A2.5 2.5 0 0 1 11.1 10.5L7.6 9ZM12 5c5 0 9.3 3.1 11 7a12.4 12.4 0 0 1-3.3 4.4l-3.2-3.2A4.5 4.5 0 0 0 10.8 7.6L8.6 5.4C9.7 5.1 10.8 5 12 5Z"/></svg>',
  sino: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/></svg>',
};

/**
 * Gera campos de formulário a partir de uma especificação.
 * campos: [{ n: 'nome', t: 'Rótulo', tipo: 'text|textarea|select|date|number|tel|checkbox|file|datetime-local', obr, opcoes: [[v, t]], ajuda, max, attrs }]
 */
export function camposHTML(campos, v = {}) {
  return campos.map((c) => {
    if (c.html) return c.html;
    const val = v[c.n] ?? c.padrao ?? '';
    const req = c.obr ? 'required' : '';
    const rot = `<span>${esc(c.t)}${c.obr ? ' <b class="obr">*</b>' : ''}</span>`;
    const ajuda = c.ajuda ? `<small>${esc(c.ajuda)}</small>` : '';
    const attrs = c.attrs || '';
    if (c.tipo === 'checkbox') return `<label class="check"><input type="checkbox" name="${c.n}" ${val ? 'checked' : ''} ${attrs}> ${esc(c.t)}</label>`;
    if (c.tipo === 'textarea') return `<label class="campo">${rot}<textarea name="${c.n}" rows="${c.linhas || 3}" ${req} maxlength="${c.max || 2000}" ${attrs}>${esc(val)}</textarea>${ajuda}</label>`;
    if (c.tipo === 'select') return `<label class="campo">${rot}<select name="${c.n}" ${req} ${attrs}>${opcoes(c.opcoes, val, c.vazio)}</select>${ajuda}</label>`;
    if (c.tipo === 'file') return `<label class="campo">${rot}<input type="file" name="${c.n}" ${req} accept="${c.accept || ''}" ${attrs}>${ajuda}</label>`;
    const tipo = c.tipo === 'number' ? 'text" inputmode="decimal' : (c.tipo || 'text');
    return `<label class="campo">${rot}<input type="${tipo}" name="${c.n}" value="${esc(val)}" ${req} maxlength="${c.max || 200}" ${attrs}>${ajuda}</label>`;
  }).join('');
}

/** Converte "1.234,56" ou "1234.56" em número (ou null). */
export function numero(v) {
  if (v === '' || v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ---------- paginação (padrão das tabelas da plataforma Masters) ----------
export const POR_PAGINA = 25;
/** Recorta a lista para a página pedida. Retorna { itens, pagina, paginas, total, inicio, fim, desloc }. */
export function paginar(lista, pagina = 0, por = POR_PAGINA) {
  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / por));
  const p = Math.min(Math.max(0, Number(pagina) || 0), paginas - 1);
  return { itens: lista.slice(p * por, (p + 1) * por), pagina: p, paginas, total, desloc: p * por,
    inicio: total ? p * por + 1 : 0, fim: Math.min(total, (p + 1) * por) };
}
/** Controles "‹ Anterior · Página X de Y · Próxima ›". Os botões usam data-pagina com o número da página. */
export function paginacaoHTML(pg) {
  if (!pg.total) return '';
  if (pg.paginas <= 1) return `<p class="pag-info">${pg.total} registro(s)</p>`;
  return `<nav class="paginacao" aria-label="Paginação"><span>${pg.inicio}–${pg.fim} de ${pg.total}</span>
    <button type="button" class="mini" data-pagina="${pg.pagina - 1}" ${pg.pagina ? '' : 'disabled'}>‹ Anterior</button>
    <span>Página ${pg.pagina + 1} de ${pg.paginas}</span>
    <button type="button" class="mini" data-pagina="${pg.pagina + 1}" ${pg.pagina + 1 < pg.paginas ? '' : 'disabled'}>Próxima ›</button></nav>`;
}
