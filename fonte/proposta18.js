
/* =====================================================================
   v18 · PROPOSTA DE EMPREGO
   - Montada a partir da requisição e da cidade de origem do candidato.
   - Salário único por função (tabela no registro restrito 'custos'); adicional da função.
   - Jornada, horas extras e regras do alojamento: padrão da empresa, com ajuste por obra.
   - Ajuda de custo por trecho conforme a distância; folga de campo pela regra da função.
   - PDF desenhado no navegador (A4), pronto para WhatsApp ou e-mail. Validade padrão de 3 dias.
   - Resposta registrada pelo RH: recusa com motivo; aceite cria a admissão já preenchida.
   Valores ficam no registro 'proposta' (servidor: RH e Diretoria; Adm. da obra só lê).
   O candidato guarda só a situação da proposta, sem valores.
   ===================================================================== */
PERM_DEF.push(['fazerProposta','Montar, enviar e registrar propostas de emprego','Editar',['rh']],['aprovarPropostaDir','Aprovar proposta com ajuda de custo acima do teto','Aprovar',['dir']]);
V18_PERM.aprovarPropostaDir=['dir'];
/* ajuda por folga acima do teto (Configurações › Viagens e folgas) precisa da Diretoria antes do envio */
const propPrecisaDir=p=>p.regime==='Alojado'&&2*(+p.valorTrecho||0)>tetoAjuda();
const propAguardaDir=p=>p&&p.status==='Rascunho'&&p.precisaDir&&!p.aprovDir;
TIPO_COL.propostas='proposta';
const PROP_PAD={jornada:'Segunda a quinta, das 7h às 17h; sexta, das 7h às 16h.',he:'Podem ocorrer trabalhos aos sábados, domingos e feriados, com horas extras: 60% aos sábados e nas horas além da jornada; 100% aos domingos e feriados.',
  regras:'No alojamento é proibido bebida alcoólica, entrada de terceiros e som alto.',contato:'rh@ntnengenharia.com.br',validade:3};
const propCfg=()=>({...PROP_PAD,...(custos().prop||{})});
const ADICIONAIS=['Nenhum','Periculosidade 30%','Insalubridade 10%','Insalubridade 20%','Insalubridade 40%'];
const adicPct=a=>({'Periculosidade 30%':.3,'Insalubridade 10%':.1,'Insalubridade 20%':.2,'Insalubridade 40%':.4})[a]||0;
const salFuncao=fid=>{const s=custos().salarios?.[fid];return s&&+s.sal>0?{sal:+s.sal,adic:ADICIONAIS.includes(s.adic)?s.adic:'Nenhum'}:null};
const CONTRATOS=['Experiência 45+45','Experiência 30+60','Experiência 90','Indeterminado','Prazo determinado (obra)'];
const MOTIVOS_RECUSA=['Salário','Distância','Outra oferta','Condições da obra ou do alojamento','Folga de campo','Sem resposta do candidato','Outro'];
const PROP=id=>(DB.propostas||[]).find(p=>p.id===id);
const propsCand=x=>(DB.propostas||[]).filter(p=>p.candId===x.id).sort((a,b)=>a.versao-b.versao);
function propSit(p){if(!p)return '';if(p.status==='Enviada'&&p.validade&&p.validade<hoje)return 'Vencida sem resposta';return p.status}
const propPill=s=>pillS(s,s==='Aceita'?'good':s==='Recusada'||s==='Vencida sem resposta'?'crit':s==='Enviada'?'info':'plain');
const podeProp=()=>pode('fazerProposta')&&podeEditarCusto();

/* benefícios que entram na proposta (valores da tabela de benefícios, pelo regime) */
function benProp(regime){return (DB.cfg.beneficios||[]).map(b=>({nome:b.nome,unid:b.unid,valor:+(regime==='Alojado'?b.alojado:b.local)||0})).filter(b=>b.valor>0&&!/^ajuda de custo$/i.test(b.nome))}
const benMes=b=>b.unid==='dia'?b.valor*(+DB.cfg.diasUteis||22):b.valor;
/* monta os números da proposta a partir da requisição, do candidato e do que o RH escolheu */
function propCalcular(r,d){const fn=F(r.funcaoId);const s=salFuncao(r.funcaoId);const o=O(r.obraId);const pc=propCfg();
  const regime=r.regime||'Alojado';const v=viagem(d.origem,obraMun(r.obraId));const g=grupoFuncao(r.funcaoId);const fp=folgaPad()[g];
  const ben=(d.ben||benProp(regime));const adicV=s?Math.round(s.sal*adicPct(s.adic)*100)/100:0;
  const ajudaMes=regime==='Alojado'&&v?2*v.valorTrecho*30/fp.ciclo:0;const enc=+custos().encargos||0;
  const custo=s?Math.round((s.sal+adicV)*(1+enc/100)+ben.reduce((t,b)=>t+benMes(b),0)+ajudaMes):null;
  return {funcaoId:r.funcaoId,funcao:fn?.nome||'',obraId:r.obraId,obra:o?.nome||'',obraMun:obraMun(r.obraId)?munRef(obraMun(r.obraId)):null,regime,
    salario:s?.sal??null,adic:s?.adic||'Nenhum',adicValor:adicV,jornada:obraCfg(r.obraId).jornada||pc.jornada,he:pc.he,regras:regime==='Alojado'?(obraCfg(r.obraId).regrasAloj||pc.regras):'',
    beneficios:ben,outrosBen:d.outrosBen||'',grupo:g,folgaCiclo:regime==='Alojado'?fp.ciclo:0,folgaDias:regime==='Alojado'?fp.dias:0,
    origem:d.origem?munRef(d.origem):null,natal:d.natal?munRef(d.natal):null,km:v?.km??null,faixa:v?.faixa||'',valorTrecho:regime==='Alojado'&&v?v.valorTrecho:0,
    ajudaForma:d.ajudaForma||'Ajuda de custo em dinheiro',contrato:d.contrato||CONTRATOS[0],apres:{data:d.apresData||'',local:d.apresLocal||''},obs:d.obs||'',
    encargos:enc,custoMensal:custo,contato:pc.contato}}
