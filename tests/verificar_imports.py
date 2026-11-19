"""Confere se todo nome importado entre módulos do front-end é exportado pelo módulo de origem."""
import re, os, sys
raiz = sys.argv[1]
exports = {}
for dp, _, fs in os.walk(raiz):
    for f in fs:
        if f.endswith('.js'):
            p = os.path.normpath(os.path.join(dp, f)); s = open(p, encoding='utf-8').read()
            nomes = set(re.findall(r'export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)', s))
            for grupo in re.findall(r'export\s*\{([^}]*)\}', s):
                nomes |= {x.strip().split(' as ')[-1] for x in grupo.split(',') if x.strip()}
            exports[p] = (nomes, s)
erros = 0
for p, (_, s) in exports.items():
    for nomes, origem in re.findall(r'import\s*\{([^}]*)\}\s*from\s*[\'"](\.[^\'"]+)[\'"]', s):
        alvo = os.path.normpath(os.path.join(os.path.dirname(p), origem))
        if alvo not in exports: print('ARQUIVO NÃO ENCONTRADO', p, origem); erros += 1; continue
        for n in [x.strip().split(' as ')[0] for x in nomes.split(',') if x.strip()]:
            if n not in exports[alvo][0]: print(f'{p}: "{n}" não exportado por {origem}'); erros += 1
    for origem in re.findall(r'import\s+\*\s+as\s+\w+\s+from\s*[\'"](\.[^\'"]+)[\'"]', s):
        if os.path.normpath(os.path.join(os.path.dirname(p), origem)) not in exports: print('ARQUIVO NÃO ENCONTRADO', p, origem); erros += 1
# rotas -> arquivos de página
app = open(os.path.join(raiz, 'app.js'), encoding='utf-8').read()
for arq in re.findall(r"arq: '([\w-]+)'", app):
    if not os.path.exists(os.path.join(raiz, 'paginas', arq + '.js')): print('PÁGINA FALTANDO', arq); erros += 1
print('OK - imports e rotas conferidos' if not erros else f'{erros} problema(s)'); sys.exit(1 if erros else 0)
