
/* =====================================================================
   v17 · EPI POR FUNÇÃO
   - Catálogo de EPIs + kit básico (todos) + adicionais por função + exigidos pela obra.
   - Na ficha (aba SST): kit da pessoa item por item, entrega em lote, ficha de EPI para assinar.
   - Kit incompleto entra nas pendências de liberação para a obra.
   - Alertas de troca periódica; aviso de CA vencido no catálogo e no kit.
   Enquanto ninguém editar o catálogo, vale a lista sugerida abaixo (não é gravada até ser editada).
   ===================================================================== */
const EPI_SUGESTAO={
  itens:[
    {id:'cap',nome:'Capacete com jugular',ca:'',caVal:'',troca:'',tam:''},
    {id:'ocu',nome:'Óculos de segurança',ca:'',caVal:'',troca:'',tam:''},
    {id:'aur',nome:'Protetor auricular',ca:'',caVal:'',troca:'',tam:''},
    {id:'lvq',nome:'Luva de vaqueta',ca:'',caVal:'',troca:'',tam:'luva'},
    {id:'bot',nome:'Botina de segurança',ca:'',caVal:'',troca:'',tam:'botina'},
    {id:'uni',nome:'Uniforme (camisa e calça)',ca:'',caVal:'',troca:'',tam:'camisa'},
    {id:'msd',nome:'Máscara de solda',ca:'',caVal:'',troca:'',tam:''},
    {id:'avr',nome:'Avental de raspa',ca:'',caVal:'',troca:'',tam:''},
    {id:'lvr',nome:'Luva de raspa',ca:'',caVal:'',troca:'',tam:'luva'},
    {id:'per',nome:'Perneira de raspa',ca:'',caVal:'',troca:'',tam:''},
    {id:'mng',nome:'Mangote de raspa',ca:'',caVal:'',troca:'',tam:''},
    {id:'pff',nome:'Respirador PFF2',ca:'',caVal:'',troca:'',tam:''},
    {id:'pfa',nome:'Protetor facial',ca:'',caVal:'',troca:'',tam:''},
    {id:'cin',nome:'Cinto paraquedista com talabarte duplo',ca:'',caVal:'',troca:'',tam:''},
    {id:'lis',nome:'Luva isolante (classe conforme a tensão)',ca:'',caVal:'',troca:'',tam:'luva'},
    {id:'rsf',nome:'Respirador semifacial com filtro',ca:'',caVal:'',troca:'',tam:''},
    {id:'mac',nome:'Macacão de proteção para pintura',ca:'',caVal:'',troca:'',tam:'camisa'},
  ],
  basico:['cap','ocu','aur','lvq','bot','uni'],
  funcoes:{sold:['msd','avr','lvr','per','mng','pff'],cald:['pfa','lvr','avr','cin'],mont:['cin'],enc:['cin','lvr'],elet:['lis'],pint:['rsf','mac']},
};
const EPI_TAM={'':'—',camisa:'Camisa e calça',botina:'Calçado',luva:'Luva'};
const epiCfg=()=>DB.cfg.epiCat||{itens:EPI_SUGESTAO.itens,basico:EPI_SUGESTAO.basico,funcoes:EPI_SUGESTAO.funcoes,obras:{}};
const epiItem=id=>epiCfg().itens.find(x=>x.id===id);
function epiMaterializar(){if(!DB.cfg.epiCat){DB.cfg.epiCat=JSON.parse(JSON.stringify({itens:EPI_SUGESTAO.itens,basico:EPI_SUGESTAO.basico,funcoes:EPI_SUGESTAO.funcoes,obras:{}}))}return DB.cfg.epiCat}
const epiNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function kitEPI(c,obraId=c.obraId){const g=epiCfg();const ids=[...(g.basico||[]),...((g.funcoes||{})[c.funcaoId]||[]),...((g.obras||{})[obraId]||[])];
  return [...new Set(ids)].map(id=>({id,item:epiItem(id),origem:(g.basico||[]).includes(id)?'Básico':((g.funcoes||{})[c.funcaoId]||[]).includes(id)?'Função':'Obra'})).filter(x=>x.item)}
