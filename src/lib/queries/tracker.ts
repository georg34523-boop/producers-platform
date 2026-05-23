import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  Funnel,
  FunnelSale,
  FunnelStage,
  FunnelStageDailyLog,
  FunnelTrafficDaily,
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

/** Получить или создать месячный трекер. */
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

  // Скопировать планы из предыдущего месяца, если есть
  const prevDate = new Date(Date.UTC(year, month - 2, 1))
  const { data: prev } = await supabase
    .from('monthly_trackers')
    .select('revenue_plan_min, revenue_plan_avg, revenue_plan_max, sales_plan, applications_plan, avg_check_plan, traffic_enabled')
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
    traffic_enabled: prev?.traffic_enabled ?? false,
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

export type FunnelWithEverything = Funnel & {
  product_ids: string[]
  stages: (FunnelStage & { logs: FunnelStageDailyLog[] })[]
  sales: FunnelSale[]
  traffic: FunnelTrafficDaily[]
}

export async function getFunnels(trackerId: string): Promise<FunnelWithEverything[]> {
  const supabase = await createClient()
  const { data: funnels } = await supabase
    .from('funnels')
    .select(
      `*,
       funnel_products(product_id),
       stages:funnel_stages(*, logs:funnel_stage_daily_logs(*)),
       sales:funnel_sales(*),
       traffic:funnel_traffic_daily(*)`,
    )
    .eq('tracker_id', trackerId)
    .order('position')

  type Raw = Funnel & {
    funnel_products: { product_id: string }[]
    stages: (FunnelStage & { logs: FunnelStageDailyLog[] })[]
    sales: FunnelSale[]
    traffic: FunnelTrafficDaily[]
  }

  return ((funnels ?? []) as unknown as Raw[]).map((f) => ({
    ...f,
    product_ids: f.funnel_products.map((p) => p.product_id),
    stages: [...f.stages].sort((a, b) => a.position - b.position),
  }))
}

/** Все продажи трекера сразу — для агрегаций (драйверы, юниты). */
export async function getAllSales(trackerId: string): Promise<FunnelSale[]> {
  const supabase = await createClient()
  const { data: funnels } = await supabase
    .from('funnels')
    .select('id')
    .eq('tracker_id', trackerId)
  const funnelIds = (funnels ?? []).map((f) => f.id)
  if (funnelIds.length === 0) return []
  const { data } = await supabase.from('funnel_sales').select('*').in('funnel_id', funnelIds)
  return (data ?? []) as FunnelSale[]
}
