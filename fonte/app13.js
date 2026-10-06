
/* =====================================================================
   v13 · NUVEM — dados no Supabase, login real e acessos
   - Salva em partes (base, pessoal, saude, ponto:AAAA-MM) com trava por versão.
   - Dados pessoais e de saúde só saem do navegador para as partes que o perfil pode gravar.
   - Auditoria enviada ao servidor (só inclusão).
   - Alterações de outras pessoas chegam pelo Realtime.
   ===================================================================== */
const PESSOAL_CAMPOS=['cpf','rg','nasc','estadoCivil','escolaridade','email','emerg','end','banco','dependentes','pj','salario','peric','insal','beneficios','docFiles'];
const NAO_CLINICO=t=>/^(Acidente de trabalho|Declaração de comparecimento)/.test(t||'');
function vazioDe(v){if(v==null)return v;if(Array.isArray(v))return [];if(typeof v==='object'){const o={};for(const k in v)o[k]=vazioDe(v[k]);return o}if(typeof v==='string')return '';if(typeof v==='number')return null;if(typeof v==='boolean')return false;return null}

/* divide a base em partes; nada de pessoal ou clínico fica na parte 'base' */
/* v14 · cada registro com as obras que podem vê-lo; nada pessoal, financeiro ou clínico fica no registro do colaborador */
const FIN_CAMPOS=['salario','peric','insal','beneficios'];
const PESSOAL_SO=PESSOAL_CAMPOS.filter(k=>!FIN_CAMPOS.includes(k));
const TIPO_COL={colabs:'colab',reqs:'req',cands:'cand',hist:'hist',mobs:'mob',hospedagens:'hosp',estadias:'estadia',planos:'plano',tarefas:'tarefa',docsObra:'docobra',avaliacoes:'aval',lotesImport:'lote'};
function obrasColab(c){const s=new Set();if(c&&c.obraId)s.add(c.obraId);for(const a of (c&&c.alocacoes)||[])if(a&&a.obraId&&(!a.fim||a.fim>=hoje))s.add(a.obraId);return [...s].sort()}
function obrasDe(rec,col){
  if(col==='colabs')return obrasColab(rec);
  if(col==='lotesImport')return [];
  const s=new Set();
  if(rec.obraId)s.add(rec.obraId);
  if(Array.isArray(rec.obraIds))rec.obraIds.forEach(x=>x&&s.add(x));
  if(rec.colabId)obrasColab(C(rec.colabId)).forEach(x=>s.add(x));
  if(rec.reqId){const r=DB.reqs.find(x=>x.id===rec.reqId);if(r&&r.obraId)s.add(r.obraId)}
  for(const k of ['hospId','unidadeId','hospedagemId'])if(rec[k]){const h=DB.hospedagens.find(x=>x.id===rec[k]);((h&&h.obraIds)||[]).forEach(x=>s.add(x))}
  return [...s].sort();
}
function dividirNuvem(){
  for(const c of DB.colabs)for(const h of c.historico||[])if((h.tipo==='Atestado'||h.saude)&&!h.hid)h.hid=uid();
  const out=new Map();const put=(tipo,id,obras,dados)=>out.set(tipo+'|'+id,{tipo,id:String(id),obras,dados});
  put('global','principal',[],{v:DB.v,cfg:DB.cfg,limpezas:DB.limpezas||{},migracaoV4:DB.migracaoV4||{},mobLog:DB.mobLog||[]});
  for(const [col,tipo] of Object.entries(TIPO_COL))for(const rec of DB[col]||[]){if(!rec||typeof rec!=='object')continue;if(!rec.id)rec.id=uid();
    if(col!=='colabs'){put(tipo,rec.id,obrasDe(rec,col),rec);continue}
    const c=JSON.parse(JSON.stringify(rec));const ob=obrasColab(rec);
    const p={},f={};for(const k of PESSOAL_SO)if(k in c){p[k]=c[k];c[k]=vazioDe(c[k])}for(const k of FIN_CAMPOS)if(k in c){f[k]=c[k];c[k]=vazioDe(c[k])}
    const s={atestados:{},hist:{}};
    for(const lista of [c.atestados||[],c.atestadosCanc||[]])for(const a of lista){const x={};
      if(a.tipo&&!NAO_CLINICO(a.tipo)){x.tipo=a.tipo;a.tipo=''}
      for(const k of ['cid','medico','arquivo'])if(a[k]){x[k]=a[k];a[k]=''}
      if(a.versoes&&a.versoes.length){x.versoes=a.versoes;a.versoes=a.versoes.map(v=>({data:v.data,autor:v.autor}))}
      if(a.cancelado&&a.cancelado.motivo){x.motivoCanc=a.cancelado.motivo;a.cancelado={...a.cancelado,motivo:''}}
      if(Object.keys(x).length)s.atestados[a.id]=x}
    for(const h of c.historico||[])if(h.hid){s.hist[h.hid]=h.texto;h.texto=semClinico(h.texto)}
    put('colab',c.id,ob,c);put('pessoal',c.id,ob,p);put('financeiro',c.id,ob,f);put('saude',c.id,ob,s);
  }
  for(const [k,v] of Object.entries(DB.avalRasc||{})){const c=C(k);put('avalrasc',k,obrasColab(c),v)}
  const pm={};for(const x of DB.pontoDia||[]){const m=String(x.data||'').slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))continue;const k=(x.obraId||'sem-obra')+'|'+m;(pm[k]??=[]).push(x)}
  for(const [k,l] of Object.entries(pm))put('ponto',k,k.startsWith('sem-obra|')?[]:[k.split('|')[0]],l);
  return out;
}

