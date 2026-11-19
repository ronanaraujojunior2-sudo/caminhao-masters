// CADASTRO DE OBRAS
import { sb, q, msgErro } from '../api.js';
import { esc, vazio, carregando, janela, aviso, camposHTML, confirmar, telLink } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { abrirImportacao } from './obras-importar.js';

export async function render(el) {
  let mostrarInativas = false, busca = '', soPendentes = false;
  el.innerHTML = `<div class="cabecalho"><h1>Obras</h1><div class="acoes"><button class="btn btn-sec" id="importar">Importar Obras do Sienge</button><button class="btn btn-pri" id="nova">+ Nova obra</button></div></div>
    <div id="importacao"></div>
    <div class="filtros"><label class="campo"><span>Buscar</span><input id="busca" placeholder="Nome, código do Sienge, cliente, responsável..."></label>
    <label class="check"><input type="checkbox" id="inativas"> Mostrar inativas</label>
    <label class="check"><input type="checkbox" id="pendentes"> Só com responsável pendente</label></div><div id="lista">${carregando()}</div>`;
  let dados = [];
  let pagina = 0;
  async function carregar(manter) {
    if (!manter) pagina = 0;
    let c = sb.from('obras').select('*').order('nome');
    if (!mostrarInativas) c = c.eq('ativa', true);
    dados = await q(c);
    let pg;
    const f = dados.filter((o) => (!soPendentes || !o.responsavel_nome)
      && `${o.nome} ${o.codigo_sienge || ''} ${o.cliente || ''} ${o.responsavel_nome || ''} ${o.endereco || ''}`.toLowerCase().includes(busca.toLowerCase()));
    el.querySelector('#lista').innerHTML = f.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Obra</th><th>Endereço</th><th>Responsável principal</th><th>Contatos</th><th>Situação</th><th></th></tr></thead><tbody>
      ${(pg = paginar(f, pagina)).itens.map((o) => `<tr><td data-r="Obra">${o.codigo_sienge ? `<span class="obra-cod" title="Código no Sienge">${esc(o.codigo_sienge)}</span>` : ''}<b>${esc(o.nome)}</b>${o.cliente ? `<br><small>${esc(o.cliente)}</small>` : ''}${o.situacao_sienge ? `<br><small>Sienge: ${esc(o.situacao_sienge)}</small>` : ''}</td><td data-r="Endereço">${esc(o.endereco || '—')}</td>
      <td data-r="Responsável">${o.responsavel_nome ? `${esc(o.responsavel_nome)}<br>${telLink(o.responsavel_telefone)}` : '<span class="badge badge-aviso">Responsável pendente</span>'}</td>
      <td data-r="Contatos">${[o.contato1_nome && `${esc(o.contato1_nome)} ${telLink(o.contato1_telefone)}`, o.contato2_nome && `${esc(o.contato2_nome)} ${telLink(o.contato2_telefone)}`].filter(Boolean).join('<br>') || '—'}</td>
      <td data-r="Situação"><span class="badge ${o.ativa ? 'badge-ok' : 'st-concluida'}">${o.ativa ? 'Ativa' : 'Inativa'}</span></td>
      <td><button class="btn btn-sm btn-sec" data-editar="${o.id}">Editar</button> <button class="btn btn-sm btn-sec" data-alternar="${o.id}">${o.ativa ? 'Inativar' : 'Reativar'}</button></td></tr>`).join('')}
      </tbody></table></div>${paginacaoHTML(pg)}` : vazio('Nenhuma obra cadastrada.');
  }
  async function form(o = { ativa: true }) {
    const r = await janela({
      titulo: o.id ? 'Editar obra' : 'Nova obra', largura: 'larga',
      corpo: `${o.codigo_sienge ? `<p class="dica">Código no Sienge: <b>${esc(o.codigo_sienge)}</b>${o.cliente ? ` · Cliente: ${esc(o.cliente)}` : ''} (vêm da importação e não são editados aqui).</p>` : ''}<form><div class="linha-campos">${camposHTML([{ n: 'nome', t: 'Nome da obra', obr: true, max: 120 }, { n: 'endereco', t: 'Endereço completo', max: 300 }], o)}</div>
        <fieldset class="cartao"><legend><b>Responsável principal (único)</b></legend><div class="linha-campos">${camposHTML([{ n: 'responsavel_nome', t: 'Nome', obr: true }, { n: 'responsavel_telefone', t: 'Telefone', tipo: 'tel' }], o)}</div></fieldset>
        <fieldset class="cartao"><legend><b>Contatos adicionais (até dois)</b></legend><div class="linha-campos">${camposHTML([
          { n: 'contato1_nome', t: 'Contato 1 — nome' }, { n: 'contato1_telefone', t: 'Contato 1 — telefone', tipo: 'tel' },
          { n: 'contato2_nome', t: 'Contato 2 — nome' }, { n: 'contato2_telefone', t: 'Contato 2 — telefone', tipo: 'tel' }], o)}</div></fieldset>
        ${camposHTML([{ n: 'ativa', t: 'Obra ativa (pode receber solicitações)', tipo: 'checkbox' }], o)}</form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
      validar: (d) => ((d.contato1_telefone && !d.contato1_nome) || (d.contato2_telefone && !d.contato2_nome) ? 'Informe o nome dos contatos adicionais.' : null),
    });
    if (!r) return;
    const d = r.dados;
    for (const k of Object.keys(d)) if (d[k] === '') d[k] = null;
    try {
      await q(o.id ? sb.from('obras').update(d).eq('id', o.id) : sb.from('obras').insert(d));
      aviso('Obra salva.'); carregar();
    } catch (ex) { aviso(/duplicate|já existe/i.test(ex.message) ? 'Já existe uma obra com este nome.' : msgErro(ex), 'erro'); }
  }
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const pb = t.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    if (t.id === 'nova') form();
    if (t.id === 'importar') abrirImportacao(el.querySelector('#importacao'), () => carregar());
    if (t.dataset.editar) form(dados.find((o) => o.id === t.dataset.editar));
    if (t.dataset.alternar) {
      const o = dados.find((x) => x.id === t.dataset.alternar);
      if (o.ativa && !(await confirmar(`Inativar "${o.nome}"? Ela não receberá novas solicitações, mas o histórico é mantido.`, { textoOk: 'Inativar' }))) return;
      try { await q(sb.from('obras').update({ ativa: !o.ativa }).eq('id', o.id)); aviso(o.ativa ? 'Obra inativada.' : 'Obra reativada.'); carregar(); } catch (ex) { aviso(msgErro(ex), 'erro'); }
    }
  });
  el.querySelector('#inativas').onchange = (e) => { mostrarInativas = e.target.checked; carregar(); };
  el.querySelector('#pendentes').onchange = (e) => { soPendentes = e.target.checked; carregar(); };
  el.querySelector('#busca').oninput = (e) => { busca = e.target.value; carregar(); };
  await carregar();
}
