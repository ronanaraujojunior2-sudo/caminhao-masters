// DESPESAS — aprovação das emergenciais do motorista e lançamentos administrativos
import { sb, q, estado, caminhaoAtual, msgErro } from '../api.js';
import { esc, fmtData, fmtMoeda, opcoes, vazio, carregando, janela, aviso, pedirTexto, camposHTML, numero, rotulo, baixarArquivo, ocupado } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { criarXLSX } from '../lib/xlsx.js';
import { paraISO } from '../lib/regras.js';
import { fotosHTML } from './diario.js';

export const CATEGORIAS = [['abastecimento', 'Abastecimento'], ['manutencao_preventiva', 'Manutenção preventiva'], ['manutencao_corretiva', 'Manutenção corretiva'],
  ['lavagem', 'Lavagem'], ['borracharia', 'Borracharia'], ['revisao', 'Revisão'], ['pneus', 'Pneus'], ['multas', 'Multas'],
  ['emergencial', 'Despesa emergencial'], ['recorrente', 'Despesa recorrente'], ['outros', 'Outros custos']];
export const nomeCat = (c) => CATEGORIAS.find((x) => x[0] === c)?.[1] || c;

export async function render(el) {
  const cam = caminhaoAtual();
  const h = new Date();
  const st = { status: 'pendente', categoria: '', de: paraISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), ate: paraISO(h) };
  el.innerHTML = `<div class="cabecalho"><h1>Despesas</h1><div class="acoes"><button class="btn btn-pri" id="nova">+ Lançar despesa</button><button class="btn btn-sec" id="exportar">Exportar Excel</button></div></div>
    <div class="alerta alerta-info">Somente despesas <b>aprovadas</b> compõem o total oficial e os relatórios financeiros.</div>
    <div class="abas">${[['pendente', 'Aguardando aprovação'], ['aprovada', 'Aprovadas'], ['recusada', 'Recusadas'], ['', 'Todas']].map(([k, t]) => `<button data-st="${k}" class="${k === st.status ? 'ativa' : ''}">${t}</button>`).join('')}</div>
    <div class="filtros"><label class="campo"><span>Categoria</span><select id="cat">${opcoes(CATEGORIAS, '', 'Todas')}</select></label>
      <label class="campo"><span>De</span><input type="date" id="de" value="${st.de}"></label><label class="campo"><span>Até</span><input type="date" id="ate" value="${st.ate}"></label></div>
    <div id="lista">${carregando()}</div>`;
  let dados = [];
  let pagina = 0;
  async function carregar(manter) {
    if (!manter) pagina = 0;
    let c = sb.from('despesas').select('*, lancador:perfis!despesas_lancado_por_fkey(nome_completo), aprovador:perfis!despesas_aprovado_por_fkey(nome_completo)')
      .order('data', { ascending: false }).limit(1000);
    if (cam) c = c.eq('caminhao_id', cam.id);
    if (st.status) c = c.eq('status', st.status);
    if (st.categoria) c = c.eq('categoria', st.categoria);
    if (st.status !== 'pendente') c = c.gte('data', st.de).lte('data', st.ate);
    dados = await q(c);
    const total = dados.reduce((s, d) => s + Number(d.valor), 0);
    let pg;
    el.querySelector('#lista').innerHTML = dados.length ? `<p><b>${dados.length}</b> despesa(s) · Total: <b>${fmtMoeda(total)}</b></p>
      <div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th>Lançada por</th><th>Situação</th><th></th></tr></thead><tbody>
      ${(pg = paginar(dados, pagina)).itens.map((d, j, _, i = pg.desloc + j) => `<tr><td data-r="Data">${fmtData(d.data)}</td><td data-r="Categoria">${esc(nomeCat(d.categoria))}</td>
        <td data-r="Descrição">${esc(d.descricao)}${d.fornecedor ? `<br><small>${esc(d.fornecedor)}</small>` : ''}</td><td data-r="Valor" class="num">${fmtMoeda(d.valor)}</td>
        <td data-r="Lançada por">${esc(d.lancador?.nome_completo || '—')}<br><small>${rotulo(d.origem)}</small></td>
        <td data-r="Situação"><span class="badge ${d.status === 'aprovada' ? 'badge-ok' : d.status === 'pendente' ? 'badge-aviso' : 'badge-erro'}">${rotulo(d.status)}</span>${d.motivo_recusa ? `<br><small>${esc(d.motivo_recusa)}</small>` : ''}</td>
        <td><button class="btn btn-sm btn-sec" data-ver="${i}">Ver</button>
        ${d.status === 'pendente' ? `<button class="btn btn-sm btn-pri" data-aprovar="${d.id}">Aprovar</button> <button class="btn btn-sm btn-perigo" data-recusar="${d.id}">Recusar</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${paginacaoHTML(pg)}` : vazio('Nenhuma despesa encontrada.');
  }
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const pb = t.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    const s = t.closest('[data-st]');
    if (s) { st.status = s.dataset.st; el.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('ativa', b === s)); return carregar(); }
    try {
      if (t.dataset.aprovar) await ocupado(t, async () => { await q(sb.from('despesas').update({ status: 'aprovada' }).eq('id', t.dataset.aprovar)); aviso('Despesa aprovada.'); await carregar(); });
      if (t.dataset.recusar) {
        const m = await pedirTexto({ titulo: 'Recusar despesa', rotulo: 'Motivo da recusa', textoOk: 'Recusar', perigo: true });
        if (m) { await q(sb.from('despesas').update({ status: 'recusada', motivo_recusa: m }).eq('id', t.dataset.recusar)); aviso('Despesa recusada.'); carregar(); }
      }
      if (t.dataset.ver) {
        const d = dados[t.dataset.ver];
        const fotos = await fotosHTML(d.origem === 'abastecimento' ? 'abastecimento' : 'despesa', d.origem === 'abastecimento' ? d.origem_id : d.id);
        janela({ titulo: 'Despesa', corpo: `<dl class="detalhes"><div><dt>Data</dt><dd>${fmtData(d.data)}</dd></div><div><dt>Categoria</dt><dd>${esc(nomeCat(d.categoria))}</dd></div>
          <div><dt>Descrição</dt><dd>${esc(d.descricao)}</dd></div><div><dt>Valor</dt><dd>${fmtMoeda(d.valor)}</dd></div><div><dt>KM</dt><dd>${esc(d.km ?? '—')}</dd></div>
          <div><dt>Fornecedor</dt><dd>${esc(d.fornecedor || '—')}</dd></div><div><dt>Lançada por</dt><dd>${esc(d.lancador?.nome_completo || '—')}</dd></div>
          ${d.aprovador ? `<div><dt>Decisão</dt><dd>${esc(d.aprovador.nome_completo)}</dd></div>` : ''}</dl><h3>Comprovante</h3>${fotos || '<p>—</p>'}` });
      }
      if (t.id === 'nova') {
        if (!cam) return aviso('Cadastre um caminhão primeiro.', 'erro');
        const r = await janela({
          titulo: 'Lançar despesa',
          corpo: `<form>${camposHTML([
            { n: 'categoria', t: 'Categoria', tipo: 'select', obr: true, opcoes: CATEGORIAS, vazio: 'Selecione' },
            { n: 'descricao', t: 'Descrição', obr: true, ajuda: 'Ex.: Multa por estacionamento, troca de 2 pneus, IPVA...' },
            { n: 'valor', t: 'Valor (R$)', tipo: 'number', obr: true }, { n: 'data', t: 'Data', tipo: 'date', obr: true, padrao: paraISO(new Date()) },
            { n: 'km', t: 'KM', tipo: 'number' }, { n: 'fornecedor', t: 'Fornecedor' },
            { n: 'comprovante', t: 'Comprovante (foto ou PDF)', tipo: 'file', accept: 'image/*,application/pdf' },
          ])}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Lançar (aprovada)', valor: 'ok' }],
          validar: (d) => (!(numero(d.valor) >= 0) ? 'Valor inválido.' : null),
        });
        if (!r) return;
        const d = r.dados;
        const nova = await q(sb.from('despesas').insert({ caminhao_id: cam.id, categoria: d.categoria, descricao: d.descricao, valor: numero(d.valor), data: d.data,
          km: numero(d.km), fornecedor: d.fornecedor || null, status: 'aprovada', origem: 'admin' }).select().single());
        const arq = d.comprovante?.[0];
        if (arq) {
          const caminho = `${estado.usuario.id}/despesa/${nova.id}/${Date.now()}-${arq.name.replace(/[^\w.-]/g, '_')}`;
          const bucket = arq.type === 'application/pdf' ? 'documentos' : 'fotos';
          const up = await sb.storage.from(bucket).upload(bucket === 'documentos' ? `${cam.id}/despesas/${nova.id}-${arq.name.replace(/[^\w.-]/g, '_')}` : caminho, arq, { contentType: arq.type });
          if (up.error) throw up.error;
          await q(sb.from('anexos').insert({ entidade: 'despesa', entidade_id: nova.id, bucket, caminho: up.data.path, nome_arquivo: arq.name, mime: arq.type, enviado_por: estado.usuario.id }));
        }
        aviso('Despesa lançada.'); carregar();
      }
      if (t.id === 'exportar') {
        const linhas = [['Data', 'Categoria', 'Descrição', 'Valor', 'KM', 'Fornecedor', 'Situação', 'Origem', 'Lançada por', 'Aprovada/recusada por', 'Motivo recusa'],
          ...dados.map((d) => [fmtData(d.data), nomeCat(d.categoria), d.descricao, Number(d.valor), d.km ? Number(d.km) : '', d.fornecedor, d.status, d.origem,
            d.lancador?.nome_completo, d.aprovador?.nome_completo, d.motivo_recusa])];
        baixarArquivo(`despesas-${paraISO(new Date())}.xlsx`, criarXLSX([{ nome: 'Despesas', linhas, larguras: [11, 22, 40, 12, 9, 22, 11, 13, 22, 22, 30] }]),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }
    } catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  el.querySelector('#cat').onchange = (e) => { st.categoria = e.target.value; carregar(); };
  el.querySelector('#de').onchange = (e) => { st.de = e.target.value; carregar(); };
  el.querySelector('#ate').onchange = (e) => { st.ate = e.target.value; carregar(); };
  await carregar();
}
