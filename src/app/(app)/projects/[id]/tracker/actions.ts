'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export type TrackerActionState = { error?: string } | undefined

const UpdateTrackerSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  revenue_plan: z.coerce.number().optional(),
  traffic_enabled: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
  traffic_spend_plan: z.coerce.number().optional(),
  nps: z.coerce.number().int().min(0).max(10).optional(),
  launch_status: z.enum(['on_time', 'partial', 'failed']).optional(),
  expert_mood: z.string().max(2000).optional(),
  summary_main: z.string().max(5000).optional(),
  summary_worked: z.string().max(5000).optional(),
  summary_not_worked: z.string().max(5000).optional(),
  summary_changes: z.string().max(5000).optional(),
})

export async function updateTracker(formData: FormData): Promise<void> {
  await requireProfile()
  const raw: Record<string, unknown> = {
    id: formData.get('id'),
    project_id: formData.get('project_id'),
  }
  for (const k of [
    'revenue_plan',
    'traffic_enabled',
    'traffic_spend_plan',
    'nps',
    'launch_status',
    'expert_mood',
    'summary_main',
    'summary_worked',
    'summary_not_worked',
    'summary_changes',
  ]) {
    const v = formData.get(k)
    if (v !== null) raw[k] = v
  }
  const parsed = UpdateTrackerSchema.safeParse(raw)
  if (!parsed.success) return

  const { id, project_id, ...patch } = parsed.data
  const supabase = await createClient()
  await supabase.from('monthly_trackers').update(patch).eq('id', id)
  revalidatePath(`/projects/${project_id}/tracker`)
}

/** Записать (upsert) фактическое значение в дневной лог. */
export async function setDailyAmount(
  trackerId: string,
  projectId: string,
  day: string,
  kind: 'revenue' | 'traffic_spend' | 'leads',
  amount: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  if (amount === 0) {
    await supabase
      .from('tracker_daily_logs')
      .delete()
      .eq('tracker_id', trackerId)
      .eq('day_date', day)
      .eq('kind', kind)
  } else {
    await supabase
      .from('tracker_daily_logs')
      .upsert(
        { tracker_id: trackerId, day_date: day, kind, amount },
        { onConflict: 'tracker_id,day_date,kind' },
      )
  }
  revalidatePath(`/projects/${projectId}/tracker`)
}

// ============================================================
// Воронки
// ============================================================

export async function createFunnel(
  trackerId: string,
  projectId: string,
  name: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('tracker_funnels')
    .select('position')
    .eq('tracker_id', trackerId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('tracker_funnels').insert({
    tracker_id: trackerId,
    name,
    position: (last?.position ?? -1) + 1,
  })
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function renameFunnel(
  funnelId: string,
  projectId: string,
  name: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_funnels').update({ name }).eq('id', funnelId)
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function deleteFunnel(funnelId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_funnels').delete().eq('id', funnelId)
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function addStage(
  funnelId: string,
  projectId: string,
  name: string,
  plan: number,
  unit: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('tracker_funnel_stages')
    .select('position')
    .eq('funnel_id', funnelId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('tracker_funnel_stages').insert({
    funnel_id: funnelId,
    name,
    plan_value: plan,
    unit: unit || 'шт',
    position: (last?.position ?? -1) + 1,
  })
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function updateStage(
  stageId: string,
  projectId: string,
  patch: Partial<{ name: string; plan_value: number; unit: string }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_funnel_stages').update(patch).eq('id', stageId)
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function deleteStage(stageId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_funnel_stages').delete().eq('id', stageId)
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function setStageDailyAmount(
  stageId: string,
  projectId: string,
  day: string,
  amount: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  if (amount === 0) {
    await supabase
      .from('tracker_funnel_stage_logs')
      .delete()
      .eq('stage_id', stageId)
      .eq('day_date', day)
  } else {
    await supabase
      .from('tracker_funnel_stage_logs')
      .upsert(
        { stage_id: stageId, day_date: day, amount },
        { onConflict: 'stage_id,day_date' },
      )
  }
  revalidatePath(`/projects/${projectId}/tracker`)
}

// ============================================================
// Закрытие/открытие месяца
// ============================================================

export async function closeMonth(trackerId: string, projectId: string): Promise<void> {
  const me = await requireProfile()
  const supabase = await createClient()
  await supabase
    .from('monthly_trackers')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: me.id })
    .eq('id', trackerId)
  revalidatePath(`/projects/${projectId}/tracker`)
}

export async function reopenMonth(trackerId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase
    .from('monthly_trackers')
    .update({ status: 'open', closed_at: null, closed_by: null })
    .eq('id', trackerId)
  revalidatePath(`/projects/${projectId}/tracker`)
}
