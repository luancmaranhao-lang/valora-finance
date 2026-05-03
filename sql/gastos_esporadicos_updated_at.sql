-- Opcional: se quiseres a coluna updated_at na BD (o cliente já não a envia).
alter table public.gastos_esporadicos
  add column if not exists updated_at timestamptz not null default now();
