// Caminhão Masters — inicialização, navegação e layout por perfil.
import { sb, estado, configurado, carregarSessao, sair, caminhaoAtual, selecionarCaminhao, msgErro } from './api.js';
import { esc, aviso, ICONES, carregando, opcoes } from './ui.js';
import { iniciarTempoReal, pararTempoReal, atualizarSino, atualizarIndicador, abrirPainelSincronizacao, limparOuvintes, fila } from './sync.js';

// arquivo da página, perfis com acesso (vazio = página pública)
const ROTAS = {
  'login':           { arq: 'login', publica: true },
  'primeiro-acesso': { arq: 'primeiro-acesso', publica: true },
  'recuperar':       { arq: 'recuperar', publica: true },
  'instalacao':      { arq: 'instalacao', publica: true },
  'painel':          { arq: 'painel', perfis: ['admin'] },
  'motorista':       { arq: 'motorista', perfis: ['motorista', 'admin'] },
  'agenda':          { arq: 'agenda', perfis: ['admin', 'solicitante', 'motorista'] },
  'solicitar':       { arq: 'solicitar', perfis: ['admin', 'solicitante'] },
  'solicitacoes':    { arq: 'solicitacoes', perfis: ['admin', 'solicitante'] },
  'bloqueios':       { arq: 'bloqueios', perfis: ['admin'] },
  'manutencoes':     { arq: 'manutencoes', perfis: ['admin'] },
  'diario':          { arq: 'diario', perfis: ['admin', 'motorista'] },
  'ocorrencias':     { arq: 'ocorrencias', perfis: ['admin'] },
  'documentos':      { arq: 'documentos', perfis: ['admin', 'motorista'] },
  'obras':           { arq: 'obras', perfis: ['admin'] },
  'caminhoes':       { arq: 'caminhoes', perfis: ['admin'] },
  'usuarios':        { arq: 'usuarios', perfis: ['admin'] },
  'auditoria':       { arq: 'auditoria', perfis: ['admin'] },
  'configuracoes':   { arq: 'configuracoes', perfis: ['admin'] },
  'notificacoes':    { arq: 'notificacoes', perfis: ['admin', 'solicitante', 'motorista'] },
  'conta':           { arq: 'conta', perfis: ['admin', 'solicitante', 'motorista'] },
};

// Menu no padrão Masters: itens soltos no topo e grupos recolhíveis (›).
// [rota, rótulo] = item; [grupo, título, [itens]] = grupo; '*rota' = botão de destaque vermelho.
const APLICATIVO = ['app', 'Aplicativo', [['notificacoes', 'Notificações'], ['conta', 'Minha conta e senha'], ['!instalar', 'Instalar aplicativo']]];
const MENUS = {
  admin: [
    ['painel', 'Painel geral'], ['agenda', 'Agenda do caminhão'], ['solicitacoes', 'Solicitações'], ['*solicitar', 'Solicitar caminhão'],
    ['operacao', 'Operação', [['bloqueios', 'Bloqueios'], ['manutencoes', 'Manutenções'], ['diario', 'Diário de Bordo'], ['ocorrencias', 'Ocorrências'],
      ['documentos', 'Documentos e vencimentos']]],
    ['cadastros', 'Cadastros', [['obras', 'Obras'], ['caminhoes', 'Caminhões'], ['usuarios', 'Usuários']]],
    ['admin', 'Administração', [['configuracoes', 'Configurações'], ['auditoria', 'Auditoria']]],
    APLICATIVO,
  ],
  solicitante: [['agenda', 'Agenda do caminhão'], ['solicitacoes', 'Minhas solicitações'], ['*solicitar', 'Solicitar caminhão'], APLICATIVO],
  motorista: [['motorista', 'Meu dia'], ['agenda', 'Agenda do caminhão'],
    ['operacao', 'Operação', [['diario', 'Diário de Bordo'], ['documentos', 'Documentos']]], APLICATIVO],
};
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const gruposAbertos = new Set(JSON.parse(localStorage.getItem('cm-menu-abertos') || '[]'));

export const inicioDoPerfil = () => ({ admin: '#/painel', motorista: '#/motorista', solicitante: '#/agenda' }[estado.perfil?.perfil] || '#/login');

