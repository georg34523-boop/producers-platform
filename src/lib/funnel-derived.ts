// Автоматичні розрахункові метрики воронки.
// Не зберігаються в БД — рахуються на льоту для відображення.

import { convert, type Currency } from '@/lib/currency'
import type { FunnelDailyLog, FunnelMetric } from '@/lib/supabase/types'

function sumByKey(log: FunnelDailyLog[], key: string, inRange?: (d: string) => boolean): number {
  let s = 0
  for (const r of log) {
    if (inRange && !inRange(r.day_date)) continue
    const v = r.values?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

function findByRole(metrics: FunnelMetric[], role: FunnelMetric['role']) {
  return metrics.find((m) => m.role === role)
}

export type DerivedMetric = {
  key: string
  label: string
  value: number
  unit: string
  hint?: string
}

/** Усі автоматичні агрегати воронки за період. */
export type DerivedCurrencyContext = {
  revenueCurrency: Currency
  trafficCurrency: Currency
  usdEurRate: number
}

export function computeDerivedMetrics(
  metrics: FunnelMetric[],
  log: FunnelDailyLog[],
  inRange?: (d: string) => boolean,
  ctx?: DerivedCurrencyContext,
): DerivedMetric[] {
  const sum = (key: string) => sumByKey(log, key, inRange)
  const out: DerivedMetric[] = []
  const revenueSymbol = ctx ? (ctx.revenueCurrency === 'EUR' ? '€' : '$') : '$'
  const trafficSymbol = ctx ? (ctx.trafficCurrency === 'EUR' ? '€' : '$') : '$'
  const spentInRevenue = (raw: number) => {
    if (!ctx) return raw
    return convert(raw, ctx.trafficCurrency, ctx.revenueCurrency, ctx.usdEurRate)
  }

  // Опорні значення — підбираємо за роллю/stage_group/лейблом, а не точними ключами
  const spentM =
    findByRole(metrics, 'traffic_spend') ??
    metrics.find((m) => m.key === 'traffic__spent') ??
    metrics.find((m) => /витрач|spent|cost/i.test(m.label))
  const impressionsM =
    metrics.find((m) => m.stage_group === 'traffic' && /impressions$/i.test(m.key)) ??
    metrics.find((m) => m.key === 'traffic__impressions') ??
    metrics.find((m) => /показ|impression/i.test(m.label))
  const clicksM =
    metrics.find((m) => m.stage_group === 'traffic' && /clicks$/i.test(m.key)) ??
    metrics.find((m) => m.key === 'traffic__clicks') ??
    metrics.find((m) => /кл.к|click/i.test(m.label))
  // Заявки: спершу application.total (main + retry), якщо є — інакше будь-яка метрика з role='applications'
  const applicationTotal = metrics.find(
    (m) => m.stage_group === 'application' && m.computed_from && m.computed_from.length > 0,
  )
  const fallbackApplicationsM = findByRole(metrics, 'applications')
  const applicationsM = applicationTotal ?? fallbackApplicationsM
  const revenueMain = metrics.find((m) => m.role === 'revenue' && m.stage_group?.startsWith('payment'))
  const revenueMini = metrics.find(
    (m) => m.role === 'revenue' && m.stage_group?.startsWith('mini_payment'),
  )
  const salesMain = metrics.find((m) => m.role === 'sales' && m.stage_group?.startsWith('payment'))
  const salesMini = metrics.find(
    (m) => m.role === 'sales' && m.stage_group?.startsWith('mini_payment'),
  )

  const spent = spentM ? sum(spentM.key) : 0
  const impressions = impressionsM ? sum(impressionsM.key) : 0
  const clicks = clicksM ? sum(clicksM.key) : 0
  const applications = applicationsM
    ? applicationsM.computed_from?.length
      ? applicationsM.computed_from.reduce((s, k) => s + sum(k), 0)
      : sum(applicationsM.key)
    : 0
  const revenueMainAmount = revenueMain ? sum(revenueMain.key) : 0
  const revenueMiniAmount = revenueMini ? sum(revenueMini.key) : 0
  const revenue = revenueMainAmount + revenueMiniAmount
  const sales = salesMain ? sum(salesMain.key) : 0
  const miniSales = salesMini ? sum(salesMini.key) : 0

  // Всього заявок (як перша цифра, найважливіша)
  if (applications > 0) {
    out.push({ key: 'total_apps', label: 'Всього заявок', value: applications, unit: 'шт' })
  }

  // Для ROAS/ROMI/CPL/CPC/CPM перераховуємо spent у валюту виручки
  const spentInRev = spentInRevenue(spent)

  // CPM = (spent / impressions) × 1000 — показуємо у валюті трафіку (це ціна реклами)
  if (spent > 0 && impressions > 0) {
    out.push({ key: 'cpm', label: 'CPM', value: (spent / impressions) * 1000, unit: trafficSymbol })
  }
  // CPC = spent / clicks — у валюті трафіку
  if (spent > 0 && clicks > 0) {
    out.push({ key: 'cpc', label: 'CPC', value: spent / clicks, unit: trafficSymbol })
  }
  // CTR = clicks / impressions × 100
  if (clicks > 0 && impressions > 0) {
    out.push({ key: 'ctr', label: 'CTR', value: (clicks / impressions) * 100, unit: '%' })
  }
  // CR сайту = applications / clicks × 100
  if (applications > 0 && clicks > 0) {
    out.push({ key: 'cr_landing', label: 'CR сайту', value: (applications / clicks) * 100, unit: '%' })
  }
  // CPL = spent / applications — у валюті трафіку
  if (spent > 0 && applications > 0) {
    out.push({ key: 'cpl', label: 'CPL', value: spent / applications, unit: trafficSymbol })
  }
  // ROAS = revenue / spent_in_revenue_currency × 100 (виправно, навіть якщо валюти різні)
  if (revenue > 0 && spentInRev > 0) {
    out.push({ key: 'roas', label: 'ROAS', value: (revenue / spentInRev) * 100, unit: '%' })
  }
  // ROMI = (revenue − spent_in_revenue_currency) / spent_in_revenue_currency × 100
  if (spentInRev > 0) {
    out.push({ key: 'romi', label: 'ROMI', value: ((revenue - spentInRev) / spentInRev) * 100, unit: '%' })
  }
  // Середній чек = revenue (основний продукт) / sales (основний продукт) — у валюті виручки
  if (revenueMainAmount > 0 && sales > 0) {
    out.push({
      key: 'avg_check',
      label: 'Середній чек',
      value: revenueMainAmount / sales,
      unit: revenueSymbol,
      hint: 'Без врахування мини-продукту',
    })
  }
  // Покупки міні-продукту: кількість і сума (коли є стейдж mini_payment)
  if (miniSales > 0) {
    out.push({ key: 'mini_count', label: 'Покупок мини', value: miniSales, unit: 'шт' })
  }
  if (revenueMiniAmount > 0) {
    out.push({ key: 'mini_amount', label: 'Сума мини', value: revenueMiniAmount, unit: revenueSymbol })
  }
  return out
}

/** Конверсії між сусідніми «продуктовими» етапами воронки. */
export type StageConversion = {
  from_label: string
  to_label: string
  value: number // %
}

export function computeStageConversions(
  metrics: FunnelMetric[],
  log: FunnelDailyLog[],
  inRange?: (d: string) => boolean,
): StageConversion[] {
  // Беремо «головні» метрики кожного стейджу: для composite — applications/count/total (роль applications/sales/other)
  // Збираємо в порядку position лише ті стейджі, що не trafic
  const byGroup = new Map<string, FunnelMetric[]>()
  const order: string[] = []
  for (const m of [...metrics].sort((a, b) => a.position - b.position)) {
    if (m.stage_group === 'traffic') continue
    const sg = m.stage_group ?? 'other'
    if (!byGroup.has(sg)) {
      byGroup.set(sg, [])
      order.push(sg)
    }
    byGroup.get(sg)!.push(m)
  }

  const headline = (group: FunnelMetric[]): FunnelMetric | null => {
    // 1) applications role 2) sales role 3) computed total 4) first metric
    return (
      group.find((m) => m.role === 'applications') ??
      group.find((m) => m.role === 'sales') ??
      group.find((m) => m.computed_from && m.computed_from.length > 0) ??
      group[0] ??
      null
    )
  }

  const sum = (key: string) => sumByKey(log, key, inRange)
  const sumComputed = (m: FunnelMetric) =>
    m.computed_from?.length ? m.computed_from.reduce((s, k) => s + sum(k), 0) : sum(m.key)

  const res: StageConversion[] = []
  for (let i = 1; i < order.length; i++) {
    const prev = headline(byGroup.get(order[i - 1]!)!)
    const cur = headline(byGroup.get(order[i]!)!)
    if (!prev || !cur) continue
    const a = sumComputed(prev)
    const b = sumComputed(cur)
    if (a <= 0) continue
    res.push({
      from_label: prev.label,
      to_label: cur.label,
      value: (b / a) * 100,
    })
  }
  return res
}
