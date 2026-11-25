// PAINEL GERAL DO ADMINISTRADOR — padrão de painel da plataforma Masters.
// Somente dados reais do banco. Cada indicador, alerta e linha abre a tela correspondente.
import { sb, q, caminhaoAtual, offsetFuso, estado, msgErro } from '../api.js';
import { esc, fmtData, fmtDataHora, fmtNum, badgeSituacao, badgePrioridade, rotulo } from '../ui.js';
import * as R from '../lib/regras.js';
import { aoMudarAgenda } from '../sync.js';

const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const IC = {
  clip: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 12h6M9 16h4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  check: 'M20 6 9 17l-5-5',
  cal: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  alert: 'M12 3 2 20h20zM12 9v5M12 17h.01',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
};
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function kpi({ href, rotulo: lb, ic, valor, meta, vermelho, fonte }) {
  return `<a class="pn-kpi" href="${href}"><span class="pn-kl"><span>${esc(lb)}</span><span class="pn-ic${vermelho ? ' red' : ''}">${svg(IC[ic])}</span></span>
    <span class="pn-v${vermelho ? ' red' : ''}">${valor}</span><span class="pn-m${vermelho ? ' red' : ''}">${esc(meta)}</span><span class="pn-src">Fonte: ${esc(fonte)}</span></a>`;
}
const alerta = ({ href, titulo, sub, n, ic, vermelho }) => `<a class="pn-al" href="${href}"><span class="pn-ic${vermelho ? ' red' : ''}">${svg(IC[ic])}</span>
  <span class="pn-at"><b>${esc(titulo)}</b><small>${esc(sub)}</small></span><span class="pn-n${vermelho ? ' red' : ''}">${n}</span>${CHEV}</a>`;

