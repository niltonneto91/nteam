/* nTeam v13 · acesso e carga de dados (Supabase).
   Roda antes do app: faz login, confere o perfil no servidor, carrega as partes de dados
   que o perfil pode ler e só então inicia o app. Nenhum dado fica gravado no navegador. */
(function(){
'use strict';
const CFG={url:'https://yyylvkofbdhrlaizvoop.supabase.co',chave:'sb_publishable_r_jFrf7J221m5JevAJgbeg_b6wSiXem'};
const sb=window.supabase.createClient(CFG.url,CFG.chave,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'nteam-sessao',detectSessionInUrl:false}});
const NUVEM=window.NUVEM={sb,cfg:CFG,usuario:null,versoes:{},texto:{},carregadas:new Set(),iniciado:false};

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- montagem: junta as partes que o perfil pode ler ---------- */
NUVEM.montar=function(partes){
  const base=partes.base;if(!base)throw new Error('base_ausente');
  const DB=base;
  const pes=partes.pessoal?.colabs||{};
  const sau=partes.saude||{};const sA=sau.atestados||{},sH=sau.hist||{};
  for(const c of DB.colabs||[]){
    const p=pes[c.id];if(p)Object.assign(c,p);
    for(const lista of [c.atestados||[],c.atestadosCanc||[]])for(const a of lista){const s=sA[a.id];if(!s)continue;
      if(s.tipo)a.tipo=s.tipo;for(const k of ['cid','medico','arquivo'])if(s[k]!=null)a[k]=s[k];
      if(s.versoes)a.versoes=s.versoes;if(s.motivoCanc!=null&&a.cancelado)a.cancelado.motivo=s.motivoCanc}
    for(const h of c.historico||[])if(h.hid&&sH[h.hid]!=null)h.texto=sH[h.hid];
  }
  DB.pontoDia=[];
  Object.keys(partes).filter(k=>k.startsWith('ponto:')).sort().forEach(k=>{for(const x of partes[k]||[])DB.pontoDia.push(x)});
  return DB;
};

NUVEM.lerPartes=async function(){
  const {data,error}=await sb.from('documento').select('parte,dados,versao');
  if(error)throw error;
  const partes={};NUVEM.versoes={};NUVEM.texto={};NUVEM.carregadas=new Set();
  for(const r of data){partes[r.parte]=r.dados;NUVEM.versoes[r.parte]=r.versao;NUVEM.texto[r.parte]=JSON.stringify(r.dados);NUVEM.carregadas.add(r.parte)}
  return partes;
};

NUVEM.lerAuditoria=async function(){
  if(!['rh','dir'].includes(NUVEM.usuario.perfil))return [];
  const {data,error}=await sb.from('auditoria').select('id,em,autor_id,autor_nome,autor_perfil,evento').order('id',{ascending:false}).limit(5000);
  if(error){console.error('auditoria',error);return []}
  const NOMES={rh:'Analista de RH',sst:'Segurança do trabalho',dir:'Diretoria',gestor:'Gestor da obra',enc:'Encarregado de obra'};
  const txt=(v,n=300)=>typeof v==='string'?v.slice(0,n):v==null?'':String(v).slice(0,n);
  const OPS=new Set(['','incluiu','removeu','alterou']);
  return data.reverse().map(r=>{const ev=r.evento&&typeof r.evento==='object'?r.evento:{};
    const quem={id:r.autor_id||'',nome:r.autor_nome||'—',perfil:r.autor_perfil||'',perfilNome:NOMES[r.autor_perfil]||r.autor_perfil||'',simulado:false};
    const sis=ev.autor&&ev.autor.id==='sistema';
    const e={id:'srv'+r.id,acaoId:txt(ev.acaoId,40),em:r.em,acao:txt(ev.acao),modulo:txt(ev.modulo,120)||'—',col:txt(ev.col,60),colNome:txt(ev.colNome,80),regId:txt(ev.regId,80),registro:txt(ev.registro,200),
      obraId:ev.obraId?txt(ev.obraId,60):null,obraNome:txt(ev.obraNome,120),tipo:txt(ev.tipo,60),just:txt(ev.just,500),lote:txt(ev.lote,60),mais:Math.max(0,+ev.mais||0),
      campos:(Array.isArray(ev.campos)?ev.campos:[]).slice(0,80).map(c=>({campo:txt(c?.campo,160),rot:txt(c?.rot,160),op:OPS.has(c?.op)?c.op:'',
        de:c?.de&&typeof c.de==='object'?{txt:txt(c.de.txt,400),cl:txt(c.de.cl,20),restrito:txt(c.de.restrito,20)}:{txt:''},
        para:c?.para&&typeof c.para==='object'?{txt:txt(c.para.txt,400),cl:txt(c.para.cl,20),restrito:txt(c.para.restrito,20)}:{txt:''}})),
      autor:sis?{id:'sistema',nome:'Sistema',perfil:'sistema',perfilNome:'Processo automático',origem:txt(ev.autor.origem,120)+' · sessão de '+quem.nome}:quem};
    return Object.freeze(e)});
};