function propFaltas(r){const f=[];if(!salFuncao(r.funcaoId))f.push(`salário da função ${F(r.funcaoId)?.nome||''} (Configurações › Proposta)`);if(!obraMun(r.obraId))f.push(`cidade da obra ${nomeObra(r.obraId)} (Configurações › Viagens e folgas)`);return f}

/* ---------- candidato: quadro da proposta ---------- */
function propQuadro(x){const r=R(x.reqId);if(!r)return '';const ps=propsCand(x);const ult=ps[ps.length-1]||null;const vc=podeVerCusto()&&DB.propostas;
  const fim=['Aprovado','Reprovado','Desistiu'].includes(x.etapa);const ed=podeProp()&&!fim&&reqAprovada(r);const id=esc(x.id);
  const st=ult?propSit(ult):x.prop?(x.prop.status==='Enviada'&&x.prop.validade<hoje?'Vencida sem resposta':x.prop.status):'';
  let h=`<div class="sec-t full">Proposta de emprego</div><div class="full">`;
  if(!ult&&!x.prop)h+=`<p class="muted" style="margin:0 0 8px">Nenhuma proposta montada.</p>`;
  else h+=`<div class="facts" style="margin-bottom:8px"><div><span>Situação</span><b>${propPill(st)}</b></div><div><span>Versão</span><b>${esc(String(ult?ult.versao:x.prop.versao))}</b></div>${(ult?.enviada||x.prop?.enviada)?`<div><span>Enviada em</span><b class="num">${fmtE(ult?.enviada||x.prop.enviada)}</b><small class="muted" style="display:block">válida até ${fmtE(ult?.validade||x.prop.validade)}</small></div>`:''}
    ${vc&&ult?`<div><span>Salário</span><b class="num">${brl(ult.salario)}${ult.adicValor?` + ${esc(ult.adic.toLowerCase())}`:''}</b></div><div><span>Origem</span><b>${esc(munTxt(ult.origem))}</b><small class="muted" style="display:block">${ult.km!=null?ult.km.toLocaleString('pt-BR')+' km · '+esc(ult.faixa):''}</small></div><div><span>Ajuda por folga</span><b class="num">${ult.regime==='Alojado'?brl(2*ult.valorTrecho):'—'}</b></div><div><span>Custo mensal estimado</span><b class="num">${ult.custoMensal!=null?brl(ult.custoMensal):'—'}</b><small class="muted" style="display:block">${ult.encargos?`com ${ult.encargos}% de encargos`:'sem encargos (informe em Configurações › Proposta)'}</small></div>`:''}
    ${ult?.resposta?`<div><span>Resposta</span><b>${esc(ult.resposta.tipo)} em ${fmtE(ult.resposta.data)}</b><small class="muted" style="display:block">${esc(ult.resposta.como||'')}${ult.resposta.motivo?' · '+esc(ult.resposta.motivo):''}</small></div>`:''}</div>`;
  const falt=propFaltas(r);
  const aguarda=ult?propAguardaDir(ult):!!x.prop?.aguardaDir;
  if(aguarda)h+=`<div class="banner" style="margin:0 0 8px">${vc&&ult?`Ajuda por folga de ${brl(2*ult.valorTrecho)}, acima do teto de ${brl(tetoAjuda())}.`:'Ajuda de custo acima do teto.'} A Diretoria precisa aprovar antes do envio.${ult&&pode('aprovarPropostaDir')&&podeEditarCusto()?` <button type="button" class="btn small primary" data-act="propAprovDir" data-p="${esc(ult.id)}">Aprovar proposta</button>`:''}</div>`;
  if(ult?.aprovDir)h+=`<p class="muted" style="margin:0 0 8px">Aprovada pela Diretoria: ${esc(ult.aprovDir.por)} em ${fmtE(ult.aprovDir.em)}.</p>`;
  if(ed){const bts=[];
    if(!ult||['Recusada','Substituída'].includes(ult.status)||propSit(ult)==='Vencida sem resposta')bts.push(`<button type="button" class="btn primary" data-act="propMontar" data-id="${id}" ${falt.length?'disabled':''}>${ult?'Montar nova versão':'Montar proposta'}</button>`);
    if(ult&&['Rascunho','Enviada'].includes(ult.status)){bts.push(`<button type="button" class="btn ${ult.status==='Rascunho'?'primary':''}" data-act="propPdf" data-p="${esc(ult.id)}">Baixar PDF</button>`);
      if(ult.status==='Rascunho')bts.push(propAguardaDir(ult)?'':`<button type="button" class="btn" data-act="propEnviada" data-p="${esc(ult.id)}">Registrar envio</button>`,`<button type="button" class="btn ghost" data-act="propMontar" data-id="${id}">Refazer</button>`);
      else bts.push(propSit(ult)==='Vencida sem resposta'?`<button type="button" class="btn primary" data-act="propEnviada" data-p="${esc(ult.id)}">Registrar novo envio</button>`:`<button type="button" class="btn primary" data-act="propResposta" data-p="${esc(ult.id)}">Registrar resposta</button>`,`<button type="button" class="btn ghost" data-act="propMontar" data-id="${id}">Nova versão</button>`)}
    else if(ult&&vc)bts.push(`<button type="button" class="btn ghost" data-act="propPdf" data-p="${esc(ult.id)}">Baixar PDF</button>`);
    h+=`<div class="actions" style="gap:8px;flex-wrap:wrap">${bts.join('')}</div>${falt.length&&(!ult||ult.status!=='Enviada')?`<p class="note" style="margin:8px 0 0">Para montar a proposta, falta cadastrar: ${falt.map(esc).join('; ')}.</p>`:''}`}
  else if(vc&&ult)h+=`<div class="actions"><button type="button" class="btn ghost" data-act="propPdf" data-p="${esc(ult.id)}">Baixar PDF</button></div>`;
  if(vc&&ps.length>1)h+=`<details class="arq-hist" style="margin-top:8px"><summary>Versões anteriores (${ps.length-1})</summary><ul>${ps.slice(0,-1).reverse().map(p=>`<li>Versão ${p.versao} · ${esc(propSit(p))} · ${fmtE(p.criada)}${p.resposta?.motivo?' · '+esc(p.resposta.motivo):''}</li>`).join('')}</ul></details>`;
  return h+'</div>'}
