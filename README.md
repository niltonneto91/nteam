# nTeam · NTN Engenharia

Controle de colaboradores (RH/DP) da NTN Engenharia.

- `public/` — o site publicado pela Vercel (página única; o app só roda depois do login). `public/p.html` é a página pública do pacote de documentos (link + código).
- `supabase/functions/gerir-acesso/` — cria acessos, redefine senha e desativa usuários.
- `supabase/functions/pacote-publico/` — abre um pacote de documentos de obra com o código de 6 dígitos (sem login; bloqueio por tentativas; links de arquivo de 10 minutos; atestados nunca entram).
- `supabase/sql/` — referência do SQL dos arquivos e pacotes (v15). A fonte da verdade é o histórico de migrações do projeto (`v15a_arquivos`, `v15b_pacotes`, `v15c_privilegios`, `v15d_ajustes_revisao_seguranca`, `v18_custos_propostas`).
- `fonte/` — camada de nuvem (login, gravação em partes, auditoria), arquivos e pacote (`arquivos15.js`), foto pelo celular (`foto16.js`), EPI por função (`epi17.js`), férias por período (`ferias17.js`), cidades, folga de campo e ajuda de custo (`viagem18.js`), proposta de emprego (`proposta18.js`), página pública e script de publicação. `municipios-ibge.json`: municípios com coordenadas (fonte: kelvins/municipios-brasileiros, licença MIT), servido em `public/vendor/`.
- `testes/` — testes ponta a ponta com servidor simulado (`t22_obras.js`: acesso por obra; `t23_arquivos.js`: arquivos e pacotes; `t24_foto.js`: foto pelo celular; `t25_ferias_epi.js`: EPI e férias; `t26_viagem_proposta.js`: cidades, folga de campo, ajuda de custo e proposta).

Banco: Supabase (projeto `nteam`, região São Paulo). Arquivos no bucket privado `documentos` (PDF ou imagem, até 10 MB).
Dados reais nunca ficam neste repositório.
