-- Воронки: контейнер на уровне проекта со стадиями и недельной декомпозицией.

create table funnels (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index funnels_project_idx on funnels(project_id);

create table funnel_stages (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  name text not null,
  unit text,
  target_value numeric not null default 0,
  actual_value numeric not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index stages_funnel_idx on funnel_stages(funnel_id);

create table funnel_stage_weeks (
  id uuid primary key default uuid_generate_v4(),
  stage_id uuid not null references funnel_stages(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  target numeric not null default 0,
  actual numeric not null default 0,
  position int not null default 0
);

create index stage_weeks_stage_idx on funnel_stage_weeks(stage_id);

-- RLS
alter table funnels enable row level security;
alter table funnel_stages enable row level security;
alter table funnel_stage_weeks enable row level security;

create policy funnels_select on funnels
  for select to authenticated using (can_view_project(project_id));

create policy funnels_modify on funnels
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

create policy stages_select on funnel_stages
  for select to authenticated using (
    exists (select 1 from funnels f where f.id = funnel_id and can_view_project(f.project_id))
  );

create policy stages_modify on funnel_stages
  for all to authenticated
  using (exists (select 1 from funnels f where f.id = funnel_id and can_edit_project(f.project_id)))
  with check (exists (select 1 from funnels f where f.id = funnel_id and can_edit_project(f.project_id)));

create policy stage_weeks_select on funnel_stage_weeks
  for select to authenticated using (
    exists (
      select 1 from funnel_stages s
        join funnels f on f.id = s.funnel_id
       where s.id = stage_id and can_view_project(f.project_id)
    )
  );

create policy stage_weeks_modify on funnel_stage_weeks
  for all to authenticated
  using (
    exists (
      select 1 from funnel_stages s
        join funnels f on f.id = s.funnel_id
       where s.id = stage_id and can_edit_project(f.project_id)
    )
  )
  with check (
    exists (
      select 1 from funnel_stages s
        join funnels f on f.id = s.funnel_id
       where s.id = stage_id and can_edit_project(f.project_id)
    )
  );