const abrirCandV17=abrirCand;
abrirCand=function(id){const r0=abrirCandV17.apply(this,arguments);
  try{const x=CAND(id);const bd=document.querySelector('#layer .modal .bd');if(!x||!bd)return r0;
    const ap=bd.querySelector('[data-act="candAprovar"]');if(ap){ap.textContent='Aprovar sem proposta registrada';ap.classList.remove('primary');ap.classList.add('ghost')}
    const acoes=ap?.closest('.actions');const q=propQuadro(x);if(acoes)acoes.insertAdjacentHTML('beforebegin',q);else{const tl=bd.querySelector('.timeline');if(tl)tl.insertAdjacentHTML('beforebegin',q);else bd.insertAdjacentHTML('beforeend',q)}}catch(e){console.error('v18 proposta',e)}
  return r0};

/* ---------- montar ---------- */
function propForm(x,r,ant){const o=O(r.obraId);const regime=r.regime||'Alojado';const bens=benProp(regime);const antB=ant?new Set(ant.beneficios.map(b=>b.nome)):null;
  const orig=ant?.origem||(MUN.lista&&x.cidade?munAchar(x.cidade):null);
  return `<div class="field full"><label for="pr-o">Cidade de origem do candidato</label>${munCampo('pr-o',orig,'name="origem" data-prop="1" required')}</div>
    <div class="field full"><label for="pr-n">Cidade natal (opcional)</label>${munCampo('pr-n',ant?.natal,'name="natal"')}</div>
    ${fld('Data de apresentação','apresData',ant?.apres?.data||r.inicio||'','date')}
    <div class="field"><label for="pr-l">Local de apresentação</label><input class="inp" id="pr-l" name="apresLocal" maxlength="200" value="${esc(ant?.apres?.local||`${/^obra\b/i.test(o?.nome||'')?'':'Obra '}${o?.nome||''}${obraMun(r.obraId)?' · '+munTxt(obraMun(r.obraId)):''}`)}"></div>
    ${fld('Contrato','contrato',ant?.contrato||CONTRATOS[0],'',CONTRATOS)}
    ${regime==='Alojado'?fld('Ajuda de custo','ajudaForma',ant?.ajudaForma||'Ajuda de custo em dinheiro','',['Ajuda de custo em dinheiro','Passagem comprada pela NTN']):''}
    <div class="sec-t full">Benefícios na proposta</div>
    <div class="full chkgrid">${bens.map((b,i)=>`<label><input type="checkbox" name="ben.${i}" ${!antB||antB.has(b.nome)?'checked':''} data-prop="1">${esc(b.nome)} · ${brl(b.valor)}/${esc(b.unid)}</label>`).join('')||'<span class="muted">Nenhum benefício com valor para o regime '+esc(regime)+' em Configurações › Benefícios.</span>'}</div>
    <div class="field full"><label for="pr-ob">Outros benefícios (opcional)</label><input class="inp" id="pr-ob" name="outrosBen" maxlength="200" value="${esc(ant?.outrosBen||'')}" placeholder="Ex.: almoço na obra"></div>
    <div class="field full"><label for="pr-obs">Observação na proposta (opcional)</label><textarea class="inp" id="pr-obs" name="obs" rows="2" maxlength="500">${esc(ant?.obs||'')}</textarea></div>
    <div class="full" id="propPrev" aria-live="polite"></div>`}
function propLer(f,r){const g=n=>f.querySelector(`[name="${n}"]`)?.value||'';const regime=r.regime||'Alojado';const bens=benProp(regime);
  return {origem:munAchar(g('origem')),origemTxt:g('origem').trim(),natal:g('natal').trim()?munAchar(g('natal')):null,natalTxt:g('natal').trim(),apresData:g('apresData'),apresLocal:g('apresLocal').trim().slice(0,200),contrato:CONTRATOS.includes(g('contrato'))?g('contrato'):CONTRATOS[0],
    ajudaForma:g('ajudaForma')||'Ajuda de custo em dinheiro',ben:bens.filter((b,i)=>f.querySelector(`[name="ben.${i}"]`)?.checked),outrosBen:g('outrosBen').trim().slice(0,200),obs:g('obs').trim().slice(0,500)}}
function propErros(d){const e=[];if(!d.origem)e.push(d.origemTxt?'Cidade de origem: escolha uma cidade da lista (cidade / UF).':'Informe a cidade de origem do candidato.');if(d.natalTxt&&!d.natal)e.push('Cidade natal: escolha uma cidade da lista (cidade / UF).');
  if(!d.apresData)e.push('Informe a data de apresentação.');else if(d.apresData<hoje)e.push('A data de apresentação já passou.');if(!d.apresLocal)e.push('Informe o local de apresentação.');return e}
function propPreviaHtml(){const f=document.querySelector('#layer .modal form');const box=document.getElementById('propPrev');if(!f||!box)return;const x=CAND(f.dataset.propCand);const r=x&&R(x.reqId);if(!r)return;
  const d=propLer(f,r);const p=propCalcular(r,d);const err=propErros(d);
  box.innerHTML=`<div class="note" style="margin:0"><b>${esc(p.funcao)}</b> · ${esc(p.obra)} · salário ${brl(p.salario)}${p.adicValor?` + ${esc(p.adic.toLowerCase())} (${brl(p.adicValor)})`:''}
    ${p.regime==='Alojado'?`<br>Folga de campo: ${p.folgaDias} dias úteis a cada ${p.folgaCiclo} dias (mão de obra ${p.grupo}).`:''}
    ${p.regime==='Alojado'?(p.km!=null?`<br>${esc(munTxt(p.origem))} → ${esc(munTxt(p.obraMun))}: ${p.km.toLocaleString('pt-BR')} km (${esc(p.faixa)}). Ida ${brl(p.valorTrecho)} · cada folga ${brl(2*p.valorTrecho)} · volta ${brl(p.valorTrecho)}.`:'<br>Escolha a cidade de origem para calcular a ajuda de custo.'):''}
    <br>Custo mensal estimado para a NTN: <b>${p.custoMensal!=null?brl(p.custoMensal):'—'}</b>${p.encargos?'':' (sem encargos)'}. Não aparece no PDF.</div>
    ${err.length?`<div class="banner" style="margin-top:8px">${err.map(esc).join('<br>')}</div>`:''}`}
