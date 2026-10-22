/* nTeam · VERSÃO DE DEMONSTRAÇÃO
   Roda o mesmo app do sistema oficial, mas sem banco de dados: todas as chamadas que iriam ao Supabase
   são atendidas aqui, no próprio navegador, com as mesmas regras de acesso por perfil e por obra.
   Os dados são fictícios e ficam guardados só neste navegador (IndexedDB). Nada sai daqui. */
(function(){
'use strict';
const HOST='https://yyylvkofbdhrlaizvoop.supabase.co';
const SESS='nteam-sessao';
const fetchReal=window.fetch.bind(window);
const DEMO=window.NTEAM_DEMO={};

/* ---------- estado ---------- */
let S=null;
const IDB={db:null,
  abrir(){return new Promise((ok,er)=>{const r=indexedDB.open('nteam-demo',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{this.db=r.result;ok()};r.onerror=()=>er(r.error)})},
  ler(k){return new Promise(ok=>{try{const t=this.db.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>ok(t.result||null);t.onerror=()=>ok(null)}catch(e){ok(null)}})},
  gravar(k,v){return new Promise(ok=>{try{const t=this.db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>ok(true);t.onerror=()=>ok(false)}catch(e){ok(false)}})},
  apagar(){return new Promise(ok=>{try{const t=this.db.transaction('kv','readwrite');t.objectStore('kv').clear();t.oncomplete=()=>ok();t.onerror=()=>ok()}catch(e){ok()}})}};
let tGravar=null;
function salvarEstado(){clearTimeout(tGravar);tGravar=setTimeout(()=>{if(IDB.db)IDB.gravar('estado',S)},250)}
DEMO.estado=()=>S;
DEMO.exportar=()=>JSON.stringify({...S,obj:{}});

/* ---------- utilidades ---------- */
const b64u=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const token=uid=>`${b64u({alg:'HS256',typ:'JWT'})}.${b64u({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+86400})}.demo`;
const uidDoToken=h=>{const t=String(h||'').replace(/^Bearer\s+/i,'');try{const p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(escape(atob(p)))).sub}catch(e){return null}};
const agora=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g,()=>(Math.random()*16|0).toString(16));
async function sha(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const copia=o=>JSON.parse(JSON.stringify(o));
const eu=uid=>S.perfis.find(x=>x.user_id===uid&&x.ativo&&!x.trocar_senha);
const conta=uid=>S.perfis.find(x=>x.user_id===uid);
const regDe=(tipo,id)=>S.reg[tipo+'|'+id];
const NOME_PERFIL={rh:'Analista de RH',sst:'Segurança do trabalho',dir:'Diretoria',gestor:'Gestor da obra',enc:'Encarregado de obra',adm:'Administrativo de obra'};

/* ---------- regras de acesso (cópia das funções do banco: pode_registro, pode_gravar_registro, pode_arquivo) ---------- */
function podeRegistro(uid,tipo,obras){const e=eu(uid);if(!e)return false;const p=e.perfil;const tem=(obras||[]).some(o=>(e.obras||[]).includes(o));
  if(tipo==='global')return true;
  if(tipo==='financeiro'||tipo==='lote')return ['rh','dir'].includes(p);
  if(tipo==='custos')return ['rh','dir','adm'].includes(p);
  if(tipo==='saude')return p==='rh'||(['sst','adm'].includes(p)&&tem);
  if(['rh','dir'].includes(p))return true;
  if(tipo==='proposta')return p==='adm'&&tem;
  if(tipo==='pessoal')return p==='adm'&&tem;
  if(tipo==='ponto')return ['gestor','adm'].includes(p)&&tem;
  if(['aval','avalrasc','cand'].includes(tipo))return ['gestor','adm'].includes(p)&&tem;
  return tem}
const podeGravar=(uid,tipo,obras)=>podeRegistro(uid,tipo,obras)&&(!['custos','proposta'].includes(tipo)||['rh','dir'].includes(eu(uid).perfil));
function podeArquivo(uid,cat,colab,obra){const e=eu(uid);if(!e)return false;const ob=colab?(regDe('colab',colab)?.obras||[]):[obra];const tem=ob.some(o=>(e.obras||[]).includes(o));
  if(cat==='atestado')return !!colab&&podeRegistro(uid,'saude',ob);
  if(cat==='pessoal'||cat==='registro')return !!colab&&podeRegistro(uid,'pessoal',ob);
  if(cat==='sst')return !!colab&&(['rh','dir'].includes(e.perfil)||(['sst','adm'].includes(e.perfil)&&tem));
  if(cat==='obra')return !colab&&!!obra&&podeRegistro(uid,'docobra',ob);return false}
function podeCaminho(uid,p){let m=p.match(/^c\/([A-Za-z0-9_-]{1,60})\/(pessoal|registro|sst|atestado)\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/);if(m)return podeArquivo(uid,m[2],m[1],null);
  m=p.match(/^o\/([A-Za-z0-9_-]{1,60})\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/);if(m)return podeArquivo(uid,'obra',null,m[1]);return false}
function filtrar(l,u){for(const [k,v] of u.searchParams){if(['select','order','limit','offset'].includes(k))continue;
    if(v.startsWith('eq.'))l=l.filter(x=>String(x[k])===v.slice(3));else if(v.startsWith('in.(')){const s=v.slice(4,-1).split(',').map(x=>x.replace(/^"|"$/g,''));l=l.filter(x=>s.includes(String(x[k])))}}
  return l}
function auditar(uid,modulo,acao,evento){const x=conta(uid)||{nome:'—',perfil:''};S.aud.push({id:S.aud.length+1,em:agora(),autor_id:uid,autor_nome:x.nome,autor_perfil:x.perfil,modulo,acao,evento:{acao,modulo,...evento}})}

/* ---------- respostas ---------- */
const H={'content-type':'application/json'};
const json=(st,b,h={})=>new Response(st===204?null:JSON.stringify(b),{status:st,headers:{...H,...h}});
async function lerCorpo(init,req){
  const b=init&&('body' in init)?init.body:req?await req.clone().blob():null;
  if(b==null)return {txt:'',blob:null,form:null};
  if(typeof b==='string')return {txt:b,blob:null,form:null};
  if(b instanceof FormData){let f=null;for(const [,v] of b.entries())if(v instanceof Blob)f=v;return {txt:'',blob:f,form:b}}
  if(b instanceof Blob)return {txt:await b.text(),blob:b,form:null};
  if(b instanceof ArrayBuffer||ArrayBuffer.isView(b)){const bl=new Blob([b]);return {txt:await bl.text(),blob:bl,form:null}}
  return {txt:String(b),blob:null,form:null}}

/* ---------- servidor ---------- */
const LIM=10*1024*1024,MIMES=['application/pdf','image/jpeg','image/png','image/webp'];
async function servidor(input,init){
  const req=input instanceof Request?input:null;const url=req?req.url:String(input);const u=new URL(url);
  const m=String((init&&init.method)||(req&&req.method)||'GET').toUpperCase();
  const hd=new Headers((init&&init.headers)||(req&&req.headers)||{});
  const uid=uidDoToken(hd.get('authorization'));const objeto=(hd.get('accept')||'').includes('vnd.pgrst.object');
  const cb=await lerCorpo(init,req);const corpo=()=>{try{return JSON.parse(cb.txt||'{}')}catch(e){return {}}};
  const p=u.pathname;let mudou=false;const fim=async r=>{if(mudou&&IDB.db)await IDB.gravar('estado',S);return r};

  /* autenticação */
  if(p==='/auth/v1/token'){const b=corpo();let id=null;
    if(u.searchParams.get('grant_type')==='refresh_token')id=String(b.refresh_token||'').replace(/^r-/,'');
    if(!id||!conta(id))return json(400,{error:'invalid_grant',error_description:'Invalid Refresh Token',msg:'Invalid Refresh Token'});
    const c=conta(id);return json(200,sessao(c))}
  if(p==='/auth/v1/user'){const c=conta(uid);if(!c)return json(401,{msg:'sem sessão'});return json(200,usuario(c))}
  if(p==='/auth/v1/logout')return json(204,null);
  if(p.startsWith('/auth/'))return json(400,{msg:'Não disponível na demonstração.'});

  /* função de acessos (Configurações › Pessoas e acessos) */
  if(p==='/functions/v1/gerir-acesso'){const e=eu(uid);if(!e||!['rh','dir'].includes(e.perfil))return json(403,{ok:false,mensagem:'Só RH e Diretoria gerenciam acessos.'});
    const b=corpo();
    if(b.acao==='criar'){const email=String(b.email||'').trim().toLowerCase();const nome=String(b.nome||'').trim();const perfil=String(b.perfil||'');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return json(400,{ok:false,mensagem:'Informe um e-mail válido.'});
      if(!nome)return json(400,{ok:false,mensagem:'Informe o nome.'});
      if(!NOME_PERFIL[perfil])return json(400,{ok:false,mensagem:'Perfil inválido.'});
      if(perfil==='dir'&&e.perfil!=='dir')return json(403,{ok:false,mensagem:'Só a Diretoria cria acesso com perfil Diretoria.'});
      if(S.perfis.some(x=>x.email===email))return json(409,{ok:false,mensagem:'Já existe um acesso com este e-mail.'});
      const novo={user_id:uuid(),nome,email,perfil,obras:['rh','dir'].includes(perfil)?[]:(b.obras||[]),pessoa_id:b.pessoa_id||null,ativo:true,trocar_senha:true,admin_total:false};
      S.perfis.push(novo);mudou=true;auditar(uid,'Configurações · acessos','Criou acesso',{alvo:email,nome,perfil:NOME_PERFIL[perfil]});
      return fim(json(200,{ok:true,user_id:novo.user_id,senha_temporaria:'demonstracao'}))}
    if(['redefinir','desativar','reativar'].includes(b.acao)){const a=conta(b.user_id);if(!a)return json(404,{ok:false,mensagem:'Usuário não encontrado.'});
      if(a.user_id===uid)return json(400,{ok:false,mensagem:'Use “Trocar minha senha” para a sua conta; não é possível desativar a si mesmo.'});
      if(a.perfil==='dir'&&e.perfil!=='dir')return json(403,{ok:false,mensagem:'Só a Diretoria altera contas da Diretoria.'});
      if(a.admin_total&&!e.admin_total)return json(403,{ok:false,mensagem:'Só o administrador total altera esta conta.'});
      mudou=true;
      if(b.acao==='redefinir'){a.trocar_senha=true;auditar(uid,'Configurações · acessos','Redefiniu senha',{alvo:a.email});return fim(json(200,{ok:true,senha_temporaria:'demonstracao'}))}
      a.ativo=b.acao==='reativar';auditar(uid,'Configurações · acessos',a.ativo?'Reativou acesso':'Desativou acesso',{alvo:a.email});return fim(json(200,{ok:true}))}
    return json(400,{ok:false,mensagem:'Ação desconhecida.'})}
  if(p.startsWith('/functions/'))return json(404,{ok:false,mensagem:'Não disponível na demonstração.'});
  if(p.startsWith('/realtime'))return json(404,{});

  /* armazenamento de arquivos */
  if(p.startsWith('/storage/v1/object/')){
    const resto=decodeURIComponent(p.slice('/storage/v1/object/'.length));
    const nao=()=>json(400,{statusCode:'404',error:'not_found',message:'Object not found'});
    if(m==='POST'&&resto.startsWith('sign/documentos/')){const c=resto.slice(16);if(!podeCaminho(uid,c)||!S.obj[c])return nao();return json(200,{signedURL:`/object/sign/documentos/${c}?token=demo-${uid}`})}
    if(m==='GET'&&resto.startsWith('sign/documentos/')){const o=S.obj[resto.slice(16)];if(!o)return new Response(null,{status:404});return new Response(o.blob,{status:200,headers:{'content-type':o.mime}})}
    if(m==='GET'){const c=resto.replace(/^(authenticated|public)\//,'').replace(/^documentos\//,'');const o=S.obj[c];if(!o||!podeCaminho(uid,c))return nao();return new Response(o.blob,{status:200,headers:{'content-type':o.mime}})}
    if(m==='POST'&&resto.startsWith('documentos/')){const c=resto.slice(11);
      if(!podeCaminho(uid,c))return json(403,{statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'});
      if(S.obj[c])return json(409,{statusCode:'409',error:'Duplicate',message:'The resource already exists'});
      const bl=cb.blob||new Blob([cb.txt]);const mime=(bl.type||hd.get('content-type')||'').split(';')[0].trim();
      if(bl.size>LIM)return json(413,{statusCode:'413',error:'Payload too large',message:'The object exceeded the maximum allowed size'});
      if(!MIMES.includes(mime))return json(415,{statusCode:'415',error:'invalid_mime_type',message:`mime type ${mime} is not supported`});
      S.obj[c]={owner:uid,mime,blob:new Blob([bl],{type:mime}),size:bl.size};mudou=true;return fim(json(200,{Id:uuid(),Key:'documentos/'+c}))}
    return json(404,{message:'Não disponível na demonstração.'})}

  if(!p.startsWith('/rest/v1/'))return json(404,{message:'Não disponível na demonstração.'});
  const tabela=p.slice('/rest/v1/'.length);

  /* perfis */
  if(tabela==='perfis'){
    if(m==='GET'){const x=conta(uid);let l=S.perfis.filter(y=>y.user_id===uid||(x&&x.ativo&&['rh','dir'].includes(x.perfil)));l=filtrar(l,u).map(copia);l.sort((a,b)=>a.nome.localeCompare(b.nome));
      if(objeto)return l.length?json(200,l[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,l)}
    if(m==='PATCH'){const e=eu(uid);if(!e||!['rh','dir'].includes(e.perfil))return json(403,{code:'42501',message:'sem_permissao'});
      const alvo=filtrar(S.perfis,u);const b=corpo();
      for(const a of alvo){if((a.perfil==='dir'||b.perfil==='dir')&&e.perfil!=='dir')return json(400,{code:'P0001',message:'so_diretoria'});
        for(const k of ['nome','perfil','obras'])if(k in b)a[k]=b[k]}
      mudou=true;return fim(json(204,null))}
    return json(405,{message:'não permitido'})}
  if(tabela==='rpc/senha_trocada'){const c=conta(uid);if(!c||!c.ativo)return json(401,{code:'42501',message:'sem perfil'});c.trocar_senha=false;mudou=true;return fim(json(200,null))}
  if(!eu(uid))return json(401,{code:'42501',message:'sem perfil'});
  const e=eu(uid);

  if(tabela==='registro'&&m==='GET'){
    let l=Object.values(S.reg).filter(r=>podeRegistro(uid,r.tipo,r.obras)).sort((a,b)=>a.ordem-b.ordem);
    const ft=u.searchParams.get('tipo'),fi=u.searchParams.get('id');if(ft)l=l.filter(r=>r.tipo===ft.replace(/^eq\./,''));if(fi)l=l.filter(r=>r.id===fi.replace(/^eq\./,''));
    let off=+(u.searchParams.get('offset')||0),lim=+(u.searchParams.get('limit')||1e6);
    const rg=(hd.get('range')||'').match(/^(\d+)-(\d+)$/);if(rg){off=+rg[1];lim=+rg[2]-off+1}
    l=l.slice(off,off+lim);const out=l.map(r=>({tipo:r.tipo,id:r.id,obras:r.obras,dados:copia(r.dados),versao:r.versao}));
    if(objeto)return out.length?json(200,out[0]):json(406,{code:'PGRST116',message:'0 rows'});return json(200,out)}
  if(tabela==='rpc/salvar_registros'){const itens=corpo().p_itens||[];const antes=copia(Object.fromEntries(Object.entries(S.reg)));const saida=[];
    for(const it of itens){const k=it.tipo+'|'+it.id;const at=S.reg[k];
      const falha=(code,msg)=>{S.reg=antes;return json(code==='40001'?409:403,{code,message:msg,details:JSON.stringify({tipo:it.tipo,id:it.id})})};
      if(it.excluir){if(!at||at.versao!==it.versao||!podeGravar(uid,at.tipo,at.obras))return falha('40001','conflito');delete S.reg[k];saida.push({tipo:it.tipo,id:it.id,versao:0});continue}
      if(!podeGravar(uid,it.tipo,it.obras))return falha('42501','sem_permissao');
      if(!it.versao){if(at)return falha('40001','conflito');S.reg[k]={tipo:it.tipo,id:it.id,obras:it.obras||[],dados:it.dados,versao:1,ordem:S.seq++};saida.push({tipo:it.tipo,id:it.id,versao:1});continue}
      if(!at||at.versao!==it.versao||!podeRegistro(uid,at.tipo,at.obras))return falha('40001','conflito');
      Object.assign(at,{obras:it.obras||[],dados:it.dados,versao:at.versao+1});saida.push({tipo:it.tipo,id:it.id,versao:at.versao})}
    mudou=true;return fim(json(200,saida))}
  if(tabela==='rpc/apagar_registros_antigos'){if(!e.admin_total)return json(403,{code:'42501',message:'so_administrador'});return json(200,0)}
  if(tabela==='auditoria'){
    if(m==='POST'){let l=[];try{l=[].concat(JSON.parse(cb.txt))}catch(x){}for(const r of l)S.aud.push({...r,id:S.aud.length+1,em:agora(),autor_id:uid,autor_nome:e.nome,autor_perfil:e.perfil});mudou=true;return fim(json(201,null))}
    if(['rh','dir'].includes(e.perfil))return json(200,copia(S.aud).reverse().slice(0,5000));return json(200,[])}
  if(tabela==='arquivo'&&m==='GET'){let l=S.arq.filter(a=>podeArquivo(uid,a.categoria,a.colab_id,a.obra_id));l=filtrar(l,u);return json(200,copia(l))}
  if(tabela==='rpc/registrar_arquivo'){const b=corpo();const c=b.p_caminho;if(!podeCaminho(uid,c))return json(403,{code:'42501',message:'sem_permissao'});
    const o=S.obj[c];if(!o||o.owner!==uid)return json(404,{code:'P0002',message:'arquivo_nao_enviado'});
    if(!c.includes('/atestado/')&&/(atestado|\bCID\b|laudo m[eé]dico|prontu[aá]rio)/i.test(b.p_tipo_doc||''))return json(400,{code:'22023',message:'tipo_restrito'});
    let cat,colab=null,obra=null;if(c.startsWith('c/')){[,colab,cat]=c.split('/')}else{[,obra]=c.split('/');cat='obra'}
    if(b.p_substitui){const ant=S.arq.find(a=>a.id===b.p_substitui);if(!ant||ant.removido_em||ant.categoria!==cat||ant.colab_id!==colab||ant.obra_id!==obra)return json(400,{code:'22023',message:'substituicao_invalida'})}
    const a={id:uuid(),caminho:c,categoria:cat,colab_id:colab,obra_id:obra,tipo_doc:b.p_tipo_doc,ref_id:b.p_ref,nome:b.p_nome,mime:o.mime,tamanho:o.size,validade:b.p_validade,enviado_por_nome:e.nome,criado_em:agora(),removido_em:null,removido_motivo:null};
    S.arq.push(a);if(b.p_substitui){const ant=S.arq.find(x=>x.id===b.p_substitui);ant.removido_em=agora();ant.removido_motivo='Substituído'}
    auditar(uid,'Arquivos','Anexou arquivo',{categoria:cat,documento:cat==='atestado'?'Documento restrito':b.p_tipo_doc});mudou=true;return fim(json(200,a.id))}
  if(tabela==='rpc/remover_arquivo'){const b=corpo();const a=S.arq.find(x=>x.id===b.p_id);if(!a||!podeArquivo(uid,a.categoria,a.colab_id,a.obra_id))return json(403,{code:'42501',message:'sem_permissao'});
    a.removido_em=agora();a.removido_motivo=b.p_motivo;mudou=true;return fim(json(200,null))}
  if(tabela==='rpc/uso_armazenamento')return json(200,['rh','dir'].includes(e.perfil)?Object.values(S.obj).reduce((t,o)=>t+o.size,0):null);
  if(tabela==='rpc/criar_pacote'){const b=corpo();if(!(['rh','dir'].includes(e.perfil)||(e.perfil==='sst'&&e.obras.includes(b.p_obra))))return json(403,{code:'42501',message:'sem_permissao'});
    const obra=(regDe('global','principal').dados.cfg.obras||[]).find(o=>o.id===b.p_obra);if(!obra)return json(400,{code:'22023',message:'obra_invalida'});
    if(!(b.p_dias>=1&&b.p_dias<=30))return json(400,{code:'22023',message:'validade_invalida'});
    const ids=[...new Set(b.p_arquivos||[])];const okIds=S.arq.filter(a=>ids.includes(a.id)&&!a.removido_em&&a.categoria!=='atestado'&&(a.categoria!=='obra'||a.obra_id===b.p_obra)&&podeArquivo(uid,a.categoria,a.colab_id,a.obra_id));
    if(okIds.length!==ids.length)return json(403,{code:'42501',message:'itens_nao_permitidos'});
    const tk=uuid().replace(/-/g,''),cod=String(Math.floor(Math.random()*1e6)).padStart(6,'0');const exp=new Date(Date.now()+b.p_dias*864e5).toISOString();
    const pk={id:uuid(),obra_id:b.p_obra,obra_nome:obra.nome,titulo:b.p_titulo,periodo:b.p_periodo,criado_por:uid,criado_por_nome:e.nome,criado_em:agora(),expira_em:exp,token_hash:await sha(tk),codigo:cod,tentativas:0,bloqueado_ate:null,revogado_em:null,revogado_motivo:null,ultimo_acesso:null,acessos:0,itens:ids};
    S.pac.push(pk);mudou=true;return fim(json(200,{id:pk.id,token:tk,codigo:cod,expira_em:exp}))}
  if(tabela==='rpc/revogar_pacote'){const b=corpo();const pk=S.pac.find(x=>x.id===b.p_id);if(pk){pk.revogado_em=agora();pk.revogado_motivo='Encerrado manualmente';mudou=true}return fim(json(200,null))}
  if(tabela==='pacote'){let l=S.pac.filter(x=>['rh','dir'].includes(e.perfil)||(e.perfil==='sst'&&(e.obras.includes(x.obra_id)||x.criado_por===uid)));l=filtrar(l,u);
    return json(200,l.map(({token_hash,codigo,itens,...x})=>copia(x)))}
  return json(404,{message:'Não disponível na demonstração: '+m+' '+p})
}
function usuario(c){return {id:c.user_id,aud:'authenticated',role:'authenticated',email:c.email,app_metadata:{provider:'email'},user_metadata:{nome:c.nome},created_at:'2026-01-01T00:00:00Z'}}
function sessao(c){const exp=Math.floor(Date.now()/1000)+86400;return {access_token:token(c.user_id),token_type:'bearer',expires_in:86400,expires_at:exp,refresh_token:'r-'+c.user_id,user:usuario(c)}}

/* tudo que iria ao Supabase é atendido aqui; o resto segue normal (mesma origem) */
window.fetch=function(input,init){const url=input instanceof Request?input.url:String(input);
  if(url.startsWith(HOST))return servidor(input,init).catch(e=>{console.error('demo',e);return json(500,{message:'erro na demonstração'})});
  if(/vendor\/municipios-ibge\.json$/.test(url.split('?')[0])&&window.NTEAM_DEMO_MUN)return Promise.resolve(json(200,window.NTEAM_DEMO_MUN));
  if(/^https?:\/\//i.test(url)&&!url.startsWith(location.origin))return Promise.reject(new TypeError('Bloqueado na demonstração: '+url));
  return fetchReal(input,init)};
/* atualização em tempo real: não existe servidor, então a conexão fica parada (só há um navegador) */
const WSReal=window.WebSocket;
window.WebSocket=function(url,prot){if(String(url).includes('supabase.co')){const f={readyState:0,url:String(url),protocol:'',binaryType:'arraybuffer',bufferedAmount:0,extensions:'',
    send(){},close(){this.readyState=3},addEventListener(){},removeEventListener(){},dispatchEvent(){return true},onopen:null,onclose:null,onerror:null,onmessage:null};return f}
  return new WSReal(url,prot)};
Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});

/* ---------- faixa e escolha de perfil ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CSS=`#demo-faixa{position:fixed;top:0;left:0;right:0;z-index:10050;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 16px;background:#ADD91C;color:#1C1E17;font:600 13px/1.3 'Atkinson Hyperlegible Next',system-ui,sans-serif}
#demo-faixa b{font-family:'Unbounded',sans-serif;font-weight:600;letter-spacing:.02em}
#demo-faixa .sp{flex:1}
#demo-faixa button{font:inherit;font-size:13px;min-height:32px;padding:4px 12px;border-radius:6px;border:1px solid #1C1E17;background:transparent;color:#1C1E17;cursor:pointer}
#demo-faixa button:hover{background:#1C1E17;color:#ADD91C}
#demo-faixa button:focus-visible{outline:2px solid #1C1E17;outline-offset:2px}
body{padding-top:44px!important}
#demo-faixa .c{display:none}
@media (max-width:640px){#demo-faixa .txt,#demo-faixa .l{display:none}#demo-faixa .c{display:inline}#demo-faixa{flex-wrap:nowrap;gap:8px;padding:6px 12px}}
.side{top:44px!important}
@media (min-width:768px){.side{height:calc(100vh - 44px)!important}}
#demo-perfis{position:fixed;inset:44px 0 0 0;z-index:10000;overflow:auto;background:#1F2119;color:#fff;font-family:'Atkinson Hyperlegible Next',system-ui,sans-serif;padding:32px 16px}
#demo-perfis .cx{max-width:720px;margin:0 auto}
#demo-perfis .marca{font-family:'Unbounded',sans-serif;font-weight:600;font-size:40px;letter-spacing:-.02em;line-height:1}
#demo-perfis .marca i{font-style:normal;color:#ADD91C}
#demo-perfis .emp{color:#C4C8B2;font-size:14px;margin:8px 0 24px}
#demo-perfis h2{font-family:'Unbounded',sans-serif;font-weight:500;font-size:20px;margin:0 0 6px}
#demo-perfis p{color:#C4C8B2;font-size:15px;line-height:1.5;margin:0 0 20px;max-width:60ch}
#demo-perfis .lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
#demo-perfis button{text-align:left;font:inherit;padding:14px 16px;min-height:44px;border-radius:10px;border:1px solid #4A4D41;background:#2A2D23;color:#fff;cursor:pointer;display:flex;flex-direction:column;gap:4px}
#demo-perfis button:hover,#demo-perfis button:focus-visible{border-color:#ADD91C;outline:none;background:#33362B}
#demo-perfis .nm{font-weight:700;font-size:16px}
#demo-perfis .pf{color:#ADD91C;font-size:14px}
#demo-perfis .ob{color:#AEB39B;font-size:13px}
#demo-perfis .aviso{margin-top:24px;font-size:13px;color:#AEB39B}`;
function faixa(){if(document.getElementById('demo-faixa'))return;const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const f=document.createElement('div');f.id='demo-faixa';f.setAttribute('role','region');f.setAttribute('aria-label','Versão de demonstração');
  f.innerHTML=`<b>DEMONSTRAÇÃO</b><span class="txt">Dados fictícios. Nada aqui vai para o sistema oficial.</span><span class="sp"></span><button type="button" id="demo-trocar"><span class="l">Trocar perfil</span><span class="c">Perfil</span></button><button type="button" id="demo-zerar"><span class="l">Recomeçar demonstração</span><span class="c">Recomeçar</span></button>`;
  document.body.appendChild(f);
  f.querySelector('#demo-trocar').onclick=()=>{try{localStorage.removeItem(SESS)}catch(e){}location.reload()};
  f.querySelector('#demo-zerar').onclick=async()=>{if(!confirm('Voltar a demonstração ao início? Tudo o que foi feito aqui será descartado.'))return;await IDB.apagar();try{localStorage.removeItem(SESS)}catch(e){}location.reload()}}
function nomesObras(ids){const ob=(regDe('global','principal')?.dados?.cfg?.obras)||[];return (ids||[]).map(i=>ob.find(o=>o.id===i)?.nome||i).join(', ')}
function escolher(){
  const el=document.createElement('div');el.id='demo-perfis';
  const ativos=S.perfis.filter(x=>x.ativo);
  el.innerHTML=`<div class="cx" role="main"><div class="marca">n<i>Team</i></div><div class="emp">NTN Engenharia · Controle de colaboradores</div>
  <h2>Entrar na demonstração</h2><p>Escolha com qual perfil quer ver o sistema. Cada perfil enxerga só o que teria no dia a dia: o Administrativo de obra, por exemplo, só vê a própria obra. Para trocar, use <b>Trocar perfil</b> na faixa verde.</p>
  <div class="lista">${ativos.map(x=>`<button type="button" data-u="${esc(x.user_id)}"><span class="nm">${esc(x.nome)}</span><span class="pf">${esc(NOME_PERFIL[x.perfil]||x.perfil)}${x.admin_total?' · administrador':''}</span><span class="ob">${['rh','dir'].includes(x.perfil)?'Todas as obras':esc(nomesObras(x.obras))||'Sem obra liberada'}</span>${x.trocar_senha?'<span class="ob">Primeiro acesso: vai pedir para criar a senha</span>':''}</button>`).join('')}</div>
  <p class="aviso">Esta é uma cópia de demonstração. Os dados são fictícios e ficam guardados só neste navegador. O que for alterado aqui não chega ao nteam.vercel.app.</p></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',ev=>{const b=ev.target.closest('button[data-u]');if(!b)return;const c=conta(b.dataset.u);if(!c)return;
    try{localStorage.setItem(SESS,JSON.stringify(sessao(c)))}catch(e){alert('O navegador bloqueou o armazenamento local. Saia da janela anônima e tente de novo.');return}
    el.remove();carregarApp()});
  el.querySelector('button')?.focus()}
function carregarScript(src){return new Promise((ok,er)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=er;document.body.appendChild(s)})}
async function carregarApp(){await carregarScript('vendor/supabase-2.117.2.js');await carregarScript('nuvem.js')}

async function iniciar(){
  faixa();
  try{await IDB.abrir();S=await IDB.ler('estado')}catch(e){S=null}
  if(!S||!S.reg){S=window.NTEAM_DEMO_SEMENTE?copia(window.NTEAM_DEMO_SEMENTE):await (await fetchReal('demo-semente.json',{cache:'no-store'})).json();S.obj=S.obj||{};S.arq=S.arq||[];S.pac=S.pac||[];S.aud=S.aud||[];await IDB.gravar('estado',S)}
  let ses=null;try{ses=JSON.parse(localStorage.getItem(SESS)||'null')}catch(e){}
  const uidSes=ses&&uidDoToken('Bearer '+ses.access_token);
  if(uidSes&&conta(uidSes)&&conta(uidSes).ativo)carregarApp();else{try{localStorage.removeItem(SESS)}catch(e){}escolher()}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
