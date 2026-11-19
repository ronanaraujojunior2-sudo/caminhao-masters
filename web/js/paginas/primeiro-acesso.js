import { sb, funcao, emailDe, msgErro } from '../api.js';
import { campoSenha, ativarOlhos, ocupado, lerForm, aviso } from '../ui.js';
import { validarSenha } from '../lib/regras.js';
import { telaAcesso } from './login.js';
import { telaChave } from './chave.js';
import { entrouNoSistema } from '../app.js';

export async function render(el, params) {
  el.innerHTML = telaAcesso(`
    <h1>Primeiro acesso</h1>
    <p class="muted">Use o <b>código de primeiro acesso</b> entregue pelo administrador e crie a sua senha.
    O código vale por 72 horas e só pode ser usado uma vez.</p>
    <form id="f" novalidate>
      <label class="campo"><span>Nome de usuário <b class="obr">*</b></span>
        <input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${params.u ? String(params.u).replace(/[^a-z0-9._-]/gi, '') : ''}"></label>
      <label class="campo"><span>Código de primeiro acesso <b class="obr">*</b></span>
        <input name="codigo" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required placeholder="XXXX-XXXX-XXXX"></label>
      ${campoSenha('senha', 'Crie sua senha', { auto: 'new-password', ajuda: 'Mínimo de 8 caracteres, com letras e números.' })}
      ${campoSenha('confirmacao', 'Repita a senha', { auto: 'new-password' })}
      <div id="erro" class="alerta alerta-erro" role="alert" hidden></div>
      <button class="btn btn-pri btn-grande btn-bloco" type="submit">Criar senha</button>
    </form>
    <div class="links-acesso"><a href="#/login">Voltar para o login</a></div>`);
  ativarOlhos(el);
  const f = el.querySelector('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = el.querySelector('#erro');
    const msg = !d.usuario || !d.codigo ? 'Preencha usuário e código.' : validarSenha(d.senha) || (d.senha !== d.confirmacao ? 'A confirmação não confere com a senha.' : null);
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    erro.hidden = true;
    ocupado(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await funcao('acesso', { acao: 'primeiro_acesso', usuario: d.usuario.toLowerCase(), codigo: d.codigo, senha: d.senha, confirmacao: d.confirmacao });
        const usuario = d.usuario.toLowerCase(), senha = d.senha;
        const t = telaChave(r.chave_recuperacao, usuario, () => ocupado(el.querySelector('#continuar'), async () => {
          try {
            const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password: senha });
            if (error) throw error;
            await entrouNoSistema();
            aviso('Senha criada com sucesso. Bem-vindo(a)!');
          } catch (ex) { aviso(msgErro(ex), 'erro'); location.hash = '#/login'; }
        }));
        el.querySelector('.cartao-acesso').innerHTML = t.html;
        t.ligar(el);
      } catch (ex) { erro.textContent = msgErro(ex); erro.hidden = false; }
    });
  });
}