document.addEventListener('input',e=>{if(e.target.closest?.('#layer .modal form[data-prop-cand]'))propPreviaHtml()});
document.addEventListener('change',e=>{if(e.target.closest?.('#layer .modal form[data-prop-cand]'))propPreviaHtml()});
function propMontar(x){const r=R(x.reqId);if(!r)return toast('Requisição não encontrada.',true);const falt=propFaltas(r);if(falt.length)return toast('Falta cadastrar: '+falt.join('; ')+'.',true);
  if(!reqAprovada(r))return toast('A requisição ainda não foi aprovada.',true);
  munCarregar().then(()=>{const ps=propsCand(x);const ant=ps[ps.length-1]||null;
    modal(`Proposta · ${esc(x.nome)} · ${esc(F(r.funcaoId)?.nome||'')}`,propForm(x,r,ant),'Salvar proposta',fd=>{
      const f=document.querySelector('#layer .modal form');const d=propLer(f,r);const err=propErros(d);if(err.length){propPreviaHtml();toast(err[0],true);return false}
      const calc=propCalcular(r,d);DB.propostas??=[];
      if(ant&&ant.status==='Rascunho'){Object.assign(ant,calc,{alterada:hoje,precisaDir:propPrecisaDir(calc),aprovDir:null});(ant.hist??=[]).push({data:hoje,autor:perfilNome(),texto:'Rascunho refeito.'});propEspelho(x,ant)}
      else{if(ant&&['Enviada'].includes(ant.status)){ant.status='Substituída';ant.hist.push({data:hoje,autor:perfilNome(),texto:'Substituída por nova versão.'})}
        const p={id:uid(),reqId:r.id,candId:x.id,candNome:x.nome,num:r.num,versao:(ant?.versao||0)+1,status:'Rascunho',criada:hoje,por:perfilNome(),...calc,precisaDir:propPrecisaDir(calc),aprovDir:null,hist:[{data:hoje,autor:perfilNome(),texto:'Proposta montada.'}]};
        DB.propostas.push(p);propEspelho(x,p)}
      x.hist.push({data:hoje,autor:perfilNome(),texto:`Proposta ${ant&&ant.status!=='Rascunho'?'(nova versão) ':''}montada.`});
      save();closeModal();render();setTimeout(()=>abrirCand(x.id),0);toast('Proposta salva. Baixe o PDF e envie ao candidato.');return false},true);
    const f=document.querySelector('#layer .modal form');if(f){f.dataset.propCand=x.id;f.dataset.rasc=''}setTimeout(propPreviaHtml,0)}).catch(()=>toast(MUN.erro,true))}
function propEspelho(x,p){x.prop={id:p.id,versao:p.versao,status:p.status,aguardaDir:!!propAguardaDir(p),enviada:p.enviada||'',validade:p.validade||'',resposta:p.resposta?{tipo:p.resposta.tipo,data:p.resposta.data}:null}}

