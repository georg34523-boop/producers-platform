import 'server-only'

import { createClient } from '@/lib/supabase/server'

function thisMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export type ProjectRow = {
  id: string
  name: string
  expert_name: string | null
  status: string
  producer_name: string | null
  revenue_plan: number
  revenue_actual: number
  revenue_pct: number
  flag: 'green' | 'yellow' | 'red'
  has_tracker: boolean
}

function flagFor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 85) return 'green'
  if (pct >= 70) return 'yellow'
  return 'red'
}

/** Все проекты с их месячным трекером за текущий месяц (если есть). */
export async function listProjectsWithCurrentTracker(): Promise<ProjectRow[]> {
  const supabase = await createClient()
  const { year, month } = thisMonth()

  const { data: projects, error } = await supabase
    .from('projects')
    .select(
      `id, name, expert_name, status,
       producer:profiles!projects_producer_id_fkey(full_name, email),
       trackers:monthly_trackers!monthly_trackers_project_id_fkey(
         id, year, month, revenue_plan
       )`,
    )
    .neq('status', 'archived')

  if (error) throw new Error(error.message)

  type Raw = {
    id: string
    name: string
    expert_name: string | null
    status: string
    producer: { full_name: string | null; email: string } | null
    trackers: { id: string; year: number; month: number; revenue_plan: number }[]
  }
  const rows = (projects ?? []) as unknown as Raw[]

  // Get actuals from daily logs for all trackers of the current month
  const trackerIds = rows
    .map((r) => r.trackers.find((t) => t.year === year && t.month === month)?.id)
    .filter((v): v is string => Boolean(v))

  const actualByTracker = new Map<string, number>()
  if (trackerIds.length > 0) {
    const { data: logs } = await supabase
      .from('tracker_daily_logs')
      .select('tracker_id, amount')
      .eq('kind', 'revenue')
      .in('tracker_id', trackerIds)
    for (const l of (logs ?? []) as { tracker_id: string; amount: number }[]) {
      actualByTracker.set(l.tracker_id, (actualByTracker.get(l.tracker_id) ?? 0) + Number(l.amount))
    }
  }

  return rows.map((r) => {
    const t = r.trackers.find((x) => x.year === year && x.month === month)
    const plan = t?.revenue_plan ?? 0
    const actual = t ? (actualByTracker.get(t.id) ?? 0) : 0
    const pct = plan > 0 ? Math.round((actual / plan) * 100) : 0
    return {
      id: r.id,
      name: r.name,
      expert_name: r.expert_name,
      status: r.status,
      producer_name: r.producer?.full_name ?? r.producer?.email ?? null,
      revenue_plan: plan,
      revenue_actual: actual,
      revenue_pct: pct,
      flag: flagFor(pct),
      has_tracker: Boolean(t),
    }
  })
}
