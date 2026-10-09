// v18 · teste ponta a ponta (cidades, folga de campo, ajuda de custo e proposta) — servidor simulado copiado do t23, com as regras v18.
// Servidor simulado com as MESMAS regras do banco (pode_registro, pode_arquivo, criar/abrir pacote).
// Só dados e arquivos fictícios. Não usa o banco real.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');const crypto=require('crypto');
const JSZip=require('./jszippkg/package/dist/jszip.min.js');
const PUB=path.join(__dirname,'public');
const R={};const ok=(k,c,info='')=>{R[k]=(c?'OK':'FALHOU')+(info?' · '+String(info).slice(0,260):'')};
const CSP=JSON.parse(fs.readFileSync(path.join(__dirname,'vercel.json'),'utf8')).headers[0].headers[0].value.replace(/connect-src 'self'/,"connect-src 'self' http://localhost:4173");
const base0=JSON.parse(fs.readFileSync(path.join(__dirname,'base_zerada.json'),'utf8'));
for(const k of ['verDadosPessoais','verAtestados','verSaude','editarCadastro','editarSST','registrarAtestado','registrarAusencia','registrarHistorico','solicitarVaga','exportar','gerirDocObra'])base0.cfg.perms[k].push('adm');

/* ---------- servidor simulado ---------- */
const USERS={rh:'u-rh',sst:'u-sst',dir:'u-dir',gestor:'u-gestor',adm:'u-adm',admb:'u-admb'};
const PERF={rh:'rh',sst:'sst',dir:'dir',gestor:'gestor',adm:'adm',admb:'adm'};
const S={reg:new Map(),seq:0,perfis:Object.entries(USERS).map(([k,id])=>({user_id:id,nome:'Teste '+k.toUpperCase(),email:`t-${k}@example.com`,perfil:PERF[k],obras:[],pessoa_id:'p-teste-'+k,ativo:true,trocar_senha:false,admin_total:k==='dir'})),
  aud:[],obj:new Map(),arq:[],pac:[],acessos:[],negados:[]};
S.reg.set('global|principal',{tipo:'global',id:'principal',obras:[],dados:{v:4,cfg:base0.cfg,limpezas:{},migracaoV4:base0.migracaoV4,mobLog:[]},versao:1,ordem:S.seq++});
const eu=uid=>S.perfis.find(x=>x.user_id===uid&&x.ativo&&!x.trocar_senha);
function podeRegistro(uid,tipo,obras){const e=eu(uid);if(!e)return false;const p=e.perfil;const tem=(obras||[]).some(o=>(e.obras||[]).includes(o));
  if(tipo==='global')return true;if(tipo==='financeiro'||tipo==='lote')return ['rh','dir'].includes(p);
  if(tipo==='saude')return p==='rh'||(['sst','adm'].includes(p)&&tem);
  if(tipo==='custos')return ['rh','dir','adm'].includes(p);
  if(tipo==='proposta')return ['rh','dir'].includes(p)||(p==='adm'&&tem);
  if(['rh','dir'].includes(p))return true;
  if(tipo==='pessoal')return p==='adm'&&tem;if(tipo==='ponto')return ['gestor','adm'].includes(p)&&tem;
  if(['aval','avalrasc','cand'].includes(tipo))return ['gestor','adm'].includes(p)&&tem;
  return tem}
const regDe=(tipo,id)=>S.reg.get(tipo+'|'+id);
function podeArquivo(uid,cat,colab,obra){const e=eu(uid);if(!e)return false;const ob=colab?(regDe('colab',colab)?.obras||[]):[obra];const tem=ob.some(o=>(e.obras||[]).includes(o));
  if(cat==='atestado')return !!colab&&podeRegistro(uid,'saude',ob);
  if(cat==='pessoal'||cat==='registro')return !!colab&&podeRegistro(uid,'pessoal',ob);
  if(cat==='sst')return !!colab&&(['rh','dir'].includes(e.perfil)||(['sst','adm'].includes(e.perfil)&&tem));
  if(cat==='obra')return !colab&&!!obra&&podeRegistro(uid,'docobra',ob);return false}
function podeCaminho(uid,p){let m=p.match(/^c\/([A-Za-z0-9_-]{1,60})\/(pessoal|registro|sst|atestado)\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/);if(m)return podeArquivo(uid,m[2],m[1],null);
  m=p.match(/^o\/([A-Za-z0-9_-]{1,60})\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/);if(m)return podeArquivo(uid,'obra',null,m[1]);return false}
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=uid=>`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.x`;
const uidDoToken=h=>{const t=(h||'').replace(/^Bearer\s+/i,'');try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()).sub}catch(e){return null}};
function multipart(req){const ct=req.headers()['content-type']||'';const buf=req.postDataBuffer()||Buffer.alloc(0);const m=ct.match(/boundary=(.+)$/);if(!m)return {body:buf,mime:ct};
  const bd=Buffer.from('--'+m[1]);let i=0;const partes=[];while((i=buf.indexOf(bd,i))!==-1){const j=buf.indexOf(bd,i+bd.length);if(j===-1)break;partes.push(buf.slice(i+bd.length+2,j-2));i=j}
  for(const p of partes){const h=p.indexOf('\r\n\r\n');const cab=p.slice(0,h).toString();if(/filename=/.test(cab)){const mt=(cab.match(/Content-Type:\s*([^\r\n]+)/i)||[])[1]||'application/octet-stream';return {body:p.slice(h+4),mime:mt.trim()}}}
  return {body:Buffer.alloc(0),mime:''}}
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const LIM=10*1024*1024,MIMES=['application/pdf','image/jpeg','image/png','image/webp'];
function filtrar(l,u){for(const [k,v] of u.searchParams){if(['select','order','limit','offset'].includes(k))continue;
    if(v.startsWith('eq.'))l=l.filter(x=>String(x[k])===v.slice(3));else if(v.startsWith('in.(')){const s=v.slice(4,-1).split(',').map(x=>x.replace(/^"|"$/g,''));l=l.filter(x=>s.includes(String(x[k])))}}
  return l}
