// OCORRÊNCIAS — acompanhamento e resolução pelo administrador
import { sb, q, msgErro } from '../api.js';
import { esc, fmtDataHora, rotulo, opcoes, vazio, carregando, janela, aviso } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { fotosHTML } from './diario.js';

export async function render(el) {
  let filtro = 'abertas';
  el.innerHTML = `<div class="cabecalho"><h1>Ocorrências</h1></div>
    <div class="abas">${[['abertas', 'Em aberto'], ['resolvida', 'Resolvidas'], ['todas', 'Todas']].map(([k, t]) => `<button data-f="${k}" class="${k === filtro ? 'ativa' : ''}">${t}</button>`).join('')}</div>
    <div id="lista">${carregando()}</div>`;
  let dados = [];
  let pagina = 0;
  async function carregar(manter) {
    if (!manter) pagina = 0;
    let c = sb.from('ocorrencias').select('*, motorista:perfis!ocorrencias_motorista_id_fkey(nome_completo), resolvedor:perfis!ocorrencias_resolvido_por_fkey(nome_completo)').order('data_hora', { ascending: false }).limit(300);
    if (filtro === 'abertas') c = c.neq('status', 'resolvida'); else if (filtro !== 'todas') c = c.eq('status', filtro);
    dados = await q(c);
    let pg;
    el.querySelector('#lista').innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Motorista</th><th>Situação</th></tr></thead><tbody>
      ${(pg = paginar(dados, pagina)).itens.map((o, j, _, i = pg.desloc + j) => `<tr class="clicavel" data-i="${i}" tabindex="0"><td data-r="Data">${fmtDataHora(o.data_hora)}</td><td data-r="Tipo">${rotulo(o.tipo)}</td><td data-r="Descrição">${esc(o.descricao)}</td>
      <td data-r="Motorista">${esc(o.motorista?.nome_completo)}</td><td data-r="Situação"><span class="badge ${o.status === 'resolvida' ? 'badge-ok' : 'badge-aviso'}">${rotulo(o.status)}</span></td></tr>`).join('')}</tbody></table></div>${paginacaoHTML(pg)}` : vazio('Nenhuma ocorrência.');
  }
  el.addEventListener('click', async (e) => {
    const pb = e.target.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    const f = e.target.closest('[data-f]');
    if (f) { filtro = f.dataset.f; el.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('ativa', b === f)); return carregar(); }
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const o = dados[tr.dataset.i];
    const r = await janela({
      titulo: `Ocorrência — ${rotulo(o.tipo)}`, largura: 'larga',
      corpo: `<dl class="detalhes"><div><dt>Data</dt><dd>${fmtDataHora(o.data_hora)}</dd></div><div><dt>Local</dt><dd>${esc(o.local || '—')}</dd></div>
        <div><dt>Motorista</dt><dd>${esc(o.motorista?.nome_completo)}</dd></div><div><dt>Descrição</dt><dd>${esc(o.descricao)}</dd></div>
        ${o.resolvido_em ? `<div><dt>Resolvida</dt><dd>${fmtDataHora(o.resolvido_em)} por ${esc(o.resolvedor?.nome_completo)}</dd></div>` : ''}</dl>
        ${await fotosHTML('ocorrencia', o.id)}
        <form style="margin-top:1rem"><label class="campo"><span>Situação</span><select name="status">${opcoes([['aberta', 'Aberta'], ['em_tratamento', 'Em tratamento'], ['resolvida', 'Resolvida']], o.status)}</select></label>
        <label class="campo"><span>Acompanhamento / resolução</span><textarea name="resolucao" rows="3">${esc(o.resolucao || '')}</textarea></label></form>`,
      botoes: [{ texto: 'Fechar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar acompanhamento', valor: 'ok' }],
      validar: (d) => (d.status === 'resolvida' && !d.resolucao ? 'Descreva a resolução.' : null),
    });
    if (!r) return;
    try { await q(sb.from('ocorrencias').update({ status: r.dados.status, resolucao: r.dados.resolucao || null }).eq('id', o.id)); aviso('Ocorrência atualizada. O motorista foi notificado.'); carregar(); }
    catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  await carregar();
}
