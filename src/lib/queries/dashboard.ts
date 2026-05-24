import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { FunnelDailyLog, FunnelMetric, Profile } from '@/lib/supabase/types'

function thisMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export type DashboardRow = {
  id: string
  expert_name: string
  producer_name: string | null
  work_model: string
  status: string
  revenue_plan_min: number
  revenue_plan_avg: number
  revenue_plan_max: number
  revenue_actual: number
  expected_pct: number
  flag: 'green' | 'yellow' | 'red' | 'success' | 'rocket'
  has_tracker: boolean
}

function classifyFlag(
  actual: number,
  plans: { min: number; avg: number; max: number },
  dayOfMonth: number,
  daysInMonth: number,
): DashboardRow['flag'] {
  if (plans.max > 0 && actual >= plans.max) return 'rocket'
  if (plans.avg > 0 && actual >= plans.avg) return 'success'
  const expected = plans.avg > 0 ? plans.avg * (dayOfMonth / daysInMonth) : 0
  if (expected === 0) return 'green'
  const ratio = actual / expected
  if (ratio >= 0.85) return 'green'
  if (ratio >= 0.7) return 'yellow'
  return 'red'
}

export async function listDashboard(): Promise<DashboardRow[]> {
  const supabase = await createClient()
  const { year, month } = thisMonth()

  const { data: projects, error } = await supabase
    .from('projects')
    .select(
      `id, expert_name, work_model, status,
       producer:profiles!projects_producer_id_fkey(full_name, email)`,
    )
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  type Raw = {
    id: string
    expert_name: string
    work_model: string
    status: string
    producer: Pick<Profile, 'full_name' | 'email'> | null
  }
  const list = (projects ?? []) as unknown as Raw[]

  const { data: trackers } = await supabase
    .from('monthly_trackers')
    .select('id, project_id, revenue_plan_min, revenue_plan_avg, revenue_plan_max')
    .eq('year', year)
    .eq('month', month)

  const trackerByProject = new Map<string, { id: string; min: number; avg: number; max: number }>()
  for (const t of (trackers ?? []) as { id: string; project_id: string; revenue_plan_min: number; revenue_plan_avg: number; revenue_plan_max: number }[]) {
    trackerByProject.set(t.project_id, {
      id: t.id,
      min: Number(t.revenue_plan_min),
      avg: Number(t.revenue_plan_avg),
      max: Number(t.revenue_plan_max),
    })
  }

  const factByTracker = new Map<string, number>()
  const trackerIds = [...trackerByProject.values()].map((t) => t.id)
  if (trackerIds.length > 0) {
    const { data: funnels } = await supabase
      .from('funnels')
      .select('id, tracker_id, metrics:funnel_metrics(*), log:funnel_daily_log(*)')
      .in('tracker_id', trackerIds)

    type FunnelRaw = {
      id: string
      tracker_id: string
      metrics: FunnelMetric[]
      log: FunnelDailyLog[]
    }
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`

    for (const f of ((funnels ?? []) as unknown as FunnelRaw[])) {
      const revMetric = f.metrics.find((m) => m.role === 'revenue')
      if (!revMetric) continue
      let rev = 0
      for (const r of f.log) {
        if (r.day_date < monthStart || r.day_date > monthEnd) continue
        const v = r.values?.[revMetric.key]
        if (typeof v === 'number' && Number.isFinite(v)) rev += v
      }
      factByTracker.set(f.tracker_id, (factByTracker.get(f.tracker_id) ?? 0) + rev)
    }
  }

  const today = new Date()
  const dayOfMonth = today.getUTCDate()
  const dim = daysInMonth(year, month)

  return list.map<DashboardRow>((p) => {
    const t = trackerByProject.get(p.id)
    const actual = t ? (factByTracker.get(t.id) ?? 0) : 0
    const plans = { min: t?.min ?? 0, avg: t?.avg ?? 0, max: t?.max ?? 0 }
    return {
      id: p.id,
      expert_name: p.expert_name,
      producer_name: p.producer?.full_name ?? p.producer?.email ?? null,
      work_model: p.work_model,
      status: p.status,
      revenue_plan_min: plans.min,
      revenue_plan_avg: plans.avg,
      revenue_plan_max: plans.max,
      revenue_actual: actual,
      expected_pct: plans.avg > 0 ? Math.round((actual / plans.avg) * 100) : 0,
      flag: classifyFlag(actual, plans, dayOfMonth, dim),
      has_tracker: Boolean(t),
    }
  })
}
