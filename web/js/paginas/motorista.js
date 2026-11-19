// PAINEL DO MOTORISTA — "Meu dia": programação, atendimentos e Diário de Bordo (funciona offline)
import { sb, estado, q, caminhaoAtual, offsetFuso, gravarCache, lerCache } from '../api.js';
import { esc, fmtData, fmtDataHora, fmtNum, nomeDia, badgeSituacao, badgePrioridade, telLink, mapaLink, vazio, aviso, confirmar } from '../ui.js';
import * as R from '../lib/regras.js';
import { aoMudarAgenda, registrar, fila } from '../sync.js';
import { expedienteAberto, guardarExpedienteAberto, iniciarExpediente, encerrarExpediente, registrarAtendimento,
  registrarAbastecimento, registrarOcorrencia, registrarDespesa } from './diario-forms.js';

export async function render(el) {
  const cam = caminhaoAtual();
  if (!cam) { el.innerHTML = `<h1>Meu dia</h1>${vazio('Nenhum caminhão cadastrado.')}`; return; }
  const off = offsetFuso();
  const hoje = R.hojeNoFuso(Date.now(), off);
  let prog = [], obras = [], online = true;
  // estado local de execução (iniciado/finalizado sem conexão)
  const chaveLocal = `execucao-local-${estado.usuario.id}`;
  const execLocal = () => lerCache(chaveLocal) || {};
  const marcarLocal = (id, v) => { const x = execLocal(); x[id] = v; gravarCache(chaveLocal, x); };

  async function carregar() {
    const fim = R.somarDias(hoje, 14);
    try {
      [prog, obras] = await Promise.all([
        q(sb.from('vw_agenda').select('*').eq('caminhao_id', cam.id).gte('data', hoje).lte('data', fim).order('data').order('periodo')),
        q(sb.from('obras').select('id, nome').eq('ativa', true).order('nome')),
      ]);
      gravarCache(`prog-${cam.id}`, prog); gravarCache('obras-motorista', obras);
      online = true;
      // sincroniza expediente aberto com o servidor (se outro aparelho encerrou, por exemplo)
      const { pendentes } = await fila.contar();
      if (!pendentes) {
        const aberto = await q(sb.from('expedientes').select('*').eq('motorista_id', estado.usuario.id).is('fim_em', null).order('inicio_em', { ascending: false }).limit(1));
        guardarExpedienteAberto(aberto[0] || null);
        gravarCache(chaveLocal, {});
      }
    } catch {
      prog = lerCache(`prog-${cam.id}`) || []; obras = lerCache('obras-motorista') || []; online = false;
    }
    desenhar();
  }

  function situacaoComLocal(it) {
    const l = execLocal()[it.id];
    if (l === 'finalizada') return 'finalizado';
    if (l === 'em_atendimento' && it.situacao === 'agendado') return 'em_atendimento';
    return it.situacao;
  }

  function cartaoAtividade(it, comAcoes) {
    const s = situacaoComLocal(it);
    const local = execLocal()[it.id];
    if (it.origem !== 'solicitacao') {
      return `<div class="prog-item s-${s}"><h3>${fmtData(it.data)} · ${it.periodo === 'manha' ? 'Manhã' : 'Tarde'} — ${esc(it.origem === 'bloqueio' ? 'Bloqueado' : it.categoria)}</h3>
        <p>${badgeSituacao(s)} ${esc(it.descricao)}</p>${it.obra_endereco ? `<p>${mapaLink(it.obra_endereco)}</p>` : ''}</div>`;
    }
    const pend = local && s !== it.situacao ? ' <span class="badge badge-aviso">Pendente de sincronização</span>' : '';
    return `<div class="prog-item s-${s}">
      <h3>${it.periodo === 'manha' ? 'Manhã (07h–12h)' : 'Tarde (13h–17h)'} — ${esc(it.obra_nome)}</h3>
      <p>${badgeSituacao(s)} ${badgePrioridade(it.prioridade)}${pend}</p>
      <dl class="detalhes">
        <div><dt>Atividade</dt><dd>${esc(it.categoria)} — ${esc(it.descricao)}</dd></div>
        <div><dt>Endereço</dt><dd>${mapaLink(it.obra_endereco)}</dd></div>
        <div><dt>Local na obra</dt><dd>${esc(it.local_especifico || '—')}</dd></div>
        <div><dt>Responsável</dt><dd>${esc(it.obra_responsavel)} · ${telLink(it.obra_telefone)}</dd></div>
        ${it.contato1_nome ? `<div><dt>Contato</dt><dd>${esc(it.contato1_nome)} · ${telLink(it.contato1_telefone)}</dd></div>` : ''}
        ${it.contato2_nome ? `<div><dt>Contato</dt><dd>${esc(it.contato2_nome)} · ${telLink(it.contato2_telefone)}</dd></div>` : ''}
        ${it.observacoes ? `<div><dt>Observações operacionais</dt><dd>${esc(it.observacoes)}</dd></div>` : ''}
        <div><dt>Solicitante</dt><dd>${esc(it.solicitante_nome)}</dd></div>
      </dl>
      ${comAcoes && it.status === 'aprovada' ? `<div class="barra-acoes">
        ${s === 'agendado' ? `<button class="btn btn-pri btn-grande" data-iniciar="${it.id}">Iniciar atendimento</button>` : ''}
        ${s === 'em_atendimento' ? `<button class="btn btn-dest btn-grande" data-finalizar="${it.id}">Finalizar atendimento</button>` : ''}
        ${s === 'finalizado' ? '<span class="muted">Finalizado. Aguardando validação do administrador para liberar o período.</span>' : ''}
      </div>` : ''}
    </div>`;
  }

  function desenhar() {
    const exp = expedienteAberto();
    const deHoje = prog.filter((x) => x.data === hoje);
    const proximas = prog.filter((x) => x.data > hoje && x.origem === 'solicitacao' && x.status === 'aprovada');
    el.innerHTML = `
      <div class="cabecalho"><h1>Meu dia</h1><div class="acoes"><a class="btn btn-sec" href="#/agenda">Agenda completa</a></div></div>
      <p class="muted" style="margin-top:-.5rem">${esc(nomeDia(hoje))}, ${fmtData(hoje)} · ${esc(cam.nome)} (${esc(cam.placa)}) · KM atual: ${fmtNum(cam.km_atual)}</p>
      ${online ? '' : '<div class="alerta alerta-aviso"><b>Sem conexão.</b> Mostrando a última programação carregada. Seus registros ficam guardados e serão enviados quando a internet voltar.</div>'}
      <section class="cartao">
        <h2>Expediente</h2>
        ${exp ? `<p>Iniciado em <b>${fmtDataHora(exp.inicio_em)}</b> · KM inicial <b>${fmtNum(exp.km_inicial)}</b></p>
          <div class="grade grade-3">
            <button class="btn btn-pri btn-grande" data-acao="atendimento">Registrar atendimento</button>
            <button class="btn btn-sec btn-grande" data-acao="abastecimento">Abastecimento</button>
            <button class="btn btn-sec btn-grande" data-acao="ocorrencia">Ocorrência</button>
            <button class="btn btn-sec btn-grande" data-acao="despesa">Despesa emergencial</button>
            <button class="btn btn-dest btn-grande" data-acao="encerrar">Encerrar expediente</button>
          </div>`
        : `<p>Nenhum expediente aberto. Ao iniciar, informe o KM inicial e faça o checklist de abertura.</p>
          <button class="btn btn-pri btn-grande" data-acao="iniciar">Iniciar expediente</button>
          <div class="barra-acoes"><button class="btn btn-sec" data-acao="ocorrencia">Registrar ocorrência</button>
          <button class="btn btn-sec" data-acao="abastecimento">Abastecimento</button></div>`}
      </section>
      <section><h2>Programação de hoje</h2>
        ${deHoje.length ? deHoje.map((x) => cartaoAtividade(x, true)).join('') : vazio('Nenhuma atividade programada para hoje.')}</section>
      <section><h2>Próximas atividades</h2>
        ${proximas.length ? proximas.map((x) => `<div class="cartao"><b>${esc(nomeDia(x.data))}, ${fmtData(x.data)} · ${x.periodo === 'manha' ? 'Manhã' : 'Tarde'}</b>
          — ${esc(x.obra_nome)}<br><span class="muted">${esc(x.categoria)}: ${esc(x.descricao)}</span>
          <details><summary>Endereço e contatos</summary><p>${mapaLink(x.obra_endereco)}<br>${esc(x.obra_responsavel)} · ${telLink(x.obra_telefone)}
          ${x.local_especifico ? `<br>Local: ${esc(x.local_especifico)}` : ''}${x.observacoes ? `<br>Obs.: ${esc(x.observacoes)}` : ''}</p></details></div>`).join('')
        : vazio('Nenhuma atividade aprovada nos próximos 14 dias.')}</section>`;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const recarregar = () => { desenhar(); if (navigator.onLine) setTimeout(carregar, 800); };
    if (b.dataset.acao === 'iniciar') return iniciarExpediente(recarregar);
    if (b.dataset.acao === 'encerrar') return encerrarExpediente(recarregar, obras);
    if (b.dataset.acao === 'atendimento') return registrarAtendimento({ obras, aoConcluir: recarregar });
    if (b.dataset.acao === 'abastecimento') return registrarAbastecimento(recarregar);
    if (b.dataset.acao === 'ocorrencia') return registrarOcorrencia(recarregar);
    if (b.dataset.acao === 'despesa') return registrarDespesa(recarregar);
    if (b.dataset.iniciar) {
      const it = prog.find((x) => x.id === b.dataset.iniciar);
      if (!expedienteAberto() && !(await confirmar('Você ainda não iniciou o expediente (KM e checklist). Deseja iniciar o atendimento mesmo assim?'))) return;
      marcarLocal(it.id, 'em_atendimento');
      await registrar({ tipo: 'rpc', funcao: 'iniciar_atendimento', rotulo: `Início do atendimento nº ${it.numero}`,
        args: { p_id: it.id, p_momento: new Date().toISOString(), p_offline: !navigator.onLine } });
      aviso(navigator.onLine ? 'Atendimento iniciado.' : 'Início registrado sem conexão. Será enviado quando a internet voltar.', navigator.onLine ? 'sucesso' : 'info');
      recarregar();
    }
    if (b.dataset.finalizar) {
      const it = prog.find((x) => x.id === b.dataset.finalizar);
      await registrarAtendimento({ solicitacao: it, obras: obras.some((o) => o.id === it.obra_id) ? obras : [...obras, { id: it.obra_id, nome: it.obra_nome }],
        finalizar: true, aoConcluir: () => { marcarLocal(it.id, 'finalizada'); recarregar(); } });
    }
  });
  aoMudarAgenda(carregar);
  await carregar();
}