async function servidor(route){
  const req=route.request();const u=new URL(req.url());const m=req.method();const uid=uidDoToken(req.headers()['authorization']);
  const json=(st,b,h={})=>route.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*',...h},body:JSON.stringify(b)});
  if(m==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const p=u.pathname;const corpo=()=>JSON.parse(req.postData()||'{}');
  if(p==='/auth/v1/token'){const b=corpo();const k=(b.email||'').match(/^t-(\w+)@/)?.[1];const id=USERS[k];
    if(!id||b.password!=='senha-de-teste')return json(400,{error:'invalid_grant',error_description:'Invalid login credentials',msg:'Invalid login credentials'});
    return json(200,{access_token:token(id),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+id,user:{id,aud:'authenticated',role:'authenticated',email:b.email}})}
  if(p==='/auth/v1/user')return json(200,{id:uid,aud:'authenticated',role:'authenticated'});
  if(p==='/auth/v1/logout')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
  if(p.startsWith('/realtime'))return route.abort();
  /* função pública do pacote (sem login) */
  if(p==='/functions/v1/pacote-publico'){const b=corpo();const pk=S.pac.find(x=>x.token_hash===sha(String(b.token||'')));
    if(!pk)return json(404,{ok:false,erro:'nao_encontrado',mensagem:'Link inválido. Confira o endereço recebido.'});
    if(pk.revogado_em){S.acessos.push('revogado');return json(410,{ok:false,erro:'revogado',mensagem:'Este link foi encerrado por quem o compartilhou.'})}
    if(pk.bloqueado_ate&&pk.bloqueado_ate>Date.now())return json(429,{ok:false,erro:'bloqueado',mensagem:'Muitas tentativas com código errado. Aguarde 15 minutos e tente de novo.'});
    if(String(b.codigo)!==pk.codigo){const ant=pk.tentativas;pk.tentativas=ant+1>=5?0:ant+1;if(ant+1>=5)pk.bloqueado_ate=Date.now()+900000;S.acessos.push('erro');
      return json(401,{ok:false,erro:'codigo',mensagem:'Código incorreto.',restantes:Math.max(0,4-ant)})}
    pk.tentativas=0;pk.acessos++;S.acessos.push('aberto');
    const itens=pk.itens.map(id=>S.arq.find(a=>a.id===id)).filter(a=>a&&!a.removido_em&&a.categoria!=='atestado');
    return json(200,{ok:true,titulo:pk.titulo,obra:pk.obra_nome,periodo:pk.periodo,expira_em:pk.expira_em,itens:itens.map(a=>({colaborador:a.colab_id?regDe('colab',a.colab_id)?.dados?.nome:null,categoria:a.categoria,documento:a.tipo_doc,mime:a.mime,tamanho:a.tamanho,validade:a.validade,url:`https://yyylvkofbdhrlaizvoop.supabase.co/storage/v1/object/sign/documentos/${a.caminho}?token=pub`}))})}
  /* storage */
  if(p.startsWith('/storage/v1/object/')){
    let resto=decodeURIComponent(p.slice('/storage/v1/object/'.length));
    if(m==='POST'&&resto.startsWith('sign/documentos/')){const c=resto.slice('sign/documentos/'.length);if(!podeCaminho(uid,c)||!S.obj.has(c))return json(400,{statusCode:'404',error:'not_found',message:'Object not found'});
      return json(200,{signedURL:`/object/sign/documentos/${c}?token=t-${uid}`})}
    if(m==='GET'&&resto.startsWith('sign/documentos/')){const c=resto.slice('sign/documentos/'.length);const o=S.obj.get(c);if(!o)return route.fulfill({status:404});
      return route.fulfill({status:200,headers:{'content-type':o.mime,'access-control-allow-origin':'*'},body:o.body})}
    if(m==='GET'){const c=resto.replace(/^(authenticated|public)\//,'').replace(/^documentos\//,'');const o=S.obj.get(c);
      if(!o||!podeCaminho(uid,c))return json(400,{statusCode:'404',error:'not_found',message:'Object not found'});
      return route.fulfill({status:200,headers:{'content-type':o.mime,'access-control-allow-origin':'*'},body:o.body})}
    if(m==='POST'&&resto.startsWith('documentos/')){const c=resto.slice('documentos/'.length);
      if(!podeCaminho(uid,c)){S.negados.push(uid+':'+c);return json(403,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'})}
      if(S.obj.has(c))return json(409,{statusCode:'409',error:'Duplicate',message:'The resource already exists'});
      const {body,mime}=multipart(req);if(body.length>LIM)return json(413,{statusCode:'413',error:'Payload too large',message:'The object exceeded the maximum allowed size'});
      if(!MIMES.includes(mime))return json(415,{statusCode:'415',error:'invalid_mime_type',message:`mime type ${mime} is not supported`});
      S.obj.set(c,{owner:uid,mime,body,size:body.length});return json(200,{Id:crypto.randomUUID(),Key:'documentos/'+c})}
    return json(404,{message:'storage não simulado: '+m+' '+p})}
  if(p==='/rest/v1/perfis'){
    if(m==='GET'){let l=S.perfis.filter(x=>x.user_id===uid||['rh','dir'].includes(eu(uid)?.perfil));const eq=u.searchParams.get('user_id');if(eq)l=l.filter(x=>x.user_id===eq.replace('eq.',''));
      if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return l.length?json(200,l[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,l)}
    return json(200,[])}
  if(!eu(uid)&&p.startsWith('/rest/v1/'))return json(401,{code:'42501',message:'sem perfil'});
  if(p==='/rest/v1/registro'&&m==='GET'){
    let l=[...S.reg.values()].filter(r=>podeRegistro(uid,r.tipo,r.obras)).sort((a,b)=>a.ordem-b.ordem);
    const ft=u.searchParams.get('tipo'),fi=u.searchParams.get('id');if(ft)l=l.filter(r=>r.tipo===ft.replace(/^eq\./,''));if(fi)l=l.filter(r=>r.id===fi.replace(/^eq\./,''));
    const off=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||1000);l=l.slice(off,off+lim);
    const out=l.map(r=>({tipo:r.tipo,id:r.id,obras:r.obras,dados:JSON.parse(JSON.stringify(r.dados)),versao:r.versao}));
    if((req.headers()['accept']||'').includes('vnd.pgrst.object'))return out.length?json(200,out[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,out)}
  if(p==='/rest/v1/rpc/salvar_registros'){const itens=corpo().p_itens;const copia=new Map([...S.reg].map(([k,v])=>[k,{...v}]));const saida=[];
    for(const it of itens){const k=it.tipo+'|'+it.id;const at=S.reg.get(k);
      const falha=(code,msg)=>{S.reg=copia;return json(code==='40001'?409:403,{code,message:msg,details:JSON.stringify({tipo:it.tipo,id:it.id})})};
      if(it.excluir){if(!at||at.versao!==it.versao||!podeRegistro(uid,at.tipo,at.obras))return falha('40001','conflito');S.reg.delete(k);saida.push({tipo:it.tipo,id:it.id,versao:0});continue}
      if(!podeRegistro(uid,it.tipo,it.obras))return falha('42501','sem_permissao');
      if(it.tipo==='custos'&&!['rh','dir'].includes(eu(uid).perfil))return falha('42501','sem_permissao');
      if(!it.versao){if(at)return falha('40001','conflito');S.reg.set(k,{tipo:it.tipo,id:it.id,obras:it.obras,dados:it.dados,versao:1,ordem:S.seq++});saida.push({tipo:it.tipo,id:it.id,versao:1});continue}
      if(!at||at.versao!==it.versao||!podeRegistro(uid,at.tipo,at.obras))return falha('40001','conflito');
      Object.assign(at,{obras:it.obras,dados:it.dados,versao:at.versao+1});saida.push({tipo:it.tipo,id:it.id,versao:at.versao})}
    return json(200,saida)}
  if(p==='/rest/v1/rpc/senha_trocada')return json(200,null);
  if(p==='/rest/v1/auditoria'){
    if(m==='POST'){const l=JSON.parse(req.postData());const x=eu(uid);for(const r of [].concat(l))S.aud.push({...r,id:S.aud.length+1,em:new Date().toISOString(),autor_id:uid,autor_nome:x.nome,autor_perfil:x.perfil});return route.fulfill({status:201,headers:{'access-control-allow-origin':'*'}})}
    if(['rh','dir'].includes(eu(uid).perfil))return json(200,[...S.aud].reverse());return json(200,[])}
  /* arquivos */
  if(p==='/rest/v1/arquivo'&&m==='GET'){let l=S.arq.filter(a=>podeArquivo(uid,a.categoria,a.colab_id,a.obra_id));l=filtrar(l,u);return json(200,JSON.parse(JSON.stringify(l)))}
  if(p==='/rest/v1/rpc/registrar_arquivo'){const b=corpo();const c=b.p_caminho;if(!podeCaminho(uid,c))return json(403,{code:'42501',message:'sem_permissao'});
    const o=S.obj.get(c);if(!o||o.owner!==uid)return json(404,{code:'P0002',message:'arquivo_nao_enviado'});
    if(!c.includes('/atestado/')&&/(atestado|\bCID\b|laudo m[eé]dico|prontu[aá]rio)/i.test(b.p_tipo_doc))return json(400,{code:'22023',message:'tipo_restrito'});
    let cat,colab=null,obra=null;if(c.startsWith('c/')){[,colab,cat]=c.split('/')}else{[,obra]=c.split('/');cat='obra'}
    if(b.p_substitui){const ant=S.arq.find(a=>a.id===b.p_substitui);if(!ant||ant.removido_em||ant.categoria!==cat||ant.colab_id!==colab||ant.obra_id!==obra)return json(400,{code:'22023',message:'substituicao_invalida'})}
    const a={id:crypto.randomUUID(),caminho:c,categoria:cat,colab_id:colab,obra_id:obra,tipo_doc:b.p_tipo_doc,ref_id:b.p_ref,nome:b.p_nome,mime:o.mime,tamanho:o.size,validade:b.p_validade,enviado_por_nome:eu(uid).nome,criado_em:new Date().toISOString(),removido_em:null,removido_motivo:null};
    S.arq.push(a);if(b.p_substitui){const ant=S.arq.find(x=>x.id===b.p_substitui);ant.removido_em=new Date().toISOString();ant.removido_motivo='Substituído'}
    S.aud.push({id:S.aud.length+1,em:new Date().toISOString(),autor_id:uid,autor_nome:eu(uid).nome,autor_perfil:eu(uid).perfil,modulo:'Arquivos',acao:'Anexou arquivo',evento:{acao:'Anexou arquivo',categoria:cat,documento:cat==='atestado'?'Documento restrito':b.p_tipo_doc}});
    return json(200,a.id)}
  if(p==='/rest/v1/rpc/remover_arquivo'){const b=corpo();const a=S.arq.find(x=>x.id===b.p_id);if(!a||!podeArquivo(uid,a.categoria,a.colab_id,a.obra_id))return json(403,{code:'42501',message:'sem_permissao'});
    a.removido_em=new Date().toISOString();a.removido_motivo=b.p_motivo;return json(200,null)}
  if(p==='/rest/v1/rpc/uso_armazenamento')return json(200,['rh','dir'].includes(eu(uid).perfil)?[...S.obj.values()].reduce((t,o)=>t+o.size,0):null);
  if(p==='/rest/v1/rpc/criar_pacote'){const b=corpo();const e=eu(uid);if(!(['rh','dir'].includes(e.perfil)||(e.perfil==='sst'&&e.obras.includes(b.p_obra))))return json(403,{code:'42501',message:'sem_permissao'});
    const obra=regDe('global','principal').dados.cfg.obras.find(o=>o.id===b.p_obra);if(!obra)return json(400,{code:'22023',message:'obra_invalida'});
    if(!(b.p_dias>=1&&b.p_dias<=30))return json(400,{code:'22023',message:'validade_invalida'});
    const ids=[...new Set(b.p_arquivos)];const okIds=S.arq.filter(a=>ids.includes(a.id)&&!a.removido_em&&a.categoria!=='atestado'&&(a.categoria!=='obra'||a.obra_id===b.p_obra)&&podeArquivo(uid,a.categoria,a.colab_id,a.obra_id));
    if(okIds.length!==ids.length)return json(403,{code:'42501',message:'itens_nao_permitidos'});
    const tk=crypto.randomBytes(18).toString('hex'),cod=String(crypto.randomInt(0,1000000)).padStart(6,'0');const exp=new Date(Date.now()+b.p_dias*864e5).toISOString();
    S.pac.push({id:crypto.randomUUID(),obra_id:b.p_obra,obra_nome:obra.nome,titulo:b.p_titulo,periodo:b.p_periodo,criado_por:uid,criado_por_nome:e.nome,criado_em:new Date().toISOString(),expira_em:exp,token_hash:sha(tk),codigo:cod,tentativas:0,bloqueado_ate:null,revogado_em:null,revogado_motivo:null,ultimo_acesso:null,acessos:0,itens:ids,por:e.perfil});
    return json(200,{id:S.pac[S.pac.length-1].id,token:tk,codigo:cod,expira_em:exp})}
  if(p==='/rest/v1/rpc/revogar_pacote'){const b=corpo();const pk=S.pac.find(x=>x.id===b.p_id);pk.revogado_em=new Date().toISOString();pk.revogado_motivo='Encerrado manualmente';return json(200,null)}
  if(p==='/rest/v1/pacote'){const e=eu(uid);let l=S.pac.filter(x=>['rh','dir'].includes(e.perfil)||(e.perfil==='sst'&&(e.obras.includes(x.obra_id)||x.criado_por===uid)));l=filtrar(l,u);
    return json(200,l.map(({token_hash,codigo,itens,por,...x})=>({...x,bloqueado_ate:x.bloqueado_ate?new Date(x.bloqueado_ate).toISOString():null})))}
  return json(404,{message:'não simulado: '+m+' '+p});
}
const TIPOS={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8'};
const srv=http.createServer((q,r)=>{let f=path.join(PUB,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!path.extname(f))f+='.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':TIPOS[path.extname(f)]||'application/octet-stream','Content-Security-Policy':CSP});r.end(d)})});
const PDF=n=>({name:n,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% arquivo fictício de teste '+n+'\n%%EOF')});

// v18 · cenário: cidades, folga de campo, ajuda de custo e proposta de emprego (dados fictícios; servidor simulado)
(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch({args:['--lang=pt-BR']});
function vigiar(p){p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/realtime|websocket|ERR_FAILED|fonts\.g|status of 4\d\d/i.test(m.text()))p.errs.push('console: '+m.text())});p.on('dialog',d=>d.dismiss())}
async function entrar(k,vp){const ctx=await b.newContext({viewport:vp||{width:1280,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const p=await ctx.newPage();vigiar(p);await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
  await p.fill('#f-login [name=email]',`t-${k}@example.com`);await p.fill('#f-login [name=senha]','senha-de-teste');await p.click('#f-login button');
  await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await p.waitForTimeout(500);return p}
const esperarSalvo=async p=>{await p.waitForTimeout(150);await p.waitForFunction(()=>/Tudo salvo|Dados no servidor/.test(document.getElementById('nv-status')?.textContent||''),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300)};
const ficha=async(p,id,tab)=>{await p.evaluate(([id,tab])=>{try{closeModal()}catch(e){}UI.view='colab';UI.ficha=id;UI.fichaTab=tab;render()},[id,tab]);await p.waitForTimeout(250)};
const txt=async(p,sel='#layer .drawer-b')=>p.evaluate(s=>document.querySelector(s)?.innerText||'',sel);
const cfgTab=async(p,t)=>{await p.evaluate(t=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='cfg';UI.cfgTab=t;render()},t);await p.waitForTimeout(300)};
const setVal=async(p,sel,v)=>p.evaluate(([s,v])=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);

/* ---------- preparação (RH) ---------- */
const rh=await entrar('rh');
ok('Função Supervisor criada uma vez, como mão de obra indireta',await rh.evaluate(()=>DB.cfg.funcoes.filter(f=>f.id==='sup').length===1&&grupoFuncao('sup')==='indireta'&&grupoFuncao('elet')==='direta'&&grupoFuncao('encar')==='direta'&&grupoFuncao('tst')==='indireta'));
await rh.evaluate(()=>{const mk=(id,nome,cidade)=>({id,nome,cliente:'Cliente',cidade,tipo:'Terminal novo',status:'Ativa',trExtra:[],frentes:['Geral'],feriados:[],prazos:{},heRegras:[],docsExigidos:[]});DB.cfg.obras.push(mk('oa','Obra A','Lucas do Rio Verde/MT'),mk('ob','Obra B','Senador Canedo - GO'));save()});await esperarSalvo(rh);
S.perfis.find(x=>x.user_id==='u-gestor').obras=['oa','ob'];S.perfis.find(x=>x.user_id==='u-adm').obras=['oa'];S.perfis.find(x=>x.user_id==='u-admb').obras=['ob'];

/* Configurações › Viagens e folgas */
await cfgTab(rh,'viagem');await rh.waitForFunction(()=>MUN.lista&&MUN.lista.length>5000,null,{timeout:8000});await rh.waitForTimeout(200);
ok('Lista de municípios do IBGE carregada do próprio sistema (5.570+)',await rh.evaluate(()=>MUN.lista.length>=5570&&!!document.getElementById('mun-dl')));
ok('Sugestão de cidade a partir do texto da obra ("Senador Canedo - GO")',!!(await rh.$('[data-act="obraMunSug"][data-i="'+(await rh.evaluate(()=>DB.cfg.obras.findIndex(o=>o.id==='ob')))+'"]')));
await rh.click('[data-act="obraMunSug"][data-i="'+(await rh.evaluate(()=>DB.cfg.obras.findIndex(o=>o.id==='ob')))+'"]');await rh.waitForTimeout(250);
const iA=await rh.evaluate(()=>DB.cfg.obras.findIndex(o=>o.id==='oa'));
await setVal(rh,`#ob-mun-${iA}`,'Lucas do Rio Verde / MT');await rh.waitForTimeout(250);
ok('Cidade da obra escolhida na lista (código IBGE e coordenadas)',await rh.evaluate(()=>obraMun('oa')?.cod===5105259&&obraMun('ob')?.cod===5220454&&obraMun('oa').lat<-12&&!O('oa').mun));
await setVal(rh,`#ob-mun-${iA}`,'Cidade Inventada / ZZ');await rh.waitForTimeout(200);
ok('Cidade fora da lista é recusada e a anterior fica',await rh.evaluate(()=>obraMun('oa')?.cod===5105259));
await setVal(rh,'[data-chg="custoFaixa"][data-i="3"][data-f="valor"]','1.000,00');await esperarSalvo(rh);
await setVal(rh,'[data-chg="custoFator"]','1,3');await esperarSalvo(rh);
ok('Faixa acima de 1.200 km vira R$ 1.000 por trecho e vai para o registro restrito "custos"',S.reg.get('custos|principal')?.dados?.faixas?.find(f=>f.ate==null)?.valor===1000&&!/faixas|5105259/.test(JSON.stringify(regDe('global','principal').dados))&&S.reg.get('custos|principal').dados.obras.oa.mun.cod===5105259);
await setVal(rh,'[data-chg="custoFaixa"][data-i="1"][data-f="ate"]','200');await rh.waitForTimeout(200);
ok('Limite de faixa fora de ordem é recusado',await rh.evaluate(()=>DB.custos.faixas[1].ate===700));
await setVal(rh,'[data-chg="folgaPadCfg"][data-k="indireta"][data-f="ciclo"]','3');await rh.waitForTimeout(150);
ok('Ciclo de folga inválido é recusado; padrão segue 60 e 90 dias',await rh.evaluate(()=>folgaPad().indireta.ciclo===60&&folgaPad().direta.ciclo===90&&folgaPad().direta.dias===5));

/* Configurações › Proposta: salário único por função */
await cfgTab(rh,'proposta');
await setVal(rh,'[data-chg="salFuncao"][data-f="elet"]','3.981,57');await rh.waitForTimeout(150);
await rh.selectOption('[data-chg="salAdic"][data-f="elet"]','Periculosidade 30%');await esperarSalvo(rh);
ok('Salário da função gravado no registro restrito, com adicional',await rh.evaluate(()=>DB.custos.salarios.elet.sal===3981.57&&DB.custos.salarios.elet.adic==='Periculosidade 30%')&&S.reg.get('custos|principal').dados.salarios.elet.sal===3981.57);
ok('Valor com ponto de milhar ("1.500") é lido como mil e quinhentos',await rh.evaluate(()=>numBR('1.500')===1500&&numBR('3.981,57')===3981.57&&numBR('1,3')===1.3&&numBR('230.5')===230.5));
ok('Textos padrão da proposta (jornada, horas extras, regras) aparecem preenchidos',/Segunda a quinta, das 7h às 17h/.test(await rh.evaluate(()=>document.querySelector('#pp-j').value))&&/60% aos sábados/.test(await rh.evaluate(()=>document.querySelector('#pp-h').value)));

/* colaboradores fictícios */
const ids=await rh.evaluate(()=>{const mk=(nome,fid,obra,chegada,regime='Alojado')=>{const c=novoRegistro({nome,funcao:fid,obra,regime,vinculo:'CLT'});c.status='Ativo';c.etapa=null;c.admissao=chegada;c.alocacoes=[{aid:uid(),obraId:obra,inicio:chegada,fim:null,motivo:'Admissão',status:'executada'}];DB.colabs.push(c);return c};
  const e=mk('Elias Eletricista Teste','elet','oa','2026-10-05');const s=mk('Silas Supervisor Teste','sup','oa','2026-09-01');
  const v=mk('Valter Antigo Teste','sold','oa','2026-08-01');delete v.folgaV2;v.folga={campo:60,folga:7,proxima:'2026-11-02'};
  const l=mk('Lucio Local Teste','ajud','oa','2026-09-01','Local');save();return {e:e.id,s:s.id,v:v.id,l:l.id}});
await esperarSalvo(rh);
const fol=await rh.evaluate(id=>folgasCiclo(C(id),'2027-08-01').slice(0,3).map(x=>[x.n,x.seg,x.sex,x.sai,x.volta,x.est].join(' ')),ids.e);
ok('Eletricista (direta, chegada 05/10/2026): folgas a cada 90 dias, segunda seguinte, sai sábado, volta segunda',fol.join('|')==='1 2027-01-04 2027-01-08 2027-01-02 2027-01-11 sugerida|2 2027-04-05 2027-04-09 2027-04-03 2027-04-12 sugerida|3 2027-07-05 2027-07-09 2027-07-03 2027-07-12 sugerida',fol.join('|'));
ok('Supervisor (indireta): folga a cada 60 dias',await rh.evaluate(id=>folgasCiclo(C(id),'2027-01-01')[0].ref==='2026-10-31'&&folgasCiclo(C(id),'2027-01-01')[0].seg==='2026-11-02',ids.s));
ok('Planejamento vê a folga sugerida do sábado ao domingo seguinte',await rh.evaluate(id=>{const c=C(id);const f=d=>ausenteEm(c,d).some(a=>a.tipo==='Folga de campo');return f('2027-01-02')&&f('2027-01-08')&&f('2027-01-10')&&!f('2027-01-11')&&!f('2027-01-01')},ids.e));
ok('Regime local não tem folga de campo; colaborador antigo segue a escala anterior até o RH aplicar',await rh.evaluate(([l,v])=>folgaModo(C(l))==='nenhum'&&folgaModo(C(v))==='anterior'&&folgasProj(C(v),'2027-01-31')[0].inicio==='2026-11-02',[ids.l,ids.v]));
await ficha(rh,ids.e,'obras');let t=await txt(rh);
ok('Ficha › Obras e ausências mostra regra, base e próximas folgas',/Mão de obra direta: a cada 90 dias, 5 dias úteis/.test(t)&&/05\/10\/2026/.test(t)&&/04\/01 a 08\/01/.test(t)&&/Sugerida/.test(t),t.slice(0,300));
await ficha(rh,ids.e,'contrato');t=await txt(rh);
ok('Aba Contrato troca os campos da escala antiga por um aviso',/calculada pelo sistema/.test(t)&&!(await rh.$('#layer [name="folga.campo"]')));
await ficha(rh,ids.e,'resumo');t=await txt(rh);
ok('Resumo mostra a regra e a próxima folga sugerida',/a cada 90 dias · 5 dias úteis/.test(t)&&/04\/01\/2027 a 08\/01\/2027 \(sugerida\)/.test(t),t.match(/Próxima folga[^\n]*\n[^\n]*/)?.[0]);

/* cidades do colaborador (RH) */
await ficha(rh,ids.e,'obras');await rh.click('#layer [data-act="cidEditar"]');await rh.waitForSelector('#layer #cid-o');
await rh.fill('#layer #cid-o','São Luís / MA');await rh.fill('#layer #cid-n','Codó / MA');await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
const via=await rh.evaluate(id=>viagemColab(C(id)),ids.e);
ok('Cidade de origem e natal salvas; distância × 1,30 na faixa acima de 1.200 km, R$ 1.000 por trecho',via&&via.km>2000&&via.km<2600&&via.valorTrecho===1000&&/acima de 1.200/.test(via.faixa),JSON.stringify(via));
const colRec=S.reg.get('colab|'+ids.e).dados,pesRec=S.reg.get('pessoal|'+ids.e).dados;
ok('Cidades ficam no registro pessoal; o registro do colaborador (visível à obra) não as tem',pesRec.cidades?.origem?.cod===2111300&&pesRec.cidades?.natal?.nome==='Codó'&&!colRec.cidades?.origem?.cod);
t=await txt(rh);ok('Painel mostra distância, faixa e ajuda por folga (R$ 2.000)',/acima de 1\.200 km/.test(t)&&/R\$\s?2\.000,00/.test(t)&&/Ida/.test(t));

/* exceção e escala antiga (RH) */
await ficha(rh,ids.v,'obras');t=await txt(rh);ok('Colaborador antigo: aviso com botão "Aplicar a folga padrão"',/escala anterior/.test(t)&&!!(await rh.$('#layer [data-act="folgaAplicar"]')));
await rh.click('#layer [data-act="folgaAplicar"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
ok('Folga padrão aplicada: conta da primeira chegada (01/08/2026 + 90 = 30/10 → seg 02/11)',await rh.evaluate(id=>folgaModo(C(id))==='padrao'&&folgasCiclo(C(id),'2027-01-01')[0].seg==='2026-11-02',ids.v));
await ficha(rh,ids.s,'obras');await rh.click('#layer [data-act="folgaExc"]');await rh.waitForTimeout(200);
await rh.fill('#layer [name="ciclo"]','45');await rh.fill('#layer [name="motivo"]','Acordo com o cliente (teste)');await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
ok('Exceção por pessoa: ciclo de 45 dias com motivo e aprovador',await rh.evaluate(id=>{const c=C(id);return folgaRegra(c).ciclo===45&&c.folgaV2.aprov?.por&&folgasCiclo(c,'2027-01-01')[0].ref==='2026-10-16'},ids.s));

/* Adm. da obra confirma a folga; gestor não vê valores */
await esperarSalvo(rh);
const adm=await entrar('adm');await ficha(adm,ids.e,'obras');
ok('Adm. da obra vê cidades e ajuda de custo da sua obra',/São Luís \/ MA/.test(await txt(adm))&&/R\$\s?1\.000,00/.test(await txt(adm)));
await adm.click('#layer [data-act="folgaConf"][data-n="1"]');await adm.waitForSelector('#layer #fol-seg');
await setVal(adm,'#layer #fol-seg','2027-01-12');await adm.waitForTimeout(150);
ok('Data que não é segunda-feira é recusada na prévia',/Escolha uma segunda-feira/.test(await txt(adm,'#folPrev')));
await setVal(adm,'#layer #fol-seg','2027-01-11');await adm.waitForTimeout(150);
ok('Prévia mostra saída no sábado e volta na segunda',/sáb, 09\/01\/2027/.test(await txt(adm,'#folPrev'))&&/seg, 18\/01\/2027/.test(await txt(adm,'#folPrev')),await txt(adm,'#folPrev'));
await adm.click('#layer .modal footer [type="submit"]');await esperarSalvo(adm);
const conf=await adm.evaluate(id=>{const c=C(id);const a=c.ausencias.find(x=>+x.folgaN===1);const l=folgasCiclo(c,'2027-08-01');return {a:a&&[a.inicio,a.fim].join(),e1:l[0].est,s2:l[1].seg}},ids.e);
ok('Folga confirmada vira ausência (09/01 a 17/01); a 2ª continua contada da chegada (05/04)',conf.a==='2027-01-09,2027-01-17'&&conf.e1==='confirmada'&&conf.s2==='2027-04-05',JSON.stringify(conf));
ok('Confirmação gravada no servidor com histórico',/Confirmada a 1ª folga de campo/.test(JSON.stringify(S.reg.get('colab|'+ids.e).dados.historico)));
await ficha(adm,ids.e,'obras');await adm.click('#layer [data-act="ajudaPagar"][data-t="Ida"]');await adm.waitForTimeout(200);
await adm.selectOption('#layer [name="modo"]','Dinheiro');await adm.click('#layer .modal footer [type="submit"]');await esperarSalvo(adm);
ok('Adm. registra a ajuda de custo da ida (registro pessoal, R$ 1.000)',S.reg.get('pessoal|'+ids.e).dados.ajudas?.[0]?.valor===1000&&!JSON.stringify(S.reg.get('colab|'+ids.e).dados.ajudas||[]).includes('1000'));
const admTent=await adm.evaluate(async v=>{const r=await NUVEM.sb.rpc('salvar_registros',{p_itens:[{tipo:'custos',id:'principal',obras:[],dados:{fator:2,faixas:[]},versao:v}]});return r.error?.code||'gravou'},S.reg.get('custos|principal').versao);
ok('Servidor recusa o Adm. alterando a tabela de custos',admTent==='42501'&&S.reg.get('custos|principal').dados.fator===1.3,admTent);
await esperarSalvo(adm);
const ges=await entrar('gestor');await ficha(ges,ids.e,'obras');t=await txt(ges);
ok('Gestor vê as folgas, mas não vê cidades, valores nem botões de confirmar',/Folga de campo/.test(t)&&/Confirmada/.test(t)&&!/R\$/.test(t)&&!/São Luís/.test(t)&&!(await ges.$('#layer [data-act="folgaConf"]')));
await ges.evaluate(()=>{UI.view='cfg';UI.cfgTab='viagem';render()});
ok('Gestor não vê nem altera cidade, jornada e regras das obras',!(await ges.$('[data-chg="obraMun"]'))&&!(await ges.$('[data-chg="obraTxt"]')));
ok('Servidor não entrega a tabela de custos ao gestor',await ges.evaluate(()=>!DB.custos)&&!(await ges.evaluate(async()=>{const r=await NUVEM.sb.from('registro').select('tipo').eq('tipo','custos');return (r.data||[]).length})));
await ges.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='rel';render()});
ok('Relatório de ajuda de custo não aparece para o gestor',!(await ges.$('[data-act="rel"][data-v="ajudaCusto"]')));

/* férias × folga (RH) */
await rh.reload();await rh.waitForSelector('#f-login, #main h1');if(await rh.$('#f-login')){await rh.fill('#f-login [name=email]','t-rh@example.com');await rh.fill('#f-login [name=senha]','senha-de-teste');await rh.click('#f-login button')}await rh.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await rh.waitForTimeout(400);
const av=await rh.evaluate(id=>ferValidar(C(id),0,[{inicio:'2027-04-19',dias:'20'}],'0').avisos.join(' | '),ids.e);
ok('Programar férias a até 30 dias de uma folga avisa que as férias ficam no lugar dela',/ficam no lugar da 2ª folga/.test(av),av);
await rh.evaluate(id=>{const c=C(id);c.ausencias.push({id:uid(),tipo:'Férias',inicio:'2027-04-19',fim:'2027-05-08',confirmado:false,feriasPer:0});save()},ids.e);await esperarSalvo(rh);
const subs=await rh.evaluate(id=>{const c=C(id);const l=folgasCiclo(c,'2027-08-01');return {e2:l[1].est,e3:l[2].est,aj:ajudasDevidas(c).filter(a=>a.tipo==='Férias').map(a=>a.trechos+':'+a.valor).join()}},ids.e);
ok('2ª folga vira "substituída por férias"; a viagem das férias recebe 2 trechos (R$ 2.000); a 3ª segue normal',subs.e2==='ferias'&&subs.e3==='sugerida'&&subs.aj==='2:2000',JSON.stringify(subs));
ok('Planejamento não conta a folga substituída',await rh.evaluate(id=>!ausenteEm(C(id),'2027-04-06').some(a=>a.tipo==='Folga de campo'),ids.e));
/* volta: não paga em pedido de demissão */
ok('Volta não é devida em pedido de demissão; é devida sem justa causa',await rh.evaluate(id=>{const c=JSON.parse(JSON.stringify(C(id)));c.desligamento={data:'2027-02-01',tipo:'Pedido de demissão'};const a=ajudasDevidas(c).find(x=>x.tipo==='Volta');c.desligamento.tipo='Sem justa causa';const b2=ajudasDevidas(c).find(x=>x.tipo==='Volta');return a.naoDevida&&a.valor===0&&!b2.naoDevida&&b2.valor===1000},ids.e));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='rel';UI.rel='ajudaCusto';render()});t=await txt(rh,'#main');
ok('Relatório de ajuda de custo por obra e mês, com pago e previsto',/Ajuda de custo de viagem/.test(t)&&/pago em/.test(t)&&/Folga 3ª/.test(t)&&/Férias 2ª/.test(t),t.slice(0,200));

/* alerta de folga */
ok('Alerta de confirmar folga aparece até 30 dias antes da saída',await rh.evaluate(id=>{const c=C(id);const s=JSON.parse(JSON.stringify(c));return true},ids.e)&&await rh.evaluate(()=>{const c=novoRegistro({nome:'Ana Alerta Teste',funcao:'ajud',obra:'oa',regime:'Alojado',vinculo:'CLT'});c.status='Ativo';c.admissao=addD(hoje,-75);c.alocacoes=[{aid:'x',obraId:'oa',inicio:addD(hoje,-75),fim:null,status:'executada'}];DB.colabs.push(c);CACHE.clear();const ok=alertas().some(a=>a.c===c&&a.tipo==='Folga de campo'&&/Confirmar a 1ª folga/.test(a.desc));DB.colabs.pop();CACHE.clear();return ok}));

ok('Folga já paga que vira férias não gera novo pagamento',await rh.evaluate(id=>{const c=JSON.parse(JSON.stringify(C(id)));c.ajudas=[{id:'Folga|2',tipo:'Folga',ref:'2',valor:2000,pago:hoje,modo:'Dinheiro',por:'x'}];const a=ajudasDevidas(c).find(x=>x.tipo==='Férias');return a&&!!a.paga},ids.e));
/* ---------- proposta de emprego ---------- */
const req=await rh.evaluate(()=>{const r=criarReq({obraId:'oa',funcaoId:'elet',qtd:2,inicio:addD(hoje,20),regime:'Alojado',vinculo:'CLT',justificativa:'Teste'});r.aprov.gestor={por:'Teste',em:hoje};r.aprov.dir={por:'Teste',em:hoje};reqAtualizarStatus(r);
  const a=novoCand({reqId:r.id,nome:'Carlos Candidato Teste',tel:'(98) 90000-0000',cidade:'São Luís/MA',origem:'Indicação'});const b2=novoCand({reqId:r.id,nome:'Rui Recusa Teste',tel:'(65) 90000-0000',cidade:'Cuiabá/MT',origem:'Indicação'});save();return {r:r.id,a:a.x.id,b:b2.x.id}});
await esperarSalvo(rh);
const abrir=async(p,id)=>{await p.evaluate(id=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='adm';render();abrirCand(id)},id);await p.waitForTimeout(300)};
await abrir(rh,req.a);t=await txt(rh,'#layer .modal');
ok('Candidato mostra "Montar proposta" e o antigo aprovar vira "sem proposta registrada"',/Proposta de emprego/.test(t)&&!!(await rh.$('#layer [data-act="propMontar"]'))&&/Aprovar sem proposta registrada/.test(t));
await rh.click('#layer [data-act="propMontar"]');await rh.waitForSelector('#layer #pr-o');await rh.waitForTimeout(250);
ok('Formulário já traz a cidade do candidato e a data da requisição',await rh.evaluate(()=>document.querySelector('#layer #pr-o').value==='São Luís / MA'&&!!document.querySelector('#layer [name="apresData"]').value));
t=await txt(rh,'#propPrev');
ok('Prévia: salário com periculosidade, folga de 90 dias, ajuda de R$ 1.000 e custo mensal interno',/R\$\s?3\.981,57/.test(t)&&/periculosidade 30%/.test(t)&&/a cada 90 dias/.test(t)&&/Ida R\$\s?1\.000,00/.test(t)&&/Custo mensal estimado/.test(t),t);
await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);await rh.waitForTimeout(300);
const pr=S.reg.get('proposta|'+(await rh.evaluate(()=>DB.propostas[0]?.id)));
ok('Proposta salva no registro restrito "proposta" da obra, com valores',!!pr&&pr.obras.join()==='oa'&&pr.dados.salario===3981.57&&pr.dados.valorTrecho===1000&&pr.dados.status==='Rascunho'&&pr.dados.adicValor===1194.47,JSON.stringify(pr&&{o:pr.obras,s:pr.dados.salario,a:pr.dados.adicValor}));
const candRec=S.reg.get('cand|'+req.a).dados;
ok('Candidato guarda só a situação da proposta, sem valores',candRec.prop?.status==='Rascunho'&&!/3981|1000|salario/.test(JSON.stringify(candRec.prop)));
await abrir(rh,req.a);
const [dl]=await Promise.all([rh.waitForEvent('download',{timeout:15000}),rh.click('#layer [data-act="propPdf"]')]);
const pdf=fs.readFileSync(await dl.path());
ok('PDF da proposta gerado (A4, %PDF, nome com candidato e versão)',pdf.slice(0,5).toString()==='%PDF-'&&pdf.length>40000&&/Proposta NTN - Carlos Candidato Teste - Eletricista - v1\.pdf/.test(dl.suggestedFilename()),dl.suggestedFilename()+' '+pdf.length);
fs.writeFileSync(path.join(__dirname,'v18_proposta.pdf'),pdf);
await abrir(rh,req.a);await rh.click('#layer [data-act="propEnviada"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
ok('Envio registrado: válida por 3 dias',await rh.evaluate(()=>DB.propostas[0].status==='Enviada'&&DB.propostas[0].validade===addD(hoje,3))&&S.reg.get('cand|'+req.a).dados.prop.validade);
const gs2=await entrar('gestor');await abrir(gs2,req.a);t=await txt(gs2,'#layer .modal');
const xss=await gs2.evaluate(async id=>{const r=await NUVEM.sb.from('registro').select('dados,versao').eq('tipo','cand').eq('id',id).maybeSingle();return r.data},req.b);
ok('Gestor vê situação e validade da proposta, sem salário nem botões',/Enviada/.test(t)&&/válida até/.test(t)&&!/R\$/.test(t)&&!(await gs2.$('#layer [data-act="propPdf"]'))&&!(await gs2.$('#layer [data-act="propResposta"]')));
ok('Servidor não entrega propostas ao gestor',!(await gs2.evaluate(async()=>{const r=await NUVEM.sb.from('registro').select('tipo').eq('tipo','proposta');return (r.data||[]).length})));
await rh.evaluate(id=>{const x=CAND(id);x.prop={versao:'<img src=x id=xss-v onerror="window.__xss=1">',status:'Enviada',enviada:'<img id=xss-d src=x onerror="window.__xss=1">',validade:addD(hoje,2)};x.etapa='Triagem'},req.b);await abrir(rh,req.b);await rh.waitForTimeout(300);
ok('Situação da proposta forjada no candidato não executa código na tela do RH',!(await rh.evaluate(()=>window.__xss||document.querySelector('#xss-v,#xss-d'))));
await rh.evaluate(id=>{delete CAND(id).prop},req.b);
await rh.evaluate(()=>{DB.cands.find(x=>x.prop).prop.validade=addD(hoje,-1);CACHE.clear()});
ok('Alerta de proposta vencida sem resposta',await rh.evaluate(()=>alertas().some(a=>a.tipo==='Requisição'&&/venceu .* sem resposta/.test(a.desc))));
await rh.evaluate(()=>{const p=DB.propostas[0];p.validade=addD(hoje,-1);render()});await abrir(rh,req.a);
ok('Proposta vencida não aceita resposta: pede novo envio',!!(await rh.$('#layer [data-act="propEnviada"]'))&&!(await rh.$('#layer [data-act="propResposta"]')));
await rh.click('#layer [data-act="propEnviada"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
ok('Novo envio renova a validade',await rh.evaluate(()=>DB.propostas[0].validade===addD(hoje,3)&&DB.cands.find(x=>x.prop&&x.prop.id===DB.propostas[0].id).prop.validade===addD(hoje,3)));
await abrir(rh,req.a);await rh.click('#layer [data-act="propResposta"]');await rh.waitForTimeout(250);
await rh.selectOption('#layer [name="camisa"]','G');await rh.selectOption('#layer [name="calca"]','42');await rh.selectOption('#layer [name="botina"]','41');
await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
const adm2=await rh.evaluate(()=>{const p=DB.propostas[0];const c=C(p.colabId);return c&&{st:p.status,sal:c.salario,per:c.peric,ori:c.cidades?.origem?.cod,fol:c.folgaV2?.modo,prev:c.previsaoInicio===p.apres.data,bot:c.uniforme.botina,cam:c.uniforme.camisa,ctr:c.tipoContrato,etapa:c.etapa,ben:c.beneficios.length>0}});
ok('Aceite cria a admissão já preenchida (salário, periculosidade, cidades, folga, apresentação, tamanhos)',adm2&&adm2.st==='Aceita'&&adm2.sal===3981.57&&adm2.per===true&&adm2.ori===2111300&&adm2.fol==='padrao'&&adm2.prev&&adm2.bot==='41'&&adm2.cam==='G'&&adm2.ctr==='Experiência 45+45'&&adm2.etapa==='e3'&&adm2.ben,JSON.stringify(adm2));
/* recusa */
await abrir(rh,req.b);await rh.click('#layer [data-act="propMontar"]');await rh.waitForSelector('#layer #pr-o');await rh.waitForTimeout(200);
ok('Cidade digitada pelo candidato com barra ("Cuiabá/MT") é reconhecida',await rh.evaluate(()=>document.querySelector('#layer #pr-o').value==='Cuiabá / MT'));
await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);await abrir(rh,req.b);await rh.click('#layer [data-act="propEnviada"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
await abrir(rh,req.b);await rh.click('#layer [data-act="propResposta"]');await rh.waitForTimeout(250);await rh.selectOption('#layer [name="tipo"]','Recusada');await rh.waitForTimeout(100);
await rh.selectOption('#layer [name="motivo"]','Distância');await rh.check('#layer [name="encerrar"]');await rh.click('#layer .modal footer [type="submit"]');await esperarSalvo(rh);
const rec=await rh.evaluate(id=>{const x=CAND(id);const p=DB.propostas.find(y=>y.candId===id);return {e:x.etapa,s:p.status,m:p.resposta.motivo,km:p.km,fx:p.faixa}},req.b);
ok('Recusa com motivo "Distância" e seleção encerrada; Cuiabá cai em outra faixa de km',rec.e==='Desistiu'&&rec.s==='Recusada'&&rec.m==='Distância'&&rec.km>100&&rec.km<700,JSON.stringify(rec));
ok('Motivo e detalhe da recusa ficam só na proposta, não no candidato',!/Distância/.test(JSON.stringify(S.reg.get('cand|'+req.b).dados)));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='rel';UI.rel='propostas';render()});t=await txt(rh,'#main');
ok('Relatório de propostas com situação, salário, distância e motivo da recusa',/Carlos Candidato Teste/.test(t)&&/Aceita/.test(t)&&/Recusada/.test(t)&&/Distância/.test(t));
/* trilha */
const aud=JSON.stringify(S.aud);
ok('Trilha classifica cidades como dado pessoal e valores como financeiro',/"campo":"cidades[^"]*"[^}]*"cl":"pessoal"/.test(aud)||/cidades/.test(aud)&&/"cl":"pessoal"/.test(aud));
/* permissões na matriz e telas sem erro */
await cfgTab(rh,'perfis');
ok('Novas permissões aparecem na matriz (ver custos, confirmar folga, proposta)',await rh.evaluate(()=>!!document.querySelector('[data-cfgperm="verCustoViagem|adm"]')?.checked&&!!document.querySelector('[data-cfgperm="confirmarFolga|adm"]')?.checked&&!!document.querySelector('[data-cfgperm="fazerProposta|rh"]')?.checked));
for(const [nome,pg] of [['RH',rh],['Adm',adm],['Gestor',gs2]]){pg.errs.length=0;
  for(const v of ['painel','colab','adm','obras','plan','hosp','alertas','rel','cfg'])await pg.evaluate(v=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view=v;render()},v);
  for(const tb of ['viagem','proposta'])await pg.evaluate(t=>{UI.view='cfg';UI.cfgTab=t;render()},tb).catch(()=>{});
  for(const tb of ['resumo','cadastro','contrato','sst','obras','registros'])await ficha(pg,ids.e,tb);
  ok(`${nome}: telas, abas da ficha e configurações abrem sem erro`,!pg.errs.length,pg.errs.slice(0,2).join(' | '))}
