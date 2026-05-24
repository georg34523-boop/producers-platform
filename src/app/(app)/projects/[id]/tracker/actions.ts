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
// Tracker fields
// ============================================================
export async function updateTrackerField(
  trackerId: string,
  projectId: string,
  field: string,
  value: string | number | boolean | null,
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
// Funnels
// ============================================================
const CreateFunnelSchema = z.object({
  tracker_id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1).max(200).trim(),
  is_mini_product: z.boolean().default(false),
  product_id: z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v)),
  applications_plan: z.coerce.number().int().min(0).default(0),
  sales_plan: z.coerce.number().int().min(0).default(0),
  revenue_plan: z.coerce.number().min(0).default(0),
})

export async function createFunnel(input: {
  tracker_id: string
  project_id: string
  name: string
  is_mini_product: boolean
  product_id: string | null
  applications_plan: number
  sales_plan: number
  revenue_plan: number
}): Promise<void> {
  await requireProfile()
  const parsed = CreateFunnelSchema.safeParse({
    ...input,
    product_id: input.product_id ?? '',
  })
  if (!parsed.success) return

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnels')
    .select('position')
    .eq('tracker_id', parsed.data.tracker_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  await supabase.from('funnels').insert({
    tracker_id: parsed.data.tracker_id,
    name: parsed.data.name,
    is_mini_product: parsed.data.is_mini_product,
    product_id: parsed.data.product_id,
    applications_plan: parsed.data.applications_plan,
    sales_plan: parsed.data.sales_plan,
    revenue_plan: parsed.data.revenue_plan,
    position: (last?.position ?? -1) + 1,
  })

  revalidate(parsed.data.project_id)
}

export async function updateFunnel(
  funnelId: string,
  projectId: string,
  patch: Partial<{
    name: string
    is_mini_product: boolean
    product_id: string | null
    applications_plan: number
    sales_plan: number
    revenue_plan: number
  }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnels').update(patch).eq('id', funnelId)
  revalidate(projectId)
}

export async function deleteFunnel(funnelId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnels').delete().eq('id', funnelId)
  revalidate(projectId)
}

// ============================================================
// Mini-prices
// ============================================================
export async function addMiniPrice(
  funnelId: string,
  projectId: string,
  name: string,
  price: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnel_mini_prices')
    .select('position')
    .eq('funnel_id', funnelId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('funnel_mini_prices').insert({
    funnel_id: funnelId,
    name,
    price,
    position: (last?.position ?? -1) + 1,
  })
  revalidate(projectId)
}

export async function deleteMiniPrice(priceId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_mini_prices').delete().eq('id', priceId)
  revalidate(projectId)
}

// ============================================================
// Daily journal — главная точка ввода
// ============================================================
const JournalSchema = z.object({
  funnel_id: z.uuid(),
  project_id: z.uuid(),
  day_date: z.iso.date(),
  applications: z.coerce.number().int().min(0).default(0),
  op_calls: z.coerce.number().int().min(0).default(0),
  sales_count: z.coerce.number().int().min(0).default(0),
  revenue: z.coerce.number().min(0).default(0),
  traffic_spend: z.coerce.number().min(0).default(0),
  comment: z.string().max(2000).optional().or(z.literal('')),
})

export async function upsertJournalRow(input: {
  funnel_id: string
  project_id: string
  day_date: string
  applications: number
  op_calls: number
  sales_count: number
  revenue: number
  traffic_spend: number
  comment: string
}): Promise<void> {
  await requireProfile()
  const parsed = JournalSchema.safeParse(input)
  if (!parsed.success) return

  const supabase = await createClient()
  const allZero =
    parsed.data.applications === 0 &&
    parsed.data.op_calls === 0 &&
    parsed.data.sales_count === 0 &&
    parsed.data.revenue === 0 &&
    parsed.data.traffic_spend === 0 &&
    !parsed.data.comment

  if (allZero) {
    await supabase
      .from('funnel_daily_journal')
      .delete()
      .eq('funnel_id', parsed.data.funnel_id)
      .eq('day_date', parsed.data.day_date)
  } else {
    await supabase
      .from('funnel_daily_journal')
      .upsert(
        {
          funnel_id: parsed.data.funnel_id,
          day_date: parsed.data.day_date,
          applications: parsed.data.applications,
          op_calls: parsed.data.op_calls,
          sales_count: parsed.data.sales_count,
          revenue: parsed.data.revenue,
          traffic_spend: parsed.data.traffic_spend,
          comment: parsed.data.comment || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'funnel_id,day_date' },
      )
  }

  revalidate(parsed.data.project_id)
}

export async function updateJournalField(
  rowId: string,
  projectId: string,
  field: 'applications' | 'op_calls' | 'sales_count' | 'revenue' | 'traffic_spend' | 'comment',
  value: number | string | null,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase
    .from('funnel_daily_journal')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', rowId)
  revalidate(projectId)
}

export async function deleteJournalRow(rowId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_daily_journal').delete().eq('id', rowId)
  revalidate(projectId)
}
