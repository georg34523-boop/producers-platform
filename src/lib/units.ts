// Калькулятор юнитов проекта согласно ТЗ v2 §8.
// Чистые функции без зависимостей от БД — данные передаются параметрами.

import type {
  FunnelSale,
  Product,
  Project,
  ProjectExpense,
  ProjectReturn,
} from '@/lib/supabase/types'

export type FunnelSummary = {
  funnel_id: string
  is_mini_product: boolean
  revenue: number // от продаж + возвраты не вычитаются здесь
  traffic: number
}

export type UnitsInput = {
  project: Pick<Project, 'work_model' | 'fix_amount'>
  products: Product[]
  sales: FunnelSale[]
  funnels: FunnelSummary[]
  expenses: ProjectExpense[]
  returns: ProjectReturn[]
  /** Период расчёта (включительно). */
  from: Date
  to: Date
}

export type ProductRevenueRow = {
  product_id: string | null // null = «Мини-продукты в воронках»
  name: string
  qty: number
  revenue: number
  pct_of_project: number
}

export type UnitsResult = {
  revenue_by_product: ProductRevenueRow[]
  gross_revenue: number
  expert_share: number // что забирает эксперт (расход центра)
  center_income: number // = gross - expert_share
  center_expenses: number // сервисы + ФОТ + подрядчики (в периоде)
  net_profit: number // = center_income - center_expenses
  margin: number // net_profit / gross_revenue
  // Справочно для эксперта
  ad_spend: number
  expert_profit: number // gross - center_share - ad_spend
  romi: number // (gross - ad_spend) / ad_spend
  drr: number // ad_spend / gross
}

function inRange(d: Date | string, from: Date, to: Date): boolean {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00Z') : d
  return dt >= from && dt <= to
}

/**
 * Долю эксперта рассчитываем по модели 70/30 и фикс+%.
 * Для 50/50 — итеративно (доля считается от прибыли, прибыль — после доли).
 */
function computeCenterShare(
  workModel: Project['work_model'],
  fixAmount: number,
  effectiveRevenue: number,
  totalExpensesForProfit: number,
): number {
  if (workModel === 'fix_pct') {
    // Накопительный процент по порогам
    let pct = 0
    if (effectiveRevenue >= 15000) pct = 0.15
    else if (effectiveRevenue >= 10000) pct = 0.1
    else if (effectiveRevenue >= 5000) pct = 0.05
    return fixAmount + effectiveRevenue * pct
  }
  if (workModel === 'rev_70_30') {
    return effectiveRevenue * 0.3
  }
  // profit_50_50: центр забирает 50% от чистой прибыли (gross - все расходы)
  // expenses here include traffic + center expenses (traffic платит эксперт,
  // но в 50/50 он становится фактором — см. ТЗ §8.2)
  const profit = Math.max(0, effectiveRevenue - totalExpensesForProfit)
  return profit * 0.5
}

