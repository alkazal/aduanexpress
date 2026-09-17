-- Per-user project access assignments

create table if not exists public.user_project_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id),
  unique (user_id, project_id)
);

create index if not exists user_project_access_user_id_idx
  on public.user_project_access (user_id);

create index if not exists user_project_access_project_id_idx
  on public.user_project_access (project_id);

alter table public.user_project_access enable row level security;

create or replace function public.current_user_is_manager()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.role = 'manager'
  );
$$;

create or replace function public.current_user_has_project_access(target_project_id uuid)
returns boolean
language sql
stable
as $$
  select public.current_user_is_manager()
    or exists (
      select 1
      from public.user_project_access upa
      where upa.user_id = auth.uid()
        and upa.project_id = target_project_id
    );
$$;

drop policy if exists "user_project_access_select_manager_or_self" on public.user_project_access;
create policy "user_project_access_select_manager_or_self"
  on public.user_project_access
  for select
  to authenticated
  using (
    public.current_user_is_manager()
    or user_id = auth.uid()
  );

drop policy if exists "user_project_access_insert_manager" on public.user_project_access;
create policy "user_project_access_insert_manager"
  on public.user_project_access
  for insert
  to authenticated
  with check (public.current_user_is_manager());

drop policy if exists "user_project_access_delete_manager" on public.user_project_access;
create policy "user_project_access_delete_manager"
  on public.user_project_access
  for delete
  to authenticated
  using (public.current_user_is_manager());

-- Recommended follow-up:
-- update existing public.reports RLS to require public.current_user_has_project_access(project_id)
-- for non-manager submitters. This repo does not currently include the existing report policies,
-- so review and replace permissive policies in Supabase before relying on DB-only enforcement.
