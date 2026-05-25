// Калькулятор юнитов проекта согласно ТЗ v2 §8.
// Источник правды — funnel_daily_log + funnel_metrics с ролями.

import type {
  Funnel,
  FunnelDailyLog,
  FunnelMetric,
  Product,
  Project,
  ProjectExpense,
  ProjectReturn,
} from '@/lib/supabase/types'

export type UnitsInput = {
  project: Pick<Project, 'work_model' | 'fix_amount'>
  products: Product[]
  funnels: (Pick<Funnel, 'id' | 'product_id' | 'is_mini_product'> & {
    metrics: FunnelMetric[]
    log: FunnelDailyLog[]
  })[]
  expenses: ProjectExpense[]
  returns: ProjectReturn[]
  from: Date
  to: Date
}

export type ProductRevenueRow = {
  product_id: string | null
  name: string
  qty: number
  revenue: number
  pct_of_project: number
}

export type UnitsResult = {
  revenue_by_product: ProductRevenueRow[]
  gross_revenue: number
  expert_share: number
  center_income: number
  center_expenses: number
  net_profit: number
  margin: number
  ad_spend: number
  expert_profit: number
  romi: number
  drr: number
}

function inRange(d: string, from: Date, to: Date): boolean {
  const dt = new Date(d + 'T00:00:00Z')
  return dt >= from && dt <= to
}

function sumExpensesInRange(expenses: ProjectExpense[], from: Date, to: Date): number {
  let sum = 0
  const daysInRange = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
  const monthsInRange = Math.max(1, daysInRange / 30)
  for (const e of expenses) {
    if (e.recurrence === 'one_off') {
      const d = e.one_off_date ? new Date(e.one_off_date + 'T00:00:00Z') : null
      if (d && d >= from && d <= to) sum += Number(e.amount)
    } else {
      const start = e.start_date ? new Date(e.start_date + 'T00:00:00Z') : from
      const end = e.end_date ? new Date(e.end_date + 'T00:00:00Z') : to
      const eff_start = start > from ? start : from
      const eff_end = end < to ? end : to
      if (eff_end < eff_start) continue
      const days = Math.round((eff_end.getTime() - eff_start.getTime()) / 86_400_000) + 1
      const months = Math.max(0, days / 30)
      sum += Number(e.amount) * Math.min(months, monthsInRange)
    }
  }
  return sum
}

function computeCenterShare(
  workModel: Project['work_model'],
  fixAmount: number,
  effectiveRevenue: number,
  totalExpensesForProfit: number,
): number {
  if (workModel === 'fix_pct') {
    let pct = 0
    if (effectiveRevenue >= 15000) pct = 0.15
    else if (effectiveRevenue >= 10000) pct = 0.1
    else if (effectiveRevenue >= 5000) pct = 0.05
    return fixAmount + effectiveRevenue * pct
  }
  if (workModel === 'rev_70_30') {
    return effectiveRevenue * 0.3
  }
  const profit = Math.max(0, effectiveRevenue - totalExpensesForProfit)
  return profit * 0.5
}

function metricByRole(metrics: FunnelMetric[], role: FunnelMetric['role']): FunnelMetric | null {
  return metrics.find((m) => m.role === role) ?? null
}

