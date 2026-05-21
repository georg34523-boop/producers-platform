'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type FunnelActionState = { error?: string } | undefined

function endOfMonth(start: string): string {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0))
  return e.toISOString().slice(0, 10)
}

const FunnelSchema = z.object({
  project_id: z.uuid(),
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(2000).trim().optional().or(z.literal('')),
  period_start: z.iso.date(),
})

export async function createFunnel(
  _prev: FunnelActionState,
  formData: FormData,
): Promise<FunnelActionState> {
  const me = await requireProfile()
  const parsed = FunnelSchema.safeParse({
    project_id: formData.get('project_id'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    period_start: formData.get('period_start'),
  })
  if (!parsed.success) return { error: 'Заполни название и период' }

  const supabase = await createClient()
  const { error } = await supabase.from('funnels').insert({
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    period_start: parsed.data.period_start,
    period_end: endOfMonth(parsed.data.period_start),
    created_by: me.id,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/funnels`)
  return undefined
}

export async function deleteFunnel(funnelId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnels').delete().eq('id', funnelId)
  revalidatePath(`/projects/${projectId}/funnels`)
}

const StageSchema = z.object({
  funnel_id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1).max(120).trim(),
  unit: z.string().max(20).trim().optional().or(z.literal('')),
  target_value: z.coerce.number().default(0),
})

export async function createStage(
  _prev: FunnelActionState,
  formData: FormData,
): Promise<FunnelActionState> {
  await requireProfile()
  const parsed = StageSchema.safeParse({
    funnel_id: formData.get('funnel_id'),
    project_id: formData.get('project_id'),
    name: formData.get('name'),
    unit: formData.get('unit') ?? '',
    target_value: formData.get('target_value') ?? 0,
  })
  if (!parsed.success) return { error: 'Проверь поля стадии' }

  const supabase = await createClient()
  // position = current count
  const { data: existing } = await supabase
    .from('funnel_stages')
    .select('id')
    .eq('funnel_id', parsed.data.funnel_id)
  const position = (existing ?? []).length

  const { error } = await supabase.from('funnel_stages').insert({
    funnel_id: parsed.data.funnel_id,
    name: parsed.data.name,
    unit: parsed.data.unit || null,
    target_value: parsed.data.target_value,
    position,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/funnels`)
  return undefined
}

export async function updateStage(
  stageId: string,
  projectId: string,
  patch: Partial<{ name: string; unit: string | null; target_value: number; actual_value: number }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stages').update(patch).eq('id', stageId)
  revalidatePath(`/projects/${projectId}/funnels`)
}

export async function deleteStage(stageId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stages').delete().eq('id', stageId)
  revalidatePath(`/projects/${projectId}/funnels`)
}

const WeekSchema = z.object({
  stage_id: z.uuid(),
  project_id: z.uuid(),
  week_start: z.iso.date(),
  week_end: z.iso.date(),
  target: z.coerce.number().default(0),
})

export async function createWeek(
  _prev: FunnelActionState,
  formData: FormData,
): Promise<FunnelActionState> {
  await requireProfile()
  const parsed = WeekSchema.safeParse({
    stage_id: formData.get('stage_id'),
    project_id: formData.get('project_id'),
    week_start: formData.get('week_start'),
    week_end: formData.get('week_end'),
    target: formData.get('target') ?? 0,
  })
  if (!parsed.success) return { error: 'Проверь даты недели' }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('funnel_stage_weeks')
    .select('id')
    .eq('stage_id', parsed.data.stage_id)
  const position = (existing ?? []).length

  const { error } = await supabase.from('funnel_stage_weeks').insert({
    stage_id: parsed.data.stage_id,
    week_start: parsed.data.week_start,
    week_end: parsed.data.week_end,
    target: parsed.data.target,
    position,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/funnels`)
  return undefined
}

export async function updateWeek(
  weekId: string,
  projectId: string,
  patch: Partial<{ target: number; actual: number }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stage_weeks').update(patch).eq('id', weekId)
  revalidatePath(`/projects/${projectId}/funnels`)
}

export async function deleteWeek(weekId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stage_weeks').delete().eq('id', weekId)
  revalidatePath(`/projects/${projectId}/funnels`)
}