function epiTamanho(c,it){const u=c.uniforme||{};if(it.tam==='camisa')return [u.camisa,u.calca].filter(Boolean).join(' / ');if(it.tam==='botina')return u.botina||'';if(it.tam==='luva')return u.luva||'';return ''}
function epiSituacao(c,k){const it=k.item;const nomes=[it.nome,...(it.nomesAnt||[])].map(epiNorm);const ents=(c.epi||[]).filter(e=>e.epiId===it.id||(!e.epiId&&nomes.includes(epiNorm(e.item)))).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
  const ult=ents[0];if(!ult)return {sit:'pendente',ult:null};
  const troca=+it.troca>0?addD(ult.data,+it.troca):null;
  if(troca&&troca<=hoje)return {sit:'trocar',ult,troca};
  if(troca&&dias(troca)<=(DB.cfg.antecedencia?.EPI??15))return {sit:'troca-proxima',ult,troca};
  return {sit:'entregue',ult,troca}}
const epiCaVencido=it=>!!(it.caVal&&it.caVal<hoje);
function epiPendentes(c,obraId){return kitEPI(c,obraId).filter(k=>epiSituacao(c,k).sit==='pendente')}

/* ---------- pendência de liberação ---------- */
const pendLiberacaoV16=pendLiberacao;
pendLiberacao=function(c){const p=pendLiberacaoV16(c);const pe=DB.cfg.epiCat?.revisado?epiPendentes(c,c.obraId):[];
  if(pe.length)p.push({t:`EPI não entregue: ${pe.map(k=>k.item.nome).join(', ')}`,tab:'sst'});return p};

/* ---------- ficha › SST: kit de EPI ---------- */
function epiPainel(c){const kit=kitEPI(c);const ed=pode('editarSST');
  const rot={pendente:pillS('Pendente','crit'),trocar:pillS('Trocar','crit'),'troca-proxima':pillS('Troca próxima','warn'),entregue:pillS('Entregue','good')};
  const linhas=kit.map(k=>{const s=epiSituacao(c,k);const tam=epiTamanho(c,k.item);const marc=s.sit!=='entregue'&&s.sit!=='troca-proxima';
    return `<tr><td>${ed?`<input type="checkbox" class="epi-sel" value="${esc(k.id)}" ${marc?'checked':''} aria-label="Entregar ${esc(k.item.nome)}">`:''}</td><td><b>${esc(k.item.nome)}</b><div class="muted" style="font-size:12px">${k.origem}${k.item.ca?' · CA '+esc(k.item.ca):''}${epiCaVencido(k.item)?' · <span class="pac-falta">CA vencido em '+fmt(k.item.caVal)+'</span>':''}</div></td>
      <td>${k.item.tam?(tam?esc(tam):'<span class="muted">sem tamanho no cadastro</span>'):'—'}</td><td>${rot[s.sit]}${s.troca&&s.sit!=='pendente'?`<div class="muted" style="font-size:12px">troca em ${fmt(s.troca)}</div>`:''}</td>
      <td class="num">${s.ult?`${fmt(s.ult.data)}${s.ult.ca?' · CA '+esc(s.ult.ca):''} · ${esc(s.ult.qtd||1)} un.`:'—'}</td></tr>`}).join('');
  const pend=kit.filter(k=>epiSituacao(c,k).sit==='pendente').length;
  return `<section class="panel"><div class="panel-h"><h3>Kit de EPI</h3><span class="sub">${kit.length} item(ns) · ${pend?pend+' pendente(s)':'completo'} · ${esc(F(c.funcaoId)?.nome||'')} em ${esc(nomeObra(c.obraId))}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th></th><th>EPI</th><th>Tamanho</th><th>Situação</th><th>Última entrega</th></tr></thead><tbody>${linhas||'<tr><td colspan="5" class="empty">Nenhum EPI no kit. Cadastre em Configurações › EPIs.</td></tr>'}</tbody></table></div>
    <div class="panel-b">${ed&&kit.length?`<div class="arq-novo"><label class="fl" for="epi-dt-${esc(c.id)}"><span class="fl-t">Data da entrega</span><input class="inp" type="date" id="epi-dt-${esc(c.id)}" value="${hoje}" max="${hoje}"></label><button type="button" class="btn primary" data-act="epiEntregar" data-id="${esc(c.id)}">Registrar entrega dos marcados</button></div>`:''}
    <div class="actions" style="margin-top:10px"><button type="button" class="btn" data-act="epiFicha" data-id="${esc(c.id)}">Imprimir ficha de EPI</button></div>
    <p class="note" style="margin:8px 0 0">Kit = básico de todas as funções + adicionais da função + exigidos pela obra (Configurações › EPIs). EPI pendente impede a liberação para a obra depois que o SST marca o catálogo como revisado. Depois de assinada, anexe a ficha em “Arquivos de SST › Ficha de EPI”.</p></div></section>`}
