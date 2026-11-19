// NOTIFICAÇÕES INTERNAS (sino, contador e histórico)
import { sb, q } from '../api.js';
import { esc, fmtDataHora, vazio, carregando, aviso } from '../ui.js';
import { atualizarSino } from '../sync.js';

export async function render(el) {
  el.innerHTML = `<div class="cabecalho"><h1>Notificações</h1><div class="acoes"><button class="btn btn-sec" id="todas">Marcar todas como lidas</button>
    <a class="btn btn-sec" href="#/conta">Ativar no celular/computador</a></div></div><div id="lista">${carregando()}</div>`;
  async function carregar() {
    const dados = await q(sb.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(200));
    el.querySelector('#lista').innerHTML = dados.length ? dados.map((n) => `<div class="cartao" style="${n.lida ? '' : 'border-left:6px solid var(--verm)'}">
      <b>${esc(n.titulo)}</b> ${n.lida ? '' : '<span class="badge badge-erro">Nova</span>'}<br>${esc(n.mensagem || '')}<br>
      <small class="muted">${fmtDataHora(n.criado_em)}</small>
      <div class="barra-acoes" style="margin:.5rem 0 0">${n.link ? `<a class="btn btn-sm btn-pri" href="${esc(n.link)}" data-ler="${n.id}">Abrir</a>` : ''}
      ${n.lida ? '' : `<button class="btn btn-sm btn-sec" data-ler="${n.id}">Marcar como lida</button>`}</div></div>`).join('') : vazio('Nenhuma notificação.');
  }
  el.addEventListener('click', async (e) => {
    const id = e.target.dataset.ler;
    if (id) { await sb.rpc('marcar_notificacoes_lidas', { p_ids: [Number(id)] }); atualizarSino(); if (e.target.tagName === 'BUTTON') carregar(); }
    if (e.target.id === 'todas') { await sb.rpc('marcar_notificacoes_lidas', { p_ids: null }); atualizarSino(); aviso('Todas marcadas como lidas.'); carregar(); }
  });
  await carregar();
}
