
/* =====================================================================
   v17 · FÉRIAS POR PERÍODO AQUISITIVO (CLT)
   - Períodos gerados a partir da admissão; direito em dias (reduzido por faltas, art. 130).
   - Programar: integral, fracionada (até 3 partes; uma ≥14 e as outras ≥5) e venda de até 1/3 (art. 143).
   - Início não pode cair nos 2 dias antes de feriado ou domingo (art. 134, §3º).
   - Cada parte é uma ausência "Férias" ligada ao período: o planejamento da obra já enxerga.
   - Alertas: programar, aviso 30 dias antes (art. 135), pagamento, vencidas (dobro, art. 137).
   - Registros antigos ("férias gozadas" contadas) viram períodos quitados marcados como migrados.
   Valores (remuneração, 1/3, dobro) continuam com a contabilidade.
   ===================================================================== */
PERM_DEF.push(['programarFerias','Programar férias, registrar aviso, pagamento e faltas do período','Editar',['rh']]);
const podeV16f=pode;
pode=function(k){if(k==='programarFerias'&&!DB?.cfg?.perms?.programarFerias)return UI.perfil==='rh';return podeV16f(k)};
const FER_PAGTO=()=>+(DB.cfg.feriasPagto||5);
function ferDireito(faltas){const f=+faltas||0;return f<=5?30:f<=14?24:f<=23?18:f<=32?12:0}
const ferDiasParte=a=>a.fim?Math.round((new Date(a.fim+'T12:00:00')-new Date(a.inicio+'T12:00:00'))/864e5)+1:0;
const ferReg=c=>c.feriasV2||null;
function ferMigrados(c){const r=ferReg(c);if(r)return +r.migrados||0;const nF=(c.ausencias||[]).filter(a=>a.tipo==='Férias').length;return Math.max(0,(+c.ferias?.gozadas||0)-nF)}
function ferMaterializar(c){if(!c.feriasV2)c.feriasV2={v:1,migrados:ferMigrados(c),per:{}};c.feriasV2.per??={};return c.feriasV2}
function feriasDados(c){
  if(!c||!c.admissao||c.vinculo==='PJ'||c.status==='Admissão')return null;
  const reg=ferReg(c)||{per:{}};const mig=ferMigrados(c);const adm=c.admissao;
  const partes=(c.ausencias||[]).filter(a=>a.tipo==='Férias'&&a.inicio).slice().sort((a,b)=>a.inicio.localeCompare(b.inicio));
  const maxN=Math.max(0,...partes.filter(a=>a.feriasPer!=null).map(a=>+a.feriasPer));
  const pers=[];for(let n=0;n<200;n++){const ini=addM(adm,12*n);if(ini>hoje&&n>maxN)break;
    const m=(reg.per||{})[n]||{};const fim=addD(addM(adm,12*(n+1)),-1),conc=addD(addM(adm,12*(n+2)),-1);
    const migrado=n<mig;const direito=m.perdido?0:migrado?30:ferDireito(m.faltas);
    pers.push({n,ini,fim,conc,m,migrado,direito,abono:+m.abono||0,partes:[],completo:fim<hoje})}
  // partes ligadas ao período; as sem ligação (lançadas pela tela de ausência ou antigas) vão para o período mais antigo com saldo
  const usado=p=>p.abono+p.partes.reduce((t,a)=>t+ferDiasParte(a),0);
  for(const a of partes)if(a.feriasPer!=null&&pers[+a.feriasPer])pers[+a.feriasPer].partes.push(a);
  for(const a of partes){if(a.feriasPer!=null&&pers[+a.feriasPer])continue;
    const p=pers.find(x=>!x.migrado&&usado(x)<x.direito)||pers.find(x=>!x.migrado)||pers[pers.length-1];if(p)p.partes.push(a)}
  for(const p of pers)p.partes.sort((x,y)=>x.inicio.localeCompare(y.inicio));
  for(const p of pers){const goz=p.partes.reduce((t,a)=>t+ferDiasParte(a),0);
    p.gozados=p.migrado?p.direito:goz;p.saldo=Math.max(0,p.direito-p.abono-p.gozados);p.excedente=p.migrado?0:Math.max(0,p.abono+p.gozados-p.direito);
    p.futuras=p.partes.filter(a=>a.inicio>hoje);p.semFim=p.partes.some(a=>!a.fim);
    p.foraPrazo=p.partes.filter(a=>a.fim&&a.fim>p.conc).reduce((t,a)=>t+ferDiasParte({inicio:a.inicio>p.conc?a.inicio:addD(p.conc,1),fim:a.fim}),0);
    p.ultimoInicio=p.saldo>0?addD(p.conc,-p.saldo+1):null;
    p.sit=p.m.perdido?'Período perdido (art. 133)':p.migrado?'Quitado (registro anterior)':!p.completo?(p.saldo<p.direito-p.abono?'Em aquisição (antecipadas)':'Em aquisição')
      :hoje>p.conc&&(p.saldo>0||p.foraPrazo)?'Vencido: pagar em dobro':p.saldo>0?'A programar':p.futuras.length?'Programado':'Quitado'}
  const abertos=pers.filter(p=>p.completo&&!p.migrado&&!p.m.perdido&&p.saldo>0);
  return {pers,abertos,acumulados:abertos.length,partes}}
