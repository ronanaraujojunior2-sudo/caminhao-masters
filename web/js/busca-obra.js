// =====================================================================
// PESQUISA DE OBRAS — melhora qualquer <select> de obra do sistema.
// O <select> original continua no formulário (oculto): leitura do
// formulário, validação, eventos "change" e funcionamento offline seguem iguais.
// A pessoa digita nome, parte do nome, código do Sienge, cliente ou endereço
// e escolhe o resultado com toque, clique ou teclado (↑ ↓ Enter Esc).
// =====================================================================
import { esc } from './ui.js';
import { filtrar, normalizar } from './lib/busca-texto.js';

let seq = 0;
const CAMPOS = ['nome', 'codigo_sienge', 'cliente', 'endereco'];

function realcar(texto, consulta) {
  const t = String(texto ?? '');
  const termo = normalizar(consulta).split(' ').filter(Boolean)[0];
  if (!termo) return esc(t);
  const base = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const i = base.indexOf(termo);
  if (i < 0 || base.length !== t.length) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + termo.length)) + '</mark>' + esc(t.slice(i + termo.length));
}

/**
 * @param {HTMLSelectElement} select  lista original (value = id da obra)
 * @param {Array} obras  [{ id, nome, codigo_sienge?, cliente?, endereco?, ativa? }]
 * @param {{ placeholder?: string }} op
 */
export function ativarBuscaObra(select, obras, op = {}) {
  if (!select || select.dataset.busca) return;
  select.dataset.busca = '1';
  const id = `bo-${++seq}`;
  const obrigatorio = select.required;
  const vazio = [...select.options].find((o) => o.value === '');
  const rotuloVazio = vazio ? vazio.textContent : '';
  const porId = new Map(obras.map((o) => [String(o.id), o]));
  // somente obras que existem como opção no select (respeita filtros, ex.: só ativas)
  const lista = [...select.options].filter((o) => o.value && porId.has(o.value)).map((o) => ({ ...porId.get(o.value), rotulo: o.textContent }));

  const caixa = document.createElement('div');
  caixa.className = 'busca-obra';
  caixa.innerHTML = `<div class="bo-campo"><svg class="bo-lupa" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="text" id="${id}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-l" autocomplete="off"
        spellcheck="false" placeholder="${esc(op.placeholder || 'Digite o nome, código ou endereço da obra')}">
      <button type="button" class="bo-limpar" aria-label="Limpar obra escolhida" hidden>×</button></div>
    <ul class="bo-lista" id="${id}-l" role="listbox" hidden></ul>
    <div class="bo-escolhida" aria-live="polite"></div>`;
  select.insertAdjacentElement('afterend', caixa);
  select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  select.required = false;                        // a validação passa para o campo visível
  const entrada = caixa.querySelector('input'), ul = caixa.querySelector('ul'), limpar = caixa.querySelector('.bo-limpar');
  const detalhe = caixa.querySelector('.bo-escolhida');
  // o rótulo do formulário passa a apontar para o campo de pesquisa
  const rotulo = select.closest('label');
  if (rotulo) { rotulo.htmlFor = id; }
  entrada.required = obrigatorio;

  let resultados = [], ativo = -1;

  function mostrarEscolhida() {
    const o = porId.get(select.value);
    entrada.value = o ? o.nome : '';
    limpar.hidden = !select.value;
    detalhe.innerHTML = o ? [o.codigo_sienge && `Código ${esc(o.codigo_sienge)}`, o.cliente && esc(o.cliente), o.endereco && esc(o.endereco)].filter(Boolean).join(' · ') : '';
    validar();
  }
  function validar() {
    entrada.setCustomValidity(obrigatorio && !select.value ? (entrada.value ? 'Escolha uma obra da lista de resultados.' : 'Selecione a obra.') : '');
  }
  function abrir() {
    resultados = filtrar(lista, entrada.value === (porId.get(select.value)?.nome ?? null) ? '' : entrada.value, CAMPOS);
    ativo = resultados.length ? 0 : -1;
    ul.innerHTML = resultados.length
      ? resultados.map((o, i) => `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${String(o.id) === select.value}"${i === ativo ? ' class="ativo"' : ''}>
          <b>${realcar(o.nome, entrada.value)}</b>${o.ativa === false ? ' <small>(inativa)</small>' : ''}
          <small>${[o.codigo_sienge && `Código ${esc(o.codigo_sienge)}`, o.cliente && esc(o.cliente), o.endereco && esc(o.endereco)].filter(Boolean).join(' · ')}</small></li>`).join('')
        + (lista.length > resultados.length && !entrada.value ? `<li class="bo-mais" aria-disabled="true">Digite para encontrar entre ${lista.length} obras…</li>` : '')
      : `<li class="bo-nada" aria-disabled="true">Nenhuma obra encontrada${lista.length ? '' : ' (nenhuma obra disponível)'}.</li>`;
    ul.hidden = false; entrada.setAttribute('aria-expanded', 'true');
    marcar();
  }
  function fechar() { ul.hidden = true; entrada.setAttribute('aria-expanded', 'false'); entrada.removeAttribute('aria-activedescendant'); }
  function marcar() {
    ul.querySelectorAll('[data-i]').forEach((li) => li.classList.toggle('ativo', Number(li.dataset.i) === ativo));
    if (ativo >= 0) { entrada.setAttribute('aria-activedescendant', `${id}-o${ativo}`); ul.querySelector(`#${id}-o${ativo}`)?.scrollIntoView({ block: 'nearest' }); }
  }
  function escolher(o) {
    select.value = o ? String(o.id) : '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    mostrarEscolhida(); fechar();
  }

  // abre ao tocar/clicar ou digitar (não ao receber foco automático de uma janela)
  entrada.addEventListener('click', () => { if (ul.hidden) { entrada.select(); abrir(); } });
  entrada.addEventListener('input', () => {
    if (select.value && entrada.value !== porId.get(select.value)?.nome) { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); limpar.hidden = true; detalhe.textContent = ''; }
    validar(); abrir();
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (ul.hidden) abrir(); else { ativo = Math.min(ativo + 1, resultados.length - 1); marcar(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter') { if (!ul.hidden && ativo >= 0 && resultados[ativo]) { e.preventDefault(); e.stopPropagation(); escolher(resultados[ativo]); } }
    else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); e.stopPropagation(); fechar(); mostrarEscolhida(); } }
    else if (e.key === 'Tab') { if (!ul.hidden && entrada.value && !select.value && resultados.length === 1) escolher(resultados[0]); fechar(); }
  });
  // pointerdown escolhe antes de o campo perder o foco (funciona no toque e no mouse)
  ul.addEventListener('pointerdown', (e) => { const li = e.target.closest('[data-i]'); if (!li) return; e.preventDefault(); escolher(resultados[Number(li.dataset.i)]); });
  entrada.addEventListener('blur', () => setTimeout(() => { if (!caixa.contains(document.activeElement)) { fechar(); if (!select.value) { if (!obrigatorio) entrada.value = ''; } else mostrarEscolhida(); } }, 120));
  limpar.addEventListener('click', () => { escolher(null); entrada.focus(); });
  if (!obrigatorio && rotuloVazio) entrada.placeholder = `${rotuloVazio} — digite para pesquisar`;
  select.addEventListener('busca:atualizar', mostrarEscolhida);
  mostrarEscolhida();
  return { entrada, escolher: (idObra) => escolher(porId.get(String(idObra)) || null) };
}
