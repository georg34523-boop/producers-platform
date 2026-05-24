-- ============================================================
-- Рефакторинг воронки под реальный воркфлоу:
--  - один дневной ввод на (воронка × день): анкети, дзвінки ОП, продажі, виручка, витрати, коментар
--  - план на уровень воронки (анкети, продажі, виручка)
--  - воронка привязывается к ОДНОМУ продукту (M:M снимаем)
--  - мини-продукт может иметь список цен (тарифы)
--  - подпись «для 70/30» убираем — флаг применим к любой модели
--  - дропаем устаревшие стадии/дневные логи стадий/sales/traffic_daily
-- ============================================================

drop table if exists funnel_products cascade;
drop table if exists funnel_stage_daily_logs cascade;
drop table if exists funnel_stages cascade;
drop table if exists funnel_sales cascade;
drop table if exists funnel_traffic_daily cascade;

drop type if exists stage_kind cascade;

-- Воронка: добавляем product_id, планы и primary_price
alter table funnels add column if not exists product_id uuid references products(id) on delete set null;
alter table funnels add column if not exists applications_plan integer not null default 0;
alter table funnels add column if not exists sales_plan integer not null default 0;
alter table funnels add column if not exists revenue_plan numeric not null default 0;

-- Мини-цены (для мини-продукта может быть несколько тарифов)
create table funnel_mini_prices (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  name text not null,
  price numeric not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index funnel_mini_prices_funnel_idx on funnel_mini_prices (funnel_id);

-- Дневной журнал по воронке: одна строка на (воронка × день)
create table funnel_daily_journal (
  id uuid primary key default uuid_generate_v4(),
  funnel_id uuid not null references funnels(id) on delete cascade,
  day_date date not null,
  applications integer not null default 0,
  op_calls integer not null default 0,
  sales_count integer not null default 0,
  revenue numeric not null default 0,
  traffic_spend numeric not null default 0,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funnel_id, day_date)
);

create index funnel_daily_journal_idx on funnel_daily_journal (funnel_id, day_date);

-- RLS на новые таблицы
alter table funnel_mini_prices enable row level security;
alter table funnel_daily_journal enable row level security;

create policy fmp_select on funnel_mini_prices for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fmp_modify on funnel_mini_prices for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));

create policy fdj_select on funnel_daily_journal for select to authenticated using (
  exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_view_project(t.project_id))
);
create policy fdj_modify on funnel_daily_journal for all to authenticated
  using (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)))
  with check (exists (select 1 from funnels f join monthly_trackers t on t.id = f.tracker_id where f.id = funnel_id and can_edit_project(t.project_id)));
