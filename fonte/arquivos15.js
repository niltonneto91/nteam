
/* =====================================================================
   v15 · ARQUIVOS — documentos dos colaboradores e da obra
   - Arquivos no armazenamento privado (bucket "documentos"); o acesso é
     decidido no servidor pela categoria e pelas obras do colaborador.
   - Remover não apaga: o arquivo sai da lista e fica no histórico.
   - Pacote da obra: ZIP ou link com validade + código de 6 dígitos.
     Atestados nunca entram em pacote.
   ===================================================================== */
const ARQ={col:new Map(),obra:new Map(),busy:new Set(),pacotes:new Map(),uso:undefined};
const ARQ_MIME={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const ARQ_EXT={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
const ARQ_ACCEPT='application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const ARQ_CAT={pessoal:'Documentos pessoais',registro:'Registro e contrato',sst:'Segurança do trabalho',atestado:'Atestado',obra:'Documentos da obra'};
const ARQ_COLS='id,caminho,categoria,colab_id,obra_id,tipo_doc,ref_id,nome,mime,tamanho,validade,enviado_por_nome,criado_em,removido_em,removido_motivo';
const ARQ_ID_OK=/^[A-Za-z0-9_-]{1,60}$/;
const ARQ_TTL=60000;
const TIPOS_REGISTRO=[['registro','Contrato de trabalho'],['registro','Ficha de registro'],['registro','Recibo do eSocial'],['registro','Termo aditivo'],['registro','Aviso e recibo de férias'],['pessoal','Outro documento pessoal']];
const SST_FIXOS=['Ficha de EPI','Ordem de serviço (NR-1)','Outro documento de SST'];

function catDoc(nome){if(/\bNR\b|NR-|\bASO\b|EPI|Ordem de servi/i.test(nome))return 'sst';if(/CTPS|PIS|NIS|contrato|registro|eSocial/i.test(nome))return 'registro';return 'pessoal'}
function podeEdCat(cat){return cat==='atestado'?pode('registrarAtestado'):cat==='sst'?pode('editarSST'):cat==='obra'?pode('gerirDocObra'):pode('editarCadastro')}
function arqTam(b){b=+b||0;return b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(1).replace('.',',')+' MB'}
function arqData(iso){return iso?fmt(String(iso).slice(0,10)):''}
function arqMapa(tipo){return tipo==='obra'?ARQ.obra:ARQ.col}

/* ---------- leitura (cache curto; recarrega em segundo plano) ---------- */
function arqDe(tipo,id){const m=arqMapa(tipo);const e=m.get(id);
  if(!e||Date.now()-e.t>ARQ_TTL){const k=tipo+'|'+id;if(!ARQ.busy.has(k)){ARQ.busy.add(k);arqCarregar(tipo,id).finally(()=>ARQ.busy.delete(k))}}
  return e||null}
async function arqCarregar(tipo,id){
  const {data,error}=await NUVEM.sb.from('arquivo').select(ARQ_COLS).eq(tipo==='obra'?'obra_id':'colab_id',id).order('criado_em',{ascending:false}).limit(1000);
  const ant=arqMapa(tipo).get(id);
  if(error){console.error(JSON.stringify({nivel:'erro',etapa:'arquivo.ler',msg:error.message}));arqMapa(tipo).set(id,{t:Date.now(),l:ant?.l||[],erro:true})}
  else arqMapa(tipo).set(id,{t:Date.now(),l:data||[]});
  if(!ant||JSON.stringify(ant.l)!==JSON.stringify(arqMapa(tipo).get(id).l)||!!ant.erro!==!!error)arqRender()}
async function arqCarregarVarios(ids){
  const falta=ids.filter(id=>{const e=ARQ.col.get(id);return !e||Date.now()-e.t>ARQ_TTL});if(!falta.length||ARQ.busy.has('lote'))return;
  ARQ.busy.add('lote');try{await arqCarregarLote(falta)}finally{ARQ.busy.delete('lote')}}
async function arqCarregarLote(falta){
  for(let i=0;i<falta.length;i+=80){const lote=falta.slice(i,i+80);
    const {data,error}=await NUVEM.sb.from('arquivo').select(ARQ_COLS).in('colab_id',lote).order('criado_em',{ascending:false}).limit(5000);
    if(error){console.error(JSON.stringify({nivel:'erro',etapa:'arquivo.lote',msg:error.message}));lote.forEach(id=>ARQ.col.set(id,{t:Date.now(),l:ARQ.col.get(id)?.l||[],erro:true}));continue}
    const por=new Map(lote.map(id=>[id,[]]));for(const a of data||[])por.get(a.colab_id)?.push(a);
    for(const [id,l] of por)ARQ.col.set(id,{t:Date.now(),l})}
  arqRender()}
let arqRT=null;function arqRender(){clearTimeout(arqRT);arqRT=setTimeout(()=>{if(!document.querySelector('#layer .modal'))render()},30)}
function arqAchar(id){for(const m of [ARQ.col,ARQ.obra])for(const e of m.values()){const a=e.l.find(x=>x.id===id);if(a)return a}return null}
const ativos_=l=>(l||[]).filter(a=>!a.removido_em);

/* ---------- envio ---------- */
function arqValidar(file){
  if(!file||!file.size)return {erro:'Escolha um arquivo.'};
  let mime=ARQ_MIME[file.type]?file.type:(ARQ_EXT[(String(file.name).split('.').pop()||'').toLowerCase()]||'');
  if(!ARQ_MIME[mime])return {erro:'Use PDF ou imagem (JPG, PNG ou WEBP).'};
  if(file.size>10*1024*1024)return {erro:'O arquivo passa de 10 MB. Reduza o tamanho ou divida em partes.'};
  return {mime}}
function arqErro(e){const m=String((e&&(e.message||e.error))||'');const st=String(e&&(e.statusCode||e.status)||'');
  console.error(JSON.stringify({nivel:'erro',etapa:'arquivo.enviar',msg:m,status:st}));
  if(/sem_permissao|row-level|security|Unauthorized|403/i.test(m+st))return 'Seu perfil não pode anexar este documento para este colaborador ou obra.';
  if(/tipo_restrito/.test(m))return 'Documento médico só pode ser anexado como atestado.';
  if(/substituicao_invalida/.test(m))return 'Este arquivo já foi substituído ou removido. Atualize a tela.';
  if(/exceeded|too large|413/i.test(m+st))return 'O arquivo passa de 10 MB.';
  if(/mime|content type/i.test(m))return 'Use PDF ou imagem (JPG, PNG ou WEBP).';
  if(/JWT|expired/i.test(m))return 'Sessão expirada. Entre de novo para enviar.';
  return 'Não foi possível enviar o arquivo. Verifique a internet e tente de novo.'}
async function arqEnviar(file,o){
  const v=arqValidar(file);if(v.erro)throw new Error(v.erro);
  const alvo=o.cat==='obra'?o.obra:o.colab;
  if(!ARQ_ID_OK.test(String(alvo||'')))throw new Error('Este cadastro tem um identificador que não aceita anexos. Fale com o administrador.');
  if(NV.pendente||NV.salvando){clearTimeout(NV.timer);await salvarNuvem()}
  const caminho=o.cat==='obra'?`o/${o.obra}/${crypto.randomUUID()}.${ARQ_MIME[v.mime]}`:`c/${o.colab}/${o.cat}/${crypto.randomUUID()}.${ARQ_MIME[v.mime]}`;
  const corpo=file.type===v.mime?file:new File([file],String(file.name||'arquivo'),{type:v.mime});
  const {error:e1}=await NUVEM.sb.storage.from('documentos').upload(caminho,corpo,{contentType:v.mime,upsert:false,cacheControl:'0'});
  if(e1)throw new Error(arqErro(e1));
  const {data,error:e2}=await NUVEM.sb.rpc('registrar_arquivo',{p_caminho:caminho,p_tipo_doc:String(o.tipoDoc).slice(0,120),p_nome:String(file.name).slice(0,200),p_ref:o.ref||null,p_validade:o.validade||null,p_substitui:o.substitui||null});
  if(e2)throw new Error(arqErro(e2));
  arqMapa(o.cat==='obra'?'obra':'colab').delete(alvo);ARQ.uso=undefined;
  return data}
async function arqEnviarComAviso(file,o,ok){
  toast('Enviando arquivo…');
  try{await arqEnviar(file,o);toast(ok||'Arquivo anexado.');if(o.depois)o.depois();arqDe(o.cat==='obra'?'obra':'colab',o.cat==='obra'?o.obra:o.colab);render();return true}
  catch(e){toast(e.message,true);return false}}

/* ---------- abrir, remover, histórico ---------- */
function audArq(acao,a,extra={}){const c=a.colab_id?C(a.colab_id):null;
  AUD.push(Object.freeze({id:uid(),acaoId:uid(),em:new Date().toISOString(),autor:autorAtual(),acao,modulo:'Arquivos',col:'arquivo',colNome:c?c.nome:'—',regId:a.id||'*',
    registro:a.categoria==='atestado'?'Documento restrito':String(a.tipo_doc||'Documento'),obraId:a.obra_id||null,obraNome:a.obra_id?nomeObra(a.obra_id):'',tipo:'Arquivo',campos:[],mais:0,just:'',lote:'',...extra}));audGravar()}
async function arqAbrir(id){const a=arqAchar(id);if(!a)return toast('Arquivo não encontrado. Atualize a tela.',true);
  const w=window.open('about:blank','_blank');
  const {data,error}=await NUVEM.sb.storage.from('documentos').createSignedUrl(a.caminho,120);
  if(error||!data?.signedUrl){if(w)w.close();return toast('Não foi possível abrir o arquivo. Verifique se o seu perfil tem acesso.',true)}
  if(w){w.opener=null;w.location.href=data.signedUrl}else toast('Permita janelas novas (pop-up) para abrir o arquivo.',true);
  audArq('Abriu arquivo',a)}
function arqLinha(a,ed){
  return `<div class="arq"><button type="button" class="btn small" data-act="arqVer" data-a="${a.id}">Ver</button>${ed?`<label class="btn small ghost" for="arqs-${a.id}">Substituir</label><input type="file" hidden id="arqs-${a.id}" accept="${ARQ_ACCEPT}" data-chg="arqSubst" data-a="${a.id}" aria-label="Substituir arquivo"><button type="button" class="btn small ghost danger" data-act="arqRemover" data-a="${a.id}">Remover</button>`:''}<div class="arq-m muted">${esc(a.nome)} · ${arqTam(a.tamanho)} · enviado em ${arqData(a.criado_em)}${a.enviado_por_nome?' por '+esc(a.enviado_por_nome):''}${a.validade?' · válido até '+fmt(a.validade):''}</div></div>`}
function arqAnexar(dados,rot='Anexar'){const id='arqn-'+uid();
  const attrs=Object.entries(dados).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ');
  return `<label class="btn small" for="${id}">${rot}</label><input type="file" hidden id="${id}" accept="${ARQ_ACCEPT}" data-chg="arqNovo" ${attrs} aria-label="${esc(rot)}">`}
function arqCelula(lista,ed,dadosNovo,vazio){const at=ativos_(lista);
  return at.length?at.map(a=>arqLinha(a,ed)).join('')+(ed&&dadosNovo&&dadosNovo.multi?`<div style="margin-top:4px">${arqAnexar(dadosNovo,'Anexar outro')}</div>`:''):(ed&&dadosNovo?arqAnexar(dadosNovo):`<span class="muted">${vazio||'sem arquivo'}</span>`)}
function arqHistorico(lista){const rm=(lista||[]).filter(a=>a.removido_em);if(!rm.length)return '';
  return `<details class="arq-hist"><summary>Histórico: ${rm.length} arquivo(s) substituído(s) ou removido(s)</summary><ul>${rm.map(a=>`<li><b>${esc(a.categoria==='atestado'?'Atestado':a.tipo_doc)}</b> · ${esc(a.nome)} · removido em ${arqData(a.removido_em)}${a.removido_motivo?' · '+esc(a.removido_motivo):''} <button type="button" class="btn small ghost" data-act="arqVer" data-a="${a.id}">Ver</button></li>`).join('')}</ul></details>`}
const carregando='<span class="muted">carregando…</span>';

/* ---------- ficha: Cadastro › Documentos, SST e Atestados ---------- */
const fichaTabV14=fichaTab;
fichaTab=function(c){let h=fichaTabV14(c);const t=UI.fichaTab;
  if(t==='cadastro'&&UI.fichaSub.cadastro==='docs'){const e=arqDe('colab',c.id);const ed=pode('editarCadastro');
    h=h.replace(/<td><label class="btn small" for="df-(\d+)">[\s\S]*?data-chg="docFile"[^>]*><\/td>/g,(m,i)=>{const doc=DB.cfg.docs[+i];if(doc==null)return '<td></td>';
      if(!e)return `<td>${carregando}</td>`;const l=e.l.filter(a=>a.tipo_doc===doc&&a.categoria!=='atestado');
      const antigo=!ativos_(l).length&&c.docFiles?.[doc]?`<div class="arq-m muted">Antes só o nome “${esc(c.docFiles[doc])}” era guardado: anexe o arquivo.</div>`:'';
      return `<td>${arqCelula(l,ed,{colab:c.id,cat:catDoc(doc),tipo:doc,marcar:doc})}${antigo}</td>`});
    const outros=e?e.l.filter(a=>['pessoal','registro'].includes(a.categoria)&&!DB.cfg.docs.includes(a.tipo_doc)):[];
    const selId='arq-ot-'+esc(c.id);
    const painel=`<section class="panel"><div class="panel-h"><h3>Contrato, registro e outros documentos</h3></div><div class="panel-b">
      ${e?(ativos_(outros).length?`<div class="tbl-wrap"><table><thead><tr><th>Documento</th><th>Arquivo</th></tr></thead><tbody>${ativos_(outros).map(a=>`<tr><td>${esc(a.tipo_doc)}</td><td>${arqLinha(a,ed)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0 0 8px">Nenhum documento além do checklist.</p>'):carregando}
      ${ed?`<div class="arq-novo"><label class="fl" for="${selId}"><span class="fl-t">Tipo de documento</span><select class="inp" id="${selId}">${TIPOS_REGISTRO.map(([cat,tp])=>`<option value="${cat}|${esc(tp)}">${esc(tp)}</option>`).join('')}</select></label>${arqAnexar({colab:c.id,sel:'#'+selId},'Escolher arquivo e anexar')}</div>`:''}
      ${e?arqHistorico(e.l.filter(a=>a.categoria!=='atestado')):''}</div></section>`;
    h=h.replace(/<p class="note">No protótipo o anexo guarda só o nome do arquivo\.[^<]*<\/p>/,()=>painel+'<p class="note">Os arquivos ficam no armazenamento privado do nTeam. Documentos pessoais e de registro: RH, Diretoria e Administrativo da obra. Ao anexar um item do checklist, ele passa para “Recebido”. PDF ou imagem, até 10 MB.</p>');
  }
  if(t==='sst'){const e=arqDe('colab',c.id);const ed=pode('editarSST');
    const linhas=[['ASO',c.aso?.validade||''],...reqTreinos(c).map(tr=>['Certificado de '+tr.nome,treinoVal(c,tr)||'']),...SST_FIXOS.map(x=>[x,''])];
    const extras=e?[...new Set(ativos_(e.l).filter(a=>a.categoria==='sst'&&!linhas.some(([tp])=>tp===a.tipo_doc)).map(a=>a.tipo_doc))]:[];
    const linha=(tp,val)=>{const l=e?e.l.filter(a=>a.categoria==='sst'&&a.tipo_doc===tp):[];
      return `<tr><td>${esc(tp)}</td><td class="num">${val?fmt(val):'—'}</td><td>${e?arqCelula(l,ed,{colab:c.id,cat:'sst',tipo:tp,validade:val,multi:tp==='Outro documento de SST'?1:''}):carregando}</td></tr>`};
    h+=`<section class="panel"><div class="panel-h"><h3>Arquivos de SST</h3><span class="sub">ASO, certificados, ficha de EPI e ordem de serviço</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Documento</th><th>Validade</th><th>Arquivo</th></tr></thead><tbody>${linhas.map(([tp,v])=>linha(tp,v)).join('')}${extras.map(tp=>linha(tp,'')).join('')}</tbody></table></div>
      <div class="panel-b">${e?arqHistorico(e.l.filter(a=>a.categoria==='sst')):''}<p class="note" style="margin:8px 0 0">Veem estes arquivos: RH, Diretoria, SST e Administrativo da obra. A validade vem do ASO e dos treinamentos registrados acima.</p></div></section>`;
  }
  if(t==='registros'&&UI.fichaSub.registros==='ates'&&pode('verSaude')){const e=arqDe('colab',c.id);const ed=pode('registrarAtestado');
    const l=c.atestados.slice().sort((a,b)=>b.inicio.localeCompare(a.inicio));let k=0;
    h=h.replace(/<td class="muted" style="font-size:12px">[^<]*<\/td>/g,m=>{const a=l[k++];if(!a)return m;if(!e)return `<td>${carregando}</td>`;
      return `<td>${arqCelula(e.l.filter(x=>x.categoria==='atestado'&&x.ref_id===a.id),ed,{colab:c.id,cat:'atestado',tipo:'Atestado',ref:a.id},'—')}</td>`});
  }
  return h};

/* atestado: o arquivo vai para o armazenamento depois que o registro é aceito */
modalAtes=function(c){
  modal('Registrar atestado',camposAtes(c,null),'Registrar',fd=>{
    const x=C(fd.id);if(!x){atesErro('Selecione o colaborador.');return false}
    const dec=/horas/.test(fd.tipo);if(dec&&!fd.horas){atesErro('Informe as horas da declaração.');return false}
    const arq=fd.arquivo&&fd.arquivo.size?fd.arquivo:null;
    if(arq){const v=arqValidar(arq);if(v.erro){atesErro(v.erro);return false}}
    const r=registrarAtestado(x,{inicio:fd.inicio,dias:dec?'':fd.dias,horas:dec?fd.horas:'',tipo:fd.tipo,cid:fd.cid||'',medico:fd.medico,arquivo:arq?arq.name:''});
    if(r.erro){atesErro(r.erro);return false}
    save();render();
    if(arq)arqEnviarComAviso(arq,{cat:'atestado',colab:x.id,tipoDoc:'Atestado',ref:r.a.id},'Atestado registrado e arquivo anexado.');
    if(fd.tipo==='Acidente de trabalho')toast('Acidente de trabalho: emitir a CAT até o 1º dia útil seguinte e abrir investigação com SMS.',true);
    else if(+fd.dias>15)toast('Mais de 15 dias: a partir do 16º dia o afastamento vai para o INSS. Agende o ASO de retorno.',true);else if(!arq)toast('Atestado registrado; ausência vinculada criada.')});
  setTimeout(atesPrev,0);
};

/* ---------- documentos da obra: arquivo de cada revisão ---------- */
const obraDocsV14=obraDocs;
obraDocs=function(o){const marcas=[];
  for(const x of docsDaObra(o))for(const v of x.versoes||[]){marcas.push([v,v.arquivo]);v.arquivo='\u0001'+v.vid+'\u0001'}
  let h;try{h=obraDocsV14(o)}finally{for(const [v,a] of marcas)v.arquivo=a}
  const e=arqDe('obra',o);const ed=pode('gerirDocObra');
  h=h.replace(/\u0001([^\u0001]*)\u0001<br><small class="muted">só o nome — arquivo não armazenado no protótipo<\/small>/g,(m,vid)=>{
    if(!e)return carregando;const x=docsDaObra(o).find(d=>(d.versoes||[]).some(v=>v.vid===vid));const v=x&&x.versoes.find(y=>y.vid===vid);
    return arqCelula(e.l.filter(a=>a.ref_id===vid),ed,x&&v?{obra:o,cat:'obra',tipo:`${x.tipo} · ${x.titulo} · Rev. ${v.rev}`,ref:vid,validade:v.validade||''}:null)});
  h=h.replace(/<p class="note">Protótipo: o campo de arquivo guarda só o nome\.[^<]*<\/p>/,()=>(e?arqHistorico(e.l):'')+'<p class="note">Os arquivos de cada revisão ficam no armazenamento privado do nTeam e só são vistos por quem tem acesso a esta obra. PDF ou imagem, até 10 MB.</p>');
  return h};
const camposVersaoV14=camposVersao;
camposVersao=function(v){return camposVersaoV14(v).replace('<small class="muted">O protótipo registra só o nome do arquivo.</small>','<small class="muted">PDF ou imagem, até 10 MB. O arquivo é enviado ao salvar.</small>').replace('name="arquivo">',`name="arquivo" accept="${ARQ_ACCEPT}">`)};
const lerVersaoV14=lerVersao;
lerVersao=function(fd,f){const arq=f?.querySelector('[name="arquivo"]')?.files?.[0];
  if(arq){const v=arqValidar(arq);if(v.erro)return {erro:v.erro}}
  const r=lerVersaoV14(fd,f);
  if(r.v&&arq){const vid=r.v.vid;setTimeout(()=>{const x=(DB.docsObra||[]).find(d=>(d.versoes||[]).some(y=>y.vid===vid));if(!x)return;
    arqEnviarComAviso(arq,{obra:x.obraId,cat:'obra',tipo:'',tipoDoc:`${x.tipo} · ${x.titulo} · Rev. ${r.v.rev}`,ref:vid,validade:r.v.validade||''},'Arquivo da revisão anexado.')},80)}
  return r};

/* ---------- ações ---------- */
Object.assign(CHG,{
  arqNovo:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const d=el.dataset;let cat=d.cat,tipo=d.tipo;
    if(d.sel){const s=document.querySelector(d.sel);if(!s)return;[cat,tipo]=s.value.split('|')}
    if(!podeEdCat(cat))return negar();
    arqEnviarComAviso(f,{cat,colab:d.colab,obra:d.obra,tipoDoc:tipo,ref:d.ref,validade:d.validade,depois:()=>{
      if(d.marcar&&d.colab){const c=C(d.colab);if(c&&c.docs&&(c.docs[d.marcar]||0)<1){c.docs[d.marcar]=1;save()}}}})},
  arqSubst:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const a=arqAchar(el.dataset.a);if(!a)return toast('Arquivo não encontrado. Atualize a tela.',true);
    if(!podeEdCat(a.categoria))return negar();
    arqEnviarComAviso(f,{cat:a.categoria,colab:a.colab_id,obra:a.obra_id,tipoDoc:a.tipo_doc,ref:a.ref_id,validade:a.validade,substitui:a.id},'Arquivo substituído. O anterior fica no histórico.')},
  pacIni:el=>{pacEstado(el.dataset.o).ini=el.value||hoje;render()},
  pacFim:el=>{pacEstado(el.dataset.o).fim=el.value||hoje;render()},
  pacCat:el=>{const s=pacEstado(el.dataset.o);if(el.checked)s.cats.add(el.value);else s.cats.delete(el.value);render()},
  pacPessoa:el=>{const s=pacEstado(el.dataset.o);if(el.checked)s.fora.delete(el.value);else s.fora.add(el.value);render()},
  pacTodas:el=>{const s=pacEstado(el.dataset.o);if(el.checked)s.fora.clear();else pacPessoas(el.dataset.o,s).forEach(c=>s.fora.add(c.id));render()},
});
Object.assign(ACT,{
  arqVer:a=>arqAbrir(a.dataset.a),
  arqRemover:b=>{const a=arqAchar(b.dataset.a);if(!a)return;if(!podeEdCat(a.categoria))return negar();
    modalD(`Remover ${esc(a.categoria==='atestado'?'o arquivo do atestado':a.tipo_doc)}?`,`<p class="full" style="margin:0">O arquivo sai da lista e dos pacotes, mas continua guardado no histórico. Só o administrador total pode apagar de vez.</p><div class="field full"><label for="m-arqm">Motivo</label><input class="inp" id="m-arqm" name="motivo" required placeholder="ex.: enviado para a pessoa errada"></div>`,'Remover arquivo',fd=>{
      if(!String(fd.motivo||'').trim())return toast('Informe o motivo.',true),false;
      NUVEM.sb.rpc('remover_arquivo',{p_id:a.id,p_motivo:String(fd.motivo).trim().slice(0,200)}).then(({error})=>{
        if(error)return toast(arqErro(error),true);arqMapa(a.categoria==='obra'?'obra':'colab').delete(a.categoria==='obra'?a.obra_id:a.colab_id);toast('Arquivo removido. Ele continua no histórico.');render()})})},
  pacZip:a=>pacZip(a.dataset.o),
  pacLink:a=>pacLink(a.dataset.o),
  pacEncerrar:b=>{const p=(ARQ.pacotes.get(b.dataset.o)?.l||[]).find(x=>x.id===b.dataset.p);if(!p)return;
    modalD(`Encerrar o link “${esc(p.titulo)}”?`,'<p class="full" style="margin:0">Quem tiver o link e o código deixa de conseguir abrir os documentos imediatamente.</p>','Encerrar link',()=>{
      NUVEM.sb.rpc('revogar_pacote',{p_id:p.id}).then(({error})=>{if(error)return toast('Não foi possível encerrar o link. Tente de novo.',true);ARQ.pacotes.delete(b.dataset.o);toast('Link encerrado.');render()})})},
  copiarTexto:b=>{const t=document.querySelector(b.dataset.alvo);if(!t)return;t.select?.();(navigator.clipboard?.writeText(t.value)||Promise.reject()).then(()=>toast('Copiado.'),()=>{document.execCommand('copy');toast('Copiado.')})},
});

/* ---------- pacote de documentos da obra ---------- */
const podePacote=()=>['rh','dir','sst'].includes(meuPerfil());
const catsPacote=()=>meuPerfil()==='sst'?['sst','obra']:['pessoal','registro','sst','obra'];
const PAC={};
function pacEstado(o){return PAC[o]??=({ini:hoje,fim:hoje,cats:new Set(catsPacote()),fora:new Set()})}
function pacPessoas(o,s){
  return DB.colabs.filter(c=>((c.alocacoes||[]).some(a=>a.status!=='proposta'&&a.obraId===o&&a.inicio<=s.fim&&(!a.fim||a.fim>s.ini)))||(c.status==='Admissão'&&c.obraId===o))
    .filter(c=>!c.desligamento||!c.desligamento.data||c.desligamento.data>=s.ini).sort((a,b)=>a.nome.localeCompare(b.nome))}
function pacExigidos(c,o,s){const out=[];
  for(const d of DB.cfg.docs){const k=catDoc(d);if(s.cats.has(k))out.push([k,d])}
  if(s.cats.has('sst')){out.push(['sst','ASO']);reqTreinos(c,o).forEach(tr=>out.push(['sst','Certificado de '+tr.nome]))}
  return out}
function pacObraArquivos(o,s){const e=ARQ.obra.get(o);if(!e)return [];
  return ativos_(e.l).filter(a=>{const x=docsDaObra(o).find(d=>(d.versoes||[]).some(v=>v.vid===a.ref_id));const v=x&&x.versoes.find(y=>y.vid===a.ref_id);
    return !v||(v.aprovado&&v.inicio<=s.fim&&(!v.fim||v.fim>=s.ini))})}
function pacMontar(o){const s=pacEstado(o);const pessoas=pacPessoas(o,s);const itens=[];const linhas=[];
  for(const c of pessoas){const e=ARQ.col.get(c.id);const at=e?ativos_(e.l).filter(a=>a.categoria!=='atestado'&&s.cats.has(a.categoria)):[];
    const falta=e?pacExigidos(c,o,s).filter(([k,d])=>!at.some(a=>a.categoria===k&&a.tipo_doc===d)).map(([,d])=>d):[];
    const dentro=!s.fora.has(c.id);if(dentro)at.forEach(a=>itens.push({a,c}));linhas.push({c,at,falta,dentro,carregado:!!e})}
  const obra=s.cats.has('obra')?pacObraArquivos(o,s):[];obra.forEach(a=>itens.push({a,c:null}));
  return {s,pessoas,linhas,itens,obra}}
function vPacote(o){
  if(!podePacote())return '<p class="muted">Só RH, Diretoria e SST da obra geram pacotes de documentos.</p>';
  const s=pacEstado(o);const pessoas=pacPessoas(o,s);arqCarregarVarios(pessoas.map(c=>c.id));arqDe('obra',o);pacCarregarLinks(o);
  const m=pacMontar(o);const tot=m.itens.reduce((t,x)=>t+(+x.a.tamanho||0),0);const sst=meuPerfil()==='sst';
  const todos=m.linhas.length&&m.linhas.every(l=>l.dentro);
  const links=ARQ.pacotes.get(o);
  return `<p class="sub">Junte os documentos de quem trabalhou nesta obra para enviar ao cliente ou à fiscalização. Atestados e dados de saúde nunca entram no pacote.</p>
  <section class="panel"><div class="panel-h"><h3>1. Período e tipos de documento</h3></div><div class="panel-b">
    <div class="toolbar" style="margin:0 0 12px"><label class="fl" for="pac-ini"><span class="fl-t">De</span><input class="inp" id="pac-ini" type="date" value="${s.ini}" data-chg="pacIni" data-o="${esc(o)}"></label><label class="fl" for="pac-fim"><span class="fl-t">Até</span><input class="inp" id="pac-fim" type="date" value="${s.fim}" min="${s.ini}" data-chg="pacFim" data-o="${esc(o)}"></label></div>
    <fieldset class="pac-cats"><legend class="fl-t">Incluir</legend>${['pessoal','registro','sst','obra'].map(k=>{const ok=catsPacote().includes(k);return `<label class="inline-chk${ok?'':' muted'}"><input type="checkbox" value="${k}" data-chg="pacCat" data-o="${esc(o)}" ${s.cats.has(k)&&ok?'checked':''} ${ok?'':'disabled'}> ${ARQ_CAT[k]}</label>`}).join('')}</fieldset>
    ${sst?'<p class="note" style="margin:8px 0 0">O perfil SST inclui só documentos de segurança do trabalho e da obra. Documentos pessoais e de registro: peça ao RH.</p>':''}</div></section>
  <section class="panel"><div class="panel-h"><h3>2. Pessoas</h3><span class="sub">${m.linhas.length} pessoa(s) na obra entre ${fmt(s.ini)} e ${fmt(s.fim)}</span></div>
    <div class="tbl-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Marcar todas as pessoas" data-chg="pacTodas" data-o="${esc(o)}" ${todos?'checked':''}></th><th>Colaborador</th><th>Arquivos</th><th>Faltando</th></tr></thead><tbody>
    ${m.linhas.map(l=>`<tr><td><input type="checkbox" value="${esc(l.c.id)}" data-chg="pacPessoa" data-o="${esc(o)}" aria-label="Incluir ${esc(l.c.nome)}" ${l.dentro?'checked':''}></td><td><b>${esc(l.c.nome)}</b><div class="muted" style="font-size:12px">${esc(F(l.c.funcaoId)?.nome||'')}</div></td>
      <td>${l.carregado?(l.at.length?`${l.at.length} arquivo(s)`:'<span class="muted">nenhum</span>'):carregando}</td>
      <td>${l.carregado?(l.falta.length?`<span class="pac-falta">${l.falta.map(esc).join(', ')}</span>`:pillS('Completo','good')):''}</td></tr>`).join('')||`<tr><td colspan="4" class="empty">Ninguém alocado nesta obra no período. Ajuste as datas.</td></tr>`}
    </tbody></table></div></section>
  ${s.cats.has('obra')?`<section class="panel"><div class="panel-h"><h3>Documentos da obra</h3><span class="sub">revisões aprovadas e vigentes no período</span></div><div class="panel-b">${!ARQ.obra.get(o)?carregando:m.obra.length?`<ul class="pac-lista">${m.obra.map(a=>`<li>${esc(a.tipo_doc)} <span class="muted">· ${arqTam(a.tamanho)}</span></li>`).join('')}</ul>`:'<p class="muted" style="margin:0">Nenhum arquivo de documento da obra vigente no período. Anexe na aba Documentos da obra.</p>'}</div></section>`:''}
  <section class="panel"><div class="panel-h"><h3>3. Enviar</h3><span class="sub">${m.itens.length} arquivo(s) · ${arqTam(tot)}</span></div><div class="panel-b">
    <div class="actions"><button class="btn" data-act="pacZip" data-o="${esc(o)}" ${m.itens.length?'':'disabled'}>Baixar ZIP</button><button class="btn primary" data-act="pacLink" data-o="${esc(o)}" ${m.itens.length?'':'disabled'}>Gerar link de acesso</button></div>
    <p class="note" style="margin:10px 0 0">O link vale pelo prazo escolhido e pede um código de 6 dígitos. Depois de 5 códigos errados ele bloqueia por 15 minutos; com 20 erros, é encerrado. Você pode encerrar a qualquer momento.</p></div></section>
  <section class="panel"><div class="panel-h"><h3>Links gerados para esta obra</h3></div><div class="tbl-wrap"><table><thead><tr><th>Pacote</th><th>Gerado</th><th>Vale até</th><th>Situação</th><th>Acessos</th><th></th></tr></thead><tbody>
    ${!links?`<tr><td colspan="6">${carregando}</td></tr>`:links.l.map(p=>{const venc=new Date(p.expira_em)<new Date();const bloq=p.bloqueado_ate&&new Date(p.bloqueado_ate)>new Date();
      const sit=p.revogado_em?pillS('Encerrado','plain'):venc?pillS('Vencido','plain'):bloq?pillS('Bloqueado por tentativas','warn'):pillS('Ativo','good');
      return `<tr><td>${esc(p.titulo)}${p.revogado_motivo&&p.revogado_em?`<div class="muted" style="font-size:12px">${esc(p.revogado_motivo)}</div>`:''}</td><td class="num">${arqData(p.criado_em)}<div class="muted" style="font-size:12px">${esc(p.criado_por_nome||'')}</div></td><td class="num">${arqData(p.expira_em)}</td><td>${sit}</td><td class="num">${p.acessos}${p.ultimo_acesso?`<div class="muted" style="font-size:12px">último ${arqData(p.ultimo_acesso)}</div>`:''}</td><td>${!p.revogado_em&&!venc?`<button class="btn small ghost danger" data-act="pacEncerrar" data-o="${esc(o)}" data-p="${esc(p.id)}">Encerrar</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Nenhum link gerado ainda.</td></tr>'}
    </tbody></table></div></section>`}
async function pacCarregarLinks(o){const e=ARQ.pacotes.get(o);if(e&&Date.now()-e.t<ARQ_TTL)return;const k='pac|'+o;if(ARQ.busy.has(k))return;ARQ.busy.add(k);
  try{const {data,error}=await NUVEM.sb.from('pacote').select('id,titulo,periodo,criado_por_nome,criado_em,expira_em,bloqueado_ate,revogado_em,revogado_motivo,ultimo_acesso,acessos').eq('obra_id',o).order('criado_em',{ascending:false}).limit(100);
    ARQ.pacotes.set(o,{t:Date.now(),l:error?(e?.l||[]):data||[]});if(error)console.error(JSON.stringify({nivel:'erro',etapa:'pacote.ler',msg:error.message}));
    if(!e||JSON.stringify(e.l)!==JSON.stringify(ARQ.pacotes.get(o).l))arqRender()}finally{ARQ.busy.delete(k)}}
const nomeSeguro=t=>String(t||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim().slice(0,90)||'arquivo';
function carregarZip(){return window.JSZip?Promise.resolve():new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='/vendor/jszip-3.10.1.min.js';sc.onload=ok;sc.onerror=()=>no(new Error('zip'));document.head.appendChild(sc)})}
let pacOcupado=false;
async function pacZip(o){if(pacOcupado)return;const m=pacMontar(o);if(!m.itens.length)return toast('Nenhum arquivo selecionado.',true);
  pacOcupado=true;try{await carregarZip()}catch(e){pacOcupado=false;return toast('Não foi possível preparar o ZIP. Verifique a internet.',true)}
  const zip=new JSZip();const raiz=nomeSeguro(nomeObra(o))+' - documentos';const usados=new Set();let falhas=0;
  const caminhoZip=(x)=>{const ext=ARQ_MIME[x.a.mime]||'pdf';const pasta=x.c?`${nomeSeguro(x.c.nome)}/${ARQ_CAT[x.a.categoria]}`:'Documentos da obra';
    let base=`${raiz}/${pasta}/${nomeSeguro(x.a.tipo_doc)}`;let p=base+'.'+ext,n=2;while(usados.has(p))p=`${base} (${n++}).${ext}`;usados.add(p);return p};
  for(let i=0;i<m.itens.length;i++){const x=m.itens[i];if(i%5===0)toast(`Preparando ZIP: ${i+1} de ${m.itens.length}…`);
    const {data,error}=await NUVEM.sb.storage.from('documentos').download(x.a.caminho);if(error||!data){falhas++;continue}zip.file(caminhoZip(x),data)}
  const leia=[`nTeam · NTN Engenharia`,`Obra: ${nomeObra(o)}`,`Período: ${fmt(m.s.ini)} a ${fmt(m.s.fim)}`,`Gerado em ${new Date().toLocaleString('pt-BR')} por ${NUVEM.usuario.nome}`,'',
    'Pendências de documentos:',...m.linhas.filter(l=>l.dentro&&l.falta.length).map(l=>`- ${l.c.nome}: ${l.falta.join('; ')}`),m.linhas.some(l=>l.dentro&&l.falta.length)?'':'- nenhuma','',
    'Documentos com dados pessoais. Uso restrito à finalidade da solicitação (LGPD).'].join('\r\n');
  zip.file(`${raiz}/LEIA-ME.txt`,leia);
  const blob=await zip.generateAsync({type:'blob'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${nomeSeguro(nomeObra(o))} - documentos ${m.s.ini}.zip`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  audArq('Baixou pacote de documentos (ZIP)',{id:'*',categoria:'obra',tipo_doc:`${m.itens.length-falhas} arquivo(s) · ${fmt(m.s.ini)} a ${fmt(m.s.fim)}`,obra_id:o});
  pacOcupado=false;toast(falhas?`ZIP baixado, mas ${falhas} arquivo(s) não puderam ser incluídos.`:'ZIP baixado.',!!falhas)}
function pacLink(o){const m=pacMontar(o);if(!m.itens.length)return toast('Nenhum arquivo selecionado.',true);if(m.itens.length>500)return toast('No máximo 500 arquivos por link. Reduza o período ou as pessoas.',true);
  const tit=`Documentos · ${nomeObra(o)} · ${fmt(m.s.ini)}${m.s.fim!==m.s.ini?' a '+fmt(m.s.fim):''}`;
  modal('Gerar link de acesso',`<p class="full" style="margin:0">${m.itens.length} arquivo(s) de ${m.linhas.filter(l=>l.dentro&&l.at.length).length} pessoa(s)${m.obra.length?` e ${m.obra.length} documento(s) da obra`:''}.</p>
    <div class="field full"><label for="m-pt">Nome do pacote (aparece para quem recebe)</label><input class="inp" id="m-pt" name="titulo" maxlength="160" value="${esc(tit)}" required></div>
    <div class="field"><label for="m-pd">Validade do link</label><select class="inp" id="m-pd" name="dias">${[[1,'1 dia'],[3,'3 dias'],[7,'7 dias'],[15,'15 dias'],[30,'30 dias']].map(([d,t])=>`<option value="${d}" ${d===7?'selected':''}>${t}</option>`).join('')}</select></div>`,'Gerar link',fd=>{
    const titulo=String(fd.titulo||'').trim();if(!titulo)return toast('Informe o nome do pacote.',true),false;
    NUVEM.sb.rpc('criar_pacote',{p_obra:o,p_titulo:titulo,p_dias:+fd.dias||7,p_arquivos:m.itens.map(x=>x.a.id),p_periodo:`${fmt(m.s.ini)} a ${fmt(m.s.fim)}`}).then(({data,error})=>{
      if(error){console.error(JSON.stringify({nivel:'erro',etapa:'criar_pacote',msg:error.message}));
        return toast(/itens_nao_permitidos/.test(error.message)?'Algum arquivo mudou ou não pode ser compartilhado pelo seu perfil. Atualize a tela e tente de novo.':/sem_permissao/.test(error.message)?'Seu perfil não pode gerar pacote para esta obra.':/obra_invalida/.test(error.message)?'A obra ainda não foi salva no servidor. Aguarde “Tudo salvo” e tente de novo.':'Não foi possível gerar o link. Tente de novo.',true)}
      ARQ.pacotes.delete(o);render();
      const url=`${location.origin}/p#${data.token}`;
      modalInfo('Link gerado',`<p style="margin-top:0">Envie o <b>link</b> e o <b>código</b> por canais diferentes (por exemplo: o link por e-mail e o código por WhatsApp ou telefone). <b>O código não aparece de novo.</b></p>
        <div class="field"><label for="pac-url">Link</label><input class="inp" id="pac-url" readonly value="${esc(url)}" style="width:100%"></div><div class="actions" style="margin:6px 0 14px"><button class="btn" data-act="copiarTexto" data-alvo="#pac-url">Copiar link</button></div>
        <div class="field"><label for="pac-cod">Código de acesso</label><input class="inp pac-cod" id="pac-cod" readonly value="${esc(data.codigo)}"></div><div class="actions" style="margin:6px 0 14px"><button class="btn" data-act="copiarTexto" data-alvo="#pac-cod">Copiar código</button></div>
        <p class="note" style="margin:0">Vale até ${new Date(data.expira_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}. Para cancelar antes, use “Encerrar” na lista de links da obra.</p>`)})})}

