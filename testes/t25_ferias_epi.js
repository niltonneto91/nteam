// v17 · teste ponta a ponta (EPI por função e férias) — servidor simulado copiado do t23.
// v15 · teste ponta a ponta: arquivos dos colaboradores e da obra, pacote (ZIP e link com código) e página pública.
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

// v17 · cenário: EPI por função e férias por período aquisitivo (dados fictícios; servidor simulado do t23)
(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch({args:['--lang=pt-BR']});
function vigiar(p){p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/realtime|websocket|ERR_FAILED|fonts\.g|status of 4\d\d/i.test(m.text()))p.errs.push('console: '+m.text())});p.on('dialog',d=>d.dismiss())}
async function entrar(k){const ctx=await b.newContext({viewport:{width:1280,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  const p=await ctx.newPage();vigiar(p);await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
  await p.fill('#f-login [name=email]',`t-${k}@example.com`);await p.fill('#f-login [name=senha]','senha-de-teste');await p.click('#f-login button');
  await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await p.waitForTimeout(400);return p}
const esperarSalvo=async p=>{await p.waitForFunction(()=>/Tudo salvo|Dados no servidor/.test(document.getElementById('nv-status')?.textContent||''),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300)};
const ficha=async(p,id,tab,sub)=>{await p.evaluate(([id,tab,sub])=>{try{closeModal()}catch(e){}UI.view='colab';UI.ficha=id;UI.fichaTab=tab;if(sub)UI.fichaSub[tab]=sub;render()},[id,tab,sub]);await p.waitForTimeout(250)};
const txt=async(p,sel='#layer .drawer-b')=>p.evaluate(s=>document.querySelector(s)?.innerText||'',sel);

// preparação: obras e colaboradores fictícios criados pela tela (RH)
const rh=await entrar('rh');
await rh.evaluate(()=>{const mk=(id,nome)=>({id,nome,cliente:'Cliente',cidade:'Cidade',tipo:'Terminal novo',status:'Ativa',trExtra:[],frentes:['Geral'],feriados:[],prazos:{},heRegras:[],docsExigidos:[]});DB.cfg.obras.push(mk('oa','Obra A'),mk('ob','Obra B'));save()});await esperarSalvo(rh);
async function novoColab(nome,funcao,obra,admissao){
  await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='colab';render()});await rh.click('[data-act="novoExistente"]');await rh.waitForTimeout(250);
  await rh.fill('#layer [name="nome"]',nome);await rh.fill('#layer [name="tel"]','(62) 90000-0000');await rh.selectOption('#layer [name="funcao"]',funcao);await rh.selectOption('#layer [name="obra"]',obra);
  await rh.evaluate(a=>{const f=document.querySelector('#layer form');for(const [n,v] of [['admissao',a],['desde',a]]){const e=f.querySelector(`[name="${n}"]`);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}},admissao);
  await rh.selectOption('#layer [name="regime"]','Local');await rh.selectOption('#layer [name="vinculo"]','CLT');await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(400);
  return rh.evaluate(n=>DB.colabs.find(c=>c.nome===n)?.id,nome)}
const datas=await rh.evaluate(()=>({a21:addM(hoje,-21),a30:addM(hoje,-30),a14:addM(hoje,-14),a13:addM(hoje,-13)}));
const solda=await novoColab('Silvio Soldador','sold','oa',datas.a21);
const ferA=await novoColab('Fabio Ferias','ajud','oa',datas.a14);
const ferB=await novoColab('Bruna Fracionada','ajud','oa',datas.a13);
const venc=await novoColab('Vera Vencida','ajud','ob',datas.a30);
const migr=await novoColab('Marcos Migrado','ajud','ob',datas.a21);
await rh.evaluate(id=>{C(id).ferias.gozadas=1;save()},migr);await esperarSalvo(rh);
ok('Colaboradores fictícios criados',[solda,ferA,ferB,venc,migr].every(Boolean));

/* ================= EPI ================= */
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='cfg';UI.cfgTab='epi';render()});await rh.waitForTimeout(300);
const cfgT=await txt(rh,'#main');
ok('Configurações › EPIs mostra lista sugerida, kit básico, adicionais por função e exigidos pela obra',/Lista sugerida/.test(cfgT)&&/Catálogo de EPIs e kit básico/.test(cfgT)&&/Adicionais por função/.test(cfgT)&&/Exigidos pela obra/.test(cfgT)&&/Máscara de solda/.test(cfgT));
await rh.check('#main [data-chg="epiKit"][data-tipo="obra"][data-k="oa"][value="cin"]');await rh.waitForTimeout(300);
await rh.click('#main [data-act="epiRevisado"]');await rh.waitForTimeout(300);await esperarSalvo(rh);
ok('Catálogo gravado só ao editar; obra A exige cinto; revisado com data',await rh.evaluate(()=>!!DB.cfg.epiCat&&DB.cfg.epiCat.obras.oa.includes('cin')&&!!DB.cfg.epiCat.revisado&&DB.cfg.epiCat.desde===hoje)&&/epiCat/.test(JSON.stringify(regDe('global','principal').dados.cfg)));
await ficha(rh,solda,'sst');
const kit=await rh.evaluate(()=>[...document.querySelectorAll('#layer .epi-sel')].map(x=>x.value));
ok('Soldador na Obra A: kit = 6 básicos + 6 de solda + cinto da obra',kit.length===13&&['cap','msd','avr','cin'].every(k=>kit.includes(k)),kit.join(','));
ok('Kit pendente entra nas pendências de liberação para a obra',await rh.evaluate(id=>pendLiberacao(C(id)).some(x=>/EPI não entregue: .*Máscara de solda/.test(x.t)),solda));
await rh.click('#layer [data-act="epiEntregar"]');await rh.waitForTimeout(300);await esperarSalvo(rh);
ok('Entrega em lote registra os 13 itens com ligação ao catálogo e tira a pendência',await rh.evaluate(id=>{const c=C(id);return c.epi.length===13&&c.epi.every(e=>e.epiId)&&!pendLiberacao(c).some(x=>/EPI não entregue/.test(x.t))},solda));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='cfg';UI.cfgTab='epi';render()});await rh.waitForTimeout(200);
await rh.fill('#main [data-chg="epiCampo"][data-f="troca"][data-i="3"]','30');await rh.press('#main [data-chg="epiCampo"][data-f="troca"][data-i="3"]','Tab');await rh.waitForTimeout(300);
await rh.evaluate(id=>{const e=C(id).epi.find(x=>x.epiId==='lvq');e.data=addD(hoje,-40);save()},solda);
await ficha(rh,solda,'sst');
ok('Troca vencida aparece no kit e nos alertas (tipo EPI, responsável SST)',/Trocar/.test(await txt(rh))&&await rh.evaluate(id=>alertas().some(a=>a.tipo==='EPI'&&a.c?.id===id&&/Troca de Luva de vaqueta/.test(a.desc)),solda));
await rh.evaluate(id=>{C(id).funcaoId='elet';save()},solda);await ficha(rh,solda,'sst');
ok('Mudança de função recalcula o kit (eletricista: luva isolante pendente)',await rh.evaluate(id=>epiPendentes(C(id)).map(k=>k.id).join()==='lis',solda));
await rh.evaluate(id=>{C(id).funcaoId='sold';save()},solda);
const [pop]=await Promise.all([rh.context().waitForEvent('page'),rh.click('#layer [data-act="epiFicha"]')]);await pop.waitForLoadState().catch(()=>{});
const popT=await pop.evaluate(()=>document.body.innerText).catch(()=>'');
ok('Ficha de EPI para assinar abre com nome, itens e declaração',/Ficha de controle de entrega de EPI/.test(popT)&&/Silvio Soldador/.test(popT)&&/Máscara de solda/.test(popT)&&/Declaro ter recebido/.test(popT),popT.slice(0,80));await pop.close();
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='alertas';UI.alertTipo='';render()});ok('Alertas têm filtro EPI',!!(await rh.$('#main [data-act="alertTipo"][data-v="EPI"]')));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='rel';UI.rel='epi';render()});ok('Relatório Kit de EPI lista o soldador',/Silvio Soldador/.test(await txt(rh,'#main'))&&/Kit de EPI/.test(await txt(rh,'#main')));
await esperarSalvo(rh);
// gestor vê, mas não entrega nem configura
S.perfis.find(x=>x.user_id==='u-gestor').obras=['oa','ob'];S.perfis.find(x=>x.user_id==='u-sst').obras=['oa'];
const ges=await entrar('gestor');await ficha(ges,solda,'sst');
ok('Gestor vê o kit, mas não registra entrega',/Kit de EPI/.test(await txt(ges))&&await ges.evaluate(()=>{const b=document.querySelector('#layer [data-act="epiEntregar"]');return !b||b.style.display==='none'}));
const sst=await entrar('sst');await ficha(sst,ferA,'sst');const nE=await sst.evaluate(id=>C(id).epi.length,ferA);
await sst.click('#layer [data-act="epiEntregar"]');await sst.waitForTimeout(300);await esperarSalvo(sst);
ok('SST da obra registra entrega do kit (ajudante: 6 básicos + cinto da obra)',(await sst.evaluate(id=>C(id).epi.length,ferA))===nE+7);
await rh.evaluate(()=>{try{closeModal()}catch(e){}});await rh.waitForTimeout(800);await rh.evaluate(()=>recarregarNuvem());await rh.waitForTimeout(500);

