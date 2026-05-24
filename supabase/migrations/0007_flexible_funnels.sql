-- ============================================================
-- Гнучкий конструктор воронок:
--  - метрики настраиваемые per funnel (custom название, тип, роль, план)
--  - дневной лог = jsonb по ключам метрик
--  - убираем жёсткие applications_plan / sales_plan / revenue_plan на воронке
--    (план хранится на метрике)
-- ============================================================

drop table if exists funnel_daily_journal cascade;

alter table funnels drop column if exists applications_plan;
alter table funnels drop column if exists sales_plan;
alter table funnels drop column if exists revenue_plan;

-- Семантическая роль метрики (для агрегации в юнитах/дашборде)
do $$
begin
  create type metric_role as enum ('revenue', 'sales', 'applications', 'traffic_spend', 'other');
exception when duplicate_object then null;
end $$;

create table funnel_metrics (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  key text not null,            -- внутренний ключ, без пробелов: 'applications', 'clicks', etc.
  label text not null,          -- отображаемое имя: 'Анкети', 'Кліки'
  role metric_role not null default 'other',
  unit text,                    -- '$', 'шт', '%', null
  plan_value numeric not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (funnel_id, key)
);

create index funnel_metrics_funnel_idx on funnel_metrics (funnel_id);

create table funnel_daily_log (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  day_date date not null,
  values jsonb not null default '{}'::jsonb,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funnel_id, day_date)
);

create index funnel_daily_log_idx on funnel_daily_log (funnel_id, day_date);

-- RLS
alter table funnel_metrics enable row level security;
alter table funnel_daily_log enable row level security;

create policy fm_select on funnel_metrics for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fm_modify on funnel_metrics for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

create policy fdl_select on funnel_daily_log for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fdl_modify on funnel_daily_log for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));
