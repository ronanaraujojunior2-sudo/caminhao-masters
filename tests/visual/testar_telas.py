"""
Teste visual automatizado do Caminhão Masters (Playwright + Chrome).
Abre o aplicativo REAL, trocando apenas o Supabase por um simulador com dados de exemplo,
navega por todas as telas dos três perfis em computador e celular, tira capturas e
falha se houver qualquer erro de JavaScript.
Uso:  python3 tests/visual/testar_telas.py   (capturas em tests/visual/capturas/)
"""
import functools, http.server, os, socketserver, sys, threading, time
from playwright.sync_api import sync_playwright

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEB = os.path.join(RAIZ, 'web')
SAIDA = os.path.join(os.path.dirname(__file__), 'capturas')
os.makedirs(SAIDA, exist_ok=True)
SIMULADO = open(os.path.join(os.path.dirname(__file__), 'supabase-simulado.js'), encoding='utf-8').read()
CONFIG = "export const CONFIG = { SUPABASE_URL: 'https://simulado.supabase.co', SUPABASE_KEY: 'chave-simulada', AUTH_EMAIL_DOMAIN: 'caminhaomasters.local', VAPID_PUBLIC_KEY: '' };"

class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8765), functools.partial(Silencioso, directory=WEB))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:8765/index.html'

erros = []
def preparar(ctx, nome):
    ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG))
    ctx.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=SIMULADO))
    p = ctx.new_page()
    p.on('pageerror', lambda e: erros.append(f'[{nome}] ERRO JS: {e}'))
    p.on('response', lambda r: erros.append(f'[{nome}] 404: {r.url}') if r.status == 404 and 'logo-masters' not in r.url else None)
    p.on('console', lambda m: erros.append(f'[{nome}] console.{m.type}: {m.text}') if m.type == 'error' else None)
    return p

def foto(p, nome, cheia=True):
    time.sleep(0.6)
    p.screenshot(path=os.path.join(SAIDA, nome + '.png'), full_page=cheia)

def ir(p, rota):
    p.evaluate(f"location.hash = '{rota}'")
    p.wait_for_timeout(700)
    largura = p.evaluate('() => [document.documentElement.scrollWidth, innerWidth]')
    if largura[0] > largura[1] + 1: erros.append(f'Tela {rota}: conteúdo mais largo que a tela ({largura[0]}px > {largura[1]}px)')
    txt = p.inner_text('#raiz')
    if 'Não foi possível abrir esta tela' in txt:
        erros.append(f'Tela {rota} falhou: {txt[:300]}')

def entrar(p, usuario):
    p.goto(URL); p.wait_for_selector('#f-login')
    p.fill('input[name=usuario]', usuario); p.fill('input[name=senha]', 'senha-teste-1')
    p.click('button[type=submit]'); p.wait_for_selector('.layout', timeout=8000)
    p.wait_for_timeout(600)