const LOGO = '<img src="assets/logo-masters.png" alt="Masters Engenharia" class="logo-img">';
// Se a logomarca original ainda não foi colocada em web/assets/logo-masters.png, mostra um espaço reservado.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.classList?.contains('logo-img')) {
    const s = document.createElement('span');
    s.className = 'logo-reservado';
    s.title = 'Espaço reservado: coloque o arquivo ORIGINAL da logomarca em web/assets/logo-masters.png';
    s.innerHTML = 'LOGO<br>MASTERS';
    img.replaceWith(s);
  }
}, true);
export { LOGO };

function itemMenu([r, t]) {
  const cta = r.startsWith('*'), acao = r.startsWith('!');
  const rota = r.replace(/^[*!]/, '');
  if (acao) return `<button type="button" class="nav" data-acao-menu="${rota}">${esc(t)}</button>`;
  const cont = rota === 'solicitacoes' && estado.perfil.perfil === 'admin' ? ' <span id="pendentes-contador" class="contador" hidden></span>' : '';
  return `<a href="#/${rota}" data-rota="${rota}" class="nav${cta ? ' cta' : ''}">${esc(t)}${cont}</a>`;
}

function menuHTML() {
  return (MENUS[estado.perfil.perfil] || []).map((x) => (Array.isArray(x[2])
    ? `<div class="mg" data-g="${x[0]}"><button type="button" class="mg-h" id="mgh-${x[0]}" aria-controls="mgb-${x[0]}" aria-expanded="false"><span>${esc(x[1])}</span>${CHEV}</button>
       <div class="mg-b" id="mgb-${x[0]}" role="group" aria-labelledby="mgh-${x[0]}" hidden>${x[2].map(itemMenu).join('')}</div></div>`
    : itemMenu(x))).join('');
}

function aplicarGrupos(rotaAtual) {
  document.querySelectorAll('#menu .mg').forEach((g) => {
    const ativa = !!g.querySelector(`[data-rota="${rotaAtual}"]`);
    if (ativa) gruposAbertos.add(g.dataset.g);
    const aberta = gruposAbertos.has(g.dataset.g);
    g.classList.toggle('ativa', ativa);
    g.classList.toggle('aberta', aberta);
    g.querySelector('.mg-h').setAttribute('aria-expanded', String(aberta));
    g.querySelector('.mg-b').hidden = !aberta;
  });
}

const ehCelular = () => matchMedia('(max-width: 820px)').matches;
function temaEscuroAtivo() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
export function alternarTema() {
  const novo = temaEscuroAtivo() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', novo);
  try { localStorage.setItem('cm-tema', novo); } catch { /* */ }
}

// ---------- instalação como aplicativo (PWA) ----------
let pedidoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalacao = e; });
window.addEventListener('appinstalled', () => { pedidoInstalacao = null; aviso('Aplicativo instalado. Procure o ícone "Caminhão Masters" na tela inicial.'); });
export async function instalarApp() {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return aviso('O Caminhão Masters já está aberto como aplicativo instalado.', 'info');
  if (pedidoInstalacao) {
    pedidoInstalacao.prompt();
    const r = await pedidoInstalacao.userChoice.catch(() => null);
    pedidoInstalacao = null;
    if (r?.outcome === 'accepted') aviso('Instalando…');
    return;
  }
  const { janela } = await import('./ui.js');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  janela({
    titulo: 'Instalar o Caminhão Masters',
    corpo: ios
      ? `<ol><li>Abra este endereço no <b>Safari</b>.</li><li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li>
         <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li><li>Abra pelo ícone <b>Caminhão Masters</b> que aparece na tela inicial.</li></ol>`
      : `<ol><li>No <b>Chrome</b> (Android ou computador) ou no <b>Edge</b>, abra o menu <b>⋮</b> (ou <b>…</b>).</li>
         <li>Toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme em <b>Instalar</b>.</li>
         <li>Abra pelo ícone <b>Caminhão Masters</b>.</li></ol><p class="muted">Se a opção não aparecer, recarregue a página e aguarde alguns segundos.</p>`,
    botoes: [{ texto: 'Entendi', valor: null, classe: 'btn-pri' }],
  });
}

