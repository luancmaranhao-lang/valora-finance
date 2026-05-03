-- Migração: coluna competencia -> mes_referencia (uma vez no SQL Editor).
-- Índices que referenciam competencia passam a usar mes_referencia após o rename.

alter table public.gastos_esporadicos rename column competencia to mes_referencia;
