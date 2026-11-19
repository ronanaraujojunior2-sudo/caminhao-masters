// USUÁRIOS — cadastro sem e-mail, código de primeiro acesso, redefinição excepcional segura
import { sb, q, estado, funcao, msgErro } from '../api.js';
import { esc, vazio, carregando, janela, aviso, camposHTML, fmtDataHora, confirmar, pedirTexto } from '../ui.js';
import { paginar, paginacaoHTML } from '../ui.js';
import { validarUsuario } from '../lib/regras.js';

const PERFIS = [['solicitante', 'Solicitante'], ['motorista', 'Motorista'], ['admin', 'Administrador']];
const nomePerfil = (p) => PERFIS.find((x) => x[0] === p)?.[1] || p;

function mostrarCodigo(r, titulo) {
  return janela({
    titulo,
    corpo: `<p>Entregue estas informações <b>pessoalmente</b> ao funcionário:</p>
      <dl class="detalhes"><div><dt>Endereço do sistema</dt><dd>${esc(location.origin + location.pathname)}</dd></div>
      <div><dt>Nome de usuário</dt><dd>${esc(r.usuario)}</dd></div></dl>
      <p>Código de primeiro acesso (válido por ${r.validade_horas} horas, uso único):</p>
      <div class="chave-exibida">${esc(r.codigo_primeiro_acesso)}</div>
      <div class="alerta alerta-aviso" style="margin-top:1rem">Este código <b>não será exibido novamente</b>. No primeiro acesso, o funcionário cria a
      própria senha (que você nunca verá) e recebe a chave pessoal de recuperação.</div>`,
    botoes: [{ texto: 'Já anotei', valor: null, classe: 'btn-pri' }],
  });
}