/* ---------- telas de acesso ---------- */
const CSS=`#acesso{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#1F2119;color:#fff;font-family:'Atkinson Hyperlegible Next',system-ui,sans-serif;padding:16px}
#acesso .cx{width:100%;max-width:380px}
#acesso .marca{font-family:'Unbounded',sans-serif;font-weight:600;font-size:40px;letter-spacing:-.02em;line-height:1}
#acesso .marca i{font-style:normal;color:#ADD91C}
#acesso .emp{color:#C4C8B2;font-size:14px;margin:8px 0 28px}
#acesso form{display:flex;flex-direction:column;gap:14px}
#acesso label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#DADDCB}
#acesso input{font:inherit;font-size:16px;padding:11px 12px;border-radius:8px;border:1px solid #4A4D41;background:#2A2D23;color:#fff}
#acesso input:focus{outline:2px solid #ADD91C;outline-offset:1px}
#acesso button{font:inherit;font-weight:600;font-size:16px;padding:12px;border-radius:8px;border:0;background:#ADD91C;color:#1C1E17;cursor:pointer}
#acesso button[disabled]{opacity:.6;cursor:wait}
#acesso .msg{min-height:20px;font-size:14px;color:#F2B8A9}
#acesso .info{font-size:13px;color:#AEB39B;line-height:1.5}
#acesso h2{font-family:'Unbounded',sans-serif;font-weight:500;font-size:20px;margin:0 0 6px}`;
function tela(html){let el=$('#acesso');if(!el){const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);el=document.createElement('div');el.id='acesso';document.body.appendChild(el)}
  el.innerHTML=`<div class="cx" role="main"><div class="marca">n<i>Team</i></div><div class="emp">NTN Engenharia · Controle de colaboradores</div>${html}</div>`;return el}
function fecharTela(){$('#acesso')?.remove()}

function telaLogin(msg=''){
  tela(`<form id="f-login" novalidate><label>E-mail<input name="email" type="email" autocomplete="username" required autofocus></label>
  <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
  <div class="msg" role="alert">${esc(msg)}</div><button type="submit">Entrar</button>
  <p class="info">Esqueceu a senha ou ainda não tem acesso? Peça ao RH: ele gera uma senha temporária para você.</p></form>`);
  $('#f-login').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const b=f.querySelector('button');const m=f.querySelector('.msg');
    const email=f.email.value.trim().toLowerCase(),senha=f.senha.value;
    if(!email||!senha){m.textContent='Informe e-mail e senha.';return}
    b.disabled=true;b.textContent='Entrando…';m.textContent='';
    const {error}=await sb.auth.signInWithPassword({email,password:senha});
    if(error){b.disabled=false;b.textContent='Entrar';
      m.textContent=/invalid/i.test(error.message)?'E-mail ou senha incorretos.':/banned|disabled/i.test(error.message)?'Seu acesso está desativado. Fale com o RH.':/rate|many/i.test(error.message)?'Muitas tentativas. Aguarde alguns minutos.':'Não foi possível entrar agora. Verifique a internet e tente de novo.';return}
    iniciar()});
}

