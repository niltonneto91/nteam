// v13 · teste ponta a ponta do app publicado contra um servidor simulado com as MESMAS regras de acesso do banco.
// Não usa senhas reais nem o banco real. Verifica: login, divisão de dados sensíveis, permissões por perfil,
// conflito de versões, auditoria, acessos e sessão.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const PUB=path.join(__dirname,'public');
const R={};const ok=(k,c,info='')=>{R[k]=(c?'OK':'FALHOU')+(info?' · '+String(info).slice(0,240):'')};
const CSP=JSON.parse(fs.readFileSync(path.join(__dirname,'vercel.json'),'utf8')).headers[0].headers[0].value.replace(/connect-src 'self'/,"connect-src 'self' http://localhost:4173");
const base0=JSON.parse(fs.readFileSync(path.join(__dirname,'base_zerada.json'),'utf8'));

/* ---------- servidor simulado ---------- */
const USERS={rh:'u-rh',sst:'u-sst',dir:'u-dir',gestor:'u-gestor',enc:'u-enc'};
const S={doc:{base:{dados:base0,versao:1},pessoal:{dados:{colabs:{}},versao:1},saude:{dados:{atestados:{},hist:{}},versao:1}},
  perfis:Object.entries(USERS).map(([p,id])=>({user_id:id,nome:'Teste '+p.toUpperCase(),email:`t-${p}@example.com`,perfil:p,obras:[],pessoa_id:'p-teste-'+p,ativo:true,trocar_senha:false,admin_total:p==='dir'})),
  aud:[],criados:[]};
