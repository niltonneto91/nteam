
/* =====================================================================
   v18 · CIDADES, FOLGA DE CAMPO E AJUDA DE CUSTO
   - Cidade de origem e cidade natal do colaborador (registro pessoal: RH, Diretoria e Adm. de obra).
   - Cidade da obra escolhida na lista de municípios do IBGE (arquivo local, sem serviço externo).
   - Distância = linha reta × fator de correção (padrão 1,30), faixas de km e valor por trecho.
   - Folga de campo padrão para alojados: indireta a cada 60 dias, direta a cada 90 dias, 5 dias úteis,
     sempre contada da primeira chegada em obra pela empresa. Sugestão na segunda-feira seguinte;
     RH e Adm. de obra confirmam ou ajustam. Feriado não prorroga. Viagem dentro do período.
   - Férias que começam até 30 dias antes ou depois de uma folga substituem essa folga.
   - Ajuda de custo: 1 trecho na ida, 2 por folga, 1 na volta (não paga em pedido de demissão ou justa causa).
   Valores e tabela ficam no registro 'custos' (servidor: só RH, Diretoria e Adm. de obra leem; só RH e Diretoria gravam).
   ===================================================================== */
/* datas vindas de registros que outros perfis gravam: sempre escapadas */
const fmtE=s=>esc(fmt(s)),fmtCE=s=>esc(fmtC(s)),fmtDSE=s=>esc(fmtDS(s));
PERM_DEF.push(
  ['verCustoViagem','Ver cidades de origem e natal, ajuda de custo, tabela de passagens e salários por função','Visualizar',['rh','dir','adm']],
  ['editarCustoViagem','Alterar tabela de passagens, fator de distância e salários por função','Editar',['rh','dir']],
  ['confirmarFolga','Confirmar e ajustar folgas de campo e registrar ajuda de custo paga','Editar',['rh','adm']]);
const V18_PERM={verCustoViagem:['rh','dir','adm'],editarCustoViagem:['rh','dir'],confirmarFolga:['rh','adm'],fazerProposta:['rh']};
const podeV17=pode;
pode=function(k){if(V18_PERM[k]&&!DB?.cfg?.perms?.[k])return V18_PERM[k].includes(UI.perfil);return podeV17(k)};
/* o servidor só entrega o registro 'custos' e o pessoal a estes perfis */
const PERFIS_CUSTO=['rh','dir','adm'];
const podeVerCusto=()=>pode('verCustoViagem')&&PERFIS_CUSTO.includes(UI.perfil);
const podeEditarCusto=()=>pode('editarCustoViagem')&&['rh','dir'].includes(UI.perfil);

/* ---------- registro restrito 'custos' e campos pessoais novos ---------- */
const CUSTO_PAD={v:1,fator:1.3,faixas:[{ate:300,valor:120},{ate:700,valor:230},{ate:1200,valor:380},{ate:null,valor:900}],salarios:{}};
function custos(){return DB.custos||CUSTO_PAD}
function custosMaterializar(){if(!DB.custos)DB.custos=JSON.parse(JSON.stringify(CUSTO_PAD));DB.custos.salarios??={};DB.custos.faixas.sort((a,b)=>(a.ate==null?1e9:+a.ate)-(b.ate==null?1e9:+b.ate));return DB.custos}
['cidades','ajudas'].forEach(k=>{if(!PESSOAL_CAMPOS.includes(k))PESSOAL_CAMPOS.push(k);if(!PESSOAL_SO.includes(k))PESSOAL_SO.push(k)});
const dividirNuvemV17=dividirNuvem;
dividirNuvem=function(){const out=dividirNuvemV17();if(DB.custos&&typeof DB.custos==='object')out.set('custos|principal',{tipo:'custos',id:'principal',obras:[],dados:DB.custos});
  else if(NUVEM.reg.has('custos|principal')){try{const t=JSON.parse(NUVEM.reg.get('custos|principal').t);out.set('custos|principal',{tipo:'custos',id:'principal',obras:t.o||[],dados:t.d})}catch(e){}}return out};
