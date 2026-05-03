-- Adiciona data alvo e flag de inclusão no total provisionado.
-- Corre uma vez no SQL Editor do Supabase.

alter table public.gastos_esporadicos
  add column if not exists data_alvo date;

alter table public.gastos_esporadicos
  add column if not exists conta_no_total boolean not null default true;
