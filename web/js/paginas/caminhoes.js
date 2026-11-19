// CADASTRO DE CAMINHÕES (estrutura pronta para vários)
import { sb, q, msgErro, carregarSessao } from '../api.js';
import { esc, vazio, carregando, janela, aviso, camposHTML, fmtNum, telLink, numero } from '../ui.js';

export async function render(el) {
  el.innerHTML = `<div class="cabecalho"><h1>Caminhões</h1><div class="acoes"><button class="btn btn-pri" id="novo">+ Novo caminhão</button></div></div>
    <div class="alerta alerta-info"><b>Responsável geral</b> pelo caminhão é quem responde pelo veículo na empresa. Ele é diferente do
    <b>administrador do sistema</b> e do <b>usuário logado</b> que executa cada ação (este é registrado automaticamente na auditoria).</div>
    <div id="lista">${carregando()}</div>`;
  let dados = [];
  async function carregar() {
    dados = await q(sb.from('caminhoes').select('*').order('nome'));
    el.querySelector('#lista').innerHTML = dados.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Nome</th><th>Placa</th><th>Marca/modelo</th><th>Ano</th><th>Responsável geral</th><th>KM atual</th><th>Situação</th><th></th></tr></thead><tbody>
      ${dados.map((c) => `<tr><td data-r="Nome"><b>${esc(c.nome)}</b></td><td data-r="Placa">${esc(c.placa)}</td><td data-r="Marca/modelo">${esc(c.marca_modelo)}</td><td data-r="Ano">${esc(c.ano_modelo || '—')}</td>
      <td data-r="Responsável">${esc(c.responsavel_nome)}<br>${telLink(c.responsavel_telefone)}</td><td data-r="KM">${fmtNum(c.km_atual)}</td>
      <td data-r="Situação"><span class="badge ${c.ativo ? 'badge-ok' : 'st-concluida'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td><button class="btn btn-sm btn-sec" data-editar="${c.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum caminhão. Cadastre o caminhão Munck para começar a usar a agenda.');
  }
  async function form(c = { ativo: true }) {
    const r = await janela({
      titulo: c.id ? 'Editar caminhão' : 'Novo caminhão',
      corpo: `<form>${camposHTML([
        { n: 'nome', t: 'Nome', obr: true, ajuda: 'Ex.: Munck 01' }, { n: 'placa', t: 'Placa', obr: true, max: 10, attrs: 'style="text-transform:uppercase"' },
        { n: 'marca_modelo', t: 'Marca/modelo', obr: true }, { n: 'ano_modelo', t: 'Ano/modelo', max: 20 },
        { n: 'responsavel_nome', t: 'Responsável geral pelo caminhão', obr: true }, { n: 'responsavel_telefone', t: 'Telefone do responsável', tipo: 'tel' },
        { n: 'km_atual', t: 'KM atual', tipo: 'number', ajuda: 'Atualizado automaticamente pelo Diário de Bordo.' },
        { n: 'ativo', t: 'Caminhão ativo', tipo: 'checkbox' }], c)}</form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
      validar: (d) => (Number.isNaN(numero(d.km_atual)) ? 'KM inválido.' : null),
    });
    if (!r) return;
    const d = { ...r.dados, placa: r.dados.placa.toUpperCase(), km_atual: numero(r.dados.km_atual) ?? 0, ano_modelo: r.dados.ano_modelo || null, responsavel_telefone: r.dados.responsavel_telefone || null };
    try {
      await q(c.id ? sb.from('caminhoes').update(d).eq('id', c.id) : sb.from('caminhoes').insert(d));
      await carregarSessao();
      aviso('Caminhão salvo.'); carregar();
    } catch (ex) { aviso(/duplicate|já existe/i.test(ex.message) ? 'Já existe um caminhão com esta placa.' : msgErro(ex), 'erro'); }
  }
  el.addEventListener('click', (e) => {
    if (e.target.id === 'novo') form();
    if (e.target.dataset.editar) form(dados.find((c) => c.id === e.target.dataset.editar));
  });
  await carregar();
}
