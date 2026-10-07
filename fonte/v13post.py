# v13 · publicação: gera deploy/public/index.html a partir do nteam.html (v12.3)
import os,sys,shutil
D=os.path.dirname(os.path.abspath(__file__))
s=open(os.path.join(D,'..','nteam.html'),encoding='utf-8').read()
def R(old,new,cnt=1):
    global s
    n=s.count(old)
    if n<1 or (cnt is not None and n!=cnt): sys.exit(f'PATCH FALHOU: {n} ocorrências de {old[:90]!r}')
    s=s.replace(old,new)

# 1. nada de dados no armazenamento do navegador
R("let save=()=>{DBV++;CACHE.clear();try{localStorage.setItem(KEY,JSON.stringify(DB))}catch(e){}};","let save=()=>{DBV++;CACHE.clear()};")
R("let AUD=(()=>{try{return JSON.parse(localStorage.getItem(AUD_KEY)||'[]')}catch(e){return []}})();","let AUD=(window.NTEAM_AUD||[]).slice();")
i=s.index('function audGravar(){');j=s.index('let AUD_AVISO=',i)
s=s[:i]+"function audGravar(){if(window.NUVEM&&NUVEM.audEnviar)NUVEM.audEnviar()}\n"+s[j:]
R("try{gravado=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}","gravado=null;")
R("localStorage.getItem(RASC_KEY)","sessionStorage.getItem(RASC_KEY)")
R("localStorage.setItem(RASC_KEY","sessionStorage.setItem(RASC_KEY")
R("try{const p=localStorage.getItem('nteam-pessoa');if(p)UI.pessoa=p}catch(e){}","")
R("try{localStorage.setItem('nteam-pessoa',el.value)}catch(e){}","")

# 2. início: dados vêm do servidor (carregados pelo nuvem.js), nunca dos exemplos
i=s.index("  const v4=ler('nteam-proto-v4');");j=s.index("  UI.perfil=pessoaAtual().perfil||'rh';",i)
s=s[:i]+"  DB=window.NTEAM_DADOS;migrarV4(false);\n  UI.pessoa=NUVEM.usuario.pessoaId;UI.perfil=NUVEM.usuario.perfil;\n"+s[j+len("  UI.perfil=pessoaAtual().perfil||'rh';"):]

# 3. autoria real
R("perfilNome:PERFIS[UI.perfil]?.nome||UI.perfil,simulado:true}}","perfilNome:PERFIS[UI.perfil]?.nome||UI.perfil,simulado:false}}")

# 4. textos do protótipo
R('<span class="proto">Protótipo · dados de exemplo</span>','')
R('<small class="sim-note">Simulação de tela: sem login e sem segurança de servidor.</small>','')
R("O perfil simulado não tem permissão para esta ação.","Seu perfil não tem permissão para esta ação.")
R("Colaborador fora do escopo do perfil simulado.","Colaborador fora das obras do seu perfil.")
R("Esta obra não está no escopo do perfil simulado. Troque o perfil ou peça acesso ao RH.","Esta obra não está entre as obras do seu perfil. Peça acesso ao RH.")
R("O perfil simulado não acessa esta tela.","Seu perfil não acessa esta tela.")
R("O perfil simulado não acessa o HH.","Seu perfil não acessa o homem-hora.")
i=s.index('`<div class="banner" style="margin:8px 0 16px">Protótipo: a autoria vem do <b>perfil simulado</b>');j=s.index('</div>`+',i)
s=s[:i]+'`<div class="banner" style="margin:8px 0 16px">O autor de cada evento vem do login. A trilha fica no servidor e não pode ser alterada pela interface; só o administrador total apaga registros com mais de 30 dias, e isso também fica registrado.</div>`+'+s[j+len('</div>`+'):]

