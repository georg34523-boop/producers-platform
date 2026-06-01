-- ============================================================
-- 0015: мульти-валюта (USD/EUR) + warm_launch воронка
--       + історія перенесень дедлайну задач
-- ============================================================

-- 1) Валюта проєкту + опційний фіксований курс USD→EUR
alter table projects
  add column if not exists currency text not null default 'USD'
    check (currency in ('USD','EUR'));
alter table projects
  add column if not exists usd_eur_rate_override numeric;

-- 2) Валюта трафіку воронки (null = успадковує project.currency)
alter table funnels
  add column if not exists traffic_currency text
    check (traffic_currency in ('USD','EUR'));

-- 3) Глобальний кеш курсу валют (singleton по парі base/quote)
create table if not exists currency_rates (
  base text not null,
  quote text not null,
  rate numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (base, quote)
);

alter table currency_rates enable row level security;

create policy cr_select on currency_rates
  for select to authenticated using (true);
-- Записує тільки service-role (через cron/server-side fetcher). RLS на insert/update не дозволяємо для звичайних authenticated.

-- 4) Історія перенесень дедлайну задач
create table if not exists project_task_deadline_changes (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references project_tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  old_deadline date,
  new_deadline date,
  reason text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references profiles(id) on delete set null
);

create index if not exists ptdc_task_idx
  on project_task_deadline_changes(task_id, changed_at desc);

alter table project_task_deadline_changes enable row level security;

create policy ptdc_select on project_task_deadline_changes
  for select to authenticated using (can_view_project(project_id));

create policy ptdc_insert on project_task_deadline_changes
  for insert to authenticated with check (can_edit_project(project_id));
