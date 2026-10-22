// nTeam · gera os dados fictícios iniciais da DEMONSTRAÇÃO (demo/demo-semente.json).
// Roda o próprio app (demo/dist) num navegador sem tela, entra como RH e usa os geradores de exemplo do
// protótipo, trocando nomes de obras e clientes por nomes fictícios. Nenhum acesso ao banco real.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');const crypto=require('crypto');
const D=__dirname,DIST=path.join(D,'dist');
const base=JSON.parse(fs.readFileSync(path.join(D,'..','fonte','base_zerada.json'),'utf8'));
/* matriz de permissões igual à do sistema oficial (configuração, sem dados de pessoas) */
const PERMS={verHH:['rh','dir','gestor'],exportar:['rh','dir','sst','gestor','adm'],verPonto:['rh','dir','adm'],verSaude:['rh','sst','adm','dir'],editarSST:['rh','sst','adm'],configurar:['rh','dir'],editarPonto:['rh','adm'],inspecionar:['sst','rh'],configurarHE:['rh','dir'],gerirDocObra:['rh','sst','adm'],gerirTarefas:['rh','sst','gestor','adm'],proporTransf:['rh','gestor','dir','adm'],reabrirPonto:['dir'],verAtestados:['rh','sst','dir','adm'],verAuditoria:['rh','dir'],verAvaliacao:['rh','dir','gestor'],aprovarTransf:['rh','dir'],aprovarVagaRH:['rh'],fazerProposta:['rh'],importarColab:['rh'],solicitarVaga:['rh','gestor','enc','dir','adm'],verFinanceiro:['rh','dir','adm'],aprovarDocObra:['sst','dir'],aprovarExcecao:['dir'],aprovarVagaDir:['dir'],confirmarFolga:['rh','adm'],editarCadastro:['rh','adm'],verCustoViagem:['rh','dir','adm'],conduzirSelecao:['rh','adm'],corrigirHERetro:['dir'],gerirHospedagem:['rh','adm'],programarFerias:['rh'],editarHistograma:['rh','gestor','dir'],verDadosPessoais:['rh','dir','adm'],aprovarHistograma:['dir'],aprovarVagaGestor:['gestor'],corrigirAvaliacao:['rh'],editarCustoViagem:['rh','dir'],registrarAtestado:['rh','sst','adm'],registrarAusencia:['rh','adm'],aprovarPropostaDir:['dir'],registrarHistorico:['rh','sst','gestor','adm'],aprovarConsolidacao:['dir'],solicitarAjusteHist:['rh','gestor','enc','adm']};
const U=()=>crypto.randomUUID();
/* usuários de demonstração (pessoas fictícias do protótipo + Administrativo de cada obra) */
const PERFIS=[
  {user_id:U(),nome:'Patrícia Lima',email:'patricia.rh@demo.ntn',perfil:'rh',obras:[],pessoa_id:'p-rh',ativo:true,trocar_senha:false,admin_total:false},
  {user_id:U(),nome:'Diretoria NTN',email:'diretoria@demo.ntn',perfil:'dir',obras:[],pessoa_id:'p-dir',ativo:true,trocar_senha:false,admin_total:true},
  {user_id:U(),nome:'Renata Souza',email:'renata.adm@demo.ntn',perfil:'adm',obras:['alfa'],pessoa_id:'p-adm-alfa',ativo:true,trocar_senha:false,admin_total:false},
  {user_id:U(),nome:'Lucas Ferreira',email:'lucas.adm@demo.ntn',perfil:'adm',obras:['beta','gama'],pessoa_id:'p-adm-bg',ativo:true,trocar_senha:false,admin_total:false},
  {user_id:U(),nome:'Eng. Paulo Rocha',email:'paulo.gestor@demo.ntn',perfil:'gestor',obras:['alfa'],pessoa_id:'p-gest-alfa',ativo:true,trocar_senha:false,admin_total:false},
  {user_id:U(),nome:'Eng. Marina Costa',email:'marina.gestora@demo.ntn',perfil:'gestor',obras:['beta','gama'],pessoa_id:'p-gest-bg',ativo:true,trocar_senha:false,admin_total:false},
  {user_id:U(),nome:'Carlos Mendes',email:'carlos.sst@demo.ntn',perfil:'sst',obras:['alfa','beta','gama'],pessoa_id:'p-sst',ativo:true,trocar_senha:false,admin_total:false}];
