-- ============================================================
-- 0014: Дебіторка (receivables)
--   funnel_product_sales.amount  = "зайшло фактом" (paid revenue)
--   funnel_product_sales.receivable_amount = непогашена сума боргу (stock)
--   Доплати від клієнта рухають гроші звідси в amount.
-- ============================================================

alter table funnel_product_sales
  add column if not exists receivable_amount numeric not null default 0
    check (receivable_amount >= 0);
