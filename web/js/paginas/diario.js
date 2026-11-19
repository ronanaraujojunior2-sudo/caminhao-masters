// DIÁRIO DE BORDO — consulta cronológica (motorista: os próprios; admin: todos) e exportação
import { sb, estado, q, ehAdmin, urlArquivo } from '../api.js';
import { esc, fmtData, fmtDataHora, fmtNum, fmtMoeda, opcoes, carregando, vazio, janela, baixarArquivo, rotulo } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { criarXLSX } from '../lib/xlsx.js';
import { RESULTADOS } from '../lib/checklists.js';
import { paraISO } from '../lib/regras.js';
import { expedienteAberto, iniciarExpediente, encerrarExpediente, registrarAtendimento, registrarAbastecimento,
  registrarOcorrencia, registrarDespesa } from './diario-forms.js';

export async function fotosHTML(entidade, ids) {
  const lista = Array.isArray(ids) ? ids : [ids];
  if (!lista.length) return '';
  const anexos = await q(sb.from('anexos').select('*').eq('entidade', entidade).in('entidade_id', lista)).catch(() => []);
  if (!anexos.length) return '';
  const urls = await Promise.all(anexos.map((a) => urlArquivo(a.bucket, a.caminho).catch(() => null)));
  return `<div class="fotos">${anexos.map((a, i) => urls[i] ? (a.mime?.startsWith('image/')
    ? `<a href="${esc(urls[i])}" target="_blank" rel="noopener"><img src="${esc(urls[i])}" alt="Foto ${i + 1}" loading="lazy"></a>`
    : `<a class="btn btn-sm btn-sec" href="${esc(urls[i])}" target="_blank" rel="noopener">Abrir ${esc(a.nome_arquivo || 'arquivo')}</a>`) : '').join('')}</div>`;
}

const ABAS = {
  expedientes: { t: 'Expedientes', tabela: 'expedientes', data: 'inicio_em' },
  atendimentos: { t: 'Atendimentos', tabela: 'atendimentos', data: 'inicio_em' },
  checklists: { t: 'Checklists', tabela: 'checklists', data: 'registrado_em' },
  abastecimentos: { t: 'Abastecimentos', tabela: 'abastecimentos', data: 'data_hora' },
  ocorrencias: { t: 'Ocorrências', tabela: 'ocorrencias', data: 'data_hora' },
};

