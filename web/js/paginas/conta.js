// MINHA CONTA — alterar senha (com olho), notificações push
import { estado, funcao, sb, emailDe, msgErro } from '../api.js';
import { esc, campoSenha, ativarOlhos, lerForm, ocupado, aviso } from '../ui.js';
import { validarSenha } from '../lib/regras.js';
import { ativarNotificacoes, desativarPush, pushSuportado, pushConfigurado } from '../sync.js';

export async function render(el) {
  const p = estado.perfil;
  const perm = 'Notification' in window ? Notification.permission : 'indisponivel';
  el.innerHTML = `<div class="cabecalho"><h1>Minha conta</h1></div>
    <section class="cartao"><dl class="detalhes"><div><dt>Nome</dt><dd>${esc(p.nome_completo)}</dd></div><div><dt>Usuário</dt><dd>${esc(p.usuario)}</dd></div>
      <div><dt>Perfil</dt><dd>${esc({ admin: 'Administrador', solicitante: 'Solicitante', motorista: 'Motorista' }[p.perfil])}</dd></div></dl></section>
    <form id="f-senha" class="cartao" novalidate><h2>Alterar senha</h2>
      ${campoSenha('senha_atual', 'Senha atual')}
      ${campoSenha('senha_nova', 'Nova senha', { auto: 'new-password', ajuda: 'Mínimo de 8 caracteres, com letras e números.' })}
      ${campoSenha('confirmacao', 'Repita a nova senha', { auto: 'new-password' })}
      <div id="erro" class="alerta alerta-erro" hidden></div>
      <button class="btn btn-pri" type="submit">Alterar senha</button>
      <p class="muted"><small>Por segurança, as sessões abertas em outros aparelhos serão encerradas.</small></p></form>
    <section class="cartao"><h2>Notificações no celular e no computador</h2>
      <p>Situação: <b>${perm === 'granted' ? 'Permitidas' : perm === 'denied' ? 'Bloqueadas no navegador' : perm === 'indisponivel' ? 'Não suportadas neste navegador' : 'Ainda não autorizadas'}</b>.
      ${pushSuportado() && pushConfigurado() ? 'Você receberá avisos mesmo com o sistema fechado.' : 'Os avisos aparecem enquanto o sistema estiver aberto (o envio com o sistema fechado depende de configuração do administrador).'}</p>
      <p class="muted"><small>No iPhone: abra no Safari, toque em Compartilhar → "Adicionar à Tela de Início" e ative as notificações pelo app instalado (iOS 16.4 ou superior).</small></p>
      <div class="barra-acoes"><button class="btn btn-pri" id="ativar">Ativar notificações</button>${pushSuportado() && pushConfigurado() ? '<button class="btn btn-sec" id="desativar">Desativar neste aparelho</button>' : ''}</div></section>
    <section class="cartao"><h2>Chave de recuperação</h2><p>Sua chave pessoal foi exibida uma única vez no primeiro acesso (ou na última recuperação).
      Se perdeu a chave, mas ainda sabe a senha, nada muda: continue entrando normalmente. Se perder senha e chave, procure o administrador pessoalmente.</p></section>`;
  ativarOlhos(el);
  const f = el.querySelector('#f-senha');
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = el.querySelector('#erro');
    const msg = !d.senha_atual ? 'Informe a senha atual.' : validarSenha(d.senha_nova) || (d.senha_nova !== d.confirmacao ? 'A confirmação não confere.' : d.senha_nova === d.senha_atual ? 'A nova senha deve ser diferente da atual.' : null);
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    erro.hidden = true;
    ocupado(f.querySelector('[type=submit]'), async () => {
      try {
        await funcao('acesso', { acao: 'alterar_senha', senha_atual: d.senha_atual, senha_nova: d.senha_nova, confirmacao: d.confirmacao }, true);
        const { error } = await sb.auth.signInWithPassword({ email: emailDe(p.usuario), password: d.senha_nova });
        if (error) throw error;
        f.reset(); aviso('Senha alterada com sucesso.');
      } catch (ex) { erro.textContent = msgErro(ex); erro.hidden = false; }
    });
  };
  el.querySelector('#ativar').onclick = async (e) => {
    await ocupado(e.target, async () => {
      try { const modo = await ativarNotificacoes(); aviso(modo === 'push' ? 'Notificações ativadas neste aparelho.' : 'Notificações ativadas enquanto o sistema estiver aberto.'); render(el); }
      catch (ex) { aviso(msgErro(ex), 'erro'); }
    });
  };
  el.querySelector('#desativar')?.addEventListener('click', async () => { await desativarPush(); aviso('Notificações push desativadas neste aparelho.'); });
}
