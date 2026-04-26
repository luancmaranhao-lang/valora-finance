-- Open Finance + Monetizacao (Stripe) - Valora Finance
-- Execute no Supabase SQL Editor.

create table if not exists public.conexoes_bancarias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  nome_banco text not null,
  criado_em timestamptz not null default now()
);

alter table public.lancamentos
  add column if not exists external_id text,
  add column if not exists fonte text not null default 'manual' check (fonte in ('manual', 'automatico')),
  add column if not exists status_conciliacao text not null default 'aprovado' check (status_conciliacao in ('pendente_revisao', 'aprovado'));

create unique index if not exists idx_lancamentos_external_unique
on public.lancamentos (user_id, external_id)
where external_id is not null;

alter table public.profiles
  add column if not exists plano text not null default 'free',
  add column if not exists stripe_customer_id text;

alter table public.conexoes_bancarias enable row level security;

create policy if not exists "conexoes_select_owner"
on public.conexoes_bancarias
for select
using (user_id = auth.uid());

create policy if not exists "conexoes_insert_owner"
on public.conexoes_bancarias
for insert
with check (user_id = auth.uid());

create policy if not exists "conexoes_update_owner"
on public.conexoes_bancarias
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy if not exists "conexoes_delete_owner"
on public.conexoes_bancarias
for delete
using (user_id = auth.uid());