/* "Limite de férias" do resumo da ficha = prazo do período mais antigo ainda não quitado */
const feriasLimiteV16=feriasLimite;
feriasLimite=function(c){const d=feriasDados(c);if(!d)return feriasLimiteV16(c);const p=d.pers.find(x=>!x.migrado&&!x.m.perdido&&x.saldo>0);return p?p.conc:null};

/* ---------- validação (regras da CLT) ---------- */
const ferDow=d=>new Date(d+'T12:00:00').getDay();
function ferValidar(c,n,novas,abono){const d=feriasDados(c);const p=d&&d.pers[n];const erros=[],avisos=[];
  if(!p)return {erros:['Período inválido.'],avisos};
  const fer=feriadosObra(c.obraId);
  const ok=novas.filter(x=>x.inicio||x.dias);
  for(const [i,x] of ok.entries()){const r=`Parte ${i+1}`;
    if(!x.inicio)erros.push(`${r}: informe o início.`);if(!(Number.isInteger(+x.dias)&&+x.dias>=1))erros.push(`${r}: informe os dias (número inteiro).`);
    if(!x.inicio||!(+x.dias>=1))continue;x.fim=addD(x.inicio,+x.dias-1);
    for(const k of [1,2]){const dd=addD(x.inicio,k);if(ferDow(dd)===0||fer.has(dd)){erros.push(`${r}: o início (${fmt(x.inicio)}) cai nos 2 dias antes de ${ferDow(dd)===0?'domingo':'feriado'} (${fmt(dd)}). A CLT não permite (art. 134, §3º).`);break}}
    if(x.inicio<=p.fim&&p.completo===false)avisos.push(`${r}: começa antes de completar o período aquisitivo (${fmt(p.fim)}), ou seja, férias antecipadas.`);
    if(x.fim>p.conc)avisos.push(`${r}: termina depois do prazo de concessão (${fmt(p.conc)}). Os dias fora do prazo são pagos em dobro (art. 137).`);
    if(dias(x.inicio)<30)avisos.push(`${r}: menos de 30 dias até o início; o aviso ao funcionário deve ser dado com 30 dias (art. 135).`);
    const sobre=(c.ausencias||[]).find(a=>a.inicio<=x.fim&&(!a.fim||a.fim>=x.inicio));if(sobre)erros.push(`${r}: coincide com ${sobre.tipo.toLowerCase()} de ${fmt(sobre.inicio)}${sobre.fim?' a '+fmt(sobre.fim):''}.`)}
  for(let i=0;i<ok.length;i++)for(let j=i+1;j<ok.length;j++)if(ok[i].fim&&ok[j].fim&&ok[i].inicio<=ok[j].fim&&ok[j].inicio<=ok[i].fim)erros.push(`As partes ${i+1} e ${j+1} se sobrepõem.`);
  const abTxt=String(abono??'').trim()||'0';if(!/^\d+$/.test(abTxt))erros.push('Dias vendidos: informe um número inteiro (0 se não houver venda).');const ab=/^\d+$/.test(abTxt)?+abTxt:0;
  if(!ok.length&&!ab)erros.push('Informe ao menos uma parte ou dias vendidos.');
  const totalNovo=ok.reduce((t,x)=>t+(+x.dias||0),0);
  if(totalNovo+ab>p.saldo)erros.push(`Dias informados (${totalNovo}${ab?` + ${ab} vendidos`:''}) passam do saldo do período (${p.saldo}).`);
  if(p.abono+ab>Math.floor(p.direito/3))erros.push(`Venda acima do permitido: no máximo ${Math.floor(p.direito/3)} dias (1/3 do direito de ${p.direito}), art. 143.`);
  if(ab&&dias(addD(p.fim,-15))<0&&!p.completo)avisos.push('Pedido de venda depois do prazo (15 dias antes do fim do período aquisitivo): depende de concordância da empresa (art. 143, §1º).');
  if(ab&&p.completo)avisos.push('Venda pedida depois do fim do período aquisitivo: depende de concordância da empresa (art. 143, §1º).');
  // fracionamento: considera as partes já lançadas no período + as novas
  const todas=p.partes.filter(a=>a.fim).map(ferDiasParte).concat(ok.map(x=>+x.dias||0));const resto=p.saldo-totalNovo-ab;
  if(todas.length>3)erros.push(`Mais de 3 partes no período (${todas.length}). A CLT permite até 3 (art. 134, §1º).`);
  if(todas.some(x=>x<5))erros.push('Cada parte precisa ter pelo menos 5 dias corridos (art. 134, §1º).');
  if(resto>0&&resto<5)erros.push(`Sobrariam ${resto} dia(s), menos que o mínimo de 5 de uma parte. Ajuste os dias ou venda o restante, se ainda couber.`);
  if(resto>0&&todas.length>=3)erros.push(`Sobrariam ${resto} dia(s), mas o período já teria 3 partes.`);
  if((todas.length>1||resto>0)&&!todas.some(x=>x>=14)&&resto<14)erros.push('Ao fracionar, uma das partes precisa ter pelo menos 14 dias (art. 134, §1º).');
  return {erros,avisos,p,resto,totalNovo,ab}}

