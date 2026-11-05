-- BANKAI: banco de dados no Supabase.
-- Rode ESTE ARQUIVO INTEIRO uma vez, em SQL Editor > New query > Run.
-- Pode rodar de novo sem problema. Não apaga os dados de ninguém.
--
-- Regras: cadastro livre (qualquer pessoa cria conta e usa), e cada conta
-- só enxerga os próprios dados.

-- 0) Remove o que não existe mais (bloqueio por assinatura)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user_profile() cascade;
drop function if exists public.assinatura_ativa() cascade;
drop table if exists public.assinaturas cascade;

-- 1) Tabelas
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text,
  criado_em timestamptz not null default now()
);

create table if not exists public.dados (
  user_id uuid primary key references auth.users (id) on delete cascade,
  json jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- 2) Segurança: cada pessoa só acessa a própria linha
alter table public.perfis enable row level security;
alter table public.dados enable row level security;

drop policy if exists "users_manage_own_profile" on public.perfis;
drop policy if exists "perfis_proprio" on public.perfis;
drop policy if exists "users_manage_own_data" on public.dados;
drop policy if exists "dados_leitura" on public.dados;
drop policy if exists "dados_insercao" on public.dados;
drop policy if exists "dados_atualizacao" on public.dados;
drop policy if exists "dados_exclusao" on public.dados;

create policy "perfis_proprio" on public.perfis
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "dados_leitura" on public.dados
  for select to authenticated
  using (auth.uid() = user_id);

create policy "dados_insercao" on public.dados
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "dados_atualizacao" on public.dados
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dados_exclusao" on public.dados
  for delete to authenticated
  using (auth.uid() = user_id);

-- 3) Ao criar uma conta, já nasce o perfil e o caixa vazio
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;

  insert into public.dados (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Contas que já existiam antes deste script
insert into public.perfis (id, nome, email)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), email from auth.users
on conflict (id) do nothing;

insert into public.dados (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Para recomeçar do zero (APAGA TODOS OS DADOS), rode só estas duas linhas:
-- drop table public.dados;
-- drop table public.perfis;
-- e depois rode este arquivo inteiro de novo.