with sync_playwright() as pw:
    nav = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # ---------------- COMPUTADOR ----------------
    ctx = nav.new_context(viewport={'width': 1366, 'height': 820}, service_workers='block', locale='pt-BR', timezone_id='America/Manaus')
    p = preparar(ctx, 'desktop')
    p.goto(URL); p.wait_for_selector('#f-login'); foto(p, '01-login-computador', False)
    # olho da senha: alterna sem perder o texto
    p.fill('input[name=senha]', 'MinhaSenha123'); p.click('.olho')
    assert p.get_attribute('input[name=senha]', 'type') == 'text' and p.input_value('input[name=senha]') == 'MinhaSenha123', 'olho falhou'
    p.click('.olho'); assert p.get_attribute('input[name=senha]', 'type') == 'password', 'olho não voltou a ocultar'
    print('ok - mostrar/ocultar senha preserva o texto digitado')
    ir(p, '#/recuperar'); foto(p, '02-recuperar-senha', False)
    ir(p, '#/primeiro-acesso'); foto(p, '03-primeiro-acesso', False)
    assert p.evaluate("document.querySelector('.logo-img').naturalWidth") > 0, 'logomarca oficial não carregou'
    print('ok - logomarca oficial exibida no login')
    entrar(p, 'admin'); foto(p, '10-admin-painel')
    # menu recolhível (padrão Masters Gestão)
    g = p.locator('.mg[data-g=cadastros] .mg-h')
    estava = p.get_attribute('.mg[data-g=cadastros] .mg-h', 'aria-expanded')
    g.click(); p.wait_for_timeout(200)
    assert p.get_attribute('.mg[data-g=cadastros] .mg-h', 'aria-expanded') != estava, 'grupo do menu não expandiu/recolheu'
    if p.get_attribute('.mg[data-g=cadastros] .mg-h', 'aria-expanded') == 'false': g.click(); p.wait_for_timeout(200)
    p.click('.mg[data-g=cadastros] a[data-rota=obras]'); p.wait_for_timeout(700)
    assert p.locator('.mg[data-g=cadastros].ativa').count() == 1 and p.locator('a.nav.on[data-rota=obras]').count() == 1, 'item ativo do menu não marcado'
    print('ok - menu lateral com grupos recolhíveis (›) e item ativo marcado')
    # paginação
    assert 'Página 1 de 2' in p.inner_text('#lista'), 'paginação ausente na lista de obras'
    p.click('[data-pagina="1"]'); p.wait_for_timeout(500)
    assert 'Página 2 de 2' in p.inner_text('#lista'), 'botão Próxima não funcionou'
    print('ok - paginação das tabelas (Anterior/Próxima)'); foto(p, '23b-obras-paginacao')
    # ☰ recolhe a barra lateral no computador
    p.click('#menu-botao'); p.wait_for_timeout(200)
    assert p.evaluate("document.body.classList.contains('recolhido')") and not p.is_visible('#lateral'), '☰ não recolheu o menu'
    p.click('#menu-botao'); p.wait_for_timeout(200)
    assert p.is_visible('#lateral'), '☰ não reabriu o menu'
    print('ok - ☰ recolhe e expande o menu no computador')
    # tema escuro ◐
    ir(p, '#/painel')
    p.click('#tema'); p.wait_for_timeout(300)
    assert p.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark', 'botão ◐ não ativou o modo escuro'
    foto(p, '10b-admin-painel-escuro'); ir(p, '#/agenda'); foto(p, '11b-agenda-escuro')
    p.click('#tema'); p.wait_for_timeout(200)
    assert p.evaluate("document.documentElement.getAttribute('data-theme')") == 'light', 'botão ◐ não voltou ao claro'
    print('ok - modo claro/escuro pelo botão ◐ (preferência salva)')
    for rota, nome in [('#/agenda', '11-admin-agenda-semana'), ('#/solicitacoes', '13-admin-solicitacoes'), ('#/solicitacoes/s4', '14-admin-solicitacao-detalhe'),
                       ('#/solicitar', '15-solicitar'), ('#/bloqueios', '16-bloqueios'), ('#/manutencoes', '17-manutencoes'), ('#/diario', '18-diario'),
                       ('#/ocorrencias', '19-ocorrencias'), ('#/despesas', '20-despesas'), ('#/documentos', '21-documentos'), ('#/relatorios', '22-relatorios'),
                       ('#/obras', '23-obras'), ('#/caminhoes', '24-caminhoes'), ('#/usuarios', '25-usuarios'), ('#/auditoria', '26-auditoria'),
                       ('#/configuracoes', '27-configuracoes'), ('#/notificacoes', '28-notificacoes'), ('#/conta', '29-conta')]:
        ir(p, rota); foto(p, nome)
    ir(p, '#/agenda'); p.click('[data-modo=mes]'); p.wait_for_timeout(500); foto(p, '12-admin-agenda-mes')
    p.click('[data-modo=semana]'); p.wait_for_timeout(500)
    p.click('.slot.s-em_atendimento'); p.wait_for_selector('.janela'); foto(p, '12b-detalhe-atividade', False); p.click('.janela .fechar')
    # filtro de situação
    p.select_option('select[data-f=situacao]', 'bloqueado'); p.wait_for_timeout(300)
    assert p.locator('.slot.s-bloqueado:not(.filtrado)').count() == 1 and p.locator('.slot.s-agendado.filtrado').count() >= 1, 'filtro da agenda falhou'
    print('ok - filtros da agenda')
    ir(p, '#/solicitacoes/s4'); p.click('[data-acao=recusar]'); p.wait_for_selector('.janela textarea')
    p.click('.janela footer .btn-perigo'); p.wait_for_timeout(300)
    assert p.locator('.janela-erro:not([hidden])').count() == 1, 'recusa sem justificativa deveria ser bloqueada na tela'
    print('ok - recusa sem justificativa bloqueada na interface'); foto(p, '14b-recusa-exige-justificativa', False); p.click('.janela .fechar')
    ir(p, '#/usuarios'); p.click('#novo'); p.wait_for_selector('.janela'); foto(p, '25b-novo-usuario', False); p.click('.janela .fechar')
    ctx.close()

    # ---------------- CELULAR: MOTORISTA ----------------
    cel = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, service_workers='block', locale='pt-BR', timezone_id='America/Manaus')
    ctx = nav.new_context(**cel)
    p = preparar(ctx, 'celular-motorista')
    p.goto(URL); p.wait_for_selector('#f-login'); foto(p, '30-login-celular', False)
    entrar(p, 'motorista'); foto(p, '31-motorista-meu-dia')
    assert 'Relatórios' not in p.inner_text('.lateral') and 'Usuários' not in p.inner_text('.lateral'), 'motorista vê menu administrativo'
    print('ok - motorista não vê menus administrativos')
    ir(p, '#/usuarios'); assert '#/motorista' in p.url, 'motorista acessou rota administrativa'
    print('ok - motorista redirecionado ao tentar rota administrativa')
    p.click('[data-acao=iniciar]'); p.wait_for_selector('.janela'); foto(p, '32-motorista-iniciar-expediente')
    p.click('.janela footer .btn-pri'); p.wait_for_timeout(300)
    assert 'checklist' in p.inner_text('.janela-erro').lower(), 'checklist incompleto deveria ser recusado'
    print('ok - checklist de abertura exige todos os itens'); p.click('.janela .fechar')
    p.click('[data-finalizar]'); p.wait_for_selector('.janela'); foto(p, '33-motorista-finalizar-atendimento'); p.click('.janela .fechar')
    ir(p, '#/agenda'); foto(p, '34-motorista-agenda-celular')
    p.click('#menu-botao'); p.wait_for_timeout(400); foto(p, '35-menu-celular', False)
    ctx.close()

    # ---------------- CELULAR: SOLICITANTE ----------------
    ctx = nav.new_context(**cel)
    p = preparar(ctx, 'celular-solicitante')
    entrar(p, 'solicitante'); foto(p, '40-solicitante-agenda')
    menu = p.inner_text('.lateral')
    assert 'Bloqueios' not in menu and 'Painel geral' not in menu, 'solicitante vê menus administrativos'
    print('ok - solicitante vê apenas agenda, solicitar, minhas solicitações e notificações')
    ir(p, '#/solicitar'); foto(p, '41-solicitante-formulario')
    p.click('button[type=submit]'); p.wait_for_timeout(300)
    assert 'Preencha' in p.inner_text('#erro'), 'formulário vazio deveria ser recusado'
    print('ok - formulário de solicitação valida campos obrigatórios')
    ir(p, '#/solicitacoes/s4'); foto(p, '42-solicitante-detalhe')
    assert p.locator('[data-acao=aprovar]').count() == 0, 'solicitante vê botão de aprovar'
    print('ok - solicitante não vê ações administrativas')
    ctx.close()

    # ---------------- TABLET ----------------
    ctx = nav.new_context(viewport={'width': 820, 'height': 1180}, is_mobile=True, has_touch=True, service_workers='block', locale='pt-BR', timezone_id='America/Manaus')
    p = preparar(ctx, 'tablet')
    entrar(p, 'admin'); ir(p, '#/agenda'); foto(p, '50-tablet-agenda')
    ctx.close()
    nav.close()

srv.shutdown()
relevantes = [e for e in erros if 'favicon' not in e and not ('404 (File not found)' in e)]
if relevantes:
    print('\n'.join(relevantes)); print(f'FALHOU: {len(relevantes)} erro(s) de JavaScript'); sys.exit(1)
print(f'=== TESTE VISUAL OK — {len(os.listdir(SAIDA))} capturas em tests/visual/capturas, nenhum erro de JavaScript ===')
