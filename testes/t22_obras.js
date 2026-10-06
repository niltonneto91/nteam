// v14 · teste ponta a ponta: registros por obra, perfis (inclui Administrativo de obra), dados sensíveis separados,
// conflito por registro, auditoria, acessos, XSS e sessão. Servidor simulado com as MESMAS regras do banco
// (função pode_registro). Não usa senhas reais nem o banco real.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const PUB=path.join(__dirname,'public');
const R={};const ok=(k,c,info='')=>{R[k]=(c?'OK':'FALHOU')+(info?' · '+String(info).slice(0,260):'')};
const CSP=JSON.parse(fs.readFileSync(path.join(__dirname,'vercel.json'),'utf8')).headers[0].headers[0].value.replace(/connect-src 'self'/,"connect-src 'self' http://localhost:4173");
const base0=JSON.parse(fs.readFileSync(path.join(__dirname,'base_zerada.json'),'utf8'));
for(const k of ['verDadosPessoais','verAtestados','verSaude','editarCadastro','editarSST','registrarAtestado','registrarAusencia','registrarHistorico','solicitarVaga','exportar','gerirDocObra'])base0.cfg.perms[k].push('adm');

/* ---------- servidor simulado ---------- */
const USERS={rh:'u-rh',sst:'u-sst',sstc:'u-sstc',dir:'u-dir',gestor:'u-gestor',enc:'u-enc',adm:'u-adm'};
const PERF={rh:'rh',sst:'sst',sstc:'sst',dir:'dir',gestor:'gestor',enc:'enc',adm:'adm'};
const S={reg:new Map(),seq:0,perfis:Object.entries(USERS).map(([k,id])=>({user_id:id,nome:'Teste '+k.toUpperCase(),email:`t-${k}@example.com`,perfil:PERF[k],obras:[],pessoa_id:'p-teste-'+k,ativo:true,trocar_senha:false,admin_total:k==='dir'})),aud:[],criados:[],chamadas:[]};
S.reg.set('global|principal',{tipo:'global',id:'principal',obras:[],dados:{v:4,cfg:base0.cfg,limpezas:{},migracaoV4:base0.migracaoV4,mobLog:[]},versao:1,ordem:S.seq++});
const eu=uid=>S.perfis.find(x=>x.user_id===uid&&x.ativo&&!x.trocar_senha);
function podeRegistro(uid,tipo,obras){const e=eu(uid);if(!e)return false;const p=e.perfil;const tem=(obras||[]).some(o=>(e.obras||[]).includes(o));
  if(tipo==='global')return true;if(tipo==='financeiro'||tipo==='lote')return ['rh','dir'].includes(p);
  if(tipo==='saude')return p==='rh'||(['sst','adm'].includes(p)&&tem);
  if(['rh','dir'].includes(p))return true;
  if(tipo==='pessoal')return p==='adm'&&tem;if(tipo==='ponto')return ['gestor','adm'].includes(p)&&tem;
  if(['aval','avalrasc','cand'].includes(tipo))return ['gestor','adm'].includes(p)&&tem;
  return tem}
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=uid=>`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.x`;
const uidDoToken=h=>{const t=(h||'').replace(/^Bearer\s+/i,'');try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()).sub}catch(e){return null}};
const regDe=(tipo,id)=>S.reg.get(tipo+'|'+id);
async function servidor(route){
  const req=route.request();const u=new URL(req.url());const m=req.method();const uid=uidDoToken(req.headers()['authorization']);
  const json=(st,b,h={})=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*',...h},body:JSON.stringify(b)});
  if(m==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const p=u.pathname;
  if(p==='/auth/v1/token'){const b=JSON.parse(req.postData()||'{}');const k=(b.email||'').match(/^t-(\w+)@/)?.[1];const id=USERS[k];
    if(!id||b.password!=='senha-de-teste')return json(400,{error:'invalid_grant',error_description:'Invalid login credentials',msg:'Invalid login credentials'});
    return json(200,{access_token:token(id),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+id,user:{id,aud:'authenticated',role:'authenticated',email:b.email}})}
  if(p==='/auth/v1/user')return json(200,{id:uid,aud:'authenticated',role:'authenticated'});
  if(p==='/auth/v1/logout')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  if(p.startsWith('/realtime'))return route.abort();
  if(p==='/rest/v1/perfis'){
    if(m==='GET'){let l=S.perfis.filter(x=>x.user_id===uid||['rh','dir'].includes(eu(uid)?.perfil));const eq=u.searchParams.get('user_id');if(eq)l=l.filter(x=>x.user_id===eq.replace('eq.',''));
      if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return l.length?json(200,l[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,l)}
    if(m==='PATCH'){const alvo=u.searchParams.get('user_id').replace('eq.','');const b=JSON.parse(req.postData());const x=S.perfis.find(y=>y.user_id===alvo);const e=eu(uid)?.perfil;
      if(!['rh','dir'].includes(e)||alvo===uid)return json(200,[]);
      if((b.perfil==='dir'||x.perfil==='dir')&&e!=='dir')return json(403,{code:'42501',message:'so_diretoria'});
      Object.assign(x,b);return json(200,[x])}}
  if(!eu(uid)&&p.startsWith('/rest/v1/'))return json(401,{code:'42501',message:'sem perfil'});
  if(p==='/rest/v1/registro'&&m==='GET'){
    let l=[...S.reg.values()].filter(r=>podeRegistro(uid,r.tipo,r.obras)).sort((a,b)=>a.ordem-b.ordem);
    const ft=u.searchParams.get('tipo'),fi=u.searchParams.get('id');if(ft)l=l.filter(r=>r.tipo===ft.replace(/^eq\./,''));if(fi)l=l.filter(r=>r.id===fi.replace(/^eq\./,''));
    const off=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||1000);l=l.slice(off,off+lim);
    const out=l.map(r=>({tipo:r.tipo,id:r.id,obras:r.obras,dados:JSON.parse(JSON.stringify(r.dados)),versao:r.versao}));
    if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return out.length?json(200,out[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,out)}
  if(p==='/rest/v1/rpc/salvar_registros'){const itens=JSON.parse(req.postData()).p_itens;const copia=new Map([...S.reg].map(([k,v])=>[k,{...v}]));const saida=[];
    for(const it of itens){S.chamadas.push(uid+':'+it.tipo);const k=it.tipo+'|'+it.id;const at=S.reg.get(k);
      const falha=(code,msg)=>{S.reg=copia;return json(code==='40001'?409:403,{code,message:msg,details:JSON.stringify({tipo:it.tipo,id:it.id})})};
      if(it.excluir){if(!at||at.versao!==it.versao||!podeRegistro(uid,at.tipo,at.obras))return falha('40001','conflito');S.reg.delete(k);saida.push({tipo:it.tipo,id:it.id,versao:0});continue}
      if(!podeRegistro(uid,it.tipo,it.obras))return falha('42501','sem_permissao');
      if(!it.versao){if(at)return falha('40001','conflito');S.reg.set(k,{tipo:it.tipo,id:it.id,obras:it.obras,dados:it.dados,versao:1,ordem:S.seq++});saida.push({tipo:it.tipo,id:it.id,versao:1});continue}
      if(!at||at.versao!==it.versao||!podeRegistro(uid,at.tipo,at.obras))return falha('40001','conflito');
      Object.assign(at,{obras:it.obras,dados:it.dados,versao:at.versao+1});saida.push({tipo:it.tipo,id:it.id,versao:at.versao})}
    return json(200,saida)}
  if(p==='/rest/v1/rpc/senha_trocada')return json(200,null);
  if(p==='/rest/v1/auditoria'){
    if(m==='POST'){const l=JSON.parse(req.postData());const x=eu(uid);for(const r of [].concat(l))S.aud.push({...r,id:S.aud.length+1,em:new Date().toISOString(),autor_id:uid,autor_nome:x.nome,autor_perfil:x.perfil});return route.fulfill({status:201,headers:{'access-control-allow-origin':'*'}})}
    if(['rh','dir'].includes(eu(uid).perfil))return json(200,[...S.aud].reverse());return json(200,[])}
  if(p==='/functions/v1/gerir-acesso'){const b=JSON.parse(req.postData());const e=eu(uid)?.perfil;if(!['rh','dir'].includes(e))return json(403,{ok:false,mensagem:'Só RH e Diretoria gerenciam acessos.'});
    if(b.acao==='criar'){if(b.perfil==='dir'&&e!=='dir')return json(403,{ok:false,mensagem:'Só a Diretoria cria acesso com perfil Diretoria.'});const id='u-novo-'+S.criados.length;
      S.perfis.push({user_id:id,nome:b.nome,email:b.email,perfil:b.perfil,obras:b.obras,pessoa_id:b.pessoa_id,ativo:true,trocar_senha:true,admin_total:false});S.criados.push(b);return json(200,{ok:true,user_id:id,senha_temporaria:'TEMP-1234-abcd'})}
    return json(200,{ok:true})}
  return json(404,{message:'não simulado: '+m+' '+p});
}
const srv=http.createServer((q,r)=>{let f=path.join(PUB,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':CSP});r.end(d)})});
const doServ=(tipo,id)=>JSON.stringify(regDe(tipo,id)?.dados||null);

(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch({args:['--lang=pt-BR']});
async function entrar(k){const ctx=await b.newContext({viewport:{width:1280,height:800},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/realtime|websocket|ERR_FAILED|fonts\.g|status of 40[39]/i.test(m.text()))p.errs.push('console: '+m.text())});
  p.on('dialog',d=>d.dismiss());
  await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
  await p.fill('#f-login [name=email]',`t-${k}@example.com`);await p.fill('#f-login [name=senha]','senha-de-teste');await p.click('#f-login button');
  await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await p.waitForTimeout(400);return p}
const esperarSalvo=async p=>{await p.waitForFunction(()=>/Tudo salvo|Dados no servidor/.test(document.getElementById('nv-status')?.textContent||''),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300)};

// 1. RH: base zerada, cria duas obras e um colaborador em cada
const rh=await entrar('rh');
ok('RH entra no sistema zerado, com o perfil vindo do login',await rh.evaluate(()=>DB.colabs.length===0&&DB.cfg.obras.length===0&&UI.perfil==='rh'&&!!document.getElementById('usuario')));
await rh.evaluate(()=>{const mk=(id,nome)=>({id,nome,cliente:'Cliente',cidade:'Cidade',tipo:'Terminal novo',status:'Ativa',trExtra:[],frentes:['Geral'],feriados:[],prazos:{},heRegras:[],docsExigidos:[]});DB.cfg.obras.push(mk('oa','Obra A'),mk('ob','Obra B'));save()});await esperarSalvo(rh);
for(const [nome,obra] of [['Ana Obra A','oa'],['Bruno Obra B','ob']]){
  await rh.evaluate(()=>{document.querySelector('#layer [data-act="fechaFicha"]')?.click();UI.ficha=null;UI.view='colab';render()});await rh.click('[data-act="novoExistente"]');await rh.waitForTimeout(250);
  await rh.fill('#layer [name="nome"]',nome);await rh.fill('#layer [name="tel"]','(62) 90000-0000');await rh.selectOption('#layer [name="funcao"]','sold');await rh.selectOption('#layer [name="obra"]',obra);
  await rh.evaluate(()=>{const f=document.querySelector('#layer form');for(const [n,v] of [['admissao','2026-03-02'],['desde','2026-04-01']]){const e=f.querySelector(`[name="${n}"]`);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}});
  await rh.selectOption('#layer [name="regime"]','Local');await rh.selectOption('#layer [name="vinculo"]','CLT');await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(400)}
const ids=await rh.evaluate(()=>Object.fromEntries(DB.colabs.map(c=>[c.obraId,c.id])));
await rh.evaluate(ids=>{const a=C(ids.oa),b=C(ids.ob);a.cpf='529.982.247-25';a.banco={banco:'Banco A',agencia:'1',conta:'11111-1',tipo:'Corrente',pix:''};a.salario=4321;b.cpf='111.444.777-35';b.salario=5555;save()},ids);await esperarSalvo(rh);
await rh.evaluate(()=>{document.querySelector('#layer [data-act="fechaFicha"]')?.click();UI.ficha=null;UI.view='ates';render()});
for(const [obra,cid] of [['oa','Z11.1'],['ob','Z22.2']]){await rh.click('[data-act="novoAtes"]');await rh.waitForTimeout(250);await rh.selectOption('#layer [name="id"]',ids[obra]);await rh.selectOption('#layer [name="tipo"]','Doença');
  await rh.evaluate(cid=>{const f=document.querySelector('#layer form');for(const [n,v] of [['inicio',addD(hoje,-1)],['dias','2'],['cid',cid],['medico','Dra. Sigilo']]){const e=f.querySelector(`[name="${n}"]`);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}},cid);
  await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(400)}
await esperarSalvo(rh);
const cA=doServ('colab',ids.oa);
ok('Registro do colaborador não contém CPF, banco, salário, CID, médico nem tipo do atestado',!/529\.982|11111-1|4321|Z11\.1|Sigilo|Doença/.test(cA)&&cA.includes('Ana Obra A'),cA.slice(0,120));
ok('Dados pessoais, salário e saúde ficam em registros separados',/529\.982/.test(doServ('pessoal',ids.oa))&&/4321/.test(doServ('financeiro',ids.oa))&&!/4321/.test(doServ('pessoal',ids.oa))&&/Z11\.1/.test(doServ('saude',ids.oa)));
ok('Cada registro leva a obra do colaborador',JSON.stringify(regDe('colab',ids.oa).obras)==='["oa"]'&&JSON.stringify(regDe('saude',ids.ob).obras)==='["ob"]');
ok('Sem erros no RH',!rh.errs.length,rh.errs.join(' | '));

// 2. permissões por obra
S.perfis.find(x=>x.user_id==='u-gestor').obras=['oa'];S.perfis.find(x=>x.user_id==='u-adm').obras=['oa'];S.perfis.find(x=>x.user_id==='u-sst').obras=['ob'];S.perfis.find(x=>x.user_id==='u-sstc').obras=['oa','ob'];
const vis=async p=>p.evaluate(()=>DB.colabs.map(c=>({n:c.nome,cpf:c.cpf||'',sal:c.salario,cid:(c.atestados[0]||{}).cid||'',dias:(c.atestados[0]||{}).dias})));
const ges=await entrar('gestor');const vg=await vis(ges);
ok('Gestor da Obra A só recebe o colaborador da Obra A, sem CPF, salário nem CID',vg.length===1&&vg[0].n==='Ana Obra A'&&!vg[0].cpf&&vg[0].sal==null&&!vg[0].cid&&vg[0].dias===2,JSON.stringify(vg));
const adm=await entrar('adm');const va=await vis(adm);
ok('Administrativo da Obra A recebe CPF e atestado (com CID) só da Obra A, sem salário',va.length===1&&va[0].cpf==='529.982.247-25'&&va[0].cid==='Z11.1'&&va[0].sal==null,JSON.stringify(va));
const sst=await entrar('sst');const vs=await vis(sst);
ok('SST da Obra B recebe só o colaborador da Obra B, com saúde e sem dados pessoais',vs.length===1&&vs[0].n==='Bruno Obra B'&&vs[0].cid==='Z22.2'&&!vs[0].cpf,JSON.stringify(vs));
const sstc=await entrar('sstc');const vc=await vis(sstc);
ok('SST central (obras A e B liberadas) recebe as duas obras',vc.length===2&&vc.every(x=>x.cid),JSON.stringify(vc.map(x=>x.n)));
const enc=await entrar('enc');const ve=await vis(enc);
ok('Encarregado sem obra liberada não recebe nenhum colaborador',ve.length===0,JSON.stringify(ve));
const dir=await entrar('dir');const vd=await vis(dir);
ok('Diretoria recebe todas as obras, com CPF e salário, sem CID',vd.length===2&&vd.every(x=>x.cpf&&x.sal&&!x.cid),JSON.stringify(vd));

// 3. Administrativo grava dados pessoais da sua obra; gestor grava sem apagar dados sensíveis
await adm.evaluate(id=>{C(id).end={...C(id).end,rua:'Rua do Adm'};save()},ids.oa);await esperarSalvo(adm);
ok('Administrativo da obra grava dados pessoais e não toca em salário',/Rua do Adm/.test(doServ('pessoal',ids.oa))&&/4321/.test(doServ('financeiro',ids.oa))&&!S.chamadas.some(x=>x==='u-adm:financeiro'));
await ges.evaluate(id=>{C(id).historico.push({data:hoje,tipo:'Observação',texto:'Nota do gestor',autor:perfilNome()});save()},ids.oa);await esperarSalvo(ges);
ok('Gravação do gestor não apaga dados pessoais, salário nem saúde',/Nota do gestor/.test(doServ('colab',ids.oa))&&/529\.982/.test(doServ('pessoal',ids.oa))&&/4321/.test(doServ('financeiro',ids.oa))&&/Z11\.1/.test(doServ('saude',ids.oa)));
ok('Gestor nunca tenta gravar pessoal, salário ou saúde',!S.chamadas.some(x=>/^u-gestor:(pessoal|financeiro|saude)$/.test(x)),S.chamadas.filter(x=>x.startsWith('u-gestor')).join(','));
ok('Sem erros (gestor, adm, SST)',![...ges.errs,...adm.errs,...sst.errs].length,[...ges.errs,...adm.errs,...sst.errs].join(' | '));

// 4. conflito: RH desatualizado altera o mesmo colaborador em outro campo
await rh.evaluate(id=>{C(id).tel='(62) 98888-0000';save()},ids.oa);await rh.waitForTimeout(2500);
const reg=doServ('colab',ids.oa);
ok('Gravações simultâneas no mesmo colaborador são combinadas (nota do gestor + telefone do RH)',reg.includes('Nota do gestor')&&reg.includes('98888-0000'),reg.slice(0,80));

// 5. transferência: colaborador com alocação futura em B passa a aparecer também para B
await rh.evaluate(id=>{C(id).alocacoes.push({aid:uid(),obraId:'ob',inicio:addD(hoje,10),fim:null,status:'programada',motivo:'Transferência – teste'});save()},ids.oa);await esperarSalvo(rh);
ok('Transferência programada: o colaborador fica visível para as duas obras',JSON.stringify(regDe('colab',ids.oa).obras)==='["oa","ob"]'&&JSON.stringify(regDe('pessoal',ids.oa).obras)==='["oa","ob"]',JSON.stringify(regDe('colab',ids.oa).obras));

// 6. ponto vai para registro por obra e mês
await rh.evaluate(ids=>{for(const o of ['oa','ob'])DB.pontoDia.push({id:uid(),colabId:ids[o],obraId:o,data:hoje,normMin:480,extra:{},pct:{},situacao:'Provisório',origem:'teste',lote:'',por:'RH',em:new Date().toISOString(),obs:''});save()},ids);await esperarSalvo(rh);
const mes=new Date().toISOString().slice(0,7);
ok('Ponto gravado em um registro por obra e mês',!!regDe('ponto','oa|'+mes)&&!!regDe('ponto','ob|'+mes));
const g2=await entrar('gestor');
ok('Gestor da Obra A recebe só o ponto da Obra A',await g2.evaluate(()=>DB.pontoDia.length===1&&DB.pontoDia[0].obraId==='oa'));

// 7. acessos: campo de obras para todos os perfis, exceto RH e Diretoria; novo perfil Administrativo
await dir.evaluate(()=>{DB.cfg.pessoas.push({id:'p-carla',nome:'Carla Adm',perfil:'adm',cargo:'Administrativa',obras:['ob']});save();UI.view='cfg';UI.cfgTab='perfis';render()});await dir.waitForTimeout(300);
const tela=await dir.evaluate(()=>{const tr=[...document.querySelectorAll('#main tr')];const linha=n=>tr.find(t=>[...t.querySelectorAll('input')].some(i=>i.value.includes(n)));return {carla:!!linha('Carla')?.querySelector('[data-cfgpobra]'),rh:/todas \(sempre\)/.test(linha('Teste RH')?.innerText||''),opc:[...document.querySelectorAll('#main select[data-cfg$=".perfil"] option')].some(o=>o.value==='adm')}});
ok('Tela de acessos: obras liberadas para Administrativo; RH mostra "todas (sempre)"; perfil Administrativo disponível',tela.carla&&tela.opc&&tela.rh,JSON.stringify(tela));
const iC=await dir.evaluate(()=>DB.cfg.pessoas.findIndex(p=>p.id==='p-carla'));
await dir.click(`[data-act="acessoCriar"][data-i="${iC}"]`);await dir.fill('#layer [name="email"]','carla@example.com');await dir.click('#layer footer [type="submit"]');await dir.waitForTimeout(800);
ok('Criar acesso do Administrativo leva as obras liberadas para o servidor',S.criados.some(x=>x.perfil==='adm'&&JSON.stringify(x.obras)==='["ob"]'),JSON.stringify(S.criados));
await dir.evaluate(()=>closeModal());

// 8. XSS gravado por perfil de obra não executa
S.aud.push({id:999,em:new Date().toISOString(),autor_id:'u-enc',autor_nome:'Teste ENC',autor_perfil:'enc',modulo:'x',acao:'x',evento:{autor:{id:'sistema'},acao:'<img src=x onerror="window.__xss=1">',campos:[{rot:'<img src=x onerror="window.__xss=2">',op:'<img src=x onerror="window.__xss=3">',de:{txt:'x'},para:{txt:'y'}}],mais:'<img src=x onerror="window.__xss=4">'}});
const gl=regDe('global','principal');gl.dados.cfg.obras[0].nome='<img src=x onerror="window.__xss=5">Obra A';gl.versao++;
const dx=await entrar('dir');for(const v of ['painel','obras','colab','audit','plan','rel'])await dx.evaluate(v=>{UI.view=v;render()},v);await dx.waitForTimeout(400);
ok('Conteúdo malicioso não executa código (escape + CSP)',(await dx.evaluate(()=>window.__xss))===undefined);

// 9. todas as telas, por perfil
for(const [nome,pg] of [['RH',rh],['Diretoria',dir],['Gestor',g2],['Administrativo',adm],['SST',sst],['Encarregado',enc]]){pg.errs.length=0;
  for(const v of ['painel','colab','adm','obras','plan','hosp','ates','ponto','alertas','rel','audit','cfg'])await pg.evaluate(v=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view=v;render()},v);
  const algum=await pg.evaluate(()=>DB.colabs[0]?.id);if(algum)await pg.evaluate(id=>{UI.view='colab';UI.ficha=id;render()},algum);await pg.waitForTimeout(150);
  ok(`${nome}: todas as telas e a ficha abrem sem erro`,!pg.errs.length,pg.errs.slice(0,3).join(' | '))}
await ges.evaluate(()=>{closeModal?.();UI.ficha=null;render()});await ges.click('[data-act="sair"]');await ges.waitForSelector('#f-login',{timeout:8000}).catch(()=>{});
ok('Sair volta para a tela de login',!!(await ges.$('#f-login')));

console.log(Object.entries(R).map(([k,v])=>k.padEnd(104)+' '+v).join('\n'));
const n=Object.values(R).filter(v=>v.startsWith('OK')).length;console.log(`${n}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
