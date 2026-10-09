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

// v18.2 · cenário: link de redefinição de senha (dados fictícios; servidor simulado)
const b64u=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const tokU=uid=>`${b64u({alg:'HS256',typ:'JWT'})}.${b64u({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})}.c2lnbmF0dXJh`;
(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch();const errs=[];
const ctx=await b.newContext({viewport:{width:1280,height:900}});await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);
let putUser=0;await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/auth/v1/user',r=>{if(r.request().method()==='PUT')putUser++;return servidor(r)});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://localhost:4173/#access_token=${tokU('u-dir')}&expires_in=3600&refresh_token=r-u-dir&token_type=bearer&type=recovery`);
await p.waitForSelector('#f-senha',{timeout:15000});
ok('Link de redefinição abre a tela "Redefina sua senha" e limpa o token da barra de endereço',/Redefina sua senha/.test(await p.textContent('#acesso'))&&!/access_token/.test(p.url()));
await p.fill('#f-senha [name=s1]','curta');await p.fill('#f-senha [name=s2]','curta');await p.click('#f-senha button');
ok('Senha curta recusada',/pelo menos 10/.test(await p.textContent('#f-senha .msg')));
await p.fill('#f-senha [name=s1]','nova-senha-de-teste-123');await p.fill('#f-senha [name=s2]','nova-senha-de-teste-123');await p.click('#f-senha button');
await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});
ok('Nova senha gravada e o sistema abre',putUser===1);
const p2=await ctx.newPage();await p2.goto('http://localhost:4173/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
await p2.waitForSelector('#f-login',{timeout:15000}).catch(()=>{});
const t2=await p2.textContent('#acesso').catch(()=>'');
ok('Link vencido mostra o login com aviso',/expirou ou já foi usado/.test(t2)||/Carregando/.test(t2)===false&&/expirou/.test(t2),t2.slice(0,120));
const c3=await b.newContext();await c3.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);const p3=await c3.newPage();await p3.goto('http://localhost:4173/');await p3.waitForSelector('#f-login');
await p3.fill('#f-login [name=email]','t-rh@example.com');await p3.fill('#f-login [name=senha]','senha-de-teste');await p3.click('#f-login button');
await p3.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000}).then(()=>ok('Login normal continua funcionando',true)).catch(()=>ok('Login normal continua funcionando',false));
ok('Sem erros de página',!errs.length,errs.join(' | '));
console.log(Object.entries(R).map(([k,v])=>k.padEnd(90)+' '+v).join('\n'));console.log(`${Object.values(R).filter(v=>v.startsWith('OK')).length}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);console.log(JSON.stringify(R,null,1));process.exit(1)});
