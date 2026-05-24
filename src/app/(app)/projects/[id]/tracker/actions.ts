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
})

export async function createFunnel(input: {
  tracker_id: string
  project_id: string
  name: string
  is_mini_product: boolean
  product_id: string | null
}): Promise<string | null> {
  await requireProfile()
  const parsed = CreateFunnelSchema.safeParse({ ...input, product_id: input.product_id ?? '' })
  if (!parsed.success) return null

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
      product_id: parsed.data.product_id,
      position: (last?.position ?? -1) + 1,
    })
    .select('id')
    .single()

  // Дефолтный набор метрик при создании
  if (funnel) {
    const defaults = [
      { key: 'applications', label: 'Анкети', role: 'applications', unit: 'шт' },
      { key: 'sales', label: 'Продажі', role: 'sales', unit: 'шт' },
      { key: 'revenue', label: 'Виручка', role: 'revenue', unit: '$' },
    ]
    await supabase.from('funnel_metrics').insert(
      defaults.map((d, i) => ({
        funnel_id: funnel.id,
        key: d.key,
        label: d.label,
        role: d.role,
        unit: d.unit,
        plan_value: 0,
        position: i,
      })),
    )
  }

  revalidate(parsed.data.project_id)
  return funnel?.id ?? null
}

export async function updateFunnel(
  funnelId: string,
  projectId: string,
  patch: Partial<{ name: string; is_mini_product: boolean; product_id: string | null }>,
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
// Mini prices
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
// Metrics (configurable per funnel)
// ============================================================
const MetricSchema = z.object({
  funnel_id: z.uuid(),
  project_id: z.uuid(),
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, { error: 'Тільки a-z, 0-9, _ — без пробілів' })
    .trim(),
  label: z.string().min(1).max(60).trim(),
  role: z.enum(['revenue', 'sales', 'applications', 'traffic_spend', 'other']).default('other'),
  unit: z.string().max(20).optional().or(z.literal('')),
  plan_value: z.coerce.number().min(0).default(0),
})

export async function addMetric(input: {
  funnel_id: string
  project_id: string
  key: string
  label: string
  role: 'revenue' | 'sales' | 'applications' | 'traffic_spend' | 'other'
  unit?: string
  plan_value?: number
}): Promise<{ error?: string } | undefined> {
  await requireProfile()
  const parsed = MetricSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Помилка валідації' }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnel_metrics')
    .select('position')
    .eq('funnel_id', parsed.data.funnel_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('funnel_metrics').insert({
    funnel_id: parsed.data.funnel_id,
    key: parsed.data.key,
    label: parsed.data.label,
    role: parsed.data.role,
    unit: parsed.data.unit || null,
    plan_value: parsed.data.plan_value,
    position: (last?.position ?? -1) + 1,
  })
  if (error) return { error: error.message }
  revalidate(parsed.data.project_id)
}

export async function updateMetric(
  metricId: string,
  projectId: string,
  patch: Partial<{ label: string; role: 'revenue' | 'sales' | 'applications' | 'traffic_spend' | 'other'; unit: string | null; plan_value: number }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_metrics').update(patch).eq('id', metricId)
  revalidate(projectId)
}

export async function deleteMetric(metricId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_metrics').delete().eq('id', metricId)
  revalidate(projectId)
}

// ============================================================
// Daily log (jsonb по метрикам)
// ============================================================
export async function upsertDailyLog(
  funnelId: string,
  projectId: string,
  day: string,
  values: Record<string, number>,
  comment: string | null = null,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  // Чистим NaN/undefined
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) {
    const n = Number(v)
    if (Number.isFinite(n) && n !== 0) clean[k] = n
  }

  const allEmpty = Object.keys(clean).length === 0 && !comment
  if (allEmpty) {
    await supabase.from('funnel_daily_log').delete().eq('funnel_id', funnelId).eq('day_date', day)
  } else {
    await supabase.from('funnel_daily_log').upsert(
      {
        funnel_id: funnelId,
        day_date: day,
        values: clean,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'funnel_id,day_date' },
    )
  }
  revalidate(projectId)
}

export async function deleteLogRow(rowId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_daily_log').delete().eq('id', rowId)
  revalidate(projectId)
}
