// Instalação: cria o ADMINISTRADOR INICIAL (só funciona enquanto não existir nenhum admin).
import { funcao, msgErro } from '../api.js';
import { campoSenha, ativarOlhos, ocupado, lerForm, esc } from '../ui.js';
import { validarUsuario } from '../lib/regras.js';
import { telaAcesso } from './login.js';

export async function render(el) {
  el.innerHTML = telaAcesso(`
    <h1>Instalação — administrador inicial</h1>
    <div class="alerta alerta-info">Use esta tela <b>uma única vez</b>, na implantação. Ela só funciona enquanto não houver
    nenhum administrador e exige o <b>token de instalação</b> configurado no Supabase (segredo BOOTSTRAP_TOKEN).</div>
    <form id="f" novalidate>
      ${campoSenha('token', 'Token de instalação', { auto: 'off' })}
      <label class="campo"><span>Nome completo do administrador <b class="obr">*</b></span><input name="nome_completo" required></label>
      <label class="campo"><span>Nome de usuário <b class="obr">*</b></span>
        <input name="usuario" autocapitalize="none" spellcheck="false" required placeholder="ex.: masters.admin">
        <small>Letras minúsculas, números, ponto, hífen ou sublinhado. Sem espaços e sem acentos.</small></label>
      <div id="erro" class="alerta alerta-erro" role="alert" hidden></div>
      <button class="btn btn-pri btn-grande btn-bloco" type="submit">Criar administrador</button>
    </form>
    <div class="links-acesso"><a href="#/login">Ir para o login</a></div>`);
  ativarOlhos(el);
  const f = el.querySelector('#f');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = lerForm(f);
    d.usuario = (d.usuario || '').toLowerCase();
    const erro = el.querySelector('#erro');
    const msg = !d.token ? 'Informe o token.' : (d.nome_completo || '').length < 3 ? 'Informe o nome completo.' : validarUsuario(d.usuario);
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    ocupado(f.querySelector('[type=submit]'), async () => {
      try {
        const r = await funcao('usuarios', { acao: 'bootstrap', ...d });
        el.querySelector('.cartao-acesso').innerHTML = `<h1>Administrador criado</h1>
          <p>Usuário: <b>${esc(r.usuario)}</b></p>
          <p>Código de primeiro acesso (válido por ${r.validade_horas} horas):</p>
          <div class="chave-exibida">${esc(r.codigo_primeiro_acesso)}</div>
          <div class="alerta alerta-aviso" style="margin-top:1rem"><b>Agora:</b> 1) anote o código; 2) no Supabase, APAGUE o segredo
          BOOTSTRAP_TOKEN; 3) clique abaixo para fazer o primeiro acesso e criar a senha.</div>
          <a class="btn btn-pri btn-grande btn-bloco" href="#/primeiro-acesso?u=${encodeURIComponent(r.usuario)}">Fazer primeiro acesso</a>`;
      } catch (ex) { erro.textContent = msgErro(ex); erro.hidden = false; }
    });
  });
}