function sumMetricInRange(
  metric: FunnelMetric | null,
  log: FunnelDailyLog[],
  from: Date,
  to: Date,
): number {
  if (!metric) return 0
  let s = 0
  for (const r of log) {
    if (!inRange(r.day_date, from, to)) continue
    const v = r.values?.[metric.key]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

export function computeUnits(input: UnitsInput): UnitsResult {
  const { project, products, funnels, expenses, returns, from, to } = input
  const productById = new Map(products.map((p) => [p.id, p]))

  // Помічники для нової формули виручки воронки
  const isMiniPaymentStage = (sg: string | null) =>
    sg !== null && sg.startsWith('mini_payment')
  const isMainPaymentStage = (sg: string | null) =>
    sg !== null && sg.startsWith('payment')

  const funnelAgg = funnels.map((f) => {
    const mainRevenue = f.metrics
      .filter((m) => m.role === 'revenue' && isMainPaymentStage(m.stage_group))
      .reduce((s, m) => s + sumMetricInRange(m, f.log, from, to), 0)
    const miniRevenue = f.metrics
      .filter((m) => m.role === 'revenue' && isMiniPaymentStage(m.stage_group))
      .reduce((s, m) => s + sumMetricInRange(m, f.log, from, to), 0)
    const trafficSpend = f.metrics
      .filter((m) => m.role === 'traffic_spend')
      .reduce((s, m) => s + sumMetricInRange(m, f.log, from, to), 0)
    const salesCount = f.metrics
      .filter((m) => m.role === 'sales' && isMainPaymentStage(m.stage_group))
      .reduce((s, m) => s + sumMetricInRange(m, f.log, from, to), 0)
    const hasMini = f.metrics.some((m) => isMiniPaymentStage(m.stage_group))

    // Нова формула: revenue = main + (hasMini ? (mini - traffic) : 0)
    // Якщо воронка лише міні (без main) — revenue = mini - traffic
    const hasMain = f.metrics.some((m) => isMainPaymentStage(m.stage_group))
    let revenue: number
    if (hasMain && hasMini) {
      revenue = mainRevenue + (miniRevenue - trafficSpend)
    } else if (hasMain) {
      revenue = mainRevenue
    } else if (hasMini) {
      revenue = miniRevenue - trafficSpend
    } else {
      revenue = mainRevenue + miniRevenue // fallback
    }

    return {
      ...f,
      revenue,
      mainRevenue,
      miniRevenue,
      sales_count: salesCount,
      traffic: trafficSpend,
      hasMini,
    }
  })

  const returnsInRange = returns.filter((r) => inRange(r.day_date, from, to))
  const totalReturns = returnsInRange.reduce((s, r) => s + Number(r.amount), 0)
  const returnsByProduct = new Map<string, number>()
  for (const r of returnsInRange) {
    if (!r.product_id) continue
    returnsByProduct.set(r.product_id, (returnsByProduct.get(r.product_id) ?? 0) + Number(r.amount))
  }

  // Нова формула: ефективна виручка = сума revenue по всіх воронках (з урахуванням
  // нюанса мини-продукта вже всередині per-funnel revenue). Окремих умов про "в плюс / не в плюс" нема.
  let effectiveRevenue = funnelAgg.reduce((s, f) => s + f.revenue, 0)
  effectiveRevenue = Math.max(0, effectiveRevenue - totalReturns)

  const gross = funnelAgg.reduce((s, f) => s + f.revenue, 0) - totalReturns
  const adSpend = funnelAgg.reduce((s, f) => s + f.traffic, 0)
  const centerExpenses = sumExpensesInRange(expenses, from, to)

  const centerIncome = computeCenterShare(
    project.work_model,
    Number(project.fix_amount ?? 0),
    effectiveRevenue,
    project.work_model === 'profit_50_50' ? adSpend + centerExpenses : 0,
  )
  const expertPart = gross - centerIncome
  const netProfit = centerIncome - centerExpenses
  const margin = gross > 0 ? netProfit / gross : 0
  const expertProfit = expertPart - adSpend
  const romi = adSpend > 0 ? (gross - adSpend) / adSpend : 0
  const drr = gross > 0 ? adSpend / gross : 0

  // Разрез выручки по продуктам:
  //  - main_revenue → привʼязаний продукт (або «без привʼязки»)
  //  - mini_revenue → «Мини-продукти в воронках» (агрегована, без привʼязки до продукту)
  const productRevMap = new Map<string, { qty: number; revenue: number }>()
  let miniAgg: { qty: number; revenue: number } | null = null
  let unassigned: { qty: number; revenue: number } | null = null

  for (const f of funnelAgg) {
    if (f.mainRevenue !== 0 || f.sales_count !== 0) {
      if (f.product_id) {
        const cur = productRevMap.get(f.product_id) ?? { qty: 0, revenue: 0 }
        cur.qty += f.sales_count
        cur.revenue += f.mainRevenue
        productRevMap.set(f.product_id, cur)
      } else {
        if (!unassigned) unassigned = { qty: 0, revenue: 0 }
        unassigned.qty += f.sales_count
        unassigned.revenue += f.mainRevenue
      }
    }
    if (f.miniRevenue !== 0) {
      if (!miniAgg) miniAgg = { qty: 0, revenue: 0 }
      const miniSalesM = f.metrics.find((m) => m.role === 'sales' && m.stage_group?.startsWith('mini_payment'))
      if (miniSalesM) miniAgg.qty += sumMetricInRange(miniSalesM, f.log, from, to)
      miniAgg.revenue += f.miniRevenue
    }
  }
  for (const [pid, retAmount] of returnsByProduct) {
    const cur = productRevMap.get(pid)
    if (cur) cur.revenue -= retAmount
  }

  const productRows: ProductRevenueRow[] = []
  for (const [pid, agg] of productRevMap) {
    const p = productById.get(pid)
    productRows.push({
      product_id: pid,
      name: p?.name ?? '— удалённый продукт —',
      qty: agg.qty,
      revenue: agg.revenue,
      pct_of_project: gross > 0 ? agg.revenue / gross : 0,
    })
  }
  if (miniAgg) {
    productRows.push({
      product_id: null,
      name: 'Мини-продукты в воронках',
      qty: miniAgg.qty,
      revenue: miniAgg.revenue,
      pct_of_project: gross > 0 ? miniAgg.revenue / gross : 0,
    })
  }
  if (unassigned) {
    productRows.push({
      product_id: null,
      name: 'Без привязки к продукту',
      qty: unassigned.qty,
      revenue: unassigned.revenue,
      pct_of_project: gross > 0 ? unassigned.revenue / gross : 0,
    })
  }
  productRows.sort((a, b) => b.revenue - a.revenue)

  return {
    revenue_by_product: productRows,
    gross_revenue: gross,
    expert_share: expertPart,
    center_income: centerIncome,
    center_expenses: centerExpenses,
    net_profit: netProfit,
    margin,
    ad_spend: adSpend,
    expert_profit: expertProfit,
    romi,
    drr,
  }
}

export function currentMonthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1))
  const to = new Date(Date.UTC(year, month, 0))
  return { from, to }
}
