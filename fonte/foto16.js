
/* =====================================================================
   v16 · FOTO — tirar foto do documento pelo celular ou tablet
   - Botão "Tirar foto" ao lado de cada "Anexar" e "Substituir" (só em telas de toque).
   - Usa a câmera do aparelho pelo próprio campo de arquivo: não precisa liberar a câmera no site.
   - Prévia antes de enviar: girar, tirar de novo, adicionar página (frente e verso / várias folhas).
   - Uma página vira JPG; várias viram um PDF único, na mesma caixinha do documento.
   - A foto é redesenhada no navegador: sai sem localização e sem outros dados da câmera,
     e fica com no máximo 2000 px no lado maior (lê bem e ocupa pouco espaço).
   ===================================================================== */
const FOTO={max:2000,qual:0.82,paginas:10};
const fotoNaTela=()=>{try{return matchMedia('(pointer: coarse)').matches}catch(e){return false}};
function fotoBotao(dados,rot,chg){const id='arqf-'+uid();
  const attrs=Object.entries(dados).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ');
  return `<label class="btn small foto-btn" for="${id}">${rot}</label><input type="file" hidden id="${id}" accept="image/*" capture="environment" data-chg="${chg}" ${attrs} aria-label="${esc(rot)}">`}

/* "Anexar" e "Substituir" ganham "Tirar foto" no celular */
const arqAnexarV15=arqAnexar;
arqAnexar=function(dados,rot='Anexar'){const h=arqAnexarV15(dados,rot);
  return fotoNaTela()?h+fotoBotao(dados,rot==='Anexar outro'?'Foto de outro':'Tirar foto','arqFoto'):h};
const arqLinhaV15=arqLinha;
arqLinha=function(a,ed){const h=arqLinhaV15(a,ed);if(!ed||!fotoNaTela())return h;
  return h.replace(`<button type="button" class="btn small ghost danger" data-act="arqRemover" data-a="${a.id}">`,fotoBotao({a:a.id},'Nova foto','arqFotoSubst')+`<button type="button" class="btn small ghost danger" data-act="arqRemover" data-a="${a.id}">`)};

/* campos de arquivo dentro de formulários (atestado e revisão de documento da obra) */
function fotoCampo(alvo,tipo){return fotoNaTela()?`<div class="foto-campo">${fotoBotao({alvo:'#'+alvo,tipo},'Tirar foto','arqFotoCampo')}<small class="muted" id="${alvo}-foto" aria-live="polite"></small></div>`:''}
const camposAtesV15=camposAtes;
camposAtes=function(c,a){const h=camposAtesV15(c,a);
  return h.replace(/(<input class="inp" type="file" id="m-f" name="arquivo"[^>]*>)/,(m)=>m+fotoCampo('m-f','Atestado'))};
const camposVersaoV15=camposVersao;
camposVersao=function(v){const h=camposVersaoV15(v);
  return h.replace(/(<input class="inp" id="m-darq" type="file" name="arquivo"[^>]*>)/,(m)=>m+fotoCampo('m-darq','Documento da obra'))};

/* ---------- tratamento da imagem ---------- */
function fotoCarregar(file){return new Promise((ok,no)=>{const u=URL.createObjectURL(file);const im=new Image();
  im.onload=()=>{URL.revokeObjectURL(u);ok(im)};im.onerror=()=>{URL.revokeObjectURL(u);no(new Error('imagem'))};im.src=u})}
function fotoDesenhar(p,max){const im=p.img;const w0=im.naturalWidth,h0=im.naturalHeight;const esc_=Math.min(1,max/Math.max(w0,h0));
  const w=Math.max(1,Math.round(w0*esc_)),h=Math.max(1,Math.round(h0*esc_));const gira=p.rot%2===1;
  const cv=document.createElement('canvas');cv.width=gira?h:w;cv.height=gira?w:h;const g=cv.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.translate(cv.width/2,cv.height/2);g.rotate(p.rot*Math.PI/2);g.drawImage(im,-w/2,-h/2,w,h);return cv}