/* ---------- ficha › Obras e ausências: quadro de férias ---------- */
function feriasPainel(c){const d=feriasDados(c);if(!d)return '';const ed=pode('programarFerias');
  const pill=s=>pillS(s,/Vencido/.test(s)?'crit':/A programar/.test(s)?'warn':/Quitado|Programado/.test(s)?'good':'plain');
  const lim=d.pers.find(x=>!x.migrado&&!x.m.perdido&&x.saldo>0);
  const pers=d.pers.slice().reverse();
  const linhas=pers.map(p=>`<tr><td class="num">${fmt(p.ini)} a ${fmt(p.fim)}</td><td class="num">${fmt(p.conc)}</td><td class="num">${p.direito}${ed&&!p.migrado?`<div><label class="muted" style="font-size:12px">faltas <input class="inp num" type="number" min="0" value="${esc(p.m.faltas||0)}" data-chg="ferFaltas" data-id="${esc(c.id)}" data-n="${p.n}" style="width:64px;min-height:32px" aria-label="Faltas injustificadas no período"></label></div>`:''}</td>
    <td class="num">${p.gozados}</td><td class="num">${p.abono}${ed&&p.abono?` <button class="btn small ghost" data-act="ferVendaCanc" data-id="${esc(c.id)}" data-n="${p.n}">desfazer</button>`:''}</td><td class="num"><b>${p.saldo}</b></td><td>${pill(p.sit)}${p.ultimoInicio&&p.completo&&!/Vencido/.test(p.sit)?`<div class="muted" style="font-size:12px">último início ${fmt(p.ultimoInicio)}</div>`:''}${p.semFim?'<div class="pac-falta">férias sem data de fim</div>':''}${p.excedente?`<div class="pac-falta">${p.excedente} dia(s) além do direito (confira faltas e venda)</div>`:''}${p.foraPrazo&&!/Vencido/.test(p.sit)?`<div class="pac-falta">${p.foraPrazo} dia(s) depois do prazo: pagos em dobro</div>`:''}
      ${ed&&!p.migrado?`<div style="margin-top:4px"><button class="btn small ghost" data-act="ferPerda" data-id="${esc(c.id)}" data-n="${p.n}">${p.m.perdido?'Desfazer perda':'Registrar perda'}</button></div>`:''}</td></tr>`).join('');
  const partes=d.pers.flatMap(p=>p.partes.map(a=>({p,a}))).sort((x,y)=>y.a.inicio.localeCompare(x.a.inicio));
  const linP=partes.map(({p,a})=>{const st=a.inicio>hoje?'Programada':a.fim&&a.fim<hoje?'Gozada':'Em gozo';
    return `<tr><td class="num">${fmt(a.inicio)} a ${a.fim?fmt(a.fim):'?'}</td><td class="num">${ferDiasParte(a)||'—'}</td><td class="num">${a.fim?fmt(addD(a.fim,1)):'—'}</td><td class="num">${fmt(p.ini).slice(-4)}/${fmt(p.fim).slice(-4)}</td><td>${pillS(st,st==='Programada'?'info':'plain')}</td>
      <td>${a.aviso?`entregue ${fmt(a.aviso)}`:st==='Programada'&&ed?`<button class="btn small" data-act="ferAviso" data-id="${esc(c.id)}" data-a="${esc(a.id)}">Aviso entregue</button>`:'—'}</td>
      <td>${a.pago?`pago ${fmt(a.pago)}`:ed?`<button class="btn small" data-act="ferPago" data-id="${esc(c.id)}" data-a="${esc(a.id)}">Marcar pago</button><div class="muted" style="font-size:12px">até ${fmt(addD(a.inicio,-2))}</div>`:'—'}</td>
      <td>${st==='Programada'&&ed?`<button class="btn small ghost danger" data-act="ferCancelar" data-id="${esc(c.id)}" data-a="${esc(a.id)}">Cancelar</button>`:''}</td></tr>`}).join('');
  const canc=Object.entries(ferReg(c)?.per||{}).flatMap(([n,m])=>(m.cancelados||[]).map(x=>({...x,n})));
  return `<section class="panel"><div class="panel-h"><h3>Férias</h3><span class="sub">${lim?`prazo do período mais antigo: ${fmt(lim.conc)}`:'nenhum saldo em aberto'}${d.acumulados>1?` · <b>${d.acumulados} períodos completos acumulados</b>`:''}</span><span class="grow" style="flex:1"></span>${ed&&d.pers.some(p=>!p.migrado&&!p.m.perdido&&p.saldo>0)&&c.status!=='Desligado'?`<button class="btn small primary" data-act="ferProg" data-id="${esc(c.id)}">Programar férias</button>`:''}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Período aquisitivo</th><th>Conceder até</th><th>Direito</th><th>Gozados e programados</th><th>Vendidos</th><th>Saldo</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>
    ${partes.length?`<div class="tbl-wrap"><table><thead><tr><th>Férias</th><th>Dias</th><th>Retorno</th><th>Período</th><th>Situação</th><th>Aviso (30 dias antes)</th><th>Pagamento (2 dias antes)</th><th></th></tr></thead><tbody>${linP}</tbody></table></div>`:''}
    <div class="panel-b">${canc.length?`<details class="arq-hist"><summary>Histórico: ${canc.length} programação(ões) cancelada(s)</summary><ul>${canc.map(x=>`<li>${fmt(x.inicio)} a ${fmt(x.fim)} · cancelada em ${fmt(x.em)} por ${esc(x.por)}: ${esc(x.motivo)}</li>`).join('')}</ul></details>`:''}
    <p class="note" style="margin:8px 0 0">Direito de 30 dias por período, reduzido por faltas injustificadas (art. 130). Pode fracionar em até 3 partes (uma com 14 dias ou mais, as outras com 5 ou mais) e vender até 1/3. O período precisa ser concedido até a data de “Conceder até”; depois disso, as férias são pagas em dobro. Valores ficam com a contabilidade.</p></div></section>`}
