// IMPORTAR OBRAS DO SIENGE (somente administrador; tela Obras)
// Lê a relação de obras exportada pelo Sienge, do jeito que ela sai (.xlsx ou .csv),
// mostra uma prévia e só grava depois da confirmação. Nada é apagado.
import { sb, q, msgErro } from '../api.js';
import { esc, aviso, carregando, confirmar, fmtData, baixarArquivo } from '../ui.js';
import { lerPlanilha } from '../lib/planilha-leitor.js';
import { lerRelacaoDasAbas, planejar, montarEnvio, ROTULOS } from '../lib/obras-sienge.js';

const fmtValor = (k, v) => (!v ? '(vazio)' : k === 'data_cadastro' ? fmtData(v) : v);

// Relatório em CSV (abre no Excel): ponto e vírgula e marca UTF-8.
function csv(linhas) {
  const c = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\uFEFF' + linhas.map((l) => l.map(c).join(';')).join('\r\n');
}
const carimbo = () => new Date().toLocaleString('sv-SE').slice(0, 16).replace(/[-: ]/g, '');

export function abrirImportacao(area, aoConcluir) {
  let arquivo = null, plano = [], rejeitadas = [], linhaCab = 0, periodo = '', colunas = [];

  const fechar = () => { area.innerHTML = ''; };

  function inicio() {
    area.innerHTML = `<section class="cartao imp" aria-labelledby="imp-t">
      <h2 id="imp-t">Importar Obras do Sienge</h2>
      <p>Escolha a <b>relação de obras exportada pelo Sienge</b> (Excel .xlsx ou .csv), do jeito que ela saiu, sem mudar colunas. O sistema mostra uma <b>prévia antes de gravar</b>.</p>
      <ul class="imp-regras">
        <li>O <b>código da obra no Sienge</b> identifica cada obra: a mesma obra nunca é cadastrada duas vezes.</li>
        <li>Obra já cadastrada à mão com o mesmo nome recebe o código do Sienge, sem perder responsável, telefones e solicitações.</li>
        <li>O arquivo do Sienge não traz responsável nem telefones: as obras novas ficam com <b>“Responsável pendente”</b> até você completar.</li>
        <li>Nada é apagado, e campo vazio no arquivo nunca apaga o que já existe.</li>
      </ul>
      <div class="acoes-linha"><button type="button" class="btn btn-pri" id="imp-escolher">Escolher arquivo</button>
        <button type="button" class="btn btn-sec" id="imp-fechar">Fechar</button></div>
      <input type="file" id="imp-arquivo" accept=".xlsx,.csv" hidden>
      <div id="imp-corpo" aria-live="polite"></div></section>`;
    area.querySelector('#imp-escolher').onclick = () => area.querySelector('#imp-arquivo').click();
    area.querySelector('#imp-fechar').onclick = fechar;
    area.querySelector('#imp-arquivo').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ler(f); };
    area.scrollIntoView({ block: 'nearest' });
  }

  async function ler(f) {
    const corpo = area.querySelector('#imp-corpo');
    corpo.innerHTML = carregando('Lendo o arquivo…');
    try {
      const [abas, existentes] = await Promise.all([
        lerPlanilha(f),
        q(sb.from('obras').select('id, nome, codigo_sienge, cliente, situacao_sienge, dados_sienge, ativa')),
      ]);
      const R = lerRelacaoDasAbas(abas);
      arquivo = f; linhaCab = R.linhaCabecalho; rejeitadas = R.rejeitadas; periodo = R.periodo; colunas = R.colunas;
      plano = planejar(R.lidas, existentes);
      previa();
    } catch (e) {
      corpo.innerHTML = `<div class="alerta alerta-erro">${esc(e.message || msgErro(e))} Nada foi gravado.</div>`;
    }
  }

  const caixa = (p) => `<input type="checkbox" data-cod="${esc(p.codigo)}" ${p.marcada ? 'checked' : ''} aria-label="Incluir obra ${esc(p.codigo)}">`;
  const avisos = (p) => (p.avisos.length ? `<div class="imp-aviso">${p.avisos.map(esc).join('<br>')}</div>` : '');
  const difs = (p) => p.dif.map((d) => `<div><b>${esc(ROTULOS[d.k] || d.k)}:</b> ${esc(fmtValor(d.k, d.antes))} → ${esc(fmtValor(d.k, d.depois))}</div>`).join('');

  function bloco(titulo, ajuda, itens, colunas, linha, massa) {
    if (!itens.length) return '';
    return `<h3>${titulo} (${itens.length})</h3><p class="dica">${ajuda}</p>
      ${massa ? `<div class="acoes-linha"><button type="button" class="btn btn-sm btn-sec" data-massa="${massa}:1">Marcar todas</button><button type="button" class="btn btn-sm btn-sec" data-massa="${massa}:0">Desmarcar todas</button></div>` : ''}
      <div class="tabela-rolagem imp-tabela"><table class="tabela"><thead><tr>${colunas.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${itens.map(linha).join('')}</tbody></table></div>`;
  }

  function previa() {
    const corpo = area.querySelector('#imp-corpo');
    const por = (e) => plano.filter((p) => p.estado === e);
    const N = por('nova'), V = por('vincular'), A = por('atualizar'), I = por('igual');
    corpo.innerHTML = `<h3>Prévia — nada foi gravado ainda</h3>
      <p class="dica">Arquivo <b>${esc(arquivo.name)}</b>${periodo ? ` · período ${esc(periodo)}` : ''} · títulos na linha ${linhaCab} · ${plano.length + rejeitadas.length} obra(s) no arquivo.<br>
        Colunas reconhecidas: ${colunas.map(esc).join(', ')}.</p>
      <div class="imp-resumo">
        <div><b>${N.filter((p) => p.marcada).length}</b>Novas a cadastrar</div><div><b>${V.filter((p) => p.marcada).length}</b>Ligar a obra já cadastrada</div>
        <div><b>${A.filter((p) => p.marcada).length}</b>A atualizar</div><div><b>${I.length + plano.filter((p) => p.estado !== 'igual' && !p.marcada).length}</b>Ignoradas</div>
        <div class="${rejeitadas.length ? 'alerta-num' : ''}"><b>${rejeitadas.length}</b>Com erro</div></div>
      ${rejeitadas.length ? '<div class="acoes-linha"><button type="button" class="btn btn-sm btn-sec" id="imp-baixar-erros">Baixar relatório de erros (Excel/CSV)</button></div>' : ''}
      <p class="dica">O relatório do Sienge traz também centros de custo administrativos (ex.: diretoria, veículos). Desmarque os que não recebem o caminhão.
        Ignoradas = sem alteração ou desmarcadas; elas não são gravadas.</p>
      ${plano.length > 15 ? '<label class="campo imp-filtro"><span>Procurar nesta prévia</span><input type="search" id="imp-filtro" placeholder="Código, nome ou cliente"></label>' : ''}
      ${bloco('Obras novas', 'Serão cadastradas com o código e o nome do Sienge. Obras encerradas no Sienge vêm desmarcadas; se marcar, entram inativas.', N,
        ['Incluir', 'Código', 'Obra', 'Cliente', 'Situação no Sienge'],
        (p) => `<tr><td>${caixa(p)}</td><td>${esc(p.codigo)}</td><td>${esc(p.nome)}${avisos(p)}</td><td>${esc(p.cliente || '—')}</td><td>${esc(p.situacao || '—')}</td></tr>`, 'nova')}
      ${bloco('Ligar o código do Sienge a obra já cadastrada', 'Mesmo nome de uma obra cadastrada à mão. Ela recebe o código e os dados do Sienge; o resto continua igual.', V,
        ['Incluir', 'Código', 'No arquivo', 'No sistema'],
        (p) => `<tr><td>${caixa(p)}</td><td>${esc(p.codigo)}</td><td>${esc(p.nome)}</td><td>${esc(p.obra.nome)}${p.dif.length ? `<div class="imp-aviso">${difs(p)}</div>` : ''}</td></tr>`)}
      ${bloco('Obras já cadastradas com dados novos do Sienge', 'Somente cliente, situação e informações do Sienge que mudaram. Nome, responsável, telefones e situação no sistema não mudam. Desmarque o que não quiser atualizar.', A,
        ['Incluir', 'Obra', 'O que muda'],
        (p) => `<tr><td>${caixa(p)}</td><td>${esc(p.codigo)} · ${esc(p.obra.nome)}${avisos(p)}</td><td>${difs(p)}</td></tr>`)}
      ${rejeitadas.length ? `<h3>Com erro (${rejeitadas.length})</h3><p class="dica">Estas linhas não serão importadas:</p><ul class="imp-lista">${rejeitadas.map((r) => `<li>Linha ${r.linha}: ${esc(r.motivo)}</li>`).join('')}</ul>` : ''}
      ${I.length ? `<details><summary>Sem alteração (${I.length})</summary><ul class="imp-lista">${I.map((p) => `<li>${esc(p.codigo)} · ${esc(p.obra.nome)}${p.avisos.length ? ` — ${esc(p.avisos.join(' '))}` : ''}</li>`).join('')}</ul></details>` : ''}
      <div class="acoes-linha imp-fim"><button type="button" class="btn btn-sec" id="imp-cancelar">Cancelar</button>
        <button type="button" class="btn btn-pri" id="imp-confirmar"></button></div>`;
    atualizarBotao();
    corpo.querySelectorAll('input[data-cod]').forEach((c) => {
      c.onchange = () => { const p = plano.find((x) => x.codigo === c.dataset.cod); if (p) p.marcada = c.checked; atualizarBotao(); atualizarResumo(); };
    });
    corpo.querySelectorAll('[data-massa]').forEach((b) => {
      b.onclick = () => { const [estado, v] = b.dataset.massa.split(':'); plano.filter((p) => p.estado === estado).forEach((p) => { p.marcada = v === '1'; }); previa(); };
    });
    corpo.querySelector('#imp-cancelar').onclick = fechar;
    corpo.querySelector('#imp-baixar-erros')?.addEventListener('click', baixarErros);
    const filtro = corpo.querySelector('#imp-filtro');
    if (filtro) filtro.oninput = () => {
      const k = filtro.value.trim().toLowerCase();
      corpo.querySelectorAll('.imp-tabela tbody tr').forEach((tr) => { tr.hidden = !!k && !tr.textContent.toLowerCase().includes(k); });
    };
    corpo.querySelector('#imp-confirmar').onclick = gravar;
    corpo.scrollIntoView({ block: 'start' });
  }

  function atualizarResumo() {
    const r = area.querySelectorAll('.imp-resumo b'); if (r.length < 4) return;
    const m = (e) => plano.filter((p) => p.estado === e && p.marcada).length;
    r[0].textContent = m('nova'); r[1].textContent = m('vincular'); r[2].textContent = m('atualizar');
    r[3].textContent = plano.filter((p) => p.estado === 'igual' || !p.marcada).length;
  }

  function baixarErros() {
    baixarArquivo(`erros-importacao-obras-${carimbo()}.csv`, csv([['Linha no arquivo', 'Código', 'Obra', 'Motivo'],
      ...rejeitadas.map((r) => [r.linha, r.codigo || '', r.nome || '', r.motivo])]), 'text/csv;charset=utf-8');
  }

  function baixarRelatorio(d) {
    const res = new Map((d.resultados || []).map((r) => [r.codigo, r]));
    const txt = { nova: 'cadastrar', vincular: 'ligar código a obra existente', atualizar: 'atualizar dados' };
    const linhas = [['Linha no arquivo', 'Código', 'Obra', 'Resultado', 'Detalhe']];
    plano.forEach((p) => {
      const r = res.get(p.codigo);
      if (r) linhas.push([p.linha, p.codigo, p.nome, r.ok ? ({ cadastrar: 'Cadastrada', vincular: 'Código ligado', atualizar: 'Atualizada' })[r.acao] : 'Não aplicada', r.ok ? '' : r.motivo]);
      else linhas.push([p.linha, p.codigo, p.nome, 'Ignorada', p.estado === 'igual' ? 'Já cadastrada, sem alteração' : `Desmarcada na prévia (${txt[p.estado]})`]);
    });
    rejeitadas.forEach((r) => linhas.push([r.linha, r.codigo || '', r.nome || '', 'Com erro', r.motivo]));
    linhas.sort((a, b) => (a[0] === 'Linha no arquivo' ? -1 : b[0] === 'Linha no arquivo' ? 1 : a[0] - b[0]));
    baixarArquivo(`importacao-obras-${carimbo()}.csv`, csv(linhas), 'text/csv;charset=utf-8');
  }

  function atualizarBotao() {
    const b = area.querySelector('#imp-confirmar'); if (!b) return;
    const n = montarEnvio(plano).length;
    b.textContent = n ? `Confirmar importação (${n} obra${n > 1 ? 's' : ''})` : 'Nada marcado para importar';
    b.disabled = !n;
  }

  async function gravar() {
    const envio = montarEnvio(plano);
    if (!envio.length) return;
    const c = (a) => envio.filter((e) => e.acao === a).length;
    const ok = await confirmar(`Gravar agora? Cadastrar ${c('cadastrar')} obra(s), ligar o código a ${c('vincular')} e atualizar ${c('atualizar')}. Nenhuma obra será apagada, e tudo fica registrado na auditoria.`,
      { titulo: 'Confirmar importação', textoOk: 'Gravar' });
    if (!ok) return;
    const b = area.querySelector('#imp-confirmar'); b.disabled = true; b.textContent = 'Gravando…';
    try {
      const { data, error } = await sb.rpc('importar_obras_sienge', { p_arquivo: arquivo.name, p_linhas: envio });
      if (error) throw error;
      resultado(data);
      aoConcluir?.();
    } catch (e) {
      aviso(msgErro(e), 'erro'); atualizarBotao();
    }
  }

  function resultado(d) {
    const falhas = (d.resultados || []).filter((r) => !r.ok);
    const enviados = new Set((d.resultados || []).map((r) => r.codigo));
    const ignoradas = plano.filter((p) => !enviados.has(p.codigo)).length;
    area.querySelector('#imp-corpo').innerHTML = `<h3>Importação concluída</h3>
      <div class="imp-resumo"><div><b>${d.cadastradas}</b>Novas cadastradas</div><div><b>${d.vinculadas}</b>Ligadas a obra existente</div>
        <div><b>${d.atualizadas}</b>Atualizadas</div><div><b>${ignoradas}</b>Ignoradas</div>
        <div class="${falhas.length + rejeitadas.length ? 'alerta-num' : ''}"><b>${falhas.length + rejeitadas.length}</b>Com erro</div></div>
      ${falhas.length ? `<ul class="imp-lista">${falhas.map((r) => `<li>${esc(r.codigo)} · ${esc(r.nome)} — ${esc(r.motivo)}</li>`).join('')}</ul>` : ''}
      <div class="acoes-linha"><button type="button" class="btn btn-sm btn-sec" id="imp-baixar-rel">Baixar relatório completo (Excel/CSV)</button></div>
      <p class="dica">Registrada na Auditoria com seu nome, data, hora e o nome do arquivo.${d.cadastradas ? ' Complete o responsável das obras novas pelo botão “Editar” (aparecem como “Responsável pendente”).' : ''}</p>
      <div class="acoes-linha"><button type="button" class="btn btn-pri" id="imp-ok">Fechar</button></div>`;
    area.querySelector('#imp-ok').onclick = fechar;
    area.querySelector('#imp-baixar-rel').onclick = () => baixarRelatorio(d);
    aviso('Importação de obras concluída.');
  }

  inicio();
}
