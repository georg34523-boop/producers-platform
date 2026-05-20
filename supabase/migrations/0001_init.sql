-- Producers Platform: initial schema
-- Conventions: uuid PKs, timestamptz timestamps, RLS on every table,
-- helper SQL functions for role checks (SECURITY DEFINER where needed).

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================
create type user_role as enum ('team_lead', 'producer', 'expert', 'member');
create type project_status as enum ('active', 'paused', 'archived');
create type task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type task_priority as enum ('low', 'normal', 'high');
create type goal_period as enum ('month', 'week');
create type help_status as enum ('open', 'in_progress', 'resolved');
create type comment_entity as enum ('task', 'goal', 'project', 'help_request');

-- ============================================================
-- profiles: 1-1 with auth.users
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role user_role not null default 'member',
  telegram_chat_id text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);

-- Auto-create profile on signup
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

-- ============================================================
-- Helper functions for RLS
-- ============================================================
create or replace function current_role_value()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_team_lead()
returns boolean
language sql
stable
as $$
  select current_role_value() = 'team_lead'
$$;

create or replace function is_producer()
returns boolean
language sql
stable
as $$
  select current_role_value() = 'producer'
$$;

-- ============================================================
-- projects
-- ============================================================
create table projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  expert_id uuid references profiles(id) on delete set null,
  producer_id uuid references profiles(id) on delete set null,
  status project_status not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  archived_at timestamptz
);

create index projects_producer_idx on projects(producer_id);
create index projects_expert_idx on projects(expert_id);
create index projects_status_idx on projects(status);

-- ============================================================
-- project_members: extra people on a project
-- ============================================================
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Helper: can current user view this project?
create or replace function can_view_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_team_lead()
    or is_producer()
    or exists (
      select 1 from projects
      where id = p_id
        and (expert_id = auth.uid() or producer_id = auth.uid())
    )
    or exists (
      select 1 from project_members
      where project_id = p_id and user_id = auth.uid()
    )
$$;

-- Helper: can current user edit this project's data?
create or replace function can_edit_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    is_team_lead()
    or exists (
      select 1 from projects
      where id = p_id and producer_id = auth.uid()
    )
$$;