export async function render(el) {
  el.innerHTML = `<div class="cabecalho"><h1>Usuários</h1><div class="acoes"><button class="btn btn-pri" id="novo">+ Novo usuário</button></div></div>
    <div class="alerta alerta-info">O administrador cadastra nome, usuário e perfil. <b>Nenhum e-mail é necessário.</b> O sistema gera um código de primeiro acesso;
    o funcionário cria a própria senha. Administradores nunca veem senhas.</div>
    <div class="filtros"><label class="campo"><span>Buscar</span><input id="busca" placeholder="Nome ou usuário"></label></div><div id="lista">${carregando()}</div>`;
  let dados = [];
  let pagina = 0, busca = '';
  async function carregar(manter) {
    if (!manter) pagina = 0;
    dados = await q(sb.from('perfis').select('*').order('nome_completo'));
    const f = dados.filter((u) => `${u.nome_completo} ${u.usuario}`.toLowerCase().includes(busca.toLowerCase()));
    const pg = paginar(f, pagina);
    el.querySelector('#lista').innerHTML = f.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Cadastro</th><th></th></tr></thead><tbody>
      ${pg.itens.map((u) => `<tr><td data-r="Nome"><b>${esc(u.nome_completo)}</b>${u.id === estado.usuario.id ? ' (você)' : ''}</td><td data-r="Usuário">${esc(u.usuario)}</td>
      <td data-r="Perfil">${esc(nomePerfil(u.perfil))}</td>
      <td data-r="Situação">${!u.ativo ? '<span class="badge badge-erro">Desativado</span>' : u.primeiro_acesso_pendente ? '<span class="badge badge-aviso">Aguardando primeiro acesso</span>' : '<span class="badge badge-ok">Ativo</span>'}</td>
      <td data-r="Cadastro">${fmtDataHora(u.criado_em)}</td>
      <td>${u.id === estado.usuario.id ? '' : `<button class="btn btn-sm btn-sec" data-editar="${u.id}">Editar</button>
        <button class="btn btn-sm btn-sec" data-redefinir="${u.id}">Redefinir acesso</button>
        <button class="btn btn-sm ${u.ativo ? 'btn-perigo' : 'btn-pri'}" data-alternar="${u.id}">${u.ativo ? 'Desativar' : 'Reativar'}</button>`}</td></tr>`).join('')}
      </tbody></table></div>${paginacaoHTML(pg)}` : vazio('Nenhum usuário encontrado.');
  }
  el.addEventListener('click', async (e) => {
    const t = e.target;
    const pb = t.closest('[data-pagina]');
    if (pb) { pagina = Number(pb.dataset.pagina); return carregar(true); }
    try {
      if (t.id === 'novo') {
        const r = await janela({
          titulo: 'Novo usuário',
          corpo: `<form>${camposHTML([
            { n: 'nome_completo', t: 'Nome completo', obr: true, max: 120 },
            { n: 'usuario', t: 'Nome de usuário (para entrar no sistema)', obr: true, max: 40, ajuda: 'Ex.: joao.silva — minúsculas, números, ponto, hífen ou sublinhado; sem espaços e sem acentos. Não pode ser alterado depois.', attrs: 'autocapitalize="none" spellcheck="false"' },
            { n: 'perfil', t: 'Perfil', tipo: 'select', obr: true, opcoes: PERFIS, vazio: 'Selecione' }])}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Cadastrar', valor: 'ok' }],
          validar: (d) => validarUsuario(d.usuario.toLowerCase()) || (!d.perfil ? 'Selecione o perfil.' : null),
        });
        if (!r) return;
        const res = await funcao('usuarios', { acao: 'criar', ...r.dados, usuario: r.dados.usuario.toLowerCase() }, true);
        await carregar();
        await mostrarCodigo(res, 'Usuário cadastrado');
      }
      if (t.dataset.editar) {
        const u = dados.find((x) => x.id === t.dataset.editar);
        const r = await janela({
          titulo: `Editar — ${u.usuario}`,
          corpo: `<form>${camposHTML([{ n: 'nome_completo', t: 'Nome completo', obr: true, max: 120 }, { n: 'perfil', t: 'Perfil', tipo: 'select', obr: true, opcoes: PERFIS }], u)}
            <p class="muted"><small>O nome de usuário não pode ser alterado.</small></p></form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Salvar', valor: 'ok' }],
        });
        if (!r) return;
        await q(sb.from('perfis').update({ nome_completo: r.dados.nome_completo, perfil: r.dados.perfil }).eq('id', u.id));
        aviso('Usuário atualizado.'); carregar();
      }
      if (t.dataset.redefinir) {
        const u = dados.find((x) => x.id === t.dataset.redefinir);
        const r = await janela({
          titulo: `Redefinir acesso — ${u.nome_completo}`,
          corpo: `<form><div class="alerta alerta-aviso">Use somente quando o funcionário <b>perdeu a senha E a chave de recuperação</b>.
            Antes, confirme a identidade <b>pessoalmente</b> com documento oficial com foto. A senha e a chave atuais deixam de valer,
            todas as sessões são encerradas e a operação fica registrada na auditoria.</div>
            <label class="check"><input type="checkbox" name="presencial" required> Confirmei a identidade pessoalmente, com documento oficial com foto</label>
            ${camposHTML([{ n: 'justificativa', t: 'Como a identidade foi confirmada e motivo', tipo: 'textarea', obr: true, ajuda: 'Ex.: Apresentou RG nº final 123 presencialmente no escritório; perdeu celular com a chave.' }])}</form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Gerar novo código de acesso', valor: 'ok', classe: 'btn-perigo' }],
          validar: (d) => (!d.presencial ? 'Confirme a verificação presencial de identidade.' : d.justificativa.length < 10 ? 'Descreva a confirmação de identidade (mínimo 10 caracteres).' : null),
        });
        if (!r) return;
        const res = await funcao('usuarios', { acao: 'redefinir', usuario_id: u.id, justificativa: r.dados.justificativa }, true);
        await carregar();
        await mostrarCodigo(res, 'Acesso redefinido');
      }
      if (t.dataset.alternar) {
        const u = dados.find((x) => x.id === t.dataset.alternar);
        let justificativa = '';
        if (u.ativo) {
          justificativa = await pedirTexto({ titulo: `Desativar ${u.nome_completo}`, rotulo: 'Motivo', ajuda: 'O usuário perde o acesso imediatamente. O histórico é mantido.', textoOk: 'Desativar', perigo: true });
          if (!justificativa) return;
        } else if (!(await confirmar(`Reativar ${u.nome_completo}?`))) return;
        await funcao('usuarios', { acao: u.ativo ? 'desativar' : 'ativar', usuario_id: u.id, justificativa }, true);
        aviso(u.ativo ? 'Usuário desativado.' : 'Usuário reativado.'); carregar();
      }
    } catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  el.querySelector('#busca').oninput = (e) => { busca = e.target.value; carregar(); };
  await carregar();
}
