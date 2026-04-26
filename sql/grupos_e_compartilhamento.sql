-- Valora Finance - Grupos (Casais/Familias)
-- Execute no Supabase SQL Editor.

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.membros_grupo (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'membro' check (role in ('dono', 'admin', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (grupo_id, user_id)
);

alter table public.lancamentos
  add column if not exists grupo_id uuid references public.grupos(id) on delete set null;

alter table public.contas_pagar
  add column if not exists grupo_id uuid references public.grupos(id) on delete set null;

create index if not exists idx_lancamentos_grupo_id on public.lancamentos(grupo_id);
create index if not exists idx_contas_pagar_grupo_id on public.contas_pagar(grupo_id);
create index if not exists idx_membros_grupo_user on public.membros_grupo(user_id);

alter table public.grupos enable row level security;
alter table public.membros_grupo enable row level security;

create policy if not exists "grupos_select_membro"
on public.grupos
for select
using (
  dono_id = auth.uid()
  or exists (
    select 1 from public.membros_grupo mg
    where mg.grupo_id = grupos.id
      and mg.user_id = auth.uid()
  )
);

create policy if not exists "grupos_insert_dono"
on public.grupos
for insert
with check (dono_id = auth.uid());

create policy if not exists "grupos_update_dono"
on public.grupos
for update
using (dono_id = auth.uid())
with check (dono_id = auth.uid());

create policy if not exists "grupos_delete_dono"
on public.grupos
for delete
using (dono_id = auth.uid());

create policy if not exists "membros_select_proprio_ou_dono"
on public.membros_grupo
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.grupos g
    where g.id = membros_grupo.grupo_id
      and g.dono_id = auth.uid()
  )
);

create policy if not exists "membros_insert_dono_grupo"
on public.membros_grupo
for insert
with check (
  exists (
    select 1 from public.grupos g
    where g.id = membros_grupo.grupo_id
      and g.dono_id = auth.uid()
  )
);

create policy if not exists "membros_delete_dono_grupo"
on public.membros_grupo
for delete
using (
  exists (
    select 1 from public.grupos g
    where g.id = membros_grupo.grupo_id
      and g.dono_id = auth.uid()
  )
);

alter table public.lancamentos enable row level security;
alter table public.contas_pagar enable row level security;

-- Política: usuário vê seus próprios registros OU registros compartilhados do grupo em que participa.
create policy if not exists "lancamentos_select_user_ou_grupo_compartilhado"
on public.lancamentos
for select
using (
  user_id = auth.uid()
  or (
    visibilidade = 'compartilhado'
    and grupo_id is not null
    and exists (
      select 1
      from public.membros_grupo mg
      where mg.grupo_id = lancamentos.grupo_id
        and mg.user_id = auth.uid()
    )
  )
);

create policy if not exists "contas_select_user_ou_grupo_compartilhado"
on public.contas_pagar
for select
using (
  user_id = auth.uid()
  or (
    visibilidade = 'compartilhado'
    and grupo_id is not null
    and exists (
      select 1
      from public.membros_grupo mg
      where mg.grupo_id = contas_pagar.grupo_id
        and mg.user_id = auth.uid()
    )
  )
);

-- Escrita: mantém padrão proprietário; pode expandir para admins de grupo depois.
create policy if not exists "lancamentos_insert_owner"
on public.lancamentos
for insert
with check (user_id = auth.uid());

create policy if not exists "lancamentos_update_owner"
on public.lancamentos
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy if not exists "lancamentos_delete_owner"
on public.lancamentos
for delete
using (user_id = auth.uid());

create policy if not exists "contas_insert_owner"
on public.contas_pagar
for insert
with check (user_id = auth.uid());

create policy if not exists "contas_update_owner"
on public.contas_pagar
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy if not exists "contas_delete_owner"
on public.contas_pagar
for delete
using (user_id = auth.uid());