function telaNovaSenha(){
  tela(`<form id="f-senha" novalidate><h2>Crie sua senha</h2><p class="info" style="margin:0 0 6px">Você entrou com uma senha temporária. Escolha uma senha pessoal, com pelo menos 10 caracteres.</p>
  <label>Nova senha<input name="s1" type="password" autocomplete="new-password" minlength="10" required autofocus></label>
  <label>Repita a nova senha<input name="s2" type="password" autocomplete="new-password" minlength="10" required></label>
  <div class="msg" role="alert"></div><button type="submit">Salvar senha e entrar</button></form>`);
  $('#f-senha').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const b=f.querySelector('button');const m=f.querySelector('.msg');
    if(f.s1.value.length<10){m.textContent='A senha precisa ter pelo menos 10 caracteres.';return}
    if(f.s1.value!==f.s2.value){m.textContent='As duas senhas não são iguais.';return}
    b.disabled=true;b.textContent='Salvando…';
    const {error}=await sb.auth.updateUser({password:f.s1.value});
    if(error){b.disabled=false;b.textContent='Salvar senha e entrar';m.textContent=/same|different/i.test(error.message)?'Use uma senha diferente da temporária.':/weak|short/i.test(error.message)?'Senha fraca. Use mais caracteres, misturando letras e números.':'Não foi possível salvar a senha. Tente de novo.';return}
    const {error:e2}=await sb.rpc('senha_trocada');if(e2){b.disabled=false;b.textContent='Salvar senha e entrar';m.textContent=/senha_nao_trocada/.test(e2.message)?'Use uma senha diferente da temporária.':'Não foi possível concluir. Tente de novo.';return}iniciar()});
}

function telaErro(titulo,texto,sair=true){
  tela(`<h2>${esc(titulo)}</h2><p class="info">${esc(texto)}</p><form id="f-err"><button type="submit">${sair?'Voltar ao login':'Tentar de novo'}</button></form>`);
  $('#f-err').addEventListener('submit',async e=>{e.preventDefault();if(sair){await sb.auth.signOut();telaLogin()}else iniciar()});
}

/* ---------- início ---------- */
async function iniciar(){
  tela('<p class="info">Carregando…</p>');
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return telaLogin();
  const {data:p,error:ep}=await sb.from('perfis').select('user_id,nome,email,perfil,obras,pessoa_id,ativo,trocar_senha,admin_total').eq('user_id',session.user.id).maybeSingle();
  if(ep)return telaErro('Sem conexão com o servidor','Verifique a internet e tente de novo.',false);
  if(!p||!p.ativo)return telaErro('Acesso não liberado','Seu usuário não tem um perfil ativo no nTeam. Fale com o RH ou com a Diretoria.');
  if(p.trocar_senha)return telaNovaSenha();
  NUVEM.usuario={id:p.user_id,nome:p.nome,email:p.email,perfil:p.perfil,obras:p.obras||[],pessoaId:p.pessoa_id||('u-'+p.user_id.slice(0,8)),adminTotal:!!p.admin_total};
  let partes;try{partes=await NUVEM.lerPartes()}catch(e){console.error(e);return telaErro('Não foi possível carregar os dados','Verifique a internet e tente de novo.',false)}
  let DB;try{DB=NUVEM.montar(partes)}catch(e){console.error(e);return telaErro('Base de dados não encontrada','A base do nTeam ainda não foi inicializada. Fale com o administrador.')}
  /* garante a pessoa do usuário logado no cadastro de pessoas, com perfil e obras do servidor */
  const u=NUVEM.usuario;DB.cfg.pessoas=DB.cfg.pessoas||[];
  let pe=DB.cfg.pessoas.find(x=>x.id===u.pessoaId);
  if(!pe){pe={id:u.pessoaId,nome:u.nome,perfil:u.perfil,cargo:'',obras:u.obras};DB.cfg.pessoas.push(pe)}
  pe.perfil=u.perfil;pe.obras=u.obras;
  window.NTEAM_DADOS=DB;
  window.NTEAM_AUD=await NUVEM.lerAuditoria();
  if(NUVEM.iniciado){location.reload();return}
  NUVEM.iniciado=true;
  const src=document.getElementById('nteam-app');const s=document.createElement('script');s.textContent=src.textContent;
  fecharTela();
  try{document.body.appendChild(s)}catch(e){console.error(e)}
}
NUVEM.sair=async function(){try{await sb.auth.signOut()}catch(e){}try{sessionStorage.clear()}catch(e){}location.reload()};
sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT'&&NUVEM.iniciado)location.reload()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