const fichaTabV17f=fichaTab;
fichaTab=function(c){let h=fichaTabV17f(c);
  if(UI.fichaTab==='obras'){const fp=feriasPainel(c);if(fp)h=h.replace('<div class="sec-t">Ausências e folgas</div>',()=>fp+'<div class="sec-t">Ausências e folgas</div>')}
  return h};

/* ---------- programar férias ---------- */
function ferCampos(c,d,n){const p=d.pers[n];
  const opts=d.pers.filter(x=>!x.migrado&&!x.m.perdido&&x.saldo>0).map(x=>`<option value="${x.n}" ${x.n===n?'selected':''}>${fmt(x.ini)} a ${fmt(x.fim)} · saldo ${x.saldo} dia(s)${x.completo?'':' · em aquisição'}</option>`).join('');
  const sug=(()=>{let s=addD(hoje,30);for(let i=0;i<21;i++){const w=ferDow(s);const ok=w>=1&&w<=4&&!feriadosObra(c.obraId).has(s)&&[1,2].every(k=>{const dd=addD(s,k);return ferDow(dd)!==0&&!feriadosObra(c.obraId).has(dd)});if(ok)break;s=addD(s,1)}return s})();
  const parte=(i,ini,dd)=>`<div class="field"><label for="fp-i${i}">Parte ${i+1}: início</label><input class="inp" type="date" id="fp-i${i}" name="ini${i}" value="${ini||''}" data-fer="1"></div><div class="field"><label for="fp-d${i}">Parte ${i+1}: dias</label><input class="inp num" id="fp-d${i}" name="dias${i}" inputmode="numeric" value="${dd||''}" data-fer="1"></div>`;
  return `<div class="field full"><label for="fp-n">Período aquisitivo</label><select class="inp" id="fp-n" name="per" data-fer="1">${opts}</select></div>
    ${parte(0,sug,p?p.saldo:'')}${parte(1,'','')}${parte(2,'','')}
    <div class="field"><label for="fp-ab">Dias vendidos (abono)</label><input class="inp num" id="fp-ab" name="abono" inputmode="numeric" value="0" data-fer="1"></div>
    <div class="field full"><label for="fp-ob">Observação (opcional)</label><input class="inp" id="fp-ob" name="obs" maxlength="200"></div>
    <div class="full" id="ferPrev" aria-live="polite"></div>`}
