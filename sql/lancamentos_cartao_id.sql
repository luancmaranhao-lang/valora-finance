-- Vínculo de lançamento com cartão. Execute no Supabase após existir public.cartoes.

alter table public.lancamentos
  add column if not exists cartao_id uuid references public.cartoes(id) on delete set null;

create index if not exists idx_lancamentos_cartao_id on public.lancamentos(cartao_id);