/* ---------- PDF (desenhado em tela, A4 a 200 ppp) ---------- */
function propImg(src){return new Promise(ok=>{if(!src)return ok(null);const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src})}
async function propPdf(p){const W=1654,H=2339,M=140;const FON='"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';const VERDE='#7AA215',LIMA='#ADD91C',TINTA='#1C1E17',CINZA='#5B5F55';
  const lg=custos().logo;const logo=await propImg(typeof lg==='string'&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(lg)&&lg.length<200000?lg:null);const pags=[];let ctx,y;
  const rod=()=>{ctx.fillStyle=CINZA;ctx.font=`24px ${FON}`;ctx.textBaseline='alphabetic';ctx.fillText(`NTN Engenharia · ${p.contato||''}`,M,H-70);const t=`${p.num||''} · versão ${p.versao} · página ${pags.length}`;ctx.fillText(t,W-M-ctx.measureText(t).width,H-70)};
  const nova=()=>{const cv=document.createElement('canvas');cv.width=W;cv.height=H;ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);pags.push(cv);ctx.fillStyle=LIMA;ctx.fillRect(0,0,W,18);y=M;rod()};
  const linhas=(txt,larg,font)=>{ctx.font=font;const out=[];for(const par of String(txt??'').split('\n')){let l='';for(const w of par.split(/\s+/).filter(Boolean)){const t=l?l+' '+w:w;if(ctx.measureText(t).width>larg&&l){out.push(l);l=w}else l=t}out.push(l)}return out};
  const cabe=h=>{if(y+h>H-M-40)nova()};
  const texto=(txt,{size=30,peso=400,cor=TINTA,x=M,larg=W-2*M,lh=1.45,depois=10}={})=>{const font=`${peso} ${size}px ${FON}`;const ls=linhas(txt,larg,font);for(const l of ls){cabe(size*lh);ctx.font=font;ctx.fillStyle=cor;ctx.fillText(l,x,y+size);y+=size*lh}y+=depois};
  const LBL=420;
  const item=(rot,val)=>{if(val==null||val==='')return;const ls=linhas(val,W-2*M-LBL,`400 30px ${FON}`);const lr=linhas(rot,LBL-30,`600 26px ${FON}`);const h=Math.max(ls.length*43.5,lr.length*38)+18;cabe(h);
    ctx.font=`600 26px ${FON}`;ctx.fillStyle=CINZA;lr.forEach((l,i)=>ctx.fillText(l,M,y+28+i*38));ctx.font=`400 30px ${FON}`;ctx.fillStyle=TINTA;ls.forEach((l,i)=>ctx.fillText(l,M+LBL,y+30+i*43.5));
    y+=h;ctx.strokeStyle='#E3E5DC';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(M,y-8);ctx.lineTo(W-M,y-8);ctx.stroke()};
  const secao=t=>{cabe(110);y+=24;ctx.fillStyle=VERDE;ctx.fillRect(M,y+6,10,40);ctx.font=`700 36px ${FON}`;ctx.fillStyle=TINTA;ctx.fillText(t,M+26,y+40);y+=72};
  nova();
  /* cabeçalho */
  if(logo){const k=Math.min(420/logo.width,140/logo.height);ctx.drawImage(logo,M,y,logo.width*k,logo.height*k)}else{ctx.font=`800 64px ${FON}`;ctx.fillStyle=TINTA;ctx.fillText('NTN',M,y+60);ctx.font=`600 30px ${FON}`;ctx.fillStyle=VERDE;ctx.fillText('ENGENHARIA',M,y+100)}
  ctx.textAlign='right';ctx.font=`700 46px ${FON}`;ctx.fillStyle=TINTA;ctx.fillText('Proposta de emprego',W-M,y+50);ctx.font=`400 28px ${FON}`;ctx.fillStyle=CINZA;ctx.fillText(`Emitida em ${fmtE(p.criada)}${p.validade?` · válida até ${fmtE(p.validade)}`:''}`,W-M,y+96);ctx.textAlign='left';
  y+=170;
  texto(`Olá, ${String(p.candNome||'').split(' ')[0]}.`,{size:34,peso:600,depois:6});
  texto(`A NTN Engenharia tem o prazer de apresentar esta proposta para a função de ${p.funcao}, na obra ${p.obra}${p.obraMun?`, em ${munTxt(p.obraMun).replace(' / ','/')}`:''}. Confira as condições abaixo.`,{depois:8});
  secao('A vaga');
  item('Função',p.funcao);item('Obra',`${p.obra}${p.obraMun?' · '+munTxt(p.obraMun).replace(' / ','/'):''}`);
  item('Apresentação',`${p.apres.data?fmtDSE(p.apres.data):''}${p.apres.local?' · '+p.apres.local:''}`);item('Contrato',`CLT · ${p.contrato}`);
  secao('Remuneração e jornada');
  item('Salário',`${brl(p.salario)} por mês${p.adicValor?` + ${p.adic.toLowerCase()} (${brl(p.adicValor)})`:''}`);item('Jornada',p.jornada);item('Horas extras',p.he);
  secao('Benefícios');
  p.beneficios.forEach(b=>item(b.nome,`${brl(b.valor)} por ${b.unid}`));if(p.outrosBen)item('Também',p.outrosBen);if(!p.beneficios.length&&!p.outrosBen)item('Benefícios','Conforme a política da empresa.');
  if(p.regime==='Alojado'){secao('Alojamento, folga e viagens');
    item('Regime','Alojado: a NTN fornece o alojamento.');if(p.regras)item('Regras do alojamento',p.regras);
    item('Folga de campo',`${p.folgaDias} dias úteis (segunda a sexta) a cada ${p.folgaCiclo} dias, contados da chegada na obra. Os dias de viagem estão dentro desse período: saída no sábado e retorno na segunda-feira.`);
    const forma=p.ajudaForma==='Passagem comprada pela NTN'?'A NTN compra a passagem no valor de referência abaixo.':'Valor pago como ajuda de custo; a passagem é comprada pelo colaborador.';
    item('Ajuda de custo',`Ida para a obra: ${brl(p.valorTrecho)}. A cada folga: ${brl(2*p.valorTrecho)} (ida e volta). Volta ao fim do contrato: ${brl(p.valorTrecho)}, não paga em pedido de demissão nem em justa causa. ${forma}`);
    if(p.origem)item('Trajeto considerado',`${munTxt(p.origem).replace(' / ','/')} → ${munTxt(p.obraMun).replace(' / ','/')} (cerca de ${p.km.toLocaleString('pt-BR')} km)`)}
  secao('Admissão');
  item('Documentos',(DB.cfg.docs||[]).join(', ')+'.');item('Exames','Exame admissional (ASO) e treinamentos obrigatórios da função, agendados pela NTN antes do início.');
  if(p.obs){secao('Observação');texto(p.obs)}
  secao('Aceite');
  texto(`Esta proposta é válida até ${p.validade?fmtE(p.validade):`${propCfg().validade} dias após o envio`}. Para aceitar, responda pelo mesmo canal em que recebeu ou assine abaixo.`,{depois:30});
  cabe(260);ctx.strokeStyle=TINTA;ctx.lineWidth=2;[[M,(W-2*M)*0.58],[M+(W-2*M)*0.66,(W-2*M)*0.34]].forEach(([x0,w])=>{ctx.beginPath();ctx.moveTo(x0,y+120);ctx.lineTo(x0+w,y+120);ctx.stroke()});
  ctx.font=`400 26px ${FON}`;ctx.fillStyle=CINZA;ctx.fillText(`${p.candNome} · li e aceito esta proposta`,M,y+160);ctx.fillText('Data',M+(W-2*M)*0.66,y+160);y+=200;
  const out=[];for(const cv of pags){const b=await new Promise(ok=>cv.toBlob(ok,'image/jpeg',0.9));out.push({jpg:new Uint8Array(await b.arrayBuffer()),w:cv.width,h:cv.height})}
  return new File([fotoPdf(out)],nomeSeguro(`Proposta NTN - ${p.candNome} - ${p.funcao} - v${p.versao}`)+'.pdf',{type:'application/pdf'})}
async function propBaixar(p){try{const f=await propPdf(p);
    if(matchMedia('(pointer: coarse)').matches&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:f.name});return}catch(e){if(e&&e.name==='AbortError')return}}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
  catch(e){console.error('v18 pdf',e);toast('Não foi possível gerar o PDF. Tente de novo.',true)}}

