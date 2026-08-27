-- Project-scoped departments
-- Each department belongs to a single project.

create table if not exists public.project_departments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate department names within the same project.
create unique index if not exists project_departments_project_name_unique
  on public.project_departments (project_id, lower(name));

create index if not exists project_departments_project_id_idx
  on public.project_departments (project_id);

-- Keep updated_at fresh on updates.
create or replace function public.set_project_departments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_departments_updated_at on public.project_departments;
create trigger trg_project_departments_updated_at
before update on public.project_departments
for each row
execute function public.set_project_departments_updated_at();

alter table public.project_departments enable row level security;

-- Authenticated users can read departments.
drop policy if exists "project_departments_select_authenticated" on public.project_departments;
create policy "project_departments_select_authenticated"
  on public.project_departments
  for select
  to authenticated
  using (true);

-- Managers can create/update/delete departments.
drop policy if exists "project_departments_insert_manager" on public.project_departments;
create policy "project_departments_insert_manager"
  on public.project_departments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'manager'
    )
  );

drop policy if exists "project_departments_update_manager" on public.project_departments;
create policy "project_departments_update_manager"
  on public.project_departments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'manager'
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'manager'
    )
  );

drop policy if exists "project_departments_delete_manager" on public.project_departments;
create policy "project_departments_delete_manager"
  on public.project_departments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.role = 'manager'
    )
  );

-- Add department field to reports.
alter table public.reports
  add column if not exists department text;
