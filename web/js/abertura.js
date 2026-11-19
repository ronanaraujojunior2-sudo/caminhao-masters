// =====================================================================
// ABERTURA DO CAMINHÃO MASTERS
// O caminhão Munck entra, o braço hidráulico pega a logo oficial da
// Masters Engenharia (imagem original, sem nenhuma alteração), coloca-a
// na carroceria e o caminhão sai. O sistema carrega por trás ao mesmo tempo.
// - Uma vez por sessão (não repete a cada navegação).
// - Toque, clique, Esc ou “Pular” encerram na hora.
// - Não aparece para quem configurou “reduzir movimento” no aparelho.
// - Desenho vetorial (SVG) + requestAnimationFrame: leve, nítido em qualquer tela.
// =====================================================================
(function abertura() {
  const CHAVE = 'cm-abertura-vista';
  let reduzir = false;
  try {
    reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sessionStorage.getItem(CHAVE) || reduzir) return;
    sessionStorage.setItem(CHAVE, '1');
  } catch { return; }

  const NS = 'http://www.w3.org/2000/svg';
  const LOGO_L = 130, LOGO_A = 130 * 87 / 389;      // proporção original da logo (389 × 87)
  const CHAO = 300;
  const P = { x: 250, y: 196 };                      // pivô do guindaste (coordenadas do caminhão)
  const BASE = 140;                                  // lança recolhida
  const LINGA = 24;                                  // altura das lingas (cabos que seguram a logo)
  const PARADA = 240;                                // posição do caminhão parado

  const fundo = document.createElement('div');
  fundo.className = 'abertura';
  fundo.setAttribute('role', 'presentation');
  fundo.innerHTML = `
  <svg class="abertura-cena" viewBox="0 0 900 360" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="ab-cab" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3D4BA0"/><stop offset="1" stop-color="#262F6B"/></linearGradient>
      <linearGradient id="ab-vidro" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#C9D4F2"/><stop offset="1" stop-color="#7F8DC4"/></linearGradient>
      <linearGradient id="ab-g-lanca" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D5DAE6"/></linearGradient>
    </defs>
    <line x1="-50" y1="${CHAO + 0.5}" x2="950" y2="${CHAO + 0.5}" class="ab-chao"/>
    <g class="ab-pista">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 90}" y="${CHAO + 14}" width="44" height="3" rx="1.5"/>`).join('')}</g>
    <g id="ab-caminhao">
      <rect x="10" y="248" width="352" height="14" rx="3" fill="#20264F"/>
      <rect x="10" y="232" width="226" height="16" rx="2" fill="#2B3470"/>
      <rect x="10" y="232" width="226" height="4" fill="#FC0A0B"/>
      ${[16, 70, 124, 178, 228].map((x) => `<rect x="${x}" y="220" width="5" height="14" rx="1" fill="#2B3470"/>`).join('')}
      <rect x="236" y="204" width="30" height="46" rx="3" fill="#3A4256"/>
      <rect x="242" y="190" width="18" height="16" rx="3" fill="#4A5370"/>
      <path d="M268 262 V182 Q268 170 280 170 H330 Q342 170 348 182 L362 214 Q366 222 366 232 V262 Z" fill="url(#ab-cab)"/>
      <path d="M318 178 H330 Q338 178 342 186 L354 214 H318 Z" fill="url(#ab-vidro)"/>
      <rect x="278" y="180" width="34" height="30" rx="4" fill="url(#ab-vidro)" opacity=".85"/>
      <rect x="268" y="236" width="98" height="5" fill="#FC0A0B"/>
      <rect x="356" y="244" width="12" height="8" rx="2" fill="#FFE9A8"/>
      <rect x="296" y="252" width="22" height="6" rx="2" fill="#151A3A"/>
      ${[70, 122, 330].map((x) => `<g class="ab-roda" data-x="${x}" transform="translate(${x} 278)"><circle r="22" fill="#151A26"/><circle r="12" fill="#8D96AD"/><circle r="4" fill="#151A26"/>${[0, 72, 144, 216, 288].map((a) => `<rect x="-1.5" y="-11" width="3" height="5" fill="#151A26" transform="rotate(${a})"/>`).join('')}</g>`).join('')}
    </g>
    <line id="ab-cilindro" class="ab-cilindro" x1="0" y1="0" x2="0" y2="0"/>
    <g id="ab-lanca">
      <rect id="ab-ext" x="${BASE - 30}" y="-6" width="40" height="12" rx="2" fill="#B8C0D2"/>
      <rect x="-12" y="-10" width="${BASE + 12}" height="20" rx="5" fill="url(#ab-g-lanca)" stroke="#313E86" stroke-width="1.5"/>
      <rect x="10" y="-2" width="${BASE - 30}" height="4" rx="2" fill="#FC0A0B"/>
      <circle r="9" fill="#313E86"/><circle r="3.5" fill="#FFFFFF"/>
    </g>
    <line id="ab-cabo" class="ab-cabo" x1="0" y1="0" x2="0" y2="0"/>
    <g id="ab-gancho"><rect x="-8" y="-6" width="16" height="10" rx="2" fill="#FC0A0B"/><path d="M0 4 V12 Q0 20 -6 20 Q-11 20 -11 15" fill="none" stroke="#E6E9F0" stroke-width="3" stroke-linecap="round"/></g>
    <g id="ab-logo">
      <line class="ab-linga" id="ab-l1" x1="0" y1="0" x2="0" y2="0"/><line class="ab-linga" id="ab-l2" x1="0" y1="0" x2="0" y2="0"/>
      <rect class="ab-placa" x="-3" y="-3" width="${LOGO_L + 6}" height="${LOGO_A + 6}" rx="4"/>
      <image href="assets/logo-masters.png" x="0" y="0" width="${LOGO_L}" height="${LOGO_A}" preserveAspectRatio="xMidYMid meet"/>
    </g>
  </svg>
  <div class="abertura-texto"><b>Caminhão Masters</b><span>Agenda e gestão do caminhão Munck</span></div>
  <button type="button" class="abertura-pular">Pular</button>`;
  document.body.appendChild(fundo);
  document.documentElement.classList.add('com-abertura');

  const $ = (id) => fundo.querySelector('#' + id);
  const svg = fundo.querySelector('svg');
  const caminhao = $('ab-caminhao'), lanca = $('ab-lanca'), ext = $('ab-ext'), cabo = $('ab-cabo'), gancho = $('ab-gancho');
  const cil = $('ab-cilindro'), logo = $('ab-logo'), l1 = $('ab-l1'), l2 = $('ab-l2');
  const rodas = [...fundo.querySelectorAll('.ab-roda')];
  if (matchMedia('(max-width: 640px)').matches) svg.setAttribute('viewBox', '205 10 640 340'); // enquadramento do celular

  // ---------- funções de tempo ----------
  const lim = (v) => Math.max(0, Math.min(1, v));
  const fase = (t, a, b) => lim((t - a) / (b - a));
  const suave = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const sai = (x) => 1 - Math.pow(1 - x, 3);
  const entra = (x) => x * x * x;
  const mix = (a, b, x) => a + (b - a) * x;
  const bez = (A, C, B, x) => ({ x: (1 - x) ** 2 * A.x + 2 * (1 - x) * x * C.x + x * x * B.x, y: (1 - x) ** 2 * A.y + 2 * (1 - x) * x * C.y + x * x * B.y });

  // pontos da ponta da lança (coordenadas da cena, com o caminhão parado)
  const PV = { x: PARADA + P.x, y: P.y };
  const DESCANSO = { x: PV.x - 142, y: P.y - 10 };
  const TRANSPORTE = { x: PV.x - 125, y: P.y - 48 };                      // lança erguida: gancho livre sobre a carga
  const LOGO_CHAO = { x: 760, y: CHAO - LOGO_A };                         // centro-topo da logo no chão
  const PEGAR = { x: LOGO_CHAO.x, y: 110 };
  const CARROCERIA_X = 118;                                              // centro da carroceria (coord. do caminhão)
  const LARGAR = { x: PARADA + CARROCERIA_X, y: 125 };
  const ALTO_CARGA = 45;                                                 // cabo durante o giro (passa sobre a cabine)

  const T = { entrar: [0, 800], subir: [800, 1300], descer: [1300, 1650], pega: [1650, 1800], icar: [1800, 2100],
    girar: [2100, 2800], baixar: [2800, 3050], recolher: [3050, 3450], sair: [3400, 4000], fim: 4300 };

  function estadoEm(t) {
    let x = PARADA, ponta = DESCANSO, c = 14, presa = false, naCarroceria = false;
    if (t < T.entrar[1]) x = mix(-440, PARADA, sai(fase(t, ...T.entrar)));
    if (t >= T.sair[0]) x = mix(PARADA, 1180, entra(fase(t, ...T.sair)));
    if (t >= T.subir[0] && t < T.girar[0]) ponta = bez(DESCANSO, { x: 520, y: -30 }, PEGAR, suave(fase(t, ...T.subir)));
    if (t >= T.girar[0] && t < T.recolher[0]) ponta = bez(PEGAR, { x: 560, y: -20 }, LARGAR, suave(fase(t, ...T.girar)));
    if (t >= T.recolher[0]) { const k = suave(fase(t, ...T.recolher)); ponta = { x: mix(LARGAR.x, TRANSPORTE.x, k), y: mix(LARGAR.y, TRANSPORTE.y, k) }; }
    const descer = PEGAR.y; const cPegar = LOGO_CHAO.y - LINGA - descer;
    const cLargar = 232 - LOGO_A - LINGA - LARGAR.y;
    if (t >= T.descer[0]) c = mix(14, cPegar, suave(fase(t, ...T.descer)));
    if (t >= T.icar[0]) c = mix(cPegar, ALTO_CARGA, suave(fase(t, ...T.icar)));
    if (t >= T.baixar[0]) c = mix(ALTO_CARGA, cLargar, suave(fase(t, ...T.baixar)));
    if (t >= T.recolher[0]) c = mix(cLargar, 14, suave(fase(t, ...T.recolher)));
    presa = t >= T.pega[0] && t < T.recolher[0];
    naCarroceria = t >= T.recolher[0];
    return { x, ponta: { x: ponta.x + (x - PARADA), y: ponta.y }, c, presa, naCarroceria };
  }

  function desenhar(t) {
    const e = estadoEm(t);
    caminhao.setAttribute('transform', `translate(${e.x} 0)`);
    rodas.forEach((r) => r.setAttribute('transform', `translate(${r.dataset.x} 278) rotate(${(e.x / 22) * 57.3})`));
    const piv = { x: e.x + P.x, y: P.y };
    const dx = e.ponta.x - piv.x, dy = e.ponta.y - piv.y;
    const L = Math.max(BASE, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx) * 57.2958;
    lanca.setAttribute('transform', `translate(${piv.x} ${piv.y}) rotate(${ang})`);
    ext.setAttribute('width', String(L - (BASE - 30) + 8));
    const ponta = { x: piv.x + Math.cos(ang / 57.2958) * L, y: piv.y + Math.sin(ang / 57.2958) * L };
    const cx = piv.x + Math.cos(ang / 57.2958) * 62, cy = piv.y + Math.sin(ang / 57.2958) * 62;
    cil.setAttribute('x1', e.x + 256); cil.setAttribute('y1', 240); cil.setAttribute('x2', cx); cil.setAttribute('y2', cy);
    const g = { x: ponta.x, y: ponta.y + e.c };
    cabo.setAttribute('x1', ponta.x); cabo.setAttribute('y1', ponta.y); cabo.setAttribute('x2', g.x); cabo.setAttribute('y2', g.y);
    gancho.setAttribute('transform', `translate(${g.x} ${g.y})`);
    let lx, ly;
    if (e.presa) { lx = g.x - LOGO_L / 2; ly = g.y + LINGA; }
    else if (e.naCarroceria) { lx = e.x + CARROCERIA_X - LOGO_L / 2; ly = 232 - LOGO_A; }
    else { lx = LOGO_CHAO.x - LOGO_L / 2; ly = LOGO_CHAO.y; }
    logo.setAttribute('transform', `translate(${lx} ${ly})`);
    const lingas = e.presa ? '' : 'none';
    [l1, l2].forEach((l, i) => {
      l.style.display = lingas;
      l.setAttribute('x1', g.x - lx); l.setAttribute('y1', g.y + 18 - ly);
      l.setAttribute('x2', i ? LOGO_L - 6 : 6); l.setAttribute('y2', 0);
    });
  }

  let inicio = null, encerrada = false, quadro = 0;
  function encerrar() {
    if (encerrada) return; encerrada = true;
    cancelAnimationFrame(quadro);
    fundo.classList.add('saindo');
    document.documentElement.classList.remove('com-abertura');
    removeEventListener('keydown', tecla);
    setTimeout(() => fundo.remove(), 380);
  }
  function tecla(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') encerrar(); }
  function passo(agora) {
    if (inicio === null) inicio = agora;
    const t = agora - inicio;
    desenhar(Math.min(t, T.fim));
    if (t >= T.sair[1] - 100) fundo.classList.add('saindo');
    if (t >= T.fim) { encerrar(); return; }
    quadro = requestAnimationFrame(passo);
  }
  desenhar(0);
  // espera a logo carregar (no máximo 600 ms) para nunca animar sem ela
  const img = new Image(); let comecou = false;
  const comecar = () => { if (!comecou && !encerrada) { comecou = true; quadro = requestAnimationFrame(passo); } };
  img.onload = comecar; img.onerror = comecar; img.src = 'assets/logo-masters.png';
  setTimeout(comecar, 600);
  setTimeout(encerrar, 6500);                                              // garantia: nunca prende a tela
  fundo.addEventListener('pointerdown', encerrar);
  addEventListener('keydown', tecla);
  window.__abertura = { estadoEm, T, encerrar, desenhar, pausar: () => { encerrada = true; cancelAnimationFrame(quadro); } };
})();
