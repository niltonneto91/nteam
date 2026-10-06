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

(async()=>{await new Promise(s=>srv.listen(4173,s));
const b=await chromium.launch({args:['--lang=pt-BR']});
async function contexto(){const ctx=await b.newContext({viewport:{width:1280,height:800},locale:'pt-BR',timezoneId:'America/Sao_Paulo',acceptDownloads:true});
  await ctx.route('https://yyylvkofbdhrlaizvoop.supabase.co/**',servidor);await ctx.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());return ctx}
function vigiar(p){p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/realtime|websocket|ERR_FAILED|fonts\.g|status of 4\d\d|"etapa":"arquivo\.enviar"/i.test(m.text()))p.errs.push('console: '+m.text())});p.on('dialog',d=>d.dismiss())}
async function entrar(k){const ctx=await contexto();const p=await ctx.newPage();vigiar(p);
  await p.goto('http://localhost:4173/');await p.waitForSelector('#f-login');
  await p.fill('#f-login [name=email]',`t-${k}@example.com`);await p.fill('#f-login [name=senha]','senha-de-teste');await p.click('#f-login button');
  await p.waitForFunction(()=>window.NUVEM?.iniciado&&document.querySelector('#main h1'),null,{timeout:15000});await p.waitForTimeout(400);return p}
const esperarSalvo=async p=>{await p.waitForFunction(()=>/Tudo salvo|Dados no servidor/.test(document.getElementById('nv-status')?.textContent||''),null,{timeout:10000}).catch(()=>{});await p.waitForTimeout(300)};
const fichaAba=async(p,id,tab,sub)=>{await p.evaluate(([id,tab,sub])=>{closeModal?.();UI.view='colab';UI.ficha=id;UI.fichaTab=tab;if(sub)UI.fichaSub[tab]=sub;render()},[id,tab,sub]);await p.waitForTimeout(700);await p.evaluate(()=>render());await p.waitForTimeout(200)};
const esperarArq=async(n)=>{for(let i=0;i<40&&S.arq.length<n;i++)await new Promise(r=>setTimeout(r,150))};

// 1. RH: obras A e B, colaboradores
const rh=await entrar('rh');
await rh.evaluate(()=>{const mk=(id,nome)=>({id,nome,cliente:'Cliente',cidade:'Cidade',tipo:'Terminal novo',status:'Ativa',trExtra:[],frentes:['Geral'],feriados:[],prazos:{},heRegras:[],docsExigidos:[]});DB.cfg.obras.push(mk('oa','Obra A'),mk('ob','Obra B'));save()});await esperarSalvo(rh);
for(const [nome,obra] of [['Ana Obra A','oa'],['Bruno Obra B','ob']]){
  await rh.evaluate(()=>{document.querySelector('#layer [data-act="fechaFicha"]')?.click();UI.ficha=null;UI.view='colab';render()});await rh.click('[data-act="novoExistente"]');await rh.waitForTimeout(250);
  await rh.fill('#layer [name="nome"]',nome);await rh.fill('#layer [name="tel"]','(62) 90000-0000');await rh.selectOption('#layer [name="funcao"]','sold');await rh.selectOption('#layer [name="obra"]',obra);
  await rh.evaluate(()=>{const f=document.querySelector('#layer form');for(const [n,v] of [['admissao','2026-03-02'],['desde','2026-04-01']]){const e=f.querySelector(`[name="${n}"]`);if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}});
  await rh.selectOption('#layer [name="regime"]','Local');await rh.selectOption('#layer [name="vinculo"]','CLT');await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(400)}
const ids=await rh.evaluate(()=>Object.fromEntries(DB.colabs.map(c=>[c.obraId,c.id])));await esperarSalvo(rh);