function ferLerForm(f){const g=n=>f.querySelector(`[name="${n}"]`)?.value||'';
  return {n:+g('per'),partes:[0,1,2].map(i=>({inicio:g('ini'+i),dias:String(g('dias'+i)).trim()})).filter(x=>x.inicio||x.dias),abono:String(g('abono')).trim()||'0',obs:g('obs')}}
function ferPrevia(){const f=document.querySelector('#layer .modal form');const box=document.getElementById('ferPrev');if(!f||!box)return;const c=C(f.dataset.ferId);if(!c)return;
  const x=ferLerForm(f);const v=ferValidar(c,x.n,x.partes.map(y=>({...y})),x.abono);
  const lin=x.partes.filter(y=>y.inicio&&+y.dias>=1).map((y,i)=>`Parte ${i+1}: <b>${esc(fmtDS(y.inicio))}</b> a <b>${esc(fmtDS(addD(y.inicio,+y.dias-1)))}</b> (${+y.dias} dias) · retorno ${fmtDS(addD(y.inicio,+y.dias))}`);
  box.innerHTML=`<div class="note" style="margin:0">${lin.join('<br>')||'Informe as datas.'}${v.p?`<br>Saldo depois desta programação: <b>${Math.max(0,v.resto)}</b> dia(s)${v.ab?` · ${v.ab} vendido(s)`:''}`:''}</div>
    ${v.erros.length?`<div class="banner" style="border-left-color:var(--crit);margin-top:8px">${v.erros.map(esc).join('<br>')}</div>`:''}${v.avisos.length?`<div class="banner" style="margin-top:8px">${v.avisos.map(esc).join('<br>')}</div>`:''}`}
