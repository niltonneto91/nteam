const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const DIST=path.join(__dirname,'dist');const OUT=process.argv[2];
const CSP=JSON.parse(fs.readFileSync(path.join(DIST,'vercel.json'),'utf8')).headers[0].headers[0].value;
const T={'.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json'};
const srv=http.createServer((q,r)=>{let f=path.join(DIST,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';if(!path.extname(f))f+='.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Content-Security-Policy':CSP});r.end(d)})});
const R={};const ok=(k,c,i='')=>{R[k]=(c?'OK':'FALHOU')+(i?' · '+String(i).slice(0,240):'')};
(async()=>{await new Promise(s=>srv.listen(4193,s));const b=await chromium.launch();const pg=await (await b.newContext({viewport:{width:1280,height:800}})).newPage();
 const erros=[];pg.on('pageerror',e=>erros.push(e.message));
 const pronto=async()=>{await pg.waitForFunction(()=>typeof DB!=='undefined'&&DB&&document.querySelector('#nav'),null,{timeout:30000});await pg.waitForTimeout(700)};
 const ocioso=()=>pg.waitForFunction(()=>!NV.pendente&&!NV.salvando&&!NV.audFila.length,null,{timeout:30000});
 const entrar=async n=>{await pg.goto('http://localhost:4193/');await pg.evaluate(()=>localStorage.removeItem('nteam-sessao'));await pg.reload();await pg.waitForSelector('#demo-perfis button');await pg.click(`#demo-perfis button:has-text("${n}")`);await pronto()};
 await entrar('Patrícia Lima');
 /* transferência Beta → Alfa */
 const c=await pg.evaluate(()=>{const c=DB.colabs.find(x=>x.obraId==='beta'&&x.status==='Ativo'&&!movsAbertas(x).length);return {id:c.id,nome:c.nome}});
 await pg.evaluate(id=>ACT.transfer({dataset:{id}}),c.id);await pg.waitForSelector('#layer .modal');await pg.selectOption('#m-o','alfa');await pg.waitForTimeout(200);
 await pg.screenshot({path:path.join(OUT,'f1_transf.png')});
 await pg.evaluate(()=>{const d=document.querySelector('#layer details');if(d)d.open=true});await pg.fill('#m-ex','Demonstração: reforço urgente aprovado pela Diretoria.');await pg.click('#layer .modal .btn.primary');await pg.waitForTimeout(800);
 if(await pg.$('#layer .modal'))await pg.screenshot({path:path.join(OUT,'f1b_transf_apos.png')});
 const t=await pg.evaluate(id=>{const c=DB.colabs.find(x=>x.id===id);return c.alocacoes.slice(-1)[0]},c.id);
 ok('RH programa transferência Beta → Alfa',t&&t.obraId==='alfa',JSON.stringify(t));
 await ocioso();
 /* Adm Alfa vê quem chega */
 await entrar('Renata Souza');
 ok('Adm. da Obra Alfa passa a ver o colaborador transferido',await pg.evaluate(id=>!!DB.colabs.find(x=>x.id===id),c.id));
 /* proposta de emprego num candidato */
 await entrar('Patrícia Lima');
 const cand=await pg.evaluate(()=>DB.cands.map(x=>({id:x.id,nome:x.nome,st:x.status||x.etapa})));
 ok('Há candidatos para montar proposta',cand.length>0,JSON.stringify(cand));
 /* criar acesso para uma pessoa nova */
 const ac=await pg.evaluate(async()=>{const r=await chamarAcesso({acao:'criar',email:'novo.usuario@demo.ntn',nome:'Usuário Novo',perfil:'adm',obras:['gama'],pessoa_id:'p-teste'});return r});
 ok('Criar acesso funciona e devolve senha temporária fictícia',ac.ok&&ac.senha_temporaria==='demonstracao',JSON.stringify(ac));
 await pg.goto('http://localhost:4193/');await pg.evaluate(()=>localStorage.removeItem('nteam-sessao'));await pg.reload();await pg.waitForSelector('#demo-perfis button');
 await pg.click('#demo-perfis button:has-text("Usuário Novo")');await pg.waitForSelector('#f-senha',{timeout:15000});
 await pg.fill('#f-senha [name=s1]','senha-nova-123');await pg.fill('#f-senha [name=s2]','senha-nova-123');await pg.click('#f-senha button');await pronto();
 ok('Novo usuário cria a senha no 1º acesso e entra',await pg.evaluate(()=>NUVEM.usuario.nome==='Usuário Novo'));
 ok('Sem erros de página',!erros.length,erros.join(' | '));
 console.log(JSON.stringify(R,null,1));await b.close();srv.close()})().catch(e=>{console.error(e);console.log(JSON.stringify(R,null,1));process.exit(1)});