/* ================= FÉRIAS ================= */
await ficha(rh,ferA,'obras');let t=await txt(rh);
ok('Quadro de férias: 1º período completo a programar (30 dias) e 2º em aquisição',/Férias/.test(t)&&/A programar/.test(t)&&/Em aquisição/.test(t)&&await rh.evaluate(id=>{const d=feriasDados(C(id));return d.pers.length===2&&d.pers[0].saldo===30&&d.pers[0].completo&&!d.pers[1].completo},ferA));
ok('Alerta de férias: programar 30 dias com prazo de concessão',await rh.evaluate(id=>alertas().some(a=>a.tipo==='Férias'&&a.c?.id===id&&/Programar 30 dia\(s\)/.test(a.desc)),ferA));
// programar 20 dias + vender 10
async function programar(id,partes,abono){await ficha(rh,id,'obras');await rh.click('#layer [data-act="ferProg"]');await rh.waitForTimeout(300);
  await rh.evaluate(([partes,abono])=>{const f=document.querySelector('#layer .modal form');const set=(n,v)=>{const e=f.querySelector(`[name="${n}"]`);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};
    for(let i=0;i<3;i++){set('ini'+i,partes[i]?partes[i][0]:'');set('dias'+i,partes[i]?String(partes[i][1]):'')}set('abono',String(abono))},[partes,abono]);
  await rh.waitForTimeout(150);const prev=await txt(rh,'#ferPrev');await rh.click('#layer .modal footer [type="submit"]');await rh.waitForTimeout(300);
  const aberto=!!(await rh.$('#layer .modal form #ferPrev'));if(aberto)await rh.evaluate(()=>closeModal());return {prev,aberto}}
