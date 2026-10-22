# nTeam · monta a VERSÃO DE DEMONSTRAÇÃO a partir do build oficial (public/).
# Saída: demo/dist/ — mesmo app, sem acesso ao banco (connect-src 'self'), com demo.js atendendo as chamadas.
import os, sys, shutil, json, re
D = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(D, '..', 'public')
OUT = os.path.join(D, 'dist')
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
shutil.copytree(PUB, OUT)
for f in ('p.html', 'p.js', 'p.css'):  # página pública de pacote: não faz parte da demonstração
    try: os.remove(os.path.join(OUT, f))
    except FileNotFoundError: pass

s = open(os.path.join(OUT, 'index.html'), encoding='utf-8').read()
def R(old, new):
    global s
    if s.count(old) != 1: sys.exit(f'PATCH FALHOU: {s.count(old)} ocorrências de {old[:80]!r}')
    s = s.replace(old, new)
R('<script src="/vendor/supabase-2.117.2.js"></script>', '')
R('<script src="/nuvem.js"></script>', '<script src="/demo.js"></script>')
R('<title>nTeam · NTN Engenharia</title>', '<title>nTeam · Demonstração</title>')
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(s)
shutil.copy(os.path.join(D, 'demo.js'), os.path.join(OUT, 'demo.js'))

# CSP: igual à oficial, mas sem o endereço do banco. O navegador fica proibido de falar com o Supabase.
v = json.load(open(os.path.join(D, '..', 'vercel.json'), encoding='utf-8'))
csp = v['headers'][0]['headers'][0]
assert csp['key'] == 'Content-Security-Policy'
csp['value'] = re.sub(r"connect-src [^;]*", "connect-src 'self'", csp['value'])
assert 'supabase' not in csp['value']
v['headers'] = [h for h in v['headers'] if h['source'] != '/p']
v['headers'].append({'source': '/demo.js', 'headers': [{'key': 'Cache-Control', 'value': 'no-cache'}]})
v['headers'].append({'source': '/demo-semente.json', 'headers': [{'key': 'Cache-Control', 'value': 'no-cache'}]})
json.dump(v, open(os.path.join(OUT, 'vercel.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
sem = os.path.join(D, 'demo-semente.json')
if os.path.exists(sem):
    shutil.copy(sem, os.path.join(OUT, 'demo-semente.json'))
print('ok', OUT, csp['value'][:80])
