# nTeam · versão de demonstração

Cópia do nTeam para apresentações e treinamento. **Não acessa o banco de dados**: o `demo.js` atende no próprio
navegador todas as chamadas que iriam ao Supabase, com as mesmas regras de acesso por perfil e por obra.
Os dados são fictícios e ficam só no navegador de quem usa (IndexedDB). A política de segurança (CSP) da
demonstração não permite conexão com o Supabase.

- `demo.js` — servidor simulado, escolha de perfil sem senha, faixa "DEMONSTRAÇÃO", botão "Recomeçar".
- `gerar_semente.js` — gera `demo-semente.json` (3 obras fictícias, colaboradores, alojamentos, férias, folgas, vaga com candidatos).
- `montar.py` — monta `dist/` a partir de `public/` (build oficial). Rodar depois de cada nova versão do nTeam.
- `testar_demo.js`, `testar_fluxos.js` — testes ponta a ponta.

Atualizar: `python3 demo/montar.py && node demo/gerar_semente.js && python3 demo/montar.py`.