export async function render(el) {
  const cam = caminhaoAtual();
  sb.rpc('gerar_alertas').then(() => {}, () => {}); // gera alertas de documentos/manutenção (sem repetir)
  let atualizadoEm = null;

  async function desenhar(manual) {
    const off = offsetFuso();
    const hoje = R.hojeNoFuso(Date.now(), off);
    const dias = R.diasUteisDaSemana(R.ehDiaUtil(hoje) ? hoje : R.proximoDiaUtil(hoje));
    let dados;
    try {
      dados = await Promise.all([
        cam ? q(sb.from('vw_agenda').select('*').eq('caminhao_id', cam.id).gte('data', dias[0]).lte('data', dias[4])) : [],
        q(sb.from('solicitacoes').select('id, numero, data, periodo, prioridade, categoria_nome, obras(nome), perfis!solicitacoes_solicitante_id_fkey(nome_completo)').eq('status', 'pendente').order('data').limit(20)),
        q(sb.from('solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'esclarecimento')),
        q(sb.from('solicitacoes').select('id, numero, data, periodo, obras(nome)').eq('status', 'aprovada').eq('execucao', 'finalizada').order('data')),
        q(sb.from('ocorrencias').select('id, tipo, descricao, data_hora').neq('status', 'resolvida').order('data_hora', { ascending: false }).limit(10)),
        q(sb.from('checklists').select('id, tipo, registrado_em').eq('tem_critico', true).gte('registrado_em', new Date(Date.now() - 7 * 864e5).toISOString())),
        cam ? q(sb.from('atividades_operacionais').select('id, tipo, data, periodo, descricao').eq('caminhao_id', cam.id).eq('status', 'programada').gte('data', hoje).order('data').limit(20)) : [],
        q(sb.from('vw_planos_manutencao').select('id, descricao, situacao, proxima_data, proximo_km').eq('ativo', true).in('situacao', ['vencida', 'proxima'])),
        q(sb.from('documentos').select('id, descricao, validade').eq('ativo', true).lte('validade', R.somarDias(hoje, estado.config?.alerta_documento_dias || 30)).order('validade')),
      ]);
    } catch (e) {
      el.innerHTML = `<div class="alerta alerta-erro">Não foi possível carregar o painel: ${esc(msgErro(e))}</div>`;
      return;
    }
    const [agenda, pend, escl, final, ocs, chk, manut, planos, docs] = dados;
    atualizadoEm = new Date();
    const g = R.montarGrade(dias, agenda);
    const livres = dias.reduce((n, d) => n + ['manha', 'tarde'].filter((p) => !g[d][p] && R.inicioPeriodoMs(d, p, off) > Date.now()).length, 0);
    const ocupados = dias.reduce((n, d) => n + ['manha', 'tarde'].filter((p) => g[d][p]).length, 0);
    const manut30 = manut.filter((m) => m.data <= R.somarDias(hoje, 30));
    const vencidas = planos.filter((p) => p.situacao === 'vencida').length;
    const docsVencidos = docs.filter((d) => d.validade < hoje).length;

    const alertas = [];
    if (chk.length) alertas.push({ href: '#/diario', titulo: 'Irregularidade crítica em checklist', sub: 'Últimos 7 dias — verificar antes de liberar o caminhão', n: chk.length, ic: 'alert', vermelho: true });
    if (pend.length) alertas.push({ href: '#/solicitacoes?aba=analise', titulo: 'Solicitações aguardando aprovação', sub: 'O período fica reservado até a decisão', n: pend.length, ic: 'clip', vermelho: pend.some((s) => s.data <= R.somarDias(hoje, 1)) });
    if (final.length) alertas.push({ href: '#/solicitacoes?aba=aprovada', titulo: 'Atendimentos finalizados para validar', sub: 'Concluir libera o período na agenda', n: final.length, ic: 'check' });
    if (escl) alertas.push({ href: '#/solicitacoes?aba=esclarecimento', titulo: 'Aguardando resposta do solicitante', sub: 'Esclarecimentos pedidos', n: escl, ic: 'chat' });
    if (ocs.length) alertas.push({ href: '#/ocorrencias', titulo: 'Ocorrências em aberto', sub: 'Registradas pelo motorista', n: ocs.length, ic: 'alert', vermelho: true });
    if (planos.length) alertas.push({ href: '#/manutencoes', titulo: vencidas ? 'Manutenção preventiva vencida' : 'Manutenção preventiva próxima', sub: planos.map((p) => p.descricao).join(', '), n: planos.length, ic: 'wrench', vermelho: vencidas > 0 });
    if (docs.length) alertas.push({ href: '#/documentos', titulo: docsVencidos ? 'Documento vencido' : 'Documento a vencer', sub: docs.map((d) => `${d.descricao} (${fmtData(d.validade)})`).join(', '), n: docs.length, ic: 'doc', vermelho: docsVencidos > 0 });

    el.innerHTML = `<div class="pn">
      <section class="pn-hero">
        <div class="pn-top"><div>
          <p class="pn-kick">Caminhão Masters · Painel</p>
          <h1>Painel geral</h1>
          <p>${cam ? `${esc(cam.nome)} · ${esc(cam.placa)} · ${fmtNum(cam.km_atual)} km` : 'Nenhum caminhão ativo cadastrado'}</p></div>
          <div class="pn-tools">
            <button type="button" id="pn-atualizar">Atualizar</button>
            <a href="#/bloqueios">Bloquear período</a>
            <a class="pn-cta" href="#/solicitar">+ Solicitar caminhão</a>
          </div></div>
        <div class="pn-stat"><span class="pn-live ${document.getElementById('tempo-real')?.classList.contains('on') ? 'on' : ''}">Agenda em tempo real</span>
          <span>Semana de ${fmtData(dias[0])} a ${fmtData(dias[4])}</span><span>Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      </section>
      ${cam ? '' : '<div class="alerta alerta-aviso">Cadastre o caminhão em <a href="#/caminhoes">Cadastros › Caminhões</a> para começar a usar a agenda.</div>'}
      <div class="pn-kpis">
        ${kpi({ href: '#/solicitacoes?aba=analise', rotulo: 'Aguardando aprovação', ic: 'clip', valor: pend.length, meta: pend.length ? 'Analisar e decidir' : 'Nenhuma pendência', vermelho: pend.length > 0, fonte: 'solicitações' })}
        ${kpi({ href: '#/agenda', rotulo: 'Períodos livres na semana', ic: 'cal', valor: livres, meta: `${ocupados} de 10 períodos ocupados`, fonte: 'agenda do caminhão' })}
        ${kpi({ href: '#/solicitacoes?aba=aprovada', rotulo: 'Finalizados para validar', ic: 'check', valor: final.length, meta: 'Concluir libera o período', vermelho: final.length > 0, fonte: 'Diário de Bordo' })}
        ${kpi({ href: '#/ocorrencias', rotulo: 'Ocorrências em aberto', ic: 'alert', valor: ocs.length, meta: ocs.length ? 'Acompanhar resolução' : 'Nenhuma em aberto', vermelho: ocs.length > 0, fonte: 'ocorrências' })}
        ${kpi({ href: '#/manutencoes', rotulo: 'Manutenções programadas', ic: 'wrench', valor: manut30.length, meta: manut30.length ? `Próxima: ${fmtData(manut30[0].data)} — ${manut30[0].descricao}` : 'Nada programado em 30 dias', fonte: 'manutenções e serviços' })}
      </div>
      <div class="pn-row">
        <section class="pn-card pn-big"><div class="pn-ch"><h2>Agenda da semana</h2><a href="#/agenda">Abrir agenda completa ›</a></div>
          <div class="pn-tb"><table class="tabela"><thead><tr><th>Período</th>${dias.map((d) => `<th>${esc(new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</th>`).join('')}</tr></thead>
          <tbody>${['manha', 'tarde'].map((p) => `<tr><td><b>${R.PERIODOS[p].rotulo}</b><br><small>${R.PERIODOS[p].horario}</small></td>${dias.map((d) => {
            const it = g[d][p];
            return `<td>${it ? `${badgeSituacao(it.situacao)}<br><b>${esc(it.obra_nome || it.categoria)}</b><br><small>${esc(it.descricao || '')}</small>` : badgeSituacao('disponivel')}</td>`;
          }).join('')}</tr>`).join('')}</tbody></table></div></section>
        <section class="pn-card pn-side"><div class="pn-ch"><h2>Pendências</h2><span>${alertas.length ? 'Toque para abrir' : ''}</span></div>
          ${alertas.length ? alertas.map(alerta).join('') : '<p class="pn-ok">Nenhuma pendência no momento.</p>'}</section>
      </div>
      <section class="pn-card"><div class="pn-ch"><h2>Solicitações aguardando aprovação</h2><a href="#/solicitacoes?aba=analise">Ver todas ›</a></div>
        ${pend.length ? pend.map((s) => `<a class="pn-al" href="#/solicitacoes/${s.id}"><span class="pn-ic">${svg(IC.clip)}</span>
          <span class="pn-at"><b>nº ${s.numero} — ${fmtData(s.data)} · ${s.periodo === 'manha' ? 'manhã' : 'tarde'} · ${esc(s.obras?.nome)}</b>
          <small>${esc(s.categoria_nome)} · ${esc(s.perfis?.nome_completo)}</small></span>${badgePrioridade(s.prioridade)}${CHEV}</a>`).join('')
        : '<p class="pn-ok">Nenhuma solicitação aguardando aprovação.</p>'}
        ${ocs.length ? `<h3>Ocorrências recentes</h3>${ocs.slice(0, 5).map((o) => `<a class="pn-al" href="#/ocorrencias"><span class="pn-ic red">${svg(IC.alert)}</span>
          <span class="pn-at"><b>${rotulo(o.tipo)}</b><small>${esc(o.descricao.slice(0, 90))} · ${fmtDataHora(o.data_hora)}</small></span>${CHEV}</a>`).join('')}` : ''}
      </section>
    </div>`;
    el.querySelector('#pn-atualizar').onclick = () => desenhar(true);
    if (manual) import('../ui.js').then((u) => u.aviso('Painel atualizado.'));
  }
  aoMudarAgenda(() => desenhar(false));
  await desenhar(false);
}