/* combinação em três vias: base = última versão sincronizada; local = minha; remoto = servidor */
const igualJ=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const comId=a=>Array.isArray(a)&&a.length>0&&a.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.id!=null);
function combinar3(b,l,r){
  if(igualJ(l,b))return r;if(igualJ(r,b))return l;if(igualJ(l,r))return l;
  const ehObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(Array.isArray(l)&&Array.isArray(r)&&(comId(l)||comId(r)||comId(b))&&[b,l,r].every(x=>!Array.isArray(x)||!x.length||comId(x))){
    const mb=new Map((b||[]).map(x=>[x.id,x])),ml=new Map(l.map(x=>[x.id,x])),mr=new Map(r.map(x=>[x.id,x]));
    const ids=[...r.map(x=>x.id),...l.map(x=>x.id).filter(id=>!mr.has(id))];const out=[];
    for(const id of new Set(ids)){const xb=mb.get(id),xl=ml.get(id),xr=mr.get(id);
      let v;if(igualJ(xl,xb))v=xr;else if(igualJ(xr,xb))v=xl;else v=(xl&&xr)?combinar3(xb,xl,xr):(NV.colisoes++,xl??xr);
      if(v!==undefined)out.push(v)}
    return out}
  if(ehObj(l)&&ehObj(r)){const o={};const bb=ehObj(b)?b:{};
    for(const k of new Set([...Object.keys(r),...Object.keys(l)])){const v=combinar3(bb[k],l[k],r[k]);if(v!==undefined)o[k]=v}return o}
  NV.colisoes++;return l;
}
const NV={timer:null,salvando:false,pendente:false,tentativas:0,erro:'',ultimo:null,audFila:[],audEnviando:false};
const meuPerfil=()=>NUVEM.usuario.perfil;
function podeGravarTipo(tp){const p=meuPerfil();
  if(tp==='financeiro'||tp==='lote')return ['rh','dir'].includes(p);
  if(tp==='pessoal')return ['rh','dir','adm'].includes(p);
  if(tp==='saude')return ['rh','sst','adm'].includes(p);
  if(tp==='ponto')return ['rh','dir','gestor','adm'].includes(p);
  if(['aval','avalrasc','cand'].includes(tp))return ['rh','dir','gestor','adm'].includes(p);
  return true;
}
function indicadorNuvem(){const el=document.getElementById('nv-status');if(!el)return;
  const h=d=>d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  el.className='u-status'+(NV.erro?' erro':'');
  el.textContent=NV.erro?NV.erro:(NV.salvando||NV.pendente)?'Salvando…':NV.ultimo?`Tudo salvo · ${h(NV.ultimo)}`:'Dados no servidor';}
