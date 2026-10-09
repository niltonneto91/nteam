-- v18 · registros 'custos' (tabela de passagens, fator de distância, salários por função)
--        e 'proposta' (propostas de emprego).
-- Leitura: custos → RH, Diretoria e Administrativo de obra; proposta → RH e Diretoria, e Adm. só das suas obras.
-- Gravação e exclusão dos dois tipos: só RH e Diretoria.
create or replace function public.pode_registro(p_tipo text, p_obras text[])
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  with eu as (select public.meu_perfil() as p, public.minhas_obras() as o)
  select case
    when eu.p is null then false
    when p_tipo = 'global' then true
    when p_tipo = 'financeiro' then eu.p in ('rh','dir')
    when p_tipo = 'lote' then eu.p in ('rh','dir')
    when p_tipo = 'custos' then eu.p in ('rh','dir','adm')
    when p_tipo = 'saude' then eu.p = 'rh' or (eu.p in ('sst','adm') and p_obras && eu.o)
    when eu.p in ('rh','dir') then true
    when p_tipo = 'proposta' then eu.p = 'adm' and p_obras && eu.o
    when p_tipo = 'pessoal' then eu.p = 'adm' and p_obras && eu.o
    when p_tipo = 'ponto' then eu.p in ('gestor','adm') and p_obras && eu.o
    when p_tipo in ('aval','avalrasc') then eu.p in ('gestor','adm') and p_obras && eu.o
    when p_tipo = 'cand' then eu.p in ('gestor','adm') and p_obras && eu.o
    else p_obras && eu.o
  end from eu
$function$;

create or replace function public.pode_gravar_registro(p_tipo text, p_obras text[])
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.pode_registro(p_tipo, p_obras)
     and (p_tipo not in ('custos','proposta') or public.meu_perfil() in ('rh','dir'))
$function$;
revoke all on function public.pode_gravar_registro(text, text[]) from public, anon;
grant execute on function public.pode_gravar_registro(text, text[]) to authenticated, service_role;

alter policy registro_criar on public.registro with check (public.pode_gravar_registro(tipo, obras));
alter policy registro_salvar on public.registro using (public.pode_registro(tipo, obras)) with check (public.pode_gravar_registro(tipo, obras));
alter policy registro_excluir on public.registro using ((tipo <> 'global') and public.pode_gravar_registro(tipo, obras));