const podeGravarTipoV17=podeGravarTipo;
podeGravarTipo=function(tp){if(tp==='custos'||tp==='proposta')return ['rh','dir'].includes(meuPerfil());return podeGravarTipoV17(tp)};
/* trilha: cidades são dado pessoal; valores de viagem, tabela e salários são financeiros */
const classeV17=classe;
classe=function(path){if(/(^|\.)(cidades|natal|cidOrigem)(\.|\[|$)/.test(path))return 'pessoal';if(/(^|\.)(origem|natal)(\.|\[|$)/.test(path))return 'pessoal';if(/(^|\.)(ajudas|ajuda|faixas|fator|salarios|valorTrecho|custoMensal|salarioBase|encargos|adicValor|adic|ajudaForma|salario)(\.|\[|$)/.test(path)||/^custos(\.|\[|$)/.test(path))return 'financeiro';return classeV17(path)};
Object.assign(NOME_COL,{custos:'Tabela de custos de viagem e salários',propostas:'Proposta de emprego'});

/* ---------- municípios ---------- */
const MUN={lista:null,prom:null,erro:''};
const munNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const munTxt=m=>m&&m.nome?`${m.nome} / ${m.uf}`:'';
const munRef=m=>m?{cod:m.cod,nome:m.nome,uf:m.uf,lat:m.lat,lon:m.lon}:null;
const munOk=m=>!!(m&&m.cod&&m.nome&&isFinite(+m.lat)&&isFinite(+m.lon));
function munCarregar(){
  if(MUN.lista)return Promise.resolve(MUN.lista);
  return MUN.prom??=fetch('/vendor/municipios-ibge.json',{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('http '+r.status);return r.json()}).then(l=>{
    if(!Array.isArray(l)||l.length<5000)throw new Error('lista inválida');
    MUN.lista=l.filter(x=>Array.isArray(x)&&x.length===5).map(([cod,nome,uf,lat,lon])=>({cod:+cod,nome:String(nome),uf:String(uf),lat:+lat,lon:+lon,k:munNorm(nome)+' '+munNorm(uf)}));
    let dl=document.getElementById('mun-dl');if(!dl){dl=document.createElement('datalist');dl.id='mun-dl';document.body.appendChild(dl)}
    dl.replaceChildren(...MUN.lista.map(m=>{const o=document.createElement('option');o.value=munTxt(m);return o}));
    MUN.erro='';return MUN.lista}).catch(e=>{MUN.prom=null;MUN.erro='Não foi possível carregar a lista de municípios. Atualize a página e tente de novo.';throw e});
}
/* "Senador Canedo / GO", "Senador Canedo/GO", "senador canedo - go" */
function munAchar(txt){if(!MUN.lista)return null;const s=String(txt||'').trim();if(!s)return null;
  const m=s.match(/^(.*?)[\s]*[\/\-–,][\s]*([A-Za-z]{2})$/);const nome=munNorm(m?m[1]:s),uf=m?m[2].toUpperCase():'';
  const l=MUN.lista.filter(x=>munNorm(x.nome)===nome&&(!uf||x.uf===uf));return l.length===1?l[0]:null}
function munCampo(id,ref,attrs=''){return `<input class="inp" id="${id}" list="mun-dl" autocomplete="off" value="${esc(munTxt(ref))}" placeholder="Digite e escolha: cidade / UF" ${attrs}>`}

/* ---------- distância e faixas ---------- */
function kmReta(a,b){const R=6371,r=x=>x*Math.PI/180;const dLa=r(b.lat-a.lat),dLo=r(b.lon-a.lon);const h=Math.sin(dLa/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)))}
function faixasOrd(){return (custos().faixas||[]).slice().sort((a,b)=>(a.ate==null?1e9:+a.ate)-(b.ate==null?1e9:+b.ate))}
function faixaRot(i){const f=faixasOrd();const x=f[i];if(!x)return '';const ant=i?f[i-1].ate:0;return x.ate==null?`acima de ${(+ant).toLocaleString('pt-BR')} km`:i===0?`até ${(+x.ate).toLocaleString('pt-BR')} km`:`${(+ant).toLocaleString('pt-BR')} a ${(+x.ate).toLocaleString('pt-BR')} km`}
function viagem(orig,dest){if(!munOk(orig)||!munOk(dest))return null;const reta=kmReta(orig,dest);const fator=+custos().fator||1.3;const km=Math.round(reta*fator);
  const f=faixasOrd();let i=f.findIndex(x=>x.ate==null||km<=+x.ate);if(i<0)i=f.length-1;const fx=f[i]||{valor:0};
  return {reta:Math.round(reta),fator,km,faixa:faixaRot(i),valorTrecho:+fx.valor||0,mesma:orig.cod===dest.cod}}
/* cidade, jornada e regras de cada obra ficam no registro restrito (só RH e Diretoria gravam) */
const obraCfg=o=>(custos().obras||{})[o]||{};
function obraCfgMat(o){const g=custosMaterializar();g.obras??={};return g.obras[o]??={}}
const obraMun=o=>{const m=obraCfg(o).mun;return munOk(m)?m:null};
const origemDe=c=>munOk(c?.cidades?.origem)?c.cidades.origem:null;
function viagemColab(c){return viagem(origemDe(c),obraMun(c.obraId))}

/* ---------- folga de campo padrão ---------- */
const GRUPO_PAD={tst:'indireta',eng:'indireta',adm:'indireta',sup:'indireta'};
const grupoFuncao=fid=>F(fid)?.grupo||GRUPO_PAD[fid]||'direta';
function folgaPad(){const p=DB.cfg.folgaPadrao||{};const g=(k,c)=>({ciclo:Math.max(7,Math.round(+p[k]?.ciclo)||c),dias:Math.min(10,Math.max(1,Math.round(+p[k]?.dias)||5))});return {direta:g('direta',90),indireta:g('indireta',60)}}
const dow=d=>parse(d).getDay();
const proxSeg=d=>{const w=dow(d);return w===1?d:addD(d,(8-w)%7)};
function uteisFim(seg,n){let d=seg,k=1;while(k<n){d=addD(d,1);const w=dow(d);if(w!==0&&w!==6)k++}return d}
function primeiraChegada(c){const l=(c.alocacoes||[]).filter(a=>a.status!=='proposta'&&(a.chegada||a.inicio)).map(a=>a.chegada&&a.chegada>a.inicio?a.chegada:a.inicio).sort();return l[0]||c.admissao||''}
function folgaModo(c){if(c.regime!=='Alojado')return 'nenhum';const v=c.folgaV2;if(v&&v.modo)return v.modo;return c.folga?.proxima&&+c.folga?.campo>0?'anterior':'padrao'}
function folgaRegra(c){const m=folgaModo(c);if(m==='excecao'){const v=c.folgaV2;return {ciclo:Math.max(7,+v.ciclo||0),dias:Math.min(10,Math.max(1,+v.dias||5)),exc:true}}return {...folgaPad()[grupoFuncao(c.funcaoId)],exc:false}}
const folgaAncora=c=>c.folgaV2?.ancora||primeiraChegada(c);
/* lista de folgas do ciclo: n = 1, 2, 3… contadas da âncora */
function folgasCiclo(c,ate){const m=folgaModo(c);if(m!=='padrao'&&m!=='excecao')return null;
  const an=folgaAncora(c);if(!an||c.status==='Admissão')return [];const {ciclo,dias:nd}=folgaRegra(c);if(!(ciclo>0))return [];
  const v=c.folgaV2||{};const conf=v.conf||{},pul=v.puladas||{};const fimV=c.desligamento?.data||'';
  const fer=(c.ausencias||[]).filter(a=>a.tipo==='Férias'&&a.inicio);const out=[];
  for(let n=1;n<400;n++){const ref=addD(an,n*ciclo);const seg=conf[n]?.seg||proxSeg(ref);const sai=addD(seg,-2);if(sai>ate)break;
    const sex=uteisFim(seg,nd);const volta=proxSeg(addD(sex,1));const fim=addD(volta,-1);if(fimV&&sai>=fimV)break;
    const reg=(c.ausencias||[]).find(a=>a.tipo==='Folga de campo'&&+a.folgaN===n);
    const f=fer.find(a=>Math.abs((parse(a.inicio)-parse(seg))/864e5)<=30||(a.inicio<=fim&&(a.fim||'9999')>=sai));
    const est=reg?'confirmada':pul[n]?'pulada':f?'ferias':conf[n]?'confirmada':'sugerida';
    out.push({n,ref,seg,sex,sai,volta,inicio:reg?.inicio||sai,fim:reg?.fim||fim,est,reg,ferias:f,pulada:pul[n],conf:conf[n],passou:fim<hoje})}
  return out}
const folgasProjV17=folgasProj;
folgasProj=function(c,ate){const l=folgasCiclo(c,ate);if(!l)return folgasProjV17(c,ate);
  return l.filter(x=>x.est==='sugerida'&&x.fim>=hoje).map(x=>({tipo:'Folga de campo',inicio:x.sai,fim:x.fim,confirmado:false,proj:true,folgaN:x.n,seg:x.seg,sex:x.sex}))};

/* ---------- ajuda de custo ---------- */
const NAO_PAGA_VOLTA=['Pedido de demissão','Justa causa'];
const AJ_PAR={Folga:['Folga','Férias'],'Férias':['Folga','Férias']};
function ajudaPaga(c,tipo,n){const ts=AJ_PAR[tipo]||[tipo];return (c.ajudas||[]).find(a=>ts.includes(a.tipo)&&(n==null||n===''||String(a.ref)===String(n)))}
/* trechos devidos: ida (1), cada folga (2), férias que substituíram folga (2), volta (1) */
function ajudasDevidas(c,ate){if(c.regime!=='Alojado')return [];const v=viagemColab(c);const out=[];const t=v?v.valorTrecho:null;
  const ch=primeiraChegada(c);if(ch)out.push({tipo:'Ida',ref:'',data:ch,trechos:1,valor:t,paga:ajudaPaga(c,'Ida')});
  for(const f of folgasCiclo(c,ate||addD(hoje,400))||[]){if(f.est==='pulada')continue;
    if(f.est==='ferias'){if(f.ferias)out.push({tipo:'Férias',ref:f.n,data:f.ferias.inicio,trechos:2,valor:t==null?null:2*t,paga:ajudaPaga(c,'Férias',f.n),obs:`no lugar da folga ${f.n}`});continue}
    out.push({tipo:'Folga',ref:f.n,data:f.sai,trechos:2,valor:t==null?null:2*t,paga:ajudaPaga(c,'Folga',f.n),est:f.est})}
  if(c.desligamento){const naoDevida=NAO_PAGA_VOLTA.includes(c.desligamento.tipo);out.push({tipo:'Volta',ref:'',data:c.desligamento.data,trechos:naoDevida?0:1,valor:naoDevida?0:t,paga:ajudaPaga(c,'Volta'),naoDevida})}
  return out}

/* ---------- ficha › Obras e ausências: folga de campo e viagens ---------- */
const EST_ROT={sugerida:['Sugerida','warn'],confirmada:['Confirmada','good'],pulada:['Não haverá','plain'],ferias:['Substituída por férias','info']};
function folgaPainel(c){if(c.regime!=='Alojado'||c.status==='Admissão')return '';
  const m=folgaModo(c);const edF=pode('confirmarFolga')&&noEscopoC(c);const edC=pode('editarCadastro');const vc=podeVerCusto();
  const id=esc(c.id);
  let corpo='';
  if(m==='anterior'){
    corpo=`<div class="panel-b"><div class="banner" style="margin:0">Este colaborador ainda segue a escala anterior (${esc(c.folga.campo)} dias em campo × ${esc(c.folga.folga)} de folga, próxima em ${fmtE(c.folga.proxima)}). A folga padrão da NTN (${grupoFuncao(c.funcaoId)==='indireta'?'mão de obra indireta: a cada '+folgaPad().indireta.ciclo:'mão de obra direta: a cada '+folgaPad().direta.ciclo} dias, ${folgaPad()[grupoFuncao(c.funcaoId)].dias} dias úteis, contados da primeira chegada em ${fmtE(primeiraChegada(c))}) só passa a valer quando o RH aplicar. ${edC?`<button class="btn small" data-act="folgaAplicar" data-id="${id}">Aplicar a folga padrão</button>`:''}</div></div>`;
  }else{
    const r=folgaRegra(c);const an=folgaAncora(c);const l=folgasCiclo(c,addD(hoje,400))||[];
    const prox=l.filter(x=>!x.passou).slice(0,4);const ant=l.filter(x=>x.passou).slice(-3).reverse();
    const lin=x=>{const [rot,cl]=EST_ROT[x.est];const ini=x.reg?x.reg.inicio:x.sai,fi=x.reg?x.reg.fim:x.fim;
      const acoes=[];if(edF&&!x.passou&&x.est==='sugerida')acoes.push(`<button class="btn small primary" data-act="folgaConf" data-id="${id}" data-n="${x.n}">Confirmar</button>`,`<button class="btn small ghost" data-act="folgaPular" data-id="${id}" data-n="${x.n}">Não haverá</button>`);
      if(edF&&!x.passou&&x.est==='confirmada'&&x.reg&&x.reg.inicio>hoje)acoes.push(`<button class="btn small ghost" data-act="folgaConf" data-id="${id}" data-n="${x.n}">Mudar data</button>`,`<button class="btn small ghost danger" data-act="folgaDesfazer" data-id="${id}" data-n="${x.n}">Desfazer</button>`);
      if(edF&&x.est==='pulada')acoes.push(`<button class="btn small ghost" data-act="folgaVoltar" data-id="${id}" data-n="${x.n}">Voltar a prever</button>`);
      const det=x.est==='ferias'?`férias a partir de ${fmtE(x.ferias.inicio)}`:x.est==='pulada'?esc(x.pulada.motivo||''):x.est==='sugerida'&&x.seg!==x.ref?`${n90(x)} dias completam em ${fmtDSE(x.ref)}`:'';
      return `<tr><td class="num">${x.n}ª</td><td class="num">${x.est==='ferias'||x.est==='pulada'?fmtE(x.seg):`<b>${fmtCE(x.seg)} a ${fmtCE(x.sex)}</b>`}</td><td class="num">${x.est==='ferias'||x.est==='pulada'?'—':`${fmtDSE(ini)} · volta ${fmtDSE(addD(fi,1))}`}</td><td>${pillS(rot,cl)}${det?`<div class="muted" style="font-size:12px">${det}</div>`:''}</td><td><div class="actions" style="gap:6px;flex-wrap:wrap">${acoes.join('')}</div></td></tr>`};
    const n90=x=>Math.round((parse(x.ref)-parse(an))/864e5);
    corpo=`<div class="panel-b facts"><div><span>Regra</span><b>${r.exc?`Exceção: a cada ${r.ciclo} dias, ${r.dias} dias úteis`:`${grupoFuncao(c.funcaoId)==='indireta'?'Mão de obra indireta':'Mão de obra direta'}: a cada ${r.ciclo} dias, ${r.dias} dias úteis`}</b></div>
      <div><span>Contada desde</span><b class="num">${an?fmtE(an):'sem data de chegada'}</b>${c.folgaV2?.ancora?'<small class="muted" style="display:block">data ajustada pelo RH</small>':'<small class="muted" style="display:block">primeira chegada em obra</small>'}</div>
      ${r.exc?`<div><span>Motivo da exceção</span><b>${esc(c.folgaV2.motivo||'')}</b><small class="muted" style="display:block">aprovada por ${esc(c.folgaV2.aprov?.por||'')} em ${fmtE(c.folgaV2.aprov?.em)}</small></div>`:''}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Folga</th><th>Dias úteis de folga</th><th>Sai e volta</th><th>Situação</th><th></th></tr></thead><tbody>${prox.map(lin).join('')||`<tr><td colspan="5" class="empty">${an?'Nenhuma folga prevista no próximo ano.':'Informe a data da primeira chegada em obra para calcular as folgas.'}</td></tr>`}</tbody></table></div>
      ${ant.length?`<details class="arq-hist" style="margin:0 16px 8px"><summary>Folgas anteriores</summary><ul>${ant.map(x=>`<li>${x.n}ª · ${fmtE(x.seg)} · ${EST_ROT[x.est][0].toLowerCase()}${x.est==='sugerida'?' (não registrada)':''}</li>`).join('')}</ul></details>`:''}
      <div class="panel-b"><div class="actions" style="gap:8px;flex-wrap:wrap">${edC?`<button class="btn small" data-act="folgaAncora" data-id="${id}">Ajustar data da primeira chegada</button><button class="btn small" data-act="folgaExc" data-id="${id}">${r.exc?'Alterar exceção':'Registrar exceção'}</button>${r.exc?`<button class="btn small ghost" data-act="folgaPadrao" data-id="${id}">Voltar à folga padrão</button>`:''}`:''}</div>
      <p class="note" style="margin:8px 0 0">A folga é de segunda a sexta: a pessoa sai no sábado e volta na segunda seguinte; os dias de viagem já estão dentro desse período. Quando os dias completam no meio da semana, o sistema sugere a segunda-feira seguinte, e o RH e o Adm. da obra confirmam ou ajustam. Feriado no meio da semana não prorroga. As folgas contam sempre da primeira chegada em obra, mesmo depois de uma folga, de férias ou de transferência. Férias que começam até 30 dias antes ou depois de uma folga ficam no lugar dela.</p></div>`;
  }
  /* cidades e ajuda de custo: só quem lê o registro pessoal */
  let viag='';
  if(vc){const cid=c.cidades||{};const v=viagemColab(c);const o=O(c.obraId);
    const edCid=(pode('editarCadastro')||pode('confirmarFolga'))&&noEscopoC(c);
    const sug=!munOk(cid.origem)&&MUN.lista&&c.end?.cidade?munAchar(`${c.end.cidade}${c.end.uf?' / '+c.end.uf:''}`):null;
    const dev=ajudasDevidas(c,addD(hoje,180));
    const linA=dev.map(a=>`<tr><td>${esc(a.tipo)}${a.ref?' '+a.ref+'ª':''}${a.obs?`<div class="muted" style="font-size:12px">${esc(a.obs)}</div>`:''}</td><td class="num">${fmtE(a.data)}</td><td class="num">${a.trechos}</td><td class="num">${a.naoDevida?'não devida':a.valor==null?'—':brl(a.valor)}</td>
      <td>${a.paga?`${esc(a.paga.modo)} · ${brl(a.paga.valor)} em ${fmtE(a.paga.pago)}<div class="muted" style="font-size:12px">por ${esc(a.paga.por)}</div>`:a.naoDevida?`<span class="muted">${esc(c.desligamento.tipo)}</span>`:pode('confirmarFolga')&&noEscopoC(c)?`<button class="btn small" data-act="ajudaPagar" data-id="${id}" data-t="${esc(a.tipo)}" data-r="${esc(a.ref)}">Registrar pagamento</button>`:'<span class="muted">a pagar</span>'}</td></tr>`).join('');
    viag=`<div class="panel-b facts" style="border-top:1px solid var(--line)">
      <div><span>Cidade de origem</span><b>${munOk(cid.origem)?esc(munTxt(cid.origem)):'<span class="muted">não informada</span>'}</b>${sug?`<small class="muted" style="display:block">endereço: ${esc(munTxt(sug))}</small>`:''}</div>
      <div><span>Cidade natal</span><b>${munOk(cid.natal)?esc(munTxt(cid.natal)):'<span class="muted">não informada</span>'}</b></div>
      <div><span>Destino (cidade da obra)</span><b>${obraMun(c.obraId)?esc(munTxt(obraMun(c.obraId))):'<span class="muted">cidade da obra não escolhida em Configurações › Viagens e folgas</span>'}</b></div>
      <div><span>Distância</span><b class="num">${v?`${v.km.toLocaleString('pt-BR')} km`:'—'}</b>${v?`<small class="muted" style="display:block">${v.reta.toLocaleString('pt-BR')} km em linha reta × ${esc(String(v.fator).replace('.',','))} · ${esc(v.faixa)}</small>`:''}</div>
      <div><span>Ajuda de custo por trecho</span><b class="num">${v?brl(v.valorTrecho):'—'}</b>${v?`<small class="muted" style="display:block">por folga (ida e volta): ${brl(2*v.valorTrecho)}</small>`:''}</div>
      ${edCid?`<div><span>&nbsp;</span><button class="btn small" data-act="cidEditar" data-id="${id}">Alterar cidades</button></div>`:''}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Ajuda de custo</th><th>Data</th><th>Trechos</th><th>Valor previsto</th><th>Pagamento</th></tr></thead><tbody>${linA||'<tr><td colspan="5" class="empty">Nada previsto.</td></tr>'}</tbody></table></div>
      <div class="panel-b"><p class="note" style="margin:0">Ida: 1 trecho. Cada folga: 2 trechos (ida e volta). Volta: 1 trecho, não paga em pedido de demissão nem em justa causa. O valor do trecho vem da faixa de km entre a cidade de origem e a cidade da obra (Configurações › Viagens e folgas). Pagar em dinheiro ou comprar a passagem é decidido caso a caso.</p></div>`}
  return `<section class="panel"><div class="panel-h"><h3>Folga de campo${vc?' e viagens':''}</h3><span class="sub">${m==='anterior'?'escala anterior':'calculada pelo sistema'}</span></div>${corpo}${viag}</section>`}
const fichaTabV17v=fichaTab;
fichaTab=function(c){let h=fichaTabV17v(c);
  try{
    if(UI.fichaTab==='obras'&&c.regime==='Alojado'){const p=folgaPainel(c);if(p)h=h.replace('<div class="sec-t">Ausências e folgas</div>',()=>p+'<div class="sec-t">Ausências e folgas</div>')}
    if(c.regime==='Alojado'&&folgaModo(c)!=='anterior'&&h.includes('<div class="sec-t full">Folga de campo</div>')){const i=h.indexOf('<div class="sec-t full">Folga de campo</div>'),j=h.indexOf('<div class="sec-t full">Benefícios</div>');
      if(i>=0&&j>i)h=h.slice(0,i)+`<div class="sec-t full">Folga de campo</div><div class="note full">A folga de campo é calculada pelo sistema (${(r=>r.exc?`exceção: a cada ${r.ciclo} dias`:`${grupoFuncao(c.funcaoId)==='indireta'?'indireta':'direta'}: a cada ${r.ciclo} dias`)(folgaRegra(c))}, ${folgaRegra(c).dias} dias úteis). Confirme datas e registre exceções em <b>Obras e ausências</b>.</div>`+h.slice(j)}
    if(UI.fichaTab==='resumo'&&c.regime==='Alojado'&&folgaModo(c)!=='anterior'){const r=folgaRegra(c);
      h=h.replace(/<div><span>Escala de folga<\/span><b>[^<]*<\/b><\/div>/,`<div><span>Folga de campo</span><b>${r.exc?'Exceção: ':''}a cada ${r.ciclo} dias · ${r.dias} dias úteis</b></div>`);
      const pf=proximaFolga(c);const cf=(folgasCiclo(c,addD(hoje,400))||[]).find(x=>x.est==='confirmada'&&x.reg&&x.reg.fim>=hoje);const px=cf&&(!pf||cf.inicio<pf.inicio)?cf:null;
      h=h.replace(/<div><span>Próxima folga de campo<\/span><b class="num">[^<]*<\/b><\/div>/,`<div><span>Próxima folga de campo</span><b class="num">${px?`${fmtE(px.seg)} a ${fmtE(px.sex)} (confirmada)`:pf?`${fmtE(pf.seg)} a ${fmtE(pf.sex)} (sugerida)`:'—'}</b></div>`)}
  }catch(e){console.error('v18 ficha',e)}
  return h};

/* ---------- ações da folga ---------- */
function folgaReg(c){c.folgaV2??={modo:folgaModo(c)==='anterior'?'anterior':'padrao'};c.folgaV2.conf??={};c.folgaV2.puladas??={};return c.folgaV2}
const folgaN=(c,n)=>(folgasCiclo(c,addD(hoje,800))||[]).find(x=>x.n===+n);
function folgaPrevia(){const f=document.querySelector('#layer .modal form');const box=document.getElementById('folPrev');if(!f||!box)return;const c=C(f.dataset.folId);if(!c)return;
  const seg=f.querySelector('[name="seg"]')?.value||'';if(!seg){box.innerHTML='';return}
  const r=folgaRegra(c);const err=[];if(dow(seg)!==1)err.push('Escolha uma segunda-feira.');if(seg<=hoje)err.push('Escolha uma data futura.');
  const sex=uteisFim(seg,r.dias),sai=addD(seg,-2),volta=proxSeg(addD(sex,1));const fim=addD(volta,-1);
  const sobre=(c.ausencias||[]).find(a=>!(a.tipo==='Folga de campo'&&+a.folgaN===+f.dataset.folN)&&a.inicio<=fim&&(!a.fim||a.fim>=sai));if(sobre)err.push(`Coincide com ${sobre.tipo.toLowerCase()} de ${fmtE(sobre.inicio)}${sobre.fim?' a '+fmtE(sobre.fim):''}.`);
  box.innerHTML=`<div class="note" style="margin:0">Folga de <b>${esc(fmtDSE(seg))}</b> a <b>${esc(fmtDSE(sex))}</b>. Sai ${esc(fmtDSE(sai))} e volta ${esc(fmtDSE(volta))}.</div>${err.length?`<div class="banner" style="border-left-color:var(--crit);margin-top:8px">${err.map(esc).join('<br>')}</div>`:''}`;
  return err}
document.addEventListener('input',e=>{if(e.target.dataset?.fol)folgaPrevia()});document.addEventListener('change',e=>{if(e.target.dataset?.fol)folgaPrevia()});
Object.assign(ACT,{
  folgaConf:b=>{const c=C(b.dataset.id);const x=c&&folgaN(c,b.dataset.n);if(!x)return toast('Folga não encontrada. Atualize a tela.',true);
    modal(`Confirmar a ${x.n}ª folga de campo · ${esc(c.nome)}`,`<div class="field full"><label for="fol-seg">Segunda-feira de início</label><input class="inp" type="date" id="fol-seg" name="seg" value="${esc(x.reg?.inicio?addD(x.reg.inicio,2):x.seg)}" data-fol="1"></div>
      <div class="full" id="folPrev" aria-live="polite"></div><div class="field full"><label for="fol-ob">Observação (opcional)</label><input class="inp" id="fol-ob" name="obs" maxlength="200" placeholder="Ex.: combinado com o Adm. da obra"></div>
      <p class="note full" style="margin:0">Os ${folgaRegra(c).dias} dias completam em ${esc(fmtDSE(x.ref))}. Combine a data com o Adm. da obra. A data da próxima folga não muda: ela continua contada da primeira chegada.</p>`,'Confirmar folga',fd=>{
      const f=document.querySelector('#layer .modal form');const err=folgaPrevia()||[];if(err.length){toast(err[0],true);return false}
      const r=folgaRegra(c);const seg=fd.seg,sex=uteisFim(seg,r.dias),sai=addD(seg,-2),fim=addD(proxSeg(addD(sex,1)),-1);
      const v=folgaReg(c);v.conf[x.n]={seg,por:perfilNome(),em:hoje};c.ausencias??=[];
      const a=c.ausencias.find(y=>y.tipo==='Folga de campo'&&+y.folgaN===x.n);
      if(a){a.inicio=sai;a.fim=fim}else c.ausencias.push({id:uid(),tipo:'Folga de campo',inicio:sai,fim,confirmado:false,folgaN:x.n});
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`${a?'Data da':'Confirmada a'} ${x.n}ª folga de campo: ${fmtE(seg)} a ${fmtE(sex)} (sai ${fmtE(sai)}, volta ${fmtE(addD(fim,1))}).${fd.obs?' '+fd.obs:''}`,autor:perfilNome()});
      save();render();toast('Folga confirmada.')});
    const f=document.querySelector('#layer .modal form');if(f){f.dataset.folId=c.id;f.dataset.folN=x.n;f.dataset.rasc=''}setTimeout(folgaPrevia,0)},
  folgaPular:b=>{const c=C(b.dataset.id);const x=c&&folgaN(c,b.dataset.n);if(!x)return;
    modal(`A ${x.n}ª folga não vai acontecer?`,`<div class="field full"><label for="fol-mt">Motivo</label><input class="inp" id="fol-mt" name="motivo" required maxlength="200" placeholder="Ex.: preferiu juntar com as férias"></div><p class="note full" style="margin:0">A folga seguinte continua prevista na data normal. Dá para voltar atrás depois.</p>`,'Registrar',fd=>{
      const mt=String(fd.motivo||'').trim();if(!mt)return toast('Informe o motivo.',true),false;const v=folgaReg(c);v.puladas[x.n]={motivo:mt,por:perfilNome(),em:hoje};
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`A ${x.n}ª folga de campo (${fmtE(x.seg)}) não vai acontecer: ${mt}.`,autor:perfilNome()});save();render()})},
  folgaVoltar:b=>{const c=C(b.dataset.id);if(!c)return;const v=folgaReg(c);const n=+b.dataset.n;if(!v.puladas[n])return;delete v.puladas[n];
    c.historico.push({data:hoje,tipo:'Folga de campo',texto:`A ${n}ª folga de campo voltou a ser prevista.`,autor:perfilNome()});save();render()},
  folgaDesfazer:b=>{const c=C(b.dataset.id);const n=+b.dataset.n;const a=c&&(c.ausencias||[]).find(y=>y.tipo==='Folga de campo'&&+y.folgaN===n);if(!a)return;
    if(a.inicio<=hoje)return toast('A folga já começou. Para encerrar antes, registre o retorno.',true);
    modalD(`Desfazer a confirmação da ${n}ª folga?`,'<p class="full" style="margin:0">A folga volta a aparecer como sugerida, na data calculada.</p>','Desfazer',()=>{
      c.ausencias=c.ausencias.filter(y=>y!==a);const v=folgaReg(c);delete v.conf[n];
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`Confirmação da ${n}ª folga de campo desfeita (${fmtE(a.inicio)} a ${fmtE(a.fim)}).`,autor:perfilNome()});save();render()})},
  folgaAplicar:b=>{const c=C(b.dataset.id);if(!c)return;const g=grupoFuncao(c.funcaoId);const p=folgaPad()[g];
    modal(`Aplicar a folga padrão · ${esc(c.nome)}`,`<p class="full" style="margin:0">${esc(F(c.funcaoId)?.nome||'')}: mão de obra ${g}, folga a cada ${p.ciclo} dias com ${p.dias} dias úteis, contada da primeira chegada em obra.</p>${fld('Primeira chegada em obra pela NTN','ancora',primeiraChegada(c),'date')}
      <p class="note full" style="margin:0">A escala anterior deixa de valer. Folgas já registradas em Ausências continuam como estão.</p>`,'Aplicar',fd=>{
      if(!fd.ancora||fd.ancora>hoje)return toast('Informe a data da primeira chegada (até hoje).',true),false;
      const v=folgaReg(c);v.modo='padrao';if(fd.ancora!==primeiraChegada(c))v.ancora=fd.ancora;else delete v.ancora;
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`Folga padrão aplicada (a cada ${p.ciclo} dias, ${p.dias} dias úteis, desde ${fmtE(fd.ancora)}). Escala anterior: ${c.folga?.campo}×${c.folga?.folga}.`,autor:perfilNome()});save();render();toast('Folga padrão aplicada.')})},
  folgaAncora:b=>{const c=C(b.dataset.id);if(!c)return;
    modal(`Primeira chegada em obra · ${esc(c.nome)}`,`${fld('Data da primeira chegada em obra pela NTN','ancora',folgaAncora(c),'date')}<div class="field full"><label for="fol-am">Motivo</label><input class="inp" id="fol-am" name="motivo" required maxlength="200"></div><p class="note full" style="margin:0">Pelo sistema, a primeira chegada é ${fmtE(primeiraChegada(c))}. Todas as folgas são contadas a partir dessa data.</p>`,'Salvar',fd=>{
      const mt=String(fd.motivo||'').trim();if(!fd.ancora||fd.ancora>hoje)return toast('Informe uma data até hoje.',true),false;if(!mt)return toast('Informe o motivo.',true),false;
      const v=folgaReg(c);if(v.modo==='anterior')v.modo='padrao';const ant=folgaAncora(c);if(fd.ancora===primeiraChegada(c))delete v.ancora;else v.ancora=fd.ancora;
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`Data da primeira chegada em obra (base das folgas): ${fmtE(ant)} → ${fmtE(fd.ancora)}. ${mt}.`,autor:perfilNome()});save();render()})},
  folgaExc:b=>{const c=C(b.dataset.id);if(!c)return;const v0=c.folgaV2||{};const r=folgaRegra(c);
    const opts=(DB.cfg.escalas||[]).map(e=>`<option value="${e.campo}">${esc(e.nome)}</option>`).join('');
    modal(`Exceção de folga · ${esc(c.nome)}`,`<div class="field"><label for="fol-ec">Folga a cada (dias)</label><input class="inp num" id="fol-ec" name="ciclo" inputmode="numeric" value="${esc(r.ciclo)}" list="fol-esc"><datalist id="fol-esc">${opts}</datalist></div>
      <div class="field"><label for="fol-ed">Dias úteis de folga</label><input class="inp num" id="fol-ed" name="dias" inputmode="numeric" value="${esc(r.dias)}"></div>
      <div class="field full"><label for="fol-em">Motivo</label><input class="inp" id="fol-em" name="motivo" required maxlength="200" value="${esc(v0.modo==='excecao'?v0.motivo||'':'')}"></div>
      <p class="note full" style="margin:0">A exceção vale só para esta pessoa e fica registrada com o seu nome como aprovador. As folgas continuam contadas da primeira chegada.</p>`,'Salvar exceção',fd=>{
      const ci=Math.round(+fd.ciclo),di=Math.round(+fd.dias),mt=String(fd.motivo||'').trim();
      if(!(ci>=7&&ci<=365))return toast('Folga a cada: informe de 7 a 365 dias.',true),false;if(!(di>=1&&di<=10))return toast('Dias úteis: informe de 1 a 10.',true),false;if(!mt)return toast('Informe o motivo.',true),false;
      const v=folgaReg(c);Object.assign(v,{modo:'excecao',ciclo:ci,dias:di,motivo:mt,aprov:{por:perfilNome(),em:hoje}});
      c.historico.push({data:hoje,tipo:'Folga de campo',texto:`Exceção de folga: a cada ${ci} dias, ${di} dias úteis. ${mt}.`,autor:perfilNome()});save();render();toast('Exceção registrada.')})},
  folgaPadrao:b=>{const c=C(b.dataset.id);if(!c)return;modalD('Voltar à folga padrão?','<p class="full" style="margin:0">A exceção deixa de valer e as próximas folgas seguem a regra da função.</p>','Voltar à padrão',()=>{
    const v=folgaReg(c);v.modo='padrao';['ciclo','dias','motivo','aprov'].forEach(k=>delete v[k]);c.historico.push({data:hoje,tipo:'Folga de campo',texto:'Exceção de folga encerrada: volta à folga padrão da função.',autor:perfilNome()});save();render()})},
  cidEditar:b=>{const c=C(b.dataset.id);if(!c)return;if(!podeVerCusto())return;
    munCarregar().then(()=>{const cid=c.cidades||{};const sug=!munOk(cid.origem)&&c.end?.cidade?munAchar(`${c.end.cidade}${c.end.uf?' / '+c.end.uf:''}`):null;
      modal(`Cidades · ${esc(c.nome)}`,`<div class="field full"><label for="cid-o">Cidade de origem (de onde viaja para a obra)</label>${munCampo('cid-o',munOk(cid.origem)?cid.origem:sug,'name="origem"')}</div>
        <div class="field full"><label for="cid-n">Cidade natal</label>${munCampo('cid-n',munOk(cid.natal)?cid.natal:null,'name="natal"')}</div>
        ${sug?`<p class="note full" style="margin:0">Sugestão a partir do endereço: ${esc(munTxt(sug))}. Confira antes de salvar.</p>`:''}`,'Salvar cidades',fd=>{
        const o=fd.origem.trim()?munAchar(fd.origem):null,n=fd.natal.trim()?munAchar(fd.natal):null;
        if(fd.origem.trim()&&!o)return toast('Cidade de origem: escolha uma cidade da lista (cidade / UF).',true),false;
        if(fd.natal.trim()&&!n)return toast('Cidade natal: escolha uma cidade da lista (cidade / UF).',true),false;
        const ant=c.cidades||{};c.cidades={origem:munRef(o),natal:munRef(n)};
        const mud=[];if(munTxt(ant.origem)!==munTxt(o))mud.push('origem');if(munTxt(ant.natal)!==munTxt(n))mud.push('natal');
        if(mud.length)c.historico.push({data:hoje,tipo:'Cadastro',texto:`Cidade ${mud.join(' e ')} atualizada.`,autor:perfilNome()});save();render();toast('Cidades salvas.')})}).catch(()=>toast(MUN.erro,true))},
  ajudaPagar:b=>{const c=C(b.dataset.id);if(!c||!podeVerCusto())return;const t=b.dataset.t,r=b.dataset.r;const a=ajudasDevidas(c).find(x=>x.tipo===t&&String(x.ref)===String(r));if(!a)return;
    modal(`Ajuda de custo paga · ${esc(c.nome)}`,`<p class="full" style="margin:0">${esc(t)}${r?' '+esc(r)+'ª':''} · ${a.trechos} trecho(s) · previsto ${a.valor==null?'— (sem cidade de origem ou cidade da obra)':brl(a.valor)}</p>
      <div class="field"><label for="aj-v">Valor pago (R$)</label><input class="inp num" id="aj-v" name="valor" inputmode="decimal" value="${a.valor==null?'':esc(String(a.valor).replace('.',','))}"></div>
      <div class="field"><label for="aj-m">Forma</label><select class="inp" id="aj-m" name="modo"><option>Dinheiro</option><option>Passagem comprada</option></select></div>
      ${fld('Data do pagamento','pago',hoje,'date')}<div class="field full"><label for="aj-o">Observação (opcional)</label><input class="inp" id="aj-o" name="obs" maxlength="200"></div>`,'Registrar pagamento',fd=>{
      const val=numBR(fd.valor);if(!(val>=0)||String(fd.valor).trim()==='')return toast('Informe o valor pago.',true),false;if(val>50000||(a.valor>0&&val>3*a.valor))return toast(`Valor muito acima do previsto (${brl(a.valor)}). Confira o número.`,true),false;if(!fd.pago||fd.pago>hoje)return toast('Informe uma data até hoje.',true),false;
      if(ajudaPaga(c,t,r||null))return toast('Este pagamento já foi registrado.',true),false;
      const v=viagemColab(c);(c.ajudas??=[]).push({id:(t==='Férias'?'Folga':t)+'|'+(r||''),tipo:t,ref:r,trechos:a.trechos,km:v?.km??null,faixa:v?.faixa||'',valorTrecho:v?.valorTrecho??null,valor:Math.round(val*100)/100,modo:fd.modo,pago:fd.pago,por:perfilNome(),obs:String(fd.obs||'').slice(0,200)});
      c.historico.push({data:fd.pago,tipo:'Ajuda de custo',texto:`Ajuda de custo registrada: ${t}${r?' '+r+'ª':''} (${fd.modo.toLowerCase()}).`,autor:perfilNome()});save();render();toast('Pagamento registrado.')})},
});
Object.assign(ACT_PERM,{folgaConf:'confirmarFolga',folgaPular:'confirmarFolga',folgaVoltar:'confirmarFolga',folgaDesfazer:'confirmarFolga',ajudaPagar:'confirmarFolga',
  folgaAplicar:'editarCadastro',folgaAncora:'editarCadastro',folgaExc:'editarCadastro',folgaPadrao:'editarCadastro'});