export function computeUnits(input: UnitsInput): UnitsResult {
  const { project, products, sales, funnels, expenses, returns, from, to } = input

  const productById = new Map(products.map((p) => [p.id, p]))
  const funnelById = new Map(funnels.map((f) => [f.funnel_id, f]))

  // 1. Валовая выручка по продажам (за период)
  const salesInRange = sales.filter((s) => inRange(s.day_date, from, to))
  const returnsInRange = returns.filter((r) => inRange(r.day_date, from, to))

  // 2. Выручка по продуктам (минус возвраты по продукту)
  const productRevMap = new Map<string, { qty: number; revenue: number }>()
  for (const s of salesInRange) {
    const cur = productRevMap.get(s.product_id) ?? { qty: 0, revenue: 0 }
    cur.qty += s.qty
    cur.revenue += Number(s.unit_price) * s.qty
    productRevMap.set(s.product_id, cur)
  }
  // Возвраты вычитаем из выручки продукта
  for (const r of returnsInRange) {
    if (!r.product_id) continue
    const cur = productRevMap.get(r.product_id)
    if (cur) cur.revenue -= Number(r.amount)
  }

  // 3. Применяем «нюанс мини-продуктов» (только для 70/30): продажи из убыточных
  //    мини-воронок не учитываются в effective_revenue для расчёта доли.
  const funnelRevenue = new Map<string, number>()
  for (const s of salesInRange) {
    funnelRevenue.set(s.funnel_id, (funnelRevenue.get(s.funnel_id) ?? 0) + Number(s.unit_price) * s.qty)
  }

  let effectiveRevenue = 0
  for (const [funnelId, rev] of funnelRevenue) {
    const f = funnelById.get(funnelId)
    if (!f) {
      effectiveRevenue += rev
      continue
    }
    if (project.work_model === 'rev_70_30' && f.is_mini_product) {
      // только если воронка вышла в плюс
      const profit = rev - f.traffic
      if (profit > 0) effectiveRevenue += rev
    } else {
      effectiveRevenue += rev
    }
  }
  // Вычитаем общие возвраты (без привязки к воронке мы их не сможем — но они уже
  // в product revenue. Для effective берём как есть; для gross — отдельно ниже.)
  const totalReturns = returnsInRange.reduce((s, r) => s + Number(r.amount), 0)
  effectiveRevenue = Math.max(0, effectiveRevenue - totalReturns)

  const gross =
    salesInRange.reduce((s, x) => s + Number(x.unit_price) * x.qty, 0) - totalReturns

  // 4. Трафик (платит эксперт, считается для справочного блока и для 50/50)
  const adSpend = funnels.reduce((s, f) => s + f.traffic, 0)

  // 5. Расходы центра в периоде (сервисы + ФОТ — monthly, подрядчики — one_off)
  const centerExpenses = sumExpensesInRange(expenses, from, to)

  // 6. Доля центра по модели
  const expertShareForCenter = computeCenterShare(
    project.work_model,
    Number(project.fix_amount ?? 0),
    effectiveRevenue,
    project.work_model === 'profit_50_50' ? adSpend + centerExpenses : 0,
  )
  // expertShareForCenter — это что ЗАБИРАЕТ ЦЕНТР. Эксперт получает остальное.
  // Для удобства называем переменную «expert_share» в результате — это расход центра.
  // Но семантически: expert_share = выручка - доход_центра = expert_part
  const centerIncome = expertShareForCenter
  const expertPart = gross - centerIncome

  const netProfit = centerIncome - centerExpenses
  const margin = gross > 0 ? netProfit / gross : 0

  // Справочно для эксперта
  const expertProfit = expertPart - adSpend
  const romi = adSpend > 0 ? (gross - adSpend) / adSpend : 0
  const drr = gross > 0 ? adSpend / gross : 0

  // Сборка таблицы выручки по продуктам + «Мини-продукты»
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

function sumExpensesInRange(expenses: ProjectExpense[], from: Date, to: Date): number {
  let sum = 0
  const daysInRange = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
  const monthsInRange = Math.max(1, Math.round(daysInRange / 30))
  for (const e of expenses) {
    if (e.recurrence === 'one_off') {
      const d = e.one_off_date ? new Date(e.one_off_date + 'T00:00:00Z') : null
      if (d && d >= from && d <= to) sum += Number(e.amount)
    } else {
      // monthly: считаем сколько месяцев действовал в периоде
      const start = e.start_date ? new Date(e.start_date + 'T00:00:00Z') : from
      const end = e.end_date ? new Date(e.end_date + 'T00:00:00Z') : to
      const eff_start = start > from ? start : from
      const eff_end = end < to ? end : to
      if (eff_end < eff_start) continue
      const days = Math.round((eff_end.getTime() - eff_start.getTime()) / 86_400_000) + 1
      const monthsActive = Math.max(0, days / 30)
      // Грубо: amount × месяцев в активном периоде
      sum += Number(e.amount) * (monthsActive > monthsInRange ? monthsInRange : monthsActive)
    }
  }
  return sum
}

/** Период текущего месяца (UTC) */
export function currentMonthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1))
  const to = new Date(Date.UTC(year, month, 0))
  return { from, to }
}