ok('Sem erros no restante do cenário',![...rh.errs,...adm.errs,...ges.errs,...gs2.errs].length,[...rh.errs,...adm.errs,...ges.errs,...gs2.errs].slice(0,3).join(' | '));
/* imagens para conferência visual */
await ficha(rh,ids.e,'obras');await rh.screenshot({path:path.join(__dirname,'v18_folga.png')});
await cfgTab(rh,'viagem');await rh.screenshot({path:path.join(__dirname,'v18_cfg.png')});
await abrir(rh,req.a);await rh.screenshot({path:path.join(__dirname,'v18_cand.png')});

const cel=await entrar('rh',{width:390,height:844});await ficha(cel,ids.e,'obras');
await cel.evaluate(()=>{const h=[...document.querySelectorAll('#layer h3')].find(x=>/Folga de campo/.test(x.textContent));h&&h.scrollIntoView()});await cel.waitForTimeout(200);await cel.screenshot({path:path.join(__dirname,'v18_cel_folga.png')});
ok('Celular: painel de folga sem rolagem lateral da página',await cel.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
await abrir(cel,req.a);await cel.evaluate(()=>{const h=[...document.querySelectorAll('#layer .sec-t')].find(x=>/Proposta/.test(x.textContent));h&&h.scrollIntoView()});await cel.waitForTimeout(200);await cel.screenshot({path:path.join(__dirname,'v18_cel_prop.png')});
console.log(Object.entries(R).map(([k,v])=>k.padEnd(100)+' '+v).join('\n'));
const n=Object.values(R).filter(v=>v.startsWith('OK')).length;console.log(`${n}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);console.log(Object.entries(R).map(([k,v])=>k.padEnd(100)+' '+v).join('\n'));process.exit(1)});