# 4b. auditoria: campos vindos do servidor sempre escapados
R("${c.op?` <span class=\"muted\">(${c.op})</span>`:''}","${c.op?` <span class=\"muted\">(${esc(c.op)})</span>`:''}",cnt=None)
R("<summary>${e.campos.length+e.mais} campo(s)</summary>","<summary>${(+e.campos.length||0)+(+e.mais||0)} campo(s)</summary>",cnt=None)
R("${e.mais?`<li class=\"muted\">+ ${e.mais} outro(s) campo(s)</li>`:''}","${e.mais?`<li class=\"muted\">+ ${+e.mais||0} outro(s) campo(s)</li>`:''}",cnt=None)
R('<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>','<script src="/vendor/chart-4.4.1.umd.min.js"></script>')


# 4c. v14 · perfil Administrativo de obra e escopo por obra para todos, exceto RH e Diretoria
R("gestor:{nome:'Gestor da obra',curto:'Gestor'},enc:{nome:'Encarregado de obra',curto:'Encarregado'}};","gestor:{nome:'Gestor da obra',curto:'Gestor'},enc:{nome:'Encarregado de obra',curto:'Encarregado'},adm:{nome:'Administrativo de obra',curto:'Adm. obra'}};")
R("function escopo(){const p=pessoaAtual();return p.perfil==='gestor'||p.perfil==='enc'?(p.obras||[]):null}","function escopo(){const p=pessoaAtual();return ['rh','dir'].includes(p.perfil)?null:(p.obras||[])}")

# 5. documento completo, app só roda depois do login
R('<title>nTeam · NTN Engenharia</title>','<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex,nofollow">\n<meta name="referrer" content="strict-origin-when-cross-origin">\n<title>nTeam · NTN Engenharia</title>')
R('<div class="shell">','</head>\n<body>\n<div class="shell">')
R('<div id="layer"></div>\n\n<script>','<div id="layer"></div>\n\n<script type="text/plain" id="nteam-app">')
app13=open(os.path.join(D,'app13.js'),encoding='utf-8').read()+'\n'+open(os.path.join(D,'arquivos15.js'),encoding='utf-8').read()+'\n'+open(os.path.join(D,'foto16.js'),encoding='utf-8').read()
R('\nrender();</script>','\n'+app13+'\nrascSalvar=(function(prev){return function(f){if(f&&f.querySelector&&f.querySelector(\'input[type="password"]\'))return;return prev.apply(this,arguments)}})(rascSalvar);\nrender();</script>\n<script src="/vendor/supabase-2.117.2.js"></script>\n<script src="/nuvem.js"></script>\n</body>\n</html>')
css='''
.side-foot label[for="perfil"],.side-foot #perfil{display:none!important}
.usuario{display:flex;flex-direction:column;gap:2px;padding:10px 12px;margin-bottom:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px}
.usuario .u-nome{font-weight:600;color:#fff;font-size:14px;line-height:1.3}
.usuario .u-perfil{font-size:12px;opacity:.8}
.usuario .u-status{font-size:12px;opacity:.75;margin-top:4px}
.usuario .u-status.erro{opacity:1;color:#F2B8A9;font-weight:600}
.usuario .u-acoes{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.usuario .u-acoes button{font:inherit;font-size:12px;padding:5px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;cursor:pointer;min-height:32px}
.usuario .u-acoes button:hover{background:rgba(255,255,255,.08)}
.usuario .u-acoes button:focus-visible{outline:2px solid #ADD91C;outline-offset:1px}
.arq{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0}
.arq + .arq{margin-top:8px}
.arq-m{flex-basis:100%;font-size:12px;line-height:1.4;overflow-wrap:anywhere}
.arq-novo{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:10px}
.arq-hist{margin-top:12px;font-size:13px}
.arq-hist summary{cursor:pointer;font-weight:600}
.arq-hist ul{margin:8px 0 0;padding-left:18px}
.arq-hist li{margin:4px 0}
.pac-cats{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px}
.pac-cats legend{margin-bottom:6px}
.pac-falta{font-size:13px;color:var(--crit)}
.pac-lista{margin:0;padding-left:18px}
.pac-cod{font-size:26px;font-weight:600;letter-spacing:.3em;max-width:220px}
.foto-campo{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
body.foto-aberta{overflow:hidden}
.foto-ov{position:fixed;inset:0;z-index:2000;background:rgba(21,23,15,.72);display:flex;align-items:flex-end;justify-content:center}
.foto-box{background:var(--bg,#ECECE3);color:var(--ink,#1C1E17);width:100%;max-width:560px;max-height:100%;overflow:auto;border-radius:16px 16px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}
@media (min-width:600px){.foto-ov{align-items:center}.foto-box{border-radius:16px}}
.foto-box header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.foto-box h2{font-size:17px;margin:0}
.foto-prev{background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:10px;display:flex;justify-content:center;align-items:center;min-height:180px}
.foto-prev img{max-width:100%;max-height:52vh;display:block}
.foto-pags{display:flex;gap:8px;overflow-x:auto}
.foto-pags:empty{display:none}
.foto-pag{position:relative;flex:0 0 auto}
.foto-pag>button:first-child{border:2px solid transparent;border-radius:8px;padding:0;background:#fff;position:relative;min-height:44px}
.foto-pag.sel>button:first-child{border-color:var(--accent,#4C6A0A)}
.foto-pag img{height:64px;display:block;border-radius:6px}
.foto-pag span{position:absolute;left:4px;bottom:2px;font-size:12px;font-weight:700;background:rgba(255,255,255,.85);border-radius:4px;padding:0 4px}
.foto-rm{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;border:0;background:var(--crit,#BF3A22);color:#fff;font-size:16px;line-height:1}
.foto-dica{margin:0;font-size:13px;opacity:.85}
.foto-acoes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.foto-acoes .btn{justify-content:center;min-height:44px}
.foto-acoes .primary{grid-column:1/-1}
'''
R('</style>',css+'</style>',cnt=None) if s.count('</style>')==1 else None
if css not in s:
    k=s.index('</style>');s=s[:k]+css+s[k:]

