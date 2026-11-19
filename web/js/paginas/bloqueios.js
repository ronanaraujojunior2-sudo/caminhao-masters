// BLOQUEIOS DE AGENDA (manhã, tarde ou dia inteiro; sempre com motivo)
import { sb, q, estado, caminhaoAtual, msgErro, offsetFuso } from '../api.js';
import { esc, fmtData, fmtPeriodo, fmtDataHora, opcoes, vazio, carregando, janela, aviso, pedirTexto, camposHTML } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { hojeNoFuso, ehDiaUtil } from '../lib/regras.js';
import { aoMudarAgenda } from '../sync.js';

export async function render(el) {
  const cam = caminhaoAtual();
  if (!cam) { el.innerHTML = `<h1>Bloqueios</h1>${vazio('Cadastre um caminhão primeiro.')}`; return; }
  let verAntigos = false;
  el.innerHTML = `<div class="cabecalho"><h1>Bloqueios da agenda</h1><div class="acoes"><button class="btn btn-pri" id="novo">+ Novo bloqueio</button></div></div>
    <div class="alerta alerta-info">Use para dias em que o caminhão não poderá atender (feriado, uso interno etc.). Não é possível bloquear um período
    com solicitação pendente ou aprovada — resolva o conflito antes. Para manutenção, lavagem e serviços, use <a href="#/manutencoes">Manutenções</a>.</div>
    <label class="check"><input type="checkbox" id="antigos"> Mostrar bloqueios passados e removidos</label>
    <div id="lista">${carregando()}</div>`;
  let pagina = 0;
  async function carregar(manter) {
    if (!manter) pagina = 0;
    let c = sb.from('bloqueios').select('*, autor:perfis!bloqueios_criado_por_fkey(nome_completo)').eq('caminhao_id', cam.id).order('data', { ascending: !verAntigos });
    if (!verAntigos) c = c.eq('ativo', true).gte('data', hojeNoFuso(Date.now(), offsetFuso()));
    const dados = await q(c.limit(1000));
    const pg = paginar(dados, pagina);
    el.querySelector('#lista').innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Data</th><th>Período</th><th>Motivo</th><th>Criado por</th><th>Situação</th><th></th></tr></thead><tbody>
      ${pg.itens.map((b) => `<tr><td data-r="Data">${fmtData(b.data)}</td><td data-r="Período">${esc(fmtPeriodo(b.periodo))}</td><td data-r="Motivo">${esc(b.motivo)}</td>
      <td data-r="Criado por">${esc(b.autor?.nome_completo || '—')}<br><small>${fmtDataHora(b.criado_em)}</small></td>
      <td data-r="Situação">${b.ativo ? '<span class="badge sit-bloqueado">Ativo</span>' : `<span class="badge st-cancelada">Removido</span><br><small>${esc(b.motivo_remocao || '')}</small>`}</td>
      <td>${b.ativo ? `<button class="btn btn-sm btn-sec" data-remover="${b.id}">Remover</button>` : ''}</td></tr>`).join('')}</tbody></table></div>${paginacaoHTML(pg)}` : vazio('Nenhum bloqueio ativo.');
  }
  el.querySelector('#antigos').onchange = (e) => { verAntigos = e.target.checked; carregar(); };
  el.addEventListener('click', async (e) => {
    const pb = e.target.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    if (e.target.id === 'novo') {
      const r = await janela({
        titulo: 'Novo bloqueio',
        corpo: `<form>${camposHTML([
          { n: 'data', t: 'Data', tipo: 'date', obr: true, attrs: `min="${hojeNoFuso(Date.now(), offsetFuso())}"` },
          { n: 'periodo', t: 'Período', tipo: 'select', obr: true, opcoes: [['manha', 'Manhã (07h–12h)'], ['tarde', 'Tarde (13h–17h)'], ['dia', 'Dia inteiro']] },
          { n: 'motivo', t: 'Motivo', tipo: 'textarea', obr: true, linhas: 2 },
        ])}</form>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Bloquear', valor: 'ok' }],
        validar: (d) => (!ehDiaUtil(d.data) ? 'Escolha um dia de segunda a sexta-feira.' : (d.motivo || '').length < 3 ? 'Informe o motivo.' : null),
      });
      if (!r) return;
      try {
        await q(sb.from('bloqueios').insert({ caminhao_id: cam.id, data: r.dados.data, periodo: r.dados.periodo, motivo: r.dados.motivo, criado_por: estado.usuario.id }));
        aviso('Período bloqueado. Os usuários foram notificados.'); carregar();
      } catch (ex) { aviso(msgErro(ex), 'erro'); }
    }
    const id = e.target.dataset.remover;
    if (id) {
      const t = await pedirTexto({ titulo: 'Remover bloqueio', rotulo: 'Motivo da remoção', textoOk: 'Remover bloqueio', perigo: true });
      if (!t) return;
      try { await q(sb.from('bloqueios').update({ ativo: false, motivo_remocao: t }).eq('id', id)); aviso('Bloqueio removido. Período liberado.'); carregar(); }
      catch (ex) { aviso(msgErro(ex), 'erro'); }
    }
  });
  aoMudarAgenda(() => carregar(true));
  await carregar();
}