/* aba "Pacote de documentos" na obra (RH, Diretoria e SST) */
const vObraV14=vObra;
vObra=function(id){
  if(UI.obraTab==='pacote'&&!podePacote())UI.obraTab='geral';
  if(UI.obraTab!=='pacote'){let h=vObraV14(id);if(podePacote())h=h.replace(/(<div class="seg" role="group"[^>]*>)([\s\S]*?)(<\/div>)/,(m,a,b,c)=>a+b+`<button data-act="obraTab" data-v="pacote" aria-pressed="false">Pacote de documentos</button>`+c);return h}
  const sv=UI.obraTab;UI.obraTab='geral';let h;try{h=vObraV14(id)}finally{UI.obraTab=sv}
  h=h.replace(/(<div class="seg" role="group"[^>]*>)([\s\S]*?)(<\/div>)/,(m,a,b,c)=>a+b.replace(/aria-pressed="true"/g,'aria-pressed="false"')+`<button data-act="obraTab" data-v="pacote" aria-pressed="true">Pacote de documentos</button>`+c);
  const i=h.indexOf('</div>',h.indexOf('class="seg"'))+6;
  return h.slice(0,h.indexOf('</div>',i)+6)+`<div class="pac">${vPacote(id)}</div>`};

/* ---------- Configurações › Dados: uso do armazenamento ---------- */
const cfgDadosNuvemV14=cfgDadosNuvem;
cfgDadosNuvem=function(){let h=cfgDadosNuvemV14();if(!['rh','dir'].includes(meuPerfil()))return h;
  if(ARQ.uso===undefined){ARQ.uso=null;NUVEM.sb.rpc('uso_armazenamento').then(({data,error})=>{ARQ.uso=error?-1:+data||0;arqRender()})}
  const lim=1073741824;const u=ARQ.uso;
  return h+`<section class="panel"><div class="panel-h"><h3>Armazenamento de arquivos</h3></div><div class="panel-b">${u==null?carregando:u<0?'<p class="muted" style="margin:0">Não foi possível consultar o uso agora.</p>':`<div class="progress"><i style="width:${Math.min(100,u/lim*100).toFixed(1)}%"></i></div><p style="margin:8px 0 0">${arqTam(u)} de 1 GB usados (plano gratuito).${u>lim*0.8?' <b>Perto do limite:</b> avalie o plano pago do Supabase.':''}</p>`}</div></section>`};