/* ---------- envio, resposta ---------- */
Object.assign(ACT,{
  propAprovDir:b=>{const p=PROP(b.dataset.p);const x=p&&CAND(p.candId);if(!p||!x||!propAguardaDir(p)||!podeEditarCusto())return;
    modal('Aprovar proposta (Diretoria)',`<p class="full" style="margin:0">${esc(p.candNome)} · ${esc(p.funcao)} · ${esc(p.obra)}. Ajuda por folga de ${brl(2*p.valorTrecho)} (${esc(munTxt(p.origem))}, ${esc(String(p.km))} km), acima do teto de ${brl(tetoAjuda())}.</p><div class="field full"><label for="pr-ad">Observação (opcional)</label><input class="inp" id="pr-ad" name="obs" maxlength="200"></div>`,'Aprovar proposta',fd=>{
      if(!propAguardaDir(p))return toast('A proposta mudou. Atualize a tela.',true),false;p.aprovDir={por:perfilNome(),em:hoje,obs:String(fd.obs||'').slice(0,200)};
      p.hist.push({data:hoje,autor:perfilNome(),texto:'Aprovada pela Diretoria (ajuda de custo acima do teto).'+(p.aprovDir.obs?' '+p.aprovDir.obs:'')});x.hist.push({data:hoje,autor:perfilNome(),texto:'Proposta aprovada pela Diretoria.'});
      propEspelho(x,p);save();closeModal();render();setTimeout(()=>abrirCand(x.id),0);toast('Proposta aprovada. O RH já pode enviar.');return false})},
  propMontar:b=>{const x=CAND(b.dataset.id);if(x)propMontar(x)},
  propPdf:b=>{const p=PROP(b.dataset.p);if(!p)return toast('Proposta não encontrada.',true);toast('Gerando o PDF…');propBaixar(p)},
  propEnviada:b=>{const p=PROP(b.dataset.p);const x=p&&CAND(p.candId);if(!p||!x||!(p.status==='Rascunho'||propSit(p)==='Vencida sem resposta'))return;if(propAguardaDir(p))return toast('A ajuda de custo passa do teto: a Diretoria precisa aprovar antes do envio.',true);const val=propCfg().validade;
    modal('Registrar envio da proposta',`${fld('Data do envio','data',hoje,'date')}${fld('Enviada por','como','WhatsApp','',['WhatsApp','E-mail','Pessoalmente','Outro'])}<p class="note full" style="margin:0">A proposta fica válida por ${val} dias a partir do envio. Sem resposta até lá, aparece um alerta.</p>`,'Registrar envio',fd=>{
      if(!fd.data||fd.data>hoje)return toast('Informe uma data até hoje.',true),false;if(!(p.status==='Rascunho'||propSit(p)==='Vencida sem resposta'))return toast('A proposta mudou enquanto a tela estava aberta. Atualize.',true),false;p.status='Enviada';p.enviada=fd.data;p.validade=addD(fd.data,val);p.enviadaPor=fd.como;
      p.hist.push({data:hoje,autor:perfilNome(),texto:`Enviada por ${fd.como.toLowerCase()} em ${fmtE(fd.data)}; válida até ${fmtE(p.validade)}.`});x.hist.push({data:hoje,autor:perfilNome(),texto:`Proposta enviada (${fd.como.toLowerCase()}), válida até ${fmtE(p.validade)}.`});
      propEspelho(x,p);save();closeModal();render();setTimeout(()=>abrirCand(x.id),0);return false})},
  propResposta:b=>{const p=PROP(b.dataset.p);const x=p&&CAND(p.candId);if(!p||!x||p.status!=='Enviada')return;if(propSit(p)==='Vencida sem resposta')return toast('A proposta venceu. Registre um novo envio (nova validade) ou monte uma nova versão.',true);
    const u={camisa:'',calca:'',botina:''};
    modal(`Resposta de ${esc(x.nome)}`,`<div class="field full"><label for="pr-rt">Resposta</label><select class="inp" id="pr-rt" name="tipo" data-prop-resp="1"><option>Aceita</option><option>Recusada</option></select></div>
      ${fld('Data da resposta','data',hoje,'date')}${fld('Como chegou','como','WhatsApp','',['WhatsApp','E-mail','Assinada em papel','Pessoalmente','Telefone'])}
      <div class="full" data-bloco="Aceita"><div class="sec-t">Tamanhos (para separar uniforme e EPI)</div><div class="form">${fld('Camisa','camisa',u.camisa,'',['','PP','P','M','G','GG','XG','XGG'])}${fld('Calça','calca','','',['','36','38','40','42','44','46','48','50','52','54'])}${fld('Botina','botina','','',['','34','35','36','37','38','39','40','41','42','43','44','45','46','47','48'])}</div>
        <p class="note" style="margin:8px 0 0">Ao registrar o aceite, o sistema cria a admissão com função, obra, salário, benefícios, cidades, contrato, folga e data de apresentação.</p></div>
      <div class="full" data-bloco="Recusada" hidden>${fld('Motivo','motivo','Salário','',MOTIVOS_RECUSA)}<div class="field"><label for="pr-ro">Detalhe (opcional)</label><input class="inp" id="pr-ro" name="det" maxlength="200"></div>
        <label class="full" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" name="encerrar"> Encerrar a seleção deste candidato</label></div>`,'Registrar resposta',fd=>{
      if(!fd.data||fd.data>hoje)return toast('Informe uma data até hoje.',true),false;
      if(p.status!=='Enviada'||propSit(p)!=='Enviada'||x.colabId)return toast('A proposta mudou enquanto a tela estava aberta. Atualize a tela.',true),false;
      if(fd.tipo==='Aceita'){const err=candAprovar(x);if(err)return toast(err,true),false;const c=C(x.colabId);if(!c)return toast('A admissão não foi criada. Atualize a tela e tente de novo.',true),false;
        {c.salario=p.salario;c.peric=/Periculosidade/.test(p.adic);c.insal=/Insalubridade/.test(p.adic)?({'Insalubridade 10%':'10% (mínimo)','Insalubridade 20%':'20% (médio)','Insalubridade 40%':'40% (máximo)'})[p.adic]:'Não';
          c.tipoContrato=p.contrato;c.previsaoInicio=p.apres.data;c.regime=p.regime;c.cidades={origem:p.origem,natal:p.natal};c.propostaId=p.id;
          c.uniforme={...(c.uniforme||{}),...(fd.camisa?{camisa:fd.camisa}:{}),...(fd.calca?{calca:fd.calca}:{}),...(fd.botina?{botina:fd.botina}:{})};
          c.beneficios=p.beneficios.filter(b=>benCfg(b.nome)).map(b=>({nome:b.nome,valor:null,obs:'Proposta '+p.num+' v'+p.versao}));
          if(p.regime==='Alojado')c.folgaV2={modo:'padrao',conf:{},puladas:{}};
          c.historico.push({data:fd.data,tipo:'Requisição',texto:`Proposta ${p.num} versão ${p.versao} aceita (${fd.como.toLowerCase()}). Apresentação em ${fmtE(p.apres.data)}.`,autor:perfilNome()})}
        p.status='Aceita';p.resposta={tipo:'Aceita',data:fd.data,como:fd.como,por:perfilNome()};p.colabId=x.colabId}
      else{const mot=MOTIVOS_RECUSA.includes(fd.motivo)?fd.motivo:'Outro';const det=String(fd.det||'').trim().slice(0,200);
        p.status='Recusada';p.resposta={tipo:'Recusada',data:fd.data,como:fd.como,motivo:mot+(det?': '+det:''),por:perfilNome()};
        if(fd.encerrar)candEncerrar(x,'Desistiu','Recusou a proposta',false)}
      p.hist.push({data:hoje,autor:perfilNome(),texto:`${p.resposta.tipo} em ${fmtE(fd.data)} (${fd.como.toLowerCase()})${p.resposta.motivo?': '+p.resposta.motivo:''}.`});
      x.hist.push({data:hoje,autor:perfilNome(),texto:`Proposta ${p.resposta.tipo.toLowerCase()}.`});
      propEspelho(x,p);syncMob('Proposta respondida');save();closeModal();render();toast(p.status==='Aceita'?`${x.nome.split(' ')[0]} aceitou: admissão criada. Complete dados pessoais e documentos.`:'Recusa registrada.');return false});
    setTimeout(()=>{const f=document.querySelector('#layer .modal form');if(f)f.dataset.rasc=''},0)},
});
document.addEventListener('change',e=>{const s=e.target;if(!s.dataset?.propResp)return;const f=s.closest('form');f.querySelectorAll('[data-bloco]').forEach(b=>{b.hidden=b.dataset.bloco!==s.value})});
Object.assign(ACT_PERM,{propAprovDir:'aprovarPropostaDir',propMontar:'fazerProposta',propEnviada:'fazerProposta',propResposta:'fazerProposta',propPdf:'verCustoViagem'});