const fichaTabV16e=fichaTab;
fichaTab=function(c){let h=fichaTabV16e(c);
  if(UI.fichaTab==='sst'){
    h=h.replace('<section class="panel"><div class="panel-h"><h3>Entregas de EPI e uniforme (NR-6)</h3>',()=>epiPainel(c)+'<section class="panel"><div class="panel-h"><h3>Entregas de EPI e uniforme (NR-6)</h3><span class="sub">todas as entregas, inclusive avulsas</span>');
    h=h.replace(/(<form class="panel-b form" data-form="epi">[\s\S]*?<select[^>]*name="item"[^>]*>)([\s\S]*?)(<\/select>)/,(m,a,b,z)=>a+[...new Set(epiCfg().itens.map(x=>x.nome))].map(n=>`<option>${esc(n)}</option>`).join('')+'<option>Outro</option>'+z);
  }
  return h};

/* ficha de EPI para imprimir e assinar (NR-6: registro do fornecimento) */
function epiFichaHtml(c){const ents=(c.epi||[]).slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  const linhas=ents.map(e=>`<tr><td>${fmt(e.data)}</td><td>${esc(e.item)}</td><td>${esc(e.ca||'')}</td><td>${esc(e.qtd||1)}</td><td></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma entrega registrada.</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de EPI · ${esc(c.nome)}</title><style>
  body{font:13px/1.45 system-ui,Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}.m{color:#444;margin:0 0 14px}
  table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #888;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eee}td:last-child{width:28%}
  .d{margin-top:18px;font-size:12px}.a{margin-top:40px;display:flex;gap:40px}.a div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}@media print{body{margin:10mm}}</style></head><body>
  <h1>Ficha de controle de entrega de EPI</h1><p class="m">NTN Engenharia · NR-6</p>
  <table><tr><th>Colaborador</th><td>${esc(c.nome)}</td><th>Matrícula</th><td>${esc(c.matricula||'')}</td></tr><tr><th>Função</th><td>${esc(F(c.funcaoId)?.nome||'')}</td><th>Obra</th><td>${esc(nomeObra(c.obraId))}</td></tr></table>
  <table><thead><tr><th>Data</th><th>EPI</th><th>CA</th><th>Qtd.</th><th>Assinatura do colaborador</th></tr></thead><tbody>${linhas}</tbody></table>
  <p class="d">Declaro ter recebido gratuitamente os equipamentos de proteção individual acima, em perfeito estado, e as orientações sobre uso, guarda e conservação. Comprometo-me a usá-los apenas para a finalidade a que se destinam, a responsabilizar-me pela guarda e conservação e a comunicar qualquer alteração que os torne impróprios para uso.</p>
  <div class="a"><div>Colaborador</div><div>Responsável pela entrega</div></div><p class="d">Emitida em ${fmt(hoje)} pelo nTeam.</p></body></html>`}

/* ---------- desligamento: lembrar a devolução ---------- */
const modalDesligV16=modalDeslig;
modalDeslig=function(c){const r=modalDesligV16.apply(this,arguments);
  try{const ent=[...new Set((c.epi||[]).map(e=>e.item))];const bd=document.querySelector('#layer .modal .bd');
    if(bd&&ent.length)bd.insertAdjacentHTML('beforeend',`<div class="note full"><b>EPIs e uniforme entregues (conferir a devolução):</b> ${ent.map(esc).join(', ')}.</div>`)}catch(e){}
  return r};

/* ---------- alertas de troca e de kit incompleto ---------- */
const alertasBaseV16=alertasBase;
alertasBase=function(){const out=alertasBaseV16();const g=epiCfg();const A=DB.cfg.antecedencia||{};const extra=[];
  DB.colabs.forEach(c=>{if(c.status==='Desligado'||c.status==='Admissão')return;
    const kit=kitEPI(c);const pend=[];
    kit.forEach(k=>{const s=epiSituacao(c,k);if(s.sit==='pendente')pend.push(k.item.nome);else if(s.troca&&dias(s.troca)<=90)extra.push({c,tipo:'EPI',desc:`Troca de ${k.item.nome} (a cada ${k.item.troca} dias)`,data:s.troca})});
    if(pend.length&&g.desde&&c.admissao&&c.admissao>=g.desde)extra.push({c,tipo:'EPI',desc:`Kit de EPI incompleto: ${pend.join(', ')}`,data:hoje})});
  extra.forEach(a=>{a.d=dias(a.data);a.acao=a.d<=(A[a.tipo]??15)});
  return out.concat(extra.filter(a=>a.d<=90)).sort((a,b)=>a.d-b.d)};

/* ---------- Configurações › EPIs ---------- */
function cfgEPI(){const g=epiCfg();const ed=pode('configurar');const dis=ed?'':'disabled';
  const fora=g.itens.filter(x=>!(g.basico||[]).includes(x.id));
  const chips=(lista,tipo,chave)=>`<div class="chkgrid">${fora.map(x=>`<label><input type="checkbox" data-chg="epiKit" data-tipo="${tipo}" data-k="${esc(chave)}" value="${esc(x.id)}" ${lista.includes(x.id)?'checked':''} ${dis}>${esc(x.nome)}</label>`).join('')||'<span class="muted">Todos os EPIs do catálogo já estão no kit básico.</span>'}</div>`;
  return `${!g.revisado?`<section class="panel" style="grid-column:1/-1"><div class="panel-b"><div class="banner" style="margin:0">${DB.cfg.epiCat?'Catálogo ainda não marcado como revisado pelo SST.':'Lista sugerida pelo sistema, com base nas NRs e nas funções cadastradas.'} O SST deve conferir itens, CA e kits e marcar como revisado. ${ed?'<button class="btn small" data-act="epiRevisado">Marcar como revisado</button>':''}</div></div></section>`:''}
  <section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Catálogo de EPIs e kit básico</h3><span class="sub">o kit básico vale para todas as funções</span><span class="grow" style="flex:1"></span>${ed?'<button class="btn small" data-act="epiAdd">+ Adicionar EPI</button>':''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>EPI</th><th>CA padrão</th><th>Validade do CA</th><th>Troca a cada (dias)</th><th>Tamanho</th><th>Kit básico</th><th></th></tr></thead><tbody>
    ${g.itens.map((x,i)=>`<tr><td><input class="inp" value="${esc(x.nome)}" data-chg="epiCampo" data-i="${i}" data-f="nome" aria-label="Nome do EPI" ${dis}></td><td><input class="inp" value="${esc(x.ca||'')}" data-chg="epiCampo" data-i="${i}" data-f="ca" aria-label="CA" style="max-width:110px" ${dis}></td>
      <td><input class="inp" type="date" value="${esc(x.caVal||'')}" data-chg="epiCampo" data-i="${i}" data-f="caVal" aria-label="Validade do CA" ${dis}>${epiCaVencido(x)?'<div class="pac-falta">vencido</div>':''}</td><td><input class="inp num" type="number" min="0" value="${esc(x.troca||'')}" data-chg="epiCampo" data-i="${i}" data-f="troca" aria-label="Troca a cada (dias)" style="max-width:90px" ${dis}></td>
      <td><select class="inp" data-chg="epiCampo" data-i="${i}" data-f="tam" aria-label="Tamanho" ${dis}>${Object.entries(EPI_TAM).map(([k,v])=>`<option value="${k}" ${x.tam===k?'selected':''}>${v}</option>`).join('')}</select></td>
      <td style="text-align:center"><input type="checkbox" data-chg="epiKit" data-tipo="basico" value="${esc(x.id)}" ${(g.basico||[]).includes(x.id)?'checked':''} aria-label="Kit básico: ${esc(x.nome)}" ${dis}></td>
      <td>${ed?`<button class="btn small ghost danger" data-act="epiRm" data-i="${i}">Remover</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel-b"><p class="note" style="margin:0">Troca a cada: deixe vazio quando a troca é só por desgaste. Validade do CA: data que consta no certificado de aprovação; vencido aparece em vermelho aqui e no kit de cada pessoa.</p></div></section>
  <section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Adicionais por função</h3><span class="sub">além do kit básico</span></div><div class="tbl-wrap"><table><thead><tr><th>Função</th><th>EPIs adicionais</th></tr></thead><tbody>
    ${DB.cfg.funcoes.map(f=>`<tr><td><b>${esc(f.nome)}</b></td><td>${chips((g.funcoes||{})[f.id]||[],'funcao',f.id)}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Exigidos pela obra</h3><span class="sub">valem para todos que trabalham na obra</span></div><div class="tbl-wrap"><table><thead><tr><th>Obra</th><th>EPIs exigidos</th></tr></thead><tbody>
    ${(DB.cfg.obras||[]).map(o=>`<tr><td><b>${esc(o.nome)}</b></td><td>${chips((g.obras||{})[o.id]||[],'obra',o.id)}</td></tr>`).join('')||'<tr><td colspan="2" class="empty">Nenhuma obra cadastrada.</td></tr>'}</tbody></table></div></section>`}
const vCfgV16=vCfg;
vCfg=function(){
  if(UI.cfgTab==='perfis'&&pode('configurar')&&DB.cfg.perms&&!DB.cfg.perms.programarFerias)DB.cfg.perms.programarFerias=['rh'];
  let h=UI.cfgTab==='epi'?(()=>{const t=UI.cfgTab;UI.cfgTab='funcoes';try{return vCfgV16()}finally{UI.cfgTab=t}})():vCfgV16();
  h=h.replace(/(<button data-act="cfgTab" data-v="admissao")/,`<button data-act="cfgTab" data-v="epi" aria-pressed="${UI.cfgTab==='epi'}">EPIs</button>$1`);
  if(UI.cfgTab==='epi'){h=h.replace(/aria-pressed="true"/g,'aria-pressed="false"').replace('data-v="epi" aria-pressed="false"','data-v="epi" aria-pressed="true"');const i=h.indexOf('<div class="cfg-grid">');if(i>=0)h=h.slice(0,i)+`<div class="cfg-grid">${cfgEPI()}</div>`}
  return h};

/* ---------- ações ---------- */
Object.assign(CHG,{
  epiCampo:el=>{const g=epiMaterializar();const x=g.itens[+el.dataset.i];if(!x)return;let v=el.value;
    if(el.dataset.f==='nome'){v=v.trim().slice(0,120);if(!v)return toast('Informe o nome do EPI.',true),render();if(g.itens.some(y=>y!==x&&epiNorm(y.nome)===epiNorm(v)))return toast('Já existe um EPI com esse nome.',true),render();if(epiNorm(v)!==epiNorm(x.nome))(x.nomesAnt??=[]).push(x.nome)}
    if(el.dataset.f==='troca')v=v===''?'':String(Math.max(0,Math.round(+v)||0));
    if(el.dataset.f==='ca')v=v.trim().slice(0,30);
    x[el.dataset.f]=v;save();render()},
  epiKit:el=>{const g=epiMaterializar();const t=el.dataset.tipo,id=el.value;
    const lista=t==='basico'?(g.basico??=[]):t==='funcao'?((g.funcoes??={})[el.dataset.k]??=[]):((g.obras??={})[el.dataset.k]??=[]);
    const i=lista.indexOf(id);if(el.checked&&i<0)lista.push(id);if(!el.checked&&i>=0)lista.splice(i,1);
    if(t==='basico'&&el.checked){for(const l of Object.values(g.funcoes||{})){const j=l.indexOf(id);if(j>=0)l.splice(j,1)}}
    save();render()},
});
Object.assign(ACT,{
  epiAdd:()=>{const g=epiMaterializar();modal('Adicionar EPI ao catálogo',`${fld('Nome do EPI','nome','')}${fld('CA padrão (opcional)','ca','')}${fld('Troca a cada (dias, opcional)','troca','','number')}`,'Adicionar EPI',fd=>{
    const nome=String(fd.nome||'').trim().slice(0,120);if(!nome)return toast('Informe o nome do EPI.',true),false;
    if(g.itens.some(x=>epiNorm(x.nome)===epiNorm(nome)))return toast('Já existe um EPI com esse nome.',true),false;
    g.itens.push({id:'e'+uid(),nome,ca:String(fd.ca||'').trim().slice(0,30),caVal:'',troca:fd.troca?String(Math.max(0,Math.round(+fd.troca)||0)):'',tam:''});save();render();toast('EPI adicionado. Marque se é do kit básico ou de alguma função.')})},
  epiRm:b=>{const g=epiMaterializar();const x=g.itens[+b.dataset.i];if(!x)return;
    modalD(`Remover ${esc(x.nome)} do catálogo?`,'<p class="full" style="margin:0">O item sai do kit básico, das funções e das obras. As entregas já registradas continuam no histórico de cada colaborador.</p>','Remover EPI',()=>{
      g.itens=g.itens.filter(y=>y.id!==x.id);g.basico=(g.basico||[]).filter(id=>id!==x.id);for(const k of ['funcoes','obras'])for(const l of Object.values(g[k]||{})){const j=l.indexOf(x.id);if(j>=0)l.splice(j,1)}
      save();render()})},
  epiRevisado:()=>{const g=epiMaterializar();g.revisado={por:autorAtual().nome,em:hoje};g.desde??=hoje;save();render();toast('Catálogo marcado como revisado. Kits incompletos de quem for admitido a partir de hoje passam a gerar alerta.')},
  epiEntregar:b=>{const c=C(b.dataset.id);if(!c)return;const sel=[...document.querySelectorAll('#layer .epi-sel:checked')].map(x=>x.value);
    if(!sel.length)return toast('Marque os itens entregues.',true);const data=document.getElementById('epi-dt-'+c.id)?.value||hoje;if(data>hoje)return toast('A data da entrega não pode ser futura.',true);
    const itens=sel.map(epiItem).filter(Boolean);(c.epi??=[]);
    itens.forEach(it=>c.epi.push({data,item:it.nome,ca:it.ca||'',qtd:'1',epiId:it.id}));
    c.historico.push({data,tipo:'Entrega de EPI',texto:`Kit de EPI: ${itens.map(it=>it.nome+(it.ca?` (CA ${it.ca})`:'')).join(', ')}.`,autor:perfilNome()});
    save();render();toast(`${itens.length} entrega(s) registrada(s). Imprima a ficha de EPI para assinatura.`)},
  epiFicha:b=>{const c=C(b.dataset.id);if(!c)return;const url=URL.createObjectURL(new Blob([epiFichaHtml(c)],{type:'text/html'}));const w=window.open(url,'_blank');
    if(!w){URL.revokeObjectURL(url);return toast('Permita janelas novas (pop-up) para imprimir a ficha.',true)}
    w.addEventListener?.('load',()=>{try{w.print()}catch(e){}});setTimeout(()=>URL.revokeObjectURL(url),60000)},
});
Object.assign(ACT_PERM,{epiAdd:'configurar',epiRm:'configurar',epiRevisado:'configurar',epiEntregar:'editarSST'});
Object.assign(CHG_PERM,{epiCampo:'configurar',epiKit:'configurar'});

/* ---------- relatório ---------- */
REL_META.epi={g:'Pessoal',d:'Kit de EPI por colaborador: itens pendentes e trocas vencidas ou próximas.',f:['obra','vinc']};
RELS.epi={nome:'Kit de EPI',cols:['Nome','Obra','Função','Itens no kit','Pendentes','Trocar','Última entrega'],
  rows:()=>DB.colabs.filter(c=>c.status!=='Desligado'&&fR(c)).sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>{const kit=kitEPI(c);const s=kit.map(k=>({k,s:epiSituacao(c,k)}));
    const ult=(c.epi||[]).map(e=>e.data).sort().pop();
    return [c.nome,nomeObra(c.obraId),F(c.funcaoId)?.nome||'',kit.length,s.filter(x=>x.s.sit==='pendente').map(x=>x.k.item.nome).join(', ')||'—',s.filter(x=>x.s.sit==='trocar'||x.s.sit==='troca-proxima').map(x=>`${x.k.item.nome} (${fmt(x.s.troca)})`).join(', ')||'—',ult?fmt(ult):'—']})};