/* férias × folga: aviso quando a programação vai substituir uma folga ou bater com uma folga confirmada */
const ferValidarV17=ferValidar;
ferValidar=function(c,n,novas,abono){const r=ferValidarV17(c,n,novas,abono);
  try{if(folgaModo(c)==='padrao'||folgaModo(c)==='excecao'){const l=folgasCiclo(c,addD(hoje,800))||[];
    for(const x of novas.filter(y=>y.inicio&&+y.dias>=1))for(const f of l){if(f.passou||f.est==='pulada')continue;const d=Math.abs((parse(x.inicio)-parse(f.seg))/864e5);
      if(d<=30){if(f.est==='confirmada'&&f.reg)r.avisos.push(`A ${f.n}ª folga de campo (${fmtE(f.seg)}) já está confirmada e fica a até 30 dias destas férias. Pela regra, as férias ficam no lugar da folga: desfaça a confirmação da folga em Folga de campo.`);
        else if(f.est!=='ferias')r.avisos.push(`Estas férias ficam no lugar da ${f.n}ª folga de campo (${fmtE(f.seg)}), que começaria até 30 dias antes ou depois.`)}}}}catch(e){}
  return r};

/* ---------- alertas ---------- */
const alertasBaseV17v=alertasBase;
alertasBase=function(){const A=DB.cfg.antecedencia||{};const v18=c=>{const m=folgaModo(c);return m==='padrao'||m==='excecao'};
  const out=alertasBaseV17v().filter(a=>!(a.tipo==='Folga de campo'&&v18(a.c)));const extra=[];
  DB.colabs.forEach(c=>{if(c.status!=='Ativo'&&c.status!=='Férias'&&c.status!=='Afastado'||!v18(c))return;
    for(const f of folgasCiclo(c,addD(hoje,60))||[]){if(f.passou)continue;
      if(f.est==='sugerida'&&dias(f.sai)<=30)extra.push({c,tipo:'Folga de campo',desc:`Confirmar a ${f.n}ª folga de campo com o Adm. da obra (sugerida: ${fmtCE(f.seg)} a ${fmtCE(f.sex)}, sai ${fmtCE(f.sai)})`,data:f.sai});
      else if(f.est==='confirmada'&&f.sai>=hoje&&!ajudaPaga(c,'Folga',f.n)&&dias(f.sai)<=30&&podeVerCusto())extra.push({c,tipo:'Folga de campo',desc:`Providenciar a ajuda de custo da ${f.n}ª folga (sai ${fmtCE(f.sai)})`,data:addD(f.sai,-3)})}});
  extra.forEach(a=>{a.d=dias(a.data);a.acao=a.d<=(A[a.tipo]??7)});
  return out.concat(extra).sort((a,b)=>a.d-b.d)};

