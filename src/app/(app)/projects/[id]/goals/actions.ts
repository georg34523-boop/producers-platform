'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const MonthSchema = z.object({
  project_id: z.uuid(),
  title: z.string().min(2).max(200).trim(),
  period_start: z.iso.date(),
})

export type GoalActionState = { error?: string } | undefined

export async function createMonthGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const me = await requireProfile()
  const parsed = MonthSchema.safeParse({
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    period_start: formData.get('period_start'),
  })
  if (!parsed.success) return { error: 'Заполни название и дату начала месяца' }

  // period_start expected like 'YYYY-MM-01'; compute end-of-month
  const start = new Date(parsed.data.period_start + 'T00:00:00Z')
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))

  const supabase = await createClient()
  const { error } = await supabase.from('goals').insert({
    project_id: parsed.data.project_id,
    title: parsed.data.title,
    period_type: 'month',
    period_start: parsed.data.period_start,
    period_end: end.toISOString().slice(0, 10),
    created_by: me.id,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/goals`)
  return undefined
}

const WeekSchema = z.object({
  project_id: z.uuid(),
  parent_goal_id: z.uuid(),
  title: z.string().min(2).max(200).trim(),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
})

export async function createWeekGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const me = await requireProfile()
  const parsed = WeekSchema.safeParse({
    project_id: formData.get('project_id'),
    parent_goal_id: formData.get('parent_goal_id'),
    title: formData.get('title'),
    period_start: formData.get('period_start'),
    period_end: formData.get('period_end'),
  })
  if (!parsed.success) return { error: 'Заполни название и даты недели' }

  const supabase = await createClient()
  const { error } = await supabase.from('goals').insert({
    project_id: parsed.data.project_id,
    parent_goal_id: parsed.data.parent_goal_id,
    title: parsed.data.title,
    period_type: 'week',
    period_start: parsed.data.period_start,
    period_end: parsed.data.period_end,
    created_by: me.id,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/goals`)
  return undefined
}

const MetricSchema = z.object({
  goal_id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1).max(120).trim(),
  unit: z.string().max(20).trim().optional().or(z.literal('')),
  target_value: z.coerce.number(),
  actual_value: z.coerce.number().default(0),
})

export async function addMetric(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  await requireProfile()
  const parsed = MetricSchema.safeParse({
    goal_id: formData.get('goal_id'),
    project_id: formData.get('project_id'),
    name: formData.get('name'),
    unit: formData.get('unit') ?? '',
    target_value: formData.get('target_value'),
    actual_value: formData.get('actual_value') ?? 0,
  })
  if (!parsed.success) return { error: 'Проверь значения метрики' }
  const supabase = await createClient()
  const { error } = await supabase.from('goal_metrics').insert({
    goal_id: parsed.data.goal_id,
    name: parsed.data.name,
    unit: parsed.data.unit || null,
    target_value: parsed.data.target_value,
    actual_value: parsed.data.actual_value,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/goals`)
  return undefined
}

export async function updateMetricActual(
  metricId: string,
  projectId: string,
  actual: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('goal_metrics').update({ actual_value: actual }).eq('id', metricId)
  revalidatePath(`/projects/${projectId}/goals`)
}

export async function deleteGoal(goalId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('goals').delete().eq('id', goalId)
  revalidatePath(`/projects/${projectId}/goals`)
}

export async function deleteMetric(metricId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('goal_metrics').delete().eq('id', metricId)
  revalidatePath(`/projects/${projectId}/goals`)
}
