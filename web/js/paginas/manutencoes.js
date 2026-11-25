// MANUTENÇÕES E SERVIÇOS (tornam o caminhão indisponível) + PLANOS PREVENTIVOS (data ou KM)
import { sb, q, estado, caminhaoAtual, msgErro, offsetFuso } from '../api.js';
import { esc, fmtData, fmtPeriodo, fmtNum, opcoes, vazio, carregando, janela, aviso, pedirTexto, camposHTML, numero, rotulo } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { hojeNoFuso, ehDiaUtil } from '../lib/regras.js';
import { aoMudarAgenda } from '../sync.js';

const TIPOS = [['manutencao_preventiva', 'Manutenção preventiva'], ['manutencao_corretiva', 'Manutenção corretiva'], ['lavagem', 'Lavagem'],
  ['borracharia', 'Borracharia'], ['revisao', 'Revisão'], ['abastecimento', 'Abastecimento'], ['outros', 'Outros serviços']];
const nomeTipo = (t) => TIPOS.find((x) => x[0] === t)?.[1] || t;

export async function render(el) {
  const cam = caminhaoAtual();
  if (!cam) { el.innerHTML = `<h1>Manutenções</h1>${vazio('Cadastre um caminhão primeiro.')}`; return; }
  let aba = 'atividades';
  el.innerHTML = `<div class="cabecalho"><h1>Manutenções e serviços</h1><div class="acoes" id="acoes"></div></div>
    <div class="abas"><button data-aba="atividades" class="ativa">Programação</button><button data-aba="planos">Planos preventivos</button><button data-aba="historico">Histórico</button></div>
    <div id="lista">${carregando()}</div>`;
  let planos = [];
  let pagina = 0;

  async function carregar(manter) {
    if (!manter) pagina = 0;
    planos = await q(sb.from('vw_planos_manutencao').select('*').eq('caminhao_id', cam.id).order('descricao'));
    const acoes = el.querySelector('#acoes');
    const lista = el.querySelector('#lista');
    if (aba === 'planos') {
      acoes.innerHTML = '<button class="btn btn-pri" id="novo-plano">+ Novo plano preventivo</button>';
      lista.innerHTML = `<p class="muted">KM atual do caminhão: <b>${fmtNum(cam.km_atual)}</b>. Alertas: ${estado.config.alerta_manutencao_dias} dias / ${estado.config.alerta_manutencao_km} km antes do vencimento.</p>` +
        (planos.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Plano</th><th>Intervalo</th><th>Última</th><th>Próxima</th><th>Situação</th><th></th></tr></thead><tbody>
        ${planos.map((p) => `<tr><td data-r="Plano"><b>${esc(p.descricao)}</b>${p.ativo ? '' : ' (inativo)'}</td>
          <td data-r="Intervalo">${[p.intervalo_dias ? `${p.intervalo_dias} dias` : '', p.intervalo_km ? `${fmtNum(p.intervalo_km)} km` : ''].filter(Boolean).join(' ou ')}</td>
          <td data-r="Última">${fmtData(p.ultima_data)}${p.ultimo_km ? ` · ${fmtNum(p.ultimo_km)} km` : ''}</td>
          <td data-r="Próxima">${fmtData(p.proxima_data)}${p.proximo_km ? ` · ${fmtNum(p.proximo_km)} km` : ''}</td>
          <td data-r="Situação"><span class="badge ${p.situacao === 'vencida' ? 'badge-erro' : p.situacao === 'proxima' ? 'badge-aviso' : 'badge-ok'}">${{ vencida: 'Vencida', proxima: 'Próxima', em_dia: 'Em dia', sem_historico: 'Sem histórico' }[p.situacao]}</span></td>
          <td><button class="btn btn-sm btn-sec" data-editar-plano="${p.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum plano. Ex.: "Troca de óleo a cada 10.000 km ou 180 dias".'));
      return;
    }
    acoes.innerHTML = '<button class="btn btn-pri" id="nova">+ Programar manutenção/serviço</button>';
    let c = sb.from('atividades_operacionais').select('*').eq('caminhao_id', cam.id);
    c = aba === 'atividades' ? c.eq('status', 'programada').order('data') : c.neq('status', 'programada').order('data', { ascending: false }).limit(300);
    const dados = await q(c);
    const pg = paginar(dados, pagina);
    lista.innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Data</th><th>Período</th><th>Tipo</th><th>Descrição</th><th>Empresa</th><th>Situação</th><th></th></tr></thead><tbody>
      ${pg.itens.map((a) => `<tr><td data-r="Data">${fmtData(a.data)}</td><td data-r="Período">${esc(fmtPeriodo(a.periodo))}</td><td data-r="Tipo">${esc(nomeTipo(a.tipo))}</td>
        <td data-r="Descrição">${esc(a.descricao)}${a.plano_id ? '<br><small>Vinculada a plano preventivo</small>' : ''}${a.status !== 'programada' && a.observacoes ? `<br><small class="pre">${esc(a.observacoes)}</small>` : ''}${a.km_execucao != null ? `<br><small>KM ${fmtNum(a.km_execucao)}</small>` : ''}</td>
        <td data-r="Empresa">${esc(a.empresa || '—')}${a.telefone ? `<br><small>${esc(a.telefone)}</small>` : ''}</td>
        <td data-r="Situação"><span class="badge ${a.status === 'programada' ? 'sit-manutencao' : a.status === 'concluida' ? 'badge-ok' : 'st-cancelada'}">${rotulo(a.status)}</span></td>
        <td>${a.status === 'programada' ? `<button class="btn btn-sm btn-pri" data-concluir="${a.id}">Concluir</button> <button class="btn btn-sm btn-sec" data-cancelar="${a.id}">Cancelar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>${paginacaoHTML(pg)}`
      : vazio(aba === 'atividades' ? 'Nenhuma manutenção ou serviço programado.' : 'Sem histórico.');
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const pb = t.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    const ab = t.closest('[data-aba]');
    if (ab) { aba = ab.dataset.aba; el.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b === ab)); return carregar(); }
    try {
      if (t.id === 'nova') {
        const r = await janela({
          titulo: 'Programar manutenção ou serviço', largura: 'larga',
          corpo: `<form><div class="alerta alerta-info">O caminhão ficará indisponível na agenda no período escolhido.</div>${camposHTML([
            { n: 'tipo', t: 'Tipo', tipo: 'select', obr: true, opcoes: TIPOS, vazio: 'Selecione' },
            { n: 'data', t: 'Data', tipo: 'date', obr: true, attrs: `min="${hojeNoFuso(Date.now(), offsetFuso())}"` },
            { n: 'periodo', t: 'Período', tipo: 'select', obr: true, opcoes: [['manha', 'Manhã'], ['tarde', 'Tarde'], ['dia', 'Dia inteiro']] },
            { n: 'descricao', t: 'Descrição', tipo: 'textarea', obr: true, linhas: 2 },
            { n: 'plano_id', t: 'Vincular a plano preventivo (opcional)', tipo: 'select', opcoes: planos.filter((p) => p.ativo).map((p) => [p.id, p.descricao]), vazio: 'Nenhum' },
            { n: 'empresa', t: 'Empresa' }, { n: 'endereco', t: 'Endereço' }, { n: 'telefone', t: 'Telefone', tipo: 'tel' },
            { n: 'observacoes', t: 'Observações', tipo: 'textarea', linhas: 2 },
          ])}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Programar', valor: 'ok' }],
          validar: (d) => (!ehDiaUtil(d.data) ? 'Escolha um dia de segunda a sexta-feira.' : null),
        });
        if (!r) return;
        const d = r.dados;
        await q(sb.from('atividades_operacionais').insert({ caminhao_id: cam.id, tipo: d.tipo, data: d.data, periodo: d.periodo, descricao: d.descricao,
          plano_id: d.plano_id || null, empresa: d.empresa || null, endereco: d.endereco || null, telefone: d.telefone || null,
          observacoes: d.observacoes || null, criado_por: estado.usuario.id }));
        aviso('Programado. O período ficou indisponível na agenda.'); carregar();
      }
      if (t.dataset.concluir) {
        const a = await q(sb.from('atividades_operacionais').select('*').eq('id', t.dataset.concluir).single());
        const r = await janela({
          titulo: 'Concluir manutenção/serviço',
          corpo: `<form>${camposHTML([
            { n: 'km_execucao', t: 'KM na execução', tipo: 'number', padrao: cam.km_atual },
            { n: 'empresa', t: 'Oficina / prestador do serviço', padrao: a.empresa || '', max: 120 },
            { n: 'realizado', t: 'Serviço realizado (o que foi feito)', tipo: 'textarea', ajuda: 'Ex.: troca de óleo e filtros; pneu dianteiro substituído.' },
          ])}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Concluir', valor: 'ok' }],
          validar: (d) => (Number.isNaN(numero(d.km_execucao)) ? 'KM inválido.' : null),
        });
        if (!r) return;
        const km = numero(r.dados.km_execucao), feito = (r.dados.realizado || '').trim();
        await q(sb.from('atividades_operacionais').update({ status: 'concluida', km_execucao: km, empresa: r.dados.empresa || a.empresa || null,
          observacoes: feito ? [a.observacoes, `Realizado: ${feito}`].filter(Boolean).join('\n') : a.observacoes }).eq('id', a.id));
        aviso('Concluída.' + (a.plano_id ? ' Plano preventivo atualizado.' : '')); carregar();
      }
      if (t.dataset.cancelar) {
        const m = await pedirTexto({ titulo: 'Cancelar manutenção', rotulo: 'Motivo', textoOk: 'Cancelar e liberar período', perigo: true });
        if (!m) return;
        await q(sb.from('atividades_operacionais').update({ status: 'cancelada', observacoes: `Cancelada: ${m}` }).eq('id', t.dataset.cancelar));
        aviso('Cancelada. O período foi liberado.'); carregar();
      }
      if (t.id === 'novo-plano' || t.dataset.editarPlano) {
        const p = planos.find((x) => x.id === t.dataset.editarPlano) || { ativo: true };
        const r = await janela({
          titulo: p.id ? 'Editar plano preventivo' : 'Novo plano preventivo',
          corpo: `<form>${camposHTML([
            { n: 'descricao', t: 'Descrição', obr: true }, { n: 'intervalo_dias', t: 'A cada (dias)', tipo: 'number' },
            { n: 'intervalo_km', t: 'A cada (km)', tipo: 'number', ajuda: 'Preencha dias, km ou ambos (vence no que ocorrer primeiro).' },
            { n: 'ultima_data', t: 'Data da última execução', tipo: 'date' }, { n: 'ultimo_km', t: 'KM da última execução', tipo: 'number' },
            { n: 'ativo', t: 'Plano ativo', tipo: 'checkbox' },
          ], p)}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
          validar: (d) => (!numero(d.intervalo_dias) && !numero(d.intervalo_km) ? 'Informe o intervalo em dias e/ou km.' : null),
        });
        if (!r) return;
        const d = r.dados;
        const reg = { caminhao_id: cam.id, descricao: d.descricao, intervalo_dias: numero(d.intervalo_dias) || null, intervalo_km: numero(d.intervalo_km) || null,
          ultima_data: d.ultima_data || null, ultimo_km: numero(d.ultimo_km), ativo: d.ativo };
        await q(p.id ? sb.from('planos_manutencao').update(reg).eq('id', p.id) : sb.from('planos_manutencao').insert(reg));
        aviso('Plano salvo.'); carregar();
      }
    } catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  aoMudarAgenda(() => carregar(true));
  await carregar();
}