/* ---------- relatório de provisão (só quem vê custos) ---------- */
REL_META.ajudaCusto={g:'Pessoal',d:'Ajuda de custo prevista e paga por obra e mês: idas, folgas e voltas.',f:['obra','vinc'],p:'verCustoViagem'};
RELS.ajudaCusto={nome:'Ajuda de custo de viagem',cols:['Obra','Mês','Nome','Tipo','Data','Trechos','Distância (km)','Valor previsto','Situação'],
  rows:()=>{if(!podeVerCusto())return [];const lim=addD(hoje,365);const out=[];
    DB.colabs.filter(c=>c.regime==='Alojado'&&fR(c)).forEach(c=>{const v=viagemColab(c);
      ajudasDevidas(c,lim).forEach(a=>{if(!a.paga&&(a.data<addD(hoje,-60)||a.data>lim))return;if(a.naoDevida&&!a.paga)return;
        out.push([nomeObra(c.obraId),a.data.slice(0,7).split('-').reverse().join('/'),c.nome,a.tipo+(a.ref?' '+a.ref+'ª':''),fmtE(a.data),a.trechos,v?v.km:'—',a.paga?brl(a.paga.valor):a.valor==null?'sem cidade':brl(a.valor),a.paga?`pago em ${fmtE(a.paga.pago)}`:a.est==='sugerida'?'previsto (folga sugerida)':'previsto'])})});
    return out.sort((a,b)=>a[0].localeCompare(b[0])||a[4].split('/').reverse().join('').localeCompare(b[4].split('/').reverse().join('')))}};