function agendarNuvem(ms=700){NV.pendente=true;clearTimeout(NV.timer);NV.timer=setTimeout(salvarNuvem,ms);indicadorNuvem()}
async function salvarNuvem(){
  if(NV.salvando){clearTimeout(NV.timer);NV.timer=setTimeout(salvarNuvem,400);return}
  NV.salvando=true;NV.pendente=false;indicadorNuvem();
  try{
    const novos=dividirNuvem();
    let itens=[];
    for(const [k,r] of novos){if(!podeGravarTipo(r.tipo))continue;const txt=JSON.stringify({o:r.obras,d:r.dados});const ant=NUVEM.reg.get(k);
      if(ant&&ant.t===txt)continue;itens.push({tipo:r.tipo,id:r.id,obras:r.obras,dados:r.dados,versao:ant?ant.v:0,_k:k,_t:txt})}
    for(const [k,ant] of NUVEM.reg){if(novos.has(k))continue;const [tp,...rest]=k.split('|');if(tp==='global'||!podeGravarTipo(tp))continue;
      itens.push({tipo:tp,id:rest.join('|'),versao:ant.v,excluir:true,_k:k})}
    let combinou=false;NV.colisoes=0;
    for(let tentativa=0;itens.length;tentativa++){
      const {data,error}=await NUVEM.sb.rpc('salvar_registros',{p_itens:itens.map(({_k,_t,...x})=>x)});
      if(!error){const mapa=new Map(data.map(x=>[x.tipo+'|'+x.id,x.versao]));
        for(const it of itens){if(it.excluir)NUVEM.reg.delete(it._k);else NUVEM.reg.set(it._k,{v:mapa.get(it._k),t:it._t})}break}
      const conflito=error.code==='40001'||/conflito/.test(error.message||'');
      if(!conflito||tentativa>=5)throw Object.assign(new Error(error.message||'erro'),{codigo:error.code,status:error.status,det:error.details});
      /* outra pessoa salvou antes: busca o registro, combina e tenta de novo */
      let alvo={};try{alvo=JSON.parse(error.details||'{}')}catch(x){}
      const k=alvo.tipo+'|'+alvo.id;const it=itens.find(x=>x._k===k);if(!it)throw Object.assign(new Error('conflito sem registro'),{codigo:'40001'});
      const {data:srv,error:e2}=await NUVEM.sb.from('registro').select('obras,dados,versao').eq('tipo',alvo.tipo).eq('id',alvo.id).maybeSingle();
      if(e2)throw Object.assign(new Error(e2.message),{codigo:e2.code});
      combinou=true;
      if(it.excluir){itens=itens.filter(x=>x!==it);if(srv)NUVEM.reg.set(k,{v:srv.versao,t:JSON.stringify({o:srv.obras,d:srv.dados})});continue}
      const ant=NUVEM.reg.get(k);const base=ant?JSON.parse(ant.t).d:(Array.isArray(it.dados)?[]:{});
      if(srv){it.dados=combinar3(base,it.dados,srv.dados);it.versao=srv.versao}else it.versao=0;
      it._t=JSON.stringify({o:it.obras,d:it.dados});
    }
    if(combinou){await recarregarNuvem();
      if(NV.colisoes)modalInfo('Você e outra pessoa alteraram o mesmo registro','<p style="margin-top:0">As alterações de vocês dois foram combinadas. Onde os dois mudaram o mesmo item ao mesmo tempo, ficou a sua versão. Confira se está tudo certo.</p>');
      else toast('Suas alterações foram combinadas com as de outra pessoa.')}
    NV.tentativas=0;NV.erro='';NV.ultimo=new Date();
  }catch(e){
    console.error(JSON.stringify({nivel:'erro',etapa:'salvar_registros',codigo:e.codigo,msg:e.message,det:e.det}));
    if(e.codigo==='40001'||/conflito/.test(e.message)){NV.erro='';await conflitoNuvem()}
    else if(e.codigo==='42501'||/sem_permissao|permission/i.test(e.message)){NV.erro='';toast('Seu perfil não pode gravar parte desta alteração. Os dados foram recarregados do servidor.',true);await recarregarNuvem()}
    else if(/JWT|jwt|expired|401/.test(e.message+(e.status||''))){const {error:er}=await NUVEM.sb.auth.refreshSession();if(er){NV.erro='Sessão expirada. Entre de novo para salvar.';setTimeout(()=>NUVEM.sair(),4000)}else{NV.pendente=true;NV.timer=setTimeout(salvarNuvem,300)}}
    else{NV.tentativas++;NV.pendente=true;NV.erro='Sem conexão: alterações ainda não salvas. Tentando de novo…';NV.timer=setTimeout(salvarNuvem,Math.min(30000,1000*2**NV.tentativas))}
  }finally{NV.salvando=false;indicadorNuvem()}
}
function garantirPessoaNuvem(d){const u=NUVEM.usuario;d.cfg.pessoas=d.cfg.pessoas||[];let pe=d.cfg.pessoas.find(x=>x.id===u.pessoaId);
  if(!pe){pe={id:u.pessoaId,nome:u.nome,perfil:u.perfil,cargo:'',obras:u.obras};d.cfg.pessoas.push(pe)}pe.perfil=u.perfil;pe.obras=u.obras;return d}