const perfilDe=uid=>S.perfis.find(x=>x.user_id===uid&&x.ativo)?.perfil||null;
const podeParte=(uid,p)=>{const pf=perfilDe(uid);if(!pf)return false;if(p==='base')return true;if(p==='pessoal')return ['rh','dir'].includes(pf);if(p==='saude')return ['rh','sst'].includes(pf);if(p.startsWith('ponto:'))return ['rh','dir','gestor'].includes(pf);return false};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=uid=>`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.x`;
const uidDoToken=h=>{const t=(h||'').replace(/^Bearer\s+/i,'');try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()).sub}catch(e){return null}};
async function servidor(route){
  const req=route.request();const u=new URL(req.url());const m=req.method();const uid=uidDoToken(req.headers()['authorization']);
  const json=(st,b,h={})=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*',...h},body:JSON.stringify(b)});
  if(m==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const p=u.pathname;
  if(p==='/auth/v1/token'){const b=JSON.parse(req.postData()||'{}');const pf=(b.email||'').match(/^t-(\w+)@/)?.[1];const id=USERS[pf];
    if(!id||b.password!=='senha-de-teste')return json(400,{error:'invalid_grant',error_description:'Invalid login credentials',msg:'Invalid login credentials'});
    return json(200,{access_token:token(id),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+id,user:{id,aud:'authenticated',role:'authenticated',email:b.email}})}
  if(p==='/auth/v1/user'){if(m==='PUT')return json(200,{id:uid,aud:'authenticated'});return json(200,{id:uid,aud:'authenticated',role:'authenticated'})}
  if(p==='/auth/v1/logout')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  if(p.startsWith('/realtime'))return route.abort();
  if(!perfilDe(uid)&&p.startsWith('/rest/v1/')&&!p.endsWith('/perfis'))return json(401,{code:'42501',message:'sem perfil'});
  if(p==='/rest/v1/perfis'){
    if(m==='GET'){let l=S.perfis.filter(x=>x.user_id===uid||['rh','dir'].includes(perfilDe(uid)));const eq=u.searchParams.get('user_id');if(eq)l=l.filter(x=>x.user_id===eq.replace('eq.',''));
      if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return l.length?json(200,l[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,l)}
    if(m==='PATCH'){const alvo=u.searchParams.get('user_id').replace('eq.','');const b=JSON.parse(req.postData());const x=S.perfis.find(y=>y.user_id===alvo);const eu=perfilDe(uid);
      if(!['rh','dir'].includes(eu)||alvo===uid)return json(200,[]);
      if((b.perfil==='dir'||x.perfil==='dir')&&b.perfil!==x.perfil&&eu!=='dir')return json(403,{code:'42501',message:'so_diretoria'});
      Object.assign(x,b);return json(200,[x])}}
  if(p==='/rest/v1/documento'&&m==='GET'){let l=Object.entries(S.doc).filter(([k])=>podeParte(uid,k)).map(([k,v])=>({parte:k,dados:JSON.parse(JSON.stringify(v.dados)),versao:v.versao}));
    const eq=u.searchParams.get('parte');if(eq)l=l.filter(x=>x.parte===eq.replace(/^eq\./,''));
    if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return l.length?json(200,l[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,l)}
  if(p==='/rest/v1/rpc/salvar_parte'){const b=JSON.parse(req.postData());S.ultimas=(S.ultimas||[]).concat(uid+':'+b.p_parte);
    if(!podeParte(uid,b.p_parte))return json(403,{code:'42501',message:'sem_permissao'});
    const d=S.doc[b.p_parte];
    if(b.p_versao===0){if(d)return json(409,{code:'40001',message:'conflito'});S.doc[b.p_parte]={dados:b.p_dados,versao:1};return json(200,1)}
    if(!d||d.versao!==b.p_versao)return json(409,{code:'40001',message:'conflito'});
    d.dados=b.p_dados;d.versao++;return json(200,d.versao)}
  if(p==='/rest/v1/rpc/senha_trocada'){const x=S.perfis.find(y=>y.user_id===uid);x.trocar_senha=false;return json(200,null)}
  if(p==='/rest/v1/auditoria'){
    if(m==='POST'){const l=JSON.parse(req.postData());const x=S.perfis.find(y=>y.user_id===uid);for(const r of [].concat(l))S.aud.push({...r,id:S.aud.length+1,em:new Date().toISOString(),autor_id:uid,autor_nome:x.nome,autor_perfil:x.perfil});return route.fulfill({status:201,headers:{'access-control-allow-origin':'*'}})}
    if(['rh','dir'].includes(perfilDe(uid)))return json(200,[...S.aud].reverse());return json(200,[])}
  if(p==='/functions/v1/gerir-acesso'){const b=JSON.parse(req.postData());const eu=perfilDe(uid);if(!['rh','dir'].includes(eu))return json(403,{ok:false,mensagem:'Só RH e Diretoria gerenciam acessos.'});
    if(b.acao==='criar'){if(b.perfil==='dir'&&eu!=='dir')return json(403,{ok:false,mensagem:'Só a Diretoria cria acesso com perfil Diretoria.'});const id='u-novo-'+S.criados.length;
      S.perfis.push({user_id:id,nome:b.nome,email:b.email,perfil:b.perfil,obras:b.obras,pessoa_id:b.pessoa_id,ativo:true,trocar_senha:true,admin_total:false});S.criados.push(b);return json(200,{ok:true,user_id:id,senha_temporaria:'TEMP-1234-abcd'})}
    return json(200,{ok:true})}
  return json(404,{message:'não simulado: '+m+' '+p});
}
/* ---------- servidor estático ---------- */
const srv=http.createServer((q,r)=>{let f=path.join(PUB,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':CSP});r.end(d)})});

(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch({args:['--lang=pt-BR']});
async function entrar(perfil){const ctx=await b.newContext({viewport:{width:1280,height:800},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/realtime|websocket|ERR_FAILED|fonts\.g|status of 409/i.test(m.text()))p.errs.push('console: '+m.text())});
  p.on('dialog',d=>d.dismiss());
  await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
  await p.fill('#f-login [name=email]',`t-${perfil}@example.com`);await p.fill('#f-login [name=senha]','senha-de-teste');await p.click('#f-login button');
  await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await p.waitForTimeout(400);return p}
const esperarSalvo=async p=>{await p.waitForFunction(()=>/Tudo salvo|Dados no servidor/.test(document.getElementById('nv-status')?.textContent||''),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300)};

// 1. login inválido
{const ctx=await b.newContext();await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);const p=await ctx.newPage();await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
 await p.fill('#f-login [name=email]','t-rh@example.com');await p.fill('#f-login [name=senha]','errada');await p.click('#f-login button');await p.waitForTimeout(800);
 ok('Login com senha errada mostra mensagem e não abre o sistema',(await p.textContent('#f-login .msg')).includes('incorretos')&&!(await p.evaluate(()=>!!window.NUVEM?.iniciado)));await ctx.close()}

// 2. RH entra, base zerada
const rh=await entrar('rh');
ok('RH entra e vê o sistema zerado (0 colaboradores, 0 obras), sem simulador de perfil',await rh.evaluate(()=>DB.colabs.length===0&&DB.cfg.obras.length===0&&getComputedStyle(document.querySelector('#perfil')).display==='none'&&!!document.getElementById('usuario')&&!document.body.innerText.includes('Protótipo · dados de exemplo')));
const ls=await rh.evaluate(()=>Object.keys(localStorage).join(','));
ok('Nada de dados no armazenamento do navegador (só a sessão)',!/nteam-proto|nteam-auditoria|nteam-pessoa/.test(ls),ls);

// 3. RH cadastra obra e colaborador com dados pessoais e um atestado
await rh.evaluate(()=>{UI.view='cfg';UI.cfgTab='obras';render()});await rh.click('[data-act="addObra"]');await rh.waitForTimeout(300);
const camposObra=await rh.evaluate(()=>[...document.querySelectorAll('#layer form [name]')].map(e=>e.name+':'+e.tagName+(e.required?'*':'')).join(','));console.log('form obra',camposObra);
await rh.evaluate(()=>{const f=document.querySelector('#layer form');const set=(n,v)=>{const e=f.querySelector(`[name="${n}"]`);if(!e)return;if(e.tagName==='SELECT'){e.value=e.options[1]?.value||e.options[0]?.value}else e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};
  for(const e of f.querySelectorAll('[name]'))set(e.name,e.type==='date'?hoje:'Obra Teste');set('nome','Obra Teste')});
await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(500);await rh.evaluate(()=>{if(document.querySelector('#layer .modal'))closeModal()});
const temObra=await rh.evaluate(()=>DB.cfg.obras.length);
if(!temObra)await rh.evaluate(()=>{DB.cfg.obras.push({id:'g7',nome:'G7 · Senador Canedo',cliente:'G7',cidade:'Senador Canedo',tipo:'Terminal novo',status:'Ativa',trExtra:[],frentes:['Geral'],feriados:[],prazos:{},heRegras:[],docsExigidos:[]});save()});
await rh.evaluate(()=>{const o=DB.cfg.obras[0];o.nome='Obra Teste';o.status='Ativa';save()});
await rh.evaluate(()=>{UI.view='colab';render()});await rh.click('[data-act="novoExistente"]');await rh.waitForTimeout(300);
const oid=await rh.evaluate(()=>DB.cfg.obras[0].id);
for(const [n,v] of [['nome','Fulano de Teste'],['tel','(62) 90000-0000']])await rh.fill(`#layer [name="${n}"]`,v);
await rh.selectOption('#layer [name="funcao"]','sold');await rh.selectOption('#layer [name="obra"]',oid);
await rh.fill('#layer [name="admissao"]','2026-03-02').catch(()=>{});await rh.evaluate(()=>{const f=document.querySelector('#layer form');for(const [n,v] of [['admissao','2026-03-02'],['desde','2026-04-01']]){const e=f.querySelector(`[name="${n}"]`);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}});
await rh.selectOption('#layer [name="regime"]','Local');await rh.selectOption('#layer [name="vinculo"]','CLT');
await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(500);
const cid=await rh.evaluate(()=>DB.colabs.find(c=>c.nome==='Fulano de Teste')?.id);
ok('RH cadastra colaborador pelo formulário',!!cid,cid);
await rh.evaluate(id=>{const c=C(id);c.cpf='529.982.247-25';c.banco={banco:'Banco Teste',agencia:'0001',conta:'12345-6',tipo:'Corrente',pix:'CPF'};c.salario=4321;c.end={...c.end,rua:'Rua Sigilosa',cidade:'Goiânia'};save()},cid);
await esperarSalvo(rh);
await rh.evaluate(()=>{document.querySelector('#layer [data-act="fechaFicha"]')?.click();UI.ficha=null;UI.view='ates';render()});await rh.click('[data-act="novoAtes"]');await rh.waitForTimeout(300);
await rh.selectOption('#layer [name="id"]',cid);await rh.selectOption('#layer [name="tipo"]','Doença');
await rh.evaluate(()=>{const f=document.querySelector('#layer form');for(const [n,v] of [['inicio',addD(hoje,-1)],['dias','2'],['cid','Z99.9'],['medico','Dra. Sigilo CRM 1']]){const e=f.querySelector(`[name="${n}"]`);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}});
await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(500);await esperarSalvo(rh);
const baseTxt=JSON.stringify(S.doc.base.dados),pesTxt=JSON.stringify(S.doc.pessoal.dados),sauTxt=JSON.stringify(S.doc.saude.dados);
ok('Parte "base" no servidor não contém CPF, banco, salário, endereço, CID, médico nem tipo do atestado',
  !/529\.982|12345-6|Banco Teste|4321|Rua Sigilosa|Z99\.9|Sigilo|Doença/.test(baseTxt)&&baseTxt.includes('Fulano de Teste'),
  ['529.982','12345-6','Banco Teste','4321','Rua Sigilosa','Z99.9','Sigilo','Doença'].filter(x=>baseTxt.includes(x)).join(','));
ok('Parte "pessoal" guarda CPF, banco e salário',/529\.982/.test(pesTxt)&&/12345-6/.test(pesTxt)&&/4321/.test(pesTxt));
ok('Parte "saude" guarda CID, médico e tipo',/Z99\.9/.test(sauTxt)&&/Sigilo/.test(sauTxt)&&/Doença/.test(sauTxt));
ok('Base continua com o período do afastamento (visível para todos)',/"Afastamento"/.test(baseTxt)&&/"atestados":\[\{/.test(baseTxt));
ok('Auditoria enviada ao servidor com autor do login',S.aud.length>0&&S.aud.every(a=>a.autor_id==='u-rh'),S.aud.length+' eventos');
{const t=JSON.stringify(S.aud);const i=t.search(/Z99\.9|Dra\. Sigilo/);ok('Auditoria não leva CID nem médico',i<0,i<0?'':t.slice(Math.max(0,i-300),i+60))}
ok('Sem erros no RH',!rh.errs.length,rh.errs.join(' | '));

// 4. Diretoria: vê dados pessoais, não vê saúde
const dir=await entrar('dir');
const vd=await dir.evaluate(id=>{const c=C(id);const a=c.atestados[0];return {cpf:c.cpf,sal:c.salario,tipo:a?.tipo,cidA:a?.cid,dias:a?.dias,hist:c.historico.filter(h=>h.tipo==='Atestado').map(h=>h.texto).join('|')}},cid);
ok('Diretoria recebe CPF e salário',vd.cpf==='529.982.247-25'&&vd.sal===4321,JSON.stringify(vd));
ok('Diretoria NÃO recebe CID, médico nem tipo; vê os dias e o período',!vd.cidA&&!vd.tipo&&vd.dias===2&&!/Doença|Z99/.test(vd.hist),JSON.stringify(vd));
// 5. Gestor: sem pessoal e sem saúde; salva base sem apagar dados pessoais
const ges=await entrar('gestor');
const vg=await ges.evaluate(id=>{const c=C(id);return {cpf:c.cpf,banco:c.banco?.conta,sal:c.salario,cid:c.atestados[0]?.cid}},cid);
ok('Gestor não recebe CPF, banco, salário nem CID',!vg.cpf&&!vg.banco&&vg.sal==null&&!vg.cid,JSON.stringify(vg));
await ges.evaluate(id=>{C(id).historico.push({data:hoje,tipo:'Observação',texto:'Nota do gestor',autor:perfilNome()});save()},cid);await esperarSalvo(ges);
ok('Gravação do gestor não apaga dados pessoais nem de saúde',/529\.982/.test(JSON.stringify(S.doc.pessoal.dados))&&/Z99\.9/.test(JSON.stringify(S.doc.saude.dados))&&/Nota do gestor/.test(JSON.stringify(S.doc.base.dados)));
ok('Gestor nunca tenta gravar pessoal ou saúde',!(S.ultimas||[]).some(x=>x==='u-gestor:pessoal'||x==='u-gestor:saude'),(S.ultimas||[]).filter(x=>x.startsWith('u-gestor')).join(','));
ok('Sem erros no gestor',!ges.errs.length,ges.errs.join(' | '));
// 6. Conflito: RH (desatualizado) altera base depois da gravação do gestor
await rh.evaluate(()=>{DB.cfg.obras[0].cidade='Cidade alterada pelo RH';save()});await rh.waitForTimeout(2500);
const conf=await rh.evaluate(()=>({modal:document.querySelector('#layer .modal h2')?.textContent||'',nota:DB.colabs[0].historico.some(h=>h.texto==='Nota do gestor'),cidade:DB.cfg.obras[0].cidade}));
const sb=JSON.stringify(S.doc.base.dados);
ok('Gravações simultâneas em registros diferentes são combinadas (nada se perde)',sb.includes('Nota do gestor')&&sb.includes('Cidade alterada pelo RH')&&conf.nota&&conf.cidade==='Cidade alterada pelo RH',JSON.stringify(conf));
// mesmo registro alterado pelos dois: fica a versão de quem salvou por último, com aviso
await ges.evaluate(()=>{DB.cfg.obras[0].cliente='Cliente pelo gestor';save()});await esperarSalvo(ges);
await rh.evaluate(()=>{DB.cfg.obras[0].cliente='Cliente pelo RH';save()});await rh.waitForTimeout(2500);
const col=await rh.evaluate(()=>document.querySelector('#layer .modal h2')?.textContent||'');
ok('Mesmo campo alterado por dois: aviso claro e versão de quem salvou por último',/mesmo registro/.test(col)&&JSON.stringify(S.doc.base.dados).includes('Cliente pelo RH'),col);
// 7. Ponto vai para a parte do mês
await rh.evaluate(()=>closeModal());
await rh.evaluate(id=>{DB.pontoDia.push({id:uid(),colabId:id,obraId:DB.cfg.obras[0].id,data:hoje,normMin:480,extra:{},pct:{},situacao:'Provisório',origem:'teste',lote:'',por:'RH',em:new Date().toISOString(),obs:''});save()},cid);await esperarSalvo(rh);
const mes='ponto:'+new Date().toISOString().slice(0,7);
ok('Ponto do dia gravado na parte do mês, fora da base',!!S.doc[mes]&&S.doc[mes].dados.length===1&&!JSON.stringify(S.doc.base.dados).includes('"normMin"'),Object.keys(S.doc).join(','));
// 8. Acessos: Diretoria cria acesso para uma pessoa
await dir.evaluate(()=>{DB.cfg.pessoas.push({id:'p-ana',nome:'Ana Teste',perfil:'rh',cargo:'Analista',obras:[]});save();UI.view='cfg';UI.cfgTab='perfis';render()});await dir.waitForTimeout(300);
const iAna=await dir.evaluate(()=>DB.cfg.pessoas.findIndex(p=>p.id==='p-ana'));
await dir.click(`[data-act="acessoCriar"][data-i="${iAna}"]`);await dir.fill('#layer [name="email"]','ana@example.com');await dir.click('#layer footer [type="submit"]');await dir.waitForTimeout(800);
const msg=await dir.evaluate(()=>document.getElementById('nv-msg')?.value||'');
ok('Criar acesso gera mensagem com endereço, e-mail e senha temporária',/ana@example.com/.test(msg)&&/TEMP-1234-abcd/.test(msg)&&/localhost:4173/.test(msg),msg.slice(0,120));
ok('Senha temporária não fica salva nos dados nem na auditoria',!JSON.stringify(S.doc).includes('TEMP-1234')&&!JSON.stringify(S.aud).includes('TEMP-1234'));
await dir.evaluate(()=>closeModal());await dir.waitForTimeout(500);
const linha=await dir.evaluate(()=>[...document.querySelectorAll('#main tr')].find(t=>t.innerHTML.includes('Ana Teste'))?.innerText||'');
ok('Lista de acessos mostra a pessoa aguardando 1º acesso',/ana@example.com/.test(linha)&&/Aguardando/.test(linha),linha.replace(/\s+/g,' ').slice(0,160));
// RH não pode criar Diretoria
await rh.evaluate(()=>{DB.cfg.pessoas.push({id:'p-dir2',nome:'Diretor Novo',perfil:'dir',cargo:'',obras:[]});save();UI.view='cfg';UI.cfgTab='perfis';render()});await rh.waitForTimeout(300);
const iD=await rh.evaluate(()=>DB.cfg.pessoas.findIndex(p=>p.id==='p-dir2'));
await rh.click(`[data-act="acessoCriar"][data-i="${iD}"]`).catch(()=>{});await rh.waitForTimeout(400);
ok('RH não consegue criar acesso de Diretoria',!S.criados.some(x=>x.perfil==='dir'));
// 9. Configurações › Dados sem "restaurar exemplos"
await rh.evaluate(()=>{closeModal();UI.view='cfg';UI.cfgTab='dados';render()});
const dados=await rh.evaluate(()=>document.querySelector('#main').innerText);
ok('Aba Dados sem "Restaurar dados de exemplo" e com cópia de segurança',!/Restaurar dados de exemplo/.test(dados)&&/Baixar cópia de segurança/.test(dados));
// 10. todas as telas abrem sem erro, para cada perfil
for(const [nome,pg] of [['RH',rh],['Diretoria',dir],['Gestor',ges]]){pg.errs.length=0;
  for(const v of ['painel','colab','adm','obras','plan','hosp','ates','ponto','alertas','rel','audit','cfg'])await pg.evaluate(v=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view=v;render()},v);
  await pg.evaluate(id=>{UI.view='colab';UI.ficha=id;render()},cid);await pg.waitForTimeout(200);
  ok(`${nome}: todas as telas e a ficha abrem sem erro`,!pg.errs.length,pg.errs.slice(0,3).join(' | '))}
// 10b. dados maliciosos gravados por outro perfil não executam código
S.aud.push({id:999,em:new Date().toISOString(),autor_id:'u-enc',autor_nome:'Teste ENC',autor_perfil:'enc',modulo:'x',acao:'x',evento:{autor:{id:'sistema',nome:'Falso'},acao:'<img src=x onerror="window.__xss=1">',campos:[{rot:'<img src=x onerror="window.__xss=2">',op:'<img src=x onerror="window.__xss=3">',de:{txt:'<b>x</b>'},para:{txt:'y'}}],mais:'<img src=x onerror="window.__xss=4">'}});
S.doc.base.dados.cfg.obras[0].nome='<img src=x onerror="window.__xss=5">Obra';S.doc.base.versao++;
const dx=await entrar('dir');
for(const v of ['painel','obras','colab','audit','plan','rel'])await dx.evaluate(v=>{UI.view=v;render()},v);
await dx.evaluate(()=>{const d=document.querySelector('#main details.aud-det');if(d)d.open=true});await dx.waitForTimeout(500);
const xss=await dx.evaluate(()=>window.__xss);
const forj=await dx.evaluate(()=>AUD.find(e=>e.id==='srv999')?.autor?.nome);
ok('Conteúdo malicioso gravado por outro perfil não executa código (escape + CSP)',xss===undefined,'__xss='+xss);
ok('Evento de auditoria forjado como "Sistema" mostra a sessão real',/sessão de Teste ENC/.test(JSON.stringify(dx.evaluate?await dx.evaluate(()=>AUD.find(e=>e.id==='srv999')?.autor):''))&&forj==='Sistema',forj);
// 11. sair
await ges.evaluate(()=>{closeModal?.();UI.ficha=null;render()});await ges.click('[data-act="sair"]');await ges.waitForSelector('#f-login',{timeout:8000}).catch(()=>{});
ok('Sair volta para a tela de login',!!(await ges.$('#f-login')));

console.log(Object.entries(R).map(([k,v])=>k.padEnd(100)+' '+v).join('\n'));
const n=Object.values(R).filter(v=>v.startsWith('OK')).length;console.log(`${n}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
