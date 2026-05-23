-- ============================================================
-- ПОЛНЫЙ СБРОС под новое ТЗ (v2).
-- Сносим всё, что было от предыдущих итераций, и заводим чистую модель.
-- auth.users НЕ трогаем — учётка Дмитрия останется, нужно только заново залогиниться.
-- ============================================================

-- ---------- 1. DROP всё доменное ----------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists yearly_summaries cascade;
drop table if exists planner_sections cascade;
drop table if exists tracker_funnel_stage_logs cascade;
drop table if exists tracker_funnel_stages cascade;
drop table if exists tracker_funnels cascade;
drop table if exists tracker_daily_logs cascade;
drop table if exists monthly_trackers cascade;

drop table if exists files cascade;
drop table if exists help_requests cascade;
drop table if exists comments cascade;
drop table if exists task_checklist_items cascade;
drop table if exists tasks cascade;
drop table if exists goal_metrics cascade;
drop table if exists goals cascade;
drop table if exists project_members cascade;
drop table if exists projects cascade;
drop table if exists profiles cascade;

drop type if exists comment_entity cascade;
drop type if exists help_status cascade;
drop type if exists goal_period cascade;
drop type if exists task_priority cascade;
drop type if exists task_status cascade;
drop type if exists project_status cascade;
drop type if exists user_role cascade;
drop type if exists task_kind cascade;

drop function if exists handle_new_user() cascade;
drop function if exists current_role_value() cascade;
drop function if exists is_team_lead() cascade;
drop function if exists is_producer() cascade;
drop function if exists can_view_project(uuid) cascade;
drop function if exists can_edit_project(uuid) cascade;
drop function if exists comment_can_view(text, uuid) cascade;
drop function if exists is_coo() cascade;
drop function if exists is_ceo() cascade;

-- ---------- 2. Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- 3. Enums ----------
create type user_role as enum ('coo', 'ceo', 'producer');
create type project_status as enum ('active', 'paused', 'archived');
create type work_model as enum ('fix_pct', 'rev_70_30', 'profit_50_50');
create type product_status as enum ('active', 'archived');
create type tracker_status as enum ('open', 'closed');
create type launch_status as enum ('on_time', 'partial', 'failed');
create type expense_kind as enum ('service', 'fot', 'contractor', 'other');
create type expense_recurrence as enum ('monthly', 'one_off');
create type stage_kind as enum ('application', 'intermediate', 'payment');

-- ---------- 4. profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role user_role not null default 'producer',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles (role);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- 5. Helper functions ----------
create or replace function current_role_value()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_coo() returns boolean language sql stable as $$
  select current_role_value() = 'coo'
$$;

create or replace function is_ceo() returns boolean language sql stable as $$
  select current_role_value() = 'ceo'
$$;

create or replace function is_producer() returns boolean language sql stable as $$
  select current_role_value() = 'producer'
$$;

create or replace function is_admin() returns boolean language sql stable as $$
  select current_role_value() in ('coo', 'ceo')
$$;

-- ---------- 6. projects ----------
create table projects (
  id uuid primary key default uuid_generate_v4(),
  expert_name text not null,
  expert_contacts text,
  producer_id uuid references profiles(id) on delete set null,
  status project_status not null default 'active',
  work_model work_model not null default 'rev_70_30',
  fix_amount numeric,
  model_started_at date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index projects_producer_idx on projects (producer_id);
create index projects_status_idx on projects (status);

-- can_view / can_edit (после projects, чтобы ссылаться)
create or replace function can_view_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from projects where id = p_id and producer_id = auth.uid()
    )
$$;

create or replace function can_edit_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from projects where id = p_id and producer_id = auth.uid()
    )
$$;

-- Лог смен моделей
create table project_model_history (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references profiles(id) on delete set null,
  from_model work_model,
  to_model work_model not null,
  effective_from date not null
);

create index project_model_history_idx on project_model_history (project_id, changed_at desc);

