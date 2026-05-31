import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  Funnel,
  FunnelDailyLog,
  FunnelMetric,
  FunnelMiniPrice,
  FunnelProductSale,
  FunnelReactivation,
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
  product_sales: FunnelProductSale[]
  reactivations_out: FunnelReactivation[]
  reactivations_in: FunnelReactivation[]
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
       funnel_products(product_id),
       product_sales:funnel_product_sales(*)`,
    )
    .eq('tracker_id', trackerId)
    .order('position')

  type Raw = Funnel & {
    mini_prices: FunnelMiniPrice[]
    metrics: FunnelMetric[]
    log: FunnelDailyLog[]
    funnel_products: { product_id: string }[]
    product_sales: FunnelProductSale[]
  }
  const funnels = (data ?? []) as unknown as Raw[]
  const funnelIds = funnels.map((f) => f.id)

  let reactivations: FunnelReactivation[] = []
  if (funnelIds.length > 0) {
    const { data: r } = await supabase
      .from('funnel_reactivations')
      .select('*')
      .or(
        `source_funnel_id.in.(${funnelIds.join(',')}),target_funnel_id.in.(${funnelIds.join(',')})`,
      )
    reactivations = (r ?? []) as FunnelReactivation[]
  }

  return funnels.map((f) => ({
    ...f,
    mini_prices: [...f.mini_prices].sort((a, b) => a.position - b.position),
    metrics: [...f.metrics].sort((a, b) => a.position - b.position),
    log: [...f.log].sort((a, b) => a.day_date.localeCompare(b.day_date)),
    product_ids: f.funnel_products.map((fp) => fp.product_id),
    product_sales: [...(f.product_sales ?? [])].sort((a, b) =>
      a.day_date.localeCompare(b.day_date),
    ),
    reactivations_out: reactivations.filter((r) => r.source_funnel_id === f.id),
    reactivations_in: reactivations.filter((r) => r.target_funnel_id === f.id),
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

/** Семантические агрегаты воронки (выручка/продажі/анкети/трафік + дебіторка). */
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
    receivable: sumMetric(filteredLog, 'payment__receivable'),
  }
}

export type ProjectAllTimeTotals = {
  revenue: number
  sales: number
  applications: number
  traffic_spend: number
  months_count: number
  first_month: { year: number; month: number } | null
  last_month: { year: number; month: number } | null
}

/** Кросмісячна агрегація факту по проєкту: виручка/продажі/заявки/трафік за весь час. */
export async function getProjectAllTimeTotals(projectId: string): Promise<ProjectAllTimeTotals> {
  const supabase = await createClient()
  const { data: trackers } = await supabase
    .from('monthly_trackers')
    .select('id, year, month')
    .eq('project_id', projectId)
    .order('year')
    .order('month')
  const list = (trackers ?? []) as { id: string; year: number; month: number }[]
  if (list.length === 0) {
    return {
      revenue: 0,
      sales: 0,
      applications: 0,
      traffic_spend: 0,
      months_count: 0,
      first_month: null,
      last_month: null,
    }
  }

  const trackerIds = list.map((t) => t.id)
  const { data } = await supabase
    .from('funnels')
    .select(
      `id, tracker_id,
       mini_prices:funnel_mini_prices(*),
       metrics:funnel_metrics(*),
       log:funnel_daily_log(*),
       funnel_products(product_id),
       product_sales:funnel_product_sales(*)`,
    )
    .in('tracker_id', trackerIds)

  type Raw = {
    id: string
    tracker_id: string
    mini_prices: FunnelMiniPrice[]
    metrics: FunnelMetric[]
    log: FunnelDailyLog[]
    funnel_products: { product_id: string }[]
    product_sales: FunnelProductSale[]
  }
  const funnels = (data ?? []) as unknown as Raw[]

  const agg = { revenue: 0, sales: 0, applications: 0, traffic_spend: 0 }
  for (const f of funnels) {
    const fakeFunnel = {
      ...(f as unknown as Funnel),
      mini_prices: f.mini_prices,
      metrics: f.metrics,
      log: f.log,
      product_ids: f.funnel_products.map((fp) => fp.product_id),
      product_sales: f.product_sales,
      reactivations_out: [],
      reactivations_in: [],
    } as unknown as FunnelWithDetail
    const t = funnelSemanticTotals(fakeFunnel)
    agg.revenue += t.revenue
    agg.sales += t.sales
    agg.applications += t.applications
    agg.traffic_spend += t.traffic_spend
  }

  return {
    revenue: agg.revenue,
    sales: agg.sales,
    applications: agg.applications,
    traffic_spend: agg.traffic_spend,
    months_count: list.length,
    first_month: { year: list[0]!.year, month: list[0]!.month },
    last_month: { year: list[list.length - 1]!.year, month: list[list.length - 1]!.month },
  }
}

/** Кросмісячна актуальна дебіторка по проєкту: SUM(receivable_amount) по всіх продажах. */
export async function getProjectOutstandingReceivable(projectId: string): Promise<number> {
  const supabase = await createClient()
  // 1) всі трекери проєкту
  const { data: trackers } = await supabase
    .from('monthly_trackers')
    .select('id')
    .eq('project_id', projectId)
  const trackerIds = (trackers ?? []).map((t) => t.id as string)
  if (trackerIds.length === 0) return 0
  // 2) всі воронки цих трекерів
  const { data: funnels } = await supabase
    .from('funnels')
    .select('id')
    .in('tracker_id', trackerIds)
  const funnelIds = (funnels ?? []).map((f) => f.id as string)
  if (funnelIds.length === 0) return 0
  // 3) сума дебіторки по продажах
  const { data: sales } = await supabase
    .from('funnel_product_sales')
    .select('receivable_amount')
    .in('funnel_id', funnelIds)
  return (sales ?? []).reduce((s, r) => s + Number(r.receivable_amount ?? 0), 0)
}
