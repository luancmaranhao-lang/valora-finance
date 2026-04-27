-- Tabela de dívidas fora do fluxo mensal (macro). Execute no SQL Editor do Supabase.
create table if not exists public.dividas_macro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credor text not null,
  valor_total_original numeric(14, 2) not null check (valor_total_original >= 0),
  valor_restante numeric(14, 2) not null check (valor_restante >= 0),
  status text not null default 'Em aberto',
  criado_em timestamptz not null default now()
);

create index if not exists dividas_macro_user_id_idx on public.dividas_macro (user_id);

alter table public.dividas_macro enable row level security;

create policy "dividas_macro_select_own"
  on public.dividas_macro for select
  using (auth.uid() = user_id);

create policy "dividas_macro_insert_own"
  on public.dividas_macro for insert
  with check (auth.uid() = user_id);

create policy "dividas_macro_update_own"
  on public.dividas_macro for update
  using (auth.uid() = user_id);

create policy "dividas_macro_delete_own"
  on public.dividas_macro for delete
  using (auth.uid() = user_id);