const cfg=JSON.parse(JSON.stringify(base.cfg));cfg.perms=PERMS;
const S0={reg:{'global|principal':{tipo:'global',id:'principal',obras:[],dados:{v:4,cfg,limpezas:{},migracaoV4:base.migracaoV4,mobLog:[]},versao:1,ordem:0}},seq:1,perfis:PERFIS,aud:[],arq:[],obj:{},pac:[]};

/* trocas de nomes reais por fictícios (ordem importa: mais longos primeiro) */
const TROCAS=[
  ['G7 · Senador Canedo','Obra Alfa · Rio Verde'],['Mosaic · Uberaba','Obra Beta · Araxá'],['Rio Branco · Uberaba','Obra Gama · Araxá'],
  ['G7 — ','Alfa — '],['Mosaic — ','Beta — '],['G7-','ALF-'],['MOS-','BET-'],['RB-','GAM-'],['UBA-','ARX-'],
  ['White Martins','Cliente Beta'],['Senador Canedo','Rio Verde'],['Canedo','Rio Verde'],['Uberaba','Araxá'],
  ['Rio Branco','Gama'],['Mosaic','Beta'],[/\bG7\b/g,'Alfa'],
  [/\bg7\b/g,'alfa'],[/\bmosaic\b/g,'beta'],[/\briobranco\b/g,'gama'],['p-gest-uba','p-gest-bg'],['p-enc-mos','p-enc-beta']];

const TIPOS={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json'};
const CSP=JSON.parse(fs.readFileSync(path.join(DIST,'vercel.json'),'utf8')).headers[0].headers[0].value;
let SEM=JSON.stringify(S0);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
  if(u==='/demo-semente.json'){r.writeHead(200,{'Content-Type':'application/json'});return r.end(SEM)}
  let f=path.join(DIST,u);if(f.endsWith('/'))f+='index.html';if(!path.extname(f))f+='.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':TIPOS[path.extname(f)]||'application/octet-stream','Content-Security-Policy':CSP});r.end(d)})});

