// AUDITORIA — somente leitura (nenhum usuário pode alterar ou apagar)
import { sb, q } from '../api.js';
import { esc, fmtDataHora, opcoes, carregando, vazio, janela, baixarArquivo, rotulo } from '../ui.js';
import { criarXLSX } from '../lib/xlsx.js';
import { paraISO } from '../lib/regras.js';

const TABELAS = ['solicitacoes', 'bloqueios', 'atividades_operacionais', 'perfis', 'obras', 'caminhoes', 'categorias', 'configuracoes', 'despesas',
  'documentos', 'planos_manutencao', 'expedientes', 'checklists', 'atendimentos', 'abastecimentos', 'ocorrencias', 'anexos'];
const ACOES = [['insert', 'Inclusão'], ['update', 'Alteração'], ['delete', 'Exclusão'], ['login', 'Login'], ['primeiro_acesso', 'Primeiro acesso'],
  ['recuperacao_senha', 'Recuperação de senha'], ['alteracao_senha', 'Alteração de senha'], ['cadastro_usuario', 'Cadastro de usuário'],
  ['redefinicao_acesso', 'Redefinição de acesso'], ['desativacao_usuario', 'Desativação de usuário'], ['ativacao_usuario', 'Ativação de usuário']];
const POR_PAGINA = 50;

export async function render(el) {
  const st = { tabela: '', acao: '', usuario: '', de: paraISO(new Date(Date.now() - 30 * 864e5)), ate: paraISO(new Date()), pagina: 0 };
  const usuarios = await q(sb.from('perfis').select('id, nome_completo').order('nome_completo'));
  el.innerHTML = `<div class="cabecalho"><h1>Auditoria</h1><div class="acoes"><button class="btn btn-sec" id="exportar">Exportar Excel</button></div></div>
    <p class="muted">Registro automático e imutável. O autor de cada ação vem da sessão autenticada, nunca de campo digitado.</p>
    <div class="filtros">
      <label class="campo"><span>Registro</span><select data-f="tabela">${opcoes(TABELAS.map((t) => [t, rotulo(t)]), '', 'Todos')}</select></label>
      <label class="campo"><span>Ação</span><select data-f="acao">${opcoes(ACOES, '', 'Todas')}</select></label>
      <label class="campo"><span>Usuário</span><select data-f="usuario">${opcoes(usuarios.map((u) => [u.id, u.nome_completo]), '', 'Todos')}</select></label>
      <label class="campo"><span>De</span><input type="date" data-f="de" value="${st.de}"></label>
      <label class="campo"><span>Até</span><input type="date" data-f="ate" value="${st.ate}"></label></div>
    <div id="lista">${carregando()}</div>`;
  let dados = [];
  const consulta = (limite, inicio = 0) => {
    let c = sb.from('auditoria').select('*', { count: 'exact' }).gte('criado_em', st.de + 'T00:00:00').lte('criado_em', st.ate + 'T23:59:59')
      .order('criado_em', { ascending: false }).range(inicio, inicio + limite - 1);
    if (st.tabela) c = c.eq('tabela', st.tabela);
    if (st.acao) c = c.eq('acao', st.acao);
    if (st.usuario) c = c.eq('usuario_id', st.usuario);
    return c;
  };
  async function carregar() {
    const { data, count, error } = await consulta(POR_PAGINA, st.pagina * POR_PAGINA);
    if (error) { el.querySelector('#lista').innerHTML = `<div class="alerta alerta-erro">${esc(error.message)}</div>`; return; }
    dados = data;
    const paginas = Math.max(1, Math.ceil((count || 0) / POR_PAGINA));
    el.querySelector('#lista').innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Justificativa</th></tr></thead><tbody>
      ${dados.map((a, i) => `<tr class="clicavel" data-i="${i}" tabindex="0"><td data-r="Data">${fmtDataHora(a.criado_em)}</td><td data-r="Usuário">${esc(a.usuario_nome || '—')}</td>
        <td data-r="Ação">${esc(ACOES.find((x) => x[0] === a.acao)?.[1] || a.acao)}</td><td data-r="Registro">${rotulo(a.tabela || '')}</td><td data-r="Justificativa">${esc(a.justificativa || '')}</td></tr>`).join('')}
      </tbody></table></div><nav class="paginacao" aria-label="Paginação"><span>${st.pagina * POR_PAGINA + 1}–${Math.min(count, (st.pagina + 1) * POR_PAGINA)} de ${count}</span>
      <button type="button" class="mini" data-pag="-1" ${st.pagina ? '' : 'disabled'}>‹ Anterior</button><span>Página ${st.pagina + 1} de ${paginas}</span>
      <button type="button" class="mini" data-pag="1" ${st.pagina + 1 < paginas ? '' : 'disabled'}>Próxima ›</button></nav>` : vazio('Nenhum registro.');
  }
  el.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-pag]');
    if (p) { st.pagina += Number(p.dataset.pag); return carregar(); }
    const tr = e.target.closest('tr[data-i]');
    if (tr) {
      const a = dados[tr.dataset.i];
      janela({ titulo: 'Detalhe da auditoria', largura: 'larga', corpo: `<dl class="detalhes"><div><dt>Data/hora</dt><dd>${fmtDataHora(a.criado_em)}</dd></div>
        <div><dt>Usuário</dt><dd>${esc(a.usuario_nome || '—')}</dd></div><div><dt>Ação</dt><dd>${esc(a.acao)}</dd></div>
        <div><dt>Registro</dt><dd>${esc(a.tabela)} · ${esc(a.registro_id)}</dd></div><div><dt>Justificativa</dt><dd>${esc(a.justificativa || '—')}</dd></div></dl>
        <div class="grade grade-2"><div><h3>Valor anterior</h3><pre class="diff">${esc(JSON.stringify(a.valor_anterior, null, 2) || '—')}</pre></div>
        <div><h3>Valor novo</h3><pre class="diff">${esc(JSON.stringify(a.valor_novo, null, 2) || '—')}</pre></div></div>` });
    }
    if (e.target.id === 'exportar') {
      const { data } = await consulta(5000);
      const linhas = [['Data/hora', 'Usuário', 'Ação', 'Registro', 'ID', 'Justificativa', 'Valor anterior', 'Valor novo'],
        ...(data || []).map((a) => [fmtDataHora(a.criado_em), a.usuario_nome, a.acao, a.tabela, a.registro_id, a.justificativa,
          a.valor_anterior ? JSON.stringify(a.valor_anterior) : '', a.valor_novo ? JSON.stringify(a.valor_novo) : ''])];
      baixarArquivo(`auditoria-${st.de}-a-${st.ate}.xlsx`, criarXLSX([{ nome: 'Auditoria', linhas, larguras: [17, 24, 18, 20, 38, 30, 50, 50] }]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-i]')) e.target.click(); });
  el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; st.pagina = 0; carregar(); }));
  await carregar();
}
