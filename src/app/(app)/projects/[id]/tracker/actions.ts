'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import {
  FUNNEL_DEFAULTS,
  type FunnelType,
  getStageTemplate,
  metricKeyFor,
  metricLabelFor,
} from '@/lib/funnel-library'
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
  await supabase.from('monthly_trackers').update({ [field]: value }).eq('id', trackerId)
  revalidate(projectId)
}

// ============================================================
// Кастомні цілі місяця (custom drivers)
// ============================================================
export async function addCustomGoal(
  trackerId: string,
  projectId: string,
  name: string,
  targetValue: number,
  unit: string,
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
    plan_value: targetValue,
    actual_value: 0,
    position: (last?.position ?? -1) + 1,
  })
  revalidate(projectId)
}

export async function incrementCustomGoal(
  goalId: string,
  projectId: string,
  delta: number,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: cur } = await supabase
    .from('tracker_custom_drivers')
    .select('actual_value')
    .eq('id', goalId)
    .maybeSingle()
  const next = Math.max(0, Number(cur?.actual_value ?? 0) + delta)
  await supabase
    .from('tracker_custom_drivers')
    .update({ actual_value: next })
    .eq('id', goalId)
  revalidate(projectId)
}

export async function updateCustomGoal(
  goalId: string,
  projectId: string,
  patch: Partial<{ name: string; plan_value: number; actual_value: number; unit: string | null; is_done: boolean }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_custom_drivers').update(patch).eq('id', goalId)
  revalidate(projectId)
}

export async function deleteCustomGoal(goalId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tracker_custom_drivers').delete().eq('id', goalId)
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
// Funnels (type + default stages)
// ============================================================
const CreateFunnelSchema = z.object({
  tracker_id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1).max(200).trim(),
  funnel_type: z.enum([
    'webinar',
    'autowebinar',
    'vsl',
    'tripwire',
    'subscription',
    'lead_magnet',
    'telegram_channel',
    'direct_landing',
  ]),
  product_ids: z.array(z.uuid()).default([]),
  traffic_enabled: z.boolean().default(true),
  traffic_channels: z.array(z.string().max(60)).default([]),
})