async function recarregarNuvem(){
  try{const regs=await NUVEM.lerRegistros();DB=garantirPessoaNuvem(NUVEM.montar(regs));DBV++;CACHE.clear();AUD_BASE=clone(DB);render()}
  catch(e){console.error(e);NV.erro='Não foi possível recarregar os dados. Verifique a internet.';indicadorNuvem()}
}
async function conflitoNuvem(){
  await recarregarNuvem();
  modalInfo('Outra pessoa salvou ao mesmo tempo','<p style="margin-top:0">Os dados foram atualizados com a versão mais recente do servidor. Confira e, se a sua última alteração não aparecer, faça de novo.</p>');
}
/* alterações de outras pessoas */
function tentarAtualizarNuvem(){clearTimeout(NV.tr);
  const ocupado=NV.pendente||NV.salvando||document.querySelector('#layer .modal')||document.activeElement?.matches?.('input,textarea,select');
  if(ocupado){NV.tr=setTimeout(tentarAtualizarNuvem,3000);return}
  recarregarNuvem().then(()=>toast('Tela atualizada com alterações de outra pessoa.'));
}
try{NUVEM.sb.channel('nteam-registros').on('postgres_changes',{event:'*',schema:'public',table:'registro'},pl=>{const r=pl.new&&pl.new.tipo?pl.new:pl.old;if(!r||!r.tipo)return;
  const ant=NUVEM.reg.get(r.tipo+'|'+r.id);if(pl.eventType!=='DELETE'&&ant&&ant.v>=r.versao)return;if(pl.eventType==='DELETE'&&!ant)return;
  clearTimeout(NV.rt);NV.rt=setTimeout(tentarAtualizarNuvem,1200)}).subscribe()}catch(e){console.error('realtime',e)}
/* auditoria no servidor */
let AUD_ENVIADOS=(window.NTEAM_AUD||[]).length;
NUVEM.audEnviar=function(){const novos=AUD.slice(AUD_ENVIADOS);AUD_ENVIADOS=AUD.length;if(!novos.length)return;
  NV.audFila.push(...novos.map(e=>({modulo:String(e.modulo||'—').slice(0,120),acao:String(e.acao||'—').slice(0,300),evento:JSON.parse(JSON.stringify(e))})));enviarAudNuvem()};
async function enviarAudNuvem(){if(NV.audEnviando||!NV.audFila.length)return;NV.audEnviando=true;const lote=NV.audFila.splice(0,100);
  const {error}=await NUVEM.sb.from('auditoria').insert(lote);NV.audEnviando=false;
  if(error){NV.audFila.unshift(...lote);console.error(JSON.stringify({nivel:'erro',etapa:'auditoria',msg:error.message}));setTimeout(enviarAudNuvem,5000)}else if(NV.audFila.length)enviarAudNuvem()}
NUVEM.audEnviar();

const saveV12=save;
save=function(){const r=saveV12.apply(this,arguments);agendarNuvem();return r};
window.addEventListener('beforeunload',e=>{if(NV.pendente||NV.salvando||NV.audFila.length){e.preventDefault();e.returnValue=''}});

/* ---------- usuário logado ---------- */
UI.pessoa=NUVEM.usuario.pessoaId;UI.perfil=NUVEM.usuario.perfil;
function caixaUsuarioNuvem(){const u=NUVEM.usuario;
  return `<div class="usuario" id="usuario"><div class="u-nome">${esc(u.nome)}</div><div class="u-perfil">${esc(PERFIS[u.perfil]?.nome||u.perfil)}${u.adminTotal?' · administrador':''}</div><div class="u-status" id="nv-status" aria-live="polite"></div><div class="u-acoes"><button type="button" data-act="minhaSenha">Trocar senha</button><button type="button" data-act="sair">Sair</button></div></div>`}