function montarLayout() {
  const p = estado.perfil;
  const seletor = estado.caminhoes.length > 1
    ? `<label class="seletor-caminhao"><span class="sr">Caminhão</span><select id="sel-caminhao">${opcoes(estado.caminhoes.map((c) => [c.id, `${c.nome} · ${c.placa}`]), estado.caminhaoId)}</select></label>`
    : `<span class="caminhao-nome">${esc(caminhaoAtual() ? `${caminhaoAtual().nome} · ${caminhaoAtual().placa}` : 'Nenhum caminhão cadastrado')}</span>`;
  const nomePerfil = { admin: 'Administrador', solicitante: 'Solicitante', motorista: 'Motorista' }[p.perfil];
  document.getElementById('raiz').innerHTML = `
    <div class="layout">
      <aside class="lateral" id="lateral" aria-label="Menu principal">
        <button type="button" class="menu-fechar" id="menu-fechar" aria-label="Fechar menu">✕</button>
        <a href="${inicioDoPerfil()}" class="marca">${LOGO}</a>
        <div class="sistema-nome"><img src="assets/caminhao-munck.svg" alt="" class="marca-produto">Caminhão Masters</div>
        <nav id="menu">${menuHTML()}</nav>
        <div class="versao">Versão 1.5.3</div>
      </aside>
      <div class="lateral-fundo" id="lateral-fundo"></div>
      <main class="principal">
        <div class="topo">
          <button class="ico" id="menu-botao" aria-label="Abrir ou recolher o menu" aria-expanded="false">☰</button>
          <button class="ico" id="tema" aria-label="Alternar modo claro e escuro" title="Modo claro/escuro">◐</button>
          <div class="topo-centro">${seletor}<span id="tempo-real" class="tempo-real off" title="Tempo real"></span></div>
          <button id="sync-indicador" class="sync" hidden></button>
          <a href="#/notificacoes" class="ico" aria-label="Notificações" title="Notificações">${ICONES.sino}<span id="sino-contador" class="contador" hidden></span></a>
          <div class="who"><b>${esc(p.nome_completo)}</b>${esc(nomePerfil)}</div>
          <a class="sec so-pc" href="#/conta">Minha senha</a>
          <button class="sec" id="btn-sair">Sair</button>
        </div>
        <div id="conteudo" tabindex="-1"></div>
      </main>
    </div>`;
  document.getElementById('btn-sair').onclick = async () => {
    const { confirmar } = await import('./ui.js');
    if (!(await confirmar('Deseja sair do Caminhão Masters neste aparelho?', { titulo: 'Sair', textoOk: 'Sair' }))) return;
    await pararTempoReal(); sair();
  };
  document.getElementById('sync-indicador').onclick = abrirPainelSincronizacao;
  document.getElementById('tema').onclick = alternarTema;
  const mb = document.getElementById('menu-botao');
  const abrirCel = (abrir) => { document.body.classList.toggle('menu-aberto', abrir); mb.setAttribute('aria-expanded', String(abrir)); };
  mb.onclick = () => {
    if (ehCelular()) abrirCel(!document.body.classList.contains('menu-aberto'));
    else { const rec = document.body.classList.toggle('recolhido'); mb.setAttribute('aria-expanded', String(!rec)); try { localStorage.setItem('cm-menu-recolhido', rec ? '1' : ''); } catch { /* */ } }
  };
  if (!ehCelular() && localStorage.getItem('cm-menu-recolhido')) document.body.classList.add('recolhido');
  document.getElementById('menu-fechar').onclick = () => abrirCel(false);
  document.getElementById('lateral-fundo').onclick = () => abrirCel(false);
  const menu = document.getElementById('menu');
  menu.addEventListener('click', (e) => {
    const h = e.target.closest('.mg-h');
    if (h) {
      const k = h.parentNode.dataset.g;
      if (gruposAbertos.has(k)) gruposAbertos.delete(k); else gruposAbertos.add(k);
      try { localStorage.setItem('cm-menu-abertos', JSON.stringify([...gruposAbertos])); } catch { /* */ }
      aplicarGrupos(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]);
      return;
    }
    const acao = e.target.closest('[data-acao-menu]');
    if (acao?.dataset.acaoMenu === 'instalar') { abrirCel(false); instalarApp(); return; }
    if (e.target.closest('a.nav')) abrirCel(false);
  });
  const sel = document.getElementById('sel-caminhao');
  if (sel) sel.onchange = () => { selecionarCaminhao(sel.value); navegar(); };
  atualizarSino(); atualizarIndicador(); atualizarPendentes();
}

export async function atualizarPendentes() {
  const el = document.getElementById('pendentes-contador');
  if (!el) return;
  const { count } = await sb.from('solicitacoes').select('id', { count: 'exact', head: true }).in('status', ['pendente']);
  el.textContent = count || ''; el.hidden = !count;
}

let layoutMontado = false;
let versaoNavegacao = 0;