/* ---------- Configurações › Viagens e folgas ---------- */
function cfgViagem(){const ed=pode('configurar');const dis=ed?'':'disabled';const vc=podeVerCusto();const ec=podeEditarCusto();const g=custos();const p=folgaPad();
  if(!MUN.lista&&!MUN.erro)munCarregar().then(()=>{if(UI.view==='cfg'&&UI.cfgTab==='viagem')render()}).catch(()=>{if(UI.view==='cfg')render()});
  const obras=(DB.cfg.obras||[]).map((o,i)=>{const oc=obraCfg(o.id);const sug=ec&&!munOk(oc.mun)&&MUN.lista&&o.cidade?munAchar(o.cidade):null;
    return `<tr><td><b>${esc(o.nome)}</b><div class="muted" style="font-size:12px">${esc(o.cidade||'')}</div></td><td>${ec?munCampo('ob-mun-'+i,oc.mun,`data-chg="obraMun" data-i="${i}" aria-label="Cidade da obra ${esc(o.nome)}"`):esc(munTxt(oc.mun))||'—'}${sug?`<div style="margin-top:4px"><button class="btn small" data-act="obraMunSug" data-i="${i}" data-cod="${sug.cod}">Usar ${esc(munTxt(sug))}</button></div>`:''}</td>
      <td><input class="inp" value="${esc(oc.jornada||'')}" placeholder="padrão da empresa" data-chg="obraTxt" data-i="${i}" data-f="jornada" aria-label="Jornada da obra" maxlength="200" ${ec?'':'disabled'}></td>
      <td><input class="inp" value="${esc(oc.regrasAloj||'')}" placeholder="padrão da empresa" data-chg="obraTxt" data-i="${i}" data-f="regrasAloj" aria-label="Regras do alojamento" maxlength="300" ${ec?'':'disabled'}></td></tr>`}).join('');
  const fx=faixasOrd();
  return `${MUN.erro?`<section class="panel" style="grid-column:1/-1"><div class="panel-b"><div class="banner" style="margin:0">${esc(MUN.erro)}</div></div></section>`:''}
  <section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Folga de campo padrão</h3><span class="sub">vale para quem está alojado</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Grupo</th><th>Folga a cada (dias)</th><th>Dias úteis de folga</th></tr></thead><tbody>
    ${['indireta','direta'].map(k=>`<tr><td><b>Mão de obra ${k}</b></td><td><input class="inp num" type="number" min="7" max="365" value="${p[k].ciclo}" data-chg="folgaPadCfg" data-k="${k}" data-f="ciclo" aria-label="Folga a cada, ${k}" style="max-width:100px" ${dis}></td><td><input class="inp num" type="number" min="1" max="10" value="${p[k].dias}" data-chg="folgaPadCfg" data-k="${k}" data-f="dias" aria-label="Dias úteis, ${k}" style="max-width:100px" ${dis}></td></tr>`).join('')}</tbody></table></div>
    <div class="tbl-wrap"><table><thead><tr><th>Função</th><th>Grupo</th></tr></thead><tbody>${DB.cfg.funcoes.map((f,i)=>`<tr><td>${esc(f.nome)}</td><td><select class="inp" data-chg="funcGrupo" data-i="${i}" aria-label="Grupo de ${esc(f.nome)}" ${dis}><option value="direta" ${grupoFuncao(f.id)==='direta'?'selected':''}>Direta</option><option value="indireta" ${grupoFuncao(f.id)==='indireta'?'selected':''}>Indireta</option></select></td></tr>`).join('')}</tbody></table></div>
    <div class="panel-b"><p class="note" style="margin:0">As folgas contam sempre da primeira chegada em obra. A data sugerida é a segunda-feira seguinte; o RH e o Adm. da obra confirmam. Feriado não prorroga.</p></div></section>
  ${vc?`<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Cidade de cada obra</h3><span class="sub">destino das viagens e texto da proposta</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Obra</th><th>Cidade (lista do IBGE)</th><th>Jornada, se diferente do padrão</th><th>Regras do alojamento, se diferentes</th></tr></thead><tbody>${obras||'<tr><td colspan="4" class="empty">Nenhuma obra cadastrada.</td></tr>'}</tbody></table></div>
    <div class="panel-b"><p class="note" style="margin:0">A viagem termina sempre na cidade da obra. Jornada e regras em branco usam o padrão da empresa (Configurações › Proposta). Só RH e Diretoria alteram.</p></div></section>`:''}
  ${vc?`<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Ajuda de custo por faixa de distância</h3><span class="sub">${DB.custos?`valores da NTN`:'valores sugeridos; ainda não salvos'}</span></div>
    <div class="panel-b facts"><div><span>Fator de correção sobre a linha reta</span>${ec?`<input class="inp num" inputmode="decimal" value="${esc(String(g.fator).replace('.',','))}" data-chg="custoFator" aria-label="Fator de correção" style="max-width:100px">`:`<b>${esc(String(g.fator).replace('.',','))}</b>`}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Faixa</th><th>Até (km)</th><th>Valor por trecho (R$)</th><th>Por folga, ida e volta</th></tr></thead><tbody>
    ${fx.map((x,i)=>`<tr><td>${esc(faixaRot(i))}</td><td>${x.ate==null?'—':ec?`<input class="inp num" type="number" min="1" value="${esc(x.ate)}" data-chg="custoFaixa" data-i="${i}" data-f="ate" aria-label="Limite da faixa ${i+1}" style="max-width:110px">`:esc(x.ate)}</td>
      <td>${ec?`<input class="inp num" inputmode="decimal" value="${esc(String(x.valor).replace('.',','))}" data-chg="custoFaixa" data-i="${i}" data-f="valor" aria-label="Valor por trecho da faixa ${i+1}" style="max-width:120px">`:brl(x.valor)}</td><td class="num">${brl(2*(+x.valor||0))}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel-b"><p class="note" style="margin:0">Distância = linha reta entre a cidade de origem e a cidade da obra × fator. Só RH, Diretoria e Adm. de obra veem estes valores; só RH e Diretoria alteram.</p></div></section>`:''}`}
const vCfgV17v=vCfg;
vCfg=function(){
  if(UI.cfgTab==='perfis'&&pode('configurar')&&DB.cfg.perms)for(const [k,l] of Object.entries(V18_PERM))if(!DB.cfg.perms[k])DB.cfg.perms[k]=l.slice();
  let h=UI.cfgTab==='viagem'?(()=>{const t=UI.cfgTab;UI.cfgTab='funcoes';try{return vCfgV17v()}finally{UI.cfgTab=t}})():vCfgV17v();
  h=h.replace(/(<button data-act="cfgTab" data-v="admissao")/,`<button data-act="cfgTab" data-v="viagem" aria-pressed="${UI.cfgTab==='viagem'}">Viagens e folgas</button>$1`);
  if(UI.cfgTab==='viagem'){h=h.replace(/aria-pressed="true"/g,'aria-pressed="false"').replace('data-v="viagem" aria-pressed="false"','data-v="viagem" aria-pressed="true"');const i=h.indexOf('<div class="cfg-grid">');if(i>=0)h=h.slice(0,i)+`<div class="cfg-grid">${cfgViagem()}</div>`}
  return h};
const numBR=s=>{const t=String(s??'').trim().replace(/\s|R\$/g,'');if(!t)return NaN;if(/,/.test(t))return +t.replace(/\./g,'').replace(',','.');if(/^\d{1,3}(\.\d{3})+$/.test(t))return +t.replace(/\./g,'');return +t};
Object.assign(CHG,{
  obraMun:el=>{if(!podeEditarCusto())return;const o=DB.cfg.obras[+el.dataset.i];if(!o)return;if(!el.value.trim()){if(obraCfg(o.id).mun){delete obraCfgMat(o.id).mun;save()}render();return}
    const m=munAchar(el.value);if(!m)return toast('Escolha uma cidade da lista (cidade / UF).',true),render();obraCfgMat(o.id).mun=munRef(m);save();render();toast(`Cidade da obra: ${munTxt(m)}.`)},
  obraTxt:el=>{if(!podeEditarCusto())return;const o=DB.cfg.obras[+el.dataset.i];if(!o||!['jornada','regrasAloj'].includes(el.dataset.f))return;const v=el.value.trim().slice(0,300);const oc=obraCfgMat(o.id);if(v)oc[el.dataset.f]=v;else delete oc[el.dataset.f];save();render()},
  folgaPadCfg:el=>{const k=el.dataset.k,f=el.dataset.f;if(!['direta','indireta'].includes(k)||!['ciclo','dias'].includes(f))return;const v=Math.round(+el.value);
    if(f==='ciclo'&&!(v>=7&&v<=365))return toast('Informe de 7 a 365 dias.',true),render();if(f==='dias'&&!(v>=1&&v<=10))return toast('Informe de 1 a 10 dias úteis.',true),render();
    const p=DB.cfg.folgaPadrao??=JSON.parse(JSON.stringify(folgaPad()));p[k]??={};p[k][f]=v;save();render()},
  funcGrupo:el=>{const f=DB.cfg.funcoes[+el.dataset.i];if(!f||!['direta','indireta'].includes(el.value))return;f.grupo=el.value;save();render()},
  custoFator:el=>{if(!podeEditarCusto())return;const v=numBR(el.value);if(!(v>=1&&v<=3))return toast('Fator: informe um número entre 1 e 3 (ex.: 1,30).',true),render();custosMaterializar().fator=Math.round(v*100)/100;save();render()},
  custoFaixa:el=>{if(!podeEditarCusto())return;const g=custosMaterializar();const l=g.faixas;const real=l[+el.dataset.i];if(!real)return render();
    if(el.dataset.f==='valor'){const v=numBR(el.value);if(!(v>=0&&v<100000))return toast('Informe um valor válido.',true),render();real.valor=Math.round(v*100)/100}
    else{const v=Math.round(+el.value);const ant=l[+el.dataset.i-1],prox=l[+el.dataset.i+1];if(!(v>0)||(ant&&v<=+ant.ate)||(prox&&prox.ate!=null&&v>=+prox.ate))return toast('O limite precisa ficar entre o da faixa anterior e o da seguinte.',true),render();real.ate=v}
    save();render()},
});
Object.assign(ACT,{obraMunSug:b=>{if(!podeEditarCusto())return;const o=DB.cfg.obras[+b.dataset.i];const m=MUN.lista&&MUN.lista.find(x=>x.cod===+b.dataset.cod);if(!o||!m)return;obraCfgMat(o.id).mun=munRef(m);save();render();toast(`Cidade da obra: ${munTxt(m)}.`)}});
Object.assign(CHG_PERM,{obraMun:'editarCustoViagem',obraTxt:'editarCustoViagem',folgaPadCfg:'configurar',funcGrupo:'configurar',custoFator:'editarCustoViagem',custoFaixa:'editarCustoViagem'});
Object.assign(ACT_PERM,{obraMunSug:'editarCustoViagem'});

/* ---------- função Supervisor (mão de obra indireta), criada uma vez pelo RH ou Diretoria ---------- */
function migrarV18(){if(!['rh','dir'].includes(UI.perfil)||!DB?.cfg?.funcoes||DB.cfg.funcoes.some(f=>f.id==='sup'||munNorm(f.nome)==='supervisor'))return;
  DB.cfg.funcoes.push({id:'sup',nome:'Supervisor',cbo:'',sal:null,grupo:'indireta',tr:['nr06','nr18','nr20','integ','nr35'].filter(t=>(DB.cfg.treinamentos||[]).some(x=>x.id===t))});save()}
setTimeout(()=>{try{comoSistema(migrarV18,'Inclusão da função Supervisor (v18)')()}catch(e){console.error('v18 migração',e)}},0);

/* novas admissões já nascem na folga padrão (a escala antiga só vale para quem já estava cadastrado) */
const novoRegistroV17=novoRegistro;
novoRegistro=function(o){const c=novoRegistroV17(o);if(c&&o.regime==='Alojado')c.folgaV2={modo:'padrao',conf:{},puladas:{}};return c};