document.addEventListener('input',e=>{if(e.target.dataset?.fer)ferPrevia()});document.addEventListener('change',e=>{if(e.target.dataset?.fer)ferPrevia()});
function ferProgramar(c){const d=feriasDados(c);if(!d)return;const p0=d.pers.find(x=>!x.migrado&&!x.m.perdido&&x.saldo>0&&x.completo)||d.pers.find(x=>!x.migrado&&!x.m.perdido&&x.saldo>0);if(!p0)return toast('Não há saldo de férias para programar.',true);
  modal(`Programar férias · ${esc(c.nome)}`,ferCampos(c,d,p0.n),'Programar férias',fd=>{
    const f=document.querySelector('#layer .modal form');const x=ferLerForm(f);const v=ferValidar(c,x.n,x.partes.map(y=>({...y})),x.abono);
    if(v.erros.length){ferPrevia();toast(v.erros[0],true);return false}
    const reg=ferMaterializar(c);const m=reg.per[x.n]??={};
    const novas=x.partes.filter(y=>y.inicio&&+y.dias>=1).map(y=>({id:uid(),tipo:'Férias',inicio:y.inicio,fim:addD(y.inicio,+y.dias-1),confirmado:false,feriasPer:x.n,aviso:'',pago:''}));
    // partes antigas sem ligação ficam presas ao período em que foram contadas, para o saldo não mudar
    for(const pp of feriasDados(c).pers)for(const a of pp.partes)if(a.feriasPer==null)a.feriasPer=pp.n;
    (c.ausencias??=[]).push(...novas);if(v.ab)m.abono=(+m.abono||0)+v.ab;
    const per=d.pers[x.n];
    c.historico.push({data:hoje,tipo:'Férias',texto:`Férias programadas (período ${fmt(per.ini)} a ${fmt(per.fim)}): ${novas.map(a=>`${fmt(a.inicio)} a ${fmt(a.fim)} (${ferDiasParte(a)} dias)`).join('; ')||'sem gozo'}${v.ab?`; ${v.ab} dia(s) vendido(s)`:''}.${x.obs?' '+x.obs:''}`,autor:perfilNome()});
    save();render();toast(v.avisos.length?'Férias programadas. Confira os avisos no quadro de férias.':'Férias programadas.')},true);
  const f=document.querySelector('#layer .modal form');if(f){f.dataset.ferId=c.id;f.dataset.rasc=''}setTimeout(ferPrevia,0)}
