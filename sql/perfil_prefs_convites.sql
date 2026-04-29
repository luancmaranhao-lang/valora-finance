-- Preferências de perfil, Gemini e convites. Execute no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists modo_contexto text;

update public.profiles
set modo_contexto = coalesce(nullif(trim(coalesce(modo_contexto, '')), ''), 'individual');

alter table public.profiles alter column modo_contexto set default 'individual';

alter table public.profiles alter column modo_contexto set not null;

alter table public.profiles
  add column if not exists gemini_api_key text;

alter table public.membros_grupo
  add column if not exists percentual_contribuicao numeric default 50;

create table if not exists public.convites_grupo (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  email text not null,
  convidado_por uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create index if not exists convites_grupo_grupo_idx on public.convites_grupo (grupo_id);

alter table public.convites_grupo enable row level security;

drop policy if exists "convites_select_dono" on public.convites_grupo;
create policy "convites_select_dono"
  on public.convites_grupo for select
  using (
    convidado_por = auth.uid()
    or exists (
      select 1 from public.grupos g
      where g.id = convites_grupo.grupo_id and g.dono_id = auth.uid()
    )
  );

drop policy if exists "convites_insert_dono" on public.convites_grupo;
create policy "convites_insert_dono"
  on public.convites_grupo for insert
  with check (
    convidado_por = auth.uid()
    and exists (
      select 1 from public.grupos g
      where g.id = convites_grupo.grupo_id and g.dono_id = auth.uid()
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
