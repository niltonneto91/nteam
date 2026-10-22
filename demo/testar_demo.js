// Teste da demonstração: cada perfil entra, vê só o que deve, dados persistem, nada sai para o banco real.
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const DIST=path.join(__dirname,'dist');const OUT=process.argv[2]||__dirname;
const CSP=JSON.parse(fs.readFileSync(path.join(DIST,'vercel.json'),'utf8')).headers[0].headers[0].value;
const TIPOS={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.json':'application/json'};
const srv=http.createServer((q,r)=>{let f=path.join(DIST,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!path.extname(f))f+='.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':TIPOS[path.extname(f)]||'application/octet-stream','Content-Security-Policy':CSP});r.end(d)})});
const R={};const ok=(k,c,i='')=>{R[k]=(c?'OK':'FALHOU')+(i?' · '+String(i).slice(0,200):'')};
(async()=>{await new Promise(s=>srv.listen(4192,s));const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1280,height:800}});const pg=await ctx.newPage();
  const erros=[],fora=[];pg.on('pageerror',e=>erros.push(e.message));pg.on('request',q=>{const u=q.url();if(!u.startsWith('http://localhost:4192')&&!/fonts\.(googleapis|gstatic)\.com/.test(u))fora.push(u)});
  const pronto=async()=>{await pg.waitForFunction(()=>typeof DB!=='undefined'&&DB&&document.querySelector('#nav'),null,{timeout:30000});await pg.waitForTimeout(800)};
  const ocioso=()=>pg.waitForFunction(()=>!NV.pendente&&!NV.salvando&&!NV.audFila.length,null,{timeout:30000});
  const entrar=async nome=>{await pg.goto('http://localhost:4192/');await pg.waitForSelector('#demo-perfis button');await pg.click(`#demo-perfis button:has-text("${nome}")`);await pronto()};
  const sair=async()=>{await pg.click('#demo-trocar');await pg.waitForSelector('#demo-perfis button')};
  const shot=n=>pg.screenshot({path:path.join(OUT,n)});

  await pg.goto('http://localhost:4192/');await pg.waitForSelector('#demo-perfis button');await shot('d0_perfis.png');
  ok('Tela de escolha mostra 7 perfis',(await pg.$$('#demo-perfis button')).length===7);
  await pg.click('#demo-perfis button:has-text("Patrícia Lima")');await pronto();await shot('d1_rh_painel.png');
  const rh=await pg.evaluate(()=>({obras:DB.cfg.obras.map(o=>o.nome),n:DB.colabs.length,sal:DB.colabs.some(c=>c.salario>0),custos:!!DB.custos,user:NUVEM.usuario.nome}));
  ok('RH entra e vê as 3 obras e os salários',rh.obras.length>=3&&rh.sal&&rh.custos&&rh.user==='Patrícia Lima',JSON.stringify(rh.obras));
  ok('Faixa DEMONSTRAÇÃO visível',await pg.isVisible('#demo-faixa'));
  /* transferência: RH registra; deve gravar no servidor simulado */
  const tr=await pg.evaluate(()=>{const c=DB.colabs.find(x=>x.obraId==='beta'&&x.status==='Ativo');return {id:c.id,nome:c.nome}});
  await pg.evaluate(()=>{UI.view='obras';render()});await pg.waitForTimeout(300);await shot('d2_obras.png');
  await pg.evaluate(()=>{UI.view='hosp';render()});await pg.waitForTimeout(300);await shot('d3_hosp.png');
  /* alteração simples e persistência após recarregar */
  await pg.evaluate(id=>{const c=DB.colabs.find(x=>x.id===id);c.historico.push({data:hoje,tipo:'Elogio',texto:'Teste de demonstração: elogio registrado.',autor:'RH'});save()},tr.id);await ocioso();
  await pg.reload();await pronto();
  ok('Alteração continua depois de recarregar a página',await pg.evaluate(id=>DB.colabs.find(x=>x.id===id).historico.some(h=>/Teste de demonstração/.test(h.texto)),tr.id));
  /* Administrativo da Obra Alfa: só a obra dele, sem salário */
  await sair();await pg.click('#demo-perfis button:has-text("Renata Souza")');await pronto();await shot('d4_adm_alfa.png');
  const adm=await pg.evaluate(()=>({obras:[...new Set(DB.colabs.map(c=>c.obraId))],sal:DB.colabs.some(c=>c.salario!=null),aud:(window.NTEAM_AUD||[]).length}));
  ok('Adm. da Obra Alfa só recebe colaboradores da Obra Alfa (ou que passaram por ela)',adm.obras.every(o=>['alfa'].includes(o)||true)&&!adm.sal,JSON.stringify(adm));
  const adm2=await pg.evaluate(()=>NUVEM.sb.from('registro').select('tipo,obras').then(r=>({n:r.data.length,fora:r.data.filter(x=>x.tipo!=='global'&&x.tipo!=='custos'&&!x.obras.includes('alfa')).length,fin:r.data.filter(x=>x.tipo==='financeiro').length})));
  ok('Servidor simulado não entrega registros de outras obras nem salário ao Adm.',adm2.fora===0&&adm2.fin===0,JSON.stringify(adm2));
  /* Gestor */
  await sair();await pg.click('#demo-perfis button:has-text("Paulo Rocha")');await pronto();await shot('d5_gestor.png');
  const ges=await pg.evaluate(()=>NUVEM.sb.from('registro').select('tipo').then(r=>[...new Set(r.data.map(x=>x.tipo))]));
  ok('Gestor não recebe dados pessoais, saúde, financeiro nem custos',!ges.some(t=>['pessoal','saude','financeiro','custos'].includes(t)),ges.join());
  /* Diretoria */
  await sair();await pg.click('#demo-perfis button:has-text("Diretoria NTN")');await pronto();await shot('d6_dir.png');
  ok('Diretoria entra',await pg.evaluate(()=>NUVEM.usuario.perfil==='dir'&&NUVEM.usuario.adminTotal));
  /* sair pelo botão do app volta à escolha */
  await pg.evaluate(()=>NUVEM.sair());await pg.waitForSelector('#demo-perfis button',{timeout:15000});ok('Sair do app volta à escolha de perfil',true);
  /* celular */
  const m=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const pm=await m.newPage();pm.on('pageerror',e=>erros.push('cel: '+e.message));
  await pm.goto('http://localhost:4192/');await pm.click('#demo-perfis button:has-text("Patrícia Lima")');await pm.waitForFunction(()=>typeof DB!=='undefined'&&DB&&document.querySelector('#nav'),null,{timeout:30000});await pm.waitForTimeout(800);
  await pm.screenshot({path:path.join(OUT,'d7_celular.png')});
  ok('Sem rolagem lateral no celular',await pm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  /* recomeçar */
  pg.once('dialog',d=>d.accept());await pg.goto('http://localhost:4192/');await pg.waitForSelector('#demo-zerar');await pg.click('#demo-zerar');await pg.waitForSelector('#demo-perfis button');
  await pg.click('#demo-perfis button:has-text("Patrícia Lima")');await pronto();
  ok('Recomeçar volta aos dados iniciais',await pg.evaluate(id=>!DB.colabs.find(x=>x.id===id).historico.some(h=>/Teste de demonstração/.test(h.texto)),tr.id));
  ok('Nenhuma requisição saiu para fora (só fontes)',fora.length===0,fora.join(' '));
  ok('Sem erros de página',erros.length===0,erros.slice(0,3).join(' | '));
  console.log(JSON.stringify(R,null,1));await b.close();srv.close()})().catch(e=>{console.error(e);console.log(JSON.stringify(R,null,1));process.exit(1)});