const fotoBlob=cv=>new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('jpeg')),'image/jpeg',FOTO.qual));
/* PDF mínimo: uma imagem JPEG por página A4, centralizada */
function fotoPdf(pags){const enc=new TextEncoder();const partes=[];let pos=0;const offs=[];
  const add=x=>{const b=typeof x==='string'?enc.encode(x):x;partes.push(b);pos+=b.length};
  const n=pags.length,total=3+3*n;add('%PDF-1.4\n%âãÏÓ\n');
  const obj=(id,s)=>{offs[id]=pos;add(`${id} 0 obj\n${s}\nendobj\n`)};
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Count ${n} /Kids [${pags.map((_,i)=>`${3+3*i} 0 R`).join(' ')}] >>`);
  pags.forEach((p,i)=>{const id=3+3*i;const W=595,H=842,M=20;const k=Math.min((W-2*M)/p.w,(H-2*M)/p.h);const dw=(p.w*k).toFixed(2),dh=(p.h*k).toFixed(2);
    const x=((W-p.w*k)/2).toFixed(2),y=((H-p.h*k)/2).toFixed(2);const cs=`q ${dw} 0 0 ${dh} ${x} ${y} cm /Im0 Do Q`;
    obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id+2} 0 R >> >> /Contents ${id+1} 0 R >>`);
    obj(id+1,`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    offs[id+2]=pos;add(`${id+2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);add(p.jpg);add('\nendstream\nendobj\n')});
  const xref=pos;add(`xref\n0 ${total}\n0000000000 65535 f \n`);for(let i=1;i<total;i++)add(String(offs[i]).padStart(10,'0')+' 00000 n \n');
  add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);return new Blob(partes,{type:'application/pdf'})}
async function fotoArquivo(pags,tipo){const nome=nomeSeguro(tipo||'documento');
  if(pags.length===1){const b=await fotoBlob(fotoDesenhar(pags[0],FOTO.max));return new File([b],nome+'.jpg',{type:'image/jpeg'})}
  const out=[];for(const p of pags){const cv=fotoDesenhar(p,FOTO.max);const b=await fotoBlob(cv);out.push({jpg:new Uint8Array(await b.arrayBuffer()),w:cv.width,h:cv.height})}
  return new File([fotoPdf(out)],nome+'.pdf',{type:'application/pdf'})}