export async function navegar() {
  const v = ++versaoNavegacao;
  const hash = location.hash.replace(/^#\/?/, '') || '';
  const [caminho, query = ''] = hash.split('?');
  const [nome, ...resto] = caminho.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (resto.length) params.id = resto.join('/');

  if (!configurado) { document.getElementById('raiz').innerHTML = paginaNaoConfigurado(); return; }

  const rota = ROTAS[nome];
  if (!rota) { location.hash = estado.perfil ? inicioDoPerfil() : '#/login'; return; }

  if (rota.publica) {
    if (estado.perfil && nome !== 'instalacao') { location.hash = inicioDoPerfil(); return; }
    layoutMontado = false;
    limparOuvintes();
    const raiz = document.getElementById('raiz');
    raiz.innerHTML = carregando();
    const mod = await import(`./paginas/${rota.arq}.js`);
    if (v !== versaoNavegacao) return;
    raiz.innerHTML = '';
    await mod.render(raiz, params);
    return;
  }

  if (!estado.perfil) { location.hash = '#/login'; return; }
  if (!rota.perfis.includes(estado.perfil.perfil)) { aviso('Você não tem acesso a esta área.', 'erro'); location.hash = inicioDoPerfil(); return; }

  if (!layoutMontado) { montarLayout(); layoutMontado = true; iniciarTempoReal(); }
  document.querySelectorAll('#menu .nav[data-rota]').forEach((a) => a.classList.toggle('on', a.dataset.rota === nome));
  aplicarGrupos(nome);
  limparOuvintes();
  // contêiner novo a cada tela: descarta os eventos registrados pela tela anterior
  const antigo = document.getElementById('conteudo');
  const el = antigo.cloneNode(false);
  antigo.replaceWith(el);
  el.innerHTML = carregando();
  try {
    const mod = await import(`./paginas/${rota.arq}.js`);
    if (v !== versaoNavegacao) return;
    el.innerHTML = '';
    await mod.render(el, params);
    el.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (v === versaoNavegacao) el.innerHTML = `<div class="cartao erro-pagina"><h2>Não foi possível abrir esta tela</h2><p>${esc(msgErro(e))}</p><button class="btn btn-pri" data-recarregar>Tentar novamente</button></div>`;
  }
}

function paginaNaoConfigurado() {
  return `<div class="tela-acesso"><div class="cartao-acesso">${LOGO}<h1>Caminhão Masters</h1>
    <p class="alerta alerta-aviso">O sistema ainda não foi configurado. Abra o arquivo <code>web/js/config.js</code> e preencha
    <b>SUPABASE_URL</b> e <b>SUPABASE_KEY</b> conforme o <b>Manual de Implantação</b> (Etapa 4).</p></div></div>`;
}

/** Chamado após login bem-sucedido. */
export async function entrouNoSistema() {
  const ok = await carregarSessao();
  if (!ok) throw new Error('Não foi possível carregar seu perfil. Procure o administrador.');
  sb.rpc('registrar_login').then(() => {}, () => {});
  layoutMontado = false;
  location.hash = inicioDoPerfil();
  if (location.hash === inicioDoPerfil()) navegar();
}

async function iniciar() {
  if ('serviceWorker' in navigator) {
    // Atualização automática: quando uma versão nova do sistema é publicada, o service worker
    // novo assume e a tela recarrega uma única vez com os arquivos novos.
    const tinhaControlador = !!navigator.serviceWorker.controller;
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!tinhaControlador || recarregou) return;
      recarregou = true;
      try { sessionStorage.setItem('cm-atualizado', '1'); } catch { /* */ }
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      // confere se há versão nova ao voltar para o aplicativo e a cada 30 minutos
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch((e) => console.warn('SW', e));
    try { if (sessionStorage.getItem('cm-atualizado')) { sessionStorage.removeItem('cm-atualizado'); setTimeout(() => aviso('Sistema atualizado para a versão mais recente.'), 1200); } } catch { /* */ }
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.link) location.hash = e.data.link; });
  }
  if (configurado) {
    try { await carregarSessao(); } catch (e) { console.warn(e); }
    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && estado.perfil) { estado.perfil = null; layoutMontado = false; pararTempoReal(); location.hash = '#/login'; }
    });
    if (estado.perfil && navigator.onLine) fila.processar();
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-recarregar]')) location.reload(); });
  window.addEventListener('hashchange', navegar);
  navegar();
}

iniciar();