const ferParte=(c,id)=>(c.ausencias||[]).find(a=>a.id===id&&a.tipo==='Férias');
Object.assign(ACT,{
  ferProg:b=>{const c=C(b.dataset.id);if(c)ferProgramar(c)},
  ferAviso:b=>{const c=C(b.dataset.id);const a=c&&ferParte(c,b.dataset.a);if(!a)return;modal('Aviso de férias entregue',`${fld('Data em que o aviso foi entregue','data',hoje,'date')}<p class="note full" style="margin:0">O aviso deve ser dado por escrito com pelo menos 30 dias de antecedência (início em ${fmt(a.inicio)}; prazo ${fmt(addD(a.inicio,-30))}).</p>`,'Registrar aviso',fd=>{
    if(!fd.data||fd.data>hoje)return toast('Informe uma data até hoje.',true),false;a.aviso=fd.data;c.historico.push({data:fd.data,tipo:'Férias',texto:`Aviso de férias entregue (início ${fmt(a.inicio)}).${fd.data>addD(a.inicio,-30)?' Entregue com menos de 30 dias.':''}`,autor:perfilNome()});save();render();toast('Aviso registrado.')})},
  ferPago:b=>{const c=C(b.dataset.id);const a=c&&ferParte(c,b.dataset.a);if(!a)return;modal('Pagamento de férias',`${fld('Data do pagamento','data',hoje,'date')}<p class="note full" style="margin:0">O pagamento deve sair até 2 dias antes do início (${fmt(addD(a.inicio,-2))}), art. 145.</p>`,'Registrar pagamento',fd=>{
    if(!fd.data||fd.data>hoje)return toast('Informe uma data até hoje.',true),false;a.pago=fd.data;c.historico.push({data:fd.data,tipo:'Férias',texto:`Pagamento de férias registrado (início ${fmt(a.inicio)}).${fd.data>addD(a.inicio,-2)?' Pago depois do prazo legal.':''}`,autor:perfilNome()});save();render();toast('Pagamento registrado.')})},
  ferCancelar:b=>{const c=C(b.dataset.id);const a=c&&ferParte(c,b.dataset.a);if(!a)return;if(a.inicio<=hoje)return toast('Só é possível cancelar férias que ainda não começaram. Para encerrar antes, registre o retorno.',true);
    modalD(`Cancelar as férias de ${fmt(a.inicio)} a ${fmt(a.fim)}?`,`<p class="full" style="margin:0">Os dias voltam para o saldo do período. A programação cancelada fica no histórico.</p><div class="field full"><label for="m-fc">Motivo</label><input class="inp" id="m-fc" name="motivo" required maxlength="200"></div>`,'Cancelar férias',fd=>{
      if(!String(fd.motivo||'').trim())return toast('Informe o motivo.',true),false;const pp=feriasDados(c)?.pers.find(x=>x.partes.includes(a));const reg=ferMaterializar(c);const n=a.feriasPer??pp?.n??0;const m=reg.per[n]??={};
      (m.cancelados??=[]).push({inicio:a.inicio,fim:a.fim,motivo:String(fd.motivo).trim(),por:perfilNome(),em:hoje});c.ausencias=c.ausencias.filter(x=>x!==a);
      c.historico.push({data:hoje,tipo:'Férias',texto:`Férias de ${fmt(a.inicio)} a ${fmt(a.fim)} canceladas: ${String(fd.motivo).trim()}.`,autor:perfilNome()});save();render();toast('Férias canceladas; os dias voltaram ao saldo.')})},
  ferVendaCanc:b=>{const c=C(b.dataset.id);if(!c)return;const n=+b.dataset.n;const reg=ferMaterializar(c);const m=reg.per[n]??={};if(!m.abono)return;
    modalD('Desfazer a venda de dias?',`<p class="full" style="margin:0">${m.abono} dia(s) voltam para o saldo do período.</p><div class="field full"><label for="m-fv">Motivo</label><input class="inp" id="m-fv" name="motivo" required maxlength="200"></div>`,'Desfazer venda',fd=>{
      if(!String(fd.motivo||'').trim())return toast('Informe o motivo.',true),false;c.historico.push({data:hoje,tipo:'Férias',texto:`Venda de ${m.abono} dia(s) desfeita: ${String(fd.motivo).trim()}.`,autor:perfilNome()});m.abono=0;save();render()})},
  ferPerda:b=>{const c=C(b.dataset.id);if(!c)return;const n=+b.dataset.n;const reg=ferMaterializar(c);const m=reg.per[n]??={};
    if(m.perdido){modalD('Desfazer o registro de perda do período?','<p class="full" style="margin:0">O período volta a ter direito a férias.</p>','Desfazer perda',()=>{c.historico.push({data:hoje,tipo:'Férias',texto:`Perda do período ${n+1} desfeita.`,autor:perfilNome()});delete m.perdido;save();render()});return}
    modalD('Registrar perda do período de férias?',`<p class="full" style="margin:0">Use só nos casos do art. 133 da CLT (por exemplo, mais de 6 meses de auxílio-doença ou mais de 30 dias de licença remunerada no período). Confirme com a contabilidade.</p><div class="field full"><label for="m-fpd">Motivo</label><input class="inp" id="m-fpd" name="motivo" required maxlength="200"></div>`,'Registrar perda',fd=>{
      if(!String(fd.motivo||'').trim())return toast('Informe o motivo.',true),false;m.perdido={motivo:String(fd.motivo).trim(),por:perfilNome(),em:hoje};c.historico.push({data:hoje,tipo:'Férias',texto:`Perda do período de férias ${n+1} registrada: ${m.perdido.motivo}.`,autor:perfilNome()});save();render()})},
});
Object.assign(CHG,{ferFaltas:el=>{const c=C(el.dataset.id);if(!c)return;const v=Math.max(0,Math.round(+el.value)||0);const reg=ferMaterializar(c);const m=reg.per[+el.dataset.n]??={};
  const ant=+m.faltas||0;if(ant===v)return;m.faltas=v;c.historico.push({data:hoje,tipo:'Férias',texto:`Faltas injustificadas do período ${+el.dataset.n+1}: ${v} (direito ${ferDireito(v)} dias).`,autor:perfilNome()});save();render()}});
Object.assign(ACT_PERM,{ferProg:'programarFerias',ferAviso:'programarFerias',ferPago:'programarFerias',ferCancelar:'programarFerias',ferVendaCanc:'programarFerias',ferPerda:'programarFerias'});
Object.assign(CHG_PERM,{ferFaltas:'programarFerias'});