export async function render(el) {
  const admin = ehAdmin();
  const hoje = new Date();
  const st = { aba: 'expedientes', de: paraISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 30)), ate: paraISO(hoje), motorista: '' };
  const [motoristas, obras] = await Promise.all([
    admin ? q(sb.from('perfis').select('id, nome_completo').in('perfil', ['motorista', 'admin']).order('nome_completo')) : [],
    q(sb.from('obras').select('id, nome').order('nome')),
  ]);
  const nomeObra = (id) => obras.find((o) => o.id === id)?.nome || '—';
  let dados = [];
  let pagina = 0;

  el.innerHTML = `
    <div class="cabecalho"><h1>Diário de Bordo</h1><div class="acoes">
      ${estado.perfil.perfil === 'motorista' || admin ? `<button class="btn btn-sec" data-novo="ocorrencia">+ Ocorrência</button>
        <button class="btn btn-sec" data-novo="abastecimento">+ Abastecimento</button>` : ''}
      ${estado.perfil.perfil === 'motorista' ? `<button class="btn btn-sec" data-novo="despesa">+ Despesa emergencial</button>
        <button class="btn btn-pri" data-novo="atendimento">+ Atendimento</button>
        <button class="btn btn-dest" data-novo="expediente">${expedienteAberto() ? 'Encerrar expediente' : 'Iniciar expediente'}</button>` : ''}
      <button class="btn btn-sec" id="exportar">Exportar Excel</button></div></div>
    <div class="abas">${Object.entries(ABAS).map(([k, v]) => `<button data-aba="${k}" class="${k === st.aba ? 'ativa' : ''}">${v.t}</button>`).join('')}</div>
    <div class="filtros">
      <label class="campo"><span>De</span><input type="date" id="de" value="${st.de}"></label>
      <label class="campo"><span>Até</span><input type="date" id="ate" value="${st.ate}"></label>
      ${admin ? `<label class="campo"><span>Motorista</span><select id="mot">${opcoes(motoristas.map((m) => [m.id, m.nome_completo]), '', 'Todos')}</select></label>` : ''}
    </div>
    <div id="lista">${carregando()}</div>`;

  async function carregar(manter) {
    if (!manter) pagina = 0;
    const a = ABAS[st.aba];
    const perfil = `perfis!${a.tabela}_motorista_id_fkey(nome_completo)`;
    let c = sb.from(a.tabela).select(st.aba === 'atendimentos' ? `*, ${perfil}, atendimento_materiais(*)` : `*, ${perfil}`)
      .gte(a.data, st.de + 'T00:00:00').lte(a.data, st.ate + 'T23:59:59').order(a.data, { ascending: false }).limit(500);
    if (st.motorista) c = c.eq('motorista_id', st.motorista);
    try { dados = await q(c); } catch (e) { el.querySelector('#lista').innerHTML = `<div class="alerta alerta-erro">${esc(e.message)}</div>`; return; }
    el.querySelector('#lista').innerHTML = dados.length ? tabela() : vazio('Nenhum registro no período.');
  }

  const colunas = {
    expedientes: [['Início', (x) => fmtDataHora(x.inicio_em)], ['Fim', (x) => x.fim_em ? fmtDataHora(x.fim_em) : '<span class="badge badge-aviso">Aberto</span>'],
      ['Motorista', (x) => esc(x.perfis?.nome_completo)], ['KM inicial', (x) => fmtNum(x.km_inicial)], ['KM final', (x) => fmtNum(x.km_final)],
      ['Rodado', (x) => (x.km_final ? fmtNum(x.km_final - x.km_inicial) + ' km' : '—')],
      ['Local final', (x) => esc(x.local_estacionamento === 'obra' ? nomeObra(x.local_obra_id) : x.local_estacionamento === 'outro' ? x.local_outro : x.local_estacionamento ? 'Estacionamento Masters' : '—')]],
    atendimentos: [['Início', (x) => fmtDataHora(x.inicio_em)], ['Fim', (x) => fmtDataHora(x.fim_em)], ['Obra', (x) => esc(nomeObra(x.obra_id))],
      ['Serviço', (x) => esc(x.servico)], ['Distância', (x) => (x.distancia_km !== null ? fmtNum(x.distancia_km) + ' km' : '—')],
      ['Materiais', (x) => `${x.atendimento_materiais?.length || 0}${x.atendimento_materiais?.some((m) => Number(m.divergencia)) ? ' <span class="badge badge-erro">divergência</span>' : ''}`],
      ['Recebimento', (x) => (x.recebimento_confirmado ? 'Confirmado' : '—')]],
    checklists: [['Data', (x) => fmtDataHora(x.registrado_em)], ['Tipo', (x) => rotulo(x.tipo)], ['Motorista', (x) => esc(x.perfis?.nome_completo)],
      ['Resultado', (x) => x.tem_critico ? '<span class="badge badge-erro">Irregularidade CRÍTICA</span>' : x.tem_irregularidade ? '<span class="badge badge-aviso">Com irregularidade</span>' : '<span class="badge badge-ok">Conforme</span>']],
    abastecimentos: [['Data', (x) => fmtDataHora(x.data_hora)], ['KM', (x) => fmtNum(x.km)], ['Litros', (x) => fmtNum(x.litros, 2)],
      ['Valor', (x) => fmtMoeda(x.valor)], ['R$/L', (x) => fmtMoeda(x.valor / x.litros)], ['Posto', (x) => esc(x.posto || '—')]],
    ocorrencias: [['Data', (x) => fmtDataHora(x.data_hora)], ['Tipo', (x) => rotulo(x.tipo)], ['Descrição', (x) => esc(x.descricao)],
      ['Situação', (x) => `<span class="badge ${x.status === 'resolvida' ? 'badge-ok' : 'badge-aviso'}">${rotulo(x.status)}</span>`]],
  };

  function tabela() {
    const cols = colunas[st.aba];
    const pg = paginar(dados, pagina);
    return `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr>${cols.map(([t]) => `<th>${t}</th>`).join('')}</tr></thead>
      <tbody>${pg.itens.map((x, j) => `<tr class="clicavel" data-i="${pg.desloc + j}" tabindex="0">${cols.map(([t, f]) => `<td data-r="${t}">${f(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${paginacaoHTML(pg)}`;
  }

  async function detalhe(x) {
    let corpo = '';
    if (st.aba === 'expedientes') {
      const [chks, atds, abs, ocs] = await Promise.all([
        q(sb.from('checklists').select('*').eq('expediente_id', x.id).order('registrado_em')),
        q(sb.from('atendimentos').select('*').eq('expediente_id', x.id).order('inicio_em')),
        q(sb.from('abastecimentos').select('*').eq('expediente_id', x.id)),
        q(sb.from('ocorrencias').select('*').eq('expediente_id', x.id)),
      ]);
      corpo = `<dl class="detalhes">
        <div><dt>Motorista</dt><dd>${esc(x.perfis?.nome_completo)}</dd></div>
        <div><dt>Início / KM</dt><dd>${fmtDataHora(x.inicio_em)} · ${fmtNum(x.km_inicial)} km</dd></div>
        <div><dt>Fim / KM</dt><dd>${fmtDataHora(x.fim_em)} · ${fmtNum(x.km_final)} km</dd></div>
        <div><dt>Condições gerais</dt><dd>${esc(x.condicoes_gerais || '—')}</dd></div>
        <div><dt>Observações</dt><dd>${esc(x.observacoes || '—')}</dd></div>
        <div><dt>Registro</dt><dd>${x.registrado_offline ? 'Feito sem conexão e sincronizado em ' + fmtDataHora(x.sincronizado_em) : 'Online'}</dd></div></dl>
        <h3>Checklists</h3>${chks.map(checklistHTML).join('') || '<p>—</p>'}
        <h3>Atendimentos</h3>${atds.map((a) => `<p>• ${fmtDataHora(a.inicio_em)} — ${esc(nomeObra(a.obra_id))}: ${esc(a.servico)}</p>`).join('') || '<p>—</p>'}
        <h3>Abastecimentos</h3>${abs.map((a) => `<p>• ${fmtDataHora(a.data_hora)} — ${fmtNum(a.litros, 2)} L · ${fmtMoeda(a.valor)}</p>`).join('') || '<p>—</p>'}
        <h3>Ocorrências</h3>${ocs.map((o) => `<p>• ${rotulo(o.tipo)}: ${esc(o.descricao)}</p>`).join('') || '<p>—</p>'}
        <h3>Fotos</h3>${(await fotosHTML('expediente', x.id)) + (await fotosHTML('checklist', chks.map((c) => c.id))) || '<p>—</p>'}`;
    } else if (st.aba === 'atendimentos') {
      corpo = `<dl class="detalhes">
        <div><dt>Obra</dt><dd>${esc(nomeObra(x.obra_id))}</dd></div><div><dt>Serviço</dt><dd>${esc(x.servico)}</dd></div>
        <div><dt>Horário</dt><dd>${fmtDataHora(x.inicio_em)} → ${fmtDataHora(x.fim_em)}</dd></div>
        <div><dt>KM</dt><dd>${fmtNum(x.km_inicial)} → ${fmtNum(x.km_final)} (${x.distancia_km !== null ? fmtNum(x.distancia_km) + ' km' : '—'})</dd></div>
        <div><dt>Recebedor</dt><dd>${esc(x.recebedor_nome || '—')} ${x.recebedor_cargo ? '· ' + esc(x.recebedor_cargo) : ''}</dd></div>
        <div><dt>Recebimento</dt><dd>${x.recebimento_confirmado ? 'Confirmado' : 'Não confirmado'}</dd></div>
        <div><dt>Observações</dt><dd>${esc(x.observacoes || '—')}</dd></div></dl>
        <h3>Materiais</h3>${x.atendimento_materiais?.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Material</th><th>Un.</th><th class="num">Previsto</th><th class="num">Entregue</th><th class="num">Diferença</th><th>Obs.</th></tr></thead><tbody>
          ${x.atendimento_materiais.map((m) => `<tr><td>${esc(m.material)}</td><td>${esc(m.unidade)}</td><td class="num">${fmtNum(m.qtd_prevista, 3)}</td><td class="num">${fmtNum(m.qtd_entregue, 3)}</td>
          <td class="num ${Number(m.divergencia) ? 'txt-erro' : ''}">${fmtNum(m.divergencia, 3)}</td><td>${esc(m.obs_divergencia || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p>—</p>'}
        <h3>Fotos</h3>${await fotosHTML('atendimento', x.id) || '<p>—</p>'}`;
    } else if (st.aba === 'checklists') {
      corpo = checklistHTML(x) + (await fotosHTML('checklist', x.id));
    } else if (st.aba === 'abastecimentos') {
      corpo = `<dl class="detalhes"><div><dt>Data</dt><dd>${fmtDataHora(x.data_hora)}</dd></div><div><dt>KM</dt><dd>${fmtNum(x.km)}</dd></div>
        <div><dt>Litros</dt><dd>${fmtNum(x.litros, 3)}</dd></div><div><dt>Valor</dt><dd>${fmtMoeda(x.valor)}</dd></div>
        <div><dt>Posto</dt><dd>${esc(x.posto || '—')}</dd></div></dl><h3>Comprovante</h3>${await fotosHTML('abastecimento', x.id) || '<p>—</p>'}`;
    } else {
      corpo = `<dl class="detalhes"><div><dt>Tipo</dt><dd>${rotulo(x.tipo)}</dd></div><div><dt>Data</dt><dd>${fmtDataHora(x.data_hora)}</dd></div>
        <div><dt>Local</dt><dd>${esc(x.local || '—')}</dd></div><div><dt>Descrição</dt><dd>${esc(x.descricao)}</dd></div>
        <div><dt>Situação</dt><dd>${rotulo(x.status)}</dd></div><div><dt>Resolução</dt><dd>${esc(x.resolucao || '—')}</dd></div></dl>
        ${await fotosHTML('ocorrencia', x.id)}`;
    }
    janela({ titulo: ABAS[st.aba].t.replace(/s$/, ''), corpo, largura: 'larga' });
  }

  function checklistHTML(c) {
    return `<div class="cartao"><b>${rotulo(c.tipo)}</b> · ${fmtDataHora(c.registrado_em)}
      <ul>${(c.itens || []).map((i) => `<li class="${i.resultado === 'irregular' ? 'txt-erro' : ''}">${esc(i.item)}: <b>${esc(RESULTADOS[i.resultado] || i.resultado)}</b>${i.critico ? ' (CRÍTICO)' : ''}${i.obs ? ' — ' + esc(i.obs) : ''}</li>`).join('')}</ul>
      ${c.observacoes ? `<p>${esc(c.observacoes)}</p>` : ''}</div>`;
  }

  function exportar() {
    const cols = {
      expedientes: [['Início', (x) => fmtDataHora(x.inicio_em)], ['Fim', (x) => fmtDataHora(x.fim_em)], ['Motorista', (x) => x.perfis?.nome_completo],
        ['KM inicial', (x) => Number(x.km_inicial)], ['KM final', (x) => (x.km_final ? Number(x.km_final) : '')], ['KM rodado', (x) => (x.km_final ? x.km_final - x.km_inicial : '')],
        ['Condições', (x) => x.condicoes_gerais], ['Observações', (x) => x.observacoes]],
      atendimentos: [['Início', (x) => fmtDataHora(x.inicio_em)], ['Fim', (x) => fmtDataHora(x.fim_em)], ['Motorista', (x) => x.perfis?.nome_completo], ['Obra', (x) => nomeObra(x.obra_id)],
        ['Serviço', (x) => x.servico], ['Distância km', (x) => (x.distancia_km !== null ? Number(x.distancia_km) : '')],
        ['Materiais', (x) => (x.atendimento_materiais || []).map((m) => `${m.material}: ${m.qtd_entregue ?? '?'}/${m.qtd_prevista ?? '?'} ${m.unidade}`).join('; ')],
        ['Recebedor', (x) => x.recebedor_nome], ['Recebimento confirmado', (x) => Boolean(x.recebimento_confirmado)], ['Observações', (x) => x.observacoes]],
      checklists: [['Data', (x) => fmtDataHora(x.registrado_em)], ['Tipo', (x) => x.tipo], ['Motorista', (x) => x.perfis?.nome_completo],
        ['Irregularidades', (x) => (x.itens || []).filter((i) => i.resultado === 'irregular').map((i) => i.item + (i.obs ? ` (${i.obs})` : '')).join('; ')], ['Crítico', (x) => Boolean(x.tem_critico)]],
      abastecimentos: [['Data', (x) => fmtDataHora(x.data_hora)], ['Motorista', (x) => x.perfis?.nome_completo], ['KM', (x) => Number(x.km)], ['Litros', (x) => Number(x.litros)],
        ['Valor', (x) => Number(x.valor)], ['Posto', (x) => x.posto]],
      ocorrencias: [['Data', (x) => fmtDataHora(x.data_hora)], ['Motorista', (x) => x.perfis?.nome_completo], ['Tipo', (x) => x.tipo], ['Descrição', (x) => x.descricao],
        ['Local', (x) => x.local], ['Situação', (x) => x.status], ['Resolução', (x) => x.resolucao]],
    }[st.aba];
    const linhas = [cols.map((c) => c[0]), ...dados.map((x) => cols.map((c) => c[1](x) ?? ''))];
    baixarArquivo(`diario-${st.aba}-${st.de}-a-${st.ate}.xlsx`, criarXLSX([{ nome: ABAS[st.aba].t, linhas, larguras: cols.map(() => 20) }]),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-aba]');
    if (a) { st.aba = a.dataset.aba; el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b === a)); carregar(); return; }
    const pb = e.target.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); carregar(true); return; }
    const tr = e.target.closest('tr[data-i]');
    if (tr) detalhe(dados[tr.dataset.i]);
    if (e.target.id === 'exportar') exportar();
    const n = e.target.closest('[data-novo]')?.dataset.novo;
    const depois = () => { setTimeout(carregar, 900); };
    if (n === 'ocorrencia') registrarOcorrencia(depois);
    if (n === 'abastecimento') registrarAbastecimento(depois);
    if (n === 'despesa') registrarDespesa(depois);
    if (n === 'atendimento') registrarAtendimento({ obras: obras.filter((o) => o), aoConcluir: depois });
    if (n === 'expediente') (expedienteAberto() ? encerrarExpediente(() => location.reload(), obras) : iniciarExpediente(() => location.reload()));
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-i]')) e.target.click(); });
  el.querySelector('#de').onchange = (e) => { st.de = e.target.value; carregar(); };
  el.querySelector('#ate').onchange = (e) => { st.ate = e.target.value; carregar(); };
  el.querySelector('#mot')?.addEventListener('change', (e) => { st.motorista = e.target.value; carregar(); });
  await carregar();
}
