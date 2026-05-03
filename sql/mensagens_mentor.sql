-- Histórico do Mentor IA + contagem de consultas (freemium).
-- Execute no Supabase SQL Editor após revisar políticas do projeto.

create table if not exists public.mensagens_mentor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text,
  competencia text,
  created_at timestamptz not null default now()
);

create index if not exists mensagens_mentor_user_created_idx
  on public.mensagens_mentor (user_id, created_at desc);

create index if not exists mensagens_mentor_user_role_created_idx
  on public.mensagens_mentor (user_id, role, created_at);

comment on table public.mensagens_mentor is 'Mensagens do chat Mentor; role=user conta limite diário freemium.';

alter table public.mensagens_mentor enable row level security;

drop policy if exists "mensagens_mentor_select_own" on public.mensagens_mentor;
create policy "mensagens_mentor_select_own"
  on public.mensagens_mentor for select
  using (auth.uid() = user_id);

drop policy if exists "mensagens_mentor_insert_own" on public.mensagens_mentor;
create policy "mensagens_mentor_insert_own"
  on public.mensagens_mentor for insert
  with check (auth.uid() = user_id);

drop policy if exists "mensagens_mentor_delete_own" on public.mensagens_mentor;
create policy "mensagens_mentor_delete_own"
  on public.mensagens_mentor for delete
  using (auth.uid() = user_id);