-- ---------- 7. products ----------
create table products (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  current_price numeric not null default 0,
  status product_status not null default 'active',
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index products_project_idx on products (project_id);

create table product_price_history (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  old_price numeric,
  new_price numeric not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references profiles(id) on delete set null
);

create index product_price_history_idx on product_price_history (product_id, changed_at desc);

-- Триггер логирования смены цены
create or replace function log_product_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.current_price is distinct from 0) then
    insert into product_price_history (product_id, old_price, new_price, changed_by)
    values (new.id, null, new.current_price, auth.uid());
  elsif (tg_op = 'UPDATE' and new.current_price is distinct from old.current_price) then
    insert into product_price_history (product_id, old_price, new_price, changed_by)
    values (new.id, old.current_price, new.current_price, auth.uid());
  end if;
  return new;
end;
$$;

create trigger products_price_log
  after insert or update of current_price on products
  for each row execute function log_product_price_change();

-- ---------- 8. Месячные трекеры ----------
create table monthly_trackers (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  status tracker_status not null default 'open',

  -- Блок A: цели выручки
  revenue_plan_min numeric not null default 0,
  revenue_plan_avg numeric not null default 0,
  revenue_plan_max numeric not null default 0,

  -- Драйверы (планы)
  sales_plan numeric not null default 0,
  applications_plan numeric not null default 0,
  avg_check_plan numeric not null default 0,

  -- Блок C: трафик on/off (расход вводится по воронкам)
  traffic_enabled boolean not null default false,

  -- Блок D: качество работы с экспертом
  nps int check (nps between 0 and 10),
  launch_status launch_status,
  expert_mood text,

  -- Блок E: резюме (заполняется при закрытии)
  summary_main text,
  summary_worked text,
  summary_not_worked text,
  summary_changes text,

  -- Мета
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references profiles(id) on delete set null,

  unique (project_id, year, month)
);

create index monthly_trackers_project_idx on monthly_trackers (project_id);
create index monthly_trackers_period_idx on monthly_trackers (year, month);

-- Распределение среднего плана по неделям месяца (Блок A)
create table tracker_weekly_plans (
  id uuid primary key default uuid_generate_v4(),
  tracker_id uuid not null references monthly_trackers(id) on delete cascade,
  week_index int not null check (week_index between 1 and 5),
  revenue_plan numeric not null default 0,
  unique (tracker_id, week_index)
);

-- Кастомные драйверы (Обзор / 5.1)
create table tracker_custom_drivers (
  id uuid primary key default uuid_generate_v4(),
  tracker_id uuid not null references monthly_trackers(id) on delete cascade,
  name text not null,
  unit text,
  plan_value numeric not null default 0,
  actual_value numeric not null default 0,
  position int not null default 0
);

