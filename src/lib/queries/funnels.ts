import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Funnel, FunnelStage, FunnelStageWeek } from '@/lib/supabase/types'

export type StageWithWeeks = FunnelStage & { weeks: FunnelStageWeek[] }
export type FunnelWithStages = Funnel & { stages: StageWithWeeks[] }

export async function listFunnels(projectId: string): Promise<FunnelWithStages[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('funnels')
    .select(
      `*,
       stages:funnel_stages(*, weeks:funnel_stage_weeks(*))`,
    )
    .eq('project_id', projectId)
    .order('period_start', { ascending: false })

  if (error) throw new Error(error.message)
  const funnels = (data ?? []) as unknown as FunnelWithStages[]
  return funnels.map((f) => ({
    ...f,
    stages: [...f.stages]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        ...s,
        weeks: [...s.weeks].sort((a, b) => a.week_start.localeCompare(b.week_start)),
      })),
  }))
}
