-- Migração: se criaste a tabela com a coluna user_id, corre este script UMA vez no SQL Editor.
-- Depois atualiza as policies para usar client_uid.

alter table public.gastos_esporadicos rename column user_id to client_uid;

drop policy if exists "gastos_esporadicos_select_own" on public.gastos_esporadicos;
drop policy if exists "gastos_esporadicos_insert_own" on public.gastos_esporadicos;
drop policy if exists "gastos_esporadicos_update_own" on public.gastos_esporadicos;
drop policy if exists "gastos_esporadicos_delete_own" on public.gastos_esporadicos;

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

-- Recria índices com o novo nome de coluna (remove os antigos se existirem com user_id)
drop index if exists public.gastos_esporadicos_user_comp_codigo_uq;
drop index if exists public.gastos_esporadicos_user_comp_idx;

-- Ainda com coluna competencia; depois corre gastos_esporadicos_competencia_para_mes_referencia.sql se precisares de mes_referencia.
create unique index if not exists gastos_esporadicos_client_comp_codigo_uq
  on public.gastos_esporadicos (client_uid, competencia, codigo)
  where codigo is not null;

create index if not exists gastos_esporadicos_client_comp_idx
  on public.gastos_esporadicos (client_uid, competencia);
