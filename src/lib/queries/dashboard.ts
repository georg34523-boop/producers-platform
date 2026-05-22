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

export type DashboardResult =
  | { ok: true; rows: ProjectRow[] }
  | { ok: false; error: string; needsMigration: boolean }

/** Все проекты с их месячным трекером за текущий месяц (если есть). */
export async function listProjectsWithCurrentTracker(): Promise<DashboardResult> {
  const supabase = await createClient()
  const { year, month } = thisMonth()

  // Сначала тянем проекты — без джойна на monthly_trackers, чтобы не падать если миграции нет.
  const { data: projects, error } = await supabase
    .from('projects')
    .select(
      `id, name, expert_name, status,
       producer:profiles!projects_producer_id_fkey(full_name, email)`,
    )
    .neq('status', 'archived')

  if (error) {
    return { ok: false, error: error.message, needsMigration: false }
  }

  type Raw = {
    id: string
    name: string
    expert_name: string | null
    status: string
    producer: { full_name: string | null; email: string } | null
  }
  const rawProjects = (projects ?? []) as unknown as Raw[]

  // Пробуем подтянуть трекеры — если таблица не существует, возвращаем «нужна миграция»
  const { data: trackers, error: trErr } = await supabase
    .from('monthly_trackers')
    .select('id, project_id, revenue_plan')
    .eq('year', year)
    .eq('month', month)

  if (trErr) {
    if (/does not exist|relation .* does not exist|schema/i.test(trErr.message)) {
      return { ok: false, error: trErr.message, needsMigration: true }
    }
    return { ok: false, error: trErr.message, needsMigration: false }
  }

  const trackerByProject = new Map<string, { id: string; revenue_plan: number }>()
  for (const t of (trackers ?? []) as { id: string; project_id: string; revenue_plan: number }[]) {
    trackerByProject.set(t.project_id, { id: t.id, revenue_plan: t.revenue_plan })
  }

  const trackerIds = [...trackerByProject.values()].map((t) => t.id)
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

  const rows = rawProjects.map<ProjectRow>((r) => {
    const t = trackerByProject.get(r.id)
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

  return { ok: true, rows }
}
