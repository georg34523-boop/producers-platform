import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Goal, GoalMetric } from '@/lib/supabase/types'

export type GoalWithMetrics = Goal & { metrics: GoalMetric[] }
export type MonthGoal = GoalWithMetrics & { weeks: GoalWithMetrics[] }

export async function listGoals(projectId: string): Promise<MonthGoal[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .select('*, metrics:goal_metrics(*)')
    .eq('project_id', projectId)
    .order('period_start', { ascending: false })
    .order('period_type', { ascending: true })

  if (error) throw new Error(error.message)
  const all = (data ?? []) as GoalWithMetrics[]
  const months = all.filter((g) => g.period_type === 'month')
  const weeks = all.filter((g) => g.period_type === 'week')
  return months.map((m) => ({
    ...m,
    weeks: weeks
      .filter((w) => w.parent_goal_id === m.id)
      .sort((a, b) => a.period_start.localeCompare(b.period_start)),
  }))
}
