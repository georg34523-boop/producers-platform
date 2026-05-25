-- ============================================================
-- 0008_funnel_library
-- Библиотечная модель воронок:
--  - funnel_type: один из 8 заданных типов
--  - traffic_channel + traffic_enabled на воронке
--  - stage_group на метрике (для визуальной группировки и identification composite этапов)
--  - computed_from на метрике (для авто-суммируемых: Заявки.total = main + retry)
-- Старые свободные метрики продолжают работать; новые добавляются из библиотеки.
-- ============================================================

alter table funnels add column if not exists funnel_type text;
alter table funnels add column if not exists traffic_enabled boolean not null default true;
alter table funnels add column if not exists traffic_channel text;

alter table funnel_metrics add column if not exists stage_group text;
alter table funnel_metrics add column if not exists computed_from text[];