const util=await rh.evaluate(()=>{let s=addD(hoje,40);for(let i=0;i<14;i++){const ok=[1,2].every(k=>{const d=new Date(addD(s,k)+'T12:00:00').getDay();return d!==0&&!feriadosObra('oa').has(addD(s,k))});if(ok&&new Date(s+'T12:00:00').getDay()===1)return s;s=addD(s,1)}return s});
const sexta=await rh.evaluate(u=>{let s=u;while(new Date(s+'T12:00:00').getDay()!==5)s=addD(s,1);return s},util);
let r=await programar(ferA,[[sexta,20]],10);
ok('Início na sexta (domingo 2 dias depois) é recusado (art. 134, §3º)',r.aberto&&/2 dias antes de domingo/.test(r.prev),r.prev.slice(0,160));
r=await programar(ferA,[[util,20]],11);
ok('Venda de 11 dias é recusada (máximo 1/3)',r.aberto&&/Venda acima do permitido/.test(r.prev));
r=await programar(ferA,[[util,10],[addD0(util,14),10],[addD0(util,28),10]],0);
function addD0(d,n){const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}
ok('Fracionar 10 + 10 + 10 é recusado (nenhuma parte com 14 dias)',r.aberto&&/pelo menos 14 dias/.test(r.prev));
r=await programar(ferA,[[util,27]],0);
ok('Sobra de 3 dias é recusada (mínimo 5 por parte)',r.aberto&&/Sobrariam 3 dia/.test(r.prev));
r=await programar(ferA,[[util,20]],10);await esperarSalvo(rh);
ok('20 dias + 10 vendidos: aceito, período fica Programado com saldo 0',!r.aberto&&await rh.evaluate(id=>{const c=C(id);const d=feriasDados(c);const a=c.ausencias.find(x=>x.tipo==='Férias');return d.pers[0].saldo===0&&d.pers[0].abono===10&&d.pers[0].sit==='Programado'&&a&&a.feriasPer===0&&a.fim===addD(a.inicio,19)},ferA),r.prev.slice(0,120));
ok('Gravado no servidor no registro do colaborador',/feriasV2/.test(JSON.stringify(regDe('colab',ferA).dados))&&/"abono":10/.test(JSON.stringify(regDe('colab',ferA).dados)));
// 15 + 10 + 5
const w2=addD0(util,21),w3=addD0(util,35);
const ajust=async d=>rh.evaluate(s=>{while([1,2].some(k=>{const d=new Date(addD(s,k)+'T12:00:00').getDay();return d===0||feriadosObra('oa').has(addD(s,k))}))s=addD(s,1);return s},d);
r=await programar(ferB,[[util,15],[await ajust(w2),10],[await ajust(w3),5]],0);await esperarSalvo(rh);
ok('Fracionado 15 + 10 + 5: aceito, 3 partes ligadas ao período',!r.aberto&&await rh.evaluate(id=>C(id).ausencias.filter(a=>a.tipo==='Férias'&&a.feriasPer===0).length===3&&feriasDados(C(id)).pers[0].saldo===0,ferB),r.prev.slice(0,200));
// aviso e pagamento: férias programadas para daqui a 20 dias
await rh.evaluate(id=>{const c=C(id);const a=c.ausencias.find(x=>x.tipo==='Férias');const n=addD(hoje,20);const d=a.fim?(new Date(a.fim+'T12:00:00')-new Date(a.inicio+'T12:00:00'))/864e5:19;a.inicio=n;a.fim=addD(n,d);save()},ferA);
ok('Férias a menos de 30 dias sem aviso geram alerta "Entregar aviso"',await rh.evaluate(id=>alertas().some(a=>a.tipo==='Férias'&&a.c?.id===id&&/Entregar aviso/.test(a.desc)),ferA));
await ficha(rh,ferA,'obras');await rh.click('#layer [data-act="ferAviso"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await rh.waitForTimeout(300);
ok('Aviso entregue registrado tira o alerta',await rh.evaluate(id=>!alertas().some(a=>a.c?.id===id&&/Entregar aviso/.test(a.desc))&&!!C(id).ausencias.find(x=>x.tipo==='Férias').aviso,ferA));
await rh.evaluate(id=>{const a=C(id).ausencias.find(x=>x.tipo==='Férias');const d=(new Date(a.fim+'T12:00:00')-new Date(a.inicio+'T12:00:00'))/864e5;a.inicio=addD(hoje,8);a.fim=addD(a.inicio,d);save()},ferA);
ok('Pagamento a vencer gera alerta "Pagar férias até"',await rh.evaluate(id=>alertas().some(a=>a.c?.id===id&&/Pagar férias até/.test(a.desc)),ferA));
await ficha(rh,ferA,'obras');await rh.click('#layer [data-act="ferPago"]');await rh.waitForTimeout(200);await rh.click('#layer .modal footer [type="submit"]');await rh.waitForTimeout(300);
ok('Pagamento registrado tira o alerta',await rh.evaluate(id=>!alertas().some(a=>a.c?.id===id&&/Pagar/.test(a.desc)),ferA));
// cancelar uma parte do fracionado
await ficha(rh,ferB,'obras');await rh.click('#layer [data-act="ferCancelar"]');await rh.waitForTimeout(200);await rh.fill('#layer [name="motivo"]','Pedido do colaborador');await rh.click('#layer .modal footer [type="submit"]');await rh.waitForTimeout(300);
ok('Cancelar programação devolve os dias ao saldo e fica no histórico',await rh.evaluate(id=>{const d=feriasDados(C(id));return d.pers[0].saldo>0&&(C(id).feriasV2.per[0].cancelados||[]).length===1},ferB)&&/programação\(ões\) cancelada/.test(await txt(rh)));
// faltas reduzem o direito
await ficha(rh,venc,'obras');
ok('Período vencido aparece como "pagar em dobro" e gera alerta vencido',/Vencido: pagar em dobro/.test(await txt(rh))&&await rh.evaluate(id=>alertas().some(a=>a.c?.id===id&&a.vencido&&/Férias vencidas/.test(a.desc)),venc));
await rh.fill(`#layer [data-chg="ferFaltas"][data-n="1"]`,'10');await rh.press(`#layer [data-chg="ferFaltas"][data-n="1"]`,'Tab');await rh.waitForTimeout(300);
ok('10 faltas injustificadas reduzem o direito do período para 24 dias',await rh.evaluate(id=>feriasDados(C(id)).pers[1].direito===24,venc));
ok('Faltas depois de programar: excesso sobre o direito aparece no quadro e nos alertas',await rh.evaluate(id=>{const c=C(id);c.feriasV2.per[0].faltas=10;CACHE.clear();const d=feriasDados(c);const r=d.pers[0].excedente===6&&alertas().some(a=>a.c?.id===id&&/além do direito/.test(a.desc));c.feriasV2.per[0].faltas=0;CACHE.clear();return r},ferA));
r=await programar(ferB,[[util,5]],'10,0');
ok('Dias vendidos com vírgula são recusados (número inteiro)',r.aberto&&/número inteiro/.test(r.prev));
ok('Parte sem vínculo não ocupa período já cheio por parte vinculada posterior',await rh.evaluate(()=>{const c={admissao:addM(hoje,-26),vinculo:'CLT',status:'Ativo',ferias:{gozadas:0},feriasV2:{v:1,migrados:0,per:{}},
  ausencias:[{id:'x1',tipo:'Férias',inicio:addD(addM(hoje,-26),400),fim:addD(addM(hoje,-26),414)},{id:'x2',tipo:'Férias',inicio:addD(addM(hoje,-26),500),fim:addD(addM(hoje,-26),529),feriasPer:0}]};
  const d=feriasDados(c);return d.pers[0].partes.map(a=>a.id).join()==='x2'&&d.pers[1].partes.map(a=>a.id).join()==='x1'}));
// migração e lançamento pela tela de ausência
await ficha(rh,migr,'obras');
ok('Registro antigo (1 férias gozada) vira período quitado "registro anterior"',/Quitado \(registro anterior\)/.test(await txt(rh))&&await rh.evaluate(id=>feriasDados(C(id)).pers[0].migrado&&feriasDados(C(id)).pers[1].saldo===30,migr));
await rh.evaluate(id=>{const c=C(id);c.ausencias.push({id:uid(),tipo:'Férias',inicio:addD(hoje,-20),fim:addD(hoje,-11),confirmado:true});save()},venc);
ok('Férias lançadas pela tela de ausência entram no período mais antigo com saldo',await rh.evaluate(id=>feriasDados(C(id)).pers[0].gozados===10,venc));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='rel';UI.rel='ferias';render()});const rel=await txt(rh,'#main');
ok('Relatório Férias mostra saldo, prazo e situação por pessoa',/Vera Vencida/.test(rel)&&/Vencido: pagar em dobro/.test(rel)&&/Fabio Ferias/.test(rel));
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='cfg';UI.cfgTab='perfis';render()});
ok('Permissão "Programar férias" aparece na matriz, marcada para RH',await rh.evaluate(()=>!!document.querySelector('[data-cfgperm="programarFerias|rh"]')?.checked));
await esperarSalvo(rh);
const g2=await entrar('gestor');await ficha(g2,ferA,'obras');
ok('Gestor vê as datas de férias, mas não programa nem marca pagamento',/Férias/.test(await txt(g2))&&!(await g2.$('#layer [data-act="ferProg"]'))&&!(await g2.$('#layer [data-act="ferPago"]')));
ok('Sem erros (RH, gestor, SST)',![...rh.errs,...ges.errs,...g2.errs,...sst.errs].length,[...rh.errs,...ges.errs,...g2.errs,...sst.errs].slice(0,3).join(' | '));
for(const [nome,pg] of [['RH',rh],['Gestor',g2],['SST',sst]]){pg.errs.length=0;
  for(const v of ['painel','colab','adm','obras','plan','hosp','ates','ponto','alertas','rel','audit','cfg'])await pg.evaluate(v=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view=v;render()},v);
  for(const tb of ['resumo','cadastro','sst','obras','registros'])await ficha(pg,ferA,tb);
  ok(`${nome}: todas as telas e abas da ficha abrem sem erro`,!pg.errs.length,pg.errs.slice(0,2).join(' | '))}
await ficha(rh,ferA,'obras');await rh.screenshot({path:path.join(__dirname,'v17_ferias.png'),fullPage:false});
await ficha(rh,solda,'sst');await rh.screenshot({path:path.join(__dirname,'v17_epi.png')});
await rh.evaluate(()=>{try{closeModal()}catch(e){}UI.ficha=null;UI.view='cfg';UI.cfgTab='epi';render()});await rh.screenshot({path:path.join(__dirname,'v17_cfg.png')});
await ficha(rh,ferA,'obras');await rh.click('#layer [data-act="ferProg"]').catch(()=>{});await rh.waitForTimeout(300);await rh.screenshot({path:path.join(__dirname,'v17_prog.png')});

console.log(Object.entries(R).map(([k,v])=>k.padEnd(96)+' '+v).join('\n'));
const n=Object.values(R).filter(v=>v.startsWith('OK')).length;console.log(`${n}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);console.log(Object.entries(R).map(([k,v])=>k.padEnd(96)+' '+v).join('\n'));process.exit(1)});
