// SOLICITAÇÕES — lista (admin: todas; solicitante: as próprias) e detalhe com aprovação
import { sb, estado, q, ehAdmin, msgErro } from '../api.js';
import { esc, fmtData, fmtPeriodo, fmtDataHora, badgeStatus, badgePrioridade, opcoes, carregando, vazio, aviso,
  janela, pedirTexto, ocupado, telLink, mapaLink, baixarArquivo } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { STATUS_SOLICITACAO, PRIORIDADES } from '../lib/regras.js';
import { criarXLSX } from '../lib/xlsx.js';
import { aoMudarAgenda } from '../sync.js';
import { atualizarPendentes } from '../app.js';

export async function render(el, params) {
  if (params.id) return detalhe(el, params.id);
  return lista(el, params);
}

async function lista(el, params) {
  const admin = ehAdmin();
  const obras = await q(sb.from('obras').select('id, nome').order('nome'));
  const st = { aba: params.aba || (admin ? 'analise' : 'todas'), obra: '', de: '', ate: '', texto: '' };
  el.innerHTML = `
    <div class="cabecalho"><h1>${admin ? 'Solicitações' : 'Minhas solicitações'}</h1>
      <div class="acoes"><a class="btn btn-dest" href="#/solicitar">+ Nova solicitação</a>
      ${admin ? '<button class="btn btn-sec" id="exportar">Exportar Excel</button>' : ''}</div></div>
    <div class="abas" role="tablist">${[
      ...(admin ? [['analise', 'Aguardando análise']] : []),
      ['esclarecimento', 'Esclarecimentos'], ['aprovada', 'Aprovadas'], ['encerradas', 'Encerradas'], ['todas', 'Todas'],
    ].map(([k, t]) => `<button role="tab" data-aba="${k}" class="${st.aba === k ? 'ativa' : ''}">${t}</button>`).join('')}</div>
    <div class="filtros">
      <label class="campo"><span>Obra</span><select id="f-obra">${opcoes(obras.map((o) => [o.id, o.nome]), '', 'Todas')}</select></label>
      <label class="campo"><span>De</span><input type="date" id="f-de"></label>
      <label class="campo"><span>Até</span><input type="date" id="f-ate"></label>
      <label class="campo"><span>Buscar</span><input id="f-texto" placeholder="Nº, descrição..."></label>
    </div>
    <div id="lista">${carregando()}</div>`;

  let dados = [];
  let pagina = 0;
  async function carregar(manter) {
    if (!manter) pagina = 0;
    let c = sb.from('solicitacoes').select('*, obras(nome), perfis!solicitacoes_solicitante_id_fkey(nome_completo)')
      .order('data', { ascending: st.aba !== 'encerradas' && st.aba !== 'todas' }).order('periodo').limit(500);
    if (!admin) c = c.eq('solicitante_id', estado.usuario.id);
    if (st.aba === 'analise') c = c.eq('status', 'pendente');
    else if (st.aba === 'encerradas') c = c.in('status', ['recusada', 'cancelada', 'concluida']);
    else if (st.aba !== 'todas') c = c.eq('status', st.aba);
    if (st.obra) c = c.eq('obra_id', st.obra);
    if (st.de) c = c.gte('data', st.de);
    if (st.ate) c = c.lte('data', st.ate);
    dados = await q(c);
    const t = st.texto.toLowerCase();
    const filtrados = t ? dados.filter((s) => `${s.numero} ${s.descricao} ${s.obras?.nome} ${s.categoria_nome} ${s.perfis?.nome_completo}`.toLowerCase().includes(t)) : dados;
    const alvo = el.querySelector('#lista');
    let pg;
    if (!filtrados.length) { alvo.innerHTML = vazio('Nenhuma solicitação encontrada.'); return; }
    alvo.innerHTML = `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Nº</th><th>Data</th><th>Período</th><th>Obra</th>
      <th>Categoria</th>${admin ? '<th>Solicitante</th>' : ''}<th>Situação</th></tr></thead><tbody>${(pg = paginar(filtrados, pagina)).itens.map((s) => `
      <tr class="clicavel" data-id="${s.id}" tabindex="0"><td data-r="Nº"><b>${s.numero}</b></td><td data-r="Data">${fmtData(s.data)}</td>
      <td data-r="Período">${s.periodo === 'manha' ? 'Manhã' : 'Tarde'}</td><td data-r="Obra">${esc(s.obras?.nome)}</td>
      <td data-r="Categoria">${esc(s.categoria_nome)}</td>${admin ? `<td data-r="Solicitante">${esc(s.perfis?.nome_completo)}</td>` : ''}
      <td data-r="Situação">${badgeStatus(s.status)} ${badgePrioridade(s.prioridade)}${s.execucao === 'finalizada' && s.status === 'aprovada' ? ' <span class="badge sit-finalizado">Finalizada pelo motorista</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>${paginacaoHTML(pg)}`;
  }

  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-aba]');
    if (a) { st.aba = a.dataset.aba; el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b === a)); carregar(); return; }
    const pb = e.target.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); carregar(true); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/solicitacoes/${tr.dataset.id}`;
    if (e.target.id === 'exportar') {
      const linhas = [['Nº', 'Data', 'Período', 'Obra', 'Categoria', 'Descrição', 'Solicitante', 'Situação', 'Prioridade', 'Execução', 'Criada em']]
        .concat(dados.map((s) => [s.numero, fmtData(s.data), s.periodo === 'manha' ? 'Manhã' : 'Tarde', s.obras?.nome, s.categoria_nome,
          s.descricao, s.perfis?.nome_completo, STATUS_SOLICITACAO[s.status], PRIORIDADES[s.prioridade], s.execucao, fmtDataHora(s.criado_em)]));
      baixarArquivo(`solicitacoes-${new Date().toISOString().slice(0, 10)}.xlsx`, criarXLSX([{ nome: 'Solicitações', linhas, larguras: [7, 11, 8, 28, 26, 45, 24, 22, 11, 14, 17] }]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) e.target.click(); });
  el.querySelector('#f-obra').onchange = (e) => { st.obra = e.target.value; carregar(); };
  el.querySelector('#f-de').onchange = (e) => { st.de = e.target.value; carregar(); };
  el.querySelector('#f-ate').onchange = (e) => { st.ate = e.target.value; carregar(); };
  let t; el.querySelector('#f-texto').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.texto = e.target.value; carregar(); }, 300); };
  aoMudarAgenda(() => carregar(true));
  await carregar();
}

const ROTULO_HIST = {
  criacao: 'Solicitação criada', aprovacao: 'Aprovada', recusa: 'Recusada', esclarecimento_pedido: 'Esclarecimento solicitado',
  esclarecimento_resposta: 'Resposta do solicitante', cancelamento: 'Cancelada', conclusao: 'Concluída', prioridade: 'Prioridade',
  inicio_atendimento: 'Atendimento iniciado', fim_atendimento: 'Atendimento finalizado', comentario: 'Comentário',
};

async function detalhe(el, id) {
  const admin = ehAdmin();
  async function desenhar() {
    const s = await q(sb.from('solicitacoes')
      .select('*, obras(*), caminhoes(nome, placa), solicitante:perfis!solicitacoes_solicitante_id_fkey(nome_completo), motorista:perfis!solicitacoes_execucao_motorista_id_fkey(nome_completo), decisor:perfis!solicitacoes_decidido_por_fkey(nome_completo)')
      .eq('id', id).maybeSingle());
    if (!s) { el.innerHTML = vazio('Solicitação não encontrada ou sem permissão de acesso.'); return; }
    const hist = await q(sb.from('solicitacao_historico').select('*, perfis(nome_completo)').eq('solicitacao_id', id).order('criado_em'));
    const dono = s.solicitante_id === estado.usuario.id;
    const o = s.obras;
    const acoes = [];
    if (admin && ['pendente', 'esclarecimento'].includes(s.status)) {
      acoes.push(['aprovar', 'Aprovar', 'btn-pri'], ['recusar', 'Recusar', 'btn-perigo']);
      if (s.status === 'pendente') acoes.push(['esclarecer', 'Solicitar esclarecimentos', 'btn-sec']);
    }
    if (admin && s.status === 'aprovada') acoes.push(['concluir', s.execucao === 'finalizada' ? 'Validar e concluir (libera o período)' : 'Concluir e liberar período', 'btn-pri']);
    if (admin && ['pendente', 'esclarecimento', 'aprovada'].includes(s.status) && s.execucao !== 'em_atendimento') acoes.push(['cancelar', 'Cancelar solicitação', 'btn-perigo']);
    if (admin && ['pendente', 'esclarecimento', 'aprovada'].includes(s.status)) acoes.push(['prioridade', 'Definir prioridade', 'btn-sec']);
    if (dono && s.status === 'esclarecimento') acoes.unshift(['responder', 'Responder esclarecimento', 'btn-dest']);

    const ultimoPedido = [...hist].reverse().find((h) => h.tipo === 'esclarecimento_pedido');
    el.innerHTML = `
      <div class="cabecalho"><h1>Solicitação nº ${s.numero}</h1><div class="acoes"><a class="btn btn-sec" href="#/solicitacoes">Voltar à lista</a><a class="btn btn-sec" href="#/agenda?data=${s.data}">Ver na agenda</a></div></div>
      <p>${badgeStatus(s.status)} ${badgePrioridade(s.prioridade)}
        ${s.execucao === 'em_atendimento' ? '<span class="badge sit-atendimento">Em atendimento</span>' : ''}
        ${s.execucao === 'finalizada' && s.status === 'aprovada' ? '<span class="badge sit-finalizado">Finalizada pelo motorista — aguardando validação</span>' : ''}</p>
      ${s.status === 'esclarecimento' && ultimoPedido && (dono || admin) ? `<div class="alerta alerta-aviso"><b>Esclarecimento solicitado:</b> ${esc(ultimoPedido.texto)}<br>
        <small>Enquanto aguarda a resposta, o período continua reservado.</small></div>` : ''}
      ${acoes.length ? `<div class="barra-acoes">${acoes.map(([a, t, c]) => `<button class="btn ${c}" data-acao="${a}">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="grade grade-2">
        <section class="cartao"><h2>Atividade</h2><dl class="detalhes">
          <div><dt>Data</dt><dd>${fmtData(s.data)}</dd></div>
          <div><dt>Período</dt><dd>${esc(fmtPeriodo(s.periodo))}</dd></div>
          <div><dt>Caminhão</dt><dd>${esc(s.caminhoes?.nome)} · ${esc(s.caminhoes?.placa)}</dd></div>
          <div><dt>Categoria</dt><dd>${esc(s.categoria_nome)}</dd></div>
          <div><dt>Descrição</dt><dd>${esc(s.descricao)}</dd></div>
          <div><dt>Justificativa</dt><dd>${esc(s.justificativa)}</dd></div>
          <div><dt>Local na obra</dt><dd>${esc(s.local_especifico || '—')}</dd></div>
          <div><dt>Observações</dt><dd>${esc(s.observacoes || '—')}</dd></div>
          <div><dt>Solicitante</dt><dd>${esc(s.solicitante?.nome_completo)}</dd></div>
          <div><dt>Criada em</dt><dd>${fmtDataHora(s.criado_em)}</dd></div>
          ${s.decisor ? `<div><dt>Analisada por</dt><dd>${esc(s.decisor.nome_completo)} em ${fmtDataHora(s.decidido_em)}</dd></div>` : ''}
          ${s.execucao_inicio ? `<div><dt>Atendimento</dt><dd>${fmtDataHora(s.execucao_inicio)} → ${fmtDataHora(s.execucao_fim)}${s.motorista ? `<br>Motorista: ${esc(s.motorista.nome_completo)}` : ''}${s.execucao_offline ? '<br><small>Registrado sem conexão e sincronizado</small>' : ''}</dd></div>` : ''}
        </dl></section>
        <section class="cartao"><h2>Obra</h2><dl class="detalhes">
          <div><dt>Obra</dt><dd>${esc(o.nome)}${o.ativa ? '' : ' (inativa)'}</dd></div>
          <div><dt>Endereço</dt><dd>${mapaLink(o.endereco)}</dd></div>
          <div><dt>Responsável principal</dt><dd>${esc(o.responsavel_nome)} · ${telLink(o.responsavel_telefone)}</dd></div>
          ${o.contato1_nome ? `<div><dt>Contato adicional</dt><dd>${esc(o.contato1_nome)} · ${telLink(o.contato1_telefone)}</dd></div>` : ''}
          ${o.contato2_nome ? `<div><dt>Contato adicional</dt><dd>${esc(o.contato2_nome)} · ${telLink(o.contato2_telefone)}</dd></div>` : ''}
        </dl></section>
      </div>
      <section class="cartao"><h2>Histórico e comunicação</h2>
        ${hist.length ? `<ol class="historico">${hist.map((h) => `<li class="h-${h.tipo}"><div class="quando">${fmtDataHora(h.criado_em)} · ${esc(h.perfis?.nome_completo || 'Sistema')} · <b>${esc(ROTULO_HIST[h.tipo] || h.tipo)}</b></div>
          ${h.texto ? `<div class="texto">${esc(h.texto)}</div>` : ''}</li>`).join('')}</ol>` : '<p class="muted">Histórico disponível para o solicitante e o administrador.</p>'}
      </section>`;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    const exec = (fn, args, msg) => ocupado(b, async () => {
      try { await q(sb.rpc(fn, args)); aviso(msg); await desenhar(); atualizarPendentes(); } catch (ex) { aviso(msgErro(ex), 'erro'); }
    });
    if (acao === 'aprovar') {
      const r = await janela({
        titulo: 'Aprovar solicitação',
        corpo: `<form><label class="campo"><span>Prioridade</span><select name="prioridade">${opcoes(Object.entries(PRIORIDADES), 'normal')}</select></label>
          <label class="campo"><span>Comentário (opcional)</span><textarea name="comentario" rows="2"></textarea></label></form>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Aprovar', valor: 'ok' }],
      });
      if (r) exec('aprovar_solicitacao', { p_id: id, p_prioridade: r.dados.prioridade, p_comentario: r.dados.comentario || null }, 'Solicitação aprovada. Solicitante e motorista notificados.');
    } else if (acao === 'recusar') {
      const t = await pedirTexto({ titulo: 'Recusar solicitação', rotulo: 'Justificativa da recusa', ajuda: 'O solicitante verá esta justificativa. O período será liberado.', textoOk: 'Recusar', perigo: true });
      if (t) exec('recusar_solicitacao', { p_id: id, p_motivo: t }, 'Solicitação recusada e período liberado.');
    } else if (acao === 'esclarecer') {
      const t = await pedirTexto({ titulo: 'Solicitar esclarecimentos', rotulo: 'O que precisa ser esclarecido?', ajuda: 'O período continua reservado até a resposta.', textoOk: 'Enviar pedido' });
      if (t) exec('pedir_esclarecimento', { p_id: id, p_texto: t }, 'Pedido de esclarecimento enviado ao solicitante.');
    } else if (acao === 'responder') {
      const t = await pedirTexto({ titulo: 'Responder esclarecimento', rotulo: 'Sua resposta', ajuda: 'Após enviar, a solicitação volta para análise do administrador.', textoOk: 'Enviar resposta' });
      if (t) exec('responder_esclarecimento', { p_id: id, p_texto: t }, 'Resposta enviada. A solicitação voltou para análise.');
    } else if (acao === 'cancelar') {
      const t = await pedirTexto({ titulo: 'Cancelar solicitação', rotulo: 'Motivo do cancelamento', ajuda: 'O solicitante será notificado e o período será liberado. O histórico é preservado.', textoOk: 'Cancelar solicitação', perigo: true });
      if (t) exec('cancelar_solicitacao', { p_id: id, p_motivo: t }, 'Solicitação cancelada e período liberado.');
    } else if (acao === 'concluir') {
      const t = await pedirTexto({ titulo: 'Concluir solicitação', rotulo: 'Observação (opcional)', obrigatorio: false, ajuda: 'A conclusão encerra a solicitação e libera o período na agenda.', textoOk: 'Concluir' });
      if (t !== null) exec('concluir_solicitacao', { p_id: id, p_observacao: t || null }, 'Solicitação concluída. Período liberado.');
    } else if (acao === 'prioridade') {
      const r = await janela({
        titulo: 'Definir prioridade', corpo: `<form><label class="campo"><span>Prioridade</span><select name="p">${opcoes(Object.entries(PRIORIDADES), 'normal')}</select></label></form>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
      });
      if (r) exec('definir_prioridade', { p_id: id, p_prioridade: r.dados.p }, 'Prioridade atualizada.');
    }
  });
  aoMudarAgenda(desenhar);
  el.innerHTML = carregando();
  await desenhar();
}