(function(){const f=document.querySelector('.side-foot');if(f&&!document.getElementById('usuario'))f.insertAdjacentHTML('afterbegin',caixaUsuarioNuvem());indicadorNuvem()})();

/* ---------- acessos (Configurações › Perfis e acessos) ---------- */
NUVEM.perfisLista=[];
async function lerPerfisNuvem(){if(!['rh','dir'].includes(meuPerfil()))return;
  const {data,error}=await NUVEM.sb.from('perfis').select('user_id,nome,email,perfil,obras,pessoa_id,ativo,trocar_senha').order('nome');
  if(!error){NUVEM.perfisLista=data;if(UI.view==='cfg'&&UI.cfgTab==='perfis')render()}}
lerPerfisNuvem();
async function chamarAcesso(corpo){
  const {data:{session}}=await NUVEM.sb.auth.getSession();
  let r;try{r=await fetch(NUVEM.cfg.url+'/functions/v1/gerir-acesso',{method:'POST',headers:{'Content-Type':'application/json',apikey:NUVEM.cfg.chave,Authorization:'Bearer '+(session?.access_token||'')},body:JSON.stringify(corpo)})}
  catch(e){return {ok:false,mensagem:'Sem conexão com o servidor. Tente de novo.'}}
  let j={};try{j=await r.json()}catch(e){}
  return r.ok&&j.ok?j:{ok:false,mensagem:j.mensagem||'Não foi possível concluir. Tente de novo.'};
}
const acessoDe=p=>NUVEM.perfisLista.find(x=>x.pessoa_id===p.id);
function textoBoasVindas(nome,email,senha){return `Olá, ${nome.split(' ')[0]}! Seu acesso ao nTeam (NTN Engenharia) foi criado.\nEndereço: ${location.origin}\nE-mail: ${email}\nSenha temporária: ${senha}\nNo primeiro acesso, o sistema pede para você criar uma senha pessoal.`}
function mostrarSenhaNuvem(titulo,nome,email,senha){
  const txt=textoBoasVindas(nome,email,senha);
  modalInfo(titulo,`<p style="margin-top:0">Envie a mensagem abaixo para a pessoa, de preferência por WhatsApp. A senha temporária não fica salva no sistema e não aparece de novo.</p><textarea class="inp" id="nv-msg" rows="6" readonly style="width:100%">${esc(txt)}</textarea><div class="actions" style="margin-top:8px"><button class="btn primary" data-act="copiarMsgAcesso">Copiar mensagem</button></div>`);
}
const cfgPerfisV12=cfgPerfis;
cfgPerfis=function(){const g=DB.cfg;const eu=NUVEM.usuario.id;
  const linha=(p,i)=>{const a=acessoDe(p);const proprio=a&&a.user_id===eu;const bloqueado=proprio||(a&&a.perfil==='dir'&&meuPerfil()!=='dir');
    const acesso=!a?`<button class="btn small" data-act="acessoCriar" data-i="${i}">Criar acesso</button>`:
      `<div style="font-size:13px">${esc(a.email)}</div><div style="margin:4px 0">${!a.ativo?'<span class="pill crit">Desativado</span>':a.trocar_senha?'<span class="pill warn">Aguardando 1º acesso</span>':'<span class="pill good">Ativo</span>'}</div>`+
      (proprio?'<span class="muted" style="font-size:12px">Você</span>':bloqueado?'<span class="muted" style="font-size:12px">Só a Diretoria altera</span>':
      `<div class="actions"><button class="btn small ghost" data-act="acessoSenha" data-u="${a.user_id}">Redefinir senha</button>${a.ativo?`<button class="btn small ghost danger" data-act="acessoDesativar" data-u="${a.user_id}">Desativar</button>`:`<button class="btn small ghost" data-act="acessoReativar" data-u="${a.user_id}">Reativar</button>`}</div>`);
    const dis=bloqueado?'disabled':'';
    return `<tr><td><input class="inp" value="${esc(p.nome)}" data-cfg="pessoas.${i}.nome" ${dis} aria-label="Nome"></td><td><input class="inp" value="${esc(p.cargo||'')}" data-cfg="pessoas.${i}.cargo" ${dis} aria-label="Cargo"></td><td><select class="inp" data-cfg="pessoas.${i}.perfil" ${dis} aria-label="Perfil">${Object.entries(PERFIS).filter(([k])=>k!=='dir'||meuPerfil()==='dir'||p.perfil==='dir').map(([k,v])=>`<option value="${k}" ${p.perfil===k?'selected':''}>${v.nome}</option>`).join('')}</select></td><td>${!['rh','dir'].includes(p.perfil)?`<div class="chkgrid">${g.obras.map(o=>`<label><input type="checkbox" data-cfgpobra="${i}" value="${o.id}" ${(p.obras||[]).includes(o.id)?'checked':''} ${dis}>${esc(obraCurta(o.id))}</label>`).join('')||'<span class="muted">cadastre as obras primeiro</span>'}</div>${g.obras.length&&!dis?`<button type="button" class="btn small ghost" data-act="obrasTodas" data-i="${i}" style="margin-top:6px">Marcar todas as obras atuais</button>`:''}${(p.obras||[]).length?'':'<div class="muted" style="font-size:12px;margin-top:4px">Nenhuma obra liberada: não vê dados de obra.</div>'}`:'<span class="muted">todas (sempre)</span>'}</td><td>${acesso}</td></tr>`};
  const html=cfgPerfisV12();
  const tabela=`<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Pessoas e acessos</h3><span class="sub">responsáveis nominais e usuários do sistema</span><span class="grow" style="flex:1"></span><button class="btn small" data-act="addPessoa">+ Adicionar pessoa</button></div><div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>Cargo</th><th>Perfil</th><th>Obras liberadas</th><th>Acesso ao sistema</th></tr></thead><tbody>${(g.pessoas||[]).map(linha).join('')}</tbody></table></div><div class="panel-b"><p class="note" style="margin:0">Para dar acesso, cadastre a pessoa, escolha o perfil e clique em <b>Criar acesso</b>. O sistema gera uma senha temporária para você enviar; no primeiro acesso a pessoa cria a própria senha. O perfil e as obras liberadas valem também no servidor: Diretoria e RH veem todas as obras; os demais perfis só recebem os dados das obras marcadas. Obra nova fica visível só para Diretoria e RH até ser liberada.</p></div></section>`;
  return tabela+html.slice(html.indexOf('</section>')+10).replace(/<p class="note" style="margin:0"><b>Limitação do protótipo:<\/b>[\s\S]*?<\/p>/,'<p class="note" style="margin:0">Esta matriz controla o que cada perfil vê e faz nas telas. Independentemente dela, o servidor aplica as regras por obra: salário só para RH e Diretoria; dados pessoais para RH, Diretoria e Administrativo da obra; saúde para RH e para SST e Administrativo da obra; ponto para RH, Diretoria, Gestor e Administrativo da obra.</p>');
};
/* perfil e obras da pessoa com acesso também mudam no servidor */
async function sincronizarAcessoNuvem(i){const p=DB.cfg.pessoas[i];if(!p)return;const a=acessoDe(p);if(!a)return;
  const novo={nome:p.nome,perfil:p.perfil,obras:!['rh','dir'].includes(p.perfil)?(p.obras||[]):[]};
  const {error}=await NUVEM.sb.from('perfis').update(novo).eq('user_id',a.user_id);
  if(error){toast(/so_diretoria/.test(error.message)?'Só a Diretoria concede ou altera o perfil Diretoria.':'Não foi possível atualizar o acesso no servidor.',true);p.perfil=a.perfil;p.obras=a.obras;save();render();return}
  Object.assign(a,novo);toast('Acesso atualizado: vale a partir do próximo login da pessoa.')}