(async()=>{await new Promise(s=>srv.listen(4191,s));
  const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:800}});const pg=await ctx.newPage();
  const erros=[];pg.on('pageerror',e=>erros.push(e.message));pg.on('console',m=>{if(m.type()==='error')erros.push(m.text())});
  const fora=[];pg.on('request',q=>{if(!q.url().startsWith('http://localhost:4191'))fora.push(q.url())});
  const ocioso=async()=>{await pg.waitForFunction(()=>typeof NV!=='undefined'&&!NV.pendente&&!NV.salvando&&!NV.audFila.length,null,{timeout:60000});await pg.waitForTimeout(600)};
  await pg.goto('http://localhost:4191/');await pg.click('#demo-perfis button:has-text("Patrícia Lima")');
  await pg.waitForFunction(()=>typeof DB!=='undefined'&&DB&&document.querySelector('#nav'),null,{timeout:30000});await ocioso();
  const res=await pg.evaluate(async TROCAS=>{
    await munCarregar();
    const prod=JSON.parse(JSON.stringify(DB.cfg));
    const d=seed();DB=d;migrarV3(true);sincronizar();syncMob('Abertura do sistema');migrarV4(true);
    DB.docsObra=seedDocsObra();DB.pontoDia=seedPontoDia();
    for(const k of ['avaliacoes','lotesImport','propostas','reqs','cands','tarefas','hist','mobs','hospedagens','estadias','planos','mobLog'])DB[k]??=[];
    DB.avalRasc??={};DB.limpezas=prod.limpezas||{};
    /* nomes fictícios */
    let J=JSON.stringify(DB);for(const [a,b] of TROCAS)J=typeof a==='string'?J.split(a).join(b):J.replace(new RegExp(a.source,'g'),b);
    DB=JSON.parse(J);
    const ob={alfa:['Obra Alfa · Rio Verde','Cliente Alfa','Rio Verde/GO'],beta:['Obra Beta · Araxá','Cliente Beta','Araxá/MG'],gama:['Obra Gama · Araxá','Cliente Gama','Araxá/MG']};
    DB.cfg.obras.forEach(o=>{if(ob[o.id]){o.nome=ob[o.id][0];o.cliente=ob[o.id][1];o.cidade=ob[o.id][2]}});
    /* configuração igual à oficial (permissões, documentos, checklist), mantendo obras e pessoas fictícias */
    for(const k of ['perms','tiposDocObra','responsaveis','etapas','checklist','antecedencia'])if(prod[k])DB.cfg[k]=JSON.parse(JSON.stringify(prod[k]));
    DB.cfg.pessoas=DB.cfg.pessoas.filter(p=>!['p-adm-alfa','p-adm-bg'].includes(p.id));
    DB.cfg.pessoas.push({id:'p-adm-alfa',nome:'Renata Souza',perfil:'adm',cargo:'Administrativo da Obra Alfa',obras:['alfa']},{id:'p-adm-bg',nome:'Lucas Ferreira',perfil:'adm',cargo:'Administrativo das obras Beta e Gama',obras:['beta','gama']});
    DB.cfg.pessoas.forEach(p=>{if(p.id==='p-gest-alfa'||p.id==='p-gest-g7'){p.id='p-gest-alfa';p.cargo='Gestor da Obra Alfa'}if(p.id==='p-gest-bg')p.cargo='Gestora das obras Beta e Gama'});
    /* custos de viagem: cidade de cada obra e salário por função (valores fictícios) */
    const C=custosMaterializar();C.obras??={};
    const M=t=>munRef(munAchar(t));
    C.obras.alfa={mun:M('Rio Verde / GO')};C.obras.beta={mun:M('Araxá / MG')};C.obras.gama={mun:M('Araxá / MG')};C.obras.sede={mun:M('Uberlândia / MG')};
    C.salarios={};DB.cfg.funcoes.forEach(f=>{if(f.sal)C.salarios[f.id]={sal:f.sal,adic:['sold','elet'].includes(f.id)?'Periculosidade 30%':''}});
    /* cidade de origem e folga padrão para quem é alojado; alguns vêm de longe para mostrar a ajuda de custo */
    const longe=['São Luís / MA','Teresina / PI','Salvador / BA','Imperatriz / MA','Marabá / PA','Juazeiro do Norte / CE'];let iL=0;
    const porObra={};
    DB.colabs.forEach(c=>{const ufc=(c.end?.cidade||'')+(c.end?.uf?' / '+c.end.uf:'');
      if(c.regime==='Alojado'&&c.status!=='Desligado'){porObra[c.obraId]=(porObra[c.obraId]||0)+1;
        if(porObra[c.obraId]<=2&&iL<longe.length){const t=longe[iL++];const [cid,uf]=t.split(' / ');c.end.cidade=cid;c.end.uf=uf}
        const m=munAchar((c.end?.cidade||'')+' / '+(c.end?.uf||''));c.cidades={origem:munRef(m),natal:munRef(m)};
        c.folgaV2={modo:'padrao',conf:{},puladas:{}}}
      else if(munAchar(ufc))c.cidades={origem:munRef(munAchar(ufc)),natal:munRef(munAchar(ufc))}});
    save();render();
    const cont={};DB.colabs.forEach(c=>{const k=c.obraId+'·'+c.status;cont[k]=(cont[k]||0)+1});
    return {cont,hosp:DB.hospedagens.length,est:DB.estadias.length,reqs:DB.reqs.length,cands:DB.cands.length,sobra:/G7|Mosaic|Canedo|Uberaba|White Martins|Rio Branco/.test(JSON.stringify(DB))};
  },TROCAS.map(([a,b])=>[a instanceof RegExp?{source:a.source}:a,b]).map(([a,b])=>[a,b]));
  console.log(JSON.stringify(res));
  await ocioso();
  /* recarrega para as migrações dos módulos (v15–v18) rodarem como no sistema oficial */
  await pg.reload();await pg.waitForFunction(()=>typeof DB!=='undefined'&&DB&&document.querySelector('#nav'),null,{timeout:30000});await pg.waitForTimeout(1500);await ocioso();
  const st=JSON.parse(await pg.evaluate(()=>NTEAM_DEMO.exportar()));
  st.aud=[];st.obj={};st.arq=[];st.pac=[];
  const txt=JSON.stringify(st);
  if(/G7|Mosaic|Canedo|Uberaba|White Martins|Rio Branco|yyylvko/.test(txt.replace(/"perfis".*/,'')))console.log('ATENÇÃO: sobrou nome real:',(txt.match(/.{40}(G7|Mosaic|Canedo|Uberaba|White Martins|Rio Branco).{40}/)||[])[0]);
  fs.writeFileSync(path.join(D,'demo-semente.json'),txt);
  console.log('registros',Object.keys(st.reg).length,'tipos',JSON.stringify(Object.values(st.reg).reduce((a,r)=>(a[r.tipo]=(a[r.tipo]||0)+1,a),{})),'bytes',txt.length);
  console.log('erros',JSON.stringify(erros.slice(0,8)));console.log('requisições para fora',fora.length,fora.slice(0,3));
  await b.close();srv.close()})().catch(e=>{console.error(e);process.exit(1)});