/* ---------- alertas: proposta enviada sem resposta ---------- */
const alertasV17p=alertas;
alertas=function(){const l=alertasV17p();const extra=[];
  (DB.cands||[]).forEach(x=>{const pr=x.prop;const r0=pr&&R(x.reqId);if(pr&&pr.aguardaDir&&pr.status==='Rascunho'&&r0&&noEscopo(r0.obraId)){const a={c:null,req:r0,tipo:'Requisição',desc:`${r0.num} · proposta para ${x.nome}: aguarda aprovação da Diretoria (ajuda de custo acima do teto)`,data:hoje,resp:pessoasPerfil('dir')[0]};a.d=0;a.acao=true;a.vencido=false;extra.push(a)}
    if(!pr||pr.status!=='Enviada'||!pr.validade)return;const r=R(x.reqId);if(!r||!noEscopo(r.obraId)||['Aprovado','Reprovado','Desistiu'].includes(x.etapa))return;
    const venc=pr.validade<hoje;const a={c:null,req:r,tipo:'Requisição',desc:`${r.num} · proposta para ${x.nome}: ${venc?`venceu em ${fmtE(pr.validade)} sem resposta`:`aguardando resposta até ${fmtE(pr.validade)}`}`,data:pr.validade,resp:pessoasPerfil('rh')[0]};a.d=dias(a.data);a.acao=true;a.vencido=venc;extra.push(a)});
  return extra.length?l.concat(extra).sort((a,b)=>a.d-b.d):l};

/* ---------- relatório ---------- */
REL_META.propostas={g:'Pessoal',d:'Propostas de emprego por requisição: situação, salário, distância, ajuda de custo e motivo de recusa.',f:['obra'],p:'verCustoViagem'};
RELS.propostas={nome:'Propostas de emprego',cols:['Obra','Requisição','Candidato','Função','Versão','Situação','Salário','Origem','Distância (km)','Ajuda por folga','Custo mensal estimado','Motivo da recusa'],
  rows:()=>!podeVerCusto()?[]:(DB.propostas||[]).filter(p=>!UI.relObra||p.obraId===UI.relObra).map(p=>[nomeObra(p.obraId),p.num,p.candNome,p.funcao,p.versao,propSit(p),brl(p.salario),munTxt(p.origem)||'—',p.km??'—',p.regime==='Alojado'?brl(2*p.valorTrecho):'—',p.custoMensal!=null?brl(p.custoMensal):'—',p.resposta?.motivo||''])};

/* ---------- Configurações › Proposta ---------- */
function cfgProposta(){const vc=podeVerCusto();const ec=podeEditarCusto();const ed=ec;const dis=ec?'':'disabled';if(!vc)return `<section class="panel" style="grid-column:1/-1"><div class="panel-b"><p class="note" style="margin:0">Só RH, Diretoria e Adm. de obra veem a configuração da proposta.</p></div></section>`;const pc=propCfg();const g=custos();
  return `<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Textos padrão da proposta</h3><span class="sub">valem para todas as obras; jornada e regras do alojamento podem mudar por obra em Viagens e folgas</span></div>
    <div class="panel-b form">
      <div class="field full"><label for="pp-j">Jornada</label><input class="inp" id="pp-j" value="${esc(pc.jornada)}" data-chg="propTxt" data-f="jornada" maxlength="300" ${dis}></div>
      <div class="field full"><label for="pp-h">Horas extras</label><textarea class="inp" id="pp-h" rows="2" data-chg="propTxt" data-f="he" maxlength="400" ${dis}>${esc(pc.he)}</textarea></div>
      <div class="field full"><label for="pp-r">Regras do alojamento</label><input class="inp" id="pp-r" value="${esc(pc.regras)}" data-chg="propTxt" data-f="regras" maxlength="300" ${dis}></div>
      <div class="field"><label for="pp-c">Contato no rodapé</label><input class="inp" id="pp-c" value="${esc(pc.contato)}" data-chg="propTxt" data-f="contato" maxlength="120" ${dis}></div>
      <div class="field"><label for="pp-v">Validade (dias após o envio)</label><input class="inp num" type="number" min="1" max="30" id="pp-v" value="${esc(pc.validade)}" data-chg="propTxt" data-f="validade" ${dis}></div>
      <div class="field full"><label for="pp-logo">Logotipo no PDF (PNG ou JPG)</label><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${custos().logo?`<img src="${esc(custos().logo)}" alt="Logotipo atual" style="max-height:48px;max-width:200px;background:#fff;padding:4px;border-radius:6px">`:'<span class="muted">sem logotipo: o PDF mostra o nome NTN Engenharia</span>'}
        ${ed?`<input type="file" id="pp-logo" accept="image/png,image/jpeg" data-chg="propLogo">${custos().logo?'<button class="btn small ghost" data-act="propLogoRm">Remover</button>':''}`:''}</div></div>
    </div></section>
  ${vc?`<section class="panel" style="grid-column:1/-1"><div class="panel-h"><h3>Salário por função</h3><span class="sub">o mesmo valor em todas as obras</span></div>
    <div class="tbl-wrap"><table><thead><tr><th>Função</th><th>Salário-base (R$)</th><th>Adicional</th><th>Total com adicional</th></tr></thead><tbody>
    ${DB.cfg.funcoes.map(f=>{const s=g.salarios?.[f.id]||{};const sal=+s.sal||0;return `<tr><td>${esc(f.nome)}</td><td>${ec?`<input class="inp num" inputmode="decimal" value="${sal?esc(String(sal).replace('.',',')):''}" placeholder="não cadastrado" data-chg="salFuncao" data-f="${esc(f.id)}" aria-label="Salário de ${esc(f.nome)}" style="max-width:140px">`:sal?brl(sal):'—'}</td>
      <td>${ec?`<select class="inp" data-chg="salAdic" data-f="${esc(f.id)}" aria-label="Adicional de ${esc(f.nome)}">${ADICIONAIS.map(a=>`<option ${a===(s.adic||'Nenhum')?'selected':''}>${a}</option>`).join('')}</select>`:esc(s.adic||'Nenhum')}</td><td class="num">${sal?brl(sal*(1+adicPct(s.adic))):'—'}</td></tr>`}).join('')}</tbody></table></div>
    <div class="panel-b facts"><div><span>Encargos sobre a folha, para o custo mensal estimado (%)</span>${ec?`<input class="inp num" inputmode="decimal" value="${g.encargos!=null?esc(String(g.encargos).replace('.',',')):''}" placeholder="informe com a contabilidade" data-chg="custoEnc" aria-label="Encargos em porcentagem" style="max-width:140px">`:`<b>${g.encargos!=null?esc(g.encargos)+'%':'não informado'}</b>`}</div></div>
    <div class="panel-b"><p class="note" style="margin:0">Sem salário cadastrado, a proposta da função não pode ser montada. Só RH, Diretoria e Adm. de obra veem estes valores; só RH e Diretoria alteram. O custo mensal estimado aparece só para a NTN, nunca no PDF.</p></div></section>`:''}`}
