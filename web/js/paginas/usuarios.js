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
    <div class="abas" role="tablist" id="situacoes">
      <button data-sit="ativos" class="ativa" role="tab">Ativos <span class="contador" data-n="ativos"></span></button>
      <button data-sit="inativos" role="tab">Inativos <span class="contador" data-n="inativos"></span></button>
      <button data-sit="arquivados" role="tab">Arquivados <span class="contador" data-n="arquivados"></span></button></div>
    <div class="filtros"><label class="campo"><span>Buscar</span><input id="busca" placeholder="Nome ou usuário"></label></div><div id="lista">${carregando()}</div>`;
  let dados = [];
  let pagina = 0, busca = '', sit = 'ativos';
  // Enquanto o servidor processa, as ações da lista ficam bloqueadas (evita clique repetido)
  async function ocupado(fn) {
    const lista = el.querySelector('#lista');
    lista.classList.add('processando'); lista.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { lista.classList.remove('processando'); lista.removeAttribute('aria-busy'); }
  }
  const situacao = (u) => (u.arquivado_em || u.excluido_em ? 'arquivados' : u.ativo ? 'ativos' : 'inativos');
  async function carregar(manter) {
    if (!manter) pagina = 0;
    dados = await q(sb.from('perfis').select('*').order('nome_completo'));
    ['ativos', 'inativos', 'arquivados'].forEach((s) => { el.querySelector(`[data-n=${s}]`).textContent = dados.filter((u) => situacao(u) === s).length; });
    const f = dados.filter((u) => situacao(u) === sit && `${u.nome_completo} ${u.usuario} ${u.usuario_original || ''}`.toLowerCase().includes(busca.toLowerCase()));
    const pg = paginar(f, pagina);
    const selo = (u) => (u.excluido_em ? `<span class="badge badge-erro">Excluído — só histórico</span><br><small>em ${fmtDataHora(u.excluido_em)}</small>`
      : u.arquivado_em ? `<span class="badge">Arquivado</span><br><small>em ${fmtDataHora(u.arquivado_em)}</small>`
      : !u.ativo ? '<span class="badge badge-erro">Desativado</span>'
      : u.primeiro_acesso_pendente ? '<span class="badge badge-aviso">Aguardando primeiro acesso</span>' : '<span class="badge badge-ok">Ativo</span>');
    const acoes = (u) => {
      if (u.id === estado.usuario.id || u.excluido_em) return '';
      const b = [];
      if (!u.arquivado_em) b.push(`<button class="btn btn-sm btn-sec" data-editar="${u.id}">Editar</button>`);
      if (u.ativo) b.push(`<button class="btn btn-sm btn-sec" data-redefinir="${u.id}">Redefinir acesso</button>`,
        `<button class="btn btn-sm btn-sec" data-desativar="${u.id}">Desativar</button>`);
      else b.push(`<button class="btn btn-sm btn-pri" data-reativar="${u.id}">Reativar</button>`);
      if (!u.arquivado_em) b.push(`<button class="btn btn-sm btn-sec" data-arquivar="${u.id}">Arquivar</button>`);
      b.push(`<button class="btn btn-sm btn-perigo" data-excluir="${u.id}">Excluir usuário</button>`);
      return `<div class="acoes-celula">${b.join('')}</div>`;
    };
    const vazios = { ativos: 'Nenhum usuário ativo encontrado.', inativos: 'Nenhum usuário desativado.', arquivados: 'Nenhum usuário arquivado ou excluído.' };
    el.querySelector('#lista').innerHTML = (sit === 'arquivados' && f.length ? '<p class="dica">Arquivados não acessam o sistema e podem ser reativados. Excluídos permanecem apenas como registro histórico, para identificar o funcionário nos registros antigos.</p>' : '')
      + (f.length ? `<div class="tabela-rolagem"><table class="tabela responsiva"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>
      ${pg.itens.map((u) => `<tr><td data-r="Nome"><b>${esc(u.nome_completo)}</b>${u.id === estado.usuario.id ? ' (você)' : ''}</td>
      <td data-r="Usuário">${esc(u.excluido_em ? u.usuario_original || '—' : u.usuario)}</td>
      <td data-r="Perfil">${esc(nomePerfil(u.perfil))}</td>
      <td data-r="Situação">${selo(u)}</td>
      <td data-r="Cadastro">${fmtDataHora(u.criado_em)}</td>
      <td data-r="Ações">${acoes(u)}</td></tr>`).join('')}
      </tbody></table></div>${paginacaoHTML(pg)}` : vazio(vazios[sit]));
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
      if (t.dataset.desativar) {
        const u = dados.find((x) => x.id === t.dataset.desativar);
        const just = await pedirTexto({ titulo: `Desativar ${u.nome_completo}`, rotulo: 'Motivo', ajuda: 'O usuário perde o acesso imediatamente e continua na lista de Inativos. O histórico é mantido.', textoOk: 'Desativar', perigo: true });
        if (!just) return;
        await ocupado(() => funcao('usuarios', { acao: 'desativar', usuario_id: u.id, justificativa: just }, true));
        aviso('Usuário desativado.'); await carregar();
      }
      if (t.dataset.reativar) {
        const u = dados.find((x) => x.id === t.dataset.reativar);
        if (!(await confirmar(`Reativar ${u.nome_completo} (${u.usuario})? O acesso ao sistema volta a funcionar${u.arquivado_em ? ' e o usuário volta para a lista de Ativos' : ''}.`, { titulo: 'Reativar usuário', textoOk: 'Reativar' }))) return;
        await ocupado(() => funcao('usuarios', { acao: 'ativar', usuario_id: u.id }, true));
        aviso('Usuário reativado.'); await carregar();
      }
      if (t.dataset.arquivar) {
        const u = dados.find((x) => x.id === t.dataset.arquivar);
        const just = await pedirTexto({ titulo: `Arquivar ${u.nome_completo}`, rotulo: 'Motivo (opcional)', obrigatorio: false,
          ajuda: 'Sai da lista de usuários ativos e perde o acesso. Fica em “Arquivados” e pode ser reativado quando necessário. Nada do histórico é apagado.', textoOk: 'Arquivar' });
        if (just === null) return;
        await ocupado(() => funcao('usuarios', { acao: 'arquivar', usuario_id: u.id, justificativa: just }, true));
        aviso('Usuário arquivado.'); await carregar();
      }
      if (t.dataset.excluir) {
        const u = dados.find((x) => x.id === t.dataset.excluir);
        const r = await janela({
          titulo: 'Excluir usuário',
          corpo: `<form><p>Você está excluindo o usuário:</p>
            <dl class="detalhes"><div><dt>Nome</dt><dd><b>${esc(u.nome_completo)}</b></dd></div><div><dt>Usuário</dt><dd>${esc(u.usuario)}</dd></div>
            <div><dt>Perfil</dt><dd>${esc(nomePerfil(u.perfil))}</dd></div></dl>
            <div class="alerta alerta-aviso">O acesso ao sistema é <b>apagado definitivamente</b>, junto com senha, chave de recuperação e notificações.
            <b>Solicitações, agendamentos, abastecimentos, atendimentos e demais registros NÃO são apagados</b>: se existirem, o nome do funcionário
            continua identificado neles como registro histórico. Esta ação não pode ser desfeita.</div>
            ${camposHTML([{ n: 'justificativa', t: 'Motivo (opcional)', max: 300 }])}
            <label class="check"><input type="checkbox" name="confirmo" required> Confirmo a exclusão de <b>${esc(u.nome_completo)}</b> <b class="obr">*</b></label></form>`,
          botoes: [{ texto: 'Voltar', valor: null, classe: 'btn-sec' }, { texto: 'Excluir usuário', valor: 'ok', classe: 'btn-perigo' }],
          validar: (d) => (!d.confirmo ? 'Marque a confirmação para excluir.' : null),
        });
        if (!r) return;
        aviso(`Excluindo ${u.nome_completo}…`, 'info');
        const res = await ocupado(() => funcao('usuarios', { acao: 'excluir', usuario_id: u.id, justificativa: r.dados.justificativa || '' }, true));
        await carregar();
        aviso(res.aviso || (res.modo === 'historico'
          ? `${u.nome_completo} foi excluído. Como possui registros no sistema, o nome foi mantido apenas como histórico (veja em Arquivados).`
          : `${u.nome_completo} foi excluído.`));
      }
    } catch (ex) { aviso(msgErro(ex), 'erro'); }
  });
  el.querySelector('#busca').oninput = (e) => { busca = e.target.value; carregar(); };
  el.querySelector('#situacoes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sit]'); if (!b) return;
    sit = b.dataset.sit; el.querySelectorAll('#situacoes button').forEach((x) => x.classList.toggle('ativa', x === b)); carregar();
  });
  await carregar();
}
