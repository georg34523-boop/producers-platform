-- ============================================================
-- 0013: project_task_groups + project_tasks
--   Per-project task list з групами. 5 пресетних груп сідяться
--   для кожного проєкту. ОП може додати свої. Task опційно
--   привʼязується до Доп цілі поточного місяця.
-- ============================================================

create table if not exists project_task_groups (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  is_seed boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ptg_project_idx on project_task_groups(project_id, position);

alter table project_task_groups enable row level security;

create policy ptg_select on project_task_groups for select to authenticated using (
  can_view_project(project_id)
);
create policy ptg_modify on project_task_groups for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

create table if not exists project_tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  group_id uuid references project_task_groups(id) on delete set null,
  title text not null,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  deadline date,
  comment text,
  linked_goal_id uuid references tracker_custom_drivers(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

create index if not exists pt_project_idx on project_tasks(project_id, position);
create index if not exists pt_group_idx on project_tasks(group_id);

alter table project_tasks enable row level security;

create policy pt_select on project_tasks for select to authenticated using (
  can_view_project(project_id)
);
create policy pt_modify on project_tasks for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

-- Backfill дефолтних груп для всіх існуючих проєктів
insert into project_task_groups (project_id, name, is_seed, position)
select p.id, g.name, true, g.pos
from projects p
cross join (values
  ('Продукт', 0),
  ('Воронки', 1),
  ('Трафік', 2),
  ('Комунікація', 3),
  ('Аналітика', 4)
) as g(name, pos)
where not exists (
  select 1 from project_task_groups ptg
  where ptg.project_id = p.id and ptg.is_seed = true and ptg.name = g.name
);
