-- Gastos esporadicos / planejamento de variaveis (provisoes por mes).
-- Execute no Supabase SQL Editor apos auth.users existir.
-- Coluna de dono: client_uid. Mes de referencia: mes_referencia (YYYY-MM).

create table if not exists public.gastos_esporadicos (
  id uuid primary key default gen_random_uuid(),
  client_uid uuid not null references auth.users (id) on delete cascade,
  mes_referencia text not null,
  codigo text,
  descricao text not null,
  valor_planejado numeric(14, 2) not null default 0 check (valor_planejado >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'precisou', 'nao_precisou')),
  lancamento_id uuid,
  carteira_id int,
  slots_sexta_no_mes int,
  valor_por_slot numeric(14, 4),
  data_alvo date,
  conta_no_total boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gastos_esporadicos_client_mes_codigo_uq
  on public.gastos_esporadicos (client_uid, mes_referencia, codigo)
  where codigo is not null;

create index if not exists gastos_esporadicos_client_mes_idx
  on public.gastos_esporadicos (client_uid, mes_referencia);

alter table public.gastos_esporadicos enable row level security;

create policy "gastos_esporadicos_select_own"
  on public.gastos_esporadicos for select
  using (auth.uid() = client_uid);

create policy "gastos_esporadicos_insert_own"
  on public.gastos_esporadicos for insert
  with check (auth.uid() = client_uid);

create policy "gastos_esporadicos_update_own"
  on public.gastos_esporadicos for update
  using (auth.uid() = client_uid)
  with check (auth.uid() = client_uid);

create policy "gastos_esporadicos_delete_own"
  on public.gastos_esporadicos for delete
  using (auth.uid() = client_uid);