export async function createFunnel(input: {
  tracker_id: string
  project_id: string
  name: string
  funnel_type: FunnelType
  product_ids: string[]
  traffic_enabled: boolean
  traffic_channels: string[]
}): Promise<string | null> {
  await requireProfile()
  const parsed = CreateFunnelSchema.safeParse(input)
  if (!parsed.success) return null

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('funnels')
    .select('position')
    .eq('tracker_id', parsed.data.tracker_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: funnel, error } = await supabase
    .from('funnels')
    .insert({
      tracker_id: parsed.data.tracker_id,
      name: parsed.data.name,
      funnel_type: parsed.data.funnel_type,
      product_id: parsed.data.product_ids[0] ?? null, // legacy primary
      traffic_enabled: parsed.data.traffic_enabled,
      traffic_channels: parsed.data.traffic_channels,
      position: (last?.position ?? -1) + 1,
    })
    .select('id')
    .single()
  if (error || !funnel) return null

  // Привʼязка до продуктів (m:m)
  if (parsed.data.product_ids.length > 0) {
    await supabase
      .from('funnel_products')
      .insert(parsed.data.product_ids.map((pid) => ({ funnel_id: funnel.id, product_id: pid })))
  }

  // Авто-добавление стандартных этапов для выбранного типа
  const defaults = FUNNEL_DEFAULTS[parsed.data.funnel_type]
  for (const tplKey of defaults) {
    await addStageInternal(supabase, funnel.id, tplKey, parsed.data.funnel_type)
  }

  // Авто-додаємо базові метрики трафіку (щоб CR/CPC/CTR могли рахуватися одразу)
  if (parsed.data.traffic_enabled) {
    const baseTraffic = [
      { key: 'spent', label: 'Витрачено', role: 'traffic_spend' as const, unit: '$' },
      { key: 'impressions', label: 'Покази', role: 'other' as const, unit: 'шт' },
      { key: 'clicks', label: 'Кліки', role: 'other' as const, unit: 'шт' },
    ]
    const { data: lastPos } = await supabase
      .from('funnel_metrics')
      .select('position')
      .eq('funnel_id', funnel.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    let startPos = (lastPos?.position ?? -1) + 1
    const rows = baseTraffic.map((t) => ({
      funnel_id: funnel.id,
      stage_group: 'traffic',
      key: metricKeyFor('traffic', t.key),
      label: t.label,
      role: t.role,
      unit: t.unit,
      plan_value: 0,
      position: startPos++,
      computed_from: null,
    }))
    await supabase.from('funnel_metrics').insert(rows)
  }

  revalidate(parsed.data.project_id)
  return funnel.id
}

/** Управління multi-product. */
export async function setFunnelProducts(
  funnelId: string,
  projectId: string,
  productIds: string[],
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_products').delete().eq('funnel_id', funnelId)
  if (productIds.length > 0) {
    await supabase
      .from('funnel_products')
      .insert(productIds.map((pid) => ({ funnel_id: funnelId, product_id: pid })))
  }
  // Оновлюємо primary product_id (перший зі списку)
  await supabase
    .from('funnels')
    .update({ product_id: productIds[0] ?? null })
    .eq('id', funnelId)
  revalidate(projectId)
}

export async function updateFunnel(
  funnelId: string,
  projectId: string,
  patch: Partial<{
    name: string
    is_mini_product: boolean
    product_id: string | null
    funnel_type: FunnelType
    traffic_enabled: boolean
    traffic_channel: string | null
    traffic_channels: string[]
    traffic_currency: 'USD' | 'EUR' | null
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
// Etapy iz biblioteki
// ============================================================
async function addStageInternal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  funnelId: string,
  templateKey: string,
  funnelType: FunnelType | null = null,
): Promise<void> {
  const tpl = getStageTemplate(templateKey)
  if (!tpl) return

  let stageGroup = tpl.template
  if (tpl.variants && tpl.variants > 1) {
    const { data: existing } = await supabase
      .from('funnel_metrics')
      .select('stage_group')
      .eq('funnel_id', funnelId)
      .like('stage_group', `${tpl.template}_%`)
    const taken = new Set((existing ?? []).map((r) => r.stage_group as string))
    let idx = 1
    while (taken.has(`${tpl.template}_${idx}`)) idx++
    stageGroup = `${tpl.template}_${idx}`
  } else {
    const { data: existing } = await supabase
      .from('funnel_metrics')
      .select('id')
      .eq('funnel_id', funnelId)
      .eq('stage_group', stageGroup)
      .limit(1)
      .maybeSingle()
    if (existing) return
  }

  // Якщо funnelType не передано — підтягнемо з БД (для addStageFromTemplate)
  let resolvedType: FunnelType | null = funnelType
  if (!resolvedType) {
    const { data: f } = await supabase.from('funnels').select('funnel_type').eq('id', funnelId).maybeSingle()
    resolvedType = (f?.funnel_type as FunnelType | null) ?? null
  }

  const { data: last } = await supabase
    .from('funnel_metrics')
    .select('position')
    .eq('funnel_id', funnelId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const startPos = (last?.position ?? -1) + 1

  const rows = tpl.metrics.map((m, i) => ({
    funnel_id: funnelId,
    stage_group: stageGroup,
    key: metricKeyFor(stageGroup, m.key),
    label: metricLabelFor(tpl.template, m.key, m.label, resolvedType),
    role: m.role,
    unit: m.unit ?? null,
    plan_value: 0,
    position: startPos + i,
    computed_from: m.computed_from ? m.computed_from.map((k) => metricKeyFor(stageGroup, k)) : null,
  }))

  await supabase.from('funnel_metrics').insert(rows)
}

export async function addStageFromTemplate(
  funnelId: string,
  projectId: string,
  templateKey: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await addStageInternal(supabase, funnelId, templateKey)
  revalidate(projectId)
}

/** Видалити весь этап (всі метрики з stage_group). */
export async function deleteStage(
  funnelId: string,
  projectId: string,
  stageGroup: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase
    .from('funnel_metrics')
    .delete()
    .eq('funnel_id', funnelId)
    .eq('stage_group', stageGroup)
  revalidate(projectId)
}

/** Перемістити стейдж вгору/вниз. Свапає його з сусіднім (нетрафік) стейджем. */
export async function moveStage(
  funnelId: string,
  projectId: string,
  stageGroup: string,
  direction: 'up' | 'down',
): Promise<void> {
  await requireProfile()
  if (stageGroup === 'traffic') return // traffic завжди першим
  const supabase = await createClient()
  const { data: metrics } = await supabase
    .from('funnel_metrics')
    .select('id, stage_group, position')
    .eq('funnel_id', funnelId)
    .order('position')
  if (!metrics) return

  // Згрупувати у порядку появи
  const order: string[] = []
  const byGroup = new Map<string, string[]>()
  for (const m of metrics) {
    const sg = m.stage_group as string
    if (!byGroup.has(sg)) {
      byGroup.set(sg, [])
      order.push(sg)
    }
    byGroup.get(sg)!.push(m.id as string)
  }

  // Серед нетрафікових свапаємо
  const nonTraffic = order.filter((g) => g !== 'traffic')
  const idx = nonTraffic.indexOf(stageGroup)
  if (idx === -1) return
  const newIdx = direction === 'up' ? idx - 1 : idx + 1
  if (newIdx < 0 || newIdx >= nonTraffic.length) return
  ;[nonTraffic[idx], nonTraffic[newIdx]] = [nonTraffic[newIdx]!, nonTraffic[idx]!]

  // Зберігаємо traffic окремо, далі — оновлений нетрафіковий порядок
  const trafficIds = byGroup.get('traffic') ?? []
  const finalOrder = [...(trafficIds.length ? ['traffic'] : []), ...nonTraffic]

  let pos = 0
  for (const sg of finalOrder) {
    for (const id of byGroup.get(sg)!) {
      await supabase.from('funnel_metrics').update({ position: pos }).eq('id', id)
      pos++
    }
  }
  revalidate(projectId)
}

// ============================================================
// Метрики (для редагування існуючих)
// ============================================================
export async function updateMetric(
  metricId: string,
  projectId: string,
  patch: Partial<{ label: string; plan_value: number; unit: string | null }>,
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
// Параметри трафіку (library fields, додаються як метрики з stage_group='traffic')
// ============================================================
const TrafficFieldSchema = z.object({
  funnel_id: z.uuid(),
  project_id: z.uuid(),
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  role: z.enum(['traffic_spend', 'other']).default('other'),
  unit: z.string().max(10).optional().or(z.literal('')),
})

export async function addTrafficField(input: {
  funnel_id: string
  project_id: string
  key: string
  label: string
  role: 'traffic_spend' | 'other'
  unit?: string
}): Promise<void> {
  await requireProfile()
  const parsed = TrafficFieldSchema.safeParse(input)
  if (!parsed.success) return

  const supabase = await createClient()
  const fullKey = metricKeyFor('traffic', parsed.data.key)
  // not duplicate
  const { data: existing } = await supabase
    .from('funnel_metrics')
    .select('id')
    .eq('funnel_id', parsed.data.funnel_id)
    .eq('key', fullKey)
    .maybeSingle()
  if (existing) return

  const { data: last } = await supabase
    .from('funnel_metrics')
    .select('position')
    .eq('funnel_id', parsed.data.funnel_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  await supabase.from('funnel_metrics').insert({
    funnel_id: parsed.data.funnel_id,
    stage_group: 'traffic',
    key: fullKey,
    label: parsed.data.label,
    role: parsed.data.role,
    unit: parsed.data.unit || null,
    plan_value: 0,
    position: (last?.position ?? -1) + 1,
    computed_from: null,
  })
  revalidate(parsed.data.project_id)
}

// ============================================================
// Daily log
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
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) {
    const n = Number(v)
    if (Number.isFinite(n) && n !== 0) clean[k] = n
  }
  const allEmpty = Object.keys(clean).length === 0 && !comment
  if (allEmpty) {
    await supabase
      .from('funnel_daily_log')
      .delete()
      .eq('funnel_id', funnelId)
      .eq('day_date', day)
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

// ============================================================
// Реактивація: перенос лідів між воронками
// ============================================================
export async function upsertReactivation(input: {
  source_funnel_id: string
  target_funnel_id: string
  project_id: string
  day_date: string
  count: number
}): Promise<void> {
  await requireProfile()
  if (input.source_funnel_id === input.target_funnel_id) return
  const supabase = await createClient()
  const count = Math.max(0, Math.floor(Number(input.count) || 0))
  if (count === 0) {
    await supabase
      .from('funnel_reactivations')
      .delete()
      .eq('source_funnel_id', input.source_funnel_id)
      .eq('target_funnel_id', input.target_funnel_id)
      .eq('day_date', input.day_date)
  } else {
    await supabase
      .from('funnel_reactivations')
      .upsert(
        {
          source_funnel_id: input.source_funnel_id,
          target_funnel_id: input.target_funnel_id,
          day_date: input.day_date,
          count,
        },
        { onConflict: 'source_funnel_id,target_funnel_id,day_date' },
      )
  }
  revalidate(input.project_id)
}

export async function deleteReactivation(id: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('funnel_reactivations').delete().eq('id', id)
  revalidate(projectId)
}

// ============================================================
// Продажі по продуктах (для воронок з кількома продуктами)
// ============================================================
async function syncPaymentDayFromProductSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  funnelId: string,
  day: string,
): Promise<void> {
  // Сума всіх продажів по продуктах за день
  const { data: rows } = await supabase
    .from('funnel_product_sales')
    .select('count, amount, receivable_amount')
    .eq('funnel_id', funnelId)
    .eq('day_date', day)
  const totalCount = (rows ?? []).reduce((s, r) => s + Number(r.count ?? 0), 0)
  const totalAmount = (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const totalReceivable = (rows ?? []).reduce((s, r) => s + Number(r.receivable_amount ?? 0), 0)

  // Шукаємо payment-стейдж: keys payment__count / payment__amount / payment__receivable
  const { data: log } = await supabase
    .from('funnel_daily_log')
    .select('id, values, comment')
    .eq('funnel_id', funnelId)
    .eq('day_date', day)
    .maybeSingle()

  const values: Record<string, number> = { ...(log?.values ?? {}) }
  if (totalCount > 0) values['payment__count'] = totalCount
  else delete values['payment__count']
  if (totalAmount > 0) values['payment__amount'] = totalAmount
  else delete values['payment__amount']
  if (totalReceivable > 0) values['payment__receivable'] = totalReceivable
  else delete values['payment__receivable']

  const comment = log?.comment ?? null
  const allEmpty = Object.keys(values).length === 0 && !comment
  if (allEmpty) {
    if (log?.id) await supabase.from('funnel_daily_log').delete().eq('id', log.id)
  } else {
    await supabase.from('funnel_daily_log').upsert(
      {
        funnel_id: funnelId,
        day_date: day,
        values,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'funnel_id,day_date' },
    )
  }
}

export async function upsertProductSale(input: {
  funnel_id: string
  project_id: string
  product_id: string
  day_date: string
  count: number
  amount: number
  receivable_amount?: number
}): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const count = Math.max(0, Math.floor(Number(input.count) || 0))
  const amount = Math.max(0, Number(input.amount) || 0)
  const receivable = Math.max(0, Number(input.receivable_amount ?? 0) || 0)
  if (count === 0 && amount === 0 && receivable === 0) {
    await supabase
      .from('funnel_product_sales')
      .delete()
      .eq('funnel_id', input.funnel_id)
      .eq('product_id', input.product_id)
      .eq('day_date', input.day_date)
  } else {
    await supabase
      .from('funnel_product_sales')
      .upsert(
        {
          funnel_id: input.funnel_id,
          product_id: input.product_id,
          day_date: input.day_date,
          count,
          amount,
          receivable_amount: receivable,
        },
        { onConflict: 'funnel_id,product_id,day_date' },
      )
  }
  await syncPaymentDayFromProductSales(supabase, input.funnel_id, input.day_date)
  revalidate(input.project_id)
}

/** Доплата клієнта: переказ суми з дебіторки в paid_amount по конкретному продажу. */
export async function applyReceivablePayment(
  saleId: string,
  projectId: string,
  amount: number,
): Promise<void> {
  await requireProfile()
  const delta = Math.max(0, Number(amount) || 0)
  if (delta <= 0) return
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('funnel_product_sales')
    .select('funnel_id, day_date, amount, receivable_amount')
    .eq('id', saleId)
    .maybeSingle()
  if (!row) return
  const currentPaid = Number(row.amount ?? 0)
  const currentReceivable = Number(row.receivable_amount ?? 0)
  const applied = Math.min(delta, currentReceivable)
  if (applied <= 0) return
  await supabase
    .from('funnel_product_sales')
    .update({
      amount: currentPaid + applied,
      receivable_amount: currentReceivable - applied,
    })
    .eq('id', saleId)
  await syncPaymentDayFromProductSales(
    supabase,
    row.funnel_id as string,
    row.day_date as string,
  )
  revalidate(projectId)
}

export async function deleteProductSale(id: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('funnel_product_sales')
    .select('funnel_id, day_date')
    .eq('id', id)
    .maybeSingle()
  await supabase.from('funnel_product_sales').delete().eq('id', id)
  if (row) await syncPaymentDayFromProductSales(supabase, row.funnel_id as string, row.day_date as string)
  revalidate(projectId)
}
