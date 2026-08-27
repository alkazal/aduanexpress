-- Project-scoped report types
-- Each report type belongs to a single project.

create table if not exists public.report_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate report type names within the same project.
create unique index if not exists report_types_project_name_unique
  on public.report_types (project_id, lower(name));

create index if not exists report_types_project_id_idx
  on public.report_types (project_id);

-- Keep updated_at fresh on updates.
create or replace function public.set_report_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_report_types_updated_at on public.report_types;
create trigger trg_report_types_updated_at
before update on public.report_types
for each row
execute function public.set_report_types_updated_at();

alter table public.report_types enable row level security;

-- Authenticated users can read report types.
drop policy if exists "report_types_select_authenticated" on public.report_types;
create policy "report_types_select_authenticated"
  on public.report_types
  for select
  to authenticated
  using (true);

-- Managers can create/update/delete report types.
drop policy if exists "report_types_insert_manager" on public.report_types;
create policy "report_types_insert_manager"
  on public.report_types
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

drop policy if exists "report_types_update_manager" on public.report_types;
create policy "report_types_update_manager"
  on public.report_types
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

drop policy if exists "report_types_delete_manager" on public.report_types;
create policy "report_types_delete_manager"
  on public.report_types
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