/* tela de ausência: férias por lá entram no período mais antigo; recomendar o quadro de férias */
const modalStatusV16=modalStatus;
modalStatus=function(c){const r=modalStatusV16.apply(this,arguments);
  try{const bd=document.querySelector('#layer .modal .bd');if(bd&&feriasDados(c))bd.insertAdjacentHTML('beforeend','<div class="note full">Para férias, prefira <b>Obras e ausências › Programar férias</b>: lá o sistema confere saldo, fracionamento, venda de dias e prazos. Férias lançadas aqui entram no período mais antigo com saldo.</div>')}catch(e){}
  return r};

/* ---------- alertas ---------- */
const alertasBaseV17f=alertasBase;
alertasBase=function(){const out=alertasBaseV17f().filter(a=>a.tipo!=='Férias');const A=DB.cfg.antecedencia||{};const extra=[];
  DB.colabs.forEach(c=>{if(c.status==='Desligado')return;const d=feriasDados(c);if(!d)return;
    for(const p of d.pers){if(p.migrado||p.m.perdido)continue;
      if(p.completo&&hoje>p.conc&&(p.saldo>0||p.foraPrazo))extra.push({c,tipo:'Férias',desc:`Férias vencidas do período ${fmt(p.ini)} a ${fmt(p.fim)}: ${p.saldo||p.foraPrazo} dia(s) devem ser pagos em dobro`,data:p.conc});
      else if(p.completo&&p.saldo>0)extra.push({c,tipo:'Férias',semJanela:true,desc:`Programar ${p.saldo} dia(s) de férias do período ${fmt(p.ini)} a ${fmt(p.fim)} (concessão até ${fmt(p.conc)})${d.acumulados>1?` · ${d.acumulados} períodos acumulados`:''}`,data:p.ultimoInicio});
      if(p.excedente)extra.push({c,tipo:'Férias',desc:`Período ${fmt(p.ini)} a ${fmt(p.fim)}: ${p.excedente} dia(s) de férias além do direito. Confira faltas e venda.`,data:hoje});
      for(const a of p.partes){if(a.inicio<=hoje)continue;
        const av=addD(a.inicio,-30);if(!a.aviso&&dias(av)<=15)extra.push({c,tipo:'Férias',desc:`Entregar aviso de férias (início ${fmt(a.inicio)})`,data:av});
        const pg=addD(a.inicio,-FER_PAGTO());if(!a.pago&&dias(pg)<=10)extra.push({c,tipo:'Férias',desc:`Pagar férias até ${fmt(addD(a.inicio,-2))} (início ${fmt(a.inicio)})`,data:pg})}}});
  extra.forEach(a=>{a.d=dias(a.data);a.acao=a.d<=(A[a.tipo]??30)});
  return out.concat(extra.filter(a=>a.d<=90||a.semJanela)).sort((a,b)=>a.d-b.d)};

/* ---------- relatório (painel de férias) ---------- */
REL_META.ferias={g:'Pessoal',d:'Saldo de férias por colaborador, períodos acumulados, vencimentos e próximas férias.',f:['obra','vinc']};
RELS.ferias={nome:'Férias',cols:['Nome','Obra','Função','Períodos completos em aberto','Saldo (dias)','Conceder até','Próximas férias','Situação'],
  rows:()=>DB.colabs.filter(c=>c.status!=='Desligado'&&fR(c)).map(c=>({c,d:feriasDados(c)})).filter(x=>x.d).sort((x,y)=>x.c.nome.localeCompare(y.c.nome)).map(({c,d})=>{
    const ab=d.pers.filter(p=>!p.migrado&&!p.m.perdido&&p.saldo>0);const prox=d.partes.filter(a=>a.inicio>hoje).sort((a,b)=>a.inicio.localeCompare(b.inicio))[0];
    const venc=d.pers.some(p=>/Vencido/.test(p.sit));
    return [c.nome,nomeObra(c.obraId),F(c.funcaoId)?.nome||'',d.acumulados,ab.reduce((t,p)=>t+p.saldo,0),ab[0]?fmt(ab[0].conc):'—',prox?`${fmt(prox.inicio)} a ${fmt(prox.fim)}`:'—',venc?'Vencido: pagar em dobro':d.acumulados>1?'2 ou mais períodos acumulados':d.acumulados?'A programar':'Em dia']})};
