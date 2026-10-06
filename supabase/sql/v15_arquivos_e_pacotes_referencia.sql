-- nTeam v15 · arquivos dos colaboradores e pacote de documentos da obra
-- Só adiciona objetos novos. Não altera nem apaga dados existentes.

-- 1. Bucket privado: PDF ou imagem, até 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- 2. Quem pode ver/enviar um arquivo de uma categoria.
--    pessoal/registro → regra de dados pessoais (RH, Diretoria, Adm. da obra)
--    sst              → RH, Diretoria, SST e Adm. da obra
--    atestado         → regra de saúde (RH, SST e Adm. da obra); nunca vai para pacote
--    obra             → regra dos documentos da obra
create or replace function public.pode_arquivo(p_cat text, p_colab text, p_obra text)
returns boolean language sql stable security definer set search_path = '' as $$
  with eu as (select public.meu_perfil() as p, public.minhas_obras() as o),
  alvo as (
    select case when p_colab is not null
      then coalesce((select r.obras from public.registro r where r.tipo = 'colab' and r.id = p_colab), '{}')
      else array[p_obra] end as ob)
  select case
    when eu.p is null then false
    when p_cat = 'atestado' then p_colab is not null and public.pode_registro('saude', alvo.ob)
    when p_cat in ('pessoal','registro') then p_colab is not null and public.pode_registro('pessoal', alvo.ob)
    when p_cat = 'sst' then p_colab is not null and (eu.p in ('rh','dir') or (eu.p in ('sst','adm') and alvo.ob && eu.o))
    when p_cat = 'obra' then p_colab is null and p_obra is not null and public.pode_registro('docobra', alvo.ob)
    else false
  end from eu, alvo
$$;

-- Lê categoria/colaborador/obra a partir do caminho no bucket.
--   c/<colab>/<categoria>/<uuid>.<ext>    o/<obra>/<uuid>.<ext>
create or replace function public.pode_arquivo_caminho(p_nome text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_nome ~ '^c/[A-Za-z0-9_-]{1,60}/(pessoal|registro|sst|atestado)/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
      then public.pode_arquivo(split_part(p_nome,'/',3), split_part(p_nome,'/',2), null)
    when p_nome ~ '^o/[A-Za-z0-9_-]{1,60}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
      then public.pode_arquivo('obra', null, split_part(p_nome,'/',2))
    else false end
$$;

-- 3. Metadados dos arquivos. Remoção é lógica (o histórico fica).
create table if not exists public.arquivo (
  id uuid primary key default gen_random_uuid(),
  caminho text not null unique,
  categoria text not null check (categoria in ('pessoal','registro','sst','atestado','obra')),
  colab_id text,
  obra_id text,
  tipo_doc text not null check (length(tipo_doc) between 1 and 120),
  ref_id text check (ref_id is null or length(ref_id) <= 80),
  nome text not null check (length(nome) between 1 and 200),
  mime text not null,
  tamanho integer not null check (tamanho > 0 and tamanho <= 10485760),
  validade date,
  enviado_por uuid not null,
  enviado_por_nome text,
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid,
  removido_motivo text check (removido_motivo is null or length(removido_motivo) <= 200),
  substituido_por uuid references public.arquivo(id),
  check ((categoria = 'obra') = (colab_id is null)),
  check (categoria <> 'obra' or obra_id is not null)
);
create index if not exists arquivo_colab_idx on public.arquivo (colab_id) where colab_id is not null;
create index if not exists arquivo_obra_idx on public.arquivo (obra_id) where obra_id is not null;
alter table public.arquivo enable row level security;
drop policy if exists arquivo_ler on public.arquivo;
create policy arquivo_ler on public.arquivo for select to authenticated
  using (public.pode_arquivo(categoria, colab_id, obra_id));
-- Sem políticas de insert/update/delete: tudo passa pelas funções abaixo.

-- 4. Políticas do bucket: leitura e envio pelo caminho; sem sobrescrever; sem apagar.
drop policy if exists documentos_ler on storage.objects;
create policy documentos_ler on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.pode_arquivo_caminho(name));
drop policy if exists documentos_enviar on storage.objects;
create policy documentos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.pode_arquivo_caminho(name));