document.addEventListener('change',e=>{const el=e.target;if(UI.view!=='cfg'||UI.cfgTab!=='perfis')return;
  let m=(el.dataset.cfg||'').match(/^pessoas\.(\d+)\.(perfil|nome)$/);const i=m?+m[1]:el.dataset.cfgpobra!=null?+el.dataset.cfgpobra:null;
  if(i!=null)setTimeout(()=>sincronizarAcessoNuvem(i),50)});

/* ---------- Configurações › Dados ---------- */
const vCfgV12=vCfg;
vCfg=function(){let h=vCfgV12();if(UI.cfgTab!=='dados')return h;
  const i=h.indexOf('<div class="cfg-grid">');return h.slice(0,i)+`<div class="cfg-grid">${cfgDadosNuvem()}</div>`};
function cfgDadosNuvem(){const u=NUVEM.usuario;
  return `<section class="panel"><div class="panel-h"><h3>Dados no servidor</h3></div><div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
  <p style="margin:0">Os dados ficam no banco do nTeam (Supabase, região São Paulo). Cada alteração é salva automaticamente, e o servidor guarda uma cópia da versão anterior a cada 6 horas.</p>
  <p class="muted" style="margin:0">Plano gratuito: sem backup diário gerenciado. Baixe uma cópia de segurança periodicamente e guarde em local protegido.</p>
  <div><button class="btn" data-act="copiaSeg">Baixar cópia de segurança</button></div>
  <p class="note" style="margin:0">A cópia contém só o que o seu perfil pode ver${['rh','dir'].includes(u.perfil)?', inclusive dados pessoais':''}. Trate o arquivo como confidencial. O download fica registrado na auditoria.</p></div></section>
  ${u.adminTotal?`<section class="panel"><div class="panel-h"><h3>Registros antigos</h3></div><div class="panel-b form">
  <p style="margin:0" class="full">O histórico de versões e a auditoria são guardados sem prazo. Só o administrador total pode apagar registros com mais de 30 dias; a exclusão também fica na auditoria.</p>
  <div class="field"><label for="nv-oque">O que apagar</label><select class="inp" id="nv-oque"><option value="historico">Cópias antigas de versões</option><option value="auditoria">Eventos de auditoria</option></select></div>
  <div class="field"><label for="nv-antes">Anteriores a</label><input class="inp" type="date" id="nv-antes" max="${addD(hoje,-30)}"></div>
  <div class="actions full"><button class="btn ghost danger" data-act="apagarAntigos">Apagar registros antigos…</button></div></div></section>`:''}`}
