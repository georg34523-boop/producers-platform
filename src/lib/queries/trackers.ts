import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  MonthlyTracker,
  TrackerDailyLog,
  TrackerFunnel,
  TrackerFunnelStage,
  TrackerFunnelStageLog,
} from '@/lib/supabase/types'

export function nowYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Возвращает массив диапазонов недель внутри месяца в формате [{idx, start, end}]. */
export function weeksOfMonth(year: number, month: number): { idx: number; start: string; end: string }[] {
  const total = daysInMonth(year, month)
  const result: { idx: number; start: string; end: string }[] = []
  for (let i = 0; i < 4; i++) {
    const startDay = i * 7 + 1
    const endDay = i === 3 ? total : Math.min(startDay + 6, total)
    if (startDay > total) break
    const pad = (n: number) => String(n).padStart(2, '0')
    result.push({
      idx: i + 1,
      start: `${year}-${pad(month)}-${pad(startDay)}`,
      end: `${year}-${pad(month)}-${pad(endDay)}`,
    })
  }
  return result
}

/** Получить или создать месячный трекер на (project, year, month). */
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

  // Создаём; план копируем из предыдущего месяца (если есть)
  const prevDate = new Date(Date.UTC(year, month - 2, 1))
  const prevYear = prevDate.getUTCFullYear()
  const prevMonth = prevDate.getUTCMonth() + 1
  const { data: prev } = await supabase
    .from('monthly_trackers')
    .select('revenue_plan, traffic_enabled, traffic_spend_plan')
    .eq('project_id', projectId)
    .eq('year', prevYear)
    .eq('month', prevMonth)
    .maybeSingle()

  const insertPayload = {
    project_id: projectId,
    year,
    month,
    revenue_plan: prev?.revenue_plan ?? 0,
    traffic_enabled: prev?.traffic_enabled ?? false,
    traffic_spend_plan: prev?.traffic_spend_plan ?? 0,
  }

  const { data, error } = await supabase
    .from('monthly_trackers')
    .insert(insertPayload)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as MonthlyTracker
}

export async function getDailyLogs(trackerId: string): Promise<TrackerDailyLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_daily_logs')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('day_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TrackerDailyLog[]
}

export type FunnelWithStages = TrackerFunnel & {
  stages: (TrackerFunnelStage & { logs: TrackerFunnelStageLog[] })[]
}

export async function getFunnels(trackerId: string): Promise<FunnelWithStages[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracker_funnels')
    .select(`*, stages:tracker_funnel_stages(*, logs:tracker_funnel_stage_logs(*))`)
    .eq('tracker_id', trackerId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  type Raw = TrackerFunnel & {
    stages: (TrackerFunnelStage & { logs: TrackerFunnelStageLog[] })[]
  }
  return ((data ?? []) as Raw[]).map((f) => ({
    ...f,
    stages: [...f.stages].sort((a, b) => a.position - b.position),
  }))
}
