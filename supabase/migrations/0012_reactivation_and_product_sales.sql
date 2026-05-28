-- ============================================================
-- 0012:
--   1) funnel_reactivations — переноси лідів між воронками
--      Source funnel передає N лідів в target funnel за певну дату.
--      Видно у джерела як "перенесено в воронку Х" і в цілі як
--      "Реактивація з воронки Y".
--   2) funnel_product_sales — продажі по конкретному продукту за день
--      Для воронок, в яких прив'язано >1 продукту: при внесенні даних
--      обираємо який продукт продали. Сума по днях покриває
--      payment__count / payment__amount.
-- ============================================================

create table if not exists funnel_reactivations (
  id uuid primary key default uuid_generate_v4(),
  source_funnel_id uuid not null references funnels(id) on delete cascade,
  target_funnel_id uuid not null references funnels(id) on delete cascade,
  day_date date not null,
  count int not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  unique (source_funnel_id, target_funnel_id, day_date)
);

create index if not exists fr_source_idx on funnel_reactivations (source_funnel_id, day_date);
create index if not exists fr_target_idx on funnel_reactivations (target_funnel_id, day_date);

alter table funnel_reactivations enable row level security;

create policy fr_select on funnel_reactivations for select to authenticated using (
  exists (
    select 1 from funnels f
    join monthly_trackers t on t.id = f.tracker_id
    where f.id = source_funnel_id and can_view_project(t.project_id)
  )
  or exists (
    select 1 from funnels f
    join monthly_trackers t on t.id = f.tracker_id
    where f.id = target_funnel_id and can_view_project(t.project_id)
  )
);

create policy fr_modify on funnel_reactivations for all to authenticated
  using (
    exists (
      select 1 from funnels f
      join monthly_trackers t on t.id = f.tracker_id
      where f.id = source_funnel_id and can_edit_project(t.project_id)
    )
  )
  with check (
    exists (
      select 1 from funnels f
      join monthly_trackers t on t.id = f.tracker_id
      where f.id = source_funnel_id and can_edit_project(t.project_id)
    )
  );

create table if not exists funnel_product_sales (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  day_date date not null,
  count int not null default 0 check (count >= 0),
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (funnel_id, product_id, day_date)
);

create index if not exists fps_funnel_idx on funnel_product_sales (funnel_id, day_date);

alter table funnel_product_sales enable row level security;

create policy fps_select on funnel_product_sales for select to authenticated using (
  exists (
    select 1 from funnels f
    join monthly_trackers t on t.id = f.tracker_id
    where f.id = funnel_id and can_view_project(t.project_id)
  )
);

create policy fps_modify on funnel_product_sales for all to authenticated
  using (
    exists (
      select 1 from funnels f
      join monthly_trackers t on t.id = f.tracker_id
      where f.id = funnel_id and can_edit_project(t.project_id)
    )
  )
  with check (
    exists (
      select 1 from funnels f
      join monthly_trackers t on t.id = f.tracker_id
      where f.id = funnel_id and can_edit_project(t.project_id)
    )
  );