/* ---------- tela de prévia ---------- */
let fotoAtual=null;
function fotoAbrir(file,tipo){return new Promise(async fim=>{
  if(fotoAtual)fotoAtual.fechar(null);
  const st={pags:[],sel:0,tipo:tipo||'Documento',ocupado:false};
  const ov=document.createElement('div');ov.className='foto-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','foto-t');
  const inpId='foto-mais-'+uid();
  ov.innerHTML=`<div class="foto-box"><header><h2 id="foto-t">Foto · ${esc(st.tipo)}</h2><button type="button" class="x-btn" data-f="cancelar" aria-label="Cancelar foto">×</button></header>
    <div class="foto-prev"><img alt="" id="foto-img"></div><div class="foto-pags" role="list"></div>
    <p class="foto-dica">Confira se dá para ler tudo. Frente e verso ou mais de uma folha do mesmo documento: use “Adicionar página”.</p>
    <div class="foto-acoes"><button type="button" class="btn" data-f="girar">Girar</button><label class="btn" for="${inpId}" data-f="refazer">Tirar de novo</label>
      <label class="btn" for="${inpId}" data-f="mais">Adicionar página</label><button type="button" class="btn primary" data-f="usar">Usar foto</button></div>
    <input type="file" hidden id="${inpId}" accept="image/*" capture="environment" aria-label="Tirar foto"></div>`;
  document.body.appendChild(ov);document.body.classList.add('foto-aberta');
  const $f=s=>ov.querySelector(s);let modo='mais';
  const desenhar=async()=>{const p=st.pags[st.sel];if(!p)return;$f('#foto-img').src=fotoDesenhar(p,1100).toDataURL('image/jpeg',0.8);
    $f('#foto-img').alt=`Prévia da página ${st.sel+1} de ${st.pags.length}`;
    $f('.foto-pags').innerHTML=st.pags.length>1?st.pags.map((x,i)=>`<div role="listitem" class="foto-pag${i===st.sel?' sel':''}"><button type="button" data-f="ver" data-i="${i}" aria-label="Ver página ${i+1}" aria-pressed="${i===st.sel}"><img alt="" src="${fotoDesenhar(x,160).toDataURL('image/jpeg',0.7)}"><span>${i+1}</span></button><button type="button" class="foto-rm" data-f="tirar" data-i="${i}" aria-label="Tirar a página ${i+1}">×</button></div>`).join(''):'';
    $f('[data-f="usar"]').textContent=st.pags.length>1?`Usar ${st.pags.length} páginas`:'Usar foto';
    $f('[data-f="mais"]').style.display=st.pags.length>=FOTO.paginas?'none':''};
  const incluir=async(f,trocar)=>{if(!f)return;if(!/^image\//.test(f.type||'image/')){toast('Isso não é uma foto. Tente de novo.',true);return}
    try{const img=await fotoCarregar(f);const p={img,rot:0};if(trocar&&st.pags.length)st.pags[st.sel]=p;else{st.pags.push(p);st.sel=st.pags.length-1}await desenhar()}
    catch(e){toast('Não foi possível ler a foto. Tente de novo.',true)}};
  const fechar=v=>{if(!fotoAtual)return;fotoAtual=null;window.removeEventListener('keydown',tecla,true);ov.remove();document.body.classList.remove('foto-aberta');
    if(st.foco&&document.contains(st.foco))st.foco.focus();fim(v)};
  const tecla=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();fechar(null)}};
  st.foco=document.activeElement;fotoAtual={fechar};window.addEventListener('keydown',tecla,true);
  ov.addEventListener('click',async e=>{const b=e.target.closest('[data-f]');if(!b||st.ocupado)return;const f=b.dataset.f;
    if(f==='cancelar')return fechar(null);
    if(f==='girar'){const p=st.pags[st.sel];if(p){p.rot=(p.rot+1)%4;desenhar()}return}
    if(f==='refazer'){modo='trocar';return}if(f==='mais'){modo='mais';return}
    if(f==='ver'){st.sel=+b.dataset.i;desenhar();return}
    if(f==='tirar'){st.pags.splice(+b.dataset.i,1);st.sel=Math.max(0,Math.min(st.sel,st.pags.length-1));if(!st.pags.length)return fechar(null);desenhar();return}
    if(f==='usar'){st.ocupado=true;b.textContent='Preparando…';try{const arq=await fotoArquivo(st.pags,st.tipo);fechar(arq)}catch(x){st.ocupado=false;desenhar();toast('Não foi possível preparar a foto. Tente de novo.',true)}}});
  $f('#'+inpId).addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';incluir(f,modo==='trocar');modo='mais'});
  await incluir(file,false);if(!st.pags.length)return fechar(null);
  $f('[data-f="usar"]').focus()})}

/* ---------- ligações ---------- */
Object.assign(CHG,{
  arqFoto:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const d={...el.dataset};
    let tipo=d.tipo;if(d.sel){const s=document.querySelector(d.sel);if(s)tipo=s.value.split('|')[1]}
    fotoAbrir(f,tipo).then(arq=>{if(arq)CHG.arqNovo({files:[arq],dataset:d,value:''})})},
  arqFotoSubst:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const a=arqAchar(el.dataset.a);if(!a)return toast('Arquivo não encontrado. Atualize a tela.',true);
    fotoAbrir(f,a.categoria==='atestado'?'Atestado':a.tipo_doc).then(arq=>{if(arq)CHG.arqSubst({files:[arq],dataset:{a:a.id},value:''})})},
  arqFotoCampo:el=>{const f=el.files&&el.files[0];el.value='';if(!f)return;const alvo=document.querySelector(el.dataset.alvo);const aviso=document.querySelector(el.dataset.alvo+'-foto');
    fotoAbrir(f,el.dataset.tipo).then(arq=>{if(!arq||!alvo)return;
      try{const dt=new DataTransfer();dt.items.add(arq);alvo.files=dt.files}catch(e){return toast('Este navegador não deixa usar a foto aqui. Use “Escolher arquivo”.',true)}
      if(aviso)aviso.textContent=`Foto pronta: ${arq.type==='application/pdf'?'PDF com várias páginas':'1 página'} (${arqTam(arq.size)}). Ela é enviada ao salvar.`})},
});
