-- ============================================================
-- TZ pivot: трёхуровневая система (планер / месячный трекер / годовая)
-- Сносим legacy воронки из 0003 (если были применены), переделываем под трекер.
-- Оставляем goals/goal_metrics в БД (UI выключаем), потом снесём.
-- ============================================================

-- Сносим legacy funnels (если были созданы в 0003)
drop table if exists funnel_stage_weeks cascade;
drop table if exists funnel_stages cascade;
drop table if exists funnels cascade;

-- Состояние эксперта: добавляем 'candidate'
alter type project_status add value if not exists 'candidate';

-- ============================================================
-- УРОВЕНЬ 2: Месячный трекер (один на эксперта × месяц)
-- ============================================================
create table monthly_trackers (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  status text not null default 'open' check (status in ('open', 'closed')),

  -- Блок A: план выручки на месяц
  revenue_plan numeric not null default 0,

  -- Блок C: трафик (план + on/off)
  traffic_enabled boolean not null default false,
  traffic_spend_plan numeric not null default 0,

  -- Блок D: качество работы с экспертом
  nps int check (nps between 0 and 10),
  launch_status text check (launch_status in ('on_time', 'partial', 'failed')),
  expert_mood text,

  -- Блок E: резюме месяца (заполняется при закрытии)
  summary_main text,
  summary_worked text,
  summary_not_worked text,
  summary_changes text,

  -- Мета
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  closed_at timestamptz,
  closed_by uuid references profiles(id),

  unique (project_id, year, month)
);

create index monthly_trackers_project_idx on monthly_trackers (project_id);
create index monthly_trackers_period_idx on monthly_trackers (year, month);

-- ============================================================
-- Дневные логи для трекера (Блок A — выручка, Блок C — трафик/лиды)
-- Из них собираются недельные и месячные показатели в UI.
-- ============================================================
create table tracker_daily_logs (
  id uuid primary key default uuid_generate_v4(),
  tracker_id uuid not null references monthly_trackers(id) on delete cascade,
  day_date date not null,
  kind text not null check (kind in ('revenue', 'traffic_spend', 'leads')),
  amount numeric not null default 0,
  unique (tracker_id, day_date, kind)
);

create index tracker_daily_logs_idx on tracker_daily_logs (tracker_id, day_date);

