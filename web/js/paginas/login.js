import { sb, emailDe, msgErro } from '../api.js';
import { campoSenha, ativarOlhos, aviso, ocupado, lerForm } from '../ui.js';
import { entrouNoSistema, LOGO, instalarApp } from '../app.js';

export function telaAcesso(conteudo) {
  return `<div class="tela-acesso"><div class="cartao-acesso">${LOGO}${conteudo}</div></div>`;
}

export async function render(el) {
  el.innerHTML = telaAcesso(`
    <h1>Entrar no Caminhão Masters</h1>
    <p class="sub">Agenda e gestão do caminhão Munck</p>
    <form id="f-login" novalidate>
      <label class="campo"><span>Nome de usuário</span>
        <input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        <small>Digite só o seu usuário, sem e-mail.</small></label>
      ${campoSenha('senha', 'Senha')}
      <div id="erro" class="alerta alerta-erro" role="alert" hidden></div>
      <button class="btn btn-pri btn-grande btn-bloco" type="submit">Entrar</button>
    </form>
    <div class="links-acesso">
      <a href="#/recuperar">Esqueceu sua senha?</a>
      <a href="#/primeiro-acesso">Primeiro acesso (recebi um código do administrador)</a>
      <button type="button" class="link" id="instalar">Instalar aplicativo no celular</button>
    </div>`);
  ativarOlhos(el);
  el.querySelector('#instalar').onclick = instalarApp;
  const f = el.querySelector('#f-login');
  f.usuario.focus();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const { usuario, senha } = lerForm(f);
    const erro = el.querySelector('#erro');
    erro.hidden = true;
    if (!usuario || !senha) { erro.textContent = 'Informe usuário e senha.'; erro.hidden = false; return; }
    ocupado(f.querySelector('button[type=submit]'), async () => {
      try {
        const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password: senha });
        if (error) throw error;
        await entrouNoSistema();
        aviso('Bem-vindo(a)!');
      } catch (ex) {
        erro.textContent = msgErro(ex); erro.hidden = false;
      }
    });
  });
}
