-- ============================================================
-- 0011: дозволити week_index до 6 (для місяців з 6 календарними тижнями Mon-Sun)
-- ============================================================

alter table tracker_weekly_plans drop constraint if exists tracker_weekly_plans_week_index_check;
alter table tracker_weekly_plans
  add constraint tracker_weekly_plans_week_index_check
  check (week_index between 1 and 6);
