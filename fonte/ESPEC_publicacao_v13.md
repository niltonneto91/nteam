# nTeam v13 — publicação (Supabase + Vercel)

Data: 06/10/2026 · Decisões do Nilton: dados sensíveis separados no servidor; planos gratuitos por enquanto; zerar mantendo só configurações; admin criado por Claude, demais acessos criados por RH/Diretoria.

## 1. Contexto
- App de página única (HTML estático) servido pela Vercel; banco Postgres + autenticação no Supabase (projeto `nteam`, região São Paulo, sa-east-1).
- Carga: até ~10 usuários simultâneos, ~100 colaboradores. Sem servidor próprio: a regra de acesso a dados sensíveis fica no banco (RLS).

## 2. Dados
- `perfis` (user_id → auth.users, nome, email, perfil ∈ rh|sst|dir|gestor|enc, obras[], ativo, trocar_senha, pessoa_id). Fonte da verdade do perfil.
- `documento` (parte PK, dados jsonb, versao int, atualizado_em/por). Partes:
  - `base` — tudo o que não é sensível. Leitura/escrita: qualquer perfil ativo.
  - `pessoal` — CPF, RG, nascimento, estado civil, escolaridade, e-mail, endereço, contato de emergência, dependentes, banco, CNPJ do PJ, salário, adicionais, benefícios. Leitura/escrita: RH e Diretoria.
  - `saude` — tipo do atestado (exceto acidente), CID, médico, arquivo, motivos de correção/cancelamento, versões anteriores. Leitura/escrita: RH e SST.
  - `ponto:AAAA-MM` — espelho diário do mês. Leitura/escrita: RH, Diretoria e Gestor.
- `auditoria` (append-only; autor = usuário logado, nome vindo de `perfis`). Inserir: perfil ativo; ler: RH e Diretoria; ninguém altera ou apaga.
- `documento_historico` — cópia da versão anterior de cada parte no máximo a cada 6 h, guardada por 30 dias (substitui parcialmente o backup que o plano gratuito não tem). Sem acesso pela API.
- Invariantes no banco: perfil com CHECK; versão só avança (+1); autor da auditoria = auth.uid(); usuário sem linha ativa em `perfis` não lê nada.

## 3. Falhas
- Duas pessoas salvam a mesma parte: trava otimista por versão; a segunda recebe "conflito", o app recarrega e avisa para refazer a última alteração. Alterações remotas chegam por Realtime e recarregam a tela quando não há edição pendente.
- Sem conexão: alteração fica pendente, aviso na tela, nova tentativa com espera crescente, alerta ao fechar a aba.
- Sessão expirada ou acesso desativado: volta à tela de login.

## 4. Acesso
- Login por e-mail e senha (Supabase Auth). Sem cadastro aberto: conta sem linha em `perfis` não acessa nada.
- Função `gerir-acesso` (Edge Function, JWT obrigatório): só RH/Diretoria ativos; cria acesso com senha temporária (troca obrigatória no 1º login), redefine senha, desativa/reativa. Ninguém desativa a si mesmo. Toda ação vai para a auditoria.
- Limite aceito: gestor e encarregado recebem a parte `base` de todas as obras (nome, função, obra, status, telefone); o filtro por obra deles é feito na tela.

## 5. Idempotência e concorrência
- Gravação = RPC `salvar_parte(parte, dados, versao_esperada)`; repetir com a mesma versão não duplica (a 2ª vira conflito).
- Criação de acesso: e-mail único no Auth e na tabela `perfis`.

## 6. Observabilidade
- Auditoria funcional no banco; logs do Supabase (API, Auth, Edge Function); "Advisors" de segurança após cada migração.

## Fora desta versão (continuam não implementados)
- Armazenamento real de arquivos anexados (só o nome é registrado).
- Notificações automáticas por e-mail/WhatsApp.
- Backup diário gerenciado (plano gratuito); há o histórico de 30 dias e o botão "Baixar cópia de segurança".
