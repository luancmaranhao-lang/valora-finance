-- Cartões de crédito do usuário. Execute no SQL Editor do Supabase.
create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  bandeira text not null default 'Visa',
  limite_total numeric(14, 2) not null check (limite_total >= 0),
  dia_vencimento int not null check (dia_vencimento >= 1 and dia_vencimento <= 31),
  dia_fechamento int not null check (dia_fechamento >= 1 and dia_fechamento <= 31),
  criado_em timestamptz not null default now()
);

create index if not exists cartoes_user_id_idx on public.cartoes (user_id);

alter table public.cartoes enable row level security;

create policy "cartoes_select_own"
  on public.cartoes for select
  using (auth.uid() = user_id);

create policy "cartoes_insert_own"
  on public.cartoes for insert
  with check (auth.uid() = user_id);

create policy "cartoes_update_own"
  on public.cartoes for update
  using (auth.uid() = user_id);

create policy "cartoes_delete_own"
  on public.cartoes for delete
  using (auth.uid() = user_id);