const vCfgV18v=vCfg;
vCfg=function(){
  let h=UI.cfgTab==='proposta'?(()=>{const t=UI.cfgTab;UI.cfgTab='funcoes';try{return vCfgV18v()}finally{UI.cfgTab=t}})():vCfgV18v();
  h=h.replace(/(<button data-act="cfgTab" data-v="admissao")/,`<button data-act="cfgTab" data-v="proposta" aria-pressed="${UI.cfgTab==='proposta'}">Proposta</button>$1`);
  if(UI.cfgTab==='proposta'){h=h.replace(/aria-pressed="true"/g,'aria-pressed="false"').replace('data-v="proposta" aria-pressed="false"','data-v="proposta" aria-pressed="true"');const i=h.indexOf('<div class="cfg-grid">');if(i>=0)h=h.slice(0,i)+`<div class="cfg-grid">${cfgProposta()}</div>`}
  return h};
Object.assign(CHG,{
  propTxt:el=>{const k=el.dataset.f;if(!['jornada','he','regras','contato','validade'].includes(k))return;if(!podeEditarCusto())return;const p=custosMaterializar().prop??={};
    if(k==='validade'){const v=Math.round(+el.value);if(!(v>=1&&v<=30))return toast('Validade: de 1 a 30 dias.',true),render();p.validade=v}
    else{const v=el.value.trim().slice(0,400);if(!v)return toast('O texto não pode ficar vazio.',true),render();p[k]=v}save();render()},
  salFuncao:el=>{if(!podeEditarCusto())return;const fid=el.dataset.f;if(!F(fid))return;const g=custosMaterializar();const t=el.value.trim();
    if(!t){if(g.salarios[fid]){g.salarios[fid].sal=null}save();render();return}const v=numBR(t);if(!(v>=500&&v<1e6))return toast('Informe um salário válido (ex.: 3.981,57).',true),render();(g.salarios[fid]??={}).sal=Math.round(v*100)/100;save();render()},
  salAdic:el=>{if(!podeEditarCusto())return;const fid=el.dataset.f;if(!F(fid)||!ADICIONAIS.includes(el.value))return;const g=custosMaterializar();(g.salarios[fid]??={}).adic=el.value;save();render()},
  custoEnc:el=>{if(!podeEditarCusto())return;const g=custosMaterializar();const t=el.value.trim();if(!t){delete g.encargos;save();render();return}const v=numBR(t);if(!(v>=0&&v<=200))return toast('Encargos: de 0 a 200%.',true),render();g.encargos=Math.round(v*100)/100;save();render()},
  propLogo:el=>{const f=el.files&&el.files[0];if(!f)return;if(!/^image\/(png|jpeg)$/.test(f.type))return toast('Use um arquivo PNG ou JPG.',true);if(f.size>5*1024*1024)return toast('Imagem muito grande (máximo 5 MB).',true);
    const url=URL.createObjectURL(f);const i=new Image();i.onload=()=>{URL.revokeObjectURL(url);const k=Math.min(1,600/i.width,240/i.height);const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(i.width*k));cv.height=Math.max(1,Math.round(i.height*k));
      const cx=cv.getContext('2d');if(f.type==='image/jpeg'){cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height)}cx.drawImage(i,0,0,cv.width,cv.height);
      let d=cv.toDataURL('image/png');if(d.length>180000)d=cv.toDataURL('image/jpeg',0.88);if(d.length>180000)return toast('Logotipo muito detalhado. Use uma imagem menor.',true);
      custosMaterializar().logo=d;save();render();toast('Logotipo salvo.')};i.onerror=()=>{URL.revokeObjectURL(url);toast('Não foi possível ler a imagem.',true)};i.src=url},
});
Object.assign(ACT,{propLogoRm:()=>{if(!podeEditarCusto())return;delete custosMaterializar().logo;save();render()}});
Object.assign(CHG_PERM,{propTxt:'editarCustoViagem',propLogo:'editarCustoViagem',salFuncao:'editarCustoViagem',salAdic:'editarCustoViagem',custoEnc:'editarCustoViagem'});
Object.assign(ACT_PERM,{propLogoRm:'editarCustoViagem'});
