/* nTeam · página pública do pacote de documentos (link + código de 6 dígitos) */
(function(){
  'use strict';
  var FUNCAO='https://yyylvkofbdhrlaizvoop.supabase.co/functions/v1/pacote-publico';
  var CHAVE='sb_publishable_r_jFrf7J221m5JevAJgbeg_b6wSiXem';
  var EXT={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  var CAT={pessoal:'Documentos pessoais',registro:'Registro e contrato',sst:'Segurança do trabalho',obra:'Documentos da obra'};
  var token=(location.hash||'').slice(1).toLowerCase();
  var codigoAtual='',pacote=null,zipCarregado=false;
  var $=function(id){return document.getElementById(id)};
  function el(tag,attrs,filhos){var e=document.createElement(tag);for(var k in attrs||{}){if(k==='texto')e.textContent=attrs[k];else e.setAttribute(k,attrs[k])}(filhos||[]).forEach(function(f){if(f)e.appendChild(f)});return e}
  function tam(b){b=+b||0;return b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(1).replace('.',',')+' MB'}
  function data(iso,hora){if(!iso)return '';var d=new Date(iso.length===10?iso+'T12:00:00':iso);return hora?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):d.toLocaleDateString('pt-BR')}
  function seguro(t){return String(t||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim().slice(0,90)||'arquivo'}
  function erro(msg){$('erro').textContent=msg||''}

  if(!/^[0-9a-f]{36}$/.test(token)){
    $('etapa-codigo').innerHTML='';
    $('etapa-codigo').appendChild(el('h1',{texto:'Link incompleto'}));
    $('etapa-codigo').appendChild(el('p',{texto:'O endereço deste link está incompleto. Abra de novo a mensagem que você recebeu e copie o link inteiro.'}));
    return;
  }

  function abrir(codigo){
    var b=$('entrar');if(b){b.disabled=true;b.textContent='Conferindo…'}erro('');
    return fetch(FUNCAO,{method:'POST',headers:{'Content-Type':'application/json',apikey:CHAVE},body:JSON.stringify({token:token,codigo:codigo}),credentials:'omit',referrerPolicy:'no-referrer'})
      .then(function(r){return r.json().catch(function(){return {ok:false,mensagem:'Resposta inválida do servidor. Tente de novo.'}})})
      .then(function(j){
        if(b){b.disabled=false;b.textContent='Abrir documentos'}
        if(!j.ok){var m=j.mensagem||'Não foi possível abrir os documentos.';if(j.erro==='codigo'&&j.restantes!=null)m+=j.restantes>0?' Restam '+j.restantes+' tentativa(s) antes de um bloqueio de 15 minutos.':' O acesso foi bloqueado por 15 minutos.';erro(m);return false}
        codigoAtual=codigo;pacote=j;mostrar();return true})
      .catch(function(){if(b){b.disabled=false;b.textContent='Abrir documentos'}erro('Sem conexão com o servidor. Verifique a internet e tente de novo.');return false});
  }

  $('form-codigo').addEventListener('submit',function(e){e.preventDefault();var c=$('codigo').value.replace(/\D/g,'');
    if(c.length!==6){erro('O código tem 6 números.');$('codigo').focus();return}abrir(c)});
  $('codigo').addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').slice(0,6);erro('')});

  function mostrar(){
    var s=$('etapa-docs');s.innerHTML='';$('etapa-codigo').classList.add('oculto');s.classList.remove('oculto');
    s.appendChild(el('h1',{texto:pacote.titulo||'Documentos'}));
    s.appendChild(el('div',{class:'meta'},[el('span',{texto:'Obra: '+(pacote.obra||'—')}),pacote.periodo?el('span',{texto:'Período: '+pacote.periodo}):null,el('span',{texto:'Link válido até '+data(pacote.expira_em,true)})]));
    var itens=pacote.itens||[];
    if(!itens.length){s.appendChild(el('p',{texto:'Este pacote não tem documentos disponíveis no momento. Fale com quem enviou o link.'}));return}
    s.appendChild(el('p',{texto:itens.length+' documento(s). Os botões de abrir valem por 10 minutos; depois disso, use “Atualizar” para continuar.'}));
    var zip=el('button',{type:'button',id:'zip'},[document.createTextNode('Baixar tudo (ZIP)')]);zip.addEventListener('click',baixarZip);
    var att=el('button',{type:'button',class:'sec'},[document.createTextNode('Atualizar')]);att.addEventListener('click',function(){abrir(codigoAtual)});
    s.appendChild(el('div',{class:'acoes'},[zip,att]));
    s.appendChild(el('p',{class:'erro',id:'erro-zip',role:'alert'}));
    var grupos={};itens.forEach(function(i){var g=i.colaborador||'Documentos da obra';(grupos[g]=grupos[g]||[]).push(i)});
    Object.keys(grupos).forEach(function(g){
      s.appendChild(el('h2',{texto:g}));
      var ul=el('ul',{class:'docs'});
      grupos[g].forEach(function(i){
        var info=el('div',{},[el('div',{class:'doc-t',texto:i.documento}),el('div',{class:'doc-m',texto:(i.colaborador?(CAT[i.categoria]||'')+' · ':'')+(EXT[i.mime]||'arquivo').toUpperCase()+' · '+tam(i.tamanho)+(i.validade?' · válido até '+data(i.validade):'')})]);
        var a=i.url?el('a',{class:'botao sec',href:i.url,target:'_blank',rel:'noopener noreferrer',texto:'Abrir'}):el('span',{class:'doc-m',texto:'indisponível'});
        ul.appendChild(el('li',{},[info,a]))});
      s.appendChild(ul)});
    s.querySelector('h1').setAttribute('tabindex','-1');s.querySelector('h1').focus();
  }

  function carregarZip(){if(window.JSZip)return Promise.resolve();return new Promise(function(ok,no){var sc=document.createElement('script');sc.src='/vendor/jszip-3.10.1.min.js';sc.onload=ok;sc.onerror=no;document.head.appendChild(sc)})}
  function baixarZip(){
    var b=$('zip'),ez=$('erro-zip');b.disabled=true;ez.textContent='';
    carregarZip().then(function(){
      var z=new JSZip(),raiz=seguro(pacote.titulo),usados={},falhas=0,itens=pacote.itens.filter(function(i){return i.url}),n=0;
      function proximo(){
        if(n>=itens.length)return z.generateAsync({type:'blob'}).then(function(blob){
          var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=raiz+'.zip';document.body.appendChild(a);a.click();
          setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);b.disabled=false;b.textContent='Baixar tudo (ZIP)';
          if(falhas)ez.textContent=falhas+' documento(s) não entraram no ZIP. Clique em “Atualizar” e baixe de novo.'});
        var i=itens[n++];b.textContent='Preparando '+n+' de '+itens.length+'…';
        return fetch(i.url,{credentials:'omit',referrerPolicy:'no-referrer'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob()}).then(function(bl){
          var ext=EXT[i.mime]||'pdf';
          var pasta=i.colaborador?seguro(i.colaborador)+'/'+(CAT[i.categoria]||'Outros'):'Documentos da obra';
          var base=raiz+'/'+pasta+'/'+seguro(i.documento),p=base+'.'+ext,k=2;while(usados[p])p=base+' ('+(k++)+').'+ext;usados[p]=1;z.file(p,bl)})
          .catch(function(){falhas++}).then(proximo)}
      return proximo()})
    .catch(function(){b.disabled=false;b.textContent='Baixar tudo (ZIP)';ez.textContent='Não foi possível preparar o ZIP. Abra os documentos um a um ou tente de novo.'})}

  $('codigo').focus();
})();
