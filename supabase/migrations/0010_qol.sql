-- ============================================================
-- 0010: quality-of-life
--  - product_prices: декілька цін на один продукт
--  - project_expenses.payer: на кого лягає витрата (project/center/expert)
--  - tracker_custom_drivers.is_done: тренд-мод (для текстових цілей)
-- ============================================================

create table if not exists product_prices (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  price numeric not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_prices_product_idx on product_prices (product_id);

alter table product_prices enable row level security;

create policy pp_select on product_prices for select to authenticated using (
  exists (select 1 from products p where p.id = product_id and can_view_project(p.project_id))
);
create policy pp_modify on product_prices for all to authenticated
  using (exists (select 1 from products p where p.id = product_id and can_edit_project(p.project_id)))
  with check (exists (select 1 from products p where p.id = product_id and can_edit_project(p.project_id)));

-- payer
alter table project_expenses add column if not exists payer text not null default 'project';
-- ('project' | 'center' | 'expert')

-- text-цілі
alter table tracker_custom_drivers add column if not exists is_done boolean not null default false;
