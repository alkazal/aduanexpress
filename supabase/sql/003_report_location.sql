-- Add optional location field to reports
alter table public.reports
  add column if not exists location text;