// 2. Cadastro › Documentos: anexa RG (item do checklist) e contrato
await fichaAba(rh,ids.oa,'cadastro','docs');
const temAnexar=await rh.evaluate(()=>[...document.querySelectorAll('#layer [data-chg="arqNovo"]')].length);
ok('Documentos do cadastro mostram "Anexar" para cada item do checklist',temAnexar>=12,temAnexar);
const nota=await rh.evaluate(()=>document.querySelector('#layer .drawer-b')?.innerText||'');
ok('Aviso de protótipo removido da aba Documentos',!/No protótipo/.test(nota)&&/armazenamento privado/.test(nota));
await rh.setInputFiles('#layer [data-chg="arqNovo"][data-tipo="RG ou CNH"]',PDF('rg-ficticio.pdf'));await esperarArq(1);await rh.waitForTimeout(500);
const rg=S.arq.find(a=>a.tipo_doc==='RG ou CNH');
ok('RG vai para o armazenamento privado na pasta do colaborador, categoria documentos pessoais',!!rg&&rg.categoria==='pessoal'&&rg.caminho.startsWith(`c/${ids.oa}/pessoal/`)&&S.obj.has(rg.caminho),rg&&rg.caminho);
await fichaAba(rh,ids.oa,'cadastro','docs');
ok('Item do checklist passa para "Recebido" e mostra Ver/Substituir/Remover',await rh.evaluate(id=>(C(id).docs['RG ou CNH']||0)>=1&&!!document.querySelector(`#layer [data-act="arqVer"]`)&&!!document.querySelector('#layer [data-chg="arqSubst"]'),ids.oa));
await rh.selectOption(`#layer #arq-ot-${ids.oa}`,'registro|Contrato de trabalho');await rh.setInputFiles(`#layer [data-sel="#arq-ot-${ids.oa}"]`,PDF('contrato.pdf'));await esperarArq(2);
ok('Contrato de trabalho entra como "Registro e contrato"',S.arq.some(a=>a.tipo_doc==='Contrato de trabalho'&&a.categoria==='registro'));
// arquivo inválido e grande
await fichaAba(rh,ids.oa,'cadastro','docs');const n0=S.arq.length;
await rh.setInputFiles('#layer [data-chg="arqNovo"][data-tipo="CPF"]',{name:'cpf.txt',mimeType:'text/plain',buffer:Buffer.from('texto')});await rh.waitForTimeout(500);
const t1=await rh.evaluate(()=>[...document.querySelectorAll('.toast,[role=status],[role=alert]')].map(e=>e.innerText).join(' | '));
await rh.setInputFiles('#layer [data-chg="arqNovo"][data-tipo="CPF"]',{name:'cpf.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+10,1)});await rh.waitForTimeout(500);
const t2=await rh.evaluate(()=>[...document.querySelectorAll('.toast,[role=status],[role=alert]')].map(e=>e.innerText).join(' | '));
ok('Arquivo que não é PDF/imagem e arquivo acima de 10 MB são recusados com aviso',S.arq.length===n0&&/PDF ou imagem/.test(t1)&&/10 MB/.test(t2),t1.slice(0,80)+' // '+t2.slice(0,80));
// substituir mantém histórico
await rh.setInputFiles(`#layer [data-chg="arqSubst"][data-a="${rg.id}"]`,PDF('rg-novo.pdf'));await esperarArq(3);await rh.waitForTimeout(400);
ok('Substituir cria nova versão e guarda a anterior no histórico',S.arq.length===n0+1&&!!rg.removido_em&&S.arq.some(a=>a.tipo_doc==='RG ou CNH'&&!a.removido_em&&a.nome==='rg-novo.pdf'));
await fichaAba(rh,ids.oa,'cadastro','docs');
ok('Histórico de arquivos substituídos aparece na ficha',await rh.evaluate(()=>/Histórico: 1 arquivo/.test(document.querySelector('#layer .drawer-b').innerText)));
// ver arquivo abre URL assinada
const pedidos=[];rh.context().on('request',r=>{if(r.method()==='GET'&&/\/object\/sign\/documentos\/c\//.test(r.url()))pedidos.push(r.url())});
await rh.click('#layer [data-act="arqVer"]');await rh.waitForTimeout(1500);
ok('Ver abre o arquivo por link assinado temporário',pedidos.length===1,pedidos[0]&&pedidos[0].slice(0,90));

// 3. SST: ASO e certificado com validade
await fichaAba(rh,ids.oa,'sst');
const linhasSst=await rh.evaluate(()=>[...document.querySelectorAll('#layer [data-chg="arqNovo"][data-cat="sst"]')].map(e=>e.dataset.tipo));
ok('Aba SST lista ASO, certificados exigidos, ficha de EPI e ordem de serviço',linhasSst.includes('ASO')&&linhasSst.some(t=>/^Certificado de /.test(t))&&linhasSst.includes('Ficha de EPI'),linhasSst.join(', '));
await rh.setInputFiles('#layer [data-chg="arqNovo"][data-tipo="ASO"]',PDF('aso.pdf'));await esperarArq(4);
ok('ASO anexado como Segurança do trabalho',S.arq.some(a=>a.tipo_doc==='ASO'&&a.categoria==='sst'&&a.colab_id===ids.oa));

// 4. atestado com arquivo
await rh.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='ates';render()});await rh.click('[data-act="novoAtes"]');await rh.waitForTimeout(250);await rh.selectOption('#layer [name="id"]',ids.oa);await rh.selectOption('#layer [name="tipo"]','Doença');
await rh.evaluate(()=>{const f=document.querySelector('#layer form');for(const [n,v] of [['inicio',addD(hoje,-1)],['dias','2'],['cid','Z99.9'],['medico','Dra. Ficticia']]){const e=f.querySelector(`[name="${n}"]`);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}});
await rh.setInputFiles('#layer [name="arquivo"]',PDF('atestado-ficticio.pdf'));await rh.click('#layer footer [type="submit"]');await esperarArq(5);await esperarSalvo(rh);
const atId=await rh.evaluate(id=>C(id).atestados[0]?.id,ids.oa);
ok('Arquivo do atestado fica na categoria Atestado, ligado ao atestado',S.arq.some(a=>a.categoria==='atestado'&&a.ref_id===atId&&a.colab_id===ids.oa));
await fichaAba(rh,ids.oa,'registros','ates');
ok('Lista de atestados mostra "Ver" do arquivo para quem vê saúde',await rh.evaluate(()=>!!document.querySelector('#layer table [data-act="arqVer"]')));

// 5. documento da obra com arquivo
await rh.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='obras';UI.obraSel='oa';UI.obraTab='docs';render()});await rh.waitForTimeout(300);
await rh.click('[data-act="docNovo"]');await rh.waitForTimeout(250);await rh.fill('#layer [name="titulo"]','PGR Obra A');await rh.setInputFiles('#layer [name="arquivo"]',PDF('pgr.pdf'));
await rh.click('#layer footer [type="submit"]');await esperarArq(6);await rh.waitForTimeout(400);
const pgr=S.arq.find(a=>a.categoria==='obra');
ok('Arquivo da revisão do documento da obra vai para a pasta da obra',!!pgr&&pgr.caminho.startsWith('o/oa/')&&/PGR Obra A · Rev\. 0/.test(pgr.tipo_doc),pgr&&pgr.tipo_doc);
await rh.evaluate(()=>{const x=DB.docsObra[0];const v=x.versoes[0];v.aprovado=true;v.estado='Aprovado';v.inicio=addD(hoje,-30);save();render()});await esperarSalvo(rh);
ok('Tela de documentos da obra mostra Ver e sem aviso de protótipo',await rh.evaluate(()=>!!document.querySelector('#main [data-act="arqVer"]')&&!/não armazenado no protótipo|Protótipo: o campo/.test(document.getElementById('main').innerText)));
ok('Sem erros no RH',!rh.errs.length,rh.errs.join(' | '));

// 6. quem vê o quê
S.perfis.find(x=>x.user_id==='u-adm').obras=['oa'];S.perfis.find(x=>x.user_id==='u-admb').obras=['ob'];S.perfis.find(x=>x.user_id==='u-gestor').obras=['oa'];S.perfis.find(x=>x.user_id==='u-sst').obras=['oa'];
const ve=async k=>{const p=await entrar(k);await fichaAba(p,ids.oa,'sst');const cats=await p.evaluate(async()=>{const {data}=await NUVEM.sb.from('arquivo').select('categoria');return (data||[]).map(x=>x.categoria).sort().join(',')});return {p,cats}};
const vAdm=await ve('adm');ok('Administrativo da Obra A vê pessoais, registro, SST, atestado e obra',vAdm.cats==='atestado,obra,pessoal,pessoal,registro,sst',vAdm.cats);
const vAdmB=await ve('admb');ok('Administrativo da Obra B não vê arquivos da Obra A',vAdmB.cats==='',vAdmB.cats);
const vGes=await ve('gestor');ok('Gestor da Obra A vê só documentos da obra (nada pessoal, SST ou atestado)',vGes.cats==='obra',vGes.cats);
const vSst=await ve('sst');ok('SST da Obra A vê SST, atestado e obra; nada pessoal',vSst.cats==='atestado,obra,sst',vSst.cats);
const vDir=await ve('dir');ok('Diretoria vê pessoais, registro, SST e obra, sem atestado',vDir.cats==='obra,pessoal,pessoal,registro,sst',vDir.cats);
const nNeg=S.negados.length;await vAdmB.p.evaluate(async id=>{await NUVEM.sb.storage.from('documentos').upload(`c/${id}/pessoal/${crypto.randomUUID()}.pdf`,new File(['x'],'x.pdf',{type:'application/pdf'}))},ids.oa);
ok('Envio direto para colaborador de outra obra é bloqueado no servidor',S.negados.length===nNeg+1);
ok('Gestor não tem a aba Pacote de documentos',await vGes.p.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='obras';UI.obraSel='oa';UI.obraTab='geral';render();return !document.querySelector('[data-act="obraTab"][data-v="pacote"]')}));

