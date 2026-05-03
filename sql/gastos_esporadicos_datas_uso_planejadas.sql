-- Agendamentos parciais de uso da provisão (JSON array: [{ "data": "YYYY-MM-DD", "valor": number }, ...])
-- Execute no Supabase SQL Editor quando quiser suportar multi-datas na UI.

alter table public.gastos_esporadicos
  add column if not exists datas_uso_planejadas jsonb not null default '[]'::jsonb;
