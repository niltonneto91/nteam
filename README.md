# nTeam · NTN Engenharia

Controle de colaboradores (RH/DP) da NTN Engenharia.

- `public/` — o site publicado pela Vercel (página única; o app só roda depois do login).
- `supabase/functions/gerir-acesso/` — função que cria acessos, redefine senha e desativa usuários.
- `fonte/` — camada de nuvem (login, gravação em partes, auditoria) e especificação da publicação.
- `testes/` — teste ponta a ponta com servidor simulado (`node testes/t21_nuvem.js`).

Banco: Supabase (projeto `nteam`, região São Paulo). O esquema e as políticas de acesso estão no histórico de migrações do projeto.
Dados reais nunca ficam neste repositório.