function baixarArquivoNuvem(nome,txt,tipo){const b=new Blob([txt],{type:tipo});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=nome;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function audEventoNuvem(acao,registro,extra={}){AUD.push(Object.freeze({id:uid(),acaoId:uid(),em:new Date().toISOString(),autor:autorAtual(),acao,modulo:'Configurações',col:'*',colNome:'Sistema',regId:'*',registro,obraId:null,obraNome:'',tipo:'Exportação',campos:[],mais:0,just:'',lote:'',...extra}));audGravar()}

Object.assign(ACT,{
  sair:()=>{if(NV.pendente||NV.salvando)return modalD('Sair com alterações sendo salvas?','<p class="full" style="margin:0">Aguarde o aviso “Tudo salvo” na barra lateral antes de sair, para não perder a última alteração.</p>','Sair mesmo assim',()=>NUVEM.sair());NUVEM.sair()},
  minhaSenha:()=>modal('Trocar minha senha',`<div class="field full"><label for="nv-s1">Nova senha (mínimo 10 caracteres)</label><input class="inp" id="nv-s1" name="s1" type="password" minlength="10" autocomplete="new-password" required></div><div class="field full"><label for="nv-s2">Repita a nova senha</label><input class="inp" id="nv-s2" name="s2" type="password" minlength="10" autocomplete="new-password" required></div>`,'Salvar senha',fd=>{
    if(String(fd.s1).length<10)return toast('A senha precisa ter pelo menos 10 caracteres.',true),false;if(fd.s1!==fd.s2)return toast('As duas senhas não são iguais.',true),false;
    NUVEM.sb.auth.updateUser({password:fd.s1}).then(({error})=>toast(error?'Não foi possível trocar a senha: use uma senha diferente da atual e com letras e números.':'Senha alterada.',!!error))}),
  acessoCriar:a=>{const p=DB.cfg.pessoas[+a.dataset.i];if(!p)return;
    if(p.perfil==='dir'&&meuPerfil()!=='dir')return toast('Só a Diretoria cria acesso com perfil Diretoria.',true);
    modal('Criar acesso',`<p class="full" style="margin:0"><b>${esc(p.nome)}</b> · ${esc(PERFIS[p.perfil]?.nome||'')}${!['rh','dir'].includes(p.perfil)?' · obras: '+esc((p.obras||[]).map(nomeObra).join(', ')||'nenhuma'):''}</p><div class="field full"><label for="nv-email">E-mail de acesso</label><input class="inp" id="nv-email" name="email" type="email" required autocomplete="off"></div>`,'Criar acesso',fd=>{
      const email=String(fd.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return toast('Informe um e-mail válido.',true),false;
      chamarAcesso({acao:'criar',email,nome:p.nome,perfil:p.perfil,obras:!['rh','dir'].includes(p.perfil)?(p.obras||[]):[],pessoa_id:p.id}).then(r=>{
        if(!r.ok)return toast(r.mensagem,true);lerPerfisNuvem();mostrarSenhaNuvem('Acesso criado',p.nome,email,r.senha_temporaria)})})},
  acessoSenha:a=>{const x=NUVEM.perfisLista.find(y=>y.user_id===a.dataset.u);if(!x)return;
    modalD(`Redefinir a senha de ${x.nome}?`,'<p class="full" style="margin:0">A senha atual deixa de valer. O sistema gera uma senha temporária para você enviar à pessoa.</p>','Redefinir senha',()=>chamarAcesso({acao:'redefinir',user_id:x.user_id}).then(r=>{if(!r.ok)return toast(r.mensagem,true);lerPerfisNuvem();mostrarSenhaNuvem('Senha redefinida',x.nome,x.email,r.senha_temporaria)}))},
  acessoDesativar:a=>{const x=NUVEM.perfisLista.find(y=>y.user_id===a.dataset.u);if(!x)return;
    modalD(`Desativar o acesso de ${x.nome}?`,'<p class="full" style="margin:0">A pessoa deixa de entrar no sistema imediatamente. O cadastro e o histórico continuam. Dá para reativar depois.</p>','Desativar acesso',()=>chamarAcesso({acao:'desativar',user_id:x.user_id}).then(r=>{if(!r.ok)return toast(r.mensagem,true);lerPerfisNuvem();toast('Acesso desativado.')}))},
  acessoReativar:a=>{const x=NUVEM.perfisLista.find(y=>y.user_id===a.dataset.u);if(!x)return;chamarAcesso({acao:'reativar',user_id:x.user_id}).then(r=>{if(!r.ok)return toast(r.mensagem,true);lerPerfisNuvem();toast('Acesso reativado.')})},
  copiarMsgAcesso:()=>{const t=document.getElementById('nv-msg');if(!t)return;t.select();(navigator.clipboard?.writeText(t.value)||Promise.reject()).then(()=>toast('Mensagem copiada.'),()=>{document.execCommand('copy');toast('Mensagem copiada.')})},
  copiaSeg:()=>{const d=JSON.parse(JSON.stringify(DB));const nome=`nteam_copia_${hoje}.json`;
    baixarArquivoNuvem(nome,JSON.stringify({sistema:'nTeam',geradoEm:new Date().toISOString(),por:NUVEM.usuario.nome,perfil:NUVEM.usuario.perfil,dados:d}),'application/json');
    audEventoNuvem('Baixou cópia de segurança','Cópia de segurança dos dados');toast('Cópia de segurança baixada.')},
  apagarAntigos:()=>{const o=document.getElementById('nv-oque')?.value,d=document.getElementById('nv-antes')?.value;
    if(!d)return toast('Escolha a data.',true);if(d>addD(hoje,-30))return toast('Só é possível apagar registros com mais de 30 dias.',true);
    modalD(`Apagar ${o==='historico'?'as cópias de versões':'os eventos de auditoria'} anteriores a ${fmt(d)}?`,'<p class="full" style="margin:0">Esta exclusão é definitiva e não pode ser desfeita. Ela fica registrada na auditoria.</p>','Apagar definitivamente',()=>NUVEM.sb.rpc('apagar_registros_antigos',{p_antes:d,p_o_que:o}).then(({data,error})=>toast(error?'Não foi possível apagar: '+(error.message.includes('sem_permissao')?'só o administrador total pode fazer isso.':'tente de novo.'):`${data} registro(s) apagado(s).`,!!error)))},
  obrasTodas:a=>{const p=DB.cfg.pessoas[+a.dataset.i];if(!p)return;p.obras=DB.cfg.obras.map(o=>o.id);save();render();setTimeout(()=>sincronizarAcessoNuvem(+a.dataset.i),50)},
  reset:()=>toast('Indisponível: os dados ficam no servidor.',true),
});
