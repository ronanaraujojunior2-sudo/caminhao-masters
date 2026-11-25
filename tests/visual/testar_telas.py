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
chamadas = []
def funcao_simulada(route):
    import json as _j
    corpo = _j.loads(route.request.post_data or '{}'); chamadas.append(corpo)
    r = {'ok': True, 'modo': 'historico'} if corpo.get('acao') == 'excluir' else {'ok': True}
    route.fulfill(status=200, content_type='application/json', body=_j.dumps(r))

def preparar(ctx, nome, abertura=False):
    # a animação de abertura aparece uma vez por sessão; nos testes de telas ela é marcada como já vista
    if not abertura: ctx.add_init_script("sessionStorage.setItem('cm-abertura-vista', '1')")
    ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG))
    ctx.route('https://simulado.supabase.co/functions/v1/usuarios', funcao_simulada)
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
    # importação de obras do Sienge: arquivo -> prévia -> confirmação -> relatório
    p.click('#importar'); p.wait_for_selector('#imp-escolher')
    p.set_input_files('#imp-arquivo', os.path.join(RAIZ, 'tests', 'fixtures', 'obras-sienge-teste.xlsx'))
    p.wait_for_selector('#imp-confirmar', timeout=8000)
    t_prev = p.inner_text('#imp-corpo')
    assert 'nada foi gravado ainda' in t_prev and 'RESIDENCIAL TESTE ALFA' in t_prev and 'Com erro (2)' in t_prev, 'prévia da importação incompleta'
    assert '01/01/2026 a 16/11/2026' in t_prev and 'Área total' in t_prev, 'período/colunas do relatório não exibidos'
    assert p.inner_text('#imp-confirmar') == 'Confirmar importação (4 obras)', 'obra encerrada deveria vir desmarcada: ' + p.inner_text('#imp-confirmar')
    with p.expect_download() as dl: p.click('#imp-baixar-erros')
    rel = open(dl.value.path(), encoding='utf-8-sig').read()
    assert 'OBRA SEM CODIGO' in rel and 'repetido' in rel, 'relatório de erros incompleto'
    print('ok - relatório de erros da importação para baixar (Excel/CSV)')
    p.uncheck('input[data-cod="500"]'); p.wait_for_timeout(100)
    assert p.inner_text('#imp-confirmar') == 'Confirmar importação (3 obras)', 'desmarcar não atualizou a contagem'
    foto(p, '23c-obras-importar-previa')
    p.click('#imp-confirmar'); p.wait_for_selector('.janela'); p.click('.janela footer .btn-pri')
    p.wait_for_selector('#imp-ok', timeout=8000)
    env = p.evaluate('window.__ultimaImportacao')
    assert env['p_arquivo'] == 'obras-sienge-teste.xlsx' and [l['codigo'] for l in env['p_linhas']] == ['55', '101', '50'], 'envio da importação incorreto'
    assert env['p_linhas'][0]['cliente'] == 'Cliente Alfa' and env['p_linhas'][0]['dados']['data_cadastro'] == '2024-03-15', 'dados do Sienge não enviados'
    assert 'Importação concluída' in p.inner_text('#imp-corpo'), 'relatório final ausente'
    assert 'Ignoradas' in p.inner_text('#imp-corpo'), 'resumo final sem ignoradas'
    with p.expect_download() as dl: p.click('#imp-baixar-rel')
    rel = open(dl.value.path(), encoding='utf-8-sig').read()
    assert 'Cadastrada' in rel and 'Desmarcada' in rel and 'Com erro' in rel, 'relatório completo incorreto'
    foto(p, '23d-obras-importar-resultado'); p.click('#imp-ok')
    print('ok - importar obras do Sienge: arquivo real do formato Sienge, prévia, encerrada desmarcada, confirmação e relatório')
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
                       ('#/ocorrencias', '19-ocorrencias'), ('#/documentos', '21-documentos'),
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
    # pesquisa de obras (nova solicitação): digitar parte do nome e escolher
    ir(p, '#/solicitar')
    caixa = p.locator('.busca-obra input')
    caixa.click(); caixa.fill('teste 2')
    p.wait_for_selector('.bo-lista li[data-i]')
    nomes = p.locator('.bo-lista li[data-i] b').all_inner_texts()
    assert nomes and nomes[0].startswith('Obra Teste 2') and all('Teste' in n and '2' in n for n in nomes), 'pesquisa de obra não filtrou: %s' % nomes
    foto(p, '15b-pesquisa-obra', False)
    caixa.press('ArrowDown'); caixa.press('Enter')
    escolhida = p.evaluate("document.querySelector('[name=obra_id]').value")
    assert escolhida and caixa.input_value().startswith('Obra Teste 2'), 'seleção pelo teclado falhou'
    caixa.fill('zzzz'); p.wait_for_selector('.bo-nada')
    assert p.evaluate("document.querySelector('[name=obra_id]').value") == '', 'texto sem resultado deveria limpar a obra'
    print('ok - pesquisa de obras: resultados ao digitar, teclado, limpar seleção')
    # filtro de obra nas solicitações
    ir(p, '#/solicitacoes'); f = p.locator('.busca-obra input'); f.click(); f.fill('exemplo a')
    p.locator('.bo-lista li[data-i]').first.click(); p.wait_for_timeout(300)
    assert p.evaluate("document.querySelector('#f-obra').value") != '', 'filtro de obra por pesquisa falhou'
    print('ok - pesquisa de obras também nos filtros de solicitações')
    ir(p, '#/usuarios'); p.click('#novo'); p.wait_for_selector('.janela'); foto(p, '25b-novo-usuario', False); p.click('.janela .fechar')
    # ---- sem módulo financeiro ----
    menu = p.inner_text('.lateral')
    assert 'Despesas' not in menu and 'Relatórios' not in menu and 'Gestão' not in menu and 'Documentos e vencimentos' in menu, 'menu ainda mostra Despesas/Relatórios'
    ir(p, '#/despesas'); assert '#/painel' in p.url, 'rota de despesas ainda existe'
    ir(p, '#/relatorios'); assert '#/painel' in p.url, 'rota de relatórios ainda existe'
    ir(p, '#/painel'); pn = p.inner_text('.pn-kpis')
    assert 'Despesa' not in pn and 'R$' not in pn and 'Manutenções programadas' in pn, 'painel ainda tem indicador financeiro'
    assert 'despesas' not in p.evaluate('window.__tabelasLidas || []'), 'alguma tela ainda consulta despesas'
    print('ok - sem módulo financeiro nem de relatórios: menu, rotas e painel sem custos, despesas ou relatórios')
    # abastecimento: admin vê o valor no histórico; valor não informado aparece como tal
    ir(p, '#/diario'); p.click('[data-aba=abastecimentos]'); p.wait_for_timeout(500)
    hist = p.inner_text('#lista') if p.locator('#lista').count() else p.inner_text('main')
    assert '412,50' in hist and 'não informado' in hist and 'Motorista Exemplo' in hist, 'histórico de abastecimentos sem valor/motorista: ' + hist[:300]
    foto(p, '17b-historico-abastecimentos')
    print('ok - histórico de abastecimentos mostra motorista e valor pago (ou “não informado”)')
    # ---- usuários: filtros e ações ----
    ir(p, '#/usuarios'); p.wait_for_selector('#situacoes')
    nomes = p.inner_text('#lista')
    assert 'Administrador Exemplo' in nomes and 'Funcionário Desativado' not in nomes and 'Funcionário Arquivado' not in nomes, 'lista principal deveria ter só ativos'
    assert p.inner_text('[data-n=ativos]') == '4' and p.inner_text('[data-n=inativos]') == '1' and p.inner_text('[data-n=arquivados]') == '2', 'contadores errados'
    p.click('[data-sit=inativos]'); p.wait_for_timeout(200); assert 'Funcionário Desativado' in p.inner_text('#lista')
    p.click('[data-sit=arquivados]'); p.wait_for_timeout(200); arq = p.inner_text('#lista')
    assert 'Funcionário Arquivado' in arq and 'Ex-motorista Histórico' in arq and 'ex.motorista' in arq and 'Excluído' in arq, 'arquivados/excluídos não listados'
    linha_exc = p.locator('tr', has_text='Ex-motorista Histórico')
    assert linha_exc.locator('button').count() == 0, 'registro histórico de excluído não deve ter ações'
    foto(p, '25c-usuarios-arquivados')
    print('ok - usuários: filtros Ativos/Inativos/Arquivados com contadores; excluído aparece só como histórico')
    p.click('[data-sit=ativos]'); p.wait_for_timeout(200)
    assert p.locator('tr', has_text='Administrador Exemplo').locator('[data-excluir]').count() == 0, 'admin não pode se excluir pela tela'
    linha = p.locator('tr', has_text='Novo Funcionário')
    assert linha.locator('text=Excluir usuário').count() == 1 and linha.locator('text=Arquivar').count() == 1 and linha.locator('text=Desativar').count() == 1
    linha.locator('[data-excluir]').click(); p.wait_for_selector('.janela')
    jt = p.inner_text('.janela')
    assert 'Novo Funcionário' in jt and 'novo.func' in jt and 'NÃO são apagados' in jt, 'confirmação de exclusão não identifica o usuário'
    foto(p, '25d-excluir-usuario', False)
    p.click('.janela footer .btn-perigo'); p.wait_for_timeout(200)
    assert p.locator('.janela').count() == 1 and p.inner_text('.janela-erro').strip() and len(chamadas) == 0, 'exclusão sem confirmar deveria ser bloqueada'
    p.check('.janela input[name=confirmo]'); p.fill('.janela input[name=justificativa]', 'Cadastro duplicado')
    p.click('.janela footer .btn-perigo'); p.wait_for_selector('.janela', state='detached')
    assert chamadas[-1] == {'acao': 'excluir', 'usuario_id': 'u4', 'justificativa': 'Cadastro duplicado'}, 'chamada de exclusão incorreta: %s' % chamadas[-1]
    p.wait_for_timeout(300); assert 'foi excluído' in p.inner_text('#avisos') if p.locator('#avisos').count() else True
    print('ok - Excluir usuário: confirmação com nome, exige marcar, chama o servidor e atualiza a lista')
    p.click('[data-sit=inativos]'); p.wait_for_timeout(200)
    p.locator('tr', has_text='Funcionário Desativado').locator('[data-arquivar]').click(); p.wait_for_selector('.janela')
    p.click('.janela footer .btn-pri'); p.wait_for_selector('.janela', state='detached')
    assert chamadas[-1]['acao'] == 'arquivar' and chamadas[-1]['usuario_id'] == 'u5', 'arquivar incorreto'
    p.click('[data-sit=arquivados]'); p.wait_for_timeout(200)
    p.locator('tr', has_text='Funcionário Arquivado').locator('[data-reativar]').click(); p.wait_for_selector('.janela')
    p.click('.janela footer .btn-pri'); p.wait_for_selector('.janela', state='detached')
    assert chamadas[-1] == {'acao': 'ativar', 'usuario_id': 'u6'}, 'reativar incorreto: %s' % chamadas[-1]
    print('ok - Arquivar e Reativar chamam o servidor com o usuário certo')
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
    assert 'Despesa' not in p.inner_text('main'), 'motorista ainda vê Despesa emergencial'
    ir(p, '#/diario'); assert 'Despesa' not in p.inner_text('main'), 'Diário de Bordo ainda tem Despesa emergencial'
    p.click('[data-novo=abastecimento]'); p.wait_for_selector('.janela')
    jt = p.inner_text('.janela')
    for campo in ['Data e hora', 'Quilometragem', 'Litros abastecidos', 'Posto de combustível', 'Valor total pago', 'Foto do comprovante', 'Observações']:
        assert campo in jt, 'campo ausente no abastecimento: ' + campo
    assert p.locator('.janela input[name=valor]').get_attribute('required') is None, 'valor deveria ser opcional'
    foto(p, '36-abastecimento-celular', False)
    p.fill('.janela input[name=litros]', '45,5'); p.click('.janela footer .btn-pri'); p.wait_for_timeout(200)
    assert p.locator('.janela').count() == 1 and p.inner_text('.janela-erro').strip() and p.locator('.janela input[name=posto]:invalid').count() == 1, 'posto deveria ser obrigatório'
    p.fill('.janela input[name=posto]', 'Posto Teste'); p.fill('.janela textarea[name=observacoes]', 'Sem comprovante')
    p.click('.janela footer .btn-pri'); p.wait_for_selector('.janela', state='detached', timeout=5000)
    print('ok - motorista registra abastecimento sem valor (opcional); posto obrigatório; sem “Despesa emergencial”')
    ir(p, '#/agenda'); foto(p, '34-motorista-agenda-celular')
    p.click('#menu-botao'); p.wait_for_timeout(400); foto(p, '35-menu-celular', False)
    ctx.close()

    # ---------------- CELULAR: ADMINISTRADOR (usuários) ----------------
    ctx = nav.new_context(**cel)
    p = preparar(ctx, 'celular-admin-usuarios')
    entrar(p, 'admin'); ir(p, '#/usuarios'); p.wait_for_selector('#situacoes')
    n = p.locator('#lista [data-excluir]').count()
    assert n == 3, 'celular: esperado botão Excluir usuário nos 3 usuários ativos (exceto o próprio admin), achei %d' % n
    assert p.locator('#lista [data-excluir]').first.is_visible() and p.locator('#lista [data-excluir]').first.inner_text() == 'Excluir usuário'
    p.locator('tr', has_text='Solicitante Exemplo').scroll_into_view_if_needed(); foto(p, '43-usuarios-celular-excluir', False)
    print('ok - celular: botão “Excluir usuário” visível nas ações de cada usuário')
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
    caixa = p.locator('.busca-obra input'); caixa.tap(); caixa.fill('exemplo')
    p.wait_for_selector('.bo-lista li[data-i]'); foto(p, '41b-pesquisa-obra-celular', False)
    p.locator('.bo-lista li[data-i]').first.tap(); p.wait_for_timeout(200)
    assert p.evaluate("document.querySelector('[name=obra_id]').value") != '' and p.locator('.bo-lista').is_hidden(), 'escolha por toque falhou'
    print('ok - pesquisa de obras no celular (toque)')
    ir(p, '#/solicitacoes/s4'); foto(p, '42-solicitante-detalhe')
    assert p.locator('[data-acao=aprovar]').count() == 0, 'solicitante vê botão de aprovar'
    print('ok - solicitante não vê ações administrativas')
    ctx.close()

    # ---------------- TABLET ----------------
    ctx = nav.new_context(viewport={'width': 820, 'height': 1180}, is_mobile=True, has_touch=True, service_workers='block', locale='pt-BR', timezone_id='America/Manaus')
    p = preparar(ctx, 'tablet')
    entrar(p, 'admin'); ir(p, '#/agenda'); foto(p, '50-tablet-agenda')
    ctx.close()

    # ---------------- ABERTURA (caminhão Munck) ----------------
    ctx = nav.new_context(viewport={'width': 1366, 'height': 820}, service_workers='block', locale='pt-BR')
    p = preparar(ctx, 'abertura', abertura=True)
    t0 = time.time(); p.goto(URL); p.wait_for_selector('.abertura')
    p.wait_for_selector('#f-login', state='attached', timeout=8000)
    assert p.locator('.abertura').count() == 1, 'abertura não apareceu'
    p.wait_for_selector('.abertura', state='detached', timeout=8000); dur = time.time() - t0
    assert dur < 6, 'abertura demorou demais: %.1fs' % dur
    print('ok - abertura do caminhão Munck aparece e termina sozinha (%.1fs), com o sistema carregado por trás' % dur)
    p.reload(); p.wait_for_selector('#f-login'); p.wait_for_timeout(300)
    assert p.locator('.abertura').count() == 0, 'abertura repetiu na mesma sessão'
    print('ok - abertura não se repete na mesma sessão')
    ctx.close()
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    p = preparar(ctx, 'abertura-pular', abertura=True)
    p.goto(URL); p.wait_for_selector('.abertura'); p.wait_for_timeout(900); foto(p, '60-abertura-celular', False)
    p.tap('.abertura-pular'); p.wait_for_selector('.abertura', state='detached', timeout=2000)
    print('ok - abertura pode ser pulada com um toque')
    ctx.close()
    ctx = nav.new_context(viewport={'width': 1366, 'height': 820}, reduced_motion='reduce', service_workers='block')
    p = preparar(ctx, 'abertura-reduzida', abertura=True)
    p.goto(URL); p.wait_for_selector('#f-login'); p.wait_for_timeout(300)
    assert p.locator('.abertura').count() == 0, 'abertura apareceu com movimento reduzido'
    print('ok - abertura respeita “reduzir movimento” do aparelho')
    ctx.close()
    nav.close()

srv.shutdown()
relevantes = [e for e in erros if 'favicon' not in e and not ('404 (File not found)' in e)]
if relevantes:
    print('\n'.join(relevantes)); print(f'FALHOU: {len(relevantes)} erro(s) de JavaScript'); sys.exit(1)
print(f'=== TESTE VISUAL OK — {len(os.listdir(SAIDA))} capturas em tests/visual/capturas, nenhum erro de JavaScript ===')
