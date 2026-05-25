import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  Funnel,
  FunnelDailyLog,
  FunnelMetric,
  FunnelMiniPrice,
  MonthlyTracker,
  TrackerCustomDriver,
  TrackerWeeklyPlan,
} from '@/lib/supabase/types'

export function nowYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function dayIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

export async function getOrCreateTracker(
  projectId: string,
  year: number,
  month: number,
): Promise<MonthlyTracker> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('monthly_trackers')
    .select('*')
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (existing) return existing as MonthlyTracker

  const prevDate = new Date(Date.UTC(year, month - 2, 1))
  const { data: prev } = await supabase
    .from('monthly_trackers')
    .select(
      'revenue_plan_min, revenue_plan_avg, revenue_plan_max, sales_plan, applications_plan, avg_check_plan',
    )
    .eq('project_id', projectId)
    .eq('year', prevDate.getUTCFullYear())
    .eq('month', prevDate.getUTCMonth() + 1)
    .maybeSingle()

  const payload = {
    project_id: projectId,
    year,
    month,
    revenue_plan_min: prev?.revenue_plan_min ?? 0,
    revenue_plan_avg: prev?.revenue_plan_avg ?? 0,
    revenue_plan_max: prev?.revenue_plan_max ?? 0,
    sales_plan: prev?.sales_plan ?? 0,
    applications_plan: prev?.applications_plan ?? 0,
    avg_check_plan: prev?.avg_check_plan ?? 0,
  }

  const { data, error } = await supabase
    .from('monthly_trackers')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as MonthlyTracker
}

export async function getWeeklyPlans(trackerId: string): Promise<TrackerWeeklyPlan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tracker_weekly_plans')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('week_index')
  return (data ?? []) as TrackerWeeklyPlan[]
}

export async function getCustomDrivers(trackerId: string): Promise<TrackerCustomDriver[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tracker_custom_drivers')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('position')
  return (data ?? []) as TrackerCustomDriver[]
}

export type FunnelWithDetail = Funnel & {
  mini_prices: FunnelMiniPrice[]
  metrics: FunnelMetric[]
  log: FunnelDailyLog[]
  product_ids: string[]
}

export async function getFunnels(trackerId: string): Promise<FunnelWithDetail[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('funnels')
    .select(
      `*,
       mini_prices:funnel_mini_prices(*),
       metrics:funnel_metrics(*),
       log:funnel_daily_log(*),
       funnel_products(product_id)`,
    )
    .eq('tracker_id', trackerId)
    .order('position')

  type Raw = Funnel & {
    mini_prices: FunnelMiniPrice[]
    metrics: FunnelMetric[]
    log: FunnelDailyLog[]
    funnel_products: { product_id: string }[]
  }
  return ((data ?? []) as unknown as Raw[]).map((f) => ({
    ...f,
    mini_prices: [...f.mini_prices].sort((a, b) => a.position - b.position),
    metrics: [...f.metrics].sort((a, b) => a.position - b.position),
    log: [...f.log].sort((a, b) => a.day_date.localeCompare(b.day_date)),
    product_ids: f.funnel_products.map((fp) => fp.product_id),
  }))
}

/** Сумма значений метрики по логу. */
export function sumMetric(log: FunnelDailyLog[], key: string): number {
  let s = 0
  for (const r of log) {
    const v = r.values?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

/** Найти метрику с указанной ролью (первая). */
export function findMetricByRole(metrics: FunnelMetric[], role: FunnelMetric['role']): FunnelMetric | null {
  return metrics.find((m) => m.role === role) ?? null
}

/** Семантические агрегаты воронки (выручка/продажі/анкети/трафік). */
export function funnelSemanticTotals(funnel: FunnelWithDetail, inRange?: (day: string) => boolean) {
  const filteredLog = inRange ? funnel.log.filter((r) => inRange(r.day_date)) : funnel.log
  const rev = findMetricByRole(funnel.metrics, 'revenue')
  const sales = findMetricByRole(funnel.metrics, 'sales')
  const apps = findMetricByRole(funnel.metrics, 'applications')
  const traffic = findMetricByRole(funnel.metrics, 'traffic_spend')
  return {
    revenue: rev ? sumMetric(filteredLog, rev.key) : 0,
    sales: sales ? sumMetric(filteredLog, sales.key) : 0,
    applications: apps ? sumMetric(filteredLog, apps.key) : 0,
    traffic_spend: traffic ? sumMetric(filteredLog, traffic.key) : 0,
  }
}