// 7. pacote da obra (RH)
await rh.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='obras';UI.obraSel='oa';UI.obraTab='pacote';render()});await rh.waitForTimeout(900);await rh.evaluate(()=>render());await rh.waitForTimeout(300);
const tpac=await rh.evaluate(()=>document.getElementById('main').innerText);
ok('Pacote mostra Ana, quantos arquivos tem e o que falta',/Ana Obra A/.test(tpac)&&/3 arquivo\(s\)/.test(tpac)&&/CPF/.test(tpac)&&!/Bruno/.test(tpac),tpac.match(/2\. Pessoas[\s\S]{0,200}/)?.[0]);
ok('Resumo do envio conta 3 arquivos de Ana + 1 da obra, sem o atestado',/4 arquivo\(s\)/.test(tpac));
const [dl]=await Promise.all([rh.waitForEvent('download',{timeout:15000}),rh.click('[data-act="pacZip"]')]);const zbuf=fs.readFileSync(await dl.path());const z=await JSZip.loadAsync(zbuf);const nomes=Object.keys(z.files).filter(n=>!z.files[n].dir);
ok('ZIP traz pastas por colaborador e categoria, documentos da obra e LEIA-ME, sem atestado',nomes.length===5&&nomes.some(n=>/Ana Obra A\/Documentos pessoais\/RG ou CNH\.pdf$/.test(n))&&nomes.some(n=>/Documentos da obra\//.test(n))&&nomes.some(n=>/LEIA-ME/.test(n))&&!nomes.some(n=>/testado/i.test(n)),nomes.join(' ; '));
const leia=await z.file(nomes.find(n=>/LEIA-ME/.test(n))).async('string');ok('LEIA-ME lista as pendências',/Pendências[\s\S]*Ana Obra A: [^\n]*CPF/.test(leia));
await rh.click('[data-act="pacLink"]');await rh.waitForTimeout(300);await rh.click('#layer footer [type="submit"]');await rh.waitForSelector('#pac-cod',{timeout:8000});
const link=await rh.evaluate(()=>({url:document.getElementById('pac-url').value,cod:document.getElementById('pac-cod').value}));
const pk=S.pac[0];
ok('Link gerado com código de 6 dígitos; pacote no servidor sem atestado',/\/p#[0-9a-f]{36}$/.test(link.url)&&/^\d{6}$/.test(link.cod)&&pk.itens.length===4&&!pk.itens.some(id=>S.arq.find(a=>a.id===id).categoria==='atestado'),link.url);
await rh.evaluate(()=>closeModal());await rh.waitForTimeout(800);await rh.evaluate(()=>{ARQ.pacotes.clear();render()});await rh.waitForTimeout(600);
ok('Lista de links da obra mostra o link ativo',/Ativo/.test(await rh.evaluate(()=>document.getElementById('main').innerText)));

// 8. página pública
const ctxP=await contexto();const pub=await ctxP.newPage();vigiar(pub);
await pub.goto(link.url.replace(/^https?:\/\/[^/]+/,'http://localhost:4173'));await pub.waitForSelector('#codigo');
await pub.fill('#codigo',link.cod==='000000'?'111111':'000000');await pub.click('#entrar');await pub.waitForTimeout(500);
const errP=await pub.textContent('#erro');ok('Código errado mostra aviso e quantas tentativas restam',/Código incorreto.*Restam 4/.test(errP),errP);
await pub.fill('#codigo',link.cod);await pub.click('#entrar');await pub.waitForSelector('#etapa-docs ul.docs',{timeout:8000});
const tp=await pub.textContent('#etapa-docs');
ok('Código certo lista documentos por colaborador e da obra, sem atestado',/Ana Obra A/.test(tp)&&/RG ou CNH/.test(tp)&&/Contrato de trabalho/.test(tp)&&/PGR Obra A/.test(tp)&&!/testado/i.test(tp),tp.slice(0,160));
const [dl2]=await Promise.all([pub.waitForEvent('download',{timeout:15000}),pub.click('#zip')]);const z2=await JSZip.loadAsync(fs.readFileSync(await dl2.path()));
ok('Página pública baixa todos os documentos em ZIP',Object.keys(z2.files).filter(n=>!z2.files[n].dir).length===4);
ok('Página pública sem erros',!pub.errs.length,pub.errs.join(' | '));
const ctxQ=await contexto();const pq=await ctxQ.newPage();vigiar(pq);await pq.goto(link.url.replace(/^https?:\/\/[^/]+/,'http://localhost:4173'));await pq.waitForSelector('#codigo');
for(let i=0;i<5;i++){await pq.fill('#codigo','00000'+(i%2?'1':'2'));await pq.click('#entrar');await pq.waitForTimeout(250)}
await pq.fill('#codigo',link.cod);await pq.click('#entrar');await pq.waitForTimeout(400);
ok('Depois de 5 códigos errados o link bloqueia, mesmo com o código certo',/15 minutos/.test(await pq.textContent('#erro')),await pq.textContent('#erro'));
const pz=await (await contexto()).newPage();await pz.goto('http://localhost:4173/p#abc');await pz.waitForTimeout(300);
ok('Link incompleto mostra orientação em vez do formulário',/Link incompleto/.test(await pz.textContent('main')));

// 9. encerrar link
pk.bloqueado_ate=null;await rh.evaluate(()=>{ARQ.pacotes.clear();render()});await rh.waitForTimeout(600);
await rh.click('[data-act="pacEncerrar"]');await rh.waitForTimeout(200);await rh.click('#layer footer [type="submit"]');await rh.waitForTimeout(500);
const pr=await (await contexto()).newPage();await pr.goto(link.url.replace(/^https?:\/\/[^/]+/,'http://localhost:4173'));await pr.fill('#codigo',link.cod);await pr.click('#entrar');await pr.waitForTimeout(400);
ok('Link encerrado deixa de abrir',!!pk.revogado_em&&/encerrado/.test(await pr.textContent('#erro')));

// 10. SST da obra gera pacote só com SST e obra
const sp=vSst.p;await sp.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='obras';UI.obraSel='oa';UI.obraTab='pacote';render()});await sp.waitForTimeout(900);await sp.evaluate(()=>render());await sp.waitForTimeout(300);
const cats=await sp.evaluate(()=>[...document.querySelectorAll('[data-chg="pacCat"]')].map(e=>e.value+':'+(e.disabled?'off':'on')+(e.checked?'*':'')).join(','));
ok('SST: documentos pessoais e de registro desativados no pacote',cats==='pessoal:off,registro:off,sst:on*,obra:on*',cats);
await sp.click('[data-act="pacLink"]');await sp.waitForTimeout(300);await sp.click('#layer footer [type="submit"]');await sp.waitForSelector('#pac-cod',{timeout:8000});
const pk2=S.pac[1];ok('Pacote do SST leva só ASO e documento da obra',pk2&&pk2.itens.map(id=>S.arq.find(a=>a.id===id).categoria).sort().join(',')==='obra,sst');
ok('Sem erros (perfis)',![...sp.errs,...vAdm.p.errs,...vGes.p.errs,...vDir.p.errs].length,[...sp.errs,...vAdm.p.errs,...vGes.p.errs,...vDir.p.errs].join(' | '));

// 11. remover e auditoria
await fichaAba(rh,ids.oa,'cadastro','docs');const antes=S.arq.filter(a=>!a.removido_em).length;
await rh.click('#layer [data-act="arqRemover"]');await rh.waitForTimeout(200);await rh.fill('#layer [name="motivo"]','Enviado errado');await rh.click('#layer .modal footer [type="submit"]');await rh.waitForTimeout(600);
ok('Remover pede motivo e guarda no histórico',S.arq.filter(a=>!a.removido_em).length===antes-1&&S.arq.some(a=>a.removido_motivo==='Enviado errado'));
await rh.waitForTimeout(500);
const audTxt=JSON.stringify(S.aud);
ok('Auditoria registra anexos, aberturas e ZIP sem nome de arquivo nem dado do atestado',/Anexou arquivo/.test(audTxt)&&/Abriu arquivo/.test(audTxt)&&/ZIP/.test(audTxt)&&!/rg-ficticio|atestado-ficticio|Z99\.9|Ficticia/.test(audTxt));
await rh.evaluate(()=>{closeModal?.();UI.ficha=null;UI.view='cfg';UI.cfgTab='dados';render()});await rh.waitForTimeout(500);
ok('Configurações › Dados mostra o uso do armazenamento',/de 1 GB usados/.test(await rh.evaluate(()=>document.getElementById('main').innerText)));
ok('Sem erros no RH (final)',!rh.errs.length,rh.errs.join(' | '));

console.log(Object.entries(R).map(([k,v])=>k.padEnd(100)+' '+v).join('\n'));
const n=Object.values(R).filter(v=>v.startsWith('OK')).length;console.log(`${n}/${Object.keys(R).length} aprovados`);
await b.close();srv.close();process.exit(0)})().catch(e=>{console.error(e);console.log(Object.entries(R).map(([k,v])=>k.padEnd(100)+' '+v).join('\n'));process.exit(1)});
