-- ============================================================
-- 0009: multi-product per funnel, multi-channel traffic, expanded library
-- ============================================================

-- Воронка → багато продуктів (m:m)
create table if not exists funnel_products (
  funnel_id uuid not null references funnels(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  primary key (funnel_id, product_id)
);

-- Перенесемо існуючий product_id у funnel_products
insert into funnel_products (funnel_id, product_id)
select id, product_id from funnels where product_id is not null
on conflict do nothing;

alter table funnel_products enable row level security;

create policy fp_select on funnel_products for select to authenticated using (
  exists (
    select 1 from funnels f
      join monthly_trackers t on t.id = f.tracker_id
     where f.id = funnel_id and can_view_project(t.project_id)
  )
);
create policy fp_modify on funnel_products for all to authenticated
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

-- Мульти-канал трафіку
alter table funnels add column if not exists traffic_channels text[] not null default '{}'::text[];

-- Перенесемо існуючий traffic_channel у traffic_channels (якщо було)
update funnels
   set traffic_channels = array[traffic_channel]
 where traffic_channel is not null
   and (traffic_channels is null or array_length(traffic_channels, 1) is null);