-- ============================================================
-- goals
-- ============================================================
create table goals (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_goal_id uuid references goals(id) on delete cascade,
  period_type goal_period not null,
  period_start date not null,
  period_end date not null,
  title text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index goals_project_idx on goals(project_id);
create index goals_period_idx on goals(period_type, period_start);
create index goals_parent_idx on goals(parent_goal_id);

-- ============================================================
-- goal_metrics
-- ============================================================
create table goal_metrics (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid not null references goals(id) on delete cascade,
  name text not null,
  unit text,
  target_value numeric not null,
  actual_value numeric not null default 0,
  sheet_url text,
  sheet_cell text,
  last_synced_at timestamptz,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index goal_metrics_goal_idx on goal_metrics(goal_id);

-- ============================================================
-- tasks
-- ============================================================
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_task_id uuid references tasks(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'normal',
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  recurring_rule text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  completed_at timestamptz
);

create index tasks_project_status_idx on tasks(project_id, status);
create index tasks_assignee_idx on tasks(assignee_id);
create index tasks_due_idx on tasks(due_date);
create index tasks_parent_idx on tasks(parent_task_id);
create index tasks_goal_idx on tasks(goal_id);

-- ============================================================
-- task_checklist_items
-- ============================================================
create table task_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index checklist_task_idx on task_checklist_items(task_id);

-- ============================================================
-- comments (polymorphic)
-- ============================================================
create table comments (
  id uuid primary key default uuid_generate_v4(),
  entity_type comment_entity not null,
  entity_id uuid not null,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_entity_idx on comments(entity_type, entity_id);

-- ============================================================
-- help_requests
-- ============================================================
create table help_requests (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  body text,
  status help_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id)
);

create index help_requests_status_idx on help_requests(status, created_at desc);
create index help_requests_project_idx on help_requests(project_id);

-- ============================================================
-- files (knowledge base per project)
-- ============================================================
create table files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now()
);

create index files_project_idx on files(project_id);

-- ============================================================
-- RLS
-- ============================================================
alter table profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table goals enable row level security;
alter table goal_metrics enable row level security;
alter table tasks enable row level security;
alter table task_checklist_items enable row level security;
alter table comments enable row level security;
alter table help_requests enable row level security;
alter table files enable row level security;

-- profiles: everyone authenticated can read profiles (needed for assignee names);
-- only team_lead can change roles; users can update their own profile fields
create policy profiles_select on profiles
  for select to authenticated using (true);

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy profiles_update_tl on profiles
  for update to authenticated
  using (is_team_lead())
  with check (is_team_lead());

create policy profiles_insert_tl on profiles
  for insert to authenticated
  with check (is_team_lead());

-- projects: visibility via can_view_project, edit via can_edit_project; create/delete: team_lead only
create policy projects_select on projects
  for select to authenticated using (can_view_project(id));

create policy projects_insert on projects
  for insert to authenticated with check (is_team_lead());

create policy projects_update on projects
  for update to authenticated using (can_edit_project(id)) with check (can_edit_project(id));

create policy projects_delete on projects
  for delete to authenticated using (is_team_lead());

-- project_members: visible if can_view_project; mutated by team_lead or project's producer
create policy pm_select on project_members
  for select to authenticated using (can_view_project(project_id));

create policy pm_modify on project_members
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

-- goals: read if can_view_project; write if can_edit_project
create policy goals_select on goals
  for select to authenticated using (can_view_project(project_id));

create policy goals_modify on goals
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

-- goal_metrics: read/write follow parent goal's project
create policy gm_select on goal_metrics
  for select to authenticated using (
    exists (select 1 from goals g where g.id = goal_id and can_view_project(g.project_id))
  );

create policy gm_modify on goal_metrics
  for all to authenticated
  using (exists (select 1 from goals g where g.id = goal_id and can_edit_project(g.project_id)))
  with check (exists (select 1 from goals g where g.id = goal_id and can_edit_project(g.project_id)));

-- tasks
create policy tasks_select on tasks
  for select to authenticated using (can_view_project(project_id));

create policy tasks_modify on tasks
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));

-- checklist items: follow task's project
create policy ci_select on task_checklist_items
  for select to authenticated using (
    exists (select 1 from tasks t where t.id = task_id and can_view_project(t.project_id))
  );

create policy ci_modify on task_checklist_items
  for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and can_edit_project(t.project_id)));

-- comments: read if can view the parent project; write if user is in project context.
-- Project resolution per entity_type happens via SECURITY DEFINER helper to keep policies simple.
create or replace function comment_can_view(_entity_type comment_entity, _entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare _project uuid;
begin
  case _entity_type
    when 'project' then _project := _entity_id;
    when 'task' then select project_id into _project from tasks where id = _entity_id;
    when 'goal' then select project_id into _project from goals where id = _entity_id;
    when 'help_request' then select project_id into _project from help_requests where id = _entity_id;
  end case;
  return _project is not null and can_view_project(_project);
end;
$$;

create policy comments_select on comments
  for select to authenticated using (comment_can_view(entity_type, entity_id));

create policy comments_insert on comments
  for insert to authenticated
  with check (author_id = auth.uid() and comment_can_view(entity_type, entity_id));

create policy comments_update_own on comments
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy comments_delete on comments
  for delete to authenticated using (author_id = auth.uid() or is_team_lead());

-- help_requests: only team_lead + producers see ANY help_request; not experts/members.
create policy hr_select on help_requests
  for select to authenticated using (
    (is_team_lead() or is_producer()) and can_view_project(project_id)
  );

create policy hr_insert on help_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and can_edit_project(project_id));

create policy hr_update on help_requests
  for update to authenticated using (
    is_team_lead() or requester_id = auth.uid()
  ) with check (
    is_team_lead() or requester_id = auth.uid()
  );

-- files: read/write follows project edit/view rules
create policy files_select on files
  for select to authenticated using (can_view_project(project_id));

create policy files_modify on files
  for all to authenticated
  using (can_edit_project(project_id))
  with check (can_edit_project(project_id));
