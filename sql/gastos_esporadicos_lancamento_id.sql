-- Liga provisões (gastos_esporadicos) a lançamentos reais após marcar "Precisou".
-- Execute no Supabase SQL Editor se aparecer: Could not find the 'lancamento_id' column...

alter table public.gastos_esporadicos
  add column if not exists lancamento_id uuid;

alter table public.gastos_esporadicos
  add column if not exists data_alvo date;

alter table public.gastos_esporadicos
  add column if not exists conta_no_total boolean default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gastos_esporadicos_lancamento_id_fkey'
  ) then
    alter table public.gastos_esporadicos
      add constraint gastos_esporadicos_lancamento_id_fkey
      foreign key (lancamento_id) references public.lancamentos (id) on delete set null;
  end if;
end $$;