-- ============================================================
-- Блок B: воронки внутри трекера (per месяц)
-- ============================================================
create table tracker_funnels (
  id uuid primary key default uuid_generate_v4(),
  tracker_id uuid not null references monthly_trackers(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index tracker_funnels_idx on tracker_funnels (tracker_id);

create table tracker_funnel_stages (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references tracker_funnels(id) on delete cascade,
  name text not null,
  unit text not null default 'шт',
  plan_value numeric not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index tracker_funnel_stages_idx on tracker_funnel_stages (funnel_id);

-- Дневные логи факта по этапам воронки
create table tracker_funnel_stage_logs (
  id uuid primary key default uuid_generate_v4(),
  stage_id uuid not null references tracker_funnel_stages(id) on delete cascade,
  day_date date not null,
  amount numeric not null default 0,
  unique (stage_id, day_date)
);

create index funnel_stage_logs_idx on tracker_funnel_stage_logs (stage_id, day_date);

-- ============================================================
-- УРОВЕНЬ 3: Годовая сводка (frozen at transfer time)
-- ============================================================
create table yearly_summaries (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),

  revenue_plan numeric,
  revenue_actual numeric,
  best_funnel_name text,
  best_funnel_conversion numeric,
  worst_funnel_name text,
  worst_funnel_conversion numeric,
  traffic_spend numeric,
  roas numeric,
  nps int,
  launch_status text,
  insight text, -- продюсер пишет заново при переносе
  flag text check (flag in ('green', 'yellow', 'red')),

  transferred_at timestamptz not null default now(),
  transferred_by uuid references profiles(id),

  unique (project_id, year, month)
);

create index yearly_summaries_idx on yearly_summaries (project_id, year);

-- ============================================================
-- УРОВЕНЬ 1: Личный планер продюсера по эксперту
-- Разделы — кастомные на каждого эксперта (стартовый набор создаст приложение).
-- ============================================================
create table planner_sections (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index planner_sections_project_idx on planner_sections (project_id);

-- ============================================================
-- Тип задачи (новые поля из ТЗ)
-- ============================================================
do $$
begin
  create type task_kind as enum (
    'launch', 'content', 'communication',
    'tech_request', 'target_request', 'analytics', 'other'
  );
exception when duplicate_object then null;
end $$;

alter table tasks add column if not exists kind task_kind;
alter table tasks add column if not exists planner_section_id uuid references planner_sections(id) on delete set null;
alter table tasks add column if not exists archived_at timestamptz;

-- Расширяем task_status новыми значениями из ТЗ
alter type task_status add value if not exists 'waiting_tech';
alter type task_status add value if not exists 'waiting_target';
alter type task_status add value if not exists 'waiting_expert';

-- ============================================================
-- RLS
-- ============================================================
alter table monthly_trackers enable row level security;
alter table tracker_daily_logs enable row level security;
alter table tracker_funnels enable row level security;
alter table tracker_funnel_stages enable row level security;
alter table tracker_funnel_stage_logs enable row level security;
alter table yearly_summaries enable row level security;
alter table planner_sections enable row level security;

create policy mt_select on monthly_trackers
  for select to authenticated using (can_view_project(project_id));
create policy mt_modify on monthly_trackers
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

create policy tdl_select on tracker_daily_logs
  for select to authenticated using (
    exists (select 1 from monthly_trackers t where t.id = tracker_id and can_view_project(t.project_id))
  );
create policy tdl_modify on tracker_daily_logs
  for all to authenticated
  using (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)));

create policy tf_select on tracker_funnels
  for select to authenticated using (
    exists (select 1 from monthly_trackers t where t.id = tracker_id and can_view_project(t.project_id))
  );
create policy tf_modify on tracker_funnels
  for all to authenticated
  using (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from monthly_trackers t where t.id = tracker_id and can_edit_project(t.project_id)));

create policy tfs_select on tracker_funnel_stages
  for select to authenticated using (
    exists (
      select 1 from tracker_funnels f
        join monthly_trackers t on t.id = f.tracker_id
       where f.id = funnel_id and can_view_project(t.project_id)
    )
  );
create policy tfs_modify on tracker_funnel_stages
  for all to authenticated
  using (
    exists (
      select 1 from tracker_funnels f
        join monthly_trackers t on t.id = f.tracker_id
       where f.id = funnel_id and can_edit_project(t.project_id)
    )
  )
  with check (
    exists (
      select 1 from tracker_funnels f
        join monthly_trackers t on t.id = f.tracker_id
       where f.id = funnel_id and can_edit_project(t.project_id)
    )
  );

create policy tfsl_select on tracker_funnel_stage_logs
  for select to authenticated using (
    exists (
      select 1 from tracker_funnel_stages s
        join tracker_funnels f on f.id = s.funnel_id
        join monthly_trackers t on t.id = f.tracker_id
       where s.id = stage_id and can_view_project(t.project_id)
    )
  );
create policy tfsl_modify on tracker_funnel_stage_logs
  for all to authenticated
  using (
    exists (
      select 1 from tracker_funnel_stages s
        join tracker_funnels f on f.id = s.funnel_id
        join monthly_trackers t on t.id = f.tracker_id
       where s.id = stage_id and can_edit_project(t.project_id)
    )
  )
  with check (
    exists (
      select 1 from tracker_funnel_stages s
        join tracker_funnels f on f.id = s.funnel_id
        join monthly_trackers t on t.id = f.tracker_id
       where s.id = stage_id and can_edit_project(t.project_id)
    )
  );

create policy ys_select on yearly_summaries
  for select to authenticated using (can_view_project(project_id));
create policy ys_modify on yearly_summaries
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

create policy ps_select on planner_sections
  for select to authenticated using (can_view_project(project_id));
create policy ps_modify on planner_sections
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));
