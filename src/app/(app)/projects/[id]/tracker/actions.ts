'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const revalidate = (projectId: string) => {
  revalidatePath(`/projects/${projectId}/tracker`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/units`)
  revalidatePath(`/projects/${projectId}/products`)
  revalidatePath('/')
}

// ============================================================
// Tracker fields (планы, NPS, launch, mood)
// ============================================================
export async function updateTrackerField(
  trackerId: string,
  projectId: string,
  field: string,
  value: string | number | null,
): Promise<void> {
  await requireProfile()
  const allowed = new Set([
    'revenue_plan_min',
    'revenue_plan_avg',
    'revenue_plan_max',
    'sales_plan',
    'applications_plan',
    'avg_check_plan',
    'traffic_enabled',
    'nps',
    'launch_status',
    'expert_mood',
    'summary_main',
    'summary_worked',
    'summary_not_worked',
    'summary_changes',
  ])
  if (!allowed.has(field)) return
  const supabase = await createClient()
  await supabase
    .from('monthly_trackers')
    .update({ [field]: value })
    .eq('id', trackerId)
  revalidate(projectId)
}

// ============================================================
// Weekly plan (Блок A)
// ============================================================
export async function setWeeklyPlan(
  trackerId: string,
  projectId: string,
  weekIndex: number,
  amount: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  if (amount === 0) {
    await supabase
      .from('tracker_weekly_plans')
      .delete()
      .eq('tracker_id', trackerId)
      .eq('week_index', weekIndex)
  } else {
    await supabase
      .from('tracker_weekly_plans')
      .upsert(
        { tracker_id: trackerId, week_index: weekIndex, revenue_plan: amount },
        { onConflict: 'tracker_id,week_index' },
      )
  }
  revalidate(projectId)
}

// ============================================================
// Custom drivers
// ============================================================
export async function addCustomDriver(
  trackerId: string,
  projectId: string,
  name: string,
  unit: string,
  plan: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('tracker_custom_drivers')
    .select('position')
    .eq('tracker_id', trackerId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('tracker_custom_drivers').insert({
    tracker_id: trackerId,
    name,
    unit: unit || null,
    plan_value: plan,
    position: (last?.position ?? -1) + 1,
  })
  revalidate(projectId)
}

export async function updateCustomDriver(
  driverId: string,
  projectId: string,
  patch: Partial<{ name: string; unit: string; plan_value: number; actual_value: number }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_custom_drivers').update(patch).eq('id', driverId)
  revalidate(projectId)
}

export async function deleteCustomDriver(driverId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_custom_drivers').delete().eq('id', driverId)
  revalidate(projectId)
}

// ============================================================
// Funnels
// ============================================================
const CreateFunnelSchema = z.object({
  tracker_id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1).max(200).trim(),
  is_mini_product: z.boolean().default(false),
  product_ids: z.array(z.uuid()).default([]),
})

export async function createFunnel(input: {
  tracker_id: string
  project_id: string
  name: string
  is_mini_product: boolean
  product_ids: string[]
}): Promise<void> {
  await requireProfile()
  const parsed = CreateFunnelSchema.safeParse(input)
  if (!parsed.success) return

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnels')
    .select('position')
    .eq('tracker_id', parsed.data.tracker_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: funnel } = await supabase
    .from('funnels')
    .insert({
      tracker_id: parsed.data.tracker_id,
      name: parsed.data.name,
      is_mini_product: parsed.data.is_mini_product,
      position: (last?.position ?? -1) + 1,
    })
    .select('id')
    .single()

  if (funnel && parsed.data.product_ids.length > 0) {
    await supabase
      .from('funnel_products')
      .insert(parsed.data.product_ids.map((pid) => ({ funnel_id: funnel.id, product_id: pid })))
  }

  revalidate(parsed.data.project_id)
}

export async function updateFunnel(
  funnelId: string,
  projectId: string,
  patch: Partial<{ name: string; is_mini_product: boolean }>,
  product_ids?: string[],
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  if (Object.keys(patch).length > 0) {
    await supabase.from('funnels').update(patch).eq('id', funnelId)
  }
  if (product_ids !== undefined) {
    await supabase.from('funnel_products').delete().eq('funnel_id', funnelId)
    if (product_ids.length > 0) {
      await supabase
        .from('funnel_products')
        .insert(product_ids.map((pid) => ({ funnel_id: funnelId, product_id: pid })))
    }
  }
  revalidate(projectId)
}

export async function deleteFunnel(funnelId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnels').delete().eq('id', funnelId)
  revalidate(projectId)
}

// ============================================================
// Stages
// ============================================================
export async function addStage(
  funnelId: string,
  projectId: string,
  name: string,
  kind: 'application' | 'intermediate' | 'payment',
  plan: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnel_stages')
    .select('position')
    .eq('funnel_id', funnelId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('funnel_stages').insert({
    funnel_id: funnelId,
    name,
    kind,
    plan_value: plan,
    position: (last?.position ?? -1) + 1,
  })
  revalidate(projectId)
}

export async function updateStage(
  stageId: string,
  projectId: string,
  patch: Partial<{ name: string; kind: 'application' | 'intermediate' | 'payment'; plan_value: number }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stages').update(patch).eq('id', stageId)
  revalidate(projectId)
}

export async function deleteStage(stageId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_stages').delete().eq('id', stageId)
  revalidate(projectId)
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
      .from('funnel_stage_daily_logs')
      .delete()
      .eq('stage_id', stageId)
      .eq('day_date', day)
  } else {
    await supabase
      .from('funnel_stage_daily_logs')
      .upsert(
        { stage_id: stageId, day_date: day, amount },
        { onConflict: 'stage_id,day_date' },
      )
  }
  revalidate(projectId)
}

// ============================================================
// Sales (продажи с разбивкой по продуктам)
// ============================================================
export async function addSale(input: {
  funnel_id: string
  project_id: string
  product_id: string
  day_date: string
  qty: number
  unit_price: number
  notes?: string
}): Promise<void> {
  const me = await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_sales').insert({
    funnel_id: input.funnel_id,
    product_id: input.product_id,
    day_date: input.day_date,
    qty: input.qty,
    unit_price: input.unit_price,
    notes: input.notes ?? null,
    created_by: me.id,
  })
  revalidate(input.project_id)
}

export async function deleteSale(saleId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_sales').delete().eq('id', saleId)
  revalidate(projectId)
}

// ============================================================
// Traffic per funnel
// ============================================================
export async function setTrafficDaily(
  funnelId: string,
  projectId: string,
  day: string,
  amount: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  if (amount === 0) {
    await supabase
      .from('funnel_traffic_daily')
      .delete()
      .eq('funnel_id', funnelId)
      .eq('day_date', day)
  } else {
    await supabase
      .from('funnel_traffic_daily')
      .upsert(
        { funnel_id: funnelId, day_date: day, amount },
        { onConflict: 'funnel_id,day_date' },
      )
  }
  revalidate(projectId)
}
