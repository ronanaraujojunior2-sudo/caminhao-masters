// Exibição ÚNICA da chave pessoal de recuperação.
import { esc, baixarArquivo, aviso } from '../ui.js';

export function telaChave(chave, usuario, aoContinuar) {
  return {
    html: `<h1>Guarde sua chave de recuperação</h1>
      <div class="alerta alerta-aviso"><b>Esta chave será exibida somente agora.</b> Ela permite criar uma nova senha
      caso você a esqueça, sem precisar de e-mail. Anote em papel e guarde em local seguro, ou salve o arquivo.</div>
      <div class="chave-exibida" id="chave">${esc(chave)}</div>
      <p class="muted">Usuário: <b>${esc(usuario)}</b></p>
      <div class="barra-acoes">
        <button type="button" class="btn btn-sec" id="copiar">Copiar chave</button>
        <button type="button" class="btn btn-sec" id="baixar">Baixar arquivo .txt</button>
      </div>
      <label class="check"><input type="checkbox" id="guardei"> Guardei minha chave em local seguro</label>
      <button type="button" class="btn btn-pri btn-grande btn-bloco" id="continuar" disabled>Continuar</button>
      <p class="muted"><small>Não compartilhe esta chave. O administrador não tem acesso a ela.</small></p>`,
    ligar(el) {
      el.querySelector('#copiar').onclick = async () => {
        try { await navigator.clipboard.writeText(chave); aviso('Chave copiada.'); } catch { aviso('Selecione a chave e copie manualmente.', 'info'); }
      };
      el.querySelector('#baixar').onclick = () => baixarArquivo(`chave-recuperacao-${usuario}.txt`,
        `CAMINHÃO MASTERS — CHAVE PESSOAL DE RECUPERAÇÃO\r\n\r\nUsuário: ${usuario}\r\nChave: ${chave}\r\nGerada em: ${new Date().toLocaleString('pt-BR')}\r\n\r\nGuarde em local seguro. Ela é necessária para recuperar a senha.\r\nApós usar, uma nova chave será gerada e esta deixará de valer.\r\n`, 'text/plain;charset=utf-8');
      el.querySelector('#guardei').onchange = (e) => { el.querySelector('#continuar').disabled = !e.target.checked; };
      el.querySelector('#continuar').onclick = aoContinuar;
    },
  };
}
