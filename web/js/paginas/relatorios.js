// RELATÓRIOS — painel financeiro (custo mensal, por categoria, acumulado, custo/km, comparativos)
// e relatório operacional (uso do caminhão por obra). Exportação Excel e PDF (impressão).
import { sb, q, estado, caminhaoAtual, msgErro } from '../api.js';
import { esc, fmtData, fmtMoeda, fmtNum, opcoes, carregando, aviso, baixarArquivo } from '../ui.js';
import { criarXLSX } from '../lib/xlsx.js';
import { paraISO, STATUS_SOLICITACAO } from '../lib/regras.js';
import { nomeCat } from './despesas.js';

const mesNome = (ym) => new Date(ym + '-15T12:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

export async function render(el) {
  const h = new Date();
  const presets = {
    mes: [paraISO(new Date(h.getFullYear(), h.getMonth(), 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
    mes_ant: [paraISO(new Date(h.getFullYear(), h.getMonth() - 1, 1)), paraISO(new Date(h.getFullYear(), h.getMonth(), 0))],
    tri: [paraISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
    ano: [`${h.getFullYear()}-01-01`, `${h.getFullYear()}-12-31`],
    doze: [paraISO(new Date(h.getFullYear(), h.getMonth() - 11, 1)), paraISO(new Date(h.getFullYear(), h.getMonth() + 1, 0))],
  };
  const st = { de: presets.doze[0], ate: presets.doze[1], caminhao: estado.caminhaoId || '' };
  el.innerHTML = `<div class="cabecalho"><h1>Relatórios</h1><div class="acoes"><button class="btn btn-sec" id="xlsx">Exportar Excel</button><button class="btn btn-sec" id="pdf">Exportar PDF</button></div></div>
    <div class="filtros nao-imprimir">
      <label class="campo"><span>Período rápido</span><select id="preset">${opcoes([['doze', 'Últimos 12 meses'], ['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['tri', 'Últimos 3 meses'], ['ano', 'Este ano'], ['', 'Personalizado']], 'doze')}</select></label>
      <label class="campo"><span>De</span><input type="date" id="de" value="${st.de}"></label><label class="campo"><span>Até</span><input type="date" id="ate" value="${st.ate}"></label>
      <label class="campo"><span>Caminhão</span><select id="cam">${opcoes(estado.caminhoes.map((c) => [c.id, c.nome]), st.caminhao, 'Todos')}</select></label>
    </div>
    <div class="so-impressao"><h2>Caminhão Masters — Relatório</h2></div>
    <div id="conteudo-rel">${carregando()}</div>`;
  let ult = null;

  async function carregar() {
    const area = el.querySelector('#conteudo-rel');
    area.innerHTML = carregando();
    try {
      const dias = Math.round((new Date(st.ate) - new Date(st.de)) / 864e5) + 1;
      const antAte = paraISO(new Date(new Date(st.de + 'T12:00').getTime() - 864e5));
      const antDe = paraISO(new Date(new Date(st.de + 'T12:00').getTime() - dias * 864e5));
      const cam = st.caminhao || null;
      let qs = sb.from('solicitacoes').select('status, obra_id, obras(nome), data').gte('data', st.de).lte('data', st.ate);
      let qd = sb.from('despesas').select('*').eq('status', 'aprovada').gte('data', st.de).lte('data', st.ate).order('data');
      if (cam) { qs = qs.eq('caminhao_id', cam); qd = qd.eq('caminhao_id', cam); }
      const [atual, anterior, sols, desp] = await Promise.all([
        q(sb.rpc('resumo_financeiro', { p_caminhao: cam, p_inicio: st.de, p_fim: st.ate })),
        q(sb.rpc('resumo_financeiro', { p_caminhao: cam, p_inicio: antDe, p_fim: antAte })),
        q(qs), q(qd),
      ]);
      ult = { atual, anterior, sols, desp };
      const varPct = anterior.total > 0 ? ((atual.total - anterior.total) / anterior.total) * 100 : null;
      const max = Math.max(1, ...atual.por_mes.map((m) => Number(m.total)));
      const porObra = {};
      for (const s of sols) {
        const k = s.obras?.nome || '—';
        porObra[k] ??= { total: 0, aprovada: 0, concluida: 0, recusada: 0, cancelada: 0, pendente: 0, esclarecimento: 0 };
        porObra[k].total++; porObra[k][s.status]++;
      }
      area.innerHTML = `
        <p class="muted">Período: <b>${fmtData(st.de)}</b> a <b>${fmtData(st.ate)}</b>. Somente despesas aprovadas.</p>
        <div class="grade grade-4" style="margin-bottom:1rem">
          <div class="indicador"><b>${fmtMoeda(atual.total)}</b><span>Custo no período</span></div>
          <div class="indicador"><b>${atual.custo_por_km != null ? fmtMoeda(atual.custo_por_km) : '—'}</b><span>Custo por km (${fmtNum(atual.km_rodados)} km rodados)</span></div>
          <div class="indicador"><b>${fmtMoeda(atual.acumulado_geral)}</b><span>Acumulado geral</span></div>
          <div class="indicador ${varPct > 0 ? 'alerta' : ''}"><b>${varPct === null ? '—' : (varPct > 0 ? '+' : '') + fmtNum(varPct, 1) + '%'}</b><span>vs. período anterior (${fmtMoeda(anterior.total)})</span></div>
          <div class="indicador ${atual.pendentes > 0 ? 'alerta' : ''}"><b>${fmtMoeda(atual.pendentes)}</b><span>Pendentes de aprovação (fora do total)</span></div>
        </div>
        <section class="cartao"><h2>Custo mensal</h2>
          ${atual.por_mes.length ? `<div class="barras" role="img" aria-label="Gráfico de custo mensal">${atual.por_mes.map((m) => `<div class="barra"><em>${fmtNum(m.total / 1000, 1)}k</em><i style="height:${(Number(m.total) / max) * 85}%"></i><small>${esc(mesNome(m.mes))}</small></div>`).join('')}</div>
          <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Total</th><th class="num">Acumulado</th></tr></thead><tbody>
          ${(() => { let ac = 0; return atual.por_mes.map((m) => { ac += Number(m.total); return `<tr><td>${esc(mesNome(m.mes))}</td><td class="num">${fmtMoeda(m.total)}</td><td class="num">${fmtMoeda(ac)}</td></tr>`; }).join(''); })()}
          </tbody></table></div>` : '<p>Sem despesas aprovadas no período.</p>'}</section>
        <div class="grade grade-2">
          <section class="cartao"><h2>Despesas por categoria</h2>
            ${atual.por_categoria.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Categoria</th><th class="num">Qtd</th><th class="num">Total</th><th class="num">%</th></tr></thead><tbody>
            ${atual.por_categoria.map((c) => `<tr><td>${esc(nomeCat(c.categoria))}</td><td class="num">${c.qtd}</td><td class="num">${fmtMoeda(c.total)}</td><td class="num">${fmtNum((c.total / atual.total) * 100, 1)}%</td></tr>`).join('')}</tbody></table></div>` : '<p>—</p>'}</section>
          <section class="cartao"><h2>Uso do caminhão por obra</h2>
            ${Object.keys(porObra).length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Obra</th><th class="num">Solicitações</th><th class="num">Aprovadas/concluídas</th><th class="num">Recusadas/canceladas</th></tr></thead><tbody>
            ${Object.entries(porObra).sort((a, b) => b[1].total - a[1].total).map(([o, v]) => `<tr><td>${esc(o)}</td><td class="num">${v.total}</td><td class="num">${v.aprovada + v.concluida}</td><td class="num">${v.recusada + v.cancelada}</td></tr>`).join('')}</tbody></table></div>` : '<p>—</p>'}</section>
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
    const { atual, anterior, sols, desp } = ult;
    baixarArquivo(`relatorio-caminhao-masters-${st.de}-a-${st.ate}.xlsx`, criarXLSX([
      { nome: 'Resumo', larguras: [40, 18], linhas: [['Indicador', 'Valor'], ['Período', `${fmtData(st.de)} a ${fmtData(st.ate)}`], ['Custo no período (R$)', Number(atual.total)],
        ['KM rodados', Number(atual.km_rodados)], ['Custo por km (R$)', atual.custo_por_km != null ? Number(atual.custo_por_km) : ''], ['Acumulado geral (R$)', Number(atual.acumulado_geral)],
        ['Período anterior (R$)', Number(anterior.total)], ['Pendentes de aprovação (R$)', Number(atual.pendentes)]] },
      { nome: 'Por mês', larguras: [12, 16], linhas: [['Mês', 'Total (R$)'], ...atual.por_mes.map((m) => [m.mes, Number(m.total)])] },
      { nome: 'Por categoria', larguras: [28, 8, 16], linhas: [['Categoria', 'Qtd', 'Total (R$)'], ...atual.por_categoria.map((c) => [nomeCat(c.categoria), c.qtd, Number(c.total)])] },
      { nome: 'Despesas', larguras: [11, 24, 40, 14, 24], linhas: [['Data', 'Categoria', 'Descrição', 'Valor (R$)', 'Fornecedor'], ...desp.map((d) => [fmtData(d.data), nomeCat(d.categoria), d.descricao, Number(d.valor), d.fornecedor || ''])] },
      { nome: 'Solicitações', larguras: [11, 30, 22], linhas: [['Data', 'Obra', 'Situação'], ...sols.map((s) => [fmtData(s.data), s.obras?.nome, STATUS_SOLICITACAO[s.status]])] },
    ]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };
  await carregar();
}