# 6. checagens: nada de dados de exemplo nem de localStorage de dados
for proibido in ["localStorage.setItem(KEY","localStorage.setItem(AUD_KEY","nteam-pessoa"]:
    if proibido in s: sys.exit('AINDA CONTÉM: '+proibido)

out=os.path.join(D,'public');os.makedirs(os.path.join(out,'vendor'),exist_ok=True)
open(os.path.join(out,'index.html'),'w',encoding='utf-8').write(s)
shutil.copy(os.path.join(D,'nuvem_loader.js'),os.path.join(out,'nuvem.js'))
shutil.copy(os.path.join(D,'package','dist','umd','supabase.js'),os.path.join(out,'vendor','supabase-2.117.2.js'))
shutil.copy(os.path.join(D,'chartpkg','package','dist','chart.umd.js'),os.path.join(out,'vendor','chart-4.4.1.umd.min.js'))
shutil.copy(os.path.join(D,'jszippkg','package','dist','jszip.min.js'),os.path.join(out,'vendor','jszip-3.10.1.min.js'))
for f in ['p.html','p.js','p.css']: shutil.copy(os.path.join(D,f),os.path.join(out,f))
# CSP com hash dos scripts embutidos (sem 'unsafe-inline' para scripts)
import re,hashlib,base64,json
h=lambda t:"'sha256-"+base64.b64encode(hashlib.sha256(t.encode('utf-8')).digest()).decode()+"'"
inl=[m.group(1) for m in re.finditer(r'<script>(.*?)</script>',s,re.S)]
app=re.search(r'<script type="text/plain" id="nteam-app">(.*?)</script>',s,re.S).group(1)
hashes=' '.join(h(t) for t in inl+[app])
v=json.load(open(os.path.join(D,'vercel.json')))
csp=v['headers'][0]['headers'][0]
csp['value']=re.sub(r"script-src [^;]*;","script-src 'self' "+hashes+";",csp['value'])
json.dump(v,open(os.path.join(D,'vercel.json'),'w'),ensure_ascii=False,indent=2)
open(os.path.join(D,'csp_hashes.txt'),'w').write(hashes)
print('v13 ok',len(s),'hashes',len(inl)+1)
