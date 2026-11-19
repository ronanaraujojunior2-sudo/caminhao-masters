import { sb, funcao, emailDe, msgErro } from '../api.js';
import { campoSenha, ativarOlhos, ocupado, lerForm, aviso } from '../ui.js';
import { validarSenha } from '../lib/regras.js';
import { telaAcesso } from './login.js';
import { telaChave } from './chave.js';
import { entrouNoSistema } from '../app.js';

export async function render(el) {
  el.innerHTML = telaAcesso(`
    <h1>Recuperar senha</h1>
    <p class="muted">Informe seu usuário, a <b>chave pessoal de recuperação</b> que você guardou no primeiro acesso e a nova senha.</p>
    <form id="f" novalidate>
      <label class="campo"><span>Nome de usuário <b class="obr">*</b></span>
        <input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="campo"><span>Chave pessoal de recuperação <b class="obr">*</b></span>
        <input name="chave" autocomplete="off" autocapitalize="characters" spellcheck="false" required placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>
      ${campoSenha('senha', 'Nova senha', { auto: 'new-password', ajuda: 'Mínimo de 8 caracteres, com letras e números.' })}
      ${campoSenha('confirmacao', 'Repita a nova senha', { auto: 'new-password' })}
      <div id="erro" class="alerta alerta-erro" role="alert" hidden></div>
      <button class="btn btn-pri btn-grande btn-bloco" type="submit">Redefinir senha</button>
    </form>
    <details class="cartao" style="margin-top:1rem"><summary><b>Perdi a senha e também a chave</b></summary>
      <p>Por segurança, nesse caso a recuperação é feita <b>pessoalmente</b>: procure o administrador do sistema com um
      documento oficial com foto. Após confirmar sua identidade, ele gera um novo código de primeiro acesso
      (válido por 72 horas). O administrador nunca vê nem define a sua senha, e o procedimento fica registrado na auditoria.</p>
    </details>
    <div class="links-acesso"><a href="#/login">Voltar para o login</a></div>`);
  ativarOlhos(el);
  const f = el.querySelector('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = el.querySelector('#erro');
    const msg = !d.usuario || !d.chave ? 'Preencha usuário e chave.' : validarSenha(d.senha) || (d.senha !== d.confirmacao ? 'A confirmação não confere com a senha.' : null);
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    erro.hidden = true;
    ocupado(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await funcao('acesso', { acao: 'recuperar', usuario: d.usuario.toLowerCase(), chave: d.chave, senha: d.senha, confirmacao: d.confirmacao });
        const usuario = d.usuario.toLowerCase(), senha = d.senha;
        const t = telaChave(r.chave_recuperacao, usuario, () => ocupado(el.querySelector('#continuar'), async () => {
          try {
            const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password: senha });
            if (error) throw error;
            await entrouNoSistema();
            aviso('Senha redefinida. Todas as outras sessões foram encerradas.');
          } catch (ex) { aviso(msgErro(ex), 'erro'); location.hash = '#/login'; }
        }));
        el.querySelector('.cartao-acesso').innerHTML = `<div class="alerta alerta-info">Senha alterada. Sua chave anterior
          <b>deixou de valer</b>. Abaixo está a sua NOVA chave.</div>` + t.html;
        t.ligar(el);
      } catch (ex) { erro.textContent = msgErro(ex); erro.hidden = false; }
    });
  });
}