-- 5. Registrar o arquivo depois do envio (tamanho e tipo vêm do próprio storage).
create or replace function public.registrar_arquivo(
  p_caminho text, p_tipo_doc text, p_nome text,
  p_ref text default null, p_validade date default null, p_substitui uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_cat text; v_colab text; v_obra text; v_id uuid; v_obj record; v_ant public.arquivo; v_nome_colab text;
begin
  if not public.pode_arquivo_caminho(p_caminho) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_caminho like 'c/%' then
    v_colab := split_part(p_caminho,'/',2); v_cat := split_part(p_caminho,'/',3);
  else
    v_obra := split_part(p_caminho,'/',2); v_cat := 'obra';
  end if;
  select o.metadata, o.owner_id into v_obj from storage.objects o
   where o.bucket_id = 'documentos' and o.name = p_caminho;
  if not found or v_obj.owner_id is distinct from auth.uid()::text then
    raise exception 'arquivo_nao_enviado' using errcode = 'P0002';
  end if;
  if p_substitui is not null then
    select * into v_ant from public.arquivo a where a.id = p_substitui for update;
    if not found or v_ant.removido_em is not null or v_ant.categoria <> v_cat
       or v_ant.colab_id is distinct from v_colab or v_ant.obra_id is distinct from v_obra then
      raise exception 'substituicao_invalida' using errcode = '22023';
    end if;
  end if;
  insert into public.arquivo (caminho, categoria, colab_id, obra_id, tipo_doc, ref_id, nome, mime, tamanho, validade, enviado_por, enviado_por_nome)
  values (p_caminho, v_cat, v_colab, v_obra, left(trim(p_tipo_doc),120), nullif(left(p_ref,80),''),
          left(coalesce(nullif(trim(p_nome),''),'arquivo'),200),
          coalesce(v_obj.metadata->>'mimetype','application/octet-stream'),
          coalesce((v_obj.metadata->>'size')::int, 1), p_validade, auth.uid(),
          (select p.nome from public.perfis p where p.user_id = auth.uid()))
  returning id into v_id;
  if p_substitui is not null then
    update public.arquivo set removido_em = now(), removido_por = auth.uid(),
      removido_motivo = 'Substituído', substituido_por = v_id where id = p_substitui;
  end if;
  select r.dados->>'nome' into v_nome_colab from public.registro r where r.tipo = 'colab' and r.id = v_colab;
  -- Auditoria sem nome de arquivo; atestado aparece só como documento restrito.
  insert into public.auditoria (modulo, acao, evento) values (
    'Arquivos', case when p_substitui is null then 'Anexou arquivo' else 'Substituiu arquivo' end,
    jsonb_build_object('acao', case when p_substitui is null then 'Anexou arquivo' else 'Substituiu arquivo' end,
      'categoria', v_cat,
      'documento', case when v_cat = 'atestado' then 'Documento restrito' else left(trim(p_tipo_doc),120) end,
      'colaborador', v_nome_colab, 'obra', v_obra));
  return v_id;
end $$;

create or replace function public.remover_arquivo(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.arquivo; v_nome_colab text;
begin
  select * into v from public.arquivo where id = p_id for update;
  if not found or not public.pode_arquivo(v.categoria, v.colab_id, v.obra_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v.removido_em is not null then return; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'motivo_obrigatorio' using errcode = '22023'; end if;
  update public.arquivo set removido_em = now(), removido_por = auth.uid(), removido_motivo = left(trim(p_motivo),200) where id = p_id;
  select r.dados->>'nome' into v_nome_colab from public.registro r where r.tipo = 'colab' and r.id = v.colab_id;
  insert into public.auditoria (modulo, acao, evento) values ('Arquivos', 'Removeu arquivo',
    jsonb_build_object('acao','Removeu arquivo','categoria', v.categoria,
      'documento', case when v.categoria = 'atestado' then 'Documento restrito' else v.tipo_doc end,
      'colaborador', v_nome_colab, 'obra', v.obra_id));
end $$;

-- Uso do armazenamento (plano gratuito: 1 GB).
create or replace function public.uso_armazenamento()
returns bigint language sql stable security definer set search_path = '' as $$
  select case when public.meu_perfil() in ('rh','dir')
    then coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.bucket_id = 'documentos'), 0)
    else null end
$$;

-- 6. Pacote de documentos de uma obra (link com validade + código de 6 dígitos).
create table if not exists public.pacote (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null,
  obra_nome text,
  titulo text not null check (length(titulo) between 1 and 160),
  periodo text check (periodo is null or length(periodo) <= 80),
  criado_por uuid not null,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  token_hash text not null unique,
  codigo_hash text not null,
  tentativas integer not null default 0,
  falhas_total integer not null default 0,
  bloqueado_ate timestamptz,
  revogado_em timestamptz,
  revogado_por uuid,
  revogado_motivo text,
  ultimo_acesso timestamptz,
  acessos integer not null default 0
);
create table if not exists public.pacote_item (
  pacote_id uuid not null references public.pacote(id) on delete cascade,
  arquivo_id uuid not null references public.arquivo(id),
  colab_nome text,
  primary key (pacote_id, arquivo_id)
);
create table if not exists public.pacote_acesso (
  id bigint generated always as identity primary key,
  pacote_id uuid not null references public.pacote(id) on delete cascade,
  em timestamptz not null default now(),
  ok boolean not null,
  resultado text,
  origem text
);
create index if not exists pacote_obra_idx on public.pacote (obra_id);
create index if not exists pacote_item_arquivo_idx on public.pacote_item (arquivo_id);
create index if not exists pacote_acesso_pacote_idx on public.pacote_acesso (pacote_id, em desc);
alter table public.pacote enable row level security;
alter table public.pacote_item enable row level security;
alter table public.pacote_acesso enable row level security;

create or replace function public.pode_ver_pacote(p_obra text, p_criador uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when public.meu_perfil() in ('rh','dir') then true
    when public.meu_perfil() = 'sst' then p_obra = any(public.minhas_obras()) or p_criador = auth.uid()
    else false end
$$;
drop policy if exists pacote_ler on public.pacote;
create policy pacote_ler on public.pacote for select to authenticated using (public.pode_ver_pacote(obra_id, criado_por));
drop policy if exists pacote_item_ler on public.pacote_item;
create policy pacote_item_ler on public.pacote_item for select to authenticated
  using (exists (select 1 from public.pacote p where p.id = pacote_id and public.pode_ver_pacote(p.obra_id, p.criado_por)));
drop policy if exists pacote_acesso_ler on public.pacote_acesso;
create policy pacote_acesso_ler on public.pacote_acesso for select to authenticated
  using (exists (select 1 from public.pacote p where p.id = pacote_id and public.pode_ver_pacote(p.obra_id, p.criado_por)));
-- Os hashes nunca saem para o navegador.
revoke all on public.pacote from anon, authenticated;
grant select (id, obra_id, obra_nome, titulo, periodo, criado_por, criado_por_nome, criado_em, expira_em,
  tentativas, falhas_total, bloqueado_ate, revogado_em, revogado_por, revogado_motivo, ultimo_acesso, acessos)
  on public.pacote to authenticated;
revoke all on public.pacote_item, public.pacote_acesso from anon;
revoke insert, update, delete on public.pacote_item, public.pacote_acesso from authenticated;
revoke all on public.arquivo from anon;
revoke insert, update, delete on public.arquivo from authenticated;

create or replace function public.criar_pacote(
  p_obra text, p_titulo text, p_dias integer, p_arquivos uuid[], p_periodo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_p text := public.meu_perfil(); v_id uuid; v_token text; v_codigo text; v_expira timestamptz;
  v_obra_nome text; v_ok integer; v_n integer := coalesce(array_length(p_arquivos,1),0);
begin
  if v_p is null or not (v_p in ('rh','dir') or (v_p = 'sst' and p_obra = any(public.minhas_obras()))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select o->>'nome' into v_obra_nome from public.registro r, jsonb_array_elements(r.dados->'cfg'->'obras') o
   where r.tipo = 'global' and r.id = 'principal' and o->>'id' = p_obra;
  if v_obra_nome is null then raise exception 'obra_invalida' using errcode = '22023'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'validade_invalida' using errcode = '22023'; end if;
  if v_n < 1 or v_n > 500 then raise exception 'itens_invalidos' using errcode = '22023'; end if;
  if coalesce(trim(p_titulo),'') = '' then raise exception 'titulo_obrigatorio' using errcode = '22023'; end if;
  -- Todo arquivo precisa estar ativo, ser visível para quem cria, nunca ser atestado,
  -- e, se for documento da obra, ser desta obra.
  select count(distinct a.id) into v_ok from public.arquivo a
   where a.id = any(p_arquivos) and a.removido_em is null and a.categoria <> 'atestado'
     and (a.categoria <> 'obra' or a.obra_id = p_obra)
     and public.pode_arquivo(a.categoria, a.colab_id, a.obra_id);
  if v_ok <> (select count(distinct x) from unnest(p_arquivos) x) then
    raise exception 'itens_nao_permitidos' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  v_codigo := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_expira := now() + make_interval(days => p_dias);
  insert into public.pacote (obra_id, obra_nome, titulo, periodo, criado_por, criado_por_nome, expira_em, token_hash, codigo_hash)
  values (p_obra, v_obra_nome, left(trim(p_titulo),160), nullif(left(p_periodo,80),''), auth.uid(),
          (select p.nome from public.perfis p where p.user_id = auth.uid()), v_expira,
          encode(extensions.digest(v_token, 'sha256'), 'hex'),
          extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)))
  returning id into v_id;
  insert into public.pacote_item (pacote_id, arquivo_id, colab_nome)
  select distinct on (a.id) v_id, a.id, (select r.dados->>'nome' from public.registro r where r.tipo = 'colab' and r.id = a.colab_id)
    from public.arquivo a where a.id = any(p_arquivos);
  insert into public.auditoria (modulo, acao, evento) values ('Pacote de documentos', 'Gerou link de pacote',
    jsonb_build_object('acao','Gerou link de pacote','obra', v_obra_nome, 'titulo', left(trim(p_titulo),160),
      'itens', v_n, 'expira_em', v_expira));
  return jsonb_build_object('id', v_id, 'token', v_token, 'codigo', v_codigo, 'expira_em', v_expira);
end $$;

create or replace function public.revogar_pacote(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.pacote;
begin
  select * into v from public.pacote where id = p_id for update;
  if not found or not public.pode_ver_pacote(v.obra_id, v.criado_por)
     or not (public.meu_perfil() in ('rh','dir') or v.criado_por = auth.uid() or public.meu_perfil() = 'sst') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v.revogado_em is not null then return; end if;
  update public.pacote set revogado_em = now(), revogado_por = auth.uid(), revogado_motivo = 'Revogado manualmente' where id = p_id;
  insert into public.auditoria (modulo, acao, evento) values ('Pacote de documentos', 'Revogou link de pacote',
    jsonb_build_object('acao','Revogou link de pacote','obra', v.obra_nome, 'titulo', v.titulo));
end $$;

-- Usada só pela função pública (service_role). Confere o código com bloqueio por tentativas.
create or replace function public.abrir_pacote(p_token text, p_codigo text, p_origem text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.pacote; v_itens jsonb;
begin
  if p_token !~ '^[0-9a-f]{36}$' then return jsonb_build_object('erro','nao_encontrado'); end if;
  select * into v from public.pacote where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('erro','nao_encontrado'); end if;
  if v.revogado_em is not null then
    insert into public.pacote_acesso (pacote_id, ok, resultado, origem) values (v.id, false, 'revogado', left(p_origem,60));
    return jsonb_build_object('erro','revogado');
  end if;
  if v.expira_em <= now() then
    insert into public.pacote_acesso (pacote_id, ok, resultado, origem) values (v.id, false, 'expirado', left(p_origem,60));
    return jsonb_build_object('erro','expirado');
  end if;
  if v.bloqueado_ate is not null and v.bloqueado_ate > now() then
    insert into public.pacote_acesso (pacote_id, ok, resultado, origem) values (v.id, false, 'bloqueado', left(p_origem,60));
    return jsonb_build_object('erro','bloqueado','ate', v.bloqueado_ate);
  end if;
  if p_codigo !~ '^[0-9]{6}$' or extensions.crypt(p_codigo, v.codigo_hash) <> v.codigo_hash then
    update public.pacote set
      tentativas = case when tentativas + 1 >= 5 then 0 else tentativas + 1 end,
      bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end,
      falhas_total = falhas_total + 1,
      revogado_em = case when falhas_total + 1 >= 20 then now() else revogado_em end,
      revogado_motivo = case when falhas_total + 1 >= 20 then 'Muitas tentativas com código errado' else revogado_motivo end
    where id = v.id;
    insert into public.pacote_acesso (pacote_id, ok, resultado, origem) values (v.id, false, 'codigo_errado', left(p_origem,60));
    return jsonb_build_object('erro','codigo', 'restantes', greatest(0, 4 - v.tentativas));
  end if;
  update public.pacote set tentativas = 0, ultimo_acesso = now(), acessos = acessos + 1 where id = v.id;
  insert into public.pacote_acesso (pacote_id, ok, resultado, origem) values (v.id, true, 'aberto', left(p_origem,60));
  insert into public.auditoria (autor_nome, autor_perfil, modulo, acao, evento) values ('Acesso externo', 'externo',
    'Pacote de documentos', 'Pacote aberto pelo link', jsonb_build_object('acao','Pacote aberto pelo link','obra', v.obra_nome, 'titulo', v.titulo));
  select coalesce(jsonb_agg(jsonb_build_object('caminho', a.caminho, 'colaborador', i.colab_nome, 'categoria', a.categoria,
           'documento', a.tipo_doc, 'nome', a.nome, 'mime', a.mime, 'tamanho', a.tamanho, 'validade', a.validade)
           order by i.colab_nome nulls first, a.categoria, a.tipo_doc), '[]'::jsonb)
    into v_itens
    from public.pacote_item i join public.arquivo a on a.id = i.arquivo_id
   where i.pacote_id = v.id and a.removido_em is null and a.categoria <> 'atestado';
  return jsonb_build_object('ok', true, 'titulo', v.titulo, 'obra', v.obra_nome, 'periodo', v.periodo,
    'expira_em', v.expira_em, 'itens', v_itens);
end $$;

-- Permissões de execução.
revoke execute on function public.pode_arquivo(text,text,text), public.pode_arquivo_caminho(text),
  public.registrar_arquivo(text,text,text,text,date,uuid), public.remover_arquivo(uuid,text),
  public.uso_armazenamento(), public.pode_ver_pacote(text,uuid),
  public.criar_pacote(text,text,integer,uuid[],text), public.revogar_pacote(uuid),
  public.abrir_pacote(text,text,text) from public, anon;
grant execute on function public.pode_arquivo(text,text,text), public.pode_arquivo_caminho(text),
  public.registrar_arquivo(text,text,text,text,date,uuid), public.remover_arquivo(uuid,text),
  public.uso_armazenamento(), public.pode_ver_pacote(text,uuid),
  public.criar_pacote(text,text,integer,uuid[],text), public.revogar_pacote(uuid) to authenticated;
revoke execute on function public.abrir_pacote(text,text,text) from authenticated;
grant execute on function public.abrir_pacote(text,text,text) to service_role;
