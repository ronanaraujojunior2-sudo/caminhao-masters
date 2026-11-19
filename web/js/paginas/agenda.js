// AGENDA DO CAMINHÃO — módulo principal (semanal, mensal e lista; filtros; tempo real)
import { sb, estado, q, ehAdmin, ehSolicitante, caminhaoAtual, offsetFuso, gravarCache, lerCache } from '../api.js';
import { esc, fmtData, fmtPeriodo, fmtDataHora, nomeDia, nomeDiaCurto, nomeMes, badgeSituacao, badgePrioridade,
  janela, opcoes, carregando, vazio, aviso, telLink, mapaLink } from '../ui.js';
import * as R from '../lib/regras.js';
import { aoMudarAgenda } from '../sync.js';

const podeSolicitar = () => ehAdmin() || ehSolicitante();

export async function render(el, params) {
  const cam = caminhaoAtual();
  if (!cam) {
    el.innerHTML = `<h1>Agenda</h1>${vazio(ehAdmin() ? 'Nenhum caminhão ativo. Cadastre o caminhão em Cadastros > Caminhões.' : 'Nenhum caminhão disponível no momento.')}`;
    return;
  }
  const off = offsetFuso();
  const hoje = R.hojeNoFuso(Date.now(), off);
  const st = {
    modo: params.modo || localStorage.getItem('cm-agenda-modo') || (matchMedia('(max-width: 760px)').matches ? 'lista' : 'semana'),
    ref: params.data || hoje,
    filtros: { obra: '', situacao: '', categoria: '', periodo: '' },
    itens: [],
  };

  const [obras, categorias] = await Promise.all([
    q(sb.from('obras').select('id, nome, ativa').order('nome')),
    q(sb.from('categorias').select('nome').order('ordem')),
  ]).catch(() => [lerCache('obras') || [], []]);
  gravarCache('obras', obras);

  el.innerHTML = `
    <div class="cabecalho"><h1>Agenda do caminhão</h1>
      <div class="acoes">${podeSolicitar() ? '<a class="btn btn-dest btn-grande" href="#/solicitar">+ Solicitar caminhão</a>' : ''}</div></div>
    <p class="muted" style="margin-top:-.5rem"><b>${esc(cam.nome)}</b> · ${esc(cam.placa)} · Segunda a sexta · Manhã 07h–12h · Tarde 13h–17h</p>
    <div class="agenda-barra">
      <div class="alternador" role="tablist">
        ${[['semana', 'Semana'], ['mes', 'Mês'], ['lista', 'Lista']].map(([m, t]) => `<button role="tab" data-modo="${m}" class="${st.modo === m ? 'ativa' : ''}">${t}</button>`).join('')}
      </div>
      <div class="agenda-nav">
        <button class="btn btn-sec btn-sm" data-nav="-1" aria-label="Anterior">‹ Anterior</button>
        <button class="btn btn-sec btn-sm" data-nav="0">Hoje</button>
        <button class="btn btn-sec btn-sm" data-nav="1" aria-label="Próximo">Próximo ›</button>
        <h2 id="titulo-periodo"></h2>
      </div>
    </div>
    <details class="cartao nao-imprimir" ${matchMedia('(min-width: 900px)').matches ? 'open' : ''}><summary><b>Filtros</b></summary>
      <div class="filtros" style="margin-top:.7rem">
        <label class="campo"><span>Obra</span><select data-f="obra">${opcoes(obras.map((o) => [o.id, o.nome + (o.ativa ? '' : ' (inativa)')]), '', 'Todas')}</select></label>
        <label class="campo"><span>Situação</span><select data-f="situacao">${opcoes(Object.entries(R.SITUACOES).map(([k, v]) => [k, v.rotulo]), '', 'Todas')}</select></label>
        <label class="campo"><span>Categoria</span><select data-f="categoria">${opcoes([...new Set([...categorias.map((c) => c.nome), 'Bloqueio'])].map((c) => [c, c]), '', 'Todas')}</select></label>
        <label class="campo"><span>Período</span><select data-f="periodo">${opcoes([['manha', 'Manhã'], ['tarde', 'Tarde']], '', 'Manhã e tarde')}</select></label>
        <button class="btn btn-sec btn-sm" id="limpar">Limpar filtros</button>
      </div></details>
    <div class="legenda">${['disponivel', 'reservado', 'agendado', 'em_atendimento', 'manutencao', 'bloqueado'].map(badgeSituacao).join('')}</div>
    <div id="area">${carregando()}</div>`;

  const area = el.querySelector('#area');

  function intervalo() {
    if (st.modo === 'semana') { const d = R.diasUteisDaSemana(st.ref); return [d[0], d[4]]; }
    const sem = R.semanasDoMes(st.ref);
    if (st.modo === 'mes') return [sem[0][0].data, sem.at(-1)[4].data];
    const d = R.deISO(st.ref);
    return [R.paraISO(new Date(d.getFullYear(), d.getMonth(), 1)), R.paraISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }

  async function carregar() {
    const [ini, fim] = intervalo();
    try {
      st.itens = await q(sb.from('vw_agenda').select('*').eq('caminhao_id', cam.id).gte('data', ini).lte('data', fim)
        .order('data').order('periodo'));
      gravarCache(`agenda-${cam.id}-${ini}`, st.itens);
    } catch (e) {
      const cache = lerCache(`agenda-${cam.id}-${ini}`);
      if (!cache) { area.innerHTML = `<div class="alerta alerta-erro">Não foi possível carregar a agenda. ${esc(e.message)}</div>`; return; }
      st.itens = cache;
      aviso('Sem conexão: exibindo a última agenda carregada neste aparelho.', 'info');
    }
    desenhar();
  }

  const livreValido = (data, periodo) => R.validarAgendamento({ data, periodo, config: estado.config, admin: ehAdmin(), offsetMinutos: off });
  const passou = (data, periodo) => R.inicioPeriodoMs(data, periodo, off) + 5 * 3600000 < Date.now();

  function visivel(it) {
    return R.filtrarItens([it], st.filtros).length === 1;
  }
  const filtroLivre = () => !st.filtros.situacao || st.filtros.situacao === 'disponivel';
  const temFiltro = () => Object.values(st.filtros).some(Boolean);

  function slotHTML(data, periodo, it) {
    const rot = `${R.PERIODOS[periodo].rotulo} · ${R.PERIODOS[periodo].horario}`;
    if (!it) {
      const ok = !passou(data, periodo);
      const esconder = !filtroLivre() || (st.filtros.periodo && st.filtros.periodo !== periodo) || st.filtros.obra || st.filtros.categoria;
      return `<button class="slot livre ${ok ? '' : 'passado'} ${esconder ? 'filtrado' : ''}" data-periodo="${rot}" data-livre="${data}|${periodo}">
        ${ok ? `Disponível${podeSolicitar() ? '<small>Toque para solicitar</small>' : ''}` : '—'}</button>`;
    }
    const linhas = it.origem === 'solicitacao'
      ? `<span class="obra">${esc(it.obra_nome)}</span><span class="linha">${esc(it.categoria)}</span>
         <span class="linha">${esc(it.descricao)}</span><span class="linha">Solicitante: ${esc(it.solicitante_nome)}</span>`
      : `<span class="obra">${esc(it.origem === 'bloqueio' ? 'Bloqueado' : it.categoria)}</span><span class="linha">${esc(it.descricao)}</span>`;
    return `<button class="slot s-${it.situacao} ${visivel(it) ? '' : 'filtrado'}" data-periodo="${rot}" data-item="${it.origem}|${it.id}|${periodo}">
      ${badgeSituacao(it.situacao)} ${badgePrioridade(it.prioridade)}${linhas}</button>`;
  }

  function desenharSemana() {
    const dias = R.diasUteisDaSemana(st.ref);
    const g = R.montarGrade(dias, st.itens);
    el.querySelector('#titulo-periodo').textContent = `Semana de ${fmtData(dias[0])} a ${fmtData(dias[4])}`;
    let h = '<div class="semana"><div class="cab-vazio"></div>';
    h += dias.map((d) => `<div class="cab-dia ${d === hoje ? 'hoje' : ''}">${esc(nomeDia(d))}<small>${fmtData(d)}${d === hoje ? ' · hoje' : ''}</small></div>`).join('');
    for (const p of ['manha', 'tarde']) {
      if (st.filtros.periodo && st.filtros.periodo !== p) continue;
      h += `<div class="rot-periodo">${R.PERIODOS[p].rotulo}<small>${R.PERIODOS[p].horario}</small></div>`;
      h += dias.map((d) => slotHTML(d, p, g[d][p])).join('');
    }
    area.innerHTML = h + '</div>';
    // no celular, reordena por dia (manhã e tarde de cada dia juntas)
    if (matchMedia('(max-width: 760px)').matches) {
      const sem = area.querySelector('.semana');
      const cabs = [...sem.querySelectorAll('.cab-dia')];
      const slots = [...sem.querySelectorAll('.slot')];
      const porPeriodo = slots.length / 5;
      sem.innerHTML = '';
      cabs.forEach((c, i) => { sem.appendChild(c); for (let k = 0; k < porPeriodo; k++) sem.appendChild(slots[k * 5 + i]); });
    }
  }

  function desenharMes() {
    const sem = R.semanasDoMes(st.ref);
    el.querySelector('#titulo-periodo').textContent = nomeMes(st.ref);
    const mapa = {};
    for (const it of st.itens) mapa[`${it.data}|${it.periodo}`] = it;
    let h = '<div class="mes">' + ['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => `<div class="cab-dia">${d}</div>`).join('');
    for (const semana of sem) {
      for (const { data, foraDoMes } of semana) {
        h += `<div class="dia-mes ${foraDoMes ? 'fora' : ''} ${data === hoje ? 'hoje' : ''}"><span class="num">${Number(data.slice(8))}</span>`;
        for (const p of ['manha', 'tarde']) {
          if (st.filtros.periodo && st.filtros.periodo !== p) continue;
          const it = mapa[`${data}|${p}`];
          const sigla = p === 'manha' ? 'M' : 'T';
          if (it) {
            if (!visivel(it)) continue;
            h += `<button class="ms s-${it.situacao}" data-item="${it.origem}|${it.id}|${p}" title="${esc(R.SITUACOES[it.situacao]?.rotulo)}">${sigla} ${esc(it.obra_nome || it.categoria)}</button>`;
          } else if (!passou(data, p) && filtroLivre() && !st.filtros.obra && !st.filtros.categoria) {
            h += `<button class="ms s-disponivel" data-livre="${data}|${p}">${sigla} Disponível</button>`;
          }
        }
        h += '</div>';
      }
    }
    area.innerHTML = h + '</div>';
  }

  function desenharLista() {
    el.querySelector('#titulo-periodo').textContent = nomeMes(st.ref);
    const [ini, fim] = intervalo();
    const mapa = {};
    for (const it of st.itens) mapa[`${it.data}|${it.periodo}`] = it;
    let h = '<div class="lista-agenda">';
    let algum = false;
    for (let d = ini; d <= fim; d = R.somarDias(d, 1)) {
      if (!R.ehDiaUtil(d)) continue;
      let linhas = '';
      for (const p of ['manha', 'tarde']) {
        if (st.filtros.periodo && st.filtros.periodo !== p) continue;
        const it = mapa[`${d}|${p}`];
        if (it) {
          if (!visivel(it)) continue;
          linhas += `<div class="item" data-item="${it.origem}|${it.id}|${p}" role="button" tabindex="0">
            <div><b>${R.PERIODOS[p].rotulo}</b><br><small>${R.PERIODOS[p].horario}</small></div>
            <div><b>${esc(it.obra_nome || (it.origem === 'bloqueio' ? 'Bloqueado' : it.categoria))}</b><br>
              <span class="muted">${esc(it.origem === 'solicitacao' ? `${it.categoria} — ${it.descricao}` : it.descricao)}</span>
              ${it.solicitante_nome ? `<br><small>Solicitante: ${esc(it.solicitante_nome)}</small>` : ''}</div>
            <div>${badgeSituacao(it.situacao)} ${badgePrioridade(it.prioridade)}</div></div>`;
        } else if (filtroLivre() && !st.filtros.obra && !st.filtros.categoria && !passou(d, p) && (st.filtros.situacao === 'disponivel' || !temFiltro() || st.filtros.periodo)) {
          linhas += `<div class="item" data-livre="${d}|${p}" role="button" tabindex="0">
            <div><b>${R.PERIODOS[p].rotulo}</b><br><small>${R.PERIODOS[p].horario}</small></div>
            <div class="muted">Período livre${podeSolicitar() ? ' — toque para solicitar' : ''}</div><div>${badgeSituacao('disponivel')}</div></div>`;
        }
      }
      if (linhas) { algum = true; h += `<div class="grupo-dia">${esc(nomeDia(d))}, ${fmtData(d)}${d === hoje ? ' (hoje)' : ''}</div>${linhas}`; }
    }
    area.innerHTML = algum ? h + '</div>' : vazio('Nenhum item encontrado com os filtros escolhidos.');
  }

  function desenhar() {
    if (st.modo === 'semana') desenharSemana();
    else if (st.modo === 'mes') desenharMes();
    else desenharLista();
  }

  async function abrirItem(origem, id, periodo) {
    const it = st.itens.find((x) => x.origem === origem && x.id === id && x.periodo === periodo);
    if (!it) return;
    let corpo;
    if (origem === 'solicitacao') {
      corpo = `<p>${badgeSituacao(it.situacao)} ${badgePrioridade(it.prioridade)}</p><dl class="detalhes">
        <div><dt>Solicitação</dt><dd>nº ${esc(it.numero)}</dd></div>
        <div><dt>Data e período</dt><dd>${fmtData(it.data)} (${esc(nomeDiaCurto(it.data))}) — ${esc(fmtPeriodo(it.periodo))}</dd></div>
        <div><dt>Obra</dt><dd>${esc(it.obra_nome)}</dd></div>
        <div><dt>Endereço</dt><dd>${mapaLink(it.obra_endereco)}</dd></div>
        <div><dt>Responsável da obra</dt><dd>${esc(it.obra_responsavel)} · ${telLink(it.obra_telefone)}</dd></div>
        ${it.contato1_nome ? `<div><dt>Contato</dt><dd>${esc(it.contato1_nome)} · ${telLink(it.contato1_telefone)}</dd></div>` : ''}
        ${it.contato2_nome ? `<div><dt>Contato</dt><dd>${esc(it.contato2_nome)} · ${telLink(it.contato2_telefone)}</dd></div>` : ''}
        <div><dt>Solicitante</dt><dd>${esc(it.solicitante_nome)}</dd></div>
        <div><dt>Categoria</dt><dd>${esc(it.categoria)}</dd></div>
        <div><dt>Descrição da atividade</dt><dd>${esc(it.descricao)}</dd></div>
        ${it.local_especifico ? `<div><dt>Local na obra</dt><dd>${esc(it.local_especifico)}</dd></div>` : ''}
        ${it.observacoes ? `<div><dt>Observações</dt><dd>${esc(it.observacoes)}</dd></div>` : ''}
        ${it.execucao_inicio ? `<div><dt>Início do atendimento</dt><dd>${fmtDataHora(it.execucao_inicio)}</dd></div>` : ''}
        ${it.execucao_fim ? `<div><dt>Fim do atendimento</dt><dd>${fmtDataHora(it.execucao_fim)}</dd></div>` : ''}
      </dl>`;
    } else {
      corpo = `<p>${badgeSituacao(it.situacao)}</p><dl class="detalhes">
        <div><dt>Data e período</dt><dd>${fmtData(it.data)} — ${esc(fmtPeriodo(it.periodo))}</dd></div>
        <div><dt>${origem === 'bloqueio' ? 'Motivo do bloqueio' : esc(it.categoria)}</dt><dd>${esc(it.descricao)}</dd></div>
        ${it.obra_responsavel ? `<div><dt>Empresa</dt><dd>${esc(it.obra_responsavel)} ${telLink(it.obra_telefone)}</dd></div>` : ''}
        ${it.obra_endereco ? `<div><dt>Endereço</dt><dd>${mapaLink(it.obra_endereco)}</dd></div>` : ''}
        ${it.observacoes ? `<div><dt>Observações</dt><dd>${esc(it.observacoes)}</dd></div>` : ''}</dl>`;
    }
    const podeAbrir = origem === 'solicitacao' && (ehAdmin() || it.solicitante_id === estado.usuario.id);
    const r = await janela({
      titulo: origem === 'solicitacao' ? `Atividade — ${it.obra_nome}` : origem === 'bloqueio' ? 'Período bloqueado' : 'Caminhão indisponível',
      corpo,
      botoes: [{ texto: 'Fechar', valor: null, classe: 'btn-sec' },
        ...(podeAbrir ? [{ texto: 'Abrir solicitação', valor: 'abrir', classe: 'btn-pri' }] : []),
        ...(ehAdmin() && origem !== 'solicitacao' ? [{ texto: origem === 'bloqueio' ? 'Gerenciar bloqueios' : 'Gerenciar manutenções', valor: 'gerir', classe: 'btn-pri' }] : [])],
    });
    if (r?.valor === 'abrir') location.hash = `#/solicitacoes/${id}`;
    if (r?.valor === 'gerir') location.hash = origem === 'bloqueio' ? '#/bloqueios' : '#/manutencoes';
  }

  function clicarLivre(data, periodo) {
    if (!podeSolicitar()) return;
    const motivo = livreValido(data, periodo);
    if (motivo) { aviso(motivo + ` (Regra atual: solicitar ${R.descreverAntecedencia(estado.config)}.)`, 'erro'); return; }
    location.hash = `#/solicitar?data=${data}&periodo=${periodo}`;
  }

  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modo]');
    if (m) { st.modo = m.dataset.modo; localStorage.setItem('cm-agenda-modo', st.modo); el.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativa', b === m)); carregar(); return; }
    const n = e.target.closest('[data-nav]');
    if (n) {
      const dir = Number(n.dataset.nav);
      if (dir === 0) st.ref = hoje;
      else if (st.modo === 'semana') st.ref = R.somarDias(st.ref, 7 * dir);
      else { const d = R.deISO(st.ref); st.ref = R.paraISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)); }
      area.innerHTML = carregando();
      carregar(); return;
    }
    const it = e.target.closest('[data-item]');
    if (it) { const [o, id, p] = it.dataset.item.split('|'); abrirItem(o, id, p); return; }
    const lv = e.target.closest('[data-livre]');
    if (lv) { const [d, p] = lv.dataset.livre.split('|'); clicarLivre(d, p); return; }
    if (e.target.id === 'limpar') { st.filtros = { obra: '', situacao: '', categoria: '', periodo: '' }; el.querySelectorAll('[data-f]').forEach((s) => { s.value = ''; }); desenhar(); }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.item')) e.target.click(); });
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st.filtros[s.dataset.f] = s.value; desenhar(); }));

  aoMudarAgenda(carregar);
  await carregar();
}
