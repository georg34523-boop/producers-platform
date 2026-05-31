import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type {
  ProjectTask,
  ProjectTaskGroup,
  TrackerCustomDriver,
} from '@/lib/supabase/types'

export async function getTaskGroups(projectId: string): Promise<ProjectTaskGroup[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_task_groups')
    .select('*')
    .eq('project_id', projectId)
    .order('position')
  return (data ?? []) as ProjectTaskGroup[]
}

export async function getTasks(projectId: string): Promise<ProjectTask[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position')
  return (data ?? []) as ProjectTask[]
}

/** Доп цілі (custom drivers) поточного активного трекера проєкту. */
export async function getCurrentMonthGoals(
  projectId: string,
): Promise<TrackerCustomDriver[]> {
  const supabase = await createClient()
  const d = new Date()
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const { data: tracker } = await supabase
    .from('monthly_trackers')
    .select('id')
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (!tracker) return []
  const { data } = await supabase
    .from('tracker_custom_drivers')
    .select('*')
    .eq('tracker_id', tracker.id)
    .order('position')
  return (data ?? []) as TrackerCustomDriver[]
}