-- ---------- 9. Воронки (Блок B) ----------
create table funnels (
  id uuid primary key default uuid_generate_v4(),
  tracker_id uuid not null references monthly_trackers(id) on delete cascade,
  name text not null,
  is_mini_product boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index funnels_tracker_idx on funnels (tracker_id);

-- m:m воронка ↔ продукты
create table funnel_products (
  funnel_id uuid not null references funnels(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (funnel_id, product_id)
);

-- Этапы воронки
create table funnel_stages (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  name text not null,
  kind stage_kind not null default 'intermediate',
  plan_value numeric not null default 0,
  position int not null default 0
);

create index funnel_stages_funnel_idx on funnel_stages (funnel_id);

-- Дневные факты по этапам
create table funnel_stage_daily_logs (
  id uuid primary key default uuid_generate_v4(),
  stage_id uuid not null references funnel_stages(id) on delete cascade,
  day_date date not null,
  amount numeric not null default 0,
  unique (stage_id, day_date)
);

create index funnel_stage_logs_idx on funnel_stage_daily_logs (stage_id, day_date);

-- Продажи: дневная запись с разбивкой по продуктам
create table funnel_sales (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  day_date date not null,
  qty int not null default 1 check (qty > 0),
  unit_price numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index funnel_sales_funnel_idx on funnel_sales (funnel_id, day_date);
create index funnel_sales_product_idx on funnel_sales (product_id, day_date);

-- Дневной трафик по воронке
create table funnel_traffic_daily (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  day_date date not null,
  amount numeric not null default 0,
  unique (funnel_id, day_date)
);

create index funnel_traffic_idx on funnel_traffic_daily (funnel_id, day_date);

-- ---------- 10. Расходы и возвраты центра ----------
create table project_expenses (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  kind expense_kind not null,
  recurrence expense_recurrence not null,
  amount numeric not null,
  start_date date not null default current_date, -- для monthly
  end_date date,                                  -- null = пока действует
  one_off_date date,                              -- для one_off
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index project_expenses_project_idx on project_expenses (project_id);

create table project_returns (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  day_date date not null,
  amount numeric not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index project_returns_project_idx on project_returns (project_id);

-- ---------- 11. RLS ----------
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_model_history enable row level security;
alter table products enable row level security;
alter table product_price_history enable row level security;
alter table monthly_trackers enable row level security;
alter table tracker_weekly_plans enable row level security;
alter table tracker_custom_drivers enable row level security;
alter table funnels enable row level security;
alter table funnel_products enable row level security;
alter table funnel_stages enable row level security;
alter table funnel_stage_daily_logs enable row level security;
alter table funnel_sales enable row level security;
alter table funnel_traffic_daily enable row level security;
alter table project_expenses enable row level security;
alter table project_returns enable row level security;

-- profiles
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy profiles_admin_all on profiles for all to authenticated
  using (is_admin()) with check (is_admin());

-- projects
create policy projects_select on projects for select to authenticated using (can_view_project(id));
create policy projects_insert on projects for insert to authenticated with check (is_admin());
create policy projects_update on projects for update to authenticated
  using (can_edit_project(id)) with check (can_edit_project(id));
create policy projects_delete on projects for delete to authenticated using (is_admin());

create policy pmh_select on project_model_history for select to authenticated using (can_view_project(project_id));
create policy pmh_insert on project_model_history for insert to authenticated with check (can_edit_project(project_id));

-- products
create policy products_select on products for select to authenticated using (can_view_project(project_id));
create policy products_modify on products for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));

create policy pph_select on product_price_history for select to authenticated using (
  exists (select 1 from products p where p.id = product_id and can_view_project(p.project_id))
);

-- monthly_trackers
create policy mt_select on monthly_trackers for select to authenticated using (can_view_project(project_id));
create policy mt_modify on monthly_trackers for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));

-- tracker children — через monthly_trackers
create policy twp_select on tracker_weekly_plans for select to authenticated using (
  exists (select 1 from monthly_trackers t where t.id = tracker_id and can_view_project(t.project_id))
);
create policy twp_modify on tracker_weekly_plans for all to authenticated
  using (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)));

create policy tcd_select on tracker_custom_drivers for select to authenticated using (
  exists (select 1 from monthly_trackers t where t.id = tracker_id and can_view_project(t.project_id))
);
create policy tcd_modify on tracker_custom_drivers for all to authenticated
  using (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)));

-- funnels
create policy f_select on funnels for select to authenticated using (
  exists (select 1 from monthly_trackers t where t.id = tracker_id and can_view_project(t.project_id))
);
create policy f_modify on funnels for all to authenticated
  using (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)));

create policy fp_select on funnel_products for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fp_modify on funnel_products for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

create policy fs_select on funnel_stages for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fs_modify on funnel_stages for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

create policy fsdl_select on funnel_stage_daily_logs for select to authenticated using (
  exists (
    select 1 from funnel_stages s
      join funnels f on f.id = s.funnel_id
      join monthly_trackers t on t.id = f.tracker_id
     where s.id = stage_id and can_view_project(t.project_id)
  )
);
create policy fsdl_modify on funnel_stage_daily_logs for all to authenticated
  using (
    exists (
      select 1 from funnel_stages s
        join funnels f on f.id = s.funnel_id
        join monthly_trackers t on t.id = f.tracker_id
       where s.id = stage_id and can_edit_project(t.project_id)
    )
  )
  with check (
    exists (
      select 1 from funnel_stages s
        join funnels f on f.id = s.funnel_id
        join monthly_trackers t on t.id = f.tracker_id
       where s.id = stage_id and can_edit_project(t.project_id)
    )
  );

create policy fsales_select on funnel_sales for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fsales_modify on funnel_sales for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

create policy ftd_select on funnel_traffic_daily for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy ftd_modify on funnel_traffic_daily for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

-- expenses / returns
create policy pe_select on project_expenses for select to authenticated using (can_view_project(project_id));
create policy pe_modify on project_expenses for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));

create policy pr_select on project_returns for select to authenticated using (can_view_project(project_id));
create policy pr_modify on project_returns for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));
