// RELATÓRIOS OPERACIONAIS — uso do caminhão (solicitações, atendimentos, quilometragem,
// abastecimentos em litros, manutenções/serviços e ocorrências). Exportação Excel e PDF.
// Sem nenhum valor financeiro: os controles financeiros ficam no Sienge.
import { sb, q, estado, msgErro, limitesDoPeriodo } from '../api.js';
import { esc, fmtData, fmtDataHora, fmtNum, opcoes, carregando, aviso, baixarArquivo, rotulo } from '../ui.js';
import { criarXLSX } from '../lib/xlsx.js';
import { paraISO, STATUS_SOLICITACAO } from '../lib/regras.js';
import { consolidar } from '../lib/relatorio-operacional.js';

const mesNome = (ym) => new Date(ym + '-15T12:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
const TIPOS_SERVICO = { manutencao_preventiva: 'Manutenção preventiva', manutencao_corretiva: 'Manutenção corretiva', lavagem: 'Lavagem',
  borracharia: 'Borracharia', revisao: 'Revisão', abastecimento: 'Abastecimento', outros: 'Outros serviços' };

export async function render(el) {
  const h = new Date();
  const presets = {
    mes: [paraISO(new Date(h.getFullYear(), h.getMonth(), 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
    mes_ant: [paraISO(new Date(h.getFullYear(), h.getMonth() - 1, 1)), paraISO(new Date(h.getFullYear(), h.getMonth(), 0))],
    tri: [paraISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
    ano: [`${h.getFullYear()}-01-01`, `${h.getFullYear()}-12-31`],
    doze: [paraISO(new Date(h.getFullYear(), h.getMonth() - 11, 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
  };
  const st = { de: presets.mes[0], ate: presets.mes[1], caminhao: estado.caminhaoId || '' };
  el.innerHTML = `<div class="cabecalho"><h1>Relatórios operacionais</h1><div class="acoes"><button class="btn btn-sec" id="xlsx">Exportar Excel</button><button class="btn btn-sec" id="pdf">Exportar PDF</button></div></div>
    <p class="dica nao-imprimir">Utilização do caminhão e rastreabilidade das operações. Controles financeiros ficam no Sienge.</p>
    <div class="filtros nao-imprimir">
      <label class="campo"><span>Período rápido</span><select id="preset">${opcoes([['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['tri', 'Últimos 3 meses'], ['doze', 'Últimos 12 meses'], ['ano', 'Este ano'], ['', 'Personalizado']], 'mes')}</select></label>
      <label class="campo"><span>De</span><input type="date" id="de" value="${st.de}"></label><label class="campo"><span>Até</span><input type="date" id="ate" value="${st.ate}"></label>
      <label class="campo"><span>Caminhão</span><select id="cam">${opcoes(estado.caminhoes.map((c) => [c.id, c.nome]), st.caminhao, 'Todos')}</select></label>
    </div>
    <div class="so-impressao"><h2>Caminhão Masters — Relatório operacional</h2></div>
    <div id="conteudo-rel">${carregando()}</div>`;
  let ult = null;

  async function carregar() {
    const area = el.querySelector('#conteudo-rel');
    area.innerHTML = carregando();
    try {
      const [ini, fim] = limitesDoPeriodo(st.de, st.ate);
      const cam = st.caminhao || null;
      const f = (c) => (cam ? c.eq('caminhao_id', cam) : c);
      const [sols, atds, exps, abs, ativ, ocs] = await Promise.all([
        q(f(sb.from('solicitacoes').select('numero, data, periodo, status, obra_id, obras(nome), categoria_nome').gte('data', st.de).lte('data', st.ate).order('data'))),
        q(f(sb.from('atendimentos').select('inicio_em, fim_em, obra_id, obras(nome), servico, distancia_km, recebedor_nome, perfis(nome_completo)').gte('inicio_em', ini).lte('inicio_em', fim).order('inicio_em'))),
        q(f(sb.from('expedientes').select('inicio_em, fim_em, km_inicial, km_final, perfis(nome_completo)').gte('inicio_em', ini).lte('inicio_em', fim).order('inicio_em'))),
        q(f(sb.from('abastecimentos').select('data_hora, km, litros, posto, perfis(nome_completo)').gte('data_hora', ini).lte('data_hora', fim).order('data_hora'))),
        q(f(sb.from('atividades_operacionais').select('data, periodo, tipo, descricao, empresa, status, km_execucao, observacoes').gte('data', st.de).lte('data', st.ate).order('data'))),
        q(f(sb.from('ocorrencias').select('data_hora, tipo, descricao, status, resolucao, perfis!ocorrencias_motorista_id_fkey(nome_completo)').gte('data_hora', ini).lte('data_hora', fim).order('data_hora'))),
      ]);
      const R = consolidar({ sols, atds, exps, abs, ativ, ocs });
      ult = { R, sols, atds, exps, abs, ativ, ocs };
      const maxAt = Math.max(1, ...R.porMes.map((m) => m.atendimentos));
      area.innerHTML = `
        <p class="muted">Período: <b>${fmtData(st.de)}</b> a <b>${fmtData(st.ate)}</b>.</p>
        <div class="grade grade-4" style="margin-bottom:1rem">
          <div class="indicador"><b>${R.solicitacoes}</b><span>Solicitações (${R.aprovadas} aprovadas/concluídas · ${R.recusadas} recusadas/canceladas)</span></div>
          <div class="indicador"><b>${R.atendimentos}</b><span>Atendimentos realizados</span></div>
          <div class="indicador"><b>${fmtNum(R.kmRodados)}</b><span>KM rodados (expedientes encerrados)</span></div>
          <div class="indicador"><b>${fmtNum(R.litros, 1)} L</b><span>Abastecidos${R.consumo ? ` · consumo médio ${fmtNum(R.consumo, 2)} km/L` : ''}</span></div>
          <div class="indicador"><b>${R.servicosConcluidos}</b><span>Manutenções e serviços realizados${R.programados ? ` · ${R.programados} programado(s)` : ''}</span></div>
          <div class="indicador ${R.ocorrenciasAbertas ? 'alerta' : ''}"><b>${R.ocorrencias}</b><span>Ocorrências registradas (${R.ocorrenciasAbertas} em aberto)</span></div>
        </div>
        <section class="cartao"><h2>Utilização por mês</h2>
          ${R.porMes.length ? `<div class="barras" role="img" aria-label="Atendimentos por mês">${R.porMes.map((m) => `<div class="barra"><em>${m.atendimentos}</em><i style="height:${(m.atendimentos / maxAt) * 85}%"></i><small>${esc(mesNome(m.mes))}</small></div>`).join('')}</div>
          <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Atendimentos</th><th class="num">KM rodados</th><th class="num">Litros</th><th class="num">Serviços</th><th class="num">Ocorrências</th></tr></thead><tbody>
          ${R.porMes.map((m) => `<tr><td>${esc(mesNome(m.mes))}</td><td class="num">${m.atendimentos}</td><td class="num">${fmtNum(m.km)}</td><td class="num">${fmtNum(m.litros, 1)}</td><td class="num">${m.servicos}</td><td class="num">${m.ocorrencias}</td></tr>`).join('')}
          </tbody></table></div>` : '<p>Sem registros operacionais no período.</p>'}</section>
        <div class="grade grade-2">
          <section class="cartao"><h2>Uso do caminhão por obra</h2>
            ${R.porObra.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Obra</th><th class="num">Solicitações</th><th class="num">Aprovadas</th><th class="num">Atendimentos</th><th class="num">KM</th></tr></thead><tbody>
            ${R.porObra.map((o) => `<tr><td>${esc(o.nome)}</td><td class="num">${o.solicitacoes}</td><td class="num">${o.aprovadas}</td><td class="num">${o.atendimentos}</td><td class="num">${fmtNum(o.km)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Sem solicitações no período.</p>'}</section>
          <section class="cartao"><h2>Manutenções e serviços realizados</h2>
            ${Object.keys(R.servicos).length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Tipo</th><th class="num">Realizados</th></tr></thead><tbody>
            ${Object.entries(R.servicos).map(([t, n]) => `<tr><td>${esc(TIPOS_SERVICO[t] || t)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum serviço concluído no período.</p>'}
            ${ativ.filter((x) => x.status === 'concluida').slice(-8).reverse().map((x) => `<p class="dica">• ${fmtData(x.data)} — ${esc(TIPOS_SERVICO[x.tipo] || x.tipo)}: ${esc(x.descricao)}${x.empresa ? ` (${esc(x.empresa)})` : ''}</p>`).join('')}</section>
        </div>`;
    } catch (ex) { area.innerHTML = `<div class="alerta alerta-erro">${esc(msgErro(ex))}</div>`; }
  }

  el.querySelector('#preset').onchange = (e) => { const p = presets[e.target.value]; if (p) { [st.de, st.ate] = p; el.querySelector('#de').value = st.de; el.querySelector('#ate').value = st.ate; carregar(); } };
  el.querySelector('#de').onchange = (e) => { st.de = e.target.value; el.querySelector('#preset').value = ''; carregar(); };
  el.querySelector('#ate').onchange = (e) => { st.ate = e.target.value; el.querySelector('#preset').value = ''; carregar(); };
  el.querySelector('#cam').onchange = (e) => { st.caminhao = e.target.value; carregar(); };
  el.querySelector('#pdf').onclick = () => { aviso('Na janela de impressão, escolha "Salvar como PDF".', 'info'); setTimeout(() => window.print(), 300); };
  el.querySelector('#xlsx').onclick = () => {
    if (!ult) return;
    const { R, sols, atds, abs, ativ, ocs } = ult;
    baixarArquivo(`relatorio-operacional-caminhao-masters-${st.de}-a-${st.ate}.xlsx`, criarXLSX([
      { nome: 'Resumo', larguras: [44, 18], linhas: [['Indicador', 'Quantidade'], ['Período', `${fmtData(st.de)} a ${fmtData(st.ate)}`],
        ['Solicitações', R.solicitacoes], ['Aprovadas/concluídas', R.aprovadas], ['Recusadas/canceladas', R.recusadas], ['Atendimentos realizados', R.atendimentos],
        ['KM rodados', R.kmRodados], ['Litros abastecidos', R.litros], ['Consumo médio (km/L)', R.consumo ?? ''],
        ['Manutenções e serviços realizados', R.servicosConcluidos], ['Ocorrências registradas', R.ocorrencias], ['Ocorrências em aberto', R.ocorrenciasAbertas]] },
      { nome: 'Por mês', larguras: [12, 14, 12, 10, 10, 12], linhas: [['Mês', 'Atendimentos', 'KM rodados', 'Litros', 'Serviços', 'Ocorrências'],
        ...R.porMes.map((m) => [m.mes, m.atendimentos, m.km, m.litros, m.servicos, m.ocorrencias])] },
      { nome: 'Por obra', larguras: [40, 13, 11, 13, 10], linhas: [['Obra', 'Solicitações', 'Aprovadas', 'Atendimentos', 'KM'], ...R.porObra.map((o) => [o.nome, o.solicitacoes, o.aprovadas, o.atendimentos, o.km])] },
      { nome: 'Solicitações', larguras: [8, 11, 8, 36, 26, 22], linhas: [['Nº', 'Data', 'Período', 'Obra', 'Categoria', 'Situação'],
        ...sols.map((s) => [s.numero, fmtData(s.data), s.periodo === 'manha' ? 'Manhã' : 'Tarde', s.obras?.nome, s.categoria_nome, STATUS_SOLICITACAO[s.status]])] },
      { nome: 'Atendimentos', larguras: [17, 17, 24, 34, 30, 10, 22], linhas: [['Início', 'Fim', 'Motorista', 'Obra', 'Serviço', 'Distância km', 'Recebedor'],
        ...atds.map((a) => [fmtDataHora(a.inicio_em), fmtDataHora(a.fim_em), a.perfis?.nome_completo, a.obras?.nome, a.servico, a.distancia_km != null ? Number(a.distancia_km) : '', a.recebedor_nome])] },
      { nome: 'Abastecimentos', larguras: [17, 24, 10, 10, 28], linhas: [['Data', 'Motorista', 'KM', 'Litros', 'Posto'],
        ...abs.map((a) => [fmtDataHora(a.data_hora), a.perfis?.nome_completo, Number(a.km), Number(a.litros), a.posto])] },
      { nome: 'Manutenções e serviços', larguras: [11, 22, 36, 24, 12, 10, 40], linhas: [['Data', 'Tipo', 'Descrição', 'Oficina/prestador', 'Situação', 'KM', 'Observações'],
        ...ativ.map((x) => [fmtData(x.data), TIPOS_SERVICO[x.tipo] || x.tipo, x.descricao, x.empresa, rotulo(x.status), x.km_execucao != null ? Number(x.km_execucao) : '', x.observacoes])] },
      { nome: 'Ocorrências', larguras: [17, 22, 40, 14, 36], linhas: [['Data', 'Tipo', 'Descrição', 'Situação', 'Resolução'],
        ...ocs.map((o) => [fmtDataHora(o.data_hora), rotulo(o.tipo), o.descricao, rotulo(o.status), o.resolucao])] },
    ]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
  await carregar();
}
